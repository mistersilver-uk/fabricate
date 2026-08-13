/**
 * @module inventorySnapshot
 *
 * What the selected crafting actor and its component-source actors HOLD, resolved once per
 * read pass instead of once per recipe (issue 1077, under the performance programme #1070).
 *
 * ## The defect this exists to remove
 *
 * `RecipeVisibilityService._collectCandidateItems` re-enumerates every source actor's whole
 * inventory and re-runs the recipe-item matcher over it FOR EVERY RECIPE. Measured on the
 * committed `knowledge-corpus` profile (5,000 book-gated recipes, 4 actors, 24 held stacks)
 * one `getVisibleRecipes()` pass performed:
 *
 * | Operation                              | Count   |
 * |----------------------------------------|---------|
 * | `actor.items` re-reads                 | 20,000  |
 * | item objects walked                    | 120,000 |
 * | recipe-item match attempts             | 120,000 |
 * | `definitionIndex` index BUILDS         | 122,501 |
 *
 * The last row is the surprising one and it is why #1076's retained indexes did not already
 * fix this: `definitionIndex` keys its cache on the candidate ARRAY object, and
 * `_getRecipeItemDefinitions` / `_recipeItemMatchDefinitions` hand it a FRESH array on every
 * call (`[...byMembership]`, `[...defs, synthetic]`). A cache keyed on a value the caller
 * rebuilds per call is a cache that never hits, so the whole index was reconstructed once
 * per (recipe x held item) pair. #1076's index is correct; it was being handed a throwaway.
 *
 * Both terms are `recipes x items`, which is exactly the product #1070's field report hit —
 * a user whose slow crafting menu turned out to be one character carrying hundreds of
 * materials, not a large corpus.
 *
 * ## What a snapshot IS, and its lifetime
 *
 * A snapshot is a **value derived from a fixed actor set at one instant**, produced by
 * {@link buildInventorySnapshot} and consumed within the call that built it.
 *
 * > **Invalidation rule.** A snapshot is never retained across a call boundary and never
 * > cached beyond the read pass that created it. It is therefore invalidated by
 * > construction: no Foundry document mutation can be observed by a snapshot, because no
 * > snapshot outlives the synchronous pass it was built for.
 *
 * That rule is deliberately the strictest one available, and it is a considered choice
 * rather than an omission. The tempting design is a longer-lived snapshot keyed on #1076's
 * revision tokens, and it is the wrong one **for the item half**: those tokens are minted by
 * `RecipeManager` and `CraftingSystemManager` and describe DEFINITIONS. Nothing mints a
 * token when a player's `actor.items` changes, so a revision-keyed snapshot of held items
 * would report "unchanged" across a craft that consumed the very stacks it describes. The
 * failure direction matters: a stale inventory read does not merely show a wrong number, it
 * feeds the craftability and knowledge gates. So the item half is per-pass, and the
 * DEFINITION half — which does have tokens — is where retention belongs (see
 * `definitionIndex`, whose `WeakMap` cache this module is careful to feed a STABLE array).
 *
 * `#1078` owns scoped invalidation routing and may later supply an item-side generation; at
 * that point this module gains a retention key without changing its read API.
 *
 * ## The recipe-item prefilter, and why it cannot change an answer
 *
 * The expensive question is "which held items are one of THIS recipe's member books?", asked
 * per recipe against that recipe's own small definition subset `D_R`. The snapshot answers a
 * cheaper superset question ONCE per system: "which held items match ANY of this system's
 * recipe-item definitions, or any legacy book link in the pass?" — call that candidate set
 * `U`. Callers then run the unmodified per-recipe matcher over the survivors only.
 *
 * This is sound because `D_R ⊆ U` for every recipe `R` of the system, and
 * `matchRecipeItemDefinition` can only produce a match FROM the set it is given:
 *
 * - **Durable tier.** It returns the member of the set whose id the item's
 *   `roles[systemId].recipeItemDefinitionId` (or the legacy scalar) names. If some `d ∈ D_R`
 *   is named, then `d ∈ U` is named too, so the match against `U` is also non-null.
 * - **Source-reference tiers.** They return the earliest member of the set carrying the
 *   item's `uuid` / compendium source / duplicate source. If some `d ∈ D_R` carries one,
 *   then `U` contains a member carrying it, so the match against `U` is again non-null.
 *
 * Contrapositive: an item that matches nothing in `U` matches nothing in any `D_R`. The
 * filter can only ever be **optimistic** — it may keep an item the per-recipe matcher then
 * rejects, which costs a little work and changes no answer. It can never drop one.
 *
 * `U` includes a synthetic `{id: null, originItemUuid}` entry per distinct
 * `recipe.linkedRecipeItemUuid` in the pass, because `_recipeItemMatchDefinitions` adds
 * exactly such an entry for an un-migrated recipe carrying only the old single reverse ref.
 * Omitting those would make `U` a subset rather than a superset for legacy recipes and would
 * silently hide their books — the one way this optimisation could go wrong, so it is stated
 * here and pinned by a named test.
 *
 * ## The availability projection is OPTIMISTIC, on purpose
 *
 * {@link projectRecipeAvailability} answers "does this actor plausibly have the materials?"
 * from the snapshot's component quantities and essence totals alone. It never calls
 * `evaluateCraftability()` or `resolveIngredientSelection()`, and it is an **upper bound**,
 * not a guarantee — see that function's own contract.
 */

