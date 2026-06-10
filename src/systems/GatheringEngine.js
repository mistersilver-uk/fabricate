import { evaluateEnvironmentMatch } from './gatheringMatch.js';
import { classifyGatheringToolStates, resolvePresentComponentIds } from '../gatheringToolRuntime.js';
import { buildGatheringChatContent } from './GatheringChatCard.js';
import {
  buildRegionDisclosure,
  buildTravelGuidance,
  environmentHasLocationRules,
  evaluateLocationAvailability
} from './gatheringLocation.js';
import { getDiscoveredRegionIdsForSystem } from './gatheringRegionDiscovery.js';
import { isGatheringRegionsEnabled } from './gatheringRegions.js';

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
  RUN_CREATION_FAILED: 'FABRICATE.Gathering.Blocked.RunCreationFailed'
  ,
  NODE_DEPLETED: 'FABRICATE.Gathering.Blocked.NodeDepleted',
  STAMINA_BLOCKED: 'FABRICATE.Gathering.Blocked.StaminaBlocked',
  BLIND_NO_CANDIDATE: 'FABRICATE.Gathering.Blocked.BlindNoCandidate',
  CONDITIONS_BLOCKED: 'FABRICATE.Gathering.Blocked.ConditionsBlocked',
  LOCATION_BLOCKED: 'FABRICATE.Gathering.Blocked.LocationBlocked',
  NO_CURRENT_REGION: 'FABRICATE.Gathering.Blocked.NoCurrentRegion'
});

