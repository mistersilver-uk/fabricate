/** The lab scene's `fabricate.interactable` Region Behaviours (issue 1520). */

import { buildInteractableSourceUuid } from '../../../src/canvas/interactableResolution.js';
import {
  buildInteractableBehaviorSystem,
  INTERACTABLE_BEHAVIOR_SUBTYPE,
  UNCONFIGURED_SOURCE_UUID,
  UNCONFIGURED_SYSTEM_ID,
} from '../../../src/canvas/regions/interactableRegionFlags.js';

/** The scene `labWorld.js` declares, and the only one the canvas windows read. */
export const LAB_INTERACTABLE_SCENE_ID = 'lab-scene';

/** The region `labWorld.js` declares, which every seeded behaviour hangs off. */
const LAB_INTERACTABLE_REGION_ID = 'deep-gate';

/** The behaviour refs a case can open the config panel against, by NAME rather than by id. */
export const LAB_INTERACTABLE_REFS = Object.freeze({
  configured: Object.freeze({
    sceneId: LAB_INTERACTABLE_SCENE_ID,
    regionId: LAB_INTERACTABLE_REGION_ID,
    behaviorId: 'deep-gate-forage',
  }),
  unconfigured: Object.freeze({
    sceneId: LAB_INTERACTABLE_SCENE_ID,
    regionId: LAB_INTERACTABLE_REGION_ID,
    behaviorId: 'deep-gate-draft',
  }),
});

/** The Tile document the tool interactable's marker resolves to. */
const MARKER_TILE_UUID = 'Scene.lab-map.Tile.deep-gate-marker';

/** A Tile uuid that resolves to NOTHING, for the one behaviour whose marker is missing. */
const DELETED_MARKER_TILE_UUID = 'Scene.lab-map.Tile.deep-gate-deleted-marker';

/**
 * A minimal Foundry collection over a fixed list.
 *
 * @param {object[]} entries The documents.
 * @returns {object} The collection.
 */
function collectionOf(entries) {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  return {
    contents: entries,
    get: (id) => byId.get(String(id)) ?? null,
    find: (predicate) => entries.find((entry) => predicate(entry)) ?? null,
    filter: (predicate) => entries.filter((entry) => predicate(entry)),
    map: (mapper) => entries.map((entry) => mapper(entry)),
    forEach: (visitor) => {
      for (const entry of entries) visitor(entry);
    },
    values: () => entries.values(),
    get size() {
      return entries.length;
    },
    [Symbol.iterator]: () => entries[Symbol.iterator](),
  };
}

/**
 * The first gathering task of a crafting system that declares one, as `{ systemId, taskId }`.
 *
 * @param {object} content The built lab content.
 * @returns {{systemId: string, taskId: string}|null} The source, or null when the world has none.
 */
function firstGatheringTaskSource(content) {
  const task = (content?.gatheringConfig?.tasks ?? []).find(
    (candidate) => candidate?.id && candidate.craftingSystemId
  );
  return task ? { systemId: String(task.craftingSystemId), taskId: String(task.id) } : null;
}

/**
 * The first Tool of a crafting system that declares one, as `{ systemId, toolId }`.
 *
 * @param {object} content The built lab content.
 * @returns {{systemId: string, toolId: string}|null} The source, or null when the world has none.
 */
function firstToolSource(content) {
  for (const system of content?.systems ?? []) {
    const tool = (system?.tools ?? []).find((candidate) => candidate?.id);
    if (tool) return { systemId: String(system.id), toolId: String(tool.id) };
  }
  return null;
}

/**
 * The environment a gathering-task interactable is bound to, preferring its own system's.
 *
 * @param {object} content The built lab content.
 * @param {string} systemId The task's crafting system.
 * @returns {string|null} An environment id, or null when the world declares none.
 */
function environmentFor(content, systemId) {
  const environments = content?.environments ?? [];
  const owned = environments.find(
    (environment) => String(environment?.craftingSystemId ?? '') === systemId
  );
  const chosen = owned ?? environments[0] ?? null;
  return String(chosen?.id ?? '') || null;
}

/**
 * One `fabricate.interactable` Region Behaviour document.
 *
 * @param {object} params Behaviour fields.
 * @param {object} params.region The owning region document.
 * @param {string} params.id Behaviour id.
 * @param {string} params.name The behaviour document's own name.
 * @param {object|null} params.system Its system data, or null for a natively-added unconfigured
 * one.
 * @returns {object} The behaviour document.
 */
function behaviorDocument({ region, id, name, system }) {
  return {
    id,
    _id: id,
    uuid: `${region.uuid}.RegionBehavior.${id}`,
    name,
    type: INTERACTABLE_BEHAVIOR_SUBTYPE,
    // Spelling the schema `initial`s rather than leaving `system` empty is what the DataModel
    // does on the native path, and `isUnconfiguredInteractable` reads exactly these fields.
    system: system ?? {
      interactableType: 'tool',
      sourceUuid: UNCONFIGURED_SOURCE_UUID,
      systemId: UNCONFIGURED_SYSTEM_ID,
      toolId: null,
      taskId: null,
      environmentId: null,
      taskNodeLink: 'linked',
      node: null,
      name: '',
    },
    parent: region,
  };
}

