/**
 * Ratchets the oversized files and functions under `src/` (issue 1659), so every Phase 4 and 5
 * extraction lowers a number rather than reporting a win nothing checked.
 *
 * Lines are PHYSICAL, comments and blanks included, which is the measure the issue's own figures
 * use. A change that only edits comments can therefore push a unit across a threshold; it re-pins
 * here in the same commit.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { test } from 'node:test';

import { byCodePoint, ledgerGate } from './helpers/ratchetBaseline.js';
import { collectSources, repoRoot } from './helpers/sourceScan.js';
import {
  FILE_THRESHOLDS,
  FUNCTION_THRESHOLD,
  measureComponentFunctions,
  measureModuleFunctions,
  physicalLines,
} from './helpers/unitSizes.js';

const LEDGER_PATH = resolve(import.meta.dirname, 'file-size-ledger.txt');

const REGENERATE =
  'UPDATE_FILE_SIZE_LEDGER=1 node --conditions=browser --test ' +
  'tests/file-size-ledger.test.js, then review the diff';

const SCANNED_EXTENSIONS = Object.freeze(['.js', '.mjs', '.svelte']);

const extensionOf = (file) => file.slice(file.lastIndexOf('.'));

/**
 * `path` for an oversized file, `path::qualified>symbol` for an oversized function. A component's
 * file size is the whole file — markup, script and style — matching the figures the issue quotes,
 * while its functions are read from the script blocks.
 */
function buildLedger() {
  const corpus = collectSources(resolve(repoRoot, 'src'), { extensions: [...SCANNED_EXTENSIONS] });
  const entries = [];
  for (const [file, text] of Object.entries(corpus)) {
    const extension = extensionOf(file);
    const lines = physicalLines(text);
    if (lines > FILE_THRESHOLDS[extension]) entries.push([file, lines]);
    const measured =
      extension === '.svelte' ? measureComponentFunctions(text) : measureModuleFunctions(text);
    for (const unit of measured) {
      if (unit.lines > FUNCTION_THRESHOLD) entries.push([`${file}::${unit.symbol}`, unit.lines]);
    }
  }
  return Object.fromEntries(entries.sort(([left], [right]) => byCodePoint(left, right)));
}

const gate = ledgerGate({
  ledgerPath: LEDGER_PATH,
  regenerateEnv: 'UPDATE_FILE_SIZE_LEDGER',
  build: buildLedger,
  wording: {
    subject: 'oversized files and functions',
    regenerate: REGENERATE,
    structuralHint:
      'A unit appears when it crosses its threshold and vanishes when it falls below; an ' +
      'extraction is expected to remove entries, and adding one needs a reason.',
    roseHint: 'means a unit this epic exists to shrink has grown instead',
    fellHint: 'needs the ledger lowered to bank the extraction',
  },
});

test('the file-size ledger matches the pinned baseline exactly', () => {
  gate.check(assert);
});

test('the thresholds are the two the issue states, and exclusive', () => {
  assert.equal(FILE_THRESHOLDS['.svelte'], 500);
  assert.equal(FILE_THRESHOLDS['.js'], 800);
  assert.equal(FILE_THRESHOLDS['.mjs'], 800);
  assert.equal(FUNCTION_THRESHOLD, 100);
  // Exclusive: a unit exactly at its threshold is not oversized.
  const atThreshold = `${'x\n'.repeat(799)}x`;
  assert.equal(physicalLines(atThreshold), 800);
  assert.equal(physicalLines(atThreshold) > FILE_THRESHOLDS['.js'], false);
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
