/**
 * shoppingListAggregator — Pure aggregation function for shopping list (T-059)
 *
 * Takes a list of { recipeId, quantity } entries and recipe evaluation data,
 * sums ingredient needs across recipes, deduplicates by component, and
 * computes have/missing counts per material.
 *
 * No Foundry or DOM dependencies — fully unit-testable.
 */

/**
 * Build a stable deduplication key for an ingredient state.
 * Priority: componentId > itemUuid > currency description > description (tag fallback)
 *
 * A CURRENCY requirement is namespaced separately (issue 1493) even though it falls back
 * to the same `description`: the merge below sums `need` into one `totalNeed`, and a price
 * and an item quantity are not summable into one number. Only a managed component carries
 * an id, so without the namespace a currency cost and a tag requirement that happened to
 * describe identically would aggregate into a single row of neither kind.
 *
 * @param {object} ingredientState
 * @returns {string}
 */
function _buildIngredientKey(ingredientState) {
  if (ingredientState.componentId) return `cid:${ingredientState.componentId}`;
  if (ingredientState.itemUuid) return `uuid:${ingredientState.itemUuid}`;
  const description = ingredientState.description ?? 'unknown';
  if (ingredientState.isCurrency === true) return `cur:${description}`;
  return `desc:${description}`;
}

/**
 * Whether an ingredient state's cost is one the crafting actor can meet.
 *
 * Read off the evaluation's own `affordable` verdict, falling back to `satisfied` for a
 * duck-typed state from an older manager. Never re-derived from `have`/`need`: a currency
 * state's `have` is a documented placeholder and its `need` is a price.
 *
 * The verdict's SCOPE is one craft of one recipe — that is the only question the resolver
 * was asked. `_finaliseCurrency` below is where that scope is reconciled with an aggregate
 * that may span several crafts.
 *
 * @param {object} ingredientState
 * @returns {boolean}
 */
function _isAffordable(ingredientState) {
  if (typeof ingredientState.affordable === 'boolean') return ingredientState.affordable;
  return ingredientState.satisfied === true;
}

function _nonblankText(value) {
  return typeof value === 'string' && value.trim() !== '' ? value : '';
}

/**
 * Merge an incoming ingredient state into an existing aggregated entry.
 *
 * @param {object} existing - The current aggregated entry (mutated in-place)
 * @param {object} incoming - The evaluation state for a single recipe ingredient
 * @param {string} recipeId
 * @param {string} recipeName
 * @param {number} recipeQuantity - The shopping list quantity multiplier
 */
function _mergeIngredient(existing, incoming, recipeId, recipeName, recipeQuantity) {
  const contribution = (incoming.need ?? 0) * recipeQuantity;
  existing.totalNeed += contribution;
  // `have` is shared inventory — always reflect the latest evaluation value
  existing.have = incoming.have ?? 0;
  if (incoming.isEssence === true) existing.isEssence = true;
  // Affordability is a conjunction across the recipes that name the same cost: one
  // queued recipe the actor cannot pay for makes the aggregated requirement unmet. This
  // is the ONLY writer of `affordable` — the seed below is the conjunction's identity
  // (`true`), not a second derivation of the same field, because two writers of one
  // field are individually unguardable: whichever you delete, the other still produces
  // the right answer for a single-contribution entry.
  if (incoming.isCurrency === true) {
    existing.isCurrency = true;
    existing.affordable = existing.affordable && _isAffordable(incoming);
    // The world-configuration reason, if this contribution carries one. FIRST non-blank
    // wins: the reason is a property of the world's currency setup, so every
    // contribution that has one carries the same sentence, and a later blank one (a
    // recipe whose option happens to resolve) must not erase it.
    if (!existing.issue) existing.issue = _nonblankText(incoming.issue);
  }
  if (!isNonblankIcon(existing.icon) && isNonblankIcon(incoming.icon)) {
    existing.icon = incoming.icon;
  }
  existing.recipeBreakdown.push({
    recipeId,
    recipeName,
    quantity: recipeQuantity,
    need: incoming.need ?? 0
  });
}

function isNonblankIcon(value) {
  return typeof value === 'string' && value.trim() !== '';
}

