/** The optimistic hold a radio group's async caller draws while its save is in flight (issue 2601). */
import assert from 'node:assert/strict';
import test from 'node:test';

import { latestRequestHold } from '../src/ui/svelte/util/latestRequestHold.js';

const settle = () => new Promise((done) => setTimeout(done, 0));

/** A hold over a recorded value, with each save it starts left pending until the test settles it. */
function heldOver() {
  const writes = [];
  const saves = [];
  const hold = latestRequestHold((held) => {
    writes.push(held);
  });
  const press = (next) =>
    hold(
      next,
      () =>
        new Promise((resolveSave, rejectSave) => {
          saves.push({ resolveSave, rejectSave });
        })
    );
  return { writes, saves, press, hold };
}

/** Runs `body` with `console.error` recorded, answering what it was called with. */
async function reportedBy(body) {
  const reported = [];
  const { error } = console;
  console.error = (...args) => {
    reported.push(args);
  };
  try {
    await body();
  } finally {
    console.error = error;
  }
  return reported;
}

test('holds a value until its save settles, then releases it', async () => {
  const { writes, saves, press } = heldOver();
  press('a');
  assert.deepEqual(writes, ['a']);
  saves[0].resolveSave();
  await settle();
  assert.deepEqual(writes, ['a', '']);
});

test('keeps a later press, a repeat of the same value included, until its own save settles', async () => {
  const { writes, saves, press } = heldOver();
  press('a');
  press('a');
  saves[0].resolveSave();
  await settle();
  assert.deepEqual(writes, ['a', 'a'], 'the earlier save does not release the repeat');
  saves[1].resolveSave();
  await settle();
  assert.deepEqual(writes, ['a', 'a', '']);
});

test('releases and reports a save that rejects or throws', async () => {
  const refusal = new Error('refused');
  const rejected = heldOver();
  const fromRejection = await reportedBy(async () => {
    rejected.press('a');
    rejected.saves[0].rejectSave(refusal);
    await settle();
  });
  assert.deepEqual([rejected.writes, fromRejection], [['a', ''], [[refusal]]]);

  const thrown = heldOver();
  const fromThrow = await reportedBy(async () => {
    thrown.hold('b', () => {
      throw refusal;
    });
    await settle();
  });
  assert.deepEqual([thrown.writes, fromThrow], [['b', ''], [[refusal]]]);
});
