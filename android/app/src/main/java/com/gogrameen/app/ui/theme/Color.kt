package com.gogrameen.app.ui.theme

import androidx.compose.runtime.Immutable
import androidx.compose.ui.graphics.Color

/* The palette, in two versions.
 *
 * The web landing page is dark-only, so the dark values below are the ones
 * lifted from it and the Tailwind shade names are kept to make a later change
 * easy to carry across. Light is new: the app opens on a phone in daylight far
 * more often than a marketing page gets opened at night, so light is the
 * default here even though the site has no light mode.
 *
 * Screens never name a raw colour. They read semantic roles off GgTheme.colors,
 * which is what lets one toggle repaint the whole app — a screen that reached
 * for GgLime300 directly would stay lime on a white background. */

// Raw brand values, shared by both schemes.
val GgInk = Color(0xFF04140B)
val GgLime300 = Color(0xFFBEF264)
val GgLime200 = Color(0xFFD9F99D)
val GgLime100 = Color(0xFFECFCCB)
val GgGreen500 = Color(0xFF22C55E)
val GgGreen700 = Color(0xFF15803D)

@Immutable
data class GgColors(
    val background: Color,
    val surface: Color,
    val border: Color,
    val textPrimary: Color,
    val textSecondary: Color,
    /** The headline's third line, and the arrow on a role card. */
    val accent: Color,
    /** Filled controls — the active half of a toggle. */
    val accentStrong: Color,
    val onAccent: Color,
    val badgeBg: Color,
    val badgeBorder: Color,
    val badgeText: Color,
    val iconTileBg: Color,
    /* Opaque, unlike `surface`, which in dark is a translucent white wash that
       only works painted over the page. A popup floats above an unknown
       backdrop, so it needs a colour that stands on its own. */
    val elevatedSurface: Color,
    val isDark: Boolean,
)

/* Lime on white fails to read — it is a colour built for a near-black page.
 * So light swaps the accent to green-700, which carries the same brand at a
 * contrast a phone in sunlight can actually resolve, and keeps lime for the
 * soft fills where it sits behind dark text rather than being the text. */
val GgLightColors = GgColors(
    background = Color(0xFFF6FAF4),
    surface = Color(0xFFFFFFFF),
    border = Color(0xFFE2EAE0),
    textPrimary = Color(0xFF14261A),
    textSecondary = Color(0xFF5A6B5F),
    accent = GgGreen700,
    accentStrong = GgGreen700,
    onAccent = Color.White,
    badgeBg = GgLime100,
    badgeBorder = GgLime200,
    badgeText = Color(0xFF3F6212),
    iconTileBg = GgLime100,
    elevatedSurface = Color(0xFFFFFFFF),
    isDark = false,
)

val GgDarkColors = GgColors(
    background = GgInk,
    surface = Color(0x0DFFFFFF),      // white/5
    border = Color(0x1AFFFFFF),       // white/10
    textPrimary = Color.White,
    textSecondary = GgLime100.copy(alpha = 0.65f),
    accent = GgLime300,
    accentStrong = GgLime300,
    onAccent = GgInk,
    badgeBg = GgLime300.copy(alpha = 0.10f),
    badgeBorder = GgLime300.copy(alpha = 0.25f),
    badgeText = GgLime200,
    iconTileBg = GgLime300.copy(alpha = 0.15f),
    elevatedSurface = Color(0xFF0D2315),
    isDark = true,
)
