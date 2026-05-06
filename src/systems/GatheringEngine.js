const DEFAULT_BLOCKED_REASON_KEYS = Object.freeze({
  NO_SELECTABLE_ACTORS: 'FABRICATE.Gathering.Blocked.NoSelectableActors',
  INVALID_REMEMBERED_ACTOR: 'FABRICATE.Gathering.Blocked.InvalidRememberedActor',
  ACTOR_NOT_SELECTABLE: 'FABRICATE.Gathering.Blocked.ActorNotSelectable',
  NO_ENVIRONMENTS_CONFIGURED: 'FABRICATE.Gathering.Blocked.NoEnvironmentsConfigured',
  NO_VISIBLE_TARGETED_TASKS: 'FABRICATE.Gathering.Blocked.NoVisibleTargetedTasks',
  BLIND_SOLE_TASK_HIDDEN: 'FABRICATE.Gathering.Blocked.BlindSoleTaskHidden',
  NO_VISIBLE_TASKS: 'FABRICATE.Gathering.Blocked.NoVisibleTasks',
  ENVIRONMENT_DISABLED: 'FABRICATE.Gathering.Blocked.EnvironmentDisabled',
  SCENE_TOKEN_BLOCKED: 'FABRICATE.Gathering.Blocked.SceneTokenBlocked',
  DUPLICATE_ACTIVE_RUN: 'FABRICATE.Gathering.Blocked.DuplicateActiveRun',
  CATALYST_BLOCKED: 'FABRICATE.Gathering.Blocked.CatalystBlocked',
  GAME_PAUSED: 'FABRICATE.Gathering.Blocked.GamePaused',
  MISSING_REFERENCE: 'FABRICATE.Gathering.Blocked.MissingReference',
  SYSTEM_DISABLED: 'FABRICATE.Gathering.Blocked.SystemDisabled',
  TASK_DISABLED: 'FABRICATE.Gathering.Blocked.TaskDisabled',
  TASK_HIDDEN: 'FABRICATE.Gathering.Blocked.TaskHidden',
  TASK_MISCONFIGURED: 'FABRICATE.Gathering.Blocked.TaskMisconfigured',
  RUN_CREATION_FAILED: 'FABRICATE.Gathering.Blocked.RunCreationFailed'
  ,
  NODE_DEPLETED: 'FABRICATE.Gathering.Blocked.NodeDepleted',
  ATTEMPT_LIMIT_EXHAUSTED: 'FABRICATE.Gathering.Blocked.AttemptLimitExhausted',
  STAMINA_BLOCKED: 'FABRICATE.Gathering.Blocked.StaminaBlocked'
});

const BLIND_TASK_LABEL_KEY = 'FABRICATE.Gathering.BlindTaskLabel';
const FAILURE_KEYWORDS = new Set([
  'f',
  'fail',
  'failed',
  'failure',
  'miss',
  'missed',
  'm',
  'none',
  'nothing',
  'whiff',
  'whiffed',
  'hazard',
  'danger',
  'complication',
  'trap',
  'oops'
]);

/**
 * Composes gathering stores, visibility evaluation, and runtime gate checks for
 * player-facing listing state and guarded attempt starts. Listings include
 * active timed runs and recent terminal history even when browsing rows are
 * empty or blocked for the selected actor. Non-timed attempts resolve
 * immediately into terminal routed/progressive outcomes, plan created-result,
 * catalyst, and check history payloads, persist terminal history, then commit
 * irreversible result, catalyst, and failure-feedback effects. Timed attempts
 * resume through processWorldTime(worldTime), which asks the run manager for
 * matured waitingTime runs, writes terminal history before post-history
 * effects, cancels missing-reference runs into terminal history, and clears
 * resume-time misconfiguration without player history or effects.
 */
export class GatheringEngine {
  constructor({
    environmentStore,
    runManager,
    richState = null,
    evaluator,
    systemManager = null,
    getSystems = null,
    getSelectableActors = null,
    isActorSelectable = null,
    isGamePaused = null,
    sceneAccess = null,
    catalystAvailability = null,
    resultResolver = null,
    resultCreator = null,
    catalystUsage = null,
    failureFeedback = null,
    getRunViewer = null,
    localize = defaultLocalize
  } = {}) {
    this.environmentStore = environmentStore;
    this.runManager = runManager;
    this.richState = richState;
    this.evaluator = evaluator;
    this.systemManager = systemManager;
    this.getSystems = getSystems;
    this.getSelectableActors = getSelectableActors;
    this.isActorSelectable = isActorSelectable;
    this.isGamePaused = isGamePaused;
    this.sceneAccess = sceneAccess;
    this.catalystAvailability = catalystAvailability;
    this.resultResolver = resultResolver;
    this.resultCreator = resultCreator;
    this.catalystUsage = catalystUsage;
    this.failureFeedback = failureFeedback;
    this.getRunViewer = getRunViewer;
    this.localize = localize;
  }

  /**
   * Resume matured timed gathering runs for the supplied Foundry world time.
   *
   * Non-matured waitingTime runs are filtered by GatheringRunManager and are
   * not resolved here. Matured success/failure paths call completeRun with
   * planned result/catalyst/check refs before committing result creation,
   * catalyst usage, or failure feedback. If terminal history persistence
   * throws or returns null, those post-history side effects are skipped.
   */
  async processWorldTime(worldTime) {
    const processed = [];
    const completed = [];
    const cancelled = [];
    const cleared = [];
    const errors = [];
    const readyRuns = normalizeList(await this.runManager?.getMaturedWaitingRuns?.(worldTime));

    for (const entry of readyRuns) {
      const actor = entry?.actor ?? null;
      const run = entry?.run ?? null;
      if (!actor || !run?.id || run.status !== 'waitingTime') continue;

      try {
        const result = await this._processMaturedWaitingRun({ actor, run });
        if (!result) continue;
        processed.push(result);
        if (result.state === 'cancelled') cancelled.push(result);
        else if (result.state === 'cleared') cleared.push(result);
        else completed.push(result);
      } catch (error) {
        errors.push({
          actorId: idOf(actor),
          runId: stringOrNull(run?.id),
          code: stringOrNull(error?.code) || stringOrNull(error?.name) || 'TIMED_COMPLETION_FAILED',
          message: stringOrNull(error?.message)
        });
      }
    }

    return {
      worldTime: Number(worldTime),
      processed,
      completed,
      cancelled,
      cleared,
      errors
    };
  }

  async startAttempt({
    viewer = null,
    actor = null,
    rememberedActorId = null,
    environmentId = null,
    taskId = null
  } = {}) {
    const resolved = await this._resolveStartContext({
      viewer,
      actor,
      rememberedActorId,
      environmentId,
      taskId
    });
    if (resolved.blockedReason) {
      return this._blockedStart({
        viewer,
        actor: resolved.actor ?? null,
        environment: resolved.environment ?? null,
        task: resolved.task ?? null,
        reason: resolved.blockedReason
      });
    }

    const { selectedActor, system, environment, task } = resolved;
    if (this._gamePaused()) {
      return this._blockedStart({
        viewer,
        actor: selectedActor,
        environment,
        task,
        reason: this._blockedReason('GAME_PAUSED')
      });
    }

    if (system.enabled === false || system.features?.gathering !== true) {
      return this._blockedStart({
        viewer,
        actor: selectedActor,
        environment,
        task,
        reason: this._blockedReason('SYSTEM_DISABLED')
      });
    }

    if (environment.enabled === false) {
      return this._blockedStart({
        viewer,
        actor: selectedActor,
        environment,
        task,
        reason: this._blockedReason('ENVIRONMENT_DISABLED')
      });
    }

    if (task.enabled === false) {
      return this._blockedStart({
        viewer,
        actor: selectedActor,
        environment,
        task,
        reason: this._blockedReason('TASK_DISABLED', {
          data: this._blindTaskData({ environment, task, viewer })
        })
      });
    }

    if (environment.sceneUuid) {
      const access = await this._checkSceneAccess({ environment, viewer, actor: selectedActor });
      if (access.allowed !== true) {
        return this._blockedStart({
          viewer,
          actor: selectedActor,
          environment,
          task,
          reason: this._blockedReason(access.code || 'SCENE_TOKEN_BLOCKED', {
            messageKey: access.messageKey,
            message: access.message,
            data: access.data
          })
        });
      }
    }

    const visibility = viewer?.isGM
      ? { visible: true, reasonCode: 'GM_VISIBLE', diagnostic: null }
      : normalizeVisibilityResult(await this._evaluateTaskVisibility({
        environment,
        system,
        task,
        viewer,
        actor: selectedActor
      }));
    if (visibility.visible !== true) {
      return this._blockedStart({
        viewer,
        actor: selectedActor,
        environment,
        task,
        reason: this._blockedReason('TASK_HIDDEN', {
          data: this._blindTaskData({ environment, task, viewer })
        })
      });
    }

    if (this.runManager?.findActiveRunForTask?.(selectedActor, task.id)) {
      return this._blockedStart({
        viewer,
        actor: selectedActor,
        environment,
        task,
        reason: this._blockedReason('DUPLICATE_ACTIVE_RUN', {
          data: this._blindTaskData({ environment, task, viewer })
        })
      });
    }

    const catalysts = normalizeList(task.catalysts);
    if (catalysts.length > 0) {
      const catalystResult = await this._checkCatalysts({
        actor: selectedActor,
        viewer,
        system,
        environment,
        task,
        catalysts
      });
      if (catalystResult.available !== true) {
        return this._blockedStart({
          viewer,
          actor: selectedActor,
          environment,
          task,
          reason: this._blockedReason('CATALYST_BLOCKED', {
            data: this._isOpaqueBlindTask({ environment, viewer })
              ? null
              : {
                  taskId: task.id,
                  missing: normalizeList(catalystResult.missing)
                }
          })
        });
      }
    }

    const richAttempt = await this._evaluateRichAttempt({
      actor: selectedActor,
      viewer,
      system,
      environment,
      task
    });
    if (richAttempt.blockedReasons.length > 0) {
      return this._blockedStart({
        viewer,
        actor: selectedActor,
        environment,
        task,
        reason: richAttempt.blockedReasons[0]
      });
    }

    const configuration = this._validateStartTask(task);
    if (configuration.valid !== true) {
      return this._blockedStart({
        viewer,
        actor: selectedActor,
        environment,
        task,
        reason: this._blockedReason('TASK_MISCONFIGURED', {
          data: this._isOpaqueBlindTask({ environment, viewer })
            ? null
            : { taskId: task.id, errors: configuration.errors }
        })
      });
    }

    if (hasTimeRequirement(task)) {
      return this._startWaitingAttempt({ viewer, actor: selectedActor, system, environment, task, richAttempt });
    }

    return this._resolveImmediateAttempt({ viewer, actor: selectedActor, system, environment, task, richAttempt });
  }

