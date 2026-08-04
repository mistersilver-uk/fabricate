/**
 * Recipe-book membership BASIS — the monotonic `system.membershipResolvesByRecipeIds`
 * marker (issue 1011, absorbed by and landed with issue 1010).
 *
 * Five readers choose between the canonical `RecipeItemDefinition.recipeIds[]` array and
 * the legacy per-recipe scalar (`recipe.recipeItemId`, plus a `linkedRecipeItemUuid →
 * definition.originItemUuid` leg). They used to choose with the same INFERRED,
 * system-wide, BIDIRECTIONAL predicate — "any definition has a non-empty recipeIds" —
 * which is not a migration marker but a live inference redone on every read, so it
 * flipped both ways: the first membership write to a legacy system orphaned every
 * scalar-only member, and emptying the last array reverted the whole system and
 * resurrected phantom memberships. Two of the five readers are player-facing.
 *
 * This suite is written as ONE reader table iterated per scenario rather than five
 * near-identical setup+assert blocks per scenario: the readers have five different call
 * shapes, and the natural writing would blow the SonarCloud new-code duplication budget
 * on its own. Every reader resolves to the same comparable — the sorted ids of the books
 * that contain a given recipe — so one expectation map covers all five.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { createServices, makeRecipe } from './helpers/adminStoreServices.js';
// The bulk panel's per-book selection count — a SIXTH reader of this basis, and the only
// one whose failure mode is a disabled control rather than a wrong list.
import { countRecipeBookMembership } from '../src/utils/recipeBulkEditModel.js';

let idCounter = 0;

function getProperty(object, path) {
  if (!object || !path) return undefined;
  return String(path)
    .split('.')
    .reduce((value, key) => (value == null ? undefined : value[key]), object);
}

// The world-settings store the manager reads and writes through `src/config/settings.js`.
// Cloning on write is what makes the round-trip honest: a persisted setting is data, so a
// field the normalizer's allowlist literal forgets to emit is genuinely lost here.
let worldSettings = new Map();

globalThis.foundry = {
  utils: { getProperty, randomID: () => `id-${++idCounter}` },
};
globalThis.game = {
  user: { isGM: true, id: 'gm' },
  i18n: { localize: (key) => key, format: (key) => key },
  actors: { contents: [] },
  settings: {
    get: (_namespace, key) => worldSettings.get(key),
    set: async (_namespace, key, value) => {
      worldSettings.set(key, structuredClone(value));
    },
  },
};
globalThis.ui = { notifications: { info: () => {}, warn: () => {}, error: () => {} } };
globalThis.fromUuid = async () => null;
globalThis.fromUuidSync = () => null;

const { SETTING_KEYS } = await import('../src/config/settings.js');
const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');
const { RecipeVisibilityService } = await import('../src/systems/RecipeVisibilityService.js');
const { InventoryListingBuilder } = await import('../src/systems/InventoryListingBuilder.js');
const { createAdminStore } = await import('../src/ui/svelte/stores/adminStore.js');

const SYSTEM_ID = 'sys1';
const BOOK_A_UUID = 'Item.bookA';
const BOOK_B_UUID = 'Item.bookB';

// Explicit comparator (never the default lexicographic `.sort()` — Sonar S2871).
const byId = (left, right) => String(left).localeCompare(String(right));

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

function persistedSystem({ aRecipeIds = [], bRecipeIds = [], marker } = {}) {
  const system = {
    id: SYSTEM_ID,
    name: 'Arcana',
    // A learn-capable book system, so `InventoryListingBuilder` actually emits book rows.
    visibilityMode: 'knowledge',
    recipeVisibility: { listMode: 'knowledge', knowledge: { mode: 'itemOrLearned' } },
    components: [],
    recipeItemDefinitions: [
      {
        id: 'book-a',
        name: 'Book A',
        img: 'icons/book-a.webp',
        originItemUuid: BOOK_A_UUID,
        recipeIds: aRecipeIds,
        caps: { item: {}, learn: {} },
      },
      {
        id: 'book-b',
        name: 'Book B',
        img: 'icons/book-b.webp',
        originItemUuid: BOOK_B_UUID,
        recipeIds: bRecipeIds,
        caps: { item: {}, learn: {} },
      },
    ],
  };
  if (marker !== undefined) system.membershipResolvesByRecipeIds = marker;
  return system;
}

/**
 * The four membership shapes a legacy-basis system can carry, one recipe each:
 * resolved by the `recipeItemId` scalar (twice, into different books), resolved by the
 * `linkedRecipeItemUuid → originItemUuid` leg, and resolved by nothing.
 */
