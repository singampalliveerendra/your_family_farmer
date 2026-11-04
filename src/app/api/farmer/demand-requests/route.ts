import { NextRequest, NextResponse } from 'next/server'
import { requireSeller, svc } from '@/lib/sellerAuth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Open buyer requests ("I need 20 kg tomato by Friday") in the logged-in
// seller's own region, with the buyer's name and phone so the farmer can offer
// the crop. Before the security fix the dashboard read demand_intents with the
// public key — which meant EVERY buyer's phone and location was public.
export async function GET(req: NextRequest) {
  const supabase = svc()
  const me = await requireSeller(req, supabase)
  if (!me) return NextResponse.json({ error: 'Please log in first.' }, { status: 401 })
  const { data: f } = await supabase.from('farmers').select('region_slug').eq('id', me.id).maybeSingle()
  const region = (f as { region_slug?: string | null } | null)?.region_slug
  if (!region) return NextResponse.json({ requests: [] })
  const { data } = await supabase
    .from('demand_intents')
    .select('id, crop_name, quantity_kg, needed_by_date, delivery_location, requester_name, requester_phone, created_at')
    .eq('region_slug', region)
    .eq('fulfilled', false)
    .order('created_at', { ascending: false })
    .limit(100)
  return NextResponse.json({ requests: data ?? [] })
}
