/**
 * Unit coverage for the region-first `InteractableManager` seams (Phase 1c).
 *
 * The PURE routing logic (classification, region-spawn shaping, activation
 * eligibility/validation) is covered in `interactable-resolution.test.js` and
 * `tests/canvas/regions/*`. This suite exercises the thin Foundry edge:
 *   - register() now binds ONLY `dropCanvasData` + `controlToken` (the abandoned
 *     tile-click stage listener / hover+permission wraps / drawTile enablement
 *     are gone);
 *   - the dropCanvasData SUPPRESSION CONTRACT + GM gate;
 *   - the transaction-like Region + linked-Tile spawn (and orphan rollback);
 *   - the activation round-trip orchestration (onRegionEnter prompt gate,
 *     validateAndGrant, openGrant) via injected app/prompt seams.
 *
 * The manager reads its collaborators through `globalThis` fakes (`game`,
 * `Hooks`, `canvas`, `foundry.documents.TileDocument`, `ui.notifications`).
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { InteractableManager } from '../../src/canvas/InteractableManager.js';

const GLOBAL_KEYS = ['game', 'Hooks', 'canvas', 'foundry', 'CONFIG', 'ui'];

async function flushAsync(turns = 8) {
  for (let i = 0; i < turns; i++) await Promise.resolve();
}

function snapshotGlobals() {
  const saved = {};
  for (const key of GLOBAL_KEYS) saved[key] = globalThis[key];
  return saved;
}

function restoreGlobals(saved) {
  for (const key of GLOBAL_KEYS) {
    if (saved[key] === undefined) delete globalThis[key];
    else globalThis[key] = saved[key];
  }
}

/**
 * A coherent fake Foundry runtime that records created Region + Tile documents
 * and notifications. The created Region exposes a `behaviors` collection holding
 * the nested `fabricate.interactable` behaviour (so the manager can write the
 * linked-visual ref back). Region/Tile create may be forced to fail to exercise
 * the transaction-like rollback.
 */
function installFakeFoundry({
  isGM = true,
  tools = [{ id: 'tool-1' }],
  components = [],
  tasks = [{ id: 'task-9' }],
  failTile = false,
  failRegion = false
} = {}) {
  const createdRegions = [];
  const regionPayloads = [];
  const createdTiles = [];
  const deletedRegions = [];
  const warnings = [];
  const infos = [];
  const behaviorUpdates = [];

  const makeBehavior = (system) => {
    const behavior = {
      id: 'beh-1',
      type: 'fabricate.interactable',
      system,
      async update(update) { behaviorUpdates.push(update); Object.assign(behavior.system, update.system ?? {}); }
    };
    return behavior;
  };

  const user = { id: 'gm-1', isGM };
  globalThis.game = {
    user,
    // When this client is the GM, it is also the active GM (same object so the
    // `game.user === game.users.activeGM` identity gate passes).
    users: { activeGM: isGM ? user : { id: 'gm-other' }, get: () => user },
    time: { worldTime: 0, calendar: null },
    socket: { emit: () => {} },
    i18n: { localize: (key) => key, format: (key) => key },
    fabricate: {
      getCraftingSystemManager: () => ({
        getSystem: (systemId) => (systemId === 'sysA' ? { tools, components } : null)
      })
    },
    settings: { get: () => ({ systems: { sysA: { tasks } } }) }
  };

  globalThis.ui = {
    notifications: { warn: (msg) => warnings.push(msg), info: (msg) => infos.push(msg) }
  };

  globalThis.canvas = {
    scene: {
      id: 'scene-1',
      grid: { size: 100 },
      async createEmbeddedDocuments(type, payloads) {
        if (type === 'Region') {
          if (failRegion) return [];
          const data = payloads[0];
          regionPayloads.push(data);
          const behavior = makeBehavior(data.behaviors?.[0]?.system ?? {});
          const region = {
            id: 'region-1',
            uuid: 'Scene.scene-1.Region.region-1',
            ...data,
            behaviors: { contents: [behavior] },
            async delete() { deletedRegions.push(region.id); }
          };
          createdRegions.push(region);
          return [region];
        }
        if (type === 'Tile') {
          if (failTile) throw new Error('tile create failed');
          const tile = { id: 'tile-1', uuid: 'Scene.scene-1.Tile.tile-1', ...payloads[0] };
          createdTiles.push(tile);
          return [tile];
        }
        return [];
      }
    },
    tiles: { placeables: [] }
  };

  globalThis.foundry = {
    documents: {
      TileDocument: {
        create: async (data, ctx) => {
          if (failTile) throw new Error('tile create failed');
          const tile = { id: 'tile-1', uuid: 'Scene.scene-1.Tile.tile-1', ...data, _ctx: ctx };
          createdTiles.push(tile);
          return tile;
        }
      }
    }
  };

  return { createdRegions, regionPayloads, createdTiles, deletedRegions, warnings, infos, behaviorUpdates };
}

