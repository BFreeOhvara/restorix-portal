import { useEffect, useRef } from 'react'
import { useBrand } from '../../hooks/useBrand'

// Prompt 552 — brand-aware accent. Canvas fillStyle/strokeStyle can't read
// CSS custom properties, so the rgba values are hardcoded (same reason the
// inline notes below already give). Each pair mirrors that brand's existing
// --accent / --accent-bright token values from index.css — NOT the Prompt
// 552 logo-icon colors, which are a separate, narrower brand element. The
// marketing site's own ParticleField made the same blue→amber swap in
// Prompt 550.
const BRAND_PARTICLES = {
  // --accent #3a63d6 / --accent-bright #7c9eff
  behavioral_health: { line: '58, 99, 214', dot: 'rgba(124, 158, 255, 0.6)' },
  // Suretix --accent #b45309 / --accent-bright #f59e0b
  bail_bonds: { line: '180, 83, 9', dot: 'rgba(245, 158, 11, 0.6)' },
}

const DOT_COUNT = 42
const LINK_DISTANCE = 250
const LINK_OPACITY = 0.28
const LINE_WIDTH = 1.25
const SPEED = 0.12
const REPEL_RADIUS = 90
const REPEL_STRENGTH = 42
const EASE = 0.12

// Prompt 500 — ported from restorix-marketing's own ParticleField.jsx
// (Prompt 467/490/496 lineage) rather than rebuilt, per that project's own
// standing preference for reusing already-solved code over reinventing it.
// Mounted once in Layout.jsx behind every portal page — not per-page, since
// Layout persists across route changes (React Router's <Outlet/> swaps only
// the routed child), so this is a single canvas for the whole session, not
// 16 separate instances.
//
// One genuine difference from the marketing version, not a copy-paste
// artifact: this runs on a working tool someone may leave open for hours,
// not a one-time landing-page impression, so it also pauses on
// `document.visibilitychange` (backgrounded browser tab) in addition to
// the marketing version's IntersectionObserver pause (scrolled out of
// view) — the marketing hero rarely leaves the viewport for long on a
// single-page scroll, but a dashboard tab left open in the background for
// hours is exactly the case IntersectionObserver alone doesn't cover
// (a `position:fixed` background layer scoped to the viewport is visible
// to IntersectionObserver essentially all the time it's on-screen at all,
// regardless of which browser tab has focus).
export default function ParticleField({ className = '' }) {
  const canvasRef = useRef(null)
  const mouseRef = useRef({ x: -9999, y: -9999 })
  const { niche } = useBrand()
  const particles = BRAND_PARTICLES[niche] || BRAND_PARTICLES.behavioral_health

  useEffect(() => {
    const canvas = canvasRef.current
    const parent = canvas?.parentElement
    if (!canvas || !parent) return

    const ctx = canvas.getContext('2d')
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    let width = 0
    let height = 0
    let dots = []
    let rafId = null

    function resize() {
      const rect = parent.getBoundingClientRect()
      width = rect.width
      height = rect.height
      canvas.width = width * dpr
      canvas.height = height * dpr
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    function seed() {
      dots = Array.from({ length: DOT_COUNT }, () => {
        const x = Math.random() * width
        const y = Math.random() * height
        return {
          x, y,
          rx: x, ry: y,
          vx: (Math.random() - 0.5) * SPEED,
          vy: (Math.random() - 0.5) * SPEED,
          r: Math.random() * 2.6 + 1.1,
        }
      })
    }

    function draw(animate) {
      ctx.clearRect(0, 0, width, height)
      const mouse = mouseRef.current
      for (const d of dots) {
        if (animate) {
          d.x += d.vx
          d.y += d.vy
          if (d.x < 0 || d.x > width) d.vx *= -1
          if (d.y < 0 || d.y > height) d.vy *= -1
        }

        let targetX = d.x
        let targetY = d.y
        const distX = d.x - mouse.x
        const distY = d.y - mouse.y
        const dist = Math.hypot(distX, distY)
        if (dist < REPEL_RADIUS && dist > 0.01) {
          const force = (1 - dist / REPEL_RADIUS) * REPEL_STRENGTH
          targetX += (distX / dist) * force
          targetY += (distY / dist) * force
        }

        if (animate) {
          d.rx += (targetX - d.rx) * EASE
          d.ry += (targetY - d.ry) * EASE
        } else {
          d.rx = targetX
          d.ry = targetY
        }
      }

      for (let i = 0; i < dots.length; i++) {
        for (let j = i + 1; j < dots.length; j++) {
          const a = dots[i]
          const b = dots[j]
          const dist = Math.hypot(a.rx - b.rx, a.ry - b.ry)
          if (dist < LINK_DISTANCE) {
            // rgb triple mirrors the active brand's --accent (see
            // BRAND_PARTICLES) — hardcoded because canvas strokeStyle can't
            // resolve CSS custom properties.
            ctx.strokeStyle = `rgba(${particles.line}, ${LINK_OPACITY * (1 - dist / LINK_DISTANCE)})`
            ctx.lineWidth = LINE_WIDTH
            ctx.beginPath()
            ctx.moveTo(a.rx, a.ry)
            ctx.lineTo(b.rx, b.ry)
            ctx.stroke()
          }
        }
      }
      // mirrors the active brand's --accent-bright, same reason as above.
      ctx.fillStyle = particles.dot
      for (const d of dots) {
        ctx.beginPath()
        ctx.arc(d.rx, d.ry, d.r, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    function loop() {
      draw(true)
      rafId = requestAnimationFrame(loop)
    }

    function stopLoop() {
      if (rafId != null) {
        cancelAnimationFrame(rafId)
        rafId = null
      }
    }

    function startLoop() {
      if (rafId == null && !document.hidden) rafId = requestAnimationFrame(loop)
    }

    let seeded = false

    const sizeObserver = new ResizeObserver(() => {
      resize()
      if (!seeded && width > 0 && height > 0) {
        seed()
        seeded = true
      }
      draw(false)
    })
    sizeObserver.observe(parent)

    function onPointerMove(e) {
      const rect = canvas.getBoundingClientRect()
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    }
    function onPointerLeave() {
      mouseRef.current = { x: -9999, y: -9999 }
    }
    if (!reduceMotion) {
      parent.addEventListener('pointermove', onPointerMove)
      parent.addEventListener('pointerleave', onPointerLeave)
    }

    let intersectionObserver = null
    function onVisibilityChange() {
      if (document.hidden) stopLoop()
      else startLoop()
    }
    if (!reduceMotion) {
      intersectionObserver = new IntersectionObserver(([entry]) => {
        if (entry.isIntersecting) startLoop()
        else stopLoop()
      })
      intersectionObserver.observe(canvas)
      document.addEventListener('visibilitychange', onVisibilityChange)
    }

    return () => {
      sizeObserver.disconnect()
      stopLoop()
      if (intersectionObserver) intersectionObserver.disconnect()
      document.removeEventListener('visibilitychange', onVisibilityChange)
      parent.removeEventListener('pointermove', onPointerMove)
      parent.removeEventListener('pointerleave', onPointerLeave)
    }
    // Re-init on brand switch (e.g. the ?brand= preview override or a
    // cross-domain Swap) so the loop closure picks up the new rgba pair.
  }, [particles.line, particles.dot])

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />
}
