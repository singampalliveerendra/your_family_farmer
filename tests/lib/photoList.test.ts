import { describe, it, expect } from 'vitest'
import {
  photosFromSaved, newPhoto, screenPhotoFiles, removePhoto, makeCover, resolvePhotoUrls, MAX_PHOTO_BYTES,
} from '@/lib/photoList'

const file = (name: string, type = 'image/jpeg', size = 1000) =>
  new File([new Uint8Array(size)], name, { type })

describe('photosFromSaved', () => {
  it('puts the cover first and does not repeat it from image_urls', () => {
    const list = photosFromSaved('a.jpg', ['a.jpg', 'b.jpg', 'c.jpg'])
    expect(list.map((p) => p.url)).toEqual(['a.jpg', 'b.jpg', 'c.jpg'])
  })

  it('handles no cover, blanks and nulls', () => {
    expect(photosFromSaved(null, ['b.jpg', '', null, 'b.jpg']).map((p) => p.url)).toEqual(['b.jpg'])
    expect(photosFromSaved(undefined, null)).toEqual([])
    expect(photosFromSaved('a.jpg', null).map((p) => p.url)).toEqual(['a.jpg'])
  })
})

describe('screenPhotoFiles', () => {
  it('keeps good images and reports the first problem', () => {
    const r = screenPhotoFiles([file('a.jpg'), file('doc.pdf', 'application/pdf'), file('big.jpg', 'image/jpeg', MAX_PHOTO_BYTES + 1)])
    expect(r.ok.map((f) => f.name)).toEqual(['a.jpg'])
    expect(r.problem).toBe('type')
  })

  it('reports size when only a big file is skipped', () => {
    expect(screenPhotoFiles([file('big.jpg', 'image/jpeg', 50)], 10)).toEqual({ ok: [], problem: 'size' })
  })

  it('reports nothing when every file is fine', () => {
    expect(screenPhotoFiles([file('a.jpg'), file('b.png', 'image/png')]).problem).toBeNull()
  })
})

describe('removePhoto / makeCover', () => {
  const list = photosFromSaved('a.jpg', ['b.jpg', 'c.jpg'])

  it('removing the cover makes the next photo the cover', () => {
    expect(removePhoto(list, 'a.jpg').map((p) => p.url)).toEqual(['b.jpg', 'c.jpg'])
  })

  it('makeCover moves a photo to the front and keeps the others in order', () => {
    expect(makeCover(list, 'c.jpg').map((p) => p.url)).toEqual(['c.jpg', 'a.jpg', 'b.jpg'])
  })

  it('makeCover on the cover or an unknown key changes nothing', () => {
    expect(makeCover(list, 'a.jpg')).toBe(list)
    expect(makeCover(list, 'zzz')).toBe(list)
  })

  it('new picks get unique keys', () => {
    expect(newPhoto(file('x.jpg'), 'blob:1').key).not.toBe(newPhoto(file('x.jpg'), 'blob:1').key)
  })
})

describe('resolvePhotoUrls', () => {
  it('uploads new picks and keeps the order, cover first', async () => {
    const list = [newPhoto(file('new1.jpg'), 'blob:1'), ...photosFromSaved('saved.jpg', null), newPhoto(file('new2.jpg'), 'blob:2')]
    const urls = await resolvePhotoUrls(list, async (f) => `https://cdn/${f.name}`)
    expect(urls).toEqual(['https://cdn/new1.jpg', 'saved.jpg', 'https://cdn/new2.jpg'])
  })

  it('returns null when an upload fails, so the save stops', async () => {
    const list = [newPhoto(file('ok.jpg'), 'blob:1'), newPhoto(file('bad.jpg'), 'blob:2')]
    expect(await resolvePhotoUrls(list, async (f) => (f.name === 'bad.jpg' ? null : 'u'))).toBeNull()
  })

  it('returns an empty list when there are no photos', async () => {
    expect(await resolvePhotoUrls([], async () => 'u')).toEqual([])
  })
})
