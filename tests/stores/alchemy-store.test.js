import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { flushSync } from '../../node_modules/svelte/src/index-client.js';

import { CraftingEngine } from '../../src/systems/CraftingEngine.js';
import { SignatureValidator } from '../../src/systems/SignatureValidator.js';
import { createSvelteModuleCompiler } from '../helpers/compile-svelte-module.js';
import { toAlchemyRecords } from '../helpers/alchemySubmissionRecords.js';

let compiler;
let createAlchemyStore;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function concreteRecipe(id, name, concrete, resultName = 'Result') {
  const groups = Object.entries(concrete).map(([componentId, quantity]) => ({
    options: [{ componentId, name: componentId, img: null, quantity }],
  }));
  return {
    id,
    name,
    img: null,
    concrete,
    result: { componentId: `${id}-out`, name: resultName, img: null, quantity: 1 },
    signatureSummary: [{ setId: `${id}-set`, groups, essences: [], result: null }],
  };
}

function richRecipe(id, name) {
  return {
    id,
    name,
    img: null,
    concrete: null, // rich signature -> fail-safe to untried
    result: { componentId: `${id}-out`, name: 'Rich', img: null, quantity: 1 },
    signatureSummary: [
      {
        setId: `${id}-set`,
        groups: [{ options: [{ componentId: 'a', name: 'A', img: null, quantity: 1 }, { componentId: 'b', name: 'B', img: null, quantity: 1 }] }],
        essences: [{ id: 'fire', name: 'Fire', icon: null, quantity: 1 }],
        result: null,
      },
    ],
  };
}

function baseListing(overrides = {}) {
  return {
    denied: false,
    selectedActorId: 'pc',
    activeSystemId: 'sys-a',
    activeSystemName: 'Herbalism',
    systems: [{ id: 'sys-a', name: 'Herbalism', img: null, description: '', knownCount: 1, totalCount: 2 }],
    recipes: [concreteRecipe('vigor', 'Elixir of Vigor', { emberroot: 1, springwater: 2 }, 'Vigor')],
    undiscoveredCount: 1,
    components: [
      { componentId: 'emberroot', name: 'Emberroot', img: null, held: 4 },
      { componentId: 'springwater', name: 'Spring Water', img: null, held: 6 },
      { componentId: 'ashsalt', name: 'Ashsalt', img: null, held: 3 },
    ],
    fizzleKeys: [],
    ...overrides,
  };
}

function makeServices(overrides = {}) {
  const calls = { list: [], submit: [], notify: [], setSystem: [] };
  let listing = overrides.listing ?? baseListing();
  let alchemySystem = overrides.alchemySystem ?? 'sys-a';
  const services = {
    listAlchemyForActor: async (opts) => {
      calls.list.push(opts);
      return typeof listing === 'function' ? listing(opts) : listing;
    },
    submitAlchemyAttempt:
      overrides.submitAlchemyAttempt ??
      (async (opts) => {
        calls.submit.push(opts);
        return { success: true, results: [], message: '' };
      }),
    notify: (message) => calls.notify.push(message),
    craftErrorMessage: () => 'failed',
    getSelectedCraftingActorId: () => overrides.actorId ?? 'pc',
    getCraftingComponentSourceIds: () => overrides.sourceIds ?? [],
    getSelectedAlchemySystemId: () => alchemySystem,
    setSelectedAlchemySystemId: (id) => {
      calls.setSystem.push(id);
      alchemySystem = id;
    },
  };
  return {
    services,
    calls,
    setListing: (next) => {
      listing = next;
    },
  };
}

async function loadedStore(setup = {}) {
  const harness = makeServices(setup);
  const store = createAlchemyStore({ services: harness.services });
  await store.load();
  flushSync();
  return { store, ...harness };
}

// ---------------------------------------------------------------------------

