/**
 * Issue 970 — the startup housekeeping passes must not write to actors this client does not own,
 * and must never be able to prevent `ready`. Fabricate has no socket-to-GM relay: every actor
 * mutation is performed by the acting client.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { selectWritableActors } from '../src/systems/writableActors.js';
import { runStartupMaintenance } from '../src/systems/startupMaintenance.js';

// selectWritableActors

test('selectWritableActors keeps only the actors this client may update', () => {
  const mine = { id: 'mine', isOwner: true };
  const theirs = { id: 'theirs', isOwner: false };
  assert.deepEqual(selectWritableActors([mine, theirs]), [mine]);
});

test('selectWritableActors fails CLOSED on an actor that answers nothing', () => {
  // Deliberately strict. A permissive default would silently restore the original
  // defect for any document shape that does not expose `isOwner`, and the failure
  // mode it restores (a rejected startup) is far worse than a skipped cleanup.
  assert.deepEqual(selectWritableActors([{ id: 'a' }, { id: 'b', isOwner: undefined }]), []);
  assert.deepEqual(selectWritableActors([null, undefined]), []);
});

test('selectWritableActors tolerates a missing or empty collection', () => {
  assert.deepEqual(selectWritableActors(null), []);
  assert.deepEqual(selectWritableActors(undefined), []);
  assert.deepEqual(selectWritableActors([]), []);
});

test('selectWritableActors accepts any iterable, since game.actors is a Collection', () => {
  const mine = { id: 'mine', isOwner: true };
  const theirs = { id: 'theirs', isOwner: false };
  assert.deepEqual(selectWritableActors(new Set([mine, theirs])), [mine]);
});

test('selectWritableActors copies rather than filtering in place', () => {
  const actors = [{ id: 'mine', isOwner: true }];
  const result = selectWritableActors(actors);
  result.pop();
  assert.equal(actors.length, 1, 'the caller’s collection is untouched');
});

// runStartupMaintenance

test('runStartupMaintenance runs every pass in order', async () => {
  const order = [];
  const failed = await runStartupMaintenance([
    ['first', async () => { order.push('first'); }],
    ['second', async () => { order.push('second'); }],
  ]);
  assert.deepEqual(order, ['first', 'second']);
  assert.deepEqual(failed, [], 'nothing failed');
});

test('runStartupMaintenance isolates a failing pass and keeps going', async () => {
  const logged = [];
  const ran = [];

  const failed = await runStartupMaintenance(
    [
      ['crafting runs', async () => { throw new Error('User lacks permission to update Actor'); }],
      ['learned recipes', async () => { ran.push('learned recipes'); }],
    ],
    { log: (message, error) => logged.push({ message, error }) }
  );

  assert.deepEqual(
    ran,
    ['learned recipes'],
    'the passes are independent, so a later one still runs'
  );
  assert.deepEqual(failed, ['crafting runs'], 'the failure is reported to the caller');
  assert.equal(logged.length, 1, 'and surfaced, not swallowed silently');
  assert.match(logged[0].message, /crafting runs/, 'the log names the pass that failed');
});

test('runStartupMaintenance never rejects, so it can never block readiness', async () => {
  await assert.doesNotReject(() =>
    runStartupMaintenance(
      [
        ['a', async () => { throw new Error('boom'); }],
        ['b', async () => { throw new Error('boom'); }],
      ],
      { log: () => {} }
    )
  );
});

test('runStartupMaintenance tolerates an absent pass list', async () => {
  // NOT a health signal, and it is worth being explicit about that (issue 1224).
  assert.deepEqual(await runStartupMaintenance(undefined), []);
});
