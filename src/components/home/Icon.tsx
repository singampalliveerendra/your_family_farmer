/* Line icons for the role pages and plan screens — one stroke weight, drawn on
 * a 24px grid, coloured by `currentColor`. Hand-picked shapes instead of emoji
 * tiles: emoji render differently on every Android phone and make a page look
 * like a template. Purely decorative (aria-hidden); the text beside each icon
 * carries the meaning. */

export type IconName =
  | 'cart' | 'sprout' | 'truck' | 'box' | 'tag' | 'rupee' | 'phone' | 'receipt'
  | 'shield' | 'clock' | 'share' | 'search' | 'users' | 'check' | 'scale' | 'store'
  | 'calendar' | 'bell' | 'lock' | 'unlock' | 'pin' | 'language' | 'handshake' | 'arrow'

const PATHS: Record<IconName, string> = {
  cart: 'M3 4h2l2.4 10.2a1.5 1.5 0 0 0 1.5 1.1h8.3a1.5 1.5 0 0 0 1.4-1l2-6.3H6.2M10 20a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm8 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z',
  sprout: 'M12 21v-9m0 0c0-4 3-7 8-7 0 4-3 7-8 7Zm0 0C12 8.5 9.5 6 5 6c0 3.5 2.5 6 7 6Z',
  truck: 'M3 6h11v9H3zM14 9h4l3 3v3h-7M7.5 18.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Zm11 0a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z',
  box: 'm12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Zm0 0v18m8-13.5-8 4.5-8-4.5',
  tag: 'M3 12V4h8l10 10-8 8L3 12Zm5-4.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z',
  rupee: 'M7 5h10M7 9h10M8 5c5 0 5 8 0 8h-1l7 7',
  phone: 'M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm3 15h2',
  receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2V3Zm3 5h6m-6 4h6m-6 4h3',
  shield: 'M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6l-8-3Zm-3.5 9 2.5 2.5L16 9.5',
  clock: 'M12 7v5l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  share: 'M16 6a2.5 2.5 0 1 0 0-.1M8 12a2.5 2.5 0 1 0 0-.1M16 18a2.5 2.5 0 1 0 0-.1M10.2 10.8l3.6-2.1m-3.6 4.5 3.6 2.1',
  search: 'm20 20-4.2-4.2M17 10.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z',
  users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-6 9c0-3.3 2.7-6 6-6s6 2.7 6 6m1-9a3 3 0 1 0 0-6m2 15c0-2.6-1.3-4.6-3-5.5',
  check: 'm5 12.5 4.5 4.5L19 7.5',
  scale: 'M12 4v16M6 20h12M5 8h14M5 8l-2.5 6a3 3 0 0 0 5 0L5 8Zm14 0-2.5 6a3 3 0 0 0 5 0L19 8Z',
  store: 'M4 9.5 5.5 4h13L20 9.5M4 9.5V20h16V9.5M4 9.5c0 1.4 1.1 2.5 2.7 2.5s2.6-1.1 2.6-2.5c0 1.4 1.1 2.5 2.7 2.5s2.7-1.1 2.7-2.5c0 1.4 1 2.5 2.6 2.5S20 10.9 20 9.5M10 20v-5h4v5',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4m8-4v4',
  bell: 'M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Zm4.5 4a1.5 1.5 0 0 0 3 0',
  lock: 'M6 11h12v9H6zm2.5 0V8a3.5 3.5 0 0 1 7 0v3',
  unlock: 'M6 11h12v9H6zm2.5 0V8a3.5 3.5 0 0 1 6.8-1.2',
  pin: 'M12 21s-6.5-6-6.5-11a6.5 6.5 0 1 1 13 0c0 5-6.5 11-6.5 11Zm0-8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  language: 'M4 5h9M8.5 3v2m3 0c-1 4-3.6 7-7 8.5M6 9c1 2 3 3.6 5.5 4.3M13 21l4-9 4 9m-6.8-3h5.6',
  handshake: 'm3 11 4-4 3 1 2-2 3 1 6 5-3 3m-15-4 5 5m0 0 2 2 1.5-1.5M8 16l1.5 1.5L11 16m3-1 2.5 2.5L18 16l-3.5-3.5',
  arrow: 'M5 12h14m-5-5 5 5-5 5',
}

export default function Icon({ name, className = 'h-5 w-5', strokeWidth = 1.8 }: { name: IconName; className?: string; strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={PATHS[name]} />
    </svg>
  )
}
