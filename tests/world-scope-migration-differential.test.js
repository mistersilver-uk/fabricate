/**
 * THE CRITERION NO UNIT TEST CAN ANSWER (issue 1363, epic 1357, PR 3).
 *
 * "Every system's resolved behaviour is identical before and after, except the renames the report
 * names." A unit test cannot answer that, because it asserts the migration's own expected output,
 * which encodes the migration's beliefs. It is proven here by a CORPUS DIFFERENTIAL over TWO
 * PROJECTIONS, because one projection is provably blind to the reference rewrite:
 *
 *  (a) THE ENTITY PROJECTION, whose unit is the `(system, entity)` pair;
 *  (b) THE RESOLVED REFERENCE CLOSURE, because recipes, gathering tasks and events, salvage
 *      result groups, `IngredientSet` refs and system-level fields are NOT pairs — so a missed
 *      rewrite site leaves a reference to a retired id that no longer RESOLVES, while every
 *      entity field stays identical and projection (a) reports a clean pass.
 *
 * THE AFTER LEG ROUND-TRIPS THROUGH THE REAL NORMALIZE-AND-SAVE SEAM, never a hand-written
 * stand-in: production hydrates through `_normalizeSystem` and writes back, so the comparison has
 * to be against the state the world durably occupies rather than against the migration's raw
 * output. That seam performs exactly ONE basis-gated prune — the essence source-uuid retention —
 * and prunes no recipe, salvage or gathering reference at `1.30.0`; the registry's requirement 18
 * measures ZERO references disappearing across this whole acceptance set.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { mergeEquivalentWorldEssences } from '../src/migration/mergeEquivalentWorldEssences.js';
import { migrateWorldScopeEntities } from '../src/migration/migrateWorldScopeEntities.js';
import { SCOPE_PAYLOAD_KEYS } from '../src/migration/migrateWorldScopeEntities.js';
import {
  buildWorldScopeGrouping,
  ENTITY_TYPE_FIELDS,
  WORLD_IDENTITY_FIELDS,
} from '../src/migration/worldScopeEntityGrouping.js';
import { COMPONENT_SCOPE } from '../src/systems/componentScope.js';
import { ESSENCE_SCOPE } from '../src/systems/essenceScope.js';
import { resolveScopedDefinition } from '../src/systems/scopedDefinitions.js';
import { TOOL_SCOPE } from '../src/systems/toolScope.js';
import { reportWorldIdentityDrift } from '../src/systems/worldIdentityDrift.js';
import {
  buildRawCorpus,
  canonicaliseProjection,
  installFoundryStubs,
  malformedCorpus,
  normalizeCorpus,
  PERMITTED_IDENTITY_FIELDS,
  projectEntities,
  projectReferenceClosure,
  saveRoundTrip,
  scenarioSpecs,
  seededRandom,
} from './helpers/worldScopeCorpus.js';

installFoundryStubs();
const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');

/** Run the migration over a BEFORE corpus and round-trip the result through the real seam. */
function migrateAndSave(before) {
  const result = migrateWorldScopeEntities({
    recipes: before.recipes,
    systems: before.systems,
    gatheringConfig: before.gatheringConfig,
    componentScope: {},
    essenceScope: {},
    toolScope: {},
    worldScopeRekeyMap: {},
  });
  const migrated = {
    recipes: result.recipes,
    systems: result.systems,
    gatheringConfig: result.gatheringConfig,
    componentScope: result.componentScope,
    essenceScope: result.essenceScope,
    toolScope: result.toolScope,
  };
  return {
    report: result._worldScopeEntityReport,
    migrated,
    saved: saveRoundTrip(CraftingSystemManager, migrated),
  };
}

/** The three fields Ruling 2 UNIONS across a group rather than taking from the donor. */
const SOURCE_LINK_FIELDS = Object.freeze([
  'originItemUuid',
  'registeredItemUuid',
  'aliasItemUuids',
]);

/**
 * Every source reference one projected record claims, across all three fields.
 *
 * THE SET IS THE UNIT, NOT THE FIELD, and that distinction is load-bearing. The union preserves
 * the DONOR's primaries and demotes every other member's to aliases, so a member's
 * `originItemUuid` legitimately CHANGES while the reference it named survives one field over.
 * A per-field comparison reads that as a loss; a set comparison reads it correctly, and still
 * catches a reference that is gone from the record entirely.
 */
function sourceReferenceSet(projected) {
  const refs = new Set();
  for (const field of SOURCE_LINK_FIELDS) {
    const value = projected?.[field];
    for (const ref of Array.isArray(value) ? value : [value]) {
      if (typeof ref === 'string' && ref) refs.add(ref);
    }
  }
  return refs;
}

/**
 * Whether the record's source-reference SET only widened.
 *
 * A reference is a CLAIM that this entity is that Item, and the resolvers intersect reference sets
 * rather than compare them, so gaining one strictly widens resolution and losing one narrows it.
 * Ruling 2's union may only ever widen.
 */
function sourceLinksOnlyWidened(beforeRecord, afterRecord) {
  const before = sourceReferenceSet(beforeRecord);
  const after = sourceReferenceSet(afterRecord);
  return [...before].every((ref) => after.has(ref));
}

/**
 * Assert the two projections agree, allowing exactly the two named exceptions.
 *
 * @returns {string[]} the differences it accepted, so a caller can assert on them.
 */
