/**
 * The accessible names a `<Stepper>` needs, derived from the field's own label.
 *
 * `Stepper` is an import-free leaf that localizes NOTHING itself, so every call site has to name
 * the typeable input and both adjuncts. The adjunct pair is mechanically derived from the input's
 * label through two parametrized keys, so the derivation lives here and a call site spreads it:
 *
 * ```svelte
 * <Stepper value={dc} {...stepperLabels(text('…TaskDcOverride', 'DC'))} onChange={…} />
 * ```
 *
 * Where the input's own name differs from the name the adjuncts should read, spread this and
 * override `ariaLabel` AFTER it.
 *
 * A separate module rather than something `Stepper` does itself: the primitive imports nothing,
 * and one util import inside it would propagate a required raw-module entry into every mount
 * harness that compiles anything rendering it.
 */
import { localize } from '../util/foundryBridge.js';

/** The localization key for the `−` adjunct's accessible name, parametrized on `{label}`. */
export const STEPPER_DECREASE_KEY = 'FABRICATE.Common.Stepper.Decrease';

/** The localization key for the `+` adjunct's accessible name, parametrized on `{label}`. */
export const STEPPER_INCREASE_KEY = 'FABRICATE.Common.Stepper.Increase';

/**
 * Name a `Stepper`'s input and both of its adjuncts from one already-localized field label.
 *
 * @param {string} label The field's own localized label, e.g. `'Custom salvage DC'`.
 * @returns {{ ariaLabel: string, decrementLabel: string, incrementLabel: string }} Props to spread
 *   onto a `<Stepper>`.
 */
export function stepperLabels(label) {
  return {
    ariaLabel: label,
    decrementLabel: localize(STEPPER_DECREASE_KEY, { label }),
    incrementLabel: localize(STEPPER_INCREASE_KEY, { label }),
  };
}
