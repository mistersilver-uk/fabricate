/**
 * InventoryListingBuilder — player-facing owned-component listing / view-model
 * construction for the unified-window Inventory tab.
 *
 * The component-centric sibling of {@link CraftingListingBuilder}: a
 * one-directional read-side collaborator that projects the crafting backend
 * (`CraftingSystemManager` component/essence/tool libraries + `RecipeManager`
 * recipes) into redaction-safe inventory rows for the UI. It NEVER mutates state
 * and NEVER imports Foundry runtime globals — every Foundry-facing read flows
 * through its injected collaborators and the actor objects passed to
 * `buildListing`, so GM and player viewers resolve through one code path.
 *
 * Unlike the crafting builder it does NOT consult `RecipeVisibilityService`:
 * inventory lists only components the viewer's source actors actually own
 * (`totalQuantity > 0`), and an owned item is inherently known, so there is no
 * teaser/knowledge redaction to apply. Owned quantities are computed live by
 * matching each system's components against every source actor's items (the same
 * pure matchers the crafting/salvage flows use), aggregated per source and in
 * total. Essences the player has access to (carried inside owned components) are
 * projected as their own synthetic rows in addition to being listed on each
 * component's detail.
 */

import { getFabricateFlag } from '../config/flags.js';
// The ONE `toolBroken` reader, reused rather than re-implemented. That flag is the
// AUTHORITATIVE presence-gate disqualifier, and a second copy of its tolerant
// flag-shape handling would drift from the gate this projection has to agree with.
// The module is deliberately import-free, so this adds no transitive edge.
import { isToolBroken } from '../gatheringToolRuntime.js';
import { DEFAULT_RECIPE_IMAGE } from '../models/Recipe.js';
// Single-sourced with the GM UI so the builder and the recipe-item editor share one
// item-bag literal (the "treat as no image" sentinel).
import { GENERIC_ITEM_IMAGE } from '../ui/svelte/util/craftingImageDefaults.js';
import { findMatchingComponent } from '../utils/essenceResolver.js';
// The cumulative "reached at >=N" thresholds a progressive salvage's stage list shows.
// A deliberately import-free leaf.
import { progressiveStageThresholds } from '../utils/progressiveStageThresholds.js';
import { matchRecipeItemDefinition } from '../utils/sourceUuid.js';

import { evaluatePrerequisites } from './characterPrerequisites.js';

// Knowledge modes in which a recipe item (book) can teach a recipe. In these
// modes owning the book surfaces a Learn affordance in the inventory; other modes
// (item-only access, or a non-knowledge list mode) have nothing to learn, so the
// book is not projected as a learnable inventory row.
const LEARN_CAPABLE_MODES = new Set(['learned', 'itemOrLearned']);

// Knowledge modes in which the book grants crafting access by being held — the
// only modes where its craft-use ("Crafting uses") limit is meaningful.
const ITEM_ACCESS_MODES = new Set(['item', 'itemOrLearned']);

