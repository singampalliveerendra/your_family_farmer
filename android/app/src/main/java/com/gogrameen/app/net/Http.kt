package com.gogrameen.app.net

import com.gogrameen.app.BuildConfig
import com.gogrameen.app.Lang
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.net.CookieHandler
import java.net.CookieManager
import java.net.CookiePolicy
import java.net.HttpCookie
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL

/* The one place the app talks to the Go Grameen server.
 *
 * Every screen from here on goes through this object rather than opening its
 * own connection. Three things live here that must not be decided per-screen:
 *
 *  1. WHICH SITE. The base URL comes from BuildConfig, so the Test build cannot
 *     reach production by accident. This is the whole point of the flavour split
 *     in build.gradle.kts, and it only holds if nothing hardcodes a URL again.
 *
 *  2. THE COOKIE JAR. The backend authenticates with HMAC-signed HttpOnly
 *     cookies — `yff_consumer` for buyers, `yff_farmer` for sellers — set by
 *     the same /api/consumer/login the website uses. There is no bearer token
 *     to invent and no Android-only auth to design: the app just has to keep
 *     the cookies and send them back. Installing a CookieHandler here does that
 *     for every request in the process, including ones written later.
 *
 *  3. WHAT AN ERROR MEANS. Next.js routes answer a failure with
 *     `{"error": "..."}` — already localised, already written for a buyer to
 *     read. Pulling that message out here means no screen has to guess at its
 *     own wording for "just sold out" or "too many login attempts".
 *
 * Deliberately still HttpURLConnection, not Retrofit or Ktor. The reasons in
 * ProduceApi.kt hold: a handful of calls, no code generation to justify, and
 * the platform's own CookieHandler gives us the session for free. Revisit if
 * the app ever needs interceptors or a real request pipeline.
 */
object Http {

    /** The site this build talks to, always with a trailing slash. */
    val baseUrl: String get() = BuildConfig.API_BASE_URL

    /** True in the Test build. Screens use it to show the staging banner. */
    val isStaging: Boolean get() = BuildConfig.IS_STAGING

    /* Ten seconds to connect, twenty to read. A stale read is worse than a slow
       one on a live catalogue, but a phone on rural 4G must not hang forever. */
    private const val CONNECT_TIMEOUT_MS = 10_000
    private const val READ_TIMEOUT_MS = 20_000

    /* Kept as fields so the language cookie can be written into the same jar
       the connections read from, and so logout can empty it.

       Starts as an in-memory jar so the JVM tests — which have no Android
       Keystore — can touch this object at all. install() swaps in the
       encrypted one before the first real request. */
    private var store = PersistentCookieStore(MemorySecretStore())
    private var cookies = CookieManager(store, CookiePolicy.ACCEPT_ALL)

    /**
     * Install the process-wide cookie jar. Called once, from MainActivity,
     * before anything is drawn.
     *
     * The login cookies in it are written through to encrypted storage (see
     * PersistentCookieStore and SecurePrefs), so a buyer who logs in stays
     * logged in across restarts for the 30 days the server grants — and is
     * logged out the moment the server says so.
     */
    fun install(secrets: SecretStore) {
        store = PersistentCookieStore(secrets)
        cookies = CookieManager(store, CookiePolicy.ACCEPT_ALL)
        CookieHandler.setDefault(cookies)
    }

    /** True while this phone holds an unexpired login cookie. */
    fun hasSession(): Boolean = store.hasSession()

    /** Forget the login cookies on this phone, with or without the server. */
    fun clearSession() = store.clearSession()

    /**
     * Tell the server which language to answer in.
     *
     * The backend reads a `yff_lang` cookie (`reqLang` in src/lib/serverLang.ts)
     * and **defaults to Telugu when it is absent** — so an English-mode app that
     * sends nothing gets Telugu error messages. The website sets this cookie
     * from its LanguageProvider; the app has to do the same thing.
     *
     * Written into the jar rather than set as a header per request, because a
     * manual `Cookie` header and an installed CookieHandler fight over the same
     * field. One jar, one source of truth.
     */
    fun setLanguage(lang: Lang) {
        val base = baseUriOrNull() ?: return
        val cookie = HttpCookie(LANG_COOKIE, if (lang == Lang.EN) "en" else "te").apply {
            path = "/"
            /* HttpCookie defaults to version 1, which java serialises in RFC 2965
               form (`$Version="1"; yff_lang=en`). Next's cookie parser wants the
               plain `yff_lang=en` of version 0. */
            version = 0
        }
        /* Replace rather than accumulate: the store keys on name+domain+path, so
           adding again overwrites, but removing first keeps that guarantee ours
           rather than the implementation's. */
        cookies.cookieStore.remove(base, cookie)
        cookies.cookieStore.add(base, cookie)
    }

