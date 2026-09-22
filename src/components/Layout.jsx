import { useState, useRef, useEffect, useContext, createContext } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Bell, LogOut, Workflow, Users as UsersIcon, GraduationCap, BarChart2, TrendingUp, Activity as ActivityIcon, Users2, DollarSign, Target, MessageSquare, PhoneCall, Settings as SettingsIcon, UserPlus, GitBranch, Bug, Smartphone, CalendarDays, PieChart, CreditCard, Video } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useBrand } from '../hooks/useBrand'
import { supabase, SUPABASE_URL } from '../lib/supabase'
import ParticleField from './ui/ParticleField'
import { Avatar } from './ui/Avatar'
import BugReportModal from './BugReportModal'
import AddToHomeScreenModal from './AddToHomeScreenModal'

// Prompt 448: grouped into labeled sections (matching ohvara-dashboard's
// Sidebar.jsx grouped-nav pattern) instead of one flat list. Bucket names
// are ours, not Brayden's — he asked for the grouped structure, not
// specific labels. Queue/Users move out of pole position into their own
// admin-only ADMIN group now that groups do the visual separation work
// flat order used to (previously admin's daily tools sat right after
// Overview specifically to read as "primary" in a flat list).
// Prompt 449: group ORDER changed to TODAY -> RESOURCES -> PERFORMANCE ->
// WORK per Brayden's review (was TODAY -> WORK -> PERFORMANCE -> RESOURCES).
// Group contents unchanged. ADMIN's position wasn't specified — left last.
const NAV_GROUPS = [
  {
    label: 'TODAY',
    items: [
      { to: '/overview', label: 'Overview', icon: BarChart2, roles: ['setter', 'admin', 'closer', 'client'] },
    ],
  },
  {
    label: 'RESOURCES',
    items: [
      // Prompt 513 — admin's job is overseeing the operation, not doing
      // setter/closer performance work, so Training/My Goals/Stats/My
      // Calls (Brayden's own explicit list, not extended to anything he
      // didn't name) drop out of admin's own sidebar here and below. The
      // routes/pages themselves are untouched — setters and closers still
      // see and use all of them exactly as before; this is nav visibility
      // only, via the same roles-array gating every item already uses.
      { to: '/training', label: 'Training', icon: GraduationCap, roles: ['setter', 'closer'] },
    ],
  },
  {
    label: 'PERFORMANCE',
    items: [
      { to: '/goals', label: 'My Goals', icon: Target, roles: ['setter'] },
      { to: '/stats', label: 'Stats', icon: TrendingUp, roles: ['setter', 'closer'] },
      { to: '/activity', label: 'Activity', icon: ActivityIcon, roles: ['setter'] },
      { to: '/setter-activity', label: 'Setter Activity', icon: Users2, roles: ['closer'] },
      { to: '/commissions', label: 'Commissions', icon: DollarSign, roles: ['setter', 'admin', 'closer'] },
    ],
  },
  {
    // Prompt 454: Messages and Settings pulled back out — WORK is just
    // My Calls again now.
    label: 'WORK',
    items: [
      // Prompt 474 / 561: "My Recordings" reads better than "My Calls" for
      // one's own dial history — Prompt 474 did this for setters, Prompt 561
      // extends it to closers (setter + closer are the only roles with this
      // item; admin doesn't get it). Same route, same data, label only.
      { to: '/my-calls', label: 'My Recordings', icon: PhoneCall, roles: ['setter', 'closer'] },
      // Prompt 509 — closer self-dial: My Leads (request + work leads from
      // the shared pool, reusing the setter Pipeline UI) and My Pipeline
      // (outcome tracking, same content shape as Overview already has for
      // closers — confirmed with Brayden as a separate addition, not a
      // replacement). Closer-only.
      { to: '/my-leads', label: 'My Leads', icon: UserPlus, roles: ['closer'] },
      { to: '/my-pipeline', label: 'My Pipeline', icon: GitBranch, roles: ['closer'] },
      // Prompt 615 — first piece of Phase 2 ("bring the call into the
      // portal"): one destination for a closer's Personal Meeting Room +
      // quick-join links for booked Strategy Calls. Closer-only, same as
      // My Leads/My Pipeline above.
      { to: '/meeting-room', label: 'Meeting Room', icon: Video, roles: ['closer'] },
    ],
  },
  {
    label: 'ADMIN',
    items: [
      { to: '/pipeline', label: 'Pipeline', icon: Workflow, roles: ['admin'] },
      { to: '/users', label: 'Users', icon: UsersIcon, roles: ['admin'] },
      // Prompt 528 — the real destination the sidebar's Report a Bug
      // button submits to.
      { to: '/bug-reports', label: 'Bug Reports', icon: Bug, roles: ['admin'] },
      // Prompt 611 — client portal's "Request payment method change" review queue.
      { to: '/billing-requests', label: 'Billing Requests', icon: CreditCard, roles: ['admin'] },
    ],
  },
  // Prompt 456: reverses Prompt 454's headerless standalone block —
  // Brayden looked at it and wanted real section headers after all, just
  // not ones that literally repeat the single item's own name ("SETTINGS"
  // over "Settings" reads redundant). Two separate one-item groups, not
  // one shared group holding both, per his explicit "should be two
  // separate section headers" instruction. Labels are his own suggested
  // wording from the prompt itself (COMMUNICATION / ACCOUNT, the latter
  // matching how ohvara-dashboard's own Sidebar.jsx names this kind of
  // group), not a guess needing separate sign-off. Kept in the same
  // bottom-of-sidebar position Prompt 454 already put them in — this
  // prompt only asked for headers to be added back, not a reposition.
  {
    label: 'COMMUNICATION',
    items: [
      { to: '/messages', label: 'Messages', icon: MessageSquare, roles: ['setter', 'admin', 'closer'] },
    ],
  },
  {
    label: 'ACCOUNT',
    items: [
      { to: '/settings', label: 'Settings', icon: SettingsIcon, roles: ['setter', 'admin', 'closer', 'client'] },
    ],
  },
]

