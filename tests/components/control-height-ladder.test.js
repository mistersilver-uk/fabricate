/**
 * The control-height ladder is a rule the product can be checked against (issue 1391).
 * ── WHAT MAKES THIS NOT VACUOUS ─────────────────────────────────────────────────────────
 * An absence gate over an empty corpus passes forever. Four independent controls stand against
 * that, and they are independent on purpose rather than four spellings of one floor:
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import {
  STYLE_CORPUS,
  assertGateCases,
  checkGate,
  emptyMarkerFailure,
  exemptAt,
  gateOver,
  styleCorpusOf,
  workingTree,
} from '../helpers/designSystemRatchet.js';
import { repoRoot } from '../helpers/sourceScan.js';
import { MAX_VAR_CHAIN_DEPTH, pixelValuesIn, scanPixelValues } from '../helpers/styleBlockScan.js';

import {
  FLOOR_REFERENCE_STYLESHEET_DECLARATIONS,
  FLOOR_REFERENCE_SVELTE_DECLARATIONS,
  LADDER_RUNGS,
  RETIRED_CONTROL_HEIGHTS,
  SCANNED_HEIGHT_PROPERTIES,
} from './control-height-known-literals.js';

/** Floors with deliberate headroom below the roughly 530 and 440 they were chosen against. */
// 470 against 530 until issue 1498 deleted the 367 rule blocks that matched no element.
const STYLESHEET_DECLARATION_FLOOR = 435;
const SVELTE_DECLARATION_FLOOR = 380;

/** Every declaration of one side's style corpus that can reach a retired height. */
const retiredHeights = (corpus) =>
  scanPixelValues({
    corpus,
    properties: SCANNED_HEIGHT_PROPERTIES,
    values: RETIRED_CONTROL_HEIGHTS,
  });

/** The corpus is walked once, lazily, so a walk failure is reported as a test. */
let cached = null;
function scan() {
  if (cached === null) {
    const { readFile, listFiles } = workingTree(STYLE_CORPUS);
    const { styles: corpus, sources } = styleCorpusOf(readFile, listFiles());
    cached = { corpus, sources, retired: retiredHeights(corpus) };
  }
  return cached;
}

/** One side's retired heights, one site per occurrence, netting a move within a file. */
const RETIRED_HEIGHT_GATE = gateOver([STYLE_CORPUS], (readFile, files) =>
  retiredHeights(styleCorpusOf(readFile, files).styles).occurrences.map((record) => ({
    file: record.file,
    line: record.line,
    id: `${record.property} ${record.value}px`,
    value: `${record.value}px`,
  }))
);

/** `styles/**` on one side, Svelte scoped blocks on the other. */
const isStylesheet = (record) => record.file.startsWith('styles/');

/** The `### Requirement:` section that owns the ladder, so a fragment cannot match elsewhere. */
function geometryRequirement() {
  const spec = readFileSync(join(repoRoot, 'openspec/specs/design-system/spec.md'), 'utf8');
  const heading = '### Requirement: Geometry comes from the published ladders';
  const start = spec.indexOf(heading);
  assert.ok(
    start !== -1,
    'the design-system spec no longer carries a "Geometry comes from the published ladders" ' +
      'requirement. This gate exists only to enforce that requirement — if it has been renamed, ' +
      'retarget this test; if it has been dropped, delete this gate deliberately rather than ' +
      'leaving it asserting a rule the specs no longer make.'
  );
  const end = spec.indexOf('\n### ', start + heading.length);
  return spec.slice(start, end === -1 ? spec.length : end);
}

