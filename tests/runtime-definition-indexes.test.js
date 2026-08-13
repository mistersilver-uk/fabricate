/**
 * Retained runtime definition indexes — bounds, precedence, staleness and revision tokens
 * (issue 1076, under the performance programme #1070).
 *
 * ## Why every bound here is a count
 *
 * The field report behind this programme is a 7.5 s crafting-menu open on a character
 * carrying hundreds of salvageable materials against a 1,080-component library. The scaling
 * term is `items x components`, and a product term is exactly a count that moves when the
 * axis it should be independent of is scaled. A wall-clock assertion could not tell that
 * apart from a busy CI runner; a count is identical on every machine and every Node build.
 *
 * These guards extend issue 1072's vocabulary rather than starting a third mechanism: they
 * assert UPPER BOUNDS and INDEPENDENCE RELATIONS, and they get their sensitivity from
 * scaling ONE axis and comparing two runs, never from fixture size.
 *
 * The counter itself is `definitionIndex`'s own `candidatesExamined`, which counts candidate
 * definitions inspected INCLUDING the ones walked while an index is built. Counting the
 * build is what stops the guard being vacuous: a counter that only saw lookups would report
 * a triumphant zero for a path that rebuilt the whole index on every call. Every bound below
 * is therefore stated against a WARM index, with an explicit cold-build control proving the
 * counter can still move.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { roleItem } from './helpers/componentIdentityFixtures.js';
import { installFoundryEnv } from './helpers/foundryEnv.js';
import { countingCandidates, createOperationCounters } from './helpers/scale/scaleCounters.js';
import { makeActor, makeComponentLibrary } from './helpers/scale/scaleGuardFixtures.js';

installFoundryEnv();

const { CraftingEngine } = await import('../src/systems/CraftingEngine.js');
const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');
const { RecipeManager } = await import('../src/systems/RecipeManager.js');
const { REVISION_SCOPES } = await import('../src/systems/revisionTokens.js');
const { resetNameOnlyMatchTelemetry, findComponentByName, matchComponentByName } = await import(
  '../src/utils/componentNameMatch.js'
);
const {
  advanceDefinitionRevision,
  readIdentityCounters,
  resetIdentityCounters,
  getDefinitionIndex,
} = await import('../src/utils/definitionIndex.js');
const { findMatchingComponent } = await import('../src/utils/essenceResolver.js');
const { resolveComponentForItem } = await import('../src/utils/sourceUuid.js');

/** The scale every acceptance bound in issue 1076 is stated against. */
const LIBRARY = 5000;
/** The held-inventory scale the field report describes. */
const HELD_ITEMS = 1000;
const SYSTEM_ID = 'sys-index';

/** How many candidates the resolvers examined since the last reset. */
function examined() {
  return readIdentityCounters().candidatesExamined;
}

/**
 * A component library whose entries carry source references, so the source-reference tier is
 * genuinely populated rather than trivially empty.
 *
 * @param {number} count
 * @returns {object[]}
 */
function library(count) {
  return makeComponentLibrary(count).map((component) => ({
    ...component,
    registeredItemUuid: `Compendium.pack.Item.${component.id}`,
    originItemUuid: `Item.world-${component.id}`,
  }));
}

/**
 * An owned item bearing the durable per-system role claim for `componentId`.
 *
 * @param {string} componentId
 * @returns {object}
 */
function durableItem(componentId) {
  return roleItem({
    uuid: `Actor.a.Item.owned-${componentId}`,
    name: 'Anything At All',
    roles: { [SYSTEM_ID]: { componentId } },
    quantity: 1,
  });
}

/**
 * An owned item that carries no Fabricate flags and no source references — the branch a real
 * player inventory spends most of its time in.
 *
 * @param {string} name
 * @returns {object}
 */
function unstampedItem(name) {
  return roleItem({ uuid: `Actor.a.Item.${name}`, name, quantity: 1 });
}

