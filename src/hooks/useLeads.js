import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { zonedDateStr, zonedDayRange } from '../lib/dates'
import { DEFAULT_TIMEZONE } from '../lib/timezones'
import { escalateStaleNoShows } from '../lib/closerOutcome'

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
// into a setter's working queue. (Distribution is now the day-end
// rotation, Prompt 515 Part 2 — was assign_setter_batches()'s continuous
// 15-min cron, since unscheduled in favor of a bounded-day refill.)
// Partitions the New-and-not-yet-booked population against
// usePipelineSetterLeads below — assigned_setter IS NULL here, IS NOT NULL
// there — so the two tabs never overlap.
// Prompt 535 — added an explicit status = 'new' filter. Follow-up and Not
// Interested both null out assigned_setter by design (see
// handle_lead_pipeline), so without this filter they were leaking into
// this "Unassigned" tab's results too (confirmed live: 1 follow_up + 4
// not_interested rows were showing up here alongside genuinely-unassigned
// leads before this fix) — this tab means "fresh pool inventory," not
// "anything with a null assigned_setter."
export function usePipelineUnassignedLeads() {
  return useQuery({
    queryKey: ['pipeline-unassigned-leads'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .is('assigned_setter', null)
        .eq('status', 'new')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
    refetchInterval: 15000,
  })
}

// Prompt 515 Part 3: 'not_interested' dropped from this list — that
// status's `assigned_setter` is null by design, so a chip driven by this
// assigned_setter-based count query could only ever show 0. It now has
// its own dedicated admin sub-tab (usePipelineNotInterestedLeads, Pipeline.jsx).
// Prompt 535: 'follow_up' dropped too, for the identical reason — the same
// handle_lead_pipeline branch that nulls assigned_setter for not_interested
// does it for follow_up as well (confirmed live: this chip always read 0).
// It now has its own sub-tab too (usePipelineFollowUpLeads).
const SETTER_LEAD_STATUSES = ['new', 'no_answer']

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
    //
    // Prompt 520 — same class of gap, found investigating Brayden's own
    // "New tab didn't decrement" report: this list was still missing
    // 'my-follow-ups'/'my-not-interested'/'pipeline-not-interested-leads',
    // added when Prompt 515 Part 3 introduced those three query keys. A
    // controlled repro (log a real Follow-up outcome, check immediately,
    // no reload) showed 'my-pool' itself invalidating and refetching
    // correctly — New's own count wasn't reproducibly stuck — but any
    // outcome landing a lead in Follow-Up-Due/Follow-up/Not-Interested
    // would only reflect there once the unrelated 15s poll caught up,
    // exactly Prompt 459's own pattern repeating on the 3 newer tabs.
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      queryClient.invalidateQueries({ queryKey: ['my-pool'] })
      queryClient.invalidateQueries({ queryKey: ['my-booked'] })
      queryClient.invalidateQueries({ queryKey: ['my-follow-ups'] })
      queryClient.invalidateQueries({ queryKey: ['my-not-interested'] })
      queryClient.invalidateQueries({ queryKey: ['leads-stats'] })
      queryClient.invalidateQueries({ queryKey: ['pipeline-unassigned-leads'] })
      queryClient.invalidateQueries({ queryKey: ['pipeline-setter-leads'] })
      queryClient.invalidateQueries({ queryKey: ['pipeline-setter-status-counts'] })
      queryClient.invalidateQueries({ queryKey: ['pipeline-not-interested-leads'] })
    },
  })
}

// Prompt 515 Part 3 — a setter's own Follow-up leads, split into `due`
// (today or overdue) vs `future` (not yet due). Deliberately reads from
// `leads`, NOT `follow_up_queue` — `follow_up_queue`'s only SELECT policy
// is admin-only (`follow_up_queue_select_admin`), so a setter querying it
// directly gets silently RLS-filtered to zero rows. This is the exact same
// landmine Prompt 440/441 already hit and worked around the same way: the
// frozen `last_action_by`/`follow_up_at` stamps on `leads` itself are the
// reliable source, and `leads_select_all` is already open to any
// authenticated user. A follow-up lead's `assigned_setter` stays null
// (Part 2's design — see [[Prompt 515 — Lead Rotation Redesign (Blocked,
// SQL Ready)]]) whether due or not; "due" is purely `follow_up_at`'s date,
// in the setter's own timezone, compared against today, computed live here
// rather than stored.
export function useMyFollowUps(setterId, timezone) {
  return useQuery({
    queryKey: ['my-follow-ups', setterId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .eq('status', 'follow_up')
        .eq('last_action_by', setterId)
        .order('follow_up_at', { ascending: true })
      if (error) throw error
      const today = zonedDateStr(Date.now(), timezone)
      const due = []
      const future = []
      for (const lead of data) {
        const leadDay = zonedDateStr(new Date(lead.follow_up_at).getTime(), timezone)
        ;(leadDay <= today ? due : future).push(lead)
      }
      return { due, future }
    },
    enabled: !!setterId,
    refetchInterval: 15000,
  })
}

