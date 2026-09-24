import { cloneJson } from '../utils/scalars.js';

import { stringOrNull } from './gatheringEngineInternals.js';
import { RunContainerManagerBase } from './runContainerStore.js';
import {
  observeExecutionJournal,
  persistExecutionJournalTransition,
  transitionExecutionJournal,
} from './runExecutionJournal.js';
import {
  historyEvidenceFields,
  itemReceipt,
  retainUncertainReceipt,
} from './runHistoryEvidence.js';
import {
  assertRunLifecycleMutation,
  buildNewRunLifecycleFields,
  getRunLifecycleContract,
  incrementRunRevision,
  persistCompletionMode,
  persistPausedRun,
  persistResumedRun,
  RunLifecycleError,
} from './runLifecycleState.js';
import { selectWritableActors } from './writableActors.js';

const HISTORY_LIMIT = 50;

/**
 * Manages actor-scoped crafting runs (active + history). The per-actor cache, baseline
 * snapshots, document-coherent persistence, and run getters live in
 * {@link RunContainerManagerBase}; this class adds the crafting-specific run lifecycle.
 */
export class CraftingRunManager extends RunContainerManagerBase {
  /**
   * `isPrimaryGM` gates the timed world-time resume (issue 656): `processWorldTime` runs on every
   * client off `updateWorldTime` and persists through `actor.setFlag`, a broadcast write. The
   * default `() => true` fails OPEN for fixtures, so `src/bootstrap/composeServices.js` wires the
   * real `activeGM` check (load-bearing).
   */
  constructor({ isPrimaryGM = () => true } = {}) {
    super({ flagKey: 'craftingRuns' });
    this._isPrimaryGM = typeof isPrimaryGM === 'function' ? isPrimaryGM : () => true;
  }

  /** A step's `timeRequirement` in seconds (0 when instant), so the engine can consume at START. */
  durationToSeconds(timeRequirement = null) {
    return this._durationToSeconds(timeRequirement);
  }

  /**
   * A step's authored component requirements `{ componentId, quantity }` from its first ingredient
   * set, snapshotted at run creation (issue 738) so a history entry survives a later edit or
   * deletion of the recipe; tag and essence requirements carry no component id. Names and images
   * resolve at projection time.
   */
  _buildStepRequirements(step) {
    const sets = Array.isArray(step?.ingredientSets) ? step.ingredientSets : [];
    const primary = sets[0];
    const ingredients = Array.isArray(primary?.ingredients) ? primary.ingredients : [];
    return ingredients
      .filter((ingredient) => ingredient?.componentId)
      .map((ingredient) => ({
        componentId: ingredient.componentId,
        quantity: Number(ingredient.quantity) || 1,
      }));
  }

  _buildStepStates(recipe) {
    const steps = recipe.getExecutionSteps();
    return steps.map((step, index) => ({
      stepId: step.id || foundry.utils.randomID(),
      stepName: step.name || `Step ${index + 1}`,
      index,
      requirements: this._buildStepRequirements(step),
      status: index === 0 ? 'inProgress' : 'pending',
      startedAt: index === 0 ? this._nowWorldTime() : undefined,
      updatedAt: this._nowWorldTime(),
      completedAt: undefined,
      timeGate: undefined,
      // The START-phase snapshot of a time-gated step, whose components and currency are consumed
      // when its gate arms; `markStepPrepared` writes it and the engine reads it at FINISH, the
      // source items being gone. `currencySpends` holds only SETTLED deductions (issue 902), the
      // cancel reversal's refund input; `essenceEnabled` is the behaviour-gate snapshot
      // (issue 1036).
      preparedConsumption: undefined,
      selectedIngredientSetId: undefined,
      lastCheckResult: undefined,
      consumedIngredients: [],
      usedTools: [],
      createdResults: [],
      failureReason: undefined,
    }));
  }

  findActiveRunForRecipe(actor, recipeId) {
    const runs = this.getActiveRuns(actor);
    return runs.find((run) => run.recipeId === recipeId) || null;
  }

  async createRun(actor, recipe, componentSourceActors = [], userId = null, lifecycle = {}) {
    const container = this._getContainer(actor);
    const runId = foundry.utils.randomID();
    const stepStates = this._buildStepStates(recipe);
    const lifecycleFields = buildNewRunLifecycleFields(lifecycle);
    const run = {
      id: runId,
      actorUuid: actor.uuid,
      userId: userId || game.user?.id || null,
      craftingSystemId: recipe.craftingSystemId,
      recipeId: recipe.id,
      status: 'inProgress',
      startedAt: this._nowWorldTime(),
      updatedAt: this._nowWorldTime(),
      finishedAt: undefined,
      currentStepIndex: 0,
      steps: stepStates,
      componentSourceActorUuids: componentSourceActors.map((a) => a.uuid),
      ...lifecycleFields,
    };

    container.active[runId] = run;
    await this._persist(actor, container);
    return run;
  }

