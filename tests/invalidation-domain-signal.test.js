/**
 * The scoped crafting-data change signal, END TO END (issue 1078 part B1, under #1070).
 *
 * ## Why every case starts at a real mutation
 *
 * This programme has shipped five guards that reported a property while observing nothing, and
 * the shape they all shared is that their entry point was DOWNSTREAM of publication: build a
 * payload, hand it to the routing function, count what it called. Such a guard passes with the
 * publish call deleted, because it never needed one.
 *
 * So every case below enters through something a GM or a replicating client actually does —
 * `updateRecipe`, a `save({put, domains})`, `handleFabricateSettingChange` — and exits through
 * the shipped `subscribeCraftingDataChange`, one subscription per store carrying the shipped
 * `STORE_DOMAINS[store]`. Deleting either half of a publisher takes a counter to zero.
 *
 * ## The fallback counter is asserted, not inferred
 *
 * "The journal did not reload" is true both when routing narrowed it out and when nothing was
 * emitted at all. Every narrowing case therefore also asserts the emission count and that the
 * broad-fallback counter did not move, so the narrowing is OBSERVED rather than inferred.
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { SETTING_KEYS } from '../src/config/settings.js';

import { installCraftingDataBus } from './helpers/craftingDataChangeBus.js';
import {
  persistedRecipe,
  persistedSystem,
  Recipe,
  RecipeManager,
  remoteClient,
  REVISION_SCOPES,
  storedRecipes,
  SYS_A,
  SYS_B,
  twoSystemWorld,
  withRecipe,
  withSystem,
} from './helpers/scopedInvalidationWorld.js';

const { handleFabricateSettingChange } = await import('../src/config/settingChangeBridge.js');
const { CRAFTING_DATA_CHANGED_HOOK, craftingDataChange, PendingChangeDomains } = await import(
  '../src/systems/craftingDataChange.js'
);
const { INVALIDATION_DOMAINS } = await import('../src/systems/invalidationDomains.js');

const RECIPES_SETTING_KEY = `fabricate.${SETTING_KEYS.RECIPES}`;
const SYSTEMS_SETTING_KEY = `fabricate.${SETTING_KEYS.CRAFTING_SYSTEMS}`;

/** The scopes one emission carries, flattened for a readable assertion. */
const scopeSummary = (payload) =>
  payload.scopes.map((scope) => [scope.systemId, [...scope.domains]]);

/**
 * A world plus an attached bus, torn down after the case.
 *
 * @param {() => object} buildWorld
 * @returns {{world: object, bus: object}}
 */
function wiredWorld(buildWorld = twoSystemWorld) {
  const world = buildWorld();
  const bus = installCraftingDataBus();
  return { world, bus };
}

const openBuses = [];
after(() => {
  for (const bus of openBuses) bus.restore();
});

/** Register a bus for teardown and return it. */
function tracked(bus) {
  openBuses.push(bus);
  return bus;
}

