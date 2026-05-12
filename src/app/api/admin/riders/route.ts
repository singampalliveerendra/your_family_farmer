import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/admin-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: 'Admin login required.' }, { status: 401 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: riders, error } = await supabase
    .from('delivery_boys')
    .select('id, name, phone, alt_phone, vehicle_type, vehicle_number, service_areas, status, activation_code, id_proof_path, approved_at, activated_at, last_login_at, created_at')
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) {
    console.error('[YFF admin/riders] query failed:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Sign ID-proof URLs in batch so the panel can show the photo without
  // exposing the bucket. URLs expire in 10 min — the admin should refresh.
  const withProofs = await Promise.all(
    (riders ?? []).map(async (r) => {
      let idProofUrl: string | null = null
      if (r.id_proof_path) {
        const { data: signed } = await supabase.storage
          .from('rider-id-proofs')
          .createSignedUrl(r.id_proof_path, 600)
        idProofUrl = signed?.signedUrl ?? null
      }
      return { ...r, id_proof_url: idProofUrl }
    }),
  )

  return NextResponse.json({ riders: withProofs })
}
