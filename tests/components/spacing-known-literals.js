/**
 * The measured, frozen debt in RAW SPACING LITERALS (issue 1448).
 *
 * `openspec/specs/ui-integration/spec.md` has made the 4px spacing scale normative under its
 * "Spacing scale" section since the design system landed: padding, margin and gap "must derive
 * from a shared 4px-based spacing scale ... rather than from raw pixel literals". Nothing checked
 * it, and half the corpus could not have been checked — `npm run lint:css` globs `styles/**`
 * only, so the 1642 spacing declarations inside Svelte scoped `<style>` blocks were unreachable
 * by stylelint entirely.
 *
 * `spacing-scale-ratchet.test.js` freezes what is here so nothing new arrives. This file is the
 * baseline it freezes, and `spacing-known-literals.json` beside it is the table. It is DEBT, not
 * permission: every row is a literal that should be a token, and the gate fails just as loudly
 * when a row is paid down without being banked.
 *
 * -- WHY THE SANCTIONED SCALE IS HELD OPAQUE, AND WHAT THAT MAKES THE NUMBER --------------
 * `styleBlockScan.js` resolves `var()` because, with a text-only scan, the cheapest way to pay a
 * ratchet down is to move the literal into a token — the pixel does not move and the gate goes
 * green. That reasoning is about a NARROW prohibition. This gate bans every literal, and under
 * full resolution `padding: var(--fab-space-3)` resolves to `12px` and is flagged: the scan would
 * report the exact thing the spec asks for as debt. Measured on this corpus, the two answers are
 * 2989 occurrences against 1005 — the difference is not an edge, it is the whole sanctioned
 * population.
 *
 * So the published scale is the ALLOWED indirection and is held opaque
 * ({@link isSpacingScaleToken} feeds `scanPixelDeclarations`'s `opaqueProperty`), and every other
 * custom property is resolved as usual. That is the reading the spec's own wording gives: a
 * declaration satisfies the requirement by DERIVING from the scale, and a private token holding
 * `7px` derives from nothing. It also keeps resolution load-bearing rather than decorative —
 * rewrite `padding: 8px` as `--inset: 8px; padding: var(--inset)` and the occurrence survives
 * with its raw text changed, which `no raw spacing literal has been laundered into a private
 * token` reds on.
 *
 * -- THE NUMBERS, AND WHY THEY ARE NOT THE 1021 A TEXT SCAN GIVES -------------------------
 * A text-only scan of the same properties over the same corpus finds 1021 pixel literals in 831
 * declarations across 124 files, out of 3379 spacing declarations. This gate reports 1005 before
 * exemptions, and the 16 it does not are not a loss: an occurrence is one (declaration, VALUE)
 * pair, so `padding: 8px 8px` is one occurrence and a text scan counts the literal twice. The
 * two exempt bands then remove 73 — 63 hairlines and 10 clearances — leaving
 * {@link KNOWN_RAW_SPACING_TOTAL}.
 *
 * Resolution adds nothing TODAY, and that is a fact about the tree rather than about the scan:
 * no spacing declaration in this corpus reaches a pixel value through a non-scale custom
 * property, so the opaque walk expands nothing and every occurrence is written on the line it
 * cites. The scan is proved to reach a value written only into a token, end to end over a
 * synthetic corpus of real files, by `tests/style-block-scan.test.js`.
 *
 * -- THE EXEMPTIONS ARE PREDICATES, NOT AN ALLOWLIST --------------------------------------
 * The spec documents two literal exemptions, and this file states them as predicates over the
 * value. An allowlist of a thousand entries would be a second baseline to maintain, and its
 * per-entry reasons rot faster than anyone re-reads them. The cost is that a predicate cannot
 * distinguish a legitimate 36px icon clearance from a careless 36px gap; the mitigation is that
 * the bands are narrow, published, and asserted to still be published — see `the spacing scale
 * this gate enforces is still the spec's` in the gate.
 *
 * -- THE SCAN IS SIGN-BLIND, AND BOTH EXEMPTIONS ARE MAGNITUDES ---------------------------
 * `styleBlockScan.js` says so in terms: its pixel pattern excludes a word character or a dot
 * before a digit and a minus is neither, so `margin: -8px` tallies as `8px`. For a height gate
 * that is unreachable; for a spacing gate it is a real limitation, and it is not worked around
 * here because it does not bite. Both exemptions are stated by the spec as magnitudes — `1px`
 * hairlines expressly include `-1px` overlap bleeds — so the predicates are written on the
 * absolute value and agree with the sign-blind reading exactly. A future exemption that had to
 * tell `-8px` from `8px` would need that pattern changed rather than this file.
 *
 * -- WHY THE ROWS ARE JSON AND NOT AN ARRAY IN THIS MODULE --------------------------------
 * `control-height-known-literals.js` carries its 38 rows as strings in the module, and this file
 * would carry 620. SonarCloud's copy-paste detector normalises string literals, so a run of
 * quoted-string lines matches ANOTHER such run by shape whatever the strings say, and its
 * minimum block is roughly 100 tokens — about 50 such lines. 38 rows sit under that floor; 620
 * do not, and `scripts/lib/screenshotCaptureMap.js` already ships a 157-line run of exactly that
 * shape for them to collide with. `.json` is not indexed by the JavaScript analyser at all, so
 * the table lives there: one row per line, diffed the same way, with none of the risk of a
 * duplication failure that says nothing about the change.
 */
