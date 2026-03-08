/**
 * T-091: CSS class presence tests for Quick-Recipe sections (Favourites, Recents)
 *
 * These tests verify that the required CSS classes are present in the stylesheet.
 * They act as regression guards: if a class is removed from fabricate.css the
 * test will fail before the visual breakage reaches users.
 *
 * Test cases:
 *  1. fabricate.css defines .quick-recipe-icon with bounded dimensions
 *  2. fabricate.css defines .quick-recipe-item with flex layout
 *  3. fabricate.css defines .quick-recipe-name with overflow/ellipsis rules
 *  4. fabricate.css defines .quick-recipe-list
 *  5. fabricate.css defines .fabricate-quick-section
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cssPath = resolve(__dirname, '../styles/fabricate.css');
const css = readFileSync(cssPath, 'utf8');

// ---------------------------------------------------------------------------
// Test 1: .quick-recipe-icon has bounded dimensions
// ---------------------------------------------------------------------------

test('T-091 CSS: .quick-recipe-icon rule exists with explicit width and height', () => {
  assert.ok(css.includes('.quick-recipe-icon'), '.quick-recipe-icon selector must be present in fabricate.css');

  // Extract the .quick-recipe-icon block
  const iconIdx = css.indexOf('.quick-recipe-icon');
  const blockStart = css.indexOf('{', iconIdx);
  const blockEnd = css.indexOf('}', blockStart);
  const block = css.slice(blockStart, blockEnd);

  assert.ok(block.includes('width'), '.quick-recipe-icon must declare width to bound the image');
  assert.ok(block.includes('height'), '.quick-recipe-icon must declare height to bound the image');
  assert.ok(block.includes('object-fit'), '.quick-recipe-icon must declare object-fit to prevent image distortion');
});

// ---------------------------------------------------------------------------
// Test 2: .quick-recipe-item has flex layout
// ---------------------------------------------------------------------------

test('T-091 CSS: .quick-recipe-item rule exists with flex display', () => {
  assert.ok(css.includes('.quick-recipe-item'), '.quick-recipe-item selector must be present in fabricate.css');

  const itemIdx = css.indexOf('.quick-recipe-item');
  const blockStart = css.indexOf('{', itemIdx);
  const blockEnd = css.indexOf('}', blockStart);
  const block = css.slice(blockStart, blockEnd);

  assert.ok(block.includes('display'), '.quick-recipe-item must declare display');
  assert.ok(block.includes('flex'), '.quick-recipe-item must use flex layout for icon+name alignment');
});

// ---------------------------------------------------------------------------
// Test 3: .quick-recipe-name has overflow/ellipsis rules
// ---------------------------------------------------------------------------

test('T-091 CSS: .quick-recipe-name rule exists with text-overflow ellipsis', () => {
  assert.ok(css.includes('.quick-recipe-name'), '.quick-recipe-name selector must be present in fabricate.css');

  const nameIdx = css.indexOf('.quick-recipe-name');
  const blockStart = css.indexOf('{', nameIdx);
  const blockEnd = css.indexOf('}', blockStart);
  const block = css.slice(blockStart, blockEnd);

  assert.ok(block.includes('overflow'), '.quick-recipe-name must declare overflow to clip long names');
  assert.ok(block.includes('ellipsis'), '.quick-recipe-name must use text-overflow: ellipsis');
});

// ---------------------------------------------------------------------------
// Test 4: .quick-recipe-list exists
// ---------------------------------------------------------------------------

test('T-091 CSS: .quick-recipe-list selector is present in fabricate.css', () => {
  assert.ok(css.includes('.quick-recipe-list'), '.quick-recipe-list selector must be defined');
});

// ---------------------------------------------------------------------------
// Test 5: .fabricate-quick-section exists
// ---------------------------------------------------------------------------

test('T-091 CSS: .fabricate-quick-section selector is present in fabricate.css', () => {
  assert.ok(css.includes('.fabricate-quick-section'), '.fabricate-quick-section selector must be defined');
});
