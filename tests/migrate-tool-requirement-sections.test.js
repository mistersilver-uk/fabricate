/**
 * The `1.31.0` tool-requirement backfill (issue 1373, epic 1357).
 *
 * `prerequisites` and `bonus` become world-default SECTIONS in this change, which means
 * `normalizeInherit` starts reading an ABSENT `inherit` key for either as INHERITING. Every
 * membership record `1.30.0` already wrote carries exactly that absence, so without this pass a
 * migrated world would claim to inherit a world default for a value its own crafting system
 * authored.
 *
 * ## THE PROOF THAT MATTERS IS THROUGH A REAL `load()`
 *
 * The requirement is that an ABSENT world default resolves to TODAY'S behaviour on real persisted
 * data. A hand-built corpus object cannot show that: the store's normalizers are where absence
 * either survives or is minted away, and a world SETTING preserves key absence rather than
 * defaulting it. So the resolution assertions here run over a corpus that came out of
 * `createToolScopeStore().load()` reading a settings map, not over a literal.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { SETTING_KEYS } from '../src/config/settings.js';
import { MigrationRunner } from '../src/migration/MigrationRunner.js';
import { migrateToolRequirementSections } from '../src/migration/migrateToolRequirementSections.js';
import { buildMembershipRecord } from '../src/migration/migrateWorldScopeEntities.js';
import { membershipKey } from '../src/systems/scopedDefinitions.js';
import { resolveToolScope, TOOL_SECTIONS } from '../src/systems/toolScope.js';
import { createToolScopeStore } from '../src/systems/worldScopeStores.js';

/** The in-system Tool a `1.30.0`-era world holds, with a real per-system gate and bonus. */
function inSystemTool(overrides = {}) {
  return {
    id: 'tool-hammer',
    enabled: true,
    label: '',
    name: 'Hammer',
    registeredItemUuid: 'Item.hammer',
    breakage: { mode: 'limitedUses', maxUses: 3 },
    checkBreakable: true,
    onBreak: { mode: 'destroy' },
    prerequisites: { enabled: true, ids: ['smith-trained'], gateMode: 'usability' },
    bonus: { enabled: true, expression: '@prof' },
    repairRequirements: [],
    ...overrides,
  };
}

/**
 * The `toolScope` payload a world that ran `1.30.0` BEFORE this change actually holds: a
 * membership record whose `inherit` map names only the two sections that existed then, and no
 * world default at all.
 *
 * @returns {object}
 */
function migratedToolScopePayload() {
  return {
    entities: [{ id: 'tool-hammer', name: 'Hammer', registeredItemUuid: 'Item.hammer' }],
    defaults: {},
    membership: {
      [membershipKey('tool-hammer', 'sys-a')]: {
        entityId: 'tool-hammer',
        systemId: 'sys-a',
        inherit: { breakage: false, onBreak: false },
        breakage: { mode: 'limitedUses', maxUses: 3 },
        onBreak: { mode: 'destroy' },
        enabled: true,
      },
    },
  };
}

function migratedWorld(toolOverrides = {}) {
  return {
    systems: [{ id: 'sys-a', name: 'Smithing', tools: [inSystemTool(toolOverrides)] }],
    toolScope: migratedToolScopePayload(),
  };
}

function membershipRecordOf(data, systemId = 'sys-a') {
  return data.toolScope.membership[membershipKey('tool-hammer', systemId)];
}

test('the two new sections are declared, so an absent inherit key would read as inheriting', () => {
  assert.deepEqual([...TOOL_SECTIONS], ['breakage', 'onBreak', 'prerequisites', 'bonus']);
});

test('it writes each system OWN value as an override, with both switches OFF', () => {
  const data = migratedWorld();

  migrateToolRequirementSections(data);

  const record = membershipRecordOf(data);
  assert.equal(record.inherit.prerequisites, false, 'the system authored this, so it overrides');
  assert.equal(record.inherit.bonus, false);
  assert.deepEqual(record.prerequisites, {
    enabled: true,
    ids: ['smith-trained'],
    gateMode: 'usability',
  });
  assert.deepEqual(record.bonus, { enabled: true, expression: '@prof' });
  assert.deepEqual(data.toolScope.defaults, {}, 'and NO world default is elected');
});

test('an in-system Tool carrying neither key gets the CANONICAL EMPTY, never an absent section', () => {
  // An absent SECTION under an `inherit: false` switch falls back to the WORLD value by design,
  // so "skip it" is the one answer that would change behaviour the moment a GM authors one.
  const data = migratedWorld();
  delete data.systems[0].tools[0].prerequisites;
  delete data.systems[0].tools[0].bonus;

  migrateToolRequirementSections(data);

  const record = membershipRecordOf(data);
  assert.deepEqual(record.prerequisites, { enabled: false, ids: [], gateMode: 'usability' });
  assert.deepEqual(record.bonus, { enabled: false, expression: '' });
});

test('a membership record whose system is gone is still switched off, on the canonical empty', () => {
  const data = migratedWorld();
  data.systems = [];

  migrateToolRequirementSections(data);

  const record = membershipRecordOf(data);
  assert.equal(record.inherit.prerequisites, false);
  assert.deepEqual(record.bonus, { enabled: false, expression: '' });
});

test('it is idempotent, and a re-run never undoes a GM who has since re-inherited', () => {
  const data = migratedWorld();
  migrateToolRequirementSections(data);
  // The GM then flips `bonus` back to inheriting and authors a world default.
  membershipRecordOf(data).inherit.bonus = true;
  data.toolScope.defaults['tool-hammer'] = {
    id: 'tool-hammer',
    bonus: { enabled: true, expression: '@wis' },
  };

  migrateToolRequirementSections(data);

  const record = membershipRecordOf(data);
  assert.equal(record.inherit.bonus, true, 'the GM decision survives a second pass');
  assert.deepEqual(record.bonus, { enabled: true, expression: '@prof' }, 'dormant, and retained');
});