  async updateRun(actor, run, { expectedRevision, executionOperationId = null } = {}) {
    const isCurrentLifecycle = getRunLifecycleContract(run) === 'current';
    if (isCurrentLifecycle) this.invalidateCache(actor.id);
    const container = this._getContainer(actor);
    const persistedRun = container.active[run.id];
    if (!persistedRun) return null;
    if (isCurrentLifecycle) {
      this._assertRunMutation(persistedRun, {
        expectedRevision: run.runRevision,
        executionOperationId,
      });
      if (expectedRevision !== undefined) {
        this._assertRunMutation(persistedRun, { expectedRevision, executionOperationId });
      }
    }
    this._assertRunMutation(run, { expectedRevision, executionOperationId });
    incrementRunRevision(run);
    run.updatedAt = this._nowWorldTime();
    container.active[run.id] = run;
    await this._persist(actor, container);
    return run;
  }

  async markStepWaitingForTime(actor, run, stepIndex, timeRequirement) {
    this._assertRunMutation(run);
    const seconds = this._durationToSeconds(timeRequirement);
    if (seconds <= 0) return run;

    const worldTime = this._nowWorldTime();
    const step = run.steps?.[stepIndex];
    if (!step) return run;
    if (step.timeGate?.availableAt && worldTime < step.timeGate.availableAt) {
      run.status = 'waitingTime';
      step.status = 'waitingTime';
      step.updatedAt = worldTime;
      await this.updateRun(actor, run);
      return run;
    }

    if (!step.timeGate) {
      step.timeGate = {
        requiredSeconds: seconds,
        initiatedAt: worldTime,
        availableAt: worldTime + seconds,
      };
    }
    run.status = 'waitingTime';
    step.status = 'waitingTime';
    step.updatedAt = worldTime;
    await this.updateRun(actor, run);
    return run;
  }

  /**
   * Persist the START-phase consumption snapshot of a time-gated step, which consumed its
   * components and currency when its gate armed and resumes at maturity without the deleted
   * source items. `currencySpends` records only what ACTUALLY SETTLED (issue 902), since the cancel
   * reversal refunds exactly that; `[]` records a deduction that settled nothing. `essenceEnabled`
   * (issue 1036) is a COMPLETE `{ [essenceId]: boolean }` map over `resolvedEssences`, `{}` when
   * nothing contributed, so a mid-run toggle cannot change a consumed craft; the engine reads an
   * ABSENT map as all-enabled. `buildPreparedConsumption` is a whitelist REBUILD: a new snapshot
   * field must be added there too, or the finish path silently falls back to live values. Answers
   * the run, or `null` for an invalid step index.
   */
  async markStepPrepared(actor, run, stepIndex, prepared = {}) {
    this._assertRunMutation(run);
    const step = run.steps?.[stepIndex];
    if (!step) return null;
    step.preparedConsumption = buildPreparedConsumption(prepared);
    step.selectedIngredientSetId = prepared.selectedIngredientSetId ?? step.selectedIngredientSetId;
    step.updatedAt = this._nowWorldTime();
    await this.updateRun(actor, run);
    return run;
  }

  /**
   * Arm the ONE summed gate of a COLLAPSED multi-step chain (issue 710) on step 0, with
   * `currentStepIndex` pinned to 0, so `processWorldTime` matures it like any timed run. Nothing is
   * consumed at arm: each step consumes when the chain executes at maturity. Re-arming is
   * idempotent on the gate and only re-marks the waiting status.
   */
  async armCollapsedChainGate(actor, run, seconds) {
    this._assertRunMutation(run);
    const total = Number(seconds);
    if (!Number.isFinite(total) || total <= 0) return run;
    const worldTime = this._nowWorldTime();
    const step = run.steps?.[0];
    if (!step) return run;
    if (!step.timeGate) {
      step.timeGate = {
        requiredSeconds: total,
        initiatedAt: worldTime,
        availableAt: worldTime + total,
        collapsedChain: true,
      };
    }
    run.status = 'waitingTime';
    run.currentStepIndex = 0;
    step.status = 'waitingTime';
    step.updatedAt = worldTime;
    await this.updateRun(actor, run);
    return run;
  }

  canProceedTimeGate(run, stepIndex, worldTime = this._nowWorldTime()) {
    if (getRunLifecycleContract(run) === 'unsupported' || run?.pauseState) return false;
    if (
      run?.executionJournal?.status !== undefined &&
      run.executionJournal.status !== 'committed'
    ) {
      return false;
    }
    const step = run.steps?.[stepIndex];
    if (!step?.timeGate) return true;
    return Number(worldTime) >= Number(step.timeGate.availableAt || 0);
  }

  async markStepInProgress(actor, run, stepIndex, options = {}) {
    this._assertRunMutation(run, options);
    const worldTime = this._nowWorldTime();
    const step = run.steps?.[stepIndex];
    if (!step) return run;
    run.status = 'inProgress';
    run.currentStepIndex = stepIndex;
    step.status = 'inProgress';
    step.startedAt ??= worldTime;
    step.updatedAt = worldTime;
    await this.updateRun(actor, run, options);
    return run;
  }

