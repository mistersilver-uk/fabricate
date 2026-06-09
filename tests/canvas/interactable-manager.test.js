/**
 * Unit coverage for the Foundry-bound `InteractableManager` seams.
 *
 * The PURE routing logic (classification, spawn-payload shaping, dispatch) is
 * covered in `interactable-resolution.test.js`. This suite exercises the thin
 * Foundry/PIXI edge — hook registration, the dropCanvasData SUPPRESSION
 * CONTRACT, the GM gate, the TileDocument create payload (texture/width/height/
 * flags — NO actor), and the per-placeable double-click guard — by driving the
 * manager through `globalThis` fakes (`game`, `Hooks`, `canvas`,
 * `foundry.documents.TileDocument`, `ui.notifications`). No real Foundry runtime
 * is involved; the manager already reads these as globals.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { InteractableManager } from '../../src/canvas/InteractableManager.js';

// --- globalThis fake scaffolding -------------------------------------------

const GLOBAL_KEYS = ['game', 'Hooks', 'canvas', 'foundry', 'CONFIG', 'ui'];

/**
 * Flush queued microtasks so a fire-and-forget `_spawnGatheringTask` (kicked off
 * synchronously by `_onDrop`) settles before assertions.
 */
async function flushAsync(turns = 5) {
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
 * Install a coherent fake Foundry runtime on globalThis.
 *
 * @param {object} opts
 * @param {boolean} [opts.isGM=true]
 * @param {object[]} [opts.tools]       Library tools for system 'sysA'.
 * @param {object[]} [opts.components]  Components for system 'sysA' (for tool icons).
 * @param {object[]} [opts.tasks]       Library gathering tasks for system 'sysA'.
 * @returns {{ createdTiles: object[], warnings: string[], infos: string[] }}
 */
function installFakeFoundry({ isGM = true, tools = [{ id: 'tool-1' }], components = [], tasks = [{ id: 'task-9' }] } = {}) {
  const createdTiles = [];
  const warnings = [];
  const infos = [];

  globalThis.game = {
    user: { isGM },
    i18n: { localize: (key) => key },
    fabricate: {
      getCraftingSystemManager: () => ({
        getSystem: (systemId) => (systemId === 'sysA' ? { tools, components } : null)
      })
    },
    // getSetting() reads the bare `game` global → resolves here.
    settings: {
      get: (_namespace, _key) => ({ systems: { sysA: { tasks } } })
    }
  };

  globalThis.ui = {
    notifications: {
      warn: (msg) => warnings.push(msg),
      info: (msg) => infos.push(msg)
    }
  };

  globalThis.canvas = {
    scene: { id: 'scene-1', grid: { size: 100 } },
    tiles: { placeables: [] }
  };

  globalThis.foundry = {
    documents: {
      TileDocument: {
        create: async (data, ctx) => {
          const created = { ...data, _ctx: ctx };
          createdTiles.push(created);
          return created;
        }
      }
    }
  };

  return { createdTiles, warnings, infos };
}

// A drag payload the classifier accepts as a Fabricate Tool.
const TOOL_DROP = { fabricate: { interactableType: 'tool', systemId: 'sysA', toolId: 'tool-1' } };
// A drag payload the classifier accepts as a Fabricate Gathering Task.
const TASK_DROP = { fabricate: { interactableType: 'gatheringTask', systemId: 'sysA', taskId: 'task-9' } };
// A plain Foundry drop that is NOT a Fabricate interactable.
const FOREIGN_DROP = { type: 'Item', uuid: 'Item.unknown' };

// --- register() idempotency -------------------------------------------------

test('register() binds the canvas hooks exactly once across repeated calls', () => {
  const saved = snapshotGlobals();
  try {
    const registrations = [];
    globalThis.Hooks = { on: (hook, fn) => registrations.push({ hook, fn }) };
    // No Tile class available ⇒ the hover / permission wrap installs are no-ops
    // (they are exercised directly in interactable-doubleclick-wrap.test.js).

    const manager = new InteractableManager();
    manager.register();
    manager.register(); // second call must be a no-op.

    const hooks = registrations.map(r => r.hook);
    // dropCanvasData (drop interception) + drawTile / canvasReady (the
    // pointer-interactivity enablement + raw double-click listener for
    // interactable tiles) + destroyTile (detaches the listener on teardown).
    assert.deepEqual(hooks.sort(), ['canvasReady', 'destroyTile', 'drawTile', 'dropCanvasData']);
    assert.equal(registrations.length, 4, 'each canvas hook is bound only once');
    assert.equal(manager._registered, true);
  } finally {
    restoreGlobals(saved);
  }
});

// --- _onDrop SUPPRESSION CONTRACT (the feature lynchpin) --------------------

test('_onDrop returns false (suppresses Foundry) for a Fabricate Tool drop', async () => {
  const saved = snapshotGlobals();
  try {
    installFakeFoundry({ isGM: true });
    const manager = new InteractableManager();
    const result = manager._onDrop(globalThis.canvas, { ...TOOL_DROP, x: 100, y: 200 });
    assert.equal(result, false);
    await Promise.resolve(); // let the fire-and-forget spawn settle.
  } finally {
    restoreGlobals(saved);
  }
});

test('_onDrop suppresses Foundry AND spawns a gathering-task tile on the happy path', async () => {
  const saved = snapshotGlobals();
  try {
    // tier-2 default-environment resolution: no dialog, deterministic spawn.
    const { createdTiles } = installGatheringEnvFoundry({
      isGM: true,
      environments: [{ id: 'env-1', craftingSystemId: 'sysA', name: 'Forest' }],
      tasks: [{ id: 'task-9', name: 'Chop Wood', defaultEnvironmentId: 'env-1' }]
    });
    const manager = new InteractableManager({
      promptDropEnvironment: async () => { throw new Error('dialog must not open on the default-environment path'); }
    });

    const result = manager._onDrop(globalThis.canvas, { ...TASK_DROP, x: 10, y: 20 });
    assert.equal(result, false);
    await flushAsync();
    assert.equal(createdTiles.length, 1, 'a gathering-task tile is created on the happy path');
    assert.equal(createdTiles[0].flags.fabricate.name, 'Chop Wood', 'the tile carries the task name (hover tooltip)');
    assert.equal(createdTiles[0].flags.fabricate.interactableType, 'gatheringTask');
    assert.equal(createdTiles[0].flags.fabricate.environmentId, 'env-1', 'the default environment is stamped onto the tile flag');
  } finally {
    restoreGlobals(saved);
  }
});

test('_onDrop returns undefined (lets Foundry handle) for a non-Fabricate drop', () => {
  const saved = snapshotGlobals();
  try {
    installFakeFoundry({ isGM: true });
    const manager = new InteractableManager();
    const result = manager._onDrop(globalThis.canvas, FOREIGN_DROP);
    assert.equal(result, undefined);
  } finally {
    restoreGlobals(saved);
  }
});

// --- _onDrop GM gate --------------------------------------------------------

test('_onDrop GM-gate: a non-GM dropping an interactable is suppressed, warned, and spawns nothing', async () => {
  const saved = snapshotGlobals();
  try {
    const { createdTiles, warnings } = installFakeFoundry({ isGM: false });
    const manager = new InteractableManager();

    const result = manager._onDrop(globalThis.canvas, { ...TOOL_DROP, x: 5, y: 5 });

    assert.equal(result, false);
    await Promise.resolve();
    assert.equal(createdTiles.length, 0);
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0], 'FABRICATE.Canvas.Interactable.GMOnlySpawn');
  } finally {
    restoreGlobals(saved);
  }
});

