// Tier-pricing helper, shared between the client cart and the server place-order
// endpoint so the totals stay in lockstep no matter which side computes them.

export type TierInputs = {
  pricePerKg?: number | null
  priceTier1Qty?: number | null
  priceTier1Price?: number | null
  priceTier2Qty?: number | null
  priceTier2Price?: number | null
  priceTier3Price?: number | null
}

export function getTierPrice(qty: number, item: TierInputs): number | null {
  const {
    pricePerKg,
    priceTier1Qty,
    priceTier1Price,
    priceTier2Qty,
    priceTier2Price,
    priceTier3Price,
  } = item

  if (priceTier1Qty == null || priceTier1Price == null) {
    return pricePerKg ?? null
  }
  if (qty <= priceTier1Qty) return priceTier1Price
  if (priceTier2Qty != null && priceTier2Price != null) {
    if (qty <= priceTier2Qty) return priceTier2Price
    return priceTier3Price ?? priceTier2Price
  }
  if (priceTier3Price != null) return priceTier3Price
  return priceTier1Price
}
