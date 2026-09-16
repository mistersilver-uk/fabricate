/**
 * PURE scene scan to display rows for the GM Manage Interactables panel (issue 335): name, type,
 * source label, state and marker status per `fabricate.interactable` behaviour.
 * Nothing here reads `game.*` or `canvas.*` — the source-label and visual-resolution lookups are
 * INJECTED, and the live iteration edge lives in the app shell.
 */

import {
  isInteractableRegionBehavior,
  readInteractableBehaviorSystem,
} from './interactableRegionFlags.js';
import { identifyRegionBehaviorRef } from './interactableRegionNodeAdapter.js';

/** The canonical marker-status tokens a row reports. */
export const MARKER_STATUS = Object.freeze({
  TILE: 'Tile',
  DRAWING: 'Drawing',
  TOKEN: 'Token',
  REGION_ONLY: 'region-only',
  MISSING: 'missing',
});

/** A Region's behaviours as a flat array, tolerating Foundry's Collection shapes and an array. */
function behaviorsOf(region) {
  const behaviors = region?.behaviors;
  if (Array.isArray(behaviors?.contents)) return behaviors.contents;
  if (typeof behaviors?.values === 'function') return [...behaviors.values()];
  if (Array.isArray(behaviors)) return behaviors;
  return [];
}

/** A Scene's regions as a flat array, on the same tolerance. */
function regionsOf(scene) {
  const regions = scene?.regions;
  if (Array.isArray(regions?.contents)) return regions.contents;
  if (typeof regions?.values === 'function') return [...regions.values()];
  if (Array.isArray(regions)) return regions;
  return [];
}

/**
 * PURE. A behaviour's marker status: 'region-only' when no marker is configured, the resolved
 * `documentName` when one exists, and 'missing' when a configured marker does not resolve.
 */
export function classifyMarkerStatus(system, resolved) {
  const linked = system?.linkedVisual ?? {};
  const hasConfiguredMarker =
    linked.mode === 'marker' && typeof linked.uuid === 'string' && linked.uuid.trim() !== '';
  if (!hasConfiguredMarker) return MARKER_STATUS.REGION_ONLY;
  if (resolved === true) {
    const documentName = linked.documentName;
    if (['Tile', 'Drawing', 'Token'].includes(documentName)) {
      return documentName;
    }
    // A resolved visual with an unknown documentName is still present; default to Tile rather
    // than reporting it missing.
    return MARKER_STATUS.TILE;
  }
  return MARKER_STATUS.MISSING;
}

/**
 * PURE. One display row, or null when the behaviour is not a usable `fabricate.interactable` or
 * has no resolvable ref. `resolveSourceLabel` and `resolveVisualResolved` are injected.
 */
export function buildInteractableRow(behavior, { resolveSourceLabel, resolveVisualResolved } = {}) {
  if (!isInteractableRegionBehavior(behavior)) return null;
  const system = readInteractableBehaviorSystem(behavior);
  if (!system) return null;
  const ref = identifyRegionBehaviorRef(behavior);
  if (!ref) return null;

  const resolved =
    typeof resolveVisualResolved === 'function'
      ? resolveVisualResolved({ system, behavior }) === true
      : false;
  const markerStatus = classifyMarkerStatus(system, resolved);

  const rawLabel =
    typeof resolveSourceLabel === 'function' ? resolveSourceLabel({ system, behavior }) : null;
  const sourceLabel = pickLabel(rawLabel, system);

  // Prefer the behaviour's own name, falling back to the source label so an unnamed interactable
  // is never a blank row.
  const name = system.name && system.name.trim() ? system.name.trim() : sourceLabel;

  return {
    ref,
    name,
    interactableType: system.interactableType,
    sourceLabel,
    state: {
      enabled: system.state.enabled === true,
      locked: system.state.locked === true,
      consumed: system.state.consumed === true,
    },
    markerStatus,
  };
}

/** The first non-empty of: the resolved label, the stored name, the bare source id, `sourceUuid`. */
function pickLabel(rawLabel, system) {
  const label = typeof rawLabel === 'string' ? rawLabel.trim() : '';
  if (label) return label;
  const stored = typeof system?.name === 'string' ? system.name.trim() : '';
  if (stored) return stored;
  const id =
    system?.interactableType === 'tool'
      ? system?.toolId
      : system?.interactableType === 'gatheringTask'
        ? system?.taskId
        : null;
  if (typeof id === 'string' && id.trim()) return id.trim();
  return typeof system?.sourceUuid === 'string' ? system.sourceUuid : '';
}

/** PURE. Every behaviour on the scene as a row, in scene-iteration order. */
export function scanSceneInteractables(scene, deps = {}) {
  const rows = [];
  for (const region of regionsOf(scene)) {
    for (const behavior of behaviorsOf(region)) {
      const row = buildInteractableRow(behavior, deps);
      if (row) rows.push(row);
    }
  }
  return rows;
}