  async completeStepSuccess(actor, run, stepIndex, payload = {}, options = {}) {
    this._assertRunMutation(run, options);
    const worldTime = this._nowWorldTime();
    const step = run.steps?.[stepIndex];
    if (!step) return run;

    step.status = 'succeeded';
    step.updatedAt = worldTime;
    step.completedAt = worldTime;
    step.selectedIngredientSetId = payload.selectedIngredientSetId || step.selectedIngredientSetId;
    step.lastCheckResult = payload.lastCheckResult || step.lastCheckResult;
    step.consumedIngredients = payload.consumedIngredients || step.consumedIngredients || [];
    step.usedTools = payload.usedTools || step.usedTools || [];
    step.createdResults = payload.createdResults || step.createdResults || [];
    applyStepHistoryEvidence(step, payload);

    const nextIndex = stepIndex + 1;
    if (nextIndex >= (run.steps?.length || 0)) {
      return this.completeRun(actor, run, 'succeeded', options);
    }

    run.currentStepIndex = nextIndex;
    run.status = 'inProgress';
    const nextStep = run.steps[nextIndex];
    if (nextStep) {
      nextStep.status = 'inProgress';
      nextStep.startedAt ??= worldTime;
      nextStep.updatedAt = worldTime;
    }
    await this.updateRun(actor, run, options);
    return run;
  }

  async completeStepFailure(
    actor,
    run,
    stepIndex,
    reason = 'Crafting check failed',
    payload = {},
    options = {}
  ) {
    this._assertRunMutation(run, options);
    const worldTime = this._nowWorldTime();
    const step = run.steps?.[stepIndex];
    if (!step) return run;

    step.status = 'failed';
    step.updatedAt = worldTime;
    step.completedAt = worldTime;
    step.failureReason = reason;
    step.lastCheckResult = payload.lastCheckResult || step.lastCheckResult;
    step.selectedIngredientSetId = payload.selectedIngredientSetId || step.selectedIngredientSetId;
    step.consumedIngredients = payload.consumedIngredients || step.consumedIngredients || [];
    step.usedTools = payload.usedTools || step.usedTools || [];
    step.createdResults = payload.createdResults || step.createdResults || [];
    applyStepHistoryEvidence(step, payload);

    return this.completeRun(actor, run, 'failed', options);
  }

  async completeRun(actor, run, status = 'succeeded', options = {}) {
    if (options.executionOperationId) this.invalidateCache(actor.id);
    const container = this._getContainer(actor);
    const persistedRun = container.active?.[run.id];
    if (!persistedRun) return run;
    if (options.executionOperationId) {
      this._assertRunMutation(persistedRun, {
        ...options,
        expectedRevision: options.expectedRevision ?? run.runRevision,
      });
    }
    this._assertRunMutation(run, {
      ...options,
      allowPaused: status === 'cancelled',
    });

    run.status = status;
    run.currentStepIndex = null;
    run.updatedAt = this._nowWorldTime();
    run.finishedAt = this._nowWorldTime();
    incrementRunRevision(run);

    delete container.active[run.id];
    // A duplicate history id would crash the Journal's keyed each, so a run lingering in `active`
    // after its twin was recorded is never archived again.
    const alreadyArchived =
      Array.isArray(container.history) && container.history.some((entry) => entry?.id === run.id);
    if (alreadyArchived) {
      console.warn(
        `Fabricate | Crafting run "${run.id}" is already in history; removing it from active without archiving a duplicate.`
      );
    } else {
      container.history.unshift(run);
      if (container.history.length > HISTORY_LIMIT) {
        container.history = container.history.slice(0, HISTORY_LIMIT);
      }
    }
    await this._persist(actor, container);
    return run;
  }

  async cancelRun(actor, runId) {
    const run = this.getActiveRun(actor, runId);
    if (!run) return null;
    return this.completeRun(actor, run, 'cancelled');
  }

  /**
   * Discard an active run WITHOUT a history entry, for a run that never legitimately started (such
   * as a craft rejected before its check); `cancelRun` archives instead. `null` when not active.
   */
  async discardRun(actor, runId) {
    const container = this._getContainer(actor);
    const run = container.active?.[runId];
    if (!run) return null;
    this._assertRunMutation(run);
    delete container.active[runId];
    await this._persist(actor, container);
    return run;
  }

  /**
   * Discard a run whose start left NO EVIDENCE (no applied effect, no retained receipt): its
   * `recoveryRequired` would refuse every control, cancel included, so the player could never
   * clear it (issue 1648, F1). Separate from `discardRun`, which refuses a run under
   * reconciliation. `null` when absent or when it HAS evidence.
   */
  async discardUnappliedRun(actor, runId) {
    const container = this._getContainer(actor);
    const run = container.active?.[runId];
    if (!run) return null;
    const effects = run.executionJournal?.effects;
    if (
      Array.isArray(effects) &&
      effects.some((effect) => effect?.phase === 'applied' || effect?.receipt != null)
    ) {
      return null;
    }
    delete container.active[runId];
    await this._persist(actor, container);
    return run;
  }

