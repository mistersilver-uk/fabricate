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
 * access.
 *
 * A gathering-task interactable is either LINKED to the gathering task or
 * UNLINKED (independent), selected by `taskNodeLink`. When
 * `taskNodeLink === 'unlinked'` the behaviour carries its own `node` object
 * (independent capacity / depletion / respawn); when 'linked' (the default)
 * depletion/respawn follow the task (owned by the environment's
 * `nodeRuntime[taskId]`) and the behaviour carries no node state. The link toggle
 * + independent-pool restock planners live here.
 */

import { normalizeNodeConfig } from '../../systems/gatheringNodeConfig.js';
import { buildInteractableSourceUuid } from '../interactableResolution.js';
import { resolveLinkedVisual } from '../linkedVisuals/linkedInteractableVisual.js';

import { numberOrNull } from './coercion.js';
import {
  readInteractableBehaviorSystem,
  isUnconfiguredInteractable,
  INTERACTABLE_TYPES,
} from './interactableRegionFlags.js';

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

  const linked =
    view.linkedVisual && typeof view.linkedVisual === 'object' ? view.linkedVisual : {};
  const hasConfiguredVisual =
    linked.mode === 'marker' && typeof linked.uuid === 'string' && linked.uuid.trim() !== '';
  let visualStatus = 'none';
  if (hasConfiguredVisual) {
    const resolved = typeof resolveVisual === 'function' ? resolveVisual(view) : null;
    visualStatus = resolved ? 'ok' : 'missing';
  }

  const state = view.state && typeof view.state === 'object' ? view.state : {};

  // Task-node link + independent-pool summary (issue 302). Only an unlinked node
  // (`taskNodeLink === 'unlinked'` with a real `node`) surfaces a node summary;
  // the linked default reports `taskNodeLink: 'linked'` and a null node.
  const scopedNode =
    view.interactableType === 'gatheringTask' && view.taskNodeLink === 'unlinked' && view.node
      ? normalizeNodeConfig(view.node)
      : null;
  const taskNodeLink = scopedNode ? 'unlinked' : 'linked';
  const nodeSummary = scopedNode
    ? {
        max: Number(scopedNode.max || 0),
        current: Number(scopedNode.current || 0),
        depleted: Number(scopedNode.current || 0) <= 0,
        // A depleted nonRegenerating pool is exhausted for good.
        permanentlyExhausted:
          Number(scopedNode.current || 0) <= 0 && scopedNode.respawn?.policy === 'nonRegenerating',
        // Authoring fields the GM config panel edits inline.
        depletionTiming: scopedNode.depletionTiming,
        respawn: { policy: scopedNode.respawn?.policy ?? 'manual' },
      }
    : null;

  return {
    interactableType: view.interactableType,
    // Whether the interactable still needs its identity/source configured (issue
    // 342). The single authority; the panel renders a "Needs configuration" state
    // and conceals/inerts the interactable while true.
    unconfigured: isUnconfiguredInteractable(view),
    name: view.name || '',
    taskNodeLink,
    node: nodeSummary,
    systemId: view.systemId || '',
    // The id of the linked Tool (tool station) or Gathering Task, whichever applies.
    referenceId: view.interactableType === 'tool' ? (view.toolId ?? null) : (view.taskId ?? null),
    toolId: view.toolId ?? null,
    taskId: view.taskId ?? null,
    environmentId: view.environmentId ?? null,
    sourceUuid: view.sourceUuid || '',
    presentation: {
      promptText: view.presentation?.promptText ?? null,
      hidden: view.presentation?.hidden === true,
    },
    linkedVisual: {
      uuid: linked.uuid ?? null,
      documentName: linked.documentName ?? null,
      mode: linked.mode ?? 'marker',
      missingPolicy: linked.missingPolicy ?? 'warn',
      status: visualStatus,
    },
    activation: {
      trigger: view.activation?.trigger ?? 'regionEnter',
      audience: view.activation?.audience ?? 'players',
    },
    state: {
      enabled: state.enabled !== false,
      consumed: state.consumed === true,
      locked: state.locked === true,
      uses: {
        max: numberOrNull(state.uses?.max),
        used: numberOrNull(state.uses?.used) ?? 0,
      },
      cooldown: {
        seconds: numberOrNull(state.cooldown?.seconds),
        lastUsedWorldTime: numberOrNull(state.cooldown?.lastUsedWorldTime),
      },
    },
  };
}

/**
 * Plan a task-node link toggle for a gatheringTask interactable (issue 302). PURE.
 *
 * Switching to `'unlinked'` seeds a fresh independent node (preserving any existing
 * independent node) so the behaviour owns its own pool; switching to `'linked'`
 * clears the independent node (depletion/respawn returns to following the task's
 * environment runtime). Returns null for a non-gatheringTask, an unknown link
 * value, or a no-op toggle.
 *
 * @param {object} system  A behaviour system (raw or normalized view) or a behaviour doc.
 * @param {'linked'|'unlinked'} link
 * @returns {{ system: { taskNodeLink: string, node: object|null } } | null}
 */
