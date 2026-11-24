import test from 'node:test';
import assert from 'node:assert/strict';

import { GatheringRunManager } from '../src/systems/GatheringRunManager.js';
import {
  assertNoStaleRunWrite,
  runContainerBaseline,
  reconcileRunContainer,
  reconcileActiveRuns,
  reconcileRunHistory,
  unionRunHistory,
  historyIdsOf,
  compareFinishedAtNewestFirst,
} from '../src/systems/runContainerCoherence.js';

test('unionRunHistory: writer entries win, document-only entries survive, capped newest-first', () => {
  const current = [
    { id: 'a', finishedAt: 10 },
    { id: 'b', finishedAt: 30 },
  ];
  const next = [
    { id: 'c', finishedAt: 40 },
    { id: 'a', finishedAt: 10 },
  ];
  const merged = unionRunHistory(current, next, compareFinishedAtNewestFirst, 50);
  assert.deepEqual(
    merged.map((e) => e.id),
    ['c', 'b', 'a'],
    'union by id, sorted newest-first by finishedAt'
  );
});

test('unionRunHistory: retention cap keeps the newest N and is a stable sort for equal timestamps', () => {
  const next = Array.from({ length: 3 }, (_, i) => ({ id: `n${i}`, finishedAt: 1000 }));
  const current = Array.from({ length: 3 }, (_, i) => ({ id: `c${i}`, finishedAt: 1000 }));
  const merged = unionRunHistory(current, next, compareFinishedAtNewestFirst, 4);
  // Stable: writer (next) entries pushed first, so they lead; capped at 4.
  assert.deepEqual(
    merged.map((e) => e.id),
    ['n0', 'n1', 'n2', 'c0']
  );
});

test('reconcileActiveRuns: keeps another writer run, drops only the intentional removal', () => {
  const current = { keep: { id: 'keep' }, other: { id: 'other' } };
  const next = { keep: { id: 'keep', status: 'inProgress' } };
  // The writer observed only { keep } and removed nothing new, but never saw `other`.
  const active = reconcileActiveRuns(current, next, ['keep']);
  assert.deepEqual(Object.keys(active).sort(), ['keep', 'other']);
});

test('reconcileActiveRuns: a baseline run absent from next is an intentional removal', () => {
  const current = { gone: { id: 'gone' }, other: { id: 'other' } };
  const next = {};
  const active = reconcileActiveRuns(current, next, ['gone']);
  assert.deepEqual(Object.keys(active), ['other'], 'gone removed, other (unobserved) preserved');
});

test('reconcileActiveRuns: writer additions overlay the document', () => {
  // The writer observed { a } and now has { a, b } — a is retained, b is added.
  const active = reconcileActiveRuns({ a: { id: 'a' } }, { a: { id: 'a' }, b: { id: 'b' } }, ['a']);
  assert.deepEqual(Object.keys(active).sort(), ['a', 'b']);
});

test('reconcileRunHistory: an intentional history removal (cleanup) is not re-added from the document', () => {
  const current = [
    { id: 'x', finishedAt: 20 },
    { id: 'y', finishedAt: 10 },
  ];
  const next = [{ id: 'x', finishedAt: 20 }];
  // The writer observed both x and y and dropped y (a system cleanup).
  const merged = reconcileRunHistory(current, next, compareFinishedAtNewestFirst, ['x', 'y'], 50);
  assert.deepEqual(
    merged.map((e) => e.id),
    ['x'],
    'y stays removed'
  );
});

test('reconcileRunHistory: a document-only entry the writer never saw survives a stale persist', () => {
  const current = [
    { id: 'concurrent', finishedAt: 50 },
    { id: 'seen', finishedAt: 10 },
  ];
  const next = [{ id: 'seen', finishedAt: 10 }];
  // The writer only ever observed `seen`; `concurrent` was written out-of-band.
  const merged = reconcileRunHistory(current, next, compareFinishedAtNewestFirst, ['seen'], 50);
  assert.deepEqual(
    merged.map((e) => e.id),
    ['concurrent', 'seen'],
    'concurrent preserved (not in the baseline, so not an intentional removal)'
  );
});

test('reconcileRunContainer: composes active + history reconciliation', () => {
  const current = {
    active: { forge: { id: 'forge' }, playerRun: { id: 'playerRun' } },
    history: [{ id: 'embercap', finishedAt: 100 }],
  };
  const next = {
    active: {},
    history: [{ id: 'forge', finishedAt: 200 }],
  };
  const reconciled = reconcileRunContainer({
    current,
    next,
    previousActiveKeys: ['forge'],
    previousHistoryIds: [],
    compareHistory: compareFinishedAtNewestFirst,
    historyLimit: 50,
  });
  assert.deepEqual(Object.keys(reconciled.active), ['playerRun'], 'forge removed, player run kept');
  assert.deepEqual(
    reconciled.history.map((e) => e.id),
    ['forge', 'embercap'],
    'both terminal runs survive, newest-first'
  );
});

test('historyIdsOf: collects ids and ignores id-less entries', () => {
  assert.deepEqual(historyIdsOf([{ id: 'a' }, {}, { id: 'b' }]), ['a', 'b']);
  assert.deepEqual(historyIdsOf(null), []);
});

/** A version-1 run at `runRevision`, merged with `extra`. */
const v1 = (id, runRevision, extra = {}) => ({ id, lifecycleVersion: 1, runRevision, ...extra });
const staleRefusal = { code: 'STALE_RUN_REVISION' };

