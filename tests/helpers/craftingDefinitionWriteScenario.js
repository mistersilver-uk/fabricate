/**
 * A scripted, non-trivial corpus mutation run over the two crafting managers, with
 * every `game.settings` write recorded in order.
 *
 * This exists to prove ONE thing about issue 1089: routing `RecipeManager` and
 * `CraftingSystemManager` through a `CraftingDefinitionRepository` changed neither
 * the number of persistence writes, nor their order, nor a single byte of what was
 * written. The seam is only worth landing before the persistence ADR if it is
 * provably invisible, and "the suites still pass" does not prove that — most of them
 * assert on the in-memory managers, not on the serialized corpus.
 *
 * The scenario drives PUBLIC manager APIs only, so the same driver runs unchanged
 * against the pre-seam tree and the post-seam tree. Its recorded output is checked in
 * as a golden (`tests/fixtures/craftingDefinitionWriteLog.golden.json`), generated
 * from the base commit BEFORE the seam existed.
 *
 * This file is deliberately NOT named `*.test.js`: `tests/helpers/` sits outside the
 * `npm test` glob, so nothing here is collected as a suite. It is exercised from
 * inside the glob by `tests/crafting-definition-repository.test.js`.
 */

import { createHash } from 'node:crypto';

/**
 * Deterministic id generator. The managers call `foundry.utils.randomID()` for
 * generated ids, and a random one would make the golden unreproducible.
 *
 * @returns {{ next: () => string, reset: () => void }}
 */
function makeIdSequence() {
  let seq = 0;
  return {
    next: () => {
      seq += 1;
      return `gen${String(seq).padStart(4, '0')}`;
    },
    reset: () => {
      seq = 0;
    },
  };
}

/**
 * The frozen wall clock for the run. `Recipe.toJSON()` stamps `metadata.created` and
 * `metadata.modified` from `Date.now()`, so an unfrozen clock makes every recipe
 * write differ from the last run at the same byte length — which reads exactly like a
 * real regression and is not one.
 */
const FROZEN_NOW = 1_760_000_000_000;

/**
 * Install the Foundry globals the two managers read, with a settings store that
 * records every write in order.
 *
 * Deliberately a GM client: every scenario step is a GM-only mutation, and the point
 * of the run is the write log, not the permission gate (which
 * `tests/helpers/settings.js` covers).
 *
 * @returns {{
 *   settings: Map<string, unknown>,
 *   writes: Array<{ key: string, value: unknown }>,
 *   restore: () => void,
 * }}
 */
function installRecordingFoundryEnv() {
  const settings = new Map();
  const writes = [];
  const ids = makeIdSequence();
  const realNow = Date.now;
  Date.now = () => FROZEN_NOW;

  globalThis.foundry = {
    utils: {
      randomID: () => ids.next(),
      getProperty: (object, path) =>
        String(path ?? '')
          .split('.')
          .reduce((value, key) => (value == null ? undefined : value[key]), object),
      duplicate: (value) => JSON.parse(JSON.stringify(value)),
    },
  };

  globalThis.game = {
    user: { isGM: true, name: 'Golden GM' },
    users: { activeGM: { id: 'gm-1' } },
    actors: [],
    packs: [],
    fabricate: {},
    settings: {
      get: (_namespace, key) => settings.get(key),
      set: async (_namespace, key, value) => {
        settings.set(key, value);
        // Snapshot at write time. The managers hand `setSetting` live object
        // references, so a later in-place mutation would otherwise rewrite history
        // and make an unequal run look equal.
        writes.push({ key, value: JSON.parse(JSON.stringify(value)) });
        return value;
      },
    },
  };

  globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };
  globalThis.fromUuid = async () => null;
  globalThis.fromUuidSync = () => null;

  return {
    settings,
    writes,
    restore: () => {
      Date.now = realNow;
    },
  };
}

