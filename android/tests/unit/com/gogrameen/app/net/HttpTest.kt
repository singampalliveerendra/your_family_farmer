package com.gogrameen.app.net

import com.gogrameen.app.BuildConfig
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/* The network layer's two testable halves: the URL join, and the promise the
 * build makes about which site this variant talks to.
 *
 * The connection itself is not tested here — that needs a server, and a unit
 * test that stands up an HTTP stub would be testing HttpURLConnection rather
 * than anything we wrote. What IS worth pinning is everything a wrong answer
 * here would cause silently: a request going to the wrong host, or a path that
 * looks right in the code and comes out with a doubled slash.
 *
 * These run against whichever flavour the task names (testProdDebugUnitTest by
 * default), so BuildConfig below is the real generated one.
 */
class HttpTest {

    // ── joinUrl ────────────────────────────────────────────────────────────

    @Test
    fun `joins when only the base has a slash`() {
        // The shape every call site actually writes.
        assertEquals(
            "https://www.gogrameen.in/api/produce",
            joinUrl("https://www.gogrameen.in/", "api/produce"),
        )
    }

    @Test
    fun `joins when neither side has a slash`() {
        assertEquals(
            "https://www.gogrameen.in/api/produce",
            joinUrl("https://www.gogrameen.in", "api/produce"),
        )
    }

    @Test
    fun `joins when both sides have a slash`() {
        // The case that produced "…in//api/produce" before the trim. Some
        // proxies redirect that and some reject it, and either way it is a bug
        // nobody finds by reading the call site.
        assertEquals(
            "https://www.gogrameen.in/api/produce",
            joinUrl("https://www.gogrameen.in/", "/api/produce"),
        )
    }

    @Test
    fun `keeps a query string intact`() {
        // Feature 2's search calls arrive in this shape.
        assertEquals(
            "https://www.gogrameen.in/api/produce/search?q=tomato&method=all",
            joinUrl("https://www.gogrameen.in/", "api/produce/search?q=tomato&method=all"),
        )
    }

    @Test
    fun `does not touch slashes inside the path`() {
        // Only the seam is trimmed. A nested path must survive.
        assertEquals(
            "https://www.gogrameen.in/api/consumer/orders/123",
            joinUrl("https://www.gogrameen.in/", "/api/consumer/orders/123"),
        )
    }

    // ── which site this build talks to ─────────────────────────────────────

    @Test
    fun `the prod build points at the live site`() {
        // The one assertion that would catch a base URL edited by accident.
        // Skipped on the staging variant, whose URL is a local setting and so
        // cannot be asserted against a literal.
        if (BuildConfig.IS_STAGING) return
        assertEquals("https://www.gogrameen.in/", Http.baseUrl)
    }

    @Test
    fun `the prod build is not flagged as staging`() {
        // The banner and every future "am I safe to write here" check read this
        // flag. A prod build that reports staging would hide the warning on the
        // build that needs it, and vice versa.
        if (BuildConfig.IS_STAGING) {
            assertTrue(Http.isStaging)
        } else {
            assertFalse(Http.isStaging)
        }
    }

    @Test
    fun `the base url is https and ends in a slash`() {
        // joinUrl tolerates a missing trailing slash, but the invariant is worth
        // holding at the source: it is what makes the paths above readable. The
        // https half matters more — this build carries a session cookie.
        //
        // An unset gg.stagingBaseUrl gives the staging build an empty string on
        // purpose (Http.get then refuses with the line to edit), so that is the
        // one allowed exception.
        if (Http.baseUrl.isEmpty()) {
            assertTrue("only the staging build may have no site", BuildConfig.IS_STAGING)
            return
        }
        assertTrue(Http.baseUrl, Http.baseUrl.startsWith("https://"))
        assertTrue(Http.baseUrl, Http.baseUrl.endsWith("/"))
    }

    // ── ApiException ───────────────────────────────────────────────────────

    @Test
    fun `an api error is not an io error`() {
        // Load-bearing: CatalogueViewModel (and every screen after it) reads an
        // IOException as "you are offline" and shows a retry. A 500 from the
        // route is the server having answered, and telling someone to check
        // their signal would send them chasing the wrong problem.
        //
        // Asserted against the class rather than an `is` check, which the
        // compiler folds to a constant and warns about — this survives someone
        // changing what ApiException extends, which is the actual risk.
        assertFalse(
            java.io.IOException::class.java.isAssignableFrom(ApiException::class.java),
        )
        val e = ApiException(500, "Boom")
        assertEquals(500, e.status)
        assertEquals("Boom", e.message)
    }
}
