package com.gogrameen.app.account

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
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
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.gogrameen.app.Lang
import com.gogrameen.app.l
import com.gogrameen.app.ui.Contact
import com.gogrameen.app.ui.GgTextField
import com.gogrameen.app.ui.GgTopBar
import com.gogrameen.app.ui.Notice
import com.gogrameen.app.ui.NoticeTone
import com.gogrameen.app.ui.PrimaryButton
import com.gogrameen.app.ui.TextAction
import com.gogrameen.app.ui.TouchTarget
import com.gogrameen.app.ui.decorative
import com.gogrameen.app.ui.dialGoGrameen
import com.gogrameen.app.ui.asHeading
import com.gogrameen.app.ui.theme.GgGreen500
import com.gogrameen.app.ui.theme.GgGreen700
import com.gogrameen.app.ui.theme.GgTheme

/* Log in and sign up, on one screen with a switch between them.
 *
 * One screen rather than two because the person often does not know which one
 * they need — "did I make an account last time?" — and the server can tell
 * them: a login with an unknown number moves them to Sign up with the number
 * already in, and a sign-up with a known one moves them back. Two separate
 * screens would turn each of those into a dead end.
 *
 * Phone and password only. OTP login exists on the server but is half-built
 * until the WhatsApp migration lands, so it is not offered here at all. */
@Composable
fun LoginScreen(
    form: AuthForm,
    lang: Lang,
    onToggleLang: () -> Unit,
    onBack: () -> Unit,
    onModeChange: (AuthMode) -> Unit,
    onName: (String) -> Unit,
    onPhone: (String) -> Unit,
    onPassword: (String) -> Unit,
    onTogglePassword: () -> Unit,
    onSubmit: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = GgTheme.colors
    val focus = LocalFocusManager.current
    val context = LocalContext.current
    val signUp = form.mode == AuthMode.SignUp
    val errors = form.fieldErrors(lang)

    val submit = {
        focus.clearFocus()
        onSubmit()
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(colors.background),
    ) {
        GgTopBar(lang = lang, onToggleLang = onToggleLang, onBack = onBack)

        Column(
            modifier = Modifier
                .fillMaxSize()
                .imePadding()
                .verticalScroll(rememberScrollState()),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            /* Capped width, centred: on a tablet or a phone on its side, a form
               stretched edge to edge is a line of text too long to follow. */
            Column(
                modifier = Modifier
                    .widthIn(max = 480.dp)
                    .fillMaxWidth()
                    .padding(horizontal = 22.dp),
            ) {
                Spacer(Modifier.height(4.dp))
                BrandTile()
                Spacer(Modifier.height(18.dp))

                Text(
                    text = if (signUp) {
                        lang.l("Create your account", "మీ ఖాతా సృష్టించండి")
                    } else {
                        lang.l("Welcome back", "మళ్లీ స్వాగతం")
                    },
                    color = colors.textPrimary,
                    fontSize = 28.sp,
                    lineHeight = 34.sp,
                    fontWeight = FontWeight.ExtraBold,
                    modifier = Modifier.asHeading(),
                )
                Spacer(Modifier.height(6.dp))
                Text(
                    text = if (signUp) {
                        lang.l(
                            "One account for the app and gogrameen.in. It takes a minute.",
                            "యాప్‌కు, gogrameen.in కు ఒకే ఖాతా. ఒక్క నిమిషం చాలు.",
                        )
                    } else {
                        lang.l(
                            "Log in with the phone number and password you use on gogrameen.in.",
                            "gogrameen.in లో వాడే ఫోన్ నంబర్, పాస్‌వర్డ్‌తో లాగిన్ అవ్వండి.",
                        )
                    },
                    color = colors.textSecondary,
                    fontSize = 15.sp,
                    lineHeight = 22.sp,
                )

                Spacer(Modifier.height(22.dp))
                ModeSwitch(mode = form.mode, lang = lang, enabled = !form.submitting, onChange = onModeChange)

                /* The server's answer, above the fields: the first thing read
                   after the tap, and — as a live region — spoken aloud. */
                val hint = form.hint
                val failure = form.failure
                if (hint != null || failure != null) {
                    Spacer(Modifier.height(18.dp))
                    when {
                        failure != null -> Notice(
                            text = failure.message(lang),
                            tone = NoticeTone.Danger,
                        )
                        hint == AuthHint.NoAccountYet -> Notice(
                            title = lang.l("New number", "కొత్త నంబర్"),
                            text = lang.l(
                                "There's no account for this number yet. Add your name and a password to create one.",
                                "ఈ నంబర్‌కు ఇంకా ఖాతా లేదు. మీ పేరు, పాస్‌వర్డ్ ఇచ్చి ఖాతా సృష్టించండి.",
                            ),
                        )
                        hint == AuthHint.AlreadyHasAccount -> Notice(
                            title = lang.l("You already have an account", "మీకు ఇప్పటికే ఖాతా ఉంది"),
                            text = lang.l(
                                "This number is already registered. Enter your password to log in.",
                                "ఈ నంబర్ ఇప్పటికే నమోదైంది. లాగిన్ అవ్వడానికి మీ పాస్‌వర్డ్ ఇవ్వండి.",
                            ),
                        )
                    }
                }

                Spacer(Modifier.height(20.dp))

                AnimatedVisibility(
                    visible = signUp,
                    enter = expandVertically() + fadeIn(),
                    exit = shrinkVertically() + fadeOut(),
                ) {
                    Column {
                        GgTextField(
                            value = form.name,
                            onValueChange = onName,
                            label = lang.l("Your name", "మీ పేరు"),
                            placeholder = lang.l("e.g. Lakshmi Devi", "ఉదా. లక్ష్మి దేవి"),
                            error = errors.name,
                            enabled = !form.submitting,
                            keyboardOptions = KeyboardOptions(
                                capitalization = KeyboardCapitalization.Words,
                                imeAction = ImeAction.Next,
                            ),
                        )
                        Spacer(Modifier.height(16.dp))
                    }
                }

                GgTextField(
                    value = form.phone,
                    onValueChange = onPhone,
                    label = lang.l("Phone number", "ఫోన్ నంబర్"),
                    prefix = "+91",
                    placeholder = "98765 43210",
                    error = errors.phone,
                    enabled = !form.submitting,
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Phone,
                        imeAction = ImeAction.Next,
                    ),
                )

                Spacer(Modifier.height(16.dp))

                GgTextField(
                    value = form.password,
                    onValueChange = onPassword,
                    label = lang.l("Password", "పాస్‌వర్డ్"),
                    error = errors.password,
                    helper = if (signUp) {
                        lang.l("At least $PASSWORD_MIN characters.", "కనీసం $PASSWORD_MIN అక్షరాలు.")
                    } else {
                        null
                    },
                    enabled = !form.submitting,
                    visualTransformation = if (form.passwordVisible) {
                        VisualTransformation.None
                    } else {
                        PasswordVisualTransformation()
                    },
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Password,
                        imeAction = ImeAction.Done,
                    ),
                    /* Done submits. Having to close the keyboard to find the
                       button under it is the single most common way a mobile
                       form feels broken. */
                    keyboardActions = KeyboardActions(onDone = { submit() }),
                    trailing = {
                        /* Words, not an eye icon: "Show" is understood by
                           everyone and translates, where the eye-with-a-slash
                           is a convention many first-time phone users have
                           never been taught. */
                        TextAction(
                            label = if (form.passwordVisible) lang.l("Hide", "దాచు") else lang.l("Show", "చూపు"),
                            onClick = onTogglePassword,
                        )
                    },
                )

                Spacer(Modifier.height(24.dp))

                PrimaryButton(
                    label = when {
                        form.submitting -> lang.l("Please wait…", "దయచేసి వేచి ఉండండి…")
                        signUp -> lang.l("Create account", "ఖాతా సృష్టించండి")
                        else -> lang.l("Log in", "లాగిన్")
                    },
                    onClick = submit,
                    loading = form.submitting,
                )

                Spacer(Modifier.height(10.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = if (signUp) {
                            lang.l("Already have an account?", "ఇప్పటికే ఖాతా ఉందా?")
                        } else {
                            lang.l("New here?", "కొత్తవారా?")
                        },
                        color = colors.textSecondary,
                        fontSize = 14.sp,
                    )
                    TextAction(
                        label = if (signUp) lang.l("Log in", "లాగిన్") else lang.l("Create an account", "ఖాతా సృష్టించండి"),
                        onClick = { onModeChange(if (signUp) AuthMode.LogIn else AuthMode.SignUp) },
                    )
                }

                if (!signUp) {
                    /* There is no password reset in the app, and the web's rides
                       on OTP, which is not working yet. A person who has
                       forgotten theirs needs a human, so say who. */
                    Text(
                        text = lang.l(
                            "Forgot your password? Call us on ${formatPhone(Contact.PHONE_DISPLAY)} and we'll help.",
                            "పాస్‌వర్డ్ మర్చిపోయారా? ${formatPhone(Contact.PHONE_DISPLAY)} కు కాల్ చేయండి, సహాయం చేస్తాం.",
                        ),
                        color = colors.textSecondary,
                        fontSize = 13.sp,
                        lineHeight = 19.sp,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    TextAction(
                        label = lang.l("Call Go Grameen", "గో గ్రామీణ్‌కు కాల్ చేయండి"),
                        onClick = { context.dialGoGrameen(lang) },
                        modifier = Modifier.align(Alignment.CenterHorizontally),
                    )
                }

                Spacer(Modifier.height(32.dp))
            }
        }
    }
}

