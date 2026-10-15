'use client'

import { useMemo, useState } from 'react'
import { matchesOrderSearch, orderSearchVocabulary, type OrderSearchIndex } from '@/lib/orderSearch'

/**
 * Search state for an Orders page. Indexes each order once per load (not per
 * keystroke) and hands back a filter plus the vocabulary for the Telugu
 * preview. With an empty query `matches` lets everything through, so the page
 * behaves exactly as it did before search existed.
 */
export function useOrderSearch<T extends { id: string }>(
  orders: T[],
  indexOf: (order: T) => OrderSearchIndex,
) {
  const [query, setQuery] = useState('')
  const indexes = useMemo(() => {
    const m = new Map<string, OrderSearchIndex>()
    for (const o of orders) m.set(o.id, indexOf(o))
    return m
    // indexOf is a module-level function at every call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders])
  const vocabulary = useMemo(() => orderSearchVocabulary(indexes.values()), [indexes])

  const matches = (o: T) => {
    const idx = indexes.get(o.id)
    return !idx || matchesOrderSearch(idx, query)
  }
  return { query, setQuery, matches, vocabulary, searching: query.trim().length > 0 }
}
