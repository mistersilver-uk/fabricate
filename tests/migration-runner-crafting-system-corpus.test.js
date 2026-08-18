/**
 * The migration payload round trip over an extracted component corpus (issue 1212).
 *
 * Acceptance items 4, 5, 6 and 7.
 *
 * The seam has to satisfy two things at once, and conflating them is a corpus-loss path: the
 * repository's `serialize` OMITS the nested key, and this seam's `extract` RESTORES it exactly
 * as the raw read carried it. An `extract` that omitted would destroy a downgrade-era residual
 * on the same boot, before the reconcile that would have detected it ever ran.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { SETTING_KEYS } from '../src/config/settings.js';
import { MigrationRunner } from '../src/migration/MigrationRunner.js';
import { createCraftingSystemCorpus } from '../src/systems/craftingSystemCorpus.js';

import {
  component,
  envelopesFor,
  installComponentStorageWorld,
  PER_RECORD,
  SINGLE_ARRAY,
  system,
} from './helpers/componentStorageWorld.js';

const { world } = installComponentStorageWorld();

/**
 * The corpus accessor bound to one fixture's world.
 *
 * @param {object} fixture
 * @returns {object}
 */
const corpusFor = (fixture) =>
  createCraftingSystemCorpus({
    getSetting: fixture.seams.getSetting,
    setSetting: fixture.seams.setSetting,
    documentClass: fixture.seams.documentClass,
    collection: fixture.seams.collection,
  });

// ---------------------------------------------------------------------------
// 4. The round trip is a BYTE identity, over five shapes, with key ORDER
// ---------------------------------------------------------------------------

describe('extract(inflate(x)) is a byte identity on the systems payload', () => {
  /**
   * The five shapes item 4 names. At least one places `components` in a NON-FINAL key
   * position — which is the ordinary case, because `_normalizeSystem`'s literal is followed by
   * `tools:` — so an implementation that DELETED the key and re-appended it fails here rather
   * than shipping green and rewriting `craftingSystems` on every boot of every converted world.
   *
   * @returns {Array<[string, object]>}
   */
  const shapes = () => [
    ['no components key at all', { id: 'sysA', name: 'A', tools: [] }],
    [
      'a managedItems alias',
      { id: 'sysB', name: 'B', managedItems: [component('legacy1')], tools: [] },
    ],
    ['an items alias', { id: 'sysC', name: 'C', items: [component('legacy2')], tools: [] }],
    [
      'an EMPTY array in a NON-FINAL position',
      { id: 'sysD', name: 'D', components: [], tools: [], itemTags: ['x'] },
    ],
    [
      'a RESIDUAL non-empty array in a NON-FINAL position',
      {
        id: 'sysE',
        name: 'E',
        components: [component('residual')],
        tools: [],
        itemTags: ['y'],
      },
    ],
  ];

  it('restores every shape byte-for-byte, including its key ORDER', async () => {
    // *Reddens when:* the wrapper normalises an alias, or omits the key rather than restoring
    // it — the empty-array shape then fails identity and the residual shape is DESTROYED.
    const stored = shapes().map(([, record]) => record);
    const fixture = await world({
      layout: PER_RECORD,
      target: PER_RECORD,
      systems: stored,
      records: [
        ...envelopesFor('sysA', [component('a1')]),
        ...envelopesFor('sysE', [component('e1')]),
      ],
    });
    const before = JSON.stringify(fixture.storedSystems());
    // Key order is the point, so this is asserted rather than assumed.
    assert.ok(
      before.includes('"components":[],"tools":[]'),
      'the empty-array shape really does place `components` before `tools`'
    );

    const corpus = corpusFor(fixture);
    const payload = await corpus.loadAll();
    await corpus.createOrUpdateAll(payload);

    assert.equal(JSON.stringify(fixture.storedSystems()), before, 'byte-identical');
  });

  it('the INFLATED payload is what a migration sees, not the stored bytes', async () => {
    // The other half: if `inflate` did nothing, every consumer below would reduce over zero
    // components and the identity above would be trivially satisfied.
    const fixture = await world({
      layout: PER_RECORD,
      target: PER_RECORD,
      systems: [{ id: 'sysA', name: 'A', tools: [] }],
      records: envelopesFor('sysA', [component('a1'), component('a2')]),
    });

    const payload = await corpusFor(fixture).loadAll();

    assert.equal(payload[0].components.length, 2, 'the pass sees the granular corpus');
    assert.deepEqual(
      payload[0].components.map((entry) => entry.id),
      ['a1', 'a2']
    );
  });

  it('a pending pass that transforms nothing issues ZERO corpus writes', async () => {
    // Not "zero writes": `MIGRATION_VERSION` is written unconditionally, outside every
    // `…Changed` guard, so an unqualified claim could never pass and would be loosened to
    // something vacuous during implementation.
    const fixture = await world({
      layout: PER_RECORD,
      target: PER_RECORD,
      systems: [{ id: 'sysA', name: 'A', components: [], tools: [] }],
      records: envelopesFor('sysA', [component('a1')]),
    });
    fixture.env.settings.set(SETTING_KEYS.MIGRATION_VERSION, '0.0.1');
    fixture.env.writes.length = 0;
    fixture.host.calls.length = 0;

    await new MigrationRunner({
      getSetting: fixture.seams.getSetting,
      setSetting: fixture.seams.setSetting,
      craftingSystemCorpus: corpusFor(fixture),
      migrations: [{ version: '9.9.9', label: 'no-op', migrate: (data) => data }],
    }).run();

    assert.deepEqual(
      fixture.settingWrites().filter((key) => key === SETTING_KEYS.CRAFTING_SYSTEMS),
      [],
      'zero CORPUS writes'
    );
    assert.deepEqual(fixture.host.calls, [], 'and zero component document calls');
    assert.deepEqual(
      fixture.settingWrites(),
      [SETTING_KEYS.MIGRATION_VERSION],
      'the version bump is the only write, and it is unconditional'
    );
  });
});

