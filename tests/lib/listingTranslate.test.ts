import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  checkSides,
  fillListingTranslations,
  itemsFor,
  resetSweepClock,
  sweepListings,
  translateBatch,
  type ListingStore,
} from '@/lib/listingTranslate'
import {
  localizeText,
  pendingFields,
  pickTranslations,
  translationFor,
} from '@/lib/textTranslations'
import { localizeName } from '@/lib/localizeName'
import { PROTECTED_LISTING_KEYS } from '@/lib/sellerWriteRules'
import { touchesTranslatedText } from '@/lib/translateAfterSave'

// English + Telugu copies of farmer-typed produce text (2026-11-20): an
// English reader no longer sees the Telugu a farmer typed, and the other way.

const KANDI = 'కందిపప్పు'
const tr = { name: { of: KANDI, en: 'Toor dal', te: KANDI } }

describe('showing a farmer-typed text', () => {
  it('English reader sees the English copy of a Telugu name', () => {
    expect(localizeName(KANDI, 'en', tr)).toBe('Toor dal')
  })

  it('Telugu reader sees the farmer’s own Telugu', () => {
    expect(localizeName(KANDI, 'te', tr)).toBe(KANDI)
  })

  it('a copy of an OLD text is ignored after the farmer edits it', () => {
    expect(localizeName('పెసలు', 'en', tr)).toBe('పెసలు')
    expect(translationFor(tr, 'name', 'పెసలు')).toBeNull()
  })

  it('the farmer’s own "English / Telugu" name still wins', () => {
    const t = { name: { of: 'Tomato / టమాట', en: 'X', te: 'Y' } }
    expect(localizeName('Tomato / టమాట', 'en', t)).toBe('Tomato')
    expect(localizeName('Tomato / టమాట', 'te', t)).toBe('టమాట')
  })

  it('Telugu reader of an English name: AI copy, else the dictionary', () => {
    expect(localizeName('Isha Honey', 'te', { name: { of: 'Isha Honey', en: 'Isha Honey', te: 'ఈషా తేనె' } })).toBe('ఈషా తేనె')
    // A failed copy (empty sides) falls back to the dictionary as before.
    expect(localizeName('Tomato', 'te', { name: { of: 'Tomato', en: '', te: '' } })).toBe(localizeName('Tomato', 'te'))
  })

  it('variety uses its own copy', () => {
    const t = { variety: { of: 'నాటు రకం', en: 'Country variety', te: 'నాటు రకం' } }
    expect(localizeName('నాటు రకం', 'en', t, 'variety')).toBe('Country variety')
    expect(localizeName('నాటు రకం', 'en', t)).toBe('నాటు రకం')
  })

  it('descriptions: copy in the reader’s language, never hidden when missing', () => {
    const d = 'సహజంగా పండించాము'
    const t = { description: { of: d, en: 'Grown naturally', te: d } }
    expect(localizeText(d, 'en', t, 'description')).toBe('Grown naturally')
    expect(localizeText(d, 'te', t, 'description')).toBe(d)
    expect(localizeText(d, 'en', null, 'description')).toBe(d)
    expect(localizeText('  ', 'en', t, 'description')).toBe('')
  })

  it('a malformed column is treated as no copy', () => {
    expect(localizeText(KANDI, 'en', 'oops', 'name')).toBe(KANDI)
    expect(localizeText(KANDI, 'en', { name: 5 }, 'name')).toBe(KANDI)
  })
})

