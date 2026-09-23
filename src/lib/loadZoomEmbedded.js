import reactUrl from '@zoom/meetingsdk/dist/lib/vendor/react.min.js?url'
import reactDomUrl from '@zoom/meetingsdk/dist/lib/vendor/react-dom.min.js?url'
import zoomEmbeddedUrl from '@zoom/meetingsdk/dist/zoom-meeting-embedded-ES5.min.js?url'

// Prompt 633 — TEMPORARY vendor-SDK workaround, remove once
// `@zoom/meetingsdk` ships real React 19 support.
//
// `@zoom/meetingsdk@6.5.0` (latest as of 2026-09-23) still peer-deps on
// react@18.3.1, and its embedded client can't run on this app's React 19:
//   1. Its bundled React 18 `react/jsx-runtime` reads
//      `React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentOwner`
//      at import time — React 19 removed that object ("Cannot read
//      properties of undefined (reading 'ReactCurrentOwner')").
//   2. Backfilling that object (the shim Zoom staff posted on the devforum)
//      gets past import, but every element that runtime creates is a
//      React 18 `react.element`, which React 19 refuses to render ("A React
//      Element from an older version of React was rendered") the moment
//      join() mounts the UI. Verified in a local harness — not fixable by
//      patching internals.
// So instead of `import('@zoom/meetingsdk/embedded')` (which uses the app's
// React 19), this loads the SDK's own self-contained build against the
// React 18.3.1 UMD copies the package itself vendors — all self-hosted from
// node_modules, no CDN. Those set `window.React`/`window.ReactDOM` (React
// 18); the app's React 19 is a bundled module and never reads them.
//
// See devforum.zoom.us threads "React 19 not supported with embedded SDK"
// and "Meeting SDK not loading the meeting with React 19". Check
// `npm view @zoom/meetingsdk peerDependencies` periodically — once it
// allows react 19, delete this file and go back to the dynamic import.
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-zoom-sdk="${src}"]`)
    if (existing?.dataset.loaded) return resolve()
    const el = existing || document.createElement('script')
    el.addEventListener('load', () => {
      el.dataset.loaded = 'true'
      resolve()
    })
    el.addEventListener('error', () => reject(new Error('Failed to load the Zoom SDK.')))
    if (!existing) {
      el.src = src
      el.dataset.zoomSdk = src
      document.head.appendChild(el)
    }
  })
}

let loading = null

export function loadZoomEmbedded() {
  if (!loading) {
    loading = (async () => {
      await loadScript(reactUrl)
      await loadScript(reactDomUrl)
      await loadScript(zoomEmbeddedUrl)
      if (!window.ZoomMtgEmbedded) throw new Error('Failed to load the Zoom SDK.')
      return window.ZoomMtgEmbedded
    })().catch((e) => {
      loading = null
      throw e
    })
  }
  return loading
}
