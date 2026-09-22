/**
 * Bounds the oversized files and functions under `src/` (issue 1659), so a unit this epic exists
 * to shrink cannot grow materially, and a unit that shrinks costs no ledger edit (issue 1914).
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { test } from 'node:test';

import { byCodePoint, ceilingLedgerGate } from './helpers/ratchetBaseline.js';
import { collectSources, repoRoot } from './helpers/sourceScan.js';
import {
  FILE_THRESHOLDS,
  FUNCTION_THRESHOLD,
  measureComponentFunctions,
  measureModuleFunctions,
  physicalLines,
} from './helpers/unitSizes.js';

const LEDGER_PATH = resolve(import.meta.dirname, 'file-size-ledger.txt');

const RUN = 'node --conditions=browser --test tests/file-size-ledger.test.js';

const SCANNED_EXTENSIONS = Object.freeze(['.js', '.mjs', '.svelte']);

/** Below this the scan is truncated rather than clean; `src/` holds ~840 scanned files. */
const SCAN_FLOOR = 501;

/** Enough rows that a truncated scan cannot regenerate the ledger down to a handful. */
const ROW_FLOOR = 150;

/** A file row rounds to fifty lines, a function row to ten; both after five percent of headroom. */
function ceilingFor(key, lines) {
  const step = key.includes('::') ? 10 : 50;
  return Math.ceil((lines * 1.05) / step) * step;
}

const extensionOf = (file) => file.slice(file.lastIndexOf('.'));

/** `path` for an oversized file, `path::qualified>symbol` for an oversized function. */
function buildLedger() {
  const corpus = collectSources(resolve(repoRoot, 'src'), { extensions: [...SCANNED_EXTENSIONS] });
  const entries = [];
  for (const [file, text] of Object.entries(corpus)) {
    const extension = extensionOf(file);
    const threshold = FILE_THRESHOLDS[extension];
    if (threshold === undefined) {
      throw new Error(
        `"${file}" has extension "${extension}", which is scanned but carries no size threshold. ` +
          'Treating it as never-oversized is how a widened corpus goes half-vacuous: add the ' +
          'extension to FILE_THRESHOLDS or drop it from SCANNED_EXTENSIONS.'
      );
    }
    const lines = physicalLines(text);
    if (lines > threshold) entries.push([file, lines]);
    let measured;
    try {
      measured =
        extension === '.svelte' ? measureComponentFunctions(text) : measureModuleFunctions(text);
    } catch (error) {
      // Neither parser knows the real path — the module parser names only its probe file — so
      // attribute it here rather than leaving the reader to bisect the corpus.
      throw new Error(`${file} failed to parse: ${error.message}`, { cause: error });
    }
    for (const unit of measured) {
      if (unit.lines > FUNCTION_THRESHOLD) entries.push([`${file}::${unit.symbol}`, unit.lines]);
    }
  }
  return {
    observed: Object.fromEntries(entries.sort(([left], [right]) => byCodePoint(left, right))),
    scanned: Object.keys(corpus).length,
  };
}

const gate = ceilingLedgerGate({
  test,
  assert,
  title: 'no oversized file or function under `src/` is past its ledger ceiling',
  ledgerPath: LEDGER_PATH,
  updateEnv: 'UPDATE_FILE_SIZE_LEDGER',
  tightenEnv: 'TIGHTEN_FILE_SIZE_LEDGER',
  build: buildLedger,
  ceiling: ceilingFor,
  shrink: 'allow',
  floor: SCAN_FLOOR,
  wording: {
    subject: 'oversized files and functions',
    update: `UPDATE_FILE_SIZE_LEDGER=1 ${RUN}`,
    tighten: `TIGHTEN_FILE_SIZE_LEDGER=1 ${RUN}`,
    addedHint:
      'A unit with no row has just crossed its threshold, and adding to the nearest large file ' +
      'instead of extracting one is the shape this gate exists to catch. A `#N` suffix is ' +
      'positional among same-named functions, so an added or removed sibling renumbers those ' +
      'after it: a new row matching a dropped one at the same size is that renumber, not debt.',
    staleHint: 'A row vanishes when its unit falls below the threshold, which is a win.',
  },
});

test('the thresholds are the two the issue states, and exclusive', () => {
  assert.equal(FILE_THRESHOLDS['.svelte'], 500);
  assert.equal(FILE_THRESHOLDS['.js'], 800);
  assert.equal(FILE_THRESHOLDS['.mjs'], 800);
  assert.equal(FUNCTION_THRESHOLD, 100);
  assert.deepStrictEqual(
    Object.keys(FILE_THRESHOLDS).sort(byCodePoint),
    [...SCANNED_EXTENSIONS].sort(byCodePoint),
    'every scanned extension has a threshold, or a widened corpus goes half-vacuous'
  );
  // Exclusive, proved on the shape every real file has: one ending in a newline. A fixture
  // without the terminator is the one input where an off-by-one here does not show.
  const terminated = 'x\n'.repeat(800);
  assert.equal(physicalLines(terminated), 800);
  assert.equal(physicalLines(terminated) > FILE_THRESHOLDS['.js'], false);
  assert.equal(physicalLines('x\n'.repeat(801)) > FILE_THRESHOLDS['.js'], true);
  assert.equal(physicalLines('x\n'.repeat(500)) > FILE_THRESHOLDS['.svelte'], false);
});

