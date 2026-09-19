import { DEFAULT_GATHERING_EVENT_IMG } from '../gatheringImageDefaults.js';
import {
  classifyGatheringToolStates,
  resolvePresentComponentIds,
  resolvePresentToolIds,
} from '../gatheringToolRuntime.js';
import { resolveToolDisplayImage, resolveToolDisplayName } from '../models/toolDisplay.js';
import { buildGatheringChatContent } from '../ui/presenters/GatheringChatCard.js';
import { GatheringListingBuilder } from '../ui/presenters/GatheringListingBuilder.js';
import {
  buildInteractiveRollOptions,
  promptCheckRoll,
} from '../ui/svelte/apps/crafting/rollPrompt.js';
import { planComplications, publicComplications } from '../utils/complicationPlan.js';
import { activityPermitsFailureResults } from '../utils/failureResultPolicy.js';
import { resolveProgressiveAward as resolveProgressiveAwardLoop } from '../utils/progressiveAward.js';
import { matchResultGroupsByName, normalizeRoutedName } from '../utils/routedOutcomeKeywords.js';

import { buildCheckModifierContext } from './checkModifierResolver.js';
import { evaluateSituationalBonus, runFormulaProgressive, runFormulaRouted } from './checkRoll.js';
import { fireComplications } from './complicationRuntime.js';
import {
  createGatheringAttemptResolution,
  noRefusal,
  passThroughAttempt,
} from './gatheringAttemptResolution.js';
import { BLIND_RESERVATION_UNITS } from './GatheringBlindRunStore.js';
import {
  actorMatchesId,
  blindWaitingTaskId,
  callMaybe,
  cloneJson,
  idOf,
  isBlindWaitingTaskId,
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
import {
  buildRealmDisclosure,
  buildTravelGuidance,
  environmentHasLocationRules,
  evaluateLocationAvailability,
} from './gatheringLocation.js';
import { evaluateEnvironmentMatch } from './gatheringMatch.js';
import { getDiscoveredRealmIds } from './gatheringRealmDiscovery.js';
import { getRealmRevealMode, isGatheringRealmsEnabled } from './gatheringRealms.js';
import { gatheringResultAmountErrors } from './gatheringResultGroups.js';
import { GatheringWorldTimeProcessor } from './GatheringWorldTimeProcessor.js';
import { resolveCheckTriggerMatches } from './ResolutionModeService.js';
import { getCommittedExecutionOutcome } from './runExecutionJournal.js';
import {
  itemReceipt,
  linkResultGroups,
  receiptQuantity,
  unconfirmedHistoryError,
} from './runHistoryEvidence.js';
import { getRunLifecycleContract } from './runLifecycleState.js';
import { resolvedComponentsFor } from './scopedEntityReads.js';
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
const VERSIONED_START_CONTEXT = Symbol('versionedGatheringStartContext');

class GatheringLifecycleExecutionError extends Error {
  constructor(message, code, cause) {
    super(message, cause ? { cause } : {});
    this.code = code;
  }
}
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
 * Composes gathering stores, visibility evaluation and runtime gate checks into player-facing
 * listing state and guarded attempt starts. Listings carry active timed runs and recent terminal
 * history even when browsing rows are empty or blocked. Non-timed attempts resolve immediately
 * into terminal routed/progressive outcomes, persist terminal history, then commit irreversible
 * result, tool and failure-feedback effects; timed attempts resume through
 * `processWorldTime(worldTime)`, which writes terminal history before post-history effects.
 *
 * With a `locationResolver` (GatheringLocationService) injected, listings also evaluate each
 * environment against the party's resolved current realms — emitting a redaction-safe `location`
 * field plus `LOCATION_BLOCKED` / `NO_CURRENT_REALM` blocked reasons — and attempt starts
 * re-resolve location fresh so a stale listing cannot start a location-gated attempt.
 */
export class GatheringEngine {
  /**
   * World-setting-backed secret store for in-flight blind runs (issue 901). Installed by
   * {@link GatheringEngine#installBlindRunRelay} rather than through the constructor.
   * @type {import('./GatheringBlindRunStore.js').GatheringBlindRunStore|null}
   */
  blindRunStore = null;

  /**
   * Player→active-GM relay for a blind start this client may not write.
   * @type {Function|null}
   */
  relayBlindStart = null;

  /**
   * Complication delivery writer (issue 1286). Installed by
   * {@link GatheringEngine#installComplicationDelivery} rather than through the constructor.
   * @type {?{deliver: (args: object) => boolean}}
   */
  complicationDeliveryWriter = null;

  /** @type {object|null} Authoritative command adapter for lifecycle-v1 mutations. */
  versionedRunAuthority = null;

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
    // Optional progressive-resolution seam (`resolveProgressive`). Routed resolution routes
    // exclusively through the system-level gathering check formula; production wires nothing
    // here, so progressive falls through to the built-in `resolveProgressiveAward`.
    resultResolver = null,
    resultCreator = null,
    toolBreakage = null,
    failureFeedback = null,
    eventSceneTrigger = null,
    hookPublisher = null,
    getRunViewer = null,
    locationResolver = null,
    travelStore = null,
    random = Math.random,
    localize = defaultLocalize,
    // Stamina regen / node respawn run on world-time advance and write shared
    // state, so they must run exactly once — only on the primary GM client.
    isPrimaryGM = () =>
      Boolean(
        globalThis.game?.user?.isGM &&
        globalThis.game?.users?.activeGM?.id === globalThis.game?.user?.id
      ),
    // Primary-GM gate for RESUMING matured timed runs. It fails OPEN — resumption is a run's
    // only completion path, so a closed default would stop every unit fixture resolving
    // anything — and the real check is WIRED at construction in main.js (issue 656).
    // `isPrimaryGM` above gates maintenance and has the opposite safe default.
    resumeTimedRuns = () => true,
    getActors = () => [...(globalThis.game?.actors?.contents ?? globalThis.game?.actors ?? [])],
    // Scene graph + scoped-behaviour writer seams for interactable-scoped node respawn (issue
    // 302). Injected by main.js (fake in tests); absent → no scoped respawn pass.
    scenes = () => globalThis.game?.scenes ?? null,
    applyInteractableBehaviorUpdate = null,
    // GM-gated world-time maintenance collaborator (issue 374): stamina regen plus environment
    // and interactable node respawn. Default-constructed below when not injected; the engine's
    // `isPrimaryGM()` guard is the only gate.
    worldTimeProcessor = null,
    // Player-facing listing / view-model builder (issue 375): owns the bodies of listForActor
    // and getTaskDropBreakdown. Default-constructed below when not injected.
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
    // `fabricate.gathering.*` integration hooks on terminal completion. Optional.
    this.hookPublisher = hookPublisher;
    this.getRunViewer = getRunViewer;
    // Constructor-injected current-realm resolver (GatheringLocationService),
    // NOT a module import — keeps the engine system-agnostic and testable.
    this.locationResolver = locationResolver;
    // The WORLD travel configuration (issue 1282): the realm library and the reveal mode.
    this.travelStore = travelStore;
    this.random = typeof random === 'function' ? random : Math.random;
    this.localize = localize;
    this.isPrimaryGM = typeof isPrimaryGM === 'function' ? isPrimaryGM : () => true;
    this.resumeTimedRuns = typeof resumeTimedRuns === 'function' ? resumeTimedRuns : () => true;
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
   * Install the blind-run secret store and the player→GM start relay (issue 901).
   *
   * A post-construction seam rather than two more constructor parameters. Both fields are
   * optional everywhere they are read (`?.`), so an engine that never calls this writes blind
   * runs directly — correct for a GM-only world and for unit fixtures.
   *
   * @param {object} deps
   * @param {import('./GatheringBlindRunStore.js').GatheringBlindRunStore|null} [deps.store]
   *   World-setting-backed secret store. Reads work on any client; writes are GM-only and the
   *   store fails them closed.
   * @param {Function|null} [deps.relayStart] `({ environmentId, actorUuid, taskId,
   *   interactableRef }) => boolean` — routes a start this client cannot write to the active GM.
   *   Returns false when nothing could be routed (no active GM).
   * @returns {GatheringEngine} this, for chaining at the bootstrap site.
   */
  installBlindRunRelay({ store = null, relayStart = null } = {}) {
    this.blindRunStore = store;
    this.relayBlindStart = typeof relayStart === 'function' ? relayStart : null;
    // The GM's listing must show the real task behind an in-flight blind run, marked as a
    // secret preview.
    this.listingBuilder?.useBlindRunSecrets?.((runId) => this._blindRunSecret(runId));
    return this;
  }

  installVersionedRunAuthority(authority = null) {
    this.versionedRunAuthority = authority && typeof authority === 'object' ? authority : null;
    return this;
  }

  /**
   * Install the complication delivery writer (issue 1286). Post-construction for exactly the
   * reason {@link installBlindRunRelay} records. Progressive gathering remains unavailable from
   * the current authoring surface, so this writer is reached only through legacy or
   * externally-authored progressive tasks.
   *
   * @param {object} deps
   * @param {?{deliver: (args: object) => boolean}} [deps.writer] The delivery writer composed in
   *   `main.js`, which owns the emit and mints the resolution id.
   * @returns {GatheringEngine} this, for chaining at the bootstrap site.
   */
  installComplicationDelivery({ writer = null } = {}) {
    this.complicationDeliveryWriter = writer;
    return this;
  }

  /**
   * The complication delivery writer, injected or ambient.
   * @private
   * @returns {?{deliver: (args: object) => boolean}}
   */
  _complicationWriter() {
    return (
      this.complicationDeliveryWriter ||
      globalThis.game?.fabricate?.complicationDeliveryWriter ||
      null
    );
  }

  /**
   * FIRE the component complications a committed progressive gathering award earned (issue
   * 1286).
   *
   * A complication is strictly downstream of a committed award — the items are on the actor and
   * the run record is written — so nothing here may turn that into a thrown attempt: the plan,
   * the trigger evaluation, the firing and the delivery are all inside one `try` (guard 3 of 3;
   * the per-complication and per-effect guards live inside {@link fireComplications}, which
   * resolves rather than rejects). The delivery writer owns the emit AND mints the resolution
   * id; this engine does neither.
   *
   * @private
   * @param {object} options
   * @param {?object} options.actor the acting actor
   * @param {?object} options.system the owning crafting system
   * @param {?object} options.task the runtime task, whose FIRST result group is the ordered
   *   stage list — gathering has no player reorder, so authored order IS fire order
   * @param {?object} options.outcome the terminal outcome, carrying the award report on
   *   `checkResult.resolutionMeta`
   * @returns {Promise<?object>} `fireComplications`'s return, or null when nothing ran.
   */
  async _fireGatheringComplications({ actor, system, task, outcome }) {
    try {
      if (stringOrNull(task?.resolutionMode) !== 'progressive') return null;
      const meta = outcome?.checkResult?.resolutionMeta;
      if (!Array.isArray(meta?.awardedResultIds)) return null;
      const group = normalizeList(task?.resultGroups)[0];
      const stages = normalizeList(group?.results).map((result) => {
        const componentId = stringOrNull(result?.componentId ?? result?.systemItemId);
        return {
          resultId: stringOrNull(result?.id),
          componentId,
          component: componentId
            ? (resolvedComponentsFor(system).find((entry) => entry?.id === componentId) ?? null)
            : null,
        };
      });
      if (stages.length === 0) return null;
      const plan = planComplications({
        activity: 'gathering',
        stages,
        award: {
          awarded: meta.awardedResultIds,
          remaining: Number(meta.remaining ?? 0),
          partialResult: meta.partialResultId ?? null,
          haltedResult: meta.haltedResultId ?? null,
          skippedResults: normalizeList(meta.skippedResultIds),
        },
        ...resolveCheckTriggerMatches(
          system?.gatheringCraftingCheck?.progressive?.checkBreakage,
          outcome?.checkResult
        ),
      });
      const fired = await fireComplications({
        plan,
        actor,
        context: {
          craftingSystemId: stringOrNull(system?.id),
          actorUuid: stringOrNull(actor?.uuid),
          speaker: globalThis.ChatMessage?.getSpeaker?.({ actor }),
        },
      });
      if (fired.gmRequests.length > 0) {
        this._complicationWriter()?.deliver({
          craftingSystemId: stringOrNull(system?.id),
          actorUuid: stringOrNull(actor?.uuid),
          complications: fired.gmRequests,
        });
      }
      return fired;
    } catch (error) {
      console.error('Fabricate | Component complications failed to fire', error);
      return null;
    }
  }

  /**
   * Public start entry point (issue 901). Routes a blind start this client may not write to the
   * active GM, and otherwise starts the attempt locally. `main.js` calls this rather than
   * {@link GatheringEngine#startAttempt} so the routing decision is made once, before the blind
   * draw; `startAttempt` stays the direct, non-routing entry for the GM's relay handler, macros
   * and tests.
   *
   * @param {object} [options] Same options as {@link GatheringEngine#startAttempt}.
   * @returns {Promise<object>} A start result. A relayed start reports `state: 'relayed'` with a
   *   null `runId` — the run appears when the GM's write replicates.
   */
  async requestStart(options = {}) {
    if (Object.hasOwn(options, 'lifecycleVersion')) {
      if (options.lifecycleVersion !== 1) {
        return versionedGatheringFailure('The gathering run lifecycle version is unsupported.');
      }
      const requestStart = this.versionedRunAuthority?.requestStart;
      if (typeof requestStart !== 'function') return gatheringAuthorityUnavailable();
      return requestStart({
        actor: options.actor,
        environmentId: options.environmentId,
        taskId: options.taskId,
        rememberedActorId: options.rememberedActorId,
        presentTools: options.presentTools,
        interactableRef: options.interactableRef,
        completionMode: options.completionMode || 'manual',
      });
    }
    const relayed = await this._relayBlindStartIfNeeded(options);
    return relayed ?? this.startAttempt(options);
  }

  async startVersionedRun({
    viewer = null,
    actor = null,
    rememberedActorId = null,
    environmentId = null,
    taskId = null,
    presentTools = null,
    interactableRef = null,
    completionMode = 'manual',
    executionGrant,
    requestId,
  } = {}) {
    const trusted = await this._consumeVersionedGrant(executionGrant, {
      operation: 'start',
      actor,
      runId: null,
      expectedRevision: null,
      requestId,
    });
    if (!['manual', 'worldTime'].includes(completionMode)) {
      return versionedGatheringFailure(
        'The gathering completion mode is unsupported.',
        'INVALID_COMPLETION_MODE'
      );
    }
    this.runManager?.invalidateCache?.(idOf(actor));
    const retainedStart = this._findVersionedStartRun({
      actor,
      operationId: trusted.operationId,
      requestId,
    });
    if (retainedStart) {
      const committed = getCommittedExecutionOutcome(retainedStart.executionJournal, requestId);
      if (committed) return committed;
      await this._markVersionedGatheringRecovery(actor, retainedStart, trusted.operationId);
      throw gatheringLifecycleError('The gathering start requires recovery', 'RECOVERY_REQUIRED');
    }
    const result = await this.startAttempt(
      {
        viewer,
        actor,
        rememberedActorId,
        environmentId,
        taskId,
        presentTools,
        interactableRef,
        interactive: false,
        lifecycleVersion: 1,
      },
      {
        [VERSIONED_START_CONTEXT]: true,
        operationId: trusted.operationId,
        requestId,
        completionMode,
      }
    );
    return asVersionedGatheringResult(result);
  }

  _findVersionedStartRun({ actor, operationId, requestId }) {
    const runs = [
      ...normalizeList(this.runManager?.getActiveRuns?.(actor)),
      ...normalizeList(this.runManager?.getRunHistory?.(actor)),
    ];
    return (
      runs.find(
        (run) =>
          getRunLifecycleContract(run) === 'current' &&
          run.executionJournal?.operationId === operationId &&
          run.executionJournal?.requestId === String(requestId ?? '').trim() &&
          run.executionJournal?.intent?.trigger === 'start'
      ) ?? null
    );
  }

  async describeVersionedStageCheck({ actor, runId, preparationGrant, requestId } = {}) {
    await this._consumeVersionedGrant(
      preparationGrant,
      {
        operation: 'describeCheck',
        actor,
        runId,
        expectedRevision: null,
        requestId,
      },
      { requireOperationId: false }
    );
    this.runManager?.invalidateCache?.(idOf(actor));
    const run = this.runManager?.getActiveRun?.(actor, runId) ?? null;
    this._assertVersionedRunExecutable(run, { requireReady: true });
    const resolvedRun = this._hydrateBlindWaitingRun(run);
    const resolved = this._resolveWaitingRunContext({ actor, run: resolvedRun });
    if (
      resolved.missingReference ||
      this._validateStartTask(resolved.task, resolved.system).valid !== true
    ) {
      return { required: false };
    }
    return this._versionedCheckDescriptor({ actor, run, ...resolved });
  }

  evaluatePreparedVersionedCheck({ actor, privateEvaluation, decision = {} } = {}) {
    const evaluate = this.versionedRunAuthority?.evaluatePreparedRunCheck;
    if (typeof evaluate !== 'function') {
      throw gatheringLifecycleError(
        'Versioned gathering check evaluation is unavailable',
        'AUTHORITY_UNAVAILABLE'
      );
    }
    return evaluate(privateEvaluation, actor, decision, {
      secret: privateEvaluation?.secret === true,
      failureMessage: 'Gathering check failed',
    });
  }

  async executeVersionedStage({
    actor,
    runId,
    expectedRevision,
    executionGrant,
    requestId,
    trigger = 'manual',
  } = {}) {
    const trusted = await this._consumeVersionedGrant(executionGrant, {
      operation: 'execute',
      actor,
      runId,
      expectedRevision,
      requestId,
    });
    this.runManager?.invalidateCache?.(idOf(actor));
    const anyRun = this.runManager?.getRun?.(actor, runId) ?? null;
    const committed = anyRun?.executionJournal
      ? getCommittedExecutionOutcome(anyRun.executionJournal, requestId)
      : null;
    if (committed) return committed;

    const run = this.runManager?.getActiveRun?.(actor, runId) ?? null;
    this._assertVersionedRunExecutable(run, { expectedRevision, requireReady: true });
    if (this._gamePaused()) {
      return versionedGatheringFailure('Gathering cannot advance while the game is paused.');
    }
    if (trigger === 'worldTime' && run.completionMode !== 'worldTime') {
      return versionedGatheringFailure('This gathering run is set to manual completion.');
    }

    const resolvedRun = this._hydrateBlindWaitingRun(run);
    const resolved = this._resolveWaitingRunContext({ actor, run: resolvedRun });
    if (resolved.missingReference) {
      const viewer = await this._viewerForRun({ actor, run: resolvedRun });
      return asVersionedGatheringResult(
        await this._cancelInvalidVersionedRun({
          viewer,
          actor,
          run,
          resolved,
          reason: resolved.missingReference,
          versionedContext: { operationId: trusted.operationId, requestId, trigger },
        })
      );
    }
    const resolvedTools = this._resolveTaskTools({
      environment: resolved.environment,
      task: resolved.task,
    });
    if (this._hasBlockedToolReferences(resolvedTools)) {
      const viewer = await this._viewerForRun({ actor, run: resolvedRun });
      return asVersionedGatheringResult(
        await this._clearInvalidVersionedRun({
          viewer,
          actor,
          run,
          environment: resolved.environment,
          task: resolved.task,
          errors: ['The gathering tool references are stale.'],
          versionedContext: { operationId: trusted.operationId, requestId, trigger },
        })
      );
    }
    if (resolvedTools.tools.length > 0) {
      const viewer = await this._viewerForRun({ actor, run: resolvedRun });
      const availability = await this._checkTools({
        actor,
        viewer,
        system: resolved.system,
        environment: resolved.environment,
        task: resolved.task,
        tools: resolvedTools.tools,
        presentTools: null,
      });
      if (availability.available !== true) {
        return versionedGatheringFailure('The gathering tools are no longer available.');
      }
    }
    if (trigger === 'worldTime' && gatheringTaskRequiresPlayerCheck(resolved.task)) {
      return versionedGatheringFailure('This gathering run requires a player check.');
    }
    if (
      gatheringTaskRequiresPlayerCheck(resolved.task) &&
      (!trusted.resolvedCheckResult || typeof trusted.resolvedCheckResult !== 'object')
    ) {
      throw gatheringLifecycleError(
        'A validated gathering check result is required',
        'CHECK_RESULT_REQUIRED'
      );
    }

    const result = await this._processMaturedWaitingRun({
      actor,
      run,
      versionedContext: {
        operationId: trusted.operationId,
        requestId,
        expectedRevision,
        resolvedCheckResult: trusted.resolvedCheckResult ?? null,
        trigger,
      },
    });
    return asVersionedGatheringResult(result);
  }

  async cancelVersionedRun({ actor, runId, expectedRevision, executionGrant, requestId } = {}) {
    const trusted = await this._consumeVersionedGrant(executionGrant, {
      operation: 'cancel',
      actor,
      runId,
      expectedRevision,
      requestId,
    });
    this.runManager?.invalidateCache?.(idOf(actor));
    const run = this.runManager?.getActiveRun?.(actor, runId) ?? null;
    this._assertVersionedRunExecutable(run, {
      expectedRevision,
      requireReady: false,
      allowPaused: true,
    });
    const cancelled = await this.runManager.cancelRun(actor, runId, {
      expectedRevision,
      executionOperationId: trusted.operationId,
    });
    if (!cancelled) return versionedGatheringFailure('The gathering run is no longer active.');
    await this._releaseBlindReservation(run);
    return {
      success: true,
      accepted: true,
      cancelled: true,
      refunded: false,
      restoredCount: 0,
      run: stripRuntimeSnapshotFromRun(cancelled),
      runId: cancelled.id,
      state: 'cancelled',
    };
  }

  _consumeVersionedGrant(executionGrant, context, { requireOperationId = true } = {}) {
    const consume = this.versionedRunAuthority?.consumeExecutionGrant;
    if (typeof consume !== 'function') {
      throw gatheringLifecycleError(
        'Versioned gathering authority is unavailable',
        'AUTHORITY_UNAVAILABLE'
      );
    }
    return Promise.resolve(consume(executionGrant, context)).then((trusted) => {
      if (!trusted || typeof trusted !== 'object') {
        throw gatheringLifecycleError(
          'Versioned gathering authority is unavailable',
          'AUTHORITY_UNAVAILABLE'
        );
      }
      const operationId = stringOrNull(trusted.operationId);
      if (requireOperationId && !operationId) {
        throw gatheringLifecycleError(
          'Versioned gathering authority is unavailable',
          'AUTHORITY_UNAVAILABLE'
        );
      }
      return { ...trusted, operationId };
    });
  }

  _assertVersionedRunExecutable(
    run,
    { expectedRevision, requireReady = false, allowPaused = false } = {}
  ) {
    if (!run) throw gatheringLifecycleError('The gathering run is not active', 'RUN_NOT_FOUND');
    const contract = getRunLifecycleContract(run);
    if (contract !== 'current') {
      throw gatheringLifecycleError(
        contract === 'unsupported'
          ? 'The gathering run lifecycle version is unsupported'
          : 'The gathering run is not versioned',
        contract === 'unsupported' ? 'UNSUPPORTED_RUN' : 'LEGACY_RUN'
      );
    }
    if (!allowPaused && run.pauseState) {
      throw gatheringLifecycleError('The gathering run is paused', 'RUN_PAUSED');
    }
    if (run.executionJournal?.status === 'recoveryRequired') {
      throw gatheringLifecycleError('The gathering run requires recovery', 'RECOVERY_REQUIRED');
    }
    if (run.executionJournal?.effects?.some((effect) => effect?.phase === 'applying')) {
      throw gatheringLifecycleError(
        'The gathering run has an uncertain execution effect',
        'RECOVERY_REQUIRED'
      );
    }
    if (expectedRevision !== undefined && Number(expectedRevision) !== Number(run.runRevision)) {
      throw gatheringLifecycleError('The gathering run revision is stale', 'STALE_RUN_REVISION');
    }
    if (requireReady && this.runManager?.canExecuteRun?.(run) !== true) {
      throw gatheringLifecycleError('The gathering run is not ready', 'RUN_NOT_READY');
    }
    return run;
  }

  _versionedCheckDescriptor({ actor, run, system, environment, task }) {
    const secret = isBlindWaitingTaskId(run?.taskId);
    const mode = stringOrNull(task?.resolutionMode) || 'd100';
    const config =
      mode === 'routed'
        ? plainObjectOrNull(system?.gatheringCraftingCheck?.routed)
        : mode === 'progressive'
          ? plainObjectOrNull(system?.gatheringCraftingCheck?.progressive)
          : null;
    const rollFormula = stringOrNull(config?.rollFormula);
    const requiresCheck = gatheringTaskRequiresPlayerCheck(task);
    const slot = mode === 'routed' ? 'routed' : mode === 'progressive' ? 'progressive' : null;
    const checkMode = mode === 'routed' ? 'routedByCheck' : mode;
    const dc = mode === 'routed' ? this._resolveGatheringRoutedDc(config, task) : null;
    const label = secret ? this.localize(BLIND_TASK_LABEL_KEY) : stringOrEmpty(task?.name);
    const dcLabel = Number.isFinite(dc) ? ` (DC ${dc})` : '';
    return {
      required: requiresCheck,
      publicPrompt: {
        label,
        mode: checkMode,
        allowsSituationalModifier: Boolean(rollFormula),
        allowAdvantage: Boolean(rollFormula && /(?:^|\W)d20(?:\W|$)/i.test(rollFormula)),
      },
      privateEvaluation: {
        secret,
        actorUuid: stringOrNull(actor?.uuid),
        flavor: `${label ? `${label} — ` : ''}Gathering check${dcLabel}`,
        speaker: cloneJson(globalThis.ChatMessage?.getSpeaker?.({ actor })) ?? null,
        craftingSystemId: stringOrNull(system?.id),
        environmentId: stringOrNull(environment?.id),
        taskId: stringOrNull(task?.id),
        mode: checkMode,
        slot,
        rollFormula,
        checkConfig: config ? cloneJson(config) : null,
        decisionPolicy: {
          dc: Number.isFinite(dc) ? dc : null,
          thresholdMode: stringOrNull(config?.thresholdMode),
          type: stringOrNull(config?.type),
          relativeOutcomes: cloneJson(normalizeList(config?.relativeOutcomes)),
          fixedOutcomes: cloneJson(normalizeList(config?.fixedOutcomes)),
          clampToNearest: mode === 'routed',
          minOutcomeId: null,
        },
      },
    };
  }

  /**
   * Resume matured timed gathering runs for the supplied Foundry world time.
   *
   * Non-matured waitingTime runs are filtered by GatheringRunManager. Matured paths call
   * completeRun with planned result/tool/check refs before committing result creation, tool
   * usage or failure feedback; if terminal history persistence throws or returns null, those
   * post-history side effects are skipped.
   */
  async processWorldTime(worldTime) {
    const processed = [];
    const completed = [];
    const cancelled = [];
    const cleared = [];
    const errors = [];
    // Primary-GM gate (mirrors the issue-656 fix in CraftingRunManager). `updateWorldTime` is
    // synced, so this runs on EVERY connected client and `getMaturedWaitingRuns` walks ALL of
    // `game.actors`. Maturation writes run flags, CREATES the gathered items, burns tool
    // durability, posts chat and depletes the node pool, and `completeRun` returning null for
    // the loser is a race rather than a lock, so without this gate two clients can both
    // double-apply every one of those effects. Uses the fail-open `resumeTimedRuns` wired in
    // main.js, not the `isPrimaryGM` maintenance gate.
    const readyRuns = this.resumeTimedRuns()
      ? normalizeList(await this.runManager?.getMaturedWaitingRuns?.(worldTime))
      : [];

    for (const entry of readyRuns) {
      const actor = entry?.actor ?? null;
      const run = entry?.run ?? null;
      if (!actor || !run?.id || run.status !== 'waitingTime') continue;

      try {
        const result =
          getRunLifecycleContract(run) === 'current'
            ? await this._requestVersionedWorldTimeExecution({ actor, run })
            : await this._processMaturedWaitingRun({ actor, run });
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

    // Drive stamina regeneration and node respawn off the same world-time tick that matures
    // timed runs. Guarded to the primary GM so connected clients never double-apply.
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

  async _requestVersionedWorldTimeExecution({ actor, run }) {
    if (this._gamePaused()) {
      throw gatheringLifecycleError(
        'Automatic gathering stopped while the game is paused',
        'GAME_PAUSED'
      );
    }
    const resolved = this._resolveWaitingRunContext({
      actor,
      run: this._hydrateBlindWaitingRun(run),
    });
    if (!resolved.missingReference && gatheringTaskRequiresPlayerCheck(resolved.task)) {
      throw gatheringLifecycleError(
        'Automatic gathering stopped for a required player check',
        'AUTOMATIC_CHECK_REQUIRED'
      );
    }
    const requestExecute = this.versionedRunAuthority?.requestExecute;
    if (typeof requestExecute !== 'function') {
      throw gatheringLifecycleError(
        'Versioned gathering authority is unavailable',
        'AUTHORITY_UNAVAILABLE'
      );
    }
    const result = await requestExecute({
      actor,
      runId: run.id,
      expectedRevision: run.runRevision,
      trigger: 'worldTime',
    });
    if (result?.success === false && !['cancelled', 'cleared'].includes(result?.state)) {
      throw gatheringLifecycleError(
        stringOrNull(result.message) || 'Automatic gathering execution was refused',
        stringOrNull(result.code) || 'AUTOMATIC_EXECUTION_REFUSED'
      );
    }
    return result;
  }

  /**
   * Thin delegate to the world-time processor's interactable-scoped node respawn pass (issue
   * 374), kept so callers that drive the pass directly stay green after the extraction.
   *
   * @param {number} worldTime
   * @returns {Promise<Array<{sceneId:string, regionId:string, behaviorId:string}>>}
   */
  _processInteractableNodeRespawn(...args) {
    return this.worldTimeProcessor._processInteractableNodeRespawn(...args);
  }

  async startAttempt(
    {
      viewer = null,
      actor = null,
      rememberedActorId = null,
      environmentId = null,
      taskId = null,
      // Virtual-present tools injected by an active canvas Tool station: a `{ systemId,
      // componentIds }` payload satisfying a tool prerequisite WITHOUT an owned item (and
      // excluded from breakage/usage) ONLY for tasks in the matching crafting system.
      presentTools = null,
      // Optional scene-interactable ref ({sceneId, regionId, behaviorId}) when the attempt was
      // opened against an interactable owning its own scoped node pool (issue 302).
      interactableRef = null,
      // Opt-in interactive roll: surfaces the confirm-roll dialog and posts the roll to chat.
      // Defaults false so the programmatic API and timed maturation stay silent.
      interactive = false,
      lifecycleVersion,
    } = {},
    versionedContext = null
  ) {
    if (versionedContext && versionedContext[VERSIONED_START_CONTEXT] !== true) {
      return gatheringAuthorityUnavailable();
    }
    if (lifecycleVersion !== undefined && !versionedContext) {
      return lifecycleVersion === 1
        ? gatheringAuthorityUnavailable()
        : versionedGatheringFailure('The gathering run lifecycle version is unsupported.');
    }
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

    // System-validity gate: a system with a `blocks: 'system'` validation issue is unusable, so
    // a non-GM attempt is rejected. GMs bypass so they can still diagnose a broken system.
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
        versionedContext,
      });
    }

    if (versionedContext) {
      return this._startReadyVersionedAttempt({
        viewer,
        actor: selectedActor,
        system,
        environment,
        task,
        richAttempt,
        interactableRef,
        versionedContext,
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
      interactive,
    });
  }

  async _processMaturedWaitingRun({ actor, run, versionedContext = null }) {
    if (getRunLifecycleContract(run) === 'current' && !versionedContext) {
      throw gatheringLifecycleError(
        'Versioned gathering execution requires authority',
        'AUTHORITY_UNAVAILABLE'
      );
    }
    const resolveAttempt = createGatheringAttemptResolution({
      prepare: this._prepareMaturedAttempt.bind(this),
      validate: this._validateMaturedTask.bind(this),
      resolveOutcome: this._resolveTaskOutcome.bind(this),
      checkPersistAvailable: noRefusal,
      planSideEffects: this._terminalSideEffectPlan.bind(this),
      composeHistory: this._terminalHistoryWrite.bind(this),
      writeTerminalHistory: this._writeMaturedTerminalHistory.bind(this),
      commit: this._commitMaturedTerminal.bind(this),
      respond: this._respondTerminalAttempt.bind(this),
      refuse: this._refuseMaturedAttempt.bind(this),
    });
    return resolveAttempt({ actor, waitingRun: run, versionedContext });
  }

  async _prepareMaturedAttempt({ actor, waitingRun, versionedContext }) {
    const viewer = await this._viewerForRun({ actor, run: waitingRun });
    // A blind run's task and start-time snapshot live in the GM-owned store, not the actor flag.
    const activeRun = this._hydrateBlindWaitingRun(waitingRun);
    const resolved = this._resolveWaitingRunContext({ actor, run: activeRun });
    if (resolved.missingReference) {
      return { refusal: { kind: 'missing-reference', details: { viewer, activeRun, resolved } } };
    }
    return {
      ...resolved,
      actor,
      viewer,
      waitingRun,
      activeRun,
      versionedContext,
      resolvedCheckResult: versionedContext?.resolvedCheckResult ?? null,
      phase: maturityCommitPhase(waitingRun),
      initiatedBy: 'timed',
    };
  }

  _validateMaturedTask({ system, task }) {
    const configuration = this._validateStartTask(task, system);
    if (configuration.valid === true) return null;
    return { kind: 'task-misconfigured-config', details: { errors: configuration.errors } };
  }

  async _writeMaturedTerminalHistory(context) {
    const { actor, activeRun, versionedContext, outcome, runData, payload } = context;
    if (versionedContext) {
      return { run: null, response: await this._persistAndApplyVersionedTerminal(context) };
    }
    const run = await this.runManager.completeRun(actor, activeRun, outcome.status, payload, {
      terminalRunData: runData,
    });
    if (!run) {
      throw Object.assign(new Error('Timed gathering terminal history was not written'), {
        code: 'TERMINAL_HISTORY_NOT_WRITTEN',
      });
    }
    return { run, response: null };
  }

  async _commitMaturedTerminal({ run, waitingRun, ...context }) {
    const settlement = await this._commitLegacyTerminal({ run, ...context });
    // The claim is now spent, so release it between the commit write and the response.
    await this._releaseBlindReservation(waitingRun);
    return settlement;
  }

  async _refuseMaturedAttempt(kind, context) {
    const { waitingRun, activeRun, resolved, viewer, actor, versionedContext } = context;
    if (kind === 'cancelled') {
      throw gatheringLifecycleError(
        'A timed gathering outcome cannot be cancelled',
        'CANCELLED_TIMED_OUTCOME'
      );
    }
    if (kind === 'missing-reference') {
      return this._cancelMissingReferenceRun({ viewer, actor, run: activeRun, resolved });
    }
    const { environment, task, errors, outcome } = context;
    const cleared = { viewer, actor, environment, task, errors, outcome };
    return versionedContext
      ? this._clearInvalidVersionedRun({ ...cleared, run: waitingRun, versionedContext })
      : this._clearMisconfiguredWaitingRun({ ...cleared, run: activeRun });
  }

  /**
   * Public read API — a thin delegator to the GatheringListingBuilder collaborator (issue
   * 375), kept on the engine because external callers dispatch by method name on the instance.
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
      components: resolvedComponentsFor(system),
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
   * A static, drop-rate-only approximation of the chance a d100 task yields at least one item:
   * `1 − ∏(1 − dropRate_i/100)` over enabled drop rows. It ignores actor/condition modifiers,
   * attempt limits, node depletion, stamina, tools and the d100 success threshold, so it means
   * "chance at least one drop rolls", not whole-attempt success.
   *
   * @param {object} task A composed/normalized gathering task.
   * @returns {number|null} A 0–1 fraction, or `null` for non-d100 tasks or no enabled rows.
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
  _resolveRealmContext({ actor, cache = null }) {
    // ONE cache entry, not one per system (issue 1282). Where the actor's party is standing is
    // world-wide now, so keying this by `systemId` would recompute an identical answer once
    // per crafting system in the listing.
    const key = 'world';
    if (cache && cache.has(key)) return cache.get(key);
    const context =
      typeof this.locationResolver?.buildCurrentRealmContext === 'function'
        ? this.locationResolver.buildCurrentRealmContext({ actor })
        : { resolved: false, source: 'unresolved', realms: [], realmIds: [], staleRealmIds: [] };
    if (cache) cache.set(key, context);
    return context;
  }

  /**
   * Evaluate location availability for an environment and produce blocked reasons plus a
   * redaction-safe `location` listing field. Fast-exits with no reasons and an ungated
   * `location` when no resolver is wired or the environment declares no location rules, so
   * legacy ungated environments are preserved exactly. Non-GM blocked-reason `data` is built
   * entirely from `buildTravelGuidance`, whose destinations flow through `buildRealmDisclosure`,
   * so secret undiscovered realm ids/names never appear in player-facing data.
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
    const revealMode = this._realmRevealMode();
    // The FULL world library, not `context.realms`: this feeds `buildTravelGuidance`, which
    // names the destinations a player could travel to, not merely the ones they are in.
    const worldRealms = this.travelStore?.list?.();
    const realmsById = new Map(
      (Array.isArray(worldRealms) ? worldRealms : []).map((realm) => [realm.id, realm])
    );
    const discoveredRealmIds = actor ? getDiscoveredRealmIds(actor) : new Set();

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
   * Resolve the party's current-realm summary for the header bar, independent of whether THIS
   * environment is location-gated, so the header can show "current realm / no realm selected"
   * whenever the realm/travel subsystem is enabled. Reuses the per-listing realm-context cache
   * and the same `buildRealmDisclosure` redaction policy as the gated path.
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
    const revealMode = this._realmRevealMode();
    const discoveredRealmIds = actor ? getDiscoveredRealmIds(actor) : new Set();
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
   * Resolve the listing-level current-realm context for the player header chip, independent of
   * which environment (if any) is selected: the current realm is a property of the party and
   * the world, so the chip must surface it even when every environment is realm-locked.
   *
   * The realms are resolved through `_currentRealmSummary` (NOT raw `context.realms`) so
   * disclosure/redaction stays identical to the per-environment path. The returned object uses
   * the STORE contract keys (`enabled`/`realms`, not `realmsEnabled`/`currentRealms`) so the
   * View can pass it straight through `setRealmContext` with no remapping.
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
    // The chip shows whenever at least one realm-enabled system participates (issue 1282): the
    // realm library, the reveal mode and the party's location are world-wide, so every enabled
    // system answers identically. Zero participating systems hides it.
    if (realmEnabledSystemIds.length === 0) {
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

  /**
   * How realm names are disclosed to players — a WORLD fact since issue 1282.
   *
   * Read through the shared helper rather than inline, because the old per-system read
   * coerced a missing value to `'manual'`: a reader left pointing at the retired field would
   * have turned every `alwaysVisible` world into a `manual` one silently, with no error.
   */
  _realmRevealMode() {
    return getRealmRevealMode(this.travelStore?.get?.());
  }

  async _checkSceneAccess({ environment, viewer, actor }) {
    if (typeof this.sceneAccess?.canAttempt === 'function') {
      return normalizeGateResult(await this.sceneAccess.canAttempt({ environment, viewer, actor }));
    }
    return { allowed: false, code: 'SCENE_TOKEN_BLOCKED' };
  }

  /**
   * Collect the blocked-reason list for a single task (game-paused, duplicate run, tool,
   * conditions, scene, and rich-attempt gates).
   *
   * @param {object} args
   * @param {object} args.environment Composed environment.
   * @param {object} args.system Owning crafting system.
   * @param {object} args.task Composed/normalized task.
   * @param {object} args.actor Selected actor.
   * @param {object} args.viewer Foundry user requesting the listing.
   * @param {boolean} [args.transparent=false] Bypass the `_isOpaqueBlindTask` redaction so a
   *   revealed blind task keeps its real required-weather/time and missing-tool details.
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
   * Build the player-facing required-tools list for a task, each entry tagged with the actor's
   * per-tool state: `{ id, name, img, state: 'present'|'damaged'|'missing', required: true }`.
   *
   * Resolved tools are classified via {@link classifyGatheringToolStates} — the same matcher
   * attempt validation uses, so the state agrees with whether the attempt is blocked — while
   * unresolved or disabled library tool refs are surfaced as `missing`. Display `name`/`img`
   * come from the tool's `componentId` resolved against the system's components (tool `label`
   * wins when set). Tolerant of a null actor/system.
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
      // The shared `data-models` requirement-13 precedence: authored label, then the
      // registration snapshot, then the linked component. Consulting the component alone
      // rendered "Unknown tool" + the item-bag glyph for every item-sourced Tool, which
      // carries `componentId: null` by construction (issue 1119).
      const name = resolveToolDisplayName(tool, component, this.localize(UNKNOWN_TOOL_LABEL_KEY));
      const img = resolveToolDisplayImage(tool, component);
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
    if (!system?.id) return map;
    // MOVED OFF `getItems` at issue 1370. `getItems` is the AUTHORING and browse accessor and
    // stays on the persisted record; `getComponentsForSystem` is the repointed READ accessor.
    // A manager double that stubs only `getItems` still answers, and a record-only fixture
    // falls through to the shared read seam.
    let components;
    try {
      if (typeof this.systemManager?.getComponentsForSystem === 'function') {
        components = normalizeList(this.systemManager.getComponentsForSystem(system.id));
      } else if (typeof this.systemManager?.getItems === 'function') {
        components = normalizeList(this.systemManager.getItems(system.id));
      } else {
        components = resolvedComponentsFor(system);
      }
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
    const presentScope = { presentTools, systemId: system?.id ?? task?.craftingSystemId ?? null };
    const presentSet = resolvePresentComponentIds(presentScope);
    // An item-sourced Tool station has no componentId to key on (issue 1119).
    const presentToolSet = resolvePresentToolIds(presentScope);
    const missing = tools.filter(
      (tool) => !presentToolSet.has(tool?.id) && !presentSet.has(tool?.componentId)
    );
    return missing.length === 0
      ? { available: true, missing: [], failedRequirements: [] }
      : { available: false, missing, failedRequirements: [] };
  }

  /**
   * Build the per-task model surfaced in the player listing. For an opaque blind task (non-GM
   * viewer of a blind environment) it returns the collapsed `blindGather` action with task
   * identity redacted; otherwise the full transparent model, including a `successChance` (see
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
   * @param {boolean} [args.forceVisible=false] Skip the opaque blind collapse — used for
   *   already-revealed tasks in the "Discovered Tasks" list.
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
      hasTimeRequirement: hasTimeRequirement(task),
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
   * Evaluate the rich-state attempt gate for a task and map its blocked reasons into the
   * listing's blocked-reason shape.
   *
   * @param {object} args
   * @param {object} args.actor Selected actor.
   * @param {object} args.viewer Foundry user requesting the listing.
   * @param {object} args.system Owning crafting system.
   * @param {object} args.environment Composed environment.
   * @param {object} args.task Composed/normalized task.
   * @param {boolean} [args.transparent=false] Keep the real per-reason `data` for a revealed
   *   blind task instead of nulling it via the `_isOpaqueBlindTask` redaction.
   * @returns {Promise<{blockedReasons: object[], evidence: object}>}
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

  /**
   * Whether run HISTORY must still name this run's task generically for this viewer (D-027).
   *
   * Owning the actor never discloses a blind task, and a run the GM executed persists the REAL
   * task id, so the record's marker cannot answer it — the environment plus the recorded reveal
   * can, which is exactly what {@link GatheringEngine#_isBlindIdentityHidden} answers for the card.
   *
   * @param {{actor: ?object, viewer: ?object, environmentId: ?string, taskId: ?string}} args
   * @returns {boolean} True when history must show the generic blind label.
   */
  isHistoricalBlindIdentityHidden({ actor = null, viewer = null, environmentId, taskId } = {}) {
    const environment = this._findEnvironment(environmentId);
    const task = { id: stringOrNull(taskId) };
    return environment ? this._isBlindIdentityHidden({ environment, viewer, actor, task }) : false;
  }

  /**
   * Whether this viewer must still be told WHICH task an attempt resolved to via the generic
   * blind label rather than its real name. Distinct from
   * {@link GatheringEngine#_isOpaqueBlindTask}, which stays true forever even for a task the
   * reveal policy has disclosed: identity is hidden only while the task is opaque to this
   * viewer AND the actor has no reveal recorded at the environment's reveal scope. Reading the
   * recorded reveal, rather than re-deriving the policy, is what keeps the chat card in step
   * with the listing.
   *
   * @private
   * @param {object} args
   * @param {object} args.environment Composed environment.
   * @param {?object} args.viewer Active viewer payload.
   * @param {?object} args.actor Acting actor, whose flag holds the reveal state.
   * @param {?object} args.task Resolved task.
   * @returns {boolean} True when the real task identity must not be disclosed.
   */
  _isBlindIdentityHidden({ environment, viewer, actor, task }) {
    if (!this._isOpaqueBlindTask({ environment, viewer })) return false;
    const taskId = stringOrNull(task?.id);
    const environmentId = stringOrNull(environment?.id);
    if (!taskId || !environmentId) return true;
    if (typeof this.richState?.listRevealedTaskIds !== 'function') return true;
    const { scope } = this._resolveRevealPolicy(environment);
    try {
      return normalizeList(
        this.richState.listRevealedTaskIds({ actor, environmentId, scope })
      ).every((id) => String(id) !== taskId);
    } catch {
      return true;
    }
  }

  _gamePaused() {
    return typeof this.isGamePaused === 'function' && this.isGamePaused() === true;
  }

  /**
   * Decide whether a start must be routed to the active GM, and route it.
   *
   * A blind run's secret state lives in a world setting only a GM may write, and the DRAW must
   * happen somewhere the acting player cannot rig it. A blind start that will create a waiting
   * run is therefore handed to the active GM, which re-runs the whole attempt with the
   * requesting user as the viewer: gates, draw, node reservation and both records are all
   * GM-side. Returns null — "start locally, unchanged" — when this client may write the setting
   * itself, when there is no relay, or when the start cannot produce a persisted in-flight run.
   *
   * @returns {Promise<object|null>} A relayed start result, or null.
   */
  async _relayBlindStartIfNeeded({
    viewer = null,
    actor = null,
    rememberedActorId = null,
    environmentId = null,
    taskId = null,
    interactableRef = null,
  } = {}) {
    if (!this.relayBlindStart || this.blindRunStore?.canWrite() !== false) return null;
    const targets = await this._resolveStartTargets({
      viewer,
      actor,
      rememberedActorId,
      environmentId,
    });
    // Let `startAttempt` produce the real blocked reason for an unresolvable
    // start rather than duplicating its diagnostics here.
    if (targets.blockedReason) return null;
    const { selectedActor, environment } = targets;
    if (!this._isOpaqueBlindTask({ environment, viewer })) return null;
    if (!this._blindStartPersistsRun({ environment, taskId })) return null;

    const routed = this.relayBlindStart({
      environmentId: stringOrNull(environment.id),
      actorUuid: stringOrNull(selectedActor?.uuid),
      taskId: stringOrNull(taskId),
      interactableRef: normalizeInteractableRef(interactableRef),
    });
    if (routed !== true) {
      return this._blockedStart({
        viewer,
        actor: selectedActor,
        environment,
        task: null,
        reason: this._blockedReason('RUN_CREATION_FAILED', { data: null }),
      });
    }
    return this._relayedStart({ viewer, actor: selectedActor, environment });
  }

  /**
   * Whether a blind start will leave persisted in-flight state — i.e. whether it can create a
   * WAITING run, the only case that needs the GM.
   *
   * A targeted start names its task, so this is exact. An automatic start does not yet know its
   * task, so it is answered conservatively from the environment's shape: if ANY task there is
   * timed, the draw could land on one. A wholly immediate blind environment never routes.
   *
   * @returns {boolean}
   */
  _blindStartPersistsRun({ environment, taskId }) {
    const targeted = this._findStartTask({ environment, taskId });
    if (targeted) return hasTimeRequirement(targeted);
    return normalizeList(environment?.tasks).some((task) => hasTimeRequirement(task));
  }

  /**
   * The result of a start handed to the active GM. Accepted but not yet started
   * on this client: there is no run id to report, because the run is created by
   * the GM and arrives when the actor-flag write replicates.
   *
   * @returns {object}
   */
  _relayedStart({ viewer, actor, environment }) {
    return {
      accepted: true,
      started: false,
      relayed: true,
      state: 'relayed',
      viewerId: idOf(viewer),
      actorId: actor ? idOf(actor) : null,
      environmentId: stringOrNull(environment?.id),
      taskId: null,
      runId: null,
      blockedReasons: [],
    };
  }

  /**
   * Resolve the actor, environment and crafting system a start addresses — everything the start
   * context needs BEFORE any task is chosen, so the player→GM blind-start relay can decide
   * whether to route WITHOUT drawing the blind task first (issue 901).
   *
   * @returns {Promise<{selectedActor?: object, system?: object, environment?: object,
   *   actor?: object|null, blockedReason?: object}>}
   */
  async _resolveStartTargets({ viewer, actor, rememberedActorId, environmentId }) {
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

    return { selectedActor: selected.actor, system, environment };
  }

  async _resolveStartContext({ viewer, actor, rememberedActorId, environmentId, taskId }) {
    const targets = await this._resolveStartTargets({
      viewer,
      actor,
      rememberedActorId,
      environmentId,
    });
    if (targets.blockedReason) return targets;

    const { selectedActor, system, environment } = targets;
    const blindAuto = environment?.selectionMode === 'blind' && !stringOrNull(taskId);
    const task = blindAuto
      ? await this._selectBlindStartTask({ environment, system, actor: selectedActor, viewer })
      : this._findStartTask({ environment, taskId });
    if (!task) {
      return {
        actor: selectedActor,
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

    return { selectedActor, system, environment, task };
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
   *
   * Candidates whose node pool is already fully spoken for by OUTSTANDING BLIND
   * RESERVATIONS are excluded (issue 901). The plain `current > 0` gate cannot
   * see them: a reservation is deliberately not a `nodeRuntime` decrement, so
   * without this a party could hold more in-flight blind runs than the pool can
   * ever pay out and over-harvest it at maturity.
   */
  async _selectBlindStartTask({ environment, system, actor, viewer }) {
    const visibleTasks = await this._visibleTaskListings({ environment, system, viewer, actor });
    let pool = visibleTasks
      .map((entry) => entry.task)
      .filter((task) => this._blindNodeReservable({ environment, task }));

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

  /**
   * The provisional node claim a blind waiting run takes on a task, or null when
   * the task has no finite node pool or the system's node economy is off.
   *
   * @returns {{environmentId: string, taskId: string, units: number, scope: string}|null}
   */
  _blindNodeReservation({ environment, task }) {
    if (!task?.nodes) return null;
    const systemId = stringOrNull(environment?.craftingSystemId);
    if (this.richState?.nodesEnabled?.(systemId) !== true) return null;
    return {
      environmentId: stringOrEmpty(environment?.id),
      taskId: stringOrEmpty(task?.id),
      units: BLIND_RESERVATION_UNITS,
      scope: 'environment',
    };
  }

  /**
   * Whether one more blind run could still be paid out of a task's node pool
   * once every outstanding reservation is subtracted. True when there is no
   * reservation to take (no pool, or node economy disabled), so the check is
   * inert for every environment that does not use finite nodes.
   *
   * @returns {boolean}
   */
  _blindNodeReservable({ environment, task }) {
    const reservation = this._blindNodeReservation({ environment, task });
    if (!reservation) return true;
    const reserved =
      this.blindRunStore?.reservedUnits({
        environmentId: reservation.environmentId,
        taskId: reservation.taskId,
      }) ?? 0;
    return Number(task.nodes.current || 0) - reserved >= reservation.units;
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

  async _startReadyVersionedAttempt({
    viewer,
    actor,
    system,
    environment,
    task,
    richAttempt,
    interactableRef,
    versionedContext,
  }) {
    if (typeof this.runManager?.createRun !== 'function') {
      return versionedGatheringFailure('Gathering runs are unavailable.');
    }
    const opaqueBlind = this._isOpaqueBlindTask({ environment, viewer });
    const runData = this._waitingRunData({
      system,
      environment,
      task,
      richAttempt,
      viewer,
      interactableRef,
      opaqueBlind,
      versionedContext,
    });
    const blindGuard = opaqueBlind
      ? this._blindWaitingStartGuard({ viewer, actor, environment, task, runData })
      : null;
    if (blindGuard) return blindGuard;

    return this._persistAndApplyVersionedStart({
      viewer,
      actor,
      system,
      environment,
      task,
      interactableRef,
      opaqueBlind,
      versionedContext,
      status: 'inProgress',
      createRun: (executionPlan) => this.runManager.createRun(actor, runData, { executionPlan }),
      buildResponse: (run) =>
        this._startedVersionedReadyStart({ viewer, actor, system, environment, task, run }),
    });
  }

  async _startWaitingAttempt({
    viewer,
    actor,
    system,
    environment,
    task,
    richAttempt = null,
    interactableRef = null,
    versionedContext = null,
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

    const opaqueBlind = this._isOpaqueBlindTask({ environment, viewer });
    const runData = this._waitingRunData({
      system,
      environment,
      task,
      richAttempt,
      viewer,
      interactableRef,
      opaqueBlind,
      versionedContext,
    });
    const blindGuard = opaqueBlind
      ? this._blindWaitingStartGuard({ viewer, actor, environment, task, runData })
      : null;
    if (blindGuard) return blindGuard;
    const timeRequirement = normalizeTimeRequirement(task.timeRequirement);

    if (versionedContext) {
      return this._persistAndApplyVersionedStart({
        viewer,
        actor,
        system,
        environment,
        task,
        interactableRef,
        opaqueBlind,
        versionedContext,
        status: 'waitingTime',
        createRun: (executionPlan) =>
          this.runManager.createWaitingRun(actor, runData, timeRequirement, { executionPlan }),
        buildResponse: (run) =>
          this._startedWaitingStart({ viewer, actor, system, environment, task, run }),
      });
    }

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

      // The secret record must land before the run is treated as started: without
      // it a blind run has no task and no snapshot to mature against, so a failed
      // write is rolled back rather than left as an unresolvable run.
      const secret = await this._recordBlindRunSecret({
        run,
        actor,
        system,
        environment,
        task,
        interactableRef,
        opaqueBlind,
      });
      if (secret === false) {
        await this.runManager?.clearActiveRun?.(actor, run.id);
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
              code: 'BLIND_RUN_NOT_RECORDED',
            }),
          }),
        });
      }

      const richEvidence = await this._commitRichAttempt({
        actor,
        system,
        environment,
        // A blind run's claim on a node is the RESERVATION recorded above, not a
        // `nodeRuntime` decrement, so the start commit must not consume one. It
        // still spends stamina, so a blind attempt is never free up front.
        task: waitingStartCommitTask(task, opaqueBlind),
        outcome: { status: 'waitingTime' },
        viewer,
        interactableRef,
        // First of this run's two commits; the maturity commit follows later.
        phase: 'waitingStart',
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

  async _persistAndApplyVersionedStart({
    viewer,
    actor,
    system,
    environment,
    task,
    interactableRef,
    opaqueBlind,
    versionedContext,
    status,
    createRun,
    buildResponse,
  }) {
    const state = { run: null, richEvidence: null };
    const definitions = [];
    if (opaqueBlind) {
      definitions.push(
        versionedEffect('blind', 'recordGatheringBlindRun', null, async () => {
          const stored = await this._recordBlindRunSecret({
            run: state.run,
            actor,
            system,
            environment,
            task,
            interactableRef,
            opaqueBlind,
          });
          if (stored === false) {
            throw gatheringLifecycleError(
              'The blind gathering run could not be recorded',
              'BLIND_RUN_NOT_RECORDED'
            );
          }
          return {
            recorded: true,
            reservationUnits: Number(stored?.reservation?.units) || 0,
          };
        })
      );
    }
    definitions.push(
      versionedEffect('economy', 'commitGatheringEconomy', { phase: 'waitingStart' }, async () => {
        state.richEvidence = await this._commitRichAttempt({
          actor,
          system,
          environment,
          task: waitingStartCommitTask(task, opaqueBlind),
          outcome: { status },
          viewer,
          interactableRef,
          phase: 'waitingStart',
        });
        return opaqueBlind
          ? redactRichEvidence(state.richEvidence || {}, { viewer })
          : (cloneJson(state.richEvidence) ?? null);
      })
    );
    const executionPlan = {
      operationId: versionedContext.operationId,
      requestId: versionedContext.requestId,
      baseRunRevision: 0,
      intent: {
        activity: 'gathering',
        trigger: 'start',
        status,
        taskId: opaqueBlind ? 'blind' : stringOrNull(task.id),
      },
      effects: definitions.map(({ effectId, kind, planned }) => ({ effectId, kind, planned })),
    };
    state.run = await createRun(executionPlan);
    for (const definition of definitions) {
      await this._applyVersionedGatheringEffect({
        actor,
        definition,
        operationId: versionedContext.operationId,
        state,
      });
    }
    const response = buildResponse(mergeRunEconomyEvidence(state.run, state.richEvidence));
    state.run = await this.runManager.updateExecutionJournal(
      actor,
      state.run.id,
      { type: 'commit', outcome: versionedJournalOutcome(response) },
      {
        expectedRevision: state.run.runRevision,
        executionOperationId: versionedContext.operationId,
      }
    );
    return buildResponse(mergeRunEconomyEvidence(state.run, state.richEvidence));
  }

  /**
   * Build the payload persisted on the ACTOR for a waiting run.
   *
   * For an opaque-blind run this is the integrity boundary (issue 901). The player-readable
   * flag carries the `blind:<environmentId>` marker instead of the drawn task's id, omits the
   * runtime snapshot (which embeds the whole task), and reports the ENVIRONMENT's risk rather
   * than the task's `riskOverride`, which would fingerprint the drawn task. The real id and the
   * snapshot go to the GM-owned blind-run store; what remains describes only facts the acting
   * player can already observe.
   *
   * @param {object} args
   * @param {boolean} args.opaqueBlind Whether this viewer sees the task as blind.
   * @returns {object} The run data handed to `createWaitingRun`.
   */
  _waitingRunData({
    system,
    environment,
    task,
    richAttempt = null,
    viewer = null,
    interactableRef = null,
    opaqueBlind = false,
    versionedContext = null,
  }) {
    const runData = {
      craftingSystemId: stringOrNull(system.id),
      environmentId: stringOrNull(environment.id),
      taskId: opaqueBlind ? blindWaitingTaskId(environment) : stringOrNull(task.id),
      // The run belongs to the VIEWER who requested it, not to whoever is running this
      // (issue 1288). A relayed blind start executes on the elected GM's client, and the
      // run manager's fallback would otherwise stamp the GM — which `getGatheringRunViewer`
      // reads back at maturity as a GM viewer, un-blinding the terminal history it writes
      // to the player's own actor flag. Null falls back to the manager's ambient default,
      // which is right for the direct in-session start that supplies no viewer.
      userId: idOf(viewer),
    };
    if (versionedContext) {
      runData.lifecycleVersion = 1;
      runData.completionMode = versionedContext.completionMode || 'manual';
    }
    // Persist the scene-interactable ref so a timed run that matures later
    // decrements the SAME scoped node it gated against (issue 302). Null/absent
    // for the environment-scoped flow (no behaviour stored).
    const persistedRef = normalizeInteractableRef(interactableRef);
    if (persistedRef) runData.interactableRef = persistedRef;
    if (!opaqueBlind || hasRichGatheringData(environment, task) || task.resolutionMode === 'd100') {
      const richPayload = this._richHistoryPayload({ environment, task, richAttempt, viewer });
      if (opaqueBlind) {
        richPayload.riskLevel = stringOrNull(environment?.risk) || 'safe';
      } else {
        richPayload.economyEvidence = {
          ...richPayload.economyEvidence,
          runtimeSnapshot: this._runtimeSnapshot({ environment, task }),
        };
      }
      Object.assign(runData, richPayload);
    }
    return runData;
  }

  /**
   * Pre-creation guards that apply only to an opaque-blind waiting start:
   * the marker-keyed duplicate check and the reservation-aware node check.
   * Returns a blocked start result, or null when the start may proceed.
   *
   * @returns {object|null}
   */
  _blindWaitingStartGuard({ viewer, actor, environment, task, runData }) {
    // The duplicate check `startAttempt` already made was against the REAL task
    // id, which no blind run is stored under, so it cannot see an in-flight blind
    // run in this environment. Re-check against the marker the run is actually
    // keyed by — that is what enforces "one active blind run per blind
    // environment" — or `createWaitingRun` would reject the second attempt as a
    // run-creation failure instead of the duplicate it is.
    if (this.runManager?.findActiveRunForTask?.(actor, runData.taskId)) {
      return this._blockedStart({
        viewer,
        actor,
        environment,
        task,
        reason: this._blockedReason('DUPLICATE_ACTIVE_RUN', {
          data: this._blindTaskData({ environment, task, viewer }),
        }),
      });
    }
    // Re-check availability against outstanding reservations immediately before
    // taking one, not only when the candidate pool was built, so two
    // near-simultaneous starts cannot both claim the last node.
    if (!this._blindNodeReservable({ environment, task })) {
      return this._blockedStart({
        viewer,
        actor,
        environment,
        task,
        reason: this._blockedReason('NODE_DEPLETED', {
          data: this._blindTaskData({ environment, task, viewer }),
        }),
      });
    }
    return null;
  }

  /**
   * Write a blind run's secret state — drawn task, start-time snapshot and provisional node
   * reservation — into the GM-owned blind-run store. The snapshot is taken at START so the run
   * resolves against the environment as it was when the player set out; the reservation is
   * taken here so a party cannot start more blind runs than the pool can pay out.
   *
   * @returns {Promise<object|null|false>} The stored record, `null` when this run needs none
   *   (not blind), or `false` when the write was refused or failed.
   */
  async _recordBlindRunSecret({
    run,
    actor,
    system,
    environment,
    task,
    interactableRef,
    opaqueBlind,
  }) {
    if (!opaqueBlind) return null;
    if (!this.blindRunStore) return false;
    const reservation = this._blindNodeReservation({ environment, task });
    const stored = await this.blindRunStore.reserve({
      runId: stringOrNull(run?.id),
      actorUuid: stringOrNull(actor?.uuid),
      craftingSystemId: stringOrNull(system?.id),
      environmentId: stringOrNull(environment?.id),
      taskId: stringOrNull(task?.id),
      snapshot: this._runtimeSnapshot({ environment, task }),
      reservation: reservation
        ? { ...reservation, interactableRef: normalizeInteractableRef(interactableRef) }
        : null,
    });
    return stored ?? false;
  }

  /**
   * The blind-run secret record for a run id, or null. Reads only — every client
   * can read a world setting, but only the GM's listing is allowed to render it.
   *
   * @param {string} runId
   * @returns {object|null}
   */
  _blindRunSecret(runId) {
    return this.blindRunStore?.get?.(runId) ?? null;
  }

  /**
   * Fold a blind run's GM-held secret state back onto the run record so the maturity path can
   * resolve it with the code that already reads a run's own `taskId` and
   * `economyEvidence.runtimeSnapshot`.
   *
   * BACK-COMPAT: a run whose `taskId` is a real id is returned untouched. A blind-marked run
   * with no store record returns a null `taskId`, routing into the blind-redacted
   * missing-reference cancellation rather than resolving against an arbitrary task.
   *
   * @param {object} run
   * @returns {object} The run to resolve the maturity context from.
   */
  _hydrateBlindWaitingRun(run) {
    if (!isBlindWaitingTaskId(run?.taskId)) return run;
    const secret = this._blindRunSecret(stringOrNull(run?.id));
    if (!secret) return { ...run, taskId: null };
    return {
      ...run,
      taskId: secret.taskId,
      economyEvidence: {
        ...plainObjectOrNull(run?.economyEvidence),
        runtimeSnapshot: secret.snapshot ?? undefined,
      },
    };
  }

  /**
   * Release a blind run's provisional node reservation once the run is terminal — completed,
   * cancelled or cleared. A released reservation never touched the real `nodeRuntime` pool, so
   * nothing has to be given back. Keyed by RUN ID, not by the blind marker, so it works on the
   * persisted run and on its hydrated copy alike; a run with no record is a no-op, as is any
   * client that may not write the world setting. A THROWN maturity is deliberately released
   * nowhere: the run stays active, matures again next tick, and must keep its reservation.
   *
   * @param {object} run
   * @returns {Promise<object|null>} The released record, or null.
   */
  async _releaseBlindReservation(run) {
    const runId = stringOrNull(run?.id);
    if (!runId || !this.blindRunStore?.get?.(runId)) return null;
    return (await this.blindRunStore.release(runId)) ?? null;
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
    interactive = false,
  }) {
    const resolveAttempt = createGatheringAttemptResolution({
      prepare: passThroughAttempt,
      validate: noRefusal,
      resolveOutcome: this._resolveTaskOutcome.bind(this),
      checkPersistAvailable: this._checkTerminalRunCreation.bind(this),
      planSideEffects: this._terminalSideEffectPlan.bind(this),
      composeHistory: this._composeRichTerminalHistory.bind(this),
      writeTerminalHistory: this._createTerminalRunHistory.bind(this),
      commit: this._commitLegacyTerminal.bind(this),
      respond: this._respondTerminalAttempt.bind(this),
      refuse: this._refuseImmediateAttempt.bind(this),
    });
    return resolveAttempt({
      viewer,
      actor,
      system,
      environment,
      task,
      richAttempt,
      presentTools,
      interactableRef,
      interactive,
    });
  }

  _checkTerminalRunCreation() {
    if (typeof this.runManager?.createTerminalRun === 'function') return null;
    return { kind: 'run-creation-failed', details: { failureCode: 'MISSING_RUN_MANAGER' } };
  }

  _composeRichTerminalHistory(context) {
    const { viewer, environment, task, richAttempt, outcome } = context;
    const { runData, payload } = this._terminalHistoryWrite(context);
    const richPayload = this._richHistoryPayload({
      environment,
      task,
      richAttempt,
      viewer,
      characterModifierSnapshot: outcome?.characterModifierSnapshot ?? null,
    });
    Object.assign(runData, richPayload);
    Object.assign(payload, richPayload);
    return { runData, payload };
  }

  async _createTerminalRunHistory(context) {
    const { actor, outcome, runData, payload } = context;
    try {
      const run = await this.runManager.createTerminalRun(actor, runData, outcome.status, payload);
      return { run, response: null };
    } catch (error) {
      // A thrown write refuses; a falsy return passes through to the commit unguarded.
      return {
        run: null,
        response: this._refuseImmediateAttempt('persist-failed', { ...context, error }),
      };
    }
  }

  _refuseImmediateAttempt(kind, { viewer, actor, environment, task, outcome, failureCode, error }) {
    if (kind === 'cancelled') return this._cancelledStart({ viewer, actor, environment, task });
    const unwritten = kind === 'run-creation-failed' || kind === 'persist-failed';
    const code =
      failureCode || stringOrNull(error?.code) || stringOrNull(error?.name) || 'RUN_MANAGER_ERROR';
    const reason = unwritten
      ? this._blockedReason('RUN_CREATION_FAILED', {
          data: this._waitingRunFailureData({ environment, task, viewer, code }),
        })
      : this._blockedReason('TASK_MISCONFIGURED', {
          data: this._terminalMisconfigurationData({ environment, task, viewer, outcome }),
        });
    return this._blockedStart({ viewer, actor, environment, task, reason });
  }

  async _resolveTaskOutcome({
    viewer,
    actor,
    system,
    environment,
    task: sourceTask,
    interactive = false,
    resolvedCheckResult = null,
  }) {
    const task = { ...sourceTask, resultGroups: linkResultGroups(sourceTask.resultGroups) };
    let outcome;
    switch (task.resolutionMode) {
      case 'straight': {
        outcome = {
          status: 'succeeded',
          resultGroups: normalizeList(task.resultGroups),
          checkResult: null,
        };
        break;
      }
      case 'd100': {
        return this._resolveD100Outcome({ viewer, actor, system, environment, task, interactive });
      }
      case 'progressive': {
        return this._resolveProgressiveOutcome({
          viewer,
          actor,
          system,
          environment,
          task,
          interactive,
          resolvedCheckResult,
        });
      }
      default: {
        outcome = await this._resolveRoutedOutcome({
          actor,
          system,
          task,
          interactive,
          resolvedCheckResult,
        });
      }
    }
    return this._resolveEnvironmentalEventsForOutcome({
      viewer,
      actor,
      system,
      environment,
      task,
      outcome,
    });
  }

  async _resolveEnvironmentalEventsForOutcome({
    viewer,
    actor,
    system,
    environment,
    task,
    outcome,
  }) {
    if (!['succeeded', 'failed'].includes(outcome?.status)) return outcome;
    if (typeof this.richState?.resolveEnvironmentalEvents !== 'function') return outcome;
    const eventModifier = Number(
      environment?.eventModifier?.value ?? environment?.eventModifier ?? 0
    );
    const resolved = await this.richState.resolveEnvironmentalEvents({
      task,
      environment,
      actor,
      viewer,
      system,
      eventModifier: Number.isFinite(eventModifier) ? eventModifier : 0,
    });
    if (resolved?.status === 'misconfigured') {
      return misconfiguredOutcome({
        code: 'CHARACTER_MODIFIER_MISCONFIGURED',
        diagnostics: normalizeList(resolved.diagnostics),
      });
    }

    const characterModifierSnapshot = mergeCharacterModifierSnapshots(
      outcome.characterModifierSnapshot,
      resolved?.characterModifierSnapshot
    );
    return {
      ...outcome,
      status: resolved?.status === 'failed' ? 'failed' : outcome.status,
      characterModifierSnapshot,
      checkResult: {
        ...plainObjectOrNull(outcome.checkResult),
        events: normalizeList(resolved?.events),
        eventPolicy: stringOrNull(resolved?.eventPolicy),
        characterModifierSnapshot,
      },
    };
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
        // A VOIDED SUCCESS, not an authored failure (issue 1098). Clearing the groups
        // here is what keeps `failureOnBreak` out of failure awarding under `always`:
        // `awardsResultsFor` selects on the surviving group list, so an attempt the
        // tool-breakage policy voided has nothing left to award and cannot convert
        // "the attempt is void" into "award the failure loot".
        outcome.status = 'failed';
        outcome.resultGroups = [];
        outcome.failureAward = false;
      }

      const createdResults = awardsResultsFor(outcome, system)
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
          userId: idOf(viewer),
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
      createdResults: [],
      historySettlement: { awards: 'pending' },
      resolutionSnapshot: {
        kind: task.resolutionMode === 'straight' ? 'none' : 'check',
        mode: task.resolutionMode,
      },
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
        userId: idOf(viewer),
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

  /**
   * @param {object} args
   * @param {'immediate'|'waitingStart'|'timedMaturity'} [args.phase='immediate'] Which
   *   of a run's commits this is. A TIMED run commits twice (start + maturity); the
   *   rich state uses this to consume the node exactly once per run.
   */
  async _commitRichAttempt({
    actor,
    system,
    environment,
    task,
    outcome,
    viewer = null,
    interactableRef = null,
    phase = 'immediate',
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
      phase,
    });
  }

  async _persistAndApplyVersionedTerminal({
    viewer,
    actor,
    system,
    environment,
    task,
    outcome,
    checkResult,
    plan,
    runData,
    payload,
    activeRun,
    interactableRef,
    versionedContext,
    phase,
    initiatedBy,
  }) {
    const opaqueBlind = this._isOpaqueBlindTask({ environment, viewer });
    const state = { run: null, richEvidence: null, complications: [], response: null };
    const definitions = this._versionedGatheringEffects({
      viewer,
      actor,
      system,
      environment,
      task,
      outcome,
      checkResult,
      plan,
      activeRun,
      interactableRef,
      phase,
      initiatedBy,
      opaqueBlind,
      state,
    });
    const executionPlan = {
      operationId: versionedContext.operationId,
      requestId: versionedContext.requestId,
      baseRunRevision: activeRun.runRevision,
      intent: {
        activity: 'gathering',
        trigger: versionedContext.trigger || 'manual',
        status: outcome.status,
        taskId: opaqueBlind ? 'blind' : stringOrNull(task.id),
      },
      effects: definitions.map(({ effectId, kind, planned }) => ({ effectId, kind, planned })),
    };
    state.run = await this.runManager.completeRun(actor, activeRun, outcome.status, payload, {
      terminalRunData: runData,
      executionPlan,
      expectedRevision: activeRun.runRevision,
      executionOperationId: versionedContext.operationId,
    });
    if (!state.run) {
      throw gatheringLifecycleError(
        'Gathering terminal history was not written',
        'TERMINAL_HISTORY_NOT_WRITTEN'
      );
    }

    for (const definition of definitions) {
      await this._applyVersionedGatheringEffect({
        actor,
        definition,
        operationId: versionedContext.operationId,
        state,
      });
    }
    state.run = await this.runManager.updateExecutionJournal(
      actor,
      state.run.id,
      { type: 'commit', outcome: versionedJournalOutcome(state.response) },
      {
        expectedRevision: state.run.runRevision,
        executionOperationId: versionedContext.operationId,
      }
    );
    return refreshVersionedTerminalResponse(state.response, state.run, {
      opaqueBlind,
      createdResults: state.createdResults ?? [],
      usedTools: plan.usedTools ?? [],
      checkResult,
    });
  }

  _versionedGatheringEffects(context) {
    const {
      viewer,
      actor,
      system,
      environment,
      task,
      outcome,
      checkResult,
      plan,
      activeRun,
      interactableRef,
      phase,
      initiatedBy,
      opaqueBlind,
      state,
    } = context;
    const safeResults = opaqueBlind ? [] : plan.createdResults;
    const safeTools = opaqueBlind ? [] : (plan.usedTools ?? []);
    const effects = [
      versionedEffect('economy', 'commitGatheringEconomy', { phase }, async () => {
        state.richEvidence = await this._commitRichAttempt({
          actor,
          system,
          environment,
          task,
          outcome,
          viewer,
          interactableRef,
          phase,
        });
        return opaqueBlind ? { applied: true } : (cloneJson(state.richEvidence) ?? null);
      }),
      versionedEffect('results', 'createGatheredResults', safeResults, async () => {
        if (!awardsResultsFor(outcome, system) || !hasAwardedResults(outcome.resultGroups)) {
          state.createdResults = [];
          return opaqueBlind ? { count: 0 } : [];
        }
        const created = await this._createGatheredResults({
          viewer,
          actor,
          system,
          environment,
          task,
          outcome,
        });
        const actual = normalizeRunItems(created, { actor });
        state.createdResults = actual;
        return opaqueBlind ? { count: actual.length } : actual;
      }),
    ];
    if (awardsResultsFor(outcome, system) && hasAwardedResults(outcome.resultGroups)) {
      effects.push(
        versionedEffect('complications', 'fireGatheringComplications', null, async () => {
          const fired = await this._fireGatheringComplications({ actor, system, task, outcome });
          state.complications = publicComplications(fired?.fired);
          return opaqueBlind ? { count: state.complications.length } : state.complications;
        })
      );
    }
    effects.push(
      versionedEffect('tools', 'applyGatheringTools', safeTools, async () => {
        const applied = await this._applyTerminalTools({
          viewer,
          actor,
          system,
          environment,
          task,
          outcome,
        });
        const actual = cloneJson(normalizeList(applied));
        return opaqueBlind ? { count: actual.length } : actual;
      })
    );
    if (outcome.status === 'failed') {
      effects.push(
        versionedEffect('failure', 'applyGatheringFailure', null, async () => {
          const applied = await this._applyFailureFeedback({
            viewer,
            actor,
            system,
            environment,
            task,
            outcome,
            checkResult,
          });
          return opaqueBlind ? { applied: true } : (cloneJson(applied) ?? { applied: true });
        })
      );
    }
    effects.push(
      versionedEffect('events', 'applyGatheringEvents', null, async () => {
        const applied = await this.eventSceneTrigger?.apply?.({
          events: checkResult?.events,
          viewer,
          actor,
          system,
          environment,
          task,
        });
        const receipt = {
          applied: true,
          eventCount: normalizeList(checkResult?.events).length,
        };
        if (!opaqueBlind && applied !== undefined) receipt.result = cloneJson(applied);
        return receipt;
      })
    );
    if (activeRun) {
      effects.push(
        versionedEffect('reservation', 'releaseGatheringReservation', null, async () => ({
          released: Boolean(await this._releaseBlindReservation(activeRun)),
        }))
      );
    }
    effects.push(
      versionedEffect('presentation', 'publishGatheringCompletion', null, async () => {
        const displayRun = mergeRunEconomyEvidence(state.run, state.richEvidence);
        state.response = await this._terminalStart({
          viewer,
          actor,
          system,
          environment,
          task,
          status: outcome.status,
          run: displayRun,
          createdResults: state.createdResults ?? [],
          usedTools: plan.usedTools ?? [],
          checkResult,
          complications: state.complications,
          initiatedBy,
        });
        return versionedJournalOutcome(state.response);
      })
    );
    return effects;
  }

  async _applyVersionedGatheringEffect({ actor, definition, operationId, state }) {
    state.run = await this.runManager.updateExecutionJournal(
      actor,
      state.run.id,
      { type: 'effectApplying', effectId: definition.effectId },
      { expectedRevision: state.run.runRevision, executionOperationId: operationId }
    );
    let receipt;
    try {
      receipt = (await definition.apply()) ?? null;
    } catch (error) {
      if (error.receipts?.length > 0 && state.run.checkResult?.blind !== true) {
        state.run = await this.runManager.retainUncertainReceipt(
          actor,
          state.run.id,
          definition.effectId,
          error.receipts,
          { executionOperationId: operationId }
        );
      }
      await this._markVersionedGatheringRecovery(actor, state.run, operationId);
      throw gatheringLifecycleError(
        `Gathering effect "${definition.effectId}" requires recovery`,
        'RECOVERY_REQUIRED',
        error
      );
    }
    try {
      state.run = await this.runManager.updateExecutionJournal(
        actor,
        state.run.id,
        { type: 'effectApplied', effectId: definition.effectId, receipt },
        { expectedRevision: state.run.runRevision, executionOperationId: operationId }
      );
    } catch (error) {
      await this._markVersionedGatheringRecovery(actor, state.run, operationId);
      throw gatheringLifecycleError(
        `Gathering effect "${definition.effectId}" receipt could not be persisted`,
        'RECOVERY_REQUIRED',
        error
      );
    }
  }

  async _markVersionedGatheringRecovery(actor, run, operationId) {
    try {
      await this.runManager.updateExecutionJournal(
        actor,
        run.id,
        { type: 'recoveryRequired' },
        { expectedRevision: run.runRevision, executionOperationId: operationId }
      );
    } catch {
      // The persisted applying phase already prevents replay if recovery persistence fails.
    }
  }

  async _commitLegacyTerminal({ run, ...context }) {
    const opaque = this._isOpaqueBlindTask(context);
    let createdResults;
    let complications = [];
    let richEvidence = null;
    let failure = null;
    try {
      richEvidence = await this._commitRichAttempt(context);
      ({ createdResults, complications } = await this._commitTerminalSideEffects(context));
    } catch (error) {
      createdResults = normalizeList(error.receipts).map(itemReceipt);
      failure = error;
    }
    const settled = await this.runManager.settleHistory(context.actor, run.id, {
      createdResults: opaque ? [] : createdResults,
      ...(!opaque && { historySettlement: { awards: failure ? 'uncertain' : 'complete' } }),
      economyEvidence: {
        ...run.economyEvidence,
        ...(opaque ? redactRichEvidence(richEvidence, { viewer: context.viewer }) : richEvidence),
      },
    });
    if (failure)
      throw unconfirmedHistoryError(
        'Gathering effects require reconciliation',
        opaque ? [] : createdResults,
        failure
      );
    return { run: settled, createdResults, complications };
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
    // THE MIRRORED HALF of the gate in `_terminalSideEffectPlan` (issue 1098, AF4/CF6). Both run
    // on both flows and the PLAN's `createdResults` feeds the run record, the response and the
    // chat card, so the two must read the SAME predicate.
    //
    // REDACTED AT THE SOURCE (issue 1286): the raw fired list never leaves this method — what
    // comes back is `publicComplications`' output, so the caller has no unredacted list to
    // thread into a player-visible response by mistake.
    let complications = [];
    let createdResults = [];
    try {
      if (awardsResultsFor(outcome, system)) {
        createdResults = await this._createGatheredResults({
          viewer,
          actor,
          system,
          environment,
          task,
          outcome,
        });
        // Component complications (issue 1286), INSIDE the award gate and immediately after
        // the award: an outcome this predicate refuses awarded nothing, so its stages never
        // happened. Progressive attempts only — every d100 and routed outcome returns
        // without planning anything. The chat card is posted by the caller, after this.
        const fired = await this._fireGatheringComplications({ actor, system, task, outcome });
        complications = publicComplications(fired?.fired);
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
      return { complications, createdResults };
    } catch (error) {
      throw unconfirmedHistoryError(
        'Gathering terminal effects are uncertain',
        error.receipts ?? createdResults,
        error
      );
    }
  }

  async _resolveRoutedOutcome({
    actor,
    system,
    task,
    interactive = false,
    resolvedCheckResult = null,
  }) {
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

    return this._resolveRoutedFormulaOutcome({
      routed,
      rollFormula,
      actor,
      system,
      task,
      interactive,
      resolvedCheckResult,
    });
  }

  /**
   * Resolve a routed gathering outcome from the system-level routed roll formula. Rolls via the
   * shared {@link runFormulaRouted}, with the base DC resolved as the per-task `dcOverride`
   * (when finite) else the routed check's own `dc` (default 15). The matched tier NAME routes
   * to a result group whose name matches it (case-insensitive); a failing or unmatched tier
   * produces a terminal failure.
   * @private
   */
  async _resolveRoutedFormulaOutcome({
    routed,
    rollFormula,
    actor,
    system = null,
    task,
    interactive = false,
    resolvedCheckResult = null,
  }) {
    const dc = this._resolveGatheringRoutedDc(routed, task);
    // Gathering has no tool-bonus seam, so nothing is appended before the modifier term.
    const craftingModifier = buildCheckModifierContext(system, 'gathering', task);
    const rolled =
      resolvedCheckResult ??
      (await runFormulaRouted({
        formula: rollFormula,
        dc,
        thresholdMode: routed.thresholdMode,
        type: routed.type,
        relativeOutcomes: routed.relativeOutcomes,
        fixedOutcomes: routed.fixedOutcomes,
        triggers: routed.checkBreakage?.triggers,
        actor,
        label: 'Gathering',
        craftingModifier,
        // Clamp a below-lowest relative total to the closest tier (as crafting/salvage);
        // a per-task dcOverride never opens a null-outcome dead zone.
        clampToNearest: true,
        rollOptions: buildInteractiveRollOptions({
          interactive,
          actor,
          name: task?.name,
          activity: 'Gathering',
          img: task?.img,
          dc,
        }),
      }));

    // The player cancelled the interactive roll: propagate a cancelled outcome so
    // `_resolveImmediateAttempt` aborts with zero mutation.
    if (rolled.cancelled) {
      return { status: 'cancelled', resultGroups: [], checkResult: null };
    }

    const outcomeName = stringOrNull(rolled.outcome);
    const checkResult = {
      outcome: outcomeName,
      value: rolled.value,
      success: rolled.success === true,
      data: rolled.data ?? {},
      // Engine-evaluated (issue 419): the shared `evaluateCheckBreakage` seam honours
      // the legacy `data.breakTools` and `checkBreakage` triggers only for
      // engine-evaluated checks (a macro check never force-breaks tools).
      engineEvaluated: true,
    };

    // A failing tier routes to a terminal failure and, since issue 1098, CARRIES the failure
    // tier's matched result group so the award gate downstream has something to award;
    // `_terminalSideEffectPlan` and `_commitTerminalSideEffects` own that policy decision.
    // A NULL `outcomeName` — a fixed-tier total outside every authored range — carries NOTHING
    // and never awards: there is no tier, so there is no authored failure output to select.
    if (rolled.success !== true || !outcomeName) {
      const failureGroups = outcomeName
        ? matchResultGroupsByName(outcomeName, normalizeList(task.resultGroups), {
            firstOnly: false,
          })
        : [];
      const matchError = outcomeName
        ? routedGroupMatchError({
            outcomeName,
            matched: failureGroups,
            task,
            checkResult,
            allowMissing: true,
          })
        : null;
      if (matchError) return matchError;
      return normalizeTerminalOutcome(
        { status: 'failed', outcome: outcomeName, resultGroups: failureGroups, checkResult },
        { retainFailureResultGroups: true }
      );
    }
    const matched = matchResultGroupsByName(outcomeName, normalizeList(task.resultGroups), {
      firstOnly: false,
    });
    // A success tier that matches NO group routes nowhere, which would spend the node and the
    // stamina and award nothing. Gathering routes by NAME (crafting routes by tier id), so
    // renaming a tier on the SYSTEM silently unroutes every task whose groups were named for
    // the old tier; reporting it as misconfigured surfaces the drift on the first roll and —
    // because `_resolveImmediateAttempt` turns a misconfigured outcome into a blocked start —
    // costs the player nothing. A group that EXISTS and is empty is deliberate authoring, is
    // matched by name, and renders the explicit nothing-found card from issue 1027.
    const matchError = routedGroupMatchError({ outcomeName, matched, task, checkResult });
    if (matchError) return matchError;
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

  async _resolveD100Outcome({ viewer, actor, system, environment, task, interactive = false }) {
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

    // A blind draw the reveal policy has not disclosed yet must not be named to ANYONE —
    // not in the roll prompt this player is about to read, and not in the flavour of the
    // pooled `Nd100` message, which `toMessage` posts to the whole table. The label is the
    // same generic one the listing shows, so the roll says no more than the button did.
    // Resolved BEFORE the attempt, so it reflects what the player knew when they clicked;
    // a reveal this attempt earns names the task on the result card instead.
    const identityHidden = this._isBlindIdentityHidden({ environment, viewer, actor, task });
    const rollLabel = identityHidden
      ? this.localize(BLIND_TASK_LABEL_KEY)
      : (task?.name ?? 'Gathering');

    // Interactive d100 (opt-in): the d100 path does NOT use a Foundry `Roll` DC —
    // each drop row / event is an independent percentile check. So there is no DC
    // to show; the prompt just confirms the attempt and collects an optional flat
    // situational modifier applied to every throw. A dismissed prompt returns a
    // cancelled outcome the caller maps to a zero-mutation `_cancelledStart`.
    let extraModifier = 0;
    if (interactive) {
      // No DC is passed: the d100 path has no single DC (each row/event is an
      // independent percentile check), so the dialog shows no DC line.
      const choice = await promptCheckRoll({
        label: `${rollLabel} — Gathering`,
        name: identityHidden ? rollLabel : task?.name,
        activity: 'Gathering',
        img: identityHidden ? null : task?.img,
      });
      if (!choice || choice.confirmed === false) {
        return { status: 'cancelled', resultGroups: [], checkResult: null };
      }
      // The bonus field is free text, so `Number(...)` alone silently turned a dice
      // expression ("2d20", "1d4 + 1") into NaN and then 0. Reduce it to a scalar —
      // rolling it when it is not already a plain number — because each percentile
      // throw takes a flat numeric modifier, not a formula.
      extraModifier = await evaluateSituationalBonus(choice.bonus, actor);
    }

    const resolved = await this.richState.resolveD100Attempt({
      task,
      environment,
      actor,
      viewer,
      system,
      gatheringModifier: Number.isFinite(gatheringModifier) ? gatheringModifier : 0,
      eventModifier: Number.isFinite(eventModifier) ? eventModifier : 0,
      // DSN animation + the situational bonus flow only for an interactive attempt;
      // the automated/timed path leaves the resolver's behaviour untouched.
      animate: interactive === true,
      extraModifier,
      rollMode: globalThis.game?.settings?.get?.('core', 'rollMode'),
      speaker: globalThis.ChatMessage?.getSpeaker?.({ actor }),
      flavor: `${rollLabel} — Gathering check`,
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
          resultRowId: item.resultRowId,
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
        roll: Number.isFinite(resolved?.roll) ? resolved.roll : null,
        itemRows: normalizeList(resolved?.itemRows),
        items: normalizeList(resolved?.items),
        events: normalizeList(resolved?.events),
        eventPolicy: stringOrNull(resolved?.eventPolicy),
        characterModifierSnapshot: resolved?.characterModifierSnapshot || null,
      },
    };
  }

  async _resolveProgressiveOutcome({
    viewer,
    actor,
    system,
    environment,
    task,
    interactive = false,
    resolvedCheckResult = null,
  }) {
    const checkResult =
      resolvedCheckResult ??
      (await this._evaluateGatheringCheck({
        actor,
        viewer,
        system,
        environment,
        task,
        interactive,
      }));
    // The player cancelled the interactive roll: propagate a cancelled outcome so
    // `_resolveImmediateAttempt` aborts with zero mutation (before normalization,
    // which does not model a cancel).
    if (checkResult?.cancelled) {
      return { status: 'cancelled', resultGroups: [], checkResult: null };
    }
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

  async _evaluateGatheringCheck({ actor, system, task = null, interactive = false }) {
    // System-level gathering check (Checks editor) drives progressive
    // resolution: roll the configured formula and map its numeric total onto the
    // check-result shape the progressive resolver expects (`{ success, status,
    // value }`). Progressive has no DC, so `task.dcOverride` never applies here.
    const progressive = system?.gatheringCraftingCheck?.progressive;
    const rollFormula = stringOrNull(progressive?.rollFormula);
    if (rollFormula) {
      // Progressive gathering remains unavailable from the current authoring surface, but
      // legacy and externally-authored runtime tasks can still reach this compatibility path.
      const rolled = await runFormulaProgressive({
        formula: rollFormula,
        triggers: progressive.checkBreakage?.triggers,
        actor,
        label: 'Gathering',
        craftingModifier: buildCheckModifierContext(system, 'gathering', task),
        rollOptions: buildInteractiveRollOptions({
          interactive,
          actor,
          name: task?.name,
          activity: 'Gathering',
          img: task?.img,
        }),
      });
      // The player cancelled the interactive roll: surface a cancel marker so
      // `_resolveProgressiveOutcome` aborts with zero mutation.
      if (rolled.cancelled) {
        return { success: false, status: null, value: null, cancelled: true };
      }
      // Progressive is value-driven, not pass/fail: leave `status` null so the
      // award logic (in `resolveProgressiveAward`) decides succeeded/failed from
      // the numeric `value`. A roll-evaluation error surfaces `success: false`,
      // which the resolver short-circuits to a terminal failure.
      return {
        success: rolled.success === false ? false : null,
        status: null,
        value: rolled.value,
        data: rolled.data ?? {},
        // Engine-evaluated (issue 419): see _resolveRoutedFormulaOutcome.
        engineEvaluated: true,
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
      throw unconfirmedHistoryError('Gathering result creation is unavailable');
    }
    const created = await this.resultCreator.create({
      actor,
      viewer,
      system,
      environment,
      task,
      resultGroups: outcome.resultGroups,
      checkResult: outcome.checkResult ?? null,
      outcome,
    });
    if (
      !Array.isArray(created) ||
      created.some((entry) => receiptQuantity(entry?.quantity) === null || !entry?.itemUuid)
    ) {
      throw unconfirmedHistoryError(
        'Invalid gathering creation receipts',
        normalizeList(created).filter((entry) => receiptQuantity(entry?.quantity) !== null)
      );
    }
    return created.map(itemReceipt);
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
        // Active gathering check's checkBreakage (issue 419) so the shared runtime's
        // checkDriven override can fire, reaching crafting/salvage parity.
        checkBreakage: this._resolveGatheringCheckBreakage(system, task),
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
      // Active gathering check's checkBreakage (issue 419) — see _planTerminalTools.
      checkBreakage: this._resolveGatheringCheckBreakage(system, task),
    });
  }

  /**
   * Resolve the active gathering check's `checkBreakage` block for the task's
   * resolution mode (issue 419). Routed gathering authors on the routed check,
   * progressive on the progressive check; d100 has no check sub-object so it carries
   * no checkBreakage. Returns null when none is configured.
   * @private
   */
  _resolveGatheringCheckBreakage(system, task) {
    const check = system?.gatheringCraftingCheck || {};
    if (task?.resolutionMode === 'routed') return check.routed?.checkBreakage ?? null;
    if (task?.resolutionMode === 'progressive') return check.progressive?.checkBreakage ?? null;
    return null;
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

  async _respondTerminalAttempt({ outcome, plan, ...context }) {
    return this._terminalStart({
      ...context,
      status: outcome.status,
      usedTools: plan.usedTools ?? [],
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
    // ALREADY REDACTED by `_commitTerminalSideEffects`, which applies `publicComplications`
    // at the source (issue 1286). Nothing here re-filters, and nothing here may widen it.
    complications = [],
    initiatedBy = 'immediate',
  }) {
    await this._maybeRevealBlindTask({ actor, environment, task, status });
    const opaqueBlind = this._isOpaqueBlindTask({ environment, viewer });
    // Read AFTER `_maybeRevealBlindTask`, so an attempt that earns its own reveal
    // (`onAttempt`, or `onSuccess` on a success) names the task on the card it produced,
    // while `never` — and `onSuccess` on a failure — keep the generic label.
    const identityHidden = this._isBlindIdentityHidden({ environment, viewer, actor, task });
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
      // Inside the opaque-blind guard with everything else a blind attempt withholds, and
      // set only when something fired, so a transparent attempt with no complications
      // returns exactly the response it did before this feature existed.
      if (complications.length > 0) response.complications = complications;
    }

    // Posted for EVERY terminal attempt, blind included: the card is the outcome channel the
    // whole gathering UI relies on, and the start response withholds `createdResults` by design,
    // so a blind attempt without one reports nothing at all. Blindness is about WHICH task was
    // drawn, so the card carries the real haul and withholds only the identity.
    await this._postGatheringChatMessage({
      actor,
      system,
      task,
      status,
      createdResults,
      usedTools,
      checkResult,
      run,
      complications,
      identityHidden,
    });

    // Publish the documented public completion hook(s) after side effects are committed, so
    // subscribers observe the final state; a no-op when no publisher is injected. A timed
    // completion is additionally gated to the primary GM, because `processWorldTime` fires on
    // every client via Foundry's synced `updateWorldTime` hook and must fire exactly once.
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
   * Post an automatic gathering result chat card summarizing the attempt: gathered components,
   * events encountered, broken tools, stamina spent and remaining nodes, each with its image.
   *
   * Gated by the crafting system's `features.chatOutput` toggle (default true); returns silently
   * when off or when the system cannot be resolved, and never throws into the attempt flow.
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
   * @param {Array}   [params.complications] - Fired component complications, ALREADY redacted
   *   to the player-visible set by `_commitTerminalSideEffects` (issue 1286).
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
    complications = [],
    identityHidden = false,
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
        // Prefer the identity the award itself carries. Falling back to the
        // uuid→componentId join alone left component-sourced awards (which have no uuid
        // before their document exists) with nothing to look up, so they rendered as a
        // bare uuid or an empty name.
        const componentId =
          stringOrNull(entry?.componentId) || stringOrNull(itemsByUuid.get(itemUuid)?.componentId);
        const component = componentId ? componentsById.get(componentId) : null;
        const resolvedDoc = component ? null : resolveItemDoc(itemUuid);
        return {
          name:
            stringOrEmpty(component?.name) ||
            stringOrEmpty(resolvedDoc?.name) ||
            stringOrEmpty(entry?.name) ||
            itemUuid ||
            '',
          img:
            stringOrNull(component?.img) ||
            stringOrNull(resolvedDoc?.img) ||
            stringOrNull(entry?.img) ||
            'icons/svg/item-bag.svg',
          quantity: receiptQuantity(entry?.quantity),
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

      // `position` is where this firing's entry sits in the ordered stage list — gathering
      // has no player reorder, so that is the AUTHORED order, which is also the order this
      // task's results are shown in. It rides along so the shared renderer can tell two
      // legitimate firings of one complication on one twice-staged component apart; the
      // renderer decides whether to draw it, because only it sees the final row set.
      const complicationRows = normalizeList(complications).map((entry) => ({
        name: stringOrEmpty(entry?.name),
        description: stringOrEmpty(entry?.description),
        severity: stringOrEmpty(entry?.severity),
        componentName: stringOrEmpty(componentsById.get(stringOrNull(entry?.componentId))?.name),
        position: entry?.position ?? null,
      }));

      const content = buildGatheringChatContent(
        {
          status,
          actorName: stringOrEmpty(actor?.name),
          taskName: identityHidden
            ? this.localize(BLIND_TASK_LABEL_KEY)
            : stringOrEmpty(task?.name),
          components,
          events,
          brokenTools,
          complications: complicationRows,
          staminaSpent: run?.economyEvidence?.stamina?.spent ?? null,
          // A chat message is a permanent world document, so never state a node count
          // this client only guessed. When the depletion was relayed to the active GM
          // the evidence is flagged non-authoritative and the stat is omitted rather
          // than published wrong (`renderStat` drops a null value).
          // The in-memory run carries UNREDACTED rich evidence (`_commitRichAttempt`'s
          // return is merged onto it after the redacted history write), so a hidden-identity
          // blind card would otherwise publish the drawn task's own node count — a number
          // a non-GM is never shown for a blind task — into a permanent world document.
          nodesRemaining:
            identityHidden || run?.economyEvidence?.node?.authoritative === false
              ? null
              : (run?.economyEvidence?.node?.remaining ?? null),
        },
        this.localize
      );

      await ChatMessage.create({
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

  async _cancelInvalidVersionedRun({ viewer, actor, run, resolved, reason, versionedContext }) {
    const persistence = this._cancelledRunWriteData({
      run,
      environment: resolved.environment,
      viewer,
    });
    const state = { run: null };
    const definitions = [
      versionedEffect('reservation', 'releaseGatheringReservation', null, async () => {
        const released = await this._releaseBlindReservation(run);
        return {
          released: Boolean(released),
          reservationUnits: Number(released?.reservation?.units) || 0,
        };
      }),
    ];
    const executionPlan = {
      operationId: versionedContext.operationId,
      requestId: versionedContext.requestId,
      baseRunRevision: run.runRevision,
      intent: {
        activity: 'gathering',
        trigger: versionedContext.trigger || 'manual',
        status: 'cancelled',
        reason: 'missingReference',
        taskId: persistence.opaqueBlind ? 'blind' : stringOrNull(run.taskId),
      },
      effects: definitions.map(({ effectId, kind, planned }) => ({ effectId, kind, planned })),
    };
    state.run = await this.runManager.completeRun(actor, run, 'cancelled', persistence.payload, {
      terminalRunData: persistence.terminalRunData,
      executionPlan,
      expectedRevision: run.runRevision,
      executionOperationId: versionedContext.operationId,
    });
    if (!state.run) {
      throw gatheringLifecycleError(
        'Gathering cancellation history was not written',
        'TERMINAL_HISTORY_NOT_WRITTEN'
      );
    }
    for (const definition of definitions) {
      await this._applyVersionedGatheringEffect({
        actor,
        definition,
        operationId: versionedContext.operationId,
        state,
      });
    }
    let response = this._timedCancellation({
      viewer,
      actor,
      run,
      cancelledRun: state.run,
      reason,
      environment: resolved.environment ?? null,
    });
    state.run = await this.runManager.updateExecutionJournal(
      actor,
      state.run.id,
      { type: 'commit', outcome: versionedJournalOutcome(response) },
      {
        expectedRevision: state.run.runRevision,
        executionOperationId: versionedContext.operationId,
      }
    );
    response = this._timedCancellation({
      viewer,
      actor,
      run,
      cancelledRun: state.run,
      reason,
      environment: resolved.environment ?? null,
    });
    return response;
  }

  async _clearInvalidVersionedRun({
    viewer,
    actor,
    run,
    environment,
    task,
    errors = null,
    outcome = null,
    versionedContext,
  }) {
    const definitions = [
      versionedEffect('reservation', 'releaseGatheringReservation', null, async () => {
        const released = await this._releaseBlindReservation(run);
        return {
          released: Boolean(released),
          reservationUnits: Number(released?.reservation?.units) || 0,
        };
      }),
      versionedEffect('cleanup', 'clearInvalidGatheringRun', null, async () => null),
    ];
    const executionPlan = {
      operationId: versionedContext.operationId,
      requestId: versionedContext.requestId,
      baseRunRevision: run.runRevision,
      intent: {
        activity: 'gathering',
        trigger: versionedContext.trigger || 'manual',
        status: 'cleared',
        reason: 'misconfigured',
        taskId: isBlindWaitingTaskId(run.taskId) ? 'blind' : stringOrNull(run.taskId),
      },
      effects: definitions.map(({ effectId, kind, planned }) => ({ effectId, kind, planned })),
    };
    const state = {
      run: await this.runManager.updateExecutionJournal(
        actor,
        run.id,
        { type: 'plan', plan: executionPlan },
        { expectedRevision: run.runRevision, executionOperationId: versionedContext.operationId }
      ),
    };
    await this._applyVersionedGatheringEffect({
      actor,
      definition: definitions[0],
      operationId: versionedContext.operationId,
      state,
    });
    state.run = await this.runManager.updateExecutionJournal(
      actor,
      state.run.id,
      { type: 'effectApplying', effectId: 'cleanup' },
      {
        expectedRevision: state.run.runRevision,
        executionOperationId: versionedContext.operationId,
      }
    );
    try {
      const cleared = await this.runManager.clearActiveRun(actor, state.run.id, {
        expectedRevision: state.run.runRevision,
        executionOperationId: versionedContext.operationId,
      });
      if (!cleared) {
        throw gatheringLifecycleError(
          'Gathering invalid-run cleanup was not written',
          'RUN_CLEANUP_NOT_WRITTEN'
        );
      }
    } catch (error) {
      await this._markVersionedGatheringRecovery(actor, state.run, versionedContext.operationId);
      throw gatheringLifecycleError(
        'Gathering invalid-run cleanup requires recovery',
        'RECOVERY_REQUIRED',
        error
      );
    }
    return this._misconfiguredWaitingResult({
      viewer,
      actor,
      run,
      environment,
      task,
      errors,
      outcome,
    });
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
    // A cleared run is terminal for the pool: release its provisional claim
    // without the real `nodeRuntime` count ever having moved (issue 901).
    await this._releaseBlindReservation(run);
    if (typeof this.runManager?.clearActiveRun !== 'function') {
      throw Object.assign(
        new Error('Gathering timed misconfiguration requires active-run cleanup'),
        {
          code: 'MISSING_CLEAR_ACTIVE_RUN',
        }
      );
    }

    await this.runManager.clearActiveRun(actor, run.id);
    return this._misconfiguredWaitingResult({
      viewer,
      actor,
      run,
      environment,
      task,
      errors,
      outcome,
    });
  }

  _misconfiguredWaitingResult({ viewer, actor, run, environment, task, errors, outcome }) {
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

  _cancelledRunWriteData({ run, environment, viewer }) {
    const opaqueBlind =
      isBlindWaitingTaskId(run?.taskId) ||
      Boolean(environment && this._isOpaqueBlindTask({ environment, viewer }));
    const economyEvidence = opaqueBlind
      ? redactRichEvidence(run?.economyEvidence || {})
      : stripRuntimeSnapshotFromRun({ economyEvidence: run?.economyEvidence || {} })
          .economyEvidence;
    return {
      opaqueBlind,
      terminalRunData: opaqueBlind
        ? {
            craftingSystemId: stringOrNull(run?.craftingSystemId),
            environmentId: stringOrNull(run?.environmentId),
            taskId: 'blind',
          }
        : undefined,
      payload: opaqueBlind
        ? {
            economyEvidence,
            createdResults: [],
            usedTools: [],
            checkResult: { blind: true, status: 'cancelled' },
          }
        : { economyEvidence },
    };
  }

  async _cancelMissingReferenceRun({ viewer, actor, run, resolved }) {
    // A cancelled run is terminal for the pool: release its provisional claim
    // without the real `nodeRuntime` count ever having moved (issue 901).
    await this._releaseBlindReservation(run);
    const persistence = this._cancelledRunWriteData({
      run,
      environment: resolved.environment,
      viewer,
    });
    const cancelledRun = await this.runManager.cancelRun(actor, run.id, {
      terminalRunData: persistence.terminalRunData,
      payload: persistence.payload,
    });
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
    const opaqueBlind =
      isBlindWaitingTaskId(run?.taskId) ||
      Boolean(environment && this._isOpaqueBlindTask({ environment, viewer }));
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
      // Execution is still required, but not yet: this one matures at GM-gated world time, and
      // completing it early would spend the wait the task declares.
      requiresExecution: true,
      canExecuteImmediately: false,
    };
  }

  _startedVersionedReadyStart({ viewer, actor, system, environment, task, run }) {
    const opaqueBlind = this._isOpaqueBlindTask({ environment, viewer });
    return {
      accepted: true,
      started: true,
      state: 'ready',
      viewerId: idOf(viewer),
      actorId: idOf(actor),
      craftingSystemId: stringOrNull(system.id),
      environmentId: stringOrNull(environment.id),
      taskId: opaqueBlind ? null : stringOrNull(task.id),
      runId: stringOrNull(run?.id),
      runStatus: stringOrNull(run?.status) || 'inProgress',
      run: opaqueBlind ? redactBlindRun(run) : stripRuntimeSnapshotFromRun(run),
      blockedReasons: [],
      // Said in the crafting engine's vocabulary on purpose. `state` is the gathering-native
      // word and the journal command layer's result normaliser drops it, so a caller reading a
      // normalised start -- which is every public caller -- could not tell a run that can
      // execute now from one waiting on the clock. These two fields it does forward, and
      // `executePublicGather` keys the one-call completion on them (issue 1759).
      requiresExecution: true,
      canExecuteImmediately: true,
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

  /**
   * Build the quiet result returned when the player dismisses the interactive
   * roll dialog. Not `accepted`, but carries no `blockedReasons` and sets
   * `cancelled: true` so the UI treats it as a SILENT no-op (no notification) —
   * distinct from a genuinely blocked attempt.
   * @private
   */
  _cancelledStart({ viewer, actor = null, environment = null, task = null }) {
    const opaqueBlind = environment && task && this._isOpaqueBlindTask({ environment, viewer });
    return {
      accepted: false,
      cancelled: true,
      started: false,
      state: 'cancelled',
      viewerId: idOf(viewer),
      actorId: actor ? idOf(actor) : null,
      environmentId: environment ? stringOrNull(environment.id) : null,
      taskId: opaqueBlind ? null : task ? stringOrNull(task.id) : null,
      blockedReasons: [],
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

/**
 * @param {object} raw
 * @param {object} [options]
 * @param {boolean} [options.retainFailureResultGroups] Carry `raw.resultGroups` through a FAILED
 *   outcome instead of clearing it (issue 1098). Opt-in, and used by exactly one caller — the
 *   routed failure branch — so a resolver that hands back groups alongside a failure does not
 *   start awarding them.
 */
function normalizeTerminalOutcome(raw, { retainFailureResultGroups = false } = {}) {
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
    const retained = retainFailureResultGroups ? normalizeOutcomeGroups(raw) : [];
    return {
      status: 'failed',
      resultGroups: retained,
      // THE OPT-IN MARKER (issue 1098). A failed outcome carrying groups is NOT by
      // itself an authored failure award: the d100 resolver's `failureWithEvent` policy
      // returns exactly that shape — a failed attempt whose matched drop rows are what
      // the "nothing found" card reports — and awarding those would change d100
      // behaviour, which this issue must not do. Only the routed seam that deliberately
      // matched a FAILURE TIER'S group sets this, so the gate can tell the two apart
      // without inspecting the resolution mode from the far side of the engine.
      ...(retained.length > 0 && { failureAward: true }),
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
    // Preserve the engine-evaluated flag (issue 419) so the shared breakage seam
    // can honour `data.breakTools` / `checkBreakage` triggers under checkDriven.
    ...(raw.engineEvaluated === true && { engineEvaluated: true }),
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
  const { awarded, remaining, invalidResultId, partialResult, haltedResult, skippedResults } =
    resolveProgressiveAwardLoop({
      results: normalizeList(group.results),
      initialRemaining: Math.max(0, value),
      costFor: (result) => difficultyForResult(system, result),
      awardMode,
      invalidCost: 'fail',
      zeroRemainingOnPartial: true,
    });

  if (invalidResultId !== undefined) {
    // A gathering resolution aborted on an invalid cost fires NO complications, matching
    // the crafting misconfiguration gate: a GM authoring gap is not a narrative outcome
    // (issue 1286). Nothing needs to enforce that here — the abort returns before the
    // award, so `_commitTerminalSideEffects` is never reached.
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
      // The same FLAT five keys `ResolutionModeService._resolveProgressiveResultGroups`
      // publishes (issue 1286), so a consumer classifying stages reads one shape across
      // all three activities rather than one per activity.
      resolutionMeta: {
        awardedResultIds: awarded.map((result) => result.id),
        remaining,
        partialResultId: partialResult?.id ?? null,
        haltedResultId: haltedResult?.id ?? null,
        skippedResultIds: skippedResults.map((result) => result.id),
      },
    },
  };
}

function difficultyForResult(system, result) {
  const componentId = stringOrNull(result?.componentId ?? result?.systemItemId);
  if (!componentId) return null;
  const component = resolvedComponentsFor(system).find((entry) => entry?.id === componentId);
  const difficulty = Number(component?.difficulty);
  return Number.isFinite(difficulty) ? difficulty : null;
}

function hasAwardedResults(resultGroups) {
  return normalizeList(resultGroups).some((group) => normalizeList(group?.results).length > 0);
}

/**
 * May this terminal outcome award its result groups? — THE ONE PREDICATE both halves of
 * gathering's mirrored award gate read (issue 1098, AF4/CF6/CF10).
 *
 * A succeeded outcome always may. A FAILED one may only when
 * `gatheringCraftingCheck.failureResultPolicy` permits results on failure AND the outcome still
 * carries a group, which excludes without a special case each: a `failureOnBreak`-voided
 * attempt; a `null` outcome name (a fixed-tier total outside every authored range); a
 * `ROUTED_TIER_UNROUTED` misconfiguration, whose status is `misconfigured` rather than `failed`;
 * and EVERY d100 outcome, whose `failureWithEvent` policy returns a failed outcome still
 * carrying its matched drop rows. `failureAward` is set by `normalizeTerminalOutcome` only for
 * the routed failure seam, which d100 outcomes never pass through.
 *
 * @param {?{status?: string, resultGroups?: Array}} outcome
 * @param {?object} system
 * @returns {boolean}
 */
function awardsResultsFor(outcome, system) {
  if (outcome?.status === 'succeeded') return true;
  if (outcome?.status !== 'failed') return false;
  if (outcome?.failureAward !== true) return false;
  if (!activityPermitsFailureResults(system, 'gathering')) return false;
  return normalizeList(outcome?.resultGroups).length > 0;
}

function mergeCharacterModifierSnapshots(base, environmental) {
  const baseSnapshot = plainObjectOrNull(base) ?? {};
  const environmentalSnapshot = plainObjectOrNull(environmental) ?? {};
  return {
    rows: normalizeList(baseSnapshot.rows),
    events: normalizeList(environmentalSnapshot.events),
  };
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

function routedGroupMatchError({ outcomeName, matched, task, checkResult, allowMissing = false }) {
  if (matched.length === 1 || (allowMissing && matched.length === 0)) return null;
  const missing = matched.length === 0;
  const code = missing ? 'ROUTED_TIER_UNROUTED' : 'ROUTED_TIER_AMBIGUOUS';
  return misconfiguredOutcome({
    code,
    checkResult,
    diagnostic: {
      code,
      ...(missing && { messageKey: 'FABRICATE.Gathering.Diagnostics.RoutedTierUnrouted' }),
      message: missing
        ? `Gathering success tier "${outcomeName}" has no result group of that name on task "${task?.name || task?.id || 'unnamed'}"`
        : `Gathering tier "${outcomeName}" matches more than one result group on task "${task?.name || task?.id || 'unnamed'}"`,
    },
  });
}

function validateTaskConfiguration(task, system = null) {
  const errors = [];
  const resolutionMode = stringOrNull(task?.resolutionMode);
  const resultGroups = normalizeList(task?.resultGroups);

  if (
    resolutionMode !== 'straight' &&
    resolutionMode !== 'routed' &&
    resolutionMode !== 'progressive' &&
    resolutionMode !== 'd100'
  ) {
    errors.push('Gathering task requires a straight, d100, progressive, or routed resolution mode');
    return errors;
  }

  if (resolutionMode !== 'd100' && resultGroups.length === 0) {
    errors.push('Gathering task requires at least one result group');
  }
  if (resolutionMode !== 'd100') {
    errors.push(...validateResultGroupNames(resultGroups));
    if (hasInvalidFixedResultQuantity(resultGroups)) {
      errors.push('Gathering results require finite positive numeric quantities');
    }
    errors.push(...gatheringResultAmountErrors(resultGroups));
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

  if (resolutionMode === 'straight') {
    if (resultGroups.length !== 1) {
      errors.push('Straight gathering task requires exactly one result group');
    }
    if (resultGroups.length === 1 && normalizeList(resultGroups[0]?.results).length === 0) {
      errors.push('Straight gathering task requires at least one result');
    }
  }

  // Routed gathering resolves through the system-level check formula, not a per-task provider.
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

  const unusableDurations = unusableTimeRequirementFields(task?.timeRequirement);
  if (unusableDurations.length > 0) {
    errors.push(
      `Gathering time requirement fields must be non-negative numbers: ${unusableDurations.join(', ')}`
    );
  }

  if (task?.failureOutcome) {
    errors.push(...validateFailureOutcome(task.failureOutcome));
  }

  return errors;
}

function hasInvalidFixedResultQuantity(resultGroups) {
  return resultGroups.some((group) =>
    normalizeList(group?.results).some((result) => {
      if (!result || typeof result !== 'object' || !Object.hasOwn(result, 'quantity')) return false;
      return (
        typeof result.quantity !== 'number' ||
        !Number.isFinite(result.quantity) ||
        result.quantity <= 0
      );
    })
  );
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

/**
 * Whether a task actually takes time — i.e. carries at least one POSITIVE duration field.
 *
 * An empty or all-zero `timeRequirement` is what the editor persists once a duration has been
 * opened and cleared back to nothing, and it plainly means "no duration": authoring, not
 * misconfiguration, so it must resolve immediately.
 *
 * @param {?object} task
 * @returns {boolean}
 */
function hasTimeRequirement(task) {
  return normalizeTimeRequirement(task?.timeRequirement) !== null;
}

/**
 * Duration fields a GM authored but that cannot be used — present and non-blank, yet not a
 * finite non-negative number. An ABSENT or zero field is not one of these: it is the ordinary
 * way to say "no duration".
 *
 * @param {?object} timeRequirement
 * @returns {string[]} Offending field names.
 */
function unusableTimeRequirementFields(timeRequirement) {
  if (!timeRequirement || typeof timeRequirement !== 'object') return [];
  return ['minutes', 'hours', 'days', 'months', 'years'].filter((field) => {
    const raw = timeRequirement[field];
    if ([undefined, null, ''].includes(raw)) return false;
    const value = Number(raw);
    return !Number.isFinite(value) || value < 0;
  });
}

/**
 * Which commit phase a matured run's rich-state commit runs as.
 *
 * A timed run normally commits twice, so `timedMaturity` suppresses the node consumption
 * already taken at `waitingStart`. A blind run took a PROVISIONAL RESERVATION at start instead,
 * so it converts that reservation here and runs as the single-commit `immediate` case.
 *
 * @param {object} run The run as persisted, before blind hydration.
 * @returns {'immediate'|'timedMaturity'}
 */
function maturityCommitPhase(run) {
  return isBlindWaitingTaskId(run?.taskId) ? 'immediate' : 'timedMaturity';
}

/**
 * A copy of a task carrying no node configuration: a blind run's START commit spends stamina
 * but must NOT decrement the real `nodeRuntime` pool, because its claim is a reservation held
 * in the blind-run store that a cancelled run releases without the pool ever having moved.
 *
 * @param {object} task
 * @returns {object}
 */
function withoutNodeReservation(task) {
  return { ...task, nodes: null };
}

/**
 * The task a waiting run's START commit spends against: the real task, or a
 * node-free copy for a blind run whose node claim is a reservation.
 *
 * @param {object} task
 * @param {boolean} opaqueBlind
 * @returns {object}
 */
function waitingStartCommitTask(task, opaqueBlind) {
  return opaqueBlind ? withoutNodeReservation(task) : task;
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
    normalizeList(environment?.events).length > 0 ||
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
      const source = item.item ?? item;
      return itemReceipt({
        ...item,
        actorUuid: item.actorUuid ?? item.actor?.uuid ?? actor?.uuid,
        itemUuid: item.itemUuid ?? source.uuid,
        name: item.name ?? source.name,
        img: item.img ?? source.img,
      });
    })
    .filter((item) => item.actorUuid && (item.itemUuid || item.componentId));
}

function gatheringTaskRequiresPlayerCheck(task) {
  return ['routed', 'progressive'].includes(stringOrNull(task?.resolutionMode));
}

function versionedEffect(effectId, kind, planned, apply) {
  return { effectId, kind, planned: cloneJson(planned) ?? null, apply };
}

function mergeRunEconomyEvidence(run, richEvidence) {
  if (!richEvidence || typeof richEvidence !== 'object') return run;
  return {
    ...run,
    economyEvidence: {
      ...plainObjectOrNull(run?.economyEvidence),
      ...richEvidence,
    },
  };
}

function versionedJournalOutcome(response) {
  if (!response || typeof response !== 'object') return null;
  const outcome = { ...response };
  delete outcome.run;
  outcome.success ??= outcome.accepted === true;
  return cloneJson(outcome);
}

function refreshVersionedTerminalResponse(
  response,
  run,
  { opaqueBlind, createdResults, usedTools, checkResult }
) {
  if (!response || typeof response !== 'object') return asVersionedGatheringResult(response);
  const publicRun = opaqueBlind
    ? redactBlindTerminalRun(run)
    : enrichPublicTerminalRun(stripRuntimeSnapshotFromRun(run), {
        createdResults,
        usedTools,
        checkResult,
      });
  return {
    ...response,
    success: true,
    runStatus: run?.status ?? response.runStatus,
    run: publicRun,
  };
}

function asVersionedGatheringResult(result) {
  if (!result || typeof result !== 'object') return versionedGatheringFailure('Gathering failed.');
  if (Object.hasOwn(result, 'success')) return result;
  return { ...result, success: result.accepted === true };
}

function versionedGatheringFailure(message, code = 'GATHERING_EXECUTION_REFUSED') {
  return {
    success: false,
    accepted: false,
    started: false,
    state: 'blocked',
    code,
    message,
    blockedReasons: [],
  };
}

function gatheringAuthorityUnavailable() {
  return versionedGatheringFailure(
    'Versioned gathering authority is unavailable.',
    'AUTHORITY_UNAVAILABLE'
  );
}

function gatheringLifecycleError(message, code, cause = null) {
  return new GatheringLifecycleExecutionError(message, code, cause);
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
