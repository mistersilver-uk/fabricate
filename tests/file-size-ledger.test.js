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

import { byCodePoint, pinnedLedgerGate } from './helpers/ratchetBaseline.js';
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
  return Object.fromEntries(entries.sort(([left], [right]) => byCodePoint(left, right)));
}

const gate = pinnedLedgerGate({
  test,
  assert,
  title: 'the file-size ledger matches the pinned baseline exactly',
  ledgerPath: LEDGER_PATH,
  regenerateEnv: 'UPDATE_FILE_SIZE_LEDGER',
  build: buildLedger,
  subject: 'oversized files and functions',
  regenerate: REGENERATE,
  structuralHint:
    'A unit appears when it crosses its threshold and vanishes when it falls below; an ' +
    'extraction is expected to remove entries, and adding one needs a reason. A `#N` suffix ' +
    'is positional among same-named functions, so an added or removed sibling renumbers those ' +
    'after it: a matched added/removed pair at the same line count is that renumber, not debt.',
  roseHint: 'means a unit this epic exists to shrink has grown instead',
  fellHint: 'needs the ledger lowered to bank the extraction',
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

test('the ledger reports the two figures epic 1656 tracks', (t) => {
  // The one pair a reviewer can check against the issue without reading 229 rows.
  if (gate.regenerated()) return t.skip('this run rewrote the ledger');
  const keys = Object.keys(gate.pinned());
  const files = keys.filter((key) => !key.includes('::')).length;
  // 127/124 as of issue 1648. `src/systems/journalRunAuthority.js` crossed the 800-line file
  // threshold at 820, and `createFoundryJournalRunAuthority` crossed the 100-line function
  // threshold at 113, when the claim-release repair taught `deleteClaim` to tolerate a page the
  // server has already removed — `entry.pages` is broadcast-fed, so a stale local copy made
  // `deleteEmbeddedDocuments` throw and stranded a run.
  //
  // Recorded as debt rather than absorbed: the epic tracks these two figures so a rise is
  // visible, and this one is. The obvious remedy is to re-home the three claim-PAGE adapters
  // (`createClaim`/`readClaim`/`deleteClaim`) beside arbitration in `journalRunLedger.js`,
  // which is where the knowledge that a claim is an embedded page with a fixed `_id` belongs;
  // that is a pure move and it takes the file back under. It is deliberately NOT bundled into
  // the defect fix a blocked maintainer was waiting on.
  // 128 as of the consumption-record repair: `src/ui/svelte/apps/journal/StepDetails.svelte`
  // crossed at 535. A started stage now renders its recorded RECEIPT where it used to render a
  // live held-against-needed probe of an inventory the stage had already emptied, so the file
  // carries both surfaces and the rule that picks between them.
  //
  // Recorded as debt rather than absorbed, and the remedy is the seam the change already drew:
  // the receipt is a self-contained surface reading `consumptionRecord` alone, so it lifts into
  // its own component without a prop thread back. That move also gains it a mount test of its
  // own, which the block cannot have while it is one branch inside a larger file. Not bundled
  // here, because a blocked maintainer is waiting on the defect this commit fixes, and a new
  // `.svelte` child additionally has to join `writeCompiledSvelte` and four mount harnesses.
  // 126 after merging origin/main, which condensed 38 component headers and took Chip and
  // IconButton back under the .svelte threshold -- two of this branch's entries removed by
  // someone else's work rather than by ours.
  //
  // 123/123 after merging #1682's sweep, which took `src/models/Recipe.js` under the 800-line
  // file threshold and its constructor under the 100-line function threshold. Regenerated from
  // the merged tree rather than reconciled by hand: these counts are derived, so picking a side
  // of the conflict would have pinned a figure no tree actually has.
  //
  // 122/120 on this branch. Four rows leave the ledger with its comment mass --
  // `interactableRegionFlags.js::buildInteractableBehaviorSchema`, `main.js::Hooks.once>on`,
  // `migrateRecipeForModeChange` and `remapWorldScopeIdentityFlags.js` -- on top of the figure
  // main carries.
  //
  // 116/120 here: on top of everything main now carries, the issue-1681 sweep of the 15 manager
  // sub-folders takes six more units under the file threshold on comment lines alone --
  // `essences/EssenceBrowserInspector.svelte`, `essences/EssenceBulkEditPanel.svelte`,
  // `essences/essenceStudio.js`, `tools/ToolBehaviorPreview.svelte`,
  // `tools/ToolBrowserInspector.svelte` and `tools/toolStudio.js`. None of it is debt
  // discharged: the code is what it was, and only the measurement moved.
  assert.equal(files, 116, 'oversized files');
  assert.equal(keys.length - files, 120, 'oversized functions');
});
