import { describe, it, expect } from 'vitest'
import type { NextRequest } from 'next/server'
import { reqLang, tr } from '@/lib/serverLang'

// Telugu is the app-wide DEFAULT, not English (3de39aa). This module is the
// server half of that decision: API routes localise their error messages from
// the yff_lang cookie, and the cookie is missing on the very first request of a
// session — the client provider writes it from an effect, after the page has
// loaded. So the fallback here is the language an early error is actually shown
// in, and getting it backwards would greet a new Telugu user in English.

// reqLang only ever reads req.cookies.get(), so a stub is enough.
const req = (value?: string) =>
  ({ cookies: { get: () => (value === undefined ? undefined : { value }) } }) as unknown as NextRequest

describe('reqLang', () => {
  // The case that matters most: nobody has chosen yet and no cookie exists.
  // Telugu, not English.
  it('defaults to Telugu when the cookie has not been written yet', () => {
    expect(reqLang(req())).toBe('te')
  })

  // English is the opt-in, and only this exact value opts in.
  it('returns English only for an explicit en', () => {
    expect(reqLang(req('en'))).toBe('en')
  })

  // A saved Telugu choice reads the same as no choice at all.
  it('returns Telugu for an explicit te', () => {
    expect(reqLang(req('te'))).toBe('te')
  })

  // A stale, truncated or hand-edited cookie falls back to the default rather
  // than to English — a junk value must not quietly flip the app's language.
  it('falls back to Telugu for an unrecognised cookie value', () => {
    for (const v of ['', 'EN', 'english', 'te-IN', 'null', 'undefined', 'hi']) {
      expect(reqLang(req(v))).toBe('te')
    }
  })
})

describe('tr', () => {
  // Picks the Telugu side under te and the English side under en. This is the
  // server-side twin of the client's L() helper.
  it('picks the side matching the language', () => {
    expect(tr('te', 'Out of stock', 'స్టాక్ లేదు')).toBe('స్టాక్ లేదు')
    expect(tr('en', 'Out of stock', 'స్టాక్ లేదు')).toBe('Out of stock')
  })
})
