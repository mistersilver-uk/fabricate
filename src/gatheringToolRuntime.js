/**
 * Resolve the set of virtually-present componentIds that apply to a given
 * crafting-system scope.
 *
 * A virtual-present tool (injected by an active canvas Tool station) is keyed by
 * BOTH `componentId` and the active tool's `systemId`. Because `componentId` is a
 * PER-SYSTEM id, a present tool from system A must NOT satisfy a system-B task or
 * recipe whose required tool shares the same componentId string. This resolver
 * enforces that scope: it returns the present componentIds ONLY when the active
 * tool's `systemId` matches the scope `systemId`; otherwise it returns an empty
 * set, so the present tool is inert against out-of-scope tasks/recipes.
 *
 * Tolerant of legacy/empty input: a bare `string[]` (no system scope) is treated
 * as unscoped and ignored under system-scoped matching; with no active tool the
 * set is empty (inert).
 *
 * @param {object} params
 * @param {{ systemId?: string|null, componentIds?: string[] }|string[]|null} [params.presentTools]
 *   The active canvas Tool's virtual-present payload.
 * @param {string|null} [params.systemId] The crafting-system id of the task/recipe
 *   being evaluated.
 * @returns {Set<string>} componentIds present for this system scope.
 */
export function resolvePresentComponentIds({ presentTools, systemId } = {}) {
  if (!presentTools || Array.isArray(presentTools)) {
    // No scoped payload (or a legacy bare array with no system scope): under
    // system-scoped matching there is no resolvable scope, so treat as inert.
    return new Set();
  }
  const toolSystemId = presentTools.systemId ?? null;
  const scopeSystemId = systemId ?? null;
  // Scope guard: the active tool only counts for its own crafting system.
  if (!toolSystemId || !scopeSystemId || toolSystemId !== scopeSystemId) {
    return new Set();
  }
  const componentIds = Array.isArray(presentTools.componentIds) ? presentTools.componentIds : [];
  return new Set(componentIds.filter(id => typeof id === 'string' && id));
}

export function createGatheringToolAvailability({ craftingSystemManager, evaluator }) {
  return {
    async check({ actor, viewer, system, environment, task, tools = [], presentTools = null } = {}) {
      const matched = matchGatheringTools({ actor, system, task, tools, craftingSystemManager, presentTools });
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
        // A virtual-present (canvas-tool) match has no owned item; drop the null
        // so consumers only see real owned items.
        items: matched.items.map(({ item }) => item).filter(Boolean)
      };
    }
  };
}

/**
 * Resolve required tools to owned `{ tool, item }` pairs against an actor.
 *
 * Virtual-present injection (Phase 4): a required tool whose `componentId` is in
 * the active canvas Tool's `presentTools` payload AND whose owning crafting
 * system matches the active tool's `systemId` matches as VIRTUALLY present even
 * when the actor owns no matching item. A virtual match is
 * `{ tool, item: null, virtual: true }` so it satisfies availability but is
 * excluded from breakage/usage (there is no owned item to mutate). An owned,
 * non-broken item still takes precedence over a virtual match. The system scope
 * is enforced by {@link resolvePresentComponentIds}: a present tool from system A
 * never satisfies a system-B task.
 *
 * @param {object} params
 * @param {{ systemId?: string|null, componentIds?: string[] }|null} [params.presentTools]
 *   virtual-present payload supplied by an active canvas Tool station.
 */
export function matchGatheringTools({ actor, system, task, tools = [], craftingSystemManager, presentTools = null } = {}) {
  const matchedItems = [];
  const missing = [];
  const syntheticRecipe = syntheticToolRecipe({ system, task });
  const matcher = resolveToolMatcher(craftingSystemManager);
  const items = normalizeFoundryCollection(actor?.items);
  const presentSet = resolvePresentComponentIds({
    presentTools,
    systemId: system?.id ?? task?.craftingSystemId ?? null
  });

  for (const tool of tools) {
    // Attempt validation: a broken tool counts as unavailable (missing).
    const item = items.find(candidate => !isToolBroken(candidate) && matcher(syntheticRecipe, tool, candidate));
    if (item) {
      matchedItems.push({ tool, item });
    } else if (presentSet.has(tool?.componentId)) {
      // Virtual-present: satisfied by the active canvas Tool, no owned item.
      matchedItems.push({ tool, item: null, virtual: true });
    } else {
      missing.push(tool);
    }
  }

  return { items: matchedItems, missing };
}