const TOOL_DROP = { fabricate: { interactableType: 'tool', systemId: 'sysA', toolId: 'tool-1' } };
const TASK_DROP = { fabricate: { interactableType: 'gatheringTask', systemId: 'sysA', taskId: 'task-9' } };
const FOREIGN_DROP = { type: 'Item', uuid: 'Item.unknown' };

// --- register() seam set ----------------------------------------------------

test('register() binds ONLY dropCanvasData + controlToken, once', () => {
  const saved = snapshotGlobals();
  try {
    const registrations = [];
    globalThis.Hooks = { on: (hook, fn) => registrations.push({ hook, fn }) };
    // No keybindings API ⇒ the keybinding registration is a no-op.
    globalThis.game = {};

    const manager = new InteractableManager();
    manager.register();
    manager.register();

    const hooks = registrations.map(r => r.hook).sort();
    assert.deepEqual(hooks, ['controlToken', 'dropCanvasData'], 'only the region-first hooks are bound');
    assert.equal(registrations.length, 2, 'each hook is bound only once');
    assert.equal(manager._registered, true);
  } finally {
    restoreGlobals(saved);
  }
});

test('register() registers the "interact here" client keybinding when the API exists', () => {
  const saved = snapshotGlobals();
  try {
    const registrations = [];
    const keybindings = [];
    globalThis.Hooks = { on: () => {} };
    globalThis.game = {
      keybindings: { register: (ns, id, def) => keybindings.push({ ns, id, def }) }
    };
    void registrations;

    new InteractableManager().register();

    assert.equal(keybindings.length, 1);
    assert.equal(keybindings[0].ns, 'fabricate');
    assert.equal(keybindings[0].id, 'fabricateInteractHere');
    assert.equal(typeof keybindings[0].def.onDown, 'function');
  } finally {
    restoreGlobals(saved);
  }
});

// --- _onDrop SUPPRESSION CONTRACT + GM gate ---------------------------------

test('_onDrop returns false (suppresses Foundry) for a Fabricate Tool drop', async () => {
  const saved = snapshotGlobals();
  try {
    installFakeFoundry({ isGM: true });
    const manager = new InteractableManager();
    const result = manager._onDrop(globalThis.canvas, { ...TOOL_DROP, x: 100, y: 200 });
    assert.equal(result, false);
    await flushAsync();
  } finally {
    restoreGlobals(saved);
  }
});

test('_onDrop returns undefined (lets Foundry handle) for a non-Fabricate drop', () => {
  const saved = snapshotGlobals();
  try {
    installFakeFoundry({ isGM: true });
    const manager = new InteractableManager();
    assert.equal(manager._onDrop(globalThis.canvas, FOREIGN_DROP), undefined);
  } finally {
    restoreGlobals(saved);
  }
});

