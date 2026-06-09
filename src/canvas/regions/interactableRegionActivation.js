/**
 * Pure activation pipeline for `fabricate.interactable` Region Behaviours.
 *
 * The activation pipeline has one shared path (see plan — Activation pipeline):
 *   1. evaluateActivationEligibility  — state-based gate (run on the player's
 *      client to decide whether to show the prompt).
 *   2. buildActivationRequest         — the socket payload emitted on "Interact".
 *   3. validateActivationRequest      — the active-GM re-check before granting.
 *   4. describeGrant                  — which tab + context shape the granted
 *      player client should open.
 *
 * Everything here is PURE: all Foundry collaborators (whether the user controls
 * the actor, whether the token is still inside, whether the source/environment
 * still resolves, the current world time, GM status) are INJECTED, so the full
 * checklist is unit-testable without Foundry. No `globalThis` access.
 *
 * Activation eligibility is purely the behaviour's own
 * `enabled/locked/consumed/uses/cooldown` gate (shared by tool stations and
 * gathering-task shortcuts). A gathering-task interactable carries NO
 * per-interactable node pool: node depletion/respawn is owned by the
 * environment's `nodeRuntime[taskId]` and is enforced by the gathering engine
 * when the scoped session is opened, not here.
 */

const ACTIVATION_ACTION = 'interactableActivate';

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/**
 * Evaluate whether an interactable is currently eligible for activation from its
 * behaviour `system` state. Returns the FIRST blocking reason in precedence
 * order, or `{ eligible: true, reason: null }`.
 *
 * Precedence: DISABLED → LOCKED → CONSUMED → USES_EXHAUSTED → COOLDOWN.
 *
 * A gathering-task interactable carries NO per-interactable node pool — node
 * depletion/respawn is owned by the environment's `nodeRuntime[taskId]`, checked
 * by the gathering engine when the session is opened — so there is no
 * NODE_DEPLETED gate here.
 *
 * `isGM` is accepted for future use but eligibility is purely state-based here
 * (authority/override checks live in `validateActivationRequest`).
 *
 * @param {object} system  A behaviour system (or normalized view from readInteractableBehaviorSystem).
 * @param {object} ctx
 * @param {number} ctx.now      Current world time (seconds).
 * @param {boolean} [ctx.isGM]  Reserved; eligibility is state-based.
 * @returns {{ eligible: boolean, reason: string|null }}
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
 * Decide whether the on-enter prompt should fire for an interactable, based on
 * its VISIBILITY (not its full activation eligibility). PURE.
 *
 * An interactable is concealed from players — and therefore raises NO prompt —
 * when it is DISABLED (`state.enabled === false`) OR explicitly HIDDEN
 * (`presentation.hidden === true`). In every other case the prompt fires: a
 * LOCKED / consumed / uses-exhausted / cooling-down interactable still SHOWS the
 * prompt, and the Interact-time validation (`validateActivationRequest`) is what
 * denies the actual activation with the specific reason.
 *
 * This is deliberately distinct from {@link evaluateActivationEligibility}: the
 * prompt is gated by visibility, the ACTIVATION is gated by eligibility. That is
 * what gives Lock real teeth (prompt + "This is locked." denial) separate from
 * Disable (no prompt + concealed marker).
 *
 * @param {object} system  A behaviour system (raw or normalized view).
 * @returns {boolean}
 */
export function shouldPromptOnEnter(system) {
  return !isConcealed(system);
}

/**
 * Decide whether the linked marker tile should be HIDDEN from players. PURE.
 *
 * The marker is hidden (Foundry `tile.hidden = true`, so only the GM sees it)
 * exactly when the interactable is concealed — DISABLED (`state.enabled === false`)
 * OR explicitly HIDDEN (`presentation.hidden === true`). A LOCKED interactable is
 * NOT hidden: it stays visible to players (the prompt fires and Interact is denied).
 *
 * @param {object} system  A behaviour system (raw or normalized view).
 * @returns {boolean}
 */
export function resolveMarkerHidden(system) {
  return isConcealed(system);
}

/**
 * Whether an interactable is concealed from players: DISABLED or explicitly
 * HIDDEN. Shared by {@link shouldPromptOnEnter} (no prompt) and
 * {@link resolveMarkerHidden} (hidden marker) so the two decisions can never drift.
 *
 * @param {object} system
 * @returns {boolean}
 */
function isConcealed(system) {
  return system?.state?.enabled === false || system?.presentation?.hidden === true;
}

