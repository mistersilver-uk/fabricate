/** The `1.36.0` scoped identity reconciliation and its GM notice (issue 2554). */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { MIGRATIONS } from '../src/migration/migrationRegistry.js';
import { MigrationRunner } from '../src/migration/MigrationRunner.js';
import { reconcileOrphanedScopedIdentities } from '../src/migration/reconcileOrphanedScopedIdentities.js';
import { membershipKey } from '../src/systems/scopedDefinitions.js';
import { buildScopedIdentityReconcileNotice } from '../src/systems/scopedIdentityReconcileNotice.js';

import { parseUuidDouble } from './helpers/manager/parseUuidDouble.js';
import { detailLine, dispatchMigrationSummary } from './helpers/migrationPassDriver.js';

const LANG = JSON.parse(readFileSync(new URL('../lang/en.json', import.meta.url), 'utf8'));
const OPTIONS = Object.freeze({ parseUuid: parseUuidDouble });
const REPORT_LISTS = Object.freeze([
  'created',
  'adopted',
  'conflicting',
  'ambiguous',
  'unresolvedMemberships',
  'equivalentEssenceCandidates',
]);

const system = (id, { essences = [], tools = [], components = [] } = {}) => ({
  id,
  name: `System ${id}`,
  essenceDefinitions: essences,
  tools,
  components,
});

const scope = (entities = [], membership = {}) => ({ entities, defaults: {}, membership });

function reconcile(data) {
  return reconcileOrphanedScopedIdentities(data, OPTIONS);
}

const ids = (entries) => entries.map((entry) => `${entry.systemId}/${entry.id}`);

test('an orphan essence gains a world entity and an inheriting membership, and is reported created', () => {
  const data = {
    systems: [system('sys-a', { essences: [{ id: 'fire', name: 'Fire', enabled: false }] })],
    essenceScope: scope([{ id: 'water', name: 'Water' }]),
    toolScope: scope(),
  };
  const result = reconcile(data);
  assert.deepEqual(
    result.essenceScope.entities.map((entity) => entity.id),
    ['water', 'fire']
  );
  assert.deepEqual(result.essenceScope.membership[membershipKey('fire', 'sys-a')], {
    entityId: 'fire',
    systemId: 'sys-a',
    inherit: {},
    enabled: false,
  });
  assert.deepEqual(ids(result._scopedIdentityReconcileReport.created), ['sys-a/fire']);
  assert.equal(result.toolScope, data.toolScope, 'the unchanged tool leg answers by reference');
});

test('a same-id world essence without a membership is adopted, never duplicated', () => {
  const data = {
    systems: [system('sys-a', { essences: [{ id: 'iron', name: 'Iron' }] })],
    essenceScope: scope([{ id: 'iron', name: 'Iron' }]),
    toolScope: scope(),
  };
  const result = reconcile(data);
  assert.equal(result.essenceScope.entities.length, 1);
  const [membership] = Object.values(result.essenceScope.membership);
  assert.equal(membership.entityId, 'iron');
  assert.equal(membership.systemId, 'sys-a');
  const report = result._scopedIdentityReconcileReport;
  assert.deepEqual(ids(report.adopted), ['sys-a/iron']);
  assert.deepEqual(report.created, []);
});

test('an unseeded scope that has rows is seeded by registration', () => {
  const data = {
    systems: [
      system('sys-a', {
        essences: [{ id: 'fire', name: 'Fire' }],
        tools: [{ id: 'hammer', name: 'Hammer' }],
      }),
    ],
    essenceScope: {},
    toolScope: undefined,
  };
  const result = reconcile(data);
  assert.deepEqual(
    result.essenceScope.entities.map((entity) => entity.id),
    ['fire']
  );
  assert.deepEqual(
    result.toolScope.entities.map((entity) => entity.id),
    ['hammer']
  );
  assert.equal(Object.keys(result.toolScope.membership).length, 1);
});

