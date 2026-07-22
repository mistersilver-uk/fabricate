import { getFabricateFlag, setFabricateFlag, stampItemDataRoleIdentity } from '../config/flags.js';
import { isToolBroken, resolvePresentComponentIds } from '../gatheringToolRuntime.js';
import { DEFAULT_RECIPE_IMAGE } from '../models/Recipe.js';
import { Tool } from '../models/Tool.js';
import {
  applyToolUsageAndBreakage,
  evaluateCheckBreakage,
  stampReplacementComponentIdentity,
} from '../toolBreakageRuntime.js';
import { buildInteractiveRollOptions } from '../ui/svelte/apps/crafting/rollPrompt.js';
import { canonicalSignatureKey } from '../utils/alchemySignatureKey.js';
import { resolveAlchemySubmissionComponent } from '../utils/alchemySubmissions.js';
import { matchComponentByName } from '../utils/componentNameMatch.js';
import {
  accumulateSubmissionEssences,
  findMatchingComponent,
  resolveItemEssences,
} from '../utils/essenceResolver.js';
import { MacroExecutor } from '../utils/MacroExecutor.js';
import { resolveProgressiveAward } from '../utils/progressiveAward.js';
import { applyPlayerResultOrder } from '../utils/progressiveResultOrder.js';
import { itemResolvesToComponent } from '../utils/sourceUuid.js';

import { runFormulaPassFail, runFormulaProgressive, runFormulaRouted } from './checkRoll.js';
import { buildCraftingChatContent } from './CraftingChatCard.js';
import {
  buildCurrencyAffordProbe,
  checkCurrencySpends,
  spendCurrencySpends,
} from './currencyAffordance.js';
import { buildSalvageChatContent } from './SalvageChatCard.js';
import { SignatureValidator } from './SignatureValidator.js';

/**
 * A human-readable reference for a Tool in a missing-tool diagnostic (issue 777). The
 * message names the tool by its human-readable `label`/`name` first, then the resolved
 * managed-component name, and only falls back to the raw component id (or tool id) when
 * no name is resolvable. This reverses the issue-561 behaviour that preferred the
 * `componentId: X` form for component-linked tools: `Tool.name` is a null-by-default
 * registration snapshot, so a component-linked tool with no snapshot used to leak its raw
 * `componentId` while the salvage panel showed a clean name. `resolveComponentName` never
 * returns the raw id (it yields the localized "Unknown Component" for an orphaned
 * component-linked tool), so the bare-id tail is reached only when no
 * `recipeManager`/`resolveComponentName` is wired (legacy/test managers). Display read
 * only — no snapshot is written.
 *
 * @param {object|null} tool
 * @param {object|null} recipe  The recipe/task in scope, for component-name resolution.
 * @param {object|null} recipeManager  Resolves a component-linked tool's display name.
 * @returns {string}
 */
function toolDisplayReference(tool, recipe = null, recipeManager = null) {
  const name = tool?.label || tool?.name;
  if (name) return name;
  const componentId = tool?.componentId || tool?.systemItemId;
  const resolved = recipeManager?.resolveComponentName?.(recipe, componentId);
  if (resolved) return resolved;
  return componentId || tool?.id || 'unknown';
}

/**
 * The RAW rolled total to render on a result chat card, or null when no check ran.
 * A progressive check overwrites `value` with the AWARDING value on a forced crit
 * (`MAX_SAFE_INTEGER` for SUCCESS, `0` for FAILURE — see `runFormulaProgressive` in
 * checkRoll.js), so the card must read `data.total` (the raw roll) and only fall
 * back to `value` for runners that omit `data.total`. For simple/routed checks
 * `value === data.total`, so this is a no-op there.
 *
 * @param {object|null} checkResult
 * @returns {number|null}
 */
export function rollTotalForCard(checkResult) {
  return checkResult?.data?.total ?? checkResult?.value ?? null;
}

/**
 * Map one `_consumeIngredients` entry to the persisted run-record shape, capturing
 * the item's `name`/`img` at consume time (issue 738). A consumed item is DELETED
 * from the actor immediately, so a render-time uuid lookup returns null and yields a
 * blank name in the Journal history detail — mirroring the `createdResults` capture,
 * the name/img are snapshot here while the source item still exists. Pre-capture
 * historical records simply carry no name/img and fall back to a render-time lookup.
 *
 * @param {{item: object, quantity: number}} consumed
 * @returns {{actorUuid: string|null, itemUuid: string|null, quantity: number, name: string|null, img: string|null}}
 */
function mapConsumedIngredientRef({ item, quantity }) {
  return {
    actorUuid: item.parent?.uuid || null,
    itemUuid: item.uuid,
    quantity,
    name: item.name ?? null,
    img: item.img ?? null,
  };
}

/**
 * Stamp the durable per-system component identity on a crafted OUTPUT item's data,
 * BEFORE creation, so the inventory matcher attributes it to its OWN component
 * regardless of naming collisions or Foundry's transitive `_stats.duplicateSource`
 * chain (issue 539). A crafted item built from `sourceItem.toObject()` inherits the
 * source's `duplicateSource`, which — for a component whose source was itself
 * duplicated from a SIBLING component's item — points at the sibling and mis-attributes
 * the output through the raw-reference fall-through.
 *
 * The stamp keys the SAME location the canonical reader `resolveComponentForItem` reads
 * FIRST for an owned item — its tier-1 durable-flag identity
 * (`durableClaimedComponent` → `claimedRoleId` → `flags.fabricate.roles[systemId].componentId`
 * in `src/utils/sourceUuid.js`) — so a freshly crafted item resolves to its own component
 * by identity and never reaches the source-ref tier.
 *
 * The doubly-nested `flags.fabricate.fabricate.roles[systemId].componentId` container-build,
 * the `isSafeFlagKeySegment` dotted-systemId guard, and the sibling-preserving `||=` write
 * now live in the shared {@link stampItemDataRoleIdentity} writer in `src/config/flags.js`
 * (issue 780), which the gathering-award and tool-replacement creators also call, so the
 * four creation sites cannot drift. This is a one-line delegate at the `componentId` role,
 * preserving the crafted-output behaviour byte-for-byte.
 *
 * @param {object} itemData - The plain item-data object about to be created.
 * @param {string|null|undefined} systemId - The crafting system's id.
 * @param {string|null|undefined} componentId - The result component's id.
 */
function stampCraftedComponentIdentity(itemData, systemId, componentId) {
  stampItemDataRoleIdentity(itemData, systemId, 'componentId', componentId);
}

/**
 * Handles the actual crafting process
 * Validates ingredients, consumes items, creates outputs
 */
export class CraftingEngine {
  constructor(
    recipeManager,
    craftingRunManager = null,
    resolutionModeService = null,
    itemPilesIntegration = null,
    salvageRunManager = null,
    actorInventoryCoinSpender = null,
    actorPropertyCoinSpender = null,
    // 8th positional options bag — additive, so existing `new CraftingEngine(...)` call
    // sites are unaffected. `getPlayerResultOrder` returns the executing user's stored
    // progressive result order for a salvage component, or null; it is read ONCE, at run
    // start, and captured onto the run record (issue 651 D2).
    //
    // Salvage deliberately does NOT route this through `this.resolutionModeService`: many
    // callers construct CraftingEngine without one, which would make the seam silently
    // unreachable.
    { getPlayerResultOrder = () => null } = {}
  ) {
    this.recipeManager = recipeManager;
    this.craftingRunManager = craftingRunManager;
    this.resolutionModeService = resolutionModeService;
    this.itemPilesIntegration = itemPilesIntegration;
    this.salvageRunManager = salvageRunManager;
    // Stubbable spend seams: the actorInventory spender is injected by tests (and wired in
    // main.js) so they can assert which path ran; the actorProperty spender defaults to the
    // generic implementation and needs no system-specific wiring. They flow through to the
    // shared currency-affordance resolver as the spend-strategy → spender seams.
    this.actorInventoryCoinSpender = actorInventoryCoinSpender;
    this.actorPropertyCoinSpender = actorPropertyCoinSpender;
    this.getPlayerResultOrder = getPlayerResultOrder;
  }

  /**
   * The spend seams handed to the shared currency-affordance helpers
   * ({@link buildCurrencyAffordProbe}, {@link checkCurrencySpends}, {@link spendCurrencySpends}).
   * @private
   */
  _currencySeams() {
    return {
      actorInventoryCoinSpender: this.actorInventoryCoinSpender,
      actorPropertyCoinSpender: this.actorPropertyCoinSpender,
    };
  }

  /**
   * The component resolver to inject through the craftability, selection, and
   * essence-context paths for THIS craft (issue 578). Only an alchemy attempt
   * supplies the tier-4-aware {@link resolveAlchemySubmissionComponent} — the same
   * resolver the submission collector/palette bucketed with — so a purely-tier-4
   * submission (bare top-level `registeredItemUuid`) resolves to the same component
   * everywhere on the brew path. Every other craft (and every display caller) gets
   * `undefined`, which each threaded callee defaults to the shared standard-craft
   * resolvers — byte-for-byte unchanged, so standard crafting never gains tier 4.
   *
   * @private
   * @param {object|null} options - The craft options bag.
   * @returns {Function|undefined} The injected resolver, or undefined for standard crafting.
   */
  _alchemyComponentResolver(options) {
    return options?.isAlchemyAttempt === true ? resolveAlchemySubmissionComponent : undefined;
  }

  /**
   * A resolution `meta.disposition` that represents a crafting-system MISCONFIGURATION
   * (issue 85): a matched signature whose awarded result group cannot be resolved. This
   * is a GM-side authoring gap, not a rolled player failure — the craft must abort with
   * ZERO mutation (no ingredient, currency, or tool consumption) and report failure, not
   * a silent empty success. Covers an unrecognized routed/tiered check outcome
   * (`misconfiguration`), a resolved-but-unassigned outcome tier (`unrouted-tier`), and an
   * unknown resolution mode (`error`).
   *
   * @private
   * @param {string|null|undefined} disposition
   * @returns {boolean}
   */
  _isMisconfigurationDisposition(disposition) {
    return ['misconfiguration', 'unrouted-tier', 'error'].includes(disposition);
  }

