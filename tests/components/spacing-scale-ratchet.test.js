/**
 * The spacing scale is a rule the product can be checked against (issue 1448).
 *
 * `openspec/specs/ui-integration/spec.md` has made the 4px spacing scale normative under its
 * "Spacing scale" section since the design system landed — padding, margin and gap "must derive
 * from a shared 4px-based spacing scale ... rather than from raw pixel literals" — and NOTHING
 * checked it. Worse, half the corpus could not have been checked by the tool that would normally
 * do it: `npm run lint:css` globs `styles/**` and Svelte scoped `<style>` blocks are not in it,
 * so the 1642 spacing declarations most likely to drift were entirely unlinted. Measured against
 * that silence: 932 raw literals across 620 (file, property, value) keys in 115 files.
 *
 * This gate FREEZES that. It does not require the whole corpus to be tokenized in one change,
 * and it cannot decide on its own that a given literal is wrong — the spec exempts two bands and
 * a value scanner cannot tell a 36px icon clearance from a careless 36px gap. What it can do,
 * and does, is make every NEW literal an edit to a pinned number that a reviewer has to accept.
 *
 * `tests/helpers/styleBlockScan.js` names this gate as its second customer, and it is the
 * customer `scanPixelDeclarations` was generalised for: the height ladder bans three named
 * values, this bans every value outside two exempt bands, and enumerating "every number except
 * these" as a list means choosing a ceiling nobody would notice being stepped over.
 *
 * -- WHAT MAKES THIS NOT VACUOUS -----------------------------------------------------------
 * An absence gate over an empty corpus passes forever. Five independent controls stand against
 * that, and they are independent on purpose rather than five spellings of one floor:
 *
 *   1. PER-CORPUS declaration floors. One total has slack and cannot see a partial loss — break
 *      the `<style>` extractor and 1642 declarations vanish while 1737 remain, which a combined
 *      floor of, say, 3000 would sail past. This is the control the broken-extractor mutation is
 *      aimed at, because a broken extractor otherwise reports a CLEANER tree rather than a
 *      failure.
 *   2. THE PUBLISHED SCALE IS STILL IN USE, per corpus. This is a population the gate is not
 *      asserting the absence of, so it stays alive when the findings do not, and it is the
 *      control that notices a corpus being read but its `var()` references stopping.
 *   3. RESOLUTION IS RUNNING, and the scale is what is held opaque. A control scan with every
 *      definition visible must reach depth 1 and must find strictly MORE than the opaque scan.
 *      If resolution silently stopped, both halves read the same and this reds while every other
 *      assertion here still passes.
 *   4. BOTH EXEMPT BANDS ARE LIVE. A predicate that quietly matched everything, or nothing,
 *      would move the ratchet wholesale; this names the two bands separately so the direction is
 *      readable rather than arriving as 900 vanished rows.
 *   5. The ratchet itself fails on a SHRINK as well as a growth, so quietly paying one down
 *      without banking it is a failure rather than a free slot for the next author.
 *
 * -- THE SPEC HALF -------------------------------------------------------------------------
 * Short distinctive FRAGMENTS plus the numerals, following `control-height-ladder.test.js` and
 * `flat-ui-style-contract.test.js`. A whole-sentence match reds on a typo fix; a loose match
 * passes a reworded sentence that has quietly widened the exempt band from 34-42 to 24-64. That
 * is not a hypothetical failure mode, it is the CHEAPEST one: the least-effort way to green a
 * spacing failure is not to edit this file, it is to widen a sentence in a spec nobody diffs.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { assertRatchet, tallyByKey } from '../helpers/ratchetBaseline.js';
import { repoRoot } from '../helpers/sourceScan.js';
import {
  MAX_VAR_CHAIN_DEPTH,
  collectStyleCorpus,
  pixelValuesIn,
  scanPixelDeclarations,
  varReferencesIn,
} from '../helpers/styleBlockScan.js';

import {
  CLEARANCE_MAXIMUM,
  CLEARANCE_MINIMUM,
  FLOOR_REFERENCE_STYLESHEET_SPACING_DECLARATIONS,
  FLOOR_REFERENCE_SVELTE_SPACING_DECLARATIONS,
  HAIRLINE_MAGNITUDE,
  KNOWN_RAW_SPACING,
  KNOWN_RAW_SPACING_TOTAL,
  SCANNED_SPACING_PROPERTIES,
  SPACING_SCALE_PREFIX,
  isExemptSpacingPixels,
  isSpacingScaleToken,
} from './spacing-known-literals.js';

/**
 * Floors with deliberate headroom below the roughly 1445 and 1642 they were chosen against, so
 * deleting a screen does not red this while a broken extractor — which takes a corpus to
 * roughly zero — still does. These are the enforced figures; the reference counts they quote
 * are not, and say so.
 *
 * The stylesheet floor was 1550 against 1737 until issue 1498 deleted the 367 rule blocks that
 * matched no element, at base `0eff5b36e`, taking the corpus to 1445 and breaching it. It is
 * RE-DERIVED at the ratio it was originally chosen at — 1550/1737 of 1445 is 1289 — rather than
 * lowered to whatever clears the new count, so the headroom it was given still means the same
 * thing: a corpus that has shrunk by a tenth is a scan that has stopped reading the sheet.
 */
