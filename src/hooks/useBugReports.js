import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

// Prompt 528 — a real destination for the sidebar's new "Report a Bug"
// modal, not a form that goes nowhere. RLS: a reporter can insert/read
// their own rows, admin can read/update all (see the `bug_reports_*`
// policies applied alongside this table).
export function useCreateBugReport() {
  return useMutation({
    mutationFn: async ({ reporterId, description }) => {
      const { error } = await supabase
        .from('bug_reports')
        .insert({ reporter_id: reporterId, description })
      if (error) throw error
    },
  })
}

export function useBugReports() {
  return useQuery({
    queryKey: ['bug-reports'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bug_reports')
        .select('id, description, status, created_at, profiles(full_name, role)')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export function useResolveBugReport() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status }) => {
      const { error } = await supabase
        .from('bug_reports')
        .update({ status, resolved_at: status === 'resolved' ? new Date().toISOString() : null })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bug-reports'] }),
  })
}
