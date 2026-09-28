package com.gogrameen.app.catalogue

import androidx.compose.animation.Crossfade
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyGridState
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.gogrameen.app.Lang
import com.gogrameen.app.l
import com.gogrameen.app.ui.AccountButton
import com.gogrameen.app.ui.CentredState
import com.gogrameen.app.ui.GgTopBar
import com.gogrameen.app.ui.PrimaryButton
import com.gogrameen.app.ui.Skeleton
import com.gogrameen.app.ui.TouchTarget
import com.gogrameen.app.ui.decorative
import com.gogrameen.app.ui.theme.GgTheme

/* The buyer's catalogue — a native read of /api/produce.
 *
 * A cut-down port of src/app/consumer/page.tsx, which is 1,487 lines carrying a
 * cart, search, location distance, reviews, demand intents and sorting. This
 * screen answers one question — what can I buy today, and from whom.
 *
 * Two columns on a phone, which puts four products above the fold against a
 * single column's two; three or four on a tablet or a phone turned sideways,
 * instead of two cards stretched to the width of a laptop. */
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
    accountName: String? = null,
    onAccount: () -> Unit = {},
) {
    val colors = GgTheme.colors
    val focus = LocalFocusManager.current
    val grid = rememberLazyGridState()

    /* New results start at the top. Without this, someone scrolled halfway
       down "All produce" who taps "Fruits" lands halfway down the fruit — or
       past the end of it, looking at nothing. Keyed on the inputs, not on the
       results, so a pull-to-refresh leaves them where they were. */
    LaunchedEffect(state.query, state.method, state.category) {
        if (grid.firstVisibleItemIndex > 0) grid.scrollToItem(0)
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(colors.background),
    ) {
        GgTopBar(
            lang = lang,
            onToggleLang = onToggleLang,
            onBack = onBack,
            title = lang.l("Today's harvest", "నేటి కోత"),
            account = { AccountButton(name = accountName, lang = lang, onClick = onAccount) },
        )

        SearchBox(
            query = state.query,
            lang = lang,
            onQueryChange = onQueryChange,
            onDone = { focus.clearFocus() },
        )

        Spacer(Modifier.height(4.dp))
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

        /* Pull-to-refresh wraps only the results area, not the search box and
           chips. Dragging a filter row to reload would fight its horizontal
           scroll, and there is nothing to refresh above the grid anyway. */
        PullToRefreshBox(
            isRefreshing = state.refreshing,
            onRefresh = onRefresh,
            modifier = Modifier.fillMaxSize(),
        ) {
            /* A crossfade between loading, results and the two empty states,
               rather than a hard cut — the grid arriving should read as the
               placeholders filling in, not as the screen being replaced. Keyed
               on the kind of state, so a new list of results under an existing
               grid does NOT fade (that would blink on every keystroke). */
            Crossfade(targetState = state.content.kind(), label = "catalogue") { kind ->
                when (kind) {
                    ContentKind.Loading -> SkeletonGrid(lang)
                    ContentKind.Failed -> Failure(
                        offline = (state.content as? CatalogueState.Failed)?.offline ?: true,
                        lang = lang,
                        onRetry = onRetry,
                    )
                    ContentKind.Empty -> Empty(narrowed = state.isNarrowed, lang = lang, onClear = onClearFilters)
                    ContentKind.Results -> Grid(
                        listings = (state.content as? CatalogueState.Ready)?.listings.orEmpty(),
                        lang = lang,
                        grid = grid,
                        onOpen = onOpen,
                    )
                }
            }
        }
    }
}

private enum class ContentKind { Loading, Failed, Empty, Results }

private fun CatalogueState.kind(): ContentKind = when (this) {
    CatalogueState.Loading -> ContentKind.Loading
    is CatalogueState.Failed -> ContentKind.Failed
    is CatalogueState.Ready -> if (listings.isEmpty()) ContentKind.Empty else ContentKind.Results
}

/* Two different failures, two different messages. "Check your connection" sent
 * to someone whose connection is fine, when the server is the thing that broke,
 * makes them turn their data off and on for nothing. */
