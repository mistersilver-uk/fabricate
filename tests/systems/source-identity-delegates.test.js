/**
 * Issue 1699 — the twelve retained delegates must FORWARD, and their collaborator bags must be
 * LATE-BOUND. One table drives every delegate against its module export invoked with the same bag
 * and the same full argument list; twelve copied assertion blocks would be a duplication finding.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CraftingSystemManager } from '../../src/systems/CraftingSystemManager.js';
import * as service from '../../src/systems/SourceIdentityService.js';
import * as snapshots from '../../src/systems/sourceIdentitySnapshots.js';
import {
  createHarness,
  makeActor,
  makeDocument,
  makePack,
  makeSystem,
  summarize,
} from '../helpers/sourceIdentityCorpus.js';

const LINK = '@UUID[Compendium.dnd5e.items.Item.pouch]';
const LINK_NAMES = { 'Compendium.dnd5e.items.Item.pouch': 'Component Pouch' };
const PACK_UUID = 'Compendium.world.kit.Item.ore';
const PACK_HAMMER_UUID = 'Compendium.world.kit.Item.hammer';

/** A world with one described world source, used by the four snapshot delegates. */
function describedSourceWorld() {
  const source = makeDocument({
    uuid: 'Item.ore-src',
    name: '',
    compendiumSource: 'Compendium.gone.kit.Item.ore',
    description: { value: LINK },
  });
  return { items: [source], linkNames: LINK_NAMES, fixtures: { source } };
}

/** A world whose single definition is registered in one system, for the three auto-stamps. */
function registeredSourceWorld() {
  const source = makeDocument({ uuid: 'Item.ore-src', name: 'Raw Ore' });
  const refs = { originItemUuid: 'Item.ore-src', registeredItemUuid: 'Item.ore-src' };
  return {
    systems: [
      makeSystem({
        id: 'sys1',
        components: [{ id: 'comp-ore', name: 'Ore', aliasItemUuids: [], ...refs }],
        tools: [{ id: 'tool-ore', name: 'Ore Tool', aliasItemUuids: [], ...refs }],
        recipeItemDefinitions: [{ id: 'ri-ore', name: 'Ore Tome', aliasItemUuids: [], ...refs }],
      }),
    ],
    resolve: { 'Item.ore-src': source },
    fixtures: { source },
  };
}

/** A world carrying a flagged world source the clear delegate is asked to unflag. */
function flaggedSourceWorld() {
  const source = makeDocument({
    uuid: 'Item.ore-src',
    flags: { fabricate: { fabricate: { roles: { sys1: { componentId: 'comp-ore' } } } } },
  });
  return { resolve: { 'Item.ore-src': source }, fixtures: { source } };
}

/** A world whose repair walk stamps one source per KIND and refreshes one locked-pack
 * description. All three kinds are populated deliberately: a regression that skips only the
 * component kind is invisible in a components-only world. */
function repairWorld() {
  const owned = makeDocument({ uuid: 'Actor.hero.Item.ore', name: 'Raw Ore' });
  const worldItem = makeDocument({ uuid: 'Item.ore-src', name: 'Raw Ore' });
  const pick = makeDocument({ uuid: 'Item.pick-src', name: 'Ore Pick' });
  const tome = makeDocument({ uuid: 'Item.tome-src', name: 'Ore Tome' });
  const packedSource = makeDocument({
    uuid: PACK_UUID,
    name: 'Packed Ore',
    pack: 'world.kit',
    description: { value: LINK },
  });
  return {
    systems: [
      makeSystem({
        id: 'sys1',
        components: [
          {
            id: 'comp-ore',
            name: 'Ore',
            aliasItemUuids: [],
            originItemUuid: 'Item.ore-src',
            registeredItemUuid: 'Item.ore-src',
          },
          {
            id: 'comp-packed',
            name: 'Packed Ore',
            aliasItemUuids: [],
            registeredItemUuid: PACK_UUID,
            description: '',
          },
        ],
        tools: [
          {
            id: 'tool-pick',
            name: 'Ore Pick',
            aliasItemUuids: [],
            originItemUuid: 'Item.pick-src',
            registeredItemUuid: 'Item.pick-src',
          },
        ],
        recipeItemDefinitions: [
          {
            id: 'ri-tome',
            name: 'Ore Tome',
            aliasItemUuids: [],
            originItemUuid: 'Item.tome-src',
            registeredItemUuid: 'Item.tome-src',
          },
        ],
      }),
    ],
    items: [worldItem, pick, tome],
    actors: [makeActor([owned])],
    packs: [makePack('world.kit', { locked: true })],
    resolve: { [PACK_UUID]: packedSource },
    linkNames: LINK_NAMES,
    fixtures: { worldItem, owned, pick, tome },
  };
}

