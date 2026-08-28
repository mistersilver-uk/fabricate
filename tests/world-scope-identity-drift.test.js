/**
 * `reportWorldIdentityDrift`, PARTS (b) AND (c) (issue 1363, criterion 8).
 *
 * Part (a) — the ZERO case over the whole differential Inputs set — lives beside the differential
 * it is derived from, in `tests/world-scope-migration-differential.test.js`.
 *
 * DRIFTING THE CORPUS IS NOT A CODE MUTATION. An earlier form of this criterion was
 * "mutation-proven against a hand-drifted corpus", which varies the INPUT rather than the code and
 * is satisfied by a detector that reports every field always. So (b) is per-lifted-field positive
 * coverage and (c) mutates the DETECTOR in both directions: an always-equal detector must redden
 * (b), and an always-unequal detector must redden (a).
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { WORLD_IDENTITY_FIELDS } from '../src/migration/worldScopeEntityGrouping.js';
import { reportWorldIdentityDrift } from '../src/systems/worldIdentityDrift.js';

const ENTITY_FIELDS = { components: 'components', essences: 'essenceDefinitions', tools: 'tools' };

/** A world in which the two identity copies are EQUAL, as the migration leaves them. */
function equalWorld() {
  const identity = {
    components: {
      name: 'Ash Salt',
      img: 'a.png',
      description: 'A',
      originItemUuid: 'Item.a',
      registeredItemUuid: 'Item.a',
      aliasItemUuids: ['Item.b'],
    },
    essences: { name: 'Fire', icon: 'fas fa-fire', colorToken: 'rose', description: 'Fire' },
    tools: {
      name: 'Hammer',
      img: 'h.png',
      description: 'H',
      originItemUuid: 'Item.c',
      registeredItemUuid: 'Item.c',
      aliasItemUuids: [],
    },
  };
  const scopeCorpus = {};
  const system = { id: 'sys-a', components: [], essenceDefinitions: [], tools: [] };
  for (const [entityType, field] of Object.entries(ENTITY_FIELDS)) {
    const id = `${entityType}-1`;
    system[field] = [{ id, ...identity[entityType], behaviour: 'in-system only' }];
    scopeCorpus[entityType] = {
      entities: [{ id, ...identity[entityType] }],
      defaults: {},
      membership: { [`${id}|sys-a`]: { entityId: id, systemId: 'sys-a', inherit: {} } },
    };
  }
  return { systems: [system], scopeCorpus };
}

test('the ZERO case: an equal world reports NOTHING', () => {
  const { systems, scopeCorpus } = equalWorld();
  assert.deepEqual(reportWorldIdentityDrift(systems, scopeCorpus), []);
});

test('(b) per-lifted-field positive coverage: exactly one entry, naming the tuple and the field', () => {
  for (const [entityType, fields] of Object.entries(WORLD_IDENTITY_FIELDS)) {
    for (const field of fields) {
      const { systems, scopeCorpus } = equalWorld();
      const record = systems[0][ENTITY_FIELDS[entityType]][0];
      record[field] = Array.isArray(record[field]) ? ['DRIFTED'] : 'DRIFTED';
      const drift = reportWorldIdentityDrift(systems, scopeCorpus);
      assert.equal(drift.length, 1, `${entityType}.${field}: exactly one entry`);
      assert.deepEqual(
        {
          systemId: drift[0].systemId,
          entityType: drift[0].entityType,
          entityId: drift[0].entityId,
          field: drift[0].field,
        },
        { systemId: 'sys-a', entityType, entityId: `${entityType}-1`, field }
      );
    }
  }
});

test('ABSENCE is a value: a field present on one side and absent on the other is drift', () => {
  const { systems, scopeCorpus } = equalWorld();
  delete systems[0].components[0].description;
  const drift = reportWorldIdentityDrift(systems, scopeCorpus);
  assert.equal(drift.length, 1);
  assert.equal(drift[0].field, 'description');
});

test('an entity the system is NOT a member of is not compared at all', () => {
  const { systems, scopeCorpus } = equalWorld();
  scopeCorpus.components.membership = {};
  systems[0].components[0].name = 'DRIFTED';
  assert.deepEqual(
    reportWorldIdentityDrift(systems, scopeCorpus),
    [],
    'the entity does not exist in that system, so there is no in-system copy to disagree with'
  );
});

test('a non-identity field is NEVER reported, however far it diverges', () => {
  const { systems, scopeCorpus } = equalWorld();
  systems[0].components[0].behaviour = 'changed';
  systems[0].components[0].salvage = { enabled: false };
  assert.deepEqual(reportWorldIdentityDrift(systems, scopeCorpus), []);
});

test('the detector is TOTAL: a malformed corpus answers an empty list', () => {
  for (const [systems, corpus] of [
    [null, null],
    ['nope', 7],
    [[null, 'x', { id: 'sys', components: 'nope' }], { components: 'nope' }],
  ]) {
    assert.deepEqual(reportWorldIdentityDrift(systems, corpus), []);
  }
});

test('(c) an ALWAYS-EQUAL detector reddens the positive coverage', () => {
  // The first stub mutation, run in-test rather than against a patched source file: a detector
  // that reports nothing satisfies the ZERO case perfectly and is useless.
  const alwaysEqual = () => [];
  const { systems, scopeCorpus } = equalWorld();
  systems[0].components[0].name = 'DRIFTED';
  assert.equal(
    reportWorldIdentityDrift(systems, scopeCorpus).length,
    1,
    'the real detector reports the drift'
  );
  assert.equal(alwaysEqual().length, 0, 'and the always-equal stub does not — so (b) would RED');
});

test('(c) an ALWAYS-UNEQUAL detector reddens the ZERO case', () => {
  const { systems, scopeCorpus } = equalWorld();
  const alwaysUnequal = (corpusSystems) =>
    corpusSystems.flatMap((system) =>
      system.components.map((record) => ({
        systemId: system.id,
        entityType: 'components',
        entityId: record.id,
        field: 'name',
      }))
    );
  assert.deepEqual(
    reportWorldIdentityDrift(systems, scopeCorpus),
    [],
    'the real detector is empty'
  );
  assert.equal(
    alwaysUnequal(systems).length,
    1,
    'and the always-unequal stub is not — so (a) would RED'
  );
});

test('the detector names the identity-writer set, and does NOT reuse PR 2 bypass-site list', async () => {
  // A SOURCE CONTRACT, because this enumeration is the one PR 8 inherits and the easiest way for
  // it to be wrong is to be copied from the list that answers a different question.
  const { readFileSync } = await import('node:fs');
  const { dirname, resolve } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const here = dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(
    resolve(here, '..', 'src', 'systems', 'worldIdentityDrift.js'),
    'utf8'
  );
  for (const writer of [
    'createItem',
    'addItemFromUuid',
    'replaceItemSource',
    'updateItem',
    'applyBulkEditToComponents',
    'refreshComponentMetadataForUpdatedItem',
    'addRecipeItemFromUuid',
  ]) {
    assert.match(source, new RegExp(writer), `the writer set must name ${writer}`);
  }
  assert.match(
    source,
    /NOT PR 2's "five mutation-time bypass sites"/,
    'and must record that it is NOT the basis-concern list'
  );
  assert.doesNotMatch(
    source,
    /export function reportScopeMirrorDrift/,
    'it is deliberately not named after a mirror — a mirror is a copy KEPT IN SYNC, which is the ' +
      'mechanism this module exists because we cannot implement'
  );
});
