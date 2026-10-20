/**
 * Issue 2554: every Essence and Tool row a crafting system holds gains one world entity and one
 * membership at the `CraftingSystemManager.save` chokepoint, asserted on the PERSISTED settings.
 * The world is at `migrationVersion` `1.36.0`, the first version that registers.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { installFoundryEnv } from '../helpers/foundryEnv.js';
import { makeWorldItem } from '../helpers/writeCapableItemFake.js';

installFoundryEnv();

const { getSetting, setSetting } = await import('../../src/config/settings.js');
const { CraftingSystemManager } = await import('../../src/systems/CraftingSystemManager.js');
const { createEssenceScopeStore, createToolScopeStore } =
  await import('../../src/systems/worldScopeStores.js');
const { planWorldScopeIdentityRegistration } =
  await import('../../src/systems/manager/worldScopeIdentityRegistration.js');
const { WorldScopeRegistrationError } =
  await import('../../src/systems/manager/worldScopeIdentitySave.js');
const { COMPONENT_FACTS } = await import('../../src/systems/manager/collaborators.js');
const { reconcileOrphanedScopedIdentities } =
  await import('../../src/migration/reconcileOrphanedScopedIdentities.js');

/** `foundry.utils.parseUuid`'s `embedded` answer for the uuid spellings these fixtures use. */
function parseUuid(uuid) {
  const parts = String(uuid).split('.');
  return { embedded: parts.slice(parts[0] === 'Compendium' ? 5 : 2) };
}

const items = new Map();
Object.assign(globalThis, { fromUuid: async (uuid) => items.get(uuid) ?? null });

function sourceItem(uuid, name = 'Saw') {
  const item = makeWorldItem({ uuid, name });
  item.documentName = 'Item';
  item.system = { description: { value: '' } };
  items.set(uuid, item);
  return item;
}

/** A GM world whose settings read back, with one-shot rejections per setting key. */
function world({ version = '1.36.0', essenceScope, toolScope, mergeMap } = {}) {
  const env = installFoundryEnv();
  globalThis.foundry.utils.parseUuid = parseUuid;
  const warnings = [];
  globalThis.ui.notifications.warn = (message) => {
    warnings.push(message);
  };
  const rejections = new Map();
  const write = globalThis.game.settings.set;
  globalThis.game.settings.set = async (namespace, key, value) => {
    const rejection = rejections.get(key)?.shift();
    if (rejection) throw rejection;
    return write(namespace, key, structuredClone(value));
  };
  env.settings.set('migrationVersion', version);
  if (essenceScope) env.settings.set('essenceScope', structuredClone(essenceScope));
  if (toolScope) env.settings.set('toolScope', structuredClone(toolScope));
  if (mergeMap) env.settings.set('worldEssenceMergeMap', mergeMap);
  const stores = {
    essences: createEssenceScopeStore({ getSetting, setSetting }),
    tools: createToolScopeStore({ getSetting, setSetting }),
  };
  const manager = new CraftingSystemManager(
    { getRecipes: () => [] },
    { essenceScopeStore: stores.essences, toolScopeStore: stores.tools }
  );
  return {
    env,
    manager,
    stores,
    warnings,
    persisted: (key) => env.settings.get(key),
    writesTo: (key) => env.writes.filter((entry) => entry.key === key).length,
    /** Reject the next write of `key` (a `null` entry lets one through first). */
    reject(key, ...errors) {
      rejections.set(key, errors);
    },
  };
}

const essence = (id, extra = {}) => ({ id, name: `Essence ${id}`, ...extra });

function membershipOf(scope, entityId, systemId) {
  return scope?.membership?.[`${entityId}|${systemId}`] ?? null;
}

function entityIds(scope) {
  return (scope?.entities ?? []).map((entity) => entity.id);
}

/** Every persisted essence and tool row with no membership in the persisted scopes. */
function unregisteredRows(w) {
  const missing = [];
  for (const system of w.persisted('craftingSystems') ?? []) {
    for (const [field, key] of [
      ['essenceDefinitions', 'essenceScope'],
      ['tools', 'toolScope'],
    ]) {
      for (const row of system[field] ?? []) {
        if (!membershipOf(w.persisted(key), row.id, system.id))
          missing.push(`${system.id}:${row.id}`);
      }
    }
  }
  return missing;
}

