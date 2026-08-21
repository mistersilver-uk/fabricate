import test from 'node:test';
import assert from 'node:assert/strict';

import { SETTING_KEYS } from '../src/config/settings.js';
import { GatheringPartyStore, GatheringPartyValidationError } from '../src/systems/GatheringPartyStore.js';

function makeStore({ saved = [], now = () => 1000, userId = 'user-1' } = {}) {
  const settings = new Map([[SETTING_KEYS.GATHERING_PARTIES, saved]]);
  let counter = 0;
  const store = new GatheringPartyStore({
    getSetting: key => settings.get(key),
    setSetting: async (key, value) => { settings.set(key, value); return value; },
    randomID: () => `party-${++counter}`,
    getUserId: () => userId,
    now
  });
  store.load();
  return { store, settings };
}

test('normalizes defaults: disabled, empty members, null travel actor, no override', async () => {
  const { store } = makeStore();
  const party = await store.create({ name: 'Heroes' });
  assert.equal(party.enabled, false);
  assert.deepEqual(party.memberActorUuids, []);
  assert.equal(party.travelActorUuid, null);
  // ONE override, not a map keyed by crafting system (issue 1282): a party is one set of
  // tokens standing in one place, so "where is the party, according to system A" had no
  // referent once realms became world scope.
  assert.equal(party.currentRealmOverride, null);
});

test('a party with NO travel actor can be enabled', async () => {
  // The gate this replaces rejected the save. It bought nothing: such a party senses no
  // scene regions, so `resolveCurrentRealms` already returns the unresolved shape and its
  // members gather exactly as an actor in NO party does — not as they would with realms
  // disabled, which is a different claim and a false one (an unresolved realm still
  // blocks an inclusion-gated environment). Downtime parties group characters without
  // ever standing on a map, and the gate made that an unreachable state.
  const { store } = makeStore();
  const party = await store.create({ name: 'Heroes' });
  const enabled = await store.setEnabled(party.id, true);
  assert.equal(enabled.enabled, true);
  assert.equal(enabled.travelActorUuid, null);
});

test('an actor still cannot be a member of two enabled travel-actor-less parties', async () => {
  // The composite-uniqueness invariant is INDEPENDENT of the removed gate: dropping the
  // travel-actor requirement must not open a second route to an ambiguous resolution.
  // Before the removal this pair could not both be enabled for the wrong reason.
  const { store } = makeStore();
  const a = await store.create({ name: 'A', memberActorUuids: ['Actor.alice'] });
  await store.setEnabled(a.id, true);
  const b = await store.create({ name: 'B', memberActorUuids: ['Actor.alice'] });
  // The MESSAGE too, not just the class: every validation failure throws this one error
  // type, so a class-only assertion would keep passing if some future rule rejected the
  // save first and the uniqueness branch stopped running.
  await assert.rejects(() => store.setEnabled(b.id, true), {
    name: 'GatheringPartyValidationError',
    message: /associated with more than one enabled party/,
  });
});

test('composite invariant: travel actor may also be a member of its own party', async () => {
  const { store } = makeStore();
  const party = await store.create({ name: 'Heroes', memberActorUuids: ['Actor.alice'], travelActorUuid: 'Actor.alice' });
  const enabled = await store.setEnabled(party.id, true);
  assert.equal(enabled.enabled, true);
  assert.equal(enabled.travelActorUuid, 'Actor.alice');
});

test('composite invariant: an actor cannot be a member of two enabled parties', async () => {
  const { store } = makeStore();
  const a = await store.create({ name: 'A', memberActorUuids: ['Actor.alice'], travelActorUuid: 'Actor.t1' });
  await store.setEnabled(a.id, true);
  const b = await store.create({ name: 'B', memberActorUuids: ['Actor.alice'], travelActorUuid: 'Actor.t2' });
  await assert.rejects(() => store.setEnabled(b.id, true), GatheringPartyValidationError);
});

test('composite invariant: travel actor of enabled A cannot be a member of enabled B', async () => {
  const { store } = makeStore();
  const a = await store.create({ name: 'A', travelActorUuid: 'Actor.shared', memberActorUuids: [] });
  await store.setEnabled(a.id, true);
  const b = await store.create({ name: 'B', travelActorUuid: 'Actor.t2', memberActorUuids: ['Actor.shared'] });
  await assert.rejects(() => store.setEnabled(b.id, true), GatheringPartyValidationError);
});

test('membership in a disabled party does not block enabled-party membership', async () => {
  const { store } = makeStore();
  const disabled = await store.create({ name: 'Disabled', memberActorUuids: ['Actor.alice'] });
  assert.equal(disabled.enabled, false);
  const enabled = await store.create({ name: 'Enabled', memberActorUuids: ['Actor.alice'], travelActorUuid: 'Actor.t1' });
  const result = await store.setEnabled(enabled.id, true);
  assert.equal(result.enabled, true);
});

test('disabling a party relaxes the uniqueness invariant', async () => {
  const { store } = makeStore();
  const a = await store.create({ name: 'A', memberActorUuids: ['Actor.alice'], travelActorUuid: 'Actor.t1' });
  await store.setEnabled(a.id, true);
  // Disable A, then B can claim Actor.alice.
  await store.setEnabled(a.id, false);
  const b = await store.create({ name: 'B', memberActorUuids: ['Actor.alice'], travelActorUuid: 'Actor.t2' });
  const result = await store.setEnabled(b.id, true);
  assert.equal(result.enabled, true);
});

