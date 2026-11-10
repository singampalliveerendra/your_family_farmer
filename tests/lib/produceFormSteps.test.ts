import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Client, 2026-11-05: the produce form in numbered steps, each following from
// the last. Regrouped 2026-11-10: shelf life, availability, photos, and the
// Story and Quality details subsections all moved into step 1 "What are you
// selling?". Then (client card 2026-11-10) "How do you want to sell?" below
// it: Retail / Wholesale / Both, the unit, packs and prices
// (src/components/SellHowFields.tsx). So 4 steps: what → how do you want to
// sell → how much & when → delivery. Pins the ORDER in both forms.

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const inOrder = (s: string, marks: string[]) => {
  const at = marks.map((m) => {
    const i = s.indexOf(m)
    expect(i, `missing: ${m}`).toBeGreaterThan(-1)
    return i
  })
  expect(at).toEqual([...at].sort((a, b) => a - b))
}

describe('farmer / aggregator produce form', () => {
  const f = src('src/app/farmer/dashboard/page.tsx')
  const form = f.slice(f.indexOf('function ProduceListingForm({'), f.indexOf('function PreviewModal('))
  it('runs in the 4 steps, in order, with Story and Quality inside step 1', () => {
    inOrder(form, [
      "<FormStep n={1} title={L('What are you selling?'", '{/* Emoji picker */}', '{/* Name + variety */}', '{/* Who grew it', '{/* Category (#9)', '{/* Farming method */}',
      '{/* Shelf life (required)', '{/* Availability window', '{/* Produce photos',
      "<FormSubsection title={L('Story'", '{/* Description */}', '{/* Video link',
      "<FormSubsection title={L('Quality details (optional)'", '{/* Quality params */}',
      "<FormStep n={2} title={L('How do you want to sell?'", '<SellHowFields',
      "<FormStep n={3} title={L('How much, and when?'", '{/* Quantity. The label', '<HarvestManager',
      "<FormStep n={4} title={L('Delivery'", '{/* Delivery method', 'part="transport"',
      '{/* Preview + Publish buttons */}',
    ])
    expect(form).not.toMatch(/<FormStep n=\{5\}|Photos and story|Who buys it, and at what price|part="sale"/)
  })
  it('quality is optional and closed by default; Story is always open', () => {
    expect(form).toMatch(/title=\{L\('Quality details \(optional\)'[^>]*\} collapsible>/)
    expect(form).not.toMatch(/title=\{L\('Story'[^>]*collapsible/)
    expect(f).toMatch(/if \(collapsible\) \{\s*return \(\s*<details className="group/)
  })
  it('the error message sits by the Publish button, never inside the closed Quality box', () => {
    const q = form.indexOf('{/* Quality params */}')
    const err = form.indexOf('{error && (', q)
    expect(err).toBeGreaterThan(form.indexOf("<FormStep n={4}"))
    expect(err).toBeLessThan(form.indexOf('{/* Preview + Publish buttons */}'))
  })
})

describe('moderator produce form (parity)', () => {
  const m = src('src/app/moderator/listings/ListingForm.tsx')
  it('runs in the same 4 steps, in order, with Story and Quality inside step 1', () => {
    inOrder(m, [
      '<ModStep n={1} title="What are you selling?">', '<Field label="Farmer *">', 'Icon</span>', '<Field label="Harvest name *">', '<Field label="Category">', '<Field label="Method">',
      '<Field label="Shelf life (days) *">', '<Field label="Available from">', '{/* Photos */}',
      '<ModSubsection title="Story">', '<Field label="Description">', '<Field label="Video link (optional)">',
      '<ModSubsection title="Quality details (optional)" collapsible>', '<Field label="Brix (sweetness)">', '<Field label="Soil pH">',
      '<ModStep n={2} title="How do you want to sell?">', '<SellHowFields',
      '<ModStep n={3} title="How much, and when?">', '<Field label="Stock available">',
      '<ModStep n={4} title="Delivery">', '{/* Delivery method', 'part="transport"',
    ])
    expect(m).not.toMatch(/<ModStep n=\{5\}|Photos and story|Who buys it, and at what price|part="sale"/)
  })
})

describe('the wholesale part split', () => {
  const w = src('src/components/WholesaleFields.tsx')
  it("transport sits in Delivery ('transport' part), not inside the price step", () => {
    expect(w).toMatch(/part\?: 'all' \| 'sale' \| 'transport'/)
    expect(w).toMatch(/\{part === 'all' && transportBlock\}/)
  })
  it('the grower note no longer promises the phone', () => {
    for (const p of ['src/components/SourceFarmerPicker.tsx', 'src/components/SourceFarmersManager.tsx']) {
      expect(src(p)).not.toMatch(/name, village and phone/)
    }
  })
})