describe('publisher 1 — a local recipe edit', () => {
  it('emits exactly ONE scoped signal per edit, from the real mutation', async () => {
    const { world, bus } = wiredWorld();
    tracked(bus);

    await world.recipeManager.updateRecipe('r-a1', { name: 'Renamed' }, { notify: false });

    assert.equal(
      bus.scopedEmissions().length,
      1,
      'one mutation, one scoped signal — delete the publish call in _notifyRecipesChanged and ' +
        'this is zero'
    );
    assert.equal(
      bus.emissionsOf('fabricate.recipesChanged').length,
      1,
      'and the published legacy hook still fires exactly once, unchanged'
    );
    assert.deepEqual(scopeSummary(bus.scopedEmissions()[0]), [[SYS_A, ['labelling']]]);
    assert.equal(bus.fallbackCount(), 0, 'nothing routed broadly');
  });

  it('routes a DESCRIPTION-ONLY edit away from the journal, from a warmed baseline', async () => {
    const { world, bus } = wiredWorld();
    tracked(bus);

    // WARM. A "must not reload" assertion against a cold fixture is `assert.equal(0, 0)` and
    // proves nothing, so the journal is made to reload first and the baseline is asserted.
    await world.recipeManager.updateRecipe('r-a1', { name: 'Warm' }, { notify: false });
    assert.ok(bus.reloads.journal > 0, 'the baseline: a labelling edit DOES reload the journal');
    const warmedJournal = bus.reloads.journal;
    bus.reset();

    await world.recipeManager.updateRecipe(
      'r-a1',
      { description: 'A longer story about this recipe.' },
      { notify: false }
    );

    assert.equal(bus.scopedEmissions().length, 1, 'the edit really did announce itself');
    assert.deepEqual(scopeSummary(bus.scopedEmissions()[0]), [[SYS_A, ['narrative']]]);
    assert.equal(
      bus.reloads.journal,
      0,
      `the journal reloaded ${warmedJournal} time(s) for a rename and must reload zero times ` +
        'for prose: RunJournalBuilder reads no description anywhere'
    );
    assert.deepEqual(bus.reloadedStores(), ['crafting', 'inventory', 'alchemy']);
    assert.equal(bus.fallbackCount(), 0, 'so the narrowing came from routing, not from a miss');
  });

  it('advances only the fact scopes the edited fields belong to', async () => {
    const { world, bus } = wiredWorld();
    tracked(bus);
    const before = {
      narrative: world.recipeManager.revision(REVISION_SCOPES.facts('narrative', SYS_A)),
      labelling: world.recipeManager.revision(REVISION_SCOPES.facts('labelling', SYS_A)),
      otherSystem: world.recipeManager.revision(REVISION_SCOPES.facts('narrative', SYS_B)),
    };

    await world.recipeManager.updateRecipe('r-a1', { description: 'Prose' }, { notify: false });

    assert.notEqual(
      world.recipeManager.revision(REVISION_SCOPES.facts('narrative', SYS_A)),
      before.narrative
    );
    assert.equal(
      world.recipeManager.revision(REVISION_SCOPES.facts('labelling', SYS_A)),
      before.labelling,
      'a consumer that reads only labels keeps its token across a prose edit'
    );
    assert.equal(
      world.recipeManager.revision(REVISION_SCOPES.facts('narrative', SYS_B)),
      before.otherSystem,
      'and system B is untouched'
    );
  });

  it('names BOTH systems when an edit moves a recipe between them', async () => {
    const { world, bus } = wiredWorld();
    tracked(bus);

    await world.recipeManager.updateRecipe(
      'r-a1',
      { craftingSystemId: SYS_B },
      { notify: false, allowIncomplete: true }
    );

    const [payload] = bus.scopedEmissions();
    assert.deepEqual(
      payload.scopes.map((scope) => scope.systemId).sort(),
      [SYS_A, SYS_B],
      'a consumer watching the system the recipe LEFT must also be told'
    );
  });
});

