import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// 2026-11-09: two 2 MB raw camera photos reached prod through the moderator
// produce form because it uploaded picked files as-is. Guard against that.
describe('moderator produce form photo upload', () => {
  const src = readFileSync(join(__dirname, '../../src/app/moderator/listings/ListingForm.tsx'), 'utf8')

  it('imports the shared compressor', () => {
    expect(src).toMatch(/import \{ compressImage \} from '@\/lib\/imageCompress'/)
  })

  it('compresses every picked file to 800px before it is queued for upload', () => {
    const handler = src.slice(src.indexOf('const onAddFiles'), src.indexOf('const removeExisting'))
    expect(handler).toMatch(/compressImage\(f, 800, 0\.7\)/)
    expect(handler).not.toMatch(/setNewFiles\(\(prev\) => \[\.\.\.prev, \.\.\.picked\]\)/)
  })
})
