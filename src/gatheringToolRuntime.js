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
  const syntheticRecipe = {
    id: `gathering:${task?.id ?? 'task'}`,
    craftingSystemId: system?.id ?? task?.craftingSystemId ?? null
  };
  const items = normalizeFoundryCollection(actor?.items);

  for (const tool of tools) {
    const item = items.find(candidate => {
      const broken = candidate?.getFlag?.('fabricate', 'toolBroken') === true
        || candidate?.getFlag?.('fabricate', 'fabricate.toolBroken') === true
        || globalThis.foundry?.utils?.getProperty?.(candidate, 'flags.fabricate.toolBroken') === true
        || globalThis.foundry?.utils?.getProperty?.(candidate, 'flags.fabricate.fabricate.toolBroken') === true;
      if (broken) return false;
      return craftingSystemManager?.catalystMatchesItem?.(syntheticRecipe, tool, candidate);
    });
    if (item) {
      matchedItems.push({ tool, item });
    } else {
      missing.push(tool);
    }
  }

  return { items: matchedItems, missing };
}

function normalizeFoundryCollection(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  if (Array.isArray(collection.contents)) return collection.contents;
  if (typeof collection.values === 'function') return Array.from(collection.values());
  if (typeof collection[Symbol.iterator] === 'function') return Array.from(collection);
  return [];
}
