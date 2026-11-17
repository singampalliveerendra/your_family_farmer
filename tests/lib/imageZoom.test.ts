import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  clampZoom, containSize, clampPan, zoomAt, doubleTapZoom, swipeTarget, distance,
  MAX_ZOOM, DOUBLE_TAP_ZOOM, RESET,
} from '@/lib/imageZoom'

describe('clampZoom', () => {
  it('keeps zoom between 1x and the max', () => {
    expect(clampZoom(0.3)).toBe(1)
    expect(clampZoom(2)).toBe(2)
    expect(clampZoom(50)).toBe(MAX_ZOOM)
    expect(clampZoom(NaN)).toBe(1)
  })
})

describe('containSize', () => {
  it('fits a tall label photo inside a phone screen without cropping', () => {
    expect(containSize(369, 800, 390, 700)).toEqual({ w: 369 * (700 / 800), h: 700 })
  })
  it('fits a wide photo by width', () => {
    expect(containSize(800, 400, 400, 700)).toEqual({ w: 400, h: 200 })
  })
  it('falls back to the viewer size when the photo size is unknown', () => {
    expect(containSize(0, 0, 390, 700)).toEqual({ w: 390, h: 700 })
  })
})

describe('clampPan', () => {
  const view = { w: 400, h: 700 }
  const fit = { w: 400, h: 400 }
  it('cannot move an unzoomed photo', () => {
    expect(clampPan({ scale: 1, x: 120, y: -80 }, fit, view)).toEqual({ scale: 1, x: 0, y: 0 })
  })
  it('lets a zoomed photo move only until its edge meets the screen edge', () => {
    // 2x: 800 wide in a 400 view → 200 each side; 800 tall in 700 → 50.
    expect(clampPan({ scale: 2, x: 999, y: -999 }, fit, view)).toEqual({ scale: 2, x: 200, y: -50 })
    expect(clampPan({ scale: 2, x: 50, y: 10 }, fit, view)).toEqual({ scale: 2, x: 50, y: 10 })
  })
})

describe('zoomAt', () => {
  it('keeps the point under the finger in place', () => {
    const next = zoomAt(RESET, 2, 100, 50)
    // The point (100, 50) maps to image point (100, 50) before and after.
    expect((100 - next.x) / next.scale).toBeCloseTo(100 / 1)
    expect((50 - next.y) / next.scale).toBeCloseTo(50 / 1)
  })
  it('zooming back to 1x recentres the photo', () => {
    expect(zoomAt({ scale: 3, x: 40, y: 40 }, 0.5, 10, 10)).toEqual(RESET)
  })
  it('never goes past the max', () => {
    expect(zoomAt(RESET, 99, 0, 0).scale).toBe(MAX_ZOOM)
  })
})

describe('doubleTapZoom', () => {
  it('zooms in on the tapped spot', () => {
    const z = doubleTapZoom(RESET, 0, 0)
    expect(z).toEqual({ scale: DOUBLE_TAP_ZOOM, x: 0, y: 0 })
  })
  it('zooms back out when already zoomed', () => {
    expect(doubleTapZoom({ scale: 2.5, x: 30, y: 30 }, 0, 0)).toEqual(RESET)
  })
})

describe('swipeTarget', () => {
  it('a long swipe left goes to the next photo, right to the previous', () => {
    expect(swipeTarget(0, -120, 3, 390)).toBe(1)
    expect(swipeTarget(2, 120, 3, 390)).toBe(1)
  })
  it('a short drag snaps back', () => {
    expect(swipeTarget(1, -20, 3, 390)).toBe(1)
  })
  it('stops at the first and last photo', () => {
    expect(swipeTarget(0, 200, 3, 390)).toBe(0)
    expect(swipeTarget(2, -200, 3, 390)).toBe(2)
  })
})

describe('distance', () => {
  it('measures between two fingers', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5)
  })
})

describe('produce galleries open the zoom viewer', () => {
  const read = (p: string) => readFileSync(join(__dirname, '../..', p), 'utf8')
  for (const page of ['src/app/consumer/produce/[id]/page.tsx', 'src/app/consumer/harvest/[harvestId]/page.tsx']) {
    it(page, () => {
      const src = read(page)
      expect(src).toMatch(/import ImageViewer from '@\/components\/ImageViewer'/)
      expect(src).toMatch(/onClick=\{\(\) => setViewerAt\(i\)\}/)
      expect(src).toMatch(/<ImageViewer images=\{gallery\} startIndex=\{viewerAt\}/)
    })
  }
  it('the viewer closes on phone Back and shows the whole photo', () => {
    const src = read('src/components/ImageViewer.tsx')
    expect(src).toMatch(/useBackToClose\(true, onClose\)/)
    expect(src).toMatch(/object-contain/)
    expect(src).toMatch(/touchAction: 'none'/)
  })
})
