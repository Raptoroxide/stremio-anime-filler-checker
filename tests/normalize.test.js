// Title normalization and year-suffix splitting.

import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeTitle, splitYearSuffix } from '../src/matching/normalize.js'

test('normalizeTitle: case, punctuation and whitespace', () => {
  assert.equal(normalizeTitle('  Naruto:   Shippuden '), 'naruto shippuden')
  assert.equal(normalizeTitle('D.Gray-man'), 'd gray man')
  assert.equal(normalizeTitle('K-On!'), 'k on')
  assert.equal(normalizeTitle('Kaguya-sama: Love is War'), 'kaguya sama love is war')
})

test('normalizeTitle: × becomes x (Hunter × Hunter)', () => {
  assert.equal(normalizeTitle('Hunter × Hunter'), 'hunter x hunter')
  assert.equal(normalizeTitle('Hunter x Hunter'), 'hunter x hunter')
})

test('normalizeTitle: & becomes and', () => {
  assert.equal(normalizeTitle('Rock Lee & His Ninja Pals'), 'rock lee and his ninja pals')
})

test('normalizeTitle: diacritics are folded', () => {
  assert.equal(normalizeTitle('Kyōkai no Rinne'), normalizeTitle('Kyokai no Rinne'))
  assert.equal(normalizeTitle('Shingeki no Kyōjin'), 'shingeki no kyojin')
})

test('normalizeTitle: full-width characters are folded (NFKC)', () => {
  assert.equal(normalizeTitle('ＯＮＥ ＰＩＥＣＥ'), 'one piece')
})

test('normalizeTitle: romaji long-vowel variants fold (Shippuuden ≈ Shippuden)', () => {
  assert.equal(normalizeTitle('Naruto Shippuuden'), 'naruto shippuden')
  assert.equal(normalizeTitle('Toukyou Ghoul'), normalizeTitle('Tokyo Ghoul'))
})

test('normalizeTitle: leading "the" is KEPT (The One Piece stays distinct)', () => {
  assert.equal(normalizeTitle('The One Piece'), 'the one piece')
  assert.notEqual(normalizeTitle('The One Piece'), normalizeTitle('One Piece'))
})

test('normalizeTitle: empty and hostile inputs', () => {
  assert.equal(normalizeTitle(''), '')
  assert.equal(normalizeTitle(null), '')
  assert.equal(normalizeTitle(undefined), '')
  assert.equal(normalizeTitle('!!!???...'), '')
})

test('splitYearSuffix: plausible years are split off', () => {
  assert.deepEqual(splitYearSuffix('berserk 2016'), { base: 'berserk', year: 2016 })
  assert.deepEqual(splitYearSuffix('hunter x hunter 2011'), { base: 'hunter x hunter', year: 2011 })
})

test('splitYearSuffix: non-year numbers are kept intact', () => {
  assert.deepEqual(splitYearSuffix('mobile suit gundam 0079'), { base: 'mobile suit gundam 0079', year: null })
  assert.deepEqual(splitYearSuffix('86 eighty six'), { base: '86 eighty six', year: null })
  assert.deepEqual(splitYearSuffix('one piece'), { base: 'one piece', year: null })
})
