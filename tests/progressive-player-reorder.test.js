/**
 * Issue 651 Phase 4 — runtime honour of the player's progressive result order.
 *
 * The two caller sites own order (D0: `resolveProgressiveAward` orders nothing). These
 * tests pin the COMPOSITION at each site: deleting the `applyPlayerResultOrder` call from
 * `_resolveProgressiveResultGroups` or from `_resolveSalvageResultGroups` must each flip a
 * test red, and deleting the D2 capture must flip the salvage resume test red.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

function getProperty(obj, path) {
  if (!obj || !path) return undefined;
  return String(path)
    .split('.')
    .reduce((v, k) => (v == null ? undefined : v[k]), obj);
}

let idSeq = 0;
globalThis.foundry = {
  utils: { randomID: () => `rid-${++idSeq}`, getProperty },
};
globalThis.ui = { notifications: { info: () => {}, warn: () => {}, error: () => {} } };
globalThis.fromUuid = async () => null;

const { ResolutionModeService } = await import('../src/systems/ResolutionModeService.js');
const { CraftingEngine } = await import('../src/systems/CraftingEngine.js');
const { SalvageRunManager } = await import('../src/systems/SalvageRunManager.js');

// ---------------------------------------------------------------------------
// Recipe path — ResolutionModeService._resolveProgressiveResultGroups
// ---------------------------------------------------------------------------

// Each result costs its own difficulty; a budget of 3 awards exactly the first 3 stages
// in whatever order the list is in, so `awardedResultIds` reads out the applied order.
const SYSTEM = {
  id: 'sys-1',
  resolutionMode: 'progressive',
  craftingCheck: { progressive: { awardMode: 'equal' } },
  components: [
    { id: 'c-a', difficulty: 1 },
    { id: 'c-b', difficulty: 1 },
    { id: 'c-c', difficulty: 1 },
    { id: 'c-d', difficulty: 1 },
  ],
};

function makeService({ getPlayerResultOrder } = {}) {
  const manager = { getSystem: () => SYSTEM };
  return getPlayerResultOrder
    ? new ResolutionModeService(manager, { getPlayerResultOrder })
    : new ResolutionModeService(manager);
}

const RESULTS = [
  { id: 'r-a', componentId: 'c-a' },
  { id: 'r-b', componentId: 'c-b' },
  { id: 'r-c', componentId: 'c-c' },
  { id: 'r-d', componentId: 'c-d' },
];

function makeRecipe(overrides = {}) {
  return {
    id: 'recipe-1',
    craftingSystemId: 'sys-1',
    resultGroups: [{ id: 'rg-1', results: RESULTS }],
    ...overrides,
  };
}

function awardedIds(service, recipe, value = 3) {
  return service.resolveResultGroups({ recipe, checkResult: { value } }).meta.awardedResultIds;
}

test('recipe: the stored order decides which stages the budget reaches', () => {
  // Mutation this catches: delete the applyPlayerResultOrder call from
  // _resolveProgressiveResultGroups — the award falls back to authored a,b,c.
  const service = makeService({ getPlayerResultOrder: () => ['r-d', 'r-c', 'r-b'] });
  assert.deepEqual(awardedIds(service, makeRecipe()), ['r-d', 'r-c', 'r-b']);
});

test('recipe: the seam is called with the recipe scope and id', () => {
  const calls = [];
  const service = makeService({
    getPlayerResultOrder: (entry) => {
      calls.push(entry);
      return null;
    },
  });
  awardedIds(service, makeRecipe());
  assert.deepEqual(calls, [{ scope: 'recipe', id: 'recipe-1' }]);
});

test('recipe: allowPlayerResultReorder false pins the AUTHORED order', () => {
  const service = makeService({ getPlayerResultOrder: () => ['r-d', 'r-c', 'r-b'] });
  const recipe = makeRecipe({ allowPlayerResultReorder: false });
  assert.deepEqual(awardedIds(service, recipe), ['r-a', 'r-b', 'r-c']);
});

test('recipe: allowPlayerResultReorder true/undefined both honour the order (default-true)', () => {
  const service = makeService({ getPlayerResultOrder: () => ['r-d'] });
  for (const flag of [true, undefined]) {
    const recipe = makeRecipe({ allowPlayerResultReorder: flag });
    assert.equal(awardedIds(service, recipe, 1)[0], 'r-d', `flag=${flag}`);
  }
});

test('recipe: a null order keeps the authored order', () => {
  const service = makeService({ getPlayerResultOrder: () => null });
  assert.deepEqual(awardedIds(service, makeRecipe()), ['r-a', 'r-b', 'r-c']);
});

test('recipe: an unwired service (no options bag) behaves exactly as pre-651', () => {
  // `new ResolutionModeService()` with no args is a real call site (systemValidation.js).
  assert.doesNotThrow(() => new ResolutionModeService());
  assert.deepEqual(awardedIds(makeService(), makeRecipe()), ['r-a', 'r-b', 'r-c']);
});

test('recipe: stale ids in the stored order degrade gracefully', () => {
  // A GM deleted r-b and r-x never existed: rank what still resolves, tail-append the rest.
  const service = makeService({ getPlayerResultOrder: () => ['r-x', 'r-d', 'r-gone'] });
  const groups = makeService().resolveResultGroups({
    recipe: makeRecipe(),
    checkResult: { value: 99 },
  });
  assert.equal(groups.meta.awardedResultIds.length, 4, 'baseline: all four are reachable');
  assert.deepEqual(awardedIds(service, makeRecipe(), 99), ['r-d', 'r-a', 'r-b', 'r-c']);
});

test('recipe: reordering never drops a stage when the budget covers everything', () => {
  const service = makeService({ getPlayerResultOrder: () => ['r-c'] });
  assert.equal(awardedIds(service, makeRecipe(), 99).length, RESULTS.length);
});

// ---------------------------------------------------------------------------
// D6 — one flat id list reconciles every step; ids are NOT unique across steps
// ---------------------------------------------------------------------------

test('D6: one flat id list reorders a multi-step recipe step by step', () => {
  // Progressive reads `allGroups[0]`, and a step's own resultGroups win over the recipe's,
  // so each step reconciles against the SAME stored list.
  const service = makeService({ getPlayerResultOrder: () => ['r-b', 'r-d'] });
  const recipe = makeRecipe();
  const step1 = { resultGroups: [{ id: 'g1', results: [RESULTS[0], RESULTS[1]] }] };
  const step2 = { resultGroups: [{ id: 'g2', results: [RESULTS[2], RESULTS[3]] }] };

  assert.deepEqual(
    service.resolveResultGroups({ recipe, step: step1, checkResult: { value: 1 } }).meta
      .awardedResultIds,
    ['r-b'],
    'step 1 ranks r-b first; r-d is not in its list and is ignored'
  );
  assert.deepEqual(
    service.resolveResultGroups({ recipe, step: step2, checkResult: { value: 1 } }).meta
      .awardedResultIds,
    ['r-d'],
    'step 2 ranks r-d first; r-b is not in its list and is ignored'
  );
});

test('D6: a result id COLLIDING across two steps ranks independently in each', () => {
  // Nothing enforces cross-step id uniqueness (copy-mode import preserves ids by design).
  // A colliding id ranks in BOTH steps — the documented consequence of one flat list.
  const service = makeService({ getPlayerResultOrder: () => ['dup'] });
  const recipe = makeRecipe();
  const stepA = {
    resultGroups: [{ id: 'gA', results: [{ id: 'r-a', componentId: 'c-a' }, { id: 'dup', componentId: 'c-b' }] }],
  };
  const stepB = {
    resultGroups: [{ id: 'gB', results: [{ id: 'r-c', componentId: 'c-c' }, { id: 'dup', componentId: 'c-d' }] }],
  };

  const a = service.resolveResultGroups({ recipe, step: stepA, checkResult: { value: 1 } });
  const b = service.resolveResultGroups({ recipe, step: stepB, checkResult: { value: 1 } });
  assert.deepEqual(a.meta.awardedResultIds, ['dup'], 'the collision ranks in step A');
  assert.deepEqual(b.meta.awardedResultIds, ['dup'], 'and independently in step B');
  // Length preservation still holds per step: no step loses a result to the collision.
  assert.equal(
    service.resolveResultGroups({ recipe, step: stepA, checkResult: { value: 99 } }).groups[0]
      .results.length,
    2
  );
});

// ---------------------------------------------------------------------------
// Salvage path — order read from the RUN RECORD (D2)
// ---------------------------------------------------------------------------

const SALVAGE_SYSTEM = {
  id: 'sys-1',
  features: { salvage: true },
  salvageResolutionMode: 'progressive',
  salvageCraftingCheck: {
    progressive: { rollFormula: '2d6', awardMode: 'equal' },
    consumption: { consumeComponentOnFail: true, breakToolsOnFail: false },
  },
  components: [
    { id: 'c-a', name: 'Scrap A', difficulty: 1 },
    { id: 'c-b', name: 'Scrap B', difficulty: 1 },
    { id: 'c-c', name: 'Scrap C', difficulty: 1 },
  ],
  craftingCheck: {},
  tools: [],
};

const SALVAGE_GROUP = {
  id: 'sg-1',
  results: [
    { id: 's-a', componentId: 'c-a' },
    { id: 's-b', componentId: 'c-b' },
    { id: 's-c', componentId: 'c-c' },
  ],
};

const salvageComponent = (salvage = {}) => ({
  id: 'comp-1',
  name: 'Dragon Scale',
  salvage: { enabled: true, resultGroups: [SALVAGE_GROUP], ...salvage },
});

test('salvage: the order captured on the run decides the award', () => {
  // Mutation this catches: delete the applyPlayerResultOrder call from
  // _resolveSalvageResultGroups.
  const engine = new CraftingEngine({}, null, null);
  const groups = engine._resolveSalvageResultGroups(
    salvageComponent(),
    SALVAGE_SYSTEM,
    { value: 2 },
    { resultOrder: ['s-c', 's-b'] }
  );
  assert.deepEqual(
    groups[0].results.map((r) => r.id),
    ['s-c', 's-b']
  );
});

test('salvage: allowPlayerResultReorder false pins the authored order', () => {
  const engine = new CraftingEngine({}, null, null);
  const groups = engine._resolveSalvageResultGroups(
    salvageComponent({ allowPlayerResultReorder: false }),
    SALVAGE_SYSTEM,
    { value: 2 },
    { resultOrder: ['s-c', 's-b'] }
  );
  assert.deepEqual(
    groups[0].results.map((r) => r.id),
    ['s-a', 's-b']
  );
});

test('salvage: RUNLESS uses the authored order — there is no settings fallback', () => {
  // The seam would return an order, but no run means no captured order. If someone
  // "fixes" the runless gap with a settings read, the resume path starts reading the
  // executing user's order again and F3 is back.
  const engine = new CraftingEngine({}, null, null, null, null, null, null, {
    getPlayerResultOrder: () => ['s-c', 's-b', 's-a'],
  });
  const groups = engine._resolveSalvageResultGroups(salvageComponent(), SALVAGE_SYSTEM, {
    value: 3,
  });
  assert.deepEqual(
    groups[0].results.map((r) => r.id),
    ['s-a', 's-b', 's-c'],
    'authored order, not the seam order'
  );
});

test('salvage: an unwired engine (no options bag) behaves exactly as pre-651', () => {
  // `new CraftingEngine(recipeManager, null, {})` is the shape many tests already use.
  const engine = new CraftingEngine({}, null, {});
  assert.equal(typeof engine.getPlayerResultOrder, 'function');
  assert.equal(engine.getPlayerResultOrder({ scope: 'salvage', id: 'x' }), null);
});

// ---------------------------------------------------------------------------
// D2's capture site — start → resume → award through the PERSISTED run
// ---------------------------------------------------------------------------

/**
 * An actor whose `setFlag` DEEP-MERGES like Foundry's, and whose `update` honours the
 * `-=` deletion syntax. The D2 test must round-trip through real persistence
 * (`container.active[runId]`), not an in-memory object a stub happened to keep.
 */
