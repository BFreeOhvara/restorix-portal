import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { zonedDateStr, zonedDayRange } from '../lib/dates'
import { DEFAULT_TIMEZONE } from '../lib/timezones'

export function useLeads(statusFilter) {
  return useQuery({
    queryKey: ['leads', statusFilter ?? 'all'],
    queryFn: async () => {
      let query = supabase.from('leads').select('*').order('created_at', { ascending: false })
      if (statusFilter) query = query.eq('status', statusFilter)
      const { data, error } = await query
      if (error) throw error
      return data
    },
    refetchInterval: 15000,
  })
}

// Prompt 465: leads still sitting in the raw backlog, not yet distributed
// into a setter's working queue by assign_setter_batches()'s 15-min cron.
// Partitions the New-and-not-yet-booked population against
// usePipelineSetterLeads below — assigned_setter IS NULL here, IS NOT NULL
// there — so the two tabs never overlap.
export function usePipelineUnassignedLeads() {
  return useQuery({
    queryKey: ['pipeline-unassigned-leads'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .is('assigned_setter', null)
        .neq('status', 'appointment_booked')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
    refetchInterval: 15000,
  })
}

const SETTER_LEAD_STATUSES = ['new', 'no_answer', 'follow_up', 'not_interested']

// Prompt 464: admin Pipeline's Setter tab — a real server-side filter
// excluding Appointment Booked (verified via direct query, not a client-side
// .filter() on the full set), matching Brayden's explicit call that a
// booked lead is no longer a setter concern once it's handed to a closer.
// Prompt 465: narrowed to assigned_setter IS NOT NULL (see
// usePipelineUnassignedLeads above) and takes an optional statusFilter so
// the new filter-chip row issues a real WHERE clause per click rather than
// hiding rows client-side.
export function usePipelineSetterLeads(statusFilter = 'all') {
  return useQuery({
    queryKey: ['pipeline-setter-leads', statusFilter],
    queryFn: async () => {
      let query = supabase
        .from('leads')
        .select('*')
        .not('assigned_setter', 'is', null)
        .neq('status', 'appointment_booked')
        .order('created_at', { ascending: false })
      if (statusFilter !== 'all') query = query.eq('status', statusFilter)
      const { data, error } = await query
      if (error) throw error
      return data
    },
    refetchInterval: 15000,
  })
}

// Live per-status counts for the Setter tab's filter chips — queried
// independently of the currently selected filter (real counts, not derived
// from whatever subset the filtered query above happens to have fetched).
export function usePipelineSetterStatusCounts() {
  return useQuery({
    queryKey: ['pipeline-setter-status-counts'],
    queryFn: async () => {
      const countQuery = (status) => {
        let q = supabase
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .not('assigned_setter', 'is', null)
          .neq('status', 'appointment_booked')
        if (status) q = q.eq('status', status)
        return q
      }
      const [all, ...byStatus] = await Promise.all([
        countQuery(),
        ...SETTER_LEAD_STATUSES.map((status) => countQuery(status)),
      ])
      if (all.error) throw all.error
      const counts = { all: all.count ?? 0 }
      SETTER_LEAD_STATUSES.forEach((status, i) => {
        if (byStatus[i].error) throw byStatus[i].error
        counts[status] = byStatus[i].count ?? 0
      })
      return counts
    },
    refetchInterval: 15000,
  })
}

// Admin Pipeline's Closer tab — read-only rollup across every closer's
// booked leads, regardless of which closer they're assigned to.
export function usePipelineCloserLeads() {
  return useQuery({
    queryKey: ['pipeline-closer-leads'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .eq('status', 'appointment_booked')
        .order('strategy_call_at', { ascending: true })
      if (error) throw error
      return data
    },
    refetchInterval: 15000,
  })
}

// A closer logging a deal outcome on their own booked lead — closer_notes
// is a separate column from the setter's own pre-booking `notes` (Prompt
// 464), so this never touches that field.
// Prompt 468: deal_setup_fee/deal_first_month_fee are optional params —
// only Closed carries them (LogOutcomeModal only passes them for that
// outcome), and the DB's own CHECK constraint (leads_closed_requires_deal_value)
// is the actual backstop if a caller ever tries to save Closed without them.
export function useLogCloserOutcome() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, closer_outcome, closer_notes, deal_setup_fee, deal_first_month_fee }) => {
      const patch = { closer_outcome, closer_notes }
      if (closer_outcome === 'closed') {
        patch.deal_setup_fee = deal_setup_fee
        patch.deal_first_month_fee = deal_first_month_fee
      }
      const { error } = await supabase.from('leads').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-booked'] })
      queryClient.invalidateQueries({ queryKey: ['pipeline-closer-leads'] })
      queryClient.invalidateQueries({ queryKey: ['commission-leads'] })
    },
  })
}

// Prompt 468: every closed deal, for both My Commissions (setter, filtered
// client-side to their own `last_action_by`) and the admin rollup (every
// setter at once) — same one-fetch-many-views shape Stats.jsx already
// uses for useAllLeadsForStats rather than a separate query per view.
export function useCommissionLeads() {
  return useQuery({
    queryKey: ['commission-leads'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select('id, facility_name, last_action_by, deal_setup_fee, deal_first_month_fee, updated_at')
        .eq('closer_outcome', 'closed')
        .order('updated_at', { ascending: false })
      if (error) throw error
      return data
    },
    refetchInterval: 15000,
  })
}