// ---------------------------------------------------------------------------
// 5. The payload consumers see components, and their writes land in the right class
// ---------------------------------------------------------------------------

describe('a real payload consumer reads components and writes to the right class', () => {
  it('routes a component rewrite to its DOCUMENT and a system field to the container', async () => {
    // *Reddens when:* the re-inflation is dropped (the migration sees no components and
    // rewrites nothing); *and when* the extraction half is dropped (the component document is
    // unchanged and the container regrows the key). Both halves in one fixture, because the
    // two defects are opposite directions of the same seam.
    const fixture = await world({
      layout: PER_RECORD,
      target: PER_RECORD,
      systems: [{ id: 'sysA', name: 'A', tools: [] }],
      records: envelopesFor('sysA', [
        component('a1', { salvage: { catalysts: [{ componentId: 'cat1', quantity: 1 }] } }),
      ]),
    });

    let observed = 0;
    await new MigrationRunner({
      getSetting: fixture.seams.getSetting,
      setSetting: fixture.seams.setSetting,
      craftingSystemCorpus: corpusFor(fixture),
      migrations: [
        {
          version: '9.9.9',
          label: 'catalysts to tools',
          migrate: (data) => {
            for (const record of data.systems) {
              for (const entry of record.components ?? []) {
                if (!entry.salvage?.catalysts) continue;
                observed += 1;
                entry.salvage.toolIds = entry.salvage.catalysts.map((row) => row.componentId);
                delete entry.salvage.catalysts;
              }
              // The tool BODIES the same migration writes onto the system.
              record.tools = [{ id: 'cat1', name: 'Catalyst' }];
            }
            return data;
          },
        },
      ],
    }).run();

    assert.equal(observed, 1, 'the migration really did see a component');
    assert.deepEqual(
      fixture.storedComponents()[0].salvage,
      { toolIds: ['cat1'] },
      'the component rewrite landed in its DOCUMENT'
    );
    const stored = fixture.storedSystems()[0];
    assert.deepEqual(stored.tools, [{ id: 'cat1', name: 'Catalyst' }], 'tools on the container');
    assert.equal(
      Object.hasOwn(stored, 'components'),
      false,
      'and craftingSystems regrew no components key'
    );
  });
});

// ---------------------------------------------------------------------------
// 6. A corpus-global reduction is not computed against zero components
// ---------------------------------------------------------------------------

describe('a corpus-global reduction sees the same components on both arrangements', () => {
  /**
   * A reduction whose failure is SILENT SUCCESS rather than a missing count: it disables every
   * recipe whose alchemy signature collides, so a pass that saw no components finds no
   * collisions and disables nothing, reporting success either way.
   *
   * @param {object} data
   * @returns {object}
   */
  function disableCollidingRecipes(data) {
    const signatures = new Map();
    for (const record of data.systems) {
      for (const entry of record.components ?? []) {
        const signature = JSON.stringify(entry.essences ?? {});
        signatures.set(signature, (signatures.get(signature) ?? 0) + 1);
      }
    }
    const colliding = [...signatures].filter(([, count]) => count > 1).map(([key]) => key);
    data.recipes = data.recipes.map((recipe) =>
      colliding.includes(recipe.signature) ? { ...recipe, enabled: false } : recipe
    );
    return data;
  }

  const COLLIDING = () => [
    component('c1', { essences: { fire: 2 } }),
    component('c2', { essences: { fire: 2 } }),
    component('c3', { essences: { water: 1 } }),
  ];

  it('disables the SAME recipes as on the byte-equivalent un-converted world', async () => {
    // *Reddens when:* the re-inflation is dropped — the reduction then sees no components,
    // finds no collisions and disables nothing, with no count anywhere to notice.
    const recipes = [
      { id: 'r1', signature: JSON.stringify({ fire: 2 }), enabled: true },
      { id: 'r2', signature: JSON.stringify({ water: 1 }), enabled: true },
    ];

    const nested = await world({
      layout: SINGLE_ARRAY,
      target: SINGLE_ARRAY,
      systems: [system('sysA', COLLIDING())],
    });
    nested.env.settings.set(SETTING_KEYS.RECIPES, structuredClone(recipes));
    await new MigrationRunner({
      getSetting: nested.seams.getSetting,
      setSetting: nested.seams.setSetting,
      craftingSystemCorpus: corpusFor(nested),
      migrations: [{ version: '9.9.9', label: 'alchemy', migrate: disableCollidingRecipes }],
    }).run();
    const nestedDisabled = nested.env.settings
      .get(SETTING_KEYS.RECIPES)
      .filter((recipe) => recipe.enabled === false)
      .map((recipe) => recipe.id);
    assert.deepEqual(nestedDisabled, ['r1'], 'the control really does disable something');

    const converted = await world({
      layout: PER_RECORD,
      target: PER_RECORD,
      systems: [{ id: 'sysA', name: 'System sysA', tools: [] }],
      records: envelopesFor('sysA', COLLIDING()),
    });
    converted.env.settings.set(SETTING_KEYS.RECIPES, structuredClone(recipes));
    await new MigrationRunner({
      getSetting: converted.seams.getSetting,
      setSetting: converted.seams.setSetting,
      craftingSystemCorpus: corpusFor(converted),
      migrations: [{ version: '9.9.9', label: 'alchemy', migrate: disableCollidingRecipes }],
    }).run();
    const convertedDisabled = converted.env.settings
      .get(SETTING_KEYS.RECIPES)
      .filter((recipe) => recipe.enabled === false)
      .map((recipe) => recipe.id);

    assert.deepEqual(convertedDisabled, nestedDisabled);
  });
});

