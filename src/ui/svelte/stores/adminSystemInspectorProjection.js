/**
 * adminSystemInspectorProjection — the `selectedSystem` inspector projection, as a pure
 * module (issue 1090).
 *
 * `buildSelectedSystemViewData` is the object every manager inspector, editor and settings
 * accordion reads, and `enrichRecipeItemLibrary` is its asynchronous second half: the
 * Books & Scrolls library resolved against the world (linked item name/img, derived type,
 * member recipes, learned-by count). Both were lifted out of `adminStore.js` UNCHANGED.
 *
 * THE RETURNED OBJECT IS A HAND-BUILT ALLOWLIST, and it is the one in this repo that has
 * cost the most. A field omitted here is invisible to the UI however correctly the
 * normalizer and the write path behave — that is how `componentCategories`,
 * `categoryIcons`, `toolBreakage`, the progressive check config and the failure-consumption
 * policy each shipped correct-but-unreadable. The per-field comments below are the record
 * of those; keep them attached to the fields they explain.
 *
 * The two-phase publish stays in the store, not here: `buildSelectedSystemViewData` paints
 * `recipeItemDefinitions` synchronously with stored fallbacks and `enrichRecipeItemLibrary`
 * produces the resolved list, which the store must spread into a NEW `selectedSystem`
 * object — Svelte's `$derived` only re-propagates on a changed parent reference, so an
 * in-place mutation leaves the enriched counts stuck on the phase-1 projection.
 *
 * Deliberately a LEAF under `stores/`: no `.svelte` imports from `src/ui/svelte/stores/`,
 * so this module cannot reach a mounted-component test's dependency closure.
 */
import { getFabricateFlag } from '../../../config/flags.js';
import { readLearnedRecipeEntries } from '../../../systems/recipeKeyedFlagEntries.js';
import { activityFailureResultPolicy } from '../../../utils/failureResultPolicy.js';
import { normalizeCharacterPrerequisiteList } from '../../../systems/characterPrerequisites.js';
import {
  normalizeModifierPolicy,
  resolveActiveCraftingCheckFormula,
  resolveActiveGatheringCheckFormula,
  resolveActiveSalvageCheckFormula,
} from '../../../systems/checkModifierResolver.js';
import { craftingEffect } from '../apps/manager/crafting/craftingVisibility.js';
import {
  recipeItemLabelFromUuid as _recipeItemLabelFromUuid,
  recipeItemTypeFromRecipeCount as _recipeItemTypeFromRecipeCount,
} from '../apps/manager/knowledge/knowledgeStudio.js';

import {
  clonePlain as _clonePlain,
  normalizeGatheringLibraryTool as _normalizeGatheringLibraryTool,
} from './adminStoreInternals.js';

// ---------------------------------------------------------------------------
// Books & Scrolls recipe-item projection (issue 511)
//
// The library surface reads each recipe item enriched with its resolved
// game-world item (name/img/type), its linked recipes (reverse ref via
// `recipe.recipeItemId`), and how many world actors have learned any of those
// recipes. Resolution touches `fromUuid`, so it is done ONCE per refresh and
// batched with `Promise.all` (never inside a Svelte `$derived`/`$effect`).
// ---------------------------------------------------------------------------

// `_recipeItemLabelFromUuid` and `_recipeItemTypeFromRecipeCount` now live in the
// pure `knowledge/knowledgeStudio.js` projection and are imported back at the top
// of this module (issue 785). The Books & Scrolls Type pill and the Knowledge
// surface's Type column read the SAME derivation, so the two cannot drift.

