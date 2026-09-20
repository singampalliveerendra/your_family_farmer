package com.gogrameen.app.account

import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextInput
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.gogrameen.app.DEFAULT_LANG
import com.gogrameen.app.Lang
import com.gogrameen.app.ui.theme.GoGrameenTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/* The login screen, driven by the real AccountViewModel over a fake server.
 *
 * What is being protected is the flow a first-time buyer actually hits: they
 * tap Log in because that is the first button, type their number, and the
 * screen has to take them to Sign up — with the number still in — rather than
 * telling them they failed. */
@RunWith(AndroidJUnit4::class)
class LoginScreenTest {

    @get:Rule
    val compose = createComposeRule()

    private class FakeGateway(var answer: () -> Consumer) : AuthGateway {
        var logins = 0
        override suspend fun login(phone: String, password: String): Consumer { logins++; return answer() }
        override suspend fun register(name: String, phone: String, password: String) = answer()
        override suspend fun me(): MeResult = MeResult.SignedOut
        override suspend fun logout() {}
    }

    private class NoSession : SessionStore {
        override fun hasSession() = false
        override fun cachedConsumer(): Consumer? = null
        override fun save(consumer: Consumer?) {}
        override fun clear() {}
    }

    private fun show(gateway: AuthGateway): AccountViewModel {
        val vm = AccountViewModel(gateway, NoSession())
        compose.setContent {
            var lang by remember { mutableStateOf(DEFAULT_LANG) }
            val state by vm.state.collectAsState()
            GoGrameenTheme {
                LoginScreen(
                    form = state.form,
                    lang = lang,
                    onToggleLang = { lang = if (lang == Lang.EN) Lang.TE else Lang.EN },
                    onBack = {},
                    onModeChange = vm::setMode,
                    onName = vm::onName,
                    onPhone = vm::onPhone,
                    onPassword = vm::onPassword,
                    onTogglePassword = vm::togglePasswordVisible,
                    onSubmit = vm::submit,
                )
            }
        }
        return vm
    }

    @Test
    fun opensOnLogInWithNoNameField() {
        show(FakeGateway { Consumer("c1") })

        compose.onNodeWithText("Welcome back").assertIsDisplayed()
        compose.onNode(hasText("Log in") and hasClickAction() and hasTextExactlyTab()).assertIsSelected()
        compose.onNodeWithContentDescription("Your name").assertDoesNotExist()
    }

    @Test
    fun signUpAddsTheNameField() {
        show(FakeGateway { Consumer("c1") })

        compose.onNodeWithText("Sign up").performClick()

        compose.onNodeWithText("Create your account").assertIsDisplayed()
        compose.onNodeWithContentDescription("Your name").assertIsDisplayed()
    }

    @Test
    fun anEmptySubmitExplainsEachFieldAndSendsNothing() {
        val gateway = FakeGateway { Consumer("c1") }
        show(gateway)

        compose.onNode(hasText("Log in") and hasClickAction() and !hasTextExactlyTab()).performScrollTo().performClick()

        compose.onNodeWithText("Enter your phone number.").assertIsDisplayed()
        compose.onNodeWithText("Enter your password.").assertIsDisplayed()
        assertEquals(0, gateway.logins)
    }

    @Test
    fun anUnknownNumberIsTakenToSignUpWithTheNumberKept() {
        show(FakeGateway { throw AuthException(AuthFailure.NotRegistered) })

        compose.onNodeWithContentDescription("Phone number").performTextInput("9876543210")
        compose.onNodeWithContentDescription("Password").performTextInput("abc123")
        compose.onNode(hasText("Log in") and hasClickAction() and !hasTextExactlyTab()).performScrollTo().performClick()

        compose.waitUntil(3_000) {
            compose.onAllNodesWithTextCount("Create your account") > 0
        }
        compose.onNodeWithText("New number").assertIsDisplayed()
        compose.onNodeWithText("9876543210").assertExists()
    }

    @Test
    fun theWrongPasswordMessageIsShown() {
        show(FakeGateway { throw AuthException(AuthFailure.WrongCredentials) })

        compose.onNodeWithContentDescription("Phone number").performTextInput("9876543210")
        compose.onNodeWithContentDescription("Password").performTextInput("nope")
        compose.onNode(hasText("Log in") and hasClickAction() and !hasTextExactlyTab()).performScrollTo().performClick()

        compose.waitUntil(3_000) {
            compose.onAllNodesWithTextCount(
                "That phone number and password don't match. Check them and try again.",
            ) > 0
        }
    }

    @Test
    fun thePasswordCanBeShown() {
        show(FakeGateway { Consumer("c1") })

        compose.onNodeWithContentDescription("Password").performTextInput("secret1")
        compose.onNodeWithText("Show").performClick()

        compose.onNodeWithText("secret1").assertExists()
        compose.onNodeWithText("Hide").assertIsDisplayed()
    }

    @Test
    fun theWholeFormFollowsTheLanguageToggle() {
        show(FakeGateway { Consumer("c1") })

        compose.onNode(hasText("EN") and hasClickAction()).performClick()

        compose.onNodeWithText("మళ్లీ స్వాగతం").assertIsDisplayed()
        compose.onNodeWithContentDescription("ఫోన్ నంబర్").assertIsDisplayed()
    }

    /* The tab and the submit button are both "Log in". Tabs carry a selected
       state; the button does not — that is how the two are told apart. */
    private fun hasTextExactlyTab() = androidx.compose.ui.test.SemanticsMatcher.keyIsDefined(
        androidx.compose.ui.semantics.SemanticsProperties.Selected,
    )

    private fun androidx.compose.ui.test.junit4.ComposeContentTestRule.onAllNodesWithTextCount(text: String) =
        onAllNodes(hasText(text)).fetchSemanticsNodes().size
}