  /**
   * Record a no-signature alchemy fizzle straight into history as a failed, recipe-less entry
   * (`recipeId: null`, `isFizzle: true`). Recording is UNCONDITIONAL:
   * `alchemy.showAttemptHistoryToPlayers` governs only its Journal visibility. It holds no recipe
   * or signature data, so it can never leak an undiscovered recipe.
   */
  async recordFizzle(actor, { craftingSystemId = null, userId = null, ...evidence } = {}) {
    const container = this._getContainer(actor);
    const now = this._nowWorldTime();
    const entry = {
      id: foundry.utils.randomID(),
      actorUuid: actor.uuid,
      userId: userId || game.user?.id || null,
      craftingSystemId: craftingSystemId ?? null,
      recipeId: null,
      isFizzle: true,
      status: 'failed',
      startedAt: now,
      updatedAt: now,
      finishedAt: now,
      currentStepIndex: null,
      steps: [],
      ...historyEvidenceFields(evidence),
      ...(Array.isArray(evidence.consumedIngredients) && {
        consumedIngredients: evidence.consumedIngredients.map(itemReceipt),
      }),
      ...(Array.isArray(evidence.createdResults) && {
        createdResults: evidence.createdResults.map(itemReceipt),
      }),
    };
    container.history.unshift(entry);
    if (container.history.length > HISTORY_LIMIT) {
      container.history = container.history.slice(0, HISTORY_LIMIT);
    }
    await this._persist(actor, container);
    return entry;
  }

  async planVersionedFizzle(
    actor,
    {
      craftingSystemId = null,
      userId = null,
      componentSourceActorUuids = [],
      operationId,
      requestId,
      effects = [],
    } = {}
  ) {
    this.invalidateCache(actor.id);
    const container = this._getContainer(actor);
    const duplicate = (container.history || []).find(
      (run) =>
        getRunLifecycleContract(run) === 'current' &&
        run?.isFizzle === true &&
        run?.executionJournal?.requestId === String(requestId ?? '').trim()
    );
    if (duplicate) return duplicate;
    const now = this._nowWorldTime();
    const entry = {
      id: foundry.utils.randomID(),
      actorUuid: actor.uuid,
      userId: userId || game.user?.id || null,
      craftingSystemId: craftingSystemId ?? null,
      recipeId: null,
      isFizzle: true,
      activityKind: 'alchemy',
      resolutionSnapshot: { kind: 'none', mode: 'alchemy' },
      status: 'failed',
      startedAt: now,
      updatedAt: now,
      finishedAt: now,
      currentStepIndex: null,
      steps: [],
      componentSourceActorUuids: [...componentSourceActorUuids],
      ...buildNewRunLifecycleFields({ lifecycleVersion: 1, completionMode: 'manual' }),
    };
    entry.executionJournal = transitionExecutionJournal(undefined, {
      type: 'plan',
      plan: {
        operationId,
        requestId,
        baseRunRevision: entry.runRevision,
        intent: { activityKind: 'alchemy', craftingSystemId },
        effects,
      },
    });
    container.history.unshift(entry);
    if (container.history.length > HISTORY_LIMIT) container.history.length = HISTORY_LIMIT;
    await this._persist(actor, container);
    return entry;
  }

  async processWorldTime(worldTime = this._nowWorldTime()) {
    // Timed resume only (issue 656): flipping `waitingTime` to `inProgress` persists through a
    // broadcast `actor.setFlag`, so only the primary GM writes, and players emit no swallowed
    // permission errors per actor per tick.
    if (this._isPrimaryGM() !== true) return;
    for (const actor of game.actors || []) {
      const container = this._getContainer(actor);
      let dirty = false;

      for (const run of Object.values(container.active || {})) {
        const step = this._maturedWaitingStep(run, worldTime);
        if (!step) continue;

        run.status = 'inProgress';
        step.status = 'inProgress';
        step.updatedAt = Number(worldTime);
        run.updatedAt = Number(worldTime);
        incrementRunRevision(run);
        dirty = true;
      }

      if (dirty) {
        await this._persist(actor, container);
      }
    }
  }

  _maturedWaitingStep(run, worldTime) {
    if (run.status !== 'waitingTime') return null;
    if (getRunLifecycleContract(run) !== 'legacy') return null;
    if (run.pauseState) return null;
    if (run.executionJournal && run.executionJournal.status !== 'committed') return null;
    const index = Number(run.currentStepIndex);
    if (!Number.isFinite(index)) return null;
    const step = run.steps?.[index];
    if (!step?.timeGate) return null;
    if (Number(worldTime) < Number(step.timeGate.availableAt || 0)) return null;
    return step;
  }