test('duplicate party ids keep first on read and are rejected at save', async () => {
  const { store } = makeStore({ saved: [
    { id: 'dup', name: 'First' },
    { id: 'dup', name: 'Second' }
  ] });
  const list = store.list();
  assert.equal(list.length, 1);
  assert.equal(list[0].name, 'First');
  await assert.rejects(() => store.save([
    { id: 'dup', name: 'First' },
    { id: 'dup', name: 'Second' }
  ]), GatheringPartyValidationError);
});

test('stale member and travel actor uuids remain readable', () => {
  const { store } = makeStore({ saved: [
    { id: 'p1', name: 'Stale', enabled: false, memberActorUuids: ['Actor.gone'], travelActorUuid: 'Actor.poof' }
  ] });
  const party = store.get('p1');
  assert.deepEqual(party.memberActorUuids, ['Actor.gone']);
  assert.equal(party.travelActorUuid, 'Actor.poof');
});

test('setCurrentRealmOverride stamps updatedAt/updatedByUserId; clear empties realmIds but still stamps', async () => {
  let clock = 100;
  const { store } = makeStore({ now: () => (clock += 100), userId: 'gm-7' });
  const party = await store.create({ name: 'Heroes' });
  const withOverride = await store.setCurrentRealmOverride(party.id, ['r1', 'r2']);
  const override = withOverride.currentRealmOverride;
  assert.equal(override.mode, 'manual');
  assert.deepEqual(override.realmIds, ['r1', 'r2']);
  assert.equal(override.updatedByUserId, 'gm-7');
  assert.ok(override.updatedAt > 0);

  const cleared = await store.clearCurrentRealmOverride(party.id);
  const clearedOverride = cleared.currentRealmOverride;
  assert.equal(clearedOverride.mode, 'none');
  assert.deepEqual(clearedOverride.realmIds, []);
  assert.equal(clearedOverride.updatedByUserId, 'gm-7');
  assert.ok(clearedOverride.updatedAt > override.updatedAt);
});

test('collapses a legacy per-system override map on read, newest wins', () => {
  // Two layers of legacy at once: the pre-1.1.0 `currentRegionOverrides`/`regionIds` names AND
  // the per-system keying issue 1282 removed. A party read before the 1.27.0 migration runs
  // still has to resolve to one place, and the GM's most recent statement is the one that
  // survives — the same rule the migration applies on disk.
  const { store } = makeStore({
    saved: [{
      id: 'p-legacy',
      name: 'Legacy',
      currentRegionOverrides: {
        'system-a': { mode: 'manual', regionIds: ['r1', 'r2'], updatedAt: 100 },
        'system-b': { mode: 'manual', regionIds: ['r9'], updatedAt: 500 }
      }
    }]
  });
  const override = store.get('p-legacy').currentRealmOverride;
  assert.ok(override, 'legacy currentRegionOverrides read as one currentRealmOverride');
  assert.equal(override.mode, 'manual');
  assert.deepEqual(override.realmIds, ['r9'], 'the most recently updated placement wins');
});

test('a cleared override never outranks a real placement on collapse', () => {
  // A `none` entry records the GM clearing one system's override. It should not beat a system
  // where they actually placed the party, even if the clear happened later.
  const { store } = makeStore({
    saved: [{
      id: 'p-mixed',
      name: 'Mixed',
      currentRealmOverrides: {
        'system-a': { mode: 'manual', realmIds: ['r1'], updatedAt: 100 },
        'system-b': { mode: 'none', realmIds: [], updatedAt: 900 }
      }
    }]
  });
  const override = store.get('p-mixed').currentRealmOverride;
  assert.equal(override.mode, 'manual');
  assert.deepEqual(override.realmIds, ['r1']);
});

test('moveMember is a single persisted write that moves the uuid between parties', async () => {
  const writes = [];
  const settings = new Map([[SETTING_KEYS.GATHERING_PARTIES, [
    { id: 'a', name: 'A', memberActorUuids: ['Actor.alice'] },
    { id: 'b', name: 'B', memberActorUuids: [] }
  ]]]);
  const store = new GatheringPartyStore({
    getSetting: key => settings.get(key),
    setSetting: async (key, value) => { writes.push(value); settings.set(key, value); return value; },
    randomID: () => 'x',
    getUserId: () => 'u',
    now: () => 1
  });
  store.load();
  await store.moveMember('a', 'b', 'Actor.alice');
  assert.equal(writes.length, 1);
  const list = store.list();
  assert.deepEqual(list.find(p => p.id === 'a').memberActorUuids, []);
  assert.deepEqual(list.find(p => p.id === 'b').memberActorUuids, ['Actor.alice']);
});

test('findEnabledPartyForActor matches member OR travel actor and ignores disabled parties', async () => {
  const { store } = makeStore();
  const disabled = await store.create({ name: 'Disabled', memberActorUuids: ['Actor.bob'] });
  assert.equal(store.findEnabledPartyForActor('Actor.bob'), null);

  const enabled = await store.create({ name: 'Enabled', memberActorUuids: ['Actor.alice'], travelActorUuid: 'Actor.t1' });
  await store.setEnabled(enabled.id, true);
  assert.equal(store.findEnabledPartyForActor('Actor.alice').id, enabled.id);
  assert.equal(store.findEnabledPartyForActor('Actor.t1').id, enabled.id);
  assert.ok(disabled);
});
