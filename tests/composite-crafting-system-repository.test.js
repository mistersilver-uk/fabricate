/**
 * The composite crafting-system repository: the container/component split, the scoped
 * differential, the three-phase cross-class order, the downgrade-era container, the
 * arrangement write guard, the mid-session rebuild, the batch-close marker and the
 * replicated-record applier (issue 1212).
 *
 * Acceptance items 2, 8, 9, 10, 12, 24, 25, 28, 29 and 31.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DEFINITION_STORAGE_LAYOUTS, SETTING_KEYS } from '../src/config/settings.js';
import { DefinitionStorageArrangementError } from '../src/systems/definitionStorageArrangement.js';

import {
  component,
  downgradedContainer,
  envelopesFor,
  installComponentStorageWorld,
  LAYOUT_KEY,
  PER_RECORD,
  qualified,
  SINGLE_ARRAY,
  system,
  TARGET_KEY,
} from './helpers/componentStorageWorld.js';

const { world } = installComponentStorageWorld();
const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');

/**
 * A manager reading and writing THIS fixture's world, through the real composite repository.
 *
 * The document class and the world collection are installed on the globals the production
 * accessors resolve lazily, so the manager builds exactly the repository a live world would.
 *
 * @param {object} fixture
 * @returns {Promise<object>}
 */
async function managerFor(fixture, { settle = false } = {}) {
  globalThis.Setting = { implementation: fixture.host.documentClass };
  globalThis.game.settings.storage = { get: () => fixture.host.collection };
  // The recipe collaborator the essence cascade reaches for. A stub rather than a real
  // manager, so this suite measures the COMPONENT legs and not a recipe corpus it does not
  // model.
  const manager = new CraftingSystemManager({
    getRecipes: () => [],
    save: async () => {},
  });
  await manager.initialize();
  // A fixture seeds RAW component bytes, and the manager holds NORMALIZED ones, so the first
  // save legitimately rewrites every seeded record once. Settling here means a later
  // assertion about the legs one operation issued measures that operation rather than the
  // one-off normalization catch-up.
  if (settle) {
    await manager.save();
    fixture.host.calls.length = 0;
    fixture.env.writes.length = 0;
  }
  return manager;
}

/** The document legs one operation issued, in order. */
const legsOf = (fixture) => fixture.host.calls.map((call) => `${call.leg}:${call.count}`);

// ---------------------------------------------------------------------------
// 2. The container is stripped, and ONLY under perRecord
// ---------------------------------------------------------------------------

describe('the container keeps or loses its components according to the ARRANGEMENT', () => {
  it('(a) singleArray: an ordinary save still nests every component', async () => {
    // *Reddens when:* the serializer strips unconditionally — which is the issue's first
    // ordering trap and destroys an un-converted world's components on its next save.
    const fixture = await world({
      layout: SINGLE_ARRAY,
      target: SINGLE_ARRAY,
      systems: [system('sysA', [component('c1'), component('c2'), component('c3')])],
    });
    const manager = await managerFor(fixture);
    await manager.save({ put: manager.getSystem('sysA') });

    assert.equal(fixture.storedSystems()[0].components.length, 3, 'all three still nested');
    assert.deepEqual(fixture.recordKeys(), [], 'and nothing was extracted');
  });

  it('(b) perRecord: the stored record has NO components key and the documents exist', async () => {
    // *Reddens when:* it never strips.
    const fixture = await world({
      layout: PER_RECORD,
      target: PER_RECORD,
      systems: [system('sysA', [])],
      records: envelopesFor('sysA', [component('c1'), component('c2'), component('c3')]),
    });
    const manager = await managerFor(fixture);
    await manager.save({ put: manager.getSystem('sysA') });

    assert.equal(
      Object.hasOwn(fixture.storedSystems()[0], 'components'),
      false,
      'key ABSENCE, not an empty array'
    );
    assert.deepEqual(fixture.recordKeys(), ['sysA.c1', 'sysA.c2', 'sysA.c3']);
  });

  it('(c) unsettled: the write is REFUSED rather than stripped', async () => {
    // *Reddens when:* the rule is keyed on "not singleArray, therefore strip" — it then
    // strips the container while the documents do not yet exist. Three fixtures because two
    // values leave the third arm free.
    const fixture = await world({
      layout: SINGLE_ARRAY,
      target: SINGLE_ARRAY,
      systems: [system('sysA', [component('c1'), component('c2'), component('c3')])],
    });
    const manager = await managerFor(fixture);
    fixture.env.settings.set(LAYOUT_KEY, DEFINITION_STORAGE_LAYOUTS.UNSETTLED);

    await assert.rejects(
      () => manager.save({ put: manager.getSystem('sysA') }),
      DefinitionStorageArrangementError
    );
    assert.equal(fixture.storedSystems()[0].components.length, 3, 'nothing was persisted');
  });
});

