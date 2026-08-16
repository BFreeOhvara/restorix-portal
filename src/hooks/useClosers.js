import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export function useClosers() {
  return useQuery({
    queryKey: ['closers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('role', 'closer')
        .eq('is_active', true)
        .order('full_name')
      if (error) throw error
      return data
    },
  })
}