/**
 * Warm the index for a candidate set, then zero the counters.
 *
 * Every bound in this file is about the WARM path, and the cold build is genuinely
 * O(library) — so measuring without warming would measure the build and report a bound
 * nobody could ever meet.
 *
 * @param {object[]} components
 * @returns {void}
 */
function warm(components) {
  getDefinitionIndex(components);
  resetIdentityCounters();
}

beforeEach(() => {
  resetIdentityCounters();
  resetNameOnlyMatchTelemetry();
});

// ---------------------------------------------------------------------------
// Bounds
// ---------------------------------------------------------------------------

describe('issue 1076 bound — identity resolution is independent of library size', () => {
  it('examines exactly one candidate on the durable-id path against a 5,000-component system', () => {
    const components = library(LIBRARY);
    warm(components);

    const resolved = resolveComponentForItem(durableItem('c-4321'), components, SYSTEM_ID);

    assert.equal(resolved?.id, 'c-4321', 'the durable claim must still resolve to its component');
    assert.equal(
      examined(),
      1,
      `a durable roles-map claim examined ${examined()} candidates against a ${LIBRARY}-component ` +
        `library; the budget is the single definition the index returned.`
    );
  });

  it('examines at most one candidate on a name-only match', () => {
    const components = library(LIBRARY);
    warm(components);

    const resolved = findMatchingComponent(unstampedItem('Component 4999'), components, SYSTEM_ID);

    assert.equal(resolved?.id, 'c-4999', 'the name fallback must still resolve');
    assert.ok(
      examined() <= 1,
      `a name-only match examined ${examined()} candidates; the budget is one. The name fallback ` +
        `is the branch a fat inventory actually takes, so it is NOT exempt from this counter.`
    );
  });

  it('bounds the item that matches NOTHING — no flags, no source refs, no name match', () => {
    // The branch the field report hit. A criterion covering only successful matches does not
    // cover it: the miss used to pay a full library scan on the source-reference tier and a
    // SECOND full scan in the name fallback before returning null.
    const components = library(LIBRARY);
    warm(components);

    const resolved = findMatchingComponent(unstampedItem('Rusty Camp Spoon'), components, SYSTEM_ID);

    assert.equal(resolved, null, 'the fixture item must genuinely match nothing');
    assert.equal(
      examined(),
      0,
      `an unmatched item examined ${examined()} candidates against a ${LIBRARY}-component library. ` +
        `Both misses are now map lookups, so the honest budget is zero.`
    );
  });

  it('runs NO array scan at all on the miss path, by the independent fixture-side counter', () => {
    // `readIdentityCounters` only sees what `definitionIndex` itself inspects, so on its own
    // it cannot notice a linear `candidates.find()` reintroduced beside the index — the count
    // would simply stay at zero. Issue 1072's `countingCandidates` array counts the other
    // half: every per-element predicate the candidate array is handed. Both at once is what
    // makes "bounded" mean bounded.
    const counters = createOperationCounters();
    const components = countingCandidates(library(LIBRARY), counters, 'componentCandidates');
    warm(components);

    assert.equal(findMatchingComponent(unstampedItem('Nothing At All'), components, SYSTEM_ID), null);

    assert.equal(
      counters.get('componentCandidates'),
      0,
      `an unmatched item ran a per-element predicate over the candidate array ` +
        `${counters.get('componentCandidates')} times. Every tier must be a map lookup.`
    );
  });

  it('proves the fixture-side counter can move too', () => {
    // Non-vacuity for the guard above: the same probe must still register a real scan.
    const counters = createOperationCounters();
    const components = countingCandidates(library(16), counters, 'componentCandidates');
    components.find((entry) => entry.id === 'c-15');
    assert.equal(counters.get('componentCandidates'), 16);
  });

  it('proves the counter can move: a cold index build examines the whole library', () => {
    // The non-vacuity control. Without it, a counter that had been disconnected from the
    // resolvers would satisfy all three bounds above for the worst possible reason.
    const components = library(LIBRARY);
    resetIdentityCounters();

    resolveComponentForItem(durableItem('c-0'), components, SYSTEM_ID);

    assert.ok(
      examined() >= LIBRARY,
      `a COLD resolution examined ${examined()} candidates; building an index over ${LIBRARY} ` +
        `components must cost at least ${LIBRARY} examinations or the counter is not wired.`
    );
    assert.equal(readIdentityCounters().indexBuilds, 1, 'exactly one index was built');
  });

  it('does not rebuild the index on a second resolution against the same library', () => {
    const components = library(LIBRARY);
    resolveComponentForItem(durableItem('c-0'), components, SYSTEM_ID);
    const buildsAfterFirst = readIdentityCounters().indexBuilds;

    resolveComponentForItem(durableItem('c-1'), components, SYSTEM_ID);

    assert.equal(readIdentityCounters().indexBuilds, buildsAfterFirst, 'the index stayed warm');
  });
});