@Composable
private fun Failure(offline: Boolean, lang: Lang, onRetry: () -> Unit) {
    CentredState {
        StateIcon("📡")
        StateTitle(
            if (offline) lang.l("You're offline", "ఇంటర్నెట్ లేదు")
            else lang.l("Something went wrong", "ఏదో సమస్య వచ్చింది"),
        )
        Spacer(Modifier.height(6.dp))
        StateMessage(
            if (offline) {
                lang.l(
                    "Couldn't reach Go Grameen. Check your connection and try again.",
                    "గో గ్రామీణ్‌ను చేరలేకపోయాము. మీ ఇంటర్నెట్ చూసి మళ్లీ ప్రయత్నించండి.",
                )
            } else {
                lang.l(
                    "The catalogue is having trouble right now. Please try again.",
                    "కేటలాగ్‌లో సమస్య ఉంది. దయచేసి మళ్లీ ప్రయత్నించండి.",
                )
            },
        )
        Spacer(Modifier.height(20.dp))
        PrimaryButton(
            label = lang.l("Try again", "మళ్లీ ప్రయత్నించండి"),
            onClick = onRetry,
            modifier = Modifier.width(220.dp),
        )
    }
}

/* An empty grid means two different things and must not look like one thing.
 *
 * Filtered to nothing is the buyer's own doing and is one tap from being
 * undone, so it says which way out. Genuinely nothing listed is not an error
 * and must NOT offer a retry — nothing is broken. It happens for real between
 * harvests, and pulling down to refresh still works here. */
@Composable
private fun Empty(narrowed: Boolean, lang: Lang, onClear: () -> Unit) {
    CentredState {
        if (narrowed) {
            StateIcon("🔍")
            StateTitle(lang.l("No matches", "ఏమీ దొరకలేదు"))
            Spacer(Modifier.height(6.dp))
            StateMessage(
                lang.l(
                    "Nothing matches that. Try a different word, or clear the filters.",
                    "దానికి సరిపోయేది ఏమీ లేదు. వేరే పదం ప్రయత్నించండి, లేదా ఫిల్టర్లు తీసేయండి.",
                ),
            )
            Spacer(Modifier.height(20.dp))
            PrimaryButton(
                label = lang.l("Clear filters", "ఫిల్టర్లు తీసేయి"),
                onClick = onClear,
                modifier = Modifier.width(220.dp),
            )
        } else {
            StateIcon("🧺")
            StateTitle(lang.l("Nothing listed yet", "ఇంకా ఏమీ లేదు"))
            Spacer(Modifier.height(6.dp))
            StateMessage(
                lang.l(
                    "Nothing is listed today. The farmers post as they harvest — pull down to check again.",
                    "ఈరోజు ఏమీ లేదు. రైతులు కోసిన వెంటనే నమోదు చేస్తారు — మళ్లీ చూడటానికి కిందకు లాగండి.",
                ),
            )
        }
    }
}

@Composable
private fun StateIcon(emoji: String) {
    Box(
        modifier = Modifier
            .size(72.dp)
            .clip(CircleShape)
            .background(GgTheme.colors.iconTileBg)
            .decorative(),
        contentAlignment = Alignment.Center,
    ) {
        Text(emoji, fontSize = 32.sp)
    }
    Spacer(Modifier.height(16.dp))
}

@Composable
private fun StateTitle(text: String) {
    Text(
        text = text,
        color = GgTheme.colors.textPrimary,
        fontSize = 18.sp,
        fontWeight = FontWeight.ExtraBold,
        textAlign = TextAlign.Center,
    )
}

