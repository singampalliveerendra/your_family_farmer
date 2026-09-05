package com.gogrameen.app.catalogue

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.gogrameen.app.Lang
import com.gogrameen.app.l
import com.gogrameen.app.ui.LanguageToggle
import com.gogrameen.app.ui.theme.GgTheme

/* The buyer's catalogue — a native read of /api/produce.
 *
 * A cut-down port of src/app/consumer/page.tsx, which is 1,487 lines carrying a
 * cart, search, location distance, reviews, demand intents and sorting. None of
 * that is here. This screen answers one question — what can I buy today, and
 * from whom — because that is the question the Buyer card on /home promises,
 * and everything else needs an account the app cannot yet create.
 *
 * Two columns, because the fold is what matters: on a 390dp phone a two-up grid
 * puts four products above it against a one-up's two, and these cards are a
 * photo and a price rather than anything that needs width. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CatalogueScreen(
    state: CatalogueUiState,
    lang: Lang,
    onToggleLang: () -> Unit,
    onBack: () -> Unit,
    onOpen: (Listing) -> Unit,
    onRetry: () -> Unit,
    onQueryChange: (String) -> Unit,
    onMethodChange: (MethodFilter) -> Unit,
    onCategoryChange: (CategoryFilter) -> Unit,
    onClearFilters: () -> Unit,
    onRefresh: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = GgTheme.colors
    val focus = LocalFocusManager.current

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(colors.background),
    ) {
        TopBar(lang = lang, onToggleLang = onToggleLang, onBack = onBack)

        SearchBox(
            query = state.query,
            lang = lang,
            onQueryChange = onQueryChange,
            onDone = { focus.clearFocus() },
        )

        FilterRow(
            selected = state.category,
            options = CategoryFilter.entries,
            lang = lang,
            onSelect = { onCategoryChange(it as CategoryFilter) },
        )
        FilterRow(
            selected = state.method,
            options = MethodFilter.entries,
            lang = lang,
            onSelect = { onMethodChange(it as MethodFilter) },
        )

        Spacer(Modifier.height(4.dp))

        /* Pull-to-refresh wraps only the results area, not the search box and
           chips. Dragging a filter row to reload would fight the horizontal
           scroll, and there is nothing to refresh above the grid anyway. */
        PullToRefreshBox(
            isRefreshing = state.refreshing,
            onRefresh = onRefresh,
            modifier = Modifier.fillMaxSize(),
        ) {
            when (val content = state.content) {
                is CatalogueState.Loading -> Centred {
                    CircularProgressIndicator(color = colors.accent)
                    Spacer(Modifier.height(16.dp))
                    Message(lang.l("Loading today's harvest…", "నేటి కోతలు వస్తున్నాయి…"))
                }

                is CatalogueState.Failed -> Centred {
                    /* Two different failures, two different messages. "Check
                       your connection" sent to someone whose connection is
                       fine, when the server is the thing that broke, makes them
                       turn their data off and on for nothing. */
                    Text("📡", fontSize = 34.sp)
                    Spacer(Modifier.height(14.dp))
                    Message(
                        if (content.offline) {
                            lang.l(
                                "Couldn't reach Go Grameen. Check your connection and try again.",
                                "గో గ్రామీణ్‌ను చేరలేకపోయాము. మీ ఇంటర్నెట్ చూసి మళ్లీ ప్రయత్నించండి.",
                            )
                        } else {
                            lang.l(
                                "The catalogue is having trouble right now. Please try again.",
                                "కేటలాగ్‌లో సమస్య ఉంది. దయచేసి మళ్లీ ప్రయత్నించండి.",
                            )
                        }
                    )
                    Spacer(Modifier.height(18.dp))
                    FilledButton(
                        label = lang.l("Try again", "మళ్లీ ప్రయత్నించండి"),
                        onClick = onRetry,
                    )
                }

                is CatalogueState.Ready -> if (content.listings.isEmpty()) {
                    Empty(narrowed = state.isNarrowed, lang = lang, onClear = onClearFilters)
                } else {
                    Grid(listings = content.listings, lang = lang, onOpen = onOpen)
                }
            }
        }
    }
}

/* An empty grid means two different things and must not look like one thing.
 *
 * Filtered to nothing is the buyer's own doing and is one tap from being
 * undone, so it says which way out. Genuinely nothing listed is not an error
 * and must NOT offer a retry — nothing is broken and tapping changes nothing.
 * It happens for real between harvests. */