describe('the planner', () => {
  const plan = (entityType, payload, rows, extra = {}) =>
    planWorldScopeIdentityRegistration({
      entityType,
      payload: { entities: [], defaults: {}, membership: {}, ...payload },
      systems: [{ id: 'sysA', [entityType === 'tools' ? 'tools' : 'essenceDefinitions']: rows }],
      parseUuid,
      ...extra,
    });

  it('creates an essence under its own id and never matches one by name', () => {
    const [decided] = plan('essences', { entities: [{ id: 'other', name: 'Essence fire' }] }, [
      essence('fire'),
    ]);
    assert.equal(decided.decision, 'create');
    assert.deepEqual(decided.entity, { id: 'fire', name: 'Essence fire' });
    assert.deepEqual(decided.membership, {
      entityId: 'fire',
      systemId: 'sysA',
      inherit: {},
      enabled: true,
    });
  });

  it('reports a retired essence id conflicting instead of reissuing it', () => {
    const [decided] = plan('essences', {}, [essence('ash')], { retiredIds: ['ash'] });
    assert.equal(decided.decision, 'conflicting');
    assert.equal(decided.reason, 'retiredId');
  });

  it('adopts with each section inheriting only where the world default changes nothing', () => {
    const payload = {
      entities: [{ id: 'fire' }],
      defaults: {
        fire: { id: 'fire', macro: 'Macro.same', effectSource: { sourceItemUuid: 'Item.w' } },
      },
    };
    const [decided] = plan('essences', payload, [
      essence('fire', { propertyMacroUuid: 'Macro.same', sourceItemUuid: 'Item.own' }),
    ]);
    assert.equal(decided.decision, 'adopt');
    assert.deepEqual(decided.membership.inherit, { effectSource: false });
    assert.equal('macro' in decided.membership, false);
    assert.deepEqual(decided.membership.effectSource, { sourceItemUuid: 'Item.own' });
  });

  it('adopts a same-id Tool sharing a source through an alias', () => {
    const payload = { entities: [{ id: 'saw', registeredItemUuid: 'Item.old-saw' }] };
    const [decided] = plan('tools', payload, [
      { id: 'saw', registeredItemUuid: 'Item.saw', aliasItemUuids: ['Item.old-saw'] },
    ]);
    assert.equal(decided.decision, 'adopt');
    assert.equal(decided.entity, undefined);
    assert.equal(decided.membership.entityId, 'saw');
  });

  it('treats an embedded-only Tool as source-less, adopting a source-less same-id entity', () => {
    const [decided] = plan('tools', { entities: [{ id: 'saw' }] }, [
      { id: 'saw', registeredItemUuid: 'Actor.a.Item.saw' },
    ]);
    assert.equal(decided.decision, 'adopt');
  });

  it('reports a same-id Tool with disjoint sources and a different-id Tool sharing one', () => {
    const payload = { entities: [{ id: 'saw', registeredItemUuid: 'Item.saw' }] };
    const decided = plan('tools', payload, [
      { id: 'saw', registeredItemUuid: 'Item.other' },
      { id: 'saw-2', registeredItemUuid: 'Item.saw' },
    ]);
    assert.deepEqual(
      decided.map((entry) => [entry.decision, entry.reason]),
      [
        ['conflicting', 'idCollision'],
        ['conflicting', 'sourceCollision'],
      ]
    );
  });

  it('reports a Tool leaving breakage unauthored where the world default authors it', () => {
    const payload = {
      entities: [{ id: 'saw' }],
      defaults: { saw: { id: 'saw', breakage: { mode: 'uses', uses: 3 } } },
    };
    const [decided] = plan('tools', payload, [{ id: 'saw', componentId: 'c1' }]);
    assert.equal(decided.reason, 'emptyOverride');
  });

  it('creates only the entity for a membership with none, keeping the membership verbatim', () => {
    const payload = { membership: { 'fire|sysA': { entityId: 'fire', systemId: 'sysA' } } };
    const [decided] = plan('essences', payload, [essence('fire')]);
    assert.equal(decided.decision, 'create');
    assert.equal(decided.membership, undefined);
  });

  it('lets a seed replace the membership shape, with its systemId rewritten', () => {
    const seed = {
      entityId: 'fire',
      systemId: 'elsewhere',
      inherit: { macro: false },
      macro: null,
    };
    const [decided] = plan('essences', {}, [essence('fire')], {
      seeds: { systemId: 'sysA', essences: { fire: seed } },
    });
    assert.deepEqual(decided.membership, { ...seed, systemId: 'sysA' });
  });
});

