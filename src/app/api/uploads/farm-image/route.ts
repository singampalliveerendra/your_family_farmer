import { NextRequest, NextResponse } from 'next/server'
import { getModeratorId, isModeratorRequest } from '@/lib/moderator-session'
import { farmerInModeratorZone, requireSeller, svc, UUID_RE } from '@/lib/sellerAuth'
import { uploadPath } from '@/lib/sellerWriteRules'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// A one-time upload link for ONE photo in the farm-images bucket (security
// fix, 2026-11-04). The public key can no longer upload, overwrite or delete
// anything there; instead the server picks the folder and signs one path:
//   seller     → their own `<farmerId>/…`
//   moderator  → the farmer's folder if that farmer is in their zone, else
//                `onboarding/<moderatorId>/…` (setting up a farmer who has no
//                account yet).
// The browser then uploads straight to storage with the token — the photo
// never passes through this function, so the 4.5 MB body limit does not bite.
// Body: { kind: 'profile'|'cover'|'produce'|'gallery'|'certificate', ext, farmerId? }

export async function POST(req: NextRequest) {
  const supabase = svc()
  const body = (await req.json().catch(() => null)) as { kind?: unknown; ext?: unknown; farmerId?: unknown } | null
  if (!body) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })

  let folder: string | null = null
  const seller = await requireSeller(req, supabase)
  if (seller) {
    folder = seller.id
  } else if (isModeratorRequest(req)) {
    const fid = typeof body.farmerId === 'string' && UUID_RE.test(body.farmerId) ? body.farmerId : null
    if (fid && (await farmerInModeratorZone(supabase, req, fid))) folder = fid
    else {
      const mid = getModeratorId(req)
      if (mid && UUID_RE.test(mid)) folder = `onboarding/${mid}`
    }
  }
  if (!folder) return NextResponse.json({ error: 'Please log in first.' }, { status: 401 })

  const p = uploadPath(folder, body.kind, body.ext)
  if (!p.ok) return NextResponse.json({ error: p.error }, { status: 400 })
  const { data, error } = await supabase.storage.from('farm-images').createSignedUploadUrl(p.path)
  if (error || !data) {
    console.error('[YFF uploads/farm-image] sign failed:', error?.message)
    return NextResponse.json({ error: 'Could not start the upload. Please try again.' }, { status: 500 })
  }
  const { data: pub } = supabase.storage.from('farm-images').getPublicUrl(p.path)
  return NextResponse.json({ ok: true, path: p.path, token: data.token, contentType: p.contentType, publicUrl: pub.publicUrl })
}
