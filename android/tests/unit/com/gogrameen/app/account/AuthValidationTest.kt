package com.gogrameen.app.account

import com.gogrameen.app.Lang
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/* The form's own checks, which must agree with the server's.
 *
 * The server is the authority — these only exist so a mistake is caught before
 * a 4G round trip, in the person's own language. So every test here is really
 * asking: would the server have said the same thing? If one of these passes
 * something the server rejects, the person gets an English-only error after a
 * wait; if one rejects something the server accepts, a valid customer cannot
 * sign up at all. The second is the worse bug. */
class AuthValidationTest {

    // ── normalizePhone: must match src/lib/phone.ts exactly ────────────────

    @Test
    fun `ten digits pass through`() {
        assertEquals("9876543210", normalizePhone("9876543210"))
    }

    @Test
    fun `a country code and spaces are stripped, as the server does`() {
        // The server keeps the LAST ten digits, so +91 and 0 prefixes vanish.
        assertEquals("9876543210", normalizePhone("+91 98765 43210"))
        assertEquals("9876543210", normalizePhone("098765-43210"))
        assertEquals("9876543210", normalizePhone("919876543210"))
    }

    @Test
    fun `fewer than ten digits is no phone at all`() {
        assertEquals("", normalizePhone("987654321"))
        assertEquals("", normalizePhone(""))
        assertEquals("", normalizePhone("phone"))
    }

    // ── cleanPhoneInput: what the box keeps while typing ───────────────────

    @Test
    fun `typing keeps only digits`() {
        assertEquals("98765", cleanPhoneInput("98-7 65"))
    }

    @Test
    fun `pasting a number with a country code keeps the right ten`() {
        // Pasted from WhatsApp. Truncating at ten would keep "9198765432" --
        // the country code and the wrong number.
        assertEquals("9876543210", cleanPhoneInput("+91 98765 43210"))
    }

    @Test
    fun `the phone is grouped the way it is read aloud`() {
        assertEquals("98765 43210", formatPhone("9876543210"))
        assertEquals("98765", formatPhone("98765"))
    }

    // ── login ──────────────────────────────────────────────────────────────

    @Test
    fun `a complete login has no errors`() {
        assertTrue(validateLogin("9876543210", "x", Lang.EN).isEmpty)
    }

    @Test
    fun `login accepts a short password, because old accounts have them`() {
        // The 6-character rule arrived after some accounts were made. Blocking
        // a 4-character login here would lock those customers out of the app
        // while the website still lets them in.
        assertNull(validateLogin("9876543210", "abcd", Lang.EN).password)
    }

    @Test
    fun `login needs a phone and a password`() {
        val errors = validateLogin("", "", Lang.EN)
        assertEquals("Enter your phone number.", errors.phone)
        assertEquals("Enter your password.", errors.password)
    }

    @Test
    fun `a short phone is called out as such, not as missing`() {
        assertEquals("Enter a 10-digit mobile number.", validateLogin("98765", "x", Lang.EN).phone)
    }

    // ── sign-up: mirrors register/route.ts ─────────────────────────────────

    @Test
    fun `a complete sign-up has no errors`() {
        assertTrue(validateSignUp("Lakshmi", "9876543210", "secret1", Lang.EN).isEmpty)
    }

    @Test
    fun `sign-up enforces the server's six-character minimum`() {
        assertNotNull(validateSignUp("L", "9876543210", "12345", Lang.EN).password)
        assertNull(validateSignUp("L", "9876543210", "123456", Lang.EN).password)
    }

    @Test
    fun `sign-up enforces the server's 128-character maximum`() {
        assertNull(validateSignUp("L", "9876543210", "a".repeat(128), Lang.EN).password)
        assertNotNull(validateSignUp("L", "9876543210", "a".repeat(129), Lang.EN).password)
    }

    @Test
    fun `a blank name is refused, as the server trims before checking`() {
        assertEquals("Enter your name.", validateSignUp("   ", "9876543210", "secret1", Lang.EN).name)
    }

    @Test
    fun `errors come back in Telugu for a Telugu screen`() {
        val errors = validateSignUp("", "", "", Lang.TE)
        assertEquals("మీ పేరు ఇవ్వండి.", errors.name)
        assertEquals("మీ ఫోన్ నంబర్ ఇవ్వండి.", errors.phone)
        assertEquals("కనీసం 6 అక్షరాలు వాడండి.", errors.password)
    }
}