const STYLESHEET_SPACING_DECLARATION_FLOOR = 1289;
const SVELTE_SPACING_DECLARATION_FLOOR = 1450;

/** The corpus is walked once. Lazily, so a walk failure is reported as a test rather than as an
 * unattributed module-load throw that escapes the `# fail` count entirely. */
let cached = null;
function scan() {
  if (cached === null) {
    const corpus = collectStyleCorpus();
    const opaqueProperty = isSpacingScaleToken;
    cached = {
      corpus,
      // The debt: every literal the spec does not exempt, with the published scale held opaque
      // because deriving from it is what the spec asks for.
      raw: scanPixelDeclarations({
        corpus,
        properties: SCANNED_SPACING_PROPERTIES,
        accept: (pixels) => !isExemptSpacingPixels(pixels),
        opaqueProperty,
      }),
      // The complement, over the same corpus and the same definitions, so control 4 is reading
      // the predicate this gate actually runs rather than a second copy of it.
      exempt: scanPixelDeclarations({
        corpus,
        properties: SCANNED_SPACING_PROPERTIES,
        accept: isExemptSpacingPixels,
        opaqueProperty,
      }),
      // Control 3's other half: the same scan with NOTHING held opaque. Every scale token then
      // resolves to its own pixel value, so this must find strictly more.
      resolved: scanPixelDeclarations({
        corpus,
        properties: SCANNED_SPACING_PROPERTIES,
        accept: () => true,
      }),
    };
  }
  return cached;
}

/** `styles/**` on one side, Svelte scoped blocks on the other. */
const isStylesheet = (record) => record.file.startsWith('styles/');

/** The `### Spacing scale` section that owns the rule, so a fragment cannot match elsewhere. */
function spacingRequirement() {
  const spec = readFileSync(join(repoRoot, 'openspec/specs/ui-integration/spec.md'), 'utf8');
  const heading = '### Spacing scale';
  const start = spec.indexOf(heading);
  assert.ok(
    start !== -1,
    'the ui-integration spec no longer carries a "Spacing scale" section. This gate exists only ' +
      'to enforce that rule — if it has been renamed, retarget this test; if it has been dropped, ' +
      'delete this gate deliberately rather than leaving it policing a rule the specs no longer ' +
      'make.'
  );
  const end = spec.indexOf('\n### ', start + heading.length);
  return spec.slice(start, end === -1 ? spec.length : end);
}

