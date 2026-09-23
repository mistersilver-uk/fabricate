/**
 * The `1.34.0` equivalent world essence merge transform (issue 1654). The write half only: what
 * `mergeEquivalentWorldEssences` does to a corpus once `buildWorldEssenceEquivalence` has decided.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { mergeEquivalentWorldEssences } from '../src/migration/mergeEquivalentWorldEssences.js';
import { MigrationRunner } from '../src/migration/MigrationRunner.js';

import { buildEssenceMergeCorpus, malformedCorpus } from './helpers/worldScopeCorpus.js';

/** A `crypto.randomUUID()`-shaped id, which is what `adminStore.addEssence` actually mints. */
const MINTED = 'kTz9QpLm2xR4vB1a';

/** An explicit string comparator, so a sort's order is stated rather than defaulted. */
const byCodePoint = (left, right) => (left < right ? -1 : Number(left > right));

/**
 * The world two systems' equivalent "Iron" leaves behind after `1.30.0` — the corpus this whole
 * change exists to repair.
 *
 * @param {object} [overrides] Extra `buildEssenceMergeCorpus` arguments.
 * @returns {object} `{systems, essenceScope, componentScope}`
 */
function twoIrons(overrides = {}) {
  return buildEssenceMergeCorpus({
    systems: [
      {
        id: 'sys-a',
        essences: [
          { id: 'iron', name: 'Iron' },
          { id: 'ash', name: 'Ash' },
        ],
      },
      { id: 'sys-b', essences: [{ id: MINTED, name: 'iron' }] },
    ],
    ...overrides,
  });
}

/** The runner payload one corpus makes, with the three keys the builder does not produce. */
function payloadOf(corpus, extra = {}) {
  return { recipes: [], gatheringConfig: {}, ...corpus, ...extra };
}

// Totality — a migration that throws aborts the whole pass

test('the transform is TOTAL and NON-THROWING on junk input', () => {
  for (const value of [undefined, null, 'nope', 7, []]) {
    assert.equal(mergeEquivalentWorldEssences(value), value);
  }
  const result = mergeEquivalentWorldEssences({
    systems: malformedCorpus().systems,
    recipes: 'nope',
    gatheringConfig: 5,
    essenceScope: { entities: [null, { id: '' }], defaults: 'nope', membership: 3 },
    componentScope: [],
    worldEssenceMergeMap: 'nope',
  });
  assert.deepEqual(result._worldEssenceMergeReport.mergedGroups, []);
  assert.deepEqual(
    result.worldEssenceMergeMap,
    'nope',
    'an unreadable map is left exactly as it is'
  );
});

// The merge itself, and the references it invalidates

test('the loser is retired, its members are re-pointed, and its world entity row is deleted', () => {
  const data = payloadOf(twoIrons());
  const result = mergeEquivalentWorldEssences(data);

  assert.deepEqual(
    result.essenceScope.entities.map((entity) => entity.id),
    ['iron', 'ash'],
    'the survivor and the unrelated essence remain; the loser row is GONE'
  );
  assert.deepEqual(Object.keys(result.essenceScope.membership).toSorted(byCodePoint), [
    'ash|sys-a',
    'iron|sys-a',
    'iron|sys-b',
  ]);
  assert.equal(result.essenceScope.membership['iron|sys-b'].entityId, 'iron');
  assert.deepEqual(result.worldEssenceMergeMap.systems, {
    'sys-b': { essences: { [MINTED]: 'iron' } },
  });
  // 8a: the survivor's world identity wins, and the in-system records keep their own.
  assert.equal(result.essenceScope.entities[0].name, 'Iron');
  assert.equal(result.systems[1].essenceDefinitions[0].name, 'iron');
});

