import { describe, it, expect } from 'vitest'
import { etagOf, isNotModified } from '@/lib/etag'

describe('etag', () => {
  it('fingerprints the body: same body, same tag; any change, new tag', () => {
    const a = JSON.stringify({ orders: [{ id: 1, status: 'pending' }] })
    const b = JSON.stringify({ orders: [{ id: 1, status: 'approved' }] })
    expect(etagOf(a)).toBe(etagOf(a))
    expect(etagOf(a)).not.toBe(etagOf(b))
    expect(etagOf(a)).toMatch(/^".+"$/)
  })

  it('answers not-modified only for a matching tag', () => {
    const tag = etagOf('x')
    expect(isNotModified(tag, tag)).toBe(true)
    expect(isNotModified(`W/${tag}`, tag)).toBe(true)
    expect(isNotModified(`"other", ${tag}`, tag)).toBe(true)
    expect(isNotModified('"other"', tag)).toBe(false)
    expect(isNotModified(null, tag)).toBe(false)
  })
})

describe('jsonWithEtag', async () => {
  const { jsonWithEtag } = await import('@/lib/etag')
  const { NextRequest } = await import('next/server')
  const body = { orders: [{ id: 'a' }] }

  it('sends the body with its tag, then an empty 304 when the client already has it', async () => {
    const first = jsonWithEtag(new NextRequest('http://x/api/farmer/orders'), body)
    expect(first.status).toBe(200)
    expect(await first.json()).toEqual(body)
    const tag = first.headers.get('ETag')!

    const again = jsonWithEtag(new NextRequest('http://x/api/farmer/orders', { headers: { 'If-None-Match': tag } }), body)
    expect(again.status).toBe(304)
    expect(await again.text()).toBe('')
  })

  it('sends the full body again once anything changed', () => {
    const tag = jsonWithEtag(new NextRequest('http://x'), body).headers.get('ETag')!
    const changed = jsonWithEtag(new NextRequest('http://x', { headers: { 'If-None-Match': tag } }), { orders: [] })
    expect(changed.status).toBe(200)
  })
})
