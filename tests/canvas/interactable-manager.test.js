/**
 * Unit coverage for the Foundry-bound `InteractableManager` seams.
 *
 * The PURE routing logic (classification, spawn-payload shaping, dispatch) is
 * covered in `interactable-resolution.test.js`. This suite exercises the thin
 * Foundry/PIXI edge — hook registration, the dropCanvasData SUPPRESSION
 * CONTRACT, the GM gate, the TokenDocument create payload, and the per-placeable
 * double-click guard — by driving the manager through `globalThis` fakes
 * (`game`, `Hooks`, `canvas`, `foundry.documents.TokenDocument`,
 * `ui.notifications`). No real Foundry runtime is involved; the manager already
 * reads these as globals, so no seam extraction was required.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { InteractableManager } from '../../src/canvas/InteractableManager.js';
import { INTERACTABLE_ACTOR_FLAG } from '../../src/canvas/interactableActor.js';

// --- globalThis fake scaffolding -------------------------------------------

const GLOBAL_KEYS = ['game', 'Hooks', 'canvas', 'foundry', 'Actor', 'CONFIG', 'ui'];

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
 * @param {object[]} [opts.tools]   Library tools for system 'sysA'.
 * @param {object[]} [opts.tasks]   Library gathering tasks for system 'sysA'.
 * @returns {{ createdTokens: object[], createdActors: object[], warnings: string[] }}
 */
function installFakeFoundry({ isGM = true, tools = [{ id: 'tool-1' }], tasks = [{ id: 'task-9' }] } = {}) {
  const createdTokens = [];
  const createdActors = [];
  const warnings = [];

  const backingActor = {
    id: 'actor-backing',
    name: 'Fabricate Interactable',
    flags: { fabricate: { [INTERACTABLE_ACTOR_FLAG]: true } }
  };

  globalThis.game = {
    user: { isGM },
    documentTypes: { Actor: ['npc', 'character'] },
    actors: { contents: [backingActor] },
    i18n: { localize: (key) => key },
    fabricate: {
      getCraftingSystemManager: () => ({
        getSystem: (systemId) => (systemId === 'sysA' ? { tools } : null)
      })
    },
    // getSetting() reads the bare `game` global → resolves here.
    settings: {
      get: (_namespace, _key) => ({ systems: { sysA: { tasks } } })
    }
  };

  globalThis.ui = {
    notifications: { warn: (msg) => warnings.push(msg) }
  };

  globalThis.canvas = {
    scene: { id: 'scene-1' },
    tokens: { placeables: [] }
  };

  globalThis.foundry = {
    documents: {
      TokenDocument: {
        create: async (data, ctx) => {
          const created = { ...data, _ctx: ctx };
          createdTokens.push(created);
          return created;
        }
      }
    }
  };

  globalThis.Actor = {
    create: async (data) => {
      createdActors.push(data);
      return { id: 'actor-created', ...data };
    }
  };

  return { createdTokens, createdActors, warnings, backingActor };
}

// A drag payload the classifier accepts as a Fabricate Tool.
const TOOL_DROP = { fabricate: { interactableType: 'tool', systemId: 'sysA', toolId: 'tool-1' } };
// A drag payload the classifier accepts as a Fabricate Gathering Task.
const TASK_DROP = { fabricate: { interactableType: 'gatheringTask', systemId: 'sysA', taskId: 'task-9' } };
// A plain Foundry drop that is NOT a Fabricate interactable.
const FOREIGN_DROP = { type: 'Item', uuid: 'Item.unknown' };

// --- register() idempotency -------------------------------------------------