    /**
     * GET a path relative to this build's site, returning the response body.
     *
     * @throws java.io.IOException  no signal, DNS, a dropped connection, a
     *   timeout. Screens read this as "you are offline" — it is a network fact,
     *   not something the server said.
     * @throws ApiException the server answered, and answered badly. Carries the
     *   status code and, where the route sent one, the server's own message.
     */
    suspend fun get(path: String): String = withContext(Dispatchers.IO) {
        read(open(path, "GET"))
    }

    /**
     * POST a JSON body to a path relative to this build's site.
     *
     * Same failure contract as [get]. Used for login, sign-up and logout —
     * the Set-Cookie on the reply lands in the jar on its own, which is the
     * whole of "being logged in" as far as this app is concerned.
     */
    suspend fun post(path: String, json: String = "{}"): String = withContext(Dispatchers.IO) {
        val connection = open(path, "POST").apply {
            doOutput = true
            setRequestProperty("Content-Type", "application/json; charset=utf-8")
        }
        try {
            connection.outputStream.use { it.write(json.toByteArray(Charsets.UTF_8)) }
        } catch (e: java.io.IOException) {
            // No signal before the body was even sent. Close up, and let the
            // caller read it as offline like any other IOException.
            connection.disconnect()
            throw e
        }
        read(connection)
    }

    private fun read(connection: HttpURLConnection): String = try {
        val code = connection.responseCode
        if (code !in 200..299) {
            val body = errorBody(connection)
            throw ApiException(code, errorMessage(body, code), body)
        }
        connection.inputStream.bufferedReader().use { it.readText() }
    } finally {
        connection.disconnect()
    }

    private fun open(path: String, method: String): HttpURLConnection {
        val base = baseUrl
        /* The staging build with nothing in gg.stagingBaseUrl lands here. Failing
           with the line to edit beats a MalformedURLException, and beats far more
           the alternative we refuse to offer: quietly falling back to production,
           which would put test orders on a real farmer's dashboard. */
        check(base.isNotEmpty()) {
            "This build has no server to talk to. Set gg.stagingBaseUrl in " +
                "android/gradle.properties and rebuild."
        }
        return (URL(joinUrl(base, path)).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = CONNECT_TIMEOUT_MS
            readTimeout = READ_TIMEOUT_MS
            setRequestProperty("Accept", "application/json")
        }
    }

    /* The server's own words for what went wrong, where it gave any.
     *
     * Worth the effort because these messages are the good ones: "Tomato just
     * sold out. Please reduce the quantity and try again." is written for a
     * buyer, is already in their language, and no wording invented on this side
     * would beat it. Falls back to the status code when the body is missing or
     * is not the shape we expect — an HTML error page from Vercel, say. */
    private fun errorBody(connection: HttpURLConnection): String? = try {
        connection.errorStream?.bufferedReader()?.use { it.readText() }
    } catch (e: Exception) {
        null
    }

    private fun errorMessage(body: String?, code: Int): String {
        val fromServer = body?.takeIf { it.isNotBlank() }?.let { text ->
            try {
                Json.parseToJsonElement(text).jsonObject["error"]?.jsonPrimitive?.content
            } catch (e: Exception) {
                null
            }
        }
        return fromServer?.takeIf { it.isNotBlank() } ?: "The server returned an error ($code)."
    }

    private fun baseUriOrNull(): URI? = try {
        baseUrl.takeIf { it.isNotEmpty() }?.let { URI(it) }
    } catch (e: Exception) {
        null
    }

    private const val LANG_COOKIE = "yff_lang"
}

/**
 * The server answered with a non-2xx status.
 *
 * Deliberately NOT an IOException. Screens treat an IOException as "no signal"
 * and offer a retry; a 500 or a 400 is the server having spoken, and reading it
 * as offline would tell someone to check their connection when their cart is
 * the problem.
 */
class ApiException(
    val status: Int,
    message: String,
    /* The whole reply, for the routes that say more than `error`. Login is the
       one that matters: a 401 with `notRegistered: true` and a 401 for a wrong
       password need different screens, and a 403 carries the moderator's
       `suspendedReason`. */
    val body: String? = null,
) : Exception(message)

/**
 * Join a base URL to a relative path.
 *
 * Pure, and separated from the object above so it can be unit-tested without an
 * Android build. Tolerant of a slash on either side, both, or neither: call
 * sites write `api/produce` or `/api/produce` and neither should produce the
 * `//` that some proxies redirect and some reject.
 */
internal fun joinUrl(base: String, path: String): String =
    base.trimEnd('/') + "/" + path.trimStart('/')
