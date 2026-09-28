package com.gogrameen.app.net

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.net.CookieManager
import java.net.CookiePolicy
import java.net.HttpCookie
import java.net.URI

/* "Stay logged in for 30 days" and "log out means logged out", tested without a
 * phone.
 *
 * Each "restart" below is a brand-new store built over the same SecretStore —
 * exactly what happens when Android kills the app and it is opened again. The
 * clock is injected so the 30 days pass in a line of code. */
class PersistentCookieStoreTest {

    private val site = URI("https://staging.example.vercel.app/api/consumer/login")
    private val day = 24L * 60 * 60 * 1000

    private var now = 1_700_000_000_000L
    private val secrets = MemorySecretStore()

    private fun store() = PersistentCookieStore(secrets, now = { now })

    /* The server's Set-Cookie, as HttpCookie.parse reads it off the wire. */
    private fun session(value: String = "c1.123.sig", maxAgeSeconds: Long = 30 * 24 * 3600) =
        HttpCookie.parse("Set-Cookie: yff_consumer=$value; Path=/; Max-Age=$maxAgeSeconds; HttpOnly; Secure").single()

    private fun namesFor(store: PersistentCookieStore, uri: URI = site) =
        store.get(uri).filterNot { it.hasExpired() }.map { it.name }

    @Test
    fun `a login cookie survives a restart`() {
        store().add(site, session())

        val reopened = store()

        assertTrue(reopened.hasSession())
        assertEquals(listOf("yff_consumer"), namesFor(reopened))
        assertEquals("c1.123.sig", reopened.get(site).single().value)
    }

    @Test
    fun `it goes out to the server in the plain form Next can read`() {
        // A version-1 cookie goes out as `$Version="1"; yff_consumer=...`,
        // which the server's cookie parser does not recognise -- the person
        // would appear logged out after every restart.
        store().add(site, session())
        val jar = CookieManager(store(), CookiePolicy.ACCEPT_ALL)

        val header = jar.get(site, emptyMap())["Cookie"].orEmpty().joinToString("; ")

        assertEquals("yff_consumer=c1.123.sig", header)
    }

    @Test
    fun `a restart does not reset the thirty days`() {
        store().add(site, session())

        now += 29 * day
        assertTrue("still inside the 30 days", store().hasSession())

        now += 2 * day
        assertFalse("past the 30 the server set", store().hasSession())
    }

    @Test
    fun `the server ending the session ends it on the phone too`() {
        // /api/consumer/logout answers with the same cookie and Max-Age=0.
        val jar = store()
        jar.add(site, session())
        jar.add(site, session(value = "", maxAgeSeconds = 0))

        assertFalse(jar.hasSession())
        assertFalse(store().hasSession())
        assertNull("nothing left on disk", secrets.get("cookies"))
    }

    @Test
    fun `clearing the session works with no server at all`() {
        val jar = store()
        jar.add(site, session())

        jar.clearSession()

        assertFalse(jar.hasSession())
        assertTrue(namesFor(jar).isEmpty())
        assertFalse(store().hasSession())
    }

    @Test
    fun `the language cookie is not written to disk`() {
        // Rewritten from preferences every launch; nothing to keep.
        val lang = HttpCookie("yff_lang", "te").apply { path = "/"; version = 0 }
        store().add(site, lang)

        assertNull(secrets.get("cookies"))
    }

    @Test
    fun `clearing the session leaves the language alone`() {
        val jar = store()
        jar.add(site, session())
        jar.add(site, HttpCookie("yff_lang", "te").apply { path = "/"; version = 0 })

        jar.clearSession()

        assertEquals(listOf("yff_lang"), namesFor(jar))
    }

    @Test
    fun `a corrupt file is simply no session`() {
        secrets.put("cookies", "{not json")
        assertFalse(store().hasSession())
    }

    @Test
    fun `the stored form round-trips`() {
        val cookie = StoredCookie(
            name = "yff_consumer", value = "v", domain = "x.app", path = "/",
            uri = "https://x.app/", expiresAtMillis = 42, secure = true, httpOnly = true,
        )
        assertEquals(listOf(cookie), decodeCookies(encodeCookies(listOf(cookie))))
        assertNull(decodeCookies(null))
        assertNull(decodeCookies(""))
    }
}