// Prompt 578 — Client Portal CRM reframe. Replaces Prompt 565/567's
// per-purchased-agent nav (one tab per bought agent) with a FIXED
// CRM-shaped structure, identical for every client regardless of what
// they bought — purchase-gating moved inside the pages themselves. A
// purchased agent now shows up as data on a page (a stat tile, a field
// on a contact record, a status pill), never as its own named tab.
// Grouped sections stay (Brayden: "the little side parts by groups stay
// there"), same visual treatment COMMUNICATION/ACCOUNT already use.
const CLIENT_NAV_GROUPS = [
  {
    label: 'TODAY',
    items: [{ to: '/overview', label: 'Overview', icon: BarChart2, roles: ['client'] }],
  },
  {
    label: 'WORKSPACE',
    items: [
      // /pipeline is admin-only, /my-pipeline is the closer's — client
      // Pipeline routes to /prospects (Prompt 578).
      { to: '/prospects', label: 'Pipeline', icon: Users2, roles: ['client'] },
      { to: '/appointments', label: 'Appointments', icon: CalendarDays, roles: ['client'] },
    ],
  },
  {
    label: 'INSIGHTS',
    items: [{ to: '/reports', label: 'Reports', icon: PieChart, roles: ['client'] }],
  },
  {
    label: 'ACCOUNT',
    items: [{ to: '/settings', label: 'Settings', icon: SettingsIcon, roles: ['client'] }],
  },
]

function NotificationBell() {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-9 items-center justify-center rounded-full text-fg-secondary hover:bg-surface hover:text-fg-primary"
        title="Notifications"
      >
        <Bell size={18} />
      </button>
      {open && (
        <div className="absolute right-0 top-11 w-64 rounded-card border border-line bg-elevated p-4 shadow-lg">
          <p className="font-sans text-sm text-fg-secondary">No new notifications.</p>
        </div>
      )}
    </div>
  )
}