test('the DEFINITION id and the DERIVED `system.essences` roster are both re-keyed', () => {
  const corpus = twoIrons();
  // `system.essences` is the alias `_normalizeSystem` re-mints from `essenceDefinitions`; it is
  // read long before the next save re-derives it.
  for (const system of corpus.systems) {
    system.essences = system.essenceDefinitions.map((definition) => definition.id);
  }
  const result = mergeEquivalentWorldEssences(payloadOf(corpus));
  assert.deepEqual(
    result.systems.map((system) => system.essenceDefinitions.map((row) => row.id)),
    [['iron', 'ash'], ['iron']]
  );
  assert.deepEqual(
    result.systems.map((system) => system.essences),
    [['iron', 'ash'], ['iron']]
  );
});

test('every reference class the shared walk covers moves, and colliding quantities SUM', () => {
  const corpus = twoIrons();
  // The three shapes `buildEssenceMergeCorpus` does not build, attached to the corpus it does.
  corpus.systems[1].components = [
    { id: 'comp-9', name: 'Ore', essences: { [MINTED]: 2, iron: 1, ash: 3 } },
  ];
  corpus.systems[1].tools = [
    {
      id: 'tool-9',
      name: 'Hammer',
      repairRequirements: [
        { id: 'ig-1', options: [{ quantity: 1, match: { type: 'essence', essenceId: MINTED } }] },
      ],
    },
  ];
  corpus.componentScope.defaults['comp-9'] = { id: 'comp-9', essences: { [MINTED]: 4 } };
  corpus.componentScope.membership['comp-9|sys-b'] = {
    entityId: 'comp-9',
    systemId: 'sys-b',
    inherit: { essences: false },
    essences: { [MINTED]: 5, iron: 5 },
  };
  // The fourth shape the builder does not build, and the one no derived fixture can hold: the tool
  // scope.
  corpus.toolScope = {
    entities: [{ id: 'tool-9', name: 'Hammer' }],
    defaults: {
      'tool-9': {
        id: 'tool-9',
        repairRequirements: [
          { id: 'ig-3', options: [{ quantity: 1, match: { type: 'essence', essenceId: MINTED } }] },
        ],
      },
    },
    membership: {
      'tool-9|sys-b': {
        entityId: 'tool-9',
        systemId: 'sys-b',
        repairRequirements: [
          { id: 'ig-4', options: [{ quantity: 1, match: { type: 'essence', essenceId: MINTED } }] },
        ],
      },
    },
  };
  const recipes = [
    {
      id: 'recipe-b',
      craftingSystemId: 'sys-b',
      ingredientSets: [
        {
          id: 'is-1',
          essences: { [MINTED]: 1, iron: 1 },
          ingredientGroups: [
            {
              id: 'ig-1',
              options: [{ quantity: 2, match: { type: 'essence', essenceId: MINTED } }],
            },
          ],
        },
      ],
    },
  ];
  const gatheringConfig = {
    systems: {
      'sys-b': {
        tools: [
          {
            id: 'tool-9',
            repairRequirements: [
              {
                id: 'ig-2',
                options: [{ quantity: 1, match: { type: 'essence', essenceId: MINTED } }],
              },
            ],
          },
        ],
      },
    },
  };

  const result = mergeEquivalentWorldEssences(payloadOf(corpus, { recipes, gatheringConfig }));

  // Key position, where a missed key is a silent deletion on the next save rather than a reportable
  // dangling reference — `_normalizeEssenceQuantities` prunes it.
  assert.deepEqual(result.systems[1].components[0].essences, { iron: 3, ash: 3 });
  assert.deepEqual(result.componentScope.defaults['comp-9'].essences, { iron: 4 });
  assert.deepEqual(result.componentScope.membership['comp-9|sys-b'].essences, { iron: 10 });
  assert.deepEqual(result.recipes[0].ingredientSets[0].essences, { iron: 2 });
  // Leaf position, in the system slice, the recipe and the gathering slice alike.
  assert.equal(result.systems[1].tools[0].repairRequirements[0].options[0].match.essenceId, 'iron');
  assert.equal(
    result.recipes[0].ingredientSets[0].ingredientGroups[0].options[0].match.essenceId,
    'iron'
  );
  assert.equal(
    result.gatheringConfig.systems['sys-b'].tools[0].repairRequirements[0].options[0].match
      .essenceId,
    'iron'
  );
  // Leaf position at tool scope, both halves.
  assert.equal(
    result.toolScope.membership['tool-9|sys-b'].repairRequirements[0].options[0].match.essenceId,
    'iron'
  );
  assert.equal(
    result.toolScope.defaults['tool-9'].repairRequirements[0].options[0].match.essenceId,
    'iron'
  );
});

