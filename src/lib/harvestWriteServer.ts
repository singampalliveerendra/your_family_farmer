import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { parseHarvestCreate, parseHarvestPatch } from '@/lib/sellerWriteRules'
import { UUID_RE, type ListingRef } from '@/lib/sellerAuth'

/* The harvest manager's writes, shared by the seller routes
 * (/api/farmer/harvests…) and the moderator routes (/api/moderator/harvests…)
 * so the two can never drift. The caller says whose listing it is; this does
 * the rest. A harvest always takes its farmer and grower FROM ITS LISTING, never
 * from the request (the DB trigger enforce_harvest_source_farmer re-checks). */

type Owner = (listingId: string) => Promise<ListingRef | null>
type Lang = (en: string, te: string) => string

const json = (body: unknown, status = 200) => NextResponse.json(body, { status })

export async function createHarvest(supabase: SupabaseClient, owner: Owner, body: Record<string, unknown>, t: Lang) {
  const listingId = typeof body.produce_listing_id === 'string' ? body.produce_listing_id : ''
  if (!UUID_RE.test(listingId)) return json({ error: t('Invalid produce.', 'చెల్లని ఉత్పత్తి.') }, 400)
  const listing = await owner(listingId)
  if (!listing) return json({ error: t('Produce not found or not yours.', 'ఉత్పత్తి కనబడలేదు లేదా మీది కాదు.') }, 403)
  const p = parseHarvestCreate(body)
  if (!p.ok) return json({ error: t(p.error.en, p.error.te) }, 400)
  const { data, error } = await supabase
    .from('harvests')
    .insert({
      ...p.fields,
      unit: p.fields.unit ?? listing.unit ?? null,
      produce_listing_id: listing.id,
      farmer_id: listing.farmer_id,
      ...(listing.source_farmer_id ? { source_farmer_id: listing.source_farmer_id } : {}),
    })
    .select('id')
    .single()
  if (error || !data) {
    console.error('[YFF harvest create] failed:', error?.message)
    return json({ error: /source farmer|grower/i.test(error?.message ?? '')
      ? t('Set the farmer who grows this produce first.', 'ముందుగా ఈ ఉత్పత్తిని పండించే రైతును ఎంచుకోండి.')
      : t('Could not log the harvest. Please try again.', 'కోత నమోదు కాలేదు. మళ్లీ ప్రయత్నించండి.') }, 500)
  }
  return json({ ok: true, id: (data as { id: string }).id })
}

async function harvestListing(supabase: SupabaseClient, owner: Owner, harvestId: string): Promise<ListingRef | null> {
  if (!UUID_RE.test(harvestId)) return null
  const { data } = await supabase.from('harvests').select('id, produce_listing_id').eq('id', harvestId).maybeSingle()
  const listingId = (data as { produce_listing_id?: string } | null)?.produce_listing_id
  return listingId ? owner(listingId) : null
}

export async function patchHarvest(supabase: SupabaseClient, owner: Owner, harvestId: string, body: Record<string, unknown>, t: Lang) {
  if (!(await harvestListing(supabase, owner, harvestId))) return json({ error: t('Harvest not found or not yours.', 'కోత కనబడలేదు లేదా మీది కాదు.') }, 403)
  const p = parseHarvestPatch(body)
  if (!p.ok) return json({ error: t(p.error.en, p.error.te) }, 400)
  const { error } = await supabase.from('harvests').update(p.fields).eq('id', harvestId)
  if (error) return json({ error: t('Could not save the harvest.', 'కోత సేవ్ కాలేదు.') }, 500)
  return json({ ok: true })
}

export async function deleteHarvest(supabase: SupabaseClient, owner: Owner, harvestId: string, t: Lang) {
  if (!(await harvestListing(supabase, owner, harvestId))) return json({ error: t('Harvest not found or not yours.', 'కోత కనబడలేదు లేదా మీది కాదు.') }, 403)
  const { error } = await supabase.from('harvests').delete().eq('id', harvestId)
  if (error) {
    // Orders that reference the harvest keep it alive — say so plainly.
    return json({ error: t('This harvest has orders, so it cannot be deleted. Pause it instead.', 'ఈ కోతకు ఆర్డర్లు ఉన్నాయి, కాబట్టి తొలగించలేరు. బదులుగా ఆపివేయండి.') }, 409)
  }
  return json({ ok: true })
}