describe('the save chokepoint', () => {
  it('registers an essence written through updateSystem, and a second system adopts it', async () => {
    const w = world({ essenceScope: {} });
    await w.manager.createSystem({ id: 'sysA', name: 'A' });
    await w.manager.createSystem({ id: 'sysB', name: 'B' });
    await w.manager.updateSystem('sysA', { essenceDefinitions: [essence('fire')] });
    await w.manager.updateSystem('sysB', { essenceDefinitions: [essence('fire')] });
    const scope = w.persisted('essenceScope');
    assert.deepEqual(entityIds(scope), ['fire']);
    assert.ok(membershipOf(scope, 'fire', 'sysA'));
    assert.ok(membershipOf(scope, 'fire', 'sysB'));
  });

  it('writes nothing below 1.36.0', async () => {
    const w = world({ version: '1.35.0' });
    await w.manager.createSystem({ id: 'sysA', name: 'A', essenceDefinitions: [essence('fire')] });
    assert.equal(w.writesTo('essenceScope'), 0);
    assert.equal(w.persisted('craftingSystems').length, 1);
  });

  it('registers an item-backed Tool through upsertTool in a fresh world', async () => {
    const w = world({ toolScope: {} });
    await w.manager.createSystem({ id: 'sysA', name: 'A' });
    sourceItem('Item.saw');
    const { item } = await w.manager.addToolFromUuid('sysA', 'Item.saw');
    const scope = w.persisted('toolScope');
    assert.deepEqual(entityIds(scope), [item.id]);
    assert.equal(scope.entities[0].registeredItemUuid, 'Item.saw');
    assert.equal(membershipOf(scope, item.id, 'sysA').enabled, true);
  });

  it('gives a new Tool the id of the one world Tool sharing its source', async () => {
    const toolScope = {
      entities: [{ id: 'world-saw', registeredItemUuid: 'Item.saw' }],
      defaults: {},
      membership: {},
    };
    const w = world({ toolScope });
    await w.manager.createSystem({ id: 'sysA', name: 'A' });
    sourceItem('Item.saw');
    const { item } = await w.manager.addToolFromUuid('sysA', 'Item.saw');
    assert.equal(item.id, 'world-saw');
    assert.deepEqual(entityIds(w.persisted('toolScope')), ['world-saw']);
    assert.ok(membershipOf(w.persisted('toolScope'), 'world-saw', 'sysA'));
  });

  it('gives a source-less Tool its own world identity, named from its component', async () => {
    const w = world();
    await w.manager.createSystem({ id: 'sysA', name: 'A', components: [{ id: 'c1', name: 'C' }] });
    const { item } = await w.manager.upsertTool('sysA', { componentId: 'c1', label: 'Saw' });
    assert.deepEqual(entityIds(w.persisted('toolScope')), [item.id]);
    assert.equal(w.persisted('toolScope').entities[0].name, 'C');
  });

  it('compensates a failed stampSourceIdentity', async () => {
    const w = world({ toolScope: {} });
    await w.manager.createSystem({ id: 'sysA', name: 'A' });
    const source = sourceItem('Item.brittle');
    source.update = async () => {
      throw new Error('stamp failed');
    };
    await assert.rejects(w.manager.addToolFromUuid('sysA', 'Item.brittle'), /stamp failed/);
    assert.deepEqual(entityIds(w.persisted('toolScope')), []);
    assert.deepEqual(w.persisted('toolScope').membership, {});
  });

  it('a rejected world write throws a recoverable error and restores memory', async () => {
    const w = world({ essenceScope: {} });
    const cause = new Error('SETTINGS_MODIFY');
    w.reject('essenceScope', cause);
    const error = await w.manager
      .createSystem({ id: 'sysA', name: 'A', essenceDefinitions: [essence('fire')] })
      .catch((error_) => error_);
    assert.ok(error instanceof WorldScopeRegistrationError);
    assert.equal(error.code, 'worldWrite');
    assert.equal(error.cause, cause);
    assert.equal(w.manager.getSystem('sysA'), null);
    assert.equal(w.persisted('craftingSystems'), undefined);

    await w.manager.createSystem({ id: 'sysA', name: 'A' });
    w.reject('essenceScope', cause);
    await assert.rejects(
      w.manager.updateSystem('sysA', { essenceDefinitions: [essence('fire')] }),
      WorldScopeRegistrationError
    );
    assert.deepEqual(w.manager.getSystem('sysA').essenceDefinitions, []);
  });

  it('withdraws the essence registration when the tool write is rejected', async () => {
    const w = world({ essenceScope: {}, toolScope: {} });
    w.reject('toolScope', new Error('tool write refused'));
    await assert.rejects(
      w.manager.createSystem({
        id: 'sysA',
        name: 'A',
        essenceDefinitions: [essence('fire')],
        components: [{ id: 'c1', name: 'C' }],
        tools: [{ id: 't1', componentId: 'c1' }],
      }),
      (error) => error instanceof WorldScopeRegistrationError && error.entityType === 'tools'
    );
    assert.deepEqual(entityIds(w.persisted('essenceScope')), []);
    assert.deepEqual(w.persisted('essenceScope').membership, {});
    assert.equal(w.persisted('craftingSystems'), undefined);
  });

  it('withdraws what it registered when the system write fails', async () => {
    const w = world({ essenceScope: {} });
    w.reject('craftingSystems', new Error('systems refused'));
    await assert.rejects(
      w.manager.createSystem({ id: 'sysA', name: 'A', essenceDefinitions: [essence('fire')] }),
      /systems refused/
    );
    assert.deepEqual(entityIds(w.persisted('essenceScope')), []);
    assert.equal(w.manager.getSystem('sysA'), null);
  });

  it('keeps the persisted record in memory when a later save rejects', async () => {
    const w = world();
    await w.manager.createSystem({ id: 'sysA', name: 'A', features: { salvage: true } });
    w.manager._getResolutionModeService = () => ({ validateSalvage: () => ({ valid: false }) });
    const save = w.manager.save.bind(w.manager);
    let calls = 0;
    w.manager.save = async (change) => {
      calls += 1;
      if (calls === 2) throw new Error('second save');
      return save(change);
    };
    const resultGroups = [{ id: 'g1', results: [{ componentId: 'c1', quantity: 1 }] }];
    const components = [{ id: 'c1', name: 'C', salvage: { enabled: true, resultGroups } }];
    await assert.rejects(
      w.manager.updateSystem('sysA', {
        components,
        essenceDefinitions: [essence('fire')],
        salvageResolutionMode: 'progressive',
      }),
      /second save/
    );
    assert.deepEqual(
      w.manager.getSystem('sysA').essenceDefinitions.map((row) => row.id),
      ['fire']
    );
  });

  it('a world-write failure on A leaves no persisted unregistered row of A', async () => {
    const w = world({ essenceScope: {} });
    await w.manager.createSystem({ id: 'sysC', name: 'C' });
    w.reject('essenceScope', new Error('refused'));
    await assert.rejects(
      w.manager.createSystem({ id: 'sysA', name: 'A', essenceDefinitions: [essence('fire')] })
    );
    await w.manager.createSystem({ id: 'sysB', name: 'B', essenceDefinitions: [essence('ash')] });
    await w.manager.deleteSystem('sysC');
    assert.deepEqual(
      w.persisted('craftingSystems').map((system) => system.id),
      ['sysB']
    );
    assert.deepEqual(unregisteredRows(w), []);
  });

  it('a fully registered save writes neither scope', async () => {
    const w = world({ essenceScope: {}, toolScope: {} });
    await w.manager.createSystem({ id: 'sysA', name: 'A', essenceDefinitions: [essence('fire')] });
    const before = [w.writesTo('essenceScope'), w.writesTo('toolScope')];
    await w.manager.save({ put: w.manager.getSystem('sysA'), domains: COMPONENT_FACTS });
    assert.deepEqual([w.writesTo('essenceScope'), w.writesTo('toolScope')], before);
  });

  it('registers a row reached through applyBulkEditToEssences', async () => {
    const w = world({ version: '1.35.0' });
    await w.manager.createSystem({ id: 'sysA', name: 'A', essenceDefinitions: [essence('fire')] });
    w.env.settings.set('migrationVersion', '1.36.0');
    await w.manager.applyBulkEditToEssences('sysA', ['fire'], { enabled: false });
    assert.equal(membershipOf(w.persisted('essenceScope'), 'fire', 'sysA').enabled, false);
  });

  it('warns about a conflicting row once per session and still saves', async () => {
    const toolScope = {
      entities: [{ id: 't1', registeredItemUuid: 'Item.elsewhere' }],
      defaults: {},
      membership: {},
    };
    const w = world({ toolScope });
    const tools = [{ id: 't1', registeredItemUuid: 'Item.saw' }];
    await w.manager.createSystem({ id: 'sysA', name: 'Forge', tools });
    await w.manager.updateSystem('sysA', { name: 'Forge' });
    assert.equal(w.warnings.length, 1);
    assert.match(w.warnings[0], /1 row\(s\) in Forge/);
    assert.equal(w.persisted('craftingSystems')[0].tools[0].id, 't1');
    assert.equal(membershipOf(w.persisted('toolScope'), 't1', 'sysA'), null);
  });
});

