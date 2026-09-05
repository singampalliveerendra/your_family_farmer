package com.gogrameen.app.catalogue

import com.gogrameen.app.Lang
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/* One row of /api/produce.
 *
 * The endpoint returns about forty-five columns per listing and the app reads
 * eleven of them. Every one is declared nullable with a default: these rows are
 * typed by farmers through a long form, most fields are optional, and the JSON
 * carries an explicit null rather than omitting the key. A non-null Kotlin
 * field here would throw on the first listing where the farmer skipped it.
 *
 * The parser is configured with ignoreUnknownKeys, so a column added on the web
 * side is invisible here instead of fatal. */
@Serializable
data class Listing(
    val id: String,
    val name: String? = null,
    val variety: String? = null,
    val unit: String? = null,
    val emoji: String? = null,
    val method: String? = null,
    val category: String? = null,
    val description: String? = null,
    val status: String? = null,
    @SerialName("stock_qty") val stockQty: Double? = null,
    @SerialName("shelf_life_days") val shelfLifeDays: Int? = null,
    /* The price shown on a card is tier 1 — the small-quantity price, and so
       the one a buyer opening the app will actually pay. The full tier ladder
       only matters once there is a cart to apply it to. See getTierPrice in
       src/lib/pricing.ts for the rest. */
    @SerialName("price_tier_1_price") val priceTier1: Double? = null,
    @SerialName("image_url") val imageUrl: String? = null,
    @SerialName("image_urls") val imageUrls: List<String>? = null,
    val farmer: Farmer? = null,
) {
    /* Both signals matter, exactly as in isSoldOutListing (produceStatus.ts):
       `status` is what the auto-flip writes when stock hits zero, `stock_qty`
       is the live number, and older rows can carry one without the other.
       stock_qty null means "not tracked", NOT zero — most live listings are
       null, and reading that as sold out would grey out the whole catalogue. */
    val isSoldOut: Boolean
        get() = status == "sold_out" || (stockQty != null && stockQty <= 0)

    /* Falls back to the first of image_urls because they genuinely disagree:
       live listings exist with image_url null and one URL in the array. A
       listing with no photo at all is normal too — the card shows the emoji. */
    val photoUrl: String?
        get() = imageUrl?.takeIf { it.isNotBlank() }
            ?: imageUrls?.firstOrNull { it.isNotBlank() }

    fun displayName(lang: Lang): String = localizeName(name, lang)

    fun displayVariety(lang: Lang): String = localizeName(variety, lang)

    fun displayUnit(lang: Lang): String = localizeUnit(unit, lang)

    /** "₹57" or an em dash, mirroring the consumer grid's own fallback. */
    val priceLabel: String
        get() = priceTier1?.let { "₹${formatAmount(it)}" } ?: "—"
}

@Serializable
data class Farmer(
    val id: String? = null,
    val name: String? = null,
    val village: String? = null,
    val method: String? = null,
    @SerialName("account_type") val accountType: String? = null,
)

/* Prices come back as JSON numbers, so 57 arrives as 57.0. Rupees are whole
 * numbers on every live listing, but a farmer can enter paise, so trim the
 * decimal only when there is nothing behind it. */
internal fun formatAmount(value: Double): String =
    if (value == value.toLong().toDouble()) value.toLong().toString()
    else String.format(java.util.Locale.US, "%.2f", value)

/* The parser, shared by the network call and its tests so a test cannot pass
 * against settings the app does not actually use.
 *
 * ignoreUnknownKeys: /api/produce returns about forty-five columns and the app
 * reads eleven, so an added column must be invisible here rather than fatal.
 * isLenient stays OFF — this is a Next.js route returning strict JSON, and
 * quietly accepting malformed input would hide a real breakage. */
internal val produceJson: Json = Json { ignoreUnknownKeys = true }
