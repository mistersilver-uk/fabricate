/**
 * Pure classification, rebinding, and resolution of the cross-references carried
 * by a Fabricate import payload. Foundry-free: the only side channel is an
 * INJECTED async `resolveUuid` used for external existence checks (the importer
 * passes a wrapper over `fromUuid`).
 *
 * References fall into two classes:
 *   - INTERNAL — resolvable within the payload (env→task/event id linkage, drop-row
 *     `componentId`, tool `componentId`, recipe `recipeItemId`, essence
 *     `sourceComponentId`). A broken internal reference is a data-integrity
 *     warning: kept verbatim and reported.
 *   - EXTERNAL — world documents that may be absent in the target world
 *     (environment `sceneUuid`, realm `sceneMappings[].sceneUuid` +
 *     `sceneRegionUuid`, drop-row `itemUuid`, macro UUIDs). Preserved verbatim,
 *     resolved via `resolveUuid` if possible, else reported — never nulled out.
 *
 * Each reported/handled reference becomes an entry:
 *   { kind, ownerType, ownerId, ownerName, referenceValue, disposition }
 * where disposition is one of:
 *   - `remapped`  — external ref resolved to a DIFFERENT value (updated in place)
 *   - `retained`  — external ref resolved unchanged (kept verbatim)
 *   - `reported`  — needs GM attention (external absent, or broken internal)
 */

/** Reference kinds (also used as localization suffixes in the report). */
export const REFERENCE_KINDS = Object.freeze({
  SOURCE_ITEM: 'sourceItem',
  SCENE: 'scene',
  SCENE_REGION: 'sceneRegion',
  MACRO: 'macro',
  DROP_ROW_ITEM: 'dropRowItem',
  TASK_LINK: 'taskLink',
  EVENT_LINK: 'eventLink',
  COMPONENT_LINK: 'componentLink',
  RECIPE_ITEM: 'recipeItem',
});

const LOCAL_ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

function localId() {
  // 16-char base36 id; Foundry-free stand-in for foundry.utils.randomID().
  // Draws from the platform CSPRNG (`crypto.getRandomValues`, available in Node
  // and the Foundry browser context) rather than a pseudorandom generator, so it
  // stays pure, unit-testable, and free of insecure-randomness findings.
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let id = '';
  for (const byte of bytes) {
    id += LOCAL_ID_ALPHABET[byte % LOCAL_ID_ALPHABET.length];
  }
  return id;
}

/**
 * Copy-mode: regenerate record-CONTAINER ids (realm ids, environment record ids)
 * and rewire their internal cross-references, while PRESERVING task / event /
 * characterModifier ids so environment→library linkages survive (D3). The
 * `craftingSystemId` and the `gatheringConfig` system key are rebound by the
 * importer once `createSystem` has produced the fresh system id.
 *
 * @param {{ system: object, recipes: object[], gatheringEnvironments: object[], gatheringConfig: object }} prepared
 * @param {{ generateId?: () => string }} [deps]
 * @returns {object} the same `prepared` reference, mutated
 */
export function rebindCopyContainerIds(prepared, { generateId = localId } = {}) {
  if (!prepared || typeof prepared !== 'object') return prepared;
  const { system, gatheringEnvironments } = prepared;

  // --- Realm ids ---
  const realmIdMap = new Map();
  const realms = Array.isArray(system?.gatheringRealms) ? system.gatheringRealms : [];
  for (const realm of realms) {
    if (realm && realm.id) {
      const nextId = generateId();
      realmIdMap.set(realm.id, nextId);
      realm.id = nextId;
    }
  }

  const remapRealmList = (ids) =>
    Array.isArray(ids) ? ids.map((id) => realmIdMap.get(id) ?? id) : ids;

  // --- Environment record ids + realm cross-refs ---
  const environments = Array.isArray(gatheringEnvironments) ? gatheringEnvironments : [];
  for (const env of environments) {
    if (!env || typeof env !== 'object') continue;
    if (env.id) env.id = generateId();
    if (Array.isArray(env.includedRealmIds))
      env.includedRealmIds = remapRealmList(env.includedRealmIds);
    if (Array.isArray(env.excludedRealmIds))
      env.excludedRealmIds = remapRealmList(env.excludedRealmIds);
  }

  return prepared;
}

