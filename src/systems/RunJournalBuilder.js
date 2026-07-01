import {
  actorToOption,
  idOf,
  normalizeList,
  numberOrNull,
  plainObjectOrNull,
  stringOrEmpty,
  stringOrNull,
} from './gatheringEngineInternals.js';

const DEFAULT_RUN_IMAGE = 'icons/svg/item-bag.svg';
const DAY_SECONDS = 24 * 60 * 60;

// Localized player-facing resolution-mode label keys. The crafting
// `resolutionMode` token is system-internal, so the projection maps it to a
// localized enum (never emitting the raw token). There is no canonical
// "Standard" mode — `simple` (a DC pass/fail check) renders as "Standard (DC)".
const MODE_LABEL_KEYS = Object.freeze({
  simple: 'FABRICATE.App.Journal.Mode.Standard',
  routedByIngredients: 'FABRICATE.App.Journal.Mode.RoutedByIngredients',
  routedByCheck: 'FABRICATE.App.Journal.Mode.RoutedByCheck',
  progressive: 'FABRICATE.App.Journal.Mode.Progressive',
  alchemy: 'FABRICATE.App.Journal.Mode.Alchemy',
});

const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'cancelled']);

/**
 * Convert a recipe/step `timeRequirement` (`{minutes,hours,days,months,years}`)
 * into a non-negative second count. Mirrors `CraftingRunManager._durationToSeconds`
 * (months = 30 days, years = 365 days) so the projection's required-time read
 * matches the gate the engine arms.
 *
 * @param {object|null} timeRequirement
 * @returns {number}
 */
function durationToSeconds(timeRequirement = null) {
  if (!timeRequirement || typeof timeRequirement !== 'object') return 0;
  const minutes = Number(timeRequirement.minutes || 0);
  const hours = Number(timeRequirement.hours || 0);
  const days = Number(timeRequirement.days || 0);
  const months = Number(timeRequirement.months || 0);
  const years = Number(timeRequirement.years || 0);
  return Math.max(
    0,
    minutes * 60 +
      hours * 60 * 60 +
      days * DAY_SECONDS +
      months * 30 * DAY_SECONDS +
      years * 365 * DAY_SECONDS
  );
}

/**
 * Unified, UI-safe projection over the three actor-scoped run managers
 * (crafting, salvage, gathering) for the player-facing Journal screen.
 *
 * The Journal monitors and (for crafting only) advances *existing* runs; it
 * never creates them. This builder reads the selected actor's active + terminal
 * runs and projects each into a single superset `RunModel`:
 *  - crafting/salvage populate step fields (`steps`, `currentStep`, `stepLabel`,
 *    per-step `timeGate`/`detail`);
 *  - gathering carries no steps and re-maps its `*WorldTime` fields onto the
 *    common `startedAt/updatedAt/finishedAt`.
 *
 * Like {@link GatheringListingBuilder} it never returns raw Foundry documents:
 * every model is built from cloned primitives, and undiscovered crafting/alchemy
 * recipes are redacted to a generic label for non-GM viewers.
 *
 * All collaborators are injected; the class touches no Foundry globals.
 */