test('_onDrop GM-gate: a non-GM is suppressed, warned, and spawns nothing', async () => {
  const saved = snapshotGlobals();
  try {
    const { createdRegions, warnings } = installFakeFoundry({ isGM: false });
    const manager = new InteractableManager();
    const result = manager._onDrop(globalThis.canvas, { ...TOOL_DROP, x: 5, y: 5 });
    assert.equal(result, false);
    await flushAsync();
    assert.equal(createdRegions.length, 0);
    assert.deepEqual(warnings, ['FABRICATE.Canvas.Interactable.GMOnlySpawn']);
  } finally {
    restoreGlobals(saved);
  }
});

// --- transaction-like Region + linked Tile spawn ----------------------------

test('_spawnInteractableRegion creates a Region (with nested behaviour) + linked Tile and writes the ref back', async () => {
  const saved = snapshotGlobals();
  try {
    const { createdRegions, regionPayloads, createdTiles, behaviorUpdates } = installFakeFoundry({
      isGM: true,
      tools: [{ id: 'tool-1', componentId: 'comp-axe', label: 'Forge Anvil' }],
      components: [{ id: 'comp-axe', img: 'icons/tools/axe.webp' }]
    });
    const manager = new InteractableManager();

    const classification = {
      interactableType: 'tool',
      systemId: 'sysA',
      referenceId: 'tool-1',
      sourceUuid: 'Fabricate.sysA.tool.tool-1',
      entry: { id: 'tool-1', componentId: 'comp-axe', label: 'Forge Anvil' }
    };
    const spawnRequest = manager._buildRegionSpawnRequest({ classification, point: { x: 150, y: 250 } });
    const region = await manager._spawnInteractableRegion(spawnRequest);

    assert.equal(createdRegions.length, 1, 'one Region created');
    assert.equal(region, createdRegions[0]);
    const regionPayload = regionPayloads[0];
    assert.equal(regionPayload.behaviors[0].type, 'fabricate.interactable');
    assert.equal(regionPayload.behaviors[0].system.interactableType, 'tool');
    assert.equal(regionPayload.behaviors[0].system.sourceUuid, 'Fabricate.sysA.tool.tool-1');
    assert.equal(regionPayload.shapes[0].type, 'rectangle');

    assert.equal(createdTiles.length, 1, 'one linked Tile created');
    assert.equal(createdTiles[0].texture.src, 'icons/tools/axe.webp');
    assert.equal(createdTiles[0].flags.fabricate.isInteractableVisual, true);
    assert.equal(createdTiles[0].flags.fabricate.linkedRegionUuid, 'Scene.scene-1.Region.region-1');
    assert.equal(createdTiles[0].flags.fabricate.linkedBehaviorId, 'beh-1');

    assert.equal(behaviorUpdates.length, 1, 'the linked-visual ref is written back onto the behaviour');
    assert.deepEqual(behaviorUpdates[0], {
      system: { linkedVisual: { uuid: 'Scene.scene-1.Tile.tile-1', documentName: 'Tile' } }
    });
  } finally {
    restoreGlobals(saved);
  }
});

test('_spawnInteractableRegion rolls back the orphan Region when the linked Tile create fails', async () => {
  const saved = snapshotGlobals();
  try {
    const { createdRegions, createdTiles, deletedRegions, warnings } = installFakeFoundry({ isGM: true, failTile: true });
    const manager = new InteractableManager();

    const classification = {
      interactableType: 'tool', systemId: 'sysA', referenceId: 'tool-1',
      sourceUuid: 'Fabricate.sysA.tool.tool-1', entry: { id: 'tool-1' }
    };
    const result = await manager._spawnInteractableRegion(
      manager._buildRegionSpawnRequest({ classification, point: { x: 0, y: 0 } })
    );

    assert.equal(result, null, 'spawn aborts when the Tile cannot be created');
    assert.equal(createdRegions.length, 1, 'the Region was created first');
    assert.equal(createdTiles.length, 0, 'no Tile survived');
    assert.deepEqual(deletedRegions, ['region-1'], 'the orphan Region is deleted (transaction-like rollback)');
    assert.deepEqual(warnings, ['FABRICATE.Canvas.Interactable.SpawnFailed']);
  } finally {
    restoreGlobals(saved);
  }
});