// --- _spawnInteractable create payload (Tile, NO actor) ---------------------

test('_spawnInteractable builds the expected TileDocument create payload (texture/width/height/flags, no actorId)', async () => {
  const saved = snapshotGlobals();
  try {
    const { createdTiles } = installFakeFoundry({ isGM: true });
    const manager = new InteractableManager();

    const created = await manager._spawnInteractable({
      interactableType: 'tool',
      sourceUuid: 'Fabricate.sysA.tool.tool-1',
      name: 'Forge Anvil',
      texture: 'icons/tools/axe.webp',
      width: 100,
      height: 100,
      x: 120,
      y: 240
    });

    assert.equal(createdTiles.length, 1);
    const payload = createdTiles[0];
    assert.equal('actorId' in payload, false, 'a tile has NO backing actor');
    assert.equal('actorLink' in payload, false);
    assert.deepEqual(payload.texture, { src: 'icons/tools/axe.webp' });
    assert.equal(payload.width, 100);
    assert.equal(payload.height, 100);
    // 120/240 snapped to the 100px grid → 100/200.
    assert.equal(payload.x, 100);
    assert.equal(payload.y, 200);
    assert.deepEqual(payload.flags.fabricate, {
      isInteractable: true,
      interactableType: 'tool',
      sourceUuid: 'Fabricate.sysA.tool.tool-1',
      name: 'Forge Anvil'
    });
    assert.equal(payload._ctx.parent, globalThis.canvas.scene);
    assert.equal(created, payload);
  } finally {
    restoreGlobals(saved);
  }
});

