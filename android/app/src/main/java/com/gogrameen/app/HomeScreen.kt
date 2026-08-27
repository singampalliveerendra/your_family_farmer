package com.gogrameen.app

import android.content.Intent
import android.net.Uri
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.gogrameen.app.ui.theme.GgGreen500
import com.gogrameen.app.ui.theme.GgGreen700
import com.gogrameen.app.ui.theme.GgTheme
import com.gogrameen.app.ui.theme.GoGrameenTheme

/* The native /home.
 *
 * A port of src/components/home/HomeLanding.tsx and RoleSelect.tsx, cut down to
 * what a first screen needs: the wordmark, the two toggles, the hero and the
 * three role cards. Everything below the fold on the web page — features,
 * how-it-works, about, contact — is marketing aimed at a visitor who found the
 * site. Someone holding the app has already installed it.
 *
 * No network yet, on purpose. The catalogue photo cluster is the first thing
 * that arrives once the API call lands.
 *
 * Every colour comes from GgTheme.colors so the dark toggle repaints the whole
 * screen; naming a raw brand colour here would leave that element stuck in one
 * theme. The web page's motion — rising cards, floating photos, drifting blobs,
 * the gradient sheen on the headline — is deliberately absent: it is decoration
 * on a page that has to sell, and here it would only cost frames on the low-end
 * phones this app is for. */

/* Kept identical to the web footer in src/components/home/HomeLanding.tsx —
 * the displayed number is local, the dialled one carries the country code. */
private const val EMAIL = "GovuGrameenam@gmail.com"
private const val PHONE_DISPLAY = "9603174271"
private const val PHONE_DIAL = "+919603174271"

private data class Role(
    val emoji: String,
    val title: Pair<String, String>,
    val blurb: Pair<String, String>,
)

/* Copy lifted verbatim from RoleSelect.tsx, in its order. Moderator and rider
 * are absent there and absent here: staff and recruited riders reach their own
 * logins directly, and neither belongs on the front door. */
private val ROLES = listOf(
    Role(
        emoji = "🛒",
        title = "I'm a Buyer" to "నేను కొనుగోలుదారుని",
        blurb = "Browse today's harvests and order direct." to "నేటి కోతలు చూసి నేరుగా ఆర్డర్ చేయండి.",
    ),
    Role(
        emoji = "🧑‍🌾",
        title = "I'm a Farmer" to "నేను రైతుని",
        blurb = "List your harvest. Keep the whole price." to "మీ కోత నమోదు చేయండి. పూర్తి ధర మీదే.",
    ),
    Role(
        emoji = "📦",
        title = "I'm an Aggregator" to "నేను అగ్రిగేటర్‌ని",
        blurb = "Sell for many farmers — each one named." to "రైతుల తరఫున అమ్మండి — ప్రతి పేరు కనిపిస్తుంది.",
    ),
)

@Composable
fun HomeScreen(
    dark: Boolean,
    onToggleDark: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var lang by rememberSaveable { mutableStateOf(Lang.EN) }
    val colors = GgTheme.colors
    val context = LocalContext.current

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(colors.background)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp),
    ) {
        Spacer(Modifier.height(12.dp))
        Header(
            lang = lang,
            onToggleLang = { lang = if (lang == Lang.EN) Lang.TE else Lang.EN },
            dark = dark,
            onToggleDark = onToggleDark,
        )

        Spacer(Modifier.height(32.dp))
        Badge(lang.l("Farm direct · Harvested today", "నేరుగా పొలం నుండి · నేడే కోత"))

        Spacer(Modifier.height(20.dp))
        Headline(lang)

        Spacer(Modifier.height(20.dp))
        Text(
            text = lang.l(
                "Go Grameen connects farmers directly to consumers. Harvested today, priced by the farmer, delivered to you.",
                "గో గ్రామీణ్ రైతులను నేరుగా వినియోగదారులతో కలుపుతుంది. నేడే కోత, ధర రైతుదే, నేరుగా మీ ఇంటికి.",
            ),
            color = colors.textSecondary,
            fontSize = 16.sp,
            lineHeight = 26.sp,
        )

        Spacer(Modifier.height(28.dp))
        OutlineButton(
            label = lang.l("Browse today's harvest", "నేటి కోతలు చూడండి"),
            onClick = { context.toast("Buyer flow — coming next") },
        )

        Spacer(Modifier.height(40.dp))
        Text(
            text = lang.l("Who are you?", "మీరు ఎవరు?"),
            color = colors.textPrimary,
            fontSize = 22.sp,
            fontWeight = FontWeight.ExtraBold,
        )

        Spacer(Modifier.height(14.dp))
        ROLES.forEach { role ->
            RoleCard(
                role = role,
                lang = lang,
                onClick = { context.toast("${role.title.first} — coming next") },
            )
            Spacer(Modifier.height(12.dp))
        }

        Spacer(Modifier.height(36.dp))
        Footer(lang)
        Spacer(Modifier.height(28.dp))
    }
}