test('a payload with no tool scope, or no membership map, is left exactly as found', () => {
  assert.deepEqual(migrateToolRequirementSections({ systems: [] }), { systems: [] });
  const partial = { toolScope: { entities: [], defaults: {} } };
  assert.deepEqual(migrateToolRequirementSections(partial), partial);
  assert.equal(migrateToolRequirementSections(null), null);
});

test('1.30.0 itself writes both sections, so the two upgrade orders converge on one corpus', () => {
  // A world that has NOT reached `1.30.0` gets the pair from `buildMembershipRecord` directly,
  // and this pass then finds nothing to do. If the two disagreed, whether a world upgraded in one
  // hop or two would decide its behaviour.
  const built = buildMembershipRecord(inSystemTool(), 'tools', 'tool-hammer', 'sys-a');
  assert.equal(built.inherit.prerequisites, false);
  assert.equal(built.inherit.bonus, false);

  const data = {
    systems: [{ id: 'sys-a', tools: [inSystemTool()] }],
    toolScope: {
      entities: [{ id: 'tool-hammer' }],
      defaults: {},
      membership: { [membershipKey('tool-hammer', 'sys-a')]: built },
    },
  };
  const before = JSON.stringify(data.toolScope);
  migrateToolRequirementSections(data);
  assert.equal(JSON.stringify(data.toolScope), before, 'the second hop is a no-op');
});

test('the 1.31.0 registry entry is registered, downgrades to 1.30.0 and loses no data', () => {
  const registry = new MigrationRunner({ getSetting: () => undefined, setSetting: () => {} })
    ._migrations;
  const entry = registry.find((migration) => migration.version === '1.31.0');
  assert.ok(entry, 'the 1.31.0 entry is registered');
  assert.equal(entry.downgradeTo, '1.30.0');
  assert.equal(entry.downgradeLosesData, false);
  assert.match(entry.label, /prerequisites/i);
});

// ---------------------------------------------------------------------------
// THE RESOLUTION PROOF, THROUGH A REAL STORE
// ---------------------------------------------------------------------------

/**
 * Load a `toolScope` payload the way production does: into a settings map, through a real store.
 *
 * The map holds the ALREADY-PARSED object a JSONField setting answers with, so this exercises the
 * production path rather than the store's string fallback.
 *
 * @param {object} payload
 * @returns {object} the published corpus.
 */
function loadedCorpus(payload) {
  const settings = new Map([[SETTING_KEYS.TOOL_SCOPE, payload]]);
  const store = createToolScopeStore({
    getSetting: (key) => settings.get(key),
    setSetting: async (key, value) => {
      settings.set(key, value);
    },
  });
  store.load();
  return store.corpus();
}

test('an ABSENT world default resolves to the shipped behaviour, on data a real load() produced', () => {
  // The un-backfilled `1.30.0` corpus: no world default for either section, and an `inherit` map
  // that names neither, so both read as INHERITING.
  const corpus = loadedCorpus(migratedToolScopePayload());
  const membership = corpus.membership.find((record) => record.entityId === 'tool-hammer');
  assert.equal(
    Object.hasOwn(membership.inherit, 'prerequisites'),
    false,
    'the premise: absence survived the load rather than being minted away'
  );
  assert.equal(
    corpus.defaults.find((record) => record.id === 'tool-hammer'),
    undefined,
    'the premise: there is no world default to inherit'
  );

  const [row] = resolveToolScope(corpus, 'sys-a', [inSystemTool()]);
  assert.deepEqual(row.prerequisites, {
    enabled: true,
    ids: ['smith-trained'],
    gateMode: 'usability',
  });
  assert.deepEqual(row.bonus, { enabled: true, expression: '@prof' });
});

test('and it still does after the backfill, which is what makes the pass safe to run', () => {
  const data = migratedWorld();
  migrateToolRequirementSections(data);

  const corpus = loadedCorpus(data.toolScope);
  const membership = corpus.membership.find((record) => record.entityId === 'tool-hammer');
  assert.equal(membership.inherit.prerequisites, false, 'the override survived the load');
  assert.deepEqual(membership.prerequisites, {
    enabled: true,
    ids: ['smith-trained'],
    gateMode: 'usability',
  });

  const [row] = resolveToolScope(corpus, 'sys-a', [inSystemTool()]);
  assert.deepEqual(row.prerequisites, {
    enabled: true,
    ids: ['smith-trained'],
    gateMode: 'usability',
  });
  assert.deepEqual(row.bonus, { enabled: true, expression: '@prof' });
  assert.equal(row.inherited.prerequisites, false);
  assert.equal(row.inherited.bonus, false);
});

test('a world default survives a real load(), which is what the new Requirements tab authors', () => {
  // The world-scope preview resolves with NO membership record at all, and that is the surface
  // the new Requirements tab draws: the world defaults are what it edits and what it shows, so a
  // section value has to round-trip the store rather than only the action.
  const payload = migratedToolScopePayload();
  payload.defaults['tool-hammer'] = {
    id: 'tool-hammer',
    prerequisites: { enabled: true, ids: ['world-trained'], gateMode: 'bonus' },
    bonus: { enabled: true, expression: '@int' },
  };
  const corpus = loadedCorpus(payload);
  const worldDefault = corpus.defaults.find((record) => record.id === 'tool-hammer');
  assert.deepEqual(worldDefault.prerequisites, {
    enabled: true,
    ids: ['world-trained'],
    gateMode: 'bonus',
  });
  assert.deepEqual(worldDefault.bonus, { enabled: true, expression: '@int' });
});