test("a tool scope with nothing to re-key answers the CALLER'S OWN object", () => {
  // The identity contract the runner's per-setting JSON comparison rests on, at the key this pass
  // newly touches: a world with no merge must not have its tool scope rewritten, and an absent tool
  // scope must not be seeded with an empty payload — seeding one would hand `_scopeEntityBasis` a
  // known, empty basis, which is a licence to prune every tool reference.
  const corpus = buildEssenceMergeCorpus({
    systems: [{ id: 'sys-a', essences: [{ id: 'iron', name: 'Iron' }] }],
  });
  const toolScope = { entities: [], defaults: {}, membership: {}, toolBreakage: { enabled: true } };
  const merged = mergeEquivalentWorldEssences(payloadOf(corpus, { toolScope }));
  assert.equal(merged.toolScope, toolScope, 'the ORIGINAL object, not a re-serialized equal one');
  assert.equal(
    mergeEquivalentWorldEssences(payloadOf(corpus)).toolScope,
    undefined,
    'an absent tool scope stays absent rather than being seeded with an empty payload'
  );
});

test('a reference in a system the loser is NOT present in is left exactly as it is', () => {
  // Presence, not reachability: `sys-a` holds neither a membership record nor a definition row for
  // the loser, so its map has no leg.
  const corpus = twoIrons();
  corpus.systems[0].components = [
    { id: 'comp-1', name: 'Ore', essences: { [MINTED]: 9 } },
    { id: 'comp-2', name: 'Slag', essences: { [MINTED]: 9, iron: 4 } },
  ];
  const result = mergeEquivalentWorldEssences(payloadOf(corpus));
  assert.deepEqual(result.systems[0].components[0].essences, { [MINTED]: 9 });
  assert.deepEqual(result.systems[0].components[1].essences, { [MINTED]: 9, iron: 4 });
  assert.equal(result.worldEssenceMergeMap.systems['sys-a'], undefined);
});

// Pin 1 — the re-pointed inheriting record rule (requirement 8)

test('a re-pointed record inheriting `macro` with NO world default gets the CANONICAL EMPTY override', () => {
  const corpus = buildEssenceMergeCorpus({
    systems: [
      { id: 'sys-a', essences: [{ id: 'iron', name: 'Iron' }] },
      {
        id: 'sys-b',
        essences: [{ id: MINTED, name: 'Iron', inherit: { macro: true }, omitSections: ['macro'] }],
      },
    ],
  });
  // The premise: neither the loser nor the survivor carries a world default, so there is nothing
  // for the record to inherit at either end.
  assert.deepEqual(corpus.essenceScope.defaults, {});
  const before = corpus.essenceScope.membership[`${MINTED}|sys-b`];
  assert.equal(before.inherit.macro, true);
  assert.equal('macro' in before, false);

  const record = mergeEquivalentWorldEssences(payloadOf(corpus)).essenceScope.membership[
    'iron|sys-b'
  ];
  assert.equal(record.entityId, 'iron', 'the premise: the record really was re-pointed');
  assert.equal(record.inherit.macro, false, 'the switch is FLIPPED');
  assert.ok('macro' in record, 'and the section is written EXPLICITLY rather than left absent');
  assert.equal(record.macro, null);
});

