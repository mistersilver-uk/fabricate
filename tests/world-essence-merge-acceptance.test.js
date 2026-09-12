/**
 * THE `1.34.0` EQUIVALENT WORLD ESSENCE MERGE — END-TO-END ACCEPTANCE (issue 1654).
 *
 * THE CRITERION NO UNIT SUITE CAN ANSWER: "every system's resolved behaviour is identical before
 * and after, except what the report names." The three unit suites beside this one each pin ONE
 * module against its own expected output, which encodes that module's beliefs —
 * `world-essence-equivalence.test.js` owns the DECISION, `world-essence-merge-migration.test.js`
 * owns the WRITE, `world-scope-reference-walk.test.js` owns the SITE LIST. Nothing there composes
 * them and reads the result through the seam production reads through. That is this file.
 *
 * ## THE ORACLE IS THE PRODUCTION READ UNION, NOT THE MIGRATION'S OUTPUT
 *
 * {@link readResolvedWorld} resolves every system's essences through `resolveEssenceScope` — the
 * exact call `resolveScopedEntityRead` makes for `essenceDefinitions`, and therefore the exact
 * rows `CraftingEngine._runEssencePropertyMacros` reads a property macro off — and collects every
 * essence-bearing site in the corpus through an INDEPENDENT GENERIC WALK. The walk is deliberately
 * not the shared rewrite's own site list: if it were, deleting a site from that list would delete
 * it from this oracle too and the mutation would stay green.
 *
 * The BEFORE projection is then canonicalised through the map the migration ACTUALLY produced, so
 * a successful re-key is invisible and a missed one is a difference. Key-position collisions SUM
 * on both sides, because that is what the survivor carrying both contributions means.
 *
 * ## THE EIGHT SCENARIOS ARE DATA ROWS OVER ONE HELPER
 *
 * {@link runScenario} is the whole assertion body; every row below is a declaration of what the
 * report, the surviving roster, the membership map and the behaviour differential must be.
 * `tests/**` counts against the SonarCloud new-code duplication gate exactly as `src/` does, and
 * eight near-identical bodies is the commonest way that gate goes red.
 *
 * ## EVERY FIXTURE COMES FROM THE ONE SHARED BUILDER
 *
 * `buildEssenceMergeCorpus` builds the already-`1.30.0`-migrated world; `buildRawCorpus` builds
 * the pre-`1.30.0` one the chain arm needs. The shapes neither expresses — a recipe, a gathering
 * slice and an in-system component's essence quantity map — are ATTACHED to the corpus the
 * builder returns, exactly as `world-essence-merge-migration.test.js` attaches them, rather than
 * produced by a second factory.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { mergeEquivalentWorldEssences } from '../src/migration/mergeEquivalentWorldEssences.js';
import { migrateWorldScopeEntities } from '../src/migration/migrateWorldScopeEntities.js';
import { buildWorldEssenceEquivalence } from '../src/migration/worldEssenceEquivalence.js';
import { resolveEssenceScope } from '../src/systems/essenceScope.js';

import {
  buildEssenceMergeCorpus,
  buildRawCorpus,
  installFoundryStubs,
  makeManagerWithScope,
  normalizeCorpus,
  seededRandom,
} from './helpers/worldScopeCorpus.js';

installFoundryStubs();
const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');

/**
 * Three `crypto.randomUUID()`-shaped ids, which is what `adminStore.addEssence` actually mints and
 * therefore the commonest thing this pass retires.
 *
 * NONE OF THEM IS SLUG-SHAPED for any name used below, so `slugRank` cannot decide an election
 * between two of them and corpus position is left to answer — which is what scenario 8 measures.
 *
 * ALL LOWERCASE, and that is not cosmetic: `_normalizeEssenceDefinition` LOWERCASES every id it
 * emits, so a mixed-case fixture arrives at `1.34.0` under a different id the moment it passes
 * through `_normalizeSystem` — which {@link chainedThroughOneThirty} does, exactly as production
 * does. `crypto.randomUUID()` is lowercase anyway, so this is also the truer fixture.
 */
const MINTED_B = 'ktz9qplm2xr4vb1a';
const MINTED_C = 'w7yh2ndfs0jq6xe3';
const MINTED_D = 'p4rv8zmkc1ut5ao9';

/** The six keys the runner threads, so a payload is never assembled two different ways. */
const PAYLOAD_KEYS = Object.freeze([
  'recipes',
  'systems',
  'gatheringConfig',
  'essenceScope',
  'componentScope',
  'worldEssenceMergeMap',
]);

/** An explicit string comparator, so a sort's order is stated rather than defaulted. */
const byCodePoint = (left, right) => (left < right ? -1 : Number(left > right));

/** A deep copy, so a BEFORE snapshot cannot alias anything the transform returns. */
const copy = (value) => JSON.parse(JSON.stringify(value ?? null));

/** The runner payload one corpus makes, with the keys the shared builder does not produce. */
function payloadOf(corpus, extra = {}) {
  return { recipes: [], gatheringConfig: { systems: {} }, ...corpus, ...extra };
}

/** The WORLD-WIDE loser-to-survivor lookup, unioned from the per-system legs of a produced map. */
function unionOf(mergeMapSetting) {
  const union = {};
  for (const legs of Object.values(mergeMapSetting?.systems ?? {})) {
    Object.assign(union, legs.essences ?? {});
  }
  return union;
}

// ---------------------------------------------------------------------------
// THE ORACLE — the production read union, plus an independent site walk
// ---------------------------------------------------------------------------

/** Whether a value is a `Record<essenceId, number>` quantity map rather than a section switch. */
function isQuantityMap(value) {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.values(value).every((entry) => typeof entry === 'number')
  );
}

/**
 * Every essence-bearing site in a subtree, PATH-KEYED, through a generic walk.
 *
 * It visits every leaf named `essenceId` and every `essences` member — in its quantity-map form,
 * in the derived `systems[].essences[]` id-array form, and nowhere else. `inherit.essences` is a
 * BOOLEAN section switch whose key is a section NAME, so `isQuantityMap` declines it and the walk
 * descends past it; that is the same distinction `rewriteEssenceQuantityMap` makes, arrived at
 * independently.
 *
 * @param {unknown} node
 * @param {string} path
 * @param {Record<string, unknown>} into
 * @returns {Record<string, unknown>}
 */
function collectEssenceSites(node, path, into) {
  if (Array.isArray(node)) {
    for (const [index, entry] of node.entries()) {
      collectEssenceSites(entry, `${path}[${index}]`, into);
    }
    return into;
  }
  if (node === null || typeof node !== 'object') return into;
  for (const [key, value] of Object.entries(node)) {
    const childPath = `${path}.${key}`;
    if (key === 'essenceId' && typeof value === 'string') {
      into[childPath] = value;
      continue;
    }
    if (key === 'essences' && Array.isArray(value)) {
      into[childPath] = [...value];
      continue;
    }
    if (key === 'essences' && isQuantityMap(value)) {
      into[childPath] = { ...value };
      continue;
    }
    collectEssenceSites(value, childPath, into);
  }
  return into;
}

/** The essence-row fields a production reader consumes off the READ UNION. */
const UNION_FIELDS = Object.freeze([
  'name',
  'icon',
  'colorToken',
  'description',
  'enabled',
  'propertyMacroUuid',
  'sourceComponentId',
  'sourceItemUuid',
  'associatedSystemItemId',
]);