// ---------------------------------------------------------------------------
// 28. The arrangement write guard fires on the component class
// ---------------------------------------------------------------------------

describe('the stale-arrangement write guard is installed on BOTH arms', () => {
  it('refuses a granular write once the layout has moved back', async () => {
    // *Reddens when:* the composite is constructed with no `assertWritable` — which is the
    // shipped state, so this item fails until the composite lands.
    const fixture = await world({
      layout: PER_RECORD,
      target: PER_RECORD,
      systems: [system('sysA', [])],
      records: envelopesFor('sysA', [component('c1')]),
    });
    const manager = await managerFor(fixture);
    fixture.env.settings.set(LAYOUT_KEY, SINGLE_ARRAY);
    const before = fixture.storedComponents().length;

    await assert.rejects(
      () => manager.save({ put: manager.getSystem('sysA') }),
      DefinitionStorageArrangementError
    );
    assert.equal(fixture.storedComponents().length, before, 'nothing was persisted');
  });

  it('does not refuse while the layout agrees, so the guard is not a blanket refusal', async () => {
    const fixture = await world({
      layout: PER_RECORD,
      target: PER_RECORD,
      systems: [system('sysA', [])],
      records: envelopesFor('sysA', [component('c1')]),
    });
    const manager = await managerFor(fixture);
    await assert.doesNotReject(() => manager.save({ put: manager.getSystem('sysA') }));
  });
});

// ---------------------------------------------------------------------------
// 8. A cross-class cascade is bounded, over MORE THAN ONE component
// ---------------------------------------------------------------------------

describe('a cross-class cascade is bounded, whatever it touches', () => {
  it('deletes one essence from 200 components as ONE update leg', async () => {
    // *Reddens when:* the cascade issues one `put` per component — 200 update calls. The
    // fixture must hold more than one component or "one leg" and "one leg per component" are
    // the same number.
    const carriers = Array.from({ length: 200 }, (_, index) =>
      component(`c${index}`, { essences: { e1: 1 } })
    );
    const fixture = await world({
      layout: PER_RECORD,
      target: PER_RECORD,
      systems: [
        system('sysA', [], { essenceDefinitions: [{ id: 'e1', name: 'Fire' }] }),
        system('sysB', []),
        system('sysC', []),
      ],
      records: [
        ...envelopesFor('sysA', carriers),
        ...envelopesFor('sysB', [component('b1')]),
        ...envelopesFor('sysC', [component('c1')]),
      ],
    });
    const manager = await managerFor(fixture, { settle: true });

    await manager.deleteEssence('sysA', 'e1');

    assert.deepEqual(legsOf(fixture), ['update:200'], 'exactly one update leg, 200 entries');
    assert.deepEqual(
      fixture.settingWrites().filter((key) => key === SETTING_KEYS.CRAFTING_SYSTEMS),
      [SETTING_KEYS.CRAFTING_SYSTEMS],
      'exactly one craftingSystems write'
    );
    const sent = fixture.host.calls[0].sent;
    assert.equal(sent.length, 200);
    // Every entry names a document under this system's scope. Read back through the index so
    // the assertion is about the KEYS the leg addressed, not about ids it happened to carry.
    const scoped = fixture
      .recordKeys()
      .filter((recordKey) => recordKey.startsWith('sysA.'));
    assert.equal(scoped.length, 200, 'and only this system is scoped');
  });
});

