/**
 * Migration 1.27.0 — `migrateTravelToWorldScope` (issue 1282).
 *
 * Lifts the realm library, the reveal mode and the modifier visibility off every crafting system
 * and into the `travelConfig` world setting, leaving each system with
 * `gatheringRealmSettings = { enabled }`, and collapses each party's per-system realm override
 * into one. Three properties decide whether a GM's world survives the upgrade:
 *
 *   - **Reference preservation.** Environments (`includedRealmIds` / `excludedRealmIds`), party
 *     overrides and actor discovery flags all cite realms by ID. A realm dropped by the merge
 *     orphans every reference to it, so the merge is a union keyed by id.
 *   - **Idempotence.** A second run must never re-impose stale system blocks over a library the
 *     GM has since edited — including a realm they deliberately deleted. That guard depends on
 *     the runner actually READING the stored `travelConfig`, which the runner test at the foot
 *     of this file exists to pin: suppress that read and the deleted realm comes back.
 *   - **Writeback ordering.** `travelConfig` is the destination and `craftingSystems` the
 *     source. Strip the source first and a failed destination write destroys the library.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildWorldTravelConfig,
  collapsePartyRealmOverrides,
  migrateTravelToWorldScope,
  stripSystemTravelConfig,
} from '../src/migration/migrateTravelToWorldScope.js';
import { MigrationRunner } from '../src/migration/MigrationRunner.js';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function systemWithTravel(id, realms, settings = { enabled: true }) {
  return { id, name: id, gatheringRealms: realms, gatheringRealmSettings: settings };
}

describe('buildWorldTravelConfig', () => {
  it('unions realms across systems by id, first system winning a collision', () => {
    const built = buildWorldTravelConfig([
      systemWithTravel('herbalism', [
        { id: 'vale', name: 'Northreach Vale' },
        { id: 'fen', name: 'Sunken Fen' },
      ]),
      systemWithTravel('smithing', [
        { id: 'vale', name: 'The Vale' },
        { id: 'quarry', name: 'Grey Quarry' },
      ]),
    ]);

    assert.deepEqual(
      built.realms.map((realm) => realm.id),
      ['vale', 'fen', 'quarry'],
      'every id from either system survives, in first-seen order'
    );
    assert.equal(
      built.realms.find((realm) => realm.id === 'vale').name,
      'Northreach Vale',
      'the earlier system wins an id collision, deterministically'
    );
    assert.deepEqual(
      built._collisions,
      [{ realmId: 'vale', keptFrom: 'herbalism', discardedFrom: 'smithing' }],
      'the discarded copy is REPORTED, never re-keyed: re-keying orphans every reference to it'
    );
  });

  it('drops craftingSystemId — a world realm has no owning system', () => {
    const built = buildWorldTravelConfig([
      systemWithTravel('herbalism', [{ id: 'vale', name: 'Vale', craftingSystemId: 'herbalism' }]),
    ]);
    assert.equal('craftingSystemId' in built.realms[0], false);
  });

  it('carries sceneMappings across, because a map region link IS the realm record', () => {
    const built = buildWorldTravelConfig([
      systemWithTravel('herbalism', [
        { id: 'vale', sceneMappings: [{ sceneUuid: 'Scene.s1', sceneRegionUuid: 'Scene.s1.Region.r1' }] },
      ]),
    ]);
    assert.deepEqual(built.realms[0].sceneMappings, [
      { sceneUuid: 'Scene.s1', sceneRegionUuid: 'Scene.s1.Region.r1' },
    ]);
  });

  it('adopts the scalars from the first ENABLED system, not merely the first system', () => {
    // A system with travel switched off never configured these deliberately, so an enabled
    // system's choice is the only signal available about how this world reveals its places.
    const built = buildWorldTravelConfig([
      systemWithTravel('off', [], { enabled: false, revealMode: 'manual', modifierVisibility: 'gmOnly' }),
      systemWithTravel('on', [], { enabled: true, revealMode: 'alwaysVisible', modifierVisibility: 'visible' }),
    ]);
    assert.equal(built.revealMode, 'alwaysVisible');
    assert.equal(built.modifierVisibility, 'visible');
  });

  it('falls back to a disabled system rather than silently reverting to the defaults', () => {
    // Every system switched off still had a GM configure it. Reverting to `manual` here would
    // start hiding realm names the moment they switched one back on — and silently, since a
    // missing reveal mode coerces rather than throws.
    const built = buildWorldTravelConfig([
      systemWithTravel('off', [], { enabled: false, revealMode: 'alwaysVisible' }),
    ]);
    assert.equal(built.revealMode, 'alwaysVisible');
  });

  it('reads the pre-1.1.0 gatheringRegions / gatheringRegionSettings keys too', () => {
    const built = buildWorldTravelConfig([
      {
        id: 'legacy',
        gatheringRegions: [{ id: 'north', name: 'North' }],
        gatheringRegionSettings: { enabled: true, revealMode: 'alwaysVisible' },
      },
    ]);
    assert.deepEqual(built.realms.map((r) => r.id), ['north']);
    assert.equal(built.revealMode, 'alwaysVisible');
  });

  it('skips a malformed system or realm rather than repairing it', () => {
    const built = buildWorldTravelConfig([
      null,
      'nope',
      systemWithTravel('ok', [null, { name: 'no id' }, { id: '   ' }, { id: 'vale' }]),
    ]);
    assert.deepEqual(built.realms.map((r) => r.id), ['vale']);
  });
});

describe('stripSystemTravelConfig', () => {
  it('reduces the travel block to the participation flag and drops the library', () => {
    const [system] = stripSystemTravelConfig([
      systemWithTravel('herbalism', [{ id: 'vale' }], {
        enabled: true,
        revealMode: 'alwaysVisible',
        modifierVisibility: 'gmOnly',
      }),
    ]);
    assert.equal(system.gatheringRealms, undefined);
    assert.deepEqual(system.gatheringRealmSettings, { enabled: true });
  });

  it('drops the legacy region keys as well, so they cannot resurrect the library', () => {
    const [system] = stripSystemTravelConfig([
      { id: 'legacy', gatheringRegions: [{ id: 'north' }], gatheringRegionSettings: { enabled: true } },
    ]);
    assert.equal(system.gatheringRegions, undefined);
    assert.equal(system.gatheringRegionSettings, undefined);
    assert.deepEqual(system.gatheringRealmSettings, { enabled: true });
  });

  it('returns an already-shrunk system BY REFERENCE, so change detection stays honest', () => {
    // The runner decides whether to write by JSON comparison, but returning a fresh object for
    // an unchanged system is how an upgrade that should have been a no-op starts writing.
    const system = { id: 'herbalism', gatheringRealmSettings: { enabled: false } };
    const [result] = stripSystemTravelConfig([system]);
    assert.equal(result, system);
  });

  it('defaults a missing participation flag to false rather than opting a system in', () => {
    const [system] = stripSystemTravelConfig([{ id: 'x', gatheringRealms: [{ id: 'vale' }] }]);
    assert.deepEqual(system.gatheringRealmSettings, { enabled: false });
  });
});

describe('collapsePartyRealmOverrides', () => {
  it('keeps the most recently updated placement — the GM’s latest statement of where they are', () => {
    const { parties } = collapsePartyRealmOverrides([
      {
        id: 'p1',
        currentRealmOverrides: {
          herbalism: { mode: 'manual', realmIds: ['vale'], updatedAt: 10, updatedByUserId: 'u1' },
          smithing: { mode: 'manual', realmIds: ['quarry'], updatedAt: 20, updatedByUserId: 'u2' },
        },
      },
    ]);
    assert.deepEqual(parties[0].currentRealmOverride, {
      mode: 'manual',
      realmIds: ['quarry'],
      updatedAt: 20,
      updatedByUserId: 'u2',
    });
    assert.equal(parties[0].currentRealmOverrides, undefined);
  });

  it('prefers a real placement over a cleared one, however recently it was cleared', () => {
    // A `none` entry records that the GM cleared the override for one system. That is not a
    // statement about where the party is, so it must not outrank a system where they set one.
    const { parties } = collapsePartyRealmOverrides([
      {
        id: 'p1',
        currentRealmOverrides: {
          herbalism: { mode: 'manual', realmIds: ['vale'], updatedAt: 10 },
          smithing: { mode: 'none', realmIds: [], updatedAt: 99 },
        },
      },
    ]);
    assert.deepEqual(parties[0].currentRealmOverride.realmIds, ['vale']);
  });

  it('reports a party whose competing manual placements had to be resolved', () => {
    const { collapsed } = collapsePartyRealmOverrides([
      {
        id: 'p1',
        currentRealmOverrides: {
          a: { mode: 'manual', realmIds: ['vale'], updatedAt: 1 },
          b: { mode: 'manual', realmIds: ['quarry'], updatedAt: 2 },
        },
      },
    ]);
    assert.deepEqual(collapsed, [{ partyId: 'p1', competing: 2 }]);
  });

  it('reads the pre-1.1.0 currentRegionOverrides key too', () => {
    const { parties } = collapsePartyRealmOverrides([
      { id: 'p1', currentRegionOverrides: { a: { mode: 'manual', realmIds: ['north'], updatedAt: 3 } } },
    ]);
    assert.deepEqual(parties[0].currentRealmOverride.realmIds, ['north']);
    assert.equal(parties[0].currentRegionOverrides, undefined);
  });

  it('leaves an already-collapsed party BY REFERENCE', () => {
    const party = { id: 'p1', currentRealmOverride: { mode: 'none', realmIds: [] } };
    const { parties } = collapsePartyRealmOverrides([party]);
    assert.equal(parties[0], party);
  });

  it('drops an empty override map without inventing a placement', () => {
    const { parties } = collapsePartyRealmOverrides([{ id: 'p1', currentRealmOverrides: {} }]);
    assert.equal(parties[0].currentRealmOverride, undefined);
    assert.equal(parties[0].currentRealmOverrides, undefined);
  });
});

describe('migrateTravelToWorldScope', () => {
  it('lifts a disabled system’s realms too: its environments may reference them', () => {
    const result = migrateTravelToWorldScope({
      systems: [
        systemWithTravel('on', [{ id: 'vale' }], { enabled: true }),
        systemWithTravel('off', [{ id: 'quarry' }], { enabled: false }),
      ],
      travelConfig: {},
    });
    assert.deepEqual(result.travelConfig.realms.map((r) => r.id), ['vale', 'quarry']);
    assert.deepEqual(result.systems[0].gatheringRealmSettings, { enabled: true });
    assert.deepEqual(result.systems[1].gatheringRealmSettings, { enabled: false });
  });

  it('is idempotent: a populated world library is authoritative and never re-merged', () => {
    // The GM has since deleted `fen`. Re-running must not resurrect it from the stale block.
    const systems = [systemWithTravel('herbalism', [{ id: 'vale' }, { id: 'fen' }])];
    const once = migrateTravelToWorldScope({ systems, travelConfig: {} });
    const edited = { ...once.travelConfig, realms: [{ id: 'vale' }] };

    const twice = migrateTravelToWorldScope({ systems, travelConfig: edited });
    assert.deepEqual(
      twice.travelConfig.realms.map((r) => r.id),
      ['vale'],
      'the deleted realm must not come back'
    );
  });

  it('re-running over already-shrunk systems changes nothing', () => {
    const first = migrateTravelToWorldScope({
      systems: [systemWithTravel('herbalism', [{ id: 'vale' }])],
      gatheringParties: [{ id: 'p1', currentRealmOverrides: { a: { mode: 'manual', realmIds: ['vale'] } } }],
      travelConfig: {},
    });
    const second = migrateTravelToWorldScope({
      systems: first.systems,
      gatheringParties: first.gatheringParties,
      travelConfig: first.travelConfig,
    });

    assert.deepEqual(second.systems, first.systems);
    assert.deepEqual(second.travelConfig, first.travelConfig);
    assert.deepEqual(second.gatheringParties, first.gatheringParties);
  });

  it('returns the STORED config object when there was nothing to lift', () => {
    // The runner detects change by JSON comparison, so emitting a freshly-built `{ realms: [] }`
    // over a stored `{}` would register as a change and write the setting in every world that
    // never used travel — an unexplained write in an otherwise no-op upgrade.
    const stored = {};
    const result = migrateTravelToWorldScope({ systems: [{ id: 'herbalism' }], travelConfig: stored });
    assert.equal(result.travelConfig, stored);
  });

  it('never throws on absent or malformed input', () => {
    assert.deepEqual(migrateTravelToWorldScope(), {
      systems: [],
      gatheringParties: [],
      travelConfig: {},
    });
    assert.deepEqual(
      migrateTravelToWorldScope({ systems: 'nope', gatheringParties: 'nope', travelConfig: 'nope' }),
      { systems: [], gatheringParties: [], travelConfig: {} }
    );
  });
});

// ---------------------------------------------------------------------------
// Through the real MigrationRunner — the read, the writeback and their ORDER
// ---------------------------------------------------------------------------

function makeSettings(initial = {}) {
  const store = new Map(
    Object.entries({
      recipes: [],
      craftingSystems: [],
      gatheringConfig: {},
      gatheringEnvironments: [],
      gatheringParties: [],
      migrationVersion: '1.26.0', // only 1.27.0 is pending
      ...initial,
    })
  );
  const calls = { set: [] };
  return {
    store,
    calls,
    getSetting: (key) => store.get(key) ?? null,
    setSetting: async (key, value) => {
      calls.set.push({ key, value: clone(value) });
      store.set(key, value);
      return value;
    },
  };
}

describe('MigrationRunner 1.27.0 leg', () => {
  it('lifts the library, shrinks the systems and collapses the overrides in one run', async () => {
    const settings = makeSettings({
      craftingSystems: [
        systemWithTravel('herbalism', [{ id: 'vale', name: 'Vale', craftingSystemId: 'herbalism' }], {
          enabled: true,
          revealMode: 'alwaysVisible',
          modifierVisibility: 'gmOnly',
        }),
      ],
      gatheringParties: [
        { id: 'p1', name: 'Heroes', currentRealmOverrides: { herbalism: { mode: 'manual', realmIds: ['vale'], updatedAt: 5 } } },
      ],
    });
    const runner = new MigrationRunner({ getSetting: settings.getSetting, setSetting: settings.setSetting });

    await runner.run();

    const config = settings.store.get('travelConfig');
    assert.deepEqual(config.realms.map((r) => r.id), ['vale']);
    assert.equal(config.revealMode, 'alwaysVisible');
    assert.equal(config.modifierVisibility, 'gmOnly');
    assert.equal(settings.store.get('craftingSystems')[0].gatheringRealms, undefined);
    assert.deepEqual(settings.store.get('gatheringParties')[0].currentRealmOverride.realmIds, ['vale']);
  });

  it('writes the DESTINATION before the source, so a failed write cannot destroy the library', async () => {
    const settings = makeSettings({
      craftingSystems: [systemWithTravel('herbalism', [{ id: 'vale' }])],
    });
    const runner = new MigrationRunner({ getSetting: settings.getSetting, setSetting: settings.setSetting });

    await runner.run();

    const keys = settings.calls.set.map((call) => call.key);
    assert.ok(
      keys.indexOf('travelConfig') < keys.indexOf('craftingSystems'),
      'the systems are the SOURCE of the lift: tearing them down first is unrecoverable'
    );
  });

  it('READS the stored travelConfig, so an edited library survives a legacy re-import', async () => {
    // This is the mutation guard for the runner's read leg. A legacy export re-imported over an
    // already-migrated world resets the systems (imports do not re-run migrations inline) while
    // the world library keeps the GM's edits. Drop the read and `fen` — which the GM deliberately
    // deleted — is silently resurrected from the re-imported system block.
    const settings = makeSettings({
      craftingSystems: [systemWithTravel('herbalism', [{ id: 'vale' }, { id: 'fen' }])],
      travelConfig: { revealMode: 'alwaysVisible', modifierVisibility: 'visible', realms: [{ id: 'vale', name: 'Vale' }] },
      migrationVersion: '1.26.0',
    });
    const runner = new MigrationRunner({ getSetting: settings.getSetting, setSetting: settings.setSetting });

    await runner.run();

    assert.deepEqual(
      settings.store.get('travelConfig').realms.map((r) => r.id),
      ['vale'],
      'the deleted realm must not come back'
    );
    assert.equal(settings.store.get('travelConfig').revealMode, 'alwaysVisible');
    assert.equal(settings.store.get('craftingSystems')[0].gatheringRealms, undefined);
  });

  it('takes no travelConfig write in a world that never used travel', async () => {
    const settings = makeSettings({ craftingSystems: [{ id: 'herbalism', name: 'Herbalism' }] });
    const runner = new MigrationRunner({ getSetting: settings.getSetting, setSetting: settings.setSetting });

    await runner.run();

    assert.equal(
      settings.calls.set.some((call) => call.key === 'travelConfig'),
      false
    );
  });
});
