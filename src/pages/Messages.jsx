import { useMemo, useState } from 'react'
import { Send, Plus, X } from 'lucide-react'
import clsx from 'clsx'
import { useAuth } from '../hooks/useAuth'
import { useContacts, useMyMessages, useSendMessage, useMarkRead } from '../hooks/useMessages'
import { Button } from '../components/ui/Button'

function fmtTime(dt) {
  return new Date(dt).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

function initials(name) {
  return (name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')
}

// Deterministic avatar tint by name, not random — same name always gets
// the same color across a session and across reloads.
//
// Prompt 502: `bg-accent-deep` here relies on white text staying readable
// against it — true in light mode (accent-deep is a dark navy), but
// accent-deep intentionally flips to a LIGHT color in dark mode (see
// index.css) since its dominant use elsewhere is text sitting on dark
// cards, not a solid chip. White-on-light-lavender would be illegible, so
// this one tint gets a `dark:` override pinned to the same dark navy the
// light theme already uses — a fixed solid chip color independent of the
// token's dark-mode text role, same fix pattern as Avatar.jsx's initials.
const AVATAR_TINTS = ['bg-accent', 'bg-success', 'bg-warning', 'bg-danger', 'bg-accent-deep dark:!bg-[#24469e]']
function avatarTint(name) {
  const sum = [...(name || '')].reduce((s, c) => s + c.charCodeAt(0), 0)
  return AVATAR_TINTS[sum % AVATAR_TINTS.length]
}

function Avatar({ name, size = 36 }) {
  return (
    <span
      className={clsx('flex flex-shrink-0 items-center justify-center rounded-full font-sans font-semibold text-white', avatarTint(name))}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials(name)}
    </span>
  )
}

function NewConversationPicker({ contacts, onPick, onClose }) {
  return (
    <div className="absolute inset-x-3 top-14 z-20 rounded-card border border-line bg-elevated p-2 shadow-lg">
      <div className="flex items-center justify-between px-2 py-1">
        <p className="eyebrow">New message</p>
        <button onClick={onClose} className="text-fg-faint hover:text-fg-primary">
          <X size={14} />
        </button>
      </div>
      {!contacts?.length ? (
        <p className="px-2 py-3 font-sans text-sm text-fg-secondary">No one available to message yet.</p>
      ) : (
        <div className="max-h-64 overflow-y-auto">
          {contacts.map((c) => (
            <button
              key={c.id}
              onClick={() => onPick(c)}
              className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-surface"
            >
              <Avatar name={c.full_name} size={28} />
              <div className="min-w-0">
                <p className="truncate font-sans text-sm font-medium text-fg-primary">{c.full_name}</p>
                <p className="eyebrow !text-fg-faint">{c.role}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Messages() {
  const { profile } = useAuth()
  const { data: contacts } = useContacts(profile?.role)
  const { data: messages, isLoading } = useMyMessages(profile?.id)
  const sendMessage = useSendMessage()
  const markRead = useMarkRead()
  const [selectedId, setSelectedId] = useState(null)
  const [draft, setDraft] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)

  const conversations = useMemo(() => {
    if (!messages || !profile) return []
    const byOther = new Map()
    for (const m of messages) {
      const otherId = m.sender_id === profile.id ? m.recipient_id : m.sender_id
      if (!byOther.has(otherId)) byOther.set(otherId, [])
      byOther.get(otherId).push(m)
    }
    return [...byOther.entries()]
      .map(([otherId, msgs]) => ({
        otherId,
        messages: msgs,
        last: msgs[msgs.length - 1],
        unread: msgs.filter((m) => m.recipient_id === profile.id && !m.read).length,
      }))
      .sort((a, b) => new Date(b.last.created_at) - new Date(a.last.created_at))
  }, [messages, profile])

  // A conversation partner might not be in my current `contacts` list
  // (e.g. a closer who messaged me before, but the picker only shows
  // eligible *new* recipients) — fall back to reading the name off any
  // message in the thread isn't possible (messages don't store names), so
  // resolve display info primarily from `contacts`. In practice every
  // valid conversation partner is always someone can_message() allows, so
  // they're always in `contacts` too — this is just defensive.
  const contactsById = useMemo(() => new Map((contacts || []).map((c) => [c.id, c])), [contacts])

  const active = conversations.find((c) => c.otherId === selectedId)
  const activeContact = selectedId ? contactsById.get(selectedId) : null

  function openConversation(otherId) {
    setSelectedId(otherId)
    setPickerOpen(false)
    const conv = conversations.find((c) => c.otherId === otherId)
    const unreadIds = conv?.messages.filter((m) => m.recipient_id === profile.id && !m.read).map((m) => m.id) || []
    if (unreadIds.length) markRead.mutate(unreadIds)
  }

  function handleSend(e) {
    e.preventDefault()
    const body = draft.trim()
    if (!body || !selectedId) return
    sendMessage.mutate({ senderId: profile.id, recipientId: selectedId, body })
    setDraft('')
  }

  return (
    <div className="relative grid min-h-0 flex-1 grid-cols-[280px_1fr] overflow-hidden bg-elevated">
      <div className="flex flex-col border-r border-line">
        <div className="flex items-center justify-between border-b border-line p-3">
          <p className="eyebrow">Conversations</p>
          <button
            onClick={() => setPickerOpen((v) => !v)}
            className="flex h-7 w-7 items-center justify-center rounded-full text-fg-secondary hover:bg-surface hover:text-fg-primary"
            title="New message"
          >
            <Plus size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <p className="p-4 font-sans text-sm text-fg-secondary">Loading…</p>
          ) : !conversations.length ? (
            <p className="p-4 font-sans text-sm text-fg-secondary">No conversations yet.</p>
          ) : (
            conversations.map((c) => {
              const contact = contactsById.get(c.otherId)
              return (
                <button
                  key={c.otherId}
                  onClick={() => openConversation(c.otherId)}
                  className={clsx(
                    'flex w-full items-start gap-2.5 border-b border-line px-3 py-3 text-left hover:bg-surface',
                    selectedId === c.otherId && 'bg-surface'
                  )}
                >
                  <Avatar name={contact?.full_name} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate font-sans text-sm font-medium text-fg-primary">
                        {contact?.full_name || 'Unknown'}
                      </p>
                      {c.unread > 0 && <span className="h-2 w-2 flex-shrink-0 rounded-full bg-accent" />}
                    </div>
                    <p className="truncate font-sans text-xs text-fg-secondary">{c.last.body}</p>
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>

      {pickerOpen && (
        <NewConversationPicker
          contacts={(contacts || []).filter((c) => !conversations.some((conv) => conv.otherId === c.id))}
          onPick={(c) => openConversation(c.id)}
          onClose={() => setPickerOpen(false)}
        />
      )}

      <div className="flex flex-col">
        {!active && !activeContact ? (
          <div className="flex flex-1 items-center justify-center">
            <p className="font-sans text-sm text-fg-secondary">Select a conversation, or start a new one.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2.5 border-b border-line p-3">
              <Avatar name={activeContact?.full_name} size={30} />
              <div>
                <p className="font-sans text-sm font-medium text-fg-primary">{activeContact?.full_name}</p>
                <p className="eyebrow !text-fg-faint">{activeContact?.role}</p>
              </div>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto p-4">
              {(active?.messages || []).map((m) => {
                const mine = m.sender_id === profile.id
                return (
                  <div key={m.id} className={clsx('flex', mine ? 'justify-end' : 'justify-start')}>
                    <div
                      className={clsx(
                        'max-w-[75%] rounded-2xl px-3.5 py-2 font-sans text-sm',
                        mine ? 'bg-accent text-white' : 'bg-surface text-fg-primary'
                      )}
                    >
                      <p className="whitespace-pre-wrap">{m.body}</p>
                      <p className={clsx('mt-1 text-[10px]', mine ? 'text-white/70' : 'text-fg-faint')}>
                        {fmtTime(m.created_at)}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>

            <form onSubmit={handleSend} className="flex items-end gap-2 border-t border-line p-3">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSend(e)
                  }
                }}
                rows={1}
                placeholder="Write a message…"
                className="max-h-24 flex-1 resize-none rounded-lg border-2 border-line bg-base px-3 py-2 font-sans text-sm text-fg-primary outline-none focus:border-accent"
              />
              <Button type="submit" disabled={!draft.trim() || sendMessage.isPending} className="!px-3">
                <Send size={16} />
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
