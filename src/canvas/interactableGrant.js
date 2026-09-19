/**
 * Request routing, the active-GM validation re-check, the grant payload and the denial route.
 * Every collaborator is injected as a call-time function, so nothing reads a Foundry global and a
 * manager method a test replaces still intercepts.
 */

import { buildActiveCanvasTool } from './interactableResolution.js';
import {
  INTERACTABLE_ACTIVATION_DENIED,
  INTERACTABLE_ACTIVATION_GRANTED,
} from './interactableSocket.js';
import {
  activationDenialMessageKey,
  buildActivationRequest,
  describeGrant,
  validateActivationRequest,
} from './regions/interactableRegionActivation.js';
import { readInteractableBehaviorSystem } from './regions/interactableRegionFlags.js';
import { identifyRegionBehaviorRef } from './regions/interactableRegionNodeAdapter.js';

/** Grant locally (active GM) or emit for the active GM; with none connected, warn and abort. */
export function requestActivation(behavior, ctx = {}, deps) {
  const system = readInteractableBehaviorSystem(behavior);
  const ref = identifyRegionBehaviorRef(behavior);
  if (!system || !ref) return;

  const request = buildActivationRequest(system, {
    regionId: ref.regionId,
    behaviorId: ref.behaviorId,
    sceneId: ref.sceneId,
    actorId: ctx.actorId ?? null,
    userId: ctx.userId ?? deps.currentUserId(),
    activationSource: ctx.activationSource ?? 'regionEnter',
    ts: deps.now(),
  });

  if (deps.isActiveGM()) {
    void deps.validateAndGrant(request);
    return;
  }
  if (!deps.hasActiveGM()) {
    deps.notifyWarn(
      deps.localize('FABRICATE.Canvas.Interactable.NoActiveGM') ??
        'A GM must be online to gather here.'
    );
    return;
  }
  deps.emit(request);
}

/** Active-GM body for `interactableActivate`: validate the request, and on a pass grant. No-throw. */
export async function validateAndGrant(request, deps) {
  if (!request || typeof request !== 'object') return false;
  const behavior = deps.resolveBehavior(request);
  const system = readInteractableBehaviorSystem(behavior);
  if (!system) {
    // No behaviour system resolved (a deleted region). Tell the requester why, generically.
    routeActivationDenied(request.userId, null, deps);
    return false;
  }

  const validation = validateActivationRequest(request, {
    behaviorSystem: system,
    now: deps.worldTime(),
    // The REQUESTING user's override status, so a non-owning player cannot bypass actor control.
    isGM: deps.getUser(request.userId)?.isGM === true,
    canControlActor: deps.canControlActor(request.userId, request.actorId),
    sourceExists: deps.sourceExists(system),
    environmentExists:
      system.interactableType === 'gatheringTask'
        ? deps.environmentExists(system.environmentId)
        : true,
    tokenInside: deps.tokenInside(behavior, request.actorId, request.userId),
  });
  if (!validation.ok) {
    // Tell the requesting user WHY (localized) instead of failing silently.
    routeActivationDenied(request.userId, validation.reason, deps);
    return false;
  }

  const { payload, reason } = buildGrantPayload({
    request,
    system,
    resolutionDeps: deps.resolutionDeps,
  });
  if (reason) {
    routeActivationDenied(request.userId, reason, deps);
    return false;
  }
  if (!payload) return false;

  // When the GM IS the requester, open here: a socket emit never reaches its own emitter.
  if (deps.currentUserId() === (request.userId ?? null)) deps.openGrant(payload);
  else deps.emit(payload);
  return true;
}

/**
 * The `interactableActivationGranted` payload, or a denial `reason` when a tool station's live
 * `activeCanvasTool` no longer resolves — refusing silently there hid the issue-1119 defect.
 */
export function buildGrantPayload({ request, system, resolutionDeps }) {
  const grant = describeGrant(system);
  if (!grant) return { payload: null, reason: null };

  if (system.interactableType === 'tool') {
    const activeCanvasTool = buildActiveCanvasTool({
      systemId: system.systemId,
      toolId: system.toolId,
      tool: resolutionDeps().getTool({ systemId: system.systemId, toolId: system.toolId }),
    });
    if (!activeCanvasTool) return { payload: null, reason: 'SOURCE_MISSING' };
    grant.context = { ...grant.context, activeCanvasTool };
  }

  return {
    payload: {
      action: INTERACTABLE_ACTIVATION_GRANTED,
      userId: request.userId,
      behaviorId: request.behaviorId,
      requestId: request.ts ? String(request.ts) : null,
      grant: {
        tab: grant.tab,
        context: grant.context,
        ref: {
          sceneId: request.sceneId,
          regionId: request.regionId,
          behaviorId: request.behaviorId,
        },
        interactableType: system.interactableType,
        environmentId: system.environmentId ?? null,
        taskId: system.taskId ?? null,
        // The default selected actor in the granted session; ownership-validated above.
        actorId: request.actorId ?? null,
      },
    },
    reason: null,
  };
}

/**
 * Local-user body for `interactableActivationGranted`: Crafting for a tool, Gathering scoped to
 * `{ environmentId, taskId }` for a task, with `grant.ref` threaded through as `interactableRef`
 * so an UNLINKED task decrements its own pool rather than the environment's (issue 302).
 */
export function openGrant(payload, deps) {
  const grant = payload?.grant;
  if (!grant || typeof grant !== 'object') return;
  const AppClass = deps.getAppClass();
  if (!AppClass?.show) return;

  const actorId = grant.actorId ?? null;

  if (grant.interactableType === 'tool') {
    const activeCanvasTool = grant.context?.activeCanvasTool ?? null;
    if (!activeCanvasTool) return;
    // The station tool goes in virtual-present, so prerequisites pass without the actor owning it.
    void AppClass.show('crafting', { activeCanvasTool, actorId });
    return;
  }

  if (grant.interactableType !== 'gatheringTask') return;
  const environmentId = grant.environmentId ?? grant.context?.environmentId ?? null;
  const taskId = grant.taskId ?? grant.context?.taskId ?? null;
  if (!environmentId || !taskId) return;
  const gatheringOptions = {
    environmentId,
    taskId,
    actorId,
    // Always passed: the engine falls back to environment scope when the behaviour is gone (302).
    interactableRef: grant.ref && typeof grant.ref === 'object' ? refOf(grant.ref) : null,
    // On close, re-raise the prompt iff the token is still inside, so a close is recoverable (332).
    onClose: () => deps.onGrantClose({ ref: grant.ref, actorId }),
  };
  Promise.resolve(AppClass.show('gathering', gatheringOptions)).catch(() => {});
}

function refOf(ref) {
  return {
    sceneId: ref.sceneId ?? null,
    regionId: ref.regionId ?? null,
    behaviorId: ref.behaviorId ?? null,
  };
}

/** Route a DENIAL as grants are routed: notify here when the GM is the requester, else emit. */
export function routeActivationDenied(userId, reason, deps) {
  if (deps.currentUserId() === (userId ?? null)) {
    deps.notifyWarn(denialMessage(reason, deps));
    return;
  }
  deps.emit({
    action: INTERACTABLE_ACTIVATION_DENIED,
    userId: userId ?? null,
    reason: reason ?? null,
  });
}

/** The localized warning for a denial reason; an unknown one still gets the generic message. */
export function denialMessage(reason, { localize } = {}) {
  const key = activationDenialMessageKey(reason);
  return localize?.(key) ?? key;
}
