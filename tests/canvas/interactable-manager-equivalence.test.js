/**
 * The observable behaviour of `InteractableManager`, pinned before issue 1704 split it into
 * `interactablePredicates`, `interactableGrant`, `regionEnterPrompt` and `interactableSpawner`.
 * Every cell here holds against the PRE-split manager too: substitute it and the suite still passes.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { InteractableManager } from '../../src/canvas/InteractableManager.js';
import {
  interactableSystem as toolSystem,
  placedBehavior,
  taskClassification,
  toolClassification,
} from '../helpers/interactableFixtures.js';
import { tokenDoc } from '../helpers/regionContainmentFakes.js';

const RUNTIME_KEYS = ['game', 'Hooks', 'canvas', 'foundry', 'CONFIG', 'ui', 'PIXI', 'window'];

const GM = Object.freeze({ id: 'gm-1', isGM: true });
const PLAYER = Object.freeze({ id: 'u-1', isGM: false });

function keepRuntime() {
  const kept = {};
  for (const key of RUNTIME_KEYS) kept[key] = globalThis[key];
  return kept;
}

function putRuntimeBack(kept) {
  for (const key of RUNTIME_KEYS) {
    if (kept[key] === undefined) delete globalThis[key];
    else globalThis[key] = kept[key];
  }
}

async function settle(turns = 8) {
  for (let index = 0; index < turns; index += 1) await Promise.resolve();
}

function taskSystem(overrides = {}) {
  return toolSystem({
    interactableType: 'gatheringTask',
    sourceUuid: 'Fabricate.sysA.gatheringTask.task-9',
    toolId: null,
    taskId: 'task-9',
    environmentId: 'env-forest',
    name: 'Chop Wood',
    ...overrides,
  });
}

function spawnScene(log, { failRegion, failTile, gridSize }) {
  return {
    id: 'scene-1',
    grid: { size: gridSize },
    async createEmbeddedDocuments(documentName, payloads) {
      if (documentName === 'Region') {
        if (failRegion) return [];
        const data = payloads[0];
        log.regionPayloads.push(data);
        const behavior = {
          id: 'beh-1',
          type: 'fabricate.interactable',
          system: data.behaviors?.[0]?.system ?? {},
          async update(update) {
            log.behaviorUpdates.push(update);
          },
        };
        return [
          {
            id: 'region-1',
            uuid: 'Scene.scene-1.Region.region-1',
            ...data,
            behaviors: { contents: [behavior] },
            async delete() {
              log.deletedRegions.push('region-1');
            },
          },
        ];
      }
      if (documentName === 'Tile') {
        if (failTile) throw new Error('tile create failed');
        log.tilePayloads.push(payloads[0]);
        log.tileParents.push(null);
        return [{ id: 'tile-1', uuid: 'Scene.scene-1.Tile.tile-1', ...payloads[0] }];
      }
      return [];
    },
  };
}

function tileDocumentClass(log, failTile) {
  return {
    async create(data, context) {
      if (failTile) throw new Error('tile create failed');
      log.tilePayloads.push(data);
      log.tileParents.push(context?.parent ?? null);
      return { id: 'tile-1', uuid: 'Scene.scene-1.Tile.tile-1', ...data };
    },
  };
}

/** `game.i18n` is always called as a method; a detached reference is the defect this catches. */
function assertI18nReceiver(receiver) {
  if (receiver !== globalThis.game?.i18n) throw new Error('i18n lost its receiver');
}

function installRuntime({
  isGM = true,
  worldTime = 0,
  tools = [{ id: 'tool-1', componentId: 'comp-axe', label: 'Forge Anvil' }],
  components = [{ id: 'comp-axe', img: 'icons/tools/axe.webp' }],
  tasks = [{ id: 'task-9', name: 'Chop Wood', defaultEnvironmentId: null }],
  environments = null,
  failRegion = false,
  failTile = false,
  gridSize = 100,
  tileClassOn = 'foundry',
} = {}) {
  const log = {
    regionPayloads: [],
    tilePayloads: [],
    tileParents: [],
    deletedRegions: [],
    behaviorUpdates: [],
    warnings: [],
    infos: [],
    emits: [],
  };
  const me = isGM ? { ...GM } : { ...PLAYER };
  const fabricate = {
    getCraftingSystemManager: () => ({
      getSystem: (systemId) => (systemId === 'sysA' ? { tools, components } : null),
    }),
  };
  if (environments) fabricate.getGatheringEnvironmentStore = () => ({ list: () => environments });

  globalThis.game = {
    user: me,
    users: { activeGM: isGM ? me : { ...GM }, get: () => null },
    time: { worldTime },
    socket: {
      emit: (...args) => log.emits.push({ channel: args[0], payload: args[1], argc: args.length }),
    },
    i18n: {
      localize(key) {
        assertI18nReceiver(this);
        return key;
      },
      format(key) {
        assertI18nReceiver(this);
        return key;
      },
    },
    actors: { get: () => null },
    scenes: { get: () => null },
    fabricate,
    settings: { get: () => ({ systems: { sysA: { tasks } } }) },
  };
  globalThis.ui = {
    notifications: {
      warn: (message) => log.warnings.push(message),
      info: (message) => log.infos.push(message),
    },
  };
  globalThis.canvas = { scene: spawnScene(log, { failRegion, failTile, gridSize }) };
  const TileDocument = tileDocumentClass(log, failTile);
  if (tileClassOn === 'foundry') globalThis.foundry = { documents: { TileDocument } };
  if (tileClassOn === 'config') globalThis.CONFIG = { Tile: { documentClass: TileDocument } };
  return log;
}

