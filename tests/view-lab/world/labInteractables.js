/**
 * The lab scene's `fabricate.interactable` Region Behaviours (issue 1520).
 *
 * The three canvas windows — the Interactable browser, the rich config panel and the Manage
 * Interactables list — were unphotographable until this file existed, and the gap was worse than
 * "no evidence": `mapChangedFilesToCases` returned `fabricate-app-shell` for a diff touching all
 * three, and `check-screenshots` reported SATISFIED on a frame of the PLAYER crafting window.
 *
 * ── WHAT THIS SEEDS, AND WHY EACH BEHAVIOUR IS HERE ────────────────────────────────────────────
 *
 * The shapes are MIRRORED FROM THE SMOKE'S OWN SEED (`scripts/foundry-test-run.mjs`, the Azure
 * Grove interactables), not invented, because the smoke frames are what the lab frames are
 * compared against. Two of the three are that seed:
 *
 *   - `deep-gate-forage` — a CONFIGURED gathering-task interactable, `taskNodeLink: 'linked'`, no
 *     linked visual. This is the smoke's `interactable-config-linked` / `-source-configured`
 *     subject, and the manager row it produces reports `region-only` for the reason
 *     `classifyMarkerStatus` gives: `linkedVisual.mode` defaults to `marker` but the uuid is null,
 *     so there is no configured marker to be missing.
 *   - `deep-gate-draft` — an UNCONFIGURED behaviour: the schema `initial`s Foundry's native
 *     Region → Behaviors → "+ Add Behavior" path produces from an EMPTY `system`. It instantiates
 *     valid and is born inert, and `isUnconfiguredInteractable` is what the config panel's "Needs
 *     configuration" state keys on. Its manager row renders the `Fabricate.unconfigured.tool`
 *     sentinel as its own name, which looks like a defect and is not: it is exactly what a GM
 *     sees, and the smoke's own `interactables-manager-list` frame shows the same row.
 *
 * The third is the lab's own, and it earns its place by reaching branches the smoke's two cannot:
 *
 *   - `deep-gate-cache` — a TOOL interactable with a Tile marker that RESOLVES, and
 *     `state.locked`. Between them those give the manager list a non-`region-only` marker badge
 *     and a non-default state badge, so `markerLabel` and `stateBadges` are photographed rather
 *     than assumed. The smoke has no such interactable, which is why the manager cases declare
 *     `reaches: 'window'` rather than `exact`.
 *
 * ── WHY A SECOND BEHAVIOUR RATHER THAN A `buildLabWorld` FLAG ──────────────────────────────────
 *
 * The config panel has to reach BOTH its configured and its needs-configuration states. Those are
 * two DIFFERENT behaviours in production — one placed by Fabricate, one born from the native
 * "+ Add Behavior" path — so a flag that rebuilt the world in one mode or the other would model
 * something that does not exist, would cost a second world build for the second frame, and would
 * add a key to `readParams` for a distinction the world can simply carry. Seeding both, and
 * letting the case name the ref it opens, is cheaper and truthful; the manager's populated list
 * wants both rows anyway.
 *
 * The manager's EMPTY state is the one thing no behaviour count can produce from this world, so
 * that alone is a `buildLabWorld` flag (`noInteractables`), in the same shape as `noParties` and
 * `noTools`.
 *
 * ── WHY ALL THREE SIT ON THE ONE DECLARED REGION, AND WHAT THAT COSTS ──────────────────────────
 *
 * `labWorld.js` declares exactly one region, `deep-gate`, and this file adds NO second one. That
 * is a deliberate constraint rather than an economy. The manager's Travel → Map Region Links tab
 * renders `readSceneRegions(game.scenes.current)`, so a region added here would appear in three
 * already-published manager frames — and, worse, would make this module's readership no longer
 * canvas-only, silently falsifying its `ATTRIBUTED_LAB_INPUTS` entry in
 * `scripts/lib/viewLabCases.js`. Nothing outside the canvas windows reads a region's
 * `behaviors`, so attaching three behaviours to the existing region changes no other frame.
 *
 * A Region carrying several behaviours is legal Foundry and Fabricate handles it explicitly
 * (`planInteractableDeletion` exists precisely because a region can carry behaviours Fabricate
 * did not place), but it is not the ordinary shape, and it has one visible cost: the Manage
 * panel's promote picker offers this scene's only region, already marked "already an
 * interactable". The promote frame drives that selection anyway, so it photographs a complete,
 * enabled promote panel. Seeding a genuinely promotable region is the improvement to make when
 * the Travel Map frames are being re-photographed for another reason, and it must move the
 * attribution entry with it.
 *
 * ── THE COLLECTION SHAPES, AND WHY THEY ARE NOT PLAIN ARRAYS ───────────────────────────────────
 *
 * `labWorld.js` declares its scene's `regions` as a plain array, which every SCAN path tolerates
 * (`scanSceneInteractables`, `_listRegions`, `readSceneRegions` and `regionHitTest` all accept an
 * array, a `.contents` or a `.values()`). The two RESOLVE paths do not:
 * `InteractableConfigApp._resolveBehavior` and `InteractablesManagerApp._resolveBehavior` both
 * walk `scene.regions.get(id).behaviors.get(id)`, and an array has no `get`. So this file installs
 * a minimal `{ contents, get, values, size, [Symbol.iterator] }` collection over both levels — the
 * same surface `installFoundryShim`'s `createCollection` exposes, which is what every reader in
 * `src/` is written against.
 */

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

