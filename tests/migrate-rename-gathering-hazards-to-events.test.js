import test from 'node:test';
import assert from 'node:assert/strict';

import { migrateRenameGatheringHazardsToEvents } from '../src/migration/migrateRenameGatheringHazardsToEvents.js';
import { MigrationRunner } from '../src/migration/MigrationRunner.js';
import { normalizeGatheringRealmModifier } from '../src/systems/gatheringRealms.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

/** A pre-1.0.0 (hazard-schema) data bundle covering every renamed surface. */
function legacyData() {
  return {
    systems: [
      {
        id: 'sys-a',
        name: 'Alpha',
        gatheringRegions: [
          {
            id: 'north',
            modifiers: [
              { id: 'm1', kind: 'hazardChance', operation: 'add', value: 10 },
              { id: 'm2', kind: 'dropRate', operation: 'multiply', value: 2 }
            ]
          }
        ]
      }
    ],
    gatheringConfig: {
      systems: {
        'sys-a': {
          rules: {
            hazardSelectionMode: 'highestRankedDrop',
            hazardLimit: 3,
            hazardPolicy: 'failureWithHazard',
            hazardVisibility: 'encounterChance'
          },
          hazards: [
            {
              id: 'h1',
              name: 'Volcanic Eruption',
              img: 'icons/svg/hazard.svg',
              dangerTags: ['hazardous'],
              dropRate: 40,
              hazardModifier: { provider: 'macro', macroUuid: 'Macro.x' }
            }
          ]
        }
      }
    },
    environments: [
      {
        id: 'env-a',
        craftingSystemId: 'sys-a',
        enabledHazardIds: ['h1'],
        disabledHazardIds: ['h2'],
        forcedHazardIds: ['h3'],
        hazardOrder: ['h1', 'h3'],
        hazardSelectionMode: 'allDrops',
        hazardPolicy: 'successWithHazard',
        hazardDropRateAdjustments: { h1: 15 },
        hazardDropRateAdjustmentsEnabled: { h1: false }
      }
    ]
  };
}

// ---------------------------------------------------------------------------
// Core rename
// ---------------------------------------------------------------------------

test('renames the gathering-config collection, rules, and event-record fields', () => {
  const { gatheringConfig } = migrateRenameGatheringHazardsToEvents(legacyData());
  const sys = gatheringConfig.systems['sys-a'];

  assert.ok(Array.isArray(sys.events), 'hazards -> events collection');
  assert.equal(sys.hazards, undefined, 'legacy hazards key removed');

  assert.equal(sys.rules.eventSelectionMode, 'highestRankedDrop');
  assert.equal(sys.rules.eventLimit, 3);
  assert.equal(sys.rules.eventPolicy, 'failureWithEvent', 'policy value remapped');
  assert.equal(sys.rules.eventVisibility, 'encounterChance', 'visibility tier value unchanged');
  assert.equal(sys.rules.hazardSelectionMode, undefined);
  assert.equal(sys.rules.hazardPolicy, undefined);

  const event = sys.events[0];
  assert.ok(event.eventModifier, 'hazardModifier -> eventModifier');
  assert.equal(event.hazardModifier, undefined);
});

test('renames per-environment composition keys and remaps the policy value', () => {
  const { environments } = migrateRenameGatheringHazardsToEvents(legacyData());
  const env = environments[0];

  assert.deepEqual(env.enabledEventIds, ['h1']);
  assert.deepEqual(env.disabledEventIds, ['h2']);
  assert.deepEqual(env.forcedEventIds, ['h3']);
  assert.deepEqual(env.eventOrder, ['h1', 'h3']);
  assert.equal(env.eventSelectionMode, 'allDrops');
  assert.equal(env.eventPolicy, 'successWithEvent', 'policy value remapped');
  assert.deepEqual(env.eventDropRateAdjustments, { h1: 15 });
  assert.deepEqual(env.eventDropRateAdjustmentsEnabled, { h1: false });

  for (const legacyKey of [
    'enabledHazardIds', 'disabledHazardIds', 'forcedHazardIds', 'hazardOrder',
    'hazardSelectionMode', 'hazardPolicy', 'hazardDropRateAdjustments', 'hazardDropRateAdjustmentsEnabled'
  ]) {
    assert.equal(env[legacyKey], undefined, `${legacyKey} removed`);
  }
});

test('renames the region-modifier kind value hazardChance -> eventChance', () => {
  const { systems } = migrateRenameGatheringHazardsToEvents(legacyData());
  const modifiers = systems[0].gatheringRegions[0].modifiers;
  assert.equal(modifiers[0].kind, 'eventChance', 'hazardChance -> eventChance');
  assert.equal(modifiers[1].kind, 'dropRate', 'other modifier kinds unchanged');
});

// ---------------------------------------------------------------------------
// Keep-list: things that must NOT change
// ---------------------------------------------------------------------------

