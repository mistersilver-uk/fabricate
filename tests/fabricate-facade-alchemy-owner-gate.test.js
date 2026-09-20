/** game.fabricate alchemy owner-gate — the P0 non-owner read-leak boundary (issue 569). */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { createFabricateFacadeHarness, makeFacadeActor } from './helpers/fabricateFacadeHarness.js';
import { collectSources, repoRoot } from './helpers/sourceScan.js';

// The entry and the `src/bootstrap/` modules it split into (issue 1715), read through ONE call.
const FABRICATE_ENTRY_SOURCES = collectSources(resolve(repoRoot, 'src'), { extensions: ['.js'] });
const FABRICATE_ENTRY_SOURCE = Object.keys(FABRICATE_ENTRY_SOURCES)
  .filter((file) => file.startsWith('src/bootstrap/') || file === 'src/main.js')
  .sort()
  .map((file) => FABRICATE_ENTRY_SOURCES[file])
  .join('\n');


// Fixtures — a single alchemy system with two recipes so a non-GM owner sees one learned recipe (+
// one undiscovered count) while a GM sees both.

function component(id, name) {
  return { id, name, img: `icons/${id}.webp`, registeredItemUuid: null };
}

function plainRecipe(id, name, systemId, sig, resultComponentId) {
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
    ingredientSets: [
      { id: `${id}-set`, ingredientGroups: groups, essences: {}, resultGroupId: `${id}-rg` },
    ],
    resultGroups: [
      {
        id: `${id}-rg`,
        name: `${name} result`,
        results: [{ componentId: resultComponentId, quantity: 1 }],
      },
    ],
  };
}

const COMPONENTS = [
  component('emberroot', 'Emberroot'),
  component('springwater', 'Spring Water'),
  component('ashsalt', 'Ashsalt'),
  component('quicksilver', 'Quicksilver'),
];

// `vigor` is what the owner has learned (revealed); `toxin` must never leak to a
// non-owner — its id, name, and its unique `ashsalt` signature are clean tells.
const VIGOR = plainRecipe(
  'vigor',
  'Elixir of Vigor',
  'sys-a',
  { emberroot: 1, springwater: 2 },
  'quicksilver'
);
const TOXIN = plainRecipe(
  'toxin',
  "Serpent's Kiss",
  'sys-a',
  { ashsalt: 1, quicksilver: 1 },
  'emberroot'
);
const SYSTEM = {
  id: 'sys-a',
  name: 'Herbalism',
  img: 'icons/sys-a.webp',
  description: 'Herbalism blurb',
  resolutionMode: 'alchemy',
  enabled: true,
  components: COMPONENTS,
  essenceDefinitions: [{ id: 'fire', name: 'Fire', icon: 'fas fa-fire' }],
};

const OWNER = { id: 'player-1', isGM: false };
const NON_OWNER = { id: 'player-2', isGM: false };
const GM = { id: 'gm-1', isGM: true };

/**
 * The target actor: owned by `player-1` only, has learned `vigor`, holds Emberroot/Ashsalt, and
 * carries a private fizzle key in `alchemyDeadEnds`.
 */
function targetActor() {
  return makeFacadeActor('pc', {
    ownerUserIds: ['player-1'],
    learned: { vigor: { learnedAt: 1 } },
    owned: { Emberroot: 4, Ashsalt: 5 },
    deadEnds: { 'sys-a': ['ashsalt:2|quicksilver:1'] },
  });
}

function harnessFor(user) {
  return createFabricateFacadeHarness({
    user,
    actors: [targetActor()],
    systems: [{ system: SYSTEM, recipes: [VIGOR, TOXIN] }],
  });
}

// listAlchemyForActor — the read path

test('listAlchemyForActor: OWNER (non-GM) resolves their own actor and reads the real listing', () => {
  const { facade } = harnessFor(OWNER);
  const listing = facade.listAlchemyForActor({ actorId: 'pc', craftingSystemId: 'sys-a' });

  assert.equal(listing.denied, false, 'the owner is not denied');
  assert.equal(listing.selectedActorId, 'pc', 'the owner reads their own actor');
  assert.deepEqual(
    listing.recipes.map((r) => r.id),
    ['vigor'],
    'the learned recipe is revealed'
  );
  assert.equal(listing.undiscoveredCount, 1, 'the un-learned recipe is a leak-safe count');
  assert.deepEqual(
    listing.fizzleKeys,
    ['ashsalt:2|quicksilver:1'],
    'the owner reads their own fizzle memory'
  );
  assert.deepEqual(
    listing.components.map((row) => [row.componentId, row.held]).sort(),
    [
      ['ashsalt', 5],
      ['emberroot', 4],
    ],
    'the owner reads their own owned inventory'
  );
});