test('a re-pointed record inheriting a REAL world value keeps that value across the merge', () => {
  // `sys-b` resolves its macro through the loser's world default; the survivor has none, and the
  // loser's is deleted with it.
  const corpus = buildEssenceMergeCorpus({
    systems: [
      { id: 'sys-a', essences: [{ id: 'iron', name: 'Iron', macro: 'Macro.shared' }] },
      {
        id: 'sys-b',
        essences: [{ id: MINTED, name: 'Iron', inherit: { macro: true }, omitSections: ['macro'] }],
      },
    ],
    worldDefaults: { [MINTED]: { macro: 'Macro.shared' } },
  });
  const result = mergeEquivalentWorldEssences(payloadOf(corpus));
  const record = result.essenceScope.membership['iron|sys-b'];
  assert.equal(record.inherit.macro, false);
  assert.equal(record.macro, 'Macro.shared', 'the resolved value is FROZEN as its own override');
  assert.equal(
    result.essenceScope.defaults[MINTED],
    undefined,
    "and the loser's world default is gone, which is what makes the freeze necessary"
  );
});

test('a section the re-pointed record already OVERRODE is left exactly as authored', () => {
  const result = mergeEquivalentWorldEssences(payloadOf(twoIrons()));
  const record = result.essenceScope.membership['iron|sys-b'];
  assert.deepEqual(record.inherit, { effectSource: false, macro: false });
  assert.equal(record.macro, null);
  // Every other authored key on the record survives the re-point untouched.
  assert.equal(record.enabled, true);
  assert.equal(record.systemId, 'sys-b');
});

// Pin 1b — the in-system half of that rule, which is the half a GM can observe

/**
 * The world default `sys-b` inherits, per section, paired with the shipped fields the frozen value
 * must land on in `systems[].essenceDefinitions[]`.
 */
const IN_SYSTEM_FREEZE_CASES = Object.freeze([
  Object.freeze({
    section: 'macro',
    worldDefault: { macro: 'Macro.shared' },
    donor: { macro: 'Macro.shared' },
    expected: { propertyMacroUuid: 'Macro.shared' },
  }),
  Object.freeze({
    section: 'effectSource',
    worldDefault: {
      effectSource: {
        sourceComponentId: 'comp-x',
        sourceItemUuid: 'comp-x',
        associatedSystemItemId: 'comp-x',
      },
    },
    donor: { sourceComponentId: 'comp-x' },
    expected: {
      sourceComponentId: 'comp-x',
      sourceItemUuid: 'comp-x',
      associatedSystemItemId: 'comp-x',
    },
  }),
]);

/**
 * A world in which `sys-b` inherits one section from the loser's world default while `sys-a`
 * overrides it with the same value, so the two are equivalent and the group merges.
 *
 * @param {object} testCase An {@link IN_SYSTEM_FREEZE_CASES} entry.
 */
function inheritingOneSection({ section, worldDefault, donor }) {
  return buildEssenceMergeCorpus({
    systems: [
      {
        id: 'sys-a',
        essences: [{ id: 'iron', name: 'Iron', ...donor }],
        components: [{ id: 'comp-x' }],
      },
      {
        id: 'sys-b',
        essences: [
          { id: MINTED, name: 'Iron', inherit: { [section]: true }, omitSections: [section] },
        ],
        components: [{ id: 'comp-x' }],
      },
    ],
    worldDefaults: { [MINTED]: worldDefault },
  });
}

for (const testCase of IN_SYSTEM_FREEZE_CASES) {
  const { section, expected } = testCase;
  test(`freezing \`${section}\` also writes the IN-SYSTEM row, on the SHIPPED field names`, () => {
    // Without this half the freeze inverts: `unionScopedDefinitions` spreads the in-system record
    // last and `applyInheritedSections` writes the world value onto the row only while the record
    // still marks the section inheriting, so flipping the switch to `false` is the very act that
    // stops the row taking the frozen value.
    const corpus = inheritingOneSection(testCase);
    const row = corpus.systems[1].essenceDefinitions[0];
    for (const [field, value] of Object.entries(expected)) {
      assert.notEqual(
        row[field],
        value,
        `the premise: the in-system row has no ${field} of its own`
      );
    }

    const result = mergeEquivalentWorldEssences(payloadOf(corpus));
    assert.equal(result._worldEssenceMergeReport.mergedGroups.length, 1, 'the premise: merged');
    const frozenRow = result.systems[1].essenceDefinitions[0];
    assert.equal(frozenRow.id, 'iron', 'the premise: the row really was re-keyed');
    for (const [field, value] of Object.entries(expected)) {
      assert.equal(frozenRow[field], value, `${field} carries the frozen value`);
    }

    // It is a write to a row the GM authored, so it is disclosed rather than made silently — and
    // `sys-a`, which already overrode the section, is not named because it was not written.
    assert.deepEqual(result._worldEssenceMergeReport.inSystemFreezes, [
      { systemId: 'sys-b', essenceId: 'iron', sections: [section] },
    ]);
    assert.deepEqual(
      result.systems[0].essenceDefinitions[0],
      corpus.systems[0].essenceDefinitions[0],
      'the ALREADY-OVERRIDING system’s own row is byte-identical'
    );
  });
}