function legacyRecipes() {
  return [
    makeRecipe({ id: 'r-scalar-a', name: 'Fireball', recipeItemId: 'book-a' }),
    makeRecipe({ id: 'r-scalar-b', name: 'Ice Lance', recipeItemId: 'book-b' }),
    makeRecipe({ id: 'r-uuid-a', name: 'Mend', linkedRecipeItemUuid: BOOK_A_UUID }),
    makeRecipe({ id: 'r-none', name: 'Spark' }),
  ];
}

// What the LEGACY basis resolves today, pinned from current behaviour.
const LEGACY_MEMBERSHIPS = {
  'r-scalar-a': ['book-a'],
  'r-scalar-b': ['book-b'],
  'r-uuid-a': ['book-a'],
  'r-none': [],
};

// The adminStore helper never implemented the `linkedRecipeItemUuid` leg of the legacy
// fallback, so under the LEGACY basis it resolves a strict subset. Pinned rather than
// "fixed": widening it would be an unrelated behaviour change, and the point of the
// marker is that once the basis switches, this divergence disappears by construction.
const LEGACY_MEMBERSHIPS_WITHOUT_UUID_LEG = { ...LEGACY_MEMBERSHIPS, 'r-uuid-a': [] };

const NO_MEMBERSHIPS = { 'r-scalar-a': [], 'r-scalar-b': [], 'r-uuid-a': [], 'r-none': [] };

// A book document a player owns: matched to a definition by uuid / compendium source.
function bookItem(uuid) {
  return {
    uuid,
    _stats: { compendiumSource: uuid },
    system: { quantity: 1 },
    getFlag: () => undefined,
  };
}

/**
 * One real `CraftingSystemManager` loaded from the world-settings fake, with all five
 * readers wired to it, so every reader sees exactly the same live system object.
 *
 * Loads through `reload()` rather than `initialize()` by default. `initialize()` also
 * runs the un-versioned `_migrateLegacyRecipeItems`, whose first half re-stamps
 * `recipe.recipeItemId` from a surviving `linkedRecipeItemUuid` — which would rewrite
 * the uuid-leg fixture into a scalar one and silently erase the branch under test.
 * `reload()` is the real socket-bridge load path on every client, so this is not a
 * contrived entry point; the scenarios that care about the migration opt in explicitly.
 */
async function makeFixture({ system = persistedSystem(), recipes = legacyRecipes() } = {}) {
  worldSettings = new Map([[SETTING_KEYS.CRAFTING_SYSTEMS, structuredClone([system])]]);

  const recipeManager = {
    getRecipes: (filters) =>
      recipes.filter(
        (recipe) =>
          filters?.craftingSystemId === undefined ||
          recipe.craftingSystemId === filters.craftingSystemId
      ),
    getRecipe: (id) => recipes.find((recipe) => recipe.id === id) || null,
    toolMatchesItem: () => false,
    save: async () => {},
  };

  const manager = new CraftingSystemManager(recipeManager);
  manager.reload();

  const store = createAdminStore(
    createServices(system, recipes, [], {
      getCraftingSystemManager: () => manager,
      getRecipeManager: () => recipeManager,
    })
  );

  return {
    manager,
    recipeManager,
    visibility: new RecipeVisibilityService(recipeManager, manager),
    listingBuilder: new InventoryListingBuilder({
      recipeManager,
      craftingSystemManager: manager,
      recipeVisibility: null,
      localize: (key) => key,
      nowWorldTime: () => 0,
    }),
    store,
    bookOwner: {
      id: 'a1',
      name: 'Akra',
      img: 'icons/a1.webp',
      items: [bookItem(BOOK_A_UUID), bookItem(BOOK_B_UUID)],
      getFlag: () => undefined,
    },
  };
}

