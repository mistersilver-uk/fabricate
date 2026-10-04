import { settleCardRolls } from './checkCardRolls.js';
import { settlePromptedCheck } from './journalCheckPrompt.js';
import {
  evaluatePreparedJournalCheck,
  withPreparedAdditionalDiceOffer,
  withSpentAdditionalDice,
} from './journalPreparedCheck.js';
import { cardOffer, executedCheckFor, withEntitledFacts } from './journalRollFacts.js';
import {
  authorizeAwardChoice,
  awardChoiceDismissalRefusal,
  validAwardChoicePayload,
} from './journalRunAwardChoice.js';
import { serializedOperationResult, terminalRun } from './journalRunReply.js';
import { decisionAdditionalDice, preparedDecisionPolicy } from './preparedDecisionPolicy.js';
import { applyGuardedRunMutation } from './runLifecycleState.js';

/** Request/reply discriminators multiplexed on the existing module socket. */
export const JOURNAL_RUN_SOCKET_KIND = Object.freeze({
  REQUEST: 'fabricate.journalRun.request',
  REPLY: 'fabricate.journalRun.reply',
});

/**
 * How long a caller waits for its authority reply before treating the outcome as unknown.
 * Exported because `JOURNAL_RUN_CLAIM_LIVE_WINDOW_MS` is derived from it and
 * `tests/journal-run-authority.test.js` pins the two together.
 */
export const JOURNAL_RUN_COMMAND_TIMEOUT_MS = 15_000;
const DISMISSAL_LIMIT = 500;
const MUTATING_ACTIONS = new Set([
  'start',
  'beginStep',
  'execute',
  'pause',
  'resume',
  'setCompletionMode',
  'setSelection',
  'cancel',
  'chooseAward',
]);

function failure(reason, extra = {}) {
  return { success: false, reason, ...extra };
}

