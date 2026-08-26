import { useState } from 'react'
import { SegmentedTabs } from '../components/ui/SegmentedTabs'

// Plain-text content area — Brayden edits SCRIPT_SECTIONS directly to update
// call scripts. No generation or CMS, per spec (Prompt 433, relocated here
// under the Training tab structure by Prompt 437).
//
// Prompt 539 — real script content, pasted verbatim from Brayden's 7-section
// outbound cold-call script (setters/closers calling treatment-center
// decision-makers to book a demo for Restorix itself — not patient-facing,
// so none of the crisis-sensitive tone rules elsewhere in this codebase
// apply here). Every bracketed placeholder ([Niche], [Company Name], [X],
// [$Y], [$Z], [Day], [Time]) stays literal text — setters fill these in out
// loud while reading off the script, no variable-substitution mechanism per
// the same no-generation-system constraint noted above.
const SCRIPT_SECTIONS = [
  {
    title: '1. The Opener',
    guidance: 'Pattern interrupt — sound confused/different, not "salesy"',
    body: `Yeah hey — it's Roos, Roos from Restorix... does that ring a bell? This is [Company Name], right?

Oh okay perfect, yeah — I don't want to waste your time, I was wondering if you could help me out real quick?

I tried calling you guys last week but unfortunately I couldn't get in touch...`,
  },
  {
    title: '2. Problem Awareness',
    guidance: 'Seed the problem, find the decision maker, stay unsure/neutral — do NOT assume',
    body: `Honestly — well I'm not completely sure if you're the right person I should be talking to, but I was just curious — who would be responsible for any possible hidden gaps in the call flow system? That could be causing you guys to miss out on clientele to competitors without even knowing it...

Who should I be talking to about that?`,
  },
  {
    title: '3. Engagement',
    guidance: 'Open curiosity, describe their reality without accusing',
    body: `Well — honestly I'm not even sure this applies to you guys yet, that's why I'm calling.

But most [Niche] companies we talk to have high call volume coming in, and of course some slips through the cracks and goes to your competitors.

How many calls would you say you're missing per week?`,
  },
  {
    title: '4. Consequence Questions',
    guidance: "Human conversation, build the pain, tie every number back to a real dollar figure",
    body: `What do you make on an average deal?

[Break down the numbers with them out loud — let them do the math, don't just tell them]

Okay so if you're missing around [X] calls a week, at [$Y] average job value... that's roughly [$Z] a month just walking out the door. Does that sound about right, or am I off?

Hmm, okay — and when that happens, what are you currently doing about the missed calls? Do you have any follow-up system in place to try and win those back?

(If they have a system)
Got it, that makes sense — [acknowledge briefly, move on, don't compete with what they have yet]

(If no system)
Interesting — so when you're missing [X] calls a week, they're just calling the next [niche], and there's nothing catching that or re-engaging them to try and get that business back?

And that's just the calls you know about — how many do you think never even hit voicemail? Just rang out completely?

Yeah, that tracks with what we're seeing across [niche] right now, most owners don't realize it's costing them that much until they actually see it laid out. Does that surprise you, or does it kind of match what you already suspected?`,
  },
  {
    title: '5. The Bridge',
    guidance: 'Transition into the solution — low pressure, no pitch language',
    body: `So honestly, the reason I'm calling — it's pretty simple. We built something specifically for [niche] that closes that exact gap, so you catch those calls automatically, without hiring anyone new or changing how your day-to-day works.

I don't want to try and explain the whole thing over the phone, it's honestly a lot easier to just show you.`,
  },
  {
    title: '6. The Ask — Booking the Demo',
    guidance: 'Assumptive close, offer two concrete times, don\'t ask "are you interested"',
    body: `Would it make sense to jump on a quick 15-minute call where I show you exactly how this would work for [Company Name] specifically — using your actual numbers?

I've got some time [Day] at [Time], or [Day] at [Time] — which works better for you?

If they hesitate on timing:
No worries — even 10 minutes works, I just want to show you what it'd actually look like with your call volume, not some generic pitch.`,
  },
  {
    title: '7. Soft Objection Handling',
    guidance: 'Keep these short — don\'t argue, just re-anchor to curiosity',
    body: `"We're not really looking for anything right now"
Totally fair — most people we talk to weren't looking either, until they saw what it was actually costing them. That's really all this call is, just showing you the number. If it's not worth it after that, no hard feelings.

"Just send me some info"
I can do that, but honestly the numbers only mean something when they're your numbers — that's why I'd rather just hop on 10 minutes and run it live instead of sending you a generic PDF. Does [Day] or [Day] work better?

"How much does it cost?"
Good question — honestly it depends on your call volume, which is exactly why I want to get on that quick call, so I can give you a real number instead of guessing. [Day] or [Day] work for you?`,
  },
]

const TABS = [
  { key: 'script', label: 'Script' },
  { key: 'videos', label: 'Videos' },
  { key: 'roleplay', label: 'AI Voice Roleplay' },
]

function ScriptTab() {
  return (
    <div className="space-y-4">
      {!SCRIPT_SECTIONS.length ? (
        <div className="rounded-card border border-line bg-elevated p-8 text-center">
          <p className="font-sans text-sm text-fg-secondary">No scripts added yet.</p>
        </div>
      ) : (
        SCRIPT_SECTIONS.map((section) => (
          <div key={section.title} className="rounded-card border border-line bg-elevated p-5">
            <h3 className="font-display text-lg font-medium text-fg-primary">{section.title}</h3>
            {section.guidance && (
              <p className="mt-1 font-sans text-xs italic text-fg-faint">{section.guidance}</p>
            )}
            <p className="mt-3 whitespace-pre-wrap font-sans text-sm text-fg-secondary">{section.body}</p>
          </div>
        ))
      )}
    </div>
  )
}

function ComingSoonTab({ message }) {
  return (
    <div className="rounded-card border border-line bg-elevated p-8 text-center">
      <p className="font-sans text-sm text-fg-secondary">{message}</p>
    </div>
  )
}

export default function Training() {
  const [tab, setTab] = useState('script')

  return (
    <div>
      <h1 className="font-display text-2xl font-medium text-fg-primary">Training</h1>
      <p className="mt-1 font-sans text-sm text-fg-secondary">Reference materials for the team</p>

      <div className="mt-6">
        <SegmentedTabs tabs={TABS} active={tab} onChange={setTab} />
      </div>

      <div className="mt-6">
        {tab === 'script' && <ScriptTab />}
        {tab === 'videos' && <ComingSoonTab message="Training videos are coming soon." />}
        {tab === 'roleplay' && <ComingSoonTab message="AI voice roleplay is coming soon." />}
      </div>
    </div>
  )
}
