import type { Standing } from '@/lib/subscriptionLifecycle'

/* The short badge on the right of the aggregator's slim "Your plan" line
 * (2026-11-05: the old full-width plan box was too big). One or two words:
 * free-forever plans just say "Free plan"; a dated plan says until when; an
 * ending / ended / missing plan says what to do, in amber or red. */

type Translate = (en: string, te: string) => string
export type Badge = { text: string; bg: string; ink: string }

const CALM = { bg: '#e3f1e8', ink: '#1f5a3a' }
const WARN = { bg: '#fdf4df', ink: '#6b4a07' }
const STOP = { bg: '#f8e1d6', ink: '#7a2a0c' }

export function planBadge(s: Standing, L: Translate, fmt: (iso: string) => string): Badge {
  switch (s.state) {
    case 'forever': return { text: L('Free plan', 'ఉచిత ప్లాన్'), ...CALM }
    case 'active': return { text: L(`Till ${fmt(s.endsAt)}`, `${fmt(s.endsAt)} వరకు`), ...CALM }
    case 'ending': return { text: L(`Renew · ${fmt(s.endsAt)}`, `రీన్యూ · ${fmt(s.endsAt)}`), ...WARN }
    case 'expired': return { text: L('Renew now', 'ఇప్పుడే రీన్యూ'), ...STOP }
    default: return { text: L('Choose a plan', 'ప్లాన్ ఎంచుకోండి'), ...WARN }
  }
}
