/**
 * Pure action/decision helpers for the rich GM Interactable config panel
 * (`InteractableConfigApp`) and the manager seams it drives.
 *
 * The config panel is a THIN view: every decision it needs — what a Restock
 * write looks like, the behaviour `state` patch for an enable/lock/consume
 * toggle, the patch to clear a visual link, the display view models for the node
 * + the whole interactable, and the GM Test-as-Player activation context — is
 * computed here as a PURE function returning plain data. The Foundry write (the
 * active-GM-routed `behavior.update`, the activation pipeline, the tile create /
 * delete, the camera pan) is a SEPARATE injected edge owned by the manager /
 * the app shell.
 *
 * Everything in this module is PURE: it takes plain data (a behaviour system or
 * a normalized view) and returns the intended mutation/decision. No `globalThis`
 * access; the node display arithmetic is delegated to the pure
 * `nodeRespawnMath` helpers so a fake `now` / `secondsPerUnit` makes the ETA
 * unit-testable without Foundry.
 */

import { isNodeDepleted, nextRespawnEta } from '../../systems/nodeRespawnMath.js';
import { normalizeNodeConfig } from '../../systems/gatheringNodeConfig.js';
import { readInteractableBehaviorSystem } from './interactableRegionFlags.js';
import { resolveLinkedVisual } from '../linkedVisuals/linkedInteractableVisual.js';

/**
 * Coerce a value to a finite number, or null.
 *
 * @param {*} value
 * @returns {number|null}
 */
function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/**
 * Read a behaviour system as a normalized view, tolerating BOTH a raw behaviour
 * `system` object and a live RegionBehavior document. Returns null when it is not
 * a `fabricate.interactable`.
 *
 * @param {object} systemOrBehavior
 * @returns {object|null}
 */
function asSystemView(systemOrBehavior) {
  if (!systemOrBehavior || typeof systemOrBehavior !== 'object') return null;
  // A live behaviour document / a `{ type, system }` shape → read through the
  // canonical reader. A raw system object (carrying `interactableType`) is used
  // as-is (it is already the normalized-ish shape).
  if (systemOrBehavior.interactableType && systemOrBehavior.state) return systemOrBehavior;
  const view = readInteractableBehaviorSystem(systemOrBehavior);
  if (view) return view;
  // A raw system passed without a `type` wrapper — accept it as-is when it looks
  // like an interactable system.
  return systemOrBehavior.interactableType ? systemOrBehavior : null;
}

/**
 * Plan a node RESTOCK: top the node back up to its `max`. PURE. Returns the
 * `{ system: { node } }` behaviour patch, or `null` when there is no node or the
 * node is already full (a no-op restock).
 *
 * @param {object} system  A behaviour system (raw or normalized view).
 * @returns {{ system: { node: object } } | null}
 */
export function planRestock(system) {
  const view = asSystemView(system);
  const node = normalizeNodeConfig(view?.node ?? null);
  if (!node) return null;
  const max = Number(node.max || 0);
  const current = Number(node.current || 0);
  if (!(max > 0)) return null;
  if (current >= max) return null; // already full — no-op.
  return { system: { node: { ...node, current: max } } };
}

/**
 * Plan a behaviour `state.enabled` patch. PURE: returns the minimal patch, or
 * null when the value already matches (no-op).
 *
 * @param {object} system
 * @param {boolean} enabled
 * @returns {{ system: { state: { enabled: boolean } } } | null}
 */
export function planSetEnabled(system, enabled) {
  return planStateFlag(system, 'enabled', enabled, true);
}

/**
 * Plan a behaviour `state.locked` patch. PURE: returns the minimal patch, or null
 * when the value already matches (no-op).
 *
 * @param {object} system
 * @param {boolean} locked
 * @returns {{ system: { state: { locked: boolean } } } | null}
 */
export function planSetLocked(system, locked) {
  return planStateFlag(system, 'locked', locked, false);
}

/**
 * Shared body for the boolean `state.*` planners. `defaultValue` is the schema
 * default used to read the current value so a same-value toggle is a clean no-op.
 *
 * @param {object} system
 * @param {'enabled'|'locked'} key
 * @param {boolean} next
 * @param {boolean} defaultValue
 * @returns {object|null}
 */
function planStateFlag(system, key, next, defaultValue) {
  const view = asSystemView(system);
  if (!view) return null;
  const target = next === true;
  const state = view.state && typeof view.state === 'object' ? view.state : {};
  const current = typeof state[key] === 'boolean' ? state[key] : defaultValue;
  if (current === target) return null; // no-op.
  return { system: { state: { [key]: target } } };
}

