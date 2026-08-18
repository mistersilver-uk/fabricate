/**
 * The **Definition Storage reconciler**, entity-neutral (issues 1232, 1211, 1212).
 *
 * Extracted from `reconcileRecipeStorageLayout`, whose control flow is the single entry point
 * for every layout transition an entity class can make: the boot pass, the reaction to a GM
 * changing the target, and the resume of a crashed conversion are the same call. Component
 * extraction needs that flow verbatim, and its dispositions — `unreadable`, settled,
 * `deferred`, table lookup, `target-reverted`, `unsettled-unresolvable`, `refused`, `failed`
 * — are entity-neutral to the last branch. Only three things are not: the key pair, the
 * conversion table, and the two settled-branch hooks.
 *
 * `reconcileRecipeStorageLayout` is now a thin binding over this, and that is the mechanical
 * detector for regressing issue 1211 while refactoring it: every shipped #1211 suite must
 * pass BYTE-IDENTICAL against the binding.
 *
 * ## Every disposition, and why each is where it is
 *
 * - **`unreadable`** — positively established or nothing. An unrecognised layout or target is
 *   not something to convert toward, and writing one back would launder it into the world as
 *   though it were. BOTH values are checked, and weakening the guard to the layout alone is a
 *   live slip: the target axis is what a GM writes.
 * - **settled** (`layout === target`) — nothing to convert, but the entity class's two
 *   envelope questions still have to be answered, so the settled hooks run. This branch sits
 *   ABOVE the migration deferral deliberately, and the ordering is behaviour rather than
 *   style: hoisting the deferral above it would return `deferred` on every migrating boot of
 *   a settled world — telling the GM a storage change is pending when none is — AND would
 *   skip the settled hooks entirely, which for components silently disables the residual-key
 *   detector on exactly those boots.
 * - **`deferred`** — a conversion must not run in a boot whose migration pass persisted a
 *   corpus key, because two clients' passes are not byte-reproducible over the same source.
 * - **`target-reverted`** — no conversion exists for this transition and the layout is
 *   SETTLED, so the world is returned to `layout === target` and the Valid Id Basis gate
 *   stays satisfied. Removing it strands a world at `layout !== target` permanently.
 * - **`unsettled-unresolvable`** — an `unsettled` layout cannot be repaired by a settings
 *   write, so it is reported and the gate correctly keeps refusing.
 * - **`refused`** — the conversion wrote NOTHING, so there is nothing to compensate and both
 *   keys are left exactly as found. Compensating here is what turns a refusal into a total
 *   loss on the NEXT boot: it reverts the target onto the layout, which on the forward
 *   direction is the one value the reclaimer is armed by.
 * - **`failed`** — either a conversion that already compensated itself (never compensated
 *   twice) or an unexpected throw, which compensates both keys.
 *
 * Never throws. A conversion failure is compensated and reported in the return value, because
 * this runs during startup and a rejected promise there would take the module down for a
 * world whose only fault is a half-finished storage change.
 */

import { DEFINITION_STORAGE_LAYOUTS, DEFINITION_STORAGE_TARGETS } from '../config/settings.js';

import { isRecognisedArrangement } from './definitionStorageArrangement.js';

/** Every value a Definition Storage TARGET may legitimately hold. */
const RECOGNISED_TARGETS = Object.freeze(Object.values(DEFINITION_STORAGE_TARGETS));

/**
 * Read a setting through the injected accessor without letting an unregistered key or an
 * absent `game` throw.
 *
 * @param {(key: string) => *} getSetting
 * @param {string} key
 * @returns {*} `null` when the value could not be read at all.
 */
export function readSettingDefensively(getSetting, key) {
  try {
    const value = getSetting(key);
    return value === undefined ? null : value;
  } catch {
    return null;
  }
}

/**
 * Write a setting, swallowing a failure.
 *
 * Only ever used on a COMPENSATION leg, where the operation's own error is the one the
 * caller must see: a compensation failure that replaced it would report the wrong reason for
 * the wrong thing. It is not silent — the caller reports the state it could not leave.
 *
 * @param {(key: string, value: *) => Promise<*>} setSetting
 * @param {string} key
 * @param {*} value
 * @returns {Promise<void>}
 */