function grantFixture({
  system = toolSystem(),
  tokens = [],
  requesterId = 'u-1',
  canControlActor = true,
  ...runtime
} = {}) {
  const log = installRuntime({ isGM: true, ...runtime });
  const requester = requesterId === 'gm-1' ? { ...GM } : { id: requesterId, isGM: false };
  globalThis.game.users = {
    activeGM: globalThis.game.user,
    get: (id) => (String(id) === requesterId ? requester : null),
  };
  globalThis.game.actors = {
    get: (id) => (id === 'a1' ? { id: 'a1', testUserPermission: () => canControlActor } : null),
  };
  const behavior = placedBehavior({ system, tokens });
  globalThis.game.scenes = { get: (id) => (id === 'scene-1' ? behavior.parent.parent : null) };
  const opened = [];
  const manager = new InteractableManager({
    getAppClass: () => ({ show: (tab, options) => opened.push({ tab, options }) }),
  });
  return {
    log,
    manager,
    behavior,
    opened,
    request: {
      action: 'interactableActivate',
      sceneId: 'scene-1',
      regionId: 'region-1',
      behaviorId: 'beh-1',
      interactableType: system.interactableType,
      actorId: 'a1',
      userId: requesterId,
      ts: 7,
    },
  };
}

function payloadsOfAction(log, action) {
  return log.emits.filter((entry) => entry.payload?.action === action).map((e) => e.payload);
}

function promptFixture({ isGM = false } = {}) {
  const log = installRuntime({ isGM });
  const prompts = [];
  const dismissals = [];
  const manager = new InteractableManager({
    getPromptAppClass: () => ({
      show: (args) => prompts.push(args),
      dismiss: (ref) => dismissals.push(ref),
    }),
  });
  return { log, manager, prompts, dismissals };
}

function repromptFixture({ regionContains = true, tokenPresent = true, isOwner = true } = {}) {
  installRuntime({ isGM: false });
  const scene = { id: 'scene-1', tokens: { contents: [] } };
  const region = { id: 'region-1', parent: scene, testPoint: () => regionContains === true };
  const behavior = {
    id: 'beh-1',
    type: 'fabricate.interactable',
    system: toolSystem(),
    parent: region,
  };
  region.behaviors = { contents: [behavior] };
  scene.regions = { contents: [region] };
  const placeableDoc = { actorId: 'actor-1', actor: { id: 'actor-1' }, isOwner };
  placeableDoc.object = { center: { x: 50, y: 50 }, document: placeableDoc };
  if (tokenPresent) scene.tokens.contents.push(placeableDoc);
  globalThis.game.scenes = { get: (id) => (id === 'scene-1' ? scene : null) };
  globalThis.canvas.scene = scene;
  const prompts = [];
  const opened = [];
  const manager = new InteractableManager({
    getAppClass: () => ({ show: (tab, options) => opened.push({ tab, options }) }),
    getPromptAppClass: () => ({ show: (args) => prompts.push(args), dismiss: () => {} }),
  });
  return { manager, prompts, opened, scene, placeableDoc };
}

const REF = Object.freeze({ sceneId: 'scene-1', regionId: 'region-1', behaviorId: 'beh-1' });

function runtimeTest(name, body) {
  test(name, async () => {
    const kept = keepRuntime();
    try {
      await body();
    } finally {
      putRuntimeBack(kept);
    }
  });
}

runtimeTest('a marker drop writes the Region, the linked Tile and the linked-visual ref back', async () => {
  const log = installRuntime();
  const manager = new InteractableManager();

  const result = await manager._spawnInteractableRegion(
    manager._buildRegionSpawnRequest({
      classification: toolClassification(),
      point: { x: 150, y: 250 },
    })
  );

  assert.equal(result?.id, 'region-1');
  const region = log.regionPayloads[0];
  assert.deepEqual(region.shapes, [{ type: 'rectangle', x: 100, y: 200, width: 100, height: 100 }]);
  assert.equal(region.behaviors[0].type, 'fabricate.interactable');
  assert.equal(region.behaviors[0].system.interactableType, 'tool');
  assert.equal(region.behaviors[0].system.sourceUuid, 'Fabricate.sysA.tool.tool-1');
  assert.equal(region.flags.fabricate.interactableRegion, true);

  const tile = log.tilePayloads[0];
  assert.equal(log.tilePayloads.length, 1);
  assert.equal(tile.texture.src, 'icons/tools/axe.webp');
  assert.deepEqual(
    { x: tile.x, y: tile.y, width: tile.width, height: tile.height },
    { x: 150, y: 250, width: 100, height: 100 }
  );
  assert.equal(tile.flags.fabricate.isInteractableVisual, true);
  assert.equal(tile.flags.fabricate.linkedRegionUuid, 'Scene.scene-1.Region.region-1');
  assert.equal(tile.flags.fabricate.linkedBehaviorId, 'beh-1');
  assert.equal(log.tileParents[0], globalThis.canvas.scene);
  assert.deepEqual(log.behaviorUpdates, [
    { system: { linkedVisual: { uuid: 'Scene.scene-1.Tile.tile-1', documentName: 'Tile' } } },
  ]);
});

runtimeTest('the tile document class is resolved in-call, so a CONFIG override is honoured', async () => {
  const log = installRuntime({ tileClassOn: 'none' });
  const manager = new InteractableManager();
  globalThis.CONFIG = { Tile: { documentClass: tileDocumentClass(log, false) } };

  await manager._spawnInteractableRegion(
    manager._buildRegionSpawnRequest({
      classification: toolClassification(),
      point: { x: 150, y: 250 },
    })
  );

  assert.equal(log.tilePayloads.length, 1, 'CONFIG.Tile.documentClass created the tile');
  assert.equal(log.tileParents[0], globalThis.canvas.scene);
});