export class RunJournalBuilder {
  /**
   * @param {object} deps
   * @param {object} [deps.craftingRunManager] Actor-scoped crafting runs.
   * @param {object} [deps.salvageRunManager] Actor-scoped salvage runs.
   * @param {object} [deps.gatheringRunSource] Actor-scoped gathering runs
   *   (`getActiveRuns(actor)` / `getRunHistory(actor, limit)`).
   * @param {object} [deps.recipeManager] Recipe lookup (`getRecipe(id)`).
   * @param {object} [deps.resolutionModeService] Resolution-mode reads (`getMode(recipe)`).
   * @param {object} [deps.recipeVisibility] RecipeVisibilityService for viewer redaction.
   * @param {Function} [deps.getSystem] `(systemId) => system|null`.
   * @param {Function} [deps.getTool] `(systemId, toolId) => { name }|null`.
   * @param {Function} [deps.getGatheringTask] `(environmentId, taskId) => { name, img }|null`
   *   — resolves a gathering run's task to its authored name/image (from the COMPOSED
   *   environment), mirroring how `getRecipe` resolves a crafting run's name/image.
   * @param {Function} [deps.getResultItem] `(itemUuid) => { name, img }|null` — resolves
   *   an awarded/created result item by its recorded uuid, so the journal can label a
   *   run's produced items even for records that predate name/img capture.
   * @param {Function} [deps.getViewer] `() => viewer` (current Foundry user) for redaction.
   * @param {Function} [deps.localize] `(key, data?) => string`.
   * @param {Function} [deps.nowWorldTime] `() => number` current world time.
   */
  constructor({
    craftingRunManager = null,
    salvageRunManager = null,
    gatheringRunSource = null,
    recipeManager = null,
    resolutionModeService = null,
    recipeVisibility = null,
    getSystem = null,
    getTool = null,
    getGatheringTask = null,
    getResultItem = null,
    getViewer = null,
    localize = (key) => key,
    nowWorldTime = () => 0,
  } = {}) {
    this._craftingRunManager = craftingRunManager;
    this._salvageRunManager = salvageRunManager;
    this._gatheringRunSource = gatheringRunSource;
    this._recipeManager = recipeManager;
    this._resolutionModeService = resolutionModeService;
    this._recipeVisibility = recipeVisibility;
    this._getSystem = typeof getSystem === 'function' ? getSystem : () => null;
    this._getTool = typeof getTool === 'function' ? getTool : () => null;
    this._getGatheringTask = typeof getGatheringTask === 'function' ? getGatheringTask : () => null;
    this._getResultItem = typeof getResultItem === 'function' ? getResultItem : () => null;
    this._getViewer = typeof getViewer === 'function' ? getViewer : () => null;
    this.localize = typeof localize === 'function' ? localize : (key) => key;
    this._nowWorldTime = typeof nowWorldTime === 'function' ? nowWorldTime : () => 0;
  }

  /**
   * Build the unified Journal listing for the selected actor.
   *
   * @param {object} options
   * @param {object|null} [options.actor] The resolved selected actor (world actor).
   * @param {object|null} [options.viewer] The Foundry user requesting the listing.
   * @returns {{selectedActorId: string|null, actor: object|null, worldTime: number,
   *   activeRuns: object[], history: object[], counts: {active: number, history: number}}}
   */
  buildListing({ actor = null, viewer = null } = {}) {
    const worldTime = Number(this._nowWorldTime() || 0);
    const resolvedViewer = viewer ?? this._getViewer();
    if (!actor) {
      return {
        selectedActorId: null,
        actor: null,
        worldTime,
        activeRuns: [],
        history: [],
        counts: { active: 0, history: 0 },
      };
    }

    const activeRuns = this._buildRunModels({
      actor,
      viewer: resolvedViewer,
      worldTime,
      terminal: false,
    });
    const history = this._buildRunModels({
      actor,
      viewer: resolvedViewer,
      worldTime,
      terminal: true,
    });
    return {
      selectedActorId: idOf(actor),
      actor: actorToOption(actor),
      worldTime,
      activeRuns,
      history,
      counts: { active: activeRuns.length, history: history.length },
    };
  }

  /**
   * Collect crafting + salvage + gathering models for one phase (active/terminal).
   * @private
   */
  _buildRunModels({ actor, viewer, worldTime, terminal }) {
    const crafting = normalizeList(
      terminal
        ? this._craftingRunManager?.getRunHistory?.(actor)
        : this._craftingRunManager?.getActiveRuns?.(actor)
    ).map((run) => this._craftingRunModel({ run, actor, viewer, worldTime, terminal }));

    const salvage = normalizeList(
      terminal
        ? this._salvageRunManager?.getRunHistory?.(actor)
        : this._salvageRunManager?.getActiveRuns?.(actor)
    ).map((run) => this._passthroughRunModel({ run, runType: 'salvage', worldTime, terminal }));

    const gathering = normalizeList(
      terminal
        ? this._gatheringRunSource?.getRunHistory?.(actor)
        : this._gatheringRunSource?.getActiveRuns?.(actor)
    ).map((run) => this._passthroughRunModel({ run, runType: 'gathering', worldTime, terminal }));

    return [...crafting, ...salvage, ...gathering].filter(Boolean);
  }

