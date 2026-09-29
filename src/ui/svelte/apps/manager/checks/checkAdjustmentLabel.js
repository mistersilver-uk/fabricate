/**
 * The Studio's difficulty-adjustment stepping stops and tier reading. The labels and their parser
 * live in `src/utils/checkAdjustmentFormat.js`, re-exported here for the Studio's callers.
 */
import { formatCheckAdjustment } from '../../../../../utils/checkAdjustmentFormat.js';

export {
  formatCheckAdjustment,
  parseCheckAdjustment,
} from '../../../../../utils/checkAdjustmentFormat.js';

/** The multiply kind's stepping stops, ascending: ×⅕, ×¼, ×⅓, ×½, ×1 and ×2. */
export const MULTIPLIER_STOPS = Object.freeze([1 / 5, 1 / 4, 1 / 3, 1 / 2, 1, 2]);

/**
 * The previewed tier's `{ name, adjustment }` reading under a character-value `evaluation`, or null
 * when the check is not graded against one or the tier sets no adjustment.
 */
export function previewTierAdjustment(evaluation, tier) {
  const target = evaluation?.target;
  if (target?.source !== 'attribute' || !tier) return null;
  const adjustment = formatCheckAdjustment(target.adjustmentKind, tier.adjustment);
  return adjustment ? { name: tier.name || '', adjustment } : null;
}
