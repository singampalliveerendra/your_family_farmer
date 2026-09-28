package com.gogrameen.app.ui

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.gogrameen.app.Lang
import com.gogrameen.app.l
import com.gogrameen.app.ui.theme.GgTheme

/* How to reach a person at Go Grameen, and the one-tap ways to do it.
 *
 * Kept identical to the web footer in src/components/home/HomeLanding.tsx —
 * the displayed number is local, the dialled one carries the country code.
 * It appears on four screens now (home, account, forgot-password, and "call to
 * order" on a product), so it lives in one place: a number that changes must
 * not change on three screens and not the fourth. */
object Contact {
    const val EMAIL = "GovuGrameenam@gmail.com"
    const val PHONE_DISPLAY = "9603174271"
    const val PHONE_DIAL = "+919603174271"
}

/* The dialer, with the number filled in and NOT called — ACTION_DIAL, not
 * ACTION_CALL. Calling for someone without showing them the number first needs
 * a runtime permission and startles people. */
fun Context.dialGoGrameen(lang: Lang) = openOrToast(
    Intent(Intent.ACTION_DIAL, Uri.parse("tel:${Contact.PHONE_DIAL}")),
    lang.l("No phone app found", "ఫోన్ యాప్ లేదు"),
)

fun Context.emailGoGrameen(lang: Lang) = openOrToast(
    Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:${Contact.EMAIL}")),
    lang.l("No email app found", "ఇమెయిల్ యాప్ లేదు"),
)

private fun Context.openOrToast(intent: Intent, failure: String) {
    try {
        startActivity(intent)
    } catch (e: ActivityNotFoundException) {
        Toast.makeText(this, failure, Toast.LENGTH_SHORT).show()
    }
}

/* A contact line as a full-width pill: icon, then the number or address. The
 * whole pill is the button, because on a phone the number has to be one tap to
 * dial and the address one tap to compose — that is the whole point of showing
 * them. `description` is what TalkBack says instead of reading out digits. */
@Composable
fun ContactRow(
    icon: ImageVector,
    label: String,
    description: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = GgTheme.colors
    Row(
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = 52.dp)
            .clip(RoundedCornerShape(999.dp))
            .border(1.dp, colors.border, RoundedCornerShape(999.dp))
            .background(colors.surface)
            .clickable(onClick = onClick, onClickLabel = description, role = Role.Button)
            .padding(horizontal = 18.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = colors.accent,
            modifier = Modifier.size(19.dp),
        )
        Spacer(Modifier.width(12.dp))
        Text(
            text = label,
            color = colors.textPrimary,
            fontSize = 14.5.sp,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}