/**
 * WHAT EVERY SYSTEM RESOLVES, and every site that names an essence.
 *
 * The essence rows come from `resolveEssenceScope` against the corpus a REAL store publishes, so
 * the three-layer resolution, requirement 36's in-system re-spread and `applyInheritedSections`
 * all run exactly as they do in production. A hand-rolled read of the membership record would be
 * blind to all three.
 *
 * @param {object} corpus `{systems, recipes, gatheringConfig, essenceScope, componentScope}`
 * @returns {Record<string, unknown>}
 */
function readResolvedWorld(corpus) {
  const manager = makeManagerWithScope(CraftingSystemManager, corpus);
  const world = manager._essenceScopeStore.corpus();
  const projection = {};
  for (const system of corpus.systems ?? []) {
    for (const row of resolveEssenceScope(world, system.id, system.essenceDefinitions)) {
      const resolved = {};
      for (const field of UNION_FIELDS) resolved[field] = row[field] ?? null;
      projection[`${system.id}|essence|${row.id}`] = resolved;
    }
    collectEssenceSites(system.components, `${system.id}|components`, projection);
    collectEssenceSites(system.tools, `${system.id}|tools`, projection);
    // The DERIVED roster is an id ARRAY rather than a member of an object, so it is recorded
    // directly: the walk above only sees an `essences` key it descends ONTO.
    if (Array.isArray(system.essences)) projection[`${system.id}|roster`] = [...system.essences];
  }
  for (const recipe of corpus.recipes ?? []) {
    collectEssenceSites(recipe, `${recipe.craftingSystemId}|recipe.${recipe.id}`, projection);
  }
  for (const [systemId, slice] of Object.entries(corpus.gatheringConfig?.systems ?? {})) {
    collectEssenceSites(slice, `${systemId}|gathering`, projection);
  }
  collectEssenceSites(corpus.componentScope?.defaults, 'world|componentDefaults', projection);
  collectEssenceSites(corpus.componentScope?.membership, 'world|componentMembership', projection);
  return projection;
}

/**
 * Rewrite every retired id a projection carries — in its KEY, in a leaf value, in an id array and
 * in QUANTITY-MAP KEY POSITION, where a collision SUMS.
 *
 * Applied to the BEFORE leg alone. The AFTER leg needs none: the map's image is disjoint from its
 * key set, which `world-essence-equivalence.test.js` pins outright, so canonicalising it would be
 * the identity.
 *
 * @param {Record<string, unknown>} projection
 * @param {{[loserId: string]: string}} remap
 * @returns {Record<string, unknown>}
 */
function canonicaliseEssenceIds(projection, remap) {
  const mapId = (id) => (typeof id === 'string' && remap[id]) || id;
  const rewritten = {};
  for (const [key, value] of Object.entries(projection)) {
    const canonicalKey = key
      .split('|')
      .map((segment) => mapId(segment))
      .join('|');
    if (typeof value === 'string') {
      rewritten[canonicalKey] = mapId(value);
    } else if (Array.isArray(value)) {
      rewritten[canonicalKey] = value.map((entry) => mapId(entry));
    } else if (isQuantityMap(value)) {
      const summed = {};
      for (const [id, quantity] of Object.entries(value)) {
        const target = mapId(id);
        summed[target] = (summed[target] ?? 0) + quantity;
      }
      rewritten[canonicalKey] = summed;
    } else {
      rewritten[canonicalKey] = value;
    }
  }
  return rewritten;
}

/**
 * The differences the merge made to what the world RESOLVES, as sorted `path` strings.
 *
 * A site that vanished or appeared is reported too, under an explicit prefix, because an absence
 * compared against an absence is the one shape a naive deep-equal reads as agreement.
 *
 * @param {object} before The pre-merge corpus.
 * @param {object} after The post-merge corpus.
 * @param {{[loserId: string]: string}} remap
 * @returns {string[]}
 */
function behaviourDifferences(before, after, remap) {
  const expected = canonicaliseEssenceIds(readResolvedWorld(before), remap);
  const actual = readResolvedWorld(after);
  const differences = [];
  for (const [path, value] of Object.entries(expected)) {
    if (!(path in actual)) {
      differences.push(`gone:${path}`);
      continue;
    }
    if (JSON.stringify(value) === JSON.stringify(actual[path])) continue;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const field of new Set([...Object.keys(value), ...Object.keys(actual[path] ?? {})])) {
        if (JSON.stringify(value[field]) === JSON.stringify(actual[path]?.[field])) continue;
        differences.push(`${path}.${field}`);
      }
      continue;
    }
    differences.push(path);
  }
  for (const path of Object.keys(actual)) {
    if (!(path in expected)) differences.push(`new:${path}`);
  }
  return differences.sort(byCodePoint);
}

/** The post-merge corpus, assembled from the keys the transform answers. */
function corpusOf(result) {
  return {
    systems: result.systems,
    recipes: result.recipes,
    gatheringConfig: result.gatheringConfig,
    essenceScope: result.essenceScope,
    componentScope: result.componentScope,
  };
}

/** `{[entityId]: [systemId]}` over a produced membership map, in corpus-stable order. */
function membershipIndex(essenceScope) {
  const index = {};
  for (const record of Object.values(essenceScope.membership ?? {})) {
    (index[record.entityId] ??= []).push(record.systemId);
  }
  for (const systems of Object.values(index)) systems.sort(byCodePoint);
  return index;
}

// ---------------------------------------------------------------------------
// THE ONE ASSERTION HELPER
// ---------------------------------------------------------------------------

/**
 * Run one scenario row and assert everything every row has in common.
 *
 * @param {object} row A `SCENARIOS` entry.
 * @returns {{data: object, before: object, result: object, remap: object}}
 */
function runScenario(row) {
  const data = payloadOf(row.corpus());
  const before = copy(data);
  const result = mergeEquivalentWorldEssences(data);
  const report = result._worldEssenceMergeReport;
  const remap = unionOf(result.worldEssenceMergeMap);
  const where = row.name;

  // 1. THE REPORT — what a GM is told, which is the whole of the exception clause.
  assert.deepEqual(
    report.mergedGroups.map(({ survivorId, loserIds, systemIds }) => ({
      survivorId,
      loserIds,
      systemIds,
    })),
    row.merged ?? [],
    `${where}: merged groups`
  );
  assert.deepEqual(
    report.refusals.map(({ survivorId, loserIds, systemIds, reason }) => ({
      survivorId,
      loserIds,
      systemIds,
      reason,
    })),
    row.refusals ?? [],
    `${where}: refusals`
  );
  assert.deepEqual(
    report.declined.map(({ essenceId, sections, reason }) => ({ essenceId, sections, reason })),
    row.declined ?? [],
    `${where}: declined`
  );
  assert.deepEqual(
    report.orphaned.map((entry) => entry.essenceId),
    row.orphaned ?? [],
    `${where}: orphaned`
  );

  // 2. THE SURVIVING WORLD ROSTER, in the stored array's own order minus the retired rows.
  assert.deepEqual(
    result.essenceScope.entities.map((entity) => entity.id),
    row.entities,
    `${where}: surviving world essences`
  );

  // 3. THE MEMBERSHIP MAP — one record per system on the survivor, none dropped.
  assert.deepEqual(membershipIndex(result.essenceScope), row.members, `${where}: membership`);

  // 4. REQUIREMENT 8, over every record this pass RE-POINTED: a section it was inheriting is now
  //    an explicit override, because its world parent moved and the loser's default is gone.
  for (const record of Object.values(result.essenceScope.membership)) {
    if (!(record.systemId in (result.worldEssenceMergeMap?.systems ?? {}))) continue;
    if (!row.merged?.some((group) => group.survivorId === record.entityId)) continue;
    assert.deepEqual(
      record.inherit,
      { effectSource: false, macro: false },
      `${where}: ${record.entityId}/${record.systemId} must override every section after a re-point`
    );
  }

  // 5. A CORPUS WITH NOTHING TO MERGE ANSWERS THE CALLER'S OWN OBJECT, so the runner's
  //    per-setting JSON comparison declines to write the leg at all.
  if (row.untouched) {
    for (const key of PAYLOAD_KEYS) {
      assert.equal(result[key], data[key], `${where}: ${key} must answer the caller's OWN object`);
    }
  }

  // 6. THE DIFFERENTIAL — the criterion the unit suites cannot state.
  assert.deepEqual(
    behaviourDifferences(before, corpusOf(result), remap),
    row.behaviourDifferences ?? [],
    `${where}: resolved behaviour must be identical except where the row declares otherwise`
  );

  row.extra?.({ data, before, result, remap });
  return { data, before, result, remap };
}

