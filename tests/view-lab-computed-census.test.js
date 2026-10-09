/**
 * The View Lab's computed census (`scripts/lib/viewLabComputedCensus.js`): the band and mono
 * verdicts it judges every captured frame by, and the capture driver running it before the
 * screenshot. The collector itself is proved in Chromium by a planted off-band corner.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  bandCorner,
  censusFindings,
  cornerVerdict,
  monoVerdict,
} from '../scripts/lib/viewLabComputedCensus.js';

const ROOT = resolve(import.meta.dirname, '..');

test('each ladder height takes its band corner', () => {
  const bands = [22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 44].map((height) => [
    height,
    bandCorner(height),
  ]);
  assert.deepEqual(bands, [
    [22, 6],
    [24, 6],
    [26, 7],
    [28, 7],
    [30, 7],
    [32, 7],
    [34, 9],
    [36, 9],
    [38, 9],
    [40, 9],
    [44, 11],
  ]);
});

test('a box off its band fails, and the kinds the spec rounds otherwise pass', () => {
  const verdicts = (cases) =>
    cases.map(([height, radius]) => [height, radius, cornerVerdict({ height, radius }) !== null]);
  assert.deepEqual(
    verdicts([
      [22, 6],
      [22, 9],
      [26, 6],
      [30, 7],
      [30, 9],
      [32, 9],
      [34, 7],
      [34, 9],
      [38, 6],
      [38, 11],
      [44, 9],
      [44, 11],
      [44, 7],
      [28, 0],
      [28, 14],
      [24, 999],
      [33, 3],
      [48, 3],
    ]),
    [
      [22, 6, false],
      [22, 9, true],
      [26, 6, true],
      [30, 7, false],
      [30, 9, true],
      [32, 9, false],
      [34, 7, true],
      [34, 9, false],
      [38, 6, true],
      [38, 11, false],
      [44, 9, false],
      [44, 11, false],
      [44, 7, true],
      [28, 0, false],
      [28, 14, false],
      [24, 999, false],
      [33, 3, false],
      [48, 3, false],
    ]
  );
});

test('a ruled kind passes at its own corner only, on every class it names', () => {
  const verdict = (classes, height, radius) =>
    cornerVerdict({ height, radius, classes }) === null;
  const compact = ['fabricate-search', 'is-compact', 'fabricate-typeahead'];
  assert.equal(verdict(compact, 34, 6), true, "the compact search's ruled box");
  assert.equal(verdict(['fabricate-search'], 34, 6), false, 'every class a kind names is needed');
  assert.equal(verdict(compact, 34, 7), false, 'a kind passes its own corner only');
  assert.equal(verdict(['manager-nav-subitem', 'is-active'], 40, 7), true, 'a wrapped nav row');
  assert.equal(verdict(['manager-nav-subitem-x'], 40, 7), false, 'a class is matched whole');
});

test('mono text above 500 fails, and the findings name each element once', () => {
  assert.equal(monoVerdict({ weight: 500 }), null);
  assert.match(monoVerdict({ weight: 600 }), /above the face's 500/);
  assert.deepEqual(
    censusFindings({
      boxes: [
        { element: 'button.a', height: 34, radius: 6 },
        { element: 'button.a', height: 34, radius: 6 },
        { element: 'span.b', height: 22, radius: 6 },
      ],
      texts: [
        { element: 'span.c', weight: 700 },
        { element: 'span.d', weight: 400 },
      ],
    }),
    [
      'button.a: 34px tall at radius 6, where its band draws 9',
      "span.c: mono at weight 700, above the face's 500",
    ]
  );
});

test('the capture driver runs the census on every case before taking its screenshot', () => {
  const driver = readFileSync(resolve(ROOT, 'scripts/view-lab-screenshots.mjs'), 'utf8');
  const census = driver.indexOf('await assertComputedCensus(page, appId, label)');
  assert.notEqual(census, -1, 'the runner must invoke the computed census');
  assert.ok(driver.indexOf('frame.screenshot(', census) > census, 'before frame.screenshot()');
});
