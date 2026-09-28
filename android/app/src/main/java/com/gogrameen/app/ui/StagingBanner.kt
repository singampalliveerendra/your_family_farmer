package com.gogrameen.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.gogrameen.app.Lang
import com.gogrameen.app.l
import com.gogrameen.app.net.Http

/* The Test build says so, on every screen.
 *
 * A port of src/components/StagingBanner.tsx, which exists because the staging
 * site is indistinguishable from the real one at a glance while writing to a
 * different database with Test data and test payment keys. On the phone the
 * risk is worse than on the web: there is no address bar, so once the app is
 * installed the only difference between the two is the drawer icon's label.
 *
 * Amber and black rather than theme colours on purpose. Every other surface in
 * the app repaints with the dark toggle; a warning that can be styled into the
 * background is not a warning.
 *
 * Renders nothing at all in the production build — the `if` is on a compile-time
 * constant, so R8 will drop the whole thing from the release APK.
 */
@Composable
fun StagingBanner(lang: Lang, modifier: Modifier = Modifier) {
    if (!Http.isStaging) return

    Box(
        modifier = modifier
            .fillMaxWidth()
            .background(AMBER)
            .padding(horizontal = 12.dp, vertical = 6.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = lang.l(
                "⚠️ TEST BUILD — Test data, test payments. Not the real Go Grameen.",
                "⚠️ టెస్ట్ యాప్ — టెస్ట్ డేటా, టెస్ట్ చెల్లింపులు. ఇది అసలు గో గ్రామీణ్ కాదు.",
            ),
            color = AMBER_TEXT,
            fontSize = 11.sp,
            fontWeight = FontWeight.Bold,
            lineHeight = 15.sp,
            textAlign = TextAlign.Center,
        )
    }
}

/* amber-500 / amber-950, the same two the web banner uses. */
private val AMBER = Color(0xFFF59E0B)
private val AMBER_TEXT = Color(0xFF451A03)
