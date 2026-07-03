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

import { findMatchingComponent } from '../utils/essenceResolver.js';

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
   */
  constructor({
    recipeManager = null,
    craftingSystemManager = null,
    recipeVisibility = null,
    getViewer = null,
    localize = (key) => key,
    nowWorldTime = () => 0,
  } = {}) {
    this.recipeManager = recipeManager;
    this.craftingSystemManager = craftingSystemManager;
    this.recipeVisibility = recipeVisibility;
    this._getViewer = typeof getViewer === 'function' ? getViewer : null;
    this.localize = typeof localize === 'function' ? localize : (key) => key;
    this._nowWorldTime = typeof nowWorldTime === 'function' ? nowWorldTime : () => 0;
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
      rows.push(...this._buildSystemRows(system, sources, allowedRecipeIds));
    }

    rows.sort((left, right) => stringOrEmpty(left?.name).localeCompare(stringOrEmpty(right?.name)));

    const componentCount = rows.filter((row) => !row.isEssenceSource).length;
    return {
      selectedActorId: actorKey(craftingActor),
      actor: craftingActor ?? null,
      sourceActorIds: sources.map(actorKey),
      worldTime: Number(this._nowWorldTime() || 0),
      rows,
      counts: {
        components: componentCount,
        essences: rows.length - componentCount,
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

    const { componentUsedBy, essenceUsedBy } = this._buildUsedByIndex(system, allowedRecipeIds);

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

    for (const { component, sources: sourceMap } of owned.values()) {
      const rowSources = orderSources(sourceMap);
      const totalQuantity = rowSources.reduce((sum, source) => sum + source.quantity, 0);
      if (totalQuantity <= 0) continue;

      const rawEssences =
        component.essences && typeof component.essences === 'object' ? component.essences : {};

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
        totalQuantity,
        sources: rowSources,
        essences: essencesEnabled ? this._componentEssences(rawEssences, essenceDefById) : [],
        usedBy: componentUsedBy.get(component.id) ?? [],
      });

      // Fold this component's essence content into the per-essence source totals
      // (perUnit content × owned quantity, per source actor).
      if (essencesEnabled) {
        for (const [essenceId, perUnit] of Object.entries(rawEssences)) {
          const content = Number(perUnit);
          if (!essenceDefById.has(essenceId) || !Number.isFinite(content) || content <= 0) continue;
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
        totalQuantity,
        sources: rowSources,
        essences: [],
        usedBy: essenceUsedBy.get(essenceId) ?? [],
      });
    }

    return [...componentRows, ...essenceRows];
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
   * Build the componentId → recipes and essenceId → recipes reverse indexes for a
   * system in a single pass over its recipes. A component is "used by" a recipe as
   * an `ingredient` (an ingredient option references its id) or a `tool` (a recipe
   * or ingredient-set tool resolves — via the system Tool library — to its id).
   * Each (recipe, componentId, role) pair is recorded once.
   * @private
   */
  _buildUsedByIndex(system, allowedRecipeIds = null) {
    const componentUsedBy = new Map();
    const essenceUsedBy = new Map();

    const recipes = this.recipeManager?.getRecipes?.({ craftingSystemId: system?.id }) ?? [];
    if (!Array.isArray(recipes) || recipes.length === 0) {
      return { componentUsedBy, essenceUsedBy };
    }

    // Tool id → componentId, so a recipe's tool references resolve to components.
    const toolComponentById = new Map();
    for (const tool of Array.isArray(system?.tools) ? system.tools : []) {
      if (tool?.id && tool?.componentId) toolComponentById.set(tool.id, tool.componentId);
    }

    const push = (index, targetId, entry, seen) => {
      const dedupeKey = `${targetId}:${entry.role}`;
      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);
      const list = index.get(targetId);
      if (list) list.push(entry);
      else index.set(targetId, [entry]);
    };

    for (const recipe of recipes) {
      if (allowedRecipeIds && !allowedRecipeIds.has(recipe?.id)) continue;
      // Resolve the recipe image the way the GM Manager / player Crafting tab do
      // (recipeItemImg || recipe.img): a recipe whose icon lives on its linked
      // recipe item keeps the model default `recipe.img` otherwise, so prefer the
      // linked item definition's image. `recipe.img` is itself model-defaulted to
      // DEFAULT_RECIPE_IMAGE (the alchemical blueprint), so the trailing fallback
      // is the blueprint — never the generic component item-bag.
      const recipeItemImg = recipe?.recipeItemId
        ? this.craftingSystemManager?.getRecipeItemDefinition?.(system?.id, recipe.recipeItemId)
            ?.img || ''
        : '';
      const recipeEntry = {
        recipeId: stringOrNull(recipe?.id),
        recipeName: stringOrEmpty(recipe?.name),
        recipeImg: stringOrNull(recipeItemImg || recipe?.img),
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
              push(componentUsedBy, componentId, { ...recipeEntry, role: 'ingredient' }, seen);
            }
          }
        }
        for (const toolId of Array.isArray(set?.toolIds) ? set.toolIds : []) {
          const componentId = toolComponentById.get(toolId);
          if (componentId)
            push(componentUsedBy, componentId, { ...recipeEntry, role: 'tool' }, seen);
        }
        for (const [essenceId, quantity] of Object.entries(set?.essences ?? {})) {
          if (Number(quantity) > 0) {
            push(essenceUsedBy, essenceId, { ...recipeEntry, role: 'ingredient' }, seen);
          }
        }
      }

      for (const toolId of Array.isArray(recipe?.toolIds) ? recipe.toolIds : []) {
        const componentId = toolComponentById.get(toolId);
        if (componentId) push(componentUsedBy, componentId, { ...recipeEntry, role: 'tool' }, seen);
      }
    }

    return { componentUsedBy, essenceUsedBy };
  }
}
