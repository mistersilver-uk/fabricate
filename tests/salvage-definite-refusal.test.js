/**
 * A salvage whose consumption is a Definite Effect Refusal changed nothing and never blocks a later
 * salvage: through `engine.salvage()`, a run the call created is discarded, a reused run completes
 * `failed` with consumption complete-empty, and on the consume-on-failure path tool breakage and
 * the failure award still apply. The owned stock answers `get`, as Foundry's embedded collection
 * does, so a vetoed write is provably unchanged rather than unknowable.
 */
import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';

import { stubRoll } from './helpers/routedCheckEngine.js';
import { salvageRunProbe } from './helpers/salvagePipelineProbe.js';

const PASS_FAIL = {
  rollFormula: '1d20',
  dc: 10,
  thresholdMode: 'meet',
  evaluation: { product: 'sum', direction: 'over', pool: { required: 3, base: '@missing' } },
};
const SHARD_GROUP = { id: 'sg-1', results: [{ id: 'sr-1', componentId: 'shard', quantity: 2 }] };
const SLAG_GROUP = {
  id: 'sg-fail',
  role: 'failure',
  results: [{ id: 'sf-1', componentId: 'slag', quantity: 1 }],
};
const HAMMER = {
  id: 't-hammer',
  componentId: 'hammer',
  name: 'Hammer',
  breakage: { mode: 'limitedUses', maxUses: 1 },
};
const AWARDS = [
  { id: 'shard', name: 'Shard' },
  { id: 'slag', name: 'Slag' },
];

let logged = [];
let originalError = null;
beforeEach(() => {
  logged = [];
  originalError = console.error;
  console.error = (...args) => {
    logged.push(args);
  };
});
afterEach(() => {
  console.error = originalError;
});

/** A salvage world whose ore stack lives in a collection answering `get`. */
function world(spec = {}) {
  const probe = salvageRunProbe({
    salvageCraftingCheck: { simple: PASS_FAIL, ...spec.check },
    targets: [
      { id: 'ore', name: 'Iron Ore', quantity: 3, resultGroups: [SHARD_GROUP], ...spec.target },
    ],
    awards: AWARDS,
    tools: spec.tools ?? [],
  });
  const { items } = probe.actor;
  items.get = (id) => items.find((item) => item.id === id && !item.deleted) ?? null;
  const ore = items.find((item) => item.id === 'ore');
  return { probe, ore };
}

/** The next update resolves `undefined` and writes nothing, as a `preUpdateItem` veto does. */
function vetoNextUpdate(item) {
  const write = item.update;
  item.update = async function vetoed() {
    item.update = write;
    return undefined;
  };
}

const activeRuns = (probe) => probe.runManager.getActiveRuns(probe.actor);

test('a refused salvage leaves no run, names the item, and the next salvage succeeds', async () => {
  const { probe, ore } = world();
  vetoNextUpdate(ore);
  stubRoll(17, [{ number: 1, faces: 20, total: 17 }]);
  const refused = await probe.salvage();
  assert.equal(refused.success, false);
  assert.equal(refused.refused, true);
  assert.match(refused.message, /^Could not consume "Iron Ore": the write left the item unchanged/);
  assert.equal(refused.salvageRun, null);
  assert.deepEqual(activeRuns(probe), [], 'the run this call created was discarded');
  assert.equal(ore.system.quantity, 3);
  assert.equal(logged.length, 1, 'the refusal was logged with its cause');

  const retried = await probe.salvage();
  assert.equal(retried.success, true, retried.message);
  assert.equal(ore.system.quantity, 2);
});

