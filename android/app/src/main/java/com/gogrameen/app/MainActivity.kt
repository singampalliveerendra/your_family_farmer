package com.gogrameen.app

import android.content.Context
import android.content.SharedPreferences
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.collectAsState
import androidx.compose.ui.Modifier
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.gogrameen.app.catalogue.CatalogueScreen
import com.gogrameen.app.catalogue.CatalogueState
import com.gogrameen.app.catalogue.CatalogueViewModel
import com.gogrameen.app.catalogue.ListingDetailScreen
import com.gogrameen.app.catalogue.ListingMissingScreen
import com.gogrameen.app.net.Http
import com.gogrameen.app.ui.StagingBanner
import com.gogrameen.app.ui.theme.GgTheme
import com.gogrameen.app.ui.theme.GoGrameenTheme

/* The only activity. Screens are composables behind a NavHost.
 *
 * Language and theme live here rather than inside a screen because both are
 * app-wide: switching to Telugu on /home and finding the catalogue still in
 * English would read as a bug, and the theme has to hold across every screen
 * for the same reason. Both are persisted, so the app reopens the way the
 * person left it. */
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        /* Before any screen composes, so the first request already has it.
           Nothing lives in the jar yet — it is here because the alternative is
           adding it later and revisiting every call site that was written
           without it. */
        Http.install()

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

            GoGrameenTheme(dark = dark) {
                /* Painted behind the Scaffold as well as inside it: edge-to-edge
                   draws under the status and navigation bars, and a default
                   surface there would show a band in the wrong theme. */
                Surface(modifier = Modifier.fillMaxSize(), color = GgTheme.colors.background) {
                    Scaffold(
                        modifier = Modifier.fillMaxSize(),
                        containerColor = GgTheme.colors.background,
                    ) { innerPadding ->
                        /* A Column, not two children of the Scaffold slot: that
                           slot lays its content out on top of itself, so the
                           banner would sit over the screen rather than above it. */
                        Column(modifier = Modifier.padding(innerPadding)) {
                            /* Same job as StagingBanner.tsx on the website: this
                               build writes to a different database with fake
                               data and test payment keys, and must never be
                               mistaken for the real app in front of the client.
                               Outside the NavHost, so it shows on every screen. */
                            StagingBanner(lang = lang)

                            GoGrameenApp(
                                lang = lang,
                                onToggleLang = {
                                    lang = if (lang == Lang.EN) Lang.TE else Lang.EN
                                    prefs.edit().putString(KEY_LANG, lang.name).apply()
                                },
                                dark = dark,
                                onToggleDark = {
                                    dark = !dark
                                    prefs.edit().putBoolean(KEY_DARK, dark).apply()
                                },
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
    fun listing(id: String) = "listing/$id"
}

@Composable
private fun GoGrameenApp(
    lang: Lang,
    onToggleLang: () -> Unit,
    dark: Boolean,
    onToggleDark: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val navController = rememberNavController()

    /* Hoisted ABOVE the NavHost on purpose. Called inside a composable() block
       it would scope to that back-stack entry, so the catalogue would be thrown
       away and refetched every time someone opened a product and pressed back.
       Here it belongs to the activity and the list is fetched once. */
    val catalogue: CatalogueViewModel = viewModel()

    NavHost(
        navController = navController,
        startDestination = Routes.HOME,
        modifier = modifier,
    ) {
        composable(Routes.HOME) {
            HomeScreen(
                lang = lang,
                onToggleLang = onToggleLang,
                dark = dark,
                onToggleDark = onToggleDark,
                onBrowse = { navController.navigate(Routes.CATALOGUE) },
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
                )
            }
        }
    }
}
