/**
 * Revisioned inventory / knowledge snapshot reads (issue 1077, under #1070).
 *
 * Three properties are load-bearing here and each gets its own section:
 *
 * 1. **The recipe-item prefilter cannot change an answer.** It is a SUPERSET filter, so the
 *    only way it can be wrong is by dropping an item some recipe's own matcher would have
 *    accepted. The legacy `linkedRecipeItemUuid` leg is the sharp case — its definition is
 *    synthesised per recipe and is NOT in `system.recipeItemDefinitions` — so it is pinned
 *    directly rather than left to a corpus test to notice.
 * 2. **The counters are not vacuous.** #1076's first bounds draft passed against broken code
 *    because its counter could only see what its own index inspected. So every bound below
 *    is asserted through an INDEPENDENT, fixture-side probe — an `actor.items` getter that
 *    counts reads and items — which observes the inventory walk itself and would still move
 *    if a linear rescan were reintroduced beside the snapshot.
 * 3. **The memo respects staleness.** The retained member-book lookup is keyed on the
 *    definition array's identity, length AND `definitionIndex`'s revision counter. The third
 *    clause is the one an in-place `recipeIds` rewrite needs and the one a first draft
 *    forgets, so it is exercised in both directions.
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

const { RecipeVisibilityService } = await import('../src/systems/RecipeVisibilityService.js');
const { buildInventorySnapshot, projectRecipeAvailability } = await import(
  '../src/systems/inventorySnapshot.js'
);
const { advanceDefinitionRevision } = await import('../src/utils/definitionIndex.js');
const { itemMatchesRecipeItemSource } = await import('../src/utils/sourceUuid.js');

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const SYSTEM_ID = 'sys-1';

/**
 * An item-like document. `flags.fabricate.fabricate.*` is the doubly-nested path
 * `getFabricateFlag` reads (`normalizeFlagKey` prefixes `fabricate.`, then the scope nests
 * it again), so a fixture writing the single-nested path would be silently invisible.
 */
function makeItem({ uuid, name = 'Thing', tags = [], quantity = 1, roles = null } = {}) {
  const inner = {};
  if (tags.length > 0) inner.tags = tags;
  if (roles) inner.roles = roles;
  const scoped = { fabricate: inner };
  return {
    uuid,
    name,
    system: { quantity },
    flags: { fabricate: scoped },
    // `getFabricateFlag(item, 'tags')` calls `getFlag('fabricate', 'fabricate.tags')`, so the
    // key is resolved against the SCOPE's contents — which are themselves `fabricate`-nested.
    getFlag: (scope, key) => (scope === 'fabricate' ? getProperty(scoped, key) : undefined),
  };
}

function makeActor(id, items) {
  return { id, name: id, items };
}

/**
 * Wrap actors so every `items` read is counted. This is the INDEPENDENT probe: it sits on
 * the fixture, not in `src/`, and it observes the inventory walk rather than the index, so
 * it can see a linear rescan that a `definitionIndex` counter cannot.
 */
function countingActors(actors) {
  const counts = { reads: 0, itemsWalked: 0 };
  const wrapped = actors.map((actor) => {
    const items = actor.items;
    const copy = { ...actor };
    Object.defineProperty(copy, 'items', {
      enumerable: true,
      get() {
        counts.reads += 1;
        counts.itemsWalked += items.length;
        return items;
      },
    });
    return copy;
  });
  return { actors: wrapped, counts };
}

/**
 * A world with `recipeCount` book-gated recipes, one authored book definition, and an
 * inventory of `filler` non-matching items plus the one held book.
 */
