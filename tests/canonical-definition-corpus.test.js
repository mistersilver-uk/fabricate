/**
 * The pinned canonical form for a crafting-definition corpus (issues 1080, 1233).
 *
 * `tests/helpers/canonicalizeDefinitionCorpus.js` is how the storage-layout programme
 * answers "did we lose data", so its own failure mode is the expensive one: a form that is
 * deterministic because it DISCARDS is worse than a form that is non-deterministic, because
 * every downstream acceptance goes green while measuring less. This suite is written against
 * that risk, and it has three halves.
 *
 * 1. **Determinism.** The same stored bytes, hydrated twice, canonicalize identically — for
 *    a legacy-shaped corpus and for a migrated one. This is the property that did not hold
 *    under version 1, and the legacy fixture exercises the flat `ingredients` shape
 *    DIRECTLY, because a fixture that seeds explicit `ingredientGroups` ids has not tested
 *    the case at all.
 * 2. **Detection.** Four corpus mutations — a dropped recipe, a dropped component
 *    reference, a renumbered `craftingSystemId`, a stripped durable identity leaf — must
 *    each make the comparison differ. Every one of those is a 16-character alphanumeric id
 *    or a reference to one, i.e. exactly what widening the minted-id pattern would have
 *    swallowed.
 * 3. **Non-vacuity.** The fixture is proved to actually mint (the same bytes canonicalize
 *    DIFFERENTLY in the degraded shape-only mode), the authored ids are proved to have the
 *    mintable shape, and the migrated corpus is proved to mint nothing.
 *
 * The Foundry environment here is deliberately NOT `installFoundryUtilsEnv()`: that shared
 * stub returns a sequential `rid-N`, which is not the shape `foundry.utils.randomID()`
 * produces and, being sequential per process, would make two hydrates of the same bytes
 * differ in a way no real world does while hiding the shape collision this issue is about.
 * A test double that is looser than the thing it stands for produces false passes.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  CANONICAL_FORM_VERSION,
  CORE_ID_PATTERN,
  HYDRATE_STAMPED_METADATA,
  canonicalDefinitionCorpusJson,
  canonicalizeDefinitionCorpus,
} from './helpers/canonicalizeDefinitionCorpus.js';
import { collectWorkingTreeSources, stripComments } from './helpers/sourceScan.js';

/** `foundry.utils.randomID()`'s alphabet (base 36) and length. */
const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/**
 * A faithful stand-in for `foundry.utils.randomID()` — 16 characters of the same alphabet,
 * unpredictable per call. Core builds it from `Math.random().toString(36)`; this draws from
 * the platform CSPRNG instead, because SonarCloud rules `Math.random()` out (S2245) and the
 * property under test is only that the value is unpredictable and 16 alphanumerics long.
 *
 * @returns {string}
 */
function mintCoreId() {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => ID_ALPHABET[byte % ID_ALPHABET.length]).join('');
}

globalThis.foundry = {
  utils: {
    randomID: mintCoreId,
    getProperty: (object, path) =>
      String(path ?? '')
        .split('.')
        .reduce((value, key) => value?.[key], object),
  },
};
globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };
globalThis.fromUuid = async () => null;
globalThis.game = { user: { isGM: true, name: 'Original GM' } };

const { Recipe, RECIPE_OMITTED_WHEN_DEFAULT } = await import('../src/models/Recipe.js');
const { INGREDIENT_SET_OMITTED_WHEN_DEFAULT } = await import('../src/models/IngredientSet.js');
const { INGREDIENT_OMITTED_WHEN_DEFAULT } = await import('../src/models/Ingredient.js');