test('the spacing scale this gate enforces is still the spec’s', () => {
  const requirement = spacingRequirement();

  assert.ok(
    requirement.includes('must derive from a shared 4px-based spacing scale'),
    'the spec no longer states the spacing scale as the source of padding, margin and gap'
  );
  assert.ok(
    requirement.includes('rather than from raw pixel literals'),
    'the spec no longer prohibits raw pixel literals, so this gate is banning them on its own ' +
      'authority'
  );

  // The exemptions, asserted FROM this gate's own constants, so widening a predicate here
  // without widening the spec — or widening the spec without this — is a failure either way.
  // Widening BOTH is still possible and is exactly what should require two visible edits.
  assert.ok(
    requirement.includes('Documented literal exemptions that must NOT be tokenized'),
    'the spec no longer documents any literal exemption, so the two predicates in ' +
      '`spacing-known-literals.js` are permissions nothing published grants'
  );
  assert.ok(
    requirement.includes(`\`${HAIRLINE_MAGNITUDE}px\` hairlines`),
    `the spec no longer exempts ${HAIRLINE_MAGNITUDE}px hairlines`
  );
  assert.ok(
    requirement.includes(`\`-${HAIRLINE_MAGNITUDE}px\` overlap bleeds`),
    `the spec no longer exempts -${HAIRLINE_MAGNITUDE}px overlap bleeds. The predicate is written ` +
      'on the ABSOLUTE value precisely because the spec exempts both signs, and the scanner is ' +
      'sign-blind — see the docblock in `spacing-known-literals.js`.'
  );
  assert.ok(
    requirement.includes(`${CLEARANCE_MINIMUM}–${CLEARANCE_MAXIMUM}px range`),
    `the spec no longer exempts the ${CLEARANCE_MINIMUM}-${CLEARANCE_MAXIMUM}px clearance band ` +
      'as this gate spells it. A band widened in the spec and here at once is a decision; a band ' +
      'widened in only one of them is a bug, and this is the half that catches the quiet one.'
  );
  assert.ok(
    requirement.includes(SPACING_SCALE_PREFIX),
    `the spec no longer names any \`${SPACING_SCALE_PREFIX}\` token, so nothing published says ` +
      'which indirection this scan is entitled to hold opaque'
  );
});

test('every spacing property spelling is scanned, including the logical longhands', () => {
  const scanned = new Set(SCANNED_SPACING_PROPERTIES);

  // The logical longhands contribute ZERO occurrences today, which is exactly why they need a
  // structural guard: nothing in the baseline would notice them being dropped from the list, and
  // a rewrite that switched `padding-left` for `padding-inline-start` would then walk straight
  // around the gate carrying its literals with it.
  const missing = [];
  for (const family of ['padding', 'margin']) {
    for (const side of ['block', 'inline']) {
      for (const suffix of ['', '-start', '-end']) {
        const property = `${family}-${side}${suffix}`;
        if (!scanned.has(property)) missing.push(property);
      }
    }
  }
  for (const property of ['row-gap', 'column-gap']) {
    if (!scanned.has(property)) missing.push(property);
  }

  assert.deepEqual(
    missing,
    [],
    'a spacing property spelling has been dropped from SCANNED_SPACING_PROPERTIES. Each one is a ' +
      'way to write the same declaration, so an unscanned spelling is a rename away from being a ' +
      'bypass:\n  ' +
      missing.join('\n  ')
  );
});

test('both stylesheet corpora are still being scanned', () => {
  const { corpus, raw } = scan();
  const stylesheet = raw.declarations.filter(isStylesheet).length;
  const svelte = raw.declarations.length - stylesheet;

  assert.ok(
    stylesheet >= STYLESHEET_SPACING_DECLARATION_FLOOR,
    `only ${stylesheet} spacing declarations found under styles/, against roughly ` +
      `${FLOOR_REFERENCE_STYLESHEET_SPACING_DECLARATIONS} when the floor of ` +
      `${STYLESHEET_SPACING_DECLARATION_FLOOR} was set. The global sheet has not shrunk by a ` +
      'tenth — the scan has stopped reading it.'
  );
  assert.ok(
    svelte >= SVELTE_SPACING_DECLARATION_FLOOR,
    `only ${svelte} spacing declarations found in Svelte <style> blocks, against roughly ` +
      `${FLOOR_REFERENCE_SVELTE_SPACING_DECLARATIONS} when the floor of ` +
      `${SVELTE_SPACING_DECLARATION_FLOOR} was set. This is the corpus stylelint cannot reach, so ` +
      'nothing else in the repository would notice: the likely cause is the line-anchored ' +
      '`<style>` extractor, not 200 deleted components. A broken extractor makes this gate report ' +
      'a CLEANER tree, which is why the floor is stated per corpus rather than over the total.'
  );
  assert.ok(
    Object.keys(corpus).length > 150,
    `only ${Object.keys(corpus).length} files contributed any CSS at all`
  );
});