  /**
   * Attempt to craft an item using a recipe
   * @param {Actor} craftingActor - The actor where results will be added
   * @param {Actor[]} componentSourceActors - The actors to consume ingredients from
   * @param {Recipe} recipe - The recipe to use
   * @param {string} ingredientSetId - Which ingredient set to use (optional, uses first satisfiable if not provided)
   * @param {Object} options - Additional options
   * @param {object|null} [options.ingredientOptionOverrides] Per-group player option
   *   overrides (issue 552), keyed by `group.id` → `{ optionIndex, heldItemId? }`.
   *   Threaded to the craftability gate and the single selection source so the
   *   consumed plan matches what the player chose in the UI (and an insufficient
   *   choice blocks with the missing-materials message). For a time-gated step the
   *   override is applied at START, so the consumed-item snapshot the FINISH resume
   *   replays already encodes the chosen option/stack.
   * @param {boolean} [options.interactive] When true, the crafting check prompts the
   *   player with the confirm-roll dialog (optional situational modifier) and posts
   *   the roll to chat so Dice So Nice animates it. Defaults to false so automation
   *   and macros stay silent. A dismissed prompt returns
   *   `{ success: false, cancelled: true, results: null }` with zero mutation (no
   *   ingredients, currency, or tools consumed, no run created). Note there is no
   *   silent world-time roll for crafting: the initial time-gate-ARMING call
   *   returns before the check runs (nothing to prompt), but a timed step's RESUME
   *   is always a player click (Crafting-tab craft or the Journal "Trigger Next
   *   Step") and DOES prompt when `interactive` is passed. (Only gathering has a
   *   GM-gated world-time maturation path that resolves silently.)
   * @returns {Promise<{success: boolean, results: Item[]|null, message: string, cancelled?: boolean}>}
   */
  async craft(craftingActor, componentSourceActors, recipe, ingredientSetId = null, options = {}) {
    const resolutionService =
      this.resolutionModeService || game.fabricate?.getResolutionModeService?.();
    // Virtual-present tools injected by an active canvas Tool station (Phase 4):
    // a `{ systemId, componentIds }` payload. A componentId is satisfied without
    // an owned item (and excluded from breakage/usage) ONLY when the active
    // tool's systemId matches the recipe's crafting system — componentId is a
    // per-system id, so a tool from system A must not satisfy a system-B recipe.
    const presentTools =
      options?.presentTools && !Array.isArray(options.presentTools) ? options.presentTools : null;
    // Per-group player option overrides (issue 552): a `{ [groupId]: {optionIndex,
    // heldItemId?} }` map from the crafting UI. Threaded to BOTH the craftability
    // gate and the single selection source so the display and the consumed plan
    // resolve the same chosen option/stack.
    const ingredientOptionOverrides =
      options?.ingredientOptionOverrides && typeof options.ingredientOptionOverrides === 'object'
        ? options.ingredientOptionOverrides
        : null;
    // Validate inputs
    if (!craftingActor) {
      return {
        success: false,
        results: null,
        message: 'No crafting actor selected',
      };
    }

    if (!componentSourceActors || componentSourceActors.length === 0) {
      return {
        success: false,
        results: null,
        message: 'No component source actors selected',
      };
    }

    // Validate the recipe
    const validation = recipe.validate();
    if (!validation.valid) {
      return {
        success: false,
        results: null,
        message: `Invalid recipe: ${validation.errors.join(', ')}`,
      };
    }

    const runManager = this.craftingRunManager || game.fabricate?.getCraftingRunManager?.();
    let run = null;
    // Track whether THIS call created the run (vs reused an existing one) and whether
    // it reached a legitimate persisted state (armed a time gate, or completed a
    // step). A run created here but never resolved — e.g. rejected by a pre-check
    // validation gate below — is a phantom and is discarded in the `finally`, so a
    // failed or never-started craft never lingers as an "in progress" active run.
    let createdThisCall = false;
    let resolved = false;
    if (runManager) {
      run = options?.runId
        ? runManager.getActiveRun(craftingActor, options.runId)
        : runManager.findActiveRunForRecipe(craftingActor, recipe.id);
      if (!run) {
        run = await runManager.createRun(
          craftingActor,
          recipe,
          componentSourceActors,
          game.user?.id || null
        );
        createdThisCall = true;
      }
    }

    try {
      const visibilityService = game.fabricate?.getRecipeVisibilityService?.();
      if (visibilityService) {
        const guard = visibilityService.guardCraftStart({
          viewer: game.user,
          recipe,
          craftingActor,
          componentSourceActors,
        });
        if (!guard.craftable) {
          const reasonMap = {
            'missing-system': 'Crafting system not found',
            'system-invalid': 'Crafting system is invalid',
            visibility: 'Recipe is not visible to this user',
            knowledge: 'Missing recipe knowledge',
            locked: 'Recipe is locked',
          };
          return {
            success: false,
            results: null,
            message: reasonMap[guard.reason] || 'Crafting is blocked by recipe access rules',
          };
        }
      }

      const executionSteps =
        typeof recipe.getExecutionSteps === 'function'
          ? recipe.getExecutionSteps()
          : [
              {
                id: 'implicit-step',
                name: 'Step 1',
                ingredientSets: recipe.ingredientSets || [],
                resultGroups: recipe.resultGroups || [],
                toolIds: recipe.toolIds || [],
                timeRequirement: null,
                outcomeRouting: recipe.outcomeRouting || null,
              },
            ];

      let stepIndex = Number(run?.currentStepIndex);
      if (!Number.isFinite(stepIndex) || stepIndex < 0) stepIndex = 0;
      const step = executionSteps[stepIndex];
      if (!step) {
        return {
          success: false,
          results: null,
          message: 'No active crafting step available',
        };
      }
      if (resolutionService) {
        const modeValidation = resolutionService.validateRecipe(recipe);
        if (!modeValidation.valid) {
          return {
            success: false,
            results: null,
            message: `Mode validation failed: ${modeValidation.errors.join(', ')}`,
          };
        }
      }

      // Collapsed multi-step chain (issue 710): when the system's multi-step
      // feature is OFF but this recipe still carries authored steps, the whole
      // recipe runs as ONE atomic craft action — its authored steps execute
      // back-to-back within this single call, with no step-triggering UX and no
      // between-step waiting (see the success-path recursion below). The steps are
      // preserved untouched; re-enabling the feature restores the normal
      // step-by-step flow. Per-step time gates do NOT arm individually here: the
      // step durations are SUMMED into one gate for the single action, handled once
      // at the chain's entry (stepIndex 0). Mid-chain failure follows the existing
      // per-step failure policy — already-consumed prior steps stay consumed.
      const collapsedChain = this._isCollapsedChain(recipe);
      if (collapsedChain && stepIndex === 0) {
        const gateOutcome = await this._handleCollapsedChainGate({
          craftingActor,
          recipe,
          executionSteps,
          runManager,
          run,
        });
        run = gateOutcome.run || run;
        if (gateOutcome.waiting) {
          // The run legitimately waits for its summed gate to mature — not a phantom.
          resolved = true;
          return gateOutcome.result;
        }
      }

      // Time-gated step handling. A step whose time requirement resolves to > 0
      // seconds consumes its components (and currency) at START — the call that
      // ARMS the gate — then resumes at maturity (FINISH) to run the crafting
      // check and create results. Instant (0-second) timed steps and non-timed
      // steps fall through to the normal consume-at-finish path below unchanged.
      // The enabled flag gates only ARMING a new gate: an already-armed gate must
      // still resume even if the GM disabled time requirements mid-run, or the
      // finish path would re-consume components already spent at START.
      // A collapsed chain skips this per-step gate entirely: its single summed gate
      // was already handled above, and the chain then consumes at execution.
      const timeGateSeconds =
        runManager &&
        run &&
        step.timeRequirement &&
        !collapsedChain &&
        (this._timeRequirementsEnabled(recipe) || !!run.steps?.[stepIndex]?.timeGate)
          ? runManager.durationToSeconds(step.timeRequirement)
          : 0;
      if (timeGateSeconds > 0) {
        const existingGate = run.steps?.[stepIndex]?.timeGate;
        if (!existingGate) {
          // START: consume now, snapshot, then arm the gate.
          const startOutcome = await this._startTimedStep({
            craftingActor,
            componentSourceActors,
            recipe,
            step,
            stepIndex,
            ingredientSetId,
            ingredientOptionOverrides,
            presentTools,
            options,
            runManager,
            run,
            createdThisCall,
          });
          resolved = startOutcome.resolved;
          return startOutcome.result;
        }
        if (!runManager.canProceedTimeGate(run, stepIndex, Number(game.time?.worldTime || 0))) {
          const remaining = Math.max(
            0,
            Math.ceil(Number(existingGate.availableAt || 0) - Number(game.time?.worldTime || 0))
          );
          // Components were already consumed at START; the run legitimately stays
          // active while its gate matures — not a phantom.
          resolved = true;
          const stepLabel = step.name || `Step ${stepIndex + 1}`;
          return {
            success: false,
            results: null,
            message: `Step "${stepLabel}" is still in progress (${remaining}s remaining)`,
          };
        }
        // FINISH: gate matured. Run the check and create results WITHOUT
        // re-consuming (components/currency were already spent at START).
        run = await runManager.markStepInProgress(craftingActor, run, stepIndex);
        const finishOutcome = await this._finishTimedStep({
          craftingActor,
          componentSourceActors,
          recipe,
          step,
          stepIndex,
          options,
          presentTools,
          runManager,
          run,
        });
        resolved = finishOutcome.resolved;
        return finishOutcome.result;
      }

      const executionRecipe = this._buildStepRecipeView(recipe, step);

      // Alchemy attempts inject the tier-4-aware submission resolver through the
      // craftability, selection, and essence-context paths (issue 578); standard
      // crafting gets `undefined` → the shared resolvers, byte-for-byte unchanged.
      const resolveComponent = this._alchemyComponentResolver(options);

      // Check if recipe step can be crafted. Thread the crafting actor so a currency
      // alternative is craftable exactly when this actor can afford it — display and
      // execution agree on the same currency-aware decision.
      const canCraftCheck = this.recipeManager.canCraft(componentSourceActors, executionRecipe, {
        presentTools,
        craftingActor,
        resolveComponent,
        optionOverrides: ingredientOptionOverrides,
      });
      if (!canCraftCheck.canCraft) {
        const missingMsg = this._formatMissingItems(canCraftCheck.missing, executionRecipe);
        return {
          success: false,
          results: null,
          message: `Missing required items:\n${missingMsg}`,
        };
      }

      // Determine which ingredient set to use
      let ingredientSet;
      if (ingredientSetId) {
        ingredientSet = executionRecipe.ingredientSets.find((s) => s.id === ingredientSetId);
        if (!ingredientSet) {
          return {
            success: false,
            results: null,
            message: `Invalid ingredient set ID: ${ingredientSetId}`,
          };
        }
      } else {
        // Use the satisfiable set from canCraftCheck
        ingredientSet = canCraftCheck.satisfiableSet;
      }

      // SINGLE SELECTION SOURCE: compute the widened selection exactly once here, with
      // the currency probe bound to the crafting actor + system currency profile. Both
      // consumption (its item `plan`) and the currency gate/spend (its `currencySpends`)
      // read THIS selection — never a recompute — so item mutation mid-craft can never
      // diverge the gated spend from the consumed plan.
      const craftSelection = this._resolveCraftSelection(
        componentSourceActors,
        ingredientSet,
        executionRecipe,
        craftingActor,
        resolveComponent,
        ingredientOptionOverrides
      );
      const currencySpends = craftSelection.currencySpends || [];

      // Validate tools: the recipe's resolved library Tools must be present
      // (a matching, non-broken item) on the component source actors.
      const toolsForSet =
        typeof this.recipeManager.getToolsForSet === 'function'
          ? this.recipeManager.getToolsForSet(executionRecipe, ingredientSet)
          : [];
      const toolValidation = await this._validateTools(
        componentSourceActors,
        executionRecipe,
        toolsForSet,
        presentTools
      );
      if (!toolValidation.valid) {
        return {
          success: false,
          results: null,
          message: toolValidation.message,
        };
      }

      // Currency afford gate: every chosen currency spend must be affordable (aggregated
      // cross-unit on the common ladder) BEFORE any item/currency mutation or the
      // Item-Piles deduct. On a shortfall we abort here with zero mutation and never fall
      // back to an unselected item plan.
      const currencyAffordCheck = await checkCurrencySpends(
        craftingActor,
        executionRecipe,
        currencySpends,
        this._currencySeams()
      );
      if (!currencyAffordCheck.valid) {
        return {
          success: false,
          results: null,
          message: currencyAffordCheck.message,
        };
      }

      const itemPilesAffordCheck = await this._checkItemPilesCurrencyCost(craftingActor, recipe);
      if (!itemPilesAffordCheck.valid) {
        return {
          success: false,
          results: null,
          message: itemPilesAffordCheck.message,
        };
      }

      // Run optional system-level crafting check before consuming ingredients.
      // `interactive` (opt-in, from a UI-triggered craft) surfaces a confirm/roll
      // dialog and posts the roll to chat; automation/macros omit it and stay silent.
      const checkResult = await this._runCraftingCheck(
        executionRecipe,
        craftingActor,
        componentSourceActors,
        ingredientSet,
        step,
        { interactive: options?.interactive === true }
      );
      // A misconfigured required check (no authored roll formula for the active mode)
      // is a GM-side system gap, not a rolled failure: abort with ZERO mutation so the
      // player's ingredients/currency/tools are never consumed or broken. The
      // failure-consumption policy below applies only to genuine rolled failures.
      if (checkResult.misconfigured) {
        return {
          success: false,
          results: null,
          message: checkResult.message,
        };
      }
      // The player dismissed the interactive roll dialog: a user choice, not a
      // failure. Abort with ZERO mutation (no consumption, no breakage, no chat)
      // before the failure-consumption path below.
      if (checkResult.cancelled) {
        return { success: false, cancelled: true, results: null, message: 'Crafting cancelled' };
      }
      if (!checkResult.success) {
        // Matched Simple alchemy attempt: a failed check is a genuine outcome, not a
        // fizzle. Consume per `alchemy.consumeOnFail`, produce the reserved failure
        // result group (when non-empty), learn on match, and post a DISTINCT
        // failure-result banner. Tiered alchemy failure fizzles via the generic path
        // below (routedByCheck short-circuit, no failure group).
        if (
          options?.isAlchemyAttempt === true &&
          this._getAlchemyCheckMode(executionRecipe) === 'simple'
        ) {
          const outcome = await this._resolveAlchemySimpleFailure({
            craftingActor,
            componentSourceActors,
            recipe,
            executionRecipe,
            step,
            stepIndex,
            ingredientSet,
            craftSelection,
            currencySpends,
            toolValidation,
            checkResult,
            options,
            runManager,
            run,
          });
          resolved = outcome.resolved;
          return outcome.result;
        }
        const failurePolicy = this._getFailureConsumptionPolicy(executionRecipe);
        let consumedOnFail = [];
        let usedToolPairs = [];
        let usedToolsOnFail = [];
        try {
          if (failurePolicy.consumeIngredientsOnFail) {
            consumedOnFail = await this._consumeIngredients(craftSelection.plan);
            // Currency is consumed alongside items on the failure path only when the
            // policy consumes ingredients on failure (it is a chosen ingredient).
            await this._spendCraftCurrency(craftingActor, executionRecipe, currencySpends);
          }
          if (failurePolicy.breakToolsOnFail) {
            usedToolPairs = toolValidation.tools;
            // The single shared `evaluateCheckBreakage` seam decides forced breakage
            // on the check-failure path too (gated by `breakToolsOnFail`, as
            // today). Under `toolSpecific` an engine-evaluated crit/tier
            // `data.breakTools` force-break applies; under `checkDriven` the active
            // check's `checkBreakage` triggers decide. The no-check passthrough
            // result is not engine-evaluated, so it never force-breaks (the
            // `engineEvaluated` guard lives inside the seam).
            const breakDecision = this._resolveCraftingBreakageDecision(
              this._getRecipeSystem(executionRecipe),
              executionRecipe,
              checkResult
            );
            usedToolsOnFail = await this._applyToolBreakage(executionRecipe, toolValidation.tools, {
              forceBreak: breakDecision.forceBreak,
              authority: breakDecision.authority,
              reason: breakDecision.reason,
              triggerId: breakDecision.triggerId,
            });
          }
        } catch (consumptionError) {
          console.error('Fabricate | Error during failure-path consumption:', consumptionError);
        }
        if (runManager && run) {
          await runManager.completeStepFailure(
            craftingActor,
            run,
            stepIndex,
            checkResult.message || 'Crafting check failed',
            {
              selectedIngredientSetId: ingredientSet.id,
              lastCheckResult: {
                success: false,
                reason: checkResult.message || 'Crafting check failed',
                outcome: checkResult.outcome ?? undefined,
                value: checkResult.value ?? undefined,
                data: checkResult.data || {},
              },
              consumedIngredients: consumedOnFail.map(mapConsumedIngredientRef),
              usedTools: usedToolsOnFail,
            }
          );
        }
        await this._postCraftChatMessage({
          success: false,
          craftingActor,
          recipe,
          consumedIngredients: consumedOnFail,
          tools: usedToolPairs,
          createdResults: [],
          failureReason: checkResult.message || 'Crafting check failed',
          rollValue: rollTotalForCard(checkResult),
        });
        return {
          success: false,
          results: null,
          message: checkResult.message || 'Crafting check failed',
        };
      }
      if (
        resolutionService &&
        !resolutionService.validateCheckResult({ recipe: executionRecipe, checkResult })
      ) {
        const message =
          'Crafting check result does not satisfy current resolution mode requirements';
        const validationFailurePolicy = this._getFailureConsumptionPolicy(executionRecipe);
        let consumedOnValidationFail = [];
        let usedToolPairsOnValidationFail = [];
        let usedToolsOnValidationFail = [];
        try {
          if (validationFailurePolicy.consumeIngredientsOnFail) {
            consumedOnValidationFail = await this._consumeIngredients(craftSelection.plan);
            await this._spendCraftCurrency(craftingActor, executionRecipe, currencySpends);
          }
          if (validationFailurePolicy.breakToolsOnFail) {
            usedToolPairsOnValidationFail = toolValidation.tools;
            // Resolution-mode validation failure: route through the shared seam so the
            // breakage authority (and immune handling) stay consistent. The check
            // itself succeeded, so a checkDriven trigger may still force breakage.
            const validationBreakDecision = this._resolveCraftingBreakageDecision(
              this._getRecipeSystem(executionRecipe),
              executionRecipe,
              checkResult
            );
            usedToolsOnValidationFail = await this._applyToolBreakage(
              executionRecipe,
              toolValidation.tools,
              {
                forceBreak: validationBreakDecision.forceBreak,
                authority: validationBreakDecision.authority,
                reason: validationBreakDecision.reason,
                triggerId: validationBreakDecision.triggerId,
              }
            );
          }
        } catch (consumptionError) {
          console.error('Fabricate | Error during failure-path consumption:', consumptionError);
        }
        if (runManager && run) {
          await runManager.completeStepFailure(craftingActor, run, stepIndex, message, {
            selectedIngredientSetId: ingredientSet.id,
            lastCheckResult: {
              success: false,
              reason: message,
              outcome: checkResult.outcome ?? undefined,
              value: checkResult.value ?? undefined,
              data: checkResult.data || {},
            },
            consumedIngredients: consumedOnValidationFail.map(mapConsumedIngredientRef),
            usedTools: usedToolsOnValidationFail,
          });
        }
        await this._postCraftChatMessage({
          success: false,
          craftingActor,
          recipe,
          consumedIngredients: consumedOnValidationFail,
          tools: usedToolPairsOnValidationFail,
          createdResults: [],
          failureReason: message,
          rollValue: rollTotalForCard(checkResult),
        });
        return {
          success: false,
          results: null,
          message,
        };
      }

      // PRE-CONSUMPTION MISCONFIGURATION GATE (issue 85). Resolve the awarded result
      // group(s) BEFORE consuming anything. A matched signature whose routed/tiered
      // check outcome resolves to no valid result group (an unrecognized outcome, an
      // unrouted tier, or an unknown mode) is a crafting-system misconfiguration — a
      // GM-side authoring gap, not a player success or a rolled failure. Abort here with
      // ZERO mutation so ingredients, currency, and tools are never consumed or broken,
      // record the run as a step failure, and surface the actionable GM diagnostic
      // (spec `resolution-modes` §Alchemy Mode and `recipes-and-steps` §Alchemy Execution
      // Lifecycle). Resolution is a pure, deterministic read of the recipe/step/ingredient
      // set/check result, so it agrees with the resolution `_createResultItems` performs
      // after consumption — this simply moves detection ahead of any mutation.
      if (typeof resolutionService?.resolveResultGroups === 'function') {
        const preflightResolution = resolutionService.resolveResultGroups({
          recipe: executionRecipe,
          step,
          ingredientSet,
          checkResult,
          selectedResultGroupId: options?.resultGroupId || null,
        });
        if (this._isMisconfigurationDisposition(preflightResolution?.meta?.disposition)) {
          const message = preflightResolution.meta.error || 'Crafting resolution failed';
          if (runManager && run) {
            await runManager.completeStepFailure(craftingActor, run, stepIndex, message, {
              selectedIngredientSetId: ingredientSet.id,
              lastCheckResult: {
                success: false,
                reason: message,
                outcome: checkResult.outcome ?? undefined,
                value: checkResult.value ?? undefined,
                data: checkResult.data || {},
              },
              consumedIngredients: [],
              usedTools: [],
            });
          }
          await this._postCraftChatMessage({
            success: false,
            craftingActor,
            recipe,
            consumedIngredients: [],
            tools: [],
            createdResults: [],
            failureReason: message,
            rollValue: rollTotalForCard(checkResult),
          });
          return {
            success: false,
            results: null,
            message,
            disposition: preflightResolution.meta.disposition,
          };
        }
      }

      // Consume ingredients from the single craft selection's item plan.
      const consumedItems = await this._consumeIngredients(craftSelection.plan);

      // For alchemy attempts: also consume submitted items that weren't handled
      // by standard ingredient matching (e.g. items used only for essences).
      await this._consumeAlchemyExtraItems(consumedItems, componentSourceActors, options);

      // Deduct the chosen currency spends after item consumption (the afford gate above
      // already confirmed every spend is affordable). A mid-loop spend failure is logged
      // like the Item-Piles deduct error below — not refunded.
      await this._spendCraftCurrency(craftingActor, executionRecipe, currencySpends);

      // Apply tool usage/breakage for the recipe's resolved library Tools via the
      // single shared `evaluateCheckBreakage` seam. Under `toolSpecific` an
      // engine-evaluated crit/tier `breakTools` forces every matched tool to break (the
      // no-check passthrough result is not engine-evaluated, so it does not); under
      // `checkDriven` the active
      // check's `checkBreakage` triggers decide whether all required non-immune tools
      // break. The SUCCESS path always applies breakage (no `breakToolsOnFail`
      // gate exists here).
      const successBreakDecision = this._resolveCraftingBreakageDecision(
        this._getRecipeSystem(executionRecipe),
        executionRecipe,
        checkResult
      );
      const usedTools = await this._applyToolBreakage(executionRecipe, toolValidation.tools, {
        forceBreak: successBreakDecision.forceBreak,
        authority: successBreakDecision.authority,
        reason: successBreakDecision.reason,
        triggerId: successBreakDecision.triggerId,
      });

      // Deduct Item Piles currency cost after ingredients are consumed to avoid
      // losing currency if ingredient consumption throws.
      await this._deductItemPilesCurrencyCost(craftingActor, recipe);

      // Create the result item(s). The awarded result group was already resolved and
      // validated by the pre-consumption misconfiguration gate above (a matched signature
      // that could not resolve to a valid result group aborted before any consumption),
      // so this deterministic re-resolution inside `_createResultItems` yields real groups.
      const { items: resultItems } = await this._createResultItems(
        craftingActor,
        executionRecipe,
        step,
        ingredientSet,
        consumedItems,
        toolValidation.tools,
        checkResult,
        options?.resultGroupId || null,
        null,
        resolveComponent
      );

      if (runManager && run) {
        run = await runManager.completeStepSuccess(craftingActor, run, stepIndex, {
          selectedIngredientSetId: ingredientSet.id,
          lastCheckResult: {
            success: true,
            reason: checkResult.message || 'Success',
            outcome: checkResult.outcome ?? undefined,
            value: checkResult.value ?? undefined,
            data: checkResult.data || {},
          },
          consumedIngredients: consumedItems.map(mapConsumedIngredientRef),
          usedTools,
          createdResults: (resultItems || []).map((item) => ({
            actorUuid: craftingActor.uuid,
            itemUuid: item.uuid,
            quantity: Number(item.system?.quantity || 1),
            name: item.name ?? null,
            img: item.img ?? null,
          })),
        });
      }
      // Step resolved: a multi-step recipe keeps an active run for the next step; a
      // final step is already moved to history. Either way it is not a phantom.
      resolved = true;

      if (visibilityService) {
        await visibilityService.applyRecipeItemUseOnCraft({
          recipe,
          craftingActor,
          componentSourceActors,
        });
        if (options?.isAlchemyAttempt === true) {
          await visibilityService.learnRecipeOnCraft(recipe, craftingActor);
        }
      }

      await this._postCraftChatMessage({
        success: true,
        craftingActor,
        recipe,
        consumedIngredients: consumedItems,
        tools: toolValidation.tools,
        createdResults: resultItems,
        rollValue: rollTotalForCard(checkResult),
      });

      // Collapsed chain (issue 710): a non-final step just succeeded and the run is
      // still active, so continue the atomic action immediately by executing the
      // next step in the SAME craft call — no between-step waiting. Recurse with the
      // run id (so the next step resolves against the same run) and a NULL ingredient
      // set / cleared per-step overrides so each later step auto-resolves its own
      // satisfiable set rather than reusing the step-0 selection. The returned result
      // is the FINAL step's — the chain's effective outcome.
      if (
        collapsedChain &&
        runManager &&
        run?.status !== 'succeeded' &&
        runManager.getActiveRun(craftingActor, run.id)
      ) {
        return this.craft(craftingActor, componentSourceActors, recipe, null, {
          ...options,
          runId: run.id,
          ingredientOptionOverrides: null,
          resultGroupId: null,
        });
      }

      return {
        success: true,
        results: resultItems,
        message:
          run?.status === 'succeeded'
            ? `Successfully crafted ${recipe.name}`
            : `Completed ${step.name || `step ${stepIndex + 1}`} for ${recipe.name}`,
      };
    } finally {
      // A run created this call that never armed a time gate or completed a step is a
      // phantom stranded by a pre-check early-return (or a mid-execution throw).
      // Discard it with no history entry — the attempt never began and the caller
      // already surfaced the failure message. Completed runs are already moved to
      // history (getActiveRun → null), and a reused pre-existing run
      // (createdThisCall=false) is never touched.
      if (createdThisCall && !resolved && run && runManager?.getActiveRun(craftingActor, run.id)) {
        await runManager.discardRun(craftingActor, run.id);
      }
    }
  }

  /**
   * START phase of a time-gated step: validate craftability, resolve the single
   * craft selection, run the afford / tool gates, then CONSUME the components and
   * currency NOW (before the gate is armed). Snapshots the resolved essences and a
   * lightweight consumed-item summary onto the run step (via
   * {@link CraftingRunManager#markStepPrepared}) so the FINISH resume can build
   * results without re-reading the deleted source items, then arms the gate.
   *
   * Any pre-arm failure removes the run so no zombie "Ready to finish" run lingers:
   * a run this call created is discarded (no history); a reused run is cancelled.
   * Tool BREAKAGE is intentionally NOT applied here — it is tied to the crafting
   * check outcome, which happens at FINISH.
   *
   * @private
   * @returns {Promise<{ resolved: boolean, result: object }>}
   */
  async _startTimedStep({
    craftingActor,
    componentSourceActors,
    recipe,
    step,
    stepIndex,
    ingredientSetId,
    ingredientOptionOverrides = null,
    presentTools,
    options,
    runManager,
    run,
    createdThisCall,
  }) {
    const executionRecipe = this._buildStepRecipeView(recipe, step);

    // A timed alchemy attempt reaches canCraft/selection/essence-context here too
    // (issue 578): inject the tier-4-aware submission resolver so a purely-tier-4
    // submission STARTS (passes craftability, is consumed) and its component's
    // essences are snapshotted for the FINISH effect transfer. Standard timed
    // crafting gets `undefined` → the shared resolvers, byte-for-byte unchanged.
    const resolveComponent = this._alchemyComponentResolver(options);

    // Remove the never-armed run on any pre-arm failure so no zombie lingers: a
    // run this call created is discarded (no history); a reused run is cancelled.
    const abort = async (message) => {
      await (createdThisCall
        ? runManager.discardRun(craftingActor, run.id)
        : runManager.cancelRun(craftingActor, run.id));
      return { resolved: true, result: { success: false, results: null, message } };
    };

    const canCraftCheck = this.recipeManager.canCraft(componentSourceActors, executionRecipe, {
      presentTools,
      craftingActor,
      resolveComponent,
      optionOverrides: ingredientOptionOverrides,
    });
    if (!canCraftCheck.canCraft) {
      return abort(
        `Missing required items:\n${this._formatMissingItems(canCraftCheck.missing, executionRecipe)}`
      );
    }

    let ingredientSet;
    if (ingredientSetId) {
      ingredientSet = executionRecipe.ingredientSets.find((s) => s.id === ingredientSetId);
      if (!ingredientSet) {
        return abort(`Invalid ingredient set ID: ${ingredientSetId}`);
      }
    } else {
      ingredientSet = canCraftCheck.satisfiableSet;
    }

    // SINGLE SELECTION SOURCE (mirrors craft()): the item plan and currencySpends
    // both come from ONE _resolveCraftSelection call so consumption never diverges
    // from the gated/spent currency.
    const craftSelection = this._resolveCraftSelection(
      componentSourceActors,
      ingredientSet,
      executionRecipe,
      craftingActor,
      resolveComponent,
      ingredientOptionOverrides
    );
    const currencySpends = craftSelection.currencySpends || [];

    const toolsForSet =
      typeof this.recipeManager.getToolsForSet === 'function'
        ? this.recipeManager.getToolsForSet(executionRecipe, ingredientSet)
        : [];
    const toolValidation = await this._validateTools(
      componentSourceActors,
      executionRecipe,
      toolsForSet,
      presentTools
    );
    if (!toolValidation.valid) {
      return abort(toolValidation.message);
    }

    const currencyAffordCheck = await checkCurrencySpends(
      craftingActor,
      executionRecipe,
      currencySpends,
      this._currencySeams()
    );
    if (!currencyAffordCheck.valid) {
      return abort(currencyAffordCheck.message);
    }

    const itemPilesAffordCheck = await this._checkItemPilesCurrencyCost(craftingActor, recipe);
    if (!itemPilesAffordCheck.valid) {
      return abort(itemPilesAffordCheck.message);
    }

    // Consume NOW (at START): items first, then currency (both gates passed).
    const consumedItems = await this._consumeIngredients(craftSelection.plan);
    await this._spendCraftCurrency(craftingActor, executionRecipe, currencySpends);
    await this._deductItemPilesCurrencyCost(craftingActor, recipe);

    // Snapshot for the FINISH resume: essence quantities are precomputed here
    // because the source items are deleted before the check runs; the consumed
    // summary carries only what chat / history / property-macro ingredientPool need.
    const { resolvedEssences } = this._buildEssenceContext(
      consumedItems,
      executionRecipe,
      null,
      resolveComponent
    );
    const consumedSummary = consumedItems.map(({ item, quantity, ingredient }) => ({
      itemUuid: item.uuid ?? null,
      actorUuid: item.parent?.uuid ?? null,
      quantity,
      name: item.name ?? null,
      img: item.img ?? null,
      componentId:
        ingredient?.match?.componentId ??
        ingredient?.componentId ??
        ingredient?.systemItemId ??
        null,
    }));

    await runManager.markStepPrepared(craftingActor, run, stepIndex, {
      selectedIngredientSetId: ingredientSet.id,
      currencySpends,
      resolvedEssences,
      consumedSummary,
    });

    // Arm the gate now that the components are secured.
    const armedRun = await runManager.markStepWaitingForTime(
      craftingActor,
      run,
      stepIndex,
      step.timeRequirement
    );
    const gate = armedRun.steps?.[stepIndex]?.timeGate;
    const remaining = Math.max(
      0,
      Math.ceil(Number(gate?.availableAt || 0) - Number(game.time?.worldTime || 0))
    );
    const stepLabel = step.name || `Step ${stepIndex + 1}`;
    return {
      resolved: true,
      result: {
        success: false,
        results: null,
        message: `Step "${stepLabel}" is still in progress (${remaining}s remaining)`,
      },
    };
  }

