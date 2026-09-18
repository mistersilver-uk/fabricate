/**
 * The measured, frozen debt in RAW SPACING LITERALS (issue 1448).
 * `openspec/specs/ui-integration/spec.md` has made the 4px spacing scale normative under its
 * "Spacing scale" section since the design system landed: padding, margin and gap "must derive
 * from a shared 4px-based spacing scale ... rather than from raw pixel literals". Nothing checked
 * it, and half the corpus could not have been checked — `npm run lint:css` globs `styles/**`
 * only, so the 1642 spacing declarations inside Svelte scoped `<style>` blocks were unreachable
 * by stylelint entirely.
 * -- THE SCAN IS SIGN-BLIND, AND BOTH EXEMPTIONS ARE MAGNITUDES ---------------------------
 * `styleBlockScan.js` says so in terms: its pixel pattern excludes a word character or a dot
 * before a digit and a minus is neither, so `margin: -8px` tallies as `8px`. For a height gate
 * that is unreachable; for a spacing gate it is a real limitation, and it is not worked around
 * here because it does not bite. Both exemptions are stated by the spec as magnitudes — `1px`
 * hairlines expressly include `-1px` overlap bleeds — so the predicates are written on the
 * absolute value and agree with the sign-blind reading exactly. A future exemption that had to
 * tell `-8px` from `8px` would need that pattern changed rather than this file.
 */
import { readFileSync } from 'node:fs';

/** The properties the spacing scale governs, exactly as `ui-integration/spec.md` names them: */
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
 * `--fab-space-2xs` and `--fab-space-chip`. Five semantic aliases stood beside them and were
 * deleted for having no readers anywhere in `styles/` or `src/` (issue 1499).
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
 * The headline. Pinned exactly rather than derived.
 * It was 906 until the same issue widened `Callout` onto its own specimen. Five more occurrences
 * went, from two deletions. The Checks studio's `[data-failure-salvage-note]` override — the
 * caller rule whose content the primitive converged onto — took `gap: 11px` and
 * `padding: 13px 14px` with it, so three `styles/fabricate.css` rows each fall by one against
 * the sheet's other occurrences; and the inventory salvage banner's scoped block took its
 * `padding: 10px` and its title/rule `gap: 2px`, each that file's only occurrence, so both rows
 * are DELETED. Every one of the five is now `var(--fab-space-3)` or the specimen's own
 * `margin-top` inside the primitive, so none of them left a slot open.
 */
// 897 -> 895 (issue 1506): the journal's `RunStatusPill` was DELETED.
// 877 -> 863 (issue 1514, phase 3): the alchemy and journal tabs' twelve raw thumbnails, seven
// pane empties and two wells moved onto primitives that own their own geometry, and the rules
// those markup blocks declared went with them. Six rows SHRINK by one occupancy each - the
// `gap`s and `padding`s of `.alchemy-inventory-empty`, `.alchemy-known-empty` and
// `.alchemy-known-footer` - and eight rows at one occupancy VANISH, five of them the whole of
// `TimeRemainingBox` and `JournalListShell`'s and `RunDetail`'s deleted empty-state stacks. The
// two caller-owned WRAPPERS this phase keeps bring nothing back: `.alchemy-known-footer-slot`
// declares `margin-top: 12px` and `.alchemy-produces-slot` declares `margin: 18px 0 10px`, and
// all three of those values were already banked rows on the rules they came from - 12 and 18 and
// 10 are literals either way, so a wrapper carrying a margin verbatim moves no occupancy. What
// the primitives absorb is `var(--fab-space-*)` throughout, so the fourteen occupancies are paid
// rather than relocated. Measured on the tree, not subtracted.
// `.fabricate-app-extension-fault` keeps `max-width` and `margin: 20px`, and its 20 was already a
// banked row on that same rule, so a wrapper carrying a margin verbatim moves no occupancy;
// `.crafting-shopping-empty` keeps the `var(--fab-space-4)` it already had; and
// `.actor-bar-stamina-track` and `.essence-pool-bar` keep a width and a display and no spacing at
// all. What the primitives absorb is `var(--fab-space-*)` throughout, so the nine occupancies are
// paid rather than relocated. Measured on the tree, not subtracted.
export const KNOWN_RAW_SPACING_TOTAL = 811;

/** The per-corpus spacing-declaration counts the floors were CHOSEN AGAINST. */
export const FLOOR_REFERENCE_STYLESHEET_SPACING_DECLARATIONS = 1445;

/** The Svelte half of the above. Illustrative likewise. */
export const FLOOR_REFERENCE_SVELTE_SPACING_DECLARATIONS = 1642;

/** The table, as `'file | property | value | count'` rows in code-point order. */
const ROWS = JSON.parse(
  readFileSync(new URL('./spacing-known-literals.json', import.meta.url), 'utf8')
);

/**
 * The baseline as parsed rows.
 *
 * @returns {ReadonlyArray<{key: string, file: string, property: string, value: number,
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
