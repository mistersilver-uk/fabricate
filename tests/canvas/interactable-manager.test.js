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
import { gridScene, tokenDoc as tokenDocFake } from '../helpers/regionContainmentFakes.js';

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
    // Issue 533: a Fabricate-CREATED region is stamped with the ownership flag so
    // its later deletion may safely remove the whole region (a promoted user region
    // never gets this flag, so its delete removes only Fabricate's behaviour).
    assert.equal(regionPayload.flags.fabricate.interactableRegion, true);

    assert.equal(createdTiles.length, 1, 'one linked Tile created');
    // The linked Tile is CENTERED on its stored x/y (Foundry renders tiles
    // centered), so the tile's stored x/y IS the drop point.
    assert.equal(createdTiles[0].x, 150, 'tile center == drop point x');
    assert.equal(createdTiles[0].y, 250, 'tile center == drop point y');
    // The Region rectangle renders TOP-LEFT at its x/y, so to OVERLAY the tile it
    // is created at the tile's top-left (`tile.x - width/2`, `tile.y - height/2`)
    // with the tile's width/height — i.e. the region covers the tile's footprint.
    assert.equal(regionPayload.shapes[0].x, createdTiles[0].x - createdTiles[0].width / 2);
    assert.equal(regionPayload.shapes[0].y, createdTiles[0].y - createdTiles[0].height / 2);
    assert.equal(regionPayload.shapes[0].width, createdTiles[0].width);
    assert.equal(regionPayload.shapes[0].height, createdTiles[0].height);
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

test('_spawnInteractableRegion SKIPS Tile creation for the region-only (no marker) variant', async () => {
  const saved = snapshotGlobals();
  try {
    const { createdRegions, regionPayloads, createdTiles, behaviorUpdates } = installFakeFoundry({
      isGM: true,
      tools: [{ id: 'tool-1', componentId: 'comp-axe', label: 'Forge Anvil' }],
      components: [{ id: 'comp-axe', img: 'icons/tools/axe.webp' }]
    });
    const manager = new InteractableManager();

    const classification = {
      interactableType: 'tool', systemId: 'sysA', referenceId: 'tool-1',
      sourceUuid: 'Fabricate.sysA.tool.tool-1',
      entry: { id: 'tool-1', componentId: 'comp-axe', label: 'Forge Anvil' }
    };
    // The pure builder returns `tile: null` for visualMode 'none'.
    const spawnRequest = manager._buildRegionSpawnRequest({ classification, point: { x: 150, y: 250 }, visualMode: 'none' });
    assert.equal(spawnRequest.tile, null, 'the spawn request omits the tile');

    const region = await manager._spawnInteractableRegion(spawnRequest);

    assert.equal(createdRegions.length, 1, 'the Region is still created');
    assert.equal(region, createdRegions[0]);
    assert.equal(regionPayloads[0].behaviors[0].system.presentation.hidden, true, 'behaviour is hidden');
    assert.equal(regionPayloads[0].behaviors[0].system.linkedVisual.mode, 'none', 'mode is none');
    assert.equal(createdTiles.length, 0, 'NO Tile is created (no orphan)');
    assert.equal(behaviorUpdates.length, 0, 'NO linked-visual ref is written back');
  } finally {
    restoreGlobals(saved);
  }
});

