/**
 * THE ESSENCE COLOUR REACHES EVERY SYSTEM-SCOPE READ (issue 1371 r18-colour, maintainer ruling M29).
 *
 * Two defects stacked to produce "the colour shows only on the world bulk panel", and each half
 * is pinned here on its own so a regression in one cannot hide behind the other:
 *
 * 1. THE PROJECTIONS NEVER LIFTED THE FIELD. `buildItemCards` resolved an essence's name and icon
 *    from the definition and stopped there, and `buildEditableEssenceOptions` is a whitelist rebuild
 *    that named `enabled` and not `colorToken` — so the rules editor's card took a `color` prop that
 *    nothing ever fed. Both now carry `colorToken`. The item-card MEMO SIGNATURE does not, and the
 *    claim that it must (r18-colour) was false as written: that memo guards only the async source
 *    resolution, and a card's `essences` — colour included — is rebuilt on every projection call,
 *    so no recolour can be served stale from it (issue 1371 r19-store2, QE round 5).
 * 2. THE WORLD EDITOR'S COLOUR NEVER REACHED A SYSTEM ROW. The world essence entry writes identity
 *    onto the world entity alone; the in-system row keeps the explicit `colorToken: null` the
 *    normalizer emits; and the read union answers identity from the in-system row first. So the
 *    colour a GM picks in the Essence Catalogue is the one colour no system screen could draw.
 *    The manager's refresh now overlays the world identity's colour onto the selected system's
 *    essence rows: a world-authored colour wins, an unauthored one leaves the row's own standing,
 *    and no world store at all changes nothing.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { get } from 'svelte/store';

import { buildComponentEditorState } from '../src/ui/svelte/util/componentEditor.js';

import { makeEssence, makeEssenceStoreHarness } from './helpers/essenceFixtures.js';
import { makeWorldScopeStoreFake } from './helpers/worldScopeStoreFixture.js';

const { createAdminStore } = await import('../src/ui/svelte/stores/adminStore.js');

async function openStore(harness) {
  const store = createAdminStore(harness.services);
  await store.selectSystem('sys1');
  return store;
}

function coal() {
  return { id: 'coal', name: 'Coal', img: '', description: 'Black.', essences: { fire: 2 } };
}

function fireRow(store) {
  return get(store.viewState).selectedSystem.essenceDefinitions.find((def) => def.id === 'fire');
}

function coalCardEssence(store) {
  const card = get(store.viewState).itemCards.find((item) => item.id === 'coal');
  return card.essences.find((essence) => essence.id === 'fire');
}

test('M29/1: the editor’s essence options carry the definition’s colour token', () => {
  const state = buildComponentEditorState(
    {
      features: { essences: true },
      essenceDefinitions: [
        { id: 'fire', name: 'Fire', icon: 'fas fa-fire', colorToken: 'peach' },
        { id: 'air', name: 'Air', icon: 'fas fa-wind', colorToken: null },
      ],
    },
    { id: 'coal', essences: { fire: 2 } }
  );
  assert.equal(state.essenceOptions.find((option) => option.id === 'fire').colorToken, 'peach');
  assert.equal(
    state.essenceOptions.find((option) => option.id === 'air').colorToken,
    '',
    'an unauthored colour is the empty string the card treats as "no tint", never a null it would interpolate'
  );
});

test('M29/2: a colour authored on the in-system row reaches the row projection and the essence card', async () => {
  const harness = makeEssenceStoreHarness({
    essences: [makeEssence({ id: 'fire', name: 'Fire', colorToken: 'butter' })],
    components: [coal()],
  });
  const store = await openStore(harness);

  assert.equal(fireRow(store).colorToken, 'butter', 'the selected system’s row keeps its own colour');
  assert.equal(coalCardEssence(store).colorToken, 'butter', 'and the item card’s essence entry lifts it');
});

test('M29/3: the WORLD identity’s colour overlays the in-system row’s unauthored one on every read', async () => {
  const harness = makeEssenceStoreHarness({
    essences: [makeEssence({ id: 'fire', name: 'Fire', colorToken: null })],
    components: [coal()],
  });
  const scope = makeWorldScopeStoreFake([
    { id: 'fire', name: 'Fire', icon: 'fas fa-fire', colorToken: 'rose', description: '' },
  ]);
  harness.services.getEssenceScopeStore = () => scope.store;
  const store = await openStore(harness);

  assert.equal(fireRow(store).colorToken, 'rose', 'the system’s essence row draws the world colour');
  assert.equal(
    get(store.viewState).essenceCards.find((card) => card.id === 'fire').colorToken,
    'rose',
    'so does the essence card the system Essence Rules list draws'
  );
  assert.equal(coalCardEssence(store).colorToken, 'rose', 'and so does the component row’s essence entry');
});

test('M29/3: the world colour wins over a STALE in-system colour, because the Essence Catalogue is where a GM sets it', async () => {
  // `_seedInSystemEssence` copies the world colour onto the row at join time and nothing
  // updates it afterwards, so a row that was joined before the GM recoloured the essence is
  // exactly the stale case the maintainer's live world is in.
  const harness = makeEssenceStoreHarness({
    essences: [makeEssence({ id: 'fire', name: 'Fire', colorToken: 'butter' })],
    components: [coal()],
  });
  const scope = makeWorldScopeStoreFake([{ id: 'fire', name: 'Fire', colorToken: 'rose' }]);
  harness.services.getEssenceScopeStore = () => scope.store;
  const store = await openStore(harness);

  assert.equal(fireRow(store).colorToken, 'rose');
  assert.equal(coalCardEssence(store).colorToken, 'rose');
});

test('M29/3: an UNAUTHORED world colour leaves the in-system row’s own colour standing', async () => {
  const harness = makeEssenceStoreHarness({
    essences: [makeEssence({ id: 'fire', name: 'Fire', colorToken: 'butter' })],
    components: [coal()],
  });
  const scope = makeWorldScopeStoreFake([{ id: 'fire', name: 'Fire', colorToken: null }]);
  harness.services.getEssenceScopeStore = () => scope.store;
  const store = await openStore(harness);

  assert.equal(fireRow(store).colorToken, 'butter', 'null is "not authored", not "clear it"');
  assert.equal(coalCardEssence(store).colorToken, 'butter');
});

test('M29/3: a world essence the roster does not hold, or no world store at all, changes nothing', async () => {
  const harness = makeEssenceStoreHarness({
    essences: [makeEssence({ id: 'fire', name: 'Fire', colorToken: 'butter' })],
    components: [coal()],
  });
  const scope = makeWorldScopeStoreFake([{ id: 'water', name: 'Water', colorToken: 'aqua' }]);
  harness.services.getEssenceScopeStore = () => scope.store;
  const withStranger = await openStore(harness);
  assert.equal(fireRow(withStranger).colorToken, 'butter');

  const bare = makeEssenceStoreHarness({
    essences: [makeEssence({ id: 'fire', name: 'Fire', colorToken: 'butter' })],
    components: [coal()],
  });
  const withoutStore = await openStore(bare);
  assert.equal(fireRow(withoutStore).colorToken, 'butter');
  assert.equal(coalCardEssence(withoutStore).colorToken, 'butter');
});
