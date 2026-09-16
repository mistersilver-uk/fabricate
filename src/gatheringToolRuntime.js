/**
 * The virtually-present componentIds that apply to one crafting-system scope. `componentId` is a
 * PER-SYSTEM id, so a present tool from system A must NOT satisfy a system-B task sharing the
 * string: present ids are returned only on a `systemId` match, and a legacy bare `string[]`, which
 * carries no scope, is ignored.
 */
export function resolvePresentComponentIds({ presentTools, systemId } = {}) {
  return resolvePresentIds({ presentTools, systemId, key: 'componentIds' });
}

/**
 * The `toolId` twin of `resolvePresentComponentIds` (issue 1119): virtual presence was keyed on
 * `componentId`, which `upsertTool` force-nulls for any item source — every Tool station a GM could
 * build. The same per-system scope guard applies, a library tool id being unique per system only.
 */
export function resolvePresentToolIds({ presentTools, systemId } = {}) {
  return resolvePresentIds({ presentTools, systemId, key: 'toolIds' });
}

/** The shared scope guard behind both resolvers: both id kinds are per-system. */
function resolvePresentIds({ presentTools, systemId, key }) {
  if (!presentTools || Array.isArray(presentTools)) {
    // No scoped payload, or a legacy bare array: under system-scoped matching there is no
    // resolvable scope, so treat it as inert.
    return new Set();
  }
  const toolSystemId = presentTools.systemId ?? null;
  const scopeSystemId = systemId ?? null;
  // Scope guard: the active tool only counts for its own crafting system.
  if (!toolSystemId || !scopeSystemId || toolSystemId !== scopeSystemId) {
    return new Set();
  }
  const ids = Array.isArray(presentTools[key]) ? presentTools[key] : [];
  return new Set(ids.filter(id => typeof id === 'string' && id));
}

export function createGatheringToolAvailability({ craftingSystemManager, evaluator }) {
  return {
    async check({ actor, viewer, system, environment, task, tools = [], presentTools = null } = {}) {
      const matched = matchGatheringTools({ actor, system, task, tools, craftingSystemManager, presentTools });
      const failedRequirements = [];
      for (const { tool, item, virtual } of matched.items) {
        const boundActor = virtual === true ? actor : (item?.parent ?? actor);
        const gate = await evaluateToolPrerequisiteGate({
          tool,
          actor: boundActor,
          prerequisiteDefinitions: resolveCharacterPrerequisiteLibrary(system),
          evaluatePrerequisite: ({ actor: gateActor, prerequisite }) =>
            evaluatePrerequisite(gateActor?.getRollData?.() ?? gateActor?.system ?? {}, prerequisite),
        });
        if (!gate.usable) {
          failedRequirements.push({
            tool,
            diagnostic: null,
            reasonCode: 'TOOL_PREREQUISITE_FAILED',
          });
        }
        if (tool?.requirement) {
          const result = await evaluator?.evaluateRequirement?.({
            requirement: tool.requirement,
            actor,
            environment,
            task
          });
          if (result && result.allowed !== true) {
            failedRequirements.push({
              tool,
              diagnostic: result.diagnostic,
              reasonCode: result.reasonCode,
            });
          }
        }
      }
      return {
        available: matched.missing.length === 0 && failedRequirements.length === 0,
        missing: matched.missing,
        failedRequirements,
        // A virtual-present match has no owned item; drop the null so consumers see real items only.
        items: matched.items.map(({ item }) => item).filter(Boolean)
      };
    }
  };
}

/**
 * Resolve required tools to owned `{ tool, item }` pairs against an actor. One named by the active
 * canvas Tool's `presentTools` matches as `{ tool, item: null, virtual: true }`: it satisfies
 * availability but is excluded from breakage and usage, there being no item to mutate. An owned,
 * non-broken item still takes precedence, and the per-system scope guard applies.
 */