// ---------------------------------------------------------------------------
// The craft/salvage execution matcher
// ---------------------------------------------------------------------------

/**
 * A system plus an engine, with a held inventory whose composition mirrors a real sheet:
 * most items resolve to no component at all.
 *
 * @param {object} [options]
 * @returns {object}
 */
function craftWorld({ componentCount = LIBRARY, itemCount = HELD_ITEMS } = {}) {
  // Both counters at once, for the reason the miss-path guard above states: the identity
  // counter cannot see a linear `find`/`filter` reintroduced beside the index, and the
  // fixture-side probe cannot see the index build. Either alone is satisfiable by a
  // regression the other catches.
  const counters = createOperationCounters();
  const components = countingCandidates(library(componentCount), counters, 'componentCandidates');
  const system = { id: SYSTEM_ID, name: 'Index System', components };
  const held = makeActor({ itemCount }).items;
  // 100 stacks of one registered component, the rest ordinary gear. The registered stacks
  // are what `findComponentItems` has to find; the gear is what it has to reject cheaply.
  const actor = {
    id: 'actor-index',
    items: [...held, ...Array.from({ length: 100 }, () => durableItem('c-7'))],
  };
  return {
    components,
    system,
    actor,
    counters,
    engine: new CraftingEngine(new RecipeManager({})),
  };
}