function currentRevision(run) {
  const value = Number(run?.runRevision);
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function validText(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function validRequest(request) {
  if (!validText(request?.requestId) || !validText(request?.sessionId)) return false;
  if (!validText(request?.actorUuid) || !validText(request?.runType)) return false;
  if (!MUTATING_ACTIONS.has(request?.action) && request?.action !== 'releaseCheck') return false;
  if (request.action !== 'start' && !validText(request?.runId)) return false;
  if (request.action === 'chooseAward' && !validAwardChoicePayload(request.payload)) return false;
  return Number.isInteger(request?.expectedRevision) && request.expectedRevision >= 0;
}

function replyMatches(pending, payload) {
  return (
    pending.actorUuid === payload.actorUuid &&
    pending.runType === payload.runType &&
    pending.runId === payload.runId &&
    pending.expectedRevision === payload.expectedRevision
  );
}

/**
 * The JSON tuple key hiding one native run per user and world, never deleting actor history;
 * alchemy uses its native `crafting` run type.
 */
export function journalRunDismissalKey({ actorUuid, runType, runId }) {
  return JSON.stringify([String(actorUuid ?? ''), String(runType ?? ''), String(runId ?? '')]);
}

/**
 * Keep valid identity/timestamp entries, bounded to the 500 most recently hidden runs, as a new
 * map for the replacing user-setting write.
 */
export function normalizeJournalRunDismissals(value) {
  const entries = Object.entries(value && typeof value === 'object' ? value : {})
    .filter(([key, hiddenAt]) => {
      if (!validText(key) || !Number.isFinite(Number(hiddenAt))) return false;
      try {
        const tuple = JSON.parse(key);
        return Array.isArray(tuple) && tuple.length === 3 && tuple.every(validText);
      } catch {
        return false;
      }
    })
    .sort((left, right) => Number(right[1]) - Number(left[1]))
    .slice(0, DISMISSAL_LIMIT);
  return Object.fromEntries(entries);
}

function operationUnavailable() {
  return failure('unsupported-operation');
}

/**
 * The refusal every Fabricate edge answers when the journal-run command service is absent, minted
 * here so the reason-drift guard can see it.
 */
export function authorityUnavailableRefusal() {
  return failure('authority-unavailable');
}

/** The same absence in the shape `getJournalRunAuthorityAvailability` answers. */
export function authorityUnavailableAvailability() {
  return { available: false, reason: 'authority-unavailable' };
}

/**
 * Build the one grant-consuming mutation path the Journal's manager operations share.
 * `mutate` is the caller's own manager call, so the crafting and gathering facades keep their
 * different run managers while the grant check, guarded apply and refusal wording live once.
 * @param {Function} consumeGrant `(grant, context) => trustedContext|null`.
 * @returns {Function} `async (args, operation, mutate) => result`.
 */
export function createManagerMutation(consumeGrant) {
  return async (args, operation, mutate) => {
    const trusted = consumeGrant(args.executionGrant, {
      operation,
      actor: args.actor,
      runId: args.runId,
      expectedRevision: args.expectedRevision,
      requestId: args.requestId,
    });
    if (!trusted) return failure('execution-grant-invalid');
    const outcome = await applyGuardedRunMutation(mutate);
    if (outcome.refused) return failure('lifecycle-refused', { message: outcome.refused.message });
    return outcome.run ? { success: true, run: outcome.run } : failure('run-not-found');
  };
}

function actorUuidList(actors, fallbackUuids = []) {
  const resolved = Array.isArray(actors)
    ? actors.map((actor) => actor?.uuid).filter(validText)
    : [];
  if (resolved.length > 0) return resolved;
  return Array.isArray(fallbackUuids) ? fallbackUuids.filter(validText) : [];
}

function installEngineAuthority(engine, authority) {
  if (typeof engine?.installVersionedRunAuthority !== 'function') {
    throw new TypeError('The versioned run engine authority adapter is unavailable');
  }
  engine.installVersionedRunAuthority(authority);
  return engine;
}

/**
 * Preserve one-call execution when the stage is ready and all choices are supplied. New starts
 * select version 1 and use the installed active-GM boundary for start and execution; a waiting
 * stage or incomplete choices return the run for later Journal execution without spending
 * editable materials, and existing unstamped runs keep legacy behaviour. `actor` and
 * `sourceActors` are resolved documents, never ids. `options.interactive` is `true` from the
 * crafting UI, which opens the roll dialog for a required check, and absent or `false` (the public
 * API's default) settles it on the engine's own defaults.
 */
export async function executePublicCraft({
  engine,
  runManager,
  actor,
  sourceActors,
  recipe,
  ingredientSetId = null,
  options = {},
  executeCommand = null,
  resolveUuid = null,
} = {}) {
  if (typeof engine?.craft !== 'function') return operationUnavailable();
  const requestedRunId = validText(options?.runId) ? options.runId : null;
  const existingRun = requestedRunId
    ? await runManager?.getActiveRun?.(actor, requestedRunId)
    : null;
  const routedOptions = { ...options };
  if (existingRun && !Object.hasOwn(existingRun, 'lifecycleVersion')) {
    delete routedOptions.lifecycleVersion;
  } else {
    routedOptions.lifecycleVersion = 1;
  }
  const started = await engine.craft(actor, sourceActors, recipe, ingredientSetId, routedOptions);
  if (
    started?.success !== true ||
    started.requiresExecution !== true ||
    started.canExecuteImmediately !== true ||
    !validText(started.runId)
  ) {
    return started;
  }
  if (typeof executeCommand !== 'function') {
    return {
      ...started,
      success: false,
      authorityUnavailable: true,
      reason: 'execute-command-unavailable',
    };
  }
  const settled = await executeCommand(
    {
      actorUuid: actor?.uuid,
      runType: 'crafting',
      runId: started.runId,
      expectedRevision: started.runRevision,
      action: 'execute',
      payload: {
        selectionPlan: {
          selectedIngredientSetId: ingredientSetId,
          ingredientOptionOverrides: options?.ingredientOptionOverrides,
          ingredientEssenceAllocation: options?.ingredientEssenceAllocation,
        },
        trigger: 'manual',
        sourceActorUuids: actorUuidList(sourceActors),
      },
    },
    // The caller's flag, never a constant (issue 1780): the crafting UI passes `true` and expects
    // the roll dialog, while a macro omits it and `craftRecipe` defaults it to the non-interactive
    // route issue 1683 added, so the API never waits on a prompt nobody answers.
    { interactive: options?.interactive === true, ...decisionAdditionalDice(options) }
  );
  if (!Array.isArray(settled?.createdResultUuids) || typeof resolveUuid !== 'function') {
    return settled;
  }
  const results = await Promise.all(
    settled.createdResultUuids.map(async (uuid) => {
      try {
        return await resolveUuid(uuid);
      } catch {
        return null;
      }
    })
  );
  return { ...settled, results: results.filter(Boolean) };
}

/**
 * Preserve one-call completion for the public gathering API, as `executePublicCraft` does for
 * crafting: since issue 1648 `startGatheringAttempt` selects the versioned lifecycle, so without
 * this a ready public attempt reported `accepted: true` and awarded nothing. Keyed on
 * `canExecuteImmediately`, the field the command layer's normaliser forwards (it drops the
 * engine's `state: 'ready'`); a waiting or timed attempt is left as it was, since it matures at
 * GM-gated world time. The execution outcome is applied OVER the start result, so an accepted
 * attempt that failed to execute still reads `accepted`. `interactive` is the caller's flag, as
 * in `executePublicCraft`.
 */
export async function executePublicGather({
  requestStart,
  actor,
  executeCommand = null,
  interactive = false,
  additionalDice = 0,
} = {}) {
  if (typeof requestStart !== 'function') return operationUnavailable();
  const started = await requestStart();
  if (started?.accepted !== true) return started;
  if (started.requiresExecution !== true || started.canExecuteImmediately !== true) return started;
  const runId = validText(started.runId) ? started.runId : null;
  if (!runId) return started;
  if (typeof executeCommand !== 'function') {
    return {
      ...started,
      success: false,
      authorityUnavailable: true,
      reason: 'execute-command-unavailable',
    };
  }
  const settled = await executeCommand(
    {
      actorUuid: actor?.uuid,
      runType: 'gathering',
      runId,
      // `runRevision`, not `run.runRevision`: the normalised start lifts the revision to the top
      // level and drops the run document, and an undefined `expectedRevision` is refused as
      // `invalid-command`.
      expectedRevision: started.runRevision,
      action: 'execute',
      payload: { trigger: 'manual' },
    },
    // The caller's flag, for the reason `executePublicCraft` gives (issue 1780): the gathering
    // screen passes `interactive: true` and expects its roll dialog.
    { interactive: interactive === true, ...decisionAdditionalDice({ additionalDice }) }
  );
  return { ...started, ...settled };
}

/**
 * Compose both persisted run managers into the authority's exclusive reconstruction boundary.
 * The returned function requires exactly one scope: a nonempty `operationId` or `orphaned: true`.
 * It reconstructs evidence and never performs spending, awards or rollback.
 */
export function createJournalExecutionReconstructor({
  getCraftingRunManager,
  getGatheringRunManager,
} = {}) {
  return async ({ operationId = null, orphaned = false } = {}) => {
    const operationScoped = validText(operationId);
    const orphanScoped = orphaned === true;
    if (operationScoped === orphanScoped) return failure('invalid-reconstruction-scope');
    const managers = [getCraftingRunManager?.(), getGatheringRunManager?.()];
    if (managers.some((manager) => typeof manager?.reconstructVersionedExecutions !== 'function')) {
      return failure('reconstruction-unavailable');
    }
    const scope = { operationId: operationScoped ? operationId : null, orphaned: orphanScoped };
    const results = [];
    for (const manager of managers) {
      const result = await manager.reconstructVersionedExecutions(scope);
      if (result?.success !== true) return failure('reconstruction-failed');
      results.push(result);
    }
    return { success: true, results };
  };
}

/**
 * Install crafting start, execute and cancel requests through the command service.
 * Resolved Actor inputs become UUID targets, whose sender ownership is checked by the authority.
 * @param {{engine: object, service: object}} options
 * @returns {object} The supplied engine with its versioned authority adapter installed.
 */
export function installCraftingJournalRunAuthority({ engine, service } = {}) {
  if (typeof service?.executeJournalRunCommand !== 'function') {
    throw new TypeError('The journal run command service is unavailable');
  }
  return installEngineAuthority(engine, {
    requestStart: ({
      activityKind = 'crafting',
      actor,
      sourceActors,
      recipeId,
      selectionPlan,
      completionMode,
      craftingSystemId,
      submittedItems,
    }) =>
      service.executeJournalRunCommand({
        actorUuid: actor?.uuid,
        runType: 'crafting',
        runId: '',
        expectedRevision: 0,
        action: 'start',
        payload: {
          activityKind,
          recipeId,
          selectionPlan,
          completionMode,
          craftingSystemId,
          submittedItems: Array.isArray(submittedItems)
            ? submittedItems.map((record) => ({
                itemUuid: record?.itemUuid ?? record?.item?.uuid ?? null,
                componentId: record?.componentId ?? null,
              }))
            : [],
          sourceActorUuids: actorUuidList(sourceActors),
        },
      }),
    requestExecute: ({
      actor,
      componentSourceActors,
      componentSourceActorUuids,
      runId,
      expectedRevision,
      selectionPlan,
      trigger = 'manual',
    }) =>
      service.executeJournalRunCommand({
        actorUuid: actor?.uuid,
        runType: 'crafting',
        runId,
        expectedRevision,
        action: 'execute',
        payload: {
          selectionPlan,
          trigger,
          sourceActorUuids: actorUuidList(componentSourceActors, componentSourceActorUuids),
        },
      }),
    requestCancel: ({
      actor,
      componentSourceActors,
      componentSourceActorUuids,
      runId,
      expectedRevision,
    }) =>
      service.executeJournalRunCommand({
        actorUuid: actor?.uuid,
        runType: 'crafting',
        runId,
        expectedRevision,
        action: 'cancel',
        payload: {
          sourceActorUuids: actorUuidList(componentSourceActors, componentSourceActorUuids),
        },
      }),
    consumeExecutionGrant: (grant, context) => service.consumeExecutionGrant(grant, context),
  });
}

/**
 * Install gathering start, execute and cancel requests through the command service.
 * @param {{engine: object, service: object, evaluatePreparedRunCheck: Function}} options
 * @returns {object} The supplied engine with authority and prepared-check evaluation installed.
 */
export function installGatheringJournalRunAuthority({
  engine,
  service,
  evaluatePreparedRunCheck,
} = {}) {
  if (
    typeof service?.executeJournalRunCommand !== 'function' ||
    typeof evaluatePreparedRunCheck !== 'function'
  ) {
    throw new TypeError('The gathering journal authority collaborators are unavailable');
  }
  return installEngineAuthority(engine, {
    requestStart: ({
      actor,
      rememberedActorId,
      environmentId,
      taskId,
      presentTools,
      interactableRef,
      completionMode = 'manual',
    }) =>
      service.executeJournalRunCommand({
        actorUuid: actor?.uuid,
        runType: 'gathering',
        runId: '',
        expectedRevision: 0,
        action: 'start',
        payload: {
          rememberedActorId,
          environmentId,
          taskId,
          presentTools,
          interactableRef,
          completionMode,
        },
      }),
    requestExecute: ({ actor, runId, expectedRevision, trigger = 'manual' }) =>
      service.executeJournalRunCommand({
        actorUuid: actor?.uuid,
        runType: 'gathering',
        runId,
        expectedRevision,
        action: 'execute',
        payload: { trigger },
      }),
    requestCancel: ({ actor, runId, expectedRevision }) =>
      service.executeJournalRunCommand({
        actorUuid: actor?.uuid,
        runType: 'gathering',
        runId,
        expectedRevision,
        action: 'cancel',
        payload: {},
      }),
    consumeExecutionGrant: (grant, context) => service.consumeExecutionGrant(grant, context),
    evaluatePreparedRunCheck,
  });
}

/**
 * Build gathering operations for use inside the authenticated authority claim.
 * Start resolves the initiating user by sender ID, rather than recording the executing GM.
 * Every mutation consumes its matching execution grant before calling the engine or manager.
 * @param {object} [options] Engine/getEngine, runManager, getService and getUser collaborators.
 * @returns {object} Native gathering lookup, start, check, execute, cancel and waiting-run operations.
 */
export function createGatheringJournalRunOperations({
  engine,
  getEngine,
  runManager,
  getService,
  getUser,
} = {}) {
  const currentEngine = () => getEngine?.() ?? engine ?? null;
  const mutateUnderGrant = createManagerMutation(
    (grant, context) => getService?.()?.consumeExecutionGrant?.(grant, context) ?? null
  );
  const managerMutation = async (args, operation, method, values = []) => {
    if (typeof runManager?.[method] !== 'function') return operationUnavailable();
    return mutateUnderGrant(args, operation, () =>
      runManager[method](args.actor, args.runId, ...values, {
        expectedRevision: args.expectedRevision,
      })
    );
  };
  return {
    getRun: ({ actor, runId }) => {
      runManager?.invalidateCache?.(actor?.id);
      return runManager?.getRun?.(actor, runId) ?? runManager?.getActiveRun?.(actor, runId) ?? null;
    },
    start: ({ actor, payload, executionGrant, requestId, senderId }) => {
      const runtime = currentEngine();
      if (typeof runtime?.startVersionedRun !== 'function') return operationUnavailable();
      return runtime.startVersionedRun({
        viewer: getUser?.(senderId) ?? null,
        actor,
        rememberedActorId: payload.rememberedActorId,
        environmentId: payload.environmentId,
        taskId: payload.taskId,
        presentTools: payload.presentTools,
        interactableRef: payload.interactableRef,
        completionMode: payload.completionMode ?? 'manual',
        executionGrant,
        requestId,
      });
    },
    describeCheck: ({ actor, run, preparationGrant, requestId }) => {
      const runtime = currentEngine();
      if (typeof runtime?.describeVersionedStageCheck !== 'function') {
        return { required: false, blocked: 'unsupported-operation' };
      }
      return runtime.describeVersionedStageCheck({
        actor,
        runId: run.id,
        preparationGrant,
        requestId,
      });
    },
    evaluateCheck: ({ actor, privateEvaluation, decision, sender }) => {
      const runtime = currentEngine();
      if (typeof runtime?.evaluatePreparedVersionedCheck !== 'function') {
        return operationUnavailable();
      }
      return runtime.evaluatePreparedVersionedCheck({ actor, privateEvaluation, decision, sender });
    },
    execute: ({ actor, run, payload, executionGrant, requestId, expectedRevision }) => {
      const runtime = currentEngine();
      if (typeof runtime?.executeVersionedStage !== 'function') return operationUnavailable();
      return runtime.executeVersionedStage({
        actor,
        runId: run.id,
        expectedRevision,
        executionGrant,
        requestId,
        trigger: payload.trigger === 'worldTime' ? 'worldTime' : 'manual',
      });
    },
    cancel: ({ actor, run, executionGrant, requestId, expectedRevision }) => {
      const runtime = currentEngine();
      if (typeof runtime?.cancelVersionedRun !== 'function') return operationUnavailable();
      return runtime.cancelVersionedRun({
        actor,
        runId: run.id,
        expectedRevision,
        executionGrant,
        requestId,
      });
    },
    pause: (args) => managerMutation(args, 'pause', 'pauseRun'),
    resume: (args) => managerMutation(args, 'resume', 'resumeRun'),
    setCompletionMode: (args) =>
      managerMutation(args, 'setCompletionMode', 'setCompletionMode', [
        args.payload.completionMode,
      ]),
  };
}

/**
 * Server-attested commands revalidate identity, ownership, revision and expected stage under a claim.
 * Player checks use one-use tokens, local prompts and GM resolution; adapters own disclosure.
 * Replies correlate recipients/user/session/request/run/revision; dismissal preserves actor history.
 * @param {object} deps.authority Private-ledger authority from `createJournalRunAuthority`.
 * @param {object} [deps.operations] Registry keyed by native run type.
 * @param {Function} deps.currentUser Current realm's User supplier.
 * @param {Function} deps.activeGM Elected GM supplier.
 * @param {Function} deps.getUser Attested sender-ID lookup.
 * @param {Function} deps.resolveUuid Async Actor UUID resolver.
 * @param {Function} deps.emit `(message, options?)` socket adapter, normalizing absent options to `{}`.
 * @param {Function} deps.randomId Secure request/session ID supplier.
 * @param {number} [deps.timeoutMs=15000] Remote-reply timeout, not cancellation of server work.
 * @param {Function|null} [deps.promptCheck] Local safe-descriptor prompt returning a roll decision.
 * @param {Function|null} [deps.postRollHandoff] Post an already evaluated, entitled roll without rerolling.
 * @param {Function|null} [deps.onCheckChanged] Tell the player a re-prepared check differs from the one answered.
 * @param {Function} [deps.getDismissals] Read this user's dismissal map.
 * @param {Function} [deps.setDismissals] Awaited replacing write of this user's dismissal map.
 * @param {Function} [deps.now] Wall-clock milliseconds for tokens and dismissal timestamps.
 * @param {Function} [deps.onDismissalsChanged] Notify after successful persistence.
 * @returns {object} Command, dismissal, socket, authority and recovery service methods.
 */
export function createJournalRunCommandService({
  authority,
  operations = {},
  currentUser,
  activeGM,
  getUser,
  resolveUuid,
  emit,
  randomId,
  timeoutMs = JOURNAL_RUN_COMMAND_TIMEOUT_MS,
  promptCheck = null,
  postRollHandoff = null,
  onCheckChanged = null,
  getDismissals = () => ({}),
  setDismissals = async () => {},
  now = () => Date.now(),
  onDismissalsChanged = () => {},
}) {
  const sessionId = randomId();
  const pending = new Map();
  const currentRealmIsActiveGm = () => {
    const user = currentUser?.();
    return user?.isGM === true && Boolean(user.id) && user.id === activeGM?.()?.id;
  };

  async function resolveCommandContext(request, senderId) {
    const sender = getUser?.(senderId) ?? null;
    if (!sender) return failure('unknown-sender');
    let actor;
    try {
      actor = await resolveUuid(request.actorUuid);
    } catch {
      return failure('actor-not-found');
    }
    if (!actor) return failure('actor-not-found');
    if (!sender.isGM && actor.testUserPermission?.(sender, 'OWNER') !== true) {
      return failure('owner-required');
    }
    const operation = operations[request.runType];
    if (!operation) return failure('unsupported-operation');
    const run =
      request.action === 'start' ? null : await operation.getRun?.({ actor, runId: request.runId });
    if (request.action !== 'start' && !run) return failure('run-not-found');
    if (run && run.lifecycleVersion !== 1) {
      return failure('unsupported-version');
    }
    const revision = currentRevision(run);
    if (run && revision !== request.expectedRevision) {
      return failure('stale-run', { currentRevision: revision });
    }
    if (
      run &&
      Number.isInteger(request.payload?.expectedStage) &&
      Number(run.currentStepIndex ?? run.currentStageIndex ?? 0) !== request.payload.expectedStage
    ) {
      return failure('stale-stage');
    }
    // A settle spends nothing, so the owner-or-GM check above is its whole authorization.
    const authorize = request.action === 'chooseAward' ? authorizeAwardChoice : operation.authorize;
    const authorized = await authorize?.({
      actor,
      run,
      payload: request.payload ?? {},
      sender,
      request,
    });
    if (authorized === false) return failure('source-owner-required');
    if (authorized?.success === false) return authorized;
    return { success: true, sender, actor, operation, run, revision };
  }

  async function executeOperation(request, context, helpers, spent) {
    const { actor, operation, run } = context;
    const binding = {
      operation: request.action === 'releaseCheck' ? 'execute' : request.action,
      actorUuid: request.actorUuid,
      runType: request.runType,
      runId: request.runId,
      expectedRevision: request.expectedRevision,
    };
    if (request.action === 'releaseCheck') {
      const released = helpers.releasePrepareToken(request.payload?.prepareToken, binding);
      return released ? { success: true, cancelled: true } : failure('prepare-token-invalid');
    }

    let trustedContext = { operationId: request.requestId };
    let responseRollHandoff = null;
    let secretCheck = false;
    let privateEvaluation = null;
    let preparedPayload = request.payload ?? {};
    let executionOperation = request.action;
    if (request.action === 'start' && typeof operation.prepareStart === 'function') {
      const preparationGrant = helpers.createExecutionGrant({
        ...binding,
        operation: 'prepareAlchemyStart',
        runId: null,
        expectedRevision: null,
      });
      const prepared = await operation.prepareStart({
        actor,
        payload: preparedPayload,
        preparationGrant,
        requestId: request.requestId,
      });
      if (prepared?.success === false) return prepared;
      trustedContext = {
        operationId: request.requestId,
        ...prepared?.trustedContext,
      };
      preparedPayload = prepared?.payload ?? preparedPayload;
      executionOperation = prepared?.executionOperation ?? executionOperation;
    }
    if (request.action === 'execute' && request.payload?.prepareToken) {
      const evaluate = operation.evaluateCheck;
      if (typeof evaluate !== 'function') return failure('check-evaluator-unavailable');
      const { consumePrepareToken } = helpers;
      const seams = { evaluate, consumePrepareToken, currentRealmIsActiveGm, spent };
      const prepared = await evaluatePreparedJournalCheck({ request, context, binding, ...seams });
      if (prepared.response) return prepared.response;
      const resolvedCheckResult = prepared.checkResult;
      privateEvaluation = prepared.privateEvaluation;
      // A check that cannot roll carries its refusal sentence, which the player sees.
      if (resolvedCheckResult?.misconfigured === true) {
        return failure('roll-unavailable', { message: resolvedCheckResult.message ?? null });
      }
      if (resolvedCheckResult?.engineEvaluated !== true || resolvedCheckResult.cancelled) {
        return failure(resolvedCheckResult?.cancelled ? 'roll-cancelled' : 'roll-unavailable');
      }
      const {
        rollHandoff = null,
        secret = false,
        ...trustedResolvedCheckResult
      } = resolvedCheckResult;
      responseRollHandoff = rollHandoff;
      secretCheck = secret === true;
      const entitlement = { operation, request, resolveUuid, getUser, privateEvaluation };
      const offered = await cardOffer(trustedResolvedCheckResult, rollHandoff, {
        ...entitlement,
        payload: request.payload ?? {},
      });
      trustedContext = { operationId: request.requestId, resolvedCheckResult: offered };
    } else if (request.action === 'execute' && typeof operation.describeCheck === 'function') {
      const preparationGrant = helpers.createExecutionGrant({
        ...binding,
        operation: 'describeCheck',
        expectedRevision: null,
      });
      const descriptor = await operation.describeCheck({
        actor,
        run,
        sender: context.sender,
        payload: request.payload ?? {},
        preparationGrant,
        requestId: request.requestId,
      });
      if (descriptor?.blocked) return failure(descriptor.blocked, descriptor.detail);
      if (descriptor?.required) {
        const publicPrompt = await withPreparedAdditionalDiceOffer(descriptor, context);
        const token = helpers.issuePrepareToken(
          {
            ...binding,
            privateEvaluation: descriptor.privateEvaluation,
            decisionPolicy: preparedDecisionPolicy(publicPrompt),
          },
          { expiresAt: now() + 60_000 }
        );
        return {
          success: true,
          checkRequired: true,
          promptDescriptor: publicPrompt ?? {},
          prepareToken: token,
        };
      }
      trustedContext.resolvedCheckResult = {
        success: true,
        outcome: null,
        value: null,
        data: {},
        engineEvaluated: true,
      };
    }

    const facts = { trustedContext, responseRollHandoff, secretCheck, privateEvaluation };
    const plan = { binding, preparedPayload, executionOperation };
    try {
      return await commitOperation(request, context, helpers, { ...facts, ...plan });
    } finally {
      // Every way out closes the card offer; one the reply already settled is gone by now.
      await settleCardRolls(trustedContext.resolvedCheckResult?.cardRolls);
    }
  }

  /** Runs the operation under its execution grant and answers the reply an entitled sender reads. */
  async function commitOperation(request, context, helpers, prepared) {
    const { actor, operation, run } = context;
    const { binding, preparedPayload, executionOperation, trustedContext } = prepared;
    const { responseRollHandoff, secretCheck, privateEvaluation } = prepared;
    const method = operation[executionOperation];
    if (typeof method !== 'function') return failure('unsupported-operation');
    if (!currentRealmIsActiveGm()) return failure('active-gm-required');
    const executionBinding =
      request.action === 'start'
        ? { ...binding, operation: executionOperation, runId: null, expectedRevision: null }
        : binding;
    const executionGrant = helpers.createExecutionGrant({ ...executionBinding, trustedContext });
    const payload = { ...preparedPayload };
    delete payload.total;
    delete payload.roll;
    delete payload.awards;
    delete payload.rollDecision;
    delete payload.prepareToken;
    const result = await method({
      actor,
      run,
      runId: request.runId,
      expectedRevision: request.expectedRevision,
      payload,
      executionGrant,
      requestId: request.requestId,
      senderId: request.senderId,
      sender: context.sender,
    });
    const response = serializedOperationResult(result, {
      secret: secretCheck,
      runId: request.runId,
    });
    const check = secretCheck
      ? null
      : executedCheckFor(request.runType, trustedContext.resolvedCheckResult);
    // A handoff the result card carried is not posted again by the requester.
    const carried = await settleCardRolls(trustedContext.resolvedCheckResult?.cardRolls);
    const handoff = secretCheck || carried ? null : responseRollHandoff;
    const entitlement = { operation, request, resolveUuid, getUser, payload, privateEvaluation };
    return withEntitledFacts(response, { check, handoff }, { ...entitlement, result });
  }

  async function handleRequest(request, senderId) {
    if (!validRequest(request)) return failure('invalid-command');
    if (!currentRealmIsActiveGm()) {
      return failure('active-gm-required');
    }
    const spent = {};
    // A run command's logical identity is its request, whatever the payload names.
    const claimed = { ...request, operationId: undefined, senderId };
    const response = await authority.run(claimed, async (helpers) => {
      // Every lookup occurs after the server-arbitrated claim has been acquired.
      const context = await resolveCommandContext(request, senderId);
      if (!context.success) return context;
      return executeOperation({ ...request, senderId }, context, helpers, spent);
    });
    return withSpentAdditionalDice(response, spent, request.expectedRevision);
  }

  function buildReply(request, recipientId, response) {
    return {
      kind: JOURNAL_RUN_SOCKET_KIND.REPLY,
      recipientId,
      sessionId: request.sessionId,
      requestId: request.requestId,
      actorUuid: request.actorUuid,
      runType: request.runType,
      runId: request.runId,
      expectedRevision: request.expectedRevision,
      response,
    };
  }

  async function handleSocketMessage(payload, senderId) {
    if (payload?.kind === JOURNAL_RUN_SOCKET_KIND.REPLY) {
      return acceptReply(payload, senderId);
    }
    if (payload?.kind !== JOURNAL_RUN_SOCKET_KIND.REQUEST) return null;
    if (!currentRealmIsActiveGm()) return null;
    if (
      typeof authority.shouldHandleRequest === 'function' &&
      !(await authority.shouldHandleRequest(payload))
    )
      return null;
    const response = await handleRequest(payload, senderId);
    // A second tab for the same elected GM has the same attested sender id. A tab that lost
    // either boot recovery or this command's claim must stay silent or it can beat the winning
    // tab's eventual settled reply.
    if (['claim-held', 'recovery-pending'].includes(response?.reason)) return null;
    const reply = buildReply(payload, senderId, response);
    emit(reply, { recipients: [senderId] });
    return reply;
  }

  function acceptReply(payload, senderId) {
    const gm = activeGM?.();
    const user = currentUser?.();
    if (payload?.kind !== JOURNAL_RUN_SOCKET_KIND.REPLY) return false;
    if (!gm?.id || senderId !== gm.id || payload.recipientId !== user?.id) return false;
    if (payload.sessionId !== sessionId) return false;
    const tracked = pending.get(payload.requestId);
    if (!tracked || !replyMatches(tracked, payload)) return false;
    clearTimeout(tracked.timer);
    pending.delete(payload.requestId);
    tracked.resolve(payload.response);
    return true;
  }

  function sendCommand(command) {
    const gm = activeGM?.();
    if (!gm?.id) return Promise.resolve(failure('active-gm-missing'));
    const user = currentUser?.();
    const request = {
      kind: JOURNAL_RUN_SOCKET_KIND.REQUEST,
      ...command,
      // A resumed settle re-sends its persisted request id, so its plan matches (issue 1773).
      requestId: validText(command.requestId) ? command.requestId : randomId(),
      sessionId,
      senderId: undefined,
      payload: command.payload && typeof command.payload === 'object' ? command.payload : {},
    };
    if (user?.id === gm.id && user?.isGM === true) return handleRequest(request, user.id);
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        pending.delete(request.requestId);
        resolve(failure('command-timeout'));
      }, timeoutMs);
      pending.set(request.requestId, { ...request, resolve, timer });
      emit(request);
    });
  }

  /**
   * Run one Journal command, resolving a required check on the way. `interactive` is the CALLER'S:
   * the public API defaults it to `false`, because `promptCheck` awaits a human with no timeout of
   * its own, so a non-interactive caller settles the check on the engine's defaults, the route a
   * player takes after answering (issue 1683), buying only the `additionalDice` it names.
   */
  async function executeJournalRunCommand(command, options = {}) {
    const { interactive = true } = options;
    const first = await sendCommand(command);
    if (!first?.checkRequired) return first;
    if (!interactive) {
      const rollDecision = decisionAdditionalDice(options);
      return sendCommand({
        ...command,
        payload: { ...command.payload, prepareToken: first.prepareToken, rollDecision },
      });
    }
    if (typeof promptCheck !== 'function') return failure('check-prompt-unavailable');
    const seams = { sendCommand, promptCheck, postRollHandoff, onCheckChanged };
    return settlePromptedCheck(command, first, seams);
  }

  function getDismissedJournalRunKeys({ actorUuid, viewerId } = {}) {
    if (viewerId && viewerId !== currentUser?.()?.id) return new Set();
    const normalized = normalizeJournalRunDismissals(getDismissals());
    const actorPrefix = JSON.stringify([String(actorUuid ?? '')]).slice(0, -1) + ',';
    return new Set(Object.keys(normalized).filter((key) => key.startsWith(actorPrefix)));
  }

  async function dismissJournalRun({ actorUuid, runType, runId } = {}) {
    const operation = operations[runType];
    if (!operation || !validText(actorUuid) || !validText(runId))
      return failure('invalid-dismissal');
    let actor;
    try {
      actor = await resolveUuid(actorUuid);
    } catch {
      return failure('actor-not-found');
    }
    const run = actor ? await operation.getRun?.({ actor, runId, includeHistory: true }) : null;
    if (!run) return failure('run-not-found');
    if (!terminalRun(run)) return failure('active-run');
    const owed = awardChoiceDismissalRefusal(run);
    if (owed) return owed;
    const key = journalRunDismissalKey({ actorUuid, runType, runId });
    const next = normalizeJournalRunDismissals({ ...getDismissals(), [key]: now() });
    await setDismissals(next);
    onDismissalsChanged({ actorUuid, runType, runId });
    return { success: true, key };
  }

  return {
    executeJournalRunCommand,
    dismissJournalRun,
    getDismissedJournalRunKeys,
    getJournalRunAuthorityAvailability: () => authority.availability(),
    setupJournalRunAuthority: () => authority.setup(),
    reconcileJournalRunAuthority: (options) => authority.reconcile(options),
    bootstrapJournalRunAuthority: () => authority.bootstrapRecovery(),
    refreshJournalRunAuthorityAvailability: () => authority.refreshAvailability(),
    consumeExecutionGrant: (grant, expected) => authority.consumeExecutionGrant(grant, expected),
    handleRequest,
    handleSocketMessage,
    acceptReply,
  };
}