test('a rerun and an empty world answer every scope by reference, with every list empty', () => {
  const first = reconcile({
    systems: [system('sys-a', { essences: [{ id: 'fire', name: 'Fire' }] })],
    essenceScope: {},
    toolScope: {},
  });
  const rerunInput = {
    systems: [system('sys-a', { essences: [{ id: 'fire', name: 'Fire' }] })],
    essenceScope: first.essenceScope,
    toolScope: first.toolScope,
  };
  const empty = { systems: [], essenceScope: {}, toolScope: {} };
  for (const data of [rerunInput, empty]) {
    const result = reconcile(data);
    assert.equal(result.essenceScope, data.essenceScope);
    assert.equal(result.toolScope, data.toolScope);
    for (const list of REPORT_LISTS) {
      assert.deepEqual(result._scopedIdentityReconcileReport[list], [], list);
    }
  }
});

test('the pass is pure: its input is never touched', () => {
  const data = {
    systems: [system('sys-a', { essences: [{ id: 'fire', name: 'Fire' }] })],
    essenceScope: scope([{ id: 'water', name: 'Water' }]),
    toolScope: {},
  };
  const before = structuredClone(data);
  reconcile(data);
  assert.deepEqual(data, before);
});

test('a retired essence id is refused as conflicting and never reissued', () => {
  const data = {
    systems: [system('sys-a', { essences: [{ id: 'old-iron', name: 'Iron' }] })],
    essenceScope: scope(),
    toolScope: scope(),
    worldEssenceMergeMap: { systems: {}, retired: { 'old-iron': { name: 'Iron' } } },
  };
  const result = reconcile(data);
  assert.equal(result.essenceScope, data.essenceScope, 'nothing is written');
  const report = result._scopedIdentityReconcileReport;
  assert.deepEqual(report.conflicting, [
    {
      entityType: 'essences',
      systemId: 'sys-a',
      id: 'old-iron',
      name: 'Iron',
      reason: 'retiredId',
    },
  ]);
});

test("a tool keys by its system's component sources: one match conflicts, two are ambiguous", () => {
  const data = {
    systems: [
      system('sys-a', {
        components: [
          { id: 'c-one', originItemUuid: 'Item.src1' },
          { id: 'c-two', originItemUuid: 'Item.src1', aliasItemUuids: ['Item.src2'] },
        ],
        tools: [
          { id: 't-one', name: 'Tongs', componentId: 'c-one' },
          { id: 't-two', name: 'Anvil', componentId: 'c-two' },
        ],
      }),
    ],
    essenceScope: {},
    toolScope: scope([
      { id: 'w1', name: 'World tongs', originItemUuid: 'Item.src1' },
      { id: 'w2', name: 'World anvil', originItemUuid: 'Item.src2' },
    ]),
  };
  const result = reconcile(data);
  assert.equal(result.toolScope, data.toolScope, 'neither row is registered');
  const report = result._scopedIdentityReconcileReport;
  assert.deepEqual(report.conflicting, [
    {
      entityType: 'tools',
      systemId: 'sys-a',
      id: 't-one',
      name: 'Tongs',
      reason: 'sourceCollision',
      matchedIds: ['w1'],
    },
  ]);
  assert.deepEqual(report.ambiguous, [
    {
      entityType: 'tools',
      systemId: 'sys-a',
      id: 't-two',
      name: 'Anvil',
      reason: 'sourceCollision',
      matchedIds: ['w1', 'w2'],
    },
  ]);
});

test('a same-id tool sharing a source is adopted, and a source-less tool gets its own identity', () => {
  const data = {
    systems: [
      system('sys-a', {
        tools: [
          { id: 'w1', name: 'Tongs', originItemUuid: 'Item.src1' },
          { id: 'loose', name: 'Stick' },
        ],
      }),
    ],
    essenceScope: {},
    toolScope: scope([{ id: 'w1', name: 'Tongs', originItemUuid: 'Item.src1' }]),
  };
  const result = reconcile(data);
  const report = result._scopedIdentityReconcileReport;
  assert.deepEqual(ids(report.adopted), ['sys-a/w1']);
  assert.deepEqual(ids(report.created), ['sys-a/loose']);
  assert.deepEqual(
    result.toolScope.entities.map((entity) => entity.id),
    ['w1', 'loose']
  );
});

