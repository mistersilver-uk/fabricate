/**
 * The `1.32.0` component-essence election (issue 1371 r18-store, maintainer ruling M31).
 *
 * `essences` becomes a component world-default SECTION in this change, which means
 * `normalizeInherit` starts reading an ABSENT `inherit.essences` as INHERITING. Every membership
 * record `1.30.0` wrote carries exactly that absence, so once a world map exists an unmarked
 * record would follow it whatever its own system authored. This pass therefore does two things
 * at once, per world component: it ELECTS the world map from the oldest system that has rules
 * for the component, and it MARKS every membership record inheriting where that system's own
 * map equals the elected one and overriding — with its own map stored — where it does not.
 *
 * ## THE RULE, STATED, AND PINNED BELOW ARM BY ARM
 *
 * - the donor is the OLDEST system (stored corpus position, the `1.30.0` exception) holding an
 *   in-system row for the component; its normalized map is the world map;
 * - an EMPTY donor map elects nothing — absence-preserving, as `category` is;
 * - a record whose system's own map EQUALS the elected one (absence reading as empty) is marked
 *   `inherit.essences: true`; one that differs is marked `false` and carries its own map;
 * - a record with no in-system row left has nothing to preserve and is marked inheriting;
 * - an entity ANY of whose records already carries a boolean switch is left ALONE, world map and
 *   records both, which is what makes a re-run and a run after `1.30.0` a no-op;
 * - resolution at migration time is unchanged BY CONSTRUCTION: an inheriting record equals the
 *   world map, and an overriding one answers its own.
 *
 * ## THE PROOF THAT MATTERS IS THROUGH THE REAL UNION
 *
 * A marked corpus is only correct if the read union answers each system its own values, so the
 * decisive arm runs `resolveComponentScope` over the migrated payload after a real store `load()`
 * — the normalizers are where an absent switch either survives or is minted away.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { SETTING_KEYS } from '../src/config/settings.js';
import { migrateComponentEssenceSections } from '../src/migration/migrateComponentEssenceSections.js';
import { migrateWorldScopeEntities } from '../src/migration/migrateWorldScopeEntities.js';
import { MigrationRunner } from '../src/migration/MigrationRunner.js';
import { resolveComponentScope } from '../src/systems/componentScope.js';
import { membershipKey } from '../src/systems/scopedDefinitions.js';
import { createComponentScopeStore } from '../src/systems/worldScopeStores.js';

/** One in-system component row, source-linked so the `1.30.0` grouping merges it by item. */
function row(id, essences) {
  return { id, name: id, category: 'ore', tags: [], essences, registeredItemUuid: `Item.${id}` };
}

/** A `1.30.0`-era membership record: the category switch off, and NO essences switch. */
function migratedRecord(entityId, systemId) {
  return { entityId, systemId, inherit: { category: false }, category: 'ore' };
}

/**
 * The world a `1.31.0` install actually holds: three systems, oldest first, all holding rules
 * for `ingot`; the oldest and the middle agree on the map and the youngest does not. A second
 * component `dust` has NO essences anywhere.
 */
function migratedWorld() {
  return {
    systems: [
      { id: 'sys-old', name: 'Old', components: [row('ingot', { fire: 2, moss: 1 }), row('dust', {})] },
      { id: 'sys-mid', name: 'Mid', components: [row('ingot', { moss: 1, fire: 2, water: 0 })] },
      { id: 'sys-new', name: 'New', components: [row('ingot', { fire: 5 }), row('dust', {})] },
    ],
    componentScope: {
      entities: [
        { id: 'ingot', name: 'Iron Ingot' },
        { id: 'dust', name: 'Dust' },
      ],
      defaults: { ingot: { id: 'ingot', category: 'ore' } },
      membership: {
        [membershipKey('ingot', 'sys-old')]: migratedRecord('ingot', 'sys-old'),
        [membershipKey('ingot', 'sys-mid')]: migratedRecord('ingot', 'sys-mid'),
        [membershipKey('ingot', 'sys-new')]: migratedRecord('ingot', 'sys-new'),
        [membershipKey('dust', 'sys-old')]: migratedRecord('dust', 'sys-old'),
        [membershipKey('dust', 'sys-new')]: migratedRecord('dust', 'sys-new'),
      },
    },
  };
}

function record(data, entityId, systemId) {
  return data.componentScope.membership[membershipKey(entityId, systemId)];
}