export function useAddLead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (lead) => {
      const { data: userData } = await supabase.auth.getUser()
      const { error } = await supabase.from('leads').insert({
        ...lead,
        created_by: userData.user.id,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      queryClient.invalidateQueries({ queryKey: ['pipeline-unassigned-leads'] })
      queryClient.invalidateQueries({ queryKey: ['pipeline-setter-leads'] })
      queryClient.invalidateQueries({ queryKey: ['pipeline-setter-status-counts'] })
    },
  })
}

export function useAddLeads() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (leads) => {
      const { data: userData } = await supabase.auth.getUser()
      const rows = leads.map((l) => ({ ...l, created_by: userData.user.id }))
      const { error } = await supabase.from('leads').insert(rows)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      queryClient.invalidateQueries({ queryKey: ['pipeline-unassigned-leads'] })
      queryClient.invalidateQueries({ queryKey: ['pipeline-setter-leads'] })
      queryClient.invalidateQueries({ queryKey: ['pipeline-setter-status-counts'] })
    },
  })
}

export function useLogCall() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...patch }) => {
      const { error } = await supabase.from('leads').update(patch).eq('id', id)
      if (error) throw error
    },
    // Prompt 459: was missing 'leads-stats' (useAllLeadsForStats, in
    // useStats.js) — the query key behind Overview's Calls Made
    // Today/Booked Today/Booking Rate tiles, My Goals' progress tiles,
    // and Stats' KPI tiles. Without it, a real logged call updated the
    // pool table instantly (invalidated via 'my-pool') but those stats
    // tiles stayed stale until an unrelated refetch happened — a real
    // user-facing bug, not the seeding-artifact half of this prompt's
    // audit. Traced by logging one real call through the actual modal
    // and watching the pool count update while the stats tile didn't,
    // confirmed the underlying write was correct via a hard reload.
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      queryClient.invalidateQueries({ queryKey: ['my-pool'] })
      queryClient.invalidateQueries({ queryKey: ['my-booked'] })
      queryClient.invalidateQueries({ queryKey: ['leads-stats'] })
      queryClient.invalidateQueries({ queryKey: ['pipeline-unassigned-leads'] })
      queryClient.invalidateQueries({ queryKey: ['pipeline-setter-leads'] })
      queryClient.invalidateQueries({ queryKey: ['pipeline-setter-status-counts'] })
    },
  })
}

// A setter's active working pool — leads currently assigned to them
// (capped at 150, maintained by the assign_setter_batches cron job).
export function useMyPool(setterId) {
  return useQuery({
    queryKey: ['my-pool', setterId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .eq('assigned_setter', setterId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data
    },
    enabled: !!setterId,
    refetchInterval: 15000,
  })
}

// Prompt 509 — a closer's on-demand version of what `assign_setter_batches`
// does automatically for setters every 15 minutes. Not a client-side
// clamp-and-hope: `request_closer_leads` (SECURITY DEFINER) re-checks the
// caller's own current New-status count and the 150 cap server-side, and
// returns however many it actually assigned — which may be less than
// `count` if the closer was already close to the cap. The UI surfaces
// that real number rather than assuming the full request went through.
export function useRequestCloserLeads() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (count) => {
      const { data, error } = await supabase.rpc('request_closer_leads', { p_count: count })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-pool'] })
      queryClient.invalidateQueries({ queryKey: ['leads-stats'] })
      queryClient.invalidateQueries({ queryKey: ['pipeline-unassigned-leads'] })
    },
  })
}

// A closer's Appointment Booked leads, handed to them by the round-robin
// assignment in the leads_pipeline_trigger.
export function useMyBooked(closerId) {
  return useQuery({
    queryKey: ['my-booked', closerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .eq('assigned_closer', closerId)
        .eq('status', 'appointment_booked')
        .order('strategy_call_at', { ascending: true })
      if (error) throw error
      return data
    },
    enabled: !!closerId,
    refetchInterval: 15000,
  })
}

// Admin-only pipeline health: pool size, no-answer cooldown, follow-ups due.
// Prompt 458: "follow-ups due" used to compare against
// `new Date().setHours(23,59,59,999)` — the admin's own browser clock, not
// any saved timezone at all. Each follow-up now compares against its own
// setter's saved timezone (per-row owner, not the viewing admin's) — a
// follow-up due at 11pm Pacific shouldn't count as "due today" for an
// admin in New York just because it's already tomorrow there.
export function usePipelineHealth() {
  return useQuery({
    queryKey: ['pipeline-health'],
    queryFn: async () => {
      const [unassigned, cooldown, followUpRows] = await Promise.all([
        supabase.from('leads').select('id', { count: 'exact', head: true }).eq('status', 'new').is('assigned_setter', null),
        supabase.from('no_answer_queue').select('id', { count: 'exact', head: true }).is('redistributed_at', null),
        supabase
          .from('follow_up_queue')
          .select('follow_up_at, setter:setter_id(timezone)')
          .is('completed_at', null),
      ])
      if (unassigned.error) throw unassigned.error
      if (cooldown.error) throw cooldown.error
      if (followUpRows.error) throw followUpRows.error

      const followUpsDueToday = (followUpRows.data || []).filter((r) => {
        const tz = r.setter?.timezone || DEFAULT_TIMEZONE
        const { end } = zonedDayRange(zonedDateStr(Date.now(), tz), tz)
        return new Date(r.follow_up_at).getTime() < new Date(end).getTime()
      }).length

      return {
        unassignedPool: unassigned.count ?? 0,
        noAnswerCooldown: cooldown.count ?? 0,
        followUpsDueToday,
      }
    },
    refetchInterval: 30000,
  })
}