/**
 * Copy-mode: regenerate every component id and atomically remap every
 * WITHIN-PAYLOAD reference to an old component id so nothing dangles (issue 570).
 *
 * This joins {@link rebindCopyContainerIds} in the copy transform once #561 made
 * Tools first-class: `componentId` no longer carries a cross-system Tool-reference
 * duty, so component ids MAY be regenerated on copy-import, closing #556's
 * copy-import id-collision residual (two systems copy-imported from the same origin
 * export no longer share a component id).
 *
 * The rewrite is KEY-AWARE: it only rewrites a value that (a) sits at one of the
 * enumerated component-reference sites AND (b) equals an old component id. A value
 * at a non-reference position (a `recipeIds[]` entry, an outcome/salvage-group id, a
 * scene/macro UUID) is never touched even if it coincidentally equals a component id.
 * The traversal mirrors `src/migration/migrateComponentId.js` (recurses ingredient
 * `alternatives`, sweeps the flat `ingredients`/`results` aliases, and treats
 * `catalysts[]` as component-ref-bearing at four sites).
 *
 * @param {{ system: object, recipes: object[], gatheringConfig: object }} prepared
 * @param {{ generateId?: () => string }} [deps]
 * @returns {object} the same `prepared` reference, mutated
 */
export function rebindCopyComponentIds(prepared, { generateId = localId } = {}) {
  if (!prepared || typeof prepared !== 'object') return prepared;
  const { system, recipes, gatheringConfig } = prepared;

  // --- Old → new component-id map (built over system.components[].id only) ---
  const idMap = new Map();
  const components = Array.isArray(system?.components) ? system.components : [];
  for (const component of components) {
    if (component && typeof component === 'object' && component.id) {
      idMap.set(component.id, generateId());
    }
  }
  if (idMap.size === 0) return prepared;

  // Rewrite the component ids themselves.
  for (const component of components) {
    if (component && typeof component === 'object' && component.id && idMap.has(component.id)) {
      component.id = idMap.get(component.id);
    }
  }

  const remap = (value) =>
    typeof value === 'string' && idMap.has(value) ? idMap.get(value) : value;

  // An ingredient/catalyst ref carries the component id via a `match` object OR the
  // bare `componentId`/`systemItemId` fields, and recurses through `alternatives`.
  const remapIngredientRef = (ref) => {
    if (!ref || typeof ref !== 'object') return;
    if (ref.match && typeof ref.match === 'object') {
      if ('componentId' in ref.match) ref.match.componentId = remap(ref.match.componentId);
      if ('systemItemId' in ref.match) ref.match.systemItemId = remap(ref.match.systemItemId);
    }
    if ('componentId' in ref) ref.componentId = remap(ref.componentId);
    if ('systemItemId' in ref) ref.systemItemId = remap(ref.systemItemId);
    for (const alt of arrayOf(ref.alternatives)) remapIngredientRef(alt);
  };

  const remapResultRef = (result) => {
    if (!result || typeof result !== 'object') return;
    if ('componentId' in result) result.componentId = remap(result.componentId);
    if ('systemItemId' in result) result.systemItemId = remap(result.systemItemId);
  };

  const remapResultGroups = (resultGroups) => {
    for (const group of arrayOf(resultGroups)) {
      for (const result of arrayOf(group?.results)) remapResultRef(result);
    }
  };

  const remapIngredientSet = (set) => {
    if (!set || typeof set !== 'object') return;
    for (const group of arrayOf(set.ingredientGroups)) {
      for (const option of arrayOf(group?.options)) remapIngredientRef(option);
    }
    // Flat `ingredients[]` alias (IngredientSet.toJSON re-emits it).
    for (const ingredient of arrayOf(set.ingredients)) remapIngredientRef(ingredient);
    // Legacy catalysts (defensive; site H).
    for (const catalyst of arrayOf(set.catalysts)) remapIngredientRef(catalyst);
  };

  // --- Recipes: top-level and per-step ingredient / result / catalyst refs ---
  for (const recipe of arrayOf(recipes)) {
    if (!recipe || typeof recipe !== 'object') continue;
    for (const set of arrayOf(recipe.ingredientSets)) remapIngredientSet(set);
    remapResultGroups(recipe.resultGroups);
    // Flat `results[]` alias (Recipe.toJSON re-emits it).
    for (const result of arrayOf(recipe.results)) remapResultRef(result);
    for (const catalyst of arrayOf(recipe.catalysts)) remapIngredientRef(catalyst);
    for (const step of arrayOf(recipe.steps)) {
      if (!step || typeof step !== 'object') continue;
      for (const set of arrayOf(step.ingredientSets)) remapIngredientSet(set);
      remapResultGroups(step.resultGroups);
      for (const catalyst of arrayOf(step.catalysts)) remapIngredientRef(catalyst);
    }
  }

  // --- Component salvage result refs + legacy salvage catalysts (sites F, H) ---
  for (const component of components) {
    const salvage = component?.salvage;
    if (salvage && typeof salvage === 'object') {
      remapResultGroups(salvage.resultGroups);
      for (const catalyst of arrayOf(salvage.catalysts)) remapIngredientRef(catalyst);
    }
  }

  // --- Essence source component (site E; canonical + legacy alias) ---
  for (const def of arrayOf(system?.essenceDefinitions)) {
    if (!def || typeof def !== 'object') continue;
    if ('sourceComponentId' in def) def.sourceComponentId = remap(def.sourceComponentId);
    if ('associatedSystemItemId' in def)
      def.associatedSystemItemId = remap(def.associatedSystemItemId);
  }

  // --- Tool `componentId` + `onBreak.replacementComponentId` (sites C, D) ---
  const remapTool = (tool) => {
    if (!tool || typeof tool !== 'object') return;
    if ('componentId' in tool) tool.componentId = remap(tool.componentId);
    if (
      tool.onBreak &&
      typeof tool.onBreak === 'object' &&
      'replacementComponentId' in tool.onBreak
    ) {
      tool.onBreak.replacementComponentId = remap(tool.onBreak.replacementComponentId);
    }
  };
  for (const tool of arrayOf(system?.tools)) remapTool(tool);

  const slice = systemSlice(gatheringConfig);
  for (const tool of arrayOf(slice.tools)) remapTool(tool);

  // --- Gathering task/event drop-row component refs (site G) ---
  for (const record of [...arrayOf(slice.tasks), ...arrayOf(slice.events)]) {
    for (const row of arrayOf(record?.dropRows)) {
      if (!row || typeof row !== 'object') continue;
      if ('componentId' in row) row.componentId = remap(row.componentId);
      if ('systemItemId' in row) row.systemItemId = remap(row.systemItemId);
    }
  }

  return prepared;
}

