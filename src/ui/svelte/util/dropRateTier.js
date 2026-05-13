/**
 * Shared rate-to-tier mapping used by the gathering drop-rate slider and the
 * gathering tool breakage-chance slider. Keeping the thresholds and colour
 * variables in one place keeps the two surfaces visually consistent.
 *
 * Rate is expected as an integer percent in [0, 100]. Non-numeric values fall
 * back to 0 so the helpers can be passed raw form values without pre-coercion.
 */

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

export function dropRateTierColor(value) {
  const rate = normalizeRateForTier(value);
  if (rate === 0) return 'var(--fab-drop-rate-none)';
  if (rate >= 100) return 'var(--fab-drop-rate-guaranteed)';
  if (rate >= 70) return 'var(--fab-drop-rate-common)';
  if (rate >= 35) return 'var(--fab-drop-rate-uncommon)';
  if (rate >= 15) return 'var(--fab-drop-rate-rare)';
  if (rate >= 5) return 'var(--fab-drop-rate-very-rare)';
  return 'var(--fab-drop-rate-legendary)';
}