import { readFileSync } from 'node:fs';

/**
 * The properties the spacing scale governs, exactly as `ui-integration/spec.md` names them:
 * padding, margin and gap.
 *
 * THE LOGICAL LONGHANDS CONTRIBUTE ZERO TODAY and are scanned anyway, so a rewrite cannot walk
 * around the gate by switching property spelling. `row-gap` and `column-gap` are zero as well.
 * Every pinned figure below depends on this set being exactly these twenty-five, and the gate
 * asserts each logical spelling is still in it rather than trusting this comment.
 */
export const SCANNED_SPACING_PROPERTIES = Object.freeze([
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'padding-block',
  'padding-block-start',
  'padding-block-end',
  'padding-inline',
  'padding-inline-start',
  'padding-inline-end',
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'margin-block',
  'margin-block-start',
  'margin-block-end',
  'margin-inline',
  'margin-inline-start',
  'margin-inline-end',
  'gap',
  'row-gap',
  'column-gap',
]);

/**
 * The prefix every published spacing token carries — `--fab-space-1` through `--fab-space-6`,
 * `--fab-space-2xs`, `--fab-space-chip`, and the five semantic aliases.
 *
 * A prefix rather than a list of thirteen names, because the spec's rule is about deriving from
 * the SCALE and a scale that gains a step should not need this file edited to keep the gate
 * honest. The narrower reading would be the more dangerous one here: a token the list forgot
 * would resolve, its pixel value would be manufactured, and every call site of it would arrive
 * as new debt on someone else's unrelated change.
 */
export const SPACING_SCALE_PREFIX = '--fab-space';

/**
 * Whether a custom property is a published spacing token, and so an allowed indirection.
 *
 * @param {string} name
 * @returns {boolean}
 */
export function isSpacingScaleToken(name) {
  return name.startsWith(SPACING_SCALE_PREFIX);
}

/** The magnitude the spec exempts as a hairline — borders, dividers and `-1px` overlap bleeds. */
export const HAIRLINE_MAGNITUDE = 1;

/** The bottom of the band the spec exempts as a one-off fixed dimension. */
export const CLEARANCE_MINIMUM = 34;

/** The top of that band. */
export const CLEARANCE_MAXIMUM = 42;

/**
 * The spec's two documented literal exemptions, as a predicate on the pixel value.
 *
 * @param {number} pixels
 * @returns {boolean}
 */
export function isExemptSpacingPixels(pixels) {
  const magnitude = Math.abs(pixels);
  return (
    magnitude === HAIRLINE_MAGNITUDE ||
    (magnitude >= CLEARANCE_MINIMUM && magnitude <= CLEARANCE_MAXIMUM)
  );
}

/**
 * The headline. Pinned exactly rather than derived, so a hand edit to one row's count that
 * forgets this number fails rather than quietly re-baselining.
 */
export const KNOWN_RAW_SPACING_TOTAL = 932;

/**
 * The per-corpus spacing-declaration counts the floors were CHOSEN AGAINST, at the commit that
 * chose them: 1737 under `styles/**` and 1642 in Svelte scoped blocks.
 *
 * ILLUSTRATIVE, and named so, because nothing asserts them. They appear only inside a failure
 * message, to tell a reader how far below the expected magnitude a broken scan has fallen —
 * "only 12 found, against roughly 1642 and a floor of 1450" reads very differently from "only 12
 * found". Ordinary work moves them by a handful and no test would notice, which is exactly why
 * they are not pinned: the enforced figures are the floors, which are the ones with a failure
 * mode worth stopping.
 */
export const FLOOR_REFERENCE_STYLESHEET_SPACING_DECLARATIONS = 1737;

/** The Svelte half of the above. Illustrative likewise. */
export const FLOOR_REFERENCE_SVELTE_SPACING_DECLARATIONS = 1642;

/**
 * The table, as `'file | property | value | count'` rows in code-point order.
 *
 * Read from JSON rather than declared here — see the docblock at the top of this file for the
 * duplication-detector reason, which is about the shape of a long run of string literals in an
 * indexed `.js` and not about the data.
 */
const ROWS = JSON.parse(
  readFileSync(new URL('./spacing-known-literals.json', import.meta.url), 'utf8')
);

/**
 * The baseline as parsed rows.
 *
 * The key is (file, property, value), not file: `styles/fabricate.css` holds 176 of the 932, so
 * a per-file count would absorb a swap inside it entirely — turn an 8 into a 9 there and the
 * number does not move. `control-height-known-literals.js` made the same choice for the same
 * reason, and `manager-button-source-contract.test.js` before it.
 *
 * @returns {ReadonlyArray<{key: string, file: string, property: string, value: number,
 *   count: number}>}
 */
export const KNOWN_RAW_SPACING = Object.freeze(
  ROWS.map((row) => {
    const [file, property, value, count] = row.split(' | ');
    return Object.freeze({
      key: `${file} ${property} ${value}`,
      file,
      property,
      value: Number(value),
      count: Number(count),
    });
  })
);
