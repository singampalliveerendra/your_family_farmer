package com.gogrameen.app.account

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.gogrameen.app.Lang
import com.gogrameen.app.net.Http
import com.gogrameen.app.net.SecretStore
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/* Who is logged in, and the form that logs them in.
 *
 * Activity-scoped, like the catalogue, because being logged in is app-wide:
 * the header on every screen shows it, and cart and checkout will ask it. */

sealed interface Session {
    /** Launch, before the saved session has been looked at. A frame, at most. */
    data object Checking : Session
    data object SignedOut : Session
    data class SignedIn(val consumer: Consumer) : Session
}

enum class AuthMode { LogIn, SignUp }

/* A sentence that is not an error: the form moved the person to the other tab
 * because of what the server said, and has to say why or the move looks like a
 * glitch. */
enum class AuthHint { NoAccountYet, AlreadyHasAccount }

data class AuthForm(
    val mode: AuthMode = AuthMode.LogIn,
    val name: String = "",
    val phone: String = "",
    val password: String = "",
    val passwordVisible: Boolean = false,
    val submitting: Boolean = false,
    /* Field errors are not shown until the first submit. Being told "enter
       your phone number" while you are still reaching for the box is noise;
       after one failed submit, correcting the field live is what helps. */
    val showFieldErrors: Boolean = false,
    val failure: AuthFailure? = null,
    val hint: AuthHint? = null,
) {
    /* Worked out on render, in the current language, rather than stored: flip
       the language toggle with an error showing and the error flips too. */
    fun fieldErrors(lang: Lang): FieldErrors = when {
        !showFieldErrors -> FieldErrors()
        mode == AuthMode.LogIn -> validateLogin(phone, password, lang)
        else -> validateSignUp(name, phone, password, lang)
    }
}

data class AccountUiState(
    val session: Session = Session.Checking,
    val form: AuthForm = AuthForm(),
    /* Set when the server says, on launch, that this account was suspended
       while the person was away. They are logged out, and told why — per the
       client, the moderator's reason is shown. */
    val suspendedReason: String? = null,
    val suspendedNotice: Boolean = false,
) {
    val signedInName: String?
        get() = (session as? Session.SignedIn)?.consumer?.name?.takeIf { it.isNotBlank() }
            ?: (session as? Session.SignedIn)?.consumer?.phone
}

sealed interface AccountEvent {
    /** Logged in or signed up. `firstName` greets them; `isNew` picks the words. */
    data class Welcome(val firstName: String?, val isNew: Boolean) : AccountEvent
    data object LoggedOut : AccountEvent
}

/* The saved session, behind an interface for the same reason AuthGateway is:
 * the tests run without a Keystore. */
interface SessionStore {
    fun hasSession(): Boolean
    fun cachedConsumer(): Consumer?
    fun save(consumer: Consumer?)
    fun clear()
}

/* The real one. The cookie is Http's; the name and phone it belongs to are kept
 * beside it, encrypted, so the header can greet the person on the very first
 * frame instead of waiting on /api/consumer/me over 4G — and so a phone that
 * opens with no signal still shows them as logged in, which they are. */
class DeviceSessionStore(private val secrets: SecretStore) : SessionStore {
    private val json = Json { ignoreUnknownKeys = true }

    override fun hasSession(): Boolean = Http.hasSession()

    override fun cachedConsumer(): Consumer? = try {
        secrets.get(KEY)?.let { json.decodeFromString(Consumer.serializer(), it) }
    } catch (e: Exception) {
        null
    }

    override fun save(consumer: Consumer?) {
        secrets.put(KEY, consumer?.let { json.encodeToString(it) })
    }

    override fun clear() {
        Http.clearSession()
        secrets.put(KEY, null)
    }

    private companion object {
        const val KEY = "consumer"
    }
}

