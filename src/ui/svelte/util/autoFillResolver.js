/**
 * autoFillResolver — Pure function for auto-fill algorithm (Task 5, Phase B)
 *
 * Given a recipe, the system's components, and the current palette, determines
 * the best ingredient set to satisfy from the workbench and returns the
 * resolved component entries to place in the workbench.
 *
 * This module has no Foundry dependencies and is fully unit-testable.
 */

/**
 * Attempt to satisfy a single ingredient set using the palette.
 *
 * @param {object} ingredientSet - { ingredientGroups: [{ options, quantity }] }
 * @param {object[]} systemComponents - All components in the system
 * @param {object[]} palette - Current palette entries [{ componentId, inventoryQuantity }]
 * @param {Function} expandGroupFn - expandGroupToComponentIds(group, systemComponents) => Set<string>
 * @returns {{ entries: object[], unfulfilled: object[], fulfilled: boolean }}
 */
function _attemptSet(ingredientSet, systemComponents, palette, expandGroupFn) {
  const groups = Array.isArray(ingredientSet.ingredientGroups)
    ? ingredientSet.ingredientGroups
    : [];

  const paletteMap = new Map(palette.map(e => [e.componentId, e]));
  // Track how many of each component we've committed in this attempt
  const committed = new Map();

  const entries = [];
  const unfulfilled = [];

  for (const group of groups) {
    const quantity = Number(group.quantity) || 1;
    const candidateIds = expandGroupFn(group, systemComponents);

    // Find the first candidate component with sufficient available quantity
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
      // Could not satisfy this group — record as unfulfilled
      unfulfilled.push({ group, quantity, candidateIds: [...candidateIds] });
    }
  }

  return {
    entries,
    unfulfilled,
    fulfilled: unfulfilled.length === 0
  };
}

/**
 * Resolve the auto-fill workbench entries for a recipe.
 *
 * Algorithm:
 * 1. Try each ingredient set in order.
 * 2. Use the first fully satisfiable set.
 * 3. If none fully satisfiable, use the "best partial" (fewest unfulfilled groups).
 *
 * @param {object} recipe - Recipe with ingredientSets array
 * @param {object[]} systemComponents - All components in the system
 * @param {object[]} palette - Palette entries [{ componentId, name, img, inventoryQuantity }]
 * @param {Function} expandGroupFn - (group, systemComponents) => Set<string> of candidate component IDs
 * @returns {{ entries: object[], unfulfilled: object[] }}
 *   entries: [{ componentId, name, img, quantity }] — items to put in workbench
 *   unfulfilled: groups that could not be satisfied
 */
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

    // Track best partial (fewest unfulfilled)
    if (
      bestPartial === null ||
      result.unfulfilled.length < bestPartial.unfulfilled.length
    ) {
      bestPartial = result;
    }
  }

  // No fully satisfiable set — return best partial
  return {
    entries: bestPartial?.entries ?? [],
    unfulfilled: bestPartial?.unfulfilled ?? []
  };
}