/** A tool carrying only an ALIAS reference, no `originItemUuid`/`registeredItemUuid` — the
 * tools-kind filter at `SourceIdentityService.js:489-491` exists so a ref-less tool never reaches
 * the repair walk from either the world-source or the owned-copy resolver, even though both
 * resolvers would otherwise match it through the shared `aliasItemUuids` union. */
function aliasOnlyToolWorld() {
  const worldSource = makeDocument({
    uuid: 'Item.hammer-src',
    name: 'Hammer',
    compendiumSource: PACK_HAMMER_UUID,
  });
  const owned = makeDocument({
    uuid: 'Actor.hero.Item.hammer',
    name: 'Hammer',
    compendiumSource: PACK_HAMMER_UUID,
  });
  return {
    systems: [
      makeSystem({
        id: 'sys1',
        tools: [{ id: 'tool-hammer', name: 'Hammer', aliasItemUuids: [PACK_HAMMER_UUID] }],
      }),
    ],
    items: [worldSource],
    actors: [makeActor([owned])],
    fixtures: { worldSource, owned },
  };
}

/** A flagged, resolvable source living in a compendium pack — the guard at
 * `SourceIdentityService.js:83` exists so `_clearSourceFlag` never issues `unsetFlag` against it. */
function flaggedPackSourceWorld() {
  const source = makeDocument({
    uuid: PACK_UUID,
    pack: 'world.kit',
    flags: { fabricate: { fabricate: { roles: { sys1: { componentId: 'comp-ore' } } } } },
  });
  return { resolve: { [PACK_UUID]: source }, fixtures: { source } };
}

/** A definition-shaped fallback, so the unresolved-source arm of each builder is distinguishable. */
const FALLBACK_DEFINITION = { name: 'Fallback Definition', img: 'icons/def.webp', description: 'd' };

const SNAPSHOT_BAG = (manager) => manager._sourceSnapshotCollaborators();
const SERVICE_BAG = (manager) => manager._sourceIdentityCollaborators();

/**
 * The twelve delegates. `bag` is the builder the delegate's module export takes as its first
 * argument, or `null` for the two exports that need no collaborator at all.
 */
