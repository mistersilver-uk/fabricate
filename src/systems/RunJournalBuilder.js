import { resolveRecipeImage } from '../ui/svelte/util/craftingImageDefaults.js';
import { activityPermitsFailureResults } from '../utils/failureResultPolicy.js';

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
import { readStackQuantity } from './itemStackQuantity.js';
import { buildPassInventorySnapshot } from './passInventorySnapshot.js';
import { getRunLifecycleContract } from './runLifecycleState.js';
import { resolvedEssencesFor } from './scopedEntityReads.js';

const DEFAULT_RUN_IMAGE = 'icons/svg/item-bag.svg';
// Generic player-facing label for a blind gathering run, shared with the
// gathering listing so both surfaces say the same thing.
const BLIND_TASK_LABEL_KEY = 'FABRICATE.Gathering.BlindTaskLabel';
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
 * Redaction hides a run's IDENTITY (name, image, steps, results, recipe id) and
 * NOTHING ELSE. It is not an authorization gate: an owner may still advance and
 * cancel a redacted run (issue 966). Conflating the two deadlocked every timed
 * craft of a recipe the crafter cannot see — alchemy brews an undiscovered
 * recipe by design, so a timed brew consumed its ingredients, armed its gate, and
 * then offered neither a Finish nor a Cancel affordance for the rest of time.
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
   * @param {Function} [deps.getGatheringBlindSecret] `(runId) => { taskId, snapshot }|null`
   *   — reads the GM-owned blind-run store (issue 901). Present only so a GM's
   *   journal can preview the task an in-flight blind run will yield; the
   *   projection ignores it for every non-GM viewer.
   * @param {Function} [deps.getGatheringTask] `(environmentId, taskId) => { name, img }|null`
   *   — resolves a gathering run's task to its authored name/image (from the COMPOSED
   *   environment), mirroring how `getRecipe` resolves a crafting run's name/image.
   * @param {Function} [deps.getResultItem] `(itemUuid) => { name, img }|null` — resolves
   *   an awarded/created result item by its recorded uuid, so the journal can label a
   *   run's produced items even for records that predate name/img capture.
   * @param {Function} [deps.getComponent] `(systemId, componentId) => { name, img }|null` —
   *   resolves a system component to its authored name/image. Powers a salvage run's
   *   title (from the source `componentId`) and the name/img fallback for a salvage
   *   created-result whose record captured neither (records that predate name/img capture).
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

    const authority = this._actionAvailability();
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
    const crafting = runs.map((run) =>
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
   * This previously preferred the linked recipe-item definition's image, keyed on the
   * legacy `recipe.recipeItemId` scalar, which outranked an authored `recipe.img` and
   * tracked definition order rather than anything the GM authored (issue 887). The
   * injected `getRecipeItemImg` port existed solely for that lookup and is gone with it.
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
  }) {
    if (!run?.id) return null;
    if (run.isFizzle === true) {
      return this._fizzleRunModel({ run, actor, actorUuid, viewer, authority });
    }
    const system = this._getSystem(stringOrNull(run.craftingSystemId));
    const redacted = this._isCraftingRedacted({ recipe, actor, viewer, snapshot });

    const runSteps = normalizeList(run.steps);
    const recipeSteps =
      recipe && typeof recipe.getExecutionSteps === 'function' ? recipe.getExecutionSteps() : [];
    const stepCount = runSteps.length;
    const currentStepIndex = numberOrNull(run.currentStepIndex);
    const status = stringOrNull(run.status) || 'inProgress';
    const activeStep =
      !terminal && Number.isFinite(currentStepIndex) ? runSteps[currentStepIndex] : null;

    const systemId = stringOrNull(run.craftingSystemId);
    const availabilitySnapshot =
      redacted || terminal
        ? null
        : this._availabilitySnapshot({ actor, run, recipe, fallback: snapshot });
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
            availabilitySnapshot,
            isCurrent: !terminal && index === currentStepIndex,
          })
        );
    const currentStep =
      activeStep && Number.isFinite(currentStepIndex) ? (steps[currentStepIndex] ?? null) : null;

    const derivedStatus = this._deriveCraftingStatus({ status, activeStep, worldTime, run });
    // A recipe presents as multi-step only while its system's multi-step feature is
    // ON. When the feature is OFF the recipe is COLLAPSED (issue 710): it ran as one
    // atomic chain, so the Journal renders it as a single-step run even though the
    // run record retains per-step detail. Re-enabling the feature restores the
    // multi-step presentation from the same untouched record.
    const multiStepFeatureEnabled = system?.features?.multiStepRecipes === true;
    const multiStep =
      multiStepFeatureEnabled && Array.isArray(recipe?.steps) && recipe.steps.length > 1;
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
      hasPlayerCheck: Boolean(currentStep?.detail?.checkLabel),
      entitled: !redacted,
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
      resolutionModeLabel: this._resolutionModeLabel(recipe, system),
      recipeId: redacted ? null : stringOrNull(run.recipeId),
      taskId: null,
      flavor: '',
      failureReason,
      ...this._craftingResults(runSteps, redacted, stringOrNull(run.craftingSystemId)),
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

    const status = stringOrNull(run.status) || 'failed';
    return {
      id: stringOrNull(run.id),
      ...this._runLifecycleProjection({
        run,
        runType: 'crafting',
        activityKind: 'alchemy',
        actor,
        actorUuid,
        terminal: true,
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
      createdResults: [],
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
   * (actionable: the first trigger arms the gate).
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
    availabilitySnapshot = null,
    isCurrent = false,
  }) {
    return {
      stepId: stringOrNull(runStep?.stepId),
      stepName: stringOrEmpty(runStep?.stepName),
      index,
      status: stringOrNull(runStep?.status) || 'pending',
      timeGate: plainObjectOrNull(runStep?.timeGate),
      detail: this._stepDetail({ runStep, recipeStep, system, recipe }),
      lastCheckResult: this._checkResultModel(runStep?.lastCheckResult),
      // The recipe's authored ingredient requirements (persisted snapshot at run
      // creation) and the items actually consumed this step, each resolved to a
      // UI-safe {componentId,itemUuid,quantity,name,img} row via the shared mapper.
      // Consumed items are deleted at consume time, so their name/img come from the
      // consume-time capture (or the componentId fallback) rather than a live lookup.
      requirements: normalizeList(runStep?.requirements).map((entry) =>
        this._mapResult(entry, systemId)
      ),
      consumedIngredients: normalizeList(runStep?.consumedIngredients).map((entry) =>
        this._mapResult(entry, systemId)
      ),
      selectionPlan: cloneJson(runStep?.selectionPlan) ?? null,
      selectedRequirementSnapshot: cloneJson(runStep?.selectedRequirementSnapshot) ?? null,
      requirementSnapshot:
        cloneJson(runStep?.selectedRequirementSnapshot) ?? cloneJson(runStep?.requirements) ?? [],
      selectionAvailability: isCurrent
        ? this._selectionAvailability({
            runStep,
            recipeStep,
            recipe,
            actor,
            run,
            snapshot: availabilitySnapshot,
          })
        : null,
    };
  }

  _availabilitySnapshot({ actor, run, recipe, fallback }) {
    let componentSourceActors;
    try {
      componentSourceActors = normalizeList(this._getComponentSourceActors({ actor, run }));
    } catch {
      componentSourceActors = [];
    }
    if (componentSourceActors.length === 0) return fallback;
    return buildPassInventorySnapshot({
      craftingActor: actor,
      componentSourceActors,
      recipes: [recipe],
      resolveComponent: this._resolveComponentForItem,
    });
  }

  _selectionAvailability({ runStep, recipeStep, recipe, actor, snapshot }) {
    const plan = runStep?.selectionPlan;
    const setId = stringOrNull(plan?.selectedIngredientSetId ?? runStep?.selectedIngredientSetId);
    const sets = normalizeList(recipeStep?.ingredientSets);
    const ingredientSet = sets.find((set) => stringOrNull(set?.id) === setId) ?? sets[0] ?? null;
    if (
      !ingredientSet ||
      typeof ingredientSet.resolveIngredientSelection !== 'function' ||
      !snapshot
    ) {
      return null;
    }
    const items = snapshot.heldItems().map((entry) => entry.item);
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
    const choices = normalizeList(ingredientSet.ingredientGroups)
      .filter((group) => normalizeList(group?.options).length > 1)
      .map((group) =>
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
    return {
      success: selection?.success === true,
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

  _resolveIngredientSelection({
    ingredientSet,
    recipe,
    actor,
    items,
    optionOverrides,
    essenceAllocation,
  }) {
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
    return ingredientSet.resolveIngredientSelection(items, matcher, {
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
      });
      const optionMissing = normalizeList(candidate?.missingGroups).some(
        (missing) => missingGroupId(missing) === groupId
      );
      return this._ingredientOptionPresentation({
        group,
        option,
        index,
        available: !optionMissing,
        recipe,
        items,
        system,
      });
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
    return {
      groupId,
      name: stringOrEmpty(group?.name),
      selectedOptionIndex,
      selectedItemId: stringOrNull(optionOverrides?.[groupId]?.heldItemId),
      option:
        choice?.options?.[selectedOptionIndex] ??
        this._ingredientOptionPresentation({
          group,
          option,
          index: selectedOptionIndex,
          available: !selectedMissing,
          recipe,
          items,
          system,
        }),
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
    const scoped = plan?.ingredientEssenceAllocation;
    if (!scoped || typeof scoped !== 'object') return null;
    if (stringOrNull(scoped.stepId) !== stringOrNull(runStep?.stepId)) return null;
    if (stringOrNull(scoped.ingredientSetId) !== stringOrNull(ingredientSet?.id)) return null;
    return plainObjectOrNull(scoped.allocation);
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
    if (mode === 'routedByCheck') return check?.routed;
    // simple / alchemy / routedByIngredients all read the shared simple slot.
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
   * Map a persisted created-result to the UI shape, resolving name/img when the
   * record does not carry them. Two ordered fallbacks cover records that predate
   * name/img capture: first the actual item by its recorded uuid, then (for a
   * salvage result, which always carries a `componentId`) the source component's
   * authored name/img via `getComponent`. Both fallbacks are no-ops when the
   * resolver is absent/returns null, and never override a captured name/img.
   * @param {object} result The persisted created-result record.
   * @param {string|null} [systemId] The run's crafting system id, needed to resolve
   *   a `componentId` to its component (threaded from the run/model).
   * @private
   */
  _mapResult(result, systemId = null) {
    const itemUuid = stringOrNull(result?.itemUuid);
    const componentId = stringOrNull(result?.componentId);
    let name = stringOrNull(result?.name);
    let img = stringOrNull(result?.img);
    if ((!name || !img) && itemUuid) {
      const doc = this._getResultItem(itemUuid);
      name ||= stringOrNull(doc?.name);
      img ||= stringOrNull(doc?.img);
    }
    if ((!name || !img) && componentId && systemId) {
      const component = this._getComponent(systemId, componentId);
      name ||= stringOrNull(component?.name);
      img ||= stringOrNull(component?.img);
    }
    return {
      componentId,
      itemUuid,
      quantity: numberOrNull(result?.quantity) ?? 1,
      name,
      img,
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

  /**
   * Whether a crafting run's recipe identity must be redacted for the viewer.
   * Mirrors {@link GatheringListingBuilder._isOpaqueBlindRun}: a missing recipe
   * or a recipe the viewer cannot see (undiscovered alchemy / knowledge-gated
   * crafting) is redacted to a generic label. GMs and global-visible recipes are
   * never redacted. No visibility service ⇒ no redaction.
   * @private
   */
  _isCraftingRedacted({ recipe, actor, viewer, snapshot = null }) {
    // The GM bypass must precede the missing-recipe guard (issue 738): a recipe that
    // no longer resolves (edited id / deleted) still has a run whose persisted step
    // snapshots (requirements, roll, consumed items) the GM must see — collapsing it
    // to a redacted empty card hid a GM's own history. A non-GM viewer still cannot
    // verify visibility of an unresolvable recipe, so it stays redacted for them.
    if (viewer?.isGM === true) return false;
    if (!recipe) return true;
    if (typeof this._recipeVisibility?.evaluateRecipeAccess !== 'function') return false;
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
      runType === 'gathering' ? this._gatheringRunDisplayTask({ run, viewer }) : null;
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
        authority,
      }),
      runType,
      status,
      derivedStatus,
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
      gatheringYield:
        runType === 'gathering'
          ? this._gatheringYield({ run, system, context: gatheringContext })
          : null,
      recipeId: null,
      taskId: stringOrNull(run.taskId),
      // GM-only marker: this row names a task the acting player cannot see.
      blindSecretPreview,
      flavor: '',
      failureReason: stringOrNull(run.failureReason),
      ...this._passthroughResults(run.createdResults, stringOrNull(run.craftingSystemId)),
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
   *   player it resolves to the generic blind label. It previously resolved to the
   *   real task's NAME, because the marker did not exist and the run carried the
   *   drawn task id in clear text — the leak this issue is about, in rendered text.
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
      img: stringOrNull(task?.img) || DEFAULT_RUN_IMAGE,
      blindSecretPreview: secret,
    };
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
  _gatheringRunDisplayTask({ run, viewer }) {
    const environmentId = stringOrNull(run.environmentId);
    const blind = isBlindWaitingTaskId(run.taskId) || run.taskId === 'blind';
    if (!blind) {
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

  _gatheringYield({ run, system, context }) {
    if (!context?.task || (context.blind && !context.secret)) return null;
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

  _straightYieldEntries(task, systemId) {
    return normalizeList(task?.resultGroups).flatMap((group) =>
      normalizeList(group?.results).map((result, index) =>
        this._yieldEntry(result, systemId, index, 100)
      )
    );
  }

  _d100YieldEntries(task, run, systemId) {
    const actualById = new Map(
      normalizeList(run?.checkResult?.items)
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
      qty: numberOrNull(result?.quantity) ?? 1,
      chance,
    });
  }

  _gatheringActualRoll(run) {
    const result = plainObjectOrNull(run?.checkResult);
    const candidates = [
      result?.value,
      result?.roll,
      result?.data?.total,
      ...normalizeList(result?.items).map((item) => item?.roll),
    ];
    return candidates.map(numberOrNull).find((value) => value !== null) ?? null;
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
    const quantity = numberOrNull(result?.quantity) ?? 1;
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

  _actionAvailability() {
    try {
      const value = this._getJournalActionAvailability();
      return {
        available: value?.available !== false,
        reason: stringOrNull(value?.reason),
      };
    } catch {
      return { available: false, reason: 'authorityUnavailable' };
    }
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
    entitled = true,
    authority = null,
  }) {
    const lifecycleContract = getRunLifecycleContract(run);
    const recoveryEvidence = this._recoveryEvidence(run?.executionJournal);
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
    const readyToExecute = derivedStatus !== 'waiting' && derivedStatus !== 'paused';
    const legacyExecute = lifecycleContract === 'legacy' && live && runType === 'crafting' && owner;
    const legacyCancel = lifecycleContract === 'legacy' && live && runType === 'crafting' && owner;
    return {
      key: JSON.stringify([actorUuid, runType, stringOrNull(run?.id)]),
      actorUuid,
      activityKind,
      lifecycleContract,
      lifecycleVersion:
        lifecycleContract === 'legacy' ? null : safePrimitive(run?.lifecycleVersion),
      runRevision: normalizeRevision(run?.runRevision),
      completionMode: run?.completionMode === 'worldTime' ? 'worldTime' : 'manual',
      pauseState: normalizePauseState(run?.pauseState),
      pausedDurationSeconds: Math.max(0, Number(run?.pausedDurationSeconds) || 0),
      recoveryEvidence,
      actions: {
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
        setSelection: mutableCurrent && runType === 'crafting' && entitled,
        cancel: legacyCancel || (mutableCurrent && executableType),
        dismiss: terminal,
        disabledReason: blockedReason,
      },
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

  _recoveryEvidence(journal) {
    if (!journal || typeof journal !== 'object') return null;
    const rawStatus = stringOrNull(journal.status);
    if (!EXECUTION_JOURNAL_STATUSES.has(rawStatus)) return null;
    const status = rawStatus;
    const effects = normalizeList(journal.effects).map((effect) => ({
      kind: SAFE_EXECUTION_EFFECT_KINDS.has(effect?.kind) ? effect.kind : 'other',
      phase: EXECUTION_EFFECT_PHASES.has(effect?.phase) ? effect.phase : 'unknown',
      hasReceipt: Object.hasOwn(effect || {}, 'receipt'),
    }));
    return {
      status,
      appliedEffectCount: effects.filter((effect) => effect.phase === 'applied').length,
      effectCount: effects.length,
      effects,
      ...((status === 'recoveryRequired') && { required: true }),
    };
  }
}

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
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

function routedOutcomeBand(outcome, routed, task) {
  if (routed?.type === 'fixed') {
    const start = numberOrNull(outcome?.start) ?? 0;
    const end = numberOrNull(outcome?.end) ?? start;
    return start === end ? String(start) : `${start}–${end}`;
  }
  const baseDc = numberOrNull(task?.dcOverride) ?? numberOrNull(routed?.dc) ?? 15;
  const threshold = baseDc + (numberOrNull(outcome?.dc) ?? 0);
  return routed?.thresholdMode === 'exceed' ? `>${threshold}` : `${threshold}+`;
}

function selectedIngredientIndex(group, optionOverrides, selection) {
  const options = normalizeList(group?.options);
  const groupId = stringOrNull(group?.id);
  const override = Number(optionOverrides?.[groupId]?.optionIndex);
  if (Number.isSafeInteger(override) && override >= 0 && override < options.length) return override;
  const selected = normalizeList(selection?.selectedIngredients).find((ingredient) =>
    options.includes(ingredient)
  );
  const selectedIndex = options.indexOf(selected);
  return Math.max(selectedIndex, 0);
}

function ingredientKind(option) {
  if (option?.itemUuid) return 'item';
  const type = option?.match?.type;
  if (type === 'tags') return 'tag';
  if (['component', 'essence', 'currency'].includes(type)) return type;
  return 'unknown';
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