test('a section the old world parent NEVER AUTHORED leaves the in-system row untouched', () => {
  // The opposite rule, right for the opposite reason.
  const corpus = buildEssenceMergeCorpus({
    systems: [
      { id: 'sys-a', essences: [{ id: 'iron', name: 'Iron' }] },
      {
        id: 'sys-b',
        essences: [{ id: MINTED, name: 'Iron', inherit: { macro: true }, omitSections: ['macro'] }],
      },
    ],
  });
  assert.deepEqual(corpus.essenceScope.defaults, {}, 'the premise: the world decided NOTHING');
  corpus.systems[1].essenceDefinitions[0].propertyMacroUuid = 'Macro.own';

  const result = mergeEquivalentWorldEssences(payloadOf(corpus));
  assert.equal(result._worldEssenceMergeReport.mergedGroups.length, 1, 'the premise: merged');
  assert.equal(result.systems[1].essenceDefinitions[0].propertyMacroUuid, 'Macro.own');
  assert.equal(result.essenceScope.membership['iron|sys-b'].macro, null);
  assert.deepEqual(result._worldEssenceMergeReport.inSystemFreezes, []);
});

test('EVERY in-system row under a duplicated id is frozen, because the union emits every row', () => {
  // Unreachable from a derived map — requirement 6's output-uniqueness invariant refuses such a
  // group outright — and reachable from a hand-edited persisted one, which skips those invariants
  // by design.
  const corpus = buildEssenceMergeCorpus({
    systems: [
      { id: 'sys-a', essences: [{ id: 'iron', name: 'Iron', macro: 'Macro.shared' }] },
      {
        id: 'sys-b',
        essences: [
          { id: MINTED, name: 'Iron', inherit: { macro: true }, omitSections: ['macro'] },
          { id: 'iron', name: 'Iron', member: false },
        ],
      },
    ],
    worldDefaults: { [MINTED]: { macro: 'Macro.shared' } },
  });
  const result = mergeEquivalentWorldEssences(
    payloadOf(corpus, {
      worldEssenceMergeMap: { systems: { 'sys-b': { essences: { [MINTED]: 'iron' } } } },
    })
  );
  const rows = result.systems[1].essenceDefinitions;
  assert.deepEqual(
    rows.map((row) => row.id),
    ['iron', 'iron'],
    'the premise: the hand-edited map really did collide two rows onto one id'
  );
  assert.deepEqual(
    rows.map((row) => row.propertyMacroUuid),
    ['Macro.shared', 'Macro.shared'],
    'both rows carry the frozen value'
  );
});

test('the component scope has NO such hazard, because this pass never moves a component’s parent', () => {
  // The check requirement 8 needs and does not state: `rewriteMembershipReferences(record,
  // 'components', …)` rewrites the `essences` quantity map and nothing else, so a component
  // membership record's `entityId` and its `inherit` map are never touched, no component's world
  // parent moves and no component section is ever frozen.
  const corpus = twoIrons();
  corpus.componentScope.defaults = { 'comp-1': { id: 'comp-1', essences: { [MINTED]: 2 } } };
  corpus.componentScope.membership['comp-1|sys-b'] = {
    entityId: 'comp-1',
    systemId: 'sys-b',
    inherit: { essences: true },
  };
  const result = mergeEquivalentWorldEssences(payloadOf(corpus));
  const record = result.componentScope.membership['comp-1|sys-b'];
  assert.deepEqual(record.inherit, { essences: true }, 'the switch is NOT flipped');
  assert.equal(record.entityId, 'comp-1', 'and the parent did NOT move');
  assert.deepEqual(
    result.componentScope.defaults['comp-1'].essences,
    { iron: 2 },
    'while the world default it follows was re-keyed, so the inherited map still resolves'
  );
});