runtimeTest('with no document class at all the tile falls back to createEmbeddedDocuments', async () => {
  const log = installRuntime({ tileClassOn: 'none' });
  const manager = new InteractableManager();

  await manager._spawnInteractableRegion(
    manager._buildRegionSpawnRequest({
      classification: toolClassification(),
      point: { x: 150, y: 250 },
    })
  );

  assert.equal(log.tilePayloads.length, 1);
  assert.equal(log.behaviorUpdates.length, 1);
});

runtimeTest('visualMode none writes a hidden region-only interactable and no Tile', async () => {
  const log = installRuntime();
  const manager = new InteractableManager();

  const spawnRequest = manager._buildRegionSpawnRequest({
    classification: toolClassification(),
    point: { x: 150, y: 250 },
    visualMode: 'none',
  });
  assert.equal(spawnRequest.tile, null);
  const result = await manager._spawnInteractableRegion(spawnRequest);

  assert.equal(result?.id, 'region-1');
  const system = log.regionPayloads[0].behaviors[0].system;
  assert.equal(system.presentation.hidden, true);
  assert.equal(system.linkedVisual.mode, 'none');
  assert.deepEqual(log.regionPayloads[0].shapes, [
    { type: 'rectangle', x: 100, y: 200, width: 100, height: 100 },
  ]);
  assert.equal(log.tilePayloads.length, 0);
  assert.equal(log.behaviorUpdates.length, 0);
});

runtimeTest('a failed Tile rolls the orphan Region back and warns', async () => {
  const log = installRuntime({ failTile: true });
  const manager = new InteractableManager();

  const result = await manager._spawnInteractableRegion(
    manager._buildRegionSpawnRequest({ classification: toolClassification(), point: { x: 0, y: 0 } })
  );

  assert.equal(result, null);
  assert.equal(log.regionPayloads.length, 1);
  assert.equal(log.tilePayloads.length, 0);
  assert.deepEqual(log.deletedRegions, ['region-1']);
  assert.deepEqual(log.warnings, ['FABRICATE.Canvas.Interactable.SpawnFailed']);
});

runtimeTest('a failed Region aborts before any Tile is attempted', async () => {
  const log = installRuntime({ failRegion: true });
  const manager = new InteractableManager();

  const result = await manager._spawnInteractableRegion(
    manager._buildRegionSpawnRequest({ classification: toolClassification(), point: { x: 0, y: 0 } })
  );

  assert.equal(result, null);
  assert.equal(log.tilePayloads.length, 0);
  assert.deepEqual(log.warnings, ['FABRICATE.Canvas.Interactable.SpawnFailed']);
});

runtimeTest('a null spawn request and a scene that cannot create documents both no-op', async () => {
  const log = installRuntime();
  const manager = new InteractableManager();
  assert.equal(await manager._spawnInteractableRegion(null), null);
  globalThis.canvas.scene = { id: 'scene-1' };
  assert.equal(
    await manager._spawnInteractableRegion(
      manager._buildRegionSpawnRequest({
        classification: toolClassification(),
        point: { x: 0, y: 0 },
      })
    ),
    null
  );
  assert.deepEqual(log.warnings, []);
});

runtimeTest('a tool drop suppresses Foundry and spawns; a foreign drop is left alone', async () => {
  const log = installRuntime();
  const manager = new InteractableManager();

  assert.equal(
    manager._onDrop(globalThis.canvas, {
      fabricate: { interactableType: 'tool', systemId: 'sysA', toolId: 'tool-1' },
      x: 150,
      y: 250,
    }),
    false
  );
  assert.equal(manager._onDrop(globalThis.canvas, { type: 'Item', uuid: 'Item.unknown' }), undefined);
  await settle();

  assert.equal(log.regionPayloads.length, 1);
  assert.equal(log.tilePayloads.length, 1);
});

runtimeTest('a non-GM drop is recognized, warned and spawns nothing', async () => {
  const log = installRuntime({ isGM: false });
  const manager = new InteractableManager();

  assert.equal(
    manager._onDrop(globalThis.canvas, {
      fabricate: { interactableType: 'tool', systemId: 'sysA', toolId: 'tool-1' },
      x: 5,
      y: 5,
    }),
    false
  );
  await settle();

  assert.equal(log.regionPayloads.length, 0);
  assert.deepEqual(log.warnings, ['FABRICATE.Canvas.Interactable.GMOnlySpawn']);
});

runtimeTest('a single region hit wins the environment and notifies', async () => {
  const log = installRuntime({
    environments: [{ id: 'env-cave', craftingSystemId: 'sysA', name: 'Cave' }],
  });
  const manager = new InteractableManager({
    regionEnvironmentIdsAtPoint: () => ['env-cave'],
    promptDropEnvironment: async () => {
      throw new Error('the dialog must not open on a single region hit');
    },
  });

  await manager._spawnGatheringTask({
    classification: taskClassification(),
    point: { x: 5, y: 6 },
    forceDialog: false,
  });

  assert.equal(log.regionPayloads[0].behaviors[0].system.environmentId, 'env-cave');
  assert.deepEqual(log.infos, ['FABRICATE.Canvas.Interactable.EnvironmentAutoResolved']);
});