  /**
   * FINISH phase of a time-gated step: the gate has matured. Runs the crafting
   * check and creates results using the START-phase snapshot — components and
   * currency were already consumed at START, so this NEVER re-consumes, re-spends,
   * or refunds. Essence transfer uses the precomputed `resolvedEssences` snapshot
   * because the source items are already deleted. Property macros receive the
   * lightweight snapshot summaries rather than live Foundry item docs.
   *
   * On a rolled failure (Fix 3) the components are already gone with no refund;
   * this only breaks tools per the failure policy, records the failed run, and
   * posts the failure chat. A misconfigured or cancelled check leaves the run
   * active and resumable (no refund).
   *
   * @private
   * @returns {Promise<{ resolved: boolean, result: object }>}
   */
  async _finishTimedStep({
    craftingActor,
    componentSourceActors,
    recipe,
    step,
    stepIndex,
    options,
    presentTools,
    runManager,
    run,
  }) {
    const executionRecipe = this._buildStepRecipeView(recipe, step);
    const prepared = run.steps?.[stepIndex]?.preparedConsumption || {};
    const ingredientSet =
      executionRecipe.ingredientSets.find((s) => s.id === prepared.selectedIngredientSetId) || null;
    const resolvedEssences =
      prepared.resolvedEssences && typeof prepared.resolvedEssences === 'object'
        ? prepared.resolvedEssences
        : {};
    const summary = Array.isArray(prepared.consumedSummary) ? prepared.consumedSummary : [];

    // Reconstruct lightweight consumed-item snapshots. The real Foundry items were
    // deleted at START, so these carry only what chat / history / property-macro
    // ingredientPool and essence transfer need.
    const consumedItems = summary.map((entry) => ({
      item: {
        uuid: entry.itemUuid ?? null,
        name: entry.name ?? null,
        img: entry.img ?? null,
        system: { quantity: entry.quantity },
        parent: entry.actorUuid ? { uuid: entry.actorUuid } : null,
      },
      quantity: entry.quantity,
      ingredient: entry.componentId
        ? { componentId: entry.componentId, systemItemId: entry.componentId }
        : null,
    }));
    // Route the reconstructed snapshots through the same mapper the immediate craft
    // paths use so the persisted run refs carry the consume-time name/img (captured
    // into the summary at START, ~:1014). Preserve the summary's componentId too — the
    // Journal projection falls back to it for the name/img when a live lookup fails
    // (RunJournalBuilder._mapResult). Dropping these left timed-step history rows blank.
    const consumedRunRefs = consumedItems.map((consumed) => ({
      ...mapConsumedIngredientRef(consumed),
      componentId: consumed.ingredient?.componentId ?? null,
    }));

    // Tools are reusable and were NOT consumed at START, so re-resolve them here
    // for breakage (tied to the check outcome). A tool that went missing since
    // START simply yields no breakable pairs — the components are already spent.
    const toolsForSet =
      typeof this.recipeManager.getToolsForSet === 'function'
        ? this.recipeManager.getToolsForSet(executionRecipe, ingredientSet)
        : [];
    const toolValidation = await this._validateTools(
      componentSourceActors,
      executionRecipe,
      toolsForSet,
      presentTools
    );
    const toolItems = toolValidation.valid ? toolValidation.tools || [] : [];

    const resolutionService =
      this.resolutionModeService || game.fabricate?.getResolutionModeService?.();

    const checkResult = await this._runCraftingCheck(
      executionRecipe,
      craftingActor,
      componentSourceActors,
      ingredientSet,
      step,
      { interactive: options?.interactive === true }
    );

    if (checkResult.misconfigured) {
      // GM-side gap: components stay consumed (no refund), but the run remains
      // active/resumable so a fixed check completes it later.
      return {
        resolved: true,
        result: { success: false, results: null, message: checkResult.message },
      };
    }
    if (checkResult.cancelled) {
      // Player dismissed the roll: retryable. Components stay consumed (no refund);
      // the run remains active so a later Finish can resolve it.
      return {
        resolved: true,
        result: { success: false, cancelled: true, results: null, message: 'Crafting cancelled' },
      };
    }

    // Shared timed-step failure recorder: components are already gone (consumed at
    // START), so NEVER re-consume or refund — only break tools per the failure
    // policy, archive the failed run, and post the failure chat.
    const recordFailure = async (message) => {
      const failurePolicy = this._getFailureConsumptionPolicy(executionRecipe);
      let usedToolPairs = [];
      let usedTools = [];
      try {
        if (failurePolicy.breakToolsOnFail && toolItems.length > 0) {
          usedToolPairs = toolItems;
          const breakDecision = this._resolveCraftingBreakageDecision(
            this._getRecipeSystem(executionRecipe),
            executionRecipe,
            checkResult
          );
          usedTools = await this._applyToolBreakage(executionRecipe, toolItems, {
            forceBreak: breakDecision.forceBreak,
            authority: breakDecision.authority,
            reason: breakDecision.reason,
            triggerId: breakDecision.triggerId,
          });
        }
      } catch (breakageError) {
        console.error('Fabricate | Error during timed-step failure tool breakage:', breakageError);
      }
      await runManager.completeStepFailure(craftingActor, run, stepIndex, message, {
        selectedIngredientSetId: ingredientSet?.id,
        lastCheckResult: {
          success: false,
          reason: message,
          outcome: checkResult.outcome ?? undefined,
          value: checkResult.value ?? undefined,
          data: checkResult.data || {},
        },
        consumedIngredients: consumedRunRefs,
        usedTools,
      });
      await this._postCraftChatMessage({
        success: false,
        craftingActor,
        recipe,
        consumedIngredients: consumedItems,
        tools: usedToolPairs,
        createdResults: [],
        failureReason: message,
        rollValue: rollTotalForCard(checkResult),
      });
      return { resolved: true, result: { success: false, results: null, message } };
    };

    if (!checkResult.success) {
      // Matched Simple alchemy attempt (timed twin): produce the reserved failure
      // group + learn WITHOUT re-consuming (components were spent at START). Tiered
      // alchemy failure still fizzles via `recordFailure` (routedByCheck).
      if (
        options?.isAlchemyAttempt === true &&
        this._getAlchemyCheckMode(executionRecipe) === 'simple'
      ) {
        return this._finishAlchemySimpleFailure({
          craftingActor,
          componentSourceActors,
          recipe,
          executionRecipe,
          step,
          stepIndex,
          ingredientSet,
          consumedItems,
          consumedRunRefs,
          toolItems,
          resolvedEssences,
          checkResult,
          runManager,
          run,
        });
      }
      return recordFailure(checkResult.message || 'Crafting check failed');
    }
    if (
      resolutionService &&
      !resolutionService.validateCheckResult({ recipe: executionRecipe, checkResult })
    ) {
      return recordFailure(
        'Crafting check result does not satisfy current resolution mode requirements'
      );
    }

    // SUCCESS tool breakage (tied to the check outcome, applied here at FINISH).
    const successBreakDecision = this._resolveCraftingBreakageDecision(
      this._getRecipeSystem(executionRecipe),
      executionRecipe,
      checkResult
    );
    const usedTools = await this._applyToolBreakage(executionRecipe, toolItems, {
      forceBreak: successBreakDecision.forceBreak,
      authority: successBreakDecision.authority,
      reason: successBreakDecision.reason,
      triggerId: successBreakDecision.triggerId,
    });

    // Create results from the snapshot: essence transfer uses the precomputed
    // resolvedEssences (source items are deleted); chat/history/property-macro use
    // the snapshot consumedItems.
    const { items: resultItems, resolutionMeta } = await this._createResultItems(
      craftingActor,
      executionRecipe,
      step,
      ingredientSet,
      consumedItems,
      toolItems,
      checkResult,
      options?.resultGroupId || null,
      resolvedEssences
    );

    // Timed misconfiguration (issue 85). Unlike the immediate path, a timed step
    // consumed its inputs at START, so a routing misconfiguration only surfaces here at
    // FINISH (the check outcome is unknowable until the gate matures): it can only record
    // a failure with NO refund, never a true zero-mutation abort. Route through the shared
    // `_isMisconfigurationDisposition` predicate so this matches the immediate path and
    // covers `unrouted-tier` too — a tier-routed recipe whose matured outcome resolves to
    // an authored success tier no group lists would otherwise fall through to
    // `completeStepSuccess` with empty results (a false success with lost inputs).
    if (this._isMisconfigurationDisposition(resolutionMeta?.disposition)) {
      const message = resolutionMeta.error || 'Crafting resolution failed';
      await runManager.completeStepFailure(craftingActor, run, stepIndex, message, {
        selectedIngredientSetId: ingredientSet?.id,
        lastCheckResult: {
          success: false,
          reason: message,
          outcome: checkResult.outcome ?? undefined,
          value: checkResult.value ?? undefined,
          data: checkResult.data || {},
        },
        consumedIngredients: consumedRunRefs,
        usedTools,
      });
      await this._postCraftChatMessage({
        success: false,
        craftingActor,
        recipe,
        consumedIngredients: consumedItems,
        tools: toolItems,
        createdResults: [],
        failureReason: message,
        rollValue: rollTotalForCard(checkResult),
      });
      return {
        resolved: true,
        result: {
          success: false,
          results: null,
          message,
          disposition: resolutionMeta.disposition,
        },
      };
    }

    const completedRun = await runManager.completeStepSuccess(craftingActor, run, stepIndex, {
      selectedIngredientSetId: ingredientSet?.id,
      lastCheckResult: {
        success: true,
        reason: checkResult.message || 'Success',
        outcome: checkResult.outcome ?? undefined,
        value: checkResult.value ?? undefined,
        data: checkResult.data || {},
      },
      consumedIngredients: consumedRunRefs,
      usedTools,
      createdResults: (resultItems || []).map((item) => ({
        actorUuid: craftingActor.uuid,
        itemUuid: item.uuid,
        quantity: Number(item.system?.quantity || 1),
        name: item.name ?? null,
        img: item.img ?? null,
      })),
    });

    const visibilityService = game.fabricate?.getRecipeVisibilityService?.();
    if (visibilityService) {
      await visibilityService.applyRecipeItemUseOnCraft({
        recipe,
        craftingActor,
        componentSourceActors,
      });
      // Learn on match for a matured timed alchemy brew too (gated inside
      // `learnRecipeOnCraft` on `alchemy.learnOnCraft === true`).
      if (options?.isAlchemyAttempt === true) {
        await visibilityService.learnRecipeOnCraft(recipe, craftingActor);
      }
    }

    await this._postCraftChatMessage({
      success: true,
      craftingActor,
      recipe,
      consumedIngredients: consumedItems,
      tools: toolItems,
      createdResults: resultItems,
      rollValue: rollTotalForCard(checkResult),
    });

    const stepLabel = step.name || `step ${stepIndex + 1}`;
    return {
      resolved: true,
      result: {
        success: true,
        results: resultItems,
        message:
          completedRun?.status === 'succeeded'
            ? `Successfully crafted ${recipe.name}`
            : `Completed ${stepLabel} for ${recipe.name}`,
      },
    };
  }

  /**
   * Shared tail for a matched Simple alchemy FAILURE (both the immediate `craft()`
   * path and the timed `_finishTimedStep` twin): apply tool breakage (unless the
   * caller already applied it and passed `usedTools`), produce the reserved
   * `role: 'failure'` result group via the REAL `_createResultItems` (nothing when
   * empty/absent), record the run as a failure, learn on match (gated inside
   * `learnRecipeOnCraft`), post the distinct failure-result banner, and return the
   * `produced-on-failure` result. Consumption differs per caller (immediate consumes
   * per `alchemy.consumeOnFail`; timed already consumed at START), so it is done by
   * the caller and passed in as `consumedItems`/`consumedRunRefs`.
   * @private
   */
  async _produceAlchemyFailureResults({
    craftingActor,
    componentSourceActors,
    recipe,
    executionRecipe,
    step,
    stepIndex,
    ingredientSet,
    consumedItems,
    consumedRunRefs,
    toolItems,
    usedTools = null,
    resolvedEssences,
    resultGroupId = null,
    checkResult,
    runManager,
    run,
  }) {
    let appliedTools = usedTools;
    if (appliedTools === null) {
      try {
        const breakDecision = this._resolveCraftingBreakageDecision(
          this._getRecipeSystem(executionRecipe),
          executionRecipe,
          checkResult
        );
        appliedTools = await this._applyToolBreakage(executionRecipe, toolItems, {
          forceBreak: breakDecision.forceBreak,
          authority: breakDecision.authority,
          reason: breakDecision.reason,
          triggerId: breakDecision.triggerId,
        });
      } catch (breakageError) {
        console.error(
          'Fabricate | Error during alchemy failure-result tool breakage:',
          breakageError
        );
        appliedTools = [];
      }
    }

    // Route to + produce the reserved failure group (the failed checkResult routes
    // `_resolveAlchemyResultGroups` there); empty/absent yields no items.
    const { items: resultItems } = await this._createResultItems(
      craftingActor,
      executionRecipe,
      step,
      ingredientSet,
      consumedItems,
      toolItems,
      checkResult,
      resultGroupId,
      resolvedEssences
    );

    if (runManager && run) {
      await runManager.completeStepFailure(
        craftingActor,
        run,
        stepIndex,
        checkResult.message || 'Crafting check failed',
        {
          selectedIngredientSetId: ingredientSet?.id,
          lastCheckResult: {
            success: false,
            reason: checkResult.message || 'Crafting check failed',
            outcome: checkResult.outcome ?? undefined,
            value: checkResult.value ?? undefined,
            data: checkResult.data || {},
          },
          consumedIngredients: consumedRunRefs,
          usedTools: appliedTools,
        }
      );
    }

    // Learn on MATCH regardless of pass/fail; `learnRecipeOnCraft` internally gates
    // on `alchemy.learnOnCraft === true`. Mirror the success path's recipe-item use.
    const visibilityService = game.fabricate?.getRecipeVisibilityService?.();
    if (visibilityService) {
      await visibilityService.applyRecipeItemUseOnCraft({
        recipe,
        craftingActor,
        componentSourceActors,
      });
      await visibilityService.learnRecipeOnCraft(recipe, craftingActor);
    }

    await this._postCraftChatMessage({
      success: false,
      craftingActor,
      recipe,
      consumedIngredients: consumedItems,
      tools: appliedTools,
      createdResults: resultItems,
      failureReason: checkResult.message || 'Crafting check failed',
      rollValue: rollTotalForCard(checkResult),
    });

    return {
      resolved: true,
      result: {
        success: false,
        results: resultItems.length > 0 ? resultItems : null,
        message: checkResult.message || 'FABRICATE.Alchemy.FailureResult',
        disposition: 'produced-on-failure',
      },
    };
  }

  /**
   * Timed twin of {@link _resolveAlchemySimpleFailure}: produce the reserved failure
   * result group + learn for a matured timed Simple alchemy brew whose check FAILED.
   * Components were already consumed at START, so this NEVER re-consumes — it defers
   * to {@link _produceAlchemyFailureResults} for breakage/production/learn using the
   * START snapshot (`resolvedEssences`). Returns `{ resolved, result }`.
   * @private
   */
  async _finishAlchemySimpleFailure({
    craftingActor,
    componentSourceActors,
    recipe,
    executionRecipe,
    step,
    stepIndex,
    ingredientSet,
    consumedItems,
    consumedRunRefs,
    toolItems,
    resolvedEssences,
    checkResult,
    runManager,
    run,
  }) {
    return this._produceAlchemyFailureResults({
      craftingActor,
      componentSourceActors,
      recipe,
      executionRecipe,
      step,
      stepIndex,
      ingredientSet,
      consumedItems,
      consumedRunRefs,
      toolItems,
      usedTools: null,
      resolvedEssences,
      resultGroupId: null,
      checkResult,
      runManager,
      run,
    });
  }

  /**
   * Produce the reserved failure result group for a matched Simple alchemy attempt
   * whose crafting check FAILED (the immediate, non-timed `craft()` path). Consumes
   * per `alchemy.consumeOnFail` (NOT the generic `_getFailureConsumptionPolicy`),
   * mirrors the essence/extra-submitted-item consumption, then defers to
   * {@link _produceAlchemyFailureResults} for production/learn/banner.
   * Returns `{ resolved, result }` for the caller.
   * @private
   */
  async _resolveAlchemySimpleFailure({
    craftingActor,
    componentSourceActors,
    recipe,
    executionRecipe,
    step,
    stepIndex,
    ingredientSet,
    craftSelection,
    currencySpends,
    toolValidation,
    checkResult,
    options,
    runManager,
    run,
  }) {
    const system = this._getRecipeSystem(executionRecipe);
    const consumeOnFail = system?.alchemy?.consumeOnFail !== false;

    let consumedItems = [];
    let usedTools = [];
    try {
      if (consumeOnFail) {
        consumedItems = await this._consumeIngredients(craftSelection.plan);
        await this._consumeAlchemyExtraItems(consumedItems, componentSourceActors, options);
        await this._spendCraftCurrency(craftingActor, executionRecipe, currencySpends);
      }
      const breakDecision = this._resolveCraftingBreakageDecision(
        system,
        executionRecipe,
        checkResult
      );
      usedTools = await this._applyToolBreakage(executionRecipe, toolValidation.tools, {
        forceBreak: breakDecision.forceBreak,
        authority: breakDecision.authority,
        reason: breakDecision.reason,
        triggerId: breakDecision.triggerId,
      });
    } catch (consumptionError) {
      console.error(
        'Fabricate | Error during alchemy failure-result consumption:',
        consumptionError
      );
    }

    const consumedRunRefs = consumedItems.map(mapConsumedIngredientRef);

    // Build a tier-4-aware essence snapshot over the consumed items (issue 578) so the
    // reserved Simple-failure result group's essence-sourced effect transfer /
    // property-macro context credits a purely-tier-4 submission its component's
    // essences — mirroring how the timed twin forwards the START snapshot. Absent the
    // injected resolver (never — this path is always an alchemy attempt) this degrades
    // to the shared standard-craft resolver.
    const { resolvedEssences } = this._buildEssenceContext(
      consumedItems,
      executionRecipe,
      null,
      this._alchemyComponentResolver(options)
    );

    return this._produceAlchemyFailureResults({
      craftingActor,
      componentSourceActors,
      recipe,
      executionRecipe,
      step,
      stepIndex,
      ingredientSet,
      consumedItems,
      consumedRunRefs,
      toolItems: toolValidation.tools,
      usedTools,
      resolvedEssences,
      resultGroupId: options?.resultGroupId || null,
      checkResult,
      runManager,
      run,
    });
  }

  /**
   * Attempt to craft using the alchemy discovery mode.
   *
   * Submitted items are matched against the component signatures of all enabled recipes in the
   * crafting system. The recipe names and ingredient lists are hidden from players; they discover
   * recipes by experimentation. This method requires the crafting system to have
   * `resolutionMode: 'alchemy'`.
   *
   * @param {Actor} craftingActor - The actor that will receive crafted results.
   * @param {Actor[]} componentSourceActors - The actors whose inventories are checked for submitted items.
   * @param {Array<{item: object, componentId: string}>} submittedItems - Pre-bucketed
   *   submission records from {@link resolveAlchemySubmissions} (issue 572): each pairs the
   *   REAL owned item (`{ uuid, name, ... }`, for essence accumulation and consumption)
   *   with the `componentId` it was bucketed to ONCE by the shared alchemy resolver. The
   *   engine CONSUMES `componentId` for signature matching and the dead-end multiset rather
   *   than re-deriving component identity, so the palette, collector, and engine agree.
   * @param {object} options - Additional options.
   * @param {string} [options.craftingSystemId] - ID of the crafting system to match against.
   * @param {object} [options.signatureValidator] - Optional override for the {@link SignatureValidator}
   *   instance. Defaults to a fresh instance using the system's component list.
   * @returns {Promise<{success: boolean, results: Item[]|null, message: string, disposition: string}>}
   *   Returns `disposition: 'no-match'` when no recipe signature matches the submitted items.
   *   Returns `disposition: 'error'` for configuration or validation failures.
   *   On success, delegates to {@link CraftingEngine#craft} and returns its result.
   */
  async craftAlchemy(craftingActor, componentSourceActors, submittedItems, options = {}) {
    if (!craftingActor) {
      return {
        success: false,
        results: null,
        message: 'No crafting actor selected',
        disposition: 'error',
      };
    }
    if (!componentSourceActors?.length) {
      return {
        success: false,
        results: null,
        message: 'No component source actors selected',
        disposition: 'error',
      };
    }
    if (!submittedItems?.length) {
      return {
        success: false,
        results: null,
        message: 'No ingredients submitted',
        disposition: 'error',
      };
    }

    const systemManager = game.fabricate?.getCraftingSystemManager?.();
    const systemId = options.craftingSystemId;
    const system = systemManager?.getSystem(systemId);
    if (!system || system.resolutionMode !== 'alchemy') {
      return {
        success: false,
        results: null,
        message: 'No alchemy-mode crafting system found',
        disposition: 'error',
      };
    }

    const recipeManager = this.recipeManager || game.fabricate?.getRecipeManager?.();
    const systemRecipes = recipeManager
      ? recipeManager.getRecipes({ craftingSystemId: systemId, enabled: true })
      : [];
    const signatureValidator =
      options.signatureValidator ||
      new SignatureValidator({
        getSystem: (id) => systemManager.getSystem(id),
        getRecipesForSystem: (id) =>
          recipeManager ? recipeManager.getRecipes({ craftingSystemId: id, enabled: true }) : [],
        getComponentsForSystem: (id) => {
          const sys = systemManager.getSystem(id);
          return sys?.components || [];
        },
      });

    const components = system.components || [];
    const recipes = systemRecipes;
    // The bare owned items, for the uuid/essence-keyed paths (consumption and essence
    // accumulation) that must key on the item, not its bucketed component id.
    const submissionItems = submittedItems.map((record) => record.item);
    const matchResult = this._matchAlchemySignature(
      submittedItems,
      recipes,
      components,
      signatureValidator,
      { system }
    );

    const alchemyCfg = system.alchemy || {};
    const shouldConsume = alchemyCfg.consumeOnFail !== false;

    if (!matchResult.matched) {
      // Fizzle: this concrete submitted multiset matches NO enabled recipe. Record
      // a per-character x system dead-end key (gated by showAttemptHistoryToPlayers)
      // so the workbench can flip this exact set from `untried` -> `no-reaction` on a
      // re-brew. The fizzle branch runs NO check and returns `disposition:'no-match'`
      // with no roll, so the UI must not show a roll animation on this path.
      await this._recordAlchemyDeadEnd(craftingActor, systemId, submittedItems, alchemyCfg);
      if (shouldConsume) {
        await this._consumeSubmittedAlchemyItems(componentSourceActors, submissionItems);
      }
      // Record the fizzle as failed run history. A fizzle matches no enabled
      // recipe, so the entry is recipe-less and carries no recipe/signature data
      // (it cannot leak an undiscovered recipe). Recording is UNCONDITIONAL: the
      // `showAttemptHistoryToPlayers` flag gates only player VISIBILITY of the
      // entry at the Journal, never whether the attempt is recorded — so do NOT
      // copy `_recordAlchemyDeadEnd`'s recording gate here.
      const runManager = this.craftingRunManager || game.fabricate?.getCraftingRunManager?.();
      if (typeof runManager?.recordFizzle === 'function') {
        await runManager.recordFizzle(craftingActor, {
          craftingSystemId: systemId,
          userId: game.user?.id ?? null,
        });
      }
      return {
        success: false,
        results: null,
        message: 'FABRICATE.Alchemy.NoMatch',
        disposition: 'no-match',
        consumed: shouldConsume,
      };
    }

    const recipe = matchResult.recipe;
    const ingredientSetId = matchResult.ingredientSetId;
    return this.craft(craftingActor, componentSourceActors, recipe, ingredientSetId, {
      ...options,
      isAlchemyAttempt: true,
      alchemySubmittedItems: submissionItems,
    });
  }

