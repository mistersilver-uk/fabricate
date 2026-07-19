import { RunContainerManagerBase } from './runContainerStore.js';

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

  _buildStepStates(recipe) {
    const steps = recipe.getExecutionSteps();
    return steps.map((step, index) => ({
      stepId: step.id || foundry.utils.randomID(),
      stepName: step.name || `Step ${index + 1}`,
      index,
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

  async createRun(actor, recipe, componentSourceActors = [], userId = null) {
    const container = this._getContainer(actor);
    const runId = foundry.utils.randomID();
    const stepStates = this._buildStepStates(recipe);
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
    };

    container.active[runId] = run;
    await this._persist(actor, container);
    return run;
  }

  async updateRun(actor, run) {
    const container = this._getContainer(actor);
    if (!container.active[run.id]) return null;
    run.updatedAt = this._nowWorldTime();
    container.active[run.id] = run;
    await this._persist(actor, container);
    return run;
  }

  async markStepWaitingForTime(actor, run, stepIndex, timeRequirement) {
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
   * @param {Actor} actor
   * @param {object} run
   * @param {number} stepIndex
   * @param {{ selectedIngredientSetId?: string|null, currencySpends?: Array,
   *   resolvedEssences?: object, consumedSummary?: Array }} prepared
   * @returns {Promise<object|null>} the updated run, or null if the step index is invalid
   */
  async markStepPrepared(actor, run, stepIndex, prepared = {}) {
    const step = run.steps?.[stepIndex];
    if (!step) return null;
    step.preparedConsumption = {
      selectedIngredientSetId: prepared.selectedIngredientSetId ?? null,
      currencySpends: Array.isArray(prepared.currencySpends) ? prepared.currencySpends : [],
      resolvedEssences:
        prepared.resolvedEssences && typeof prepared.resolvedEssences === 'object'
          ? prepared.resolvedEssences
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
    const step = run.steps?.[stepIndex];
    if (!step?.timeGate) return true;
    return Number(worldTime) >= Number(step.timeGate.availableAt || 0);
  }

  async markStepInProgress(actor, run, stepIndex) {
    const worldTime = this._nowWorldTime();
    const step = run.steps?.[stepIndex];
    if (!step) return run;
    run.status = 'inProgress';
    run.currentStepIndex = stepIndex;
    step.status = 'inProgress';
    step.startedAt ??= worldTime;
    step.updatedAt = worldTime;
    await this.updateRun(actor, run);
    return run;
  }

  async completeStepSuccess(actor, run, stepIndex, payload = {}) {
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
      return this.completeRun(actor, run, 'succeeded');
    }

    run.currentStepIndex = nextIndex;
    run.status = 'inProgress';
    const nextStep = run.steps[nextIndex];
    if (nextStep) {
      nextStep.status = 'inProgress';
      nextStep.startedAt ??= worldTime;
      nextStep.updatedAt = worldTime;
    }
    await this.updateRun(actor, run);
    return run;
  }

  async completeStepFailure(actor, run, stepIndex, reason = 'Crafting check failed', payload = {}) {
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

    return this.completeRun(actor, run, 'failed');
  }

  async completeRun(actor, run, status = 'succeeded') {
    const container = this._getContainer(actor);
    if (!container.active?.[run.id]) return run;

    run.status = status;
    run.currentStepIndex = null;
    run.updatedAt = this._nowWorldTime();
    run.finishedAt = this._nowWorldTime();

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
        if (run.status !== 'waitingTime') continue;
        const idx = Number(run.currentStepIndex);
        if (!Number.isFinite(idx)) continue;
        const step = run.steps?.[idx];
        if (!step?.timeGate) continue;
        if (Number(worldTime) < Number(step.timeGate.availableAt || 0)) continue;

        run.status = 'inProgress';
        step.status = 'inProgress';
        step.updatedAt = Number(worldTime);
        run.updatedAt = Number(worldTime);
        dirty = true;
      }

      if (dirty) {
        await this._persist(actor, container);
      }
    }
  }

  async removeRunsForSystem(systemId) {
    if (!systemId) return;
    const target = String(systemId);
    for (const actor of game.actors || []) {
      const container = this._getContainer(actor);
      let dirty = false;

      for (const [runId, run] of Object.entries(container.active || {})) {
        if (run?.craftingSystemId !== target) continue;
        delete container.active[runId];
        dirty = true;
      }

      const nextHistory = (container.history || []).filter(
        (run) => run?.craftingSystemId !== target
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

  async cleanupInvalidRuns(validRecipeIds = new Set(), validSystemIds = new Set()) {
    for (const actor of game.actors || []) {
      const container = this._getContainer(actor);
      let dirty = false;

      for (const [runId, run] of Object.entries(container.active || {})) {
        const recipeValid = run?.recipeId && validRecipeIds.has(run.recipeId);
        const systemValid = run?.craftingSystemId && validSystemIds.has(run.craftingSystemId);
        if (recipeValid && systemValid) continue;
        delete container.active[runId];
        dirty = true;
      }

      const nextHistory = (container.history || []).filter((run) => {
        const systemValid = run?.craftingSystemId && validSystemIds.has(run.craftingSystemId);
        // A no-signature fizzle is recipe-less by design; keep it while its system
        // is valid rather than pruning it as an unknown-recipe run.
        if (run?.isFizzle) return systemValid;
        const recipeValid = run?.recipeId && validRecipeIds.has(run.recipeId);
        return recipeValid && systemValid;
      });
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
   * Prune legacy phantom active runs: a crafting run whose recipe is single-step
   * AND whose only step has no time requirement can never legitimately persist as
   * active (it only ever rejects, fails, or succeeds atomically), so any such run
   * left in the active container is a phantom stranded by an old pre-validation
   * early-return. Multi-step recipes (persist between "Trigger Next Step") and
   * single-step time-gated recipes (persist a waiting run) are excluded.
   *
   * Unknown recipes are left alone here — {@link cleanupInvalidRuns} owns those.
   *
   * @param {(recipeId: string) => (object|null)} resolveRecipe
   * @returns {Promise<number>} the number of phantom runs pruned
   */
  async pruneInstantaneousActiveRuns(resolveRecipe) {
    if (typeof resolveRecipe !== 'function') return 0;
    let pruned = 0;
    for (const actor of game.actors || []) {
      const container = this._getContainer(actor);
      let dirty = false;

      for (const [runId, run] of Object.entries(container.active || {})) {
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