/**
 * Copy-mode: regenerate every recipe id and atomically remap every within-payload
 * recipe-book membership reference (`recipeItemDefinitions[].recipeIds` entries) to
 * the regenerated id (issue #701). Without this, copy-mode strips recipe ids (the
 * downstream `Recipe` constructor mints fresh ones) but the book membership arrays
 * still point at the pre-import ids, so every book in the copy renders empty and a
 * faithful copy import reports every membership entry as a broken `RECIPE_ITEM`
 * reference.
 *
 * The rewrite is KEY-AWARE and class-scoped: only `recipeIds[]` membership
 * positions are rewritten. A membership entry naming a recipe id ABSENT from the
 * payload (genuinely broken in the source) is preserved verbatim so it still
 * resolves-and-reports downstream. Mirrors {@link rebindCopyComponentIds}; the
 * component-id remap still must not touch `recipeIds[]` (the protection is per id
 * class, not absolute).
 *
 * @param {{ system: object, recipes: object[] }} prepared
 * @param {{ generateId?: () => string }} [deps]
 * @returns {object} the same `prepared` reference, mutated
 */
export function rebindCopyRecipeIds(prepared, { generateId = localId } = {}) {
  if (!prepared || typeof prepared !== 'object') return prepared;
  const { system, recipes } = prepared;

  // --- Old → new recipe-id map (built over recipes[].id only) ---
  const idMap = new Map();
  for (const recipe of arrayOf(recipes)) {
    if (recipe && typeof recipe === 'object' && recipe.id) {
      idMap.set(recipe.id, generateId());
    }
  }
  if (idMap.size === 0) return prepared;

  // Rewrite the recipe ids themselves.
  for (const recipe of arrayOf(recipes)) {
    if (recipe && typeof recipe === 'object' && recipe.id && idMap.has(recipe.id)) {
      recipe.id = idMap.get(recipe.id);
    }
  }

  // Remap book membership; a membership id absent from the map is left verbatim.
  for (const def of arrayOf(system?.recipeItemDefinitions)) {
    if (def && Array.isArray(def.recipeIds)) {
      def.recipeIds = def.recipeIds.map((rid) => idMap.get(rid) ?? rid);
    }
  }

  return prepared;
}