function makeMergingActor(id = 'actor-1') {
  const flags = {};
  const createdNames = [];
  // Component items are matched by NAME, so the actor must hold a "Dragon Scale".
  const items = [
    {
      id: 'comp-item',
      uuid: 'Item.comp-item',
      name: 'Dragon Scale',
      system: { quantity: 1 },
      flags: {},
      parent: null,
      toObject: () => ({ name: 'Dragon Scale', type: 'loot', system: { quantity: 1 } }),
      async delete() {},
      async update() {},
    },
  ];
  const merge = (target, source) => {
    for (const [key, value] of Object.entries(source)) {
      if (key.includes('-=')) continue;
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        target[key] = merge(target[key] ?? {}, value);
      } else {
        target[key] = value;
      }
    }
    return target;
  };
  return {
    id,
    uuid: `Actor.${id}`,
    name: 'Salvager',
    system: {},
    items: {
      contents: items,
      find: (fn) => items.find(fn),
      [Symbol.iterator]: () => items[Symbol.iterator](),
    },
    getFlag(ns, key) {
      return getProperty(flags[ns] ?? {}, key) ?? null;
    },
    async setFlag(ns, key, value) {
      flags[ns] = flags[ns] || {};
      const path = key.split('.');
      let cur = flags[ns];
      for (const part of path.slice(0, -1)) cur = cur[part] = cur[part] ?? {};
      const leaf = path.at(-1);
      cur[leaf] =
        value && typeof value === 'object' && !Array.isArray(value)
          ? merge(cur[leaf] ?? {}, JSON.parse(JSON.stringify(value)))
          : value;
    },
    async update(updates) {
      for (const [path, value] of Object.entries(updates)) {
        const parts = path.split('.');
        const leaf = parts.at(-1);
        if (!leaf.startsWith('-=')) continue;
        let cur = flags;
        for (const part of parts.slice(0, -1)) cur = cur?.[part];
        if (cur) delete cur[leaf.slice(2)];
        void value;
      }
    },
    createdNames,
    async createEmbeddedDocuments(_type, dataArr) {
      return dataArr.map((d, i) => {
        createdNames.push(d.name);
        return { id: `created-${i}`, uuid: `Actor.${id}.Item.c${i}`, name: d.name, system: {} };
      });
    },
  };
}

