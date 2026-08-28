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

import {
  keyedRemapper,
  rewriteGatheringSliceReferences,
  rewriteRecipeReferences,
  rewriteSystemReferences,
} from '../migration/worldScopeReferenceRewrite.js';

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
 * Copy-mode: regenerate record-CONTAINER ids (environment record ids) while PRESERVING
 * task / event / characterModifier ids so environment→library linkages survive (D3). The
 * `craftingSystemId` and the `gatheringConfig` system key are rebound by the importer once
 * `createSystem` has produced the fresh system id.
 *
 * REALM IDS ARE NO LONGER PART OF WHAT A COPY REBINDS (issue 1282). They were, while realms
 * belonged to the crafting system and a copy of that system therefore needed its own copies of
 * its places. Realms are WORLD scope now: they ride the envelope rather than the system, and
 * `CompendiumImporter._persistTravelConfig` merges them by id with the destination winning a
 * collision. Rebinding them here would defeat that merge outright — every realm in the pack
 * would arrive under an id the world has never seen, so a copy-import would DUPLICATE the
 * world's entire geography instead of recognising it, and the copy's environments would gate on
 * the duplicates while every other system kept gating on the originals.
 *
 * That is also why `includedRealmIds` / `excludedRealmIds` are left exactly as authored: the
 * ids they cite are the world's, and they still name the same places after the copy.
 *
 * @param {{ system: object, recipes: object[], gatheringEnvironments: object[], gatheringConfig: object }} prepared
 * @param {{ generateId?: () => string }} [deps]
 * @returns {object} the same `prepared` reference, mutated
 */
