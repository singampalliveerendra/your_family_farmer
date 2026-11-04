import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { FARMER_HIDDEN_COLUMNS, FARMER_PUBLIC_COLUMNS } from '@/lib/farmerColumns'
import { MAX_UPLOAD_BYTES, UPLOAD_EXTS } from '@/lib/sellerWriteRules'

// Guard for the security fix (scripts/seller-writes-lockdown.sql, 2026-11-05).
// Once the public key loses write rights and the hidden farmer columns, any
// browser code that still writes these tables — or names a hidden column in a
// select — fails for real users. These tests catch that before it ships, and
// keep the SQL, the schema snapshot and the code in step.

const ROOT = process.cwd()
const sql = (f: string) => readFileSync(join(ROOT, 'scripts', f), 'utf8').replace(/--.*$/gm, '')

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(n) ? [p] : []
  })
}
/** Everything that runs with the public key: browser code, and server code using src/lib/supabase. */
const anonFiles = files(join(ROOT, 'src'))
  .filter((p) => !p.includes(`${join('src', 'app', 'api')}`) || readFileSync(p, 'utf8').includes("from '@/lib/supabase'"))
  .map((p) => ({ p: p.slice(ROOT.length + 1), s: readFileSync(p, 'utf8') }))
  .filter(({ s }) => s.includes("from '@/lib/supabase'"))

const LOCKED = ['produce_listings', 'harvests', 'farmers', 'media', 'demand_intents', 'source_farmers']