function marker(fixture) {
  return fixture.manager.getSystem(SYSTEM_ID).membershipResolvesByRecipeIds;
}

function persistedRecipeIds(fixture, definitionId) {
  return fixture.manager.getRecipeItemDefinition(SYSTEM_ID, definitionId).recipeIds;
}

// ---------------------------------------------------------------------------
// The reader table — five call shapes, one comparable result
// ---------------------------------------------------------------------------

const READERS = [
  {
    name: 'CraftingSystemManager.getRecipesUsingRecipeItemDefinition',
    async resolve(fixture, recipeId) {
      return fixture.manager
        .getRecipeItemDefinitions(SYSTEM_ID)
        .filter((def) =>
          fixture.manager
            .getRecipesUsingRecipeItemDefinition(SYSTEM_ID, def.id)
            .some((recipe) => recipe.id === recipeId)
        )
        .map((def) => def.id)
        .sort(byId);
    },
  },
  {
    name: 'CraftingSystemManager.getRecipeItemDefinitionsContaining',
    async resolve(fixture, recipeId) {
      return fixture.manager
        .getRecipeItemDefinitionsContaining(SYSTEM_ID, recipeId)
        .map((def) => def.id)
        .sort(byId);
    },
  },
  {
    name: 'RecipeVisibilityService._getRecipeItemDefinitions (player-facing)',
    async resolve(fixture, recipeId) {
      return fixture.visibility
        ._getRecipeItemDefinitions(fixture.recipeManager.getRecipe(recipeId))
        .map((def) => def.id)
        .sort(byId);
    },
  },
  {
    name: 'InventoryListingBuilder book rows (player-facing)',
    async resolve(fixture, recipeId) {
      const listing = fixture.listingBuilder.buildListing({
        craftingActor: fixture.bookOwner,
        viewer: { isGM: true },
      });
      return listing.rows
        .filter(
          (row) =>
            row.isRecipeItem === true &&
            (row.recipes ?? []).some((recipe) => recipe.id === recipeId)
        )
        .map((row) => row.recipeItemId)
        .sort(byId);
    },
  },
  {
    name: 'adminStore recipe projection (recipeItemIds)',
    legacyMemberships: LEGACY_MEMBERSHIPS_WITHOUT_UUID_LEG,
    async resolve(fixture, recipeId) {
      await fixture.store.refresh();
      const row = get(fixture.store.viewState).recipes.find((entry) => entry.id === recipeId);
      return [...(row?.recipeItemIds ?? [])].sort(byId);
    },
  },
  {
    // The SIXTH reader, and the second one inside `adminStore`: `_enrichRecipeItemLibrary`
    // derives each book's `recipes[]` — what Books & Scrolls counts and lists — on the
    // OTHER side of the same many-to-many.
    //
    // THIS ROW IS A PIN, NOT FAILING-FIRST EVIDENCE, and it is worth being exact about
    // what it can and cannot see. It cannot catch a basis inference reintroduced INSIDE
    // `_enrichRecipeItemLibrary` — reverting its `membershipResolvesByRecipeIds === true`
    // guard to a per-definition "this book's `recipeIds` is empty, so fall back" leaves
    // all five scenarios below green. That is not a gap in the scenarios: the enrichment
    // is handed the PROJECTED recipe rows, and `_buildRecipeList` derives their
    // `recipeItemId` from `_recipeItemDefinitionsContaining` rather than copying the raw
    // legacy scalar, so on a marked system an emptied book's former members already carry
    // `recipeItemId: ''` and the legacy reverse index has nothing to resurrect.
    //
    // What it DOES hold is that the book-side answer and the recipe-side answer agree
    // across every scenario while both are read off that one upstream projection. So it
    // fails on a change to what `_buildRecipeList` projects, or to how the enrichment
    // resolves member ids against it — the fifth reader's territory, approached from the
    // opposite side, where a disagreement would be a book reporting contents the Contents
    // tab and both player-facing readers say it does not have. It is not vacuous either:
    // three of the five scenarios expect a non-empty result from it.
    name: 'adminStore Books & Scrolls library (recipeItemDefinitions[].recipes)',
    legacyMemberships: LEGACY_MEMBERSHIPS_WITHOUT_UUID_LEG,
    async resolve(fixture, recipeId) {
      await fixture.store.refresh();
      const definitions = get(fixture.store.viewState).selectedSystem?.recipeItemDefinitions ?? [];
      return definitions
        .filter((def) => (def.recipes ?? []).some((recipe) => recipe.id === recipeId))
        .map((def) => def.id)
        .sort(byId);
    },
  },
];

