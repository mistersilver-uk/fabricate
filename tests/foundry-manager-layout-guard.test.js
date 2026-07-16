import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assertExpectedSelectorsPresent,
  expectedSelectorsForManagerSurface,
  MANAGER_SURFACE_EXPECTED_SELECTORS,
} from '../scripts/lib/managerLayoutGuards.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HARNESS_PATH = join(__dirname, '..', 'scripts', 'foundry-test-run.mjs');

// Per-element metrics exactly as `assertManagerLayoutStable` builds them: one
// record per matched element, each carrying its `.selector`.
function elementMetrics(...selectors) {
  return selectors.map((selector, index) => ({
    selector,
    index,
    width: 100,
    height: 20,
    clientWidth: 100,
    scrollWidth: 100,
    text: '',
  }));
}

// ── assertExpectedSelectorsPresent: passes when all expected present ─────────

test('passes when every expected selector matched at least one element', () => {
  const metrics = elementMetrics(
    '.manager-recipe-row',
    '.manager-recipe-row',
    '.manager-recipe-identity'
  );
  assert.doesNotThrow(() =>
    assertExpectedSelectorsPresent(metrics, ['.manager-recipe-row'], 'recipes normal')
  );
});

test('passes with the pre-summarised {selector,count} shape', () => {
  const metrics = [
    { selector: '.manager-component-row', count: 4 },
    { selector: '.manager-component-identity', count: 4 },
  ];
  assert.doesNotThrow(() =>
    assertExpectedSelectorsPresent(metrics, ['.manager-component-row'], 'components normal')
  );
});

// ── The mutation demo: a renamed/removed class drops to zero and throws ──────

test('throws naming the expected selector when a class is renamed to zero matches', () => {
  // Simulate `.manager-recipe-row` renamed away: the surface still renders other
  // selectors, but the pinned critical one matched nothing.
  const metrics = elementMetrics(
    '.manager-recipe-renamed',
    '.manager-recipe-identity'
  );
  assert.throws(
    () => assertExpectedSelectorsPresent(metrics, ['.manager-recipe-row'], 'recipes normal'),
    (error) => {
      assert.match(error.message, /\.manager-recipe-row/);
      assert.match(error.message, /recipes normal/);
      assert.match(error.message, /matched no elements/);
      return true;
    }
  );
});

test('names EVERY missing expected selector, not just the first', () => {
  assert.throws(
    () => assertExpectedSelectorsPresent(elementMetrics('.manager-fact'), ['.a', '.b'], 'x'),
    (error) => {
      assert.match(error.message, /\.a/);
      assert.match(error.message, /\.b/);
      return true;
    }
  );
});

test('an expected selector with zero matches (absent from metrics) throws', () => {
  assert.throws(() =>
    assertExpectedSelectorsPresent([], ['.manager-tools-row'], 'tools normal')
  );
});

// ── Tolerant of extra/unexpected selectors ──────────────────────────────────

test('ignores extra selectors the surface renders beyond the expected set', () => {
  const metrics = elementMetrics(
    '.manager-environment-row',
    '.manager-environment-identity',
    '.manager-inspector-card',
    '.manager-fact'
  );
  assert.doesNotThrow(() =>
    assertExpectedSelectorsPresent(metrics, ['.manager-environment-row'], 'environments normal')
  );
});

// ── Empty / defensive expected → no assertion (never a false failure) ────────

test('empty expected asserts nothing even against empty metrics', () => {
  assert.doesNotThrow(() => assertExpectedSelectorsPresent([], [], 'unmapped surface'));
  assert.doesNotThrow(() => assertExpectedSelectorsPresent([], undefined, 'unmapped surface'));
});

test('a summarised record with count 0 counts as missing', () => {
  const metrics = [{ selector: '.manager-essence-row', count: 0 }];
  assert.throws(() =>
    assertExpectedSelectorsPresent(metrics, ['.manager-essence-row'], 'essences normal')
  );
});

// ── The per-surface map lookup ───────────────────────────────────────────────

test('expectedSelectorsForManagerSurface returns the pinned selectors for a mapped label', () => {
  assert.deepEqual(expectedSelectorsForManagerSurface('recipes normal'), ['.manager-recipe-row']);
  assert.deepEqual(expectedSelectorsForManagerSurface('component edit normal'), [
    '.manager-component-edit-view',
  ]);
});

test('expectedSelectorsForManagerSurface returns [] for an unmapped label', () => {
  assert.deepEqual(expectedSelectorsForManagerSurface('checks validation tab'), []);
  assert.deepEqual(expectedSelectorsForManagerSurface('not a real surface'), []);
});

// ── Drift guard: every pinned selector is one the harness actually measures ──
// If a pinned selector is not in the harness's measured `selectors` list, the
// guard can NEVER see it (metrics never carries it) → a guaranteed false
// failure at smoke time. Fail here instead.

test('every pinned selector is in the harness measured-selector list', async () => {
  const source = await readFile(HARNESS_PATH, 'utf8');
  const measured = new Set(
    Array.from(source.matchAll(/'(\.[a-z-]+)'/g)).map((match) => match[1])
  );
  const pinned = new Set(
    Object.values(MANAGER_SURFACE_EXPECTED_SELECTORS).flatMap((selectors) => selectors)
  );
  for (const selector of pinned) {
    assert.ok(
      measured.has(selector),
      `${selector} is pinned in MANAGER_SURFACE_EXPECTED_SELECTORS but not measured by assertManagerLayoutStable`
    );
  }
});