test('the design-system spec still publishes the ladder this gate enforces', () => {
  const requirement = geometryRequirement();

  assert.ok(
    requirement.includes('MUST be one of 26, 28, 30, 34, 38, or 44'),
    'the spec no longer states the closed control-height ladder as a list of rungs'
  );
  assert.ok(
    requirement.includes('are RETIRED as CONTROL heights'),
    'the spec no longer retires any height, so this gate is banning values on its own authority'
  );
  assert.ok(
    requirement.includes('MUST NOT be reintroduced'),
    'the retirement has softened from a prohibition into a preference'
  );

  // The numerals, individually, so a reworded sentence that quietly drops one is caught. Asserted
  // FROM the constants, which ties the gate's own vocabulary to the spec's rather than to a
  // second hand-written copy of it.
  for (const rung of LADDER_RUNGS) {
    assert.ok(
      new RegExp(String.raw`\b${rung}\b`).test(requirement),
      `the spec's geometry requirement no longer names the ${rung} rung`
    );
  }
  for (const retired of RETIRED_CONTROL_HEIGHTS) {
    assert.ok(
      new RegExp(String.raw`\b${retired}\b`).test(requirement),
      `the spec's geometry requirement no longer names ${retired} as retired`
    );
  }
});

test('both stylesheet corpora are still being scanned', () => {
  const { corpus, retired } = scan();
  const stylesheet = retired.declarations.filter(isStylesheet).length;
  const svelte = retired.declarations.length - stylesheet;

  assert.ok(
    stylesheet >= STYLESHEET_DECLARATION_FLOOR,
    `only ${stylesheet} height declarations found under styles/, against roughly ` +
      `${FLOOR_REFERENCE_STYLESHEET_DECLARATIONS} when the floor of ${STYLESHEET_DECLARATION_FLOOR} ` +
      'was set. The global sheet has not shrunk by a fifth — the scan has stopped reading it.'
  );
  assert.ok(
    svelte >= SVELTE_DECLARATION_FLOOR,
    `only ${svelte} height declarations found in Svelte <style> blocks, against roughly ` +
      `${FLOOR_REFERENCE_SVELTE_DECLARATIONS} when the floor of ${SVELTE_DECLARATION_FLOOR} was ` +
      'set. This is the corpus stylelint cannot reach, so nothing else in the repository would ' +
      'notice: the likely cause is the `<style>` extractor, not 50 deleted components.'
  );
  assert.ok(
    Object.keys(corpus).length > 150,
    `only ${Object.keys(corpus).length} files contributed any CSS at all`
  );
});

test('every live rung is still in use in BOTH corpora', () => {
  const { corpus } = scan();

  // ONE pass for all six rungs, not one pass per rung. `scanPixelValues` re-reads every
  // declaration in a 24,949-line stylesheet plus 180 Svelte blocks on each call, and every
  // occurrence already carries the rung it matched on `record.value` — so six passes were six
  // spellings of this group-by, over the same corpus, answering the same question.
  const { occurrences } = scanPixelValues({
    corpus,
    properties: SCANNED_HEIGHT_PROPERTIES,
    values: LADDER_RUNGS,
  });
  const missing = [];
  for (const rung of LADDER_RUNGS) {
    const hits = occurrences.filter((record) => record.value === rung);

    // THE GROUP-BY IS WHAT MAKES THIS A PER-RUNG CONTROL.
    assert.ok(
      hits.every((record) => record.value === rung),
      `the ${rung}px group holds an occurrence of another value, so "this rung appears in both ` +
        'corpora" is being decided by some other rung. Every claim below is about this group.'
    );

    const inStylesheet = hits.some(isStylesheet);
    const inSvelte = hits.some((record) => !isStylesheet(record));
    if (!inStylesheet) missing.push(`${rung}px is absent from styles/`);
    if (!inSvelte) missing.push(`${rung}px is absent from Svelte <style> blocks`);
  }

  // Presence, not counts. A rung's count moves whenever anyone edits a screen.
  assert.deepEqual(
    missing,
    [],
    'the scan can no longer see values it certainly still reads, which means it is answering ' +
      'about a smaller corpus than it claims:\n  ' +
      missing.join('\n  ')
  );
});