test('preserves the default-image asset path and the hazardous danger tier', () => {
  const { gatheringConfig } = migrateRenameGatheringHazardsToEvents(legacyData());
  const event = gatheringConfig.systems['sys-a'].events[0];
  assert.equal(event.img, 'icons/svg/hazard.svg', 'Foundry core asset path unchanged');
  assert.deepEqual(event.dangerTags, ['hazardous'], 'hazardous danger tier unchanged');
});

test('does not touch a d100 failure-result group literally named "hazard"', () => {
  // The failure-keyword `hazard` is a separate concept; nothing the migration
  // walks should rewrite a stored result group that happens to be named "hazard".
  const data = legacyData();
  data.gatheringConfig.systems['sys-a'].hazards[0].resultGroups = [{ name: 'hazard' }];
  const { gatheringConfig } = migrateRenameGatheringHazardsToEvents(data);
  assert.equal(gatheringConfig.systems['sys-a'].events[0].resultGroups[0].name, 'hazard');
});

// ---------------------------------------------------------------------------
// Idempotency and anomalous payloads
// ---------------------------------------------------------------------------

test('is idempotent: a second run makes no further change', () => {
  const once = migrateRenameGatheringHazardsToEvents(legacyData());
  const twice = migrateRenameGatheringHazardsToEvents(clone(once));
  assert.deepEqual(twice, once);
});

test('does not clobber an already-migrated collection; leaves a stale legacy key inert', () => {
  const data = legacyData();
  // Anomalous: events already present alongside a stale hazards array.
  data.gatheringConfig.systems['sys-a'].events = [{ id: 'already', name: 'Merchant' }];
  const { gatheringConfig } = migrateRenameGatheringHazardsToEvents(data);
  const sys = gatheringConfig.systems['sys-a'];
  assert.deepEqual(sys.events.map(e => e.id), ['already'], 'existing events not clobbered');
  // The stale hazards array is left inert (no data loss), not merged.
  assert.ok(Array.isArray(sys.hazards), 'stale legacy collection left inert');
});

test('migrates each rule key independently when old and new keys are mixed', () => {
  const data = legacyData();
  const rules = data.gatheringConfig.systems['sys-a'].rules;
  rules.eventPolicy = 'successWithEvent'; // already migrated
  // hazardLimit is still legacy and should migrate on its own.
  const { gatheringConfig } = migrateRenameGatheringHazardsToEvents(data);
  const out = gatheringConfig.systems['sys-a'].rules;
  assert.equal(out.eventPolicy, 'successWithEvent', 'existing new policy untouched');
  assert.equal(out.eventLimit, 3, 'legacy hazardLimit migrated independently');
});

test('renames a drop-rate adjustment map even when the events collection is absent', () => {
  const data = legacyData();
  delete data.gatheringConfig.systems['sys-a'].hazards;
  const { environments } = migrateRenameGatheringHazardsToEvents(data);
  assert.deepEqual(environments[0].eventDropRateAdjustments, { h1: 15 });
});

test('does not mutate its inputs (deep-clones)', () => {
  const input = legacyData();
  const snapshot = clone(input);
  migrateRenameGatheringHazardsToEvents(input);
  assert.deepEqual(input, snapshot, 'input bundle left unchanged');
});

// ---------------------------------------------------------------------------
// Through the runner
// ---------------------------------------------------------------------------

test('runs through MigrationRunner from 0.9.0, rewrites the data, and lands at the highest version', async () => {
  const data = legacyData();
  // Minimal in-memory settings backing the runner; migrationVersion 0.9.0 leaves
  // the 1.0.0 and 1.1.0 migrations pending.
  const store = new Map([
    ['migrationVersion', '0.9.0'],
    ['craftingSystems', clone(data.systems)],
    ['gatheringConfig', clone(data.gatheringConfig)],
    ['gatheringEnvironments', clone(data.environments)]
  ]);
  const runner = new MigrationRunner({
    getSetting: key => store.get(key) ?? null,
    setSetting: async (key, value) => { store.set(key, value); }
  });

  await runner.run();

  assert.equal(store.get('migrationVersion'), '1.4.0', 'advances to the new highest version');
  const sys = store.get('gatheringConfig').systems['sys-a'];
  assert.ok(Array.isArray(sys.events), 'persisted gatheringConfig was rewritten to events');
  assert.equal(sys.rules.eventPolicy, 'failureWithEvent');
  assert.deepEqual(store.get('gatheringEnvironments')[0].enabledEventIds, ['h1']);
  // After the 1.1.0 rename migration runs (in semver order, after 1.0.0), the
  // per-system realm library is persisted under `gatheringRealms`.
  assert.equal(store.get('craftingSystems')[0].gatheringRealms[0].modifiers[0].kind, 'eventChance');
});

// ---------------------------------------------------------------------------
// Legacy-acceptance fallback on read (imports bypass the startup migration)
// ---------------------------------------------------------------------------

test('realm-modifier normalizer accepts the legacy hazardChance kind on read', () => {
  const modifier = normalizeGatheringRealmModifier({ kind: 'hazardChance', value: 5 });
  assert.equal(modifier.kind, 'eventChance', 'coerced legacy kind, not dropped to custom');
});
