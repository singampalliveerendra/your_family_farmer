import { describe, it, expect } from 'vitest'
import { normalizeUrl, linkHost, isLikelyUrl } from '@/lib/links'

// Farmers paste their own social links on a phone, and those strings end up in
// an href on a PUBLIC page. Two things can go wrong: a scheme-less link
// navigates inside our own site instead of out to their channel, and a
// `javascript:` URL becomes stored XSS running in every visitor's browser.

describe('normalizeUrl', () => {
  // USE: the security case. These strings come from a free-text input and are
  // rendered as an anchor on a public farmer page — a `javascript:` href would
  // execute for every buyer who taps it. Anything that is not http(s) is
  // refused outright, so the caller simply hides the link.
  it('refuses every scheme except http and https', () => {
    expect(normalizeUrl('javascript:alert(1)')).toBeNull()
    expect(normalizeUrl('JavaScript:alert(1)')).toBeNull()
    expect(normalizeUrl('data:text/html,<script>alert(1)</script>')).toBeNull()
    expect(normalizeUrl('vbscript:msgbox(1)')).toBeNull()
    expect(normalizeUrl('file:///etc/passwd')).toBeNull()
  })

  // USE: what farmers actually type. Without the added scheme the browser reads
  // "youtube.com/@myfarm" as a relative path and lands them on
  // gogrameen.in/youtube.com/@myfarm — a 404 where their channel should be.
  it('adds https:// to the shorthand people actually type', () => {
    expect(normalizeUrl('youtube.com/@myfarm')).toBe('https://youtube.com/@myfarm')
    expect(normalizeUrl('  instagram.com/myfarm  ')).toBe('https://instagram.com/myfarm')
  })

  // USE: a properly typed link must survive untouched, including http for the
  // odd older site that has no TLS.
  it('leaves a well-formed link alone', () => {
    expect(normalizeUrl('https://www.facebook.com/gogrameen')).toBe('https://www.facebook.com/gogrameen')
    expect(normalizeUrl('http://example.org/')).toBe('http://example.org/')
  })

  // USE: an empty field is the normal state — most farmers fill in none of the
  // three social links — and must render nothing rather than a broken anchor.
  it('is null for an empty or missing value', () => {
    expect(normalizeUrl('')).toBeNull()
    expect(normalizeUrl('   ')).toBeNull()
    expect(normalizeUrl(null)).toBeNull()
    expect(normalizeUrl(undefined)).toBeNull()
  })

  // USE: unparseable junk must be dropped quietly, not thrown from a server
  // component rendering a public profile.
  it('is null for junk instead of throwing', () => {
    expect(normalizeUrl('http://')).toBeNull()
  })
})

describe('linkHost', () => {
  // USE: the compact label under a social icon on a 390px screen. Stripping
  // "www." keeps it short without losing meaning.
  it('shows the bare domain as a label', () => {
    expect(linkHost('youtube.com/@myfarm')).toBe('youtube.com')
    expect(linkHost('https://www.instagram.com/myfarm')).toBe('instagram.com')
  })

  // USE: it must apply the SAME scheme rules as normalizeUrl, or a rejected
  // link could still be labelled and look clickable.
  it('is null for anything normalizeUrl refuses', () => {
    expect(linkHost('javascript:alert(1)')).toBeNull()
    expect(linkHost(null)).toBeNull()
  })
})

describe('isLikelyUrl', () => {
  // USE: the inline hint under the form field, which nudges a farmer before
  // they save rather than after. It is deliberately loose — its job is catching
  // typos, not enforcing the rules normalizeUrl enforces.
  it('recognises link-shaped input, with or without a scheme', () => {
    expect(isLikelyUrl('youtube.com/@myfarm')).toBe(true)
    expect(isLikelyUrl('https://instagram.com/myfarm')).toBe(true)
  })

  // USE: plain text or a sentence with spaces is what a confused farmer types
  // into a URL field. Flagging it is the point.
  it('rejects plain text and anything with spaces', () => {
    expect(isLikelyUrl('my farm page')).toBe(false)
    expect(isLikelyUrl('myfarm')).toBe(false)
    expect(isLikelyUrl('')).toBe(false)
  })
})
