/**
 * The control-height ladder is a rule the product can be checked against (issue 1391).
 *
 * `openspec/specs/design-system/spec.md` has closed the control-height ladder at 26, 28, 30, 34,
 * 38 and 44 — and retired 32, 36 and 40 — since the design system landed. NOTHING checked it.
 * Worse, half the corpus could not have been checked by the tool that would normally do it:
 * `npm run lint:css` globs `styles/**` and Svelte scoped `<style>` blocks are not in it, so the
 * 433 height declarations most likely to drift were entirely unlinted. Measured against that
 * silence: 86 occurrences of a retired value across 30 files, 26 of which carry exactly one —
 * the signature of a value copied once and never revisited rather than a deliberate system.
 *
 * This gate FREEZES that. It does not require the whole ladder, and the reason is in the
 * requirement's own wording rather than in the size of the finding: `spec.md` governs "a control
 * a spec marks touch-reachable", which is an authored fact in `openspec/specs/**` and not a
 * property CSS carries at all. No selector heuristic can adjudicate it — and classifying by
 * enclosing selector, then reading the result, confirms it: of the 88 off-ladder control-ish
 * declarations, roughly half are plainly not controls (a 6px slider track, a 14px toggle knob,
 * textarea minimums, native 16px checkboxes). The three retired values are a closed, explicitly
 * named prohibition, so every hit is either a regression or a non-control a reviewer can weigh.
 *
 * The long-term rule is that a control height comes from `var(--fab-v2-control-height)`. That is
 * not yet reachable: the token is declared once, at `styles/fabricate.css:125`, and has zero
 * readers.
 *
 * ── WHAT MAKES THIS NOT VACUOUS ─────────────────────────────────────────────────────────
 * An absence gate over an empty corpus passes forever. Four independent controls stand against
 * that, and they are independent on purpose rather than four spellings of one floor:
 *
 *   1. PER-CORPUS declaration floors. One total has slack and cannot see a partial loss — break
 *      the `<style>` extractor and 433 declarations vanish while 526 remain, which a combined
 *      floor of, say, 850 would sail past.
 *   2. PER-CORPUS rung presence. All six live rungs appear in BOTH corpora, so this is a
 *      genuinely separate control rather than a restatement of the floor.
 *   3. RESOLUTION DEPTH above zero, and an indirect occurrence whose source line carries no
 *      pixel literal at all. If `var()` resolution silently stopped, both read zero while every
 *      other assertion here still passes.
 *   4. The ratchet itself fails on a SHRINK as well as a growth, so quietly paying one down
 *      without banking it is a failure rather than a free slot for the next author.
 *
 * ── THE SPEC HALF ───────────────────────────────────────────────────────────────────────
 * Short distinctive FRAGMENTS plus the numerals, following
 * `tests/components/flat-ui-style-contract.test.js`. A whole-sentence match reds on a typo fix;
 * a loose match passes a reworded sentence that has quietly dropped 36 from the retired set.
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
  INDIRECT_HEIGHT_NOTES,
  KNOWN_RETIRED_HEIGHTS,
  KNOWN_RETIRED_HEIGHT_TOTAL,
  LADDER_RUNGS,
  MEASURED_STYLESHEET_DECLARATIONS,
  MEASURED_SVELTE_DECLARATIONS,
  RETIRED_CONTROL_HEIGHTS,
  SCANNED_HEIGHT_PROPERTIES,
} from './control-height-known-literals.js';

/**
 * Floors with deliberate headroom below the measured 526 and 433, so deleting a screen does not
 * red this while a broken extractor — which takes a corpus to roughly zero — still does.
 */
const STYLESHEET_DECLARATION_FLOOR = 470;
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
    `only ${stylesheet} height declarations found under styles/, against ${MEASURED_STYLESHEET_DECLARATIONS} ` +
      `measured and a floor of ${STYLESHEET_DECLARATION_FLOOR}. The global sheet has not shrunk ` +
      'by a fifth — the scan has stopped reading it.'
  );
  assert.ok(
    svelte >= SVELTE_DECLARATION_FLOOR,
    `only ${svelte} height declarations found in Svelte <style> blocks, against ` +
      `${MEASURED_SVELTE_DECLARATIONS} measured and a floor of ${SVELTE_DECLARATION_FLOOR}. This ` +
      'is the corpus stylelint cannot reach, so nothing else in the repository would notice: the ' +
      'likely cause is the line-anchored `<style>` extractor, not 50 deleted components.'
  );
  assert.ok(
    Object.keys(corpus).length > 150,
    `only ${Object.keys(corpus).length} files contributed any CSS at all`
  );
});

test('every live rung is still in use in BOTH corpora', () => {
  const { corpus } = scan();

  // ONE pass for all six rungs, not one pass per rung. `scanPixelValues` re-reads every
  // declaration in a 24,773-line stylesheet plus 177 Svelte blocks on each call, and every
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
    const inStylesheet = hits.some(isStylesheet);
    const inSvelte = hits.some((record) => !isStylesheet(record));
    if (!inStylesheet) missing.push(`${rung}px is absent from styles/`);
    if (!inSvelte) missing.push(`${rung}px is absent from Svelte <style> blocks`);
  }

  // Presence, not counts. A rung's count moves whenever anyone edits a screen, so pinning it
  // would red on unrelated work; presence in BOTH corpora is the part that goes wrong when the
  // scanner does, and it is what makes this a control independent of the floors above.
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

  // The sharpest control on resolution: a hit whose own line carries no pixel literal at all.
  // `BooksScrollsView.svelte:706` is `height: var(--fab-v2-thumb-sm)`. A text-only scanner cannot
  // see it, and losing it would lose one occurrence, one file and one row all at once.
  const indirect = retired.occurrences.filter((record) => !/\d+px/.test(record.raw));
  assert.ok(
    indirect.length > 0,
    'no retired height is reached through a token any more. Either the corpus changed or the ' +
      'scan stopped substituting: the difference matters, because the second silently rewards ' +
      'hiding a literal behind a custom property.'
  );
});

/**
 * WHAT THIS RATCHET DOES NOT SEE, stated rather than inferred from the name: it reads CSS
 * declarations in `styles/**` and in Svelte scoped `<style>` blocks, and nothing else. A markup
 * `style="height: 36px"` attribute and a JS `element.style.height = '36px'` are both retired
 * control heights this gate is blind to. Neither exists in `src/` today, which is why the gap is
 * a stated limit rather than a defect — but "no new retired control height has been introduced"
 * is a claim about the two stylesheet corpora, not about the product.
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
  // The predicate is `raw !== resolved`, and that is narrower than "the source line does not
  // explain the value". A row whose raw text is `calc(36px + 2px)` explains itself and still
  // differs from its resolved text; a row could in principle be unreadable while its two texts
  // agree. Every row that qualifies today is genuinely token-mediated, so the two readings
  // coincide — but the check is the textual one, so the name says the textual one.
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