test('var() resolution is running, and stays well inside its depth cap', () => {
  const { retired } = scan();

  assert.ok(
    retired.maxDepth >= 1,
    'no declaration resolved through a single `var()`, so resolution is inert. A text-only scan ' +
      'passes every other assertion in this file while making the cheapest way to pay this ' +
      'ratchet down "move the literal into a token" — the pixel does not move and the gate goes ' +
      'green.'
  );
  assert.ok(
    retired.maxDepth < MAX_VAR_CHAIN_DEPTH,
    `the deepest var() chain is now ${retired.maxDepth}, at the cap of ${MAX_VAR_CHAIN_DEPTH}. ` +
      'The cap is meant to be slack — the corpus reaches 2 — so this is either a real cycle the ' +
      'visited set did not close or a genuinely deeper chain that needs the cap raised on purpose.'
  );
  assert.deepEqual(
    retired.capReached,
    [],
    'these declarations hit the resolution depth cap, so their candidate sets are INCOMPLETE and ' +
      'a retired value beyond the cap reads as absent:\n  ' +
      retired.capReached.join('\n  ')
  );
});

/**
 * WHAT THIS RATCHET DOES NOT SEE, stated rather than inferred from the name.
 * ACCEPTED, on the requirement's own terms rather than for convenience, and the adjudication is
 * RESTATED because its subject changed: every one of those declarations sizes a THUMBNAIL — a
 * record's art tile, an actor's portrait, or the inventory header's shell around one — and the
 * geometry requirement exempts art and portraits from the control ladder outright, now naming
 * their own published size ladder rather than promising one. That is the same clause that puts
 * `BooksScrollsView.svelte`'s thumbnail on the art ladder's 38. Closing the gap would also mean
 * reading a `style` attribute built by an interpolation, which is a different scanner from this
 * one. So "no new retired control height has been introduced" is a claim about what the two
 * stylesheet corpora DECLARE, not about what the product renders.
 */
test('no new retired control height has been introduced', (t) => {
  checkGate(
    t,
    RETIRED_HEIGHT_GATE,
    'Control height MUST be one of 26, 28, 30, 34, 38 or 44 — see the "Geometry comes from the ' +
      'published ladders" requirement in `openspec/specs/design-system/spec.md`. 32, 36 and 40 ' +
      'are retired, and the ones the base commit already carries are debt owed, not a permission ' +
      'to add to it. The nearest rung is almost always right. Three things this scan counts are ' +
      'not a control, and each takes a ratchet-exempt(design-system) reason at the declaration ' +
      'rather than a snapped value: an art tile or portrait, which the requirement puts on its ' +
      'own size ladder; a slider track or text-area minimum; and a retired value inside a `calc()` ' +
      'that is a CONTENT contribution to a padded well, where snapping 40 to 38 would only shrink ' +
      'the content box. A retired value as a `var()` fallback is reachable only when no ancestor ' +
      'sets the token, so paying it down means choosing a rung for the unparented case, not ' +
      'deleting the fallback.'
  );
});

/** The player keys issue 1523's PR12 still owes; PR12 deletes each one as it snaps the site. */
const PR12_PLAYER_KEYS = Object.freeze([
  'src/ui/svelte/apps/crafting/ComponentSourcesBar.svelte: height 40px',
  'src/ui/svelte/apps/crafting/ComponentSourcesBar.svelte: min-height 40px',
  'src/ui/svelte/apps/crafting/RecipeListRow.svelte: height 32px',
  'src/ui/svelte/apps/crafting/RecipeListRow.svelte: min-height 32px',
  'src/ui/svelte/apps/crafting/ShoppingList.svelte: min-height 36px',
  'src/ui/svelte/apps/inventory/detail/InventoryBookDetail.svelte: min-height 40px',
]);

// ABSOLUTE, not against the base: a site the base already carried passes the ratchet above.
test('every retired height outside the PR12 player keys carries a reasoned marker', () => {
  const { sources, retired } = scan();
  const unmarked = retired.occurrences
    .filter((record) => !exemptAt(record.file, sources[record.file], record.line))
    .map((record) => ({
      key: `${record.file}: ${record.property} ${record.value}px`,
      line: record.line,
    }))
    .filter(({ key }) => !PR12_PLAYER_KEYS.includes(key))
    .map(({ key, line }) => `${key} (line ${line})`);

  assert.deepEqual(
    unmarked,
    [],
    'these retired heights carry no ratchet-exempt(design-system) reason. Snap each to its rung ' +
      'by kind, or mark the art tile, portrait or named exception it is:\n  ' +
      unmarked.join('\n  ')
  );
});

