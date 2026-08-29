// Go Grameen's own social channels, shown in the /home footer.
//
// Deliberately NOT the farmer-supplied social columns (farmers.instagram_url
// and friends) — those are per-farmer and normalised at render through
// src/lib/links.ts because a farmer pastes whatever their phone gives them.
// These are ours, typed once, and must be complete absolute https:// URLs.
//
// Why that matters: an href without a scheme ("instagram.com/go_grameen") is
// read by the browser as a RELATIVE path, so the link would navigate to
// gogrameen.in/home/instagram.com/go_grameen instead of leaving the site.
// tests/lib/social.test.ts pins that.

export type SocialLink = {
  /** Stable key, also used as the React key and in the aria-label. */
  name: 'instagram' | 'facebook'
  /** Shown to screen readers and on hover. */
  label: string
  url: string
}

// An entry with an empty url is skipped by the footer, so a channel that does
// not exist yet simply does not render — better than shipping a dead link.
export const SOCIAL_LINKS: SocialLink[] = [
  {
    name: 'instagram',
    label: 'Instagram',
    url: 'https://www.instagram.com/go_grameen/',
  },
  {
    name: 'facebook',
    label: 'Facebook',
    // A numeric profile.php id, not a vanity handle — that is simply what this
    // account has. Keep the query string: without ?id= it is a dead link.
    url: 'https://www.facebook.com/profile.php?id=61594097484138',
  },
]

/** The channels that are actually live, in display order. */
export function activeSocialLinks(): SocialLink[] {
  return SOCIAL_LINKS.filter((s) => s.url.trim().length > 0)
}