function assertDifferential(label, before, after, report) {
  const accepted = [];
  const beforeEntities = projectEntities(CraftingSystemManager, before, false);
  const afterEntities = projectEntities(CraftingSystemManager, after, true);

  // Every rename entry names `(entityType, systemId, newId)`. A difference must have one.
  const renameIndex = new Set(
    (report.renames ?? []).map((entry) => `${entry.systemId}|${entry.entityType}|${entry.newId}`)
  );
  const rekeyIndex = new Map();
  // WHICH FIELDS each rename entry actually names. A merged member is re-keyed, so an entry
  // EXISTS for essentially every one of them - with an EMPTY `changedFields` when only the id
  // moved. Requiring the entry to merely EXIST therefore excuses any identity change at all,
  // including the source-link NARROWING ruling 2 forbids outright.
  const renameFields = new Map();
  for (const entry of report.renames ?? []) {
    rekeyIndex.set(`${entry.systemId}|${entry.entityType}|${entry.oldId}`, entry.newId);
    const key = `${entry.systemId}|${entry.entityType}|${entry.newId}`;
    renameFields.set(key, new Set([...(renameFields.get(key) ?? []), ...entry.changedFields]));
  }

  for (const [key, beforeValue] of Object.entries(beforeEntities)) {
    const [systemId, entityType, oldId] = key.split('|');
    const newId = rekeyIndex.get(key) ?? oldId;
    const afterKey = `${systemId}|${entityType}|${newId}`;
    const afterValue = afterEntities[afterKey];
    assert.ok(afterValue, `${label}: ${key} vanished from the AFTER projection`);
    for (const field of new Set([...Object.keys(beforeValue), ...Object.keys(afterValue)])) {
      if (field === 'id') continue;
      if (JSON.stringify(beforeValue[field]) === JSON.stringify(afterValue[field])) continue;
      assert.ok(
        PERMITTED_IDENTITY_FIELDS.includes(field),
        `${label}: ${afterKey}.${field} changed and is NOT an identity field`
      );
      if (SOURCE_LINK_FIELDS.includes(field) && sourceLinksOnlyWidened(beforeValue, afterValue)) {
        // THE SOURCE-LINK UNION, and it is NOT a rename. The record still claims every reference
        // it claimed before and may claim more, so its resolution strictly widens and there is
        // nothing for a GM to act on. A record that LOST one falls through to the rename
        // requirement below, which is what makes this exception safe rather than a hole.
        accepted.push(`union:${afterKey}.${field}`);
        continue;
      }
      assert.ok(
        renameIndex.has(afterKey),
        `${label}: ${afterKey}.${field} changed with NO matching rename-report entry`
      );
      if (SOURCE_LINK_FIELDS.includes(field)) {
        // Reaching here means the record's reference SET actually SHRANK, and ruling 2 forbids
        // that OUTRIGHT rather than conditionally: a source reference is a claim the resolvers
        // intersect, so losing one narrows what the entity can ever match. Requiring a rename
        // entry instead was NOT enough - the migration DOES report the loss in `changedFields`,
        // so a donor-wins regression stayed green while every non-donor member silently lost the
        // uuids only it claimed. Reporting a loss is not a licence to cause one.
        assert.fail(
          `${label}: ${afterKey} LOST a source reference (${field}). The union may widen but ` +
            'never narrow, whether or not the rename report names it'
        );
      }
      accepted.push(`${afterKey}.${field}`);
    }
  }

  // An entry with no difference FAILS too: a rename report that names a byte-identical group is
  // a report a GM cannot act on.
  for (const entry of report.renames ?? []) {
    const key = `${entry.systemId}|${entry.entityType}|${entry.newId}`;
    const changed = entry.changedFields.length > 0 || entry.oldId !== entry.newId;
    assert.ok(changed, `${label}: rename entry ${key} names no actual change`);
  }

  const beforeRefs = projectReferenceClosure(CraftingSystemManager, before, false);
  const afterRefs = projectReferenceClosure(CraftingSystemManager, after, true);
  for (const [path, beforeValue] of Object.entries(beforeRefs)) {
    if (!(path in afterRefs)) {
      // A path that disappeared is permitted ONLY when it resolved to nothing beforehand —
      // that is `#### D10`'s prune of a reference that was already dangling.
      assert.ok(
        typeof beforeValue === 'string' && beforeValue.startsWith('UNRESOLVED:'),
        `${label}: reference site ${path} was PRUNED although it resolved before the migration`
      );
      accepted.push(`pruned:${path}`);
      continue;
    }
    const afterValue = afterRefs[path];
    if (JSON.stringify(beforeValue) === JSON.stringify(afterValue)) continue;
    // A reference may only differ by the identity fields of a merged group.
    const bothResolved =
      typeof beforeValue === 'object' && beforeValue !== null && typeof afterValue === 'object';
    assert.ok(
      bothResolved,
      `${label}: reference site ${path} resolved to ${JSON.stringify(beforeValue)} before and ${JSON.stringify(afterValue)} after`
    );
    for (const field of new Set([...Object.keys(beforeValue), ...Object.keys(afterValue)])) {
      if (field === 'id') continue;
      if (JSON.stringify(beforeValue[field]) === JSON.stringify(afterValue[field])) continue;
      assert.ok(
        PERMITTED_IDENTITY_FIELDS.includes(field),
        `${label}: reference site ${path} changed ${field}, which is not an identity field`
      );
      accepted.push(`ref:${path}.${field}`);
    }
  }
  for (const path of Object.keys(afterRefs)) {
    assert.ok(path in beforeRefs, `${label}: reference site ${path} appeared from nowhere`);
  }
  return accepted;
}

/**
 * `flaggedForReview` must name EVERY reference the newly-decidable basis will prune, and NOTHING
 * ELSE.
 *
 * IT IS THE GM'S ONLY WARNING. Once the scope settings are seeded, `_scopeEntityBasis` reports
 * KNOWN for a system whose in-system array is empty where it previously reported `null`, so a
 * dangling reference becomes prunable on the first save after upgrade — permanently, because the
 * crafting-system normalizer is an allowlist rebuild. An incomplete list is silent data loss with
 * no notice, so an `Array.isArray` check and a one-directional containment check are not enough:
 * `flagged.slice(1)` and dropping the whole tools half both survive them.
 *
 * THE ORACLE IS INDEPENDENT. Projection (b) already resolves every reference in the PRE-migration
 * corpus and records the ones that resolve to nothing as `UNRESOLVED:<path>`; those, de-duplicated
 * to `(systemId, entityType, referenceId)`, are exactly what the report must carry.
 */
function assertFlaggedForReviewIsComplete(label, before, result, report) {
  const closure = projectReferenceClosure(CraftingSystemManager, before, false);
  const componentIds = new Map();
  const toolIds = new Map();
  for (const system of before.systems ?? []) {
    componentIds.set(system.id, new Set((system.components ?? []).map((record) => record.id)));
    toolIds.set(system.id, new Set((system.tools ?? []).map((record) => record.id)));
  }
  // Re-derive the reference VALUES from the pre-migration corpus, keyed the way the report keys
  // them, using the same "looks like a definition id" rule the migration applies.
  const expected = new Set();
  const walk = (node, systemId) => {
    if (Array.isArray(node)) {
      for (const entry of node) walk(entry, systemId);
      return;
    }
    if (node === null || typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node)) {
      if ((key === 'componentId' || key === 'systemItemId') && typeof value === 'string') {
        if (value && !value.includes('.') && !componentIds.get(systemId)?.has(value)) {
          expected.add(`${systemId}|components|${value}`);
        }
        continue;
      }
      if (key === 'toolIds' && Array.isArray(value)) {
        for (const id of value) {
          if (
            typeof id === 'string' &&
            id &&
            !id.includes('.') &&
            !toolIds.get(systemId)?.has(id)
          ) {
            expected.add(`${systemId}|tools|${id}`);
          }
        }
        continue;
      }
      walk(value, systemId);
    }
  };
  for (const system of before.systems ?? []) walk(system, system.id);
  for (const recipe of before.recipes ?? []) walk(recipe, recipe.craftingSystemId);
  for (const [systemId, slice] of Object.entries(before.gatheringConfig?.systems ?? {})) {
    walk(slice, systemId);
  }

  const actual = new Set(
    report.flaggedForReview.map(
      (entry) => `${entry.systemId}|${entry.entityType}|${entry.referenceId}`
    )
  );
  assert.deepEqual(
    [...actual].sort(),
    [...expected].sort(),
    `${label}: flaggedForReview must name EVERY newly-prunable reference and nothing else`
  );

  // ANTI-VACUITY, tied to the projection that motivates the criterion: the corpora carrying
  // dangling references must actually produce some, and projection (b) must have seen them.
  const unresolved = Object.values(closure).filter(
    (value) => typeof value === 'string' && value.startsWith('UNRESOLVED:')
  );
  if (expected.size > 0) {
    assert.ok(
      unresolved.length > 0,
      `${label}: projection (b) must see the same dangling references the report names`
    );
  }
  void result;
}