  listDueVersionedRuns(worldTime = this._nowWorldTime()) {
    const due = [];
    for (const actor of game.actors || []) {
      this.invalidateCache(actor.id);
      const container = this._getContainer(actor);
      for (const run of Object.values(container.active || {})) {
        if (!this._dueVersionedStep(run, worldTime)) continue;
        const currentStepIndex = Number(run.currentStepIndex);
        due.push({
          actor,
          runId: run.id,
          expectedRevision: run.runRevision,
          componentSourceActorUuids: [...(run.componentSourceActorUuids || [])],
          maximumAttempts: Math.max(1, (run.steps?.length || 0) - currentStepIndex),
        });
      }
    }
    return due;
  }

  _dueVersionedStep(run, worldTime) {
    if (getRunLifecycleContract(run) !== 'current') return null;
    if (run.status !== 'waitingTime' || run.completionMode !== 'worldTime' || run.pauseState) {
      return null;
    }
    if (run.executionJournal && run.executionJournal.status !== 'committed') return null;
    const index = Number(run.currentStepIndex);
    if (!Number.isSafeInteger(index)) return null;
    const step = run.steps?.[index];
    if (!step?.timeGate || Number(worldTime) < Number(step.timeGate.availableAt || 0)) return null;
    return step;
  }

  async setCompletionMode(actor, runId, completionMode, { expectedRevision } = {}) {
    return persistCompletionMode(this._locateRunPersistence(actor, runId), completionMode, {
      expectedRevision,
    });
  }

  async pauseRun(actor, runId, { expectedRevision } = {}) {
    return persistPausedRun(this._locateRunPersistence(actor, runId), { expectedRevision });
  }

  async resumeRun(actor, runId, { expectedRevision } = {}) {
    return persistResumedRun(this._locateRunPersistence(actor, runId), { expectedRevision });
  }

  async setStepSelectionPlan(actor, runId, stepIndex, selection = {}, { expectedRevision } = {}) {
    const location = this._locateRunPersistence(actor, runId);
    if (!location) return null;
    const run = location.run;
    this._assertRunMutation(run, { currentOnly: true, expectedRevision });
    const index = Number(stepIndex);
    const step = run.steps?.[index];
    if (!step || index !== Number(run.currentStepIndex)) {
      throw new RunLifecycleError(
        'Selections may only change on the current crafting step',
        'STALE_RUN_STAGE'
      );
    }
    if (step.preparedConsumption) {
      throw new RunLifecycleError(
        'The crafting stage selection was locked when the stage started',
        'SELECTION_LOCKED'
      );
    }
    applyStepSelection(step, selection);
    step.updatedAt = this._nowWorldTime();
    incrementRunRevision(run);
    return location.persist();
  }

  /**
   * Commit a versioned stage START in ONE write (D-026/D-028): lock the selection (as
   * `setStepSelectionPlan`), record what the stage consumed (as `markStepPrepared`) and arm its
   * time gate. The persisted plan is then authoritative and the inputs are spent. `null` for an
   * invalid step index.
   */
  async markStepStarted(actor, run, stepIndex, started = {}, options = {}) {
    this._assertRunMutation(run, options);
    const step = run.steps?.[stepIndex];
    if (!step) return null;
    applyStepSelection(step, started.selection ?? {});
    step.preparedConsumption = buildPreparedConsumption(started.prepared ?? {});
    const worldTime = this._nowWorldTime();
    const seconds = Math.max(0, Number(started.requiredSeconds) || 0);
    if (seconds > 0) {
      step.timeGate ??= {
        requiredSeconds: seconds,
        initiatedAt: worldTime,
        availableAt: worldTime + seconds,
      };
      run.status = 'waitingTime';
      step.status = 'waitingTime';
    }
    step.updatedAt = worldTime;
    await this.updateRun(actor, run, options);
    return run;
  }

  async updateExecutionJournal(actor, runId, transition, { expectedRevision } = {}) {
    return persistExecutionJournalTransition(
      this._locateRunPersistence(actor, runId, { activeOnly: false }),
      transition,
      { expectedRevision }
    );
  }

  async retainUncertainReceipt(actor, runId, effectId, receipts, options) {
    return retainUncertainReceipt(
      this._locateRunPersistence(actor, runId, { activeOnly: false }),
      effectId,
      receipts,
      options
    );
  }