// ---------------------------------------------------------------------------
// 12. The composite differential is SCOPED
// ---------------------------------------------------------------------------

describe('the component differential is scoped to the systems the change NAMES', () => {
  const wide = () =>
    world({
      layout: PER_RECORD,
      target: PER_RECORD,
      systems: [system('sysA', []), system('sysB', []), system('sysC', [])],
      records: ['sysA', 'sysB', 'sysC'].flatMap((id) =>
        envelopesFor(
          id,
          Array.from({ length: 20 }, (_, index) => component(`${id}-c${index}`))
        )
      ),
    });

  it('a NAMED save compares only that system, and a bare save compares them all', async () => {
    // *Reddens when:* the differential is corpus-wide on every named save (the first half
    // fails); *and when* the whole-corpus fallback is ALSO scoped (the second half fails,
    // breaking the flush-everything property the bare callers rely on).
    const fixture = await wide();
    const manager = await managerFor(fixture);
    const repository = manager._repository;
    const compared = [];
    const realDifferential = repository._componentDifferential.bind(repository);
    repository._componentDifferential = (described, scopes) => {
      compared.push(scopes === null ? 'ALL' : [...scopes].sort().join(','));
      return realDifferential(described, scopes);
    };

    const systemA = manager.getSystem('sysA');
    systemA.components = [...systemA.components, component('sysA-new')];
    await manager.save({ put: systemA });
    assert.deepEqual(compared, ['sysA'], 'a named save never looks at B or C');
    assert.ok(
      fixture.recordKeys().includes('sysA.sysA-new'),
      'and it really did write through the scoped path'
    );

    compared.length = 0;
    await manager.save();
    assert.deepEqual(compared, ['ALL'], 'the whole-corpus fallback spans every system');
  });
});

// ---------------------------------------------------------------------------
// 10. The downgrade-era container does not delete the corpus
// ---------------------------------------------------------------------------

describe('a downgraded build`s `components: []` does not destroy the corpus', () => {
  /**
   * A settled `perRecord` world whose container carries the bytes an OLDER Fabricate's
   * ordinary save produces, with more than one component per system.
   *
   * @returns {Promise<object>}
   */
  const downgraded = async () => {
    const fixture = await world({
      layout: PER_RECORD,
      target: PER_RECORD,
      systems: downgradedContainer([system('sysA', []), system('sysB', [])]).map((record) => {
        const { components: _extracted, ...rest } = record;
        return { ...rest, components: [] };
      }),
      records: [
        ...envelopesFor('sysA', [component('a1'), component('a2'), component('a3')]),
        ...envelopesFor('sysB', [component('b1'), component('b2'), component('b3')]),
      ],
    });
    return fixture;
  };

  it('the bare whole-corpus save issues ZERO delete legs and keeps every document', async () => {
    // *Reddens when:* the hydrate path trusts the stored key, or the writeback derives
    // removals from it — the corpus is destroyed with no error and every count-based check
    // reports success. The BARE save is where it is corpus-wide, because `putAll` is what
    // derives every indexed document as a removal.
    const fixture = await downgraded();
    const manager = await managerFor(fixture);
    assert.equal(manager.getSystem('sysA').components.length, 3, 'hydrate used the INDEX');
    assert.equal(manager.getSystem('sysB').components.length, 3);
    fixture.host.calls.length = 0;

    await manager.save();

    assert.deepEqual(
      fixture.host.calls.filter((call) => call.leg === 'delete'),
      [],
      'zero delete legs'
    );
    assert.equal(fixture.recordKeys().length, 6, 'every component document survives');
  });

  it('a NAMED save on the same world is equally safe', async () => {
    const fixture = await downgraded();
    const manager = await managerFor(fixture);
    fixture.host.calls.length = 0;
    await manager.save({ put: manager.getSystem('sysA') });
    assert.deepEqual(fixture.host.calls.filter((call) => call.leg === 'delete'), []);
    assert.equal(fixture.recordKeys().length, 6);
  });

  it('POSITIVE HALF: a genuine delete still issues exactly ONE delete leg, naming ONE document', async () => {
    // Without this, "never delete" passes the item above and breaks the product.
    const fixture = await downgraded();
    const manager = await managerFor(fixture, { settle: true });
    const systemA = manager.getSystem('sysA');
    systemA.components = systemA.components.filter((entry) => entry.id !== 'a2');

    await manager.save({ put: systemA });

    assert.deepEqual(legsOf(fixture), ['delete:1'], 'exactly one delete leg, one document');
    assert.equal(fixture.host.calls[0].sent.length, 1, 'naming exactly one document');
    assert.deepEqual(fixture.recordKeys(), [
      'sysA.a1',
      'sysA.a3',
      'sysB.b1',
      'sysB.b2',
      'sysB.b3',
    ]);
  });
});