export function rebindCopyContainerIds(prepared, { generateId = localId } = {}) {
  if (!prepared || typeof prepared !== 'object') return prepared;
  const { gatheringEnvironments } = prepared;

  // --- Environment record ids ---
  const environments = Array.isArray(gatheringEnvironments) ? gatheringEnvironments : [];
  for (const env of environments) {
    if (!env || typeof env !== 'object') continue;
    if (env.id) env.id = generateId();
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
 * THE TRAVERSAL ITSELF IS NOT HERE. Every reference site lives in the ONE shared walk
 * `src/migration/worldScopeReferenceRewrite.js`, which this function and the `1.30.0`
 * world-scope migration both drive (issue 1363). It was extracted because the two had
 * already drifted: the copy-mode copy had accumulated three gaps — `onBreak.replacementTarget
 * .componentId`, essence `sourceItemUuid` and `tool.repairRequirements[].options[]` — each of
 * which left a dangling reference in an imported copy. This function keeps only what is
 * copy-mode-specific: minting the new ids and rewriting the component ids themselves.
 *
 * The rewrite is KEY-AWARE: it only rewrites a value that (a) sits at one of the
 * enumerated component-reference sites AND (b) equals an old component id. A value
 * at a non-reference position (a `recipeIds[]` entry, an outcome/salvage-group id, a
 * scene/macro UUID) is never touched even if it coincidentally equals a component id.
 *
 * TOOL IDS ARE NOT RE-KEYED BY COPY MODE, so the shared walk's tool-id sites are driven with
 * an identity remapper and are provably inert here.
 *
 * @param {{ system: object, recipes: object[], gatheringConfig: object }} prepared
 * @param {{ generateId?: () => string }} [deps]
 * @returns {object} the same `prepared` reference, mutated
 */
export function rebindCopyComponentIds(prepared, { generateId = localId } = {}) {
  if (!prepared || typeof prepared !== 'object') return prepared;
  const { system, recipes, gatheringConfig } = prepared;

  // --- Old -> new component-id map (built over system.components[].id only) ---
  const idMap = {};
  const components = Array.isArray(system?.components) ? system.components : [];
  for (const component of components) {
    if (component && typeof component === 'object' && component.id) {
      idMap[component.id] = generateId();
    }
  }
  if (Object.keys(idMap).length === 0) return prepared;

  // Rewrite the component ids themselves.
  for (const component of components) {
    if (component && typeof component === 'object' && component.id && idMap[component.id]) {
      component.id = idMap[component.id];
    }
  }

  const remappers = { remapComponent: keyedRemapper(idMap), remapTool: (value) => value };
  for (const recipe of arrayOf(recipes)) rewriteRecipeReferences(recipe, remappers);
  rewriteSystemReferences(system, remappers);
  rewriteGatheringSliceReferences(systemSlice(gatheringConfig), remappers);

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
 * @param {{ system?: object, recipes?: object[], gatheringEnvironments?: object[], gatheringConfig?: object, travelConfig?: object }} payload
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

  // Realm scene mappings (scene + scene-region). Realms ride the ENVELOPE since issue 1282,
  // so they are read from the world travel config rather than off the system.
  for (const realm of arrayOf(payload.travelConfig?.realms)) {
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
  // Essence property macros (issue 1036) live on a DIFFERENTLY NAMED field, so the
  // collector takes the field name rather than being forked. The import report already
  // carries the `essence` owner type (it is used for `componentLink`), so no new
  // owner-type label is needed.
  collectMacroDescriptors(system.essenceDefinitions, 'essence', descriptors, 'propertyMacroUuid');
  collectComplicationMacroDescriptors(system.components, descriptors);

  return descriptors;
}

/**
 * Component complication macros (issue 1286). `collectMacroDescriptors` reads
 * `record[field]` ONE level deep and so cannot reach a nested list; this walk is dedicated
 * rather than a flattened call for a REPORTING reason as much as a structural one. A
 * flattened call would take `ownerId`/`ownerName` from the complication, so the import
 * report would name the complication — which the GM cannot open — instead of the component
 * that carries it. `ownerType: 'component'` already has a localized label, so no new one is
 * needed.
 *
 * Unregistered, the uuid is never remapped and the complication runs the WRONG macro in the
 * importing world.
 *
 * @param {unknown} components
 * @param {object[]} descriptors
 */
function collectComplicationMacroDescriptors(components, descriptors) {
  for (const component of arrayOf(components)) {
    for (const complication of arrayOf(component?.complications)) {
      if (typeof complication?.macroUuid !== 'string' || !complication.macroUuid) continue;
      descriptors.push({
        kind: REFERENCE_KINDS.MACRO,
        ownerType: 'component',
        ownerId: component.id ?? null,
        ownerName: component.name ?? '',
        referenceValue: complication.macroUuid,
        set: (v) => {
          complication.macroUuid = v;
        },
      });
    }
  }
}

function collectMacroDescriptors(records, ownerType, descriptors, field = 'macroUuid') {
  for (const record of arrayOf(records)) {
    if (
      record &&
      typeof record === 'object' &&
      typeof record[field] === 'string' &&
      record[field]
    ) {
      descriptors.push({
        kind: REFERENCE_KINDS.MACRO,
        ownerType,
        ownerId: record.id ?? null,
        ownerName: record.name ?? '',
        referenceValue: record[field],
        set: (v) => {
          record[field] = v;
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
  // `ownerType` travels with the owner because these walkers are shared by TWO owner
  // classes: a recipe's ingredient/result/catalyst refs, and a COMPONENT's salvage
  // result/catalyst refs. Hard-coding 'recipe' here (as it was before issue 877) made
  // the report label a salvage row "Recipe: Iron Ore" for a component owner, and left
  // the `OwnerType.component` label unreachable from this collector.
  const reportIngredientRef = (ref, owner, ownerType) => {
    if (!ref || typeof ref !== 'object') return;
    const componentId =
      (ref.match && typeof ref.match === 'object'
        ? ref.match.componentId || ref.match.systemItemId
        : null) ||
      ref.componentId ||
      ref.systemItemId ||
      null;
    if (componentId && !componentIds.has(componentId)) {
      push(REFERENCE_KINDS.COMPONENT_LINK, ownerType, owner, componentId);
    }
    for (const alt of arrayOf(ref.alternatives)) reportIngredientRef(alt, owner, ownerType);
  };
  const reportResultRef = (result, owner, ownerType) => {
    const componentId = result?.componentId || result?.systemItemId || null;
    if (componentId && !componentIds.has(componentId)) {
      push(REFERENCE_KINDS.COMPONENT_LINK, ownerType, owner, componentId);
    }
  };
  const reportResultGroups = (resultGroups, owner, ownerType) => {
    for (const group of arrayOf(resultGroups)) {
      for (const result of arrayOf(group?.results)) reportResultRef(result, owner, ownerType);
    }
  };
  const reportIngredientSet = (set, owner, ownerType) => {
    if (!set || typeof set !== 'object') return;
    for (const group of arrayOf(set.ingredientGroups)) {
      for (const option of arrayOf(group?.options)) reportIngredientRef(option, owner, ownerType);
    }
    for (const ingredient of arrayOf(set.ingredients))
      reportIngredientRef(ingredient, owner, ownerType);
    for (const catalyst of arrayOf(set.catalysts)) reportIngredientRef(catalyst, owner, ownerType);
  };
  for (const recipe of arrayOf(payload.recipes)) {
    if (!recipe || typeof recipe !== 'object') continue;
    for (const set of arrayOf(recipe.ingredientSets)) reportIngredientSet(set, recipe, 'recipe');
    reportResultGroups(recipe.resultGroups, recipe, 'recipe');
    for (const result of arrayOf(recipe.results)) reportResultRef(result, recipe, 'recipe');
    for (const catalyst of arrayOf(recipe.catalysts))
      reportIngredientRef(catalyst, recipe, 'recipe');
    for (const step of arrayOf(recipe.steps)) {
      if (!step || typeof step !== 'object') continue;
      for (const set of arrayOf(step.ingredientSets)) reportIngredientSet(set, recipe, 'recipe');
      reportResultGroups(step.resultGroups, recipe, 'recipe');
      for (const catalyst of arrayOf(step.catalysts))
        reportIngredientRef(catalyst, recipe, 'recipe');
    }
  }

  // Component salvage result refs + legacy salvage catalysts (issue 570 D2). The owner
  // here is a COMPONENT, so the report says "Component: <name>" (issue 877).
  for (const component of arrayOf(system.components)) {
    const salvage = component?.salvage;
    if (!salvage || typeof salvage !== 'object') continue;
    reportResultGroups(salvage.resultGroups, component, 'component');
    for (const catalyst of arrayOf(salvage.catalysts))
      reportIngredientRef(catalyst, component, 'component');
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
