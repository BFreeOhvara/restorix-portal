import { useState } from 'react'
import { Play } from 'lucide-react'
import { SegmentedTabs } from '../components/ui/SegmentedTabs'
import { PillToggle } from '../components/ui/PillToggle'
import { usePageHeader } from '../components/Layout'
import { SurveyBody } from './Survey'
import { useBrand } from '../hooks/useBrand'
import Modal from '../components/ui/Modal'

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
    body: `Yeah hey — it's [Your Name], [Your Name] from Restorix... does that ring a bell? This is [Company Name], right?

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

// Prompt 607 — real content for the Videos tab, hardcoded same as
// SCRIPT_SECTIONS above (no CMS/generation system). No role split: same
// videos for every role that can see this tab, unlike the Script tab.
const VIDEO_SECTIONS = [
  {
    title: 'Cold Calling Mindset & Fundamentals',
    videos: [
      { title: "The ONLY Cold Call Mindset Video You'll Ever Need", youtubeId: 'jc0WyiPuXLU' },
      { title: '10 Cold Calling Tips: Go From Beginner to Master', youtubeId: 'kc6tv4GKspA' },
      { title: '2026 Cold Calling Techniques (He Trained 1 Million Sales Reps)', youtubeId: 'il2p-OD4Res' },
    ],
  },
  {
    title: 'The Opener',
    videos: [
      { title: 'The ONLY Cold Call Opener You Need (+ a few other tips)', youtubeId: 'f7ys83DQXGg' },
      { title: 'BEST Appointment Setting Script | Setter Training', youtubeId: 'HDA9jURJlBc' },
    ],
  },
  {
    title: 'Discovery & Qualifying Questions',
    videos: [
      { title: 'How To Ask Discovery Questions To Uncover Business Problems', youtubeId: 'SThDd_7Y5Fw' },
      { title: 'Use These Discovery Questions to Quantify Pain', youtubeId: 'UCrAj5tlcd8' },
    ],
  },
  {
    title: 'Objection Handling',
    videos: [
      { title: 'Learn The 3-Step Framework to Handle Any Cold Call Objection', youtubeId: 'NtrC9DK_qE8' },
      { title: "How I Handle 'Not Interested' (Cold Call Script)", youtubeId: 'z_JohGi_i7k' },
      { title: "3 Simple Tricks to Overcome 'I'm Not Interested' on Cold Calls", youtubeId: 'kHhemhC1OsA' },
    ],
  },
  {
    title: 'Booking the Appointment',
    videos: [
      { title: 'How I Book 3-5 Appointments Per Day (B2B Cold Calling)', youtubeId: 'dnOu6ysy7NU' },
      { title: 'How to Book the Meeting on the 2nd Ask', youtubeId: 'mQ68FJYL8Lg' },
      { title: '5 Easy Steps to Set More Appointments', youtubeId: 'bycAeHjGUcU' },
    ],
  },
]

const TABS = [
  { key: 'script', label: 'Script' },
  { key: 'videos', label: 'Videos' },
]

const SCRIPT_ROLE_TABS = [
  { key: 'closer', label: 'Closer' },
  { key: 'setter', label: 'Setter' },
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

// Prompt 607 — modal unmounts the iframe on close (same cleanup-on-close
// discipline as MyCalls.jsx's RecordingModal) so playback actually stops
// instead of continuing hidden behind the closed modal.
function VideoModal({ title, youtubeId, onClose }) {
  return (
    <Modal title={title} onClose={onClose} width="max-w-2xl">
      <div className="aspect-video w-full overflow-hidden rounded-card">
        <iframe
          className="h-full w-full"
          src={`https://www.youtube.com/embed/${youtubeId}?autoplay=1`}
          title={title}
          allow="autoplay; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    </Modal>
  )
}

function VideoCard({ title, youtubeId }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="group text-left"
      >
        <div className="relative aspect-video w-full overflow-hidden rounded-card border border-line bg-elevated">
          <img
            src={`https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`}
            alt={title}
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 flex items-center justify-center bg-black/25 transition-colors group-hover:bg-black/40">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black/60 text-white">
              <Play size={20} fill="currentColor" />
            </div>
          </div>
        </div>
        <p className="mt-2 font-sans text-sm text-fg-primary">{title}</p>
      </button>
      {open && <VideoModal title={title} youtubeId={youtubeId} onClose={() => setOpen(false)} />}
    </>
  )
}

function VideosTab() {
  return (
    <div className="space-y-8">
      {VIDEO_SECTIONS.map((section) => (
        <div key={section.title}>
          <h3 className="font-display text-lg font-medium text-fg-primary">{section.title}</h3>
          <div className="mt-3 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {section.videos.map((video) => (
              <VideoCard key={video.youtubeId} title={video.title} youtubeId={video.youtubeId} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function Training() {
  const [tab, setTab] = useState('script')
  const [scriptRole, setScriptRole] = useState('closer')
  const { niche } = useBrand()
  usePageHeader({ title: 'Training', subtitle: 'Reference materials for the team' })

  return (
    <div>
      <div className="mt-6">
        <SegmentedTabs tabs={TABS} active={tab} onChange={setTab} variant="grouped" />
      </div>

      <div className="mt-6">
        {tab === 'script' && (
          <div>
            <div className="flex">
              <PillToggle options={SCRIPT_ROLE_TABS} active={scriptRole} onChange={setScriptRole} />
            </div>
            <div className="mt-6">
              {scriptRole === 'closer' && <SurveyBody niche={niche} hidePageHeader />}
              {scriptRole === 'setter' && <ScriptTab />}
            </div>
          </div>
        )}
        {tab === 'videos' && <VideosTab />}
      </div>
    </div>
  )
}