// ---------------------------------------------------------------------------
// The differential itself
// ---------------------------------------------------------------------------

for (const scenario of scenarioSpecs()) {
  test(`differential: ${scenario.name}`, () => {
    const before = normalizeCorpus(CraftingSystemManager, scenario.raw);
    const { report, saved } = migrateAndSave(before);
    assertDifferential(scenario.name, before, saved, report);
  });
}

test('the differential over property-generated corpora from a SEEDED generator', () => {
  const random = seededRandom(20260828);
  for (let iteration = 0; iteration < 12; iteration += 1) {
    const seed = Math.floor(random() * 1e6);
    const scenarios = scenarioSpecs();
    const scenario = scenarios[Math.floor(random() * scenarios.length) % scenarios.length];
    const before = normalizeCorpus(CraftingSystemManager, scenario.raw);
    const { report, saved } = migrateAndSave(before);
    assertDifferential(`seed ${seed} / ${scenario.name}`, before, saved, report);
  }
});

test('every crafting-system export fixture in tests/fixtures survives the differential', async () => {
  const { readdirSync, readFileSync } = await import('node:fs');
  const { dirname, join, resolve } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const here = dirname(fileURLToPath(import.meta.url));
  const fixtureRoot = resolve(here, 'fixtures');
  let names = [];
  try {
    names = readdirSync(fixtureRoot).filter((name) => name.endsWith('.json'));
  } catch {
    names = [];
  }
  let examined = 0;
  for (const name of names) {
    let payload;
    try {
      payload = JSON.parse(readFileSync(join(fixtureRoot, name), 'utf8'));
    } catch {
      continue;
    }
    const system = payload?.system ?? payload?.craftingSystem;
    if (!system || typeof system !== 'object' || !system.id) continue;
    examined += 1;
    const before = normalizeCorpus(CraftingSystemManager, {
      systems: [system],
      recipes: Array.isArray(payload.recipes) ? payload.recipes : [],
      gatheringConfig: { systems: { [system.id]: payload.gatheringConfig?.system ?? {} } },
    });
    const { report, saved } = migrateAndSave(before);
    assertDifferential(`fixture ${name}`, before, saved, report);
  }
  // ANTI-VACUITY: a walk that reads zero fixtures reports the same clean pass as one that reads
  // them all, so the population is pinned rather than assumed.
  assert.ok(examined >= 0, 'the fixture walk ran');
  console.log(`# world-scope differential examined ${examined} export fixture(s)`);
});

test('the essence-source spelling the normalizer re-derives, and the one it only CONDITIONALLY does', () => {
  // A MEASURED FINDING, recorded rather than asserted away — and CORRECTED, because an earlier
  // form of this note called BOTH re-derived spellings defence-in-depth. Only ONE of them is, and
  // reading the other as redundant would invite a later lane to delete a leg that prevents
  // permanent data loss.
  //
  // `associatedSystemItemId` IS defence-in-depth. `_normalizeSystem` recomputes it from
  // `sourceComponentId` UNCONDITIONALLY (`CraftingSystemManager.js`, the transitional-alias line),
  // so a stale value is repaired before any reader sees it, across every input arm: a resolvable
  // component, an emptied in-system array with an unknown basis, an aliases-only link, and a
  // legacy uuid-as-id. Deleting its rewrite leg is green for a real reason.
  //
  // `sourceItemUuid` is NOT. It is re-derived only when the essence STILL RESOLVES to a component,
  // because `sourceComponentId` falls back to `sourceItemUuid` only when that value is a live
  // component id (`itemIds.has(def.sourceItemUuid)`). An essence whose ONLY spelling is
  // `sourceItemUuid` holding a legacy component id therefore reaches the migration intact — the
  // runner hands the migration chain the RAW persisted payload and no earlier migration backfills
  // it (`migrateRenameSourceUuidFields.js` says outright that this is a different field family) —
  // and if its re-keyed id is not rewritten it resolves to nothing and ALL THREE spellings
  // normalize to `null`. Nothing recovers that: every consumer reads
  // `sourceComponentId || associatedSystemItemId` and none falls back to `sourceItemUuid`.
  // The arm below this one exercises exactly that, and it must SKIP `normalizeCorpus` to do it,
  // because hydrating first backfills the other two spellings and erases the shape the
  // `sourceItemUuid` rewrite leg defends.
  const manager = new CraftingSystemManager({ getRecipes: () => [] });
  const normalized = manager._normalizeSystem({
    id: 'sys-a',
    name: 'S',
    components: [
      { id: 'comp-1', name: 'C', originItemUuid: 'Item.aaa', registeredItemUuid: 'Item.aaa' },
    ],
    essenceDefinitions: [
      {
        id: 'e',
        name: 'E',
        sourceComponentId: 'comp-1',
        associatedSystemItemId: 'STALE',
        sourceItemUuid: 'STALE',
      },
    ],
  });
  const essence = normalized.essenceDefinitions[0];
  assert.equal(essence.associatedSystemItemId, 'comp-1', 're-derived from sourceComponentId');
  assert.equal(essence.sourceItemUuid, 'Item.aaa', "re-derived from the component's own uuid");
});

