import { DEFAULT_GATHERING_EVENT_IMG } from '../gatheringImageDefaults.js';
import {
  classifyGatheringToolStates,
  resolvePresentComponentIds,
} from '../gatheringToolRuntime.js';
import { resolveProgressiveAward as resolveProgressiveAwardLoop } from '../utils/progressiveAward.js';
import { matchResultGroupsByName, normalizeRoutedName } from '../utils/routedOutcomeKeywords.js';

import { runFormulaProgressive, runFormulaRouted } from './checkRoll.js';
import { buildGatheringChatContent } from './GatheringChatCard.js';
import {
  actorMatchesId,
  callMaybe,
  cloneJson,
  idOf,
  normalizeActorList,
  normalizeInteractableRef,
  normalizeList,
  normalizeStringList,
  plainObjectOrNull,
  redactRichEvidence,
  sameActor,
  sameActorUuid,
  stringOrEmpty,
  stringOrNull,
  stripRuntimeSnapshotFromRun,
} from './gatheringEngineInternals.js';
import { GatheringListingBuilder } from './GatheringListingBuilder.js';
import {
  buildRealmDisclosure,
  buildTravelGuidance,
  environmentHasLocationRules,
  evaluateLocationAvailability,
} from './gatheringLocation.js';
import { evaluateEnvironmentMatch } from './gatheringMatch.js';
import { getDiscoveredRealmIdsForSystem } from './gatheringRealmDiscovery.js';
import { isGatheringRealmsEnabled } from './gatheringRealms.js';
import { GatheringWorldTimeProcessor } from './GatheringWorldTimeProcessor.js';
import { computeSystemVisibility } from './systemValidation.js';

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
  TOOL_BLOCKED: 'FABRICATE.Gathering.Blocked.ToolBlocked',
  GAME_PAUSED: 'FABRICATE.Gathering.Blocked.GamePaused',
  MISSING_REFERENCE: 'FABRICATE.Gathering.Blocked.MissingReference',
  SYSTEM_DISABLED: 'FABRICATE.Gathering.Blocked.SystemDisabled',
  TASK_DISABLED: 'FABRICATE.Gathering.Blocked.TaskDisabled',
  TASK_HIDDEN: 'FABRICATE.Gathering.Blocked.TaskHidden',
  TASK_MISCONFIGURED: 'FABRICATE.Gathering.Blocked.TaskMisconfigured',
  RUN_CREATION_FAILED: 'FABRICATE.Gathering.Blocked.RunCreationFailed',
  NODE_DEPLETED: 'FABRICATE.Gathering.Blocked.NodeDepleted',
  STAMINA_BLOCKED: 'FABRICATE.Gathering.Blocked.StaminaBlocked',
  BLIND_NO_CANDIDATE: 'FABRICATE.Gathering.Blocked.BlindNoCandidate',
  CONDITIONS_BLOCKED: 'FABRICATE.Gathering.Blocked.ConditionsBlocked',
  LOCATION_BLOCKED: 'FABRICATE.Gathering.Blocked.LocationBlocked',
  NO_CURRENT_REALM: 'FABRICATE.Gathering.Blocked.NoCurrentRealm',
});

const BLIND_TASK_LABEL_KEY = 'FABRICATE.Gathering.BlindTaskLabel';
const UNKNOWN_TOOL_LABEL_KEY = 'FABRICATE.App.Gathering.Detail.UnknownTool';
const DEFAULT_TOOL_IMG = 'icons/svg/item-bag.svg';
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
  'oops',
]);