test('assertNoStaleRunWrite refuses a version-1 copy older than the stored one, active or archived', () => {
  const current = { active: { a: v1('a', 2) }, history: [v1('h', 4)] };
  assert.throws(() => assertNoStaleRunWrite(current, { active: { a: v1('a', 1) } }), staleRefusal);
  assert.throws(() => assertNoStaleRunWrite(current, { history: [v1('h', 3)] }), staleRefusal);
  assert.throws(() => assertNoStaleRunWrite(current, { active: { h: v1('h', 3) } }), staleRefusal);
});

test('assertNoStaleRunWrite refuses an archive that does not advance the stored active revision', () => {
  const current = { active: { a: v1('a', 2) }, history: [] };
  assert.throws(
    () => assertNoStaleRunWrite(current, { active: {}, history: [v1('a', 2)] }),
    staleRefusal
  );
  assert.doesNotThrow(() => assertNoStaleRunWrite(current, { active: {}, history: [v1('a', 3)] }));
});

test('assertNoStaleRunWrite refuses an equal-revision stale increment and a stale removal', () => {
  const baseline = runContainerBaseline({ active: { a: v1('a', 0) }, history: [v1('h', 0)] });
  const current = { active: { a: v1('a', 1) }, history: [v1('h', 1)] };
  // Both writers advanced revision 0 to 1, so only the baseline shows this one is stale.
  assert.throws(
    () =>
      assertNoStaleRunWrite(
        current,
        { active: { a: v1('a', 1) }, history: [v1('h', 1)] },
        baseline
      ),
    staleRefusal
  );
  assert.throws(
    () => assertNoStaleRunWrite(current, { active: {}, history: [v1('h', 1)] }, baseline),
    staleRefusal
  );
  assert.throws(
    () => assertNoStaleRunWrite(current, { active: { a: v1('a', 1) } }, baseline),
    staleRefusal
  );
});

test('assertNoStaleRunWrite passes an unchanged equal copy and a run the stored container lacks', () => {
  const container = { active: { a: v1('a', 3) }, history: [v1('h', 1)] };
  const baseline = runContainerBaseline(container);
  assert.doesNotThrow(() => assertNoStaleRunWrite(container, structuredClone(container), baseline));
  const next = { active: { ...container.active, b: v1('b', 0) }, history: container.history };
  assert.doesNotThrow(() => assertNoStaleRunWrite(container, next, baseline));
  // Another writer removed `a`; there is no stored copy to be stale against.
  assert.doesNotThrow(() =>
    assertNoStaleRunWrite({ active: {}, history: [] }, { active: {} }, baseline)
  );
});

test('assertNoStaleRunWrite never compares legacy, unsupported or no-baseline copies', () => {
  const legacy = { id: 'a', runRevision: 5 };
  const future = { id: 'a', lifecycleVersion: 2, runRevision: 5 };
  for (const stored of [legacy, future, v1('a', 5)]) {
    for (const written of [legacy, future, v1('a', 0)]) {
      if (stored.lifecycleVersion === 1 && written.lifecycleVersion === 1) continue;
      const current = { active: { a: stored }, history: [] };
      assert.doesNotThrow(() =>
        assertNoStaleRunWrite(current, { active: { a: { ...written, runRevision: 0 } } })
      );
      assert.doesNotThrow(() => assertNoStaleRunWrite(current, { active: {}, history: [written] }));
    }
  }
  assert.deepEqual([...runContainerBaseline({ active: { a: legacy, f: future } }).revisions], []);
  // With no baseline, an equal revision cannot be told from an unchanged copy.
  const current = { active: { a: v1('a', 1) }, history: [] };
  assert.doesNotThrow(() => assertNoStaleRunWrite(current, { active: { a: v1('a', 1) } }));
  assert.doesNotThrow(() => assertNoStaleRunWrite(current, { active: { a: v1('a', 1) } }, {}));
});

test('a version-1 gathering archive from a stale cached copy is refused with the flag unchanged', async () => {
  const flags = {};
  const writes = [];
  const actor = {
    id: 'gatherer',
    uuid: 'Actor.gatherer',
    getFlag: (scope, key) => flags[scope]?.[key],
    async setFlag(scope, key, value) {
      writes.push(key);
      flags[scope] ??= {};
      flags[scope][key] = structuredClone(value);
      return this;
    },
  };
  let id = 0;
  const manager = () =>
    new GatheringRunManager({
      randomID: () => `run-${++id}`,
      nowWorldTime: () => 1000,
      getUserId: () => 'user-1',
    });
  const stale = manager();
  const run = await stale.createRun(actor, {
    craftingSystemId: 'system-1',
    environmentId: 'env-1',
    taskId: 'task-1',
    lifecycleVersion: 1,
  });
  await manager().setCompletionMode(actor, run.id, 'worldTime', { expectedRevision: 0 });
  const stored = structuredClone(flags);
  writes.length = 0;

  await assert.rejects(() => stale.completeRun(actor, run, 'succeeded'), {
    code: 'STALE_RUN_REVISION',
  });
  assert.equal(
    stale.getActiveRun(actor, run.id).completionMode,
    'worldTime',
    'the refusal invalidated the stale cache'
  );
  assert.deepEqual(writes, [], 'no flag write is dispatched');
  assert.deepEqual(flags, stored);
  assert.equal(manager().getActiveRun(actor, run.id).completionMode, 'worldTime');
});
