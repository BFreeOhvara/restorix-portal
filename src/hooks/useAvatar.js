import { useMutation } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

// Prompt 491 — ported from ohvara-dashboard's Prompt 407/422, adapted to
// this project's own security model: `profiles` has no general self-update
// RLS policy (see Profile.jsx's own comment on update_own_full_name), so
// these go through whitelisted RPCs instead of a direct table `.update()`.
// `avatars` bucket (migration profile_avatar) is public + folder-scoped
// write RLS, same pattern as ohvara-dashboard's migration 096.

// Upsert to a fixed path per user so re-uploading replaces the old file
// instead of accumulating orphans; the public URL is cache-busted with a
// timestamp query param so the new photo shows immediately instead of the
// browser serving the old cached image at the same URL.
export function useUploadAvatar() {
  return useMutation({
    mutationFn: async ({ profileId, file }) => {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
      const path = `${profileId}/avatar.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true })
      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
      const avatar_url = `${publicUrl}?t=${Date.now()}`

      const { error: rpcError } = await supabase.rpc('update_own_avatar_url', { p_avatar_url: avatar_url })
      if (rpcError) throw rpcError
      return avatar_url
    },
  })
}

// Deletes the stored file(s) too, not just the column — otherwise every
// removal leaves an orphaned object in the bucket. Lists the user's own
// folder rather than assuming a fixed extension, since a re-upload can
// swap file type between sessions.
export function useRemoveAvatar() {
  return useMutation({
    mutationFn: async ({ profileId }) => {
      const { data: files, error: listError } = await supabase.storage
        .from('avatars')
        .list(profileId)
      if (listError) throw listError

      if (files?.length) {
        const paths = files.map((f) => `${profileId}/${f.name}`)
        const { error: removeError } = await supabase.storage.from('avatars').remove(paths)
        if (removeError) throw removeError
      }

      const { error: rpcError } = await supabase.rpc('update_own_avatar_url', { p_avatar_url: null })
      if (rpcError) throw rpcError
    },
  })
}

// New for Restorix — the pastel picker's own mutation, independent of the
// photo. Removing a photo only nulls avatar_url (see above); it never
// touches avatar_color, so a previously-chosen color survives a photo
// removal instead of reverting to a default.
export function useUpdateAvatarColor() {
  return useMutation({
    mutationFn: async ({ avatarColor }) => {
      const { error } = await supabase.rpc('update_own_avatar_color', { p_avatar_color: avatarColor })
      if (error) throw error
    },
  })
}
