import { resolveRecipeImage } from '../ui/svelte/util/craftingImageDefaults.js';
import { activityPermitsFailureResults } from '../utils/failureResultPolicy.js';
import { cloneJson } from '../utils/scalars.js';

import { resolveActiveCraftingCheckFormula } from './checkModifierResolver.js';
import { craftingStepHistoryEvidence } from './CraftingRunManager.js';
import {
  actorToOption,
  idOf,
  isBlindWaitingTaskId,
  normalizeList,
  numberOrNull,
  plainObjectOrNull,
  stringOrEmpty,
  stringOrNull,
} from './gatheringEngineInternals.js';
import { gatheringHistoryEvidence } from './gatheringHistoryEvidence.js';
import { enrichHistoricalConsumption, historicalItemSources } from './historyItemEvidence.js';
import { readStackQuantity } from './itemStackQuantity.js';
import { buildPassInventorySnapshot } from './passInventorySnapshot.js';
import { historyEvidenceFields } from './runHistoryEvidence.js';
import { craftingOutcomeBand, routedOutcomeBand } from './runJournalOutcomeBands.js';
import { getRunLifecycleContract } from './runLifecycleState.js';
import { resolvedComponentsFor, resolvedEssencesFor } from './scopedEntityReads.js';
import {
  STAGE_BLOCKERS,
  classifyStageReadiness,
  ingredientKind,
  isChoiceBlocker,
  missingGroupBlocker,
  resolveStageToolStates,
  scopedEssenceAllocation,
  selectedIngredientItems,
  stageSelectionInputsComplete,
  unfundedEssenceGroupIds,
} from './stageReadiness.js';

const DEFAULT_RUN_IMAGE = 'icons/svg/item-bag.svg';
const DEFAULT_GATHERING_IMAGE = 'icons/containers/bags/pouch-leather-brown-green.webp';
// Generic player-facing label for a blind gathering run, shared with the
// gathering listing so both surfaces say the same thing.
const BLIND_TASK_LABEL_KEY = 'FABRICATE.Gathering.BlindTaskLabel';
const DAY_SECONDS = 24 * 60 * 60;

function recordedNumber(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  return typeof value === 'string' && value.trim() === '' ? null : numberOrNull(value);
}

/** What a surface states about a ROLLED amount, or null for a fixed one (issue 1645): an award's
 *  recorded roll BESIDE the real quantity it produced, an authored expression INSTEAD of a number no
 *  actor-free surface can know. The roll is read, never re-rolled. */
function rolledAmountLabel(source, localize) {
  const rolled = plainObjectOrNull(source?.rolled);
  const total = numberOrNull(rolled?.total);
  if (stringOrNull(rolled?.formula) && total !== null) {
    return localize('FABRICATE.App.Journal.AmountRolled', { formula: rolled.formula, total });
  }
  return stringOrNull(source?.quantityFormula);
}

// Versioned terminal history is persisted BEFORE effects. Its createdResults is
// a plan, even after commit; the applied results receipt is the award authority.
function gatheringActualAwards(run) {
  if (run.checkResult?.blind === true) return null;
  if (getRunLifecycleContract(run) !== 'current') {
    if (run.historySettlement?.awards === 'pending') return null;
    // Older failure normalization erased these refs; an empty list cannot prove zero.
    return run.status === 'failed' &&
      normalizeList(run.createdResults).length === 0 &&
      run.historySettlement?.awards !== 'complete'
      ? null
      : run.createdResults;
  }
  if (run.checkResult?.blind === true) return null;
  const effects = normalizeList(run.executionJournal?.effects).filter(
    (effect) => effect?.effectId === 'results' && effect?.kind === 'createGatheredResults'
  );
  if (effects.length !== 1 || effects[0].phase !== 'applied') return null;
  return Array.isArray(effects[0].receipt) ? effects[0].receipt : null;
}

function historicalStepAttempted(step, run, index) {
  if (['succeeded', 'failed'].includes(step?.status) || step?.lastCheckResult) return true;
  // Consumption alone is not an attempt: a stage START spends its inputs (D-026) and a
  // cancel hands them back, so only a RESOLVED stage records `consumedIngredients`.
  if (
    normalizeList(step?.consumedIngredients).length > 0 ||
    normalizeList(step?.createdResults).length > 0 ||
    normalizeList(step?.usedTools).length > 0
  ) {
    return true;
  }
  if (Number(run?.executionJournal?.intent?.stepIndex) !== index) return false;
  // A stage START commits inputs; it does not attempt the stage. Only a resolution does,
  // and a cancelled run returns what its start spent.
  if (run?.executionJournal?.intent?.trigger === 'start') return false;
  return normalizeList(run?.executionJournal?.effects).some(
    (effect) => effect?.phase === 'applied'
  );
}

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
const EXECUTION_JOURNAL_STATUSES = new Set(['planned', 'committed', 'recoveryRequired']);
const EXECUTION_EFFECT_PHASES = new Set(['planned', 'applying', 'applied']);
const SAFE_EXECUTION_EFFECT_KINDS = new Set([
  'executeCraftingStage',
  'consumeItems',
  'awardItems',
  'consumeIngredients',
  'consumeAlchemyExtras',
  'spendCurrency',
  'applyToolUsage',
  'spendItemPilesCurrency',
  'awardResults',
  'finalizeCraftingStage',
  'recordRecipeUse',
  'learnAlchemyRecipe',
  'fireComplications',
  'postCraftChat',
  'recordAlchemyDeadEnd',
  'consumeAlchemyItems',
  'createGatheredResults',
  'refundStageConsumption',
]);

/**
 * Defensively drop models that repeat a native run identity, keeping the first
 * occurrence and warning once per dropped duplicate. A run id may legitimately
 * recur across native run types, so the actor/type/id composite key is the
 * identity boundary rather than the display-oriented id alone.
 *
 * @param {object[]} models
 * @param {string} phase `history` or `active`, for the warning context.
 * @returns {object[]}
 */