// Synchronous fallback projection painted immediately in refresh phase 1. The
// resolved name/img/type, linked `recipes[]`, and `learnedByCount` are filled in
// asynchronously by {@link enrichRecipeItemLibrary} before the phase-2 publish.
function _projectRecipeItemDefinitionSync(def) {
  const originItemUuid = def?.originItemUuid || '';
  return {
    id: def?.id || '',
    originItemUuid,
    img: def?.img || '',
    description: def?.description || '',
    enabled: def?.enabled !== false,
    // Book membership (issue 511 many-to-many) — the recipe ids this book contains.
    recipeIds: Array.isArray(def?.recipeIds) ? def.recipeIds.map((id) => String(id)) : [],
    caps: _clonePlain(def?.caps || {}),
    resolvedName: def?.name || _recipeItemLabelFromUuid(originItemUuid) || 'Recipe item',
    resolvedImg: def?.img || 'icons/svg/item-bag.svg',
    derivedType: _recipeItemTypeFromRecipeCount(0),
    linkMissing: false,
    recipes: [],
    learnedByCount: 0,
  };
}

// Resolve one linked game-world item. Returns `{ doc, missing }`; `missing` is
// true only when a uuid is present but cannot be resolved (deleted/broken link).
async function _resolveRecipeItemSource(uuid) {
  if (!uuid || typeof globalThis.fromUuid !== 'function') return { doc: null, missing: false };
  try {
    const doc = await globalThis.fromUuid(uuid);
    return { doc: doc || null, missing: !doc };
  } catch (_) {
    return { doc: null, missing: true };
  }
}

// Build a `recipeId -> Set(actorId)` index of learned recipes across every world
// actor (best-effort; `game.*` may be unavailable in headless contexts → empty).
//
// The learned map MUST be read through `getFabricateFlag` (issue 785). Every
// writer persists it at the doubly-nested `flags.fabricate.fabricate.learnedRecipes`
// path (`normalizeFlagKey` prefixes `fabricate.`, then the flattened update path
// nests it under the `fabricate` scope), so the old hand-written single-nested
// `actor.flags.fabricate.learnedRecipes` read resolved to `undefined` in a real
// world and "Learned by" was permanently 0. `getFabricateFlag` also try/catches
// `getFlag`'s inactive-scope throw.
//
// The ids come from the shared ENTRY-BOUNDARY reader, not `Object.keys` (issue 1143).
// `Document#update` nests a dotted recipe id into a subtree, so the top level yields the
// id's first segment and this panel under-reported learners for such a recipe while the
// deletion cascade — reading through the same reader — acted on the real id. Both must
// answer with the same ids or the GM surface and the mutation disagree.
function _buildLearnedRecipeActorIndex() {
  const index = new Map();
  const raw = globalThis.game?.actors;
  const actors = Array.isArray(raw?.contents)
    ? raw.contents
    : Array.isArray(raw)
      ? raw
      : typeof raw?.[Symbol.iterator] === 'function'
        ? [...raw]
        : [];
  for (const actor of actors) {
    const learned = getFabricateFlag(actor, 'learnedRecipes', null);
    if (!learned || typeof learned !== 'object') continue;
    const actorId = actor.id || actor._id || '';
    for (const recipeId of readLearnedRecipeEntries(learned).keys()) {
      if (!index.has(recipeId)) index.set(recipeId, new Set());
      index.get(recipeId).add(actorId);
    }
  }
  return index;
}

// The legacy reverse-ref index: `recipeItemId -> rows`. Built ONLY while the system's
// membership-basis marker is unset, so it costs nothing on a system that has switched
// basis and cannot be consulted there by accident.
function _legacyRecipeItemIndex(recipeList) {
  const index = new Map();
  for (const recipe of recipeList) {
    const key = String(recipe?.recipeItemId || '');
    if (!key) continue;
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(recipe);
  }
  return index;
}

