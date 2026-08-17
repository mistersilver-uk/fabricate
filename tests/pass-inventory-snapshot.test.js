/**
 * The ONE per-pass inventory snapshot (issue 1228, under #1070).
 *
 * #1077 shipped two production snapshots that injected DISJOINT collaborator sets, so a
 * snapshot built for one path silently answered the other one wrongly. This file proves three
 * things, in this order, because the third is worthless without the second:
 *
 * 1. **The hazard was real, in both directions.** Both half-snapshots are constructed here and
 *    handed the question they were not built for, and the resulting wrong answers are asserted
 *    as VALUES. Without this the tests below would be a description of a fix rather than
 *    evidence of one.
 * 2. **The two directions fail differently, and that asymmetry is the whole reason the
 *    unification is worth doing.** A visibility-shaped snapshot handed to the tallies path
 *    answers `available: false` for a recipe the actor can plainly make — wrong, but loud. A
 *    tallies-shaped snapshot handed to the visibility path returns every held document
 *    unfiltered and the per-recipe matcher then produces the IDENTICAL answer — the #1077
 *    defect reinstated with every correctness assertion green.
 * 3. **Unification changes no answer.** The unified snapshot's answers are compared to the two
 *    pre-unification shapes' CORRECT answers, field by field, rather than merely asserted to
 *    be sensible.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

function getProperty(object, path) {
  if (!object || !path) return undefined;
  return String(path)
    .split('.')
    .reduce((value, key) => (value == null ? undefined : value[key]), object);
}

globalThis.foundry = { utils: { getProperty, randomID: () => `id-${Math.random()}` } };
globalThis.ui = { notifications: { info: () => {}, warn: () => {}, error: () => {} } };
globalThis.game = { actors: [] };

const { buildPassInventorySnapshot, legacyRecipeItemUuidsBySystem } = await import(
  '../src/systems/passInventorySnapshot.js'
);
const { buildInventorySnapshot, projectRecipeAvailability } = await import(
  '../src/systems/inventorySnapshot.js'
);
const { itemMatchesRecipeItemSource } = await import('../src/utils/sourceUuid.js');

const SYSTEM_ID = 'sys-1';
const BOOK_UUID = 'Compendium.fab.books.Item.tome-0';
const LEGACY_BOOK_UUID = 'Compendium.fab.books.Item.legacy-tome';

/** An item-like document. The uuid tier is what both matchers read here. */
function makeItem({ uuid, name = 'Thing', quantity = 1 }) {
  return {
    uuid,
    name,
    system: { quantity },
    getFlag: () => undefined,
  };
}

function makeActor(id, items) {
  return { id, name: id, items, getFlag: () => undefined };
}

const COMPONENTS = [
  { id: 'comp-iron', name: 'Iron', essences: { earth: 2 } },
  { id: 'comp-wood', name: 'Wood', essences: {} },
];

const SYSTEM = {
  id: SYSTEM_ID,
  components: COMPONENTS,
  recipeItemDefinitions: [
    { id: 'tome-0', name: 'Tome', originItemUuid: BOOK_UUID, aliasItemUuids: [], recipeIds: ['r'] },
  ],
};

/** A recipe two units of held Iron plainly satisfies. */
const RECIPE = {
  id: 'r',
  craftingSystemId: SYSTEM_ID,
  ingredientSets: [
    {
      ingredientGroups: [
        { options: [{ quantity: 2, match: { type: 'component', componentId: 'comp-iron' } }] },
      ],
      essences: {},
    },
  ],
};

/** The recipe that carries ONLY the pre-migration single reverse reference. */
const LEGACY_RECIPE = {
  id: 'legacy-r',
  craftingSystemId: SYSTEM_ID,
  linkedRecipeItemUuid: LEGACY_BOOK_UUID,
  ingredientSets: [],
};

/** Name-based resolution, so the fixture needs no component-identity flags. */
const resolveComponent = (item) => COMPONENTS.find((entry) => entry.name === item.name) ?? null;

/**
 * One crafting actor holding: the member book, the legacy book, three units of Iron, and
 * `mundane` documents that resolve to nothing at all.
 *
 * The mundane majority is load bearing rather than realism dressing — it is the entire gap
 * between "the matcher was offered the books" and "the matcher was offered the inventory".
 */
function makeWorld({ mundane = 6 } = {}) {
  const items = [
    makeItem({ uuid: BOOK_UUID, name: 'Tome' }),
    makeItem({ uuid: LEGACY_BOOK_UUID, name: 'Old Tome' }),
    makeItem({ uuid: 'Actor.a.Item.iron', name: 'Iron', quantity: 3 }),
    ...Array.from({ length: mundane }, (_unused, index) =>
      makeItem({ uuid: `Actor.a.Item.sundry-${index}`, name: `Sundry ${index}` })
    ),
  ];
  return { craftingActor: makeActor('actor-1', items), componentSourceActors: [], items };
}