async function assertMemberships(fixture, reader, expected, label) {
  const entries = Object.entries(expected);
  for (const [recipeId, definitionIds] of entries) {
    assert.deepEqual(
      await reader.resolve(fixture, recipeId),
      definitionIds,
      `${label}: ${recipeId} via ${reader.name}`
    );
  }
  // Return how many assertions ran, so `forEachReader` can prove a reader body did not
  // silently assert nothing (javascript:S2699) — the real fix, not a dummy assertion
  // added only to satisfy the analyser.
  return entries.length;
}

/**
 * Run one assertion body against every reader, as its own test case. Every body here
 * routes its real assertions through `assertMemberships` and returns its count, so this
 * is a genuine anti-vacuity guard rather than a satisfied-the-analyser dummy: a body
 * that stopped asserting would fail here, not just read green.
 */
function forEachReader(title, body) {
  for (const reader of READERS) {
    it(`${title} — ${reader.name}`, async () => {
      const assertionCount = await body(reader);
      assert.ok(
        Number.isInteger(assertionCount) && assertionCount > 0,
        'the reader body performed at least one real assertion via assertMemberships'
      );
    });
  }
}

// ---------------------------------------------------------------------------

describe('recipe-book membership basis — a legacy-basis system', () => {
  forEachReader('resolves membership through the legacy scalars', async (reader) => {
    const fixture = await makeFixture();
    assert.equal(marker(fixture), false, 'no array is populated, so the marker backfills false');
    return assertMemberships(
      fixture,
      reader,
      reader.legacyMemberships ?? LEGACY_MEMBERSHIPS,
      'legacy basis'
    );
  });
});

