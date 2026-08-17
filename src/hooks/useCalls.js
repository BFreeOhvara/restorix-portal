import { useMutation, useQuery } from '@tanstack/react-query'
import { supabase, SUPABASE_URL } from '../lib/supabase'
import { dayRange } from '../lib/dates'

// Created at the same "call attempted" moment Prompt 446 gates outcomes
// on — one row per real dial, updated in place as more becomes known
// (CallSid once the Twilio call accepts, outcome+duration once saved).
export function useCreateCall() {
  return useMutation({
    mutationFn: async ({ leadId, setterId }) => {
      const { data, error } = await supabase
        .from('calls')
        .insert({ lead_id: leadId, setter_id: setterId })
        .select()
        .single()
      if (error) throw error
      return data
    },
  })
}

export function useUpdateCall() {
  return useMutation({
    mutationFn: async ({ id, patch }) => {
      const { error } = await supabase.from('calls').update(patch).eq('id', id)
      if (error) throw error
    },
  })
}

// RLS already scopes this to "my own calls, or everyone's if I'm admin" —
// the query itself doesn't need a role branch.
// Prompt 451: day-scoped instead of a flat "last 100" recency cap, same
// day-by-day pattern as Activity — replaced rather than kept alongside,
// per the prompt's own "replaces the current flat list" instruction.
export function useMyCallsForDay(date) {
  return useQuery({
    queryKey: ['calls', date],
    queryFn: async () => {
      const { start, end } = dayRange(date)
      const { data, error } = await supabase
        .from('calls')
        .select('id, outcome, duration_seconds, recording_url, created_at, leads(facility_name), profiles(full_name)')
        .gte('created_at', start)
        .lt('created_at', end)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
    refetchInterval: 15000,
  })
}

// Recordings need Twilio credentials to fetch, which the client can never
// hold — the get-recording edge function proxies the fetch server-side
// after re-checking access. Returns a blob: URL for an <audio> element;
// caller is responsible for revoking it when done.
export async function fetchRecordingUrl(callId) {
  const { data: { session } } = await supabase.auth.getSession()
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/get-recording?callId=${callId}`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
  })
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}))
    throw new Error(body.error || `Failed to load recording (${resp.status})`)
  }
  const blob = await resp.blob()
  return URL.createObjectURL(blob)
}