function makeWorld({ recipeCount = 4, filler = 12, legacyRecipe = false } = {}) {
  const definition = {
    id: 'book-1',
    name: 'Tome of Iron',
    originItemUuid: 'Item.book-source',
    recipeIds: [],
  };
  const system = {
    id: SYSTEM_ID,
    name: 'Smithing',
    visibilityMode: 'knowledge',
    membershipResolvesByRecipeIds: true,
    recipeItemDefinitions: [definition],
    components: [],
    knowledge: { mode: 'itemOrLearned' },
  };

  const recipes = [];
  for (let index = 0; index < recipeCount; index++) {
    const recipe = {
      id: `recipe-${index}`,
      name: `Recipe ${index}`,
      craftingSystemId: SYSTEM_ID,
      enabled: true,
      ingredientSets: [],
    };
    definition.recipeIds.push(recipe.id);
    recipes.push(recipe);
  }

  if (legacyRecipe) {
    // An UN-MIGRATED recipe: it names its book only through the old single reverse ref, and
    // that book is NOT one of `system.recipeItemDefinitions`. Its match definition is
    // synthesised per recipe, which is exactly what the snapshot's superset must include.
    system.membershipResolvesByRecipeIds = false;
    recipes.push({
      id: 'recipe-legacy',
      name: 'Legacy Recipe',
      craftingSystemId: SYSTEM_ID,
      enabled: true,
      ingredientSets: [],
      linkedRecipeItemUuid: 'Item.legacy-book-source',
    });
  }

  const items = [];
  for (let index = 0; index < filler; index++) {
    items.push(makeItem({ uuid: `Item.filler-${index}`, name: `Filler ${index}` }));
  }
  // The held copy of the authored book, resolving by its source reference.
  items.push(makeItem({ uuid: 'Item.book-source', name: 'Tome of Iron' }));
  if (legacyRecipe) {
    items.push(makeItem({ uuid: 'Item.legacy-book-source', name: 'Legacy Tome' }));
  }

  const recipeManager = {
    getRecipes: () => recipes,
    getRecipe: (id) => recipes.find((recipe) => recipe.id === id) ?? null,
  };
  const craftingSystemManager = {
    getSystem: (id) => (id === SYSTEM_ID ? system : null),
    getSystems: () => [system],
  };

  return { system, definition, recipes, items, recipeManager, craftingSystemManager };
}

function makeService(world) {
  return new RecipeVisibilityService(world.recipeManager, world.craftingSystemManager);
}

const VIEWER = { id: 'player-1', isGM: false };

// ---------------------------------------------------------------------------
// 1. The prefilter is a superset — it cannot change an answer
// ---------------------------------------------------------------------------

describe('the recipe-item prefilter preserves visibility answers', () => {
  it('returns the same visible recipes as an un-snapshotted pass', () => {
    const world = makeWorld({ recipeCount: 5, filler: 20 });
    const { actors } = countingActors([makeActor('actor-1', world.items)]);

    const snapshotted = makeService(world);
    const withSnapshot = snapshotted
      .getVisibleRecipes({
        viewer: VIEWER,
        craftingSystemId: SYSTEM_ID,
        craftingActor: actors[0],
        componentSourceActors: [],
      })
      .map((entry) => entry.recipe.id);

    // The same pass with the snapshot suppressed: `_passSnapshot` is the ONLY thing the
    // optimisation adds, so neutralising it reproduces the pre-1077 walk exactly.
    const plain = makeService(world);
    plain._passSnapshot = () => null;
    const withoutSnapshot = plain
      .getVisibleRecipes({
        viewer: VIEWER,
        craftingSystemId: SYSTEM_ID,
        craftingActor: actors[0],
        componentSourceActors: [],
      })
      .map((entry) => entry.recipe.id);

    assert.deepEqual(withSnapshot, withoutSnapshot, 'snapshot changed the visible set');
    assert.equal(withSnapshot.length, 5, 'every book-gated recipe should be visible');
  });

  it('keeps a legacy linkedRecipeItemUuid book, whose definition is synthesised per recipe', () => {
    // THE TRAP. `recipe-legacy`'s book is not in `system.recipeItemDefinitions`, so a
    // superset built from the authored definitions alone would filter its held copy out and
    // silently hide the recipe. Nothing else in this suite would catch that.
    const world = makeWorld({ recipeCount: 2, filler: 8, legacyRecipe: true });
    const { actors } = countingActors([makeActor('actor-1', world.items)]);

    const visible = makeService(world)
      .getVisibleRecipes({
        viewer: VIEWER,
        craftingSystemId: SYSTEM_ID,
        craftingActor: actors[0],
        componentSourceActors: [],
      })
      .map((entry) => entry.recipe.id);

    assert.ok(visible.includes('recipe-legacy'), 'the legacy-linked recipe must stay visible');
  });

  it('preserves the deterministic (actor, item) order the learn path selects on', () => {
    const world = makeWorld({ recipeCount: 1, filler: 3 });
    const extraCopy = makeItem({ uuid: 'Item.book-source', name: 'Tome of Iron' });
    const second = makeActor('actor-2', [extraCopy]);
    const first = makeActor('actor-1', world.items);

    const service = makeService(world);
    const matches = service._collectCandidateItems(
      world.recipes[0],
      first,
      [second],
      service._passSnapshot(world.recipes, first, [second])
    );

    assert.equal(matches.length, 2, 'both held copies are candidates');
    assert.deepEqual(
      matches.map((entry) => [entry.actorOrder, entry.itemOrder]),
      [
        [0, 3],
        [1, 0],
      ],
      'actorOrder/itemOrder must be the position in the ORIGINAL enumeration'
    );
  });
});

