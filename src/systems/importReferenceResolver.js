/**
 * Pure classification, copy-mode rebinding and resolution of an import payload's cross-references
 * (`openspec/specs/import-export/spec.md` § Reference handling, § Copy-mode identifier rebinding).
 * Foundry-free: the only side channel is the injected async `resolveUuid` for external existence
 * checks. A broken INTERNAL reference is kept verbatim and reported; an EXTERNAL one is preserved,
 * resolved when possible, else reported, never nulled. Each entry is `{ kind, ownerType, ownerId,
 * ownerName, referenceValue, disposition }`, `disposition` being `remapped` (resolved to a
 * different value, updated in place), `retained` (resolved unchanged) or `reported`.
 */

import { sourceReferencesOf, toolSourceReferences } from './worldScopeEntityGrouping.js';
import {
  keyedRemapper,
  rewriteGatheringSliceReferences,
  rewriteMembershipReferences,
  rewriteRecipeReferences,
  rewriteSystemReferences,
} from './worldScopeReferenceRewrite.js';

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
  // The world-scope kinds (issue 1364) reuse the entity owner types; `worldToolBreakageDropped`,
  // whose subject is a setting, takes `unknown`; a generic `worldEntity` would be unsearchable.
  WORLD_ENTITY_COLLISION: 'worldEntityCollision',
  WORLD_ENTITY_MISSING: 'worldEntityMissing',
  WORLD_DEFAULT_DECLINED: 'worldDefaultDeclined',
  WORLD_TOOL_BREAKAGE_DROPPED: 'worldToolBreakageDropped',
  // A `1.34.0` essence-merge refusal changes no slice, so only this kind reports it (issue 1654).
  WORLD_ESSENCE_MERGE_REFUSED: 'worldEssenceMergeRefused',
});

/** The world-scope entity types; the maps below give each one's slice key and system array. */
export const WORLD_SCOPE_ENTITY_TYPES = Object.freeze(['components', 'essences', 'tools']);

/** The envelope slice key for each world-scope entity type. */
export const WORLD_SCOPE_SLICE_KEYS = Object.freeze({
  components: 'componentScope',
  essences: 'essenceScope',
  tools: 'toolScope',
});

/** The `system` array each world-scope entity type is stored under. */
const WORLD_SCOPE_SYSTEM_FIELDS = Object.freeze({
  components: 'components',
  essences: 'essenceDefinitions',
  tools: 'tools',
});

/** The report owner type each world-scope entity type reuses. */
const WORLD_SCOPE_OWNER_TYPES = Object.freeze({
  components: 'component',
  essences: 'essence',
  tools: 'tool',
});

const LOCAL_ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

function localId() {
  // A Foundry-free 16-char base36 `randomID()` stand-in drawn from the platform CSPRNG, so it
  // stays pure and free of insecure-randomness findings.
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let id = '';
  for (const byte of bytes) {
    id += LOCAL_ID_ALPHABET[byte % LOCAL_ID_ALPHABET.length];
  }
  return id;
}

/**
 * One incoming record's source-reference set, by the `1.30.0` grouping's six-spelling rule (the
 * legacy spellings are what a schema 1-5 export carries); a tool with no refs of its own derives
 * through its component.
 */
function sourceReferenceSet(record, entityType, components) {
  return entityType === 'tools'
    ? toolSourceReferences(record, components)
    : sourceReferencesOf(record);
}

/** The destination's world entities of one type in roster order, each with its source refs. */
function destinationRoster(worldEntityIndex, entityType) {
  const entities = worldEntityIndex?.[entityType];
  if (!Array.isArray(entities)) return [];
  const roster = [];
  for (const entity of entities) {
    if (!entity || typeof entity !== 'object') continue;
    const id = typeof entity.id === 'string' ? entity.id.trim() : '';
    if (!id) continue;
    // A world entity carries its own refs; the migration folded any derived tool set onto it.
    roster.push({ id, refs: new Set(sourceReferencesOf(entity)) });
  }
  return roster;
}

function intersectionSize(refs, candidateRefs) {
  let size = 0;
  for (const ref of refs) if (candidateRefs.has(ref)) size += 1;
  return size;
}

function reportEntry(kind, ownerType, owner, referenceValue) {
  return {
    kind,
    ownerType,
    ownerId: owner?.id ?? null,
    ownerName: owner?.name ?? '',
    referenceValue,
    disposition: 'reported',
  };
}

