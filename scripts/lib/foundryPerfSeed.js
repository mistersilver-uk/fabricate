/**
 * Turning an issue-1071 scale fixture into the smallest number of Foundry writes that can produce
 * it (issue 1073).
 *
 * ## The whole point: seeding must not be the thing being measured
 *
 * `RecipeManager.createRecipe()` calls `save()`, and `save()` serializes and replicates the WHOLE
 * `recipes` world setting. Seeding 10,000 recipes through the public API is therefore 10,000
 * whole-corpus saves — quadratic, hours long, and a measurement of the defect rather than a setup
 * for measuring it. So the corpus is written as two setting payloads, and the writes are COUNTED
 * (`SEED_WRITE_BUDGET`) so "bounded" is a checked property rather than a claim in a comment.
 *
 * Three writes, independent of N:
 *   1. `fabricate.craftingSystems` — one array, one `game.settings.set`.
 *   2. `fabricate.recipes` — one array, one `game.settings.set`.
 *   3. `Actor.createDocuments([...])` — every seeded actor, with its held items nested in its own
 *      creation data, so the embedded items ride along instead of costing a call per actor.
 *
 * ## Why the inventory needs a translation layer at all
 *
 * Issue 1071's held-inventory generator emits TEST DOUBLES: plain objects carrying a `getFlag`
 * FUNCTION and a `_stats` bag, shaped for the headless resolvers. Foundry will not accept those as
 * document creation data — a function is not serializable and the double's shape is not the Item
 * schema. Translating here rather than teaching the generator about Foundry is what keeps ONE
 * fixture definition feeding both layers, which is the comparability the whole programme rests on.
 *
 * ## And why the translation must be checked at runtime, not trusted
 *
 * `_stats.compendiumSource` is a CORE-MANAGED field. Foundry sets it on import and may ignore or
 * overwrite a value supplied to `create`. If it does, every `sourceRef` stack in the fixture
 * silently becomes an `unmatched` one — the profile still runs, still prints numbers, and is
 * measuring a different inventory composition than the one it reports. No test double can catch
 * that: a fake never refuses a write. So {@link seedFidelityProbe} returns the census the runner
 * takes against the REAL created documents, and the mix it finds is recorded as a class-1 value
 * beside the mix that was requested.
 */

/** The Foundry settings namespace Fabricate registers under. Mirrors `src/config/settings.js`. */
export const FABRICATE_NAMESPACE = 'fabricate';

/** The two world settings that hold the whole crafting corpus. Mirrors `SETTING_KEYS`. */
export const CORPUS_SETTING_KEYS = Object.freeze({
  CRAFTING_SYSTEMS: 'craftingSystems',
  RECIPES: 'recipes',
});

/**
 * The write budget the seeder must not exceed, whatever the fixture size.
 *
 * Asserted by `tests/foundry-perf-profile.test.js` at two fixture sizes three orders of magnitude
 * apart. That is the acceptance criterion "seeds by direct settings payload write, not by per-record
 * API calls" turned into something that can fail.
 */
export const SEED_WRITE_BUDGET = Object.freeze({
  settingWrites: 2,
  actorCreateCalls: 1,
});

/**
 * The module path the scale fixtures live at, relative to the repository root.
 *
 * Named here rather than inlined at the import site so the failure message and the import cannot
 * disagree about what is missing.
 */
export const SCALE_FIXTURE_MODULE = 'tests/helpers/scale/scaleProfiles.js';

/**
 * The default item type seeded stacks are created as.
 *
 * `loot` exists in dnd5e (the game system both smoke arms pin) and carries `system.quantity`, which
 * is what Fabricate's stack-quantity accessor reads. Overridable, and RECORDED on the seed result,
 * because a run against a different game system measures a different item schema and a reader must
 * be able to see which one produced the numbers.
 */
export const DEFAULT_SEED_ITEM_TYPE = 'loot';

/**
 * Load issue 1071's scale-fixture builder.
 *
 * Dynamic, and deliberately NOT a static import. This module ships in the same repository as the
 * fixtures but not necessarily in the same commit: issue 1071 is the wave-1 lane and this is wave 2,
 * so a checkout can legitimately have one and not the other. A static import would turn that into an
 * unresolved-specifier crash at load time, which reads as a broken harness rather than as a missing
 * dependency; this reports the dependency by issue number and by path.
 *
 * @param {object} [options]
 * @param {(specifier: string) => Promise<object>} [options.importModule] Injected by tests.
 * @param {string} [options.specifier] The module specifier to load.
 * @returns {Promise<object>} The `scaleProfiles` module namespace.
 */
export async function loadScaleFixtureModule({
  importModule = (specifier) => import(specifier),
  specifier = `../../${SCALE_FIXTURE_MODULE}`,
} = {}) {
  try {
    return await importModule(specifier);
  } catch (error) {
    throw new Error(
      `The Foundry perf profile seeds issue 1071's scale fixtures and could not load ` +
        `${SCALE_FIXTURE_MODULE}. That file is issue 1071's deliverable; this checkout does not ` +
        `have it. Land or rebase onto issue 1071 before running the perf profile — do NOT add a ` +
        `second fixture generator, because two generators make the Foundry and headless numbers ` +
        `incomparable, which is the only reason to run both.`,
      { cause: error }
    );
  }
}