const DELEGATES = [
  {
    name: '_extractSourceDescription',
    module: snapshots,
    export: 'extractSourceDescription',
    bag: SNAPSHOT_BAG,
    cases: [{ world: describedSourceWorld, args: (harness) => [harness.fixtures.source] }],
    argDrop: [{ index: 0 }],
  },
  {
    name: '_buildComponentSourceSnapshot',
    module: snapshots,
    export: 'buildComponentSourceSnapshot',
    bag: SNAPSHOT_BAG,
    cases: [
      {
        world: describedSourceWorld,
        args: (harness) => [
          'Item.ore-src',
          harness.fixtures.source,
          { name: '', img: 'icons/fallback.webp', description: 'fallback' },
          null,
        ],
      },
      // The UNRESOLVED-source arm, which is the only one that tells the three builders apart.
      { world: () => ({}), args: () => ['', null, FALLBACK_DEFINITION, null] },
      // A non-null, non-default `sourceData` whose `currentUuid` differs from what the resolver
      // would answer: dropped, `resolveImportedComponentSourceData` gets CALLED (it does not
      // when the real argument short-circuits the `??`), so an empty `calls` log proves forwarding.
      {
        world: describedSourceWorld,
        args: (harness) => [
          'Item.ore-src',
          harness.fixtures.source,
          null,
          {
            currentUuid: 'Item.alt-source',
            canonicalUuid: null,
            aliasItemUuids: [],
            sourceFallbacks: [],
            references: [],
          },
        ],
      },
    ],
    argDrop: [{ index: 1 }, { index: 2 }, { index: 3, caseIndex: 2 }],
  },
  {
    name: '_buildRecipeItemSourceSnapshot',
    module: snapshots,
    export: 'buildRecipeItemSourceSnapshot',
    bag: SNAPSHOT_BAG,
    cases: [
      {
        world: describedSourceWorld,
        args: (harness) => [
          'Item.ore-src',
          harness.fixtures.source,
          { name: '', img: 'icons/fallback.webp', description: 'fallback' },
        ],
      },
      { world: () => ({}), args: () => ['', null, FALLBACK_DEFINITION] },
    ],
    argDrop: [{ index: 1 }, { index: 2 }],
  },
  {
    name: '_buildToolSourceSnapshot',
    module: snapshots,
    export: 'buildToolSourceSnapshot',
    bag: SNAPSHOT_BAG,
    cases: [
      { world: describedSourceWorld, args: (harness) => ['Item.ore-src', harness.fixtures.source] },
      { world: () => ({}), args: () => ['', null] },
    ],
    argDrop: [{ index: 1 }],
  },
  {
    name: '_buildFallbackSourceReferences',
    module: snapshots,
    export: 'buildFallbackSourceReferences',
    bag: null,
    cases: [
      {
        world: () => ({}),
        args: () => [
          { aliasItemUuids: ['Item.a'], registeredItemUuid: 'Item.b', originItemUuid: 'Item.c' },
          'Item.b',
          'Item.c',
          ['Item.d'],
        ],
      },
    ],
    argDrop: [{ index: 3 }],
  },
  {
    name: '_stampSourceIdentity',
    module: service,
    export: 'stampSourceIdentity',
    bag: null,
    cases: [
      {
        world: registeredSourceWorld,
        args: (harness) => [harness.fixtures.source, 'roles.sys1.componentId', 'comp-ore'],
      },
    ],
  },
  {
    name: '_clearSourceFlag',
    module: service,
    export: 'clearSourceFlag',
    bag: SERVICE_BAG,
    cases: [
      {
        world: flaggedSourceWorld,
        args: () => ['Item.ore-src', 'roles.sys1.componentId', 'comp-ore'],
      },
      {
        world: flaggedPackSourceWorld,
        args: () => [PACK_UUID, 'roles.sys1.componentId', 'comp-ore'],
      },
    ],
  },
  {
    name: 'autoStampRecipeItemSources',
    module: service,
    export: 'autoStampRecipeItemSources',
    bag: SERVICE_BAG,
    cases: [{ world: registeredSourceWorld, args: () => [] }],
  },
  {
    name: 'autoStampComponentSources',
    module: service,
    export: 'autoStampComponentSources',
    bag: SERVICE_BAG,
    cases: [{ world: registeredSourceWorld, args: () => [] }],
  },
  {
    name: 'autoStampToolSources',
    module: service,
    export: 'autoStampToolSources',
    bag: SERVICE_BAG,
    cases: [{ world: registeredSourceWorld, args: () => [] }],
  },
  {
    name: '_findRecipeItemDefinitionForSource',
    module: service,
    export: 'findRecipeItemDefinitionForSource',
    bag: SERVICE_BAG,
    cases: [
      {
        world: registeredSourceWorld,
        args: (harness) => [
          harness.systems[0],
          { registeredItemUuid: 'Item.ore-src', aliasItemUuids: [] },
          harness.fixtures.source,
        ],
      },
    ],
  },
  {
    name: 'repairItemData',
    module: service,
    export: 'repairItemData',
    bag: SERVICE_BAG,
    cases: [{ world: repairWorld, args: () => [{ includeCompendiums: false }] }],
    argDrop: [{ index: 0 }],
  },
];

/** Everything one call is allowed to be judged by: its return, its writes and its seam calls. */
function observation(harness, result) {
  return {
    result: summarize(result),
    journals: harness.journals(),
    calls: structuredClone(harness.calls),
    persistence: { ...harness.persistence },
  };
}

async function throughDelegate(entry, scenario) {
  const harness = createHarness(scenario.world());
  const result = await harness.manager[entry.name](...scenario.args(harness));
  return observation(harness, result);
}

async function throughExport(entry, scenario) {
  const harness = createHarness(scenario.world());
  const args = scenario.args(harness);
  const call = entry.bag
    ? entry.module[entry.export](entry.bag(harness.manager), ...args)
    : entry.module[entry.export](...args);
  return observation(harness, await call);
}

/** Call `entry.export` directly against a FRESH harness, with `dropIndex` replaced by `undefined`
 * (or every argument left intact when `dropIndex` is `undefined`) — the shape issue 1713's
 * forwarding suite uses for "argument N cannot be dropped unnoticed". */