  async reconstructVersionedExecutions({ operationId = null, orphaned = false } = {}) {
    const normalizedOperationId = String(operationId ?? '').trim();
    const operationScope = normalizedOperationId.length > 0;
    if (operationScope === (orphaned === true)) {
      throw new RunLifecycleError(
        'Execution reconstruction requires exactly one authority recovery scope',
        'INVALID_RECOVERY_SCOPE'
      );
    }

    const candidates = [];
    for (const actor of selectWritableActors(game.actors)) {
      this.invalidateCache(actor.id);
      const container = this._getContainer(actor);
      const runs = [
        ...Object.values(container.active || {}),
        ...(Array.isArray(container.history) ? container.history : []),
      ];
      for (const run of runs) {
        if (getRunLifecycleContract(run) !== 'current' || !run?.executionJournal) continue;
        const journal = observeExecutionJournal(run.executionJournal);
        if (operationScope && journal.operationId !== normalizedOperationId) continue;
        if (
          journal.status !== 'planned' ||
          journal.effects.every((effect) => effect.phase !== 'applying')
        ) {
          continue;
        }
        candidates.push({ actor, runId: run.id, expectedRevision: run.runRevision });
      }
    }

    const runs = [];
    for (const candidate of candidates) {
      const reconstructed = await this.updateExecutionJournal(
        candidate.actor,
        candidate.runId,
        { type: 'reconstructAfterReload' },
        { expectedRevision: candidate.expectedRevision }
      );
      if (!reconstructed) {
        throw new RunLifecycleError(
          'An execution disappeared during recovery reconstruction',
          'STALE_RUN_REVISION'
        );
      }
      runs.push({
        actorUuid: candidate.actor.uuid,
        runId: reconstructed.id,
        status: reconstructed.status,
        runRevision: reconstructed.runRevision,
        journalStatus: reconstructed.executionJournal.status,
      });
    }

    return {
      success: true,
      scope: operationScope ? 'operation' : 'orphaned',
      operationId: operationScope ? normalizedOperationId : null,
      inspected: candidates.length,
      reconstructed: runs.length,
      runs,
    };
  }

  _locateRunPersistence(actor, runId, { activeOnly = true } = {}) {
    this.invalidateCache(actor.id);
    const container = cloneJson(this._getContainer(actor));
    const location = findRunLocation(container, runId);
    if (!location || (activeOnly && location.terminal)) return null;
    const run = location.run;
    const currentStep = () => {
      const index = Number(run.currentStepIndex);
      return Number.isSafeInteger(index) ? run.steps?.[index] : null;
    };
    return {
      run,
      now: () => this._nowWorldTime(),
      getTimeGate: () => currentStep()?.timeGate || null,
      touchTimeGate: () => {
        const step = currentStep();
        if (step) step.updatedAt = this._nowWorldTime();
      },
      assertMutation: (options) => this._assertRunMutation(run, options),
      persist: async () => {
        run.updatedAt = this._nowWorldTime();
        await this._persist(actor, container);
        return run;
      },
    };
  }

  _assertRunMutation(
    run,
    { allowExecutionJournal = false, executionOperationId = null, ...options } = {}
  ) {
    assertRunLifecycleMutation(run, options);
    if (!run?.executionJournal) return;
    const journal = observeExecutionJournal(run.executionJournal);
    if (!allowExecutionJournal && journal.status === 'planned') {
      if (executionOperationId) {
        if (journal.operationId === String(executionOperationId)) return;
        throw new RunLifecycleError(
          'The execution operation does not own this run',
          'EXECUTION_OPERATION_MISMATCH'
        );
      }
      throw new RunLifecycleError(
        'The run already has an execution in progress',
        'EXECUTION_IN_PROGRESS'
      );
    }
  }

  async removeRunsForSystem(systemId) {
    if (!systemId) return;
    const target = String(systemId);
    for (const actor of game.actors || []) {
      const container = this._getContainer(actor);
      let dirty = false;

      for (const [runId, run] of Object.entries(container.active || {})) {
        if (getRunLifecycleContract(run) === 'unsupported') continue;
        if (run?.craftingSystemId !== target) continue;
        delete container.active[runId];
        dirty = true;
      }

      const nextHistory = (container.history || []).filter(
        (run) => getRunLifecycleContract(run) === 'unsupported' || run?.craftingSystemId !== target
      );
      if (nextHistory.length !== (container.history || []).length) {
        container.history = nextHistory;
        dirty = true;
      }

      if (dirty) {
        await this._persist(actor, container);
      }
    }
  }

  /**
   * The shared walk of the two prunes below: drop what `dropActiveRun` rejects and keep the history
   * `keepHistoryEntry` accepts, persisting only a dirty container. Scoped to the actors THIS client
   * may write (issue 970): `cleanupInvalidRuns` runs on every client at `initialize()`, and one
   * stale entry on another player's character would otherwise reject the whole startup.
   */
  async _pruneRunsAcrossWritableActors({ dropActiveRun, keepHistoryEntry }) {
    for (const actor of selectWritableActors(game.actors)) {
      const container = this._getContainer(actor);
      let dirty = false;

      for (const [runId, run] of Object.entries(container.active || {})) {
        if (getRunLifecycleContract(run) === 'unsupported') continue;
        if (!dropActiveRun(run)) continue;
        delete container.active[runId];
        dirty = true;
      }

      const nextHistory = (container.history || []).filter(
        (run) => getRunLifecycleContract(run) === 'unsupported' || keepHistoryEntry(run)
      );
      if (nextHistory.length !== (container.history || []).length) {
        container.history = nextHistory;
        dirty = true;
      }

      if (dirty) {
        await this._persist(actor, container);
      }
    }
  }