/**
 * One complete ingredient/result shape, so the recipe passes the persistence
 * completeness contract rather than being accepted as an incomplete shell.
 *
 * @param {string} suffix
 * @param {string} componentUuid
 * @returns {object}
 */
function ingredientAndResults(suffix, componentUuid) {
  return {
    ingredientSets: [
      {
        id: `set-${suffix}`,
        ingredientGroups: [
          {
            id: `group-${suffix}`,
            name: 'Ingredients',
            options: [{ id: `opt-${suffix}`, itemUuid: componentUuid, quantity: 2 }],
          },
        ],
        essences: {},
      },
    ],
    resultGroups: [
      {
        id: `results-${suffix}`,
        results: [{ id: `result-${suffix}`, itemUuid: `Item.output-${suffix}`, quantity: 1 }],
      },
    ],
  };
}

/**
 * Run the scenario and return the ordered write log.
 *
 * The step list is deliberately varied: single-record creates, single-record updates,
 * a single-record delete, in-place library edits that persist through the owning
 * system record, a batched multi-recipe rewrite, and a cascading system delete. Those
 * are exactly the five shapes the seam had to preserve, and each of them reaches
 * `save()` by a different route in the pre-seam code.
 *
 * @param {object} modules
 * @param {new (...args: any[]) => any} modules.RecipeManager
 * @param {new (...args: any[]) => any} modules.CraftingSystemManager
 * @returns {Promise<{
 *   writes: Array<{ key: string, value: unknown }>,
 *   steps: string[],
 *   finalCorpus: Record<string, unknown>,
 * }>}
 */
export async function runCraftingDefinitionWriteScenario({ RecipeManager, CraftingSystemManager }) {
  const env = installRecordingFoundryEnv();
  try {
    return await executeScenario(env, { RecipeManager, CraftingSystemManager });
  } finally {
    env.restore();
  }
}

/**
 * The scripted mutation run itself, separated so the frozen clock is always restored.
 *
 * @param {{ settings: Map<string, unknown>, writes: Array<{ key: string, value: unknown }> }} env
 * @param {{ RecipeManager: any, CraftingSystemManager: any }} modules
 * @returns {Promise<{ writes: any[], steps: string[], finalCorpus: Record<string, unknown> }>}
 */
