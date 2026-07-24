import { normalizeRateForTier } from './dropRateTier.js';

const TOOL_BREAKAGE_CHANCE_STOPS = [
  { at: 0, color: 'var(--fab-success)' },
  { at: 33, color: 'var(--fab-warning)' },
  { at: 66, color: 'var(--fab-badge-gold)' },
  { at: 100, color: 'var(--fab-danger)' },
];

/**
 * Resolve a value continuously between theme-aware CSS colour stops.
 *
 * @param {number|string} value
 * @param {Array<{at: number, color: string}>} stops
 * @returns {string}
 */
export function interpolateCssColorScale(value, stops) {
  const chance = normalizeRateForTier(value);
  const scale = [...stops].sort((left, right) => left.at - right.at);
  if (scale.length === 0) return 'var(--fab-mv2-accent)';
  if (chance <= scale[0].at) return scale[0].color;

  for (let index = 1; index < scale.length; index += 1) {
    const lower = scale[index - 1];
    const upper = scale[index];
    if (chance > upper.at) continue;
    if (chance === upper.at || upper.at === lower.at) return upper.color;

    const upperWeight = Math.round(((chance - lower.at) / (upper.at - lower.at)) * 10_000) / 100;
    const lowerWeight = Math.round((100 - upperWeight) * 100) / 100;
    return `color-mix(in srgb, ${lower.color} ${lowerWeight}%, ${upper.color} ${upperWeight}%)`;
  }

  return scale.at(-1).color;
}

/**
 * Resolve Tool breakage risk onto the shared Fabricate status palette.
 *
 * @param {number|string} value
 * @returns {string}
 */
export function toolBreakageChanceColor(value) {
  return interpolateCssColorScale(value, TOOL_BREAKAGE_CHANCE_STOPS);
}
