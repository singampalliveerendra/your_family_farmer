// Helpers for farmer-supplied links (produce video, social channels).
//
// Farmers paste these on a phone, so what arrives is rarely a clean URL:
// "youtube.com/@myfarm", " instagram.com/myfarm ", or a full https:// address.
// We accept all of those rather than making them fight a validator, and we
// never render a link we haven't normalised — an href without a scheme is
// treated as a relative path by the browser and would navigate inside our own
// site instead of out to the farmer's channel.

/** Loose "did they paste something link-shaped?" test, for inline form hints. */
export function isLikelyUrl(raw: string): boolean {
  const s = raw.trim()
  if (!s || /\s/.test(s)) return false
  // Something.tld, with or without a scheme — good enough to catch typos
  // without rejecting the shorthand people actually type.
  return /^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(s)
}

/**
 * Make a pasted link safe to put in an href. Returns null for anything we
 * won't link to, so callers can simply hide the link.
 *
 * Adds https:// when the scheme is missing, and rejects every other scheme —
 * `javascript:` in particular, since these strings come from a text input and
 * end up in an anchor on a public page.
 */
export function normalizeUrl(raw: string | null | undefined): string | null {
  const s = (raw ?? '').trim()
  if (!s) return null
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`
  try {
    const u = new URL(withScheme)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return u.toString()
  } catch {
    return null
  }
}

/** Domain only ("youtube.com/@x" → "youtube.com"), for compact link labels. */
export function linkHost(raw: string | null | undefined): string | null {
  const url = normalizeUrl(raw)
  if (!url) return null
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}
