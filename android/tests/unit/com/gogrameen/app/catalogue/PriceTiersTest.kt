package com.gogrameen.app.catalogue

import com.gogrameen.app.Lang
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/* The bulk-price ladder on the product screen.
 *
 * These rows are a description of getTierPrice in src/lib/pricing.ts — the
 * function that decides what a buyer is actually charged. If a row here says
 * one thing and the invoice says another, the app has lied about a price. So
 * each test states what getTierPrice would charge and checks the row agrees. */
class PriceTiersTest {

    private fun listing(
        p1: Double? = 10.0,
        q1: Double? = 5.0,
        q2: Double? = null,
        p2: Double? = null,
        p3: Double? = null,
    ) = Listing(
        id = "a", name = "Rice", unit = "kg",
        priceTier1 = p1, priceTier1Qty = q1, priceTier2Qty = q2, priceTier2 = p2, priceTier3 = p3,
    )

    @Test
    fun `three tiers`() {
        // getTierPrice: <=5 → 10, 5..20 → 9, >20 → 8.
        val tiers = listing(q2 = 20.0, p2 = 9.0, p3 = 8.0).priceTiers()

        assertEquals(
            listOf(
                PriceTier(TierBand.UpTo, from = 5.0, price = 10.0),
                PriceTier(TierBand.Between, from = 5.0, to = 20.0, price = 9.0),
                PriceTier(TierBand.Above, from = 20.0, price = 8.0),
            ),
            tiers,
        )
    }

    @Test
    fun `tier two is up to its quantity, not from it`() {
        // The website labels this row "20+ kg". getTierPrice charges tier 2
        // for 6 to 20 kg and tier 3 from 21 kg -- so "20+" is wrong there, and
        // must not be copied here.
        val labels = listing(q2 = 20.0, p2 = 9.0, p3 = 8.0).priceTiers().map { it.label("kg", Lang.EN) }

        assertEquals(listOf("Up to 5 kg", "5 – 20 kg", "Over 20 kg"), labels)
    }

    @Test
    fun `with no tier three, tier two carries on above its ceiling`() {
        // getTierPrice: qty > q2 falls back to p2 when p3 is missing.
        assertEquals(
            listOf(
                PriceTier(TierBand.UpTo, from = 5.0, price = 10.0),
                PriceTier(TierBand.Above, from = 5.0, price = 9.0),
            ),
            listing(q2 = 20.0, p2 = 9.0).priceTiers(),
        )
    }

    @Test
    fun `with no tier two, tier three starts after tier one`() {
        assertEquals(
            listOf(
                PriceTier(TierBand.UpTo, from = 5.0, price = 10.0),
                PriceTier(TierBand.Above, from = 5.0, price = 8.0),
            ),
            listing(p3 = 8.0).priceTiers(),
        )
    }

    @Test
    fun `one price is not a ladder`() {
        // Already shown large at the top; a one-row table says it twice.
        assertTrue(listing().priceTiers().isEmpty())
    }

    @Test
    fun `no tier-one quantity means a flat price, whatever else is set`() {
        // getTierPrice returns pricePerKg when priceTier1Qty is missing.
        assertTrue(listing(q1 = null, q2 = 20.0, p2 = 9.0, p3 = 8.0).priceTiers().isEmpty())
    }

    @Test
    fun `part-unit quantities read naturally`() {
        val tiers = Listing(
            id = "m", unit = "kg", priceTier1 = 40.0, priceTier1Qty = 0.25, priceTier3 = 150.0,
        ).priceTiers()
        assertEquals("Up to 0.25 kg", tiers.first().label("kg", Lang.EN))
    }

    @Test
    fun `labels in Telugu`() {
        val labels = listing(q2 = 20.0, p2 = 9.0, p3 = 8.0).priceTiers().map { it.label("కేజీ", Lang.TE) }
        assertEquals(listOf("5 కేజీ వరకు", "5 – 20 కేజీ", "20 కేజీ పైగా"), labels)
    }

    // ── photos ─────────────────────────────────────────────────────────────

    @Test
    fun `every photo, main first, no repeats`() {
        val l = Listing(
            id = "a",
            imageUrl = "https://cdn/1.jpg",
            imageUrls = listOf("https://cdn/1.jpg", " ", "https://cdn/2.jpg"),
        )
        assertEquals(listOf("https://cdn/1.jpg", "https://cdn/2.jpg"), l.photoUrls)
    }

    @Test
    fun `no photos at all`() {
        assertTrue(Listing(id = "a").photoUrls.isEmpty())
    }
}
