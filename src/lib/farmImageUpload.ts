'use client'

import { supabase } from '@/lib/supabase'
import type { UploadKind } from '@/lib/sellerWriteRules'

/* Upload one photo to farm-images the safe way (security fix, 2026-11-04):
 * ask /api/uploads/farm-image for a one-time link to a path in the caller's
 * OWN folder, then send the file straight to storage with it. The public key
 * can no longer upload, overwrite or delete anything in that bucket.
 * `farmerId` matters only for a moderator uploading for a farmer in their zone. */

export async function uploadFarmImage(
  file: Blob & { name?: string },
  kind: UploadKind,
  farmerId?: string | null,
): Promise<{ url: string | null; err: string | null }> {
  const fromName = (file.name ?? '').split('.').pop()?.toLowerCase() ?? ''
  const fromType = (file.type ?? '').split('/')[1]?.toLowerCase() ?? ''
  const ext = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'].includes(fromName) ? fromName : (fromType || 'jpg')
  const r = await fetch('/api/uploads/farm-image', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, ext, farmerId: farmerId ?? undefined }),
  }).catch(() => null)
  const j = r ? await r.json().catch(() => null) : null
  if (!r || !r.ok || !j?.token) return { url: null, err: `Upload failed: ${j?.error ?? 'please check your connection'}` }
  const { error } = await supabase.storage.from('farm-images').uploadToSignedUrl(j.path, j.token, file, { contentType: j.contentType })
  if (error) return { url: null, err: `Upload failed: ${error.message}` }
  return { url: j.publicUrl as string, err: null }
}
