/**
 * Serialized recipe payload contract (issue 1087).
 *
 * Every recipe is rewritten whole on every mutation, replicated to every client, and
 * stringified twice more by `RecipeManager.reload()`'s change comparison, so anything
 * `Recipe.toJSON()` emits is paid on every write by every client. Two things it used to emit
 * carry no information: the flat top-level `results` alias, which duplicated
 * `resultGroups[].results` wholesale, and the ~25 fields whose value is the one the
 * constructor rebuilds from absence.
 *
 * The whole change is WRITE-side. This suite is the proof that it is:
 *   - the alias is no longer emitted, but is still READ, permanently, and a payload that
 *     carries it survives a full save cycle with every result intact;
 *   - `RECIPE_OMITTED_WHEN_DEFAULT` is a hand-maintained mirror of the constructor, so it is
 *     checked mechanically against a maximal and a minimal recipe rather than by eye;
 *   - `enabled: true` is deliberately NOT omitted, and the reason is a live reader;
 *   - the reduction is measured on a fixed corpus against the shape written before it.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { installFoundryUtilsEnv } from './helpers/foundryEnv.js';

installFoundryUtilsEnv();
globalThis.game = { user: { isGM: true, name: 'GM' } };

const { Recipe, RECIPE_OMITTED_WHEN_DEFAULT, DEFAULT_RECIPE_IMAGE } = await import(
  '../src/models/Recipe.js'
);

const METADATA = { created: 1, modified: 2, author: 'GM', version: '1.0.0' };

/** A recipe whose every omittable field carries a NON-default value. */
function maximalRecipe() {
  return new Recipe({
    id: 'r-max',
    name: 'Maximal',
    description: 'Every omittable field is authored away from its default.',
    img: 'icons/commodities/metal/ingot-worn-silver.webp',
    category: 'alchemy',
    craftingSystemId: 'sys-1',
    system: 'dnd5e',
    tags: ['metalwork'],
    enabled: false,
    allowPlayerResultReorder: false,
    locked: true,
    recipeItemId: 'book-1',
    linkedRecipeItemUuid: 'Item.abcdefabcdefabcd',
    visibility: { restricted: true, allowedUserIds: ['u1'] },
    access: { characterIds: ['actor-1'], playerIds: ['user-1'] },
    complex: true,
    ingredientSets: [
      {
        id: 'set-1',
        ingredientGroups: [{ id: 'grp-1', options: [{ id: 'opt-1', componentId: 'c-in' }] }],
      },
    ],
    resultGroups: [
      { id: 'rg-1', name: 'Output', results: [{ id: 'res-1', componentId: 'c-out', quantity: 2 }] },
    ],
    steps: [
      {
        id: 'step-1',
        name: 'Forge',
        ingredientSets: [
          {
            id: 'set-2',
            ingredientGroups: [{ id: 'grp-2', options: [{ id: 'opt-2', componentId: 'c-in' }] }],
          },
        ],
        resultGroups: [
          { id: 'rg-2', name: 'Billet', results: [{ id: 'res-2', componentId: 'c-mid' }] },
        ],
      },
    ],
    toolIds: ['tool-1'],
    timeRequirement: { minutes: 30, hours: 1, days: 0, months: 0, years: 0 },
    isVariable: true,
    transferEffects: true,
    outcomeRouting: { mode: 'routedByCheck' },
    resultSelection: { provider: 'check' },
    checkTierId: 'tier-1',
    minSuccessOutcomeId: 'outcome-1',
    craftingModifier: { modifierIds: ['mod-1'] },
    currencyCost: { currencies: [{ abbreviation: 'gp', amount: 5 }] },
    teaser: {
      enabled: false,
      hiddenFields: ['tools'],
      revealThreshold: 40,
      teaserDescription: 'Smells of iron.',
    },
    importSource: { systemId: 'pack-1', importedAt: 99 },
    metadata: METADATA,
  });
}

/** A recipe carrying only identity and authored shape — every omittable field defaulted. */
function minimalRecipe() {
  return new Recipe({
    id: 'r-min',
    name: 'Minimal',
    ingredientSets: [
      {
        id: 'set-1',
        ingredientGroups: [{ id: 'grp-1', options: [{ id: 'opt-1', componentId: 'c-in' }] }],
      },
    ],
    resultGroups: [
      { id: 'rg-1', name: 'Output', results: [{ id: 'res-1', componentId: 'c-out', quantity: 1 }] },
    ],
    metadata: METADATA,
  });
}

// ---------------------------------------------------------------------------
// The retired write alias
// ---------------------------------------------------------------------------

test('1087: toJSON no longer emits the flat top-level results alias', () => {
  const json = maximalRecipe().toJSON();

  assert.ok(!('results' in json), 'the alias is not written');
  assert.deepEqual(
    json.resultGroups.flatMap((group) => group.results.map((result) => result.componentId)),
    ['c-out'],
    'and the canonical result groups still carry every result'
  );
});