/**
 * Report each incoming entity whose id equals a destination world entity's while both carry source
 * references and share none (issue 1364, `worldEntityCollision`): it resolves to the wrong thing,
 * and keep mode may not re-key. Keep mode checks all three types and copy mode tools and essences;
 * copy-mode components bind by match-or-mint in the later `rebindCopyComponentIds`. The essence
 * arm is vacuous in practice, since world essences carry no source link (see the spec).
 */
export function reportWorldEntityCollisions(prepared, worldEntityIndex, mode) {
  const entries = [];
  if (!prepared || typeof prepared !== 'object' || !worldEntityIndex) return entries;
  const components = arrayOf(prepared.system?.components);
  for (const entityType of WORLD_SCOPE_ENTITY_TYPES) {
    // Copy-mode components bind by match-or-mint, so they never arrive under a colliding id.
    if (mode === 'copy' && entityType === 'components') continue;
    const roster = destinationRoster(worldEntityIndex, entityType);
    if (roster.length === 0) continue;
    const byId = new Map(roster.map((entity) => [entity.id, entity]));
    for (const record of arrayOf(prepared.system?.[WORLD_SCOPE_SYSTEM_FIELDS[entityType]])) {
      if (!record || typeof record !== 'object') continue;
      const id = typeof record.id === 'string' ? record.id.trim() : '';
      const destination = id ? byId.get(id) : null;
      if (!destination) continue;
      const refs = sourceReferenceSet(record, entityType, components);
      if (refs.length === 0 || destination.refs.size === 0) continue;
      if (intersectionSize(refs, destination.refs) > 0) continue;
      entries.push(
        reportEntry(
          REFERENCE_KINDS.WORLD_ENTITY_COLLISION,
          WORLD_SCOPE_OWNER_TYPES[entityType],
          record,
          id
        )
      );
    }
  }
  return entries;
}

/**
 * Copy mode: regenerate environment record ids, preserving task, event and characterModifier ids
 * so library linkages survive; the importer rebinds `craftingSystemId` and the `gatheringConfig`
 * key once the new system exists. Realms are world scope since issue 1282 and keep their ids, as
 * do `includedRealmIds`/`excludedRealmIds`, so the destination-wins merge recognises the world's
 * places instead of duplicating them.
 */
export function rebindCopyContainerIds(prepared, { generateId = localId } = {}) {
  if (!prepared || typeof prepared !== 'object') return prepared;
  const { gatheringEnvironments } = prepared;

  const environments = Array.isArray(gatheringEnvironments) ? gatheringEnvironments : [];
  for (const env of environments) {
    if (!env || typeof env !== 'object') continue;
    if (env.id) env.id = generateId();
  }

  return prepared;
}

/**
 * Copy mode: bind each incoming component to the destination world entity its source references
 * match, else mint, and remap every within-payload reference to an old component id (issue 1364;
 * `import-export/spec.md` § Copy-mode identifier rebinding owns the rules). Matching runs over
 * `prepared.system.components`, never the derived slice, whose spellings are already canonical. A
 * multi-match binds to the largest intersection (first in roster order wins) and reports the
 * rest; the binding is INJECTIVE through the id-claim ladder in `bindToDestination`. The map
 * drives five targets: the system, recipes and gathering slice through the shared walk in
 * `worldScopeReferenceRewrite.js`; `membership` and `defaults` records; their own ids; and the
 * incoming roster, where a MATCHED entity is dropped rather than re-keyed so correctness never
 * leans on the merge's collision rule. The rewrite is key-aware, and tool ids are never re-keyed.
 * `worldEntityIndex` is the destination roster (`prepareForImport` requires it in copy mode; empty
 * means every component mints) and `report` collects the ambiguity entries.
 */