// Pin 2 — `essenceScope` sibling-key preservation (requirement 7's last sentence)

test('every OTHER authored key on `essenceScope` survives the merge', () => {
  // `readScopePayload` round-trips unknown siblings, and the `1.34.0` registry entry's
  // `downgradeLosesData: false` rests on it: the setting must survive as an orphaned `Setting`
  // document a re-upgrade finds intact, not one this pass narrowed to three sub-keys.
  const corpus = twoIrons();
  corpus.essenceScope.essenceCatalogueNote = { authoredBy: 'gm', pinned: ['iron'] };
  corpus.essenceScope.someFutureSibling = 7;
  const result = mergeEquivalentWorldEssences(payloadOf(corpus));
  assert.ok(
    result.essenceScope !== corpus.essenceScope,
    'the premise: this pass really did rebuild the payload'
  );
  assert.deepEqual(result.essenceScope.essenceCatalogueNote, {
    authoredBy: 'gm',
    pinned: ['iron'],
  });
  assert.equal(result.essenceScope.someFutureSibling, 7);
});

// Pin 3 — the original object for every key the pass did not change

test('a world with nothing to merge answers the ORIGINAL object for EVERY key', () => {
  // The runner compares JSON per setting, so an equal-but-fresh object is not merely wasteful — it
  // would rewrite every one of these settings on every boot of every world forever.
  const data = payloadOf(
    buildEssenceMergeCorpus({
      systems: [{ id: 'sys-a', essences: [{ id: 'iron', name: 'Iron' }, { id: 'ash' }] }],
    }),
    { recipes: [{ id: 'r1', craftingSystemId: 'sys-a' }], gatheringConfig: { systems: {} } }
  );
  const result = mergeEquivalentWorldEssences(data);
  assert.deepEqual(result._worldEssenceMergeReport.mergedGroups, [], 'the premise: nothing merged');
  for (const key of [
    'recipes',
    'systems',
    'gatheringConfig',
    'essenceScope',
    'componentScope',
    'worldEssenceMergeMap',
  ]) {
    assert.equal(result[key], data[key], `${key} must answer the caller's OWN object`);
  }
});

test('a world that DOES merge answers the original object for the keys the merge did not reach', () => {
  const data = payloadOf(twoIrons(), {
    recipes: [{ id: 'r1', craftingSystemId: 'sys-a' }],
    gatheringConfig: { systems: {} },
  });
  const result = mergeEquivalentWorldEssences(data);
  assert.deepEqual(
    result._worldEssenceMergeReport.mergedGroups.length,
    1,
    'the premise: it merged'
  );
  assert.equal(result.recipes, data.recipes, 'no recipe named the loser');
  assert.equal(result.gatheringConfig, data.gatheringConfig);
  assert.equal(result.componentScope, data.componentScope);
  assert.notEqual(result.systems, data.systems, 'but the re-keyed corpus IS a new object');
  assert.notEqual(result.essenceScope, data.essenceScope);
  assert.notEqual(result.worldEssenceMergeMap, data.worldEssenceMergeMap);
});

// Idempotence, and the persisted map's role in a re-run

test('the pass is IDEMPOTENT: a second run changes nothing and answers the originals', () => {
  const corpus = twoIrons();
  corpus.systems[1].components = [{ id: 'comp-9', name: 'Ore', essences: { [MINTED]: 2 } }];
  const first = mergeEquivalentWorldEssences(payloadOf(corpus));
  const second = mergeEquivalentWorldEssences({ ...payloadOf(corpus), ...first });
  for (const key of ['systems', 'essenceScope', 'componentScope', 'worldEssenceMergeMap']) {
    assert.deepEqual(second[key], first[key], `${key} is byte-identical on the second pass`);
    assert.equal(second[key], first[key], `${key} answers the ORIGINAL object on the second pass`);
  }
});

