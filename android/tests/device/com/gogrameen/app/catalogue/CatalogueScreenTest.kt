package com.gogrameen.app.catalogue

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.gogrameen.app.DEFAULT_LANG
import com.gogrameen.app.Lang
import com.gogrameen.app.ui.theme.GoGrameenTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/* Compose UI tests for the catalogue.
 *
 * The screen is handed its state directly, so none of this touches the network:
 * every state the ViewModel can produce is just a value here, including the two
 * that are otherwise almost impossible to see on purpose — a failed request and
 * an empty catalogue. Those two are the point of the suite. A grid that renders
 * beautifully and shows a blank screen when the API is down is the failure this
 * catches. */
@RunWith(AndroidJUnit4::class)
class CatalogueScreenTest {

    @get:Rule
    val compose = createComposeRule()

    private val kapil = Farmer(id = "f1", name = "Korlepara Kapil", village = "Tadepalligudem")

    private val chillies = Listing(
        id = "a", name = "Green Chillies", unit = "kg", emoji = "🫒",
        status = "available", stockQty = null, priceTier1 = 57.0, farmer = kapil,
    )
    /* A real live listing, and the one worth testing the toggle on: its name is
       the "English half - Telugu half" form that most of the catalogue uses, so
       it exercises the segment path rather than a straight dictionary hit.

       NOT "Green Chillies", which was the obvious choice and does not work: the
       shared dictionary holds "green chilli", singular, so the live plural falls
       through untranslated on the web too. */
    private val turmeric = Listing(
        id = "c", name = "Pasupu - Turmeric", unit = "kg", emoji = "🌿",
        status = "available", stockQty = null, priceTier1 = 381.0, farmer = kapil,
    )

    private val soldOutOil = Listing(
        id = "b", name = "Coconut oil", unit = "kg",
        status = "sold_out", stockQty = 0.0, priceTier1 = 400.0, farmer = kapil,
    )

    /* The screen is handed a finished state, so the tests drive the UI without
       a ViewModel, a network or a clock. Everything the ViewModel decides --
       debounce, cancelling, error mapping -- is covered on the JVM in
       CatalogueViewModelTest instead. */
    private fun show(
        content: CatalogueState,
        query: String = "",
        method: MethodFilter = MethodFilter.All,
        category: CategoryFilter = CategoryFilter.All,
        refreshing: Boolean = false,
        onOpen: (Listing) -> Unit = {},
        onBack: () -> Unit = {},
        onRetry: () -> Unit = {},
        onQueryChange: (String) -> Unit = {},
        onMethodChange: (MethodFilter) -> Unit = {},
        onCategoryChange: (CategoryFilter) -> Unit = {},
        onClearFilters: () -> Unit = {},
        onRefresh: () -> Unit = {},
    ) {
        compose.setContent {
            var lang by remember { mutableStateOf(DEFAULT_LANG) }
            GoGrameenTheme(dark = false) {
                CatalogueScreen(
                    state = CatalogueUiState(
                        query = query,
                        method = method,
                        category = category,
                        content = content,
                        refreshing = refreshing,
                    ),
                    lang = lang,
                    onToggleLang = { lang = if (lang == Lang.EN) Lang.TE else Lang.EN },
                    onBack = onBack,
                    onOpen = onOpen,
                    onRetry = onRetry,
                    onQueryChange = onQueryChange,
                    onMethodChange = onMethodChange,
                    onCategoryChange = onCategoryChange,
                    onClearFilters = onClearFilters,
                    onRefresh = onRefresh,
                )
            }
        }
    }

    @Test
    fun showsProduceWithItsPriceAndItsFarmer() {
        // Name, price and grower are the three things the card exists to say.
        // The farmer's name especially: knowing who grew it is the product.
        show(CatalogueState.Ready(listOf(chillies)))

        compose.onNodeWithText("Green Chillies").assertIsDisplayed()
        compose.onNodeWithText("₹57").assertIsDisplayed()
        compose.onNodeWithText("Korlepara Kapil · Tadepalligudem").assertIsDisplayed()
    }

