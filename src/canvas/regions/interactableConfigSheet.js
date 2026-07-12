/**
 * Config-sheet registration + tile discoverability seams for the rich GM
 * Interactable config panel (`InteractableConfigApp`).
 *
 * Two pure decisions live here so the live-Foundry edges stay thin + testable:
 *  - {@link assignInteractableConfigSheet}: register the document sheet for the
 *    `fabricate.interactable` RegionBehavior subtype, mutating/calling a fake
 *    registrar. The registered `SheetClass` is the CORE
 *    `foundry.applications.sheets.RegionBehaviorConfig` (a real DocumentSheet) so
 *    `behavior.sheet` resolves and the edit pencil opens — our rich
 *    `InteractableConfigApp` is NOT a DocumentSheet and stays reachable via the
 *    Tile/Token HUD entry + scene-control opener instead. Defensive (no-throw when
 *    the API shape differs) + idempotent.
 *  - {@link resolveInteractableConfigTarget}: from a linked Tile (or Drawing /
 *    Token) document, resolve the owning behaviour's `{ sceneId, regionId,
 *    behaviorId }` so a Tile HUD / context-menu entry can open the panel against
 *    it. Pure — the document-graph walk is via injected resolvers.
 *
 * The actual `DocumentSheetConfig.registerSheet(...)` call + the HUD/context-menu
 * hook are the thin Foundry edges (wired in main.js); they delegate to these.
 */

import {
  INTERACTABLE_BEHAVIOR_SUBTYPE,
  readLinkedVisualRef,
  isInteractableVisual,
} from './interactableRegionFlags.js';

/**
 * Register the Interactable config panel as the sheet for the
 * `fabricate.interactable` RegionBehavior subtype. PURE-ish: the Foundry
 * registrar (`DocumentSheetConfig`) + the `RegionBehavior` document class are
 * INJECTED, so a fake records the call. Defensive + idempotent + no-throw.
 *
 * Tracks registration on the registrar via a private marker so a repeat call is a
 * clean no-op (V13 throws if the same sheet is registered twice).
 *
 * @param {object} deps
 * @param {object} deps.registrar  A `DocumentSheetConfig`-shaped object exposing
 *   `registerSheet(documentClass, scope, sheetClass, options)`.
 * @param {Function} deps.RegionBehavior  The `RegionBehavior` document class.
 * @param {Function} deps.SheetClass  The document-sheet class to register (the
 *   CORE `RegionBehaviorConfig`).
 * @param {string} [deps.scope]  Registration scope (defaults to 'fabricate').
 * @param {boolean} [deps.makeDefault]  Whether the sheet is the default (defaults to true).
 * @returns {boolean} Whether a registration was performed (false when skipped/no-op).
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

  // Idempotent guard: a second register would throw in V13.
  const marker = '_fabricateInteractableConfigSheetRegistered';
  if (registrar[marker] === true) return false;

  try {
    registrar.registerSheet(RegionBehavior, scope, SheetClass, {
      types: [INTERACTABLE_BEHAVIOR_SUBTYPE],
      makeDefault: makeDefault === true,
      label: 'FABRICATE.Canvas.Interactable.Config.SheetLabel',
    });
  } catch {
    // Defensive: a differing API shape (or a double-register race) must not throw
    // into init.
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
 * Resolve the owning interactable behaviour target `{ sceneId, regionId,
 * behaviorId }` from a linked visual document (Tile / Drawing / Token). PURE: the
 * reverse linked-visual ref is read off the document's flags
 * ({@link readLinkedVisualRef}); the Region uuid → scene + region id resolution is
 * via the injected `resolveRegion` seam (so it is testable without Foundry).
 *
 * Returns null when the document is not a Fabricate interactable visual, or when
 * the linked region/behaviour can no longer be resolved.
 *
 * @param {object} doc  The linked Tile/Drawing/Token document (carries `flags.fabricate`).
 * @param {object} deps
 * @param {(regionUuid: string) => ({ sceneId: string, regionId: string }|null)} deps.resolveRegion
 *   Resolve a Region uuid to its scene + region id (the Foundry edge).
 * @returns {{ sceneId: string, regionId: string, behaviorId: string } | null}
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
 * Decide whether to add the "Configure Fabricate Interactable" discoverability
 * entry for a Tile. PURE: GM-only AND the tile must be a Fabricate interactable
 * visual ({@link readLinkedVisualRef}). The HUD/context-menu edge calls this to
 * gate the entry.
 *
 * @param {object} doc  The Tile document.
 * @param {object} [ctx]
 * @param {boolean} [ctx.isGM]
 * @returns {boolean}
 */
export function shouldOfferInteractableConfigEntry(doc, { isGM } = {}) {
  if (isGM !== true) return false;
  return isInteractableVisual(doc);
}

export { INTERACTABLE_BEHAVIOR_SUBTYPE } from './interactableRegionFlags.js';