const uuidsOf = (entries) => entries.map((entry) => entry.item.uuid);
const mapToObject = (map) => Object.fromEntries([...map.entries()].sort());

// ---------------------------------------------------------------------------
// 1. The hazard, constructed and measured in both directions
// ---------------------------------------------------------------------------

describe('the two pre-unification half-snapshots answer the other path WRONGLY', () => {
  it('a tallies-shaped snapshot offers the visibility path every held document — silently', () => {
    const world = makeWorld();
    // Exactly `CraftingListingBuilder._passSnapshot` before this issue: a resolver, no matcher.
    const talliesShaped = buildInventorySnapshot({ ...world, resolveComponent });

    const offered = talliesShaped.recipeItemCandidates(SYSTEM, []);
    assert.equal(
      offered.length,
      world.items.length,
      'the fallback hands over the WHOLE inventory, which is the #1077 defect'
    );

    // …and this is why no correctness test noticed. The per-recipe matcher decides every
    // entry, so filtering the offer changes only how many entries it is asked about.
    const definitions = SYSTEM.recipeItemDefinitions;
    const accepted = offered.filter((entry) =>
      itemMatchesRecipeItemSource(entry.item, definitions, SYSTEM_ID)
    );
    assert.deepEqual(uuidsOf(accepted), [BOOK_UUID], 'the ANSWER is unchanged — only the cost');
  });

  it('a visibility-shaped snapshot answers the tallies path available:false for everything', () => {
    const world = makeWorld();
    // Exactly `RecipeVisibilityService._passSnapshot` before this issue: a matcher, no resolver.
    const visibilityShaped = buildInventorySnapshot({
      ...world,
      matchesRecipeItem: itemMatchesRecipeItemSource,
    });

    const tallies = visibilityShaped.componentTallies(SYSTEM);
    assert.equal(tallies.quantityByComponentId.size, 0, 'no component resolves without a resolver');
    assert.equal(
      projectRecipeAvailability(tallies, RECIPE).available,
      false,
      'the actor holds 3 Iron and needs 2 — this is the one direction the contract forbids'
    );
  });
});

// ---------------------------------------------------------------------------
// 2. The unified snapshot answers both, and answers them the same way
// ---------------------------------------------------------------------------

describe('the unified pass snapshot serves both consumers from ONE value', () => {
  it('filters the visibility offer AND resolves the tallies, from the same snapshot', () => {
    const world = makeWorld();
    const snapshot = buildPassInventorySnapshot({
      ...world,
      recipes: [RECIPE],
      resolveComponent,
    });

    const offered = snapshot.recipeItemCandidates(SYSTEM);
    assert.deepEqual(uuidsOf(offered), [BOOK_UUID], 'only the member book is offered');
    assert.ok(
      offered.length < snapshot.heldItems().length,
      'non-vacuity: the fixture holds documents the filter must reject'
    );

    const tallies = snapshot.componentTallies(SYSTEM);
    assert.equal(tallies.quantityByComponentId.get('comp-iron'), 3);
    assert.equal(projectRecipeAvailability(tallies, RECIPE).available, true);
  });

  it('changes NO answer on the visibility path', () => {
    const world = makeWorld();
    const before = buildInventorySnapshot({
      ...world,
      matchesRecipeItem: itemMatchesRecipeItemSource,
    });
    const after = buildPassInventorySnapshot({ ...world, recipes: [RECIPE], resolveComponent });

    assert.deepEqual(
      uuidsOf(after.recipeItemCandidates(SYSTEM)),
      uuidsOf(before.recipeItemCandidates(SYSTEM, [])),
      'adding a component resolver must not move which documents the matcher is offered'
    );
  });

  it('changes NO answer on the tallies path', () => {
    const world = makeWorld();
    const before = buildInventorySnapshot({ ...world, resolveComponent });
    const after = buildPassInventorySnapshot({ ...world, recipes: [RECIPE], resolveComponent });

    const left = before.componentTallies(SYSTEM);
    const right = after.componentTallies(SYSTEM);
    assert.deepEqual(mapToObject(right.quantityByComponentId), mapToObject(left.quantityByComponentId));
    assert.deepEqual(mapToObject(right.stacksByComponentId), mapToObject(left.stacksByComponentId));
    assert.deepEqual(mapToObject(right.essenceTotals), mapToObject(left.essenceTotals));
    assert.deepEqual(mapToObject(right.quantityByTag), mapToObject(left.quantityByTag));
    assert.ok(
      right.quantityByComponentId.size > 0,
      'non-vacuity: two empty maps would compare equal and prove nothing'
    );
  });
});