export function rebindCopyComponentIds(
  prepared,
  { generateId = localId, worldEntityIndex = null, report = null } = {}
) {
  if (!prepared || typeof prepared !== 'object') return prepared;
  const { system, recipes, gatheringConfig } = prepared;

  const components = Array.isArray(system?.components) ? system.components : [];
  const roster = destinationRoster(worldEntityIndex, 'components');

  const idMap = {};
  // Incoming ids that bound to a destination entity rather than minting.
  const matched = new Set();
  // The id-claim ladder's state, destination id -> the record that took it: a Map, so a
  // contention report names both owners.
  const claimed = new Map();
  for (const component of components) {
    if (!component || typeof component !== 'object' || !component.id) continue;
    const refs = sourceReferenceSet(component, 'components', components);
    const bound =
      refs.length > 0 ? bindToDestination(refs, roster, component, report, claimed) : null;
    if (bound) {
      idMap[component.id] = bound;
      matched.add(component.id);
    } else {
      idMap[component.id] = generateId();
    }
  }
  if (Object.keys(idMap).length === 0) return prepared;

  // TARGET 5, first half - the world entity roster's own ids. A MATCHED entity's record is
  // DROPPED: the destination already holds that world entity, so there is nothing to add.
  dropMatchedWorldEntities(prepared, matched, idMap);

  // Rewrite the component ids themselves.
  for (const component of components) {
    if (component && typeof component === 'object' && component.id && idMap[component.id]) {
      component.id = idMap[component.id];
    }
  }

  const remappers = { remapComponent: keyedRemapper(idMap), remapTool: (value) => value };
  // TARGET 1 - the system, its recipes and its gathering slice, through the shared walk.
  for (const recipe of arrayOf(recipes)) rewriteRecipeReferences(recipe, remappers);
  rewriteSystemReferences(system, remappers);
  rewriteGatheringSliceReferences(systemSlice(gatheringConfig), remappers);
  // TARGETS 2, 3 and 4 - the component references inside the three slices, and their own ids.
  rewriteScopeSliceReferences(prepared, remappers, keyedRemapper(idMap));

  return prepared;
}

/**
 * The id-claim ladder, keyed on the destination id: the best intersecting candidate if unclaimed,
 * else the next unclaimed one in rank order (which makes a re-import idempotent), else `null` to
 * mint. `claimed` spans the whole payload, which makes the binding injective.
 */
function bindToDestination(refs, roster, component, report, claimed) {
  const candidates = rankedCandidates(refs, roster);
  if (candidates.length === 0) return null;

  // Everything ranked ABOVE the winner is, by construction, already claimed by another incoming
  // record; everything BELOW it is an ordinary multi-match loser.
  const winnerIndex = candidates.findIndex((candidate) => !claimed.has(candidate.id));
  const contested = winnerIndex === -1 ? candidates : candidates.slice(0, winnerIndex);
  const beaten = winnerIndex === -1 ? [] : candidates.slice(winnerIndex + 1);
  reportBinding(report, component, claimed, contested, beaten);

  // RUNG 3 - every intersecting candidate is spoken for, so this record mints its own id.
  if (winnerIndex === -1) return null;

  const winner = candidates[winnerIndex].id;
  claimed.set(winner, component);
  return winner;
}

/**
 * The intersecting destination entities, largest intersection first, ties by an explicit roster
 * position rather than sort stability, so a re-run chooses identically.
 */
function rankedCandidates(refs, roster) {
  const candidates = [];
  for (const [position, entity] of roster.entries()) {
    const size = intersectionSize(refs, entity.refs);
    if (size > 0) candidates.push({ id: entity.id, size, position });
  }
  candidates.sort((left, right) => right.size - left.size || left.position - right.position);
  return candidates;
}

/**
 * Report a binding: each CONTESTED destination id against BOTH owners (the record that claimed it
 * and the one that had to move), and each merely BEATEN candidate against this record alone.
 */
function reportBinding(report, component, claimed, contested, beaten) {
  if (!Array.isArray(report)) return;
  const push = (owner, referenceValue) => {
    report.push(
      reportEntry(REFERENCE_KINDS.WORLD_ENTITY_COLLISION, 'component', owner, referenceValue)
    );
  };
  for (const candidate of contested) {
    push(claimed.get(candidate.id), candidate.id);
    push(component, candidate.id);
  }
  for (const candidate of beaten) {
    // Unconditionally: `contested` and `beaten` are disjoint, so a `claimed` filter could only
    // suppress a real multi-match that another record happened to claim.
    push(component, candidate.id);
  }
}

/**
 * TARGET 5: drop each matched entity's incoming roster record and re-key the rest; a matched one
 * would otherwise merge in as a second world record for an Item the destination already has.
 */
