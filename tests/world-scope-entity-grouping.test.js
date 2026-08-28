/**
 * UNIT AND PROPERTY COVERAGE for the pure world-scope transforms (issue 1363, Phase 10).
 *
 * The grouping rules, the oldest-wins identity rule, the id-claim ladder, the per-system map and
 * its two refusal invariants, and the membership records the migration writes.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { WORLD_DEFAULT_SECTIONS } from '../src/migration/worldScopeDefaults.js';
import { COMPONENT_SCOPE } from '../src/systems/componentScope.js';
import { ESSENCE_SCOPE } from '../src/systems/essenceScope.js';
import { resolveScopedDefinition } from '../src/systems/scopedDefinitions.js';
import { TOOL_SCOPE } from '../src/systems/toolScope.js';
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

test('the three SOURCE-LINK fields are UNIONED across the group, never taken from the donor', async () => {
  // THE A-B-C CHAIN. Union-find guarantees only that the group is CONNECTED: C shares a uuid
  // with B and nothing at all with A. Taking A's links as a unit would DELETE C's unique uuid
  // permanently, and an owned Item sourced from it would then stop resolving at the
  // source-reference tier - the tier this change's whole degradation story rests on.
  // `Item.c` IS CLAIMED BY EXACTLY ONE MEMBER, and that is the point of the fixture: with every
  // reference held by two or more members, a hypothetical "union only what >= 2 members share"
  // implementation would pass this arm while still deleting the uuids only one member claims.
  const grouping = buildWorldScopeGrouping([
    system('sys-a', { components: [component('c-a', ['Item.a'])] }),
    system('sys-b', { components: [component('c-b', ['Item.a', 'Item.b'])] }),
    system('sys-c', { components: [component('c-c', ['Item.b', 'Item.c'])] }),
  ]);
  assert.equal(grouping.entities.components.length, 1, 'the premise: one transitive group');
  const [entity] = grouping.entities.components;
  assert.equal(entity.donorSystemId, 'sys-a');
  assert.equal(entity.identity.originItemUuid, 'Item.a', 'the donor keeps the PRIMARIES');
  assert.equal(entity.identity.registeredItemUuid, 'Item.a');
  assert.deepEqual(
    entity.identity.aliasItemUuids,
    ['Item.b', 'Item.c'],
    "C's uuids survive as aliases, INCLUDING the one no other member claims"
  );

  // DISPLAY IDENTITY IS STILL DONOR-WINS-AS-A-UNIT. Only the source links union.
  const named = buildWorldScopeGrouping([
    system('sys-a', { components: [component('c-a', ['Item.a'], { name: 'Ash Salt' })] }),
    system('sys-b', { components: [component('c-b', ['Item.a', 'Item.b'], { name: 'Cinder' })] }),
  ]);
  assert.equal(named.entities.components[0].identity.name, 'Ash Salt');

  // AND THE OWNED ITEM STILL RESOLVES. `resolveComponentForItem`'s source-reference tier
  // intersects reference SETS, so a copy stamped from C's uuid finds the merged component.
  const { resolveComponentForItem } = await import('../src/utils/sourceUuid.js');
  const migrated = migrateWorldScopeEntities({
    recipes: [],
    systems: [
      system('sys-a', { components: [component('c-a', ['Item.a'])] }),
      system('sys-b', { components: [component('c-b', ['Item.a', 'Item.b'])] }),
      system('sys-c', { components: [component('c-c', ['Item.b', 'Item.c'])] }),
    ],
    gatheringConfig: {},
    componentScope: {},
    essenceScope: {},
    toolScope: {},
    worldScopeRekeyMap: {},
  });
  // Sourced from the uuid ONLY C claimed, which donor-wins would have deleted outright.
  const ownedFromC = { uuid: 'Item.owned', _stats: { duplicateSource: 'Item.c' } };
  for (const migratedSystem of migrated.systems) {
    const resolved = resolveComponentForItem(
      ownedFromC,
      migratedSystem.components,
      migratedSystem.id
    );
    assert.ok(
      resolved,
      `${migratedSystem.id}: an owned Item sourced from the chain's far end must still resolve`
    );
    assert.equal(resolved.id, 'c-a', 'to the merged world entity');
  }
});

test('the union RESHAPING a member source link is not reported as an identity change', () => {
  // THE OTHER HALF OF THE UNION RULE, and the one nothing pinned. Ruling 3 keeps the DONOR's two
  // primaries and demotes every other member's into `aliasItemUuids`, so after the union almost
  // every member's own source-link projection DIFFERS from the world entity's in SHAPE while
  // losing no reference at all. `unionAbsorbed` is what stops that difference being reported, and
  // without it the GM is told about renames that did not happen — including, absurdly, the DONOR
  // being told its own identity changed inside its own group.
  //
  // MEASURED, so the mutation budget is honest: forcing `unionAbsorbed` to `true` is BYTE-
  // IDENTICAL over the whole acceptance corpus, because `groupIdentity` collects EVERY member's
  // references into `primaries ∪ aliases` and the predicate is therefore a tautology under the
  // union. It is a defensive guard against a regression to donor-wins narrowing, not a reachable
  // branch, and no test can redden that direction. Forcing it to `false` DOES redden, and that is
  // the direction this arm owns: over-reporting.
  const grouping = buildWorldScopeGrouping([
    system('sys-a', { components: [component('c-a', ['Item.a'])] }),
    system('sys-b', { components: [component('c-b', ['Item.a', 'Item.b'])] }),
    system('sys-c', { components: [component('c-c', ['Item.b', 'Item.c'])] }),
  ]);
  const [entity] = grouping.entities.components;

  // THE PREMISE, asserted rather than assumed: the donor's OWN projection really does disagree
  // with the group identity on a source-link field, so the suppression had something to suppress.
  const donorRecord = component('c-a', ['Item.a']);
  assert.notDeepEqual(
    identityOf(donorRecord, 'components').aliasItemUuids,
    entity.identity.aliasItemUuids,
    'the premise: the union WIDENED the donor own alias list'
  );

  const sourceLink = ['originItemUuid', 'registeredItemUuid', 'aliasItemUuids'];
  for (const rename of grouping.renames) {
    assert.deepEqual(
      rename.changedFields.filter((field) => sourceLink.includes(field)),
      [],
      `${rename.systemId}/${rename.oldId}: a reshaped-but-not-narrowed source link is NOT a rename`
    );
  }
  assert.deepEqual(
    grouping.renames.filter((rename) => rename.systemId === rename.donorSystemId),
    [],
    'and the donor is never reported as having renamed itself'
  );
  // ANTI-VACUITY: an empty rename list would satisfy both loops above.
  assert.ok(grouping.renames.length > 0, 'the two re-keyed members are still reported');
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

test('macro and effectSource are written UNCONDITIONALLY, so neither can fall back', async () => {
  // THE RAW CORPUS IS WHERE THIS BITES, and it is why the differential cannot carry this arm:
  // it normalizes its corpora, and `_normalizeEssenceDefinition` always MINTS
  // `propertyMacroUuid`, so an absence-preserving write is inert there. The migration reads the
  // RAW `craftingSystems` setting, and `propertyMacroUuid` is new at issue 1036 - so any world
  // not re-saved since carries essences with no such key at all.
  const { resolveScopedDefinition } = await import('../src/systems/scopedDefinitions.js');
  const { ESSENCE_SCOPE } = await import('../src/systems/essenceScope.js');

  // A record that PREDATES the field: no `propertyMacroUuid` key, no source spellings.
  const membership = buildMembershipRecord({ id: 'fire' }, 'essences', 'fire', 'sys-b');
  assert.equal(membership.macro, null, 'an absent macro is written as an explicit null');
  assert.deepEqual(membership.effectSource, {}, 'and an absent source as an explicit empty map');

  // Resolved against a DONOR world default that DOES author both, neither may fall back.
  const worldDefault = {
    id: 'fire',
    macro: 'Macro.donor',
    effectSource: { sourceComponentId: 'x' },
  };
  const resolved = resolveScopedDefinition(worldDefault, membership, ESSENCE_SCOPE);
  assert.equal(resolved.macro, null, "the member must NOT inherit the donor's property macro");
  assert.deepEqual(resolved.effectSource, {}, "nor the donor's effect source");
});

test('a membership effectSource is written for EVERY essence, world-addressable or not', () => {
  const record = buildMembershipRecord({ id: 'fire' }, 'essences', 'fire', 'sys-a');
  assert.deepEqual(record.effectSource, {}, 'the section is present even when it names nothing');
  assert.equal(record.inherit.effectSource, false, 'and the switch is OFF, so it never inherits');
});

test('a WORLD DEFAULT is elected from the donor, and NEVER the reserved `general` category', () => {
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
    for (const [entityType, key] of [
      ['components', 'componentScope'],
      ['essences', 'essenceScope'],
      ['tools', 'toolScope'],
    ]) {
      const defaults = result[key]?.defaults;
      if (!defaults) continue;
      for (const [entityId, record] of Object.entries(defaults)) {
        assert.equal(record.id, entityId, `${key}: the map key is DERIVED from the record`);
        const allowed = new Set(['id', ...WORLD_DEFAULT_SECTIONS[entityType]]);
        for (const field of Object.keys(record)) {
          assert.ok(allowed.has(field), `${key}: a world default must not carry ${field}`);
        }
        // CONSTRAINT 1, on every corpus: the reserved bucket is never persisted at world scope.
        assert.notEqual(
          record.category,
          'general',
          scenario.name + ': a world general category resets every inheriting system'
        );
        // `tags` is deliberately NOT lifted: the merge is ADDITIVE with no inherit switch, so a
        // world tag list is granted to EVERY member system at once.
        assert.equal('tags' in record, false, 'component tags are never a world default');
      }
    }
    assert.equal(
      result.toolScope?.toolBreakage,
      undefined,
      `${scenario.name}: the migration still writes NO world tool-breakage authority`
    );
  }
});

test('the world defaults change NOTHING at migration time, RESOLVED VALUE by resolved value', () => {
  // THE SWITCH IS NOT THE VALUE, and asserting the switch was this arm's structural blindness:
  // `inherit: false` over an ABSENT section is exactly the state that FALLS BACK to the world
  // value, so `inherit[section] === false` is satisfied by the very records that inherit.
  // The whole safety argument for electing a donor: a world default is only ever consulted for a
  // system added LATER, or an override a GM clears later. The corpus differential is what proves
  // it end to end; this pins the mechanism directly.
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
  const SCOPES = { components: COMPONENT_SCOPE, essences: ESSENCE_SCOPE, tools: TOOL_SCOPE };
  const FIELDS = { components: 'components', essences: 'essenceDefinitions', tools: 'tools' };
  const OWN_VALUE = {
    category: (record) => record.category,
    effectSource: (record) => {
      const source = {};
      for (const field of ['sourceComponentId', 'sourceItemUuid', 'associatedSystemItemId']) {
        if (record[field] !== undefined) source[field] = record[field];
      }
      return source;
    },
    macro: (record) => record.propertyMacroUuid ?? null,
    breakage: (record) => record.breakage,
    onBreak: (record) => record.onBreak,
  };

  let checked = 0;
  let withWorldDefault = 0;
  for (const [entityType, key] of [
    ['components', 'componentScope'],
    ['essences', 'essenceScope'],
    ['tools', 'toolScope'],
  ]) {
    for (const membership of Object.values(result[key].membership)) {
      const system = result.systems.find((entry) => entry.id === membership.systemId);
      const record = (system?.[FIELDS[entityType]] ?? []).find(
        (entry) => entry.id === membership.entityId
      );
      assert.ok(record, `${membership.entityId} has no in-system record`);
      const worldDefault = result[key].defaults?.[membership.entityId] ?? null;
      if (worldDefault) withWorldDefault += 1;
      const resolved = resolveScopedDefinition(worldDefault, membership, SCOPES[entityType]);
      for (const section of WORLD_DEFAULT_SECTIONS[entityType]) {
        if (section === 'repairRequirements') continue;
        assert.deepEqual(
          resolved[section] ?? null,
          OWN_VALUE[section](record) ?? null,
          `${entityType}.${section} for ${membership.entityId}/${membership.systemId} must ` +
            'resolve to the SYSTEM OWN value, never the donor value'
        );
        checked += 1;
      }
    }
  }
  assert.ok(checked >= 15, `the arm must actually examine sections (${checked})`);
  // ANTI-VACUITY: with no world default in play the fallback cannot fire, so an arm that only
  // ever saw `null` would prove nothing at all.
  assert.ok(withWorldDefault > 0, 'and some of them must actually HAVE a world default');
  assert.ok(
    Object.keys(result.componentScope.defaults).length > 0,
    'and the premise: this corpus really does elect some world defaults'
  );
});

test('CONSTRAINT 1: a donor whose category is the reserved `general` elects NO world default', async () => {
  const { electWorldDefault } = await import('../src/migration/worldScopeDefaults.js');
  const elect = (category) =>
    electWorldDefault({
      entityType: 'components',
      entityId: 'c1',
      donorRecord: { id: 'c1', category },
      worldComponentIds: new Set(['c1']),
      isMemberOf: () => true,
      memberSystemIds: ['sys-a'],
    });
  assert.deepEqual(elect('reagent').record, { id: 'c1', category: 'reagent' });
  assert.equal(elect('general').record, null, 'the reserved bucket is never persisted');
  assert.deepEqual(elect('general').refusedSections, ['category'], 'and the refusal is REPORTED');
  // An UNAUTHORED section is refused too, by CONSTRAINT 0 rather than by this one - a membership
  // record cannot express an empty `category` override, so a world default would be inherited.
  assert.equal(elect('').record, null);
  assert.deepEqual(elect('').refusedSections, ['category']);
});

test('CONSTRAINT 0: a section ANY member left unauthored elects NO world default', async () => {
  // THE BLOCKING DEFECT THIS CLOSES. `resolveScopedDefinition` resolves an `inherit: false` switch
  // over an ABSENT section to the WORLD value - a stated requirement, not an accident - and
  // `buildMembershipRecord` is necessarily absence-preserving for `category`, `breakage` and
  // `onBreak`, because none of the three can express an empty override. So a world default for a
  // section some member never authored silently hands that member the DONOR's value, which is
  // exactly the "resolved behaviour is unchanged" condition the election was granted on.
  const { electWorldDefault } = await import('../src/migration/worldScopeDefaults.js');
  const elect = (memberRecords) =>
    electWorldDefault({
      entityType: 'tools',
      entityId: 't1',
      donorRecord: memberRecords[0],
      memberRecords,
      worldComponentIds: new Set(),
      isMemberOf: () => true,
      memberSystemIds: memberRecords.map((_, index) => `sys-${index}`),
    });

  const authored = {
    id: 't1',
    breakage: { mode: 'limitedUses', maxUses: 3 },
    onBreak: { mode: 'destroy' },
  };
  assert.ok(
    elect([authored, { ...authored }]).record.breakage,
    'every member authored it: elected'
  );

  const partial = elect([authored, { id: 't1' }]);
  assert.equal(partial.record, null, 'one member authored NEITHER section, so neither is elected');
  assert.deepEqual(partial.refusedSections.sort(), ['breakage', 'onBreak']);

  // PER SECTION, not per entity: a member missing only `onBreak` still elects `breakage`.
  const mixed = elect([authored, { id: 't1', breakage: { mode: 'limitedUses', maxUses: 9 } }]);
  assert.ok(mixed.record.breakage, 'breakage is authored by both');
  assert.equal('onBreak' in mixed.record, false);
  assert.deepEqual(mixed.refusedSections, ['onBreak']);
});

test('CONSTRAINT 0 does NOT apply to the three sections that cannot fall back', async () => {
  // `effectSource` and `macro` are written UNCONDITIONALLY by the membership builder, and both
  // CAN express emptiness, so nothing falls back to them. `repairRequirements` is not a resolver
  // section at all. Applying constraint 0 to them would lose the ruling's value for no safety.
  const { electWorldDefault } = await import('../src/migration/worldScopeDefaults.js');
  const elected = electWorldDefault({
    entityType: 'essences',
    entityId: 'fire',
    donorRecord: { id: 'fire', sourceComponentId: 'Item.abc', propertyMacroUuid: 'Macro.a' },
    // The second member authored NEITHER, and both are still elected.
    memberRecords: [
      { id: 'fire', sourceComponentId: 'Item.abc', propertyMacroUuid: 'Macro.a' },
      { id: 'fire' },
    ],
    worldComponentIds: new Set(),
    isMemberOf: () => true,
    memberSystemIds: ['sys-a', 'sys-b'],
  });
  assert.deepEqual(elected.record.effectSource, { sourceComponentId: 'Item.abc' });
  assert.equal(elected.record.macro, 'Macro.a');
  assert.deepEqual(elected.refusedSections, []);
});

test('CONSTRAINT 2 and 3: a non-world-addressable reference declines its section', async () => {
  const { electWorldDefault } = await import('../src/migration/worldScopeDefaults.js');
  const worldComponentIds = new Set(['world-c']);
  const essence = (sourceComponentId) =>
    electWorldDefault({
      entityType: 'essences',
      entityId: 'fire',
      donorRecord: { id: 'fire', sourceComponentId, propertyMacroUuid: 'Macro.a' },
      worldComponentIds,
      isMemberOf: () => true,
      memberSystemIds: ['sys-a'],
    });
  assert.deepEqual(essence('world-c').record.effectSource, { sourceComponentId: 'world-c' });
  const declined = essence('local-only');
  assert.equal('effectSource' in declined.record, false, 'the section is declined');
  assert.equal(declined.record.macro, 'Macro.a', 'and its sibling still lifts');
  assert.deepEqual(declined.refusedSections, ['effectSource']);
  // A document UUID is globally addressable and always lifts.
  assert.ok(essence('Item.abc').record.effectSource);

  const tool = (componentId) =>
    electWorldDefault({
      entityType: 'tools',
      entityId: 't1',
      donorRecord: {
        id: 't1',
        breakage: { mode: 'limitedUses', maxUses: 3 },
        onBreak: { mode: 'replaceWith', replacementTarget: { type: 'component', componentId } },
      },
      worldComponentIds,
      isMemberOf: () => true,
      memberSystemIds: ['sys-a'],
    });
  assert.ok(tool('world-c').record.onBreak);
  assert.equal('onBreak' in tool('local-only').record, false);
  assert.deepEqual(tool('local-only').refusedSections, ['onBreak']);
  assert.ok(tool('local-only').record.breakage, 'breakage carries no references and always lifts');
});

test('CONSTRAINT 4: repairRequirements lifts only when every group system is a MEMBER', async () => {
  const { electWorldDefault } = await import('../src/migration/worldScopeDefaults.js');
  // `breakage` and `onBreak` are authored so CONSTRAINT 0 does not fire and this arm isolates
  // constraint 4; `repairRequirements` is exempt from constraint 0 in any case.
  const donorRecord = {
    id: 't1',
    breakage: { mode: 'limitedUses', maxUses: 1 },
    onBreak: { mode: 'destroy' },
    repairRequirements: [
      {
        id: 'rr',
        options: [
          {
            quantity: 1,
            match: { type: 'component', componentId: 'other-c' },
            // Z4: the ONLY reference to `world-c` lives in an ALTERNATIVE, so an unguarded
            // `alternatives` recursion in the constraint would miss it and lift a seed naming a
            // component the group cannot address.
            alternatives: [{ quantity: 1, match: { type: 'component', componentId: 'world-c' } }],
          },
        ],
      },
    ],
  };
  const elect = (worldIds, isMemberOf, memberSystemIds) =>
    electWorldDefault({
      entityType: 'tools',
      entityId: 't1',
      donorRecord,
      worldComponentIds: new Set(worldIds),
      isMemberOf,
      memberSystemIds,
    });

  assert.ok(
    elect(['world-c', 'other-c'], () => true, ['sys-a', 'sys-b']).record.repairRequirements,
    'every group system is a member, so the seed can never dangle'
  );
  // Z4, stated as its own arm: the ALTERNATIVE's reference alone decides the refusal.
  const alternativeOnly = elect(['other-c'], () => true, ['sys-a']);
  assert.equal(
    'repairRequirements' in (alternativeOnly.record ?? {}),
    false,
    'a component reachable only through `options[].alternatives[]` still binds constraint 4'
  );
  assert.deepEqual(alternativeOnly.refusedSections, ['repairRequirements']);
  // A component the SECOND system is not a member of: the seed would dangle there.
  const partial = elect(['world-c', 'other-c'], (componentId, systemId) => systemId === 'sys-a', [
    'sys-a',
    'sys-b',
  ]);
  // The OTHER sections still elect; only `repairRequirements` is declined, which is what makes
  // the refusal per SECTION rather than per entity.
  assert.equal('repairRequirements' in partial.record, false);
  assert.ok(partial.record.breakage);
  assert.deepEqual(partial.refusedSections, ['repairRequirements']);
  // A component that is not a world component at all.
  const local = elect([], () => true, ['sys-a']);
  assert.equal('repairRequirements' in local.record, false);
  assert.deepEqual(local.refusedSections, ['repairRequirements']);
  // A SINGLE-member group always satisfies it, which is why the rule is not restrictive.
  assert.ok(elect(['world-c', 'other-c'], () => true, ['sys-a']).record.repairRequirements);
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
