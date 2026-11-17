// Ordered photo list for the produce forms (farmer dashboard + moderator).
// One list, first item = the cover buyers see on the card (image_url); the
// rest are the extra gallery photos. Saved photos carry their public URL; new
// picks carry the File plus an object-URL preview until the form is saved.

export type PhotoItem = {
  key: string
  url: string
  file?: File
}

export const MAX_PHOTO_BYTES = 8 * 1024 * 1024

// Produce photos are kept sharper than other uploads (2026-11-18). At the old
// 800px a portrait photo was only 600px wide, stretched across a phone screen
// that needs ~1100px — so it looked soft, and label text could not be read
// even when zoomed. 1280px / 0.8 is ~150–250 KB per photo.
export const PRODUCE_PHOTO_MAX_PX = 1280
export const PRODUCE_PHOTO_QUALITY = 0.8

// Below this on its longest side a photo is a thumbnail (e.g. 96 × 96 saved
// from a shop website) and is blurry on every screen, so it is refused.
// Prod on 2026-11-18 had 37 such photos, nearly all 2nd/3rd gallery photos.
export const MIN_PHOTO_PX = 400

export function photoTooSmall(width: number, height: number): boolean {
  // 0 × 0 means the browser could not read the size (e.g. HEIC) — let it through.
  if (!(width > 0) || !(height > 0)) return false
  return Math.max(width, height) < MIN_PHOTO_PX
}

let seq = 0
const nextKey = () => `p${Date.now().toString(36)}-${(seq++).toString(36)}`

// Builds the list from what the DB holds: cover first, then image_urls in
// order, without blanks or the cover repeated (image_urls includes it).
export function photosFromSaved(cover: string | null | undefined, urls: (string | null)[] | null | undefined): PhotoItem[] {
  const seen = new Set<string>()
  const out: PhotoItem[] = []
  for (const u of [cover, ...(urls ?? [])]) {
    if (!u || seen.has(u)) continue
    seen.add(u)
    out.push({ key: u, url: u })
  }
  return out
}

export function newPhoto(file: File, previewUrl: string): PhotoItem {
  return { key: nextKey(), url: previewUrl, file }
}

// Splits a picked batch into usable images and the reason the rest were
// skipped. Only the first problem is reported; the good files still go in.
export function screenPhotoFiles(files: File[], maxBytes = MAX_PHOTO_BYTES): { ok: File[]; problem: 'type' | 'size' | null } {
  const ok: File[] = []
  let problem: 'type' | 'size' | null = null
  for (const f of files) {
    if (!f.type.startsWith('image/')) { problem ??= 'type'; continue }
    if (f.size > maxBytes) { problem ??= 'size'; continue }
    ok.push(f)
  }
  return { ok, problem }
}

// Removing the cover promotes the next photo, since the cover is just item 0.
export function removePhoto(list: PhotoItem[], key: string): PhotoItem[] {
  return list.filter((p) => p.key !== key)
}

export function makeCover(list: PhotoItem[], key: string): PhotoItem[] {
  const i = list.findIndex((p) => p.key === key)
  if (i <= 0) return list
  return [list[i], ...list.slice(0, i), ...list.slice(i + 1)]
}

// Uploads the new picks in list order and returns the final URL list (cover
// first). Returns null if any upload fails, so the caller can stop the save
// rather than quietly dropping a photo the seller chose.
export async function resolvePhotoUrls(
  list: PhotoItem[],
  upload: (file: File) => Promise<string | null>,
): Promise<string[] | null> {
  const out: string[] = []
  for (const p of list) {
    if (!p.file) { out.push(p.url); continue }
    const u = await upload(p.file)
    if (!u) return null
    out.push(u)
  }
  return out
}