test('_spawnInteractable falls back to a default texture + grid-square dimensions', async () => {
  const saved = snapshotGlobals();
  try {
    const { createdTiles } = installFakeFoundry({ isGM: true });
    const manager = new InteractableManager();

    await manager._spawnInteractable({
      interactableType: 'tool',
      sourceUuid: 'Fabricate.sysA.tool.tool-1',
      x: 0,
      y: 0
    });

    const payload = createdTiles[0];
    assert.equal(payload.texture.src, 'icons/svg/item-bag.svg', 'a sensible default image is used');
    assert.equal(payload.width, 100, 'defaults to one grid square');
    assert.equal(payload.height, 100);
  } finally {
    restoreGlobals(saved);
  }
});

test('_spawnInteractable carries environmentId into the gathering-task flag block', async () => {
  const saved = snapshotGlobals();
  try {
    const { createdTiles } = installFakeFoundry({ isGM: true });
    const manager = new InteractableManager();

    await manager._spawnInteractable({
      interactableType: 'gatheringTask',
      sourceUuid: 'Fabricate.sysA.gatheringTask.task-9',
      name: 'Chop Wood',
      environmentId: 'env-3',
      x: 0,
      y: 0
    });

    assert.equal(createdTiles.length, 1);
    assert.deepEqual(createdTiles[0].flags.fabricate, {
      isInteractable: true,
      interactableType: 'gatheringTask',
      sourceUuid: 'Fabricate.sysA.gatheringTask.task-9',
      name: 'Chop Wood',
      environmentId: 'env-3'
    });
  } finally {
    restoreGlobals(saved);
  }
});

test('_resolveIconTexture resolves a tool icon from its managed component img', () => {
  const saved = snapshotGlobals();
  try {
    installFakeFoundry({
      isGM: true,
      tools: [{ id: 'tool-1', componentId: 'comp-axe' }],
      components: [{ id: 'comp-axe', img: 'icons/tools/axe.webp' }]
    });
    const manager = new InteractableManager();
    const texture = manager._resolveIconTexture({
      interactableType: 'tool',
      systemId: 'sysA',
      entry: { id: 'tool-1', componentId: 'comp-axe' }
    });
    assert.equal(texture, 'icons/tools/axe.webp');
  } finally {
    restoreGlobals(saved);
  }
});

// --- hover tooltip → canvas-native PIXI label (NO DOM TooltipManager) --------

test('_showTooltip renders a PIXI label with the tile name; _hideTooltip removes it', () => {
  const saved = snapshotGlobals();
  const savedPixi = globalThis.PIXI;
  try {
    installFakeFoundry({ isGM: true });
    class FakeText {
      constructor(text) { this.text = text; this.anchor = { set() {} }; this.position = { set() {} }; }
      destroy() { this.destroyed = true; }
    }
    globalThis.PIXI = { Text: FakeText, TextStyle: class { constructor(o) { Object.assign(this, o); } } };

    const children = [];
    const placeable = {
      document: { width: 100, flags: { fabricate: { isInteractable: true, interactableType: 'tool', sourceUuid: 'Fabricate.sysA.tool.tool-1', name: 'Forge Anvil' } } },
      addChild(c) { children.push(c); return c; },
      removeChild(c) { const i = children.indexOf(c); if (i >= 0) children.splice(i, 1); }
    };
    const manager = new InteractableManager();

    manager._showTooltip(placeable);
    assert.equal(children.length, 1, 'a PIXI label child is added on hover');
    assert.equal(children[0].text, 'Forge Anvil', 'the label shows the resolved tile name');

    manager._hideTooltip(placeable);
    assert.equal(children.length, 0, 'the label is removed on hover-out');
  } finally {
    if (savedPixi === undefined) delete globalThis.PIXI; else globalThis.PIXI = savedPixi;
    restoreGlobals(saved);
  }
});

