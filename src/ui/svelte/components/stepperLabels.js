/**
 * The accessible names a `<Stepper>` needs, derived from the field's own label, as
 * `<Stepper value={dc} {...stepperLabels(text('…TaskDcOverride', 'DC'))} onChange={…} />`.
 * Where the input's own name differs from the name the adjuncts should read, spread this and
 * override `ariaLabel` AFTER it.
 *
 * A separate module rather than something `Stepper` does itself, because that primitive is an
 * import-free leaf that localizes nothing.
 */
import { localize } from '../util/foundryBridge.js';

export const STEPPER_DECREASE_KEY = 'FABRICATE.Common.Stepper.Decrease';

export const STEPPER_INCREASE_KEY = 'FABRICATE.Common.Stepper.Increase';

/** Name a `Stepper`'s input and both adjuncts from one already-localized field label. */
export function stepperLabels(label) {
  return {
    ariaLabel: label,
    decrementLabel: localize(STEPPER_DECREASE_KEY, { label }),
    incrementLabel: localize(STEPPER_INCREASE_KEY, { label }),
  };
}
