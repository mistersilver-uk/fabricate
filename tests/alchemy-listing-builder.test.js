/**
 * AlchemyListingBuilder — leak-safe projection for the player Alchemy workbench.
 *
 * Covers: projection correctness (learned recipes, owned components, fizzle keys,
 * chooser summaries), the LEAK INVARIANT (a non-GM projection carries no
 * undiscovered name/signature/result — only the count), the undiscovered ->
 * untried count path, GM bypass, and the non-owner read-leak guard (a null
 * crafting actor -> denied, empty listing).
 */

import test from 'node:test';
import assert from 'node:assert/strict';

function getProperty(object, path) {
  if (!object || !path) return undefined;
  return String(path)
    .split('.')
    .reduce((value, key) => (value == null ? undefined : value[key]), object);
}

globalThis.foundry = {
  utils: { randomID: () => `id-${Math.random().toString(36).slice(2)}`, getProperty },
};

const { AlchemyListingBuilder } = await import('../src/systems/AlchemyListingBuilder.js');
const { canonicalSignatureKey } = await import('../src/utils/alchemySignatureKey.js');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function component(id, name) {
  return { id, name, img: `icons/${id}.webp`, sourceUuid: null };
}

function plainRecipe(id, name, systemId, sig, resultComponentId, resultQty = 1) {
  const groups = Object.entries(sig).map(([componentId, quantity]) => ({
    id: `g-${componentId}`,
    options: [{ match: { type: 'component', componentId }, componentId, quantity }],
  }));
  return {
    id,
    name,
    img: `icons/${id}.webp`,
    description: `${name} description`,
    enabled: true,
    craftingSystemId: systemId,
    ingredientSets: [{ id: `${id}-set`, ingredientGroups: groups, essences: {}, resultGroupId: `${id}-rg` }],
    resultGroups: [{ id: `${id}-rg`, name: `${name} result`, results: [{ componentId: resultComponentId, quantity: resultQty }] }],
  };
}

function richRecipe(id, name, systemId) {
  // Two options in one group + a set-level essence requirement -> NOT concrete.
  return {
    id,
    name,
    img: null,
    description: '',
    enabled: true,
    craftingSystemId: systemId,
    ingredientSets: [
      {
        id: `${id}-set`,
        ingredientGroups: [
          {
            id: `${id}-g`,
            options: [
              { match: { type: 'component', componentId: 'emberroot' }, componentId: 'emberroot', quantity: 1 },
              { match: { type: 'component', componentId: 'ashsalt' }, componentId: 'ashsalt', quantity: 1 },
            ],
          },
        ],
        essences: { fire: 2 },
        resultGroupId: `${id}-rg`,
      },
    ],
    resultGroups: [{ id: `${id}-rg`, name: 'Rich result', results: [{ componentId: 'quicksilver', quantity: 1 }] }],
  };
}

function makeSystem(id, name, recipes, components) {
  return {
    id,
    name,
    img: `icons/${id}-system.webp`,
    description: `${name} blurb`,
    resolutionMode: 'alchemy',
    enabled: true,
    components,
    essenceDefinitions: [{ id: 'fire', name: 'Fire', icon: 'fas fa-fire' }],
  };
}

function makeManagers(systems) {
  const bySystem = new Map(systems.map((entry) => [entry.system.id, entry.recipes]));
  const craftingSystemManager = {
    getSystems: () => systems.map((entry) => entry.system),
    getSystem: (id) => systems.find((entry) => entry.system.id === id)?.system ?? null,
  };
  const recipeManager = {
    getRecipes: ({ craftingSystemId, enabled } = {}) => {
      let list = bySystem.get(craftingSystemId) ?? [];
      if (enabled !== undefined) list = list.filter((recipe) => recipe.enabled === enabled);
      return list;
    },
  };
  return { craftingSystemManager, recipeManager };
}

/** An actor with a fabricate flag store (doubly-nested, as setFabricateFlag
 *  persists it: `flags.fabricate.fabricate.<key>`) + owned items. */
function makeActor(id, { learned = {}, deadEnds = {}, owned = {} } = {}) {
  const flags = { fabricate: { fabricate: { learnedRecipes: learned, alchemyDeadEnds: deadEnds } } };
  const items = Object.entries(owned).map(([name, quantity]) => ({
    name,
    system: { quantity },
  }));
  return {
    id,
    items,
    getFlag: (scope, key) => getProperty(flags[scope], key),
  };
}