test('_spawnInteractableRegion notifies + aborts when the Region create fails (no Tile attempted)', async () => {
  const saved = snapshotGlobals();
  try {
    const { createdRegions, createdTiles, warnings } = installFakeFoundry({ isGM: true, failRegion: true });
    const manager = new InteractableManager();

    const classification = {
      interactableType: 'tool', systemId: 'sysA', referenceId: 'tool-1',
      sourceUuid: 'Fabricate.sysA.tool.tool-1', entry: { id: 'tool-1' }
    };
    const result = await manager._spawnInteractableRegion(
      manager._buildRegionSpawnRequest({ classification, point: { x: 0, y: 0 } })
    );

    assert.equal(result, null);
    assert.equal(createdRegions.length, 0);
    assert.equal(createdTiles.length, 0, 'no Tile is attempted without a Region');
    assert.deepEqual(warnings, ['FABRICATE.Canvas.Interactable.SpawnFailed']);
  } finally {
    restoreGlobals(saved);
  }
});

// --- gathering-task env-resolution still gates the region spawn -------------

const SYS_A_ENVS = [
  { id: 'env-forest', craftingSystemId: 'sysA', name: 'Forest' },
  { id: 'env-cave', craftingSystemId: 'sysA', name: 'Cave' }
];

function installGatheringEnvFoundry(opts = {}) {
  const base = installFakeFoundry(opts);
  globalThis.game.fabricate.getGatheringEnvironmentStore = () => ({ list: () => opts.environments ?? [] });
  return base;
}

function taskClassification(taskId = 'task-9') {
  return {
    interactableType: 'gatheringTask', systemId: 'sysA', referenceId: taskId,
    sourceUuid: `Fabricate.sysA.gatheringTask.${taskId}`, entry: { id: taskId, name: 'Chop Wood' }
  };
}

test('(a) region single-hit → region spawned with the region environmentId + notification', async () => {
  const saved = snapshotGlobals();
  try {
    const { createdRegions, regionPayloads, infos } = installGatheringEnvFoundry({
      isGM: true, environments: SYS_A_ENVS, tasks: [{ id: 'task-9', name: 'Chop Wood' }]
    });
    const manager = new InteractableManager({
      regionEnvironmentIdsAtPoint: () => ['env-cave'],
      promptDropEnvironment: async () => { throw new Error('dialog must not open on a single region hit'); }
    });

    await manager._spawnGatheringTask({ classification: taskClassification(), point: { x: 5, y: 6 }, forceDialog: false });

    assert.equal(createdRegions.length, 1);
    assert.equal(regionPayloads[0].behaviors[0].system.environmentId, 'env-cave', 'the region environment wins');
    assert.deepEqual(infos, ['FABRICATE.Canvas.Interactable.EnvironmentAutoResolved']);
  } finally {
    restoreGlobals(saved);
  }
});

test('(d) dialog cancel → NO region created (abort)', async () => {
  const saved = snapshotGlobals();
  try {
    const { createdRegions } = installGatheringEnvFoundry({
      isGM: true, environments: SYS_A_ENVS, tasks: [{ id: 'task-9', name: 'Chop Wood' }]
    });
    const manager = new InteractableManager({
      regionEnvironmentIdsAtPoint: () => [],
      promptDropEnvironment: async () => null
    });

    const result = await manager._spawnGatheringTask({ classification: taskClassification(), point: { x: 7, y: 8 }, forceDialog: false });
    assert.equal(result, null);
    assert.equal(createdRegions.length, 0, 'a cancelled dialog creates no region');
  } finally {
    restoreGlobals(saved);
  }
});