/**
 * Resolve and classify every reference in the payload. Returns a deep clone with
 * remapped external values applied, plus the structured `unresolvedReferences[]`
 * collection.
 *
 * @param {{ system?: object, recipes?: object[], gatheringEnvironments?: object[], gatheringConfig?: object }} payload
 * @param {{ resolveUuid?: (uuid: string) => Promise<null | { uuid: string }> }} [deps]
 * @returns {Promise<{ resolved: object, unresolvedReferences: object[] }>}
 */
export async function resolveImportReferences(payload, { resolveUuid = null } = {}) {
  const resolved = structuredClone(payload || {});
  const unresolvedReferences = [];

  // Internal (broken-reference) integrity checks are synchronous.
  collectBrokenInternalReferences(resolved, unresolvedReferences);

  // External existence checks require an injected resolver; without one we keep
  // everything verbatim and skip reporting (the caller decides).
  if (typeof resolveUuid === 'function') {
    const descriptors = collectExternalDescriptors(resolved);
    for (const descriptor of descriptors) {
      const value = descriptor.referenceValue;
      if (!value) continue;
      let outcome;
      try {
        outcome = await resolveUuid(value);
      } catch {
        // A malformed UUID throws; treat as absent (reported).
        outcome = null;
      }
      if (!outcome) {
        unresolvedReferences.push(entry(descriptor, 'reported'));
      } else if (outcome.uuid && outcome.uuid !== value) {
        descriptor.set(outcome.uuid);
        unresolvedReferences.push({ ...entry(descriptor, 'remapped'), newValue: outcome.uuid });
      } else {
        unresolvedReferences.push(entry(descriptor, 'retained'));
      }
    }
  }

  return { resolved, unresolvedReferences };
}

function entry(descriptor, disposition) {
  return {
    kind: descriptor.kind,
    ownerType: descriptor.ownerType,
    ownerId: descriptor.ownerId ?? null,
    ownerName: descriptor.ownerName ?? '',
    referenceValue: descriptor.referenceValue,
    disposition,
  };
}

/**
 * @param {object} payload
 * @returns {Array<{ kind, ownerType, ownerId, ownerName, referenceValue, set: (v: string) => void }>}
 */
function collectExternalDescriptors(payload) {
  const descriptors = [];
  const system = payload.system || {};

  // Environment scene gate.
  for (const env of arrayOf(payload.gatheringEnvironments)) {
    if (env?.sceneUuid) {
      descriptors.push({
        kind: REFERENCE_KINDS.SCENE,
        ownerType: 'environment',
        ownerId: env.id ?? null,
        ownerName: env.name ?? '',
        referenceValue: env.sceneUuid,
        set: (v) => {
          env.sceneUuid = v;
        },
      });
    }
  }

  // Realm scene mappings (scene + scene-region).
  for (const realm of arrayOf(system.gatheringRealms)) {
    for (const mapping of arrayOf(realm?.sceneMappings)) {
      if (mapping?.sceneUuid) {
        descriptors.push({
          kind: REFERENCE_KINDS.SCENE,
          ownerType: 'realm',
          ownerId: realm.id ?? null,
          ownerName: realm.name ?? '',
          referenceValue: mapping.sceneUuid,
          set: (v) => {
            mapping.sceneUuid = v;
          },
        });
      }
      if (mapping?.sceneRegionUuid) {
        descriptors.push({
          kind: REFERENCE_KINDS.SCENE_REGION,
          ownerType: 'realm',
          ownerId: realm.id ?? null,
          ownerName: realm.name ?? '',
          referenceValue: mapping.sceneRegionUuid,
          set: (v) => {
            mapping.sceneRegionUuid = v;
          },
        });
      }
    }
  }

  // Drop-row item UUIDs across reusable tasks and events.
  const slice = systemSlice(payload.gatheringConfig);
  for (const record of [...arrayOf(slice.tasks), ...arrayOf(slice.events)]) {
    for (const row of arrayOf(record?.dropRows)) {
      if (row?.itemUuid) {
        descriptors.push({
          kind: REFERENCE_KINDS.DROP_ROW_ITEM,
          ownerType: 'dropRow',
          ownerId: record.id ?? null,
          ownerName: record.name ?? '',
          referenceValue: row.itemUuid,
          set: (v) => {
            row.itemUuid = v;
          },
        });
      }
    }
  }

  // Macro UUIDs anywhere on the surviving config/recipes.
  collectMacroDescriptors(payload.recipes, 'recipe', descriptors);
  collectMacroDescriptors(slice.tasks, 'task', descriptors);
  collectMacroDescriptors(slice.events, 'event', descriptors);

  return descriptors;
}