test('1087: a legacy payload carrying ONLY the flat alias round-trips with no result lost', () => {
  // THE READ PATH, which is the half that never changes. A world or an exported system
  // written before result groups existed carries its outputs here and nowhere else, so an
  // assertion that the alias is absent from OUTPUT cannot tell "still read" from "dropped" —
  // only re-serializing the reconstruction can.
  const legacy = {
    id: 'r-legacy',
    name: 'Legacy Flat',
    metadata: METADATA,
    results: [
      { id: 'res-a', componentId: 'c-a', quantity: 2 },
      { id: 'res-b', componentId: 'c-b', quantity: 3 },
    ],
  };

  const restored = Recipe.fromJSON(legacy);
  assert.deepEqual(
    restored.results.map((result) => [result.componentId, result.quantity]),
    [
      ['c-a', 2],
      ['c-b', 3],
    ],
    'the alias is still read'
  );

  // The next save is what would lose them: `toJSON` is a whitelist rebuild, so a result the
  // constructor failed to adopt is gone the moment the world writes again.
  const resaved = Recipe.fromJSON(restored.toJSON());
  assert.deepEqual(
    resaved.results.map((result) => [result.componentId, result.quantity]),
    [
      ['c-a', 2],
      ['c-b', 3],
    ],
    'and survives the save that drops the alias'
  );
  assert.ok(!('results' in restored.toJSON()), 'having been rewritten as canonical groups');
});

test('1087: a legacy payload carrying BOTH shapes keeps the canonical groups, not the alias', () => {
  // A payload written by any shipped version to date carries both. The alias is a FALLBACK,
  // so a stale or hand-edited one must not be able to overwrite the authored groups.
  const both = {
    id: 'r-both',
    name: 'Dual',
    metadata: METADATA,
    resultGroups: [
      { id: 'rg-1', name: 'Real', results: [{ id: 'res-real', componentId: 'c-real' }] },
    ],
    results: [{ id: 'res-stale', componentId: 'c-stale' }],
  };

  const restored = Recipe.fromJSON(both);
  assert.deepEqual(
    restored.results.map((result) => result.componentId),
    ['c-real'],
    'the canonical groups win'
  );
  assert.ok(!('results' in restored.toJSON()), 'and the stale alias is not written back');
});

// ---------------------------------------------------------------------------
// The omitted defaults — mechanical guard over the hand-maintained table
// ---------------------------------------------------------------------------

test('1087: every RECIPE_OMITTED_WHEN_DEFAULT key is a field toJSON can actually emit', () => {
  // Catches a typo'd or renamed key, which would otherwise sit in the table forever matching
  // nothing and quietly saving no bytes.
  const emitted = new Set(Object.keys(maximalRecipe().toJSON()));
  const unmatched = Object.keys(RECIPE_OMITTED_WHEN_DEFAULT).filter((key) => !emitted.has(key));

  assert.deepEqual(unmatched, [], 'each table key must name a real serialized field');
});

test('1087: a fully defaulted recipe omits every key in the table', () => {
  // Catches a predicate that disagrees with the constructor's default and therefore never
  // fires — the failure mode that costs the payload saving without any visible symptom.
  const json = minimalRecipe().toJSON();
  const stillEmitted = Object.keys(RECIPE_OMITTED_WHEN_DEFAULT).filter((key) => key in json);

  assert.deepEqual(stillEmitted, [], 'no default-valued field reaches the payload');
});

test('1087: a fully defaulted recipe emits EXACTLY the un-omittable field set', () => {
  // The table-driven assertions above are both scoped BY the table, so neither can see a key
  // DELETED from it: the field silently returns to every payload and the guards stay green.
  // This pins the other side of the same fact — the literal key set on the wire — so growing
  // it needs a deliberate edit here, whichever direction the change came from.
  assert.deepEqual(Object.keys(minimalRecipe().toJSON()).sort((a, b) => a.localeCompare(b)), [
    'complex',
    'enabled',
    'id',
    'ingredientSets',
    'metadata',
    'name',
    'resultGroups',
  ]);
});

test('1087: a defaulted recipe rebuilds every omitted field to the value that was omitted', () => {
  // The other direction: a predicate that fires on a value the constructor does NOT rebuild
  // is silent data loss on the next save. Deep equality over the whole model catches it.
  const original = minimalRecipe();
  assert.deepEqual(Recipe.fromJSON(original.toJSON()), original);
});

test('1087: a maximal recipe round-trips deep-equal through fromJSON(toJSON(r))', () => {
  const original = maximalRecipe();
  assert.deepEqual(Recipe.fromJSON(original.toJSON()), original);
  assert.deepEqual(
    Recipe.fromJSON(JSON.parse(JSON.stringify(original.toJSON()))),
    original,
    'including across the JSON text boundary an export/import crosses'
  );
});

