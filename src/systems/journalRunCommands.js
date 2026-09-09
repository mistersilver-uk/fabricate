export const JOURNAL_RUN_SOCKET_KIND = Object.freeze({
  REQUEST: 'fabricate.journalRun.request',
  REPLY: 'fabricate.journalRun.reply',
});

const COMMAND_TIMEOUT_MS = 15_000;
const DISMISSAL_LIMIT = 500;
const MUTATING_ACTIONS = new Set([
  'start',
  'execute',
  'pause',
  'resume',
  'setCompletionMode',
  'setSelection',
  'cancel',
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

function safeRollDecision(value) {
  const decision = value && typeof value === 'object' ? value : {};
  const modifierIds = decision.modifierIds ?? decision.chosenModifierIds;
  return {
    bonus: typeof decision.bonus === 'string' ? decision.bonus : null,
    rollMode: typeof decision.rollMode === 'string' ? decision.rollMode : null,
    advantage: typeof decision.advantage === 'string' ? decision.advantage : null,
    modifierIds: Array.isArray(modifierIds)
      ? modifierIds.filter((id) => typeof id === 'string')
      : [],
  };
}

export function journalRunDismissalKey({ actorUuid, runType, runId }) {
  return JSON.stringify([String(actorUuid ?? ''), String(runType ?? ''), String(runId ?? '')]);
}

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

function terminalRun(run) {
  return ['complete', 'completed', 'cancelled', 'failed', 'archived'].includes(
    String(run?.status ?? '').toLowerCase()
  );
}

function operationUnavailable() {
  return failure('unsupported-operation');
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

/** Install the crafting engine's current-lifecycle requests through the command service. */
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

/** Install the gathering engine's current-lifecycle requests through the command service. */
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

/** Build the gathering side of the explicit journal operation registry. */
export function createGatheringJournalRunOperations({
  engine,
  getEngine,
  runManager,
  getService,
  getUser,
} = {}) {
  const currentEngine = () => getEngine?.() ?? engine ?? null;
  const managerMutation = async (args, operation, method, values = []) => {
    if (typeof runManager?.[method] !== 'function') return operationUnavailable();
    const trusted = getService?.()?.consumeExecutionGrant?.(args.executionGrant, {
      operation,
      actor: args.actor,
      runId: args.runId,
      expectedRevision: args.expectedRevision,
      requestId: args.requestId,
    });
    if (!trusted) return failure('execution-grant-invalid');
    const result = await runManager[method](args.actor, args.runId, ...values, {
      expectedRevision: args.expectedRevision,
    });
    return result ? { success: true, run: result } : failure('run-not-found');
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
    evaluateCheck: ({ actor, privateEvaluation, decision }) => {
      const runtime = currentEngine();
      if (typeof runtime?.evaluatePreparedVersionedCheck !== 'function') {
        return operationUnavailable();
      }
      return runtime.evaluatePreparedVersionedCheck({ actor, privateEvaluation, decision });
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

function serializedOperationResult(result, { secret = false, runId = '' } = {}) {
  const source = result && typeof result === 'object' ? result : failure('operation-unavailable');
  const run = source.run && typeof source.run === 'object' ? source.run : {};
  const base = {
    success: source.success === true,
    runId: source.runId ?? run.id ?? runId,
    status: source.status ?? run.status ?? null,
    runRevision: source.runRevision ?? run.runRevision ?? null,
  };
  if (secret) {
    return {
      ...base,
      secret: true,
      reason: source.success === true ? null : 'operation-failed',
    };
  }
  const results = Array.isArray(source.results) ? source.results : [];
  return {
    ...base,
    reason: source.reason ?? null,
    message: source.message ?? null,
    disposition: source.disposition ?? null,
    waiting: source.waiting === true,
    terminal: source.terminal === true || terminalRun(run),
    authorityUnavailable: source.authorityUnavailable === true,
    automaticBlocked: source.automaticBlocked === true,
    blocker: source.blocker ?? null,
    accepted: source.accepted === true,
    cancelled: source.cancelled === true,
    refunded: source.refunded === true,
    partialRefund: source.partialRefund === true,
    restoredCount: Number.isFinite(source.restoredCount) ? source.restoredCount : 0,
    consumed: source.consumed === true,
    createdResultUuids:
      source.createdResultUuids ?? results.map((item) => item?.uuid).filter(validText),
  };
}

/**
 * Browser-realm command client plus elected-GM command handler. All collaborators are explicit;
 * the Foundry socket and globals remain at the composition edge in main.js.
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
  timeoutMs = COMMAND_TIMEOUT_MS,
  promptCheck = null,
  postRollHandoff = null,
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
    const authorized = await operation.authorize?.({
      actor,
      run,
      payload: request.payload ?? {},
      sender,
    });
    if (authorized === false) return failure('source-owner-required');
    if (authorized?.success === false) return authorized;
    return { success: true, sender, actor, operation, run, revision };
  }

  async function executeOperation(request, context, helpers) {
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
    const prepareToken = request.payload?.prepareToken;
    if (request.action === 'execute' && prepareToken) {
      const token = helpers.consumePrepareToken(prepareToken, binding);
      if (!token) return failure('prepare-token-invalid');
      const privateEvaluation = token.binding?.privateEvaluation;
      const evaluate = operation.evaluateCheck;
      if (typeof evaluate !== 'function') return failure('check-evaluator-unavailable');
      const resolvedCheckResult = await evaluate({
        actor,
        run,
        sender: context.sender,
        privateEvaluation,
        decision: {
          ...safeRollDecision(request.payload?.rollDecision),
          ...token.binding?.decisionPolicy,
        },
      });
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
      trustedContext = {
        operationId: request.requestId,
        resolvedCheckResult: trustedResolvedCheckResult,
      };
    } else if (request.action === 'execute' && typeof operation.describeCheck === 'function') {
      const preparationGrant = helpers.createExecutionGrant({
        ...binding,
        operation: 'describeCheck',
        expectedRevision: null,
      });
      const descriptor = await operation.describeCheck({
        actor,
        run,
        payload: request.payload ?? {},
        preparationGrant,
        requestId: request.requestId,
      });
      if (descriptor?.blocked) return failure(descriptor.blocked);
      if (descriptor?.required) {
        const token = helpers.issuePrepareToken(
          {
            ...binding,
            privateEvaluation: descriptor.privateEvaluation,
            decisionPolicy: {
              allowsSituationalModifier:
                descriptor.publicPrompt?.allowsSituationalModifier === true,
              allowAdvantage: descriptor.publicPrompt?.allowAdvantage === true,
            },
          },
          { expiresAt: now() + 60_000 }
        );
        return {
          success: true,
          checkRequired: true,
          promptDescriptor: descriptor.publicPrompt ?? {},
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
    if (response.success && responseRollHandoff) {
      return { ...response, rollHandoff: responseRollHandoff };
    }
    return response;
  }

  async function handleRequest(request, senderId) {
    if (!validRequest(request)) return failure('invalid-command');
    if (!currentRealmIsActiveGm()) {
      return failure('active-gm-required');
    }
    return authority.run({ ...request, senderId }, async (helpers) => {
      // Every lookup occurs after the server-arbitrated claim has been acquired.
      const context = await resolveCommandContext(request, senderId);
      if (!context.success) return context;
      return executeOperation({ ...request, senderId }, context, helpers);
    });
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
    const response = await handleRequest(payload, senderId);
    // A second tab for the same elected GM has the same attested sender id. Its losing claim
    // response must stay silent or it can beat the winning tab's eventual settled reply.
    if (response?.reason === 'claim-held') return null;
    const reply = buildReply(payload, senderId, response);
    emit(reply);
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
      requestId: randomId(),
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

  async function executeJournalRunCommand(command) {
    const first = await sendCommand(command);
    if (!first?.checkRequired) return first;
    if (typeof promptCheck !== 'function') return failure('check-prompt-unavailable');
    const decision = await promptCheck(first.promptDescriptor);
    if (!decision || decision.confirmed === false) {
      await sendCommand({
        ...command,
        action: 'releaseCheck',
        payload: { prepareToken: first.prepareToken },
      });
      return { success: false, cancelled: true, reason: 'roll-cancelled' };
    }
    const settled = await sendCommand({
      ...command,
      payload: {
        ...command.payload,
        prepareToken: first.prepareToken,
        rollDecision: safeRollDecision(decision),
      },
    });
    if (settled?.rollHandoff && typeof postRollHandoff === 'function') {
      await postRollHandoff(settled.rollHandoff);
    }
    return settled;
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
    refreshJournalRunAuthorityAvailability: () => authority.refreshAvailability(),
    consumeExecutionGrant: (grant, expected) => authority.consumeExecutionGrant(grant, expected),
    handleRequest,
    handleSocketMessage,
    acceptReply,
  };
}
