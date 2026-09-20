package com.gogrameen.app.catalogue

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.gogrameen.app.Lang
import com.gogrameen.app.l
import com.gogrameen.app.ui.AccountButton
import com.gogrameen.app.ui.GgTopBar
import com.gogrameen.app.ui.Notice
import com.gogrameen.app.ui.PrimaryButton
import com.gogrameen.app.ui.asHeading
import com.gogrameen.app.ui.decorative
import com.gogrameen.app.ui.dialGoGrameen
import com.gogrameen.app.ui.theme.GgTheme

/* One product, in full.
 *
 * A cut-down port of src/app/consumer/produce/[id]/page.tsx. What is kept is
 * everything that answers "should I buy this, and from whom": the photos, the
 * price and its bulk ladder, who grew it and where, how it was grown, and what
 * the farmer wrote about it.
 *
 * Ordering in the app is not built yet, so the one action here is the honest
 * one that works today — call Go Grameen — and it is pinned to the bottom of
 * the screen as a real button rather than a phone number buried in a sentence
 * at the end of a scroll. */
@Composable
fun ListingDetailScreen(
    listing: Listing,
    lang: Lang,
    onToggleLang: () -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    accountName: String? = null,
    onAccount: () -> Unit = {},
) {
    val colors = GgTheme.colors
    val context = LocalContext.current

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(colors.background),
    ) {
        GgTopBar(
            lang = lang,
            onToggleLang = onToggleLang,
            onBack = onBack,
            account = { AccountButton(name = accountName, lang = lang, onClick = onAccount) },
        )

        Column(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .verticalScroll(rememberScrollState()),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Column(Modifier.widthIn(max = 640.dp).fillMaxWidth()) {
                Gallery(listing = listing, lang = lang)

                Column(Modifier.padding(horizontal = 20.dp)) {
                    Spacer(Modifier.height(18.dp))

                    Text(
                        text = listing.displayName(lang),
                        color = colors.textPrimary,
                        fontSize = 25.sp,
                        lineHeight = 31.sp,
                        fontWeight = FontWeight.ExtraBold,
                        modifier = Modifier.asHeading(),
                    )

                    val variety = listing.displayVariety(lang)
                    if (variety.isNotEmpty()) {
                        Spacer(Modifier.height(4.dp))
                        Text(variety, color = colors.textSecondary, fontSize = 15.sp)
                    }

                    Spacer(Modifier.height(14.dp))
                    val unit = listing.displayUnit(lang)
                    Row(verticalAlignment = Alignment.Bottom) {
                        Text(
                            text = listing.priceLabel,
                            color = colors.accent,
                            fontSize = 30.sp,
                            fontWeight = FontWeight.ExtraBold,
                        )
                        if (unit.isNotEmpty()) {
                            Text(
                                text = " / $unit",
                                color = colors.textSecondary,
                                fontSize = 15.sp,
                                fontWeight = FontWeight.Medium,
                                modifier = Modifier.padding(bottom = 4.dp),
                            )
                        }
                    }

                    /* Only the two facts a farmer always fills in get a chip.
                       The rest of the form — brix, soil pH, organic carbon,
                       pesticide result — is mostly null on live listings, and a
                       row of empty chips reads as a broken screen rather than a
                       thorough one. */
                    val method = methodLabel(listing.method, lang)
                    val category = categoryLabel(listing.category, lang)
                    if (method != null || category != null) {
                        Spacer(Modifier.height(14.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            method?.let { Chip(it) }
                            category?.let { Chip(it) }
                        }
                    }

                    if (listing.isSoldOut) {
                        Spacer(Modifier.height(16.dp))
                        Notice(
                            lang.l(
                                "Sold out for now. This farmer grows it — check back after the next harvest.",
                                "ప్రస్తుతం అయిపోయింది. ఈ రైతు దీన్ని పండిస్తారు — తదుపరి కోత తర్వాత చూడండి.",
                            ),
                        )
                    }

                    val tiers = listing.priceTiers()
                    if (tiers.isNotEmpty()) {
                        Spacer(Modifier.height(22.dp))
                        SectionTitle(lang.l("Buy more, pay less", "ఎక్కువ కొంటే తక్కువ ధర"))
                        Spacer(Modifier.height(10.dp))
                        TierTable(tiers = tiers, unit = unit, lang = lang)
                    }

                    if (!listing.description.isNullOrBlank()) {
                        Spacer(Modifier.height(24.dp))
                        SectionTitle(lang.l("About this produce", "ఈ ఉత్పత్తి గురించి"))
                        Spacer(Modifier.height(8.dp))
                        Text(
                            /* The farmer's own words, unedited. On the live
                               catalogue these read like "We use slurry and fish
                               amino acid every 10 days" — the single most
                               convincing thing on the screen. */
                            text = listing.description,
                            color = colors.textSecondary,
                            fontSize = 15.sp,
                            lineHeight = 23.sp,
                        )
                    }

                    listing.farmer?.let { farmer ->
                        Spacer(Modifier.height(24.dp))
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
                            fontSize = 13.5.sp,
                        )
                    }

                    Spacer(Modifier.height(28.dp))
                }
            }
        }

        OrderBar(
            lang = lang,
            soldOut = listing.isSoldOut,
            onCall = { context.dialGoGrameen(lang) },
        )
    }
}

