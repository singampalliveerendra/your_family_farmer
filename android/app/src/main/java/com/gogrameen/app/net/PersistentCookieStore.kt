package com.gogrameen.app.net

import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.net.CookieManager
import java.net.CookieStore
import java.net.HttpCookie
import java.net.URI

/* The cookie jar, with the session cookies written through to disk.
 *
 * Java's own CookieManager keeps cookies in memory, which meant closing the app
 * logged you out. This wraps that same in-memory store — so every lookup,
 * domain match and expiry check is still the platform's — and copies only the
 * login cookies into a SecretStore as they arrive, change or are cleared.
 *
 * Only the session cookies are kept. `yff_lang` is rewritten from the saved
 * language every launch, and anything else a route might set is not ours to
 * decide to keep.
 *
 * The server ends a session by sending the same cookie with Max-Age=0. The
 * platform store drops a cookie like that instead of storing it, and so does
 * this — which is what makes logout on the server also logout on the phone. */
class PersistentCookieStore(
    private val secrets: SecretStore,
    private val now: () -> Long = System::currentTimeMillis,
    private val inner: CookieStore = CookieManager().cookieStore,
) : CookieStore {

    /* When each persisted cookie expires, in epoch millis. HttpCookie only
       knows its age relative to when the object was built, which is not
       something that survives a restart, so the absolute time is tracked
       here. */
    private val expiresAt = mutableMapOf<String, Long>()
    private val uris = mutableMapOf<String, String>()

    init {
        restore()
    }

    override fun add(uri: URI?, cookie: HttpCookie) {
        inner.add(uri, cookie)
        if (cookie.name !in PERSISTED) return

        val maxAge = cookie.maxAge
        when {
            // Max-Age=0: the server is ending the session.
            maxAge == 0L -> forget(cookie.name)
            /* No Max-Age: a browser-session cookie, which by definition should
               not outlive the app. The server always sends one for these
               names, so this is defence rather than a path we expect. */
            maxAge < 0L -> forget(cookie.name)
            else -> {
                expiresAt[cookie.name] = now() + maxAge * 1000
                uris[cookie.name] = uri?.toString().orEmpty()
                save()
            }
        }
    }

    override fun get(uri: URI?): MutableList<HttpCookie> = inner.get(uri)
    override fun getCookies(): MutableList<HttpCookie> = inner.cookies
    override fun getURIs(): MutableList<URI> = inner.urIs

    override fun remove(uri: URI?, cookie: HttpCookie): Boolean {
        val removed = inner.remove(uri, cookie)
        if (cookie.name in PERSISTED) forget(cookie.name)
        return removed
    }

    override fun removeAll(): Boolean {
        expiresAt.clear()
        uris.clear()
        secrets.put(KEY, null)
        return inner.removeAll()
    }

    /** True while a login cookie is held that has not yet expired. */
    fun hasSession(): Boolean = inner.cookies.any { it.name in PERSISTED && !it.hasExpired() }

    /**
     * Drop the login cookies here, whatever the server says.
     *
     * Logout calls the server to end the session there too, but it must not
     * depend on it: logging out on a train with no signal has to leave the phone
     * logged out.
     */
    fun clearSession() {
        /* Removed under every URI the store knows, and under none. Android's
           store files each cookie under the site it came from and only removes
           it when asked with that same key; the desktop JDK's ignores the key.
           Trying every key is correct on both. */
        val keys: List<URI?> = inner.urIs + listOf<URI?>(null)
        inner.cookies
            .filter { it.name in PERSISTED }
            .forEach { cookie -> keys.forEach { inner.remove(it, cookie) } }
        PERSISTED.forEach { forget(it) }
    }

    private fun forget(name: String) {
        expiresAt.remove(name)
        uris.remove(name)
        save()
    }

    private fun save() {
        val live = inner.cookies
            .filter { it.name in PERSISTED && !it.hasExpired() && expiresAt.containsKey(it.name) }
            .map { cookie ->
                StoredCookie(
                    name = cookie.name,
                    value = cookie.value,
                    domain = cookie.domain,
                    path = cookie.path,
                    uri = uris[cookie.name].orEmpty(),
                    expiresAtMillis = expiresAt.getValue(cookie.name),
                    secure = cookie.secure,
                    httpOnly = cookie.isHttpOnly,
                )
            }
        secrets.put(KEY, if (live.isEmpty()) null else encodeCookies(live))
    }

    private fun restore() {
        val stored = decodeCookies(secrets.get(KEY)) ?: return
        val at = now()
        stored.filter { it.expiresAtMillis > at }.forEach { saved ->
            val cookie = HttpCookie(saved.name, saved.value).apply {
                domain = saved.domain
                path = saved.path
                secure = saved.secure
                isHttpOnly = saved.httpOnly
                /* Whatever is left of the original 30 days, not a fresh 30:
                   reopening the app must not keep extending a session the
                   server has already set an end date for. */
                maxAge = (saved.expiresAtMillis - at) / 1000
                /* Plain `name=value` on the wire. HttpCookie defaults to
                   version 1, which Next's cookie parser does not read. */
                version = 0
            }
            val uri = saved.uri.takeIf { it.isNotEmpty() }?.let { runCatching { URI(it) }.getOrNull() }
            inner.add(uri, cookie)
            expiresAt[saved.name] = saved.expiresAtMillis
            uris[saved.name] = saved.uri
        }
    }

    companion object {
        /* The login cookies the backend sets. Buyers today; `yff_farmer` is
           listed now so farmer login (roadmap feature 10) is kept across
           restarts without anyone remembering to come back here. */
        val PERSISTED = setOf("yff_consumer", "yff_farmer")
        private const val KEY = "cookies"
    }
}

@Serializable
internal data class StoredCookie(
    val name: String,
    val value: String,
    val domain: String? = null,
    val path: String? = null,
    val uri: String = "",
    val expiresAtMillis: Long,
    val secure: Boolean = false,
    val httpOnly: Boolean = false,
)

private val cookieJson = Json { ignoreUnknownKeys = true }

internal fun encodeCookies(cookies: List<StoredCookie>): String = cookieJson.encodeToString(cookies)

/* Null for nothing stored or for anything that does not parse. A corrupt file
 * means "not logged in", never a crash on launch. */
internal fun decodeCookies(text: String?): List<StoredCookie>? {
    if (text.isNullOrBlank()) return null
    return try {
        cookieJson.decodeFromString<List<StoredCookie>>(text)
    } catch (e: Exception) {
        null
    }
}
