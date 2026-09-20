package com.gogrameen.app

import android.content.Context
import android.content.SharedPreferences
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.animation.AnimatedContentTransitionScope
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.gogrameen.app.account.AccountEvent
import com.gogrameen.app.account.AccountScreen
import com.gogrameen.app.account.AccountViewModel
import com.gogrameen.app.account.AuthMode
import com.gogrameen.app.account.DeviceSessionStore
import com.gogrameen.app.account.HttpAuthGateway
import com.gogrameen.app.account.LoginScreen
import com.gogrameen.app.catalogue.CatalogueScreen
import com.gogrameen.app.catalogue.CatalogueState
import com.gogrameen.app.catalogue.CatalogueViewModel
import com.gogrameen.app.catalogue.ListingDetailScreen
import com.gogrameen.app.catalogue.ListingMissingScreen
import com.gogrameen.app.net.Http
import com.gogrameen.app.net.KeystoreSecretStore
import com.gogrameen.app.net.SecretStore
import com.gogrameen.app.ui.Contact
import com.gogrameen.app.ui.StagingBanner
import com.gogrameen.app.ui.theme.GgTheme
import com.gogrameen.app.ui.theme.GoGrameenTheme

/* The only activity. Screens are composables behind a NavHost.
 *
 * Language, theme and who is logged in live here rather than inside a screen
 * because all three are app-wide: switching to Telugu on /home and finding the
 * catalogue still in English would read as a bug, and so would a header that
 * shows you logged in on one screen and not the next. Language and theme are
 * persisted in plain preferences; the session in encrypted ones. */
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        /* Before any screen composes, so the first request already carries the
           saved login cookie. One encrypted store, shared by the cookie jar and
           the cached profile. */
        val secrets: SecretStore = KeystoreSecretStore(this)
        Http.install(secrets)

        /* Read before the first composition so the app opens in the mode the
           person last chose. Doing it in a LaunchedEffect instead would paint
           light for a frame and then flip, which reads as a bug. */
        val prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val startLang = prefs.readLang()

        setContent {
            var dark by remember { mutableStateOf(prefs.getBoolean(KEY_DARK, false)) }
            var lang by remember { mutableStateOf(startLang) }

            /* The server answers in Telugu unless told otherwise — reqLang() in
               src/lib/serverLang.ts defaults to it when the yff_lang cookie is
               absent. Keyed on `lang` so the toggle updates it, and it runs on
               first composition too, which is the case that matters: an English
               user who never touches the toggle. */
            LaunchedEffect(lang) { Http.setLanguage(lang) }

            val setLang: (Lang) -> Unit = { next ->
                lang = next
                prefs.edit().putString(KEY_LANG, next.name).apply()
            }
            val setDark: (Boolean) -> Unit = { next ->
                dark = next
                prefs.edit().putBoolean(KEY_DARK, next).apply()
            }

            GoGrameenTheme(dark = dark) {
                val snackbar = remember { SnackbarHostState() }

                /* Painted behind the Scaffold as well as inside it: edge-to-edge
                   draws under the status and navigation bars, and a default
                   surface there would show a band in the wrong theme. */
                Surface(modifier = Modifier.fillMaxSize(), color = GgTheme.colors.background) {
                    Scaffold(
                        modifier = Modifier.fillMaxSize(),
                        containerColor = GgTheme.colors.background,
                        snackbarHost = { SnackbarHost(snackbar) },
                    ) { innerPadding ->
                        /* A Column, not two children of the Scaffold slot: that
                           slot lays its content out on top of itself, so the
                           banner would sit over the screen rather than above it. */
                        /* consumeWindowInsets: the bars' space is already
                           applied here as padding. Without saying so, the login
                           screen's imePadding() would add the navigation bar a
                           second time on top of the keyboard. */
                        Column(
                            modifier = Modifier
                                .padding(innerPadding)
                                .consumeWindowInsets(innerPadding),
                        ) {
                            /* Same job as StagingBanner.tsx on the website: this
                               build writes to a different database with fake
                               data and test payment keys, and must never be
                               mistaken for the real app in front of the client.
                               Outside the NavHost, so it shows on every screen. */
                            StagingBanner(lang = lang)

                            GoGrameenApp(
                                secrets = secrets,
                                lang = lang,
                                onToggleLang = { setLang(if (lang == Lang.EN) Lang.TE else Lang.EN) },
                                onSetLang = setLang,
                                dark = dark,
                                onSetDark = setDark,
                                snackbar = snackbar,
                            )
                        }
                    }
                }
            }
        }
    }

    /* A saved value that is not one of the two enum names — a downgrade, or a
       preferences file edited on a rooted phone — falls back to the default
       rather than throwing on launch. */
    private fun SharedPreferences.readLang(): Lang =
        getString(KEY_LANG, null)
            ?.let { saved -> Lang.entries.firstOrNull { it.name == saved } }
            ?: DEFAULT_LANG

    private companion object {
        const val PREFS = "gg_prefs"
        const val KEY_DARK = "dark_mode"
        const val KEY_LANG = "lang"
    }
}