describe('alchemyStore', () => {
  before(async () => {
    compiler = createSvelteModuleCompiler('fabricate-alchemy-store-');
    compiler.copyPlain('src/utils/alchemySignatureKey.js');
    ({ createAlchemyStore } = await compiler.load('src/ui/svelte/stores/alchemyStore.svelte.js'));
  });

  after(() => compiler.cleanup());

  it('loads the listing scoped to the active system and sets loadedOnce', async () => {
    const { store, calls } = await loadedStore();
    assert.equal(store.loadedOnce, true);
    assert.equal(store.knownCount, 1);
    assert.equal(store.undiscoveredCount, 1);
    assert.equal(calls.list[0].craftingSystemId, 'sys-a');
  });

  it('is `empty` with an empty bench and Brew disabled', async () => {
    const { store } = await loadedStore();
    assert.equal(store.mode, 'empty');
    assert.equal(store.brewEnabled, false);
  });

  it('empty inventory -> empty mode + Brew disabled', async () => {
    const { store } = await loadedStore({ listing: baseListing({ components: [] }) });
    assert.equal(store.components.length, 0);
    assert.equal(store.mode, 'empty');
    assert.equal(store.brewEnabled, false);
  });

  it('selecting a known concrete recipe auto-loads its signature and reads `ready`', async () => {
    const { store } = await loadedStore();
    store.selectRecipe('vigor');
    flushSync();
    assert.deepEqual(
      Object.fromEntries(store.benchChips.map((c) => [c.componentId, c.qty])),
      { emberroot: 1, springwater: 2 }
    );
    assert.equal(store.mode, 'ready');
    assert.equal(store.target.id, 'vigor');
    assert.equal(store.brewEnabled, true);
  });

  it('a strict subset of the selected recipe reads `assembling` with the still-needed rows', async () => {
    const { store } = await loadedStore();
    store.selectRecipe('vigor');
    flushSync();
    store.removeOne('springwater'); // now emberroot:1, springwater:1 -> subset
    flushSync();
    assert.equal(store.mode, 'assembling');
    assert.equal(store.brewEnabled, false, 'assembling cannot brew');
    assert.deepEqual(store.missing, [{ componentId: 'springwater', name: 'Spring Water', img: null, need: 1 }]);
  });

  it('the 1x vs 2x quantity boundary flips assembling -> ready', async () => {
    const { store } = await loadedStore();
    store.selectRecipe('vigor');
    flushSync();
    store.removeOne('springwater'); // springwater:1 (short) -> assembling
    flushSync();
    assert.equal(store.mode, 'assembling');
    store.add('springwater'); // back to springwater:2 -> ready
    flushSync();
    assert.equal(store.mode, 'ready');
  });

  it('a bench matching NO known concrete recipe reads `untried` (undiscovered -> untried)', async () => {
    // ashsalt is owned but no KNOWN recipe uses it; this is exactly the case of an
    // undiscovered recipe or a never-tried dead-end -> both present as untried.
    const { store } = await loadedStore();
    store.add('ashsalt');
    flushSync();
    assert.equal(store.mode, 'untried');
    assert.equal(store.brewEnabled, true, 'the player can experiment');
  });

  it('a remembered fizzle flips untried -> no-reaction', async () => {
    const { store } = await loadedStore({ listing: baseListing({ fizzleKeys: ['ashsalt:1'] }) });
    store.add('ashsalt');
    flushSync();
    assert.equal(store.mode, 'no-reaction');
    assert.equal(store.brewEnabled, true, 'the player may experiment anyway');
  });

  it('a rich-signature known recipe fails safe to `untried` (never a false ready/assembling)', async () => {
    const listing = baseListing({
      recipes: [richRecipe('volatile', 'Volatile Elixir')],
      components: [{ componentId: 'a', name: 'A', img: null, held: 2 }],
    });
    const { store } = await loadedStore({ listing });
    store.selectRecipe('volatile');
    flushSync();
    // No auto-fill (concrete is null) and no false ready/assembling.
    assert.equal(store.benchEmpty, true);
    store.add('a');
    flushSync();
    assert.equal(store.mode, 'untried');
  });

  it('a known recipe whose components are no longer held cannot assemble (zero availability)', async () => {
    const listing = baseListing({
      recipes: [concreteRecipe('vigor', 'Elixir of Vigor', { emberroot: 1, springwater: 2 })],
      components: [], // owns none
    });
    const { store } = await loadedStore({ listing });
    store.selectRecipe('vigor');
    flushSync();
    assert.equal(store.benchEmpty, true, 'nothing auto-fills when unheld');
    assert.equal(store.mode, 'empty');
  });

  it('duplicate/identical learned signatures fail safe to `untried` (issue 774 — engine fizzles)', async () => {
    // Identical signatures are now rejected at enable time and, if two ever both
    // match, the engine fizzles (a non-unique maximum). The client mirrors that: it
    // does NOT promise a `ready` brew by iteration order, it fails safe to `untried`.
    const listing = baseListing({
      recipes: [
        concreteRecipe('first', 'First Brew', { emberroot: 1 }, 'A'),
        concreteRecipe('second', 'Second Brew', { emberroot: 1 }, 'B'),
      ],
    });
    const { store } = await loadedStore({ listing });
    store.add('emberroot');
    flushSync();
    assert.equal(store.mode, 'untried', 'a non-unique maximum yields no confident ready');
    assert.equal(store.target, null);
  });

  it('a bench that is a superset of one concrete and EQUALS another reads `ready` for the most-specific (issue 774)', async () => {
    // A={emberroot} ⊂ B={emberroot, springwater}. A bench {emberroot, springwater}
    // contains both; the most-specific (B) must win — never a false ready for A.
    const listing = baseListing({
      recipes: [
        concreteRecipe('base', 'Base Brew', { emberroot: 1 }, 'A'),
        concreteRecipe('super', 'Super Brew', { emberroot: 1, springwater: 1 }, 'B'),
      ],
    });
    const { store } = await loadedStore({ listing });
    store.add('emberroot');
    flushSync();
    assert.equal(store.target?.id, 'base', '{emberroot} alone → the base recipe');
    store.add('springwater');
    flushSync();
    assert.equal(store.mode, 'ready');
    assert.equal(store.target?.id, 'super', '{emberroot,springwater} → the most-specific superset recipe');
  });

  // The client prediction MUST name the same recipe the engine brews (issue 774).
  // We drive the ACTUAL engine matcher and the ACTUAL store over parallel recipe
  // definitions and assert they agree for every bench in a subset/superset family.
  it('the store prediction agrees with the engine most-specific pick', async () => {
    const componentIds = ['c1', 'c2', 'c3'];
    // Engine side.
    const engineComponents = componentIds.map((id) => ({
      id,
      name: id,
      tags: [],
      registeredItemUuid: `Item.${id}`,
      originItemUuid: `Item.${id}`,
    }));
    const engineRecipe = (id, ids) => ({
      id,
      name: id,
      craftingSystemId: 'sys-a',
      enabled: true,
      ingredientSets: [
        {
          id: `${id}-set`,
          ingredientGroups: ids.map((cid) => ({
            id: `${id}-${cid}`,
            options: [{ match: { type: 'component', componentId: cid } }],
          })),
          essences: {},
        },
      ],
      resultGroups: [{ id: 'rg1', name: 'Result', results: [] }],
      getExecutionSteps: () => [],
    });
    const engineRecipes = [engineRecipe('base', ['c1', 'c2']), engineRecipe('super', ['c1', 'c2', 'c3'])];
    const engine = new CraftingEngine({ getRecipes: () => [] });
    const validator = new SignatureValidator({
      getSystem: () => null,
      getRecipesForSystem: () => [],
      getComponentsForSystem: () => engineComponents,
    });
    const enginePick = (ids) => {
      const submissions = ids.map((id) => ({
        uuid: `Item.${id}`,
        _stats: { compendiumSource: `Item.${id}` },
        flags: {},
      }));
      const result = engine['_matchAlchemySignature'](
        toAlchemyRecords(submissions, engineComponents, undefined),
        engineRecipes,
        engineComponents,
        validator,
        {}
      );
      return result.matched ? result.recipe.id : null;
    };

    // Store side: the same recipe family projected as concrete listing recipes.
    const listing = baseListing({
      recipes: [
        concreteRecipe('base', 'Base Brew', { c1: 1, c2: 1 }, 'Base'),
        concreteRecipe('super', 'Super Brew', { c1: 1, c2: 1, c3: 1 }, 'Super'),
      ],
      components: componentIds.map((id) => ({ componentId: id, name: id, img: null, held: 4 })),
    });
    const { store } = await loadedStore({ listing });

    const storePick = (ids) => {
      store.clear();
      for (const id of ids) store.add(id);
      flushSync();
      return store.target?.id ?? null;
    };

    for (const bench of [['c1', 'c2'], ['c1', 'c2', 'c3']]) {
      assert.equal(
        storePick(bench),
        enginePick(bench),
        `client and engine must agree for bench {${bench.join(',')}}`
      );
    }
  });

  it('Switch discipline resets bench / selection / last-brew / search and reloads', async () => {
    const { store, calls } = await loadedStore({
      listing: baseListing({
        systems: [
          { id: 'sys-a', name: 'A', img: null, description: '', knownCount: 1, totalCount: 1 },
          { id: 'sys-b', name: 'B', img: null, description: '', knownCount: 0, totalCount: 1 },
        ],
      }),
    });
    store.selectRecipe('vigor');
    store.setSearch('vig');
    flushSync();
    assert.equal(store.canSwitch, true);
    store.switchDiscipline();
    flushSync();
    assert.equal(store.selectedRecipeId, null);
    assert.equal(store.benchEmpty, true);
    assert.equal(store.search, '');
    assert.equal(store.lastBrew, null);
    assert.ok(calls.setSystem.includes(''), 'active system is cleared on switch');
  });

  it('choosing a discipline scopes the reload to that system id', async () => {
    const { store, calls } = await loadedStore({
      alchemySystem: '',
      listing: baseListing({
        activeSystemId: null,
        systems: [
          { id: 'sys-a', name: 'A', img: null, description: '', knownCount: 0, totalCount: 1 },
          { id: 'sys-b', name: 'B', img: null, description: '', knownCount: 0, totalCount: 1 },
        ],
      }),
    });
    assert.equal(store.needsChooser, true);
    store.chooseSystem('sys-b');
    flushSync();
    await Promise.resolve();
    assert.ok(calls.list.some((opts) => opts.craftingSystemId === 'sys-b'));
  });

  it('exactly one discipline auto-enters (no chooser)', async () => {
    const { store, calls } = await loadedStore({
      alchemySystem: '',
      listing: baseListing({ systems: [{ id: 'sys-a', name: 'A', img: null, description: '', knownCount: 1, totalCount: 1 }] }),
    });
    assert.equal(store.needsChooser, false);
    assert.equal(store.activeSystemId, 'sys-a');
    assert.ok(calls.setSystem.includes('sys-a'));
  });

  it('brew submits the expanded bench, clears it, and banners a discovery', async () => {
    const harness = makeServices();
    // After the brew, reload reveals the newly-learned recipe.
    const store = createAlchemyStore({ services: harness.services });
    await store.load();
    flushSync();
    store.add('ashsalt');
    store.add('ashsalt'); // untried, 2x ashsalt
    flushSync();
    harness.setListing(
      baseListing({
        recipes: [
          concreteRecipe('vigor', 'Elixir of Vigor', { emberroot: 1, springwater: 2 }, 'Vigor'),
          concreteRecipe('smoke', 'Smoke Bomb', { ashsalt: 2 }, 'Smoke'),
        ],
        undiscoveredCount: 0,
      })
    );
    await store.brew();
    flushSync();
    assert.deepEqual(harness.calls.submit[0].submittedComponentIds, ['ashsalt', 'ashsalt']);
    assert.equal(harness.calls.submit[0].interactive, true);
    assert.equal(store.benchEmpty, true, 'the bench clears after a brew');
    assert.equal(store.lastBrew.status, 'success');
    assert.equal(store.lastBrew.discovered, 'Smoke Bomb');
  });

  it('a fizzled brew banners a no-reaction (no discovery) and runs no roll expectation', async () => {
    const harness = makeServices({
      submitAlchemyAttempt: async () => ({ success: false, disposition: 'no-match', message: 'FIZZLE', consumed: true }),
    });
    const store = createAlchemyStore({ services: harness.services });
    await store.load();
    flushSync();
    store.add('ashsalt');
    flushSync();
    await store.brew();
    flushSync();
    assert.equal(store.lastBrew.status, 'no-match-fizzle');
    assert.equal(store.lastBrew.discovered, null);
    assert.equal(store.benchEmpty, true);
  });

  it('removeAll deletes every placed unit of a component (removes the key)', async () => {
    const { store } = await loadedStore();
    store.add('ashsalt');
    store.add('ashsalt');
    flushSync();
    assert.equal(store.benchChips.find((c) => c.componentId === 'ashsalt').qty, 2);
    store.removeAll('ashsalt');
    flushSync();
    assert.equal(store.benchEmpty, true, 'removeAll clears the whole stack');
  });

  it('componentSearch filters the owned-component inventory by name; hasOwnedComponents ignores the filter', async () => {
    const { store } = await loadedStore();
    assert.equal(store.hasOwnedComponents, true);
    assert.equal(store.components.length, 3);
    store.setComponentSearch('ash');
    flushSync();
    assert.deepEqual(store.components.map((c) => c.componentId), ['ashsalt']);
    assert.equal(store.hasOwnedComponents, true, 'ownership is independent of the search filter');
    assert.equal(store.componentSearch, 'ash');
    store.setComponentSearch('');
    flushSync();
    assert.equal(store.components.length, 3, 'clearing the search restores the full list');
  });

  it('left-click add respects the owned availability cap', async () => {
    const { store } = await loadedStore({
      listing: baseListing({ components: [{ componentId: 'ashsalt', name: 'Ashsalt', img: null, held: 1 }] }),
    });
    store.add('ashsalt');
    store.add('ashsalt'); // second add exceeds the held cap of 1 -> no-op
    flushSync();
    assert.equal(store.benchChips.find((c) => c.componentId === 'ashsalt').qty, 1, 'capped at owned availability');
  });

  it('a dismissed interactive roll is returned quietly (bench preserved)', async () => {
    const harness = makeServices({
      submitAlchemyAttempt: async () => ({ success: false, cancelled: true }),
    });
    const store = createAlchemyStore({ services: harness.services });
    await store.load();
    flushSync();
    store.selectRecipe('vigor');
    flushSync();
    const result = await store.brew();
    flushSync();
    assert.equal(result.cancelled, true);
    assert.equal(store.benchEmpty, false, 'a cancelled roll leaves the bench intact');
  });

  // The aggregate essence readout is the ONLY progress signal an essence-authored
  // recipe gets: such a recipe has no `concrete` multiset, so resolution fails safe
  // to `untried` and never reports `ready`.
  describe('benchEssences (aggregate essence readout)', () => {
    const essenceListing = () =>
      baseListing({
        components: [
          {
            componentId: 'venomgland',
            name: 'Venom Gland',
            img: null,
            held: 4,
            essences: [{ id: 'toxic', name: 'Toxic', icon: 'fas fa-skull', quantity: 2 }],
          },
          {
            componentId: 'springwater',
            name: 'Spring Water',
            img: null,
            held: 4,
            essences: [
              { id: 'water', name: 'Water', icon: 'fas fa-droplet', quantity: 1 },
              { id: 'toxic', name: 'Toxic', icon: 'fas fa-skull', quantity: 1 },
            ],
          },
          { componentId: 'ashsalt', name: 'Ashsalt', img: null, held: 3, essences: [] },
        ],
      });

    it('is empty for an empty bench', async () => {
      const { store } = await loadedStore({ listing: essenceListing() });
      assert.deepEqual(store.benchEssences, []);
    });

    it('multiplies per-unit essences by the placed quantity', async () => {
      const { store } = await loadedStore({ listing: essenceListing() });
      store.add('venomgland');
      store.add('venomgland');
      flushSync();
      assert.deepEqual(
        store.benchEssences.map((e) => [e.id, e.quantity]),
        [['toxic', 4]],
        'Venom Gland x2 at 2 Toxic per unit -> Toxic x4'
      );
    });

    it('sums one essence across different components and sorts by name', async () => {
      const { store } = await loadedStore({ listing: essenceListing() });
      store.add('venomgland'); // Toxic 2
      store.add('springwater'); // Toxic 1 + Water 1
      flushSync();
      assert.deepEqual(
        store.benchEssences.map((e) => [e.id, e.quantity]),
        [
          ['toxic', 3],
          ['water', 1],
        ]
      );
      assert.equal(store.benchEssences[0].icon, 'fas fa-skull', 'carries the essence icon through');
    });

    it('omits components that carry no essences', async () => {
      const { store } = await loadedStore({ listing: essenceListing() });
      store.add('ashsalt');
      flushSync();
      assert.deepEqual(store.benchEssences, [], 'an essence-less component contributes nothing');
    });

    it('drops back out when the component leaves the bench', async () => {
      const { store } = await loadedStore({ listing: essenceListing() });
      store.add('venomgland');
      flushSync();
      assert.equal(store.benchEssences.length, 1);
      store.removeAll('venomgland');
      flushSync();
      assert.deepEqual(store.benchEssences, []);
    });
  });

  // Essence-only recipes resolve off essence TOTALS, mirroring the engine's `>=`
  // rule (`_matchAlchemySignature`) so surplus essences still read as `ready`.
  describe('essence-aware resolution', () => {
    const REQUIREMENT = [
      { id: 'toxic', name: 'Toxic', icon: 'fas fa-skull', quantity: 2 },
      { id: 'water', name: 'Water', icon: 'fas fa-droplet', quantity: 1 },
    ];

    function essenceRecipe(overrides = {}) {
      return {
        id: 'bladevenom',
        name: 'Blade Venom',
        img: null,
        concrete: null,
        essenceRequirement: REQUIREMENT,
        result: { componentId: 'bv', name: 'Blade Venom', img: null, quantity: 1 },
        signatureSummary: [],
        ...overrides,
      };
    }

    function essenceStore(recipe = essenceRecipe()) {
      return loadedStore({
        listing: baseListing({
          recipes: [recipe],
          undiscoveredCount: 0,
          components: [
            {
              componentId: 'venomgland',
              name: 'Venom Gland',
              img: null,
              held: 4,
              essences: [{ id: 'toxic', name: 'Toxic', icon: 'fas fa-skull', quantity: 2 }],
            },
            {
              componentId: 'voidichor',
              name: 'Void Ichor',
              img: null,
              held: 4,
              essences: [{ id: 'water', name: 'Water', icon: 'fas fa-droplet', quantity: 1 }],
            },
          ],
        }),
      });
    }

    it('is `ready` when the bench essence totals meet the requirement exactly', async () => {
      const { store } = await essenceStore();
      store.add('venomgland'); // Toxic 2
      store.add('voidichor'); // Water 1
      flushSync();
      assert.equal(store.mode, 'ready');
      assert.equal(store.target.id, 'bladevenom');
      assert.equal(store.brewEnabled, true);
    });

    it('is still `ready` with SURPLUS essences (engine matches with >=)', async () => {
      const { store } = await essenceStore();
      store.add('venomgland');
      store.add('venomgland'); // Toxic 4 (surplus)
      store.add('voidichor'); // Water 1
      flushSync();
      assert.equal(store.mode, 'ready', 'surplus essences must not fall back to untried');
    });

    it('is `untried` when the requirement is unmet and nothing is selected', async () => {
      const { store } = await essenceStore();
      store.add('venomgland'); // Toxic 2, no Water
      flushSync();
      assert.equal(store.mode, 'untried');
      assert.equal(store.brewEnabled, true, 'an unmet bench can still be experimented with');
    });

    it('is `assembling` toward a SELECTED essence recipe, reporting the shortfall', async () => {
      const { store } = await essenceStore();
      store.selectRecipe('bladevenom');
      flushSync();
      store.add('venomgland'); // Toxic 2 of 2, Water 0 of 1
      flushSync();
      assert.equal(store.mode, 'assembling');
      assert.deepEqual(
        store.missing.map((row) => [row.componentId, row.need]),
        [['water', 1]],
        'only the unmet essence is still needed'
      );
    });

    it('selecting an essence recipe does not auto-fill the bench', async () => {
      const { store } = await essenceStore();
      store.selectRecipe('bladevenom');
      flushSync();
      assert.equal(store.benchEmpty, true, 'no unique component solution -> never guess');
      assert.equal(store.mode, 'empty');
    });

    it('never emits a false `ready` for a set mixing groups with essences', async () => {
      // The builder projects `essenceRequirement: null` for such a set, so even a
      // bench that satisfies the essence half must fail safe to `untried`.
      const { store } = await essenceStore(essenceRecipe({ essenceRequirement: null }));
      store.add('venomgland');
      store.add('voidichor');
      flushSync();
      assert.equal(store.mode, 'untried');
    });
  });
});