// Enrich the synchronously-projected recipe items with async-resolved
// name/img/type plus their derived `recipes[]` and `learnedByCount`. Called once
// per refresh from the async phase; `fromUuid` resolution is batched.
//
// This is the SIXTH recipe-book membership reader, and the second of the pair the admin
// projection owns: it answers the same many-to-many from the BOOK's side, where
// `_recipeItemDefinitionsContaining` (now in the sibling `adminRecipeRowProjection.js`)
// answers it from the RECIPE's. Like that one, it takes the basis as a PARAMETER threaded
// from the raw manager system rather than inferring it — the inference available here
// would have been per DEFINITION ("this book's `recipeIds` is empty, so it must be
// un-migrated"), which is the retired system-wide predicate at definition scope.
//
// The parameter is BELT AND BRACES at this call site, and saying so is more useful than
// overstating it: `recipes` is the PROJECTED recipe list, whose `recipeItemId`
// `buildRecipeList` derives from `_recipeItemDefinitionsContaining` rather than copying
// the raw legacy scalar. So on a marked system an emptied book's former members already
// carry `recipeItemId: ''`, and `_legacyRecipeItemIndex` could not resurrect them even if
// this guard were dropped — the basis decision has already been taken upstream. What the
// parameter buys is that this function does not have a SECOND, differently-shaped opinion
// about the basis for a future caller to hand a rawer list to
// (`ui-integration/spec.md`, the membership-basis paragraph).
export async function enrichRecipeItemLibrary(
  projectedItems,
  recipes,
  membershipResolvesByRecipeIds
) {
  const items = Array.isArray(projectedItems) ? projectedItems : [];
  if (items.length === 0) return [];

  const recipeList = Array.isArray(recipes) ? recipes : [];
  const recipeById = new Map();
  for (const recipe of recipeList) recipeById.set(String(recipe?.id), recipe);
  // `=== true` exactly as `_recipeItemDefinitionsContaining` tests it: a missing boolean
  // fails to LEGACY, which is the safe direction, and `null` is what the index being
  // absent means downstream.
  const legacyIndex =
    membershipResolvesByRecipeIds === true ? null : _legacyRecipeItemIndex(recipeList);
  const toRecipeRef = (recipe) => ({
    id: recipe.id,
    name: recipe.name,
    category: recipe.category || '',
  });

  const actorIndex = _buildLearnedRecipeActorIndex();
  const resolved = await Promise.all(
    items.map((item) => _resolveRecipeItemSource(item.originItemUuid))
  );

  return items.map((item, index) => {
    const { doc, missing } = resolved[index];
    // Canonical membership: the book's `recipeIds`. `legacyIndex` is null once the
    // system resolves by `recipeIds`, so an empty array then means "this book has no
    // members" — full stop — rather than "this book has not migrated".
    const memberIds = Array.isArray(item.recipeIds) ? item.recipeIds : [];
    const linkedRecipes =
      memberIds.length > 0
        ? memberIds
            .map((id) => recipeById.get(String(id)))
            .filter(Boolean)
            .map(toRecipeRef)
        : (legacyIndex?.get(String(item.id)) || []).map(toRecipeRef);
    const learnedActors = new Set();
    for (const recipe of linkedRecipes) {
      const actorsForRecipe = actorIndex.get(recipe.id);
      if (actorsForRecipe) for (const actorId of actorsForRecipe) learnedActors.add(actorId);
    }
    return {
      ...item,
      resolvedName: doc?.name || item.resolvedName,
      resolvedImg: doc?.img || item.resolvedImg,
      derivedType: _recipeItemTypeFromRecipeCount(linkedRecipes.length),
      linkMissing: missing,
      recipes: linkedRecipes,
      learnedByCount: learnedActors.size,
    };
  });
}