// --- tool double-click → show('gathering', { activeCanvasTool }) -------------

function toolTile(sourceUuid = 'Fabricate.sysA.tool.tool-1') {
  return { flags: { fabricate: { isInteractable: true, interactableType: 'tool', sourceUuid } } };
}

test('tool double-click resolves the Tool and opens the gathering tab with the activeCanvasTool payload', () => {
  const saved = snapshotGlobals();
  try {
    installFakeFoundry({ isGM: true, tools: [{ id: 'tool-1', componentId: 'comp-axe', label: 'Forge Anvil' }] });
    const shows = [];
    const fakeApp = { show: (tab, options) => { shows.push({ tab, options }); } };
    const manager = new InteractableManager({ getAppClass: () => fakeApp });

    manager._onDoubleClick(toolTile());

    assert.equal(shows.length, 1, 'the app was opened exactly once');
    assert.equal(shows[0].tab, 'gathering', 'tool stations open the gathering tab (crafting tab is still a placeholder)');
    assert.deepEqual(shows[0].options.activeCanvasTool, {
      componentId: 'comp-axe',
      systemId: 'sysA',
      toolId: 'tool-1',
      label: 'Forge Anvil'
    });
  } finally {
    restoreGlobals(saved);
  }
});

test('tool double-click is a no-op when the Tool cannot be resolved (no componentId)', () => {
  const saved = snapshotGlobals();
  try {
    installFakeFoundry({ isGM: true, tools: [] });
    const shows = [];
    const fakeApp = { show: (tab, options) => { shows.push({ tab, options }); } };
    const manager = new InteractableManager({ getAppClass: () => fakeApp });

    manager._onDoubleClick(toolTile());

    assert.equal(shows.length, 0, 'no app opens without a resolvable Tool');
  } finally {
    restoreGlobals(saved);
  }
});

// --- gathering-task double-click → show('gathering', { … }) ------------------

function gatheringTaskTile(sourceUuid = 'Fabricate.sysA.gatheringTask.task-9', extra = {}) {
  return {
    id: 'tile-77',
    parent: { id: 'scene-1' },
    flags: { fabricate: { isInteractable: true, interactableType: 'gatheringTask', sourceUuid, ...extra } }
  };
}

function installGatheringEnvFoundry({ isGM = true, hasActiveGM = true, environments = [], tasks = [{ id: 'task-9' }] } = {}) {
  const base = installFakeFoundry({ isGM, tasks });
  globalThis.game.users = { activeGM: hasActiveGM ? { id: 'gm-1' } : null };
  globalThis.game.time = { worldTime: 0, calendar: null };
  globalThis.game.fabricate.getGatheringEnvironmentStore = () => ({ list: () => environments });
  globalThis.game.socket = { emit: () => {} };
  globalThis.game.i18n.format = (key) => key;
  return base;
}

test('gathering-task double-click opens the gathering tab scoped to the resolved environment + task with a node override', () => {
  const saved = snapshotGlobals();
  try {
    installGatheringEnvFoundry({
      isGM: true,
      environments: [{ id: 'env-1', craftingSystemId: 'sysA', enabledTaskIds: ['task-9'] }]
    });
    const shows = [];
    const manager = new InteractableManager({ getAppClass: () => ({ show: (tab, options) => shows.push({ tab, options }) }) });

    manager._onDoubleClick(gatheringTaskTile('Fabricate.sysA.gatheringTask.task-9', {
      node: { enabled: true, max: 3, current: 1, respawn: { policy: 'manual' } }
    }));

    assert.equal(shows.length, 1, 'the gathering app opened once');
    assert.equal(shows[0].tab, 'gathering');
    assert.equal(shows[0].options.environmentId, 'env-1');
    assert.equal(shows[0].options.taskId, 'task-9');
    assert.equal(typeof shows[0].options.nodeStateOverride?.read, 'function', 'a per-tile node adapter was injected');
    assert.equal(shows[0].options.nodeStateOverride.read().current, 1, 'the adapter reads the tile node');
    assert.deepEqual(shows[0].options.nodeStateOverride.tileRef(), { sceneId: 'scene-1', tileId: 'tile-77' }, 'the adapter carries the tile ref');
  } finally {
    restoreGlobals(saved);
  }
});

