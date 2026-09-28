package com.gogrameen.app.account

import com.gogrameen.app.Lang
import com.gogrameen.app.l
import com.gogrameen.app.net.ApiException
import com.gogrameen.app.net.Http
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import java.io.IOException

/* A buyer's account, over the same four routes the website uses:
 *
 *   POST /api/consumer/register  {name, phone, password}  → sets yff_consumer
 *   POST /api/consumer/login     {phone, password}        → sets yff_consumer
 *   GET  /api/consumer/me        → who the cookie belongs to, or nobody
 *   POST /api/consumer/logout    → clears yff_consumer
 *
 * There is no token here to read, store or refresh. The server answers a
 * successful login with a Set-Cookie, the jar in Http keeps it (encrypted), and
 * every later request carries it. Not one line of this file handles the cookie
 * itself — that is the point.
 *
 * No server changes were needed for any of this. */

@Serializable
data class Consumer(
    val id: String,
    val name: String? = null,
    val phone: String? = null,
)

/* Everything that can stop a login or sign-up, as the screen needs to tell
 * them apart. Each one gets different words, and several need different
 * behaviour — "no account for this number" moves the person to Sign up rather
 * than just telling them they failed. */
sealed interface AuthFailure {
    /** The phone never reached the server. */
    data object Offline : AuthFailure

    /** 401 with notRegistered — right phone format, no account behind it. */
    data object NotRegistered : AuthFailure

    /** 401 — the password does not match. */
    data object WrongCredentials : AuthFailure

    /** 403 — a moderator suspended this account. Their reason is shown, per the client. */
    data class Suspended(val reason: String?) : AuthFailure

    /** 429 — five attempts per phone per ten minutes, or ten sign-ups per hour. */
    data object RateLimited : AuthFailure

    /** 409 on sign-up — this number already has an account. */
    data object AlreadyRegistered : AuthFailure

    /** 400 — the server refused the input. Rare: the form checks first. */
    data class Rejected(val message: String?) : AuthFailure

    /** 5xx, or a reply that is not the shape we expect. */
    data class Server(val message: String?) : AuthFailure
}

class AuthException(val failure: AuthFailure) : Exception(failure.toString())

sealed interface MeResult {
    data class SignedIn(val consumer: Consumer) : MeResult
    data object SignedOut : MeResult
    data class Suspended(val reason: String?) : MeResult
}

/* The calls, behind an interface so AccountViewModel can be tested on the JVM
 * with a fake — no server, no device. */
interface AuthGateway {
    /** @throws AuthException */
    suspend fun login(phone: String, password: String): Consumer

    /** @throws AuthException */
    suspend fun register(name: String, phone: String, password: String): Consumer

    /** @throws AuthException only as [AuthFailure.Offline] or [AuthFailure.Server]. */
    suspend fun me(): MeResult

    /** Best effort. Never throws — the phone logs out whether or not this lands. */
    suspend fun logout()
}

object HttpAuthGateway : AuthGateway {

    override suspend fun login(phone: String, password: String): Consumer = call {
        val body = buildJsonObject {
            put("phone", phone)
            put("password", password)
        }
        parseConsumerReply(Http.post("api/consumer/login", body.toString()))
    }

    override suspend fun register(name: String, phone: String, password: String): Consumer = call {
        val body = buildJsonObject {
            put("name", name.trim())
            put("phone", phone)
            put("password", password)
        }
        parseConsumerReply(Http.post("api/consumer/register", body.toString()))
    }

    override suspend fun me(): MeResult = call { parseMe(Http.get("api/consumer/me")) }

    override suspend fun logout() {
        try {
            Http.post("api/consumer/logout")
        } catch (e: Exception) {
            // Offline or the server errored. The local clear below is what
            // actually logs this phone out; the server call only tidies up.
        } finally {
            Http.clearSession()
        }
    }

    /* Turns every way a call can fail into an AuthFailure, so the view model
       deals in one exception type. A CancellationException is left alone — it
       is not a failure, it is the screen going away. */
    private suspend fun <T> call(block: suspend () -> T): T = try {
        block()
    } catch (e: AuthException) {
        throw e
    } catch (e: kotlinx.coroutines.CancellationException) {
        throw e
    } catch (e: Exception) {
        throw AuthException(failureOf(e))
    }
}

private val authJson = Json { ignoreUnknownKeys = true }

/* {"ok": true, "consumer": {"id", "name", "phone"}} — the reply to both a
 * login and a sign-up. */
internal fun parseConsumerReply(body: String): Consumer {
    val consumer = authJson.parseToJsonElement(body).jsonObject["consumer"]
        ?: throw AuthException(AuthFailure.Server("No account in the reply."))
    return authJson.decodeFromJsonElement(consumer)
}