describe('issue 1076 bound — findComponentItems is independent of component-library size', () => {
  it('costs the same against a 5,000-component library as against a 50-component one', () => {
    // Independence, not a pinned number: the defect is the PRODUCT `items x components`, and
    // a product term is a count that moves when the axis it should not depend on is scaled.
    const measure = (componentCount) => {
      const world = craftWorld({ componentCount });
      const component = world.components.at(7);
      world.engine.findComponentItems(world.actor, component, world.system);
      warm(world.components);
      world.counters.reset();
      const found = world.engine.findComponentItems(world.actor, component, world.system);
      return {
        examinations: examined(),
        scanned: world.counters.get('componentCandidates'),
        found: found.length,
      };
    };

    const small = measure(50);
    const large = measure(LIBRARY);

    assert.equal(small.found, 100, 'the small library must still find the held stacks');
    assert.equal(large.found, 100, 'the large library must find exactly the same stacks');
    assert.ok(small.examinations > 0, 'non-vacuity: the counter must have moved at all');
    assert.equal(
      large.examinations,
      small.examinations,
      `findComponentItems examined ${small.examinations} candidates against 50 components and ` +
        `${large.examinations} against ${LIBRARY}. Any difference is the items x components ` +
        `product this issue exists to remove.`
    );
    assert.equal(
      large.scanned,
      0,
      `findComponentItems ran a per-element predicate over the candidate array ${large.scanned} ` +
        `times against a ${LIBRARY}-component library; the budget is zero.`
    );
    assert.equal(small.scanned, 0, 'and zero at 50 components too');
  });

  it('charges a bulk run per ROW only, never per row x library', () => {
    // Bulk salvage and `BulkDestroyService` call the matcher once per row, which made a bulk
    // run O(rows x items x components). Five rows against a warm index must cost five times
    // one row and nothing more.
    const world = craftWorld();
    const rows = [7, 8, 9, 10, 11].map((position) => world.components.at(position));
    world.engine.findComponentItems(world.actor, rows[0], world.system);

    warm(world.components);
    world.engine.findComponentItems(world.actor, rows[0], world.system);
    const oneRow = examined();

    warm(world.components);
    for (const row of rows) world.engine.findComponentItems(world.actor, row, world.system);
    const fiveRows = examined();

    assert.ok(oneRow > 0, 'non-vacuity: one row must cost something');
    assert.ok(
      fiveRows <= oneRow * rows.length,
      `five bulk rows examined ${fiveRows} candidates against ${oneRow} for one row; the budget ` +
        `is linear in rows. A super-linear result means the library re-entered the per-row cost.`
    );
  });

  it('resolves against LIVE actor documents, not a cached inventory', () => {
    // The correctness boundary the issue draws around this path: the component-side index is
    // derived from system definitions, and the ITEM side must stay live, so a stack removed
    // between two calls disappears from the second answer.
    const world = craftWorld({ componentCount: 200, itemCount: 20 });
    const component = world.components.at(7);
    assert.equal(world.engine.findComponentItems(world.actor, component, world.system).length, 100);

    world.actor.items = world.actor.items.slice(0, 20);

    assert.equal(
      world.engine.findComponentItems(world.actor, component, world.system).length,
      0,
      'a live document read must see the removed stacks'
    );
  });
});

// ---------------------------------------------------------------------------
// Precedence and telemetry — unchanged semantics
// ---------------------------------------------------------------------------

describe('issue 1076 — name-match precedence and case semantics are unchanged', () => {
  const twins = () => [
    { id: 'first', name: 'Iron Ingot' },
    { id: 'second', name: 'Iron Ingot' },
    { id: 'lower', name: 'iron ingot' },
  ];

  it('resolves two same-named components to the FIRST in array order', () => {
    // A `Map` keyed on name silently changes which one wins unless it is built
    // first-insert-wins. That is a correctness regression no performance test would catch.
    assert.equal(
      findComponentByName({ name: 'Iron Ingot' }, twins(), { caseSensitive: false })?.id,
      'first'
    );
    assert.equal(
      findComponentByName({ name: 'Iron Ingot' }, twins(), { caseSensitive: true })?.id,
      'first'
    );
  });

  it('keeps the case-INSENSITIVE read/craft semantics', () => {
    assert.equal(
      findComponentByName({ name: 'IRON INGOT' }, twins(), { caseSensitive: false })?.id,
      'first',
      'a case-insensitive lookup takes the first candidate whose folded name matches'
    );
  });

  it('keeps the case-SENSITIVE salvage semantics', () => {
    // Salvage matches case-sensitively ON PURPOSE: matching more broadly than salvage would
    // let bulk destroy delete items belonging to a differently-cased component.
    assert.equal(
      findComponentByName({ name: 'iron ingot' }, twins(), { caseSensitive: true })?.id,
      'lower',
      'an exact-case lookup must not fold onto the differently-cased twin'
    );
    assert.equal(
      findComponentByName({ name: 'IRON INGOT' }, twins(), { caseSensitive: true }),
      null,
      'an exact-case lookup with no exact twin must miss'
    );
  });

  it('refuses an empty name on either side, exactly as the compare did', () => {
    assert.equal(findComponentByName({ name: '' }, twins(), {}), null);
    assert.equal(findComponentByName({ name: 'X' }, [{ id: 'blank', name: '' }], {}), null);
  });

  it('fires reportNameOnlyMatch once per system for the matched component only', () => {
    const warnings = [];
    const original = console.warn;
    console.warn = (message) => warnings.push(message);
    try {
      const components = twins();
      findComponentByName({ name: 'Iron Ingot' }, components, { systemId: SYSTEM_ID });
      findComponentByName({ name: 'Iron Ingot' }, components, { systemId: SYSTEM_ID });
      findComponentByName({ name: 'Iron Ingot' }, components, { systemId: 'sys-other' });
    } finally {
      console.warn = original;
    }

    assert.equal(warnings.length, 2, 'warn-once per (system, definition, item name)');
    assert.ok(
      warnings.every((message) => message.includes('name-only match')),
      'the deprecation telemetry that justifies removing name matching must still be emitted'
    );
    assert.ok(
      warnings.every((message) => message.includes('(id "first")')),
      'the telemetry names the component the index resolved, not the folded key'
    );
  });

  it('leaves the pairwise matcher and its telemetry untouched', () => {
    const warnings = [];
    const original = console.warn;
    console.warn = (message) => warnings.push(message);
    try {
      assert.equal(matchComponentByName({ name: 'Iron Ingot' }, { id: 'x', name: 'iron ingot' }), true);
      assert.equal(
        matchComponentByName({ name: 'Iron Ingot' }, { id: 'x', name: 'iron ingot' }, {
          caseSensitive: true,
        }),
        false
      );
    } finally {
      console.warn = original;
    }
    assert.equal(warnings.length, 1, 'only the successful match reports');
  });
});

