import { supabase } from './supabase'

// Prompt 540 — "No Show" is a derived display state, not a stored
// closer_outcome value: a booked lead whose strategy_call_at has passed
// with the closer never having logged a real outcome (still 'pending', the
// LogOutcomeForm default) reads as No Show everywhere the outcome shows up,
// with zero manual flagging. Only 'pending' (or a missing value, same
// default every count/badge call site already treats as pending) can ever
// be No Show — 'lost'/'closed' are real logged outcomes and stay exactly
// what the closer set them to regardless of how much time has passed.
export function isNoShow(lead) {
  const outcome = lead.closer_outcome || 'pending'
  return outcome === 'pending' && !!lead.strategy_call_at && new Date(lead.strategy_call_at).getTime() < Date.now()
}

// The outcome as it should actually be shown/counted/filtered on — every
// call site that used to read `lead.closer_outcome || 'pending'` directly
// should read this instead, so No Show can never drift out of sync between
// the Closer Overview tiles, the admin Pipeline Closer tab, and the badge
// itself.
export function displayOutcome(lead) {
  return isNoShow(lead) ? 'no_show' : (lead.closer_outcome || 'pending')
}

// A no-show that's sat 7+ days past its missed appointment time with no
// reschedule becomes genuinely, durably Lost — not just a display
// computation, since Lost feeds real reporting (Commissions, pipeline
// counts) that needs to survive regardless of whether this specific lead
// ever gets looked at again. Chosen over a scheduled cron job given this
// project's history of DDL/cron classifier blocks (Prompt 506/515) — a
// lazy write-on-read is self-limiting by construction (the write flips
// closer_outcome away from 'pending', so a lead can only ever be escalated
// once; no separate "already processed" flag needed) and needs no new
// schema. Real trade-off, documented rather than hidden: this only fires
// when *this* query actually runs, so a lead only escalates once someone
// (closer or admin, wherever this is wired up) loads a view that fetches
// it — see the call site comments in useLeads.js for which views that is.
const LOST_ESCALATION_DAYS = 7
const AUTO_LOST_NOTE = 'Auto-marked Lost — no-show, not rebooked within 7 days.'

export async function escalateStaleNoShows(leads) {
  const cutoff = Date.now() - LOST_ESCALATION_DAYS * 24 * 60 * 60 * 1000
  const stale = (leads || []).filter((lead) => isNoShow(lead) && new Date(lead.strategy_call_at).getTime() < cutoff)
  if (!stale.length) return leads

  const results = await Promise.allSettled(
    stale.map((lead) => {
      const closer_notes = [lead.closer_notes, AUTO_LOST_NOTE].filter(Boolean).join('\n\n')
      return supabase.from('leads').update({ closer_outcome: 'lost', closer_notes }).eq('id', lead.id).then(({ error }) => {
        if (error) throw error
        return { id: lead.id, closer_notes }
      })
    })
  )

  const patched = new Map()
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') patched.set(stale[i].id, r.value.closer_notes)
    else console.error(`escalateStaleNoShows: failed to escalate lead ${stale[i].id}`, r.reason)
  })
  if (!patched.size) return leads

  return leads.map((lead) =>
    patched.has(lead.id) ? { ...lead, closer_outcome: 'lost', closer_notes: patched.get(lead.id) } : lead
  )
}
