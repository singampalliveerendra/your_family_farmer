import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Client, 2026-11-05: the produce form is 6 steps, each following from the
// last — what → how much & when → who buys & price → delivery → photos &
// story → quality (optional, closed). Pins the ORDER in both forms.

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
  it('runs in the 6 steps, in order', () => {
    inOrder(form, [
      "<FormStep n={1} title={L('What are you selling?'", '{/* Emoji picker */}', '{/* Name + variety */}', '{/* Who grew it', '{/* Category (#9)', '{/* Farming method */}',
      "<FormStep n={2} title={L('How much, and when?'", '{/* Unit selector */}', '{/* Quantity. The label', '{/* Sale step. Sits', '{/* Shelf life (required)', '{/* Availability window',
      "<FormStep n={3} title={L('Who buys it, and at what price?'", 'part="sale"', '{/* Household bulk prices',
      "<FormStep n={4} title={L('Delivery'", '{/* Delivery method', 'part="transport"',
      "<FormStep n={5} title={L('Photos and story'", '{/* Produce photos', '{/* Description */}', '{/* Video link',
      "{L('Quality details (optional)'", '{/* Quality params */}',
      '{/* Preview + Publish buttons */}',
    ])
  })
  it('quality is optional and closed by default', () => {
    expect(form).toMatch(/<details className="group[^"]*">\s*<summary/)
  })
})

describe('moderator produce form (parity)', () => {
  const m = src('src/app/moderator/listings/ListingForm.tsx')
  it('runs in the same 6 steps, in order', () => {
    inOrder(m, [
      '<ModStep n={1} title="What are you selling?">', '<Field label="Farmer *">', 'Icon</span>', '<Field label="Harvest name *">', '<Field label="Category">', '<Field label="Method">',
      '<ModStep n={2} title="How much, and when?">', '<Field label="Unit">', '<Field label="Stock available">', '<Field label="Sell in multiples of">', '<Field label="Shelf life (days) *">', '<Field label="Available from">',
      '<ModStep n={3} title="Who buys it, and at what price?">', 'part="sale"', '{/* Household bulk prices',
      '<ModStep n={4} title="Delivery">', '{/* Delivery method', 'part="transport"',
      '<ModStep n={5} title="Photos and story">', '{/* Photos */}', '<Field label="Description">', '<Field label="Video link (optional)">',
      'Quality details (optional)', '<Field label="Brix (sweetness)">', '<Field label="Soil pH">',
    ])
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