@Composable
private fun Empty(narrowed: Boolean, lang: Lang, onClear: () -> Unit) {
    Centred {
        if (narrowed) {
            Text("🔍", fontSize = 34.sp)
            Spacer(Modifier.height(14.dp))
            Message(
                lang.l(
                    "Nothing matches that. Try a different word, or clear the filters.",
                    "దానికి సరిపోయేది ఏమీ లేదు. వేరే పదం ప్రయత్నించండి, లేదా ఫిల్టర్లు తీసేయండి.",
                )
            )
            Spacer(Modifier.height(18.dp))
            FilledButton(label = lang.l("Clear filters", "ఫిల్టర్లు తీసేయి"), onClick = onClear)
        } else {
            Text("🧺", fontSize = 34.sp)
            Spacer(Modifier.height(14.dp))
            Message(
                lang.l(
                    "Nothing is listed today. The farmers post as they harvest — do come back.",
                    "ఈరోజు ఏమీ లేదు. రైతులు కోసిన వెంటనే నమోదు చేస్తారు — మళ్లీ చూడండి.",
                )
            )
        }
    }
}

/* The search box.
 *
 * Hand-built on BasicTextField rather than an OutlinedTextField because the
 * rest of this app is hand-styled pills and borders, and Material's own field
 * brings a floating label and its own palette that would sit oddly among them.
 *
 * The typing itself is never debounced — only the request is, in the
 * ViewModel. A box that lags behind the keyboard feels broken no matter how
 * well the network is being looked after. */
@Composable
private fun SearchBox(
    query: String,
    lang: Lang,
    onQueryChange: (String) -> Unit,
    onDone: () -> Unit,
) {
    val colors = GgTheme.colors
    val placeholder = lang.l("Search produce…", "ఉత్పత్తులు వెతకండి…")

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp)
            .clip(RoundedCornerShape(999.dp))
            .border(1.dp, colors.border, RoundedCornerShape(999.dp))
            .background(colors.surface)
            .padding(start = 15.dp, end = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = Icons.Filled.Search,
            contentDescription = null,
            tint = colors.textSecondary,
            modifier = Modifier.size(17.dp),
        )
        Spacer(Modifier.width(10.dp))

        Box(modifier = Modifier.weight(1f), contentAlignment = Alignment.CenterStart) {
            if (query.isEmpty()) {
                Text(placeholder, color = colors.textSecondary, fontSize = 14.sp)
            }
            BasicTextField(
                value = query,
                onValueChange = onQueryChange,
                singleLine = true,
                textStyle = LocalTextStyle.current.copy(color = colors.textPrimary, fontSize = 14.sp),
                cursorBrush = SolidColor(colors.accent),
                /* Search, not Done: the keyboard's action key should say what
                   it does. It only dismisses the keyboard — results are
                   already arriving as they type. */
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                keyboardActions = KeyboardActions(onSearch = { onDone() }),
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 14.dp)
                    /* The placeholder is a sibling Text, so without this the
                       field itself is an unlabelled box to a screen reader. */
                    .semantics { contentDescription = placeholder },
            )
        }

        /* Only present when there is something to clear, so it never sits there
           as a dead control. */
        if (query.isNotEmpty()) {
            Box(
                modifier = Modifier
                    .size(34.dp)
                    .clip(RoundedCornerShape(999.dp))
                    .clickable {
                        onQueryChange("")
                        onDone()
                    },
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = Icons.Filled.Close,
                    contentDescription = lang.l("Clear search", "వెతుకులాట తీసేయి"),
                    tint = colors.textSecondary,
                    modifier = Modifier.size(17.dp),
                )
            }
        }
    }
}

/* One scrolling row of chips per filter dimension.
 *
 * Two rows rather than one mixed row: category and method narrow different
 * things, and a single strip of "Vegetables · Fruits · Organic" reads as one
 * list where picking two would be contradictory. Horizontally scrollable
 * because seven categories do not fit across a 390dp phone and wrapping them
 * would push the produce off the screen. */
@Composable
private fun FilterRow(
    selected: CatalogueFilter,
    options: List<CatalogueFilter>,
    lang: Lang,
    onSelect: (CatalogueFilter) -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = 7.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        options.forEach { option ->
            FilterChip(
                label = option.label(lang),
                active = option == selected,
                onClick = { onSelect(option) },
            )
        }
    }
}

