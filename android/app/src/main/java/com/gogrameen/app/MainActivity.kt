package com.gogrameen.app

import android.content.Context
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import com.gogrameen.app.ui.theme.GgTheme
import com.gogrameen.app.ui.theme.GoGrameenTheme

/* The only activity for now. Screens are added as composables behind a
 * navigation host once there is a second one to move to; a single screen does
 * not need routing, and adding it early would be scaffolding around nothing. */
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        /* Read before the first composition so the app opens in the mode the
           person last chose. Doing it in a LaunchedEffect instead would paint
           light for a frame and then flip, which reads as a bug. */
        val prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE)

        setContent {
            var dark by remember { mutableStateOf(prefs.getBoolean(KEY_DARK, false)) }

            GoGrameenTheme(dark = dark) {
                /* Painted behind the Scaffold as well as inside it: edge-to-edge
                   draws under the status and navigation bars, and a default
                   surface there would show a band in the wrong theme. */
                Surface(modifier = Modifier.fillMaxSize(), color = GgTheme.colors.background) {
                    Scaffold(
                        modifier = Modifier.fillMaxSize(),
                        containerColor = GgTheme.colors.background,
                    ) { innerPadding ->
                        HomeScreen(
                            dark = dark,
                            onToggleDark = {
                                dark = !dark
                                prefs.edit().putBoolean(KEY_DARK, dark).apply()
                            },
                            modifier = Modifier.padding(innerPadding),
                        )
                    }
                }
            }
        }
    }

    private companion object {
        const val PREFS = "gg_prefs"
        const val KEY_DARK = "dark_mode"
    }
}
