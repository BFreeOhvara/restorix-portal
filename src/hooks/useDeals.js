import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { normalizePhoneE164 } from './useInvites'

// Token generation mirrors useInvites.js exactly (12 random bytes over a
// 64-char URL-safe alphabet, generated client-side since RLS gates the
// insert, not an edge function).
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
function generateToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('')
}

// Prompt 546 — the client's own view of their deal. `client_profile_id =
// auth.uid()` is enforced by the `deals_select_own` RLS policy; this hook
// just reads whatever comes back (one deal per client account for MVP).
export function useMyDeal({ enabled = true } = {}) {
  return useQuery({
    queryKey: ['my-deal'],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deals')
        .select('*, lead:leads(facility_name, contact_name, phone)')
        .order('confirmed_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })
}

// Prompt 546 — does this booked lead already have a confirmed deal? Gates
// the Client Portal tab in CloserLeadModal so a closer can't double-confirm.
export function useDealForLead(leadId) {
  return useQuery({
    queryKey: ['deal-for-lead', leadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deals')
        .select('*')
        .eq('lead_id', leadId)
        .order('confirmed_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data
    },
    enabled: !!leadId,
  })
}

// Prompt 546 — closer confirms the final Stack on a Closed deal. One
// action, mirroring useSendSetterInviteSms's insert-then-invoke shape:
// write the `deals` row, mint a client invite carrying `deal_id`, SMS it.
// `claim-invite` reads `deal_id` off the invite and links the new client
// account back (`deals.client_profile_id` + status → 'active').
export function useConfirmDeal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ leadId, frontRunner, subAgents, clientPhone }) => {
      const normalized = normalizePhoneE164(clientPhone)
      if (!normalized) throw new Error('Enter a valid 10-digit US phone number for the client')
      if (!frontRunner) throw new Error('Pick a front-runner agent')

      const { data: userData } = await supabase.auth.getUser()

      const { data: deal, error: dealError } = await supabase
        .from('deals')
        .insert({
          lead_id: leadId,
          confirmed_by: userData.user.id,
          front_runner: frontRunner,
          sub_agents: subAgents,
        })
        .select()
        .single()
      if (dealError) throw dealError

      const token = generateToken()
      const { error: inviteError } = await supabase
        .from('invites')
        .insert({ token, role: 'client', created_by: userData.user.id, deal_id: deal.id })
      if (inviteError) throw inviteError

      const { data, error } = await supabase.functions.invoke('send-invite-sms', {
        body: { token, phone: normalized },
      })
      if (error || data?.error) throw new Error(data?.error || error.message)

      return { deal, token, phone: normalized }
    },
    onSuccess: (_res, vars) => {
      queryClient.invalidateQueries({ queryKey: ['deal-for-lead', vars.leadId] })
      queryClient.invalidateQueries({ queryKey: ['my-booked'] })
      queryClient.invalidateQueries({ queryKey: ['pipeline-closer-leads'] })
    },
  })
}