/* Contact, at the very bottom, mirroring the web footer.
 *
 * Both rows are real intents rather than selectable text: on a phone the
 * number has to be one tap to dial and the address one tap to compose, which
 * is the whole point of putting them here. The dialer is opened with ACTION_DIAL
 * and not ACTION_CALL — dialling for someone without showing them the number
 * first needs a runtime permission and startles people. */
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
    )
    Spacer(Modifier.height(4.dp))
    Text(
        text = lang.l(
            "Questions about an order, or want to sell with us? Reach us here.",
            "ఆర్డర్ గురించి సందేహమా, లేదా మాతో అమ్మాలనుకుంటున్నారా? ఇక్కడ సంప్రదించండి.",
        ),
        color = colors.textSecondary,
        fontSize = 13.sp,
        lineHeight = 19.sp,
    )
    Spacer(Modifier.height(14.dp))

    ContactRow(
        icon = Icons.Filled.Email,
        label = EMAIL,
        onClick = {
            context.openOrToast(
                Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:$EMAIL")),
                lang.l("No email app found", "ఇమెయిల్ యాప్ లేదు"),
            )
        },
    )
    Spacer(Modifier.height(10.dp))
    ContactRow(
        icon = Icons.Filled.Phone,
        label = PHONE_DISPLAY,
        onClick = {
            context.openOrToast(
                Intent(Intent.ACTION_DIAL, Uri.parse("tel:$PHONE_DIAL")),
                lang.l("No dialer found", "డయలర్ లేదు"),
            )
        },
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

@Composable
private fun ContactRow(icon: ImageVector, label: String, onClick: () -> Unit) {
    val colors = GgTheme.colors
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(999.dp))
            .border(1.dp, colors.border, RoundedCornerShape(999.dp))
            .background(colors.surface)
            .clickable(onClick = onClick)
            .padding(horizontal = 18.dp, vertical = 13.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = colors.accent,
            modifier = Modifier.size(18.dp),
        )
        Spacer(Modifier.width(12.dp))
        Text(
            text = label,
            color = colors.textPrimary,
            fontSize = 13.5.sp,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

private fun android.content.Context.openOrToast(intent: Intent, failure: String) {
    try {
        startActivity(intent)
    } catch (e: android.content.ActivityNotFoundException) {
        toast(failure)
    }
}

@Composable
private fun Header(
    lang: Lang,
    onToggleLang: () -> Unit,
    dark: Boolean,
    onToggleDark: () -> Unit,
) {
    val colors = GgTheme.colors
    Row(verticalAlignment = Alignment.CenterVertically) {
        /* Stands in for SproutMark until the real vector is ported. The green
           gradient carries the brand on either background, so it is one of the
           few things that does not change with the theme. */
        Box(
            modifier = Modifier
                .size(36.dp)
                .clip(RoundedCornerShape(14.dp))
                .background(Brush.linearGradient(listOf(GgGreen500, GgGreen700))),
            contentAlignment = Alignment.Center,
        ) {
            Text("🌱", fontSize = 18.sp)
        }
        Spacer(Modifier.width(10.dp))
        Text(
            text = "Go Grameen",
            color = colors.textPrimary,
            fontSize = 16.sp,
            fontWeight = FontWeight.Bold,
        )
        Spacer(Modifier.weight(1f))
        LanguageToggle(lang = lang, onToggle = onToggleLang)
        Spacer(Modifier.width(8.dp))
        SettingsButton(lang = lang, dark = dark, onToggleDark = onToggleDark)
    }
}

/* Appearance lives behind the gear rather than as a bare moon in the header.
 * Two reasons: the header at 390dp was already carrying a wordmark and a
 * language pill, and a menu says which mode you are in — a lone icon only
 * hints at it. It is also where the next preference will go, so the control
 * does not have to move again. */
@Composable
private fun SettingsButton(lang: Lang, dark: Boolean, onToggleDark: () -> Unit) {
    val colors = GgTheme.colors
    var open by remember { mutableStateOf(false) }

    Box {
        Box(
            modifier = Modifier
                .size(34.dp)
                .clip(CircleShape)
                .border(1.dp, colors.border, CircleShape)
                .background(colors.surface)
                .clickable { open = true },
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = Icons.Filled.Settings,
                contentDescription = "Settings",
                tint = colors.textPrimary,
                modifier = Modifier.size(17.dp),
            )
        }

        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            Text(
                text = lang.l("Appearance", "రూపం"),
                color = colors.textSecondary,
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 0.8.sp,
                modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 10.dp, bottom = 4.dp),
            )
            ThemeChoice(
                label = lang.l("Light", "లైట్"),
                selected = !dark,
            ) { if (dark) onToggleDark(); open = false }
            ThemeChoice(
                label = lang.l("Dark", "డార్క్"),
                selected = dark,
            ) { if (!dark) onToggleDark(); open = false }
        }
    }
}

