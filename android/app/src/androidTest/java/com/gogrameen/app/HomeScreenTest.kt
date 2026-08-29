package com.gogrameen.app

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.gogrameen.app.ui.theme.GoGrameenTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/* Compose UI tests for the one screen the app has.
 *
 * These need a device or emulator: `./gradlew connectedAndroidTest`, or the
 * green arrow in Android Studio. They are not part of `./gradlew test`.
 *
 * HomeScreen is 570 of the app's 846 lines, so behaviour worth protecting is
 * behaviour of this screen: that the language toggle really swaps every
 * string, and that all three doors onto the app are present. */
@RunWith(AndroidJUnit4::class)
class HomeScreenTest {

    @get:Rule
    val compose = createComposeRule()

    private fun showHome(dark: Boolean = false, onToggleDark: () -> Unit = {}) {
        compose.setContent {
            GoGrameenTheme(dark = dark) {
                HomeScreen(dark = dark, onToggleDark = onToggleDark)
            }
        }
    }

    @Test
    fun opensInEnglish() {
        // Deliberately English-first, unlike the rest of the app where Telugu
        // is the default: /home is the surface a new visitor lands on before
        // they have chosen anything. See the comment in Lang.kt.
        showHome()
        compose.onNodeWithText("Real food.").assertIsDisplayed()
    }

    @Test
    fun languageToggleSwapsTheHeadlineToTelugu() {
        showHome()
        compose.onNode(hasText("EN") and hasClickAction()).performClick()

        compose.onNodeWithText("నిజమైన ఆహారం.").assertIsDisplayed()
        compose.onNodeWithText("మధ్యవర్తులు లేరు.").assertExists()
    }

    @Test
    fun languageToggleSwitchesBack() {
        showHome()
        val toggle = compose.onNode(hasText("EN") and hasClickAction())
        toggle.performClick()
        toggle.performClick()

        compose.onNodeWithText("Real food.").assertIsDisplayed()
        compose.onNodeWithText("No middlemen.").assertExists()
    }

    @Test
    fun showsAllThreeDoorsIntoTheApp() {
        // Buyer, Farmer and Aggregator. Moderator and rider are absent on
        // purpose — staff and recruited riders reach their own logins directly.
        showHome()
        for (title in listOf("I'm a Buyer", "I'm a Farmer", "I'm an Aggregator")) {
            compose.onNodeWithText(title).performScrollTo().assertIsDisplayed()
        }
    }

    @Test
    fun roleCardsAreTranslatedToo() {
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
        // These changed three times in the backlog; a wrong number on the
        // front door is a lost customer.
        showHome()
        compose.onNodeWithText("9603174271").performScrollTo().assertIsDisplayed()
        compose.onNodeWithText("GovuGrameenam@gmail.com").assertExists()
    }
}