test('a membership with no in-system row is reported and kept', () => {
  const data = {
    systems: [system('sys-a')],
    essenceScope: scope([{ id: 'iron', name: 'Iron' }], {
      [membershipKey('iron', 'sys-gone')]: { entityId: 'iron', systemId: 'sys-gone', inherit: {} },
    }),
    toolScope: {},
  };
  const result = reconcile(data);
  assert.equal(result.essenceScope, data.essenceScope, 'nothing is deleted');
  assert.deepEqual(result._scopedIdentityReconcileReport.unresolvedMemberships, [
    { entityType: 'essences', entityId: 'iron', systemId: 'sys-gone', name: 'Iron' },
  ]);
});

test('equivalent-looking orphans in two systems are created apart and reported as candidates', () => {
  const data = {
    systems: [
      system('sys-a', { essences: [{ id: 'iron-a', name: 'Iron' }] }),
      system('sys-b', { essences: [{ id: 'iron-b', name: 'Iron' }] }),
    ],
    essenceScope: {},
    toolScope: {},
  };
  const result = reconcile(data);
  assert.deepEqual(
    result.essenceScope.entities.map((entity) => entity.id),
    ['iron-a', 'iron-b'],
    'no merge runs'
  );
  const [candidate, ...rest] = result._scopedIdentityReconcileReport.equivalentEssenceCandidates;
  assert.deepEqual(rest, []);
  assert.equal(candidate.name, 'Iron');
  assert.deepEqual(
    [...candidate.ids].sort((left, right) => left.localeCompare(right)),
    ['iron-a', 'iron-b']
  );
  assert.deepEqual(candidate.systemIds, ['sys-a', 'sys-b']);
});

test('1.36.0 is registered, downgrades to 1.35.0 and loses no data on downgrade', () => {
  const entry = MIGRATIONS.find((migration) => migration.version === '1.36.0');
  assert.ok(entry);
  assert.equal(entry.downgradeTo, '1.35.0');
  assert.equal(entry.downgradeLosesData, false);
});

function makeRunner(initial) {
  const store = new Map(Object.entries(initial));
  const writes = [];
  const runner = new MigrationRunner({
    getSetting: (key) => store.get(key),
    setSetting: async (key, value) => {
      writes.push(key);
      store.set(key, JSON.parse(JSON.stringify(value)));
    },
  });
  return { runner, store, writes };
}

test('the runner captures the report into the summary, never persists it, and a rerun writes nothing', async () => {
  const { runner, store, writes } = makeRunner({
    migrationVersion: '1.35.0',
    craftingSystems: [system('sys-a', { essences: [{ id: 'fire', name: 'Fire' }] })],
    essenceScope: {},
    toolScope: {},
  });
  const summary = await runner.run();
  assert.deepEqual(ids(summary.scopedIdentityReconcileReport.created), ['sys-a/fire']);
  assert.deepEqual(writes, ['essenceScope', 'migrationVersion']);
  assert.equal(store.get('migrationVersion'), '1.36.0');
  assert.ok(!JSON.stringify([...store.values()]).includes('_scopedIdentityReconcileReport'));

  store.set('migrationVersion', '1.35.0');
  writes.length = 0;
  const rerun = await runner.run();
  assert.deepEqual(writes, ['migrationVersion'], 'a reconciled world writes no scope setting');
  assert.deepEqual(rerun.scopedIdentityReconcileReport.created, []);
});

// The notice.

const noLocalizer = () => undefined;

function localizeLang(key, data) {
  const template = key.split('.').reduce((node, segment) => node?.[segment], LANG);
  if (typeof template !== 'string') return undefined;
  return Object.entries(data ?? {}).reduce(
    (text, [token, value]) => text.replaceAll(`{${token}}`, String(value)),
    template
  );
}

const entry = (name, extra = {}) => ({
  entityType: 'tools',
  systemId: 'sys-a',
  id: name,
  name,
  ...extra,
});

