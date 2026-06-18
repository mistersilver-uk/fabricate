import test from 'node:test';
import assert from 'node:assert/strict';

import { GatheringEngine } from '../src/systems/GatheringEngine.js';
import { GatheringListingBuilder } from '../src/systems/GatheringListingBuilder.js';

const player = { id: 'user-1', isGM: false };
const gm = { id: 'gm-1', isGM: true };
const actor = { id: 'actor-1', uuid: 'Actor.actor-1', name: 'Gatherer', items: [] };

function sameActor(left, right) {
  return Boolean(left && right && (left === right || left.id === right.id || left.uuid === right.uuid));
}

function task(overrides = {}) {
  return {
    id: 'task-a',
    name: 'Gather Iron',
    description: 'Search for ore.',
    img: 'icons/svg/item-bag.svg',
    enabled: true,
    resolutionMode: 'routed',
    toolIds: [],
    resultGroups: [{ id: 'group-a', name: 'Iron', results: [] }],
    resultSelection: { provider: 'macroOutcome', macroUuid: 'Macro.outcome' },
    ...overrides,
  };
}

function environment(overrides = {}) {
  const env = {
    id: 'env-a',
    craftingSystemId: 'system-a',
    name: 'Old Mine',
    description: 'A narrow mine.',
    enabled: true,
    selectionMode: 'targeted',
    sceneUuid: null,
    tasks: [task()],
    events: [],
    rules: {},
    ...overrides,
  };
  Object.defineProperty(env, '__libraryTools', {
    value: new Map(),
    enumerable: false,
    configurable: true,
  });
  return env;
}

// Build a real engine so the listing builder is wired with the engine's bound
// shared-helper callbacks (the production default-construction path). Tests then
// drive `engine.listingBuilder` directly and via the public delegators.
function makeEngine({
  systems = [{ id: 'system-a', enabled: true, features: { gathering: true }, components: [] }],
  environments = [environment()],
  selectableActors = [actor],
  visibility = new Map(),
  activeRuns = [],
  history = [],
  richState = null,
} = {}) {
  return new GatheringEngine({
    richState,
    systemManager: null,
    environmentStore: { list: () => environments },
    getSystems: () => systems,
    getSelectableActors: () => selectableActors,
    isActorSelectable: ({ actor: candidate }) => selectableActors.some((entry) => sameActor(entry, candidate)),
    isGamePaused: () => false,
    evaluator: {
      evaluateVisibility: async ({ task: candidate }) => {
        const result = visibility instanceof Map ? visibility.get(candidate.id) : visibility?.[candidate.id];
        return result ?? { visible: true, reasonCode: 'VISIBLE', diagnostic: null };
      },
    },
    sceneAccess: { canAttempt: () => ({ allowed: true }) },
    runManager: {
      getActiveRuns: () => activeRuns,
      getRunHistory: () => history,
      findActiveRunForTask: () => null,
    },
    toolAvailability: { check: () => ({ available: true, missing: [], failedRequirements: [] }) },
    localize: (key) => key,
  });
}

test('engine exposes a GatheringListingBuilder under default construction', () => {
  const engine = makeEngine();
  assert.ok(engine.listingBuilder instanceof GatheringListingBuilder);
});

test('public delegators forward to the builder and return byte-identical output', async () => {
  const engine = makeEngine();
  let forwarded = null;
  // Spy on the builder so we prove the engine delegates rather than reimplements.
  const originalList = engine.listingBuilder.listForActor.bind(engine.listingBuilder);
  engine.listingBuilder.listForActor = async (args) => {
    forwarded = args;
    return originalList(args);
  };

  const viaEngine = await engine.listForActor({ viewer: player, actor });
  assert.ok(forwarded, 'engine.listForActor delegated to the builder');

  // Restore + compare against a direct builder call: identical structure.
  engine.listingBuilder.listForActor = originalList;
  const viaBuilder = await engine.listingBuilder.listForActor({ viewer: player, actor });
  assert.deepEqual(viaEngine, viaBuilder);
});

test('targeted listing renders the full task list transparently for a player', async () => {
  const engine = makeEngine();

  const listing = await engine.listForActor({ viewer: player, actor });

  assert.equal(listing.visible, true);
  assert.equal(listing.environments.length, 1);
  const env = listing.environments[0];
  assert.equal(env.selectionMode, 'targeted');
  assert.equal(env.tasks.length, 1);
  assert.equal(env.tasks[0].id, 'task-a');
  assert.equal(env.tasks[0].blind, false);
  assert.deepEqual(env.discoveredTasks, []);
  assert.equal(env.composedTaskCount, 1);
});

test('blind listing collapses to one opaque action for a player and redacts task identity', async () => {
  const engine = makeEngine({
    environments: [environment({ selectionMode: 'blind', tasks: [task(), task({ id: 'task-b', name: 'Gather Tin' })] })],
  });

  const listing = await engine.listForActor({ viewer: player, actor });
  const env = listing.environments[0];

  assert.equal(env.selectionMode, 'blind');
  assert.equal(env.tasks.length, 1, 'only the collapsed action is listed');
  assert.equal(env.tasks[0].action, 'blindGather');
  assert.equal(env.tasks[0].id, undefined);
  assert.equal(env.tasks[0].name, null);
  // The composed-task denominator still counts every composed task.
  assert.equal(env.composedTaskCount, 2);
  assert.equal(env.discoveredTaskCount, 0);
  assert.deepEqual(env.discoveredTasks, []);
});