test('gathering-task double-click prefers an environmentId already on the tile flag', () => {
  const saved = snapshotGlobals();
  try {
    installGatheringEnvFoundry({
      isGM: true,
      environments: [{ id: 'env-other', craftingSystemId: 'sysA', enabledTaskIds: ['task-9'] }]
    });
    const shows = [];
    const manager = new InteractableManager({ getAppClass: () => ({ show: (tab, options) => shows.push({ tab, options }) }) });

    manager._onDoubleClick(gatheringTaskTile('Fabricate.sysA.gatheringTask.task-9', { environmentId: 'env-static' }));

    assert.equal(shows.length, 1);
    assert.equal(shows[0].options.environmentId, 'env-static', 'the tile-flag environment wins over the fallback');
  } finally {
    restoreGlobals(saved);
  }
});

test('gathering-task double-click blocks a player gracefully when no active GM is connected', () => {
  const saved = snapshotGlobals();
  try {
    const { warnings } = installGatheringEnvFoundry({
      isGM: false,
      hasActiveGM: false,
      environments: [{ id: 'env-1', craftingSystemId: 'sysA', enabledTaskIds: ['task-9'] }]
    });
    const shows = [];
    const manager = new InteractableManager({ getAppClass: () => ({ show: (tab, options) => shows.push({ tab, options }) }) });

    manager._onDoubleClick(gatheringTaskTile());

    assert.equal(shows.length, 0, 'no session opens without an active GM to apply node writes');
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0], 'FABRICATE.Canvas.Interactable.NoActiveGM');
  } finally {
    restoreGlobals(saved);
  }
});

// --- _spawnGatheringTask env-resolution orchestration -----------------------

const SYS_A_ENVS = [
  { id: 'env-forest', craftingSystemId: 'sysA', name: 'Forest' },
  { id: 'env-cave', craftingSystemId: 'sysA', name: 'Cave' }
];

function taskClassification(taskId = 'task-9') {
  return {
    interactableType: 'gatheringTask',
    systemId: 'sysA',
    referenceId: taskId,
    sourceUuid: `Fabricate.sysA.gatheringTask.${taskId}`,
    entry: { id: taskId, name: 'Chop Wood' }
  };
}

test('(a) region single-hit → tile created with the region environmentId + notification fired', async () => {
  const saved = snapshotGlobals();
  try {
    const { createdTiles, infos } = installGatheringEnvFoundry({
      isGM: true,
      environments: SYS_A_ENVS,
      tasks: [{ id: 'task-9', name: 'Chop Wood' }]
    });
    const manager = new InteractableManager({
      regionEnvironmentIdsAtPoint: () => ['env-cave'],
      promptDropEnvironment: async () => { throw new Error('dialog must not open on a single region hit'); }
    });

    const created = await manager._spawnGatheringTask({
      classification: taskClassification(),
      point: { x: 5, y: 6 },
      forceDialog: false
    });

    assert.equal(createdTiles.length, 1);
    assert.equal(createdTiles[0].flags.fabricate.environmentId, 'env-cave', 'the region environment wins');
    assert.equal(created, createdTiles[0]);
    assert.equal(infos.length, 1, 'a region auto-resolve notification fired');
    assert.equal(infos[0], 'FABRICATE.Canvas.Interactable.EnvironmentAutoResolved');
  } finally {
    restoreGlobals(saved);
  }
});