// Authored identity. Every one of these is a `foundry.utils.randomID()`-shaped 16-character
// alphanumeric, which is the whole difficulty: the load path mints ids of this same shape.
const SYSTEM_ID = 'sysAlpha00000001';
const RENUMBERED_SYSTEM_ID = 'sysAlpha00000002';
const RECIPE_ALPHA_ID = 'recipeAlpha00001';
const RECIPE_BRAVO_ID = 'recipeBravo00002';
const COMPONENT_IRON_ID = 'componentIron001';
const COMPONENT_COAL_ID = 'componentCoal001';
const COMPONENT_STEEL_ID = 'componentSteel01';
const TOOL_HAMMER_ID = 'toolHammer000001';
const ITEM_RECORD_ID = 'itemAnvilSource1';
const SET_ALPHA_ID = 'ingredientSet001';
const STEP_TEMPER_ID = 'recipeStepOne001';
const GROUP_IRON_ID = 'ingGroupIron0001';
const GROUP_COAL_ID = 'ingGroupCoal0001';
const GROUP_SPARE_ID = 'ingGroupSpare001';
const SET_SPARE_ID = 'ingredientSet002';
const RESULT_GROUP_ID = 'resultGroupOne01';
const RESULT_STEEL_ID = 'resultSteel00001';

const AUTHORED_IDS = [
  SYSTEM_ID,
  RENUMBERED_SYSTEM_ID,
  RECIPE_ALPHA_ID,
  RECIPE_BRAVO_ID,
  COMPONENT_IRON_ID,
  COMPONENT_COAL_ID,
  COMPONENT_STEEL_ID,
  TOOL_HAMMER_ID,
  ITEM_RECORD_ID,
  SET_ALPHA_ID,
  STEP_TEMPER_ID,
  GROUP_IRON_ID,
  GROUP_COAL_ID,
  GROUP_SPARE_ID,
  SET_SPARE_ID,
  RESULT_GROUP_ID,
  RESULT_STEEL_ID,
];

/** An authored `metadata` block — stored, therefore domain data, therefore compared in full. */
const STORED_METADATA = Object.freeze({
  created: 1_700_000_000_000,
  modified: 1_700_000_500_000,
  author: 'Original GM',
  version: '1.0.0',
});

/**
 * The registered source item carrying the durable per-system identity Fabricate stamps with
 * `stampItemDataRoleIdentity` — `flags.fabricate.fabricate.roles[systemId][roleKey]`. It is
 * in the corpus because it is the shape that stresses the authored-versus-minted rule
 * hardest: the roles map is KEYED by a 16-character system id and its leaves are
 * 16-character definition ids, so a form that decided by shape would renumber the entire
 * durable identity graph and report identity loss as equivalence.
 *
 * @param {string|null} mutation
 * @returns {object}
 */
function identityItemRecord(mutation) {
  const perSystem =
    mutation === 'stripIdentityFlag'
      ? { toolId: TOOL_HAMMER_ID }
      : { componentId: COMPONENT_STEEL_ID, toolId: TOOL_HAMMER_ID };
  return {
    id: ITEM_RECORD_ID,
    name: 'Anvil (registered source)',
    flags: { fabricate: { fabricate: { roles: { [SYSTEM_ID]: perSystem } } } },
  };
}

/**
 * A corpus in the LEGACY stored shape: flat `ingredients` inside an ingredient set
 * (`IngredientSet._legacyIngredientsToGroups`), a flat top-level `results` alias
 * (`Recipe._normalizeResultGroups`), an ingredient set and a step with no id, and no
 * `metadata` block. Hydrating it mints ids at seven distinct call sites and stamps a
 * `metadata` block from the clock.
 *
 * @param {string|null} [mutation] One of `dropRecipe`, `dropComponentRef`,
 *   `renumberSystemId`, `stripIdentityFlag` — the four detection cases.
 * @returns {{recipes: object[], items: object[]}}
 */
