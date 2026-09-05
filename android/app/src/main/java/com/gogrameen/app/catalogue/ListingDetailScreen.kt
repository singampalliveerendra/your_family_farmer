package com.gogrameen.app.catalogue

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.gogrameen.app.Lang
import com.gogrameen.app.l
import com.gogrameen.app.ui.LanguageToggle
import com.gogrameen.app.ui.theme.GgTheme

/* One product, in full.
 *
 * A cut-down port of src/app/consumer/produce/[id]/page.tsx. What is kept is
 * everything that answers "should I buy this, and from whom": the photos, the
 * price, who grew it and where, how it was grown, and whatever the farmer wrote
 * about it. What is dropped is the quantity stepper, the cart, reviews and the
 * pickup-slot picker — all of them need an account or a cart the app does not
 * have yet.
 *
 * Ordering ends in an honest dead end rather than a button that does nothing:
 * the CTA says the app cannot take the order yet and points at the farmer's own
 * phone number, which is a real way to buy today. */
@Composable
fun ListingDetailScreen(
    listing: Listing,
    lang: Lang,
    onToggleLang: () -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = GgTheme.colors

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(colors.background),
    ) {
        TopBar(lang = lang, onToggleLang = onToggleLang, onBack = onBack)

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState()),
        ) {
            Hero(listing)

            Column(Modifier.padding(horizontal = 20.dp)) {
                Spacer(Modifier.height(18.dp))

                Text(
                    text = listing.displayName(lang),
                    color = colors.textPrimary,
                    fontSize = 25.sp,
                    lineHeight = 31.sp,
                    fontWeight = FontWeight.ExtraBold,
                )

                val variety = listing.displayVariety(lang)
                if (variety.isNotEmpty()) {
                    Spacer(Modifier.height(4.dp))
                    Text(variety, color = colors.textSecondary, fontSize = 14.sp)
                }

                Spacer(Modifier.height(14.dp))
                Row(verticalAlignment = Alignment.Bottom) {
                    Text(
                        text = listing.priceLabel,
                        color = colors.accent,
                        fontSize = 30.sp,
                        fontWeight = FontWeight.ExtraBold,
                    )
                    val unit = listing.displayUnit(lang)
                    if (unit.isNotEmpty()) {
                        Text(
                            text = " / $unit",
                            color = colors.textSecondary,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Medium,
                            modifier = Modifier.padding(bottom = 4.dp),
                        )
                    }
                }

                /* Only the two facts a farmer always fills in get a chip. The
                   rest of the form — brix, soil pH, organic carbon, pesticide
                   result — is mostly null on live listings, and a row of empty
                   chips reads as a broken screen rather than a thorough one. */
                Spacer(Modifier.height(14.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    methodLabel(listing.method, lang)?.let { Chip(it) }
                    categoryLabel(listing.category, lang)?.let { Chip(it) }
                }

                if (listing.isSoldOut) {
                    Spacer(Modifier.height(16.dp))
                    Notice(
                        lang.l(
                            "Sold out for now. This farmer grows it — check back after the next harvest.",
                            "ప్రస్తుతం అయిపోయింది. ఈ రైతు దీన్ని పండిస్తారు — తదుపరి కోత తర్వాత చూడండి.",
                        )
                    )
                }

                if (!listing.description.isNullOrBlank()) {
                    Spacer(Modifier.height(22.dp))
                    SectionTitle(lang.l("About this produce", "ఈ ఉత్పత్తి గురించి"))
                    Spacer(Modifier.height(8.dp))
                    Text(
                        /* The farmer's own words, unedited. On the live
                           catalogue these read like "We use slurry and fish
                           amino acid every 10 days" — the single most
                           convincing thing on the screen. */
                        text = listing.description,
                        color = colors.textSecondary,
                        fontSize = 14.sp,
                        lineHeight = 22.sp,
                    )
                }

                listing.farmer?.let { farmer ->
                    Spacer(Modifier.height(22.dp))
                    SectionTitle(lang.l("Grown by", "పండించినది"))
                    Spacer(Modifier.height(10.dp))
                    FarmerCard(farmer = farmer, lang = lang)
                }

                listing.shelfLifeDays?.let { days ->
                    Spacer(Modifier.height(18.dp))
                    Text(
                        text = lang.l(
                            "Keeps about $days days after harvest.",
                            "కోత తర్వాత సుమారు $days రోజులు నిల్వ ఉంటుంది.",
                        ),
                        color = colors.textSecondary,
                        fontSize = 12.5.sp,
                    )
                }

                Spacer(Modifier.height(26.dp))
                HorizontalDivider(color = colors.border)
                Spacer(Modifier.height(18.dp))

                /* The honest dead end. A greyed "Add to cart" would imply a cart
                   is coming in this build; saying the app cannot order yet, and
                   naming the farmer's phone as the way to buy today, is both
                   true and useful. */
                Notice(
                    lang.l(
                        "Ordering from the app is coming soon. To buy today, call Go Grameen on 9603174271 or order at gogrameen.in.",
                        "యాప్ నుండి ఆర్డర్ త్వరలో వస్తుంది. ఈరోజు కొనాలంటే 9603174271 కు కాల్ చేయండి లేదా gogrameen.in లో ఆర్డర్ చేయండి.",
                    )
                )

                Spacer(Modifier.height(36.dp))
            }
        }
    }
}

/* The photo at the top, 4:3 rather than the card's square: a detail screen has
 * the height to spend and the crop is kinder to a photo of a basket. */
