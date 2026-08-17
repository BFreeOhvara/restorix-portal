import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['leads'] }),
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['leads'] }),
  })
}

export function useLogCall() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...patch }) => {
      const { error } = await supabase.from('leads').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      queryClient.invalidateQueries({ queryKey: ['my-pool'] })
      queryClient.invalidateQueries({ queryKey: ['my-booked'] })
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
export function usePipelineHealth() {
  return useQuery({
    queryKey: ['pipeline-health'],
    queryFn: async () => {
      const [unassigned, cooldown, followUpsDue] = await Promise.all([
        supabase.from('leads').select('id', { count: 'exact', head: true }).eq('status', 'new').is('assigned_setter', null),
        supabase.from('no_answer_queue').select('id', { count: 'exact', head: true }).is('redistributed_at', null),
        supabase
          .from('follow_up_queue')
          .select('id', { count: 'exact', head: true })
          .is('completed_at', null)
          .lte('follow_up_at', new Date(new Date().setHours(23, 59, 59, 999)).toISOString()),
      ])
      if (unassigned.error) throw unassigned.error
      if (cooldown.error) throw cooldown.error
      if (followUpsDue.error) throw followUpsDue.error
      return {
        unassignedPool: unassigned.count ?? 0,
        noAnswerCooldown: cooldown.count ?? 0,
        followUpsDueToday: followUpsDue.count ?? 0,
      }
    },
    refetchInterval: 30000,
  })
}
