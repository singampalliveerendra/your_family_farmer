package com.gogrameen.app.catalogue

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/* How the search box and the two chips become a URL.
 *
 * This is worth its own suite because every mistake it can make is SILENT. A
 * wrongly-encoded Telugu query, a dropped parameter, a stray "method=" — none
 * of them error. The route answers 200 with the wrong rows, and it looks like
 * the farmer has nothing rather than like a bug. */
class SearchPathTest {

    @Test
    fun `nothing to search for produces no path at all`() {
        // The caller falls back to the plain /api/produce for this, rather than
        // sending an empty query that means nothing on every app open.
        assertNull(searchPath("", MethodFilter.All, CategoryFilter.All))
        assertNull(searchPath("   ", MethodFilter.All, CategoryFilter.All))
    }

    @Test
    fun `a plain query becomes one parameter`() {
        assertEquals(
            "api/produce/search?q=tomato",
            searchPath("tomato", MethodFilter.All, CategoryFilter.All),
        )
    }

    @Test
    fun `a telugu query is percent-encoded`() {
        // The whole point of the bilingual search. Telugu is multi-byte UTF-8;
        // sent raw it either truncates or 400s depending on the proxy, and the
        // Telugu-speaking half of the audience silently gets no results.
        assertEquals(
            "api/produce/search?q=%E0%B0%9F%E0%B0%AE%E0%B0%BE%E0%B0%9F%E0%B0%BE",
            searchPath("టమాటా", MethodFilter.All, CategoryFilter.All),
        )
    }

    @Test
    fun `a query with a space survives`() {
        // "bottle gourd" is two words and is in the server's own keyword list.
        // Unencoded, the space ends the parameter and the search becomes "bottle".
        assertEquals(
            "api/produce/search?q=bottle+gourd",
            searchPath("bottle gourd", MethodFilter.All, CategoryFilter.All),
        )
    }

    @Test
    fun `a query with an ampersand cannot invent a second parameter`() {
        assertEquals(
            "api/produce/search?q=salt+%26+pepper",
            searchPath("salt & pepper", MethodFilter.All, CategoryFilter.All),
        )
    }

    @Test
    fun `surrounding space is trimmed rather than searched for`() {
        // Phone keyboards add a trailing space after autocorrect. Searching for
        // "tomato " is not the same request as searching for "tomato".
        assertEquals(
            "api/produce/search?q=tomato",
            searchPath("  tomato  ", MethodFilter.All, CategoryFilter.All),
        )
    }

    @Test
    fun `each filter can stand on its own`() {
        assertEquals(
            "api/produce/search?method=organic",
            searchPath("", MethodFilter.Organic, CategoryFilter.All),
        )
        assertEquals(
            "api/produce/search?category=spices",
            searchPath("", MethodFilter.All, CategoryFilter.Spices),
        )
    }

    @Test
    fun `all three combine in one request`() {
        assertEquals(
            "api/produce/search?q=rice&method=natural&category=grains",
            searchPath("rice", MethodFilter.Natural, CategoryFilter.Grains),
        )
    }

    @Test
    fun `the All options send nothing rather than the word all`() {
        // The route treats a missing parameter and the literal "all" the same
        // way today, but sending "method=all" relies on that staying true.
        val path = searchPath("rice", MethodFilter.All, CategoryFilter.All)
        assertEquals("api/produce/search?q=rice", path)
    }
}