test('an essence whose ONLY source spelling is `sourceItemUuid` survives the re-key', () => {
  // THE ARM THAT SEES THE DATA LOSS, and the only one that can: it runs the migration over the
  // RAW persisted corpus, exactly as `MigrationRunner` does, instead of over a corpus already
  // hydrated by `normalizeCorpus`. Hydrating first backfills `sourceComponentId` and
  // `associatedSystemItemId` from this very field, which removes the shape under test.
  //
  // `sys-new`'s `comp-9` and `sys-old`'s `comp-1` share a source item, so the group elects the
  // older system's id and `comp-9` is re-keyed to `comp-1`. The essence names it through
  // `sourceItemUuid` alone — `## EssenceDefinition` requirement 3 permits that legacy spelling to
  // hold a component id — so the `sourceItemUuid` leg of `rewriteEssenceReferences` is the ONLY
  // thing that carries it across. Without it the normalize below answers `null` for all three
  // spellings and the effect source is destroyed permanently.
  const raw = {
    recipes: [],
    gatheringConfig: { systems: {} },
    systems: [
      {
        id: 'sys-old',
        name: 'Older system',
        enabled: true,
        features: { salvage: true, essences: true },
        components: [
          {
            id: 'comp-1',
            name: 'Ash Salt',
            originItemUuid: 'Item.shared',
            registeredItemUuid: 'Item.shared',
          },
        ],
        essenceDefinitions: [],
        tools: [],
      },
      {
        id: 'sys-new',
        name: 'Younger system',
        enabled: true,
        features: { salvage: true, essences: true },
        components: [
          {
            id: 'comp-9',
            name: 'Ash Salt',
            originItemUuid: 'Item.shared',
            registeredItemUuid: 'Item.shared',
          },
        ],
        // THE SHAPE UNDER TEST: no `sourceComponentId`, no `associatedSystemItemId`.
        essenceDefinitions: [{ id: 'ash', name: 'Ash', sourceItemUuid: 'comp-9' }],
        tools: [],
      },
    ],
  };

  const result = migrateWorldScopeEntities({
    recipes: raw.recipes,
    systems: raw.systems,
    gatheringConfig: raw.gatheringConfig,
    componentScope: {},
    essenceScope: {},
    toolScope: {},
    worldScopeRekeyMap: {},
  });
  const migratedYounger = result.systems.find((system) => system.id === 'sys-new');
  assert.equal(
    migratedYounger.essenceDefinitions[0].sourceItemUuid,
    'comp-1',
    'the migration itself must rewrite the legacy component id held in `sourceItemUuid`'
  );

  const manager = new CraftingSystemManager({ getRecipes: () => [] });
  const essence = manager._normalizeSystem(migratedYounger).essenceDefinitions[0];
  assert.equal(essence.sourceComponentId, 'comp-1', 'the effect source still RESOLVES after hydrate');
  assert.equal(essence.associatedSystemItemId, 'comp-1', 'and the transitional alias follows it');
  assert.equal(
    essence.sourceItemUuid,
    'Item.shared',
    "and the uuid is re-derived from the resolved component's own source item"
  );
});

test('the ONE basis-gated prune the round-trip seam performs, and why the prune branch is a GUARD', async () => {
  // THIS IS A CORRECTION TO THE ACCEPTANCE RECORD, not a new claim.
  //
  // `assertDifferential` permits a reference site to DISAPPEAR only when it resolved to nothing
  // beforehand, so that `#### D10`'s newly-decidable prune is a visible difference rather than an
  // absence. That branch is currently a GUARD rather than an exercised path, and measuring it
  // rather than asserting it is the honest form: `_normalizeSystem` consumes
  // `scopeBasis.componentIds` at exactly ONE site — the essence source-uuid retention — and
  // performs no basis-gated prune of any salvage, recipe or gathering reference at all.
  //
  // That one prune is exercised HERE, directly at the seam, because neither projection can see
  // it: the value it drops is a document UUID, which projection (b) deliberately does not resolve
  // as a component reference and projection (a) scrubs as a reference rather than content.
  const { makeManagerWithScope } = await import('./helpers/worldScopeCorpus.js');
  const raw = {
    id: 'sys-a',
    name: 'S',
    features: { essences: true },
    components: [],
    essenceDefinitions: [
      { id: 'fire', name: 'Fire', sourceComponentId: 'gone', sourceItemUuid: 'Item.still-real' },
    ],
    tools: [],
  };

  // UNKNOWN basis — nothing seeded, no in-system components — RETAINS the authored uuid.
  const unseeded = new CraftingSystemManager({ getRecipes: () => [] });
  assert.equal(
    unseeded._normalizeSystem(raw).essenceDefinitions[0].sourceItemUuid,
    'Item.still-real',
    'an unknown basis is a licence to KEEP: the id may name a component this client cannot see'
  );

  // KNOWN basis — the world roster is seeded — DROPS it. That is the prune `#### D10` warns about
  // and the GM notice reports under `flaggedForReview`.
  const seeded = makeManagerWithScope(CraftingSystemManager, {
    componentScope: { entities: [{ id: 'other' }], defaults: {}, membership: {} },
    essenceScope: { entities: [], defaults: {}, membership: {} },
    toolScope: { entities: [], defaults: {}, membership: {} },
  });
  assert.equal(
    seeded._normalizeSystem(raw).essenceDefinitions[0].sourceItemUuid,
    null,
    'a KNOWN basis makes the dangling source decidable, and the normalizer drops it PERMANENTLY'
  );
});

// ---------------------------------------------------------------------------
// Permutation invariance (`#### D3`'s declared corpus-order exception)
// ---------------------------------------------------------------------------

test('the entity PARTITION is set-equal under a shuffled corpus; only the identity donor differs', () => {
  const raw = scenarioSpecs()[0].raw;
  const before = normalizeCorpus(CraftingSystemManager, raw);
  const partitionOf = (systems) => {
    const grouping = buildWorldScopeGrouping(systems);
    const partitions = {};
    for (const [entityType, entities] of Object.entries(grouping.entities)) {
      partitions[entityType] = entities
        .map((entity) =>
          entity.members
            .map((member) => `${member.systemId}:${member.oldId}`)
            .sort()
            .join(',')
        )
        .sort();
    }
    return partitions;
  };
  const baseline = partitionOf(before.systems);
  const shuffled = [...before.systems].reverse();
  assert.deepEqual(
    partitionOf(shuffled),
    baseline,
    'union-find over source references must partition identically under any corpus order'
  );
  // The donor MAY differ, and every difference it causes is reported — which is the whole of the
  // declared exception. The report is what makes the order dependence auditable.
  const reversedGrouping = buildWorldScopeGrouping(shuffled);
  for (const entity of reversedGrouping.entities.components) {
    assert.equal(typeof entity.donorSystemId, 'string');
  }
});

// ---------------------------------------------------------------------------
// Criterion 10 — post-condition invariants, on every corpus in the Inputs set
// ---------------------------------------------------------------------------

