/**
 * PURE scene scan to display rows for the GM Manage Interactables panel (issue 335): name, type,
 * source label, state and marker status per `fabricate.interactable` behaviour.
 * `sourceLabel` is the resolved label or `''`; a configured row that resolves nothing is
 * `sourceResolved: false` with its `sourceId`, and an unconfigured one is `sourceConfigured: false`.
 * Nothing here reads `game.*` or `canvas.*` — the source-label and visual-resolution lookups are
 * INJECTED, and the live iteration edge lives in the app shell.
 */

import {
  isInteractableRegionBehavior,
  isUnconfiguredInteractable,
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
  const sourceLabel = typeof rawLabel === 'string' ? rawLabel.trim() : '';
  const sourceConfigured = !isUnconfiguredInteractable(system);
  const sourceId = sourceConfigured ? referenceIdOf(system) : '';

  // The behaviour's own name, else the resolved label, else the id; an unconfigured interactable
  // has none of them, and the view titles it.
  const storedName = typeof system.name === 'string' ? system.name.trim() : '';
  const name = storedName || sourceLabel || sourceId;

  return {
    ref,
    name,
    interactableType: system.interactableType,
    sourceLabel,
    // A real Tool with a blank name and no linked component resolves no label, so it reads Unresolved.
    sourceResolved: sourceLabel !== '',
    sourceConfigured,
    sourceId,
    state: {
      enabled: system.state.enabled === true,
      locked: system.state.locked === true,
      consumed: system.state.consumed === true,
    },
    markerStatus,
  };
}

/** The type-appropriate Tool or Task id of a configured interactable, trimmed. */
function referenceIdOf(system) {
  const id = system.interactableType === 'tool' ? system.toolId : system.taskId;
  return typeof id === 'string' ? id.trim() : '';
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
