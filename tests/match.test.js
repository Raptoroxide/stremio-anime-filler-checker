// Show matching: exact tiers, alias collisions, year disambiguation,
// season-page candidates, conservative fuzzy.
// Uses both synthetic entries and the REAL bundled AnimeFillerList seed.

import test from 'node:test'
import assert from 'node:assert/strict'
import { findShowMatch, similarity } from '../src/matching/match.js'
import { AFL_SEED } from '../src/providers/data/afl-shows-seed.js'

test('findShowMatch: exact match against the real seed', () => {
  const m = findShowMatch(AFL_SEED.shows, { title: 'Naruto', year: 2002, season: 1 })
  assert.equal(m.entry.slug, 'naruto')
  assert.equal(m.method, 'exact')
  assert.equal(m.confidence, 'high')
})

test('findShowMatch: "One Piece" and "The One Piece" are distinct series', () => {
  assert.equal(findShowMatch(AFL_SEED.shows, { title: 'One Piece', year: 1999, season: 1 }).entry.slug, 'one-piece')
  assert.equal(findShowMatch(AFL_SEED.shows, { title: 'The One Piece', year: 2026, season: 1 }).entry.slug, 'one-piece-0')
})

test('findShowMatch: parenthetical romaji alternate names match (Attack on Titan)', () => {
  assert.equal(findShowMatch(AFL_SEED.shows, { title: 'Attack on Titan', year: 2013, season: 1 }).entry.slug, 'attack-titan')
  const viaAlias = findShowMatch(AFL_SEED.shows, { title: 'Shingeki no Kyojin', year: 2013, season: 1 })
  assert.equal(viaAlias.entry.slug, 'attack-titan')
  assert.equal(viaAlias.method, 'exact')
})

test('findShowMatch: alias collision — "Naruto" must never match Shippuden or Boruto', () => {
  const m = findShowMatch(AFL_SEED.shows, { title: 'Naruto', year: 2002, season: 1 })
  assert.equal(m.entry.slug, 'naruto')
  assert.notEqual(m.entry.slug, 'naruto-shippuden')
  assert.notEqual(m.entry.slug, 'boruto-naruto-next-generations')
  const shippuden = findShowMatch(AFL_SEED.shows, { title: 'Naruto: Shippuden', year: 2007, season: 1 })
  assert.equal(shippuden.entry.slug, 'naruto-shippuden')
  const boruto = findShowMatch(AFL_SEED.shows, { title: 'Boruto: Naruto Next Generations', year: 2017, season: 1 })
  assert.equal(boruto, null) // AFL has two Boruto pages (regular + "Definitive") → refuse to guess
})

test('findShowMatch: year disambiguates remakes (Hunter × Hunter 1999 vs 2011)', () => {
  assert.equal(findShowMatch(AFL_SEED.shows, { title: 'Hunter x Hunter', year: 2011, season: 1 }).entry.slug, 'hunter-x-hunter')
  assert.equal(findShowMatch(AFL_SEED.shows, { title: 'Hunter x Hunter', year: 1999, season: 1 }).entry.slug, 'hunter-x-hunter-1999')
  assert.equal(findShowMatch(AFL_SEED.shows, { title: 'Hunter x Hunter', season: 1 }).entry.slug, 'hunter-x-hunter-1999')
  assert.equal(findShowMatch(AFL_SEED.shows, { title: 'Berserk', year: 2016, season: 1 }).entry.slug, 'berserk-2016')
  assert.equal(findShowMatch(AFL_SEED.shows, { title: 'Berserk', season: 1 }).entry.slug, 'berserk')
})

test('findShowMatch: leading-"the" tier', () => {
  const entries = [
    { slug: 'a', title: 'The Melancholy of Haruhi Suzumiya' },
    { slug: 'b', title: 'Something Else Entirely' }
  ]
  assert.equal(findShowMatch(entries, { title: 'Melancholy of Haruhi Suzumiya', season: 1 }).entry.slug, 'a')
  assert.equal(findShowMatch(entries, { title: 'The Melancholy of Haruhi Suzumiya', season: 1 }).entry.slug, 'a')
})

test('findShowMatch: season-specific page candidate', () => {
  const entries = [
    { slug: 'foo', title: 'Foo' },
    { slug: 'foo-s2', title: 'Foo Season 2' }
  ]
  const m = findShowMatch(entries, { title: 'Foo', season: 2 })
  assert.equal(m.entry.slug, 'foo-s2')
  assert.equal(m.method, 'season-page')
  // season 1 requests do not get the season page
  assert.equal(findShowMatch(entries, { title: 'Foo', season: 1 }).entry.slug, 'foo')
})

test('findShowMatch: ambiguous same-title entries without year evidence → no match', () => {
  const entries = [
    { slug: 'x1', title: 'Duplicate' },
    { slug: 'x2', title: 'Duplicate' }
  ]
  assert.equal(findShowMatch(entries, { title: 'Duplicate', season: 1 }), null)
})

test('findShowMatch: conservative fuzzy match only for clear unique near-misses', () => {
  const entries = [{ slug: 'evangelion', title: 'Neon Genesis Evangelion' }]
  const m = findShowMatch(entries, { title: 'Neon Genesis Evangellion', season: 1 }) // common misspelling
  assert.equal(m.entry.slug, 'evangelion')
  assert.equal(m.method, 'fuzzy')
  assert.equal(m.confidence, 'medium')
})

test('findShowMatch: fuzzy refuses close calls between similar titles', () => {
  const entries = [
    { slug: 'n', title: 'Naruto' },
    { slug: 'ns', title: 'Naruto Shippuden' }
  ]
  // A one-letter typo of a SHORT title is below the confidence threshold —
  // no match rather than a guess:
  assert.equal(findShowMatch(entries, { title: 'Narutoo', season: 1 }), null)
  // A one-letter typo of a longer, clearly-unique title does resolve:
  assert.equal(findShowMatch(entries, { title: 'Naruto Shippuudenn', season: 1 }).entry.slug, 'ns')
})

test('findShowMatch: no match for unrelated titles', () => {
  assert.equal(findShowMatch(AFL_SEED.shows, { title: 'Test Anime Chronicles', season: 1 }), null)
  assert.equal(findShowMatch(AFL_SEED.shows, { title: 'Rick and Morty', season: 1 }), null)
  assert.equal(findShowMatch([], { title: 'Naruto', season: 1 }), null)
  assert.equal(findShowMatch(AFL_SEED.shows, { title: '', season: 1 }), null)
})

test('similarity: basics', () => {
  assert.equal(similarity('abc', 'abc'), 1)
  assert.ok(similarity('abc', 'abd') > 0.6)
  assert.equal(similarity('', 'abc'), 0)
})