runtimeTest('a cancelled environment dialog aborts the gathering-task spawn', async () => {
  const log = installRuntime({
    environments: [{ id: 'env-cave', craftingSystemId: 'sysA', name: 'Cave' }],
  });
  const manager = new InteractableManager({
    regionEnvironmentIdsAtPoint: () => [],
    promptDropEnvironment: async () => null,
  });

  const result = await manager._spawnGatheringTask({
    classification: taskClassification(),
    point: { x: 7, y: 8 },
    forceDialog: true,
  });

  assert.equal(result, null);
  assert.equal(log.regionPayloads.length, 0);
});

runtimeTest('the dialog choice reaches the spawn, and only this system’s environments are offered', async () => {
  const log = installRuntime({
    environments: [
      { id: 'env-cave', craftingSystemId: 'sysA', name: 'Cave' },
      { id: 'env-other', craftingSystemId: 'sysB', name: 'Elsewhere' },
    ],
  });
  const offered = [];
  const manager = new InteractableManager({
    regionEnvironmentIdsAtPoint: () => [],
    promptDropEnvironment: async (args) => {
      offered.push(args);
      return 'env-cave';
    },
  });

  await manager._spawnGatheringTask({
    classification: taskClassification(),
    point: { x: 1, y: 2 },
    forceDialog: true,
  });

  assert.deepEqual(offered[0].environments, [{ id: 'env-cave', name: 'Cave' }]);
  assert.equal(offered[0].localize('missing.key', 'fallback'), 'missing.key');
  assert.equal(log.regionPayloads[0].behaviors[0].system.environmentId, 'env-cave');
  assert.deepEqual(log.infos, []);
});

runtimeTest('the enter prompt carries exactly behaviorRef, name, promptText and onInteract', () => {
  const { manager, prompts } = promptFixture();
  globalThis.game.user = { ...PLAYER };
  const forwarded = [];
  manager._requestActivation = (behavior, ctx) => forwarded.push({ behavior, ctx });
  const behavior = placedBehavior({ system: toolSystem() });

  manager.onRegionEnter(
    {
      user: globalThis.game.user,
      data: { token: { isOwner: true, actorId: 'player-actor', document: { isOwner: true } } },
    },
    behavior
  );

  assert.equal(prompts.length, 1);
  assert.deepEqual([...Object.keys(prompts[0])].sort(), [
    'behaviorRef',
    'name',
    'onInteract',
    'promptText',
  ]);
  assert.equal(prompts[0].behaviorRef, 'scene-1.region-1.beh-1');
  assert.equal(prompts[0].name, 'Forge Anvil');
  assert.equal(prompts[0].promptText, 'Use the forge');

  prompts[0].onInteract();
  assert.equal(forwarded.length, 1);
  assert.equal(forwarded[0].behavior, behavior);
  assert.deepEqual(forwarded[0].ctx, {
    actorId: 'player-actor',
    userId: 'u-1',
    activationSource: 'regionEnter',
  });
});

runtimeTest('the enter prompt is gated by mover-or-owner and then by concealment', () => {
  const { manager, prompts } = promptFixture();
  const other = { id: 'u-2', isGM: false };
  const owned = { document: { isOwner: true, actor: { id: 'actor-1' }, actorId: 'actor-1' } };
  const foreign = { document: { isOwner: false, actor: { id: 'actor-9' }, actorId: 'actor-9' } };

  globalThis.game.user = { ...GM };
  assert.equal(manager._shouldPromptForEnter({ user: globalThis.game.user }, foreign), true);
  assert.equal(manager._shouldPromptForEnter({ user: other }, owned), false);
  manager.onRegionEnter({ user: other, data: { token: owned } }, placedBehavior({ system: toolSystem() }));
  assert.equal(prompts.length, 0, 'currentUser is re-read per call: this client is now a GM');
  globalThis.game.user = { ...PLAYER };
  assert.equal(manager._shouldPromptForEnter({ user: globalThis.game.user }, owned), true);
  assert.equal(manager._shouldPromptForEnter({ user: other }, owned), true);
  assert.equal(manager._shouldPromptForEnter({ user: other }, foreign), false);

  const event = { user: globalThis.game.user, data: { token: owned } };
  manager.onRegionEnter(event, placedBehavior({ system: toolSystem() }));
  assert.equal(prompts.length, 1, 'a visible interactable prompts');

  const locked = toolSystem();
  locked.state.locked = true;
  manager.onRegionEnter(event, placedBehavior({ system: locked }));
  assert.equal(prompts.length, 2, 'a LOCKED interactable still prompts');

  const disabled = toolSystem();
  disabled.state.enabled = false;
  manager.onRegionEnter(event, placedBehavior({ system: disabled }));
  const hidden = toolSystem();
  hidden.presentation.hidden = true;
  manager.onRegionEnter(event, placedBehavior({ system: hidden }));
  manager.onRegionEnter(event, placedBehavior({ system: toolSystem({ sourceUuid: '' }) }));
  assert.equal(prompts.length, 2, 'disabled, hidden and unconfigured all suppress');

  manager.onRegionEnter({ user: other, data: { token: foreign } }, placedBehavior({ system: toolSystem() }));
  assert.equal(prompts.length, 2, 'a non-owner non-mover sees nothing');
});

runtimeTest('a foreign behaviour and an unidentifiable one raise no prompt', () => {
  const { manager, prompts } = promptFixture();
  globalThis.game.user = { ...PLAYER };
  const event = {
    user: globalThis.game.user,
    data: { token: { document: { isOwner: true, actorId: 'actor-1' } } },
  };

  manager.onRegionEnter(event, { id: 'beh-1', type: 'not.fabricate', system: toolSystem() });
  manager.onRegionEnter(event, { id: 'beh-1', type: 'fabricate.interactable', system: toolSystem() });
  assert.equal(prompts.length, 0);
});