  /**
   * The CORPUS-DERIVED prune: drop active runs and history entries naming a recipe or
   * crafting system that is not in the live corpus.
   *
   * It infers a deletion from an ABSENCE, so it is only safe against a known-complete
   * **Valid Id Basis** (`data-models/spec.md` § Valid Id Basis). Both of its callers gate
   * it — `startupPassComposition.js` at boot and `mutationCleanupComposition.js` after a
   * GM's delete — and neither should be bypassed by calling this directly.
   */
  async cleanupInvalidRuns(validRecipeIds = new Set(), validSystemIds = new Set()) {
    const systemValid = (run) =>
      Boolean(run?.craftingSystemId) && validSystemIds.has(run.craftingSystemId);
    const recipeValid = (run) => Boolean(run?.recipeId) && validRecipeIds.has(run.recipeId);
    await this._pruneRunsAcrossWritableActors({
      dropActiveRun: (run) => !(recipeValid(run) && systemValid(run)),
      // A no-signature fizzle is recipe-less by design; keep it while its system
      // is valid rather than pruning it as an unknown-recipe run.
      keepHistoryEntry: (run) =>
        run?.isFizzle ? systemValid(run) : recipeValid(run) && systemValid(run),
    });
  }

  /**
   * The SUBJECT-TARGETED prune (issue 1226): drop runs and history naming a recipe the caller just
   * deleted, the mutation-time gate's fallback for `cleanupInvalidRuns`. The ids are positively
   * gone, so no Valid Id Basis is needed, and a record never read is never named. A recipe-less
   * fizzle names nothing, so it is never matched.
   */
  async removeRunsForRecipes(recipeIds) {
    const targets = new Set(
      [...(recipeIds || [])].map((id) => String(id ?? '').trim()).filter(Boolean)
    );
    if (targets.size === 0) return;
    const namesDeletedRecipe = (run) => Boolean(run?.recipeId) && targets.has(String(run.recipeId));
    await this._pruneRunsAcrossWritableActors({
      dropActiveRun: namesDeletedRecipe,
      keepHistoryEntry: (run) => !namesDeletedRecipe(run),
    });
  }

  /**
   * Prune legacy phantom active runs: an unversioned run of a single-step recipe whose one step has
   * no time requirement can never legitimately stay active, so it was stranded by an old early
   * return. Multi-step and time-gated recipes, and current-version runs (which may await manual
   * completion), are never pruned; an unknown recipe is left to `cleanupInvalidRuns`. Scoped to the
   * actors this client may write (issue 970). Answers the number pruned.
   */
  async pruneInstantaneousActiveRuns(resolveRecipe) {
    if (typeof resolveRecipe !== 'function') return 0;
    let pruned = 0;
    for (const actor of selectWritableActors(game.actors)) {
      const container = this._getContainer(actor);
      let dirty = false;

      for (const [runId, run] of Object.entries(container.active || {})) {
        if (getRunLifecycleContract(run) !== 'legacy') continue;
        if (run.steps?.some((step) => step.historySettlement)) continue;
        const recipe = run?.recipeId ? resolveRecipe(run.recipeId) : null;
        if (!recipe) continue;
        const steps =
          typeof recipe.getExecutionSteps === 'function' ? recipe.getExecutionSteps() : [];
        if (steps.length === 1 && !steps[0]?.timeRequirement) {
          delete container.active[runId];
          dirty = true;
          pruned += 1;
        }
      }

      if (dirty) {
        await this._persist(actor, container);
      }
    }
    return pruned;
  }
}

/**
 * Rebuild `preparedConsumption` from a caller snapshot. A WHITELIST: a new field must be added
 * here as well as at the call site, or the resume falls back to live values. `consumedSnapshots`
 * carries the versioned rehydration detail; `consumedSummary` stays the cancel reversal's input.
 */
function buildPreparedConsumption(prepared = {}) {
  const value = {
    selectedIngredientSetId: prepared.selectedIngredientSetId ?? null,
    // SETTLED spends only — see the note on markStepPrepared.
    currencySpends: Array.isArray(prepared.currencySpends) ? prepared.currencySpends : [],
    resolvedEssences:
      prepared.resolvedEssences && typeof prepared.resolvedEssences === 'object'
        ? prepared.resolvedEssences
        : {},
    essenceEnabled:
      prepared.essenceEnabled && typeof prepared.essenceEnabled === 'object'
        ? prepared.essenceEnabled
        : {},
    consumedSummary: Array.isArray(prepared.consumedSummary) ? prepared.consumedSummary : [],
  };
  if (Array.isArray(prepared.consumedSnapshots)) {
    value.consumedSnapshots = cloneJson(prepared.consumedSnapshots);
  }
  const evidence = craftingStepHistoryEvidence(prepared);
  if (evidence.essenceSpend) value.essenceSpend = evidence.essenceSpend;
  return value;
}

/**
 * Apply an authored selection to a step, refusing a plan whose authored snapshot does not match
 * the route it names; shared by the pre-start edit and the stage-start lock.
 */
