import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { isModeratorRequest, getModeratorZone } from '@/lib/moderator-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Delivery riders, for the moderator who vets them.
//
// This reads `delivery_boys` — the table riders actually sign up into, log in
// against, and accept orders from. (The older `delivery_agents` table is a
// standalone contact roster with no login and no link to orders; vetting
// someone there never stopped anyone from delivering.)
//
// Pending applications are deliberately NOT zone-scoped: a rider declares
// pincodes, not a zone, so nobody owns the application until a moderator
// approves it and stamps their zone on it. Approved/suspended riders are then
// scoped to the zone they were approved into. Legacy riders (approved before
// zones existed) have zone NULL and stay visible everywhere rather than
// disappearing from every zone at once.
export async function GET(req: NextRequest) {
  if (!isModeratorRequest(req)) {
    return NextResponse.json({ error: 'Moderator login required.' }, { status: 401 })
  }
  const zone = getModeratorZone(req)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: rows, error } = await supabase
    .from('delivery_boys')
    .select(
      'id, name, phone, alt_phone, vehicle_type, vehicle_number, service_areas, service_pincodes, status, zone, id_proof_path, approved_at, approved_by, rejected_at, rejection_reason, last_login_at, created_at',
    )
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) {
    console.error('[YFF moderator/riders] query failed:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const visible = (rows ?? []).filter(
    (r) => r.status === 'pending_approval' || r.zone == null || r.zone === zone,
  )

  // The ID photo lives in a private bucket. Hand the moderator a short-lived
  // signed URL so they can actually look at the document they're vetting,
  // without the bucket ever being public. 10 minutes, then the page refetches.
  const riders = await Promise.all(
    visible.map(async ({ id_proof_path, ...r }) => {
      let id_proof_url: string | null = null
      if (id_proof_path) {
        const { data: signed } = await supabase.storage
          .from('rider-id-proofs')
          .createSignedUrl(id_proof_path, 600)
        id_proof_url = signed?.signedUrl ?? null
      }
      return { ...r, id_proof_url }
    }),
  )

  return NextResponse.json({ riders, zone })
}