describe('issue 1076 — id and source-reference precedence are unchanged', () => {
  it('resolves a duplicated id to the FIRST candidate carrying it', () => {
    const components = [
      { id: 'dup', name: 'A' },
      { id: 'dup', name: 'B' },
    ];
    assert.equal(
      resolveComponentForItem(durableItem('dup'), components, SYSTEM_ID)?.name,
      'A',
      'first-insert-wins reproduces what candidates.find() returned'
    );
  });

  it('resolves a shared source reference to the EARLIEST candidate, not the first ref', () => {
    // The subtle one. The scan this replaces iterated CANDIDATES in the outer loop, so the
    // winner is the earliest candidate matching ANY of the item's refs — which is NOT the
    // candidate matching the item's first reference.
    const components = [
      { id: 'early', name: 'Early', originItemUuid: 'Item.shared-b' },
      { id: 'late', name: 'Late', originItemUuid: 'Item.shared-a' },
    ];
    const item = roleItem({
      uuid: 'Item.shared-a',
      name: 'Owned',
      duplicateSource: 'Item.shared-b',
    });

    assert.equal(
      resolveComponentForItem(item, components, SYSTEM_ID)?.id,
      'early',
      'the earliest candidate in array order wins, whichever of the item refs matched it'
    );
  });

  it('falls through a durable claim that names nothing in THIS system', () => {
    // Component ids are not globally unique, so a claim naming nothing in this candidate set
    // is irrelevant, not foreign: evaluation must fall through to the source-reference tier.
    const components = [{ id: 'here', name: 'Here', originItemUuid: 'Item.src' }];
    const item = roleItem({
      uuid: 'Item.src',
      name: 'Owned',
      roles: { [SYSTEM_ID]: { componentId: 'elsewhere' } },
    });
    assert.equal(resolveComponentForItem(item, components, SYSTEM_ID)?.id, 'here');
  });
});

// ---------------------------------------------------------------------------
// Staleness — the invalidation rule, proved
// ---------------------------------------------------------------------------

/**
 * A GM environment with a real `CraftingSystemManager` over a small library.
 *
 * @returns {Promise<{manager: object, systemId: string}>}
 */
async function managerWithSystem() {
  installFoundryEnv();
  const manager = new CraftingSystemManager(new RecipeManager({}));
  const system = await manager.createSystem({ id: SYSTEM_ID, name: 'Index System' });
  return { manager, systemId: system.id };
}

