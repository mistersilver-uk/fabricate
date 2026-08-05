/**
 * Unit tests for the default world-setting-backed party learn pool (issue 773).
 *
 * Covers the new GM-authoritative `decrement` that frees a shared learn slot on
 * knowledge reset/erase: it floors at 0, mutates only for a GM, and degrades safely
 * (skipped, reported failed) for a non-GM — symmetric with `increment`.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

const { createDefaultPartyLearnPool } = await import('../src/systems/recipeItemPartyLearnPool.js');

const SCOPE = 'fabricate';
const KEY = 'recipeItemPartyLearnPool';

function installGame({ isGM = true, initial = {} } = {}) {
  const registered = new Map();
  let stored = { ...initial };
  globalThis.game = {
    user: { isGM },
    settings: {
      settings: registered,
      register(scope, key) {
        registered.set(`${scope}.${key}`, true);
      },
      get() {
        return stored;
      },
      async set(scope, key, value) {
        stored = value;
      }
    }
  };
  return {
    read: () => stored
  };
}

test('773 pool.decrement (GM) decrements the key and floors at 0', async () => {
  const gameState = installGame({ isGM: true, initial: { 'system-1::book': 2 } });
  const pool = createDefaultPartyLearnPool();

  assert.equal(await pool.decrement('system-1::book'), true);
  assert.equal(gameState.read()['system-1::book'], 1);

  await pool.decrement('system-1::book');
  // A further decrement from 0 floors, never negative.
  assert.equal(await pool.decrement('system-1::book'), true);
  assert.equal(gameState.read()['system-1::book'], 0);
});

test('773 pool.decrement (non-GM) degrades safely without mutating the shared budget', async () => {
  const gameState = installGame({ isGM: false, initial: { 'system-1::book': 2 } });
  const pool = createDefaultPartyLearnPool();

  assert.equal(await pool.decrement('system-1::book'), false);
  assert.equal(gameState.read()['system-1::book'], 2, 'a non-GM never mutates the shared budget');
});

test('773 pool.decrement is symmetric with increment across a round-trip', async () => {
  installGame({ isGM: true, initial: {} });
  const pool = createDefaultPartyLearnPool();

  await pool.increment('system-1::book');
  assert.equal(pool.get('system-1::book'), 1);
  await pool.decrement('system-1::book');
  assert.equal(pool.get('system-1::book'), 0);
});

// A `total`-scope budget lives in a WORLD setting, so a player cannot reserve a slot.
// `writable()` exposes that refusal so the caller can report the real reason instead of
// collapsing it into "no learning uses left" — which told players their shared budget
// was spent while it sat untouched, silently blocking every `total`-scope book.

test('pool.writable reports whether THIS client may mutate the shared budget', () => {
  installGame({ isGM: true });
  assert.equal(createDefaultPartyLearnPool().writable(), true);

  installGame({ isGM: false });
  assert.equal(createDefaultPartyLearnPool().writable(), false);
});

test('a refused increment is distinguishable from a spent budget', async () => {
  // Both report `false` from increment — the caller must consult writable() to tell
  // "you may not do this" apart from "there is nothing left".
  const gameState = installGame({ isGM: false, initial: { 'system-1::book': 0 } });
  const pool = createDefaultPartyLearnPool();

  assert.equal(await pool.increment('system-1::book'), false);
  assert.equal(pool.writable(), false, 'refused because this client is not a GM');
  assert.equal(gameState.read()['system-1::book'], 0, 'the shared budget is untouched');
});