test('it elects the world map from the OLDEST system holding rules, normalized', () => {
  const data = migratedWorld();
  migrateComponentEssenceSections(data);
  assert.deepEqual(
    data.componentScope.defaults.ingot,
    { id: 'ingot', category: 'ore', essences: { fire: 2, moss: 1 } },
    'the donor map, beside the category the earlier pass elected'
  );
});

test('and marks each record inheriting where its own map equals the elected one, overriding where not', () => {
  const data = migratedWorld();
  migrateComponentEssenceSections(data);
  assert.equal(record(data, 'ingot', 'sys-old').inherit.essences, true);
  assert.equal('essences' in record(data, 'ingot', 'sys-old'), false, 'nothing stored to override with');
  // `water: 0` is not a quantity, so the middle system's map normalizes EQUAL to the donor's.
  assert.equal(record(data, 'ingot', 'sys-mid').inherit.essences, true);
  assert.equal(record(data, 'ingot', 'sys-new').inherit.essences, false);
  assert.deepEqual(
    record(data, 'ingot', 'sys-new').essences,
    { fire: 5 },
    'the overriding system carries its own map on the record'
  );
  // The `category` switch the earlier pass wrote is untouched.
  assert.equal(record(data, 'ingot', 'sys-new').inherit.category, false);
});

test('an EMPTY donor map elects NOTHING, and every empty system inherits that nothing', () => {
  const data = migratedWorld();
  migrateComponentEssenceSections(data);
  assert.equal(
    'dust' in data.componentScope.defaults,
    false,
    'absence-preserving: no world default is minted for a component with no essences anywhere'
  );
  assert.equal(record(data, 'dust', 'sys-old').inherit.essences, true);
  assert.equal(record(data, 'dust', 'sys-new').inherit.essences, true);
});

test('a system whose map differs from an UNELECTED (empty) world map overrides with its own', () => {
  const data = migratedWorld();
  data.systems[0].components[1].essences = {};
  data.systems[2].components[1].essences = { ash: 1 };
  migrateComponentEssenceSections(data);
  assert.equal('dust' in data.componentScope.defaults, false, 'the donor is still empty');
  assert.equal(record(data, 'dust', 'sys-old').inherit.essences, true);
  assert.equal(record(data, 'dust', 'sys-new').inherit.essences, false);
  assert.deepEqual(record(data, 'dust', 'sys-new').essences, { ash: 1 });
});

test('a record with NO in-system row left is marked inheriting, having nothing to preserve', () => {
  const data = migratedWorld();
  data.systems[2].components = [];
  migrateComponentEssenceSections(data);
  const orphan = record(data, 'ingot', 'sys-new');
  assert.equal(orphan.inherit.essences, true);
  assert.equal('essences' in orphan, false);
  // AND THE DONOR IS THE OLDEST SYSTEM THAT STILL HOLDS A ROW: with the oldest emptied, the
  // middle system's DISTINCT map is what the world takes.
  const again = migratedWorld();
  again.systems[0].components = [];
  again.systems[1].components[0].essences = { moss: 4 };
  migrateComponentEssenceSections(again);
  assert.deepEqual(again.componentScope.defaults.ingot.essences, { moss: 4 });
  assert.equal(record(again, 'ingot', 'sys-old').inherit.essences, true, 'no row: inheriting');
  assert.equal(record(again, 'ingot', 'sys-new').inherit.essences, false);
});

test('it is IDEMPOTENT: an entity with any switch already decided is left alone, world map included', () => {
  const data = migratedWorld();
  migrateComponentEssenceSections(data);
  const first = JSON.stringify(data.componentScope);

  // A GM moves the world map and flips the youngest system to inherit, then the pass re-runs.
  data.componentScope.defaults.ingot.essences = { fire: 9 };
  record(data, 'ingot', 'sys-new').inherit.essences = true;
  const edited = JSON.stringify(data.componentScope);
  migrateComponentEssenceSections(data);
  assert.equal(JSON.stringify(data.componentScope), edited, 'a re-run undoes no GM edit');

  // And a record ADDED after the pass keeps the omitted switch "add to system" gave it.
  data.componentScope.membership[membershipKey('ingot', 'sys-added')] = {
    entityId: 'ingot',
    systemId: 'sys-added',
    inherit: {},
  };
  migrateComponentEssenceSections(data);
  assert.deepEqual(record(data, 'ingot', 'sys-added').inherit, {});
  assert.notEqual(first, edited, 'and the premise: the edit really did change the corpus');
});

