import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { NextRequest } from 'next/server'
import { getFarmerSessionFromRequest } from '@/lib/farmer-session'
import { getModeratorId, getModeratorZone, isModeratorRequest } from '@/lib/moderator-session'

/* Who may change what — the server half of the security fix (2026-11-04).
 * Every write to produce_listings, harvests, farmers, media and farm photos
 * now comes through a route that calls one of these, with the service-role
 * key; the public key can no longer write those tables at all
 * (scripts/seller-writes-lockdown.sql). */

export function svc(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

/** The logged-in seller (farmer or aggregator), from the signed cookie. */
export async function requireSeller(req: NextRequest, supabase: SupabaseClient = svc()): Promise<{ id: string; account_type: string | null } | null> {
  const session = getFarmerSessionFromRequest(req)
  if (!session) return null
  const { data } = await supabase.from('farmers').select('id, account_type').eq('id', session.farmerId).maybeSingle()
  return data ? { id: (data as { id: string }).id, account_type: (data as { account_type?: string | null }).account_type ?? null } : null
}

export type ListingRef = { id: string; farmer_id: string; status: string | null; unit: string | null; source_farmer_id: string | null }
const LISTING_REF = 'id, farmer_id, status, unit, source_farmer_id'

/** A listing, only if this seller owns it. */
export async function listingOfSeller(supabase: SupabaseClient, listingId: string, sellerId: string): Promise<ListingRef | null> {
  const { data } = await supabase.from('produce_listings').select(LISTING_REF).eq('id', listingId).eq('farmer_id', sellerId).maybeSingle()
  return (data as ListingRef | null) ?? null
}

/** Is this farmer in the logged-in moderator's zone? */
export async function farmerInModeratorZone(supabase: SupabaseClient, req: NextRequest, farmerId: string): Promise<boolean> {
  if (!isModeratorRequest(req)) return false
  const zone = getModeratorZone(req)
  const { data } = await supabase.from('farmers').select('region_slug').eq('id', farmerId).maybeSingle()
  return !!data && (data as { region_slug?: string | null }).region_slug === zone
}

/** A listing, only if its farmer is in the moderator's zone. */
export async function listingOfModerator(supabase: SupabaseClient, req: NextRequest, listingId: string): Promise<ListingRef | null> {
  if (!isModeratorRequest(req)) return null
  const { data } = await supabase.from('produce_listings').select(LISTING_REF).eq('id', listingId).maybeSingle()
  const l = (data as ListingRef | null) ?? null
  if (!l || !(await farmerInModeratorZone(supabase, req, l.farmer_id))) return null
  return l
}

export { getModeratorId }

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
