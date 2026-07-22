/**
 * Issue 771 — folder-name "match-by-name" normalization. Category is case-insensitive
 * (resolving to the vocabulary casing); tag is lowercased; the two axes are independent.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { matchFolderNameToVocabulary } from '../src/utils/matchFolderVocabulary.js';

const VOCAB = { componentCategories: ['Reagent', 'Metal'], itemTags: ['herb', 'rare'] };

test('matches a category case-insensitively and resolves to the vocabulary casing', () => {
  assert.deepEqual(matchFolderNameToVocabulary('reagent', VOCAB), {
    category: 'Reagent',
    tag: null,
  });
  assert.deepEqual(matchFolderNameToVocabulary('  METAL  ', VOCAB), {
    category: 'Metal',
    tag: null,
  });
});

test('matches a tag by lowercasing the folder name', () => {
  assert.deepEqual(matchFolderNameToVocabulary('Herb', VOCAB), { category: null, tag: 'herb' });
});

test('applies BOTH axes when a folder name matches a category and a tag independently', () => {
  const vocab = { componentCategories: ['Herb'], itemTags: ['herb'] };
  assert.deepEqual(matchFolderNameToVocabulary('herb', vocab), { category: 'Herb', tag: 'herb' });
});

test('a folder matching nothing resolves to no assignment', () => {
  assert.deepEqual(matchFolderNameToVocabulary('Widgets', VOCAB), { category: null, tag: null });
});

test('an empty or missing folder name is a clean no-match', () => {
  assert.deepEqual(matchFolderNameToVocabulary('', VOCAB), { category: null, tag: null });
  assert.deepEqual(matchFolderNameToVocabulary('   ', VOCAB), { category: null, tag: null });
  assert.deepEqual(matchFolderNameToVocabulary(undefined, VOCAB), { category: null, tag: null });
});

test('tolerates missing vocabulary arrays', () => {
  assert.deepEqual(matchFolderNameToVocabulary('Reagent'), { category: null, tag: null });
});