// ---------------------------------------------------------------------------
// The fixtures the shared builder needs help with
// ---------------------------------------------------------------------------

/**
 * SCENARIO 5's corpus: three systems whose references all converge on ONE migrated world essence,
 * carrying every site class the shared walk covers.
 *
 * The three shapes `buildEssenceMergeCorpus` cannot express — a recipe, a gathering slice and an
 * in-system component's essence quantity map — are ATTACHED to what it returns. That is the same
 * decision `world-essence-merge-migration.test.js` records, taken for the same reason: a second
 * corpus factory is duplicated test code, and `tests/**` counts against the duplication gate.
 *
 * @returns {object} a payload-ready corpus.
 */
function convergingReferences() {
  const corpus = buildEssenceMergeCorpus({
    systems: [
      { id: 'sys-a', essences: [{ id: 'iron', name: 'Iron' }] },
      { id: 'sys-b', essences: [{ id: MINTED_B, name: 'Iron' }], components: [{ id: 'comp-b' }] },
      { id: 'sys-c', essences: [{ id: MINTED_C, name: 'Iron' }] },
    ],
  });
  // KEY-POSITION FAMILY 1 — `systems[].components[].essences`, the sharpest of the four: a missed
  // key here is a SILENT DELETION on the next save, not a dangling reference a reader can report.
  corpus.systems[1].components = [
    { id: 'comp-b', name: 'Ore', essences: { [MINTED_B]: 2, iron: 1 } },
  ];
  corpus.systems[2].components = [{ id: 'comp-c', name: 'Ore', essences: { [MINTED_C]: 4 } }];
  // The DERIVED roster `_normalizeSystem` re-mints, which is READ long before the next save.
  for (const system of corpus.systems) {
    system.essences = system.essenceDefinitions.map((definition) => definition.id);
  }
  // LEAF SITES in the system slice, at the option AND at its `alternatives[]` recursion.
  corpus.systems[1].tools = [
    {
      id: 'tool-b',
      name: 'Hammer',
      repairRequirements: [
        {
          id: 'rr-b',
          options: [
            {
              quantity: 1,
              match: { type: 'essence', essenceId: MINTED_B },
              alternatives: [{ quantity: 2, match: { type: 'essence', essenceId: MINTED_B } }],
            },
          ],
        },
      ],
    },
  ];
  // KEY-POSITION FAMILIES 2 AND 3 — the two world-scope component maps.
  corpus.componentScope.defaults['comp-b'] = { id: 'comp-b', essences: { [MINTED_B]: 3 } };
  corpus.componentScope.membership['comp-b|sys-b'].essences = { [MINTED_B]: 5, iron: 5 };
  corpus.componentScope.membership['comp-b|sys-b'].inherit = { essences: false };
  return {
    ...corpus,
    recipes: [
      {
        id: 'recipe-b',
        craftingSystemId: 'sys-b',
        ingredientSets: [
          {
            id: 'is-1',
            // KEY-POSITION FAMILY 4, DEPTH 1 — the legacy per-set quantity map.
            essences: { [MINTED_B]: 1, iron: 1 },
            ingredientGroups: [
              {
                id: 'ig-1',
                options: [
                  {
                    quantity: 2,
                    match: { type: 'essence', essenceId: MINTED_B },
                    alternatives: [
                      { quantity: 1, match: { type: 'essence', essenceId: MINTED_B } },
                    ],
                  },
                ],
              },
            ],
            // The FLAT `ingredients[]` alias `IngredientSet.toJSON` stopped emitting.
            ingredients: [{ quantity: 1, match: { type: 'essence', essenceId: MINTED_B } }],
          },
        ],
        steps: [
          {
            id: 'st-1',
            ingredientSets: [
              {
                id: 'sis-1',
                // KEY-POSITION FAMILY 4, DEPTH 2 — the same map under a step.
                essences: { [MINTED_B]: 7 },
                ingredientGroups: [
                  {
                    id: 'sig-1',
                    options: [
                      {
                        quantity: 1,
                        match: { type: 'essence', essenceId: MINTED_B },
                        alternatives: [
                          { quantity: 1, match: { type: 'essence', essenceId: MINTED_B } },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    gatheringConfig: {
      systems: {
        'sys-c': {
          tools: [
            {
              id: 'tool-c',
              repairRequirements: [
                {
                  id: 'rr-c',
                  options: [{ quantity: 1, match: { type: 'essence', essenceId: MINTED_C } }],
                },
              ],
            },
          ],
        },
      },
    },
  };
}

/**
 * SCENARIO 6's corpus: a world that has ALREADY been through `1.30.0`, produced by running the
 * shipped `1.30.0` pass over a raw pre-migration corpus rather than by hand.
 *
 * Two systems' "Iron" arrive under UNRELATED ids — the `crypto.randomUUID()` authoring route — so
 * `1.30.0` groups them by trimmed `id`, lifts TWO world essences, and leaves behind exactly the
 * duplication issue 1654 reports. An essence-bearing gathering slice is attached because
 * `buildRawCorpus` authors none, and without one the `gatheringConfig` tear below would be
 * invisible: a leg with nothing in it to re-key cannot be observed as un-landed.
 *
 * @returns {object} a payload-ready corpus.
 */
function chainedThroughOneThirty() {
  const raw = buildRawCorpus({
    seed: 1654,
    systems: [
      {
        id: 'sys-a',
        components: [{ id: 'comp-1', refs: ['Item.shared'] }],
        essences: [{ id: 'iron', name: 'Iron' }],
        tools: [{ id: 'tool-1', refs: ['Item.hammer'] }],
      },
      {
        id: 'sys-b',
        components: [{ id: 'comp-9', refs: ['Item.shared'] }],
        essences: [{ id: MINTED_B, name: 'Iron' }],
        tools: [{ id: 'tool-9', refs: ['Item.hammer'] }],
      },
    ],
  });
  raw.gatheringConfig.systems['sys-b'].tools = [
    {
      id: 'tool-9',
      repairRequirements: [
        { id: 'rr-9', options: [{ quantity: 1, match: { type: 'essence', essenceId: MINTED_B } }] },
      ],
    },
  ];
  const before = normalizeCorpus(CraftingSystemManager, raw);
  const lifted = migrateWorldScopeEntities({
    recipes: before.recipes,
    systems: before.systems,
    gatheringConfig: before.gatheringConfig,
    componentScope: {},
    essenceScope: {},
    toolScope: {},
    worldScopeRekeyMap: {},
  });
  return {
    systems: lifted.systems,
    recipes: lifted.recipes,
    gatheringConfig: lifted.gatheringConfig,
    essenceScope: lifted.essenceScope,
    componentScope: lifted.componentScope,
  };
}

/**
 * A TORN world: the writeback legs in `landed` carry the `1.34.0` values and every other leg still
 * carries its pre-merge one.
 *
 * `worldEssenceMergeMap` is ALWAYS landed, because it is the SECOND leg — written immediately
 * after `worldScopeRekeyMap` and before `recipes` — which is precisely the ordering decision
 * requirement 10 takes so a tear anywhere downstream is recoverable.
 *
 * @param {object} baseline The pre-merge payload.
 * @param {object} untorn The complete `1.34.0` result.
 * @param {string[]} landed The legs that reached disk.
 * @returns {object}
 */
function tornPayload(baseline, untorn, landed) {
  const payload = { ...baseline, worldEssenceMergeMap: untorn.worldEssenceMergeMap };
  for (const key of landed) payload[key] = untorn[key];
  return payload;
}

// ---------------------------------------------------------------------------
// THE EIGHT SCENARIOS, AS DATA
// ---------------------------------------------------------------------------

const SCENARIOS = [
  {
    name: '1: identical essences in three systems become ONE world essence',
    corpus: () =>
      buildEssenceMergeCorpus({
        systems: [
          { id: 'sys-a', essences: [{ id: 'iron', name: 'Iron' }] },
          { id: 'sys-b', essences: [{ id: MINTED_B, name: 'Iron' }] },
          { id: 'sys-c', essences: [{ id: MINTED_C, name: 'Iron' }] },
        ],
      }),
    merged: [
      {
        survivorId: 'iron',
        loserIds: [MINTED_B, MINTED_C],
        systemIds: ['sys-a', 'sys-b', 'sys-c'],
      },
    ],
    entities: ['iron'],
    members: { iron: ['sys-a', 'sys-b', 'sys-c'] },
  },
  {
    name: '2: the same name under a DIFFERENT macro stays two world essences',
    corpus: () =>
      buildEssenceMergeCorpus({
        systems: [
          { id: 'sys-a', essences: [{ id: 'iron', name: 'Iron', macro: 'Macro.forge' }] },
          { id: 'sys-b', essences: [{ id: MINTED_B, name: 'Iron', macro: 'Macro.smelt' }] },
        ],
      }),
    // NOT `declined`. The two systems disagree ACROSS two world essences, which is two different
    // keys and therefore no group at all; `declined` is reserved for a disagreement INSIDE one
    // world essence, where a candidate really was evaluated and really was rejected.
    entities: ['iron', MINTED_B],
    members: { iron: ['sys-a'], [MINTED_B]: ['sys-b'] },
    untouched: true,
  },
  {
    name: '2: a macro disagreement INSIDE one world essence is DECLINED with its section',
    corpus: () =>
      buildEssenceMergeCorpus({
        systems: [
          { id: 'sys-a', essences: [{ id: 'iron', name: 'Iron', macro: 'Macro.forge' }] },
          { id: 'sys-b', essences: [{ id: 'iron', name: 'Iron', macro: 'Macro.smelt' }] },
        ],
      }),
    declined: [{ essenceId: 'iron', sections: ['macro'], reason: 'sectionDisagreement' }],
    entities: ['iron'],
    members: { iron: ['sys-a', 'sys-b'] },
    untouched: true,
  },
  {
    name: '3: the same name under a DIFFERENT effect source stays two world essences',
    corpus: () =>
      buildEssenceMergeCorpus({
        systems: [
          {
            id: 'sys-a',
            essences: [{ id: 'iron', name: 'Iron', sourceComponentId: 'comp-1' }],
            components: [{ id: 'comp-1' }],
          },
          {
            id: 'sys-b',
            essences: [{ id: MINTED_B, name: 'Iron', sourceComponentId: 'comp-2' }],
            components: [{ id: 'comp-2' }],
          },
        ],
      }),
    entities: ['iron', MINTED_B],
    members: { iron: ['sys-a'], [MINTED_B]: ['sys-b'] },
    untouched: true,
  },
  {
    name: '3: an effect-source disagreement INSIDE one world essence is DECLINED',
    corpus: () =>
      buildEssenceMergeCorpus({
        systems: [
          {
            id: 'sys-a',
            essences: [{ id: 'iron', name: 'Iron', sourceComponentId: 'comp-1' }],
            components: [{ id: 'comp-1' }],
          },
          {
            id: 'sys-b',
            essences: [{ id: 'iron', name: 'Iron', sourceComponentId: 'comp-2' }],
            components: [{ id: 'comp-2' }],
          },
        ],
      }),
    declined: [{ essenceId: 'iron', sections: ['effectSource'], reason: 'sectionDisagreement' }],
    entities: ['iron'],
    members: { iron: ['sys-a', 'sys-b'] },
    untouched: true,
  },
  {
    name: '4: `{}`, an ALL-NULL block, an ABSENT block, a REORDERED one and untrimmed text merge',
    corpus: () =>
      buildEssenceMergeCorpus({
        systems: [
          { id: 'sys-a', essences: [{ id: 'iron', name: 'Iron', effectSource: {} }] },
          {
            id: 'sys-b',
            essences: [
              {
                id: MINTED_B,
                name: '  IRON  ',
                effectSource: {
                  sourceComponentId: null,
                  sourceItemUuid: null,
                  associatedSystemItemId: null,
                },
              },
            ],
          },
          {
            id: 'sys-c',
            essences: [{ id: MINTED_C, name: 'iron', omitSections: ['effectSource'] }],
          },
          {
            id: 'sys-d',
            essences: [
              {
                id: MINTED_D,
                name: 'Iron',
                macro: ' ',
                effectSource: {
                  associatedSystemItemId: null,
                  sourceItemUuid: null,
                  sourceComponentId: null,
                },
              },
            ],
          },
        ],
      }),
    merged: [
      {
        survivorId: 'iron',
        loserIds: [MINTED_B, MINTED_C, MINTED_D],
        systemIds: ['sys-a', 'sys-b', 'sys-c', 'sys-d'],
      },
    ],
    entities: ['iron'],
    members: { iron: ['sys-a', 'sys-b', 'sys-c', 'sys-d'] },
  },
  {
    name: '4: an UNTRIMMED effect-source reference canonicalises to the trimmed one',
    corpus: () =>
      buildEssenceMergeCorpus({
        systems: [
          {
            id: 'sys-a',
            essences: [{ id: 'iron', name: 'Iron', sourceComponentId: 'comp-1' }],
            components: [{ id: 'comp-1' }],
          },
          {
            id: 'sys-b',
            essences: [{ id: MINTED_B, name: 'Iron', sourceComponentId: '  comp-1  ' }],
            components: [{ id: 'comp-1' }],
          },
        ],
      }),
    merged: [{ survivorId: 'iron', loserIds: [MINTED_B], systemIds: ['sys-a', 'sys-b'] }],
    entities: ['iron'],
    members: { iron: ['sys-a', 'sys-b'] },
  },
  {
    name: '5: every reference class converging on one migrated world essence is re-keyed',
    corpus: convergingReferences,
    merged: [
      {
        survivorId: 'iron',
        loserIds: [MINTED_B, MINTED_C],
        systemIds: ['sys-a', 'sys-b', 'sys-c'],
      },
    ],
    entities: ['iron'],
    members: { iron: ['sys-a', 'sys-b', 'sys-c'] },
    extra: assertNoSilentQuantityDeletion,
  },
  {
    name: '6: a world already carrying `1.30.0` output merges, and every TEAR recovers',
    corpus: chainedThroughOneThirty,
    merged: [{ survivorId: 'iron', loserIds: [MINTED_B], systemIds: ['sys-a', 'sys-b'] }],
    entities: ['iron'],
    members: { iron: ['sys-a', 'sys-b'] },
    extra: assertTearRecovery,
  },
  {
    name: '7: a REFUSED component pair makes a literally equal source id UNPROVABLE',
    corpus: () =>
      buildEssenceMergeCorpus({
        systems: [
          {
            id: 'sys-a',
            essences: [{ id: 'iron', name: 'Iron', sourceComponentId: 'comp-x' }],
            // `member: false` IS the refusal: `partition` excludes a refused `(system,
            // 'components')` pair outright, so `1.30.0` wrote no membership record for it and the
            // essence still carries a raw SYSTEM-LOCAL id.
            components: [{ id: 'comp-x', member: false }],
          },
          {
            id: 'sys-b',
            essences: [{ id: MINTED_B, name: 'Iron', sourceComponentId: 'comp-x' }],
            components: [{ id: 'comp-x', member: false }],
          },
        ],
      }),
    refusals: [
      {
        survivorId: 'iron',
        loserIds: [MINTED_B],
        systemIds: ['sys-a', 'sys-b'],
        reason: 'unresolvedEffectSourceComponent',
      },
    ],
    entities: ['iron', MINTED_B],
    members: { iron: ['sys-a'], [MINTED_B]: ['sys-b'] },
    untouched: true,
  },
  {
    name: '7: THE CONTRAST — the same two essences merge once their components did',
    corpus: () =>
      buildEssenceMergeCorpus({
        systems: [
          {
            id: 'sys-a',
            essences: [{ id: 'iron', name: 'Iron', sourceComponentId: 'comp-x' }],
            components: [{ id: 'comp-x' }],
          },
          {
            id: 'sys-b',
            essences: [{ id: MINTED_B, name: 'Iron', sourceComponentId: 'comp-x' }],
            components: [{ id: 'comp-x' }],
          },
        ],
      }),
    merged: [{ survivorId: 'iron', loserIds: [MINTED_B], systemIds: ['sys-a', 'sys-b'] }],
    entities: ['iron'],
    members: { iron: ['sys-a', 'sys-b'] },
  },
  {
    name: '8: a MULTI-member world essence beats a single-member one on CORPUS POSITION',
    corpus: () =>
      buildEssenceMergeCorpus({
        systems: [
          { id: 'sys-a', essences: [{ id: MINTED_B, name: 'Iron' }] },
          { id: 'sys-b', essences: [{ id: MINTED_B, name: 'Iron' }] },
          { id: 'sys-c', essences: [{ id: MINTED_C, name: 'Iron' }] },
        ],
      }),
    merged: [
      { survivorId: MINTED_B, loserIds: [MINTED_C], systemIds: ['sys-a', 'sys-b', 'sys-c'] },
    ],
    entities: [MINTED_B],
    members: { [MINTED_B]: ['sys-a', 'sys-b', 'sys-c'] },
  },
  {
    name: '8: when the MULTI-member one LOSES, BOTH its records are re-pointed and neither drops',
    corpus: () =>
      buildEssenceMergeCorpus({
        systems: [
          // `sys-a` INHERITS its macro from W1's world default; `sys-b` overrides with the same
          // value. Unanimity therefore has to read BOTH records, and the row below proves it does.
          {
            id: 'sys-a',
            essences: [
              { id: MINTED_B, name: 'Iron', inherit: { macro: true }, omitSections: ['macro'] },
            ],
          },
          { id: 'sys-b', essences: [{ id: MINTED_B, name: 'Iron', macro: 'Macro.forge' }] },
          { id: 'sys-c', essences: [{ id: 'iron', name: 'Iron', macro: 'Macro.forge' }] },
        ],
        worldDefaults: { [MINTED_B]: { macro: 'Macro.forge' } },
      }),
    // SLUG PREFERENCE is consulted FIRST, so the readable `iron` wins from the YOUNGEST system.
    merged: [{ survivorId: 'iron', loserIds: [MINTED_B], systemIds: ['sys-a', 'sys-b', 'sys-c'] }],
    entities: ['iron'],
    members: { iron: ['sys-a', 'sys-b', 'sys-c'] },
    // THE MEASURED DIVERGENCE, recorded rather than asserted away. See the dedicated arm below.
    behaviourDifferences: ['sys-a|essence|iron.propertyMacroUuid'],
    extra: ({ result }) => {
      assert.equal(
        result.essenceScope.membership['iron|sys-a'].macro,
        'Macro.forge',
        'the INHERITING record froze the value it resolved to through the parent it LEFT'
      );
      assert.equal(result.essenceScope.membership['iron|sys-b'].macro, 'Macro.forge');
      assert.equal(result.essenceScope.membership['iron|sys-c'].macro, 'Macro.forge');
      assert.equal(
        result.essenceScope.defaults[MINTED_B],
        undefined,
        "the loser's world default is deleted with its entity row"
      );
    },
  },
  {
    name: '8: unanimity is evaluated over BOTH records of the multi-member essence',
    corpus: () =>
      buildEssenceMergeCorpus({
        systems: [
          { id: 'sys-a', essences: [{ id: MINTED_B, name: 'Iron', macro: 'Macro.forge' }] },
          // ONLY the SECOND record disagrees. A unanimity walk that read `members[0]` alone would
          // merge this and silently give `sys-b` `sys-a`'s macro.
          { id: 'sys-b', essences: [{ id: MINTED_B, name: 'Iron', macro: 'Macro.smelt' }] },
          { id: 'sys-c', essences: [{ id: 'iron', name: 'Iron', macro: 'Macro.forge' }] },
        ],
      }),
    declined: [{ essenceId: MINTED_B, sections: ['macro'], reason: 'sectionDisagreement' }],
    entities: [MINTED_B, 'iron'],
    members: { [MINTED_B]: ['sys-a', 'sys-b'], iron: ['sys-c'] },
    untouched: true,
  },
];

for (const row of SCENARIOS) {
  test(`acceptance ${row.name}`, () => runScenario(row));
}

// ---------------------------------------------------------------------------
// SCENARIO 5's destructive regression, WITH ITS NEGATIVE CONTROL
// ---------------------------------------------------------------------------

/**
 * THE COMPONENT KEY-POSITION REWRITE IS NOT OPTIONAL, and the naive assertion cannot say so.
 *
 * `_normalizeEssenceQuantities` prunes a key only when `_scopeBasis().essenceIds` is a `Set`, and
 * `_scopeEntityBasis` answers `null` — PRUNE NOTHING — unless the store reports
 * `isSeeded('entities')` or the system's `essenceDefinitions` array is NON-EMPTY. So a round trip
 * through a bare manager over an emptied system keeps every key and the positive assertion below
 * passes with the prune DISARMED. Worse, the basis is a UNION: a run that missed the
 * `essenceDefinitions` re-key too would put the RETIRED id back in the basis and hide the loss.
 *
 * Three steps, in this order:
 *
 *  (a) the basis is ARMED, and the retired id is genuinely OUTSIDE it;
 *  (b) the POSITIVE — every quantity survives under the SURVIVOR key, summed;
 *  (c) the NEGATIVE CONTROL — the same corpus with the component key-position rewrite WITHHELD
 *      loses exactly that quantity, silently and permanently, because the normalizer is an
 *      allowlist rebuild.
 *
 * @param {{result: object}} context
 */
function assertNoSilentQuantityDeletion({ result }) {
  const merged = corpusOf(result);
  const system = merged.systems[1];

  // (a) ARMED. Through a manager wired to the REAL seeded store, never a bare one.
  const manager = makeManagerWithScope(CraftingSystemManager, merged);
  const basis = manager._scopeBasis(system).essenceIds;
  assert.ok(basis instanceof Set, 'the prune is ARMED: a null basis prunes NOTHING');
  assert.ok(basis.has('iron'), 'and the survivor is in it');
  assert.ok(
    !basis.has(MINTED_B),
    'and the RETIRED id is outside it, which is what makes a missed key a deletion'
  );

  // (b) THE POSITIVE. `{[MINTED_B]: 2, iron: 1}` became `{iron: 3}` before the save, so the save
  // keeps all three units.
  assert.deepEqual(
    manager._normalizeSystem(system).components[0].essences,
    { iron: 3 },
    'every quantity survives the real normalize-and-save seam under the survivor key'
  );

  // (c) THE NEGATIVE CONTROL. Only the component quantity map is rewound; the definition re-key,
  // the world roster and the merge map all stay landed, which is exactly the shape a deleted
  // `rewriteEssenceQuantityMap` leg produces.
  const withheld = copy(merged);
  withheld.systems[1].components[0].essences = { [MINTED_B]: 2, iron: 1 };
  const damaged = makeManagerWithScope(CraftingSystemManager, withheld)._normalizeSystem(
    withheld.systems[1]
  );
  assert.deepEqual(
    damaged.components[0].essences,
    { iron: 1 },
    'WITHOUT the key-position rewrite the retired key is SILENTLY DELETED on the next save'
  );
}

// ---------------------------------------------------------------------------
// SCENARIO 6's tears, chosen for DIRECTION rather than for convenience
// ---------------------------------------------------------------------------

/**
 * THE WRITEBACK ORDER IS `worldScopeRekeyMap` -> `worldEssenceMergeMap` -> `recipes` -> ... ->
 * `componentScope` -> `essenceScope` -> `toolScope` -> `craftingSystems` -> `gatheringConfig`.
 *
 * **"`essenceScope` landed, `craftingSystems` did not" is the SAFE direction and is NOT pinned
 * here**, deliberately: the legacy `essenceDefinitions` array still carries the loser id, so the
 * basis UNION still vouches for it and nothing is pruned. A tear that cannot fail on the defect it
 * appears to test is a green assertion with no content. The two pinned below can fail:
 *
 *  (a) `componentScope` landed, `essenceScope` did NOT — the re-run must RECONCILE rather than
 *      double-apply the map to component maps that are already re-keyed;
 *  (b) `craftingSystems` landed, `gatheringConfig` did NOT — the re-run must rewrite the gathering
 *      slice from the PERSISTED map, because re-deriving one from already-re-keyed systems answers
 *      EMPTY. That is the exact failure `migrateWorldScopeEntities.js` records for `1.30.0` in its
 *      own "a torn run may already have re-keyed `craftingSystems`" note.
 *
 * @param {{before: object, result: object}} context
 */
function assertTearRecovery({ before, result }) {
  const RECOVERED = ['systems', 'recipes', 'gatheringConfig', 'essenceScope', 'componentScope'];
  const tears = [
    ['componentScope landed, essenceScope did NOT', ['recipes', 'componentScope']],
    [
      'craftingSystems landed, gatheringConfig did NOT',
      ['recipes', 'componentScope', 'essenceScope', 'systems'],
    ],
  ];
  for (const [label, landed] of tears) {
    const repaired = mergeEquivalentWorldEssences(tornPayload(before, result, landed));
    for (const key of RECOVERED) {
      assert.deepEqual(repaired[key], result[key], `${label}: ${key} must recover`);
    }
  }

  // THE PREMISE OF TEAR (b), which is what makes it a test of the persisted map rather than of
  // the derivation: with the map WITHHELD there is nothing left in the corpus to re-derive from.
  const landedAll = ['recipes', 'componentScope', 'essenceScope', 'systems'];
  const mapless = { ...tornPayload(before, result, landedAll), worldEssenceMergeMap: {} };
  assert.deepEqual(
    buildWorldEssenceEquivalence({
      systems: result.systems,
      essenceScope: result.essenceScope,
      componentScope: result.componentScope,
    }).mergeMap,
    {},
    'a map RE-DERIVED from an already-merged corpus is EMPTY'
  );
  assert.deepEqual(
    mergeEquivalentWorldEssences(mapless).gatheringConfig,
    before.gatheringConfig,
    'so WITHOUT the persisted map the gathering slice keeps the retired id forever'
  );
  assert.notDeepEqual(
    result.gatheringConfig,
    before.gatheringConfig,
    'the premise: the gathering slice really does carry a retired id to rewrite'
  );
}

// ---------------------------------------------------------------------------
// SCENARIO 6(i) — the CHAIN, and what deep-equality there actually proves
// ---------------------------------------------------------------------------

test('acceptance 6: the `1.30.0`-then-`1.34.0` chain equals `1.34.0` alone on a persisted world', () => {
  // WHAT THIS PROVES, stated rather than overclaimed: `1.34.0`'s answer is a function of the
  // PERSISTED state alone. Arm B starts from a JSON round trip of `1.30.0`'s output — which is
  // literally what the next boot reads back out of `game.settings` — and carries no object
  // identity, no prototype and no non-JSON value from the pass that produced it. A `1.34.0` that
  // had come to depend on any of those, or on a `worldScopeRekeyMap` still sitting in memory,
  // would answer differently here.
  const chained = chainedThroughOneThirty();
  const armA = mergeEquivalentWorldEssences(payloadOf(chained));
  const armB = mergeEquivalentWorldEssences(payloadOf(copy(chained)));
  // THE PREMISE, because two arms that both merged NOTHING are deep-equal for no good reason.
  assert.deepEqual(
    armA._worldEssenceMergeReport.mergedGroups.map((group) => group.loserIds),
    [[MINTED_B]],
    'the premise: `1.30.0` left one duplicate behind and `1.34.0` merged exactly it'
  );
  assert.deepEqual(Object.keys(unionOf(armA.worldEssenceMergeMap)), [MINTED_B]);
  for (const key of ['systems', 'recipes', 'gatheringConfig', 'essenceScope', 'componentScope']) {
    assert.deepEqual(armB[key], armA[key], `${key} must be identical across the two arms`);
  }
  assert.deepEqual(armB.worldEssenceMergeMap, armA.worldEssenceMergeMap);
  assert.deepEqual(armB._worldEssenceMergeReport, armA._worldEssenceMergeReport);

  // AND THE END-TO-END FACT both arms share, which is what stops this being a pure tautology: a
  // RAW pre-`1.30.0` world reaches ONE world essence, and the younger system's DEFINITION row, its
  // component quantity map and its gathering slice all name it.
  assert.deepEqual(
    armA.essenceScope.entities.map((entity) => entity.id),
    ['iron']
  );
  const younger = armA.systems.find((system) => system.id === 'sys-b');
  assert.deepEqual(
    younger.essenceDefinitions.map((row) => row.id),
    ['iron']
  );
  assert.deepEqual(younger.components[0].essences, { iron: 1 });
  assert.equal(
    armA.gatheringConfig.systems['sys-b'].tools[0].repairRequirements[0].options[0].match.essenceId,
    'iron'
  );
});

// ---------------------------------------------------------------------------
// DETERMINISM AND SURVIVOR ELECTION — set-equality is NOT sufficient
// ---------------------------------------------------------------------------

/** A Fisher-Yates shuffle from the SEEDED generator, never `Math.random` (SonarCloud S2245). */
function shuffled(list, random) {
  const copied = [...list];
  for (let index = copied.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    const held = copied[index];
    copied[index] = copied[swap];
    copied[swap] = held;
  }
  return copied;
}

/** The survivor one corpus elects, read off the map the transform actually produced. */
function survivorOf(corpus) {
  const map = mergeEquivalentWorldEssences(payloadOf(corpus)).worldEssenceMergeMap;
  const survivors = new Set(Object.values(unionOf(map)));
  assert.equal(survivors.size, 1, 'the premise: this corpus elects exactly one survivor');
  return [...survivors][0];
}

test('election re-derives CORPUS POSITION even when the persisted array order contradicts it', () => {
  // SET-EQUALITY IS NOT SUFFICIENT AND NEITHER IS A FRESHLY DERIVED CORPUS. A set-equal partition
  // holds under EVERY election rule, including the `essenceScope.entities[0]` rule the design
  // rejects — and `derive()` emits entities already sorted by corpus position, so on a freshly
  // derived corpus array order and corpus order COINCIDE and swapping one rule for the other is
  // invisible. This corpus stores the eventual LOSER at index 0 and the SURVIVOR LAST, so the two
  // rules answer differently and only one of them can be right.
  const contradictory = buildEssenceMergeCorpus({
    systems: [
      { id: 'sys-a', essences: [{ id: MINTED_B, name: 'Iron' }] },
      { id: 'sys-b', essences: [{ id: MINTED_C, name: 'Iron' }] },
    ],
    entityOrder: [MINTED_C, MINTED_B],
  });
  assert.deepEqual(
    contradictory.essenceScope.entities.map((entity) => entity.id),
    [MINTED_C, MINTED_B],
    'the premise: the stored array really does lead with the eventual loser'
  );
  assert.equal(
    survivorOf(contradictory),
    MINTED_B,
    'the OLDEST CORPUS POSITION wins; `entities[0]` is the FINAL tie-break and never the first'
  );
});

test('an independently shuffled corpus elects the IDENTICAL survivor, not merely a set-equal one', () => {
  // Permutation invariance is only claimable where the CORPUS decides the election — here the
  // readable slug does, which is order-independent by construction. Where corpus position decides
  // it, order dependence is the DECLARED exception the arm above pins instead.
  const random = seededRandom(16_540_812);
  const build = () =>
    buildEssenceMergeCorpus({
      systems: [
        { id: 'sys-a', essences: [{ id: MINTED_B, name: 'Iron' }] },
        { id: 'sys-b', essences: [{ id: MINTED_C, name: 'Iron' }] },
        { id: 'sys-c', essences: [{ id: 'iron', name: 'Iron' }] },
      ],
    });
  const baseline = survivorOf(build());
  assert.equal(
    baseline,
    'iron',
    'the premise: the readable slug is elected from the YOUNGEST system'
  );
  for (let iteration = 0; iteration < 8; iteration += 1) {
    const corpus = build();
    corpus.systems = shuffled(corpus.systems, random);
    for (const system of corpus.systems) {
      system.essenceDefinitions = shuffled(system.essenceDefinitions, random);
    }
    corpus.essenceScope.entities = shuffled(corpus.essenceScope.entities, random);
    assert.equal(
      survivorOf(corpus),
      baseline,
      `iteration ${iteration}: the elected survivor must not depend on any array order`
    );
  }
});

test('the READABLE SLUG is consulted FIRST, so a merge never retires `iron` for a minted id', () => {
  // Pinned separately because it precedes corpus position: without it the arm above would elect
  // `MINTED_B` from `sys-a` and still be permutation-invariant, which is why a shuffle test alone
  // cannot state this. The three slug RANKS themselves — bare stem, `<stem>-<n>`, anything else —
  // are pinned by `world-essence-equivalence.test.js`.
  const corpus = buildEssenceMergeCorpus({
    systems: [
      { id: 'sys-a', essences: [{ id: MINTED_B, name: 'Iron' }] },
      { id: 'sys-b', essences: [{ id: 'iron', name: 'Iron' }] },
    ],
  });
  assert.equal(survivorOf(corpus), 'iron');
});

// ---------------------------------------------------------------------------
// IDEMPOTENCE ON BOTH RE-RUN PATHS
// ---------------------------------------------------------------------------

test('idempotence (i): with the map PERSISTED, `migrate(migrate(x))` deep-equals `migrate(x)`', () => {
  // THIS ARM IS A NO-OP BY DISJOINTNESS ALONE AND PROVES NOTHING ABOUT THE EQUIVALENCE KEY. The
  // persisted map's image is disjoint from its key set, so a second simultaneous lookup finds no
  // key at all — whatever the canonicalisation does. It is pinned because it is the path a
  // same-boot re-entry takes, not because it is the strong one; arm (ii) is the strong one.
  const corpus = convergingReferences();
  const first = mergeEquivalentWorldEssences(payloadOf(corpus));
  const second = mergeEquivalentWorldEssences({ ...payloadOf(corpus), ...first });
  for (const key of PAYLOAD_KEYS) {
    assert.deepEqual(second[key], first[key], `${key} is byte-identical on the second pass`);
    assert.equal(second[key], first[key], `${key} answers the ORIGINAL object on the second pass`);
  }
});

test('idempotence (ii): with the map ABSENT, the re-derivation over merged data is a FIXED POINT', () => {
  // THE ONLY ARM THAT CAN CATCH A CANONICALISATION THAT IS NOT A FIXED POINT, and it is the state
  // a world actually occupies once the one-shot clear has fired (requirement 11): the per-system
  // legs are gone, the tombstone survives, and the next boot re-derives over ALREADY-MERGED data.
  // A key that canonicalised differently the second time round would merge the survivor into
  // something else here, with no persisted map to make the no-op happen for it.
  const corpus = convergingReferences();
  const first = mergeEquivalentWorldEssences(payloadOf(corpus));
  const cleared = {
    ...payloadOf(corpus),
    ...first,
    // The shape the clear leaves: the pairs gone, `retired` untouched.
    worldEssenceMergeMap: { systems: {}, retired: first.worldEssenceMergeMap.retired },
  };
  const second = mergeEquivalentWorldEssences(cleared);
  assert.deepEqual(
    second._worldEssenceMergeReport.mergedGroups,
    [],
    'the re-derivation finds NOTHING left to merge'
  );
  for (const leg of ['refusals', 'declined', 'orphaned']) {
    assert.deepEqual(second._worldEssenceMergeReport[leg], [], `and NO ${leg} row is produced`);
  }
  assert.deepEqual(
    second.worldEssenceMergeMap.systems,
    {},
    'the DERIVED map is EMPTY, so the clear is not undone by the very next boot'
  );
  assert.deepEqual(
    second.worldEssenceMergeMap.retired,
    first.worldEssenceMergeMap.retired,
    'and the tombstone leg survives the clear (requirement 17)'
  );
  for (const key of ['systems', 'recipes', 'gatheringConfig', 'essenceScope', 'componentScope']) {
    assert.deepEqual(second[key], first[key], `${key} is unchanged by the map-less re-run`);
    assert.equal(second[key], cleared[key], `and ${key} answers the caller's OWN object`);
  }
});

// ---------------------------------------------------------------------------
// A MEASURED FINDING, recorded rather than asserted away
// ---------------------------------------------------------------------------

test('requirement 8 freezes the MEMBERSHIP RECORD, and the READ UNION does not follow it', () => {
  // THIS IS A CORRECTION TO THE ACCEPTANCE RECORD, not a new claim, and it is the reason this file
  // reads through `resolveEssenceScope` rather than through `resolveEssence`.
  //
  // Requirement 8 makes a re-pointed INHERITING record fully overriding on the section it was
  // inheriting, and at the SCOPE layer that is exactly behaviour-neutral: `resolveEssence` answers
  // the frozen value, which is the value the record resolved to before the re-key.
  //
  // The PRODUCTION READ is one layer further out. While `## CraftingSystem` requirement 36 holds,
  // `unionScopedDefinitions` re-spreads the IN-SYSTEM record LAST and then writes the world
  // default onto the row ONLY for a section the membership record still marks INHERITING
  // (`applyInheritedSections`). So the very act of freezing the switch to `false` stops the row
  // taking the frozen value, and the row falls back to whatever the in-system record carries.
  //
  // The pre-state is production-reachable: `worldScopeActions.setSectionInherited` flips the
  // membership switch alone and never touches `essenceDefinitions[].propertyMacroUuid`, which is
  // the documented opt-in. And the field is load-bearing:
  // `CraftingEngine._runEssencePropertyMacros` reads `definition.propertyMacroUuid` off
  // `resolvedEssencesFor`, which is this very union.
  //
  // It is MEASURED here rather than asserted away, and it is NOT locked in: the arm states both
  // halves separately, so a fix that teaches the union to follow a frozen section turns exactly
  // the second assertion red and leaves the first green.
  const corpus = buildEssenceMergeCorpus({
    systems: [
      { id: 'sys-a', essences: [{ id: 'iron', name: 'Iron', macro: 'Macro.forge' }] },
      {
        id: 'sys-b',
        essences: [
          { id: MINTED_B, name: 'Iron', inherit: { macro: true }, omitSections: ['macro'] },
        ],
      },
    ],
    worldDefaults: { [MINTED_B]: { macro: 'Macro.forge' } },
  });
  const before = readResolvedWorld(corpus);
  assert.equal(
    before[`sys-b|essence|${MINTED_B}`].propertyMacroUuid,
    'Macro.forge',
    'BEFORE: the inheriting record makes the union answer the WORLD default'
  );

  const result = mergeEquivalentWorldEssences(payloadOf(corpus));
  // HALF ONE — the scope layer, which requirement 8 is written about, is neutral.
  assert.deepEqual(
    result.essenceScope.membership['iron|sys-b'],
    {
      entityId: 'iron',
      systemId: 'sys-b',
      inherit: { effectSource: false, macro: false },
      enabled: true,
      effectSource: { sourceComponentId: null },
      macro: 'Macro.forge',
    },
    'the frozen record carries the value it resolved to through the parent it LEFT'
  );

  // HALF TWO — THE DIVERGENCE. The union now answers the in-system record's own `null`.
  const after = readResolvedWorld(corpusOf(result));
  assert.equal(
    after['sys-b|essence|iron'].propertyMacroUuid,
    null,
    'MEASURED: the read union does NOT follow a frozen section, so the macro stops running'
  );

  // AND THE CONTRAST that bounds it: a record whose IN-SYSTEM row already carried the same value
  // is wholly unaffected, which is every record `1.30.0` itself created.
  const overriding = buildEssenceMergeCorpus({
    systems: [
      { id: 'sys-a', essences: [{ id: 'iron', name: 'Iron', macro: 'Macro.forge' }] },
      { id: 'sys-b', essences: [{ id: MINTED_B, name: 'Iron', macro: 'Macro.forge' }] },
    ],
  });
  const overridden = mergeEquivalentWorldEssences(payloadOf(overriding));
  assert.deepEqual(
    behaviourDifferences(
      copy(payloadOf(overriding)),
      corpusOf(overridden),
      unionOf(overridden.worldEssenceMergeMap)
    ),
    [],
    'an ALREADY-OVERRIDING record — which is every record `1.30.0` wrote — is untouched'
  );
});

// ---------------------------------------------------------------------------
// ANTI-VACUITY — the oracle has to actually see something
// ---------------------------------------------------------------------------

test('the differential oracle reads a NON-TRIVIAL number of sites, and every site class', () => {
  // A clean differential over an empty projection is the same clean pass as one over a full
  // corpus, so the population is pinned rather than assumed.
  const sites = readResolvedWorld(payloadOf(convergingReferences()));
  const paths = Object.keys(sites);
  assert.ok(paths.length >= 15, `the oracle must see the corpus (${paths.length} sites)`);
  for (const [label, pattern] of [
    ['the resolved essence rows', /\|essence\|/],
    ['the in-system component quantity maps', /\|components\[\d+]\.essences$/],
    ['the derived system roster', /\|roster$/],
    ['a system-slice tool repair requirement', /\|tools\[\d+]\..*\.essenceId$/],
    ['a recipe leaf, inside `alternatives[]`', /\|recipe\..*alternatives\[\d+]\.match\.essenceId$/],
    ['a recipe leaf, inside `steps[]`', /\|recipe\..*\.steps\[\d+]\..*\.essenceId$/],
    ['the legacy per-set quantity map', /\|recipe\..*\.ingredientSets\[\d+]\.essences$/],
    ['the flat `ingredients[]` alias', /\|recipe\..*\.ingredients\[\d+]\.match\.essenceId$/],
    ['the gathering slice', /\|gathering\./],
    ['the world component defaults map', /^world\|componentDefaults\./],
    ['the world component membership map', /^world\|componentMembership\./],
  ]) {
    assert.ok(
      paths.some((path) => pattern.test(path)),
      `the oracle must reach ${label}`
    );
  }
});
