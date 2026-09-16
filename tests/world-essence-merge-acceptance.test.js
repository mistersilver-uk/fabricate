/**
 * End-to-end acceptance for the `1.34.0` equivalent world essence merge (issue 1654).
 *
 * The criterion no unit suite answers: every system's resolved behaviour is identical before and
 * after, except what the report names. Each unit suite pins one module against its own expected
 * output — `world-essence-equivalence.test.js` the decision,
 * `world-essence-merge-migration.test.js` the write, `world-scope-reference-walk.test.js` the site
 * list — and nothing there composes them.
 *
 * The oracle is the production read union, not the migration's output. {@link readResolvedWorld}
 * resolves every system's essences through `resolveEssenceScope`, the call
 * `resolveScopedEntityRead` makes for `essenceDefinitions`, and collects essence-bearing sites
 * through a walk independent of the shared rewrite's own site list, so deleting a site from that
 * list cannot delete it from the oracle too. The before projection is canonicalised through the map
 * the migration actually produced, so a successful re-key is invisible and a missed one is a
 * difference; key-position collisions sum on both sides.
 *
 * The eight scenarios are data rows over {@link runScenario}: `tests/**` counts against the
 * SonarCloud new-code duplication gate, and eight near-identical bodies is how that gate goes red.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { mergeEquivalentWorldEssences } from '../src/migration/mergeEquivalentWorldEssences.js';
import { migrateWorldScopeEntities } from '../src/migration/migrateWorldScopeEntities.js';
import { buildWorldEssenceEquivalence } from '../src/migration/worldEssenceEquivalence.js';
import { ESSENCE_SECTIONS, resolveEssenceScope } from '../src/systems/essenceScope.js';

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
 * Three `crypto.randomUUID()`-shaped ids, which is what `adminStore.addEssence` mints and therefore
 * the commonest thing this pass retires.
 *
 * None is slug-shaped for any name used below, so `slugRank` cannot decide an election between two
 * of them and corpus position has to answer — which is what scenario 8 measures.
 *
 * All lowercase, because `_normalizeEssenceDefinition` lowercases every id it emits: a mixed-case
 * fixture would arrive at `1.34.0` under a different id once {@link chainedThroughOneThirty} passed
 * it through `_normalizeSystem`, as production does.
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

/** The world-wide loser-to-survivor lookup, unioned from the per-system legs of a produced map. */
function unionOf(mergeMapSetting) {
  const union = {};
  for (const legs of Object.values(mergeMapSetting?.systems ?? {})) {
    Object.assign(union, legs.essences ?? {});
  }
  return union;
}

// ---------------------------------------------------------------------------
// The oracle — the production read union, plus an independent site walk
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
 * Every essence-bearing site in a subtree, path-keyed, through a generic walk.
 *
 * It visits every leaf named `essenceId` and every `essences` member in its quantity-map form and
 * in the derived `systems[].essences[]` id-array form, and nowhere else: `inherit.essences` is a
 * boolean section switch keyed by section name, so `isQuantityMap` declines it and the walk
 * descends past it — the same distinction `rewriteEssenceQuantityMap` makes, arrived at
 * independently.
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
 * What every system resolves, and every site that names an essence.
 *
 * The essence rows come from `resolveEssenceScope` against the corpus a real store publishes, so
 * the three-layer resolution, requirement 36's in-system re-spread and `applyInheritedSections` all
 * run as they do in production; a hand-rolled read of the membership record would be blind to all
 * three.
 *
 * @param {object} corpus `{systems, recipes, gatheringConfig, essenceScope, componentScope}`
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
    // The derived roster is an id array rather than a member of an object, so it is recorded
    // directly: the walk above only sees an `essences` key it descends onto.
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
 * Rewrite every retired id a projection carries: in its key, in a leaf value, in an id array, and
 * in quantity-map key position, where a collision sums.
 *
 * Applied to the before leg alone. The after leg needs none — the map's image is disjoint from its
 * key set, which `world-essence-equivalence.test.js` pins outright, so canonicalising it would be
 * the identity.
 *
 * @param {{[loserId: string]: string}} remap
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
 * The differences the merge made to what the world resolves, as sorted `path` strings.
 *
 * A site that vanished or appeared is reported too, under an explicit prefix, because an absence
 * compared against an absence is the one shape a naive deep-equal reads as agreement.
 *
 * @param {{[loserId: string]: string}} remap
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
// The one assertion helper
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

  // 1. The report — what a GM is told, which is the whole of the exception clause.
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

  // 2. The surviving world roster, in the stored array's own order minus the retired rows.
  assert.deepEqual(
    result.essenceScope.entities.map((entity) => entity.id),
    row.entities,
    `${where}: surviving world essences`
  );

  // 3. The membership map — one record per system on the survivor, none dropped.
  assert.deepEqual(membershipIndex(result.essenceScope), row.members, `${where}: membership`);

  // 4. Requirement 8, over every record this pass re-pointed: a section it was inheriting is now
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

  // 5. A corpus with nothing to merge answers the caller's own object, so the runner's per-setting
  //    JSON comparison declines to write the leg at all.
  if (row.untouched) {
    for (const key of PAYLOAD_KEYS) {
      assert.equal(result[key], data[key], `${where}: ${key} must answer the caller's OWN object`);
    }
  }

  // 6. The differential — the criterion the unit suites cannot state.
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
 * Scenario 5's payload-ready corpus: three systems whose references all converge on one migrated
 * world essence, carrying every site class the shared walk covers.
 *
 * The three shapes `buildEssenceMergeCorpus` cannot express — a recipe, a gathering slice and an
 * in-system component's essence quantity map — are attached to what it returns rather than built by
 * a second factory that would duplicate it.
 */