// ---------------------------------------------------------------------------
// 9. The three-phase order, driven to its real intermediate states
// ---------------------------------------------------------------------------

describe('the three phases run in the declared cross-class order', () => {
  it('a delete is issued AFTER the container write, never before it', async () => {
    // *Reddens when:* deletes are issued in phase 1 — a tear between the two then leaves the
    // referents destroyed while `essenceDefinitions[].sourceComponentId` still points at them.
    const fixture = await world({
      layout: PER_RECORD,
      target: PER_RECORD,
      systems: [
        system('sysA', [], {
          essenceDefinitions: [{ id: 'e1', name: 'Fire', sourceComponentId: 'a2' }],
        }),
      ],
      records: envelopesFor('sysA', [component('a1'), component('a2'), component('a3')]),
    });
    const manager = await managerFor(fixture);
    const order = [];
    const realSet = globalThis.game.settings.set;
    globalThis.game.settings.set = async (namespace, key, value) => {
      if (key === SETTING_KEYS.CRAFTING_SYSTEMS) order.push('container');
      return realSet(namespace, key, value);
    };
    const realDelete = fixture.host.documentClass.deleteDocuments;
    fixture.host.documentClass.deleteDocuments = async (...args) => {
      order.push('componentDelete');
      return realDelete(...args);
    };
    const realCreate = fixture.host.documentClass.createDocuments;
    fixture.host.documentClass.createDocuments = async (...args) => {
      order.push('componentCreate');
      return realCreate(...args);
    };

    try {
      const systemA = manager.getSystem('sysA');
      systemA.components = [
        ...systemA.components.filter((entry) => entry.id !== 'a2'),
        component('a4'),
      ];
      await manager.save({ put: systemA });
    } finally {
      globalThis.game.settings.set = realSet;
      fixture.host.documentClass.deleteDocuments = realDelete;
      fixture.host.documentClass.createDocuments = realCreate;
    }

    assert.deepEqual(order, ['componentCreate', 'container', 'componentDelete']);
  });

  it('a failed container write compensates phase 1 in reverse and issues no delete', async () => {
    // The compensable phase is exactly the one that is compensable WITHOUT identity loss,
    // because phase 1 is delete-free by construction.
    const fixture = await world({
      layout: PER_RECORD,
      target: PER_RECORD,
      systems: [system('sysA', [])],
      records: envelopesFor('sysA', [component('a1'), component('a2')]),
    });
    const manager = await managerFor(fixture);
    const before = fixture.recordKeys();
    const realSet = globalThis.game.settings.set;
    globalThis.game.settings.set = async (namespace, key, value) => {
      if (key === SETTING_KEYS.CRAFTING_SYSTEMS) throw new Error('socket lost');
      return realSet(namespace, key, value);
    };

    try {
      const systemA = manager.getSystem('sysA');
      systemA.components = [...systemA.components, component('a3')];
      await assert.rejects(() => manager.save({ put: systemA }), /socket lost/);
    } finally {
      globalThis.game.settings.set = realSet;
    }

    assert.deepEqual(fixture.recordKeys(), before, 'the created document was compensated away');
  });
});