  async _processMaturedWaitingRun({ actor, run }) {
    const viewer = await this._viewerForRun({ actor, run });
    const resolved = this._resolveWaitingRunContext({ actor, run });
    if (resolved.missingReference) {
      return this._cancelMissingReferenceRun({ viewer, actor, run, resolved });
    }

    const { system, environment, task } = resolved;
    const configuration = this._validateStartTask(task);
    if (configuration.valid !== true) {
      return this._clearMisconfiguredWaitingRun({
        viewer,
        actor,
        run,
        environment,
        task,
        errors: configuration.errors
      });
    }

    const outcome = task.resolutionMode === 'progressive'
      ? await this._resolveProgressiveOutcome({ viewer, actor, system, environment, task })
      : await this._resolveRoutedOutcome({ viewer, actor, system, environment, task });
    if (outcome.status === 'misconfigured') {
      return this._clearMisconfiguredWaitingRun({
        viewer,
        actor,
        run,
        environment,
        task,
        outcome
      });
    }

    const checkResult = plainObjectOrNull(outcome.checkResult) ?? undefined;
    const plan = await this._terminalSideEffectPlan({ viewer, actor, system, environment, task, outcome, checkResult });
    if (plan.status === 'misconfigured') {
      return this._clearMisconfiguredWaitingRun({
        viewer,
        actor,
        run,
        environment,
        task,
        outcome: plan
      });
    }

    const { runData, payload } = this._terminalHistoryWrite({
      viewer,
      actor,
      system,
      environment,
      task,
      outcome,
      checkResult,
      plan
    });
    const completedRun = await this.runManager.completeRun(actor, run, outcome.status, payload, {
      terminalRunData: runData
    });
    if (!completedRun) {
      throw Object.assign(new Error('Timed gathering terminal history was not written'), {
        code: 'TERMINAL_HISTORY_NOT_WRITTEN'
      });
    }

    const richEvidence = await this._commitRichAttempt({ actor, system, environment, task, outcome });
    const completedRunWithRichEvidence = richEvidence && typeof richEvidence === 'object'
      ? {
          ...completedRun,
          economyEvidence: {
            ...(completedRun.economyEvidence || {}),
            ...richEvidence
          }
        }
      : completedRun;

    await this._commitTerminalSideEffects({
      viewer,
      actor,
      system,
      environment,
      task,
      outcome,
      checkResult
    });

    return this._terminalStart({
      viewer,
      actor,
      system,
      environment,
      task,
      status: outcome.status,
      run: completedRunWithRichEvidence,
      createdResults: plan.createdResults,
      usedCatalysts: plan.usedCatalysts,
      checkResult
    });
  }

  async listForActor({ viewer = null, actor = null, rememberedActorId = null } = {}) {
    const selectableActors = normalizeActorList(await callMaybe(this.getSelectableActors, { viewer }));
    if (selectableActors.length === 0) {
      return this._emptyListing({
        viewer,
        selectableActors,
        reason: this._blockedReason('NO_SELECTABLE_ACTORS')
      });
    }

    const selected = this._resolveSelectedActor({
      actor,
      rememberedActorId,
      selectableActors,
      viewer
    });
    if (selected.blockedReason) {
      return this._emptyListing({
        viewer,
        selectableActors,
        reason: selected.blockedReason
      });
    }

    const selectedActor = selected.actor;
    const systems = this._enabledGatheringSystems();
    const environments = this._playerCandidateEnvironments(systems, viewer);
    if (environments.length === 0) {
      return this._emptyListing({
        viewer,
        actor: selectedActor,
        selectableActors,
        reason: this._blockedReason('NO_ENVIRONMENTS_CONFIGURED')
      });
    }

    const hidden = { targeted: 0, blind: 0 };
    const environmentModels = [];
    for (const environment of environments) {
      const model = await this._buildEnvironmentListing({
        environment,
        system: systems.get(environment.craftingSystemId),
        viewer,
        actor: selectedActor
      });
      if (model.visible) {
        environmentModels.push(model);
        continue;
      }
      if (model.hiddenReason === 'BLIND_SOLE_TASK_HIDDEN') hidden.blind += 1;
      if (model.hiddenReason === 'NO_VISIBLE_TARGETED_TASKS') hidden.targeted += 1;
    }

    if (environmentModels.length === 0) {
      return this._emptyListing({
        viewer,
        actor: selectedActor,
        selectableActors,
        reason: this._emptyVisibilityReason(hidden)
      });
    }

    const attemptable = environmentModels.some(environment => environment.attemptable);
    const blockedReasons = attemptable
      ? []
      : uniqueReasons(environmentModels.flatMap(environment => environment.blockedReasons));
    const activeRuns = this._activeRunModels({ actor: selectedActor, viewer });
    const history = this._historyModels({ actor: selectedActor, viewer });

    return {
      visible: true,
      attemptable,
      blockedReasons,
      state: attemptable ? 'ready' : 'blocked',
      viewerId: idOf(viewer),
      selectedActorId: idOf(selectedActor),
      selectableActors: selectableActors.map(actorToOption),
      environments: environmentModels,
      activeRuns,
      history
    };
  }

  _activeRunModels({ actor, viewer }) {
    return normalizeList(this.runManager?.getActiveRuns?.(actor))
      .filter(run => run?.status === 'waitingTime')
      .map(run => this._runModel({ run, viewer, terminal: false }))
      .filter(Boolean);
  }

  _historyModels({ actor, viewer }) {
    return normalizeList(this.runManager?.getRunHistory?.(actor, 10))
      .map(run => this._runModel({ run, viewer, terminal: true }))
      .filter(Boolean);
  }

  _runModel({ run, viewer, terminal }) {
    if (!run?.id) return null;
    const environment = this._findEnvironment(run.environmentId);
    const task = environment
      ? normalizeList(environment.tasks).find(task => task?.id === run.taskId) ?? null
      : null;
    const opaqueBlind = this._isOpaqueBlindRun({ environment, run, viewer });
    const status = stringOrNull(run.status);
    const model = {
      id: stringOrNull(run.id),
      status,
      craftingSystemId: stringOrNull(run.craftingSystemId),
      environmentId: stringOrNull(run.environmentId),
      environmentName: stringOrEmpty(environment?.name),
      selectionMode: environment?.selectionMode === 'blind' ? 'blind' : 'targeted',
      blind: opaqueBlind,
      label: opaqueBlind
        ? this.localize(BLIND_TASK_LABEL_KEY)
        : stringOrEmpty(task?.name) || stringOrEmpty(environment?.name) || status,
      taskId: opaqueBlind ? null : stringOrNull(run.taskId),
      startedAtWorldTime: numberOrNull(run.startedAtWorldTime),
      updatedAtWorldTime: numberOrNull(run.updatedAtWorldTime)
    };

    const timeGate = plainObjectOrNull(run.timeGate);
    if (timeGate) model.timeGate = timeGate;
    if (run.economyEvidence && typeof run.economyEvidence === 'object') {
      model.economyEvidence = opaqueBlind ? redactRichEvidence(run.economyEvidence) : cloneJson(run.economyEvidence);
    }
    if (run.conditionSnapshot && typeof run.conditionSnapshot === 'object') {
      model.conditions = cloneJson(run.conditionSnapshot);
    }
    if (run.riskLevel) {
      model.risk = stringOrNull(run.riskLevel);
    }
    if (!opaqueBlind && Array.isArray(run.chatMessageIds)) {
      model.chatMessageIds = cloneJson(run.chatMessageIds);
    }

    if (terminal) {
      model.completedAtWorldTime = numberOrNull(run.completedAtWorldTime);
      if (!opaqueBlind) {
        const createdResults = normalizeList(run.createdResults);
        const usedCatalysts = normalizeList(run.usedCatalysts);
        model.createdResultCount = createdResults.length;
        model.usedCatalystCount = usedCatalysts.length;
        model.createdResults = cloneJson(createdResults);
        model.usedCatalysts = cloneJson(usedCatalysts);
        if (run.checkResult && typeof run.checkResult === 'object') {
          model.checkResult = cloneJson(run.checkResult);
        }
      }
    }

    return model;
  }

