import {
  normalizeList,
  numberOrNull,
  stringOrNull,
} from '../../systems/gatheringEngineInternals.js';
import { dropThreshold } from '../../systems/gatheringRichStateInternals.js';

/**
 * An active d100 run's preview rows: each enabled drop with its chance (the recorded final rate
 * where the run has one) and the effective roll the engine drops it on.
 * `entryFor(row, index, chance)` builds the presented row.
 */
export function d100PreviewEntries({ task, run, entryFor }) {
  const evaluatedRows = Array.isArray(run?.checkResult?.itemRows)
    ? run.checkResult.itemRows
    : normalizeList(run?.checkResult?.items);
  const actualById = new Map(
    evaluatedRows
      .filter((item) => stringOrNull(item?.id))
      .map((item) => [stringOrNull(item.id), item])
  );
  return normalizeList(task?.dropRows ?? task?.itemDrops)
    .filter((row) => row?.enabled !== false)
    .map((row, index) => {
      const actual = actualById.get(stringOrNull(row?.id));
      const rate = numberOrNull(actual?.finalDropRate) ?? numberOrNull(row?.dropRate) ?? 0;
      const chance = Math.min(100, Math.max(0, rate));
      return { ...entryFor(row, index, chance), threshold: dropThreshold(chance) };
    });
}