/**
 * Which of the two FORMULA-DERIVED reasons a check-modifier catalogue is INERT applies, or
 * `null` when it is live. Discriminated rather than collapsed to one boolean because each cause needs
 * different GM-facing copy — "this mode rolls no check" is a different fix from "this
 * check has no formula yet". The order matters: a mode with no check slot has no formula
 * to inspect.
 *
 * There were THREE causes until issue 1094. The third — "a formula is authored but never
 * spends the placeholder" — retired with the placeholder itself: the resolved scalar is
 * appended to whatever the GM authored, so an authored formula always carries it and the
 * state is no longer reachable.
 *
 * PER-ACTIVITY SINCE ISSUE 1095. This used to be crafting-only, keyed directly on
 * `resolveActiveCraftingCheckFormula`; salvage and gathering now select over the same
 * catalogue, so they need the same answer and it must come from ONE derivation. The
 * argument is whichever of the three `resolveActive*CheckFormula` siblings owns the
 * activity — all three return the same shape for exactly this reason.
 *
 * A THIRD cause exists that this function cannot return, and the boundary is deliberate:
 * gathering `d100` is `noModifierSupport`, not `noCheck`. The d100 rolled against each
 * drop's chance IS that mode's check, so the mode does roll and only the seam to add a
 * modifier to that roll is missing. Deciding that needs the gathering resolution mode,
 * which is not derivable from this argument, so `ChecksView.svelte` applies the override
 * where the mode is in scope. This function answers the two questions a `{slot,
 * checkUsable}` pair can answer, and nothing here may be read as a claim that d100 rolls
 * no check.
 * @param {{ slot: string|null, checkUsable: boolean }} formula
 * @returns {'noCheck'|'noFormula'|null}
 */
function _checkModifierInertCause(formula) {
  if (formula.slot === null) return 'noCheck';
  if (!formula.checkUsable) return 'noFormula';
  return null;
}

/**
 * The check-modifier facts the Checks card and the recipe editor need beyond the raw
 * `craftingCheck` fields (issue 1055), projected as an extension of the allowlist below.
 *
 * `maxModifierPicks` is passed through RAW and is deliberately NOT defaulted — no `|| 1`,
 * no `?? 0`. Absence is a real value ("unlimited"), distinct from every authored bound,
 * and both authoring surfaces render it as such. A default here would forge a GM decision
 * that was never made and would silently truncate recipe picks already on disk. The key is
 * always emitted so the shape is fixed; its value is `undefined` when unbounded. What
 * absence MEANS at resolution time is `resolveMaxModifierPicks`'s answer (`Infinity`), and
 * this projection deliberately does not pre-empt it.
 *
 * "Does this rule defer the selection?" is deliberately NOT projected alongside it. Both
 * surfaces already receive the normalized rule, and `policyDefersSelection` exists on the
 * resolver so an authoring surface can ask it directly — which is what the Checks card
 * does, live against the radio group the GM is clicking. A projected copy would answer
 * from the last persisted rule and would be the one derivation on this axis capable of
 * disagreeing with the card that reads it.
 *
 * PER-ACTIVITY SINCE ISSUE 1095. One builder, three call sites, so the salvage and
 * gathering Modifiers sections can report `noCheck` / `noFormula` at all — before this
 * they had no inert-cause projection and no way to say that their selection reaches no
 * roll. The activity picks which `resolveActive*CheckFormula` sibling answers and which
 * check block the cap is read from.
 *
 * GATHERING IS ANSWERED AGAINST `d100` (issue 1095, decision 8), because the gathering
 * resolution mode lives on the gathering ECONOMY config, which this projection cannot
 * see, and both formula-rolled modes are rendered `disabled` pending issue 683 — so
 * `d100` is the only mode a GM can select today.
 *
 * ITS `modifierFormulaInertCause` IS THEREFORE `noCheck`, AND THAT IS NOT THE GM-FACING
 * ANSWER. Gathering `d100` is `noModifierSupport`: the d100 rolled against each drop's
 * chance IS that mode's check, and only the seam to add a modifier to it is missing.
 * `ChecksView.svelte` overrides the cause where the mode is in scope, and no surface reads
 * this projection's gathering cause today — the one consumer
 * (`CraftingSystemManagerRoot.svelte`, for the recipe Overview banner) reads the CRAFTING
 * projection only. Any future consumer must apply the same override rather than render
 * `noCheck`'s copy, which tells a GM the mode rolls nothing and to switch to one that
 * rolls. When 683 ships, the real mode is threaded in here and this stops being a
 * constant.
 *
 * @param {object} system The selected crafting system.
 * @param {'crafting'|'salvage'|'gathering'} activity
 */
