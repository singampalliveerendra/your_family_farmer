import { describe, it, expect } from 'vitest'
import { nextBackStack, canGoBack, isSameOriginReferrer } from '@/lib/backNav'

describe('nextBackStack', () => {
  it('starts with the first page', () => {
    expect(nextBackStack([], '/consumer', true)).toEqual(['/consumer'])
  })

  it('pushes a page reached by a normal link', () => {
    expect(nextBackStack(['/consumer'], '/consumer/produce/1', true)).toEqual(['/consumer', '/consumer/produce/1'])
  })

  it('pops when the user goes back to the page behind', () => {
    expect(nextBackStack(['/consumer', '/consumer/produce/1'], '/consumer', false)).toEqual(['/consumer'])
  })

  it('swaps the top on a replace (history did not grow)', () => {
    expect(nextBackStack(['/consumer', '/farmer/login'], '/farmer/dashboard', false)).toEqual(['/consumer', '/farmer/dashboard'])
  })

  it('ignores a re-render of the same page', () => {
    const stack = ['/consumer', '/consumer/orders']
    expect(nextBackStack(stack, '/consumer/orders', true)).toBe(stack)
  })

  it('keeps going back step by step through a deep trail', () => {
    let s = ['/consumer']
    s = nextBackStack(s, '/consumer/orders', true)
    s = nextBackStack(s, '/consumer/orders/9', true)
    s = nextBackStack(s, '/consumer/orders', false)
    expect(s).toEqual(['/consumer', '/consumer/orders'])
    s = nextBackStack(s, '/consumer', false)
    expect(s).toEqual(['/consumer'])
    expect(canGoBack(s)).toBe(false)
  })

  it('caps the depth', () => {
    let s: string[] = []
    for (let i = 0; i < 80; i++) s = nextBackStack(s, `/p/${i}`, true)
    expect(s.length).toBe(50)
    expect(s[s.length - 1]).toBe('/p/79')
  })
})

describe('canGoBack', () => {
  it('is false on the first page of a visit', () => {
    expect(canGoBack([])).toBe(false)
    expect(canGoBack(['/consumer/produce/1'])).toBe(false)
  })

  it('is true with an in-app page behind', () => {
    expect(canGoBack(['/consumer', '/consumer/produce/1'])).toBe(true)
  })
})

describe('isSameOriginReferrer', () => {
  const origin = 'https://gogrameen.in'
  it('accepts our own pages', () => {
    expect(isSameOriginReferrer('https://gogrameen.in/consumer', origin)).toBe(true)
  })
  it('rejects other sites, empty and junk referrers', () => {
    expect(isSameOriginReferrer('https://wa.me/123', origin)).toBe(false)
    expect(isSameOriginReferrer('', origin)).toBe(false)
    expect(isSameOriginReferrer('not a url', origin)).toBe(false)
  })
})