  /**
   * Match submitted items against all recipe signatures in the system.
   *
   * Matching is quantity-aware: an ingredient group is satisfied only when one
   * of its options has its required quantity met. Each submission counts as one
   * unit toward a group, because the workbench expands a stack into one
   * submission per unit. Available units are counted by occurrence (how many
   * submissions match an option's component IDs), NOT by reading each item's
   * `system.quantity`. This per-unit occurrence model matches how essences are
   * accumulated and how {@link _consumeSubmittedAlchemyItems} consumes items. It
   * is deliberately different from {@link IngredientSet#resolveIngredientSelection},
   * which sums `system.quantity` per item.
   *
   * A submission contributes at most one unit per option even if several of the
   * option's components share its source-reference chain. Essence requirements,
   * when the system supports essences, must also be met for a set to match.
   *
   * Component identity is NOT resolved here (issue 572): each submission record
   * arrives ALREADY bucketed to its `componentId` by the shared alchemy resolver
   * {@link resolveAlchemySubmissionComponent} at the collector
   * ({@link resolveAlchemySubmissions}) — the SAME resolver the workbench palette
   * uses — so the palette, collector, and matcher can never disagree. This method
   * CONSUMES `record.componentId` and never re-derives identity from raw source
   * references. Because each record carries exactly one component id, the
   * one-unit-per-group semantics hold by construction (a submission is counted at
   * most once per group even when several of a group's components share its
   * reference chain).
   *
   * Returns { matched: true, recipe, ingredientSetId } or { matched: false }.
   * @param {Array<{item: object, componentId: string}>} submittedItems - Pre-bucketed records.
   * @private
   */
  _matchAlchemySignature(submittedItems, recipes, components, signatureValidator, options = {}) {
    const system = options?.system;

    // Consume the component id each submission was bucketed to ONCE at the collector
    // (issue 572), never re-deriving identity here. `null` for a submission that
    // resolved to no component. Do NOT re-resolve per candidate component: that would
    // double-count a submission matching several components of one group.
    const resolvedComponentIds = submittedItems.map((record) => record?.componentId ?? null);

    // Count submissions whose resolved component id is one of the given component
    // IDs. Each submission resolved to exactly one component, so it contributes at
    // most one unit toward a group even when several of the group's components
    // share its reference chain.
    const availableForComponentIds = (componentIds) => {
      const idSet = componentIds instanceof Set ? componentIds : new Set(componentIds);
      let available = 0;
      for (const resolvedId of resolvedComponentIds) {
        if (resolvedId != null && idSet.has(resolvedId)) available += 1;
      }
      return available;
    };

    // Check whether the system supports essences
    const essencesEnabled = system?.features?.essences === true;

    // Accumulate essences from the PRE-BUCKETED submission records (duplicates count
    // multiple times). True bucket-once (issue 578): read the `componentId` each
    // submission was bucketed to at the collector rather than re-resolving via the
    // tier-4-blind `findMatchingComponent`, so essence attribution reads the exact
    // same id group counting reads and a purely-tier-4 submission is credited its
    // component's essences.
    let submittedEssences = null;
    if (essencesEnabled) {
      submittedEssences = accumulateSubmissionEssences(submittedItems, {
        components,
        systemId: system?.id,
      });
    }

    // A group is essence-only iff every one of its options is an essence match. When
    // essences are disabled, such a group is inert (issue 649 group-granular rule).
    const isEssenceOnlyGroup = (group) => {
      const opts = Array.isArray(group?.options) ? group.options : [];
      return opts.length > 0 && opts.every((option) => option?.match?.type === 'essence');
    };

    // Whether a single group is satisfied by the submitted multiset. Options are
    // alternatives, so any one satisfying option satisfies the group. An essence
    // option is amount-based (`submittedEssences[essenceId] >= amount`), NOT
    // occurrence-based; when `skipEssence` is set (essences disabled) essence options
    // are ignored so the group falls to its non-essence arm.
    const groupSatisfied = (group, groupComponentIds, skipEssence) => {
      const groupOptions = Array.isArray(group?.options) ? group.options : [];
      if (groupOptions.length === 0) {
        // No structured options (defensive): fall back to mere presence in the
        // merged component-ID set for this group.
        return availableForComponentIds(groupComponentIds) > 0;
      }
      return groupOptions.some((option) => {
        if (option?.match?.type === 'essence') {
          if (skipEssence) return false;
          const essenceId = String(option.match.essenceId || '').trim();
          const amount = Math.max(0, Number(option.match.amount) || 0);
          // A no-op essence option (id-less / zero amount) is trivially satisfied.
          if (!essenceId || amount <= 0) return true;
          return (submittedEssences?.[essenceId] || 0) >= amount;
        }
        const optionComponentIds = signatureValidator.expandIngredientToComponentIds(
          option,
          components
        );
        const required = Math.max(1, Number(option?.quantity) || 1);
        return availableForComponentIds(optionComponentIds) >= required;
      });
    };

    for (const recipe of recipes) {
      if (!recipe.enabled) continue;
      const ingredientSets = Array.isArray(recipe.ingredientSets) ? recipe.ingredientSets : [];
      for (const set of ingredientSets) {
        // The signature is computed 1:1 from `set.ingredientGroups`, so they align by
        // index. Counting differs from IngredientSet.resolveIngredientSelection (that
        // method sums each item's system.quantity, whereas this counts submission
        // occurrences per unit); only the option-as-alternative semantics is shared.
        const signature = signatureValidator.computeSignature(set, components);
        const groups = Array.isArray(set.ingredientGroups) ? set.ingredientGroups : [];
        // Legacy back-compat READ of the retired per-set essences map (one release):
        // migrated data carries essences as groups instead, so `setEssences` is {}.
        const setEssences = set.essences || {};
        const hasEssences = essencesEnabled && Object.keys(setEssences).length > 0;

        if (!essencesEnabled) {
          // Group-granular essences-disabled rule (issue 649): evaluate only the
          // non-essence-only groups and skip essence options inside them. A set whose
          // every group is essence-only is unmatchable (reproduces the old
          // `signature.length === 0 && !hasEssences → continue` for a migrated
          // essence-only set, and skips a legacy essence-only set with no groups).
          const nonEssenceGroupIndexes = [];
          for (const [index, group] of groups.entries()) {
            if (!isEssenceOnlyGroup(group)) nonEssenceGroupIndexes.push(index);
          }
          if (nonEssenceGroupIndexes.length === 0) continue;
          const allGroupsSatisfied = nonEssenceGroupIndexes.every((index) =>
            groupSatisfied(groups[index], signature[index], true)
          );
          if (allGroupsSatisfied) {
            return { matched: true, recipe, ingredientSetId: set.id };
          }
          continue;
        }

        // Essences enabled: evaluate every group (essence options amount-based).
        // Skip sets that carry neither ingredient groups nor a legacy essence map.
        if (signature.length === 0 && !hasEssences) continue;

        const allGroupsSatisfied = signature.every((groupComponentIds, groupIndex) =>
          groupSatisfied(groups[groupIndex], groupComponentIds, false)
        );

        // Legacy per-set essences map (back-compat read): AND-required as before.
        let essencesSatisfied = true;
        if (hasEssences && submittedEssences) {
          for (const [essenceType, requiredQty] of Object.entries(setEssences)) {
            if ((submittedEssences[essenceType] || 0) < requiredQty) {
              essencesSatisfied = false;
              break;
            }
          }
        }

        if (allGroupsSatisfied && essencesSatisfied) {
          return { matched: true, recipe, ingredientSetId: set.id };
        }
      }
    }
    return { matched: false };
  }

  /**
   * For a matched alchemy attempt, consume any submitted items that standard
   * ingredient matching did not already consume (extras / essence-option
   * contributors — items supplied to satisfy an essence group option, or surplus
   * beyond the matched component/tag groups). Mutates `consumedItems` in place with
   * `{ item, quantity, ingredient: null }` entries. Shared by the success path AND
   * the Simple failure path so a matched fail consumes the same submitted multiset
   * as a pass. No-op unless this is an alchemy attempt carrying `alchemySubmittedItems`.
   * @private
   */
  async _consumeAlchemyExtraItems(consumedItems, componentSourceActors, options) {
    if (!options?.isAlchemyAttempt || !Array.isArray(options?.alchemySubmittedItems)) return;
    const alreadyConsumedUuids = new Set(consumedItems.map((c) => c.item.uuid));
    const essenceConsumeCounts = new Map();
    for (const item of options.alchemySubmittedItems) {
      if (item.uuid && !alreadyConsumedUuids.has(item.uuid)) {
        essenceConsumeCounts.set(item.uuid, (essenceConsumeCounts.get(item.uuid) || 0) + 1);
      }
    }
    for (const actor of componentSourceActors) {
      for (const item of actor.items || []) {
        const count = essenceConsumeCounts.get(item.uuid);
        if (!count) continue;
        const qty = Number(item.system?.quantity ?? 1);
        await (count >= qty ? item.delete() : item.update({ 'system.quantity': qty - count }));
        consumedItems.push({ item, quantity: count, ingredient: null });
      }
    }
  }

  /**
   * Consume submitted alchemy items (no-match failure path).
   * Best-effort: removes items by UUID from component source actors.
   * @private
   */
  async _consumeSubmittedAlchemyItems(componentSourceActors, submittedItems) {
    // Count how many times each UUID appears in submitted items
    const consumeCounts = new Map();
    for (const item of submittedItems) {
      if (item.uuid) {
        consumeCounts.set(item.uuid, (consumeCounts.get(item.uuid) || 0) + 1);
      }
    }
    for (const actor of componentSourceActors) {
      for (const item of actor.items || []) {
        const count = consumeCounts.get(item.uuid);
        if (!count) continue;
        try {
          const qty = Number(item.system?.quantity ?? 1);
          await (count >= qty ? item.delete() : item.update({ 'system.quantity': qty - count }));
        } catch (error) {
          console.error('Fabricate | Alchemy: failed to consume item', item.uuid, error);
        }
      }
    }
  }

  /**
   * Map submission records to a plain-component multiset `{ componentId: units }`
   * from the SAME `componentId` each was bucketed to at the collector (issue 572),
   * so the dead-end key can never drift from the signature {@link _matchAlchemySignature}
   * matched against. Each record contributes at most one unit; a record with no
   * component id is skipped.
   *
   * @param {Array<{item: object, componentId: string}>} submittedItems - Pre-bucketed records.
   * @private
   */
  _submittedComponentMultiset(submittedItems) {
    const multiset = {};
    for (const record of Array.isArray(submittedItems) ? submittedItems : []) {
      const componentId = record?.componentId;
      if (!componentId) continue;
      multiset[componentId] = (multiset[componentId] || 0) + 1;
    }
    return multiset;
  }

  /**
   * Record a fizzled alchemy attempt's canonical signature key on the crafting
   * actor, under a per-system append-only, deduped array
   * (`alchemyDeadEnds[craftingSystemId] = [signatureKey]`). Written ONLY when the
   * system's `showAttemptHistoryToPlayers` is true, via `getFabricateFlag` /
   * `setFabricateFlag` (the effective stored path is doubly-nested under
   * `flags.fabricate.fabricate.alchemyDeadEnds`). No-ops on an empty key, a
   * duplicate key, or an actor without flag support.
   * @private
   */
  async _recordAlchemyDeadEnd(craftingActor, systemId, submittedItems, alchemyCfg) {
    if (alchemyCfg?.showAttemptHistoryToPlayers !== true) return;
    if (!systemId || typeof craftingActor?.setFlag !== 'function') return;
    const key = canonicalSignatureKey(this._submittedComponentMultiset(submittedItems));
    if (!key) return;
    const deadEnds = getFabricateFlag(craftingActor, 'alchemyDeadEnds', {});
    const current = deadEnds && typeof deadEnds === 'object' ? deadEnds : {};
    const forSystem = Array.isArray(current[systemId]) ? current[systemId] : [];
    if (forSystem.includes(key)) return;
    await setFabricateFlag(craftingActor, 'alchemyDeadEnds', {
      ...current,
      [systemId]: [...forSystem, key],
    });
  }

  /**
   * Deduct the chosen currency spends for a craft. The afford gate in {@link craft}
   * already confirmed affordability, so this runs after item consumption. A spend
   * failure here is logged (mirroring the Item-Piles deduct-error handling) and never
   * refunded — it does not abort the craft, matching the no-refund policy.
   * @private
   */
  async _spendCraftCurrency(craftingActor, recipe, currencySpends) {
    if (!currencySpends?.length) return;
    try {
      const result = await spendCurrencySpends(
        craftingActor,
        recipe,
        currencySpends,
        this._currencySeams()
      );
      if (!result?.valid) {
        console.error('Fabricate | Currency deduction reported failure', result?.message);
      }
    } catch (error) {
      console.error('Fabricate | Currency deduction error', error);
    }
  }

  /**
   * Resolve the single craft selection for a step: the widened ingredient-set
   * selection with the currency afford probe bound to the crafting actor. The
   * returned object carries the item `plan` (consumed by {@link _consumeIngredients})
   * and the `currencySpends` (gated/spent by the engine). Computed ONCE in
   * {@link craft} so consumption and the currency spend never diverge.
   *
   * @private
   * @param {Function} [resolveComponent] - Optional component resolver injected on the
   *   alchemy craft path (issue 578) so a tier-4-only submission is selected as its
   *   component's ingredient for consumption; defaults (undefined) to the shared
   *   standard-craft resolver via {@link RecipeManager#ingredientMatchesItem}.
   * @param {object|null} [optionOverrides] - Per-group player option overrides
   *   (issue 552) forwarded to the resolver so consumption matches the chosen option.
   * @returns {{ success: boolean, plan: Array, currencySpends: Array, missingGroups: Array }}
   */
  _resolveCraftSelection(
    componentSourceActors,
    ingredientSet,
    recipe,
    craftingActor,
    resolveComponent,
    optionOverrides = null
  ) {
    const availableItems = componentSourceActors.flatMap((actor) => [...actor.items]);
    const matcher = (ingredient, item) =>
      this.recipeManager.ingredientMatchesItem(recipe, ingredient, item, resolveComponent);
    if (typeof ingredientSet?.resolveIngredientSelection === 'function') {
      const affordCurrency = buildCurrencyAffordProbe(craftingActor, recipe, this._currencySeams());
      // Bind the component-aware essence resolver so an essence GROUP option consumes
      // items carrying that essence at craft time (issue 649).
      const resolveItemEssences =
        typeof this.recipeManager?._buildEssenceOptionResolver === 'function'
          ? this.recipeManager._buildEssenceOptionResolver(recipe, resolveComponent)
          : undefined;
      return ingredientSet.resolveIngredientSelection(availableItems, matcher, {
        affordCurrency,
        optionOverrides,
        resolveItemEssences,
      });
    }
    // Back-compat: an ingredient set exposing only matchIngredients (older duck-typed
    // shapes) yields an item-only plan with no currency spends.
    if (typeof ingredientSet?.matchIngredients === 'function') {
      return {
        success: true,
        plan: ingredientSet.matchIngredients(availableItems, matcher),
        currencySpends: [],
        missingGroups: [],
      };
    }
    return { success: true, plan: [], currencySpends: [], missingGroups: [] };
  }

  /**
   * Consume the item plan from the single craft selection. The plan is computed once
   * in {@link craft} (via {@link _resolveCraftSelection}) and passed in, so this never
   * recomputes the match against possibly-mutated items.
   * @private
   * @param {Array<{item: Item, quantity: number, ingredient: object}>} consumptionPlan
   */
  async _consumeIngredients(consumptionPlan = []) {
    const consumedItems = [];

    // Execute consumption
    for (const { item, quantity, ingredient } of consumptionPlan) {
      const itemQuantity = item.system?.quantity ?? 1;

      // Store consumed item info for effect transfer
      consumedItems.push({
        item,
        quantity,
        ingredient,
      });

      // Update or delete the item
      await (quantity >= itemQuantity
        ? item.delete()
        : item.update({ 'system.quantity': itemQuantity - quantity }));
    }

    return consumedItems;
  }

  /**
   * Validate that all required library Tools resolved for this recipe/step are
   * present (a matching, non-broken item) on the component source actors.
   *
   * Returns the matched `{ tool, item, breakable }` pairs so the caller can apply
   * usage/breakage on the success and failure-consumption paths.
   *
   * Durable-identity selection (issue 557): the item PREFERRED for each tool is one
   * that matches by durable identity (the only kind that may be consumed or
   * destroyed). A presence-only (wide) match is used solely to satisfy the presence
   * gate and is returned with `breakable: false` so {@link _applyToolBreakage}
   * spares it. When the manager exposes no identity matcher (legacy/test managers) a
   * presence match is treated as breakable, preserving prior behaviour.
   *
   * Virtual-present injection (Phase 4): a tool whose `componentId` is in the
   * active canvas Tool's `presentTools` payload AND whose recipe crafting system
   * matches the active tool's `systemId` is satisfied WITHOUT an owned item (the
   * active canvas Tool station provides it). Its `{ tool, item: null, virtual:
   * true }` pair is returned so {@link _applyToolBreakage} skips it — there is no
   * owned item to use or break. An owned, non-broken item still takes precedence.
   * The system scope is enforced via {@link resolvePresentComponentIds}: a
   * present tool from system A never satisfies a system-B recipe.
   *
   * @private
   * @param {Actor[]} actors
   * @param {Recipe} recipe
   * @param {Array<object>} tools - resolved library Tool objects
   * @param {{ systemId?: string|null, componentIds?: string[] }|null} [presentTools] - virtual-present payload
   * @returns {Promise<{ valid: boolean, message?: string, tools?: Array<{tool: object, item: Item|null, virtual?: boolean, breakable?: boolean}> }>}
   */
  async _validateTools(actors, recipe, tools = [], presentTools = null) {
    const toolItems = [];
    const presentSet = resolvePresentComponentIds({
      presentTools,
      systemId: recipe?.craftingSystemId ?? null,
    });

    for (const tool of tools) {
      // Durable-identity selection (issue 557): PREFER an owned item that matches the
      // tool by durable identity (the only kind that may be consumed/destroyed), and
      // fall back to a presence-only (wide) match ONLY to satisfy the presence gate —
      // tagging that pair `breakable: false` so `_applyToolBreakage` spares it. When
      // an actor owns both the real durably-identified tool and a decoy, the durable
      // tool is the one carried into breakage even if the decoy sorts earlier.
      const hasIdentityMatcher =
        typeof this.recipeManager?.toolMatchesItemByIdentity === 'function';
      let identityItem = null;
      let presenceItem = null;
      for (const actor of actors) {
        for (const item of actor?.items ?? []) {
          if (isToolBroken(item)) continue;
          if (!presenceItem && this.recipeManager.toolMatchesItem(recipe, tool, item)) {
            presenceItem = item;
          }
          if (
            hasIdentityMatcher &&
            !identityItem &&
            this.recipeManager.toolMatchesItemByIdentity(recipe, tool, item) === true
          ) {
            identityItem = item;
          }
          if (identityItem) break;
        }
        if (identityItem) break;
      }

      const found = identityItem ?? presenceItem;
      if (found) {
        // When the manager exposes no identity matcher (legacy/test managers) preserve
        // prior behaviour and treat a presence match as breakable; otherwise only a
        // durable-identity match is breakable.
        const breakable = hasIdentityMatcher ? identityItem != null : true;
        toolItems.push({ tool, item: found, breakable });
      } else if (presentSet.has(tool?.componentId)) {
        // Virtual-present: satisfied by the active canvas Tool, no owned item.
        toolItems.push({ tool, item: null, virtual: true });
      } else {
        return {
          valid: false,
          message: `Missing required tool (${toolDisplayReference(tool, recipe, this.recipeManager)})`,
        };
      }
    }

    return { valid: true, tools: toolItems };
  }

