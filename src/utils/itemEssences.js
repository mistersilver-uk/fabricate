/**
 * The essences one held item carries, as one rule for every reader: its own `essences` flag when
 * that carries any, else its component's. Kept to a single import because the mounted-component
 * harness copies the inventory snapshot and everything it imports.
 */
import { getFabricateFlag } from '../config/flags.js';

/** Trimmed essence ids with positive finite amounts, summing ids that trim to the same id. */
export function normalizeEssences(essences = {}) {
  const normalized = {};
  if (!essences || typeof essences !== 'object') return normalized;

  for (const [rawType, rawQuantity] of Object.entries(essences)) {
    const type = String(rawType || '').trim();
    if (!type) continue;

    const quantity = Number(rawQuantity);
    if (!Number.isFinite(quantity) || quantity <= 0) continue;

    normalized[type] = (normalized[type] || 0) + quantity;
  }

  return normalized;
}

/**
 * Per unit of `item`. `componentOf` is called only when the flag carries nothing, so a caller
 * that must resolve the component pays for it only then.
 */
export function essencesOfItem(item, componentOf = () => null) {
  const flagged = normalizeEssences(getFabricateFlag(item, 'essences', {}));
  if (Object.keys(flagged).length > 0) return flagged;
  return normalizeEssences(componentOf()?.essences || {});
}