// ---------------------------------------------------------------------------
// 24. The batch-close marker collapses a MIXED batch to one signal
// ---------------------------------------------------------------------------

describe('the batch-close marker is stamped on the FINAL leg of one logical write', () => {
  it('stamps every leg with one batch id and marks only the last', async () => {
    // *Reddens when:* the marker is not stamped — the receiver then sees one signal per leg.
    // A MIXED batch, because a pure-create import is already collapsed by the shipped
    // microtask fallback and would be green with and without the marker.
    const fixture = await world({
      layout: PER_RECORD,
      target: PER_RECORD,
      systems: [system('sysA', [])],
      records: envelopesFor('sysA', [component('a1'), component('a2')]),
    });
    const manager = await managerFor(fixture, { settle: true });

    const systemA = manager.getSystem('sysA');
    systemA.components = [
      { ...systemA.components[0], name: 'Renamed' },
      component('a3'),
    ];
    await manager.save({ put: systemA });

    const markers = fixture.host.calls.map((call) => call.options?.fabricateDefinitionBatch);
    assert.equal(legsOf(fixture).join(','), 'create:1,update:1,delete:1', 'a MIXED batch');
    // `updateDocuments`/`deleteDocuments` options are not recorded by the host, so the create
    // leg's marker is what pins the stamping; `final` is false there because two legs follow.
    assert.ok(markers[0], 'the first leg carries a marker');
    assert.equal(markers[0].final, false, 'and it is NOT the close');
  });

  it('marks the create leg as final when the write issues no delete', async () => {
    const fixture = await world({
      layout: PER_RECORD,
      target: PER_RECORD,
      systems: [system('sysA', [])],
      records: envelopesFor('sysA', [component('a1')]),
    });
    const manager = await managerFor(fixture, { settle: true });

    const systemA = manager.getSystem('sysA');
    systemA.components = [...systemA.components, component('a2')];
    await manager.save({ put: systemA });

    assert.deepEqual(legsOf(fixture), ['create:1'], 'one leg, so it must BE the close');
    const marker = fixture.host.calls[0].options?.fabricateDefinitionBatch;
    assert.ok(marker, 'stamped');
    assert.equal(marker.final, true, 'the create leg IS the close when nothing follows it');
  });
});

// ---------------------------------------------------------------------------
// 25. A replicated component change invalidates exactly ONE retained index
// ---------------------------------------------------------------------------

describe('a replicated component change replaces exactly one system`s array', () => {
  it('serves the new value for A and leaves B`s array identity untouched', async () => {
    // *Reddens when:* the applier patches the array in place without replacing it — A's
    // retained index then serves stale data; *and when* it replaces every system's array — B
    // rebuilds, undoing the whole retained-index property.
    const fixture = await world({
      layout: PER_RECORD,
      target: PER_RECORD,
      systems: [system('sysA', []), system('sysB', [])],
      records: [
        ...envelopesFor('sysA', [component('a1')]),
        ...envelopesFor('sysB', [component('b1')]),
      ],
    });
    const manager = await managerFor(fixture);
    const arrayA = manager.getSystem('sysA').components;
    const arrayB = manager.getSystem('sysB').components;

    const key = qualified('component.sysA.a1');
    const document = [...fixture.host.collection.documents.values()].find(
      (entry) => entry.key === key
    );
    document.applyChanges({ value: component('a1', { name: 'Replicated' }) });

    const changed = manager.applyReplicatedRecordChange({ key, operation: 'update', document });

    assert.equal(changed, true, 'the corpus moved');
    assert.equal(manager.getSystem('sysA').components[0].name, 'Replicated');
    assert.notEqual(
      manager.getSystem('sysA').components,
      arrayA,
      'A`s array is REPLACED, so its retained index is a fresh WeakMap key'
    );
    assert.equal(
      manager.getSystem('sysB').components,
      arrayB,
      'and B`s array identity is untouched, so its index is not rebuilt'
    );
  });

  it('returns false for a key that is not a component record', async () => {
    const fixture = await world({ layout: PER_RECORD, target: PER_RECORD, systems: [] });
    const manager = await managerFor(fixture);
    assert.equal(
      manager.applyReplicatedRecordChange({ key: qualified(LAYOUT_KEY), operation: 'update' }),
      false
    );
  });
});