export async function compensateSetting(setSetting, key, value) {
  try {
    await setSetting(key, value);
  } catch (error) {
    console.error(`Fabricate | failed to compensate the setting "${key}"`, error);
  }
}

/**
 * @typedef {object} DefinitionStorageReconcilerDescriptor
 * @property {string} layoutKey the entity class's Definition Storage LAYOUT setting key
 * @property {string} targetKey the entity class's Definition Storage TARGET setting key
 * @property {(from: string, to: string) => Function|null} conversionFor the class's declared
 *   conversion table lookup
 * @property {(options: object) => Promise<object|null>} [onSettledLegacy] the settled
 *   `singleArray` hook — envelope reclamation for the class. Returns a report fragment, or
 *   `null` for "nothing to report".
 * @property {(options: object) => Promise<object|null>} [onSettledGranular] the settled
 *   `perRecord` hook — the class's surviving-source detector. Returns a report fragment, or
 *   `null`.
 * @property {(error: Error) => boolean} isRefusal recognises the class's typed pre-write
 *   refusal
 * @property {(error: Error) => boolean} isSelfCompensated recognises the class's typed
 *   already-compensated failure
 */

/**
 * Bring one entity class's Definition Storage LAYOUT into agreement with its TARGET.
 *
 * @param {DefinitionStorageReconcilerDescriptor} descriptor the entity class's three
 *   non-neutral facts.
 * @param {object} options
 * @param {(key: string) => *} options.getSetting Setting reader. A PARAMETER rather than an
 *   import so the whole reconciler is drivable from a fixture.
 * @param {(key: string, value: *) => Promise<*>} options.setSetting Setting writer.
 * @param {() => any} [options.documentClass] Injected for tests.
 * @param {() => Iterable<any>|null} [options.collection] Injected for tests.
 * @param {{exists: Function, delete: Function}} [options.settingDocuments] Injected for
 *   tests; whole-`Setting`-document presence and deletion.
 * @param {boolean} [options.migrationPassPersistedCorpusKey=false] Whether THIS boot's
 *   migration pass issued a write to any corpus key. Defaults to "it did not", so every
 *   existing caller is unaffected and a wiring regression fails OPEN.
 * @returns {Promise<{action: string, layout: string|null, target: string|null,
 *   records?: number, reclaimed?: number, error?: Error}>}
 */
export async function reconcileDefinitionStorageLayout(descriptor, options) {
  const { getSetting, setSetting, migrationPassPersistedCorpusKey = false } = options;
  const layout = readSettingDefensively(getSetting, descriptor.layoutKey);
  const target = readSettingDefensively(getSetting, descriptor.targetKey);
  // Positively established or nothing, on BOTH axes. An unrecognised value is not something
  // to convert toward, and writing one back would launder it into the world as though it
  // were.
  if (!isRecognisedArrangement(layout) || !RECOGNISED_TARGETS.includes(target)) {
    return { action: 'unreadable', layout, target };
  }

  if (layout === target) {
    return _reconcileSettled(descriptor, { ...options, layout, target });
  }

  // The one-boot deferral (issue 1211). Placed here rather than at the top of the reconciler
  // deliberately: a settled world has no conversion to defer, and returning `deferred` for
  // one would tell the GM on EVERY migrating boot that a storage change is pending when none
  // is — and would skip the settled hooks, which is where an extracted class's residual
  // detector lives. Everything below this line either converts or writes a key, and neither
  // may happen in a boot whose migration pass wrote a corpus key.
  if (migrationPassPersistedCorpusKey) {
    return { action: 'deferred', layout, target };
  }

  const run = descriptor.conversionFor(layout, target);
  if (!run) {
    // No conversion exists for this transition in this build. A SETTLED layout is restored to
    // by reverting the target, which returns the world to `layout === target` and keeps the
    // Valid Id Basis gate satisfied — the whole point of routing the flip through here.
    if (layout !== DEFINITION_STORAGE_LAYOUTS.UNSETTLED) {
      await setSetting(descriptor.targetKey, layout);
      return { action: 'target-reverted', layout, target };
    }
    // An `unsettled` layout cannot be repaired by a settings write: `unsettled` is not a legal
    // target, and the corpus really is spread across both arrangements. This build has no
    // resume toward the requested target, so it is reported, and the gate correctly keeps
    // refusing.
    return { action: 'unsettled-unresolvable', layout, target };
  }

  return _runConversion(descriptor, { ...options, layout, target, run });
}

