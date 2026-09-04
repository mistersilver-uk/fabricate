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
import { get } from 'svelte/store';

import { createAdminStore } from '../../src/ui/svelte/stores/adminStore.js';
import { makeEssenceStoreHarness } from '../helpers/essenceFixtures.js';
import { getItemMatchUuids } from '../../src/utils/sourceReferenceUnion.js';
import { makeWorldScopeStoreFake } from '../helpers/worldScopeStoreFixture.js';

/**
 * THE STORE FAKE IS SHARED (issue 1371, round 3). Its body was byte-identical to the essence
 * suite's, which Sonar's copy-paste detector counts against the gate — and rightly, because the
 * scope store is generic over the entity family and the two copies were one contract twice.
 * Aliased locally so every call site below reads as the component store it is driving.
 */
const makeComponentScopeStore = makeWorldScopeStoreFake;

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

  // A PROBE ON THE SYSTEM WRITE, so the ORDER is observable rather than inferred. The two halves
  // land in different places — the membership record in the scope payload, the seeded row through
  // `updateSystem` — so neither one's presence at the end says which happened first.
  const membershipAtSystemWrite = [];
  const shippedUpdateSystem = harness.services.getCraftingSystemManager().updateSystem;
  harness.services.getCraftingSystemManager().updateSystem = async (id, updates) => {
    membershipAtSystemWrite.push(...Object.values(scope.payload.membership));
    return shippedUpdateSystem(id, updates);
  };

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

  // AND THE ORDER THE TITLE CLAIMS. The membership write goes FIRST because it owns the
  // already-a-member rule, so the in-system seed does not restate it — and if the seed is then
  // refused, the membership record is the one that has to be removed again. Round 1 asserted only
  // that both landed, so swapping the two lines passed.
  //
  // The system write is the only one that reaches the harness; the membership write lands in the
  // scope payload. So the order is read as "the membership record was already there when the
  // system write happened", which is what the sequence actually has to guarantee.
  const systemWrites = harness.writes.filter((write) => write.kind === 'updateSystem');
  assert.equal(systemWrites.length, 1, 'exactly one system write');
  assert.ok(
    systemWrites[0].updates.components.some((record) => record.id === 'ingot'),
    'and it carries the seeded row'
  );
  assert.equal(
    membershipAtSystemWrite.length,
    1,
    'the membership record existed BEFORE the in-system seed was written, not after'
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

// ── THE WORLD-SCOPE USAGE LEG (issue 1371, round 2) ────────────────────────────────────────
//
// Round 1 shipped this leg with NO store unit at all, and its gathering-production half read
// `task.resultGroups` — a key a STORED gathering task never carries. `_normalizeGatheringTask` is
// an allowlist rebuild emitting `dropRows` (from `dropRows ?? itemDrops`) and no `resultGroups` at
// all; `resultGroups` is minted at COMPOSITION time with `results: []` and stays empty until issue
// 683. So the loop compiled, ran, iterated nothing, and reported no gathering production on any
// world — invisibly, because the projection did not publish `producedBy` either.
//
// Both halves are closed here: the leg reads `dropRows`, and the projection publishes the answer,
// which is what makes this assertion an observation rather than a restatement of the source.
test('1371: a gathering task contributes its DROPS to producedBy, off dropRows', async () => {
  const harness = makeEssenceStoreHarness({ components: [] });
  const shippedGetSetting = harness.services.getSetting;
  harness.services.getSetting = (key) =>
    key === 'gatheringConfig'
      ? {
          systems: {
            sys1: {
              tasks: [
                {
                  id: 'task-forage',
                  name: 'Forage the reach',
                  // THE SHAPE THE NORMALIZER EMITS, with `componentId` on one row and the legacy
                  // `systemItemId` on the other — the pair `normalizeItemDrop` coalesces, so a leg
                  // reading only the first would silently drop half a real corpus.
                  dropRows: [
                    { id: 'drop-1', componentId: 'ingot', quantity: 1 },
                    { id: 'drop-2', systemItemId: 'coal', quantity: 2 },
                  ],
                  // AND THE KEY THE DEAD LEG READ, populated. It is the NEGATIVE control: a
                  // `resultGroups` implementation would answer `never-read` here and answer
                  // NOTHING for the two rows above, so the assertions below tell the two apart.
                  resultGroups: [{ id: 'rg', results: [{ componentId: 'never-read' }] }],
                },
              ],
            },
          },
        }
      : shippedGetSetting(key);

  const { store } = await openStore(harness, [
    LINKED,
    { id: 'coal', name: 'Coal', originItemUuid: 'Item.coal' },
  ]);

  const entries = get(store.viewState).worldScope.component.entries;
  const producedBy = (id) => entries.find((entry) => entry.id === id)?.producedBy ?? [];

  assert.deepEqual(
    producedBy('ingot').map((reference) => [reference.kind, reference.id]),
    [['gathering', 'task-forage']],
    'a drop row naming the component by `componentId` reaches producedBy'
  );
  assert.deepEqual(
    producedBy('coal').map((reference) => [reference.kind, reference.id]),
    [['gathering', 'task-forage']],
    'and so does one naming it by the legacy `systemItemId`'
  );
  assert.deepEqual(
    entries.flatMap((entry) => entry.producedBy).filter((r) => r.id === 'never-read'),
    [],
    'and nothing reads `resultGroups`, which a stored task does not carry'
  );

  // THE STAT DOES NOT MOVE. A gathering reference is production, not a recipe, and the row's stat
  // is labelled `Recipes` — so a leg that counted it there would make the number disagree with
  // its own label, which is the failure the tool leg's own note records.
  assert.equal(entries.find((entry) => entry.id === 'ingot')?.recipeCount, 0);
});
