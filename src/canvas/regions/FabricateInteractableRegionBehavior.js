/**
 * The `fabricate.interactable` Region Behaviour data model + its registration
 * edge.
 *
 * This is the thin Foundry edge. The base class
 * `foundry.data.regionBehaviors.RegionBehaviorType` does NOT exist in the Node
 * test environment, so this module is import-safe by construction: NOTHING is
 * subclassed at module top level. Instead we export a factory
 * (`createInteractableRegionBehaviorClass`) that takes the base class + the
 * `fields` namespace as injected dependencies, and a defensive resolver
 * (`registerInteractableRegionBehavior`) that reads those off `globalThis` only
 * when actually called in a live Foundry `init`.
 *
 * The schema + system shaping live in the PURE `interactableRegionFlags.js`; this
 * module only wires the class + the CONFIG registration. The `static events`
 * handlers delegate to an `InteractableManager.instance` seam whose
 * `onRegionEnter` / `onRegionExit` methods are added in Phase 1c — they are
 * optional-chained so registering this behaviour now is a safe no-op.
 */

import {
  INTERACTABLE_BEHAVIOR_SUBTYPE,
  buildInteractableBehaviorSchema
} from './interactableRegionFlags.js';

const DEFAULT_ICON = 'fas fa-mortar-pestle';
const DEFAULT_LABEL = 'FABRICATE.Canvas.Interactable.BehaviorLabel';

/**
 * Build a `RegionBehaviorType` subclass for the `fabricate.interactable` subtype.
 * Pure-ish factory: the base class + `fields` namespace are injected, so it never
 * touches `globalThis`. Returns the subclass (not an instance).
 *
 * The returned class:
 *  - `static defineSchema()` → `buildInteractableBehaviorSchema(fields)`.
 *  - `static events` → `tokenEnter` / `tokenExit` async handlers that defensively
 *    delegate to `InteractableManager.instance?.onRegionEnter?.(event)` /
 *    `onRegionExit?.(event)` (a Phase-1c seam) and never throw.
 *
 * @param {object} params
 * @param {Function} params.RegionBehaviorType  The Foundry base class.
 * @param {object} params.fields                The `foundry.data.fields` namespace.
 * @returns {Function} The subclass.
 */
export function createInteractableRegionBehaviorClass({ RegionBehaviorType, fields } = {}) {
  if (typeof RegionBehaviorType !== 'function') {
    throw new Error('createInteractableRegionBehaviorClass requires a RegionBehaviorType base class');
  }
  if (!fields || typeof fields !== 'object') {
    throw new Error('createInteractableRegionBehaviorClass requires a Foundry fields namespace');
  }

  class FabricateInteractableRegionBehavior extends RegionBehaviorType {
    static defineSchema() {
      return buildInteractableBehaviorSchema(fields);
    }

    static events = {
      // Region behaviour event handlers run on EVERY connected client with `this`
      // bound to the behaviour. The manager seam decides prompt (local controlling
      // user) vs mutation (active GM); these handlers are deliberately thin +
      // no-throw so an undefined manager (pre-1c) is a safe no-op.
      tokenEnter: async function tokenEnter(event) {
        try {
          const manager = globalThis.game?.fabricate?.interactableManager
            ?? globalThis.fabricate?.interactableManager;
          await manager?.onRegionEnter?.(event, this);
        } catch (_error) {
          // Defensive: a region-event handler must never throw into Foundry.
        }
      },
      tokenExit: async function tokenExit(event) {
        try {
          const manager = globalThis.game?.fabricate?.interactableManager
            ?? globalThis.fabricate?.interactableManager;
          await manager?.onRegionExit?.(event, this);
        } catch (_error) {
          // Defensive: a region-event handler must never throw into Foundry.
        }
      }
    };
  }

  return FabricateInteractableRegionBehavior;
}

/**
 * Mutate a CONFIG object to register the behaviour data model + its type
 * icon/label. PURE (a fake config is enough to test): assigns into
 * `config.RegionBehavior.dataModels` / `typeIcons` / `typeLabels`. Idempotent —
 * skips the assignment when the subtype is already registered. Returns the class
 * that is registered (the existing one when already present).
 *
 * @param {object} config  A `CONFIG`-shaped object with a `RegionBehavior` block.
 * @param {Function} Class  The behaviour subclass to register.
 * @param {object} [opts]
 * @param {string} [opts.icon]
 * @param {string} [opts.label]
 * @returns {Function|null}
 */
export function assignInteractableBehaviorRegistration(config, Class, { icon = DEFAULT_ICON, label = DEFAULT_LABEL } = {}) {
  const regionConfig = config?.RegionBehavior;
  if (!regionConfig || typeof regionConfig !== 'object') return null;
  if (!regionConfig.dataModels || typeof regionConfig.dataModels !== 'object') return null;

  const existing = regionConfig.dataModels[INTERACTABLE_BEHAVIOR_SUBTYPE];
  if (existing) return existing;

  regionConfig.dataModels[INTERACTABLE_BEHAVIOR_SUBTYPE] = Class;
  if (regionConfig.typeIcons && typeof regionConfig.typeIcons === 'object') {
    regionConfig.typeIcons[INTERACTABLE_BEHAVIOR_SUBTYPE] = icon;
  }
  if (regionConfig.typeLabels && typeof regionConfig.typeLabels === 'object') {
    regionConfig.typeLabels[INTERACTABLE_BEHAVIOR_SUBTYPE] = label;
  }
  return Class;
}

/**
 * Register the `fabricate.interactable` behaviour data model in a live Foundry
 * `init`. EDGE + defensive + idempotent + import-safe (no top-level globalThis
 * access — all resolution happens inside this function when called).
 *
 * Resolves `RegionBehaviorType` + `fields` from injected `deps` first, then from
 * `globalThis.foundry.data.*`. If either is missing, or the config has no
 * `RegionBehavior.dataModels` block, it is a no-op returning `null`.
 *
 * @param {object} [config]  Defaults to `globalThis.CONFIG`.
 * @param {object} [deps]
 * @param {Function} [deps.RegionBehaviorType]
 * @param {object} [deps.fields]
 * @param {string} [deps.icon]
 * @param {string} [deps.label]
 * @returns {Function|null} The registered class, or `null` when it could not register.
 */
export function registerInteractableRegionBehavior(config = globalThis.CONFIG, deps = {}) {
  const RegionBehaviorType = deps.RegionBehaviorType
    ?? globalThis.foundry?.data?.regionBehaviors?.RegionBehaviorType;
  const fields = deps.fields ?? globalThis.foundry?.data?.fields;

  if (typeof RegionBehaviorType !== 'function' || !fields || typeof fields !== 'object') {
    return null;
  }
  if (!config?.RegionBehavior?.dataModels || typeof config.RegionBehavior.dataModels !== 'object') {
    return null;
  }

  // Idempotent: if already registered, return the existing class without rebuilding.
  const existing = config.RegionBehavior.dataModels[INTERACTABLE_BEHAVIOR_SUBTYPE];
  if (existing) return existing;

  let Class;
  try {
    Class = createInteractableRegionBehaviorClass({ RegionBehaviorType, fields });
  } catch (_error) {
    return null;
  }
  return assignInteractableBehaviorRegistration(config, Class, {
    icon: deps.icon ?? DEFAULT_ICON,
    label: deps.label ?? DEFAULT_LABEL
  });
}
