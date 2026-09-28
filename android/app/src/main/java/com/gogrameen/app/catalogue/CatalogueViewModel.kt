package com.gogrameen.app.catalogue

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.gogrameen.app.net.ApiException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.io.IOException

/* What the catalogue is showing.
 *
 * Four states, not two. "Loading" and "a list" are the happy path, but the two
 * that matter for this audience are the other ones: a phone on rural 4G fails
 * the request often enough that a silent empty grid would be read as "the
 * farmers have nothing", and an empty catalogue is a real, different answer
 * that deserves its own words. */
sealed interface CatalogueState {
    data object Loading : CatalogueState
    data class Ready(val listings: List<Listing>) : CatalogueState
    data class Failed(val offline: Boolean) : CatalogueState
}

/**
 * The whole screen, in one value.
 *
 * The search text and the two chips live here rather than in the composable
 * because they are inputs to the request, not decoration: losing them on a
 * rotation would silently re-run a different search than the one on screen.
 */
data class CatalogueUiState(
    val query: String = "",
    val method: MethodFilter = MethodFilter.All,
    val category: CategoryFilter = CategoryFilter.All,
    val content: CatalogueState = CatalogueState.Loading,
    /** A reload underneath results that are already on screen. */
    val refreshing: Boolean = false,
) {
    /* Whether the buyer has narrowed anything. An empty result means two very
       different things either side of this: "you have filtered everything out"
       is recoverable by clearing a chip, "nothing is listed today" is not. */
    val isNarrowed: Boolean
        get() = query.isNotBlank() || method != MethodFilter.All || category != CategoryFilter.All
}

class CatalogueViewModel(
    /* Injected so the whole of this class can be tested on the JVM in
       milliseconds. The default is the real call, so nothing at the call site
       has to know. */
    private val fetch: suspend (String, MethodFilter, CategoryFilter) -> List<Listing> =
        ProduceApi::search,
) : ViewModel() {

    private val _state = MutableStateFlow(CatalogueUiState())
    val state: StateFlow<CatalogueUiState> = _state.asStateFlow()

    private var started = false
    private var inFlight: Job? = null

    /* Called by the screen when it appears, not from init.
     *
     * The ViewModel is scoped to the activity so the list survives a trip into
     * a product and back, which means an init-block fetch would hit the network
     * the moment the app opened — before anyone had asked for the catalogue, on
     * a data plan, for someone who may only have wanted the phone number.
     * Idempotent, so returning from a product does not refetch. */
    fun ensureLoaded() {
        if (started) return
        started = true
        load()
    }

    /**
     * The search box changed.
     *
     * The text is applied immediately so typing never lags, but the request
     * waits [DEBOUNCE_MS] after the last keystroke. Firing per character would
     * put six requests on a rural 4G connection to spell "tomato", and the
     * earlier ones would still be arriving — out of order — after the last.
     * Each new keystroke cancels the previous pending request outright.
     */
    fun onQueryChange(query: String) {
        _state.update { it.copy(query = query) }
        load(debounce = true)
    }

    /* A tap, not typing: there is no next keystroke to wait for, so a chip
       fires straight away. */
    fun onMethodChange(method: MethodFilter) {
        if (_state.value.method == method) return
        _state.update { it.copy(method = method) }
        load()
    }

    fun onCategoryChange(category: CategoryFilter) {
        if (_state.value.category == category) return
        _state.update { it.copy(category = category) }
        load()
    }

    /** Clears the box and both chips, and reloads the full catalogue. */
    fun clearFilters() {
        if (!_state.value.isNarrowed) return
        _state.update {
            it.copy(query = "", method = MethodFilter.All, category = CategoryFilter.All)
        }
        load()
    }

    /** Pull-to-refresh. Keeps the current query and chips. */
    fun refresh() = load()

    fun retry() {
        if (_state.value.content is CatalogueState.Failed) load()
    }

    private fun load(debounce: Boolean = false) {
        /* Whatever was already on its way is now answering a question nobody is
           asking. Cancelling rather than letting it land is what stops a slow
           reply for "tom" overwriting a fast one for "tomato". */
        inFlight?.cancel()

        /* A full-screen spinner only when there is nothing to look at. With
           results already on screen the reload happens underneath them, so the
           grid does not blink on every keystroke or chip tap. */
        val hasResults = _state.value.content is CatalogueState.Ready
        _state.update {
            it.copy(
                content = if (hasResults) it.content else CatalogueState.Loading,
                refreshing = hasResults,
            )
        }

        inFlight = viewModelScope.launch {
            if (debounce) delay(DEBOUNCE_MS)
            val current = _state.value
            val next = try {
                CatalogueState.Ready(fetch(current.query, current.method, current.category))
            } catch (e: CancellationException) {
                /* MUST come first and MUST rethrow. Cancelling a coroutine
                   throws this inside it, and it is an ordinary Exception — so
                   the catch-all below would swallow it and paint an error
                   screen every single time someone typed another character.
                   Rethrowing also skips the state write at the end, leaving the
                   result to whichever request is still wanted. */
                throw e
            } catch (e: IOException) {
                // No signal, DNS, a dropped connection, a timeout. The phone
                // never reached the server, so the screen may say so.
                CatalogueState.Failed(offline = true)
            } catch (e: ApiException) {
                // The server answered, and answered badly. Deliberately NOT
                // reported as offline: telling someone to check a connection
                // that is working sends them to toggle aeroplane mode for
                // nothing.
                CatalogueState.Failed(offline = false)
            } catch (e: Exception) {
                // JSON that would not parse, or anything else unforeseen.
                // Still the server's side of the wire, not the phone's.
                CatalogueState.Failed(offline = false)
            }
            _state.update { it.copy(content = next, refreshing = false) }
        }
    }

    private companion object {
        /* Long enough to swallow the gaps inside a typed word, short enough
           that stopping to think still feels like the app responded. */
        const val DEBOUNCE_MS = 350L
    }
}