/**
 * Composes gathering stores, visibility evaluation, and runtime gate checks for
 * player-facing listing state and guarded attempt starts. Listings include
 * active timed runs and recent terminal history even when browsing rows are
 * empty or blocked for the selected actor. Non-timed attempts resolve
 * immediately into terminal routed/progressive outcomes, plan created-result,
 * tool, and check history payloads, persist terminal history, then commit
 * irreversible result, tool, and failure-feedback effects. Timed attempts
 * resume through processWorldTime(worldTime), which asks the run manager for
 * matured waitingTime runs, writes terminal history before post-history
 * effects, cancels missing-reference runs into terminal history, and clears
 * resume-time misconfiguration without player history or effects.
 *
 * When a `locationResolver` collaborator (a GatheringLocationService) is
 * injected, listings additionally evaluate each environment's location
 * availability against the party's resolved current realms — emitting a
 * redaction-safe `location` listing field plus `LOCATION_BLOCKED` /
 * `NO_CURRENT_REALM` blocked reasons — and attempt starts re-resolve location
 * fresh so a stale listing cannot start a location-gated attempt. Without the
 * resolver, or for environments that declare no location rules, listing and
 * start behavior is unchanged.
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
    toolAvailability = null,
    // Optional progressive-resolution seam (`resolveProgressive`). Routed
    // resolution no longer uses a result resolver — it routes exclusively through
    // the system-level gathering check formula (`_resolveRoutedFormulaOutcome`).
    // Production wires nothing here, so progressive falls through to the built-in
    // `resolveProgressiveAward`; tests inject a `resolveProgressive` stub.
    resultResolver = null,
    resultCreator = null,
    toolBreakage = null,
    failureFeedback = null,
    eventSceneTrigger = null,
    hookPublisher = null,
    getRunViewer = null,
    locationResolver = null,
    random = Math.random,
    localize = defaultLocalize,
    // Stamina regen / node respawn run on world-time advance and write shared
    // state, so they must run exactly once — only on the primary GM client.
    isPrimaryGM = () =>
      Boolean(
        globalThis.game?.user?.isGM &&
        globalThis.game?.users?.activeGM?.id === globalThis.game?.user?.id
      ),
    getActors = () => [...(globalThis.game?.actors?.contents ?? globalThis.game?.actors ?? [])],
    // Scene graph + scoped-behaviour writer seams for interactable-scoped node
    // respawn (issue 302). `scenes` is scanned for `fabricate.interactable`
    // behaviours that own their own node pool; `applyInteractableBehaviorUpdate`
    // routes the resulting behaviour-system patch through the active GM. Both are
    // injected by main.js (fake in tests); absent → no scoped respawn pass.
    scenes = () => globalThis.game?.scenes ?? null,
    applyInteractableBehaviorUpdate = null,
    // GM-gated world-time maintenance collaborator (issue 374): stamina regen +
    // environment/interactable node respawn. Default-constructed below from the
    // engine's already-resolved fields when not injected. The engine's
    // `isPrimaryGM()` guard is the only gate — the processor carries none.
    worldTimeProcessor = null,
    // Player-facing listing / view-model builder (issue 375): owns the bodies of
    // listForActor + getTaskDropBreakdown and the environment/run/history/task/
    // event model construction. Default-constructed below from the engine's
    // collaborators + bound shared-helper callbacks when not injected. The engine
    // keeps thin public delegators to it.
    listingBuilder = null,
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
    this.toolAvailability = toolAvailability;
    this.resultResolver = resultResolver;
    this.resultCreator = resultCreator;
    this.toolBreakage = toolBreakage;
    this.failureFeedback = failureFeedback;
    this.eventSceneTrigger = eventSceneTrigger;
    // Public hook publisher (GatheringHookPublisher): emits the documented
    // `fabricate.gathering.*` integration hooks on terminal completion. Optional;
    // when absent no public hooks fire (the default in unit tests).
    this.hookPublisher = hookPublisher;
    this.getRunViewer = getRunViewer;
    // Constructor-injected current-realm resolver (GatheringLocationService),
    // NOT a module import — keeps the engine system-agnostic and testable.
    this.locationResolver = locationResolver;
    this.random = typeof random === 'function' ? random : Math.random;
    this.localize = localize;
    this.isPrimaryGM = typeof isPrimaryGM === 'function' ? isPrimaryGM : () => true;
    this.getActors = typeof getActors === 'function' ? getActors : () => [];
    this.scenes = typeof scenes === 'function' ? scenes : () => null;
    this.applyInteractableBehaviorUpdate =
      typeof applyInteractableBehaviorUpdate === 'function'
        ? applyInteractableBehaviorUpdate
        : null;
    this.worldTimeProcessor =
      worldTimeProcessor ??
      new GatheringWorldTimeProcessor({
        richState: this.richState,
        environmentStore: this.environmentStore,
        getActors: this.getActors,
        scenes: this.scenes,
        applyInteractableBehaviorUpdate: this.applyInteractableBehaviorUpdate,
        enabledGatheringSystems: () => this._enabledGatheringSystems(),
      });
    this.listingBuilder =
      listingBuilder ??
      new GatheringListingBuilder({
        richState: this.richState,
        runManager: this.runManager,
        environmentStore: this.environmentStore,
        getSelectableActors: this.getSelectableActors,
        localize: this.localize,
        resolveSelectedActor: (args) => this._resolveSelectedActor(args),
        findEnvironment: (environmentId) => this._findEnvironment(environmentId),
        enabledGatheringSystems: () => this._enabledGatheringSystems(),
        allSystems: () => this._allSystems(),
        composeEnvironment: (environment, system) => this._composeEnvironment(environment, system),
        playerCandidateEnvironments: (systems, viewer) =>
          this._playerCandidateEnvironments(systems, viewer),
        isSelectableActor: (actor, viewer, selectableActors) =>
          this._isSelectableActor(actor, viewer, selectableActors),
        locationBlockedReasons: (args) => this._locationBlockedReasons(args),
        currentRealmSummary: (args) => this._currentRealmSummary(args),
        listingRealmContext: (args) => this._listingRealmContext(args),
        resolveRealmContext: (args) => this._resolveRealmContext(args),
        resolveTaskTools: (args) => this._resolveTaskTools(args),
        resolveTaskToolStates: (args) => this._resolveTaskToolStates(args),
        componentsById: (system) => this._componentsById(system),
        richListingMetadata: (args) => this._richListingMetadata(args),
        taskModel: (args) => this._taskModel(args),
        taskBlockedReasons: (args) => this._taskBlockedReasons(args),
        visibleTaskListings: (args) => this._visibleTaskListings(args),
        environmentBlockedReasons: (args) => this._environmentBlockedReasons(args),
        isOpaqueBlindTask: (args) => this._isOpaqueBlindTask(args),
        resolveRevealPolicy: (environment) => this._resolveRevealPolicy(environment),
        blockedReason: (code, options) => this._blockedReason(code, options),
      });
  }

  /**
   * Resume matured timed gathering runs for the supplied Foundry world time.
   *
   * Non-matured waitingTime runs are filtered by GatheringRunManager and are
   * not resolved here. Matured success/failure paths call completeRun with
   * planned result/tool/check refs before committing result creation,
   * tool usage, or failure feedback. If terminal history persistence
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
          message: stringOrNull(error?.message),
        });
      }
    }

    // Drive stamina regeneration and node respawn off the same world-time tick
    // that matures timed runs. Guarded to the primary GM so connected clients
    // never double-apply; regen/respawn are idempotent per advanced anchor.
    let staminaRegen = [];
    let nodeRespawn = [];
    let interactableNodeRespawn = [];
    if (this.isPrimaryGM()) {
      ({ staminaRegen, nodeRespawn, interactableNodeRespawn } =
        await this.worldTimeProcessor.processRegenAndRespawn(worldTime));
    }

    return {
      worldTime: Number(worldTime),
      processed,
      completed,
      cancelled,
      cleared,
      errors,
      staminaRegen,
      nodeRespawn,
      interactableNodeRespawn,
    };
  }

  /**
   * Thin delegate to the world-time processor's interactable-scoped node respawn
   * pass (issue 374). Kept so callers that drive the pass directly — notably the
   * interactable-scoped node enumeration test — stay green after the extraction.
   *
   * @param {number} worldTime
   * @returns {Promise<Array<{sceneId:string, regionId:string, behaviorId:string}>>}
   */
  _processInteractableNodeRespawn(...args) {
    return this.worldTimeProcessor._processInteractableNodeRespawn(...args);
  }

  async startAttempt({
    viewer = null,
    actor = null,
    rememberedActorId = null,
    environmentId = null,
    taskId = null,
    // Virtual-present tools injected by an active canvas Tool station (Phase 4):
    // a `{ systemId, componentIds }` payload whose componentIds satisfy a tool
    // prerequisite WITHOUT an owned item (and are excluded from breakage/usage)
    // ONLY for tasks in the matching crafting system — componentId is per-system.
    presentTools = null,
    // Optional scene-interactable ref ({sceneId, regionId, behaviorId}) when the
    // attempt was opened against an interactable that owns its own scoped node
    // pool (issue 302). Null for the default environment-scoped flow.
    interactableRef = null,
  } = {}) {
    const resolved = await this._resolveStartContext({
      viewer,
      actor,
      rememberedActorId,
      environmentId,
      taskId,
    });
    if (resolved.blockedReason) {
      return this._blockedStart({
        viewer,
        actor: resolved.actor ?? null,
        environment: resolved.environment ?? null,
        task: resolved.task ?? null,
        reason: resolved.blockedReason,
      });
    }

    const { selectedActor, system, environment, task } = resolved;
    if (this._gamePaused()) {
      return this._blockedStart({
        viewer,
        actor: selectedActor,
        environment,
        task,
        reason: this._blockedReason('GAME_PAUSED'),
      });
    }

    if (system.enabled === false || system.features?.gathering !== true) {
      return this._blockedStart({
        viewer,
        actor: selectedActor,
        environment,
        task,
        reason: this._blockedReason('SYSTEM_DISABLED'),
      });
    }

    // System-validity gate: a system with a `blocks: 'system'` validation issue
    // is unusable, so a non-GM attempt is rejected (mirrors the listing gate that
    // hides it). GMs bypass so they can still attempt/diagnose a broken system.
    if (viewer?.isGM !== true && this._isSystemBlockedForGathering(system, new Map())) {
      return this._blockedStart({
        viewer,
        actor: selectedActor,
        environment,
        task,
        reason: this._blockedReason('SYSTEM_DISABLED'),
      });
    }

    if (environment.enabled === false) {
      return this._blockedStart({
        viewer,
        actor: selectedActor,
        environment,
        task,
        reason: this._blockedReason('ENVIRONMENT_DISABLED'),
      });
    }

    // Fresh location re-resolution at attempt time (no listing cache) so a stale
    // listing state — e.g. an override cleared between list and start — cannot
    // start a location-gated attempt.
    const locationGuard = this._locationBlockedReasons({
      environment,
      system,
      viewer,
      actor: selectedActor,
    });
    if (locationGuard.blockedReasons.length > 0) {
      return this._blockedStart({
        viewer,
        actor: selectedActor,
        environment,
        task,
        reason: locationGuard.blockedReasons[0],
      });
    }

    if (task.enabled === false) {
      return this._blockedStart({
        viewer,
        actor: selectedActor,
        environment,
        task,
        reason: this._blockedReason('TASK_DISABLED', {
          data: this._blindTaskData({ environment, task, viewer }),
        }),
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
            data: access.data,
          }),
        });
      }
    }

    const visibility = viewer?.isGM
      ? { visible: true, reasonCode: 'GM_VISIBLE', diagnostic: null }
      : normalizeVisibilityResult(
          await this._evaluateTaskVisibility({
            environment,
            system,
            task,
            viewer,
            actor: selectedActor,
          })
        );
    if (visibility.visible !== true) {
      return this._blockedStart({
        viewer,
        actor: selectedActor,
        environment,
        task,
        reason: this._blockedReason('TASK_HIDDEN', {
          data: this._blindTaskData({ environment, task, viewer }),
        }),
      });
    }

    if (this.runManager?.findActiveRunForTask?.(selectedActor, task.id)) {
      return this._blockedStart({
        viewer,
        actor: selectedActor,
        environment,
        task,
        reason: this._blockedReason('DUPLICATE_ACTIVE_RUN', {
          data: this._blindTaskData({ environment, task, viewer }),
        }),
      });
    }

    const taskTools = this._resolveTaskTools({ environment, task });
    if (this._hasBlockedToolReferences(taskTools)) {
      return this._blockedStart({
        viewer,
        actor: selectedActor,
        environment,
        task,
        reason: this._blockedReason('TOOL_BLOCKED', {
          data: this._isOpaqueBlindTask({ environment, viewer })
            ? null
            : this._toolBlockedData({ task, resolvedTools: taskTools }),
        }),
      });
    }
    if (taskTools.tools.length > 0) {
      const toolResult = await this._checkTools({
        actor: selectedActor,
        viewer,
        system,
        environment,
        task,
        tools: taskTools.tools,
        presentTools,
      });
      if (toolResult.available !== true) {
        return this._blockedStart({
          viewer,
          actor: selectedActor,
          environment,
          task,
          reason: this._blockedReason('TOOL_BLOCKED', {
            data: this._isOpaqueBlindTask({ environment, viewer })
              ? null
              : this._toolBlockedData({ task, resolvedTools: taskTools, toolResult }),
          }),
        });
      }
    }

    const richAttempt = await this._evaluateRichAttempt({
      actor: selectedActor,
      viewer,
      system,
      environment,
      task,
      interactableRef,
    });
    if (richAttempt.blockedReasons.length > 0) {
      return this._blockedStart({
        viewer,
        actor: selectedActor,
        environment,
        task,
        reason: richAttempt.blockedReasons[0],
      });
    }

    const configuration = this._validateStartTask(task, system);
    if (configuration.valid !== true) {
      return this._blockedStart({
        viewer,
        actor: selectedActor,
        environment,
        task,
        reason: this._blockedReason('TASK_MISCONFIGURED', {
          data: this._isOpaqueBlindTask({ environment, viewer })
            ? null
            : { taskId: task.id, errors: configuration.errors },
        }),
      });
    }

    if (hasTimeRequirement(task)) {
      // Waiting runs mature later (no open session / canvas tool), so terminal
      // tool side-effects use no virtual-present set; the gate above already
      // passed for this attempt.
      return this._startWaitingAttempt({
        viewer,
        actor: selectedActor,
        system,
        environment,
        task,
        richAttempt,
        interactableRef,
      });
    }

    return this._resolveImmediateAttempt({
      viewer,
      actor: selectedActor,
      system,
      environment,
      task,
      richAttempt,
      presentTools,
      interactableRef,
    });
  }

  async _processMaturedWaitingRun({ actor, run }) {
    const viewer = await this._viewerForRun({ actor, run });
    const resolved = this._resolveWaitingRunContext({ actor, run });
    if (resolved.missingReference) {
      return this._cancelMissingReferenceRun({ viewer, actor, run, resolved });
    }

    const { system, environment, task, interactableRef } = resolved;
    const configuration = this._validateStartTask(task, system);
    if (configuration.valid !== true) {
      return this._clearMisconfiguredWaitingRun({
        viewer,
        actor,
        run,
        environment,
        task,
        errors: configuration.errors,
      });
    }

    const outcome =
      task.resolutionMode === 'd100'
        ? await this._resolveD100Outcome({ viewer, actor, system, environment, task })
        : task.resolutionMode === 'progressive'
          ? await this._resolveProgressiveOutcome({ viewer, actor, system, environment, task })
          : await this._resolveRoutedOutcome({ viewer, actor, system, environment, task });
    if (outcome.status === 'misconfigured') {
      return this._clearMisconfiguredWaitingRun({
        viewer,
        actor,
        run,
        environment,
        task,
        outcome,
      });
    }

    const checkResult = plainObjectOrNull(outcome.checkResult) ?? undefined;
    const plan = await this._terminalSideEffectPlan({
      viewer,
      actor,
      system,
      environment,
      task,
      outcome,
      checkResult,
    });
    if (plan.status === 'misconfigured') {
      return this._clearMisconfiguredWaitingRun({
        viewer,
        actor,
        run,
        environment,
        task,
        outcome: plan,
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
      plan,
    });
    const completedRun = await this.runManager.completeRun(actor, run, outcome.status, payload, {
      terminalRunData: runData,
    });
    if (!completedRun) {
      throw Object.assign(new Error('Timed gathering terminal history was not written'), {
        code: 'TERMINAL_HISTORY_NOT_WRITTEN',
      });
    }

    const richEvidence = await this._commitRichAttempt({
      actor,
      system,
      environment,
      task,
      outcome,
      viewer,
      interactableRef,
    });
    const completedRunWithRichEvidence =
      richEvidence && typeof richEvidence === 'object'
        ? {
            ...completedRun,
            economyEvidence: {
              ...completedRun.economyEvidence,
              ...richEvidence,
            },
          }
        : completedRun;

    await this._commitTerminalSideEffects({
      viewer,
      actor,
      system,
      environment,
      task,
      outcome,
      checkResult,
    });

    return await this._terminalStart({
      viewer,
      actor,
      system,
      environment,
      task,
      status: outcome.status,
      run: completedRunWithRichEvidence,
      createdResults: plan.createdResults,
      usedTools: plan.usedTools ?? [],
      checkResult,
      initiatedBy: 'timed',
    });
  }

  /**
   * Build the player-facing gathering listing for the selected actor: the
   * environments the actor can see (or is teased about), plus active runs,
   * recent history, and the gathering-system filter options.
   *
   * Each entry in the returned `environments` array carries the environment
   * identity (`id`, `name`, `img`, `region`, `biome(s)`, `dangerTags`, `risk`,
   * the two independent limitation flags `staminaEnabled` / `nodesEnabled`
   * (either, both, or neither may be on) plus the derived back-compat
   * `economyMode` string, `conditions`, `selectionMode`, `sceneUuid`), interaction
   * state (`visible`, `attemptable`, `blockedReasons`, `tasks`,
   * `discoveredTasks`), and the shared player-listing fields produced by
   * {@link GatheringEngine#_playerListingFields}:
   *
   * - `tasks` — visible task models. For a targeted environment, the full
   *   transparent list; for a non-GM viewer of a blind environment, a single
   *   opaque "Attempt gathering" entry (the collapsed task list); a GM viewer
   *   of a blind environment sees the full transparent list. Each transparent
   *   task model carries a `successChance` — a 0–1 static drop-rate
   *   approximation from {@link GatheringEngine#_taskSuccessChance} (find
   *   chance, not whole-attempt success), or `null` for non-d100 tasks; the
   *   opaque blind entry never carries one.
   * - `discoveredTasks` — for a non-GM viewer of a blind environment, the
   *   transparent, individually-attemptable models for tasks this actor has
   *   already revealed (the "Discovered Tasks" list); `[]` for targeted
   *   environments, GM viewers, locked environments, and `never`-policy
   *   environments. See {@link GatheringEngine#_discoveredTaskModels}.
   * - `events` — read-only player-facing models for the environment's composed
   *   events (`id`, `name`, `description`, `img`, `dangerTags`, `risk`, a static
   *   `chance`, the matching criteria `weather`/`timeOfDay`/`biomes`,
   *   resolved `biomeTags` display metadata, and an optional `linkedSceneUuid`;
   *   see {@link GatheringEngine#_eventModel}).
   *   The full list for targeted environments and GM viewers; `[]` (redacted) for
   *   a non-GM viewer of a blind environment and for locked teasers. The aggregate
   *   `eventChance` is still emitted regardless, so the player UI can show the
   *   chance bar even when individual events are redacted.
   * - `locked` — `true` for disabled environments surfaced to every viewer
   *   (players and GMs alike) as non-interactive teasers (identity fields only;
   *   empty `tasks`, empty `discoveredTasks`, an `ENVIRONMENT_DISABLED` blocked
   *   reason, and `attemptable: false`).
   * - `revealPolicy` — the effective system-level reveal policy
   *   (`never`/`onSuccess`/`onAttempt`); when `never`, `discoveredTaskCount`
   *   stays `0`.
   * - `composedTaskCount` — size of the composed task pool. This is the
   *   blind-reveal denominator (the "/y" in a player chip) and is intentionally
   *   distinct from the GM admin `availableTaskCount`: it counts the full
   *   composed pool the actor could discover, not the GM-side available-task
   *   tally surfaced in the manager.
   * - `discoveredTaskCount` — distinct task ids the actor has revealed at the
   *   effective reveal scope (the "x/" numerator); `0` for locked or
   *   `never`-policy environments.
   * - `biomeTags` — resolved biome display metadata (`{ id, label, icon,
   *   colorToken, customColor }`) so player chips match the GM editor.
   *
   * The listing also carries a single top-level `realmContext`
   * (`{ enabled: boolean, realms: object[], systemId: string|null }`) describing
   * the party/system current realm for the header current-realm chip, resolved
   * once per listing independent of which environment (if any) is selected — so
   * the chip surfaces the realm context even when every environment is
   * realm-locked and none is selectable. It is `enabled` only when exactly one
   * realm-enabled gathering system is present among the listed environments (an
   * ambiguous multi-system listing yields `{ enabled: false, ... }`); the
   * `realms` use the same disclosure/redaction path as the per-environment
   * current-realm summary. The field deliberately uses the store contract keys
   * (`enabled`/`realms`) so the View can pass it straight to `setRealmContext`.
   * See {@link GatheringEngine#_listingRealmContext}.
   *
   * @param {object} [args]
   * @param {object|null} [args.viewer] Foundry user requesting the listing.
   * @param {object|null} [args.actor] Explicitly selected actor, if any.
   * @param {string|null} [args.rememberedActorId] Previously selected actor id.
   * @returns {Promise<object>} The gathering listing model.
   */
  /**
   * Public read API — delegates to the GatheringListingBuilder collaborator
   * (issue 375). Kept on the engine as a thin delegator because external callers
   * (e.g. `src/main.js`) dispatch by method name on the engine instance; the
   * body moved into the builder.
   *
   * @param {object} [args]
   * @returns {Promise<object>}
   */
  async listForActor(args = {}) {
    return this.listingBuilder.listForActor(args);
  }

  /**
   * Public read API — delegates to the GatheringListingBuilder collaborator
   * (issue 375). Thin delegator for the same method-name-dispatch reason as
   * `listForActor`; the body moved into the builder.
   *
   * @param {object} [args]
   * @returns {Promise<object>}
   */
  async getTaskDropBreakdown(args = {}) {
    return this.listingBuilder.getTaskDropBreakdown(args);
  }

  _resolveSelectedActor({ actor, rememberedActorId, selectableActors, viewer }) {
    if (actor) {
      if (this._isSelectableActor(actor, viewer, selectableActors)) {
        return { actor };
      }
      return {
        actor: null,
        blockedReason: this._blockedReason('ACTOR_NOT_SELECTABLE'),
      };
    }

    if (rememberedActorId) {
      const remembered = selectableActors.find((candidate) =>
        actorMatchesId(candidate, rememberedActorId)
      );
      if (remembered) return { actor: remembered };
      return {
        actor: null,
        blockedReason: this._blockedReason('INVALID_REMEMBERED_ACTOR', {
          data: { actorId: String(rememberedActorId) },
        }),
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
      isGM: false,
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
    if (
      !environment ||
      stringOrNull(environment.craftingSystemId) !== stringOrNull(run.craftingSystemId)
    ) {
      return { missingReference: 'environment', system };
    }

    const snapshot = plainObjectOrNull(run?.economyEvidence?.runtimeSnapshot);
    const snapshotTask = plainObjectOrNull(snapshot?.task);
    const snapshotEnvironment = snapshotTask
      ? {
          ...environment,
          conditions:
            plainObjectOrNull(snapshot?.conditions) ||
            plainObjectOrNull(run?.conditionSnapshot) ||
            plainObjectOrNull(environment?.conditions) ||
            {},
          events: normalizeList(snapshot?.events),
          rules: plainObjectOrNull(snapshot?.rules) || plainObjectOrNull(environment?.rules) || {},
          useLegacyTaskItemSelectionMode: snapshot?.useLegacyTaskItemSelectionMode === true,
          eventSelectionMode:
            stringOrNull(snapshot?.eventSelectionMode) ||
            stringOrNull(environment?.eventSelectionMode),
          eventLimit: snapshot?.eventLimit,
          eventPolicy:
            stringOrNull(snapshot?.eventPolicy) || stringOrNull(environment?.eventPolicy),
        }
      : null;
    if (snapshotEnvironment && environment?.__libraryTools instanceof Map) {
      Object.defineProperty(snapshotEnvironment, '__libraryTools', {
        value: environment.__libraryTools,
        enumerable: false,
        configurable: true,
        writable: true,
      });
    }
    const currentTask =
      normalizeList(environment.tasks).find((task) => task?.id === run.taskId) ?? null;
    const task = snapshotTask || currentTask;
    if (!task) {
      return { missingReference: 'task', system, environment };
    }

    return {
      system,
      environment: snapshotEnvironment || environment,
      task,
      // Scoped-node ref persisted at start (issue 302); null for the env flow.
      // `_resolveNodeSource` falls back to the environment branch if the behaviour
      // no longer resolves at maturity, so the decrement is never dropped.
      interactableRef: normalizeInteractableRef(run?.interactableRef),
    };
  }

  _isSelectableActor(actor, viewer, selectableActors) {
    if (typeof this.isActorSelectable === 'function') {
      return this.isActorSelectable({ actor, viewer }) === true;
    }
    return selectableActors.some((candidate) => sameActor(candidate, actor));
  }

  _enabledGatheringSystems() {
    return new Map(
      [...this._allSystems().values()]
        .filter((system) => system.enabled !== false && system.features?.gathering === true)
        .map((system) => [String(system.id), system])
    );
  }

  _allSystems() {
    const systems = normalizeList(
      typeof this.getSystems === 'function' ? this.getSystems() : this.systemManager?.getSystems?.()
    );

    return new Map(
      systems.filter((system) => system?.id).map((system) => [String(system.id), system])
    );
  }

  _playerCandidateEnvironments(systems, viewer) {
    const environments = normalizeList(this.environmentStore?.list?.());
    // System-validity gate: a system with a `blocks: 'system'` issue exposes
    // nothing to non-GM viewers (its environments are dropped before any task
    // gating). GMs bypass so they still reach a broken system to fix it. Computed
    // at most once per system per listing call, NOT a full overview rebuild.
    const isGM = viewer?.isGM === true;
    const blockedCache = new Map();
    return environments
      .filter((environment) => {
        if (!systems.has(environment?.craftingSystemId)) return false;
        if (
          !isGM &&
          this._isSystemBlockedForGathering(systems.get(environment.craftingSystemId), blockedCache)
        ) {
          return false;
        }
        return true;
      })
      .map((environment) =>
        this._composeEnvironment(environment, systems.get(environment.craftingSystemId))
      );
  }

  /**
   * Whether a gathering system is hidden by a `blocks: 'system'` validation
   * issue. Cached per listing call (keyed by system id) so a multi-environment
   * system is evaluated once. Fail-open (false) when the system or recipe manager
   * is unavailable so a missing collaborator never blanks a player's gathering
   * listing. GM bypass is the caller's concern.
   *
   * @param {object|null|undefined} system
   * @param {Map<string, boolean>} cache Per-call blocker cache, keyed by system id.
   * @returns {boolean}
   * @private
   */
  _isSystemBlockedForGathering(system, cache) {
    const systemId = system?.id;
    if (!systemId) return false;
    if (cache.has(systemId)) return cache.get(systemId);

    const recipeManager = globalThis.game?.fabricate?.getRecipeManager?.();
    const recipes = recipeManager?.getRecipes?.({ craftingSystemId: systemId }) || [];
    const { blocksSystem } = computeSystemVisibility(system, {
      recipes,
      components: system.components || [],
    });
    cache.set(systemId, blocksSystem === true);
    return blocksSystem === true;
  }

  _composeEnvironment(environment, system = null) {
    if (typeof this.richState?.composeEnvironment === 'function') {
      return this.richState.composeEnvironment(environment, system);
    }
    return environment;
  }

  /**
   * A static, drop-rate-only approximation of the chance a d100 task yields at
   * least one item: `1 − ∏(1 − dropRate_i/100)` over enabled drop rows.
   *
   * This deliberately ignores actor/condition/character modifiers, attempt
   * limits, node depletion, stamina, tools, and the d100 success threshold,
   * so it represents "chance at least one drop rolls", not whole-attempt
   * success. Returns `null` for non-d100 tasks or when there are no enabled drop
   * rows, so the UI can hide the success-chance bar.
   *
   * @param {object} task A composed/normalized gathering task.
   * @returns {number|null} A 0–1 fraction, or `null` when not applicable.
   */
  _taskSuccessChance(task) {
    if (task?.resolutionMode !== 'd100') return null;
    const rows = normalizeList(task.dropRows).filter((row) => row?.enabled !== false);
    if (rows.length === 0) return null;
    const missAll = rows.reduce((product, row) => {
      const rate = Math.min(100, Math.max(0, Number(row?.dropRate) || 0));
      return product * (1 - rate / 100);
    }, 1);
    return 1 - missAll;
  }

  async _visibleTaskListings({ environment, system, viewer, actor }) {
    const enabledTasks = normalizeList(environment.tasks).filter((task) => task?.enabled !== false);
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
      task,
    });
  }

  async _environmentBlockedReasons({
    environment,
    system = null,
    viewer,
    actor,
    realmContextCache = null,
  }) {
    const blockedReasons = [];
    if (environment.enabled === false) {
      blockedReasons.push(this._blockedReason('ENVIRONMENT_DISABLED'));
    }

    if (environment.sceneUuid) {
      const access = await this._checkSceneAccess({ environment, viewer, actor });
      if (access.allowed !== true) {
        blockedReasons.push(
          this._blockedReason(access.code || 'SCENE_TOKEN_BLOCKED', {
            messageKey: access.messageKey,
            message: access.message,
            data: access.data,
          })
        );
      }
    }

    const location = this._locationBlockedReasons({
      environment,
      system,
      viewer,
      actor,
      realmContextCache,
    });
    blockedReasons.push(...location.blockedReasons);

    return blockedReasons;
  }

  /**
   * Resolve the current-realm context for one system once per listing call.
   * Memoized by systemId in the supplied cache so the per-environment loop in
   * `listForActor` does not re-resolve for every environment of a system.
   *
   * @param {object} args
   * @param {object} args.actor Selected actor.
   * @param {string} args.systemId Owning crafting system id.
   * @param {Map<string, object>|null} [args.cache]
   * @returns {object} Current-realm context (resolved/source/realms/...).
   */
  _resolveRealmContext({ actor, systemId, cache = null }) {
    if (cache && cache.has(systemId)) return cache.get(systemId);
    const context =
      typeof this.locationResolver?.buildCurrentRealmContext === 'function'
        ? this.locationResolver.buildCurrentRealmContext({ actor, systemId })
        : { resolved: false, source: 'unresolved', realms: [], realmIds: [], staleRealmIds: [] };
    if (cache) cache.set(systemId, context);
    return context;
  }

  /**
   * Evaluate location availability for an environment and produce blocked
   * reasons plus a redaction-safe `location` listing field. Fast-exits (returns
   * no reasons and an ungated `location`) when no resolver is wired or the
   * environment declares no location rules — legacy ungated environments are
   * preserved exactly.
   *
   * Non-GM blocked-reason `data` is built entirely from `buildTravelGuidance`,
   * whose destinations flow through `buildRealmDisclosure`, so secret
   * undiscovered realm ids/names never appear in player-facing data.
   *
   * @param {object} args
   * @returns {{ blockedReasons: object[], location: object }}
   */
  _locationBlockedReasons({ environment, system = null, viewer, actor, realmContextCache = null }) {
    // When the realm/travel subsystem is disabled for this system, behave as if
    // no environment is location-gated and no travel exists: every environment
    // is available and the listing `location` field is the ungated shape. This
    // is the central choke point (the listing `location` field and the
    // start-attempt location guard both flow through here).
    if (!isGatheringRealmsEnabled(system)) {
      return {
        blockedReasons: [],
        location: {
          gated: false,
          available: true,
          source: 'unresolved',
          currentRealms: [],
          guidance: null,
        },
      };
    }
    const gated = environmentHasLocationRules(environment);
    if (!this.locationResolver || !gated) {
      return {
        blockedReasons: [],
        location: {
          gated: false,
          available: true,
          source: 'unresolved',
          currentRealms: [],
          guidance: null,
        },
      };
    }

    const systemId = stringOrNull(environment?.craftingSystemId);
    const context = this._resolveRealmContext({ actor, systemId, cache: realmContextCache });
    const availability = evaluateLocationAvailability(environment, context);
    const isGM = viewer?.isGM === true;
    const revealMode = this._realmRevealMode(system);
    const realmsById = new Map(
      (Array.isArray(system?.gatheringRealms) ? system.gatheringRealms : []).map((realm) => [
        realm.id,
        realm,
      ])
    );
    const discoveredRealmIds = actor ? getDiscoveredRealmIdsForSystem(actor, systemId) : new Set();

    const currentRealms = (Array.isArray(context?.realms) ? context.realms : []).map((realm) =>
      buildRealmDisclosure(realm, {
        isGM,
        discovered: discoveredRealmIds.has(realm?.id),
        revealMode,
      })
    );

    const location = {
      gated: true,
      available: availability.available === true,
      source: stringOrNull(context?.source) || 'unresolved',
      currentRealms,
      guidance: null,
    };

    if (availability.available === true) {
      return { blockedReasons: [], location };
    }

    const guidance = buildTravelGuidance({
      environment,
      realmsById,
      currentRealmContext: context,
      availability,
      discoveredRealmIds,
      isGM,
      revealMode,
    });
    location.guidance = guidance;

    const code = availability.reasons.includes('NO_CURRENT_REALM')
      ? 'NO_CURRENT_REALM'
      : 'LOCATION_BLOCKED';
    return {
      blockedReasons: [this._blockedReason(code, { data: guidance })],
      location,
    };
  }

  /**
   * Resolve the party's current-realm summary for the header bar, independent of
   * whether THIS environment is location-gated. Unlike the `location` field (which
   * only discloses current realms for a gated environment), this surfaces the
   * party's current realm for the system whenever the realm/travel subsystem is
   * enabled, so the player header can show "current realm / no realm selected".
   * Reuses the per-listing realm-context cache and the same redaction policy as
   * the gated path (`buildRealmDisclosure`).
   *
   * @param {object} args
   * @returns {{ realmsEnabled: boolean, currentRealms: object[] }}
   */
  _currentRealmSummary({ environment, system = null, viewer, actor, realmContextCache = null }) {
    if (!isGatheringRealmsEnabled(system)) {
      return { realmsEnabled: false, currentRealms: [] };
    }
    const systemId = stringOrNull(environment?.craftingSystemId);
    const context = this._resolveRealmContext({ actor, systemId, cache: realmContextCache });
    const isGM = viewer?.isGM === true;
    const revealMode = this._realmRevealMode(system);
    const discoveredRealmIds = actor ? getDiscoveredRealmIdsForSystem(actor, systemId) : new Set();
    const currentRealms = (Array.isArray(context?.realms) ? context.realms : []).map((realm) =>
      buildRealmDisclosure(realm, {
        isGM,
        discovered: discoveredRealmIds.has(realm?.id),
        revealMode,
      })
    );
    return { realmsEnabled: true, currentRealms };
  }

  /**
   * Resolve the listing-level current-realm context for the player header chip,
   * independent of which environment (if any) is selected. The current realm is a
   * property of the party/system, so the chip must surface it even when every
   * environment is realm-locked and none is selectable.
   *
   * The active system is derived from the listing's environments: the field is
   * enabled ONLY when exactly ONE realm-enabled gathering system is present among
   * them (the system-singularity rule). A single chip cannot honestly represent
   * two systems' realm contexts at once (per-system overrides/reveal modes differ),
   * so an ambiguous multi-system listing falls back to selection-driven behavior
   * with `{ enabled: false, ... }`. Disambiguation keys on system identity, not
   * realm-equality.
   *
   * The realms are resolved through `_currentRealmSummary` (NOT raw
   * `context.realms`) so disclosure/redaction stays byte-for-byte identical to the
   * per-environment path, reusing the per-listing `realmContextCache` so it hits
   * the already-memoized context.
   *
   * The returned object deliberately uses the STORE contract keys
   * (`enabled`/`realms`, NOT the helper's `realmsEnabled`/`currentRealms`) so the
   * View can pass it straight through `setRealmContext` with no remapping — keep
   * these keys so a future "inconsistent key" cleanup does not re-break it.
   *
   * @param {object} args
   * @returns {{ enabled: boolean, realms: object[], systemId: string|null }}
   */
  _listingRealmContext({
    environmentModels,
    environments,
    systems,
    viewer,
    actor,
    realmContextCache = null,
  }) {
    const realmEnabledSystemIds = [
      ...new Set(
        normalizeList(environmentModels)
          .filter((model) => model?.realmsEnabled === true)
          .map((model) => stringOrNull(model?.craftingSystemId))
          .filter(Boolean)
      ),
    ];
    // System-singularity rule: a single chip can only honestly represent one
    // system's realm context. Zero realm-enabled systems → chip stays hidden;
    // more than one → ambiguous, fall back to selection-driven behavior.
    if (realmEnabledSystemIds.length !== 1) {
      return { enabled: false, realms: [], systemId: null };
    }
    const systemId = realmEnabledSystemIds[0];
    const environment = normalizeList(environments).find(
      (candidate) => stringOrNull(candidate?.craftingSystemId) === systemId
    );
    const summary = this._currentRealmSummary({
      environment,
      system: systems.get(systemId),
      viewer,
      actor,
      realmContextCache,
    });
    return {
      enabled: summary.realmsEnabled === true,
      realms: summary.currentRealms,
      systemId,
    };
  }

  _realmRevealMode(system) {
    const mode = system?.gatheringRealmSettings?.revealMode;
    return mode === 'alwaysVisible' || mode === 'onPartyTokenEntry' ? mode : 'manual';
  }

  async _checkSceneAccess({ environment, viewer, actor }) {
    if (typeof this.sceneAccess?.canAttempt === 'function') {
      return normalizeGateResult(await this.sceneAccess.canAttempt({ environment, viewer, actor }));
    }
    return { allowed: false, code: 'SCENE_TOKEN_BLOCKED' };
  }

  /**
   * Collect the blocked-reason list for a single task (game-paused, duplicate
   * run, tool, conditions, scene, and rich-attempt gates).
   *
   * @param {object} args
   * @param {object} args.environment Composed environment.
   * @param {object} args.system Owning crafting system.
   * @param {object} args.task Composed/normalized task.
   * @param {object} args.actor Selected actor.
   * @param {object} args.viewer Foundry user requesting the listing.
   * @param {boolean} [args.transparent=false] When `true`, bypass the
   *   `_isOpaqueBlindTask` data redaction so a revealed/discovered blind task's
   *   row keeps its real required-weather/time and missing-tool details. No
   *   other behavior changes. Targeted tasks and GM viewers are already
   *   transparent regardless of this flag.
   * @returns {Promise<object[]>} The task's blocked reasons.
   */
  async _taskBlockedReasons({
    environment,
    system,
    task,
    actor,
    viewer,
    transparent = false,
    presentTools = null,
  }) {
    const blockedReasons = [];
    // For a revealed/discovered blind task (`transparent`), keep the real
    // blocked-reason data — the row needs the actual required weather/time and
    // missing-tool details. For an opaque blind task, the data stays nulled.
    const redact = !transparent && this._isOpaqueBlindTask({ environment, viewer });
    if (this._gamePaused()) {
      blockedReasons.push(this._blockedReason('GAME_PAUSED'));
    }

    if (this.runManager?.findActiveRunForTask?.(actor, task.id)) {
      blockedReasons.push(
        this._blockedReason('DUPLICATE_ACTIVE_RUN', {
          data: redact ? null : { taskId: task.id },
        })
      );
    }

    const taskTools = this._resolveTaskTools({ environment, task });
    if (this._hasBlockedToolReferences(taskTools)) {
      blockedReasons.push(
        this._blockedReason('TOOL_BLOCKED', {
          data: redact ? null : this._toolBlockedData({ task, resolvedTools: taskTools }),
        })
      );
    } else if (taskTools.tools.length > 0) {
      const toolResult = await this._checkTools({
        actor,
        viewer,
        system,
        environment,
        task,
        tools: taskTools.tools,
        presentTools,
      });
      if (toolResult.available !== true) {
        blockedReasons.push(
          this._blockedReason('TOOL_BLOCKED', {
            data: redact
              ? null
              : this._toolBlockedData({ task, resolvedTools: taskTools, toolResult }),
          })
        );
      }
    }

    // Weather/time-of-day are runtime gates: a task may match the environment
    // (biome/danger) but be inactive when current conditions don't satisfy its
    // required `weather` / `timeOfDay` values.
    const conditionsResult = evaluateEnvironmentMatch(
      task,
      environment,
      environment?.conditions || {},
      { includeDanger: false }
    );
    if (conditionsResult.conditionsMet === false) {
      blockedReasons.push(
        this._blockedReason('CONDITIONS_BLOCKED', {
          data: redact
            ? null
            : {
                taskId: task.id,
                requiredWeather: conditionsResult.evidence?.weather?.recordValues ?? [],
                requiredTimeOfDay: conditionsResult.evidence?.time?.recordValues ?? [],
              },
        })
      );
    }

    const richAttempt = await this._evaluateRichAttempt({
      actor,
      viewer,
      system,
      environment,
      task,
      transparent,
    });
    blockedReasons.push(...richAttempt.blockedReasons);

    return blockedReasons;
  }

  _resolveTaskTools({ environment, task }) {
    const tools = [];
    const missingToolIds = [];
    const disabledToolIds = [];
    const library =
      environment?.__libraryTools instanceof Map ? environment.__libraryTools : new Map();

    for (const toolId of normalizeStringList(task?.toolIds)) {
      const tool = library.get(toolId) ?? null;
      if (!tool) {
        missingToolIds.push(toolId);
        continue;
      }
      if (tool.enabled === false) {
        disabledToolIds.push(toolId);
        continue;
      }
      tools.push(tool);
    }

    tools.push(...normalizeList(task?.tools));
    return { tools, missingToolIds, disabledToolIds };
  }

  /**
   * Build the player-facing required-tools list for a task, each entry tagged
   * with the actor's per-tool state for display:
   * `{ id, name, img, state: 'present'|'damaged'|'missing', required: true }`.
   *
   * Resolved tools are classified via {@link classifyGatheringToolStates} (the
   * same matcher attempt validation uses, so the state agrees with whether the
   * attempt is blocked); unresolved/disabled library tool refs are surfaced as
   * `missing`. Display `name`/`img` come from the tool's `componentId` resolved
   * against the crafting system's components (tool `label` wins when set), with
   * a safe fallback. Tolerant of a null actor/system.
   *
   * @returns {Array<{id: string|null, name: string, img: string,
   *                  state: 'present'|'damaged'|'missing', required: boolean}>}
   */
  _resolveTaskToolStates({ actor, system, environment, task, presentTools = null }) {
    const { tools, missingToolIds, disabledToolIds } = this._resolveTaskTools({
      environment,
      task,
    });
    const componentsById = this._componentsById(system);
    const states = classifyGatheringToolStates({
      actor,
      system,
      task,
      tools,
      craftingSystemManager: this.systemManager,
      presentTools,
    });

    const resolved = states.map(({ tool, state }) => {
      const component = componentsById.get(stringOrNull(tool?.componentId)) ?? null;
      const name =
        stringOrNull(tool?.label) ||
        stringOrEmpty(component?.name) ||
        this.localize(UNKNOWN_TOOL_LABEL_KEY);
      const img = stringOrNull(component?.img) || DEFAULT_TOOL_IMG;
      return {
        id: stringOrNull(tool?.id) || stringOrNull(tool?.componentId),
        name,
        img,
        state,
        required: true,
      };
    });

    // Unresolved (missing) and disabled library tool references can't be matched
    // against actor inventory; surface them as missing so the player still sees
    // an entry. Their display falls back to the raw id.
    for (const toolId of [...normalizeList(missingToolIds), ...normalizeList(disabledToolIds)]) {
      const id = stringOrNull(toolId);
      if (!id) continue;
      resolved.push({
        id,
        name: id,
        img: DEFAULT_TOOL_IMG,
        state: 'missing',
        required: true,
      });
    }

    return resolved;
  }

  _componentsById(system) {
    const map = new Map();
    if (!system?.id || typeof this.systemManager?.getItems !== 'function') return map;
    let components;
    try {
      components = normalizeList(this.systemManager.getItems(system.id));
    } catch {
      return map;
    }
    for (const component of components) {
      const id = stringOrNull(component?.id);
      if (id) map.set(id, component);
    }
    return map;
  }

  _hasBlockedToolReferences(resolvedTools) {
    return (
      normalizeList(resolvedTools?.missingToolIds).length > 0 ||
      normalizeList(resolvedTools?.disabledToolIds).length > 0
    );
  }

  _toolBlockedData({ task, resolvedTools, toolResult = null }) {
    return {
      taskId: stringOrNull(task?.id),
      missingToolIds: normalizeList(resolvedTools?.missingToolIds),
      disabledToolIds: normalizeList(resolvedTools?.disabledToolIds),
      missing: normalizeList(toolResult?.missing),
      failedRequirements: normalizeList(toolResult?.failedRequirements),
    };
  }

  async _checkTools({ actor, viewer, system, environment, task, tools, presentTools = null }) {
    if (typeof this.toolAvailability?.check === 'function') {
      return normalizeToolResult(
        await this.toolAvailability.check({
          actor,
          viewer,
          system,
          environment,
          task,
          tools,
          presentTools,
        })
      );
    }
    // Fallback: treat a tool as satisfied when virtually present (canvas Tool).
    // System-scoped: a present tool only counts when the active tool's systemId
    // matches this task's crafting system (componentId is a per-system id).
    const presentSet = resolvePresentComponentIds({
      presentTools,
      systemId: system?.id ?? task?.craftingSystemId ?? null,
    });
    const missing = tools.filter((tool) => !presentSet.has(tool?.componentId));
    return missing.length === 0
      ? { available: true, missing: [], failedRequirements: [] }
      : { available: false, missing, failedRequirements: [] };
  }

  /**
   * Build the per-task model surfaced in the player listing. For an opaque
   * blind task (non-GM viewer of a blind environment) it returns the collapsed
   * `blindGather` action with task identity redacted; otherwise it returns the
   * full transparent model, including a `successChance` (see
   * {@link GatheringEngine#_taskSuccessChance}). The opaque branch never carries
   * `successChance`, so aggregate drop info cannot leak.
   *
   * @param {object} args
   * @param {object} args.task Composed/normalized task.
   * @param {object} args.environment Composed environment.
   * @param {object|null} [args.actor=null] Selected actor.
   * @param {object} args.viewer Foundry user requesting the listing.
   * @param {object} args.visibility Resolved task visibility metadata.
   * @param {object[]} args.blockedReasons Precomputed blocked reasons for the task.
   * @param {boolean} [args.forceVisible=false] When `true`, skip the opaque
   *   blind collapse and build the transparent model even for a non-GM viewer
   *   of a blind environment — used for already-revealed tasks in the
   *   "Discovered Tasks" list. All callers use the object form, so the added
   *   key is safe.
   * @returns {object} The task model.
   */
  _taskModel({
    task,
    environment,
    actor = null,
    viewer,
    visibility,
    blockedReasons,
    forceVisible = false,
    tools = null,
  }) {
    const blind = environment.selectionMode === 'blind';
    // `forceVisible` builds a transparent model for an already-revealed blind
    // task (the "Discovered Tasks" list) — it bypasses the opaque collapse that
    // otherwise hides task identity from non-GM viewers of a blind environment.
    const opaqueBlind = !forceVisible && this._isOpaqueBlindTask({ environment, viewer });
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
          diagnostic: null,
        },
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
        diagnostic: visibility.diagnostic ?? null,
      },
      resolutionMode: stringOrNull(task.resolutionMode),
      hasTimeRequirement: Boolean(task.timeRequirement),
      successChance:
        typeof this.richState?.taskSuccessChance === 'function'
          ? this.richState.taskSuccessChance(task, environment)
          : this._taskSuccessChance(task),
      tools: Array.isArray(tools) ? tools : [],
      rich,
    };
  }

  _richListingMetadata({ environment, task, actor = null, viewer = null }) {
    if (typeof this.richState?.buildListingMetadata === 'function') {
      return this.richState.buildListingMetadata({ environment, task, actor, viewer });
    }
    return {
      nodes: task?.nodes
        ? {
            enabled: true,
            available: Number(task.nodes.current || 0) > 0,
            current: Number(task.nodes.current || 0),
            max: Number(task.nodes.max || 0),
          }
        : null,
      stamina: Number(task?.staminaCost || 0) > 0 ? { cost: Number(task.staminaCost) } : null,
      risk: task?.riskOverride || environment?.risk || 'safe',
      conditions: plainObjectOrNull(environment?.conditions) || {},
    };
  }

  /**
   * Evaluate the rich-state attempt gate for a task and map its blocked reasons
   * into the listing's blocked-reason shape.
   *
   * @param {object} args
   * @param {object} args.actor Selected actor.
   * @param {object} args.viewer Foundry user requesting the listing.
   * @param {object} args.system Owning crafting system.
   * @param {object} args.environment Composed environment.
   * @param {object} args.task Composed/normalized task.
   * @param {boolean} [args.transparent=false] When `true`, keep the real
   *   per-reason `data` for a revealed/discovered blind task instead of nulling
   *   it via the `_isOpaqueBlindTask` redaction.
   * @returns {Promise<{blockedReasons: object[], evidence: object}>} Mapped
   *   blocked reasons and the rich-listing evidence.
   */
  async _evaluateRichAttempt({
    actor,
    viewer,
    system,
    environment,
    task,
    transparent = false,
    interactableRef = null,
  }) {
    if (typeof this.richState?.evaluateStart !== 'function') {
      return {
        blockedReasons: [],
        evidence: this._richListingMetadata({ environment, task, actor, viewer }),
      };
    }
    const result = await this.richState.evaluateStart({
      actor,
      viewer,
      system,
      environment,
      task,
      interactableRef,
    });
    const redact = !transparent && this._isOpaqueBlindTask({ environment, viewer });
    return {
      blockedReasons: normalizeList(result?.blockedReasons).map((reason) =>
        this._blockedReason(reason.code || 'BLOCKED', {
          messageKey: reason.messageKey,
          message: reason.message,
          data: redact ? null : reason.data,
        })
      ),
      evidence: plainObjectOrNull(result?.evidence) || {},
    };
  }

  _isOpaqueBlindTask({ environment, viewer }) {
    return environment.selectionMode === 'blind' && viewer?.isGM !== true;
  }

  _gamePaused() {
    return typeof this.isGamePaused === 'function' && this.isGamePaused() === true;
  }

  async _resolveStartContext({ viewer, actor, rememberedActorId, environmentId, taskId }) {
    const selectableActors = normalizeActorList(
      await callMaybe(this.getSelectableActors, { viewer })
    );
    if (selectableActors.length === 0) {
      return { blockedReason: this._blockedReason('NO_SELECTABLE_ACTORS') };
    }

    const selected = this._resolveSelectedActor({
      actor,
      rememberedActorId,
      selectableActors,
      viewer,
    });
    if (selected.blockedReason) {
      return { actor: null, blockedReason: selected.blockedReason };
    }

    const environment = this._findEnvironment(environmentId);
    if (!environment) {
      return {
        actor: selected.actor,
        blockedReason: this._blockedReason('MISSING_REFERENCE', {
          data: { environmentId: stringOrNull(environmentId) },
        }),
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
            craftingSystemId: stringOrNull(environment.craftingSystemId),
          },
        }),
      };
    }

    const blindAuto = environment?.selectionMode === 'blind' && !stringOrNull(taskId);
    const task = blindAuto
      ? await this._selectBlindStartTask({ environment, system, actor: selected.actor, viewer })
      : this._findStartTask({ environment, taskId });
    if (!task) {
      return {
        actor: selected.actor,
        environment,
        blockedReason: blindAuto
          ? this._blockedReason('BLIND_NO_CANDIDATE')
          : this._blockedReason('MISSING_REFERENCE', {
              data: {
                environmentId: environment.id,
                taskId: stringOrNull(taskId),
              },
            }),
      };
    }

    return { selectedActor: selected.actor, system, environment, task };
  }

  _findEnvironment(environmentId) {
    const id = stringOrNull(environmentId);
    if (!id) return null;
    if (typeof this.environmentStore?.get === 'function') {
      const environment = this.environmentStore.get(id);
      if (environment) {
        const system = this._allSystems().get(String(environment.craftingSystemId));
        return this._composeEnvironment(environment, system);
      }
    }
    const environment =
      normalizeList(this.environmentStore?.list?.()).find(
        (environment) => environment?.id === id
      ) ?? null;
    if (!environment) return null;
    const system = this._allSystems().get(String(environment.craftingSystemId));
    return this._composeEnvironment(environment, system);
  }

  _findStartTask({ environment, taskId }) {
    const tasks = normalizeList(environment?.tasks);
    const id = stringOrNull(taskId);
    if (!id) return null;
    return tasks.find((task) => task?.id === id) ?? null;
  }

  /**
   * Resolve which task a blind gather attempt starts. Builds the candidate pool
   * from visible+enabled tasks, gates by attemptability when the system's
   * `blindCandidateGate` is `attemptableOnly` (default), then draws via weighted
   * random over `blindSelection.weights` (default weight `1`, non-positive
   * excludes). Returns null when the pool is empty.
   */
  async _selectBlindStartTask({ environment, system, actor, viewer }) {
    const visibleTasks = await this._visibleTaskListings({ environment, system, viewer, actor });
    let pool = visibleTasks.map((entry) => entry.task);

    const gate =
      environment?.rules?.blindCandidateGate === 'allMatching' ? 'allMatching' : 'attemptableOnly';
    if (gate === 'attemptableOnly') {
      const attemptable = [];
      for (const task of pool) {
        const reasons = await this._taskBlockedReasons({
          environment,
          system,
          task,
          actor,
          viewer,
        });
        if (reasons.length === 0) attemptable.push(task);
      }
      pool = attemptable;
    }

    if (pool.length === 0) return null;
    return this._pickBlindTask(pool, environment?.blindSelection);
  }

  _pickBlindTask(pool, blindSelection) {
    return this._weightedPickTask(pool, blindSelection?.weights) ?? pool[0] ?? null;
  }

  _weightedPickTask(pool, weights) {
    const map = weights && typeof weights === 'object' ? weights : {};
    const weighted = pool
      .map((task) => {
        const raw = Number(map[task.id]);
        const hasEntry = Object.prototype.hasOwnProperty.call(map, task.id);
        const weight = Number.isFinite(raw) ? raw : hasEntry ? 0 : 1;
        return { task, weight: Math.max(weight, 0) };
      })
      .filter((entry) => entry.weight > 0);
    if (weighted.length === 0) return null;
    const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
    let roll = this.random() * total;
    for (const entry of weighted) {
      roll -= entry.weight;
      if (roll < 0) return entry.task;
    }
    return weighted.at(-1).task;
  }

  _validateStartTask(task, system = null) {
    const errors = validateTaskConfiguration(task, system);
    return {
      valid: errors.length === 0,
      errors,
    };
  }

  async _startWaitingAttempt({
    viewer,
    actor,
    system,
    environment,
    task,
    richAttempt = null,
    interactableRef = null,
  }) {
    if (typeof this.runManager?.createWaitingRun !== 'function') {
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
            code: 'MISSING_RUN_MANAGER',
          }),
        }),
      });
    }

    const runData = {
      craftingSystemId: stringOrNull(system.id),
      environmentId: stringOrNull(environment.id),
      taskId: stringOrNull(task.id),
    };
    // Persist the scene-interactable ref so a timed run that matures later
    // decrements the SAME scoped node it gated against (issue 302). Null/absent
    // for the environment-scoped flow (no behaviour stored).
    const persistedRef = normalizeInteractableRef(interactableRef);
    if (persistedRef) runData.interactableRef = persistedRef;
    if (hasRichGatheringData(environment, task) || task.resolutionMode === 'd100') {
      const richPayload = this._richHistoryPayload({ environment, task, richAttempt, viewer });
      richPayload.economyEvidence = {
        ...richPayload.economyEvidence,
        runtimeSnapshot: this._runtimeSnapshot({ environment, task }),
      };
      Object.assign(runData, richPayload);
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
              diagnostics: run?.diagnostics ?? run?.diagnostic,
            }),
          }),
        });
      }

      const richEvidence = await this._commitRichAttempt({
        actor,
        system,
        environment,
        task,
        outcome: { status: 'waitingTime' },
        viewer,
        interactableRef,
      });
      const waitingRun =
        richEvidence && typeof richEvidence === 'object'
          ? {
              ...run,
              economyEvidence: {
                ...run.economyEvidence,
                ...richEvidence,
              },
            }
          : run;
      return this._startedWaitingStart({
        viewer,
        actor,
        system,
        environment,
        task,
        run: waitingRun,
      });
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
            code: stringOrNull(error?.code) || stringOrNull(error?.name) || 'RUN_MANAGER_ERROR',
          }),
        }),
      });
    }
  }

  async _resolveImmediateAttempt({
    viewer,
    actor,
    system,
    environment,
    task,
    richAttempt = null,
    presentTools = null,
    interactableRef = null,
  }) {
    const outcome =
      task.resolutionMode === 'd100'
        ? await this._resolveD100Outcome({ viewer, actor, system, environment, task })
        : task.resolutionMode === 'progressive'
          ? await this._resolveProgressiveOutcome({ viewer, actor, system, environment, task })
          : await this._resolveRoutedOutcome({ viewer, actor, system, environment, task });

    if (outcome.status === 'misconfigured') {
      return this._blockedStart({
        viewer,
        actor,
        environment,
        task,
        reason: this._blockedReason('TASK_MISCONFIGURED', {
          data: this._terminalMisconfigurationData({ environment, task, viewer, outcome }),
        }),
      });
    }

    if (typeof this.runManager?.createTerminalRun !== 'function') {
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
            code: 'MISSING_RUN_MANAGER',
          }),
        }),
      });
    }

    const checkResult = plainObjectOrNull(outcome.checkResult) ?? undefined;
    const plan = await this._terminalSideEffectPlan({
      viewer,
      actor,
      system,
      environment,
      task,
      outcome,
      checkResult,
      presentTools,
    });
    if (plan.status === 'misconfigured') {
      return this._blockedStart({
        viewer,
        actor,
        environment,
        task,
        reason: this._blockedReason('TASK_MISCONFIGURED', {
          data: this._terminalMisconfigurationData({ environment, task, viewer, outcome: plan }),
        }),
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
      plan,
    });
    const richPayload = this._richHistoryPayload({
      environment,
      task,
      richAttempt,
      viewer,
      characterModifierSnapshot: outcome?.characterModifierSnapshot ?? null,
    });
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
            code: stringOrNull(error?.code) || stringOrNull(error?.name) || 'RUN_MANAGER_ERROR',
          }),
        }),
      });
    }

    const richEvidence = await this._commitRichAttempt({
      actor,
      system,
      environment,
      task,
      outcome,
      viewer,
      interactableRef,
    });
    if (richEvidence && typeof richEvidence === 'object') {
      run = {
        ...run,
        economyEvidence: {
          ...run.economyEvidence,
          ...richEvidence,
        },
      };
    }

    await this._commitTerminalSideEffects({
      viewer,
      actor,
      system,
      environment,
      task,
      outcome,
      checkResult,
      presentTools,
    });

    return await this._terminalStart({
      viewer,
      actor,
      system,
      environment,
      task,
      status: outcome.status,
      run,
      createdResults: plan.createdResults,
      usedTools: plan.usedTools ?? [],
      checkResult,
    });
  }

  async _terminalSideEffectPlan({
    viewer,
    actor,
    system,
    environment,
    task,
    outcome,
    checkResult,
    presentTools = null,
  }) {
    try {
      const usedTools = await this._planTerminalTools({
        viewer,
        actor,
        system,
        environment,
        task,
        outcome,
        checkResult,
        presentTools,
      });
      if (usedTools?.status === 'misconfigured') return usedTools;

      const toolBroke =
        Array.isArray(usedTools) && usedTools.some((entry) => entry?.broken === true);
      if (toolBroke && resolveToolBreakagePolicy(environment) === 'failureOnBreak') {
        outcome.status = 'failed';
        outcome.resultGroups = [];
      }

      const createdResults =
        outcome.status === 'succeeded'
          ? await this._planGatheredResults({ viewer, actor, system, environment, task, outcome })
          : [];
      if (createdResults?.status === 'misconfigured') return createdResults;

      return {
        status: 'ready',
        createdResults,
        usedTools: Array.isArray(usedTools) ? usedTools : [],
      };
    } catch (error) {
      return misconfiguredOutcome({
        code: stringOrNull(error?.code) || stringOrNull(error?.name) || 'TERMINAL_PLAN_FAILED',
        message: stringOrNull(error?.message) || 'Terminal side-effect planning failed',
      });
    }
  }

  _terminalHistoryWrite({ viewer, system, environment, task, outcome, checkResult, plan }) {
    const characterModifierSnapshot = outcome?.characterModifierSnapshot ?? null;
    const opaqueBlind = this._isOpaqueBlindTask({ environment, viewer });
    if (opaqueBlind) {
      return {
        runData: {
          craftingSystemId: stringOrNull(system.id),
          environmentId: stringOrNull(environment.id),
          taskId: 'blind',
        },
        payload: {
          createdResults: [],
          usedTools: [],
          checkResult: { blind: true, status: outcome.status },
          ...this._richHistoryPayload({ environment, task, viewer, characterModifierSnapshot }),
        },
      };
    }

    const payload = {
      createdResults: plan.createdResults,
      usedTools: plan.usedTools ?? [],
    };
    if (checkResult !== undefined) payload.checkResult = checkResult;
    Object.assign(
      payload,
      this._richHistoryPayload({ environment, task, viewer, characterModifierSnapshot })
    );

    return {
      runData: {
        craftingSystemId: stringOrNull(system.id),
        environmentId: stringOrNull(environment.id),
        taskId: stringOrNull(task.id),
      },
      payload,
    };
  }

  _richHistoryPayload({
    environment,
    task,
    richAttempt = null,
    viewer = null,
    characterModifierSnapshot = null,
  }) {
    if (!hasRichGatheringData(environment, task)) return {};
    const opaqueBlind = viewer ? this._isOpaqueBlindTask({ environment, viewer }) : false;
    const evidence =
      plainObjectOrNull(richAttempt?.evidence) ||
      this._richListingMetadata({ environment, task, viewer });
    if (characterModifierSnapshot && typeof characterModifierSnapshot === 'object') {
      evidence.characterModifierSnapshot = cloneJson(characterModifierSnapshot);
    }
    const payload = {
      economyEvidence: opaqueBlind ? redactRichEvidence(evidence, { viewer }) : evidence,
      conditionSnapshot: plainObjectOrNull(environment?.conditions) || {},
      riskLevel: stringOrNull(task?.riskOverride) || stringOrNull(environment?.risk) || 'safe',
    };
    if (characterModifierSnapshot && typeof characterModifierSnapshot === 'object') {
      const cloned = cloneJson(characterModifierSnapshot);
      payload.characterModifierSnapshot = opaqueBlind
        ? redactCharacterModifierSnapshot(cloned)
        : cloned;
    } else {
      payload.characterModifierSnapshot = null;
    }
    return payload;
  }

  _runtimeSnapshot({ environment, task }) {
    return {
      task: cloneJson(task),
      events: normalizeList(environment?.events).map((event) => cloneJson(event)),
      rules: plainObjectOrNull(environment?.rules) || {},
      useLegacyTaskItemSelectionMode: environment?.useLegacyTaskItemSelectionMode === true,
      eventSelectionMode: stringOrNull(environment?.eventSelectionMode),
      eventLimit: environment?.eventLimit,
      eventPolicy: stringOrNull(environment?.eventPolicy),
      conditions: plainObjectOrNull(environment?.conditions) || {},
    };
  }

  async _commitRichAttempt({
    actor,
    system,
    environment,
    task,
    outcome,
    viewer = null,
    interactableRef = null,
  }) {
    if (typeof this.richState?.commitAcceptedAttempt !== 'function') return null;
    return this.richState.commitAcceptedAttempt({
      actor,
      system,
      environment,
      task,
      outcome,
      viewer,
      interactableRef,
    });
  }

  async _commitTerminalSideEffects({
    viewer,
    actor,
    system,
    environment,
    task,
    outcome,
    checkResult,
    presentTools = null,
  }) {
    if (outcome.status === 'succeeded') {
      await this._createGatheredResults({ viewer, actor, system, environment, task, outcome });
    }
    await this._applyTerminalTools({
      viewer,
      actor,
      system,
      environment,
      task,
      outcome,
      presentTools,
    });
    if (outcome.status === 'failed') {
      await this._applyFailureFeedback({
        viewer,
        actor,
        system,
        environment,
        task,
        outcome,
        checkResult,
      });
    }
    await this.eventSceneTrigger?.apply?.({
      events: checkResult?.events,
      viewer,
      actor,
      system,
      environment,
      task,
    });
  }

  async _resolveRoutedOutcome({ actor, system, task }) {
    // Routed gathering resolves exclusively through the system-level gathering
    // check (Checks editor): roll the configured routed formula and map its total
    // onto a named outcome tier, then route that tier name to a result group by
    // name — the same name-matching the crafting/salvage routed paths use as their
    // tier fallback. With no system routed roll formula the task is misconfigured.
    const routed = system?.gatheringCraftingCheck?.routed;
    const rollFormula = stringOrNull(routed?.rollFormula);
    if (!rollFormula) {
      return misconfiguredOutcome({
        code: 'MISSING_ROUTED_CHECK',
        message: 'Routed gathering resolution requires a system-level gathering check roll formula',
      });
    }

    return this._resolveRoutedFormulaOutcome({ routed, rollFormula, actor, task });
  }

  /**
   * Resolve a routed gathering outcome from the system-level routed roll formula.
   * Rolls via the shared {@link runFormulaRouted}, with the base DC resolved as the
   * per-task `dcOverride` (when finite) else the routed check's own `dc` (default
   * 15) — mirroring salvage's `_resolveSalvageDc`. The matched tier NAME is routed
   * to a result group whose name matches it (case-insensitive); a failing or
   * unmatched tier produces a terminal failure. The tier name and disposition are
   * surfaced on `checkResult` and the outcome flows through the same
   * `normalizeTerminalOutcome` machinery the provider path uses.
   * @private
   */
  async _resolveRoutedFormulaOutcome({ routed, rollFormula, actor, task }) {
    const rolled = await runFormulaRouted({
      formula: rollFormula,
      dc: this._resolveGatheringRoutedDc(routed, task),
      thresholdMode: routed.thresholdMode,
      type: routed.type,
      relativeOutcomes: routed.relativeOutcomes,
      fixedOutcomes: routed.fixedOutcomes,
      diceCrits: routed.diceCrits,
      actor,
      label: 'Gathering',
    });

    const outcomeName = stringOrNull(rolled.outcome);
    const checkResult = {
      outcome: outcomeName,
      value: rolled.value,
      success: rolled.success === true,
      data: rolled.data ?? {},
    };

    // A failing tier (or no tier match) routes to a terminal failure; a succeeding
    // tier routes to the result group whose name matches the tier name.
    if (rolled.success !== true || !outcomeName) {
      return normalizeTerminalOutcome({ status: 'failed', outcome: outcomeName, checkResult });
    }
    // Gathering keeps ALL same-named groups (`firstOnly: false`); the per-system
    // routing key (the success tier name) stays in the caller above.
    const matched = matchResultGroupsByName(outcomeName, normalizeList(task.resultGroups), {
      firstOnly: false,
    });
    return normalizeTerminalOutcome({
      status: 'succeeded',
      outcome: outcomeName,
      resultGroups: matched,
      checkResult,
    });
  }

  /**
   * Resolve the routed gathering check base DC: the per-task `dcOverride` (when a
   * finite number) else the routed check sub-object's `dc` (fallback 15). Mirrors
   * the salvage `_resolveSalvageDc` resolution.
   * @private
   */
  _resolveGatheringRoutedDc(routed, task) {
    const override = task?.dcOverride;
    if (Number.isFinite(override)) return Math.trunc(override);
    const dc = Number(routed?.dc);
    return Number.isFinite(dc) ? Math.trunc(dc) : 15;
  }

  async _resolveD100Outcome({ viewer, actor, system, environment, task }) {
    if (typeof this.richState?.resolveD100Attempt !== 'function') {
      return misconfiguredOutcome({
        code: 'MISSING_D100_RESOLVER',
        message: 'D100 gathering resolution requires a rich gathering resolver',
      });
    }
    const gatheringModifier = Number(
      task?.gatheringModifier?.value ?? task?.gatheringModifier ?? 0
    );
    const eventModifier = Number(
      environment?.eventModifier?.value ?? environment?.eventModifier ?? 0
    );
    const resolved = await this.richState.resolveD100Attempt({
      task,
      environment,
      actor,
      viewer,
      system,
      gatheringModifier: Number.isFinite(gatheringModifier) ? gatheringModifier : 0,
      eventModifier: Number.isFinite(eventModifier) ? eventModifier : 0,
    });
    if (resolved?.status === 'misconfigured') {
      return misconfiguredOutcome({
        code: 'CHARACTER_MODIFIER_MISCONFIGURED',
        diagnostics: normalizeList(resolved.diagnostics),
      });
    }
    const resultGroups = [
      {
        id: `${task.id}-d100-results`,
        name: task.name || 'Gathered',
        results: normalizeList(resolved?.items).map((item) => ({
          id: item.id,
          componentId: stringOrNull(item.componentId),
          itemUuid: stringOrNull(item.itemUuid),
          quantity: Number(item.quantity || 1),
        })),
      },
    ];
    return {
      status: resolved?.status === 'failed' ? 'failed' : 'succeeded',
      resultGroups,
      characterModifierSnapshot: resolved?.characterModifierSnapshot || null,
      checkResult: {
        provider: 'd100',
        items: normalizeList(resolved?.items),
        events: normalizeList(resolved?.events),
        eventPolicy: stringOrNull(resolved?.eventPolicy),
        characterModifierSnapshot: resolved?.characterModifierSnapshot || null,
      },
    };
  }

  async _resolveProgressiveOutcome({ viewer, actor, system, environment, task }) {
    const checkResult = await this._evaluateGatheringCheck({
      actor,
      viewer,
      system,
      environment,
      task,
    });
    const normalizedCheck = normalizeCheckResult(checkResult);
    if (normalizedCheck.diagnostic) {
      return misconfiguredOutcome({
        code: normalizedCheck.reasonCode || 'CHECK_DIAGNOSTIC',
        message: normalizedCheck.diagnostic.message,
        checkResult: normalizedCheck,
      });
    }

    if (normalizedCheck.status === 'failure' || normalizedCheck.success === false) {
      return {
        status: 'failed',
        resultGroups: [],
        checkResult: normalizedCheck,
      };
    }

    const raw =
      typeof this.resultResolver?.resolveProgressive === 'function'
        ? await this.resultResolver.resolveProgressive({
            actor,
            viewer,
            system,
            environment,
            task,
            checkResult: normalizedCheck,
          })
        : resolveProgressiveAward({ system, task, checkResult: normalizedCheck });
    const outcome = normalizeTerminalOutcome({
      checkResult: normalizedCheck,
      ...raw,
    });
    if (outcome.status === 'misconfigured') return outcome;

    if (
      outcome.status === 'succeeded' &&
      !hasAwardedResults(outcome.resultGroups) &&
      normalizedCheck.status !== 'success'
    ) {
      return {
        ...outcome,
        status: 'failed',
        resultGroups: [],
        checkResult: outcome.checkResult ?? normalizedCheck,
      };
    }

    return outcome;
  }

  async _evaluateGatheringCheck({ actor, system }) {
    // System-level gathering check (Checks editor) drives progressive
    // resolution: roll the configured formula and map its numeric total onto the
    // check-result shape the progressive resolver expects (`{ success, status,
    // value }`). Progressive has no DC, so `task.dcOverride` never applies here.
    const progressive = system?.gatheringCraftingCheck?.progressive;
    const rollFormula = stringOrNull(progressive?.rollFormula);
    if (rollFormula) {
      const rolled = await runFormulaProgressive({
        formula: rollFormula,
        diceCrits: progressive.diceCrits,
        actor,
        label: 'Gathering',
      });
      // Progressive is value-driven, not pass/fail: leave `status` null so the
      // award logic (in `resolveProgressiveAward`) decides succeeded/failed from
      // the numeric `value`. A roll-evaluation error surfaces `success: false`,
      // which the resolver short-circuits to a terminal failure.
      return {
        success: rolled.success === false ? false : null,
        status: null,
        value: rolled.value,
        data: rolled.data ?? {},
      };
    }

    return {
      success: null,
      status: null,
      value: null,
      reasonCode: 'MISCONFIGURED_PROVIDER',
      diagnostic: {
        code: 'MISSING_GATHERING_CHECK',
        message:
          'Progressive gathering resolution requires a system-level gathering check roll formula',
      },
    };
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
      outcome,
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
      outcome,
    });
    if (runHasDiagnostics(planned)) {
      return misconfiguredOutcome({
        code: 'RESULT_PLAN_DIAGNOSTIC',
        diagnostics: planned.diagnostics ?? planned.diagnostic,
      });
    }
    return normalizeRunItems(planned, { actor });
  }

  async _planTerminalTools({
    viewer,
    actor,
    system,
    environment,
    task,
    outcome,
    checkResult,
    presentTools = null,
  }) {
    const resolvedTools = this._resolveTaskTools({ environment, task });
    if (this._hasBlockedToolReferences(resolvedTools)) {
      return misconfiguredOutcome({
        code: 'TOOL_REFERENCE_UNRESOLVED',
        diagnostics: [
          {
            code: 'TOOL_REFERENCE_UNRESOLVED',
            missingToolIds: normalizeList(resolvedTools.missingToolIds),
            disabledToolIds: normalizeList(resolvedTools.disabledToolIds),
          },
        ],
      });
    }
    const tools = resolvedTools.tools;
    if (tools.length === 0 || typeof this.toolBreakage?.plan !== 'function') {
      return [];
    }
    try {
      const planned = await this.toolBreakage.plan({
        actor,
        viewer,
        system,
        environment,
        task,
        tools,
        presentTools,
        outcomeStatus: outcome.status,
        checkResult: checkResult ?? outcome.checkResult ?? null,
      });
      return Array.isArray(planned) ? planned : [];
    } catch (error) {
      return misconfiguredOutcome({
        code: stringOrNull(error?.code) || 'TOOL_PLAN_FAILED',
        message: stringOrNull(error?.message) || 'Tool breakage planning failed',
      });
    }
  }

  async _applyTerminalTools({
    viewer,
    actor,
    system,
    environment,
    task,
    outcome,
    presentTools = null,
  }) {
    const resolvedTools = this._resolveTaskTools({ environment, task });
    const tools = resolvedTools.tools;
    if (tools.length === 0 || typeof this.toolBreakage?.apply !== 'function') {
      return [];
    }
    return this.toolBreakage.apply({
      actor,
      viewer,
      system,
      environment,
      task,
      tools,
      presentTools,
      outcomeStatus: outcome.status,
      checkResult: outcome.checkResult ?? null,
    });
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
      checkResult: checkResult ?? null,
    });
  }

  async _terminalStart({
    viewer,
    actor,
    system,
    environment,
    task,
    status,
    run,
    createdResults,
    usedTools = [],
    checkResult,
    initiatedBy = 'immediate',
  }) {
    await this._maybeRevealBlindTask({ actor, environment, task, status });
    const opaqueBlind = this._isOpaqueBlindTask({ environment, viewer });
    const publicRun = opaqueBlind
      ? redactBlindTerminalRun(run)
      : enrichPublicTerminalRun(stripRuntimeSnapshotFromRun(run), {
          createdResults,
          usedTools,
          checkResult,
        });
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
      blockedReasons: [],
    };

    if (!opaqueBlind) {
      response.createdResults = createdResults;
      response.usedTools = usedTools;
      if (checkResult !== undefined) response.checkResult = checkResult;

      // Blind tasks are redacted; only post the rich summary for transparent runs.
      await this._postGatheringChatMessage({
        actor,
        system,
        task,
        status,
        createdResults,
        usedTools,
        checkResult,
        run,
      });
    }

    // Publish the documented public completion hook(s) for other module authors,
    // after side effects (item creation, tool breakage, chat) are committed so
    // subscribers observe the final state. No-op when no publisher is injected.
    //
    // The timed path runs inside `processWorldTime`, which fires on EVERY client
    // via Foundry's synced `updateWorldTime` hook, so publishing there would
    // duplicate the broadcast across clients. Gate timed completions to the
    // primary GM (same rationale as the stamina/node-respawn guard) so they fire
    // exactly once; immediate completions resolve on the single acting client.
    const timedOnNonPrimaryGM = initiatedBy === 'timed' && this.isPrimaryGM() !== true;
    if (!timedOnNonPrimaryGM) {
      this.hookPublisher?.publishAttemptCompleted({
        viewer,
        actor,
        system,
        environment,
        task,
        status,
        run,
        createdResults,
        usedTools,
        checkResult,
        opaqueBlind,
        initiatedBy,
      });
    }

    return response;
  }

  /**
   * Post an automatic gathering result chat card summarizing the attempt:
   * gathered components, events encountered, broken tools, stamina spent, and
   * remaining nodes — each with its component/event image.
   *
   * Gated by the crafting system's `features.chatOutput` toggle (default true);
   * returns silently when off or when the system cannot be resolved. Never
   * throws into the attempt flow — `ChatMessage.create` errors are caught.
   * Posted publicly, mirroring the crafting summary.
   *
   * @param {object} params
   * @param {object}  params.actor          - The gathering actor (speaker).
   * @param {object}  params.system         - The crafting system (carries features).
   * @param {object}  params.task           - The resolved task.
   * @param {string}  params.status         - 'succeeded' | 'failed'.
   * @param {Array}   params.createdResults - Gathered item refs `{actorUuid,itemUuid,quantity}`.
   * @param {Array}   params.usedTools      - Tool breakage plan entries.
   * @param {object}  [params.checkResult]  - Outcome detail (events, items).
   * @param {object}  params.run            - Terminal run (carries economyEvidence).
   * @private
   */
  async _postGatheringChatMessage({
    actor,
    system,
    task,
    status,
    createdResults,
    usedTools,
    checkResult,
    run,
  }) {
    if (!system || system.features?.chatOutput !== true) return;

    try {
      const componentsById = this._componentsById(system);
      const itemsByUuid = new Map();
      for (const item of normalizeList(checkResult?.items)) {
        const uuid = stringOrNull(item?.itemUuid);
        if (uuid) itemsByUuid.set(uuid, item);
      }

      const components = normalizeList(createdResults).map((entry) => {
        const itemUuid = stringOrNull(entry?.itemUuid);
        const componentId = stringOrNull(itemsByUuid.get(itemUuid)?.componentId);
        const component = componentId ? componentsById.get(componentId) : null;
        const resolvedDoc = component ? null : resolveItemDoc(itemUuid);
        return {
          name:
            stringOrEmpty(component?.name) || stringOrEmpty(resolvedDoc?.name) || itemUuid || '',
          img:
            stringOrNull(component?.img) ||
            stringOrNull(resolvedDoc?.img) ||
            'icons/svg/item-bag.svg',
          quantity: Number(entry?.quantity) || 1,
        };
      });

      const events = normalizeList(checkResult?.events).map((event) => ({
        name: stringOrEmpty(event?.name),
        img: stringOrNull(event?.img) || DEFAULT_GATHERING_EVENT_IMG,
      }));

      const brokenTools = normalizeList(usedTools)
        .filter((entry) => entry?.broken === true)
        .map((entry) => {
          const component = componentsById.get(stringOrNull(entry?.componentId));
          const resolvedDoc = component
            ? null
            : resolveItemDoc(stringOrNull(entry?.itemRef?.itemUuid));
          return {
            name:
              stringOrEmpty(component?.name) ||
              stringOrEmpty(resolvedDoc?.name) ||
              this.localize(UNKNOWN_TOOL_LABEL_KEY),
            img: stringOrNull(component?.img) || stringOrNull(resolvedDoc?.img) || DEFAULT_TOOL_IMG,
          };
        });

      const content = buildGatheringChatContent(
        {
          status,
          actorName: stringOrEmpty(actor?.name),
          taskName: stringOrEmpty(task?.name),
          components,
          events,
          brokenTools,
          staminaSpent: run?.economyEvidence?.stamina?.spent ?? null,
          nodesRemaining: run?.economyEvidence?.node?.remaining ?? null,
        },
        this.localize
      );

      await ChatMessage.create({
        user: game.user?.id,
        speaker: ChatMessage.getSpeaker({ actor }),
        content,
      });
    } catch (error) {
      console.error('Fabricate | Failed to post gathering chat message:', error);
    }
  }

  /**
   * Reveal the resolved task after a blind attempt terminates, per the
   * system-level reveal policy. `onSuccess` reveals only on success;
   * `onAttempt` reveals on success or failure; `never` is a no-op. Reveal is
   * best-effort and never blocks the attempt result. Only applies to blind
   * environments.
   */
  async _maybeRevealBlindTask({ actor, environment, task, status }) {
    if (environment?.selectionMode !== 'blind') return;
    if (typeof this.richState?.revealTask !== 'function') return;
    const { policy, scope } = this._resolveRevealPolicy(environment);
    if (policy === 'never') return;
    if (policy === 'onSuccess' && status !== 'succeeded') return;
    try {
      await this.richState.revealTask(actor, {
        environmentId: stringOrNull(environment.id),
        taskId: stringOrNull(task?.id),
        scope,
      });
    } catch {
      // Reveal is advisory; never fail the attempt because of it.
    }
  }

  _resolveRevealPolicy(environment) {
    const rules = environment?.rules || {};
    return {
      policy: rules.revealPolicy ?? 'never',
      scope: rules.revealScope ?? 'actor',
    };
  }

  async _clearMisconfiguredWaitingRun({
    viewer,
    actor,
    run,
    environment,
    task,
    errors = null,
    outcome = null,
  }) {
    if (typeof this.runManager?.clearActiveRun !== 'function') {
      throw Object.assign(
        new Error('Gathering timed misconfiguration requires active-run cleanup'),
        {
          code: 'MISSING_CLEAR_ACTIVE_RUN',
        }
      );
    }

    await this.runManager.clearActiveRun(actor, run.id);
    const reason = this._blockedReason('TASK_MISCONFIGURED', {
      data: this._terminalMisconfigurationData({
        environment,
        task,
        viewer,
        outcome: outcome ?? {
          code: 'TASK_MISCONFIGURED',
          diagnostics: normalizeList(errors).map((error) => ({
            code: 'TASK_MISCONFIGURED',
            message: error,
          })),
        },
      }),
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
      blockedReasons: [reason],
    };
  }

  async _cancelMissingReferenceRun({ viewer, actor, run, resolved }) {
    const opaqueBlind =
      resolved.environment &&
      this._isOpaqueBlindTask({ environment: resolved.environment, viewer });
    const cancellationPayload = {
      economyEvidence: opaqueBlind
        ? redactRichEvidence(run?.economyEvidence || {})
        : stripRuntimeSnapshotFromRun({ economyEvidence: run?.economyEvidence || {} })
            .economyEvidence,
    };
    const cancelledRun = await this.runManager.cancelRun(
      actor,
      run.id,
      opaqueBlind
        ? {
            terminalRunData: {
              craftingSystemId: stringOrNull(run?.craftingSystemId),
              environmentId: stringOrNull(run?.environmentId),
              taskId: 'blind',
            },
            payload: {
              ...cancellationPayload,
              createdResults: [],
              usedTools: [],
              checkResult: { blind: true, status: 'cancelled' },
            },
          }
        : { payload: cancellationPayload }
    );
    if (!cancelledRun) {
      throw Object.assign(new Error('Timed gathering cancellation history was not written'), {
        code: 'TERMINAL_HISTORY_NOT_WRITTEN',
      });
    }

    return this._timedCancellation({
      viewer,
      actor,
      run,
      cancelledRun,
      reason: resolved.missingReference,
      environment: resolved.environment ?? null,
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
      run: opaqueBlind
        ? redactBlindTerminalRun(cancelledRun)
        : stripRuntimeSnapshotFromRun(cancelledRun),
      blockedReasons: [
        this._blockedReason('MISSING_REFERENCE', {
          data: { reference: reason },
        }),
      ],
    };
  }

  _terminalMisconfigurationData({ environment, task, viewer, outcome }) {
    if (this._isOpaqueBlindTask({ environment, viewer })) return null;
    const data = {
      taskId: stringOrNull(task?.id),
      code: stringOrNull(outcome?.code),
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
      blockedReasons: [],
    };
  }

  _startedWaitingStart({ viewer, actor, system, environment, task, run }) {
    const opaqueBlind = this._isOpaqueBlindTask({ environment, viewer });
    const publicRun = opaqueBlind ? redactBlindRun(run) : stripRuntimeSnapshotFromRun(run);
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
      blockedReasons: [],
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
      taskId: opaqueBlind ? null : task ? stringOrNull(task.id) : null,
      blockedReasons: [reason],
    };
  }

  _blindTaskData({ environment, task, viewer }) {
    return this._isOpaqueBlindTask({ environment, viewer }) ? null : { taskId: task.id };
  }

  _waitingRunFailureData({ environment, task, viewer, code, diagnostics = null }) {
    if (this._isOpaqueBlindTask({ environment, viewer })) return null;
    const data = {
      taskId: stringOrNull(task?.id),
      code: stringOrNull(code),
    };
    const safeDiagnostics = sanitizeDiagnostics(diagnostics);
    if (safeDiagnostics.length > 0) data.diagnostics = safeDiagnostics;
    return data;
  }

  _blockedReason(code, { messageKey = null, message = null, data = null } = {}) {
    const normalizedCode = stringOrEmpty(code) || 'BLOCKED';
    const key =
      messageKey ||
      DEFAULT_BLOCKED_REASON_KEYS[normalizedCode] ||
      `FABRICATE.Gathering.Blocked.${normalizedCode}`;
    return {
      code: normalizedCode,
      messageKey: key,
      message: message || this.localize(key, data ?? undefined),
      data: data ?? null,
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
    data: plainObjectOrNull(result.data),
  };
}

function normalizeToolResult(result) {
  if (result === true) return { available: true, missing: [], failedRequirements: [] };
  if (result === false || !result || typeof result !== 'object') {
    return { available: false, missing: [], failedRequirements: [] };
  }
  return {
    available: result.available === true,
    missing: normalizeList(result.missing),
    failedRequirements: normalizeList(result.failedRequirements),
  };
}

function normalizeTerminalOutcome(raw) {
  if (!raw || typeof raw !== 'object') {
    return misconfiguredOutcome({
      code: 'MALFORMED_OUTCOME',
      message: 'Gathering resolution returned no outcome',
    });
  }

  if (hasOutcomeDiagnostics(raw)) {
    return misconfiguredOutcome({
      code: stringOrNull(raw.code || raw.reasonCode) || 'RESOLUTION_DIAGNOSTIC',
      message: stringOrNull(raw.message),
      diagnostic: raw.diagnostic,
      diagnostics: raw.diagnostics,
      checkResult: raw.checkResult,
    });
  }

  const disposition = normalizeOutcomeText(raw.status ?? raw.disposition);
  if (['misconfigured', 'misconfiguration', 'error'].includes(disposition)) {
    return misconfiguredOutcome({
      code: stringOrNull(raw.code || raw.reasonCode) || 'RESOLUTION_MISCONFIGURED',
      message: stringOrNull(raw.message || raw.error),
      checkResult: raw.checkResult,
    });
  }

  const outcomeText = normalizeOutcomeText(raw.outcome ?? raw.outcomeName ?? raw.drawnName);
  const failed =
    raw.success === false ||
    raw.failure === true ||
    ['failed', 'failure', 'fail', 'miss'].includes(disposition) ||
    FAILURE_KEYWORDS.has(outcomeText);
  if (failed) {
    return {
      status: 'failed',
      resultGroups: [],
      checkResult: normalizeOutcomeCheckResult(raw),
    };
  }

  const resultGroups = normalizeOutcomeGroups(raw);
  const succeeded =
    raw.success === true ||
    ['succeeded', 'success', 'passed', 'pass'].includes(disposition) ||
    resultGroups.length > 0;
  if (succeeded) {
    return {
      status: 'succeeded',
      resultGroups,
      checkResult: normalizeOutcomeCheckResult(raw),
    };
  }

  return misconfiguredOutcome({
    code: 'MALFORMED_OUTCOME',
    message: 'Gathering resolution did not return a terminal status',
    checkResult: raw.checkResult,
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
      diagnostic: { code: 'MALFORMED_RESULT' },
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
    diagnostic: raw.diagnostic ?? null,
  };
}

function normalizeCheckStatus(status) {
  if (status == null || status === '') return null;
  const normalized = normalizeOutcomeText(status);
  if (['success', 'succeeded', 'pass', 'passed'].includes(normalized)) return 'success';
  if (['failure', 'failed', 'fail'].includes(normalized)) return 'failure';
  return stringOrNull(status);
}

function hasOutcomeDiagnostics(raw) {
  return Boolean(raw.diagnostic) || normalizeList(raw.diagnostics).length > 0;
}

function misconfiguredOutcome({
  code = null,
  message = null,
  diagnostic = null,
  diagnostics = null,
  checkResult = null,
} = {}) {
  const outcome = {
    status: 'misconfigured',
    resultGroups: [],
    code: stringOrNull(code) || 'TASK_MISCONFIGURED',
    checkResult:
      checkResult && typeof checkResult === 'object' ? cloneJson(checkResult) : undefined,
  };
  const normalizedDiagnostics = normalizeList(diagnostics);
  if (diagnostic) normalizedDiagnostics.push(diagnostic);
  if (message || normalizedDiagnostics.length > 0) {
    outcome.diagnostics = [
      ...normalizedDiagnostics,
      ...(message ? [{ code: outcome.code, message }] : []),
    ];
  }
  return outcome;
}

function resolveProgressiveAward({ system, task, checkResult }) {
  const group = normalizeList(task.resultGroups)[0];
  if (!group) {
    return misconfiguredOutcome({
      code: 'MISSING_RESULT_GROUP',
      message: 'Progressive gathering requires one result group',
    });
  }

  const value = Number(checkResult?.value);
  if (!Number.isFinite(value)) {
    return misconfiguredOutcome({
      code: 'MALFORMED_CHECK_RESULT',
      message: 'Progressive gathering check must return a numeric value',
      checkResult,
    });
  }

  // Award mode comes from the system-level gathering check, defaulting to 'equal'.
  const requestedAwardMode = system?.gatheringCraftingCheck?.progressive?.awardMode ?? 'equal';
  const awardMode = ['partial', 'equal', 'exceed'].includes(requestedAwardMode)
    ? requestedAwardMode
    : 'equal';

  // Divergence 4 stays here: gathering already validated `Number.isFinite(value)`
  // above and clamps `Math.max(0, value)` before handing the budget to the shared
  // loop. Divergence 1 is `invalidCost: 'fail'` — an invalid per-result difficulty
  // short-circuits with `invalidResultId`, which we raise as a misconfiguration
  // here (the loop never builds that shape). Divergence 2 zeroes the budget after a
  // `partial` tail award (`zeroRemainingOnPartial: true`).
  const { awarded, remaining, invalidResultId } = resolveProgressiveAwardLoop({
    results: normalizeList(group.results),
    initialRemaining: Math.max(0, value),
    costFor: (result) => difficultyForResult(system, result),
    awardMode,
    invalidCost: 'fail',
    zeroRemainingOnPartial: true,
  });

  if (invalidResultId !== undefined) {
    return misconfiguredOutcome({
      code: 'INVALID_PROGRESSIVE_DIFFICULTY',
      message: 'Progressive gathering result references a component without valid difficulty',
      checkResult,
    });
  }

  return {
    status: awarded.length > 0 || checkResult?.status === 'success' ? 'succeeded' : 'failed',
    resultGroups: [{ ...group, results: awarded }],
    checkResult: {
      ...checkResult,
      resolutionMeta: {
        awardedResultIds: awarded.map((result) => result.id),
        remaining,
      },
    },
  };
}

function difficultyForResult(system, result) {
  const componentId = stringOrNull(result?.componentId ?? result?.systemItemId);
  if (!componentId) return null;
  const component = normalizeList(system?.components).find((entry) => entry?.id === componentId);
  const difficulty = Number(component?.difficulty);
  return Number.isFinite(difficulty) ? difficulty : null;
}

function hasAwardedResults(resultGroups) {
  return normalizeList(resultGroups).some((group) => normalizeList(group?.results).length > 0);
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
    diagnostic: result.diagnostic ?? null,
  };
}

function validateTaskConfiguration(task, system = null) {
  const errors = [];
  const resolutionMode = stringOrNull(task?.resolutionMode);
  const resultGroups = normalizeList(task?.resultGroups);

  if (
    resolutionMode !== 'routed' &&
    resolutionMode !== 'progressive' &&
    resolutionMode !== 'd100'
  ) {
    errors.push('Gathering task requires a routed, progressive, or d100 resolution mode');
    return errors;
  }

  if (resolutionMode !== 'd100' && resultGroups.length === 0) {
    errors.push('Gathering task requires at least one result group');
  }
  if (resolutionMode !== 'd100') {
    errors.push(...validateResultGroupNames(resultGroups));
  }

  if (resolutionMode === 'd100') {
    const rows = normalizeList(task?.dropRows ?? task?.itemDrops).filter(
      (row) => row?.enabled !== false
    );
    if (rows.length === 0) {
      errors.push('D100 gathering task requires at least one item drop row');
    }
    for (const row of rows) {
      const dropRate = Number(row?.dropRate);
      if (!Number.isInteger(dropRate) || dropRate < 0 || dropRate > 100) {
        errors.push('D100 gathering item drop rows require dropRate from 0 to 100');
      }
      if (!stringOrNull(row?.componentId) && !stringOrNull(row?.itemUuid)) {
        errors.push('D100 gathering item drop rows require componentId or itemUuid');
      }
      const quantity = Number(row?.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        errors.push('D100 gathering item drop rows require positive quantity');
      }
    }
  }

  // Routed gathering resolves through the system-level gathering check formula,
  // not a per-task result-selection provider: require the configured routed roll
  // formula. The result-group / group-name checks above still apply.
  if (
    resolutionMode === 'routed' &&
    !stringOrNull(system?.gatheringCraftingCheck?.routed?.rollFormula)
  ) {
    errors.push('Routed gathering task requires a system-level gathering check roll formula');
  }

  if (resolutionMode === 'progressive') {
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
    // Routed `ResultGroup.name` validation uses the SAME normalizer as the routed
    // match path (`normalizeRoutedName`), so a name can never validate yet fail to
    // route (or vice versa). The `String(value ?? '')` vs `String(name || '')`
    // edge (0/false → '') is immaterial for outcome-name strings.
    const normalizedName = normalizeRoutedName(group?.name);
    if (!normalizedName) {
      errors.push('Gathering result groups require names');
      continue;
    }
    if (FAILURE_KEYWORDS.has(normalizedName)) {
      errors.push(`Gathering result group "${group.name}" collides with reserved failure keyword`);
    }
    if (seen.has(normalizedName)) {
      errors.push(
        `Gathering result group "${group.name}" duplicates "${seen.get(normalizedName)}"`
      );
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
    .map((diagnostic) => {
      if (!diagnostic || typeof diagnostic !== 'object') return null;
      return {
        code: stringOrNull(diagnostic.code || diagnostic.reasonCode),
        messageKey: stringOrNull(diagnostic.messageKey),
      };
    })
    .filter((diagnostic) => diagnostic?.code || diagnostic?.messageKey);
}

function redactBlindRun(run) {
  if (!run || typeof run !== 'object') return run;
  const redacted = { ...run, taskId: null };
  if (redacted.economyEvidence && typeof redacted.economyEvidence === 'object') {
    redacted.economyEvidence = redactRichEvidence(redacted.economyEvidence);
  }
  delete redacted.diagnostic;
  delete redacted.diagnostics;
  return redacted;
}

function redactBlindTerminalRun(run) {
  const redacted = redactBlindRun(run);
  if (!redacted || typeof redacted !== 'object') return redacted;
  delete redacted.checkResult;
  delete redacted.usedTools;
  delete redacted.createdResults;
  return redacted;
}

function enrichPublicTerminalRun(run, { createdResults, usedTools = [], checkResult }) {
  if (!run || typeof run !== 'object') return run;
  const enriched = {
    ...run,
    createdResults,
    usedTools,
  };
  if (checkResult !== undefined) enriched.checkResult = checkResult;
  return enriched;
}

function resolveToolBreakagePolicy(environment) {
  const candidate = environment?.rules?.toolBreakagePolicy ?? environment?.toolBreakagePolicy;
  return candidate === 'successDespiteBreak' ? 'successDespiteBreak' : 'failureOnBreak';
}

function redactCharacterModifierSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return snapshot;
  if (!snapshot?.rows && !snapshot?.events) return snapshot;
  return {
    rows: normalizeList(snapshot.rows).map((row) => ({
      rowId: null,
      contributions: normalizeList(row?.contributions).map((entry) => ({
        contribution: Number(entry?.contribution ?? 0),
      })),
    })),
    events: normalizeList(snapshot.events).map((event) => ({
      eventId: null,
      contributions: normalizeList(event?.contributions).map((entry) => ({
        contribution: Number(entry?.contribution ?? 0),
      })),
    })),
  };
}

function hasRichGatheringData(environment, task) {
  return Boolean(
    stringOrNull(environment?.img) ||
    stringOrNull(environment?.region) ||
    stringOrNull(environment?.biome) ||
    (stringOrNull(environment?.risk) && environment.risk !== 'safe') ||
    Object.values(plainObjectOrNull(environment?.conditions) || {}).some((value) =>
      stringOrNull(value)
    ) ||
    task?.nodes ||
    Number(task?.staminaCost || 0) > 0 ||
    stringOrNull(task?.riskOverride) ||
    task?.encounters ||
    task?.reveal ||
    task?.blindSelection
  );
}

function normalizeRunItems(items, { actor = null } = {}) {
  return normalizeList(items)
    .filter((item) => item && typeof item === 'object')
    .map((item) => {
      const source = item.item && typeof item.item === 'object' ? item.item : item;
      const actorUuid =
        stringOrNull(item.actorUuid) || stringOrNull(item.actor?.uuid) || stringOrNull(actor?.uuid);
      const itemUuid = stringOrNull(item.itemUuid) || stringOrNull(source.uuid);
      const quantity = Number(item.quantity ?? source.system?.quantity ?? 1);
      return {
        actorUuid,
        itemUuid,
        quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
      };
    })
    .filter((item) => item.actorUuid && item.itemUuid);
}

function normalizeOutcomeText(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

function defaultLocalize(key) {
  return key;
}

/**
 * Best-effort synchronous resolution of an item document by UUID, used only to
 * recover a display name/image when a gathered result or broken tool cannot be
 * matched to a system component. Returns null outside Foundry or on any error.
 */
function resolveItemDoc(uuid) {
  if (!uuid || typeof globalThis.fromUuidSync !== 'function') return null;
  try {
    return globalThis.fromUuidSync(uuid) ?? null;
  } catch {
    return null;
  }
}