describe('one Tool source reading across registration, migration and import', () => {
  const sawComponent = (id) => ({
    id,
    name: 'Saw',
    img: 'saw.webp',
    registeredItemUuid: 'Item.saw',
  });

  it('keeps a row the migration reports conflicting conflicting at the next save', async () => {
    const toolScope = {
      entities: [{ id: 'world-saw', name: 'Saw', registeredItemUuid: 'Item.saw' }],
      defaults: {},
      membership: {},
    };
    const sysA = {
      id: 'sysA',
      name: 'A',
      components: [sawComponent('c1')],
      tools: [{ id: 't1', componentId: 'c1' }],
    };
    const migrated = reconcileOrphanedScopedIdentities(
      { systems: [sysA], essenceScope: {}, toolScope },
      { parseUuid }
    );
    const report = migrated._scopedIdentityReconcileReport;
    assert.deepEqual(
      report.conflicting.map((entry) => [entry.id, entry.reason]),
      [['t1', 'sourceCollision']]
    );
    const w = world({ toolScope: migrated.toolScope });
    // The persisted record as the migration read it, saved without renormalization.
    const persisted = structuredClone(sysA);
    w.manager.systems.set('sysA', persisted);
    await w.manager.save({ put: persisted });
    assert.deepEqual(entityIds(w.persisted('toolScope')), ['world-saw'], 'no duplicate entity');
    assert.equal(membershipOf(w.persisted('toolScope'), 't1', 'sysA'), null);
    assert.equal(w.warnings.length, 1);
  });

  it('two systems upserting a component-sourced Tool share one named world Tool', async () => {
    const w = world({ toolScope: {} });
    await w.manager.createSystem({ id: 'sysA', name: 'A', components: [sawComponent('c1')] });
    await w.manager.createSystem({ id: 'sysB', name: 'B', components: [sawComponent('c2')] });
    const first = await w.manager.upsertTool('sysA', { componentId: 'c1' });
    const second = await w.manager.upsertTool('sysB', { componentId: 'c2' });
    assert.equal(second.item.id, first.item.id);
    const scope = w.persisted('toolScope');
    assert.deepEqual(entityIds(scope), [first.item.id]);
    assert.equal(scope.entities[0].name, 'Saw');
    assert.equal(scope.entities[0].img, 'saw.webp');
    assert.equal(scope.entities[0].registeredItemUuid, 'Item.saw');
    assert.ok(membershipOf(scope, first.item.id, 'sysA'));
    assert.ok(membershipOf(scope, first.item.id, 'sysB'));
    assert.deepEqual(w.warnings, []);
  });

  it('the migration creates a component-sourced Tool carrying its component identity', () => {
    const sysA = {
      id: 'sysA',
      components: [sawComponent('c1')],
      tools: [{ id: 't1', componentId: 'c1' }],
    };
    const { toolScope } = reconcileOrphanedScopedIdentities(
      { systems: [sysA], essenceScope: {}, toolScope: {} },
      { parseUuid }
    );
    assert.deepEqual(toolScope.entities, [
      { id: 't1', name: 'Saw', img: 'saw.webp', registeredItemUuid: 'Item.saw' },
    ]);
  });
});

