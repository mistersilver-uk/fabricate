// Which components the workbench auto-fill places, given a recipe, the system's components and the
// current palette. Each ingredient set is tried in order; the first fully satisfiable one wins, and
// with none the BEST PARTIAL (fewest unfulfilled groups) is returned rather than nothing.
// No Foundry dependency.

function _attemptSet(ingredientSet, systemComponents, palette, expandGroupFn) {
  const groups = Array.isArray(ingredientSet.ingredientGroups)
    ? ingredientSet.ingredientGroups
    : [];

  const paletteMap = new Map(palette.map(e => [e.componentId, e]));
  // What this attempt has already committed, so one palette entry cannot be spent twice.
  const committed = new Map();

  const entries = [];
  const unfulfilled = [];

  for (const group of groups) {
    const quantity = Number(group.quantity) || 1;
    const candidateIds = expandGroupFn(group, systemComponents);

    let chosen = null;
    let chosenAvailable = 0;

    for (const componentId of candidateIds) {
      const paletteEntry = paletteMap.get(componentId);
      if (!paletteEntry) continue;

      const alreadyCommitted = committed.get(componentId) || 0;
      const available = paletteEntry.inventoryQuantity - alreadyCommitted;

      if (available >= quantity) {
        chosen = paletteEntry;
        chosenAvailable = available;
        break;
      }
    }

    if (chosen) {
      const already = committed.get(chosen.componentId) || 0;
      committed.set(chosen.componentId, already + quantity);

      const existing = entries.find(e => e.componentId === chosen.componentId);
      if (existing) {
        existing.quantity += quantity;
      } else {
        entries.push({
          componentId: chosen.componentId,
          name: chosen.name,
          img: chosen.img,
          quantity
        });
      }
    } else {
      unfulfilled.push({ group, quantity, candidateIds: [...candidateIds] });
    }
  }

  return {
    entries,
    unfulfilled,
    fulfilled: unfulfilled.length === 0
  };
}

export function resolveAutoFill(recipe, systemComponents, palette, expandGroupFn) {
  const sets = Array.isArray(recipe?.ingredientSets) ? recipe.ingredientSets : [];

  if (sets.length === 0) {
    return { entries: [], unfulfilled: [] };
  }

  let bestPartial = null;

  for (const set of sets) {
    const result = _attemptSet(set, systemComponents, palette, expandGroupFn);

    if (result.fulfilled) {
      return { entries: result.entries, unfulfilled: [] };
    }

    if (
      bestPartial === null ||
      result.unfulfilled.length < bestPartial.unfulfilled.length
    ) {
      bestPartial = result;
    }
  }

  return {
    entries: bestPartial?.entries ?? [],
    unfulfilled: bestPartial?.unfulfilled ?? []
  };
}
