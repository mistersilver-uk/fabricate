/**
 * Pure scene-scan → display rows for the GM Manage Interactables panel (issue 335).
 *
 * Enumerates every `fabricate.interactable` Region Behaviour on a scene into a
 * flat list of display rows, each carrying the resolvable behaviour ref plus the
 * fields the panel renders: name, type (tool / gathering task), source label,
 * state (enabled / locked / consumed), and marker status (Tile / Drawing / Token /
 * region-only / missing).
 *
 * PURE: it never reaches for `game.*` / `canvas.*`. The two non-trivial lookups —
 * resolving a source's human label, and resolving whether a behaviour's linked
 * visual currently EXISTS on the scene — are INJECTED so the scan is unit-testable
 * with plain fakes. The thin Foundry edge (iterating live `scene.regions` +
 * resolving the live visual via `resolveLinkedVisual`) lives in the app shell.
 *
 * Behaviour iteration tolerates the several collection shapes a Region's
 * `behaviors` can take across live Foundry (a Collection with `.contents` /
 * `.values()`) and plain test objects (an array).
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

/**
 * Coerce a Region's `behaviors` collection (or a plain array) to a flat array of
 * behaviour documents, tolerating the Collection shapes Foundry uses.
 *
 * @param {object} region
 * @returns {object[]}
 */
function behaviorsOf(region) {
  const behaviors = region?.behaviors;
  if (Array.isArray(behaviors?.contents)) return behaviors.contents;
  if (typeof behaviors?.values === 'function') return [...behaviors.values()];
  if (Array.isArray(behaviors)) return behaviors;
  return [];
}

/**
 * Coerce a Scene's `regions` collection (or a plain array) to a flat array of
 * region documents.
 *
 * @param {object} scene
 * @returns {object[]}
 */
function regionsOf(scene) {
  const regions = scene?.regions;
  if (Array.isArray(regions?.contents)) return regions.contents;
  if (typeof regions?.values === 'function') return [...regions.values()];
  if (Array.isArray(regions)) return regions;
  return [];
}

/**
 * Decide a behaviour's marker status from its normalized system + whether the
 * linked visual currently resolves. PURE.
 *
 *   - linkedVisual.mode !== 'marker' (or no uuid)  → 'region-only' (no marker by design).
 *   - configured marker that RESOLVES               → its documentName ('Tile'|'Drawing'|'Token').
 *   - configured marker that does NOT resolve        → 'missing'.
 *
 * @param {object} system   Normalized behaviour system ({@link readInteractableBehaviorSystem}).
 * @param {boolean} resolved  Whether the configured linked visual currently resolves.
 * @returns {string} One of {@link MARKER_STATUS}.
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
    // A resolved visual with an unknown documentName still counts as present;
    // default to Tile (the default marker kind) rather than reporting missing.
    return MARKER_STATUS.TILE;
  }
  return MARKER_STATUS.MISSING;
}

/**
 * Build a single display row for an interactable behaviour. PURE: takes the live
 * behaviour, its resolvable ref, and the two injected lookups. Returns null when
 * the behaviour is not a usable `fabricate.interactable` (no resolvable system) or
 * has no resolvable ref.
 *
 * @param {object} behavior
 * @param {object} deps
 * @param {(args: { system: object, behavior: object }) => string|null} [deps.resolveSourceLabel]
 *   Resolve the source's human label (tool / task name); null/empty falls back to
 *   the behaviour name then the source id.
 * @param {(args: { system: object, behavior: object }) => boolean} [deps.resolveVisualResolved]
 *   Whether the behaviour's configured linked visual currently exists on the scene.
 * @returns {object|null}
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

  // The display NAME prefers the behaviour's own name, falling back to the source
  // label so an unnamed interactable is never a blank row.
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

/**
 * Pick the best non-empty source label: the injected resolved label, else the
 * behaviour's stored name, else the bare source id (`toolId` / `taskId`), else the
 * raw `sourceUuid`.
 *
 * @param {string|null} rawLabel
 * @param {object} system
 * @returns {string}
 */
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

/**
 * Scan a scene for every `fabricate.interactable` behaviour and produce the
 * panel's display rows. PURE: iterates the scene's regions + behaviours (tolerant
 * of the live Collection + plain-array shapes) and delegates each row to
 * {@link buildInteractableRow}. Rows are returned in scene-iteration order.
 *
 * @param {object} scene  The scene document (or a plain `{ regions }` fake).
 * @param {object} deps   The injected source-label + visual-resolution lookups
 *   (see {@link buildInteractableRow}).
 * @returns {object[]} The display rows.
 */
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