function dedupeRunModelsById(models, phase) {
  const seen = new Set();
  const deduped = [];
  for (const model of models) {
    const id = model?.id;
    const key = model?.key ?? id;
    if (key != null && seen.has(key)) {
      console.warn(
        `Fabricate | Dropping duplicate ${phase} run "${id}" from the Journal listing (kept the first occurrence).`
      );
      continue;
    }
    if (key != null) seen.add(key);
    deduped.push(model);
  }
  return deduped;
}

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
 * The Journal monitors existing runs and exposes lifecycle-permitted crafting and
 * versioned gathering actions. This builder never creates or executes a run.
 * It projects active and terminal records into a superset `RunModel`:
 *  - crafting populates step fields (`steps`, `currentStep`, `stepLabel`,
 *    per-step `timeGate`/`detail`);
 *  - salvage and gathering carry no crafting steps, and gathering maps `*WorldTime` onto
 *    common `startedAt/updatedAt/finishedAt`.
 * Native actor/type/id keys retain identity while `activityKind` distinguishes alchemy.
 * Lifecycle actions, paused-first readiness, current-stage selection intent and allowlisted
 * recovery evidence supplement the legacy `manualAdvance` compatibility flag.
 * The completion-preference action describes visibility, not automatic material-spending eligibility.
 * Authored requirements and possible yields remain distinct from actual spending and awards.
 *
 * Like {@link GatheringListingBuilder} it never returns raw Foundry documents:
 * every model is built from cloned primitives, and undiscovered crafting/alchemy
 * recipes are redacted to a generic label for non-GM viewers.
 *
 * Redaction hides protected identity and evidence, not otherwise permitted owner actions.
 * Authority, pause, execution/recovery and unsupported-version refusals still apply.
 * The projection's actions guide the UI and never replace the command boundary's authorization.
 * User dismissal filters terminal visibility without deleting the underlying actor history.
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
   * @param {Function} [deps.getTool] `(systemId, toolId) => { name, img }|null`.
   * @param {Function} [deps.getGatheringBlindSecret] `(runId) => { taskId, snapshot }|null`
   *   — the GM-owned blind-run store (issue 901), read for a GM viewer's preview and
   *   ignored for every other viewer.
   * @param {Function} [deps.isGatheringIdentityHidden] `({actor, viewer, environmentId, taskId})
   *   => boolean` — D-027: whether run history must still name a blind gathering task
   *   generically. Answered from the environment's reveal policy and the PERSISTED reveal
   *   state, never from actor ownership; unwired it discloses, because a builder with no
   *   reveal source cannot tell a blind environment from a plain one.
   * @param {Function} [deps.getGatheringTask] `(environmentId, taskId) => { name, img }|null`
   *   — the task's authored name/image, from the COMPOSED environment.
   * @param {Function} [deps.getResultItem] `(itemUuid) => { name, img }|null` — labels a
   *   produced item from a record that predates name/img capture.
   * @param {Function} [deps.getComponent] `(systemId, componentId) => { name, img }|null` —
   *   powers a salvage run's title and the name/img fallback for a capture-less record.
   * @param {Function} [deps.getViewer] `() => viewer` (current Foundry user) for redaction.
   * @param {Function} [deps.localize] `(key, data?) => string`.
   * @param {Function} [deps.nowWorldTime] `() => number` current world time.
   * @param {Function} [deps.resolveComponentForItem] `(item, components, systemId) =>
   *   component|null`. A SNAPSHOT collaborator, not a builder one: this builder never calls
   *   it. It is supplied so the per-pass snapshot built here is the same complete value the
   *   crafting and visibility passes build (issue 1228) rather than a half of one — see
   *   `passInventorySnapshot`'s header for what a half-snapshot does to each consumer.
   * @param {Function} [deps.getDismissedRunKeys] `({actorUuid, viewerId}) => Iterable<string>`.
   * @param {Function} [deps.getJournalActionAvailability] `() => {available, reason}`.
   * @param {Function} [deps.getComponentSourceActors] `({actor, run}) => object[]`.
   * @param {Function} [deps.resolveItemEssences] `({item, recipe}) => Record<string, number>`.
   * @param {Function} [deps.affordCurrency] `({actor, recipe, match}) => boolean`.
   * @param {Function} [deps.affordCurrencySpends] `({actor, recipe, currencySpends}) => boolean`.
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
    getGatheringBlindSecret = null,
    isGatheringIdentityHidden = null,
    getResultItem = null,
    getComponent = null,
    getViewer = null,
    localize = (key) => key,
    nowWorldTime = () => 0,
    resolveComponentForItem = null,
    getDismissedRunKeys = null,
    getJournalActionAvailability = null,
    getComponentSourceActors = null,
    resolveItemEssences = null,
    affordCurrency = null,
    affordCurrencySpends = null,
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
    this._getGatheringBlindSecret =
      typeof getGatheringBlindSecret === 'function' ? getGatheringBlindSecret : null;
    this._isGatheringIdentityHidden =
      typeof isGatheringIdentityHidden === 'function' ? isGatheringIdentityHidden : () => false;
    this._getResultItem = typeof getResultItem === 'function' ? getResultItem : () => null;
    this._getComponent = typeof getComponent === 'function' ? getComponent : () => null;
    this._getViewer = typeof getViewer === 'function' ? getViewer : () => null;
    this.localize = typeof localize === 'function' ? localize : (key) => key;
    this._nowWorldTime = typeof nowWorldTime === 'function' ? nowWorldTime : () => 0;
    this._resolveComponentForItem =
      typeof resolveComponentForItem === 'function' ? resolveComponentForItem : null;
    this._getDismissedRunKeys =
      typeof getDismissedRunKeys === 'function' ? getDismissedRunKeys : () => new Set();
    this._getJournalActionAvailability =
      typeof getJournalActionAvailability === 'function'
        ? getJournalActionAvailability
        : () => ({ available: true, reason: null });
    this._getComponentSourceActors =
      typeof getComponentSourceActors === 'function' ? getComponentSourceActors : () => [];
    this._resolveItemEssences =
      typeof resolveItemEssences === 'function' ? resolveItemEssences : undefined;
    this._affordCurrency = typeof affordCurrency === 'function' ? affordCurrency : undefined;
    this._affordCurrencySpends =
      typeof affordCurrencySpends === 'function' ? affordCurrencySpends : null;
  }

  /**
   * Build the unified Journal listing for the selected actor.
   *
   * @param {object} options
   * @param {object|null} [options.actor] The resolved selected actor (world actor).
   * @param {object|null} [options.viewer] The Foundry user requesting the listing.
   * @returns {{selectedActorId: string|null, selectedActorUuid: string|null,
   *   actor: object|null, worldTime: number, activeRuns: object[], history: object[],
   *   counts: {active: number, history: number}}}
   */
  buildListing({ actor = null, viewer = null } = {}) {
    const worldTime = Number(this._nowWorldTime() || 0);
    const resolvedViewer = viewer ?? this._getViewer();
    if (!actor) {
      return {
        selectedActorId: null,
        selectedActorUuid: null,
        actor: null,
        worldTime,
        activeRuns: [],
        history: [],
        counts: { active: 0, history: 0 },
      };
    }

    // Crafting runs and their recipes are resolved ONCE for the whole pass, then reused by
    // both phases (issue 1228). Redaction asks the visibility service about every one of them,
    // and on an `item`-visibility-mode system that question re-enumerated the actor's whole
    // inventory PER RUN. One snapshot answers all of them; it needs the recipes anyway, for
    // their legacy book links.
    const activeCraftingRuns = normalizeList(this._craftingRunManager?.getActiveRuns?.(actor));
    const historyCraftingRuns = normalizeList(this._craftingRunManager?.getRunHistory?.(actor));
    const recipesByRunId = this._craftingRunRecipes([
      ...activeCraftingRuns,
      ...historyCraftingRuns,
    ]);
    // A per-pass VALUE, discarded when this returns — never a field. Nothing mints a revision
    // token when `actor.items` changes, and a stale read here would redact (or un-redact) a
    // run against a book the actor no longer holds.
    const snapshot = buildPassInventorySnapshot({
      craftingActor: actor,
      // The Journal is scoped to ONE actor: it has no component-source selection, and the
      // redaction call it makes passes none either. Stated rather than defaulted so the
      // snapshot's actor set is visibly the same set the question is asked about.
      componentSourceActors: [],
      recipes: [...recipesByRunId.values()],
      resolveComponent: this._resolveComponentForItem,
    });

    const authority = this._actionAvailability(resolvedViewer);
    const dismissedRunKeys = this._dismissedRunKeys(actor, resolvedViewer);
    const activeRuns = this._buildRunModels({
      actor,
      viewer: resolvedViewer,
      worldTime,
      terminal: false,
      craftingRuns: activeCraftingRuns,
      recipesByRunId,
      snapshot,
      authority,
    });
    const history = this._buildRunModels({
      actor,
      viewer: resolvedViewer,
      worldTime,
      terminal: true,
      craftingRuns: historyCraftingRuns,
      recipesByRunId,
      snapshot,
      authority,
    }).filter((run) => !dismissedRunKeys.has(run.key));
    return {
      selectedActorId: idOf(actor),
      selectedActorUuid: this._actorUuid(actor),
      actor: actorToOption(actor),
      worldTime,
      activeRuns,
      history,
      counts: { active: activeRuns.length, history: history.length },
    };
  }

  /**
   * The recipe every non-fizzle crafting run in the pass resolves to, keyed by run id.
   *
   * Resolved once here instead of once inside each `_craftingRunModel`, because
   * {@link buildListing} needs the recipes up front to give the pass snapshot their legacy
   * book links — and resolving them twice would be a second `getRecipe` per run.
   *
   * @param {object[]} runs
   * @returns {Map<string, object>}
   * @private
   */
  _craftingRunRecipes(runs) {
    const byRunId = new Map();
    for (const run of runs) {
      // A fizzle projects through `_fizzleRunModel`, which never resolves a recipe, so
      // resolving one for it here would add a lookup the pass does not make today.
      if (!run?.id || run.isFizzle === true || byRunId.has(run.id)) continue;
      const recipe = this._recipeManager?.getRecipe?.(stringOrNull(run.recipeId)) ?? null;
      if (recipe) byRunId.set(run.id, recipe);
    }
    return byRunId;
  }

  /**
   * Collect crafting + salvage + gathering models for one phase (active/terminal).
   * @private
   */
  _buildRunModels({
    actor,
    viewer,
    worldTime,
    terminal,
    craftingRuns = null,
    recipesByRunId = null,
    snapshot = null,
    authority = null,
  }) {
    const actorUuid = this._actorUuid(actor);
    const runs = normalizeList(
      craftingRuns ??
        (terminal
          ? this._craftingRunManager?.getRunHistory?.(actor)
          : this._craftingRunManager?.getActiveRuns?.(actor))
    );
    // Resolved here when the pass did not resolve them, so this method stays self-sufficient
    // for a direct caller while `buildListing` still resolves each run's recipe exactly once
    // for both phases.
    const recipes = recipesByRunId ?? this._craftingRunRecipes(runs);
    const accessByRun = new Map(
      runs.map((run) => [
        run,
        this._craftingAccess({
          recipe: recipes.get(run?.id) ?? null,
          actor,
          viewer,
          snapshot,
        }),
      ])
    );
    const entitledHistory = terminal
      ? runs.filter((run) => accessByRun.get(run)?.visible === true && !run.isFizzle)
      : [];
    const crafting = runs.map((run, runIndex) =>
      this._craftingRunModel({
        run,
        actor,
        viewer,
        worldTime,
        terminal,
        recipe: recipes.get(run?.id) ?? null,
        snapshot,
        actorUuid,
        authority,
        access: accessByRun.get(run),
        // Native history is newest-first; its suffix establishes order for equal world times.
        entitledHistory: runs
          .slice(runIndex + 1)
          .filter((source) => entitledHistory.includes(source)),
      })
    );

    const salvage = normalizeList(
      terminal
        ? this._salvageRunManager?.getRunHistory?.(actor)
        : this._salvageRunManager?.getActiveRuns?.(actor)
    ).map((run) =>
      this._passthroughRunModel({
        run,
        runType: 'salvage',
        actor,
        actorUuid,
        viewer,
        worldTime,
        terminal,
        authority,
      })
    );

    const gathering = normalizeList(
      terminal
        ? this._gatheringRunSource?.getRunHistory?.(actor)
        : this._gatheringRunSource?.getActiveRuns?.(actor)
    ).map((run) =>
      this._passthroughRunModel({
        run,
        runType: 'gathering',
        actor,
        actorUuid,
        viewer,
        worldTime,
        terminal,
        authority,
      })
    );

    return dedupeRunModelsById(
      [...crafting, ...salvage, ...gathering].filter(Boolean),
      terminal ? 'history' : 'active'
    );
  }

  // ---------------------------------------------------------------------------
  // Crafting (fully projected)
  // ---------------------------------------------------------------------------

  /**
   * Resolve a crafting run's icon: the recipe's OWN `img`, per `data-models/spec.md`
   * `## Recipe` requirement 16.
   *
   * `resolveRecipeImage` keeps the item-bag sentinel treated as "no image", so a run
   * still falls back to the blueprint and never to the bag.
   *
   * @private
   */
  _resolveCraftingRunImg(recipe) {
    return stringOrNull(resolveRecipeImage(recipe));
  }

  _craftingRunModel({
    run,
    actor,
    viewer,
    worldTime,
    terminal,
    // Always supplied by `_buildRunModels`, which resolves the pass's recipes once (issue
    // 1228) rather than letting each run model perform its own lookup. `null` is a genuinely
    // unresolvable recipe — an edited or deleted id — and is projected, not re-queried.
    recipe = null,
    snapshot = null,
    actorUuid = null,
    authority = null,
    access = null,
    entitledHistory = [],
  }) {
    if (!run?.id) return null;
    if (run.isFizzle === true) {
      return this._fizzleRunModel({ run, actor, actorUuid, viewer, authority });
    }
    const system = this._getSystem(stringOrNull(run.craftingSystemId));
    // Keep the inherited identity fallback bounded; new evidence requires an
    // affirmative disclosure decision, independently of ownership/action access.
    const redacted = viewer?.isGM !== true && (!recipe || access?.visible === false);
    const historyEntitled = viewer?.isGM === true || access?.visible === true;

    const runSteps = normalizeList(run.steps);
    const recipeSteps =
      recipe && typeof recipe.getExecutionSteps === 'function' ? recipe.getExecutionSteps() : [];
    const stepCount = runSteps.length;
    const currentStepIndex =
      run.currentStepIndex == null ? null : numberOrNull(run.currentStepIndex);
    const status = stringOrNull(run.status) || 'inProgress';
    const activeStep =
      !terminal && Number.isFinite(currentStepIndex) ? runSteps[currentStepIndex] : null;
    // Eligibility must be derived before identity redaction removes the public steps.
    const activeCheck = resolveActiveCraftingCheckFormula({
      ...system,
      resolutionMode: this._resolveMode(recipe, system),
    });
    const hasPlayerCheck = Boolean(
      activeStep && (activeCheck.requiresCheck || activeCheck.checkUsable)
    );

    const systemId = stringOrNull(run.craftingSystemId);
    const availability =
      redacted || terminal
        ? null
        : this._stageAvailability({ actor, run, recipe, fallback: snapshot });
    const steps = redacted
      ? []
      : runSteps.map((runStep, index) =>
          this._craftingStepModel({
            runStep,
            recipeStep: recipeSteps[index] ?? null,
            system,
            recipe,
            index,
            systemId,
            actor,
            run,
            availability,
            isCurrent: !terminal && index === currentStepIndex,
            terminal,
            historyEntitled,
            entitledHistory,
          })
        );
    const currentStep =
      activeStep && Number.isFinite(currentStepIndex) ? (steps[currentStepIndex] ?? null) : null;

    const derivedStatus = this._deriveCraftingStatus({ status, activeStep, worldTime, run });
    // Active browsing follows the enabled multi-step feature. A terminal account
    // follows actual recorded attempts, independently of later authoring changes.
    const multiStepFeatureEnabled = system?.features?.multiStepRecipes === true;
    const multiStep = terminal
      ? steps.filter((step) => step.attempted).length > 1
      : multiStepFeatureEnabled && Array.isArray(recipe?.steps) && recipe.steps.length > 1;
    const failureReason = redacted ? null : this._craftingFailureReason(runSteps);
    // The step whose name annotates the label: the active step for a live run,
    // else the final step for a terminal run.
    const labelStep = terminal
      ? runSteps[stepCount - 1]
      : Number.isFinite(currentStepIndex)
        ? runSteps[currentStepIndex]
        : runSteps[0];
    const lifecycleProjection = this._runLifecycleProjection({
      run,
      runType: 'crafting',
      activityKind: this._resolveMode(recipe, system) === 'alchemy' ? 'alchemy' : 'crafting',
      actor,
      actorUuid,
      terminal,
      derivedStatus,
      timeGate: activeStep?.timeGate,
      hasPlayerCheck,
      selectionAvailability: currentStep?.selectionAvailability ?? null,
      stageStart: this._stageStartState({
        activeStep,
        recipeStep: recipeSteps[currentStepIndex],
        system,
      }),
      entitled: !redacted,
      evidenceEntitled: historyEntitled,
      authority,
    });

    return {
      id: stringOrNull(run.id),
      ...lifecycleProjection,
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
      img: redacted ? DEFAULT_RUN_IMAGE : this._resolveCraftingRunImg(recipe),
      stepIndex: Number.isFinite(currentStepIndex) ? currentStepIndex : null,
      stepCount,
      multiStep,
      // The final step of a recipe (single-step, or the last step of a
      // multi-step recipe) resolves the run rather than triggering a next step,
      // so the actions panel switches to completion copy.
      isFinalStep:
        stepCount <= 1 || (Number.isFinite(currentStepIndex) && currentStepIndex >= stepCount - 1),
      // "Step X of Y" bookkeeping is meaningless for a single-step recipe — the
      // structure chip ("Single-Step Recipe") already conveys it — so blank the
      // label there and let RunCard / RunDetail suppress the redundant chip. A
      // redacted run also blanks it so a hidden multi-step recipe does not leak
      // its step count / active step name.
      stepLabel:
        !redacted && multiStep
          ? this._stepLabel({
              stepCount,
              currentStepIndex,
              terminal,
              stepName: stringOrEmpty(labelStep?.stepName),
            })
          : '',
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
      resolutionModeLabel: terminal
        ? this._historicalModeLabel(steps)
        : this._resolutionModeLabel(recipe, system),
      recipeId: redacted ? null : stringOrNull(run.recipeId),
      taskId: null,
      flavor: '',
      failureReason,
      craftingYield: currentStep?.craftingYield ?? null,
      ...this._craftingResults(
        runSteps,
        redacted || !historyEntitled,
        stringOrNull(run.craftingSystemId)
      ),
      // `manualAdvance` states what the run TYPE needs, not what the viewer may do:
      // a crafting run always advances on a click, where gathering and salvage
      // auto-resolve off the world-time hook. Redaction must NOT suppress it
      // (issue 966) — nothing ever finishes a crafting run on its own, so a
      // redacted run with `false` here is a permanent zombie holding consumed
      // ingredients. The advance itself is authorized downstream by
      // `resolveAdvanceSources`, which owns the ownership check.
      manualAdvance: true,
      // A player may cancel their own in-progress craft (issue 848) only on an OWNED
      // actor (the engine writes items with no GM relay) and only while the run is
      // live. Redaction is deliberately NOT a condition (issue 966): a crafter who
      // cannot see what they started still gets to abandon it. `refundOnCancel`
      // mirrors the owning system's `features.refundOnPlayerCancel` (default ON) so
      // the UI can tell the player whether inputs will be returned before they confirm.
      canCancel: lifecycleProjection.actions.cancel,
      refundOnCancel: system?.features?.refundOnPlayerCancel !== false,
    };
  }

  /**
   * Project a no-signature alchemy fizzle history entry. It references no recipe,
   * so it carries a generic localized title and NO recipe/signature/step data — an
   * undiscovered recipe can never leak through it. Player visibility honours the
   * system's `alchemy.showAttemptHistoryToPlayers`: a non-GM viewer sees the entry
   * only when that flag is enabled (the GM always sees it). Returns null when the
   * entry must be hidden, so the caller's `.filter(Boolean)` drops it.
   * @private
   */
  _fizzleRunModel({ run, actor = null, actorUuid = null, viewer, authority = null }) {
    const system = this._getSystem(stringOrNull(run.craftingSystemId));
    const isGM = viewer?.isGM === true;
    const visibleToPlayers = system?.alchemy?.showAttemptHistoryToPlayers === true;
    if (!isGM && !visibleToPlayers) return null;
    const historyEntitled = this._nativeHistoryEntitled({ actor, viewer, run });

    const status = stringOrNull(run.status) || 'failed';
    const consumed =
      getRunLifecycleContract(run) === 'current'
        ? normalizeList(run.executionJournal?.effects).flatMap((effect) =>
            effect.kind === 'consumeAlchemyItems' && effect.phase === 'applied'
              ? normalizeList(effect.receipt?.items)
              : []
          )
        : normalizeList(run.consumedIngredients);
    return {
      id: stringOrNull(run.id),
      ...this._runLifecycleProjection({
        run,
        runType: 'crafting',
        activityKind: 'alchemy',
        actor,
        actorUuid,
        terminal: true,
        entitled: historyEntitled,
        derivedStatus: status,
        authority,
      }),
      runType: 'crafting',
      status,
      derivedStatus: status,
      craftingSystemId: stringOrNull(run.craftingSystemId),
      craftingSystemName: stringOrEmpty(system?.name),
      names: {
        title: this.localize('FABRICATE.App.Journal.Fizzle.Title'),
        subtitle: stringOrEmpty(system?.name),
      },
      redacted: false,
      img: DEFAULT_RUN_IMAGE,
      stepIndex: null,
      stepCount: 0,
      multiStep: false,
      isFinalStep: false,
      stepLabel: '',
      steps: [],
      currentStep: null,
      timeGate: null,
      startedAt: numberOrNull(run.startedAt),
      updatedAt: numberOrNull(run.updatedAt),
      finishedAt: numberOrNull(run.finishedAt),
      structureLabel: '',
      resolutionModeLabel: this.localize(MODE_LABEL_KEYS.alchemy),
      recipeId: null,
      taskId: null,
      flavor: '',
      failureReason: this.localize('FABRICATE.App.Journal.Fizzle.Failure'),
      craftingYield: null,
      createdResults: [],
      ...(historyEntitled && historyEvidenceFields(run)),
      consumedIngredients: historyEntitled
        ? consumed.map((entry) => this._mapResult(entry, run.craftingSystemId, false))
        : [],
      createdResultsRecorded:
        historyEntitled &&
        (run.historySettlement?.awards === 'complete' ||
          normalizeList(run.executionJournal?.effects).some(
            (effect) =>
              effect.kind === 'awardResults' &&
              effect.phase === 'applied' &&
              Array.isArray(effect.receipt?.results)
          )),
      createdResultCount: 0,
      isFizzle: true,
      manualAdvance: false,
    };
  }

  /**
   * Derive the actionable status for a crafting run. Terminal statuses pass
   * through. For an active run, readiness comes from the CURRENT step's time
   * gate — `ready` when `availableAt <= worldTime` — never from `run.status`,
   * because `processWorldTime` flips matured `waitingTime` runs to `inProgress`
   * asynchronously off the same hook. A step with no armed gate is `inProgress`
   * (actionable: the player begins it there).
   * @private
   */
  _deriveCraftingStatus({ status, activeStep, worldTime, run = null }) {
    if (TERMINAL_STATUSES.has(status)) return status;
    if (run?.pauseState) return 'paused';
    const availableAt = numberOrNull(activeStep?.timeGate?.availableAt);
    if (availableAt !== null) {
      return availableAt <= worldTime ? 'ready' : 'waiting';
    }
    return 'inProgress';
  }

  _craftingStepModel({
    runStep,
    recipeStep,
    system,
    recipe,
    index,
    systemId = null,
    actor = null,
    run = null,
    availability = null,
    isCurrent = false,
    terminal = false,
    historyEntitled = false,
    entitledHistory = [],
  }) {
    const evidence = historyEntitled ? craftingStepHistoryEvidence(runStep) : {};
    // The engine's own order: resolve the selection, THEN ask about tools excluding the items that
    // selection will spend, because one Item cannot be both (issue 1648, F4). `probeTools` is
    // called synchronously from inside `_selectionAvailability`, so its answer is readable here.
    let toolStates = null;
    const probeTools = ({ ingredientSet = null, excludedItems = null } = {}) => {
      toolStates = resolveStageToolStates({
        recipeManager: this._recipeManager,
        recipe,
        recipeStep,
        ingredientSet: ingredientSet ?? this._selectedCraftingIngredientSet(runStep, recipeStep),
        sourceActors: availability?.sourceActors ?? [],
        primaryActor: actor,
        excludedItems,
      });
      return toolStates;
    };
    const selectionAvailability = isCurrent
      ? this._selectionAvailability({
          runStep,
          recipeStep,
          recipe,
          actor,
          snapshot: availability?.snapshot ?? null,
          sourcesUnresolvable: availability?.sourcesUnresolvable === true,
          probeTools,
        })
      : null;
    if (isCurrent && toolStates === null) probeTools();
    const consumed = this._stageConsumedIngredients({
      runStep,
      run,
      systemId,
      historyEntitled,
      entitledHistory,
    });
    return {
      stepId: stringOrNull(runStep?.stepId),
      stepName: stringOrEmpty(runStep?.stepName),
      index,
      status: stringOrNull(runStep?.status) || 'pending',
      attempted: historicalStepAttempted(runStep, run, index),
      completedAt: historyEntitled ? recordedNumber(runStep?.completedAt) : null,
      presentationSnapshot: evidence.presentationSnapshot ?? null,
      resolutionSnapshot: evidence.resolutionSnapshot ?? null,
      ...(historyEntitled && historyEvidenceFields(runStep)),
      essenceSpend: evidence.essenceSpend ?? null,
      currencySpends:
        evidence.currencySpends ??
        (historyEntitled
          ? craftingStepHistoryEvidence(runStep?.preparedConsumption).currencySpends
          : null) ??
        null,
      timeGate: plainObjectOrNull(runStep?.timeGate),
      detail: this._stepDetail({
        runStep,
        recipeStep,
        system,
        recipe,
        terminal,
        historyEntitled,
        toolStates,
      }),
      lastCheckResult: this._checkResultModel(runStep?.lastCheckResult),
      // Requirements retain their authored identity; consumption retains physical receipts.
      // Only entitled consumption receives the separate historical metadata enrichment.
      requirements: normalizeList(runStep?.requirements).map((entry) =>
        this._mapResult(entry, systemId)
      ),
      consumedIngredients: consumed.map((entry) =>
        this._mapResult(entry, systemId, !historyEntitled)
      ),
      createdResults: normalizeList(historyEntitled ? runStep?.createdResults : null).map((entry) =>
        this._mapResult(entry, systemId)
      ),
      createdResultsRecorded:
        historyEntitled &&
        Array.isArray(runStep?.createdResults) &&
        !['pending', 'uncertain'].includes(runStep.historySettlement?.awards),
      usedTools: normalizeList(historyEntitled ? runStep?.usedTools : null).map((entry) =>
        this._historicalTool(entry, systemId)
      ),
      // A stage that has started spent its inputs and locked its choice (D-026/D-028).
      stageStarted: Boolean(runStep?.preparedConsumption),
      // ...and what it ACTUALLY spent, so the view never re-probes an inventory the stage
      // already emptied (issue 1648, M21).
      consumptionRecord: this._stageConsumptionRecord({ runStep, systemId, isCurrent }),
      selectionPlan: cloneJson(runStep?.selectionPlan) ?? null,
      selectedRequirementSnapshot: historyEntitled
        ? (cloneJson(runStep?.selectedRequirementSnapshot) ?? null)
        : null,
      requirementSnapshot:
        (historyEntitled ? cloneJson(runStep?.selectedRequirementSnapshot) : null) ??
        cloneJson(runStep?.requirements) ??
        [],
      craftingYield: isCurrent
        ? this._craftingYieldPreview({ runStep, recipeStep, system, recipe, index })
        : null,
      yieldPreview:
        historyEntitled &&
        !terminal &&
        Number.isInteger(run?.currentStepIndex) &&
        index > run.currentStepIndex
          ? this._futureCraftingYieldPreview({ recipeStep, system, recipe, index })
          : null,
      inputPreview:
        historyEntitled &&
        !terminal &&
        Number.isInteger(run?.currentStepIndex) &&
        index > run.currentStepIndex
          ? this._futureCraftingInputs({ recipeStep, system, recipe, index })
          : null,
      selectionAvailability,
    };
  }

  /** A stage's recorded consumption, enriched from earlier terminal evidence when entitled. */
  _stageConsumedIngredients({ runStep, run, systemId, historyEntitled, entitledHistory }) {
    if (!historyEntitled) return normalizeList(runStep?.consumedIngredients);
    return enrichHistoricalConsumption(runStep, {
      earlierItems: historicalItemSources(
        entitledHistory,
        runStep?.startedAt ?? run?.startedAt ?? runStep?.completedAt ?? run?.finishedAt,
        { sameTimeIsEarlier: true }
      ),
      liveItem: this._getResultItem,
      component: (id) => this._getComponent(systemId, id),
    });
  }

  /**
   * The START-TIME CONSUMPTION RECEIPT of a stage that has begun (issue 1648, M21).
   *
   * A started stage's materials are gone, so the live held/needed probe that describes an
   * OPEN stage describes nothing about a started one — it reported `0/0` against an essence
   * the stage had already spent. This reads `preparedConsumption` instead, which
   * `markStepStarted` writes at the moment of the commit, and it is NEVER derived from the
   * authored requirement snapshot: a synthesised record would restate the intent as though
   * it were the receipt.
   *
   * `consumedSummary` carries every physical item the stage consumed on ONE footing —
   * fixed components, tag-matched items and essence carriers alike — and `essenceSpend`
   * carries the per-carrier contributions the terminal screen already renders. A row whose
   * quantity was never captured keeps a null quantity, which the view reports as unrecorded
   * rather than filling in from the requirement it was matched against.
   *
   * Scoped to the CURRENT stage of a live run, which is the only surface that reads it: a
   * terminal run's record is already projected as `consumedIngredients` under the history
   * entitlement rule, and widening it here would route recorded evidence around that rule.
   *
   * `currencySpends` rides with them: a stage whose only requirement was a price recorded its
   * settlement here and nowhere the live view read, so the whole started branch rendered blank
   * (issue 1648, QE2-3).
   *
   * The catalogue fallback is NOT gated on history entitlement, and that is deliberate rather than
   * an omission (issue 1648, QE2-7). `consumedIngredients` passes `!historyEntitled` as
   * `resolveMetadata` because an ENTITLED viewer's rows are enriched separately, from earlier
   * terminal evidence; this record has no such enrichment, so the same argument would strip an
   * entitled viewer's own receipt of names it is plainly entitled to.
   *
   * @private
   * @returns {{materials: object[], essence: object|null, currencySpends: object[]}|null} `null`
   *   unless this is the current stage of a live run and that stage has started.
   */
  _stageConsumptionRecord({ runStep, systemId, isCurrent }) {
    const prepared = isCurrent ? plainObjectOrNull(runStep?.preparedConsumption) : null;
    if (!prepared) return null;
    return {
      materials: normalizeList(prepared.consumedSummary).map((entry) =>
        this._mapResult(entry, systemId)
      ),
      essence: craftingStepHistoryEvidence(prepared).essenceSpend ?? null,
      currencySpends: normalizeList(prepared.currencySpends).map((spend) => ({
        unit: stringOrEmpty(spend?.unit),
        amount: numberOrNull(spend?.amount),
      })),
    };
  }

  /**
   * The read-only requirement view of a started stage: the locked route and the option the
   * run actually spent, with no live probe and no editable choice.
   * @private
   * @returns {object} A `selectionAvailability` reporting a satisfied, locked selection.
   */
  _lockedSelectionAvailability({ runStep, ingredientSet, recipe, setId, toolStates = null }) {
    const system = this._getSystem(stringOrNull(recipe?.craftingSystemId));
    // The locked OPTION, not the locked item: a consumed item id resolves to no live
    // candidate, which would otherwise read as a stale selection on a stage already paid for.
    const overrides = Object.fromEntries(
      Object.entries(
        plainObjectOrNull(runStep?.selectionPlan?.ingredientOptionOverrides) ?? {}
      ).map(([groupId, entry]) => [groupId, { optionIndex: Number(entry?.optionIndex) || 0 }])
    );
    return {
      locked: true,
      selectedIngredientSetId: setId,
      routes: [{ id: setId, name: stringOrEmpty(ingredientSet?.name) }],
      staleRoute: false,
      success: true,
      // Its inputs are spent and its choice is locked, but tools are never consumed and are
      // re-validated live at resolve time: one sold during the wait still refuses the stage.
      blocker: normalizeList(toolStates).some((tool) => tool?.available !== true)
        ? STAGE_BLOCKERS.tool
        : null,
      awaitingChoice: false,
      knownMaterialShortfall: false,
      missingGroups: [],
      choices: [],
      requirements: normalizeList(ingredientSet.ingredientGroups).map((group) =>
        this._requirementPresentation({
          group,
          recipe,
          items: [],
          optionOverrides: overrides,
          selection: null,
          system,
          choice: null,
        })
      ),
      essencePool: null,
    };
  }

  /**
   * Future StepModel.yieldPreview uses the stage's authored output and never borrows
   * current intent. Ingredient routing enumerates {id,name,entries} routes without
   * selecting one; other modes retain the existing entries/tiers/progressive shape.
   *
   * @private
   * @returns {object|null}
   */
  _futureCraftingYieldPreview({ recipeStep, system, recipe, index }) {
    if (this._resolveMode(recipe, system) !== 'routedByIngredients') {
      return this._craftingYieldPreview({ runStep: {}, recipeStep, system, recipe, index });
    }
    return {
      source: 'preview',
      stageIndex: index,
      mode: 'routedByIngredients',
      presentation: 'routes',
      routes: normalizeList(recipeStep?.ingredientSets).map((set) => ({
        id: stringOrNull(set?.id),
        name: stringOrEmpty(set?.name),
        entries:
          this._craftingYieldPreview({
            runStep: { selectedIngredientSetId: set?.id },
            recipeStep,
            system,
            recipe,
            index,
          })?.entries ?? [],
      })),
    };
  }

  _futureCraftingInputs({ recipeStep, system, recipe, index }) {
    return {
      source: 'preview',
      stageIndex: index,
      routes: normalizeList(recipeStep?.ingredientSets).map((set) => ({
        id: stringOrNull(set?.id),
        name: stringOrEmpty(set?.name),
        groups: normalizeList(set?.ingredientGroups).map((group) => ({
          id: stringOrNull(group?.id),
          name: stringOrEmpty(group?.name),
          options: normalizeList(group?.options).map((option, optionIndex) => {
            const { id, kind, name, img, icon, colorToken, need } =
              this._ingredientOptionPresentation({
                group,
                option,
                index: optionIndex,
                recipe,
                system,
                items: [],
              });
            return { id, kind, name, img, icon, colorToken, need };
          }),
        })),
      })),
    };
  }

  _craftingYieldPreview({ runStep, recipeStep, system, recipe, index }) {
    if (!runStep || !recipeStep || !system || !recipe) return null;
    const mode = this._resolveMode(recipe, system);
    if (
      !['simple', 'routedByIngredients', 'routedByCheck', 'progressive', 'alchemy'].includes(mode)
    ) {
      return null;
    }
    const base = {
      source: 'preview',
      stageIndex: index,
      mode,
      entries: [],
      tiers: [],
      progressive: null,
    };
    if (mode === 'progressive') {
      const progressive = this._craftingProgressivePreview({ recipe, recipeStep, system });
      return progressive ? { ...base, presentation: 'progressive', progressive } : null;
    }
    const alchemyCheckMode = stringOrNull(system?.alchemy?.checkMode) || 'none';
    if (mode === 'routedByCheck' || (mode === 'alchemy' && alchemyCheckMode === 'tiered')) {
      const tiers = this._craftingOutcomeTiers({ recipe, recipeStep, system, mode });
      return tiers ? { ...base, presentation: 'tiers', tiers } : null;
    }
    const groups = this._craftingDirectResultGroups({
      runStep,
      recipeStep,
      recipe,
      mode,
    });
    if (!groups) return null;
    const systemId = stringOrNull(recipe.craftingSystemId);
    return {
      ...base,
      presentation: 'entries',
      entries: groups.flatMap((group) =>
        normalizeList(group?.results).map((result, resultIndex) =>
          this._yieldEntry(result, systemId, resultIndex, 100)
        )
      ),
    };
  }

  _craftingDirectResultGroups({ runStep, recipeStep, recipe, mode }) {
    const resolve = this._resolutionModeService?.resolveResultGroups;
    if (typeof resolve !== 'function') return null;
    let ingredientSet = null;
    if (mode === 'routedByIngredients') {
      ingredientSet = this._selectedCraftingIngredientSet(runStep, recipeStep);
      if (!ingredientSet) return null;
    }
    try {
      return normalizeList(
        resolve.call(this._resolutionModeService, {
          recipe,
          step: recipeStep,
          ingredientSet,
          checkResult: null,
          selectedResultGroupId: stringOrNull(runStep?.selectedResultGroupId),
        })?.groups
      );
    } catch {
      return null;
    }
  }

  _selectedCraftingIngredientSet(runStep, recipeStep) {
    const selectedId = stringOrNull(
      runStep?.selectionPlan?.selectedIngredientSetId ?? runStep?.selectedIngredientSetId
    );
    if (!selectedId) return null;
    return (
      normalizeList(recipeStep?.ingredientSets).find(
        (ingredientSet) => stringOrNull(ingredientSet?.id) === selectedId
      ) ?? null
    );
  }

  _craftingOutcomeTiers({ recipe, recipeStep, system, mode }) {
    const resolve = this._resolutionModeService?.resolveResultGroups;
    if (typeof resolve !== 'function') return null;
    const routed = plainObjectOrNull(system?.craftingCheck?.routed) ?? {};
    const outcomes =
      routed.type === 'fixed'
        ? normalizeList(routed.fixedOutcomes)
        : normalizeList(routed.relativeOutcomes);
    const permitsFailure = activityPermitsFailureResults(system, 'crafting');
    const systemId = stringOrNull(recipe.craftingSystemId);
    const dc = this._resolveCheckDc({ config: routed, recipe, mode });
    try {
      return outcomes.map((outcome, index) => {
        const fail = outcome?.success !== true;
        const resolved =
          fail && !permitsFailure
            ? null
            : resolve.call(this._resolutionModeService, {
                recipe,
                step: recipeStep,
                checkResult: { success: !fail, outcome: stringOrNull(outcome?.name) },
              });
        const results = normalizeList(resolved?.groups).flatMap((group) =>
          normalizeList(group?.results)
        );
        return {
          id: stringOrNull(outcome?.id) || `tier-${index + 1}`,
          name: stringOrEmpty(outcome?.name).trim(),
          band: craftingOutcomeBand(outcome, routed, dc),
          fail,
          yields: results.map((result, resultIndex) =>
            this._tierYield(result, systemId, resultIndex)
          ),
        };
      });
    } catch {
      return null;
    }
  }

  _craftingProgressivePreview({ recipe, recipeStep, system }) {
    const occurrences = this._resolutionModeService?.progressiveStageOccurrences;
    if (typeof occurrences !== 'function') return null;
    try {
      return {
        awardMode: stringOrNull(system?.craftingCheck?.progressive?.awardMode) || 'equal',
        stages: normalizeList(
          occurrences.call(this._resolutionModeService, { recipe, step: recipeStep })
        ).map((occurrence, index) => {
          const componentId = stringOrNull(occurrence?.componentId);
          const component =
            plainObjectOrNull(occurrence?.component) ??
            (componentId
              ? this._getComponent(stringOrNull(recipe.craftingSystemId), componentId)
              : null);
          return compactPresentation({
            id: stringOrNull(occurrence?.resultId) || componentId || `stage-${index + 1}`,
            name: stringOrEmpty(component?.name) || stringOrEmpty(componentId),
            art: stringOrNull(component?.img),
            icon: stringOrNull(component?.icon),
            tint: stringOrNull(component?.tint ?? component?.colorToken),
            quantity: '×1',
            cost: numberOrNull(component?.difficulty),
          });
        }),
      };
    } catch {
      return null;
    }
  }

  /**
   * What the live stage is judged against: the inventory the run draws on, and the actors it
   * draws it from — the second answers tool presence, which no snapshot carries.
   * @private
   * @returns {{snapshot: object|null, sourceActors: object[]}}
   */
  _stageAvailability({ actor, run, recipe, fallback }) {
    let sourceActors;
    try {
      sourceActors = normalizeList(this._getComponentSourceActors({ actor, run }));
    } catch {
      sourceActors = [];
    }
    // A RECORDED source the world no longer holds means this stage is being judged against an
    // inventory that is not its own, and the engine refuses it outright ("The crafting component
    // sources changed after the run started"). The resolver falls back to the crafting actor, so
    // an absent source is invisible in the resolved list and has to be found by comparing what the
    // run RECORDED against what resolved (issue 1648, F5).
    const resolved = new Set(
      (sourceActors.length > 0 ? sourceActors : actor ? [actor] : []).map((source) =>
        stringOrNull(source?.uuid)
      )
    );
    const sourcesUnresolvable = normalizeList(run?.componentSourceActorUuids).some(
      (uuid) => !resolved.has(stringOrNull(uuid))
    );
    if (sourceActors.length === 0) {
      return { snapshot: fallback, sourceActors: actor ? [actor] : [], sourcesUnresolvable };
    }
    return {
      snapshot: buildPassInventorySnapshot({
        craftingActor: actor,
        componentSourceActors: sourceActors,
        recipes: [recipe],
        resolveComponent: this._resolveComponentForItem,
      }),
      sourceActors,
      sourcesUnresolvable,
    };
  }

  _selectionAvailability({
    runStep,
    recipeStep,
    recipe,
    actor,
    snapshot,
    sourcesUnresolvable = false,
    probeTools = () => null,
  }) {
    const plan = runStep?.selectionPlan;
    const sets = normalizeList(recipeStep?.ingredientSets);
    // One authored route is not a choice, so a stage that has not chosen yet still reads as
    // the only route it could take rather than as a stale selection.
    const setId =
      stringOrNull(plan?.selectedIngredientSetId ?? runStep?.selectedIngredientSetId) ??
      (sets.length === 1 ? stringOrNull(sets[0]?.id) : null);
    const ingredientSet = sets.find((set) => stringOrNull(set?.id) === setId) ?? null;
    const routes = sets.map((set) => ({
      id: stringOrNull(set?.id),
      name: stringOrEmpty(set?.name),
    }));
    // A started stage already holds what it needs: it is reported as SPENT rather than
    // probed against an inventory the consumption has emptied, which would otherwise read
    // back as a material shortfall and block the run it already paid for.
    const held = snapshot ? snapshot.heldItems().map((entry) => entry.item) : [];
    if (runStep?.preparedConsumption && ingredientSet) {
      // What a tool probe must exclude here is whatever of the spent inputs is still physically
      // present: a partially consumed stack stays in inventory after the start commit.
      const excludedItems = startedStageItems(runStep, held);
      const toolStates = probeTools({ ingredientSet, excludedItems });
      return this._lockedSelectionAvailability({
        runStep,
        ingredientSet,
        recipe,
        setId,
        toolStates,
      });
    }
    // A STARTED stage cannot be told to choose: its route is locked, so no selection control can
    // repair a route the recipe no longer holds. It reports the edit; cancel is the way out.
    if (!ingredientSet) {
      return unchosenRouteAvailability(setId, routes, Boolean(runStep?.preparedConsumption));
    }
    if (typeof ingredientSet.resolveIngredientSelection !== 'function' || !snapshot) {
      return null;
    }
    const items = held;
    const optionOverrides = plainObjectOrNull(plan?.ingredientOptionOverrides) ?? {};
    const essenceAllocation = this._scopedEssenceAllocation(plan, runStep, ingredientSet);
    const selection = this._resolveIngredientSelection({
      ingredientSet,
      recipe,
      actor,
      items,
      optionOverrides,
      essenceAllocation,
    });
    const system = this._getSystem(stringOrNull(recipe?.craftingSystemId));
    const choices = normalizeList(ingredientSet.ingredientGroups).map((group) =>
      this._choiceAvailability({
        group,
        ingredientSet,
        recipe,
        actor,
        items,
        optionOverrides,
        essenceAllocation,
        system,
        selection,
      })
    );
    const choicesByGroup = new Map(choices.map((choice) => [choice.groupId, choice]));
    if (routes.length > 1) {
      this._describeRoutes({
        routes,
        sets,
        setId,
        selection,
        recipe,
        recipeStep,
        actor,
        items,
        system,
      });
    }
    const toolStates = probeTools({
      ingredientSet,
      excludedItems: selectedIngredientItems(selection),
    });
    // ONE readiness verdict, from the predicate the engine's own stage commands consult.
    const readiness = classifyStageReadiness({
      selection,
      inputsComplete: stageSelectionInputsComplete(ingredientSet, plan, runStep?.stepId),
      toolsAvailable: normalizeList(toolStates).every((tool) => tool?.available === true),
      currencyAffordable: this._affordsCurrencySpends({ actor, recipe, selection }),
    });
    // An unresolvable source set means every verdict above was reached against the wrong
    // inventory, so it reports itself rather than whichever shortfall that inventory happened to
    // show (issue 1648, F5).
    const blocker = sourcesUnresolvable ? 'sourcesUnavailable' : readiness.blocker;
    return {
      selectedIngredientSetId: setId,
      routes,
      staleRoute: false,
      success: selection?.success === true,
      blocker,
      awaitingChoice: isChoiceBlocker(blocker),
      knownMaterialShortfall: blocker === STAGE_BLOCKERS.material,
      missingGroups: normalizeList(selection?.missingGroups).map(safeMissingGroup),
      choices,
      requirements: normalizeList(ingredientSet.ingredientGroups).map((group) =>
        this._requirementPresentation({
          group,
          recipe,
          items,
          optionOverrides,
          selection,
          system,
          choice: choicesByGroup.get(stringOrNull(group?.id)) ?? null,
        })
      ),
      essencePool: this._safeEssencePool(selection?.essencePool, system),
    };
  }

  /** Each alternative route's shortfall, unmade-pick state and yield, described in place. */
  _describeRoutes({ routes, sets, setId, selection, recipe, recipeStep, actor, items, system }) {
    for (const route of routes) {
      const set = sets.find((candidate) => candidate.id === route.id);
      const probe =
        route.id === setId
          ? selection
          : this._resolveIngredientSelection({
              ingredientSet: set,
              recipe,
              actor,
              items,
              optionOverrides: {},
              essenceAllocation: null,
            });
      route.shortfallCount = acquisitionShortfallCount(probe);
      route.needsSelection = probe?.success !== true && route.shortfallCount === 0;
      route.entries =
        this._craftingYieldPreview({
          runStep: { selectedIngredientSetId: route.id },
          recipeStep,
          recipe,
          system,
          index: 0,
        })?.entries ?? [];
    }
  }

  /**
   * Whether the actor can afford the selection's currency AS A SET. The resolver's own probe is
   * PER OPTION, so two currency ingredients each affordable alone but not together resolved as
   * success and were then refused by the engine's aggregate gate (issue 1648, F2). `true` when
   * nothing can answer, which is the predicate's stated meaning for an unanswerable input.
   * @private
   */
  _affordsCurrencySpends({ actor, recipe, selection }) {
    const currencySpends = normalizeList(selection?.currencySpends);
    if (currencySpends.length === 0 || !this._affordCurrencySpends) return true;
    try {
      return this._affordCurrencySpends({ actor, recipe, currencySpends }) !== false;
    } catch {
      return true;
    }
  }

  _resolveIngredientSelection({
    ingredientSet,
    recipe,
    actor,
    items,
    optionOverrides,
    essenceAllocation,
    editFeasibility = false,
  }) {
    // The shared resolver treats invalid overrides as absent for legacy callers.
    // Persisted Journal intent must instead remain blocked until explicitly replaced.
    const invalidGroups = normalizeList(ingredientSet.ingredientGroups).filter(
      (group) => ingredientOverrideIndex(group, optionOverrides) === null
    );
    if (invalidGroups.length > 0 && !editFeasibility) {
      return {
        success: false,
        selectedIngredients: [],
        missingGroups: invalidGroups.map((group) => ({ group })),
      };
    }
    // An unresolvable option has no physical claim to test. Omit it ONLY from a
    // candidate-edit probe: every resolvable group still shares the canonical stock
    // ledger, and the persisted plan/full-stage readiness above remain untouched.
    const resolvableSet =
      invalidGroups.length === 0
        ? ingredientSet
        : Object.create(ingredientSet, {
            ingredientGroups: {
              value: ingredientSet.ingredientGroups.filter(
                (group) => !invalidGroups.includes(group)
              ),
            },
          });
    const ingredientMatchesItem = this._recipeManager?.ingredientMatchesItem;
    const matcher =
      typeof ingredientMatchesItem === 'function'
        ? (ingredient, item) =>
            ingredientMatchesItem.call(
              this._recipeManager,
              recipe,
              ingredient,
              item,
              this._resolveComponentForItem
            )
        : null;
    return resolvableSet.resolveIngredientSelection(items, matcher, {
      optionOverrides,
      essenceAllocation,
      resolveItemEssences:
        typeof this._resolveItemEssences === 'function'
          ? (item) => this._resolveItemEssences({ item, recipe })
          : undefined,
      affordCurrency:
        typeof this._affordCurrency === 'function'
          ? (match) => this._affordCurrency({ actor, recipe, match }) === true
          : undefined,
    });
  }

  _choiceAvailability({
    group,
    ingredientSet,
    recipe,
    actor,
    items,
    optionOverrides,
    essenceAllocation,
    system,
    selection,
  }) {
    const groupId = stringOrNull(group?.id);
    const selectedOptionIndex = selectedIngredientIndex(group, optionOverrides, selection);
    const options = normalizeList(group?.options).map((option, index) => {
      const candidate = this._resolveIngredientSelection({
        ingredientSet,
        recipe,
        actor,
        items,
        optionOverrides: {
          ...optionOverrides,
          [groupId]: { optionIndex: index },
        },
        essenceAllocation,
        editFeasibility: true,
      });
      const presentation = this._ingredientOptionPresentation({
        group,
        option,
        index,
        available: candidate?.success === true,
        recipe,
        items,
        system,
      });
      presentation.candidates = presentation.candidates.map((item) => {
        const resolved = this._resolveIngredientSelection({
          ingredientSet,
          recipe,
          actor,
          items,
          essenceAllocation,
          editFeasibility: true,
          optionOverrides: {
            ...optionOverrides,
            [groupId]: { optionIndex: index, heldItemId: item.itemId },
          },
        });
        const claimed = normalizeList(resolved?.plan)
          .filter(
            (entry) =>
              entry.ingredient !== option &&
              (stringOrNull(entry.item?.uuid) || stringOrNull(idOf(entry.item))) === item.itemId
          )
          .reduce((sum, entry) => sum + Math.max(0, Number(entry.quantity) || 0), 0);
        return { ...item, claimed, available: resolved?.success === true };
      });
      return presentation;
    });
    return { groupId, selectedOptionIndex, options };
  }

  _requirementPresentation({ group, recipe, items, optionOverrides, selection, system, choice }) {
    const groupId = stringOrNull(group?.id);
    const selectedOptionIndex = selectedIngredientIndex(group, optionOverrides, selection);
    const option = normalizeList(group?.options)[selectedOptionIndex] ?? null;
    const selectedMissing = normalizeList(selection?.missingGroups).some(
      (missing) => missingGroupId(missing) === groupId
    );
    const presentation =
      choice?.options?.[selectedOptionIndex] ??
      this._ingredientOptionPresentation({
        group,
        option,
        index: selectedOptionIndex,
        available: !selectedMissing,
        recipe,
        items,
        system,
      });
    return {
      groupId,
      name: stringOrEmpty(group?.name),
      selectedOptionIndex,
      selectedItemId: stringOrNull(optionOverrides?.[groupId]?.heldItemId),
      option: option ? { ...presentation, available: !selectedMissing } : null,
    };
  }

  _ingredientOptionPresentation({ group, option, index, available, recipe, items, system }) {
    const match = plainObjectOrNull(option?.match);
    const kind = ingredientKind(option);
    const definition =
      kind === 'essence'
        ? (resolvedEssencesFor(system).find((entry) => entry?.id === match?.essenceId) ?? null)
        : null;
    const componentId = kind === 'component' ? stringOrNull(match?.componentId) : null;
    const component = componentId
      ? this._getComponent(stringOrNull(recipe?.craftingSystemId), componentId)
      : null;
    const candidates = this._ingredientCandidates({ option, recipe, items });
    const name = ingredientOptionName({ group, option, kind, match, definition, component });
    return {
      index,
      id: stringOrNull(option?.id) || `${stringOrEmpty(group?.id)}:${index}`,
      kind,
      name,
      img:
        stringOrNull(component?.img) ||
        (kind === 'item' ? stringOrNull(candidates[0]?.img) : null) ||
        (kind === 'tag' ? stringOrNull(candidates[0]?.img) : null),
      icon: stringOrNull(definition?.icon),
      colorToken: stringOrNull(definition?.colorToken),
      need: ingredientNeed(option),
      available: available === true,
      candidates,
    };
  }

  _ingredientCandidates({ option, recipe, items }) {
    const kind = ingredientKind(option);
    if (!['component', 'tag', 'item'].includes(kind)) return [];
    const matcher = this._recipeManager?.ingredientMatchesItem;
    if (typeof matcher !== 'function') return [];
    const need = ingredientNeed(option);
    return items
      .filter((item) =>
        matcher.call(this._recipeManager, recipe, option, item, this._resolveComponentForItem)
      )
      .map((item) => {
        const held = readStackQuantity(item);
        return {
          itemId: stringOrNull(item?.uuid) || stringOrNull(idOf(item)),
          name: stringOrEmpty(item?.name),
          img: stringOrNull(item?.img),
          held,
          available: held >= need,
        };
      });
  }

  _safeEssencePool(pool, system) {
    if (!pool || typeof pool !== 'object') return null;
    const definitions = new Map(
      resolvedEssencesFor(system).map((definition) => [stringOrNull(definition?.id), definition])
    );
    return {
      requirements: normalizeList(pool.requirements).map((requirement) => {
        const definition = definitions.get(stringOrNull(requirement?.essenceId));
        return {
          groupId: stringOrNull(requirement?.groupId),
          essenceId: stringOrNull(requirement?.essenceId),
          name: stringOrEmpty(definition?.name) || stringOrEmpty(requirement?.essenceId),
          icon: stringOrNull(definition?.icon),
          colorToken: stringOrNull(definition?.colorToken),
          need: numberOrNull(requirement?.need) ?? 0,
          delivered: numberOrNull(requirement?.delivered) ?? 0,
          owned: numberOrNull(requirement?.owned) ?? 0,
          satisfied: requirement?.satisfied === true,
        };
      }),
      carriers: normalizeList(pool.carriers).map((carrier) => ({
        itemKey: stringOrNull(carrier?.itemKey),
        name: stringOrNull(carrier?.item?.name),
        img: stringOrNull(carrier?.item?.img),
        perUnit: cloneJson(carrier?.perUnit) ?? {},
        ownedUnits: numberOrNull(carrier?.ownedUnits) ?? 0,
        allocatedUnits: numberOrNull(carrier?.allocatedUnits) ?? 0,
      })),
      allocation: cloneJson(pool.allocation) ?? {},
      suggested: cloneJson(pool.suggested) ?? {},
      totals: cloneJson(pool.totals) ?? {},
    };
  }

  _scopedEssenceAllocation(plan, runStep, ingredientSet) {
    return plainObjectOrNull(
      scopedEssenceAllocation(plan?.ingredientEssenceAllocation, runStep?.stepId, ingredientSet?.id)
    );
  }

  _stepDetail({
    runStep,
    recipeStep,
    system,
    recipe,
    terminal = false,
    historyEntitled = false,
    toolStates = null,
  }) {
    if (terminal) {
      return {
        requiredSeconds: recordedNumber(runStep?.timeGate?.requiredSeconds),
        tools: [],
        checkLabel: null,
        failureText: stringOrNull(runStep?.failureReason),
      };
    }
    // Every authored tool, with its artwork: a step has REQUIRED tools and nothing else, so
    // there is no "primary" one to elect (issue 1648).
    const systemId = stringOrNull(recipe?.craftingSystemId);
    // A live stage reports whether each tool is HELD (issue 1648): a tool it lacks refuses the
    // stage. An authored-only view has no held state to resolve and keeps the authored list.
    const tools =
      toolStates ??
      normalizeList(recipeStep?.toolIds)
        .map((toolId) => this._getTool(systemId, toolId))
        .filter((tool) => stringOrEmpty(tool?.name))
        .map((tool) => ({
          id: stringOrNull(tool.id),
          name: stringOrEmpty(tool.name),
          img: stringOrNull(tool.img),
        }));
    const requiredSeconds =
      numberOrNull(runStep?.timeGate?.requiredSeconds) ??
      durationToSeconds(recipeStep?.timeRequirement);
    const failureReason = stringOrNull(runStep?.failureReason);
    return {
      requiredSeconds: requiredSeconds > 0 ? requiredSeconds : null,
      tools,
      checkLabel: this._checkLabel({ system, recipe }),
      checkKind: historyEntitled ? this._activeCheckKind({ system, recipe }) : 'unknown',
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
      value: recordedNumber(lastCheckResult.value),
      reason: stringOrNull(lastCheckResult.reason),
      formula: stringOrNull(data.resolvedFormula) || stringOrNull(data.formula),
      total: recordedNumber(data.total) ?? recordedNumber(lastCheckResult.value),
      dc: recordedNumber(data.dc),
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
    const { config, rollFormula } = resolveActiveCraftingCheckFormula({
      ...system,
      resolutionMode: mode,
    });
    const formula = stringOrNull(rollFormula);
    if (!formula) return null;
    const dc = this._resolveCheckDc({ config, recipe, mode });
    return dc === null
      ? formula
      : this.localize('FABRICATE.App.Journal.StepDetails.CheckWithDc', { formula, dc });
  }

  _activeCheckKind({ system, recipe }) {
    if (!system || !recipe) return 'unknown';
    const check = resolveActiveCraftingCheckFormula({
      ...system,
      resolutionMode: this._resolveMode(recipe, system),
    });
    if (check.checkUsable) return 'check';
    return check.requiresCheck ? 'unknown' : 'none';
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

  // Captures win over display fallbacks. Already enriched consumption disables further
  // lookups so conflicting evidence cannot silently regain a weaker catalogue label.
  _mapResult(result, systemId = null, resolveMetadata = true) {
    const itemUuid = stringOrNull(result?.itemUuid);
    const componentId = stringOrNull(result?.componentId);
    const quantity = recordedNumber(result?.quantity);
    let name = stringOrNull(result?.name);
    let img = stringOrNull(result?.img);
    if (resolveMetadata && (!name || !img) && itemUuid) {
      const doc = this._getResultItem(itemUuid);
      name ||= stringOrNull(doc?.name);
      img ||= stringOrNull(doc?.img);
    }
    if (resolveMetadata && (!name || !img) && componentId && systemId) {
      const component = this._getComponent(systemId, componentId);
      name ||= stringOrNull(component?.name);
      img ||= stringOrNull(component?.img);
    }
    const amountLabel = rolledAmountLabel(result, this.localize);
    return {
      actorUuid: stringOrNull(result?.actorUuid),
      componentId,
      itemUuid,
      quantity: quantity !== null && quantity >= 0 ? quantity : null,
      name,
      img,
      // Omitted for a fixed amount, so every fixed projection is unchanged (issue 1645).
      ...(amountLabel && { amountLabel }),
    };
  }

  // Called only after affirmative history entitlement. Catalogue fallback fills display
  // metadata only; it cannot establish an Item identity, quantity or historical state.
  _historicalTool(entry, systemId) {
    const mapped = this._mapResult(entry, systemId);
    const toolId = stringOrNull(entry?.toolId);
    if ((!mapped.name || !mapped.img) && toolId && systemId) {
      try {
        const tool = this._getTool(systemId, toolId);
        mapped.name ||= stringOrNull(tool?.name);
        mapped.img ||= stringOrNull(tool?.img);
      } catch {
        // Deleted or unavailable definitions leave the captured/unknown display intact.
      }
    }
    return {
      ...mapped,
      toolId,
      ...Object.fromEntries(
        ['broken', 'virtual', 'spared', 'skippedImmune']
          .filter((flag) => typeof entry?.[flag] === 'boolean')
          .map((flag) => [flag, entry[flag]])
      ),
    };
  }

  _craftingResults(runSteps, redacted, systemId = null) {
    if (redacted) return { createdResults: [], createdResultCount: 0 };
    const createdResults = normalizeList(runSteps).flatMap((step) =>
      normalizeList(step?.createdResults).map((result) => this._mapResult(result, systemId))
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

  _historicalModeLabel(steps) {
    const mode = steps.find((step) => step.attempted && step.resolutionSnapshot)?.resolutionSnapshot
      .mode;
    return MODE_LABEL_KEYS[mode] ? this.localize(MODE_LABEL_KEYS[mode]) : '';
  }

  /**
   * Read current-viewer disclosure once. Missing or failed evaluation is unknown,
   * never affirmative entitlement for historical enrichments.
   * @private
   */
  _craftingAccess({ recipe, actor, viewer, snapshot = null }) {
    // The GM bypass must precede the missing-recipe guard (issue 738): a recipe that
    // no longer resolves (edited id / deleted) still has a run whose persisted step
    // snapshots (requirements, roll, consumed items) the GM must see — collapsing it
    // to a redacted empty card hid a GM's own history. A non-GM viewer still cannot
    // verify visibility of an unresolvable recipe, so it stays redacted for them.
    if (viewer?.isGM === true) return { visible: true };
    if (!recipe) return null;
    if (typeof this._recipeVisibility?.evaluateRecipeAccess !== 'function') return null;
    try {
      const access = this._recipeVisibility.evaluateRecipeAccess({
        recipe,
        viewer,
        craftingActor: actor,
        // The per-pass snapshot (issue 1228). A pure read optimisation for the knowledge
        // branches — omit it and this is byte-for-byte what it was, at one whole inventory
        // walk per run.
        snapshot,
      });
      return access;
    } catch {
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Gathering / salvage passthrough (Slice A: null-step re-map; full detail is
  // Phase 2). Re-maps native fields onto the common RunModel shape without
  // surfacing step internals, and never returns raw documents (cloned primitives
  // only). Gathering uses `*WorldTime` field names; salvage uses the crafting
  // `startedAt/updatedAt/finishedAt` names.
  // ---------------------------------------------------------------------------

  _passthroughRunModel({
    run,
    runType,
    actor = null,
    actorUuid = null,
    viewer = null,
    worldTime,
    terminal,
    authority = null,
  }) {
    if (!run?.id) return null;
    const historyEntitled = this._nativeHistoryEntitled({ actor, viewer, run });
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

    const gatheringContext =
      runType === 'gathering' ? this._gatheringRunDisplayTask({ run, viewer, actor }) : null;
    const resultRun =
      runType === 'gathering' ? { ...run, createdResults: gatheringActualAwards(run) } : run;
    const withheld =
      gatheringContext?.identityHidden === true ||
      (Boolean(run.resolutionSnapshot || run.historySettlement) && !historyEntitled);
    const createdResults = withheld ? null : resultRun.createdResults;
    const { title, img, blindSecretPreview } = this._passthroughRunIdentity({
      run,
      runType,
      viewer,
      gatheringContext,
      fallbackTitle: stringOrEmpty(run.label) || stringOrEmpty(run.taskId),
    });
    const hasPlayerCheck =
      runType === 'gathering' ? this._gatheringRunHasPlayerCheck(gatheringContext) : false;

    const derivedStatus = this._derivePassthroughStatus({ status, timeGate, worldTime, run });
    return {
      id: stringOrNull(run.id),
      ...this._runLifecycleProjection({
        run,
        runType,
        activityKind: runType,
        actor,
        actorUuid,
        terminal,
        derivedStatus,
        timeGate,
        hasPlayerCheck,
        entitled: !gatheringContext?.blind || viewer?.isGM === true,
        evidenceEntitled: historyEntitled && (!gatheringContext?.blind || viewer?.isGM === true),
        authority,
      }),
      runType,
      status,
      derivedStatus,
      craftingSystemId: stringOrNull(run.craftingSystemId),
      craftingSystemName: stringOrEmpty(system?.name),
      names: {
        title: withheld ? this.localize('FABRICATE.App.Journal.Redacted.Title') : title,
        subtitle: withheld ? '' : stringOrEmpty(system?.name),
      },
      redacted: withheld,
      img: withheld ? ({ gathering: DEFAULT_GATHERING_IMAGE }[runType] ?? DEFAULT_RUN_IMAGE) : img,
      stepIndex: null,
      stepCount: 0,
      multiStep: false,
      isFinalStep: false,
      stepLabel: '',
      steps: [],
      currentStep: null,
      timeGate,
      startedAt,
      updatedAt,
      finishedAt,
      structureLabel: '',
      resolutionModeLabel: '',
      ...(historyEntitled && historyEvidenceFields(run)),
      consumedIngredients:
        historyEntitled && runType === 'salvage'
          ? normalizeList(run.consumedComponents).map((entry) =>
              this._mapResult(entry, run.craftingSystemId, false)
            )
          : [],
      lastCheckResult:
        historyEntitled && runType === 'salvage' ? this._checkResultModel(run.checkResult) : null,
      gatheringYield:
        runType === 'gathering' && !withheld
          ? this._gatheringYield({ run: resultRun, system, context: gatheringContext, terminal })
          : null,
      recipeId: null,
      environmentId:
        runType === 'gathering' && gatheringContext?.task && !withheld
          ? stringOrNull(run.environmentId)
          : null,
      taskId: withheld ? null : stringOrNull(run.taskId),
      // GM-only marker: this row names a task the acting player cannot see.
      blindSecretPreview,
      flavor: '',
      failureReason: withheld ? null : stringOrNull(run.failureReason),
      createdResultsRecorded:
        Array.isArray(createdResults) &&
        !['pending', 'uncertain'].includes(run.historySettlement?.awards),
      ...this._passthroughResults(createdResults, stringOrNull(run.craftingSystemId)),
      manualAdvance: false,
    };
  }

  /**
   * Resolve a gathering/salvage run's display identity.
   *
   * Gathering runs persist only a `taskId`; salvage runs persist only the source
   * `componentId`. Each resolves to the authored name/image (mirroring how
   * crafting resolves recipe name/img), falling back to the raw id + default image
   * when it cannot be resolved. A salvage title is the bare source-component name —
   * the bag icon and run context already convey "salvage", matching crafting's bare
   * recipe name and gathering's bare task name.
   *
   * @returns {{title: string, img: string, blindSecretPreview: boolean}}
   * @private
   */
  _passthroughRunIdentity({ run, runType, viewer, gatheringContext = null, fallbackTitle }) {
    if (runType === 'gathering') {
      return this._gatheringRunIdentity({ run, viewer, context: gatheringContext, fallbackTitle });
    }
    if (runType === 'salvage') return this._salvageRunIdentity({ run, fallbackTitle });
    return { title: fallbackTitle, img: DEFAULT_RUN_IMAGE, blindSecretPreview: false };
  }

  /**
   * Resolve a gathering run's display identity.
   *
   * Three cases (issue 901):
   *
   * - A plain run names its task and resolves to that task's authored name/image,
   *   exactly as before.
   * - A BLIND run persists only the `blind:<environmentId>` marker, so for a
   *   player it resolves to the generic blind label, never the real task's name.
   * - For a GM, a blind run resolves to the real task from the GM-owned blind-run
   *   store and is flagged as a secret preview, because the GM needs to know what
   *   the player will get.
   *
   * @returns {{title: string, img: string, blindSecretPreview: boolean}}
   * @private
   */
  _gatheringRunIdentity({ run, viewer, context = null, fallbackTitle }) {
    const { blind, secret, task } = context ?? this._gatheringRunDisplayTask({ run, viewer });
    return {
      title:
        stringOrEmpty(task?.name) || (blind ? this.localize(BLIND_TASK_LABEL_KEY) : fallbackTitle),
      img: stringOrNull(task?.img) || DEFAULT_GATHERING_IMAGE,
      blindSecretPreview: secret,
    };
  }

  /** Fails CLOSED: a reveal source that throws hides the task rather than guessing. */
  _identityHidden({ actor, viewer, environmentId, taskId }) {
    if (viewer?.isGM === true || !environmentId) return false;
    try {
      return this._isGatheringIdentityHidden({ actor, viewer, environmentId, taskId }) === true;
    } catch {
      return true;
    }
  }

  _gatheringRunHasPlayerCheck({ task } = {}) {
    const resolutionMode = stringOrNull(task?.resolutionMode) || 'd100';
    return resolutionMode !== 'straight';
  }

  /**
   * Which task a gathering run should be DISPLAYED as, and whether that is a
   * GM-only secret preview the acting player cannot see.
   *
   * @returns {{blind: boolean, secret: boolean, task: object|null}}
   * @private
   */
  _gatheringRunDisplayTask({ run, viewer, actor = null }) {
    const environmentId = stringOrNull(run.environmentId);
    const blind = isBlindWaitingTaskId(run.taskId) || run.taskId === 'blind';
    if (!blind) {
      // D-027. A GM-executed blind run persists the REAL task id, so the marker above cannot
      // answer whether this viewer may be told it; the reveal policy does, and owning the actor
      // entitles nobody. `identityHidden` withholds the whole row, because — unlike a marked
      // record, which redacted itself at write time — this one names the task throughout.
      if (
        this._identityHidden({ actor, viewer, environmentId, taskId: stringOrNull(run.taskId) })
      ) {
        return { blind: true, secret: false, task: null, identityHidden: true };
      }
      return {
        blind: false,
        secret: false,
        task:
          plainObjectOrNull(run?.economyEvidence?.runtimeSnapshot?.task) ??
          this._getGatheringTask(environmentId, stringOrNull(run.taskId)),
      };
    }
    // Only a GM may see behind the marker, and only through the GM-owned store.
    const record = viewer?.isGM === true ? this._getGatheringBlindSecret?.(run.id) : null;
    if (!record) return { blind: true, secret: false, task: null };
    const task =
      plainObjectOrNull(record.snapshot?.task) ??
      this._getGatheringTask(environmentId, stringOrNull(record.taskId));
    return { blind: true, secret: Boolean(task), task };
  }

  _gatheringYield({ run, system, context, terminal = false }) {
    if (context?.blind && !context.secret) return null;
    if (run?.checkResult?.blind === true) return null;
    if (terminal) return this._gatheringHistoryYield(run, system);
    if (!context?.task) return null;
    const mode = stringOrNull(context.task.resolutionMode) || 'd100';
    if (!['straight', 'd100', 'routed'].includes(mode)) return null;
    return {
      mode,
      entries:
        mode === 'straight'
          ? this._straightYieldEntries(context.task, stringOrNull(run.craftingSystemId))
          : mode === 'd100'
            ? this._d100YieldEntries(context.task, run, stringOrNull(run.craftingSystemId))
            : [],
      roll: this._gatheringActualRoll(run),
      tiers:
        mode === 'routed'
          ? this._routedYieldTiers(context.task, system, stringOrNull(run.craftingSystemId))
          : [],
    };
  }

  /**
   * Historical yield uses recorded fields and uniquely attributed receipts, never live odds.
   * Only explicit root evidence is shared; independent row rolls cannot create a global cut.
   * @private
   */
  _gatheringHistoryYield(run, system) {
    const result = plainObjectOrNull(run?.checkResult);
    const task = plainObjectOrNull(run?.economyEvidence?.runtimeSnapshot?.task);
    let mode = stringOrNull(run.resolutionSnapshot?.mode) || stringOrNull(task?.resolutionMode);
    if (result?.provider === 'd100') mode = 'd100';
    else if (Object.hasOwn(result ?? {}, 'outcome')) mode = 'routed';
    if (!['straight', 'd100', 'routed', 'progressive'].includes(mode)) return null;
    const evidence = gatheringHistoryEvidence({
      result: result ?? {},
      awards: run.createdResults,
      systemId: stringOrNull(run.craftingSystemId),
      components: resolvedComponentsFor(system),
    });
    return {
      source: 'recorded',
      mode,
      entries:
        mode === 'd100' ? this._historicalDropEntries(evidence.entries, run.craftingSystemId) : [],
      roll: evidence.roll,
      rollModel: evidence.rollModel,
      unattributedAwardIndexes: evidence.unattributedAwardIndexes,
      check: ['routed', 'progressive'].includes(mode) ? this._checkResultModel(result) : null,
      tiers: [],
    };
  }

  _historicalDropEntries(rows, systemId) {
    return rows.map((row) => {
      const mapped = this._mapResult(row, systemId);
      return {
        ...compactPresentation({
          id: row.id,
          name:
            stringOrNull(mapped.name) ||
            this.localize('FABRICATE.App.Journal.History.UnknownMaterial'),
          art: stringOrNull(mapped.img),
        }),
        chance: row.chance,
        cleared: row.cleared,
        rawRoll: row.rawRoll,
        effectiveRoll: row.effectiveRoll,
        threshold: row.threshold,
        qty: row.qty,
      };
    });
  }

  _straightYieldEntries(task, systemId) {
    return normalizeList(task?.resultGroups).flatMap((group) =>
      normalizeList(group?.results).map((result, index) =>
        this._yieldEntry(result, systemId, index, 100)
      )
    );
  }

  _d100YieldEntries(task, run, systemId) {
    const evaluatedRows = Array.isArray(run?.checkResult?.itemRows)
      ? run.checkResult.itemRows
      : normalizeList(run?.checkResult?.items);
    const actualById = new Map(
      evaluatedRows
        .filter((item) => stringOrNull(item?.id))
        .map((item) => [stringOrNull(item.id), item])
    );
    return normalizeList(task?.dropRows ?? task?.itemDrops)
      .filter((row) => row?.enabled !== false)
      .map((row, index) => {
        const actual = actualById.get(stringOrNull(row?.id));
        const chance = numberOrNull(actual?.finalDropRate) ?? numberOrNull(row?.dropRate) ?? 0;
        return this._yieldEntry(row, systemId, index, Math.min(100, Math.max(0, chance)));
      });
  }

  _yieldEntry(result, systemId, index, chance) {
    const mapped = this._mapResult(result, systemId);
    return compactPresentation({
      id:
        stringOrNull(result?.id) ||
        stringOrNull(mapped.componentId) ||
        stringOrNull(mapped.itemUuid) ||
        `yield-${index + 1}`,
      name: stringOrEmpty(mapped.name) || stringOrEmpty(result?.name),
      art: stringOrNull(mapped.img),
      icon: stringOrNull(result?.icon),
      tint: stringOrNull(result?.tint ?? result?.colorToken),
      // The authored amount stays a number a view can read; the expression rides BESIDE it, because
      // an absent `qty` reads as "not recorded" rather than as an amount nobody can preview.
      qty: numberOrNull(result?.quantity) ?? 1,
      amountLabel: mapped.amountLabel ?? null,
      chance,
    });
  }

  _gatheringActualRoll(run) {
    const result = plainObjectOrNull(run?.checkResult);
    const candidates = [result?.value, result?.roll, result?.data?.total];
    return candidates.map(recordedNumber).find((value) => value !== null) ?? null;
  }

  _routedYieldTiers(task, system, systemId) {
    const routed = plainObjectOrNull(system?.gatheringCraftingCheck?.routed) ?? {};
    const outcomes =
      routed.type === 'fixed'
        ? normalizeList(routed.fixedOutcomes)
        : normalizeList(routed.relativeOutcomes);
    const groupsByName = new Map();
    for (const group of normalizeList(task?.resultGroups)) {
      const name = normalizeName(group?.name);
      groupsByName.set(name, [...(groupsByName.get(name) ?? []), group]);
    }
    const permitFailure = activityPermitsFailureResults(system, 'gathering');
    return outcomes.map((outcome, index) => {
      const fail = outcome?.success !== true;
      const groups = groupsByName.get(normalizeName(outcome?.name)) ?? [];
      const results =
        fail && !permitFailure ? [] : groups.flatMap((group) => normalizeList(group?.results));
      return {
        id: stringOrNull(outcome?.id) || `tier-${index + 1}`,
        name: stringOrEmpty(outcome?.name).trim(),
        band: routedOutcomeBand(outcome, routed, task),
        fail,
        yields: results.map((result, resultIndex) =>
          this._tierYield(result, systemId, resultIndex)
        ),
      };
    });
  }

  _tierYield(result, systemId, index) {
    const mapped = this._mapResult(result, systemId);
    const quantity = mapped.amountLabel ?? numberOrNull(result?.quantity) ?? 1;
    return compactPresentation({
      id:
        stringOrNull(result?.id) ||
        stringOrNull(mapped.componentId) ||
        stringOrNull(mapped.itemUuid) ||
        `result-${index + 1}`,
      name: stringOrEmpty(mapped.name) || stringOrEmpty(result?.name),
      art: stringOrNull(mapped.img),
      icon: stringOrNull(result?.icon),
      tint: stringOrNull(result?.tint ?? result?.colorToken),
      quantity: `×${quantity}`,
    });
  }

  /**
   * Resolve a salvage run's display identity from its source component.
   *
   * @returns {{title: string, img: string, blindSecretPreview: boolean}}
   * @private
   */
  _salvageRunIdentity({ run, fallbackTitle }) {
    const componentId = stringOrNull(run.componentId);
    const component = componentId
      ? this._getComponent(stringOrNull(run.craftingSystemId), componentId)
      : null;
    return {
      title: stringOrEmpty(component?.name) || stringOrEmpty(componentId) || fallbackTitle,
      img: stringOrNull(component?.img) || DEFAULT_RUN_IMAGE,
      blindSecretPreview: false,
    };
  }

  /**
   * Map a gathering/salvage run's persisted `createdResults` into the same UI-safe
   * shape crafting uses, so the detail view can list awarded items (image + name +
   * quantity) rather than a bare count.
   * @private
   */
  _passthroughResults(createdResults, systemId = null) {
    const results = normalizeList(createdResults).map((result) =>
      this._mapResult(result, systemId)
    );
    return { createdResults: results, createdResultCount: results.length };
  }

  _derivePassthroughStatus({ status, timeGate, worldTime, run = null }) {
    if (TERMINAL_STATUSES.has(status)) return status;
    if (run?.pauseState) return 'paused';
    const availableAt = numberOrNull(timeGate?.availableAt);
    if (availableAt !== null) {
      return availableAt <= worldTime ? 'ready' : 'waiting';
    }
    return 'inProgress';
  }

  _actorUuid(actor) {
    return stringOrNull(actor?.uuid) || stringOrNull(idOf(actor));
  }

  /**
   * The authority's cached availability, plus — for a GM viewer only — the retained claim a
   * GM can reconcile. Only the active GM may call `reconcileJournalRunAuthority`, so a player
   * is never told a claim token they could do nothing with.
   * @private
   */
  _actionAvailability(viewer = null) {
    try {
      const value = this._getJournalActionAvailability();
      const retained = viewer?.isGM === true ? this._retainedClaim(value?.retained) : null;
      const availability = {
        available: value?.available !== false,
        reason: stringOrNull(value?.reason),
      };
      if (retained) availability.retained = retained;
      return availability;
    } catch {
      return { available: false, reason: 'authorityUnavailable' };
    }
  }

  _retainedClaim(value) {
    const claimId = stringOrNull(value?.claimId);
    if (!claimId) return null;
    return {
      claimId,
      requestKind: stringOrNull(value?.requestKind),
      failureReason: stringOrNull(value?.failureReason),
      failureMessage: stringOrNull(value?.failureMessage),
      claimedAt: numberOrNull(value?.claimedAt),
    };
  }

  _dismissedRunKeys(actor, viewer) {
    try {
      const values = this._getDismissedRunKeys({
        actorUuid: this._actorUuid(actor),
        viewerId: stringOrNull(viewer?.id),
      });
      return new Set(values || []);
    } catch {
      return new Set();
    }
  }

  _runLifecycleProjection({
    run,
    runType,
    activityKind,
    actor,
    actorUuid,
    terminal,
    derivedStatus,
    timeGate = null,
    hasPlayerCheck = false,
    selectionAvailability = null,
    stageStart = null,
    entitled = true,
    evidenceEntitled = entitled,
    authority = null,
  }) {
    const lifecycleContract = getRunLifecycleContract(run);
    const recoveryEvidence =
      this._recoveryEvidence(
        run?.executionJournal,
        evidenceEntitled,
        stringOrNull(run?.craftingSystemId)
      ) ?? this._nativeRecoveryEvidence(run, evidenceEntitled);
    const blockedReason = terminal
      ? null
      : this._mutationBlockedReason({
          lifecycleContract,
          recoveryEvidence,
          actor,
          authority,
        });
    const current = lifecycleContract === 'current';
    const live = !terminal;
    const owner = actor?.isOwner === true;
    const paused = Boolean(run?.pauseState);
    const authoritative = authority?.available !== false;
    const executionBlocked =
      recoveryEvidence?.required === true || recoveryEvidence?.status === 'planned';
    const mutableCurrent = current && live && owner && authoritative && !executionBlocked;
    const executableType = runType === 'crafting' || runType === 'gathering';
    const craftingStage = current && live && runType === 'crafting';
    // The one cause this stage is refused for, as the engine's own commands classify it.
    const stageBlocker = craftingStage ? (selectionAvailability?.blocker ?? null) : null;
    const materialBlocked = stageBlocker !== null && !isChoiceBlocker(stageBlocker);
    // A stage with its own start is not resolvable until the player has begun it: the roll
    // is withheld rather than offered and then refused (M13/M15).
    const awaitingStageStart = current && live && stageStart?.required === true;
    // Waiting on the player's own pick — a route, an option or an essence allocation — rather
    // than on the clock or on stock (M10). It is reported only where they can act on it: their
    // own live current-contract crafting stage, unpaused and unlocked, because a paused or
    // started stage holds the choices it made.
    const choiceRequired =
      mutableCurrent &&
      runType === 'crafting' &&
      !paused &&
      entitled &&
      isChoiceBlocker(stageBlocker);
    const readyToExecute =
      derivedStatus !== 'waiting' &&
      derivedStatus !== 'paused' &&
      !materialBlocked &&
      !awaitingStageStart &&
      !choiceRequired;
    const legacyExecute =
      lifecycleContract === 'legacy' &&
      live &&
      runType === 'crafting' &&
      owner &&
      !executionBlocked;
    const legacyCancel = legacyExecute;
    const recoveryClaim = this._offeredRecoveryClaim({ live, authority });
    return {
      ...runIdentityFields({ run, runType, actorUuid, activityKind, lifecycleContract }),
      recoveryEvidence,
      awaitingChoice: choiceRequired,
      stageStart: projectedStageStart(stageStart),
      actions: this._runActions({
        run,
        runType,
        terminal,
        derivedStatus,
        timeGate,
        hasPlayerCheck,
        stageStart,
        entitled,
        paused,
        mutableCurrent,
        executableType,
        legacyExecute,
        legacyCancel,
        readyToExecute,
        stageBlocker,
        awaitingStageStart,
        blockedReason,
        recoveryClaim,
      }),
    };
  }

  /**
   * The retained claim this run may offer to release, keyed on the CLAIM rather than on the
   * run's own reason string.
   *
   * `claimStanding` distinguishes a `live` claim — someone is genuinely working, and the only
   * answer is to wait — from a `retained` one, which nobody is coming back for. Only the
   * retained case carries an identity, and `_actionAvailability` carries it for a GM viewer
   * alone, so the affordance appears exactly where there is something a person can clear and
   * never to a player.
   *
   * A run carrying uncertain evidence of its own reports `recoveryRequired` rather than that
   * reason string, and that is the run a GM opens first (issue 1648, M27).
   * @private
   * @returns {object|null}
   */
  _offeredRecoveryClaim({ live, authority }) {
    return live ? (authority?.retained ?? null) : null;
  }

  /** What this viewer may do to this run, and the one code that says why they may not. */
  /**
   * Whether the live stage still has its own start, and whether it has taken it. A
   * zero-duration stage has no waiting window, so it never has one to take.
   * @private
   * @returns {{needed: boolean, locked: boolean, started: boolean, required: boolean}|null}
   */
  _stageStartState({ activeStep, recipeStep, system }) {
    if (!activeStep) return null;
    const needed =
      durationToSeconds(recipeStep?.timeRequirement) > 0 &&
      system?.requirements?.time?.enabled !== false;
    // `locked` is the D-028 commit; `started` also covers a stage armed before it shipped,
    // which cannot be begun again even though its plan was never locked.
    const locked = Boolean(activeStep.preparedConsumption);
    const started = locked || Boolean(activeStep.timeGate);
    return { needed, locked, started, required: needed && !started };
  }

  _runActions({
    run,
    runType,
    terminal,
    derivedStatus,
    timeGate,
    hasPlayerCheck,
    stageStart,
    entitled,
    paused,
    mutableCurrent,
    executableType,
    legacyExecute,
    legacyCancel,
    readyToExecute,
    stageBlocker,
    awaitingStageStart,
    blockedReason,
    recoveryClaim,
  }) {
    // The stage-start boundary is a SEPARATE fact from whether the begin control is
    // enabled (M15). `atStageStart` alone decides which control renders — the begin
    // decision, not the ordinary primary — so gating `beginStep` on the player's own
    // unmade choice can never also make the control disappear and hand back an
    // enabled primary that the command refuses.
    const atStageStart =
      mutableCurrent && runType === 'crafting' && !paused && awaitingStageStart && entitled;
    return {
      execute: legacyExecute || (mutableCurrent && !paused && executableType && readyToExecute),
      pause:
        mutableCurrent &&
        executableType &&
        !paused &&
        run?.status === 'waitingTime' &&
        Boolean(timeGate),
      resume: mutableCurrent && executableType && paused,
      setCompletionMode:
        mutableCurrent &&
        executableType &&
        !paused &&
        derivedStatus === 'waiting' &&
        Boolean(timeGate) &&
        !hasPlayerCheck,
      atStageStart,
      // Offered only where `beginVersionedStage` would commit the stage: `stageBlocker` carries
      // every cause that command refuses on, so none of them is offered and then refused.
      beginStep: atStageStart && stageBlocker === null,
      setSelection:
        mutableCurrent && runType === 'crafting' && entitled && stageStart?.locked !== true,
      cancel: legacyCancel || (mutableCurrent && executableType),
      dismiss: terminal,
      disabledReason:
        blockedReason ?? stageBlocker ?? (awaitingStageStart ? 'stageNotStarted' : null),
      ...(recoveryClaim && { recoveryClaim }),
    };
  }

  _mutationBlockedReason({ lifecycleContract, recoveryEvidence, actor, authority }) {
    if (lifecycleContract === 'unsupported') return 'unsupportedLifecycle';
    if (recoveryEvidence?.required) return 'recoveryRequired';
    if (recoveryEvidence?.status === 'planned') return 'executionInProgress';
    if (lifecycleContract === 'current' && authority?.available === false) {
      return authority.reason || 'authorityUnavailable';
    }
    if (actor?.isOwner !== true) return 'notOwner';
    return null;
  }

  _recoveryEvidence(journal, entitled, systemId) {
    if (!journal || typeof journal !== 'object') return null;
    const rawStatus = stringOrNull(journal.status);
    if (!EXECUTION_JOURNAL_STATUSES.has(rawStatus)) return null;
    const status = rawStatus;
    const effects = normalizeList(journal.effects).map((effect, index) => ({
      index,
      kind: entitled && SAFE_EXECUTION_EFFECT_KINDS.has(effect?.kind) ? effect.kind : 'other',
      phase: EXECUTION_EFFECT_PHASES.has(effect?.phase) ? effect.phase : 'unknown',
      hasReceipt: Object.hasOwn(effect || {}, 'receipt'),
      receipt:
        entitled && (effect?.phase === 'applied' || effect?.receipt?.uncertain === true)
          ? this._safeEffectReceipt(effect, systemId)
          : null,
    }));
    return {
      status,
      appliedEffectCount: effects.filter((effect) => effect.phase === 'applied').length,
      effectCount: effects.length,
      effects,
      uncertainEffectIndex: effects.find((effect) => effect.phase === 'applying')?.index ?? null,
      ...(status === 'recoveryRequired' && { required: true }),
    };
  }

  _nativeRecoveryEvidence(run, entitled) {
    if (getRunLifecycleContract(run) !== 'legacy') return null;
    const owner = run.historySettlement ? run : run.steps?.[run.currentStepIndex];
    const settlement = owner?.historySettlement;
    if (Object.values(settlement ?? {}).every((state) => !['pending', 'uncertain'].includes(state)))
      return null;
    const required = Object.values(settlement).includes('uncertain');
    const effects = ['consumption', 'awards']
      .filter((key) => settlement[key])
      .map((key, index) => ({
        index,
        kind: key === 'consumption' ? 'consumeItems' : 'awardItems',
        phase: {
          complete: 'applied',
          pending: 'applying',
          uncertain: 'applying',
          notApplicable: 'notApplicable',
        }[settlement[key]],
        hasReceipt: true,
        receipt: entitled
          ? {
              items: normalizeList(
                key === 'consumption'
                  ? (owner.consumedIngredients ?? owner.consumedComponents)
                  : owner.createdResults
              ).map((entry) => this._mapResult(entry, run.craftingSystemId, false)),
              currencies: [],
            }
          : null,
      }));
    return {
      status: required ? 'recoveryRequired' : 'planned',
      required,
      appliedEffectCount: effects.filter((effect) => effect.phase === 'applied').length,
      effectCount: effects.length,
      effects,
      uncertainEffectIndex: effects.find((effect) => effect.phase === 'applying')?.index ?? null,
    };
  }

  _nativeHistoryEntitled({ actor, viewer, run }) {
    if (viewer?.isGM === true) return true;
    if (!viewer?.id) return false;
    try {
      if (typeof actor?.testUserPermission === 'function')
        return actor.testUserPermission(viewer, 'OWNER') === true;
      return viewer.id === run.userId;
    } catch {
      return false;
    }
  }

  _safeEffectReceipt(effect, systemId) {
    const receipt = effect?.receipt;
    if (!receipt || typeof receipt !== 'object') return null;
    let entries = [];
    if (receipt.uncertain === true) entries = normalizeList(receipt.confirmed);
    else if (
      [
        'consumeIngredients',
        'consumeAlchemyExtras',
        'consumeItems',
        'consumeAlchemyItems',
      ].includes(effect.kind)
    ) {
      entries = normalizeList(receipt.items);
    } else if (['awardResults', 'awardItems'].includes(effect.kind)) {
      entries = normalizeList(receipt.results);
    } else if (effect.kind === 'createGatheredResults') {
      entries = normalizeList(receipt);
    }
    return {
      items: entries.map((entry) => this._mapResult(entry, systemId)),
      currencies:
        effect.kind === 'spendCurrency'
          ? normalizeList(receipt.settledSpends).map((spend) => ({
              unit: stringOrEmpty(spend?.unit),
              amount: numberOrNull(spend?.amount),
            }))
          : [],
    };
  }
}

function normalizeRevision(value) {
  const revision = Number(value);
  return Number.isSafeInteger(revision) && revision >= 0 ? revision : 0;
}

function normalizePauseState(value) {
  const pausedAt = Number(value?.pausedAt);
  const remainingSeconds = Number(value?.remainingSeconds);
  if (!Number.isFinite(pausedAt) || !Number.isFinite(remainingSeconds)) return null;
  return { pausedAt, remainingSeconds: Math.max(0, remainingSeconds) };
}

function safePrimitive(value) {
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return value;
  return String(value);
}

function compactPresentation(value) {
  return Object.fromEntries(
    Object.entries(value).filter(
      ([, entry]) => entry !== null && entry !== undefined && entry !== ''
    )
  );
}

function normalizeName(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

function ingredientOverrideIndex(group, optionOverrides) {
  const groupId = stringOrNull(group?.id);
  if (!Object.hasOwn(optionOverrides, groupId)) return;
  const raw = optionOverrides[groupId]?.optionIndex;
  if (typeof raw !== 'number' && typeof raw !== 'string') return null;
  if (typeof raw === 'string' && !raw.trim()) {
    return null;
  }
  const index = Number(raw);
  return Number.isSafeInteger(index) && index >= 0 && index < normalizeList(group?.options).length
    ? index
    : null;
}

function selectedIngredientIndex(group, optionOverrides, selection) {
  const options = normalizeList(group?.options);
  const override = ingredientOverrideIndex(group, optionOverrides);
  if (override !== undefined) return override;
  const selected = normalizeList(selection?.selectedIngredients).find((ingredient) =>
    options.includes(ingredient)
  );
  const selectedIndex = options.indexOf(selected);
  return Math.max(selectedIndex, 0);
}

function ingredientNeed(option) {
  const match = plainObjectOrNull(option?.match);
  if (match?.type === 'essence' || match?.type === 'currency') {
    return Math.max(0, numberOrNull(match.amount) ?? 0);
  }
  return Math.max(0, numberOrNull(option?.quantity) ?? 1);
}

function ingredientOptionName({ group, option, kind, match, definition, component }) {
  if (kind === 'component') {
    return stringOrEmpty(component?.name) || stringOrEmpty(match?.componentId);
  }
  if (kind === 'essence') {
    const essenceName = stringOrEmpty(definition?.name) || stringOrEmpty(match?.essenceId);
    return essenceName ? `${essenceName} essence` : '';
  }
  if (kind === 'currency') {
    return `${ingredientNeed(option)} ${stringOrEmpty(match?.unit)}`.trim();
  }
  if (kind === 'tag') {
    const tags = normalizeList(match?.tags).map(stringOrEmpty).filter(Boolean);
    return tags.join(match?.tagMatch === 'all' ? ' & ' : ' | ') || stringOrEmpty(group?.name);
  }
  return stringOrEmpty(option?.name) || stringOrEmpty(group?.name);
}

/**
 * The run's own persisted lifecycle identity, normalised: who it belongs to, which contract it
 * was created under, and the pause bookkeeping every surface reads the same way.
 */
function runIdentityFields({ run, runType, actorUuid, activityKind, lifecycleContract }) {
  return {
    key: JSON.stringify([actorUuid, runType, stringOrNull(run?.id)]),
    actorUuid,
    activityKind,
    lifecycleContract,
    lifecycleVersion: lifecycleContract === 'legacy' ? null : safePrimitive(run?.lifecycleVersion),
    runRevision: normalizeRevision(run?.runRevision),
    completionMode: run?.completionMode === 'worldTime' ? 'worldTime' : 'manual',
    pauseState: normalizePauseState(run?.pauseState),
    pausedDurationSeconds: Math.max(0, Number(run?.pausedDurationSeconds) || 0),
  };
}

/**
 * The stage's answer when its route resolves to no authored set: none has been chosen, or the
 * one that was has gone. An unstarted stage waits on a pick — a ROUTE pick specifically, which
 * is the one cause the "choose this stage's route" sentence was ever right about (issue 1648,
 * F5) — while a started one has no pick left to make and reports the recipe edit instead.
 */
/**
 * Whether the current stage has begun, independently of whether this viewer may act on it. A
 * surface that reads `actions.atStageStart` for the FACT loses it whenever the authority is
 * refusing, the viewer is not the owner, or the run needs recovery (issue 1648, UX2-2).
 */
function projectedStageStart(stageStart) {
  if (stageStart === null || stageStart === undefined) return null;
  return { required: stageStart.required === true, started: stageStart.started === true };
}

/** The consumed items a started stage has not fully removed, for the tool exclusion. */
function startedStageItems(runStep, items) {
  const uuids = new Set(
    normalizeList(runStep?.preparedConsumption?.consumedSummary)
      .map((entry) => stringOrNull(entry?.itemUuid))
      .filter(Boolean)
  );
  return new Set(items.filter((item) => uuids.has(stringOrNull(item?.uuid))));
}

function unchosenRouteAvailability(setId, routes, started = false) {
  return {
    success: false,
    blocker: started ? 'routeUnavailable' : STAGE_BLOCKERS.route,
    knownMaterialShortfall: false,
    awaitingChoice: !started,
    selectedIngredientSetId: setId,
    routes,
    staleRoute: true,
    missingGroups: [],
    choices: [],
    requirements: [],
    essencePool: null,
  };
}

/**
 * A route's own count of what the player would have to ACQUIRE to take it, used to rank the
 * alternatives. Essence and currency gaps count too: every one of them refuses the stage.
 */
function acquisitionShortfallCount(selection) {
  const unfunded = unfundedEssenceGroupIds(selection?.essencePool);
  return normalizeList(selection?.missingGroups).filter(
    (group) => missingGroupBlocker(group, unfunded) !== STAGE_BLOCKERS.choice
  ).length;
}

function safeMissingGroup(group) {
  const id = missingGroupId(group);
  return {
    id,
    name: stringOrEmpty(group?.group?.name ?? group?.name),
    ingredientId: stringOrNull(group?.ingredient?.id),
    need: numberOrNull(group?.need),
    have: numberOrNull(group?.have),
  };
}

function missingGroupId(group) {
  return stringOrNull(group?.group?.id ?? group?.groupId ?? group?.id);
}
