/**
 * The hero-demo world (issue 2571) is internally consistent, and every image it names is a Foundry
 * core icon the harvested cache serves. The icon half skips without a harvest, as the lab's own does.
 */
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { resolveChromeCache } from '../scripts/lib/foundryChromeCache.js';

import { buildDemoContent, DEMO_ACTORS } from './view-lab/demo/demoContent.js';
import { buildCastActors } from './view-lab/world/labActors.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MOUNT = '/@foundry-chrome/';
const cache = resolveChromeCache(ROOT);
const skip = cache ? false : 'no harvested Foundry chrome; run: npm run viewlab:chrome:harvest';

const content = buildDemoContent();

/** Every string under `node` that names a mounted asset; actors and items cycle through `parent`. */
function assetPaths(node, found = new Set(), seen = new Set()) {
  if (typeof node === 'string') {
    if (node.startsWith(MOUNT)) found.add(node);
  } else if (node && typeof node === 'object' && !seen.has(node)) {
    seen.add(node);
    for (const value of Object.values(node)) assetPaths(value, found, seen);
  }
  return found;
}

/** Every `componentId` an ingredient option, result or failure result names. */
function componentRefs(recipe) {
  const options = recipe.ingredientSets
    .flatMap((set) => set.ingredientGroups)
    .flatMap((group) => group.options);
  const results = recipe.resultGroups.flatMap((group) => group.results);
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

test('every demo image is a core icon present in the harvested cache', { skip }, () => {
  const paths = assetPaths([content, buildCastActors(content, DEMO_ACTORS)]);
  assert.ok(paths.size >= 23, `expected the demo world to name its icons, found ${paths.size}`);
  const missing = [...paths].filter((path) => {
    assert.ok(path.startsWith(`${MOUNT}icons/`), `${path} is not a Foundry core icon`);
    return !existsSync(join(cache.dir, path.slice(MOUNT.length)));
  });
  assert.deepEqual(missing, [], 'a demo icon 404s in the browser');
});