function _buildCheckModifierRuleView(system, activity) {
  const formula =
    activity === 'salvage'
      ? resolveActiveSalvageCheckFormula(system)
      : activity === 'gathering'
        ? resolveActiveGatheringCheckFormula(system)
        : resolveActiveCraftingCheckFormula(system);
  const check =
    activity === 'salvage'
      ? system?.salvageCraftingCheck
      : activity === 'gathering'
        ? system?.gatheringCraftingCheck
        : system?.craftingCheck;
  return {
    modifierFormulaInertCause: _checkModifierInertCause(formula),
    maxModifierPicks: check?.maxModifierPicks,
  };
}

/**
 * The selection triple every activity check carries over the system catalogue (issue
 * 1095), projected through ONE derivation so the three cannot drift.
 *
 * `defaultModifierPolicy` is normalized through the resolver's own vocabulary rather than
 * a local copy of it, for the reason the crafting projection already records: a
 * hand-maintained allowlist here silently rewrote a stored `playerPicks` to `addAll` and
 * made the rule unselectable (issue 855). It also means a world still carrying the
 * pre-1095 `byRecipe` projects as `bySubject`, so the radio group selects correctly
 * before the migration has run.
 *
 * @param {object|null|undefined} check The persisted activity check block.
 * @param {object} system The selected crafting system.
 * @param {'crafting'|'salvage'|'gathering'} activity
 */
function _buildCheckModifierSelectionView(check, system, activity) {
  return {
    defaultModifierPolicy: normalizeModifierPolicy(check?.defaultModifierPolicy) ?? 'addAll',
    defaultModifierIds: Array.isArray(check?.defaultModifierIds)
      ? [...check.defaultModifierIds]
      : [],
    ..._buildCheckModifierRuleView(system, activity),
  };
}

/**
 * Build the full selectedSystem view data object.
 * Mirrors RecipeManagerApp._prepareContext() selectedSystem section.
 */