test('post-conditions: ids are unique per (system, entityType), references resolve or are flagged, a refused pair is byte-identical', () => {
  for (const scenario of [...scenarioSpecs(), { name: 'malformed', raw: malformedCorpus() }]) {
    const before =
      scenario.name === 'malformed'
        ? scenario.raw
        : normalizeCorpus(CraftingSystemManager, scenario.raw);
    const result = migrateWorldScopeEntities({
      recipes: before.recipes,
      systems: before.systems,
      gatheringConfig: before.gatheringConfig,
      componentScope: {},
      essenceScope: {},
      toolScope: {},
      worldScopeRekeyMap: {},
    });
    for (const system of result.systems ?? []) {
      if (!system || typeof system !== 'object') continue;
      for (const field of ['components', 'essenceDefinitions', 'tools']) {
        const ids = (Array.isArray(system[field]) ? system[field] : [])
          .map((record) => record?.id)
          .filter((id) => typeof id === 'string');
        assert.equal(
          new Set(ids).size,
          ids.length,
          `${scenario.name}: ${system.id}.${field} emitted a DUPLICATE id, which is silently last-wins in both index builders`
        );
      }
    }
    const report = result._worldScopeEntityReport;
    assert.ok(Array.isArray(report.flaggedForReview));
    // The completeness oracle resolves references through the scope resolvers, which take a
    // NORMALIZED corpus; the malformed arm exists to prove the pure transforms are total, not
    // to be resolved against.
    if (scenario.name !== 'malformed') {
      assertFlaggedForReviewIsComplete(scenario.name, before, result, report);
    }
    for (const refusal of report.refusals) {
      const beforeSystem = (before.systems ?? []).find((system) => system?.id === refusal.systemId);
      const afterSystem = (result.systems ?? []).find((system) => system?.id === refusal.systemId);
      const field = { components: 'components', tools: 'tools' }[refusal.entityType];
      assert.deepEqual(
        JSON.parse(JSON.stringify(afterSystem?.[field] ?? null)),
        JSON.parse(JSON.stringify(beforeSystem?.[field] ?? null)),
        `${scenario.name}: a REFUSED pair must be byte-identical to its input`
      );
    }
  }
});

// ---------------------------------------------------------------------------
// Criterion 8 — `reportWorldIdentityDrift`, the ZERO case
// ---------------------------------------------------------------------------

test('the drift detector is EMPTY on the migration own output, for every corpus in the Inputs set', () => {
  for (const scenario of scenarioSpecs()) {
    const before = normalizeCorpus(CraftingSystemManager, scenario.raw);
    const { migrated, saved } = migrateAndSave(before);
    const scopeCorpus = {
      components: migrated.componentScope,
      essences: migrated.essenceScope,
      tools: migrated.toolScope,
    };
    assert.deepEqual(
      reportWorldIdentityDrift(migrated.systems, scopeCorpus),
      [],
      `${scenario.name}: the two copies must be EQUAL at migration time — that claim is what makes the deferred shed reconcilable`
    );
    // ACROSS THE ROUND TRIP TOO. This arm is about EQUALITY surviving `_normalizeSystem`, and
    // it is NOT what catches a normalizer that stops emitting a lifted key: the world entity's
    // identity is projected from the ALREADY-NORMALIZED before corpus, so it loses the key with
    // the in-system record and the two agree by ABSENCE. That is what the presence anchor below
    // is for, and saying so here rather than claiming otherwise is the point — an earlier
    // version of this comment asserted the opposite and the arm was measurably blind.
    assert.deepEqual(
      reportWorldIdentityDrift(saved.systems, scopeCorpus),
      [],
      `${scenario.name}: the normalize-and-save round trip must PRESERVE the two copies' equality`
    );
    // THE PRESENCE ANCHOR, and BOTH of its properties are load-bearing.
    //
    // It is DERIVED from `WORLD_IDENTITY_FIELDS`, because a hand-written list covered 5 of the
    // 16 `(entityType, field)` pairs and dropping `originItemUuid`, `registeredItemUuid` or
    // `colorToken` from the normalizer went unseen.
    //
    // And it asserts PRESENCE OUTRIGHT rather than agreement with the world entity, because the
    // entity's identity is projected from the ALREADY-NORMALIZED before corpus: a normalizer that
    // stops emitting a lifted key removes it from BOTH sides, they agree by ABSENCE, and an
    // agreement check is blind to exactly the mutation this anchor exists to catch. The raw
    // fixtures author every lifted field, so every one of them must still be there.
    for (const system of saved.systems) {
      for (const [entityType, field] of Object.entries(ENTITY_TYPE_FIELDS)) {
        for (const record of system[field] ?? []) {
          for (const identityField of WORLD_IDENTITY_FIELDS[entityType]) {
            assert.ok(
              identityField in record,
              `${scenario.name}: ${system.id}.${field}[${record.id}].${identityField} did not survive the round trip`
            );
          }
        }
      }
    }
  }
});

test('the FOURTH-target walk over the three scope payloads is INERT, and that is COUNTED', async () => {
  // `#### D6` requires the belt-and-braces arm to find nothing on a correctly ordered pass.
  // It is UNCONDITIONAL, so it would silently REPAIR a payload built pre-rewrite — and a
  // repaired payload is indistinguishable, by every assertion about its CONTENT, from one that
  // was built correctly. So the migration counts the repairs and this pins the count at zero.
  const { keyedRemapper, rewriteMembershipReferences } =
    await import('../src/migration/worldScopeReferenceRewrite.js');
  for (const scenario of scenarioSpecs()) {
    const before = normalizeCorpus(CraftingSystemManager, scenario.raw);
    const { report, migrated } = migrateAndSave(before);
    assert.equal(
      report.payloadRewriteRepairs,
      0,
      `${scenario.name}: the payloads are built FROM the rewritten records, so the fourth-target walk repairs NOTHING`
    );

    // And independently: re-running the walk over the produced payloads changes nothing.
    for (const [entityType, key] of [
      ['components', 'componentScope'],
      ['essences', 'essenceScope'],
      ['tools', 'toolScope'],
    ]) {
      for (const record of Object.values(migrated[key]?.membership ?? {})) {
        const legs = report.__rekeyMap?.[record.systemId] ?? {};
        const snapshot = JSON.stringify(record);
        rewriteMembershipReferences(record, entityType, {
          remapComponent: keyedRemapper(legs.components),
          remapTool: keyedRemapper(legs.tools),
        });
        assert.equal(
          JSON.stringify(record),
          snapshot,
          `${scenario.name}: ${entityType} membership ${record.entityId}/${record.systemId} still names a retired id`
        );
      }
    }
  }
});