describe('what still needs translating', () => {
  it('lists texts with no current copy, skips empty ones', () => {
    const row = { name: KANDI, variety: '', description: 'Fresh', how_we_grow: null, translations: tr }
    expect(pendingFields(row)).toEqual(['description'])
  })

  it('a field tried before (empty copies) is not sent again', () => {
    const row = { name: KANDI, translations: { name: { of: KANDI, en: '', te: '' } } }
    expect(pendingFields(row)).toEqual([])
  })

  it('itemsFor keys each text by row index and field', () => {
    expect(itemsFor([{ id: 'a', name: ' Pasupu ', description: 'x', translations: null }])).toEqual([
      { k: '0.name', text: 'Pasupu' },
      { k: '0.description', text: 'x' },
    ])
  })

  it('the feed keeps only name + variety copies', () => {
    const t = { ...tr, description: { of: 'a', en: 'b', te: 'c' } }
    expect(pickTranslations(t, ['name', 'variety'])).toEqual(tr)
    expect(pickTranslations(null, ['name'])).toBeNull()
  })
})

describe('checkSides — wrong language is thrown away', () => {
  it('keeps real English and real Telugu', () => {
    expect(checkSides(KANDI, 'Toor dal', KANDI)).toEqual({ en: 'Toor dal', te: KANDI })
  })
  it('drops Telugu in the English side and English in the Telugu side', () => {
    expect(checkSides(KANDI, KANDI, 'Toor dal')).toEqual({ en: '', te: '' })
  })
})

const reply = (body: unknown, status = 200) =>
  vi.fn(async () => new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(body) }] } }] }),
    { status },
  ))

describe('translateBatch', () => {
  it('without a key: no request at all', async () => {
    const fetch = vi.fn()
    const old = process.env.GEMINI_API_KEY
    delete process.env.GEMINI_API_KEY
    expect(await translateBatch([{ k: '0.name', text: KANDI }], { fetch })).toEqual({ ok: false, why: 'no-key' })
    process.env.GEMINI_API_KEY = old
    expect(fetch).not.toHaveBeenCalled()
  })

  it('sends all texts in ONE request and returns checked copies', async () => {
    const fetch = reply([
      { k: '0.name', en: 'Toor dal', te: KANDI },
      { k: '0.description', en: 'Grown naturally', te: 'సహజంగా' },
      { k: '9.name', en: 'not asked', te: 'అడగలేదు' },
    ])
    const res = await translateBatch(
      [{ k: '0.name', text: KANDI }, { k: '0.description', text: 'సహజంగా' }],
      { apiKey: 'k', fetch },
    )
    expect(fetch).toHaveBeenCalledOnce()
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.out.get('0.name')).toEqual({ en: 'Toor dal', te: KANDI })
    expect(res.out.has('9.name')).toBe(false)
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain('gemini-flash-lite-latest')
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('k')
  })

  it('429 is reported as rate-limited, other failures as error', async () => {
    expect(await translateBatch([{ k: '0.name', text: 'x' }], { apiKey: 'k', fetch: reply([], 429) })).toEqual({ ok: false, why: 'rate-limited' })
    expect(await translateBatch([{ k: '0.name', text: 'x' }], { apiKey: 'k', fetch: reply([], 500) })).toEqual({ ok: false, why: 'error' })
    const bad = vi.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'not json' }] } }] })))
    expect(await translateBatch([{ k: '0.name', text: 'x' }], { apiKey: 'k', fetch: bad })).toEqual({ ok: false, why: 'error' })
  })
})

function memoryStore(rows: Array<Record<string, unknown> & { id: string }>) {
  const db = new Map(rows.map((r) => [r.id, { ...r }]))
  const writes: Array<{ id: string; translations: unknown }> = []
  const store: ListingStore = {
    read: async (ids) => ids.map((id) => db.get(id)).filter(Boolean).map((r) => ({ ...r! })),
    write: async (id, translations) => {
      writes.push({ id, translations })
      db.get(id)!.translations = translations
    },
  }
  return { store, writes, db }
}

