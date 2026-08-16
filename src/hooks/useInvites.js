import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

// Token generation mirrors ohvara-dashboard's rep_invites pattern: 12 random
// bytes mapped through a 64-char URL-safe alphabet (~72 bits entropy),
// generated client-side since RLS (not an edge function) gates the insert.
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

function generateToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('')
}

export function usePendingInvites() {
  return useQuery({
    queryKey: ['invites'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invites')
        .select('*')
        .is('used_at', null)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export function useCreateInvite() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (role) => {
      const { data: userData } = await supabase.auth.getUser()
      const token = generateToken()
      const { error } = await supabase.from('invites').insert({ token, role, created_by: userData.user.id })
      if (error) throw error
      return token
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['invites'] }),
  })
}

export function useRevokeInvite() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('invites').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['invites'] }),
  })
}