  _isOpaqueBlindRun({ environment, run, viewer }) {
    if (viewer?.isGM === true) return false;
    return !environment || environment.selectionMode === 'blind' || run?.taskId === 'blind';
  }

  _resolveSelectedActor({ actor, rememberedActorId, selectableActors, viewer }) {
    if (actor) {
      if (this._isSelectableActor(actor, viewer, selectableActors)) {
        return { actor };
      }
      return {
        actor: null,
        blockedReason: this._blockedReason('ACTOR_NOT_SELECTABLE')
      };
    }

    if (rememberedActorId) {
      const remembered = selectableActors.find(candidate => actorMatchesId(candidate, rememberedActorId));
      if (remembered) return { actor: remembered };
      return {
        actor: null,
        blockedReason: this._blockedReason('INVALID_REMEMBERED_ACTOR', {
          data: { actorId: String(rememberedActorId) }
        })
      };
    }

    return { actor: selectableActors[0] };
  }

  async _viewerForRun({ actor, run }) {
    if (typeof this.getRunViewer === 'function') {
      const viewer = await this.getRunViewer({ actor, run });
      if (viewer) return viewer;
    }
    return {
      id: stringOrNull(run?.userId),
      isGM: false
    };
  }

  _resolveWaitingRunContext({ actor, run }) {
    if (!actor || !sameActorUuid(actor, run?.actorUuid)) {
      return { missingReference: 'actor' };
    }

    const system = this._allSystems().get(String(run.craftingSystemId));
    if (!system) {
      return { missingReference: 'system' };
    }

    const environment = this._findEnvironment(run.environmentId);
    if (!environment || stringOrNull(environment.craftingSystemId) !== stringOrNull(run.craftingSystemId)) {
      return { missingReference: 'environment', system };
    }

    const task = normalizeList(environment.tasks).find(task => task?.id === run.taskId) ?? null;
    if (!task) {
      return { missingReference: 'task', system, environment };
    }

    return { system, environment, task };
  }

  _isSelectableActor(actor, viewer, selectableActors) {
    if (typeof this.isActorSelectable === 'function') {
      return this.isActorSelectable({ actor, viewer }) === true;
    }
    return selectableActors.some(candidate => sameActor(candidate, actor));
  }

  _enabledGatheringSystems() {
    return new Map(
      Array.from(this._allSystems().values())
        .filter(system => system.enabled !== false && system.features?.gathering === true)
        .map(system => [String(system.id), system])
    );
  }

  _allSystems() {
    const systems = normalizeList(
      typeof this.getSystems === 'function'
        ? this.getSystems()
        : this.systemManager?.getSystems?.()
    );

    return new Map(systems.filter(system => system?.id).map(system => [String(system.id), system]));
  }

  _playerCandidateEnvironments(systems, viewer) {
    const environments = normalizeList(this.environmentStore?.list?.());
    return environments.filter(environment => {
      if (!systems.has(environment?.craftingSystemId)) return false;
      if (environment.enabled === false && !viewer?.isGM) return false;
      return true;
    });
  }

  async _buildEnvironmentListing({ environment, system, viewer, actor }) {
    const visibleTasks = await this._visibleTaskListings({ environment, system, viewer, actor });
    if (visibleTasks.length === 0) {
      return {
        visible: false,
        hiddenReason: environment.selectionMode === 'blind'
          ? 'BLIND_SOLE_TASK_HIDDEN'
          : 'NO_VISIBLE_TARGETED_TASKS'
      };
    }

    const environmentBlockedReasons = await this._environmentBlockedReasons({ environment, viewer, actor });
    const taskModels = [];
    for (const visibleTask of visibleTasks) {
      const taskBlockedReasons = [
        ...environmentBlockedReasons,
        ...await this._taskBlockedReasons({
          environment,
          system,
          task: visibleTask.task,
          actor,
          viewer
        })
      ];
      taskModels.push(this._taskModel({
        task: visibleTask.task,
        environment,
        actor,
        viewer,
        visibility: visibleTask.visibility,
        blockedReasons: taskBlockedReasons
      }));
    }

    const attemptable = taskModels.some(task => task.attemptable);
    const blockedReasons = environmentBlockedReasons.length > 0
      ? environmentBlockedReasons
      : (attemptable ? [] : uniqueReasons(taskModels.flatMap(task => task.blockedReasons)));

    return {
      id: stringOrNull(environment.id),
      craftingSystemId: stringOrNull(environment.craftingSystemId),
      name: stringOrEmpty(environment.name),
      description: stringOrEmpty(environment.description),
      img: stringOrNull(environment.img),
      region: stringOrEmpty(environment.region),
      biome: stringOrEmpty(environment.biome),
      risk: stringOrNull(environment.risk) || 'safe',
      economyMode: stringOrNull(environment.economyMode) || 'time',
      conditions: plainObjectOrNull(environment.conditions) || {},
      selectionMode: environment.selectionMode === 'blind' ? 'blind' : 'targeted',
      sceneUuid: stringOrNull(environment.sceneUuid),
      visible: true,
      attemptable,
      blockedReasons,
      tasks: taskModels
    };
  }

  async _visibleTaskListings({ environment, system, viewer, actor }) {
    const enabledTasks = normalizeList(environment.tasks).filter(task => task?.enabled !== false);
    const visibleTasks = [];
    for (const task of enabledTasks) {
      const visibility = viewer?.isGM
        ? { visible: true, reasonCode: 'GM_VISIBLE', diagnostic: null }
        : await this._evaluateTaskVisibility({ environment, system, task, viewer, actor });
      if (visibility.visible === true) {
        visibleTasks.push({ task, visibility });
      }
    }
    return visibleTasks;
  }

  async _evaluateTaskVisibility({ environment, system, task, viewer, actor }) {
    if (typeof this.evaluator?.evaluateVisibility !== 'function') {
      return { visible: true, reasonCode: 'NO_VISIBILITY_EVALUATOR', diagnostic: null };
    }
    return this.evaluator.evaluateVisibility({
      gate: task.visibility ?? null,
      actor,
      viewer,
      environment,
      system,
      task
    });
  }

  async _environmentBlockedReasons({ environment, viewer, actor }) {
    const blockedReasons = [];
    if (environment.enabled === false) {
      blockedReasons.push(this._blockedReason('ENVIRONMENT_DISABLED'));
    }

    if (environment.sceneUuid) {
      const access = await this._checkSceneAccess({ environment, viewer, actor });
      if (access.allowed !== true) {
        blockedReasons.push(this._blockedReason(access.code || 'SCENE_TOKEN_BLOCKED', {
          messageKey: access.messageKey,
          message: access.message,
          data: access.data
        }));
      }
    }

    return blockedReasons;
  }

  async _checkSceneAccess({ environment, viewer, actor }) {
    if (typeof this.sceneAccess?.canAttempt === 'function') {
      return normalizeGateResult(await this.sceneAccess.canAttempt({ environment, viewer, actor }));
    }
    return { allowed: false, code: 'SCENE_TOKEN_BLOCKED' };
  }

  async _taskBlockedReasons({ environment, system, task, actor, viewer }) {
    const blockedReasons = [];
    if (this.runManager?.findActiveRunForTask?.(actor, task.id)) {
      blockedReasons.push(this._blockedReason('DUPLICATE_ACTIVE_RUN', {
        data: this._isOpaqueBlindTask({ environment, viewer }) ? null : { taskId: task.id }
      }));
    }

    const catalysts = normalizeList(task.catalysts);
    if (catalysts.length > 0) {
      const catalystResult = await this._checkCatalysts({
        actor,
        viewer,
        system,
        environment,
        task,
        catalysts
      });
      if (catalystResult.available !== true) {
        blockedReasons.push(this._blockedReason('CATALYST_BLOCKED', {
          data: this._isOpaqueBlindTask({ environment, viewer })
            ? null
            : {
                taskId: task.id,
                missing: normalizeList(catalystResult.missing)
              }
        }));
      }
    }

    const richAttempt = await this._evaluateRichAttempt({ actor, viewer, system, environment, task });
    blockedReasons.push(...richAttempt.blockedReasons);

    return blockedReasons;
  }

