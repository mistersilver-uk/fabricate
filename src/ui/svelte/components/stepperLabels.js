/**
 * The accessible names a `<Stepper>` needs, derived from the field's own label (issue 1050).
 *
 * `Stepper` is an import-free leaf that localizes NOTHING itself, so every call site has to name
 * three things: the typeable input, the `−` adjunct and the `+` adjunct. The names are not three
 * independent strings — the adjunct pair is mechanically derived from the input's label through the
 * two parametrized keys `FABRICATE.Common.Stepper.Decrease` / `.Increase`, which exist precisely so
 * one key serves every field. Written out per call site that derivation is six lines of ritual
 * repeated ~23 times, identical but for one expression, which is one implementation written out
 * twenty-three times and the largest single source of duplicated markup in the migration.
 *
 * So the derivation lives here and a call site spreads it:
 *
 * ```svelte
 * <Stepper value={dc} {...stepperLabels(text('…TaskDcOverride', 'DC'))} onChange={…} />
 * ```
 *
 * Where the input's own name differs from the name the adjuncts should read — the tier-step
 * operand, whose only name is "Steps up" and whose adjuncts would otherwise say "Decrease Steps up"
 * — spread this and override `ariaLabel` AFTER it, which is exactly what "the adjuncts take the
 * row's label, the input takes the operand's" looks like in markup.
 *
 * This is a separate module rather than something `Stepper` does itself: the primitive imports
 * nothing, and one util import inside it would propagate a required raw-module entry into every
 * mount harness that compiles anything rendering it. Consumers of this helper already import
 * `localize` from the same bridge, so it adds no new dependency to any of them.
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
