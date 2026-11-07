// Landing page (/): purpose, install link, copyable manifest URL, verdict
// definitions, honest coverage limitations, and how the add-on works.

import { escapeHtml } from '../shared/escape.js'
import { renderPage } from './layout.js'
import { VERDICTS } from '../shared/types.js'

const VERDICT_CHIP_CLASS = {
  'manga-canon': 'verdict-manga-canon',
  'anime-canon': 'verdict-anime-canon',
  mixed: 'verdict-mixed',
  filler: 'verdict-filler',
  unknown: 'verdict-unknown'
}

export function renderLanding ({ baseUrl = '', host = '' }) {
  const manifestUrl = baseUrl ? `${baseUrl}/manifest.json` : '/manifest.json'
  const installHref = host ? `stremio://${host}/manifest.json` : null

  const verdictsHtml = Object.entries(VERDICTS).map(([key, v]) => (
    `<li><span class="chip ${VERDICT_CHIP_CLASS[key]}">${escapeHtml(v.label)}</span> ${escapeHtml(v.meaning)}</li>`
  )).join('\n')

  const body = `
<h1>Anime Filler Checker</h1>
<p class="lead">A Stremio add-on that tells you whether the anime episode you are about to watch is
<strong>Manga Canon</strong>, <strong>Anime Canon</strong>, <strong>Mixed Canon/Filler</strong>, <strong>Filler</strong>, or <strong>Unknown</strong> —
directly in Stremio, on desktop, mobile and TV.</p>

<h2 id="install">Install in Stremio</h2>
${installHref
    ? `<p><a class="btn" href="${escapeHtml(installHref)}">Install in Stremio</a><a class="btn btn-secondary" href="${escapeHtml(manifestUrl)}">View manifest.json</a></p>`
    : `<p><a class="btn" href="${escapeHtml(manifestUrl)}">View manifest.json</a></p>`}
<p>If the button does not open Stremio, copy the manifest URL below and add it manually:</p>
<div class="urlbox">
  <code id="manifest-url">${escapeHtml(manifestUrl)}</code>
  <button class="btn btn-secondary" type="button" data-copy>Copy</button>
</div>
<noscript><p class="muted small">JavaScript is disabled — select and copy the URL above manually.</p></noscript>

<h2>What it does</h2>
<p>While you browse a series in Stremio, every episode's stream list will also contain a clearly-named
informational row from this add-on, for example:</p>
<div class="urlbox"><code>ANIME FILLER CHECK</code><code>FILLER · Naruto · Episode 26 · Source: AnimeFillerList</code></div>
<p>The row is <strong>not a video stream</strong> — selecting it opens a details page in your browser with the
full classification, the exact source link, when the data was checked, and what the verdict means.
The add-on never provides, proxies, or interferes with actual video streams from other add-ons.</p>

<h2>Verdicts</h2>
<ul class="verdicts">
${verdictsHtml}
</ul>
<p class="note"><strong>Do not skip MIXED episodes automatically.</strong> Mixed Canon/Filler episodes usually
contain canon material that matters to the story.</p>

<h2>Coverage — honestly</h2>
<p>Classification data comes from <a href="https://www.animefillerlist.com/" rel="noopener">AnimeFillerList</a>
(looked up live and cached), with a bundled fallback dataset from
<a href="https://fillerlists.com/data" rel="noopener">FillerLists</a> covering 13 long-running anime.
AnimeFillerList covers hundreds of shows, but <strong>no source covers every anime ever made</strong>, so:</p>
<ul>
  <li>Series that are confidently anime but missing from the sources show <strong>UNKNOWN — no reliable episode data found</strong>.</li>
  <li>Series that cannot be confidently identified as anime (e.g. western animation or live-action titles) get <strong>no row at all</strong>, rather than a misleading one.</li>
  <li>Specials/OVAs and season numbering that cannot be mapped reliably also show <strong>UNKNOWN</strong> — nothing is guessed.</li>
</ul>
<p>See the <a href="/check">help page</a> for details, limitations and how to verify any result at its source.</p>

<h2>Supported id formats</h2>
<ul>
  <li><code>tt…:season:episode</code> — Cinemeta/IMDb (the default Stremio metadata; best supported)</li>
  <li><code>kitsu:…:season:episode</code> — Kitsu-based catalogs (resolved via Kitsu's public API)</li>
  <li>Manual lookups on <code>/check</code> via <code>title</code> + <code>season</code>/<code>episode</code> (or tokens like <code>S01E02</code>, <code>1x02</code>)</li>
  <li>Other id families are answered with an empty result rather than a guess</li>
</ul>

<h2>Privacy</h2>
<p>No accounts, no watch-history access, no analytics, no tracking, no personal data. The add-on only
receives the standard Stremio add-on requests (series/episode ids) and answers them.</p>

<script>
(function () {
  var btn = document.querySelector('[data-copy]');
  if (!btn) return;
  btn.addEventListener('click', function () {
    var el = document.getElementById('manifest-url');
    var text = el ? el.textContent : '';
    function done() {
      var old = btn.textContent;
      btn.textContent = 'Copied!';
      setTimeout(function () { btn.textContent = old; }, 1600);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { done(); });
    } else if (document.selection) {
      done();
    } else { done(); }
  });
})();
</script>
`

  return renderPage({
    title: 'Anime Filler Checker — Stremio add-on',
    description: 'Stremio add-on showing whether an anime episode is Manga Canon, Anime Canon, Mixed Canon/Filler, Filler, or Unknown.',
    body
  })
}