/* Log in | Sign up, as one pill with the chosen half filled — the same shape
 * as the language toggle, so it reads as "pick one of two" at a glance.
 * Tab semantics, so TalkBack says "Log in, tab, selected, 1 of 2". */
@Composable
private fun ModeSwitch(mode: AuthMode, lang: Lang, enabled: Boolean, onChange: (AuthMode) -> Unit) {
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
        listOf(
            AuthMode.LogIn to lang.l("Log in", "లాగిన్"),
            AuthMode.SignUp to lang.l("Sign up", "సైన్ అప్"),
        ).forEach { (option, label) ->
            val selected = option == mode
            Box(
                modifier = Modifier
                    .weight(1f)
                    .heightIn(min = TouchTarget)
                    .clip(RoundedCornerShape(999.dp))
                    .background(if (selected) colors.accentStrong else Color.Transparent)
                    .selectable(
                        selected = selected,
                        enabled = enabled,
                        role = Role.Tab,
                        onClick = { onChange(option) },
                    ),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = label,
                    color = if (selected) colors.onAccent else colors.textSecondary,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Bold,
                )
            }
        }
    }
}

/* The sprout on the brand gradient, as on /home. */
@Composable
private fun BrandTile() {
    Box(
        modifier = Modifier
            .size(52.dp)
            .clip(RoundedCornerShape(16.dp))
            .background(Brush.linearGradient(listOf(GgGreen500, GgGreen700)))
            .decorative(),
        contentAlignment = Alignment.Center,
    ) {
        Text("🌱", fontSize = 26.sp)
    }
}