  /**
   * Apply usage and breakage to matched tools, delegating to the shared
   * {@link applyToolUsageAndBreakage} runtime (the same plan/apply core the
   * gathering tool breakage uses). Returns `usedTools` evidence in the
   * run-record item-ref shape.
   *
   * When `forceBreak` is true, every matched tool is broken regardless of its own
   * per-tool breakage chance: a `planned: { mode: 'forced', broken: true }` override
   * is passed to {@link applyToolUsageAndBreakage}, which uses it verbatim instead of
   * evaluating the tool's own breakage.
   *
   * Authority (issue 419): under `checkDriven` authority an `immune` tool is filtered
   * OUT of the forced set (it never breaks) and recorded as `skippedImmune` evidence;
   * virtual-present tools are recorded as skipped evidence (not mutated); a forced
   * break attaches the `authority`/`reason`/`triggerId` decision to each entry. Under
   * `toolSpecific` (default) behaviour is unchanged: each tool's own mode decides and
   * a legacy `breakTools` force-break still applies on top.
   *
   * Durable-identity gate (issue 557): an owned item is used OR broken only when it
   * matches the tool by durable identity, re-checked authoritatively here via the
   * identity matcher so a presence-only item can never reach `delete()`. A spared
   * (non-breakable) item is left untouched and recorded as skipped evidence under
   * `checkDriven`, mirroring the virtual-present skip. When the manager exposes no
   * identity matcher (legacy/test managers) the selection `breakable` tag is honored,
   * defaulting to breakable to preserve prior behaviour.
   *
   * @private
   * @param {Recipe} recipe
   * @param {Array<{tool: object, item: Item, virtual?: boolean, breakable?: boolean}>} toolItems
   * @param {{ forceBreak?: boolean, authority?: string, reason?: string|null, triggerId?: string|null, checkId?: string|null }} [options]
   * @returns {Promise<Array<{ actorUuid: string|null, itemUuid: string|null, quantity: number, componentId: string|null, broken: boolean }>>}
   */
  async _applyToolBreakage(
    recipe,
    toolItems = [],
    {
      forceBreak = false,
      authority = 'toolSpecific',
      reason = null,
      triggerId = null,
      checkId = null,
    } = {}
  ) {
    const checkDriven = authority === 'checkDriven';
    const evidence = [];
    for (const { tool: toolData, item, virtual, breakable: selectedBreakable } of toolItems) {
      const tool = toolData instanceof Tool ? toolData : Tool.fromJSON(toolData);
      // Virtual-present (canvas-tool) matches have no owned item to use/break.
      // Under checkDriven they are recorded as skipped evidence (not mutated);
      // under toolSpecific they are silent (today's behaviour).
      if (virtual || !item) {
        if (checkDriven) {
          evidence.push({
            actorUuid: null,
            itemUuid: null,
            quantity: 1,
            componentId: tool.componentId ?? null,
            broken: false,
            authority,
            virtual: true,
          });
        }
        continue;
      }
      // Durable-identity gate (issue 557): an owned item is used OR broken only when
      // it matches the tool by durable identity. Re-check authoritatively via the
      // identity matcher so a mis-tagged, presence-only item can never reach delete();
      // when the manager exposes no identity matcher (legacy/test managers) fall back
      // to the selection tag, defaulting to breakable to preserve prior behaviour. A
      // spared item is left untouched — recorded as skipped evidence under checkDriven
      // (consistent with the virtual skip), silent under toolSpecific.
      const identityMatcher = this.recipeManager?.toolMatchesItemByIdentity;
      const breakable =
        typeof identityMatcher === 'function'
          ? identityMatcher.call(this.recipeManager, recipe, toolData, item) === true
          : selectedBreakable !== false;
      if (!breakable) {
        if (checkDriven) {
          evidence.push({
            actorUuid: item?.parent?.uuid ?? null,
            itemUuid: item?.uuid ?? null,
            quantity: 1,
            componentId: tool.componentId ?? null,
            broken: false,
            authority,
            spared: true,
          });
        }
        continue;
      }
      const actor = item?.parent ?? null;
      const isImmune = tool.breakage?.mode === 'immune';
      // checkDriven: immune tools are filtered out of the forced set (never break);
      // every other required tool breaks when forceBreak. toolSpecific: the legacy
      // forceBreak override applies, else the tool's own mode decides.
      let planned;
      const extra = {};
      if (checkDriven) {
        if (isImmune) {
          planned = { mode: 'immune', broken: false, evidence: { authority } };
          extra.authority = authority;
          extra.skippedImmune = true;
        } else if (forceBreak) {
          planned = { mode: 'forced', broken: true, evidence: { authority } };
          extra.authority = authority;
          extra.reason = reason;
          extra.triggerId = triggerId;
          extra.checkId = checkId;
        } else {
          planned = { mode: 'forced', broken: false, evidence: { authority } };
          extra.authority = authority;
        }
      } else if (isImmune) {
        // An immune tool never breaks under EITHER authority — a legacy crit/tier
        // forceBreak must not break it either. Defer to the tool's own (never-break)
        // evaluation rather than forcing it.
        planned = undefined;
      } else {
        planned = forceBreak ? { mode: 'forced', broken: true, evidence: {} } : undefined;
      }
      const entry = await applyToolUsageAndBreakage({
        tool,
        actor,
        item,
        planned,
        buildItemRef: (_actor, breakItem) => ({
          actorUuid: breakItem?.parent?.uuid || null,
          itemUuid: breakItem?.uuid || null,
          quantity: 1,
        }),
        createReplacement: this._makeToolReplacementCreator(recipe),
      });
      evidence.push({
        actorUuid: entry.itemRef?.actorUuid ?? null,
        itemUuid: entry.itemRef?.itemUuid ?? null,
        quantity: entry.itemRef?.quantity ?? 1,
        componentId: entry.componentId ?? null,
        broken: entry.broken === true,
        ...extra,
      });
    }
    return evidence;
  }

  /**
   * Build a `replaceWith` creator that resolves the replacement component from
   * the recipe's crafting system and creates the item on the actor.
   * @private
   */
  _makeToolReplacementCreator(recipe) {
    const systemManager = game.fabricate?.getCraftingSystemManager?.();
    const system = systemManager?.getSystem(recipe?.craftingSystemId);
    return async ({ actor, componentId }) => {
      const component =
        (system?.components || []).find((entry) => entry.id === componentId) || null;
      if (!component || typeof actor?.createEmbeddedDocuments !== 'function') return;
      let source = component;
      if (component.registeredItemUuid && typeof globalThis.fromUuidSync === 'function') {
        try {
          source = globalThis.fromUuidSync(component.registeredItemUuid) ?? component;
        } catch {
          source = component;
        }
      }
      const itemData = source.toObject?.() ?? {
        name: source.name ?? 'Replacement Item',
        img: source.img ?? 'icons/svg/item-bag.svg',
        type: source.type ?? 'loot',
        system: source.system
          ? (globalThis.foundry?.utils?.deepClone?.(source.system) ?? { ...source.system })
          : {},
      };
      itemData.system ??= {};
      if (itemData.system.quantity !== undefined) itemData.system.quantity = 1;
      if (source.uuid) {
        globalThis.foundry?.utils?.setProperty?.(itemData, 'flags.core.sourceId', source.uuid);
      }
      // Stamp the replacement's durable per-system identity (issue 780) so it resolves to
      // its own component — and, when it is itself a single linking first-class tool, stays
      // durably breakable — once #601 removes the name-fallback tier.
      stampReplacementComponentIdentity(itemData, system, componentId);
      await actor.createEmbeddedDocuments('Item', [itemData]);
    };
  }

  /**
   * Create the result items based on recipe configuration
   * @private
   */
  async _createResultItems(
    craftingActor,
    recipe,
    step,
    ingredientSet,
    consumedItems,
    toolItems,
    checkResult = null,
    selectedResultGroupId = null,
    precomputedEssences = null,
    resolveComponent = findMatchingComponent
  ) {
    const resolutionService =
      this.resolutionModeService || game.fabricate?.getResolutionModeService?.();

    const resolved = resolutionService
      ? resolutionService.resolveResultGroups({
          recipe,
          step,
          ingredientSet,
          checkResult,
          selectedResultGroupId,
        })
      : {
          groups: Array.isArray(step?.resultGroups) ? step.resultGroups : [],
          meta: {},
        };

    const groupsToCreate = Array.isArray(resolved?.groups) ? resolved.groups : [];

    const createdItems = [];
    for (const group of groupsToCreate) {
      for (const result of group.results || []) {
        const resultItem = await this._createSingleResult(
          craftingActor,
          result,
          consumedItems,
          toolItems,
          recipe,
          {
            ...checkResult,
            resolutionMeta: resolved?.meta || {},
          },
          { step, precomputedEssences, resolveComponent }
        );

        if (resultItem) {
          createdItems.push(resultItem);
        }
      }
    }

    return {
      items: createdItems,
      resolutionMeta: resolved?.meta || null,
    };
  }

  /**
   * Create a single result item
   * @private
   */
  async _createSingleResult(
    craftingActor,
    result,
    consumedItems,
    toolItems,
    recipe,
    checkResult = null,
    { step = null, precomputedEssences = null, resolveComponent } = {}
  ) {
    // Get the source item
    let sourceItem;
    let managedItem = null;
    if ((result.componentId || result.systemItemId) && recipe.craftingSystemId) {
      const systemManager = game.fabricate?.getCraftingSystemManager?.();
      const system = systemManager?.getSystem(recipe.craftingSystemId);
      const managedItems = system?.components || [];
      managedItem =
        managedItems.find((i) => i.id === (result.componentId || result.systemItemId)) || null;
      if (managedItem?.registeredItemUuid) {
        sourceItem = await fromUuid(managedItem.registeredItemUuid);
      }
    }

    if (result.itemUuid) {
      sourceItem = await fromUuid(result.itemUuid);
    }

    let itemData;
    if (sourceItem) {
      itemData = sourceItem.toObject();
    } else if (managedItem) {
      console.warn(
        `Fabricate | Managed result source item could not be resolved for "${managedItem.id || managedItem.name || 'unknown'}"; using fallback item data`
      );
      itemData = {
        name: managedItem.name || 'Crafted Item',
        img: managedItem.img || 'icons/svg/item-bag.svg',
        type: 'loot',
        system: {},
      };
    } else {
      console.error(
        `Fabricate | Result item not found: ${result.itemUuid || result.componentId || result.systemItemId}`
      );
      return null;
    }

    // Set quantity
    if (itemData.system.quantity !== undefined || !sourceItem) {
      itemData.system.quantity = result.quantity;
    }

    // Apply macro-based property updates
    const propertyUpdates = await this._runPropertyMacro(
      result.propertyMacroUuid,
      recipe,
      craftingActor,
      result,
      consumedItems,
      toolItems,
      checkResult,
      step,
      precomputedEssences,
      resolveComponent
    );
    if (propertyUpdates && typeof propertyUpdates === 'object') {
      for (const [path, value] of Object.entries(propertyUpdates)) {
        foundry.utils.setProperty(itemData, path, value);
      }
    }

    // Stamp the durable component identity on the crafted output so the inventory
    // matcher attributes it to its OWN component and not a sibling reached through a
    // transitive `_stats.duplicateSource` (issue 539). Keyed on the result's managed
    // component id + the recipe's crafting system id; a result with no managed component
    // (a bare `itemUuid` output) or an unsafe system id is left unstamped and resolves
    // via the raw-reference fall-through.
    stampCraftedComponentIdentity(itemData, recipe.craftingSystemId, managedItem?.id);

    // Create the item in crafting actor's inventory
    const [createdItem] = await craftingActor.createEmbeddedDocuments('Item', [itemData]);

    // Transfer active effects if configured (requires both recipe-level and system-level flags)
    if (recipe.transferEffects) {
      const systemManager = game.fabricate?.getCraftingSystemManager?.();
      const system = systemManager?.getSystem(recipe.craftingSystemId);
      if (system?.features?.effectTransfer === true) {
        await this._transferEffects(
          createdItem,
          consumedItems,
          recipe,
          precomputedEssences,
          resolveComponent
        );
      }
    }

    return createdItem;
  }

  /**
   * Transfer active effects from essence source items to the result item.
   *
   * Per spec 005 §"Effect Transfer Semantics":
   *   1. Determine contributing essence IDs from resolved ingredients.
   *   2. For each contributing essence, if EssenceDefinition.sourceItemUuid resolves,
   *      collect active effects from that item.
   *   3. Transfer collected effects to the result item via createEmbeddedDocuments.
   *
   * The old ingredient-level extractEffects / effectFilter path has been removed.
   * @private
   */
  async _transferEffects(
    resultItem,
    consumedItems,
    recipe,
    precomputedEssences = null,
    resolveComponent = findMatchingComponent
  ) {
    // 1. Get the crafting system and verify essences are enabled
    const systemManager = game.fabricate?.getCraftingSystemManager?.();
    const system = systemManager?.getSystem(recipe.craftingSystemId);
    if (!system?.features?.essences) return;

    // 2. Build essence context — resolvedEssences maps essenceId -> total quantity
    // contributed (or the precomputed snapshot on the time-gated FINISH path).
    const { resolvedEssences } = this._buildEssenceContext(
      consumedItems,
      recipe,
      precomputedEssences,
      resolveComponent
    );
    const contributingEssenceIds = Object.keys(resolvedEssences);
    if (contributingEssenceIds.length === 0) return;

    // 3. For each contributing essence, find its EssenceDefinition and resolve the source item
    const essenceDefinitions = system.essenceDefinitions || [];
    const effectsData = [];

    for (const essenceId of contributingEssenceIds) {
      const definition = essenceDefinitions.find((d) => d.id === essenceId);
      const sourceItemUuid = this._sourceUuidForEssenceDefinition(definition, system);
      if (!sourceItemUuid) continue;

      const sourceItem = await fromUuid(sourceItemUuid);
      if (!sourceItem) continue;

      const itemEffects = sourceItem.effects || [];
      for (const effect of itemEffects) {
        effectsData.push(effect.toObject());
      }
    }

    // 4. Transfer all collected effects to the result item
    if (effectsData.length === 0) return;
    await resultItem.createEmbeddedDocuments('ActiveEffect', effectsData);
  }

  _sourceUuidForEssenceDefinition(definition, system) {
    if (!definition) return null;
    const sourceComponentId =
      definition.sourceComponentId || definition.associatedSystemItemId || '';
    if (sourceComponentId) {
      const components = Array.isArray(system?.components)
        ? system.components
        : Array.isArray(system?.items)
          ? system.items
          : [];
      const component = components.find((item) => item?.id === sourceComponentId) || null;
      if (component?.originItemUuid || component?.registeredItemUuid) {
        return component.originItemUuid || component.registeredItemUuid;
      }
      return null;
    }
    return definition.sourceItemUuid || null;
  }

  _getFailureConsumptionPolicy(recipe) {
    const systemId = recipe?.craftingSystemId;
    if (!systemId) {
      return { consumeIngredientsOnFail: true, breakToolsOnFail: false };
    }
    const systemManager = game.fabricate?.getCraftingSystemManager?.();
    const system = systemManager?.getSystem(systemId);
    if (!system) {
      return { consumeIngredientsOnFail: true, breakToolsOnFail: false };
    }
    const consumption = system.craftingCheck?.consumption || {};
    return {
      consumeIngredientsOnFail: consumption.consumeIngredientsOnFail !== false,
      // Normalized systems carry `breakToolsOnFail`; tolerate the legacy
      // `consumeCatalystsOnFail` defensively for any un-normalized path.
      breakToolsOnFail:
        (consumption.breakToolsOnFail ?? consumption.consumeCatalystsOnFail) === true,
    };
  }

  /**
   * Check Item Piles currency cost on a recipe, if the integration is enabled.
   * @private
   */
  async _checkItemPilesCurrencyCost(craftingActor, recipe) {
    const cost = recipe?.currencyCost;
    if (!cost?.currencies?.length) return { valid: true };

    const integration = this.itemPilesIntegration || game.fabricate?.getItemPilesIntegration?.();
    if (!integration) return { valid: true };

    const systemManager = game.fabricate?.getCraftingSystemManager?.();
    const system = systemManager?.getSystem(recipe?.craftingSystemId);
    if (!integration.isEnabled(system)) return { valid: true };

    try {
      const affordable = await integration.canAfford(craftingActor, cost.currencies);
      if (!affordable) {
        return {
          valid: false,
          message: 'Insufficient currency (Item Piles). Cannot afford recipe cost.',
        };
      }
      return { valid: true };
    } catch (error) {
      console.error('Fabricate | Item Piles canAfford error', error);
      return { valid: false, message: 'Item Piles currency check failed: ' + error.message };
    }
  }

  /**
   * Deduct Item Piles currency cost from actor after a successful craft.
   * Errors are logged but do not throw, to avoid losing crafting results.
   * @private
   */
  async _deductItemPilesCurrencyCost(craftingActor, recipe) {
    const cost = recipe?.currencyCost;
    if (!cost?.currencies?.length) return;

    const integration = this.itemPilesIntegration || game.fabricate?.getItemPilesIntegration?.();
    if (!integration) return;

    const systemManager = game.fabricate?.getCraftingSystemManager?.();
    const system = systemManager?.getSystem(recipe?.craftingSystemId);
    if (!integration.isEnabled(system)) return;

    try {
      await integration.deductCurrency(craftingActor, cost.currencies);
    } catch (error) {
      console.error('Fabricate | Item Piles deductCurrency error', error);
    }
  }

  /**
   * Run the crafting check for an attempt, if one is required or enabled.
   *
   * A check is REQUIRED (run even when the system has crafting checks disabled)
   * when the recipe needs a check outcome to select its result:
   *  - `progressive` mode, or
   *  - `routedByCheck` mode.
   *
   * `routedByIngredients` does not need a check outcome to route: it selects by
   * the chosen ingredient set, so its check is the SAME optional pass/fail check as
   * `simple`/`alchemy`, read from the shared `craftingCheck.simple` slot (runs only
   * when a `simple.rollFormula` is authored). For `simple` the check honours the
   * crafting-checks enabled toggle; alchemy and `routedByIngredients` run their
   * simple pass/fail check on an authored roll formula alone (see `useSimpleCheck`
   * below). There is no legacy `tiered` branch — `tiered` is gone, replaced by the
   * two routed modes.
   *
   * @private
   * @returns {Promise<{success: boolean, outcome: ?string, value?: *, data: object}>}
   */
  async _runCraftingCheck(
    recipe,
    craftingActor,
    componentSourceActors,
    ingredientSet,
    // The routing basis is now a property of the system MODE, so the check no
    // longer reads the step's `resultSelection`; the param is retained for the
    // positional call signature.
    _step = null,
    // Interactive-roll options threaded from `craft()`. `{ interactive }` opts a
    // UI-triggered craft into the confirm-roll dialog + chat post; defaults to
    // non-interactive so the programmatic API stays silent.
    { interactive = false } = {}
  ) {
    const resolutionService =
      this.resolutionModeService || game.fabricate?.getResolutionModeService?.();
    const systemId = recipe?.craftingSystemId;
    if (!systemId) {
      return { success: true, outcome: null, value: null, data: {} };
    }
    const systemManager = game.fabricate?.getCraftingSystemManager?.();
    const system = systemManager?.getSystem(systemId);
    if (!system) {
      return { success: true, outcome: null, value: null, data: {} };
    }

    const mode = resolutionService?.getMode(recipe) || system?.resolutionMode || 'simple';

    // Alchemy: routing + check-ness are driven by the SYSTEM-level `alchemy.checkMode`
    // (the retired per-recipe provider is gone), NOT the generic `checksEnabled`
    // master toggle. Dispatch alchemy entirely here so the shared non-alchemy logic
    // below never applies to it.
    //  - `none`   → unconditional no-op success (ignore any stray simple.rollFormula
    //               and checksEnabled): a matched brew always succeeds.
    //  - `simple` → the mandatory pass/fail check, run whenever a formula exists
    //               (ungated by checksEnabled); a MISSING formula is a
    //               misconfiguration so craft() aborts with zero mutation.
    //  - `tiered` → the mandatory routed check (identical to routedByCheck); a
    //               missing routed formula is likewise a misconfiguration.
    if (mode === 'alchemy') {
      const alchemyCheckMode = system?.alchemy?.checkMode || 'none';
      if (alchemyCheckMode === 'none') {
        return { success: true, outcome: null, value: null, data: {} };
      }
      if (alchemyCheckMode === 'simple') {
        if (!this._hasCheckFormula(system?.craftingCheck?.simple)) {
          return {
            success: false,
            misconfigured: true,
            outcome: null,
            value: null,
            data: {},
            message: 'alchemy simple check mode requires a configured crafting check roll formula',
          };
        }
        return this._runSimpleCheck(system, recipe, ingredientSet, craftingActor, { interactive });
      }
      // tiered
      if (!this._hasCheckFormula(system?.craftingCheck?.routed)) {
        return {
          success: false,
          misconfigured: true,
          outcome: null,
          value: null,
          data: {},
          message:
            'alchemy tiered check mode requires a configured routed crafting check roll formula',
        };
      }
      // The per-recipe minimum-success-tier gate (`minSuccessOutcomeId`) is scoped to
      // `routedByCheck` only: its authoring control auto-hides for alchemy, so a value
      // carried here (authored before a mode switch, or imported) is unclearable. Pass
      // `applyMinSuccessOutcome: false` so a carried id stays inert on an alchemy brew —
      // tiered outcomes already gate success via each tier's `success` flag.
      return this._runRoutedCheck(system, recipe, ingredientSet, craftingActor, {
        interactive,
        applyMinSuccessOutcome: false,
      });
    }

    const checkRequired = mode === 'progressive' || mode === 'routedByCheck';
    const features = system.features || {};
    const checksEnabled =
      features.craftingChecks === true || system?.craftingCheck?.enabled === true;

    // Simple pass/fail check (Checks editor) for the simple AND routedByIngredients
    // modes: used when a roll formula is configured. (Alchemy is dispatched
    // separately above on `alchemy.checkMode` and never reaches here.) The
    // `craftingCheck.simple` slot is the shared optional pass/fail crafting-check
    // slot (it backs both modes), NOT a simple-mode-only slot. Optional in simple
    // (gated by the `checksEnabled` master toggle, so a configured formula only rolls
    // while checks are enabled) and in routedByIngredients (which routes result groups
    // by ingredient set, so its check never gates routing — it stays an optional
    // pass/fail layer that runs on an authored formula alone, with no `checksEnabled`
    // requirement).
    const simpleConfig = system?.craftingCheck?.simple;
    // With an EMPTY `simple.rollFormula` the simple pass/fail check is not usable,
    // so `useSimpleCheck` is false and (in optional simple / routedByIngredients
    // mode) the attempt proceeds with no check.
    const useSimpleCheck =
      ['simple', 'routedByIngredients'].includes(mode) &&
      !!simpleConfig?.rollFormula &&
      (mode === 'routedByIngredients' || checksEnabled);

    // Progressive check (Checks editor) for progressive mode: rolls a formula
    // whose total becomes the numeric `value` the progressive result-awarding
    // spends against result difficulties. Usable only when a roll formula is
    // configured; with no formula the required-check guard below fails the attempt.
    const progressiveConfig = system?.craftingCheck?.progressive;
    const useProgressiveCheck = mode === 'progressive' && !!progressiveConfig?.rollFormula;

    // Routed check (Checks editor) for `routedByCheck` ONLY: rolls the routed
    // formula and maps the total to an outcome tier whose NAME drives the
    // `routedByCheck` routing. Usable only when a routed formula is configured; the
    // check is required, so a missing formula fails via the required-check guard
    // below. `routedByIngredients` no longer reads `craftingCheck.routed` — its
    // optional pass/fail check lives on `craftingCheck.simple` (see `useSimpleCheck`).
    const routedConfig = system?.craftingCheck?.routed;
    const useRoutedCheck = mode === 'routedByCheck' && !!routedConfig?.rollFormula;

    if (
      !checksEnabled &&
      !checkRequired &&
      !useSimpleCheck &&
      !useProgressiveCheck &&
      !useRoutedCheck
    ) {
      return { success: true, outcome: null, data: {} };
    }

    if (useSimpleCheck) {
      return this._runSimpleCheck(system, recipe, ingredientSet, craftingActor, { interactive });
    }

    if (useProgressiveCheck) {
      return this._runProgressiveCheck(system, recipe, craftingActor, { interactive });
    }

    if (useRoutedCheck) {
      // Only `routedByCheck` uses the tier-routing path (its check total maps to an
      // outcome tier whose name drives routing). `routedByIngredients` routes result
      // groups by the chosen ingredient set and runs its optional pass/fail check
      // through `useSimpleCheck` above against `craftingCheck.simple`.
      return this._runRoutedCheck(system, recipe, ingredientSet, craftingActor, { interactive });
    }

    // No usable roll-formula check path applied. A check is only "usable" when its
    // resolution mode has an authored roll formula (handled above). When a check is
    // REQUIRED (progressive, or routedByCheck) but no roll formula is configured,
    // fail loudly so the misconfiguration is visible; otherwise this is an optional
    // check with nothing to run, so treat it as a no-op success.
    if (checkRequired) {
      return {
        success: false,
        misconfigured: true,
        outcome: null,
        value: null,
        data: {},
        message: `${mode} mode requires a configured crafting check roll formula`,
      };
    }
    return { success: true, outcome: null, value: null, data: {} };
  }

