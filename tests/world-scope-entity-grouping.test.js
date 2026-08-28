/**
 * UNIT AND PROPERTY COVERAGE for the pure world-scope transforms (issue 1363, Phase 10).
 *
 * The grouping rules, the oldest-wins identity rule, the id-claim ladder, the per-system map and
 * its two refusal invariants, and the membership records the migration writes.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildWorldScopeGrouping,
  identityOf,
  isRefusedPair,
  REKEYABLE_ENTITY_TYPES,
  sourceReferencesOf,
  toolSourceReferences,
  WORLD_IDENTITY_FIELDS,
} from '../src/migration/worldScopeEntityGrouping.js';
import {
  buildMembershipRecord,
  migrateWorldScopeEntities,
  normalizeRekeyMap,
} from '../src/migration/migrateWorldScopeEntities.js';
import {
  installFoundryStubs,
  malformedCorpus,
  normalizeCorpus,
  scenarioSpecs,
} from './helpers/worldScopeCorpus.js';

installFoundryStubs();
const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');

/** A minimal system carrying only what a grouping assertion needs. */
function system(id, { components = [], essenceDefinitions = [], tools = [] } = {}) {
  return { id, name: `System ${id}`, components, essenceDefinitions, tools };
}

function component(id, refs = [], extra = {}) {
  return {
    id,
    name: `Component ${id}`,
    originItemUuid: refs[0] ?? null,
    registeredItemUuid: refs[0] ?? null,
    aliasItemUuids: refs.slice(1),
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// Totality
// ---------------------------------------------------------------------------

test('grouping is TOTAL and NON-THROWING on an adversarial corpus', () => {
  for (const input of [undefined, null, 'nope', 42, [], malformedCorpus().systems]) {
    const grouping = buildWorldScopeGrouping(input);
    assert.ok(Array.isArray(grouping.entities.components));
    assert.ok(Array.isArray(grouping.renames));
    assert.ok(Array.isArray(grouping.refusals));
  }
});

test('a self-referential record cannot starve the pass', () => {
  const cyclic = component('comp-1', ['Item.a']);
  cyclic.self = cyclic;
  const grouping = buildWorldScopeGrouping([system('sys-a', { components: [cyclic] })]);
  assert.equal(grouping.entities.components.length, 1);
});

test('the whole migration is TOTAL on a malformed corpus', () => {
  const corpus = malformedCorpus();
  const result = migrateWorldScopeEntities({
    ...corpus,
    componentScope: {},
    essenceScope: {},
    toolScope: {},
    worldScopeRekeyMap: {},
  });
  assert.ok(result._worldScopeEntityReport);
});

// ---------------------------------------------------------------------------
// Grouping (`#### D2`)
// ---------------------------------------------------------------------------

test('components group by TRANSITIVE CLOSURE over source-reference sets', () => {
  const grouping = buildWorldScopeGrouping([
    system('sys-a', { components: [component('c1', ['Item.a'])] }),
    system('sys-b', { components: [component('c2', ['Item.a', 'Item.b'])] }),
    system('sys-c', { components: [component('c3', ['Item.b'])] }),
  ]);
  assert.equal(grouping.entities.components.length, 1, 'all three are ONE entity, transitively');
  assert.equal(grouping.entities.components[0].members.length, 3);
  assert.equal(grouping.transitiveGroups.length, 1, 'a >2-member group is REPORTED for review');
});

test('an UNLINKED definition is its own world entity and is never merged, not even by NAME', () => {
  const grouping = buildWorldScopeGrouping([
    system('sys-a', { components: [component('c1', [], { name: 'Ash Salt' })] }),
    system('sys-b', { components: [component('c2', [], { name: 'Ash Salt' })] }),
    system('sys-c', { components: [component('c3', ['Item.a'], { name: 'Ash Salt' })] }),
  ]);
  assert.equal(
    grouping.entities.components.length,
    3,
    'merging two unlinked same-named records would be a silent irreversible content change made on a guess'
  );
});

test('essences group by trimmed id and are NEVER re-keyed', () => {
  const grouping = buildWorldScopeGrouping([
    system('sys-a', { essenceDefinitions: [{ id: 'fire', name: 'Fire' }] }),
    system('sys-b', { essenceDefinitions: [{ id: ' fire ', name: 'Flame' }] }),
  ]);
  assert.equal(grouping.entities.essences.length, 1);
  assert.equal(grouping.entities.essences[0].id, 'fire');
  for (const legs of Object.values(grouping.rekeyMap)) {
    assert.ok(!('essences' in legs), 'the re-key map carries NO essence leg');
  }
  assert.ok(!REKEYABLE_ENTITY_TYPES.includes('essences'));
});

test('a tool with no source refs of its own groups through its componentId, as the normalizer derives it', () => {
  assert.deepEqual(toolSourceReferences({ componentId: 'c1' }, [component('c1', ['Item.a'])]), [
    'Item.a',
  ]);
  assert.deepEqual(
    toolSourceReferences({ componentId: 'c1', originItemUuid: 'Item.own' }, [
      component('c1', ['Item.a']),
    ]),
    ['Item.own'],
    'a tool with its OWN refs derives nothing, exactly as deriveToolSourceFromComponents guards'
  );
  assert.deepEqual(
    toolSourceReferences({ componentId: 'missing' }, []),
    [],
    'a dangling link derives nothing'
  );

  const grouping = buildWorldScopeGrouping([
    system('sys-a', {
      components: [component('c1', ['Item.a'])],
      tools: [{ id: 't1', name: 'Hammer', componentId: 'c1' }],
    }),
    system('sys-b', {
      components: [component('c2', ['Item.a'])],
      tools: [{ id: 't2', name: 'Mallet', componentId: 'c2' }],
    }),
  ]);
  assert.equal(grouping.entities.tools.length, 1, 'both tools resolve to the same source item');
});

test('source references are read new-name-first and legacy-name-tolerant', () => {
  assert.deepEqual(sourceReferencesOf({ sourceUuid: 'Item.a', fallbackItemIds: ['Item.b'] }), [
    'Item.a',
    'Item.b',
  ]);
  assert.deepEqual(sourceReferencesOf(null), []);
});

// ---------------------------------------------------------------------------
// Identity and the ladder (`#### D3`)
// ---------------------------------------------------------------------------

test('the OLDEST contributing definition wins every identity field AS A UNIT', () => {
  const grouping = buildWorldScopeGrouping([
    system('sys-a', {
      components: [
        component('c1', ['Item.a'], { name: 'Ash Salt', img: 'a.png', description: 'A' }),
      ],
    }),
    system('sys-b', {
      components: [component('c2', ['Item.a'], { name: 'Cinder', img: 'b.png', description: 'B' })],
    }),
  ]);
  const entity = grouping.entities.components[0];
  assert.equal(entity.identity.name, 'Ash Salt');
  assert.equal(entity.identity.img, 'a.png');
  assert.equal(entity.identity.description, 'A', 'never field-by-field — no chimera identity');
  assert.equal(entity.donorSystemId, 'sys-a');
});

test('EVERY rename is reported, and a byte-identical group produces none', () => {
  const shared = { name: 'Ash Salt', img: 'a.png', description: 'A' };
  const identical = buildWorldScopeGrouping([
    system('sys-a', { components: [component('c1', ['Item.a'], shared)] }),
    system('sys-b', { components: [component('c1', ['Item.a'], shared)] }),
  ]);
  assert.deepEqual(identical.renames, [], 'same id, same identity: nothing to tell the GM');

  const renamed = buildWorldScopeGrouping([
    system('sys-a', { components: [component('c1', ['Item.a'], shared)] }),
    system('sys-b', { components: [component('c2', ['Item.a'], shared)] }),
  ]);
  assert.equal(renamed.renames.length, 1, 'a re-key is a rename even with identical identity');
  assert.deepEqual(renamed.renames[0], {
    entityType: 'components',
    entityId: 'c1',
    systemId: 'sys-b',
    donorSystemId: 'sys-a',
    oldId: 'c2',
    newId: 'c1',
    changedFields: [],
  });
});

test('the id-claim ladder: oldest, then next-oldest, then `-w<n>`', () => {
  // `sys-a` claims `shared`. `sys-b`'s `shared` names a DIFFERENT source item, so it is its own
  // entity — and its own id is already claimed, so the ladder falls to its next-oldest member
  // (there is none) and then to the suffix.
  const grouping = buildWorldScopeGrouping([
    system('sys-a', { components: [component('shared', ['Item.a'])] }),
    system('sys-b', { components: [component('shared', ['Item.b'])] }),
    system('sys-c', { components: [component('shared', ['Item.c'])] }),
  ]);
  assert.deepEqual(
    grouping.entities.components.map((entity) => entity.id),
    ['shared', 'shared-w2', 'shared-w3'],
    'copy-import preserves ids, so component ids are NOT globally unique and the ladder is required'
  );
  assert.equal(grouping.rekeyMap['sys-b'].components.shared, 'shared-w2');
  assert.equal(grouping.rekeyMap['sys-c'].components.shared, 'shared-w3');
});

test('the ladder takes the NEXT-OLDEST id when the oldest is already claimed', () => {
  // `sys-a` claims `taken`. The SECOND group is `sys-b`'s `taken` plus `sys-c`'s `free`, both
  // pointing at `Item.b`: its oldest id is already claimed, so the ladder steps to the
  // next-oldest member's id rather than minting a `-w2` suffix.
  const grouping = buildWorldScopeGrouping([
    system('sys-a', { components: [component('taken', ['Item.a'])] }),
    system('sys-b', { components: [component('taken', ['Item.b'])] }),
    system('sys-c', { components: [component('free', ['Item.b'])] }),
  ]);
  assert.deepEqual(
    grouping.entities.components.map((entity) => entity.id).sort(),
    ['free', 'taken'],
    'the next-oldest UNCLAIMED id is taken before any suffix is minted'
  );
  assert.equal(grouping.rekeyMap['sys-b'].components.taken, 'free');
  assert.equal(grouping.rekeyMap['sys-c'], undefined, 'sys-c keeps its own id, so it has no map');
});

test('identityOf is absence-preserving and copies arrays rather than aliasing them', () => {
  const record = component('c1', ['Item.a', 'Item.b']);
  delete record.description;
  const identity = identityOf(record, 'components');
  assert.equal('description' in identity, false);
  identity.aliasItemUuids.push('Item.c');
  assert.deepEqual(record.aliasItemUuids, ['Item.b'], 'the world entity never aliases the record');
});

// ---------------------------------------------------------------------------
// The map and its two refusal invariants
// ---------------------------------------------------------------------------

test('the map image is DISJOINT from its key set on every accepted pair', () => {
  for (const scenario of scenarioSpecs()) {
    const before = normalizeCorpus(CraftingSystemManager, scenario.raw);
    const grouping = buildWorldScopeGrouping(before.systems);
    for (const [systemId, legs] of Object.entries(grouping.rekeyMap)) {
      for (const [entityType, leg] of Object.entries(legs)) {
        const keys = new Set(Object.keys(leg));
        for (const value of Object.values(leg)) {
          assert.ok(
            !keys.has(value),
            `${scenario.name}: ${systemId}/${entityType} produced a non-disjoint map`
          );
        }
      }
    }
  }
});

test('the OUTPUT-uniqueness post-condition refuses a pair disjointness alone would allow', () => {
  // TWO definitions in ONE system pointing at the SAME source item. They are one world entity,
  // so `q` is re-keyed onto `p` — and the map `{q: p}` is PERFECTLY DISJOINT, because its image
  // `p` is not one of its keys. Yet the pair would emit two definitions with the id `p`, which
  // is silently last-wins in both index builders and makes one of them unreachable with no
  // error. Only a post-condition on the OUTPUT can see it.
  //
  // THE FIXTURE MATTERS AND AN EARLIER ONE WAS VACUOUS: a cross-system collision that also
  // re-keys the colliding id is caught by the disjointness check FIRST, so it proves nothing
  // about this post-condition and survives its removal.
  const grouping = buildWorldScopeGrouping([
    system('sys-a', { components: [component('p', ['Item.x']), component('q', ['Item.x'])] }),
  ]);
  assert.deepEqual(
    grouping.refusals,
    [{ systemId: 'sys-a', entityType: 'components', reason: 'outputIdCollision' }],
    'the pair must be REFUSED on its OUTPUT, and for that reason rather than for disjointness'
  );
  assert.ok(isRefusedPair(grouping.refusals, 'sys-a', 'components'));
  assert.equal(grouping.rekeyMap['sys-a'], undefined, 'a refused pair contributes no map at all');

  // The DISJOINTNESS refusal is a genuinely different case, and is pinned separately so neither
  // check can be deleted behind the other.
  const nonDisjoint = buildWorldScopeGrouping([
    system('sys-a', { components: [component('keep', ['Item.a'])] }),
    system('sys-b', {
      components: [component('move', ['Item.a']), component('keep', ['Item.b'])],
    }),
  ]);
  assert.deepEqual(nonDisjoint.refusals, [
    { systemId: 'sys-b', entityType: 'components', reason: 'nonDisjointMap' },
  ]);
});

test('a refusal in one system does not refuse the others', () => {
  const grouping = buildWorldScopeGrouping([
    system('sys-a', { components: [component('keep', ['Item.a'])] }),
    system('sys-b', {
      components: [component('move', ['Item.a']), component('keep', ['Item.b'])],
    }),
    system('sys-c', { components: [component('other', ['Item.a'])] }),
  ]);
  assert.ok(isRefusedPair(grouping.refusals, 'sys-b', 'components'));
  assert.ok(!isRefusedPair(grouping.refusals, 'sys-c', 'components'));
  assert.equal(grouping.rekeyMap['sys-c'].components.other, 'keep');
});

test('normalizeRekeyMap drops anything that cannot be a map', () => {
  assert.deepEqual(normalizeRekeyMap(null), {});
  assert.deepEqual(normalizeRekeyMap({ sys: 'nope' }), {});
  assert.deepEqual(normalizeRekeyMap({ sys: { essences: { a: 'b' } } }), {}, 'no essence leg');
  assert.deepEqual(normalizeRekeyMap({ sys: { components: { a: 'b', '': 'c', d: 4 } } }), {
    sys: { components: { a: 'b' } },
  });
});

// ---------------------------------------------------------------------------
// The membership records (`#### D1`, `#### D6`)
// ---------------------------------------------------------------------------

test('every membership record is created with EVERY SECTION OVERRIDDEN and its values verbatim', () => {
  const componentRecord = buildMembershipRecord(
    { id: 'c1', category: ' reagent ', tags: ['a', 'b'], mutedTags: ['x'] },
    'components',
    'c1',
    'sys-a'
  );
  assert.deepEqual(componentRecord, {
    entityId: 'c1',
    systemId: 'sys-a',
    inherit: { category: false },
    category: 'reagent',
    tags: ['a', 'b'],
  });
  assert.equal('mutedTags' in componentRecord, false, 'no mutedTags: the tag merge is ADDITIVE');
  assert.equal(
    'enabled' in componentRecord,
    false,
    'a component membership carries NO enabled flag'
  );

  const essenceRecord = buildMembershipRecord(
    {
      id: 'fire',
      enabled: false,
      propertyMacroUuid: 'Macro.a',
      sourceComponentId: 'c1',
      sourceItemUuid: 'Item.a',
      associatedSystemItemId: 'c1',
    },
    'essences',
    'fire',
    'sys-a'
  );
  assert.deepEqual(essenceRecord, {
    entityId: 'fire',
    systemId: 'sys-a',
    inherit: { effectSource: false, macro: false },
    effectSource: {
      sourceComponentId: 'c1',
      sourceItemUuid: 'Item.a',
      associatedSystemItemId: 'c1',
    },
    macro: 'Macro.a',
    enabled: false,
  });

  const toolRecord = buildMembershipRecord(
    {
      id: 't1',
      enabled: true,
      breakage: { mode: 'limitedUses', maxUses: 2 },
      onBreak: { mode: 'destroy' },
      repairRequirements: [{ id: 'rr', options: [] }],
    },
    'tools',
    't1',
    'sys-a'
  );
  assert.deepEqual(toolRecord.inherit, { breakage: false, onBreak: false });
  assert.deepEqual(toolRecord.breakage, { mode: 'limitedUses', maxUses: 2 });
  assert.deepEqual(toolRecord.repairRequirements, [{ id: 'rr', options: [] }]);
});

test('a membership effectSource is written for EVERY essence, world-addressable or not', () => {
  const record = buildMembershipRecord({ id: 'fire' }, 'essences', 'fire', 'sys-a');
  assert.deepEqual(record.effectSource, {}, 'the section is present even when it names nothing');
  assert.equal(record.inherit.effectSource, false, 'and the switch is OFF, so it never inherits');
});

test('NO world default is written, on any corpus in the Inputs set', () => {
  for (const scenario of scenarioSpecs()) {
    const before = normalizeCorpus(CraftingSystemManager, scenario.raw);
    const result = migrateWorldScopeEntities({
      recipes: before.recipes,
      systems: before.systems,
      gatheringConfig: before.gatheringConfig,
      componentScope: {},
      essenceScope: {},
      toolScope: {},
      worldScopeRekeyMap: {},
    });
    for (const key of ['componentScope', 'essenceScope', 'toolScope']) {
      const payload = result[key];
      if (!payload || !payload.defaults) continue;
      assert.deepEqual(
        payload.defaults,
        {},
        `${scenario.name}: ${key}.defaults must be WRITTEN and EMPTY — seededness keys on key PRESENCE`
      );
    }
    assert.equal(
      result.toolScope?.toolBreakage,
      undefined,
      `${scenario.name}: the migration writes NO world tool-breakage authority`
    );
  }
});

test('every world entity carries ONLY identity fields, plus its id', () => {
  const before = normalizeCorpus(CraftingSystemManager, scenarioSpecs()[0].raw);
  const result = migrateWorldScopeEntities({
    recipes: before.recipes,
    systems: before.systems,
    gatheringConfig: before.gatheringConfig,
    componentScope: {},
    essenceScope: {},
    toolScope: {},
    worldScopeRekeyMap: {},
  });
  for (const [entityType, key] of [
    ['components', 'componentScope'],
    ['essences', 'essenceScope'],
    ['tools', 'toolScope'],
  ]) {
    const allowed = new Set(['id', ...WORLD_IDENTITY_FIELDS[entityType]]);
    for (const entity of result[key].entities) {
      for (const field of Object.keys(entity)) {
        assert.ok(allowed.has(field), `${entityType}: a world entity must not carry ${field}`);
      }
    }
  }
});
