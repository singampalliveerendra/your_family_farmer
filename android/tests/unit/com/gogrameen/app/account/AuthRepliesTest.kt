package com.gogrameen.app.account

import com.gogrameen.app.Lang
import com.gogrameen.app.net.ApiException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.IOException

/* Reading what /api/consumer/{login,register,me} actually send back.
 *
 * The bodies below are copied from the route handlers, not invented — each test
 * names the branch it comes from. The one that matters most is the 401 pair:
 * the same status for "no account" and "wrong password", told apart only by a
 * field in the body. Get that wrong and a new customer is told their password
 * is wrong on an account they never made. */
class AuthRepliesTest {

    // ── success ────────────────────────────────────────────────────────────

    @Test
    fun `a login or sign-up reply gives the account`() {
        val consumer = parseConsumerReply(
            """{"ok":true,"consumer":{"id":"c1","name":"Lakshmi Devi","phone":"9876543210"}}""",
        )
        assertEquals(Consumer("c1", "Lakshmi Devi", "9876543210"), consumer)
    }

    @Test
    fun `me with a live session`() {
        assertEquals(
            MeResult.SignedIn(Consumer("c1", "Ravi", "9876543210")),
            parseMe("""{"consumer":{"id":"c1","name":"Ravi","phone":"9876543210"}}"""),
        )
    }

    @Test
    fun `me with no session`() {
        assertEquals(MeResult.SignedOut, parseMe("""{"consumer":null}"""))
    }

    @Test
    fun `me for a suspended account carries the moderator's reason`() {
        assertEquals(
            MeResult.Suspended("Repeated no-shows"),
            parseMe("""{"consumer":null,"suspended":true,"suspendedReason":"Repeated no-shows"}"""),
        )
    }

    @Test
    fun `a legacy suspension with no reason is still a suspension`() {
        assertEquals(MeResult.Suspended(null), parseMe("""{"consumer":null,"suspended":true,"suspendedReason":null}"""))
    }

    // ── failures, by status and body ───────────────────────────────────────

    @Test
    fun `401 with notRegistered means sign up, not wrong password`() {
        val body = """{"error":"No account found for this number. Please sign up first.","notRegistered":true}"""
        assertEquals(AuthFailure.NotRegistered, failureFrom(401, body, null))
    }

    @Test
    fun `401 without notRegistered is a wrong password`() {
        assertEquals(AuthFailure.WrongCredentials, failureFrom(401, """{"error":"Wrong phone or password."}""", null))
    }

    @Test
    fun `403 suspended keeps the reason`() {
        val body = """{"error":"Your account has been suspended.","suspended":true,"suspendedReason":"Fake orders"}"""
        assertEquals(AuthFailure.Suspended("Fake orders"), failureFrom(403, body, null))
    }

    @Test
    fun `429 is a rate limit whatever the body says`() {
        assertEquals(AuthFailure.RateLimited, failureFrom(429, """{"error":"Too many login attempts."}""", null))
        assertEquals(AuthFailure.RateLimited, failureFrom(429, null, null))
    }

    @Test
    fun `409 on sign-up means the number is taken`() {
        assertEquals(AuthFailure.AlreadyRegistered, failureFrom(409, """{"error":"An account already exists"}""", null))
    }

    @Test
    fun `400 passes the server's reason through`() {
        assertEquals(
            AuthFailure.Rejected("Password is too long."),
            failureFrom(400, """{"error":"Password is too long."}""", null),
        )
    }

    @Test
    fun `a 500 or an HTML error page is a server failure, not a crash`() {
        assertEquals(AuthFailure.Server("boom"), failureFrom(500, """{"error":"boom"}""", null))
        assertEquals(AuthFailure.Server("fallback"), failureFrom(502, "<html>Bad gateway</html>", "fallback"))
    }

    @Test
    fun `no signal is offline, and a server error is not`() {
        assertEquals(AuthFailure.Offline, failureOf(IOException("timeout")))
        assertEquals(AuthFailure.WrongCredentials, failureOf(ApiException(401, "x", """{"error":"x"}""")))
    }

    // ── what the person is told ────────────────────────────────────────────

    @Test
    fun `a rate limit never says the password is wrong`() {
        // Five tries in ten minutes is easy with a mistyped number. Being told
        // "wrong password" when it is not sends people to support.
        val text = AuthFailure.RateLimited.message(Lang.EN)
        assertTrue(text.contains("wait"))
        assertFalse(text.contains("password"))
    }

    @Test
    fun `a suspension shows the reason when there is one`() {
        assertTrue(AuthFailure.Suspended("Fake orders").message(Lang.EN).contains("Reason: Fake orders"))
        assertFalse(AuthFailure.Suspended(null).message(Lang.EN).contains("Reason"))
    }

    @Test
    fun `every failure has Telugu words of its own`() {
        // The server answers several of these in English only. The app must
        // not: a Telugu screen that switches language for its most stressful
        // message reads as broken.
        val all = listOf(
            AuthFailure.Offline, AuthFailure.NotRegistered, AuthFailure.WrongCredentials,
            AuthFailure.Suspended(null), AuthFailure.RateLimited, AuthFailure.AlreadyRegistered,
            AuthFailure.Rejected(null), AuthFailure.Server(null),
        )
        all.forEach { failure ->
            assertTrue("$failure has no Telugu", failure.message(Lang.TE) != failure.message(Lang.EN))
        }
    }

    @Test
    fun `first name for the greeting`() {
        assertEquals("Ravi", firstName("Ravi Kumar"))
        assertEquals("Lakshmi", firstName("  Lakshmi  "))
        assertEquals(null, firstName("   "))
        assertEquals(null, firstName(null))
    }
}
