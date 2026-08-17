import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { NextRequest } from 'next/server'
import { getFarmerSessionFromRequest } from '@/lib/farmer-session'

// Shared by the aggregator API routes. Kept out of the route files themselves
// because a Next route module may only export HTTP handlers and route config.

export function svc(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/**
 * Resolves the caller to an aggregator. Returns null for a logged-out user or an
 * ordinary farmer — a farmer selling their own produce has no source farmers, so
 * these endpoints simply do not exist for them.
 */
export async function requireAggregator(req: NextRequest): Promise<{ id: string } | null> {
  const session = getFarmerSessionFromRequest(req)
  if (!session) return null

  const { data } = await svc()
    .from('farmers')
    .select('id, account_type')
    .eq('id', session.farmerId)
    .maybeSingle()

  if (!data || data.account_type !== 'aggregator') return null
  return { id: data.id as string }
}
