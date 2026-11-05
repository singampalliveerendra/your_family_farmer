import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DRAFT_MAX_AGE_MS, clearDraft, draftHasContent, draftKey, draftPhotos, readDraft, writeDraft } from '@/lib/formDraft'

// 2026-11-05: an aggregator filled a whole new-produce form, took a photo with
// the camera, tapped ✓ — and landed on the dashboard with everything gone.
// Android had closed the browser tab while the camera app was open, so the page
// reloaded. Forms now keep a draft on the phone and photos upload on pick.

function mem() {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v) }, removeItem: (k: string) => { m.delete(k) }, m }
}

describe('drafts', () => {
  it('one key per form: new produce per seller, an edit per listing', () => {
    expect(draftKey('produce', 's1')).toBe('yff_draft:produce:s1:new')
    expect(draftKey('produce', 's1', 'L9')).toBe('yff_draft:produce:s1:L9')
    expect(draftKey('moderator-produce', 'zone')).not.toBe(draftKey('produce', 'zone'))
  })
  it('write → read gives it back; clear forgets it', () => {
    const s = mem()
    writeDraft('k', { name: 'Tomato' }, 1000, s)
    expect(readDraft('k', 2000, s)).toEqual({ name: 'Tomato' })
    clearDraft('k', s)
    expect(readDraft('k', 2000, s)).toBeNull()
  })
  it('a draft older than 2 days is dropped', () => {
    const s = mem()
    writeDraft('k', { name: 'Tomato' }, 0, s)
    expect(readDraft('k', DRAFT_MAX_AGE_MS + 1, s)).toBeNull()
    expect(s.m.has('k')).toBe(false)
  })
  it('junk in storage never breaks the form', () => {
    const s = mem()
    s.setItem('k', '{not json')
    expect(readDraft('k', 0, s)).toBeNull()
    s.setItem('k', JSON.stringify({ savedAt: 0, data: 'x' }))
    expect(readDraft('k', 0, s)).toBeNull()
  })
  it('keeps uploaded photos, never blob previews (they die with the page)', () => {
    const f = new File(['x'], 'a.jpg')
    expect(draftPhotos([
      { key: 'a', url: 'https://x.supabase.co/a.jpg' },
      { key: 'b', url: 'blob:http://localhost/123', file: f },
    ])).toEqual([{ key: 'a', url: 'https://x.supabase.co/a.jpg' }])
  })
  it('an untouched form is not worth keeping', () => {
    expect(draftHasContent({ name: '', unit: 'kg', photos: [] }, ['unit'])).toBe(false)
    expect(draftHasContent({ name: 'Tomato', unit: 'kg' }, ['unit'])).toBe(true)
    expect(draftHasContent({ name: '', photos: [{ url: 'u' }] })).toBe(true)
  })
})

describe('the forms use it', () => {
  const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
  it.each(['src/app/farmer/dashboard/page.tsx', 'src/app/moderator/listings/ListingForm.tsx'])('%s saves, restores, clears, and uploads photos on pick', (p) => {
    const s = src(p)
    expect(s).toMatch(/readDraft</)
    expect(s).toMatch(/writeDraft\(draftK/)
    expect(s).toMatch(/clearDraft\(draftK\)/)
    // Restored quietly — no notice (client, 2026-11-05: it showed on every edit).
    expect(s).not.toMatch(/We kept what you had typed/)
    expect(s).toMatch(/<PhotoPicker[\s\S]{0,200}upload=\{\(f\) => uploadFarmImage\(f, 'produce'/)
  })
  it('the dashboard reopens a half-filled new produce after a reload', () => {
    expect(src('src/app/farmer/dashboard/page.tsx')).toMatch(/readDraft\(draftKey\('produce', farmer\.id, null\)\)/)
  })
  it('the photo picker uploads straight away when it can', () => {
    expect(src('src/components/PhotoPicker.tsx')).toMatch(/const url = upload \? await upload\(c\)/)
  })
})
