import { RunContainerManagerBase } from './runContainerStore.js';
import {
  observeExecutionJournal,
  persistExecutionJournalTransition,
  transitionExecutionJournal,
} from './runExecutionJournal.js';
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
   * @param {object} [deps]
   * @param {() => boolean} [deps.isPrimaryGM] Primary-GM gate for the timed
   *   world-time resume path (issue 656). `processWorldTime` runs off the synced
   *   `updateWorldTime` hook and flips a matured `waitingTime` step to `inProgress`,
   *   then persists via `_persist` → `actor.setFlag(...)` — a broadcast document write
   *   on every connected client (duplicate racing writes + player permission-denied
   *   noise). The default `() => true` keeps unit fixtures (which build no `activeGM`)
   *   resuming; because it fails OPEN, the real `game.users.activeGM?.id ===
   *   game.user?.id` check is WIRED at construction in `main.js` (load-bearing).
   */
  constructor({ isPrimaryGM = () => true } = {}) {
    super({ flagKey: 'craftingRuns' });
    this._isPrimaryGM = typeof isPrimaryGM === 'function' ? isPrimaryGM : () => true;
  }

  /**
   * Public accessor for the number of seconds a step's `timeRequirement`
   * resolves to. The crafting engine uses this to decide whether a step is
   * genuinely time-gated (> 0 seconds) BEFORE arming a gate, so it can consume
   * components at START rather than at FINISH.
   * @param {object|null} timeRequirement
   * @returns {number} seconds (0 for an empty / instant requirement)
   */
  durationToSeconds(timeRequirement = null) {
    return this._durationToSeconds(timeRequirement);
  }

  /**
   * Snapshot a step's authored ingredient requirements (component id + quantity)
   * at run creation (issue 738). Persisting the requirements — rather than resolving
   * them live from the recipe at Journal-projection time — keeps a history entry's
   * requirements intact after the recipe is later edited or deleted (a deleted recipe
   * otherwise redacts the whole run). Only component-backed ingredients are captured
   * (tag / essence requirements carry no component id); the primary (first) ingredient
   * set is used, mirroring how the crafting UI surfaces a step's requirements. Names
   * and images are resolved at projection time from the still-live crafting system's
   * components, so only the stable ids are stored here.
   *
   * @param {object} step An execution step (`recipe.getExecutionSteps()` entry).
   * @returns {Array<{componentId: string, quantity: number}>}
   * @private
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
      // preparedConsumption: the START-phase snapshot for a time-gated step whose
      // components (and currency) are consumed when the gate is ARMED. Populated
      // by markStepPrepared; read by the engine at FINISH so the resume can
      // transfer essences and build results/chat/history without re-reading the
      // (now-deleted) source items. Undefined for non-timed / instant steps.
      // Its `currencySpends` holds the SETTLED deductions only (issue 902), because the
      // cancel reversal refunds exactly what it finds there, and its `essenceEnabled`
      // holds the START-phase behaviour-gate snapshot (issue 1036).
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
   * Persist the START-phase consumption snapshot for a time-gated step.
   *
   * A step whose time requirement resolves to > 0 seconds consumes its
   * components (and currency) when its gate is ARMED, then resumes at maturity to
   * run the crafting check and create results. This stores what was consumed so
   * the resume can transfer essences and build the result / chat / history entry
   * without re-reading the source items (which are already deleted).
   *
   * `currencySpends` records what the deduction ACTUALLY SETTLED, never what was intended
   * (issue 902). It is the sole input to the cancel reversal's refund, so a spend that did
   * not settle must not appear here — otherwise cancelling hands back currency the actor
   * never paid. An empty array is the correct record for a step whose currency deduction
   * settled nothing, and the reversal's own `length > 0` guard then skips the refund.
   *
   * `essenceEnabled` is the START-phase behaviour-gate snapshot (issue 1036): a COMPLETE
   * `{ [essenceId]: boolean }` map over every key in `resolvedEssences`, so a mid-run
   * enable/disable cannot change the outcome of a craft whose inputs are already
   * consumed. It is `{}` — not absent — when nothing contributed, and the engine reads an
   * ABSENT map (a run armed before this change) as all-enabled.
   *
   * **This literal is a whitelist REBUILD.** It emits exactly the keys named below and
   * silently drops anything else the call site passes, so a new snapshot field must be
   * added HERE as well as at the call site or the finish path falls back to live values
   * and the defect ships green.
   *
   * @param {Actor} actor
   * @param {object} run
   * @param {number} stepIndex
   * @param {{ selectedIngredientSetId?: string|null,
   *   currencySpends?: Array<{unit: string, amount: number}>,
   *   resolvedEssences?: object, essenceEnabled?: Record<string, boolean>,
   *   consumedSummary?: Array }} prepared
   * @returns {Promise<object|null>} the updated run, or null if the step index is invalid
   */
  async markStepPrepared(actor, run, stepIndex, prepared = {}) {
    this._assertRunMutation(run);
    const step = run.steps?.[stepIndex];
    if (!step) return null;
    step.preparedConsumption = {
      selectedIngredientSetId: prepared.selectedIngredientSetId ?? null,
      // SETTLED spends only — see the note above.
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
    step.selectedIngredientSetId = prepared.selectedIngredientSetId ?? step.selectedIngredientSetId;
    step.updatedAt = this._nowWorldTime();
    await this.updateRun(actor, run);
    return run;
  }

  /**
   * Arm the single summed time gate for a COLLAPSED multi-step chain (issue 710).
   *
   * When a system's multi-step feature is off, a recipe that still carries authored
   * steps runs as one atomic action; instead of arming a gate per step, the engine
   * sums every step's duration and arms ONE gate here, stored on step 0 (with
   * `currentStepIndex` pinned to 0) so the generic `processWorldTime` resume path —
   * which reads `run.steps[run.currentStepIndex].timeGate` — matures it exactly like
   * any other timed run. Nothing is consumed at arm: the chain consumes each step's
   * ingredients when it executes at maturity. Re-arming an already-armed gate is a
   * no-op on the gate itself (idempotent), it only re-marks the waiting status.
   *
   * @param {Actor} actor
   * @param {object} run
   * @param {number} seconds Total summed duration in seconds (> 0).
   * @returns {Promise<object>} the updated run
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
    // Never archive a run that already has a history entry: a duplicate id would
    // crash the Journal's keyed each. This can happen if a run lingered in `active`
    // (a legacy zombie) after a twin was already recorded in history.
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
   * Discard an active run WITHOUT recording it in history — for a run that was
   * created but never legitimately started (e.g. a craft rejected before its check
   * ran, such as insufficient components). Unlike {@link cancelRun}, which archives
   * to history as `cancelled`, this leaves no trace: the attempt never began.
   *
   * @param {Actor} actor
   * @param {string} runId
   * @returns {Promise<object|null>} the discarded run, or null if not active
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
   * Record a no-signature alchemy fizzle as a failed, recipe-less run-history
   * entry. A fizzle matches NO enabled recipe, so the entry carries
   * `recipeId: null` and `isFizzle: true` and never enters the `active`
   * container — it is archived straight to history. Recording is UNCONDITIONAL:
   * the `alchemy.showAttemptHistoryToPlayers` flag governs player VISIBILITY at
   * the Journal projection (see {@link RunJournalBuilder}), never whether the
   * attempt is recorded. The entry holds no recipe or signature data, so it can
   * never leak an undiscovered recipe.
   *
   * @param {Actor} actor
   * @param {object} [details]
   * @param {string|null} [details.craftingSystemId]
   * @param {string|null} [details.userId]
   * @returns {Promise<object>} the recorded fizzle history entry
   */
  async recordFizzle(actor, { craftingSystemId = null, userId = null } = {}) {
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
    // Timed resume only (issue 656): driven from the synced updateWorldTime hook, and
    // flipping waitingTime→inProgress triggers _persist → actor.setFlag, a broadcast
    // document write. Gate to the primary GM so exactly one client performs the write
    // and players don't emit swallowed permission-denied errors per actor per tick.
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
        due.push({
          actor,
          runId: run.id,
          expectedRevision: run.runRevision,
          componentSourceActorUuids: [...(run.componentSourceActorUuids || [])],
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
    step.selectionPlan = buildSelectionPlan(selection);
    step.selectedIngredientSetId = step.selectionPlan.selectedIngredientSetId;
    if (selection.selectedRequirementSnapshot !== undefined) {
      step.selectedRequirementSnapshot = cloneJson(selection.selectedRequirementSnapshot);
    }
    step.updatedAt = this._nowWorldTime();
    incrementRunRevision(run);
    return location.persist();
  }

  async updateExecutionJournal(actor, runId, transition, { expectedRevision } = {}) {
    return persistExecutionJournalTransition(
      this._locateRunPersistence(actor, runId, { activeOnly: false }),
      transition,
      { expectedRevision }
    );
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
   * Walk the runs this client may write and drop the ones a caller's predicates reject.
   *
   * The shared body of the two prunes below, which differ only in what they consider
   * droppable. Kept as one walk because the walk itself carries three easily-lost
   * properties — the writable-actor scoping, the "persist only when dirty" rule, and the
   * separate active/history treatment — and a second hand-written copy is where those
   * diverge.
   *
   * Scoped to the actors THIS client may write (issue 970). `cleanupInvalidRuns` runs on
   * every client at `initialize()`, and a player owns only their own characters, so an
   * un-filtered walk made a single stale entry on someone else's character reject the whole
   * startup sequence.
   *
   * @param {object} predicates
   * @param {(run: object) => boolean} predicates.dropActiveRun
   * @param {(run: object) => boolean} predicates.keepHistoryEntry
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
   * The SUBJECT-TARGETED prune: drop active runs and history entries naming one of the
   * recipes the caller has just deleted (issue 1226).
   *
   * The recipe-shaped sibling of {@link removeRunsForSystem}, and the fallback the
   * mutation-time gate runs in `cleanupInvalidRuns`'s place when the corpus cannot be
   * attested complete. It needs no Valid Id Basis: the ids are positively known to be gone
   * because the caller removed them, and a corpus missing records cannot make a deleted id
   * valid again. A record that was never read is simply not named here and survives, which
   * is the whole difference from the sweep above.
   *
   * A recipe-less fizzle names nothing and is therefore never matched.
   *
   * @param {Iterable<string>} recipeIds
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
   * Prune legacy phantom active runs: a crafting run whose recipe is single-step
   * AND whose only step has no time requirement can never legitimately persist as
   * active (it only ever rejects, fails, or succeeds atomically), so any such run
   * left in the active container is a phantom stranded by an old pre-validation
   * early-return. Multi-step recipes (persist between "Trigger Next Step") and
   * single-step time-gated recipes (persist a waiting run) are excluded.
   *
   * Unknown recipes are left alone here — {@link cleanupInvalidRuns} owns those.
   *
   * Scoped to the actors THIS client may write, for the reason given on
   * {@link cleanupInvalidRuns} (issue 970).
   *
   * @param {(recipeId: string) => (object|null)} resolveRecipe
   * @returns {Promise<number>} the number of phantom runs pruned
   */
  async pruneInstantaneousActiveRuns(resolveRecipe) {
    if (typeof resolveRecipe !== 'function') return 0;
    let pruned = 0;
    for (const actor of selectWritableActors(game.actors)) {
      const container = this._getContainer(actor);
      let dirty = false;

      for (const [runId, run] of Object.entries(container.active || {})) {
        if (getRunLifecycleContract(run) === 'unsupported') continue;
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

function buildSelectionPlan(selection) {
  return {
    selectedIngredientSetId: stringOrNull(selection.selectedIngredientSetId),
    ingredientOptionOverrides: cloneObject(selection.ingredientOptionOverrides),
    ingredientEssenceAllocation: cloneObject(selection.ingredientEssenceAllocation),
  };
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

function stringOrNull(value) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}