const BLIND_TASK_LABEL_KEY = 'FABRICATE.Gathering.BlindTaskLabel';
const UNKNOWN_TOOL_LABEL_KEY = 'FABRICATE.App.Gathering.Detail.UnknownTool';
const DEFAULT_TOOL_IMG = 'icons/svg/item-bag.svg';
// Player-facing hazard visibility tiers. A GM always resolves to 'full'; a
// non-GM viewer falls back to the more-restrictive 'encounterChance' when the
// rule is missing, so absent rules never leak the full hazard list.
const GATHERING_HAZARD_VISIBILITIES = new Set(['dangerLevelOnly', 'encounterChance', 'full']);
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
 * tool, and check history payloads, persist terminal history, then commit
 * irreversible result, tool, and failure-feedback effects. Timed attempts
 * resume through processWorldTime(worldTime), which asks the run manager for
 * matured waitingTime runs, writes terminal history before post-history
 * effects, cancels missing-reference runs into terminal history, and clears
 * resume-time misconfiguration without player history or effects.
 *
 * When a `locationResolver` collaborator (a GatheringLocationService) is
 * injected, listings additionally evaluate each environment's location
 * availability against the party's resolved current regions — emitting a
 * redaction-safe `location` listing field plus `LOCATION_BLOCKED` /
 * `NO_CURRENT_REGION` blocked reasons — and attempt starts re-resolve location
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
    resultResolver = null,
    resultCreator = null,
    toolBreakage = null,
    failureFeedback = null,
    hazardSceneTrigger = null,
    getRunViewer = null,
    locationResolver = null,
    random = Math.random,
    localize = defaultLocalize,
    // Stamina regen / node respawn run on world-time advance and write shared
    // state, so they must run exactly once — only on the primary GM client.
    isPrimaryGM = () => Boolean(globalThis.game?.user?.isGM && globalThis.game?.users?.activeGM?.id === globalThis.game?.user?.id),
    getActors = () => Array.from(globalThis.game?.actors?.contents ?? globalThis.game?.actors ?? [])
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
    this.hazardSceneTrigger = hazardSceneTrigger;
    this.getRunViewer = getRunViewer;
    // Constructor-injected current-region resolver (GatheringLocationService),
    // NOT a module import — keeps the engine system-agnostic and testable.
    this.locationResolver = locationResolver;
    this.random = typeof random === 'function' ? random : Math.random;
    this.localize = localize;
    this.isPrimaryGM = typeof isPrimaryGM === 'function' ? isPrimaryGM : () => true;
    this.getActors = typeof getActors === 'function' ? getActors : () => [];
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
          message: stringOrNull(error?.message)
        });
      }
    }

    // Drive stamina regeneration and node respawn off the same world-time tick
    // that matures timed runs. Guarded to the primary GM so connected clients
    // never double-apply; regen/respawn are idempotent per advanced anchor.
    let staminaRegen = [];
    let nodeRespawn = [];
    if (this.isPrimaryGM()) {
      staminaRegen = await this._processStaminaRegen(worldTime);
      nodeRespawn = await this._processNodeRespawn(worldTime);
    }

    return {
      worldTime: Number(worldTime),
      processed,
      completed,
      cancelled,
      cleared,
      errors,
      staminaRegen,
      nodeRespawn
    };
  }

  /**
   * Regenerate stamina for every actor that owns a pool in a stamina-enabled
   * system. Per-actor failures are swallowed so one bad actor cannot abort the
   * world-time tick. Returns the list of `{actorId, systemId}` actually changed.
   */
  async _processStaminaRegen(worldTime) {
    if (typeof this.richState?.regenerateActorStamina !== 'function') return [];
    const staminaSystems = Array.from(this._enabledGatheringSystems().values())
      .filter(system => this.richState.staminaEnabled?.(system.id) === true);
    if (staminaSystems.length === 0) return [];
    const actors = normalizeList(this.getActors?.());
    const changed = [];
    for (const system of staminaSystems) {
      for (const actor of actors) {
        try {
          const updated = await this.richState.regenerateActorStamina({ actor, systemId: system.id, system, worldTime });
          if (updated) changed.push({ actorId: idOf(actor), systemId: String(system.id) });
        } catch (error) {
          // Surface (don't silently swallow) so a broken regen is diagnosable.
          console.warn(`Fabricate | stamina regen failed for actor ${idOf(actor)} in system ${system.id}:`, error);
          // eslint-disable-next-line no-continue
          continue;
        }
      }
    }
    return changed;
  }

  /**
   * Respawn nodes for every environment owned by a nodes-enabled system. Per-
   * environment failures are swallowed. Returns the changed environment ids.
   */
  async _processNodeRespawn(worldTime) {
    if (typeof this.richState?.respawnNodes !== 'function') return [];
    const systems = this._enabledGatheringSystems();
    const changed = [];
    for (const environment of normalizeList(this.environmentStore?.list?.())) {
      if (!systems.has(environment?.craftingSystemId)) continue;
      if (!this.richState.nodesEnabled?.(environment.craftingSystemId)) continue;
      try {
        const updated = await this.richState.respawnNodes({ environment, worldTime });
        if (updated) changed.push({ environmentId: String(environment.id) });
      } catch (error) {
        // Surface (don't silently swallow) so a broken respawn is diagnosable.
        console.warn(`Fabricate | node respawn failed for environment ${environment?.id}:`, error);
        // eslint-disable-next-line no-continue
        continue;
      }
    }
    return changed;
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
    presentTools = null
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

    // Fresh location re-resolution at attempt time (no listing cache) so a stale
    // listing state — e.g. an override cleared between list and start — cannot
    // start a location-gated attempt.
    const locationGuard = this._locationBlockedReasons({ environment, system, viewer, actor: selectedActor });
    if (locationGuard.blockedReasons.length > 0) {
      return this._blockedStart({
        viewer,
        actor: selectedActor,
        environment,
        task,
        reason: locationGuard.blockedReasons[0]
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
            : this._toolBlockedData({ task, resolvedTools: taskTools })
        })
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
        presentTools
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
              : this._toolBlockedData({ task, resolvedTools: taskTools, toolResult })
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
      // Waiting runs mature later (no open session / canvas tool), so terminal
      // tool side-effects use no virtual-present set; the gate above already
      // passed for this attempt.
      return this._startWaitingAttempt({ viewer, actor: selectedActor, system, environment, task, richAttempt });
    }

    return this._resolveImmediateAttempt({ viewer, actor: selectedActor, system, environment, task, richAttempt, presentTools });
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

    const outcome = task.resolutionMode === 'd100'
      ? await this._resolveD100Outcome({ viewer, actor, system, environment, task })
      : (task.resolutionMode === 'progressive'
        ? await this._resolveProgressiveOutcome({ viewer, actor, system, environment, task })
        : await this._resolveRoutedOutcome({ viewer, actor, system, environment, task }));
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

    const richEvidence = await this._commitRichAttempt({ actor, system, environment, task, outcome, viewer });
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
      checkResult
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
   * - `hazards` — read-only player-facing models for the environment's composed
   *   hazards (`id`, `name`, `description`, `img`, `dangerTags`, `risk`, a static
   *   `chance`, the matching criteria `weather`/`timeOfDay`/`biomes`,
   *   resolved `biomeTags` display metadata, and an optional `linkedSceneUuid`;
   *   see {@link GatheringEngine#_hazardModel}).
   *   The full list for targeted environments and GM viewers; `[]` (redacted) for
   *   a non-GM viewer of a blind environment and for locked teasers. The aggregate
   *   `hazardChance` is still emitted regardless, so the player UI can show the
   *   chance bar even when individual hazards are redacted.
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
   * @param {object} [args]
   * @param {object|null} [args.viewer] Foundry user requesting the listing.
   * @param {object|null} [args.actor] Explicitly selected actor, if any.
   * @param {string|null} [args.rememberedActorId] Previously selected actor id.
   * @returns {Promise<object>} The gathering listing model.
   */
  async listForActor({ viewer = null, actor = null, rememberedActorId = null, presentTools = null } = {}) {
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
    // Resolve each system's current-region context at most once per listing call.
    const regionContextCache = new Map();
    for (const environment of environments) {
      const model = await this._buildEnvironmentListing({
        environment,
        system: systems.get(environment.craftingSystemId),
        viewer,
        actor: selectedActor,
        presentTools,
        regionContextCache
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
    const gatheringSystems = this._gatheringSystemOptions([
      ...environmentModels,
      ...activeRuns,
      ...history
    ]);

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
      gatheringSystems
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
   * Returns `{ resolutionMode, awardMode, awardLimit, hazardPolicy, drops }`;
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
    const empty = { resolutionMode: null, awardMode: null, awardLimit: null, hazardPolicy: null, drops: [] };
    if (!environmentId || !taskId || typeof this.richState?.previewDropBreakdown !== 'function') return empty;

    const selectableActors = normalizeActorList(await callMaybe(this.getSelectableActors, { viewer }));
    if (selectableActors.length === 0) return empty;
    const selected = this._resolveSelectedActor({ actor: null, rememberedActorId, selectableActors, viewer });
    if (selected.blockedReason) return empty;
    const actor = selected.actor;

    const systems = this._enabledGatheringSystems();
    const environment = this._playerCandidateEnvironments(systems, viewer)
      .find(candidate => stringOrNull(candidate?.id) === String(environmentId));
    if (!environment || environment.enabled === false) return empty;
    const system = systems.get(environment.craftingSystemId);

    // Gate to what the viewer can actually see: only task ids the player listing
    // would render (targeted tasks, or revealed blind "discovered" tasks).
    const model = await this._buildEnvironmentListing({ environment, system, viewer, actor });
    if (model.visible !== true) return empty;
    const visibleIds = new Set([
      ...normalizeList(model.tasks),
      ...normalizeList(model.discoveredTasks)
    ].map(taskModel => stringOrNull(taskModel?.id)).filter(Boolean));
    if (!visibleIds.has(String(taskId))) return empty;

    const task = normalizeList(environment.tasks).find(entry => stringOrNull(entry?.id) === String(taskId)) ?? null;
    if (!task || task.resolutionMode !== 'd100') return { ...empty, resolutionMode: stringOrNull(task?.resolutionMode) };

    const preview = await this.richState.previewDropBreakdown({ environment, task, actor, viewer, system });
    const componentsById = this._componentsById(system);
    const drops = normalizeList(preview?.drops).map(drop => ({
      ...drop,
      img: stringOrNull(componentsById.get(stringOrNull(drop?.componentId))?.img) || 'icons/svg/item-bag.svg'
    }));
    return {
      resolutionMode: 'd100',
      successChance: preview?.successChance ?? null,
      awardMode: stringOrNull(preview?.awardMode),
      awardLimit: Number(preview?.awardLimit ?? 1),
      hazardPolicy: stringOrNull(preview?.hazardPolicy),
      drops
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
    const system = this._allSystems().get(String(run.craftingSystemId));
    const task = environment
      ? normalizeList(environment.tasks).find(task => task?.id === run.taskId) ?? null
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
      updatedAtWorldTime: numberOrNull(run.updatedAtWorldTime)
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

    const snapshot = plainObjectOrNull(run?.economyEvidence?.runtimeSnapshot);
    const snapshotTask = plainObjectOrNull(snapshot?.task);
    const snapshotEnvironment = snapshotTask
      ? {
          ...environment,
          conditions: plainObjectOrNull(snapshot?.conditions) || plainObjectOrNull(run?.conditionSnapshot) || plainObjectOrNull(environment?.conditions) || {},
          hazards: normalizeList(snapshot?.hazards),
          rules: plainObjectOrNull(snapshot?.rules) || plainObjectOrNull(environment?.rules) || {},
          useLegacyTaskItemSelectionMode: snapshot?.useLegacyTaskItemSelectionMode === true,
          hazardSelectionMode: stringOrNull(snapshot?.hazardSelectionMode) || stringOrNull(environment?.hazardSelectionMode),
          hazardLimit: snapshot?.hazardLimit,
          hazardPolicy: stringOrNull(snapshot?.hazardPolicy) || stringOrNull(environment?.hazardPolicy)
        }
      : null;
    if (snapshotEnvironment && environment?.__libraryTools instanceof Map) {
      Object.defineProperty(snapshotEnvironment, '__libraryTools', {
        value: environment.__libraryTools,
        enumerable: false,
        configurable: true,
        writable: true
      });
    }
    const currentTask = normalizeList(environment.tasks).find(task => task?.id === run.taskId) ?? null;
    const task = snapshotTask || currentTask;
    if (!task) {
      return { missingReference: 'task', system, environment };
    }

    return { system, environment: snapshotEnvironment || environment, task };
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
      return true;
    }).map(environment => this._composeEnvironment(environment, systems.get(environment.craftingSystemId)));
  }

  _composeEnvironment(environment, system = null) {
    if (typeof this.richState?.composeEnvironment === 'function') {
      return this.richState.composeEnvironment(environment, system);
    }
    return environment;
  }

  async _buildEnvironmentListing({ environment, system, viewer, actor, presentTools = null, regionContextCache = null }) {
    // Disabled environments surface to every viewer (players and GMs alike) as
    // non-interactive "locked" teasers. Build them before any task-visibility
    // gating so they are never dropped as BLIND_SOLE_TASK_HIDDEN /
    // NO_VISIBLE_TARGETED_TASKS, and carry identity fields only — no tasks,
    // weights, or composition internals leak.
    if (environment.enabled === false) {
      return this._lockedEnvironmentListing({ environment, system });
    }

    // Auto-seed the acting character's stamina pool on first sight of a stamina
    // system (e.g. opening the gathering tab), so the displayed pool reflects the
    // rolled max/start. Idempotent — the dice roll persists once.
    if (actor && this.richState?.staminaEnabled?.(environment.craftingSystemId) === true) {
      try {
        await this.richState?.seedActorStaminaIfNeeded?.({ actor, systemId: environment.craftingSystemId, system });
      } catch (error) { /* display-only: never block the listing on a seed failure */ }
    }

    const visibleTasks = await this._visibleTaskListings({ environment, system, viewer, actor });
    if (visibleTasks.length === 0) {
      return {
        visible: false,
        hiddenReason: environment.selectionMode === 'blind'
          ? 'BLIND_SOLE_TASK_HIDDEN'
          : 'NO_VISIBLE_TARGETED_TASKS'
      };
    }

    const environmentBlockedReasons = await this._environmentBlockedReasons({ environment, system, viewer, actor, regionContextCache });
    // Redaction-safe location field computed once for the listing model.
    const { location } = this._locationBlockedReasons({ environment, system, viewer, actor, regionContextCache });
    // Party current-region summary for the header bar (regardless of this
    // environment's gating), so the player app can show the current region or
    // "no region selected" when the region/travel subsystem is enabled.
    const regionSummary = this._currentRegionSummary({ environment, system, viewer, actor, regionContextCache });
    // Stash each visible task's blocked reasons so both the player task models
    // and the blind "discovered tasks" list draw from one computation — no
    // extra visibility pass that could surface unrevealed tasks.
    const taskEntries = [];
    for (const visibleTask of visibleTasks) {
      const taskBlockedReasons = [
        ...environmentBlockedReasons,
        ...await this._taskBlockedReasons({
          environment,
          system,
          task: visibleTask.task,
          actor,
          viewer,
          presentTools
        })
      ];
      taskEntries.push({
        task: visibleTask.task,
        visibility: visibleTask.visibility,
        blockedReasons: taskBlockedReasons
      });
    }
    const taskModels = taskEntries.map(entry => this._taskModel({
      task: entry.task,
      environment,
      actor,
      viewer,
      visibility: entry.visibility,
      blockedReasons: entry.blockedReasons,
      tools: this._resolveTaskToolStates({ actor, system, environment, task: entry.task, presentTools })
    }));
    // Refine the displayed stamina cost to the viewing character's effective
    // cost (base + per-actor modifiers); the sync model carries the base.
    for (let i = 0; i < taskModels.length; i++) {
      await this._applyListingStaminaCost(taskModels[i], { system, environment, actor, viewer, task: taskEntries[i].task });
    }

    const attemptable = taskModels.some(task => task.attemptable);
    const blockedReasons = environmentBlockedReasons.length > 0
      ? environmentBlockedReasons
      : (attemptable ? [] : uniqueReasons(taskModels.flatMap(task => task.blockedReasons)));

    // A non-GM viewer of a blind environment sees one opaque "Attempt gathering"
    // action (the collapsed task list) plus the transparent rows for tasks they
    // have already discovered. Targeted environments and GM viewers expose the
    // full task list and no separate discovered list.
    const blindForViewer = environment.selectionMode === 'blind' && viewer?.isGM !== true;
    const listedTasks = blindForViewer
      ? (taskModels.length > 0 ? [taskModels[0]] : [])
      : taskModels;
    const discoveredTasks = blindForViewer
      ? await this._discoveredTaskModels({ environment, system, viewer, actor, taskEntries, environmentBlockedReasons, presentTools })
      : [];

    // The GM-configured hazard visibility tier further restricts what a non-GM
    // viewer sees, independent of the blind/targeted redaction above: only
    // 'full' exposes individual hazards, and 'dangerLevelOnly' also hides the
    // environment encounter-chance bar (signalled by a null hazardChance). A GM
    // always resolves to 'full'.
    const hazardVisibility = this._resolveHazardVisibility(environment, viewer);

    // Individual hazards are read-only player-facing models. They are redacted
    // for a non-GM viewer of a blind environment (mirroring the collapsed task
    // list) or whenever the visibility tier is not 'full', and surfaced in full
    // for targeted environments and GM viewers.
    const listedHazards = (blindForViewer || hazardVisibility !== 'full')
      ? []
      : normalizeList(environment.hazards)
          .filter(hazard => hazard?.enabled !== false)
          .map(hazard => this._hazardModel(hazard, environment));

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
      staminaPool: this.richState?.staminaEnabled?.(environment.craftingSystemId) === true && actor
        ? this.richState?.getActorStamina?.(actor, stringOrNull(environment.craftingSystemId)) || null
        : null,
      conditions: plainObjectOrNull(environment.conditions) || {},
      regionsEnabled: regionSummary.regionsEnabled,
      currentRegions: regionSummary.currentRegions,
      selectionMode: environment.selectionMode === 'blind' ? 'blind' : 'targeted',
      sceneUuid: stringOrNull(environment.sceneUuid),
      visible: true,
      attemptable,
      hazardChance: hazardVisibility === 'dangerLevelOnly' ? null : this._environmentHazardChance(environment),
      hazards: listedHazards,
      hazardVisibility,
      blockedReasons,
      location,
      tasks: listedTasks,
      discoveredTasks,
      ...this._playerListingFields({ environment, actor, locked: false })
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
  async _discoveredTaskModels({ environment, system, viewer, actor, taskEntries, environmentBlockedReasons, presentTools = null }) {
    const { policy, scope } = this._resolveRevealPolicy(environment);
    if (policy === 'never') return [];
    const revealedIds = new Set(this._listRevealedTaskIds({ actor, environmentId: environment.id, scope }));
    if (revealedIds.size === 0) return [];

    const discovered = [];
    for (const entry of taskEntries) {
      if (!revealedIds.has(stringOrNull(entry.task.id))) continue;
      const blockedReasons = [
        ...environmentBlockedReasons,
        ...await this._taskBlockedReasons({
          environment,
          system,
          task: entry.task,
          actor,
          viewer,
          transparent: true,
          presentTools
        })
      ];
      const model = this._taskModel({
        task: entry.task,
        environment,
        actor,
        viewer,
        visibility: entry.visibility,
        blockedReasons,
        forceVisible: true,
        tools: this._resolveTaskToolStates({ actor, system, environment, task: entry.task, presentTools })
      });
      await this._applyListingStaminaCost(model, { system, environment, actor, viewer, task: entry.task });
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
    if (!actor || !model?.rich?.stamina || typeof this.richState?.listingStaminaCost !== 'function') return;
    const cost = await this.richState.listingStaminaCost({ actor, system, environment, task, viewer });
    if (cost != null) model.rich.stamina.cost = cost;
  }

  /**
   * Build the lightweight locked listing for a disabled environment shown to
   * every viewer (players and GMs alike) in the player listing. Carries
   * identity fields only — no tasks, weights, or composition internals — plus
   * the existing ENVIRONMENT_DISABLED reason.
   */
  _lockedEnvironmentListing({ environment, system }) {
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
      // No actor/viewer is resolved for a locked teaser, so the current region is
      // left empty ("no region selected"); the flag still mirrors the system so
      // the header chip appears when the subsystem is enabled.
      regionsEnabled: isGatheringRegionsEnabled(system),
      currentRegions: [],
      staminaPool: null,
      conditions: plainObjectOrNull(environment.conditions) || {},
      selectionMode: environment.selectionMode === 'blind' ? 'blind' : 'targeted',
      sceneUuid: stringOrNull(environment.sceneUuid),
      visible: true,
      attemptable: false,
      blockedReasons: [this._blockedReason('ENVIRONMENT_DISABLED')],
      tasks: [],
      discoveredTasks: [],
      hazards: [],
      ...this._playerListingFields({ environment, actor: null, locked: true })
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
    const discoveredTaskCount = (locked || revealPolicy === 'never')
      ? 0
      : this._countRevealedTasks({ actor, environmentId: environment.id, scope });
    return {
      locked: locked === true,
      revealPolicy,
      composedTaskCount,
      discoveredTaskCount,
      biomeTags: this._resolveBiomeTags(environment)
    };
  }

  _countRevealedTasks({ actor, environmentId, scope }) {
    if (typeof this.richState?.countRevealedTasks !== 'function') return 0;
    try {
      return this.richState.countRevealedTasks({ actor, environmentId, scope }) || 0;
    } catch (_err) {
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
    } catch (_err) {
      return [];
    }
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
    const rows = normalizeList(task.dropRows).filter(row => row?.enabled !== false);
    if (rows.length === 0) return null;
    const missAll = rows.reduce((product, row) => {
      const rate = Math.min(100, Math.max(0, Number(row?.dropRate) || 0));
      return product * (1 - rate / 100);
    }, 1);
    return 1 - missAll;
  }

  /**
   * Static "chance of encountering a hazard" for an environment: the probability
   * that at least one eligible hazard triggers on an attempt, derived from the
   * composed hazards' `dropRate`s as `1 - ∏(1 - dropRate/100)`.
   *
   * Like `_taskSuccessChance` this ignores actor/condition/character modifiers
   * and hazard selection-mode/limit (those only affect which triggered hazards
   * are applied, not whether any trigger). Returns `0` when the environment has
   * no enabled hazards, so the player UI can show the "safe" hint instead of a
   * bar.
   *
   * @param {object} environment A composed gathering environment.
   * @returns {number} A 0–1 fraction (0 when there are no hazards).
   */
  _environmentHazardChance(environment) {
    const hazards = normalizeList(environment?.hazards).filter(hazard => hazard?.enabled !== false);
    if (hazards.length === 0) return 0;
    const missAll = hazards.reduce((product, hazard) => {
      const rate = Math.min(100, Math.max(0, Number(hazard?.dropRate) || 0));
      return product * (1 - rate / 100);
    }, 1);
    return 1 - missAll;
  }

  /**
   * A read-only, player-safe model for a single composed hazard, used to render
   * the center column's hazards list and the right-column hazard inspector.
   * Carries identity (`id`/`name`/`description`/`img`), the hazard's danger tags
   * + a derived `risk` tier (the first tag, or `safe`), a static `chance`
   * (`dropRate/100`, clamped to 0–1) so the UI can reuse the hazard-chance bar,
   * and the hazard's matching criteria (`weather`/`timeOfDay`/`biomes`, each an
   * empty array meaning "any"; region is no longer a composition axis) plus an
   * optional `linkedSceneUuid` for the
   * details view. Modifier internals (hazardModifier/conditionModifiers/
   * characterModifiers) are intentionally NOT surfaced. Like
   * `_environmentHazardChance`, `chance` ignores actor/condition/character
   * modifiers — it is the static per-hazard trigger rate, not a resolved roll.
   *
   * @param {object} hazard A composed/normalized gathering hazard.
   * @param {object} [environment] The owning environment (for biome-tag resolution).
   * @returns {object} The player-facing hazard model.
   */
  _hazardModel(hazard, environment = null) {
    const dangerTags = normalizeStringList(hazard?.dangerTags);
    const biomes = normalizeStringList(hazard?.biomes);
    return {
      id: stringOrNull(hazard?.id),
      name: stringOrEmpty(hazard?.name),
      description: stringOrEmpty(hazard?.description),
      img: stringOrNull(hazard?.img),
      dangerTags,
      risk: dangerTags[0] || 'safe',
      chance: Math.min(1, Math.max(0, (Number(hazard?.dropRate) || 0) / 100)),
      weather: normalizeStringList(hazard?.weather),
      timeOfDay: normalizeStringList(hazard?.timeOfDay),
      biomes,
      // Resolved biome display metadata ({ id, label, icon, colorToken,
      // customColor }) so hazard biome chips render with icons/colours like the
      // environment's biome pips. Empty when richState can't resolve them.
      biomeTags: this._resolveBiomeTagList(biomes, environment),
      linkedSceneUuid: stringOrNull(hazard?.linkedSceneUuid)
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
   * throws. Shared by environment and hazard biome-tag resolution.
   */
  _resolveBiomeTagList(biomes, environment) {
    if (typeof this.richState?.resolveBiomeTags !== 'function') return [];
    try {
      return this.richState.resolveBiomeTags(biomes, environment?.craftingSystemId) || [];
    } catch (_err) {
      return [];
    }
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

  async _environmentBlockedReasons({ environment, system = null, viewer, actor, regionContextCache = null }) {
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

    const location = this._locationBlockedReasons({ environment, system, viewer, actor, regionContextCache });
    blockedReasons.push(...location.blockedReasons);

    return blockedReasons;
  }

  /**
   * Resolve the current-region context for one system once per listing call.
   * Memoized by systemId in the supplied cache so the per-environment loop in
   * `listForActor` does not re-resolve for every environment of a system.
   *
   * @param {object} args
   * @param {object} args.actor Selected actor.
   * @param {string} args.systemId Owning crafting system id.
   * @param {Map<string, object>|null} [args.cache]
   * @returns {object} Current-region context (resolved/source/regions/...).
   */
  _resolveRegionContext({ actor, systemId, cache = null }) {
    if (cache && cache.has(systemId)) return cache.get(systemId);
    const context = typeof this.locationResolver?.buildCurrentRegionContext === 'function'
      ? this.locationResolver.buildCurrentRegionContext({ actor, systemId })
      : { resolved: false, source: 'unresolved', regions: [], regionIds: [], staleRegionIds: [] };
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
   * whose destinations flow through `buildRegionDisclosure`, so secret
   * undiscovered region ids/names never appear in player-facing data.
   *
   * @param {object} args
   * @returns {{ blockedReasons: object[], location: object }}
   */
  _locationBlockedReasons({ environment, system = null, viewer, actor, regionContextCache = null }) {
    // When the region/travel subsystem is disabled for this system, behave as if
    // no environment is location-gated and no travel exists: every environment
    // is available and the listing `location` field is the ungated shape. This
    // is the central choke point (the listing `location` field and the
    // start-attempt location guard both flow through here).
    if (!isGatheringRegionsEnabled(system)) {
      return {
        blockedReasons: [],
        location: { gated: false, available: true, source: 'unresolved', currentRegions: [], guidance: null }
      };
    }
    const gated = environmentHasLocationRules(environment);
    if (!this.locationResolver || !gated) {
      return {
        blockedReasons: [],
        location: { gated: false, available: true, source: 'unresolved', currentRegions: [], guidance: null }
      };
    }

    const systemId = stringOrNull(environment?.craftingSystemId);
    const context = this._resolveRegionContext({ actor, systemId, cache: regionContextCache });
    const availability = evaluateLocationAvailability(environment, context);
    const isGM = viewer?.isGM === true;
    const revealMode = this._regionRevealMode(system);
    const regionsById = new Map((Array.isArray(system?.gatheringRegions) ? system.gatheringRegions : []).map(region => [region.id, region]));
    const discoveredRegionIds = actor ? getDiscoveredRegionIdsForSystem(actor, systemId) : new Set();

    const currentRegions = (Array.isArray(context?.regions) ? context.regions : []).map(region => buildRegionDisclosure(region, {
      isGM,
      discovered: discoveredRegionIds.has(region?.id),
      revealMode
    }));

    const location = {
      gated: true,
      available: availability.available === true,
      source: stringOrNull(context?.source) || 'unresolved',
      currentRegions,
      guidance: null
    };

    if (availability.available === true) {
      return { blockedReasons: [], location };
    }

    const guidance = buildTravelGuidance({
      environment,
      regionsById,
      currentRegionContext: context,
      availability,
      discoveredRegionIds,
      isGM,
      revealMode
    });
    location.guidance = guidance;

    const code = availability.reasons.includes('NO_CURRENT_REGION') ? 'NO_CURRENT_REGION' : 'LOCATION_BLOCKED';
    return {
      blockedReasons: [this._blockedReason(code, { data: guidance })],
      location
    };
  }

  /**
   * Resolve the party's current-region summary for the header bar, independent of
   * whether THIS environment is location-gated. Unlike the `location` field (which
   * only discloses current regions for a gated environment), this surfaces the
   * party's current region for the system whenever the region/travel subsystem is
   * enabled, so the player header can show "current region / no region selected".
   * Reuses the per-listing region-context cache and the same redaction policy as
   * the gated path (`buildRegionDisclosure`).
   *
   * @param {object} args
   * @returns {{ regionsEnabled: boolean, currentRegions: object[] }}
   */
  _currentRegionSummary({ environment, system = null, viewer, actor, regionContextCache = null }) {
    if (!isGatheringRegionsEnabled(system)) {
      return { regionsEnabled: false, currentRegions: [] };
    }
    const systemId = stringOrNull(environment?.craftingSystemId);
    const context = this._resolveRegionContext({ actor, systemId, cache: regionContextCache });
    const isGM = viewer?.isGM === true;
    const revealMode = this._regionRevealMode(system);
    const discoveredRegionIds = actor ? getDiscoveredRegionIdsForSystem(actor, systemId) : new Set();
    const currentRegions = (Array.isArray(context?.regions) ? context.regions : []).map(region => buildRegionDisclosure(region, {
      isGM,
      discovered: discoveredRegionIds.has(region?.id),
      revealMode
    }));
    return { regionsEnabled: true, currentRegions };
  }

  _regionRevealMode(system) {
    const mode = system?.gatheringRegionSettings?.revealMode;
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
  async _taskBlockedReasons({ environment, system, task, actor, viewer, transparent = false, presentTools = null }) {
    const blockedReasons = [];
    // For a revealed/discovered blind task (`transparent`), keep the real
    // blocked-reason data — the row needs the actual required weather/time and
    // missing-tool details. For an opaque blind task, the data stays nulled.
    const redact = !transparent && this._isOpaqueBlindTask({ environment, viewer });
    if (this._gamePaused()) {
      blockedReasons.push(this._blockedReason('GAME_PAUSED'));
    }

    if (this.runManager?.findActiveRunForTask?.(actor, task.id)) {
      blockedReasons.push(this._blockedReason('DUPLICATE_ACTIVE_RUN', {
        data: redact ? null : { taskId: task.id }
      }));
    }

    const taskTools = this._resolveTaskTools({ environment, task });
    if (this._hasBlockedToolReferences(taskTools)) {
      blockedReasons.push(this._blockedReason('TOOL_BLOCKED', {
        data: redact
          ? null
          : this._toolBlockedData({ task, resolvedTools: taskTools })
      }));
    } else if (taskTools.tools.length > 0) {
      const toolResult = await this._checkTools({
        actor,
        viewer,
        system,
        environment,
        task,
        tools: taskTools.tools,
        presentTools
      });
      if (toolResult.available !== true) {
        blockedReasons.push(this._blockedReason('TOOL_BLOCKED', {
          data: redact
            ? null
            : this._toolBlockedData({ task, resolvedTools: taskTools, toolResult })
        }));
      }
    }

    // Weather/time-of-day are runtime gates: a task may match the environment
    // (biome/danger) but be inactive when current conditions don't satisfy its
    // required `weather` / `timeOfDay` values.
    const conditionsResult = evaluateEnvironmentMatch(task, environment, environment?.conditions || {}, { includeDanger: false });
    if (conditionsResult.conditionsMet === false) {
      blockedReasons.push(this._blockedReason('CONDITIONS_BLOCKED', {
        data: redact
          ? null
          : {
              taskId: task.id,
              requiredWeather: conditionsResult.evidence?.weather?.recordValues ?? [],
              requiredTimeOfDay: conditionsResult.evidence?.time?.recordValues ?? []
            }
      }));
    }

    const richAttempt = await this._evaluateRichAttempt({ actor, viewer, system, environment, task, transparent });
    blockedReasons.push(...richAttempt.blockedReasons);

    return blockedReasons;
  }

  _resolveTaskTools({ environment, task }) {
    const tools = [];
    const missingToolIds = [];
    const disabledToolIds = [];
    const library = environment?.__libraryTools instanceof Map ? environment.__libraryTools : new Map();

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
    const { tools, missingToolIds, disabledToolIds } = this._resolveTaskTools({ environment, task });
    const componentsById = this._componentsById(system);
    const states = classifyGatheringToolStates({
      actor,
      system,
      task,
      tools,
      craftingSystemManager: this.systemManager,
      presentTools
    });

    const resolved = states.map(({ tool, state }) => {
      const component = componentsById.get(stringOrNull(tool?.componentId)) ?? null;
      const name = stringOrNull(tool?.label)
        || stringOrEmpty(component?.name)
        || this.localize(UNKNOWN_TOOL_LABEL_KEY);
      const img = stringOrNull(component?.img) || DEFAULT_TOOL_IMG;
      return {
        id: stringOrNull(tool?.id) || stringOrNull(tool?.componentId),
        name,
        img,
        state,
        required: true
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
        required: true
      });
    }

    return resolved;
  }

  _componentsById(system) {
    const map = new Map();
    if (!system?.id || typeof this.systemManager?.getItems !== 'function') return map;
    let components = [];
    try {
      components = normalizeList(this.systemManager.getItems(system.id));
    } catch (_err) {
      return map;
    }
    for (const component of components) {
      const id = stringOrNull(component?.id);
      if (id) map.set(id, component);
    }
    return map;
  }

  _hasBlockedToolReferences(resolvedTools) {
    return normalizeList(resolvedTools?.missingToolIds).length > 0
      || normalizeList(resolvedTools?.disabledToolIds).length > 0;
  }

  _toolBlockedData({ task, resolvedTools, toolResult = null }) {
    return {
      taskId: stringOrNull(task?.id),
      missingToolIds: normalizeList(resolvedTools?.missingToolIds),
      disabledToolIds: normalizeList(resolvedTools?.disabledToolIds),
      missing: normalizeList(toolResult?.missing),
      failedRequirements: normalizeList(toolResult?.failedRequirements)
    };
  }

  async _checkTools({ actor, viewer, system, environment, task, tools, presentTools = null }) {
    if (typeof this.toolAvailability?.check === 'function') {
      return normalizeToolResult(await this.toolAvailability.check({
        actor,
        viewer,
        system,
        environment,
        task,
        tools,
        presentTools
      }));
    }
    // Fallback: treat a tool as satisfied when virtually present (canvas Tool).
    // System-scoped: a present tool only counts when the active tool's systemId
    // matches this task's crafting system (componentId is a per-system id).
    const presentSet = resolvePresentComponentIds({
      presentTools,
      systemId: system?.id ?? task?.craftingSystemId ?? null
    });
    const missing = tools.filter(tool => !presentSet.has(tool?.componentId));
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
  _taskModel({ task, environment, actor = null, viewer, visibility, blockedReasons, forceVisible = false, tools = null }) {
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
      successChance: typeof this.richState?.taskSuccessChance === 'function'
        ? this.richState.taskSuccessChance(task, environment)
        : this._taskSuccessChance(task),
      tools: Array.isArray(tools) ? tools : [],
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
      risk: task?.riskOverride || environment?.risk || 'safe',
      conditions: plainObjectOrNull(environment?.conditions) || {}
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
  async _evaluateRichAttempt({ actor, viewer, system, environment, task, transparent = false }) {
    if (typeof this.richState?.evaluateStart !== 'function') {
      return { blockedReasons: [], evidence: this._richListingMetadata({ environment, task, actor, viewer }) };
    }
    const result = await this.richState.evaluateStart({ actor, viewer, system, environment, task });
    const redact = !transparent && this._isOpaqueBlindTask({ environment, viewer });
    return {
      blockedReasons: normalizeList(result?.blockedReasons).map(reason => this._blockedReason(reason.code || 'BLOCKED', {
        messageKey: reason.messageKey,
        message: reason.message,
        data: redact ? null : reason.data
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
      if (environment) {
        const system = this._allSystems().get(String(environment.craftingSystemId));
        return this._composeEnvironment(environment, system);
      }
    }
    const environment = normalizeList(this.environmentStore?.list?.()).find(environment => environment?.id === id) ?? null;
    if (!environment) return null;
    const system = this._allSystems().get(String(environment.craftingSystemId));
    return this._composeEnvironment(environment, system);
  }

  _findStartTask({ environment, taskId }) {
    const tasks = normalizeList(environment?.tasks);
    const id = stringOrNull(taskId);
    if (!id) return null;
    return tasks.find(task => task?.id === id) ?? null;
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
    let pool = visibleTasks.map(entry => entry.task);

    const gate = environment?.rules?.blindCandidateGate === 'allMatching' ? 'allMatching' : 'attemptableOnly';
    if (gate === 'attemptableOnly') {
      const attemptable = [];
      for (const task of pool) {
        const reasons = await this._taskBlockedReasons({ environment, system, task, actor, viewer });
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
      .map(task => {
        const raw = Number(map[task.id]);
        const hasEntry = Object.prototype.hasOwnProperty.call(map, task.id);
        const weight = Number.isFinite(raw) ? raw : (hasEntry ? 0 : 1);
        return { task, weight: weight > 0 ? weight : 0 };
      })
      .filter(entry => entry.weight > 0);
    if (weighted.length === 0) return null;
    const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
    let roll = this.random() * total;
    for (const entry of weighted) {
      roll -= entry.weight;
      if (roll < 0) return entry.task;
    }
    return weighted[weighted.length - 1].task;
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
    if (hasRichGatheringData(environment, task) || task.resolutionMode === 'd100') {
      const richPayload = this._richHistoryPayload({ environment, task, richAttempt, viewer });
      richPayload.economyEvidence = {
        ...(richPayload.economyEvidence || {}),
        runtimeSnapshot: this._runtimeSnapshot({ environment, task })
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
              diagnostics: run?.diagnostics ?? run?.diagnostic
            })
          })
        });
      }

      const richEvidence = await this._commitRichAttempt({ actor, system, environment, task, outcome: { status: 'waitingTime' }, viewer });
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

  async _resolveImmediateAttempt({ viewer, actor, system, environment, task, richAttempt = null, presentTools = null }) {
    const outcome = task.resolutionMode === 'd100'
      ? await this._resolveD100Outcome({ viewer, actor, system, environment, task })
      : (task.resolutionMode === 'progressive'
        ? await this._resolveProgressiveOutcome({ viewer, actor, system, environment, task })
        : await this._resolveRoutedOutcome({ viewer, actor, system, environment, task }));

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
    const plan = await this._terminalSideEffectPlan({ viewer, actor, system, environment, task, outcome, checkResult, presentTools });
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
    const richPayload = this._richHistoryPayload({ environment, task, richAttempt, viewer, characterModifierSnapshot: outcome?.characterModifierSnapshot ?? null });
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

    const richEvidence = await this._commitRichAttempt({ actor, system, environment, task, outcome, viewer });
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
      checkResult,
      presentTools
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
      checkResult
    });
  }

  async _terminalSideEffectPlan({ viewer, actor, system, environment, task, outcome, checkResult, presentTools = null }) {
    try {
      const usedTools = await this._planTerminalTools({
        viewer,
        actor,
        system,
        environment,
        task,
        outcome,
        checkResult,
        presentTools
      });
      if (usedTools?.status === 'misconfigured') return usedTools;

      const toolBroke = Array.isArray(usedTools) && usedTools.some(entry => entry?.broken === true);
      if (toolBroke && resolveToolBreakagePolicy(environment) === 'failureOnBreak') {
        outcome.status = 'failed';
        outcome.resultGroups = [];
      }

      const createdResults = outcome.status === 'succeeded'
        ? await this._planGatheredResults({ viewer, actor, system, environment, task, outcome })
        : [];
      if (createdResults?.status === 'misconfigured') return createdResults;

      return {
        status: 'ready',
        createdResults,
        usedTools: Array.isArray(usedTools) ? usedTools : []
      };
    } catch (error) {
      return misconfiguredOutcome({
        code: stringOrNull(error?.code) || stringOrNull(error?.name) || 'TERMINAL_PLAN_FAILED',
        message: stringOrNull(error?.message) || 'Terminal side-effect planning failed'
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
          taskId: 'blind'
        },
        payload: {
          createdResults: [],
          usedTools: [],
          checkResult: { blind: true, status: outcome.status },
          ...this._richHistoryPayload({ environment, task, viewer, characterModifierSnapshot })
        }
      };
    }

    const payload = {
      createdResults: plan.createdResults,
      usedTools: plan.usedTools ?? []
    };
    if (checkResult !== undefined) payload.checkResult = checkResult;
    Object.assign(payload, this._richHistoryPayload({ environment, task, viewer, characterModifierSnapshot }));

    return {
      runData: {
        craftingSystemId: stringOrNull(system.id),
        environmentId: stringOrNull(environment.id),
        taskId: stringOrNull(task.id)
      },
      payload
    };
  }

  _richHistoryPayload({ environment, task, richAttempt = null, viewer = null, characterModifierSnapshot = null }) {
    if (!hasRichGatheringData(environment, task)) return {};
    const opaqueBlind = viewer ? this._isOpaqueBlindTask({ environment, viewer }) : false;
    const evidence = plainObjectOrNull(richAttempt?.evidence) || this._richListingMetadata({ environment, task, viewer });
    if (characterModifierSnapshot && typeof characterModifierSnapshot === 'object') {
      evidence.characterModifierSnapshot = cloneJson(characterModifierSnapshot);
    }
    const payload = {
      economyEvidence: opaqueBlind ? redactRichEvidence(evidence, { viewer }) : evidence,
      conditionSnapshot: plainObjectOrNull(environment?.conditions) || {},
      riskLevel: stringOrNull(task?.riskOverride) || stringOrNull(environment?.risk) || 'safe'
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
      hazards: normalizeList(environment?.hazards).map(hazard => cloneJson(hazard)),
      rules: plainObjectOrNull(environment?.rules) || {},
      useLegacyTaskItemSelectionMode: environment?.useLegacyTaskItemSelectionMode === true,
      hazardSelectionMode: stringOrNull(environment?.hazardSelectionMode),
      hazardLimit: environment?.hazardLimit,
      hazardPolicy: stringOrNull(environment?.hazardPolicy),
      conditions: plainObjectOrNull(environment?.conditions) || {}
    };
  }

  async _commitRichAttempt({ actor, system, environment, task, outcome, viewer = null }) {
    if (typeof this.richState?.commitAcceptedAttempt !== 'function') return null;
    return this.richState.commitAcceptedAttempt({ actor, system, environment, task, outcome, viewer });
  }

  async _commitTerminalSideEffects({ viewer, actor, system, environment, task, outcome, checkResult, presentTools = null }) {
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
      presentTools
    });
    if (outcome.status === 'failed') {
      await this._applyFailureFeedback({ viewer, actor, system, environment, task, outcome, checkResult });
    }
    await this.hazardSceneTrigger?.apply?.({ hazards: checkResult?.hazards, viewer, actor, system, environment, task });
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

  async _resolveD100Outcome({ viewer, actor, system, environment, task }) {
    if (typeof this.richState?.resolveD100Attempt !== 'function') {
      return misconfiguredOutcome({
        code: 'MISSING_D100_RESOLVER',
        message: 'D100 gathering resolution requires a rich gathering resolver'
      });
    }
    const gatheringModifier = Number(task?.gatheringModifier?.value ?? task?.gatheringModifier ?? 0);
    const hazardModifier = Number(environment?.hazardModifier?.value ?? environment?.hazardModifier ?? 0);
    const resolved = await this.richState.resolveD100Attempt({
      task,
      environment,
      actor,
      viewer,
      system,
      gatheringModifier: Number.isFinite(gatheringModifier) ? gatheringModifier : 0,
      hazardModifier: Number.isFinite(hazardModifier) ? hazardModifier : 0
    });
    if (resolved?.status === 'misconfigured') {
      return misconfiguredOutcome({
        code: 'CHARACTER_MODIFIER_MISCONFIGURED',
        diagnostics: normalizeList(resolved.diagnostics)
      });
    }
    const resultGroups = [{
      id: `${task.id}-d100-results`,
      name: task.name || 'Gathered',
      results: normalizeList(resolved?.items).map(item => ({
        id: item.id,
        componentId: stringOrNull(item.componentId),
        itemUuid: stringOrNull(item.itemUuid),
        quantity: Number(item.quantity || 1)
      }))
    }];
    return {
      status: resolved?.status === 'failed' ? 'failed' : 'succeeded',
      resultGroups,
      characterModifierSnapshot: resolved?.characterModifierSnapshot || null,
      checkResult: {
        provider: 'd100',
        items: normalizeList(resolved?.items),
        hazards: normalizeList(resolved?.hazards),
        hazardPolicy: stringOrNull(resolved?.hazardPolicy),
        characterModifierSnapshot: resolved?.characterModifierSnapshot || null
      }
    };
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

  async _planTerminalTools({ viewer, actor, system, environment, task, outcome, checkResult, presentTools = null }) {
    const resolvedTools = this._resolveTaskTools({ environment, task });
    if (this._hasBlockedToolReferences(resolvedTools)) {
      return misconfiguredOutcome({
        code: 'TOOL_REFERENCE_UNRESOLVED',
        diagnostics: [{
          code: 'TOOL_REFERENCE_UNRESOLVED',
          missingToolIds: normalizeList(resolvedTools.missingToolIds),
          disabledToolIds: normalizeList(resolvedTools.disabledToolIds)
        }]
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
        checkResult: checkResult ?? outcome.checkResult ?? null
      });
      return Array.isArray(planned) ? planned : [];
    } catch (error) {
      return misconfiguredOutcome({
        code: stringOrNull(error?.code) || 'TOOL_PLAN_FAILED',
        message: stringOrNull(error?.message) || 'Tool breakage planning failed'
      });
    }
  }

  async _applyTerminalTools({ viewer, actor, system, environment, task, outcome, presentTools = null }) {
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
      checkResult: outcome.checkResult ?? null
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
      checkResult: checkResult ?? null
    });
  }

  async _terminalStart({ viewer, actor, system, environment, task, status, run, createdResults, usedTools = [], checkResult }) {
    await this._maybeRevealBlindTask({ actor, environment, task, status });
    const opaqueBlind = this._isOpaqueBlindTask({ environment, viewer });
    const publicRun = opaqueBlind
      ? redactBlindTerminalRun(run)
      : enrichPublicTerminalRun(stripRuntimeSnapshotFromRun(run), { createdResults, usedTools, checkResult });
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
        run
      });
    }

    return response;
  }

  /**
   * Post an automatic gathering result chat card summarizing the attempt:
   * gathered components, hazards encountered, broken tools, stamina spent, and
   * remaining nodes — each with its component/hazard image.
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
   * @param {object}  [params.checkResult]  - Outcome detail (hazards, items).
   * @param {object}  params.run            - Terminal run (carries economyEvidence).
   * @private
   */
  async _postGatheringChatMessage({ actor, system, task, status, createdResults, usedTools, checkResult, run }) {
    if (!system || system.features?.chatOutput !== true) return;

    try {
      const componentsById = this._componentsById(system);
      const itemsByUuid = new Map();
      for (const item of normalizeList(checkResult?.items)) {
        const uuid = stringOrNull(item?.itemUuid);
        if (uuid) itemsByUuid.set(uuid, item);
      }

      const components = normalizeList(createdResults).map(entry => {
        const itemUuid = stringOrNull(entry?.itemUuid);
        const componentId = stringOrNull(itemsByUuid.get(itemUuid)?.componentId);
        const component = componentId ? componentsById.get(componentId) : null;
        const resolvedDoc = component ? null : resolveItemDoc(itemUuid);
        return {
          name: stringOrEmpty(component?.name) || stringOrEmpty(resolvedDoc?.name) || itemUuid || '',
          img: stringOrNull(component?.img) || stringOrNull(resolvedDoc?.img) || 'icons/svg/item-bag.svg',
          quantity: Number(entry?.quantity) || 1
        };
      });

      const hazards = normalizeList(checkResult?.hazards).map(hazard => ({
        name: stringOrEmpty(hazard?.name),
        img: stringOrNull(hazard?.img) || 'icons/svg/hazard.svg'
      }));

      const brokenTools = normalizeList(usedTools)
        .filter(entry => entry?.broken === true)
        .map(entry => {
          const component = componentsById.get(stringOrNull(entry?.componentId));
          const resolvedDoc = component ? null : resolveItemDoc(stringOrNull(entry?.itemRef?.itemUuid));
          return {
            name: stringOrEmpty(component?.name) || stringOrEmpty(resolvedDoc?.name) || this.localize(UNKNOWN_TOOL_LABEL_KEY),
            img: stringOrNull(component?.img) || stringOrNull(resolvedDoc?.img) || DEFAULT_TOOL_IMG
          };
        });

      const content = buildGatheringChatContent({
        status,
        actorName: stringOrEmpty(actor?.name),
        taskName: stringOrEmpty(task?.name),
        components,
        hazards,
        brokenTools,
        staminaSpent: run?.economyEvidence?.stamina?.spent ?? null,
        nodesRemaining: run?.economyEvidence?.node?.remaining ?? null
      }, this.localize);

      await ChatMessage.create({
        user: game.user?.id,
        speaker: ChatMessage.getSpeaker({ actor }),
        content
      });
    } catch (err) {
      console.error('Fabricate | Failed to post gathering chat message:', err);
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
        scope
      });
    } catch {
      // Reveal is advisory; never fail the attempt because of it.
    }
  }

  _resolveRevealPolicy(environment) {
    const rules = environment?.rules || {};
    return {
      policy: rules.revealPolicy ?? 'never',
      scope: rules.revealScope ?? 'actor'
    };
  }

  /**
   * Resolve the effective player-facing hazard visibility tier for a viewer.
   * GMs always see the full hazard information. For a non-GM viewer the tier is
   * read from the environment's gathering rules, defaulting to the more
   * restrictive `encounterChance` when absent or invalid so missing rules never
   * leak the full hazard list.
   *
   * @param {object} environment Composed gathering environment (carries `rules`).
   * @param {object} [viewer] Foundry user requesting the listing.
   * @returns {'dangerLevelOnly'|'encounterChance'|'full'} The effective tier.
   */
  _resolveHazardVisibility(environment, viewer) {
    if (viewer?.isGM === true) return 'full';
    const visibility = environment?.rules?.hazardVisibility;
    return GATHERING_HAZARD_VISIBILITIES.has(visibility) ? visibility : 'encounterChance';
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
    const cancellationPayload = {
      economyEvidence: opaqueBlind
        ? redactRichEvidence(run?.economyEvidence || {})
        : stripRuntimeSnapshotFromRun({ economyEvidence: run?.economyEvidence || {} }).economyEvidence
    };
    const cancelledRun = await this.runManager.cancelRun(actor, run.id, opaqueBlind
      ? {
          terminalRunData: {
            craftingSystemId: stringOrNull(run?.craftingSystemId),
            environmentId: stringOrNull(run?.environmentId),
            taskId: 'blind'
          },
          payload: {
            ...cancellationPayload,
            createdResults: [],
            usedTools: [],
            checkResult: { blind: true, status: 'cancelled' }
          }
        }
      : { payload: cancellationPayload });
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
      run: opaqueBlind ? redactBlindTerminalRun(cancelledRun) : stripRuntimeSnapshotFromRun(cancelledRun),
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
      gatheringSystems: this._gatheringSystemOptions([...activeRuns, ...history])
    };
  }

  _gatheringSystemOptions(models = []) {
    const systems = this._allSystems();
    const ids = Array.from(new Set(normalizeList(models)
      .map(model => stringOrNull(model?.craftingSystemId))
      .filter(Boolean)));
    return ids
      .map(id => {
        const system = systems.get(id);
        return {
          id,
          name: stringOrEmpty(system?.name) || stringOrEmpty(models.find(model => model?.craftingSystemId === id)?.craftingSystemName) || id
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

function normalizeToolResult(result) {
  if (result === true) return { available: true, missing: [], failedRequirements: [] };
  if (result === false || !result || typeof result !== 'object') {
    return { available: false, missing: [], failedRequirements: [] };
  }
  return {
    available: result.available === true,
    missing: normalizeList(result.missing),
    failedRequirements: normalizeList(result.failedRequirements)
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

  if (resolutionMode !== 'routed' && resolutionMode !== 'progressive' && resolutionMode !== 'd100') {
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
    const rows = normalizeList(task?.dropRows ?? task?.itemDrops).filter(row => row?.enabled !== false);
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

function stripRuntimeSnapshotFromRun(run) {
  if (!run || typeof run !== 'object') return run;
  const publicRun = cloneJson(run);
  if (publicRun.economyEvidence && typeof publicRun.economyEvidence === 'object') {
    delete publicRun.economyEvidence.runtimeSnapshot;
  }
  return publicRun;
}

function enrichPublicTerminalRun(run, { createdResults, usedTools = [], checkResult }) {
  if (!run || typeof run !== 'object') return run;
  const enriched = {
    ...run,
    createdResults,
    usedTools
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
  if (!snapshot?.rows && !snapshot?.hazards) return snapshot;
  return {
    rows: normalizeList(snapshot.rows).map(row => ({
      rowId: null,
      contributions: normalizeList(row?.contributions).map(entry => ({
        contribution: Number(entry?.contribution ?? 0)
      }))
    })),
    hazards: normalizeList(snapshot.hazards).map(hazard => ({
      hazardId: null,
      contributions: normalizeList(hazard?.contributions).map(entry => ({
        contribution: Number(entry?.contribution ?? 0)
      }))
    }))
  };
}

function redactRichEvidence(evidence = {}, _options = {}) {
  const redacted = cloneJson(evidence) || {};
  if (redacted.node) {
    redacted.node = { available: Number(redacted.node.remaining ?? redacted.node.current ?? 0) > 0 };
  }
  if (Array.isArray(redacted.hazards)) {
    redacted.hazards = redacted.hazards.map(() => ({ matched: true }));
  }
  if (redacted.characterModifierSnapshot && typeof redacted.characterModifierSnapshot === 'object') {
    redacted.characterModifierSnapshot = {
      rows: normalizeList(redacted.characterModifierSnapshot.rows).map(row => ({
        rowId: null,
        contributions: normalizeList(row?.contributions).map(entry => ({
          contribution: Number(entry?.contribution ?? 0)
        }))
      })),
      hazards: normalizeList(redacted.characterModifierSnapshot.hazards).map(hazard => ({
        hazardId: null,
        contributions: normalizeList(hazard?.contributions).map(entry => ({
          contribution: Number(entry?.contribution ?? 0)
        }))
      }))
    };
  }
  delete redacted.items;
  delete redacted.rolls;
  delete redacted.dropRows;
  delete redacted.selectedItems;
  delete redacted.selectedHazards;
  delete redacted.runtimeSnapshot;
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
    Object.values(plainObjectOrNull(environment?.conditions) || {}).some(value => stringOrNull(value)) ||
    task?.nodes ||
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

function normalizeStringList(value) {
  return Array.from(new Set(normalizeList(Array.isArray(value) ? value : (value ? [value] : []))
    .map(entry => stringOrEmpty(entry))
    .filter(Boolean)));
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

/**
 * Best-effort synchronous resolution of an item document by UUID, used only to
 * recover a display name/image when a gathered result or broken tool cannot be
 * matched to a system component. Returns null outside Foundry or on any error.
 */
function resolveItemDoc(uuid) {
  if (!uuid || typeof globalThis.fromUuidSync !== 'function') return null;
  try {
    return globalThis.fromUuidSync(uuid) ?? null;
  } catch (_err) {
    return null;
  }
}