runtimeTest('region exit dismisses by ref unconditionally', () => {
  const { manager, dismissals } = promptFixture();
  globalThis.game.user = { ...PLAYER };

  manager.onRegionExit(
    { user: { id: 'u-2' }, data: { token: { document: { isOwner: false } } } },
    placedBehavior({ system: toolSystem() })
  );
  manager.onRegionExit({}, { id: 'beh-1', type: 'fabricate.interactable' });

  assert.deepEqual(dismissals, ['scene-1.region-1.beh-1']);
});

runtimeTest('controlling a token inside a region re-raises one prompt, for owned tokens only', () => {
  const { manager, prompts } = promptFixture();
  globalThis.game.user = { ...PLAYER };
  const forwarded = [];
  manager._requestActivation = (_behavior, ctx) => forwarded.push(ctx);
  const scene = { id: 'scene-1', tokens: { contents: [] } };
  const region = { id: 'region-1', parent: scene, testPoint: () => true };
  const behavior = {
    id: 'beh-1',
    type: 'fabricate.interactable',
    system: toolSystem(),
    parent: region,
  };
  region.behaviors = { contents: [behavior] };
  scene.regions = { contents: [region] };
  globalThis.canvas.scene = scene;
  const owned = { center: { x: 10, y: 10 }, document: { isOwner: true, actorId: 'actor-1' } };
  const foreign = { center: { x: 10, y: 10 }, document: { isOwner: false, actorId: 'actor-9' } };

  manager._onControlToken(owned, false);
  assert.equal(prompts.length, 0, 'deselection raises nothing');
  manager._onControlToken(foreign, true);
  assert.equal(prompts.length, 0, 'an unowned token raises nothing');
  manager._onControlToken(owned, true);

  assert.equal(prompts.length, 1);
  assert.deepEqual([...Object.keys(prompts[0])].sort(), [
    'behaviorRef',
    'name',
    'onInteract',
    'promptText',
  ]);
  assert.equal(prompts[0].behaviorRef, 'scene-1.region-1.beh-1');
  prompts[0].onInteract();
  assert.deepEqual(forwarded, [
    { actorId: 'actor-1', userId: 'u-1', activationSource: 'regionEnter' },
  ]);

  globalThis.canvas.tokens = { controlled: [owned] };
  manager._interactHere();
  assert.equal(prompts.length, 2, 'the keybinding drives the same path');
});

runtimeTest('the active GM validates locally; a player emits; with no GM online it warns', () => {
  const log = installRuntime({ isGM: true });
  const manager = new InteractableManager();
  const granted = [];
  manager.validateAndGrant = (request) => granted.push(request);

  manager._requestActivation(placedBehavior({ system: toolSystem() }), {
    actorId: 'a1',
    userId: 'gm-1',
    activationSource: 'regionEnter',
  });

  assert.equal(granted.length, 1);
  assert.equal(granted[0].action, 'interactableActivate');
  assert.equal(granted[0].behaviorId, 'beh-1');
  assert.equal(granted[0].sceneId, 'scene-1');
  assert.equal(granted[0].userId, 'gm-1');
  assert.equal(granted[0].sourceUuid, 'Fabricate.sysA.tool.tool-1');
  assert.equal(log.emits.length, 0);

  globalThis.game.user = { ...PLAYER };
  globalThis.game.users = { activeGM: { ...GM }, get: () => null };
  manager._requestActivation(placedBehavior({ system: toolSystem() }), { actorId: 'a1' });
  assert.equal(log.emits.length, 1);
  assert.equal(log.emits[0].channel, 'module.fabricate');
  assert.equal(log.emits[0].argc, 2, 'emit forwards exactly two arguments');
  assert.equal(log.emits[0].payload.action, 'interactableActivate');
  assert.equal(log.emits[0].payload.userId, 'u-1', 'the userId defaults to this client');
  assert.equal(log.emits[0].payload.activationSource, 'regionEnter');

  globalThis.game.users = { activeGM: null, get: () => null };
  manager._requestActivation(placedBehavior({ system: toolSystem() }), { actorId: 'a1' });
  assert.equal(log.emits.length, 1);
  assert.deepEqual(log.warnings, ['FABRICATE.Canvas.Interactable.NoActiveGM']);

  manager._requestActivation({ id: 'beh-1', type: 'not.fabricate' }, {});
  assert.equal(granted.length, 1, 'a non-interactable behaviour requests nothing');
});

runtimeTest('a granted tool request emits the full grant payload to the requesting player', async () => {
  const { manager, log, request } = grantFixture();

  assert.equal(await manager.validateAndGrant(request), true);

  assert.equal(log.emits.length, 1);
  assert.equal(log.emits[0].argc, 2);
  assert.deepEqual(log.emits[0].payload, {
    action: 'interactableActivationGranted',
    userId: 'u-1',
    behaviorId: 'beh-1',
    requestId: '7',
    grant: {
      tab: 'crafting',
      context: {
        activeCanvasTool: {
          componentId: 'comp-axe',
          systemId: 'sysA',
          toolId: 'tool-1',
          label: 'Forge Anvil',
        },
      },
      ref: { sceneId: 'scene-1', regionId: 'region-1', behaviorId: 'beh-1' },
      interactableType: 'tool',
      environmentId: null,
      taskId: null,
      actorId: 'a1',
    },
  });
});

runtimeTest('a GM requesting for themselves opens locally and emits nothing', async () => {
  const { manager, log, opened, request } = grantFixture({ requesterId: 'gm-1' });

  assert.equal(await manager.validateAndGrant(request), true);

  assert.equal(log.emits.length, 0);
  assert.equal(opened.length, 1);
  assert.equal(opened[0].tab, 'crafting');
  assert.equal(opened[0].options.actorId, 'a1');
});