describe('publisher 2 — a local crafting-system mutation', () => {
  it('emits exactly ONE scoped signal, attributed from the fields the edit moved', async () => {
    const { world, bus } = wiredWorld();
    tracked(bus);

    await world.systemManager.updateSystem(SYS_A, { name: 'System A renamed' });

    assert.equal(
      bus.emissionsOf('fabricate.craftingSystemsChanged').length,
      1,
      'the premise: this mutation announces itself once'
    );
    assert.equal(bus.scopedEmissions().length, 1, 'and exactly one scoped signal rode with it');
    assert.deepEqual(scopeSummary(bus.scopedEmissions()[0]), [[SYS_A, ['labelling']]]);
    assert.deepEqual(bus.reloadedStores(), [
      'crafting',
      'inventory',
      'alchemy',
      'journal',
      'gathering',
    ]);
    assert.equal(bus.fallbackCount(), 0);
  });

  it('routes a system DESCRIPTION-ONLY edit away from the journal, from a warmed baseline', async () => {
    const { world, bus } = wiredWorld();
    tracked(bus);

    await world.systemManager.updateSystem(SYS_A, { name: 'Warm' });
    assert.ok(bus.reloads.journal > 0, 'the baseline: a rename DOES reload the journal');
    bus.reset();

    await world.systemManager.updateSystem(SYS_A, { description: 'How this system works.' });

    assert.equal(bus.scopedEmissions().length, 1);
    assert.deepEqual(scopeSummary(bus.scopedEmissions()[0]), [[SYS_A, ['narrative']]]);
    assert.deepEqual(bus.reloadedStores(), ['crafting', 'inventory', 'alchemy']);
    assert.equal(bus.fallbackCount(), 0);
  });

  it('keeps a save that deliberately does NOT announce silent, and carries its domains forward', async () => {
    // `save()` records and the NOTIFIER drains, which is what keeps the paths that save without
    // announcing (`options.notifySystems: false`, the singular component delete) as silent as
    // they were before this issue. A save that emitted directly would refresh the app on every
    // one of them.
    const { world, bus } = wiredWorld();
    tracked(bus);
    const system = world.systemManager.getSystem(SYS_A);

    await world.systemManager.save({ put: system, domains: [INVALIDATION_DOMAINS.LABELLING] });

    assert.equal(bus.scopedEmissions().length, 0, 'a save alone announces nothing');

    world.systemManager._notifySystemsChanged();

    assert.equal(bus.scopedEmissions().length, 1, 'and the next announcement carries it');
    assert.deepEqual(scopeSummary(bus.scopedEmissions()[0]), [[SYS_A, ['labelling']]]);
  });

  it('attributes a BATCH per record rather than unioning it across every system', async () => {
    const { world, bus } = wiredWorld();
    tracked(bus);
    const a = world.systemManager.getSystem(SYS_A);
    const b = world.systemManager.getSystem(SYS_B);

    await world.systemManager.save({
      batch: [a, b],
      domains: new Map([
        [SYS_A, [INVALIDATION_DOMAINS.COMPONENT_DEFINITIONS]],
        [SYS_B, [INVALIDATION_DOMAINS.LABELLING]],
      ]),
    });
    world.systemManager._notifySystemsChanged();

    assert.deepEqual(scopeSummary(bus.scopedEmissions()[0]), [
      [SYS_A, ['component-definitions']],
      [SYS_B, ['labelling']],
    ]);
  });

  it('treats a batch record the domains map does not name as EVERY domain', async () => {
    const { world, bus } = wiredWorld();
    tracked(bus);
    const a = world.systemManager.getSystem(SYS_A);
    const b = world.systemManager.getSystem(SYS_B);

    await world.systemManager.save({
      batch: [a, b],
      domains: { [SYS_A]: [INVALIDATION_DOMAINS.LABELLING] },
    });
    world.systemManager._notifySystemsChanged();

    const scopes = new Map(scopeSummary(bus.scopedEmissions()[0]));
    assert.deepEqual(scopes.get(SYS_A), ['labelling']);
    assert.equal(scopes.get(SYS_B).length, 7, 'silence means everything, never nothing');
  });
});

