import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Share, MoreVertical } from 'lucide-react'
import Modal from './ui/Modal'

// Prompt 528 — real device detection, not a guess from viewport width
// (a resized desktop window shouldn't be treated as "on mobile" here).
// Matches on the UA substrings both platforms actually send.
function detectMobileOS() {
  const ua = navigator.userAgent || ''
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  return null
}

function InstallSteps({ os, highlight }) {
  const isAndroid = os === 'android'
  return (
    <div
      className={`rounded-lg border p-4 ${
        highlight === os ? 'border-accent bg-accent/5' : 'border-line'
      }`}
    >
      <p className="flex items-center gap-2 font-sans text-sm font-semibold text-fg-primary">
        {isAndroid ? <MoreVertical size={15} /> : <Share size={15} />}
        {isAndroid ? 'Android (Chrome)' : 'iPhone (Safari)'}
      </p>
      <ol className="mt-2 list-decimal space-y-1 pl-4 font-sans text-xs text-fg-secondary">
        {isAndroid ? (
          <>
            <li>Open this page in Chrome</li>
            <li>Tap the <strong className="text-fg-primary">⋮</strong> menu, top right</li>
            <li>Tap <strong className="text-fg-primary">Add to Home screen</strong></li>
            <li>Tap <strong className="text-fg-primary">Add</strong> to confirm</li>
          </>
        ) : (
          <>
            <li>Open this page in Safari</li>
            <li>Tap the <strong className="text-fg-primary">Share</strong> icon (square with an arrow)</li>
            <li>Scroll down and tap <strong className="text-fg-primary">Add to Home Screen</strong></li>
            <li>Tap <strong className="text-fg-primary">Add</strong>, top right</li>
          </>
        )}
      </ol>
    </div>
  )
}

export default function AddToHomeScreenModal({ onClose }) {
  const [mobileOS] = useState(detectMobileOS)
  const [qrDataUrl, setQrDataUrl] = useState(null)
  const isMobile = mobileOS !== null

  // Prompt 528 — skip generating a QR code at all on a device that's
  // already on this page; scanning a code on the same screen you're
  // reading it on doesn't make sense.
  useEffect(() => {
    if (isMobile) return
    let cancelled = false
    QRCode.toDataURL(window.location.origin, { margin: 1, width: 192 })
      .then((url) => { if (!cancelled) setQrDataUrl(url) })
      .catch(() => { if (!cancelled) setQrDataUrl(null) })
    return () => { cancelled = true }
  }, [isMobile])

  return (
    <Modal title="Add to Home Screen" onClose={onClose} width="max-w-lg">
      {!isMobile && (
        <div className="mb-5 flex flex-col items-center gap-2 border-b border-line pb-5">
          {qrDataUrl ? (
            <img src={qrDataUrl} alt="QR code linking to this portal" className="h-40 w-40 rounded-lg border border-line" />
          ) : (
            <div className="flex h-40 w-40 items-center justify-center rounded-lg border border-line bg-surface">
              <p className="font-sans text-xs text-fg-faint">Generating…</p>
            </div>
          )}
          <p className="font-sans text-xs text-fg-secondary">Scan with your phone's camera to open this portal</p>
        </div>
      )}
      <p className="font-sans text-sm text-fg-secondary">
        {isMobile ? 'Add this portal to your home screen for one-tap access:' : 'Then, on your phone:'}
      </p>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <InstallSteps os="android" highlight={mobileOS} />
        <InstallSteps os="ios" highlight={mobileOS} />
      </div>
    </Modal>
  )
}
