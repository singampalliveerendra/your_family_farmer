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
        assertEquals("Real food.", Lang.EN.l("Real food.", "నిజమైన ఆహారం."))
    }

    @Test
    fun `TE takes the telugu branch`() {
        assertEquals("నిజమైన ఆహారం.", Lang.TE.l("Real food.", "నిజమైన ఆహారం."))
    }

    @Test
    fun `the two branches never return the same string`() {
        val en = Lang.EN.l("I'm a Buyer", "నేను కొనుగోలుదారుని")
        val te = Lang.TE.l("I'm a Buyer", "నేను కొనుగోలుదారుని")
        assertNotEquals(en, te)
    }

    @Test
    fun `there are exactly two languages`() {
        // A third would need a chooser rather than a toggle, and every call
        // site here is a two-branch `if`. This test is the reminder.
        assertEquals(2, Lang.entries.size)
    }
}
