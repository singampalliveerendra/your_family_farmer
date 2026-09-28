package com.gogrameen.app.catalogue

import com.gogrameen.app.Lang
import com.gogrameen.app.l

/* What a buyer can narrow the catalogue by.
 *
 * The `slug` on each entry is the exact string /api/produce/search expects, and
 * that is the only reason these are enums rather than free text: a typo in a
 * query parameter does not fail, it silently returns everything, and nobody
 * notices until a farmer asks why their spices never show up.
 *
 * The lists mirror CATEGORY_KEYWORDS and the method filter in
 * src/app/api/produce/search/route.ts. THE APP DOES NOT FILTER. It sends the
 * slug and renders the answer — the server falls back to guessing a category
 * from the crop name for older listings that have no category column set, and
 * a Kotlin re-implementation would quietly disagree with it. */

interface CatalogueFilter {
    /** What the server is sent. Null means "do not send this parameter at all". */
    val slug: String?
    fun label(lang: Lang): String
}

enum class MethodFilter(override val slug: String?) : CatalogueFilter {
    All(null),
    Natural("natural"),
    Organic("organic");

    override fun label(lang: Lang): String = when (this) {
        All -> lang.l("Any method", "అన్ని పద్ధతులు")
        Natural -> lang.l("Naturally grown", "సహజంగా పండించినది")
        Organic -> lang.l("Organic", "సేంద్రియ")
    }
}

enum class CategoryFilter(override val slug: String?) : CatalogueFilter {
    All(null),
    Vegetables("vegetables"),
    Fruits("fruits"),
    Leafy("leafy"),
    Grains("grains"),
    Spices("spices"),
    Other("other");

    override fun label(lang: Lang): String = when (this) {
        All -> lang.l("All produce", "అన్నీ")
        Vegetables -> lang.l("Vegetables", "కూరగాయలు")
        Fruits -> lang.l("Fruits", "పండ్లు")
        Leafy -> lang.l("Leafy greens", "ఆకుకూరలు")
        Grains -> lang.l("Grains & pulses", "ధాన్యాలు")
        Spices -> lang.l("Spices", "మసాలాలు")
        Other -> lang.l("Other", "ఇతర")
    }

    companion object {
        /* Used to label a listing's own category on the detail screen. Unknown
           values come back as null so the caller can show the farmer's raw text
           rather than dropping it — a category added on the web must appear in
           the app without waiting for a release. */
        fun fromSlug(slug: String?): CategoryFilter? {
            val wanted = slug?.trim()?.lowercase()?.takeIf { it.isNotEmpty() } ?: return null
            return entries.firstOrNull { it.slug == wanted }
        }
    }
}

/* Method has the same "label it if we know it, otherwise show what the farmer
 * typed" rule, and for the same reason. */
fun methodFromSlug(slug: String?): MethodFilter? {
    val wanted = slug?.trim()?.lowercase()?.takeIf { it.isNotEmpty() } ?: return null
    return MethodFilter.entries.firstOrNull { it.slug == wanted }
}