import { getFabricateFlag } from '../config/flags.js';

import { readStackQuantity } from './itemStackQuantity.js';

/**
 * The deduped, ordered actor set a snapshot reads.
 *
 * Dedupe is by `actor.id`, crafting actor first, matching
 * `RecipeVisibilityService._collectCandidateItems` exactly — the `actorOrder` / `itemOrder`
 * pair it records is load-bearing (`_selectDeterministic` sorts on it to choose which copy
 * of a book gets consumed), so a snapshot that ordered actors differently would change which
 * physical document a learn consumes.
 *
 * @param {object|null} craftingActor
 * @param {object[]} componentSourceActors
 * @returns {object[]}
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

/**
 * Every held document once, tagged with the position pair the knowledge paths sort on.
 *
 * This is the ONLY place a snapshot reads `actor.items`. Everything else works from the
 * result, which is what turns the `recipes x items` re-read into a single pass.
 *
 * @param {object[]} actors
 * @returns {Array<{actor: object, item: object, actorOrder: number, itemOrder: number}>}
 */
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

/**
 * A snapshot of what one actor set holds, resolved once.
 *
 * Deliberately a closure over precomputed state rather than a class: it has no lifecycle, no
 * state transitions and no injected collaborators — it is an immutable derived value with a
 * small read API, and a closure keeps its internals genuinely unreachable rather than
 * merely underscore-prefixed.
 *
 * Per-system work is LAZY and memoised on the system object, so a world with twenty
 * installed crafting systems pays only for the ones a caller actually asks about. That
 * mirrors `InventoryListingBuilder`'s existing "a system nobody owns anything in costs
 * nothing" rule.
 *
 * @param {object} [options]
 * @param {object|null} [options.craftingActor] The acting character.
 * @param {object[]} [options.componentSourceActors] Additional inventory sources.
 * @param {(item: object, components: object[], systemId: string) => (object|null)}
 *   [options.resolveComponent] How an item resolves to a component of a system. Injected so
 *   this module never reaches for a resolver it does not own, and so a test can drive the
 *   tallies without constructing a component library.
 * @param {(item: object, definitions: object[], systemId: string) => boolean}
 *   [options.matchesRecipeItem] Whether an item is any of the given recipe-item definitions.
 * @returns {{
 *   heldItems: () => Array<{actor: object, item: object, actorOrder: number, itemOrder: number}>,
 *   actors: object[],
 *   recipeItemCandidates: (system: object, legacySourceUuids?: Iterable<string>) =>
 *     Array<{actor: object, item: object, actorOrder: number, itemOrder: number}>,
 *   componentTallies: (system: object) =>
 *     {quantityByComponentId: Map<string, number>, stacksByComponentId: Map<string, number>,
 *      essenceTotals: Map<string, number>, quantityByTag: Map<string, number>}
 * }}
 */
