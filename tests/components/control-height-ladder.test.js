/**
 * The control-height ladder is a rule the product can be checked against (issue 1391).
 *
 * `openspec/specs/design-system/spec.md` has closed the control-height ladder at 26, 28, 30, 34,
 * 38 and 44 — and retired 32, 36 and 40 — since the design system landed. NOTHING checked it.
 * Worse, half the corpus could not have been checked by the tool that would normally do it:
 * `npm run lint:css` globs `styles/**` and Svelte scoped `<style>` blocks are not in it, so the
 * 440 height declarations most likely to drift were entirely unlinted. Measured against that
 * silence: 86 occurrences of a retired value across 30 files, 26 of which carry exactly one —
 * the signature of a value copied once and never revisited rather than a deliberate system.
 * That first measurement stands as the record of what was found; the pinned total is 84 today,
 * because issue 1464 deleted two of them along with the dead Travel CSS that carried them.
 *
 * This gate FREEZES that. It does not require the whole ladder, and the reason is in the
 * requirement's own wording rather than in the size of the finding: `spec.md` governs "a control
 * a spec marks touch-reachable", which is an authored fact in `openspec/specs/**` and not a
 * property CSS carries at all. No selector heuristic can adjudicate it, and reading a
 * selector-classified sample confirms it: plenty of off-ladder heights are plainly not controls
 * — a 6px slider track at `styles/fabricate.css:15959`, a 14px toggle knob at
 * `apps/gathering/GatheringEnvironmentList.svelte:292`, textarea minimums at 68, 78 and 122
 * (`styles/fabricate.css:1608`, `:10379`, `:9018`), native radio and checkbox inputs at 16px
 * (`styles/fabricate.css:10717`, `:23525`, `:23573`). That classification was a one-off reading rather
 * than something this gate re-derives, so its examples are cited and its headcount is not: a
 * number no run reproduces is the kind of figure that goes stale unnoticed, which is the
 * failure this whole change is about. The three retired values are a closed, explicitly named
 * prohibition, so every hit is either a regression or a non-control a reviewer can weigh.
 *
 * The long-term rule is that a control height comes from a single published token rather than a
 * literal. That is not yet reachable: no such token exists. One was declared for it and never
 * read, and issue 1399 deleted it with the rest of the legacy generation rather than leave a
 * name in the sheet standing in for a decision nobody had taken.
 *
 * ── WHAT MAKES THIS NOT VACUOUS ─────────────────────────────────────────────────────────
 * An absence gate over an empty corpus passes forever. Four independent controls stand against
 * that, and they are independent on purpose rather than four spellings of one floor:
 *
 *   1. PER-CORPUS declaration floors. One total has slack and cannot see a partial loss — break
 *      the `<style>` extractor and 440 declarations vanish while 530 remain, which a combined
 *      floor of, say, 850 would sail past.
 *   2. PER-CORPUS rung presence, PER RUNG. All six live rungs appear in BOTH corpora. The
 *      per-rung part is the whole of its independence and it needs its own control: replace the
 *      group-by with the unfiltered occurrence list and this degenerates into "some rung appears
 *      in each corpus", which the floors already imply, at which point it stops being a separate
 *      control while still passing. So the loop asserts that its group really is one rung's.
 *   3. RESOLUTION DEPTH above zero. If `var()` resolution silently stopped, this reads zero
 *      while every other assertion here still passes.
 *
 *      It used to have a second half — an indirect occurrence in THIS corpus whose source line
 *      carried no pixel literal at all — and that half has moved (issue 1399). It depended on
 *      the tree happening to contain a retired height reached through a token, the corpus no
 *      longer contains one, and a control that can be emptied by ordinary work is a control
 *      that will one day be deleted as stale rather than repaired. It is re-established, end to
 *      end and on a corpus that cannot drift, by `the scan reaches a value written only into a
 *      token` in `tests/style-block-scan.test.js`, over a synthetic corpus of REAL FILES read
 *      through `collectStyleCorpus`. Depth stays here because it is a property of THIS scan of
 *      THIS corpus, which is the thing the other three controls are about.
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
  FLOOR_REFERENCE_STYLESHEET_DECLARATIONS,
  FLOOR_REFERENCE_SVELTE_DECLARATIONS,
  INDIRECT_HEIGHT_NOTES,
  KNOWN_RETIRED_HEIGHTS,
  KNOWN_RETIRED_HEIGHT_TOTAL,
  LADDER_RUNGS,
  RETIRED_CONTROL_HEIGHTS,
  SCANNED_HEIGHT_PROPERTIES,
} from './control-height-known-literals.js';

/**
 * Floors with deliberate headroom below the roughly 530 and 440 they were chosen against, so
 * deleting a screen does not red this while a broken extractor — which takes a corpus to
 * roughly zero — still does. These are the enforced figures; the reference counts they quote
 * are not, and say so.
 */
