package com.gogrameen.app.account

import com.gogrameen.app.Lang
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/* The login screen's behaviour, tested on the JVM with a fake server.
 *
 * The parts worth pinning are the ones a person would only find by accident:
 * that a number with no account lands them on Sign up with the number already
 * in; that a double-tap on a slow connection does not log in twice; that
 * logging out works with no signal; and that a saved session is shown straight
 * away and only ever taken away by the server, never by a dropped connection. */
@OptIn(ExperimentalCoroutinesApi::class)
class AccountViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    @Before fun setUp() = Dispatchers.setMain(dispatcher)
    @After fun tearDown() = Dispatchers.resetMain()

    private val lakshmi = Consumer("c1", "Lakshmi Devi", "9876543210")

    private class FakeGateway : AuthGateway {
        var loginAnswer: suspend () -> Consumer = { error("not set") }
        var registerAnswer: suspend () -> Consumer = { error("not set") }
        var meAnswer: suspend () -> MeResult = { MeResult.SignedOut }
        val logins = mutableListOf<Pair<String, String>>()
        val registrations = mutableListOf<Triple<String, String, String>>()
        var logouts = 0

        override suspend fun login(phone: String, password: String): Consumer {
            logins += phone to password
            return loginAnswer()
        }

        override suspend fun register(name: String, phone: String, password: String): Consumer {
            registrations += Triple(name, phone, password)
            return registerAnswer()
        }

        override suspend fun me(): MeResult = meAnswer()

        override suspend fun logout() {
            logouts++
        }
    }

    private class FakeSessions(var cookie: Boolean = false, var profile: Consumer? = null) : SessionStore {
        var cleared = 0
        override fun hasSession() = cookie
        override fun cachedConsumer() = profile
        override fun save(consumer: Consumer?) {
            profile = consumer
        }
        override fun clear() {
            cleared++
            cookie = false
            profile = null
        }
    }

    private fun fail(failure: AuthFailure): suspend () -> Consumer = { throw AuthException(failure) }

    private fun AccountViewModel.fill(phone: String, password: String, name: String = "") {
        onName(name)
        onPhone(phone)
        onPassword(password)
    }

    // ── launch ─────────────────────────────────────────────────────────────

    @Test
    fun `no saved cookie means logged out, without asking the server`() = runTest {
        val gateway = FakeGateway()
        var asked = false
        gateway.meAnswer = { asked = true; MeResult.SignedOut }
        val vm = AccountViewModel(gateway, FakeSessions(cookie = false))

        vm.start()
        advanceUntilIdle()

        assertEquals(Session.SignedOut, vm.state.value.session)
        assertFalse("a data plan was spent on a question with a known answer", asked)
    }

    @Test
    fun `a saved session shows as logged in on the first frame`() = runTest {
        // Before /me answers -- the header greets them immediately instead of
        // flashing a login button for half a second on every launch.
        val gateway = FakeGateway()
        val slow = CompletableDeferred<MeResult>()
        gateway.meAnswer = { slow.await() }
        val vm = AccountViewModel(gateway, FakeSessions(cookie = true, profile = lakshmi))

        vm.start()
        assertEquals(Session.SignedIn(lakshmi), vm.state.value.session)
        assertEquals("Lakshmi Devi", vm.state.value.signedInName)
    }

    @Test
    fun `the server can end a saved session`() = runTest {
        val gateway = FakeGateway().apply { meAnswer = { MeResult.SignedOut } }
        val sessions = FakeSessions(cookie = true, profile = lakshmi)
        val vm = AccountViewModel(gateway, sessions)

        vm.start()
        advanceUntilIdle()

        assertEquals(Session.SignedOut, vm.state.value.session)
        assertEquals(1, sessions.cleared)
    }

    @Test
    fun `no signal on launch does not log anyone out`() = runTest {
        // Opening the app in a field with one bar must not throw away a
        // 30-day login. Only the server saying so can end it.
        val gateway = FakeGateway().apply { meAnswer = { throw AuthException(AuthFailure.Offline) } }
        val sessions = FakeSessions(cookie = true, profile = lakshmi)
        val vm = AccountViewModel(gateway, sessions)

        vm.start()
        advanceUntilIdle()

        assertEquals(Session.SignedIn(lakshmi), vm.state.value.session)
        assertEquals(0, sessions.cleared)
    }

    @Test
    fun `a suspension found on launch logs out and explains why`() = runTest {
        val gateway = FakeGateway().apply { meAnswer = { MeResult.Suspended("Fake orders") } }
        val vm = AccountViewModel(gateway, FakeSessions(cookie = true, profile = lakshmi))

        vm.start()
        advanceUntilIdle()

        assertEquals(Session.SignedOut, vm.state.value.session)
        assertTrue(vm.state.value.suspendedNotice)
        assertEquals("Fake orders", vm.state.value.suspendedReason)

        vm.dismissSuspended()
        assertFalse(vm.state.value.suspendedNotice)
    }

    @Test
    fun `me refreshes a stale cached name`() = runTest {
        val renamed = lakshmi.copy(name = "Lakshmi D.")
        val gateway = FakeGateway().apply { meAnswer = { MeResult.SignedIn(renamed) } }
        val sessions = FakeSessions(cookie = true, profile = lakshmi)
        val vm = AccountViewModel(gateway, sessions)

        vm.start()
        advanceUntilIdle()

        assertEquals(Session.SignedIn(renamed), vm.state.value.session)
        assertEquals(renamed, sessions.profile)
    }

    // ── logging in ─────────────────────────────────────────────────────────

    @Test
    fun `a good login signs in, saves the profile, and says welcome`() = runTest {
        val gateway = FakeGateway().apply { loginAnswer = { lakshmi } }
        val sessions = FakeSessions()
        val vm = AccountViewModel(gateway, sessions)

        vm.fill("+91 98765 43210", "secret1")
        vm.submit()
        advanceUntilIdle()

        // The server gets the same ten digits it will look up.
        assertEquals(listOf("9876543210" to "secret1"), gateway.logins)
        assertEquals(Session.SignedIn(lakshmi), vm.state.value.session)
        assertEquals(lakshmi, sessions.profile)
        assertEquals(AccountEvent.Welcome("Lakshmi", isNew = false), vm.events.first())
    }

    @Test
    fun `the password is not kept after a login, the phone is`() = runTest {
        val gateway = FakeGateway().apply { loginAnswer = { lakshmi } }
        val vm = AccountViewModel(gateway, FakeSessions())

        vm.fill("9876543210", "secret1")
        vm.submit()
        advanceUntilIdle()

        assertEquals("", vm.state.value.form.password)
        assertEquals("9876543210", vm.state.value.form.phone)
    }

    @Test
    fun `an incomplete form is not sent, and says why`() = runTest {
        val gateway = FakeGateway()
        val vm = AccountViewModel(gateway, FakeSessions())

        vm.fill("98765", "")
        vm.submit()
        advanceUntilIdle()

        assertTrue(gateway.logins.isEmpty())
        val errors = vm.state.value.form.fieldErrors(Lang.EN)
        assertEquals("Enter a 10-digit mobile number.", errors.phone)
        assertEquals("Enter your password.", errors.password)
    }

    @Test
    fun `field errors wait for the first submit`() {
        // "Enter your phone number" while someone is still reaching for the
        // box is nagging, not help.
        val vm = AccountViewModel(FakeGateway(), FakeSessions())
        vm.fill("98", "")
        assertTrue(vm.state.value.form.fieldErrors(Lang.EN).isEmpty)
    }

    @Test
    fun `a double tap on a slow connection logs in once`() = runTest {
        val gateway = FakeGateway()
        val slow = CompletableDeferred<Consumer>()
        gateway.loginAnswer = { slow.await() }
        val vm = AccountViewModel(gateway, FakeSessions())

        vm.fill("9876543210", "secret1")
        vm.submit()
        advanceUntilIdle()
        assertTrue(vm.state.value.form.submitting)
        vm.submit()
        vm.submit()
        slow.complete(lakshmi)
        advanceUntilIdle()

        assertEquals(1, gateway.logins.size)
    }

    @Test
    fun `a number with no account moves to sign up with the number kept`() = runTest {
        val gateway = FakeGateway().apply { loginAnswer = fail(AuthFailure.NotRegistered) }
        val vm = AccountViewModel(gateway, FakeSessions())

        vm.fill("9876543210", "abc")
        vm.submit()
        advanceUntilIdle()

        val form = vm.state.value.form
        assertEquals(AuthMode.SignUp, form.mode)
        assertEquals("9876543210", form.phone)
        assertEquals(AuthHint.NoAccountYet, form.hint)
        // Not an error -- nothing went wrong, they just have not signed up.
        assertNull(form.failure)
        assertFalse(form.submitting)
    }

    @Test
    fun `signing up with a taken number moves to log in`() = runTest {
        val gateway = FakeGateway().apply { registerAnswer = fail(AuthFailure.AlreadyRegistered) }
        val vm = AccountViewModel(gateway, FakeSessions())

        vm.setMode(AuthMode.SignUp)
        vm.fill("9876543210", "secret1", name = "Lakshmi")
        vm.submit()
        advanceUntilIdle()

        val form = vm.state.value.form
        assertEquals(AuthMode.LogIn, form.mode)
        assertEquals(AuthHint.AlreadyHasAccount, form.hint)
        assertEquals("9876543210", form.phone)
        // The sign-up password is not their login password. Clear it rather
        // than submit the wrong one on the next tap.
        assertEquals("", form.password)
    }

    @Test
    fun `a wrong password stays on log in and says so`() = runTest {
        val gateway = FakeGateway().apply { loginAnswer = fail(AuthFailure.WrongCredentials) }
        val vm = AccountViewModel(gateway, FakeSessions())

        vm.fill("9876543210", "wrong")
        vm.submit()
        advanceUntilIdle()

        assertEquals(AuthMode.LogIn, vm.state.value.form.mode)
        assertEquals(AuthFailure.WrongCredentials, vm.state.value.form.failure)
        // Kept, so a one-character typo is a one-character fix.
        assertEquals("wrong", vm.state.value.form.password)
    }

    @Test
    fun `a suspended account is refused with the reason`() = runTest {
        val gateway = FakeGateway().apply { loginAnswer = fail(AuthFailure.Suspended("Fake orders")) }
        val vm = AccountViewModel(gateway, FakeSessions())

        vm.fill("9876543210", "secret1")
        vm.submit()
        advanceUntilIdle()

        assertEquals(AuthFailure.Suspended("Fake orders"), vm.state.value.form.failure)
    }

    @Test
    fun `switching tabs clears the last error`() = runTest {
        val gateway = FakeGateway().apply { loginAnswer = fail(AuthFailure.WrongCredentials) }
        val vm = AccountViewModel(gateway, FakeSessions())
        vm.fill("9876543210", "wrong")
        vm.submit()
        advanceUntilIdle()

        vm.setMode(AuthMode.SignUp)

        assertNull(vm.state.value.form.failure)
        assertFalse(vm.state.value.form.showFieldErrors)
    }

    // ── signing up ─────────────────────────────────────────────────────────

    @Test
    fun `sign-up sends a trimmed name and greets a new customer`() = runTest {
        val gateway = FakeGateway().apply { registerAnswer = { lakshmi } }
        val vm = AccountViewModel(gateway, FakeSessions())

        vm.setMode(AuthMode.SignUp)
        vm.fill("98765 43210", "secret1", name = "  Lakshmi Devi ")
        vm.submit()
        advanceUntilIdle()

        assertEquals(listOf(Triple("Lakshmi Devi", "9876543210", "secret1")), gateway.registrations)
        assertEquals(AccountEvent.Welcome("Lakshmi", isNew = true), vm.events.first())
    }

    @Test
    fun `sign-up refuses a five-character password before sending it`() = runTest {
        val gateway = FakeGateway()
        val vm = AccountViewModel(gateway, FakeSessions())

        vm.setMode(AuthMode.SignUp)
        vm.fill("9876543210", "12345", name = "Lakshmi")
        vm.submit()
        advanceUntilIdle()

        assertTrue(gateway.registrations.isEmpty())
    }

    // ── logging out ────────────────────────────────────────────────────────

    @Test
    fun `logout clears the phone at once, even before the server answers`() = runTest {
        val gateway = FakeGateway().apply { meAnswer = { MeResult.SignedIn(lakshmi) } }
        val sessions = FakeSessions(cookie = true, profile = lakshmi)
        val vm = AccountViewModel(gateway, sessions)
        vm.start()
        advanceUntilIdle()

        vm.logout()

        // Synchronous: no coroutine has run yet.
        assertEquals(Session.SignedOut, vm.state.value.session)
        assertEquals(1, sessions.cleared)

        advanceUntilIdle()
        assertEquals(1, gateway.logouts)
        assertEquals(AccountEvent.LoggedOut, vm.events.first())
    }

    // ── phone box ──────────────────────────────────────────────────────────

    @Test
    fun `the phone box keeps digits only, at most ten`() {
        val vm = AccountViewModel(FakeGateway(), FakeSessions())
        vm.onPhone("98765abc43210999")
        assertEquals("6543210999", vm.state.value.form.phone)
        vm.onPhone("+91 98765 43210")
        assertEquals("9876543210", vm.state.value.form.phone)
    }
}