// ---------------------------------------------------------------------------
// 3. The legacy book link, now owned by the snapshot rather than by one caller
// ---------------------------------------------------------------------------

describe('the candidate superset carries every legacy book link in the pass', () => {
  it('offers the book of a recipe that carries ONLY linkedRecipeItemUuid', () => {
    const world = makeWorld();
    const snapshot = buildPassInventorySnapshot({
      ...world,
      recipes: [RECIPE, LEGACY_RECIPE],
      resolveComponent,
    });
    assert.deepEqual(
      uuidsOf(snapshot.recipeItemCandidates(SYSTEM)).sort(),
      [BOOK_UUID, LEGACY_BOOK_UUID].sort()
    );
  });

  it('drops it when the recipe is withheld — so the recipes argument is load bearing', () => {
    // The negative control for the assertion above. Without it, "the superset covers legacy
    // links" would pass equally well against a snapshot that offered everything.
    const world = makeWorld();
    const snapshot = buildPassInventorySnapshot({ ...world, recipes: [RECIPE], resolveComponent });
    assert.deepEqual(uuidsOf(snapshot.recipeItemCandidates(SYSTEM)), [BOOK_UUID]);
  });

  it('buckets legacy uuids by system so one system cannot widen another', () => {
    const bySystem = legacyRecipeItemUuidsBySystem([
      LEGACY_RECIPE,
      { id: 'x', craftingSystemId: 'sys-2', linkedRecipeItemUuid: 'Compendium.fab.books.Item.b' },
      { id: 'y', craftingSystemId: SYSTEM_ID, linkedRecipeItemUuid: LEGACY_BOOK_UUID },
      { id: 'z', craftingSystemId: SYSTEM_ID },
    ]);
    assert.deepEqual([...bySystem.get(SYSTEM_ID)], [LEGACY_BOOK_UUID], 'deduped within a system');
    assert.deepEqual([...bySystem.get('sys-2')], ['Compendium.fab.books.Item.b']);
  });
});

// ---------------------------------------------------------------------------
// 4. Every production builder produces the SAME kind of value
// ---------------------------------------------------------------------------

describe('every production pass snapshot is a complete one', () => {
  const READ_API = ['heldItems', 'recipeItemCandidates', 'componentTallies'];

  it('exposes the whole read API, not the half its immediate caller uses', () => {
    const world = makeWorld();
    const snapshot = buildPassInventorySnapshot({ ...world, recipes: [RECIPE], resolveComponent });
    for (const key of READ_API) {
      assert.equal(typeof snapshot[key], 'function', `a pass snapshot must expose ${key}`);
    }
    assert.deepEqual(
      snapshot.actors.map((actor) => actor.id),
      ['actor-1'],
      'and the actor set it was resolved from, in the order the learn path selects on'
    );
  });

  it('cannot be built without the recipe-item matcher', () => {
    // BEHAVIOURAL, not textual. An earlier draft asserted on the module source — that the
    // matcher is passed and is not a parameter — and both halves were fragile in ways that
    // matter in a repository with this one's history of checks that observe nothing: the
    // first breaks on any Prettier reflow splitting the property across lines, and the second
    // passes for an undefaulted destructured parameter (`matchesRecipeItem,`). They held only
    // because each covered the other's gap.
    //
    // The discriminator below needs neither. A system that authors NO recipe-item definitions
    // can have no book candidates, so a snapshot holding the matcher answers the empty set
    // without walking the inventory at all; a snapshot with no matcher has nothing to filter
    // with and falls back to offering every held document. The two answers differ on exactly
    // the collaborator under test, over a fixture in which no item need match anything.
    const world = makeWorld();
    const bookless = { id: 'sys-bookless', components: COMPONENTS, recipeItemDefinitions: [] };

    assert.deepEqual(
      buildPassInventorySnapshot({
        ...world,
        recipes: [],
        resolveComponent,
      }).recipeItemCandidates(bookless),
      [],
      'the factory must supply the matcher itself, whatever the caller passes'
    );
    // The control, and the reason the assertion above is not vacuous: the SAME question, asked
    // of a snapshot built the way this factory exists to make unrepresentable.
    assert.equal(
      buildInventorySnapshot({ ...world, resolveComponent }).recipeItemCandidates(bookless, [])
        .length,
      world.items.length,
      'non-vacuity: with no matcher the identical question returns the whole inventory'
    );
  });
});