@Composable
private fun FilterChip(label: String, active: Boolean, onClick: () -> Unit) {
    val colors = GgTheme.colors
    Text(
        text = label,
        color = if (active) colors.onAccent else colors.textSecondary,
        fontSize = 12.sp,
        fontWeight = if (active) FontWeight.Bold else FontWeight.Medium,
        maxLines = 1,
        modifier = Modifier
            .clip(RoundedCornerShape(999.dp))
            .background(if (active) colors.accentStrong else colors.surface)
            .border(
                1.dp,
                if (active) colors.accentStrong else colors.border,
                RoundedCornerShape(999.dp),
            )
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 8.dp),
    )
}

@Composable
private fun Grid(listings: List<Listing>, lang: Lang, onOpen: (Listing) -> Unit) {
    val colors = GgTheme.colors
    val farmers = listings.mapNotNull { it.farmer?.id }.distinct().size

    LazyVerticalGrid(
        columns = GridCells.Fixed(2),
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 24.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
        modifier = Modifier.fillMaxSize(),
    ) {
        /* The count sits inside the grid as a full-width row rather than above
           it, so it scrolls away with the produce instead of pinning a line of
           chrome to a screen that is mostly photos. */
        item(span = { androidx.compose.foundation.lazy.grid.GridItemSpan(maxLineSpan) }) {
            Text(
                text = countLine(listings.size, farmers, lang),
                color = colors.textSecondary,
                fontSize = 12.5.sp,
                modifier = Modifier.padding(bottom = 4.dp),
            )
        }

        items(listings, key = { it.id }) { listing ->
            ProduceCard(listing = listing, lang = lang, onClick = { onOpen(listing) })
        }
    }
}

/* Telugu is not English with the words swapped: it has no "1 item / 2 items"
 * split in the way this sentence needs one, so the two languages are written
 * out separately rather than forced through one plural helper. */
private fun countLine(items: Int, farmers: Int, lang: Lang): String = lang.l(
    "${items} ${if (items == 1) "product" else "products"} from " +
        "${farmers} ${if (farmers == 1) "farmer" else "farmers"}",
    "${farmers} రైతుల నుండి ${items} ఉత్పత్తులు",
)

