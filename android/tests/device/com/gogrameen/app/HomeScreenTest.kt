package com.gogrameen.app

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.gogrameen.app.ui.theme.GoGrameenTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/* Compose UI tests for the front door.
 *
 * These need a device or emulator: `./gradlew connectedAndroidTest`, or the
 * green arrow in Android Studio. They are not part of `./gradlew test`.
 *
 * The behaviour worth protecting here is that the language toggle really swaps
 * every string, that all three doors onto the app are present, and that the one
 * door which now leads somewhere actually fires.
 *
 * Language is owned by MainActivity now, so the harness below holds it the way
 * the activity does — seeded from DEFAULT_LANG rather than a literal, so the
 * "opens in English" test still asserts the app's real default. */
@RunWith(AndroidJUnit4::class)
class HomeScreenTest {

    @get:Rule
    val compose = createComposeRule()

    private fun showHome(
        dark: Boolean = false,
        onBrowse: () -> Unit = {},
        accountName: String? = null,
        onAccount: () -> Unit = {},
    ) {
        compose.setContent {
            var lang by remember { mutableStateOf(DEFAULT_LANG) }
            GoGrameenTheme(dark = dark) {
                HomeScreen(
                    lang = lang,
                    onToggleLang = { lang = if (lang == Lang.EN) Lang.TE else Lang.EN },
                    onBrowse = onBrowse,
                    accountName = accountName,
                    onAccount = onAccount,
                )
            }
        }
    }

    @Test
    fun opensInEnglish() {
        // A fresh launch with nobody having touched the toggle: the hero headline
        // must come up in English.
        // Deliberately English-first, unlike the rest of the app where Telugu
        // is the default: /home is the surface a new visitor lands on before
        // they have chosen anything. See the comment in Lang.kt.
        showHome()
        compose.onNodeWithText("Food Straight From Farm").assertIsDisplayed()
    }

    @Test
    fun languageToggleSwapsTheHeadlineToTelugu() {
        // Taps the EN button once, then checks BOTH lines of the hero headline are
        // now Telugu. Two lines, not one, so a toggle that only reaches half the
        // screen is caught.
        showHome()
        compose.onNode(hasText("EN") and hasClickAction()).performClick()

        compose.onNodeWithText("నేరుగా పొలం నుండి ఆహారం").assertIsDisplayed()
        compose.onNodeWithText("మధ్యవర్తులు లేరు").assertExists()
    }

    @Test
    fun languageToggleSwitchesBack() {
        // Taps the toggle twice and expects the English headline again. The toggle
        // is a round trip, not a one-way switch into Telugu.
        showHome()
        val toggle = compose.onNode(hasText("EN") and hasClickAction())
        toggle.performClick()
        toggle.performClick()

        compose.onNodeWithText("Food Straight From Farm").assertIsDisplayed()
        compose.onNodeWithText("No Middlemen").assertExists()
    }

    @Test
    fun showsAllThreeDoorsIntoTheApp() {
        // Scrolls to each role card in turn and checks all three are really on
        // screen, not just present in the tree.
        // Buyer, Farmer and Aggregator. Moderator and rider are absent on
        // purpose — staff and recruited riders reach their own logins directly.
        showHome()
        for (title in listOf("I'm a Buyer", "I'm a Farmer", "I'm an Aggregator")) {
            compose.onNodeWithText(title).performScrollTo().assertIsDisplayed()
        }
    }

    @Test
    fun roleCardsAreTranslatedToo() {
        // Flips to Telugu, then checks all three role cards changed with it.
        // The toggle has to reach the cards, not just the headline — they are
        // the part a Telugu-first user actually has to read to choose.
        showHome()
        compose.onNode(hasText("EN") and hasClickAction()).performClick()

        compose.onNodeWithText("నేను కొనుగోలుదారుని").performScrollTo().assertIsDisplayed()
        compose.onNodeWithText("నేను రైతుని").assertExists()
        compose.onNodeWithText("నేను అగ్రిగేటర్‌ని").assertExists()
    }

    @Test
    fun showsTheContactDetails() {
        // Scrolls down to the footer and checks the phone number and email are
        // exactly the ones we publish today.
        // These changed three times in the backlog; a wrong number on the
        // front door is a lost customer.
        showHome()
        compose.onNodeWithText("9603174271").performScrollTo().assertIsDisplayed()
        compose.onNodeWithText("GovuGrameenam@gmail.com").assertExists()
    }

    @Test
    fun bothBuyerEntryPointsOpenTheCatalogue() {
        // Two things on this screen promise the harvest list -- the hero button
        // and the Buyer role card -- and they are wired separately, so one can
        // be left as a toast while the other works. Both are checked.
        var opened = 0
        showHome(onBrowse = { opened++ })

        compose.onNodeWithText("Browse today's harvest").performScrollTo().performClick()
        assertEquals(1, opened)

        compose.onNodeWithText("I'm a Buyer").performScrollTo().performClick()
        assertEquals(2, opened)
    }

    @Test
    fun theDoorsThatAreNotBuiltYetDoNotNavigate() {
        // Farmer and Aggregator still toast. If either started calling onBrowse
        // -- easy to do by wiring the whole ROLES list at once -- someone tapping
        // "I'm a Farmer" would land in the buyer's catalogue.
        var opened = 0
        showHome(onBrowse = { opened++ })

        compose.onNodeWithText("I'm a Farmer").performScrollTo().performClick()
        compose.onNodeWithText("I'm an Aggregator").performScrollTo().performClick()

        assertEquals(0, opened)
    }

    @Test
    fun theDoorsThatAreNotBuiltYetSaySoBeforeAnyoneTaps() {
        // A card that only reveals "coming soon" after a tap is a small trap.
        // Farmer and Aggregator carry the tag up front; Buyer, which works,
        // does not.
        showHome()
        compose.onNodeWithText("I'm a Farmer").performScrollTo()
        compose.onAllNodesWithText("Soon").assertCountEquals(2)
    }

    @Test
    fun theAccountButtonOpensTheAccount() {
        var opened = 0
        showHome(onAccount = { opened++ })

        compose.onNodeWithContentDescription("Log in or sign up").performClick()
        assertEquals(1, opened)
    }

    @Test
    fun theAccountButtonSaysWhoIsLoggedIn() {
        // Every screen's header tells a logged-in person so at a glance -- and
        // tells TalkBack users the same thing in words.
        showHome(accountName = "Lakshmi Devi")
        compose.onNodeWithContentDescription("Your account, Lakshmi Devi").assertIsDisplayed()
    }
}