/**
 * The behaviour refs a case can open the config panel against, by NAME rather than by id.
 *
 * Named rather than written as raw ids in the registry because the ref is a three-part
 * `{sceneId, regionId, behaviorId}` and a case should not carry three fixture ids to say "the
 * unconfigured one". The mount page resolves `?interactable=<name>` through this table, so a
 * renamed fixture fails at mount naming the key it could not resolve, rather than rendering an
 * empty panel that publishes as evidence.
 */
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

/**
 * A minimal Foundry collection over a fixed list.
 *
 * Deliberately the same member set `installFoundryShim`'s `createCollection` exposes rather than a
 * narrower one: `src/` reads these through four different tolerant coercions, and a collection
 * missing whichever member the next reader happens to prefer fails by rendering an empty list
 * rather than by throwing.
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
 * DERIVED from the built content rather than named, so a fixture rename moves this with it. A
 * hard-coded task id would leave the interactable pointing at nothing, and that failure is quiet:
 * `resolveSourceLabel` returns null, `pickLabel` falls through to the stored name, and the frame
 * publishes with a plausible-looking row that resolves no source at all.
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
 * `parent` is wired because `identifyRegionBehaviorRef` walks `behavior.parent.parent` to recover
 * the `{sceneId, regionId, behaviorId}` triple every row, every action and every config ref is
 * keyed by — a behaviour with no `parent` produces no ref at all, and `buildInteractableRow` then
 * drops the row SILENTLY rather than failing.
 *
 * @param {object} params Behaviour fields.
 * @param {object} params.region The owning region document.
 * @param {string} params.id Behaviour id.
 * @param {string} params.name The behaviour document's own name.
 * @param {object|null} params.system Its system data, or null for a natively-added unconfigured one.
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
 * Called BEFORE `installFoundryShim`, because the shim wraps `world.scenes` in the collection
 * `game.scenes` exposes and captures `current` / `active` from it.
 *
 * @param {object} world The lab world under construction.
 * @param {object} world.content The built lab content.
 * @param {object[]} world.scenes The scene list `labWorld.js` declares.
 * @param {Map<string, object>} [world.documents] The uuid index `fromUuidSync` resolves against.
 * @returns {void}
 * @throws {Error} When the world carries no scene, region, Tool or gathering task to bind to —
 *   each of which would otherwise render an empty window that publishes as evidence.
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
  // `fromUuidSync` path rather than the scene-embedded fallback. Both resolve it; only the
  // primary is the path production takes.
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
  // Travel Map frames are photographs of exactly those fields. Only `shapes` and `behaviors` are
  // added, and neither is read outside the canvas windows.
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

  const draft = behaviorDocument({
    region,
    id: LAB_INTERACTABLE_REFS.unconfigured.behaviorId,
    name: 'Fabricate Interactable',
    system: null,
  });

  region.behaviors = collectionOf([forage, cache, draft]);
  scene.regions = collectionOf([region]);
}
