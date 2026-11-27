import { describe, expect, it } from 'vitest'
import {
  dismiss,
  dismissalsStorageKey,
  isDismissed,
  pruneDismissals,
  readDismissals,
  writeDismissals,
} from '@/lib/lowStockDismissals'

/** Minimal in-memory Storage (tests run in node, no window.localStorage). */
function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  }
}

describe('low-stock alert dismissals', () => {
  it('a dismissed alert stays dismissed at the same minimum, even as stock keeps falling', () => {
    const d = dismiss({}, 'atukulu', 25)
    expect(isDismissed(d, 'atukulu', 25)).toBe(true)
    // Stock is not part of the key, so further sales do not re-show it.
    expect(isDismissed(pruneDismissals(d, ['atukulu']), 'atukulu', 25)).toBe(true)
  })

  it('comes back when the farmer changes the minimum', () => {
    const d = dismiss({}, 'atukulu', 25)
    expect(isDismissed(d, 'atukulu', 20)).toBe(false)
  })

  it('is forgotten once stock recovers, so the next drop alerts again', () => {
    const d = dismiss(dismiss({}, 'atukulu', 25), 'rice', 50)
    const pruned = pruneDismissals(d, ['rice']) // atukulu is no longer low
    expect(pruned).toEqual({ rice: 50 })
    expect(isDismissed(pruned, 'atukulu', 25)).toBe(false)
  })

  it('pruning returns the same object when nothing changed', () => {
    const d = dismiss({}, 'rice', 50)
    expect(pruneDismissals(d, ['rice', 'other'])).toBe(d)
  })

  it('only affects the dismissed produce', () => {
    const d = dismiss({}, 'atukulu', 25)
    expect(isDismissed(d, 'rice', 25)).toBe(false)
  })

  describe('storage', () => {
    it('round-trips per farmer', () => {
      const s = memoryStorage()
      writeDismissals(s, 'farmer-1', { atukulu: 25 })
      expect(readDismissals(s, 'farmer-1')).toEqual({ atukulu: 25 })
      expect(readDismissals(s, 'farmer-2')).toEqual({})
    })

    it('removes the key when nothing is dismissed', () => {
      const s = memoryStorage()
      writeDismissals(s, 'f', { a: 1 })
      writeDismissals(s, 'f', {})
      expect(s.data.has(dismissalsStorageKey('f'))).toBe(false)
    })

    it.each(['not json', '[1,2]', 'null', '"text"'])('treats corrupt data %j as nothing dismissed', (raw) => {
      expect(readDismissals(memoryStorage({ [dismissalsStorageKey('f')]: raw }), 'f')).toEqual({})
    })

    it('drops entries whose minimum is not a number', () => {
      const s = memoryStorage({ [dismissalsStorageKey('f')]: JSON.stringify({ a: 25, b: 'x', c: null }) })
      expect(readDismissals(s, 'f')).toEqual({ a: 25 })
    })

    it('never throws when storage is unavailable or full', () => {
      const broken = {
        getItem: () => {
          throw new Error('blocked')
        },
        setItem: () => {
          throw new Error('full')
        },
        removeItem: () => {
          throw new Error('blocked')
        },
      }
      expect(readDismissals(broken, 'f')).toEqual({})
      expect(() => writeDismissals(broken, 'f', { a: 1 })).not.toThrow()
      expect(readDismissals(null, 'f')).toEqual({})
    })
  })
})