  // ---------------------------------------------------------------------------
  // Crafting (fully projected)
  // ---------------------------------------------------------------------------

  _craftingRunModel({ run, actor, viewer, worldTime, terminal }) {
    if (!run?.id) return null;
    const recipe = this._recipeManager?.getRecipe?.(stringOrNull(run.recipeId)) ?? null;
    const system = this._getSystem(stringOrNull(run.craftingSystemId));
    const redacted = this._isCraftingRedacted({ recipe, actor, viewer });

    const runSteps = normalizeList(run.steps);
    const recipeSteps =
      recipe && typeof recipe.getExecutionSteps === 'function' ? recipe.getExecutionSteps() : [];
    const stepCount = runSteps.length;
    const currentStepIndex = numberOrNull(run.currentStepIndex);
    const status = stringOrNull(run.status) || 'inProgress';
    const activeStep =
      !terminal && Number.isFinite(currentStepIndex) ? runSteps[currentStepIndex] : null;

    const steps = redacted
      ? []
      : runSteps.map((runStep, index) =>
          this._craftingStepModel({
            runStep,
            recipeStep: recipeSteps[index] ?? null,
            system,
            recipe,
            index,
          })
        );
    const currentStep =
      activeStep && Number.isFinite(currentStepIndex) ? (steps[currentStepIndex] ?? null) : null;

    const derivedStatus = this._deriveCraftingStatus({ status, activeStep, worldTime });
    const multiStep = Array.isArray(recipe?.steps) && recipe.steps.length > 1;
    const failureReason = redacted ? null : this._craftingFailureReason(runSteps);
    // The step whose name annotates the label: the active step for a live run,
    // else the final step for a terminal run.
    const labelStep = terminal
      ? runSteps[stepCount - 1]
      : Number.isFinite(currentStepIndex)
        ? runSteps[currentStepIndex]
        : runSteps[0];

    return {
      id: stringOrNull(run.id),
      runType: 'crafting',
      status,
      derivedStatus,
      craftingSystemId: stringOrNull(run.craftingSystemId),
      craftingSystemName: stringOrEmpty(system?.name),
      names: {
        title: redacted
          ? this.localize('FABRICATE.App.Journal.Redacted.Title')
          : stringOrEmpty(recipe?.name) || stringOrEmpty(run.recipeId),
        subtitle: redacted ? '' : stringOrEmpty(system?.name),
      },
      redacted,
      img: redacted ? DEFAULT_RUN_IMAGE : stringOrNull(recipe?.img) || DEFAULT_RUN_IMAGE,
      stepIndex: Number.isFinite(currentStepIndex) ? currentStepIndex : null,
      stepCount,
      stepLabel: this._stepLabel({
        stepCount,
        currentStepIndex,
        terminal,
        stepName: stringOrEmpty(labelStep?.stepName),
      }),
      steps,
      currentStep,
      timeGate: plainObjectOrNull(activeStep?.timeGate),
      startedAt: numberOrNull(run.startedAt),
      updatedAt: numberOrNull(run.updatedAt),
      finishedAt: numberOrNull(run.finishedAt),
      structureLabel: this.localize(
        multiStep
          ? 'FABRICATE.App.Journal.Structure.MultiStep'
          : 'FABRICATE.App.Journal.Structure.SingleStep'
      ),
      resolutionModeLabel: this._resolutionModeLabel(recipe, system),
      recipeId: redacted ? null : stringOrNull(run.recipeId),
      taskId: null,
      flavor: '',
      failureReason,
      ...this._craftingResults(runSteps, redacted),
      // A redacted run hides its recipe identity, so it cannot offer a manual
      // "Trigger Next Step" advance — only a discovered crafting run can.
      manualAdvance: !redacted,
    };
  }