// --- onRegionEnter prompt gate ----------------------------------------------

function interactableBehavior({ system, sceneId = 'scene-1', regionId = 'region-1', behaviorId = 'beh-1', testPoint = () => true } = {}) {
  const region = {
    id: regionId,
    object: { testPoint },
    parent: { id: sceneId, tokens: { contents: [] } }
  };
  const behavior = { id: behaviorId, type: 'fabricate.interactable', system, parent: region };
  region.behaviors = { get: (id) => (id === behaviorId ? behavior : null) };
  return behavior;
}

const TOOL_SYSTEM = {
  interactableType: 'tool', sourceUuid: 'Fabricate.sysA.tool.tool-1', systemId: 'sysA', toolId: 'tool-1',
  taskId: null, environmentId: null, name: 'Forge Anvil',
  presentation: { promptText: 'Use the forge', hidden: false },
  linkedVisual: { uuid: null, documentName: null, mode: 'marker', missingPolicy: 'warn' },
  node: null,
  state: { enabled: true, consumed: false, locked: false, uses: { max: null, used: 0 }, cooldown: { seconds: null, lastUsedWorldTime: null } },
  activation: { trigger: 'regionEnter', audience: 'players' }
};

test('onRegionEnter shows the prompt ONLY for the controlling user; a foreign user is ignored', () => {
  const saved = snapshotGlobals();
  try {
    installFakeFoundry({ isGM: false });
    const shows = [];
    const manager = new InteractableManager({ getPromptAppClass: () => ({ show: (args) => shows.push(args), dismiss: () => {} }) });

    const me = { id: 'u-1' };
    const other = { id: 'u-2' };
    globalThis.game.user = me;
    const ownedToken = { document: { isOwner: true, actor: { id: 'actor-1' }, actorId: 'actor-1' } };
    const behavior = interactableBehavior({ system: TOOL_SYSTEM });

    // Foreign user's enter event → ignored (no N prompts).
    manager.onRegionEnter({ user: other, data: { token: ownedToken } }, behavior);
    assert.equal(shows.length, 0, 'a foreign user does not show a prompt on this client');

    // The controlling user's enter event → one prompt.
    manager.onRegionEnter({ user: me, data: { token: ownedToken } }, behavior);
    assert.equal(shows.length, 1, 'the controlling user sees exactly one prompt');
    assert.equal(shows[0].name, 'Forge Anvil');
    assert.equal(shows[0].promptText, 'Use the forge');
    assert.equal(shows[0].behaviorRef, 'scene-1.region-1.beh-1');
    assert.equal(typeof shows[0].onInteract, 'function');
  } finally {
    restoreGlobals(saved);
  }
});

test('onRegionEnter does not prompt for an ineligible (locked) interactable', () => {
  const saved = snapshotGlobals();
  try {
    installFakeFoundry({ isGM: false });
    const shows = [];
    const manager = new InteractableManager({ getPromptAppClass: () => ({ show: (a) => shows.push(a), dismiss: () => {} }) });
    const me = { id: 'u-1' };
    globalThis.game.user = me;
    const lockedSystem = { ...TOOL_SYSTEM, state: { ...TOOL_SYSTEM.state, locked: true } };
    manager.onRegionEnter(
      { user: me, data: { token: { document: { isOwner: true, actor: { id: 'a1' } } } } },
      interactableBehavior({ system: lockedSystem })
    );
    assert.equal(shows.length, 0, 'a locked interactable raises no prompt');
  } finally {
    restoreGlobals(saved);
  }
});