/**
 * Seed the lab scene's interactables, in place.
 *
 * @param {object} world The lab world under construction.
 * @param {object} world.content The built lab content.
 * @param {object[]} world.scenes The scene list `labWorld.js` declares.
 * @param {Map<string, object>} [world.documents] The uuid index `fromUuidSync` resolves against.
 * @throws {Error} When the world carries no scene, region, Tool or gathering task to bind to — each
 * of which would otherwise render an empty window that publishes as evidence.
 */
export function seedLabInteractables(world) {
  const scene = (world?.scenes ?? []).find(
    (candidate) => candidate?.id === LAB_INTERACTABLE_SCENE_ID
  );
  if (!scene) throw new Error(`lab world has no "${LAB_INTERACTABLE_SCENE_ID}" scene to seed`);

  const declared = (Array.isArray(scene.regions) ? scene.regions : []).find(
    (candidate) => candidate?.id === LAB_INTERACTABLE_REGION_ID
  );
  if (!declared) {
    throw new Error(`the lab scene no longer declares a "${LAB_INTERACTABLE_REGION_ID}" region`);
  }

  const content = world.content;
  const taskSource = firstGatheringTaskSource(content);
  const toolSource = firstToolSource(content);
  if (!taskSource || !toolSource) {
    throw new Error(
      'the lab world carries no gathering task or no Tool, so no interactable could name a source ' +
        'a GM could have chosen — see firstGatheringTaskSource / firstToolSource'
    );
  }

  // The marker Tile, registered in the uuid index so `resolveLinkedVisual` takes its PRIMARY
  // `fromUuidSync` path rather than the scene-embedded fallback.
  const markerTile = {
    id: 'deep-gate-marker',
    _id: 'deep-gate-marker',
    uuid: MARKER_TILE_UUID,
    documentName: 'Tile',
    hidden: false,
    x: 1000,
    y: 1000,
    width: 200,
    height: 200,
  };
  scene.tiles = collectionOf([markerTile]);
  world.documents?.set?.(MARKER_TILE_UUID, markerTile);

  // The region keeps its declared identity — id, uuid, name and colour — because the manager's
  // Travel Map frames are photographs of exactly those fields.
  const region = Object.assign(declared, {
    parent: scene,
    shapes: [{ type: 'rectangle', x: 1000, y: 1000, width: 400, height: 400 }],
  });

  const forage = behaviorDocument({
    region,
    id: LAB_INTERACTABLE_REFS.configured.behaviorId,
    name: 'Deep Gate mossbed',
    system: buildInteractableBehaviorSystem({
      interactableType: 'gatheringTask',
      sourceUuid: buildInteractableSourceUuid({
        interactableType: 'gatheringTask',
        systemId: taskSource.systemId,
        referenceId: taskSource.taskId,
      }),
      systemId: taskSource.systemId,
      taskId: taskSource.taskId,
      environmentId: environmentFor(content, taskSource.systemId),
      taskNodeLink: 'linked',
      node: null,
      name: 'Deep Gate mossbed',
    }),
  });

  const cache = behaviorDocument({
    region,
    id: 'deep-gate-cache',
    name: 'Sunken cache anvil',
    system: {
      ...buildInteractableBehaviorSystem({
        interactableType: 'tool',
        sourceUuid: buildInteractableSourceUuid({
          interactableType: 'tool',
          systemId: toolSource.systemId,
          referenceId: toolSource.toolId,
        }),
        systemId: toolSource.systemId,
        toolId: toolSource.toolId,
        name: 'Sunken cache anvil',
        linkedVisual: { uuid: MARKER_TILE_UUID, documentName: 'Tile', mode: 'marker' },
      }),
      // The builder always returns a freshly-enabled, unlocked state — it ignores `state`
      // entirely — so a LOCKED interactable, which is a GM action rather than a placement, is
      // applied over the built system rather than smuggled into the builder's argument.
      state: {
        enabled: true,
        consumed: false,
        locked: true,
        uses: { max: null, used: 0 },
        cooldown: { seconds: null, lastUsedWorldTime: null },
      },
    },
  });

  // The row whose marker is MISSING: same shape as `cache`, pointing at a uuid the world does not
  // carry, and disabled.
  const lost = behaviorDocument({
    region,
    id: 'deep-gate-lost',
    name: 'Collapsed shaft winch',
    system: {
      ...buildInteractableBehaviorSystem({
        interactableType: 'tool',
        sourceUuid: buildInteractableSourceUuid({
          interactableType: 'tool',
          systemId: toolSource.systemId,
          referenceId: toolSource.toolId,
        }),
        systemId: toolSource.systemId,
        toolId: toolSource.toolId,
        name: 'Collapsed shaft winch',
        linkedVisual: { uuid: DELETED_MARKER_TILE_UUID, documentName: 'Tile', mode: 'marker' },
      }),
      // Applied over the built system for the reason `cache`'s note gives: the builder always
      // returns a freshly-enabled, unlocked state and ignores `state` entirely.
      state: {
        enabled: false,
        consumed: false,
        locked: false,
        uses: { max: null, used: 0 },
        cooldown: { seconds: null, lastUsedWorldTime: null },
      },
    },
  });

  const draft = behaviorDocument({
    region,
    id: LAB_INTERACTABLE_REFS.unconfigured.behaviorId,
    name: 'Fabricate Interactable',
    system: null,
  });

  region.behaviors = collectionOf([forage, cache, lost, draft]);
  scene.regions = collectionOf([region]);
}
