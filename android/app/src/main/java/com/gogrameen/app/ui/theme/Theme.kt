package com.gogrameen.app.ui.theme

import android.app.Activity
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

/* Dynamic colour is deliberately off.
 *
 * The template turned on Material You, which repaints an app in whatever
 * wallpaper colours the phone happens to have. Go Grameen has one palette and
 * the landing page is built on it, so a phone-tinted build would stop looking
 * like the product. */

private val LocalGgColors = staticCompositionLocalOf { GgLightColors }

object GgTheme {
    val colors: GgColors
        @Composable get() = LocalGgColors.current
}

@Composable
fun GoGrameenTheme(
    /* Light by default, and not tied to isSystemInDarkTheme(): the choice is a
       control in the app's own header, so the phone's setting must not quietly
       override what the person picked. */
    dark: Boolean = false,
    content: @Composable () -> Unit,
) {
    val colors = if (dark) GgDarkColors else GgLightColors

    /* The status and navigation bars are drawn by the system, not by us, and
       edge-to-edge puts our page underneath them. Without this, light mode
       shows white system icons on a near-white page — invisible. */
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            WindowCompat.getInsetsController(window, view).apply {
                isAppearanceLightStatusBars = !dark
                isAppearanceLightNavigationBars = !dark
            }
        }
    }

    val material = if (dark) {
        darkColorScheme(
            primary = colors.accentStrong,
            onPrimary = colors.onAccent,
            background = colors.background,
            onBackground = colors.textPrimary,
            surface = colors.background,
            onSurface = colors.textPrimary,
            // Popups (the settings menu) paint on this, not on `surface`.
            surfaceContainer = colors.elevatedSurface,
        )
    } else {
        lightColorScheme(
            primary = colors.accentStrong,
            onPrimary = colors.onAccent,
            background = colors.background,
            onBackground = colors.textPrimary,
            surface = colors.background,
            onSurface = colors.textPrimary,
            surfaceContainer = colors.elevatedSurface,
        )
    }

    CompositionLocalProvider(LocalGgColors provides colors) {
        MaterialTheme(colorScheme = material, typography = Typography, content = content)
    }
}
