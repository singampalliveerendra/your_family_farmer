package com.gogrameen.app.account

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ExitToApp
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.gogrameen.app.Lang
import com.gogrameen.app.l
import com.gogrameen.app.ui.Contact
import com.gogrameen.app.ui.ContactRow
import com.gogrameen.app.ui.GgTopBar
import com.gogrameen.app.ui.PrimaryButton
import com.gogrameen.app.ui.SecondaryButton
import com.gogrameen.app.ui.TouchTarget
import com.gogrameen.app.ui.decorative
import com.gogrameen.app.ui.dialGoGrameen
import com.gogrameen.app.ui.emailGoGrameen
import com.gogrameen.app.ui.asHeading
import com.gogrameen.app.ui.theme.GgTheme

/* Everything about "me" in one place: who is logged in, the two app settings,
 * and how to reach a person.
 *
 * Language and appearance used to be split — language a pill in every header,
 * appearance behind a gear that only Home had. Both now live here as well, as
 * plain labelled choices, so there is one place to look for "how do I change
 * this". The language pill stays in the headers too: it is the one setting
 * someone reaches for mid-screen, because they cannot read what is on it. */
@Composable
fun AccountScreen(
    session: Session,
    lang: Lang,
    dark: Boolean,
    onToggleLang: () -> Unit,
    onSetLang: (Lang) -> Unit,
    onSetDark: (Boolean) -> Unit,
    onBack: () -> Unit,
    onLogIn: () -> Unit,
    onSignUp: () -> Unit,
    onLogOut: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = GgTheme.colors
    val context = LocalContext.current
    var confirmLogout by rememberSaveable { mutableStateOf(false) }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(colors.background),
    ) {
        GgTopBar(
            lang = lang,
            onToggleLang = onToggleLang,
            onBack = onBack,
            title = lang.l("Account", "ఖాతా"),
        )

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState()),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Column(
                modifier = Modifier
                    .widthIn(max = 520.dp)
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp),
            ) {
                Spacer(Modifier.height(8.dp))

                when (session) {
                    is Session.SignedIn -> ProfileCard(session.consumer, lang)
                    else -> SignedOutCard(lang = lang, onLogIn = onLogIn, onSignUp = onSignUp)
                }

                Spacer(Modifier.height(28.dp))
                SectionTitle(lang.l("Language", "భాష"))
                Spacer(Modifier.height(10.dp))
                Choice(
                    options = listOf(Lang.EN to "English", Lang.TE to "తెలుగు"),
                    selected = lang,
                    onSelect = onSetLang,
                )

                Spacer(Modifier.height(24.dp))
                SectionTitle(lang.l("Appearance", "రూపం"))
                Spacer(Modifier.height(10.dp))
                Choice(
                    options = listOf(false to lang.l("Light", "లైట్"), true to lang.l("Dark", "డార్క్")),
                    selected = dark,
                    onSelect = onSetDark,
                )

                Spacer(Modifier.height(28.dp))
                SectionTitle(lang.l("Need help?", "సహాయం కావాలా?"))
                Spacer(Modifier.height(4.dp))
                Text(
                    text = lang.l(
                        "Questions about an order, or want to sell with us? We're a call away.",
                        "ఆర్డర్ గురించి సందేహమా, లేదా మాతో అమ్మాలనుకుంటున్నారా? ఒక్క కాల్ చాలు.",
                    ),
                    color = colors.textSecondary,
                    fontSize = 13.5.sp,
                    lineHeight = 20.sp,
                )
                Spacer(Modifier.height(12.dp))
                ContactRow(
                    icon = Icons.Filled.Phone,
                    label = formatPhone(Contact.PHONE_DISPLAY),
                    description = lang.l("Call Go Grameen", "గో గ్రామీణ్‌కు కాల్ చేయండి"),
                    onClick = { context.dialGoGrameen(lang) },
                )
                Spacer(Modifier.height(10.dp))
                ContactRow(
                    icon = Icons.Filled.Email,
                    label = Contact.EMAIL,
                    description = lang.l("Email Go Grameen", "గో గ్రామీణ్‌కు ఇమెయిల్ చేయండి"),
                    onClick = { context.emailGoGrameen(lang) },
                )

                if (session is Session.SignedIn) {
                    Spacer(Modifier.height(32.dp))
                    SecondaryButton(
                        label = lang.l("Log out", "లాగ్ అవుట్"),
                        onClick = { confirmLogout = true },
                        danger = true,
                        leadingIcon = Icons.AutoMirrored.Filled.ExitToApp,
                    )
                }

                Spacer(Modifier.height(36.dp))
            }
        }
    }

    /* Asked, because it is easy to hit by accident at the bottom of a scroll
       and undoing it means finding a password — which some people only have
       written down at home. */
    if (confirmLogout) {
        AlertDialog(
            onDismissRequest = { confirmLogout = false },
            title = { Text(lang.l("Log out?", "లాగ్ అవుట్ చేయాలా?"), fontWeight = FontWeight.Bold) },
            text = {
                Text(
                    lang.l(
                        "You'll need your phone number and password to log back in.",
                        "మళ్లీ లాగిన్ అవ్వడానికి మీ ఫోన్ నంబర్, పాస్‌వర్డ్ కావాలి.",
                    ),
                )
            },
            confirmButton = {
                TextButton(onClick = { confirmLogout = false; onLogOut() }) {
                    Text(lang.l("Log out", "లాగ్ అవుట్"), color = colors.danger, fontWeight = FontWeight.Bold)
                }
            },
            dismissButton = {
                TextButton(onClick = { confirmLogout = false }) {
                    Text(lang.l("Stay logged in", "లాగిన్‌లోనే ఉండండి"), color = colors.textPrimary)
                }
            },
            containerColor = colors.elevatedSurface,
            titleContentColor = colors.textPrimary,
            textContentColor = colors.textSecondary,
        )
    }
}