  async _checkCatalysts({ actor, viewer, system, environment, task, catalysts }) {
    if (typeof this.catalystAvailability?.check === 'function') {
      return normalizeCatalystResult(await this.catalystAvailability.check({
        actor,
        viewer,
        system,
        environment,
        task,
        catalysts
      }));
    }
    return catalysts.length === 0
      ? { available: true, missing: [] }
      : { available: false, missing: catalysts };
  }

  _taskModel({ task, environment, actor = null, viewer, visibility, blockedReasons }) {
    const blind = environment.selectionMode === 'blind';
    const opaqueBlind = this._isOpaqueBlindTask({ environment, viewer });
    const rich = this._richListingMetadata({ environment, task, actor, viewer });

    if (opaqueBlind) {
      return {
        action: 'blindGather',
        name: null,
        label: this.localize(BLIND_TASK_LABEL_KEY),
        description: '',
        blind: true,
        visible: true,
        attemptable: blockedReasons.length === 0,
        blockedReasons,
        rich,
        visibility: {
          reasonCode: null,
          description: '',
          diagnostic: null
        }
      };
    }

    return {
      id: stringOrNull(task.id),
      name: stringOrEmpty(task.name),
      label: stringOrEmpty(task.name),
      description: stringOrEmpty(task.description),
      img: stringOrNull(task.img),
      blind,
      visible: true,
      attemptable: blockedReasons.length === 0,
      blockedReasons,
      visibility: {
        reasonCode: stringOrNull(visibility.reasonCode),
        description: stringOrEmpty(visibility.description),
        diagnostic: visibility.diagnostic ?? null
      },
      resolutionMode: stringOrNull(task.resolutionMode),
      hasTimeRequirement: Boolean(task.timeRequirement),
      catalystCount: normalizeList(task.catalysts).length,
      rich
    };
  }

  _richListingMetadata({ environment, task, actor = null, viewer = null }) {
    if (typeof this.richState?.buildListingMetadata === 'function') {
      return this.richState.buildListingMetadata({ environment, task, actor, viewer });
    }
    return {
      nodes: task?.nodes ? {
        enabled: true,
        available: Number(task.nodes.current || 0) > 0,
        current: Number(task.nodes.current || 0),
        max: Number(task.nodes.max || 0)
      } : null,
      stamina: Number(task?.staminaCost || 0) > 0 ? { cost: Number(task.staminaCost) } : null,
      attemptLimit: task?.attemptLimit ? { max: Number(task.attemptLimit.max || 1) } : null,
      risk: task?.riskOverride || environment?.risk || 'safe',
      conditions: plainObjectOrNull(environment?.conditions) || {}
    };
  }

  async _evaluateRichAttempt({ actor, viewer, system, environment, task }) {
    if (typeof this.richState?.evaluateStart !== 'function') {
      return { blockedReasons: [], evidence: this._richListingMetadata({ environment, task, actor, viewer }) };
    }
    const result = await this.richState.evaluateStart({ actor, viewer, system, environment, task });
    return {
      blockedReasons: normalizeList(result?.blockedReasons).map(reason => this._blockedReason(reason.code || 'BLOCKED', {
        messageKey: reason.messageKey,
        message: reason.message,
        data: this._isOpaqueBlindTask({ environment, viewer }) ? null : reason.data
      })),
      evidence: plainObjectOrNull(result?.evidence) || {}
    };
  }

  _isOpaqueBlindTask({ environment, viewer }) {
    return environment.selectionMode === 'blind' && viewer?.isGM !== true;
  }

  _gamePaused() {
    return typeof this.isGamePaused === 'function' && this.isGamePaused() === true;
  }

  async _resolveStartContext({ viewer, actor, rememberedActorId, environmentId, taskId }) {
    const selectableActors = normalizeActorList(await callMaybe(this.getSelectableActors, { viewer }));
    if (selectableActors.length === 0) {
      return { blockedReason: this._blockedReason('NO_SELECTABLE_ACTORS') };
    }

    const selected = this._resolveSelectedActor({ actor, rememberedActorId, selectableActors, viewer });
    if (selected.blockedReason) {
      return { actor: null, blockedReason: selected.blockedReason };
    }

    const environment = this._findEnvironment(environmentId);
    if (!environment) {
      return {
        actor: selected.actor,
        blockedReason: this._blockedReason('MISSING_REFERENCE', {
          data: { environmentId: stringOrNull(environmentId) }
        })
      };
    }

    const system = this._allSystems().get(String(environment.craftingSystemId));
    if (!system) {
      return {
        actor: selected.actor,
        environment,
        blockedReason: this._blockedReason('MISSING_REFERENCE', {
          data: {
            environmentId: environment.id,
            craftingSystemId: stringOrNull(environment.craftingSystemId)
          }
        })
      };
    }

    const task = this._findStartTask({ environment, taskId });
    if (!task) {
      return {
        actor: selected.actor,
        environment,
        blockedReason: this._blockedReason('MISSING_REFERENCE', {
          data: {
            environmentId: environment.id,
            taskId: stringOrNull(taskId)
          }
        })
      };
    }

    return { selectedActor: selected.actor, system, environment, task };
  }

  _findEnvironment(environmentId) {
    const id = stringOrNull(environmentId);
    if (!id) return null;
    if (typeof this.environmentStore?.get === 'function') {
      const environment = this.environmentStore.get(id);
      if (environment) return environment;
    }
    return normalizeList(this.environmentStore?.list?.()).find(environment => environment?.id === id) ?? null;
  }

  _findStartTask({ environment, taskId }) {
    const tasks = normalizeList(environment?.tasks);
    if (environment?.selectionMode === 'blind' && !taskId) {
      return tasks[0] ?? null;
    }
    const id = stringOrNull(taskId);
    if (!id) return null;
    return tasks.find(task => task?.id === id) ?? null;
  }

  _validateStartTask(task) {
    const errors = validateTaskConfiguration(task);
    return {
      valid: errors.length === 0,
      errors
    };
  }

  async _startWaitingAttempt({ viewer, actor, system, environment, task, richAttempt = null }) {
    if (typeof this.runManager?.createWaitingRun !== 'function') {
      return this._blockedStart({
        viewer,
        actor,
        environment,
        task,
        reason: this._blockedReason('RUN_CREATION_FAILED', {
          data: this._waitingRunFailureData({ environment, task, viewer, code: 'MISSING_RUN_MANAGER' })
        })
      });
    }

    const runData = {
      craftingSystemId: stringOrNull(system.id),
      environmentId: stringOrNull(environment.id),
      taskId: stringOrNull(task.id)
    };
    if (hasRichGatheringData(environment, task)) {
      Object.assign(runData, this._richHistoryPayload({ environment, task, richAttempt }));
    }
    const timeRequirement = normalizeTimeRequirement(task.timeRequirement);

    try {
      const run = await this.runManager.createWaitingRun(actor, runData, timeRequirement);
      if (!run || runHasDiagnostics(run)) {
        return this._blockedStart({
          viewer,
          actor,
          environment,
          task,
          reason: this._blockedReason('RUN_CREATION_FAILED', {
            data: this._waitingRunFailureData({
              environment,
              task,
              viewer,
              code: 'RUN_MANAGER_DIAGNOSTIC',
              diagnostics: run?.diagnostics ?? run?.diagnostic
            })
          })
        });
      }

      const richEvidence = await this._commitRichAttempt({ actor, system, environment, task, outcome: { status: 'waitingTime' } });
      const waitingRun = richEvidence && typeof richEvidence === 'object'
        ? {
            ...run,
            economyEvidence: {
              ...(run.economyEvidence || {}),
              ...richEvidence
            }
          }
        : run;
      return this._startedWaitingStart({ viewer, actor, system, environment, task, run: waitingRun });
    } catch (error) {
      return this._blockedStart({
        viewer,
        actor,
        environment,
        task,
        reason: this._blockedReason('RUN_CREATION_FAILED', {
          data: this._waitingRunFailureData({
            environment,
            task,
            viewer,
            code: stringOrNull(error?.code) || stringOrNull(error?.name) || 'RUN_MANAGER_ERROR'
          })
        })
      });
    }
  }

