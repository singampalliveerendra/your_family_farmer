package com.gogrameen.app.catalogue

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertHasClickAction
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.gogrameen.app.DEFAULT_LANG
import com.gogrameen.app.Lang
import com.gogrameen.app.ui.theme.GoGrameenTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/* Compose UI tests for one product's page.
 *
 * The listings below are shaped like the live ones, which for this screen means
 * mostly-null: a farmer fills in a name, a price and a photo, and leaves brix,
 * soil pH, shelf life and often the description empty. Every test here is
 * really asking the same question — does the screen stay sane when the field it
 * wanted is not there. */
@RunWith(AndroidJUnit4::class)
class ListingDetailScreenTest {

    @get:Rule
    val compose = createComposeRule()

    private val kapil = Farmer(
        id = "f1", name = "Korlepara Kapil", village = "Tadepalligudem",
        method = "natural", accountType = "farmer",
    )

    private val full = Listing(
        id = "a", name = "Green Chillies", variety = "Local", unit = "kg", emoji = "🫒",
        method = "natural", category = "vegetables",
        description = "Grown in our Ayodhya beside mango trees.",
        status = "available", stockQty = null, shelfLifeDays = 10,
        priceTier1 = 57.0, imageUrl = "https://cdn.example/chilli.jpg", farmer = kapil,
    )

    /** Name, price and nothing else — the thinnest row the API can return. */
    private val bare = Listing(id = "b", name = "Jeevaamrutam", unit = "litre", priceTier1 = 19.0)

    private fun show(listing: Listing, onBack: () -> Unit = {}) {
        compose.setContent {
            var lang by remember { mutableStateOf(DEFAULT_LANG) }
            GoGrameenTheme(dark = false) {
                ListingDetailScreen(
                    listing = listing,
                    lang = lang,
                    onToggleLang = { lang = if (lang == Lang.EN) Lang.TE else Lang.EN },
                    onBack = onBack,
                )
            }
        }
    }

    @Test
    fun showsWhatTheProductIsAndWhatItCosts() {
        show(full)

        compose.onNodeWithText("Green Chillies").assertIsDisplayed()
        compose.onNodeWithText("Local").assertIsDisplayed()
        compose.onNodeWithText("₹57").assertIsDisplayed()
    }

    @Test
    fun namesTheFarmerAndTheirVillage() {
        // The entire pitch of Go Grameen is that you know who grew it. If this
        // section ever silently dropped, the app would be a produce catalogue
        // like any other.
        show(full)

        compose.onNodeWithText("Grown by").performScrollTo().assertIsDisplayed()
        compose.onNodeWithText("Korlepara Kapil").assertIsDisplayed()
        compose.onNodeWithText("Farmer · Tadepalligudem").assertIsDisplayed()
    }

    @Test
    fun showsTheFarmersOwnDescription() {
        // The most convincing thing on the screen, and it is the farmer's words
        // rather than ours.
        show(full)

        compose.onNodeWithText("About this produce").performScrollTo().assertIsDisplayed()
        compose.onNodeWithText("Grown in our Ayodhya beside mango trees.").assertIsDisplayed()
    }

    @Test
    fun aListingWithAlmostNothingFilledInStillRenders() {
        // Live listings routinely carry no description, no variety, no method,
        // no category, no shelf life and no farmer join. None of those absences
        // may leave an empty heading or an "About this produce" with nothing
        // under it -- and none of them may crash.
        show(bare)

        compose.onNodeWithText("Jeevaamrutam").assertIsDisplayed()
        compose.onNodeWithText("₹19").assertIsDisplayed()
        compose.onNodeWithText("About this produce").assertDoesNotExist()
        compose.onNodeWithText("Grown by").assertDoesNotExist()
    }

    @Test
    fun saysPlainlyThatOrderingIsNotBuiltYet() {
        // A greyed-out "Add to cart" would imply a cart exists in this build.
        // The screen instead offers the real way to buy today -- a call -- as
        // a button pinned to the bottom, visible without scrolling.
        show(full)

        compose.onNodeWithText(
            "Ordering in the app is coming soon. To buy today, call us or order at gogrameen.in.",
        ).assertIsDisplayed()
        compose.onNodeWithText("Call to order").assertIsDisplayed().assertHasClickAction()
    }

    @Test
    fun aSoldOutProductOffersToAskAboutTheNextHarvest() {
        // "Call to order" on something that cannot be ordered is a promise the
        // call cannot keep.
        show(full.copy(status = "sold_out", stockQty = 0.0))

        compose.onNodeWithText("Call to ask about the next harvest").assertIsDisplayed()
        compose.onNodeWithText("Call to order").assertDoesNotExist()
    }

    @Test
    fun showsTheBulkPriceLadderWhenThereIsOne() {
        // Tier 2 is labelled as the range getTierPrice charges it for, not the
        // web's "20+ kg" -- see PriceTiers.kt.
        show(full.copy(priceTier1Qty = 5.0, priceTier2Qty = 20.0, priceTier2 = 52.0, priceTier3 = 48.0))

        compose.onNodeWithText("Buy more, pay less").performScrollTo().assertIsDisplayed()
        compose.onNodeWithText("Up to 5 kg").assertExists()
        compose.onNodeWithText("5 – 20 kg").assertExists()
        compose.onNodeWithText("Over 20 kg").assertExists()
    }

    @Test
    fun aSinglePriceHasNoLadder() {
        show(full)
        compose.onNodeWithText("Buy more, pay less").assertDoesNotExist()
    }

    @Test
    fun aSoldOutProductSaysSoWithoutHidingTheFarmer() {
        // Reaching this screen from a greyed card is the common path. It has to
        // explain the situation and still show who grows it, which is the reason
        // sold-out produce stays in the grid at all.
        show(full.copy(status = "sold_out", stockQty = 0.0))

        compose.onNodeWithText(
            "Sold out for now. This farmer grows it — check back after the next harvest.",
        ).performScrollTo().assertIsDisplayed()
        compose.onNodeWithText("Korlepara Kapil").performScrollTo().assertIsDisplayed()
    }

    @Test
    fun anAggregatorIsLabelledAsOneRatherThanAsAFarmer() {
        // An aggregator resells for named growers, which is a different promise
        // from a farmer selling their own crop. The web draws that line and so
        // must this, or the app misrepresents who is behind the produce.
        show(full.copy(farmer = kapil.copy(name = "Padala Traders", accountType = "aggregator")))

        compose.onNodeWithText("Aggregator · Tadepalligudem").performScrollTo().assertIsDisplayed()
    }

    @Test
    fun theLanguageToggleReachesEveryPartOfThePage() {
        // Chrome, headings and the produce name all have to move together. The
        // description stays in the farmer's own words on purpose -- it is not
        // ours to translate.
        show(full.copy(name = "Pasupu - Turmeric"))
        compose.onNode(hasText("EN") and hasClickAction()).performClick()

        compose.onNodeWithText("పసుపు").assertIsDisplayed()
        compose.onNodeWithText("సహజంగా పండించినది").assertIsDisplayed()
        compose.onNodeWithText("పండించినది").performScrollTo().assertIsDisplayed()
    }

    @Test
    fun backGoesBack() {
        var backs = 0
        show(full, onBack = { backs++ })

        compose.onNodeWithContentDescription("Back").performClick()
        assertEquals(1, backs)
    }
}