test('onRegionExit dismisses the prompt for the matching behaviour ref', () => {
  const saved = snapshotGlobals();
  try {
    installFakeFoundry({ isGM: false });
    const dismisses = [];
    const manager = new InteractableManager({ getPromptAppClass: () => ({ show: () => {}, dismiss: (ref) => dismisses.push(ref) }) });
    const me = { id: 'u-1' };
    globalThis.game.user = me;
    manager.onRegionExit(
      { user: me, data: { token: { document: { isOwner: true } } } },
      interactableBehavior({ system: TOOL_SYSTEM })
    );
    assert.deepEqual(dismisses, ['scene-1.region-1.beh-1']);
  } finally {
    restoreGlobals(saved);
  }
});

// --- _requestActivation routing (active GM vs socket vs no-GM) ---------------

test('_requestActivation validates+grants LOCALLY when this client is the active GM', () => {
  const saved = snapshotGlobals();
  try {
    installFakeFoundry({ isGM: true, tools: [{ id: 'tool-1', componentId: 'comp-axe', label: 'Forge Anvil' }] });
    const manager = new InteractableManager();
    let grantedRequest = null;
    manager.validateAndGrant = (req) => { grantedRequest = req; return true; };

    manager._requestActivation(interactableBehavior({ system: TOOL_SYSTEM }), { actorId: 'a1', userId: 'gm-1', activationSource: 'regionEnter' });

    assert.ok(grantedRequest, 'the active GM validates+grants locally');
    assert.equal(grantedRequest.action, 'interactableActivate');
    assert.equal(grantedRequest.behaviorId, 'beh-1');
    assert.equal(grantedRequest.userId, 'gm-1');
  } finally {
    restoreGlobals(saved);
  }
});

test('_requestActivation EMITS over the socket when not the active GM (but a GM is online)', () => {
  const saved = snapshotGlobals();
  try {
    installFakeFoundry({ isGM: false });
    const emits = [];
    globalThis.game.user = { id: 'u-1', isGM: false };
    globalThis.game.users = { activeGM: { id: 'gm-1' }, get: () => null };
    globalThis.game.socket = { emit: (channel, payload) => emits.push({ channel, payload }) };
    const manager = new InteractableManager();

    manager._requestActivation(interactableBehavior({ system: TOOL_SYSTEM }), { actorId: 'a1', userId: 'u-1', activationSource: 'regionEnter' });

    assert.equal(emits.length, 1, 'the player emits the request to the active GM');
    assert.equal(emits[0].payload.action, 'interactableActivate');
  } finally {
    restoreGlobals(saved);
  }
});

test('_requestActivation warns + aborts when NO active GM is connected', () => {
  const saved = snapshotGlobals();
  try {
    const { warnings } = installFakeFoundry({ isGM: false });
    const emits = [];
    globalThis.game.user = { id: 'u-1', isGM: false };
    globalThis.game.users = { activeGM: null, get: () => null };
    globalThis.game.socket = { emit: (channel, payload) => emits.push({ channel, payload }) };
    const manager = new InteractableManager();

    manager._requestActivation(interactableBehavior({ system: TOOL_SYSTEM }), { actorId: 'a1', userId: 'u-1' });

    assert.equal(emits.length, 0, 'nothing is emitted with no active GM');
    assert.deepEqual(warnings, ['FABRICATE.Canvas.Interactable.NoActiveGM']);
  } finally {
    restoreGlobals(saved);
  }
});

// --- validateAndGrant (active GM) → grant emit/local open --------------------