@Composable
private fun Hero(listing: Listing) {
    val colors = GgTheme.colors
    val url = listing.photoUrl

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .aspectRatio(4f / 3f)
            .background(colors.iconTileBg),
        contentAlignment = Alignment.Center,
    ) {
        Text(listing.emoji ?: "🌿", fontSize = 64.sp)
        if (url != null) {
            AsyncImage(
                model = url,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
        }
    }
}

@Composable
private fun FarmerCard(farmer: Farmer, lang: Lang) {
    val colors = GgTheme.colors
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .border(1.dp, colors.border, RoundedCornerShape(16.dp))
            .background(colors.surface)
            .padding(15.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(44.dp)
                .clip(RoundedCornerShape(14.dp))
                .background(colors.iconTileBg),
            contentAlignment = Alignment.Center,
        ) {
            /* An aggregator sells on behalf of named growers, which is a
               different promise from a farmer selling their own crop — the web
               labels the two differently and so does this. */
            Text(if (farmer.accountType == "aggregator") "📦" else "🧑‍🌾", fontSize = 20.sp)
        }
        Spacer(Modifier.width(13.dp))
        Column {
            Text(
                text = farmer.name.orEmpty(),
                color = colors.textPrimary,
                fontSize = 15.sp,
                fontWeight = FontWeight.Bold,
            )
            val place = farmer.village?.takeIf { it.isNotBlank() }
            val role = if (farmer.accountType == "aggregator") {
                lang.l("Aggregator", "అగ్రిగేటర్")
            } else {
                lang.l("Farmer", "రైతు")
            }
            Text(
                text = listOfNotNull(role, place).joinToString(" · "),
                color = colors.textSecondary,
                fontSize = 12.5.sp,
            )
        }
    }
}

/* The listing's own method and category, labelled.
 *
 * Both delegate to the filter enums rather than carrying a second copy of the
 * same strings — the chips on the catalogue and the chips here have to read
 * identically, or the same produce appears to be two different things.
 *
 * A value neither enum knows is shown as the farmer typed it rather than
 * dropped, so a category added on the web appears here without an app release. */
private fun methodLabel(method: String?, lang: Lang): String? {
    if (method.isNullOrBlank()) return null
    return methodFromSlug(method)?.label(lang) ?: method
}

private fun categoryLabel(category: String?, lang: Lang): String? {
    if (category.isNullOrBlank()) return null
    return CategoryFilter.fromSlug(category)?.label(lang) ?: category
}

@Composable
private fun Chip(label: String) {
    val colors = GgTheme.colors
    Text(
        text = label,
        color = colors.badgeText,
        fontSize = 11.sp,
        fontWeight = FontWeight.Bold,
        modifier = Modifier
            .clip(RoundedCornerShape(999.dp))
            .background(colors.badgeBg)
            .border(1.dp, colors.badgeBorder, RoundedCornerShape(999.dp))
            .padding(horizontal = 11.dp, vertical = 6.dp),
    )
}

@Composable
private fun SectionTitle(label: String) {
    Text(
        text = label,
        color = GgTheme.colors.textPrimary,
        fontSize = 16.sp,
        fontWeight = FontWeight.ExtraBold,
    )
}

@Composable
private fun Notice(text: String) {
    val colors = GgTheme.colors
    Text(
        text = text,
        color = colors.textSecondary,
        fontSize = 13.sp,
        lineHeight = 20.sp,
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(colors.surface)
            .border(1.dp, colors.border, RoundedCornerShape(14.dp))
            .padding(horizontal = 15.dp, vertical = 13.dp),
    )
}

@Composable
private fun TopBar(lang: Lang, onToggleLang: () -> Unit, onBack: () -> Unit) {
    val colors = GgTheme.colors
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = 8.dp, end = 16.dp, top = 8.dp, bottom = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(40.dp)
                .clip(RoundedCornerShape(999.dp))
                .clickable(onClick = onBack),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                contentDescription = lang.l("Back", "వెనుకకు"),
                tint = colors.textPrimary,
                modifier = Modifier.size(21.dp),
            )
        }
        Spacer(Modifier.weight(1f))
        LanguageToggle(lang = lang, onToggle = onToggleLang)
    }
}

/* Shown when the route has an id but the catalogue is no longer in memory —
 * Android killed the process while the app was in the background and restored
 * the back stack without the list behind it. Rare, but a crash otherwise. */
@Composable
fun ListingMissingScreen(lang: Lang, onBack: () -> Unit, modifier: Modifier = Modifier) {
    val colors = GgTheme.colors
    Box(
        modifier = modifier
            .fillMaxSize()
            .background(colors.background)
            .padding(40.dp),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = lang.l(
                    "That product is no longer loaded. Go back to the harvest list.",
                    "ఆ ఉత్పత్తి ఇప్పుడు అందుబాటులో లేదు. కోతల జాబితాకు వెళ్లండి.",
                ),
                color = colors.textSecondary,
                fontSize = 14.sp,
                lineHeight = 21.sp,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(18.dp))
            Text(
                text = lang.l("Back", "వెనుకకు"),
                color = colors.onAccent,
                fontSize = 13.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier
                    .clip(RoundedCornerShape(999.dp))
                    .background(colors.accentStrong)
                    .clickable(onClick = onBack)
                    .padding(horizontal = 26.dp, vertical = 13.dp),
            )
        }
    }
}
