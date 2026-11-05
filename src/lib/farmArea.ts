import { createClient } from '@supabase/supabase-js'
import { farmerCoords } from '@/lib/location'
import { coarsePoint } from '@/lib/retailReach'

/* SERVER ONLY. A rough point for each farmer, for the buyer's "how far / does
 * it deliver here" (2026-11-05). The exact farm GPS stays private (security
 * fix 2026-11-04): this reads it with the service role and hands out only a
 * ~5 km grid point — no finer than the village name that is already public.
 * No map pin → the village's town from the place list. No key / no match →
 * the farmer is simply missing from the map (shown without a distance). */

export type FarmArea = { lat: number; lng: number; approximate: boolean }

export async function farmAreas(farmerIds: string[]): Promise<Record<string, FarmArea>> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!farmerIds.length || !url || !key) return {}
  try {
    const db = createClient(url, key)
    const { data, error } = await db.from('farmers').select('id, lat, lng, location_name, village').in('id', farmerIds)
    if (error || !data) return {}
    const out: Record<string, FarmArea> = {}
    for (const f of data as Array<{ id: string; lat?: number | string | null; lng?: number | string | null; location_name?: string | null; village?: string | null }>) {
      const c = farmerCoords(f)
      if (!c) continue
      const p = c.approximate ? { lat: c.lat, lng: c.lng } : coarsePoint(c.lat, c.lng)
      out[f.id] = { ...p, approximate: true }
    }
    return out
  } catch {
    return {}
  }
}
