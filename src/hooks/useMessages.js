import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

// Who a given role can start a new conversation with (Prompt 445, per
// Brayden directly since Ohvara's fixed "message Brayden or Nate" pattern
// doesn't map onto Restorix's multiple setters/closers). Mirrors the
// server-side can_message() function — kept in sync manually since it's
// only used to build the contact picker, not to enforce anything (RLS is
// the actual enforcement).
const CONTACT_ROLES = {
  setter: ['admin', 'closer'],
  closer: ['admin', 'setter'],
  admin: ['setter', 'closer'],
}

export function useContacts(myRole) {
  return useQuery({
    queryKey: ['message-contacts', myRole],
    queryFn: async () => {
      const roles = CONTACT_ROLES[myRole] || []
      if (!roles.length) return []
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .in('role', roles)
        .order('full_name')
      if (error) throw error
      return data
    },
    enabled: !!myRole,
  })
}

// Every message involving me, sender or recipient. Conversations are a
// client-side grouping by "the other party" — no conversations/threads
// table, same approach the pre-pivot Ohvara implementation used.
export function useMyMessages(myId) {
  return useQuery({
    queryKey: ['messages', myId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .or(`sender_id.eq.${myId},recipient_id.eq.${myId}`)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data
    },
    enabled: !!myId,
    refetchInterval: 15000, // polling, not realtime — matches every other list in this app
  })
}

export function useSendMessage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ senderId, recipientId, body }) => {
      const { error } = await supabase.from('messages').insert({
        sender_id: senderId,
        recipient_id: recipientId,
        body,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['messages'] }),
  })
}

export function useMarkRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (messageIds) => {
      if (!messageIds.length) return
      const { error } = await supabase.from('messages').update({ read: true }).in('id', messageIds)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['messages'] }),
  })
}