describe('publisher 3 — a replicated change on a remote-shaped client', () => {
  /**
   * Drive the bridge exactly as `main.js` drives it on a client that did not write.
   *
   * @param {object} world
   * @param {object} bus
   * @param {string} settingKey
   * @returns {boolean}
   */
  const replicate = (world, bus, settingKey) =>
    handleFabricateSettingChange(settingKey, {
      craftingSystemManager: world.systemManager,
      recipeManager: world.recipeManager,
      callAll: (name, payload) => bus.hooks.callAll(name, payload),
    });

  it('mints a scoped signal from the WHOLE-CORPUS reload delta', () => {
    const { world, bus } = wiredWorld();
    tracked(bus);
    world.write(
      null,
      withRecipe(world.env, 'r-a1', (recipe) => ({ ...recipe, description: 'Replicated prose' }))
    );

    assert.equal(replicate(world, bus, RECIPES_SETTING_KEY), true);

    assert.equal(bus.scopedEmissions().length, 1);
    assert.deepEqual(scopeSummary(bus.scopedEmissions()[0]), [[SYS_A, ['narrative']]]);
    assert.equal(
      bus.reloads.journal,
      0,
      'a player watching a GM edit prose narrows exactly as the GM does — before this, every ' +
        'replicated edit reloaded every store on every client'
    );
    assert.equal(bus.fallbackCount(), 0);
  });

  it('narrows a replicated SYSTEM edit to the fields the delta names', () => {
    const { world, bus } = wiredWorld();
    tracked(bus);
    world.write(
      withSystem(world.env, SYS_A, (system) => ({ ...system, name: 'Renamed remotely' })),
      null
    );

    assert.equal(replicate(world, bus, SYSTEMS_SETTING_KEY), true);

    assert.deepEqual(scopeSummary(bus.scopedEmissions()[0]), [[SYS_A, ['labelling']]]);
    assert.equal(bus.fallbackCount(), 0);
  });

  it('emits NOTHING when the replicated corpus is identical', () => {
    const { world, bus } = wiredWorld();
    tracked(bus);

    assert.equal(replicate(world, bus, RECIPES_SETTING_KEY), true);

    assert.equal(bus.scopedEmissions().length, 0, 'the writing client must not double-refresh');
    assert.deepEqual(bus.reloadedStores(), []);
  });
});

describe('the SYSTEM-VALIDITY GATE reaches the gathering store', () => {
  // The regression this group exists for: `gathering` renders none of a system's check
  // configuration, so a Consuming-stores column derived from DIRECT fact reads omitted
  // `resolution-config` and `materials-and-yield` from it. But the gathering listing runs the
  // system-validity gate — `GatheringEngine._playerCandidateEnvironments` drops every
  // environment of a system whose `computeSystemVisibility` reports `blocksSystem`, for non-GM
  // viewers only — and those blockers are produced from exactly those two domains.
  //
  // The payload is well-formed and correctly attributed in the failing case, so NO fail-safe can
  // catch it. Only a positive control on the store can, which is why `gathering` needs one for
  // every domain it consumes rather than only for the three whose facts it renders.
  it('reloads GATHERING when a resolution-config fact moves, from a warmed baseline', async () => {
    const { world, bus } = wiredWorld();
    tracked(bus);

    await world.systemManager.updateSystem(SYS_A, { name: 'Warm' });
    assert.ok(bus.reloads.gathering > 0, 'the baseline: a rename DOES reload the gathering store');
    bus.reset();

    // `toolBreakage` is the `resolution-config` fact this fixture can move in ISOLATION: it
    // rewrites exactly one top-level key and triggers no recipe migration, so the single
    // emission below is unambiguously what reloaded the gathering store.
    //
    // The vivid gate input would be `resolutionMode: 'routedByCheck'` with no routed formula,
    // which is precisely what `routedCheckNoFormula` blocks on — and it is the same domain. It
    // is NOT the fixture here because a mode change additionally migrates recipes and announces
    // a second, broad recipe signal, which would leave "gathering reloaded" attributable to
    // either one. The row under test is `resolution-config -> gathering`; the gate is why that
    // row exists.
    await world.systemManager.updateSystem(SYS_A, {
      toolBreakage: { authority: 'checkDriven' },
    });

    assert.equal(bus.scopedEmissions().length, 1, 'one emission, so attribution is unambiguous');
    assert.deepEqual(scopeSummary(bus.scopedEmissions()[0]), [[SYS_A, ['resolution-config']]]);
    assert.ok(
      bus.reloads.gathering > 0,
      'a GM authoring the missing formula must un-hide the system on every player Gathering tab ' +
        '— and the GM is the one viewer who cannot see the stale one, because the gate bypasses GMs'
    );
    assert.equal(bus.fallbackCount(), 0, 'and it arrived by routing, not by the broad fallback');
  });

  it('reloads GATHERING when a materials-and-yield fact moves, from a warmed baseline', async () => {
    // `alchemySignatureCollision` is the `blocks: 'system'` issue this domain produces, and the
    // fixture systems are alchemy systems.
    const { world, bus } = wiredWorld();
    tracked(bus);

    await world.recipeManager.updateRecipe('r-a1', { name: 'Warm' }, { notify: false });
    assert.ok(bus.reloads.gathering > 0, 'the baseline');
    bus.reset();

    await world.recipeManager.updateRecipe(
      'r-a1',
      { ingredientSets: [] },
      { notify: false, allowIncomplete: true }
    );

    assert.deepEqual(scopeSummary(bus.scopedEmissions()[0]), [[SYS_A, ['materials-and-yield']]]);
    assert.ok(
      bus.reloads.gathering > 0,
      'a signature collision appearing or clearing is a gate input, so the gathering listing ' +
        'must re-run it'
    );
    assert.equal(bus.fallbackCount(), 0);
  });

  it('still does NOT reload gathering for prose, which no gate reads', async () => {
    // The other direction, so the two cases above are a correction rather than a widening to
    // everything: `narrative` and `held-inventory` stay off this channel for gathering.
    const { world, bus } = wiredWorld();
    tracked(bus);
    await world.systemManager.updateSystem(SYS_A, { name: 'Warm' });
    assert.ok(bus.reloads.gathering > 0, 'the baseline');
    bus.reset();

    await world.systemManager.updateSystem(SYS_A, { description: 'How this system works.' });

    assert.equal(bus.reloads.gathering, 0, 'gathering consumes five of seven, not all seven');
    assert.equal(bus.fallbackCount(), 0);
  });
});