// ---------------------------------------------------------------------------
// 2. The bound, proved with an independent probe
// ---------------------------------------------------------------------------

describe('inventory is walked once per pass, not once per recipe', () => {
  it('reads each actor once regardless of recipe count', () => {
    const small = makeWorld({ recipeCount: 2, filler: 40 });
    const large = makeWorld({ recipeCount: 60, filler: 40 });

    const measure = (world) => {
      const { actors, counts } = countingActors([
        makeActor('actor-1', world.items),
        makeActor('actor-2', []),
      ]);
      makeService(world).getVisibleRecipes({
        viewer: VIEWER,
        craftingSystemId: SYSTEM_ID,
        craftingActor: actors[0],
        componentSourceActors: [actors[1]],
      });
      return counts;
    };

    const smallCounts = measure(small);
    const largeCounts = measure(large);

    assert.equal(smallCounts.reads, 2, 'one read per actor at 2 recipes');
    assert.equal(largeCounts.reads, 2, 'one read per actor at 60 recipes');
    assert.equal(
      largeCounts.itemsWalked,
      smallCounts.itemsWalked,
      'items walked must not grow with the corpus'
    );
  });

  it('a recipe belonging to no book reads no inventory, and still reports no candidates', () => {
    // The common configuration: a system that does not gate on books at all. Every such
    // recipe has an empty match-definition set, so the walk can only return `[]` — but it
    // used to perform a full inventory scan per recipe to discover that.
    const world = makeWorld({ recipeCount: 3, filler: 20 });
    world.system.recipeItemDefinitions = [];
    world.definition.recipeIds = [];
    const { actors, counts } = countingActors([makeActor('actor-1', world.items)]);
    const service = makeService(world);

    const matches = service._collectCandidateItems(world.recipes[0], actors[0], []);

    assert.deepEqual(matches, [], 'a bookless recipe owns no candidates');
    assert.equal(counts.reads, 0, 'and must not read inventory to say so');
  });

  it('the probe is not vacuous: a per-recipe rescan moves it', () => {
    // Prove the counter above CAN go up, by running the same fixture through the walk the
    // snapshot replaced. A bound whose probe cannot move is a green light forever.
    const world = makeWorld({ recipeCount: 60, filler: 40 });
    const { actors, counts } = countingActors([
      makeActor('actor-1', world.items),
      makeActor('actor-2', []),
    ]);
    const service = makeService(world);
    service._passSnapshot = () => null;
    service.getVisibleRecipes({
      viewer: VIEWER,
      craftingSystemId: SYSTEM_ID,
      craftingActor: actors[0],
      componentSourceActors: [actors[1]],
    });

    assert.ok(counts.reads > 100, `expected a per-recipe rescan, saw ${counts.reads} reads`);
  });
});

