import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

// Vercel bills every image it resizes. On 2026-10-15 those transformations
// went over the Hobby limit and Vercel paused the whole site, so images are
// served straight from Supabase (`images.unoptimized: true`). But the
// /_next/image endpoint STILL resizes — and bills — when something calls it
// directly: the farmer Share button did until 2026-11-09. These guard both.

const ROOT = join(__dirname, '../..')
const SRC = join(ROOT, 'src')

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return files(p)
    return /\.(ts|tsx)$/.test(name) ? [p] : []
  })
}

// The proxy matcher only names the path to skip it; it never fetches it.
const ALLOWED = new Set(['src/proxy.ts'])

describe('no Vercel image optimisation', () => {
  it('next.config keeps images unoptimized', () => {
    const name = readdirSync(ROOT).find((f) => /^next\.config\.(ts|mjs|js)$/.test(f))
    expect(name).toBeTruthy()
    const cfg = readFileSync(join(ROOT, name!), 'utf8')
    expect(cfg).toMatch(/unoptimized:\s*true/)
  })

  it('no source file builds a /_next/image URL', () => {
    const offenders = files(SRC)
      .map((p) => relative(ROOT, p).split('\\').join('/'))
      .filter((rel) => !ALLOWED.has(rel))
      .filter((rel) => readFileSync(join(ROOT, rel), 'utf8').includes('_next/image'))
    expect(offenders).toEqual([])
  })
})