function dropMatchedWorldEntities(prepared, matched, idMap) {
  const slice = prepared[WORLD_SCOPE_SLICE_KEYS.components];
  if (!slice || typeof slice !== 'object' || !Array.isArray(slice.entities)) return;
  const kept = [];
  for (const entity of slice.entities) {
    if (!entity || typeof entity !== 'object') continue;
    if (matched.has(entity.id)) continue;
    if (idMap[entity.id]) entity.id = idMap[entity.id];
    kept.push(entity);
  }
  slice.entities = kept;
}

/**
 * TARGETS 2 to 4: component references inside the three slices, plus each `defaults` record's
 * `id` and `membership` record's `entityId`. `defaults` shares the membership section shape, so
 * the same rewrite applies. Only component ids move; the `1.34.0` essence merge re-keys essences
 * earlier, in the export upcast (issue 1654).
 */
function rewriteScopeSliceReferences(prepared, remappers, remapId) {
  for (const entityType of WORLD_SCOPE_ENTITY_TYPES) {
    const slice = prepared[WORLD_SCOPE_SLICE_KEYS[entityType]];
    if (!slice || typeof slice !== 'object') continue;
    for (const record of arrayOf(slice.defaults)) {
      rewriteMembershipReferences(record, entityType, remappers);
      if (entityType === 'components' && record && typeof record === 'object') {
        record.id = remapId(record.id);
      }
    }
    for (const record of arrayOf(slice.membership)) {
      rewriteMembershipReferences(record, entityType, remappers);
      if (entityType === 'components' && record && typeof record === 'object') {
        record.entityId = remapId(record.entityId);
      }
    }
  }
}

/**
 * Copy mode: regenerate every recipe id and remap each `recipeItemDefinitions[].recipeIds` entry
 * to it (issue 701), or every copied book renders empty; an id absent from the payload stays
 * verbatim and still reports. Only `recipeIds[]` positions move, and the component remap never
 * touches them.
 */
export function rebindCopyRecipeIds(prepared, { generateId = localId } = {}) {
  if (!prepared || typeof prepared !== 'object') return prepared;
  const { system, recipes } = prepared;

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
 * Classify every reference in a deep clone, applying remapped external values. External checks
 * need `resolveUuid`; without one everything external stays verbatim and unreported.
 */
export async function resolveImportReferences(payload, { resolveUuid = null } = {}) {
  const resolved = structuredClone(payload || {});
  const unresolvedReferences = [];

  collectBrokenInternalReferences(resolved, unresolvedReferences);

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

  // Realm scene mappings, read from the envelope's travel config since issue 1282.
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
  // Essence property macros (issue 1036) sit on a differently named field.
  collectMacroDescriptors(system.essenceDefinitions, 'essence', descriptors, 'propertyMacroUuid');
  collectComplicationMacroDescriptors(system.components, descriptors);

  return descriptors;
}

/**
 * Component complication macros (issue 1286), walked separately so the report names the owning
 * component, which the GM can open, rather than the complication; unregistered, the uuid would
 * run the wrong macro in the importing world.
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

/** Report the internal references that resolve to nothing within the payload. */
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

  // Tool component refs across BOTH `system.tools` and the gathering-library tools (issue 570).
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

  // Recipe ingredient, result and catalyst refs, recursive `alternatives[]` and flat aliases
  // included, top level and per step (issue 570). `ownerType` travels with the owner because a
  // COMPONENT's salvage refs share these walkers (issue 877).
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
    const references = new Set([result?.componentId, result?.systemItemId].filter(Boolean));
    for (const componentId of references) {
      if (!componentIds.has(componentId)) {
        push(REFERENCE_KINDS.COMPONENT_LINK, ownerType, owner, componentId);
      }
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
  for (const task of arrayOf(slice.tasks)) {
    reportResultGroups(task?.resultGroups, task, 'task');
  }
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

  // Essence `sourceComponentId`, falling back to the legacy `associatedSystemItemId`.
  for (const def of arrayOf(system.essenceDefinitions)) {
    const sourceComponentId = def?.sourceComponentId ?? def?.associatedSystemItemId;
    if (sourceComponentId && !componentIds.has(sourceComponentId)) {
      push(REFERENCE_KINDS.COMPONENT_LINK, 'essence', def, sourceComponentId);
    }
  }

  // Legacy reverse `recipeItemId`; absent once a world has book-side membership.
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