// ---------------------------------------------------------------------------
// 3. Exhaustion derives from the already-collected candidate set
// ---------------------------------------------------------------------------

describe('knowledge exhaustion reuses the evaluated candidate set', () => {
  function exhaustibleWorld() {
    const world = makeWorld({ recipeCount: 1, filler: 6 });
    world.definition.caps = { item: { limitUses: true, maxUses: 1 } };
    world.system.recipeItemDefinitions[0].caps = world.definition.caps;
    // The held copy has already spent its single use.
    const spent = makeItem({ uuid: 'Item.book-source', name: 'Tome of Iron' });
    spent.flags.fabricate.fabricate.recipeItemUsage = { timesUsed: 1 };
    world.items[world.items.length - 1] = spent;
    return world;
  }

  it('agrees with the rescan, and reads no inventory when handed the knowledge result', () => {
    const world = exhaustibleWorld();
    const service = makeService(world);
    const recipe = world.recipes[0];

    const { actors, counts } = countingActors([makeActor('actor-1', world.items)]);
    const rescanned = service.isKnowledgeItemExhausted({
      recipe,
      craftingActor: actors[0],
      componentSourceActors: [],
    });
    const rescanReads = counts.reads;

    const knowledge = service.evaluateKnowledgeAccess({
      recipe,
      viewer: VIEWER,
      craftingActor: actors[0],
      componentSourceActors: [],
    });
    const readsBeforeDerivation = counts.reads;
    const derived = service.isKnowledgeItemExhausted({
      recipe,
      craftingActor: actors[0],
      componentSourceActors: [],
      knowledge,
    });

    assert.ok(rescanReads > 0, 'the rescan must actually read inventory');
    assert.equal(derived, rescanned, 'the derivation must agree with the rescan');
    assert.equal(derived, true, 'a fully-spent single-use book IS exhausted');
    assert.equal(
      counts.reads,
      readsBeforeDerivation,
      'deriving from the knowledge result must read no inventory at all'
    );
  });

  it('owning no copy is not exhausted, and a GM result carries no evidence', () => {
    const world = exhaustibleWorld();
    const service = makeService(world);
    const recipe = world.recipes[0];
    const empty = makeActor('actor-empty', []);

    const knowledge = service.evaluateKnowledgeAccess({
      recipe,
      viewer: VIEWER,
      craftingActor: empty,
      componentSourceActors: [],
    });
    assert.equal(knowledge.candidateItemCount, 0);
    assert.equal(
      service.isKnowledgeItemExhausted({ recipe, craftingActor: empty, knowledge }),
      false,
      'owning nothing is an unknown state, never an exhausted one'
    );

    const gmKnowledge = service.evaluateKnowledgeAccess({
      recipe,
      viewer: { id: 'gm', isGM: true },
      craftingActor: empty,
      componentSourceActors: [],
    });
    assert.equal(
      gmKnowledge.candidateItemCount,
      null,
      'a GM bypass collects no items, so it must not claim a count of zero'
    );
  });
});

// ---------------------------------------------------------------------------
// 4. The retained member-book memo and its staleness rule
// ---------------------------------------------------------------------------

