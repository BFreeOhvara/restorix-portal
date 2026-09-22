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

// Prompt 533 — closer invite-send flow. US-only normalization (10 digits ->
// +1XXXXXXXXXX, 11 starting with 1 -> +1XXXXXXXXXX) matches the phone
// format Twilio's own `To` param expects everywhere else in this codebase
// (send-appointment-reminders passes leads.phone straight through, and
// every lead phone in this project is a US number).
export function normalizePhoneE164(raw) {
  const digits = (raw || '').replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return null
}

// Prompt 628 — renamed from useSendSetterInviteSms and made role-agnostic:
// closers can now invite closers as well as setters, so the invite row's
// `role` comes from the caller instead of being hardcoded. Only 'setter'
// and 'closer' are accepted here; the real enforcement is the
// invites_insert_closer RLS policy (widened to the same two roles) and
// send-invite-sms's own re-verification of the stored row, not this
// client-side guard.
const REP_INVITE_ROLES = ['setter', 'closer']

export function useSendRepInviteSms() {
  return useMutation({
    mutationFn: async ({ phone, role }) => {
      if (!REP_INVITE_ROLES.includes(role)) throw new Error('Invalid invite role')

      const normalized = normalizePhoneE164(phone)
      if (!normalized) throw new Error('Enter a valid 10-digit US phone number')

      const { data: userData } = await supabase.auth.getUser()
      const token = generateToken()
      const { error: insertError } = await supabase
        .from('invites')
        .insert({ token, role, created_by: userData.user.id })
      if (insertError) throw insertError

      const { data, error } = await supabase.functions.invoke('send-invite-sms', {
        body: { token, phone: normalized },
      })
      if (error || data?.error) throw new Error(data?.error || error.message)
      return { token, phone: normalized }
    },
  })
}