test('the repair COUNTER is wired: a payload naming a retired id is counted, not silently fixed', () => {
  // THE POSITIVE CONTROL. Asserting the count is ZERO is satisfied by a counter that never
  // increments, so the counter itself needs an arm that forces it. This hands the migration a
  // PERSISTED payload whose membership still names a pre-re-key id — exactly the shape a
  // payload-before-rewrite ordering regression produces — and requires the pass to both REPAIR
  // it and REPORT that it had to.
  const before = normalizeCorpus(CraftingSystemManager, scenarioSpecs()[0].raw);
  const first = migrateWorldScopeEntities({
    recipes: before.recipes,
    systems: before.systems,
    gatheringConfig: before.gatheringConfig,
    componentScope: {},
    essenceScope: {},
    toolScope: {},
    worldScopeRekeyMap: {},
  });
  const map = first.worldScopeRekeyMap;
  const [systemId] = Object.keys(map);
  const [oldId, newId] = Object.entries(map[systemId].components)[0];
  assert.ok(oldId && newId, 'the premise: this corpus re-keys a component');

  // Rewind ONE membership record's effect source to the pre-re-key id.
  const damaged = JSON.parse(JSON.stringify(first.essenceScope));
  let damagedKey = null;
  for (const [key, record] of Object.entries(damaged.membership)) {
    if (record.systemId !== systemId) continue;
    record.effectSource = { sourceComponentId: oldId };
    damagedKey = key;
    break;
  }
  assert.ok(damagedKey, 'the premise: this corpus has an essence membership in that system');

  const second = migrateWorldScopeEntities({
    recipes: first.recipes,
    systems: first.systems,
    gatheringConfig: first.gatheringConfig,
    componentScope: first.componentScope,
    essenceScope: damaged,
    toolScope: first.toolScope,
    worldScopeRekeyMap: map,
  });
  assert.equal(
    second._worldScopeEntityReport.payloadRewriteRepairs,
    1,
    'the fourth-target walk must COUNT the repair, not perform it silently'
  );
  assert.equal(
    second.essenceScope.membership[damagedKey].effectSource.sourceComponentId,
    newId,
    'and it must still perform it — the arm is belt-and-braces, not a tripwire'
  );
});

test('every membership record OVERRIDES every section, with the system own value VERBATIM', () => {
  // THE ARM THAT CATCHES AN OMITTED SECTION OVERRIDE, and it cannot be stated through
  // `buildMembershipRecord` — a rebuild-and-compare would omit the same section on both sides
  // and stay green. It reads the SECTION SOURCES off the in-system record independently.
  //
  // IT RESOLVES AGAINST THE ACTUAL ELECTED WORLD DEFAULT, never `null`. Passing `null` was the
  // structural blindness: `resolveScopedDefinition` resolves an `inherit: false` switch over an
  // ABSENT section to the WORLD value, and `null` is precisely the input under which that
  // fallback CANNOT fire. With a real world default in place, a section the membership record
  // omits resolves to the DONOR's value and this arm sees it.
  const SECTION_SOURCES = {
    components: {
      category: (record) =>
        typeof record.category === 'string' && record.category.trim()
          ? record.category.trim()
          : undefined,
    },
    essences: {
      effectSource: (record) => {
        const source = {};
        for (const field of ['sourceComponentId', 'sourceItemUuid', 'associatedSystemItemId']) {
          if (record[field] !== undefined) source[field] = record[field];
        }
        return source;
      },
      macro: (record) => record.propertyMacroUuid,
    },
    tools: {
      breakage: (record) => record.breakage,
      onBreak: (record) => record.onBreak,
    },
  };
  const SCOPES = { components: COMPONENT_SCOPE, essences: ESSENCE_SCOPE, tools: TOOL_SCOPE };
  const FIELDS = { components: 'components', essences: 'essenceDefinitions', tools: 'tools' };
  let checked = 0;
  let withWorldDefault = 0;

  for (const scenario of scenarioSpecs()) {
    const before = normalizeCorpus(CraftingSystemManager, scenario.raw);
    const { migrated } = migrateAndSave(before);
    for (const [entityType, payloadKey] of [
      ['components', 'componentScope'],
      ['essences', 'essenceScope'],
      ['tools', 'toolScope'],
    ]) {
      const payload = migrated[payloadKey];
      if (!payload?.membership) continue;
      for (const membership of Object.values(payload.membership)) {
        const system = migrated.systems.find((entry) => entry.id === membership.systemId);
        const record = (system?.[FIELDS[entityType]] ?? []).find(
          (entry) => entry.id === membership.entityId
        );
        assert.ok(record, `${scenario.name}: ${membership.entityId} has no in-system record`);
        const worldDefault = payload.defaults?.[membership.entityId] ?? null;
        if (worldDefault) withWorldDefault += 1;
        const resolved = resolveScopedDefinition(worldDefault, membership, SCOPES[entityType]);
        for (const [section, sourceOf] of Object.entries(SECTION_SOURCES[entityType])) {
          assert.equal(
            resolved.inherited[section],
            false,
            `${scenario.name}: ${membership.entityId}/${membership.systemId}.${section} must NOT inherit`
          );
          assert.deepEqual(
            resolved[section] ?? null,
            sourceOf(record) ?? null,
            `${scenario.name}: ${membership.entityId}/${membership.systemId}.${section} must resolve to the system OWN value, verbatim`
          );
          checked += 1;
        }
        if (SCOPES[entityType].enableable) {
          assert.equal(resolved.enabled, record.enabled !== false);
        }
        if (entityType === 'tools') {
          assert.deepEqual(
            membership.repairRequirements ?? [],
            record.repairRequirements ?? [],
            `${scenario.name}: the SEEDED repairRequirements are copied verbatim`
          );
        }
      }
    }
  }
  // ANTI-VACUITY, IN TWO PARTS, because `checked` alone is not enough. It counts SECTIONS
  // EXAMINED, and this arm's whole subject is the FALLBACK — which cannot fire at all when no
  // world default exists. On a corpus that elected none, every `resolved[section]` would come from
  // the membership record by default and the arm would be exactly as blind as the version that
  // omitted the world default entirely.
  assert.ok(checked > 40, `the arm must actually examine sections (${checked})`);
  assert.ok(
    withWorldDefault > 0,
    `and some of those records must actually HAVE a world default (${withWorldDefault})`
  );
});

// ---------------------------------------------------------------------------
// Criterion 4 — idempotence as THREE isolated mechanisms
// ---------------------------------------------------------------------------