describe('the retained member-book lookup honours the revision clause', () => {
  it('sees an in-place recipeIds rewrite once the revision is advanced', () => {
    const world = makeWorld({ recipeCount: 2, filler: 2 });
    const service = makeService(world);
    const recipe = world.recipes[0];

    assert.equal(service._getRecipeItemDefinitions(recipe).length, 1, 'starts a member');

    // An in-place rewrite of an INDEXED FIELD: the array object and its length are both
    // unchanged, so only the revision clause can catch it.
    world.definition.recipeIds = ['recipe-1'];
    advanceDefinitionRevision(world.system.recipeItemDefinitions);

    assert.equal(
      service._getRecipeItemDefinitions(recipe).length,
      0,
      'membership removal must be visible after the revision advances'
    );
  });

  it('returns a STABLE array across calls, so the definition index can retain', () => {
    const world = makeWorld({ recipeCount: 1, filler: 2 });
    const service = makeService(world);
    const recipe = world.recipes[0];

    const first = service._getRecipeItemDefinitions(recipe);
    const second = service._getRecipeItemDefinitions(recipe);
    assert.equal(first, second, 'a fresh array per call is what defeated the retained index');
  });
});

// ---------------------------------------------------------------------------
// 5. The optimistic availability projection
// ---------------------------------------------------------------------------

describe('the availability projection is indexed and optimistic', () => {
  const components = [
    { id: 'comp-iron', name: 'Iron', essences: { earth: 2 } },
    { id: 'comp-wood', name: 'Wood', essences: {} },
  ];

  function talliesFor(items) {
    const snapshot = buildInventorySnapshot({
      craftingActor: makeActor('actor-1', items),
      componentSourceActors: [],
      resolveComponent: (item) => components.find((entry) => entry.name === item.name) ?? null,
    });
    return snapshot.componentTallies({ id: SYSTEM_ID, components });
  }

  const componentOption = (componentId, quantity) => ({
    quantity,
    match: { type: 'component', componentId },
  });

  it('answers from the tallies without invoking craftability or ingredient selection', () => {
    const recipe = {
      id: 'r',
      ingredientSets: [
        {
          ingredientGroups: [{ options: [componentOption('comp-iron', 2)] }],
          essences: {},
          // A tripwire: the projection must never call either of these.
          resolveIngredientSelection: () => assert.fail('resolveIngredientSelection was called'),
        },
      ],
    };
    const tallies = talliesFor([makeItem({ uuid: 'i1', name: 'Iron', quantity: 3 })]);

    assert.equal(projectRecipeAvailability(tallies, recipe).available, true);
    assert.equal(tallies.quantityByComponentId.get('comp-iron'), 3, 'units, not stacks');
    assert.equal(tallies.stacksByComponentId.get('comp-iron'), 1);
    assert.equal(tallies.essenceTotals.get('earth'), 6, '2 per unit x 3 units');
  });

  it('is OPTIMISTIC for a contended set: it says available where exact evaluation would not', () => {
    // Two groups both needing 2x Iron, against 3 held units. No assignment satisfies both,
    // so exact evaluation says no; the projection compares each requirement against the
    // same total independently and says yes. That is the documented contract, and this test
    // exists so a future reader cannot mistake it for a bug.
    const recipe = {
      id: 'r',
      ingredientSets: [
        {
          ingredientGroups: [
            { options: [componentOption('comp-iron', 2)] },
            { options: [componentOption('comp-iron', 2)] },
          ],
          essences: {},
        },
      ],
    };
    const result = projectRecipeAvailability(
      talliesFor([makeItem({ uuid: 'i1', name: 'Iron', quantity: 3 })]),
      recipe
    );

    assert.equal(result.available, true, 'the contended case is deliberately optimistic');
    assert.equal(result.optimistic, true, 'the shape must always advertise its imprecision');
  });

  it('a negative answer is definitive, and any satisfiable set wins', () => {
    const tallies = talliesFor([makeItem({ uuid: 'i1', name: 'Wood', quantity: 1 })]);

    const unmakeable = {
      id: 'r',
      ingredientSets: [
        { ingredientGroups: [{ options: [componentOption('comp-iron', 1)] }], essences: {} },
      ],
    };
    assert.equal(projectRecipeAvailability(tallies, unmakeable).available, false);

    const eitherOr = {
      id: 'r',
      ingredientSets: [
        { ingredientGroups: [{ options: [componentOption('comp-iron', 1)] }], essences: {} },
        { ingredientGroups: [{ options: [componentOption('comp-wood', 1)] }], essences: {} },
      ],
    };
    assert.equal(
      projectRecipeAvailability(tallies, eitherOr).available,
      true,
      'a recipe is makeable when ANY set is'
    );
  });

  it('reads a multi-option group as satisfied by any one option', () => {
    // The legacy flat `ingredients` alias holds only the FIRST option of each group, so a
    // projection reading it would call this unavailable — a false negative, the one
    // direction the contract forbids.
    const recipe = {
      id: 'r',
      ingredientSets: [
        {
          ingredientGroups: [
            { options: [componentOption('comp-iron', 1), componentOption('comp-wood', 1)] },
          ],
          ingredients: [componentOption('comp-iron', 1)],
          essences: {},
        },
      ],
    };
    assert.equal(
      projectRecipeAvailability(
        talliesFor([makeItem({ uuid: 'i1', name: 'Wood', quantity: 1 })]),
        recipe
      ).available,
      true
    );
  });

  it('bounds a tag-matched option without claiming exactness', () => {
    const tallies = talliesFor([
      makeItem({ uuid: 'i1', name: 'Wood', quantity: 2, tags: ['plank'] }),
    ]);
    const withTag = (quantity, tagMatch, tags) => ({
      id: 'r',
      ingredientSets: [
        {
          ingredientGroups: [{ options: [{ quantity, match: { type: 'tags', tags, tagMatch } }] }],
          essences: {},
        },
      ],
    });

    assert.equal(projectRecipeAvailability(tallies, withTag(2, 'any', ['plank'])).available, true);
    assert.equal(projectRecipeAvailability(tallies, withTag(3, 'any', ['plank'])).available, false);
    assert.equal(
      projectRecipeAvailability(tallies, withTag(1, 'all', ['plank', 'oak'])).available,
      false,
      'the ALL bound is the rarest tag, and nothing carries "oak"'
    );
  });

  it('short-falls on essences the totals cannot cover', () => {
    const recipe = {
      id: 'r',
      ingredientSets: [{ ingredientGroups: [], essences: { earth: 99 } }],
    };
    const result = projectRecipeAvailability(
      talliesFor([makeItem({ uuid: 'i1', name: 'Iron', quantity: 1 })]),
      recipe
    );
    assert.equal(result.available, false);
    assert.deepEqual(result.missingEssenceIds, ['earth']);
  });
});