  async _resolveImmediateAttempt({ viewer, actor, system, environment, task, richAttempt = null }) {
    const outcome = task.resolutionMode === 'progressive'
      ? await this._resolveProgressiveOutcome({ viewer, actor, system, environment, task })
      : await this._resolveRoutedOutcome({ viewer, actor, system, environment, task });

    if (outcome.status === 'misconfigured') {
      return this._blockedStart({
        viewer,
        actor,
        environment,
        task,
        reason: this._blockedReason('TASK_MISCONFIGURED', {
          data: this._terminalMisconfigurationData({ environment, task, viewer, outcome })
        })
      });
    }

    if (typeof this.runManager?.createTerminalRun !== 'function') {
      return this._blockedStart({
        viewer,
        actor,
        environment,
        task,
        reason: this._blockedReason('RUN_CREATION_FAILED', {
          data: this._waitingRunFailureData({ environment, task, viewer, code: 'MISSING_RUN_MANAGER' })
        })
      });
    }

    const checkResult = plainObjectOrNull(outcome.checkResult) ?? undefined;
    const plan = await this._terminalSideEffectPlan({ viewer, actor, system, environment, task, outcome, checkResult });
    if (plan.status === 'misconfigured') {
      return this._blockedStart({
        viewer,
        actor,
        environment,
        task,
        reason: this._blockedReason('TASK_MISCONFIGURED', {
          data: this._terminalMisconfigurationData({ environment, task, viewer, outcome: plan })
        })
      });
    }

    const { runData, payload } = this._terminalHistoryWrite({
      viewer,
      actor,
      system,
      environment,
      task,
      outcome,
      checkResult,
      plan
    });
    const richPayload = this._richHistoryPayload({ environment, task, richAttempt });
    Object.assign(runData, richPayload);
    Object.assign(payload, richPayload);
    let run;
    try {
      run = await this.runManager.createTerminalRun(actor, runData, outcome.status, payload);
    } catch (error) {
      return this._blockedStart({
        viewer,
        actor,
        environment,
        task,
        reason: this._blockedReason('RUN_CREATION_FAILED', {
          data: this._waitingRunFailureData({
            environment,
            task,
            viewer,
            code: stringOrNull(error?.code) || stringOrNull(error?.name) || 'RUN_MANAGER_ERROR'
          })
        })
      });
    }

    const richEvidence = await this._commitRichAttempt({ actor, system, environment, task, outcome });
    if (richEvidence && typeof richEvidence === 'object') {
      run = {
        ...run,
        economyEvidence: {
          ...(run.economyEvidence || {}),
          ...richEvidence
        }
      };
    }

    await this._commitTerminalSideEffects({
      viewer,
      actor,
      system,
      environment,
      task,
      outcome,
      checkResult
    });

    return this._terminalStart({
      viewer,
      actor,
      system,
      environment,
      task,
      status: outcome.status,
      run,
      createdResults: plan.createdResults,
      usedCatalysts: plan.usedCatalysts,
      checkResult
    });
  }

  async _terminalSideEffectPlan({ viewer, actor, system, environment, task, outcome, checkResult }) {
    try {
      const createdResults = outcome.status === 'succeeded'
        ? await this._planGatheredResults({ viewer, actor, system, environment, task, outcome })
        : [];
      if (createdResults?.status === 'misconfigured') return createdResults;

      const usedCatalysts = await this._planTerminalCatalysts({
        viewer,
        actor,
        system,
        environment,
        task,
        outcome,
        checkResult
      });
      if (usedCatalysts?.status === 'misconfigured') return usedCatalysts;

      return {
        status: 'ready',
        createdResults,
        usedCatalysts
      };
    } catch (error) {
      return misconfiguredOutcome({
        code: stringOrNull(error?.code) || stringOrNull(error?.name) || 'TERMINAL_PLAN_FAILED',
        message: stringOrNull(error?.message) || 'Terminal side-effect planning failed'
      });
    }
  }

  _terminalHistoryWrite({ viewer, system, environment, task, outcome, checkResult, plan }) {
    const opaqueBlind = this._isOpaqueBlindTask({ environment, viewer });
    if (opaqueBlind) {
      return {
        runData: {
          craftingSystemId: stringOrNull(system.id),
          environmentId: stringOrNull(environment.id),
          taskId: 'blind'
        },
        payload: {
          createdResults: [],
          usedCatalysts: [],
          checkResult: { blind: true, status: outcome.status },
          ...this._richHistoryPayload({ environment, task })
        }
      };
    }

    const payload = {
      createdResults: plan.createdResults,
      usedCatalysts: plan.usedCatalysts
    };
    if (checkResult !== undefined) payload.checkResult = checkResult;
    Object.assign(payload, this._richHistoryPayload({ environment, task }));

    return {
      runData: {
        craftingSystemId: stringOrNull(system.id),
        environmentId: stringOrNull(environment.id),
        taskId: stringOrNull(task.id)
      },
      payload
    };
  }

  _richHistoryPayload({ environment, task, richAttempt = null }) {
    if (!hasRichGatheringData(environment, task)) return {};
    return {
      economyEvidence: plainObjectOrNull(richAttempt?.evidence) || this._richListingMetadata({ environment, task }),
      conditionSnapshot: plainObjectOrNull(environment?.conditions) || {},
      riskLevel: stringOrNull(task?.riskOverride) || stringOrNull(environment?.risk) || 'safe'
    };
  }

  async _commitRichAttempt({ actor, system, environment, task, outcome }) {
    if (typeof this.richState?.commitAcceptedAttempt !== 'function') return null;
    return this.richState.commitAcceptedAttempt({ actor, system, environment, task, outcome });
  }

  async _commitTerminalSideEffects({ viewer, actor, system, environment, task, outcome, checkResult }) {
    if (outcome.status === 'succeeded') {
      await this._createGatheredResults({ viewer, actor, system, environment, task, outcome });
    }
    await this._applyTerminalCatalysts({
      viewer,
      actor,
      system,
      environment,
      task,
      outcome
    });
    if (outcome.status === 'failed') {
      await this._applyFailureFeedback({ viewer, actor, system, environment, task, outcome, checkResult });
    }
  }

  async _resolveRoutedOutcome({ viewer, actor, system, environment, task }) {
    if (typeof this.resultResolver?.resolveRouted !== 'function') {
      return misconfiguredOutcome({
        code: 'MISSING_RESULT_RESOLVER',
        message: 'Routed gathering resolution requires a result resolver'
      });
    }

    const provider = stringOrNull(task.resultSelection?.provider);
    const raw = await this.resultResolver.resolveRouted({
      provider,
      resultSelection: task.resultSelection ?? null,
      resultGroups: normalizeList(task.resultGroups),
      actor,
      viewer,
      system,
      environment,
      task
    });
    return normalizeTerminalOutcome(raw);
  }

  async _resolveProgressiveOutcome({ viewer, actor, system, environment, task }) {
    const checkResult = await this._evaluateGatheringCheck({ actor, viewer, system, environment, task });
    const normalizedCheck = normalizeCheckResult(checkResult);
    if (normalizedCheck.diagnostic) {
      return misconfiguredOutcome({
        code: normalizedCheck.reasonCode || 'CHECK_DIAGNOSTIC',
        message: normalizedCheck.diagnostic.message,
        checkResult: normalizedCheck
      });
    }

    if (normalizedCheck.status === 'failure' || normalizedCheck.success === false) {
      return {
        status: 'failed',
        resultGroups: [],
        checkResult: normalizedCheck
      };
    }

    const raw = typeof this.resultResolver?.resolveProgressive === 'function'
      ? await this.resultResolver.resolveProgressive({
        actor,
        viewer,
        system,
        environment,
        task,
        checkResult: normalizedCheck
      })
      : resolveProgressiveAward({ system, task, checkResult: normalizedCheck });
    const outcome = normalizeTerminalOutcome({
      checkResult: normalizedCheck,
      ...raw
    });
    if (outcome.status === 'misconfigured') return outcome;

    if (outcome.status === 'succeeded' && !hasAwardedResults(outcome.resultGroups) && normalizedCheck.status !== 'success') {
      return {
        ...outcome,
        status: 'failed',
        resultGroups: [],
        checkResult: outcome.checkResult ?? normalizedCheck
      };
    }

    return outcome;
  }

  async _evaluateGatheringCheck({ actor, viewer, system, environment, task }) {
    if (typeof this.evaluator?.evaluateCheck !== 'function') {
      return {
        success: null,
        status: null,
        value: null,
        reasonCode: 'MISCONFIGURED_PROVIDER',
        diagnostic: {
          code: 'MISSING_CHECK_EVALUATOR',
          message: 'Progressive gathering resolution requires a check evaluator'
        }
      };
    }

    return this.evaluator.evaluateCheck({
      check: task.check ?? null,
      actor,
      viewer,
      system,
      environment,
      task
    });
  }

  async _createGatheredResults({ viewer, actor, system, environment, task, outcome }) {
    if (!hasAwardedResults(outcome.resultGroups)) return [];
    if (typeof this.resultCreator?.create !== 'function') {
      return [];
    }
    return this.resultCreator.create({
      actor,
      viewer,
      system,
      environment,
      task,
      resultGroups: outcome.resultGroups,
      checkResult: outcome.checkResult ?? null,
      outcome
    });
  }

  async _planGatheredResults({ viewer, actor, system, environment, task, outcome }) {
    if (!hasAwardedResults(outcome.resultGroups)) return [];
    if (typeof this.resultCreator?.plan !== 'function') return [];
    const planned = await this.resultCreator.plan({
      actor,
      viewer,
      system,
      environment,
      task,
      resultGroups: outcome.resultGroups,
      checkResult: outcome.checkResult ?? null,
      outcome
    });
    if (runHasDiagnostics(planned)) {
      return misconfiguredOutcome({
        code: 'RESULT_PLAN_DIAGNOSTIC',
        diagnostics: planned.diagnostics ?? planned.diagnostic
      });
    }
    return normalizeRunItems(planned, { actor });
  }