describe('the fail-safe: an unattributable change routes broadly', () => {
  it('runs reload -> delta -> emit -> FALLBACK for a pure corpus reordering', () => {
    // A reordering is the only production-reachable producer of an empty domain set, which
    // makes it the sole end-to-end proof that the fail-safe is wired at all. The assertion is
    // the routing CONSEQUENCE, not the delta shape — `reload-scoped-invalidation.test.js`
    // already pins `reordered === true` and has never been red.
    const { world, bus } = wiredWorld();
    tracked(bus);
    world.write(null, storedRecipes(world.env).toReversed());
    const baseline = bus.fallbackCount();

    handleFabricateSettingChange(RECIPES_SETTING_KEY, {
      recipeManager: world.recipeManager,
      callAll: (name, payload) => bus.hooks.callAll(name, payload),
    });

    const [payload] = bus.scopedEmissions();
    assert.deepEqual(payload.scopes, [], 'a reorder is attributable to no record and no domain');
    assert.deepEqual(
      bus.reloadedStores(),
      ['crafting', 'inventory', 'alchemy', 'journal', 'gathering'],
      'so EVERY store reloads, including the two the narrow path would have excluded'
    );
    assert.equal(
      bus.fallbackCount() - baseline,
      5,
      'and it went through the broad fallback once per subscriber, rather than matching a ' +
        'domain by accident'
    );
  });

  it('poisons a MIXED payload when any one scope is attributable to nothing', () => {
    // `PendingChangeDomains#record` and `craftingDataChange()` are the two places an explicit
    // empty domain set can arrive, and they must agree. Dropping only the offending scope would
    // route the payload narrowly on the OTHER leg's domains while the unattributable one
    // vanished — a stale read model. Production-reachable: both `_domainsForSystemEdit` and
    // `_domainsForRecipeEdit` answer `[]` for a no-op edit, and two saves can precede one drain.
    const { bus } = wiredWorld();
    tracked(bus);

    bus.hooks.callAll(
      CRAFTING_DATA_CHANGED_HOOK,
      craftingDataChange({
        source: 'systems',
        scopes: [
          { systemId: SYS_A, domains: [INVALIDATION_DOMAINS.LABELLING] },
          { systemId: SYS_B, domains: [] },
        ],
      })
    );

    assert.deepEqual(bus.scopedEmissions()[0].scopes, [], 'the whole payload is unattributable');
    assert.deepEqual(bus.reloadedStores(), [
      'crafting',
      'inventory',
      'alchemy',
      'journal',
      'gathering',
    ]);
  });

  it('routes an unrecognised payload broadly rather than dropping it', () => {
    const { bus } = wiredWorld();
    tracked(bus);
    const baseline = bus.fallbackCount();

    bus.hooks.callAll(CRAFTING_DATA_CHANGED_HOOK, { legacy: true });

    assert.deepEqual(bus.reloadedStores(), [
      'crafting',
      'inventory',
      'alchemy',
      'journal',
      'gathering',
    ]);
    assert.equal(bus.fallbackCount() - baseline, 5);
  });

  it('routes a payload whose scopes are malformed broadly', () => {
    const { bus } = wiredWorld();
    tracked(bus);

    bus.hooks.callAll(CRAFTING_DATA_CHANGED_HOOK, {
      source: 'recipes',
      scopes: [{ systemId: SYS_A, domains: 'labelling' }],
    });

    assert.equal(bus.reloadedStores().length, 5, 'a string is not a domain array');
  });

  it('delivers a well-formed narrow payload WITHOUT touching the fallback counter', () => {
    const { bus } = wiredWorld();
    tracked(bus);
    const baseline = bus.fallbackCount();

    bus.hooks.callAll(
      CRAFTING_DATA_CHANGED_HOOK,
      craftingDataChange({
        source: 'recipes',
        scopes: [{ systemId: SYS_A, domains: [INVALIDATION_DOMAINS.NARRATIVE] }],
      })
    );

    assert.deepEqual(bus.reloadedStores(), ['crafting', 'inventory', 'alchemy']);
    assert.equal(bus.fallbackCount(), baseline, 'the counter is the control, so it must be inert');
  });
});

