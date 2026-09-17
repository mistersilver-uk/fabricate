/**
 * Sheet registration and tile-discoverability decisions for the GM Interactable config panel,
 * kept pure so the live `DocumentSheetConfig.registerSheet` call and the HUD hook in `main.js`
 * stay thin.
 * The registered sheet is the CORE `RegionBehaviorConfig`, because the rich `InteractableConfigApp`
 * is not a DocumentSheet: registering it would leave `behavior.sheet` unresolvable and the edit
 * pencil dead, so the panel is reached from the Tile/Token HUD entry instead.
 */

import {
  INTERACTABLE_BEHAVIOR_SUBTYPE,
  readLinkedVisualRef,
  isInteractableVisual,
} from './interactableRegionFlags.js';

/**
 * Register the core sheet for the subtype, with the registrar and document class injected so a
 * fake records the call. Defensive, idempotent and no-throw: registration is tracked by a private
 * marker on the registrar, because Foundry's `registerSheet` overwrites happily but re-running
 * `makeDefault` re-shuffles every sibling sheet's default flag. V14 also throws on a non-sheet
 * class, so any throw is caught to stay robust across versions.
 */
export function assignInteractableConfigSheet({
  registrar,
  RegionBehavior,
  SheetClass,
  scope = 'fabricate',
  makeDefault = true,
} = {}) {
  if (typeof registrar?.registerSheet !== 'function') return false;
  if (typeof RegionBehavior !== 'function') return false;
  if (typeof SheetClass !== 'function') return false;

  // Idempotent guard: avoid redundant `makeDefault` re-shuffle on repeat calls.
  const marker = '_fabricateInteractableConfigSheetRegistered';
  if (registrar[marker] === true) return false;

  try {
    registrar.registerSheet(RegionBehavior, scope, SheetClass, {
      types: [INTERACTABLE_BEHAVIOR_SUBTYPE],
      makeDefault: makeDefault === true,
      label: 'FABRICATE.Canvas.Interactable.Config.SheetLabel',
    });
  } catch {
    // Defensive: a differing API shape, or a double-register race, must not throw into init.
    return false;
  }

  try {
    Object.defineProperty(registrar, marker, { value: true, configurable: true });
  } catch {
    registrar[marker] = true;
  }
  return true;
}

/**
 * PURE. The owning `{ sceneId, regionId, behaviorId }` behind a linked visual, read from its
 * reverse flag with the Region-uuid lookup injected. Null when the document is not a Fabricate
 * visual or its region or behaviour no longer resolves.
 */
export function resolveInteractableConfigTarget(doc, { resolveRegion } = {}) {
  const ref = readLinkedVisualRef(doc);
  if (!ref) return null;
  if (typeof resolveRegion !== 'function') return null;
  const region = resolveRegion(ref.regionUuid);
  if (!region || !region.sceneId || !region.regionId) return null;
  return {
    sceneId: String(region.sceneId),
    regionId: String(region.regionId),
    behaviorId: String(ref.behaviorId),
  };
}

/**
 * PURE. Show the "Configure Fabricate Interactable" entry for a Tile: GM-only, and only when the
 * tile carries a well-formed reverse flag.
 */
export function shouldOfferInteractableConfigEntry(doc, { isGM } = {}) {
  if (isGM !== true) return false;
  return isInteractableVisual(doc);
}

export { INTERACTABLE_BEHAVIOR_SUBTYPE } from './interactableRegionFlags.js';