runtimeTest('a request with no resolvable behaviour is denied generically', async () => {
  const { manager, log, request } = grantFixture();
  globalThis.game.scenes = { get: () => null };

  assert.equal(await manager.validateAndGrant(request), false);
  assert.equal(await manager.validateAndGrant(null), false);

  assert.deepEqual(payloadsOfAction(log, 'interactableActivationDenied'), [
    { action: 'interactableActivationDenied', userId: 'u-1', reason: null },
  ]);
});

runtimeTest('a requester who cannot control the named actor is denied over the socket', async () => {
  const { manager, log, opened, request } = grantFixture({ canControlActor: false });

  assert.equal(await manager.validateAndGrant(request), false);

  assert.equal(opened.length, 0);
  assert.equal(payloadsOfAction(log, 'interactableActivationGranted').length, 0);
  assert.deepEqual(payloadsOfAction(log, 'interactableActivationDenied'), [
    { action: 'interactableActivationDenied', userId: 'u-1', reason: 'CANNOT_CONTROL_ACTOR' },
  ]);
});

runtimeTest('a locked interactable denies the GM requester locally, with no socket emit', async () => {
  const locked = toolSystem();
  locked.state.locked = true;
  const { manager, log, request } = grantFixture({ system: locked, requesterId: 'gm-1' });

  assert.equal(await manager.validateAndGrant(request), false);

  assert.equal(log.emits.length, 0);
  assert.deepEqual(log.warnings, ['FABRICATE.Canvas.Interactable.Denied.Locked']);
});

runtimeTest('containment admits when no token is found or any token is inside, and denies otherwise', async () => {
  const absent = grantFixture({ tokens: [tokenDoc({ actorId: 'someone-else', insideRegion: false })] });
  assert.equal(await absent.manager.validateAndGrant(absent.request), true);
  assert.equal(
    absent.manager._tokenInsideRegion(absent.behavior, 'a1'),
    true,
    'cannot locate ⇒ do not block'
  );

  const anyInside = grantFixture({
    tokens: [
      tokenDoc({ actorId: 'a1', insideRegion: false }),
      tokenDoc({ actorId: 'a1', insideRegion: true }),
    ],
  });
  assert.equal(anyInside.manager._tokenInsideRegion(anyInside.behavior, 'a1'), true);
  assert.equal(await anyInside.manager.validateAndGrant(anyInside.request), true);

  const outside = grantFixture({ tokens: [tokenDoc({ actorId: 'a1', insideRegion: false })] });
  assert.equal(outside.manager._tokenInsideRegion(outside.behavior, 'a1'), false);
  assert.equal(await outside.manager.validateAndGrant(outside.request), false);
  assert.deepEqual(payloadsOfAction(outside.log, 'interactableActivationDenied'), [
    { action: 'interactableActivationDenied', userId: 'u-1', reason: 'TOKEN_NOT_INSIDE' },
  ]);
});

runtimeTest('a source that no longer resolves is denied SOURCE_MISSING', async () => {
  const { manager, log, request } = grantFixture({
    system: toolSystem({ sourceUuid: 'Fabricate.sysA.tool.gone' }),
  });

  assert.equal(await manager.validateAndGrant(request), false);
  assert.deepEqual(payloadsOfAction(log, 'interactableActivationDenied'), [
    { action: 'interactableActivationDenied', userId: 'u-1', reason: 'SOURCE_MISSING' },
  ]);
});

runtimeTest('a gathering task is denied ENVIRONMENT_MISSING only when its own environment is gone', async () => {
  const missing = grantFixture({ system: taskSystem() });
  assert.equal(await missing.manager.validateAndGrant(missing.request), false);
  assert.deepEqual(payloadsOfAction(missing.log, 'interactableActivationDenied'), [
    { action: 'interactableActivationDenied', userId: 'u-1', reason: 'ENVIRONMENT_MISSING' },
  ]);

  const present = grantFixture({
    system: taskSystem(),
    environments: [{ id: 'env-forest', craftingSystemId: 'sysA', name: 'Forest' }],
  });
  assert.equal(await present.manager.validateAndGrant(present.request), true);
  const granted = payloadsOfAction(present.log, 'interactableActivationGranted')[0];
  assert.equal(granted.grant.tab, 'gathering');
  assert.equal(granted.grant.environmentId, 'env-forest');
  assert.equal(granted.grant.taskId, 'task-9');

  const tool = grantFixture({ system: toolSystem({ environmentId: 'env-gone' }) });
  assert.equal(
    await tool.manager.validateAndGrant(tool.request),
    true,
    'the environment check is gathering-task only'
  );
});

runtimeTest('a cooling-down interactable is denied against world time, not wall-clock time', async () => {
  const cooling = toolSystem();
  cooling.state.cooldown = { seconds: 60, lastUsedWorldTime: 100 };
  const inside = grantFixture({ system: cooling, worldTime: 120 });
  assert.equal(await inside.manager.validateAndGrant(inside.request), false);
  assert.deepEqual(payloadsOfAction(inside.log, 'interactableActivationDenied'), [
    { action: 'interactableActivationDenied', userId: 'u-1', reason: 'COOLDOWN' },
  ]);

  const elapsed = grantFixture({ system: cooling, worldTime: 200 });
  assert.equal(await elapsed.manager.validateAndGrant(elapsed.request), true);
});

