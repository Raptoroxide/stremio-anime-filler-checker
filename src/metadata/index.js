// Resolver registry: dispatches a parsed id family to the right metadata
// resolver. Adding a new id family later means adding one resolver module and
// one line here.

import { createCinemetaResolver } from './cinemeta.js'
import { createKitsuResolver } from './kitsu.js'

export function createResolvers (deps) {
  const cinemeta = createCinemetaResolver(deps)
  const kitsu = createKitsuResolver(deps)

  /**
   * @param {{family: string, seriesId: string}|null} ref
   * @returns compact meta object or null when unresolvable
   */
  async function resolve (ref, scope) {
    if (!ref) return null
    if (ref.family === 'imdb') return cinemeta.resolveSeries(ref.seriesId, scope)
    if (ref.family === 'kitsu') return kitsu.resolveSeries(ref.seriesId, scope)
    return null
  }

  return { resolve, cinemeta, kitsu }
}