for (const [label, seed, options] of [
  ['an in-progress run', {}, {}],
  [
    'a time-gated run, which forfeits its wait',
    { status: 'waitingTime', timeGate: { requiredSeconds: 60, initiatedAt: 0, availableAt: 60 } },
    { skipTimeGate: true },
  ],
]) {
  test(`a refusal completes ${label} failed with consumption complete-empty`, async () => {
    const { probe, ore } = world();
    const run = await probe.seedRun(seed);
    vetoNextUpdate(ore);
    stubRoll(17, [{ number: 1, faces: 20, total: 17 }]);
    const refused = await probe.salvage({ runId: run.id, ...options });
    assert.equal(refused.refused, true);
    assert.equal(refused.salvageRun.status, 'failed');
    assert.equal(refused.salvageRun.failureReason, refused.message);
    assert.deepEqual(refused.salvageRun.historySettlement, {
      consumption: 'complete',
      awards: 'notApplicable',
    });
    assert.deepEqual(refused.salvageRun.consumedComponents, []);
    assert.deepEqual(activeRuns(probe), []);

    const retried = await probe.salvage();
    assert.equal(retried.success, true, retried.message);
  });
}

test('a refused consume-on-failure still breaks the tool and awards the failure group', async () => {
  const { probe, ore } = world({
    check: {
      failureResultPolicy: 'perRecord',
      consumption: { consumeComponentOnFail: true, breakToolsOnFail: true },
    },
    target: { toolIds: ['t-hammer'], resultGroups: [SHARD_GROUP, SLAG_GROUP] },
    tools: [HAMMER],
  });
  vetoNextUpdate(ore);
  stubRoll(3, [{ number: 1, faces: 20, total: 3 }]);
  const failed = await probe.salvage();
  assert.equal(failed.success, false);
  assert.equal(failed.refused, undefined, 'a rolled failure, not a refusal');
  const run = failed.salvageRun;
  assert.equal(run.status, 'failed');
  assert.deepEqual(run.historySettlement, { consumption: 'complete', awards: 'complete' });
  assert.deepEqual(run.consumedComponents, []);
  assert.deepEqual(
    run.usedTools.map(({ toolId, broken }) => ({ toolId, broken })),
    [{ toolId: 't-hammer', broken: true }]
  );
  assert.deepEqual(
    run.createdResults.map(({ componentId }) => componentId),
    ['slag']
  );
  assert.equal(ore.system.quantity, 3);
  assert.equal(logged.length, 1);
});

const pathRefusal = () =>
  Object.assign(new Error('The configured item stack-quantity path resolves an object'), {
    code: 'STACK_QUANTITY_PATH_REFUSED',
  });

test('a path-guard refusal of the consumption is prefixed with the salvaged component', async () => {
  const { probe, ore } = world();
  probe.engine._consumeComponentItems = async () => {
    throw pathRefusal();
  };
  stubRoll(17, [{ number: 1, faces: 20, total: 17 }]);
  const refused = await probe.salvage();
  assert.equal(refused.refused, true);
  assert.match(
    refused.message,
    /^Could not salvage "Iron Ore": The configured item stack-quantity/
  );
  assert.deepEqual(activeRuns(probe), []);
  assert.equal(ore.system.quantity, 3);
});

test('a path-guard refusal from the awards after a real decrement is not a refusal', async () => {
  const { probe, ore } = world();
  probe.engine._awardSalvageResultGroups = async () => {
    throw pathRefusal();
  };
  stubRoll(17, [{ number: 1, faces: 20, total: 17 }]);
  const outcome = await probe.salvage();
  assert.notEqual(outcome?.refused, true, 'a real consumption never reads as nothing-changed');
  assert.equal(ore.system.quantity, 2, 'the component was consumed');
  const runs = activeRuns(probe);
  assert.equal(runs.length, 1, 'the run keeps its uncertainty');
  assert.equal(runs[0].historySettlement.awards, 'uncertain');
});

test('an uncertain consumption still poisons the run, so the refusal rule is not a catch-all', async () => {
  const { probe, ore } = world();
  ore.update = async function landedThenThrew(payload) {
    this.system.quantity = payload['system.quantity'];
    throw new Error('socket closed after commit');
  };
  stubRoll(17, [{ number: 1, faces: 20, total: 17 }]);
  assert.equal(await probe.salvage(), null, 'the salvage threw');
  const [run] = activeRuns(probe);
  assert.equal(run.historySettlement.consumption, 'uncertain');
});