// Prompt 515 Part 3 — a setter's own Not Interested leads. `assigned_setter`
// is null for this terminal state (unchanged from before Part 2), so this
// reads from `last_action_by` instead — same reasoning as useMyFollowUps
// above, though this one was never actually RLS-blocked (leads_select_all
// covers it); it's `assigned_setter` being null, not RLS, that rules out
// the useMyPool shape here.
export function useMyNotInterested(setterId) {
  return useQuery({
    queryKey: ['my-not-interested', setterId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .eq('status', 'not_interested')
        .eq('last_action_by', setterId)
        .order('last_action_at', { ascending: false })
      if (error) throw error
      return data
    },
    enabled: !!setterId,
    refetchInterval: 15000,
  })
}

// Admin Pipeline's Not Interested tab — every setter's terminal leads at
// once, same shape as usePipelineCloserLeads (no assigned_setter filter,
// since it's null for this status by design).
export function usePipelineNotInterestedLeads() {
  return useQuery({
    queryKey: ['pipeline-not-interested-leads'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .eq('status', 'not_interested')
        .order('last_action_at', { ascending: false })
      if (error) throw error
      return data
    },
    refetchInterval: 15000,
  })
}

// Prompt 535 — admin Pipeline's Follow-up sub-tab (now living under
// Setter, not its own top-level tab). Same shape as
// usePipelineNotInterestedLeads, not usePipelineSetterLeads('follow_up') —
// follow_up also nulls assigned_setter (same handle_lead_pipeline trigger
// branch that nulls it for not_interested), so the assigned_setter-scoped
// query would structurally always return zero rows here, exactly the bug
// that got not_interested its own dedicated query back in Prompt 515 Part
// 3. This was a real, confirmed gap (verified live: the existing 'follow_up'
// chip under the old Setter tab always showed 0), not just a relocation.
export function usePipelineFollowUpLeads() {
  return useQuery({
    queryKey: ['pipeline-follow-up-leads'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .eq('status', 'follow_up')
        .order('follow_up_at', { ascending: true })
      if (error) throw error
      return data
    },
    refetchInterval: 15000,
  })
}

// Prompt 515 Part 3 — the setter-initiated half of day-end rotation
// ("Finish Day" button, shown once the New tab hits zero). Calls the same
// `run_setter_day_end` RPC path as the passive `process-setter-day-ends`
// cron ultimately does (both bottom out in `_do_setter_day_end`, which is
// idempotent per local calendar day) — see the linked design doc for why
// that's "the same rotation logic," not two paths that happen to agree.
export function useFinishDay() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('run_setter_day_end')
      if (error) throw error
      return data?.[0] ?? { no_answer_rolled: 0, refilled: 0 }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-pool'] })
      queryClient.invalidateQueries({ queryKey: ['my-follow-ups'] })
      queryClient.invalidateQueries({ queryKey: ['my-not-interested'] })
      queryClient.invalidateQueries({ queryKey: ['leads-stats'] })
      queryClient.invalidateQueries({ queryKey: ['pipeline-unassigned-leads'] })
      queryClient.invalidateQueries({ queryKey: ['pipeline-setter-leads'] })
      queryClient.invalidateQueries({ queryKey: ['pipeline-setter-status-counts'] })
      queryClient.invalidateQueries({ queryKey: ['pipeline-health'] })
    },
  })
}

// A setter's active working pool — leads currently assigned to them (New
// and, since Prompt 515 Part 2, No Answer too — those now stay assigned
// until day-end instead of vanishing the instant they're logged). Capped
// at 150 New+Follow-Up-Due, refilled by the day-end rotation
// (`process-setter-day-ends` cron / the Finish Day button) rather than the
// old continuous `assign_setter_batches` 15-min cron, which Part 2
// unscheduled in favor of this bounded-day model.
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
// Prompt 540 — also runs the No Show → Lost auto-escalation (see
// escalateStaleNoShows) right here, on the closer's own query, rather than
// from the admin Pipeline Closer tab's read-only rollup (usePipelineCloserLeads,
// unchanged) — that page is deliberately read-only from admin's side
// already (outcomes are the closer's to log), and this closer's own session
// is the one we know for certain has write permission on their own
// assigned leads (same auth.uid()-scoped access useLogCloserOutcome already
// relies on). The real trade-off: escalation only fires when this closer's
// own Overview/My Pipeline actually loads — documented, not hidden, per the
// spec's own explicit "use your judgment, document the choice."
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
      return escalateStaleNoShows(data)
    },
    enabled: !!closerId,
    refetchInterval: 15000,
  })
}

// Prompt 540 — Reschedule sets a new strategy_call_at on a Pending/No Show
// lead; since that timestamp is now in the future again, the lead reads
// back as Pending under displayOutcome()'s own rule with zero extra status
// logic needed. closer_outcome is deliberately left untouched — Reschedule
// is only ever offered on leads whose displayOutcome is already 'pending'
// (no_show included, since no_show IS 'pending' underneath), so there's
// never a stored outcome to change here.
export function useRescheduleLead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, strategy_call_at }) => {
      const { error } = await supabase.from('leads').update({ strategy_call_at }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-booked'] })
      queryClient.invalidateQueries({ queryKey: ['pipeline-closer-leads'] })
    },
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
