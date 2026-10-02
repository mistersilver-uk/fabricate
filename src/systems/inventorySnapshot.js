/**
 * What the crafting actor and its component-source actors hold, resolved once per read pass
 * instead of once per recipe (issue 1077): the per-recipe re-read was `recipes x items`, and
 * `definitionIndex` never hit because callers handed it a fresh array each call.
 * Invalidation rule: a snapshot is never retained across a call boundary nor cached beyond the
 * pass that built it, so it cannot observe a document mutation. Revision tokens describe
 * definitions, not `actor.items`, so the item half is per-pass; the definition half is retained
 * in `definitionIndex`, which this module feeds a stable array.
 * The recipe-item prefilter cannot change an answer: each recipe's definitions `D_R` are a
 * subset of the system-wide candidate set `U`, and `matchRecipeItemDefinition` only matches from
 * its set (durable and source-reference tiers alike), so the filter only ever keeps too much. `U`
 * includes a synthetic entry per legacy `linkedRecipeItemUuid`, or legacy books vanish (a named
 * test pins it). `projectRecipeAvailability` is an optimistic upper bound.
 */

import { getFabricateFlag } from '../config/flags.js';

import { readStackQuantity } from './itemStackQuantity.js';
import { resolvedComponentsFor } from './scopedEntityReads.js';

/**
 * The deduped actor set, crafting actor first, by `actor.id`, as
 * `RecipeVisibilityService._collectCandidateItems` orders it: `_selectDeterministic` sorts on the
 * recorded `actorOrder`/`itemOrder` to choose which book copy a learn consumes.
 */
function orderedActors(craftingActor, componentSourceActors) {
  const actors = [];
  if (craftingActor) actors.push(craftingActor);
  for (const actor of componentSourceActors || []) {
    if (!actor) continue;
    if (actors.some((existing) => existing.id === actor.id)) continue;
    actors.push(actor);
  }
  return actors;
}

/** Every held document once, with its position pair; the only read of `actor.items`. */
function enumerateHeldItems(actors) {
  const held = [];
  for (const [actorOrder, actor] of actors.entries()) {
    const items = [...(actor.items || [])];
    for (const [itemOrder, item] of items.entries()) {
      held.push({ actor, item, actorOrder, itemOrder });
    }
  }
  return held;
}

/** A document's deduped tags: the `RecipeManager._matchesTagIngredient` union of both sources. */
function tagsOf(item, component) {
  const flagTags = getFabricateFlag(item, 'tags', []);
  const componentTags = Array.isArray(component?.tags) ? component.tags : [];
  return new Set([...(Array.isArray(flagTags) ? flagTags : []), ...componentTags].map(String));
}

/**
 * A snapshot of one actor set: a closure over precomputed state (an immutable derived value with
 * a small read API). Per-system work is lazy and memoised on the system object, so an unowned
 * system costs nothing. `resolveComponent` and `matchesRecipeItem` are injected.
 */
export function buildInventorySnapshot({
  craftingActor = null,
  componentSourceActors = [],
  resolveComponent = null,
  matchesRecipeItem = null,
} = {}) {
  const actors = orderedActors(craftingActor, componentSourceActors);

  // The item walk is lazy: most systems answer visibility without inventory, and an eager walk
  // would add a full read to the `global`-mode pass (`held-inventory`'s counters catch it).
  let walked = null;
  const heldItems = () => (walked ??= enumerateHeldItems(actors));

  /** @type {Map<object, Array<object>>} system -> the prefiltered book candidates. */
  const candidateCache = new Map();
  /** @type {Map<object, object>} system -> component/essence tallies. */
  const tallyCache = new Map();

  /** The superset `U`: authored definitions plus one synthetic entry per legacy book link. */
  function supersetDefinitions(system, legacySourceUuids) {
    const authored = Array.isArray(system?.recipeItemDefinitions)
      ? system.recipeItemDefinitions
      : [];
    const known = new Set(
      authored.map((definition) => String(definition?.originItemUuid || '').trim())
    );
    const synthetic = [];
    for (const uuid of legacySourceUuids || []) {
      const trimmed = String(uuid || '').trim();
      if (!trimmed || known.has(trimmed)) continue;
      known.add(trimmed);
      // Id-less like `_recipeItemMatchDefinitions`' own, so only the source-uuid tiers match it.
      synthetic.push({ id: null, originItemUuid: trimmed });
    }
    return synthetic.length === 0 ? authored : [...authored, ...synthetic];
  }

  return {
    heldItems,
    actors,

    /**
     * Held documents that could be one of `system`'s books, a sound superset (see the module
     * header); omitting a pass recipe's legacy uuid makes it a subset.
     */
    recipeItemCandidates(system, legacySourceUuids = []) {
      if (!system || typeof matchesRecipeItem !== 'function') return heldItems();
      const cached = candidateCache.get(system);
      if (cached) return cached;
      const definitions = supersetDefinitions(system, legacySourceUuids);
      // No definitions and no legacy link: no candidates, and no inventory walk.
      const candidates =
        definitions.length === 0
          ? []
          : heldItems().filter((entry) => matchesRecipeItem(entry.item, definitions, system.id));
      candidateCache.set(system, candidates);
      return candidates;
    },

    /**
     * Per-component quantity and stack count, implied essence totals and per-tag quantity for one
     * system, one component resolution per held document. Tags are the union of component tags
     * and the item's flag, deduped: Fabricate never stamps item tag flags (issue 857), so a
     * flag-only tally is empty and every tag option would read unavailable. Every held document
     * counts towards tags, component or not.
     */
    componentTallies(system) {
      const cached = tallyCache.get(system);
      if (cached) return cached;

      const quantityByComponentId = new Map();
      const stacksByComponentId = new Map();
      const essenceTotals = new Map();
      const quantityByTag = new Map();
      const components = resolvedComponentsFor(system);
      const canResolve = typeof resolveComponent === 'function' && components.length > 0;

      for (const { item } of heldItems()) {
        const quantity = readStackQuantity(item);
        // Resolved first: the tag tally needs the component's tags.
        const component = canResolve ? resolveComponent(item, components, system?.id) : null;

        for (const tag of tagsOf(item, component)) {
          quantityByTag.set(tag, (quantityByTag.get(tag) ?? 0) + quantity);
        }

        const componentId = component?.id;
        if (componentId == null) continue;
        const key = String(componentId);
        quantityByComponentId.set(key, (quantityByComponentId.get(key) ?? 0) + quantity);
        stacksByComponentId.set(key, (stacksByComponentId.get(key) ?? 0) + 1);

        const essences = component.essences;
        if (!essences || typeof essences !== 'object') continue;
        for (const [essenceId, per] of Object.entries(essences)) {
          const amount = Number(per) || 0;
          if (amount <= 0) continue;
          essenceTotals.set(essenceId, (essenceTotals.get(essenceId) ?? 0) + amount * quantity);
        }
      }

      const tallies = {
        quantityByComponentId,
        stacksByComponentId,
        essenceTotals,
        quantityByTag,
      };
      tallyCache.set(system, tallies);
      return tallies;
    },
  };
}

