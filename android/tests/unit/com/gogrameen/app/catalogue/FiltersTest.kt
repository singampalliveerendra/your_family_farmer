package com.gogrameen.app.catalogue

import com.gogrameen.app.Lang
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Test

/* The filter slugs are a contract with src/app/api/produce/search/route.ts.
 *
 * A slug that drifts does not fail — the route ignores a category it does not
 * know and returns everything, so the chip appears to do nothing at all. These
 * strings are checked literally, against the route's own CATEGORY_KEYWORDS keys
 * and its method comparison, so a rename on either side breaks a test rather
 * than a screen. */
class FiltersTest {

    @Test
    fun `category slugs match the route exactly`() {
        assertEquals(
            listOf(null, "vegetables", "fruits", "leafy", "grains", "spices", "other"),
            CategoryFilter.entries.map { it.slug },
        )
    }

    @Test
    fun `method slugs match the route exactly`() {
        assertEquals(listOf(null, "natural", "organic"), MethodFilter.entries.map { it.slug })
    }

    @Test
    fun `the All option is the only one that sends nothing`() {
        // Load-bearing: searchPath decides whether to send a parameter purely by
        // whether the slug is null.
        assertNull(CategoryFilter.All.slug)
        assertNull(MethodFilter.All.slug)
        assertEquals(1, CategoryFilter.entries.count { it.slug == null })
        assertEquals(1, MethodFilter.entries.count { it.slug == null })
    }

    @Test
    fun `every chip is labelled in both languages`() {
        // A chip that reads the same in both is almost always a copy-paste
        // where the Telugu argument was left as the English one.
        for (option in CategoryFilter.entries + MethodFilter.entries) {
            val en = option.label(Lang.EN)
            val te = option.label(Lang.TE)
            assert(en.isNotBlank()) { "$option has no English label" }
            assert(te.isNotBlank()) { "$option has no Telugu label" }
            assertNotEquals("$option is not translated", en, te)
        }
    }

    @Test
    fun `a listing's own category resolves back to its chip`() {
        // This is what labels the chip on the detail screen, so the same
        // produce reads identically in the grid and on its own page.
        assertEquals(CategoryFilter.Vegetables, CategoryFilter.fromSlug("vegetables"))
        assertEquals(CategoryFilter.Spices, CategoryFilter.fromSlug("Spices"))
        assertEquals(CategoryFilter.Other, CategoryFilter.fromSlug("  other  "))
    }

    @Test
    fun `an unknown category resolves to null so the raw text can be shown`() {
        // A category added on the web must appear in the app as the farmer's own
        // word, not vanish, and not wait for a release.
        assertNull(CategoryFilter.fromSlug("mushrooms"))
        assertNull(CategoryFilter.fromSlug(null))
        assertNull(CategoryFilter.fromSlug(""))
    }

    @Test
    fun `All is never matched by a listing's own value`() {
        // If "all" ever resolved to the All chip, a listing would be labelled
        // "All produce" on its own detail page.
        assertNull(CategoryFilter.fromSlug("all"))
        assertNull(methodFromSlug("all"))
    }

    @Test
    fun `a listing's own method resolves back to its chip`() {
        assertEquals(MethodFilter.Natural, methodFromSlug("natural"))
        assertEquals(MethodFilter.Organic, methodFromSlug("ORGANIC"))
        assertNull(methodFromSlug("biodynamic"))
    }
}