describe('issue 1076 staleness — an index is a cache, so its invalidation is tested', () => {
  it('sees a component ADDED through createItem', async () => {
    const { manager, systemId } = await managerWithSystem();
    const system = manager.getSystem(systemId);
    assert.equal(findMatchingComponent(unstampedItem('Copper Wire'), system.components, systemId), null);

    const added = await manager.createItem(systemId, { name: 'Copper Wire' });

    assert.equal(
      findMatchingComponent(unstampedItem('Copper Wire'), system.components, systemId)?.id,
      added.id,
      'a push into the live array must be visible to the very next resolution'
    );
  });

  it('sees a component RENAMED through updateItem — the constant-length replace', async () => {
    // The clause that carries the correctness. A slot rewritten in place changes neither the
    // array identity nor its length, so only the explicit revision advance can catch it.
    const { manager, systemId } = await managerWithSystem();
    const system = manager.getSystem(systemId);
    const created = await manager.createItem(systemId, { name: 'Old Name' });
    assert.equal(
      findMatchingComponent(unstampedItem('Old Name'), system.components, systemId)?.id,
      created.id
    );

    await manager.updateItem(systemId, created.id, { name: 'New Name' });

    assert.equal(
      findMatchingComponent(unstampedItem('New Name'), system.components, systemId)?.id,
      created.id,
      'the renamed component must resolve under its NEW name'
    );
    assert.equal(
      findMatchingComponent(unstampedItem('Old Name'), system.components, systemId),
      null,
      'and must no longer resolve under the old one — a stale index answers this wrongly'
    );
  });

  it('sees a component DELETED', async () => {
    const { manager, systemId } = await managerWithSystem();
    const system = manager.getSystem(systemId);
    const created = await manager.createItem(systemId, { name: 'Doomed' });
    assert.ok(findMatchingComponent(unstampedItem('Doomed'), system.components, systemId));

    await manager.deleteItem(systemId, created.id);

    assert.equal(
      findMatchingComponent(
        unstampedItem('Doomed'),
        manager.getSystem(systemId).components,
        systemId
      ),
      null
    );
  });

  it('rebuilds when a caller announces an in-place mutation', () => {
    const components = library(4);
    assert.equal(
      findMatchingComponent(unstampedItem('Component 2'), components, SYSTEM_ID)?.id,
      'c-2'
    );

    components[2] = { ...components[2], name: 'Renamed' };
    advanceDefinitionRevision(components);

    assert.equal(findMatchingComponent(unstampedItem('Component 2'), components, SYSTEM_ID), null);
    assert.equal(findMatchingComponent(unstampedItem('Renamed'), components, SYSTEM_ID)?.id, 'c-2');
  });

  it('treats a rebuilt array as a fresh index with no announcement at all', () => {
    const first = library(3);
    assert.ok(findMatchingComponent(unstampedItem('Component 1'), first, SYSTEM_ID));

    const second = first.map((component) => ({ ...component, name: `${component.name} v2` }));

    assert.equal(findMatchingComponent(unstampedItem('Component 1'), second, SYSTEM_ID), null);
    assert.equal(
      findMatchingComponent(unstampedItem('Component 1 v2'), second, SYSTEM_ID)?.id,
      'c-1'
    );
  });
});

// ---------------------------------------------------------------------------
// The revision-token contract
// ---------------------------------------------------------------------------

/**
 * A GM recipe manager with a Map-backed settings store, so `save()` and `reload()` are real.
 *
 * @returns {{manager: object, settings: Map<string, any>}}
 */
function recipeManagerWithSettings() {
  const { settings } = installFoundryEnv();
  return { manager: new RecipeManager({}), settings };
}

/** The minimal persistable recipe shape. */
function recipePayload(id, systemId = SYSTEM_ID) {
  return {
    id,
    name: `Recipe ${id}`,
    craftingSystemId: systemId,
    enabled: false,
    ingredientSets: [
      {
        id: `${id}-set`,
        ingredientGroups: [
          { id: `${id}-g`, name: 'Ingredients', options: [{ componentId: 'c-0', quantity: 1 }] },
        ],
        essences: {},
      },
    ],
    resultGroups: [
      { id: `${id}-rg`, results: [{ id: `${id}-res`, itemUuid: 'Item.x', quantity: 1 }] },
    ],
  };
}