async function throughExportWithArgIndex(entry, scenario, dropIndex) {
  const harness = createHarness(scenario.world());
  const args = scenario.args(harness);
  if (dropIndex !== undefined) args[dropIndex] = undefined;
  const call = entry.bag
    ? entry.module[entry.export](entry.bag(harness.manager), ...args)
    : entry.module[entry.export](...args);
  return observation(harness, await call);
}

describe('the source-identity delegates forward', () => {
  for (const entry of DELEGATES) {
    it(`${entry.name} answers exactly what ${entry.export} answers`, async () => {
      for (const [index, scenario] of entry.cases.entries()) {
        assert.deepStrictEqual(
          await throughDelegate(entry, scenario),
          await throughExport(entry, scenario),
          `${entry.name} case ${index} no longer forwards to ${entry.export} unchanged`
        );
      }
    });
  }

  it('declares the same parameters as the export it forwards to', () => {
    const drifted = DELEGATES.filter((entry) => {
      const expected = entry.module[entry.export].length - (entry.bag ? 1 : 0);
      return CraftingSystemManager.prototype[entry.name].length !== expected;
    }).map((entry) => entry.name);
    assert.deepStrictEqual(drifted, [], 'a delegate dropped or gained a declared parameter');
  });

  it('is not vacuous: each delegate is a distinct live member', () => {
    assert.equal(new Set(DELEGATES.map((entry) => entry.name)).size, 12);
    for (const entry of DELEGATES) {
      assert.equal(typeof CraftingSystemManager.prototype[entry.name], 'function', entry.name);
      assert.equal(typeof entry.module[entry.export], 'function', entry.export);
    }
  });
});

// `Function.length` (the "declares the same parameters" check above) stops counting at the first
// defaulted parameter, so it is structurally blind to every OPTIONAL argument — exactly where a
// delegate silently dropping one would go unnoticed by that check alone. `argDrop` names, per
// entry, which scenario-argument indices are optional AND already carry a non-default value in
// one of the entry's own cases, so replacing that index with `undefined` changes the export's
// result — proving the forwarding-equality test above WOULD have caught a delegate that dropped it.
describe('an optional argument cannot be dropped unnoticed', () => {
  for (const entry of DELEGATES) {
    for (const { index, caseIndex = 0 } of entry.argDrop ?? []) {
      it(`${entry.name}'s argument ${index} cannot be dropped unnoticed by ${entry.export}`, async () => {
        const scenario = entry.cases[caseIndex];
        assert.notDeepStrictEqual(
          await throughExportWithArgIndex(entry, scenario, index),
          await throughExportWithArgIndex(entry, scenario, undefined),
          `omitting argument ${index} leaves ${entry.export}'s result unchanged, so a delegate ` +
            'that dropped it would go unnoticed by the forwarding comparison above'
        );
      });
    }
  }
});

describe('the collaborator bags forward their full argument lists', () => {
  it('asks the enricher for the raw text AND the source it is relative to', async () => {
    const harness = createHarness(describedSourceWorld());
    await harness.manager._extractSourceDescription(harness.fixtures.source);
    assert.deepStrictEqual(harness.calls.enrichToHtml, [
      [LINK, { relativeTo: { document: 'Item.ore-src' } }],
    ]);
  });

  it('asks the import-source resolver for the uuid AND the source document', async () => {
    const harness = createHarness(describedSourceWorld());
    await harness.manager._buildToolSourceSnapshot('Item.ore-src', harness.fixtures.source);
    assert.deepStrictEqual(harness.calls.resolveImportedComponentSourceData, [
      ['Item.ore-src', { document: 'Item.ore-src' }],
    ]);
  });
});