function legacyStoredCorpus(mutation = null) {
  const coalOption =
    mutation === 'dropComponentRef' ? { quantity: 1 } : { componentId: COMPONENT_COAL_ID, quantity: 1 };
  const alpha = {
    id: RECIPE_ALPHA_ID,
    name: 'Alpha Ingot',
    craftingSystemId: mutation === 'renumberSystemId' ? RENUMBERED_SYSTEM_ID : SYSTEM_ID,
    ingredientSets: [
      {
        id: SET_ALPHA_ID,
        ingredients: [{ componentId: COMPONENT_IRON_ID, quantity: 2 }, coalOption],
        toolIds: [TOOL_HAMMER_ID],
      },
      // No `id`: `IngredientSet` mints one as well as a group id per legacy ingredient.
      { ingredients: [{ componentId: COMPONENT_COAL_ID, quantity: 3 }] },
    ],
    results: [{ componentId: COMPONENT_STEEL_ID, quantity: 1 }],
    // No `id`: `Recipe._normalizeStep` mints one.
    steps: [
      {
        name: 'Temper',
        ingredientSets: [{ ingredients: [{ componentId: COMPONENT_IRON_ID, quantity: 1 }] }],
      },
    ],
  };
  const bravo = {
    id: RECIPE_BRAVO_ID,
    name: 'Bravo Blade',
    craftingSystemId: SYSTEM_ID,
    ingredientSets: [{ ingredients: [{ componentId: COMPONENT_STEEL_ID, quantity: 1 }] }],
    results: [{ componentId: COMPONENT_IRON_ID, quantity: 2 }],
  };
  return {
    recipes: mutation === 'dropRecipe' ? [alpha] : [alpha, bravo],
    items: [identityItemRecord(mutation)],
  };
}

/**
 * The same domain content in the MIGRATED stored shape: every group, set, step and result
 * carries its own authored id and every recipe carries a stored `metadata` block, so
 * hydrating it mints nothing at all.
 *
 * @param {string|null} [mutation]
 * @returns {{recipes: object[], items: object[]}}
 */
function migratedStoredCorpus(mutation = null) {
  const coalOption =
    mutation === 'dropComponentRef' ? { quantity: 1 } : { componentId: COMPONENT_COAL_ID, quantity: 1 };
  const alpha = {
    id: RECIPE_ALPHA_ID,
    name: 'Alpha Ingot',
    craftingSystemId: mutation === 'renumberSystemId' ? RENUMBERED_SYSTEM_ID : SYSTEM_ID,
    metadata: { ...STORED_METADATA },
    ingredientSets: [
      {
        id: SET_ALPHA_ID,
        ingredientGroups: [
          {
            id: GROUP_IRON_ID,
            name: 'Group 1',
            options: [{ componentId: COMPONENT_IRON_ID, quantity: 2 }],
          },
          { id: GROUP_COAL_ID, name: 'Group 2', options: [coalOption] },
        ],
        toolIds: [TOOL_HAMMER_ID],
      },
      {
        id: SET_SPARE_ID,
        ingredientGroups: [
          {
            id: GROUP_SPARE_ID,
            name: 'Group 1',
            options: [{ componentId: COMPONENT_COAL_ID, quantity: 3 }],
          },
        ],
      },
    ],
    resultGroups: [
      {
        id: RESULT_GROUP_ID,
        name: 'Result Group 1',
        results: [{ id: RESULT_STEEL_ID, componentId: COMPONENT_STEEL_ID, quantity: 1 }],
      },
    ],
    steps: [
      {
        id: STEP_TEMPER_ID,
        name: 'Temper',
        ingredientSets: [
          {
            id: 'ingredientSet003',
            ingredientGroups: [
              {
                id: 'ingGroupTemper01',
                name: 'Group 1',
                options: [{ componentId: COMPONENT_IRON_ID, quantity: 1 }],
              },
            ],
          },
        ],
        resultGroups: [
          {
            id: 'resultGroupTwo01',
            name: 'Result Group 1',
            results: [{ id: 'resultTemper0001', componentId: COMPONENT_STEEL_ID, quantity: 1 }],
          },
        ],
      },
    ],
  };
  const bravo = {
    id: RECIPE_BRAVO_ID,
    name: 'Bravo Blade',
    craftingSystemId: SYSTEM_ID,
    metadata: { ...STORED_METADATA },
    ingredientSets: [
      {
        id: 'ingredientSet004',
        ingredientGroups: [
          {
            id: 'ingGroupSteel001',
            name: 'Group 1',
            options: [{ componentId: COMPONENT_STEEL_ID, quantity: 1 }],
          },
        ],
      },
    ],
    resultGroups: [
      {
        id: 'resultGroupBrv01',
        name: 'Result Group 1',
        results: [{ id: 'resultIron000001', componentId: COMPONENT_IRON_ID, quantity: 2 }],
      },
    ],
  };
  return {
    recipes: mutation === 'dropRecipe' ? [alpha] : [alpha, bravo],
    items: [identityItemRecord(mutation)],
  };
}

