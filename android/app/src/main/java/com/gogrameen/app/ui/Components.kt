package com.gogrameen.app.ui

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.error
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.gogrameen.app.Lang
import com.gogrameen.app.l
import com.gogrameen.app.ui.theme.GgTheme

/* The handful of controls every screen is built from.
 *
 * Each screen used to carry its own back button, its own filled button and its
 * own notice box. They had drifted — a 40dp back arrow on one screen, a 34dp
 * clear button on another — and every one of them was under the 48dp Android
 * sets as the smallest thing a thumb can reliably hit. That matters more than
 * usual here: the people this app is for are often older, often outdoors, and
 * often holding the phone in the hand that is also holding a bag.
 *
 * So the rule lives in one place. A control may LOOK smaller than 48dp — a
 * 40dp circle reads better in a header than a 48dp one — but its touch area
 * never is. */

/** Android's minimum touch target. Nothing tappable in this app is smaller. */
val TouchTarget = 48.dp

/* Marks a composable as a heading, so TalkBack users can jump heading to
 * heading instead of swiping through every line. */
fun Modifier.asHeading(): Modifier = semantics { heading() }

/* Hides decoration from TalkBack. An emoji tile is read aloud by name —
 * "shopping cart", "person farmer" — before the words it decorates, which is
 * noise read at the start of every card. */
fun Modifier.decorative(): Modifier = clearAndSetSemantics { }

/* A round icon button: 40dp to look at, 48dp to hit. */
@Composable
fun GgIconButton(
    icon: ImageVector,
    contentDescription: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    bordered: Boolean = false,
) {
    val colors = GgTheme.colors
    Box(
        modifier = modifier
            .size(TouchTarget)
            .clip(CircleShape)
            .clickable(onClick = onClick, role = Role.Button),
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier = Modifier
                .size(40.dp)
                .then(
                    if (bordered) {
                        Modifier
                            .clip(CircleShape)
                            .border(1.dp, colors.border, CircleShape)
                            .background(colors.surface)
                    } else {
                        Modifier
                    },
                ),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = icon,
                contentDescription = contentDescription,
                tint = colors.textPrimary,
                modifier = Modifier.size(21.dp),
            )
        }
    }
}

/* The way in to the account.
 *
 * Signed out it is an outline person, which every phone user already reads as
 * "me / log in". Signed in it becomes the first letter of their name on the
 * brand green — the same move every app they use makes, and it tells them at a
 * glance, on every screen, that they are logged in. */
@Composable
fun AccountButton(name: String?, lang: Lang, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val colors = GgTheme.colors
    val initial = name?.trim()?.firstOrNull()?.uppercase()
    val label = if (name.isNullOrBlank()) {
        lang.l("Log in or sign up", "లాగిన్ లేదా సైన్ అప్")
    } else {
        lang.l("Your account, $name", "మీ ఖాతా, $name")
    }

    Box(
        modifier = modifier
            .size(TouchTarget)
            .clip(CircleShape)
            .clickable(onClick = onClick, role = Role.Button)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        if (initial == null) {
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .clip(CircleShape)
                    .border(1.dp, colors.border, CircleShape)
                    .background(colors.surface),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = Icons.Filled.Person,
                    contentDescription = null,
                    tint = colors.textPrimary,
                    modifier = Modifier.size(21.dp),
                )
            }
        } else {
            Box(
                modifier = Modifier
                    .size(38.dp)
                    .clip(CircleShape)
                    .background(colors.accentStrong),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = initial,
                    color = colors.onAccent,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.ExtraBold,
                    // The button already says whose account; "R" on its own is noise.
                    modifier = Modifier.decorative(),
                )
            }
        }
    }
}

/* The strip at the top of every screen but Home.
 *
 * Back on the left, the screen's name next to it, language and account on the
 * right — in that order everywhere, so nobody hunts for the language switch
 * after moving between screens. `account` is a slot rather than a flag so the
 * login screen can leave it out: an account button on the page you are already
 * logging in on is a loop. */
@Composable
fun GgTopBar(
    lang: Lang,
    onToggleLang: () -> Unit,
    modifier: Modifier = Modifier,
    title: String? = null,
    onBack: (() -> Unit)? = null,
    account: (@Composable () -> Unit)? = null,
) {
    val colors = GgTheme.colors
    Row(
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = 60.dp)
            .padding(start = 4.dp, end = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (onBack != null) {
            GgIconButton(
                icon = Icons.AutoMirrored.Filled.ArrowBack,
                contentDescription = lang.l("Back", "వెనుకకు"),
                onClick = onBack,
            )
        } else {
            Spacer(Modifier.width(12.dp))
        }

        Text(
            text = title.orEmpty(),
            color = colors.textPrimary,
            fontSize = 19.sp,
            fontWeight = FontWeight.ExtraBold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier
                .weight(1f)
                .padding(start = 2.dp, end = 8.dp)
                .then(if (title != null) Modifier.asHeading() else Modifier),
        )

        LanguageToggle(lang = lang, onToggle = onToggleLang)
        if (account != null) {
            Spacer(Modifier.width(2.dp))
            account()
        }
    }
}