  /**
   * Derive the actionable status for a crafting run. Terminal statuses pass
   * through. For an active run, readiness comes from the CURRENT step's time
   * gate — `ready` when `availableAt <= worldTime` — never from `run.status`,
   * because `processWorldTime` flips matured `waitingTime` runs to `inProgress`
   * asynchronously off the same hook. A step with no armed gate is `inProgress`
   * (actionable: the first trigger arms the gate).
   * @private
   */
  _deriveCraftingStatus({ status, activeStep, worldTime }) {
    if (TERMINAL_STATUSES.has(status)) return status;
    const availableAt = numberOrNull(activeStep?.timeGate?.availableAt);
    if (availableAt !== null) {
      return availableAt <= worldTime ? 'ready' : 'waiting';
    }
    return 'inProgress';
  }

  _craftingStepModel({ runStep, recipeStep, system, recipe, index }) {
    return {
      stepId: stringOrNull(runStep?.stepId),
      stepName: stringOrEmpty(runStep?.stepName),
      index,
      status: stringOrNull(runStep?.status) || 'pending',
      timeGate: plainObjectOrNull(runStep?.timeGate),
      detail: this._stepDetail({ runStep, recipeStep, system, recipe }),
      lastCheckResult: this._checkResultModel(runStep?.lastCheckResult),
    };
  }

  _stepDetail({ runStep, recipeStep, system, recipe }) {
    const toolNames = normalizeList(recipeStep?.toolIds)
      .map((toolId) =>
        stringOrEmpty(this._getTool(stringOrNull(recipe?.craftingSystemId), toolId)?.name)
      )
      .filter(Boolean);
    const requiredSeconds =
      numberOrNull(runStep?.timeGate?.requiredSeconds) ??
      durationToSeconds(recipeStep?.timeRequirement);
    const failureReason = stringOrNull(runStep?.failureReason);
    return {
      requiredSeconds: requiredSeconds > 0 ? requiredSeconds : null,
      primaryToolName: toolNames[0] ?? null,
      toolNames,
      checkLabel: this._checkLabel({ system, recipe }),
      failureText:
        failureReason ||
        (runStep?.status === 'failed'
          ? this.localize('FABRICATE.App.Journal.StepDetails.FailureGeneric')
          : null),
    };
  }

  _checkResultModel(lastCheckResult) {
    if (!lastCheckResult || typeof lastCheckResult !== 'object') return null;
    // The roll detail lives on `data` (dc, resolved formula, raw total) — surface it
    // so the run journal can show the ACTUAL roll (e.g. "1d20 + 3 = 11 vs DC 16"),
    // not just the authored requirement.
    const data =
      lastCheckResult.data && typeof lastCheckResult.data === 'object' ? lastCheckResult.data : {};
    return {
      success: lastCheckResult.success === true,
      outcome: stringOrNull(lastCheckResult.outcome),
      value: numberOrNull(lastCheckResult.value),
      reason: stringOrNull(lastCheckResult.reason),
      formula: stringOrNull(data.resolvedFormula) || stringOrNull(data.formula),
      total: numberOrNull(data.total) ?? numberOrNull(lastCheckResult.value),
      dc: numberOrNull(data.dc),
    };
  }

  /**
   * Compose the step's crafting-check label as `rollFormula` + resolved DC ONLY
   * (no skill name — none is stored). The active mode selects the check config
   * (`simple`/`progressive`/`routed`); the DC resolves from the recipe's selected
   * tier, else the config's static DC. A dynamic-DC macro and progressive
   * (value-budget) checks have no statically resolvable DC, so the formula is
   * surfaced without a number rather than a hardcoded default.
   * @private
   */
  _checkLabel({ system, recipe }) {
    if (!system) return null;
    const mode = this._resolveMode(recipe, system);
    const config = this._checkConfigForMode(system, mode);
    const formula = stringOrNull(config?.rollFormula);
    if (!formula) return null;
    const dc = this._resolveCheckDc({ config, recipe, mode });
    return dc === null
      ? formula
      : this.localize('FABRICATE.App.Journal.StepDetails.CheckWithDc', { formula, dc });
  }