/**
 * One independent LOAD of a stored corpus: hydrate the recipes through the real model and
 * keep an untouched snapshot of the bytes they were hydrated from.
 *
 * @param {(mutation: string|null) => {recipes: object[], items: object[]}} builder
 * @param {string|null} [mutation]
 * @returns {{records: object[], storedRecords: object[]}}
 */
function loadCorpus(builder, mutation = null) {
  const stored = builder(mutation);
  const flat = [...stored.recipes, ...stored.items];
  return {
    records: [...stored.recipes.map((recipe) => new Recipe(recipe)), ...stored.items],
    storedRecords: structuredClone(flat),
  };
}

/**
 * @param {(mutation: string|null) => {recipes: object[], items: object[]}} builder
 * @param {string|null} [mutation]
 * @returns {string}
 */
function canonicalJson(builder, mutation = null) {
  const { records, storedRecords } = loadCorpus(builder, mutation);
  return canonicalDefinitionCorpusJson(records, { storedRecords });
}

describe('the pinned canonical form is versioned and provenance-stamped', () => {
  it('carries the version and the mode two sides were compared under', () => {
    assert.equal(CANONICAL_FORM_VERSION, 2);
    const shape = canonicalizeDefinitionCorpus([]);
    assert.equal(shape.version, CANONICAL_FORM_VERSION);
    assert.equal(shape.provenance, 'shape');
    assert.equal(canonicalizeDefinitionCorpus([], { storedRecords: [] }).provenance, 'stored');
  });

  it('cannot silently compare a stored-provenance form with a shape-only one', () => {
    const records = [{ id: RECIPE_ALPHA_ID, name: 'Alpha Ingot' }];
    assert.notEqual(
      canonicalDefinitionCorpusJson(records),
      canonicalDefinitionCorpusJson(records, { storedRecords: records }),
      'the provenance stamp is the first field, so the JSON differs before any record does'
    );
  });
});

describe('the same stored bytes canonicalize identically', () => {
  it('holds for a legacy-shaped corpus, which mints ids on every hydrate', () => {
    assert.equal(
      canonicalJson(legacyStoredCorpus),
      canonicalJson(legacyStoredCorpus),
      'two independent loads of one stored corpus must be indistinguishable at the domain level'
    );
  });

  it('holds for a migrated corpus', () => {
    assert.equal(canonicalJson(migratedStoredCorpus), canonicalJson(migratedStoredCorpus));
  });

  it('holds across the clock and the current user changing between loads', () => {
    // `Recipe` rebuilds an absent `metadata` block from `Date.now()` twice and
    // `game.user.name`, so this is asserted against a forced divergence rather than against
    // two loads that happened to land in the same millisecond.
    const realNow = Date.now;
    try {
      Date.now = () => 1000;
      globalThis.game.user.name = 'First GM';
      const first = canonicalJson(legacyStoredCorpus);
      Date.now = () => 2_000_000;
      globalThis.game.user.name = 'Second GM';
      const second = canonicalJson(legacyStoredCorpus);
      assert.equal(first, second);
    } finally {
      Date.now = realNow;
      globalThis.game.user.name = 'Original GM';
    }
  });

  it('is not vacuous: the same bytes canonicalize DIFFERENTLY under shape-only rules', () => {
    // This is version 1's rule 4 verbatim, and it is the defect issue 1233 exists for. If
    // this assertion ever flips, the fixture has stopped minting and every determinism
    // assertion above has stopped proving anything.
    const first = loadCorpus(legacyStoredCorpus);
    const second = loadCorpus(legacyStoredCorpus);
    assert.notEqual(
      canonicalDefinitionCorpusJson(first.records),
      canonicalDefinitionCorpusJson(second.records)
    );
  });

  it('is not vacuous: the legacy corpus mints and the migrated corpus does not', () => {
    const legacy = canonicalJson(legacyStoredCorpus);
    assert.equal(
      new Set(legacy.match(/minted-\d{4}/g)).size,
      11,
      'the legacy fixture must keep reaching every hydrate-minting call site: recipe-level and ' +
        'step-level ingredient sets, their legacy flat ingredients, the legacy flat results ' +
        'alias and an id-less step'
    );
    assert.ok(
      !canonicalJson(migratedStoredCorpus).includes('minted-'),
      'a fully migrated corpus stores every id, so provenance must renumber nothing'
    );
  });

  it('is not vacuous: every authored id in the fixture has the mintable shape', () => {
    const wrongShape = AUTHORED_IDS.filter((id) => !CORE_ID_PATTERN.test(id));
    assert.deepEqual(
      wrongShape,
      [],
      'an authored id that did not collide with the minted shape would dodge the whole problem'
    );
  });
});