// ---------------------------------------------------------------------------
// 29. A mid-session layout flip rebuilds the manager`s repository
// ---------------------------------------------------------------------------

describe('a mid-session component arrangement flip rebuilds the repository', () => {
  it('re-selects the arm, re-reads the corpus, and lands the next write in the NEW arm', async () => {
    // *Reddens when:* the rebuild is absent — the manager stays on the pre-flip arm for the
    // whole session and either every write is refused (guard installed) or the next save
    // re-writes the nested arrays the conversion just extracted (guard absent).
    const fixture = await world({
      layout: SINGLE_ARRAY,
      target: SINGLE_ARRAY,
      systems: [system('sysA', [component('a1')])],
    });
    const manager = await managerFor(fixture);
    assert.equal(manager.describeDefinitionStorage().components.granular, false);

    // The conversion completes underneath the open session.
    await createConvertedWorld(fixture);
    fixture.env.settings.set(TARGET_KEY, PER_RECORD);
    fixture.env.settings.set(LAYOUT_KEY, PER_RECORD);

    assert.equal(await manager.rebuildDefinitionStorage(), true, 'it rebuilt');
    assert.equal(manager.describeDefinitionStorage().components.granular, true);
    assert.equal(manager.getSystem('sysA').components.length, 1, 'read through the NEW arm');

    const systemA = manager.getSystem('sysA');
    systemA.components = [...systemA.components, component('a2')];
    await manager.save({ put: systemA });
    assert.deepEqual(fixture.recordKeys(), ['sysA.a1', 'sysA.a2'], 'and wrote through it');
  });

  it('declines while the pair disagrees, so nothing rebuilds mid-conversion', async () => {
    const fixture = await world({
      layout: SINGLE_ARRAY,
      target: SINGLE_ARRAY,
      systems: [system('sysA', [component('a1')])],
    });
    const manager = await managerFor(fixture);
    fixture.env.settings.set(TARGET_KEY, PER_RECORD);
    fixture.env.settings.set(LAYOUT_KEY, DEFINITION_STORAGE_LAYOUTS.UNSETTLED);
    assert.equal(await manager.rebuildDefinitionStorage(), false);
  });

  it('never replaces an INJECTED repository', async () => {
    const fixture = await world({ layout: SINGLE_ARRAY, target: SINGLE_ARRAY, systems: [] });
    globalThis.Setting = { implementation: fixture.host.documentClass };
    globalThis.game.settings.storage = { get: () => fixture.host.collection };
    const injected = { loadAll: async () => [], storesRecordsGranularly: () => false };
    const manager = new CraftingSystemManager({}, { repository: injected });
    fixture.env.settings.set(TARGET_KEY, PER_RECORD);
    fixture.env.settings.set(LAYOUT_KEY, PER_RECORD);
    assert.equal(await manager.rebuildDefinitionStorage(), false);
    assert.equal(manager._repository, injected);
  });
});

// ---------------------------------------------------------------------------
// 31. No UNNAMED system`s components diverge after a scoped save
// ---------------------------------------------------------------------------