test('1087: the defaults the table omits are exactly the documented ones', () => {
  const json = minimalRecipe().toJSON();
  const restored = Recipe.fromJSON(json);

  assert.equal(restored.img, DEFAULT_RECIPE_IMAGE);
  assert.equal(restored.category, 'general');
  assert.equal(restored.system, 'all');
  assert.equal(restored.allowPlayerResultReorder, true);
  assert.equal(restored.locked, false);
  assert.deepEqual(restored.access, { characterIds: [], playerIds: [] });
  assert.deepEqual(restored.teaser, {
    enabled: true,
    hiddenFields: ['ingredients', 'results', 'description'],
    revealThreshold: 100,
    teaserDescription: '',
  });
  assert.equal(restored.importSource, null);
});

test('1087: complex and metadata are NEVER omitted, because absence does not rebuild them', () => {
  // `complex` absent is DERIVED, not defaulted: two result groups derive `true`, so omitting
  // a stored `false` would flip the authoring mode. `metadata` absent is rebuilt with
  // `Date.now()` and the current user, which is not the value that was omitted.
  const derivesComplex = new Recipe({
    id: 'r-derive',
    name: 'Two Groups',
    complex: false,
    metadata: METADATA,
    resultGroups: [
      { id: 'rg-1', name: 'A', results: [{ id: 'res-1', componentId: 'c-a' }] },
      { id: 'rg-2', name: 'B', results: [{ id: 'res-2', componentId: 'c-b' }] },
    ],
  });

  const json = derivesComplex.toJSON();
  assert.equal(json.complex, false, 'the authored flag is written');
  assert.deepEqual(json.metadata, METADATA, 'and so is the metadata block');
  assert.equal(
    Recipe.fromJSON(json).complex,
    false,
    'so the derivation cannot flip it back to true'
  );
});

test('1087: enabled: true is still emitted, because a live reader tests it for truthiness', () => {
  // `SignatureValidator.validateSystem` scopes its alchemy-collision scan with
  // `recipes.filter((recipe) => recipe?.enabled)` over payloads that
  // `CraftingSystemManager._assertNoAlchemySignatureCollisions` and
  // `collectAlchemySignatureBlockers` hand it straight from `toJSON()`. Omitting the default
  // empties that scan, and the save-block against colliding alchemy signatures silently
  // stops firing. Absence is a live on-disk state for `allowPlayerResultReorder` (nothing
  // ever seeded it) but never for `enabled`, which is why only one of the two is omitted.
  const json = minimalRecipe().toJSON();

  assert.equal(json.enabled, true, 'the enabled flag stays on the wire');
  assert.ok(
    json.resultGroups.filter((group) => group).length > 0,
    'and the scan this protects has groups to scan'
  );
});

// ---------------------------------------------------------------------------
// Measured reduction on a fixed corpus
// ---------------------------------------------------------------------------

/**
 * The payload shape written before this change: the current one plus the flat alias plus every field the
 * table now omits. Derived from the model itself — the in-memory value of an omitted key IS
 * the default that used to be written — so it cannot drift from the table.
 * @param {Recipe} recipe
 * @returns {Record<string, unknown>}
 */
function preRetirementPayload(recipe) {
  const payload = { ...recipe.toJSON() };
  for (const key of Object.keys(RECIPE_OMITTED_WHEN_DEFAULT)) {
    if (!(key in payload)) payload[key] = recipe[key];
  }
  payload.results = recipe.results.map((result) => result.toJSON());
  return payload;
}

test('1087: a representative corpus serializes at least 30% smaller than the pre-retirement shape', () => {
  const corpus = Array.from(
    { length: 200 },
    (_, index) =>
      new Recipe({
        id: `corpus-${index}`,
        name: `Corpus Recipe ${index}`,
        description: 'A representative authored recipe with one set and one result group.',
        craftingSystemId: 'sys-corpus',
        metadata: METADATA,
        ingredientSets: [
          {
            id: `set-${index}`,
            ingredientGroups: [
              { id: `grp-a-${index}`, options: [{ id: `opt-a-${index}`, componentId: 'c-a' }] },
              { id: `grp-b-${index}`, options: [{ id: `opt-b-${index}`, componentId: 'c-b' }] },
            ],
          },
        ],
        resultGroups: [
          {
            id: `rg-${index}`,
            name: 'Output',
            results: [
              { id: `res-a-${index}`, componentId: 'c-out', quantity: 1 },
              { id: `res-b-${index}`, componentId: 'c-scrap', quantity: 3 },
            ],
          },
        ],
      })
  );

  const after = JSON.stringify(corpus.map((recipe) => recipe.toJSON())).length;
  const before = JSON.stringify(corpus.map((recipe) => preRetirementPayload(recipe))).length;
  const reduction = 1 - after / before;

  assert.ok(
    reduction >= 0.3,
    `expected at least a 30% reduction, got ${(reduction * 100).toFixed(1)}% ` +
      `(${before} bytes before, ${after} bytes after)`
  );
});
