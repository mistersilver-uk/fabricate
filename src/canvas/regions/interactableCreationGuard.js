/**
 * PURE creation-guard decisions for the `fabricate.interactable` behaviour
 * (`data-models/spec.md` § fabricate.interactable Region Behaviour, requirement 5).
 * Native "+ Add Behavior" creation is ALLOWED and born unconfigured; the one creation-time
 * mutation is neutralising an INHERITED `linkedVisual`, since Foundry's region duplication clones
 * it verbatim and would leave two interactables sharing one marker.
 * The no-throw `preCreateRegionBehavior` edge that applies these lives in `src/main.js`.
 */

import {
  isInteractableRegionBehavior,
  isUnconfiguredInteractable,
  coerceString,
  UNCONFIGURED_SOURCE_UUID,
  UNCONFIGURED_SYSTEM_ID,
} from './interactableRegionFlags.js';

/** Default `interactableType` stamped onto an unconfigured native-path interactable. */
const UNCONFIGURED_INTERACTABLE_TYPE = 'tool';

/**
 * Always allows creation (issue 342). Kept as a named seam so the edge and its tests have one
 * decision point and a future cancellation policy has a home. Tolerates a live preCreate document
 * or a plain `{ type, system }`, and never touches another behaviour subtype.
 */
export function evaluateInteractableCreate(behaviorDocOrShape) {
  // Computed but deliberately not branched on: the seam stays type-aware and throw-free.
  isInteractableRegionBehavior(behaviorDocOrShape);
  return { allow: true };
}

/**
 * PURE. Clear an INHERITED `linkedVisual.uuid`/`documentName` so a duplicated interactable is
 * born region-only, leaving `mode` and `missingPolicy` intact.
 * `{ changed: false }` when there is nothing to neutralise.
 */
export function neutralizeInheritedLinkedVisual(system) {
  const linkedVisual =
    system?.linkedVisual && typeof system.linkedVisual === 'object' ? system.linkedVisual : {};
  const uuid = coerceString(linkedVisual.uuid);
  if (!uuid) {
    return { changed: false };
  }

  return {
    changed: true,
    patch: {
      linkedVisual: {
        uuid: null,
        documentName: null,
      },
    },
  };
}

/**
 * PURE. The defensive sentinel `updateSource` patch, keyed by dotted source paths, for the case
 * where Foundry's empty-`system` instantiation does not apply the nested `initial`s (issue 342).
 * Only empty fields are stamped, so a configured or partly-configured interactable is never
 * clobbered.
 */
export function buildUnconfiguredSentinelPatch(system) {
  if (!isUnconfiguredInteractable(system)) {
    return { changed: false };
  }

  const patch = {};
  if (!coerceString(system?.sourceUuid)) {
    patch['system.sourceUuid'] = UNCONFIGURED_SOURCE_UUID;
  }
  if (!coerceString(system?.systemId)) {
    patch['system.systemId'] = UNCONFIGURED_SYSTEM_ID;
  }
  if (!coerceString(system?.interactableType)) {
    patch['system.interactableType'] = UNCONFIGURED_INTERACTABLE_TYPE;
  }

  if (Object.keys(patch).length === 0) {
    return { changed: false };
  }

  return { changed: true, patch };
}