  /**
   * Evaluate the simple pass/fail crafting check: roll the formula, resolve the
   * DC (static default, the recipe's selected tier, or a dynamic macro), and
   * compare (meet-or-exceed / exceed). A configured critical raw roll on any die
   * in the formula auto-fails or auto-succeeds, overriding the comparison.
   *
   * @returns {Promise<{success: boolean, outcome: string, value: number|null, data: object, message: string|null}>}
   */
  async _runSimpleCheck(
    system,
    recipe,
    ingredientSet,
    craftingActor,
    { interactive = false } = {}
  ) {
    return this._runPassFailCheck(
      system,
      system?.craftingCheck?.simple || {},
      recipe,
      ingredientSet,
      craftingActor,
      { interactive }
    );
  }

  /**
   * Evaluate a pass/fail crafting check against an arbitrary check sub-config
   * (the shared `simple` slot, which backs `simple`/`routedByIngredients` and the
   * alchemy `simple` check mode): resolve the DC
   * (static default, recipe tier, or dynamic macro) via {@link _resolveSimpleCheckDc}
   * — parameterized over `config`, so a recipe `checkTierId` / dynamic-DC macro still
   * applies — then roll and compare (meet-or-exceed / exceed) via the shared
   * {@link runFormulaPassFail}. Forced-outcome triggers and interactive cancel are
   * honoured inside that runner.
   *
   * Used by `simple` mode, `routedByIngredients` (whose check is an optional pass/fail
   * gate — that mode routes result groups by the chosen ingredient set, NOT by check
   * outcome tiers — see {@link ResolutionModeService#resolveResultGroups}), and the
   * alchemy `simple` check mode (dispatched from {@link _runCraftingCheck}). Only
   * `routedByCheck` and the alchemy `tiered` mode use the tier-routing {@link _runRoutedCheck}.
   *
   * @returns {Promise<{success: boolean, outcome: string, value: number|null, data: object, message: string|null}>}
   */
  async _runPassFailCheck(
    system,
    config,
    recipe,
    ingredientSet,
    craftingActor,
    { interactive = false } = {}
  ) {
    const checkConfig = config || {};
    const dc = await this._resolveSimpleCheckDc(
      system,
      checkConfig,
      recipe,
      ingredientSet,
      craftingActor
    );
    const result = await runFormulaPassFail({
      formula: checkConfig.rollFormula,
      dc,
      thresholdMode: checkConfig.thresholdMode,
      triggers: checkConfig.checkBreakage?.triggers,
      actor: craftingActor,
      label: 'Crafting',
      craftingModifier: this._buildCraftingModifierContext(system, recipe),
      rollOptions: buildInteractiveRollOptions({
        interactive,
        actor: craftingActor,
        name: recipe?.name,
        activity: 'Crafting',
        img: this._resolveRecipePromptImg(recipe),
        dc,
      }),
    });
    return this._markEngineEvaluated(result);
  }

  /**
   * Evaluate the authored routed crafting check: roll the routed formula and map
   * its total onto one of the configured outcome tiers, returning the matched
   * tier's NAME as `outcome` for the routed `check`-provider routing
   * (`ResolutionModeService._routeByTierAssignment` → `checkOutcomeIds`, else the
   * outcome-name fallback). Mirrors {@link _runSalvageRoutedCheck} for the
   * roll / tier / crit handling, but — unlike recipe-less salvage / gathering,
   * which pass the flat `routed.dc` — the base DC resolves via the SAME
   * recipe-tier / dynamic-macro path as {@link _runSimpleCheck}
   * ({@link _resolveSimpleCheckDc} parameterized over `routed`), because routed
   * crafting carries `recipe.checkTierId` and a dynamic-DC macro. For relative
   * tiers each threshold shifts by `dc + outcome.dc`, so a flat DC would silently
   * drop the recipe tier / dynamic DC.
   *
   * When no routed `rollFormula` is configured this method is NOT reached: the
   * caller only dispatches here when one is set, and otherwise its required-check
   * guard fails loudly. There is no macro / adapter fallback (removed).
   *
   * @returns {Promise<{success: boolean, outcome: string|null, value: number|null, data: object, message: string|null}>}
   */
  async _runRoutedCheck(
    system,
    recipe,
    ingredientSet,
    craftingActor,
    // `applyMinSuccessOutcome` gates the recipe minimum-tier bump: `routedByCheck`
    // applies it, the alchemy tiered dispatch passes false so a carried (unclearable)
    // `minSuccessOutcomeId` has no runtime effect on an alchemy brew.
    { interactive = false, applyMinSuccessOutcome = true } = {}
  ) {
    const routed = system?.craftingCheck?.routed || {};
    const dc = await this._resolveSimpleCheckDc(
      system,
      routed,
      recipe,
      ingredientSet,
      craftingActor
    );
    const result = await runFormulaRouted({
      formula: routed.rollFormula,
      dc,
      thresholdMode: routed.thresholdMode,
      type: routed.type,
      relativeOutcomes: routed.relativeOutcomes,
      fixedOutcomes: routed.fixedOutcomes,
      triggers: routed.checkBreakage?.triggers,
      actor: craftingActor,
      label: 'Crafting',
      craftingModifier: this._buildCraftingModifierContext(system, recipe),
      // A total below every relative threshold clamps to the lowest tier, so a
      // recipe-tier / dynamic DC bump never leaves a craft rolled-but-unrouted.
      clampToNearest: true,
      // Fixed-type only: a recipe may require a minimum success tier; a roll below it
      // fails the craft outright. Null for relative / unset recipes (no-op), and forced
      // null for the alchemy tiered path (its authoring control is `routedByCheck`-only).
      minOutcomeId: applyMinSuccessOutcome ? (recipe?.minSuccessOutcomeId ?? null) : null,
      rollOptions: buildInteractiveRollOptions({
        interactive,
        actor: craftingActor,
        name: recipe?.name,
        activity: 'Crafting',
        img: this._resolveRecipePromptImg(recipe),
        // Fixed-type routed checks match by value range, not DC, so the prompt must
        // not advertise a (meaningless) DC. Undefined suppresses the chip + flavor.
        dc: routed.type === 'fixed' ? undefined : dc,
      }),
    });
    return this._markEngineEvaluated(result);
  }

  /**
   * Tag a check result as engine-evaluated so the craft seam knows its
   * `data.breakTools` is an authored-crit / authored-tier signal it can honour for
   * forced tool breakage. The no-check passthrough success (when no usable roll
   * formula applies) is NOT tagged, so its `data` cannot force breakage; only an
   * engine-rolled crit/tier result carries the `engineEvaluated` flag.
   * @private
   */
  _markEngineEvaluated(result) {
    return { ...result, engineEvaluated: true };
  }

  /**
   * Build the `@craftingmod` modifier context (issue 770) from the system's crafting
   * check catalogue + default policy and the recipe's optional override. Threaded to
   * the shared check runners, which resolve `@craftingmod` to a scalar against the
   * crafter's roll data before the formula reaches Foundry's `Roll`. A formula with no
   * `@craftingmod` token ignores this context entirely (full back-compat).
   * @private
   */
  _buildCraftingModifierContext(system, recipe) {
    const check = system?.craftingCheck || {};
    return {
      catalogue: check.checkModifiers,
      systemPolicy: check.defaultModifierPolicy,
      defaultModifierIds: check.defaultModifierIds,
      recipeModifier: recipe?.craftingModifier ?? null,
    };
  }

  /**
   * Resolve the recipe icon for the interactive roll prompt with the SAME
   * precedence the GM editor and player listings use — the recipe-item
   * definition's image wins over the recipe's own `img` (which is itself
   * model-defaulted to `DEFAULT_RECIPE_IMAGE`, so it already supplies the trailing
   * default). Raw `recipe.img` alone shows the generic blueprint for a
   * recipe-item-backed recipe; mirror `CraftingListingBuilder`'s precedence here.
   * @private
   */
  _resolveRecipePromptImg(recipe) {
    const systemManager = globalThis.game?.fabricate?.getCraftingSystemManager?.();
    const recipeItemImg = recipe?.recipeItemId
      ? systemManager?.getRecipeItemDefinition?.(recipe.craftingSystemId, recipe.recipeItemId)
          ?.img || ''
      : '';
    // The final fallback is ALWAYS the recipe default (blueprint), matching the GM
    // editor — never a generic item bag. `recipe.img` is itself model-defaulted to
    // DEFAULT_RECIPE_IMAGE, so this is belt-and-braces for a plain-object recipe.
    return recipeItemImg || recipe?.img || DEFAULT_RECIPE_IMAGE;
  }

  /**
   * Run the progressive crafting check: roll the configured formula and return its
   * total as the numeric `value` that the progressive result-awarding spends
   * against result difficulties (see the `progressive` branch of
   * {@link ResolutionModeService#resolveResultGroups}). There is no DC — the craft
   * always proceeds; the value decides how many results are awarded.
   *
   * Per-die crits (shared shape with the simple check) force the award: a matched
   * SUCCESS crit awards everything (`value = MAX_SAFE_INTEGER`), a matched FAILURE
   * crit awards nothing (`value = 0`), and either may break tools (forced failure
   * wins). Delegates to the shared {@link runFormulaProgressive}.
   */
  async _runProgressiveCheck(system, recipe, craftingActor, { interactive = false } = {}) {
    const progressive = system?.craftingCheck?.progressive || {};
    const result = await runFormulaProgressive({
      formula: progressive.rollFormula,
      triggers: progressive.checkBreakage?.triggers,
      actor: craftingActor,
      label: 'Crafting',
      craftingModifier: this._buildCraftingModifierContext(system, recipe),
      rollOptions: buildInteractiveRollOptions({
        interactive,
        actor: craftingActor,
        name: recipe?.name,
        activity: 'Crafting',
        img: this._resolveRecipePromptImg(recipe),
      }),
    });
    return this._markEngineEvaluated(result);
  }

  /**
   * Resolve the active crafting check's `checkBreakage` block for the system's
   * resolution mode (issue 419). The simple/routedByIngredients modes author on the
   * shared simple check, routedByCheck on the routed check, progressive on the
   * progressive check. Alchemy authors per `alchemy.checkMode`: tiered on the routed
   * check, none/simple on the shared simple check.
   * @private
   */
  _resolveCraftingCheckBreakage(system, recipe) {
    const resolutionService =
      this.resolutionModeService || game.fabricate?.getResolutionModeService?.();
    const mode = resolutionService?.getMode?.(recipe) || system?.resolutionMode || 'simple';
    const check = system?.craftingCheck || {};
    if (mode === 'routedByCheck') return check.routed?.checkBreakage ?? null;
    if (mode === 'progressive') return check.progressive?.checkBreakage ?? null;
    if (mode === 'alchemy' && (system?.alchemy?.checkMode || 'none') === 'tiered') {
      return check.routed?.checkBreakage ?? null;
    }
    return check.simple?.checkBreakage ?? null;
  }

  /**
   * Resolve the active salvage check's `checkBreakage` block for the system's
   * salvage resolution mode (issue 419).
   * @private
   */
  _resolveSalvageCheckBreakage(system) {
    const mode = system?.salvageResolutionMode || 'simple';
    const check = system?.salvageCraftingCheck || {};
    if (mode === 'routed') return check.routed?.checkBreakage ?? null;
    if (mode === 'progressive') return check.progressive?.checkBreakage ?? null;
    return check.simple?.checkBreakage ?? null;
  }

  /**
   * Resolve the salvage breakage decision via the shared {@link evaluateCheckBreakage}
   * seam, bringing salvage to parity with crafting (issue 419). Returns
   * `{ forceBreak, triggerId, reason, authority }`.
   * @private
   */
  _resolveSalvageBreakageDecision(system, checkResult) {
    const authority =
      system?.toolBreakage?.authority === 'checkDriven' ? 'checkDriven' : 'toolSpecific';
    // Either-or authority (issue 419): a check can only break tools under
    // `checkDriven`. Under `toolSpecific` tools break solely by their own modes, so
    // the check-driven force-break (and the routed per-tier legacy bridge) is not
    // consulted.
    if (authority !== 'checkDriven') {
      return { forceBreak: false, triggerId: null, reason: null, authority };
    }
    const checkBreakage = this._resolveSalvageCheckBreakage(system);
    const decision = evaluateCheckBreakage({ checkBreakage, checkResult });
    return { ...decision, authority };
  }

  /**
   * Resolve the breakage decision for a crafting attempt via the single shared
   * {@link evaluateCheckBreakage} seam (issue 419). Returns the `{ forceBreak,
   * triggerId, reason }` decision plus the system's breakage `authority`. Authority
   * is strictly either-or: under `toolSpecific` a check NEVER breaks tools (each
   * Tool's own mode decides, so the seam is not consulted); under `checkDriven` the
   * active check's `checkBreakage` triggers (those opting in via `breakTools`, plus
   * the implicit routed per-tier `data.breakTools` bridge) decide whether all
   * required tools break. Only engine-evaluated roll-formula check results can
   * force-break (the `engineEvaluated` guard is preserved inside `evaluateCheckBreakage`).
   * @private
   */
  _resolveCraftingBreakageDecision(system, recipe, checkResult) {
    const authority =
      system?.toolBreakage?.authority === 'checkDriven' ? 'checkDriven' : 'toolSpecific';
    // Either-or authority (issue 419): a check can only break tools under
    // `checkDriven`. Under `toolSpecific` tools break solely by their own modes, so
    // the check-driven force-break (and the routed per-tier legacy bridge) is not
    // consulted.
    if (authority !== 'checkDriven') {
      return { forceBreak: false, triggerId: null, reason: null, authority };
    }
    const checkBreakage = this._resolveCraftingCheckBreakage(system, recipe);
    const decision = evaluateCheckBreakage({ checkBreakage, checkResult });
    return { ...decision, authority };
  }

  /**
   * Resolve the system for a recipe (or salvage synthetic recipe) from the manager.
   * @private
   */
  _getRecipeSystem(recipe) {
    const systemManager = game.fabricate?.getCraftingSystemManager?.();
    return systemManager?.getSystem(recipe?.craftingSystemId) ?? null;
  }

  /**
   * Whether the recipe's system applies time requirements. The GM toggle
   * `system.requirements.time.enabled` gates whether a step's `timeRequirement`
   * arms a timed run; when off, timed steps resolve immediately (as they did
   * before the toggle existed for any recipe without a duration). Defaults ON so
   * an absent flag preserves the pre-toggle behaviour of existing timed recipes —
   * only an explicit `false` disables gating.
   * @private
   */
  _timeRequirementsEnabled(recipe) {
    return this._getRecipeSystem(recipe)?.requirements?.time?.enabled !== false;
  }

  /**
   * True when a recipe must run as a COLLAPSED atomic chain (issue 710): it carries
   * authored `steps[]` but its crafting system has the multi-step feature turned
   * OFF. The authored steps are never deleted — disabling the feature only changes
   * how the recipe executes (one atomic action instead of step-by-step) and how the
   * GM edits it (single-step results surface); re-enabling restores the full flow.
   * @private
   * @param {object} recipe
   * @returns {boolean}
   */
  _isCollapsedChain(recipe) {
    // Only a genuine MULTI-step recipe (> 1 authored step) collapses; a single
    // explicit step behaves exactly like a normal single-step recipe (including its
    // consume-at-start timed path), so it is never treated as a chain.
    if (!Array.isArray(recipe?.steps) || recipe.steps.length <= 1) return false;
    return this._getRecipeSystem(recipe)?.features?.multiStepRecipes !== true;
  }

  /**
   * The single summed time gate for a collapsed chain: the sum of every authored
   * step's `timeRequirement` (in seconds), or 0 when time requirements are disabled
   * for the system. The collapsed chain arms ONE gate for this total rather than
   * arming a gate per step, so the whole atomic action waits once and then executes
   * every step back-to-back at maturity.
   * @private
   * @param {object} recipe
   * @param {object[]} executionSteps
   * @param {object} runManager
   * @returns {number}
   */
  _collapsedChainSeconds(recipe, executionSteps, runManager) {
    if (!runManager || !Array.isArray(executionSteps)) return 0;
    if (!this._timeRequirementsEnabled(recipe)) return 0;
    return executionSteps.reduce(
      (total, step) =>
        total + (step?.timeRequirement ? runManager.durationToSeconds(step.timeRequirement) : 0),
      0
    );
  }

  /**
   * Arm / resume / advance the collapsed chain's single summed time gate. Called
   * once at the chain entry (stepIndex 0). Returns `{ waiting, run, result }`:
   *  - `waiting: true` — the gate is not yet mature (just armed, or still counting
   *    down); the caller returns `result` and leaves the run active to resume later.
   *  - `waiting: false` — no time requirement, or the gate matured; the caller
   *    proceeds to execute the chain's steps back-to-back.
   *
   * Unlike a per-step timed run, the collapsed chain consumes NOTHING when the gate
   * is armed — every step consumes its own ingredients at execution (maturity), so
   * there is no prepared-consumption snapshot to manage.
   * @private
   * @returns {Promise<{ waiting: boolean, run: object, result?: object }>}
   */
  async _handleCollapsedChainGate({ craftingActor, recipe, executionSteps, runManager, run }) {
    const summedSeconds = this._collapsedChainSeconds(recipe, executionSteps, runManager);
    if (summedSeconds <= 0) return { waiting: false, run };

    const now = Number(game.time?.worldTime || 0);
    const gate = run?.steps?.[0]?.timeGate;
    if (!gate) {
      const armed = await runManager.armCollapsedChainGate(craftingActor, run, summedSeconds);
      return {
        waiting: true,
        run: armed,
        result: {
          success: false,
          results: null,
          message: `Crafting ${recipe.name} is in progress (${summedSeconds}s remaining)`,
        },
      };
    }
    if (!runManager.canProceedTimeGate(run, 0, now)) {
      const remaining = Math.max(0, Math.ceil(Number(gate.availableAt || 0) - now));
      return {
        waiting: true,
        run,
        result: {
          success: false,
          results: null,
          message: `Crafting ${recipe.name} is still in progress (${remaining}s remaining)`,
        },
      };
    }
    const resumed = await runManager.markStepInProgress(craftingActor, run, 0);
    return { waiting: false, run: resumed };
  }

  /**
   * True when a check sub-config carries an authored, non-empty roll formula — the
   * single notion of a "usable" check (matches `ResolutionModeService._hasRollFormula`).
   * @private
   */
  _hasCheckFormula(config) {
    return typeof config?.rollFormula === 'string' && config.rollFormula.trim().length > 0;
  }

