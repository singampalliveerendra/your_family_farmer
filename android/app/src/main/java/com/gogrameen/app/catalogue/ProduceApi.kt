package com.gogrameen.app.catalogue

import com.gogrameen.app.net.Http
import java.net.URLEncoder

/* The catalogue's reads.
 *
 * Two endpoints, both public and both returning the same row shape:
 *
 *   api/produce         everything a buyer may see
 *   api/produce/search  the same, narrowed by q / method / category
 *
 * The unfiltered grid deliberately keeps using the plain route rather than
 * calling search with three empty parameters. They are not quite the same
 * request — /api/produce also understands ?status=, which the upcoming
 * "coming soon" section needs — and an empty search is a query that means
 * nothing, sent on every app open.
 *
 * THE APP DOES NOT FILTER. The server decides what matches: its search is
 * bilingual (src/lib/produceSearch.ts indexes every listing under both its
 * English and Telugu names, so "టమాటా" finds a row stored as "Tomato"), and its
 * category filter falls back to guessing from the crop name for older listings
 * with no category set. Re-implementing either in Kotlin would disagree with
 * the website within a week.
 *
 * The connection, the timeouts, the cookie jar and the site itself belong to
 * Http. Nothing here names a host. */
object ProduceApi {

    private const val ALL = "api/produce"

    /** The whole buyer-visible catalogue. */
    suspend fun listings(): List<Listing> = produceJson.decodeFromString(Http.get(ALL))

    /**
     * The catalogue narrowed by a query and/or filters.
     *
     * With nothing to narrow by this falls back to [listings], so a caller can
     * hand over whatever the search box and chips currently hold without
     * checking whether any of it is set.
     */
    suspend fun search(
        query: String,
        method: MethodFilter,
        category: CategoryFilter,
    ): List<Listing> {
        val path = searchPath(query, method, category) ?: return listings()
        return produceJson.decodeFromString(Http.get(path))
    }
}

/**
 * Build the search path, or null when there is nothing to search for.
 *
 * Pure and internal so it can be unit-tested without a device or a server. The
 * encoding is the part worth pinning: a Telugu query is multi-byte UTF-8 and
 * has to arrive percent-encoded, and a crop name with a space or an ampersand
 * in it would otherwise truncate the parameter silently — the request would
 * still return 200, just with the wrong results.
 */
private const val SEARCH_PATH = "api/produce/search"

internal fun searchPath(
    query: String,
    method: MethodFilter,
    category: CategoryFilter,
): String? {
    val q = query.trim()
    val params = buildList {
        if (q.isNotEmpty()) add("q" to q)
        method.slug?.let { add("method" to it) }
        category.slug?.let { add("category" to it) }
    }
    if (params.isEmpty()) return null

    return params.joinToString("&", prefix = "$SEARCH_PATH?") { (key, value) ->
        "$key=${URLEncoder.encode(value, "UTF-8")}"
    }
}
