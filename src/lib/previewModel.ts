import { unitAllowsFractions } from './saleStep'

/**
 * The pure model behind the farmer's buyer-preview (584f912, 7aa053f) and the
 * save payload that publishes what the preview showed (5d2a176).
 *
 * It lives here rather than inside the dashboard component for two reasons.
 * The preview's whole promise is that it shows what the BUYER will see, so the
 * arithmetic behind it is worth pinning; and `resolveSaleStep` is applied at
 * three separate call sites — the preview and both save paths — which is
 * exactly the shape of the original bug, where the insert path silently did
 * not carry the step the farmer had picked.
 */

/**
 * Parse a number out of a produce-form field. An untouched numeric input
 * arrives as the em-dash placeholder rather than an empty string, and neither
 * is a quantity — returning 0 for them would preview a live listing as sold
 * out, and returning NaN would render "NaN kg left" on the mock card.
 */
export function previewNum(v: string | null | undefined): number | null {
  if (v == null) return null
  return v !== '—' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null
}

/**
 * The sale step a listing is actually saved and previewed with.
 *
 * A fractional step is meaningless on a unit that cannot be split — there is
 * no quarter of an egg — so those units are forced back to whole ones however
 * the form was left. An unset, zero or unparseable step means 1, which is how
 * every listing behaved before sale_step existed.
 */
export function resolveSaleStep(unit: string | null | undefined, saleStep: string | number): number {
  if (!unitAllowsFractions(unit)) return 1
  return Number(saleStep) || 1
}

/** Whether the preview's "+ Add" bar is dead, and whether "+" has hit stock. */
export function previewAvailability(stock: number | null, qty: number | null) {
  return {
    soldOut: stock === 0,
    atMax: qty != null && stock != null && qty >= stock,
  }
}

/**
 * The "buy more, save more" ladder, as rows. Labels stay in the component so
 * this file holds no UI strings — what belongs here is WHICH rows appear for a
 * partly-filled form, since a farmer previews long before every tier is typed.
 */
export type PreviewTier = { kind: 'base' | 'mid' | 'bulk'; qty: number | null; price: number }

export function previewTiers(data: {
  price: string
  tier1Qty: string
  tier2Qty: string
  price2: string
  price3: string
}): PreviewTier[] {
  const tiers: PreviewTier[] = []
  const priceNum = previewNum(data.price)
  // No price typed yet means no ladder to head — the base row IS the price.
  if (priceNum != null) {
    tiers.push({ kind: 'base', qty: Number(data.tier1Qty) || 1, price: priceNum })
  }
  // A tier needs BOTH its quantity and its price; half of one is not yet a tier.
  if (data.tier2Qty && data.price2) {
    tiers.push({ kind: 'mid', qty: Number(data.tier2Qty), price: Number(data.price2) })
  }
  // Bulk is open-ended, so it has a price but no quantity of its own.
  if (data.price3) {
    tiers.push({ kind: 'bulk', qty: null, price: Number(data.price3) })
  }
  return tiers
}