  /**
   * The system-level alchemy check mode for a recipe (`none` | `simple` | `tiered`),
   * defaulting to `none`. Non-alchemy systems return `null`.
   * @private
   */
  _getAlchemyCheckMode(recipe) {
    const system = this._getRecipeSystem(recipe);
    if (system?.resolutionMode !== 'alchemy') return null;
    return system?.alchemy?.checkMode || 'none';
  }

  /**
   * Resolve the engine check's DC: a dynamic macro's returned number, the recipe's
   * selected static tier, or the static default. Any failure falls back to the
   * default DC so a misconfiguration never throws mid-craft. Parameterized over the
   * check config (`simple` or `routed`) so the routed check resolves its base DC via
   * the SAME recipe-tier / dynamic path as the simple check, not the flat config DC.
   */
  async _resolveSimpleCheckDc(system, simple, recipe, ingredientSet, craftingActor) {
    const fallback = Number.isFinite(Number(simple.dc)) ? Math.trunc(Number(simple.dc)) : 15;
    if (simple.dcMode === 'dynamic') {
      if (!simple.macroUuid) return fallback;
      try {
        const value = await MacroExecutor.run(simple.macroUuid, {
          recipe: recipe?.toJSON?.() || recipe,
          craftingSystem: system,
          craftingActor,
          candidateIngredientSet: ingredientSet,
        });
        const numeric = Number(value);
        return Number.isFinite(numeric) ? Math.trunc(numeric) : fallback;
      } catch (error) {
        console.error(
          `Fabricate | Simple crafting check DC macro failed (${simple.macroUuid})`,
          error
        );
        return fallback;
      }
    }
    const tierId = recipe?.checkTierId;
    if (tierId) {
      const tiers = Array.isArray(simple.tiers) ? simple.tiers : [];
      const tier = tiers.find((entry) => entry.id === tierId);
      const tierDc = Number(tier?.dc);
      if (tier && Number.isFinite(tierDc)) return Math.trunc(tierDc);
    }
    return fallback;
  }

  /**
   * Post an automatic crafting summary chat message.
   *
   * Checks system.features.chatOutput; returns silently when the toggle is off or
   * when the crafting system cannot be resolved.  Errors from ChatMessage.create
   * are caught so they never propagate up the craft() call stack.
   *
   * @param {object}  params
   * @param {boolean} params.success            - Whether the craft succeeded.
   * @param {object}  params.craftingActor      - The actor performing the craft.
   * @param {object}  params.recipe             - The recipe being crafted.
   * @param {Array}   params.consumedIngredients - Array of { item, quantity } entries.
   * @param {Array}   params.tools               - Array of { tool, item } entries.
   * @param {Array}   params.createdResults      - Array of created Item documents (success only).
   * @param {string}  [params.failureReason]     - Human-readable failure reason (failure only).
   * @param {number|null} [params.rollValue]      - The crafting check total (`checkResult.value`),
   *   or null when no check ran; the card renders it only when finite.
   * @private
   */
  async _postCraftChatMessage({
    success,
    craftingActor,
    recipe,
    consumedIngredients,
    tools,
    createdResults,
    failureReason,
    rollValue = null,
  }) {
    const systemManager = game.fabricate?.getCraftingSystemManager?.();
    const system = systemManager?.getSystem(recipe?.craftingSystemId);
    if (!system || system.features?.chatOutput !== true) return;

    const localize = (key) => game.i18n?.localize?.(key) ?? key;

    const toolEntries = this._resolveToolChatEntries(tools, system);

    // Resolve to a plain, Foundry-free model, then render via the shared pure
    // builder (mirrors the gathering card: resolve names/images here, format there).
    const content = buildCraftingChatContent(
      {
        status: success ? 'succeeded' : 'failed',
        actorName: craftingActor?.name || '',
        recipeName: recipe?.name || '',
        results: (createdResults || []).map((item) => ({
          name: item?.name || '',
          img: item?.img || '',
          quantity: Number(item?.system?.quantity || 1),
        })),
        consumed: (consumedIngredients || []).map(({ item, quantity }) => ({
          name: item?.name || '',
          img: item?.img || '',
          quantity: Number(quantity || 1),
        })),
        tools: toolEntries,
        rollValue: Number.isFinite(rollValue) ? rollValue : null,
        failureReason: failureReason || '',
      },
      localize
    );

    try {
      await ChatMessage.create({
        user: game.user?.id,
        speaker: ChatMessage.getSpeaker({ actor: craftingActor }),
        content,
      });
    } catch (error) {
      console.error('Fabricate | Failed to post crafting chat message:', error);
    }
  }

  /**
   * Resolve `[{ tool, item }]` tool matches to plain `{ name, img }` chat entries.
   *
   * Tools render by their AUTHORED name (the referenced component), not the matched
   * item's name: a single owned item can satisfy more than one tool slot
   * (source/name collision), which would otherwise print the same item name twice.
   * Falls back to the matched item's name when the component can't be resolved.
   * De-dupes by component id so a tool is never listed twice. Shared by the crafting
   * and salvage chat cards.
   * @private
   */
  _resolveToolChatEntries(tools, system) {
    const componentById = new Map(
      (system?.components || []).map((component) => [component?.id, component])
    );
    const entries = [];
    const seen = new Set();
    for (const pair of tools || []) {
      // Skip virtual-present canvas tools (no owned item) — no chip to render.
      if (!pair?.item) continue;
      const componentId = pair.tool?.componentId || pair.tool?.systemItemId || null;
      const component = componentId ? componentById.get(componentId) : null;
      const key = componentId || pair.item?.uuid || pair.item?.name || null;
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
      entries.push({
        name: component?.name || pair.item?.name || '',
        img: component?.img || pair.item?.img || '',
      });
    }
    return entries;
  }

  /**
   * Resolve the `_applyToolBreakage` evidence records that BROKE this salvage to
   * plain `{ name, img }` chat entries, resolving each authored tool component by
   * its `componentId` and de-duping. Non-broken evidence (spared/virtual/immune) is
   * skipped so the salvage card's tools section names only what was actually lost.
   * @private
   */
  _resolveBrokenToolChatEntries(usedTools, system) {
    const componentById = new Map(
      (system?.components || []).map((component) => [component?.id, component])
    );
    const entries = [];
    const seen = new Set();
    for (const record of usedTools || []) {
      if (record?.broken !== true) continue;
      const componentId = record.componentId || null;
      const component = componentId ? componentById.get(componentId) : null;
      const key = componentId || record.itemUuid || null;
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
      entries.push({
        name: component?.name || '',
        img: component?.img || '',
      });
    }
    return entries;
  }

  /**
   * Post a salvage result chat card, the salvage analogue of
   * {@link _postCraftChatMessage} (issue 675). Gated on the SAME
   * `system.features.chatOutput` toggle crafting reads, and posted only for a
   * resolved success or a rolled failure — never for a cancelled prompt, a
   * misconfigured/validation abort, or a time-gated run that has started but
   * awarded nothing (those mutate nothing to report). Renders through the shared
   * pure `buildSalvageChatContent` builder, so the card matches the crafting card
   * visually. Errors from `ChatMessage.create` are caught so a chat failure never
   * propagates out of `salvage()` or blocks the award.
   *
   * @param {object}  params
   * @param {boolean} params.success       - Whether the salvage succeeded.
   * @param {object}  params.actor         - The salvaging actor.
   * @param {object}  params.system        - The crafting system (already resolved).
   * @param {object}  params.component     - The salvaged source component.
   * @param {number}  params.consumedQuantity - How many of the source were broken down.
   * @param {Array}   [params.results]     - Created result Item documents (success only).
   * @param {Array}   [params.usedTools]   - `_applyToolBreakage` evidence records.
   * @param {string}  [params.failureReason] - Human-readable reason (failure only).
   * @param {number|null} [params.rollValue]  - The salvage check total (`checkResult.value`),
   *   or null when no check ran; the card renders it only when finite.
   * @private
   */
  async _postSalvageChatMessage({
    success,
    actor,
    system,
    component,
    consumedQuantity,
    results,
    usedTools,
    failureReason,
    rollValue = null,
  }) {
    if (!system || system.features?.chatOutput !== true) return;

    const localize = (key) => game.i18n?.localize?.(key) ?? key;
    const consumed =
      Number(consumedQuantity) > 0
        ? [
            {
              name: component?.name || '',
              img: component?.img || '',
              quantity: Number(consumedQuantity),
            },
          ]
        : [];

    const content = buildSalvageChatContent(
      {
        status: success ? 'succeeded' : 'failed',
        actorName: actor?.name || '',
        componentName: component?.name || '',
        results: (results || []).map((item) => ({
          name: item?.name || '',
          img: item?.img || '',
          quantity: Number(item?.system?.quantity || 1),
        })),
        consumed,
        tools: this._resolveBrokenToolChatEntries(usedTools, system),
        rollValue: Number.isFinite(rollValue) ? rollValue : null,
        failureReason: failureReason || '',
      },
      localize
    );

    try {
      await ChatMessage.create({
        user: game.user?.id,
        speaker: ChatMessage.getSpeaker({ actor }),
        content,
      });
    } catch (error) {
      console.error('Fabricate | Failed to post salvage chat message:', error);
    }
  }

  async _runPropertyMacro(
    macroUuid,
    recipe,
    craftingActor,
    result,
    consumedItems,
    toolItems,
    checkResult = null,
    step = null,
    precomputedEssences = null,
    resolveComponent = findMatchingComponent
  ) {
    if (!macroUuid) return null;

    const systemManager = game.fabricate?.getCraftingSystemManager?.();
    const craftingSystem = recipe?.craftingSystemId
      ? systemManager?.getSystem(recipe.craftingSystemId)
      : null;
    const features = craftingSystem?.features || {};
    const enabled = features.propertyMacros === true;
    if (!enabled) return null;

    const essenceContext = this._buildEssenceContext(
      consumedItems,
      recipe,
      precomputedEssences,
      resolveComponent
    );
    const context = {
      recipe: recipe?.toJSON?.() || recipe,
      craftingSystem,
      craftingActor,
      ingredientPool: consumedItems.map(({ item, quantity, ingredient }) => ({
        item,
        quantity,
        ingredient,
      })),
      resolvedIngredients: consumedItems.map(({ item, quantity, ingredient }) => ({
        item,
        quantity,
        ingredient,
      })),
      resolvedTools: toolItems.map(({ item, tool }) => ({
        item,
        tool,
      })),
      resolvedEssences: essenceContext.resolvedEssences,
      essenceSources: essenceContext.essenceSources,
      checkResult,
      result: result?.toJSON?.() || result,
      step,
    };

    try {
      const updates = await MacroExecutor.run(macroUuid, context);
      if (updates == null) return null;
      if (typeof updates !== 'object' || Array.isArray(updates)) {
        console.warn(`Fabricate | Property macro ${macroUuid} did not return an object`);
        return null;
      }
      return updates;
    } catch (error) {
      console.error(`Fabricate | Property macro failed (${macroUuid})`, error);
      ui.notifications.error(`Property macro failed: ${error.message || macroUuid}`);
      return null;
    }
  }

  /**
   * Build the essence context from consumed items.
   *
   * @param {Array} consumedItems
   * @param {object|null} [recipe]
   * @param {object|null} [precomputedEssences] - a precomputed
   *   `resolvedEssences` map (essenceId -> total quantity). Supplied by the
   *   time-gated FINISH path, whose source items are already deleted, so essence
   *   quantities cannot be re-resolved and were snapshotted at START. When
   *   provided it is used verbatim (with no per-item `essenceSources`); otherwise
   *   essences are resolved live from the consumed items.
   * @param {Function} [resolveComponent] - Optional component resolver injected on the
   *   alchemy craft path (issue 578) so a tier-4-only consumed item contributes its
   *   component's essences to effect transfer / property-macro context; defaults
   *   to the shared standard-craft resolver {@link findMatchingComponent} via {@link resolveItemEssences}.
   * @private
   */
  _buildEssenceContext(
    consumedItems,
    recipe = null,
    precomputedEssences = null,
    resolveComponent = findMatchingComponent
  ) {
    if (precomputedEssences && typeof precomputedEssences === 'object') {
      return { resolvedEssences: { ...precomputedEssences }, essenceSources: {} };
    }
    const resolvedEssences = {};
    const essenceSources = {};
    const components = this._getSystemComponents(recipe);

    for (const { item, quantity } of consumedItems) {
      const itemEssences = resolveItemEssences(
        item,
        components,
        recipe?.craftingSystemId,
        resolveComponent
      );
      for (const [essenceId, perUnit] of Object.entries(itemEssences)) {
        const value = Number(perUnit);
        if (!Number.isFinite(value) || value <= 0) continue;
        const total = value * (Number(quantity) || 1);
        resolvedEssences[essenceId] = (resolvedEssences[essenceId] || 0) + total;
        essenceSources[essenceId] ||= [];
        essenceSources[essenceId].push({
          itemId: item.id,
          itemName: item.name,
          quantityConsumed: quantity,
          essencePerItem: value,
          essenceTotal: total,
        });
      }
    }

    return { resolvedEssences, essenceSources };
  }

  _getSystemComponents(recipe) {
    const systemId = recipe?.craftingSystemId;
    if (!systemId) return [];
    const systemManager = game.fabricate?.getCraftingSystemManager?.();
    const system = systemManager?.getSystem(systemId);
    return Array.isArray(system?.components) ? system.components : [];
  }

  /**
   * Format a human-readable "missing required items" message.
   *
   * When a `recipe` is supplied, a component-match ingredient
   * (`ingredient.match.type === 'component'`) is rendered with the component's
   * display name resolved from the system's `components` list — e.g.
   * `"2x Iron Rivet: have 0, need 2"` — instead of the generic
   * `ingredient.getDescription()` fallback (which renders a nameless
   * `"2x component"`). Essence and tool lines are unchanged.
   *
   * @private
   * @param {{ ingredients: Array, essences: Array, tools?: Array }} missing
   * @param {object|null} [recipe] - the (step) recipe view, used to resolve
   *   component display names via {@link _getSystemComponents}
   * @returns {string}
   */
  _formatMissingItems(missing, recipe = null) {
    const components = this._getSystemComponents(recipe);
    const lines = [];

    for (const { ingredient, have, need } of missing.ingredients) {
      let line = null;
      const componentId =
        ingredient?.match?.type === 'component' ? ingredient.match.componentId : null;
      if (componentId) {
        const name = components.find((component) => component?.id === componentId)?.name;
        if (name) {
          line = `${need}x ${name}: have ${have}, need ${need}`;
        }
      }
      if (!line) {
        const description =
          typeof ingredient?.getDescription === 'function'
            ? ingredient.getDescription()
            : 'Ingredient';
        line = `${description}: have ${have}, need ${need}`;
      }
      lines.push(line);
    }

    for (const { type, have, need } of missing.essences) {
      lines.push(`${type} essence: have ${have}, need ${need}`);
    }

    for (const tool of missing.tools || []) {
      lines.push(`Tool (${toolDisplayReference(tool, recipe, this.recipeManager)}): missing`);
    }

    return lines.join('\n');
  }

  _buildStepRecipeView(recipe, step) {
    return {
      ...recipe,
      ingredientSets: step?.ingredientSets || recipe.ingredientSets || [],
      resultGroups: step?.resultGroups || recipe.resultGroups || [],
      outcomeRouting: step?.outcomeRouting || recipe.outcomeRouting || null,
      resultSelection: step?.resultSelection || recipe.resultSelection || null,
      // Merge step-level toolIds with recipe-level so the union flows to
      // RecipeManager.getToolsForSet via recipe.toolIds. getToolsForSet dedupes
      // by id, so recipe/step overlap resolves once.
      toolIds: [
        ...(Array.isArray(recipe?.toolIds) ? recipe.toolIds : []),
        ...(Array.isArray(step?.toolIds) ? step.toolIds : []),
      ],
    };
  }

  _getSalvageRunManager() {
    return this.salvageRunManager || game.fabricate?.getSalvageRunManager?.() || null;
  }

  async processPendingSalvageRuns(worldTime = Number(game.time?.worldTime || 0)) {
    const salvageRunManager = this._getSalvageRunManager();
    if (!salvageRunManager) return;

    await salvageRunManager.processWorldTime(worldTime, async (actor, run) => {
      try {
        await this.salvage(actor.uuid, run.craftingSystemId, run.componentId, {
          runId: run.id,
          skipTimeGate: true,
        });
      } catch (error) {
        console.error(`Fabricate | Failed to resume salvage run ${run.id}:`, error);
      }
    });
  }