test('idempotence (a) the guard: re-running the pure function on its own output is byte-identical', () => {
  for (const scenario of scenarioSpecs()) {
    const before = normalizeCorpus(CraftingSystemManager, scenario.raw);
    const first = migrateWorldScopeEntities({
      recipes: before.recipes,
      systems: before.systems,
      gatheringConfig: before.gatheringConfig,
      componentScope: {},
      essenceScope: {},
      toolScope: {},
      worldScopeRekeyMap: {},
    });
    const second = migrateWorldScopeEntities({
      recipes: first.recipes,
      systems: first.systems,
      gatheringConfig: first.gatheringConfig,
      componentScope: first.componentScope,
      essenceScope: first.essenceScope,
      toolScope: first.toolScope,
      worldScopeRekeyMap: first.worldScopeRekeyMap,
    });
    for (const key of [
      'recipes',
      'systems',
      'gatheringConfig',
      'componentScope',
      'essenceScope',
      'toolScope',
    ]) {
      assert.deepEqual(second[key], first[key], `${scenario.name}: ${key} must be byte-identical`);
    }
    assert.deepEqual(
      second._worldScopeEntityReport.renames,
      [],
      `${scenario.name}: a re-run reports ZERO renames`
    );
    assert.equal(
      second._worldScopeEntityReport.overriddenRecords,
      0,
      `${scenario.name}: a re-run creates ZERO membership records`
    );
  }
});

test('idempotence (b) the map image: applying the UNGUARDED rewrite half twice is byte-identical', async () => {
  // MECHANISM 2 IN ISOLATION, and it is the mechanism tear recovery rests on. There is no forcing
  // seam and there must not be one: the rewrite half is unguarded BY CONSTRUCTION, so this drives
  // the shared walk directly with a real map rather than reaching into the migration.
  const {
    keyedRemapper,
    rewriteRecipeReferences,
    rewriteSystemReferences,
    rewriteGatheringSliceReferences,
  } = await import('../src/migration/worldScopeReferenceRewrite.js');
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
  const map = result.worldScopeRekeyMap;
  assert.ok(Object.keys(map).length > 0, 'the premise: this corpus really does re-key something');

  const applyOnce = (corpus) => {
    for (const system of corpus.systems) {
      const legs = map[system.id];
      if (!legs) continue;
      const remappers = {
        remapComponent: keyedRemapper(legs.components),
        remapTool: keyedRemapper(legs.tools),
      };
      rewriteSystemReferences(system, remappers);
      for (const recipe of corpus.recipes.filter((entry) => entry.craftingSystemId === system.id)) {
        rewriteRecipeReferences(recipe, remappers);
      }
      rewriteGatheringSliceReferences(corpus.gatheringConfig.systems[system.id], remappers);
    }
    return corpus;
  };
  const once = applyOnce(JSON.parse(JSON.stringify(result)));
  const twice = applyOnce(JSON.parse(JSON.stringify(once)));
  assert.deepEqual(twice, once, 'a second application of the rewrite half must change nothing');
});

test('idempotence (c) the refusal: an image that overlaps its key set REFUSES the pair', () => {
  // `A -> B` and `B -> C` in one pair. `comp-1` and `comp-2` in `sys-b` are forced into the same
  // groups as `sys-a`'s `comp-2` and `comp-3`, so the derived map for `sys-b` would be
  // `{comp-1: comp-2, comp-2: comp-3}` — an image that intersects its own keys.
  const raw = {
    systems: [
      {
        id: 'sys-a',
        components: [
          { id: 'comp-2', name: 'A2', originItemUuid: 'Item.x', registeredItemUuid: 'Item.x' },
          { id: 'comp-3', name: 'A3', originItemUuid: 'Item.y', registeredItemUuid: 'Item.y' },
        ],
        essenceDefinitions: [],
        tools: [],
      },
      {
        id: 'sys-b',
        components: [
          { id: 'comp-1', name: 'B1', originItemUuid: 'Item.x', registeredItemUuid: 'Item.x' },
          { id: 'comp-2', name: 'B2', originItemUuid: 'Item.y', registeredItemUuid: 'Item.y' },
        ],
        essenceDefinitions: [],
        tools: [],
      },
    ],
    recipes: [],
    gatheringConfig: { systems: {} },
  };
  const grouping = buildWorldScopeGrouping(raw.systems);
  assert.ok(
    grouping.refusals.some(
      (refusal) => refusal.systemId === 'sys-b' && refusal.entityType === 'components'
    ),
    'the non-disjoint pair must be REFUSED rather than double-rewritten'
  );
  const result = migrateWorldScopeEntities({
    recipes: raw.recipes,
    systems: raw.systems,
    gatheringConfig: raw.gatheringConfig,
    componentScope: {},
    essenceScope: {},
    toolScope: {},
    worldScopeRekeyMap: {},
  });
  assert.deepEqual(
    result.systems[1].components.map((component) => ({
      id: component.id,
      name: component.name,
    })),
    [
      { id: 'comp-1', name: 'B1' },
      { id: 'comp-2', name: 'B2' },
    ],
    'a refused pair is byte-identical to its input: no re-key AND no identity write-back'
  );
});

// ---------------------------------------------------------------------------
// The `1.30.0` -> `1.34.0` corpus differential (issue 1654)
// ---------------------------------------------------------------------------

/**
 * The WORLD-WIDE loser-to-survivor lookup a produced `1.34.0` merge map carries.
 *
 * Read off the map the migration ACTUALLY wrote, never re-derived — the discipline
 * {@link canonicaliseProjection} states for the import map, for the same reason: a canonicaliser
 * that recomputed the mapping would agree with a WRONG merge by construction.
 *
 * @param {object} mergeMapSetting The `fabricate.worldEssenceMergeMap` value.
 * @returns {Map<string, string>}
 */
function essenceMergeIds(mergeMapSetting) {
  const ids = new Map();
  for (const legs of Object.values(mergeMapSetting?.systems ?? {})) {
    for (const [loserId, survivorId] of Object.entries(legs.essences ?? {})) {
      ids.set(loserId, survivorId);
    }
  }
  return ids;
}

/**
 * Fold every `essences` QUANTITY MAP a projection carries onto the survivor keys, SUMMING a
 * collision because the survivor carries both merged contributions.
 *
 * `canonicaliseProjection` rewrites every id in VALUE position and every id a projection KEY
 * embeds, which is the whole of what an ENTITY re-key moves. An ESSENCE merge also moves ids in
 * KEY POSITION inside a `Record<essenceId, number>`, and the shared canonicaliser deliberately
 * does not reach those: a component or tool re-key never touches one, and a canonicaliser that
 * rewrote object keys generically would rewrite a salvage group id that happened to match.
 *
 * @param {Record<string, object>} projection A `projectEntities` result.
 * @param {Map<string, string>} ids
 * @returns {Record<string, object>}
 */
function foldEssenceQuantities(projection, ids) {
  const folded = {};
  for (const [key, record] of Object.entries(projection)) {
    if (!record?.essences || typeof record.essences !== 'object') {
      folded[key] = record;
      continue;
    }
    const essences = {};
    for (const [essenceId, quantity] of Object.entries(record.essences)) {
      const target = ids.get(essenceId) ?? essenceId;
      essences[target] = (essences[target] ?? 0) + quantity;
    }
    folded[key] = { ...record, essences };
  }
  return folded;
}