test('listAlchemyForActor: NON-OWNER (non-GM) is denied — no leaked recipes, inventory, or fizzle memory', () => {
  const { facade } = harnessFor(NON_OWNER);
  const listing = facade.listAlchemyForActor({ actorId: 'pc', craftingSystemId: 'sys-a' });

  // The gate resolved the actor to null -> denied, empty payload.
  assert.equal(listing.denied, true, 'a non-owner is denied');
  assert.equal(listing.selectedActorId, null, 'no actor identity is handed back');
  assert.deepEqual(listing.recipes, [], 'no revealed recipes leak');
  assert.equal(listing.undiscoveredCount, 0, 'not even a private count leaks');
  assert.deepEqual(listing.components, [], 'no owned inventory leaks');
  assert.deepEqual(listing.fizzleKeys, [], 'no fizzle memory leaks');

  // Belt-and-braces: NONE of the actor's private data appears anywhere in the payload (the chooser
  // summaries the denied listing still carries are counts + system identity only).
  const serialized = JSON.stringify(listing);
  assert.ok(!serialized.includes('Elixir of Vigor'), 'learned recipe name must not leak');
  assert.ok(!serialized.includes('vigor'), 'learned recipe id must not leak');
  assert.ok(!serialized.includes("Serpent's Kiss"), 'undiscovered recipe name must not leak');
  assert.ok(!serialized.includes('toxin'), 'undiscovered recipe id must not leak');
  assert.ok(!serialized.includes('ashsalt:2'), 'private fizzle key must not leak');
});

test('listAlchemyForActor: GM viewer bypasses ownership and reads a fully-revealed listing', () => {
  const { facade } = harnessFor(GM);
  const listing = facade.listAlchemyForActor({ actorId: 'pc', craftingSystemId: 'sys-a' });

  assert.equal(listing.denied, false, 'the GM is never denied');
  assert.equal(listing.selectedActorId, 'pc');
  assert.equal(listing.recipes.length, 2, 'the GM sees every enabled recipe (bypass)');
  assert.equal(listing.undiscoveredCount, 0, 'nothing is undiscovered for a GM');
});

test('listAlchemyForActor: the gate is USER-relative — the SAME actor flips from readable to denied on a viewer swap', () => {
  // A regression that keyed off a static `actor.isOwner` (owner of *some* user)
  // rather than the current viewer would keep serving the listing after the swap.
  const { facade, setCurrentUser } = harnessFor(OWNER);

  const asOwner = facade.listAlchemyForActor({ actorId: 'pc', craftingSystemId: 'sys-a' });
  assert.equal(asOwner.denied, false, 'the owner reads the listing');

  setCurrentUser(NON_OWNER);
  const asNonOwner = facade.listAlchemyForActor({ actorId: 'pc', craftingSystemId: 'sys-a' });
  assert.equal(asNonOwner.denied, true, 'the non-owner viewer is denied the same actor');
  assert.deepEqual(asNonOwner.recipes, []);
  assert.deepEqual(asNonOwner.fizzleKeys, []);
});

test('listAlchemyForActor: a persisted (console-supplied) selection cannot be read by a non-owner', () => {
  // Even when the target actor id is the persisted `LAST_CRAFTING_ACTOR` (not passed
  // in the call), the gate still resolves it to null for a non-owner.
  const { facade } = createFabricateFacadeHarness({
    user: NON_OWNER,
    actors: [targetActor()],
    systems: [{ system: SYSTEM, recipes: [VIGOR, TOXIN] }],
    selectedCraftingActorId: 'pc',
  });
  const listing = facade.listAlchemyForActor({ craftingSystemId: 'sys-a' });
  assert.equal(listing.denied, true, 'a stale/persisted id the viewer does not own stays denied');
  assert.deepEqual(listing.recipes, []);
  assert.deepEqual(listing.components, []);
});

// submitAlchemyAttempt — the mutating path

test('submitAlchemyAttempt: OWNER reaches the crafting engine with their own actor', async () => {
  const { facade, craftAlchemyCalls } = harnessFor(OWNER);
  const result = await facade.submitAlchemyAttempt({
    actorId: 'pc',
    craftingSystemId: 'sys-a',
    submittedComponentIds: ['emberroot'],
  });
  assert.equal(craftAlchemyCalls.length, 1, 'the brew reaches the engine for the owner');
  assert.equal(craftAlchemyCalls[0].craftingActor.id, 'pc', 'against the owner’s own actor');
  assert.equal(result.success, true);
});

