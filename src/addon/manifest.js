// Stremio manifest. Follows the Add-on SDK manifest format:
//   https://stremio.github.io/stremio-addon-sdk/api/responses/manifest.html
//
// - `idPrefixes` is intentionally OMITTED so the add-on is asked about series
//   from every metadata provider (Cinemeta/IMDb, Kitsu-based catalogs, …).
//   Unrecognized ids are safely answered with an empty stream list.
// - `catalogs` is an empty array: this add-on provides no catalogs.
// - Only the `stream` resource for `series` is declared (plus the optional,
//   env-gated `subtitles` badge). No player, library, or movie resources.

import { ADDON_ID, ADDON_NAME, ADDON_DESCRIPTION, VERSION } from '../shared/types.js'

export function buildManifest ({ enableSubtitles = false } = {}) {
  const resources = ['stream']
  if (enableSubtitles) resources.push('subtitles')
  return {
    id: ADDON_ID,
    version: VERSION,
    name: ADDON_NAME,
    description: ADDON_DESCRIPTION,
    resources,
    types: ['series'],
    catalogs: []
  }
}