// Prompt 442: partial revert of 441 — Brayden wants the full account block
// back in the sidebar (name, role, sign-out), AND a simple name-only label
// in the header next to the bell. Both places show the name at once,
// intentionally — not a duplication bug.
// Prompt 453: the block itself is now the popover trigger (ohvara-dashboard's
// AccountMenu pattern) — clicking it opens Profile/Sign out above it instead
// of Sign out sitting as a bare icon next to the name. Same outside-click
// pattern already used by NotificationBell above, just anchored upward
// (bottom-full) since this sits at the bottom of the sidebar.
// Prompt 477: ohvara-dashboard's own AccountMenu row carries a permanent
// `--bg-elevated` card background to read as clickable against its
// (darker) sidebar — copying that literal token here would do nothing,
// since Restorix's sidebar itself IS `bg-elevated` (white).
//
// Prompt 505: Prompt 477's original fix used a one-off `#e3e9ff` hex tint
// instead, but Brayden's live read was that it didn't read as a bounded,
// clickable element the way the sidebar's own active-nav-item treatment
// does (see `NavItemLink` below: `bg-surface` fill, no border). Switched
// to that exact same token instead of inventing a second "selected"
// treatment — same background color, same visual weight, one consistent
// language for "this is the current/active thing" across the sidebar.
// `hover:bg-muted` is the next token up the base<surface<elevated<muted
// ladder, giving real hover feedback without a new color. Both tokens
// already carry correct dark values (Prompt 502), so the old per-theme
// `dark:bg-[...]` overrides this button needed are gone too — genuinely
// simpler code, not just a different color.
// Prompt 528 — two circular icon buttons above the account box, visual
// concept pointed at from ohvara-dashboard's own floating bug-report
// button. Unlike the header bell (which only shows a circle on hover),
// these carry a persistent visible border/background.
// Prompt 531 — Brayden revised the spec after seeing it live: the bug
// button's literal 🐛 emoji read as "wormy," not the clean vector-icon
// look he wanted (swapped for lucide's own `Bug` icon, already imported
// above), and the `--danger` red tint came off as a false "needs
// attention" signal rather than a neutral action button — dropped so
// both buttons share one plain treatment, same as the phone button
// already had. `tone`/`emoji` props are gone with it, not left dead.
// Prompt 537 — shrunk from h-16/w-16 (64px) + size-28 icon: too large
// relative to the rest of the sidebar (17px nav icons, the account card
// below). 44px + size-20 keeps both circular and equal to each other, just
// noticeably smaller.
// Prompt 552 — `iconSrc` renders a PNG (a brand logo-icon) in place of the
// Lucide `icon` component, at the same 20px box. Used by SwapButton to show
// the destination brand's own portal icon instead of a generic arrow.
function SidebarIconButton({ icon: Icon, iconSrc, label, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      title={label}
      disabled={disabled}
      className="flex h-11 w-11 items-center justify-center rounded-full border border-line bg-surface text-fg-secondary transition-colors hover:border-fg-primary/40 hover:text-fg-primary disabled:cursor-wait disabled:opacity-50"
    >
      {iconSrc ? <img src={iconSrc} alt="" className="h-5 w-5 object-contain" /> : <Icon size={20} />}
    </button>
  )
}

// Prompt 549 — closer-only. Mints a short-lived magic link via the
// mint-handoff-link edge function targeting the OTHER niche's portal
// domain, then hard-navigates to it — Supabase's /auth/v1/verify does the
// session exchange server-side and redirects to that domain's
// /auth/callback with the new session, so the closer lands logged in on
// the other branded portal without re-entering a password.
// Prompt 622 — currently unused — re-enable by rendering <SwapButton />
// in the icon row below (see the sidebar footer JSX further down). Left
// intact rather than deleted per Brayden's "rotate out of use for now."
function SwapButton() {
  const brand = useBrand()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const otherName = brand.niche === 'bail_bonds' ? 'Restorix Sustain' : 'Suretix'
  // Prompt 552 — show the DESTINATION brand's own portal icon, not a generic
  // swap arrow. On Restorix you're swapping TO Suretix (amber "S"); on
  // Suretix you're swapping TO Restorix (teal "R", the shared /logo-icon.png
  // static asset, md5-identical to restorix-icon-transparent.png).
  const destIcon = brand.niche === 'bail_bonds' ? '/logo-icon.png' : '/suretix-logo-icon.png'

  async function swap() {
    setError(null)
    setBusy(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('No active session')
      const res = await fetch(`${SUPABASE_URL}/functions/v1/mint-handoff-link`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from_niche: brand.niche }),
      })
      const data = await res.json()
      if (!res.ok || !data.action_link) throw new Error(data.error || 'Swap failed')
      window.location.href = data.action_link
    } catch (e) {
      setError(e.message || 'Swap failed')
      setBusy(false)
    }
  }

  return (
    <SidebarIconButton
      iconSrc={destIcon}
      label={error ? `Swap failed — ${error}` : busy ? 'Swapping…' : `Swap to ${otherName}`}
      onClick={swap}
      disabled={busy}
    />
  )
}

