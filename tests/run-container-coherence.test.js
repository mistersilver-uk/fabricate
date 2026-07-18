import test from 'node:test';
import assert from 'node:assert/strict';

import {
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
