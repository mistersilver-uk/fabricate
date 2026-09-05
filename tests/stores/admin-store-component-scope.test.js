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

import { CraftingSystemManager } from '../../src/systems/CraftingSystemManager.js';
import { membershipKey } from '../../src/systems/scopedDefinitions.js';
import { createAdminStore } from '../../src/ui/svelte/stores/adminStore.js';
import { makeEssenceStoreHarness } from '../helpers/essenceFixtures.js';
import { recipeReferencesComponent } from '../../src/utils/recipeComponentReferences.js';
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

/**
 * Give the harness's crafting-system manager the SANCTIONED component delete — the shipped one.
 *
 * ## It runs `CraftingSystemManager`'s own method body, not a description of it
 *
 * `deleteComponents` and everything under it (`_deleteComponentSet`, `_stripComponentsFromRecipes`)
 * touch `this` only through named collaborators, so the real prototype methods are invoked against
 * a bag holding a recipe manager, a `getSystem` and a `save`. The reference repair under test is
 * therefore the SHIPPED cascade — every referencing recipe rewritten once, the ones left without a
 * usable shape clamped to disabled, essence source links cleared — rather than a second
 * implementation of it in a fixture, which is the way a test double quietly stops matching the
 * thing it stands for.
 *
 * `makeEssenceStoreHarness` ships no `deleteComponents` (it was written for the essence suites), and
 * `tests/helpers/**` belongs to no one lane, so the seam is installed here.
 *
 * ## And the two failure windows are injected HERE, into the shipped cascade
 *
 * `failAt` reddens one of the two seams the cascade actually has, and their ORDER is the whole
 * point (issue 1371, round 11). `_deleteComponentSet` persists ONCE, at its end:
 *
 *   `persist`   — `this.save()` throws. Nothing durable landed; the saved `craftingSystems` value
 *                 still holds the row.
 *   `reconcile` — `_reconcileAlchemySignaturesAfterDeletion` throws, which `deleteComponents` runs
 *                 only AFTER `_deleteComponentSet` has returned. The row is durably gone.
 *
 * They are injected as collaborators of the REAL method bodies rather than as a thrown-from stub
 * standing in for the cascade, so what the store sees on the way out — including what
 * `getSystem` reads afterwards — is what the shipped manager leaves behind, not what a fixture
 * decided to leave behind. That distinction is load-bearing for the two window tests below.
 *
 * @param {object} harness the essence store harness.
 * @param {{failAt?: 'persist'|'reconcile'}} [options] which seam of the cascade should throw.
 * @returns {{calls: Array<{systemId: string, componentIds: string[]}>, infos: string[]}} what the
 *   store asked for, and what the GM was told.
 */