describe('an unattributable leg poisons the whole pending attribution', () => {
  it('drains to NOTHING when one recorded leg named no domain', () => {
    // The 12 lines of JSDoc on `PendingChangeDomains#record` explain why an explicit empty
    // array must poison the WHOLE set rather than merely skip its own leg, and nothing observed
    // it: replacing the poison with a bare `return` left the entire suite green.
    //
    // It is production-reachable. `_domainsForSystemEdit` and `_domainsForRecipeEdit` both
    // answer `[]` for an edit the delta reports no change for, `save({put, domains})` feeds that
    // straight in, and two saves before one drain is all it takes. Draining the attributed leg
    // alone would route the payload narrowly on ITS domains while the unattributable one
    // vanished — a stale read model.
    const pending = new PendingChangeDomains();

    pending.record([INVALIDATION_DOMAINS.LABELLING], SYS_A);
    pending.record([], SYS_B);

    assert.deepEqual(pending.drain(), []);
  });

  it('resets after a poisoned drain, so the next batch attributes normally', () => {
    const pending = new PendingChangeDomains();
    pending.record([], SYS_A);
    assert.deepEqual(pending.drain(), [], 'the premise');

    pending.record([INVALIDATION_DOMAINS.NARRATIVE], SYS_A);

    assert.deepEqual(pending.drain(), [{ systemId: SYS_A, domains: ['narrative'] }]);
  });

  it('treats an OMITTED domain set as every domain, not as unattributable', () => {
    // The two "I cannot say" answers are different: omitted means "every domain", which keeps
    // an unannotated mutation site safe, and an explicit empty array means "attributable to
    // nothing". Conflating them would make every unannotated save route broadly through the
    // FALLBACK rather than through a correctly widened payload.
    const pending = new PendingChangeDomains();

    pending.record(undefined, SYS_A);

    const [scope] = pending.drain();
    assert.equal(scope.systemId, SYS_A);
    assert.equal(scope.domains.length, 7);
  });
});