function stringOrEmpty(value) {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function stringOrNull(value) {
  const out = stringOrEmpty(value);
  return out.length > 0 ? out : null;
}

function actorKey(actor) {
  return actor?.id ?? actor?.uuid ?? null;
}

/** A finite number, or null. (`Number()` yields NaN, never null, so `?? null` cannot do this.) */
function finiteOrNull(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

/**
 * The per-item stack size, defaulting a missing/invalid/non-positive count to 1
 * (a present item is at least one). Mirrors the engine's `item.system.quantity`
 * read but never collapses a genuine larger stack.
 */
function itemStackQuantity(item) {
  const raw = Number(item?.system?.quantity);
  return Number.isFinite(raw) && raw > 0 ? raw : 1;
}

export class InventoryListingBuilder {
  /**
   * @param {object} deps
   * @param {object} deps.recipeManager - Source of recipes (`getRecipes`), for the used-by index.
   * @param {object} deps.craftingSystemManager - System/component/essence/tool library reads.
   * @param {object} [deps.recipeVisibility] - `RecipeVisibilityService`; when present, the
   *   used-by list for a non-GM viewer is restricted to recipes they have actually
   *   discovered (an undiscovered teaser recipe is never named), so browsing owned
   *   materials cannot leak the existence of hidden recipes.
   * @param {Function} [deps.getViewer] - Fallback viewer accessor when `buildListing` omits one.
   * @param {Function} [deps.localize] - `(key, data?) => string`.
   * @param {Function} [deps.nowWorldTime] - `() => number` current world time.
   * @param {Function} [deps.getGatheringTasksForSystem] - `(systemId) => task[]` returning the
   *   system's gathering tasks (from the `gatheringConfig` setting), for the "produced by"
   *   gathering index. Injected so the builder stays Foundry-global-free; defaults to none.
   */
  constructor({
    recipeManager = null,
    craftingSystemManager = null,
    recipeVisibility = null,
    getViewer = null,
    localize = (key) => key,
    nowWorldTime = () => 0,
    getGatheringTasksForSystem = null,
  } = {}) {
    this.recipeManager = recipeManager;
    this.craftingSystemManager = craftingSystemManager;
    this.recipeVisibility = recipeVisibility;
    this._getViewer = typeof getViewer === 'function' ? getViewer : null;
    this.localize = typeof localize === 'function' ? localize : (key) => key;
    this._nowWorldTime = typeof nowWorldTime === 'function' ? nowWorldTime : () => 0;
    this._getGatheringTasksForSystem =
      typeof getGatheringTasksForSystem === 'function' ? getGatheringTasksForSystem : () => [];
  }

  /**
   * Build the player Inventory listing for one crafting actor + component-source
   * actors. Only components with a positive owned quantity across the sources are
   * returned; essence rows are emitted for systems with essences enabled.
   *
   * @param {object} options
   * @param {object|null} [options.craftingActor] - The acting character.
   * @param {object[]} [options.componentSourceActors] - Additional inventory sources.
   * @param {object|null} [options.viewer] - Foundry user; falls back to `getViewer()`.
   * @returns {{
   *   selectedActorId: string|null,
   *   actor: object|null,
   *   sourceActorIds: Array<string|null>,
   *   worldTime: number,
   *   rows: object[],
   *   counts: { components: number, essences: number, total: number }
   * }}
   */
  buildListing({ craftingActor = null, componentSourceActors = [], viewer = null } = {}) {
    const resolvedViewer = viewer ?? this._getViewer?.() ?? null;
    const isGM = resolvedViewer?.isGM === true;
    const knowledgeSources = Array.isArray(componentSourceActors)
      ? componentSourceActors.filter(Boolean)
      : [];
    const sources = this._dedupeActors([craftingActor, ...knowledgeSources]);

    // Restrict the used-by list to recipes a non-GM viewer has actually discovered
    // (never a teaser), so browsing owned materials cannot reveal hidden recipes.
    // null = no restriction (GM, or no visibility service wired — e.g. unit tests).
    const allowedRecipeIds = this._resolveAllowedRecipeIds({
      isGM,
      viewer: resolvedViewer,
      craftingActor,
      knowledgeSources,
    });

    const rows = [];
    const systems = this.craftingSystemManager?.getSystems?.() ?? [];
    for (const system of Array.isArray(systems) ? systems : []) {
      rows.push(
        ...this._buildSystemRows(system, sources, allowedRecipeIds),
        ...this._buildRecipeItemRows(system, sources, craftingActor, allowedRecipeIds)
      );
    }

    rows.sort((left, right) => stringOrEmpty(left?.name).localeCompare(stringOrEmpty(right?.name)));

    const recipeItemCount = rows.filter((row) => row.isRecipeItem === true).length;
    const essenceCount = rows.filter((row) => row.isEssenceSource === true).length;
    return {
      selectedActorId: actorKey(craftingActor),
      actor: craftingActor ?? null,
      sourceActorIds: sources.map(actorKey),
      worldTime: Number(this._nowWorldTime() || 0),
      rows,
      counts: {
        components: rows.length - essenceCount - recipeItemCount,
        essences: essenceCount,
        recipeItems: recipeItemCount,
        total: rows.length,
      },
    };
  }

  /**
   * The set of recipe ids a non-GM viewer may see referenced in a used-by list —
   * every visible recipe that is NOT an undiscovered teaser. Returns null (no
   * restriction) for a GM or when no visibility service is wired.
   * @private
   */
  _resolveAllowedRecipeIds({ isGM, viewer, craftingActor, knowledgeSources }) {
    if (isGM || typeof this.recipeVisibility?.getVisibleRecipes !== 'function') return null;
    const entries =
      this.recipeVisibility.getVisibleRecipes({
        viewer,
        craftingActor,
        componentSourceActors: knowledgeSources,
      }) ?? [];
    const allowed = new Set();
    for (const entry of Array.isArray(entries) ? entries : []) {
      if (entry?.recipe?.id && entry?.access?.reason !== 'teaser') allowed.add(entry.recipe.id);
    }
    return allowed;
  }

  _dedupeActors(actors) {
    const seen = new Set();
    const out = [];
    for (const actor of actors) {
      if (!actor) continue;
      const key = actorKey(actor);
      if (key != null && seen.has(key)) continue;
      if (key != null) seen.add(key);
      out.push(actor);
    }
    return out;
  }

  /**
   * Project one crafting system's owned components (+ essence rows) for the given
   * source actors. Returns [] when nothing in this system is owned — the used-by
   * index is only built for systems that produced at least one owned row.
   * @private
   */
  _buildSystemRows(system, sources, allowedRecipeIds = null) {
    const components = Array.isArray(system?.components) ? system.components : [];
    if (components.length === 0) return [];

    // owned: componentId → { component, sources: Map<actorId, {name, img, qty}> }
    const owned = new Map();
    for (const actor of sources) {
      const key = actorKey(actor);
      const actorName = stringOrEmpty(actor?.name);
      const actorImg = stringOrNull(actor?.img);
      const items = actor?.items ? [...actor.items] : [];
      for (const item of items) {
        const component = findMatchingComponent(item, components, system?.id);
        if (!component?.id) continue;
        const qty = itemStackQuantity(item);
        let entry = owned.get(component.id);
        if (!entry) {
          // `item` is the first matched document in source order (crafting actor
          // first) — the representative document whose tool-usage counter decides the
          // row's derived `broken` verdict.
          entry = { component, sources: new Map(), item };
          owned.set(component.id, entry);
        }
        const current = entry.sources.get(key);
        if (current) {
          current.qty += qty;
        } else {
          entry.sources.set(key, { actorId: key, name: actorName, img: actorImg, qty });
        }
      }
    }

    if (owned.size === 0) return [];

    const systemId = stringOrNull(system?.id);
    const systemName = stringOrEmpty(system?.name);
    const essencesEnabled = system?.enableEssences === true;
    const essenceDefs =
      essencesEnabled && Array.isArray(system?.essenceDefinitions) ? system.essenceDefinitions : [];
    const essenceDefById = new Map(essenceDefs.map((def) => [def.id, def]));

    const { componentUsedBy, componentRequiredFor, essenceUsedBy, componentProducedBy } =
      this._buildRecipeIndexes(system, allowedRecipeIds);
    // Component ids registered as a Tool in the system library — a tool reads as a
    // tool even when no recipe references it.
    const toolComponentIds = new Set(
      (Array.isArray(system?.tools) ? system.tools : [])
        .filter((tool) => tool?.componentId)
        .map((tool) => tool.componentId)
    );

    // Preserve the source actor order (crafting actor first) for stable display.
    const orderedSourceIds = sources.map(actorKey);
    const orderSources = (sourceMap) =>
      orderedSourceIds
        .map((id) => sourceMap.get(id))
        .filter((source) => source && source.qty > 0)
        .map((source) => ({
          actorId: source.actorId,
          actorName: source.name,
          actorImg: source.img,
          quantity: source.qty,
        }));

    // Component library by id — shared by the salvage projection's result/stage rows,
    // which resolve each produced component id to a name/image/difficulty.
    const componentById = new Map(components.filter((entry) => entry?.id).map((c) => [c.id, c]));

    const componentRows = [];
    // essenceTotals: essenceId → Map<actorId, {name, img, qty}>
    const essenceTotals = new Map();
    // essenceContributors: essenceId → [{componentId, name, img, quantity}] — the
    // owned components that carry the essence and how much each contributes.
    const essenceContributors = new Map();

    for (const { component, sources: sourceMap, item: representativeItem } of owned.values()) {
      const rowSources = orderSources(sourceMap);
      const totalQuantity = rowSources.reduce((sum, source) => sum + source.quantity, 0);
      if (totalQuantity <= 0) continue;

      const rawEssences =
        component.essences && typeof component.essences === 'object' ? component.essences : {};
      // A component is "used by" a recipe when it is a direct ingredient/tool AND
      // when the recipe requires an essence the component carries (e.g. Ham, which
      // carries Bacon essence, is used by a recipe that needs Bacon essence).
      // Deduped by recipe so a recipe that uses it both ways appears once.
      const directUsedBy = componentUsedBy.get(component.id) ?? [];
      const usedBy = essencesEnabled
        ? this._mergeEssenceUsedBy(directUsedBy, rawEssences, essenceUsedBy)
        : directUsedBy;

      componentRows.push({
        key: `${systemId}:${component.id}`,
        componentId: stringOrNull(component.id),
        systemId,
        systemName,
        name: stringOrEmpty(component.name),
        img: stringOrNull(component.img),
        icon: null,
        description: stringOrEmpty(component.description),
        tags: Array.isArray(component.tags) ? component.tags.map(stringOrEmpty) : [],
        tier: component.tier ?? null,
        isEssenceSource: false,
        isTool: toolComponentIds.has(component.id),
        // A derived, read-only runtime verdict (issue 675). It drives the card overlay,
        // the "Broken" pip and the inspector banner — and it does NOT gate salvage.
        broken: this._isToolBroken(system, component.id, representativeItem),
        // The player-facing salvage contract, or null when not salvageable. Component
        // rows only: essence and recipe-item rows are never salvageable.
        salvage: this._buildSalvage({ system, component, componentById, rowSources }),
        totalQuantity,
        sources: rowSources,
        essences: essencesEnabled ? this._componentEssences(rawEssences, essenceDefById) : [],
        usedBy,
        requiredFor: componentRequiredFor.get(component.id) ?? [],
        producedBy: componentProducedBy.get(component.id) ?? [],
        contributors: [],
      });

      // Fold this component's essence content into the per-essence source totals
      // (perUnit content × owned quantity, per source actor) and the per-essence
      // contributing-components list (perUnit × this component's owned quantity).
      if (essencesEnabled) {
        for (const [essenceId, perUnit] of Object.entries(rawEssences)) {
          const content = Number(perUnit);
          if (!essenceDefById.has(essenceId) || !Number.isFinite(content) || content <= 0) continue;

          const contribution = content * totalQuantity;
          if (contribution > 0) {
            const contributors = essenceContributors.get(essenceId) ?? [];
            contributors.push({
              componentId: stringOrNull(component.id),
              name: stringOrEmpty(component.name),
              img: stringOrNull(component.img),
              quantity: contribution,
            });
            essenceContributors.set(essenceId, contributors);
          }

          let bySource = essenceTotals.get(essenceId);
          if (!bySource) {
            bySource = new Map();
            essenceTotals.set(essenceId, bySource);
          }
          for (const source of rowSources) {
            const existing = bySource.get(source.actorId);
            const add = content * source.quantity;
            if (existing) {
              existing.qty += add;
            } else {
              bySource.set(source.actorId, {
                actorId: source.actorId,
                name: source.actorName,
                img: source.actorImg,
                qty: add,
              });
            }
          }
        }
      }
    }

    const essenceRows = [];
    for (const [essenceId, bySource] of essenceTotals) {
      const def = essenceDefById.get(essenceId);
      const rowSources = orderSources(bySource);
      const totalQuantity = rowSources.reduce((sum, source) => sum + source.quantity, 0);
      if (totalQuantity <= 0) continue;
      essenceRows.push({
        key: `essence:${systemId}:${essenceId}`,
        componentId: stringOrNull(essenceId),
        systemId,
        systemName,
        name: stringOrEmpty(def?.name) || stringOrEmpty(essenceId),
        img: null,
        icon: stringOrNull(def?.icon),
        tags: [],
        tier: null,
        isEssenceSource: true,
        isTool: false,
        // An essence row is a synthetic aggregate, never a document: it cannot break
        // and it cannot be salvaged.
        broken: false,
        salvage: null,
        totalQuantity,
        sources: rowSources,
        essences: [],
        usedBy: essenceUsedBy.get(essenceId) ?? [],
        requiredFor: [],
        producedBy: [],
        contributors: essenceContributors.get(essenceId) ?? [],
      });
    }

    return [...componentRows, ...essenceRows];
  }

  /**
   * Project one system's owned recipe-item "books" as learnable inventory rows.
   *
   * A book row is emitted for each recipe-item definition the source actors own
   * (matched the same way the runtime learn path matches — by document uuid or
   * compendium source uuid), when the system's knowledge mode can teach from it
   * (`learned` / `itemOrLearned`). Each row carries the linked recipes (with a
   * per-recipe `learned` flag for the crafting actor) plus the book's own
   * use/learn limits read off a representative owned document, so the detail panel
   * can render the Learn affordance and the budget readouts. Returns [] when the
   * system defines no recipe items, is not in a learn-capable knowledge mode, or
   * the player owns none.
   * @private
   */
  _buildRecipeItemRows(system, sources, craftingActor, allowedRecipeIds = null) {
    const definitions = Array.isArray(system?.recipeItemDefinitions)
      ? system.recipeItemDefinitions
      : [];
    if (definitions.length === 0) return [];

    const visibility = system?.recipeVisibility ?? {};
    const knowledge = visibility?.knowledge ?? {};
    // Resolve the effective book access mode from the flat `visibilityMode` enum when
    // present (issue 511) — `item` → item-access, `knowledge` → item + learning —
    // falling back to the legacy `recipeVisibility.listMode`/`knowledge.mode` pair.
    // `learnable` gates the Learn affordance (learned / itemOrLearned); `grantsByItem`
    // gates the held-book craft affordance + its craft-use limit. A flat `item` book
    // therefore lists Craft controls, never Learn.
    const flat = system?.visibilityMode;
    let mode;
    if (flat === 'item') mode = 'item';
    else if (flat === 'knowledge') mode = 'itemOrLearned';
    else if (['global', 'restricted'].includes(flat)) return [];
    else if (visibility?.listMode === 'knowledge') mode = knowledge?.mode || 'itemOrLearned';
    else return [];
    const learnable = LEARN_CAPABLE_MODES.has(mode);
    const grantsByItem = ITEM_ACCESS_MODES.has(mode);

    const systemId = stringOrNull(system?.id);
    const systemName = stringOrEmpty(system?.name);

    // Group the system's recipes by the book that contains them. Canonical read is
    // each definition's `recipeIds[]` (many-to-many — a recipe may appear under several
    // books). Falls back to the legacy reverse ref (`recipe.recipeItemId`, or
    // `linkedRecipeItemUuid → definition originItemUuid`) only when no book carries
    // membership yet.
    const recipes = this.recipeManager?.getRecipes?.({ craftingSystemId: system?.id }) ?? [];
    const recipeList = Array.isArray(recipes) ? recipes : [];
    // System-wide recipe index (by id) — used for book membership below AND to
    // resolve Required Knowledge (`caps.learn.prerequisiteIds`) recipe names for the
    // per-book requirement readouts (issue 544).
    const recipeById = new Map(recipeList.map((recipe) => [stringOrNull(recipe?.id), recipe]));
    const eligible = (recipe) => {
      if (recipe?.enabled === false) return false;
      // Non-GM viewers never see an undiscovered (teaser) recipe named on a book.
      return !(allowedRecipeIds && !allowedRecipeIds.has(recipe?.id));
    };
    const recipesByDef = new Map();
    const anyMigrated = definitions.some(
      (def) => Array.isArray(def?.recipeIds) && def.recipeIds.length > 0
    );
    if (anyMigrated) {
      for (const def of definitions) {
        if (!def?.id) continue;
        const members = (Array.isArray(def.recipeIds) ? def.recipeIds : [])
          .map((id) => recipeById.get(stringOrNull(id)))
          .filter((recipe) => recipe && eligible(recipe));
        if (members.length > 0) recipesByDef.set(def.id, members);
      }
    } else {
      const defBySourceUuid = new Map(
        definitions.filter((def) => def?.originItemUuid).map((def) => [def.originItemUuid, def.id])
      );
      for (const recipe of recipeList) {
        if (!eligible(recipe)) continue;
        const defId =
          stringOrNull(recipe?.recipeItemId) ??
          (recipe?.linkedRecipeItemUuid
            ? (defBySourceUuid.get(recipe.linkedRecipeItemUuid) ?? null)
            : null);
        if (!defId) continue;
        const list = recipesByDef.get(defId) ?? [];
        list.push(recipe);
        recipesByDef.set(defId, list);
      }
    }

    // Owned books: defId → { def, sources: Map<actorId,{...,qty}>, item }, where
    // `item` is the first matched document in crafting-actor-first order (the
    // representative document whose use/learn counters the row reports).
    const defById = new Map(definitions.filter((def) => def?.id).map((def) => [def.id, def]));
    const owned = new Map();
    const orderedSourceIds = sources.map(actorKey);
    for (const actor of sources) {
      const key = actorKey(actor);
      const actorName = stringOrEmpty(actor?.name);
      const actorImg = stringOrNull(actor?.img);
      const items = actor?.items ? [...actor.items] : [];
      for (const item of items) {
        const def = this._matchRecipeItemDefinition(item, definitions, systemId);
        if (!def?.id) continue;
        const qty = itemStackQuantity(item);
        let entry = owned.get(def.id);
        if (!entry) {
          entry = { def, sources: new Map(), item };
          owned.set(def.id, entry);
        }
        const current = entry.sources.get(key);
        if (current) current.qty += qty;
        else entry.sources.set(key, { actorId: key, name: actorName, img: actorImg, qty });
      }
    }
    if (owned.size === 0) return [];

    const learnedMap = this._getLearnedMapFor(craftingActor);
    // Resolve the reader's roll data + the system's prerequisite library once so
    // each book's character-prerequisite learning gate (issue 544) can annotate
    // its recipes with a `learnBlocked` flag the Learn affordance disables on.
    const rollData = craftingActor?.getRollData?.() ?? {};
    const prerequisiteById = new Map(
      (Array.isArray(system?.characterPrerequisites) ? system.characterPrerequisites : []).map(
        (def) => [def.id, def]
      )
    );
    const rows = [];
    for (const [defId, { def, sources: sourceMap, item }] of owned) {
      // The gate is per-book: every recipe a book teaches shares its Required
      // Knowledge + character prerequisites, so evaluate once per definition.
      const bookGate = this._evaluateBookRequirements(def, {
        learnable,
        recipeById,
        prerequisiteById,
        learnedMap,
        rollData,
        allowedRecipeIds,
      });
      const rowSources = orderedSourceIds
        .map((id) => sourceMap.get(id))
        .filter((source) => source && source.qty > 0)
        .map((source) => ({
          actorId: source.actorId,
          actorName: source.name,
          actorImg: source.img,
          quantity: source.qty,
        }));
      const totalQuantity = rowSources.reduce((sum, source) => sum + source.quantity, 0);
      if (totalQuantity <= 0) continue;

      const linkedRecipes = (recipesByDef.get(defId) ?? []).map((recipe) => ({
        id: stringOrNull(recipe?.id),
        name: stringOrEmpty(recipe?.name),
        description: stringOrEmpty(recipe?.description),
        img: stringOrNull(this._resolveRecipeImg(recipe)),
        learned: Boolean(learnedMap?.[recipe?.id]),
        learnBlocked: bookGate.blocked,
        learnBlockedReason: bookGate.reason,
      }));

      rows.push({
        key: `recipeitem:${systemId}:${defId}`,
        recipeItemId: stringOrNull(defId),
        componentId: null,
        systemId,
        systemName,
        name: stringOrEmpty(def?.name),
        img: stringOrNull(def?.img),
        icon: null,
        description: stringOrEmpty(def?.description),
        tags: [],
        tier: null,
        isEssenceSource: false,
        isTool: false,
        // A book is never a Tool and is never salvageable, which is what keeps the
        // salvage tree out of the GM "How players see it" preview's RENDER.
        broken: false,
        salvage: null,
        isRecipeItem: true,
        learnable,
        // Item-mode books grant crafting by being held (not learning): the player
        // crafts their recipes directly. Exclusive with `learnable` so the UI shows
        // one affordance — Learn (knowledge) or Craft (item).
        craftable: grantsByItem && !learnable,
        totalQuantity,
        sources: rowSources,
        essences: [],
        usedBy: [],
        requiredFor: [],
        producedBy: [],
        contributors: [],
        recipes: linkedRecipes,
        // Per-book learning requirements (issue 544): read-only "Needs: <name>"
        // chips (Required Knowledge + Learning prerequisites) with per-requirement
        // met/unmet, surfaced in the book detail. Empty unless the book is learnable
        // AND Limited learning is on (parity with the runtime toggle-gating).
        requirements: bookGate.requirements,
        // Per-item access caps (issue 511) for the book-detail access badge + the
        // learn-all convenience CTA, read from the canonical per-item `def.caps` and
        // suppressed by applicability: the use cap only for a held (item) book, the
        // learn cap only for a teachable book.
        caps: {
          item: grantsByItem
            ? { limitUses: def?.caps?.item?.limitUses === true, maxUses: def?.caps?.item?.maxUses }
            : { limitUses: false },
          learn: learnable
            ? {
                limitLearning:
                  def?.caps?.learn?.limitLearning === true ||
                  def?.caps?.learn?.limitRecipes === true,
                learnsAllowed: def?.caps?.learn?.learnsAllowed ?? def?.caps?.learn?.maxRecipes,
                learnScope: def?.caps?.learn?.learnScope,
                learningMode: def?.caps?.learn?.learningMode,
              }
            : { limitLearning: false },
        },
        // Runtime remaining budgets (per owned document) — greys out a spent Learn
        // control. `caps` above drives the access badge + the learn-all convenience.
        limits: this._recipeItemLimits(def, item, { learnable, grantsByItem }),
      });
    }

    // Keep books grouped last within a system's rows by name (the top-level sort
    // re-sorts everything by name anyway).
    void defById;
    return rows;
  }

  /**
   * The player-facing salvage view-model for ONE component row (issue 675), or null
   * when the component is not salvageable. Essence and recipe-item rows are never
   * salvageable and always carry null.
   *
   * THE SOURCE IS `system.salvageCraftingCheck`, NOT `system.craftingCheck`. The
   * latter is the RECIPE check block. Both exist and both are typically authored, so
   * reading the wrong one renders plausibly while showing the player a formula and a
   * DC the engine will never use. Salvage normalizes, reads, and resolves its check
   * entirely separately (`_normalizeSalvageCraftingCheck`,
   * `CraftingEngine._runSalvageCraftingCheck`), including its OWN progressive award
   * mode.
   *
   * The panel is presentational: mode, usability, DC, thresholds and stage ordering
   * are all decided here, against the same fields the engine dispatches on.
   *
   * @param {object} args
   * @param {object} args.system  The owning crafting system.
   * @param {object} args.component  The component definition.
   * @param {Map<string, object>} args.componentById  System components by id.
   * @param {Array<{actorId: string|null}>} args.rowSources  Owned sources, crafting-actor first.
   * @returns {object|null}
   * @private
   */
  _buildSalvage({ system, component, componentById, rowSources }) {
    const salvage = component?.salvage ?? null;
    if (system?.features?.salvage !== true || salvage?.enabled !== true) return null;

    const check = system?.salvageCraftingCheck ?? {};
    // The mode the ENGINE dispatches on. `_runSalvageCraftingCheck` reads this and the
    // authored formula; `check.enabled` is never consulted anywhere on the salvage path.
    const mode = ['simple', 'routed', 'progressive'].includes(system?.salvageResolutionMode)
      ? system.salvageResolutionMode
      : 'simple';
    const config = check[mode] ?? null;
    // A check is USABLE iff its mode's roll formula is authored. That is the only gate —
    // so "no check" and "pass/fail" are not two modes, they are one `simple` mode read at
    // two usability states, and the body dispatches on the PAIR (mode, checkUsable).
    const rollFormula = typeof config?.rollFormula === 'string' ? config.rollFormula.trim() : '';
    const checkUsable = rollFormula.length > 0;
    // Routed and progressive REQUIRE a formula to produce an outcome; without one the
    // engine aborts with `{ success: false, misconfigured: true }` and zero mutation. So
    // there are no tiers or stages to show — only a GM-config state.
    const misconfigured = (mode === 'routed' || mode === 'progressive') && !checkUsable;
    const routedType = mode === 'routed' ? (config?.type === 'fixed' ? 'fixed' : 'relative') : null;

    return {
      enabled: true,
      mode,
      checkUsable,
      misconfigured,
      routedType,
      // simple / routed+relative: the base DC, per-component override applied.
      // routed+FIXED and progressive: null — there is no DC to show. A fixed outcome
      // matches on an absolute [start, end] segment of the roll range and `checkRoll`
      // never reads a DC for it (the GM editor hides the field outright); progressive
      // has no DC at all.
      dc: this._salvageDc({ mode, routedType, config, component }),
      // Default TRUE: an absent key reads as permitted; only an explicit false pins the
      // GM's authored order.
      allowPlayerResultReorder: salvage.allowPlayerResultReorder !== false,
      results: mode === 'simple' ? this._salvageResults(salvage, componentById) : [],
      // NAMED `routedOutcomes`, not `tiers`: `salvageCraftingCheck.routed.tiers` is a
      // real and DIFFERENT field (the recipe-tier list the salvage editors hide), and
      // `salvageCraftingCheck.outcomes` is a third. The source here is
      // `relativeOutcomes` / `fixedOutcomes`.
      routedOutcomes:
        mode === 'routed' && !misconfigured
          ? this._salvageRoutedOutcomes({ salvage, config, routedType, component, componentById })
          : [],
      stages:
        mode === 'progressive' && !misconfigured
          ? this._salvageStages({ system, salvage, componentById })
          : [],
      // SALVAGE'S OWN award mode (`salvageCraftingCheck.progressive.awardMode`),
      // independently authored from the recipe's. Surfaced because a stage threshold is
      // a property of its POSITION, so reordering invalidates the baked values and the
      // store must recompute them — which it cannot do without knowing the mode.
      awardMode:
        mode === 'progressive'
          ? system?.salvageCraftingCheck?.progressive?.awardMode || 'equal'
          : null,
      // Decision 8: the first OWNED actor holding it. Every listed source is already
      // owned (non-owned actors are filtered out before the listing is built).
      targetActorId: rowSources[0]?.actorId ?? null,
    };
  }

  /**
   * The salvage DC to DISPLAY, mirroring `CraftingEngine._resolveSalvageDc` — the
   * per-component override when set, else the check sub-object's default (fallback 15).
   *
   * Null for `routed + fixed` and for `progressive`: neither has a DC. This is the
   * highest-risk line in the projection, because the smoke fixture's routed salvage is
   * `relative`, so an override-shift applied to everything passes every gate while a
   * fixed-authored world is shown a routing table the engine will not honour.
   * @private
   */
  _salvageDc({ mode, routedType, config, component }) {
    if (mode === 'progressive') return null;
    if (mode === 'routed' && routedType === 'fixed') return null;
    const override = component?.salvage?.dcOverride;
    if (Number.isFinite(override)) return Math.trunc(override);
    const dc = Number(config?.dc);
    return Number.isFinite(dc) ? Math.trunc(dc) : 15;
  }

  /**
   * Project a salvage result group's results for display. Mirrors
   * `CraftingEngine._resolveSalvageResultGroups`'s `allGroups.slice(0, 1)` for simple
   * mode, so the list shown is the list the engine awards.
   * @private
   */
  _salvageResultItems(group, componentById) {
    const results = Array.isArray(group?.results) ? group.results : [];
    return results.map((result) => {
      const componentId = result?.componentId || result?.systemItemId;
      const produced = componentId ? componentById.get(componentId) : null;
      const quantity = Number(result?.quantity);
      return {
        id: stringOrNull(result?.id),
        componentId: stringOrNull(componentId),
        name: stringOrEmpty(produced?.name) || stringOrEmpty(componentId),
        img: stringOrNull(produced?.img),
        quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
      };
    });
  }

  /** Simple-mode salvage output: the first (only) result group. @private */
  _salvageResults(salvage, componentById) {
    const groups = Array.isArray(salvage?.resultGroups) ? salvage.resultGroups : [];
    return this._salvageResultItems(groups[0], componentById);
  }

  /**
   * Routed-mode outcome rows, forked on `routedType` — the two branches are unrelated
   * in `checkRoll.js` and must not be unified:
   *
   *  - RELATIVE: each outcome carries a `dc` DELTA, and its effective threshold is
   *    `baseDc + outcome.dc`. A per-component `dcOverride` shifts the base, so it
   *    shifts every relative threshold.
   *  - FIXED: each outcome carries an absolute, non-overlapping `[start, end]` segment
   *    of the roll range and matches on `start <= total <= end`. It NEVER reads a DC,
   *    so `dcOverride` does not shift it and the range renders exactly as authored.
   *
   * Each outcome's award is resolved the way the engine does it: the tier's NAME keys
   * `component.salvage.outcomeRouting` to a result group id.
   * @private
   */
  _salvageRoutedOutcomes({ salvage, config, routedType, component, componentById }) {
    const authored =
      routedType === 'fixed'
        ? Array.isArray(config?.fixedOutcomes)
          ? config.fixedOutcomes
          : []
        : Array.isArray(config?.relativeOutcomes)
          ? config.relativeOutcomes
          : [];
    const baseDc = this._salvageDc({ mode: 'routed', routedType: 'relative', config, component });
    const routing = salvage?.outcomeRouting || {};
    const groupById = new Map(
      (Array.isArray(salvage?.resultGroups) ? salvage.resultGroups : [])
        .filter((group) => group?.id)
        .map((group) => [group.id, group])
    );

    return authored.map((outcome) => {
      const name = stringOrEmpty(outcome?.name);
      const routedGroupId = name ? routing[name] : null;
      const delta = Number(outcome?.dc);
      return {
        id: stringOrNull(outcome?.id),
        name,
        success: outcome?.success === true,
        // Relative only: the effective, override-shifted threshold.
        threshold:
          routedType === 'relative' && Number.isFinite(delta) && Number.isFinite(baseDc)
            ? baseDc + delta
            : null,
        // Fixed only: the authored range, verbatim and unshifted.
        start: routedType === 'fixed' ? finiteOrNull(outcome?.start) : null,
        end: routedType === 'fixed' ? finiteOrNull(outcome?.end) : null,
        results: routedGroupId
          ? this._salvageResultItems(groupById.get(routedGroupId), componentById)
          : [],
      };
    });
  }

  /**
   * Progressive-mode stage list: the authored results of the first group, each with its
   * difficulty and its CUMULATIVE "reached at >=N" threshold.
   *
   * Thresholds come from the shared helper, fed SALVAGE's own award mode
   * (`system.salvageCraftingCheck.progressive.awardMode`) — independently authored from
   * the recipe's. Defaulting to the crafting award mode would silently violate the
   * canonical requirement that the displayed threshold and the awarded result agree for
   * every award mode and every budget.
   *
   * Baked in AUTHORED order. Thresholds are POSITIONAL, so they are only valid while the
   * list is in that order — the store recomputes them through this same helper after
   * applying the player's order.
   *
   * NO `quantity` is projected, unlike `_salvageResultItems`. That is the mode's rule,
   * not an omission: a progressive stage is awarded ONCE for its difficulty and grants a
   * single item (`CraftingEngine._resolveSalvageResultGroups` forces `quantity: 1`), so
   * repetition — the same component listed twice — is how a GM asks for more. Projecting
   * the stored, inert count let the row print "×2" beside a one-item award (issue 675).
   * @private
   */
  _salvageStages({ system, salvage, componentById }) {
    const groups = Array.isArray(salvage?.resultGroups) ? salvage.resultGroups : [];
    const results = Array.isArray(groups[0]?.results) ? groups[0].results : [];
    if (results.length === 0) return [];

    // The engine's own difficulty lookup: `resolveProgressiveAward` is fed
    // `Number(component.difficulty)` and skips a non-finite / <1 cost.
    const costFor = (result) =>
      Number(componentById.get(result?.componentId || result?.systemItemId)?.difficulty);
    const thresholds = progressiveStageThresholds({
      results,
      costFor,
      awardMode: system?.salvageCraftingCheck?.progressive?.awardMode || 'equal',
    });

    return results.map((result, index) => {
      const componentId = result?.componentId || result?.systemItemId;
      const produced = componentId ? componentById.get(componentId) : null;
      const difficulty = costFor(result);
      return {
        id: stringOrNull(result?.id),
        componentId: stringOrNull(componentId),
        name: stringOrEmpty(produced?.name) || stringOrEmpty(componentId),
        img: stringOrNull(produced?.img),
        // Null (not 0) when the component has no authored difficulty, so the row can say
        // "no difficulty" rather than claim a free stage.
        difficulty: Number.isFinite(difficulty) ? difficulty : null,
        // Null when the stage is unreachable at any budget (an invalid cost the award
        // loop skips): the row omits the badge rather than showing a wrong number.
        threshold: thresholds[index] ?? null,
      };
    });
  }

  /**
   * Whether an owned tool item is BROKEN — a read-only verdict, and NOT a salvage gate
   * (a broken salvageable tool is still salvageable; recycling it is the most useful
   * thing left to do with it).
   *
   * TWO sources, because brokenness has two: a persisted PAST FACT and a projected
   * FUTURE one. Reading only the second reports almost every real broken tool as
   * intact.
   *
   * 1. **`flags.fabricate.toolBroken` — the authoritative disqualifier.** It is a
   *    persisted past fact needing no roll, written by the `flagBroken` on-break action
   *    for EVERY breakage mode, and read as authoritative by the runtime presence gate
   *    (`gatheringToolRuntime.isToolBroken`, reused here). It is also the ONLY on-break
   *    mode that leaves a broken item in the player's inventory at all — `destroy` and
   *    `replaceWith` remove it — so it is the source that matters most: a
   *    `breakageChance` / `diceExpression` tool that has broken carries this flag and NO
   *    `toolUsage`, and reading usage alone renders it intact while the engine refuses
   *    it for crafting.
   *
   * 2. **Usage exhaustion — a projection, and narrower than it looks.** Only
   *    `limitedUses` is knowable ahead of an attempt (the other modes decide at attempt
   *    time by a chance roll or a formula). The read mirrors `Tool#applyUsage`'s write
   *    exactly — `toolUsage`, falling back to the pre-migration `catalystItemUsage`.
   *
   *    It is gated on `toolBreakage.authority !== 'checkDriven'`. Under the GM-selectable
   *    `checkDriven` authority the ACTIVE CHECK decides whether tools break and per-tool
   *    modes are ignored (except `immune`) — yet `applyToolUsageAndBreakage` still calls
   *    `applyUsage` unconditionally, so `timesUsed` climbs past `maxUses` on a tool the
   *    engine will never break by exhaustion. Ungated, the row would claim "Broken"
   *    permanently for a perfectly usable tool. Source 1 still applies under that
   *    authority: a forced break that flags the item is a real past fact.
   * @private
   */
  _isToolBroken(system, componentId, item) {
    if (!item) return false;
    // The persisted past fact — mode-agnostic and authority-agnostic.
    if (isToolBroken(item)) return true;

    // The projection. Never under checkDriven: usage still accrues there, but it
    // decides nothing.
    if (system?.toolBreakage?.authority === 'checkDriven') return false;
    const tools = Array.isArray(system?.tools) ? system.tools : [];
    const tool = tools.find((entry) => entry?.componentId === componentId) ?? null;
    if (tool?.breakage?.mode !== 'limitedUses') return false;
    const maxUses = Number(tool.breakage.maxUses);
    if (!Number.isFinite(maxUses) || maxUses <= 0) return false;
    const usage =
      getFabricateFlag(item, 'toolUsage', null) ||
      getFabricateFlag(item, 'catalystItemUsage', null) ||
      {};
    const timesUsed = Number(usage?.timesUsed || 0);
    return timesUsed >= maxUses;
  }

  /**
   * Resolve the recipe-item definition an owned item matches, through the one shared,
   * system-scoped matcher (`matchRecipeItemDefinition`) that the runtime
   * `RecipeVisibilityService` also consumes — the durable per-system
   * `roles[systemId].recipeItemDefinitionId` leaf (then the legacy scalar) first, then own
   * uuid, then compendium source, then `_stats.duplicateSource`. `systemId` scopes the
   * durable-identity tier (issue 567); the caller passes the current system's id. Routing
   * both consumers through the single matcher keeps them from drifting.
   * @private
   */
  _matchRecipeItemDefinition(item, definitions, systemId) {
    return matchRecipeItemDefinition(item, definitions, systemId).definition;
  }

  /**
   * The crafting actor's learned-recipe map (`{ recipeId: {...} }`), read through
   * the same fabricate flag the runtime learn path writes. Returns {} when unset.
   * @private
   */
  _getLearnedMapFor(actor) {
    const learned = getFabricateFlag(actor, 'learnedRecipes', {});
    return learned && typeof learned === 'object' ? learned : {};
  }

  /**
   * Evaluate a book's learning requirements (issue 544) for the inventory listing,
   * mirroring `RecipeVisibilityService` exactly but Foundry-free (the builder never
   * touches runtime globals). Covers BOTH gates:
   *
   *  - Required Knowledge (`caps.learn.prerequisiteIds`, folds legacy single
   *    `prerequisite`): recipes the reader must already have learned (AND). A
   *    prerequisite id that no longer resolves to a recipe is skipped (fail-open,
   *    parity with `_isPrerequisiteMet`).
   *  - Learning prerequisites (`caps.learn.characterPrerequisiteIds`): character
   *    conditions evaluated against `rollData` (AND). A dangling id is skipped
   *    (fail-open, parity with `_meetsCharacterPrerequisites`).
   *
   * Both gates are only enforced when the book is LEARNABLE **and**
   * `caps.learn.limitLearning` (or the legacy `limitRecipes`) is on — otherwise
   * ⇒ `blocked: false` and no requirements, matching the runtime toggle-gating (an
   * item-mode/craft-only book never learns, so its stored learn caps are inert).
   * `blocked` is true when any requirement is unmet, and `reason` joins the UNMET
   * requirements' names for the lock-chip tooltip.
   *
   * @param {object} def Recipe-item definition.
   * @param {object} ctx
   * @param {boolean} ctx.learnable Whether the book can be learned from at all.
   * @param {Map<string, object>} ctx.recipeById System recipes by id.
   * @param {Map<string, object>} ctx.prerequisiteById System prerequisites by id.
   * @param {object} ctx.learnedMap The reader's learned-recipes map.
   * @param {object} ctx.rollData Pre-resolved actor roll data.
   * @param {Set<string>|null} ctx.allowedRecipeIds Recipe ids visible to this reader
   *   (null for a GM = all visible); used to redact undiscovered required-recipe names.
   * @returns {{blocked: boolean, reason: string, requirements: Array<{kind: string, id: string, name: string, icon: string, met: boolean}>}}
   */
  _evaluateBookRequirements(
    def,
    { learnable, recipeById, prerequisiteById, learnedMap, rollData, allowedRecipeIds = null }
  ) {
    const learn = def?.caps?.learn || {};
    const limitLearning = learn.limitLearning === true || learn.limitRecipes === true;
    // A non-learnable (item/craft-only) book never learns, so its learn caps are
    // inert — no requirement chips and never learn-blocked. Off ⇒ same.
    if (!learnable || !limitLearning) return { blocked: false, reason: '', requirements: [] };

    const requirements = [];
    const unmetNames = [];

    // Required Knowledge — recipes the reader must already have learned (AND).
    // Prerequisite existence is resolved against the SYSTEM-scoped `recipeById`; this
    // is intentional — a book and its Required-Knowledge recipes share a crafting
    // system (the same-system case `RecipeVisibilityService` also targets).
    const prereqIds = Array.isArray(learn.prerequisiteIds)
      ? learn.prerequisiteIds
      : learn.prerequisite
        ? [learn.prerequisite]
        : [];
    // A required recipe's NAME is disclosed only when the reader may already see it
    // (visible in the listing, or already learned); otherwise it is redacted so a
    // teaser/undiscovered recipe is not leaked by name. The gate decision is unaffected.
    const nameVisible = (id) =>
      !allowedRecipeIds || allowedRecipeIds.has(id) || Boolean(learnedMap?.[id]);
    const hiddenLabel = () => {
      const key = 'FABRICATE.App.Inventory.Detail.HiddenRecipe';
      const localized = this.localize(key);
      return localized && localized !== key ? localized : 'a hidden recipe';
    };
    for (const rawId of prereqIds) {
      const id = stringOrNull(rawId);
      if (!id) continue;
      const recipe = recipeById.get(id);
      if (!recipe) continue; // dangling id → fail-open (skip)
      const met = Boolean(learnedMap?.[id]);
      const name = nameVisible(id) ? stringOrEmpty(recipe?.name) || id : hiddenLabel();
      // The learning/knowledge glyph (matches the Limits "Learning" card heading);
      // kept in lockstep with RecipeItemEditor's requiredKnowledgeChips icon.
      requirements.push({ kind: 'knowledge', id, name, icon: 'fas fa-graduation-cap', met });
      if (!met) unmetNames.push(name);
    }

    // Learning prerequisites — character conditions evaluated against roll data (AND).
    const charIds = Array.isArray(learn.characterPrerequisiteIds)
      ? learn.characterPrerequisiteIds
      : [];
    for (const rawId of charIds) {
      const id = stringOrNull(rawId);
      if (!id) continue;
      const prereqDef = prerequisiteById.get(id);
      if (!prereqDef) continue; // dangling id → fail-open (skip)
      const met = evaluatePrerequisites(rollData, [prereqDef]).passed;
      const name = stringOrEmpty(prereqDef?.name) || id;
      requirements.push({
        kind: 'character',
        id,
        name,
        icon: prereqDef?.icon || 'fas fa-user-check',
        met,
      });
      if (!met) unmetNames.push(name);
    }

    return { blocked: unmetNames.length > 0, reason: unmetNames.join(', '), requirements };
  }

  /**
   * The book's use / learn limit readouts from its canonical per-item `def.caps` and a
   * representative owned document's runtime counters. Each is null unless its cap is
   * enabled with a finite positive maximum (an invalid cap is treated as uncapped), and
   * is suppressed when the mode does not apply (use only for a held book, learn only for
   * a teachable book). The `remaining` is per-document; a `total`-scope learn budget is
   * enforced against the shared world pool at learn time, so this remaining is a lower
   * bound used only to grey out the Learn control.
   * @private
   */
  _recipeItemLimits(def, item, { learnable = false, grantsByItem = false } = {}) {
    const itemCaps = def?.caps?.item || {};
    const learnCaps = def?.caps?.learn || {};
    const finitePositive = (value) => {
      const num = Number(value);
      return Number.isFinite(num) && num > 0 ? num : null;
    };

    let uses = null;
    const maxUses =
      grantsByItem && itemCaps.limitUses === true ? finitePositive(itemCaps.maxUses) : null;
    if (maxUses != null) {
      const used = Number(getFabricateFlag(item, 'recipeItemUsage', {})?.timesUsed || 0);
      uses = { max: maxUses, used, remaining: Math.max(0, maxUses - used) };
    }

    let learning = null;
    const learnLimited =
      learnable && (learnCaps.limitLearning === true || learnCaps.limitRecipes === true);
    const maxRecipes = learnLimited
      ? finitePositive(learnCaps.learnsAllowed ?? learnCaps.maxRecipes)
      : null;
    if (maxRecipes != null) {
      const learned = Number(getFabricateFlag(item, 'recipeItemLearning', {})?.learnedCount || 0);
      learning = { max: maxRecipes, learned, remaining: Math.max(0, maxRecipes - learned) };
    }

    return { uses, learning };
  }

  /**
   * Resolve a recipe's display image the way the GM Manager / Crafting tab do:
   * the linked recipe-item image when present, else the recipe's own image.
   * @private
   */
  _resolveRecipeImg(recipe) {
    // A book's recipes show their OWN image, defaulting to the alchemical blueprint
    // (matching the GM app). Foundry's generic item-bag default is treated as "no
    // image" so an imported recipe that never had a real icon falls back to the
    // blueprint too, never the bag SVG.
    const img = typeof recipe?.img === 'string' ? recipe.img.trim() : '';
    return !img || img === GENERIC_ITEM_IMAGE ? DEFAULT_RECIPE_IMAGE : img;
  }

  /**
   * Join a component's `{ essenceId: perUnitQty }` map to the system's essence
   * definitions for name/icon display. Skips ids with no definition or a
   * non-positive quantity.
   * @private
   */
  _componentEssences(rawEssences, essenceDefById) {
    const out = [];
    for (const [essenceId, perUnit] of Object.entries(rawEssences)) {
      const quantity = Number(perUnit);
      const def = essenceDefById.get(essenceId);
      if (!def || !Number.isFinite(quantity) || quantity <= 0) continue;
      out.push({
        id: stringOrNull(essenceId),
        name: stringOrEmpty(def.name) || stringOrEmpty(essenceId),
        icon: stringOrNull(def.icon),
        quantity,
      });
    }
    return out;
  }

  /**
   * Merge a component's direct `usedBy` (ingredient/tool) with the recipes that
   * require any essence the component carries (role `essence`). Recipes already in
   * the direct list are not repeated, so a recipe that uses the component both as an
   * ingredient and via its essence appears once (as the direct usage).
   * @private
   */
  _mergeEssenceUsedBy(directUsedBy, rawEssences, essenceUsedBy) {
    const seenRecipeIds = new Set(directUsedBy.map((entry) => entry.recipeId));
    const merged = [...directUsedBy];
    for (const essenceId of Object.keys(rawEssences)) {
      for (const entry of essenceUsedBy.get(essenceId) ?? []) {
        if (entry.recipeId && seenRecipeIds.has(entry.recipeId)) continue;
        if (entry.recipeId) seenRecipeIds.add(entry.recipeId);
        merged.push({
          recipeId: entry.recipeId,
          recipeName: entry.recipeName,
          recipeImg: entry.recipeImg,
          role: 'essence',
        });
      }
    }
    return merged;
  }

  /**
   * Build the recipe-derived reverse indexes for a system in a single pass over its
   * recipes, plus the salvage/gathering producers:
   *  - `componentUsedBy` / `essenceUsedBy` — a component/essence CONSUMED by a recipe
   *    (an ingredient option references its id).
   *  - `componentRequiredFor` — a recipe that requires the component as a `tool` (a
   *    recipe/set tool resolves, via the system Tool library, to its id): it must be
   *    present but is not consumed.
   *  - `componentProducedBy` — everything that produces a component: recipes (a
   *    result references its id), salvage (a component whose salvage yields it), and
   *    gathering (a task drop yields it). Recipe producers respect `allowedRecipeIds`
   *    (teaser redaction) and carry a navigable `recipeId`; salvage/gathering
   *    producers are display-only (`recipeId: null`). One entry per producer.
   * @private
   */
  _buildRecipeIndexes(system, allowedRecipeIds = null) {
    const componentUsedBy = new Map();
    const componentRequiredFor = new Map();
    const essenceUsedBy = new Map();
    const componentProducedBy = new Map();

    // Tool id → componentId, so a recipe's tool references resolve to components.
    const toolComponentById = new Map();
    for (const tool of Array.isArray(system?.tools) ? system.tools : []) {
      if (tool?.id && tool.componentId) toolComponentById.set(tool.id, tool.componentId);
    }

    // Used-by: per-recipe dedupe of (targetId, role).
    const pushUse = (index, targetId, entry, seen) => {
      const dedupeKey = `${targetId}:${entry.role}`;
      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);
      const list = index.get(targetId);
      if (list) list.push(entry);
      else index.set(targetId, [entry]);
    };

    // A one-entry-per-(componentId, source key) accumulator, shared by the
    // produced-by and required-for indexes (each with its own seen + target map).
    const makeAdder = (targetMap) => {
      const seen = new Map();
      return (componentId, key, value) => {
        if (!componentId) return;
        let keys = seen.get(componentId);
        if (!keys) {
          keys = new Set();
          seen.set(componentId, keys);
        }
        if (keys.has(key)) return;
        keys.add(key);
        const list = targetMap.get(componentId);
        if (list) list.push(value);
        else targetMap.set(componentId, [value]);
      };
    };
    const addProduced = makeAdder(componentProducedBy);
    // Required-for: recipes/gathering tasks that require the component as a TOOL
    // (present but not consumed).
    const addRequiredFor = makeAdder(componentRequiredFor);

    const recipes = this.recipeManager?.getRecipes?.({ craftingSystemId: system?.id }) ?? [];
    for (const recipe of Array.isArray(recipes) ? recipes : []) {
      if (allowedRecipeIds && !allowedRecipeIds.has(recipe?.id)) continue;
      // Resolve the recipe image the way the GM Manager / player Crafting tab do
      // (recipeItemImg || recipe.img): a recipe whose icon lives on its linked recipe
      // item keeps the model default `recipe.img` otherwise. `recipe.img` is itself
      // model-defaulted to the alchemical blueprint, so the trailing fallback is the
      // blueprint — never the generic component item-bag.
      const recipeItemImg = recipe?.recipeItemId
        ? this.craftingSystemManager?.getRecipeItemDefinition?.(system?.id, recipe.recipeItemId)
            ?.img || ''
        : '';
      const recipeImg = stringOrNull(recipeItemImg || recipe?.img);
      const recipeEntry = {
        recipeId: stringOrNull(recipe?.id),
        recipeName: stringOrEmpty(recipe?.name),
        recipeImg,
      };
      // The produced-by / required-for entry for this recipe (a navigable recipe).
      const recipeSourceKey = `recipe:${recipe?.id}`;
      const recipeSourceValue = {
        kind: 'recipe',
        recipeId: recipeEntry.recipeId,
        name: recipeEntry.recipeName,
        img: recipeImg,
      };
      // Per-recipe dedupe of (targetId, role) pairs so one recipe contributes a
      // single entry per component/essence per role even across multiple sets.
      const seen = new Set();
      const ingredientSets = Array.isArray(recipe?.ingredientSets) ? recipe.ingredientSets : [];
      for (const set of ingredientSets) {
        for (const group of Array.isArray(set?.ingredientGroups) ? set.ingredientGroups : []) {
          for (const option of Array.isArray(group?.options) ? group.options : []) {
            const componentId = option?.componentId ?? option?.match?.componentId ?? null;
            if (componentId) {
              pushUse(componentUsedBy, componentId, { ...recipeEntry, role: 'ingredient' }, seen);
            }
          }
        }
        for (const toolId of Array.isArray(set?.toolIds) ? set.toolIds : []) {
          const componentId = toolComponentById.get(toolId);
          if (componentId) addRequiredFor(componentId, recipeSourceKey, recipeSourceValue);
        }
        for (const [essenceId, quantity] of Object.entries(set?.essences ?? {})) {
          if (Number(quantity) > 0) {
            pushUse(essenceUsedBy, essenceId, { ...recipeEntry, role: 'ingredient' }, seen);
          }
        }
      }
      for (const toolId of Array.isArray(recipe?.toolIds) ? recipe.toolIds : []) {
        const componentId = toolComponentById.get(toolId);
        if (componentId) addRequiredFor(componentId, recipeSourceKey, recipeSourceValue);
      }

      // Produced-by (recipe): every output result component id.
      for (const componentId of this._recipeResultComponentIds(recipe)) {
        addProduced(componentId, recipeSourceKey, recipeSourceValue);
      }
    }

    // Produced-by (salvage): a component whose salvage results yield the component id.
    for (const source of Array.isArray(system?.components) ? system.components : []) {
      if (source?.salvage?.enabled !== true) continue;
      const value = {
        kind: 'salvage',
        recipeId: null,
        name: stringOrEmpty(source?.name),
        img: stringOrNull(source?.img),
      };
      const key = `salvage:${source?.id}`;
      for (const group of Array.isArray(source.salvage.resultGroups)
        ? source.salvage.resultGroups
        : []) {
        for (const result of Array.isArray(group?.results) ? group.results : []) {
          addProduced(result?.componentId, key, value);
        }
      }
    }

    // Produced-by (gathering): a gathering task drop row yields the component id.
    const tasks = this._getGatheringTasksForSystem(system?.id) ?? [];
    for (const task of Array.isArray(tasks) ? tasks : []) {
      if (task?.enabled === false) continue;
      const value = {
        kind: 'gathering',
        recipeId: null,
        name: stringOrEmpty(task?.name),
        img: stringOrNull(task?.img),
      };
      const key = `gathering:${task?.id}`;
      const rows = Array.isArray(task?.dropRows)
        ? task.dropRows
        : Array.isArray(task?.itemDrops)
          ? task.itemDrops
          : [];
      for (const row of rows) {
        if (row?.enabled === false) continue;
        addProduced(row?.componentId, key, value);
      }

      // Required-for (gathering): the task's required tools (present, not consumed),
      // resolved via the system Tool library (task.toolIds) or inline task.tools.
      for (const toolId of Array.isArray(task?.toolIds) ? task.toolIds : []) {
        const componentId = toolComponentById.get(toolId);
        if (componentId) addRequiredFor(componentId, key, value);
      }
      for (const inlineTool of Array.isArray(task?.tools) ? task.tools : []) {
        if (inlineTool?.componentId) addRequiredFor(inlineTool.componentId, key, value);
      }
    }

    return { componentUsedBy, componentRequiredFor, essenceUsedBy, componentProducedBy };
  }

  /**
   * The set of component ids a recipe outputs, gathered from its top-level result
   * groups and every explicit step's result groups.
   * @private
   * @returns {Set<string>}
   */
  _recipeResultComponentIds(recipe) {
    const ids = new Set();
    for (const result of Array.isArray(recipe?.results) ? recipe.results : []) {
      if (result?.componentId) ids.add(result.componentId);
    }
    for (const step of Array.isArray(recipe?.steps) ? recipe.steps : []) {
      for (const group of Array.isArray(step?.resultGroups) ? step.resultGroups : []) {
        for (const result of Array.isArray(group?.results) ? group.results : []) {
          if (result?.componentId) ids.add(result.componentId);
        }
      }
    }
    return ids;
  }
}