// 470 against 530 until issue 1498 deleted the 367 rule blocks that matched no element, at base
// `0eff5b36e`, taking this corpus to 491. Re-derived at the ratio it was originally chosen at —
// 470/530 of 491 is 435 — so the "has not shrunk by a fifth" headroom below still means what it
// meant. It was not breached; it is re-banked so both floors keep one relationship to their
// corpora rather than drifting apart every time a sweep lands.
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

    // THE GROUP-BY IS WHAT MAKES THIS A PER-RUNG CONTROL, and until this line nothing checked
    // it. Substitute the unfiltered `occurrences` for `hits` and the assertions below still
    // pass — 7 pass, 0 fail — because every corpus holds SOME rung, so the check quietly
    // weakens into a restatement of the floors above and control 2 in this file's own
    // non-vacuity list stops being independent. The `values: [26]` falsification that stood
    // for this proved the scan runs, not that it is being grouped.
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
});

/**
 * WHAT THIS RATCHET DOES NOT SEE, stated rather than inferred from the name: it reads CSS
 * declarations in `styles/**` and in Svelte scoped `<style>` blocks, and nothing else. There are
 * three ways out of that, and only the first two are absent from `src/`.
 *
 * A literal markup attribute — `style="height: 36px"` — and a JS `element.style.height = '36px'`
 * are both retired control heights the gate is blind to, and neither is written anywhere in
 * `src/` today.
 *
 * THE THIRD IS LIVE, and it is the one carrying retired values: a custom property SET IN MARKUP
 * from a JS prop, and read by a scanned declaration. `apps/crafting/CraftingThumb.svelte:37`
 * writes `--crafting-thumb-size` onto a `style` attribute from its `size` prop, and its own
 * block at line 53 reads `height: var(--crafting-thumb-size, 48px)`. `CraftingEssenceThumb`
 * and `detail/InventoryDetailHeader` have the same shape. Fourteen call sites render the two
 * crafting thumbs at a retired size — one at 32, one at 36, twelve at 40 — and none of those
 * fourteen contributes an occurrence to the baseline below.
 *
 * The scanner does not merely miss them: for those two it reports a CONFIDENT WRONG ANSWER. The
 * size lives in a JS prop, so there is no CSS definition of the token to find, resolution falls
 * back to the declared fallback of `48px`, and 48 is tallied — a size no call site passes.
 * A reader who trusts that 48 is reading a default that never renders. (The inventory header is
 * the benign case of the same shape: nothing overrides its `size`, so its `64px` fallback is
 * what renders and the scanner happens to be right.)
 *
 * ACCEPTED, on the requirement's own terms rather than for convenience: all three components
 * size a THUMBNAIL, and the geometry requirement exempts art and portraits from the control
 * ladder — the same clause that lets `BooksScrollsView.svelte:706` stay in the baseline at 40px.
 * Closing it would also mean resolving a token through Svelte markup and a JS prop default, which
 * is a different scanner from this one. So "no new retired control height has been introduced" is
 * a claim about what the two stylesheet corpora DECLARE, not about what the product renders.
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
  // explain the value". The two readings ALREADY diverge, on a row in the baseline rather than
  // on an invented one: `styles/fabricate.css min-height 40` writes its 40 literally on the
  // line — `calc(40px + (2 * var(--fab-space-3)) + 2px)` — so the value is right there to read,
  // and it qualifies only because a DIFFERENT token in the same calc resolves elsewhere. Its
  // own note says exactly that. A row could equally be unreadable while its two texts agree.
  // So the textual reading is not standing in for the semantic one; it is the check, and the
  // name says the check.
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