/**
 * The module the host half of the run envelope comes from. Also issue 1071's.
 *
 * Relative to THIS module, and held in a constant rather than written as a literal at the `import()`
 * call, because it legitimately may not exist in a checkout that has only this lane — and a literal
 * specifier is what a static-analysis lint rule resolves and refuses.
 */
export const HOST_ENVELOPE_MODULE = './benchmarkEnvelope.js';

/**
 * Load issue 1071's run-envelope capture.
 *
 * Same reasoning as {@link loadScaleFixtureModule}, and the same failure message shape: the host
 * envelope (commit, branch, dirty flag, Node/V8, OS, arch, CPU, memory) is already derived there, and
 * a second implementation here would be a second thing to keep true.
 *
 * @param {object} [options]
 * @param {(specifier: string) => Promise<object>} [options.importModule] Injected by tests.
 * @param {string} [options.specifier]
 * @returns {Promise<object>}
 */
export async function loadHostEnvelopeModule({
  importModule = (specifier) => import(specifier),
  specifier = HOST_ENVELOPE_MODULE,
} = {}) {
  try {
    return await importModule(specifier);
  } catch (error) {
    throw new Error(
      `The Foundry perf run record reuses issue 1071's run envelope and could not load ` +
        `scripts/lib/benchmarkEnvelope.js. Land or rebase onto issue 1071 before running the perf ` +
        `profile.`,
      { cause: error }
    );
  }
}

/**
 * Strip keys whose value is `undefined`.
 *
 * The fixture doubles carry `{roles, componentId, essences}` with the unused ones `undefined`.
 * `JSON.stringify` would drop them, but this payload goes to `Document.create` through Foundry's own
 * merge helpers, which treat a present-but-undefined key differently from an absent one.
 *
 * @param {Record<string, unknown>} source
 * @returns {Record<string, unknown>}
 */
function definedEntries(source) {
  return Object.fromEntries(
    Object.entries(source ?? {}).filter(([, value]) => value !== undefined)
  );
}

/**
 * Translate one held-stack double into Foundry Item creation data.
 *
 * @param {object} stack A stack from issue 1071's `buildHeldInventory`.
 * @param {{itemType: string, quantityPath: string}} options
 * @returns {object}
 */
export function toItemCreateData(stack, { itemType, quantityPath }) {
  const fabricateFlags = definedEntries(stack?.flags?.fabricate);
  const compendiumSource = stack?._stats?.compendiumSource;

  const created = {
    name: String(stack?.name ?? 'Unnamed Stack'),
    type: itemType,
    system: { [quantityPath]: stack?.system?.quantity ?? 1 },
  };
  if (Object.keys(fabricateFlags).length > 0) {
    created.flags = { [FABRICATE_NAMESPACE]: fabricateFlags };
  }
  if (compendiumSource !== undefined) {
    // Supplied, and then VERIFIED after creation — see `seedFidelityProbe`. Core owns `_stats`, so
    // this is a request, not a guarantee.
    created._stats = { compendiumSource };
  }
  return created;
}

/**
 * Translate one fixture actor into Foundry Actor creation data with its items nested.
 *
 * @param {object} actor
 * @param {{itemType: string, quantityPath: string, actorType: string}} options
 * @returns {object}
 */
export function toActorCreateData(actor, { itemType, quantityPath, actorType }) {
  const learnedRecipes = actor?.flags?.fabricate?.learnedRecipes;
  const created = {
    name: String(actor?.name ?? 'Perf Actor'),
    type: actorType,
    items: (actor?.items ?? []).map((stack) => toItemCreateData(stack, { itemType, quantityPath })),
  };
  if (learnedRecipes && Object.keys(learnedRecipes).length > 0) {
    created.flags = { [FABRICATE_NAMESPACE]: { learnedRecipes } };
  }
  return created;
}

/**
 * Count the composition of the requested inventory, by identity tier.
 *
 * Recomputed from the TRANSLATED payloads rather than copied from the fixture's own `mix`, so a
 * translation bug that dropped every flag shows up here as a mix that does not match the fixture's
 * declared one — instead of being masked by the fixture restating what it intended.
 *
 * @param {object[]} actorPayloads
 * @param {string} systemId
 * @returns {{stacks: number, durable: number, sourceRef: number, unmatched: number}}
 */
export function censusRequestedMix(actorPayloads, systemId) {
  const census = { stacks: 0, durable: 0, sourceRef: 0, unmatched: 0 };
  for (const actor of actorPayloads) {
    for (const item of actor.items ?? []) {
      census.stacks += 1;
      const durable = Boolean(item?.flags?.[FABRICATE_NAMESPACE]?.roles?.[systemId]?.componentId);
      const sourceRef = item?._stats?.compendiumSource !== undefined;
      if (durable) census.durable += 1;
      else if (sourceRef) census.sourceRef += 1;
      else census.unmatched += 1;
    }
  }
  return census;
}

