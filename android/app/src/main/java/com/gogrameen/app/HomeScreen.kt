package com.gogrameen.app

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.gogrameen.app.ui.AccountButton
import com.gogrameen.app.ui.Contact
import com.gogrameen.app.ui.ContactRow
import com.gogrameen.app.ui.LanguageToggle
import com.gogrameen.app.ui.PrimaryButton
import com.gogrameen.app.ui.decorative
import com.gogrameen.app.ui.dialGoGrameen
import com.gogrameen.app.ui.emailGoGrameen
import com.gogrameen.app.ui.asHeading
import com.gogrameen.app.ui.theme.GgGreen500
import com.gogrameen.app.ui.theme.GgGreen700
import com.gogrameen.app.ui.theme.GgTheme
import com.gogrameen.app.ui.theme.GoGrameenTheme

/* The native /home.
 *
 * A port of src/components/home/HomeLanding.tsx and RoleSelect.tsx, cut down to
 * what a first screen needs: the wordmark, the hero, one clear way in, and the
 * three role cards. Everything below the fold on the web page — features,
 * how-it-works, about — is marketing aimed at a visitor who found the site.
 * Someone holding the app has already installed it.
 *
 * Every colour comes from GgTheme.colors so the dark setting repaints the whole
 * screen. The web page's motion — rising cards, floating photos, drifting
 * blobs — is deliberately absent: it is decoration on a page that has to sell,
 * and here it would only cost frames on the low-end phones this app is for. */

private data class Door(
    val emoji: String,
    val title: Pair<String, String>,
    val blurb: Pair<String, String>,
    /* Buyer is the only door that opens so far. Flagged on the role rather than
       matched on the title at the tap site, so the copy can change without
       quietly turning the card back into a dead end. */
    val opensCatalogue: Boolean = false,
    /* What a tap on a door that is not built yet says. The card also wears a
       "Soon" tag, so nobody has to tap to find out — but when they do, they are
       told what to do instead, in their own language. */
    val notYet: Pair<String, String>? = null,
)

/* Copy lifted verbatim from RoleSelect.tsx, in its order. Moderator and rider
 * are absent there and absent here: staff and recruited riders reach their own
 * logins directly, and neither belongs on the front door. */
private val DOORS = listOf(
    Door(
        emoji = "🛒",
        title = "I'm a Buyer" to "నేను కొనుగోలుదారుని",
        blurb = "Browse today's harvests and order direct." to "నేటి కోతలు చూసి నేరుగా ఆర్డర్ చేయండి.",
        opensCatalogue = true,
    ),
    Door(
        emoji = "🧑‍🌾",
        title = "I'm a Farmer" to "నేను రైతుని",
        blurb = "List your harvest. Keep the whole price." to "మీ కోత నమోదు చేయండి. పూర్తి ధర మీదే.",
        notYet = "Farmer tools are coming to the app. For now, sell on gogrameen.in." to
            "రైతుల కోసం యాప్ త్వరలో వస్తుంది. ప్రస్తుతానికి gogrameen.in లో అమ్మండి.",
    ),
    Door(
        emoji = "📦",
        title = "I'm an Aggregator" to "నేను అగ్రిగేటర్‌ని",
        blurb = "Sell for many farmers — each one named." to "రైతుల తరఫున అమ్మండి — ప్రతి పేరు కనిపిస్తుంది.",
        notYet = "Aggregator tools are coming to the app. For now, use gogrameen.in." to
            "అగ్రిగేటర్ల కోసం యాప్ త్వరలో వస్తుంది. ప్రస్తుతానికి gogrameen.in వాడండి.",
    ),
)

