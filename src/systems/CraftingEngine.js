import { getFabricateFlag, setFabricateFlag, stampItemDataRoleIdentity } from '../config/flags.js';
import {
  isToolBroken,
  resolvePresentComponentIds,
  resolvePresentToolIds,
} from '../gatheringToolRuntime.js';
import { Tool } from '../models/Tool.js';
import {
  TOOL_IMAGE_SENTINEL,
  resolveToolDisplayImage,
  resolveToolDisplayName,
} from '../models/toolDisplay.js';
import {
  applyToolUsageAndBreakage,
  createToolReplacementCreator,
  evaluateCheckBreakage,
} from '../toolBreakageRuntime.js';
import { buildInteractiveRollOptions } from '../ui/svelte/apps/crafting/rollPrompt.js';
import { resolveRecipeImage } from '../ui/svelte/util/craftingImageDefaults.js';
import { canonicalSignatureKey } from '../utils/alchemySignatureKey.js';
import { resolveAlchemySubmissionComponent } from '../utils/alchemySubmissions.js';
import { planComplications, publicComplications } from '../utils/complicationPlan.js';
import { matchComponentByName } from '../utils/componentNameMatch.js';
import { stripRetiredModifierPlaceholder } from '../utils/craftingCheckExpression.js';
import { findById, getDefinitionIndex } from '../utils/definitionIndex.js';
import {
  accumulateSubmissionEssences,
  findMatchingComponent,
  resolveItemEssences,
} from '../utils/essenceResolver.js';
import { activityPermitsFailureResults } from '../utils/failureResultPolicy.js';
import { MacroExecutor } from '../utils/MacroExecutor.js';
import { resolveProgressiveAward } from '../utils/progressiveAward.js';
import { applyPlayerResultOrder } from '../utils/progressiveResultOrder.js';
import { itemResolvesToComponent } from '../utils/sourceUuid.js';

import { evaluatePrerequisite } from './characterPrerequisites.js';
import {
  buildCheckModifierChoice,
  buildCheckModifierContext,
  makeRollDataExpressionResolver,
  resolveActiveCraftingCheckFormula,
  resolveModifierPolicy,
} from './checkModifierResolver.js';
import { runFormulaPassFail, runFormulaProgressive, runFormulaRouted } from './checkRoll.js';
import { fireComplications } from './complicationRuntime.js';
import {
  awardedQuantityOf,
  createOrStackComponentItem,
  tagAwardedQuantity,
} from './componentStacking.js';
import { buildCraftingChatContent } from './CraftingChatCard.js';
import {
  buildCurrencyAffordProbe,
  checkCurrencySpends,
  refundCurrencySpends,
  spendCurrencySpends,
} from './currencyAffordance.js';
import {
  hasStackQuantity,
  readStackQuantity,
  readStoredStackQuantity,
  setStackQuantity,
  updateStackQuantity,
} from './itemStackQuantity.js';
import { planFirstFitDrain, pooledItemOrder } from './pooledAllocation.js';
import { resolveCheckTriggerMatches } from './ResolutionModeService.js';
import { buildSalvageChatContent } from './SalvageChatCard.js';
import { resolveSalvageCheck } from './salvageCheckUsability.js';
import {
  resolvedComponentsFor,
  resolvedEssencesFor,
  resolvedToolsFor,
} from './scopedEntityReads.js';
import { SignatureValidator, signatureDominates } from './SignatureValidator.js';
import { buildStepRecipeView } from './stepRecipeView.js';
import { effectiveToolBreakageAuthority } from './toolBreakageAuthority.js';
import {
  appendToolBonusTerms,
  composeToolBonusTerms,
  evaluateToolCheckContribution,
} from './toolCheckBonus.js';

/**
 * Resolve the winning alchemy match from ALL sets that matched a submission by
 * picking the unique MOST-SPECIFIC set (issue 774). Each candidate carries its
 * `{ recipe, ingredientSetId, signature, groupOptions }`; a set A is more specific
 * than B when it {@link signatureDominates} B (its required-group structure is a
 * proper superset). The winner is the unique maximum of that partial order — the
 * single candidate no other candidate dominates. When no unique maximum exists
 * (two incomparable co-matching sets, e.g. siblings both matched by an ambiguous
 * over-submission), this FAILS SAFE to no-match so the caller fizzles rather than
 * silently brewing one by iteration order. This is the runtime counterpart of the
 * enable-time inseparability guard (`SignatureValidator.signaturesOverlap`); both
 * consume the SAME `signatureDominates` predicate so they can never disagree.
 *
 * Pure (reads no `this`) and exported so a call-site test can pin that reverting
 * to a first-match short-circuit changes the result.
 *
 * @param {Array<{recipe: object, ingredientSetId: string, signature: Set<string>[], groupOptions: object[][]}>} candidates
 * @returns {{ matched: true, recipe: object, ingredientSetId: string } | { matched: false }}
 */
export function resolveMostSpecificSignatureMatch(candidates) {
  if (!Array.isArray(candidates) || candidates.length === 0) return { matched: false };
  const pick = (candidate) => ({
    matched: true,
    recipe: candidate.recipe,
    ingredientSetId: candidate.ingredientSetId,
  });
  if (candidates.length === 1) return pick(candidates[0]);

  // The maximal candidates: those no other candidate strictly dominates. With a
  // transitive domination relation, exactly one maximal element IS the unique
  // maximum (the greatest); two or more means an incomparable tie → fail safe.
  const maximal = candidates.filter((candidate) =>
    candidates.every((other) => other === candidate || !signatureDominates(other, candidate))
  );
  return maximal.length === 1 ? pick(maximal[0]) : { matched: false };
}

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
  const componentId = tool?.componentId;
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
 * Realized routed tier-step evidence for result chat, or null when the roll's tier
 * was never moved. `runFormulaRouted` emits `data.tierStepApplied` only on an actual
 * tier change (issue 975), so an absent key is the "nothing moved" case and the card
 * renders no note.
 */