function convergingReferences() {
  const corpus = buildEssenceMergeCorpus({
    systems: [
      { id: 'sys-a', essences: [{ id: 'iron', name: 'Iron' }] },
      { id: 'sys-b', essences: [{ id: MINTED_B, name: 'Iron' }], components: [{ id: 'comp-b' }] },
      { id: 'sys-c', essences: [{ id: MINTED_C, name: 'Iron' }] },
    ],
  });
  // Key-position family 1 — `systems[].components[].essences`, the sharpest of the four: a missed
  // key here is a silent deletion on the next save, not a dangling reference a reader can report.
  corpus.systems[1].components = [
    { id: 'comp-b', name: 'Ore', essences: { [MINTED_B]: 2, iron: 1 } },
  ];
  corpus.systems[2].components = [{ id: 'comp-c', name: 'Ore', essences: { [MINTED_C]: 4 } }];
  // The derived roster `_normalizeSystem` re-mints, which is read long before the next save.
  for (const system of corpus.systems) {
    system.essences = system.essenceDefinitions.map((definition) => definition.id);
  }
  // Leaf sites in the system slice, at the option and at its `alternatives[]` recursion.
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
  // Key-position families 2 and 3 — the two world-scope component maps.
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
            // Key-position family 4, depth 1 — the legacy per-set quantity map.
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
            // The flat `ingredients[]` alias `IngredientSet.toJSON` stopped emitting.
            ingredients: [{ quantity: 1, match: { type: 'essence', essenceId: MINTED_B } }],
          },
        ],
        steps: [
          {
            id: 'st-1',
            ingredientSets: [
              {
                id: 'sis-1',
                // Key-position family 4, depth 2 — the same map under a step.
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
 * Scenario 6's payload-ready corpus: a world already through `1.30.0`, produced by running the
 * shipped `1.30.0` pass over a raw pre-migration corpus rather than by hand.
 *
 * Two systems' "Iron" arrive under unrelated ids — the `crypto.randomUUID()` authoring route — so
 * `1.30.0` groups them by trimmed `id`, lifts two world essences, and leaves behind the duplication
 * issue 1654 reports. A gathering slice is attached because `buildRawCorpus` authors none, and
 * without one the `gatheringConfig` tear below is invisible: a leg with nothing in it to re-key
 * cannot be observed as un-landed.
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
 * A torn world: the writeback legs in `landed` carry the `1.34.0` values and every other leg still
 * carries its pre-merge one.
 *
 * `worldEssenceMergeMap` is always landed because it is the second leg — written after
 * `worldScopeRekeyMap` and before `recipes` — the ordering requirement 10 takes so that a tear
 * anywhere downstream is recoverable.
 *
 * @param {object} baseline The pre-merge payload.
 * @param {object} untorn The complete `1.34.0` result.
 * @param {string[]} landed The legs that reached disk.
 */
function tornPayload(baseline, untorn, landed) {
  const payload = { ...baseline, worldEssenceMergeMap: untorn.worldEssenceMergeMap };
  for (const key of landed) payload[key] = untorn[key];
  return payload;
}

// ---------------------------------------------------------------------------
// The eight scenarios, as data
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
    // Not `declined`: the two systems disagree across two world essences, which is two different
    // keys and therefore no group at all. `declined` is reserved for a disagreement inside one
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
            // `member: false` is the refusal: `partition` excludes a refused `(system,
            // 'components')` pair outright, so `1.30.0` wrote no membership record for it and the
            // essence still carries a raw system-local id.
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
          // `sys-a` inherits its macro from W1's world default; `sys-b` overrides with the same
          // value. Unanimity therefore has to read both records, and the row below proves it does.
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
    // Slug preference is consulted first, so the readable `iron` wins from the youngest system.
    merged: [{ survivorId: 'iron', loserIds: [MINTED_B], systemIds: ['sys-a', 'sys-b', 'sys-c'] }],
    entities: ['iron'],
    members: { iron: ['sys-a', 'sys-b', 'sys-c'] },
    // No declared difference: `sys-a` was inheriting its macro, so requirement 8 freezes it at
    // both scopes and the read union answers `Macro.forge` before and after.
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
      // And the in-system half, which is what makes the row carry no declared difference: `sys-a`
      // alone was inheriting, so `sys-a` alone is written and reported.
      assert.deepEqual(result._worldEssenceMergeReport.inSystemFreezes, [
        { systemId: 'sys-a', essenceId: 'iron', sections: ['macro'] },
      ]);
      assert.equal(
        result.systems.find((system) => system.id === 'sys-a').essenceDefinitions[0]
          .propertyMacroUuid,
        'Macro.forge',
        'the in-system row carries the frozen value, which is the field the union answers from'
      );
    },
  },
  {
    name: '8: unanimity is evaluated over BOTH records of the multi-member essence',
    corpus: () =>
      buildEssenceMergeCorpus({
        systems: [
          { id: 'sys-a', essences: [{ id: MINTED_B, name: 'Iron', macro: 'Macro.forge' }] },
          // Only the second record disagrees. A unanimity walk that read `members[0]` alone would
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
// Scenario 5's destructive regression, with its negative control
// ---------------------------------------------------------------------------

/**
 * The component key-position rewrite is not optional, and a positive assertion cannot say so.
 *
 * `_normalizeEssenceQuantities` prunes a key only when `_scopeBasis().essenceIds` is a `Set`, and
 * `_scopeEntityBasis` answers `null` — prune nothing — unless the store reports
 * `isSeeded('entities')` or the system's `essenceDefinitions` array is non-empty. So a round trip
 * through a bare manager over an emptied system keeps every key and the positive assertion passes
 * with the prune disarmed; and because the basis is a union, a run that missed the
 * `essenceDefinitions` re-key too would put the retired id back in the basis and hide the loss.
 *
 * Hence three steps, in this order: (a) the basis is armed and the retired id is genuinely outside
 * it; (b) the positive — every quantity survives under the survivor key, summed; (c) the negative
 * control — the same corpus with the component key-position rewrite withheld loses exactly that
 * quantity, silently and permanently, because the normalizer is an allowlist rebuild.
 */
function assertNoSilentQuantityDeletion({ result }) {
  const merged = corpusOf(result);
  const system = merged.systems[1];

  // (a) Armed, through a manager wired to the real seeded store rather than a bare one.
  const manager = makeManagerWithScope(CraftingSystemManager, merged);
  const basis = manager._scopeBasis(system).essenceIds;
  assert.ok(basis instanceof Set, 'the prune is ARMED: a null basis prunes NOTHING');
  assert.ok(basis.has('iron'), 'and the survivor is in it');
  assert.ok(
    !basis.has(MINTED_B),
    'and the RETIRED id is outside it, which is what makes a missed key a deletion'
  );

  // (b) The positive. `{[MINTED_B]: 2, iron: 1}` became `{iron: 3}` before the save, so the save
  // keeps all three units.
  assert.deepEqual(
    manager._normalizeSystem(system).components[0].essences,
    { iron: 3 },
    'every quantity survives the real normalize-and-save seam under the survivor key'
  );

  // (c) The negative control. Only the component quantity map is rewound; the definition re-key,
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
// Scenario 6's tears, chosen for direction rather than for convenience
// ---------------------------------------------------------------------------

/**
 * The writeback order is `worldScopeRekeyMap` -> `worldEssenceMergeMap` -> `recipes` -> ... ->
 * `componentScope` -> `essenceScope` -> `toolScope` -> `craftingSystems` -> `gatheringConfig`.
 *
 * The three tears pinned here can each fail:
 *
 *  (a) only the merge map landed — the likeliest tear there is, because the map is the second
 *      writeback leg and every other leg is downstream of it, so the pass runs through
 *      `reusingPersistedMap` against wholly un-merged data, the one path on which the persisted map
 *      is the sole source of truth;
 *  (b) `componentScope` landed and `essenceScope` did not — the re-run must reconcile rather than
 *      double-apply the map to component maps that are already re-keyed;
 *  (c) `craftingSystems` landed and `gatheringConfig` did not — the re-run must rewrite the
 *      gathering slice from the persisted map, because re-deriving one from already-re-keyed
 *      systems answers empty, the failure `migrateWorldScopeEntities.js` records for `1.30.0` in
 *      its "a torn run may already have re-keyed `craftingSystems`" note.
 *
 * "`essenceScope` landed, `craftingSystems` did not" is not among them: the basis union still
 * vouches for the loser id through the legacy `essenceDefinitions` array, so the prune hazard
 * cannot fire. It is not safe against the freeze hazard, pinned as an accepted bound by its own
 * test.
 */
function assertTearRecovery({ before, result }) {
  const RECOVERED = ['systems', 'recipes', 'gatheringConfig', 'essenceScope', 'componentScope'];
  const tears = [
    ['only the merge map landed', []],
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

  // The premise of tear (b), which is what makes it a test of the persisted map rather than of the
  // derivation: with the map withheld there is nothing left in the corpus to re-derive from.
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
// Scenario 6(i) — the chain, and what deep-equality there actually proves
// ---------------------------------------------------------------------------

test('acceptance 6: the `1.30.0`-then-`1.34.0` chain equals `1.34.0` alone on a persisted world', () => {
  // `1.34.0`'s answer is a function of the persisted state alone. Arm B starts from a JSON round
  // trip of `1.30.0`'s output — what the next boot reads back out of `game.settings` — so it
  // carries no object identity, no prototype, no non-JSON value and no in-memory
  // `worldScopeRekeyMap` from the pass that produced it.
  const chained = chainedThroughOneThirty();
  const armA = mergeEquivalentWorldEssences(payloadOf(chained));
  const armB = mergeEquivalentWorldEssences(payloadOf(copy(chained)));
  // The premise, because two arms that both merged nothing are deep-equal for no good reason.
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

  // And the end-to-end fact both arms share, which is what stops this being a pure tautology: a
  // raw pre-`1.30.0` world reaches one world essence, and the younger system's definition row, its
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
// Determinism and survivor election — set-equality is not sufficient
// ---------------------------------------------------------------------------

/** A Fisher-Yates shuffle from the seeded generator, never `Math.random` (SonarCloud S2245). */
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
  // Set-equality is not sufficient, and neither is a freshly derived corpus: a set-equal partition
  // holds under every election rule, including the `essenceScope.entities[0]` rule the design
  // rejects, and `derive()` emits entities already sorted by corpus position, so on a freshly
  // derived corpus array order and corpus order coincide and swapping one rule for the other is
  // invisible. This corpus stores the eventual loser at index 0 and the survivor last, so the two
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
  // Permutation invariance is only claimable where the corpus decides the election — here the
  // readable slug does, which is order-independent by construction. Where corpus position decides
  // it, order dependence is the declared exception the arm above pins instead.
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
  // cannot state this. The three slug ranks themselves — bare stem, `<stem>-<n>`, anything else —
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
// Idempotence on both re-run paths
// ---------------------------------------------------------------------------

test('idempotence (i): with the map PERSISTED, `migrate(migrate(x))` deep-equals `migrate(x)`', () => {
  // This arm is a no-op by disjointness alone and proves nothing about the equivalence key: the
  // persisted map's image is disjoint from its key set, so a second simultaneous lookup finds no
  // key at all, whatever the canonicalisation does. It is pinned because it is the path a same-boot
  // re-entry takes, not because it is the strong one; arm (ii) is the strong one.
  const corpus = convergingReferences();
  const first = mergeEquivalentWorldEssences(payloadOf(corpus));
  const second = mergeEquivalentWorldEssences({ ...payloadOf(corpus), ...first });
  for (const key of PAYLOAD_KEYS) {
    assert.deepEqual(second[key], first[key], `${key} is byte-identical on the second pass`);
    assert.equal(second[key], first[key], `${key} answers the ORIGINAL object on the second pass`);
  }
});

test('idempotence (ii): with the map ABSENT, the re-derivation over merged data is a FIXED POINT', () => {
  // The only arm that can catch a canonicalisation that is not a fixed point, and it is the state
  // a world actually occupies once the one-shot clear has fired (requirement 11): the per-system
  // legs are gone, the tombstone survives, and the next boot re-derives over already-merged data. A
  // key that canonicalised differently the second time round would merge the survivor into
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
// Requirement 8 at the read seam — the only place a GM can observe it
// ---------------------------------------------------------------------------

/**
 * One corpus per essence section, in which `sys-b` inherits that section from the loser's world
 * default and `sys-a` overrides it with the same value, so the two are equivalent and merge.
 *
 * Keyed by section and driven by {@link ESSENCE_SECTIONS} below, which makes this a guard over the
 * whole rule rather than over `macro`. The section names name nothing on the in-system record —
 * `macro` is spelled `propertyMacroUuid`, `effectSource` is a block over three fields — so the
 * migration's write is a projection, and a projection onto the wrong field name is the mistake a
 * key-set comparison cannot see; reading the answer back through the real union catches it.
 *
 * The `effectSource` block spells all three fields, matching what `rawEssence` puts on an in-system
 * row carrying a source: a partial block compares unequal at the canonical key, the group never
 * merges, and the test measures nothing.
/** One projection of {@link UNION_FIELDS} off any essence-shaped record, absence reading as null. */
const unionFieldsOf = (row) =>
  Object.fromEntries(UNION_FIELDS.map((field) => [field, row?.[field] ?? null]));

const INHERITED_SECTION_FIXTURES = Object.freeze({
  macro: () =>
    buildEssenceMergeCorpus({
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
    }),
  effectSource: () =>
    buildEssenceMergeCorpus({
      systems: [
        {
          id: 'sys-a',
          essences: [{ id: 'iron', name: 'Iron', sourceComponentId: 'comp-x' }],
          components: [{ id: 'comp-x' }],
        },
        {
          id: 'sys-b',
          essences: [
            {
              id: MINTED_B,
              name: 'Iron',
              inherit: { effectSource: true },
              omitSections: ['effectSource'],
            },
          ],
          components: [{ id: 'comp-x' }],
        },
      ],
      worldDefaults: {
        [MINTED_B]: {
          effectSource: {
            sourceComponentId: 'comp-x',
            sourceItemUuid: 'comp-x',
            associatedSystemItemId: 'comp-x',
          },
        },
      },
    }),
});

test('requirement 8 freezes the MEMBERSHIP RECORD **and** the IN-SYSTEM ROW, so the READ UNION follows', () => {
  // The membership freeze alone is behaviour-neutral at the scope layer — `resolveEssence` answers
  // the frozen value — and inverts one layer further out, which is why this file reads through
  // `resolveEssenceScope`. While `## CraftingSystem` requirement 36 holds, `unionScopedDefinitions`
  // spreads the in-system record last and writes the world default onto the row only for a section
  // the membership record still marks inheriting (`applyInheritedSections`'s `=== false` guard), so
  // flipping the switch to `false` is the very act that stops the row taking the frozen value and a
  // record that authored nothing of its own falls back to its own `propertyMacroUuid: null`.
  //
  // The pre-state is production-reachable — `worldScopeActions.setSectionInherited` flips the
  // membership switch alone and never touches `essenceDefinitions[].propertyMacroUuid` — and the
  // field is load-bearing: `CraftingEngine._runEssencePropertyMacros` reads
  // `definition.propertyMacroUuid` off `resolvedEssencesFor`, which is this union, so the property
  // macro silently stops running for that system and the same mechanism drops Active Effect
  // transfer for the three `effectSource` fields. Both halves of the freeze are asserted separately
  // below, because they answer to different consumers.
  for (const section of ESSENCE_SECTIONS) {
    const build = INHERITED_SECTION_FIXTURES[section];
    assert.ok(
      build,
      `every section ESSENCE_SECTIONS declares needs a fixture here; ${section} has none`
    );
    const corpus = build();
    const frozen = copy(corpus.essenceScope.defaults[MINTED_B][section]);
    const before = readResolvedWorld(corpus);
    // The premise, per section, and the sharp one: the union's answer for `sys-b` is not what that
    // system's own in-system row carries, so the row is reading through the world default and there
    // is something for the re-key to break.
    const inSystemRow = corpus.systems[1].essenceDefinitions[0];
    assert.notDeepEqual(
      unionFieldsOf(inSystemRow),
      unionFieldsOf(before[`sys-b|essence|${MINTED_B}`]),
      `${section}: the inheriting row must answer something its OWN record does not carry`
    );

    const result = mergeEquivalentWorldEssences(payloadOf(corpus));
    assert.equal(
      result._worldEssenceMergeReport.mergedGroups.length,
      1,
      `${section}: the premise — the two equivalent essences really did merge`
    );

    // Half one — the scope layer, which `resolveEssence` and the world catalogue's per-system rows
    // answer from. Unchanged by this fix.
    const record = result.essenceScope.membership['iron|sys-b'];
    assert.equal(record.inherit[section], false, `${section}: the switch is FLIPPED`);
    assert.deepEqual(
      record[section],
      frozen,
      `${section}: the frozen record carries the value it resolved to through the parent it LEFT`
    );

    // Half two — the read seam, which half one is structurally blind to: teaching the merge to
    // write the in-system row turns this green while leaving half one exactly as it was.
    const after = readResolvedWorld(corpusOf(result));
    for (const field of UNION_FIELDS) {
      assert.deepEqual(
        after['sys-b|essence|iron'][field] ?? null,
        before[`sys-b|essence|${MINTED_B}`][field] ?? null,
        `${section}: the union must answer ${field} identically before and after the merge`
      );
    }

    // And the write is disclosed. It is a write to a row the GM authored, so it is named rather
    // than made silently — and it names `sys-b` alone, never the already-overriding `sys-a`.
    assert.deepEqual(
      result._worldEssenceMergeReport.inSystemFreezes,
      [{ systemId: 'sys-b', essenceId: 'iron', sections: [section] }],
      `${section}: the in-system write is reported`
    );
    assert.ok(
      inSystemRow !== result.systems[1].essenceDefinitions[0],
      `${section}: and the pass is non-mutating — the caller's own row was not written through`
    );
  }
});

test('an ALREADY-OVERRIDING record is untouched at BOTH scopes, which bounds the in-system write', () => {
  // The bound, and it is the whole of why writing an authored in-system row is admissible here:
  // every record `1.30.0` wrote through `buildMembershipRecord` is fully overriding, so the only
  // world exposed to either half of requirement 8 is one whose GM has since flipped a switch to
  // inheriting. A world that merely upgraded is byte-identical through the union.
  const overriding = buildEssenceMergeCorpus({
    systems: [
      { id: 'sys-a', essences: [{ id: 'iron', name: 'Iron', macro: 'Macro.forge' }] },
      { id: 'sys-b', essences: [{ id: MINTED_B, name: 'Iron', macro: 'Macro.forge' }] },
    ],
  });
  const before = copy(payloadOf(overriding));
  const overridden = mergeEquivalentWorldEssences(payloadOf(overriding));
  assert.equal(overridden._worldEssenceMergeReport.mergedGroups.length, 1, 'the premise: merged');
  assert.deepEqual(
    behaviourDifferences(before, corpusOf(overridden), unionOf(overridden.worldEssenceMergeMap)),
    [],
    'an ALREADY-OVERRIDING record — which is every record `1.30.0` wrote — is untouched'
  );
  assert.deepEqual(
    overridden._worldEssenceMergeReport.inSystemFreezes,
    [],
    'and NO in-system row is written, so the report has nothing to disclose'
  );
});

test('a section whose OLD world parent authored NOTHING leaves the in-system row alone', () => {
  // The opposite rule, right for the opposite reason. `applyInheritedSections` skips an `undefined`
  // world value, so a record inheriting a section its old parent never authored was already reading
  // its own in-system field, before the re-key and after it. The membership record still takes the
  // canonical empty, because an absent local section under `inherit: false` falls back to the
  // survivor's value; the in-system row takes nothing, because writing that same canonical empty
  // there would destroy the authored value and be the only behaviour change this pass made.
  const corpus = buildEssenceMergeCorpus({
    systems: [
      { id: 'sys-a', essences: [{ id: 'iron', name: 'Iron' }] },
      {
        id: 'sys-b',
        essences: [
          { id: MINTED_B, name: 'Iron', inherit: { macro: true }, omitSections: ['macro'] },
        ],
      },
    ],
  });
  // The premise: the world decided nothing, and the system authored a macro of its own.
  assert.deepEqual(corpus.essenceScope.defaults, {});
  corpus.systems[1].essenceDefinitions[0].propertyMacroUuid = 'Macro.own';
  const before = copy(payloadOf(corpus));

  const result = mergeEquivalentWorldEssences(payloadOf(corpus));
  assert.equal(result._worldEssenceMergeReport.mergedGroups.length, 1, 'the premise: merged');
  assert.deepEqual(
    behaviourDifferences(before, corpusOf(result), unionOf(result.worldEssenceMergeMap)),
    [],
    'the union answers `Macro.own` before and after, because it never followed the world here'
  );
  assert.equal(
    result.systems[1].essenceDefinitions[0].propertyMacroUuid,
    'Macro.own',
    "the system's OWN authored macro is not overwritten with the canonical empty"
  );
  assert.equal(
    result.essenceScope.membership['iron|sys-b'].macro,
    null,
    'while the MEMBERSHIP record still takes the canonical empty, so it cannot fall back to the survivor'
  );
  assert.deepEqual(result._worldEssenceMergeReport.inSystemFreezes, []);
});

// ---------------------------------------------------------------------------
// Anti-vacuity — the oracle has to actually see something
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

// ---------------------------------------------------------------------------
// The one tear the persisted map cannot repair — stated as an accepted bound
// ---------------------------------------------------------------------------

test('the FREEZE half of requirement 8 does not survive an `essenceScope`/`craftingSystems` tear', () => {
  // The direction the prune argument is silent about. `essenceScope` is written before
  // `craftingSystems`, and requirement 8's freeze lands in both: the membership record takes the
  // resolved value as an override, and the in-system row takes it on `propertyMacroUuid`. A tear
  // between those two writes lands the membership half alone.
  //
  // On the re-run nothing is re-pointed — the landed record already names the survivor, which is
  // not a key of the map — so `freezeInheritedSections` never runs and the in-system half never
  // lands. The union then answers the in-system row's own `propertyMacroUuid: null`, because
  // `applyInheritedSections` skips a section the record marks overriding, and the essence's
  // property macro silently stops for that system.
  //
  // It is accepted rather than repaired because a repair arm cannot exist: the torn state is
  // byte-indistinguishable from what `worldScopeActions.setSectionInherited` produces wherever a GM
  // flipped a switch and left the row alone, so an arm that wrote the membership value onto the row
  // would destroy that GM's authored field on every world that never tore.
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
  const before = payloadOf(corpus);
  const result = mergeEquivalentWorldEssences(copy(before));
  const rowOf = (systems) => systems.find((system) => system.id === 'sys-b').essenceDefinitions[0];

  assert.deepEqual(
    result._worldEssenceMergeReport.inSystemFreezes,
    [{ systemId: 'sys-b', essenceId: 'iron', sections: ['macro'] }],
    'the premise: an UNTORN run writes both halves and discloses the in-system one'
  );
  assert.equal(rowOf(result.systems).propertyMacroUuid, 'Macro.forge');

  const repaired = mergeEquivalentWorldEssences(
    tornPayload(before, result, ['recipes', 'componentScope', 'essenceScope'])
  );
  assert.deepEqual(
    repaired.essenceScope.membership['iron|sys-b'].macro,
    'Macro.forge',
    'the membership half survives, because it is what landed'
  );
  assert.deepEqual(
    repaired._worldEssenceMergeReport.inSystemFreezes,
    [],
    'and the re-run re-points nothing, so it re-freezes nothing'
  );
  assert.equal(
    rowOf(repaired.systems).propertyMacroUuid,
    null,
    'THE ACCEPTED BOUND: the in-system half is lost, and the union answers null for this system'
  );
  assert.equal(
    rowOf(repaired.systems).id,
    'iron',
    'the rewrite half still recovers, so the loss is bounded to the frozen VALUE'
  );
});