describe('the form still detects what it exists to detect', () => {
  it('sees a dropped recipe', () => {
    assert.notEqual(canonicalJson(legacyStoredCorpus), canonicalJson(legacyStoredCorpus, 'dropRecipe'));
    assert.notEqual(
      canonicalJson(migratedStoredCorpus),
      canonicalJson(migratedStoredCorpus, 'dropRecipe')
    );
  });

  it('sees a dropped component reference inside an ingredient option', () => {
    assert.notEqual(
      canonicalJson(legacyStoredCorpus),
      canonicalJson(legacyStoredCorpus, 'dropComponentRef')
    );
    assert.notEqual(
      canonicalJson(migratedStoredCorpus),
      canonicalJson(migratedStoredCorpus, 'dropComponentRef')
    );
  });

  it('sees a renumbered craftingSystemId', () => {
    assert.notEqual(
      canonicalJson(legacyStoredCorpus),
      canonicalJson(legacyStoredCorpus, 'renumberSystemId')
    );
    assert.notEqual(
      canonicalJson(migratedStoredCorpus),
      canonicalJson(migratedStoredCorpus, 'renumberSystemId')
    );
  });

  it('sees a stripped durable identity leaf', () => {
    assert.notEqual(
      canonicalJson(legacyStoredCorpus),
      canonicalJson(legacyStoredCorpus, 'stripIdentityFlag')
    );
    assert.notEqual(
      canonicalJson(migratedStoredCorpus),
      canonicalJson(migratedStoredCorpus, 'stripIdentityFlag')
    );
  });

  it('compares every authored id verbatim rather than renumbering it away', () => {
    const { records, storedRecords } = loadCorpus(migratedStoredCorpus);
    const json = canonicalDefinitionCorpusJson(records, { storedRecords });
    for (const id of [
      SYSTEM_ID,
      RECIPE_ALPHA_ID,
      COMPONENT_IRON_ID,
      TOOL_HAMMER_ID,
      GROUP_IRON_ID,
    ]) {
      assert.ok(json.includes(id), `authored id ${id} must survive into the comparison`);
    }
  });
});

describe('a hydrate-stamped metadata block is normalized, a stored one is compared', () => {
  it('replaces the block the load path invented', () => {
    assert.ok(
      canonicalJson(legacyStoredCorpus).includes(HYDRATE_STAMPED_METADATA),
      'the legacy corpus stores no metadata, so every block in it was stamped at hydrate'
    );
  });

  it('keeps a stored block verbatim, so metadata loss still reddens', () => {
    const json = canonicalJson(migratedStoredCorpus);
    assert.ok(!json.includes(HYDRATE_STAMPED_METADATA));
    assert.ok(json.includes(String(STORED_METADATA.created)));

    const { records, storedRecords } = loadCorpus(migratedStoredCorpus);
    const edited = structuredClone(storedRecords);
    edited[0].metadata.author = 'Someone Else';
    assert.notEqual(
      canonicalDefinitionCorpusJson(records, { storedRecords }),
      canonicalDefinitionCorpusJson(
        [new Recipe(edited[0]), ...records.slice(1)],
        { storedRecords: edited }
      ),
      'a stored metadata block is domain data; dropping or rewriting it must be visible'
    );
  });
});