/**
 * A set's ingredient groups, tolerating the legacy flat `ingredients` alias; reading only the
 * alias would make a two-option group require its first option and answer a false no.
 */
function groupsOf(set) {
  if (Array.isArray(set?.ingredientGroups) && set.ingredientGroups.length > 0) {
    return set.ingredientGroups;
  }
  return (Array.isArray(set?.ingredients) ? set.ingredients : []).map((option) => ({
    options: [option],
  }));
}

/**
 * Whether one option is plausibly covered, always an upper bound: component by exact quantity,
 * `any` tags by the sum, `all` tags by the minimum; currency and anything else are plausible,
 * since currency is read live at craft time.
 */
function optionIsPlausible(option, tallies) {
  const required = Number(option?.quantity) || 0;
  if (required <= 0) return true;

  const match = option?.match;
  const type = match?.type;

  if (type === 'component' || (type == null && option?.componentId != null)) {
    const componentId = match?.componentId ?? option?.componentId;
    if (componentId == null) return true;
    return (tallies.quantityByComponentId.get(String(componentId)) ?? 0) >= required;
  }

  if (type === 'tags') {
    const tags = Array.isArray(match?.tags) ? match.tags : [];
    if (tags.length === 0) return true;
    const held = tags.map((tag) => tallies.quantityByTag.get(String(tag)) ?? 0);
    const bound = match?.tagMatch === 'all' ? Math.min(...held) : held.reduce((a, b) => a + b, 0);
    return bound >= required;
  }

  return true;
}

/**
 * The Cheap Availability Projection (issue 1077): whether an actor plausibly has the materials,
 * from the tallies alone, never calling `evaluateCraftability` or `resolveIngredientSelection`.
 * An upper bound: contended stacks count for every group, so `true` means "looks makeable" and
 * `false` is definitive. Tools, checks, knowledge and currency are not consulted. Any set
 * suffices; a set needs every group plausible and its essences covered. `optimistic: true` is
 * part of the shape so no consumer reads the result as exact.
 */
export function projectRecipeAvailability(tallies, recipe) {
  const sets = Array.isArray(recipe?.ingredientSets) ? recipe.ingredientSets : [];
  const satisfied = { available: true, optimistic: true, missingEssenceIds: [] };
  if (sets.length === 0) return { ...satisfied, unsatisfiedGroupCount: 0 };

  let best = null;

  for (const set of sets) {
    let unsatisfiedGroupCount = 0;
    for (const group of groupsOf(set)) {
      const options = Array.isArray(group?.options) ? group.options : [];
      if (options.length === 0) continue;
      // A group is satisfied by any option, so the negation covers the whole group.
      if (options.every((option) => !optionIsPlausible(option, tallies))) unsatisfiedGroupCount++;
    }

    const missingEssenceIds = [];
    const essences = set?.essences && typeof set.essences === 'object' ? set.essences : {};
    for (const [essenceId, required] of Object.entries(essences)) {
      const amount = Number(required) || 0;
      if (amount <= 0) continue;
      if ((tallies.essenceTotals.get(String(essenceId)) ?? 0) < amount) {
        missingEssenceIds.push(String(essenceId));
      }
    }

    if (unsatisfiedGroupCount === 0 && missingEssenceIds.length === 0) {
      return { ...satisfied, unsatisfiedGroupCount: 0 };
    }
    // Report the closest set's shortfall, not the first authored.
    const shortfall = unsatisfiedGroupCount + missingEssenceIds.length;
    if (best === null || shortfall < best.shortfall) {
      best = { shortfall, unsatisfiedGroupCount, missingEssenceIds };
    }
  }

  return {
    available: false,
    optimistic: true,
    missingEssenceIds: best?.missingEssenceIds ?? [],
    unsatisfiedGroupCount: best?.unsatisfiedGroupCount ?? 0,
  };
}