test('submitAlchemyAttempt: NON-OWNER is refused with disposition:error and NO engine call (no mutation)', async () => {
  const { facade, craftAlchemyCalls } = harnessFor(NON_OWNER);
  const result = await facade.submitAlchemyAttempt({
    actorId: 'pc',
    craftingSystemId: 'sys-a',
    submittedComponentIds: ['emberroot'],
  });
  assert.equal(result.disposition, 'error', 'the non-owner submit is an error');
  assert.equal(result.success, false);
  assert.equal(
    result.message,
    'No crafting actor selected',
    'refused before any component resolution'
  );
  assert.equal(
    craftAlchemyCalls.length,
    0,
    'the engine is NEVER reached — no mutation of another player’s actor'
  );
});

test('submitAlchemyAttempt: GM viewer reaches the engine (bypass)', async () => {
  const { facade, craftAlchemyCalls } = harnessFor(GM);
  const result = await facade.submitAlchemyAttempt({
    actorId: 'pc',
    craftingSystemId: 'sys-a',
    submittedComponentIds: ['emberroot'],
  });
  assert.equal(craftAlchemyCalls.length, 1, 'the GM brew reaches the engine');
  assert.equal(result.success, true);
});

// SOURCE-CONTRACT guard — pin the real src/main.js gate.

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAIN_SOURCE = FABRICATE_ENTRY_SOURCE;

test('SOURCE CONTRACT: _resolveCraftingActor gates a non-GM viewer through the real ownership predicate', () => {
  assert.ok(
    MAIN_SOURCE.includes('const actor = actorId ? (game.actors?.get?.(actorId) ?? null) : null;'),
    'resolves the actor id against game.actors, null when absent/stale'
  );
  assert.ok(
    MAIN_SOURCE.includes('if (game.user?.isGM === true) return actor;'),
    'GM bypass is present'
  );
  assert.ok(
    MAIN_SOURCE.includes(
      'return isGatheringActorSelectableByUser(actor, game.user) ? actor : null;'
    ),
    'a non-GM viewer must pass the ownership predicate or resolve to null (the read-leak boundary)'
  );
});

test('SOURCE CONTRACT: listAlchemyForActor threads the owner-gated actor into the leak-safe builder', () => {
  assert.ok(
    /listAlchemyForActor\(\{\s*actorId = null,\s*craftingSystemId = null,\s*componentSourceActorIds = null,?\s*\} = \{\}\) \{/.test(
      MAIN_SOURCE
    ),
    'the alchemy read facade exists with the expected signature'
  );
  // It must resolve through the shared owner gate and feed the resolved actor to the builder.
  const facadeStart = MAIN_SOURCE.indexOf('listAlchemyForActor({');
  assert.notEqual(facadeStart, -1, 'the alchemy read facade is locatable');
  const facadeBody = MAIN_SOURCE.slice(facadeStart);
  assert.ok(
    facadeBody.includes('this._resolveCraftingSources({'),
    'listAlchemyForActor resolves sources through the shared owner gate'
  );
  assert.ok(
    facadeBody.includes('this._getAlchemyListingBuilder().buildListing({') &&
      facadeBody.slice(0, facadeBody.indexOf('submitAlchemyAttempt')).includes('craftingActor,'),
    'the resolved (possibly null) craftingActor is handed to the leak-safe builder'
  );
});

test('SOURCE CONTRACT: submitAlchemyAttempt fails closed (disposition:error) when the owner gate denies the actor', () => {
  const submitStart = MAIN_SOURCE.indexOf('async submitAlchemyAttempt({');
  assert.notEqual(submitStart, -1, 'the alchemy submit facade is locatable');
  const submitBody = MAIN_SOURCE.slice(submitStart);
  assert.ok(
    submitBody.includes('this._resolveCraftingSources({'),
    'submitAlchemyAttempt resolves through the shared owner gate'
  );
  assert.ok(
    /if \(!craftingActor\) \{\s*return \{\s*success: false,\s*results: null,\s*message: 'No crafting actor selected',\s*disposition: 'error',?\s*\};/.test(
      submitBody
    ),
    'a denied (null) crafting actor short-circuits to disposition:error before the engine is reached'
  );
});