describe('issue 1076 — the revision-token contract', () => {
  it('advances the domain scope AND the affected system scope on a create', async () => {
    const { manager } = recipeManagerWithSettings();
    const before = {
      domain: manager.revision(REVISION_SCOPES.recipes),
      mine: manager.revision(REVISION_SCOPES.recipesOfSystem(SYSTEM_ID)),
      other: manager.revision(REVISION_SCOPES.recipesOfSystem('sys-other')),
    };

    await manager.createRecipe(recipePayload('r-1'), { notify: false });

    assert.notEqual(manager.revision(REVISION_SCOPES.recipes), before.domain);
    assert.notEqual(manager.revision(REVISION_SCOPES.recipesOfSystem(SYSTEM_ID)), before.mine);
    assert.equal(
      manager.revision(REVISION_SCOPES.recipesOfSystem('sys-other')),
      before.other,
      'an unrelated system must not be invalidated — that is the whole point of the narrow scope'
    );
  });

  it('advances BOTH systems when a recipe moves between them', async () => {
    const { manager } = recipeManagerWithSettings();
    await manager.createRecipe(recipePayload('r-1'), { notify: false });
    const left = manager.revision(REVISION_SCOPES.recipesOfSystem(SYSTEM_ID));
    const joined = manager.revision(REVISION_SCOPES.recipesOfSystem('sys-other'));

    await manager.updateRecipe('r-1', { craftingSystemId: 'sys-other' }, { notify: false });

    assert.notEqual(
      manager.revision(REVISION_SCOPES.recipesOfSystem(SYSTEM_ID)),
      left,
      'a consumer watching the system the recipe LEFT must stop trusting its cache'
    );
    assert.notEqual(manager.revision(REVISION_SCOPES.recipesOfSystem('sys-other')), joined);
  });

  it('advances NO token on a reload that finds no change', async () => {
    const { manager } = recipeManagerWithSettings();
    await manager.createRecipe(recipePayload('r-1'), { notify: false });
    const before = manager.revision(REVISION_SCOPES.recipes);

    assert.equal(manager.reload(), false, 'a no-change reload reports no change');
    assert.equal(
      manager.revision(REVISION_SCOPES.recipes),
      before,
      'and therefore mints no new token'
    );
  });

  it('advances on a reload that finds a real change', async () => {
    const { manager, settings } = recipeManagerWithSettings();
    await manager.createRecipe(recipePayload('r-1'), { notify: false });
    const before = manager.revision(REVISION_SCOPES.recipes);

    settings.set('recipes', [recipePayload('r-1'), recipePayload('r-2')]);

    assert.equal(manager.reload(), true);
    assert.notEqual(manager.revision(REVISION_SCOPES.recipes), before);
  });

  it('detects change without serializing the corpus', () => {
    // The literal criterion: neither manager's `reload()` may use `JSON.stringify` over the
    // whole collection to answer a boolean. Read off the shipped function bodies rather than
    // a source file, so a helper that reintroduced it under another name still shows up here.
    for (const [label, body] of [
      ['RecipeManager.reload', RecipeManager.prototype.reload.toString()],
      ['CraftingSystemManager.reload', CraftingSystemManager.prototype.reload.toString()],
    ]) {
      assert.ok(
        !body.includes('JSON.stringify'),
        `${label} still serializes the corpus to detect change; at 10,000 recipes that is ` +
          `22.3 MB of string per pass, on every connected client, to answer a boolean.`
      );
    }
  });

  it('is consumed by a memo standing in for #1074 / #1077 / #1078', async () => {
    // The contract is only worth defining if a consumer can actually build on it. This is
    // the shape all three downstream issues need: hold a token, compare with ===, rebuild
    // only when it moved.
    const { manager } = recipeManagerWithSettings();
    let rebuilds = 0;
    let cache = { token: null, value: null };
    const scope = REVISION_SCOPES.recipesOfSystem(SYSTEM_ID);
    const report = () => {
      const token = manager.revision(scope);
      if (cache.token !== token) {
        rebuilds += 1;
        cache = { token, value: manager.getRecipes({ craftingSystemId: SYSTEM_ID }).length };
      }
      return cache.value;
    };

    await manager.createRecipe(recipePayload('r-1'), { notify: false });
    assert.equal(report(), 1);
    assert.equal(report(), 1);
    assert.equal(report(), 1);
    assert.equal(rebuilds, 1, 'three reads after one mutation cost one rebuild');

    await manager.createRecipe(recipePayload('r-2'), { notify: false });
    assert.equal(report(), 2);
    assert.equal(rebuilds, 2, 'and the mutation is what forces the second');
  });

  it('advances the crafting-system scopes on a system mutation', async () => {
    const { manager, systemId } = await managerWithSystem();
    const before = {
      domain: manager.revision(REVISION_SCOPES.systems),
      mine: manager.revision(REVISION_SCOPES.system(systemId)),
    };

    await manager.createItem(systemId, { name: 'Tin Ore' });

    assert.notEqual(manager.revision(REVISION_SCOPES.systems), before.domain);
    assert.notEqual(manager.revision(REVISION_SCOPES.system(systemId)), before.mine);
  });
});