private object Routes {
    const val HOME = "home"
    const val CATALOGUE = "catalogue"
    const val LISTING = "listing/{id}"
    const val ACCOUNT = "account"
    const val LOGIN = "login?mode={mode}"
    fun listing(id: String) = "listing/$id"
    fun login(mode: AuthMode) = "login?mode=${mode.name}"
}

/* Screens slide in from the side they are "ahead" on and back out the way they
 * came, with a short fade. It is the movement every Android user already
 * reads as "deeper" and "back" — and it keeps a screen that has not finished
 * loading from appearing to flash into place. 240ms: long enough to follow,
 * short enough that a quick back-and-forth never feels like waiting. */
private const val NAV_MS = 240

private fun AnimatedContentTransitionScope<*>.enter() =
    slideIntoContainer(AnimatedContentTransitionScope.SlideDirection.Start, tween(NAV_MS)) + fadeIn(tween(NAV_MS))

private fun AnimatedContentTransitionScope<*>.exit() =
    slideOutOfContainer(AnimatedContentTransitionScope.SlideDirection.Start, tween(NAV_MS)) { it / 4 } +
        fadeOut(tween(NAV_MS))

private fun AnimatedContentTransitionScope<*>.popEnter() =
    slideIntoContainer(AnimatedContentTransitionScope.SlideDirection.End, tween(NAV_MS)) { it / 4 } +
        fadeIn(tween(NAV_MS))

private fun AnimatedContentTransitionScope<*>.popExit() =
    slideOutOfContainer(AnimatedContentTransitionScope.SlideDirection.End, tween(NAV_MS)) + fadeOut(tween(NAV_MS))

