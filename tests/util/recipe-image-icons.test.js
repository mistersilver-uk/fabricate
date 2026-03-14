import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_RECIPE_IMAGE,
  RECIPE_IMAGE_OPTIONS,
  normalizeRecipeImage,
  filterRecipeImageOptions
} from '../../src/ui/svelte/util/recipeImageIcons.js';

test('DEFAULT_RECIPE_IMAGE is the alchemical blueprint path', () => {
  assert.equal(
    DEFAULT_RECIPE_IMAGE,
    'icons/sundries/documents/blueprint-recipe-alchemical.webp'
  );
});

test('RECIPE_IMAGE_OPTIONS has exactly 46 entries', () => {
  assert.equal(RECIPE_IMAGE_OPTIONS.length, 46);
});

test('RECIPE_IMAGE_OPTIONS is frozen', () => {
  assert.ok(Object.isFrozen(RECIPE_IMAGE_OPTIONS), 'array should be frozen');
});

test('every RECIPE_IMAGE_OPTIONS entry has a non-empty path string', () => {
  for (const entry of RECIPE_IMAGE_OPTIONS) {
    assert.equal(typeof entry.path, 'string', `entry.path should be a string: ${JSON.stringify(entry)}`);
    assert.ok(entry.path.length > 0, `entry.path should be non-empty: ${JSON.stringify(entry)}`);
  }
});

test('every RECIPE_IMAGE_OPTIONS entry has a non-empty label string', () => {
  for (const entry of RECIPE_IMAGE_OPTIONS) {
    assert.equal(typeof entry.label, 'string', `entry.label should be a string: ${JSON.stringify(entry)}`);
    assert.ok(entry.label.length > 0, `entry.label should be non-empty: ${JSON.stringify(entry)}`);
  }
});

test('every RECIPE_IMAGE_OPTIONS path is in the icons/sundries/documents/ directory', () => {
  for (const entry of RECIPE_IMAGE_OPTIONS) {
    assert.ok(
      entry.path.startsWith('icons/sundries/documents/'),
      `path should start with icons/sundries/documents/: ${entry.path}`
    );
  }
});

test('every RECIPE_IMAGE_OPTIONS path ends with .webp', () => {
  for (const entry of RECIPE_IMAGE_OPTIONS) {
    assert.ok(entry.path.endsWith('.webp'), `path should end with .webp: ${entry.path}`);
  }
});

test('labels are title-cased from filename', () => {
  const anchor = RECIPE_IMAGE_OPTIONS.find(o => o.path.includes('blueprint-anchor'));
  assert.ok(anchor, 'should have blueprint-anchor entry');
  assert.equal(anchor.label, 'Blueprint Anchor');
});

test('DEFAULT_RECIPE_IMAGE is present in RECIPE_IMAGE_OPTIONS', () => {
  const found = RECIPE_IMAGE_OPTIONS.some(o => o.path === DEFAULT_RECIPE_IMAGE);
  assert.ok(found, 'DEFAULT_RECIPE_IMAGE should be in RECIPE_IMAGE_OPTIONS');
});

test('all paths in RECIPE_IMAGE_OPTIONS are unique', () => {
  const paths = RECIPE_IMAGE_OPTIONS.map(o => o.path);
  const uniquePaths = new Set(paths);
  assert.equal(uniquePaths.size, paths.length, 'all paths should be unique');
});

// normalizeRecipeImage tests

test('normalizeRecipeImage returns path when it exists in RECIPE_IMAGE_OPTIONS', () => {
  const validPath = RECIPE_IMAGE_OPTIONS[0].path;
  assert.equal(normalizeRecipeImage(validPath), validPath);
});

test('normalizeRecipeImage returns DEFAULT_RECIPE_IMAGE for an invalid path', () => {
  assert.equal(
    normalizeRecipeImage('icons/svg/item-bag.svg'),
    DEFAULT_RECIPE_IMAGE
  );
});

test('normalizeRecipeImage returns DEFAULT_RECIPE_IMAGE for empty string', () => {
  assert.equal(normalizeRecipeImage(''), DEFAULT_RECIPE_IMAGE);
});

test('normalizeRecipeImage returns DEFAULT_RECIPE_IMAGE for null', () => {
  assert.equal(normalizeRecipeImage(null), DEFAULT_RECIPE_IMAGE);
});

test('normalizeRecipeImage returns DEFAULT_RECIPE_IMAGE for undefined', () => {
  assert.equal(normalizeRecipeImage(undefined), DEFAULT_RECIPE_IMAGE);
});

test('normalizeRecipeImage returns DEFAULT_RECIPE_IMAGE itself when passed', () => {
  assert.equal(normalizeRecipeImage(DEFAULT_RECIPE_IMAGE), DEFAULT_RECIPE_IMAGE);
});

// filterRecipeImageOptions tests

test('filterRecipeImageOptions returns all options when searchTerm is empty', () => {
  const result = filterRecipeImageOptions(RECIPE_IMAGE_OPTIONS, '');
  assert.equal(result.length, RECIPE_IMAGE_OPTIONS.length);
});

test('filterRecipeImageOptions returns all options when searchTerm is whitespace', () => {
  const result = filterRecipeImageOptions(RECIPE_IMAGE_OPTIONS, '   ');
  assert.equal(result.length, RECIPE_IMAGE_OPTIONS.length);
});

test('filterRecipeImageOptions is case-insensitive', () => {
  const upper = filterRecipeImageOptions(RECIPE_IMAGE_OPTIONS, 'BLUEPRINT');
  const lower = filterRecipeImageOptions(RECIPE_IMAGE_OPTIONS, 'blueprint');
  assert.equal(upper.length, lower.length);
  assert.ok(upper.length > 0, 'should find blueprint entries');
});

test('filterRecipeImageOptions filters by label substring', () => {
  const result = filterRecipeImageOptions(RECIPE_IMAGE_OPTIONS, 'anchor');
  assert.equal(result.length, 1);
  assert.ok(result[0].path.includes('blueprint-anchor'));
});

test('filterRecipeImageOptions returns empty array for no matches', () => {
  const result = filterRecipeImageOptions(RECIPE_IMAGE_OPTIONS, 'xyznonexistent');
  assert.equal(result.length, 0);
});

test('filterRecipeImageOptions returns all blueprints when searching "Blueprint"', () => {
  const result = filterRecipeImageOptions(RECIPE_IMAGE_OPTIONS, 'Blueprint');
  assert.ok(result.length > 1, 'should return multiple blueprint entries');
  for (const entry of result) {
    assert.ok(entry.label.toLowerCase().includes('blueprint'), `label should contain blueprint: ${entry.label}`);
  }
});

test('filterRecipeImageOptions does not mutate the original options array', () => {
  const copy = [...RECIPE_IMAGE_OPTIONS];
  filterRecipeImageOptions(RECIPE_IMAGE_OPTIONS, 'blueprint');
  assert.equal(RECIPE_IMAGE_OPTIONS.length, copy.length);
});