test('validateAndGrant emits a tool grant (with activeCanvasTool) to the requesting player', async () => {
  const saved = snapshotGlobals();
  try {
    installFakeFoundry({ isGM: true, tools: [{ id: 'tool-1', componentId: 'comp-axe', label: 'Forge Anvil' }] });
    const emits = [];
    globalThis.game.user = { id: 'gm-1', isGM: true };
    globalThis.game.users = { activeGM: { id: 'gm-1' }, get: (id) => (id === 'u-1' ? { id: 'u-1', isGM: false } : null) };
    globalThis.game.socket = { emit: (channel, payload) => emits.push({ channel, payload }) };
    globalThis.game.actors = { get: (id) => (id === 'a1' ? { id: 'a1', testUserPermission: () => true } : null) };
    const behavior = interactableBehavior({ system: TOOL_SYSTEM });
    globalThis.game.scenes = { get: () => ({ regions: { get: () => behavior.parent } }) };
    behavior.parent.behaviors = { get: () => behavior };

    const manager = new InteractableManager();
    const request = {
      action: 'interactableActivate', sceneId: 'scene-1', regionId: 'region-1', behaviorId: 'beh-1',
      interactableType: 'tool', actorId: 'a1', userId: 'u-1', ts: 123
    };
    const ok = await manager.validateAndGrant(request);

    assert.equal(ok, true);
    assert.equal(emits.length, 1, 'the grant is emitted to the requesting player');
    const grant = emits[0].payload;
    assert.equal(grant.action, 'interactableActivationGranted');
    assert.equal(grant.userId, 'u-1');
    assert.equal(grant.grant.interactableType, 'tool');
    assert.deepEqual(grant.grant.context.activeCanvasTool, {
      componentId: 'comp-axe', systemId: 'sysA', toolId: 'tool-1', label: 'Forge Anvil'
    });
  } finally {
    restoreGlobals(saved);
  }
});

test('validateAndGrant REJECTS a non-GM requester who does NOT control the named actor (no grant, no open)', async () => {
  const saved = snapshotGlobals();
  try {
    // The validating client is the active GM, but the REQUESTER (u-1) is a
    // non-GM player who does NOT own actor a1 (testUserPermission → false).
    // The actor-control gate must reject before any grant is emitted/opened.
    installFakeFoundry({ isGM: true, tools: [{ id: 'tool-1', componentId: 'comp-axe', label: 'Forge Anvil' }] });
    const emits = [];
    globalThis.game.user = { id: 'gm-1', isGM: true };
    globalThis.game.users = { activeGM: { id: 'gm-1' }, get: (id) => (id === 'u-1' ? { id: 'u-1', isGM: false } : null) };
    globalThis.game.socket = { emit: (channel, payload) => emits.push({ channel, payload }) };
    // A real, non-owning user: testUserPermission(OWNER) → false. NOT stubbed true.
    globalThis.game.actors = { get: (id) => (id === 'a1' ? { id: 'a1', testUserPermission: () => false } : null) };
    const behavior = interactableBehavior({ system: TOOL_SYSTEM });
    globalThis.game.scenes = { get: () => ({ regions: { get: () => behavior.parent } }) };
    behavior.parent.behaviors = { get: () => behavior };

    let opened = null;
    const manager = new InteractableManager();
    manager.openGrant = (payload) => { opened = payload; };

    const ok = await manager.validateAndGrant({
      action: 'interactableActivate', sceneId: 'scene-1', regionId: 'region-1', behaviorId: 'beh-1',
      interactableType: 'tool', actorId: 'a1', userId: 'u-1', ts: 7
    });

    assert.equal(ok, false, 'the request is rejected (CANNOT_CONTROL_ACTOR)');
    assert.equal(emits.length, 0, 'no INTERACTABLE_ACTIVATION_GRANTED is emitted');
    assert.equal(opened, null, 'nothing is opened locally');
  } finally {
    restoreGlobals(saved);
  }
});

