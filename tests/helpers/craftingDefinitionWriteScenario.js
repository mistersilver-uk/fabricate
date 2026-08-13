/**
 * A scripted, non-trivial corpus mutation run over the two crafting managers, which
 * observes three independent things about every `game.settings` write it provokes.
 *
 * This exists to prove ONE claim about issue 1089: routing `RecipeManager` and
 * `CraftingSystemManager` through a `CraftingDefinitionRepository` changed nothing.
 * The existing manager suites cannot show that — they assert on the in-memory
 * managers, not on the bytes that reach storage.
 *
 * ## Why this is not one big recorded snapshot any more
 *
 * It was, and the snapshot had to be re-recorded three times in a fortnight for
 * changes that had nothing to do with the seam: #1131 added `failureResultPolicy` to
 * three check normalizers, and #1136 retired the flat `results` alias and every
 * rebuildable default from the recipe payload. Both legitimately moved the bytes.
 *
 * That is not a tolerable cost, and the reason is not the re-recording effort. A
 * fixture that cries wolf repeatedly teaches its reviewer to regenerate it on sight,
 * and the failure after that is the real one. So the snapshot was split along the line
 * that actually separates the seam's concerns from everyone else's:
 *
 * | Part | Mechanism | Moves when |
 * |---|---|---|
 * | Write SHAPE — count, order, target key | checked-in golden | write counts change (rare, and always deliberate) |
 * | Write PAYLOAD — the bytes | live differential, recomputed each run | never; both legs move together |
 * | Round-TRIP — hydrate/re-serialize | assertion | never |
 *
 * The seam owns write shape. It does NOT own payload content — it never constructs a
 * payload, it delegates entirely to `Recipe.toJSON()` and the system normalizers. Only
 * that second dimension was generating the noise, so only that one stopped being a
 * snapshot.
 *
 * The scenario drives PUBLIC manager APIs only, so the same driver runs unchanged
 * against a pre-seam tree — which is how the write-shape golden is recorded, and the
 * only way that fixture can honestly claim the seam did not change the write count.
 * On a pre-seam tree the differential compares an expression against itself and is
 * trivially true; that is correct, because there is no seam there to test.
 *
 * This file is deliberately NOT named `*.test.js`: `tests/helpers/` sits outside the
 * `npm test` glob, so nothing here is collected as a suite. It is exercised from
 * inside the glob by `tests/crafting-definition-persistence-equivalence.test.js`.
 */

/** Setting keys, inlined so the helper runs against a bare `src` export of any tree. */
const RECIPES_KEY = 'recipes';
const CRAFTING_SYSTEMS_KEY = 'craftingSystems';

/**
 * The frozen wall clock for the run. `Recipe.toJSON()` stamps `metadata.created` and
 * `metadata.modified` from `Date.now()`; an unfrozen clock makes two runs differ at an
 * identical byte length, which reads exactly like a real regression and is not one.
 */
const FROZEN_NOW = 1_760_000_000_000;

/**
 * Deterministic id generator. The managers call `foundry.utils.randomID()` for
 * generated ids, and a random one would make the run unreproducible.
 *
 * @returns {{ next: () => string }}
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
 * Install the Foundry globals the two managers read, with a settings store that
 * records the shape of every write and checks its payload against the pre-seam
 * expression as it happens.
 *
 * Deliberately a GM client: every scenario step is a GM-only mutation, and the point
 * of the run is the write behaviour, not the permission gate (which
 * `tests/helpers/settings.js` covers).
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
   * Recomputed from the LIVE maps at the moment of each write, which is what makes
   * this a differential rather than a snapshot: a payload change in the model layer
   * moves this leg and the adapter's leg identically, while any divergence introduced
   * by the seam moves only one.
   *
   * @param {string} key
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
 * Run the scenario.
 *
 * @param {object} modules
 * @param {new (...args: any[]) => any} modules.RecipeManager
 * @param {new (...args: any[]) => any} modules.CraftingSystemManager
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

/**
 * The scripted mutation run itself, separated so the frozen clock is always restored.
 *
 * The step list is deliberately varied: single-record creates, single-record updates,
 * a single-record delete, in-place library edits that persist through the owning
 * system record, a batched multi-recipe rewrite, and a cascading system delete. Those
 * are exactly the shapes the seam had to preserve, and each reaches persistence by a
 * different route.
 */
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
 * Re-hydrate the persisted corpus and re-serialize it, so a key that storage carries
 * but a round trip cannot reproduce is visible.
 *
 * This is the check that actually defends against a whitelist rebuild: every
 * normalizer in `CraftingSystemManager` emits an explicit key set, so a key it stops
 * emitting is dropped from storage on the next save. Unlike a byte snapshot it is
 * invariant to any legitimate payload change — #1136 could retire two thirds of the
 * recipe payload and this still holds, because it compares the corpus against itself
 * through a hydrate/serialize cycle rather than against remembered bytes.
 *
 * `reload()` is used as the hydrator because it is the managers' own read path, so
 * this exercises production code rather than a re-implementation of it. Its boolean
 * return is a second, independent signal: `false` means the persisted bytes rehydrate
 * to the identical in-memory corpus.
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

/**
 * Project a corpus to the form that actually reaches storage.
 *
 * `setSetting` is handed live object references and Foundry persists them as JSON, so
 * a key whose value is literally `undefined` exists in memory and does NOT exist in
 * storage — `_normalizeSystem` emits `originItemUuid: undefined` on an essence with no
 * source, for one. Comparing the in-memory shapes would report that as a round-trip
 * failure on every run.
 *
 * This does not soften the check. JSON only elides keys that are `undefined`, so a key
 * carrying any real value survives on both sides and a genuine drop still fails.
 *
 * @param {unknown} corpus
 * @returns {unknown}
 */
function asPersistedForm(corpus) {
  return JSON.parse(JSON.stringify(corpus));
}

/**
 * Reduce a run to the checked-in write-SHAPE golden: how many writes, in what order,
 * against which setting key. Deliberately excludes every byte of payload.
 *
 * This fixture is meant to be brittle. A PR that changes write counts SHOULD turn it
 * red and update it deliberately — that is the write-amplification guarantee #1080
 * must improve on and #1139 already moved once.
 *
 * @param {object} run
 * @returns {{ steps: string[], writeCount: number, writes: Array<{index: number, key: string}> }}
 */
export function summarizeWriteShape(run) {
  return {
    steps: run.steps,
    writeCount: run.writeCount,
    writes: run.writes,
  };
}
