import { describe, it, expect } from 'vitest'
import { SOCIAL_LINKS, activeSocialLinks } from '@/lib/social'
import { normalizeUrl } from '@/lib/links'

// These render as anchors on the public front door, so a malformed one is
// visible to every visitor. The scheme check is the important one.

describe('SOCIAL_LINKS', () => {
  it('only lists channels we actually render', () => {
    expect(SOCIAL_LINKS.length).toBeGreaterThan(0)
    expect(SOCIAL_LINKS.map((s) => s.name)).toEqual(['instagram', 'facebook'])
  })

  it('gives every channel a label for screen readers', () => {
    for (const s of SOCIAL_LINKS) {
      expect(s.label.trim().length).toBeGreaterThan(0)
    }
  })

  it('every live url is an absolute https link', () => {
    // Without a scheme the browser treats the href as a RELATIVE path and the
    // link navigates inside our own site instead of out to the channel.
    for (const s of activeSocialLinks()) {
      expect(s.url.startsWith('https://')).toBe(true)
      expect(normalizeUrl(s.url)).not.toBeNull()
      expect(() => new URL(s.url)).not.toThrow()
    }
  })

  it('points at the real Instagram account', () => {
    const ig = SOCIAL_LINKS.find((s) => s.name === 'instagram')
    expect(ig?.url).toContain('instagram.com/go_grameen')
  })

  it('hides a channel that has no url yet rather than linking nowhere', () => {
    const live = activeSocialLinks()
    expect(live.every((s) => s.url !== '')).toBe(true)
    // Whitespace is not a url either.
    expect(activeSocialLinks().some((s) => s.url.trim() === '')).toBe(false)
  })
})