// Prompt 622 — the divider that used to sit on this component's own
// wrapper (border-t) now lives on the logo block up top instead, so this
// wrapper only keeps its padding. The Profile/Sign out reveal switched
// from an absolutely-positioned floating card (bottom-full, shadow-lg)
// to an inline grid-rows expand: `open` toggles `grid-rows-[0fr]` <->
// `grid-rows-[1fr]` on a `grid` wrapper, animating to real auto-height
// instead of a hardcoded max-height. Because the panel now lives in
// normal flow, growing it pushes the icon-button row and account button
// above it upward as the sidebar's nav content sits above it, rather than
// laying a shadowed card over those buttons — same handlers and markup
// inside, only the container/positioning/animation changed.
// Prompt 623 — Profile item dropped (Settings' own Account card already
// surfaces Role/Username; login/password fields move to Settings once
// Security ships). Account row + Sign-out row now live inside one shared
// `rounded-lg border` card instead of two separately-boxed elements — the
// account row lost its own `rounded-lg` fill, the reveal lost its own
// nested border/background, and a `border-t` on Sign-out is what now
// separates the two rows within the single card. Sign-out centered
// instead of left-aligned; the account row above it is untouched.
function AccountPopover({ profile, onSignOut }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div ref={ref} className="p-3">
      <div className="overflow-hidden rounded-lg border border-line bg-surface">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center gap-2 px-2 py-2 text-left transition-colors hover:bg-muted"
        >
          {/* Prompt 505: avatar added matching ohvara-dashboard's own
              AccountMenu row (Sidebar.jsx) — Avatar left of the stacked
              name/role text, same `gap` proportions. Reuses the existing
              Avatar component verbatim (Prompt 491, already handles the
              real-photo vs. pastel-initials fallback) rather than building
              a second one. */}
          <Avatar profile={profile} size={28} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-sans text-sm font-medium text-fg-primary">{profile?.full_name}</p>
            <p className="eyebrow !text-fg-faint">{profile?.role}</p>
          </div>
        </button>

        <div
          className={`grid transition-[grid-template-rows] duration-200 ease-out ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
        >
          <div className="overflow-hidden">
            <button
              onClick={() => { setOpen(false); onSignOut() }}
              className="flex w-full items-center gap-2.5 border-t border-line px-3 py-2 font-sans text-sm text-danger hover:bg-muted"
            >
              <LogOut size={15} /> Sign out
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function NavItemLink({ to, label, icon: Icon }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-lg px-3 py-2 font-sans text-sm transition-colors ${
          isActive
            ? 'bg-surface font-semibold text-accent'
            : 'text-fg-secondary hover:bg-surface hover:text-fg-primary'
        }`
      }
    >
      <Icon size={17} />
      {label}
    </NavLink>
  )
}

function HeaderName({ profile }) {
  return (
    <div className="flex items-center gap-3">
      <span aria-hidden="true" className="h-6 w-px bg-line" />
      <Avatar profile={profile} size={28} />
      <p className="font-sans text-sm font-medium text-fg-primary">{profile?.full_name}</p>
    </div>
  )
}

// Prompt 589 — lets a page hand its title/subtitle up to Layout's own
// header bar instead of rendering its own <h1> in the page body. Only
// My Pipeline uses this for now; every other page never calls the hook,
// so `pageHeader` stays null and the header's left slot renders nothing.
const PageHeaderContext = createContext(() => {})

export function usePageHeader({ title, subtitle }) {
  const setPageHeader = useContext(PageHeaderContext)
  useEffect(() => {
    setPageHeader({ title, subtitle })
    return () => setPageHeader(null)
  }, [setPageHeader, title, subtitle])
}

