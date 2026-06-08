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

/**
 * Flush queued microtasks so a fire-and-forget `_spawnGatheringTask` (kicked off
 * synchronously by `_onDrop`) settles before assertions. The chain awaits the
 * region hit-test (sync), `ensureInteractableActor()`, and `TokenDocument.create`
 * — all microtask-resolved fakes — so a handful of turns drains it.
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
 * @param {object[]} [opts.tools]   Library tools for system 'sysA'.
 * @param {object[]} [opts.tasks]   Library gathering tasks for system 'sysA'.
 * @returns {{ createdTokens: object[], createdActors: object[], warnings: string[] }}
 */
function installFakeFoundry({ isGM = true, tools = [{ id: 'tool-1' }], tasks = [{ id: 'task-9' }] } = {}) {
  const createdTokens = [];
  const createdActors = [];
  const warnings = [];
  const infos = [];

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
    notifications: {
      warn: (msg) => warnings.push(msg),
      info: (msg) => infos.push(msg)
    }
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

  return { createdTokens, createdActors, warnings, infos, backingActor };
}

// A drag payload the classifier accepts as a Fabricate Tool.
const TOOL_DROP = { fabricate: { interactableType: 'tool', systemId: 'sysA', toolId: 'tool-1' } };
// A drag payload the classifier accepts as a Fabricate Gathering Task.
const TASK_DROP = { fabricate: { interactableType: 'gatheringTask', systemId: 'sysA', taskId: 'task-9' } };
// A plain Foundry drop that is NOT a Fabricate interactable.
const FOREIGN_DROP = { type: 'Item', uuid: 'Item.unknown' };

// --- register() idempotency -------------------------------------------------