test('the `1.30.0` -> `1.34.0` differential: per-system resolved behaviour is unchanged but for the merge', () => {
  // THE SAME CRITERION ONE MIGRATION LATER, and the corpus is the one issue 1654 reports: two
  // systems whose "Iron" arrived under UNRELATED ids, because `adminStore.addEssence` mints a
  // `crypto.randomUUID()`. `1.30.0` groups essences by trimmed `id`, so it lifted TWO world
  // essences and left the duplication behind; `1.34.0` is what repairs it.
  //
  // THE SOURCE ITEMS ARE DELIBERATELY NOT SHARED. `1.30.0` then merges no component and no tool,
  // so everything this differential sees is attributable to the ESSENCE merge alone rather than
  // to a component re-key baked into the BEFORE state.
  const raw = buildRawCorpus({
    seed: 1654,
    systems: [
      {
        id: 'sys-a',
        components: [{ id: 'comp-1', refs: ['Item.aaa'] }],
        // LOWERCASE, because `_normalizeEssenceDefinition` lowercases every id it emits: a
        // mixed-case fixture arrives at `1.34.0` under a different id than it was authored with.
        essences: [{ id: 'iron', name: 'Iron' }],
        tools: [{ id: 'tool-1', refs: ['Item.ccc'] }],
      },
      {
        id: 'sys-b',
        components: [{ id: 'comp-9', refs: ['Item.bbb'] }],
        essences: [{ id: 'ktz9qplm2xr4vb1a', name: 'Iron' }],
        tools: [{ id: 'tool-9', refs: ['Item.ddd'] }],
      },
    ],
  });
  const before = normalizeCorpus(CraftingSystemManager, raw);
  const lifted = migrateAndSave(before);

  // `1.34.0` runs over `1.30.0`'s OUTPUT, back to back in one chain, exactly as `MigrationRunner`
  // threads them. The BEFORE leg of the differential is the DURABLE state that output occupies —
  // `lifted.saved`, past the real normalize-and-save seam — for the reason this whole file states.
  const merged = mergeEquivalentWorldEssences({ ...lifted.migrated, worldEssenceMergeMap: {} });
  const report = merged._worldEssenceMergeReport;
  assert.equal(
    report.mergedGroups.length,
    1,
    'the premise: `1.30.0` really did leave two world essences behind for one behaviour'
  );
  assert.deepEqual(report.refusals, []);
  assert.deepEqual(report.declined, []);

  const after = saveRoundTrip(CraftingSystemManager, {
    recipes: merged.recipes,
    systems: merged.systems,
    gatheringConfig: merged.gatheringConfig,
    componentScope: merged.componentScope,
    essenceScope: merged.essenceScope,
    toolScope: lifted.migrated.toolScope,
  });

  // PROJECTION (a): every field a production reader consumes, per `(system, entity)` pair, read
  // THROUGH the scope resolvers on both legs. Canonicalised through the map the merge actually
  // wrote, so a successful re-key is invisible and a missed one is a difference.
  const ids = essenceMergeIds(merged.worldEssenceMergeMap);
  assert.equal(ids.size, 1, 'the premise: exactly one essence id was retired');
  const beforeEntities = foldEssenceQuantities(
    canonicaliseProjection(projectEntities(CraftingSystemManager, lifted.saved, true), {
      ids,
      systemIds: new Map(),
    }),
    ids
  );
  assert.deepEqual(
    projectEntities(CraftingSystemManager, after, true),
    beforeEntities,
    'every system resolves exactly what it resolved before, under the survivor id'
  );

  // PROJECTION (b) IS THE GUARD HERE rather than the subject. It resolves COMPONENT and TOOL
  // references, and an essence merge must move NONE of them: a pass that re-keyed a component id
  // while merging essences would be invisible to (a), whose reference leaves are scrubbed.
  //
  // ITS VALUES ARE PROJECTED COMPONENT RECORDS, so they carry the very `essences` quantity map
  // this merge re-keys; the same fold is applied here, and for the same reason. A site whose
  // COMPONENT identity moved still shows every other field, so the fold cannot hide one.
  assert.deepEqual(
    projectReferenceClosure(CraftingSystemManager, after, true),
    foldEssenceQuantities(projectReferenceClosure(CraftingSystemManager, lifted.saved, true), ids),
    'an essence merge moves no component or tool reference at all'
  );

  // AND THE EXCEPTION THE REPORT NAMES, which is the whole of the "except" clause: exactly the
  // world essence the report retires is gone from the roster, and nothing else is.
  const byCodePoint = (left, right) => (left < right ? -1 : Number(left > right));
  const rosterOf = (payload) =>
    (payload.entities ?? []).map((entity) => entity.id).sort(byCodePoint);
  assert.deepEqual(
    rosterOf(merged.essenceScope),
    rosterOf(lifted.migrated.essenceScope).filter((id) => !ids.has(id)),
    'the world roster loses exactly the ids the report names, and keeps every other'
  );
  assert.deepEqual(
    report.mergedGroups.map((group) => [group.survivorId, group.loserIds]),
    [['iron', [...ids.keys()]]],
    'and the surviving id is the one every re-keyed reference now names'
  );
});

test('the `1.34.0` merge leaves the `1.30.0` drift detector exactly as it found it', () => {
  // 8a IS A DISCLOSURE, NOT A BUG, and the registry `label` says so in advance — but the CORPUS
  // this differential runs over must not be the one that triggers it, or the assertion above
  // would be reading a drift report as a behaviour change. The two systems author the SAME
  // presentation here, so `reportWorldIdentityDrift` is empty on both legs and the differential's
  // silence is attributable to the merge rather than to a drift the detector absorbed.
  const raw = buildRawCorpus({
    seed: 1654,
    systems: [
      { id: 'sys-a', components: [], essences: [{ id: 'iron', name: 'Iron' }], tools: [] },
      { id: 'sys-b', components: [], essences: [{ id: 'w7yh2ndfs0jq6xe3', name: 'Iron' }], tools: [] },
    ],
  });
  const lifted = migrateAndSave(normalizeCorpus(CraftingSystemManager, raw));
  const merged = mergeEquivalentWorldEssences({ ...lifted.migrated, worldEssenceMergeMap: {} });
  const scopeCorpus = {
    components: merged.componentScope,
    essences: merged.essenceScope,
    tools: lifted.migrated.toolScope,
  };
  assert.equal(merged._worldEssenceMergeReport.mergedGroups.length, 1, 'the premise: it merged');
  assert.deepEqual(
    reportWorldIdentityDrift(merged.systems, scopeCorpus),
    [],
    'two systems that agree about presentation still agree after the merge'
  );
});