async function executeScenario(env, { RecipeManager, CraftingSystemManager }) {
  const steps = [];
  const recipeManager = new RecipeManager();
  const systemManager = new CraftingSystemManager(recipeManager);

  await recipeManager.initialize();
  await systemManager.initialize();
  steps.push('initialize');

  await systemManager.createSystem({ id: 'alpha', name: 'Alpha Forge', enabled: true });
  steps.push('createSystem:alpha');

  await systemManager.createSystem({ id: 'beta', name: 'Beta Still', enabled: true });
  steps.push('createSystem:beta');

  await systemManager.updateSystem('alpha', {
    description: 'The primary forge.',
    essenceDefinitions: [
      { id: 'fire', name: 'Fire', description: 'Heat', iconCode: 'fa-fire' },
      { id: 'earth', name: 'Earth', description: 'Stone', iconCode: 'fa-mountain' },
    ],
  });
  steps.push('updateSystem:alpha:essences');

  for (const [index, name] of ['Iron Ore', 'Charcoal', 'Quenching Oil'].entries()) {
    await systemManager.createItem('alpha', {
      id: `alpha-c${index}`,
      name,
      img: 'icons/svg/item-bag.svg',
      registeredItemUuid: `Item.alpha-c${index}`,
      essences: index === 0 ? { fire: 1, earth: 2 } : {},
    });
    steps.push(`createItem:alpha:${index}`);
  }

  await systemManager.createItem('beta', {
    id: 'beta-c0',
    name: 'Spring Water',
    registeredItemUuid: 'Item.beta-c0',
  });
  steps.push('createItem:beta:0');

  await systemManager.updateItem('alpha', 'alpha-c1', {
    name: 'Hardwood Charcoal',
    essences: { fire: 3 },
  });
  steps.push('updateItem:alpha:1');

  await recipeManager.createRecipe({
    id: 'recipe-blade',
    name: 'Iron Blade',
    craftingSystemId: 'alpha',
    enabled: true,
    ...ingredientAndResults('blade', 'Item.alpha-c0'),
  });
  steps.push('createRecipe:blade');

  await recipeManager.createRecipe({
    id: 'recipe-nail',
    name: 'Iron Nail',
    craftingSystemId: 'alpha',
    enabled: false,
    ...ingredientAndResults('nail', 'Item.alpha-c0'),
  });
  steps.push('createRecipe:nail');

  await recipeManager.createRecipe({
    id: 'recipe-tonic',
    name: 'Clear Tonic',
    craftingSystemId: 'beta',
    enabled: true,
    ...ingredientAndResults('tonic', 'Item.beta-c0'),
  });
  steps.push('createRecipe:tonic');

  await recipeManager.updateRecipe('recipe-nail', {
    name: 'Forged Iron Nail',
    description: 'A humble nail.',
  });
  steps.push('updateRecipe:nail');

  // Batch shape: the compendium-importer idiom — per-record in-memory mutation with
  // persistence deferred to one write. This is the `persist: false` contract the
  // repository's bulk boundary had to preserve.
  await recipeManager.createRecipe(
    {
      id: 'recipe-hinge',
      name: 'Iron Hinge',
      craftingSystemId: 'alpha',
      ...ingredientAndResults('hinge', 'Item.alpha-c0'),
    },
    { persist: false, notify: false, emitChange: false }
  );
  await recipeManager.updateRecipe(
    'recipe-tonic',
    { description: 'Batched edit.' },
    { persist: false, notify: false, emitChange: false }
  );
  await recipeManager.save();
  steps.push('batch:create+update+save');

  await recipeManager.deleteRecipe('recipe-nail', { notify: false, cleanupFlags: false });
  steps.push('deleteRecipe:nail');

  await systemManager.deleteItem('alpha', 'alpha-c2');
  steps.push('deleteItem:alpha:2');

  await systemManager.deleteEssence('alpha', 'earth');
  steps.push('deleteEssence:alpha:earth');

  await systemManager.deleteSystem('beta');
  steps.push('deleteSystem:beta');

  // Reload proves the read path round-trips what the write path produced.
  const reloadedSystems = systemManager.reload();
  const reloadedRecipes = recipeManager.reload();
  steps.push(`reload:${reloadedSystems}:${reloadedRecipes}`);

  const finalCorpus = Object.fromEntries(
    [...env.settings.entries()].sort(([a], [b]) => a.localeCompare(b))
  );

  return { writes: env.writes, steps, finalCorpus };
}

/**
 * Reduce a scenario run to the comparable golden shape.
 *
 * The per-write digest is what makes this a BYTE identity check rather than a shape
 * check: any change to a normalizer's emitted key set, to map ordering, or to a
 * serialized default moves a digest even when the corpus still "looks right".
 * `finalCorpus` is carried in full alongside it purely so a failure is diagnosable —
 * a bare digest mismatch tells you nothing about which field moved.
 *
 * @param {{ writes: Array<{ key: string, value: unknown }>, steps: string[], finalCorpus: object }} run
 * @returns {object}
 */
export function summarizeScenarioRun(run) {
  return {
    steps: run.steps,
    writeCount: run.writes.length,
    writes: run.writes.map((write, index) => {
      const json = JSON.stringify(write.value);
      return {
        index,
        key: write.key,
        bytes: json.length,
        sha256: createHash('sha256').update(json).digest('hex'),
      };
    }),
    // Round-tripped through JSON on purpose. `setSetting` is handed live object
    // references, and Foundry persists them as JSON — so a key whose value is
    // literally `undefined` is present in memory and absent in storage. Comparing the
    // in-memory shape would report that difference as a corpus change on every run.
    finalCorpus: JSON.parse(JSON.stringify(run.finalCorpus)),
  };
}