@Composable
private fun ProduceCard(listing: Listing, lang: Lang, onClick: () -> Unit) {
    val colors = GgTheme.colors
    val soldOut = listing.isSoldOut

    Column(
        modifier = Modifier
            /* Fills the row's height, which the grid sets from the taller of the
               two cards. Without it a product with no variety line draws a
               shorter card than its neighbour and the row ends ragged — plainly
               visible on the live catalogue, where only some produce has one. */
            .fillMaxHeight()
            .clip(RoundedCornerShape(16.dp))
            .border(1.dp, colors.border, RoundedCornerShape(16.dp))
            .background(colors.surface)
            /* Still tappable when sold out. The detail screen is where the
               farmer, the growing method and the description live, and those
               are exactly what someone wants when they have just found out
               they were too late. */
            .clickable(onClick = onClick),
    ) {
        Box {
            Photo(listing = listing, modifier = Modifier.alpha(if (soldOut) 0.45f else 1f))
            if (soldOut) {
                SoldOutTag(
                    label = lang.l("Sold out", "అయిపోయింది"),
                    modifier = Modifier
                        .align(Alignment.TopStart)
                        .padding(8.dp),
                )
            }
        }

        Column(
            modifier = Modifier
                .weight(1f)
                .padding(horizontal = 11.dp, vertical = 10.dp),
        ) {
            Text(
                text = listing.displayName(lang),
                color = colors.textPrimary,
                fontSize = 14.sp,
                lineHeight = 18.sp,
                fontWeight = FontWeight.Bold,
                /* Two lines, then ellipsis. Names run long — "Kujipataliya
                   Rice- Single Polish" — and since the cards in a row now share
                   a height, one unbounded name would stretch its neighbour too. */
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )

            val variety = listing.displayVariety(lang)
            if (variety.isNotEmpty()) {
                Spacer(Modifier.height(2.dp))
                Text(
                    text = variety,
                    color = colors.textSecondary,
                    fontSize = 11.5.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }

            Spacer(Modifier.height(7.dp))
            PriceLine(listing = listing, lang = lang)

            /* Pins the grower to the bottom of the card rather than letting it
               float under a short name, so the two cards in a row line their
               last lines up with each other. */
            Spacer(Modifier.height(7.dp))
            Spacer(Modifier.weight(1f))

            listing.farmer?.name?.takeIf { it.isNotBlank() }?.let { farmerName ->
                Text(
                    /* The farmer's name is the product here — the whole pitch
                       is that you know who grew it — so it is on the card, not
                       only on the detail screen. */
                    text = listOfNotNull(
                        farmerName,
                        listing.farmer.village?.takeIf { it.isNotBlank() },
                    ).joinToString(" · "),
                    color = colors.textSecondary,
                    fontSize = 11.sp,
                    lineHeight = 15.sp,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

@Composable
private fun PriceLine(listing: Listing, lang: Lang) {
    val colors = GgTheme.colors
    Row(verticalAlignment = Alignment.Bottom) {
        Text(
            text = listing.priceLabel,
            color = colors.accent,
            fontSize = 16.sp,
            fontWeight = FontWeight.ExtraBold,
        )
        val unit = listing.displayUnit(lang)
        if (unit.isNotEmpty()) {
            Text(
                text = " / $unit",
                color = colors.textSecondary,
                fontSize = 11.5.sp,
                fontWeight = FontWeight.Medium,
                modifier = Modifier.padding(bottom = 1.dp),
            )
        }
    }
}

/* The photo, or the emoji standing in for it.
 *
 * Listings with no image are ordinary — a farmer adds one when they get round
 * to it — so the fallback is a designed state rather than a broken box: the
 * lime tile from the role cards with the produce's own emoji on it. Coil shows
 * the same tile while loading, so a slow 4G image does not pop the card's
 * height as it arrives. */
@Composable
private fun Photo(listing: Listing, modifier: Modifier = Modifier) {
    val colors = GgTheme.colors
    val url = listing.photoUrl

    Box(
        modifier = modifier
            .fillMaxWidth()
            .aspectRatio(1f)
            .background(colors.iconTileBg),
        contentAlignment = Alignment.Center,
    ) {
        Text(listing.emoji ?: "🌿", fontSize = 34.sp)

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
private fun SoldOutTag(label: String, modifier: Modifier = Modifier) {
    val colors = GgTheme.colors
    Text(
        text = label,
        color = colors.textPrimary,
        fontSize = 10.sp,
        fontWeight = FontWeight.Bold,
        modifier = modifier
            .clip(RoundedCornerShape(999.dp))
            .background(colors.elevatedSurface)
            .border(1.dp, colors.border, RoundedCornerShape(999.dp))
            .padding(horizontal = 9.dp, vertical = 4.dp),
    )
}

@Composable
private fun TopBar(lang: Lang, onToggleLang: () -> Unit, onBack: () -> Unit) {
    val colors = GgTheme.colors
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = 8.dp, end = 16.dp, top = 8.dp, bottom = 10.dp),
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
        Spacer(Modifier.width(4.dp))
        Text(
            text = lang.l("Today's harvest", "నేటి కోత"),
            color = colors.textPrimary,
            fontSize = 19.sp,
            fontWeight = FontWeight.ExtraBold,
        )
        Spacer(Modifier.weight(1f))
        LanguageToggle(lang = lang, onToggle = onToggleLang)
    }
}

/* The one solid button on this screen — "Try again" after a failure, and
 * "Clear filters" after a search that found nothing. Both are the single
 * obvious next move, so they look identical on purpose. */
@Composable
private fun FilledButton(label: String, onClick: () -> Unit) {
    val colors = GgTheme.colors
    Text(
        text = label,
        color = colors.onAccent,
        fontSize = 13.sp,
        fontWeight = FontWeight.Bold,
        modifier = Modifier
            .clip(RoundedCornerShape(999.dp))
            .background(colors.accentStrong)
            .clickable(onClick = onClick)
            .padding(horizontal = 26.dp, vertical = 13.dp),
    )
}

@Composable
private fun Message(text: String) {
    Text(
        text = text,
        color = GgTheme.colors.textSecondary,
        fontSize = 14.sp,
        lineHeight = 21.sp,
        textAlign = TextAlign.Center,
    )
}

/* Loading, error and empty all sit in the middle of what is left below the top
 * bar, not at the top of it — a lone spinner pinned under the header reads as
 * part of the chrome rather than as the screen's whole state. */
@Composable
private fun Centred(content: @Composable () -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 40.dp)
            .padding(bottom = 60.dp),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) { content() }
    }
}
