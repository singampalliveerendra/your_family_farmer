import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// 2026-11-09: two 2 MB raw camera photos reached prod through the moderator
// produce form because it uploaded picked files as-is (fixed on prod in
// 729479c3). Since the shared PhotoPicker (33106aaa) the moderator form
// uploads through it, and the picker shrinks every photo to 800px / 0.7 first.
// Guard both halves so neither can quietly go back to raw uploads.
const read = (p: string) => readFileSync(join(__dirname, '../..', p), 'utf8')

describe('moderator produce form photo upload', () => {
  it('the moderator form uploads through the shared PhotoPicker', () => {
    const form = read('src/app/moderator/listings/ListingForm.tsx')
    expect(form).toMatch(/import PhotoPicker from '@\/components\/PhotoPicker'/)
    expect(form).toMatch(/<PhotoPicker[\s\S]*?upload=\{\(f\) => uploadFarmImage\(f, 'produce'/)
  })

  it('the picker compresses every file before uploading it', () => {
    const picker = read('src/components/PhotoPicker.tsx')
    // 2026-11-18: produce photos go up at 1280px / 0.8 (sharper), and tiny
    // thumbnails are refused between the compress and the upload.
    expect(picker).toMatch(/const \{ file: c, width, height \} = await compressPhoto\(f, PRODUCE_PHOTO_MAX_PX, PRODUCE_PHOTO_QUALITY\)\s*\n\s*if \(photoTooSmall\(width, height\)\) \{ tooSmall\+\+; continue \}\s*\n\s*const url = upload \? await upload\(c\)/)
  })

  it('the compressor defaults to 800px at quality 0.7', () => {
    expect(read('src/lib/compressImage.ts')).toMatch(/export async function compressImage\(file: File, maxPx = 800, quality = 0\.7\)/)
  })
})
