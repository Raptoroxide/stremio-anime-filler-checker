// Provider pipeline with a documented, fixed priority:
//   1. AnimeFillerList (primary, live + cached + seed index)
//   2. FillerLists (bundled CC BY-SA 4.0 dataset, 13 long-running shows)
//
// Verdicts are never merged across sources. If both ever disagree, the
// higher-priority source wins and the choice is documented here and in the
// README. A lower-priority provider is consulted only when the higher-priority
// one has no match or fails.

import { createAnimeFillerListProvider } from './animefillerlist.js'
import { createFillerListsProvider } from './fillerlists.js'

export function createProviders ({ http, now, cache }) {
  // `cache` is the TTLCache instance used for AnimeFillerList data
  // (index + show pages). FillerLists needs no cache: it is bundled.
  const afl = createAnimeFillerListProvider({ http, now, cache, inflight: new Map() })
  const fl = createFillerListsProvider({ now })

  /**
   * @param {object} args — see provider lookup signatures
   * @param {object|null} scope — { deadlineAt }
   * @param {{allowFetch?: boolean}} opts — allowFetch=false restricts
   *   AnimeFillerList to the bundled seed (used for the cheap non-anime path,
   *   so non-anime series never trigger upstream calls).
   * @returns {{record: object|null, provider: string|null, errors: string[]}}
   */
  async function lookup (args, scope, { allowFetch = true } = {}) {
    const errors = []
    for (const provider of [afl, fl]) {
      let result
      try {
        result = await provider.lookup(args, scope, { allowFetch })
      } catch (err) {
        result = { status: 'error', reason: (err && err.message) || 'provider crashed' }
      }
      if (result.status === 'ok') return { record: result.record, provider: provider.name, errors }
      if (result.status === 'error') errors.push(`${provider.name}: ${result.reason}`)
    }
    return { record: null, provider: null, errors }
  }

  return { lookup, afl, fl }
}