    @Test
    fun soldOutProduceStaysOnTheGridAndSaysSo() {
        // Deliberately not filtered out -- hiding it shrinks the farmer's public
        // catalogue the moment they sell out. It has to be visibly marked, or a
        // buyer taps through to something they cannot have with no warning.
        show(CatalogueState.Ready(listOf(chillies, soldOutOil)))

        compose.onNodeWithText("Coconut oil").assertIsDisplayed()
        compose.onNodeWithText("Sold out").assertIsDisplayed()
    }

    @Test
    fun soldOutProduceIsStillTappable() {
        // The detail screen holds the farmer and the description, which is
        // exactly what someone wants after finding out they were too late.
        var opened: Listing? = null
        show(CatalogueState.Ready(listOf(soldOutOil)), onOpen = { opened = it })

        compose.onNodeWithText("Coconut oil").performClick()
        assertEquals("b", opened?.id)
    }

    @Test
    fun countsTheProductsAndTheFarmersBehindThem() {
        show(CatalogueState.Ready(listOf(chillies, soldOutOil)))
        // Both listings belong to one farmer, so this also pins the singular.
        compose.onNodeWithText("2 products from 1 farmer").assertIsDisplayed()
    }

    @Test
    fun anOfflineFailureOffersARetryThatFires() {
        // The state a rural 4G phone reaches most often. It must say something
        // and give a way out; a blank grid would read as "no produce".
        var retried = 0
        show(CatalogueState.Failed(offline = true), onRetry = { retried++ })

        compose.onNodeWithText("Try again").assertIsDisplayed().performClick()
        assertEquals(1, retried)
    }

    @Test
    fun aServerFailureDoesNotBlameTheConnection() {
        // Telling someone to check their connection when the server is what
        // broke sends them to toggle aeroplane mode for nothing.
        show(CatalogueState.Failed(offline = false))

        compose.onNodeWithText(
            "The catalogue is having trouble right now. Please try again.",
        ).assertIsDisplayed()
    }

    @Test
    fun anEmptyCatalogueIsNotTreatedAsAnError() {
        // Nothing listed between harvests is a real, ordinary answer. It must
        // not offer a retry: nothing is broken and tapping changes nothing.
        show(CatalogueState.Ready(emptyList()))

        compose.onNodeWithText(
            "Nothing is listed today. The farmers post as they harvest — pull down to check again.",
        ).assertIsDisplayed()
        compose.onNodeWithText("Try again").assertDoesNotExist()
    }

    @Test
    fun theFiltersSayWhichOneIsOn() {
        // Before this, TalkBack read the chips as plain words, and a blind user
        // had no way to know which filter was applied.
        show(CatalogueState.Ready(emptyList()))

        compose.onNodeWithText("All produce").assertIsSelected()
        compose.onNodeWithText("Vegetables").assertIsNotSelected()
    }

    @Test
    fun everyChipIsBigEnoughToHit() {
        // Drawn smaller, but 48dp to touch -- the Android minimum.
        show(CatalogueState.Ready(emptyList()))

        compose.onNodeWithText("Fruits").assertHeightIsAtLeast(48.dp)
    }

    @Test
    fun theLanguageToggleReachesTheProduceNames() {
        // The whole reason the Telugu dictionary was ported. If the toggle only
        // repainted the chrome, a Telugu reader would still face English produce.
        show(CatalogueState.Ready(listOf(turmeric)))
        compose.onNode(hasText("EN") and hasClickAction()).performClick()

        compose.onNodeWithText("నేటి కోత").assertIsDisplayed()
        compose.onNodeWithText("పసుపు").assertIsDisplayed()
        // The unit travels with it; the price is a numeral either way.
        compose.onNodeWithText("₹381").assertIsDisplayed()
        compose.onNodeWithText(" / కేజీ").assertIsDisplayed()
    }

    @Test
    fun backGoesBack() {
        var backs = 0
        show(CatalogueState.Ready(listOf(chillies)), onBack = { backs++ })

        compose.onNodeWithContentDescription("Back").performClick()
        assertEquals(1, backs)
    }

    // ── search and filters (Feature 2) ─────────────────────────────────────

    @Test
    fun typingInTheSearchBoxReportsWhatWasTyped() {
        // The screen must NOT debounce or filter -- both belong to the
        // ViewModel. All this field owes anyone is the text, immediately.
        val typed = mutableListOf<String>()
        show(CatalogueState.Ready(listOf(chillies)), onQueryChange = { typed += it })

        compose.onNodeWithContentDescription("Search produce…").performTextInput("rice")

        assertEquals("rice", typed.last())
    }

