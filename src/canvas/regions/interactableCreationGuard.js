/**
 * Pure creation-guard decisions for the `fabricate.interactable` Region Behaviour.
 *
 * A Fabricate placement path pre-builds a complete `system` (real
 * `interactableType`, `sourceUuid`, `systemId`) before atomically creating the
 * region + behaviour. The native Region → Behaviors "+ Add Behavior → Fabricate
 * Interactable" path instead instantiates the DataModel with an empty `system`.
 * Since issue 342 the three identity fields carry unconfigured-sentinel `initial`s,
 * so the native path now produces a VALID-but-UNCONFIGURED behaviour (no
 * `DataModelValidationError`) which is allowed through and configured later from the
 * rich config panel — it is no longer cancelled. One footgun remains:
 *   - Region duplication clones an interactable behaviour's `linkedVisual` verbatim,
 *     so the copy points at the ORIGINAL's marker (two interactables sharing one
 *     marker). That link is neutralised at creation.
 *
 * This module holds the PURE decisions, so they are unit-testable without Foundry.
 * The thin, no-throw `preCreateRegionBehavior` Foundry edge that allows creation,
 * defensively stamps the unconfigured sentinel, and applies the neutralisation
 * patch lives in `src/main.js`.
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
 * Decide whether a `fabricate.interactable` Region Behaviour may be created.
 *
 * Since issue 342 a sourceless (native "+ Add Behavior") interactable is ALLOWED —
 * it is born unconfigured + inert and configured later. This guard therefore always
 * allows creation; the only creation-time mutation is the linked-visual
 * neutralisation in {@link neutralizeInheritedLinkedVisual}. Kept as a named seam so
 * the `preCreateRegionBehavior` edge + tests have a single decision point and a
 * future cancellation policy has a home.
 *
 * Tolerates both a live preCreate `RegionBehavior` document and a plain
 * `{ type, system }` shape. Never interferes with any non-interactable behaviour
 * subtype.
 *
 * @param {object} behaviorDocOrShape  A preCreate behaviour document or `{ type, system }`.
 * @returns {{ allow: true }}
 */
export function evaluateInteractableCreate(behaviorDocOrShape) {
  // Reference the arg so the (now unconditional) decision still documents that it
  // is type-aware and never throws on a malformed shape. The result is computed but
  // intentionally not branched on yet — kept as the single seam for a future
  // cancellation policy.
  isInteractableRegionBehavior(behaviorDocOrShape);
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

/**
 * Decide the defensive unconfigured-sentinel `updateSource` patch for a
 * native-path (`+ Add Behavior`) interactable's `system` (issue 342).
 *
 * Belt-and-suspenders for the case where Foundry's empty-`system` instantiation
 * does not apply the nested `initial` sentinels: only fields left empty are
 * stamped, so an already-configured (or partially-configured) interactable is
 * never clobbered. Returns `{ changed: false }` when the system is already a
 * fully-configured interactable or nothing needs stamping.
 *
 * PURE: returns the flat `updateSource` patch keyed by dotted source paths
 * (`system.sourceUuid` etc.), so the `main.js` edge stays a thin orchestrator.
 *
 * @param {object} system  The behaviour `system` data (raw or normalized view).
 * @returns {{ changed: false } | { changed: true, patch: Record<string, string> }}
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