function installSanctionedComponentDelete(harness, { failAt } = {}) {
  const proto = CraftingSystemManager.prototype;
  const infos = [];
  // `deleteComponents` announces the cascade through the Foundry global. Undeclared, `ui?.` is a
  // ReferenceError rather than `undefined`, so the notification sink is installed too — and it is
  // what the recipe-cascade disclosure is read from below.
  globalThis.ui = {
    notifications: {
      info: (message) => {
        infos.push(String(message));
      },
    },
  };
  const managerish = {
    recipeManager: {
      getRecipes: (filter) => harness.services.getRecipeManager().getRecipes(filter),
      updateRecipe: async (recipeId, json) => {
        const index = harness.recipes.findIndex((recipe) => recipe.id === recipeId);
        if (index !== -1) harness.recipes[index] = json;
      },
      save: async () => {},
      notifyRecipesChanged: () => {},
    },
    getSystem: (systemId) => harness.systemManager.getSystem(systemId),
    save: async () => {
      if (failAt === 'persist') throw new Error('The crafting systems setting could not be saved.');
    },
    _assertGM: () => {},
    _notifySystemsChanged: () => {},
    _cleanupSalvageRunsForComponent: async () => {},
    _reconcileAlchemySignaturesAfterDeletion: async () => {
      if (failAt === 'reconcile') throw new Error('Alchemy signatures could not be reconciled.');
    },
    _stripComponentsFromRecipes: proto._stripComponentsFromRecipes,
    _deleteComponentSet: proto._deleteComponentSet,
  };
  const calls = [];
  harness.systemManager.deleteComponents = async (systemId, componentIds) => {
    calls.push({ systemId, componentIds: [...componentIds] });
    harness.writes.push({ kind: 'deleteComponents', componentIds: [...componentIds] });
    return await proto.deleteComponents.call(managerish, systemId, componentIds);
  };
  return { calls, infos };
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
  installSanctionedComponentDelete(harness);
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

/**
 * A recipe that names the component, in the system it is being removed from. Its ingredient set
 * holds exactly one option, so stripping the component empties the group, empties the set, and
 * leaves the recipe with no ingredient sets at all — the shape `recipeLostItsShape` clamps to
 * disabled. Both consequences of the cascade are therefore observable on one fixture.
 */
const NAILS_RECIPE = Object.freeze({
  id: 'r-nails',
  name: 'Iron Nails',
  craftingSystemId: 'sys1',
  enabled: true,
  ingredientSets: [
    { id: 'set-1', ingredientGroups: [{ id: 'grp-1', options: [{ componentId: 'ingot', quantity: 2 }] }] },
  ],
  resultGroups: [{ id: 'res-1', results: [{ componentId: 'nail', quantity: 10 }] }],
});

test('1371: removing a component from a system REPAIRS the recipes that name it', async () => {
  // REVIEWER 2, ROUND 5 (blocking, data integrity). The in-system half used to filter the
  // `components` array and call `updateSystem`, which normalizes, asserts uniqueness and saves —
  // and repairs NOTHING. So `Remove from this system`, reachable from the entry's per-system rows,
  // the system rules roster and the catalogue's bulk `Remove from` group, left every recipe in that
  // system referencing a component id the system no longer held: no rewrite, no disable, no
  // statement. Deleting the same component from the component list has always cascaded; the two
  // now leave the same system behind.
  const harness = makeEssenceStoreHarness({
    components: [],
    recipes: [structuredClone(NAILS_RECIPE)],
  });
  const { store } = await openStore(harness, [LINKED]);
  const sanctioned = installSanctionedComponentDelete(harness);
  await store.worldScope.component.addToSystem('ingot', 'sys1');

  // PRE-CONDITION: the recipe really does reference the component before the removal. Without it
  // the assertions below pass on a fixture the cascade never had to touch.
  assert.ok(
    recipeReferencesComponent(harness.recipes[0], 'ingot'),
    'PRE-CONDITION: the recipe names the component being removed'
  );

  assert.equal(await store.worldScope.component.removeFromSystem('ingot', 'sys1'), true);

  // THE OUTCOME FIRST, so a regression reddens on the state the GM is left with rather than on
  // the seam that produces it.
  assert.ok(
    !recipeReferencesComponent(harness.recipes[0], 'ingot'),
    'the recipe no longer names a component this system does not have'
  );
  assert.equal(
    harness.recipes[0].enabled,
    false,
    'and a recipe left with no ingredient set at all is clamped to disabled rather than offered ' +
      'to players as permanently unsatisfiable'
  );
  assert.ok(
    sanctioned.infos.some((message) => message.includes('updated 1 recipe(s)')),
    'and the GM is TOLD how far it reached — the cascade the bulk panel copy must disclose'
  );
  assert.deepEqual(
    sanctioned.calls,
    [{ systemId: 'sys1', componentIds: ['ingot'] }],
    'because the removal goes through the SANCTIONED delete, which is where the repair lives'
  );
});

test('1371: the sanctioned delete seam is the one the store feature-detects', async () => {
  // A MIRROR GUARD. `partComponentFromSystem` refuses the whole removal when the manager has no
  // `deleteComponents` — the shape `adoptWorldTool` uses for `upsertTool` — so a rename on the
  // manager would not fail here, it would make every `Remove from this system` control silently
  // write nothing at all. This is the assertion that reddens instead.
  assert.equal(typeof CraftingSystemManager.prototype.deleteComponents, 'function');
  assert.equal(typeof CraftingSystemManager.prototype._deleteComponentSet, 'function');
});

test('1371: a manager that cannot delete refuses the WHOLE removal, not half of it', async () => {
  // The harness ships no `deleteComponents`, which is exactly the state the guard is written for.
  // Removing the membership record and then failing to remove the in-system row is the worse of
  // the two outcomes: the read union's "no world half for this row" branch pushes such a record
  // through UNCHANGED, so the component goes on resolving in a system the GM has removed it from
  // with the world layer silently no longer consulted.
  const harness = makeEssenceStoreHarness({ components: [] });
  const { store, scope } = await openStore(harness, [LINKED]);
  installSanctionedComponentDelete(harness);
  await store.worldScope.component.addToSystem('ingot', 'sys1');
  delete harness.systemManager.deleteComponents;

  assert.equal(await store.worldScope.component.removeFromSystem('ingot', 'sys1'), false);

  assert.deepEqual(
    Object.values(scope.payload.membership).map((record) => record.entityId),
    ['ingot'],
    'the membership record is NOT removed on its own'
  );
  assert.deepEqual(
    componentsOf(harness).map((record) => record.id),
    ['ingot'],
    'and the in-system record still stands, so the two halves still agree'
  );
});

/**
 * Refuse the in-system seed the way the shipped manager refuses it: through
 * `_assertUniqueComponentSourcesForSystem` itself.
 *
 * That method reads only its `system` argument, so the REAL assertion is invoked against the
 * system the write would produce. The refusal under test is therefore the shipped one — two
 * in-system components claiming one source uuid, which is exactly the duplicate-source state the
 * world entry's own `Review & merge` band exists to surface — rather than a stand-in error.
 *
 * @param {object} harness the essence store harness.
 * @returns {void}
 */
function refuseDuplicateSourceWrites(harness) {
  const shipped = harness.systemManager.updateSystem;
  harness.systemManager.updateSystem = async (systemId, updates) => {
    CraftingSystemManager.prototype._assertUniqueComponentSourcesForSystem.call(
      harness.systemManager,
      { ...harness.system, ...updates }
    );
    return await shipped(systemId, updates);
  };
}

/** A system component already claiming the source uuid the world component would seed. */
const CLAIMANT = Object.freeze({
  id: 'scrap',
  name: 'Iron Scrap',
  originItemUuid: 'Item.ingot-origin',
});

test('1371: a REFUSED seed rolls the membership record back and reports it', async () => {
  // REVIEWER 3, ROUND 5 (high). The composition wrote membership and then awaited the seed
  // uncaught, so a refusal left BOTH the ghost state the verb exists to prevent — a membership
  // record with no in-system row, which the read union cannot draw — and an unhandled rejection
  // escaping the catalogue's bulk loop, where it skipped every remaining component and never
  // cleared the selection. `adoptWorldTool` had the rollback all along; this mirrors it.
  const harness = makeEssenceStoreHarness({ components: [{ ...CLAIMANT }] });
  const { store, scope } = await openStore(harness, [LINKED]);
  refuseDuplicateSourceWrites(harness);

  const answer = await store.worldScope.component.addToSystem('ingot', 'sys1');

  assert.equal(answer, false, 'the verb ANSWERS rather than throwing, so a bulk loop continues');
  assert.deepEqual(
    Object.values(scope.payload.membership),
    [],
    'and the membership record this call wrote is removed again, so no ghost survives'
  );
  assert.deepEqual(
    componentsOf(harness).map((record) => record.id),
    ['scrap'],
    'the system keeps exactly what it had'
  );
  assert.equal(harness.notifications.error.length, 1, 'the GM is told, once');
  assert.ok(
    harness.notifications.error[0].includes('Iron Scrap'),
    'and the message names the component already claiming the source, which is what the GM has ' +
      'to go and merge'
  );

  // THE MESSAGE IS LOCALIZED, AND CANNOT DEGRADE TO THE KEY. `localize` answers a MISSING key
  // with the key itself — which this harness reproduces exactly, by returning every key verbatim
  // — so the notification here is coming from the English floor rather than from a translation,
  // and that is the branch worth pinning: it is what a world with an incomplete `lang` file gets.
  const request = harness.localizations.find(
    (entry) => entry.key === 'FABRICATE.Admin.Manager.Component.AddToSystemFailed'
  );
  assert.ok(Boolean(request), 'the key is asked for, so a translation CAN answer');
  assert.ok(
    String(request.data?.error ?? '').includes('Iron Scrap'),
    'and the reason is handed over as `{error}`, so the localized string can state it too'
  );
  assert.ok(
    !harness.notifications.error[0].startsWith('FABRICATE.'),
    'and no GM ever reads a raw key'
  );
});

test('1371: but a membership record it did NOT write is left alone', async () => {
  // THE ROLLBACK IS GUARDED ON THIS CALL'S OWN WRITE, and the state is reachable: a record written
  // before this composition shipped, or one left by an earlier refusal, has no in-system row. On
  // such a record `addToSystem` answers `false` (already a member) and the seed still runs — and
  // an unguarded rollback would then DELETE membership the GM authored earlier because an
  // unrelated duplicate refused the seed.
  const harness = makeEssenceStoreHarness({ components: [{ ...CLAIMANT }] });
  const { store, scope } = await openStore(harness, [LINKED]);
  scope.payload.membership[membershipKey('ingot', 'sys1')] = {
    entityId: 'ingot',
    systemId: 'sys1',
    inherit: {},
  };
  refuseDuplicateSourceWrites(harness);

  assert.equal(await store.worldScope.component.addToSystem('ingot', 'sys1'), false);

  assert.deepEqual(
    Object.values(scope.payload.membership).map((record) => record.entityId),
    ['ingot'],
    'the pre-existing membership record survives the refusal'
  );
  assert.equal(harness.notifications.error.length, 1, 'and the GM is still told the seed failed');
});

// ── THE REMOVAL'S FAILURE WINDOWS (issue 1371, round 11) ───────────────────────────────────
//
// Round 8 closed the MISSING-seam case (a manager with no `deleteComponents` refuses the whole
// removal) and left the THROWING-seam case open: the membership half was written first and
// awaited, so a rejection out of the delete cascade escaped with the membership record already
// gone and the in-system row still standing — the ghost this verb is composed to prevent, reached
// by failure instead of by design — and escaped the catalogue's bulk loop as an unhandled
// rejection on the way.
//
// The fix is the ORDER rather than a rollback, so these tests are about ORDER and about the two
// windows the shipped cascade actually has. `_deleteComponentSet` persists once at its end, so a
// throw before that persist leaves the row durably in place and a throw after it (from
// `_reconcileAlchemySignaturesAfterDeletion`) leaves it really gone. Both are driven below, and
// both are driven through the REAL method bodies — a stub that just threw would prove nothing
// about what the manager leaves behind, which is the whole question.

test('1371: the removal deletes the IN-SYSTEM row first, while the membership record still stands', async () => {
  // THE ORDER IS THE COMPENSATION, so the order is what is pinned. Swapping the two lines back
  // passes every end-state assertion in this file — both halves are gone either way — and reddens
  // only here.
  const harness = makeEssenceStoreHarness({ components: [] });
  const { store, scope } = await openStore(harness, [LINKED]);
  installSanctionedComponentDelete(harness);
  await store.worldScope.component.addToSystem('ingot', 'sys1');

  // A PROBE ON THE DELETE, so the order is observable rather than inferred: the membership record
  // lives in the scope payload and the row in the system, so neither one's absence at the end says
  // which went first.
  const membershipAtDelete = [];
  const installed = harness.systemManager.deleteComponents;
  harness.systemManager.deleteComponents = async (systemId, componentIds) => {
    membershipAtDelete.push(...Object.values(scope.payload.membership));
    return await installed(systemId, componentIds);
  };

  assert.equal(await store.worldScope.component.removeFromSystem('ingot', 'sys1'), true);

  assert.equal(
    membershipAtDelete.length,
    1,
    'the membership record was STILL THERE when the delete cascade ran — so a throw out of the ' +
      'cascade cannot leave the ghost, because the half that creates it has not run yet'
  );
  assert.deepEqual(Object.values(scope.payload.membership), [], 'and it is gone afterwards');
  assert.deepEqual(componentsOf(harness).map((record) => record.id), [], 'as is the row');
});

/**
 * Drive a removal whose in-system half throws at one of the cascade's two seams.
 *
 * Shared by the two window tests because they are ONE contract asked twice — the store's answer
 * must not depend on which side of the persist the manager fell over, since it cannot tell.
 * Written once so the two cannot drift, and so the pair adds no duplicated block to the gate.
 *
 * `translations` installs a WORLD THAT HAS THE KEY. The harness's own localizer answers every key
 * with the key itself, which reproduces Foundry's missing-key behaviour exactly — so by default
 * this drives the English-floor branch, and passing a table drives the translated branch. Both are
 * real states of a shipped world and the store has to be right in both.
 *
 * @param {'persist'|'reconcile'} failAt which seam of the shipped cascade throws.
 * @param {{translations?: Record<string, string>}} [options] the lang table this world has.
 * @returns {Promise<{answer: boolean, membership: string[], rows: string[], errors: string[],
 *   localizations: Array<{key: string, data: object}>}>}
 */
async function driveRemovalFailure(failAt, { translations } = {}) {
  const harness = makeEssenceStoreHarness({ components: [] });
  const { store, scope } = await openStore(harness, [LINKED]);
  installSanctionedComponentDelete(harness, { failAt });
  await store.worldScope.component.addToSystem('ingot', 'sys1');
  harness.notifications.error.length = 0;
  if (translations) {
    const echoing = harness.services.localize;
    harness.services.localize = (key, data) => {
      // The shipped localizer still runs, so the (key, data) pair is recorded either way and the
      // two branches are asserted against the same evidence.
      const echoed = echoing(key, data);
      const translated = translations[key];
      return translated
        ? translated.replaceAll('{error}', String(data?.error ?? ''))
        : echoed;
    };
  }

  // NO `assert.rejects` HERE, and that is the first thing under test: the verb has to ANSWER.
  const answer = await store.worldScope.component.removeFromSystem('ingot', 'sys1');

  return {
    answer,
    membership: Object.values(scope.payload.membership).map((record) => record.entityId),
    rows: componentsOf(harness).map((record) => record.id),
    errors: [...harness.notifications.error],
    localizations: [...harness.localizations],
  };
}

test('1371: a delete that throws BEFORE its persist leaves the membership record ALONE', async () => {
  // WINDOW ONE. `_deleteComponentSet` gets as far as `this.save()` and the settings write is
  // refused, so nothing durable landed and the saved `craftingSystems` value still holds the row.
  const outcome = await driveRemovalFailure('persist');

  assert.deepEqual(
    outcome.membership,
    ['ingot'],
    'the membership record survives, because the ordering means it was never written to at all — ' +
      'this is the assertion the ghost cannot get past'
  );
  assert.equal(outcome.errors.length, 1, 'the GM is told, once');
  assert.ok(
    outcome.errors[0].includes('The crafting systems setting could not be saved.'),
    'and told the reason the manager gave, which is the half they can act on'
  );
  assert.ok(
    !outcome.errors[0].startsWith('FABRICATE.'),
    'and no GM ever reads a raw key — this harness answers every key with the key itself, so ' +
      'what is read here is the English floor, which is the branch an incomplete lang file gets'
  );
});

test('1371: and so does one that throws AFTER it — the store cannot tell the two windows apart', async () => {
  // WINDOW TWO, and THE MEASUREMENT THAT SETTLES THE DESIGN. `deleteComponents` runs
  // `_reconcileAlchemySignaturesAfterDeletion` only once `_deleteComponentSet` has returned, so
  // here the row is DURABLY gone where in window one it was not.
  //
  // The obvious alternative fix — keep the membership-first order and restore the record "only if
  // the in-system row still stands" — needs those two windows to be told apart from the store.
  // They cannot be: `_deleteComponentSet` mutates `system.components` IN PLACE before it persists,
  // and `getSystem` hands back that same live object, so the row reads GONE in both. The
  // assertion below is that reading, and it is why the shipped fix is the order instead.
  const before = await driveRemovalFailure('persist');
  const after = await driveRemovalFailure('reconcile');

  assert.deepEqual(after.membership, ['ingot'], 'the membership record survives here too');
  assert.equal(after.errors.length, 1, 'and the GM is told, once');
  assert.deepEqual(
    after.rows,
    [],
    'the row reads GONE after a throw from beyond the persist, which is the true state'
  );
  assert.deepEqual(
    before.rows,
    [],
    'AND IT READS GONE after a throw from the persist itself, where the setting still holds it — ' +
      'so "restore the membership record only if the row still stands" would never once fire in ' +
      'the window it would have been written for'
  );
  assert.equal(
    before.answer,
    after.answer,
    'so the two windows get the same answer, because the store has no way to give them different ' +
      'ones honestly'
  );
  assert.equal(
    after.answer,
    true,
    'and the answer is "something changed" rather than "it worked": `_republishingFamily` gates ' +
      'the re-projection on it, and a screen still drawing a row no reader can find is the one ' +
      'outcome worse than a failure the GM was told about'
  );
});

test('1371: a membership write that throws leaves only the INERT half, and still moves the screen', async () => {
  // THE SECOND HALF'S OWN WINDOW. The row is gone and the recipe cascade has already run, so there
  // is nothing to give back — re-seeding the row could not restore the rewritten recipes, and the
  // membership record standing over a missing row is the RECOVERABLE partial state: the read
  // union iterates the IN-SYSTEM array, finds nothing, and draws nothing through this system.
  //
  // "INERT" IS ABOUT THE READ UNION, NOT THE WORLD SCREENS (issue 1371 r17). The rules list
  // draws the record as a ghost row; the world entry's systems card, the catalogue's system
  // count and its `Has rules in` filter all still COUNT the membership, and the picker's
  // `heldHere` withholds the record from this system's offer while the ghost row offers to add
  // it — the two add surfaces disagree until the removal is re-issued or the ghost row's Add
  // recovers the row. The docblock on `partComponentFromSystem` states the same.
  const harness = makeEssenceStoreHarness({ components: [] });
  const { store, scope } = await openStore(harness, [LINKED]);
  installSanctionedComponentDelete(harness);
  await store.worldScope.component.addToSystem('ingot', 'sys1');
  scope.store.save = async () => {
    throw new Error('The component scope setting could not be saved.');
  };
  harness.notifications.error.length = 0;

  const answer = await store.worldScope.component.removeFromSystem('ingot', 'sys1');

  assert.equal(
    answer,
    true,
    'the row really is gone, so the projection MUST be re-published even though the verb failed'
  );
  assert.deepEqual(componentsOf(harness).map((record) => record.id), [], 'the row is gone');
  assert.deepEqual(
    Object.values(scope.payload.membership).map((record) => record.entityId),
    ['ingot'],
    'and the membership record is the half left over — inert to the read union, drawn as a ' +
      'ghost on the rules list, still COUNTED by the world screens until the removal is ' +
      're-issued or the ghost row`s Add recovers the row'
  );
  assert.equal(harness.notifications.error.length, 1, 'the GM is told, once');
});

test('1371: a removal that writes nothing at all answers false, and spends no re-projection', async () => {
  // THE NEGATIVE CONTROL FOR THE CATCH'S ANSWER. Every assertion above reads `true` out of a
  // failure, so an implementation that simply answered `true` from the catch would pass all of
  // them. Here the system holds no row at all and the scope write is refused: nothing moved, and
  // the honest answer is `false` — `_republishingFamily` must not spend a publish on it.
  const harness = makeEssenceStoreHarness({ components: [] });
  const { store, scope } = await openStore(harness, [LINKED]);
  installSanctionedComponentDelete(harness);
  scope.payload.membership[membershipKey('ingot', 'sys1')] = {
    entityId: 'ingot',
    systemId: 'sys1',
    inherit: {},
  };
  scope.store.save = async () => {
    throw new Error('The component scope setting could not be saved.');
  };

  assert.equal(await store.worldScope.component.removeFromSystem('ingot', 'sys1'), false);
  assert.deepEqual(
    Object.values(scope.payload.membership).map((record) => record.entityId),
    ['ingot'],
    'nothing was written, so nothing is missing'
  );
  assert.equal(harness.notifications.error.length, 1, 'and the GM is still told it did not happen');
});

// ── AND THE SENTENCE THE GM READS IS LOCALIZED (issue 1371, round 11 follow-up) ────────────
//
// The removal shipped its message as plain English because no component `RemoveFromSystemFailed`
// key existed and `localize` answers a MISSING key with the key itself — so naming one before it
// was in `lang/en.json` would have put `FABRICATE.…` on a GM's screen. The key is added beside
// `AddToSystemFailed` and the sentence now reads through the same key-echo-guarded localizer the
// join uses. BOTH branches are pinned, because a world with an incomplete lang file takes the
// second one and it is the branch the guard exists for.

/** The key the removal's failure sentence is asked for under. */
const REMOVE_FAILED_KEY = 'FABRICATE.Admin.Manager.Component.RemoveFromSystemFailed';

test('1371: a world that HAS the key reads the translation, reason and all', async () => {
  const outcome = await driveRemovalFailure('persist', {
    translations: { [REMOVE_FAILED_KEY]: 'Le retrait ne s’est pas terminé. {error}' },
  });

  assert.equal(
    outcome.errors[0],
    'Le retrait ne s’est pas terminé. The crafting systems setting could not be saved.',
    'the translated sentence is what the GM reads, and the reason is interpolated into it — so ' +
      'the `{error}` parameter is carried through the localizer rather than only reaching the ' +
      'English floor'
  );
  const request = outcome.localizations.find((entry) => entry.key === REMOVE_FAILED_KEY);
  assert.ok(Boolean(request), 'the key is asked for, so a translation CAN answer');
  assert.ok(
    String(request.data?.error ?? '').includes('The crafting systems setting could not be saved.'),
    'and it is handed the reason as `{error}`'
  );
});

test('1371: and a world that does NOT reads the English floor, never the key', async () => {
  // THE HARNESS ANSWERS EVERY KEY WITH THE KEY, which is Foundry's missing-key behaviour exactly.
  // `localize(k) || fallback` would return the key here and print `FABRICATE.…`; the guard is what
  // makes this branch a sentence.
  const outcome = await driveRemovalFailure('persist');

  assert.equal(
    outcome.errors[0],
    'Removing the component from this system did not complete. ' +
      'The crafting systems setting could not be saved.',
    'the floor is the shipped English sentence with the reason after it'
  );
  assert.ok(!outcome.errors[0].startsWith('FABRICATE.'), 'and never the raw key');
  assert.ok(
    outcome.localizations.some((entry) => entry.key === REMOVE_FAILED_KEY),
    'the key was still ASKED for — the floor is a fallback from a real lookup, not a decision to ' +
      'skip localization, which is the difference a rename on the key has to be able to expose'
  );
});