function fullReport() {
  return {
    created: [entry('Created Tongs')],
    adopted: [entry('Adopted Anvil')],
    conflicting: [entry('Clashing Hammer', { reason: 'idCollision' })],
    ambiguous: [entry('Ambiguous Saw', { reason: 'sourceCollision', matchedIds: ['w1', 'w2'] })],
    unresolvedMemberships: [
      { entityType: 'essences', entityId: 'ghost', systemId: 'sys-gone', name: 'Ghost Essence' },
    ],
    equivalentEssenceCandidates: [
      { name: 'Twin Iron', ids: ['iron-a', 'iron-b'], systemIds: ['sys-a', 'sys-b'] },
    ],
  };
}

const emptyReport = () => Object.fromEntries(REPORT_LISTS.map((list) => [list, []]));

test('the notice is silent when all six lists are empty, and total on junk', () => {
  for (const report of [emptyReport(), null, {}, { created: 'junk' }]) {
    const notice = buildScopedIdentityReconcileNotice(report, noLocalizer);
    assert.equal(notice.message, '');
    assert.equal(notice.detail, '');
  }
});

test('created or adopted alone is informational; any other list is a warning', () => {
  for (const list of ['created', 'adopted']) {
    const report = { ...emptyReport(), [list]: fullReport()[list] };
    assert.equal(buildScopedIdentityReconcileNotice(report, noLocalizer).severity, 'info', list);
  }
  for (const list of REPORT_LISTS.slice(2)) {
    const report = { ...emptyReport(), created: fullReport().created, [list]: fullReport()[list] };
    const notice = buildScopedIdentityReconcileNotice(report, noLocalizer);
    assert.equal(notice.severity, 'warn', list);
    assert.ok(notice.message.length > 0, list);
  }
});

test('the toast counts and the console detail names every entry', () => {
  const notice = buildScopedIdentityReconcileNotice(fullReport(), noLocalizer);
  const names = [
    'Created Tongs',
    'Adopted Anvil',
    'Clashing Hammer',
    'Ambiguous Saw',
    'Ghost Essence',
    'Twin Iron',
  ];
  for (const name of names) {
    assert.ok(!notice.message.includes(name), `${name} is not in the toast`);
    assert.ok(notice.detail.includes(name), `${name} is in the detail`);
  }
  assert.match(notice.message, /2 essence\(s\) look like the same essence/);
  assert.match(
    notice.detail,
    /2 essence\(s\) look like the same essence in more than one system and were kept separate: Twin Iron \(sys-a, sys-b\)\. Review them under World › Essences\./
  );
});

test('every requested key exists in lang/en.json and composes the same notice as the fallbacks', () => {
  const requested = new Set();
  const recording = (key, data) => {
    requested.add(key);
    return localizeLang(key, data);
  };
  const shipped = buildScopedIdentityReconcileNotice(fullReport(), recording);
  const fallback = buildScopedIdentityReconcileNotice(fullReport(), noLocalizer);
  const ours = [...requested].filter((key) =>
    key.startsWith('FABRICATE.Migration.ScopedIdentityReconcile.')
  );
  assert.equal(ours.length, 12, 'a toast and a detail key for each of the six lists');
  for (const key of requested) assert.equal(typeof localizeLang(key, {}), 'string', key);
  assert.deepEqual(shipped, fallback);
});

test('the startup pass dispatches the notice on the channel its severity selects', async () => {
  const info = { ...emptyReport(), created: fullReport().created };
  for (const [report, channel, options] of [
    [fullReport(), 'warn', { permanent: true }],
    [info, 'info', undefined],
  ]) {
    const notice = buildScopedIdentityReconcileNotice(report, noLocalizer);
    const { posted, logged } = await dispatchMigrationSummary({
      scopedIdentityReconcileReport: report,
    });
    assert.deepEqual(posted, [[channel, notice.message, options]]);
    assert.deepEqual(logged, [detailLine('1.36.0 scoped identity reconciliation', notice.detail)]);
  }
  const silent = await dispatchMigrationSummary({ scopedIdentityReconcileReport: emptyReport() });
  assert.deepEqual([silent.posted, silent.logged], [[], []]);
});