export function matchGatheringTools({ actor, system, task, tools = [], craftingSystemManager, presentTools = null } = {}) {
  const matchedItems = [];
  const missing = [];
  const syntheticRecipe = syntheticToolRecipe({ system, task });
  const matcher = resolveToolMatcher(craftingSystemManager);
  const identityMatcher = resolveToolIdentityMatcher(craftingSystemManager);
  const items = normalizeFoundryCollection(actor?.items);
  const presentScope = { presentTools, systemId: system?.id ?? task?.craftingSystemId ?? null };
  const presentSet = resolvePresentComponentIds(presentScope);
  const presentToolSet = resolvePresentToolIds(presentScope);

  for (const tool of tools) {
    // Attempt validation: a broken tool counts as unavailable (missing).
    const available = items.filter(candidate => !isToolBroken(candidate));
    // Durable-identity selection (issue 557): PREFER an owned item matching by durable identity, the
    // only kind that may be consumed or destroyed, falling back to a presence-only match tagged
    // `breakable: false`. The shared runtime is matcher-agnostic, so this layer is its only source.
    const identityItem = available.find(candidate => identityMatcher(syntheticRecipe, tool, candidate)) || null;
    const item = identityItem || available.find(candidate => matcher(syntheticRecipe, tool, candidate)) || null;
    if (item) {
      matchedItems.push({ tool, item, breakable: identityItem != null });
    } else if (presentToolSet.has(tool?.id) || presentSet.has(tool?.componentId)) {
      // Virtual-present: satisfied by the active canvas Tool, no owned item.
      matchedItems.push({ tool, item: null, virtual: true });
    } else {
      missing.push(tool);
    }
  }

  return { items: matchedItems, missing };
}

/**
 * Classify each required tool's per-actor state as `present`, `damaged` ("Broken") or `missing`,
 * through the SAME matcher as `matchGatheringTools` so the UI cannot disagree with attempt
 * validation, the only difference being that a broken match becomes `damaged`.
 * WORKING-ITEM PRECEDENCE: `damaged` is reached only when nothing working matched, from either every
 * matched item carrying `flags.fabricate.toolBroken` or a held `replaceWith` replacement target —
 * the second recognition being DISPLAY-ONLY. Tolerant of a null actor.
 */
export function classifyGatheringToolStates({ actor, system, task, tools = [], craftingSystemManager, presentTools = null } = {}) {
  const syntheticRecipe = syntheticToolRecipe({ system, task });
  const matcher = resolveToolMatcher(craftingSystemManager);
  const items = normalizeFoundryCollection(actor?.items);
  const presentScope = { presentTools, systemId: system?.id ?? task?.craftingSystemId ?? null };
  const presentSet = resolvePresentComponentIds(presentScope);
  const presentToolSet = resolvePresentToolIds(presentScope);

  return tools.map(tool => {
    const matches = items.filter(candidate => matcher(syntheticRecipe, tool, candidate));
    let state = 'missing';
    if (matches.length > 0) {
      state = matches.some(candidate => !isToolBroken(candidate)) ? 'present' : 'damaged';
    } else if (presentToolSet.has(tool?.id) || presentSet.has(tool?.componentId)) {
      // Virtual-present: an active canvas Tool station satisfies this tool.
      state = 'present';
    }

    // A held `replaceWith` broken variant is a separate managed component carrying no toolBroken
    // flag, so probe for it only when nothing working matched and surface it as display-only.
    if (state === 'missing' && tool?.onBreak?.mode === 'replaceWith') {
      const target = tool.onBreak.replacementTarget || (
        typeof tool.onBreak.replacementComponentId === 'string'
          ? { type: 'component', componentId: tool.onBreak.replacementComponentId }
          : null
      );
      if (target?.type === 'component' && target.componentId?.trim()) {
        const replacementTool = { componentId: target.componentId.trim() };
        if (items.some(candidate => matcher(syntheticRecipe, replacementTool, candidate))) {
          state = 'damaged';
        }
      } else if (target?.type === 'item' && target.itemUuid?.trim()) {
        const itemUuid = target.itemUuid.trim();
        if (items.some((candidate) => getItemSourceReferences(candidate).includes(itemUuid))) {
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

/** The tool/item matcher: the manager's `toolMatchesItem`, then its `recipeManager`, then never-match. */
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

/**
 * The durable-identity matcher deciding which owned item may be CONSUMED or DESTROYED (issue 557),
 * mirroring `resolveToolMatcher` but binding `toolMatchesItemByIdentity`. FAIL-SAFE BY DESIGN: with
 * none resolvable it answers `() => false` and every candidate is SPARED, this being the shared
 * runtime's only signal.
 */
function resolveToolIdentityMatcher(craftingSystemManager) {
  if (typeof craftingSystemManager?.toolMatchesItemByIdentity === 'function') {
    return (recipe, tool, candidate) => craftingSystemManager.toolMatchesItemByIdentity(recipe, tool, candidate);
  }
  const recipeManager = craftingSystemManager?.recipeManager;
  if (typeof recipeManager?.toolMatchesItemByIdentity === 'function') {
    return (recipe, tool, candidate) => recipeManager.toolMatchesItemByIdentity(recipe, tool, candidate);
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
import { getItemSourceReferences } from './utils/sourceUuid.js';
import { resolveCharacterPrerequisiteLibrary } from './systems/characterLibraries.js';
import { evaluatePrerequisite } from './systems/characterPrerequisites.js';
import { evaluateToolPrerequisiteGate } from './systems/toolCheckBonus.js';