/**
 * Settle a CURRENCY entry (issue 1493).
 *
 * A currency requirement is settled by AFFORDABILITY, not by a shortfall count.
 * `totalNeed - have` would read `100 - 0` for a player carrying a thousand gold, so the
 * ratio decides nothing here; `missing` is pinned to 0 because there is no quantity of
 * anything to go and acquire.
 *
 * THE SCOPE OF THE VERDICT. `affordable` answers exactly one question — "can this actor
 * pay ONE craft of this recipe?" — because that is the only question the resolver was
 * asked, and this module has no coin balance of its own to ask a wider one with (`have`
 * is a documented placeholder, never a purse). `totalNeed`, meanwhile, is multiplied by
 * the queued quantity and summed across recipes. Reporting `satisfied = affordable`
 * against it therefore claimed that 150 gp covers a queue of five 100 gp crafts.
 *
 * So the verdict is reported only where it actually reaches:
 *  - the aggregate is ONE craft's cost — the verdict covers it exactly, and stands;
 *  - the actor cannot afford one craft — they cannot afford N >= 1 either, so the
 *    NEGATIVE verdict covers any aggregate and stands;
 *  - otherwise the aggregate exceeds what was checked. The entry stays unsatisfied so the
 *    row remains visible, and `affordabilityChecked: false` tells the surface to state the
 *    cost WITHOUT a verdict rather than invent either colour. `costRepeats` is how many
 *    times the checked cost recurs — exact, because two costs merge into one entry only
 *    when their formatted descriptions are identical, which means their amounts are.
 *
 * @param {object} entry
 * @returns {object}
 */
function _finaliseCurrency(entry) {
  const singleCraftCost = entry.recipeBreakdown.reduce(
    (highest, row) => Math.max(highest, row.need ?? 0),
    0
  );
  const affordable = entry.affordable === true;
  const affordabilityChecked = !affordable || entry.totalNeed <= singleCraftCost;
  return {
    ...entry,
    missing: 0,
    affordabilityChecked,
    costRepeats: singleCraftCost > 0 ? Math.round(entry.totalNeed / singleCraftCost) : 1,
    satisfied: affordable && affordabilityChecked
  };
}

/**
 * Aggregate shopping list entries into a summary of materials needed.
 *
 * @param {Array<{recipeId: string, quantity: number}>} entries
 * @param {object} recipeManager - Must expose getRecipe() and evaluateCraftability()
 * @param {Array} componentSourceActors - Actor inventory sources for have/need calcs
 * @param {object} [options]
 * @param {object|null} [options.craftingActor] - The actor the craft would run AS.
 *   Currency affordability is bound to that actor and to no one else (issue 1493): the
 *   probe `evaluateShoppingRequirement` builds is constant-`false` without it, so an
 *   aggregation that supplies nothing reports every currency requirement as missing no
 *   matter how much the player is carrying, and the shopping list tells them to buy the
 *   materials they could simply have paid for. It is NOT one of the component-source
 *   actors' roles — a source actor lends items, the crafting actor spends coin.
 * @returns {{
 *   ingredients: Array,
 *   essences: Array,
 *   tools: Array,
 *   allSatisfied: boolean,
 *   totalRecipes: number,
 *   totalQuantity: number
 * }}
 */