describe('recipe-book membership basis — the first membership write', () => {
  // The Contents tab saving book A's currently-resolved membership. Without the seed the
  // marker would close the revert direction but make the ORPHANING direction permanent:
  // book B's scalar-only member would be stranded by a write that never named book B.
  async function writeBookA(fixture) {
    await fixture.manager.updateRecipeItemDefinition(SYSTEM_ID, 'book-a', {
      recipeIds: ['r-scalar-a', 'r-uuid-a'],
    });
  }

  forEachReader('orphans no scalar-only member of another book', async (reader) => {
    const fixture = await makeFixture();
    await writeBookA(fixture);

    assert.equal(marker(fixture), true, 'the write set the marker');
    // Every reader now agrees, INCLUDING the adminStore helper that has no uuid leg:
    // once the basis is `recipeIds`, the seed has carried that membership across.
    return assertMemberships(fixture, reader, LEGACY_MEMBERSHIPS, 'after the first write');
  });

  it('seeds every definition in the system, not only the one written', async () => {
    const fixture = await makeFixture();
    await writeBookA(fixture);

    assert.deepEqual(
      persistedRecipeIds(fixture, 'book-b'),
      ['r-scalar-b'],
      'book B was seeded from the legacy scalars although the write never named it'
    );
    assert.deepEqual(
      persistedRecipeIds(fixture, 'book-a'),
      ['r-scalar-a', 'r-uuid-a'],
      'the requested change is applied over the seed, not merged under it'
    );
  });

  it('mutates no legacy reference, so alchemy formula links survive', async () => {
    const fixture = await makeFixture();
    await writeBookA(fixture);

    const scalars = fixture.recipeManager
      .getRecipes({ craftingSystemId: SYSTEM_ID })
      .map((recipe) => [recipe.id, recipe.recipeItemId ?? '', recipe.linkedRecipeItemUuid ?? '']);
    assert.deepEqual(scalars, [
      ['r-scalar-a', 'book-a', ''],
      ['r-scalar-b', 'book-b', ''],
      ['r-uuid-a', '', BOOK_A_UUID],
      ['r-none', '', ''],
    ]);
  });

  it('is idempotent: a later write does not re-seed a removed membership', async () => {
    const fixture = await makeFixture();
    await writeBookA(fixture);

    // The GM now empties book B, then edits book A again. A re-seeding implementation
    // would put r-scalar-b straight back and the removal would silently undo itself.
    await fixture.manager.updateRecipeItemDefinition(SYSTEM_ID, 'book-b', { recipeIds: [] });
    await fixture.manager.updateRecipeItemDefinition(SYSTEM_ID, 'book-a', {
      recipeIds: ['r-scalar-a'],
    });

    assert.deepEqual(persistedRecipeIds(fixture, 'book-b'), [], 'the removal stands');
    assert.deepEqual(persistedRecipeIds(fixture, 'book-a'), ['r-scalar-a'], 'no duplicate seed');
  });
});

describe('recipe-book membership basis — the dangling-id resolution order (issue 1010)', () => {
  // `_resolveLegacyMembershipDefinition` (extracted from `_seedMembershipFromLegacyScalars`,
  // issue 1010) deliberately does NOT fall through to the `linkedRecipeItemUuid` leg when
  // `recipeItemId` is PRESENT but names no definition: only an ABSENT `recipeItemId` falls
  // through. Pin BOTH directions through the real seeding write (`updateRecipeItemDefinition`,
  // not the extracted helper in isolation, so a caller that stops consulting it is also
  // caught): a fix that disabled the uuid branch entirely would satisfy the first half alone,
  // and the second half is what proves the resolution can fire at all.
  it('does NOT seed a recipe whose PRESENT recipeItemId is dangling, even with a matching uuid', async () => {
    const fixture = await makeFixture({
      recipes: [
        makeRecipe({
          id: 'r-dangling-with-uuid',
          name: 'Ghost Bolt',
          recipeItemId: 'book-ghost',
          linkedRecipeItemUuid: BOOK_B_UUID,
        }),
      ],
    });

    await fixture.manager.updateRecipeItemDefinition(SYSTEM_ID, 'book-a', { recipeIds: [] });

    assert.deepEqual(
      persistedRecipeIds(fixture, 'book-b'),
      [],
      'a dangling recipeItemId must not fall through to the uuid branch'
    );
  });

  it('SEEDS a recipe with an ABSENT recipeItemId against its matching linkedRecipeItemUuid', async () => {
    const fixture = await makeFixture({
      recipes: [
        makeRecipe({
          id: 'r-absent-with-uuid',
          name: 'Mend Again',
          linkedRecipeItemUuid: BOOK_B_UUID,
        }),
      ],
    });

    await fixture.manager.updateRecipeItemDefinition(SYSTEM_ID, 'book-a', { recipeIds: [] });

    assert.deepEqual(
      persistedRecipeIds(fixture, 'book-b'),
      ['r-absent-with-uuid'],
      'an absent recipeItemId falls through to the uuid leg, so the resolution actually fires'
    );
  });
});