// ---------------------------------------------------------------------------
// 6. The snapshot's own read API
// ---------------------------------------------------------------------------

describe('the snapshot resolves each held document once', () => {
  it('caches its per-system candidate set rather than re-filtering', () => {
    const world = makeWorld({ recipeCount: 1, filler: 5 });
    let matchCalls = 0;
    const snapshot = buildInventorySnapshot({
      craftingActor: makeActor('actor-1', world.items),
      componentSourceActors: [],
      matchesRecipeItem: (item, definitions, systemId) => {
        matchCalls += 1;
        return itemMatchesRecipeItemSource(item, definitions, systemId);
      },
    });

    const first = snapshot.recipeItemCandidates(world.system, []);
    const callsAfterFirst = matchCalls;
    const second = snapshot.recipeItemCandidates(world.system, []);

    assert.equal(callsAfterFirst, world.items.length, 'one resolution per held document');
    assert.equal(matchCalls, callsAfterFirst, 'a second read must resolve nothing again');
    assert.equal(first, second, 'the candidate set is retained per system');
    assert.equal(first.length, 1, 'only the held book survives the filter');
  });

  it('dedupes source actors by id, crafting actor first', () => {
    const shared = makeActor('actor-1', []);
    const snapshot = buildInventorySnapshot({
      craftingActor: shared,
      componentSourceActors: [shared, makeActor('actor-2', [])],
    });
    assert.deepEqual(
      snapshot.actors.map((actor) => actor.id),
      ['actor-1', 'actor-2']
    );
  });
});