/* Pinned under the scroll, always in reach of a thumb.
 *
 * The sentence above the button says why it is a phone call and not a cart, so
 * nobody wonders where "Add to cart" went. A greyed cart button would have
 * implied the cart exists in this build. */
@Composable
private fun OrderBar(lang: Lang, soldOut: Boolean, onCall: () -> Unit) {
    val colors = GgTheme.colors
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(colors.background),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        HorizontalDivider(color = colors.border)
        Column(
            modifier = Modifier
                .widthIn(max = 640.dp)
                .fillMaxWidth()
                .padding(horizontal = 20.dp, vertical = 12.dp),
        ) {
            Text(
                text = lang.l(
                    "Ordering in the app is coming soon. To buy today, call us or order at gogrameen.in.",
                    "యాప్‌లో ఆర్డర్ త్వరలో వస్తుంది. ఈరోజు కొనాలంటే మాకు కాల్ చేయండి లేదా gogrameen.in లో ఆర్డర్ చేయండి.",
                ),
                color = colors.textSecondary,
                fontSize = 12.5.sp,
                lineHeight = 17.sp,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(10.dp))
            PrimaryButton(
                label = if (soldOut) {
                    lang.l("Call to ask about the next harvest", "తదుపరి కోత గురించి కాల్ చేయండి")
                } else {
                    lang.l("Call to order", "ఆర్డర్ కోసం కాల్ చేయండి")
                },
                onClick = onCall,
                leadingIcon = Icons.Filled.Call,
            )
        }
    }
}

/* The photos at the top, 4:3 rather than the card's square: a detail screen
 * has the height to spend and the crop is kinder to a photo of a basket.
 *
 * Swipeable when the farmer uploaded more than one, with dots underneath —
 * the app used to show only the first, and the second and third photo are
 * often the close-up and the field, which are the convincing ones. */
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun Gallery(listing: Listing, lang: Lang) {
    val colors = GgTheme.colors
    val photos = listing.photoUrls

    if (photos.size <= 1) {
        PhotoFrame(url = photos.firstOrNull(), emoji = listing.emoji)
        return
    }

    val pager = rememberPagerState(pageCount = { photos.size })
    Box {
        HorizontalPager(
            state = pager,
            modifier = Modifier.semantics {
                contentDescription = lang.l(
                    "Photo ${pager.currentPage + 1} of ${photos.size}. Swipe for more.",
                    "${photos.size} లో ${pager.currentPage + 1}వ ఫోటో. మరిన్నింటికి జరపండి.",
                )
            },
        ) { page ->
            PhotoFrame(url = photos[page], emoji = listing.emoji)
        }

        Row(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(bottom = 12.dp)
                .clip(RoundedCornerShape(999.dp))
                .background(colors.elevatedSurface.copy(alpha = 0.85f))
                .padding(horizontal = 9.dp, vertical = 6.dp)
                .decorative(),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            repeat(photos.size) { index ->
                val active = index == pager.currentPage
                Box(
                    Modifier
                        .size(if (active) 8.dp else 6.dp)
                        .clip(CircleShape)
                        .background(if (active) colors.accent else colors.textSecondary.copy(alpha = 0.5f)),
                )
            }
        }
    }
}