function setupSalvageGame({ userId, worldTime, salvageRunManager, actor }) {
  globalThis.fromUuid = async (uuid) => (uuid === actor.uuid ? actor : null);
  globalThis.Roll = class {
    async evaluate() {
      return { total: 2, dice: [] };
    }
  };
  globalThis.game = {
    fabricate: {
      getCraftingSystemManager: () => ({ getSystem: () => SALVAGE_SYSTEM }),
      getResolutionModeService: () => null,
      getSalvageRunManager: () => salvageRunManager,
    },
    user: { id: userId },
    userId,
    time: { worldTime },
  };
}

test('D2: a world-time resume awards down the order stamped by run.userId, not the executing user', async () => {
  // The sharp assertion. `createRun` stamps `userId` (the STARTING user), so the resume
  // can be run as somebody else and still be pinned. This is what makes F3 —
  // `SalvageRunManager.processWorldTime` iterating every actor on every client with no
  // owner filter — structurally unreachable: the resume reads no settings at all.
  //
  // Mutation this catches: DELETE THE CAPTURE (`resultOrder:` from createRun's payload).
  // The read site then finds no order, falls back to authored, and salvage silently never
  // reorders — while the read-site tests above still pass, because they inject a run that
  // already has an order.
  const actor = makeMergingActor();
  const salvageRunManager = new SalvageRunManager();
  setupSalvageGame({ userId: 'player-alice', worldTime: 100, salvageRunManager, actor });

  const engine = new CraftingEngine(
    { canCraft: () => ({ canCraft: true }), getToolsForSet: () => [], toolMatchesItem: () => false },
    null,
    null,
    null,
    salvageRunManager,
    null,
    null,
    // Alice's stored order. Read ONCE, at start.
    { getPlayerResultOrder: () => ['s-c', 's-b', 's-a'] }
  );

  const component = salvageComponent({ timeRequirement: { hours: 1 } });
  SALVAGE_SYSTEM.components.push(component);

  // START as Alice — the time gate parks the run.
  const started = await engine.salvage(actor.uuid, 'sys-1', 'comp-1');
  assert.equal(started.salvageRun.status, 'waitingTime');
  assert.equal(started.salvageRun.userId, 'player-alice', 'createRun stamps the starting user');

  // The order must be on the PERSISTED run, read back through the flag (not the cache).
  const runId = started.salvageRun.id;
  salvageRunManager.invalidateCache();
  const persisted = salvageRunManager.getActiveRun(actor, runId);
  assert.deepEqual(
    persisted.resultOrder,
    ['s-c', 's-b', 's-a'],
    'the captured order survives the setFlag round-trip (createRun spreads, it is not an allowlist)'
  );

  // RESUME as somebody else, exactly as the synced updateWorldTime hook would, and with
  // a seam that would return a DIFFERENT order if anything still read settings.
  const resumeEngine = new CraftingEngine(
    { canCraft: () => ({ canCraft: true }), getToolsForSet: () => [], toolMatchesItem: () => false },
    null,
    null,
    null,
    salvageRunManager,
    null,
    null,
    { getPlayerResultOrder: () => ['s-a', 's-b', 's-c'] }
  );
  setupSalvageGame({ userId: 'gm-bob', worldTime: 999999, salvageRunManager, actor });
  salvageRunManager.invalidateCache();

  const resumed = await resumeEngine.salvage(actor.uuid, 'sys-1', 'comp-1', {
    runId,
    skipTimeGate: true,
  });

  assert.equal(resumed.success, true, resumed.message);
  assert.notEqual(persisted.userId, globalThis.game.user.id, 'the executing user is NOT the starter');
  assert.deepEqual(
    actor.createdNames,
    ['Scrap C', 'Scrap B'],
    "awarded down ALICE's captured order, though BOB executed the resume"
  );

  SALVAGE_SYSTEM.components.pop();
});