class AccountViewModel(
    private val gateway: AuthGateway,
    private val sessions: SessionStore,
) : ViewModel() {

    private val _state = MutableStateFlow(AccountUiState())
    val state: StateFlow<AccountUiState> = _state.asStateFlow()

    /* One-shot things the screen acts on once — navigate back, show a
       snackbar. A Channel rather than a field in the state so a rotation does
       not replay "Welcome back" a second time. */
    private val _events = Channel<AccountEvent>(Channel.BUFFERED)
    val events: Flow<AccountEvent> = _events.receiveAsFlow()

    private var started = false

    /**
     * Read the saved session, and check it with the server in the background.
     *
     * Called once, from MainActivity. Idempotent.
     */
    fun start() {
        if (started) return
        started = true

        if (!sessions.hasSession()) {
            // An old profile with no cookie behind it is a leftover — drop it.
            sessions.save(null)
            _state.update { it.copy(session = Session.SignedOut) }
            return
        }

        /* Show them as logged in straight away from the cached profile, then
           confirm. The confirmation can only take the session away (expired,
           deleted, suspended), so painting it first costs nothing and saves a
           spinner in the header on every launch. */
        val cached = sessions.cachedConsumer()
        _state.update { it.copy(session = cached?.let(Session::SignedIn) ?: Session.Checking) }

        viewModelScope.launch {
            val result = try {
                gateway.me()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                /* No signal, or the server hiccupped. Neither says the session
                   is over, so keep what the phone knows. Without a cached
                   profile there is nothing to greet them with, so show the
                   logged-out header — but keep the cookie; the next launch
                   tries again. */
                _state.update { if (it.session == Session.Checking) it.copy(session = Session.SignedOut) else it }
                return@launch
            }
            when (result) {
                is MeResult.SignedIn -> {
                    sessions.save(result.consumer)
                    _state.update { it.copy(session = Session.SignedIn(result.consumer)) }
                }
                MeResult.SignedOut -> {
                    sessions.clear()
                    _state.update { it.copy(session = Session.SignedOut) }
                }
                is MeResult.Suspended -> {
                    sessions.clear()
                    _state.update {
                        it.copy(
                            session = Session.SignedOut,
                            suspendedReason = result.reason,
                            suspendedNotice = true,
                        )
                    }
                }
            }
        }
    }

    fun setMode(mode: AuthMode) = updateForm {
        if (it.mode == mode) it else it.copy(mode = mode, failure = null, hint = null, showFieldErrors = false)
    }

    fun onName(value: String) = updateForm { it.copy(name = value.take(NAME_MAX)) }

    fun onPhone(value: String) = updateForm { it.copy(phone = cleanPhoneInput(value)) }

    fun onPassword(value: String) = updateForm { it.copy(password = value.take(PASSWORD_MAX)) }

    fun togglePasswordVisible() = updateForm { it.copy(passwordVisible = !it.passwordVisible) }

    /** Opening the login screen fresh: no leftover error from last time. */
    fun resetForm(mode: AuthMode = AuthMode.LogIn) {
        _state.update { it.copy(form = AuthForm(mode = mode, phone = it.form.phone)) }
    }

    fun submit() {
        val form = _state.value.form
        if (form.submitting) return

        /* Any language will do here — only whether there ARE errors matters.
           The words shown are recomputed on render in the right language. */
        val errors = if (form.mode == AuthMode.LogIn) {
            validateLogin(form.phone, form.password, Lang.EN)
        } else {
            validateSignUp(form.name, form.phone, form.password, Lang.EN)
        }
        if (!errors.isEmpty) {
            updateForm { it.copy(showFieldErrors = true, failure = null) }
            return
        }

        updateForm { it.copy(submitting = true, failure = null, showFieldErrors = true) }
        val phone = normalizePhone(form.phone)

        viewModelScope.launch {
            try {
                val consumer = if (form.mode == AuthMode.LogIn) {
                    gateway.login(phone, form.password)
                } else {
                    gateway.register(form.name.trim(), phone, form.password)
                }
                sessions.save(consumer)
                _state.update {
                    it.copy(
                        session = Session.SignedIn(consumer),
                        // Keep the phone for next time; never keep a password.
                        form = AuthForm(mode = AuthMode.LogIn, phone = form.phone),
                        suspendedNotice = false,
                        suspendedReason = null,
                    )
                }
                _events.send(AccountEvent.Welcome(firstName(consumer.name), isNew = form.mode == AuthMode.SignUp))
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                onFailure(failureOf(e))
            }
        }
    }

    private fun onFailure(failure: AuthFailure) = updateForm { form ->
        when {
            /* Logging in with a number that has no account: the fix is to sign
               up, so take them there with the phone already filled in instead
               of making them find the tab. */
            failure == AuthFailure.NotRegistered && form.mode == AuthMode.LogIn ->
                form.copy(
                    mode = AuthMode.SignUp,
                    submitting = false,
                    failure = null,
                    hint = AuthHint.NoAccountYet,
                    // Their login password may be too short to sign up with;
                    // let them see the rule before they are told off for it.
                    showFieldErrors = false,
                )

            // The mirror image: signing up with a number that already has one.
            failure == AuthFailure.AlreadyRegistered && form.mode == AuthMode.SignUp ->
                form.copy(
                    mode = AuthMode.LogIn,
                    submitting = false,
                    failure = null,
                    hint = AuthHint.AlreadyHasAccount,
                    password = "",
                    showFieldErrors = false,
                )

            else -> form.copy(submitting = false, failure = failure, hint = null)
        }
    }

    /**
     * Log out. The phone is logged out immediately and unconditionally; the
     * server is told as well, but whether that lands does not matter.
     */
    fun logout() {
        /* Local first, and synchronously. Waiting on the server would leave the
           cookie in the jar — and being sent — for up to the 20-second read
           timeout on a bad connection, on a screen that already says "logged
           out". */
        sessions.clear()
        _state.update { it.copy(session = Session.SignedOut, form = AuthForm(phone = it.form.phone)) }
        viewModelScope.launch {
            _events.send(AccountEvent.LoggedOut)
            gateway.logout()
        }
    }

    fun dismissSuspended() = _state.update { it.copy(suspendedNotice = false) }

    private inline fun updateForm(crossinline change: (AuthForm) -> AuthForm) =
        _state.update { it.copy(form = change(it.form)) }
}

/* "Ravi Kumar" → "Ravi". Greeting someone by first name is warmer and fits the
 * snackbar; a name with no spaces comes back whole. */
internal fun firstName(name: String?): String? =
    name?.trim()?.split(Regex("\\s+"))?.firstOrNull()?.takeIf { it.isNotEmpty() }
