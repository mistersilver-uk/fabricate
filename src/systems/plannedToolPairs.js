/**
 * Pairs a resumed stage's planned tool items with its Tools by match, in plan order, because a
 * virtual station Tool plans no item (issue 2265). An unmatched item takes the first Tool left.
 */
export function pairPlannedTools(recipeManager, recipe, ingredientSet, items) {
  const matches = (tool, item) =>
    recipeManager?.toolMatchesItemByIdentity?.(recipe, tool, item) === true ||
    recipeManager?.toolMatchesItem?.(recipe, tool, item) === true;
  const unpaired = [...(recipeManager?.getToolsForSet?.(recipe, ingredientSet) ?? [])];
  const matched = items.map((item) => {
    const index = unpaired.findIndex((tool) => matches(tool, item));
    return { item, tool: index === -1 ? null : unpaired.splice(index, 1)[0] };
  });
  return matched.map((pair) => (pair.tool ? pair : { ...pair, tool: unpaired.shift() ?? null }));
}
