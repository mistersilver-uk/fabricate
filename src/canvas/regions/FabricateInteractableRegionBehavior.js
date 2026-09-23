/**
 * The `fabricate.interactable` behaviour class and its CONFIG registration — the thin edge over
 * the pure schema in `interactableRegionFlags.js`.
 * IMPORT-SAFE BY CONSTRUCTION: `RegionBehaviorType` does not exist under Node, so nothing is
 * subclassed at module top level and `globalThis` is read only inside a live `init`.
 */

import {
  INTERACTABLE_BEHAVIOR_SUBTYPE,
  buildInteractableBehaviorSchema,
} from './interactableRegionFlags.js';

const DEFAULT_ICON = 'fas fa-mortar-pestle';
const DEFAULT_LABEL = 'FABRICATE.Canvas.Interactable.BehaviorLabel';

/**
 * Build the subclass, base class and `fields` injected so it never touches `globalThis`. Its
 * `static events` handlers delegate to the `InteractableManager.instance` seam and never throw.
 */
export function createInteractableRegionBehaviorClass({ RegionBehaviorType, fields } = {}) {
  if (typeof RegionBehaviorType !== 'function') {
    throw new TypeError(
      'createInteractableRegionBehaviorClass requires a RegionBehaviorType base class'
    );
  }
  if (!fields || typeof fields !== 'object') {
    throw new Error('createInteractableRegionBehaviorClass requires a Foundry fields namespace');
  }

  class FabricateInteractableRegionBehavior extends RegionBehaviorType {
    // The core schema-driven sheet labels each field from `<PREFIX>.FIELDS.<fieldPath>`; without
    // a prefix its fields render as a stack of bare unlabeled inputs.
    static LOCALIZATION_PREFIXES = ['FABRICATE.RegionBehavior.Interactable'];

    static defineSchema() {
      const schema = buildInteractableBehaviorSchema(fields);
      // SUBSCRIPTION, not dispatch: a V13 behaviour only RECEIVES events named in the instance
      // `events` Set Foundry populates from this field. Without it the handlers never fire.
      // Resolved defensively so a renamed API degrades to "no events field".
      if (typeof RegionBehaviorType._createEventsField === 'function') {
        const subscribedEvents = ['tokenEnter', 'tokenExit'];
        schema.events = RegionBehaviorType._createEventsField({
          events: subscribedEvents,
          initial: subscribedEvents,
        });
      }
      return schema;
    }

    static events = {
      // A V13 `static events` handler binds `this` to the DATA MODEL, not the document, so
      // `this.type` and `this.system` are undefined. The manager seam needs the DOCUMENT (for
      // `type`, `system`, the parent Region and its Scene), so pass the base getter
      // `this.behavior`, falling back to `this.parent` then `this` for non-V13 fakes.
      // These run on EVERY connected client, so they stay thin and no-throw.
      tokenEnter: async function tokenEnter(event) {
        try {
          const manager =
            globalThis.game?.fabricate?.interactableManager ??
            globalThis.fabricate?.interactableManager;
          await manager?.onRegionEnter?.(event, this?.behavior ?? this?.parent ?? this);
        } catch {
          // Defensive: a region-event handler must never throw into Foundry.
        }
      },
      tokenExit: async function tokenExit(event) {
        try {
          const manager =
            globalThis.game?.fabricate?.interactableManager ??
            globalThis.fabricate?.interactableManager;
          await manager?.onRegionExit?.(event, this?.behavior ?? this?.parent ?? this);
        } catch {
          // Defensive: a region-event handler must never throw into Foundry.
        }
      },
    };
  }

  return FabricateInteractableRegionBehavior;
}

/** Assign the model, icon and label into a `CONFIG`-shaped object. Idempotent; a fake tests it. */
export function assignInteractableBehaviorRegistration(
  config,
  Class,
  { icon = DEFAULT_ICON, label = DEFAULT_LABEL } = {}
) {
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
 * EDGE. Register during a live `init`, resolving from `deps` then `globalThis.foundry.data.*`.
 * Defensive, idempotent and import-safe: a missing dependency is a no-op returning null.
 */
export function registerInteractableRegionBehavior(config = globalThis.CONFIG, deps = {}) {
  const RegionBehaviorType =
    deps.RegionBehaviorType ?? globalThis.foundry?.data?.regionBehaviors?.RegionBehaviorType;
  const fields = deps.fields ?? globalThis.foundry?.data?.fields;

  if (typeof RegionBehaviorType !== 'function' || !fields || typeof fields !== 'object') {
    return null;
  }
  if (!config?.RegionBehavior?.dataModels || typeof config.RegionBehavior.dataModels !== 'object') {
    return null;
  }

  // Idempotent: an already-registered subtype returns its existing class without rebuilding.
  const existing = config.RegionBehavior.dataModels[INTERACTABLE_BEHAVIOR_SUBTYPE];
  if (existing) return existing;

  let Class;
  try {
    Class = createInteractableRegionBehaviorClass({ RegionBehaviorType, fields });
  } catch {
    return null;
  }
  return assignInteractableBehaviorRegistration(config, Class, {
    icon: deps.icon ?? DEFAULT_ICON,
    label: deps.label ?? DEFAULT_LABEL,
  });
}