export function aggregateShoppingList(
  entries,
  recipeManager,
  componentSourceActors,
  { craftingActor = null } = {}
) {
  if (!entries || entries.length === 0) {
    return {
      ingredients: [],
      essences: [],
      tools: [],
      allSatisfied: true,
      totalRecipes: 0,
      totalQuantity: 0
    };
  }

  const ingredientMap = new Map();  // key -> aggregated ingredient entry
  const essenceMap = new Map();     // essenceType -> aggregated essence entry
  const toolMap = new Map();        // componentId -> tool entry

  let totalRecipes = 0;
  let totalQuantity = 0;

  for (const entry of entries) {
    const { recipeId, quantity } = entry;
    if (!quantity || quantity <= 0) continue;

    const recipe = recipeManager.getRecipe(recipeId);
    if (!recipe) continue;

    totalRecipes += 1;
    totalQuantity += quantity;

    // Prefer the shopping requirement (materials to craft once via ANY ingredient
    // set — max need per component across sets), falling back to single-set
    // craftability when the manager does not expose it (e.g. test stubs).
    // `{ craftingActor }` is an OPTIONS BAG on both seams, never a positional third
    // argument: passing the actor bare destructures `actor.craftingActor` to `undefined`
    // and the currency probe stays constant-false — the fix ships as a silent no-op that
    // an argument-count assertion would happily pass.
    const evaluation = componentSourceActors && componentSourceActors.length > 0
      ? (typeof recipeManager.evaluateShoppingRequirement === 'function'
          ? recipeManager.evaluateShoppingRequirement(componentSourceActors, recipe, { craftingActor })
          : recipeManager.evaluateCraftability(componentSourceActors, recipe, { craftingActor }))
      : { ingredientStates: [], essenceStates: [], toolStates: [] };

    const ingredientStates = evaluation?.ingredientStates ?? [];
    const essenceStates = evaluation?.essenceStates ?? [];
    const toolStates = evaluation?.toolStates ?? [];

    // --- Ingredients ---
    for (const ing of ingredientStates) {
      const key = _buildIngredientKey(ing);
      if (!ingredientMap.has(key)) {
        ingredientMap.set(key, {
          // The dedup key, STAMPED so every consumer keys on the same rule. A list that
          // re-derives it renders one row per its OWN notion of identity, and a coarser
          // rule collapses two entries this map deliberately kept apart — which Svelte
          // answers with `each_key_duplicate`, thrown in the production branch as well as
          // the dev one, taking down the whole app rather than the row (issue 1493).
          key,
          componentId: ing.componentId ?? null,
          itemUuid: ing.itemUuid ?? null,
          name: ing.name ?? '',
          img: ing.img ?? null,
          isEssence: ing.isEssence === true,
          icon: isNonblankIcon(ing.icon) ? ing.icon : null,
          description: ing.description ?? '',
          totalNeed: 0,
          have: ing.have ?? 0,
          // A CURRENCY cost (issue 1493), carried so the shopping list can branch. Its
          // `have`/`totalNeed` are projected for shape parity with every other entry, but
          // neither may be REPORTED: `have` is the evaluation's placeholder, never a coin
          // balance, so "0 / 100 owned" states a balance the player does not have.
          isCurrency: ing.isCurrency === true,
          // The IDENTITY of the conjunction `_mergeIngredient` applies, never a verdict:
          // every contribution — including this entry's first — is folded in there, so
          // this field has exactly one writer. A non-currency entry keeps `true` and is
          // shopped for on the have/need ratio below, never on affordability.
          affordable: true,
          // The world's reason the currency could not be resolved AT ALL, or ''. Carried
          // because a refusal for a configuration reason is not an affordability
          // shortfall, and the shopping list is otherwise unable to tell them apart: it
          // would tell a player carrying 1000 gp that they cannot afford 100 gp.
          issue: '',
          recipeBreakdown: []
        });
      }
      _mergeIngredient(ingredientMap.get(key), ing, recipeId, recipe.name, quantity);
    }

    // --- Essences ---
    for (const ess of essenceStates) {
      const type = ess.type ?? ess.essenceType ?? 'unknown';
      if (!essenceMap.has(type)) {
        essenceMap.set(type, {
          // Namespaced, because the shopping list folds essences and ingredients into ONE
          // keyed list: an essence type and an ingredient description are unrelated
          // strings that may coincide, and the fold is where they would collide.
          key: `ess:${type}`,
          type,
          name: ess.name ?? type,
          isEssence: true,
          icon: isNonblankIcon(ess.icon) ? ess.icon : null,
          totalNeed: 0,
          have: ess.have ?? 0
        });
      }
      const existing = essenceMap.get(type);
      if (!isNonblankIcon(existing.icon) && isNonblankIcon(ess.icon)) {
        existing.icon = ess.icon;
      }
      existing.totalNeed += (ess.need ?? 0) * quantity;
      existing.have = ess.have ?? 0;
    }

    // --- Tools (required-but-reusable — no quantity multiplication, just deduplicate) ---
    for (const tool of toolStates) {
      const key = tool.componentId ?? tool.name ?? 'unknown';
      if (!toolMap.has(key)) {
        toolMap.set(key, {
          key: `tool:${key}`,
          componentId: tool.componentId ?? null,
          name: tool.name ?? tool.description ?? key,
          img: tool.img ?? null,
          available: tool.available ?? tool.satisfied ?? false,
          needsRepair: tool.needsRepair === true
        });
      }
      // Availability: if any evaluation shows it unavailable, mark unavailable;
      // a broken (needs-repair) tool anywhere makes the aggregate need a repair.
      const existingTool = toolMap.get(key);
      if (!(tool.available ?? tool.satisfied ?? false)) {
        existingTool.available = false;
      }
      if (tool.needsRepair === true) {
        existingTool.needsRepair = true;
      }
    }
  }

  const ingredients = Array.from(ingredientMap.values()).map(ing => {
    if (ing.isCurrency === true) return _finaliseCurrency(ing);
    const missing = Math.max(0, ing.totalNeed - ing.have);
    return {
      ...ing,
      missing,
      satisfied: missing === 0
    };
  });

  // --- Finalise essences ---
  const essences = Array.from(essenceMap.values()).map(ess => {
    const missing = Math.max(0, ess.totalNeed - ess.have);
    return {
      ...ess,
      missing,
      satisfied: missing === 0
    };
  });

  // --- Finalise tools ---
  const tools = Array.from(toolMap.values());

  const allSatisfied =
    ingredients.every(i => i.satisfied) &&
    essences.every(e => e.satisfied) &&
    tools.every(t => t.available);

  return {
    ingredients,
    essences,
    tools,
    allSatisfied,
    totalRecipes,
    totalQuantity
  };
}
