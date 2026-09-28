package com.gogrameen.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

/* Local JVM unit tests — run with `./gradlew test`, no emulator needed.
 *
 * Lang is the app's whole non-UI logic surface. It is three lines, but it is
 * the three lines every string on the screen passes through: get the branch
 * backwards once and the entire app shows the wrong language. */
class LangTest {

    @Test
    fun `EN takes the english branch`() {
        // l() is handed the English string first and the Telugu second; in EN it
        // must return the first one.
        assertEquals("Fresh from your local farmers", Lang.EN.l("Fresh from your local farmers", "మీ స్థానిక రైతుల నుండి తాజా ఆహారం"))
    }

    @Test
    fun `TE takes the telugu branch`() {
        // The same call in TE must return the second argument. Together with the
        // test above, this pins the argument ORDER, which is the easy thing to get
        // backwards.
        assertEquals("మీ స్థానిక రైతుల నుండి తాజా ఆహారం", Lang.TE.l("Fresh from your local farmers", "మీ స్థానిక రైతుల నుండి తాజా ఆహారం"))
    }

    @Test
    fun `the two branches never return the same string`() {
        // One string, asked for in both languages, comes back different. Catches a
        // copy-paste where both branches ended up returning the same argument.
        val en = Lang.EN.l("I'm a Buyer", "నేను కొనుగోలుదారుని")
        val te = Lang.TE.l("I'm a Buyer", "నేను కొనుగోలుదారుని")
        assertNotEquals(en, te)
    }

    @Test
    fun `there are exactly two languages`() {
        // Guards the two-branch assumption every l() call site is built on.
        // A third would need a chooser rather than a toggle, and every call
        // site here is a two-branch `if`. This test is the reminder.
        assertEquals(2, Lang.entries.size)
    }
}