describe('recipe-book membership basis — emptying every array', () => {
  forEachReader('leaves every book empty rather than reverting the system', async (reader) => {
    const fixture = await makeFixture({
      system: persistedSystem({
        aRecipeIds: ['r-scalar-a', 'r-uuid-a'],
        bRecipeIds: ['r-scalar-b'],
      }),
    });
    assert.equal(marker(fixture), true, 'a populated array backfills the marker');

    await fixture.manager.updateRecipeItemDefinition(SYSTEM_ID, 'book-a', { recipeIds: [] });
    await fixture.manager.updateRecipeItemDefinition(SYSTEM_ID, 'book-b', { recipeIds: [] });

    return assertMemberships(fixture, reader, NO_MEMBERSHIPS, 'after emptying every book');
  });
});

describe('recipe-book membership basis — the monotone OR', () => {
  const emptyButMarked = () => persistedSystem({ marker: true });

  forEachReader('a marked system with every array empty stays empty', async (reader) => {
    const fixture = await makeFixture({ system: emptyButMarked() });
    assert.equal(marker(fixture), true, 'the persisted marker survives normalization');
    return assertMemberships(fixture, reader, NO_MEMBERSHIPS, 'marked with empty arrays');
  });

  it('survives reload(), initialize(), and a save() round-trip', async () => {
    const fixture = await makeFixture({ system: emptyButMarked() });

    fixture.manager.reload();
    assert.equal(marker(fixture), true, 'reload() preserves the marker');

    // The round-trip is the real test of the allowlist literal: `_normalizeSystem`
    // returns an explicit object with NO `...system` spread, so a field missing from it
    // is destroyed by the next save/load and the basis silently reverts.
    await fixture.manager.save();
    const reloaded = new CraftingSystemManager(fixture.recipeManager);
    reloaded.reload();
    assert.equal(
      reloaded.getSystem(SYSTEM_ID).membershipResolvesByRecipeIds,
      true,
      'the marker round-trips through the persisted setting'
    );

    const initialized = new CraftingSystemManager(fixture.recipeManager);
    await initialized.initialize();
    assert.equal(
      initialized.getSystem(SYSTEM_ID).membershipResolvesByRecipeIds,
      true,
      'initialize() preserves the marker'
    );
  });

  it('is never re-derived: the marker is not recomputed from the arrays', async () => {
    // A bare `some(...)` backfill passes every other case in this suite and fails only
    // here, because it is byte for byte the retired inference.
    const fixture = await makeFixture({ system: emptyButMarked() });
    for (const definition of fixture.manager.getRecipeItemDefinitions(SYSTEM_ID)) {
      assert.deepEqual(definition.recipeIds, [], `${definition.id} carries no membership`);
    }
    assert.equal(marker(fixture), true);
  });
});

describe('recipe-book membership basis — the backfill', () => {
  it('sets the marker for a system that already has a non-empty array', async () => {
    const fixture = await makeFixture({ system: persistedSystem({ aRecipeIds: ['r-scalar-a'] }) });
    assert.equal(marker(fixture), true);
  });

  forEachReader(
    'does not seed: an already-migrated system resolves by array only',
    async (reader) => {
      // The backfill is normalize-on-read and writes nothing, so a system that was already
      // on the array basis keeps resolving exactly as it does today — r-scalar-b's scalar
      // is not consulted and book B stays empty.
      const fixture = await makeFixture({
        system: persistedSystem({ aRecipeIds: ['r-scalar-a'] }),
      });
      return assertMemberships(
        fixture,
        reader,
        { ...NO_MEMBERSHIPS, 'r-scalar-a': ['book-a'] },
        'already on the array basis'
      );
    }
  );
});