// ---------------------------------------------------------------------------
// 7. The LIVE-manager consumer is protected by the OTHER mechanism
// ---------------------------------------------------------------------------

describe('a live-manager consumer still sees components, by the other mechanism', () => {
  it('the manager`s getSystems() carries components on a converted world', async () => {
    // *Reddens when:* `_normalizeSystem` stops emitting `components`, or the repository's
    // hydrate fails to re-inflate from the index. Named separately from the payload items
    // because this consumer reads the LIVE manager and is NOT covered by the wrapper — an
    // item that tested it through the wrapper would pass for the wrong reason.
    const fixture = await world({
      layout: PER_RECORD,
      target: PER_RECORD,
      systems: [{ id: 'sysA', name: 'A', tools: [] }],
      records: envelopesFor('sysA', [component('a1'), component('a2')]),
    });
    globalThis.Setting = { implementation: fixture.host.documentClass };
    globalThis.game.settings.storage = { get: () => fixture.host.collection };
    const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');
    const manager = new CraftingSystemManager({ getRecipes: () => [] });
    await manager.initialize();

    const live = manager.getSystems()[0];
    assert.equal(live.components.length, 2, 'the live corpus is not empty');
    assert.deepEqual(
      live.components.map((entry) => entry.id),
      ['a1', 'a2']
    );
  });
});

// ---------------------------------------------------------------------------
// The `unsettled` refusal and the shrink refusal
// ---------------------------------------------------------------------------

describe('the accessor refuses what it cannot read whole', () => {
  it('refuses a mid-conversion component layout outright', async () => {
    const fixture = await world({
      layout: 'unsettled',
      target: PER_RECORD,
      systems: [system('sysA', [component('a1')])],
    });
    const summary = await new MigrationRunner({
      getSetting: fixture.seams.getSetting,
      setSetting: fixture.seams.setSetting,
      craftingSystemCorpus: corpusFor(fixture),
      migrations: [{ version: '9.9.9', label: 'anything', migrate: (data) => data }],
    }).run();
    assert.equal(summary.deferred, true);
    assert.deepEqual(fixture.settingWrites(), [], 'and nothing was saved');
  });

  it('refuses a writeback that drops a component record the read observed', async () => {
    const fixture = await world({
      layout: PER_RECORD,
      target: PER_RECORD,
      systems: [{ id: 'sysA', name: 'A', tools: [] }],
      records: envelopesFor('sysA', [component('a1'), component('a2')]),
    });
    const corpus = corpusFor(fixture);
    const payload = await corpus.loadAll();
    payload[0].components = payload[0].components.filter((entry) => entry.id !== 'a2');

    await assert.rejects(() => corpus.createOrUpdateAll(payload), /drops 1 component record/);
    assert.deepEqual(fixture.recordKeys(), ['sysA.a1', 'sysA.a2'], 'and nothing was removed');
  });

  it('the DEFAULT seam is the raw whole-array accessor, so every existing fixture is unmoved', async () => {
    const fixture = await world({
      layout: SINGLE_ARRAY,
      target: SINGLE_ARRAY,
      systems: [system('sysA', [component('a1')])],
    });
    await new MigrationRunner({
      getSetting: fixture.seams.getSetting,
      setSetting: fixture.seams.setSetting,
      migrations: [
        {
          version: '9.9.9',
          label: 'touch',
          migrate: (data) => {
            data.systems[0].name = 'Renamed';
            return data;
          },
        },
      ],
    }).run();
    assert.equal(fixture.storedSystems()[0].name, 'Renamed');
    assert.equal(fixture.storedSystems()[0].components.length, 1, 'still nested');
  });
});
