/** The vocabulary of the retired CONTROL HEIGHTS gate (issue 1391): the ladder and what it scans. */

/** The rungs the spec publishes. Also asserted to appear, individually, in the spec text. */
export const LADDER_RUNGS = Object.freeze([26, 28, 30, 34, 38, 44]);

/** The heights the spec retires. The gate bans these three and nothing else. */
export const RETIRED_CONTROL_HEIGHTS = Object.freeze([32, 36, 40]);

/** The six properties that can set a control's height. */
export const SCANNED_HEIGHT_PROPERTIES = Object.freeze([
  'height',
  'min-height',
  'max-height',
  'block-size',
  'min-block-size',
  'max-block-size',
]);

/** The per-corpus height-declaration counts the floors were CHOSEN AGAINST. */
export const FLOOR_REFERENCE_STYLESHEET_DECLARATIONS = 491;

/** The Svelte half of {@link FLOOR_REFERENCE_STYLESHEET_DECLARATIONS}. Illustrative likewise. */
export const FLOOR_REFERENCE_SVELTE_DECLARATIONS = 440;
