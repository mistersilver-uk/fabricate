/**
 * The pure activation pipeline: eligibility gate, socket request, active-GM re-check, grant shape
 * (`data-models/spec.md` § fabricate.interactable Region Behaviour, requirements 4 to 6).
 * Every Foundry collaborator is INJECTED — actor control, containment, source resolution, world
 * time, GM status — so the whole checklist is testable and nothing reads `globalThis`.
 */

import { numberOrNull } from './coercion.js';
import { isUnconfiguredInteractable } from './interactableRegionFlags.js';

const ACTIVATION_ACTION = 'interactableActivate';

/**
 * The FIRST blocking reason in precedence order, else `{ eligible: true, reason: null }`. Node
 * depletion is absent by design: the gathering engine enforces it when the session opens.
 */
export function evaluateActivationEligibility(system, { now, isGM } = {}) {
  void isGM;
  const state = system?.state && typeof system.state === 'object' ? system.state : {};

  if (state.enabled === false) return blocked('DISABLED');
  if (state.locked === true) return blocked('LOCKED');
  if (state.consumed === true) return blocked('CONSUMED');

  const uses = state.uses && typeof state.uses === 'object' ? state.uses : {};
  const usesMax = numberOrNull(uses.max);
  const usesUsed = numberOrNull(uses.used) ?? 0;
  if (usesMax != null && usesUsed >= usesMax) return blocked('USES_EXHAUSTED');

  const cooldown = state.cooldown && typeof state.cooldown === 'object' ? state.cooldown : {};
  const cdSeconds = numberOrNull(cooldown.seconds);
  const cdLast = numberOrNull(cooldown.lastUsedWorldTime);
  const nowNumber = numberOrNull(now);
  if (cdSeconds != null && cdLast != null && nowNumber != null && nowNumber < cdLast + cdSeconds) {
    return blocked('COOLDOWN');
  }

  return { eligible: true, reason: null };
}

function blocked(reason) {
  return { eligible: false, reason };
}

/**
 * PURE. Gated by VISIBILITY, not eligibility: a locked, consumed, exhausted or cooling-down
 * interactable still prompts and is denied at Interact, which is what gives Lock teeth.
 */
export function shouldPromptOnEnter(system) {
  return !isConcealed(system);
}

/** PURE. Hide the marker exactly when the interactable is concealed; a LOCKED one stays visible. */
export function resolveMarkerHidden(system) {
  return isConcealed(system);
}

/**
 * Concealed: UNCONFIGURED (issue 342), DISABLED, or HIDDEN. Shared by {@link shouldPromptOnEnter}
 * and {@link resolveMarkerHidden} so the two cannot drift.
 */
function isConcealed(system) {
  if (isUnconfiguredInteractable(system)) return true;
  return system?.state?.enabled === false || system?.presentation?.hidden === true;
}

/** PURE. The socket payload emitted when a player presses Interact. */
export function buildActivationRequest(
  system,
  { regionId, behaviorId, sceneId, actorId, userId, activationSource, ts } = {}
) {
  return {
    action: ACTIVATION_ACTION,
    sceneId,
    regionId,
    behaviorId,
    sourceUuid: system?.sourceUuid ?? null,
    interactableType: system?.interactableType ?? null,
    systemId: system?.systemId ?? null,
    toolId: system?.toolId ?? null,
    taskId: system?.taskId ?? null,
    environmentId: system?.environmentId ?? null,
    actorId,
    userId,
    activationSource,
    ts,
  };
}

/**
 * PURE. The active-GM re-check, returning the FIRST failing reason: behaviour present and
 * type-matched, eligibility, actor control, containment, source, and a gatheringTask's environment.
 */
export function validateActivationRequest(
  request,
  { behaviorSystem, now, isGM, canControlActor, sourceExists, environmentExists, tokenInside } = {}
) {
  if (!behaviorSystem || typeof behaviorSystem !== 'object') return fail('NO_BEHAVIOR');
  // An UNCONFIGURED interactable is inert and must never throw. Denied FIRST with its own reason,
  // and ahead of TYPE_MISMATCH — the sentinel's default type may not match a stale request.
  if (isUnconfiguredInteractable(behaviorSystem)) return fail('UNCONFIGURED');
  if (request?.interactableType !== behaviorSystem.interactableType) return fail('TYPE_MISMATCH');

  const eligibility = evaluateActivationEligibility(behaviorSystem, { now, isGM });
  if (!eligibility.eligible) return fail(eligibility.reason);

  if (!(canControlActor === true || isGM === true)) return fail('CANNOT_CONTROL_ACTOR');
  if (tokenInside === false) return fail('TOKEN_NOT_INSIDE');
  if (sourceExists === false) return fail('SOURCE_MISSING');
  if (behaviorSystem.interactableType === 'gatheringTask' && environmentExists === false) {
    return fail('ENVIRONMENT_MISSING');
  }

  return { ok: true, reason: null };
}

function fail(reason) {
  return { ok: false, reason };
}

/** PURE. A denial reason to its `Denied.*` key; an unknown one falls back, never silence. */
export function activationDenialMessageKey(reason) {
  const key = DENIAL_MESSAGE_KEYS[reason];
  return key ?? DENIAL_MESSAGE_KEYS.__default;
}

const DENIAL_PREFIX = 'FABRICATE.Canvas.Interactable.Denied';

/** `NO_BEHAVIOR` and `TYPE_MISMATCH` are internal mismatches and resolve to `__default`. */
const DENIAL_MESSAGE_KEYS = {
  DISABLED: `${DENIAL_PREFIX}.Disabled`,
  LOCKED: `${DENIAL_PREFIX}.Locked`,
  CONSUMED: `${DENIAL_PREFIX}.Consumed`,
  USES_EXHAUSTED: `${DENIAL_PREFIX}.UsesExhausted`,
  COOLDOWN: `${DENIAL_PREFIX}.Cooldown`,
  CANNOT_CONTROL_ACTOR: `${DENIAL_PREFIX}.CannotControl`,
  TOKEN_NOT_INSIDE: `${DENIAL_PREFIX}.NotInside`,
  SOURCE_MISSING: `${DENIAL_PREFIX}.SourceMissing`,
  UNCONFIGURED: `${DENIAL_PREFIX}.Unconfigured`,
  ENVIRONMENT_MISSING: `${DENIAL_PREFIX}.EnvironmentMissing`,
  __default: `${DENIAL_PREFIX}.Generic`,
};

/**
 * PURE. A tool station is a virtual-present crafting tool, so it opens Crafting with a null
 * `activeCanvasTool` for the manager to fill; a gatheringTask opens Gathering scoped to its pair.
 */
export function describeGrant(system) {
  if (system?.interactableType === 'tool') {
    return { tab: 'crafting', context: { activeCanvasTool: null } };
  }
  if (system?.interactableType === 'gatheringTask') {
    return {
      tab: 'gathering',
      context: {
        environmentId: system.environmentId ?? null,
        taskId: system.taskId ?? null,
      },
    };
  }
  return null;
}