@Composable
private fun GoGrameenApp(
    secrets: SecretStore,
    lang: Lang,
    onToggleLang: () -> Unit,
    onSetLang: (Lang) -> Unit,
    dark: Boolean,
    onSetDark: (Boolean) -> Unit,
    snackbar: SnackbarHostState,
    modifier: Modifier = Modifier,
) {
    val navController = rememberNavController()

    /* Hoisted ABOVE the NavHost on purpose. Called inside a composable() block
       each would scope to that back-stack entry, so the catalogue would be
       thrown away and refetched every time someone opened a product and pressed
       back, and the account would be forgotten between screens. Here both belong
       to the activity. */
    val catalogue: CatalogueViewModel = viewModel()
    val account: AccountViewModel = viewModel(
        factory = viewModelFactory {
            initializer { AccountViewModel(HttpAuthGateway, DeviceSessionStore(secrets)) }
        },
    )
    val accountState by account.state.collectAsState()
    val accountName = accountState.signedInName

    LaunchedEffect(Unit) { account.start() }

    /* One-shot account outcomes: leave the login screen, and say so. The
       language is read through rememberUpdatedState so a welcome shown after
       the toggle was flipped is in the new language, not the one the effect
       started with. */
    val currentLang by rememberUpdatedState(lang)
    LaunchedEffect(account) {
        account.events.collect { event ->
            when (event) {
                is AccountEvent.Welcome -> {
                    navController.leaveLogin()
                    val who = event.firstName
                    snackbar.showSnackbar(
                        when {
                            event.isNew && who != null -> currentLang.l("Welcome to Go Grameen, $who!", "గో గ్రామీణ్‌కు స్వాగతం, $who!")
                            event.isNew -> currentLang.l("Welcome to Go Grameen!", "గో గ్రామీణ్‌కు స్వాగతం!")
                            who != null -> currentLang.l("Welcome back, $who!", "మళ్లీ స్వాగతం, $who!")
                            else -> currentLang.l("You're logged in.", "మీరు లాగిన్ అయ్యారు.")
                        },
                    )
                }
                AccountEvent.LoggedOut ->
                    snackbar.showSnackbar(currentLang.l("You've been logged out.", "మీరు లాగ్ అవుట్ అయ్యారు."))
            }
        }
    }

    /* Suspended while they were away: the launch check found it, the session
       is already gone. A dialog rather than a snackbar because it must be read,
       and because the moderator's reason is the one thing the client asked to
       be shown. */
    if (accountState.suspendedNotice) {
        val reason = accountState.suspendedReason
        AlertDialog(
            onDismissRequest = account::dismissSuspended,
            title = { Text(lang.l("Account suspended", "ఖాతా నిలిపివేయబడింది"), fontWeight = FontWeight.Bold) },
            text = {
                Text(
                    lang.l(
                        "Your account has been suspended, so you've been logged out.",
                        "మీ ఖాతా నిలిపివేయబడింది, అందుకే లాగ్ అవుట్ చేశాం.",
                    ) + (reason?.let { "\n\n" + lang.l("Reason: $it", "కారణం: $it") } ?: "") +
                        "\n\n" + lang.l(
                            "Please call Go Grameen on ${Contact.PHONE_DISPLAY} if you think this is a mistake.",
                            "ఇది పొరపాటు అనుకుంటే ${Contact.PHONE_DISPLAY} కు కాల్ చేయండి.",
                        ),
                )
            },
            confirmButton = {
                TextButton(onClick = account::dismissSuspended) {
                    Text(lang.l("OK", "సరే"), fontWeight = FontWeight.Bold, color = GgTheme.colors.accent)
                }
            },
            containerColor = GgTheme.colors.elevatedSurface,
            titleContentColor = GgTheme.colors.textPrimary,
            textContentColor = GgTheme.colors.textSecondary,
        )
    }

    val openAccount = { navController.navigate(Routes.ACCOUNT) { launchSingleTop = true } }

    NavHost(
        navController = navController,
        startDestination = Routes.HOME,
        modifier = modifier,
        enterTransition = { enter() },
        exitTransition = { exit() },
        popEnterTransition = { popEnter() },
        popExitTransition = { popExit() },
    ) {
        composable(Routes.HOME) {
            HomeScreen(
                lang = lang,
                onToggleLang = onToggleLang,
                onBrowse = { navController.navigate(Routes.CATALOGUE) { launchSingleTop = true } },
                accountName = accountName,
                onAccount = openAccount,
            )
        }

        composable(Routes.CATALOGUE) {
            val state by catalogue.state.collectAsState()
            LaunchedEffect(Unit) { catalogue.ensureLoaded() }

            CatalogueScreen(
                state = state,
                lang = lang,
                onToggleLang = onToggleLang,
                onBack = { navController.popBackStack() },
                onOpen = { navController.navigate(Routes.listing(it.id)) },
                onRetry = catalogue::retry,
                onQueryChange = catalogue::onQueryChange,
                onMethodChange = catalogue::onMethodChange,
                onCategoryChange = catalogue::onCategoryChange,
                onClearFilters = catalogue::clearFilters,
                onRefresh = catalogue::refresh,
                accountName = accountName,
                onAccount = openAccount,
            )
        }

        composable(
            Routes.LISTING,
            arguments = listOf(navArgument("id") { type = NavType.StringType }),
        ) { entry ->
            /* The row is read back out of the list already in memory rather
               than fetched again: /api/produce has no by-id variant, and the
               listing is the one the grid is holding — a second request would
               put a spinner on a screen the person reached by tapping something
               already in front of them. Read through the state, so a reload
               while this screen is open shows the fresh row.

               Null after process death, when Android restores the back stack
               without the catalogue behind it. Rare, but a crash otherwise. */
            val state by catalogue.state.collectAsState()
            val id = entry.arguments?.getString("id")
            val listing = remember(state.content, id) {
                (state.content as? CatalogueState.Ready)?.listings?.firstOrNull { it.id == id }
            }

            if (listing == null) {
                ListingMissingScreen(lang = lang, onBack = { navController.popBackStack() })
            } else {
                ListingDetailScreen(
                    listing = listing,
                    lang = lang,
                    onToggleLang = onToggleLang,
                    onBack = { navController.popBackStack() },
                    accountName = accountName,
                    onAccount = openAccount,
                )
            }
        }

        composable(Routes.ACCOUNT) {
            AccountScreen(
                session = accountState.session,
                lang = lang,
                dark = dark,
                onToggleLang = onToggleLang,
                onSetLang = onSetLang,
                onSetDark = onSetDark,
                onBack = { navController.popBackStack() },
                onLogIn = { navController.openLogin(account, AuthMode.LogIn) },
                onSignUp = { navController.openLogin(account, AuthMode.SignUp) },
                onLogOut = account::logout,
            )
        }

        composable(
            Routes.LOGIN,
            arguments = listOf(
                navArgument("mode") {
                    type = NavType.StringType
                    defaultValue = AuthMode.LogIn.name
                },
            ),
        ) {
            LoginScreen(
                form = accountState.form,
                lang = lang,
                onToggleLang = onToggleLang,
                onBack = { navController.popBackStack() },
                onModeChange = account::setMode,
                onName = account::onName,
                onPhone = account::onPhone,
                onPassword = account::onPassword,
                onTogglePassword = account::togglePasswordVisible,
                onSubmit = account::submit,
            )
        }
    }
}

/* A fresh form in the mode that was asked for — "Create an account" must not
 * open on the Log in tab with last time's error still showing. */
private fun NavHostController.openLogin(account: AccountViewModel, mode: AuthMode) {
    account.resetForm(mode)
    navigate(Routes.login(mode)) { launchSingleTop = true }
}

/* After a successful login, back to wherever they came from — only if the
 * login screen is actually on top, so a Welcome that lands late (slow 4G, and
 * the person already pressed back) does not pop an unrelated screen. */
private fun NavHostController.leaveLogin() {
    if (currentDestination?.route == Routes.LOGIN) popBackStack()
}
