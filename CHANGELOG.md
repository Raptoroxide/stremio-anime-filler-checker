# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/) and the project uses semantic
versioning.

## [1.0.0] — 2026-11-07

Initial release.

### Added

- Informational Stremio stream resource (`series` type, no `idPrefixes`
  restriction) that adds a clearly-named `ANIME FILLER CHECK` row with the
  episode's verdict and a link to a hosted details page (`externalUrl` only —
  never a fake playable stream).
- Five supported verdicts: MANGA CANON, ANIME CANON, MIXED CANON/FILLER,
  FILLER, UNKNOWN (with explicit reasons; nothing is ever guessed).
- Data sources: AnimeFillerList (live, cached ~24 h, robots.txt respected
  including Crawl-delay) with the FillerLists CC BY-SA 4.0 dataset bundled as
  a fallback (13 long-running anime).
- Id resolution: Cinemeta/IMDb (`tt…:season:episode`) and Kitsu
  (`kitsu:…:season:episode`), plus a manual `/check` lookup by title with
  `S01E02` / `1x02` / `season:episode` tokens.
- Season-to-absolute-episode mapping derived from metadata provider season
  counts (no invented offsets), with approximate-mapping disclosure when
  totals mismatch.
- Landing page with `stremio://` install deep link and copyable manifest URL;
  responsive, TV-readable details/help page with source links, timestamps and
  honest limitation notes.
- `/health` endpoint, CORS on all routes, cache headers, strict input
  validation, host-allowlisted outbound fetches with timeouts/retries/size
  caps, and in-memory TTL caching with stale-on-outage fallback.
- Optional (off by default) informational WebVTT subtitle badge behind the
  `ENABLE_SUBTITLE_BADGE` environment variable.
- Test suite: 112 tests including verified-fixture classifications (Naruto
  S1E1 canon / S1E7 mixed / S1E26 filler, Attack on Titan S2E1 → Episode 26),
  alias-collision guards, outage/stale-cache fallbacks and full protocol
  response shapes; plus a live smoke script and a data-refresh script
  (`npm run update-data`).