describe('no public-key writes left in the app', () => {
  it('nothing inserts / updates / deletes a locked table with the public key', () => {
    const bad: string[] = []
    for (const { p, s } of anonFiles) {
      for (const m of s.matchAll(/from\(\s*'([a-z_]+)'\s*\)\s*\.(insert|update|upsert|delete)\(/g)) {
        if (LOCKED.includes(m[1])) bad.push(`${p}: ${m[1]}.${m[2]}`)
      }
    }
    expect(bad).toEqual([])
  })
  it('nothing reads demand_intents with the public key', () => {
    expect(anonFiles.filter(({ s }) => /from\(\s*'demand_intents'\s*\)/.test(s)).map(({ p }) => p)).toEqual([])
  })
  it('photos go up only through the signed link, never a direct upload / remove', () => {
    const bad = anonFiles.filter(({ s }) => /storage\s*\.from\([^)]*\)\s*\.(upload|update|remove|move|copy|list)\(/.test(s)).map(({ p }) => p)
    expect(bad).toEqual([])
  })
})

describe('no public-key reads of hidden fields', () => {
  const hiddenIn = (cols: string, hidden: readonly string[]) =>
    hidden.filter((h) => new RegExp(`(^|[\\s,(])${h}(\\s*[,)]|\\s*$)`).test(cols))
  it('farmers selects and embeds name no hidden column', () => {
    const bad: string[] = []
    for (const { p, s } of anonFiles) {
      for (const m of s.matchAll(/from\(\s*'farmers'\s*\)\s*\.select\(\s*(['`])([\s\S]*?)\1/g)) {
        const hit = hiddenIn(m[2], FARMER_HIDDEN_COLUMNS)
        if (hit.length || m[2].trim() === '*') bad.push(`${p}: ${hit.join(',') || '*'}`)
      }
      for (const m of s.matchAll(/farmers(?:![a-z_]+)?\(([^)]*)\)/g)) {
        const hit = hiddenIn(m[1], FARMER_HIDDEN_COLUMNS)
        if (hit.length || m[1].trim() === '*') bad.push(`${p}: embed ${hit.join(',') || '*'}`)
      }
    }
    expect(bad).toEqual([])
  })
  it("growers: only name and village are read", () => {
    const bad: string[] = []
    for (const { p, s } of anonFiles) {
      for (const m of s.matchAll(/source_farmers\(([^)]*)\)|from\(\s*'source_farmers'\s*\)\s*\.select\(\s*'([^']*)'/g)) {
        const cols = (m[1] ?? m[2]).split(',').map((c) => c.trim())
        const extra = cols.filter((c) => !['id', 'name', 'village', 'aggregator_id'].includes(c))
        if (extra.length) bad.push(`${p}: ${extra.join(',')}`)
      }
    }
    expect(bad).toEqual([])
  })
})

describe.each(['seller-writes-lockdown.sql', 'staging-schema.sql'])('%s', (file) => {
  const s = sql(file)
  it('no public write policies remain on the locked tables', () => {
    expect(s).not.toMatch(/CREATE POLICY[^;]*ON public\.(produce_listings|harvests|media|farmers|demand_intents) FOR (INSERT|UPDATE|DELETE|ALL)/)
    expect(s).not.toMatch(/CREATE POLICY[^;]*ON public\.demand_intents FOR SELECT/)
  })
  it('the public key loses write rights', () => {
    expect(s).toMatch(/REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES\s+ON public\.produce_listings, public\.harvests, public\.media/)
    expect(s).toMatch(/REVOKE ALL ON public\.demand_intents FROM anon, authenticated/)
    expect(s).not.toMatch(/GRANT UPDATE \([^)]*\) ON public\.farmers TO anon/)
  })
  it('growers keep name + village only', () => {
    expect(s).toMatch(/GRANT SELECT \(id, aggregator_id, name, village, created_at, updated_at\)\s+ON public\.source_farmers/)
  })
})

describe('the lockdown SQL matches the code', () => {
  const s = sql('seller-writes-lockdown.sql')
  it('revokes exactly FARMER_HIDDEN_COLUMNS', () => {
    const m = s.match(/REVOKE SELECT \(([^)]*)\)\s+ON public\.farmers/)
    expect(m).not.toBeNull()
    expect(m![1].split(',').map((c) => c.trim()).sort()).toEqual([...FARMER_HIDDEN_COLUMNS].sort())
  })
  it('the bucket limit = MAX_UPLOAD_BYTES, types = UPLOAD_EXTS', () => {
    expect(s).toMatch(new RegExp(`file_size_limit = ${MAX_UPLOAD_BYTES}`))
    const types = new Set(UPLOAD_EXTS.map((e) => (e === 'jpg' || e === 'jpeg' ? 'image/jpeg' : `image/${e}`)))
    const m = s.match(/allowed_mime_types = ARRAY\[([^\]]*)\]/)
    expect(new Set(m![1].split(',').map((x) => x.trim().replace(/'/g, '')))).toEqual(types)
  })
  it('drops every public write policy on farm-images storage, and the list policy', () => {
    for (const n of ['upload', 'update', 'delete', 'read']) expect(s).toMatch(new RegExp(`DROP POLICY IF EXISTS "farm-images public ${n}"\\s+ON storage\\.objects`))
    expect(s).not.toMatch(/CREATE POLICY/)
  })
  it('the schema snapshot grants the public no hidden farmer column', () => {
    const schema = sql('staging-schema.sql')
    for (const m of schema.matchAll(/GRANT SELECT \(([^)]*)\) ON public\.farmers/g)) {
      const cols = m[1].split(',').map((c) => c.trim())
      for (const h of FARMER_HIDDEN_COLUMNS) expect(cols).not.toContain(h)
    }
    // …and still every column the public pages ask for (else the whole query fails).
    const granted = [...schema.matchAll(/GRANT SELECT \(([^)]*)\) ON public\.farmers/g)].flatMap((m) => m[1].split(',').map((c) => c.trim()))
    for (const c of FARMER_PUBLIC_COLUMNS.split(',').map((x) => x.trim())) expect(granted).toContain(c)
  })
  it('storage-buckets-all.sql no longer creates public write policies', () => {
    const b = sql('storage-buckets-all.sql')
    expect(b).not.toMatch(/CREATE POLICY "farm-images public (upload|update|delete|read)"/)
  })
})