test('a torn re-run rewrites from the PERSISTED map, which a re-derivation could not answer', () => {
  // The tear the map exists for: `craftingSystems` landed and no longer carries the retired id, so
  // a map re-derived from the corpus would be empty while the component map still holds it.
  const first = mergeEquivalentWorldEssences(payloadOf(twoIrons()));
  const torn = {
    ...payloadOf(twoIrons()),
    systems: first.systems,
    essenceScope: first.essenceScope,
    worldEssenceMergeMap: first.worldEssenceMergeMap,
    componentScope: {
      entities: [{ id: 'comp-9' }],
      defaults: {},
      membership: {
        'comp-9|sys-b': {
          entityId: 'comp-9',
          systemId: 'sys-b',
          inherit: {},
          essences: { [MINTED]: 2 },
        },
      },
    },
  };
  assert.deepEqual(
    mergeEquivalentWorldEssences({ ...torn, worldEssenceMergeMap: {} }).componentScope,
    torn.componentScope,
    'the premise: WITHOUT the persisted map the re-derivation finds nothing and repairs nothing'
  );
  const repaired = mergeEquivalentWorldEssences(torn);
  assert.deepEqual(repaired.componentScope.membership['comp-9|sys-b'].essences, { iron: 2 });
});

// The tombstone leg (requirement 17)

test('the `retired` leg snapshots what the retired entity carried, and a re-run never clears it', () => {
  const first = mergeEquivalentWorldEssences(payloadOf(twoIrons()));
  assert.deepEqual(first.worldEssenceMergeMap.retired, {
    [MINTED]: {
      name: 'iron',
      icon: 'fas fa-fire',
      colorToken: 'rose',
      description: 'iron essence',
      survivorId: 'iron',
      systems: ['sys-b'],
    },
  });
  // On the re-run the entity is already gone, so nothing could re-derive the snapshot: the
  // persisted leg is the only record there is, and it must survive.
  const second = mergeEquivalentWorldEssences({ ...payloadOf(twoIrons()), ...first });
  assert.deepEqual(second.worldEssenceMergeMap.retired, first.worldEssenceMergeMap.retired);
});

test('a PERSISTED snapshot is never overwritten by a freshly derived one', () => {
  // The persisted snapshot was taken while the entity still existed. A re-derivation reads a
  // corpus that has already been rewritten, so the older record is the truer one.
  const data = payloadOf(twoIrons(), {
    worldEssenceMergeMap: {
      systems: { 'sys-b': { essences: { [MINTED]: 'iron' } } },
      retired: { [MINTED]: { name: 'THE ORIGINAL NAME', systems: ['sys-b'] } },
    },
  });
  const result = mergeEquivalentWorldEssences(data);
  assert.equal(result.worldEssenceMergeMap.retired[MINTED].name, 'THE ORIGINAL NAME');
});

// A refused group changes nothing — requirement 6, through the transform

test('two equivalent essences inside ONE system are REFUSED, and the corpus is untouched', () => {
  const data = payloadOf(
    buildEssenceMergeCorpus({
      systems: [
        {
          id: 'sys-a',
          essences: [
            { id: 'iron', name: 'Iron' },
            { id: MINTED, name: 'Iron' },
          ],
        },
      ],
    })
  );
  const result = mergeEquivalentWorldEssences(data);
  assert.equal(result._worldEssenceMergeReport.refusals.length, 1);
  // Output uniqueness answers first: both rows are in `essenceDefinitions`, so merging them would
  // make that array emit one id twice and leave a definition silently unreachable.
  assert.equal(result._worldEssenceMergeReport.refusals[0].reason, 'outputIdCollision');
  assert.deepEqual(result._worldEssenceMergeReport.mergedGroups, []);
  for (const key of ['systems', 'essenceScope', 'worldEssenceMergeMap']) {
    assert.equal(result[key], data[key], `a refusal changes ${key} not at all`);
  }
});