/**
 * Classify each required tool's per-actor state for display: `present` (the
 * actor has a matching, non-broken item), `damaged` (rendered as "Broken"), or
 * `missing` (no matching item). Uses the SAME matcher as
 * {@link matchGatheringTools} so the UI state stays consistent with attempt
 * validation; the only difference is that this splits broken matches into a
 * `damaged` tier instead of collapsing them into `missing`.
 *
 * The `damaged` tier has two sources, checked only when no working item matched
 * (working-item precedence — holding both the working tool and a broken variant
 * yields `present`):
 *   1. The matched item(s) for the tool's OWN component all carry the
 *      `flags.fabricate.toolBroken` flag (the `flagBroken` breakage form).
 *   2. The tool's `onBreak.mode === 'replaceWith'` with a non-empty
 *      `replacementComponentId`, and the actor holds an item matching that
 *      separate replacement component (the `replaceWith` repair-stock broken
 *      variant). This recognition is display-only and does NOT change attempt
 *      validation in {@link matchGatheringTools}.
 *
 * Tolerant of a null/empty actor (all `missing`); never throws. A null/empty/
 * missing `replacementComponentId` never produces a synthetic probe.
 *
 * @returns {Array<{ tool: object, state: 'present'|'damaged'|'missing' }>}
 */
export function classifyGatheringToolStates({ actor, system, task, tools = [], craftingSystemManager, presentTools = null } = {}) {
  const syntheticRecipe = syntheticToolRecipe({ system, task });
  const matcher = resolveToolMatcher(craftingSystemManager);
  const items = normalizeFoundryCollection(actor?.items);
  const presentSet = resolvePresentComponentIds({
    presentTools,
    systemId: system?.id ?? task?.craftingSystemId ?? null
  });

  return tools.map(tool => {
    const matches = items.filter(candidate => matcher(syntheticRecipe, tool, candidate));
    let state = 'missing';
    if (matches.length > 0) {
      state = matches.some(candidate => !isToolBroken(candidate)) ? 'present' : 'damaged';
    } else if (presentSet.has(tool?.componentId)) {
      // Virtual-present: an active canvas Tool station satisfies this tool.
      state = 'present';
    }

    // Fallback: a held `replaceWith` broken-variant component is a separate
    // managed component (no toolBroken flag), so it never matches the tool's own
    // component above. When no working item matched, probe for it via the same
    // matcher and surface it as `damaged` (display-only).
    if (state === 'missing' && tool?.onBreak?.mode === 'replaceWith') {
      const replacementComponentId = tool.onBreak.replacementComponentId;
      if (typeof replacementComponentId === 'string' && replacementComponentId.trim()) {
        const replacementTool = { componentId: replacementComponentId };
        if (items.some(candidate => matcher(syntheticRecipe, replacementTool, candidate))) {
          state = 'damaged';
        }
      }
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
 * Resolve the tool/item matcher.
 *
 * Resolution prefers the manager's own `toolMatchesItem`, then falls back to its
 * `recipeManager` (the production `CraftingSystemManager` delegates matching to
 * `RecipeManager`). Returns a bound function or a never-match fallback.
 */
function resolveToolMatcher(craftingSystemManager) {
  if (typeof craftingSystemManager?.toolMatchesItem === 'function') {
    return (recipe, tool, candidate) => craftingSystemManager.toolMatchesItem(recipe, tool, candidate);
  }
  const recipeManager = craftingSystemManager?.recipeManager;
  if (typeof recipeManager?.toolMatchesItem === 'function') {
    return (recipe, tool, candidate) => recipeManager.toolMatchesItem(recipe, tool, candidate);
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