/* {"consumer": {...}} when logged in; {"consumer": null} when not; and
 * {"consumer": null, "suspended": true, "suspendedReason"} for a suspended
 * account, in which case the server has already cleared the cookie. */
internal fun parseMe(body: String): MeResult {
    val json = authJson.parseToJsonElement(body).jsonObject
    if (json.bool("suspended") == true) return MeResult.Suspended(json.text("suspendedReason"))
    val consumer = json["consumer"]
    if (consumer == null || consumer !is JsonObject) return MeResult.SignedOut
    return MeResult.SignedIn(authJson.decodeFromJsonElement(consumer))
}

internal fun failureOf(e: Throwable): AuthFailure = when (e) {
    is AuthException -> e.failure
    is IOException -> AuthFailure.Offline
    is ApiException -> failureFrom(e.status, e.body, e.message)
    else -> AuthFailure.Server(e.message)
}

/* The status code alone is not enough: login answers 401 both for "no such
 * account" and for "wrong password", and only the body says which. */
internal fun failureFrom(status: Int, body: String?, message: String?): AuthFailure {
    val json = try {
        body?.let { authJson.parseToJsonElement(it).jsonObject }
    } catch (e: Exception) {
        null
    }
    return when {
        status == 429 -> AuthFailure.RateLimited
        status == 409 -> AuthFailure.AlreadyRegistered
        json?.bool("suspended") == true -> AuthFailure.Suspended(json.text("suspendedReason"))
        status == 401 && json?.bool("notRegistered") == true -> AuthFailure.NotRegistered
        status == 401 -> AuthFailure.WrongCredentials
        status in 400..499 -> AuthFailure.Rejected(json?.text("error") ?: message)
        else -> AuthFailure.Server(json?.text("error") ?: message)
    }
}

private fun JsonObject.bool(key: String): Boolean? = try {
    this[key]?.jsonPrimitive?.booleanOrNull
} catch (e: Exception) {
    null
}

private fun JsonObject.text(key: String): String? = try {
    this[key]?.jsonPrimitive?.contentOrNull?.trim()?.takeIf { it.isNotEmpty() }
} catch (e: Exception) {
    null
}

/* What each failure says to the person.
 *
 * Written here in both languages rather than passed through from the server:
 * the login route translates "wrong password" but answers a rate limit and
 * every 400 in English only, and a Telugu screen that suddenly shows English
 * for its most stressful message is worse than one consistent voice.
 *
 * The rate limit says "wait", never "wrong password" — five tries in ten
 * minutes is easy to hit with a mistyped number, and being told your password
 * is wrong when it isn't sends people to the phone to call support. */
fun AuthFailure.message(lang: Lang): String = when (this) {
    AuthFailure.Offline -> lang.l(
        "Couldn't reach Go Grameen. Check your internet and try again.",
        "గో గ్రామీణ్‌ను చేరలేకపోయాము. మీ ఇంటర్నెట్ చూసి మళ్లీ ప్రయత్నించండి.",
    )
    AuthFailure.NotRegistered -> lang.l(
        "There's no account for this number yet.",
        "ఈ నంబర్‌కు ఇంకా ఖాతా లేదు.",
    )
    AuthFailure.WrongCredentials -> lang.l(
        "That phone number and password don't match. Check them and try again.",
        "ఫోన్ నంబర్, పాస్‌వర్డ్ సరిపోలలేదు. సరిచూసి మళ్లీ ప్రయత్నించండి.",
    )
    is AuthFailure.Suspended -> {
        val base = lang.l(
            "Your account has been suspended. Please contact support.",
            "మీ ఖాతా నిలిపివేయబడింది. దయచేసి సపోర్ట్‌ను సంప్రదించండి.",
        )
        if (reason == null) base else base + "\n" + lang.l("Reason: $reason", "కారణం: $reason")
    }
    AuthFailure.RateLimited -> lang.l(
        "Too many tries. Please wait a few minutes, then try again.",
        "చాలా సార్లు ప్రయత్నించారు. కొన్ని నిమిషాలు ఆగి మళ్లీ ప్రయత్నించండి.",
    )
    AuthFailure.AlreadyRegistered -> lang.l(
        "This number already has an account. Log in instead.",
        "ఈ నంబర్‌కు ఇప్పటికే ఖాతా ఉంది. లాగిన్ చేయండి.",
    )
    is AuthFailure.Rejected -> message ?: lang.l(
        "Please check the details and try again.",
        "వివరాలు సరిచూసి మళ్లీ ప్రయత్నించండి.",
    )
    is AuthFailure.Server -> lang.l(
        "Something went wrong on our side. Please try again in a moment.",
        "మా వైపు సమస్య వచ్చింది. కొద్దిసేపటి తర్వాత మళ్లీ ప్రయత్నించండి.",
    )
}
