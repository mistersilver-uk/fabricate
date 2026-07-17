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
const { RecipeVisibilityService } = await import('../src/systems/RecipeVisibilityService.js');
const { canonicalSignatureKey } = await import('../src/utils/alchemySignatureKey.js');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function component(id, name) {
  return { id, name, img: `icons/${id}.webp`, registeredItemUuid: null };
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

/**
 * A stub reveal collaborator: `revealFn({ recipe, viewer, craftingActor,
 * componentSourceActors })` decides `visible`. `craftable` is always true (the
 * builder must read `visible`, NEVER `craftable`). Records calls so a test can
 * assert the threaded `componentSourceActors`.
 */
function stubVisibility(revealFn) {
  return {
    calls: [],
    evaluateRecipeAccess(args) {
      this.calls.push(args);
      return { visible: revealFn(args) === true, craftable: true };
    },
  };
}

function buildWithVisibility(systems, options, recipeVisibility) {
  const { craftingSystemManager, recipeManager } = makeManagers(systems);
  const builder = new AlchemyListingBuilder({ recipeManager, craftingSystemManager, recipeVisibility });
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

test('an essence-type ingredient option projects the essence NAME + AMOUNT + icon, never the raw id', () => {
  // The real "Blade Venom" shape (issue 675): ONE ingredient set with TWO groups,
  // each a single ESSENCE option (componentId null). Historically the card showed
  // the raw essence id at ×option.quantity; the projection must resolve the
  // essence's name/icon and surface match.amount as the display quantity.
  const bladeVenom = {
    id: 'blade-venom',
    name: 'Blade Venom',
    img: null,
    description: '',
    enabled: true,
    craftingSystemId: 'sys-a',
    ingredientSets: [
      {
        id: 'bv-set',
        ingredientGroups: [
          {
            id: 'bv-g1',
            options: [
              { match: { type: 'essence', essenceId: 'toxic-id', amount: 2 }, componentId: null, quantity: 1 },
            ],
          },
          {
            id: 'bv-g2',
            options: [
              { match: { type: 'essence', essenceId: 'water-id', amount: 1 }, componentId: null, quantity: 1 },
            ],
          },
        ],
        essences: {},
        resultGroupId: 'bv-rg',
      },
    ],
    resultGroups: [{ id: 'bv-rg', name: 'Blade Venom result', results: [{ componentId: 'quicksilver', quantity: 1 }] }],
  };
  const system = makeSystem('sys-a', 'Herbalism', [bladeVenom], COMPONENTS);
  system.essenceDefinitions = [
    { id: 'toxic-id', name: 'Toxic', icon: 'fas fa-skull' },
    { id: 'water-id', name: 'Water', icon: 'fas fa-droplet' },
  ];
  const actor = makeActor('pc', { learned: { 'blade-venom': {} } });
  const listing = build([{ system, recipes: [bladeVenom] }], {
    craftingActor: actor,
    viewer: { isGM: false },
    craftingSystemId: 'sys-a',
  });
  const projected = listing.recipes[0];
  const groups = projected.signatureSummary[0].groups;
  assert.equal(groups.length, 2, 'both essence groups are projected');

  const toxic = groups[0].options[0];
  assert.equal(toxic.name, 'Toxic', 'the essence NAME renders, not the raw id');
  assert.notEqual(toxic.name, 'toxic-id', 'the raw essence id must never be the display name');
  assert.equal(toxic.quantity, 2, 'the display quantity is the required essence amount');
  assert.equal(toxic.icon, 'fas fa-skull', 'the essence icon is carried for display');
  assert.equal(toxic.componentId, null);
  assert.equal(toxic.essenceId, 'toxic-id', 'the essence id is carried in its own field, as set-level essences do');

  const water = groups[1].options[0];
  assert.equal(water.name, 'Water');
  assert.notEqual(water.name, 'water-id');
  assert.equal(water.quantity, 1);
  assert.equal(water.icon, 'fas fa-droplet');
});

test('an essence option with a missing definition falls back to the raw id as the name', () => {
  const recipe = {
    id: 'orphan',
    name: 'Orphan Brew',
    enabled: true,
    craftingSystemId: 'sys-a',
    ingredientSets: [
      {
        id: 'o-set',
        ingredientGroups: [
          {
            id: 'o-g',
            options: [
              { match: { type: 'essence', essenceId: 'ghost-id', amount: 3 }, componentId: null, quantity: 1 },
            ],
          },
        ],
        essences: {},
        resultGroupId: 'o-rg',
      },
    ],
    resultGroups: [{ id: 'o-rg', name: 'r', results: [{ componentId: 'quicksilver', quantity: 1 }] }],
  };
  const system = makeSystem('sys-a', 'Herbalism', [recipe], COMPONENTS);
  system.essenceDefinitions = [];
  const actor = makeActor('pc', { learned: { orphan: {} } });
  const listing = build([{ system, recipes: [recipe] }], {
    craftingActor: actor,
    viewer: { isGM: false },
    craftingSystemId: 'sys-a',
  });
  const option = listing.recipes[0].signatureSummary[0].groups[0].options[0];
  assert.equal(option.name, 'ghost-id', 'with no definition, the raw id is the only available label');
  assert.equal(option.quantity, 3, 'the amount is still the required essence amount');
  assert.equal(option.icon, null);
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

// ---------------------------------------------------------------------------
// Reveal-not-gate: the builder routes reveal through the injected recipeVisibility
// collaborator's `visible` signal, NEVER `craftable` (issue 563)
// ---------------------------------------------------------------------------

test('routes reveal through the collaborator (not the learned map): reveals exactly the admitted subset', () => {
  const { system, recipes } = singleSystemSetup();
  // Actor has learned NOTHING; the collaborator reveals only `toxin`. A learned-map
  // reveal would show `vigor`, so this proves the decision is routed.
  const actor = makeActor('pc', { learned: {} });
  const vis = stubVisibility(({ recipe }) => recipe.id === 'toxin');
  const listing = buildWithVisibility([{ system, recipes }], {
    craftingActor: actor,
    viewer: { isGM: false },
    craftingSystemId: 'sys-a',
  }, vis);

  assert.deepEqual(listing.recipes.map((r) => r.id), ['toxin']);
  assert.equal(listing.undiscoveredCount, 1, 'the non-revealed valid recipe is a count only');
});

test('reads `visible`, never `craftable`: a craftable-but-not-visible recipe is count-only', () => {
  const { system, recipes } = singleSystemSetup();
  const actor = makeActor('pc', { learned: {} });
  // Every recipe is craftable (brew never gated) but NONE is visible -> all count-only.
  const vis = {
    evaluateRecipeAccess: () => ({ visible: false, craftable: true }),
  };
  const listing = buildWithVisibility([{ system, recipes }], {
    craftingActor: actor,
    viewer: { isGM: false },
    craftingSystemId: 'sys-a',
  }, vis);

  assert.deepEqual(listing.recipes, []);
  assert.equal(listing.undiscoveredCount, 2);
});

test('threads componentSourceActors into the reveal decision (component-source-only reveal)', () => {
  const { system, recipes } = singleSystemSetup();
  const actor = makeActor('pc', { learned: {} });
  const sourceActor = makeActor('vault', {});
  // Reveal only when a component-source actor is present (mimics a book held on a
  // source actor, not the crafting actor).
  const vis = stubVisibility(
    ({ recipe, componentSourceActors }) =>
      recipe.id === 'vigor' &&
      Array.isArray(componentSourceActors) &&
      componentSourceActors.some((a) => a.id === 'vault')
  );
  const listing = buildWithVisibility([{ system, recipes }], {
    craftingActor: actor,
    componentSourceActors: [sourceActor],
    viewer: { isGM: false },
    craftingSystemId: 'sys-a',
  }, vis);

  assert.deepEqual(listing.recipes.map((r) => r.id), ['vigor']);
  assert.ok(
    vis.calls.every((call) => Array.isArray(call.componentSourceActors)),
    'the reveal decision always receives the threaded component-source actors'
  );
});

test('GM-sees-all flows THROUGH the routed decision (no _isKnown short-circuit)', () => {
  const { system, recipes } = singleSystemSetup();
  const gm = makeActor('gm', {});
  const vis = stubVisibility(({ viewer }) => viewer?.isGM === true);
  const listing = buildWithVisibility([{ system, recipes }], {
    craftingActor: gm,
    viewer: { isGM: true },
    craftingSystemId: 'sys-a',
  }, vis);

  assert.equal(listing.recipes.length, 2, 'the GM sees all recipes via the routed decision');
  assert.equal(listing.undiscoveredCount, 0);
  assert.ok(vis.calls.length >= 2, 'the routed decision was consulted for the GM');
});

test('a recipe revealed by BOTH grant and brew is projected/counted exactly once', () => {
  const { system, recipes } = singleSystemSetup();
  const actor = makeActor('pc', { learned: { vigor: {} } });
  // Collaborator admits `vigor` (e.g. both a grant AND brew-discovery). Reveal is a
  // single boolean per recipe, so it can only be projected once.
  const vis = stubVisibility(({ recipe }) => recipe.id === 'vigor');
  const listing = buildWithVisibility([{ system, recipes }], {
    craftingActor: actor,
    viewer: { isGM: false },
    craftingSystemId: 'sys-a',
  }, vis);

  assert.equal(listing.recipes.filter((r) => r.id === 'vigor').length, 1);
  assert.equal(listing.recipes.length, 1);
  assert.equal(listing.undiscoveredCount, 1);
});

test('LEAK INVARIANT (generalized): a non-revealed recipe leaks no name/signature/result', () => {
  const { system, recipes } = singleSystemSetup();
  const actor = makeActor('pc', { learned: { toxin: {} } });
  // Even though the actor "learned" toxin, the collaborator does NOT reveal it
  // (mode-specific un-reveal, e.g. an item-mode book that was dropped). It must be
  // count-only, with no identity in the serialized payload.
  const vis = stubVisibility(({ recipe }) => recipe.id === 'vigor');
  const listing = buildWithVisibility([{ system, recipes }], {
    craftingActor: actor,
    viewer: { isGM: false },
    craftingSystemId: 'sys-a',
  }, vis);

  assert.deepEqual(listing.recipes.map((r) => r.id), ['vigor']);
  assert.equal(listing.undiscoveredCount, 1);
  const serialized = JSON.stringify(listing);
  assert.ok(!serialized.includes("Serpent's Kiss"), 'non-revealed name must not leak');
  assert.ok(!serialized.includes('toxin'), 'non-revealed id must not leak');
  // `ashsalt` is unique to toxin's signature (vigor uses emberroot/springwater), so
  // it is a clean tell that no non-revealed signature leaked.
  assert.ok(!serialized.includes('ashsalt'), 'non-revealed signature must not leak');
});

test('chooser knownCount counts REVEALED recipes and threads componentSourceActors', () => {
  const a = singleSystemSetup();
  const potion = plainRecipe('potion', 'Healing Potion', 'sys-b', { emberroot: 2 }, 'springwater', 1);
  const systemB = makeSystem('sys-b', 'Distillation', [potion], COMPONENTS);
  const actor = makeActor('pc', { learned: {} });
  const sourceActor = makeActor('vault', {});
  // Reveal `vigor` in sys-a only when the source actor is threaded; nothing in sys-b.
  const vis = stubVisibility(
    ({ recipe, componentSourceActors }) =>
      recipe.id === 'vigor' && componentSourceActors.some((x) => x.id === 'vault')
  );
  const listing = buildWithVisibility(
    [
      { system: a.system, recipes: a.recipes },
      { system: systemB, recipes: [potion] },
    ],
    {
      craftingActor: actor,
      componentSourceActors: [sourceActor],
      viewer: { isGM: false },
      craftingSystemId: 'sys-a',
    },
    vis
  );

  const summaries = Object.fromEntries(listing.systems.map((s) => [s.id, s]));
  assert.equal(summaries['sys-a'].knownCount, 1, 'chooser count = revealed (source-threaded)');
  assert.equal(summaries['sys-a'].totalCount, 2);
  assert.equal(summaries['sys-b'].knownCount, 0);
});

test('null-collaborator default: reveals GM-all / learned-only when no recipeVisibility is wired', () => {
  const { system, recipes } = singleSystemSetup();
  const nonGm = makeActor('pc', { learned: { vigor: {} } });
  const listing = build([{ system, recipes }], {
    craftingActor: nonGm,
    viewer: { isGM: false },
    craftingSystemId: 'sys-a',
  });
  assert.deepEqual(listing.recipes.map((r) => r.id), ['vigor'], 'learned-only default');
  assert.equal(listing.undiscoveredCount, 1);

  const gm = makeActor('gm', {});
  const gmListing = build([{ system, recipes }], {
    craftingActor: gm,
    viewer: { isGM: true },
    craftingSystemId: 'sys-a',
  });
  assert.equal(gmListing.recipes.length, 2, 'GM-all default');
  assert.equal(gmListing.undiscoveredCount, 0);
});

test('decoupling edge (real service): learnOnCraft:false + a held book is REVEALED under item mode but COUNT-ONLY under global', () => {
  // Wire the REAL RecipeVisibilityService so the paired edge is exercised end-to-end
  // through the builder (not a stub): `learnOnCraft` governs only brew-discovery, so
  // a held book reveals under item mode yet the same recipe stays count-only under
  // global mode (discovery-only, nothing learned).
  const vigor = plainRecipe('vigor', 'Elixir of Vigor', 'sys-a', { emberroot: 1, springwater: 2 }, 'quicksilver', 1);
  vigor.linkedRecipeItemUuid = 'book-vigor';
  const toxin = plainRecipe('toxin', "Serpent's Kiss", 'sys-a', { ashsalt: 1, quicksilver: 1 }, 'emberroot', 1);
  const system = { ...makeSystem('sys-a', 'Herbalism', [vigor, toxin], COMPONENTS), alchemy: { learnOnCraft: false } };

  const { craftingSystemManager, recipeManager } = makeManagers([{ system, recipes: [vigor, toxin] }]);
  const service = new RecipeVisibilityService(recipeManager, craftingSystemManager);
  const builder = new AlchemyListingBuilder({ recipeManager, craftingSystemManager, recipeVisibility: service });

  // Actor holds the vigor book (uuid matches linkedRecipeItemUuid), learned nothing.
  const actor = {
    id: 'pc',
    items: [{ id: 'i1', uuid: 'book-vigor', name: 'Recipe Book', system: { quantity: 1 } }],
    getFlag: () => undefined,
  };
  const viewer = { isGM: false };

  system.visibilityMode = 'item';
  const itemListing = builder.buildListing({ craftingActor: actor, viewer, craftingSystemId: 'sys-a' });
  assert.deepEqual(itemListing.recipes.map((r) => r.id), ['vigor'], 'item mode reveals the held-book recipe');

  system.visibilityMode = 'global';
  const globalListing = builder.buildListing({ craftingActor: actor, viewer, craftingSystemId: 'sys-a' });
  assert.deepEqual(globalListing.recipes, [], 'global mode (discovery-only, learnOnCraft off) reveals nothing');
  assert.equal(globalListing.undiscoveredCount, 2, 'both recipes stay count-only under global');
});

// ---------------------------------------------------------------------------
// Component essence projection (issue 563 addendum)
// ---------------------------------------------------------------------------

test('_projectOwnedComponents surfaces resolved essences when the system has essences enabled', () => {
  const emberEss = { ...component('emberroot', 'Emberroot'), essences: { fire: 2 } };
  const water = component('springwater', 'Spring Water'); // no essences
  const comps = [emberEss, water];
  const vigor = plainRecipe('vigor', 'Elixir of Vigor', 'sys-a', { emberroot: 1 }, 'springwater', 1);
  const system = { ...makeSystem('sys-a', 'Herbalism', [vigor], comps), features: { essences: true } };
  const actor = makeActor('pc', { learned: { vigor: {} }, owned: { Emberroot: 3, 'Spring Water': 2 } });

  const listing = build([{ system, recipes: [vigor] }], {
    craftingActor: actor,
    viewer: { isGM: false },
    craftingSystemId: 'sys-a',
  });

  const ember = listing.components.find((c) => c.componentId === 'emberroot');
  const springwater = listing.components.find((c) => c.componentId === 'springwater');
  assert.deepEqual(ember.essences, [{ id: 'fire', name: 'Fire', icon: 'fas fa-fire', quantity: 2 }]);
  assert.deepEqual(springwater.essences, [], 'a component with no essences projects an empty list');
  // The Produces result surfaces the result component's essences too.
  assert.deepEqual(listing.recipes[0].result.essences, []);
});

test('_projectOwnedComponents omits essences when the system has essences disabled', () => {
  const emberEss = { ...component('emberroot', 'Emberroot'), essences: { fire: 2 } };
  const comps = [emberEss, component('springwater', 'Spring Water')];
  const vigor = plainRecipe('vigor', 'Elixir of Vigor', 'sys-a', { emberroot: 1 }, 'springwater', 1);
  const system = makeSystem('sys-a', 'Herbalism', [vigor], comps); // no features.essences
  const actor = makeActor('pc', { learned: { vigor: {} }, owned: { Emberroot: 3 } });

  const listing = build([{ system, recipes: [vigor] }], {
    craftingActor: actor,
    viewer: { isGM: false },
    craftingSystemId: 'sys-a',
  });

  const ember = listing.components.find((c) => c.componentId === 'emberroot');
  assert.deepEqual(ember.essences, [], 'essences are omitted when the system disables essences');
});

// ---------------------------------------------------------------------------
// Reserved failure-group leak invariant + checkMode projection (issue 554)
// ---------------------------------------------------------------------------

const SECRET_COMPONENT = component('sludge', 'Toxic Sludge');

function simpleFailRecipe(id, name, systemId) {
  return {
    id,
    name,
    img: `icons/${id}.webp`,
    description: '',
    enabled: true,
    craftingSystemId: systemId,
    ingredientSets: [
      {
        id: `${id}-set`,
        ingredientGroups: [
          { id: `${id}-g`, options: [{ match: { type: 'component', componentId: 'emberroot' }, componentId: 'emberroot', quantity: 1 }] },
        ],
        essences: {},
      },
    ],
    resultGroups: [
      { id: `${id}-ok`, name: 'On success', results: [{ componentId: 'quicksilver', quantity: 1 }] },
      { id: `${id}-fail`, name: 'On a failed check', role: 'failure', results: [{ componentId: 'sludge', quantity: 1 }] },
    ],
  };
}

test('LEAK INVARIANT: a Simple recipe never surfaces its reserved failure-group result to the workbench', () => {
  const brew = simpleFailRecipe('brew', 'Volatile Draught', 'sys-a');
  const system = { ...makeSystem('sys-a', 'Herbalism', [brew], [...COMPONENTS, SECRET_COMPONENT]), alchemy: { checkMode: 'simple' } };
  const actor = makeActor('pc', { learned: { brew: {} } });
  const listing = build([{ system, recipes: [brew] }], {
    craftingActor: actor,
    viewer: { isGM: false },
    craftingSystemId: 'sys-a',
  });

  const projected = listing.recipes[0];
  // The success group drives Produces; the failure group is excluded.
  assert.equal(projected.result.componentId, 'quicksilver', 'the success result is the headline');
  assert.equal(projected.checkMode, 'simple');
  assert.equal(projected.checkGated, true, 'a simple brew is check-gated');

  const serialized = JSON.stringify(listing);
  assert.ok(!serialized.includes('Toxic Sludge'), 'the failure-group result name must not leak');
  assert.ok(!serialized.includes('sludge'), 'the failure-group result component id must not leak');
});

test('Tiered projection surfaces the top success tier group and carries checkMode', () => {
  const tiered = {
    id: 'tonic',
    name: 'Tonic',
    img: null,
    description: '',
    enabled: true,
    craftingSystemId: 'sys-a',
    ingredientSets: [
      { id: 'tonic-set', ingredientGroups: [{ id: 'tonic-g', options: [{ match: { type: 'component', componentId: 'emberroot' }, componentId: 'emberroot', quantity: 1 }] }], essences: {} },
    ],
    resultGroups: [
      { id: 'tonic-fine', name: 'Fine', checkOutcomeIds: ['t-fine'], results: [{ componentId: 'quicksilver', quantity: 1 }] },
      { id: 'tonic-superb', name: 'Superb', checkOutcomeIds: ['t-superb'], results: [{ componentId: 'ashsalt', quantity: 2 }] },
    ],
  };
  const system = {
    ...makeSystem('sys-a', 'Herbalism', [tiered], COMPONENTS),
    alchemy: { checkMode: 'tiered' },
    craftingCheck: {
      routed: {
        type: 'relative',
        relativeOutcomes: [
          { id: 't-fine', name: 'Fine', success: true },
          { id: 't-superb', name: 'Superb', success: true },
        ],
      },
    },
  };
  const actor = makeActor('pc', { learned: { tonic: {} } });
  const listing = build([{ system, recipes: [tiered] }], {
    craftingActor: actor,
    viewer: { isGM: false },
    craftingSystemId: 'sys-a',
  });
  const projected = listing.recipes[0];
  assert.equal(projected.checkMode, 'tiered');
  // The first routed success tier (Fine) is the headline.
  assert.equal(projected.result.componentId, 'quicksilver');
});

// ---------------------------------------------------------------------------
// Essence-only recipes: `essenceRequirement` lets the store resolve
// ready/assembling for a recipe identified by essence totals rather than by
// named components. Mixed group+essence sets stay null (fail safe to `untried`).
// ---------------------------------------------------------------------------

function essenceSystem(recipes, components) {
  return {
    ...makeSystem('sys-e', 'Venomwright', recipes, components),
    features: { essences: true },
    essenceDefinitions: [
      { id: 'toxic', name: 'Toxic', icon: 'fas fa-skull' },
      { id: 'water', name: 'Water', icon: 'fas fa-droplet' },
    ],
  };
}

function essenceOnlyRecipe(id, name, essences) {
  return {
    id,
    name,
    img: null,
    description: '',
    enabled: true,
    craftingSystemId: 'sys-e',
    ingredientSets: [{ id: `${id}-set`, ingredientGroups: [], essences, resultGroupId: `${id}-rg` }],
    resultGroups: [
      { id: `${id}-rg`, name: `${name} result`, results: [{ componentId: 'quicksilver', quantity: 1 }] },
    ],
  };
}

function projectEssenceRecipe(recipe, { essencesEnabled = true } = {}) {
  const comps = [component('venomgland', 'Venom Gland'), component('quicksilver', 'Quicksilver')];
  const base = essenceSystem([recipe], comps);
  const system = essencesEnabled ? base : { ...base, features: { essences: false } };
  const actor = makeActor('pc', { learned: { [recipe.id]: {} }, owned: {} });
  const listing = build([{ system, recipes: [recipe] }], {
    craftingActor: actor,
    viewer: { isGM: false },
    craftingSystemId: 'sys-e',
  });
  return listing.recipes[0];
}

test('an essence-only recipe projects a resolved essenceRequirement', () => {
  const bladeVenom = essenceOnlyRecipe('bladevenom', 'Blade Venom', { toxic: 2, water: 1 });
  const projected = projectEssenceRecipe(bladeVenom);
  assert.equal(projected.concrete, null, 'an essence set has no concrete multiset');
  assert.deepEqual(projected.essenceRequirement, [
    { id: 'toxic', name: 'Toxic', icon: 'fas fa-skull', quantity: 2 },
    { id: 'water', name: 'Water', icon: 'fas fa-droplet', quantity: 1 },
  ]);
});

test('essenceRequirement is null when the system has essences disabled', () => {
  const bladeVenom = essenceOnlyRecipe('bladevenom', 'Blade Venom', { toxic: 2 });
  const projected = projectEssenceRecipe(bladeVenom, { essencesEnabled: false });
  assert.equal(projected.essenceRequirement, null);
});

test('essenceRequirement is null for a set that MIXES ingredient groups with essences', () => {
  // The store cannot verify the group half client-side, so it must fail safe to
  // `untried` rather than emit a false `ready` off the essence half alone.
  const comps = [component('emberroot', 'Emberroot'), component('quicksilver', 'Quicksilver')];
  const mixed = richRecipe('mixed', 'Mixed', 'sys-e');
  const system = essenceSystem([mixed], comps);
  const actor = makeActor('pc', { learned: { mixed: {} }, owned: {} });
  const listing = build([{ system, recipes: [mixed] }], {
    craftingActor: actor,
    viewer: { isGM: false },
    craftingSystemId: 'sys-e',
  });
  assert.equal(listing.recipes[0].essenceRequirement, null);
});

test('essenceRequirement drops zero and non-positive essence quantities', () => {
  const odd = essenceOnlyRecipe('odd', 'Odd', { toxic: 2, water: 0 });
  const projected = projectEssenceRecipe(odd);
  assert.deepEqual(
    projected.essenceRequirement.map((e) => e.id),
    ['toxic']
  );
});
