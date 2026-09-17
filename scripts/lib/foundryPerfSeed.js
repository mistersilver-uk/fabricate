/**
 * Turning an issue-1071 scale fixture into the smallest number of Foundry writes that can produce
 * it (issue 1073).
 */

/** The Foundry settings namespace Fabricate registers under. Mirrors `src/config/settings.js`. */
export const FABRICATE_NAMESPACE = 'fabricate';

/** The two world settings that hold the whole crafting corpus. Mirrors `SETTING_KEYS`. */
export const CORPUS_SETTING_KEYS = Object.freeze({
  CRAFTING_SYSTEMS: 'craftingSystems',
  RECIPES: 'recipes',
});

/** The write budget the seeder must not exceed, whatever the fixture size. */
export const SEED_WRITE_BUDGET = Object.freeze({
  settingWrites: 2,
  actorCreateCalls: 1,
});

/** The module path the scale fixtures live at, relative to the repository root. */
export const SCALE_FIXTURE_MODULE = 'tests/helpers/scale/scaleProfiles.js';

/** The default item type seeded stacks are created as. */
export const DEFAULT_SEED_ITEM_TYPE = 'loot';

/** Load issue 1071's scale-fixture builder. */
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

/** The module the host half of the run envelope comes from. Also issue 1071's. */
export const HOST_ENVELOPE_MODULE = './benchmarkEnvelope.js';

/** Load issue 1071's run-envelope capture. */
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

/** Strip keys whose value is `undefined`. */
function definedEntries(source) {
  return Object.fromEntries(
    Object.entries(source ?? {}).filter(([, value]) => value !== undefined)
  );
}

/** Translate one held-stack double into Foundry Item creation data. */
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

/** Translate one fixture actor into Foundry Actor creation data with its items nested. */
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

/** Count the composition of the requested inventory, by identity tier. */
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

/** Build the complete seed for one scale fixture: two setting payloads and one actor batch. */
export function buildFoundrySeed(fixture, options = {}) {
  const itemType = options.itemType ?? DEFAULT_SEED_ITEM_TYPE;
  const actorType = options.actorType ?? 'character';
  const quantityPath = options.quantityPath ?? 'quantity';

  const systems = [fixture.system];
  const recipes = [...(fixture.recipes ?? [])];

  // The inventory axis is A series, and A default that seeds only its first point is A trap.
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
 * The census the runner takes against the created documents, to confirm Foundry kept what the seed
 * asked for.
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