test('a world essence whose member system has NO definition row is refused on the REBUILT keys', () => {
  // The variant neither of the first two invariants can see: both are evaluated over
  // `essenceDefinitions`, and this loser has a membership record for `sys-a` with no row there.
  const data = payloadOf(
    buildEssenceMergeCorpus({
      systems: [
        {
          id: 'sys-a',
          essences: [
            { id: 'iron', name: 'Iron' },
            { id: MINTED, name: 'Iron', inSystem: false },
          ],
        },
      ],
    })
  );
  const result = mergeEquivalentWorldEssences(data);
  assert.equal(result._worldEssenceMergeReport.refusals[0].reason, 'membershipKeyCollision');
  assert.equal(result.essenceScope, data.essenceScope);
});

// The transient report's field names, which the GM-notice lane consumes

test('the report carries exactly the five named legs', () => {
  const report = mergeEquivalentWorldEssences(
    payloadOf(
      buildEssenceMergeCorpus({
        systems: [
          {
            id: 'sys-a',
            essences: [
              { id: 'iron', name: 'Iron' },
              { id: 'lonely', member: false },
            ],
          },
          {
            id: 'sys-b',
            essences: [
              { id: MINTED, name: 'Iron' },
              { id: 'mixed', name: 'Mixed' },
            ],
          },
          {
            id: 'sys-c',
            essences: [{ id: 'mixed', name: 'Mixed', macro: 'Macro.other', member: true }],
          },
        ],
      })
    )
  )._worldEssenceMergeReport;
  assert.deepEqual(Object.keys(report), [
    'mergedGroups',
    'refusals',
    'declined',
    'orphaned',
    'inSystemFreezes',
  ]);
  assert.deepEqual(report.mergedGroups, [
    { survivorId: 'iron', name: 'Iron', loserIds: [MINTED], systemIds: ['sys-a', 'sys-b'] },
  ]);
  assert.deepEqual(report.orphaned, [{ essenceId: 'lonely', name: 'lonely' }]);
  assert.deepEqual(report.declined, [
    { essenceId: 'mixed', name: 'Mixed', sections: ['macro'], reason: 'sectionDisagreement' },
  ]);
  // The fifth leg is the one that is not a derivation: it names the in-system rows requirement 8
  // wrote.
  assert.deepEqual(report.inSystemFreezes, []);
});

// The registry declaration — checked, not copied (requirements 15 and 16)

test('the 1.34.0 entry declares downgradeTo 1.33.0 and downgradeLosesData FALSE', () => {
  const entry = new MigrationRunner({
    getSetting: () => undefined,
    setSetting: () => {},
  })._migrations.find((migration) => migration.version === '1.34.0');
  assert.ok(entry, 'the 1.34.0 entry is registered');
  assert.equal(entry.downgradeTo, '1.33.0');
  assert.equal(
    entry.downgradeLosesData,
    false,
    'CHECKED: the merge is a loss at MIGRATION time, and 1.33.0 reads every touched setting with unchanged normalizers'
  );
  assert.doesNotMatch(
    entry.label,
    /DOWNGRADING IS NOT LOSSLESS/,
    'a truthful `false` also removes the obligation to write a clause the world cannot experience'
  );
});

test('the label is the one string a GM reads, so it states all four required facts', () => {
  const entry = new MigrationRunner({
    getSetting: () => undefined,
    setSetting: () => {},
  })._migrations.find((migration) => migration.version === '1.34.0');
  // What merged, and from where.
  assert.match(entry.label, /listed for you by name with the systems it came from/);
  // That it is irreversible — distinct from, and stated beside, the lossless-downgrade claim.
  assert.match(entry.label, /THE MERGE IS IRREVERSIBLE/);
  assert.match(entry.label, /DOWNGRADING IS LOSSLESS FOR DATA/);
  assert.match(entry.label, /does not\s+undo the merge/);
  // What a refusal means.
  assert.match(entry.label, /REFUSED/);
  // And 8a's disclosure, said in advance rather than discovered in the catalogue.
  assert.match(entry.label, /DISAGREE about how one essence looks/);
});
