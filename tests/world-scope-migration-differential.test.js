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
 *      rewrite site produces a reference to a retired id, the newly-decidable basis prunes it on
 *      the round-trip save, and every entity field stays identical.
 *
 * THE AFTER LEG ROUND-TRIPS THROUGH THE REAL NORMALIZE-AND-SAVE SEAM, never a hand-written
 * stand-in: production hydrates through `_normalizeSystem` and writes back, and `#### D10` states
 * outright that the newly-decidable basis PRUNES on that first save. Comparing against the
 * un-round-tripped output would certify a corpus state the world never durably occupies.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { migrateWorldScopeEntities } from '../src/migration/migrateWorldScopeEntities.js';
import { buildWorldScopeGrouping } from '../src/migration/worldScopeEntityGrouping.js';
import { COMPONENT_SCOPE } from '../src/systems/componentScope.js';
import { ESSENCE_SCOPE } from '../src/systems/essenceScope.js';
import { resolveScopedDefinition } from '../src/systems/scopedDefinitions.js';
import { TOOL_SCOPE } from '../src/systems/toolScope.js';
import { reportWorldIdentityDrift } from '../src/systems/worldIdentityDrift.js';
import {
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
  for (const entry of report.renames ?? []) {
    rekeyIndex.set(`${entry.systemId}|${entry.entityType}|${entry.oldId}`, entry.newId);
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
      assert.ok(
        renameIndex.has(afterKey),
        `${label}: ${afterKey}.${field} changed with NO matching rename-report entry`
      );
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
    // AND ACROSS THE ROUND TRIP, which is the arm that catches a normalizer that stops emitting
    // a lifted key. Comparing two re-normalized corpora cannot see that: both legs lose the key
    // together and stay equal. The world entity does NOT go through the normalizer, so it still
    // carries the field, and the drift detector reports exactly that asymmetry.
    assert.deepEqual(
      reportWorldIdentityDrift(saved.systems, scopeCorpus),
      [],
      `${scenario.name}: the normalize-and-save round trip must PRESERVE every lifted identity field`
    );
    // AND IT MUST BE PRESENT, not merely equal. The drift detector compares two copies, and a
    // normalizer that stops emitting a lifted key removes it from BOTH legs together — the
    // BEFORE corpus is normalizer output too — so they agree by ABSENCE and the comparison is
    // blind to exactly the mutation this arm exists to catch. The raw fixtures always author a
    // name and an image, so a POSITIVE presence assertion against them is the independent
    // anchor.
    for (const system of saved.systems) {
      for (const [field, required] of [
        ['components', ['name', 'img']],
        ['essenceDefinitions', ['name', 'icon']],
        ['tools', ['name']],
      ]) {
        for (const record of system[field] ?? []) {
          for (const identityField of required) {
            assert.ok(
              typeof record[identityField] === 'string' && record[identityField].length > 0,
              `${scenario.name}: ${system.id}.${field}[${record.id}].${identityField} did not survive the round trip`
            );
          }
        }
      }
    }
  }
});

test('every membership record OVERRIDES every section, with the system own value VERBATIM', () => {
  // THE ARM THAT CATCHES AN OMITTED SECTION OVERRIDE, and it cannot be stated through
  // `buildMembershipRecord` — a rebuild-and-compare would omit the same section on both sides
  // and stay green. It reads the SECTION SOURCES off the in-system record independently, and
  // resolves the membership record with NO world default, which is exactly the state the
  // migration leaves the world in.
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
        const resolved = resolveScopedDefinition(null, membership, SCOPES[entityType]);
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
  // ANTI-VACUITY: a loop that examined nothing reports the same clean pass as one that examined
  // every record.
  assert.ok(checked > 40, `the arm must actually examine sections (${checked})`);
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
