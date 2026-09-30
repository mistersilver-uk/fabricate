/**
 * The read-only band picture a routed check editor draws when its strip cannot be dragged: the
 * previewed target, the bands and the scale sentence (issues 2005 and 2006). Pure; the editor
 * injects `paint(band, tone, range)`, which owns the fill, and `text` for the copy.
 */
import { countRequired } from '../../../../../systems/countCheck.js';
import { normalizeNullableSuccesses } from '../../../../../systems/normalize/checkEvaluation.js';

import {
  bandToneFor,
  buildCountBands,
  buildRoutedBands,
  countBandScale,
  countPoolSettlesToZero,
  describeBandRange,
  describeCountBandRange,
  previewBandTarget,
  previewScaleSentence,
} from './checkBandModel.js';

/** A count's bands in net successes against the previewed record's successes needed. */
function countPicture(input, text) {
  const { graded, type, outcomes, tier, comparison, character, placement, paint } = input;
  // A count grades the previewed record's successes needed, its own when the tier sets none.
  const required = countRequired(graded, normalizeNullableSuccesses(tier?.successes));
  const names = { botch: text('FABRICATE.Admin.Manager.Checks.Odds.Botch', 'Botch') };
  const bands = buildCountBands({ evaluation: graded, required, type, outcomes, names }).map(
    (band) => paint(band, band.tone, describeCountBandRange(band, text))
  );
  const fallback = () =>
    previewScaleSentence(null, { direction: graded.direction, comparison }, text);
  if (type === 'fixed') return { target: null, bands, scale: fallback() };
  const pool = { evaluation: graded, thresholdMode: comparison, character, placement };
  const zeroPool = countPoolSettlesToZero(pool);
  const cancels = graded.pool.cancel.enabled;
  const scale = countBandScale({ required, zeroPool, cancels }, text) || fallback();
  return { target: null, bands, scale };
}

/**
 * The runtime's own classification of each total against the previewed target, toned by rank so
 * the best band takes the same hue in either direction; a fixed-type check reads no target, so
 * its ranges are drawn as authored, and a count is drawn in net successes.
 */
export function readonlyBandPicture(input, text) {
  const { graded, editableBands, type, comparison, paint } = input;
  if (graded.product === 'count') return countPicture(input, text);
  const target =
    editableBands || type === 'fixed'
      ? null
      : previewBandTarget(
          {
            evaluation: graded,
            anchor: input.anchor,
            tier: input.tier,
            character: input.character,
            modifiers: input.modifiers,
          },
          text
        );
  const scale = previewScaleSentence(target, { direction: graded.direction, comparison }, text);
  if (editableBands || (type !== 'fixed' && target?.state !== 'ok')) {
    return { target, bands: [], scale };
  }
  const bands = buildRoutedBands({
    evaluation: graded,
    comparison,
    anchor: target?.anchor ?? null,
    targetDelta: target?.delta ?? 0,
    type,
    outcomes: input.outcomes,
    min: input.min,
    max: input.max,
  });
  const painted = bands.map((band, position) => {
    const rank = graded.direction === 'under' ? bands.length - 1 - position : position;
    return paint(band, bandToneFor(rank, bands.length), describeBandRange(band, text));
  });
  return { target, bands: painted, scale };
}
