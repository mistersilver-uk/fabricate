import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  RECIPE_IMAGE_ICONS,
  DEFAULT_RECIPE_IMAGE,
  normalizeRecipeImage,
  getRecipeImageLabel
} from '../src/utils/recipeImageIcons.js';

describe('recipeImageIcons utility', () => {
  it('exports exactly 46 document icons', () => {
    assert.equal(RECIPE_IMAGE_ICONS.length, 46, `Expected 46 icons, got ${RECIPE_IMAGE_ICONS.length}`);
  });

  it('all icons are from icons/sundries/documents/ and end with .webp', () => {
    for (const icon of RECIPE_IMAGE_ICONS) {
      assert.ok(
        icon.startsWith('icons/sundries/documents/'),
        `Icon path should start with icons/sundries/documents/: ${icon}`
      );
      assert.ok(icon.endsWith('.webp'), `Icon path should end with .webp: ${icon}`);
    }
  });

  it('default image is blueprint-recipe-alchemical.webp', () => {
    assert.equal(DEFAULT_RECIPE_IMAGE, 'icons/sundries/documents/blueprint-recipe-alchemical.webp');
  });

  it('default image is included in the icon list', () => {
    assert.ok(
      RECIPE_IMAGE_ICONS.includes(DEFAULT_RECIPE_IMAGE),
      'default image should be present in RECIPE_IMAGE_ICONS'
    );
  });

  it('icon list contains no duplicates', () => {
    const unique = new Set(RECIPE_IMAGE_ICONS);
    assert.equal(unique.size, RECIPE_IMAGE_ICONS.length, 'RECIPE_IMAGE_ICONS should have no duplicates');
  });

  it('normalizeRecipeImage returns default for empty, null, or undefined input', () => {
    assert.equal(normalizeRecipeImage(''), DEFAULT_RECIPE_IMAGE);
    assert.equal(normalizeRecipeImage(null), DEFAULT_RECIPE_IMAGE);
    assert.equal(normalizeRecipeImage(undefined), DEFAULT_RECIPE_IMAGE);
    assert.equal(normalizeRecipeImage('   '), DEFAULT_RECIPE_IMAGE);
  });

  it('normalizeRecipeImage preserves a valid icon path as-is', () => {
    const path = 'icons/sundries/documents/book-blue.webp';
    assert.equal(normalizeRecipeImage(path), path);
  });

  it('normalizeRecipeImage preserves paths not in the icon list (custom images)', () => {
    const custom = 'icons/svg/item-bag.svg';
    assert.equal(normalizeRecipeImage(custom), custom);
  });

  it('getRecipeImageLabel extracts filename without extension', () => {
    assert.equal(
      getRecipeImageLabel('icons/sundries/documents/blueprint-recipe-alchemical.webp'),
      'blueprint-recipe-alchemical'
    );
    assert.equal(
      getRecipeImageLabel('icons/sundries/documents/book-blue.webp'),
      'book-blue'
    );
  });

  it('getRecipeImageLabel handles empty or invalid input gracefully', () => {
    assert.equal(getRecipeImageLabel(''), '');
    assert.equal(getRecipeImageLabel(null), '');
  });

  it('icon list includes expected blueprint recipe icons', () => {
    const paths = new Set(RECIPE_IMAGE_ICONS);
    const expected = [
      'icons/sundries/documents/blueprint-recipe-alchemical.webp',
      'icons/sundries/documents/blueprint-recipe-sword.webp',
      'icons/sundries/documents/blueprint-recipe-flask.webp',
      'icons/sundries/documents/blueprint-recipe-tome.webp'
    ];
    for (const path of expected) {
      assert.ok(paths.has(path), `Expected icon list to contain: ${path}`);
    }
  });

  it('icon list includes expected document and scroll icons', () => {
    const paths = new Set(RECIPE_IMAGE_ICONS);
    const expected = [
      'icons/sundries/documents/rolled-scroll.webp',
      'icons/sundries/documents/book-blue.webp',
      'icons/sundries/documents/contract.webp',
      'icons/sundries/documents/map.webp',
      'icons/sundries/documents/note.webp'
    ];
    for (const path of expected) {
      assert.ok(paths.has(path), `Expected icon list to contain: ${path}`);
    }
  });
});
