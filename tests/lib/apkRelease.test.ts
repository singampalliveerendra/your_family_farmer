import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { APK_AVAILABLE, APK_URL } from '@/lib/apkRelease'

// On 2026-09-09 gogrameen.in was serving the STAGING Android build to every
// visitor: package in.gogrameen.app.staging, label "Go Grameen (Test)", wired
// to the staging server, so orders placed in it landed in a database nobody
// reads. Nothing failed loudly — the download button worked perfectly and
// handed over the wrong file. These tests are the loud failure that was
// missing.

const repo = resolve(__dirname, '../..')
const apkPath = resolve(repo, 'public', APK_URL.replace(/^\//, ''))
const assetlinksPath = resolve(repo, 'public/.well-known/assetlinks.json')

describe('the APK offered for download', () => {
  // USE: the two must agree. A file present with the switch off is a file
  // reachable at its direct URL by anyone who saved the link — which is
  // exactly how the test build stayed live after the button was hidden.
  it('exists if and only if it is switched on', () => {
    expect(
      existsSync(apkPath),
      APK_AVAILABLE
        ? `APK_AVAILABLE is true but ${APK_URL} is missing — the button serves a 404`
        : `APK_AVAILABLE is false but ${APK_URL} is still committed — it stays fetchable at its direct URL`,
    ).toBe(APK_AVAILABLE)
  })

  // USE: the actual regression. A staging build must never be the file on
  // offer again — its applicationId ends in .staging and it talks to staging.
  it('is not a staging build when one is offered', () => {
    if (!APK_AVAILABLE) return
    const bytes = readFileSync(apkPath)
    const text = bytes.toString('latin1')
    expect(text, 'the committed APK is a STAGING build').not.toContain('.app.staging')
    expect(text, 'the committed APK points at a vercel.app host').not.toContain('vercel.app')
  })
})

describe('assetlinks.json', () => {
  // An entry here is a formal statement that an app IS this site. Naming a
  // test package means the real domain vouches for the test app.
  it('never verifies a staging package against the real domain', () => {
    const raw = readFileSync(assetlinksPath, 'utf8')
    expect(raw).not.toContain('.staging')
    // Valid JSON, and an array — Android rejects anything else outright.
    const parsed = JSON.parse(raw)
    expect(Array.isArray(parsed)).toBe(true)
  })

  // While no Android app ships, claiming nothing is the honest answer.
  it('claims nothing while no APK is offered', () => {
    if (APK_AVAILABLE) return
    expect(JSON.parse(readFileSync(assetlinksPath, 'utf8'))).toHaveLength(0)
  })
})