describe('the save chokepoint, pinned further', () => {
  it('never registers a retired essence id, warning exactly once', async () => {
    const w = world({ essenceScope: {}, mergeMap: { retired: { ash: { name: 'Ash' } } } });
    await w.manager.createSystem({ id: 'sysA', name: 'A', essenceDefinitions: [essence('ash')] });
    const scope = w.persisted('essenceScope');
    assert.deepEqual(entityIds(scope ?? {}), []);
    assert.equal(membershipOf(scope, 'ash', 'sysA'), null);
    assert.equal(w.warnings.length, 1);
  });

  it("copies a created Tool row's repairRequirements onto its membership", async () => {
    const w = world({ toolScope: {} });
    const repairRequirements = [
      { id: 'g1', name: 'Mend', options: [{ componentId: 'c1', quantity: 1 }] },
    ];
    await w.manager.createSystem({
      id: 'sysA',
      name: 'A',
      components: [{ id: 'c1', name: 'C' }],
      tools: [{ id: 't1', name: 'Saw', componentId: 'c1', repairRequirements }],
    });
    const membership = membershipOf(w.persisted('toolScope'), 't1', 'sysA');
    const persisted = w.persisted('craftingSystems')[0].tools[0].repairRequirements;
    assert.ok(persisted.length > 0);
    assert.deepEqual(membership.repairRequirements, persisted);
  });

  it('registers every system a batch save writes', async () => {
    const w = world({ version: '1.35.0' });
    await w.manager.createSystem({ id: 'sysA', name: 'A', essenceDefinitions: [essence('fire')] });
    await w.manager.createSystem({ id: 'sysB', name: 'B', essenceDefinitions: [essence('ash')] });
    w.env.settings.set('migrationVersion', '1.36.0');
    await w.manager.save({ batch: [w.manager.getSystem('sysA'), w.manager.getSystem('sysB')] });
    assert.deepEqual(entityIds(w.persisted('essenceScope')), ['fire', 'ash']);
    assert.deepEqual(unregisteredRows(w), []);
  });

  it('a failed createSystem over an existing id keeps the live system in memory', async () => {
    const w = world({ essenceScope: {} });
    await w.manager.createSystem({ id: 'sysA', name: 'A' });
    w.reject('essenceScope', new Error('refused'));
    await assert.rejects(
      w.manager.createSystem({ id: 'sysA', name: 'Other', essenceDefinitions: [essence('fire')] }),
      WorldScopeRegistrationError
    );
    assert.equal(w.manager.getSystem('sysA').name, 'A');
  });

  it('announces the restore only when a scope was written before the failure', async () => {
    const w = world({ essenceScope: {}, toolScope: {} });
    await w.manager.createSystem({ id: 'sysA', name: 'A' });
    let announced = 0;
    w.manager._notifySystemsChanged = () => {
      announced += 1;
    };
    w.reject('essenceScope', new Error('refused'));
    await assert.rejects(w.manager.updateSystem('sysA', { essenceDefinitions: [essence('fire')] }));
    assert.equal(announced, 0, 'nothing was written');
    w.reject('craftingSystems', new Error('systems refused'));
    await assert.rejects(w.manager.updateSystem('sysA', { essenceDefinitions: [essence('fire')] }));
    assert.equal(announced, 1, 'the essence scope was written, then withdrawn');
    assert.deepEqual(w.manager.getSystem('sysA').essenceDefinitions, []);
  });
});
