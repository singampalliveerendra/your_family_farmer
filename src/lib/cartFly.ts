// The "fly to cart" motion: when a buyer adds something, its emoji lifts off
// the button they tapped and drops into the View cart bar along a short arc,
// so the eye follows the item to where the order is placed. Pure maths here
// (testable without a browser); CartFab in components/consumer/Cart.tsx runs
// it with the Web Animations API.

export type Point = { x: number; y: number }

/**
 * Keyframes for a quadratic-Bezier arc from `from` to `to` (both viewport
 * centres). The control point sits above the higher of the two ends, so the
 * item always rises first and then drops in — like a toss — whether the add
 * button is above the bar (usual) or level with it. `size` is the flying
 * bubble's diameter; translate positions its top-left corner.
 */
export function flightKeyframes(from: Point, to: Point, size = 44, steps = 14): Keyframe[] {
  const lift = Math.max(80, Math.abs(to.x - from.x) * 0.35)
  const ctrl: Point = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - lift }
  const frames: Keyframe[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const u = 1 - t
    const x = u * u * from.x + 2 * u * t * ctrl.x + t * t * to.x
    const y = u * u * from.y + 2 * u * t * ctrl.y + t * t * to.y
    // Pops slightly on take-off, shrinks into the cart on landing.
    const scale = t < 0.15 ? 1 + t * 1.3 : 1.2 - 0.75 * ((t - 0.15) / 0.85)
    frames.push({
      offset: t,
      transform: `translate(${round(x - size / 2)}px, ${round(y - size / 2)}px) scale(${round(scale)})`,
      opacity: t > 0.9 ? round(1 - (t - 0.9) * 6) : 1,
    })
  }
  return frames
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}

// How long after a tap an add still counts as "from that tap". Adding from the
// harvest table fetches the listing first, which on slow 4G can take a few
// seconds; anything later (e.g. after a login sheet) just skips the flight.
export const TAP_WINDOW_MS = 4000

export function tapStillFresh(tapAt: number | null, now: number): boolean {
  return tapAt != null && now - tapAt >= 0 && now - tapAt <= TAP_WINDOW_MS
}