test('validateAndGrant opens LOCALLY when the GM activated their own token (no socket emit)', async () => {
  const saved = snapshotGlobals();
  try {
    installFakeFoundry({ isGM: true, tools: [{ id: 'tool-1', componentId: 'comp-axe', label: 'Forge Anvil' }] });
    const emits = [];
    globalThis.game.user = { id: 'gm-1', isGM: true };
    globalThis.game.users = { activeGM: { id: 'gm-1' }, get: () => ({ id: 'gm-1', isGM: true }) };
    globalThis.game.socket = { emit: (channel, payload) => emits.push({ channel, payload }) };
    globalThis.game.actors = { get: () => ({ id: 'a1', testUserPermission: () => true }) };
    const behavior = interactableBehavior({ system: TOOL_SYSTEM });
    globalThis.game.scenes = { get: () => ({ regions: { get: () => behavior.parent } }) };
    behavior.parent.behaviors = { get: () => behavior };

    let opened = null;
    const manager = new InteractableManager();
    manager.openGrant = (payload) => { opened = payload; };

    await manager.validateAndGrant({
      action: 'interactableActivate', sceneId: 'scene-1', regionId: 'region-1', behaviorId: 'beh-1',
      interactableType: 'tool', actorId: 'a1', userId: 'gm-1', ts: 1
    });

    assert.equal(emits.length, 0, 'no socket emit when the GM is the requester');
    assert.ok(opened, 'the grant opens locally on the GM');
    assert.equal(opened.grant.interactableType, 'tool');
  } finally {
    restoreGlobals(saved);
  }
});

// --- openGrant → SvelteFabricateApp.show -------------------------------------

test('openGrant opens the gathering tab with the tool activeCanvasTool', () => {
  const saved = snapshotGlobals();
  try {
    installFakeFoundry({ isGM: false });
    const shows = [];
    const manager = new InteractableManager({ getAppClass: () => ({ show: (tab, options) => shows.push({ tab, options }) }) });

    manager.openGrant({
      grant: {
        tab: 'gathering', interactableType: 'tool',
        context: { activeCanvasTool: { componentId: 'comp-axe', systemId: 'sysA', toolId: 'tool-1', label: 'Forge Anvil' } }
      }
    });

    assert.equal(shows.length, 1);
    assert.equal(shows[0].tab, 'gathering');
    assert.deepEqual(shows[0].options.activeCanvasTool, { componentId: 'comp-axe', systemId: 'sysA', toolId: 'tool-1', label: 'Forge Anvil' });
  } finally {
    restoreGlobals(saved);
  }
});

test('openGrant opens a gathering-task session scoped to env+task with a region node adapter', () => {
  const saved = snapshotGlobals();
  try {
    installFakeFoundry({ isGM: false });
    const taskSystem = {
      ...TOOL_SYSTEM, interactableType: 'gatheringTask', toolId: null, taskId: 'task-9', environmentId: 'env-1',
      sourceUuid: 'Fabricate.sysA.gatheringTask.task-9',
      node: { enabled: true, max: 3, current: 2, respawn: { policy: 'manual' } }
    };
    const behavior = interactableBehavior({ system: taskSystem });
    globalThis.game.scenes = { get: () => ({ regions: { get: () => behavior.parent } }) };
    behavior.parent.behaviors = { get: () => behavior };
    globalThis.game.socket = { emit: () => {} };
    globalThis.game.user = { id: 'u-1', isGM: false };
    globalThis.game.users = { activeGM: { id: 'gm-1' } };

    const shows = [];
    const manager = new InteractableManager({ getAppClass: () => ({ show: (tab, options) => shows.push({ tab, options }) }) });

    manager.openGrant({
      grant: {
        tab: 'gathering', interactableType: 'gatheringTask', environmentId: 'env-1', taskId: 'task-9',
        ref: { sceneId: 'scene-1', regionId: 'region-1', behaviorId: 'beh-1' }
      }
    });

    assert.equal(shows.length, 1);
    assert.equal(shows[0].options.environmentId, 'env-1');
    assert.equal(shows[0].options.taskId, 'task-9');
    assert.equal(typeof shows[0].options.nodeStateOverride?.read, 'function', 'a region node adapter is injected');
    assert.equal(shows[0].options.nodeStateOverride.read().current, 2);
    assert.deepEqual(shows[0].options.nodeStateOverride.tileRef(), { sceneId: 'scene-1', regionId: 'region-1', behaviorId: 'beh-1' });
  } finally {
    restoreGlobals(saved);
  }
});
