/**
 * Shared rate-to-tier mapping used by the gathering drop-rate slider, the gathering tool
 * breakage-chance slider and the banded bar's two ramp readings. Keeping the thresholds and
 * colour variables in one place keeps those surfaces visually consistent.
 *
 * Rate is expected as an integer percent in [0, 100]. Non-numeric values fall
 * back to 0 so the helpers can be passed raw form values without pre-coercion.
 */

/** The ramp keys a fill may take beyond the semantic tones, each one theme token. */
const RAMP_COLOURS = Object.freeze({
  guaranteed: 'var(--fab-drop-rate-guaranteed)',
  common: 'var(--fab-drop-rate-common)',
  uncommon: 'var(--fab-drop-rate-uncommon)',
  rare: 'var(--fab-drop-rate-rare)',
  'very-rare': 'var(--fab-drop-rate-very-rare)',
  legendary: 'var(--fab-drop-rate-legendary)',
  none: 'var(--fab-drop-rate-none)',
  'hazard-mid': 'var(--fab-hazard-mid)',
});

/** The reversed risk scale, high chance first: each tier's name and the fill it takes. */
const HAZARD_TIERS = Object.freeze([
  Object.freeze({ floor: 75, tier: 'red', fill: 'danger' }),
  Object.freeze({ floor: 50, tier: 'amber', fill: 'hazard-mid' }),
  Object.freeze({ floor: 25, tier: 'yellow', fill: 'warning' }),
  Object.freeze({ floor: -Infinity, tier: 'green', fill: 'success' }),
]);

export function normalizeRateForTier(value) {
  const number = Math.trunc(Number(value));
  if (!Number.isFinite(number)) return 0;
  return Math.min(100, Math.max(0, number));
}

export function dropRateTierClass(value) {
  const rate = normalizeRateForTier(value);
  if (rate === 0) return 'is-none';
  if (rate >= 100) return 'is-guaranteed';
  if (rate >= 70) return 'is-common';
  if (rate >= 35) return 'is-uncommon';
  if (rate >= 15) return 'is-rare';
  if (rate >= 5) return 'is-very-rare';
  return 'is-legendary';
}

/** The drop-rate ramp key for a rate: `dropRateTierClass` without its `is-` prefix. */
export function dropRateRampKey(value) {
  return dropRateTierClass(value).slice('is-'.length);
}

/** The colour a ramp key paints, or `''` for a key the ramp does not hold. */
export function rampColour(key) {
  return RAMP_COLOURS[key] ?? '';
}

export function dropRateTierColor(value) {
  return rampColour(dropRateRampKey(value));
}

/** The risk tier for a percentage, where a high chance is the hazardous end. */
function hazardTierOf(percent) {
  const numeric = Number(percent) || 0;
  return HAZARD_TIERS.find((entry) => numeric >= entry.floor);
}

/** `red`, `amber`, `yellow` or `green` for a 0–100 risk percentage. */
export function hazardTier(percent) {
  return hazardTierOf(percent).tier;
}

/** The fill a 0–100 risk percentage takes: a semantic tone, or the `hazard-mid` ramp key. */
export function hazardFill(percent) {
  return hazardTierOf(percent).fill;
}