@Composable
fun HomeScreen(
    lang: Lang,
    onToggleLang: () -> Unit,
    onBrowse: () -> Unit,
    modifier: Modifier = Modifier,
    accountName: String? = null,
    onAccount: () -> Unit = {},
) {
    val colors = GgTheme.colors
    val context = LocalContext.current

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(colors.background)
            .verticalScroll(rememberScrollState()),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        /* Capped and centred so a tablet or a landscape phone gets a readable
           column instead of a 38sp headline stretched across a metre. */
        Column(
            modifier = Modifier
                .widthIn(max = 560.dp)
                .fillMaxWidth()
                .padding(horizontal = 20.dp),
        ) {
            Spacer(Modifier.height(6.dp))
            Header(lang = lang, onToggleLang = onToggleLang, accountName = accountName, onAccount = onAccount)

            Spacer(Modifier.height(24.dp))
            Badge(lang.l("Farm direct · Harvested today", "నేరుగా పొలం నుండి · నేడే కోత"))

            Spacer(Modifier.height(18.dp))
            Headline(lang)

            Spacer(Modifier.height(16.dp))
            Text(
                text = lang.l(
                    "Go Grameen connects farmers directly to consumers. Harvested today, priced by the farmer, delivered to you.",
                    "గో గ్రామీణ్ రైతులను నేరుగా వినియోగదారులతో కలుపుతుంది. నేడే కోత, ధర రైతుదే, నేరుగా మీ ఇంటికి.",
                ),
                color = colors.textSecondary,
                fontSize = 16.sp,
                lineHeight = 25.sp,
            )

            /* THE thing this screen is for, so it is the one filled button on
               it. It used to be an outline button, which on a white page read as
               the least important control rather than the most. */
            Spacer(Modifier.height(24.dp))
            PrimaryButton(
                label = lang.l("Browse today's harvest", "నేటి కోతలు చూడండి"),
                onClick = onBrowse,
            )

            Spacer(Modifier.height(40.dp))
            Text(
                text = lang.l("Who are you?", "మీరు ఎవరు?"),
                color = colors.textPrimary,
                fontSize = 22.sp,
                fontWeight = FontWeight.ExtraBold,
                modifier = Modifier.asHeading(),
            )

            Spacer(Modifier.height(14.dp))
            DOORS.forEach { role ->
                RoleCard(
                    role = role,
                    lang = lang,
                    onClick = {
                        if (role.opensCatalogue) {
                            onBrowse()
                        } else {
                            role.notYet?.let {
                                Toast.makeText(context, lang.l(it.first, it.second), Toast.LENGTH_LONG).show()
                            }
                        }
                    },
                )
                Spacer(Modifier.height(12.dp))
            }

            Spacer(Modifier.height(32.dp))
            Footer(lang)
            Spacer(Modifier.height(28.dp))
        }
    }
}

/* Contact, at the very bottom, mirroring the web footer. */
@Composable
private fun Footer(lang: Lang) {
    val colors = GgTheme.colors
    val context = LocalContext.current

    HorizontalDivider(color = colors.border)
    Spacer(Modifier.height(24.dp))

    Text(
        text = lang.l("Contact", "సంప్రదించండి"),
        color = colors.textPrimary,
        fontSize = 18.sp,
        fontWeight = FontWeight.ExtraBold,
        modifier = Modifier.asHeading(),
    )
    Spacer(Modifier.height(4.dp))
    Text(
        text = lang.l(
            "Questions about an order, or want to sell with us? Reach us here.",
            "ఆర్డర్ గురించి సందేహమా, లేదా మాతో అమ్మాలనుకుంటున్నారా? ఇక్కడ సంప్రదించండి.",
        ),
        color = colors.textSecondary,
        fontSize = 13.5.sp,
        lineHeight = 20.sp,
    )
    Spacer(Modifier.height(14.dp))

    ContactRow(
        icon = Icons.Filled.Email,
        label = Contact.EMAIL,
        description = lang.l("Email Go Grameen", "గో గ్రామీణ్‌కు ఇమెయిల్ చేయండి"),
        onClick = { context.emailGoGrameen(lang) },
    )
    Spacer(Modifier.height(10.dp))
    ContactRow(
        icon = Icons.Filled.Phone,
        label = Contact.PHONE_DISPLAY,
        description = lang.l("Call Go Grameen", "గో గ్రామీణ్‌కు కాల్ చేయండి"),
        onClick = { context.dialGoGrameen(lang) },
    )

    Spacer(Modifier.height(22.dp))
    Text(
        text = "Go Grameen · Your Family Farmer",
        color = colors.textSecondary,
        fontSize = 11.sp,
        modifier = Modifier.fillMaxWidth(),
        textAlign = TextAlign.Center,
    )
}

/* Wordmark on the left; language and account on the right — the same two
 * controls, in the same order, as the header on every other screen. */
