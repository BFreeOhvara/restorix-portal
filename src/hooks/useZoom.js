import { useMutation, useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

// Prompt 530 — closer_zoom_tokens' RLS lets a closer read their own row
// (and admin read any), but the column grants only expose
// closer_id/expires_at/zoom_user_id/zoom_email/connected_at — the raw
// access_token/refresh_token are never readable via this client at all
// (Fork 3: admin sees connection status only, never tokens).
export function useZoomConnection(closerId) {
  return useQuery({
    queryKey: ['zoom-connection', closerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('closer_zoom_tokens')
        .select('closer_id, zoom_email, connected_at')
        .eq('closer_id', closerId)
        .maybeSingle()
      if (error) throw error
      return data
    },
    enabled: !!closerId,
  })
}

// Returns Zoom's OAuth authorize URL — fetch/invoke can't follow a
// redirect into a real navigation, so the caller opens it itself (a
// popup as of Prompt 617, falling back to `window.location.href = url`
// if the popup is blocked).
export function useConnectZoom() {
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('zoom-oauth-start', { body: {} })
      if (error) throw error
      return data.url
    },
  })
}

// Prompt 617 — lets a closer remove their own Zoom connection so they can
// reconnect a different account or recover from a bad token state. The
// closer_zoom_tokens_delete RLS policy (closer_id = auth.uid()) is enough
// on its own; no service-role edge function needed for a plain
// delete-your-own-row operation.
export function useDisconnectZoom() {
  return useMutation({
    mutationFn: async (closerId) => {
      const { error } = await supabase.from('closer_zoom_tokens').delete().eq('closer_id', closerId)
      if (error) throw error
    },
  })
}

// Prompt 615 — the Meeting Room tab's "Start Your Meeting Room" button
// needs the closer's real Zoom Personal Meeting Room join URL, not a
// guessed URL format. Only enabled once useZoomConnection confirms a
// connection exists, same gating precedent as every other Zoom-dependent
// query in this app.
export function useZoomPersonalRoom(closerId, enabled) {
  return useQuery({
    queryKey: ['zoom-personal-room', closerId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('get-zoom-personal-room', { body: {} })
      if (error) throw error
      return data.join_url
    },
    enabled: !!closerId && enabled,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
}
