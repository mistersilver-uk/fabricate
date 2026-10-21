/**
 * The hero-demo world (issue 2571) is internally consistent and loads through the real managers.
 * Its icons are pinned beside the lab's, in `view-lab-fixture-assets.test.js`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { CraftingSystemManager } from '../src/systems/CraftingSystemManager.js';
import { RecipeManager } from '../src/systems/RecipeManager.js';
import { awardedResults } from '../src/utils/choiceGroupShape.js';

import {
  buildDemoContent,
  DEMO_ACTORS,
  DEMO_SEED,
  DEMO_SYSTEM_IDS,
} from './view-lab/demo/demoContent.js';
import { buildDemoSettings } from './view-lab/demo/demoWorld.js';
import { installFoundryShim } from './view-lab/foundry/installFoundryShim.js';
import { buildCastActors, buildDocumentIndex } from './view-lab/world/labActors.js';

const content = buildDemoContent();

/** Every `componentId` an ingredient option, result or failure result names. */
function componentRefs(recipe) {
  const options = recipe.ingredientSets
    .flatMap((set) => set.ingredientGroups)
    .flatMap((group) => group.options);
  const results = recipe.resultGroups.flatMap((group) => group.results).flatMap(awardedResults);
  return [...options, ...results].map((entry) => entry.componentId).filter(Boolean);
}

test('every demo recipe ingredient, result and tool resolves in its own system', () => {
  assert.equal(content.recipes.length, 6);
  for (const recipe of content.recipes) {
    const system = content.systems.find((entry) => entry.id === recipe.craftingSystemId);
    assert.ok(system, `${recipe.id} names a system the world holds`);
    const componentIds = new Set(system.components.map((entry) => entry.id));
    const toolIds = new Set(system.tools.map((entry) => entry.id));
    const essenceIds = new Set(system.essenceDefinitions.map((entry) => entry.id));
    const refs = componentRefs(recipe);
    assert.ok(refs.length > 0, `${recipe.id} names at least one component`);
    for (const id of refs) assert.ok(componentIds.has(id), `${recipe.id} names unknown ${id}`);
    for (const id of recipe.toolIds) assert.ok(toolIds.has(id), `${recipe.id} names tool ${id}`);
    for (const group of recipe.ingredientSets.flatMap((set) => set.ingredientGroups)) {
      for (const { match } of group.options) {
        if (match?.type === 'essence') {
          assert.ok(
            essenceIds.has(match.essenceId),
            `${recipe.id} names essence ${match.essenceId}`
          );
        }
      }
    }
  }
});

test('every routed result set claims a tier the forge check defines', () => {
  const forge = content.systems.find((entry) => entry.resolutionMode === 'routedByCheck');
  const tiers = new Set(forge.craftingCheck.routed.relativeOutcomes.map((tier) => tier.id));
  const claimed = content.recipes.flatMap((recipe) =>
    recipe.craftingSystemId === forge.id
      ? recipe.resultGroups.flatMap((group) => group.checkOutcomeIds ?? [])
      : []
  );
  assert.ok(claimed.length >= 3, 'the longsword routes its three blades by tier');
  for (const id of claimed) assert.ok(tiers.has(id), `a result set claims unknown tier ${id}`);
});

test('the longsword offers the player a grip and a Masterwork flourish to choose', () => {
  const longsword = content.recipes.find((recipe) => recipe.id === 'ed-r-longsword');
  const grip = longsword.ingredientSets[0].ingredientGroups.find(
    (group) => group.id === 'ed-set-blade-g2'
  );
  assert.deepEqual(
    grip.options.map((option) => option.componentId),
    ['ed-oiled-grip', 'ed-wyrmhide-wrap']
  );
  const masterwork = longsword.resultGroups.find((group) => group.id === 'ed-grp-masterwork');
  const flourish = masterwork.results.find((result) => result.id === 'ed-mw-flourish');
  assert.equal(flourish.chooser ?? 'playerChooses', 'playerChooses');
  assert.equal(flourish.alternatives.length, 2);
  // The crafter needs the second source's pack for either grip, so the journey adds it on screen.
  const held = DEMO_ACTORS.inventories['demo-actor-hilde'];
  assert.ok(grip.options.every((option) => !held[option.componentId]));
});

test('the actors hold only things the world defines, and salvage resolves too', () => {
  const known = new Set([...content.components, ...content.tools].map((entry) => entry.id));
  for (const [actorId, stacks] of Object.entries(DEMO_ACTORS.inventories)) {
    for (const id of Object.keys(stacks))
      assert.ok(known.has(id), `${actorId} holds unknown ${id}`);
  }
  const salvage = content.components.filter((entry) => entry.salvage?.enabled);
  assert.ok(salvage.length > 0, 'at least one component salvages');
  for (const entry of salvage) {
    for (const result of entry.salvage.resultGroups.flatMap((group) => group.results)) {
      assert.ok(known.has(result.componentId), `${entry.id} salvages into ${result.componentId}`);
    }
    for (const id of entry.salvage.toolIds) assert.ok(known.has(id), `${entry.id} needs ${id}`);
  }
});

test('the demo world loads through the real system and recipe managers', async () => {
  // `bootLabRuntime` imports `src/main.js`, which needs the lab's Vite build, so the managers it
  // initializes are booted here directly over the same shim and the same persisted settings.
  const world = buildDemoContent();
  const actors = buildCastActors(world, DEMO_ACTORS);
  const shim = installFoundryShim({
    seed: DEMO_SEED,
    actorList: actors,
    scenes: [],
    settings: buildDemoSettings(world, actors),
    i18n: { localize: (key) => key, format: (key) => key },
    worldTime: 0,
    documents: buildDocumentIndex(world, actors),
  });
  try {
    const systems = new CraftingSystemManager();
    await systems.initialize();
    const recipes = new RecipeManager({ getCraftingSystemManager: () => systems });
    await recipes.initialize();

    assert.equal(systems.getSystem(DEMO_SYSTEM_IDS.FORGE)?.resolutionMode, 'routedByCheck');
    const longsword = recipes.getRecipe('ed-r-longsword');
    const routed = (longsword?.resultGroups ?? []).map((group) => [...group.checkOutcomeIds]);
    assert.deepEqual(routed, [['ed-masterwork'], ['ed-standard'], ['ed-flawed'], ['ed-ruined']]);
    assert.equal(systems.getSystem(DEMO_SYSTEM_IDS.STILL)?.resolutionMode, 'alchemy');
    const brews = recipes.getRecipes({ craftingSystemId: DEMO_SYSTEM_IDS.STILL });
    assert.deepEqual(
      brews.map((recipe) => recipe.id).toSorted((a, b) => a.localeCompare(b)),
      ['hm-r-fire', 'hm-r-mending', 'hm-r-stoneskin']
    );
  } finally {
    shim.restore();
  }
});