function build(systems, options) {
  const { craftingSystemManager, recipeManager } = makeManagers(systems);
  const builder = new AlchemyListingBuilder({ recipeManager, craftingSystemManager });
  return builder.buildListing(options);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const COMPONENTS = [
  component('emberroot', 'Emberroot'),
  component('springwater', 'Spring Water'),
  component('ashsalt', 'Ashsalt'),
  component('quicksilver', 'Quicksilver'),
];

function singleSystemSetup() {
  const vigor = plainRecipe('vigor', 'Elixir of Vigor', 'sys-a', { emberroot: 1, springwater: 2 }, 'quicksilver', 1);
  const toxin = plainRecipe('toxin', "Serpent's Kiss", 'sys-a', { ashsalt: 1, quicksilver: 1 }, 'emberroot', 1);
  const system = makeSystem('sys-a', 'Herbalism', [vigor, toxin], COMPONENTS);
  return { system, recipes: [vigor, toxin] };
}

test('projects only LEARNED recipes and the undiscovered COUNT for a non-GM viewer', () => {
  const { system, recipes } = singleSystemSetup();
  const actor = makeActor('pc', {
    learned: { vigor: { learnedAt: 1 } },
    owned: { Emberroot: 4, 'Spring Water': 6 },
  });

  const listing = build([{ system, recipes }], {
    craftingActor: actor,
    viewer: { isGM: false },
    craftingSystemId: 'sys-a',
  });

  assert.equal(listing.denied, false);
  assert.equal(listing.recipes.length, 1, 'only the learned recipe is projected');
  assert.equal(listing.recipes[0].id, 'vigor');
  assert.equal(listing.undiscoveredCount, 1, 'the un-learned recipe is a count only');

  // LEAK INVARIANT: no undiscovered name / signature / result anywhere in the payload.
  const serialized = JSON.stringify(listing);
  assert.ok(!serialized.includes("Serpent's Kiss"), 'undiscovered recipe name must not leak');
  assert.ok(!serialized.includes('toxin'), 'undiscovered recipe id must not leak');
});

test('the learned-recipe projection carries a rich signature summary + concrete reduction', () => {
  const { system, recipes } = singleSystemSetup();
  const actor = makeActor('pc', { learned: { vigor: {} } });
  const listing = build([{ system, recipes }], {
    craftingActor: actor,
    viewer: { isGM: false },
    craftingSystemId: 'sys-a',
  });
  const vigor = listing.recipes[0];
  assert.equal(vigor.signatureSummary.length, 1);
  assert.equal(vigor.signatureSummary[0].groups.length, 2);
  assert.deepEqual(vigor.concrete, { emberroot: 1, springwater: 2 }, 'reduces to a concrete multiset');
  assert.equal(vigor.result.name, 'Quicksilver');
  assert.equal(vigor.result.quantity, 1);
});

test('a rich signature (alternatives + essence) is projected but NOT reducible to concrete', () => {
  const rich = richRecipe('elixir', 'Volatile Elixir', 'sys-a');
  const system = makeSystem('sys-a', 'Herbalism', [rich], COMPONENTS);
  const actor = makeActor('pc', { learned: { elixir: {} } });
  const listing = build([{ system, recipes: [rich] }], {
    craftingActor: actor,
    viewer: { isGM: false },
    craftingSystemId: 'sys-a',
  });
  const projected = listing.recipes[0];
  assert.equal(projected.concrete, null, 'rich recipes fail safe to no concrete reduction');
  assert.equal(projected.signatureSummary[0].groups[0].options.length, 2, 'both alternatives shown');
  assert.equal(projected.signatureSummary[0].essences.length, 1, 'the essence requirement is shown');
});

test('GM bypass: every enabled recipe is known, undiscovered count is zero', () => {
  const { system, recipes } = singleSystemSetup();
  const gmActor = makeActor('gm', {});
  const listing = build([{ system, recipes }], {
    craftingActor: gmActor,
    viewer: { isGM: true },
    craftingSystemId: 'sys-a',
  });
  assert.equal(listing.recipes.length, 2);
  assert.equal(listing.undiscoveredCount, 0);
});

test('projects owned components (held qty) and the actor fizzle keys for the active system', () => {
  const { system, recipes } = singleSystemSetup();
  const actor = makeActor('pc', {
    learned: { vigor: {} },
    owned: { Emberroot: 4, Ashsalt: 5 },
    deadEnds: { 'sys-a': ['ashsalt:2'], 'sys-b': ['other:1'] },
  });
  const listing = build([{ system, recipes }], {
    craftingActor: actor,
    viewer: { isGM: false },
    craftingSystemId: 'sys-a',
  });
  assert.deepEqual(
    listing.components.map((row) => [row.componentId, row.held]).sort(),
    [['ashsalt', 5], ['emberroot', 4]]
  );
  assert.deepEqual(listing.fizzleKeys, ['ashsalt:2'], 'only the active system fizzle keys');
});

test('chooser summaries span every enabled alchemy system with N known . M total', () => {
  const a = singleSystemSetup();
  const potion = plainRecipe('potion', 'Healing Potion', 'sys-b', { emberroot: 2 }, 'springwater', 1);
  const systemB = makeSystem('sys-b', 'Distillation', [potion], COMPONENTS);
  const actor = makeActor('pc', { learned: { vigor: {} } });

  const listing = build(
    [
      { system: a.system, recipes: a.recipes },
      { system: systemB, recipes: [potion] },
    ],
    { craftingActor: actor, viewer: { isGM: false }, craftingSystemId: 'sys-a' }
  );

  const summaries = Object.fromEntries(listing.systems.map((s) => [s.id, s]));
  assert.equal(summaries['sys-a'].knownCount, 1);
  assert.equal(summaries['sys-a'].totalCount, 2);
  assert.equal(summaries['sys-b'].knownCount, 0);
  assert.equal(summaries['sys-b'].totalCount, 1);
});

test('a resolved actor with no discipline chosen (>1 systems) is NOT no-actor and carries selectedActorId', () => {
  // Regression: the empty (chooser) listing must report the resolved actor.
  // AlchemyView checks no-actor BEFORE needsChooser, and a null selectedActorId
  // reads as no-actor — which made the discipline chooser unreachable whenever an
  // actor was selected but no discipline chosen yet.
  const a = singleSystemSetup();
  const potion = plainRecipe('potion', 'Healing Potion', 'sys-b', { emberroot: 2 }, 'springwater', 1);
  const systemB = makeSystem('sys-b', 'Distillation', [potion], COMPONENTS);
  const actor = makeActor('pc', { learned: { vigor: {} } });

  const listing = build(
    [
      { system: a.system, recipes: a.recipes },
      { system: systemB, recipes: [potion] },
    ],
    { craftingActor: actor, viewer: { isGM: false }, craftingSystemId: null }
  );

  assert.equal(listing.denied, false, 'a resolved owner is not denied');
  assert.equal(listing.activeSystemId, null, 'no discipline is active yet');
  assert.ok(listing.selectedActorId, 'the resolved actor is reported so the view is not no-actor');
  assert.equal(listing.systems.length, 2, 'both disciplines are offered in the chooser');
});

test('NON-OWNER read-leak: a null crafting actor yields a denied, empty listing (chooser still safe)', () => {
  const { system, recipes } = singleSystemSetup();
  // A non-owner viewer resolves upstream to a null crafting actor.
  const listing = build([{ system, recipes }], {
    craftingActor: null,
    viewer: { isGM: false },
    craftingSystemId: 'sys-a',
  });
  assert.equal(listing.denied, true);
  assert.deepEqual(listing.recipes, []);
  assert.equal(listing.undiscoveredCount, 0);
  assert.deepEqual(listing.components, []);
  assert.deepEqual(listing.fizzleKeys, []);
  // Chooser summaries carry counts only (no recipe identity).
  const serialized = JSON.stringify(listing.systems);
  assert.ok(!serialized.includes('Elixir of Vigor'));
  assert.ok(!serialized.includes("Serpent's Kiss"));
});

test('the concrete reduction key matches the shared canonical signature-key helper', () => {
  const { system, recipes } = singleSystemSetup();
  const actor = makeActor('pc', { learned: { vigor: {} } });
  const listing = build([{ system, recipes }], {
    craftingActor: actor,
    viewer: { isGM: false },
    craftingSystemId: 'sys-a',
  });
  const vigor = listing.recipes[0];
  assert.equal(canonicalSignatureKey(vigor.concrete), 'emberroot:1|springwater:2');
});