test('GM viewer of a blind environment sees the full transparent task list', async () => {
  const engine = makeEngine({
    environments: [environment({ selectionMode: 'blind', tasks: [task(), task({ id: 'task-b', name: 'Gather Tin' })] })],
  });

  const playerListing = await engine.listForActor({ viewer: player, actor });
  const gmListing = await engine.listForActor({ viewer: gm, actor });

  // GM divergence: full transparent list vs collapsed opaque action.
  assert.equal(gmListing.environments[0].tasks.length, 2);
  assert.equal(gmListing.environments[0].tasks[0].id, 'task-a');
  assert.equal(gmListing.environments[0].tasks[1].id, 'task-b');
  assert.equal(playerListing.environments[0].tasks.length, 1);
  assert.equal(playerListing.environments[0].tasks[0].action, 'blindGather');
});

test('discovered tasks surface revealed blind tasks with discovery counts', async () => {
  const revealed = ['task-a'];
  const richState = {
    listRevealedTaskIds: () => revealed,
    countRevealedTasks: () => revealed.length,
  };
  const engine = makeEngine({
    environments: [
      environment({
        selectionMode: 'blind',
        rules: { revealPolicy: 'onAttempt', revealScope: 'actor' },
        tasks: [task(), task({ id: 'task-b', name: 'Gather Tin' })],
      }),
    ],
    richState,
  });

  const listing = await engine.listForActor({ viewer: player, actor });
  const env = listing.environments[0];

  assert.equal(env.revealPolicy, 'onAttempt');
  assert.equal(env.discoveredTaskCount, 1);
  assert.equal(env.discoveredTasks.length, 1);
  assert.equal(env.discoveredTasks[0].id, 'task-a');
  assert.equal(env.discoveredTasks[0].discovered, true);
  // Discovered rows are transparent (real identity + name), not the opaque
  // collapse. They still carry `blind: true` (the env is blind) but expose the
  // real task id/name rather than the `blindGather` action.
  assert.equal(env.discoveredTasks[0].name, 'Gather Iron');
  assert.equal(env.discoveredTasks[0].action, undefined);
});

test('gathering system options are sorted by name via localeCompare', async () => {
  const engine = makeEngine({
    systems: [
      { id: 'system-a', enabled: true, features: { gathering: true }, name: 'Zephyr Survival', components: [] },
      { id: 'system-b', enabled: true, features: { gathering: true }, name: 'Alpine Foraging', components: [] },
    ],
    environments: [
      environment({ id: 'env-a', craftingSystemId: 'system-a' }),
      environment({ id: 'env-b', craftingSystemId: 'system-b' }),
    ],
  });

  const listing = await engine.listForActor({ viewer: player, actor });

  assert.deepEqual(
    listing.gatheringSystems.map((option) => option.name),
    ['Alpine Foraging', 'Zephyr Survival']
  );
});

test('getTaskDropBreakdown returns drops for a visible d100 task and gates hidden tasks', async () => {
  const richState = {
    previewDropBreakdown: async () => ({
      successChance: 0.5,
      awardMode: 'all',
      awardLimit: 2,
      eventPolicy: 'none',
      drops: [{ componentId: 'iron', dropRate: 40 }],
    }),
  };
  const engine = makeEngine({
    environments: [environment({ tasks: [task({ id: 'task-d100', resolutionMode: 'd100', dropRows: [{ enabled: true, dropRate: 40, componentId: 'iron', quantity: 1 }] })] })],
    richState,
  });

  const breakdown = await engine.getTaskDropBreakdown({
    environmentId: 'env-a',
    taskId: 'task-d100',
    viewer: player,
  });

  assert.equal(breakdown.resolutionMode, 'd100');
  assert.equal(breakdown.awardLimit, 2);
  assert.equal(breakdown.drops.length, 1);
  assert.equal(breakdown.drops[0].componentId, 'iron');
  // A drop always carries a fallback image.
  assert.ok(breakdown.drops[0].img);

  // An unknown task id is gated to the empty shape (no leak).
  const missing = await engine.getTaskDropBreakdown({
    environmentId: 'env-a',
    taskId: 'not-a-task',
    viewer: player,
  });
  assert.deepEqual(missing.drops, []);
  assert.equal(missing.resolutionMode, null);
});

test('getTaskDropBreakdown does not leak a blind, undiscovered task to a player', async () => {
  const richState = {
    previewDropBreakdown: async () => ({ drops: [{ componentId: 'iron', dropRate: 40 }] }),
    listRevealedTaskIds: () => [],
    countRevealedTasks: () => 0,
  };
  const engine = makeEngine({
    environments: [
      environment({
        selectionMode: 'blind',
        rules: { revealPolicy: 'onAttempt', revealScope: 'actor' },
        tasks: [task({ id: 'task-d100', resolutionMode: 'd100', dropRows: [{ enabled: true, dropRate: 40, componentId: 'iron', quantity: 1 }] })],
      }),
    ],
    richState,
  });

  // Player cannot see the undiscovered blind task → gated to empty.
  const playerBreakdown = await engine.getTaskDropBreakdown({
    environmentId: 'env-a',
    taskId: 'task-d100',
    viewer: player,
  });
  assert.deepEqual(playerBreakdown.drops, []);

  // GM sees the transparent task → real drops.
  const gmBreakdown = await engine.getTaskDropBreakdown({
    environmentId: 'env-a',
    taskId: 'task-d100',
    viewer: gm,
  });
  assert.equal(gmBreakdown.drops.length, 1);
});
