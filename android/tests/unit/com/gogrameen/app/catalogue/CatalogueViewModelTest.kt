package com.gogrameen.app.catalogue

import com.gogrameen.app.net.ApiException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.io.IOException

/* The catalogue's behaviour, tested on the JVM in milliseconds.
 *
 * The fetch is injected, so none of this touches a network or a device — which
 * matters most for the two things that are genuinely hard to check by hand:
 * that typing does not fire a request per character, and that a slow reply to
 * an abandoned search cannot overwrite a newer one. Both are invisible when
 * they work and look like random wrong results when they do not. */
@OptIn(ExperimentalCoroutinesApi::class)
class CatalogueViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    @Before fun setUp() = Dispatchers.setMain(dispatcher)
    @After fun tearDown() = Dispatchers.resetMain()

    private fun listing(id: String) = Listing(id = id, name = id)

    /** Records every call so the tests can assert how many were made. */
    private class Recorder(private val answer: (String) -> List<Listing>) {
        val queries = mutableListOf<String>()
        val calls get() = queries.size
        suspend fun fetch(q: String, m: MethodFilter, c: CategoryFilter): List<Listing> {
            queries += q
            return answer(q)
        }
    }

    // ── loading ────────────────────────────────────────────────────────────

    @Test
    fun `nothing is fetched until the screen asks`() = runTest {
        // The ViewModel is activity-scoped, so an init-block fetch would spend
        // a rural data plan the moment the app opened -- before anyone had
        // asked to see the catalogue.
        val recorder = Recorder { listOf(listing("a")) }
        val vm = CatalogueViewModel(recorder::fetch)

        advanceUntilIdle()
        assertEquals(0, recorder.calls)

        vm.ensureLoaded()
        advanceUntilIdle()
        assertEquals(1, recorder.calls)
    }

    @Test
    fun `coming back from a product does not refetch`() = runTest {
        val recorder = Recorder { listOf(listing("a")) }
        val vm = CatalogueViewModel(recorder::fetch)

        vm.ensureLoaded()
        advanceUntilIdle()
        vm.ensureLoaded()
        advanceUntilIdle()

        assertEquals(1, recorder.calls)
    }

    // ── debounce ───────────────────────────────────────────────────────────

    @Test
    fun `typing a word fires one request, not one per letter`() = runTest {
        // Six requests to spell "tomato" is what kills a rural 4G connection.
        val recorder = Recorder { listOf(listing("a")) }
        val vm = CatalogueViewModel(recorder::fetch)
        vm.ensureLoaded()
        advanceUntilIdle()

        for (typed in listOf("t", "to", "tom", "toma", "tomat", "tomato")) {
            vm.onQueryChange(typed)
            advanceTimeBy(60)
        }
        advanceUntilIdle()

        assertEquals(2, recorder.calls)                 // the first load, then one search
        assertEquals("tomato", recorder.queries.last()) // and it searched the whole word
    }

    @Test
    fun `the text appears immediately even though the request waits`() = runTest {
        // A box that lags behind the keyboard feels broken no matter how well
        // the network is being looked after.
        val vm = CatalogueViewModel(Recorder { emptyList() }::fetch)

        vm.onQueryChange("tom")
        assertEquals("tom", vm.state.value.query)
        advanceUntilIdle()
    }

    @Test
    fun `pausing between words searches twice`() = runTest {
        // The debounce must not swallow a real second search.
        val recorder = Recorder { listOf(listing("a")) }
        val vm = CatalogueViewModel(recorder::fetch)
        vm.ensureLoaded()
        advanceUntilIdle()

        vm.onQueryChange("rice")
        advanceUntilIdle()
        vm.onQueryChange("mango")
        advanceUntilIdle()

        assertEquals(listOf("", "rice", "mango"), recorder.queries)
    }

    @Test
    fun `a slow reply to an abandoned search cannot overwrite a newer one`() = runTest {
        // The bug this prevents: "tom" is slow, "tomato" is fast, the reply for
        // "tom" lands last and the buyer sees results for a word they finished
        // typing seconds ago.
        val slow = CompletableDeferred<List<Listing>>()
        val vm = CatalogueViewModel { q, _, _ ->
            if (q == "tom") slow.await() else listOf(listing(q))
        }

        vm.onQueryChange("tom")
        advanceUntilIdle()
        vm.onQueryChange("tomato")
        advanceUntilIdle()

        slow.complete(listOf(listing("STALE")))
        advanceUntilIdle()

        val shown = (vm.state.value.content as CatalogueState.Ready).listings
        assertEquals(listOf("tomato"), shown.map { it.id })
    }

    // ── filters ────────────────────────────────────────────────────────────

    @Test
    fun `a chip searches straight away with no debounce`() = runTest {
        // It is a tap, not typing: there is no next keystroke to wait for.
        val recorder = Recorder { listOf(listing("a")) }
        val vm = CatalogueViewModel(recorder::fetch)
        vm.ensureLoaded()
        advanceUntilIdle()

        vm.onCategoryChange(CategoryFilter.Spices)
        advanceTimeBy(10)
        advanceUntilIdle()

        assertEquals(2, recorder.calls)
        assertEquals(CategoryFilter.Spices, vm.state.value.category)
    }

    @Test
    fun `re-tapping the chip already selected does nothing`() = runTest {
        val recorder = Recorder { listOf(listing("a")) }
        val vm = CatalogueViewModel(recorder::fetch)
        vm.ensureLoaded()
        advanceUntilIdle()

        vm.onCategoryChange(CategoryFilter.All)
        vm.onMethodChange(MethodFilter.All)
        advanceUntilIdle()

        assertEquals(1, recorder.calls)
    }

    @Test
    fun `clearing resets the box and both chips together`() = runTest {
        val vm = CatalogueViewModel { _, _, _ -> emptyList() }
        vm.onQueryChange("rice")
        vm.onMethodChange(MethodFilter.Organic)
        vm.onCategoryChange(CategoryFilter.Grains)
        advanceUntilIdle()

        vm.clearFilters()
        advanceUntilIdle()

        val state = vm.state.value
        assertEquals("", state.query)
        assertEquals(MethodFilter.All, state.method)
        assertEquals(CategoryFilter.All, state.category)
        assertFalse(state.isNarrowed)
    }

    @Test
    fun `clearing when nothing is set does not fire a request`() = runTest {
        val recorder = Recorder { listOf(listing("a")) }
        val vm = CatalogueViewModel(recorder::fetch)
        vm.ensureLoaded()
        advanceUntilIdle()

        vm.clearFilters()
        advanceUntilIdle()

        assertEquals(1, recorder.calls)
    }

    @Test
    fun `isNarrowed is what tells the two empty screens apart`() = runTest {
        // "You filtered everything out" is one tap from being undone.
        // "Nothing is listed today" is not, and must not offer a retry.
        val vm = CatalogueViewModel { _, _, _ -> emptyList() }
        vm.ensureLoaded()
        advanceUntilIdle()
        assertFalse(vm.state.value.isNarrowed)

        vm.onQueryChange("   ")
        advanceUntilIdle()
        assertFalse("whitespace is not a search", vm.state.value.isNarrowed)

        vm.onQueryChange("rice")
        advanceUntilIdle()
        assertTrue(vm.state.value.isNarrowed)
    }

    // ── refresh and failure ────────────────────────────────────────────────

    @Test
    fun `refresh keeps the current query and chips`() = runTest {
        // Pulling down must reload what is on screen, not reset to everything.
        val recorder = Recorder { listOf(listing("a")) }
        val vm = CatalogueViewModel(recorder::fetch)
        vm.onQueryChange("rice")
        advanceUntilIdle()

        vm.refresh()
        advanceUntilIdle()

        assertEquals("rice", recorder.queries.last())
        assertEquals("rice", vm.state.value.query)
    }

    @Test
    fun `a reload happens underneath results instead of blanking them`() = runTest {
        // Replacing the grid with a spinner on every keystroke makes the screen
        // flash. With results already up, the reload shows as refreshing.
        val gate = CompletableDeferred<List<Listing>>()
        var first = true
        val vm = CatalogueViewModel { _, _, _ ->
            if (first) { first = false; listOf(listing("a")) } else gate.await()
        }
        vm.ensureLoaded()
        advanceUntilIdle()

        vm.refresh()
        advanceUntilIdle()

        assertTrue(vm.state.value.refreshing)
        assertTrue(vm.state.value.content is CatalogueState.Ready)

        gate.complete(listOf(listing("b")))
        advanceUntilIdle()
        assertFalse(vm.state.value.refreshing)
    }

    @Test
    fun `no signal is reported as offline`() = runTest {
        val vm = CatalogueViewModel { _, _, _ -> throw IOException("no route to host") }
        vm.ensureLoaded()
        advanceUntilIdle()

        assertEquals(CatalogueState.Failed(offline = true), vm.state.value.content)
    }

    @Test
    fun `a server error is not reported as offline`() = runTest {
        // Telling someone to check a connection that is working sends them to
        // toggle aeroplane mode for nothing.
        val vm = CatalogueViewModel { _, _, _ -> throw ApiException(500, "boom") }
        vm.ensureLoaded()
        advanceUntilIdle()

        assertEquals(CatalogueState.Failed(offline = false), vm.state.value.content)
    }

    @Test
    fun `retry only fires after a failure`() = runTest {
        var attempt = 0
        val vm = CatalogueViewModel { _, _, _ ->
            attempt++
            if (attempt == 1) throw IOException("dropped") else listOf(listing("a"))
        }
        vm.ensureLoaded()
        advanceUntilIdle()
        assertTrue(vm.state.value.content is CatalogueState.Failed)

        vm.retry()
        advanceUntilIdle()
        assertTrue(vm.state.value.content is CatalogueState.Ready)

        // Now that it has succeeded, retry is a no-op rather than a reload.
        vm.retry()
        advanceUntilIdle()
        assertEquals(2, attempt)
    }
}