function collectMacroDescriptors(records, ownerType, descriptors) {
  for (const record of arrayOf(records)) {
    if (
      record &&
      typeof record === 'object' &&
      typeof record.macroUuid === 'string' &&
      record.macroUuid
    ) {
      descriptors.push({
        kind: REFERENCE_KINDS.MACRO,
        ownerType,
        ownerId: record.id ?? null,
        ownerName: record.name ?? '',
        referenceValue: record.macroUuid,
        set: (v) => {
          record.macroUuid = v;
        },
      });
    }
  }
}

/**
 * Report internal references that resolve to nothing within the payload.
 * @param {object} payload
 * @param {object[]} out
 */
function collectBrokenInternalReferences(payload, out) {
  const system = payload.system || {};
  const componentIds = idSet(system.components);
  const recipeItemIds = idSet(system.recipeItemDefinitions);
  const slice = systemSlice(payload.gatheringConfig);
  const taskIds = idSet(slice.tasks);
  const eventIds = idSet(slice.events);

  const push = (kind, ownerType, owner, referenceValue) => {
    out.push({
      kind,
      ownerType,
      ownerId: owner?.id ?? null,
      ownerName: owner?.name ?? '',
      referenceValue,
      disposition: 'reported',
    });
  };

  // Environment → task / event id linkage.
  for (const env of arrayOf(payload.gatheringEnvironments)) {
    if (!env || typeof env !== 'object') continue;
    for (const id of taskLinkIds(env)) {
      if (!taskIds.has(id)) push(REFERENCE_KINDS.TASK_LINK, 'environment', env, id);
    }
    for (const id of eventLinkIds(env)) {
      if (!eventIds.has(id)) push(REFERENCE_KINDS.EVENT_LINK, 'environment', env, id);
    }
  }

  // Drop-row componentId (only when no itemUuid) + tool componentId.
  for (const record of [...arrayOf(slice.tasks), ...arrayOf(slice.events)]) {
    for (const row of arrayOf(record?.dropRows)) {
      if (row?.componentId && !row?.itemUuid && !componentIds.has(row.componentId)) {
        push(REFERENCE_KINDS.COMPONENT_LINK, 'dropRow', record, row.componentId);
      }
    }
  }

  // Tool componentId + onBreak.replacementComponentId, across BOTH the crafting-system
  // tools (`system.tools`) and the gathering-library tools (`gatheringConfig.system.tools`)
  // — issue 570 D2 (the collector previously walked only the gathering slice's tools).
  const reportToolComponentRefs = (tool) => {
    if (!tool || typeof tool !== 'object') return;
    if (tool.componentId && !componentIds.has(tool.componentId)) {
      push(REFERENCE_KINDS.COMPONENT_LINK, 'tool', tool, tool.componentId);
    }
    const replacementComponentId = tool.onBreak?.replacementComponentId;
    if (replacementComponentId && !componentIds.has(replacementComponentId)) {
      push(REFERENCE_KINDS.COMPONENT_LINK, 'tool', tool, replacementComponentId);
    }
  };
  for (const tool of arrayOf(system.tools)) reportToolComponentRefs(tool);
  for (const tool of arrayOf(slice.tools)) reportToolComponentRefs(tool);

  // Recipe ingredient-option / result / catalyst component refs (issue 570 D2),
  // including the recursive `alternatives[]` and the flat `ingredients`/`results`
  // aliases, at both top level and per step.
  const reportIngredientRef = (ref, owner) => {
    if (!ref || typeof ref !== 'object') return;
    const componentId =
      (ref.match && typeof ref.match === 'object'
        ? ref.match.componentId || ref.match.systemItemId
        : null) ||
      ref.componentId ||
      ref.systemItemId ||
      null;
    if (componentId && !componentIds.has(componentId)) {
      push(REFERENCE_KINDS.COMPONENT_LINK, 'recipe', owner, componentId);
    }
    for (const alt of arrayOf(ref.alternatives)) reportIngredientRef(alt, owner);
  };
  const reportResultRef = (result, owner) => {
    const componentId = result?.componentId || result?.systemItemId || null;
    if (componentId && !componentIds.has(componentId)) {
      push(REFERENCE_KINDS.COMPONENT_LINK, 'recipe', owner, componentId);
    }
  };
  const reportResultGroups = (resultGroups, owner) => {
    for (const group of arrayOf(resultGroups)) {
      for (const result of arrayOf(group?.results)) reportResultRef(result, owner);
    }
  };
  const reportIngredientSet = (set, owner) => {
    if (!set || typeof set !== 'object') return;
    for (const group of arrayOf(set.ingredientGroups)) {
      for (const option of arrayOf(group?.options)) reportIngredientRef(option, owner);
    }
    for (const ingredient of arrayOf(set.ingredients)) reportIngredientRef(ingredient, owner);
    for (const catalyst of arrayOf(set.catalysts)) reportIngredientRef(catalyst, owner);
  };
  for (const recipe of arrayOf(payload.recipes)) {
    if (!recipe || typeof recipe !== 'object') continue;
    for (const set of arrayOf(recipe.ingredientSets)) reportIngredientSet(set, recipe);
    reportResultGroups(recipe.resultGroups, recipe);
    for (const result of arrayOf(recipe.results)) reportResultRef(result, recipe);
    for (const catalyst of arrayOf(recipe.catalysts)) reportIngredientRef(catalyst, recipe);
    for (const step of arrayOf(recipe.steps)) {
      if (!step || typeof step !== 'object') continue;
      for (const set of arrayOf(step.ingredientSets)) reportIngredientSet(set, recipe);
      reportResultGroups(step.resultGroups, recipe);
      for (const catalyst of arrayOf(step.catalysts)) reportIngredientRef(catalyst, recipe);
    }
  }

  // Component salvage result refs + legacy salvage catalysts (issue 570 D2).
  for (const component of arrayOf(system.components)) {
    const salvage = component?.salvage;
    if (!salvage || typeof salvage !== 'object') continue;
    reportResultGroups(salvage.resultGroups, component);
    for (const catalyst of arrayOf(salvage.catalysts)) reportIngredientRef(catalyst, component);
  }

  // Essence sourceComponentId → components (fall back to the legacy
  // associatedSystemItemId alias).
  for (const def of arrayOf(system.essenceDefinitions)) {
    const sourceComponentId = def?.sourceComponentId ?? def?.associatedSystemItemId;
    if (sourceComponentId && !componentIds.has(sourceComponentId)) {
      push(REFERENCE_KINDS.COMPONENT_LINK, 'essence', def, sourceComponentId);
    }
  }

  // Recipe recipeItemId → recipeItemDefinitions (legacy reverse ref; absent once a
  // world is migrated to book-side membership).
  for (const recipe of arrayOf(payload.recipes)) {
    if (recipe?.recipeItemId && !recipeItemIds.has(recipe.recipeItemId)) {
      push(REFERENCE_KINDS.RECIPE_ITEM, 'recipe', recipe, recipe.recipeItemId);
    }
  }

  // Book membership: each definition's recipeIds → recipes (issue 511 many-to-many).
  const recipeIds = idSet(payload.recipes);
  for (const def of arrayOf(system.recipeItemDefinitions)) {
    for (const rid of arrayOf(def?.recipeIds)) {
      if (rid && !recipeIds.has(rid)) {
        push(REFERENCE_KINDS.RECIPE_ITEM, 'recipeItem', def, rid);
      }
    }
  }
}

function taskLinkIds(env) {
  const ids = new Set();
  for (const key of ['enabledTaskIds', 'disabledTaskIds', 'forcedTaskIds', 'taskOrder']) {
    for (const id of arrayOf(env[key])) ids.add(id);
  }
  for (const id of Object.keys(env.taskDropRateAdjustments || {})) ids.add(id);
  return ids;
}

function eventLinkIds(env) {
  const ids = new Set();
  for (const key of ['enabledEventIds', 'disabledEventIds', 'forcedEventIds', 'eventOrder']) {
    for (const id of arrayOf(env[key])) ids.add(id);
  }
  for (const id of Object.keys(env.eventDropRateAdjustments || {})) ids.add(id);
  return ids;
}

function systemSlice(gatheringConfig) {
  if (!gatheringConfig || typeof gatheringConfig !== 'object') return {};
  // Export shape: { system: <slice>, shared: {...} }.
  if (gatheringConfig.system && typeof gatheringConfig.system === 'object') {
    return gatheringConfig.system;
  }
  return {};
}

function idSet(records) {
  const set = new Set();
  for (const record of arrayOf(records)) {
    if (record?.id) set.add(record.id);
  }
  return set;
}

function arrayOf(value) {
  return Array.isArray(value) ? value : [];
}