  /**
   * Perform the salvage pipeline for a component.
   *
   * Resolves actor, system, and component from their IDs/UUIDs, then runs
   * the full pipeline: validate -> tool check -> salvage check -> failure policy ->
   * consume -> create results -> record run.
   *
   * THIS METHOD PERFORMS NO OWNERSHIP CHECK. (This block claimed one in the pipeline
   * for a long time; there has never been one — corrected by issue 675.) It resolves
   * `actorUuid` through `fromUuid` and mutates that actor's Items directly. The only
   * ownership gate is at the facade: `Fabricate#salvageComponent` takes an ACTOR ID
   * and resolves it through `_resolveCraftingSources` -> `_resolveCraftingActor`.
   * That is why no UI may plumb a uuid through to this parameter.
   *
   * @param {string} actorUuid - UUID of the actor performing salvage. NOT ownership
   *   checked here; see above.
   * @param {string} craftingSystemId - ID of the crafting system.
   * @param {string} componentId - ID of the component to salvage.
   * @param {Object} [options={}] - Optional overrides.
   * @param {boolean} [options.interactive] When true, the salvage check prompts the
   *   player with the confirm-roll dialog (optional situational modifier) and posts
   *   the roll to chat so Dice So Nice animates it. Defaults to false so automation
   *   and macros stay silent. A dismissed prompt returns
   *   `{ success: false, cancelled: true, results: null }` with zero mutation (no
   *   component consumed, no tool breakage) and discards a run created by this call.
   *   The player Inventory tab's Salvage panel passes true (issue 675).
   * @returns {Promise<{success: boolean, results: Item[]|null, message: string, salvageRun: object|null, cancelled?: boolean}>}
   */
  async salvage(actorUuid, craftingSystemId, componentId, options = {}) {
    const actor = await fromUuid(actorUuid);
    if (!actor) {
      return { success: false, results: null, message: 'Actor not found', salvageRun: null };
    }

    const systemManager = game.fabricate?.getCraftingSystemManager?.();
    const system = systemManager?.getSystem(craftingSystemId);
    if (!system) {
      return {
        success: false,
        results: null,
        message: `Crafting system "${craftingSystemId}" not found`,
        salvageRun: null,
      };
    }

    const managedItems = system.components || [];
    const component = managedItems.find((c) => c.id === componentId) || null;
    if (!component) {
      return {
        success: false,
        results: null,
        message: `Component "${componentId}" not found in system`,
        salvageRun: null,
      };
    }

    if (!system.features?.salvage) {
      return {
        success: false,
        results: null,
        message: 'Salvage feature is not enabled on this crafting system',
        salvageRun: null,
      };
    }
    if (!component.salvage?.enabled) {
      return {
        success: false,
        results: null,
        message: `Salvage is not enabled for component "${component.name || componentId}"`,
        salvageRun: null,
      };
    }

    // 4. Validate salvage configuration via ResolutionModeService
    const resolutionService =
      this.resolutionModeService || game.fabricate?.getResolutionModeService?.();
    if (resolutionService) {
      const validation = resolutionService.validateSalvage(component, system);
      if (!validation.valid) {
        return {
          success: false,
          results: null,
          message: `Invalid salvage configuration: ${validation.errors.join(', ')}`,
          salvageRun: null,
        };
      }
    }

    const salvageRunManager = this._getSalvageRunManager();
    let salvageRun = null;
    // Track whether THIS call created the salvage run (vs reused an existing one),
    // so a cancelled interactive salvage can discard its phantom run and net ZERO
    // run mutation — mirroring the crafting `createdThisCall` phantom-discard.
    let salvageRunCreatedThisCall = false;
    if (salvageRunManager) {
      salvageRun = options?.runId
        ? salvageRunManager.getActiveRun(actor, options.runId)
        : salvageRunManager.findActiveRunForComponent(actor, craftingSystemId, componentId);
    }

    if (options?.runId && !salvageRun && salvageRunManager) {
      return {
        success: false,
        results: null,
        message: 'Active salvage run not found',
        salvageRun: null,
      };
    }

    const ingredientQuantity = Number(component.salvage.ingredientQuantity) || 1;
    const componentItems = this._findComponentItems(actor, component, system);
    const totalAvailable = componentItems.reduce(
      (sum, item) => sum + (Number(item.system?.quantity) || 1),
      0
    );
    if (totalAvailable < ingredientQuantity) {
      if (salvageRunManager && salvageRun) {
        salvageRun = await salvageRunManager.completeRun(actor, salvageRun, 'failed', {
          failureReason: `Not enough "${component.name || componentId}" to salvage. Need ${ingredientQuantity}, have ${totalAvailable}`,
        });
      }
      return {
        success: false,
        results: null,
        message: `Not enough "${component.name || componentId}" to salvage. Need ${ingredientQuantity}, have ${totalAvailable}`,
        salvageRun,
      };
    }

    const syntheticRecipe = { craftingSystemId, components: managedItems };
    const salvageTools = this._resolveSalvageTools(system, component.salvage);
    const toolValidation = await this._validateTools([actor], syntheticRecipe, salvageTools);
    if (!toolValidation.valid) {
      if (salvageRunManager && salvageRun) {
        salvageRun = await salvageRunManager.completeRun(actor, salvageRun, 'failed', {
          failureReason: toolValidation.message,
        });
      }
      return { success: false, results: null, message: toolValidation.message, salvageRun };
    }

    const now = Number(game.time?.worldTime || 0);
    const timeRequirement = component.salvage?.timeRequirement || null;

    if (salvageRunManager && !salvageRun) {
      salvageRun = await salvageRunManager.createRun(actor, {
        actorUuid,
        craftingSystemId,
        componentId,
        componentName: component.name || componentId,
        status: 'inProgress',
        startedAt: now,
        usedTools: [],
        // CAPTURE the starting user's result order onto the run (issue 651 D2). This is
        // the ONLY settings read on the salvage path, and it happens once, here, at start.
        // A world-time-resumed salvage is driven by the synced `updateWorldTime` hook,
        // which fires on EVERY client with no owner filter — so whoever wins that race
        // executes the resume. Reading the order from the run instead of from settings is
        // what makes the executing user irrelevant, and makes that defect (F3)
        // structurally unreachable here rather than merely documented.
        //
        // `createRun` spreads `...runData` between its defaults and its re-asserted
        // authoritative fields — it is NOT an allowlist — and `_normalizeContainer` never
        // normalizes individual run records, so this field survives the persist/read
        // round-trip. (Counter-case to this codebase's usual "normalizers strip unknown
        // fields" rule.)
        // The order key is scoped per (systemId, componentId): component ids are NOT
        // globally unique (copy-import preserves them), so `salvage:<componentId>` alone
        // collided across systems (issue 766). Must match the store's write key exactly,
        // or the captured order silently reads empty.
        resultOrder: this.getPlayerResultOrder({
          scope: 'salvage',
          id: `${craftingSystemId}:${componentId}`,
        }),
      });
      salvageRunCreatedThisCall = true;
    }

    if (salvageRunManager && timeRequirement && !options?.skipTimeGate) {
      salvageRun = await salvageRunManager.markRunWaitingForTime(
        actor,
        salvageRun,
        timeRequirement
      );
      const canProceed = salvageRunManager.canProceedTimeGate(salvageRun, now);
      if (!canProceed) {
        const remaining = Math.max(
          0,
          Math.ceil(Number(salvageRun.timeGate?.availableAt || 0) - now)
        );
        return {
          success: true,
          results: null,
          message: `Salvage started for ${component.name || componentId} (${remaining}s remaining)`,
          salvageRun,
        };
      }
    }

    if (salvageRunManager && salvageRun) {
      salvageRun = await salvageRunManager.markRunInProgress(actor, salvageRun);
    }

    const checkResult = await this._runSalvageCraftingCheck(component, system, actor, {
      interactive: options?.interactive === true,
    });
    const failurePolicy = this._getSalvageFailureConsumptionPolicy(system);

    // A misconfigured required salvage check (routed/progressive with no authored
    // roll formula) is a GM-side system gap, not a rolled failure: abort with ZERO
    // mutation so the component is never consumed and no tools are broken. The
    // failure-consumption policy below applies only to genuine rolled failures.
    // Discard a run created by THIS call so a misconfigured abort leaves no orphaned
    // `inProgress` run — parity with the cancelled branch below and `craft()`'s
    // phantom-discard. A reused pre-existing run is left untouched.
    if (checkResult.misconfigured) {
      if (salvageRunManager && salvageRun && salvageRunCreatedThisCall) {
        await salvageRunManager.discardRun(actor, salvageRun.id);
      }
      return {
        success: false,
        results: null,
        message: checkResult.message,
        salvageRun: salvageRunCreatedThisCall ? null : salvageRun,
      };
    }

    // The player dismissed the interactive roll dialog: a user choice, not a
    // failure. Abort with ZERO mutation (no component consumption, no tool
    // breakage) before the failure/consumption paths below. Discard a run created
    // by THIS call so a cancel leaves no orphaned `inProgress` run — parity with
    // `craft()`'s phantom-discard. A reused pre-existing run is left untouched.
    if (checkResult.cancelled) {
      if (salvageRunManager && salvageRun && salvageRunCreatedThisCall) {
        await salvageRunManager.discardRun(actor, salvageRun.id);
      }
      return {
        success: false,
        cancelled: true,
        results: null,
        message: 'Salvage cancelled',
        salvageRun: salvageRunCreatedThisCall ? null : salvageRun,
      };
    }

    if (!checkResult.success) {
      let consumedOnFail = [];
      let usedTools = [];
      try {
        if (failurePolicy.consumeComponentOnFail) {
          consumedOnFail = await this._consumeComponentItems(
            actor,
            componentItems,
            ingredientQuantity
          );
        }
        if (failurePolicy.breakToolsOnFail) {
          // Salvage parity (issue 419): the FAILURE path breaks required tools only
          // when `breakToolsOnFail === true` (this gate), matching crafting.
          const salvageFailBreak = this._resolveSalvageBreakageDecision(system, checkResult);
          usedTools = await this._applyToolBreakage(syntheticRecipe, toolValidation.tools, {
            forceBreak: salvageFailBreak.forceBreak,
            authority: salvageFailBreak.authority,
            reason: salvageFailBreak.reason,
            triggerId: salvageFailBreak.triggerId,
          });
        }
      } catch (error) {
        console.error('Fabricate | Error during salvage failure-path consumption:', error);
      }

      if (salvageRunManager && salvageRun) {
        salvageRun = await salvageRunManager.completeRun(actor, salvageRun, 'failed', {
          consumedComponents: consumedOnFail.map(({ item, quantity }) => ({
            itemUuid: item.uuid,
            quantity,
          })),
          usedTools,
          createdResults: [],
          checkResult: {
            success: false,
            outcome: checkResult.outcome,
            value: checkResult.value,
            data: checkResult.data || {},
          },
          failureReason: checkResult.message || 'Salvage check failed',
        });
      }

      // Salvage chat parity (issue 675): crafting posts on failure too. Report the
      // source forfeited on failure (per the consumption policy) and any tools that
      // broke — merged into one "Consumed on Failure" section by the shared card.
      const forfeitedQuantity = consumedOnFail.reduce(
        (sum, { quantity }) => sum + (Number(quantity) || 0),
        0
      );
      await this._postSalvageChatMessage({
        success: false,
        actor,
        system,
        component,
        consumedQuantity: forfeitedQuantity,
        results: [],
        usedTools,
        failureReason: checkResult.message || 'Salvage check failed',
        rollValue: rollTotalForCard(checkResult),
      });

      return {
        success: false,
        results: null,
        message: checkResult.message || 'Salvage check failed',
        salvageRun,
      };
    }

    const resultGroups = this._resolveSalvageResultGroups(
      component,
      system,
      checkResult,
      salvageRun
    );
    const consumedItems = await this._consumeComponentItems(
      actor,
      componentItems,
      ingredientQuantity
    );
    // Salvage parity (issue 419): the SUCCESS path always applies breakage (no
    // `breakToolsOnFail` gate exists here), via the shared seam.
    const salvageSuccessBreak = this._resolveSalvageBreakageDecision(system, checkResult);
    const usedTools = await this._applyToolBreakage(syntheticRecipe, toolValidation.tools, {
      forceBreak: salvageSuccessBreak.forceBreak,
      authority: salvageSuccessBreak.authority,
      reason: salvageSuccessBreak.reason,
      triggerId: salvageSuccessBreak.triggerId,
    });

    const salvageRecipeView = this._buildSalvageRecipeView(component, system);
    const resultItems = [];
    // Track the awarding component id alongside each created item without
    // reshaping `resultItems` (it is returned as `results` below). Each `result`
    // carries its component id as `result.componentId` (legacy `result.systemItemId`),
    // the same accessor used by `_createSingleResult` and progressive award.
    const createdRecords = [];
    for (const group of resultGroups) {
      for (const result of group.results || []) {
        const created = await this._createSingleResult(
          actor,
          result,
          consumedItems,
          toolValidation.tools,
          salvageRecipeView,
          checkResult
        );
        if (created) {
          resultItems.push(created);
          createdRecords.push({
            item: created,
            componentId: result.componentId || result.systemItemId || null,
          });
        }
      }
    }

    if (salvageRunManager && salvageRun) {
      salvageRun = await salvageRunManager.completeRun(actor, salvageRun, 'succeeded', {
        consumedComponents: consumedItems.map(({ item, quantity }) => ({
          itemUuid: item.uuid,
          quantity,
        })),
        usedTools,
        createdResults: createdRecords.map(({ item, componentId }) => ({
          itemUuid: item.uuid,
          componentId,
          quantity: Number(item.system?.quantity || 1),
          // Capture name/img at award time (mirroring the crafting award record) so a
          // salvage record is self-describing in the Journal even if the item is later
          // deleted. Older records without these fall back to the componentId resolver.
          name: item.name ?? null,
          img: item.img ?? null,
        })),
        checkResult: {
          success: true,
          outcome: checkResult.outcome,
          value: checkResult.value,
          data: checkResult.data || {},
        },
        failureReason: null,
      });
    }

    // Salvage chat parity (issue 675): the same card crafting posts, reading as a
    // salvage analogue — the source broken down, the materials recovered, and any
    // tools that broke. Gated on the same `chatOutput` toggle inside the poster.
    const consumedQuantity = consumedItems.reduce(
      (sum, { quantity }) => sum + (Number(quantity) || 0),
      0
    );
    await this._postSalvageChatMessage({
      success: true,
      actor,
      system,
      component,
      consumedQuantity,
      results: resultItems,
      usedTools,
      failureReason: '',
      rollValue: rollTotalForCard(checkResult),
    });

    return {
      success: true,
      results: resultItems,
      message: `Successfully salvaged ${component.name || componentId}`,
      // The rolled total, threaded top-level so the player summary can read it even on
      // the RUNLESS path (no salvage run manager) where `salvageRun` is null. `null` for
      // a no-check simple salvage (nothing was rolled); a finite number otherwise.
      value: checkResult.value ?? null,
      salvageRun,
    };
  }

  /**
   * Find items on actor that match a managed component.
   * Resolves each owned item to the single component it IS through the shared,
   * list-aware, system-scoped resolver (durable `roles[systemId].componentId` /
   * legacy scalar / raw source-reference chain), keeping those that resolve to the
   * target component. When none resolve, falls back to a case-SENSITIVE exact-name
   * match — a compatibility path whose closure is deferred to issue 557.
   * @private
   */
  _findComponentItems(actor, component, system) {
    const items = [...actor.items];
    const components = Array.isArray(system?.components) ? system.components : [];
    if (
      component.registeredItemUuid ||
      component.originItemUuid ||
      component.aliasItemUuids?.length
    ) {
      const byUuid = items.filter((item) =>
        itemResolvesToComponent(item, component, components, system?.id)
      );
      if (byUuid.length > 0) return byUuid;
    }
    // Name fallback (issue 557). Shared, telemetry-bearing helper (issue 540); this
    // salvage path stays case-SENSITIVE (`item.name === component.name`), unlike the
    // three case-insensitive read/craft sites.
    if (component.name) {
      return items.filter((item) =>
        matchComponentByName(item, component, { caseSensitive: true, systemId: system?.id })
      );
    }
    return [];
  }

  /**
   * Consume a specific total quantity from component items on the actor.
   * Deletes items when fully consumed, reduces quantity otherwise.
   * Returns array of { item, quantity: consumed }.
   * @private
   */
  async _consumeComponentItems(actor, items, quantity) {
    const consumed = [];
    let remaining = quantity;

    for (const item of items) {
      if (remaining <= 0) break;
      const available = Number(item.system?.quantity) || 1;
      const toConsume = Math.min(available, remaining);
      consumed.push({ item, quantity: toConsume });
      remaining -= toConsume;
      await (toConsume >= available
        ? item.delete()
        : item.update({ 'system.quantity': available - toConsume }));
    }

    return consumed;
  }

  /**
   * Get the salvage failure consumption policy from the system.
   * Defaults: consumeComponentOnFail=true, breakToolsOnFail=false.
   * @private
   */
  _getSalvageFailureConsumptionPolicy(system) {
    const consumption = system?.salvageCraftingCheck?.consumption || {};
    return {
      consumeComponentOnFail: consumption.consumeComponentOnFail !== false,
      // Normalized systems carry `breakToolsOnFail`; tolerate the legacy key defensively.
      breakToolsOnFail:
        (consumption.breakToolsOnFail ?? consumption.consumeCatalystsOnFail) === true,
    };
  }

  /**
   * Resolve which salvage result groups to use based on mode and check result.
   *
   * @param {object} component
   * @param {object} system
   * @param {object|null} checkResult
   * @param {object|null} [salvageRun] The active run, carrying the result order captured
   *   at start (issue 651 D2). The order is read from HERE and never from settings.
   * @private
   */
  _resolveSalvageResultGroups(component, system, checkResult, salvageRun = null) {
    // Legacy salvage tokens are normalized to canonical values by the manager
    // (salvage token normalizer) and the 1.4.0 migration before reaching here.
    const mode = system?.salvageResolutionMode || 'simple';
    const allGroups = Array.isArray(component.salvage?.resultGroups)
      ? component.salvage.resultGroups
      : [];

    if (mode === 'simple') {
      return allGroups.slice(0, 1);
    }

    if (mode === 'routed') {
      const outcome = checkResult?.outcome == null ? null : String(checkResult.outcome);
      const routing = component.salvage?.outcomeRouting || {};
      const routedId = outcome ? routing[outcome] : null;
      if (!routedId) return [];
      return allGroups.filter((g) => g.id === routedId);
    }

    if (mode === 'progressive') {
      const group = allGroups[0];
      if (!group) return [];

      // Salvage normalizes the budget with `Number(value || 0)` (divergence 4) and
      // skips invalid-cost results (divergence 1: `invalidCost: 'skip'`). It does
      // NOT zero the budget after a `partial` tail award (divergence 2:
      // `zeroRemainingOnPartial: false`) — that divergence is latent because the
      // salvage return shape never exposes `remaining`; see #431.
      const authored = group.results || [];
      // Read the order from the RUN RECORD, never from settings (issue 651 D2). The run
      // carries the order it was started with, so the user executing a world-time resume
      // is irrelevant — that is the whole point of capturing it at start.
      //
      // RUNLESS INVARIANT: no run manager → no run → no captured order → AUTHORED ORDER.
      // There is deliberately NO settings fallback here. Adding one would look like a
      // harmless gap-fill and would quietly reintroduce the defect the capture exists to
      // close: the resume path would start reading the *executing* user's order again.
      const results =
        component.salvage?.allowPlayerResultReorder === false
          ? authored
          : applyPlayerResultOrder(authored, salvageRun?.resultOrder ?? null);

      const managedItems = system?.components || [];
      const { awarded } = resolveProgressiveAward({
        results,
        initialRemaining: Number(checkResult?.value || 0),
        costFor: (result) =>
          Number(
            managedItems.find((e) => e.id === (result.componentId || result.systemItemId))
              ?.difficulty
          ),
        awardMode: system?.salvageCraftingCheck?.progressive?.awardMode || 'equal',
        invalidCost: 'skip',
        zeroRemainingOnPartial: false,
      });

      // Progressive results are a quantity-less ordered list: the loop above charges a
      // result's difficulty ONCE and awards that entry ONCE, so the GM expresses "more of
      // X" by listing X again rather than via a count. Force `quantity: 1` so the grant
      // path (`_createResultItems` reads `result.quantity`) produces one item per awarded
      // entry — this MIRRORS `ResolutionModeService._resolveProgressive`, which has always
      // done the same for recipes. Salvage did not, so it handed the authored objects
      // through by identity and a world that authored `quantity: 2` was awarded 2 for one
      // entry's difficulty (issue 676). `quantity` remains in the stored model and the
      // normalizer still clamps it; forcing it here leaves the stored value inert, so no
      // migration is required.
      return [{ ...group, results: awarded.map((result) => ({ ...result, quantity: 1 })) }];
    }

    return allGroups;
  }

  /**
   * Resolve a component's salvage `toolIds` to library Tool objects from the
   * owning crafting system. Unknown ids are skipped (resolved to nothing) rather
   * than throwing. Ids are deduped.
   * @private
   * @param {object} system - the owning crafting system
   * @param {object} salvage - the component's salvage config
   * @returns {Array<object>} resolved library Tool objects
   */
  _resolveSalvageTools(system, salvage) {
    const ids = Array.isArray(salvage?.toolIds) ? salvage.toolIds : [];
    const library = Array.isArray(system?.tools) ? system.tools : [];
    const seen = new Set();
    const tools = [];
    for (const rawId of ids) {
      const id = String(rawId ?? '').trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const tool = library.find((entry) => entry?.id === id);
      if (tool) tools.push(tool);
    }
    return tools;
  }

  /**
   * Run the salvage crafting check for the active salvage resolution mode.
   *
   * A salvage check is usable only when its mode has an authored roll formula
   * (simple/routed/progressive). Routed maps the rolled total onto a named outcome
   * tier that `_resolveSalvageResultGroups` routes through
   * `component.salvage.outcomeRouting`. When the routed mode needs a check outcome
   * to route but no roll formula is configured, the attempt fails loudly; every
   * other mode with no usable formula is a no-op success.
   * @private
   */
  async _runSalvageCraftingCheck(component, system, actor, { interactive = false } = {}) {
    const check = system?.salvageCraftingCheck || {};
    const mode = system?.salvageResolutionMode || 'simple';

    if (mode === 'progressive' && check.progressive?.rollFormula) {
      return this._runSalvageProgressiveCheck(check.progressive, component, actor, { interactive });
    }
    if (mode === 'simple' && check.simple?.rollFormula) {
      return this._runSalvageSimpleCheck(check.simple, component, actor, { interactive });
    }
    if (mode === 'routed' && check.routed?.rollFormula) {
      return this._runSalvageRoutedCheck(check.routed, component, actor, { interactive });
    }

    // A salvage check is REQUIRED to produce an outcome in progressive mode and in
    // routed mode (the routed result-group routing keys off the outcome tier name).
    if (mode === 'progressive' || mode === 'routed') {
      return {
        success: false,
        misconfigured: true,
        outcome: null,
        value: null,
        data: {},
        message: `${mode} salvage mode requires a configured salvage check roll formula`,
      };
    }

    return { success: true, outcome: null, value: null, data: {} };
  }

  /**
   * Resolve the salvage check DC: the per-component override when set, else the
   * check sub-object's default DC (fallback 15).
   */
  _resolveSalvageDc(checkMode, component) {
    const override = component?.salvage?.dcOverride;
    if (Number.isFinite(override)) return Math.trunc(override);
    const dc = Number(checkMode?.dc);
    return Number.isFinite(dc) ? Math.trunc(dc) : 15;
  }

  /**
   * Salvage simple pass/fail check: compare the rolled total against the resolved DC
   * (per-component override ?? default), honouring per-die crits. Delegates the roll
   * to the shared {@link runFormulaPassFail}.
   */
  async _runSalvageSimpleCheck(simple, component, actor, { interactive = false } = {}) {
    const dc = this._resolveSalvageDc(simple, component);
    const result = await runFormulaPassFail({
      formula: simple.rollFormula,
      dc,
      thresholdMode: simple.thresholdMode,
      triggers: simple.checkBreakage?.triggers,
      actor,
      label: 'Salvage',
      rollOptions: buildInteractiveRollOptions({
        interactive,
        actor,
        name: component?.name,
        activity: 'Salvage',
        img: component?.img,
        dc,
      }),
    });
    return this._markEngineEvaluated(result);
  }

  /**
   * Salvage progressive check: the rolled total becomes the numeric `value` the
   * progressive salvage awarding spends against result difficulties. Delegates to the
   * shared {@link runFormulaProgressive}.
   */
  async _runSalvageProgressiveCheck(progressive, component, actor, { interactive = false } = {}) {
    const result = await runFormulaProgressive({
      formula: progressive.rollFormula,
      triggers: progressive.checkBreakage?.triggers,
      actor,
      label: 'Salvage',
      rollOptions: buildInteractiveRollOptions({
        interactive,
        actor,
        name: component?.name,
        activity: 'Salvage',
        img: component?.img,
      }),
    });
    return this._markEngineEvaluated(result);
  }

  /**
   * Salvage routed check: roll the routed formula and map its total onto one of the
   * configured outcome tiers (relative DC deltas or fixed value ranges). The matched
   * tier's NAME becomes the `outcome` that {@link _resolveSalvageResultGroups} feeds
   * through `component.salvage.outcomeRouting` to pick a result group. The base DC is
   * the resolved salvage DC (per-component override ?? routed default), so a per-
   * component `dcOverride` shifts every relative threshold. Delegates to the shared
   * {@link runFormulaRouted}.
   */
  async _runSalvageRoutedCheck(routed, component, actor, { interactive = false } = {}) {
    const dc = this._resolveSalvageDc(routed, component);
    const result = await runFormulaRouted({
      formula: routed.rollFormula,
      dc,
      thresholdMode: routed.thresholdMode,
      type: routed.type,
      relativeOutcomes: routed.relativeOutcomes,
      fixedOutcomes: routed.fixedOutcomes,
      triggers: routed.checkBreakage?.triggers,
      actor,
      label: 'Salvage',
      // Clamp a below-lowest total to the closest tier (mirrors crafting); a per-
      // component dcOverride never opens a null-outcome dead zone.
      clampToNearest: true,
      rollOptions: buildInteractiveRollOptions({
        interactive,
        actor,
        name: component?.name,
        activity: 'Salvage',
        img: component?.img,
        dc,
      }),
    });
    return this._markEngineEvaluated(result);
  }

  /**
   * Build a minimal recipe-like view from a component's salvage data.
   * Used as context for _createSingleResult.
   * @private
   */
  _buildSalvageRecipeView(component, system) {
    return {
      id: component.id,
      name: component.name,
      craftingSystemId: system?.id,
      resultGroups: component.salvage?.resultGroups || [],
      outcomeRouting: component.salvage?.outcomeRouting || null,
      ingredientSets: [],
      transferEffects: false,
      toJSON() {
        return { id: this.id, name: this.name };
      },
    };
  }
}