/* The one filled button. There is at most one per screen, and it is always the
 * thing the screen is for — so it is full width, tall, and cannot be missed.
 *
 * `loading` keeps the button's size and label while a spinner runs beside it,
 * and ignores taps. A button that shrinks to a spinner makes the layout jump,
 * and one that still accepts taps is how a slow login gets submitted three
 * times. */
@Composable
fun PrimaryButton(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    loading: Boolean = false,
    enabled: Boolean = true,
    leadingIcon: ImageVector? = null,
) {
    val colors = GgTheme.colors
    val active = enabled && !loading
    Row(
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = 54.dp)
            .clip(RoundedCornerShape(16.dp))
            .background(colors.accentStrong.copy(alpha = if (enabled) 1f else 0.45f))
            .clickable(enabled = active, onClick = onClick, role = Role.Button)
            .padding(horizontal = 20.dp, vertical = 14.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (loading) {
            CircularProgressIndicator(
                color = colors.onAccent,
                strokeWidth = 2.5.dp,
                modifier = Modifier
                    .size(18.dp)
                    .decorative(),
            )
            Spacer(Modifier.width(10.dp))
        } else if (leadingIcon != null) {
            Icon(
                imageVector = leadingIcon,
                contentDescription = null,
                tint = colors.onAccent,
                modifier = Modifier.size(19.dp),
            )
            Spacer(Modifier.width(9.dp))
        }
        Text(
            text = label,
            color = colors.onAccent,
            fontSize = 15.sp,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center,
        )
    }
}

/* The quieter partner to PrimaryButton: bordered, same height, so a pair of
 * them stack into one column without either looking like an afterthought.
 * `danger` is for Log out and nothing else. */
@Composable
fun SecondaryButton(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    danger: Boolean = false,
    leadingIcon: ImageVector? = null,
) {
    val colors = GgTheme.colors
    val ink = if (danger) colors.danger else colors.textPrimary
    Row(
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = 54.dp)
            .clip(RoundedCornerShape(16.dp))
            .border(1.dp, if (danger) colors.dangerBorder else colors.border, RoundedCornerShape(16.dp))
            .background(colors.surface)
            .clickable(onClick = onClick, role = Role.Button)
            .padding(horizontal = 20.dp, vertical = 14.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (leadingIcon != null) {
            Icon(imageVector = leadingIcon, contentDescription = null, tint = ink, modifier = Modifier.size(19.dp))
            Spacer(Modifier.width(9.dp))
        }
        Text(text = label, color = ink, fontSize = 15.sp, fontWeight = FontWeight.Bold)
    }
}

/* A link-weight action — "Create an account", "Forgot password?". Text-sized
 * to look at, 48dp tall to hit. */
@Composable
fun TextAction(label: String, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val colors = GgTheme.colors
    Box(
        modifier = modifier
            .heightIn(min = TouchTarget)
            .clip(RoundedCornerShape(10.dp))
            .clickable(onClick = onClick, role = Role.Button)
            .padding(horizontal = 8.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, color = colors.accent, fontSize = 14.sp, fontWeight = FontWeight.Bold)
    }
}

enum class NoticeTone { Info, Danger }

/* A boxed sentence: something the person should read before carrying on.
 *
 * Danger notices are a live region, so TalkBack reads them out the moment they
 * appear. Without that, a blind user taps Log in, hears nothing, and has no way
 * of knowing the password was wrong short of exploring the whole screen. */
@Composable
fun Notice(
    text: String,
    modifier: Modifier = Modifier,
    tone: NoticeTone = NoticeTone.Info,
    title: String? = null,
) {
    val colors = GgTheme.colors
    val danger = tone == NoticeTone.Danger
    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(if (danger) colors.dangerBg else colors.surface)
            .border(1.dp, if (danger) colors.dangerBorder else colors.border, RoundedCornerShape(14.dp))
            .padding(horizontal = 15.dp, vertical = 13.dp)
            .semantics(mergeDescendants = true) {
                if (danger) liveRegion = LiveRegionMode.Polite
            },
    ) {
        if (title != null) {
            Text(
                text = title,
                color = if (danger) colors.danger else colors.textPrimary,
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold,
            )
            Spacer(Modifier.height(3.dp))
        }
        Text(
            text = text,
            color = if (danger) colors.danger else colors.textSecondary,
            fontSize = 13.5.sp,
            lineHeight = 20.sp,
        )
    }
}