// ---------------------------------------------------------------------------
// getRecipes cohorts
// ---------------------------------------------------------------------------

describe('issue 1076 — getRecipes starts from the indexed cohort', () => {
  it('returns the same recipes, in the same order, as the whole-corpus filter did', async () => {
    const { manager } = recipeManagerWithSettings();
    for (const [index, systemId] of ['a', 'b', 'a', 'b', 'a'].entries()) {
      await manager.createRecipe(recipePayload(`r-${index}`, `sys-${systemId}`), { notify: false });
    }

    assert.deepEqual(
      manager.getRecipes({ craftingSystemId: 'sys-a' }).map((recipe) => recipe.id),
      [...manager.recipes.values()]
        .filter((recipe) => recipe.craftingSystemId === 'sys-a')
        .map((recipe) => recipe.id)
    );
  });

  it('does not copy every recipe in every system', () => {
    // The criterion is about the COPY, and the honest way to observe it is the size of what
    // the cohort hands back before any filter runs.
    const { manager } = recipeManagerWithSettings();
    const cohorts = () => manager._recipeCohorts();
    for (const [index, systemId] of ['a', 'b', 'b', 'b'].entries()) {
      manager.recipes.set(
        `r-${index}`,
        { id: `r-${index}`, craftingSystemId: `sys-${systemId}`, name: 'x', description: '' }
      );
    }
    assert.deepEqual(cohorts().get('sys-a'), ['r-0']);
    assert.equal(cohorts().get('sys-b').length, 3);
  });

  it('keeps answering correctly after add, update and delete', async () => {
    const { manager } = recipeManagerWithSettings();
    await manager.createRecipe(recipePayload('r-1', 'sys-a'), { notify: false });
    await manager.createRecipe(recipePayload('r-2', 'sys-a'), { notify: false });
    assert.equal(manager.getRecipes({ craftingSystemId: 'sys-a' }).length, 2);

    await manager.updateRecipe('r-2', { craftingSystemId: 'sys-b' }, { notify: false });
    assert.equal(manager.getRecipes({ craftingSystemId: 'sys-a' }).length, 1);
    assert.equal(manager.getRecipes({ craftingSystemId: 'sys-b' }).length, 1);

    await manager.deleteRecipe('r-1', { notify: false });
    assert.equal(manager.getRecipes({ craftingSystemId: 'sys-a' }).length, 0);
  });
});