@Composable
private fun Header(
    lang: Lang,
    onToggleLang: () -> Unit,
    accountName: String?,
    onAccount: () -> Unit,
) {
    val colors = GgTheme.colors
    Row(verticalAlignment = Alignment.CenterVertically) {
        /* Stands in for SproutMark until the real vector is ported. The green
           gradient carries the brand on either background, so it is one of the
           few things that does not change with the theme. */
        Box(
            modifier = Modifier
                .size(36.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(Brush.linearGradient(listOf(GgGreen500, GgGreen700)))
                .decorative(),
            contentAlignment = Alignment.Center,
        ) {
            Text("🌱", fontSize = 18.sp)
        }
        Spacer(Modifier.width(10.dp))
        Text(
            text = "Go Grameen",
            color = colors.textPrimary,
            fontSize = 17.sp,
            fontWeight = FontWeight.ExtraBold,
            maxLines = 1,
            modifier = Modifier.weight(1f),
        )
        LanguageToggle(lang = lang, onToggle = onToggleLang)
        AccountButton(name = accountName, lang = lang, onClick = onAccount)
    }
}

@Composable
private fun Badge(label: String) {
    val colors = GgTheme.colors
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(999.dp))
            .background(colors.badgeBg)
            .border(1.dp, colors.badgeBorder, RoundedCornerShape(999.dp))
            .padding(horizontal = 12.dp, vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier
                .size(6.dp)
                .clip(CircleShape)
                .background(colors.accent)
        )
        Spacer(Modifier.width(8.dp))
        Text(
            text = label,
            color = colors.badgeText,
            fontSize = 11.5.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 0.6.sp,
        )
    }
}

/* The same headline the web app leads with on /consumer: the title, then the
 * promise under it in the accent. One heading for TalkBack, read as a sentence,
 * rather than two fragments. */
@Composable
private fun Headline(lang: Lang) {
    val colors = GgTheme.colors
    Column(modifier = Modifier.semantics(mergeDescendants = true) { heading() }) {
        Text(
            text = lang.l("Fresh from your local farmers", "మీ స్థానిక రైతుల నుండి తాజా ఆహారం"),
            color = colors.textPrimary,
            fontSize = 36.sp,
            lineHeight = 42.sp,
            fontWeight = FontWeight.Bold,
        )
        Spacer(Modifier.height(6.dp))
        Text(
            text = lang.l("Straight from the farm. No Middlemen", "నేరుగా పొలం నుండి. మధ్యవర్తులు లేరు"),
            color = colors.accent,
            fontSize = 18.sp,
            lineHeight = 24.sp,
            fontWeight = FontWeight.Bold,
        )
    }
}

@Composable
private fun RoleCard(role: Door, lang: Lang, onClick: () -> Unit) {
    val colors = GgTheme.colors
    val ready = role.notYet == null
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .border(1.dp, colors.border, RoundedCornerShape(18.dp))
            .background(colors.surface)
            .clickable(onClick = onClick, role = Role.Button)
            .padding(16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(48.dp)
                .clip(RoundedCornerShape(14.dp))
                .background(colors.iconTileBg)
                .decorative(),
            contentAlignment = Alignment.Center,
        ) {
            Text(role.emoji, fontSize = 22.sp)
        }
        Spacer(Modifier.width(14.dp))
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(3.dp),
        ) {
            Text(
                text = lang.l(role.title.first, role.title.second),
                color = colors.textPrimary,
                fontSize = 16.sp,
                fontWeight = FontWeight.ExtraBold,
            )
            Text(
                text = lang.l(role.blurb.first, role.blurb.second),
                color = colors.textSecondary,
                fontSize = 13.5.sp,
                lineHeight = 19.sp,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Spacer(Modifier.width(10.dp))
        if (ready) {
            Icon(
                imageVector = Icons.AutoMirrored.Filled.ArrowForward,
                contentDescription = null,
                tint = colors.accent,
                modifier = Modifier.size(20.dp),
            )
        } else {
            /* Said up front, so the card is not a tap-to-find-out. Read by
               TalkBack too: "I'm a Farmer … Soon". */
            Text(
                text = lang.l("Soon", "త్వరలో"),
                color = colors.badgeText,
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier
                    .clip(RoundedCornerShape(999.dp))
                    .background(colors.badgeBg)
                    .border(1.dp, colors.badgeBorder, RoundedCornerShape(999.dp))
                    .padding(horizontal = 9.dp, vertical = 4.dp),
            )
        }
    }
}

/* The previews drive their own language and theme so the toggle works inside
 * Studio's interactive preview, where there is no MainActivity holding it. */
@Composable
private fun PreviewHome(dark: Boolean) {
    var lang by remember { mutableStateOf(DEFAULT_LANG) }
    GoGrameenTheme(dark = dark) {
        HomeScreen(
            lang = lang,
            onToggleLang = { lang = if (lang == Lang.EN) Lang.TE else Lang.EN },
            onBrowse = {},
        )
    }
}

@Preview(name = "Light", showBackground = true)
@Composable
private fun HomeScreenLightPreview() = PreviewHome(dark = false)

@Preview(name = "Dark", showBackground = true, backgroundColor = 0xFF04140B)
@Composable
private fun HomeScreenDarkPreview() = PreviewHome(dark = true)
