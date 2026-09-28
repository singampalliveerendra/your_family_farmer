package com.gogrameen.app.catalogue

import com.gogrameen.app.Lang
import com.gogrameen.app.l

/* The "buy more, pay less" ladder, as rows a buyer can read.
 *
 * This DESCRIBES the prices; it never computes what anyone pays. The charge is
 * worked out on the server by getTierPrice (src/lib/pricing.ts) when an order
 * is placed. These rows are that same function read out loud, so its edges
 * are copied exactly and must move with it:
 *
 *   qty <= tier1Qty                      → tier 1
 *   tier1Qty < qty <= tier2Qty           → tier 2
 *   qty > tier2Qty                       → tier 3, or tier 2 when there is none
 *   no tier 2 at all, qty > tier1Qty     → tier 3, or tier 1 when there is none
 *   no tier1Qty                          → one flat price
 *
 * NOTE the website's own table labels tier 2 as "20+ kg". By the function above
 * tier 2 applies UP TO 20 kg, and "20+" is where tier 3 begins — so that label
 * is wrong on the web, and is not copied here. */

enum class TierBand { UpTo, Between, Above }

data class PriceTier(
    val band: TierBand,
    /** UpTo and Above: the one boundary. Between: the lower one. */
    val from: Double,
    /** Between only: the upper boundary. */
    val to: Double? = null,
    val price: Double,
)

/* Only returns a ladder when there IS one — two or more rows. A single price is
 * already shown large at the top of the screen, and a one-row "table" under it
 * reads as the same thing said twice. */
fun Listing.priceTiers(): List<PriceTier> {
    val p1 = priceTier1 ?: return emptyList()
    val q1 = priceTier1Qty ?: return emptyList()
    val q2 = priceTier2Qty
    val p2 = priceTier2
    val p3 = priceTier3

    val rows = mutableListOf(PriceTier(TierBand.UpTo, from = q1, price = p1))
    if (q2 != null && p2 != null) {
        if (p3 != null) {
            rows += PriceTier(TierBand.Between, from = q1, to = q2, price = p2)
            rows += PriceTier(TierBand.Above, from = q2, price = p3)
        } else {
            // No tier 3: tier 2 carries on past its own ceiling.
            rows += PriceTier(TierBand.Above, from = q1, price = p2)
        }
    } else if (p3 != null) {
        rows += PriceTier(TierBand.Above, from = q1, price = p3)
    }
    return if (rows.size > 1) rows else emptyList()
}

/* "Up to 5 kg" · "5 – 20 kg" · "Over 20 kg". The unit is the listing's own,
 * already translated by the caller. */
fun PriceTier.label(unit: String, lang: Lang): String {
    val u = if (unit.isBlank()) "" else " $unit"
    return when (band) {
        TierBand.UpTo -> lang.l("Up to ${formatAmount(from)}$u", "${formatAmount(from)}$u వరకు")
        TierBand.Between -> "${formatAmount(from)} – ${formatAmount(to ?: from)}$u"
        TierBand.Above -> lang.l("Over ${formatAmount(from)}$u", "${formatAmount(from)}$u పైగా")
    }
}