function applyStepSelection(step, selection) {
  // Authority callers supply authored evidence. Validate and clone both values
  // before touching the live container so a refused edit cannot leak into it.
  const plan = buildSelectionPlan(selection);
  const snapshot = cloneJson(
    selection.selectedRequirementSnapshot ?? step.selectedRequirementSnapshot
  );
  if (!snapshot || stringOrNull(snapshot.id) !== plan.selectedIngredientSetId) {
    throw new RunLifecycleError(
      'The selected crafting route requires its matching authored snapshot',
      'INVALID_SELECTION_SNAPSHOT'
    );
  }
  step.selectionPlan = plan;
  step.selectedIngredientSetId = plan.selectedIngredientSetId;
  step.selectedRequirementSnapshot = snapshot;
  const evidence = craftingStepHistoryEvidence(selection);
  if (!step.presentationSnapshot && evidence.presentationSnapshot) {
    step.presentationSnapshot = evidence.presentationSnapshot;
  }
  if (evidence.resolutionSnapshot) step.resolutionSnapshot = evidence.resolutionSnapshot;
}

function buildSelectionPlan(selection) {
  return {
    selectedIngredientSetId: stringOrNull(selection.selectedIngredientSetId),
    ingredientOptionOverrides: cloneObject(selection.ingredientOptionOverrides),
    ingredientEssenceAllocation: cloneObject(selection.ingredientEssenceAllocation),
  };
}

/**
 * Allowlist optional historical stage evidence before it enters an actor flag or an execution
 * receipt. Callers own initiating-viewer disclosure; absent evidence stays absent, and a captured
 * empty array stays an explicit zero.
 */
export function craftingStepHistoryEvidence(input = {}) {
  const source = input ?? {};
  const evidence = {};
  const resolution = source.resolutionSnapshot;
  if (
    ['check', 'ingredients', 'none'].includes(resolution?.kind) &&
    typeof resolution.mode === 'string'
  ) {
    evidence.resolutionSnapshot = { kind: resolution.kind, mode: resolution.mode };
  }
  const presentation = source.presentationSnapshot;
  if (typeof presentation?.name === 'string' && typeof presentation.description === 'string') {
    evidence.presentationSnapshot = {
      name: presentation.name,
      description: presentation.description,
    };
  }
  if (Array.isArray(source.currencySpends) && source.currencySpends.every(validHistoricalSpend)) {
    evidence.currencySpends = source.currencySpends.map(({ unit, amount }) => ({ unit, amount }));
  }
  if (
    Array.isArray(source.essenceSpend?.carriers) &&
    source.essenceSpend.carriers.every(validHistoricalCarrier)
  ) {
    evidence.essenceSpend = {
      labels: Object.fromEntries(
        Object.entries(source.essenceSpend.labels ?? {}).filter(
          ([, label]) => typeof label === 'string'
        )
      ),
      carriers: source.essenceSpend.carriers.map(historicalCarrier),
    };
  }
  return evidence;
}

function validHistoricalCarrier(carrier) {
  return (
    typeof carrier?.itemUuid === 'string' &&
    carrier.itemUuid.length > 0 &&
    Number.isFinite(carrier.quantity) &&
    carrier.quantity > 0 &&
    Array.isArray(carrier.contributions) &&
    carrier.contributions.every(validHistoricalContribution)
  );
}

function validHistoricalSpend(entry) {
  return typeof entry?.unit === 'string' && Number.isFinite(entry.amount) && entry.amount >= 0;
}

function validHistoricalContribution(entry) {
  return typeof entry?.essenceId === 'string' && Number.isFinite(entry.amount) && entry.amount > 0;
}

function historicalCarrier(carrier) {
  return {
    actorUuid: historyText(carrier.actorUuid),
    itemUuid: carrier.itemUuid,
    quantity: carrier.quantity,
    name: historyText(carrier.name),
    img: historyText(carrier.img),
    contributions: carrier.contributions.map(({ essenceId, amount }) => ({ essenceId, amount })),
  };
}

function historyText(value) {
  return typeof value === 'string' ? value.trim() || null : null;
}

function applyStepHistoryEvidence(step, payload) {
  const evidence = craftingStepHistoryEvidence(payload);
  if (step.presentationSnapshot) delete evidence.presentationSnapshot;
  Object.assign(step, evidence);
  Object.assign(step, historyEvidenceFields(payload));
  for (const field of ['consumedIngredients', 'createdResults']) {
    if (Array.isArray(step[field])) step[field] = step[field].map(itemReceipt);
  }
  if (step.historySettlement && ['succeeded', 'failed'].includes(step.status)) {
    step.historySettlement = {
      ...step.historySettlement,
      awards: payload.historySettlement?.awards ?? 'complete',
    };
  }
}

function cloneObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? cloneJson(value) : {};
}

function findRunLocation(container, runId) {
  const id = String(runId ?? '').trim();
  if (!id) return null;
  if (container.active?.[id]) return { run: container.active[id], terminal: false };
  const run = (container.history || []).find((entry) => entry?.id === id);
  return run ? { run, terminal: true } : null;
}
