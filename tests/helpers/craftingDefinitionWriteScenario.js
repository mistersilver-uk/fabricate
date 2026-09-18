/**
 * A scripted, non-trivial corpus mutation run over the two crafting managers, which observes three
 * independent things about every `game.settings` write it provokes (issue 1089).
 */

/** Setting keys, inlined so the helper runs against a bare `src` export of any tree. */
const RECIPES_KEY = 'recipes';
const CRAFTING_SYSTEMS_KEY = 'craftingSystems';

/** The frozen wall clock for the run. */
const FROZEN_NOW = 1_760_000_000_000;

/**
 * Deterministic id generator. The managers call `foundry.utils.randomID()` for generated ids, and a
 * random one would make the run unreproducible.
 */
function makeIdSequence() {
  let seq = 0;
  return {
    next: () => {
      seq += 1;
      return `gen${String(seq).padStart(4, '0')}`;
    },
  };
}

/**
 * Install the Foundry globals the two managers read, with a settings store that records the shape
 * of every write and checks its payload against the pre-seam expression as it happens.
 */
function installRecordingFoundryEnv() {
  const settings = new Map();
  const writes = [];
  const differentialFailures = [];
  const ids = makeIdSequence();
  const realNow = Date.now;
  Date.now = () => FROZEN_NOW;

  /** Bound after the managers exist; until then no payload check is possible. */
  let managers = null;

  /**
   * The expression the PRE-SEAM managers used to build their payload, verbatim:
   * `RecipeManager.save()` was `[...this.recipes.values()].map((r) => r.toJSON())` and
   * `CraftingSystemManager.save()` was `[...this.systems.values()]`.
   *
   * @returns {string|null} serialized expected payload, or `null` when uncheckable.
   */
  function expectedPayload(key) {
    if (!managers) return null;
    if (key === RECIPES_KEY) {
      return JSON.stringify([...managers.recipeManager.recipes.values()].map((r) => r.toJSON()));
    }
    if (key === CRAFTING_SYSTEMS_KEY) {
      return JSON.stringify([...managers.systemManager.systems.values()]);
    }
    return null;
  }

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
    user: { isGM: true, name: 'Scenario GM' },
    users: { activeGM: { id: 'gm-1' } },
    actors: [],
    packs: [],
    fabricate: {},
    settings: {
      get: (_namespace, key) => settings.get(key),
      set: async (_namespace, key, value) => {
        const index = writes.length;
        const expected = expectedPayload(key);
        const written = JSON.stringify(value);
        writes.push({ index, key, checked: expected !== null });
        if (expected !== null && expected !== written) {
          differentialFailures.push({ index, key, expected, written });
        }
        settings.set(key, value);
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
    differentialFailures,
    bindManagers: (bound) => {
      managers = bound;
    },
    restore: () => {
      Date.now = realNow;
    },
  };
}

/**
 * One complete ingredient/result shape, so the recipe passes the persistence completeness contract
 * rather than being accepted as an incomplete shell.
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
 * Run the scenario.
 *
 * @returns {Promise<object>} the run's observations; see {@link executeScenario}.
 */
export async function runCraftingDefinitionWriteScenario({ RecipeManager, CraftingSystemManager }) {
  const env = installRecordingFoundryEnv();
  try {
    return await executeScenario(env, { RecipeManager, CraftingSystemManager });
  } finally {
    env.restore();
  }
}

/** The scripted mutation run itself, separated so the frozen clock is always restored. */
async function executeScenario(env, { RecipeManager, CraftingSystemManager }) {
  const steps = [];
  const recipeManager = new RecipeManager();
  const systemManager = new CraftingSystemManager(recipeManager);
  env.bindManagers({ recipeManager, systemManager });

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

  // Batch shape: the compendium-importer idiom — per-record in-memory mutation with persistence
  // deferred to one write.
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

  const roundTrip = captureRoundTrip(env, { recipeManager, systemManager });
  steps.push('roundTrip');

  return {
    steps,
    writes: env.writes.map(({ index, key }) => ({ index, key })),
    writeCount: env.writes.length,
    differential: {
      checked: env.writes.filter((write) => write.checked).length,
      total: env.writes.length,
      failures: env.differentialFailures,
    },
    roundTrip,
  };
}

/**
 * Re-hydrate the persisted corpus and re-serialize it, so a key that storage carries but a round
 * trip cannot reproduce is visible.
 */
function captureRoundTrip(env, { recipeManager, systemManager }) {
  const persistedRecipes = env.settings.get(RECIPES_KEY) ?? [];
  const persistedSystems = env.settings.get(CRAFTING_SYSTEMS_KEY) ?? [];

  const recipesReportedChange = recipeManager.reload();
  const systemsReportedChange = systemManager.reload();

  return {
    recipes: {
      reportedChange: recipesReportedChange,
      persisted: asPersistedForm(persistedRecipes),
      reserialized: asPersistedForm(
        [...recipeManager.recipes.values()].map((recipe) => recipe.toJSON())
      ),
    },
    craftingSystems: {
      reportedChange: systemsReportedChange,
      persisted: asPersistedForm(persistedSystems),
      // Systems are persisted as-is (the repository's serializer is identity), so the
      // re-serialized form is the hydrated map itself.
      reserialized: asPersistedForm([...systemManager.systems.values()]),
    },
  };
}

/** Project a corpus to the form that actually reaches storage. */
function asPersistedForm(corpus) {
  return JSON.parse(JSON.stringify(corpus));
}

/**
 * Reduce a run to the checked-in write-SHAPE golden: how many writes, in what order, against which
 * setting key. Deliberately excludes every byte of payload. This fixture is meant to be brittle.
 *
 * @returns {{ steps: string[], writeCount: number, writes: Array<{index: number, key: string}> }}
 */
export function summarizeWriteShape(run) {
  return {
    steps: run.steps,
    writeCount: run.writeCount,
    writes: run.writes,
  };
}