describe('recipe-book membership basis — the write choke point', () => {
  it('the Contents-tab patch shape sets the marker', async () => {
    // `adminStore.saveRecipeItem` forwards the whole editor draft, not a bare
    // `{recipeIds}` — the canonical authoring path, and the one earlier revisions missed.
    const fixture = await makeFixture();
    await fixture.manager.updateRecipeItemDefinition(SYSTEM_ID, 'book-a', {
      enabled: true,
      caps: { item: { limitUses: false }, learn: { limitLearning: false } },
      recipeIds: ['r-scalar-a'],
    });

    assert.equal(marker(fixture), true);
    assert.deepEqual(persistedRecipeIds(fixture, 'book-b'), ['r-scalar-b'], 'and it seeded');
  });

  it('a patch without recipeIds neither sets the marker nor seeds', async () => {
    const fixture = await makeFixture();
    await fixture.manager.updateRecipeItemDefinition(SYSTEM_ID, 'book-a', { enabled: false });

    assert.equal(marker(fixture), false, 'an unrelated definition edit does not switch the basis');
    assert.deepEqual(persistedRecipeIds(fixture, 'book-a'), [], 'and nothing was seeded');
    assert.deepEqual(persistedRecipeIds(fixture, 'book-b'), []);
  });

  it('normalizes the written membership ids (trimmed, deduped, non-empty)', async () => {
    // The five readers compare with `String(id) === rid`, so a whitespace-padded id
    // written by a second path would simply stop matching.
    const fixture = await makeFixture();
    await fixture.manager.updateRecipeItemDefinition(SYSTEM_ID, 'book-a', {
      recipeIds: ['  r-scalar-a  ', 'r-scalar-a', '', null, 'r-uuid-a'],
    });

    assert.deepEqual(persistedRecipeIds(fixture, 'book-a'), ['r-scalar-a', 'r-uuid-a']);
  });
});

describe('recipe-book membership basis — the bulk panel book counts (issue 1010)', () => {
  /**
   * The Recipe Studio's bulk edit states `holds n of {total} selected` per book, and
   * derives both the Add / Remove labels and their disabled states from it.
   *
   * It is a SIXTH consumer of this basis, and the one where getting it wrong is silent:
   * a count read from `definition.recipeIds` reports "holds none selected" on a
   * legacy-basis system, which DISABLES Remove and makes the axis one-way on exactly the
   * worlds it exists to fix. Both surfaces below are asserted in the same case, so the
   * fixture cannot drift out from under the claim.
   */
  it('counts the selection basis-aware, though every definition array is empty', async () => {
    const fixture = await makeFixture();
    await fixture.store.refresh();
    const viewState = get(fixture.store.viewState);

    // The trap, asserted as a precondition rather than assumed: on this system the
    // definitions themselves know nothing.
    assert.equal(marker(fixture), false, 'precondition: the system is on the legacy basis');
    for (const definition of viewState.selectedSystem.recipeItemDefinitions) {
      assert.deepEqual(
        definition.recipeIds,
        [],
        `${definition.id}: counting from here would report "holds none selected"`
      );
    }

    // The GM ticks both scalar-resolved recipes plus the unlinked one.
    const selection = new Set(['r-scalar-a', 'r-scalar-b', 'r-none']);
    const selectedRows = viewState.recipes.filter((row) => selection.has(row.id));
    assert.equal(selectedRows.length, 3, 'the fixture really projected all three rows');

    const counts = countRecipeBookMembership(selectedRows);
    assert.equal(counts.get('book-a'), 1, 'book A holds r-scalar-a via the legacy scalar');
    assert.equal(counts.get('book-b'), 1, 'book B holds r-scalar-b via the legacy scalar');
  });

  it('agrees with the array basis once the marker is set', async () => {
    const fixture = await makeFixture({
      system: persistedSystem({
        aRecipeIds: ['r-scalar-a', 'r-uuid-a'],
        bRecipeIds: ['r-scalar-b'],
      }),
    });
    await fixture.store.refresh();
    const viewState = get(fixture.store.viewState);

    assert.equal(marker(fixture), true);
    const counts = countRecipeBookMembership(viewState.recipes);
    assert.equal(counts.get('book-a'), 2);
    assert.equal(counts.get('book-b'), 1);
  });
});
