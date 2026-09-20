package com.gogrameen.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.gogrameen.app.Lang
import com.gogrameen.app.ui.theme.GgTheme

/* One pill, two halves, the active one filled. The web toggle is two separate
 * buttons; a single tap target is easier to hit one-handed and there are only
 * ever two states to move between.
 *
 * Shared rather than per-screen because it is the same control in the same
 * corner on every screen, and two copies would drift the moment one of them
 * gained a third language or changed shape.
 *
 * The pill is drawn 36dp tall but the tap area is the full 48dp — the outer Box
 * takes the touch, the inner Row is only paint. For TalkBack it is one button
 * that says which language is on and what a tap will do, in the language the
 * person is currently reading. */
@Composable
fun LanguageToggle(lang: Lang, onToggle: () -> Unit) {
    val colors = GgTheme.colors
    val state = if (lang == Lang.EN) "English" else "తెలుగు"
    val action = if (lang == Lang.EN) "Switch to Telugu" else "ఇంగ్లీష్‌కు మార్చండి"

    Box(
        modifier = Modifier
            .heightIn(min = TouchTarget)
            .clip(RoundedCornerShape(999.dp))
            .clickable(onClick = onToggle, onClickLabel = action, role = Role.Button)
            .semantics { stateDescription = state },
        contentAlignment = Alignment.Center,
    ) {
        Row(
            modifier = Modifier
                .clip(RoundedCornerShape(999.dp))
                .border(1.dp, colors.border, RoundedCornerShape(999.dp))
                .background(colors.surface)
                .padding(3.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            LanguageChip("EN", active = lang == Lang.EN)
            LanguageChip("తె", active = lang == Lang.TE)
        }
    }
}

@Composable
private fun LanguageChip(label: String, active: Boolean) {
    val colors = GgTheme.colors
    Text(
        text = label,
        color = if (active) colors.onAccent else colors.textSecondary,
        fontSize = 13.sp,
        fontWeight = FontWeight.Bold,
        modifier = Modifier
            .clip(RoundedCornerShape(999.dp))
            .background(if (active) colors.accentStrong else Color.Transparent)
            .padding(horizontal = 12.dp, vertical = 6.dp),
    )
}
