import { CraftingLifecycleExecutionError } from './CraftingLifecycleExecutor.js';

/**
 * Rebuilds a resumed stage's `{ tool, item }` pairs in Tool order (issue 2265): each planned item
 * pairs with the first unpaired Tool it matches, and a Tool left without one was planned as the
 * virtual station Tool. Unless the tool effect is `applied` (replayed from its receipt), a missing
 * or unmatched item refuses the resume rather than lending its usage or breakage to another Tool.
 */
export function pairPlannedTools(recipeManager, recipe, ingredientSet, { items, applied }) {
  const matches = (tool, item) =>
    recipeManager?.toolMatchesItemByIdentity?.(recipe, tool, item) === true ||
    recipeManager?.toolMatchesItem?.(recipe, tool, item) === true;
  const tools = recipeManager?.getToolsForSet?.(recipe, ingredientSet) ?? [];
  const pairedItems = tools.map(() => null);
  for (const item of items) {
    const index = tools.findIndex((tool, at) => item && !pairedItems[at] && matches(tool, item));
    if (index !== -1) pairedItems[index] = item;
    else if (!applied) {
      throw new CraftingLifecycleExecutionError(
        'A planned crafting tool is no longer available',
        'STAGE_RECONSTRUCTION_FAILED'
      );
    }
  }
  return tools.map((tool, at) =>
    pairedItems[at] ? { tool, item: pairedItems[at] } : { tool, item: null, virtual: true }
  );
}