test('a world default already carrying a map is NOT re-elected; the records are marked against it', () => {
  const data = migratedWorld();
  data.componentScope.defaults.ingot.essences = { fire: 5 };
  migrateComponentEssenceSections(data);
  assert.deepEqual(data.componentScope.defaults.ingot.essences, { fire: 5 });
  assert.equal(record(data, 'ingot', 'sys-new').inherit.essences, true, 'equal to the kept map');
  assert.equal(record(data, 'ingot', 'sys-old').inherit.essences, false);
  assert.deepEqual(record(data, 'ingot', 'sys-old').essences, { fire: 2, moss: 1 });
});

test('a malformed payload is skipped rather than repaired, and never throws', () => {
  for (const data of [null, {}, { componentScope: null }, { componentScope: { membership: [] } }]) {
    assert.doesNotThrow(() => migrateComponentEssenceSections(data));
  }
  const noSystems = migratedWorld();
  delete noSystems.systems;
  migrateComponentEssenceSections(noSystems);
  assert.equal(record(noSystems, 'ingot', 'sys-old').inherit.essences, true);
});

test('RESOLUTION IS UNCHANGED: after a real load, every system reads its own map through the union', async () => {
  const data = migratedWorld();
  migrateComponentEssenceSections(data);
  let persisted = data.componentScope;
  const store = createComponentScopeStore({
    getSetting: (key) => (key === SETTING_KEYS.COMPONENT_SCOPE ? persisted : undefined),
    setSetting: async (_key, next) => {
      persisted = next;
    },
  });
  store.load();
  for (const system of data.systems) {
    const [ingot] = resolveComponentScope(store.corpus(), system.id, system.components);
    const own = system.components[0].essences;
    const expected = Object.fromEntries(Object.entries(own).filter(([, qty]) => qty > 0));
    assert.deepEqual(ingot.essences, expected, `${system.id} resolves its OWN map`);
  }
  // AND THE WORLD MAP NOW REACHES THE TWO INHERITING SYSTEMS WHEN IT MOVES, which is the whole
  // point of the section: the maintainer's world essence edit was landing nowhere.
  persisted.defaults.ingot.essences = { fire: 7 };
  store.load();
  const [old] = resolveComponentScope(store.corpus(), 'sys-old', data.systems[0].components);
  const [young] = resolveComponentScope(store.corpus(), 'sys-new', data.systems[2].components);
  assert.deepEqual(old.essences, { fire: 7 });
  assert.deepEqual(young.essences, { fire: 5 }, 'the overriding system keeps its own');
});

test('a world that has NOT reached 1.30.0 gets the same corpus from that pass directly, so the two orders converge', () => {
  const raw = migratedWorld();
  const fresh = migrateWorldScopeEntities({
    systems: raw.systems,
    recipes: [],
    gatheringConfig: { systems: {} },
    componentScope: {},
    essenceScope: {},
    toolScope: {},
    worldScopeRekeyMap: {},
  });
  const direct = { systems: fresh.systems, componentScope: fresh.componentScope };
  const ingot = (systemId) => direct.componentScope.membership[membershipKey('ingot', systemId)];
  assert.deepEqual(direct.componentScope.defaults.ingot.essences, { fire: 2, moss: 1 });
  assert.equal(ingot('sys-old').inherit.essences, true);
  assert.equal(ingot('sys-mid').inherit.essences, true);
  assert.equal(ingot('sys-new').inherit.essences, false);
  assert.deepEqual(ingot('sys-new').essences, { fire: 5 });

  const before = JSON.stringify(direct.componentScope);
  migrateComponentEssenceSections(direct);
  assert.equal(JSON.stringify(direct.componentScope), before, 'and 1.32.0 then finds nothing to do');
});

test('the 1.32.0 entry is registered above 1.31.0 and declares its downgrade honestly', () => {
  const registry = new MigrationRunner({ getSetting: () => undefined, setSetting: () => {} })
    ._migrations;
  const entry = registry.find((migration) => migration.version === '1.32.0');
  assert.ok(entry, 'the 1.32.0 entry is registered');
  assert.equal(entry.downgradeTo, '1.31.0');
  assert.equal(entry.downgradeLosesData, true, 'a world map authored after it is read by no earlier version');
  assert.match(entry.label, /DOWNGRADING IS NOT LOSSLESS/);
  const data = migratedWorld();
  entry.migrate(data);
  assert.equal(record(data, 'ingot', 'sys-new').inherit.essences, false, 'and it runs the pass');
});
