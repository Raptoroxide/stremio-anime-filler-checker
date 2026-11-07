# Anime Filler Checker — Stremio Add-on

A lightweight [Stremio](https://www.stremio.com/) add-on that tells you whether the anime episode you are viewing is **Manga Canon**, **Anime Canon**, **Mixed Canon/Filler**, **Filler**, or **Unknown** — on desktop, mobile and TV.

It is an **informational companion only**: it never provides, proxies, modifies, or interferes with video streams from other add-ons.

- **No accounts, no API keys, no database** — deploys to Vercel's free tier from a GitHub repo in a few clicks.
- **Zero runtime dependencies** (plain Node.js / JavaScript ES modules).
- **Honest by design**: it never guesses. If a verdict cannot be traced to a cited source, it says UNKNOWN.

---

## 1. What it does and where the status appears

When you open an episode of a series in Stremio, Stremio asks every installed add-on for streams. This add-on answers with **one clearly-named informational row** in the episode's stream list:

```
ANIME FILLER CHECK
FILLER · Naruto · Episode 26 · Source: AnimeFillerList
```

- The row is **not a video stream**. It uses the Stremio protocol's `externalUrl` field: selecting it opens a **details page** in your browser (or TV browser) with the full classification, the exact source link, when the data was checked, and what the verdict means.
- For multi-season series the row also shows the mapping, e.g. `MIXED CANON/FILLER · Naruto · S5E41 → Episode 220 · Source: AnimeFillerList`.
- Series that cannot be confidently identified as anime get **no row at all** (rather than a misleading one). Anime that the sources don't cover get an `UNKNOWN` row that explains why.

### Stremio add-on ≠ browser extension

This is a **Stremio add-on**: a small HTTPS web service described by a `manifest.json`. You install it once in Stremio using its manifest URL, and the same hosted service works for Stremio on desktop, mobile and TV. There is nothing to install in Chrome/Firefox, and no device-specific setup.

### The user flow

1. You install the add-on in Stremio (one click from the landing page, or paste the manifest URL).
2. You open any anime episode in Stremio as usual.
3. Among the stream choices you see the `ANIME FILLER CHECK` row with the verdict for that episode.
4. (Optional) Select the row to open the details page: verdict meaning, source link, check date, mapping notes.

## 2. Verdict definitions

| Verdict | Meaning |
| --- | --- |
| **MANGA CANON** | Adapted from the original manga (or main source material). |
| **ANIME CANON** | Anime-original material the cited source considers part of the official anime continuity. |
| **MIXED CANON/FILLER** | Contains **both** canon and filler material. **Do not skip automatically** — it may contain important story content. |
| **FILLER** | Not adapted from the manga; classified as filler by the cited source. |
| **UNKNOWN** | No reliable classification could be determined. Nothing is guessed. |

UNKNOWN has explicit reasons, shown in the row and on the details page: *no reliable episode data found*, *episode not listed by the source*, *specials/OVAs are not reliably classified*, or *season numbering could not be mapped reliably*.

## 3. Coverage — the honest version

Classification data comes from:

1. **[AnimeFillerList](https://www.animefillerlist.com/)** (primary) — looked up live per show, cached ~24 h. Covers hundreds of shows.
2. **[FillerLists](https://fillerlists.com/data)** (bundled fallback) — a CC BY-SA 4.0 dataset of 13 long-running anime (4,076 episodes), used when AnimeFillerList has no match or is unavailable.

**No source covers every anime ever made.** In practice:

- Most popular anime are on AnimeFillerList and work out of the box.
- A series that is confidently anime but missing from the sources shows `UNKNOWN — no reliable episode data found`.
- Western animation and live-action series (e.g. *Rick and Morty*) get **no row**: anime identification requires the metadata to show genre *Animation* **and** country *Japan* (or a Kitsu id). This avoids labelling every non-anime series UNKNOWN.
- Specials/OVAs (season 0) are not reliably classified by the sources → UNKNOWN.
- If AnimeFillerList has two pages for one title (e.g. Boruto has a regular and a "(Definitive)" list), the add-on refuses to guess and falls back — for Boruto that means FillerLists data.
- Absolute-episode mapping is derived from your metadata provider's own season/episode data (never an invented formula). When the totals don't match exactly (e.g. One Piece, where the AnimeFillerList page lags slightly behind), the mapping is still served but the details page shows an "approximate mapping" note; episodes beyond the source's list are UNKNOWN.

## 4. Supported id / episode formats

| Format | Support |
| --- | --- |
| `tt3107288:1:1` (Cinemeta/IMDb video id) | Full support — recommended (Stremio's default metadata) |
| `tt3107288` (series-level id) | Resolved for the details page |
| `kitsu:12345:1:2` (Kitsu ids) | Resolved via Kitsu's public API |
| `/check` manual lookup: `title` + `season`/`episode`, or tokens `S01E02`, `1x02`, `1:2` | Supported for manual testing |
| Any other id family (e.g. AniList-style) | Safely answered with an empty result — numbers are **never** guessed out of arbitrary ids |

**Known limitations:** manual title lookups match by exact (normalized) title and work best for season 1; later seasons map best when opened from Stremio, which carries the series id. Anime whose Cinemeta metadata lacks genre *Animation* or country *Japan* will not get a row.

## 5. Data sources, attribution and licensing

- **AnimeFillerList** — episode classifications fetched on demand (one page per show, cached ~24 h, robots.txt respected including its `Crawl-delay: 10`). Only public episode-classification data is parsed; every result stores the canonical source page URL. A small seed file with public *show titles + URL slugs* is bundled for fast, low-traffic lookups (regenerate with `npm run update-data`).
- **FillerLists** — the bundled fallback dataset is an adaptation of their CC BY-SA 4.0 data (episode numbers + verdict codes + show ids), trimmed but with verdict values unchanged, and shared under the same licence inside `src/providers/data/fillerlists-bundle.js`.
- **Cinemeta** (Stremio's official metadata) and **Kitsu** — used to resolve ids into titles/season structures.

Full attribution and licence details: see [`CREDITS.md`](CREDITS.md).

## 6. Local setup

You need [Node.js 18 or newer](https://nodejs.org/) (no other tools, no API keys).

**Windows (PowerShell):**

```powershell
cd path\to\stremio-anime-filler-checker
npm install
npm start
```

**macOS / Linux:**

```bash
cd path/to/stremio-anime-filler-checker
npm install
npm start
```

Then open <http://localhost:3000/> — the landing page with the install button and manifest URL. There is no build step; `npm run build` merely double-checks that all modules parse (it is a syntax check, not a compiler).

## 7. Running the tests

```bash
npm test          # full unit/integration suite (no network needed)
npm run build     # module load / syntax check
npm start         # in one terminal
npm run smoke     # in another: live endpoint checks against real sources (needs internet)
```

The smoke script checks the manifest, health, a known filler episode (Naruto S1E26), a known manga-canon episode (S1E1), a mixed episode (S1E7), a multi-season mapping (Attack on Titan S2E1 → Episode 26), a non-anime series (must be empty) and an unresolvable id (must be empty), plus CORS headers. Point it at a deployment with `SMOKE_BASE_URL=https://your-app.vercel.app npm run smoke`.

## 8. Put the project on GitHub

**Option A — web upload (no git knowledge needed):**

1. Create an account on [github.com](https://github.com) and click **New repository**.
2. Name it e.g. `stremio-anime-filler-checker`, leave it public, **do not** add a README (one is included), create it.
3. On the empty-repo page click **uploading an existing file**, drag the **contents** of the extracted project folder (so that `package.json` is at the repo root — not nested inside an extra folder), then **Commit changes**.

**Option B — command line:**

```bash
cd path/to/stremio-anime-filler-checker
git init
git add .
git commit -m "Anime Filler Checker add-on v1.0.0"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/stremio-anime-filler-checker.git
git push -u origin main
```

## 9. Deploy to Vercel

1. Sign up / log in at [vercel.com](https://vercel.com) (the free Hobby plan is enough).
2. Click **Add New… → Project**.
3. **Import** your `stremio-anime-filler-checker` Git repository (grant Vercel access if asked).
4. Keep the defaults: Framework Preset **Other**, no environment variables needed. Click **Deploy**.
5. Wait ~30 seconds. Vercel runs the harmless `npm run build` syntax check and deploys the function in `api/index.js` using the routes in `vercel.json`.

No database, Redis, Docker, or paid service is required. The only optional setting is `ENABLE_SUBTITLE_BADGE=1` (see below).

## 10. Your manifest URL

After deployment your add-on's manifest URL is:

```
https://YOUR-PROJECT.vercel.app/manifest.json
```

(replace `YOUR-PROJECT` with the name Vercel gave the deployment, e.g. `https://stremio-anime-filler-checker.vercel.app/manifest.json` — shown on your Vercel dashboard. Visit it in a browser: it must display the add-on's JSON manifest.)

## 11. Install in Stremio

**Easiest (any device with a browser):** open `https://YOUR-PROJECT.vercel.app/` and click **Install in Stremio** (uses the `stremio://` deep link). On phones/TVs this hands off to the Stremio app if installed.

**Desktop:** Stremio → Add-ons (puzzle icon) → paste the manifest URL into the search box → press Enter → click **Install**.

**Mobile (Android/iOS):** same as desktop — open the Add-ons section and paste the manifest URL into its search box.

**TV:** on Android TV, use the add-ons search/paste flow if your remote allows it, or open the landing page in the TV's browser and use the Install button. Some TV clients have limited add-on browsing; the add-on itself has a TV-readable details page once installed.

## 12. Updating the add-on

1. Change the code (and bump `version` in `src/shared/types.js` + `package.json`, plus `CHANGELOG.md`).
2. Push to GitHub — Vercel redeploys automatically on every push to the main branch.
3. Stremio re-reads the manifest periodically; restarting Stremio forces an immediate refresh. Users do not need to reinstall.
4. To refresh the bundled data (AnimeFillerList seed titles + FillerLists dataset), run `npm run update-data` and commit the changed files under `src/providers/data/`.

## 13. Optional: subtitle "badge"

Set the environment variable `ENABLE_SUBTITLE_BADGE=1` (Vercel → Project → Settings → Environment Variables) to also expose a WebVTT track that shows the verdict as a caption for the first seconds of playback. It is **off by default** because it makes the add-on appear in Stremio's subtitle picker for every episode. The main stream-row feature never depends on it.

## 14. Troubleshooting

| Symptom | Fix |
| --- | --- |
| `404` on `https://…/manifest.json` after deploying | Make sure `vercel.json` **and** `api/index.js` were committed (they map `/manifest.json` to the function). Open the Vercel deployment logs; the Framework Preset should be **Other**. |
| CORS errors in Stremio | Always install from the `https://…vercel.app/manifest.json` URL (never `file://` or `localhost` from another device). Verify: `curl -i https://YOUR-PROJECT.vercel.app/manifest.json` must show `Access-Control-Allow-Origin: *`. |
| "Invalid manifest" in Stremio | Open the manifest URL in a browser — it must be JSON with `id`, `version`, `name`, `description`, `resources`, `types`, `catalogs`. If you see HTML, routing is wrong (see the 404 row). |
| No row for an episode | Either the series is not confidently anime (expected), the id family is unsupported (expected), or the sources have no data → the details page explains which. Check `/check?id=…&s=…&e=…`. |
| Stale data | Show pages are cached ~24 h (longer for ended series' metadata) and Vercel instances recycle regularly; results also show a "cached data" note when stale data was served during an outage. |
| AnimeFillerList outage | The add-on automatically falls back to the bundled FillerLists dataset (13 shows) or serves stale cached data; everything else becomes UNKNOWN, never wrong. |
| Deployment error about `maxDuration` | `vercel.json` requests a 30 s function duration (within the Hobby plan's 60 s cap). If your plan differs, lower or remove the `functions` block — normal lookups finish in well under a second. |
| Very slow first lookup after idle | Cold starts plus AnimeFillerList's robots.txt `Crawl-delay: 10` can add a few seconds on the very first request per show. This is intentional politeness, not a bug. |

## 15. Adding a new data source / provider

Providers are small modules with one function. To add one:

1. Create `src/providers/mysource.js` exporting `createMySourceProvider(deps)` that returns `{ name, lookup(args, scope, opts) }`, where `lookup` resolves to `{ status: 'ok', record }` (a normalized record incl. `verdict`, `episodeNumber`, `sourceName`, `sourceUrl`, `checkedAt`), `{ status: 'no-match' }`, or `{ status: 'error', reason }`.
2. Map the source's labels with `normalizeVerdictKey()` (`src/shared/types.js`) into the five supported verdicts — never default to canon.
3. Register it in the priority list in `src/providers/index.js` (documented order: primary first, fallbacks after).
4. Add outbound fetches through `src/shared/http.js` (`createHttp`) so host allowlisting, timeouts, rate gaps and size caps apply — add your host to `ALLOWED_HOSTS` there.
5. Add tests under `tests/`, and attribution to `CREDITS.md`. If you bundle data, note its licence and add an update path (see `scripts/update-data.mjs`).

An id resolver for a new id family (e.g. AniList) is equally modular: add `src/metadata/anilist.js` and one line in `src/metadata/index.js`.

## 16. Privacy & security

- No Stremio account, login, or user credentials; no `player`/`library` resources are declared.
- No viewing history, watch progress, IP-derived location, analytics, tracking pixels, or advertising identifiers.
- Only fixed, allowlisted external hosts are ever fetched (`v3-cinemeta.strem.io`, `www.animefillerlist.com`, `kitsu.io`); user-supplied ids never become URLs (SSRF/path-traversal guard), inputs are length-capped, all HTML output is escaped, and errors never leak stack traces or internals.

## 17. Project structure

```
stremio-anime-filler-checker/
├── api/index.js              # Vercel serverless function (single entry point)
├── src/
│   ├── addon/                # manifest, lookup pipeline, stream & subtitle handlers
│   ├── metadata/             # Cinemeta + Kitsu id resolvers
│   ├── providers/            # AnimeFillerList (live) + FillerLists (bundled) adapters
│   │   └── data/             # generated seed + CC BY-SA bundle (npm run update-data)
│   ├── matching/             # title normalization, show matching, episode mapping
│   ├── cache/                # in-memory TTL cache with stale fallback
│   ├── pages/                # landing + details/help pages (server-rendered)
│   └── shared/               # types, id parsing, http policy layer, responders
├── tests/                    # unit + integration tests and verified fixtures
├── scripts/                  # smoke test, syntax check, data refresh
├── dev-server.mjs            # local development server
├── vercel.json               # rewrites + function duration
├── package.json              # zero runtime dependencies
├── README.md · CREDITS.md · CHANGELOG.md · LICENSE
```

## 18. Test results (this build)

Run on 2026-11-07 with Node.js 24:

- `npm test` — **112 tests, 112 passed, 0 failed** (id parsing, normalization, matching incl. alias-collision cases, episode mapping, real-page HTML parsing, provider priority/fallback/stale-cache, cache, HTTP policy layer, full app/protocol responses).
- `npm run build` — 27/27 modules load cleanly.
- `npm run smoke` (live, real sources) — **10/10 passed**, including Naruto S1E26 = FILLER, S1E1 = MANGA CANON, S1E7 = MIXED, Attack on Titan S2E1 → Episode 26 = MANGA CANON, non-anime = empty, CORS = `*`.

Fixtures are built from verified public source data captured on 2026-11-07 (provenance is documented in each fixture header).

## 19. Licence

Code: MIT (see [`LICENSE`](LICENSE)). Bundled data files carry their own licences — see [`CREDITS.md`](CREDITS.md).
