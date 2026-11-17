// Zoom maths for the full-screen photo viewer (src/components/ImageViewer.tsx).
// Kept pure so it can be tested without a browser.
//
// The image is drawn with transform `translate(x, y) scale(s)` around its
// centre. Points (fx, fy) are measured from the centre of the viewer, so the
// untouched state is { scale: 1, x: 0, y: 0 }.

export type ZoomState = { scale: number; x: number; y: number }

export const MIN_ZOOM = 1
// 5x is enough to read the small print on a pack label from an 800–1280px photo.
export const MAX_ZOOM = 5
export const DOUBLE_TAP_ZOOM = 2.5
export const RESET: ZoomState = { scale: 1, x: 0, y: 0 }

export function clampZoom(scale: number): number {
  if (!Number.isFinite(scale)) return MIN_ZOOM
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale))
}

// Size the photo takes at scale 1 when it is fitted inside the viewer
// (object-contain): the whole photo shows, nothing cropped.
export function containSize(natW: number, natH: number, viewW: number, viewH: number): { w: number; h: number } {
  if (natW <= 0 || natH <= 0 || viewW <= 0 || viewH <= 0) return { w: viewW, h: viewH }
  const k = Math.min(viewW / natW, viewH / natH)
  return { w: natW * k, h: natH * k }
}

// Stops the photo being dragged off-screen: an edge can come in only as far as
// the viewer's edge, and a side smaller than the viewer stays centred.
export function clampPan(
  s: ZoomState,
  fit: { w: number; h: number },
  view: { w: number; h: number },
): ZoomState {
  const maxX = Math.max(0, (fit.w * s.scale - view.w) / 2)
  const maxY = Math.max(0, (fit.h * s.scale - view.h) / 2)
  const clamp = (v: number, m: number) => (m === 0 ? 0 : Math.min(m, Math.max(-m, v)))
  return { scale: s.scale, x: clamp(s.x, maxX), y: clamp(s.y, maxY) }
}

// Zooms to `nextScale` keeping the point under the finger (fx, fy) still.
export function zoomAt(prev: ZoomState, nextScale: number, fx: number, fy: number): ZoomState {
  const scale = clampZoom(nextScale)
  if (scale === MIN_ZOOM) return RESET
  const r = scale / prev.scale
  return { scale, x: fx - (fx - prev.x) * r, y: fy - (fy - prev.y) * r }
}

// Double-tap: zoom in on the tapped spot, or back out if already zoomed.
export function doubleTapZoom(prev: ZoomState, fx: number, fy: number): ZoomState {
  return prev.scale > 1.01 ? RESET : zoomAt(prev, DOUBLE_TAP_ZOOM, fx, fy)
}

export function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

// Which photo a sideways swipe lands on (only used when not zoomed).
// A short drag snaps back; it never runs past the first or last photo.
export function swipeTarget(index: number, dx: number, count: number, viewW: number): number {
  const threshold = Math.min(80, viewW * 0.18)
  if (dx <= -threshold) return Math.min(count - 1, index + 1)
  if (dx >= threshold) return Math.max(0, index - 1)
  return index
}