test('the published spacing scale is still in use in BOTH corpora', () => {
  const { raw } = scan();

  // A population this gate is NOT asserting the absence of, so it survives the debt being paid
  // down to zero and still notices a corpus that has stopped being read.
  const referencing = { stylesheet: 0, svelte: 0 };
  const names = new Set();
  for (const declaration of raw.declarations) {
    const scaleNames = varReferencesIn(declaration.value)
      .map((reference) => reference.name)
      .filter(isSpacingScaleToken);
    if (scaleNames.length === 0) continue;
    for (const name of scaleNames) names.add(name);
    if (isStylesheet(declaration)) referencing.stylesheet += 1;
    else referencing.svelte += 1;
  }

  // THE FILTER IS WHAT MAKES THIS A CONTROL ON THE SCALE rather than on `var()` in general.
  // Drop it and the counts below are satisfied by any custom property at all, at which point
  // this stops saying anything the declaration floors did not already say.
  assert.ok(
    [...names].every(isSpacingScaleToken),
    `a name counted here is not a \`${SPACING_SCALE_PREFIX}\` token, so "the scale is in use" is ` +
      'being decided by some other custom property'
  );

  assert.ok(
    referencing.stylesheet > 0 && referencing.svelte > 0,
    `the published scale is referenced by ${referencing.stylesheet} spacing declarations under ` +
      `styles/ and ${referencing.svelte} in Svelte <style> blocks. A zero on either side means ` +
      'that corpus is not being read, or its `var()` references are no longer being parsed — ' +
      'and the second of those makes this gate hold the scale opaque for nothing.'
  );
});

test('var() resolution is running, and the published scale is what it holds opaque', () => {
  const { raw, resolved } = scan();

  assert.ok(
    resolved.maxDepth >= 1,
    'with every definition visible, no spacing declaration resolved through a single `var()`, so ' +
      'resolution is inert. A text-only scan passes every other assertion in this file while ' +
      'making the cheapest way to pay this ratchet down "move the literal into a private token" ' +
      '— the pixel does not move and the gate goes green.'
  );
  assert.ok(
    resolved.occurrences.length > raw.occurrences.length,
    `resolving with the scale visible found ${resolved.occurrences.length} occurrences and ` +
      `holding it opaque found ${raw.occurrences.length}. Holding it opaque must find strictly ` +
      'fewer: the difference IS the sanctioned population, every `padding: ' +
      `var(${SPACING_SCALE_PREFIX}-3)` +
      ') in the product. Equal numbers mean `opaqueProperty` is not reaching the resolver, and ' +
      'this gate has started counting correct token use as debt.'
  );
  assert.ok(
    raw.maxDepth < MAX_VAR_CHAIN_DEPTH,
    `the deepest var() chain is now ${raw.maxDepth}, at the cap of ${MAX_VAR_CHAIN_DEPTH}`
  );
  assert.deepEqual(
    [...raw.capReached, ...resolved.capReached],
    [],
    'these declarations hit the resolution depth cap, so their candidate sets are INCOMPLETE and ' +
      'a literal beyond the cap reads as absent:\n  ' +
      [...raw.capReached, ...resolved.capReached].join('\n  ')
  );
});

test('both documented exemptions are live, and nothing else is exempt', () => {
  const { exempt } = scan();

  const hairlines = exempt.occurrences.filter(
    (record) => Math.abs(record.value) === HAIRLINE_MAGNITUDE
  );
  const clearances = exempt.occurrences.filter(
    (record) =>
      Math.abs(record.value) >= CLEARANCE_MINIMUM && Math.abs(record.value) <= CLEARANCE_MAXIMUM
  );

  assert.ok(
    hairlines.length > 0,
    `no ${HAIRLINE_MAGNITUDE}px spacing literal is exempt any more. Either the corpus has lost ` +
      'every hairline — which it has not — or the predicate has stopped matching them, in which ' +
      'case they are about to arrive as new debt on someone else’s change.'
  );
  assert.ok(
    clearances.length > 0,
    `no literal in the ${CLEARANCE_MINIMUM}-${CLEARANCE_MAXIMUM}px band is exempt any more, for ` +
      'the same reasons'
  );

  // The two bands are the WHOLE exemption. A predicate widened to swallow a third band would
  // otherwise show up only as a heap of vanished baseline rows, which reads like debt paid down.
  const stray = exempt.occurrences.filter(
    (record) => !hairlines.includes(record) && !clearances.includes(record)
  );
  assert.deepEqual(
    stray.map((record) => `${record.file}:${record.line} ${record.property} ${record.value}px`),
    [],
    'a value outside both documented bands is being treated as exempt, so the predicate has been ' +
      'widened past what `openspec/specs/ui-integration/spec.md` publishes'
  );
});