describe('no system the change did not name diverges after a scoped save', () => {
  /**
   * The invariant: after any SCOPED save, every system NOT named by the change has an
   * in-memory component array byte-equal to its indexed documents.
   *
   * Its limit is where it is installed, and the limit is stated rather than implied: 61 suites
   * construct `CraftingSystemManager` directly and there is no shared constructor harness, so
   * in practice this checks the CALL SITES this fixture drives. Task 11's audit is the source
   * of that list and it is named below.
   *
   * @param {object} fixture
   * @param {object} manager
   * @param {string[]} named
   */
  function assertUnnamedSystemsAgree(fixture, manager, named) {
    for (const record of manager.getSystems()) {
      if (named.includes(record.id)) continue;
      const indexed = fixture
        .recordKeys()
        .filter((recordKey) => recordKey.startsWith(`${record.id}.`))
        .map((recordKey) => recordKey.slice(record.id.length + 1))
        .sort();
      const held = record.components.map((entry) => String(entry.id)).sort();
      assert.deepEqual(held, indexed, `${record.id} diverged after a save that did not name it`);
    }
  }

  it('holds across the driven sites Task 11`s audit enumerates', async () => {
    // *Reddens when:* a mutation to system B is flushed by a save naming system A.
    const fixture = await world({
      layout: PER_RECORD,
      target: PER_RECORD,
      systems: [
        system('sysA', [], { essenceDefinitions: [{ id: 'e1', name: 'Fire' }] }),
        system('sysB', []),
      ],
      records: [
        ...envelopesFor('sysA', [component('a1', { essences: { e1: 1 } }), component('a2')]),
        ...envelopesFor('sysB', [component('b1'), component('b2')]),
      ],
    });
    const manager = await managerFor(fixture);

    // Site 1 — `deleteEssence`, which mutates every carrying component in place and then saves
    // the OWNING system.
    await manager.deleteEssence('sysA', 'e1');
    assertUnnamedSystemsAgree(fixture, manager, ['sysA']);

    // Site 2 — a named `save({put})` after an in-place component edit on the same system.
    const systemA = manager.getSystem('sysA');
    systemA.components[0].name = 'Renamed in place';
    await manager.save({ put: systemA });
    assertUnnamedSystemsAgree(fixture, manager, ['sysA']);

    // Site 3 — a `batch` naming BOTH systems is correctly not a violation.
    await manager.save({ batch: manager.getSystems() });
    assertUnnamedSystemsAgree(fixture, manager, ['sysA', 'sysB']);

    // Site 4 — the whole-corpus fallback flushes everything, so there is nothing to catch.
    await manager.save();
    assertUnnamedSystemsAgree(fixture, manager, []);
  });

  it('the invariant can FAIL, so it is not vacuous', async () => {
    // Proving the check can report something is what stops it reading as a guarantee it is
    // not making. A mutation to B flushed by a save naming A is precisely the silent class.
    const fixture = await world({
      layout: PER_RECORD,
      target: PER_RECORD,
      systems: [system('sysA', []), system('sysB', [])],
      records: [
        ...envelopesFor('sysA', [component('a1')]),
        ...envelopesFor('sysB', [component('b1')]),
      ],
    });
    const manager = await managerFor(fixture);
    const systemB = manager.getSystem('sysB');
    systemB.components = [...systemB.components, component('b2')];

    await manager.save({ put: manager.getSystem('sysA') });

    assert.throws(
      () => assertUnnamedSystemsAgree(fixture, manager, ['sysA']),
      /sysB diverged/,
      'the invariant reports the exact class Task 11 audits for'
    );
  });
});

/**
 * Convert a fixture's world through the SHIPPED forward conversion.
 *
 * By the conversion rather than by hand-setting the layout, so what is exercised afterwards is
 * the state that actually ships.
 *
 * @param {object} fixture
 * @returns {Promise<void>}
 */
async function createConvertedWorld(fixture) {
  const { runForwardComponentStorageConversion } = await import(
    '../src/systems/componentStorageConversion.js'
  );
  await runForwardComponentStorageConversion(fixture.seams);
}
