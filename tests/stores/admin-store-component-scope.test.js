/**
 * The composed component membership verbs, over the REAL published write path (issue 1371).
 *
 * ## Why this is a store unit and not a mounted assertion
 *
 * The composed verb keeps the GENERIC KEY. `worldScope.component.addToSystem` is the same name
 * the membership-only verb published before this lane, so no call site and no mounted test can
 * distinguish the two — a mounted test supplies the `actions` bag itself, and every screen just
 * calls the key. The composition is pinned as SOURCE beside the essence twin; this asserts what
 * the verb actually WRITES.
 *
 * ## And why the in-system half is the load-bearing one
 *
 * `## Scoped Entity Definitions` requirement 15 clause 3 makes the read union's ROW SET the
 * in-system array's for as long as the lifted fields are unshed. So a membership record written
 * alone names a component NOTHING can read: the rules list keeps drawing the row as a ghost, the
 * button looks inert, and no recipe can name the component. Dropping the in-system half passes
 * every membership assertion and ships that.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createAdminStore } from '../../src/ui/svelte/stores/adminStore.js';
import { makeEssenceStoreHarness } from '../helpers/essenceFixtures.js';
import { getItemMatchUuids } from '../../src/utils/sourceReferenceUnion.js';

/**
 * A component scope store fake in the shape `projectWorldScopeEntity` and the actions both read.
 *
 * The published corpus is the ARRAY shape and the persisted value is the MAP shape, exactly as
 * its essence twin records: a fake that published the map makes every projection read
 * `member: false`, which looks precisely like a switch that will not move.
 *
 * @param {object[]} entities
 * @returns {{payload: object, store: object}}
 */
function makeComponentScopeStore(entities) {
  const payload = { entities: [...entities], defaults: {}, membership: {} };
  return {
    payload,
    store: {
      get: () => JSON.parse(JSON.stringify(payload)),
      corpus: () => ({
        entities: [...payload.entities],
        defaults: Object.values(payload.defaults),
        membership: Object.values(payload.membership),
      }),
      isSeeded: () => payload.entities.length > 0,
      save: async (next) => {
        payload.entities = next.entities;
        payload.defaults = next.defaults;
        payload.membership = next.membership;
      },
    },
  };
}

/** The world component the seed is taken from: linked, with an alias, and fully identified. */
const LINKED = {
  id: 'ingot',
  name: 'Iron Ingot',
  img: 'icons/commodities/metal/ingot-worn-iron.webp',
  description: 'A bar of worked iron.',
  originItemUuid: 'Item.ingot-origin',
  registeredItemUuid: 'Item.ingot-registered',
  aliasItemUuids: ['Item.ingot-legacy'],
};

async function openStore(harness, entities) {
  const scope = makeComponentScopeStore(entities);
  harness.services.getComponentScopeStore = () => scope.store;
  const store = createAdminStore(harness.services);
  await store.selectSystem('sys1');
  return { store, scope };
}

function componentsOf(harness) {
  return Array.isArray(harness.system.components) ? harness.system.components : [];
}

test('1371: adopting a world component writes BOTH halves, membership first', async () => {
  const harness = makeEssenceStoreHarness({ components: [] });
  const { store, scope } = await openStore(harness, [LINKED]);
  harness.writes.length = 0;

  assert.equal(await store.worldScope.component.addToSystem('ingot', 'sys1'), true);

  assert.deepEqual(
    Object.values(scope.payload.membership).map((record) => [record.entityId, record.systemId]),
    [['ingot', 'sys1']],
    'the membership record lands'
  );
  const seeded = componentsOf(harness).find((record) => record.id === 'ingot');
  assert.ok(
    Boolean(seeded),
    'and the IN-SYSTEM record does too — without it the read union emits no row at all, so the ' +
      'button writes a record nothing can read'
  );
});

test('1371: the seed carries identity AND all three source-link fields', async () => {
  // A component that cannot be matched to an Item exists in no inventory. Matching is durable-flag
  // identity first and the raw source-reference union THIRD, so a seed carrying no source refs
  // and stamping no role flag matches at NO tier.
  const harness = makeEssenceStoreHarness({ components: [] });
  const { store } = await openStore(harness, [LINKED]);

  await store.worldScope.component.addToSystem('ingot', 'sys1');
  const seeded = componentsOf(harness).find((record) => record.id === 'ingot');

  assert.equal(seeded.name, 'Iron Ingot');
  assert.equal(seeded.img, LINKED.img);
  assert.equal(seeded.description, LINKED.description);
  assert.equal(seeded.originItemUuid, 'Item.ingot-origin');
  assert.equal(seeded.registeredItemUuid, 'Item.ingot-registered');
  assert.deepEqual(seeded.aliasItemUuids, ['Item.ingot-legacy']);
  assert.ok(
    getItemMatchUuids(seeded).length > 0,
    'the source-reference union is NON-EMPTY, which is the tier this seed has to reach'
  );
});