/**
 * WHAT THIS RATCHET DOES NOT SEE, stated rather than inferred from the name: it reads CSS
 * declarations in `styles/**` and in Svelte scoped `<style>` blocks, and nothing else. A literal
 * markup attribute — `style="padding: 7px"` — and a JS `element.style.gap = '7px'` are both raw
 * spacing the gate is blind to.
 *
 * The live shape of that gap is a custom property SET IN MARKUP from a JS prop and read by a
 * scanned declaration; `apps/crafting/CraftingThumb.svelte` does exactly this for a SIZE, and the
 * control-height ladder records the same blind spot for the same reason. Closing it would mean
 * resolving a token through Svelte markup and a JS prop default, which is a different scanner
 * from this one. So "no new raw spacing literal has been introduced" is a claim about what the
 * two stylesheet corpora DECLARE, not about what the product renders.
 */
test('no new raw spacing literal has been introduced', () => {
  const { raw } = scan();
  const observed = tallyByKey(
    raw.occurrences,
    (record) => `${record.file} ${record.property} ${record.value}`
  );

  assertRatchet({
    label: 'raw spacing literals',
    baseline: KNOWN_RAW_SPACING,
    pinnedTotal: KNOWN_RAW_SPACING_TOTAL,
    observed,
    scanned: raw.declarations.length,
    floor: STYLESHEET_SPACING_DECLARATION_FLOOR + SVELTE_SPACING_DECLARATION_FLOOR,
    guidance:
      'Padding, margin and gap MUST derive from the published spacing scale — see the "Spacing ' +
      'scale" section of `openspec/specs/ui-integration/spec.md`. Use the numeric tokens ' +
      `(\`${SPACING_SCALE_PREFIX}-1\` through \`${SPACING_SCALE_PREFIX}-6\`, plus ` +
      `\`${SPACING_SCALE_PREFIX}-2xs\` and \`${SPACING_SCALE_PREFIX}-chip\`); this baseline is ` +
      'the debt already owed, not a permission to add to it. The nearest step is almost always ' +
      'right. The spec exempts exactly two things and this gate already applies both, so a value ' +
      'outside them needs a token rather than a row.',
  });
});

test('no raw spacing literal has been laundered into a private token', () => {
  const { raw } = scan();

  // This is what closes the ratchet's cheapest escape. Rewrite `padding: 8px` as
  // `--inset: 8px; padding: var(--inset)` and the file, property, value and COUNT are all
  // unchanged — only the text moves. Resolution is what keeps the occurrence findable at all;
  // this is what keeps it from being reported as unchanged while the debt was laundered.
  //
  // It is an EMPTY set today rather than a baseline, which is a fact about the tree: no spacing
  // declaration in this corpus reaches a pixel value through a non-scale custom property. If one
  // ever should — a private token that genuinely is not spacing rhythm — the honest change is to
  // widen this test deliberately with a note per row, in the shape
  // `control-height-ladder.test.js` uses, not to delete it.
  const laundered = raw.occurrences
    .filter((record) => !pixelValuesIn(record.raw).includes(record.value))
    .map(
      (record) =>
        `${record.file}:${record.line} ${record.property} ${record.value}px\n      raw:      ` +
        `${record.raw}\n      resolved: ${record.resolved}`
    );

  assert.deepEqual(
    laundered,
    [],
    'a raw spacing literal has been moved into a custom property and read back. The debt has NOT ' +
      'been paid — the gap is still that many pixels wide — and the count above did not move ' +
      `because the scan resolves \`var()\`. Use a published \`${SPACING_SCALE_PREFIX}\` token, ` +
      'which this scan holds opaque precisely because deriving from the scale is what the spec ' +
      'asks for:\n  ' +
      laundered.join('\n  ')
  );
});