// ---------------------------------------------------------------------------
// The capture KEY is scoped per (systemId, componentId) — issue 766.
// ---------------------------------------------------------------------------

test('salvage: the captured order key is scoped per (systemId, componentId), never componentId alone', async () => {
  // Mutation this catches: REVERT the engine's capture key to `salvage:<componentId>`
  // (drop the `${craftingSystemId}:` term). Component ids are NOT globally unique, so the
  // systemId is load-bearing — the store's WRITE key and the engine's READ key must match
  // exactly, or the captured order silently reads empty (and a same-componentId order in
  // another system leaks in). Only the store's write key was pinned before this test; the
  // engine's read key had none, so the exact one-sided desync the design warned about
  // shipped green.
  const actor = makeMergingActor();
  const salvageRunManager = new SalvageRunManager();
  setupSalvageGame({ userId: 'player-alice', worldTime: 100, salvageRunManager, actor });

  // A REAL map lookup keyed by the composite id the engine passes, so the assertions bind
  // the key FORMAT — not merely that the seam is called.
  const orders = {
    'sys-1:comp-1': ['s-c', 's-b', 's-a'],
    // A same-componentId order under a DIFFERENT system — must NEVER leak into sys-1.
    'other-sys:comp-1': ['s-a', 's-b', 's-c'],
    // The bare componentId — what a reverted engine would read. Seeded so a revert picks
    // THIS up (flipping the composite assertion red) rather than silently reading empty.
    'comp-1': ['s-a', 's-b', 's-c'],
  };
  const engine = new CraftingEngine(
    { canCraft: () => ({ canCraft: true }), getToolsForSet: () => [], toolMatchesItem: () => false },
    null,
    null,
    null,
    salvageRunManager,
    null,
    null,
    { getPlayerResultOrder: (entry) => orders[entry?.id] ?? [] }
  );

  const component = salvageComponent({ timeRequirement: { hours: 1 } });
  SALVAGE_SYSTEM.components.push(component);

  const started = await engine.salvage(actor.uuid, 'sys-1', 'comp-1');
  assert.equal(started.salvageRun.status, 'waitingTime');

  const runId = started.salvageRun.id;
  salvageRunManager.invalidateCache();
  const persisted = salvageRunManager.getActiveRun(actor, runId);
  assert.deepEqual(
    persisted.resultOrder,
    ['s-c', 's-b', 's-a'],
    'the engine read key is `<systemId>:<componentId>`, matching the store write key'
  );
  assert.notDeepEqual(
    persisted.resultOrder,
    ['s-a', 's-b', 's-c'],
    'neither the bare componentId nor another system sharing the componentId leaks in'
  );

  SALVAGE_SYSTEM.components.pop();
});