@Composable
private fun ThemeChoice(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
) {
    val colors = GgTheme.colors
    DropdownMenuItem(
        onClick = onClick,
        text = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = label,
                    color = colors.textPrimary,
                    fontSize = 14.sp,
                    fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal,
                )
                Spacer(Modifier.width(20.dp))
                /* The tick is the only state marker, so it holds its width even
                   when absent — otherwise the two rows shift as you switch. */
                Text(
                    text = if (selected) "\u2713" else " ",
                    color = colors.accent,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold,
                )
            }
        },
    )
}

/* One pill, two halves, the active one filled. The web toggle is two separate
 * buttons; a single tap target is easier to hit one-handed and there are only
 * ever two states to move between. */
@Composable
private fun LanguageToggle(lang: Lang, onToggle: () -> Unit) {
    val colors = GgTheme.colors
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(999.dp))
            .border(1.dp, colors.border, RoundedCornerShape(999.dp))
            .background(colors.surface)
            .clickable(onClick = onToggle)
            .padding(4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        LanguageChip("EN", active = lang == Lang.EN)
        LanguageChip("తె", active = lang == Lang.TE)
    }
}

@Composable
private fun LanguageChip(label: String, active: Boolean) {
    val colors = GgTheme.colors
    Text(
        text = label,
        color = if (active) colors.onAccent else colors.textSecondary,
        fontSize = 12.sp,
        fontWeight = FontWeight.Bold,
        modifier = Modifier
            .clip(RoundedCornerShape(999.dp))
            .background(if (active) colors.accentStrong else Color.Transparent)
            .padding(horizontal = 12.dp, vertical = 6.dp),
    )
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
            fontSize = 11.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 0.8.sp,
        )
    }
}

/* Three lines, the third in the accent. On the web the third line carries an
 * animated gradient sheen; a flat fill reads the same at a glance. */
@Composable
private fun Headline(lang: Lang) {
    val colors = GgTheme.colors
    Column {
        Text(
            text = lang.l("Real food.", "నిజమైన ఆహారం."),
            color = colors.textPrimary,
            fontSize = 38.sp,
            lineHeight = 44.sp,
            fontWeight = FontWeight.Bold,
        )
        Text(
            text = lang.l("Real farmers.", "నిజమైన రైతులు."),
            color = colors.textPrimary,
            fontSize = 38.sp,
            lineHeight = 44.sp,
            fontWeight = FontWeight.Bold,
        )
        Text(
            text = lang.l("No middlemen.", "మధ్యవర్తులు లేరు."),
            color = colors.accent,
            fontSize = 38.sp,
            lineHeight = 44.sp,
            fontWeight = FontWeight.Bold,
        )
    }
}

@Composable
private fun OutlineButton(label: String, onClick: () -> Unit) {
    val colors = GgTheme.colors
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .border(1.dp, colors.border, RoundedCornerShape(16.dp))
            .background(colors.surface)
            .clickable(onClick = onClick)
            .padding(vertical = 16.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, color = colors.textPrimary, fontSize = 14.sp, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun RoleCard(role: Role, lang: Lang, onClick: () -> Unit) {
    val colors = GgTheme.colors
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .border(1.dp, colors.border, RoundedCornerShape(18.dp))
            .background(colors.surface)
            .clickable(onClick = onClick)
            .padding(16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(48.dp)
                .clip(RoundedCornerShape(14.dp))
                .background(colors.iconTileBg),
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
                fontSize = 13.sp,
                lineHeight = 18.sp,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Spacer(Modifier.width(10.dp))
        Text("→", color = colors.accent, fontSize = 18.sp)
    }
}

private fun android.content.Context.toast(message: String) =
    Toast.makeText(this, message, Toast.LENGTH_SHORT).show()

@Preview(name = "Light", showBackground = true)
@Composable
private fun HomeScreenLightPreview() {
    var dark by remember { mutableStateOf(false) }
    GoGrameenTheme(dark = dark) { HomeScreen(dark = dark, onToggleDark = { dark = !dark }) }
}

@Preview(name = "Dark", showBackground = true, backgroundColor = 0xFF04140B)
@Composable
private fun HomeScreenDarkPreview() {
    var dark by remember { mutableStateOf(true) }
    GoGrameenTheme(dark = dark) { HomeScreen(dark = dark, onToggleDark = { dark = !dark }) }
}
