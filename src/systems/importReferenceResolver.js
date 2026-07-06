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
  for (const tool of arrayOf(slice.tools)) {
    if (tool?.componentId && !componentIds.has(tool.componentId)) {
      push(REFERENCE_KINDS.COMPONENT_LINK, 'tool', tool, tool.componentId);
    }
  }

  // Essence sourceComponentId → components (fall back to the legacy
  // associatedSystemItemId alias).
  for (const def of arrayOf(system.essenceDefinitions)) {
    const sourceComponentId = def?.sourceComponentId ?? def?.associatedSystemItemId;
    if (sourceComponentId && !componentIds.has(sourceComponentId)) {
      push(REFERENCE_KINDS.COMPONENT_LINK, 'essence', def, sourceComponentId);
    }
  }

  // Recipe recipeItemId → recipeItemDefinitions.
  for (const recipe of arrayOf(payload.recipes)) {
    if (recipe?.recipeItemId && !recipeItemIds.has(recipe.recipeItemId)) {
      push(REFERENCE_KINDS.RECIPE_ITEM, 'recipe', recipe, recipe.recipeItemId);
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