export default function Layout() {
  const { profile, signOut } = useAuth()
  const brand = useBrand()
  const location = useLocation()
  // Prompt 528
  const [showBugReport, setShowBugReport] = useState(false)
  const [showAddToHome, setShowAddToHome] = useState(false)
  // Prompt 456: Messages is the one page that fills the full content area
  // edge-to-edge instead of sitting in the standard padded/max-width
  // container every other page uses — Brayden's explicit call, not a
  // guess. Layout has to know about this itself since Messages.jsx can't
  // undo a parent's real padding/max-width from inside without a hacky
  // negative-margin trick.
  const isFullBleed = location.pathname === '/messages'

  // Prompt 578 — clients get the fixed CRM-shaped nav (same for everyone);
  // every other role renders NAV_GROUPS untouched. Nav shape no longer
  // depends on the client's deal at all — pages call useMyDeal themselves
  // for their own content.
  const isClient = profile?.role === 'client'
  const navGroups = isClient ? CLIENT_NAV_GROUPS : NAV_GROUPS

  // Prompt 589 — registered by a page via usePageHeader; null on every
  // page that doesn't call it, which is every page except My Pipeline.
  const [pageHeader, setPageHeader] = useState(null)

  return (
    <PageHeaderContext.Provider value={setPageHeader}>
    <div className="min-h-screen bg-base">
      {/* Fixed via inset-y-0 rather than height:100vh — top/bottom anchoring
          avoids the sidebar's height disagreeing with the viewport by a
          device-pixel or two on some displays, which is what let it get
          dragged into page scroll on long pages (Prompt 441 bug). */}
      <aside className="fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-line bg-elevated">
        {/* Prompt 503 — icon added next to the existing wordmark, matching
            restorix-marketing's own Nav.jsx icon+wordmark convention
            (Prompt 498: gap-2.5, h-8 w-auto — not h-8 w-8, since the
            source PNG isn't perfectly square and a fixed square box would
            silently squish it). Prompt 503 shipped a violet-recolored
            variant to keep the portal visually distinct from the
            marketing site's icon; Prompt 504 dropped that idea and
            reverted `logo-icon.png` back to the original teal/mint asset
            both sites now share again — same file, not a new one. */}
        {/* Prompt 549 — logo + wordmark are brand-driven now (useBrand,
            resolved from the portal's hostname). Behavioral health keeps the
            exact same PNG + "Restorix Portal" text; Suretix has no logo
            asset yet so it renders the plain-text wordmark alone. */}
        {/* Prompt 622 — border-b added here (lining up with the header's own
            h-16 border-b across the page) since AccountPopover's wrapper no
            longer draws the divider at the bottom of the sidebar. */}
        <div className="flex h-16 items-center gap-2.5 border-b border-line px-5">
          {brand.logo_url && <img src={brand.logo_url} alt="" className="h-8 w-auto" />}
          <span className="font-display text-lg font-semibold tracking-tight text-fg-primary">{brand.wordmark}</span>
        </div>

        {/* Prompt 622 — pt-2 added so the TODAY label isn't flush against
            the new divider line above.
            Prompt 623 — dropped `flex-1`: this nav no longer needs to yield
            space to the footer below it. It now sizes to its own content
            and the footer wrapper (`mt-auto` below) pins itself to the
            bottom of the `<aside>` independently, so the account card
            expanding/collapsing no longer shifts the nav links, group
            labels, or the divider under the logo at all. */}
        <nav className="space-y-4 px-3 pt-2">
          {navGroups.map(({ label: groupLabel, items }) => {
            const visible = items.filter((l) => l.roles.includes(profile?.role))
            if (visible.length === 0) return null
            return (
              <div key={groupLabel}>
                <p className="eyebrow !text-fg-faint px-3 pb-1.5">{groupLabel}</p>
                <div className="space-y-1">
                  {visible.map((item) => (
                    <NavItemLink key={item.to} {...item} label={item.labelByRole?.[profile?.role] || item.label} />
                  ))}
                </div>
              </div>
            )
          })}
        </nav>

        {/* Prompt 623 — icon-button row + AccountPopover wrapped together
            and pinned to the bottom of the `<aside>` via `mt-auto` on this
            wrapper, independent of `<nav>` above (see its own comment).
            Growing/shrinking the account card only moves this wrapper's
            own contents (the icon row shifts up a little), never anything
            above it. */}
        <div className="mt-auto">
          {/* Prompt 531 — moved from stacked (Prompt 528) to opposite ends of
              this same row, per Brayden's revised spec ("move one to one
              corner, the other to the other corner"). `px-5` matches the
              logo block's own edge padding above so both buttons align to
              the sidebar's real left/right edges. Sits directly above the
              existing divider line (drawn by AccountPopover's own border-t). */}
          {/* Prompt 549 — closer-only Swap button sat between Report a Bug
              and Add to Home Screen (the nav landmark Brayden named as "the
              phone button"). Non-closers keep the original two-corner row. */}
          {/* Prompt 622 — SwapButton rotated out of use for now ("we're gonna
              kind of rotate out of use like the sure text thing for now" —
              Brayden). Not a removal: SwapButton is still defined below,
              fully working, just unrendered — currently unused, re-enable by
              rendering <SwapButton /> between the two buttons below.
              Prompt 623 — `pb-3 pt-1` tightened to `pb-1` (bottom padding
              only) to close the gap to the account card directly below;
              the card's own `p-3` wrapper padding already supplies the top
              spacing this row needs. */}
          <div className="flex items-center justify-between px-5 pb-1">
            <SidebarIconButton icon={Bug} label="Report a Bug" onClick={() => setShowBugReport(true)} />
            <SidebarIconButton icon={Smartphone} label="Add to Home Screen" onClick={() => setShowAddToHome(true)} />
          </div>

          <AccountPopover profile={profile} onSignOut={signOut} />
        </div>
      </aside>

      {showBugReport && <BugReportModal onClose={() => setShowBugReport(false)} />}
      {showAddToHome && <AddToHomeScreenModal onClose={() => setShowAddToHome(false)} />}

      {/* Prompt 500 — dot-network background, mounted once here rather than
          per-page, since Layout persists across route changes (<Outlet/>
          swaps only the routed child) — one canvas for the whole session,
          not 16. Fixed and sized to the viewport-visible content region
          only (left-60 matches the sidebar's own width, not the page's
          full scrollable height) so cost stays constant regardless of how
          long any given page's content is — Pipeline/Messages can be very
          tall, and re-sizing/compositing a canvas that tall on every frame
          would be real, avoidable cost this shorter-lived marketing-hero
          version never had to consider. z-0 against the content column's
          z-10 (same explicit z-index pattern restorix-marketing's own
          Hero.jsx already uses for its background/content split) rather
          than a negative z-index against unpositioned in-flow content,
          which paints in a different, easy-to-get-backwards order. */}
      <div className="pointer-events-none fixed inset-y-0 left-60 right-0 z-0 overflow-hidden">
        <ParticleField className="h-full w-full" />
      </div>

      <div className="relative z-10 ml-60 flex min-h-screen flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-line bg-elevated px-6">
          {pageHeader ? (
            // Prompt 590 — title + subtitle render on one line (Ohvara's
            // "My Policies  Your whole book of business" look), not stacked
            // as 589 shipped it. Shared here so every page adopting
            // usePageHeader gets the fix at once, no per-page styling.
            <div className="flex min-w-0 items-baseline gap-2">
              <h1 className="truncate font-display text-lg font-medium text-fg-primary">{pageHeader.title}</h1>
              {pageHeader.subtitle && (
                <p className="truncate font-sans text-sm text-fg-secondary">{pageHeader.subtitle}</p>
              )}
            </div>
          ) : (
            <div />
          )}
          <div className="flex items-center gap-3">
            <NotificationBell />
            <HeaderName profile={profile} />
          </div>
        </header>
        {isFullBleed ? (
          // Prompt 456: flex container, not just a sizing wrapper — a
          // block-level <main> here would give its child a `height:100%`
          // that fails to resolve against a flex-grown ancestor (confirmed
          // live: it silently collapsed to content height instead of
          // filling the viewport). Messages.jsx's own root uses `flex-1`
          // for the same reason, not `h-full`.
          <main className="flex flex-1 flex-col overflow-hidden">
            <Outlet />
          </main>
        ) : (
          <main className="flex-1 px-6 py-8">
            <div className="mx-auto max-w-7xl">
              <Outlet />
            </div>
          </main>
        )}
      </div>
    </div>
    </PageHeaderContext.Provider>
  )
}
