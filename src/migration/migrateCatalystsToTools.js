/**
 * `0.6.0`: every catalyst becomes a deduped library Tool referenced by `toolIds`; spec § Catalyst
 * → Tool Migration. The dedupe key is the normalized Tool JSON, so different catalysts on one
 * componentId stay separate, and every Tool's `requirement` is `null`.
 */

import { forEachSystem } from './migrationHelpers.js';

/** The dedupe key and Tool body; null without a componentId. */
function catalystToToolShape(catalyst) {
  if (!catalyst || typeof catalyst !== 'object') return null;
  const componentId = catalyst.componentId || catalyst.systemItemId || null;
  if (!componentId) return null;

  const degradesOnUse = catalyst.degradesOnUse === true;

  if (!degradesOnUse) {
    // Presence-only: `breakageChance: 0` makes `Tool.applyUsage` write no usage flag.
    return {
      componentId,
      requirement: null,
      breakage: { mode: 'breakageChance', breakageChance: 0 },
      onBreak: { mode: 'flagBroken' },
    };
  }

  const rawMaxUses = catalyst.maxUses;
  const maxUses =
    Number.isFinite(Number(rawMaxUses)) && rawMaxUses !== null ? Number(rawMaxUses) : null;
  const destroyWhenExhausted = catalyst.destroyWhenExhausted === true;

  return {
    componentId,
    requirement: null,
    breakage: { mode: 'limitedUses', maxUses },
    onBreak: { mode: destroyWhenExhausted ? 'destroy' : 'flagBroken' },
  };
}

/** The stable dedupe key: componentId plus normalized breakage and onBreak. */
function toolDedupeKey(toolShape) {
  return JSON.stringify({
    componentId: toolShape.componentId,
    breakage: toolShape.breakage,
    onBreak: toolShape.onBreak,
  });
}

/** An existing tool is reused only with no gating and a catalyst's breakage shape. */
function existingToolDedupeKey(tool) {
  if (!tool || typeof tool !== 'object') return null;
  if (!tool.componentId) return null;
  if (tool.requirement) return null;

  const breakage = tool.breakage;
  const onBreak = tool.onBreak;
  if (!breakage || typeof breakage !== 'object' || !onBreak || typeof onBreak !== 'object') {
    return null;
  }

  let normalizedBreakage;
  if (breakage.mode === 'breakageChance') {
    normalizedBreakage = {
      mode: 'breakageChance',
      breakageChance: Number(breakage.breakageChance) || 0,
    };
  } else if (breakage.mode === 'limitedUses') {
    const maxUses =
      Number.isFinite(Number(breakage.maxUses)) && breakage.maxUses !== null
        ? Number(breakage.maxUses)
        : null;
    normalizedBreakage = { mode: 'limitedUses', maxUses };
  } else {
    return null;
  }

  let normalizedOnBreak;
  if (onBreak.mode === 'flagBroken' || onBreak.mode === 'destroy') {
    normalizedOnBreak = { mode: onBreak.mode };
  } else {
    return null;
  }

  return toolDedupeKey({
    componentId: tool.componentId,
    breakage: normalizedBreakage,
    onBreak: normalizedOnBreak,
  });
}

/** Deterministic, so a re-run mints identical ids: FNV-1a 32-bit as 8 hex chars. */
function generateToolId(systemId, dedupeKey) {
  const input = `${systemId}\0${dedupeKey}`;
  let hash = 0x81_1c_9d_c5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.codePointAt(i);
    // 32-bit FNV prime multiply via shifts to stay in integer range.
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return `tool-cat-${hash.toString(16).padStart(8, '0')}`;
}