  _checkConfigForMode(system, mode) {
    const check = system?.craftingCheck;
    if (mode === 'progressive') return check?.progressive;
    if (mode === 'routedByIngredients' || mode === 'routedByCheck') return check?.routed;
    return check?.simple;
  }

  _resolveCheckDc({ config, recipe, mode }) {
    if (mode === 'progressive') return null;
    if (config?.dcMode === 'dynamic') return null;
    const tierId = stringOrNull(recipe?.checkTierId);
    if (tierId) {
      const tier = normalizeList(config?.tiers).find((entry) => entry?.id === tierId);
      const tierDc = Number(tier?.dc);
      if (Number.isFinite(tierDc)) return Math.trunc(tierDc);
    }
    const dc = Number(config?.dc);
    return Number.isFinite(dc) ? Math.trunc(dc) : null;
  }

  _craftingFailureReason(runSteps) {
    const failed = normalizeList(runSteps).find((step) => step?.status === 'failed');
    return stringOrNull(failed?.failureReason);
  }

  /**
   * Aggregate every step's `createdResults` into a UI-safe `ResultModel[]`.
   * Returns `createdResults: []` + `createdResultCount: 0` for a redacted run.
   * @private
   */
  /**
   * Map a persisted created-result to the UI shape, resolving name/img by uuid when
   * the record does not carry them (records that predate name/img capture).
   * @private
   */
  _mapResult(result) {
    const itemUuid = stringOrNull(result?.itemUuid);
    let name = stringOrNull(result?.name);
    let img = stringOrNull(result?.img);
    if ((!name || !img) && itemUuid) {
      const doc = this._getResultItem(itemUuid);
      name = name || stringOrNull(doc?.name);
      img = img || stringOrNull(doc?.img);
    }
    return {
      componentId: stringOrNull(result?.componentId),
      itemUuid,
      quantity: numberOrNull(result?.quantity) ?? 1,
      name,
      img,
    };
  }

  _craftingResults(runSteps, redacted) {
    if (redacted) return { createdResults: [], createdResultCount: 0 };
    const createdResults = normalizeList(runSteps).flatMap((step) =>
      normalizeList(step?.createdResults).map((result) => this._mapResult(result))
    );
    return { createdResults, createdResultCount: createdResults.length };
  }

  _stepLabel({ stepCount, currentStepIndex, terminal, stepName = '' }) {
    if (stepCount <= 0) return '';
    const displayIndex = terminal
      ? stepCount
      : Number.isFinite(currentStepIndex)
        ? Math.min(stepCount, currentStepIndex + 1)
        : 1;
    const name = stringOrEmpty(stepName).trim();
    if (name) {
      return this.localize('FABRICATE.App.Journal.Step.LabelNamed', {
        index: displayIndex,
        count: stepCount,
        name,
      });
    }
    return this.localize('FABRICATE.App.Journal.Step.Label', {
      index: displayIndex,
      count: stepCount,
    });
  }

  _resolveMode(recipe, system) {
    if (recipe && typeof this._resolutionModeService?.getMode === 'function') {
      return this._resolutionModeService.getMode(recipe) || system?.resolutionMode || 'simple';
    }
    return system?.resolutionMode || 'simple';
  }

  _resolutionModeLabel(recipe, system) {
    const mode = this._resolveMode(recipe, system);
    return this.localize(MODE_LABEL_KEYS[mode] || MODE_LABEL_KEYS.simple);
  }

