/**
 * PURE decisions behind the GM Interactable config panel, a thin view: every patch, view model
 * and activation context it needs is plain data here, written by an injected active-GM edge.
 * Task-node link semantics: `data-models/spec.md` § Gathering-Task Node State (issue 302).
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

/** A normalized view of a raw `system`, a `{ type, system }` or a live RegionBehavior; else null. */
function asSystemView(systemOrBehavior) {
  if (!systemOrBehavior || typeof systemOrBehavior !== 'object') return null;
  if (systemOrBehavior.interactableType && systemOrBehavior.state) return systemOrBehavior;
  const view = readInteractableBehaviorSystem(systemOrBehavior);
  if (view) return view;
  // A raw system passed without a `type` wrapper is already the normalized-ish shape.
  return systemOrBehavior.interactableType ? systemOrBehavior : null;
}

/** The minimal `state.enabled` patch, or null when the value already matches. */
export function planSetEnabled(system, enabled) {
  return planStateFlag(system, 'enabled', enabled, true);
}

/** The minimal `state.locked` patch, or null when the value already matches. */
export function planSetLocked(system, locked) {
  return planStateFlag(system, 'locked', locked, false);
}

/** Shared body for the boolean `state.*` planners; `defaultValue` makes a same-value toggle a no-op. */
function planStateFlag(system, key, next, defaultValue) {
  const view = asSystemView(system);
  if (!view) return null;
  const target = next === true;
  const state = view.state && typeof view.state === 'object' ? view.state : {};
  const current = typeof state[key] === 'boolean' ? state[key] : defaultValue;
  if (current === target) return null; // no-op.
  return { system: { state: { [key]: target } } };
}

/** The detach patch (uuid and documentName null, mode 'none'), always returned so re-clear works. */
export function planClearVisualLink(_system) {
  return { system: { linkedVisual: { uuid: null, documentName: null, mode: 'none' } } };
}

/**
 * The panel's view model for one interactable, or null when it is not a `fabricate.interactable`.
 * `resolveVisual` is injected so the missing/ok status is testable without Foundry.
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

  // Only an unlinked node surfaces a summary; the linked default reports a null node (issue 302).
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
    // The single authority for "needs configuration"; the panel conceals and inerts while true.
    unconfigured: isUnconfiguredInteractable(view),
    name: view.name || '',
    taskNodeLink,
    node: nodeSummary,
    systemId: view.systemId || '',
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
 * PURE. The link toggle: 'unlinked' seeds a fresh independent node (preserving an existing one),
 * 'linked' clears it. Null for a non-gatheringTask, an unknown value, or a no-op (issue 302).
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

  // Keep the existing independent node if present, else a default single-use pool the GM edits.
  const existing = normalizeNodeConfig(view.node);
  const node =
    existing ??
    normalizeNodeConfig({ enabled: true, max: 1, current: 1, depletionTiming: 'onStart' });
  return { system: { taskNodeLink: 'unlinked', node } };
}

/**
 * PURE. A GM restock, mirroring the environment contract: a `nonRegenerating` pool cannot be
 * restocked, otherwise set `max` and clamp `current` into `[0, max]`; else null.
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

/** Local string coercion, so this module need not re-export from the flags module. */
function trimmedString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * PURE. The identity patch from a GM selection (issue 342). NEVER writes a PARTIAL identity —
 * null unless complete for its type — and clears the off-type id so a re-target leaves nothing stale.
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
        // Clear the off-type id so a re-target leaves nothing stale.
        taskId: null,
        environmentId: null,
      },
    };
  }

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
      // Clear the off-type id so a re-target leaves nothing stale.
      toolId: null,
    },
  };
}