export function buildInventorySnapshot({
  craftingActor = null,
  componentSourceActors = [],
  resolveComponent = null,
  matchesRecipeItem = null,
} = {}) {
  const actors = orderedActors(craftingActor, componentSourceActors);

  // The item walk is LAZY and memoised. Building a snapshot must cost nothing until a caller
  // asks it something, because the corpus-wide visibility pass builds one unconditionally
  // and most systems answer visibility without ever consulting inventory: a `global`-mode
  // corpus has no knowledge branch to take, and an eager walk there would ADD a full
  // inventory read to a path that previously performed none. `held-inventory`'s committed
  // counters see that regression at every series point, which is precisely their job.
  let walked = null;
  const heldItems = () => (walked ??= enumerateHeldItems(actors));

  /** @type {Map<object, Array<object>>} system -> the prefiltered book candidates. */
  const candidateCache = new Map();
  /** @type {Map<object, object>} system -> component/essence tallies. */
  const tallyCache = new Map();

  /**
   * The superset candidate array `U` for one system: its authored recipe-item definitions
   * plus one synthetic entry per distinct legacy book link in the pass.
   */
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
      // Id-less exactly like `_recipeItemMatchDefinitions`' own synthetic entry, so it can
      // only ever match the source-uuid tiers and never the durable identity tier.
      synthetic.push({ id: null, originItemUuid: trimmed });
    }
    return synthetic.length === 0 ? authored : [...authored, ...synthetic];
  }

  return {
    heldItems,
    actors,

    /**
     * The held documents that could be one of `system`'s recipe-item books — a sound
     * superset of what any single recipe's matcher would accept. See the module header for
     * why this can never drop a real match.
     *
     * @param {object} system
     * @param {Iterable<string>} [legacySourceUuids] Every `linkedRecipeItemUuid` carried by
     *   the recipes in this pass. Omitting one that IS in the pass would make the result a
     *   subset rather than a superset.
     * @returns {Array<{actor: object, item: object, actorOrder: number, itemOrder: number}>}
     */
    recipeItemCandidates(system, legacySourceUuids = []) {
      if (!system || typeof matchesRecipeItem !== 'function') return heldItems();
      const cached = candidateCache.get(system);
      if (cached) return cached;
      const definitions = supersetDefinitions(system, legacySourceUuids);
      // A system with no recipe-item definitions and no legacy link in the pass can have no
      // book candidates at all, so it must not walk the inventory to discover that.
      const candidates =
        definitions.length === 0
          ? []
          : heldItems().filter((entry) => matchesRecipeItem(entry.item, definitions, system.id));
      candidateCache.set(system, candidates);
      return candidates;
    },

    /**
     * Per-component held quantity and stack count for one system, the essence totals those
     * quantities imply, and the per-tag held quantity the tag-matching ingredient options
     * draw on. Resolved once per system per snapshot: one component identity resolution per
     * held document, never one per recipe and never one per system per recipe.
     *
     * Tag quantities are tallied from EVERY held document, not only the ones that resolve to
     * a component, because a tags-matched ingredient option matches on the item's own
     * `flags.fabricate.tags` and never requires the item to be a registered component.
     *
     * @param {object} system
     * @returns {{quantityByComponentId: Map<string, number>,
     *   stacksByComponentId: Map<string, number>, essenceTotals: Map<string, number>,
     *   quantityByTag: Map<string, number>}}
     */
    componentTallies(system) {
      const cached = tallyCache.get(system);
      if (cached) return cached;

      const quantityByComponentId = new Map();
      const stacksByComponentId = new Map();
      const essenceTotals = new Map();
      const quantityByTag = new Map();
      const components = Array.isArray(system?.components) ? system.components : [];
      const canResolve = typeof resolveComponent === 'function' && components.length > 0;

      for (const { item } of heldItems()) {
        const quantity = readStackQuantity(item);

        for (const tag of getFabricateFlag(item, 'tags', []) || []) {
          const key = String(tag);
          quantityByTag.set(key, (quantityByTag.get(key) ?? 0) + quantity);
        }

        if (!canResolve) continue;
        const component = resolveComponent(item, components, system?.id);
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
 * The ingredient GROUPS of a set, tolerating the legacy flat `ingredients` alias.
 *
 * `IngredientSet` normalises authored data into `ingredientGroups[]` (all groups required,
 * any ONE option satisfies a group) and keeps `ingredients[]` as a first-option-per-group
 * alias for older UI paths. A projection reading only the alias would treat a two-option
 * group as a hard requirement on its first option and answer `false` for a recipe the actor
 * can plainly make — which is the one direction this projection must never be wrong in.
 *
 * @param {object} set
 * @returns {Array<{options: object[]}>}
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
 * Whether ONE ingredient option is plausibly covered by the tallies.
 *
 * Every branch is an UPPER bound on the true held count, never a lower one:
 *
 * - **component** — the exact per-component held quantity.
 * - **tags, `any`** — the SUM of the per-tag quantities. The true count of items carrying
 *   any of the tags is at most that sum (an item carrying two of them is counted twice), so
 *   a sum below the requirement proves the requirement cannot be met.
 * - **tags, `all`** — the MINIMUM per-tag quantity, for the mirror-image reason: the count of
 *   items carrying every tag cannot exceed the count carrying the rarest one.
 * - **currency and anything else** — plausible. Currency is EXCLUDED from the snapshot by
 *   this issue's design (craft-time currency checks continue to read live), so this
 *   projection must not pretend to answer for it, and "plausible" is the only answer that
 *   keeps the result an upper bound.
 *
 * @param {object} option
 * @param {object} tallies
 * @returns {boolean}
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
 * The cheap, INDEXED availability projection: "does this actor plausibly have the materials
 * for this recipe?" (issue 1077, consumed by #1075's page rows and #1091's summary shape).
 *
 * ## Contract — this is an UPPER BOUND, not a guarantee
 *
 * The answer is derived from the snapshot's per-component quantities, per-tag quantities and
 * essence totals alone. It invokes `evaluateCraftability()` and `resolveIngredientSelection()`
 * **zero times**, which is the whole point: those solve ingredient CONTENTION, and contention
 * is the expensive thing being avoided here.
 *
 * The consequence is stated rather than hidden. When two ingredient groups of the same set
 * draw on the same held stacks, this projection counts those stacks for both and can answer
 * `available: true` where exact evaluation answers no. It is never wrong in the other
 * direction: an `available: false` is definitive, because a requirement that the totals
 * cannot cover cannot be covered by any assignment of them either.
 *
 * So a caller must present the positive answer as "looks makeable", never as "you can make
 * this". Exactness stays at craft time, where it already is and must remain; #1083 owns the
 * contended case for detail views.
 *
 * **Tools, checks, knowledge and currency are not consulted at all.** Each of those can only
 * ever make a recipe LESS craftable, so ignoring them keeps the result an upper bound; a
 * caller that needs them must ask the paths that own them.
 *
 * A recipe is plausibly makeable when ANY of its sets is, mirroring `evaluateCraftability`'s
 * any-set semantics; a set is when EVERY one of its groups has at least one plausible option
 * and its essence requirements are within the essence totals.
 *
 * @param {{quantityByComponentId: Map<string, number>, essenceTotals: Map<string, number>,
 *   quantityByTag: Map<string, number>}} tallies A snapshot's `componentTallies(system)`.
 * @param {object|null} recipe
 * @returns {{available: boolean, optimistic: true, missingEssenceIds: string[],
 *   unsatisfiedGroupCount: number}} `optimistic` is always `true` and is part of the shape so
 *   a consumer cannot read this result as an exact one by accident.
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
      // "No option is plausible" — a group is satisfied by ANY one of its options, so the
      // negation is over the whole group rather than per option.
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
    // Report the CLOSEST set's shortfall, so a caller showing "why not" names the set the
    // actor is nearest to satisfying rather than whichever happened to be authored first.
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