  async _applyTerminalCatalysts({ viewer, actor, system, environment, task, outcome }) {
    const catalysts = normalizeList(task.catalysts);
    if (catalysts.length === 0 || typeof this.catalystUsage?.apply !== 'function') {
      return [];
    }

    return this.catalystUsage.apply({
      actor,
      viewer,
      system,
      environment,
      task,
      catalysts,
      outcomeStatus: outcome.status,
      checkResult: outcome.checkResult ?? null
    });
  }

  async _planTerminalCatalysts({ viewer, actor, system, environment, task, outcome, checkResult }) {
    const catalysts = normalizeList(task.catalysts);
    if (catalysts.length === 0 || typeof this.catalystUsage?.plan !== 'function') {
      return [];
    }

    const planned = await this.catalystUsage.plan({
      actor,
      viewer,
      system,
      environment,
      task,
      catalysts,
      outcomeStatus: outcome.status,
      checkResult: checkResult ?? outcome.checkResult ?? null
    });
    if (runHasDiagnostics(planned)) {
      return misconfiguredOutcome({
        code: 'CATALYST_PLAN_DIAGNOSTIC',
        diagnostics: planned.diagnostics ?? planned.diagnostic
      });
    }
    return normalizeRunItems(planned, { actor });
  }

  async _applyFailureFeedback({ viewer, actor, system, environment, task, outcome, checkResult }) {
    if (typeof this.failureFeedback?.apply !== 'function') return null;
    return this.failureFeedback.apply({
      actor,
      viewer,
      system,
      environment,
      task,
      failureOutcome: task.failureOutcome ?? null,
      outcome,
      checkResult: checkResult ?? null
    });
  }

  _terminalStart({ viewer, actor, system, environment, task, status, run, createdResults, usedCatalysts, checkResult }) {
    const opaqueBlind = this._isOpaqueBlindTask({ environment, viewer });
    const publicRun = opaqueBlind
      ? redactBlindTerminalRun(run)
      : enrichPublicTerminalRun(run, { createdResults, usedCatalysts, checkResult });
    const response = {
      accepted: true,
      started: true,
      state: status,
      viewerId: idOf(viewer),
      actorId: idOf(actor),
      craftingSystemId: stringOrNull(system.id),
      environmentId: stringOrNull(environment.id),
      taskId: opaqueBlind ? null : stringOrNull(task.id),
      runId: stringOrNull(run?.id),
      runStatus: stringOrNull(run?.status) || status,
      run: publicRun,
      blockedReasons: []
    };

    if (!opaqueBlind) {
      response.createdResults = createdResults;
      response.usedCatalysts = usedCatalysts;
      if (checkResult !== undefined) response.checkResult = checkResult;
    }

    return response;
  }

  async _clearMisconfiguredWaitingRun({ viewer, actor, run, environment, task, errors = null, outcome = null }) {
    if (typeof this.runManager?.clearActiveRun !== 'function') {
      throw Object.assign(new Error('Gathering timed misconfiguration requires active-run cleanup'), {
        code: 'MISSING_CLEAR_ACTIVE_RUN'
      });
    }

    await this.runManager.clearActiveRun(actor, run.id);
    const reason = this._blockedReason('TASK_MISCONFIGURED', {
      data: this._terminalMisconfigurationData({
        environment,
        task,
        viewer,
        outcome: outcome ?? {
          code: 'TASK_MISCONFIGURED',
          diagnostics: normalizeList(errors).map(error => ({ code: 'TASK_MISCONFIGURED', message: error }))
        }
      })
    });

    return {
      accepted: false,
      started: false,
      state: 'cleared',
      viewerId: idOf(viewer),
      actorId: idOf(actor),
      environmentId: stringOrNull(run?.environmentId),
      taskId: this._isOpaqueBlindTask({ environment, viewer }) ? null : stringOrNull(run?.taskId),
      runId: stringOrNull(run?.id),
      runStatus: 'cleared',
      blockedReasons: [reason]
    };
  }

  async _cancelMissingReferenceRun({ viewer, actor, run, resolved }) {
    const opaqueBlind = resolved.environment && this._isOpaqueBlindTask({ environment: resolved.environment, viewer });
    const cancelledRun = await this.runManager.cancelRun(actor, run.id, opaqueBlind
      ? {
          terminalRunData: {
            craftingSystemId: stringOrNull(run?.craftingSystemId),
            environmentId: stringOrNull(run?.environmentId),
            taskId: 'blind'
          },
          payload: {
            createdResults: [],
            usedCatalysts: [],
            checkResult: { blind: true, status: 'cancelled' }
          }
        }
      : {});
    if (!cancelledRun) {
      throw Object.assign(new Error('Timed gathering cancellation history was not written'), {
        code: 'TERMINAL_HISTORY_NOT_WRITTEN'
      });
    }

    return this._timedCancellation({
      viewer,
      actor,
      run,
      cancelledRun,
      reason: resolved.missingReference,
      environment: resolved.environment ?? null
    });
  }

  _timedCancellation({ viewer, actor, run, cancelledRun, reason, environment = null }) {
    const opaqueBlind = environment && this._isOpaqueBlindTask({ environment, viewer });
    return {
      accepted: true,
      started: true,
      state: 'cancelled',
      viewerId: idOf(viewer),
      actorId: idOf(actor),
      craftingSystemId: stringOrNull(run?.craftingSystemId),
      environmentId: stringOrNull(run?.environmentId),
      taskId: opaqueBlind ? null : stringOrNull(run?.taskId),
      runId: stringOrNull(run?.id),
      runStatus: 'cancelled',
      run: opaqueBlind ? redactBlindTerminalRun(cancelledRun) : cancelledRun,
      blockedReasons: [
        this._blockedReason('MISSING_REFERENCE', {
          data: { reference: reason }
        })
      ]
    };
  }

  _terminalMisconfigurationData({ environment, task, viewer, outcome }) {
    if (this._isOpaqueBlindTask({ environment, viewer })) return null;
    const data = {
      taskId: stringOrNull(task?.id),
      code: stringOrNull(outcome?.code)
    };
    const safeDiagnostics = sanitizeDiagnostics(outcome?.diagnostics ?? outcome?.diagnostic);
    if (safeDiagnostics.length > 0) data.diagnostics = safeDiagnostics;
    return data;
  }

  _acceptedStart({ viewer, actor, system, environment, task }) {
    return {
      accepted: true,
      started: false,
      state: 'ready',
      viewerId: idOf(viewer),
      actorId: idOf(actor),
      craftingSystemId: stringOrNull(system.id),
      environmentId: stringOrNull(environment.id),
      taskId: stringOrNull(task.id),
      blockedReasons: []
    };
  }

  _startedWaitingStart({ viewer, actor, system, environment, task, run }) {
    const opaqueBlind = this._isOpaqueBlindTask({ environment, viewer });
    const publicRun = opaqueBlind ? redactBlindRun(run) : run;
    return {
      accepted: true,
      started: true,
      state: 'waitingTime',
      viewerId: idOf(viewer),
      actorId: idOf(actor),
      craftingSystemId: stringOrNull(system.id),
      environmentId: stringOrNull(environment.id),
      taskId: opaqueBlind ? null : stringOrNull(task.id),
      runId: stringOrNull(run?.id),
      runStatus: stringOrNull(run?.status) || 'waitingTime',
      timeGate: plainObjectOrNull(run?.timeGate),
      run: publicRun,
      blockedReasons: []
    };
  }

  _blockedStart({ viewer, actor = null, environment = null, task = null, reason }) {
    const opaqueBlind = environment && task && this._isOpaqueBlindTask({ environment, viewer });
    return {
      accepted: false,
      started: false,
      state: reason.code,
      viewerId: idOf(viewer),
      actorId: actor ? idOf(actor) : null,
      environmentId: environment ? stringOrNull(environment.id) : null,
      taskId: opaqueBlind ? null : (task ? stringOrNull(task.id) : null),
      blockedReasons: [reason]
    };
  }

  _blindTaskData({ environment, task, viewer }) {
    return this._isOpaqueBlindTask({ environment, viewer }) ? null : { taskId: task.id };
  }

  _waitingRunFailureData({ environment, task, viewer, code, diagnostics = null }) {
    if (this._isOpaqueBlindTask({ environment, viewer })) return null;
    const data = {
      taskId: stringOrNull(task?.id),
      code: stringOrNull(code)
    };
    const safeDiagnostics = sanitizeDiagnostics(diagnostics);
    if (safeDiagnostics.length > 0) data.diagnostics = safeDiagnostics;
    return data;
  }

  _emptyListing({ viewer, actor = null, selectableActors = [], reason }) {
    return {
      visible: true,
      attemptable: false,
      blockedReasons: [reason],
      state: reason.code,
      viewerId: idOf(viewer),
      selectedActorId: actor ? idOf(actor) : null,
      selectableActors: selectableActors.map(actorToOption),
      environments: [],
      activeRuns: actor ? this._activeRunModels({ actor, viewer }) : [],
      history: actor ? this._historyModels({ actor, viewer }) : []
    };
  }