test('(b) task defaultEnvironmentId → tile created with that id and NO notification', async () => {
  const saved = snapshotGlobals();
  try {
    const { createdTiles, infos } = installGatheringEnvFoundry({
      isGM: true,
      environments: SYS_A_ENVS,
      tasks: [{ id: 'task-9', name: 'Chop Wood', defaultEnvironmentId: 'env-forest' }]
    });
    const manager = new InteractableManager({
      regionEnvironmentIdsAtPoint: () => [],
      promptDropEnvironment: async () => { throw new Error('dialog must not open when a default resolves'); }
    });

    await manager._spawnGatheringTask({
      classification: taskClassification(),
      point: { x: 1, y: 2 },
      forceDialog: false
    });

    assert.equal(createdTiles.length, 1);
    assert.equal(createdTiles[0].flags.fabricate.environmentId, 'env-forest', 'the task default is stamped');
    assert.equal(infos.length, 0, 'the task-default tier is silent (no auto-resolve notification)');
  } finally {
    restoreGlobals(saved);
  }
});

test('(c) dialog confirm → tile created with the chosen environmentId', async () => {
  const saved = snapshotGlobals();
  try {
    const { createdTiles, infos } = installGatheringEnvFoundry({
      isGM: true,
      environments: SYS_A_ENVS,
      tasks: [{ id: 'task-9', name: 'Chop Wood' }]
    });
    const dialogCalls = [];
    const manager = new InteractableManager({
      regionEnvironmentIdsAtPoint: () => [],
      promptDropEnvironment: async (args) => { dialogCalls.push(args); return 'env-cave'; }
    });

    await manager._spawnGatheringTask({
      classification: taskClassification(),
      point: { x: 3, y: 4 },
      forceDialog: false
    });

    assert.equal(dialogCalls.length, 1, 'the GM dialog was presented');
    assert.deepEqual(
      dialogCalls[0].environments.map((env) => env.id).sort(),
      ['env-cave', 'env-forest'],
      'the dialog is offered the system environments'
    );
    assert.equal(createdTiles.length, 1);
    assert.equal(createdTiles[0].flags.fabricate.environmentId, 'env-cave', 'the chosen environment is stamped');
    assert.equal(infos.length, 0, 'the dialog tier does not fire the region notification');
  } finally {
    restoreGlobals(saved);
  }
});

test('(d) dialog cancel → NO tile created and NO notification (abort)', async () => {
  const saved = snapshotGlobals();
  try {
    const { createdTiles, infos } = installGatheringEnvFoundry({
      isGM: true,
      environments: SYS_A_ENVS,
      tasks: [{ id: 'task-9', name: 'Chop Wood' }]
    });
    const manager = new InteractableManager({
      regionEnvironmentIdsAtPoint: () => [],
      promptDropEnvironment: async () => null
    });

    const result = await manager._spawnGatheringTask({
      classification: taskClassification(),
      point: { x: 7, y: 8 },
      forceDialog: false
    });

    assert.equal(result, null, 'a cancelled dialog aborts the spawn');
    assert.equal(createdTiles.length, 0, 'NO tile is created when the GM cancels');
    assert.equal(infos.length, 0, 'NO notification fires on cancel');
  } finally {
    restoreGlobals(saved);
  }
});

test('(e) Alt-held → dialog path taken even when a region + default would resolve', async () => {
  const saved = snapshotGlobals();
  try {
    const { createdTiles, infos } = installGatheringEnvFoundry({
      isGM: true,
      environments: SYS_A_ENVS,
      tasks: [{ id: 'task-9', name: 'Chop Wood', defaultEnvironmentId: 'env-forest' }]
    });
    const dialogCalls = [];
    const manager = new InteractableManager({
      regionEnvironmentIdsAtPoint: () => ['env-cave'],
      promptDropEnvironment: async (args) => { dialogCalls.push(args); return 'env-forest'; }
    });

    await manager._spawnGatheringTask({
      classification: taskClassification(),
      point: { x: 9, y: 10 },
      forceDialog: true
    });

    assert.equal(dialogCalls.length, 1, 'Alt forces the GM dialog');
    assert.equal(createdTiles.length, 1);
    assert.equal(createdTiles[0].flags.fabricate.environmentId, 'env-forest', 'the dialog choice is stamped');
    assert.equal(infos.length, 0, 'the forced-dialog path does not fire the region notification');
  } finally {
    restoreGlobals(saved);
  }
});
