// Sums ingredient needs across queued recipes, deduplicates by component, and computes have and
// missing counts per material. No Foundry or DOM dependency.
// Currency affordability is bound to the CRAFTING ACTOR and to no one else (issue 1493): the probe
// `evaluateShoppingRequirement` builds is constant-`false` without it, so an aggregation that
// supplies none reports every currency requirement as missing however much the player carries. It
// is not one of the component-source actors' roles — a source actor lends items, the actor pays.

// Priority: componentId, itemUuid, currency description, description. A CURRENCY requirement is
// namespaced separately (issue 1493) even falling back to the same `description`, because the merge
// sums `need` into one `totalNeed` and a price is not summable with an item quantity.
function _buildIngredientKey(ingredientState) {
  if (ingredientState.componentId) return `cid:${ingredientState.componentId}`;
  if (ingredientState.itemUuid) return `uuid:${ingredientState.itemUuid}`;
  const description = ingredientState.description ?? 'unknown';
  if (ingredientState.isCurrency === true) return `cur:${description}`;
  return `desc:${description}`;
}

// Read off the evaluation's own verdict and NEVER re-derived from `have`/`need`: a currency state's
// `have` is a documented placeholder and its `need` is a price. Its SCOPE is one craft of one
// recipe, which is the only question the resolver was asked; `_finaliseCurrency` reconciles that
// with an aggregate spanning several.
function _isAffordable(ingredientState) {
  if (typeof ingredientState.affordable === 'boolean') return ingredientState.affordable;
  return ingredientState.satisfied === true;
}

function _nonblankText(value) {
  return typeof value === 'string' && value.trim() !== '' ? value : '';
}

function _mergeIngredient(existing, incoming, recipeId, recipeName, recipeQuantity) {
  const contribution = (incoming.need ?? 0) * recipeQuantity;
  existing.totalNeed += contribution;
  // `have` is shared inventory, so the latest evaluation value always wins.
  existing.have = incoming.have ?? 0;
  if (incoming.isEssence === true) existing.isEssence = true;
  // A conjunction across the recipes naming the same cost, and the ONLY writer of `affordable` —
  // the seed below is the conjunction's identity, not a second derivation, because two writers of
  // one field are individually unguardable: delete either and a single-contribution entry is still
  // right.
  if (incoming.isCurrency === true) {
    existing.isCurrency = true;
    existing.affordable = existing.affordable && _isAffordable(incoming);
    // FIRST non-blank wins: the reason is a property of the world's currency setup, so a later
    // blank one — a recipe whose option happens to resolve — must not erase it.
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

// Settled by AFFORDABILITY, not by a shortfall count: `totalNeed - have` reads `100 - 0` for a
// player carrying a thousand gold, and `missing` is pinned to 0 because there is no quantity to go
// and acquire (issue 1493).
// THE VERDICT'S SCOPE is one craft of one recipe, while `totalNeed` is multiplied by the queued
// quantity and summed across recipes — so `satisfied = affordable` once claimed that 150 gp covers
// five 100 gp crafts. The verdict is therefore reported only where it reaches: an aggregate that IS
// one craft's cost, and a NEGATIVE verdict, which covers any aggregate. Otherwise the entry stays
// unsatisfied so the row remains visible and `affordabilityChecked: false` tells the surface to
// state the cost without a verdict. `costRepeats` is exact, because two costs merge only when their
// formatted descriptions — and therefore their amounts — are identical.
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

    // The shopping requirement (max need per component across sets) is preferred, falling back to
    // single-set craftability where a manager does not expose it. `{ craftingActor }` is an OPTIONS
    // BAG on both seams, NEVER a positional third argument: passing the actor bare destructures to
    // `undefined` and leaves the currency probe constant-false, which an argument-count assertion
    // would happily pass.
    const evaluation = componentSourceActors && componentSourceActors.length > 0
      ? (typeof recipeManager.evaluateShoppingRequirement === 'function'
          ? recipeManager.evaluateShoppingRequirement(componentSourceActors, recipe, { craftingActor })
          : recipeManager.evaluateCraftability(componentSourceActors, recipe, { craftingActor }))
      : { ingredientStates: [], essenceStates: [], toolStates: [] };

    const ingredientStates = evaluation?.ingredientStates ?? [];
    const essenceStates = evaluation?.essenceStates ?? [];
    const toolStates = evaluation?.toolStates ?? [];

    for (const ing of ingredientStates) {
      const key = _buildIngredientKey(ing);
      if (!ingredientMap.has(key)) {
        ingredientMap.set(key, {
          // STAMPED, so every consumer keys on the same rule. A coarser re-derivation collapses
          // two entries this map kept apart, and Svelte answers that with `each_key_duplicate`,
          // thrown in the production branch too — taking down the app rather than the row.
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
          // Carried so the shopping list can branch. Neither `have` nor `totalNeed` may be
          // REPORTED for it: `have` is a placeholder, so "0 / 100 owned" states a false balance.
          isCurrency: ing.isCurrency === true,
          // The conjunction's IDENTITY, never a verdict: every contribution is folded in
          // `_mergeIngredient`, so this field has exactly one writer.
          affordable: true,
          // A refusal for a CONFIGURATION reason is not an affordability shortfall, and without
          // this the list would tell a player carrying 1000 gp they cannot afford 100 gp.
          issue: '',
          recipeBreakdown: []
        });
      }
      _mergeIngredient(ingredientMap.get(key), ing, recipeId, recipe.name, quantity);
    }

    for (const ess of essenceStates) {
      const type = ess.type ?? ess.essenceType ?? 'unknown';
      if (!essenceMap.has(type)) {
        essenceMap.set(type, {
          // Namespaced because essences and ingredients fold into ONE keyed list, and an essence
          // type and an ingredient description are unrelated strings that may coincide.
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

    // Required but REUSABLE: deduplicated, never multiplied by the queued quantity.
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
      // Any evaluation showing it unavailable, or broken, settles the aggregate that way.
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

  const essences = Array.from(essenceMap.values()).map(ess => {
    const missing = Math.max(0, ess.totalNeed - ess.have);
    return {
      ...ess,
      missing,
      satisfied: missing === 0
    };
  });

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