  _emptyVisibilityReason(hidden) {
    if (hidden.blind > 0 && hidden.targeted === 0) {
      return this._blockedReason('BLIND_SOLE_TASK_HIDDEN');
    }
    if (hidden.targeted > 0 && hidden.blind === 0) {
      return this._blockedReason('NO_VISIBLE_TARGETED_TASKS');
    }
    return this._blockedReason('NO_VISIBLE_TASKS');
  }

  _blockedReason(code, { messageKey = null, message = null, data = null } = {}) {
    const normalizedCode = stringOrEmpty(code) || 'BLOCKED';
    const key = messageKey || DEFAULT_BLOCKED_REASON_KEYS[normalizedCode] || `FABRICATE.Gathering.Blocked.${normalizedCode}`;
    return {
      code: normalizedCode,
      messageKey: key,
      message: message || this.localize(key, data ?? undefined),
      data: data ?? null
    };
  }
}

function normalizeGateResult(result) {
  if (result === true) return { allowed: true };
  if (result === false || !result || typeof result !== 'object') {
    return { allowed: false, code: 'SCENE_TOKEN_BLOCKED' };
  }
  return {
    allowed: result.allowed === true || result.attemptable === true,
    code: stringOrNull(result.code || result.reasonCode) || 'SCENE_TOKEN_BLOCKED',
    messageKey: stringOrNull(result.messageKey),
    message: stringOrNull(result.message),
    data: plainObjectOrNull(result.data)
  };
}

function normalizeCatalystResult(result) {
  if (result === true) return { available: true, missing: [] };
  if (result === false || !result || typeof result !== 'object') {
    return { available: false, missing: [] };
  }
  return {
    available: result.available === true || result.valid === true,
    missing: normalizeList(result.missing)
  };
}

function normalizeTerminalOutcome(raw) {
  if (!raw || typeof raw !== 'object') {
    return misconfiguredOutcome({
      code: 'MALFORMED_OUTCOME',
      message: 'Gathering resolution returned no outcome'
    });
  }

  if (hasOutcomeDiagnostics(raw)) {
    return misconfiguredOutcome({
      code: stringOrNull(raw.code || raw.reasonCode) || 'RESOLUTION_DIAGNOSTIC',
      message: stringOrNull(raw.message),
      diagnostic: raw.diagnostic,
      diagnostics: raw.diagnostics,
      checkResult: raw.checkResult
    });
  }

  const disposition = normalizeOutcomeText(raw.status ?? raw.disposition);
  if (['misconfigured', 'misconfiguration', 'error'].includes(disposition)) {
    return misconfiguredOutcome({
      code: stringOrNull(raw.code || raw.reasonCode) || 'RESOLUTION_MISCONFIGURED',
      message: stringOrNull(raw.message || raw.error),
      checkResult: raw.checkResult
    });
  }

  const outcomeText = normalizeOutcomeText(raw.outcome ?? raw.outcomeName ?? raw.drawnName);
  const failed = raw.success === false ||
    raw.failure === true ||
    ['failed', 'failure', 'fail', 'miss'].includes(disposition) ||
    FAILURE_KEYWORDS.has(outcomeText);
  if (failed) {
    return {
      status: 'failed',
      resultGroups: [],
      checkResult: normalizeOutcomeCheckResult(raw)
    };
  }

  const resultGroups = normalizeOutcomeGroups(raw);
  const succeeded = raw.success === true ||
    ['succeeded', 'success', 'passed', 'pass'].includes(disposition) ||
    resultGroups.length > 0;
  if (succeeded) {
    return {
      status: 'succeeded',
      resultGroups,
      checkResult: normalizeOutcomeCheckResult(raw)
    };
  }

  return misconfiguredOutcome({
    code: 'MALFORMED_OUTCOME',
    message: 'Gathering resolution did not return a terminal status',
    checkResult: raw.checkResult
  });
}

function normalizeOutcomeGroups(raw) {
  const groups = normalizeList(raw.resultGroups ?? raw.groups);
  if (groups.length > 0) return groups;
  const group = raw.resultGroup ?? raw.group;
  return group && typeof group === 'object' ? [group] : [];
}

function normalizeOutcomeCheckResult(raw) {
  if (raw.checkResult && typeof raw.checkResult === 'object') {
    return cloneJson(raw.checkResult);
  }

  const data = {};
  for (const field of ['outcome', 'outcomeName', 'drawnName', 'description']) {
    if (raw[field] !== undefined && raw[field] !== null) data[field] = raw[field];
  }
  const meta = plainObjectOrNull(raw.meta ?? raw.resolutionMeta);
  if (meta) data.meta = meta;
  return Object.keys(data).length > 0 ? data : undefined;
}

function normalizeCheckResult(raw) {
  if (!raw || typeof raw !== 'object') {
    return {
      success: null,
      status: null,
      value: null,
      reasonCode: 'MALFORMED_RESULT',
      diagnostic: { code: 'MALFORMED_RESULT' }
    };
  }

  const value = Number(raw.value);
  const status = normalizeCheckStatus(raw.status);
  return {
    success: raw.success === null || raw.success === undefined ? null : raw.success === true,
    status,
    value: Number.isFinite(value) ? value : null,
    description: stringOrEmpty(raw.description),
    data: plainObjectOrNull(raw.data) ?? {},
    reasonCode: stringOrNull(raw.reasonCode),
    diagnostic: raw.diagnostic ?? null
  };
}

function normalizeCheckStatus(status) {
  if (status === undefined || status === null || status === '') return null;
  const normalized = normalizeOutcomeText(status);
  if (['success', 'succeeded', 'pass', 'passed'].includes(normalized)) return 'success';
  if (['failure', 'failed', 'fail'].includes(normalized)) return 'failure';
  return stringOrNull(status);
}

function hasOutcomeDiagnostics(raw) {
  return Boolean(raw.diagnostic) || normalizeList(raw.diagnostics).length > 0;
}

function misconfiguredOutcome({ code = null, message = null, diagnostic = null, diagnostics = null, checkResult = null } = {}) {
  const outcome = {
    status: 'misconfigured',
    resultGroups: [],
    code: stringOrNull(code) || 'TASK_MISCONFIGURED',
    checkResult: checkResult && typeof checkResult === 'object' ? cloneJson(checkResult) : undefined
  };
  const normalizedDiagnostics = normalizeList(diagnostics);
  if (diagnostic) normalizedDiagnostics.push(diagnostic);
  if (message || normalizedDiagnostics.length > 0) {
    outcome.diagnostics = [
      ...normalizedDiagnostics,
      ...(message ? [{ code: outcome.code, message }] : [])
    ];
  }
  return outcome;
}

function resolveProgressiveAward({ system, task, checkResult }) {
  const group = normalizeList(task.resultGroups)[0];
  if (!group) {
    return misconfiguredOutcome({
      code: 'MISSING_RESULT_GROUP',
      message: 'Progressive gathering requires one result group'
    });
  }

  const value = Number(checkResult?.value);
  if (!Number.isFinite(value)) {
    return misconfiguredOutcome({
      code: 'MALFORMED_CHECK_RESULT',
      message: 'Progressive gathering check must return a numeric value',
      checkResult
    });
  }

  const awardMode = ['partial', 'equal', 'exceed'].includes(task?.progressive?.awardMode)
    ? task.progressive.awardMode
    : 'equal';
  const awarded = [];
  let remaining = Math.max(0, value);

  for (const result of normalizeList(group.results)) {
    const cost = difficultyForResult(system, result);
    if (!Number.isFinite(cost) || cost < 1) {
      return misconfiguredOutcome({
        code: 'INVALID_PROGRESSIVE_DIFFICULTY',
        message: 'Progressive gathering result references a component without valid difficulty',
        checkResult
      });
    }

    if (awardMode === 'exceed') {
      if (remaining > cost) {
        awarded.push(result);
        remaining -= cost;
      } else {
        break;
      }
      continue;
    }

    if (awardMode === 'partial') {
      if (remaining >= cost) {
        awarded.push(result);
        remaining -= cost;
        continue;
      }
      if (remaining > 0) {
        awarded.push(result);
        remaining = 0;
      }
      break;
    }

    if (remaining >= cost) {
      awarded.push(result);
      remaining -= cost;
    } else {
      break;
    }
  }

  return {
    status: awarded.length > 0 || checkResult?.status === 'success' ? 'succeeded' : 'failed',
    resultGroups: [{ ...group, results: awarded }],
    checkResult: {
      ...checkResult,
      resolutionMeta: {
        awardedResultIds: awarded.map(result => result.id),
        remaining
      }
    }
  };
}

function difficultyForResult(system, result) {
  const componentId = stringOrNull(result?.componentId ?? result?.systemItemId);
  if (!componentId) return null;
  const component = normalizeList(system?.components).find(entry => entry?.id === componentId);
  const difficulty = Number(component?.difficulty);
  return Number.isFinite(difficulty) ? difficulty : null;
}

function hasAwardedResults(resultGroups) {
  return normalizeList(resultGroups).some(group => normalizeList(group?.results).length > 0);
}