test('1371: and it tolerates a world component carrying only one of the two uuids', async () => {
  // The tool seed's own fallback, followed rather than copied straight through: a record with an
  // `originItemUuid` and no `registeredItemUuid` is a real state, and half-seeding it would leave
  // the in-system record matching on one field where the world record matches on two.
  const harness = makeEssenceStoreHarness({ components: [] });
  const { store } = await openStore(harness, [
    { id: 'coal', name: 'Coal', originItemUuid: 'Item.coal' },
  ]);

  await store.worldScope.component.addToSystem('coal', 'sys1');
  const seeded = componentsOf(harness).find((record) => record.id === 'coal');

  assert.equal(seeded.originItemUuid, 'Item.coal');
  assert.equal(seeded.registeredItemUuid, 'Item.coal', 'the registered uuid falls back to origin');
});

test('1371: the seed authors NO category, because the section inherits', async () => {
  const harness = makeEssenceStoreHarness({ components: [] });
  const { store } = await openStore(harness, [LINKED]);

  await store.worldScope.component.addToSystem('ingot', 'sys1');
  const seeded = componentsOf(harness).find((record) => record.id === 'ingot');

  assert.ok(
    !Object.hasOwn(seeded, 'category'),
    'an unset category INHERITS, which is exactly the state the membership record beside it ' +
      'declares; seeding one would make every adoption an override'
  );
});

test('1371: re-adding a component the system already holds rewrites nothing', async () => {
  // Overwriting would be a DESTRUCTIVE read of "Add": the GM is re-adding a membership record to a
  // component this system already has, and its authored essences and salvage are not the world's
  // to replace.
  const harness = makeEssenceStoreHarness({
    components: [{ id: 'ingot', name: 'Local Ingot', essences: { fire: 2 }, difficulty: 4 }],
  });
  const { store } = await openStore(harness, [LINKED]);
  harness.writes.length = 0;

  await store.worldScope.component.addToSystem('ingot', 'sys1');

  assert.deepEqual(
    harness.writes.filter((write) => write.kind === 'updateSystem'),
    [],
    'no system write at all'
  );
  const kept = componentsOf(harness).find((record) => record.id === 'ingot');
  assert.equal(kept.name, 'Local Ingot');
  assert.deepEqual(kept.essences, { fire: 2 });
});

test('1371: removing a component deletes BOTH halves', async () => {
  // The mirror, and it has a reason of its own: deleting the membership record alone leaves the
  // in-system record standing, and the read union's "no world half for this row" branch pushes
  // such a record through UNCHANGED — so the component goes on resolving in a system the GM has
  // just removed it from, with the world layer silently no longer consulted.
  const harness = makeEssenceStoreHarness({ components: [] });
  const { store, scope } = await openStore(harness, [LINKED]);
  await store.worldScope.component.addToSystem('ingot', 'sys1');

  assert.equal(await store.worldScope.component.removeFromSystem('ingot', 'sys1'), true);

  assert.deepEqual(Object.values(scope.payload.membership), [], 'the membership record is gone');
  assert.deepEqual(
    componentsOf(harness).map((record) => record.id),
    [],
    'and so is the in-system record'
  );
});

test('1371: a component the world roster does not hold writes nothing', async () => {
  const harness = makeEssenceStoreHarness({ components: [] });
  const { store, scope } = await openStore(harness, []);
  harness.writes.length = 0;

  assert.equal(await store.worldScope.component.addToSystem('nope', 'sys1'), false);
  assert.equal(await store.worldScope.component.addToSystem('', 'sys1'), false);
  assert.equal(await store.worldScope.component.addToSystem('ingot', ''), false);
  assert.deepEqual(harness.writes, [], 'negative control: no write at all');
  assert.deepEqual(scope.payload.membership, {});
});

test('1371: the component family publishes setWorldTags and setMutedTags, and its siblings do not', async () => {
  // THE POSITIVE HALF IS MANDATORY. An absence-only check passes on a family that returns an empty
  // object, which is what a broken descriptor lookup produces — so the presence assertion is what
  // makes the two absences below measurements.
  const harness = makeEssenceStoreHarness({ components: [] });
  const { store } = await openStore(harness, [LINKED]);

  assert.equal(typeof store.worldScope.component.setWorldTags, 'function');
  assert.equal(typeof store.worldScope.component.setMutedTags, 'function');
  assert.equal(typeof store.worldScope.essence.setMutedTags, 'undefined');
  assert.equal(typeof store.worldScope.tool.setMutedTags, 'undefined');
  // And the shape they DO share, so the two absences are not a family that failed to mint at all.
  assert.equal(typeof store.worldScope.essence.addToSystem, 'function');
  assert.equal(typeof store.worldScope.tool.addToSystem, 'function');
});