@Composable
private fun ProfileCard(consumer: Consumer, lang: Lang) {
    val colors = GgTheme.colors
    val name = consumer.name?.takeIf { it.isNotBlank() }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(20.dp))
            .border(1.dp, colors.border, RoundedCornerShape(20.dp))
            .background(colors.surface)
            .padding(18.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(58.dp)
                .clip(CircleShape)
                .background(colors.accentStrong)
                .decorative(),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = (name ?: "?").trim().first().uppercase(),
                color = colors.onAccent,
                fontSize = 24.sp,
                fontWeight = FontWeight.ExtraBold,
            )
        }
        Spacer(Modifier.width(16.dp))
        Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(
                text = lang.l("Logged in as", "లాగిన్ అయినవారు"),
                color = colors.textSecondary,
                fontSize = 12.5.sp,
            )
            Text(
                text = name ?: lang.l("Go Grameen buyer", "గో గ్రామీణ్ కొనుగోలుదారు"),
                color = colors.textPrimary,
                fontSize = 19.sp,
                fontWeight = FontWeight.ExtraBold,
            )
            consumer.phone?.takeIf { it.isNotBlank() }?.let { phone ->
                Text(
                    text = "+91 ${formatPhone(phone)}",
                    color = colors.textSecondary,
                    fontSize = 14.sp,
                )
            }
        }
    }
}

@Composable
private fun SignedOutCard(lang: Lang, onLogIn: () -> Unit, onSignUp: () -> Unit) {
    val colors = GgTheme.colors
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(20.dp))
            .border(1.dp, colors.border, RoundedCornerShape(20.dp))
            .background(colors.surface)
            .padding(20.dp),
    ) {
        Text(
            text = lang.l("You're not logged in", "మీరు లాగిన్ అవ్వలేదు"),
            color = colors.textPrimary,
            fontSize = 19.sp,
            fontWeight = FontWeight.ExtraBold,
            modifier = Modifier.asHeading(),
        )
        Spacer(Modifier.height(4.dp))
        Text(
            text = lang.l(
                "Log in with your phone number, or create an account — the same one works on gogrameen.in.",
                "మీ ఫోన్ నంబర్‌తో లాగిన్ అవ్వండి, లేదా ఖాతా సృష్టించండి — gogrameen.in లోనూ అదే పనిచేస్తుంది.",
            ),
            color = colors.textSecondary,
            fontSize = 14.sp,
            lineHeight = 20.sp,
        )
        Spacer(Modifier.height(16.dp))
        PrimaryButton(label = lang.l("Log in", "లాగిన్"), onClick = onLogIn)
        Spacer(Modifier.height(10.dp))
        SecondaryButton(label = lang.l("Create an account", "ఖాతా సృష్టించండి"), onClick = onSignUp)
    }
}

@Composable
private fun SectionTitle(label: String) {
    Text(
        text = label,
        color = GgTheme.colors.textPrimary,
        fontSize = 16.sp,
        fontWeight = FontWeight.ExtraBold,
        modifier = Modifier.asHeading(),
    )
}

/* Two options, one chosen — as a pill with the chosen half filled, the same
 * shape as the language toggle and the Log in / Sign up switch. Radio
 * semantics, so TalkBack says "Dark, selected" instead of just "Dark". */
@Composable
private fun <T> Choice(options: List<Pair<T, String>>, selected: T, onSelect: (T) -> Unit) {
    val colors = GgTheme.colors
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(999.dp))
            .border(1.dp, colors.border, RoundedCornerShape(999.dp))
            .background(colors.surface)
            .padding(4.dp)
            .selectableGroup(),
    ) {
        options.forEach { (value, label) ->
            val active = value == selected
            Box(
                modifier = Modifier
                    .weight(1f)
                    .heightIn(min = TouchTarget)
                    .clip(RoundedCornerShape(999.dp))
                    .background(if (active) colors.accentStrong else Color.Transparent)
                    .selectable(selected = active, role = Role.RadioButton, onClick = { onSelect(value) }),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = label,
                    color = if (active) colors.onAccent else colors.textSecondary,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Bold,
                )
            }
        }
    }
}
