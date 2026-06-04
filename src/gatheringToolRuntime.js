export function createGatheringToolAvailability({ craftingSystemManager, evaluator }) {
  return {
    async check({ actor, viewer, system, environment, task, tools = [] } = {}) {
      const matched = matchGatheringTools({ actor, system, task, tools, craftingSystemManager });
      const failedRequirements = [];
      for (const { tool } of matched.items) {
        if (!tool?.requirement) continue;
        const result = await evaluator?.evaluateRequirement?.({
          requirement: tool.requirement,
          actor,
          environment,
          task
        });
        if (result && result.allowed !== true) {
          failedRequirements.push({ tool, diagnostic: result.diagnostic, reasonCode: result.reasonCode });
        }
      }
      return {
        available: matched.missing.length === 0 && failedRequirements.length === 0,
        missing: matched.missing,
        failedRequirements,
        items: matched.items.map(({ item }) => item)
      };
    }
  };
}

export function matchGatheringTools({ actor, system, task, tools = [], craftingSystemManager } = {}) {
  const matchedItems = [];
  const missing = [];
  const syntheticRecipe = syntheticToolRecipe({ system, task });
  const matcher = resolveToolMatcher(craftingSystemManager);
  const items = normalizeFoundryCollection(actor?.items);

  for (const tool of tools) {
    // Attempt validation: a broken tool counts as unavailable (missing).
    const item = items.find(candidate => !isToolBroken(candidate) && matcher(syntheticRecipe, tool, candidate));
    if (item) {
      matchedItems.push({ tool, item });
    } else {
      missing.push(tool);
    }
  }

  return { items: matchedItems, missing };
}

/**
 * Classify each required tool's per-actor state for display: `present` (the
 * actor has a matching, non-broken item), `damaged` (matching item(s) exist but
 * all are flagged broken), or `missing` (no matching item). Uses the SAME
 * matcher as {@link matchGatheringTools} so the UI state stays consistent with
 * attempt validation; the only difference is that this splits broken matches
 * into a `damaged` tier instead of collapsing them into `missing`. Tolerant of
 * a null/empty actor (all `missing`); never throws.
 *
 * @returns {Array<{ tool: object, state: 'present'|'damaged'|'missing' }>}
 */
export function classifyGatheringToolStates({ actor, system, task, tools = [], craftingSystemManager } = {}) {
  const syntheticRecipe = syntheticToolRecipe({ system, task });
  const matcher = resolveToolMatcher(craftingSystemManager);
  const items = normalizeFoundryCollection(actor?.items);

  return tools.map(tool => {
    const matches = items.filter(candidate => matcher(syntheticRecipe, tool, candidate));
    let state = 'missing';
    if (matches.length > 0) {
      state = matches.some(candidate => !isToolBroken(candidate)) ? 'present' : 'damaged';
    }
    return { tool, state };
  });
}

/** True when an item carries any of the fabricate tool-broken flag forms. */
export function isToolBroken(candidate) {
  return candidate?.getFlag?.('fabricate', 'toolBroken') === true
    || candidate?.getFlag?.('fabricate', 'fabricate.toolBroken') === true
    || globalThis.foundry?.utils?.getProperty?.(candidate, 'flags.fabricate.toolBroken') === true
    || globalThis.foundry?.utils?.getProperty?.(candidate, 'flags.fabricate.fabricate.toolBroken') === true;
}

function syntheticToolRecipe({ system, task }) {
  return {
    id: `gathering:${task?.id ?? 'task'}`,
    craftingSystemId: system?.id ?? task?.craftingSystemId ?? null
  };
}

/**
 * Resolve the tool/item matcher, preferring the manager's own
 * `catalystMatchesItem` (tests inject this) and falling back to its
 * `recipeManager` (the production `CraftingSystemManager` delegates matching to
 * `RecipeManager`). Returns a bound function or a never-match fallback.
 */
function resolveToolMatcher(craftingSystemManager) {
  if (typeof craftingSystemManager?.catalystMatchesItem === 'function') {
    return (recipe, tool, candidate) => craftingSystemManager.catalystMatchesItem(recipe, tool, candidate);
  }
  const recipeManager = craftingSystemManager?.recipeManager;
  if (typeof recipeManager?.catalystMatchesItem === 'function') {
    return (recipe, tool, candidate) => recipeManager.catalystMatchesItem(recipe, tool, candidate);
  }
  return () => false;
}

function normalizeFoundryCollection(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  if (Array.isArray(collection.contents)) return collection.contents;
  if (typeof collection.values === 'function') return Array.from(collection.values());
  if (typeof collection[Symbol.iterator] === 'function') return Array.from(collection);
  return [];
}