runtimeTest('a type mismatch and an unconfigured sentinel are denied with their own reasons', async () => {
  const mismatch = grantFixture({ system: taskSystem() });
  mismatch.request.interactableType = 'tool';
  assert.equal(await mismatch.manager.validateAndGrant(mismatch.request), false);
  assert.equal(
    payloadsOfAction(mismatch.log, 'interactableActivationDenied')[0].reason,
    'TYPE_MISMATCH'
  );

  const unconfigured = grantFixture({ system: toolSystem({ toolId: null }) });
  assert.equal(await unconfigured.manager.validateAndGrant(unconfigured.request), false);
  assert.equal(
    payloadsOfAction(unconfigured.log, 'interactableActivationDenied')[0].reason,
    'UNCONFIGURED'
  );
});

runtimeTest('a denial message maps to its key, and an unknown reason to the generic one', () => {
  const log = installRuntime({ isGM: false });
  const manager = new InteractableManager();

  manager.notifyActivationDenied('LOCKED');
  manager.notifyActivationDenied('totally-unknown');
  manager.notifyActivationDenied(null);

  assert.deepEqual(log.warnings, [
    'FABRICATE.Canvas.Interactable.Denied.Locked',
    'FABRICATE.Canvas.Interactable.Denied.Generic',
    'FABRICATE.Canvas.Interactable.Denied.Generic',
  ]);
});

runtimeTest('openGrant opens crafting for a tool and gathering for a task, and refuses the rest', () => {
  installRuntime({ isGM: false });
  const opened = [];
  const manager = new InteractableManager({
    getAppClass: () => ({ show: (tab, options) => opened.push({ tab, options }) }),
  });
  const activeCanvasTool = { componentId: 'comp-axe', systemId: 'sysA', toolId: 'tool-1', label: 'Forge Anvil' };

  manager.openGrant({ grant: { tab: 'crafting', interactableType: 'tool', actorId: 'actor-7', context: { activeCanvasTool } } });
  assert.equal(opened[0].tab, 'crafting');
  assert.deepEqual(opened[0].options, { activeCanvasTool, actorId: 'actor-7' });

  manager.openGrant({
    grant: {
      tab: 'gathering',
      interactableType: 'gatheringTask',
      environmentId: 'env-1',
      taskId: 'task-9',
      actorId: 'actor-7',
      ref: { ...REF },
    },
  });
  assert.equal(opened[1].tab, 'gathering');
  assert.equal(opened[1].options.environmentId, 'env-1');
  assert.equal(opened[1].options.taskId, 'task-9');
  assert.equal(opened[1].options.actorId, 'actor-7');
  assert.deepEqual(opened[1].options.interactableRef, { ...REF });
  assert.equal(typeof opened[1].options.onClose, 'function');
  assert.equal('nodeStateOverride' in opened[1].options, false);

  manager.openGrant(null);
  manager.openGrant({ grant: { interactableType: 'tool', context: {} } });
  manager.openGrant({ grant: { interactableType: 'gatheringTask', taskId: 'task-9' } });
  manager.openGrant({ grant: { interactableType: 'unknown' } });
  assert.equal(opened.length, 2);
});

runtimeTest('openGrant is inert when no app class is available', () => {
  installRuntime({ isGM: false });
  const manager = new InteractableManager({ getAppClass: () => null });
  assert.doesNotThrow(() => manager.openGrant({ grant: { interactableType: 'tool', context: {} } }));
});

runtimeTest('closing a gathering session re-prompts only for an owned token still inside the viewed scene', () => {
  const inside = repromptFixture({ regionContains: true });
  inside.manager.openGrant({
    grant: {
      tab: 'gathering',
      interactableType: 'gatheringTask',
      environmentId: 'env-1',
      taskId: 'task-9',
      actorId: 'actor-1',
      ref: { ...REF },
    },
  });
  assert.equal(inside.prompts.length, 0);
  inside.opened[0].options.onClose();
  assert.equal(inside.prompts.length, 1);
  assert.equal(inside.prompts[0].behaviorRef, 'scene-1.region-1.beh-1');
  assert.equal(inside.prompts[0].name, 'Forge Anvil');

  const left = repromptFixture({ regionContains: false });
  left.manager._repromptAfterInteractableClose({ ref: { ...REF }, actorId: 'actor-1' });
  assert.equal(left.prompts.length, 0);

  const gone = repromptFixture({ tokenPresent: false });
  gone.manager._repromptAfterInteractableClose({ ref: { ...REF }, actorId: 'actor-1' });
  assert.equal(gone.prompts.length, 0);

  const unowned = repromptFixture({ isOwner: false });
  unowned.manager._repromptAfterInteractableClose({ ref: { ...REF }, actorId: 'actor-1' });
  assert.equal(unowned.prompts.length, 0);

  const elsewhere = repromptFixture({ regionContains: true });
  globalThis.canvas.scene = { id: 'scene-OTHER', tokens: { contents: [] } };
  elsewhere.manager._repromptAfterInteractableClose({ ref: { ...REF }, actorId: 'actor-1' });
  assert.equal(elsewhere.prompts.length, 0);
});

runtimeTest('the close re-prompt delegates to the shared prompt path and never throws', () => {
  const { manager, placeableDoc } = repromptFixture({ regionContains: true });
  const delegated = [];
  manager._promptForTokenInsideRegion = (placeable) => delegated.push(placeable);

  manager._repromptAfterInteractableClose({ ref: { ...REF }, actorId: 'actor-1' });
  assert.deepEqual(delegated, [placeableDoc.object]);

  assert.doesNotThrow(() => manager._repromptAfterInteractableClose());
  assert.doesNotThrow(() => manager._repromptAfterInteractableClose({}));
  assert.doesNotThrow(() => manager._repromptAfterInteractableClose({ ref: null, actorId: 'a' }));
  assert.doesNotThrow(() =>
    manager._repromptAfterInteractableClose({ ref: { sceneId: 'scene-1' }, actorId: null })
  );
  assert.equal(delegated.length, 1);
});