describe('fillListingTranslations', () => {
  it('translates the missing texts and keeps copies that still match', async () => {
    const { store, writes } = memoryStore([
      { id: 'a', name: KANDI, description: 'సహజంగా', translations: tr },
    ])
    const translate = vi.fn(async () => ({ ok: true as const, out: new Map([['0.description', { en: 'Naturally', te: 'సహజంగా' }]]) }))
    expect(await fillListingTranslations(store, ['a'], translate)).toEqual({ translated: 1, pending: 0 })
    expect(translate).toHaveBeenCalledWith([{ k: '0.description', text: 'సహజంగా' }])
    expect(writes[0].translations).toEqual({ ...tr, description: { of: 'సహజంగా', en: 'Naturally', te: 'సహజంగా' } })
  })

  it('nothing to do: no request', async () => {
    const { store } = memoryStore([{ id: 'a', name: KANDI, translations: tr }])
    const translate = vi.fn()
    expect(await fillListingTranslations(store, ['a'], translate)).toEqual({ translated: 0, pending: 0 })
    expect(translate).not.toHaveBeenCalled()
  })

  it('an edit made while Gemini was thinking is not overwritten', async () => {
    const { store, writes, db } = memoryStore([{ id: 'a', name: KANDI, translations: null }])
    const translate = vi.fn(async () => {
      db.get('a')!.name = 'పెసలు' // farmer saved a new name meanwhile
      return { ok: true as const, out: new Map([['0.name', { en: 'Toor dal', te: KANDI }]]) }
    })
    expect(await fillListingTranslations(store, ['a'], translate)).toEqual({ translated: 0, pending: 1 })
    expect(writes).toEqual([])
  })

  it('a failed request writes nothing and says why', async () => {
    const { store, writes } = memoryStore([{ id: 'a', name: KANDI, translations: null }])
    const res = await fillListingTranslations(store, ['a'], async () => ({ ok: false, why: 'rate-limited' }))
    expect(res).toEqual({ translated: 0, pending: 1, failed: 'rate-limited' })
    expect(writes).toEqual([])
  })

  it('migration not run (read fails): does nothing', async () => {
    const store: ListingStore = { read: async () => null, write: vi.fn() }
    const translate = vi.fn()
    expect(await fillListingTranslations(store, ['a'], translate)).toEqual({ translated: 0, pending: 0 })
    expect(translate).not.toHaveBeenCalled()
  })
})

describe('sweepListings — the backfill after the feed', () => {
  beforeEach(() => resetSweepClock())
  const rows = [{ id: 'a', name: KANDI, translations: null }]

  it('runs, then waits a few minutes before the next sweep', async () => {
    const fill = vi.fn(async () => ({ translated: 1, pending: 0 }))
    const { store } = memoryStore(rows)
    expect(await sweepListings(rows, store, 1_000, fill)).toEqual({ translated: 1, pending: 0 })
    expect(await sweepListings(rows, store, 2_000, fill)).toBeNull()
    expect(await sweepListings(rows, store, 1_000 + 3 * 60_000, fill)).not.toBeNull()
    expect(fill).toHaveBeenCalledTimes(2)
  })

  it('backs off for an hour when the free limit is hit', async () => {
    const fill = vi.fn(async () => ({ translated: 0, pending: 1, failed: 'rate-limited' as const }))
    const { store } = memoryStore(rows)
    await sweepListings(rows, store, 0, fill)
    expect(await sweepListings(rows, store, 30 * 60_000, fill)).toBeNull()
    expect(fill).toHaveBeenCalledOnce()
  })

  it('skips when the column does not exist yet, or nothing is due', async () => {
    const fill = vi.fn()
    const { store } = memoryStore([])
    expect(await sweepListings([{ id: 'a', name: KANDI }], store, 0, fill)).toBeNull()
    expect(await sweepListings([{ id: 'a', name: KANDI, translations: tr }], store, 0, fill)).toBeNull()
    expect(fill).not.toHaveBeenCalled()
  })
})

describe('save routes', () => {
  it('sellers cannot write translations themselves', () => {
    expect(PROTECTED_LISTING_KEYS.has('translations')).toBe(true)
  })
  it('a price-only save does not trigger a translation', () => {
    expect(touchesTranslatedText({ price_tier_1_price: 50 })).toBe(false)
    expect(touchesTranslatedText({ name: 'x', stock_qty: 2 })).toBe(true)
  })
})