    @Test
    fun theSearchBoxAcceptsTelugu() {
        // The bilingual search is the reason the box exists for half the
        // audience. A field that mangles Telugu input makes it useless to them.
        val typed = mutableListOf<String>()
        show(CatalogueState.Ready(listOf(chillies)), onQueryChange = { typed += it })

        compose.onNodeWithContentDescription("Search produce…").performTextInput("టమాటా")

        assertEquals("టమాటా", typed.last())
    }

    @Test
    fun theClearButtonIsAbsentWhileTheBoxIsEmpty() {
        // A permanently visible clear button is a dead control most of the time.
        // Split from the test below because setContent may only be called once
        // per test -- two states means two tests, not two calls.
        show(CatalogueState.Ready(listOf(chillies)), query = "")

        compose.onNodeWithContentDescription("Clear search").assertDoesNotExist()
    }

    @Test
    fun theClearButtonAppearsOnceSomethingIsTyped() {
        show(CatalogueState.Ready(listOf(chillies)), query = "rice")

        compose.onNodeWithContentDescription("Clear search").assertIsDisplayed()
    }

    @Test
    fun theClearButtonEmptiesTheQuery() {
        var latest: String? = null
        show(
            CatalogueState.Ready(listOf(chillies)),
            query = "rice",
            onQueryChange = { latest = it },
        )

        compose.onNodeWithContentDescription("Clear search").performClick()
        assertEquals("", latest)
    }

    @Test
    fun tappingACategoryChipReportsIt() {
        var picked: CategoryFilter? = null
        show(CatalogueState.Ready(listOf(chillies)), onCategoryChange = { picked = it })

        compose.onNodeWithText("Spices").performScrollTo().performClick()
        assertEquals(CategoryFilter.Spices, picked)
    }

    @Test
    fun tappingAMethodChipReportsIt() {
        var picked: MethodFilter? = null
        show(CatalogueState.Ready(listOf(chillies)), onMethodChange = { picked = it })

        compose.onNodeWithText("Organic").performScrollTo().performClick()
        assertEquals(MethodFilter.Organic, picked)
    }

    @Test
    fun filterChipsAreTranslatedWithTheRestOfTheScreen() {
        show(CatalogueState.Ready(listOf(chillies)))
        compose.onNode(hasText("EN") and hasClickAction()).performClick()

        compose.onNodeWithText("కూరగాయలు").performScrollTo().assertIsDisplayed()
        compose.onNodeWithText("సేంద్రియ").performScrollTo().assertIsDisplayed()
    }

    @Test
    fun searchingIntoNothingLooksDifferentFromAnEmptyCatalogue() {
        // The distinction the whole isNarrowed flag exists for. Filtered to
        // nothing is the buyer's own doing and is one tap from being undone;
        // nothing listed today is not, and offering "Clear filters" there would
        // point at a control that changes nothing.
        show(CatalogueState.Ready(emptyList()), query = "rice")

        compose.onNodeWithText(
            "Nothing matches that. Try a different word, or clear the filters.",
        ).assertIsDisplayed()
        compose.onNodeWithText("Clear filters").assertIsDisplayed()
    }

    @Test
    fun anEmptyCatalogueOffersNoClearButton() {
        show(CatalogueState.Ready(emptyList()))

        compose.onNodeWithText("Clear filters").assertDoesNotExist()
        compose.onNodeWithText("Try again").assertDoesNotExist()
    }

    @Test
    fun clearFiltersFires() {
        var cleared = 0
        show(
            CatalogueState.Ready(emptyList()),
            category = CategoryFilter.Spices,
            onClearFilters = { cleared++ },
        )

        compose.onNodeWithText("Clear filters").performClick()
        assertEquals(1, cleared)
    }

    @Test
    fun aFailureStillOffersRetryRatherThanClearFilters() {
        // A failed request while a filter is set is not "no results" -- the
        // filter is not the problem and clearing it would not help.
        show(CatalogueState.Failed(offline = true), query = "rice")

        compose.onNodeWithText("Try again").assertIsDisplayed()
        compose.onNodeWithText("Clear filters").assertDoesNotExist()
    }
}
