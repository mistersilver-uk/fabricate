/** The View Lab capture's bounded render pool and its scheduling-independent evidence check. */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MAX_RENDER_CONCURRENCY,
  mapInPool,
  rejectDuplicateEvidence,
  resolveRenderConcurrency,
} from '../scripts/lib/viewLabRenderPool.js';

/** A promise with its resolver exposed, so a test decides the completion order. */
function deferred() {
  let resolve;
  const promise = new Promise((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

test('results keep the input order whatever order the renders finish in', async () => {
  const gates = [deferred(), deferred(), deferred(), deferred()];
  const finished = [];
  const pending = mapInPool(['a', 'b', 'c', 'd'], 4, async (item, index) => {
    await gates[index].promise;
    finished.push(item);
    return item.toUpperCase();
  });
  for (const index of [3, 1, 0, 2]) {
    gates[index].resolve();
    await new Promise((settle) => setImmediate(settle));
  }

  assert.deepEqual(finished, ['d', 'b', 'a', 'c'], 'the renders really finished out of order');
  assert.deepEqual(await pending, ['A', 'B', 'C', 'D']);
});

test('no more than the bound is ever in flight, and every item runs exactly once', async () => {
  let inFlight = 0;
  let peak = 0;
  const seen = [];
  const items = Array.from({ length: 11 }, (_, index) => index);
  const results = await mapInPool(items, 3, async (item) => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    seen.push(item);
    await new Promise((settle) => setTimeout(settle, (item * 7) % 5));
    inFlight -= 1;
    return item * 2;
  });

  assert.equal(peak, 3);
  assert.deepEqual([...seen].sort((left, right) => left - right), items);
  assert.deepEqual(
    results,
    items.map((item) => item * 2)
  );
});

test('a bound of one is the old serial loop', async () => {
  const started = [];
  await mapInPool(['x', 'y', 'z'], 1, async (item) => {
    started.push(`start ${item}`);
    await new Promise((settle) => setImmediate(settle));
    started.push(`end ${item}`);
  });
  assert.deepEqual(started, ['start x', 'end x', 'start y', 'end y', 'start z', 'end z']);
});

test('an empty selection resolves to no results without starting a worker', async () => {
  assert.deepEqual(
    await mapInPool([], 4, () => assert.fail('no worker may run')),
    []
  );
});

test('the concurrency defaults to the core count, capped, and an explicit value is honoured', () => {
  assert.equal(resolveRenderConcurrency(undefined, 4), 4);
  assert.equal(resolveRenderConcurrency('', 4), 4);
  assert.equal(resolveRenderConcurrency(undefined, 64), MAX_RENDER_CONCURRENCY);
  assert.equal(resolveRenderConcurrency(undefined, 0), 1);
  assert.equal(resolveRenderConcurrency('1', 16), 1);
  assert.equal(resolveRenderConcurrency(' 6 ', 2), 6);
  assert.equal(resolveRenderConcurrency('99', 4), MAX_RENDER_CONCURRENCY);
});

test('a malformed concurrency fails the capture rather than guessing', () => {
  for (const raw of ['0', '-2', '2.5', 'four', '4x']) {
    assert.throws(
      () => resolveRenderConcurrency(raw, 4),
      /VIEW_LAB_CONCURRENCY/,
      `"${raw}" must be refused`
    );
  }
});

const frame = (text) => Buffer.from(text);

test('a byte-identical frame in a distinct group names the earliest match in selection order', () => {
  const cases = [
    { id: 'first', distinctEvidenceGroup: 'g' },
    { id: 'second', distinctEvidenceGroup: 'g' },
    { id: 'plain' },
    { id: 'third', distinctEvidenceGroup: 'g' },
    { id: 'other-group', distinctEvidenceGroup: 'h' },
  ];
  const outcomes = [
    { buffer: frame('same') },
    { buffer: frame('same') },
    { buffer: null },
    { buffer: frame('same') },
    { buffer: frame('same') },
  ];

  const checked = rejectDuplicateEvidence(cases, outcomes);

  assert.deepEqual(
    checked.map((outcome) => outcome.error ?? 'ok'),
    [
      'ok',
      "evidence frame is byte-identical to first in distinct group 'g'",
      'ok',
      // Selection order picks the witness, so the third names the first, not the second.
      "evidence frame is byte-identical to first in distinct group 'g'",
      'ok',
    ]
  );
});

test('a failed render neither joins its group nor is compared against it', () => {
  const cases = [
    { id: 'broken', distinctEvidenceGroup: 'g' },
    { id: 'fine', distinctEvidenceGroup: 'g' },
  ];
  const outcomes = [{ error: 'render failed' }, { buffer: frame('same') }];
  assert.deepEqual(rejectDuplicateEvidence(cases, outcomes), outcomes);
});