/**
 * The conversion leg, with its three dispositions.
 *
 * Extracted so {@link reconcileDefinitionStorageLayout} stays under the cognitive-complexity
 * bar the SonarCloud gate applies to a CHANGED function.
 *
 * @param {DefinitionStorageReconcilerDescriptor} descriptor
 * @param {object} options
 * @returns {Promise<object>}
 */
async function _runConversion(descriptor, options) {
  const { getSetting, setSetting, documentClass, collection, settingDocuments, layout, target } =
    options;
  try {
    const result = await options.run({
      getSetting,
      setSetting,
      documentClass,
      collection,
      settingDocuments,
    });
    return { action: 'converted', layout: target, target, ...result };
  } catch (error) {
    // A REFUSAL wrote nothing, so there is nothing to compensate and both keys are left
    // exactly as found (issue 1211). Compensating here is what turns a refusal into a total
    // loss on the NEXT boot: it reverts the target onto the layout, and on the forward
    // direction that value is `singleArray`, which is the one value the envelope reclaimer is
    // armed by. The surviving `layout !== target` world is refused by Valid Id Basis clause 2
    // and reported permanently, exactly as `unsettled-unresolvable` already is.
    if (descriptor.isRefusal(error)) {
      return { action: 'refused', layout, target, error, ...error.details };
    }
    // A conversion that compensated ITSELF is not compensated again. On the forward direction
    // a second pass would fabricate the very layout document the conversion had just deleted,
    // and would revert the target as above.
    if (descriptor.isSelfCompensated(error)) {
      const cause = error.cause;
      return {
        action: 'failed',
        layout,
        target,
        error: cause instanceof Error ? cause : new Error(String(cause ?? error.message)),
      };
    }
    // Compensate BOTH keys. Restoring the layout alone would leave exactly the permanently
    // gate-refused world this reconciler exists to make unreachable.
    await compensateSetting(setSetting, descriptor.layoutKey, layout);
    if (layout !== DEFINITION_STORAGE_LAYOUTS.UNSETTLED) {
      await compensateSetting(setSetting, descriptor.targetKey, layout);
    }
    return {
      action: 'failed',
      layout,
      target,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

/**
 * The `layout === target` branch: nothing to convert, but two envelope questions to answer.
 *
 * The two settled arrangements ask genuinely different questions and are NOT mirror images:
 * one asks whether granular debris survived a settled legacy world, the other whether a
 * legacy source survived a settled granular one — and only the second can be carrying data a
 * downgraded build authored.
 *
 * @param {DefinitionStorageReconcilerDescriptor} descriptor
 * @param {object} options
 * @returns {Promise<object>} the reconcile report.
 */
async function _reconcileSettled(descriptor, options) {
  const { layout, target } = options;
  const hook =
    layout === DEFINITION_STORAGE_LAYOUTS.SINGLE_ARRAY
      ? descriptor.onSettledLegacy
      : layout === DEFINITION_STORAGE_LAYOUTS.PER_RECORD
        ? descriptor.onSettledGranular
        : null;
  if (typeof hook !== 'function') {
    return { action: 'settled', layout, target, reclaimed: 0 };
  }
  const report = await hook(options);
  if (report?.action) return { ...report, layout, target };
  return { action: 'settled', layout, target, reclaimed: report?.reclaimed ?? 0 };
}