runtimeTest('the view centre prefers the PIXI stage and falls back to the scene midpoint', () => {
  installRuntime();
  const manager = new InteractableManager();
  const submitted = [];

  globalThis.canvas.scene.dimensions = { width: 4000, height: 3000 };
  assert.deepEqual(manager._viewCenter(), { x: 2000, y: 1500 });

  globalThis.canvas.scene = { id: 'scene-1' };
  globalThis.canvas.dimensions = { width: 800, height: 600 };
  assert.deepEqual(manager._viewCenter(), { x: 400, y: 300 });

  globalThis.canvas.dimensions = null;
  assert.deepEqual(manager._viewCenter(), { x: 0, y: 0 });

  globalThis.PIXI = {
    Point: class {
      constructor(x, y) {
        this.x = x;
        this.y = y;
      }
    },
  };
  globalThis.window = { innerWidth: 800, innerHeight: 600 };
  globalThis.canvas.stage = {
    toLocal(point) {
      submitted.push({ x: point.x, y: point.y, self: this });
      return { x: point.x * 2, y: point.y * 3 };
    },
  };
  assert.deepEqual(manager._viewCenter(), { x: 800, y: 900 });
  assert.deepEqual(
    { x: submitted[0].x, y: submitted[0].y },
    { x: 400, y: 300 },
    'the screen centre is submitted in screen space'
  );
  assert.equal(submitted[0].self, globalThis.canvas.stage, 'toLocal keeps its receiver');

  globalThis.canvas.stage = {
    toLocal: () => {
      throw new Error('stage exploded');
    },
  };
  globalThis.canvas.scene = { id: 'scene-1', dimensions: { width: 100, height: 200 } };
  assert.deepEqual(manager._viewCenter(), { x: 50, y: 100 }, 'a throwing stage falls back');

  globalThis.canvas.stage = { toLocal: () => ({ x: Number.NaN, y: 0 }) };
  assert.deepEqual(manager._viewCenter(), { x: 50, y: 100 }, 'a non-finite point falls back');

  delete globalThis.PIXI;
  assert.deepEqual(manager._viewCenter(), { x: 50, y: 100 }, 'no PIXI falls back');
});

runtimeTest('the grid size reads scene grid, canvas grid then dimensions, and falls back to 100', () => {
  installRuntime({ gridSize: 70 });
  const manager = new InteractableManager();

  assert.equal(manager._gridSize(), 70);

  globalThis.canvas.grid = { size: 60 };
  globalThis.canvas.dimensions = { size: 55 };
  assert.equal(manager._gridSize(), 70, 'the scene grid outranks the canvas grid and dimensions');

  globalThis.canvas.grid = { size: 60 };
  globalThis.canvas.dimensions = { size: 55 };
  globalThis.canvas.scene = { id: 'scene-1' };
  assert.equal(manager._gridSize(), 60);

  globalThis.canvas.grid = null;
  assert.equal(manager._gridSize(), 55);

  globalThis.canvas.dimensions = null;
  assert.equal(manager._gridSize(), 100);

  globalThis.canvas.scene = { id: 'scene-1', grid: { size: 0 } };
  assert.equal(manager._gridSize(), 100, 'a zero grid is refused by the > 0 guard');

  globalThis.canvas.scene = { id: 'scene-1', grid: { size: 'wide' } };
  assert.equal(manager._gridSize(), 100);

  delete globalThis.canvas;
  assert.equal(manager._gridSize(), 100);
});

runtimeTest('register binds the two canvas hooks once and registers the keybinding when it can', () => {
  const bound = [];
  const keybindings = [];
  globalThis.Hooks = { on: (hook, handler) => bound.push({ hook, handler }) };
  globalThis.game = {
    keybindings: { register: (namespace, id, definition) => keybindings.push({ namespace, id, definition }) },
  };
  const manager = new InteractableManager();

  manager.register();
  manager.register();

  assert.deepEqual(
    bound.map((entry) => entry.hook).sort(),
    ['controlToken', 'dropCanvasData']
  );
  assert.equal(manager._registered, true);
  assert.equal(manager._tokenInsideRegion.length, 3, 'the spec-cited three-parameter signature');
  assert.equal(keybindings.length, 1);
  assert.equal(keybindings[0].namespace, 'fabricate');
  assert.equal(keybindings[0].id, 'fabricateInteractHere');
  assert.deepEqual(keybindings[0].definition.editable, [{ key: 'KeyE' }]);
  assert.equal(keybindings[0].definition.restricted, false);
  assert.equal(keybindings[0].definition.name, 'FABRICATE.Canvas.Interactable.Keybinding.Name');
  assert.equal(keybindings[0].definition.hint, 'FABRICATE.Canvas.Interactable.Keybinding.Hint');

  globalThis.canvas = { tokens: { controlled: [] } };
  assert.equal(keybindings[0].definition.onDown(), true);
});

runtimeTest('register tolerates a missing hooks API and a throwing keybinding registration', () => {
  globalThis.game = {
    keybindings: {
      register: () => {
        throw new Error('bindings already initialized');
      },
    },
  };
  delete globalThis.Hooks;
  const manager = new InteractableManager();

  assert.doesNotThrow(() => manager.register());
  assert.equal(manager._registered, true);
});
