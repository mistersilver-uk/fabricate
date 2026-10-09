/** The Primitive Lab's stand-up order: place every slot, then load a bounded few at a time. */
import assert from 'node:assert/strict';
import test from 'node:test';

import { SILENT, standUpSlots } from './view-lab/primitives/standUp.js';

/** A promise with its resolver exposed, so a test decides when each load settles. */
function deferred() {
  let resolve;
  const promise = new Promise((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

const flush = () => new Promise((settle) => setImmediate(settle));

/** A stand-up over `count` slots whose loads the test settles one by one. */
function stagedStandUp(count, poolSize) {
  const slots = Array.from({ length: count }, (_, index) => `slot-${index}`);
  const events = [];
  const loads = new Map();
  const problems = [];
  let inFlight = 0;
  let peak = 0;
  const done = standUpSlots(slots, {
    place: (slot) => {
      events.push(`place ${slot}`);
      return slot;
    },
    load: async (slot, onReady) => {
      events.push(`load ${slot}`);
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      const gate = deferred();
      loads.set(slot, { gate, onReady });
      const outcome = await gate.promise;
      inFlight -= 1;
      return outcome;
    },
    poolSize,
    problems,
  });
  return { slots, events, loads, problems, done, peak: () => peak };
}

/** Settle every load in catalogue order, each having announced ready. */
async function settleReadyInOrder(run) {
  for (const slot of run.slots) {
    await flush();
    run.loads.get(slot).onReady();
    run.loads.get(slot).gate.resolve();
  }
}

test('every slot is placed, in catalogue order, before any load starts', async () => {
  const run = stagedStandUp(5, 2);
  await flush();
  assert.deepEqual(run.events, [
    'place slot-0',
    'place slot-1',
    'place slot-2',
    'place slot-3',
    'place slot-4',
    'load slot-0',
    'load slot-1',
  ]);
  await settleReadyInOrder(run);
  await run.done;
  assert.deepEqual(run.problems, []);
});

test('no more loads than the pool size are ever in flight, and every slot loads once', async () => {
  const run = stagedStandUp(9, 3);
  await settleReadyInOrder(run);
  await run.done;
  assert.equal(run.peak(), 3);
  assert.deepEqual(
    run.events.filter((event) => event.startsWith('load')),
    run.slots.map((slot) => `load ${slot}`)
  );
});

test('a silent first settle with no specimen ready stops the loads and names the skipped ones', async () => {
  const run = stagedStandUp(10, 3);
  await flush();
  run.loads.get('slot-1').gate.resolve(SILENT);
  for (const slot of ['slot-0', 'slot-2']) run.loads.get(slot).gate.resolve(SILENT);
  await flush();
  assert.deepEqual([...run.loads.keys()], ['slot-0', 'slot-1', 'slot-2']);
  await run.done;
  assert.equal(run.problems.length, 1);
  assert.match(
    run.problems[0],
    /^7 specimens were not loaded: the first to settle never announced/
  );
});

test('a silent load after any specimen announced ready does not stop the rest', async () => {
  const run = stagedStandUp(6, 2);
  await flush();
  run.loads.get('slot-0').onReady();
  run.loads.get('slot-1').gate.resolve(SILENT);
  for (const slot of run.slots) {
    if (slot === 'slot-1') continue;
    await flush();
    run.loads.get(slot).gate.resolve();
  }
  await run.done;
  assert.equal(run.loads.size, 6, 'every slot was handed a load');
  assert.deepEqual(run.problems, []);
});

test('an empty slot list settles with no load and no problem', async () => {
  const run = stagedStandUp(0, 3);
  const hung = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('an empty slot list never settled')), 1000).unref();
  });
  await Promise.race([run.done, hung]);
  assert.deepEqual(run.events, []);
  assert.deepEqual(run.problems, []);
});
