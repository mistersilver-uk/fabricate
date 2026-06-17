import {
  actorToOption,
  callMaybe,
  cloneJson,
  idOf,
  normalizeActorList,
  normalizeList,
  normalizeStringList,
  numberOrNull,
  plainObjectOrNull,
  redactRichEvidence,
  stringOrEmpty,
  stringOrNull,
  stripRuntimeSnapshotFromRun,
  uniqueReasons,
} from './gatheringEngineInternals.js';
import { isGatheringRealmsEnabled } from './gatheringRealms.js';

const BLIND_TASK_LABEL_KEY = 'FABRICATE.Gathering.BlindTaskLabel';
const DEFAULT_DROP_IMG = 'icons/svg/item-bag.svg';
// Player-facing event visibility tiers. A GM always resolves to 'full'; a
// non-GM viewer falls back to the more-restrictive 'encounterChance' when the
// rule is missing, so absent rules never leak the full event list.
const GATHERING_EVENT_VISIBILITIES = new Set(['dangerLevelOnly', 'encounterChance', 'full']);

/**
 * Player-facing listing / view-model construction extracted from GatheringEngine
 * (issue 375). Owns `listForActor` and `getTaskDropBreakdown` plus the
 * environment/run/history/task/event model builders that feed the UI services
 * bag. The engine keeps thin public delegators (`listForActor` /
 * `getTaskDropBreakdown`) that forward to this collaborator, so external callers
 * that dispatch by method name on the engine are unaffected.
 *
 * Like GatheringWorldTimeProcessor (issue 374) this is a one-directional engine
 * → collaborator: it NEVER imports or calls back into the engine. The
 * read-side model builders move here verbatim; the shared helpers the write
 * path also consumes (selection, environment resolution, system accessors,
 * task/event blocked-reason and tool resolution, blind/realm redaction) STAY on
 * the engine and are injected as bound callbacks so there is no dependency cycle
 * and no duplicated definition. Output shapes are byte-identical to the previous
 * in-engine implementation for both GM and player viewers.
 */
export class GatheringListingBuilder {
  /**
   * @param {object} deps
   * @param {object} deps.richState - GatheringRichStateService (preview/reveal/biome/stamina reads).
   * @param {object} deps.runManager - GatheringRunManager (active runs + history).
   * @param {object} deps.environmentStore - GatheringEnvironmentStore (unused directly; reserved for parity with the engine seam).
   * @param {Function} deps.getSelectableActors - Returns the viewer's selectable actors.
   * @param {Function} deps.localize - Localization function (`(key, data?) => string`).
   * @param {Function} deps.resolveSelectedActor - Engine `_resolveSelectedActor`.
   * @param {Function} deps.findEnvironment - Engine `_findEnvironment`.
   * @param {Function} deps.enabledGatheringSystems - Engine `_enabledGatheringSystems` accessor.
   * @param {Function} deps.allSystems - Engine `_allSystems` accessor.
   * @param {Function} deps.composeEnvironment - Engine `_composeEnvironment`.
   * @param {Function} deps.playerCandidateEnvironments - Engine `_playerCandidateEnvironments`.
   * @param {Function} deps.isSelectableActor - Engine `_isSelectableActor`.
   * @param {Function} deps.locationBlockedReasons - Engine `_locationBlockedReasons`.
   * @param {Function} deps.currentRealmSummary - Engine `_currentRealmSummary`.
   * @param {Function} deps.listingRealmContext - Engine `_listingRealmContext`.
   * @param {Function} deps.resolveRealmContext - Engine `_resolveRealmContext`.
   * @param {Function} deps.resolveTaskTools - Engine `_resolveTaskTools`.
   * @param {Function} deps.resolveTaskToolStates - Engine `_resolveTaskToolStates`.
   * @param {Function} deps.componentsById - Engine `_componentsById`.
   * @param {Function} deps.richListingMetadata - Engine `_richListingMetadata`.
   * @param {Function} deps.taskModel - Engine `_taskModel`.
   * @param {Function} deps.taskBlockedReasons - Engine `_taskBlockedReasons`.
   * @param {Function} deps.visibleTaskListings - Engine `_visibleTaskListings`.
   * @param {Function} deps.environmentBlockedReasons - Engine `_environmentBlockedReasons`.
   * @param {Function} deps.isOpaqueBlindTask - Engine `_isOpaqueBlindTask`.
   * @param {Function} deps.resolveRevealPolicy - Engine `_resolveRevealPolicy`.
   * @param {Function} deps.blockedReason - Engine `_blockedReason`.
   */
  constructor({
    richState = null,
    runManager = null,
    environmentStore = null,
    getSelectableActors = null,
    localize = (key) => key,
    resolveSelectedActor = null,
    findEnvironment = null,
    enabledGatheringSystems = null,
    allSystems = null,
    composeEnvironment = null,
    playerCandidateEnvironments = null,
    isSelectableActor = null,
    locationBlockedReasons = null,
    currentRealmSummary = null,
    listingRealmContext = null,
    resolveRealmContext = null,
    resolveTaskTools = null,
    resolveTaskToolStates = null,
    componentsById = null,
    richListingMetadata = null,
    taskModel = null,
    taskBlockedReasons = null,
    visibleTaskListings = null,
    environmentBlockedReasons = null,
    isOpaqueBlindTask = null,
    resolveRevealPolicy = null,
    blockedReason = null,
  } = {}) {
    this.richState = richState;
    this.runManager = runManager;
    this.environmentStore = environmentStore;
    this.getSelectableActors = getSelectableActors;
    this.localize = typeof localize === 'function' ? localize : (key) => key;
    // Injected bound engine callbacks (shared with the write path; the engine
    // owns the definitions). All are plain functions invoked positionally /
    // by-object exactly as the engine called them in-place.
    this._resolveSelectedActor = resolveSelectedActor;
    this._findEnvironment = findEnvironment;
    this._enabledGatheringSystems = enabledGatheringSystems;
    this._allSystems = allSystems;
    this._composeEnvironment = composeEnvironment;
    this._playerCandidateEnvironments = playerCandidateEnvironments;
    this._isSelectableActor = isSelectableActor;
    this._locationBlockedReasons = locationBlockedReasons;
    this._currentRealmSummary = currentRealmSummary;
    this._listingRealmContext = listingRealmContext;
    this._resolveRealmContext = resolveRealmContext;
    this._resolveTaskTools = resolveTaskTools;
    this._resolveTaskToolStates = resolveTaskToolStates;
    this._componentsById = componentsById;
    this._richListingMetadata = richListingMetadata;
    this._taskModel = taskModel;
    this._taskBlockedReasons = taskBlockedReasons;
    this._visibleTaskListings = visibleTaskListings;
    this._environmentBlockedReasons = environmentBlockedReasons;
    this._isOpaqueBlindTask = isOpaqueBlindTask;
    this._resolveRevealPolicy = resolveRevealPolicy;
    this._blockedReason = blockedReason;
  }