describe('batch and import stay bounded', () => {
  it('emits ONE scoped signal for a whole compendium import', async () => {
    const { world, bus } = wiredWorld();
    tracked(bus);

    // Imported DISABLED, because the fixture systems are alchemy systems and the enable-time
    // signature gate would otherwise refuse every import as a collision with the recipe that
    // already claims that component — which would leave nothing attributed and pass for the
    // wrong reason.
    const outcome = await world.recipeManager.importRecipes(
      [
        persistedRecipe('imp-1', SYS_A, `${SYS_A}-c0`, { enabled: false }),
        persistedRecipe('imp-2', SYS_A, `${SYS_A}-c1`, { enabled: false }),
        persistedRecipe('imp-3', SYS_B, `${SYS_B}-c0`, { enabled: false }),
      ],
      { overwrite: true }
    );

    assert.equal(outcome.imported, 3, 'the premise: all three really landed');
    assert.equal(bus.scopedEmissions().length, 1, 'three records, one invalidation boundary');
    assert.deepEqual(
      bus.scopedEmissions()[0].scopes.map((scope) => scope.systemId).sort(),
      [SYS_A, SYS_B]
    );
  });
});

describe('two independent clients over a replicated corpus copy converge', () => {
  it('narrows on the SECOND client exactly as it did on the first', async () => {
    // Two independent manager pairs, each with its OWN settings store and its own `Hooks` bus —
    // which is the property that makes the signal a `Hooks.callAll` rather than a module-local
    // emitter, since `globalThis.Hooks` is read at call time by every publisher.
    //
    // Deliberately NOT one shared settings Map: each `remoteClient()` allocates a fresh one and
    // the reader is seeded with a `structuredClone`, so no object identity survives between the
    // two. That is what replication actually delivers — a serialized copy — and it is a STRONGER
    // fixture than a shared seam, which could let a reader pass on an identity the wire would
    // have destroyed.
    const systems = [persistedSystem(SYS_A, ['Iron Ore'])];
    const writer = remoteClient({
      systems,
      recipes: [persistedRecipe('r-a1', SYS_A, `${SYS_A}-c0`)],
    });
    // The reader's PRE-EDIT corpus is the writer's, byte for byte. Building it a second time
    // from the fixture would stamp fresh `metadata` timestamps, and the reader would then
    // attribute `labelling` as well as `narrative` — a fixture artefact that would have read
    // as the taxonomy failing to narrow.
    const preEdit = structuredClone(writer.env.settings.get(SETTING_KEYS.RECIPES));
    const writerBus = tracked(installCraftingDataBus());

    await writer.recipeManager.updateRecipe('r-a1', { description: 'Shared' }, { notify: false });
    assert.equal(writerBus.scopedEmissions().length, 1, 'the writer announced its own edit');
    assert.deepEqual(scopeSummary(writerBus.scopedEmissions()[0]), [[SYS_A, ['narrative']]]);
    const postEdit = structuredClone(writer.env.settings.get(SETTING_KEYS.RECIPES));
    writerBus.restore();

    // The reader hydrated from the world BEFORE the edit, then catches up through the bridge.
    const reader = remoteClient({ systems, recipes: preEdit });
    reader.write(null, postEdit);
    const readerBus = tracked(installCraftingDataBus());

    handleFabricateSettingChange(RECIPES_SETTING_KEY, {
      recipeManager: reader.recipeManager,
      callAll: (name, payload) => readerBus.hooks.callAll(name, payload),
    });

    assert.equal(readerBus.scopedEmissions().length, 1, 'exactly one signal on the reader too');
    assert.deepEqual(
      scopeSummary(readerBus.scopedEmissions()[0]),
      [[SYS_A, ['narrative']]],
      'CONVERGENCE: the reader derived the same narrow attribution from the replicated corpus'
    );
    assert.equal(reader.recipeManager.getRecipe('r-a1').description, 'Shared');
    assert.equal(readerBus.reloads.journal, 0);
    assert.equal(readerBus.fallbackCount(), 0);
  });
});
