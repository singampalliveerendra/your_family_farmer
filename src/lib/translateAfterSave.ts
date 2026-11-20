import { createClient } from '@supabase/supabase-js'
import { after } from 'next/server'
import { fillListingTranslations, supabaseListingStore, sweepListings } from './listingTranslate'
import { TRANSLATED_FIELDS } from './textTranslations'

// Route helpers for the produce translations (src/lib/listingTranslate.ts).
// Both run after the response has gone out, so a save or the feed never waits
// for Gemini, and do nothing at all without GEMINI_API_KEY.

const db = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

/** Did this save send any text we translate? (Saving only the price or stock does not.) */
export function touchesTranslatedText(payload: Record<string, unknown> | null | undefined): boolean {
  return !!payload && TRANSLATED_FIELDS.some((f) => f in payload)
}

/** After a farmer / moderator save: translate that produce's new or changed text. */
export function translateListingAfterSave(id: string | null | undefined): void {
  if (!id || !process.env.GEMINI_API_KEY) return
  after(async () => {
    const res = await fillListingTranslations(supabaseListingStore(db()), [id])
    if (res.failed) console.error(`[YFF translate] ${id} not translated (${res.failed})`)
  })
}

/** After the feed: translate a few produce that still have no copy (the backfill). */
export function sweepFeedAfterResponse(rows: Array<Record<string, unknown>>): void {
  if (!process.env.GEMINI_API_KEY || !rows.length) return
  after(async () => {
    const res = await sweepListings(rows, supabaseListingStore(db()))
    if (res?.failed) console.error(`[YFF translate] sweep stopped (${res.failed})`)
  })
}