test('no retired control height has been laundered into a private token', () => {
  const { retired } = scan();

  // This is what closes the ratchet's cheapest escape. Rewrite `height: 36px` as `--x: 36px;
  // height: var(--x)` and the file, property, value and COUNT are all unchanged — only the text
  // moves. Resolution keeps the occurrence findable; this keeps it from reading as unchanged.
  const laundered = retired.occurrences
    .filter((record) => !pixelValuesIn(record.raw).includes(record.value))
    .map(
      (record) =>
        `${record.file}:${record.line} ${record.property} ${record.value}px\n      raw:      ` +
        `${record.raw}\n      resolved: ${record.resolved}`
    );

  assert.deepEqual(
    laundered,
    [],
    'a retired control height has been moved into a custom property and read back. The debt has ' +
      'NOT been paid — the control is still that many pixels tall — and the gate above did not ' +
      'move because the scan resolves `var()`. Use a rung of the published ladder:\n  ' +
      laundered.join('\n  ')
  );
});

/* ───────────────────────── proofs against throwaway repositories ───────────────────────── */

const SHEET = 'styles/fabricate.css';
const PROBE = 'src/ui/svelte/Probe.svelte';
const REASON = 'ratchet-exempt(design-system): the probe needs it';

const sheetWith = (...lines) =>
  [':root { --probe-rung: 30px; }', '.fabricate .a { height: 36px; }', ...lines, ''].join('\n');

const probeWith = (...rules) =>
  [
    '<div class="probe"></div>',
    '<style>',
    '  .probe { min-height: 32px; }',
    ...rules,
    '</style>',
    '',
  ].join('\n');

const WIRING_BASE = Object.freeze({
  [SHEET]: sheetWith(),
  [PROBE]: probeWith(),
  'README.md': 'unrelated\n',
});

const height = (file, id) => `${file}: ${id}`;

test('the height gate fails a new retired height and a grown one, and nothing on the ladder', (t) => {
  assertGateCases(t, RETIRED_HEIGHT_GATE, WIRING_BASE, [
    {
      head: { [SHEET]: sheetWith('.fabricate .b { min-height: 40px; }') },
      failures: [`${height(SHEET, 'min-height 40px')} is new (1)`],
    },
    {
      head: { [PROBE]: probeWith('  .probe-b { min-height: 32px; }') },
      failures: [`${height(PROBE, 'min-height 32px')} rose from 1 to 2`],
    },
    {
      head: {
        [SHEET]: sheetWith('.fabricate .c { height: 34px; min-height: var(--probe-rung); }'),
      },
      failures: [],
    },
    {
      head: {
        [SHEET]: sheetWith(
          ':root { --probe-rung: 40px; }',
          '.fabricate .d { height: var(--probe-rung); }'
        ),
      },
      failures: [`${height(SHEET, 'height 40px')} is new (1)`],
    },
    { head: { 'README.md': 'changed\n' }, skipped: 'corpus-unchanged' },
  ]);
});

test('a reasoned marker at the declaration exempts a retired height, and an empty one fails', (t) => {
  const offender = '.fabricate .b { height: 32px; }';
  assertGateCases(t, RETIRED_HEIGHT_GATE, WIRING_BASE, [
    { head: { [SHEET]: sheetWith(`/* ${REASON} */`, offender) }, failures: [] },
    {
      head: { [SHEET]: sheetWith('/* ratchet-exempt(design-system): */', offender) },
      failures: [
        `${height(SHEET, 'height 32px')} is new (1); its ratchet-exempt marker gives no reason`,
        emptyMarkerFailure(SHEET, 3),
      ],
    },
  ]);
});
