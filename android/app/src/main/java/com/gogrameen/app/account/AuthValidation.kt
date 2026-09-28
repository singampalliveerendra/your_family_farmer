package com.gogrameen.app.account

import com.gogrameen.app.Lang
import com.gogrameen.app.l

/* Checking the form before it is sent.
 *
 * This is NOT where the rules live — /api/consumer/register and /login check
 * every one of these again and are the only word that counts. It exists because
 * those routes answer a short password or a nine-digit phone in English only,
 * and only after a round trip on rural 4G. Catching the obvious mistakes here
 * means the person is told instantly, next to the field, in their language.
 *
 * The limits are copied from the routes on purpose and must move with them:
 *   phone     normalizePhone in src/lib/phone.ts — last 10 digits of whatever
 *             was typed, after stripping everything that is not a digit
 *   name      required, trimmed, at most 80 characters (register/route.ts)
 *   password  6 to 128 characters on sign-up; any non-empty one on login,
 *             because accounts made before the 6-character rule still exist */

const val PASSWORD_MIN = 6
const val PASSWORD_MAX = 128
const val NAME_MAX = 80

/** The same 10 digits the server will look up, or "" if there aren't ten. */
fun normalizePhone(raw: String): String {
    val digits = raw.filter { it.isDigit() }.takeLast(10)
    return if (digits.length == 10) digits else ""
}

/* What the phone box keeps as someone types. Digits only, and at most ten of
 * them — but a pasted "+91 98765 43210" or "098765 43210" collapses to its last
 * ten rather than being cut off after the country code, which is how pasting a
 * number from WhatsApp would otherwise fail. */
fun cleanPhoneInput(raw: String): String {
    val digits = raw.filter { it.isDigit() }
    return if (digits.length > 10) digits.takeLast(10) else digits
}

/* "98765 43210" — the grouping Indians read a mobile number in. */
fun formatPhone(phone: String): String =
    if (phone.length == 10) "${phone.take(5)} ${phone.drop(5)}" else phone

data class FieldErrors(
    val name: String? = null,
    val phone: String? = null,
    val password: String? = null,
) {
    val isEmpty: Boolean get() = name == null && phone == null && password == null
}

fun validateLogin(phone: String, password: String, lang: Lang): FieldErrors = FieldErrors(
    phone = phoneError(phone, lang),
    password = if (password.isEmpty()) lang.l("Enter your password.", "మీ పాస్‌వర్డ్ ఇవ్వండి.") else null,
)

fun validateSignUp(name: String, phone: String, password: String, lang: Lang): FieldErrors = FieldErrors(
    name = when {
        name.isBlank() -> lang.l("Enter your name.", "మీ పేరు ఇవ్వండి.")
        name.trim().length > NAME_MAX -> lang.l(
            "Keep your name under $NAME_MAX characters.",
            "మీ పేరు $NAME_MAX అక్షరాలలోపు ఉండాలి.",
        )
        else -> null
    },
    phone = phoneError(phone, lang),
    password = when {
        password.length < PASSWORD_MIN -> lang.l(
            "Use at least $PASSWORD_MIN characters.",
            "కనీసం $PASSWORD_MIN అక్షరాలు వాడండి.",
        )
        password.length > PASSWORD_MAX -> lang.l("That password is too long.", "పాస్‌వర్డ్ చాలా పొడవుగా ఉంది.")
        else -> null
    },
)

private fun phoneError(phone: String, lang: Lang): String? = when {
    phone.isBlank() -> lang.l("Enter your phone number.", "మీ ఫోన్ నంబర్ ఇవ్వండి.")
    normalizePhone(phone).isEmpty() -> lang.l(
        "Enter a 10-digit mobile number.",
        "10 అంకెల మొబైల్ నంబర్ ఇవ్వండి.",
    )
    else -> null
}