function normalizeVisibilityResult(result) {
  if (result === true) return { visible: true, reasonCode: 'VISIBLE', diagnostic: null };
  if (result === false || !result || typeof result !== 'object') {
    return { visible: false, reasonCode: 'HIDDEN', diagnostic: null };
  }
  return {
    visible: result.visible === true,
    reasonCode: stringOrNull(result.reasonCode),
    description: stringOrEmpty(result.description),
    diagnostic: result.diagnostic ?? null
  };
}

function validateTaskConfiguration(task) {
  const errors = [];
  const resolutionMode = stringOrNull(task?.resolutionMode);
  const resultGroups = normalizeList(task?.resultGroups);

  if (resolutionMode !== 'routed' && resolutionMode !== 'progressive') {
    errors.push('Gathering task requires a routed or progressive resolution mode');
    return errors;
  }

  if (resultGroups.length === 0) {
    errors.push('Gathering task requires at least one result group');
  }
  errors.push(...validateResultGroupNames(resultGroups));

  if (resolutionMode === 'routed') {
    const provider = stringOrNull(task?.resultSelection?.provider);
    if (provider !== 'macroOutcome' && provider !== 'rollTableOutcome') {
      errors.push('Routed gathering task requires a supported result selection provider');
    }
    if (provider === 'macroOutcome' && !stringOrNull(task?.resultSelection?.macroUuid)) {
      errors.push('Routed macro outcome gathering task requires a macro UUID');
    }
    if (provider === 'rollTableOutcome' && !stringOrNull(task?.resultSelection?.rollTableUuid)) {
      errors.push('Routed roll table outcome gathering task requires a roll table UUID');
    }
  }

  if (resolutionMode === 'progressive') {
    if (!task?.check || typeof task.check !== 'object') {
      errors.push('Progressive gathering task requires a check');
    }
    if (!task?.progressive || typeof task.progressive !== 'object') {
      errors.push('Progressive gathering task requires progressive configuration');
    }
    if (resultGroups.length !== 1) {
      errors.push('Progressive gathering task requires exactly one result group');
    }
    if (resultGroups.length === 1 && normalizeList(resultGroups[0]?.results).length === 0) {
      errors.push('Progressive gathering task requires at least one result');
    }
  }

  if (hasTimeRequirement(task) && !normalizeTimeRequirement(task.timeRequirement)) {
    errors.push('Gathering time requirement must include at least one positive duration field');
  }

  if (task?.failureOutcome) {
    errors.push(...validateFailureOutcome(task.failureOutcome));
  }

  return errors;
}

function validateFailureOutcome(failureOutcome) {
  const errors = [];
  const mode = stringOrNull(failureOutcome?.mode);
  if (mode !== 'text' && mode !== 'macro') {
    errors.push('Gathering failureOutcome.mode must be text or macro');
  }
  if (mode === 'text' && !stringOrNull(failureOutcome?.text)) {
    errors.push('Gathering failureOutcome text mode requires text');
  }
  if (mode === 'macro' && !stringOrNull(failureOutcome?.macroUuid)) {
    errors.push('Gathering failureOutcome macro mode requires macroUuid');
  }
  return errors;
}

function validateResultGroupNames(resultGroups) {
  const errors = [];
  const seen = new Map();

  for (const group of resultGroups) {
    const normalizedName = normalizeOutcomeText(group?.name);
    if (!normalizedName) {
      errors.push('Gathering result groups require names');
      continue;
    }
    if (FAILURE_KEYWORDS.has(normalizedName)) {
      errors.push(`Gathering result group "${group.name}" collides with reserved failure keyword`);
    }
    if (seen.has(normalizedName)) {
      errors.push(`Gathering result group "${group.name}" duplicates "${seen.get(normalizedName)}"`);
    } else {
      seen.set(normalizedName, group.name);
    }
  }

  return errors;
}

function hasTimeRequirement(task) {
  return task?.timeRequirement !== null && task?.timeRequirement !== undefined;
}

function normalizeTimeRequirement(timeRequirement = null) {
  if (!timeRequirement || typeof timeRequirement !== 'object') return null;

  const normalized = {};
  for (const field of ['minutes', 'hours', 'days', 'months', 'years']) {
    const value = Number(timeRequirement[field]);
    if (Number.isFinite(value) && value > 0) normalized[field] = value;
  }

  return Object.keys(normalized).length > 0 ? normalized : null;
}

function runHasDiagnostics(run) {
  if (!run || typeof run !== 'object') return false;
  if (run.diagnostic) return true;
  return normalizeList(run.diagnostics).length > 0;
}

function sanitizeDiagnostics(diagnostics) {
  return normalizeList(diagnostics)
    .map(diagnostic => {
      if (!diagnostic || typeof diagnostic !== 'object') return null;
      return {
        code: stringOrNull(diagnostic.code || diagnostic.reasonCode),
        messageKey: stringOrNull(diagnostic.messageKey)
      };
    })
    .filter(diagnostic => diagnostic?.code || diagnostic?.messageKey);
}

function redactBlindRun(run) {
  if (!run || typeof run !== 'object') return run;
  const redacted = { ...run };
  redacted.taskId = null;
  delete redacted.diagnostic;
  delete redacted.diagnostics;
  return redacted;
}

function redactBlindTerminalRun(run) {
  const redacted = redactBlindRun(run);
  if (!redacted || typeof redacted !== 'object') return redacted;
  delete redacted.checkResult;
  delete redacted.usedCatalysts;
  delete redacted.createdResults;
  return redacted;
}

function enrichPublicTerminalRun(run, { createdResults, usedCatalysts, checkResult }) {
  if (!run || typeof run !== 'object') return run;
  const enriched = {
    ...run,
    createdResults,
    usedCatalysts
  };
  if (checkResult !== undefined) enriched.checkResult = checkResult;
  return enriched;
}

function redactRichEvidence(evidence = {}) {
  const redacted = cloneJson(evidence) || {};
  if (redacted.node) {
    redacted.node = { available: Number(redacted.node.remaining ?? redacted.node.current ?? 0) > 0 };
  }
  delete redacted.encounterOutcome;
  delete redacted.revealEvents;
  return redacted;
}

function hasRichGatheringData(environment, task) {
  return Boolean(
    stringOrNull(environment?.img) ||
    stringOrNull(environment?.region) ||
    stringOrNull(environment?.biome) ||
    (stringOrNull(environment?.risk) && environment.risk !== 'safe') ||
    (stringOrNull(environment?.economyMode) && environment.economyMode !== 'time') ||
    Object.values(plainObjectOrNull(environment?.conditions) || {}).some(value => stringOrNull(value)) ||
    task?.nodes ||
    task?.attemptLimit ||
    Number(task?.staminaCost || 0) > 0 ||
    stringOrNull(task?.riskOverride) ||
    task?.encounters ||
    task?.reveal ||
    task?.blindSelection
  );
}

async function callMaybe(fn, payload) {
  return typeof fn === 'function' ? fn(payload) : [];
}

function normalizeActorList(value) {
  return normalizeList(value).filter(Boolean);
}

function normalizeList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (value instanceof Map) return Array.from(value.values());
  if (typeof value.values === 'function') return Array.from(value.values());
  if (typeof value[Symbol.iterator] === 'function') return Array.from(value);
  return [];
}

function actorToOption(actor) {
  return {
    id: idOf(actor),
    uuid: stringOrNull(actor?.uuid),
    name: stringOrEmpty(actor?.name),
    img: stringOrNull(actor?.img)
  };
}

function idOf(document) {
  return stringOrNull(document?.id) || stringOrNull(document?.uuid);
}

function actorMatchesId(actor, actorId) {
  const id = String(actorId);
  return actor?.id === id || actor?.uuid === id;
}

function sameActor(left, right) {
  return Boolean(left && right && (left === right || left.id === right.id || left.uuid === right.uuid));
}

function sameActorUuid(actor, actorUuid) {
  const runActorUuid = stringOrNull(actorUuid);
  if (!runActorUuid) return false;
  return stringOrNull(actor?.uuid) === runActorUuid;
}

function uniqueReasons(reasons) {
  const byCode = new Map();
  for (const reason of reasons) {
    if (!reason?.code || byCode.has(reason.code)) continue;
    byCode.set(reason.code, reason);
  }
  return Array.from(byCode.values());
}

function normalizeRunItems(items, { actor = null } = {}) {
  return normalizeList(items)
    .filter(item => item && typeof item === 'object')
    .map(item => {
      const source = item.item && typeof item.item === 'object' ? item.item : item;
      const actorUuid = stringOrNull(item.actorUuid) || stringOrNull(item.actor?.uuid) || stringOrNull(actor?.uuid);
      const itemUuid = stringOrNull(item.itemUuid) || stringOrNull(source.uuid);
      const quantity = Number(item.quantity ?? source.system?.quantity ?? 1);
      return {
        actorUuid,
        itemUuid,
        quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1
      };
    })
    .filter(item => item.actorUuid && item.itemUuid);
}

function normalizeOutcomeText(value) {
  return String(value ?? '').trim().toLowerCase();
}

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function plainObjectOrNull(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return { ...value };
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function stringOrNull(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function stringOrEmpty(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function defaultLocalize(key) {
  return key;
}