/* A labelled input.
 *
 * The label sits ABOVE the box and stays there, rather than Material's label
 * that starts inside the box and floats up on focus. A floating label is the
 * only hint of what a field is for, and it is gone the moment someone starts
 * typing — which is exactly when a person unsure of the form looks for it.
 *
 * The error replaces the helper line under the box instead of appearing
 * somewhere else on the screen, so it is read next to the thing it is about. */
@Composable
fun GgTextField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    error: String? = null,
    helper: String? = null,
    prefix: String? = null,
    placeholder: String? = null,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default,
    keyboardActions: KeyboardActions = KeyboardActions.Default,
    visualTransformation: VisualTransformation = VisualTransformation.None,
    enabled: Boolean = true,
    trailing: (@Composable () -> Unit)? = null,
) {
    val colors = GgTheme.colors
    var focused by remember { mutableStateOf(false) }
    val borderColor = when {
        error != null -> colors.danger
        focused -> colors.accent
        else -> colors.border
    }

    Column(modifier = modifier.fillMaxWidth()) {
        Text(
            text = label,
            color = colors.textPrimary,
            fontSize = 13.5.sp,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.decorative(),
        )
        Spacer(Modifier.height(7.dp))

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 54.dp)
                .clip(RoundedCornerShape(14.dp))
                .border(if (focused || error != null) 1.5.dp else 1.dp, borderColor, RoundedCornerShape(14.dp))
                .background(colors.surface)
                .padding(start = 14.dp, end = if (trailing != null) 4.dp else 14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (prefix != null) {
                Text(
                    text = prefix,
                    color = colors.textSecondary,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.decorative(),
                )
                Box(
                    Modifier
                        .padding(horizontal = 11.dp)
                        .width(1.dp)
                        .height(22.dp)
                        .background(colors.border),
                )
            }

            Box(modifier = Modifier.weight(1f), contentAlignment = Alignment.CenterStart) {
                if (value.isEmpty() && placeholder != null) {
                    Text(
                        text = placeholder,
                        color = colors.textSecondary.copy(alpha = 0.7f),
                        fontSize = 16.sp,
                        modifier = Modifier.decorative(),
                    )
                }
                BasicTextField(
                    value = value,
                    onValueChange = onValueChange,
                    enabled = enabled,
                    singleLine = true,
                    textStyle = LocalTextStyle.current.copy(color = colors.textPrimary, fontSize = 16.sp),
                    cursorBrush = SolidColor(colors.accent),
                    keyboardOptions = keyboardOptions,
                    keyboardActions = keyboardActions,
                    visualTransformation = visualTransformation,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 15.dp)
                        .onFocusChanged { focused = it.isFocused }
                        /* The visible label is a sibling Text, so the field is
                           named here — and carries its error, which TalkBack
                           reads as "error: …" after the value. */
                        .semantics {
                            contentDescription = label
                            if (error != null) error(error)
                        },
                )
            }

            if (trailing != null) trailing()
        }

        val below = error ?: helper
        if (below != null) {
            Spacer(Modifier.height(6.dp))
            Text(
                text = below,
                color = if (error != null) colors.danger else colors.textSecondary,
                fontSize = 12.5.sp,
                lineHeight = 17.sp,
                fontWeight = if (error != null) FontWeight.SemiBold else FontWeight.Normal,
                /* The error is already on the field's own semantics, so it is
                   hidden here to avoid being read twice. The helper is not, so
                   it stays readable. */
                modifier = if (error != null) Modifier.decorative() else Modifier,
            )
        }
    }
}

/* Loading, empty and error states, centred in what is left below the header.
 *
 * Scrollable even though the content is short: pull-to-refresh only works on a
 * child that scrolls, and the two states that most need a refresh — "nothing
 * listed today" and "could not connect" — were the two where pulling did
 * nothing. */
@Composable
fun CentredState(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Box(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState()),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.padding(horizontal = 36.dp, vertical = 64.dp),
        ) { content() }
    }
}

/* A grey block standing in for content that is on its way.
 *
 * A gentle pulse rather than a shimmer sweep: it says "loading" just as well,
 * and animating one alpha costs almost nothing on the low-end phones this app
 * runs on, where a moving gradient across twelve cards does not. */
@Composable
fun Skeleton(modifier: Modifier = Modifier, shape: RoundedCornerShape = RoundedCornerShape(8.dp)) {
    val pulse = rememberInfiniteTransition(label = "skeleton")
    val alpha by pulse.animateFloat(
        initialValue = 1f,
        targetValue = 0.55f,
        animationSpec = infiniteRepeatable(tween(durationMillis = 850), RepeatMode.Reverse),
        label = "skeleton-alpha",
    )
    Box(
        modifier = modifier
            .alpha(alpha)
            .clip(shape)
            .background(GgTheme.colors.skeleton),
    )
}