function tierStepForCard(checkResult) {
  return checkResult?.data?.tierStepApplied ?? null;
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
 * Map one CRAFTED result document to the persisted run-record `createdResults` shape.
 *
 * ONE shape, THREE writers (issue 1098): the success path, the immediate failure branch
 * and the timed failure recorder. The success path has always written this literal; the
 * two failure writers are new and write THE SAME SHAPE through this mapper rather than a
 * lookalike, because the record lands in the actor's Fabricate run-container flag and a
 * failure run whose `createdResults` disagreed with the items on the actor would be a
 * durable contradiction — the Journal history reporting an empty award beside real loot.
 *
 * @param {object} item the created Item document
 * @param {object} craftingActor the actor it was created on
 * @returns {{actorUuid: string, itemUuid: string, quantity: number, name: string|null, img: string|null}}
 */
function craftedResultRecord(item, craftingActor) {
  return {
    actorUuid: craftingActor.uuid,
    itemUuid: item.uuid,
    quantity: awardedQuantityOf(item),
    name: item.name ?? null,
    img: item.img ?? null,
  };
}

/**
 * Map one salvage award record to the persisted run-record `createdResults` shape.
 *
 * ONE shape, TWO branches (issue 1098). The success branch has always written this; the
 * new failure branch writes THE SAME SHAPE rather than a lookalike, because the record
 * lands in the actor's Fabricate run-container flag and a failure run whose
 * `createdResults` disagreed with the items actually on the actor would be a durable
 * contradiction — the Journal history would report an empty award beside real loot.
 *
 * Name/img are captured at award time (mirroring the crafting award record) so a salvage
 * record is self-describing in the Journal even if the item is later deleted. Older
 * records without them fall back to the componentId resolver.
 *
 * @param {{item: object, componentId: string|null}} record
 * @returns {{itemUuid: string, componentId: string|null, quantity: number, name: string|null, img: string|null}}
 */
function salvageCreatedResultRecord({ item, componentId }) {
  return {
    itemUuid: item.uuid,
    componentId,
    quantity: awardedQuantityOf(item),
    name: item.name ?? null,
    img: item.img ?? null,
  };
}

/**
 * Narrow a resolution's fired complications to the four keys the SALVAGE RUN RECORD
 * stores (issue 1286).
 *
 * ## Redaction happens HERE, at the write, and never at the read
 *
 * The container is `flags.fabricate.salvageRuns` on the ACTOR — a document replicated to
 * every client with permission on it, which for a player character means the owning
 * player. So the audience filter runs before the value is persisted, through
 * `publicComplications`, and it is keyed on the AUDIENCE rather than on the acting user's
 * role: a GM salvaging on a player's behalf must write exactly what a player salvaging
 * for themselves would, or a `gmOnly` complication lands in a document that player can
 * read and the whole GM-side socket path is defeated on the one path nobody tests.
 *
 * `publicComplications` returns three more keys than this (the authored strings the chat
 * card renders); its contract permits a persisting caller to NARROW and forbids widening,
 * and this narrows: the run record is a durable actor flag, and the player strip that
 * reads it re-resolves the prose from the system record it already holds.
 *
 * `resultId` is required and is not redundant with `componentId`. A complication fires per
 * RESULT ENTRY, so a component staged five times can contribute five records that differ in
 * nothing but `resultId`; a `componentId`-only record would collapse them into one and badge
 * every occurrence of that component or none of them. `buckets` is a list for the persisted
 * shape's sake only — a firing belongs to ONE entry, so it now always holds that entry's one
 * bucket, and a record written before the per-entry rule may still hold several.
 *
 * @param {Array<object>} fired {@link fireComplications}'s `fired` list, unredacted.
 * @returns {Array<{resultId: ?string, componentId: ?string, complicationId: ?string,
 *   buckets: Array<string>}>}
 */
function salvageRunComplicationRecords(fired) {
  return publicComplications(fired).map(({ resultId, componentId, complicationId, buckets }) => ({
    resultId,
    componentId,
    complicationId,
    buckets,
  }));
}

/**
 * Return the concrete owned Item documents selected for ingredient consumption.
 * Tool validation excludes these documents so a single physical Item cannot be
 * consumed and subsequently mutated as a reusable Tool in the same attempt.
 *
 * @param {object|null} selection
 * @returns {Set<object>}
 */
function selectedIngredientItems(selection) {
  return new Set(
    (Array.isArray(selection?.plan) ? selection.plan : [])
      .map((entry) => entry?.item)
      .filter(Boolean)
  );
}

/**
 * Resolve the still-live inventory documents named by persisted Item UUIDs.
 * Timed FINISH uses these concrete documents as Tool exclusions because a
 * partially consumed stack remains in inventory after START.
 *
 * @param {Actor[]} actors
 * @param {Iterable<string>} itemUuids
 * @returns {Set<Item>}
 */
function resolveLiveInventoryItemsByUuid(actors, itemUuids) {
  const uuidSet = itemUuids instanceof Set ? itemUuids : new Set(itemUuids);
  return new Set(
    (Array.isArray(actors) ? actors : [])
      .flatMap((actor) => [...(actor?.items ?? [])])
      .filter((item) => item?.uuid && uuidSet.has(item.uuid))
  );
}

/**
 * Return the concrete owned Item documents that a quantity-based consumption
 * plan will touch, in the same order used by `_consumeComponentItems`.
 *
 * @param {object[]} items
 * @param {number} quantity
 * @returns {Set<object>}
 */
function selectedQuantityItems(items, quantity) {
  const selected = new Set();
  let remaining = Number(quantity) || 0;
  for (const item of Array.isArray(items) ? items : []) {
    if (remaining <= 0) break;
    selected.add(item);
    // Under-reading here OVER-selects items into the plan that the delete branch then
    // destroys one by one, so this is a routed site even though it never writes.
    remaining -= readStackQuantity(item);
  }
  return selected;
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
 * Re-shape a progressive resolution's published `meta` into the award report
 * {@link planComplications} classifies stages against (issue 1286).
 *
 * It is a RENAME and nothing more. `ResolutionModeService` publishes id lists because
 * `meta` is a wire-ish record; the planner accepts either a result object or a bare id
 * everywhere, so the ids travel through untouched. Nothing is re-derived here — the break
 * index is not recoverable from `awarded` + `remaining` once a skipped stage sits between
 * the last award and the halt, which is precisely why the award loop reports it.
 *
 * @param {?object} meta the five flat keys `_resolveProgressiveResultGroups` publishes
 * @returns {{awarded: Array<string>, remaining: number, partialResult: string|null,
 *   haltedResult: string|null, skippedResults: Array<string>}}
 */
function awardFromResolutionMeta(meta) {
  return {
    awarded: Array.isArray(meta?.awardedResultIds) ? meta.awardedResultIds : [],
    remaining: Number(meta?.remaining ?? 0),
    partialResult: meta?.partialResultId ?? null,
    haltedResult: meta?.haltedResultId ?? null,
    skippedResults: Array.isArray(meta?.skippedResultIds) ? meta.skippedResultIds : [],
  };
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
    {
      getPlayerResultOrder = () => null,
      getCraftingSystem = () => null,
      resolveItemUuid = async () => null,
      // The world currency configuration (issue 1278). Optional: when absent, the shared
      // affordance resolver falls back to the `game.fabricate` global, which keeps every
      // existing construction site — production and fixture alike — working unchanged.
      currencyConfigStore = null,
    } = {}
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
    this.currencyConfigStore = currencyConfigStore;
    this.getPlayerResultOrder = getPlayerResultOrder;
    this.getCraftingSystem = getCraftingSystem;
    this.resolveItemUuid = resolveItemUuid;
    // Declared here, installed post-construction (issue 1286). See
    // `installComplicationDelivery` for why it is not a ninth parameter, and
    // `_complicationWriter` for the ambient fallback that makes an un-installed engine
    // still deliver.
    this.complicationDeliveryWriter = null;
  }

  /**
   * Install the complication delivery writer (issue 1286).
   *
   * A POST-CONSTRUCTION seam on the `GatheringEngine#installBlindRunRelay` precedent,
   * rather than a ninth constructor parameter: this constructor is already an
   * eight-argument list with an options bag, and every existing `new CraftingEngine(...)`
   * site — production and fixture alike — must keep working untouched.
   *
   * An engine that never calls this still fires complications: {@link _complicationWriter}
   * falls back to `game.fabricate.complicationDeliveryWriter`, the same
   * `this.x || game.fabricate?.getX?.()` idiom the resolution service, the run manager and
   * the visibility service already use here. An engine with NEITHER fires the plan and
   * rolls the visible effect rolls, then drops the GM requests — the award, the run record
   * and the chat card are untouched, because a complication is strictly downstream of a
   * committed award and must never be able to cost a craft its results.
   *
   * @param {object} deps
   * @param {?{deliver: (args: object) => boolean}} [deps.writer] The delivery writer
   *   composed in `main.js`. It owns the emit AND mints the resolution id; this engine
   *   deliberately does neither, so a complication cannot reach a socket from here.
   * @returns {CraftingEngine} this, for chaining at the bootstrap site.
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
    return this.complicationDeliveryWriter || game.fabricate?.complicationDeliveryWriter || null;
  }

  /**
   * FIRE the component complications a committed progressive award earned — the one
   * guarded seam all three engine call sites route through (issue 1286).
   *
   * ## Where this is called from, and why never anywhere else
   *
   * Exactly three sites, each AFTER the award is committed and BEFORE the chat card is
   * posted: the immediate craft path, the timed craft FINISH path, and salvage. Never
   * from `ResolutionModeService`, which resolves up to three times per craft and resolves
   * once BEFORE any consumption — see the do-not-fire-here note on
   * `_resolveProgressiveResultGroups`.
   *
   * Once per STEP resolution, not once per `craft()` call: a collapsed chain recurses into
   * `craft()` per step, so a three-step chain fires three times. That is correct — three
   * steps are three progressive resolutions with three separate awards.
   *
   * ## The whole-call guard
   *
   * This is guard 3 of 3 (per-complication and per-effect guards live inside
   * {@link fireComplications}, which resolves rather than rejects). It is kept here anyway
   * because a complication is strictly downstream of a committed award: the ingredients
   * are spent, the items exist, the run record is written. Nothing in this method may be
   * able to turn that into a thrown craft, so everything from the plan to the delivery is
   * inside the `try` — including the ordering read and the trigger evaluation.
   *
   * The delivery writer OWNS the emit and mints the resolution id. This engine never
   * touches `game.socket` and never mints, so the plan carries a null `resolutionId` and
   * the writer stamps the real one once per `deliver` call — which is once per resolution.
   *
   * @private
   * @param {object} options
   * @param {'crafting'|'salvage'} options.activity which activity resolved
   * @param {?object} options.actor the acting actor, whose roll data resolves the
   *   condition roll and its comparand
   * @param {?string} options.craftingSystemId addressing for the GM-side re-read
   * @param {Array<{resultId: ?string, componentId: ?string, component: ?object}>}
   *   options.stages the ORDERED stage occurrences the award ran over, in fire order
   * @param {object} options.award the award report, via {@link awardFromResolutionMeta} or
   *   `resolveProgressiveAward` verbatim
   * @param {?object} options.checkBreakage the ACTIVE check's breakage block, for the
   *   `when.checkTrigger` clause
   * @param {?object} options.checkResult the resolved check result
   * @param {boolean} [options.deliver=true] Whether to hand the GM requests to the
   *   delivery writer HERE. A batching caller passes `false` and emits the collected
   *   requests itself — the one case is bulk salvage, whose rows are one resolution each
   *   but must reach the GM batched — one message per addressed (system, actor) pair, so a
   *   run is bounded by the 25-row selection cap rather than by its row count. The GM-side
   *   rate limit in `complicationSocket.js` is derived from that bound, so a per-row emit
   *   would silently drop the tail of a long run. The firing itself still happens per row;
   *   only the emit is deferred.
   * @returns {Promise<?object>} `fireComplications`'s return, or null when nothing ran.
   */
  async _fireComponentComplications({
    activity,
    actor,
    craftingSystemId,
    stages,
    award,
    checkBreakage,
    checkResult,
    deliver = true,
  }) {
    try {
      if (!Array.isArray(stages) || stages.length === 0) return null;
      const plan = planComplications({
        activity,
        stages,
        award,
        ...resolveCheckTriggerMatches(checkBreakage, checkResult),
      });
      const fired = await fireComplications({
        plan,
        actor,
        context: {
          craftingSystemId: craftingSystemId ?? null,
          actorUuid: actor?.uuid ?? null,
          speaker: globalThis.ChatMessage?.getSpeaker?.({ actor }),
        },
      });
      if (deliver && fired.gmRequests.length > 0) {
        this._complicationWriter()?.deliver({
          craftingSystemId: craftingSystemId ?? null,
          actorUuid: actor?.uuid ?? null,
          complications: fired.gmRequests,
        });
      }
      return fired;
    } catch (error) {
      // The award is already committed. A complication that cannot fire is a lost
      // narrative beat; a thrown craft here would be lost items.
      console.error('Fabricate | Component complications failed to fire', error);
      return null;
    }
  }

  /**
   * The crafting call site's adapter: read the ordered stage list from the resolution
   * service and the award from the resolution it just published (issue 1286).
   *
   * Both crafting paths (immediate and timed FINISH) call this with the `resolutionMeta`
   * their own `_createResultItems` returned, so the classification is against the award
   * that actually happened rather than a re-resolution.
   *
   * The `awardedResultIds` guard is what keeps a non-progressive resolution out: with no
   * award report every stage would classify as `unreached` and a `stageMissed`
   * complication would fire on a craft that awarded everything.
   *
   * There is deliberately NO site on the crafting failure-award path
   * (`_awardFailureResults`): `_resolveProgressiveResultGroups` publishes no
   * `disposition`, so `_isFailureAwardDisposition(undefined)` is false and progressive
   * awards nothing there.
   *
   * @private
   */
  async _fireCraftComplications({ actor, recipe, step, checkResult, resolutionMeta }) {
    const resolutionService =
      this.resolutionModeService || game.fabricate?.getResolutionModeService?.();
    if (resolutionService?.getMode?.(recipe) !== 'progressive') return null;
    if (!Array.isArray(resolutionMeta?.awardedResultIds)) return null;
    const system = this._getRecipeSystem(recipe);
    return this._fireComponentComplications({
      activity: 'crafting',
      actor,
      craftingSystemId: recipe?.craftingSystemId ?? null,
      stages: resolutionService.progressiveStageOccurrences?.({ recipe, step }) ?? [],
      award: awardFromResolutionMeta(resolutionMeta),
      checkBreakage: this._resolveCraftingCheckBreakage(system, recipe),
      checkResult,
    });
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
      getCurrencyConfig: () => this.currencyConfigStore?.get(),
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
   * Does this resolution `meta.disposition` identify an authored FAILURE output?
   *
   * THE FAILURE AWARD IS AN ALLOWLIST, NEVER A FALL-THROUGH (issue 1098), and this is the
   * crafting analogue of the by-ROLE-never-by-index rule the salvage failure branch
   * follows. Resolution reports what it selected and WHY; only the two dispositions that
   * mean "this is the failure output" may be produced on a failed check.
   *
   * The trap this closes is live rather than theoretical. Under `routedByCheck` a step
   * with exactly ONE result group takes the single-group exemption, which was written for
   * the success path and returns that group with `disposition: 'success'` for any
   * non-keyword outcome — including the `null` outcome a failed check carries. Producing
   * on anything but this allowlist therefore hands a failed craft its full SUCCESS output.
   * `routedByIngredients` is excluded for the same reason: it routes by the chosen
   * ingredient set and reports no disposition at all, so a failed craft would award the
   * set's normal result.
   *
   *  - `'fail'` — the reserved `role: 'failure'` group of `simple` / alchemy-`simple`,
   *    selected BY ROLE by `_resolveSimpleResultGroups` (which never indexes), and the
   *    empty-groups reading a recipe authoring no failure output produces.
   *  - `'failure'` — the group a `routedByCheck` recipe assigned to a failure-marked
   *    outcome tier, returned by `_routeByTierAssignment` only where the policy permits.
   *
   * @param {string|null|undefined} disposition
   * @returns {boolean}
   * @private
   */
  _isFailureAwardDisposition(disposition) {
    return ['fail', 'failure'].includes(disposition);
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
   * @param {{stepId: string|null, ingredientSetId: string|null,
   *   allocation: Record<string, number>}|null} [options.ingredientEssenceAllocation]
   *   The player's funding for the set's shared essence block (issue 917), SCOPED to
   *   the step and set it was computed against. Dropped wholesale — never clamped
   *   into the wrong step — when either id disagrees with what this call resolved.
   *   There is no timed snapshot for it: the source Items are deleted at START, so an
   *   item-keyed map is stale by the time FINISH resumes, and FINISH never re-resolves
   *   ingredients.
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
    // The player's essence-block funding (issue 917). SCOPED, not a bare map: a
    // `{ stepId, ingredientSetId, allocation }` payload the engine drops unless it
    // names the step AND set this call actually resolved. Item uuids are not
    // step-scoped, so a step-1 allocation arriving while the run has advanced to
    // step 2 would actively steer that step's consumption. The check must happen
    // HERE and not in the UI or the facade: the run's step index can move between
    // the `$derived` that built the payload and the click that sends it — a time
    // gate maturing on `updateWorldTime`, or another owner calling
    // `advanceCraftingRun`. See {@link _scopedEssenceAllocation}.
    const ingredientEssenceAllocation =
      options?.ingredientEssenceAllocation &&
      typeof options.ingredientEssenceAllocation === 'object'
        ? options.ingredientEssenceAllocation
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
            ingredientEssenceAllocation,
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
      const essenceAllocation = this._scopedEssenceAllocation(
        ingredientEssenceAllocation,
        step,
        ingredientSet
      );
      const craftSelection = this._resolveCraftSelection(
        componentSourceActors,
        ingredientSet,
        executionRecipe,
        craftingActor,
        resolveComponent,
        ingredientOptionOverrides,
        essenceAllocation
      );
      const shortAllocation = this._allocationShortfallMessage(
        essenceAllocation,
        craftSelection,
        executionRecipe
      );
      if (shortAllocation) {
        return { success: false, results: null, message: shortAllocation };
      }
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
        presentTools,
        craftingActor,
        { excludedItems: selectedIngredientItems(craftSelection) }
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
        {
          interactive: options?.interactive === true,
          toolItems: toolValidation.tools,
        }
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
            // The single shared `evaluateCheckBreakage` seam applies failure-path
            // breakage too, gated by `breakToolsOnFail`. Only `checkDriven` lets the
            // active check's `checkBreakage` triggers force breakage. Under
            // `toolSpecific`, the matched Tools' own retained breakage modes decide.
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
        // THE FAILURE AWARD (issue 1098). It runs AFTER consumption and breakage, so the
        // essence snapshot the reserved output transfers from is the one the attempt
        // actually spent — and so a failure that awards nothing is unchanged in every
        // observable way.
        const failureResults = await this._produceCraftingFailureResults({
          craftingActor,
          executionRecipe,
          step,
          ingredientSet,
          consumedItems: consumedOnFail,
          toolItems: toolValidation.tools,
          checkResult,
          resultGroupId: options?.resultGroupId || null,
        });
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
              // In the SUCCESS branch's shape, through the same mapper: the record lands
              // in the actor's run-container flag, so an empty list beside real items is a
              // durable contradiction rather than a cosmetic gap.
              createdResults: failureResults.map((item) =>
                craftedResultRecord(item, craftingActor)
              ),
            }
          );
        }
        await this._postCraftChatMessage({
          success: false,
          craftingActor,
          recipe,
          consumedIngredients: consumedOnFail,
          tools: usedToolPairs,
          // The card's failure branch renders these under its own results section; an
          // empty list leaves every existing failure card byte-for-byte unchanged.
          createdResults: failureResults,
          failureReason: checkResult.message || 'Crafting check failed',
          rollValue: rollTotalForCard(checkResult),
          tierStep: tierStepForCard(checkResult),
        });
        return {
          success: false,
          // `null` when nothing was awarded — what every existing caller reads as "a
          // failed craft produced nothing". The discriminator is attached only when
          // something WAS produced, so today's failure return is unchanged.
          results: failureResults.length > 0 ? failureResults : null,
          message: checkResult.message || 'Crafting check failed',
          ...(failureResults.length > 0 && { disposition: 'produced-on-failure' }),
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
          tierStep: tierStepForCard(checkResult),
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
            tierStep: tierStepForCard(checkResult),
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
      // single shared `evaluateCheckBreakage` seam. Under `toolSpecific`, each
      // matched Tool's retained breakage mode decides. Under `checkDriven`, the
      // active check's `checkBreakage` triggers decide whether each participating
      // required Tool breaks. The SUCCESS path always applies breakage. It has no
      // `breakToolsOnFail` gate.
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
      const { items: resultItems, resolutionMeta } = await this._createResultItems(
        craftingActor,
        executionRecipe,
        step,
        ingredientSet,
        consumedItems,
        toolValidation.tools,
        checkResult,
        options?.resultGroupId || null,
        { resolveComponent }
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
          createdResults: (resultItems || []).map((item) =>
            craftedResultRecord(item, craftingActor)
          ),
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

      // Component complications (issue 1286): AFTER the award is committed — the items
      // exist and the run record is written — and BEFORE the card is posted, so the card
      // can report what fired. Progressive resolutions only; every other mode returns
      // without planning anything.
      const firedComplications = await this._fireCraftComplications({
        actor: craftingActor,
        recipe: executionRecipe,
        step,
        checkResult,
        resolutionMeta,
      });

      await this._postCraftChatMessage({
        success: true,
        craftingActor,
        recipe,
        consumedIngredients: consumedItems,
        tools: toolValidation.tools,
        createdResults: resultItems,
        rollValue: rollTotalForCard(checkResult),
        tierStep: tierStepForCard(checkResult),
        // Redacted inside the poster, which holds the system the component names resolve
        // against. Null for every non-progressive craft (issue 1286).
        firedComplications: firedComplications?.fired ?? null,
      });

      // Collapsed chain (issue 710): a non-final step just succeeded and the run is
      // still active, so continue the atomic action immediately by executing the
      // next step in the SAME craft call — no between-step waiting. Recurse with the
      // run id (so the next step resolves against the same run) and a NULL ingredient
      // set / cleared per-step overrides so each later step auto-resolves its own
      // satisfiable set rather than reusing the step-0 selection. The returned result
      // is the FINAL step's — the chain's effective outcome.
      //
      // `ingredientEssenceAllocation` MUST be nulled here for the same reason
      // (issue 917), and the entry-time step scoping does NOT cover it: the chain
      // enters at step 0, so a step-0-scoped allocation passes that check and would
      // then be spread into every later step's call by `...options`.
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
          ingredientEssenceAllocation: null,
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
   * `ingredientEssenceAllocation` is an explicit named parameter (like
   * `ingredientOptionOverrides`), NOT an `options` passthrough, because it is applied
   * exactly once — HERE, at START, where consumption happens. It is deliberately NOT
   * snapshotted onto `preparedConsumption`: the source Items are deleted before the
   * gate is armed, so an item-keyed map is stale by the time FINISH resumes, and
   * FINISH never re-resolves ingredients anyway.
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
    ingredientEssenceAllocation = null,
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
    const essenceAllocation = this._scopedEssenceAllocation(
      ingredientEssenceAllocation,
      step,
      ingredientSet
    );
    const craftSelection = this._resolveCraftSelection(
      componentSourceActors,
      ingredientSet,
      executionRecipe,
      craftingActor,
      resolveComponent,
      ingredientOptionOverrides,
      essenceAllocation
    );
    const shortAllocation = this._allocationShortfallMessage(
      essenceAllocation,
      craftSelection,
      executionRecipe
    );
    if (shortAllocation) return abort(shortAllocation);
    const currencySpends = craftSelection.currencySpends || [];

    const toolsForSet =
      typeof this.recipeManager.getToolsForSet === 'function'
        ? this.recipeManager.getToolsForSet(executionRecipe, ingredientSet)
        : [];
    const toolValidation = await this._validateTools(
      componentSourceActors,
      executionRecipe,
      toolsForSet,
      presentTools,
      craftingActor,
      { excludedItems: selectedIngredientItems(craftSelection) }
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
    // The deduction deliberately does not abort the craft on failure (clause 4 forbids
    // both aborting and rolling back), so the run must record what SETTLED rather than
    // what was planned — otherwise a cancel refunds currency the actor never paid.
    const currencySettlement = await this._spendCraftCurrency(
      craftingActor,
      executionRecipe,
      currencySpends
    );
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
    // Enabled-ness is snapshotted HERE, at START, alongside the quantities (issue 1036):
    // evaluating the behaviour gate at FINISH would let a mid-run GM toggle change the
    // outcome of a craft whose inputs are already gone.
    const essenceEnabled = this._snapshotEssenceEnabled(
      resolvedEssences,
      this._getRecipeSystem(executionRecipe)
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
      currencySpends: currencySettlement.settledSpends,
      resolvedEssences,
      essenceEnabled,
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
        // A START is a SUCCESSFUL arming, not a failure: inputs are secured and the
        // run is live. `success` stays false because nothing was produced, so the
        // disposition is what tells a caller the two apart (issue 966). Without it
        // the alchemy workbench read this as a no-signature fizzle and told the
        // player their brew had failed while their ingredients were being consumed.
        disposition: 'timed-start',
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
    // Enabled-ness is read from the START snapshot, never live (issue 1036): a mid-run
    // toggle must not change the outcome of a craft whose inputs are already consumed.
    const essenceEnabled = this._resumedEssenceEnabled(prepared);
    const summary = Array.isArray(prepared.consumedSummary) ? prepared.consumedSummary : [];
    const consumedLiveItems = resolveLiveInventoryItemsByUuid(
      componentSourceActors,
      summary.map((entry) => entry?.itemUuid).filter(Boolean)
    );

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
      presentTools,
      craftingActor,
      { excludedItems: consumedLiveItems }
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
      {
        interactive: options?.interactive === true,
        toolItems,
      }
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
      // THE FAILURE AWARD, timed twin (issue 1098). A timed craft that fails must produce
      // what an immediate one would: the delay is a scheduling property, not a different
      // set of outcomes. The START snapshot (`resolvedEssences`) is threaded because the
      // source items are already gone by the time this runs — the same reason the alchemy
      // timed twin takes it.
      const failureResults = await this._produceCraftingFailureResults({
        craftingActor,
        executionRecipe,
        step,
        ingredientSet,
        consumedItems,
        toolItems,
        checkResult,
        precomputedEssences: resolvedEssences,
      });
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
        createdResults: failureResults.map((item) => craftedResultRecord(item, craftingActor)),
      });
      await this._postCraftChatMessage({
        success: false,
        craftingActor,
        recipe,
        consumedIngredients: consumedItems,
        tools: usedToolPairs,
        createdResults: failureResults,
        failureReason: message,
        rollValue: rollTotalForCard(checkResult),
        tierStep: tierStepForCard(checkResult),
      });
      return {
        resolved: true,
        result: {
          success: false,
          results: failureResults.length > 0 ? failureResults : null,
          message,
          ...(failureResults.length > 0 && { disposition: 'produced-on-failure' }),
        },
      };
    };

    if (!checkResult.success) {
      // Matched Simple alchemy attempt (timed twin): produce the reserved failure
      // group + learn WITHOUT re-consuming (components were spent at START). Tiered
      // alchemy failure still fizzles via `recordFailure` (routedByCheck).
      //
      // Keyed on the RECIPE'S SYSTEM, never on `options.isAlchemyAttempt` (issue
      // 966): that flag is set once, by `craftAlchemy` on the initial submit, and a
      // time-gated brew resolves LATER through `advanceCraftingRun`, which cannot
      // carry it. Gating on it here silently degraded every matured Simple brew
      // failure to a generic fizzle. `_getAlchemyCheckMode` returns null for a
      // non-alchemy system, so the mode test alone is the complete condition.
      if (this._getAlchemyCheckMode(executionRecipe) === 'simple') {
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
      { precomputedEssences: resolvedEssences, essenceEnabled }
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
        tierStep: tierStepForCard(checkResult),
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
      createdResults: (resultItems || []).map((item) => craftedResultRecord(item, craftingActor)),
    });

    const visibilityService = game.fabricate?.getRecipeVisibilityService?.();
    if (visibilityService) {
      await visibilityService.applyRecipeItemUseOnCraft({
        recipe,
        craftingActor,
        componentSourceActors,
      });
      // Learn on match for a matured timed alchemy brew too (gated inside
      // `learnRecipeOnCraft` on `alchemy.learnOnCraft === true`). Keyed on the
      // recipe's own system rather than `options.isAlchemyAttempt` for the reason
      // given at the Simple-failure branch above: the resume path cannot carry that
      // flag, so this learn never fired for a time-gated brew (issue 966).
      if (this._getAlchemyCheckMode(recipe) !== null) {
        await visibilityService.learnRecipeOnCraft(recipe, craftingActor);
      }
    }

    // Component complications (issue 1286). The timed path reaches this point only
    // after the matured FINISH created its results and `completeStepSuccess` archived
    // the run, so the award is as committed here as it is on the immediate path.
    const firedComplications = await this._fireCraftComplications({
      actor: craftingActor,
      recipe: executionRecipe,
      step,
      checkResult,
      resolutionMeta,
    });

    await this._postCraftChatMessage({
      success: true,
      craftingActor,
      recipe,
      consumedIngredients: consumedItems,
      tools: toolItems,
      createdResults: resultItems,
      rollValue: rollTotalForCard(checkResult),
      tierStep: tierStepForCard(checkResult),
      firedComplications: firedComplications?.fired ?? null,
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
   * Produce the authored FAILURE result for a failed crafting check (issue 1098), or
   * nothing — the crafting twin of the salvage failure award, and the seam both crafting
   * failure paths (the immediate `craft()` branch and the timed `_finishTimedStep` one)
   * call so the two cannot diverge.
   *
   * ## `never` short-circuits BEFORE any group is selected
   *
   * The policy gate is here, not inside the resolver, and it is the FIRST thing this
   * method does. Under `never` no resolution runs at all, so a failed craft is
   * byte-for-byte what it was: no group is chosen and then discarded, and nothing can
   * observe a selection that was never made.
   *
   * `perRecord` and `always` are ONE predicate — {@link activityPermitsFailureResults} —
   * and deliberately not two branches: the policy SELECTS an authored failure output and
   * never fabricates one, so a second branch could only differ by inventing an output the
   * recipe never authored. A recipe authoring none produces nothing under either.
   *
   * ## Which authored output, per mode
   *
   * Resolution is the SAME `_createResultItems` the success path uses, so there is no
   * second routing derivation to drift: `simple` and alchemy-`simple` resolve the
   * reserved `role: 'failure'` group (by ROLE — those branches never index), and
   * `routedByCheck` resolves the group assigned to the failure-marked outcome tier, which
   * `ResolutionModeService` returns with `disposition: 'failure'`.
   * `routedByIngredients` and `progressive` have no tier to mark and resolve nothing.
   *
   * ## Only a FAILURE disposition is produced, and nothing else becomes one
   *
   * The award is gated on {@link _isFailureAwardDisposition} BEFORE any item is created —
   * see that method for the single-group exemption this closes, which would otherwise
   * hand a failed routed craft its full SUCCESS output.
   *
   * A routed failing tier that no result group lists resolves to `unrouted-tier`, which is
   * not on the allowlist: it produces nothing, and it does NOT convert the craft into a
   * misconfiguration abort either, because the caller has already applied the failure
   * consumption policy and there is nothing left to abort cleanly. The craft records the
   * failure it already had.
   *
   * IT DECIDES NOTHING ABOUT COST. Consumption and tool breakage are governed by
   * `craftingCheck.consumption` and are applied by the caller BEFORE this runs; a failure
   * AWARD and a failure COST are separate decisions and this method reads neither toggle.
   *
   * @returns {Promise<Array>} the created result documents, or `[]`
   * @private
   */
  async _produceCraftingFailureResults({
    craftingActor,
    executionRecipe,
    step,
    ingredientSet,
    consumedItems,
    toolItems,
    checkResult,
    resultGroupId = null,
    precomputedEssences = null,
    essenceEnabled = null,
  }) {
    if (!activityPermitsFailureResults(this._getRecipeSystem(executionRecipe), 'crafting')) {
      return [];
    }
    try {
      // PREFLIGHT THE DISPOSITION BEFORE CREATING ANYTHING. Resolution is a pure,
      // deterministic read of the recipe/step/ingredient set/check result, so asking it
      // twice agrees with itself — the same argument the pre-consumption misconfiguration
      // gate in `craft()` already makes for resolving ahead of mutation. Asking after
      // creation would be too late: the items would already be on the actor.
      const resolutionService =
        this.resolutionModeService || game.fabricate?.getResolutionModeService?.();
      if (typeof resolutionService?.resolveResultGroups !== 'function') return [];
      const preflight = resolutionService.resolveResultGroups({
        recipe: executionRecipe,
        step,
        ingredientSet,
        checkResult,
        selectedResultGroupId: resultGroupId,
      });
      if (!this._isFailureAwardDisposition(preflight?.meta?.disposition)) return [];

      const { items } = await this._createResultItems(
        craftingActor,
        executionRecipe,
        step,
        ingredientSet,
        consumedItems,
        toolItems,
        checkResult,
        resultGroupId,
        { precomputedEssences, essenceEnabled }
      );
      return Array.isArray(items) ? items : [];
    } catch (error) {
      // A failed craft that cannot build its failure output still has to RECORD the
      // failure the caller is in the middle of writing. Throwing here would abandon the
      // run mid-write, after consumption, which is strictly worse than awarding nothing.
      console.error('Fabricate | Error producing crafting failure results:', error);
      return [];
    }
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
      { precomputedEssences: resolvedEssences }
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
      tierStep: tierStepForCard(checkResult),
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
          return resolvedComponentsFor(sys);
        },
      });

    const components = resolvedComponentsFor(system);
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
      // An alchemy brew has no requirement rail and no player-chosen essence
      // funding: the recipe and its ingredient set are DISCOVERED by matching the
      // submission, so any allocation riding on `options` was scoped to something
      // else entirely. Strip it rather than relying on the scope check downstream
      // (issue 917).
      ingredientEssenceAllocation: null,
    });
  }

  /**
   * Match submitted items against all recipe signatures in the system.
   *
   * Matching is quantity-aware: an ingredient group is satisfied only when one
   * of its options has its required quantity met. Each submission counts as one
   * unit toward a group, because the workbench expands a stack into one
   * submission per unit. Available units are counted by occurrence (how many
   * submissions match an option's component IDs), NOT by reading each item's stack
   * quantity. This per-unit occurrence model matches how essences are
   * accumulated and how {@link _consumeSubmittedAlchemyItems} consumes items. It
   * is deliberately different from {@link IngredientSet#resolveIngredientSelection},
   * which sums the stack quantity per item.
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

    // Collect EVERY set that matches this submission, then resolve the unique
    // most-specific one (issue 774) instead of early-returning the first authored
    // match. A superset submission can satisfy several nested sets; the runtime
    // must brew the most specific and fail safe (fizzle) on an incomparable tie —
    // never pick by iteration order.
    const candidates = [];
    for (const recipe of recipes) {
      if (!recipe.enabled) continue;
      const ingredientSets = Array.isArray(recipe.ingredientSets) ? recipe.ingredientSets : [];
      for (const set of ingredientSets) {
        // The signature is computed 1:1 from `set.ingredientGroups`, so they align by
        // index. Counting differs from IngredientSet.resolveIngredientSelection (that
        // method sums each item's stack quantity, whereas this counts submission
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
            candidates.push({ recipe, ingredientSetId: set.id, signature, set });
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
          candidates.push({ recipe, ingredientSetId: set.id, signature, set });
        }
      }
    }

    // The specificity tiebreak is only consulted when more than one set matched, so
    // defer computing each candidate's `groupOptions` (the domination input) until
    // then — a single match returns directly and never needs it.
    if (candidates.length > 1) {
      for (const candidate of candidates) {
        candidate.groupOptions = signatureValidator.computeGroupOptions(candidate.set, components);
      }
    }
    return resolveMostSpecificSignatureMatch(candidates);
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
        const qty = readStoredStackQuantity(item, { absentDefault: 1 });
        await (count >= qty ? item.delete() : updateStackQuantity(item, qty - count));
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
          const qty = readStoredStackQuantity(item, { absentDefault: 1 });
          await (count >= qty ? item.delete() : updateStackQuantity(item, qty - count));
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
   *
   * It RETURNS the settlement (issue 902). The four terminal-craft call sites keep
   * ignoring it and keep their non-aborting behaviour: they hold no run record, so a
   * spend that fails there loses money but can never mint it. Only the time-gated
   * START path ({@link _startTimedStep}) consumes the return, because only it persists
   * a record that a later cancel reversal would otherwise hand back.
   *
   * Never throws: a thrown deduction reports total non-settlement, so nothing is
   * recorded and nothing can be refunded.
   *
   * @private
   * @returns {Promise<{ valid: boolean, message?: string, groups: object[],
   *   settledSpends: Array<{unit: string, amount: number}> }>}
   */
  async _spendCraftCurrency(craftingActor, recipe, currencySpends) {
    if (!currencySpends?.length) return { valid: true, groups: [], settledSpends: [] };
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
      return {
        valid: result?.valid === true,
        message: result?.message,
        groups: Array.isArray(result?.groups) ? result.groups : [],
        settledSpends: Array.isArray(result?.settledSpends) ? result.settledSpends : [],
      };
    } catch (error) {
      console.error('Fabricate | Currency deduction error', error);
      return { valid: false, groups: [], settledSpends: [] };
    }
  }

  /**
   * Refund the currency that a craft spent at START — the inverse of
   * {@link _spendCraftCurrency}. A failure is logged (never thrown) so a cancel that
   * cannot refund currency still removes the run. Shared by the player-cancel path
   * (issue 848) and reusable by the GM cancel/reverse (issue 847).
   *
   * FAILS CLOSED (issue 902): a refund that throws reports total failure with NO group
   * detail, and absent detail must be read as unknown-and-failed. Inferring "no failed
   * groups listed, therefore everything refunded" would reproduce this issue's own
   * defect class one level up.
   *
   * @private
   * @returns {Promise<{ valid: boolean, message?: string, groups: object[] }>}
   */
  async _refundCraftCurrency(craftingActor, recipe, currencySpends) {
    if (!currencySpends?.length) return { valid: true, groups: [] };
    try {
      const result = await refundCurrencySpends(
        craftingActor,
        recipe,
        currencySpends,
        this._currencySeams()
      );
      if (!result?.valid) {
        console.error('Fabricate | Currency refund reported failure', result?.message);
      }
      return {
        valid: result?.valid === true,
        message: result?.message,
        groups: Array.isArray(result?.groups) ? result.groups : [],
      };
    } catch (error) {
      console.error('Fabricate | Currency refund error', error);
      return { valid: false, groups: [] };
    }
  }

  /**
   * Recreate a single consumed component's item back on an actor (issue 848). Mirrors
   * the crafted-output creation path ({@link _createSingleResult}): the component is
   * resolved from the recipe's crafting system and its `registeredItemUuid` source item
   * is cloned, the quantity is set, and the durable per-system component identity is
   * stamped so the restored item resolves to its OWN component. When no component/source
   * resolves, a lightweight item is built from the consume-time name/img snapshot so the
   * player still gets a stand-in back rather than nothing.
   * @private
   * @returns {Promise<object|null>} the created item, or null when creation is impossible
   */
  async _restoreComponentItem({ actor, system, componentId, quantity, name, img }) {
    if (!actor || typeof actor.createEmbeddedDocuments !== 'function') return null;
    const qty = Math.max(0, Math.trunc(Number(quantity) || 0));
    if (qty <= 0) return null;

    const component = findById(getDefinitionIndex(resolvedComponentsFor(system)), componentId);
    let sourceItem = null;
    if (component?.registeredItemUuid) {
      try {
        sourceItem = (await fromUuid(component.registeredItemUuid)) ?? null;
      } catch {
        sourceItem = null;
      }
    }

    let itemData;
    if (sourceItem) {
      itemData = sourceItem.toObject();
    } else if (component) {
      itemData = {
        name: component.name || name || 'Restored Item',
        img: component.img || img || 'icons/svg/item-bag.svg',
        type: 'loot',
        system: {},
      };
    } else if (name) {
      // No managed component to resolve (e.g. an unmanaged submission): rebuild a
      // stand-in from the consume-time snapshot so nothing is silently lost.
      itemData = { name, img: img || 'icons/svg/item-bag.svg', type: 'loot', system: {} };
    } else {
      return null;
    }

    itemData.system ??= {};
    setStackQuantity(itemData, qty);
    if (component?.id) {
      stampCraftedComponentIdentity(itemData, system?.id, component.id);
    }
    const [created] = await actor.createEmbeddedDocuments('Item', [itemData]);
    return created ?? null;
  }

  /**
   * Restore every consumed ingredient captured in a step's START-phase snapshot back
   * onto its source actor (issue 848). Each `consumedSummary` entry carries the
   * source `actorUuid`, `componentId`, `quantity`, and the consume-time `name`/`img`;
   * the item is recreated on the resolved source actor (falling back to the crafting
   * actor when the source actor no longer resolves).
   * @private
   * @returns {Promise<object[]>} the restored items
   */
  async _restoreConsumedIngredients(craftingActor, systemId, consumedSummary = []) {
    const systemManager = game.fabricate?.getCraftingSystemManager?.();
    const system = systemManager?.getSystem(systemId) || null;
    const restored = [];
    let failures = 0;
    for (const entry of Array.isArray(consumedSummary) ? consumedSummary : []) {
      // Best-effort per entry: a create that throws (permission, invalid item type)
      // must NOT abort the reversal or propagate out of cancelCraft — otherwise the
      // run would stay active and re-cancelling it would double-restore the entries
      // that already succeeded. Record the failure and continue.
      // A degenerate zero-quantity entry is nothing to restore, not a failure.
      const qty = Math.max(0, Math.trunc(Number(entry?.quantity) || 0));
      if (qty <= 0) continue;
      try {
        const targetActor = this._resolveRestoreActor(craftingActor, entry?.actorUuid);
        const item = await this._restoreComponentItem({
          actor: targetActor,
          system,
          componentId: entry?.componentId ?? null,
          quantity: qty,
          name: entry?.name ?? null,
          img: entry?.img ?? null,
        });
        if (item) restored.push(item);
        else failures += 1;
      } catch (error) {
        console.error('Fabricate | Failed to restore a cancelled craft ingredient:', error);
        failures += 1;
      }
    }
    return { restored, failures };
  }

  /**
   * Resolve the actor a consumed ingredient should be restored to: the recorded
   * source actor uuid, or the crafting actor when it no longer resolves.
   * @private
   */
  _resolveRestoreActor(craftingActor, actorUuid) {
    if (actorUuid && typeof globalThis.fromUuidSync === 'function') {
      try {
        const resolved = globalThis.fromUuidSync(actorUuid);
        if (resolved) return resolved;
      } catch {
        /* fall through to crafting actor */
      }
    }
    return craftingActor;
  }

  /**
   * Reverse the START-phase consumption of an in-progress run — restore the consumed
   * ingredients and refund the spent currency for every step that was CONSUMED but not
   * yet resolved (a succeeded/failed step already produced its outcome and is left
   * untouched). This is the shared "un-consume" primitive: the player self-cancel path
   * (issue 848) calls it, and the GM cancel/reverse (issue 847) can reuse it. It never
   * touches the run record itself, so callers own removing/archiving the run.
   *
   * The restore is best-effort: {@link _restoreConsumedIngredients} catches per-entry
   * failures (so a throw can never propagate out of a cancel and strand the run active),
   * and the returned `ok` reports whether the reversal was COMPLETE — every consumed
   * ingredient restored AND every attempted currency refund succeeded — so the caller can
   * report the truthful outcome rather than the refund policy's intent.
   *
   * The currency half reports a `currencyRefund` VALUE rather than a boolean (issue 902),
   * because "one terminal base unit returned, another failed" and "nothing returned"
   * require different operator responses. Read `currencyRefund.status` or its counts —
   * never the value itself in boolean context, since an object is always truthy.
   *
   * @param {Actor} craftingActor
   * @param {object} run The active run whose consumption should be reversed.
   * @returns {Promise<{ restored: object[], restoreFailures: number,
   *   currencyAttempted: boolean,
   *   currencyRefund: { attempted: boolean, refundedGroups: number,
   *     status: 'none'|'full'|'partial'|'failed' },
   *   ok: boolean }>}
   */
  async reverseRunConsumption(craftingActor, run) {
    const restored = [];
    let restoreFailures = 0;
    let currencyAttempted = false;
    let currencyFailed = false;
    let refundedGroups = 0;
    const recipe = this.recipeManager?.getRecipe?.(run?.recipeId) ?? {
      craftingSystemId: run?.craftingSystemId ?? null,
    };
    const steps = Array.isArray(run?.steps) ? run.steps : [];
    for (const step of steps) {
      const prepared = step?.preparedConsumption;
      // Only a consumed-but-not-produced step holds recoverable inputs. A resolved
      // step (succeeded/failed) already turned its inputs into an outcome.
      if (!prepared || step.status === 'succeeded' || step.status === 'failed') continue;
      const outcome = await this._restoreConsumedIngredients(
        craftingActor,
        run?.craftingSystemId,
        prepared.consumedSummary
      );
      restored.push(...outcome.restored);
      restoreFailures += outcome.failures;
      // The record holds only the spends that SETTLED, so an empty array correctly skips
      // the refund: there is nothing the actor paid and nothing to hand back.
      if (Array.isArray(prepared.currencySpends) && prepared.currencySpends.length > 0) {
        currencyAttempted = true;
        const refund = await this._refundCraftCurrency(
          craftingActor,
          recipe,
          prepared.currencySpends
        );
        // Count the groups that DEMONSTRABLY came back. Absent group detail (a refund that
        // threw) therefore counts zero — unknown-and-failed, never "all refunded".
        refundedGroups += (refund?.groups || []).filter((group) => group.refunded === true).length;
        // Any failed refund makes the whole reversal incomplete (fail-closed on truth).
        if (refund?.valid !== true) currencyFailed = true;
      }
    }
    const currencyRefund = this._currencyRefundOutcome({
      attempted: currencyAttempted,
      failed: currencyFailed,
      refundedGroups,
    });
    // A refund that was never attempted is not a failure; the reversal is complete only
    // when nothing failed to restore and no attempted currency refund reported failure.
    const ok =
      restoreFailures === 0 &&
      (currencyRefund.status === 'none' || currencyRefund.status === 'full');
    return { restored, restoreFailures, currencyAttempted, currencyRefund, ok };
  }

  /**
   * Classify a reversal's currency refund (issue 902). `none` means it was never
   * attempted (nothing settled, so nothing was recorded), which is NOT a success and
   * NOT a failure; `partial` requires at least one group demonstrably back.
   * @private
   */
  _currencyRefundOutcome({ attempted, failed, refundedGroups }) {
    let status = 'full';
    if (!attempted) status = 'none';
    else if (failed) status = refundedGroups > 0 ? 'partial' : 'failed';
    return { attempted, refundedGroups, status };
  }

  /**
   * Cancel a player's in-progress craft (issue 848). Owner-scoped: the craft engine
   * writes items directly with no GM relay, so a player may cancel only a run on an
   * OWNED actor. Semantics: remove the in-progress run (archived as `cancelled`),
   * produce NOTHING, discard any rolled check outcome, and — when the system's
   * `features.refundOnPlayerCancel` flag is on (default) — reverse the START-phase
   * consumption via {@link reverseRunConsumption}, restoring ingredients and refunding
   * currency. With the flag off, the inputs are forfeit and only the run is removed.
   * The recipe becomes craftable again either way.
   *
   * @param {Actor} craftingActor
   * @param {Actor[]} componentSourceActors Unused directly (restore targets resolve
   *   from each consumed entry's recorded source actor), accepted for signature
   *   parity with {@link craft}/the advance boundary.
   * @param {string} runId
   * @param {{ refund?: boolean }} [options] `refund` overrides the system flag (tests).
   * @returns {Promise<{ success: boolean, cancelled?: boolean, refunded?: boolean,
   *   partialRefund?: boolean, restoredCount?: number, message?: string }>}
   */
  async cancelCraft(craftingActor, componentSourceActors, runId, options = {}) {
    // Owner scope: refuse a cancel on an actor the caller demonstrably does not own.
    // The advance/cancel edge already guards via resolveAdvanceSources; this is a
    // defensive fail-closed for a non-owner reaching the engine directly.
    if (craftingActor?.isOwner === false) {
      return { success: false, message: 'You must own this character to cancel its craft.' };
    }
    const runManager = this.craftingRunManager || game.fabricate?.getCraftingRunManager?.();
    if (!runManager) {
      return { success: false, message: 'Crafting runs are not available.' };
    }
    const run = runManager.getActiveRun(craftingActor, runId);
    if (!run) {
      return { success: false, message: 'There is no in-progress craft to cancel.' };
    }

    const refundIntended = this._shouldRefundOnCancel(run, options);
    let restoredCount = 0;
    let reversalOk = true;
    let partialRefund = false;
    try {
      if (refundIntended) {
        const reversal = await this.reverseRunConsumption(craftingActor, run);
        restoredCount = reversal.restored.length;
        reversalOk = reversal.ok;
        // A partial reversal (some inputs back, some lost) is worth flagging distinctly
        // from a total failure so callers can message honestly. Both operands must be
        // re-derived rather than read from `currencyRefund` directly: it is an OBJECT and
        // would collapse this whole expression to `!reversal.ok` in boolean context. A
        // refund that was never attempted recovered nothing, so it is not partial either.
        const currencyRecovered = reversal.currencyRefund.refundedGroups > 0;
        partialRefund = !reversal.ok && (reversal.restored.length > 0 || currencyRecovered);
      }
    } finally {
      // Always archive the run, even if the reversal threw or partially failed, so the
      // run can never be re-cancelled (which would double-restore the succeeded entries).
      await runManager.cancelRun(craftingActor, runId);
    }

    // Report the ACTUAL outcome, not the policy intent: `refunded` is true only when a
    // refund was intended AND the reversal completed fully.
    return {
      success: true,
      cancelled: true,
      refunded: refundIntended && reversalOk,
      partialRefund,
      restoredCount,
    };
  }

  /**
   * Whether a player cancel should refund the consumed inputs. An explicit
   * `options.refund` boolean wins (tests / callers); otherwise the owning system's
   * `features.refundOnPlayerCancel` flag decides, defaulting ON (an explicit `false`
   * is honoured), mirroring the `features.salvage` default-on toggle.
   * @private
   */
  _shouldRefundOnCancel(run, options = {}) {
    if (typeof options.refund === 'boolean') return options.refund;
    const system = game.fabricate?.getCraftingSystemManager?.()?.getSystem?.(run?.craftingSystemId);
    return system?.features?.refundOnPlayerCancel !== false;
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
   * @param {Record<string, number>|null} [essenceAllocation] - The player's
   *   `{ itemKey: units }` funding for the set's shared essence block (issue 917),
   *   ALREADY scoped to this step and set by {@link _scopedEssenceAllocation}.
   *   Forwarded so the consumed plan is exactly what the requirement rail displayed.
   * @returns {{ success: boolean, plan: Array, currencySpends: Array, missingGroups: Array }}
   */
  _resolveCraftSelection(
    componentSourceActors,
    ingredientSet,
    recipe,
    craftingActor,
    resolveComponent,
    optionOverrides = null,
    essenceAllocation = null
  ) {
    const availableItems = pooledItemOrder(componentSourceActors);
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
        essenceAllocation,
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
   * The player's essence allocation IF it was computed for the step and ingredient
   * set this craft actually resolved, else null (issue 917).
   *
   * The payload is `{ stepId, ingredientSetId, allocation }` rather than a bare
   * `{ itemKey: units }` map precisely so this check is possible. `step` here is the
   * step resolved from `run.currentStepIndex`, not the one the UI believed was
   * active: the index can move between the `$derived` that built the payload and the
   * click that sent it, so a UI-side or facade-side guard is stale by construction.
   *
   * On a mismatch the allocation is DROPPED, never clamped into the resolved step —
   * item uuids carry no step identity, so a step-1 map applied to step 2 would look
   * plausible while steering the wrong consumption.
   *
   * @private
   * @param {object|null} payload
   * @param {object|null} step - The execution step this call resolved.
   * @param {object|null} ingredientSet - The ingredient set this call resolved.
   * @returns {Record<string, number>|null}
   */
  _scopedEssenceAllocation(payload, step, ingredientSet) {
    const allocation = payload?.allocation;
    if (!allocation || typeof allocation !== 'object') return null;
    if (String(payload.stepId ?? '') !== String(step?.id ?? '')) return null;
    if (String(payload.ingredientSetId ?? '') !== String(ingredientSet?.id ?? '')) return null;
    return allocation;
  }

  /**
   * The missing-materials message for a craft whose PLAYER-SUPPLIED essence
   * allocation does not fund the set, else null (issue 917).
   *
   * A short allocation is honoured and never topped up, so the resolved selection
   * comes back `success: false` with a partial plan. `RecipeManager.canCraft` ran
   * BEFORE the allocation was applied (it gates on the allocator's own suggestion),
   * so without this the engine would consume the partial plan and still award the
   * result — a craft for less than the recipe costs. Scoped to the supplied-allocation
   * case so the default path keeps its existing behaviour byte-for-byte.
   *
   * @private
   */
  _allocationShortfallMessage(essenceAllocation, craftSelection, executionRecipe) {
    if (!essenceAllocation || craftSelection?.success !== false) return null;
    const missing = {
      ingredients: Array.isArray(craftSelection.missingGroups) ? craftSelection.missingGroups : [],
      essences: [],
      tools: [],
    };
    return `Missing required items:\n${this._formatMissingItems(missing, executionRecipe)}`;
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
      const itemQuantity = readStoredStackQuantity(item, { absentDefault: 1 });

      // Store consumed item info for effect transfer
      consumedItems.push({
        item,
        quantity,
        ingredient,
      });

      // Update or delete the item
      await (quantity >= itemQuantity
        ? item.delete()
        : updateStackQuantity(item, itemQuantity - quantity));
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
   * @param {object} [options]
   * @param {Set<Item>|Item[]} [options.excludedItems] - concrete owned Items already
   *   reserved for ingredient consumption in this attempt
   * @returns {Promise<{ valid: boolean, message?: string, tools?: Array<{tool: object, item: Item|null, virtual?: boolean, breakable?: boolean}> }>}
   */
  async _validateTools(
    actors,
    recipe,
    tools = [],
    presentTools = null,
    primaryActor = null,
    { excludedItems = null } = {}
  ) {
    const excluded = excludedItems instanceof Set ? excludedItems : new Set(excludedItems);
    if (typeof this.recipeManager?.resolveToolStates === 'function') {
      const states = this.recipeManager.resolveToolStates(recipe, tools, actors, {
        presentTools,
        primaryActor,
        excludedItems: excluded,
      });
      const missingIndex = states.findIndex((state) => state?.available !== true);
      if (missingIndex !== -1) {
        return {
          valid: false,
          message: `Missing required tool (${toolDisplayReference(
            tools[missingIndex],
            recipe,
            this.recipeManager
          )})`,
        };
      }
      return {
        valid: true,
        tools: states.map((state, index) => {
          const tool = tools[index];
          const item = state?.contributionInput?.matchedItem ?? null;
          return {
            tool,
            item,
            virtual: state?.virtual === true,
            breakable:
              item && typeof this.recipeManager?.toolMatchesItemByIdentity === 'function'
                ? this.recipeManager.toolMatchesItemByIdentity(recipe, tool, item) === true
                : item != null,
            contributionInput: state?.contributionInput ?? null,
          };
        }),
      };
    }

    const toolItems = [];
    const presentScope = { presentTools, systemId: recipe?.craftingSystemId ?? null };
    const presentSet = resolvePresentComponentIds(presentScope);
    // An item-sourced Tool station has no componentId to key on (issue 1119).
    const presentToolSet = resolvePresentToolIds(presentScope);

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
          if (excluded.has(item)) continue;
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
      } else if (presentToolSet.has(tool?.id) || presentSet.has(tool?.componentId)) {
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

  async _appendToolCheckBonuses(formula, toolItems = []) {
    const contributions = [];
    const seenToolIds = new Set();
    for (const toolItem of Array.isArray(toolItems) ? toolItems : []) {
      const input = toolItem?.contributionInput;
      if (!input) continue;
      const toolId = input.tool?.id ?? null;
      if (toolId && seenToolIds.has(toolId)) continue;
      if (toolId) seenToolIds.add(toolId);
      contributions.push(
        await evaluateToolCheckContribution({
          ...input,
          evaluatePrerequisite: ({ actor, prerequisite }) =>
            evaluatePrerequisite(actor?.getRollData?.() ?? actor?.system ?? {}, prerequisite),
          evaluateExpression: async ({ actor, expression }) => {
            if (typeof globalThis.Roll !== 'function') return 0;
            const rollData = actor?.getRollData?.() ?? actor?.system ?? {};
            const roll = await new globalThis.Roll(expression, rollData).evaluate({
              allowInteractive: false,
            });
            return roll?.total;
          },
        })
      );
    }
    return appendToolBonusTerms(formula, composeToolBonusTerms(contributions).terms);
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
            toolId: tool.id ?? null,
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
            toolId: tool.id ?? null,
            broken: false,
            authority,
            spared: true,
          });
        }
        continue;
      }
      const actor = item?.parent ?? null;
      const isImmune = tool.checkBreakable === false || tool.breakage?.mode === 'immune';
      // checkDriven: `checkBreakable: false` excludes a Tool from the forced set;
      // every other required Tool breaks when forceBreak. toolSpecific: this flag
      // does not grant immunity. The retained Tool-specific breakage mode decides.
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
        // `checkBreakable` governs check-driven participation only. Under
        // toolSpecific, defer to the Tool's retained breakage-mode evaluation.
        planned = undefined;
      } else {
        planned = forceBreak ? { mode: 'forced', broken: true, evidence: {} } : undefined;
      }
      const entry = await applyToolUsageAndBreakage({
        tool,
        actor,
        item,
        planned,
        authority,
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
        toolId: entry.toolId ?? null,
        broken: entry.broken === true,
        ...extra,
      });
    }
    return evidence;
  }

  /**
   * Build a `replaceWith` creator that resolves component targets through the
   * recipe's crafting system and direct-Item targets by UUID, then creates the
   * replacement item on the actor.
   * @private
   */
  _makeToolReplacementCreator(recipe) {
    const system = this.getCraftingSystem(recipe?.craftingSystemId);
    return createToolReplacementCreator({
      system,
      resolveComponentSource: async ({ componentId }) => {
        const component = findById(getDefinitionIndex(resolvedComponentsFor(system)), componentId);
        if (!component?.registeredItemUuid) return component;
        const source = await this.resolveItemUuid(component.registeredItemUuid);
        return source?.documentName === 'Item' ? source : null;
      },
      resolveItemUuid: this.resolveItemUuid,
    });
  }

  /**
   * Create the result items based on recipe configuration
   *
   * The three essence-resolution inputs travel together in one trailing options bag,
   * matching {@link CraftingEngine#_createSingleResult}'s own shape: they are one
   * cohesive fact ("how essences resolve for THIS execution"), and only the time-gated
   * FINISH path supplies the snapshot pair at all.
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
    {
      precomputedEssences = null,
      essenceEnabled = null,
      resolveComponent = findMatchingComponent,
    } = {}
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
          { step, precomputedEssences, essenceEnabled, resolveComponent }
        );

        // De-dup: when two result rows produce the SAME managed component, the second
        // stacks onto the first and `_createSingleResult` returns the same item object.
        // The award tag accumulates both amounts, so the item is reported ONCE with the
        // summed quantity rather than twice (issue 858 review).
        if (resultItem && !createdItems.includes(resultItem)) {
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
    { step = null, precomputedEssences = null, essenceEnabled = null, resolveComponent } = {}
  ) {
    // Get the source item
    let sourceItem;
    let managedItem = null;
    // Resolve the crafting system once for the whole method: the stacking gate
    // (issue 858) and the effect-transfer gate below both read it, and a bare
    // `itemUuid` output (no managed component) still transfers effects, so this
    // must not be scoped to the managed-component branch.
    const systemManager = game.fabricate?.getCraftingSystemManager?.();
    const system = recipe.craftingSystemId
      ? (systemManager?.getSystem(recipe.craftingSystemId) ?? null)
      : null;
    if ((result.componentId || result.systemItemId) && recipe.craftingSystemId) {
      managedItem = findById(
        getDefinitionIndex(resolvedComponentsFor(system)),
        result.componentId || result.systemItemId
      );
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
    if (hasStackQuantity(itemData) || !sourceItem) {
      setStackQuantity(itemData, result.quantity);
    }

    // Apply macro-based property updates. Every CONTRIBUTING essence's own property
    // macro runs FIRST (issue 1036), in `essenceDefinitions` library order, so the
    // result's own macro is the LAST writer at any path the two share.
    const essenceMacrosApplied = await this._runEssencePropertyMacros(itemData, {
      system,
      recipe,
      craftingActor,
      result,
      consumedItems,
      toolItems,
      checkResult,
      step,
      precomputedEssences,
      essenceEnabled,
      resolveComponent,
    });
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
    const resultMacroApplied =
      propertyUpdates &&
      typeof propertyUpdates === 'object' &&
      Object.keys(propertyUpdates).length > 0;
    if (resultMacroApplied) {
      for (const [path, value] of Object.entries(propertyUpdates)) {
        foundry.utils.setProperty(itemData, path, value);
      }
    }
    // The stacking veto is the OR across EVERY macro that applied a path — essence or
    // result (issue 1036). `createOrStackComponentItem` DISCARDS `itemData` wholesale
    // when it stacks, so an essence-mutated output that failed to set this would merge
    // into a plain stack and lose every mutation with no error at all.
    const hasPropertyUpdates = Boolean(essenceMacrosApplied || resultMacroApplied);

    // Stamp the durable component identity on the crafted output so the inventory
    // matcher attributes it to its OWN component and not a sibling reached through a
    // transitive `_stats.duplicateSource` (issue 539). Keyed on the result's managed
    // component id + the recipe's crafting system id; a result with no managed component
    // (a bare `itemUuid` output) or an unsafe system id is left unstamped and resolves
    // via the raw-reference fall-through.
    stampCraftedComponentIdentity(itemData, recipe.craftingSystemId, managedItem?.id);

    // Whether this output transfers per-craft active effects (both the recipe- and
    // system-level flags must be set). A transferring output is materially distinct
    // per craft, so it must never merge into an existing stack.
    const transfersEffects =
      recipe.transferEffects === true && system?.features?.effectTransfer === true;

    // Stack onto a matching inventory item instead of spawning a duplicate (issue 858).
    // Only a PLAIN component output stacks: it must resolve to a managed component,
    // carry no per-craft property-macro customization, and transfer no per-craft
    // effects — any of which makes the produced item materially distinct from an
    // existing stack. Matches are resolved through the same system-scoped resolver
    // salvage/craft already use to find component items on the actor.
    const awardedQuantity = Number(result.quantity) || 1;
    const itemsIterable =
      craftingActor?.items != null && typeof craftingActor.items[Symbol.iterator] === 'function';
    let matchingItems = [];
    if (managedItem && system && itemsIterable && !hasPropertyUpdates && !transfersEffects) {
      matchingItems = this.findComponentItems(craftingActor, managedItem, system) || [];
    }

    const resultItem = await createOrStackComponentItem({
      actor: craftingActor,
      itemData,
      matchingItems,
      awardedQuantity,
    });
    if (!resultItem) return null;

    const stacked = matchingItems.includes(resultItem);
    // Record THIS award's contribution so chat/run reporting shows the amount
    // produced now, not the merged stack total after a stack.
    tagAwardedQuantity(resultItem, awardedQuantity);

    // Transfer active effects if configured (requires both recipe- and system-level
    // flags). Only ever applies to a freshly created item — a stacked item keeps its
    // own effects and, by construction, `transfersEffects` is false when stacking.
    if (!stacked && transfersEffects) {
      await this._transferEffects(
        resultItem,
        consumedItems,
        recipe,
        precomputedEssences,
        resolveComponent,
        essenceEnabled
      );
    }

    return resultItem;
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
   *
   * A DISABLED essence carries no behaviour onto a crafted result (issue 1036): its
   * effects are not collected, exactly as its property macro does not run. Its
   * quantities still match, accumulate and are consumed — `enabled` gates essence-carried
   * BEHAVIOUR, never essence ARITHMETIC, so a mid-session toggle cannot change what an
   * already-held item is worth.
   *
   * This walk deliberately stays SEPARATE from the essence property-macro loop, which
   * iterates `essenceDefinitions` for GM-authorable order. Collapsing the two would
   * change the order of the `effectsData` array handed to
   * `createEmbeddedDocuments('ActiveEffect', ...)`.
   * @private
   */
  async _transferEffects(
    resultItem,
    consumedItems,
    recipe,
    precomputedEssences = null,
    resolveComponent = findMatchingComponent,
    essenceEnabled = null
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
    const essenceDefinitions = resolvedEssencesFor(system);
    const effectsData = [];

    for (const essenceId of contributingEssenceIds) {
      const definition = essenceDefinitions.find((d) => d.id === essenceId);
      // BEFORE `_sourceUuidForEssenceDefinition`, and null-safe: `.find(...)` returns
      // `undefined` for an essence deleted between a timed craft's START and FINISH, a
      // state the shipped code survives only because that helper guards `!definition`.
      if (!this._essenceCarriesBehaviour(definition, essenceId, essenceEnabled)) continue;
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

  /**
   * Whether an essence carries its BEHAVIOUR onto this result — the ONE predicate behind
   * both essence-carried behaviours (issue 1036), so the effect transfer and the property
   * macro can never disagree about a disabled essence.
   *
   * A time-gated craft evaluates the SNAPSHOT taken at START (`preparedConsumption
   * .essenceEnabled`), never the live definition: evaluating at FINISH would let a
   * mid-run GM toggle change the outcome of a craft whose inputs are already consumed.
   * The snapshot is a COMPLETE map over the START `resolvedEssences` keys, so a key
   * present in it always wins; an ABSENT key (a run armed before this change, or a
   * collapsed multi-step chain, which has no snapshot at all and executes live at
   * maturity) falls through to the live definition and therefore reads as enabled.
   *
   * @param {object|undefined} definition the live essence definition, or `undefined` for
   *   an essence deleted since the contribution was resolved.
   * @param {string} essenceId
   * @param {Record<string, boolean>|null} [essenceEnabled] the START snapshot.
   * @returns {boolean}
   * @private
   */
  _essenceCarriesBehaviour(definition, essenceId, essenceEnabled = null) {
    if (
      essenceEnabled &&
      typeof essenceEnabled === 'object' &&
      Object.hasOwn(essenceEnabled, essenceId)
    ) {
      return essenceEnabled[essenceId] !== false;
    }
    return definition?.enabled !== false;
  }

  /**
   * The START-phase enabled-ness snapshot for a time-gated step: one entry for EVERY
   * contributing essence, not only the disabled ones (issue 1036).
   *
   * Completeness is load-bearing rather than tidy. Run persistence is `actor.setFlag` via
   * `persistFabricateRunContainer`, whose merge cannot delete a key inside a SURVIVING
   * run, so a key omitted from a later write resurrects with its old value. A map of only
   * the disabled ids would also be indistinguishable from an absent map for an all-enabled
   * craft, which is exactly the state the absent-map fallback has to keep meaning
   * "evaluate live".
   *
   * @param {object} resolvedEssences the START `resolvedEssences` map.
   * @param {object|null} system
   * @returns {Record<string, boolean>}
   * @private
   */
  /**
   * The enabled-ness map a RESUMING time-gated step evaluates its behaviour gate from.
   *
   * A run armed BEFORE `essenceEnabled` existed carries no map, and resuming it must read
   * as ALL-ENABLED — the behaviour it was armed under — rather than falling through to the
   * live definitions, which the GM may have toggled while it was counting down. This
   * therefore synthesises a complete all-true map over the START keys rather than
   * returning `null`: `null` means "no snapshot at all, evaluate live", which is the
   * COLLAPSED-chain carve-out and a genuinely different fact. That chain consumes nothing
   * when its single summed gate is armed and executes every step live at maturity, so it
   * has no START snapshot of any kind and correctly evaluates enabled-ness at maturity.
   *
   * **An EMPTY stored map is deliberately not distinguished from an absent one, and that
   * is safe rather than lucky.** `_snapshotEssenceEnabled` emits exactly one entry per
   * START `resolvedEssences` key, so the two are empty or non-empty TOGETHER: for a
   * legitimately empty snapshot the synthesised map below is also `{}`, and the two
   * readings coincide. A run armed before this field existed carries no `essenceEnabled`
   * key at all (`undefined`), never `{}`, so criterion 21's all-enabled reading is reached
   * through the absent branch either way. `{}` alongside a NON-empty `resolvedEssences` is
   * therefore unreachable from correct code — it is the shape a dropped snapshot key
   * produces, and reading it as "evaluate live" instead would substitute one wrong answer
   * for another rather than closing anything. What closes it is the END-TO-END coverage in
   * `tests/essence-timed-craft-gate.test.js`, which drives START -> persisted run -> FINISH
   * and fails on a dropped key at either site.
   *
   * @param {object} prepared the step's `preparedConsumption`.
   * @returns {Record<string, boolean>|null}
   * @private
   */
  _resumedEssenceEnabled(prepared) {
    const stored = prepared?.essenceEnabled;
    if (stored && typeof stored === 'object' && Object.keys(stored).length > 0) return stored;
    const resolved = prepared?.resolvedEssences;
    if (!resolved || typeof resolved !== 'object') return null;
    return Object.fromEntries(Object.keys(resolved).map((essenceId) => [essenceId, true]));
  }

  _snapshotEssenceEnabled(resolvedEssences, system) {
    const definitions = resolvedEssencesFor(system);
    const snapshot = {};
    for (const essenceId of Object.keys(resolvedEssences || {})) {
      const definition = definitions.find((def) => def?.id === essenceId);
      snapshot[essenceId] = definition?.enabled !== false;
    }
    return snapshot;
  }

  /**
   * Run every contributing essence's own property macro against the crafted item data,
   * before the result's own macro (issue 1036).
   *
   * The seam is `_createSingleResult`, immediately after `itemData` is populated and
   * before the item is created — which makes this run for SALVAGE awards too, live and
   * with the salvaged component's own essences as the contributing set, exactly as
   * `_transferEffects` already does there.
   *
   * Ordering is by `essenceDefinitions` LIBRARY POSITION, filtered to the contributing
   * set — never by iterating `resolvedEssences`. That object is accumulated over
   * `consumedItems`, so its key order is integer-like ids first in ascending numeric
   * order (reachable: `_toKey` permits digit-only slugs) and then inventory scan order.
   * Neither is stable or authorable, and with last-writer-wins that would make the
   * crafted result non-deterministic. `_transferEffects` iterates `resolvedEssences`
   * directly, but it APPENDS to a list and is order-insensitive, so it is no precedent
   * for an order-sensitive consumer.
   *
   * Updates are applied per macro, in loop order, immediately after that macro returns —
   * never spread-merged into one map first, because the returns are string PATHS and a
   * spread is not order-equivalent when one macro returns a subtree and another a leaf.
   * Two essences writing one path is supported, not an error, and warns about nothing.
   *
   * TWO gates apply: `features.propertyMacros` (which defaults to false) AND
   * `features.essences`, the latter matching `_transferEffects`. `_buildEssenceContext`
   * resolves contributions regardless of the master switch, so this reads it explicitly
   * rather than inheriting it.
   *
   * The system, both gates and the essence context are resolved ONCE and then iterated.
   * This deliberately does not call `_runPropertyMacro` per essence: that re-resolves the
   * manager, re-checks the gate and rebuilds the whole context, and `_buildEssenceContext`
   * re-runs `resolveItemEssences` over every consumed item, so a per-essence call would
   * rebuild the identical context N+1 times per result on the synchronous craft path.
   *
   * For the same reason the "does any runnable essence even carry a macro" test is hoisted
   * ABOVE `_buildEssenceContext`. Only the contributing-set filter needs the context, and a
   * system that turned `propertyMacros` on for a single RECIPE-level macro would otherwise
   * pay a full `resolveItemEssences` re-resolution on every craft AND salvage result for a
   * loop that then finds nothing to run. `_runPropertyMacro` already short-circuits the
   * same way on its own `if (!macroUuid) return null`.
   *
   * @param {object} itemData the crafted item data, mutated in place.
   * @returns {Promise<boolean>} whether ANY essence macro applied at least one path — the
   *   essence half of `_createSingleResult`'s `hasPropertyUpdates` stacking veto.
   * @private
   */
  async _runEssencePropertyMacros(
    itemData,
    {
      system,
      recipe,
      craftingActor,
      result,
      consumedItems,
      toolItems,
      checkResult = null,
      step = null,
      precomputedEssences = null,
      essenceEnabled = null,
      resolveComponent = findMatchingComponent,
    } = {}
  ) {
    const features = system?.features || {};
    if (features.propertyMacros !== true || features.essences !== true) return false;

    const definitions = resolvedEssencesFor(system);
    if (definitions.length === 0) return false;

    // Everything this predicate reads is on the definition itself, so it is decidable
    // BEFORE the essence context exists. Only the contributing-set membership below is not.
    const carriesRunnableMacro = (definition) =>
      typeof definition?.propertyMacroUuid === 'string' &&
      definition.propertyMacroUuid !== '' &&
      this._essenceCarriesBehaviour(definition, definition.id, essenceEnabled);
    if (!definitions.some(carriesRunnableMacro)) return false;

    const { resolvedEssences, essenceSources } = this._buildEssenceContext(
      consumedItems,
      recipe,
      precomputedEssences,
      resolveComponent
    );
    const runnable = definitions.filter(
      (definition) =>
        carriesRunnableMacro(definition) && Object.hasOwn(resolvedEssences, definition.id)
    );
    if (runnable.length === 0) return false;

    const context = {
      recipe: recipe?.toJSON?.() || recipe,
      craftingSystem: system,
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
      resolvedTools: toolItems.map(({ item, tool }) => ({ item, tool })),
      resolvedEssences,
      essenceSources,
      checkResult,
      result: result?.toJSON?.() || result,
      step,
    };

    let applied = false;
    for (const definition of runnable) {
      // Each macro is ISOLATED: a throw fails that essence only and every later macro
      // still runs and still applies. `essence` and `essenceQuantity` are what let the
      // archetypal macro ("+1 damage per unit of Fire") find its OWN contribution —
      // without them a shared macro cannot tell which essence invoked it.
      const updates = await this._runOneEssencePropertyMacro(definition, {
        ...context,
        essence: definition,
        essenceQuantity: resolvedEssences[definition.id],
      });
      if (!updates) continue;
      if (this._applyEssencePropertyUpdates(itemData, updates, definition)) applied = true;
    }
    return applied;
  }

  /**
   * Apply ONE macro's flat path -> value map to the crafted item data, isolating a
   * failure to that essence.
   *
   * **This guard is not defensive padding: without it a craft aborts AFTER consumption.**
   * `foundry.utils.setProperty` vivifies an intermediate only when it is `=== undefined`,
   * so a `null` intermediate is traversed INTO and a primitive intermediate is assigned
   * ONTO — both throw, in strict mode, from inside core. `itemData` is
   * `sourceItem.toObject()`, where both shapes are ordinary rather than exotic: dnd5e loot
   * carries `system.container: null` and an integer `system.quantity`. So a macro
   * returning `system.container.tier` throws here, not in the macro body, and this loop
   * sits outside `_runOneEssencePropertyMacro`'s try. `craft()` has no try around
   * `_createResultItems`, and ingredients, currency and tool wear are already spent by
   * then, so the unguarded outcome is: inputs consumed, NO result item, and the recipe's
   * own result macro never runs either.
   *
   * TWO deliberate choices, both pinned by tests:
   *
   *  1. **Logged, not toasted.** A path core refuses to write is a bad macro RETURN, which
   *     the same design already warns about silently (a non-object return), and it is a
   *     GM-side authoring defect that would otherwise raise one notification per essence
   *     per result on the crafting PLAYER's screen on every craft in the system. That is
   *     the exact harm `_runOneEssencePropertyMacro`'s silent-skip branch exists to
   *     prevent. A macro BODY throw keeps its `ui.notifications.error` — this does not
   *     widen that catch.
   *  2. **A partial application still counts as applied.** When three paths land and the
   *     fourth throws, `itemData` really was mutated, so the stacking veto must fire:
   *     `createOrStackComponentItem` discards `itemData` wholesale when it stacks, and a
   *     `false` here would silently merge those three mutations away. The remaining paths
   *     of THAT essence are skipped; every later essence still runs and still applies.
   *
   * @param {object} itemData mutated in place.
   * @param {object} updates the macro's flat path -> value map.
   * @param {object} definition the essence whose macro produced `updates`.
   * @returns {boolean} whether at least one path was applied.
   * @private
   */
  _applyEssencePropertyUpdates(itemData, updates, definition) {
    let applied = false;
    try {
      for (const [path, value] of Object.entries(updates)) {
        foundry.utils.setProperty(itemData, path, value);
        applied = true;
      }
    } catch (error) {
      console.error(
        `Fabricate | Essence "${definition?.name || definition?.id}" property macro returned a path that could not be applied; the remaining paths of that essence were skipped (${definition?.propertyMacroUuid})`,
        error
      );
    }
    return applied;
  }

  /**
   * Run ONE essence property macro and return its flat path -> value map, or `null`.
   *
   * An UNRESOLVABLE `propertyMacroUuid` — one that does not resolve to a `script` Macro
   * carrying a string `command` — is logged and skipped SILENTLY. It deliberately does NOT
   * raise `ui.notifications.error`: the result-macro precedent fires one toast per recipe,
   * while this would fire one per essence per result, on every craft in the system, on the
   * crafting PLAYER's screen, for a GM-side authoring defect only the GM can fix. The
   * editor's drop handler and the Validation tab are where that defect is surfaced.
   *
   * **`type === 'script'` is checked here and not left to the drop handler.** `command` is
   * a required `StringField` on BOTH Macro types and `type` DEFAULTS to `chat`, so
   * `typeof macro.command === 'string'` is not a script test — a chat macro passes it, and
   * `MacroExecutor.run` then compiles its command as JavaScript, where `/roll 1d20` is a
   * `SyntaxError` that reaches the catch below and toasts once per essence per result. A
   * drop-handler check guards only NEWLY AUTHORED values; an imported system, a hand-edited
   * world setting, or a macro whose type the GM changes after linking all arrive here
   * unguarded, and `_normalizeEssencePropertyMacroUuid` is deliberately a shape check that
   * cannot see the document. The two checks are complementary, not redundant. The literal
   * matches `CONST.MACRO_TYPES.SCRIPT`; the codebase reads the literal rather than the
   * global (see `SvelteCraftingSystemManagerApp.svelte.js`'s macro picker filter).
   *
   * The uuid is resolved here AND again inside `MacroExecutor.run`. That double resolve is
   * DELIBERATE, not an oversight to optimise away: `MacroExecutor.run` THROWS for an
   * unresolvable uuid, and a throw is what raises the player-facing toast, so the only way
   * to distinguish "the GM's link is broken" (silent) from "the macro itself blew up"
   * (toast) is to settle the first question before entering the try. Collapsing the two
   * resolutions re-introduces exactly the notification this design exists to prevent. Both
   * hit `fromUuid`'s already-loaded collections for a world macro; a compendium macro costs
   * one extra cached `database.get`.
   *
   * Return handling matches the result macro exactly: `null`/`undefined` is a no-op, and a
   * non-object or Array return is warned about and ignored.
   *
   * @param {object} definition
   * @param {object} context
   * @returns {Promise<object|null>}
   * @private
   */
  async _runOneEssencePropertyMacro(definition, context) {
    const macroUuid = definition.propertyMacroUuid;
    let macro;
    try {
      macro = await fromUuid(macroUuid);
    } catch {
      macro = null;
    }
    if (!macro || macro.type !== 'script' || typeof macro.command !== 'string') {
      console.warn(
        `Fabricate | Essence "${definition.name || definition.id}" property macro could not be resolved to a script macro and was skipped (${macroUuid})`
      );
      return null;
    }

    try {
      const updates = await MacroExecutor.run(macroUuid, context);
      if (updates == null) return null;
      if (typeof updates !== 'object' || Array.isArray(updates)) {
        console.warn(`Fabricate | Essence property macro ${macroUuid} did not return an object`);
        return null;
      }
      return updates;
    } catch (error) {
      console.error(`Fabricate | Essence property macro failed (${macroUuid})`, error);
      ui?.notifications?.error?.(`Property macro failed: ${error.message || macroUuid}`);
      return null;
    }
  }

  _sourceUuidForEssenceDefinition(definition, system) {
    if (!definition) return null;
    const sourceComponentId =
      definition.sourceComponentId || definition.associatedSystemItemId || '';
    if (sourceComponentId) {
      // The legacy `items` alias is NOT a scoped corpus and keeps its raw read: it predates
      // `components` and no world entity has ever been lifted from it.
      const components = Array.isArray(system?.components)
        ? resolvedComponentsFor(system)
        : Array.isArray(system?.items)
          ? system.items
          : [];
      const component = findById(getDefinitionIndex(components), sourceComponentId);
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
    { interactive = false, toolItems = [] } = {}
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

    // WHETHER THE ACTIVE CHECK CAN ROLL AT ALL, asked ONCE, of the same selector every GM
    // surface asks (issue 1094). Each gate below used to test its own slot's RAW
    // `rollFormula`, which diverged the moment the retirement shim landed: a stored
    // `@craftingmod`, `1d20 * @craftingmod` or `max(@craftingmod, 2)` reports `noFormula`
    // on the Checks card, the recipe editor and the Validation tab, while the engine still
    // entered the runner. The consequences were not symmetric, and both were silent:
    //
    //   - on alchemy `simple`, `evaluateCheckRoll` short-circuits to `engine: false`, which
    //     `runFormulaPassFail` reports as a non-blocking `success: true` — so the brew
    //     succeeded UNCONDITIONALLY, DC ignored;
    //   - on `routedByCheck` / `progressive` the `requiresCheck` misconfiguration abort
    //     never fired, so the craft consumed its ingredients and routed to nothing.
    //
    // Reading `checkUsable` makes a strip-to-empty formula take exactly the path a blank
    // one takes, which is the only reading under which the engine and the GM's screen can
    // agree. `resolveActiveCraftingCheckFormula` already owns the mode→slot table, so this
    // also deletes five hand-maintained mirrors of it.
    const activeCheck = resolveActiveCraftingCheckFormula({ ...system, resolutionMode: mode });

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
        if (!activeCheck.checkUsable) {
          return {
            success: false,
            misconfigured: true,
            outcome: null,
            value: null,
            data: {},
            message: 'alchemy simple check mode requires a configured crafting check roll formula',
          };
        }
        return this._runSimpleCheck(system, recipe, ingredientSet, craftingActor, {
          interactive,
          toolItems,
        });
      }
      // tiered
      if (!activeCheck.checkUsable) {
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
        toolItems,
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
    // With an unusable `simple` check the pass/fail check is not run, so `useSimpleCheck`
    // is false and (in optional simple / routedByIngredients mode) the attempt proceeds
    // with no check. "Unusable" is `activeCheck.checkUsable`, which covers both an empty
    // formula and one the retirement shim strips to empty.
    const useSimpleCheck =
      ['simple', 'routedByIngredients'].includes(mode) &&
      activeCheck.checkUsable &&
      (mode === 'routedByIngredients' || checksEnabled);

    // Progressive check (Checks editor) for progressive mode: rolls a formula
    // whose total becomes the numeric `value` the progressive result-awarding
    // spends against result difficulties. Usable only when a roll formula is
    // configured; with no formula the required-check guard below fails the attempt.
    const useProgressiveCheck = mode === 'progressive' && activeCheck.checkUsable;

    // Routed check (Checks editor) for `routedByCheck` ONLY: rolls the routed
    // formula and maps the total to an outcome tier whose NAME drives the
    // `routedByCheck` routing. Usable only when a routed formula is configured; the
    // check is required, so a missing formula fails via the required-check guard
    // below. `routedByIngredients` no longer reads `craftingCheck.routed` — its
    // optional pass/fail check lives on `craftingCheck.simple` (see `useSimpleCheck`).
    const useRoutedCheck = mode === 'routedByCheck' && activeCheck.checkUsable;

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
      return this._runSimpleCheck(system, recipe, ingredientSet, craftingActor, {
        interactive,
        toolItems,
      });
    }

    if (useProgressiveCheck) {
      return this._runProgressiveCheck(system, recipe, craftingActor, { interactive, toolItems });
    }

    if (useRoutedCheck) {
      // Only `routedByCheck` uses the tier-routing path (its check total maps to an
      // outcome tier whose name drives routing). `routedByIngredients` routes result
      // groups by the chosen ingredient set and runs its optional pass/fail check
      // through `useSimpleCheck` above against `craftingCheck.simple`.
      return this._runRoutedCheck(system, recipe, ingredientSet, craftingActor, {
        interactive,
        toolItems,
      });
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
    { interactive = false, toolItems = [] } = {}
  ) {
    return this._runPassFailCheck(
      system,
      system?.craftingCheck?.simple || {},
      recipe,
      ingredientSet,
      craftingActor,
      { interactive, toolItems }
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
    { interactive = false, toolItems = [] } = {}
  ) {
    const checkConfig = config || {};
    const formula = await this._appendToolCheckBonuses(checkConfig.rollFormula, toolItems);
    const dc = await this._resolveSimpleCheckDc(
      system,
      checkConfig,
      recipe,
      ingredientSet,
      craftingActor
    );
    const craftingModifier = buildCheckModifierContext(system, 'crafting', recipe);
    const result = await runFormulaPassFail({
      formula,
      dc,
      thresholdMode: checkConfig.thresholdMode,
      triggers: checkConfig.checkBreakage?.triggers,
      actor: craftingActor,
      label: 'Crafting',
      craftingModifier,
      rollOptions: buildInteractiveRollOptions({
        interactive,
        actor: craftingActor,
        name: recipe?.name,
        activity: 'Crafting',
        img: this._resolveRecipePromptImg(recipe),
        dc,
        modifierChoice: this._buildInteractiveModifierChoice(
          formula,
          craftingModifier,
          craftingActor,
          interactive
        ),
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
    { interactive = false, applyMinSuccessOutcome = true, toolItems = [] } = {}
  ) {
    const routed = system?.craftingCheck?.routed || {};
    const formula = await this._appendToolCheckBonuses(routed.rollFormula, toolItems);
    const dc = await this._resolveSimpleCheckDc(
      system,
      routed,
      recipe,
      ingredientSet,
      craftingActor
    );
    const craftingModifier = buildCheckModifierContext(system, 'crafting', recipe);
    const result = await runFormulaRouted({
      formula,
      dc,
      thresholdMode: routed.thresholdMode,
      type: routed.type,
      relativeOutcomes: routed.relativeOutcomes,
      fixedOutcomes: routed.fixedOutcomes,
      triggers: routed.checkBreakage?.triggers,
      actor: craftingActor,
      label: 'Crafting',
      craftingModifier,
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
        modifierChoice: this._buildInteractiveModifierChoice(
          formula,
          craftingModifier,
          craftingActor,
          interactive
        ),
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
   * Build the deferred interactive `playerPicks` modifier-choice descriptor (issues 770,
   * 1055, 1094) for an interactive craft. Returns the descriptor ONLY when this is an
   * interactive roll AND the active mode carries an authored (post-shim) roll formula
   * AND the effective combination rule is `playerPicks` AND at least TWO modifiers are
   * eligible (the two-option rule is enforced by {@link buildCheckModifierChoice});
   * otherwise `null`, so every other rule and every non-interactive craft threads a
   * byte-identical `rollOptions` bag (no `modifierChoice` key). The descriptor is
   * threaded onto `rollOptions.modifierChoice`; the player picks UP TO `maxPicks` of its
   * options in the roll prompt and `evaluateCheckRoll` APPENDS their SUM.
   *
   * THE FORMULA CONDITION IS USABILITY, NOT TOKEN PRESENCE (issue 1094). It used to read
   * a presence test for the retired roll-formula placeholder, which was the real gate on
   * this whole feature —
   * not `evaluateCheckRoll`'s `useDeferredChoice`, which only ever keyed on the
   * descriptor being present. Retiring the token without replacing THIS test would have
   * left every interactive `playerPicks` craft silently offering no modifier fieldset,
   * because the migration strips the token every such system used to carry. The
   * replacement asks the question that still has an answer: does the check this craft is
   * about to roll have a formula at all? A formula that strips to empty is not a check,
   * so there is nothing to modify and nothing to ask the player about.
   *
   * `playerPicks` is the ONLY rule that defers to roll time. `bySubject` also defers
   * selection, but to the SUBJECT AUTHOR at authoring time, so by the time the engine
   * rolls, the choice is already made and stored: `resolveEligibleModifierIds` has
   * narrowed the eligible set to the subject's picks and capped it, and the deterministic
   * scalar sums exactly that. Prompting for it would re-ask a question the subject already
   * answered, which is why the gate below tests for `playerPicks` specifically rather
   * than for "some rule defers selection".
   *
   * The non-interactive `playerPicks` path resolves the modifier scalar deterministically as
   * the BEST LEGAL selection — the sum of the highest `maxModifierPicks` values, which is
   * `highest` at a cap of 1 — so an API/headless craft matches what an optimally-playing
   * player would have picked here.
   * @private
   * @returns {{modifiers: Array<{id: string, label: string, icon: string,
   *   value: number}>, maxPicks: number, defaultSelectedIds: string[],
   *   defaultSelectedId: string}|null}
   */
  _buildInteractiveModifierChoice(formula, craftingModifierContext, craftingActor, interactive) {
    if (interactive !== true) return null;
    // No authored (post-shim) roll formula means no check to modify, so a choice would be
    // meaningless — and `evaluateCheckRoll` would short-circuit that roll anyway.
    if (stripRetiredModifierPlaceholder(String(formula ?? '')).trim() === '') return null;
    if (resolveModifierPolicy(craftingModifierContext) !== 'playerPicks') return null;
    // Returns the descriptor, or null when fewer than two modifiers are eligible (a
    // one-option group is not a choice — the deterministic scalar IS the only possible
    // pick, so the prompt falls through to it);
    // `buildInteractiveRollOptions` omits the `modifierChoice` key for a falsy value.
    return buildCheckModifierChoice(
      craftingModifierContext,
      makeRollDataExpressionResolver(craftingActor)
    );
  }

  /**
   * Resolve the recipe icon for the interactive roll prompt: the recipe's OWN `img`,
   * per `data-models/spec.md` `## Recipe` requirement 16.
   *
   * This previously preferred the linked recipe-item definition's image, keyed on the
   * legacy `recipe.recipeItemId` scalar. Book membership is many-to-many, so "the
   * containing book" tracked definition order rather than anything the GM authored, and
   * the borrow outranked an authored `recipe.img` (issue 887).
   *
   * `resolveRecipeImage` treats Foundry's generic item-bag as "no image", so the prompt
   * icon still never falls back to the bag — the explicit product requirement recorded
   * in the header of `tests/recipe-prompt-img.test.js`.
   *
   * @private
   */
  _resolveRecipePromptImg(recipe) {
    return resolveRecipeImage(recipe);
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
  async _runProgressiveCheck(
    system,
    recipe,
    craftingActor,
    { interactive = false, toolItems = [] } = {}
  ) {
    const progressive = system?.craftingCheck?.progressive || {};
    const formula = await this._appendToolCheckBonuses(progressive.rollFormula, toolItems);
    const craftingModifier = buildCheckModifierContext(system, 'crafting', recipe);
    const result = await runFormulaProgressive({
      formula,
      triggers: progressive.checkBreakage?.triggers,
      actor: craftingActor,
      label: 'Crafting',
      craftingModifier,
      rollOptions: buildInteractiveRollOptions({
        interactive,
        actor: craftingActor,
        name: recipe?.name,
        activity: 'Crafting',
        img: this._resolveRecipePromptImg(recipe),
        modifierChoice: this._buildInteractiveModifierChoice(
          formula,
          craftingModifier,
          craftingActor,
          interactive
        ),
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
   * salvage resolution mode (issue 419), via the shared {@link resolveSalvageCheck}
   * derivation (issue 859).
   *
   * An UNSUPPORTED mode breaks nothing. That deliberately removes the old fall-through
   * to `check.simple.checkBreakage`: an invalid salvage config now aborts
   * `misconfigured` with zero mutation inside `_runSalvageCraftingCheck`, so the run
   * never reaches breakage at all and reading a foreign mode's triggers here could only
   * ever be wrong.
   * @private
   */
  _resolveSalvageCheckBreakage(system) {
    const { config, unsupportedMode } = resolveSalvageCheck(system);
    if (unsupportedMode) return null;
    return config?.checkBreakage ?? null;
  }

  /**
   * Resolve the salvage breakage decision via the shared {@link evaluateCheckBreakage}
   * seam, bringing salvage to parity with crafting (issue 419). Returns
   * `{ forceBreak, triggerId, reason, authority }`.
   * @private
   */
  _resolveSalvageBreakageDecision(system, checkResult) {
    // Routed through the world scope at issue 1363: the crafting-system normalizer is
    // absence-preserving now, so a local `?? toolSpecific` here would silently ignore an
    // authored world authority and make the flip inert at this reader.
    const authority = effectiveToolBreakageAuthority(system);
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
    // Routed through the world scope at issue 1363, for the reason
    // `_resolveSalvageBreakageDecision` states.
    const authority = effectiveToolBreakageAuthority(system);
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
    // THE ANCHOR, resolved FIRST and always: the record's selected difficulty tier when it
    // names one that still exists, else the static default.
    const anchor = this._resolveCheckAnchorDc(simple, recipe);
    if (simple.dcMode !== 'dynamic') return anchor;
    if (!simple.macroUuid) return anchor;
    try {
      const value = await MacroExecutor.run(simple.macroUuid, {
        recipe: recipe?.toJSON?.() || recipe,
        craftingSystem: system,
        craftingActor,
        candidateIngredientSet: ingredientSet,
        // THE MACRO RECEIVES THE ANCHOR AND RETURNS THE FINAL NUMBER (issue 1096,
        // maintainer's ruling). The tier sets the anchor and the macro adjusts it, so the
        // two COMPOSE rather than compete: a GM can author "Legendary Craft is 21" and
        // still have a macro shift it for ingredient quality. It subsumes the older
        // macro-wins behaviour at no cost — a macro that ignores the argument behaves
        // exactly as it did — and it is why neither the tiers nor the tier list are hidden
        // under dynamic. Additive to a NAMED bag (`MacroExecutor.run(uuid, payload = {})`),
        // so a shipped macro that destructures the fields it wants is unaffected.
        anchorDc: anchor,
      });
      const numeric = Number(value);
      return Number.isFinite(numeric) ? Math.trunc(numeric) : anchor;
    } catch (error) {
      console.error(`Fabricate | Crafting check DC macro failed (${simple.macroUuid})`, error);
      return anchor;
    }
  }

  /**
   * The DC before any macro runs: the record's selected difficulty tier, else the static
   * default. Split out of {@link _resolveSimpleCheckDc} because it is now needed TWICE in
   * that method — once as the value a static check resolves to, and once as the input a
   * dynamic macro is handed — and a second inline copy would be two chances to disagree
   * about what "the anchor" means.
   *
   * @param {object} config The check config (`simple` or `routed`).
   * @param {object} recipe The record being resolved, which may name a tier.
   * @returns {number} The anchor DC, never NaN.
   */
  _resolveCheckAnchorDc(config, recipe) {
    const fallback = Number.isFinite(Number(config?.dc)) ? Math.trunc(Number(config.dc)) : 15;
    const tierId = recipe?.checkTierId;
    if (!tierId) return fallback;
    const tiers = Array.isArray(config?.tiers) ? config.tiers : [];
    const tier = tiers.find((entry) => entry.id === tierId);
    const tierDc = Number(tier?.dc);
    return tier && Number.isFinite(tierDc) ? Math.trunc(tierDc) : fallback;
  }

  /**
   * The PLAYER-SAFE chat rows for a resolution's fired complications (issue 1286).
   *
   * Two things happen here and both are the point of the method existing at all:
   *
   *  1. **Redaction.** `publicComplications` is the audience filter, and it is applied on
   *     the way INTO the card rather than anywhere earlier, so the one place a fired list
   *     becomes chat is the one place the filter has to be looked for. A `gmOnly`
   *     complication has no row here on any client, INCLUDING a GM's: its card is created
   *     by the elected GM over the socket, from that GM's own re-read of the authored
   *     record, and never by the acting client's poster.
   *  2. **Naming the occurrence.** `publicComplications` carries a `componentId`, not a
   *     name — it is a projection of the complication, not of the system. The stage
   *     occurrence's component name is resolved here, against the system the poster
   *     already holds, because a player reading "you missed the iron ingot" on a card that
   *     also granted an iron ingot cannot otherwise reconcile the two.
   *
   * ## One row per FIRING, repeats are NOT collapsed, and each names its own stage
   *
   * A complication fires per result entry, so a component staged twice that went wrong
   * twice produces two rows carrying the same three strings. That repetition is the
   * report, not a rendering fault: collapsing it would tell a player one `1d6` was rolled
   * when two were, and neither this card nor the aggregate bulk card has ever deduped its
   * rows. They are told APART rather than merged: `position` carries each firing's place in
   * the ordered stage list — the same 1-based numbering, gaps included, that the salvage
   * panel's own stage rows use — and the shared renderer states it on a row only when
   * another row on the same card would otherwise draw identically.
   *
   * The DECISION to state it is not taken here. The aggregate bulk card's final row set is
   * assembled from many separate `salvage()` calls, so no single engine call can see
   * whether a row is about to collide with another; only the renderer can.
   *
   * @private
   * @param {?Array<object>} fired {@link fireComplications}'s `fired` list, unredacted.
   * @param {?object} system The owning crafting system, for the component-name lookup.
   * @returns {Array<{name: string, description: string, severity: string,
   *   componentName: string, position: number|null}>}
   */
  _complicationChatEntries(fired, system) {
    const componentIndex = getDefinitionIndex(resolvedComponentsFor(system));
    return publicComplications(fired).map((entry) => ({
      name: entry.name,
      description: entry.description,
      severity: entry.severity,
      componentName: findById(componentIndex, entry.componentId)?.name || '',
      position: entry.position,
    }));
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
   * @param {object|null} [params.tierStep]        - Realized routed tier-step evidence
   *   (`data.tierStepApplied`), or null when the rolled tier was never moved.
   * @param {Array|null} [params.firedComplications] - The UNREDACTED fired list from this
   *   resolution's `fireComplications` call, or null (issue 1286). Redacted here, at the
   *   write, via {@link _complicationChatEntries}; an empty or absent list renders
   *   nothing, so a system authoring no complications posts a byte-identical card.
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
    tierStep = null,
    firedComplications = null,
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
          quantity: awardedQuantityOf(item),
        })),
        consumed: (consumedIngredients || []).map(({ item, quantity }) => ({
          name: item?.name || '',
          img: item?.img || '',
          quantity: Number(quantity || 1),
        })),
        tools: toolEntries,
        rollValue: Number.isFinite(rollValue) ? rollValue : null,
        tierStep,
        failureReason: failureReason || '',
        complications: this._complicationChatEntries(firedComplications, system),
      },
      localize
    );

    try {
      await ChatMessage.create({
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
      resolvedComponentsFor(system).map((component) => [component?.id, component])
    );
    const entries = [];
    const seen = new Set();
    for (const pair of tools || []) {
      // Skip virtual-present canvas tools (no owned item) — no chip to render.
      if (!pair?.item) continue;
      const componentId = pair.tool?.componentId || null;
      const component = componentId ? componentById.get(componentId) : null;
      const key = componentId || pair.item?.uuid || pair.item?.name || null;
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
      // `data-models` requirement 13: the authored label and the registration snapshot
      // both outrank the linked component, and the matched item is the last resort. The
      // previous component-then-item ordering skipped an authored `label` entirely and
      // printed the raw item name for every item-sourced Tool (issue 1119).
      entries.push({
        name: resolveToolDisplayName(pair.tool, component, '') || pair.item?.name || '',
        img: this._toolChatImage(pair.tool, component) || pair.item?.img || '',
      });
    }
    return entries;
  }

  /**
   * The requirement-13 image for a chat chip, with the generic item-bag sentinel mapped
   * back to empty so the caller's own last-resort fallback (the matched item's artwork)
   * still applies rather than being pre-empted by a placeholder.
   * @private
   */
  _toolChatImage(tool, component) {
    const img = resolveToolDisplayImage(tool, component);
    return img === TOOL_IMAGE_SENTINEL ? '' : img;
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
      resolvedComponentsFor(system).map((component) => [component?.id, component])
    );
    // The evidence carries `toolId` (issue 1119) precisely so this card can reach the Tool.
    // Resolving `componentId` alone produced BLANK entries — not even a fallback — for an
    // item-sourced Tool, which has no component to name.
    const toolById = new Map(resolvedToolsFor(system).map((tool) => [tool?.id, tool]));
    const entries = [];
    const seen = new Set();
    for (const record of usedTools || []) {
      if (record?.broken !== true) continue;
      const componentId = record.componentId || null;
      const component = componentId ? componentById.get(componentId) : null;
      const tool = record.toolId ? (toolById.get(record.toolId) ?? null) : null;
      const key = record.toolId || componentId || record.itemUuid || null;
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
      entries.push({
        name: resolveToolDisplayName(tool, component, ''),
        img: this._toolChatImage(tool, component),
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
   * @param {object|null} [params.tierStep]    - Realized routed tier-step evidence
   *   (`data.tierStepApplied`), or null when the rolled tier was never moved.
   * @param {boolean} [params.suppressed] - When true, post nothing (issue 859). The
   *   caller owns the chat output for this run — a bulk salvage posts ONE aggregated
   *   card and suppresses the per-item ones. Gated in the SAME place as
   *   `features.chatOutput` so there is one early return, not two.
   * @param {Array|null} [params.firedComplications] - The UNREDACTED fired list from this
   *   salvage's `fireComplications` call, or null (issue 1286). Redacted here via
   *   {@link _complicationChatEntries}. Note the gate above covers it: `suppressed` and
   *   `chatOutput` govern the whole card, and a suppressed bulk row's complications reach
   *   the player on the AGGREGATE card instead. The MACRO is not gated by any of this —
   *   it is not chat, and it runs GM-side over the socket regardless.
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
    tierStep = null,
    suppressed = false,
    firedComplications = null,
  }) {
    if (suppressed || !system || system.features?.chatOutput !== true) return;

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
          quantity: awardedQuantityOf(item),
        })),
        consumed,
        tools: this._resolveBrokenToolChatEntries(usedTools, system),
        rollValue: Number.isFinite(rollValue) ? rollValue : null,
        tierStep,
        failureReason: failureReason || '',
        complications: this._complicationChatEntries(firedComplications, system),
      },
      localize
    );

    try {
      await ChatMessage.create({
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
    return resolvedComponentsFor(system);
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

  /**
   * The recipe narrowed to one execution step. The sets/result-groups narrowing and
   * the recipe+step `toolIds` UNION come from the SHARED {@link buildStepRecipeView}
   * that `CraftingListingBuilder` also uses (issue 917), so the read side evaluates
   * craftability against exactly the view this engine crafts against.
   *
   * The engine layers two execution-only concerns on top: `toolBonusModes` is dropped
   * (the step view must not carry the recipe-level bonus modes into a check), and
   * routing/selection take step-else-recipe precedence.
   * @private
   */
  _buildStepRecipeView(recipe, step) {
    const view = buildStepRecipeView(recipe, step);
    delete view.toolBonusModes;
    view.outcomeRouting = step?.outcomeRouting || recipe.outcomeRouting || null;
    view.resultSelection = step?.resultSelection || recipe.resultSelection || null;
    return view;
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
   * @param {object|null} [options.rollDecision] A PRE-RESOLVED roll decision
   *   (`{ bonus, rollMode, advantage }` — `promptCheckRoll`'s shape minus `confirmed`),
   *   threaded to the salvage check so ONE prompt answer drives every roll of a bulk
   *   run (issue 859). When set on an interactive salvage no dialog is shown. Absent on
   *   every single-item path.
   * @param {boolean} [options.suppressChat] When true, suppress this call's per-item
   *   salvage chat card (issue 859). A bulk run posts ONE aggregated card instead, so
   *   without this an N-item run would post the aggregate plus N strays. It does NOT
   *   suppress the interactive roll's own `Roll#toMessage` post — that is the Dice So
   *   Nice trigger and every roll keeps animating. Defaults to false.
   * @param {boolean} [options.deferComplicationDelivery] When true, this call still FIRES
   *   its component complications but does not emit them, returning the GM requests on
   *   `complicationRequests` for the caller to batch into ONE socket message (issue 1286).
   *   The bulk-salvage sibling of `suppressChat`, and required for the same reason: the
   *   GM-side rate limiter is sized on the stated assumption that a bulk salvage of any
   *   size emits ONE message, so a per-row emit would silently drop a long run's tail.
   *   Defaults to false, which delivers per resolution — correct for a single salvage.
   * @returns {Promise<{success: boolean, results: Item[]|null, message: string,
   *   salvageRun: object|null, cancelled?: boolean, misconfigured?: boolean,
   *   waiting?: boolean, complicationRequests?: object[], complications?: object[]}>}
   *   `complications` is the PLAYER-SAFE projection of what fired (issue 1286), present
   *   only when something player-visible did. `complicationRequests` is its GM-side
   *   counterpart and is addressing only; the two are never the same list.
   */
  async salvage(actorUuid, craftingSystemId, componentId, options = {}) {
    const deferComplicationDelivery = options?.deferComplicationDelivery === true;
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

    const managedItems = resolvedComponentsFor(system);
    const component = findById(getDefinitionIndex(managedItems), componentId);
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
          // The SAME additive discriminator the misconfigured-check abort carries
          // (issue 859), and the branch that actually fires in a wired world: this gate
          // runs BEFORE `_runSalvageCraftingCheck`, so a GM-side config error
          // (unsupported mode, a routed success tier routing nowhere, a simple mode with
          // two success groups) never reaches the check's own misconfigured return.
          // Without the flag here a caller reads a broken config as a rolled failure and
          // tells the player "nothing recovered" — so they retry a config only their GM
          // can fix. `success` is unchanged, so nothing existing regresses.
          misconfigured: true,
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
    const componentItems = this.findComponentItems(actor, component, system);
    const totalAvailable = componentItems.reduce((sum, item) => sum + readStackQuantity(item), 0);
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
    const toolValidation = await this._validateTools(
      [actor],
      syntheticRecipe,
      salvageTools,
      null,
      actor,
      { excludedItems: selectedQuantityItems(componentItems, ingredientQuantity) }
    );
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
          // The run STARTED and is waiting on world time; nothing has been awarded yet
          // (issue 859). Additive and purely descriptive — `success` is unchanged — so
          // a caller can tell "started, come back later" from "succeeded and awarded"
          // without re-deriving it from `results == null`, which is also what a
          // no-result success looks like.
          waiting: true,
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
      toolItems: toolValidation.tools,
      rollDecision: options?.rollDecision ?? null,
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
        // Additive discriminator (issue 859): a GM-side config gap, NOT a rolled
        // failure. `success` is unchanged, so no existing consumer regresses; a caller
        // that cares can now say "not configured — tell your GM" instead of reporting a
        // failed roll that never happened.
        misconfigured: true,
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

      // THE FAILURE AWARD (issue 1098, decision 5). Until this issue `salvage()` returned
      // here unconditionally, so a failed salvage produced nothing whatever a component
      // authored — which is why `salvageCraftingCheck.failureResultPolicy: 'never'` is
      // what the 1.25.0 migration seeds onto every existing world.
      //
      // The disposition is EXPLICIT. `_resolveSalvageResultGroups` selects the reserved
      // group BY ROLE under `'failure'`; the default `'success'` would hand back
      // `resultGroups[0]`, which the retain-one clamp guarantees is the SUCCESS group —
      // i.e. the full success salvage output, awarded for failing.
      const failureResultGroups = activityPermitsFailureResults(system, 'salvage')
        ? this._resolveSalvageResultGroups(component, system, checkResult, salvageRun, 'failure')
        : [];
      // The success branch builds this view before `_createSingleResult`; the failure
      // branch had none, because it never created anything.
      const failureSalvageRecipeView =
        failureResultGroups.length > 0 ? this._buildSalvageRecipeView(component, system) : null;
      const { resultItems: failureResultItems, createdRecords: failureCreatedRecords } =
        failureSalvageRecipeView
          ? await this._awardSalvageResultGroups({
              actor,
              resultGroups: failureResultGroups,
              consumedItems: consumedOnFail,
              tools: toolValidation.tools,
              salvageRecipeView: failureSalvageRecipeView,
              checkResult,
            })
          : { resultItems: [], createdRecords: [] };

      if (salvageRunManager && salvageRun) {
        salvageRun = await salvageRunManager.completeRun(actor, salvageRun, 'failed', {
          consumedComponents: consumedOnFail.map(({ item, quantity }) => ({
            itemUuid: item.uuid,
            quantity,
          })),
          usedTools,
          // In the SUCCESS BRANCH'S SHAPE, through the same mapper. An empty list beside
          // real items on the actor is a durable contradiction, not a cosmetic gap.
          createdResults: failureCreatedRecords.map(salvageCreatedResultRecord),
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
        // The card renders these under its own failure-award section (issue 1098);
        // an empty list leaves every existing failure card byte-for-byte unchanged.
        results: failureResultItems,
        usedTools,
        failureReason: checkResult.message || 'Salvage check failed',
        rollValue: rollTotalForCard(checkResult),
        tierStep: tierStepForCard(checkResult),
        suppressed: options?.suppressChat === true,
      });

      return {
        success: false,
        // `null` when nothing was awarded — that is what every existing caller reads as
        // "a failed salvage produced nothing", and the bulk-salvage surfaces read THIS
        // value rather than the run record or the card (issue 1098, AF5/CF9).
        results: failureResultItems.length > 0 ? failureResultItems : null,
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
    // Captured HERE, beside the resolution it must agree with, because `completeRun`
    // below reassigns `salvageRun` and the ordered list is read off its captured
    // `resultOrder` (issue 1286). Null for every non-progressive salvage.
    const complicationInputs = this._progressiveSalvagePlanInputs(
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
    const { resultItems, createdRecords } = await this._awardSalvageResultGroups({
      actor,
      resultGroups,
      consumedItems,
      tools: toolValidation.tools,
      salvageRecipeView,
      checkResult,
    });

    // Component complications (issue 1286): after the items are on the actor — the award
    // is committed and a complication is strictly downstream of it — and before the card
    // is posted. The FAILURE branch above has no such site and needs none: progressive
    // salvage returns `[]` for a failed check, so there are no stages, no award and no
    // candidates.
    //
    // It sits BEFORE the run completion rather than after it because `firedComplications`
    // has to be written AT WRITE TIME, in the completion payload. `completeRun` moves the
    // run out of `active` and into `history`, and there is no supported way to amend a
    // history entry afterwards — so firing after it would force either a second, ad-hoc
    // actor-flag write or a run record that never carries what fired. The award itself is
    // untouched by the move: the items exist and the tools have broken by this line.
    let complicationRequests = null;
    let firedComplications = null;
    if (complicationInputs) {
      const fired = await this._fireComponentComplications({
        activity: 'salvage',
        actor,
        craftingSystemId,
        stages: complicationInputs.stages,
        award: complicationInputs.award,
        checkBreakage: this._resolveSalvageCheckBreakage(system),
        checkResult,
        deliver: deferComplicationDelivery !== true,
      });
      firedComplications = fired?.fired ?? null;
      if (deferComplicationDelivery === true) complicationRequests = fired?.gmRequests ?? [];
    }
    // TWO redactions of one list, deliberately: the run record narrows to four durable
    // keys, the return carries the seven a view-model renders. Both start from
    // `publicComplications`, so neither can widen past the player audience.
    const runComplications = salvageRunComplicationRecords(firedComplications);
    const playerComplications = publicComplications(firedComplications);

    if (salvageRunManager && salvageRun) {
      salvageRun = await salvageRunManager.completeRun(actor, salvageRun, 'succeeded', {
        consumedComponents: consumedItems.map(({ item, quantity }) => ({
          itemUuid: item.uuid,
          quantity,
        })),
        usedTools,
        createdResults: createdRecords.map(salvageCreatedResultRecord),
        checkResult: {
          success: true,
          outcome: checkResult.outcome,
          value: checkResult.value,
          data: checkResult.data || {},
        },
        failureReason: null,
        // Spread conditionally so a salvage that fired nothing — which is every
        // non-progressive salvage and most progressive ones — writes a record with no
        // such key at all, exactly as it did before this feature existed. `completeRun`
        // spreads its payload with NO allowlist, so the field persists once written.
        ...(runComplications.length > 0 && { firedComplications: runComplications }),
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
      tierStep: tierStepForCard(checkResult),
      suppressed: options?.suppressChat === true,
      firedComplications,
    });

    return {
      success: true,
      results: resultItems,
      message: `Successfully salvaged ${component.name || componentId}`,
      // Present ONLY when the caller asked to batch (bulk salvage). Addressing only, by
      // construction: a GM request carries no name, description, macro uuid or
      // visibility, so there is nothing here for a player-facing surface to redact.
      ...(complicationRequests === null ? undefined : { complicationRequests }),
      // The FIRED surface, and unlike the requests above it needs redacting — it is read
      // by the player's own salvage view-model, so a `gmOnly` complication must not be
      // here even when a GM is the acting user. Omitted entirely when nothing
      // player-visible fired, so an unchanged caller sees an unchanged return.
      ...(playerComplications.length > 0 && { complications: playerComplications }),
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
   *
   * ## Public because DESTROY must match exactly what SALVAGE matches
   *
   * Bulk destroy (issue 859) deletes the documents a player was shown as a component,
   * so it has to resolve them through this matcher and no other. The three sibling
   * matchers (`RecipeManager.ingredientMatchesItem`, `RecipeManager.toolMatchesItem`,
   * `essenceResolver.findMatchingComponent`) fall back case-INSENSITIVELY; matching more
   * broadly than salvage would delete items belonging to a differently-cased component.
   * Rather than let `BulkDestroyService` reach through the private spelling, the method
   * is part of the engine's surface. {@link CraftingEngine#_findComponentItems} remains
   * as a delegate for existing callers.
   *
   * @param {Actor} actor The owning actor whose items are searched.
   * @param {object} component The managed component to resolve items against.
   * @param {object} system The crafting system the component belongs to; its `id` scopes
   *   durable-identity resolution and its `components` list makes resolution list-aware.
   * @returns {Array<Item>} The matching items, in the actor's own item order. Empty when
   *   nothing matches, and when the component carries neither source references nor a name.
   */
  findComponentItems(actor, component, system) {
    const items = [...actor.items];
    const components = resolvedComponentsFor(system);
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
   * The private spelling {@link CraftingEngine#findComponentItems} was promoted from.
   *
   * Retained as a THIN DELEGATE, never a second copy: two bodies could drift, and a
   * drifted destroy matcher deletes the wrong documents. Kept because callers still name
   * it directly, and silent — no deprecation warning — because it is an internal spelling
   * of a method whose behaviour did not change, not a deprecated feature.
   *
   * @param {Actor} actor
   * @param {object} component
   * @param {object} system
   * @returns {Array<Item>}
   * @private
   */
  _findComponentItems(actor, component, system) {
    return this.findComponentItems(actor, component, system);
  }

  /**
   * Consume a specific total quantity from component items on the actor.
   * Deletes items when fully consumed, reduces quantity otherwise.
   * Returns array of { item, quantity: consumed }.
   *
   * WHICH items pay and HOW MUCH each pays is the first-fit drain policy, which now
   * lives in {@link planFirstFitDrain} (issue 1342) so the pooled companion consume
   * answers the question the same way this path does. Only the WRITES stayed here: this
   * one issues a `delete`/`update` per document, where the pooled consume batches per
   * actor, and the plan is parent-grouped so it can.
   *
   * The plan preserves this site's reader exactly — `readStackQuantity`, which coerces a
   * stored `0` to `1`, not the stored reader — and therefore its delete-versus-decrement
   * branch: `exhausted` is `toConsume >= available` by construction.
   *
   * `actor` is UNUSED and stays in the signature. Both callers pass the salvaging actor
   * and the items are already resolved from it, so the parameter documents whose
   * inventory is being drained; dropping it would churn every caller and every test for
   * nothing.
   *
   * @private
   */
  async _consumeComponentItems(actor, items, quantity) {
    const consumed = [];

    for (const take of planFirstFitDrain(items, quantity).takes) {
      consumed.push({ item: take.item, quantity: take.quantity });
      await (take.exhausted
        ? take.item.delete()
        : updateStackQuantity(take.item, take.remainingQuantity));
    }

    return consumed;
  }

  /**
   * Create every result in the resolved salvage groups and return both the created
   * documents (the `results` a caller returns) and the award records the run container
   * needs, keyed to the component each item was awarded FOR.
   *
   * ONE implementation, TWO callers (issue 1098): the success branch and the new
   * failure branch. A second copy of this loop would be a second place for the
   * stacked-twice de-dup and the `componentId` fallback chain to drift — and the failure
   * branch's whole purpose is that its award is recorded exactly as the success
   * branch's is.
   *
   * @param {object} args
   * @param {object} args.actor the salvaging actor (the engine is owner-scoped, so
   *   creation is `actor.createEmbeddedDocuments` and adds no permission surface)
   * @param {Array} args.resultGroups groups already resolved for the disposition
   * @param {Array} args.consumedItems `{item, quantity}` pairs consumed for this attempt
   * @param {Array} args.tools resolved tool items
   * @param {object} args.salvageRecipeView the synthetic recipe view results are made against
   * @param {object|null} args.checkResult
   * @returns {Promise<{resultItems: Array, createdRecords: Array<{item: object, componentId: string|null}>}>}
   * @private
   */
  async _awardSalvageResultGroups({
    actor,
    resultGroups,
    consumedItems,
    tools,
    salvageRecipeView,
    checkResult,
  }) {
    const resultItems = [];
    // Track the awarding component id alongside each created item without
    // reshaping `resultItems` (it is returned as `results` by both callers). Each
    // `result` carries its component id as `result.componentId` (legacy
    // `result.systemItemId`), the same accessor `_createSingleResult` and progressive
    // award use.
    const createdRecords = [];
    for (const group of resultGroups) {
      for (const result of group.results || []) {
        const created = await this._createSingleResult(
          actor,
          result,
          consumedItems,
          tools,
          salvageRecipeView,
          checkResult
        );
        // De-dup a stacked-twice component (same object returned): the award tag
        // accumulates, so one record carries the summed quantity (issue 858 review).
        if (created && !resultItems.includes(created)) {
          resultItems.push(created);
          createdRecords.push({
            item: created,
            componentId: result.componentId || result.systemItemId || null,
          });
        }
      }
    }
    return { resultItems, createdRecords };
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
   * ## The `disposition` argument (issue 1098, CF1)
   *
   * `'success'` — the DEFAULT — is byte-for-byte the behaviour every caller had before:
   * `simple` awards `resultGroups[0]` BY INDEX (the `_normalizeSalvage` retain-one clamp
   * guarantees the SUCCESS group sits there), `routed` routes by
   * `outcomeRouting[outcome]`, `progressive` spends the budget down `allGroups[0]`.
   *
   * `'failure'` is the new capability, and it selects DIFFERENTLY on purpose:
   *  - `simple` selects the single reserved `role: 'failure'` group **BY ROLE, NEVER BY
   *    INDEX**, returning `[]` when none is authored. This is the whole point of the
   *    argument: index 0 is the SUCCESS group by clamp, so `slice(0, 1)` on a failed
   *    check would award the full success salvage output — silent, exploitable, and
   *    invisible to any test asserting only that a failure produced something.
   *  - `routed` routes by `outcomeRouting[outcome]` for the FAILING tier's name. That
   *    branch never filtered on success, so it needs no change beyond being reached;
   *    `routedOutcomeTierNames` already offers failure tier names to the authoring select.
   *  - `progressive` returns `[]`: it has one success group against a budget and no tier
   *    to mark, so there is nothing a failure could select.
   *
   * The CALLER decides the disposition and the CALLER owns the policy gate; this
   * function never reads `failureResultPolicy`, so `disposition: 'failure'` always means
   * "the caller established that a failure may produce".
   *
   * @param {object} component
   * @param {object} system
   * @param {object|null} checkResult
   * @param {object|null} [salvageRun] The active run, carrying the result order captured
   *   at start (issue 651 D2). The order is read from HERE and never from settings.
   * @param {'success'|'failure'} [disposition] Which award to resolve.
   * @private
   */
  _resolveSalvageResultGroups(
    component,
    system,
    checkResult,
    salvageRun = null,
    disposition = 'success'
  ) {
    // The mode comes from the shared derivation (issue 859), which also flags a token
    // outside `simple|routed|progressive`. Legacy tokens are rewritten to canonical
    // values by the manager (salvage token normalizer) and the 1.4.0 migration, so an
    // unsupported token here is a CONFIG DEFECT rather than a legacy spelling — and
    // awarding for it would award the WRONG thing, since the resolver's `mode` coerces
    // to `simple` for display. `ResolutionModeService.validateSalvage` reports the same
    // config invalid, so award nothing. (This is also why there is no trailing
    // "unknown mode → every group" default: it awarded EVERY authored group, including
    // failure groups, for a configuration nothing supports.)
    const { mode, unsupportedMode } = resolveSalvageCheck(system);
    if (unsupportedMode) return [];

    const allGroups = Array.isArray(component.salvage?.resultGroups)
      ? component.salvage.resultGroups
      : [];
    const failureAward = disposition === 'failure';

    if (mode === 'simple') {
      // BY ROLE on failure, BY INDEX on success. See the header: the retain-one clamp
      // puts the SUCCESS group at index 0, so an index-based failure selection would
      // award the full success salvage output on a failed check.
      if (failureAward) {
        const failureGroup = allGroups.find((group) => group?.role === 'failure');
        return failureGroup ? [failureGroup] : [];
      }
      return allGroups.slice(0, 1);
    }

    // One success group against a budget, and no tier to mark: a failing check has
    // nothing to select here, so `progressive` awards nothing on failure whatever the
    // policy says (issue 1098).
    if (mode === 'progressive' && failureAward) return [];

    if (mode === 'routed') {
      const outcome = checkResult?.outcome == null ? null : String(checkResult.outcome);
      const routing = component.salvage?.outcomeRouting || {};
      const routedId = outcome ? routing[outcome] : null;
      if (!routedId) return [];
      return allGroups.filter((g) => g.id === routedId);
    }

    if (mode === 'progressive') {
      const resolved = this._resolveProgressiveSalvageAward(
        component,
        system,
        checkResult,
        salvageRun
      );
      if (!resolved) return [];

      // Progressive results are a quantity-less ordered list: the loop charges a
      // result's difficulty ONCE and awards that entry ONCE, so the GM expresses "more of
      // X" by listing X again rather than via a count. Force `quantity: 1` so the grant
      // path (`_createResultItems` reads `result.quantity`) produces one item per awarded
      // entry — this MIRRORS `ResolutionModeService._resolveProgressive`, which has always
      // done the same for recipes. Salvage did not, so it handed the authored objects
      // through by identity and a world that authored `quantity: 2` was awarded 2 for one
      // entry's difficulty (issue 676). `quantity` remains in the stored model and the
      // normalizer still clamps it; forcing it here leaves the stored value inert, so no
      // migration is required.
      //
      // THE FORCE STAYS HERE, on the award path, and not inside
      // `_resolveProgressiveSalvageAward`: that helper reports what the loop DID, and a
      // complication classifier reading a rewritten quantity off it would be reading this
      // method's grant-path concern.
      return [
        {
          ...resolved.group,
          results: resolved.award.awarded.map((result) => ({ ...result, quantity: 1 })),
        },
      ];
    }

    // Unreachable: `mode` is one of `simple | routed | progressive` by construction and
    // every one of the three returns above. Kept as an explicit exhaustiveness fallback
    // that awards NOTHING, never `allGroups`.
    return [];
  }

  /**
   * Resolve a progressive SALVAGE award, returning the plan inputs rather than the
   * award-shaped result groups (issue 1286).
   *
   * Split out of {@link _resolveSalvageResultGroups} because two callers need two
   * different halves of one computation: that method needs the awarded results to grant,
   * and the complication classifier needs the WHOLE ordered list plus the award loop's own
   * report of why it stopped. Re-deriving either from the other is what makes the salvage
   * and crafting classifiers drift apart.
   *
   * The three things this must not disturb, all verified by the salvage suite: the
   * `simple` branch's by-index success selection, the failure branch's by-ROLE lookup, and
   * the `quantity: 1` force — which stays at the award site, not here.
   *
   * Salvage normalizes the budget with `Number(value || 0)` (divergence 4) and skips
   * invalid-cost results (divergence 1: `invalidCost: 'skip'`). It does NOT zero the
   * budget after a `partial` tail award (divergence 2: `zeroRemainingOnPartial: false`),
   * which is why "was there a partial" is not inferable from `remaining` on this path and
   * the loop has to report `partialResult` itself; see #431.
   *
   * @private
   * @param {object} component the component being salvaged
   * @param {object} system its owning crafting system
   * @param {?object} checkResult the salvage check result, whose `value` is the budget
   * @param {?object} [salvageRun] the active run, carrying the result order captured at
   *   START. Read from HERE and never from settings (issue 651 D2): the run carries the
   *   order it was started with, so whichever client wins the world-time resume race is
   *   irrelevant. RUNLESS INVARIANT: no run manager -> no run -> no captured order ->
   *   AUTHORED ORDER, with deliberately NO settings fallback, because a harmless-looking
   *   gap-fill there would quietly restore the executing-user read the capture exists to
   *   close.
   * @returns {?{group: object, results: Array<object>, award: object}} `results` is the
   *   ORDERED stage list, one entry per occurrence; `award` is `resolveProgressiveAward`'s
   *   return VERBATIM. Null when the component authors no salvage result group.
   */
  _resolveProgressiveSalvageAward(component, system, checkResult, salvageRun = null) {
    const allGroups = Array.isArray(component?.salvage?.resultGroups)
      ? component.salvage.resultGroups
      : [];
    const group = allGroups[0];
    if (!group) return null;

    const authored = group.results || [];
    const results =
      component.salvage?.allowPlayerResultReorder === false
        ? authored
        : applyPlayerResultOrder(authored, salvageRun?.resultOrder ?? null);

    // Resolved ONCE for the whole award rather than per result: `costFor` is called for
    // every result in the group, and every bulk row calls this method, so a scan here was
    // a `rows x results x components` term.
    const managedItemIndex = getDefinitionIndex(resolvedComponentsFor(system));
    const award = resolveProgressiveAward({
      results,
      initialRemaining: Number(checkResult?.value || 0),
      costFor: (result) =>
        Number(findById(managedItemIndex, result.componentId || result.systemItemId)?.difficulty),
      awardMode: system?.salvageCraftingCheck?.progressive?.awardMode || 'equal',
      invalidCost: 'skip',
      zeroRemainingOnPartial: false,
    });

    return { group, results, award };
  }

  /**
   * The salvage stage occurrences and award report a firing needs, or null when this
   * salvage is not a progressive one (issue 1286).
   *
   * Called at the RESOLVE site rather than at the firing site, and held in a local until
   * the award is committed. That is not a style choice: `completeRun` reassigns
   * `salvageRun` to the completed record, and the ordered list is read off
   * `salvageRun.resultOrder`. Re-resolving after the completion write would silently fall
   * back to the AUTHORED order for any run whose completed record does not carry the
   * captured order, and the complication card would then name a different stage from the
   * one the award actually spent against.
   *
   * A component appearing several times in the ordered list contributes several stage
   * occurrences, each with its own `resultId` — which is what lets a firing name the
   * occurrence that produced it rather than marking every occurrence of that component.
   *
   * It runs the award loop a SECOND time, deliberately and cheaply: the loop is pure, the
   * component index is memoized on the candidate array, and the alternative — returning
   * both halves through `_resolveSalvageResultGroups` — would push a complication concern
   * into a method three other call sites use for the award alone. The two evaluations sit
   * on adjacent lines against identical inputs, which is what makes them agree, and it is
   * the same purity argument `resolveResultGroups` relies on to be asked three times.
   *
   * @private
   * @returns {?{stages: Array<object>, award: object}}
   */
  _progressiveSalvagePlanInputs(component, system, checkResult, salvageRun = null) {
    const { mode, unsupportedMode } = resolveSalvageCheck(system);
    if (unsupportedMode || mode !== 'progressive') return null;
    const resolved = this._resolveProgressiveSalvageAward(
      component,
      system,
      checkResult,
      salvageRun
    );
    if (!resolved) return null;
    const managedItemIndex = getDefinitionIndex(resolvedComponentsFor(system));
    const stages = resolved.results.map((result) => {
      const componentId = result?.componentId || result?.systemItemId || null;
      return {
        resultId: result?.id ?? null,
        componentId,
        component: componentId ? (findById(managedItemIndex, componentId) ?? null) : null,
      };
    });
    return { stages, award: resolved.award };
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
    const library = resolvedToolsFor(system);
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
   * Run the salvage crafting check for the active salvage resolution mode, dispatching
   * on the `(mode, checkUsable)` PAIR from the shared {@link resolveSalvageCheck}
   * derivation (issue 859).
   *
   * A salvage check is usable only when its mode has an authored, NON-EMPTY roll
   * formula (simple/routed/progressive) — the trimmed test the builder and the whole
   * crafting path already used, adopted here so a whitespace-only formula reads as "no
   * check" everywhere instead of rolling `"   "` and surfacing as a consuming failure.
   * Routed maps the rolled total onto a named outcome tier that
   * `_resolveSalvageResultGroups` routes through `component.salvage.outcomeRouting`.
   * When routed/progressive need a check outcome but no roll formula is configured, the
   * attempt fails loudly; every other mode with no usable formula is a no-op success.
   *
   * THE CHECK-MODIFIER CONTEXT IS BUILT ONCE, HERE (issue 1095), and threaded to whichever
   * runner dispatch selects. Salvage gained a modifier seam it never had: the system's one
   * catalogue is now selected over by `salvageCraftingCheck`'s own
   * `{defaultModifierPolicy, defaultModifierIds, maxModifierPicks}` triple, with the
   * COMPONENT as the `bySubject` subject (`component.salvage.checkModifierIds`). Building
   * it at the dispatch point rather than in each of the three runners is what stops a
   * fourth runner shipping without one — the same argument `_salvageRollOptions`'s own
   * header makes about the roll-decision attach.
   *
   * @param {object} [options]
   * @param {object|null} [options.rollDecision] A pre-resolved roll decision (issue 859
   *   bulk salvage) threaded to the runners' `rollOptions`; see `evaluateCheckRoll`.
   * @private
   */
  async _runSalvageCraftingCheck(
    component,
    system,
    actor,
    { interactive = false, toolItems = [], rollDecision = null } = {}
  ) {
    const { mode, config, checkUsable, requiresCheck, unsupportedMode } =
      resolveSalvageCheck(system);
    const runOptions = {
      interactive,
      toolItems,
      rollDecision,
      craftingModifier: buildCheckModifierContext(system, 'salvage', component),
    };

    // A mode outside `simple|routed|progressive` is a GM-side config defect, not a
    // rolled failure: report it exactly as a missing required formula is reported, so
    // `salvage()` aborts with ZERO mutation. This matches the answer
    // `ResolutionModeService.validateSalvage` already gives; coercing to `simple`
    // instead would award `resultGroups[0]` for a config validation calls invalid.
    // The authored token is read HERE for the MESSAGE only — never to dispatch on.
    if (unsupportedMode) {
      return {
        success: false,
        misconfigured: true,
        outcome: null,
        value: null,
        data: {},
        message: `Unsupported salvage resolution mode: ${system?.salvageResolutionMode}`,
      };
    }

    if (checkUsable) {
      if (mode === 'progressive') {
        return this._runSalvageProgressiveCheck(config, component, actor, runOptions);
      }
      if (mode === 'routed') {
        return this._runSalvageRoutedCheck(config, component, actor, runOptions);
      }
      return this._runSalvageSimpleCheck(config, component, actor, runOptions);
    }

    // A salvage check is REQUIRED to produce an outcome in progressive mode and in
    // routed mode (the routed result-group routing keys off the outcome tier name).
    if (requiresCheck) {
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
   * The interactive roll-options bag every salvage check runner passes to its shared
   * formula runner: {@link buildInteractiveRollOptions} plus the optional PRE-RESOLVED
   * `rollDecision` (issue 859 bulk salvage).
   *
   * The decision is attached ONLY when truthy — the same conditional-attach idiom
   * `buildInteractiveRollOptions` itself uses for `modifierChoice` — so a single-item
   * salvage's bag stays byte-identical to what it was before bulk existed, and
   * `evaluateCheckRoll` keeps taking the prompt path.
   *
   * One helper rather than three inline spreads: the attach is a single gate, so a
   * fourth runner cannot silently ship without it.
   *
   * `modifierChoice` (issue 1095) is built through the SAME
   * {@link CraftingEngine#_buildInteractiveModifierChoice} crafting uses, so salvage's
   * `playerPicks` prompt renders the modifier fieldset on exactly crafting's terms —
   * interactive only, over an authored post-shim formula, under `playerPicks`, and only
   * with at least two eligible modifiers. The pre-1095 claim that "salvage never passes
   * one, so their dialog is unchanged" is retired with the crafting-only catalogue.
   * @private
   */
  _salvageRollOptions({
    interactive,
    actor,
    component,
    dc,
    rollDecision = null,
    formula = '',
    craftingModifier = null,
  }) {
    const rollOptions = buildInteractiveRollOptions({
      interactive,
      actor,
      name: component?.name,
      activity: 'Salvage',
      img: component?.img,
      dc,
      modifierChoice: this._buildInteractiveModifierChoice(
        formula,
        craftingModifier,
        actor,
        interactive
      ),
    });
    if (rollDecision) rollOptions.rollDecision = rollDecision;
    return rollOptions;
  }

  /**
   * Salvage simple pass/fail check: compare the rolled total against the resolved DC
   * (per-component override ?? default), honouring per-die crits. Delegates the roll
   * to the shared {@link runFormulaPassFail}.
   */
  async _runSalvageSimpleCheck(
    simple,
    component,
    actor,
    { interactive = false, toolItems = [], rollDecision = null, craftingModifier = null } = {}
  ) {
    const dc = this._resolveSalvageDc(simple, component);
    // Tool bonuses append FIRST and the modifier term after them, exactly as on crafting:
    // `_appendToolCheckBonuses` rewrites the formula here, and `evaluateCheckRoll` appends
    // the resolved modifier scalar to whatever it is handed.
    const formula = await this._appendToolCheckBonuses(simple.rollFormula, toolItems);
    const result = await runFormulaPassFail({
      formula,
      dc,
      thresholdMode: simple.thresholdMode,
      triggers: simple.checkBreakage?.triggers,
      actor,
      label: 'Salvage',
      craftingModifier,
      rollOptions: this._salvageRollOptions({
        interactive,
        actor,
        component,
        dc,
        rollDecision,
        formula,
        craftingModifier,
      }),
    });
    return this._markEngineEvaluated(result);
  }

  /**
   * Salvage progressive check: the rolled total becomes the numeric `value` the
   * progressive salvage awarding spends against result difficulties. Delegates to the
   * shared {@link runFormulaProgressive}.
   */
  async _runSalvageProgressiveCheck(
    progressive,
    component,
    actor,
    { interactive = false, toolItems = [], rollDecision = null, craftingModifier = null } = {}
  ) {
    const formula = await this._appendToolCheckBonuses(progressive.rollFormula, toolItems);
    const result = await runFormulaProgressive({
      formula,
      triggers: progressive.checkBreakage?.triggers,
      actor,
      label: 'Salvage',
      craftingModifier,
      // No `dc`: progressive has none, and the prompt must show no DC chip.
      rollOptions: this._salvageRollOptions({
        interactive,
        actor,
        component,
        rollDecision,
        formula,
        craftingModifier,
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
  async _runSalvageRoutedCheck(
    routed,
    component,
    actor,
    { interactive = false, toolItems = [], rollDecision = null, craftingModifier = null } = {}
  ) {
    const dc = this._resolveSalvageDc(routed, component);
    const formula = await this._appendToolCheckBonuses(routed.rollFormula, toolItems);
    const result = await runFormulaRouted({
      formula,
      dc,
      thresholdMode: routed.thresholdMode,
      type: routed.type,
      relativeOutcomes: routed.relativeOutcomes,
      fixedOutcomes: routed.fixedOutcomes,
      triggers: routed.checkBreakage?.triggers,
      actor,
      label: 'Salvage',
      craftingModifier,
      // Clamp a below-lowest total to the closest tier (mirrors crafting); a per-
      // component dcOverride never opens a null-outcome dead zone.
      clampToNearest: true,
      rollOptions: this._salvageRollOptions({
        interactive,
        actor,
        component,
        dc,
        rollDecision,
        formula,
        craftingModifier,
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
