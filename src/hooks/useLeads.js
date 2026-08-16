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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['leads'] }),
  })
}