test('register() binds the dropCanvasData hook exactly once across repeated calls', () => {
  const saved = snapshotGlobals();
  try {
    const registrations = [];
    globalThis.Hooks = { on: (hook, fn) => registrations.push({ hook, fn }) };
    // No Token class available ⇒ the double-click wrap install is a no-op (it is
    // exercised directly in interactable-doubleclick-wrap.test.js).

    const manager = new InteractableManager();
    manager.register();
    manager.register(); // second call must be a no-op.

    const hooks = registrations.map(r => r.hook);
    assert.deepEqual(hooks.sort(), ['dropCanvasData']);
    assert.equal(registrations.length, 1, 'the drop hook is bound only once');
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

test('_onDrop suppresses Foundry AND spawns a gathering-task token on the happy path', async () => {
  const saved = snapshotGlobals();
  try {
    // tier-2 default-environment resolution: no dialog, deterministic spawn.
    const { createdTokens } = installGatheringEnvFoundry({
      isGM: true,
      environments: [{ id: 'env-1', craftingSystemId: 'sysA', name: 'Forest' }],
      tasks: [{ id: 'task-9', name: 'Chop Wood', defaultEnvironmentId: 'env-1' }]
    });
    // Default region hit-test returns no hits (no scene regions), so resolution
    // falls to the task default; the dialog must never be reached on this path.
    const manager = new InteractableManager({
      promptDropEnvironment: async () => { throw new Error('dialog must not open on the default-environment path'); }
    });

    const result = manager._onDrop(globalThis.canvas, { ...TASK_DROP, x: 10, y: 20 });
    // The hook returns false synchronously to suppress Foundry's default drop…
    assert.equal(result, false);
    // …then the fire-and-forget spawn settles and creates a real token.
    await flushAsync();
    assert.equal(createdTokens.length, 1, 'a gathering-task token is created on the happy path');
    assert.equal(createdTokens[0].name, 'Chop Wood', 'the token takes the task name (nameplate discoverability)');
    assert.equal(createdTokens[0].flags.fabricate.interactableType, 'gatheringTask');
    assert.equal(createdTokens[0].flags.fabricate.environmentId, 'env-1', 'the default environment is stamped onto the token flag');
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

// --- Phase 5: gathering-task double-click → show('gathering', { … }) ---------

function gatheringTaskToken(sourceUuid = 'Fabricate.sysA.gatheringTask.task-9', extra = {}) {
  return {
    id: 'token-77',
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
  // The region auto-resolve notification formats a localized message; echo the
  // key so the notify assertions can match without a real i18n bundle.
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

    manager._onDoubleClick(gatheringTaskToken('Fabricate.sysA.gatheringTask.task-9', {
      node: { enabled: true, max: 3, current: 1, respawn: { policy: 'manual' } }
    }));

    assert.equal(shows.length, 1, 'the gathering app opened once');
    assert.equal(shows[0].tab, 'gathering');
    assert.equal(shows[0].options.environmentId, 'env-1');
    assert.equal(shows[0].options.taskId, 'task-9');
    assert.equal(typeof shows[0].options.nodeStateOverride?.read, 'function', 'a per-token node adapter was injected');
    assert.equal(shows[0].options.nodeStateOverride.read().current, 1, 'the adapter reads the token node');
  } finally {
    restoreGlobals(saved);
  }
});

test('gathering-task double-click prefers an environmentId already on the token flag', () => {
  const saved = snapshotGlobals();
  try {
    installGatheringEnvFoundry({
      isGM: true,
      environments: [{ id: 'env-other', craftingSystemId: 'sysA', enabledTaskIds: ['task-9'] }]
    });
    const shows = [];
    const manager = new InteractableManager({ getAppClass: () => ({ show: (tab, options) => shows.push({ tab, options }) }) });

    manager._onDoubleClick(gatheringTaskToken('Fabricate.sysA.gatheringTask.task-9', { environmentId: 'env-static' }));

    assert.equal(shows.length, 1);
    assert.equal(shows[0].options.environmentId, 'env-static', 'the token-flag environment wins over the fallback');
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

    manager._onDoubleClick(gatheringTaskToken());

    assert.equal(shows.length, 0, 'no session opens without an active GM to apply node writes');
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0], 'FABRICATE.Canvas.Interactable.NoActiveGM');
  } finally {
    restoreGlobals(saved);
  }
});

// --- Phase 6: _spawnGatheringTask env-resolution orchestration ---------------
// The COMPOSITION seam: region hit-test → pure resolveDropEnvironment → (dialog) →
// notify → spawn/abort. Region hit-test + the GM dialog are injected as fakes;
// the env-store, ui.notifications, and the TokenDocument-create edge resolve
// through the same globalThis fakes the rest of the suite uses. Production wiring
// resolves these seams to the real Foundry edges (constructor defaults).

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

test('(a) region single-hit → token created with the region environmentId + notification fired', async () => {
  const saved = snapshotGlobals();
  try {
    const { createdTokens, infos } = installGatheringEnvFoundry({
      isGM: true,
      environments: SYS_A_ENVS,
      tasks: [{ id: 'task-9', name: 'Chop Wood' }]
    });
    const manager = new InteractableManager({
      // One unambiguous flagged region contains the drop point.
      regionEnvironmentIdsAtPoint: () => ['env-cave'],
      promptDropEnvironment: async () => { throw new Error('dialog must not open on a single region hit'); }
    });

    const created = await manager._spawnGatheringTask({
      classification: taskClassification(),
      point: { x: 5, y: 6 },
      forceDialog: false
    });

    assert.equal(createdTokens.length, 1);
    assert.equal(createdTokens[0].flags.fabricate.environmentId, 'env-cave', 'the region environment wins');
    assert.equal(created, createdTokens[0]);
    // Region auto-resolve announces the resolved environment.
    assert.equal(infos.length, 1, 'a region auto-resolve notification fired');
    assert.equal(infos[0], 'FABRICATE.Canvas.Interactable.EnvironmentAutoResolved');
  } finally {
    restoreGlobals(saved);
  }
});

test('(b) task defaultEnvironmentId → token created with that id and NO notification', async () => {
  const saved = snapshotGlobals();
  try {
    const { createdTokens, infos } = installGatheringEnvFoundry({
      isGM: true,
      environments: SYS_A_ENVS,
      tasks: [{ id: 'task-9', name: 'Chop Wood', defaultEnvironmentId: 'env-forest' }]
    });
    const manager = new InteractableManager({
      regionEnvironmentIdsAtPoint: () => [], // no region hit → fall to the task default.
      promptDropEnvironment: async () => { throw new Error('dialog must not open when a default resolves'); }
    });

    await manager._spawnGatheringTask({
      classification: taskClassification(),
      point: { x: 1, y: 2 },
      forceDialog: false
    });

    assert.equal(createdTokens.length, 1);
    assert.equal(createdTokens[0].flags.fabricate.environmentId, 'env-forest', 'the task default is stamped');
    assert.equal(infos.length, 0, 'the task-default tier is silent (no auto-resolve notification)');
  } finally {
    restoreGlobals(saved);
  }
});

test('(c) dialog confirm → token created with the chosen environmentId', async () => {
  const saved = snapshotGlobals();
  try {
    const { createdTokens, infos } = installGatheringEnvFoundry({
      isGM: true,
      environments: SYS_A_ENVS,
      tasks: [{ id: 'task-9', name: 'Chop Wood' }] // no region hit, no default → dialog.
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
    assert.equal(createdTokens.length, 1);
    assert.equal(createdTokens[0].flags.fabricate.environmentId, 'env-cave', 'the chosen environment is stamped');
    assert.equal(infos.length, 0, 'the dialog tier does not fire the region notification');
  } finally {
    restoreGlobals(saved);
  }
});

test('(d) dialog cancel → NO token created and NO notification (abort)', async () => {
  const saved = snapshotGlobals();
  try {
    const { createdTokens, infos } = installGatheringEnvFoundry({
      isGM: true,
      environments: SYS_A_ENVS,
      tasks: [{ id: 'task-9', name: 'Chop Wood' }]
    });
    const manager = new InteractableManager({
      regionEnvironmentIdsAtPoint: () => [],
      promptDropEnvironment: async () => null // GM cancels / closes the dialog.
    });

    const result = await manager._spawnGatheringTask({
      classification: taskClassification(),
      point: { x: 7, y: 8 },
      forceDialog: false
    });

    assert.equal(result, null, 'a cancelled dialog aborts the spawn');
    assert.equal(createdTokens.length, 0, 'NO token is created when the GM cancels');
    assert.equal(infos.length, 0, 'NO notification fires on cancel');
  } finally {
    restoreGlobals(saved);
  }
});

test('(e) Alt-held → dialog path taken even when a region + default would resolve', async () => {
  const saved = snapshotGlobals();
  try {
    const { createdTokens, infos } = installGatheringEnvFoundry({
      isGM: true,
      environments: SYS_A_ENVS,
      // Both an auto-resolving region AND a task default are present…
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
      forceDialog: true // …but Alt forces the dialog, bypassing tiers 1 + 2.
    });

    assert.equal(dialogCalls.length, 1, 'Alt forces the GM dialog');
    assert.equal(createdTokens.length, 1);
    assert.equal(createdTokens[0].flags.fabricate.environmentId, 'env-forest', 'the dialog choice is stamped');
    assert.equal(infos.length, 0, 'the forced-dialog path does not fire the region notification');
  } finally {
    restoreGlobals(saved);
  }
});