test('a nested function is measured, and its enclosing one is not shortened by it', () => {
  const source = [
    'export function outer() {',
    ...Array.from({ length: 3 }, () => '  // body'),
    '  function inner() {',
    ...Array.from({ length: 2 }, () => '    // inner body'),
    '  }',
    '  return inner;',
    '}',
  ].join('\n');
  const measured = measureModuleFunctions(source);
  const outer = measured.find((unit) => unit.symbol === 'outer');
  const inner = measured.find((unit) => unit.symbol === 'outer>inner');
  assert.ok(outer && inner, 'both functions are measured');
  assert.equal(outer.lines, 10);
  assert.equal(inner.lines, 4);
});

test('a regex quantifier does not derange the scan, which is why it parses', () => {
  const source = [
    String.raw`const RE = /@[A-Za-z]{1,32}\[([^\]]{0,2048})\]/gu;`,
    'export function after() {',
    '  return RE;',
    '}',
  ].join('\n');
  const measured = measureModuleFunctions(source);
  assert.deepStrictEqual(
    measured.map((unit) => unit.symbol),
    ['after']
  );
});

test('two same-named functions in one file get distinct qualified keys', () => {
  const source = [
    'export function a() {',
    '  function helper() {}',
    '  return helper;',
    '}',
    'export function b() {',
    '  function helper() {}',
    '  return helper;',
    '}',
  ].join('\n');
  const symbols = measureModuleFunctions(source).map((unit) => unit.symbol);
  assert.ok(symbols.includes('a>helper'));
  assert.ok(symbols.includes('b>helper'));
});

test('a repeated name takes an ordinal, so a collision cannot drop an entry', () => {
  const source = [
    'export const run = [',
    '  () => {',
    '    return 1;',
    '  },',
    '  () => {',
    '    return 2;',
    '  },',
    '];',
  ].join('\n');
  const symbols = measureModuleFunctions(source).map((unit) => unit.symbol);
  assert.equal(new Set(symbols).size, symbols.length, 'every key is distinct');
  assert.ok(symbols.some((symbol) => symbol.endsWith('#2')));
});

test('a component reports its script functions, and its file size is the whole file', () => {
  const source = [
    '<script>',
    '  export function handle() {',
    '    return 1;',
    '  }',
    '</script>',
    '<div>markup</div>',
    '<style>.x { color: red; }</style>',
  ].join('\n');
  assert.deepStrictEqual(
    measureComponentFunctions(source).map((unit) => unit.symbol),
    ['handle']
  );
  assert.equal(physicalLines(source), 7);
});

test('a name used in both script blocks keeps distinct keys, so neither row is dropped', () => {
  const source = [
    '<script module>',
    '  export function shared() {}',
    '</script>',
    '<script>',
    '  function shared() {}',
    '</script>',
    '<p />',
  ].join('\n');
  const symbols = measureComponentFunctions(source).map((unit) => unit.symbol);
  assert.equal(new Set(symbols).size, symbols.length);
});

test('a callback is keyed by the call it is passed to, not by its position', () => {
  const source = ["Hooks.once('ready', () => {", '  return 1;', '});'].join('\n');
  assert.deepStrictEqual(
    measureModuleFunctions(source).map((unit) => unit.symbol),
    ['Hooks.once']
  );
});

test('an inline handler in the markup is measured, not only the script blocks', () => {
  const source = [
    '<script>',
    '  let n = 0;',
    '</script>',
    '<button onclick={() => {',
    '  n += 1;',
    '}}>go</button>',
  ].join('\n');
  const measured = measureComponentFunctions(source);
  assert.equal(measured.length, 1, 'the markup arrow is measured');
  assert.equal(measured[0].lines, 3);
});

test('the headroom is proportional, so it is five percent of the unit at any size', () => {
  // A fixed grid would hand a just-crossed file most of a step for free and the largest file
  // almost nothing; these four are the sizes the ledger actually holds.
  assert.equal(ceilingFor('a.svelte', 502), 550);
  assert.equal(ceilingFor('a.js', 819), 900);
  assert.equal(ceilingFor('src/main.js', 16609), 17450);
  assert.equal(ceilingFor('a.js::fn', 101), 110);
  assert.ok(ceilingFor('a.js', 800) > 800, 'a ceiling is never below the unit it bounds');
});

test('the ledger reports the two figures epic 1656 tracks', (t) => {
  // The pair a reviewer checks against the issue without reading the rows. Floored rather than
  // pinned: the exact targets live on #1656, and pinning them here is a second conflict site.
  if (gate.regenerated()) return t.skip('this run rewrote the ledger');
  // Read off the SCAN, not the committed file: a scan that stopped matching leaves the ledger
  // byte-identical, so a floor read off the file clears while nothing at all was measured.
  const keys = Object.keys(gate.current().observed);
  const files = keys.filter((key) => !key.includes('::')).length;
  t.diagnostic(`${files} oversized files and ${keys.length - files} oversized functions`);
  assert.ok(
    keys.length > ROW_FLOOR,
    `only ${keys.length} units measured, below the floor of ${ROW_FLOOR}; a truncated scan ` +
      'would look exactly like this'
  );
});
