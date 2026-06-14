/**
 * Pure creation-guard decisions for the `fabricate.interactable` Region Behaviour.
 *
 * A persisted interactable is always fully formed: `interactableType`,
 * `sourceUuid`, and `systemId` are required with no `initial`, so every Fabricate
 * placement path pre-builds a complete `system` before atomically creating the
 * region + behaviour. Two NATIVE Foundry flows bypass that and produce broken
 * data:
 *   1. The native Region → Behaviors "+ Add Behavior → Fabricate Interactable"
 *      instantiates the DataModel with empty `system`, so the three required
 *      fields are `undefined` → `DataModelValidationError` + a cascading
 *      `reading 'sheet'` TypeError.
 *   2. Region duplication clones an interactable behaviour's `linkedVisual`
 *      verbatim, so the copy points at the ORIGINAL's marker (two interactables
 *      sharing one marker).
 *
 * This module holds the PURE decisions for both, so they are unit-testable
 * without Foundry. The thin, no-throw `preCreateRegionBehavior` Foundry edge that
 * cancels creation / applies the neutralisation patch lives in `src/main.js`.
 */

import { isInteractableRegionBehavior, coerceString } from './interactableRegionFlags.js';

/**
 * Decide whether a `fabricate.interactable` Region Behaviour may be created.
 *
 * Tolerates both a live preCreate `RegionBehavior` document and a plain
 * `{ type, system }` shape. Never interferes with any non-interactable behaviour
 * subtype (returns `{ allow: true }`).
 *
 * @param {object} behaviorDocOrShape  A preCreate behaviour document or `{ type, system }`.
 * @returns {{ allow: true } | { allow: false, reason: 'no-source' }}
 */
export function evaluateInteractableCreate(behaviorDocOrShape) {
  // Never interfere with other behaviour subtypes.
  if (!isInteractableRegionBehavior(behaviorDocOrShape)) {
    return { allow: true };
  }

  const system =
    behaviorDocOrShape?.system && typeof behaviorDocOrShape.system === 'object'
      ? behaviorDocOrShape.system
      : {};

  // A persisted interactable is always fully formed; the only signal we need to
  // distinguish a real Fabricate placement (which pre-builds a complete system)
  // from the native empty-system "+ Add Behavior" path is a resolvable source.
  const sourceUuid = coerceString(system.sourceUuid);
  if (!sourceUuid) {
    return { allow: false, reason: 'no-source' };
  }

  return { allow: true };
}

/**
 * Decide whether a created `fabricate.interactable` behaviour carries a
 * linked-visual link it should not own (the region-duplication case), and produce
 * the patch that neutralises it.
 *
 * Product rule: a freshly-created interactable never inherits another
 * interactable's marker link. When the created behaviour carries a non-empty
 * `linkedVisual.uuid`, clear `linkedVisual.uuid`/`documentName` to null so the
 * copy is born region-only — leaving `mode`/`missingPolicy` intact.
 *
 * PURE: returns `{ changed: false }` when there is nothing to neutralise, or
 * `{ changed: true, patch }` with the minimal source patch to apply.
 *
 * @param {object} system  The behaviour `system` data.
 * @returns {{ changed: false } | { changed: true, patch: { linkedVisual: { uuid: null, documentName: null } } }}
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
