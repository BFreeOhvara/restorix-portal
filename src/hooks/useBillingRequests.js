import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

// Prompt 611 — same shape as useBugReports.js: a lightweight "notify the
// team" request, no payment data ever touches this table. RLS: a client
// can insert/read their own rows, admin can read/update all.
export function useSubmitBillingRequest() {
  return useMutation({
    mutationFn: async ({ clientProfileId, note }) => {
      const { error } = await supabase
        .from('billing_requests')
        .insert({ client_profile_id: clientProfileId, note: note || null })
      if (error) throw error
    },
  })
}

// Admin list, with each request's facility name resolved the same way
// ClientOverview resolves its own — through `deals` (no direct FK from
// billing_requests to deals/leads, so this is a second query + JS merge
// rather than a single embedded select).
export function useBillingRequests() {
  return useQuery({
    queryKey: ['billing-requests'],
    queryFn: async () => {
      const { data: requests, error } = await supabase
        .from('billing_requests')
        .select('id, note, status, created_at, client_profile_id, profiles(full_name)')
        .order('created_at', { ascending: false })
      if (error) throw error
      if (!requests.length) return requests

      const clientIds = [...new Set(requests.map((r) => r.client_profile_id))]
      const { data: deals, error: dealsError } = await supabase
        .from('deals')
        .select('client_profile_id, lead:leads(facility_name)')
        .in('client_profile_id', clientIds)
      if (dealsError) throw dealsError

      const facilityByClient = new Map(deals.map((d) => [d.client_profile_id, d.lead?.facility_name]))
      return requests.map((r) => ({ ...r, facility_name: facilityByClient.get(r.client_profile_id) }))
    },
  })
}

export function useResolveBillingRequest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status }) => {
      const { error } = await supabase
        .from('billing_requests')
        .update({ status, resolved_at: status === 'resolved' ? new Date().toISOString() : null })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['billing-requests'] }),
  })
}