@Composable
private fun StateMessage(text: String) {
    Text(
        text = text,
        color = GgTheme.colors.textSecondary,
        fontSize = 14.sp,
        lineHeight = 21.sp,
        textAlign = TextAlign.Center,
    )
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
    var focused by remember { mutableStateOf(false) }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp)
            .heightIn(min = 52.dp)
            .clip(RoundedCornerShape(999.dp))
            .border(
                if (focused) 1.5.dp else 1.dp,
                if (focused) colors.accent else colors.border,
                RoundedCornerShape(999.dp),
            )
            .background(colors.surface)
            .padding(start = 16.dp, end = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = Icons.Filled.Search,
            contentDescription = null,
            tint = colors.textSecondary,
            modifier = Modifier.size(19.dp),
        )
        Spacer(Modifier.width(10.dp))

        Box(modifier = Modifier.weight(1f), contentAlignment = Alignment.CenterStart) {
            if (query.isEmpty()) {
                Text(placeholder, color = colors.textSecondary, fontSize = 15.sp, modifier = Modifier.decorative())
            }
            BasicTextField(
                value = query,
                onValueChange = onQueryChange,
                singleLine = true,
                textStyle = LocalTextStyle.current.copy(color = colors.textPrimary, fontSize = 15.sp),
                cursorBrush = SolidColor(colors.accent),
                /* Search, not Done: the keyboard's action key should say what
                   it does. It only dismisses the keyboard — results are
                   already arriving as they type. */
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                keyboardActions = KeyboardActions(onSearch = { onDone() }),
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 14.dp)
                    .onFocusChanged { focused = it.isFocused }
                    /* The placeholder is a sibling Text, so without this the
                       field itself is an unlabelled box to a screen reader. */
                    .semantics { contentDescription = placeholder },
            )
        }

        /* Only present when there is something to clear, so it never sits there
           as a dead control. 48dp to hit, like every other button. */
        if (query.isNotEmpty()) {
            Box(
                modifier = Modifier
                    .size(TouchTarget)
                    .clip(CircleShape)
                    .clickable(role = Role.Button) {
                        onQueryChange("")
                        onDone()
                    },
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = Icons.Filled.Close,
                    contentDescription = lang.l("Clear search", "వెతుకులాట తీసేయి"),
                    tint = colors.textSecondary,
                    modifier = Modifier.size(19.dp),
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
 * would push the produce off the screen.
 *
 * A selectable group, so TalkBack says "Fruits, selected, 3 of 7" rather than
 * just "Fruits" — before this, a blind user had no way to know which filter
 * was on. */
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
            .padding(horizontal = 12.dp)
            .selectableGroup(),
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

/* Drawn 36dp tall; hit area 48dp. The outer Box takes the tap with the
 * padding included, the inner Text is only paint — so a thumb that lands
 * just above a chip still selects it. */
@Composable
private fun FilterChip(label: String, active: Boolean, onClick: () -> Unit) {
    val colors = GgTheme.colors
    Box(
        modifier = Modifier
            .heightIn(min = TouchTarget)
            .clip(RoundedCornerShape(999.dp))
            .selectable(selected = active, role = Role.RadioButton, onClick = onClick)
            .padding(horizontal = 4.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = label,
            color = if (active) colors.onAccent else colors.textPrimary,
            fontSize = 13.5.sp,
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
                .padding(horizontal = 15.dp, vertical = 8.dp),
        )
    }
}

/* Two columns on every phone, more only on a genuinely wide screen.
 *
 * NOT GridCells.Adaptive(160.dp), which this replaced. On a 360dp phone — the
 * most common Android width in India, and the width of the phone this was
 * first tested on — the two cards plus padding need 332dp and got 328, so
 * Adaptive fell back to ONE column: one product per screen instead of four,
 * which is the whole reason the grid exists. A floor of two cannot fall over
 * like that. Tablets and phones on their side still gain columns, at one per
 * 220dp. */
private val ProduceColumns = object : GridCells {
    override fun Density.calculateCrossAxisCellSizes(availableSize: Int, spacing: Int): List<Int> {
        val cell = 220.dp.roundToPx()
        val count = maxOf(2, (availableSize + spacing) / (cell + spacing))
        val usable = availableSize - spacing * (count - 1)
        return List(count) { usable / count + if (it < usable % count) 1 else 0 }
    }
}

@Composable
private fun Grid(listings: List<Listing>, lang: Lang, grid: LazyGridState, onOpen: (Listing) -> Unit) {
    val colors = GgTheme.colors
    val farmers = listings.mapNotNull { it.farmer?.id }.distinct().size

    LazyVerticalGrid(
        columns = ProduceColumns,
        state = grid,
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 6.dp, bottom = 28.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
        modifier = Modifier.fillMaxSize(),
    ) {
        /* The count sits inside the grid as a full-width row rather than above
           it, so it scrolls away with the produce instead of pinning a line of
           chrome to a screen that is mostly photos. */
        item(span = { GridItemSpan(maxLineSpan) }) {
            Text(
                text = countLine(listings.size, farmers, lang),
                color = colors.textSecondary,
                fontSize = 13.sp,
                modifier = Modifier.padding(bottom = 2.dp),
            )
        }

        items(listings, key = { it.id }) { listing ->
            ProduceCard(listing = listing, lang = lang, onClick = { onOpen(listing) })
        }
    }
}

/* What is on its way, in the shape it will arrive in: a count line and cards
 * with a photo and three lines under it. The grid "filling in" reads as fast;
 * a lone spinner reads as waiting. */
@Composable
private fun SkeletonGrid(lang: Lang) {
    LazyVerticalGrid(
        columns = ProduceColumns,
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 6.dp, bottom = 28.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
        modifier = Modifier
            .fillMaxSize()
            /* One announcement for the whole placeholder grid, instead of
               TalkBack stepping through twelve grey boxes that say nothing. */
            .semantics { contentDescription = lang.l("Loading today's harvest…", "నేటి కోతలు వస్తున్నాయి…") },
    ) {
        item(span = { GridItemSpan(maxLineSpan) }) {
            Skeleton(Modifier.width(170.dp).height(14.dp))
        }
        items(6) {
            Column(
                modifier = Modifier
                    .clip(RoundedCornerShape(16.dp))
                    .border(1.dp, GgTheme.colors.border, RoundedCornerShape(16.dp))
                    .background(GgTheme.colors.surface),
            ) {
                Skeleton(
                    Modifier
                        .fillMaxWidth()
                        .aspectRatio(1f),
                    shape = RoundedCornerShape(0.dp),
                )
                Column(Modifier.padding(12.dp)) {
                    Skeleton(Modifier.fillMaxWidth(0.8f).height(14.dp))
                    Spacer(Modifier.height(10.dp))
                    Skeleton(Modifier.fillMaxWidth(0.45f).height(16.dp))
                    Spacer(Modifier.height(12.dp))
                    Skeleton(Modifier.fillMaxWidth(0.65f).height(11.dp))
                }
            }
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
               cards in it. Without it a product with no variety line draws a
               shorter card than its neighbour and the row ends ragged. */
            .fillMaxHeight()
            .clip(RoundedCornerShape(16.dp))
            .border(1.dp, colors.border, RoundedCornerShape(16.dp))
            .background(colors.surface)
            /* Still tappable when sold out. The detail screen is where the
               farmer, the growing method and the description live, and those
               are exactly what someone wants when they have just found out
               they were too late. */
            .clickable(
                onClick = onClick,
                onClickLabel = lang.l("See details", "వివరాలు చూడండి"),
                role = Role.Button,
            ),
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
                .padding(horizontal = 12.dp, vertical = 11.dp),
        ) {
            Text(
                text = listing.displayName(lang),
                color = colors.textPrimary,
                fontSize = 15.sp,
                lineHeight = 19.sp,
                fontWeight = FontWeight.Bold,
                /* Two lines, then ellipsis. Names run long — "Kujipataliya
                   Rice- Single Polish" — and since the cards in a row share a
                   height, one unbounded name would stretch its neighbour too. */
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )

            val variety = listing.displayVariety(lang)
            if (variety.isNotEmpty()) {
                Spacer(Modifier.height(2.dp))
                Text(
                    text = variety,
                    color = colors.textSecondary,
                    fontSize = 12.5.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }

            Spacer(Modifier.height(8.dp))
            PriceLine(listing = listing, lang = lang)

            /* Pins the grower to the bottom of the card rather than letting it
               float under a short name, so the cards in a row line their last
               lines up with each other. */
            Spacer(Modifier.height(8.dp))
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
                    fontSize = 12.sp,
                    lineHeight = 16.sp,
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
            fontSize = 17.sp,
            fontWeight = FontWeight.ExtraBold,
        )
        val unit = listing.displayUnit(lang)
        if (unit.isNotEmpty()) {
            Text(
                text = " / $unit",
                color = colors.textSecondary,
                fontSize = 12.sp,
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
 * lime tile with the produce's own emoji on it. Coil shows the same tile while
 * loading, so a slow 4G image does not pop the card's height as it arrives. */
@Composable
private fun Photo(listing: Listing, modifier: Modifier = Modifier) {
    val colors = GgTheme.colors
    val url = listing.photoUrl

    Box(
        modifier = modifier
            .fillMaxWidth()
            .aspectRatio(1f)
            .background(colors.iconTileBg)
            .decorative(),
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
        fontSize = 11.sp,
        fontWeight = FontWeight.Bold,
        modifier = modifier
            .clip(RoundedCornerShape(999.dp))
            .background(colors.elevatedSurface)
            .border(1.dp, colors.border, RoundedCornerShape(999.dp))
            .padding(horizontal = 10.dp, vertical = 5.dp),
    )
}