describe('the collaborator bags are late-bound', () => {
  it('observes `save`, `_notifySystemsChanged`, `game` and `fromUuid` assigned after construction', async () => {
    const harness = createHarness(repairWorld());
    const summary = await harness.manager.repairItemData();
    assert.equal(summary.scanned >= 4, true, 'it walked the world items and the owned copies');
    assert.equal(summary.stamped, 3, 'one source per kind resolved through the injected collections');
    assert.equal(summary.descriptions.refreshed, 1, 'and `fromUuid` resolved the packed source');
    assert.equal(harness.persistence.save, 1, 'the save assigned after construction was used');
    assert.equal(harness.persistence.notify, 1, 'and so was the change notification');
  });

  it('observes `_componentRoleFlagKey` patched after construction', async () => {
    const harness = createHarness(repairWorld());
    harness.manager._componentRoleFlagKey = () => null;
    const summary = await harness.manager.repairItemData();
    assert.equal(summary.stamped, 0, 'a null component key skips the whole system');
    assert.deepStrictEqual(summary.components, { stamped: 0, stripped: 0, cleared: 0 });
    // The tools and recipe-item kinds would each stamp a source in this world, so a rewrite that
    // skipped only the component kind shows up HERE and nowhere else.
    assert.deepStrictEqual(summary.tools, { stamped: 0, stripped: 0, cleared: 0 });
    assert.deepStrictEqual(summary.recipeItems, { stamped: 0, stripped: 0, cleared: 0 });
  });

  it('observes `_extractSourceDescription` patched after construction', async () => {
    const harness = createHarness(repairWorld());
    harness.manager._extractSourceDescription = async () => 'patched description';
    const summary = await harness.manager.repairItemData();
    assert.equal(summary.descriptions.refreshed, 1);
    assert.equal(harness.systems[0].components[1].description, 'patched description');
  });

  it('observes `_enrichToHtml` patched after construction', async () => {
    const harness = createHarness(describedSourceWorld());
    harness.manager._enrichToHtml = async () => '<p>patched enrichment</p>';
    const resolved = await harness.manager._extractSourceDescription(harness.fixtures.source);
    assert.equal(resolved, 'patched enrichment');
    assert.deepStrictEqual(harness.calls.enrichToHtml, [], 'the injected seam was bypassed');
  });

  it('does not touch a Foundry global while constructing', () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'game');
    Object.defineProperty(globalThis, 'game', {
      configurable: true,
      get() {
        throw new Error('a constructor must not read `game`');
      },
    });
    try {
      assert.doesNotThrow(() => new CraftingSystemManager({ getRecipes: () => [] }));
    } finally {
      Object.defineProperty(globalThis, 'game', descriptor);
    }
  });
});

describe('the GM gate and the deleted members', () => {
  it('asserts GM BEFORE building the repair bag', async () => {
    const harness = createHarness(repairWorld());
    let built = false;
    const build = harness.manager._sourceIdentityCollaborators.bind(harness.manager);
    harness.manager._sourceIdentityCollaborators = () => {
      built = true;
      return build();
    };
    harness.manager._assertGM = () => {
      throw new Error('GM permissions required: repair item data');
    };
    await assert.rejects(() => harness.manager.repairItemData(), /GM permissions required/);
    assert.equal(built, false, 'the bag must not be built before the gate refuses');
  });

  it('no longer carries the thirteen members whose only callers moved', () => {
    const harness = createHarness({});
    const survivors = [
      '_sourceDescriptionCandidates',
      '_rawSourceDescription',
      '_stripCloneSourceProvenance',
      '_writeSourceIdentity',
      '_normalizeMatchName',
      '_uniqueDefinitionByName',
      '_resolveSourceRepairOwner',
      '_resolveOwnedRepairOwner',
      '_repairSourceItem',
      '_repairOwnedItem',
      '_definitionSourceUuid',
      '_countSkippedDescription',
      '_refreshDefinitionDescriptions',
    ].filter((name) => harness.manager[name] !== undefined);
    assert.deepStrictEqual(survivors, [], 'a deleted member is still reachable on the instance');
  });
});

describe('the guards close before a write', () => {
  it('never reaches an alias-only tool from either resolver', async () => {
    const harness = createHarness(aliasOnlyToolWorld());
    const summary = await harness.manager.repairItemData();
    assert.equal(
      summary.tools.stamped,
      0,
      'the tools-kind filter (SourceIdentityService.js:489-491) keeps a ref-less tool unreachable'
    );
    const journals = harness.journals();
    assert.deepStrictEqual(journals['Item.hammer-src'], [], 'no setFlag write on the world source');
    assert.deepStrictEqual(
      journals['Actor.hero.Item.hammer'],
      [],
      'no setFlag write on the owned copy'
    );
  });

  it('never unsets a flag on a pack-resident resolved source', async () => {
    const harness = createHarness(flaggedPackSourceWorld());
    await harness.manager._clearSourceFlag(PACK_UUID, 'roles.sys1.componentId', 'comp-ore');
    assert.deepStrictEqual(
      harness.journals()[PACK_UUID],
      [],
      'the compendium guard (SourceIdentityService.js:83) must refuse an unsetFlag write'
    );
  });
});