/** Reuses an equivalent tool or adds one; ensures `system.tools`. */
function makeSystemToolRegistry(system) {
  if (!Array.isArray(system.tools)) {
    system.tools = [];
  }
  const tools = system.tools;
  const keyToId = new Map();

  for (const tool of tools) {
    const key = existingToolDedupeKey(tool);
    if (key && tool.id && !keyToId.has(key)) {
      keyToId.set(key, tool.id);
    }
  }

  return {
    resolve(catalyst) {
      const shape = catalystToToolShape(catalyst);
      if (!shape) return null;
      const key = toolDedupeKey(shape);
      const existing = keyToId.get(key);
      if (existing) return existing;

      const id = generateToolId(system.id || '', key);
      keyToId.set(key, id);
      tools.push({
        id,
        label: '',
        enabled: true,
        componentId: shape.componentId,
        requirement: shape.requirement,
        breakage: shape.breakage,
        onBreak: shape.onBreak,
      });
      return id;
    },
  };
}

/** Answers the count; a container with no catalyst array is untouched. */
function convertCatalystArray(container, registry, counter) {
  if (!container || typeof container !== 'object') return;
  if (!Array.isArray(container.catalysts)) return;

  const existingToolIds = Array.isArray(container.toolIds) ? container.toolIds : [];
  const toolIds = [...existingToolIds];
  const seen = new Set(toolIds.map(String));

  for (const catalyst of container.catalysts) {
    const id = registry.resolve(catalyst);
    if (!id) continue;
    counter.count += 1;
    if (!seen.has(id)) {
      seen.add(id);
      toolIds.push(id);
    }
  }

  container.toolIds = toolIds;
  delete container.catalysts;
}

/** A recipe whose system is missing is skipped, not thrown. */
export function migrateCatalystsToTools(recipes, systems) {
  const safeRecipes = Array.isArray(recipes) ? recipes : [];
  const safeSystems = Array.isArray(systems) ? systems : [];
  const counter = { count: 0 };

  const systemById = new Map();
  const registryById = new Map();
  forEachSystem(safeSystems, (system) => {
    if (system.id) systemById.set(system.id, system);
  });

  function registryFor(systemId) {
    if (registryById.has(systemId)) return registryById.get(systemId);
    const system = systemById.get(systemId);
    if (!system) return null;
    const registry = makeSystemToolRegistry(system);
    registryById.set(systemId, registry);
    return registry;
  }

  // 1. Recipe / step / ingredient-set catalysts → tools in the recipe's crafting system.
  for (const recipe of safeRecipes) {
    if (!recipe || typeof recipe !== 'object') continue;
    const systemId = recipe.craftingSystemId;
    const registry = systemId ? registryFor(systemId) : null;
    if (!registry) {
      if (systemId && Array.isArray(recipe.catalysts) && recipe.catalysts.length > 0) {
        console.warn(
          `Fabricate | migrateCatalystsToTools: recipe "${recipe.id ?? '?'}" references missing ` +
            `crafting system "${systemId}"; skipping catalyst migration for it.`
        );
      }
      continue;
    }

    convertCatalystArray(recipe, registry, counter);

    if (Array.isArray(recipe.steps)) {
      for (const step of recipe.steps) {
        convertCatalystArray(step, registry, counter);
        if (step && Array.isArray(step.ingredientSets)) {
          for (const set of step.ingredientSets) {
            convertCatalystArray(set, registry, counter);
          }
        }
      }
    }

    if (Array.isArray(recipe.ingredientSets)) {
      for (const set of recipe.ingredientSets) {
        convertCatalystArray(set, registry, counter);
      }
    }
  }

  // 2. Component salvage catalysts → tools in the owning system.
  forEachSystem(safeSystems, (system) => {
    if (!system.id) return;
    const components = Array.isArray(system.components)
      ? system.components
      : Array.isArray(system.managedItems)
        ? system.managedItems
        : null;
    if (!Array.isArray(components)) return;

    let registry = null;
    for (const component of components) {
      if (!component || typeof component !== 'object') continue;
      const salvage = component.salvage;
      if (!salvage || typeof salvage !== 'object' || !Array.isArray(salvage.catalysts)) continue;
      if (!registry) registry = registryFor(system.id);
      if (!registry) break;
      convertCatalystArray(salvage, registry, counter);
    }
  });

  return { recipes: safeRecipes, systems: safeSystems, migratedCount: counter.count };
}