/**
 * Build the complete seed for one scale fixture: two setting payloads and one actor batch.
 *
 * @param {object} fixture A fixture from issue 1071's `buildScaleFixture`.
 * @param {object} [options]
 * @param {string} [options.itemType]
 * @param {string} [options.actorType]
 * @param {string} [options.quantityPath] The game system's stack-quantity field.
 * @param {number} [options.inventoryPoint] Which point of a multi-point inventory series to seed.
 * @returns {{
 *   settings: Array<{namespace: string, key: string, value: unknown}>,
 *   actors: object[],
 *   writes: {settingWrites: number, actorCreateCalls: number},
 *   invariant: object
 * }}
 */
export function buildFoundrySeed(fixture, options = {}) {
  const itemType = options.itemType ?? DEFAULT_SEED_ITEM_TYPE;
  const actorType = options.actorType ?? 'character';
  const quantityPath = options.quantityPath ?? 'quantity';

  const systems = [fixture.system];
  const recipes = [...(fixture.recipes ?? [])];

  // THE INVENTORY AXIS IS A SERIES, AND A DEFAULT THAT SEEDS ONLY ITS FIRST POINT IS A TRAP.
  // `held-inventory` carries `inventorySeries` — 100 / 500 / 1,000 held stacks against the SAME
  // 5,000-component library — while `inventory` is just its first entry. Seeding `inventory`
  // unconditionally would have run the whole Foundry profile at 100 stacks while its report said
  // `held-inventory`, i.e. measured the cheapest point of the axis and named it after the axis. The
  // chosen point is recorded on the seed so a reader never has to infer which one produced a number.
  const series = fixture.inventorySeries ?? null;
  const inventoryPoint = Number.isInteger(options.inventoryPoint) ? options.inventoryPoint : 0;
  const inventory = series ? (series[inventoryPoint] ?? series.at(-1)) : fixture.inventory;
  const fixtureActors = inventory?.actors ?? [];
  const actors = fixtureActors.map((actor) =>
    toActorCreateData(actor, { itemType, quantityPath, actorType })
  );

  const settings = [
    {
      namespace: FABRICATE_NAMESPACE,
      key: CORPUS_SETTING_KEYS.CRAFTING_SYSTEMS,
      value: systems,
    },
    { namespace: FABRICATE_NAMESPACE, key: CORPUS_SETTING_KEYS.RECIPES, value: recipes },
  ];

  return {
    settings,
    actors,
    // Constant by construction: one write per setting, one batched actor create. Not derived from
    // the fixture size anywhere, which is exactly what the budget test proves.
    writes: {
      settingWrites: settings.length,
      actorCreateCalls: actors.length > 0 ? 1 : 0,
    },
    invariant: {
      fixtureProfile: fixture.profile ?? null,
      fixtureSeed: fixture.seed ?? null,
      harnessVersion: fixture.harnessVersion ?? null,
      systemId: fixture.system?.id ?? null,
      systems: systems.length,
      recipes: recipes.length,
      components: fixture.components?.length ?? 0,
      tools: fixture.tools?.length ?? 0,
      actors: actors.length,
      itemType,
      actorType,
      quantityPath,
      requestedMix: censusRequestedMix(actors, fixture.system?.id ?? ''),
      declaredMix: inventory?.mix ?? null,
      inventorySeriesLength: series?.length ?? 1,
      inventoryPoint: series ? inventoryPoint : null,
      // The setting payloads at rest. This is the write-amplification number the whole programme
      // argues from, and it needs no clock to be believed.
      payloadBytes: {
        craftingSystems: JSON.stringify(systems).length,
        recipes: JSON.stringify(recipes).length,
      },
    },
  };
}

/**
 * The census the runner takes against the CREATED documents, to confirm Foundry kept what the seed
 * asked for.
 *
 * Returned as data rather than run here because this module never touches a browser. The runner
 * evaluates {@link seedFidelityProbe}'s `expression` in the page and compares the result to
 * `expected`.
 *
 * @param {object} seed The result of {@link buildFoundrySeed}.
 * @returns {{expected: object, describe: (actual: object) => {matches: boolean, drift: string[]}}}
 */
export function seedFidelityProbe(seed) {
  const expected = {
    actors: seed.invariant.actors,
    stacks: seed.invariant.requestedMix.stacks,
    durable: seed.invariant.requestedMix.durable,
    sourceRef: seed.invariant.requestedMix.sourceRef,
  };

  return {
    expected,
    describe(actual) {
      const drift = [];
      for (const [field, want] of Object.entries(expected)) {
        const got = actual?.[field];
        if (got !== want) drift.push(`${field}: requested ${want}, Foundry kept ${got ?? 0}`);
      }
      return { matches: drift.length === 0, drift };
    },
  };
}
