import type { PhotoItem } from '@/lib/photoList'

/* Unsaved produce forms survive the page being reloaded (2026-11-05).
 *
 * Why: the Camera button opens the phone's camera app, and while it is open
 * Android often closes the browser tab in the background to free memory. On
 * the ✓ the browser reloads the page from scratch — the dashboard home — and a
 * fully typed form was gone. Now the form saves itself on the phone as it is
 * filled in and opens again, filled in, after such a reload.
 *
 * Kept on the phone only (localStorage), one draft per form: a new produce per
 * seller, an edit per listing, the moderator's form per moderator. Cleared
 * when the form is saved or closed on purpose. Photos are kept only once they
 * are uploaded (a link) — a blob: preview dies with the page. */

export const DRAFT_MAX_AGE_MS = 2 * 86_400_000
const PREFIX = 'yff_draft:'

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
const store = (): Store | null => {
  try { return typeof window === 'undefined' ? null : window.localStorage } catch { return null }
}

export function draftKey(form: 'produce' | 'moderator-produce', owner: string, listingId?: string | null): string {
  return `${PREFIX}${form}:${owner}:${listingId || 'new'}`
}

/** Photos worth keeping in a draft: uploaded ones (http links), never blob: previews. */
export function draftPhotos(list: PhotoItem[]): PhotoItem[] {
  return list.filter((p) => !p.file && /^https?:\/\//.test(p.url)).map((p) => ({ key: p.key, url: p.url }))
}

export function writeDraft<T extends object>(key: string, data: T, now: number = Date.now(), s: Store | null = store()): void {
  try { s?.setItem(key, JSON.stringify({ savedAt: now, data })) } catch { /* full or blocked: best-effort */ }
}

export function readDraft<T extends object>(key: string, now: number = Date.now(), s: Store | null = store()): T | null {
  try {
    const raw = s?.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { savedAt?: unknown; data?: unknown }
    if (typeof parsed.savedAt !== 'number' || now - parsed.savedAt > DRAFT_MAX_AGE_MS || !parsed.data || typeof parsed.data !== 'object') {
      s?.removeItem(key)
      return null
    }
    return parsed.data as T
  } catch {
    return null
  }
}

export function clearDraft(key: string, s: Store | null = store()): void {
  try { s?.removeItem(key) } catch { /* blocked */ }
}

/** True when the draft has anything typed in it — an untouched form is not worth restoring. */
export function draftHasContent(d: Record<string, unknown>, ignore: string[] = []): boolean {
  return Object.entries(d).some(([k, v]) => {
    if (ignore.includes(k)) return false
    if (Array.isArray(v)) return v.length > 0
    return typeof v === 'string' ? v.trim() !== '' : false
  })
}