  async listForActor({ viewer = null, actor = null, rememberedActorId = null, presentTools = null } = {}) {
    const selectableActors = normalizeActorList(await callMaybe(this.getSelectableActors, { viewer }));
    if (selectableActors.length === 0) {
      return this._emptyListing({
        viewer,
        selectableActors,
        reason: this._blockedReason('NO_SELECTABLE_ACTORS'),
      });
    }

    const selected = this._resolveSelectedActor({
      actor,
      rememberedActorId,
      selectableActors,
      viewer,
    });
    if (selected.blockedReason) {
      return this._emptyListing({
        viewer,
        selectableActors,
        reason: selected.blockedReason,
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
        reason: this._blockedReason('NO_ENVIRONMENTS_CONFIGURED'),
      });
    }

    const hidden = { targeted: 0, blind: 0 };
    const environmentModels = [];
    // Resolve each system's current-realm context at most once per listing call.
    const realmContextCache = new Map();
    for (const environment of environments) {
      const model = await this._buildEnvironmentListing({
        environment,
        system: systems.get(environment.craftingSystemId),
        viewer,
        actor: selectedActor,
        presentTools,
        realmContextCache,
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
        reason: this._emptyVisibilityReason(hidden),
      });
    }

    const attemptable = environmentModels.some((environment) => environment.attemptable);
    const blockedReasons = attemptable
      ? []
      : uniqueReasons(environmentModels.flatMap((environment) => environment.blockedReasons));
    const activeRuns = this._activeRunModels({ actor: selectedActor, viewer });
    const history = this._historyModels({ actor: selectedActor, viewer });
    const gatheringSystems = this._gatheringSystemOptions([
      ...environmentModels,
      ...activeRuns,
      ...history,
    ]);
    const realmContext = this._listingRealmContext({
      environmentModels,
      environments,
      systems,
      viewer,
      actor: selectedActor,
      realmContextCache,
    });

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
      history,
      gatheringSystems,
      realmContext,
    };
  }

  /**
   * Lazily compute the per-drop chance breakdown for ONE task the player has
   * opened in the right-column inspector ("What you might find"). Resolves the
   * selected actor like `listForActor`, recomposes the environment, gates the
   * task to what the viewer may actually see (so a blind/undiscovered task's
   * drops never leak), then delegates the per-drop math to
   * `richState.previewDropBreakdown` and attaches each drop's component image.
   *
   * Returns `{ resolutionMode, awardMode, awardLimit, eventPolicy, drops }`;
   * `drops` is empty when not applicable (no richState, unknown/hidden task,
   * non-d100 task, or no drops).
   *
   * @param {object} options
   * @param {string} options.environmentId
   * @param {string} options.taskId
   * @param {string|null} [options.rememberedActorId]
   * @param {object|null} [options.viewer]
   * @returns {Promise<object>}
   */
  async getTaskDropBreakdown({ environmentId, taskId, rememberedActorId = null, viewer = null } = {}) {
    const empty = {
      resolutionMode: null,
      awardMode: null,
      awardLimit: null,
      eventPolicy: null,
      drops: [],
    };
    if (!environmentId || !taskId || typeof this.richState?.previewDropBreakdown !== 'function')
      return empty;

    const selectableActors = normalizeActorList(await callMaybe(this.getSelectableActors, { viewer }));
    if (selectableActors.length === 0) return empty;
    const selected = this._resolveSelectedActor({
      actor: null,
      rememberedActorId,
      selectableActors,
      viewer,
    });
    if (selected.blockedReason) return empty;
    const actor = selected.actor;

    const systems = this._enabledGatheringSystems();
    const environment = this._playerCandidateEnvironments(systems, viewer).find(
      (candidate) => stringOrNull(candidate?.id) === String(environmentId)
    );
    if (!environment || environment.enabled === false) return empty;
    const system = systems.get(environment.craftingSystemId);

    // Gate to what the viewer can actually see: only task ids the player listing
    // would render (targeted tasks, or revealed blind "discovered" tasks).
    const model = await this._buildEnvironmentListing({ environment, system, viewer, actor });
    if (model.visible !== true) return empty;
    const visibleIds = new Set(
      [...normalizeList(model.tasks), ...normalizeList(model.discoveredTasks)]
        .map((taskModel) => stringOrNull(taskModel?.id))
        .filter(Boolean)
    );
    if (!visibleIds.has(String(taskId))) return empty;

    const task =
      normalizeList(environment.tasks).find((entry) => stringOrNull(entry?.id) === String(taskId)) ??
      null;
    if (!task || task.resolutionMode !== 'd100')
      return { ...empty, resolutionMode: stringOrNull(task?.resolutionMode) };

    const preview = await this.richState.previewDropBreakdown({
      environment,
      task,
      actor,
      viewer,
      system,
    });
    const componentsById = this._componentsById(system);
    const drops = normalizeList(preview?.drops).map((drop) => ({
      ...drop,
      img:
        stringOrNull(componentsById.get(stringOrNull(drop?.componentId))?.img) || DEFAULT_DROP_IMG,
    }));
    return {
      resolutionMode: 'd100',
      successChance: preview?.successChance ?? null,
      awardMode: stringOrNull(preview?.awardMode),
      awardLimit: Number(preview?.awardLimit ?? 1),
      eventPolicy: stringOrNull(preview?.eventPolicy),
      drops,
    };
  }

  _activeRunModels({ actor, viewer }) {
    return normalizeList(this.runManager?.getActiveRuns?.(actor))
      .filter((run) => run?.status === 'waitingTime')
      .map((run) => this._runModel({ run, viewer, terminal: false }))
      .filter(Boolean);
  }

  _historyModels({ actor, viewer }) {
    return normalizeList(this.runManager?.getRunHistory?.(actor, 10))
      .map((run) => this._runModel({ run, viewer, terminal: true }))
      .filter(Boolean);
  }

  _runModel({ run, viewer, terminal }) {
    if (!run?.id) return null;
    const environment = this._findEnvironment(run.environmentId);
    const system = this._allSystems().get(String(run.craftingSystemId));
    const task = environment
      ? (normalizeList(environment.tasks).find((task) => task?.id === run.taskId) ?? null)
      : null;
    const opaqueBlind = this._isOpaqueBlindRun({ environment, run, viewer });
    const status = stringOrNull(run.status);
    const model = {
      id: stringOrNull(run.id),
      status,
      craftingSystemId: stringOrNull(run.craftingSystemId),
      craftingSystemName: stringOrEmpty(system?.name),
      environmentId: stringOrNull(run.environmentId),
      environmentName: stringOrEmpty(environment?.name),
      selectionMode: environment?.selectionMode === 'blind' ? 'blind' : 'targeted',
      blind: opaqueBlind,
      label: opaqueBlind
        ? this.localize(BLIND_TASK_LABEL_KEY)
        : stringOrEmpty(task?.name) || stringOrEmpty(environment?.name) || status,
      taskId: opaqueBlind ? null : stringOrNull(run.taskId),
      startedAtWorldTime: numberOrNull(run.startedAtWorldTime),
      updatedAtWorldTime: numberOrNull(run.updatedAtWorldTime),
    };

    const timeGate = plainObjectOrNull(run.timeGate);
    if (timeGate) model.timeGate = timeGate;
    if (run.economyEvidence && typeof run.economyEvidence === 'object') {
      model.economyEvidence = opaqueBlind
        ? redactRichEvidence(run.economyEvidence)
        : stripRuntimeSnapshotFromRun({ economyEvidence: run.economyEvidence }).economyEvidence;
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
        const usedTools = normalizeList(run.usedTools);
        model.createdResultCount = createdResults.length;
        model.usedToolCount = usedTools.length;
        model.createdResults = cloneJson(createdResults);
        model.usedTools = cloneJson(usedTools);
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

  async _buildEnvironmentListing({
    environment,
    system,
    viewer,
    actor,
    presentTools = null,
    realmContextCache = null,
  }) {
    // Disabled environments surface to every viewer (players and GMs alike) as
    // non-interactive "locked" teasers. Build them before any task-visibility
    // gating so they are never dropped as BLIND_SOLE_TASK_HIDDEN /
    // NO_VISIBLE_TARGETED_TASKS, and carry identity fields only — no tasks,
    // weights, or composition internals leak.
    if (environment.enabled === false) {
      return this._lockedEnvironmentListing({ environment, system });
    }

    // A location-gated environment the party is NOT in is itself the "thing" out
    // of realm: surface it as a locked teaser (identity only, unselectable) with
    // the location reason + travel guidance, rather than a selectable environment
    // whose every task carries the realm block. Evaluated before task-visibility
    // gating so it is never dropped, mirroring the disabled-teaser path above.
    const locationGate = this._locationBlockedReasons({
      environment,
      system,
      viewer,
      actor,
      realmContextCache,
    });
    if (locationGate.location?.gated === true && locationGate.location?.available === false) {
      return this._lockedEnvironmentListing({
        environment,
        system,
        actor,
        blockedReasons: locationGate.blockedReasons,
        location: locationGate.location,
      });
    }

    // Auto-seed the acting character's stamina pool on first sight of a stamina
    // system (e.g. opening the gathering tab), so the displayed pool reflects the
    // rolled max/start. Idempotent — the dice roll persists once.
    if (actor && this.richState?.staminaEnabled?.(environment.craftingSystemId) === true) {
      try {
        await this.richState?.seedActorStaminaIfNeeded?.({
          actor,
          systemId: environment.craftingSystemId,
          system,
        });
      } catch {
        /* display-only: never block the listing on a seed failure */
      }
    }

    const visibleTasks = await this._visibleTaskListings({ environment, system, viewer, actor });
    if (visibleTasks.length === 0) {
      return {
        visible: false,
        hiddenReason:
          environment.selectionMode === 'blind'
            ? 'BLIND_SOLE_TASK_HIDDEN'
            : 'NO_VISIBLE_TARGETED_TASKS',
      };
    }

    const environmentBlockedReasons = await this._environmentBlockedReasons({
      environment,
      system,
      viewer,
      actor,
      realmContextCache,
    });
    // Redaction-safe location field — reuse the gate computed above (here the
    // environment is realm-available, so this is the ungated/available shape).
    const location = locationGate.location;
    // Party current-realm summary for the header bar (regardless of this
    // environment's gating), so the player app can show the current realm or
    // "no realm selected" when the realm/travel subsystem is enabled.
    const realmSummary = this._currentRealmSummary({
      environment,
      system,
      viewer,
      actor,
      realmContextCache,
    });
    // Stash each visible task's blocked reasons so both the player task models
    // and the blind "discovered tasks" list draw from one computation — no
    // extra visibility pass that could surface unrevealed tasks.
    const taskEntries = [];
    for (const visibleTask of visibleTasks) {
      const taskBlockedReasons = [
        ...environmentBlockedReasons,
        ...(await this._taskBlockedReasons({
          environment,
          system,
          task: visibleTask.task,
          actor,
          viewer,
          presentTools,
        })),
      ];
      taskEntries.push({
        task: visibleTask.task,
        visibility: visibleTask.visibility,
        blockedReasons: taskBlockedReasons,
      });
    }
    const taskModels = taskEntries.map((entry) =>
      this._taskModel({
        task: entry.task,
        environment,
        actor,
        viewer,
        visibility: entry.visibility,
        blockedReasons: entry.blockedReasons,
        tools: this._resolveTaskToolStates({
          actor,
          system,
          environment,
          task: entry.task,
          presentTools,
        }),
      })
    );
    // Refine the displayed stamina cost to the viewing character's effective
    // cost (base + per-actor modifiers); the sync model carries the base.
    for (const [i, taskModel] of taskModels.entries()) {
      await this._applyListingStaminaCost(taskModel, {
        system,
        environment,
        actor,
        viewer,
        task: taskEntries[i].task,
      });
    }

    const attemptable = taskModels.some((task) => task.attemptable);
    const blockedReasons =
      environmentBlockedReasons.length > 0
        ? environmentBlockedReasons
        : attemptable
          ? []
          : uniqueReasons(taskModels.flatMap((task) => task.blockedReasons));

    // A non-GM viewer of a blind environment sees one opaque "Attempt gathering"
    // action (the collapsed task list) plus the transparent rows for tasks they
    // have already discovered. Targeted environments and GM viewers expose the
    // full task list and no separate discovered list.
    const blindForViewer = environment.selectionMode === 'blind' && viewer?.isGM !== true;
    const listedTasks = blindForViewer
      ? taskModels.length > 0
        ? [taskModels[0]]
        : []
      : taskModels;
    const discoveredTasks = blindForViewer
      ? await this._discoveredTaskModels({
          environment,
          system,
          viewer,
          actor,
          taskEntries,
          environmentBlockedReasons,
          presentTools,
        })
      : [];

    // The GM-configured event visibility tier further restricts what a non-GM
    // viewer sees, independent of the blind/targeted redaction above: only
    // 'full' exposes individual events, and 'dangerLevelOnly' also hides the
    // environment encounter-chance bar (signalled by a null eventChance). A GM
    // always resolves to 'full'.
    const eventVisibility = this._resolveEventVisibility(environment, viewer);

    // Individual events are read-only player-facing models. They are redacted
    // for a non-GM viewer of a blind environment (mirroring the collapsed task
    // list) or whenever the visibility tier is not 'full', and surfaced in full
    // for targeted environments and GM viewers.
    const listedEvents =
      blindForViewer || eventVisibility !== 'full'
        ? []
        : normalizeList(environment.events)
            .filter((event) => event?.enabled !== false)
            .map((event) => this._eventModel(event, environment));

    const biomes = normalizeStringList(environment.biomes ?? environment.biome);
    const dangerTags = normalizeStringList(environment.dangerTags ?? environment.risk);
    return {
      id: stringOrNull(environment.id),
      craftingSystemId: stringOrNull(environment.craftingSystemId),
      craftingSystemName: stringOrEmpty(system?.name),
      name: stringOrEmpty(environment.name),
      description: stringOrEmpty(environment.description),
      img: stringOrNull(environment.img),
      region: stringOrEmpty(environment.region),
      biome: stringOrEmpty(environment.biome) || biomes[0] || '',
      biomes,
      dangerTags,
      risk: stringOrNull(environment.risk) || dangerTags[0] || 'safe',
      economyMode: this.richState?.economyMode?.(environment.craftingSystemId) || 'none',
      staminaEnabled: this.richState?.staminaEnabled?.(environment.craftingSystemId) === true,
      nodesEnabled: this.richState?.nodesEnabled?.(environment.craftingSystemId) === true,
      weatherEnabled: this.richState?.weatherEnabled?.(environment.craftingSystemId) !== false,
      timeOfDayEnabled: this.richState?.timeOfDayEnabled?.(environment.craftingSystemId) !== false,
      staminaPool:
        this.richState?.staminaEnabled?.(environment.craftingSystemId) === true && actor
          ? this.richState?.getActorStamina?.(actor, stringOrNull(environment.craftingSystemId)) ||
            null
          : null,
      conditions: plainObjectOrNull(environment.conditions) || {},
      realmsEnabled: realmSummary.realmsEnabled,
      currentRealms: realmSummary.currentRealms,
      selectionMode: environment.selectionMode === 'blind' ? 'blind' : 'targeted',
      sceneUuid: stringOrNull(environment.sceneUuid),
      visible: true,
      attemptable,
      eventChance:
        eventVisibility === 'dangerLevelOnly' ? null : this._environmentEventChance(environment),
      events: listedEvents,
      eventVisibility,
      blockedReasons,
      location,
      tasks: listedTasks,
      discoveredTasks,
      ...this._playerListingFields({ environment, actor, locked: false }),
    };
  }

  /**
   * Build transparent, individually-attemptable task models for the tasks a
   * non-GM viewer has already revealed in a blind environment (the "Discovered
   * Tasks" list). Returns `[]` when the effective reveal policy is `never` or
   * nothing has been revealed.
   *
   * Models are built only from `taskEntries` — the already-computed visible
   * tasks — intersected with the revealed task ids, so an unrevealed (or
   * never-visible) task can never leak into the discovered list. Blocked reasons
   * are recomputed with `transparent: true` so each row carries its real
   * required weather/time and missing-tool details.
   *
   * @param {object} args
   * @param {object} args.environment Composed blind environment.
   * @param {object} args.system Owning crafting system.
   * @param {object} args.viewer Foundry user requesting the listing.
   * @param {object} args.actor Selected actor whose reveals are read.
   * @param {Array<{task: object, visibility: object, blockedReasons: object[]}>} args.taskEntries
   *   The environment's visible-task entries.
   * @param {object[]} args.environmentBlockedReasons Shared environment-level reasons.
   * @returns {Promise<object[]>} Transparent discovered task models (each with `discovered: true`).
   */
  async _discoveredTaskModels({
    environment,
    system,
    viewer,
    actor,
    taskEntries,
    environmentBlockedReasons,
    presentTools = null,
  }) {
    const { policy, scope } = this._resolveRevealPolicy(environment);
    if (policy === 'never') return [];
    const revealedIds = new Set(
      this._listRevealedTaskIds({ actor, environmentId: environment.id, scope })
    );
    if (revealedIds.size === 0) return [];

    const discovered = [];
    for (const entry of taskEntries) {
      if (!revealedIds.has(stringOrNull(entry.task.id))) continue;
      const blockedReasons = [
        ...environmentBlockedReasons,
        ...(await this._taskBlockedReasons({
          environment,
          system,
          task: entry.task,
          actor,
          viewer,
          transparent: true,
          presentTools,
        })),
      ];
      const model = this._taskModel({
        task: entry.task,
        environment,
        actor,
        viewer,
        visibility: entry.visibility,
        blockedReasons,
        forceVisible: true,
        tools: this._resolveTaskToolStates({
          actor,
          system,
          environment,
          task: entry.task,
          presentTools,
        }),
      });
      await this._applyListingStaminaCost(model, {
        system,
        environment,
        actor,
        viewer,
        task: entry.task,
      });
      discovered.push({ ...model, discovered: true });
    }
    return discovered;
  }

  /**
   * Replace a listing model's displayed stamina cost with the viewing
   * character's effective cost (base + per-actor cost modifiers). No-ops without
   * an actor, without a stamina block (e.g. opaque-blind collapsed models), or
   * when the rich state cannot resolve a cost.
   *
   * @param {object} model The task listing model (mutated in place).
   * @param {object} payload
   * @returns {Promise<void>}
   */
  async _applyListingStaminaCost(model, { system, environment, actor, viewer, task }) {
    if (!actor || !model?.rich?.stamina || typeof this.richState?.listingStaminaCost !== 'function')
      return;
    const cost = await this.richState.listingStaminaCost({
      actor,
      system,
      environment,
      task,
      viewer,
    });
    if (cost != null) model.rich.stamina.cost = cost;
  }

  /**
   * Build the lightweight locked listing for a disabled environment shown to
   * every viewer (players and GMs alike) in the player listing. Carries
   * identity fields only — no tasks, weights, or composition internals — plus
   * the existing ENVIRONMENT_DISABLED reason.
   */
  _lockedEnvironmentListing({ environment, system, actor = null, blockedReasons = null, location = null }) {
    const biomes = normalizeStringList(environment.biomes ?? environment.biome);
    const dangerTags = normalizeStringList(environment.dangerTags ?? environment.risk);
    return {
      id: stringOrNull(environment.id),
      craftingSystemId: stringOrNull(environment.craftingSystemId),
      craftingSystemName: stringOrEmpty(system?.name),
      name: stringOrEmpty(environment.name),
      description: stringOrEmpty(environment.description),
      img: stringOrNull(environment.img),
      region: stringOrEmpty(environment.region),
      biome: stringOrEmpty(environment.biome) || biomes[0] || '',
      biomes,
      dangerTags,
      risk: stringOrNull(environment.risk) || dangerTags[0] || 'safe',
      economyMode: this.richState?.economyMode?.(environment.craftingSystemId) || 'none',
      staminaEnabled: this.richState?.staminaEnabled?.(environment.craftingSystemId) === true,
      nodesEnabled: this.richState?.nodesEnabled?.(environment.craftingSystemId) === true,
      weatherEnabled: this.richState?.weatherEnabled?.(environment.craftingSystemId) !== false,
      timeOfDayEnabled: this.richState?.timeOfDayEnabled?.(environment.craftingSystemId) !== false,
      // A disabled teaser resolves no actor, so its current realm is empty ("no
      // realm selected"); a location-lock teaser DOES have an actor + resolved
      // location, so it carries the disclosed current realms. The flag mirrors
      // the system so the header chip appears when the subsystem is enabled.
      realmsEnabled: isGatheringRealmsEnabled(system),
      currentRealms: Array.isArray(location?.currentRealms) ? location.currentRealms : [],
      staminaPool: null,
      conditions: plainObjectOrNull(environment.conditions) || {},
      selectionMode: environment.selectionMode === 'blind' ? 'blind' : 'targeted',
      sceneUuid: stringOrNull(environment.sceneUuid),
      visible: true,
      attemptable: false,
      // Disabled teaser defaults to ENVIRONMENT_DISABLED; a location-lock passes
      // its NO_CURRENT_REALM / LOCATION_BLOCKED reason (with travel guidance).
      blockedReasons: blockedReasons ?? [this._blockedReason('ENVIRONMENT_DISABLED')],
      // The redaction-safe location field is surfaced on the teaser so the card
      // can show the "Not in current realm" alert and its guidance tooltip.
      location: location ?? {
        gated: false,
        available: true,
        source: 'unresolved',
        currentRealms: [],
        guidance: null,
      },
      tasks: [],
      discoveredTasks: [],
      events: [],
      ...this._playerListingFields({ environment, actor, locked: true }),
    };
  }

  /**
   * The shared player-listing fields added to both locked and normal listings:
   * `locked`, the effective system-level `revealPolicy`, the composed task pool
   * size (`composedTaskCount`, the blind-reveal denominator), the actor's
   * `discoveredTaskCount` at the same effective reveal scope, and resolved
   * `biomeTags` display metadata.
   */
  _playerListingFields({ environment, actor, locked }) {
    const { policy: revealPolicy, scope } = this._resolveRevealPolicy(environment);
    const composedTaskCount = locked ? 0 : normalizeList(environment.tasks).length;
    const discoveredTaskCount =
      locked || revealPolicy === 'never'
        ? 0
        : this._countRevealedTasks({ actor, environmentId: environment.id, scope });
    return {
      locked: locked === true,
      revealPolicy,
      composedTaskCount,
      discoveredTaskCount,
      biomeTags: this._resolveBiomeTags(environment),
    };
  }

  _countRevealedTasks({ actor, environmentId, scope }) {
    if (typeof this.richState?.countRevealedTasks !== 'function') return 0;
    try {
      return this.richState.countRevealedTasks({ actor, environmentId, scope }) || 0;
    } catch {
      return 0;
    }
  }

  /**
   * Null-safe wrapper over {@link GatheringRichStateService#listRevealedTaskIds}.
   * Returns the distinct task ids the actor has revealed for an environment at
   * the given reveal scope, or `[]` when the service is absent or throws. Used
   * to surface individually-discovered tasks in blind environments.
   */
  _listRevealedTaskIds({ actor, environmentId, scope }) {
    if (typeof this.richState?.listRevealedTaskIds !== 'function') return [];
    try {
      return normalizeList(this.richState.listRevealedTaskIds({ actor, environmentId, scope }));
    } catch {
      return [];
    }
  }

  /**
   * Static "chance of encountering an event" for an environment: the probability
   * that at least one eligible event triggers on an attempt, derived from the
   * composed events' `dropRate`s as `1 - ∏(1 - dropRate/100)`.
   *
   * Ignores actor/condition/character modifiers and event selection-mode/limit
   * (those only affect which triggered events are applied, not whether any
   * trigger). Returns `0` when the environment has no enabled events, so the
   * player UI can show the "safe" hint instead of a bar.
   *
   * @param {object} environment A composed gathering environment.
   * @returns {number} A 0–1 fraction (0 when there are no events).
   */
  _environmentEventChance(environment) {
    const events = normalizeList(environment?.events).filter((event) => event?.enabled !== false);
    if (events.length === 0) return 0;
    const missAll = events.reduce((product, event) => {
      const rate = Math.min(100, Math.max(0, Number(event?.dropRate) || 0));
      return product * (1 - rate / 100);
    }, 1);
    return 1 - missAll;
  }

  /**
   * A read-only, player-safe model for a single composed event, used to render
   * the center column's events list and the right-column event inspector.
   * Carries identity (`id`/`name`/`description`/`img`), the event's danger tags
   * + a derived `risk` tier (the first tag, or `safe`), a static `chance`
   * (`dropRate/100`, clamped to 0–1) so the UI can reuse the event-chance bar,
   * and the event's matching criteria (`weather`/`timeOfDay`/`biomes`, each an
   * empty array meaning "any"; region is no longer a composition axis) plus an
   * optional `linkedSceneUuid` for the details view. Modifier internals
   * (eventModifier/conditionModifiers/characterModifiers) are intentionally NOT
   * surfaced. Like `_environmentEventChance`, `chance` ignores actor/condition/
   * character modifiers — it is the static per-event trigger rate, not a
   * resolved roll.
   *
   * @param {object} event A composed/normalized gathering event.
   * @param {object} [environment] The owning environment (for biome-tag resolution).
   * @returns {object} The player-facing event model.
   */
  _eventModel(event, environment = null) {
    const dangerTags = normalizeStringList(event?.dangerTags);
    const biomes = normalizeStringList(event?.biomes);
    return {
      id: stringOrNull(event?.id),
      name: stringOrEmpty(event?.name),
      description: stringOrEmpty(event?.description),
      img: stringOrNull(event?.img),
      dangerTags,
      risk: dangerTags[0] || 'safe',
      chance: Math.min(1, Math.max(0, (Number(event?.dropRate) || 0) / 100)),
      weather: normalizeStringList(event?.weather),
      timeOfDay: normalizeStringList(event?.timeOfDay),
      biomes,
      // Resolved biome display metadata ({ id, label, icon, colorToken,
      // customColor }) so event biome chips render with icons/colours like the
      // environment's biome pips. Empty when richState can't resolve them.
      biomeTags: this._resolveBiomeTagList(biomes, environment),
      linkedSceneUuid: stringOrNull(event?.linkedSceneUuid),
    };
  }

  _resolveBiomeTags(environment) {
    return this._resolveBiomeTagList(
      normalizeStringList(environment.biomes ?? environment.biome),
      environment
    );
  }

  /**
   * Null-safe resolution of a biome-id list to display metadata via
   * {@link GatheringRichStateService#resolveBiomeTags}, scoped to the
   * environment's crafting system. Returns `[]` when the service is absent or
   * throws. Shared by environment and event biome-tag resolution.
   */
  _resolveBiomeTagList(biomes, environment) {
    if (typeof this.richState?.resolveBiomeTags !== 'function') return [];
    try {
      return this.richState.resolveBiomeTags(biomes, environment?.craftingSystemId) || [];
    } catch {
      return [];
    }
  }

  /**
   * Resolve the effective player-facing event visibility tier for a viewer.
   * GMs always see the full event information. For a non-GM viewer the tier is
   * read from the environment's gathering rules, defaulting to the more
   * restrictive `encounterChance` when absent or invalid so missing rules never
   * leak the full event list.
   *
   * @param {object} environment Composed gathering environment (carries `rules`).
   * @param {object} [viewer] Foundry user requesting the listing.
   * @returns {'dangerLevelOnly'|'encounterChance'|'full'} The effective tier.
   */
  _resolveEventVisibility(environment, viewer) {
    if (viewer?.isGM === true) return 'full';
    const visibility = environment?.rules?.eventVisibility;
    return GATHERING_EVENT_VISIBILITIES.has(visibility) ? visibility : 'encounterChance';
  }

  _emptyListing({ viewer, actor = null, selectableActors = [], reason }) {
    const activeRuns = actor ? this._activeRunModels({ actor, viewer }) : [];
    const history = actor ? this._historyModels({ actor, viewer }) : [];
    return {
      visible: true,
      attemptable: false,
      blockedReasons: [reason],
      state: reason.code,
      viewerId: idOf(viewer),
      selectedActorId: actor ? idOf(actor) : null,
      selectableActors: selectableActors.map(actorToOption),
      environments: [],
      activeRuns,
      history,
      gatheringSystems: this._gatheringSystemOptions([...activeRuns, ...history]),
      // STORE contract keys (enabled/realms) so the View passes it straight
      // through setRealmContext; no environments → no system context → chip off.
      realmContext: { enabled: false, realms: [], systemId: null },
    };
  }

  _gatheringSystemOptions(models = []) {
    const systems = this._allSystems();
    const ids = [
      ...new Set(
        normalizeList(models)
          .map((model) => stringOrNull(model?.craftingSystemId))
          .filter(Boolean)
      ),
    ];
    return ids
      .map((id) => {
        const system = systems.get(id);
        return {
          id,
          name:
            stringOrEmpty(system?.name) ||
            stringOrEmpty(models.find((model) => model?.craftingSystemId === id)?.craftingSystemName) ||
            id,
        };
      })
      .sort((left, right) => left.name.localeCompare(right.name));
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
}