test('_onDrop region-only payload (visualMode none) spawns the Region with NO Tile', async () => {
  const saved = snapshotGlobals();
  try {
    const { createdRegions, createdTiles, regionPayloads } = installFakeFoundry({ isGM: true });
    const manager = new InteractableManager();
    const result = manager._onDrop(globalThis.canvas, {
      fabricate: { interactableType: 'tool', systemId: 'sysA', toolId: 'tool-1', visualMode: 'none' },
      x: 100, y: 200
    });
    assert.equal(result, false);
    await flushAsync();
    assert.equal(createdRegions.length, 1);
    assert.equal(createdTiles.length, 0, 'the no-marker drop creates no Tile');
    assert.equal(regionPayloads[0].behaviors[0].system.linkedVisual.mode, 'none');
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

/**
 * A `fabricate.interactable` behaviour on a region on a scene, wired the way real
 * Foundry wires them: `behavior.parent` is the region, `region.parent` is the
 * scene, and every token document in `scene.tokens` has that same scene as its
 * `parent`. The scene carries `grid.size` because the containment re-check
 * computes the token CENTRE from the document footprint and that grid — a
 * grid-less scene degrades the centre to the document top-left, which reproduces
 * the issue-999 defect instead of testing the fix.
 */
function interactableBehavior({ system, sceneId = 'scene-1', regionId = 'region-1', behaviorId = 'beh-1', testPoint = () => true, tokens = [], gridSize = 100 } = {}) {
  const scene = gridScene({ id: sceneId, gridSize });
  // `tokens` may be a factory so a token document can be parented to THIS scene
  // (real Foundry guarantees `tokenDoc.parent === scene` for embedded tokens).
  scene.tokens.contents.push(...(typeof tokens === 'function' ? tokens(scene) : tokens));
  const region = {
    id: regionId,
    uuid: `Scene.${sceneId}.Region.${regionId}`,
    // V13 document-level testPoint takes a single ElevatedPoint { x, y, elevation }.
    testPoint,
    parent: scene
  };
  const behavior = { id: behaviorId, type: 'fabricate.interactable', system, parent: region };
  region.behaviors = { get: (id) => (id === behaviorId ? behavior : null) };
  scene.regions = { get: (id) => (id === regionId ? region : null) };
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

test('onRegionEnter shows the prompt when the controlling user is the mover (and carries the prompt shape)', () => {
  const saved = snapshotGlobals();
  try {
    installFakeFoundry({ isGM: false });
    const shows = [];
    const manager = new InteractableManager({ getPromptAppClass: () => ({ show: (args) => shows.push(args), dismiss: () => {} }) });

    const me = { id: 'u-1', isGM: false };
    globalThis.game.user = me;
    const ownedToken = { document: { isOwner: true, actor: { id: 'actor-1' }, actorId: 'actor-1' } };
    const behavior = interactableBehavior({ system: TOOL_SYSTEM });

    manager.onRegionEnter({ user: me, data: { token: ownedToken } }, behavior);
    assert.equal(shows.length, 1, 'the controlling user (mover) sees exactly one prompt');
    assert.equal(shows[0].name, 'Forge Anvil');
    assert.equal(shows[0].promptText, 'Use the forge');
    assert.equal(shows[0].behaviorRef, 'scene-1.region-1.beh-1');
    assert.equal(typeof shows[0].onInteract, 'function');
  } finally {
    restoreGlobals(saved);
  }
});

// --- _shouldPromptForEnter guard matrix -------------------------------------

test('_shouldPromptForEnter matrix: mover, non-GM owner, GM autonomous-player move, non-owner', () => {
  const saved = snapshotGlobals();
  try {
    installFakeFoundry({ isGM: false });
    const manager = new InteractableManager();

    const me = { id: 'u-1', isGM: false };
    const gmMe = { id: 'gm-1', isGM: true };
    const other = { id: 'u-2', isGM: false };
    const ownedToken = { document: { isOwner: true, actor: { id: 'actor-1' }, actorId: 'actor-1' } };
    const foreignToken = { document: { isOwner: false, actor: { id: 'actor-9' }, actorId: 'actor-9' } };

    // GM is the mover of any token → show.
    globalThis.game.user = gmMe;
    assert.equal(manager._shouldPromptForEnter({ user: gmMe }, foreignToken), true, 'GM-as-mover shows');

    // Player-as-mover of their own token → show.
    globalThis.game.user = me;
    assert.equal(manager._shouldPromptForEnter({ user: me }, ownedToken), true, 'player-as-mover shows');

    // Non-GM owner when SOMEONE ELSE (e.g. the GM) moved the token → show.
    globalThis.game.user = me;
    assert.equal(manager._shouldPromptForEnter({ user: other }, ownedToken), true, 'non-GM owner shows even when another user moved it');

    // GM when a PLAYER autonomously moved their OWN token → NO show (no GM spam).
    globalThis.game.user = gmMe;
    assert.equal(manager._shouldPromptForEnter({ user: other }, ownedToken), false, 'GM is NOT prompted on a player autonomous move');

    // Non-owner player when someone else moved a token they do not own → NO show.
    globalThis.game.user = me;
    assert.equal(manager._shouldPromptForEnter({ user: other }, foreignToken), false, 'a non-owner non-mover sees nothing');
  } finally {
    restoreGlobals(saved);
  }
});

test('onRegionEnter prompts a NON-GM owner even when the GM moved the token (dual prompt)', () => {
  const saved = snapshotGlobals();
  try {
    installFakeFoundry({ isGM: false });
    const shows = [];
    const manager = new InteractableManager({ getPromptAppClass: () => ({ show: (a) => shows.push(a), dismiss: () => {} }) });
    const me = { id: 'u-1', isGM: false };
    const gm = { id: 'gm-1', isGM: true };
    globalThis.game.user = me;
    const ownedToken = { document: { isOwner: true, actor: { id: 'actor-1' }, actorId: 'actor-1' } };

    // The GM moved the player's token; the player's client still shows the prompt.
    manager.onRegionEnter({ user: gm, data: { token: ownedToken } }, interactableBehavior({ system: TOOL_SYSTEM }));
    assert.equal(shows.length, 1, 'the owning player is prompted even though the GM moved the token');
  } finally {
    restoreGlobals(saved);
  }
});

test('onRegionEnter does NOT spam the GM when a player autonomously moves their own token', () => {
  const saved = snapshotGlobals();
  try {
    installFakeFoundry({ isGM: true });
    const shows = [];
    const manager = new InteractableManager({ getPromptAppClass: () => ({ show: (a) => shows.push(a), dismiss: () => {} }) });
    const gm = { id: 'gm-1', isGM: true };
    const player = { id: 'u-1', isGM: false };
    globalThis.game.user = gm;
    // The GM "owns" everything, but the player is the mover of their own token.
    const playerToken = { document: { isOwner: true, actor: { id: 'actor-1' }, actorId: 'actor-1' } };

    manager.onRegionEnter({ user: player, data: { token: playerToken } }, interactableBehavior({ system: TOOL_SYSTEM }));
    assert.equal(shows.length, 0, 'the GM is not prompted on a player autonomous move');
  } finally {
    restoreGlobals(saved);
  }
});

test('onRegionEnter SHOWS the prompt for a LOCKED interactable (lock has teeth at Interact time, not the prompt)', () => {
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
    // A locked interactable is VISIBLE: the prompt fires; the LOCKED denial is
    // routed only when the player presses Interact (validateActivationRequest).
    assert.equal(shows.length, 1, 'a locked interactable still raises the prompt');
    assert.equal(typeof shows[0].onInteract, 'function', 'and Interact is wired (the denial routes from there)');
  } finally {
    restoreGlobals(saved);
  }
});

test('onRegionEnter SUPPRESSES the prompt for a DISABLED interactable (concealed from players)', () => {
  const saved = snapshotGlobals();
  try {
    installFakeFoundry({ isGM: false });
    const shows = [];
    const manager = new InteractableManager({ getPromptAppClass: () => ({ show: (a) => shows.push(a), dismiss: () => {} }) });
    const me = { id: 'u-1' };
    globalThis.game.user = me;
    const disabledSystem = { ...TOOL_SYSTEM, state: { ...TOOL_SYSTEM.state, enabled: false } };
    manager.onRegionEnter(
      { user: me, data: { token: { document: { isOwner: true, actor: { id: 'a1' } } } } },
      interactableBehavior({ system: disabledSystem })
    );
    assert.equal(shows.length, 0, 'a disabled interactable raises no prompt');
  } finally {
    restoreGlobals(saved);
  }
});

test('onRegionEnter SUPPRESSES the prompt for an explicitly HIDDEN interactable (concealed from players)', () => {
  const saved = snapshotGlobals();
  try {
    installFakeFoundry({ isGM: false });
    const shows = [];
    const manager = new InteractableManager({ getPromptAppClass: () => ({ show: (a) => shows.push(a), dismiss: () => {} }) });
    const me = { id: 'u-1' };
    globalThis.game.user = me;
    const hiddenSystem = { ...TOOL_SYSTEM, presentation: { ...TOOL_SYSTEM.presentation, hidden: true } };
    manager.onRegionEnter(
      { user: me, data: { token: { document: { isOwner: true, actor: { id: 'a1' } } } } },
      interactableBehavior({ system: hiddenSystem })
    );
    assert.equal(shows.length, 0, 'an explicitly hidden interactable raises no prompt');
  } finally {
    restoreGlobals(saved);
  }
});

test('onRegionEnter uses the ENTERING token actor, never the linked Token marker actor (actor isolation)', () => {
  const saved = snapshotGlobals();
  try {
    installFakeFoundry({ isGM: false });
    const shows = [];
    const manager = new InteractableManager({ getPromptAppClass: () => ({ show: (a) => shows.push(a), dismiss: () => {} }) });
    const me = { id: 'u-1' };
    globalThis.game.user = me;

    // The interactable links a Token marker owned by a DIFFERENT actor (e.g. a
    // merchant NPC the GM placed). The entering player drives their OWN token.
    const linkedTokenSystem = {
      ...TOOL_SYSTEM,
      linkedVisual: { uuid: 'Scene.scene-1.Token.merchant', documentName: 'Token', mode: 'marker', missingPolicy: 'warn' }
    };
    // The region-enter event's `data.token` is the entering TokenDocument: its
    // actor info lives directly on it (that is where onRegionEnter reads actorId),
    // while `_shouldPromptForEnter` reads ownership off `.document`.
    const enteringToken = {
      isOwner: true,
      actor: { id: 'player-actor' },
      actorId: 'player-actor',
      document: { isOwner: true, actor: { id: 'player-actor' }, actorId: 'player-actor' }
    };

    // Capture the request ctx the prompt's onInteract forwards to _requestActivation.
    let requestedCtx = null;
    manager._requestActivation = (_behavior, ctx) => { requestedCtx = ctx; };

    manager.onRegionEnter({ user: me, data: { token: enteringToken } }, interactableBehavior({ system: linkedTokenSystem }));
    assert.equal(shows.length, 1, 'the controlling user sees the prompt');

    // Invoking the prompt fires the activation request — its actorId must be the
    // ENTERING token's actor, never the linked merchant Token's actor.
    shows[0].onInteract();
    assert.ok(requestedCtx, 'the prompt drives an activation request');
    assert.equal(requestedCtx.actorId, 'player-actor', 'activation uses the entering token actor');
    assert.notEqual(requestedCtx.actorId, 'merchant', 'activation never adopts the linked Token marker actor');
  } finally {
    restoreGlobals(saved);
  }
});

test('onRegionExit dismisses the prompt by ref UNCONDITIONALLY (no mover gate)', () => {
  const saved = snapshotGlobals();
  try {
    installFakeFoundry({ isGM: false });
    const dismisses = [];
    const manager = new InteractableManager({ getPromptAppClass: () => ({ show: () => {}, dismiss: (ref) => dismisses.push(ref) }) });
    const me = { id: 'u-1', isGM: false };
    const other = { id: 'u-2', isGM: false };
    globalThis.game.user = me;
    // A DIFFERENT user (e.g. the GM staged the token and the player walks it out)
    // moved the token out; this client still dismisses by ref. dismiss() is itself
    // ref-matched + a no-op when this client is not showing the prompt.
    manager.onRegionExit(
      { user: other, data: { token: { document: { isOwner: false } } } },
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

/**
 * Shared harness for the validateAndGrant tests, mirroring `setupReprompt`.
 *
 * It installs the fake runtime with THIS client as the active GM, the requesting
 * user, the actor-control verdict, and the behaviour the request ref resolves to
 * — and critically resolves `game.scenes.get(sceneId)` to the SAME scene object
 * that is `region.parent`, as real Foundry guarantees. `tokens` may be a factory
 * `(scene) => tokenDocs` so token documents can be parented to that scene.
 *
 * Every validateAndGrant test previously repeated ~25 lines of this wiring, which
 * is both a duplication-gate liability and how the containment collaborator went
 * uncovered: the old scene stub carried no tokens, so the re-check short-circuited
 * before it ever reached a containment call.
 */
function setupValidateAndGrant({
  system = TOOL_SYSTEM,
  tokens = [],
  testPoint,
  userId = 'u-1',
  canControlActor = true,
  ts = 7
} = {}) {
  const { warnings } = installFakeFoundry({
    isGM: true,
    tools: [{ id: 'tool-1', componentId: 'comp-axe', label: 'Forge Anvil' }]
  });
  const emits = [];
  const requester = userId === 'gm-1' ? { id: 'gm-1', isGM: true } : { id: userId, isGM: false };
  globalThis.game.user = { id: 'gm-1', isGM: true };
  globalThis.game.users = { activeGM: { id: 'gm-1' }, get: (id) => (String(id) === userId ? requester : null) };
  globalThis.game.socket = { emit: (channel, payload) => emits.push({ channel, payload }) };
  globalThis.game.actors = { get: (id) => (id === 'a1' ? { id: 'a1', testUserPermission: () => canControlActor } : null) };

  const behavior = interactableBehavior({ system, tokens, ...(testPoint ? { testPoint } : {}) });
  const region = behavior.parent;
  const scene = region.parent;
  globalThis.game.scenes = { get: (id) => (id === 'scene-1' ? scene : null) };

  const manager = new InteractableManager();
  const request = {
    action: 'interactableActivate', sceneId: 'scene-1', regionId: 'region-1', behaviorId: 'beh-1',
    interactableType: 'tool', actorId: 'a1', userId, ts
  };
  return { manager, behavior, region, scene, emits, warnings, request };
}

/** The denial reason routed to the requester, or null when none was routed. */
function deniedReason(emits) {
  const denied = emits.filter((e) => e.payload.action === 'interactableActivationDenied');
  return denied.length === 1 ? denied[0].payload.reason : null;
}

test('validateAndGrant emits a tool grant (with activeCanvasTool) to the requesting player', async () => {
  const saved = snapshotGlobals();
  try {
    const { manager, emits, request } = setupValidateAndGrant({ ts: 123 });
    const ok = await manager.validateAndGrant(request);

    assert.equal(ok, true);
    assert.equal(emits.length, 1, 'the grant is emitted to the requesting player');
    const grant = emits[0].payload;
    assert.equal(grant.action, 'interactableActivationGranted');
    assert.equal(grant.userId, 'u-1');
    assert.equal(grant.grant.interactableType, 'tool');
    assert.equal(grant.grant.actorId, 'a1', 'the grant carries the interacting actor for default selection');
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
    const { manager, emits, request } = setupValidateAndGrant({ canControlActor: false });
    let opened = null;
    manager.openGrant = (payload) => { opened = payload; };

    const ok = await manager.validateAndGrant(request);

    assert.equal(ok, false, 'the request is rejected (CANNOT_CONTROL_ACTOR)');
    assert.equal(emits.filter((e) => e.payload.action === 'interactableActivationGranted').length, 0, 'no INTERACTABLE_ACTIVATION_GRANTED is emitted');
    assert.equal(opened, null, 'nothing is opened locally');
  } finally {
    restoreGlobals(saved);
  }
});

test('validateAndGrant EMITS a denied notice (with reason) to a remote requesting player on rejection', async () => {
  const saved = snapshotGlobals();
  try {
    const { manager, emits, request } = setupValidateAndGrant({ canControlActor: false });
    const ok = await manager.validateAndGrant(request);

    assert.equal(ok, false);
    assert.equal(emits.length, 1, 'the requesting player is told WHY (denied notice emitted)');
    assert.equal(emits[0].payload.action, 'interactableActivationDenied');
    assert.equal(emits[0].payload.userId, 'u-1');
    assert.equal(deniedReason(emits), 'CANNOT_CONTROL_ACTOR');
  } finally {
    restoreGlobals(saved);
  }
});

test('validateAndGrant notifies LOCALLY (no socket) when the GM requester is denied', async () => {
  const saved = snapshotGlobals();
  try {
    // A LOCKED interactable ⇒ rejection even for the GM requester.
    const { manager, emits, warnings, request } = setupValidateAndGrant({
      system: { ...TOOL_SYSTEM, state: { ...TOOL_SYSTEM.state, locked: true } },
      userId: 'gm-1', ts: 1
    });
    const ok = await manager.validateAndGrant(request);

    assert.equal(ok, false);
    assert.equal(emits.length, 0, 'no socket emit when the GM is the requester');
    assert.deepEqual(warnings, ['FABRICATE.Canvas.Interactable.Denied.Locked'], 'the GM is warned locally with the localized denial key');
  } finally {
    restoreGlobals(saved);
  }
});

// --- validateAndGrant containment re-check (issue 999) -----------------------
//
// The re-check runs on the ACTIVE GM'S client, which may not be viewing the
// requester's scene, so no token document here has a placeable (`object`). The
// region rect covers 100..200 on both axes; on a 100px grid a 1x1 token document
// at (60,60) has its top-left OUTSIDE and its centre (110,110) INSIDE.
const CONTAINMENT_RECT = { x: 100, y: 100, w: 100, h: 100 };

/** A region testPoint recording every submitted point on `calls`. */
function recordingRectTestPoint(calls, rect = CONTAINMENT_RECT) {
  return (point) => {
    calls.push(point);
    const px = Number(point?.x);
    const py = Number(point?.y);
    if (!Number.isFinite(px) || !Number.isFinite(py)) return false;
    return px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h;
  };
}

test('validateAndGrant ADMITS a token whose CENTRE is inside on a GM client with no rendered canvas (issue 999)', async () => {
  const saved = snapshotGlobals();
  try {
    // The headline regression: the GM validating this request is not viewing the
    // scene, so `tokenDoc.object` is null and the old code fell back to the
    // token's top-left anchor — ~70px off-centre for a Medium token — and denied
    // a player standing squarely in the region.
    const points = [];
    const { manager, emits, request } = setupValidateAndGrant({
      testPoint: recordingRectTestPoint(points),
      tokens: (scene) => [tokenDocFake({ x: 60, y: 60, scene, actorId: 'a1' })]
    });

    const ok = await manager.validateAndGrant(request);

    assert.equal(ok, true, 'the token is inside; the activation is granted');
    assert.equal(deniedReason(emits), null, 'no TOKEN_NOT_INSIDE denial is routed');
    assert.deepEqual(points[0], { x: 110, y: 110, elevation: 0 }, 'the CENTRE is submitted, not the top-left anchor');
  } finally {
    restoreGlobals(saved);
  }
});

test('validateAndGrant DENIES TOKEN_NOT_INSIDE when the token is genuinely outside (issue 999)', async () => {
  const saved = snapshotGlobals();
  try {
    const { manager, emits, request } = setupValidateAndGrant({
      testPoint: recordingRectTestPoint([]),
      tokens: (scene) => [tokenDocFake({ x: 600, y: 600, scene, actorId: 'a1', insideRegion: false })]
    });

    const ok = await manager.validateAndGrant(request);

    assert.equal(ok, false, 'a genuine miss still denies — the fix is not a blanket grant');
    assert.equal(deniedReason(emits), 'TOKEN_NOT_INSIDE');
  } finally {
    restoreGlobals(saved);
  }
});

test('validateAndGrant DENIES when Foundry containment says outside even though the centre is inside (issue 999)', async () => {
  const saved = snapshotGlobals();
  try {
    // `TokenDocument#testInsideRegion` knows the footprint, the elevation band and
    // (on V14) the scene level; the centre-point test is a strictly worse
    // approximation and must never overturn it.
    const points = [];
    const { manager, emits, request } = setupValidateAndGrant({
      testPoint: recordingRectTestPoint(points),
      tokens: (scene) => [tokenDocFake({ x: 60, y: 60, scene, actorId: 'a1', insideRegion: false })]
    });

    const ok = await manager.validateAndGrant(request);

    assert.equal(ok, false, 'Foundry’s own containment verdict is definitive');
    assert.equal(deniedReason(emits), 'TOKEN_NOT_INSIDE');
    assert.equal(points.length, 0, 'the weaker centre-point signal is never consulted');
  } finally {
    restoreGlobals(saved);
  }
});

test('validateAndGrant GRANTS when the actor has no token document in the scene (cannot locate ⇒ do not block)', async () => {
  const saved = snapshotGlobals();
  try {
    const { manager, request } = setupValidateAndGrant({
      testPoint: () => false,
      tokens: (scene) => [tokenDocFake({ x: 600, y: 600, scene, actorId: 'someone-else' })]
    });

    assert.equal(await manager.validateAndGrant(request), true, 'no token matches the actor ⇒ grant');
  } finally {
    restoreGlobals(saved);
  }
});

test('validateAndGrant GRANTS when ANY of the actor’s tokens is inside (issue 999)', async () => {
  const saved = snapshotGlobals();
  try {
    const { manager, request } = setupValidateAndGrant({
      testPoint: recordingRectTestPoint([]),
      tokens: (scene) => [
        tokenDocFake({ x: 600, y: 600, scene, actorId: 'a1' }),
        tokenDocFake({ x: 60, y: 60, scene, actorId: 'a1' })
      ]
    });

    assert.equal(await manager.validateAndGrant(request), true, 'the second, in-region token admits');
  } finally {
    restoreGlobals(saved);
  }
});

test('validateAndGrant never rejects when a containment signal THROWS (issue 999)', async () => {
  const saved = snapshotGlobals();
  try {
    // A throw means "could not determine", not "outside", on either signal.
    const throwingInside = setupValidateAndGrant({
      testPoint: () => { throw new Error('testPoint exploded'); },
      tokens: (scene) => [tokenDocFake({ x: 600, y: 600, scene, actorId: 'a1', insideRegion: 'throws' })]
    });
    assert.equal(await throwingInside.manager.validateAndGrant(throwingInside.request), true);
    assert.equal(deniedReason(throwingInside.emits), null);

    // A second, independent runtime (installFakeFoundry replaces the globals).
    const throwingPoint = setupValidateAndGrant({
      testPoint: () => { throw new Error('testPoint exploded'); },
      tokens: (scene) => [tokenDocFake({ x: 600, y: 600, scene, actorId: 'a1' })]
    });
    assert.equal(await throwingPoint.manager.validateAndGrant(throwingPoint.request), true);
    assert.equal(deniedReason(throwingPoint.emits), null);
  } finally {
    restoreGlobals(saved);
  }
});

test('notifyActivationDenied warns with the mapped key; an unknown reason uses the generic key', () => {
  const saved = snapshotGlobals();
  try {
    const { warnings } = installFakeFoundry({ isGM: false });
    const manager = new InteractableManager();

    manager.notifyActivationDenied('LOCKED');
    manager.notifyActivationDenied('totally-unknown');
    manager.notifyActivationDenied(null);

    assert.deepEqual(warnings, [
      'FABRICATE.Canvas.Interactable.Denied.Locked',
      'FABRICATE.Canvas.Interactable.Denied.Generic',
      'FABRICATE.Canvas.Interactable.Denied.Generic'
    ]);
  } finally {
    restoreGlobals(saved);
  }
});

test('validateAndGrant opens LOCALLY when the GM activated their own token (no socket emit)', async () => {
  const saved = snapshotGlobals();
  try {
    const { manager, emits, request } = setupValidateAndGrant({ userId: 'gm-1', ts: 1 });
    let opened = null;
    manager.openGrant = (payload) => { opened = payload; };

    await manager.validateAndGrant(request);

    assert.equal(emits.length, 0, 'no socket emit when the GM is the requester');
    assert.ok(opened, 'the grant opens locally on the GM');
    assert.equal(opened.grant.interactableType, 'tool');
  } finally {
    restoreGlobals(saved);
  }
});

// --- openGrant → SvelteFabricateApp.show -------------------------------------

test('openGrant opens the CRAFTING tab with the tool activeCanvasTool', () => {
  const saved = snapshotGlobals();
  try {
    installFakeFoundry({ isGM: false });
    const shows = [];
    const manager = new InteractableManager({ getAppClass: () => ({ show: (tab, options) => shows.push({ tab, options }) }) });

    manager.openGrant({
      grant: {
        tab: 'crafting', interactableType: 'tool', actorId: 'actor-7',
        context: { activeCanvasTool: { componentId: 'comp-axe', systemId: 'sysA', toolId: 'tool-1', label: 'Forge Anvil' } }
      }
    });

    assert.equal(shows.length, 1);
    assert.equal(shows[0].tab, 'crafting', 'a Tool station opens the Crafting tab');
    assert.deepEqual(shows[0].options.activeCanvasTool, { componentId: 'comp-axe', systemId: 'sysA', toolId: 'tool-1', label: 'Forge Anvil' });
    assert.equal(shows[0].options.actorId, 'actor-7', 'the interacting actor is forwarded as the default selection');
  } finally {
    restoreGlobals(saved);
  }
});

test('openGrant opens a gathering-task session scoped to env+task with NO node override (env nodeRuntime is the source of truth)', () => {
  const saved = snapshotGlobals();
  try {
    installFakeFoundry({ isGM: false });
    const shows = [];
    const manager = new InteractableManager({ getAppClass: () => ({ show: (tab, options) => shows.push({ tab, options }) }) });

    manager.openGrant({
      grant: {
        tab: 'gathering', interactableType: 'gatheringTask', environmentId: 'env-1', taskId: 'task-9', actorId: 'actor-7',
        ref: { sceneId: 'scene-1', regionId: 'region-1', behaviorId: 'beh-1' }
      }
    });

    assert.equal(shows.length, 1);
    assert.equal(shows[0].tab, 'gathering');
    assert.equal(shows[0].options.environmentId, 'env-1');
    assert.equal(shows[0].options.taskId, 'task-9');
    assert.equal(shows[0].options.actorId, 'actor-7', 'the interacting actor is forwarded as the default selection');
    assert.equal('nodeStateOverride' in shows[0].options, false, 'no per-interactable node override is injected');
  } finally {
    restoreGlobals(saved);
  }
});

// --- issue 332: re-prompt after the gathering window closes ------------------

/**
 * Build a canvas scene fake usable by BOTH the close re-prompt resolver
 * (`scene.tokens` + `selectRepromptTokenDoc`) and the existing re-prompt path
 * (`interactableBehaviorsContainingToken` over `scene.regions`, then
 * `identifyRegionBehaviorRef` over `behavior.parent`/`region.parent`). The single
 * interactable region's containment is controlled by `regionContains`.
 */
const REPROMPT_REF = { sceneId: 'scene-1', regionId: 'region-1', behaviorId: 'beh-1' };

/**
 * Build a canvas scene fake usable by BOTH the close re-prompt resolver
 * (`scene.tokens` + `selectRepromptTokenDoc`) and the existing re-prompt path
 * (`interactableBehaviorsContainingToken` over `scene.regions`, then
 * `identifyRegionBehaviorRef` over `behavior.parent`/`region.parent`). The single
 * interactable region's containment is controlled by `regionContains`.
 */
function buildRepromptScene({ system = TOOL_SYSTEM, regionContains = true, actorId = 'actor-1', tokenInScene = true, isOwner = true } = {}) {
  const scene = { id: 'scene-1', tokens: { contents: [] } };
  const region = { id: 'region-1', parent: scene, testPoint: () => regionContains === true };
  const behavior = { id: 'beh-1', type: 'fabricate.interactable', system, parent: region };
  region.behaviors = { contents: [behavior] };
  scene.regions = { contents: [region] };
  // `_ownsToken` reads the token document's `isOwner` boolean for a non-GM user.
  const tokenDoc = { actorId, actor: { id: actorId }, isOwner };
  // The live placeable references its document (Foundry's placeable→document link)
  // and carries the center the hit-test reads.
  tokenDoc.object = { center: { x: 50, y: 50 }, document: tokenDoc };
  if (tokenInScene) scene.tokens.contents.push(tokenDoc);
  return { scene, region, behavior, tokenDoc };
}

/**
 * Shared harness for the issue-332 close-reprompt tests: installs the fake
 * runtime, a non-GM controlling user, the re-prompt scene (as the active +
 * lookup scene unless `viewedScene` overrides the active one), an app `show`
 * recorder, and a prompt recorder injected into the manager. Returns the
 * collectors so each test only writes its distinct assertions.
 */
function setupReprompt(sceneOpts = {}, { viewedScene } = {}) {
  installFakeFoundry({ isGM: false });
  globalThis.game.user = { id: 'u-1', isGM: false };
  const built = buildRepromptScene(sceneOpts);
  globalThis.game.scenes = { get: (id) => (id === 'scene-1' ? built.scene : null) };
  globalThis.canvas.scene = viewedScene ?? built.scene;
  const shows = [];
  const prompts = [];
  const manager = new InteractableManager({
    getAppClass: () => ({ show: (tab, options) => shows.push({ tab, options }) }),
    getPromptAppClass: () => ({ show: (a) => prompts.push(a), dismiss: () => {} }),
  });
  return { manager, shows, prompts, ...built };
}

/** Open a gathering-task grant for the standard re-prompt ref. */
function openGatheringGrant(manager) {
  manager.openGrant({
    grant: {
      tab: 'gathering', interactableType: 'gatheringTask',
      environmentId: 'env-1', taskId: 'task-9', actorId: 'actor-1', ref: REPROMPT_REF,
    },
  });
}

test('openGrant arms a one-shot onClose re-prompt for a gathering-task session (issue 332)', () => {
  const saved = snapshotGlobals();
  try {
    const { manager, shows } = setupReprompt();
    openGatheringGrant(manager);
    assert.equal(shows.length, 1);
    assert.equal(typeof shows[0].options.onClose, 'function', 'the gathering session is opened with a close re-prompt callback');
  } finally {
    restoreGlobals(saved);
  }
});

test('closing the gathering window RE-SHOWS the prompt when the token is STILL inside the region (issue 332)', () => {
  const saved = snapshotGlobals();
  try {
    const { manager, shows, prompts } = setupReprompt({ regionContains: true });
    openGatheringGrant(manager);
    assert.equal(prompts.length, 0, 'no prompt while the session is open');

    shows[0].options.onClose(); // simulate the window closing.

    assert.equal(prompts.length, 1, 'the Interact prompt re-appears on close');
    assert.equal(prompts[0].behaviorRef, 'scene-1.region-1.beh-1', 're-prompt targets the originating behaviour');
    assert.equal(prompts[0].name, 'Forge Anvil');
  } finally {
    restoreGlobals(saved);
  }
});

test('closing the gathering window does NOT re-show the prompt when the token has LEFT the region (issue 332)', () => {
  const saved = snapshotGlobals();
  try {
    // Token still in the scene but the region no longer contains it.
    const { manager, prompts } = setupReprompt({ regionContains: false });
    manager._repromptAfterInteractableClose({ ref: REPROMPT_REF, actorId: 'actor-1' });
    assert.equal(prompts.length, 0, 'a token that has left the region is not re-prompted');
  } finally {
    restoreGlobals(saved);
  }
});

test('closing the gathering window does NOT re-show the prompt when the activating token is GONE (issue 332)', () => {
  const saved = snapshotGlobals();
  try {
    // The token for the activating actor no longer exists in the scene.
    const { manager, prompts } = setupReprompt({ regionContains: true, tokenInScene: false });
    manager._repromptAfterInteractableClose({ ref: REPROMPT_REF, actorId: 'actor-1' });
    assert.equal(prompts.length, 0, 'a vanished activating token is not re-prompted');
  } finally {
    restoreGlobals(saved);
  }
});

test('the close re-prompt is a no-op when the viewed scene is not the originating scene (issue 332)', () => {
  const saved = snapshotGlobals();
  try {
    // The player navigated to a different scene before closing the window.
    const { manager, prompts } = setupReprompt(
      { regionContains: true },
      { viewedScene: { id: 'scene-OTHER', tokens: { contents: [] } } }
    );
    manager._repromptAfterInteractableClose({ ref: REPROMPT_REF, actorId: 'actor-1' });
    assert.equal(prompts.length, 0, 'do not re-prompt against a scene the player is no longer viewing');
  } finally {
    restoreGlobals(saved);
  }
});

test('the close re-prompt never throws on a malformed ref or missing globals (issue 332)', () => {
  const saved = snapshotGlobals();
  try {
    installFakeFoundry({ isGM: false });
    const manager = new InteractableManager();
    // No throw for any of these defensive cases.
    assert.doesNotThrow(() => manager._repromptAfterInteractableClose({}));
    assert.doesNotThrow(() => manager._repromptAfterInteractableClose({ ref: null, actorId: 'a' }));
    assert.doesNotThrow(() => manager._repromptAfterInteractableClose({ ref: { sceneId: 'scene-1' }, actorId: null }));
    assert.doesNotThrow(() => manager._repromptAfterInteractableClose());
  } finally {
    restoreGlobals(saved);
  }
});

test('the close re-prompt does NOT fire for a token the player does not control (issue 332)', () => {
  const saved = snapshotGlobals();
  try {
    // A non-GM user (installed by setupReprompt) whose token is still inside the
    // region but is NOT owned by this client: `_ownsToken` reads `isOwner:false`.
    const { manager, prompts } = setupReprompt({ regionContains: true, isOwner: false });
    manager._repromptAfterInteractableClose({ ref: REPROMPT_REF, actorId: 'actor-1' });
    assert.equal(prompts.length, 0, 'an unowned token in-region is not re-prompted on close');

    // Control: the SAME in-region scenario WITH ownership DOES re-prompt, proving
    // the guard above suppressed a path that would otherwise have fired.
    const owned = setupReprompt({ regionContains: true, isOwner: true });
    owned.manager._repromptAfterInteractableClose({ ref: REPROMPT_REF, actorId: 'actor-1' });
    assert.equal(owned.prompts.length, 1, 'the owned equivalent IS re-prompted (the guard is not a dead path)');
  } finally {
    restoreGlobals(saved);
  }
});

test('the close re-prompt delegates to the shared _promptForTokenInsideRegion path (issue 332)', () => {
  const saved = snapshotGlobals();
  try {
    const { manager, tokenDoc } = setupReprompt({ regionContains: true });
    // Spy on the shared re-prompt path: a future duplicated show-path would bypass
    // this and fail the call-count assertion.
    const calls = [];
    manager._promptForTokenInsideRegion = (p) => calls.push(p);

    manager._repromptAfterInteractableClose({ ref: REPROMPT_REF, actorId: 'actor-1' });

    assert.equal(calls.length, 1, 'reuses the shared prompt path exactly once');
    assert.equal(calls[0], tokenDoc.object, 'passes the resolved live placeable (whose .document is the token doc)');
  } finally {
    restoreGlobals(saved);
  }
});