  /**
   * Whether a crafting run's recipe identity must be redacted for the viewer.
   * Mirrors {@link GatheringListingBuilder._isOpaqueBlindRun}: a missing recipe
   * or a recipe the viewer cannot see (undiscovered alchemy / knowledge-gated
   * crafting) is redacted to a generic label. GMs and global-visible recipes are
   * never redacted. No visibility service ⇒ no redaction.
   * @private
   */
  _isCraftingRedacted({ recipe, actor, viewer }) {
    if (!recipe) return true;
    if (viewer?.isGM === true) return false;
    if (typeof this._recipeVisibility?.evaluateRecipeAccess !== 'function') return false;
    try {
      const access = this._recipeVisibility.evaluateRecipeAccess({
        recipe,
        viewer,
        craftingActor: actor,
      });
      return access?.visible === false;
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Gathering / salvage passthrough (Slice A: null-step re-map; full detail is
  // Phase 2). Re-maps native fields onto the common RunModel shape without
  // surfacing step internals, and never returns raw documents (cloned primitives
  // only). Gathering uses `*WorldTime` field names; salvage uses the crafting
  // `startedAt/updatedAt/finishedAt` names.
  // ---------------------------------------------------------------------------

  _passthroughRunModel({ run, runType, worldTime, terminal }) {
    if (!run?.id) return null;
    const system = this._getSystem(stringOrNull(run.craftingSystemId));
    const status = stringOrNull(run.status) || (terminal ? 'succeeded' : 'inProgress');
    const timeGate = plainObjectOrNull(run.timeGate);
    const startedAt =
      runType === 'gathering' ? numberOrNull(run.startedAtWorldTime) : numberOrNull(run.startedAt);
    const updatedAt =
      runType === 'gathering' ? numberOrNull(run.updatedAtWorldTime) : numberOrNull(run.updatedAt);
    const finishedAt =
      runType === 'gathering'
        ? numberOrNull(run.completedAtWorldTime)
        : numberOrNull(run.finishedAt);

    // Gathering runs persist only a `taskId`; resolve it to the task's authored
    // name/image (mirroring how crafting resolves recipe name/img). Guard blind
    // runs — a null/`'blind'` taskId is not resolvable — and fall back to the raw
    // id + default image when the task cannot be resolved.
    let title = stringOrEmpty(run.label) || stringOrEmpty(run.taskId);
    let img = DEFAULT_RUN_IMAGE;
    if (runType === 'gathering') {
      const taskId = stringOrNull(run.taskId);
      const task =
        taskId && taskId !== 'blind'
          ? this._getGatheringTask(stringOrNull(run.environmentId), taskId)
          : null;
      if (task) {
        title = stringOrEmpty(task.name) || title;
        img = stringOrNull(task.img) || DEFAULT_RUN_IMAGE;
      }
    }

    return {
      id: stringOrNull(run.id),
      runType,
      status,
      derivedStatus: this._derivePassthroughStatus({ status, timeGate, worldTime }),
      craftingSystemId: stringOrNull(run.craftingSystemId),
      craftingSystemName: stringOrEmpty(system?.name),
      names: {
        title,
        subtitle: stringOrEmpty(system?.name),
      },
      redacted: false,
      img,
      stepIndex: null,
      stepCount: 0,
      stepLabel: '',
      steps: [],
      currentStep: null,
      timeGate,
      startedAt,
      updatedAt,
      finishedAt,
      structureLabel: '',
      resolutionModeLabel: '',
      recipeId: null,
      taskId: stringOrNull(run.taskId),
      flavor: '',
      failureReason: stringOrNull(run.failureReason),
      ...this._passthroughResults(run.createdResults),
      manualAdvance: false,
    };
  }

  /**
   * Map a gathering/salvage run's persisted `createdResults` into the same UI-safe
   * shape crafting uses, so the detail view can list awarded items (image + name +
   * quantity) rather than a bare count.
   * @private
   */
  _passthroughResults(createdResults) {
    const results = normalizeList(createdResults).map((result) => this._mapResult(result));
    return { createdResults: results, createdResultCount: results.length };
  }

  _derivePassthroughStatus({ status, timeGate, worldTime }) {
    if (TERMINAL_STATUSES.has(status)) return status;
    const availableAt = numberOrNull(timeGate?.availableAt);
    if (availableAt !== null) {
      return availableAt <= worldTime ? 'ready' : 'waiting';
    }
    return 'inProgress';
  }
}