export function planSetTaskNodeLink(system, link) {
  const view = asSystemView(system);
  if (!view || view.interactableType !== 'gatheringTask') return null;
  if (link !== 'linked' && link !== 'unlinked') return null;

  const currentLink = view.taskNodeLink === 'unlinked' && view.node ? 'unlinked' : 'linked';
  if (currentLink === link) return null; // no-op.

  if (link === 'linked') {
    return { system: { taskNodeLink: 'linked', node: null } };
  }

  // Seed an independent node: keep the existing one if present, else a sensible
  // default single-use pool the GM can then edit through the shared node controls.
  const existing = normalizeNodeConfig(view.node);
  const node =
    existing ??
    normalizeNodeConfig({ enabled: true, max: 1, current: 1, depletionTiming: 'onStart' });
  return { system: { taskNodeLink: 'unlinked', node } };
}

/**
 * Plan a GM restock of a scoped node pool (issue 302). PURE. Mirrors the
 * environment restock contract: a `nonRegenerating` pool is permanently
 * depletable and cannot be restocked (no-op → null). Otherwise sets the pool's
 * `max` (when provided) and clamps `current` into `[0, max]`. Returns null when
 * there is no scoped node to restock or the values do not change it.
 *
 * @param {object} system  A behaviour system (raw or normalized view) or a behaviour doc.
 * @param {{ current?: number, max?: number }} [values]
 * @returns {{ system: { node: object } } | null}
 */
export function planRestockScopedNode(system, { current, max } = {}) {
  const view = asSystemView(system);
  if (!view || view.interactableType !== 'gatheringTask') return null;
  const node = normalizeNodeConfig(view.node);
  if (!node) return null;
  // A nonRegenerating pool is exhausted-for-good and cannot be topped up.
  if (node.respawn?.policy === 'nonRegenerating') return null;

  const nextMax =
    max === null || max === undefined
      ? Number(node.max || 0)
      : Math.max(0, Math.floor(Number(max) || 0));
  const requestedCurrent =
    current === null || current === undefined
      ? Number(node.current || 0)
      : Math.floor(Number(current) || 0);
  const nextCurrent = Math.min(nextMax, Math.max(0, requestedCurrent));
  if (nextMax === Number(node.max || 0) && nextCurrent === Number(node.current || 0)) {
    return null; // no-op.
  }
  return { system: { node: { ...node, max: nextMax, current: nextCurrent } } };
}

/** Local string-coercion mirror (avoids re-exporting from the flags module here). */
function trimmedString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Plan the IDENTITY / SOURCE patch that configures a (typically unconfigured)
 * interactable from a GM selection in the config panel (issue 342). PURE: builds
 * the canonical `sourceUuid` via {@link buildInteractableSourceUuid} and the
 * type-scoped ids, and returns the minimal behaviour patch. The actual write is the
 * panel's existing GM-routed `updateBehavior` seam.
 *
 * SAFETY: this NEVER writes a PARTIAL identity. It returns null (a no-op) unless the
 * selection is complete for its type:
 *   - tool          → `{ interactableType, systemId, toolId }`;
 *   - gatheringTask → `{ interactableType, systemId, taskId }` (+ optional
 *                      `environmentId`).
 * The off-type id is cleared to null so a re-target never leaves a stale id behind.
 *
 * @param {object} _system  The current behaviour system (accepted for symmetry; the
 *   patch is derived entirely from the selection, so a re-target is deterministic).
 * @param {object} selection
 * @param {'tool'|'gatheringTask'} selection.interactableType
 * @param {string} selection.systemId
 * @param {string} [selection.toolId]         Required for a tool.
 * @param {string} [selection.taskId]         Required for a gatheringTask.
 * @param {string} [selection.environmentId]  Optional (gatheringTask only).
 * @returns {{ system: object } | null}  The behaviour patch, or null for an
 *   incomplete/invalid selection (no-op).
 */
export function planConfigureSource(_system, selection = {}) {
  const interactableType = selection?.interactableType;
  if (!INTERACTABLE_TYPES.includes(interactableType)) return null;

  const systemId = trimmedString(selection.systemId);
  if (!systemId) return null;

  if (interactableType === 'tool') {
    const toolId = trimmedString(selection.toolId);
    if (!toolId) return null; // never write a partial identity.
    return {
      system: {
        interactableType: 'tool',
        systemId,
        sourceUuid: buildInteractableSourceUuid({
          interactableType: 'tool',
          systemId,
          referenceId: toolId,
        }),
        toolId,
        // Clear the off-type id so a re-target from a gatheringTask leaves nothing stale.
        taskId: null,
        environmentId: null,
      },
    };
  }

  // gatheringTask
  const taskId = trimmedString(selection.taskId);
  if (!taskId) return null; // never write a partial identity.
  const environmentId = trimmedString(selection.environmentId) || null;
  return {
    system: {
      interactableType: 'gatheringTask',
      systemId,
      sourceUuid: buildInteractableSourceUuid({
        interactableType: 'gatheringTask',
        systemId,
        referenceId: taskId,
      }),
      taskId,
      environmentId,
      // Clear the off-type id so a re-target from a tool leaves nothing stale.
      toolId: null,
    },
  };
}