/**
 * Build the activation request payload emitted over the module socket when a
 * player presses "Interact". PURE; no Foundry. The shape matches the plan exactly.
 *
 * @param {object} system  The behaviour system (carries the source identity).
 * @param {object} ctx
 * @param {string} ctx.regionId
 * @param {string} ctx.behaviorId
 * @param {string} ctx.sceneId
 * @param {string} ctx.actorId
 * @param {string} ctx.userId
 * @param {string} ctx.activationSource   e.g. 'regionEnter' | 'gmTest'.
 * @param {number} ctx.ts                 Timestamp (ms).
 * @returns {object}
 */
export function buildActivationRequest(system, {
  regionId,
  behaviorId,
  sceneId,
  actorId,
  userId,
  activationSource,
  ts
} = {}) {
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
    ts
  };
}

/**
 * Validate an activation request on the active GM before granting. PURE: all
 * collaborators are injected booleans/values. Returns the FIRST failing reason,
 * or `{ ok: true, reason: null }`.
 *
 * Checklist (per plan):
 *   - behaviourSystem present + interactableType matches the request;
 *   - state eligibility re-check via evaluateActivationEligibility;
 *   - canControlActor === true (or isGM);
 *   - tokenInside !== false;
 *   - sourceExists !== false;
 *   - for gatheringTask, environmentExists !== false.
 *
 * @param {object} request
 * @param {object} ctx
 * @param {object|null} ctx.behaviorSystem
 * @param {number} ctx.now
 * @param {boolean} [ctx.isGM]
 * @param {boolean} [ctx.canControlActor]
 * @param {boolean} [ctx.sourceExists]
 * @param {boolean} [ctx.environmentExists]
 * @param {boolean} [ctx.tokenInside]
 * @returns {{ ok: boolean, reason: string|null }}
 */
export function validateActivationRequest(request, {
  behaviorSystem,
  now,
  isGM,
  canControlActor,
  sourceExists,
  environmentExists,
  tokenInside
} = {}) {
  if (!behaviorSystem || typeof behaviorSystem !== 'object') return fail('NO_BEHAVIOR');
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

/**
 * Map an activation denial `reason` (as returned by {@link validateActivationRequest}
 * or {@link evaluateActivationEligibility}) to a player-facing localization key under
 * `FABRICATE.Canvas.Interactable.Denied.*`. PURE — no Foundry, no localization here
 * (the caller resolves the key). Any unknown/blank reason falls back to the generic
 * key so a denied request is never silent.
 *
 * @param {string|null|undefined} reason
 * @returns {string} A `FABRICATE.Canvas.Interactable.Denied.*` key.
 */
export function activationDenialMessageKey(reason) {
  const key = DENIAL_MESSAGE_KEYS[reason];
  return key ?? DENIAL_MESSAGE_KEYS.__default;
}

const DENIAL_PREFIX = 'FABRICATE.Canvas.Interactable.Denied';

/**
 * Every reason {@link validateActivationRequest}/{@link evaluateActivationEligibility}
 * can return → a non-default key. `__default` is the generic fallback for any
 * unmapped/blank reason (NO_BEHAVIOR + TYPE_MISMATCH are internal mismatches with
 * no dedicated player copy, so they intentionally resolve to the generic key).
 */
const DENIAL_MESSAGE_KEYS = {
  DISABLED: `${DENIAL_PREFIX}.Disabled`,
  LOCKED: `${DENIAL_PREFIX}.Locked`,
  CONSUMED: `${DENIAL_PREFIX}.Consumed`,
  USES_EXHAUSTED: `${DENIAL_PREFIX}.UsesExhausted`,
  COOLDOWN: `${DENIAL_PREFIX}.Cooldown`,
  CANNOT_CONTROL_ACTOR: `${DENIAL_PREFIX}.CannotControl`,
  TOKEN_NOT_INSIDE: `${DENIAL_PREFIX}.NotInside`,
  SOURCE_MISSING: `${DENIAL_PREFIX}.SourceMissing`,
  ENVIRONMENT_MISSING: `${DENIAL_PREFIX}.EnvironmentMissing`,
  __default: `${DENIAL_PREFIX}.Generic`
};

/**
 * Describe WHICH tab + context shape the granted player client should open. PURE.
 * The manager fills in the live `activeCanvasTool` (built by `buildActiveCanvasTool`)
 * — this only encodes the shape.
 *
 * A Tool station belongs to CRAFTING (the active station tool is a virtual-present
 * crafting tool), so it opens the Crafting tab. The Crafting tab is still a
 * placeholder, so this shows the placeholder with the active-tool chip in the
 * header until the Crafting route lands.
 *
 *   tool          → { tab:'crafting', context:{ activeCanvasTool:null } }
 *   gatheringTask → { tab:'gathering', context:{ environmentId, taskId } }
 *
 * @param {object} system  The behaviour system (normalized view or raw).
 * @returns {{ tab: string, context: object } | null}
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
        taskId: system.taskId ?? null
      }
    };
  }
  return null;
}
