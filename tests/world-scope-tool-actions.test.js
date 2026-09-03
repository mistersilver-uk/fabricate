/**
 * The two TOOL-FAMILY world-scope write actions, over a REAL store (issue 1373, epic 1357).
 *
 * ## Why a real `createToolScopeStore` rather than a hand-written double
 *
 * Both actions are about ABSENCE, and absence is exactly what a double gets wrong.
 *
 * `setWorldToolBreakage`'s clear has to survive a round trip through `normalizeWorldToolBreakage`
 * (which answers `{}` for anything unrecognized), through `_persistedShape` (which spreads the
 * normalized corpus's extras), and out to the setting - and a world SETTING preserves key
 * absence, which is the OPPOSITE of `setFlag`, whose merge resurrects a removed key. A double
 * that stores a value object rather than the setting's own payload cannot see the difference.
 *
 * `setWorldRepairRequirements` cannot be faked at all: `updateWorldDefaultSection` REFUSES every
 * name outside `TOOL_SECTIONS`, and `repairRequirements` is deliberately not one of them. That
 * refusal is asserted here as a positive fact rather than left implicit, because it is the whole
 * reason the second action exists.
 *
 * ## The settings seam is a plain map, and that matches production
 *
 * `game.settings.get` answers an ALREADY-PARSED value for a JSONField setting, so a fixture that
 * stored a JSON STRING would exercise the store's fallback rather than its production path.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { SETTING_KEYS } from '../src/config/settings.js';
import { createToolScopeStore } from '../src/systems/worldScopeStores.js';
import { createWorldScopeEntityActions } from '../src/ui/svelte/stores/worldScopeActions.js';

const KEY = SETTING_KEYS.TOOL_SCOPE;

/**
 * A tool scope store over an in-memory settings map, plus the tool action family bound to it.
 *
 * `reload()` builds a SECOND store over the SAME map, which is what a world reload does - and
 * is the only way to prove a write actually reached the setting rather than only the cache.
 *
 * @param {Map<string, unknown>} [settings]
 * @returns {{store: object, actions: object, settings: Map<string, unknown>,
 *   reload: () => object}}
 */
function toolScope(settings = new Map()) {
  const seams = {
    getSetting: (key) => settings.get(key),
    setSetting: async (key, value) => {
      settings.set(key, value);
    },
  };
  const store = createToolScopeStore(seams);
  store.load();
  return {
    store,
    settings,
    actions: createWorldScopeEntityActions({ entityType: 'tool', getStore: () => store }),
    reload: () => {
      const next = createToolScopeStore(seams);
      next.load();
      return next;
    },
  };
}

function worldDefaultOf(store, entityId) {
  return store.corpus().defaults.find((record) => record.id === entityId) ?? null;
}

function membershipOf(store, entityId, systemId) {
  return (
    store
      .corpus()
      .membership.find((record) => record.entityId === entityId && record.systemId === systemId) ??
    null
  );
}

test('the world tool-breakage authority round-trips through a real store, INCLUDING the clear', async () => {
  const { store, actions, settings, reload } = toolScope();

  assert.equal(await actions.setWorldToolBreakage('checkDriven'), true);
  assert.deepEqual(store.corpus().toolBreakage, { authority: 'checkDriven' });
  assert.deepEqual(
    reload().corpus().toolBreakage,
    { authority: 'checkDriven' },
    'it reached the SETTING, not only the cache'
  );

  // THE CLEAR IS THE HALF THAT MATTERS. Without it a world authority is a one-way door: the
  // resolver reads the world layer only when a system authored nothing, so a world value that
  // can be set and never unset changes every absent-preserving system for good.
  assert.equal(await actions.setWorldToolBreakage(null), true);
  assert.equal(
    'toolBreakage' in store.get(),
    false,
    'the persisted shape carries NO toolBreakage key - absence, not an empty block'
  );
  assert.equal(
    'toolBreakage' in settings.get(KEY),
    false,
    'and the value written to the setting carries none either: a world setting PRESERVES key ' +
      'absence, unlike setFlag, whose merge resurrects a removed key'
  );
  assert.equal('toolBreakage' in reload().corpus(), false, 'so a reload reads no world value');
});

test('an unrecognized authority CLEARS rather than storing a token the normalizer would drop', async () => {
  const { store, actions } = toolScope();
  await actions.setWorldToolBreakage('checkDriven');
  await actions.setWorldToolBreakage('immune');
  assert.equal(
    'toolBreakage' in store.get(),
    false,
    '`immune` is a RETIRED name: storing it would report a write that vanishes on the next load'
  );
});

test('the world repairRequirements default is writable, and updateWorldDefaultSection REFUSES it', async () => {
  const { store, actions, reload } = toolScope();
  await actions.createEntity({ id: 'hammer', name: 'Hammer' });

  const groups = [
    { id: 'g1', ingredients: [] },
    { id: 'g2', ingredients: [] },
  ];

  // THE REFUSAL IS THE REASON THE SECOND ACTION EXISTS, asserted first so the write below is
  // demonstrably not reachable any other way. `TOOL_SECTIONS` is `['breakage', 'onBreak']`.
  assert.equal(
    await actions.updateWorldDefaultSection('hammer', 'repairRequirements', groups),
    false
  );
  assert.equal(
    worldDefaultOf(store, 'hammer'),
    null,
    'and it wrote nothing at all, rather than writing a key the normalizer then discards'
  );

  assert.equal(await actions.setWorldRepairRequirements('hammer', groups), true);
  assert.equal(worldDefaultOf(store, 'hammer').repairRequirements.length, 2);
  assert.equal(
    worldDefaultOf(reload(), 'hammer').repairRequirements.length,
    2,
    'it survives the round trip to the setting and back'
  );

  assert.equal(
    await actions.setWorldRepairRequirements('no-such-tool', groups),
    false,
    'an unknown entity id is refused, on the updateWorldDefaultSection precedent'
  );
});

test('addToSystem SEEDS the repair list as a DEEP COPY, so neither scope can reach the other', async () => {
  const { store, actions } = toolScope();
  await actions.createEntity({ id: 'hammer', name: 'Hammer' });
  await actions.setWorldRepairRequirements('hammer', [
    { id: 'g1', ingredients: [] },
    { id: 'g2', ingredients: [] },
  ]);
  await actions.addToSystem('hammer', 'sys-forge');

  const record = membershipOf(store, 'hammer', 'sys-forge');
  assert.equal(record.repairRequirements.length, 2, 'the seed landed');

  // THE LENGTH ASSERTION ABOVE PASSES EITHER WAY, which is why this one exists. Replace
  // `seedToolRepairRequirements`'s `structuredClone` with a plain reference and the seeded
  // record ALIASES the world default inside one published corpus - so a later in-place edit of
  // either reaches through into the other, and a world edit silently rewrites a system that
  // has already diverged.
  worldDefaultOf(store, 'hammer').repairRequirements.push({ id: 'g3', ingredients: [] });
  assert.equal(
    membershipOf(store, 'hammer', 'sys-forge').repairRequirements.length,
    2,
    'a later world edit must not reach through into a system that already has the tool'
  );
});