describe('the rules the canonical form inherited from version 1', () => {
  it('sorts the corpus by id and every object’s keys, and drops undefined', () => {
    const left = canonicalDefinitionCorpusJson([
      { name: 'B', id: 'b', craftingSystemId: 'sys-1' },
      { id: 'a', craftingSystemId: 'sys-1', name: 'A', notes: undefined },
    ]);
    const right = canonicalDefinitionCorpusJson([
      { craftingSystemId: 'sys-1', id: 'a', name: 'A' },
      { craftingSystemId: 'sys-1', id: 'b', name: 'B' },
    ]);
    assert.equal(left, right);
    assert.match(left, /"records":\[\{"craftingSystemId":"sys-1","id":"a"/);
  });

  it('preserves authored nested order rather than sorting it away', () => {
    const stages = { id: 'r1', resultGroups: [{ id: 'z' }, { id: 'a' }] };
    const canonical = canonicalizeDefinitionCorpus([stages]);
    assert.deepEqual(
      canonical.records[0].resultGroups.map((group) => group.id),
      ['z', 'a'],
      'sorting nested collections would hide a real reordering regression and prove nothing'
    );
  });

  it('renumbers uuid-shaped ids positionally while preserving references', () => {
    const build = (first, second) => [
      {
        id: 'r1',
        ingredientSets: [{ id: 'set-1', ingredientGroups: [{ id: first, name: '' }] }],
        preferredGroupId: first,
      },
      { id: 'r2', ingredientSets: [{ id: 'set-2', ingredientGroups: [{ id: second, name: '' }] }] },
    ];
    const runOne = build(
      '1f0d2e6c-6a1d-4a0a-8f1e-2c2d3e4f5a6b',
      'aa11bb22-cc33-4d44-9e55-ff6677889900'
    );
    const runTwo = build(
      '0badc0de-dead-4bee-8fed-0123456789ab',
      'feedface-cafe-4bad-bead-fedcba987654'
    );

    assert.equal(canonicalDefinitionCorpusJson(runOne), canonicalDefinitionCorpusJson(runTwo));
    const canonical = canonicalizeDefinitionCorpus(runOne);
    assert.equal(canonical.records[0].ingredientSets[0].ingredientGroups[0].id, 'minted-0001');
    assert.equal(
      canonical.records[0].preferredGroupId,
      'minted-0001',
      'a reference to a minted id must still resolve to its target'
    );
    assert.equal(canonical.records[1].ingredientSets[0].ingredientGroups[0].id, 'minted-0002');
  });

  it('does not renumber an authored id that merely looks random', () => {
    const record = { id: 'aBcDeF0123456789', name: 'Authored' };
    assert.equal(canonicalizeDefinitionCorpus([record]).records[0].id, 'aBcDeF0123456789');
    assert.equal(
      canonicalizeDefinitionCorpus([record], { storedRecords: [record] }).records[0].id,
      'aBcDeF0123456789',
      'an id in the stored bytes is authored identity whatever it looks like'
    );
  });

  it('keeps null distinct from absent unless the caller asks otherwise', () => {
    const withNull = canonicalDefinitionCorpusJson([{ id: 'a', craftingSystemId: null }]);
    const without = canonicalDefinitionCorpusJson([{ id: 'a' }]);
    assert.notEqual(withNull, without, 'null-versus-absent is a defect class, not noise');
    assert.equal(
      canonicalDefinitionCorpusJson([{ id: 'a', craftingSystemId: null }], {
        treatNullAsAbsent: true,
      }),
      without
    );
  });
});

describe('the boundaries of the provenance rule are refused rather than guessed', () => {
  it('sorts a record whose own id was minted after the authored ones, in input order', () => {
    const stored = [{ id: RECIPE_BRAVO_ID, name: 'Bravo' }, { name: 'No stored id' }];
    const records = [
      { id: mintCoreId(), name: 'No stored id' },
      { id: RECIPE_BRAVO_ID, name: 'Bravo' },
    ];
    const canonical = canonicalizeDefinitionCorpus(records, { storedRecords: stored });
    assert.deepEqual(
      canonical.records.map((record) => record.id),
      [RECIPE_BRAVO_ID, 'minted-0001'],
      'sorting on a random id would put the corpus in a different order on every load'
    );
  });

  it('refuses a minted id used as an object KEY instead of returning a non-deterministic form', () => {
    const mintedKey = mintCoreId();
    const record = {
      id: RECIPE_ALPHA_ID,
      ingredientGroups: [{ id: mintedKey, name: 'Group 1' }],
      quantitiesByGroup: { [mintedKey]: 2 },
    };
    assert.throws(
      () => canonicalizeDefinitionCorpus([record], { storedRecords: [{ id: RECIPE_ALPHA_ID }] }),
      /object KEY/
    );
  });

  it('refuses stored bytes that describe none of the records, rather than comparing nothing', () => {
    // A conversion that re-minted every NESTED authored id is real identity loss, and the
    // correct pre-conversion bytes see it. Empty bytes would not: with no stored strings,
    // every id classifies as hydrate-minted and BOTH corpora collapse to the same
    // `minted-NNNN` sequence — equal, under a reassuring `provenance: 'stored'` stamp. That
    // shape is reachable by sequencing rather than carelessness: once a forward conversion
    // has retired the pre-conversion setting, `ClientSettings#get` serves the registered `[]`
    // default, so reading "the stored bytes" at the wrong point produces exactly `[]`.
    const corpus = (setId, groupId) => [
      {
        id: RECIPE_ALPHA_ID,
        craftingSystemId: SYSTEM_ID,
        ingredientSets: [{ id: setId, ingredientGroups: [{ id: groupId, name: 'Group 1' }] }],
      },
    ];
    const authored = corpus(SET_ALPHA_ID, GROUP_IRON_ID);
    const reminted = corpus(mintCoreId(), mintCoreId());
    assert.notEqual(
      canonicalDefinitionCorpusJson(authored, { storedRecords: authored }),
      canonicalDefinitionCorpusJson(reminted, { storedRecords: authored }),
      'the correct stored bytes must see a conversion that re-minted every nested authored id'
    );
    for (const undescriptive of [[], {}]) {
      assert.throws(
        () => canonicalDefinitionCorpusJson(reminted, { storedRecords: undescriptive }),
        /describes none of/,
        'bytes that describe no record must be refused, not stamped as provenance: stored'
      );
    }
  });

  it('still permits the degraded mode for a caller that supplies no bytes at all', () => {
    // Omitting and supplying-empty are different claims: omitting says "I hold no bytes" and
    // is answered with the loudly stamped shape-only mode, while supplying says "these ARE
    // the bytes this corpus came from" and must be true. An empty CORPUS is undescribed by
    // nothing, so it stays permitted.
    const literal = [{ id: RECIPE_ALPHA_ID, name: 'Alpha Ingot' }];
    assert.equal(canonicalizeDefinitionCorpus(literal).provenance, 'shape');
    assert.equal(
      canonicalizeDefinitionCorpus(literal, { storedRecords: null }).provenance,
      'shape'
    );
    assert.equal(canonicalizeDefinitionCorpus([], { storedRecords: [] }).provenance, 'stored');
    assert.throws(
      () => canonicalizeDefinitionCorpus(literal, { storedRecords: [] }),
      /describes none of/
    );
  });

  it('leaves a 16-character FIELD NAME alone — shape is not identity', () => {
    // `craftingModifier` is sixteen alphanumerics, and so is any name of that length. A rule
    // that decided provenance for every string in the corpus would renumber both.
    const record = { id: RECIPE_ALPHA_ID, craftingModifier: { modifierIds: [] } };
    const canonical = canonicalizeDefinitionCorpus([record], {
      storedRecords: [{ id: RECIPE_ALPHA_ID }],
    });
    assert.deepEqual(canonical.records[0].craftingModifier, { modifierIds: [] });
  });
});

describe('the non-deterministic hydrate defaults the canonical form is written against', () => {
  /**
   * Rules 4 and 5 are a hand-maintained mirror of the model layer: rule 4 covers the
   * `randomID()` call sites and rule 5 covers the one `Date.now()` default. A new
   * non-deterministic default added to `src/models/` would be invisible to both, and the
   * form would go quietly non-deterministic again — so the set is pinned here.
   *
   * @returns {Record<string, string>}
   */
  function modelSources() {
    const sources = collectWorkingTreeSources(['src/models'], ['.js']);
    assert.ok(Object.keys(sources).length > 5, 'a vacuous source scan proves nothing');
    return Object.fromEntries(
      Object.entries(sources).map(([file, source]) => [file, stripComments(source)])
    );
  }

  /**
   * @param {RegExp} pattern
   * @returns {Record<string, number>}
   */
  function occurrencesByFile(pattern) {
    const counted = {};
    for (const [file, code] of Object.entries(modelSources())) {
      const matches = code.match(pattern);
      if (matches) counted[file.replaceAll('\\', '/')] = matches.length;
    }
    return counted;
  }

  it('pins every clock-derived default', () => {
    assert.deepEqual(
      occurrencesByFile(/Date\.now\(\)/g),
      { 'src/models/Recipe.js': 2 },
      'a new clock-derived hydrate default needs a rule 5 entry, or the form stops being deterministic'
    );
  });

  it('pins every hydrate-minting call site', () => {
    assert.deepEqual(
      occurrencesByFile(/randomID\(\)/g),
      {
        'src/models/IngredientGroup.js': 1,
        'src/models/IngredientSet.js': 2,
        'src/models/Recipe.js': 4,
        'src/models/Result.js': 1,
      },
      'a new minting call site must be reachable by the legacy fixture, or rule 4 goes untested'
    );
  });

  it('pins that every minted id is assigned to an `id` key', () => {
    // Rule 4 only decides provenance at `MINTING_KEYS`. A call site that minted into some
    // other field would be invisible to it, and the form would go non-deterministic again
    // with every test still green — so the two counts are compared rather than assumed.
    assert.deepEqual(
      occurrencesByFile(/\bid\s*[:=]\s*[^;\n]*randomID\(\)/g),
      occurrencesByFile(/randomID\(\)/g),
      'a randomID() that does not land on an `id` key needs a MINTING_KEYS entry'
    );
  });

  it('pins that no serialization table can omit an `id`', () => {
    // The companion half of the assertion above, and the reason rule 4 may COLLECT only at
    // `id` while SUBSTITUTING everywhere. A minted id is substituted at a reference position
    // only because it was first collected at its own `id` key; a serialization table that
    // dropped `id` would delete that defining occurrence, leaving the reference emitted
    // verbatim and the form non-deterministic with the pin above still green.
    const tables = {
      RECIPE_OMITTED_WHEN_DEFAULT,
      INGREDIENT_SET_OMITTED_WHEN_DEFAULT,
      INGREDIENT_OMITTED_WHEN_DEFAULT,
    };
    assert.deepEqual(
      new Set(
        Object.values(modelSources()).flatMap((code) =>
          [...code.matchAll(/export const (\w+_OMITTED_WHEN_DEFAULT)\b/g)].map((match) => match[1])
        )
      ),
      new Set(Object.keys(tables)),
      'a new omitted-when-default table must be checked here too, or the guard goes partial'
    );
    for (const [name, table] of Object.entries(tables)) {
      assert.ok(
        !Object.hasOwn(table, 'id'),
        `${name} must never make an id omittable: rule 4 needs the minted id itself serialized ` +
          'alongside every reference to it'
      );
    }
  });
});
