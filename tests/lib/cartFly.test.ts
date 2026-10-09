import { describe, it, expect } from 'vitest'
import { flightKeyframes, tapStillFresh, TAP_WINDOW_MS } from '@/lib/cartFly'

// The "fly to cart" toss: the added item's emoji travels from the tapped
// button into the View cart bar, so a buyer's eye lands where the order is
// placed. A wrong path (starting off-screen, ending beside the cart) teaches
// the opposite of what it's for.

const parse = (k: Keyframe) => {
  const m = /translate\(([-\d.]+)px, ([-\d.]+)px\) scale\(([-\d.]+)\)/.exec(String(k.transform))!
  return { x: Number(m[1]), y: Number(m[2]), scale: Number(m[3]) }
}

describe('flightKeyframes', () => {
  const from = { x: 300, y: 400 }
  const to = { x: 40, y: 780 }
  const size = 44
  const frames = flightKeyframes(from, to, size)

  it('starts on the tap and ends on the cart icon (bubble centred on both)', () => {
    const a = parse(frames[0])
    const b = parse(frames[frames.length - 1])
    expect(a.x + size / 2).toBeCloseTo(from.x, 1)
    expect(a.y + size / 2).toBeCloseTo(from.y, 1)
    expect(b.x + size / 2).toBeCloseTo(to.x, 1)
    expect(b.y + size / 2).toBeCloseTo(to.y, 1)
  })

  it('rises above the take-off point before dropping in, like a toss', () => {
    const topY = Math.min(...frames.map((f) => parse(f).y))
    expect(topY).toBeLessThan(parse(frames[0]).y)
  })

  it('still arcs upward when the button is level with the bar', () => {
    const level = flightKeyframes({ x: 300, y: 780 }, { x: 40, y: 780 }, size)
    expect(Math.min(...level.map((f) => parse(f).y))).toBeLessThan(780 - size / 2)
  })

  it('shrinks into the cart and fades only at the very end', () => {
    const last = frames[frames.length - 1]
    expect(parse(last).scale).toBeLessThan(parse(frames[0]).scale)
    expect(Number(last.opacity)).toBeLessThan(1)
    expect(frames.filter((f) => Number(f.offset) <= 0.9).every((f) => f.opacity === 1)).toBe(true)
  })

  it('has offsets running 0 → 1 in order', () => {
    const offsets = frames.map((f) => Number(f.offset))
    expect(offsets[0]).toBe(0)
    expect(offsets[offsets.length - 1]).toBe(1)
    expect([...offsets].sort((a, b) => a - b)).toEqual(offsets)
  })
})

describe('tapStillFresh', () => {
  it('counts an add that follows a tap within the window', () => {
    expect(tapStillFresh(1000, 1000)).toBe(true)
    expect(tapStillFresh(1000, 1000 + TAP_WINDOW_MS)).toBe(true)
  })

  // An add long after the tap (e.g. once a login sheet closes) would fly from
  // a spot the buyer has forgotten — skip the flight instead.
  it('ignores a stale tap, a missing tap, or a clock that went backwards', () => {
    expect(tapStillFresh(1000, 1001 + TAP_WINDOW_MS)).toBe(false)
    expect(tapStillFresh(null, 1000)).toBe(false)
    expect(tapStillFresh(2000, 1000)).toBe(false)
  })
})
