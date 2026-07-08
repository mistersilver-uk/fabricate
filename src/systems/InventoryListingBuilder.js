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
import { findMatchingComponent } from '../utils/essenceResolver.js';
import { getItemSourceReferences } from '../utils/sourceUuid.js';

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
        const component = findMatchingComponent(item, components);
        if (!component?.id) continue;
        const qty = itemStackQuantity(item);
        let entry = owned.get(component.id);
        if (!entry) {
          entry = { component, sources: new Map() };
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

    const componentRows = [];
    // essenceTotals: essenceId → Map<actorId, {name, img, qty}>
    const essenceTotals = new Map();
    // essenceContributors: essenceId → [{componentId, name, img, quantity}] — the
    // owned components that carry the essence and how much each contributes.
    const essenceContributors = new Map();

    for (const { component, sources: sourceMap } of owned.values()) {
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
        tags: Array.isArray(component.tags) ? component.tags.map(stringOrEmpty) : [],
        tier: component.tier ?? null,
        isEssenceSource: false,
        isTool: toolComponentIds.has(component.id),
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
    // A recipe item is an inventory row in any knowledge list mode — it is a book
    // the player owns regardless of how it grants access. `learnable` gates the
    // Learn affordance: only `learned` / `itemOrLearned` modes teach from it; an
    // item-only mode book grants craft access by being held, so it lists its
    // recipes and craft-use limit but offers no Learn button.
    if (visibility?.listMode !== 'knowledge') return [];
    const mode = knowledge?.mode || 'itemOrLearned';
    const learnable = LEARN_CAPABLE_MODES.has(mode);
    const grantsByItem = ITEM_ACCESS_MODES.has(mode);

    const systemId = stringOrNull(system?.id);
    const systemName = stringOrEmpty(system?.name);

    // Group the system's recipes by the book that contains them. Canonical read is
    // each definition's `recipeIds[]` (many-to-many — a recipe may appear under several
    // books). Falls back to the legacy reverse ref (`recipe.recipeItemId`, or
    // `linkedRecipeItemUuid → definition sourceItemUuid`) only when no book carries
    // membership yet.
    const recipes = this.recipeManager?.getRecipes?.({ craftingSystemId: system?.id }) ?? [];
    const recipeList = Array.isArray(recipes) ? recipes : [];
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
      const recipeById = new Map(recipeList.map((recipe) => [stringOrNull(recipe?.id), recipe]));
      for (const def of definitions) {
        if (!def?.id) continue;
        const members = (Array.isArray(def.recipeIds) ? def.recipeIds : [])
          .map((id) => recipeById.get(stringOrNull(id)))
          .filter((recipe) => recipe && eligible(recipe));
        if (members.length > 0) recipesByDef.set(def.id, members);
      }
    } else {
      const defBySourceUuid = new Map(
        definitions.filter((def) => def?.sourceItemUuid).map((def) => [def.sourceItemUuid, def.id])
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
        const def = this._matchRecipeItemDefinition(item, definitions);
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
    const rows = [];
    for (const [defId, { def, sources: sourceMap, item }] of owned) {
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
        img: stringOrNull(this._resolveRecipeImg(system, recipe)),
        learned: Boolean(learnedMap?.[recipe?.id]),
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
        isRecipeItem: true,
        learnable,
        totalQuantity,
        sources: rowSources,
        essences: [],
        usedBy: [],
        requiredFor: [],
        producedBy: [],
        contributors: [],
        recipes: linkedRecipes,
        limits: this._recipeItemLimits(knowledge, item, { learnable, grantsByItem }),
      });
    }

    // Keep books grouped last within a system's rows by name (the top-level sort
    // re-sorts everything by name anyway).
    void defById;
    return rows;
  }

  /**
   * Resolve the recipe-item definition an owned item matches, mirroring the
   * runtime learn matcher (`RecipeVisibilityService._isMatchingRecipeItem`): a
   * definition matches when the definition's `sourceItemUuid` is among the item's
   * source references — its live uuid, compendium source, or `_stats.duplicateSource`.
   * The duplicate-source reference is essential: a book dragged from a world
   * template carries the link only there, and source-uuid-only matching misses it.
   * @private
   */
  _matchRecipeItemDefinition(item, definitions) {
    if (!item) return null;
    const refs = getItemSourceReferences(item);
    if (refs.length === 0) return null;
    for (const def of definitions) {
      if (def?.sourceItemUuid && refs.includes(def.sourceItemUuid)) return def;
    }
    return null;
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
   * The book's use / learn limit readouts from the system knowledge config and a
   * representative owned document's counters. Each is null unless its cap is
   * enabled with a finite positive maximum, mirroring how the runtime treats an
   * invalid cap as uncapped.
   * @private
   */
  _recipeItemLimits(knowledge, item, { learnable = false, grantsByItem = false } = {}) {
    const finitePositive = (value) => {
      const num = Number(value);
      return Number.isFinite(num) && num > 0 ? num : null;
    };

    // The craft-use limit only applies when the book grants access by being held
    // (item / itemOrLearned) — a learn-only book is never "used" to craft, so its
    // use limit is suppressed, mirroring the learn-limit suppression below.
    let uses = null;
    const maxUses =
      grantsByItem && knowledge?.item?.limitUses === true
        ? finitePositive(knowledge?.item?.maxUses)
        : null;
    if (maxUses != null) {
      const used = Number(getFabricateFlag(item, 'recipeItemUsage', {})?.timesUsed || 0);
      uses = { max: maxUses, used, remaining: Math.max(0, maxUses - used) };
    }

    // The learn budget only applies when the book can teach — an item-only book is
    // never "learned from", so its learning limit is suppressed.
    let learning = null;
    const maxRecipes =
      learnable && knowledge?.learn?.limitRecipes === true
        ? finitePositive(knowledge?.learn?.maxRecipes)
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
  _resolveRecipeImg(system, recipe) {
    const recipeItemImg = recipe?.recipeItemId
      ? this.craftingSystemManager?.getRecipeItemDefinition?.(system?.id, recipe.recipeItemId)
          ?.img || ''
      : '';
    return recipeItemImg || recipe?.img || '';
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
      if (tool?.id && tool?.componentId) toolComponentById.set(tool.id, tool.componentId);
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