/**
 * Plan CLEARING the linked-visual link. PURE: returns the behaviour patch that
 * detaches the marker (uuid/documentName null, mode 'none'). Idempotent intent —
 * always returns the patch so the panel can re-clear after a manual fix.
 *
 * @param {object} _system  Accepted for symmetry; the clear patch is constant.
 * @returns {{ system: { linkedVisual: { uuid: null, documentName: null, mode: 'none' } } }}
 */
export function planClearVisualLink(_system) {
  return { system: { linkedVisual: { uuid: null, documentName: null, mode: 'none' } } };
}

/**
 * Summarize the node display state for the panel. PURE: reuses the shared
 * depletion definition (`isNodeDepleted`) + the respawn ETA math
 * (`nextRespawnEta`) with the injected `now` / `secondsPerUnit` seams.
 *
 * @param {object} system  A behaviour system (raw or normalized view).
 * @param {object} [ctx]
 * @param {number} [ctx.now]  Current world time (seconds).
 * @param {(unit: string) => number} [ctx.secondsPerUnit]  Calendar seam.
 * @returns {{ hasNode: boolean, current: number|null, max: number|null, depleted: boolean, respawnEta: ({ nextWorldTime: number, secondsUntil: number }|null) }}
 */
export function summarizeNodeState(system, { now = 0, secondsPerUnit = () => 3600 } = {}) {
  const view = asSystemView(system);
  const node = normalizeNodeConfig(view?.node ?? null);
  if (!node) {
    return { hasNode: false, current: null, max: null, depleted: false, respawnEta: null };
  }
  return {
    hasNode: true,
    current: numberOrNull(node.current) ?? 0,
    max: numberOrNull(node.max) ?? 0,
    depleted: isNodeDepleted(node),
    respawnEta: nextRespawnEta(node, secondsPerUnit, Number(now))
  };
}

/**
 * Build the panel's display view model for one interactable. PURE: reads the
 * behaviour system through the canonical reader and resolves a live linked-visual
 * status via the injected `resolveVisual` seam (defaults to the real
 * {@link resolveLinkedVisual}, which itself is a no-throw edge — pass a fake in
 * tests). Returns null when the behaviour is not a `fabricate.interactable`.
 *
 * @param {object} system  A behaviour system (raw or normalized view) or a behaviour doc.
 * @param {object} [opts]
 * @param {(system: object) => ({ doc: object, documentName: string }|null)} [opts.resolveVisual]
 *   Live linked-visual resolver. Injected so the view model's missing/ok status
 *   is unit-testable without Foundry.
 * @returns {object|null}
 */
export function summarizeInteractable(system, { resolveVisual = resolveLinkedVisual } = {}) {
  const view = asSystemView(system);
  if (!view) return null;

  const linked = view.linkedVisual && typeof view.linkedVisual === 'object' ? view.linkedVisual : {};
  const hasConfiguredVisual = linked.mode === 'marker' && typeof linked.uuid === 'string' && linked.uuid.trim() !== '';
  let visualStatus = 'none';
  if (hasConfiguredVisual) {
    const resolved = typeof resolveVisual === 'function' ? resolveVisual(view) : null;
    visualStatus = resolved ? 'ok' : 'missing';
  }

  const state = view.state && typeof view.state === 'object' ? view.state : {};

  return {
    interactableType: view.interactableType,
    name: view.name || '',
    systemId: view.systemId || '',
    // The id of the linked Tool (tool station) or Gathering Task, whichever applies.
    referenceId: view.interactableType === 'tool' ? (view.toolId ?? null) : (view.taskId ?? null),
    toolId: view.toolId ?? null,
    taskId: view.taskId ?? null,
    environmentId: view.environmentId ?? null,
    sourceUuid: view.sourceUuid || '',
    presentation: {
      promptText: view.presentation?.promptText ?? null,
      hidden: view.presentation?.hidden === true
    },
    linkedVisual: {
      uuid: linked.uuid ?? null,
      documentName: linked.documentName ?? null,
      mode: linked.mode ?? 'marker',
      missingPolicy: linked.missingPolicy ?? 'warn',
      status: visualStatus
    },
    activation: {
      trigger: view.activation?.trigger ?? 'regionEnter',
      audience: view.activation?.audience ?? 'players'
    },
    state: {
      enabled: state.enabled !== false,
      consumed: state.consumed === true,
      locked: state.locked === true,
      uses: {
        max: numberOrNull(state.uses?.max),
        used: numberOrNull(state.uses?.used) ?? 0
      },
      cooldown: {
        seconds: numberOrNull(state.cooldown?.seconds),
        lastUsedWorldTime: numberOrNull(state.cooldown?.lastUsedWorldTime)
      }
    }
  };
}