test('register() binds each canvas hook exactly once across repeated calls', () => {
  const saved = snapshotGlobals();
  try {
    const registrations = [];
    globalThis.Hooks = { on: (hook, fn) => registrations.push({ hook, fn }) };

    const manager = new InteractableManager();
    manager.register();
    manager.register(); // second call must be a no-op.

    const hooks = registrations.map(r => r.hook);
    assert.deepEqual(hooks.sort(), ['canvasReady', 'drawToken', 'dropCanvasData']);
    assert.equal(registrations.length, 3, 'each hook bound only once');
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

test('_onDrop returns false (suppresses Foundry) for a Fabricate Gathering Task drop', () => {
  const saved = snapshotGlobals();
  try {
    installFakeFoundry({ isGM: true });
    const manager = new InteractableManager();
    const result = manager._onDrop(globalThis.canvas, { ...TASK_DROP, x: 10, y: 20 });
    assert.equal(result, false);
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
    const { createdTokens, warnings } = installFakeFoundry({ isGM: false });
    const manager = new InteractableManager();

    const result = manager._onDrop(globalThis.canvas, { ...TOOL_DROP, x: 5, y: 5 });

    // Suppressed (recognized, but a non-GM may not place it).
    assert.equal(result, false);
    await Promise.resolve();
    // No token was created.
    assert.equal(createdTokens.length, 0);
    // The GM-only notification surfaced.
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0], 'FABRICATE.Canvas.Interactable.GMOnlySpawn');
  } finally {
    restoreGlobals(saved);
  }
});

// --- _spawnInteractable create payload --------------------------------------

test('_spawnInteractable builds the expected unlinked TokenDocument create payload', async () => {
  const saved = snapshotGlobals();
  try {
    const { createdTokens, backingActor } = installFakeFoundry({ isGM: true });
    const manager = new InteractableManager();

    const created = await manager._spawnInteractable({
      interactableType: 'tool',
      sourceUuid: 'Fabricate.sysA.tool.tool-1',
      x: 120,
      y: 240
    });

    assert.equal(createdTokens.length, 1);
    const payload = createdTokens[0];
    assert.equal(payload.name, backingActor.name);
    assert.equal(payload.actorId, backingActor.id);
    assert.equal(payload.actorLink, false, 'interactable tokens are UNLINKED');
    assert.equal(payload.x, 120);
    assert.equal(payload.y, 240);
    assert.deepEqual(payload.flags.fabricate, {
      isInteractable: true,
      interactableType: 'tool',
      sourceUuid: 'Fabricate.sysA.tool.tool-1'
    });
    // Created against the active scene.
    assert.equal(payload._ctx.parent, globalThis.canvas.scene);
    assert.equal(created, payload);
  } finally {
    restoreGlobals(saved);
  }
});

test('_spawnInteractable carries environmentId into the gathering-task flag block', async () => {
  const saved = snapshotGlobals();
  try {
    const { createdTokens } = installFakeFoundry({ isGM: true });
    const manager = new InteractableManager();

    await manager._spawnInteractable({
      interactableType: 'gatheringTask',
      sourceUuid: 'Fabricate.sysA.gatheringTask.task-9',
      environmentId: 'env-3',
      x: 1,
      y: 2
    });

    assert.equal(createdTokens.length, 1);
    assert.deepEqual(createdTokens[0].flags.fabricate, {
      isInteractable: true,
      interactableType: 'gatheringTask',
      sourceUuid: 'Fabricate.sysA.gatheringTask.task-9',
      environmentId: 'env-3'
    });
  } finally {
    restoreGlobals(saved);
  }
});

// --- _attachDoubleClick idempotency -----------------------------------------

function fakeInteractablePlaceable() {
  const listeners = [];
  return {
    on: (event, fn) => listeners.push({ event, fn }),
    _listeners: listeners,
    document: {
      flags: {
        fabricate: {
          isInteractable: true,
          interactableType: 'tool',
          sourceUuid: 'Fabricate.sysA.tool.tool-1'
        }
      }
    }
  };
}

test('_attachDoubleClick binds clickLeft2 only once per placeable (canvasReady + drawToken)', () => {
  const saved = snapshotGlobals();
  try {
    installFakeFoundry({ isGM: true });
    const manager = new InteractableManager();
    const placeable = fakeInteractablePlaceable();

    // Re-attach via both seam paths against the SAME placeable.
    manager._attachDoubleClick(placeable);
    manager._onTokenDrawn(placeable);
    globalThis.canvas.tokens.placeables = [placeable];
    manager._attachListeners();

    const clickLeft2 = placeable._listeners.filter(l => l.event === 'clickLeft2');
    assert.equal(clickLeft2.length, 1, 'clickLeft2 bound exactly once');
    assert.equal(placeable._fabricateInteractableBound, true);
  } finally {
    restoreGlobals(saved);
  }
});

test('_attachDoubleClick is a no-op for a non-interactable placeable', () => {
  const saved = snapshotGlobals();
  try {
    installFakeFoundry({ isGM: true });
    const manager = new InteractableManager();
    const placeable = {
      on: () => { throw new Error('must not bind on a non-interactable token'); },
      document: { flags: {} }
    };
    manager._attachDoubleClick(placeable);
    assert.equal(placeable._fabricateInteractableBound, undefined);
  } finally {
    restoreGlobals(saved);
  }
});

// --- Phase 4: tool double-click → show('gathering', { activeCanvasTool }) ----
// Interim routing: the crafting tab is still a "Coming Soon" placeholder, so a
// Tool token routes to the gathering tab (the only live surface where the
// virtual-present tool has a visible effect). Revisit when crafting ships.

function toolToken(sourceUuid = 'Fabricate.sysA.tool.tool-1') {
  return { flags: { fabricate: { isInteractable: true, interactableType: 'tool', sourceUuid } } };
}

test('tool double-click resolves the Tool and opens the gathering tab with the activeCanvasTool payload', () => {
  const saved = snapshotGlobals();
  try {
    // Library Tool carries the componentId + label the activeCanvasTool needs.
    installFakeFoundry({ isGM: true, tools: [{ id: 'tool-1', componentId: 'comp-axe', label: 'Forge Anvil' }] });
    const shows = [];
    const fakeApp = { show: (tab, options) => { shows.push({ tab, options }); } };
    const manager = new InteractableManager({ getAppClass: () => fakeApp });

    manager._onDoubleClick(toolToken());

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
    // The library has no matching tool id, so getTool returns null.
    installFakeFoundry({ isGM: true, tools: [] });
    const shows = [];
    const fakeApp = { show: (tab, options) => { shows.push({ tab, options }); } };
    const manager = new InteractableManager({ getAppClass: () => fakeApp });

    manager._onDoubleClick(toolToken());

    assert.equal(shows.length, 0, 'no app opens without a resolvable Tool');
  } finally {
    restoreGlobals(saved);
  }
});

test('gathering-task double-click does NOT open the crafting tool session (Phase 5 stub)', () => {
  const saved = snapshotGlobals();
  try {
    installFakeFoundry({ isGM: true });
    const shows = [];
    const manager = new InteractableManager({ getAppClass: () => ({ show: (tab, options) => shows.push({ tab, options }) }) });

    manager._onDoubleClick({
      flags: { fabricate: { isInteractable: true, interactableType: 'gatheringTask', sourceUuid: 'Fabricate.sysA.gatheringTask.task-9' } }
    });

    assert.equal(shows.length, 0, 'the gathering-task branch is still the Phase-3/5 stub');
  } finally {
    restoreGlobals(saved);
  }
});
