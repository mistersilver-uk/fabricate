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

import { assertRatchet, byCodePoint, tallyByKey } from '../helpers/ratchetBaseline.js';
import { repoRoot } from '../helpers/sourceScan.js';
import {
  MAX_VAR_CHAIN_DEPTH,
  collectStyleCorpus,
  scanPixelValues,
} from '../helpers/styleBlockScan.js';

import {
  FLOOR_REFERENCE_STYLESHEET_DECLARATIONS,
  FLOOR_REFERENCE_SVELTE_DECLARATIONS,
  INDIRECT_HEIGHT_NOTES,
  KNOWN_RETIRED_HEIGHTS,
  KNOWN_RETIRED_HEIGHT_TOTAL,
  LADDER_RUNGS,
  RETIRED_CONTROL_HEIGHTS,
  SCANNED_HEIGHT_PROPERTIES,
} from './control-height-known-literals.js';

/** Floors with deliberate headroom below the roughly 530 and 440 they were chosen against. */
// 470 against 530 until issue 1498 deleted the 367 rule blocks that matched no element.
const STYLESHEET_DECLARATION_FLOOR = 435;
const SVELTE_DECLARATION_FLOOR = 380;

/** The corpus is walked once. Lazily, so a walk failure is reported as a test rather than as an
 * unattributed module-load throw that escapes the `# fail` count entirely. */
let cached = null;
function scan() {
  if (cached === null) {
    const corpus = collectStyleCorpus();
    cached = {
      corpus,
      retired: scanPixelValues({
        corpus,
        properties: SCANNED_HEIGHT_PROPERTIES,
        values: RETIRED_CONTROL_HEIGHTS,
      }),
    };
  }
  return cached;
}

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
      'notice: the likely cause is the line-anchored `<style>` extractor, not 50 deleted ' +
      'components.'
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
      'about a smaller corpus than it claims:\n  ' + missing.join('\n  ')
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
      'a retired value beyond the cap reads as absent:\n  ' + retired.capReached.join('\n  ')
  );
});

/**
 * WHAT THIS RATCHET DOES NOT SEE, stated rather than inferred from the name.
 * ACCEPTED, on the requirement's own terms rather than for convenience, and the adjudication is
 * RESTATED because its subject changed: every one of those declarations sizes a THUMBNAIL — a
 * record's art tile, an actor's portrait, or the inventory header's shell around one — and the
 * geometry requirement exempts art and portraits from the control ladder outright, now naming
 * their own published size ladder rather than promising one. That is the same clause that lets
 * `BooksScrollsView.svelte:706` stay in the baseline at 40px. Closing the gap would also mean
 * reading a `style` attribute built by an interpolation, which is a different scanner from this
 * one. So "no new retired control height has been introduced" is a claim about what the two
 * stylesheet corpora DECLARE, not about what the product renders.
 */
test('no new retired control height has been introduced', () => {
  const { retired } = scan();
  const observed = tallyByKey(
    retired.occurrences,
    (record) => `${record.file} ${record.property} ${record.value}`
  );

  assertRatchet({
    label: 'retired control heights',
    baseline: KNOWN_RETIRED_HEIGHTS,
    pinnedTotal: KNOWN_RETIRED_HEIGHT_TOTAL,
    observed,
    scanned: retired.declarations.length,
    floor: STYLESHEET_DECLARATION_FLOOR + SVELTE_DECLARATION_FLOOR,
    guidance:
      'Control height MUST be one of 26, 28, 30, 34, 38 or 44 — see the "Geometry comes from the ' +
      'published ladders" requirement in `openspec/specs/design-system/spec.md`. 32, 36 and 40 ' +
      'are retired and this baseline is the debt already owed, not a permission to add to it. ' +
      'The nearest rung is almost always right; if the declaration genuinely is not a control — ' +
      'a thumbnail, a slider track, a text-area minimum — say so in a note beside its row.',
  });
});

test('every baselined row still carries the raw and resolved text it was measured with', () => {
  const { retired } = scan();
  const texts = new Map();
  for (const record of retired.occurrences) {
    const key = `${record.file} ${record.property} ${record.value}`;
    const pairs = texts.get(key) ?? new Set();
    pairs.add(`${record.raw} => ${record.resolved}`);
    texts.set(key, pairs);
  }

  const drifted = [];
  for (const row of KNOWN_RETIRED_HEIGHTS) {
    const found = [...(texts.get(row.key) ?? new Set())].sort(byCodePoint);
    const pinned = [...row.texts].sort(byCodePoint);
    if (found.join(' ; ') !== pinned.join(' ; ')) {
      drifted.push(`${row.key}\n      pinned: ${pinned.join(' ; ')}\n      found:  ${found.join(' ; ') || '(none)'}`);
    }
  }

  // This is what closes the ratchet's cheapest escape. Rewrite `height: 36px` as `--x: 36px;
  // height: var(--x)` and the file, property, value and COUNT are all unchanged — only the text
  // moves. Without this the gate would report the tree as unchanged while the debt had been
  // laundered into a token, which is the move the resolution exists to catch.
  assert.deepEqual(
    drifted,
    [],
    'a baselined declaration is no longer written the way it was measured. If you moved the ' +
      'literal into a custom property the debt has NOT been paid — the control is still that ' +
      'many pixels tall. Update the row only when the text genuinely changed for another ' +
      'reason:\n  ' + drifted.join('\n  ')
  );
});

test('exactly the rows whose raw and resolved texts differ carry a note', () => {
  // The predicate is `raw !== resolved`.
  // explain the value". The two readings ALREADY diverge, on a row in the baseline rather than
  // on an invented one: `styles/fabricate.css min-height 40` writes its 40 literally on the
  // line — `calc(40px + (2 * var(--fab-space-3)) + 2px)` — so the value is right there to read,
  // and it qualifies only because a DIFFERENT token in the same calc resolves elsewhere. Its
  // own note says exactly that. A row could equally be unreadable while its two texts agree.
  const indirect = KNOWN_RETIRED_HEIGHTS.filter((row) =>
    row.texts.some((pair) => {
      const [raw, resolved] = pair.split(' => ');
      return raw !== resolved;
    })
  ).map((row) => row.key);

  assert.deepEqual(
    indirect.sort(byCodePoint),
    Object.keys(INDIRECT_HEIGHT_NOTES).sort(byCodePoint),
    'a row whose resolved text differs from the text on the line it cites is unadjudicable ' +
      'without a note, and a note for a row that has become direct is a stale explanation ' +
      'nobody will re-read. These two sets must be the same set.'
  );

  for (const [key, note] of Object.entries(INDIRECT_HEIGHT_NOTES)) {
    assert.ok(note.length > 80, `the note for "${key}" is too short to explain anything`);
  }
});