export function buildSelectedSystemViewData(
  selectedSystem,
  managedItemOptions,
  componentTagOptions,
  essenceDefinitions,
  availableScriptMacros,
  sceneOptions
) {
  if (!selectedSystem) return null;

  const showTags = true;
  const showEssences = selectedSystem.features?.essences === true;

  const listMode = selectedSystem.recipeVisibility?.listMode || 'global';
  const showRecipeVisibilityKnowledgeOptions = listMode === 'knowledge';
  const showRecipeVisibilityPlayerNote = listMode === 'player';

  // Flat system-level visibility strategy (issue 511, PR-B). `visibilityMode`
  // gates the whole Crafting surface; `craftingEffect` is the matrix contract
  // consumed by the Settings effect panel and nav gating alike.
  const visibilityMode = selectedSystem.visibilityMode || 'knowledge';

  return {
    id: selectedSystem.id,
    name: selectedSystem.name,
    description: selectedSystem.description,
    enabled: selectedSystem.enabled !== false,
    resolutionMode: selectedSystem.resolutionMode || 'simple',
    visibilityMode,
    craftingEffect: craftingEffect(visibilityMode),

    features: {
      recipeCategories: true,
      itemTags: true,
      essences: selectedSystem.features?.essences === true,
      multiStepRecipes: selectedSystem.features?.multiStepRecipes === true,
      propertyMacros: selectedSystem.features?.propertyMacros === true,
      craftingChecks: selectedSystem.features?.craftingChecks === true,
      outcomeRouting: selectedSystem.features?.outcomeRouting === true,
      effectTransfer: selectedSystem.features?.effectTransfer === true,
      gathering: selectedSystem.features?.gathering === true,
      salvage: selectedSystem.features?.salvage === true,
      // Default-ON policy flag (issue 848): an explicit false forfeits inputs on a
      // player cancel; anything else (incl. a legacy system missing the key) refunds.
      refundOnPlayerCancel: selectedSystem.features?.refundOnPlayerCancel !== false,
    },

    categories: selectedSystem.categories || [],
    // The system-level COMPONENT category vocabulary (issue 676). This hand-built
    // projection is an allowlist: without this line the Tags & Categories screen's
    // component-categories section is permanently EMPTY, however correctly the
    // normalizer and the write path behave. Distinct from `_buildManagedItemOptions`,
    // which projects the per-component `category` field.
    componentCategories: selectedSystem.componentCategories || [],
    // Per-category icon maps (issue 689), parallel to the string vocabularies
    // above. Like `componentCategories`, these are invisible to the Tags &
    // Categories screen unless surfaced through this hand-built allowlist, however
    // correctly the normalizer and write path behave.
    categoryIcons: selectedSystem.categoryIcons || {},
    componentCategoryIcons: selectedSystem.componentCategoryIcons || {},
    itemTags: selectedSystem.itemTags || selectedSystem.tags || [],
    essenceDefinitions,
    managedItemOptions,
    // `{ id, tags }` projection consumed only by the recipe Validation tab's
    // overlapping-requirement detection. Empty when no component carries tags →
    // the overlap check no-ops.
    componentTagOptions,
    // System-owned library Tools (canonical source). Surfaced here so the Tools
    // browser and the gathering task editor's tool picker read the system's
    // tools rather than the gathering-config copy.
    tools: Array.isArray(selectedSystem.tools)
      ? selectedSystem.tools.map((tool) => _normalizeGatheringLibraryTool(tool))
      : [],

    // System-owned character prerequisite library (issue 544). Surfaced through
    // the allowlist projection (like `tools`) so the System Settings accordion
    // and the recipe-item learning-gate picker read them.
    characterPrerequisites: normalizeCharacterPrerequisiteList(
      selectedSystem.characterPrerequisites
    ),

    requirements: selectedSystem.requirements || {
      time: { enabled: true },
      currency: { enabled: false, units: [] },
    },

    craftingCheck: {
      enabled: selectedSystem.craftingCheck?.enabled === true,
      mode: selectedSystem.craftingCheck?.mode || 'passFail',
      outcomesText: Array.isArray(selectedSystem.craftingCheck?.outcomes)
        ? selectedSystem.craftingCheck.outcomes.join(', ')
        : '',
      // The structured routed config edited in the Checks editor must be surfaced
      // so the editor can read back what was persisted (otherwise it always seeds
      // empty and edits look like they never saved).
      routed: selectedSystem.craftingCheck?.routed
        ? _clonePlain(selectedSystem.craftingCheck.routed)
        : null,
      // Same rationale as `routed`: surface the simple pass/fail config so the
      // simple-mode editor (and the recipe tier dropdown) can read it back.
      simple: selectedSystem.craftingCheck?.simple
        ? _clonePlain(selectedSystem.craftingCheck.simple)
        : null,
      // Surface the progressive config too (issue 419) so the progressive editor
      // reads back its persisted checkBreakage (the deep _clonePlain preserves the
      // nested block). Previously unsurfaced, so a progressive edit seeded empty.
      progressive: selectedSystem.craftingCheck?.progressive
        ? _clonePlain(selectedSystem.craftingCheck.progressive)
        : null,
      // Failure consumption policy (issue 712). Unprojected before, so the checks
      // editor could not read it back. Mirror the manager normalizer's defaults so
      // a system authored with `consumeIngredientsOnFail: false` seeds OFF, not the
      // default ON — a dropped default-true field is inverted, not merely absent.
      consumption: {
        consumeIngredientsOnFail:
          selectedSystem.craftingCheck?.consumption?.consumeIngredientsOnFail !== false,
        breakToolsOnFail:
          (selectedSystem.craftingCheck?.consumption?.breakToolsOnFail ??
            selectedSystem.craftingCheck?.consumption?.consumeCatalystsOnFail) === true,
      },
      // The failure-RESULT policy (issue 1098): the orthogonal produce axis, a SIBLING of
      // `consumption` rather than a member of it — which is why `saveCraftingCheckConsumption`
      // cannot carry it and each activity gets its own saver. Read through the shared
      // normalizer so the projection and the manager normalizer cannot disagree about what
      // an absent or unrecognized value means.
      failureResultPolicy: activityFailureResultPolicy(selectedSystem, 'crafting'),
      // Crafting's SELECTION over the system catalogue plus the pick cap and the two
      // derivations both authoring surfaces read (issues 770, 1055, 1095). Spread from a
      // named builder so this allowlist keeps stating what it carries while the giant
      // literal gains no new branches — see `_buildCheckModifierRuleView` for why
      // `maxModifierPicks` is passed through undefaulted. The CATALOGUE itself is no
      // longer here: it moved to the system level and is projected below.
      ..._buildCheckModifierSelectionView(selectedSystem.craftingCheck, selectedSystem, 'crafting'),
    },
    // The ONE system-level modifier library (issue 1117). This hand-built projection is an
    // ALLOWLIST: a field omitted here is INVISIBLE to the UI, however correctly the
    // normalizer and the write path behave — so without this line the library editor, all
    // three eligibility pickers, the recipe override control AND every gathering drop-row,
    // event and stamina-cost modifier picker all read empty. It absorbed both the
    // check-modifier catalogue (`system.checkModifiers`) and the gathering character-
    // modifier library (`gatheringConfig.systems[id].characterModifiers`).
    modifiers: Array.isArray(selectedSystem.modifiers)
      ? selectedSystem.modifiers.map((modifier) => _clonePlain(modifier))
      : [],
    // Tool-breakage authority (issue 419): surfaced so the Tools page and the
    // check editors can read it back (NOT projected before → invisible to the UI).
    // The engine normalizer defaults unknown/missing to "toolSpecific".
    toolBreakage: {
      authority:
        selectedSystem.toolBreakage?.authority === 'checkDriven' ? 'checkDriven' : 'toolSpecific',
    },
    salvageResolutionMode: selectedSystem.salvageResolutionMode || 'simple',
    salvageCraftingCheck: {
      enabled: selectedSystem.salvageCraftingCheck?.enabled === true,
      failureResultPolicy: activityFailureResultPolicy(selectedSystem, 'salvage'),
      // SALVAGE'S FAILURE CONSUMPTION, projected for the first time (issue 1098). It has
      // been persisted since 1.7.0 and surfaced NOWHERE, so the Salvage On-failure section
      // is its first authoring surface — and both defaults are traps that this projection
      // has to mirror EXACTLY, the way the crafting projection above already does:
      //
      //  - `consumeComponentOnFail` defaults TRUE via `!== false`, so a projection that
      //    dropped it would INVERT a system authored `false`, not merely lose it.
      //  - `breakToolsOnFail` is read NEW-THEN-LEGACY against `consumeCatalystsOnFail` (the
      //    1.7.0 rename). Reading the new key alone silently flips a pre-1.7.0 system from
      //    ON to OFF the first time a GM opens this section and saves.
      consumption: {
        consumeComponentOnFail:
          selectedSystem.salvageCraftingCheck?.consumption?.consumeComponentOnFail !== false,
        breakToolsOnFail:
          (selectedSystem.salvageCraftingCheck?.consumption?.breakToolsOnFail ??
            selectedSystem.salvageCraftingCheck?.consumption?.consumeCatalystsOnFail) === true,
      },
      // Surface the structured per-mode configs so the salvage Checks editors and
      // the per-component outcome-routing names can read back what was persisted
      // (otherwise they seed empty and edits look like they never saved).
      simple: selectedSystem.salvageCraftingCheck?.simple
        ? _clonePlain(selectedSystem.salvageCraftingCheck.simple)
        : null,
      routed: selectedSystem.salvageCraftingCheck?.routed
        ? _clonePlain(selectedSystem.salvageCraftingCheck.routed)
        : null,
      progressive: selectedSystem.salvageCraftingCheck?.progressive
        ? _clonePlain(selectedSystem.salvageCraftingCheck.progressive)
        : null,
      // Salvage's OWN selection over the system catalogue (issue 1095). New: salvage had
      // no modifier seam at all before this, so none of these three keys existed and the
      // salvage Modifiers section had nothing to read.
      ..._buildCheckModifierSelectionView(
        selectedSystem.salvageCraftingCheck,
        selectedSystem,
        'salvage'
      ),
    },
    // System-level gathering check. The gathering editor reads these back per
    // resolution mode (d100 has no editable config, so only progressive/routed
    // are surfaced alongside the active flag).
    gatheringCraftingCheck: {
      enabled: selectedSystem.gatheringCraftingCheck?.enabled === true,
      // Gathering carries the produce axis and NO consume axis (issue 1098) — it has no
      // consumption block at all, so the On-failure section renders this control and no
      // toggles beside it, plus the dormancy notice naming issue 683.
      failureResultPolicy: activityFailureResultPolicy(selectedSystem, 'gathering'),
      progressive: selectedSystem.gatheringCraftingCheck?.progressive
        ? _clonePlain(selectedSystem.gatheringCraftingCheck.progressive)
        : null,
      routed: selectedSystem.gatheringCraftingCheck?.routed
        ? _clonePlain(selectedSystem.gatheringCraftingCheck.routed)
        : null,
      // Gathering's OWN selection over the system library (issue 1095). Its
      // `modifierFormulaInertCause` reads `noCheck` for every system today, because `d100`
      // is the only gathering mode a GM can select (decision 8) and no sub-config is
      // authored for it.
      //
      // THE SECTION DOES NOT SAY `noCheck`; it OVERRIDES it. `ChecksView` answers gathering
      // `d100` with `noModifierSupport` and renders `ModifierInertNoModifierSupport`,
      // because the d100 rolled against each drop's chance IS that mode's check — only the
      // seam to add a modifier to it is missing. `noCheck`'s copy would deny the mode rolls
      // at all and send the GM to the two modes nobody can select yet. The dormancy notice
      // naming issue 683 renders alongside it, not instead of it.
      ..._buildCheckModifierSelectionView(
        selectedSystem.gatheringCraftingCheck,
        selectedSystem,
        'gathering'
      ),
    },

    alchemy:
      selectedSystem.resolutionMode === 'alchemy'
        ? {
            checkMode: ['none', 'simple', 'tiered'].includes(selectedSystem.alchemy?.checkMode)
              ? selectedSystem.alchemy.checkMode
              : 'none',
            learnOnCraft: selectedSystem.alchemy?.learnOnCraft === true,
            consumeOnFail: selectedSystem.alchemy?.consumeOnFail !== false,
            showAttemptHistoryToPlayers:
              selectedSystem.alchemy?.showAttemptHistoryToPlayers !== false,
          }
        : null,

    recipeVisibility: selectedSystem.recipeVisibility || {},
    // Books & Scrolls library projection (issue 511). Painted synchronously with
    // stored name/img fallbacks; refresh() overwrites this with the async-enriched
    // shape (resolved name/img/type, derived recipes[], learnedByCount) before the
    // phase-2 publish. Never resolve `fromUuid` here — this runs synchronously.
    recipeItemDefinitions: Array.isArray(selectedSystem.recipeItemDefinitions)
      ? selectedSystem.recipeItemDefinitions.map(_projectRecipeItemDefinitionSync)
      : [],
    teaserConfig: selectedSystem.teaserConfig || {
      enabled: false,
      discoveryMode: 'threshold',
      fragments: [],
    },
    showRecipeVisibilityKnowledgeOptions,
    showRecipeVisibilityPlayerNote,

    showTags,
    showEssences,
    availableScriptMacros,
    sceneOptions,
  };
}