@Composable
private fun PhotoFrame(url: String?, emoji: String?) {
    val colors = GgTheme.colors
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .aspectRatio(4f / 3f)
            .background(colors.iconTileBg)
            .decorative(),
        contentAlignment = Alignment.Center,
    ) {
        Text(emoji ?: "🌿", fontSize = 64.sp)
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

/* The ladder as a small table: range on the left, price on the right. */
@Composable
private fun TierTable(tiers: List<PriceTier>, unit: String, lang: Lang) {
    val colors = GgTheme.colors
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .border(1.dp, colors.border, RoundedCornerShape(14.dp))
            .background(colors.surface),
    ) {
        tiers.forEachIndexed { index, tier ->
            if (index > 0) HorizontalDivider(color = colors.border)
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 15.dp, vertical = 12.dp)
                    .semantics(mergeDescendants = true) {},
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = tier.label(unit, lang),
                    color = colors.textPrimary,
                    fontSize = 14.5.sp,
                    modifier = Modifier.weight(1f),
                )
                Text(
                    text = "₹${formatAmount(tier.price)}" + if (unit.isNotEmpty()) " / $unit" else "",
                    color = if (index == 0) colors.textPrimary else colors.accent,
                    fontSize = 14.5.sp,
                    fontWeight = FontWeight.Bold,
                )
            }
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
            .padding(15.dp)
            .semantics(mergeDescendants = true) {},
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(46.dp)
                .clip(RoundedCornerShape(14.dp))
                .background(colors.iconTileBg)
                .decorative(),
            contentAlignment = Alignment.Center,
        ) {
            /* An aggregator sells on behalf of named growers, which is a
               different promise from a farmer selling their own crop — the web
               labels the two differently and so does this. */
            Text(if (farmer.accountType == "aggregator") "📦" else "🧑‍🌾", fontSize = 21.sp)
        }
        Spacer(Modifier.width(13.dp))
        Column {
            Text(
                text = farmer.name.orEmpty(),
                color = colors.textPrimary,
                fontSize = 16.sp,
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
                fontSize = 13.sp,
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
        fontSize = 12.sp,
        fontWeight = FontWeight.Bold,
        modifier = Modifier
            .clip(RoundedCornerShape(999.dp))
            .background(colors.badgeBg)
            .border(1.dp, colors.badgeBorder, RoundedCornerShape(999.dp))
            .padding(horizontal = 12.dp, vertical = 6.dp),
    )
}

@Composable
private fun SectionTitle(label: String) {
    Text(
        text = label,
        color = GgTheme.colors.textPrimary,
        fontSize = 17.sp,
        fontWeight = FontWeight.ExtraBold,
        modifier = Modifier.asHeading(),
    )
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
            .padding(36.dp),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = lang.l(
                    "That product is no longer loaded. Go back to the harvest list.",
                    "ఆ ఉత్పత్తి ఇప్పుడు అందుబాటులో లేదు. కోతల జాబితాకు వెళ్లండి.",
                ),
                color = colors.textSecondary,
                fontSize = 15.sp,
                lineHeight = 22.sp,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(20.dp))
            PrimaryButton(
                label = lang.l("Back to the harvest", "కోతల జాబితాకు"),
                onClick = onBack,
                modifier = Modifier.width(240.dp),
            )
        }
    }
}
