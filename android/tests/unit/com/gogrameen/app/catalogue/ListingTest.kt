package com.gogrameen.app.catalogue

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/* Local JVM tests for the catalogue's data layer — no emulator, no network.
 *
 * The JSON below is trimmed from a real /api/produce response, keeping the
 * shapes that actually caused decisions in Listing.kt: a listing with a null
 * stock_qty, one that is sold out, one whose photo is only in image_urls, and
 * one with no photo at all. Made-up JSON would test the parser against the
 * schema I imagined rather than the one the route returns. */
class ListingTest {

    private val payload = """
    [
      {
        "id": "acb9f312",
        "name": "Green Chillies",
        "variety": null,
        "unit": "kg",
        "emoji": "🫒",
        "method": "natural",
        "category": "vegetables",
        "description": "Grown beside mango trees.",
        "status": "available",
        "stock_qty": null,
        "shelf_life_days": 10,
        "price_tier_1_price": 57,
        "price_tier_2_price": 55,
        "image_url": "https://cdn.example/chilli.jpg",
        "image_urls": ["https://cdn.example/chilli.jpg"],
        "soil_ph": 6.5,
        "brix": null,
        "farmer": {
          "id": "0e0ef7ef",
          "name": "Korlepara Kapil",
          "village": "Tadepalligudem",
          "method": "natural",
          "account_type": "farmer",
          "pickup_locations": ["Somewhere"],
          "lat": 16.85
        }
      },
      {
        "id": "ac004116",
        "name": "Coconut oil",
        "unit": "kg",
        "status": "sold_out",
        "stock_qty": 0,
        "price_tier_1_price": 400,
        "image_url": null,
        "image_urls": ["https://cdn.example/oil.jpg"],
        "farmer": { "id": "0e0ef7ef", "name": "Korlepara Kapil", "village": "Tadepalligudem" }
      },
      {
        "id": "b0000001",
        "name": "Yedhu gaanuga noone",
        "unit": "kg",
        "status": "available",
        "stock_qty": null,
        "price_tier_1_price": 600,
        "image_url": null,
        "image_urls": [],
        "farmer": { "id": "kamisetti", "name": "Kamisetti Kodhanda Ramayya", "village": "Padala" }
      }
    ]
    """.trimIndent()

    private fun parsed(): List<Listing> = produceJson.decodeFromString(payload)

    @Test
    fun `parses a real response and ignores the columns the app does not read`() {
        // soil_ph, brix, price_tier_2_price and the farmer's pickup_locations are
        // all in the JSON and absent from the model. Strict parsing would throw
        // on every one of them; this is the test that pins ignoreUnknownKeys.
        val listings = parsed()
        assertEquals(3, listings.size)
        assertEquals("Green Chillies", listings[0].name)
        assertEquals("Korlepara Kapil", listings[0].farmer?.name)
    }

    @Test
    fun `a null stock_qty is untracked, not sold out`() {
        // Most live listings carry stock_qty null, meaning the farmer does not
        // count it. Reading that as zero would grey out nearly the whole
        // catalogue -- the single most damaging bug this screen could have.
        val chillies = parsed().first { it.id == "acb9f312" }
        assertFalse(chillies.isSoldOut)
    }

    @Test
    fun `sold out is taken from either the status or the number`() {
        // Both signals matter: the auto-flip writes status, the live number is
        // stock_qty, and older rows can carry one without the other.
        assertTrue(parsed().first { it.id == "ac004116" }.isSoldOut)

        val statusOnly = Listing(id = "x", status = "sold_out", stockQty = null)
        val numberOnly = Listing(id = "y", status = "available", stockQty = 0.0)
        assertTrue(statusOnly.isSoldOut)
        assertTrue(numberOnly.isSoldOut)
    }

    @Test
    fun `a photo missing from image_url is taken from image_urls`() {
        // Not hypothetical: the live Coconut oil listing has image_url null and
        // exactly one URL in the array. Trusting image_url alone would show the
        // emoji placeholder for produce that has a photo.
        assertEquals("https://cdn.example/oil.jpg", parsed().first { it.id == "ac004116" }.photoUrl)
    }

    @Test
    fun `a listing with no photo at all resolves to null`() {
        // An empty image_urls array must not become an empty-string URL, which
        // Coil would try to load and fail on.
        assertNull(parsed().first { it.id == "b0000001" }.photoUrl)
    }

    @Test
    fun `prices lose the decimal point they arrive with`() {
        // JSON numbers decode as Double, so 57 arrives as 57.0. Rupees are whole
        // on every live listing and a card reading "₹57.0" looks broken.
        assertEquals("₹57", parsed().first { it.id == "acb9f312" }.priceLabel)
        assertEquals("₹12.50", Listing(id = "z", priceTier1 = 12.5).priceLabel)
    }

    @Test
    fun `a listing with no price shows a dash rather than zero`() {
        // Mirrors the consumer grid's own fallback. "₹0" would read as free.
        assertEquals("—", Listing(id = "z", priceTier1 = null).priceLabel)
    }
}
