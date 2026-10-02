/**
 * The vocabulary of the RAW SPACING LITERALS gate (issue 1448): what it scans and what it exempts.
 * `openspec/specs/ui-visual-style/spec.md` has made the 4px spacing scale normative under its
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

/** The properties the spacing scale governs, exactly as `ui-visual-style/spec.md` names them: */
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

/** The per-corpus spacing-declaration counts the floors were CHOSEN AGAINST. */
export const FLOOR_REFERENCE_STYLESHEET_SPACING_DECLARATIONS = 1445;

/** The Svelte half of the above. Illustrative likewise. */
export const FLOOR_REFERENCE_SVELTE_SPACING_DECLARATIONS = 1642;
