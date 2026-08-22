/**
 * Serialized ingredient payload contract (issue 1135).
 *
 * A recipe is rewritten whole on every mutation, replicated to every client, and stringified
 * twice more by `RecipeManager.reload()`'s change comparison, so anything the ingredient
 * subtree emits is paid on every write by every client. Three things it used to emit carry
 * no information:
 *
 *   - `IngredientSet`'s flat `ingredients` alias, a first-option-per-group projection of
 *     `ingredientGroups` — 19.89% of a simple corpus, 21.13% of a rich one;
 *   - `Ingredient`'s `systemItemId`, a byte-for-byte duplicate of `componentId` on the SAME
 *     object;
 *   - the set- and option-level fields whose value is the one the constructor rebuilds from
 *     absence. The option-level ones dominate, because they are paid once per option, per
 *     group, per set: 19.66% of a simple corpus and 47.55% of a rich one.
 *
 * The whole change is WRITE-side, and this suite is the proof:
 *   - both aliases are no longer emitted but are still READ, permanently, and a payload
 *     carrying only the legacy shape survives a full save cycle with every option intact;
 *   - the two omission tables are hand-maintained mirrors of their constructors, so each is
 *     checked mechanically against a maximal and a minimal model rather than by eye;
 *   - the reduction is measured against the pre-retirement shape DERIVED FROM THE LIVE
 *     MODEL, recursing through step, set, group, option and `alternatives`, so the floor
 *     cannot drift away from the tables as fields are added;
 *   - the three production writers that would otherwise re-introduce the alias are pinned,
 *     including the one shape whose flat array is its ONLY ingredient data.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { installFoundryUtilsEnv } from './helpers/foundryEnv.js';

installFoundryUtilsEnv();
globalThis.game = { user: { isGM: true, name: 'GM' } };

const { Ingredient, INGREDIENT_OMITTED_WHEN_DEFAULT } = await import('../src/models/Ingredient.js');
const { IngredientSet, INGREDIENT_SET_OMITTED_WHEN_DEFAULT } = await import(
  '../src/models/IngredientSet.js'
);
const { Recipe } = await import('../src/models/Recipe.js');
const { ingredientSetToolsAreActive } = await import('../src/systems/toolCheckBonus.js');
const { stripComponentsFromRecipeJson } = await import('../src/utils/recipeComponentReferences.js');
const { planRecipeTagRemovals } = await import('../src/utils/vocabularyCascade.js');

const METADATA = { created: 1, modified: 2, author: 'GM', version: '1.0.0' };

/**
 * An option whose every omittable field carries a NON-default value.
 *
 * Built through `fromJSON`, not `new Ingredient`, because only `fromJSON` hydrates
 * `alternatives` into `Ingredient` instances — the constructor keeps whatever it is handed.
 */
function maximalOption() {
  return Ingredient.fromJSON({
    match: { type: 'component', componentId: 'c-max' },
    itemUuid: 'Item.abcdefabcdefabcd',
    quantity: 3,
    alternatives: [{ match: { type: 'currency', unit: 'gp', amount: 5 } }],
    extractEffects: true,
    effectFilter: 'Bless',
  });
}

/**
 * A tag-matching option, whose `tag` is derived from the match.
 *
 * A single fixture cannot carry BOTH a non-null `componentId` and a non-null `tag`: the
 * constructor derives each from a different `match.type`, so they are mutually exclusive for
 * an authored option. The emittability guard therefore unions the two.
 */
function maximalTagOption() {
  return Ingredient.fromJSON({ match: { type: 'tags', tags: ['metal', 'ore'], tagMatch: 'all' } });
}

/** An option carrying only its authored requirement — every omittable field defaulted. */
function minimalOption() {
  return Ingredient.fromJSON({ match: { type: 'currency', unit: 'gp', amount: 5 } });
}

/** A set whose every omittable field carries a NON-default value. */
function maximalSet() {
  return new IngredientSet({
    id: 'set-max',
    name: 'Primary',
    ingredientGroups: [{ id: 'grp-max', name: 'Metals', options: [maximalOption().toJSON()] }],
    essences: { fire: 2 },
    toolIds: ['tool-1'],
    resultMapping: ['res-1'],
    resultGroupId: 'rg-1',
  });
}

/** A set carrying only identity and authored shape — every omittable field defaulted. */
function minimalSet() {
  return new IngredientSet({
    id: 'set-min',
    ingredientGroups: [{ id: 'grp-min', name: 'Metals', options: [minimalOption().toJSON()] }],
  });
}

// ---------------------------------------------------------------------------
// The two retired write aliases
// ---------------------------------------------------------------------------

test('1135: Ingredient.toJSON no longer emits the systemItemId duplicate', () => {
  const json = maximalOption().toJSON();

  assert.ok(!('systemItemId' in json), 'the duplicate is not written');
  assert.equal(json.componentId, 'c-max', 'and the canonical field still carries the reference');
  assert.equal(json.match.componentId, 'c-max', 'as does the canonical match');
});

test('1135: an option carrying ONLY systemItemId still hydrates its component reference', () => {
  // THE READ PATH, which is the half that never changes. Every read fallback in
  // `match/matchTypes.js` stays, because a world or an exported system file authored before
  // the retirement carries the alias as its only component reference.
  const restored = Ingredient.fromJSON({ systemItemId: 'c-legacy', quantity: 2 });

  assert.equal(restored.componentId, 'c-legacy', 'the alias is still read');
  assert.equal(restored.match.type, 'component');

  // The next save is what would lose it: `toJSON` is a whitelist rebuild.
  const resaved = Ingredient.fromJSON(restored.toJSON());
  assert.equal(resaved.componentId, 'c-legacy', 'and survives the save that drops the alias');
  assert.equal(resaved.quantity, 2);
  assert.ok(!('systemItemId' in restored.toJSON()), 'having been rewritten as canonical');
});

test('1135: IngredientSet.toJSON no longer emits the flat ingredients alias', () => {
  const json = maximalSet().toJSON();

  assert.ok(!('ingredients' in json), 'the alias is not written');
  assert.deepEqual(
    json.ingredientGroups.flatMap((group) => group.options.map((option) => option.componentId)),
    ['c-max'],
    'and the canonical groups still carry every option'
  );
});

test('1135: a set carrying ONLY the flat alias round-trips with no ingredient lost', () => {
  // A world or exported system written before ingredient groups existed carries its inputs
  // here and NOWHERE else, so an assertion that the alias is absent from output cannot tell
  // "still read" from "dropped" — only re-serializing the reconstruction can.
  const legacy = {
    id: 'set-legacy',
    ingredients: [
      { componentId: 'c-a', quantity: 2 },
      { componentId: 'c-b', quantity: 3 },
    ],
  };

  const restored = IngredientSet.fromJSON(legacy);
  assert.deepEqual(
    restored.ingredients.map((option) => [option.componentId, option.quantity]),
    [
      ['c-a', 2],
      ['c-b', 3],
    ],
    'the alias is still read'
  );

  const resaved = IngredientSet.fromJSON(restored.toJSON());
  assert.deepEqual(
    resaved.ingredients.map((option) => [option.componentId, option.quantity]),
    [
      ['c-a', 2],
      ['c-b', 3],
    ],
    'and survives the save that drops the alias'
  );
  assert.ok(!('ingredients' in restored.toJSON()), 'having been rewritten as canonical groups');
});

test('1135: a set carrying BOTH shapes keeps the canonical groups, not the alias', () => {
  const both = {
    id: 'set-both',
    ingredientGroups: [{ id: 'grp-1', options: [{ componentId: 'c-real' }] }],
    ingredients: [{ componentId: 'c-stale' }],
  };

  const restored = IngredientSet.fromJSON(both);
  assert.deepEqual(
    restored.ingredients.map((option) => option.componentId),
    ['c-real'],
    'the canonical groups win'
  );
  assert.ok(!('ingredients' in restored.toJSON()), 'and the stale alias is not written back');
});

// ---------------------------------------------------------------------------
// The omitted defaults — mechanical guards over the two hand-maintained tables
// ---------------------------------------------------------------------------

test('1135: every INGREDIENT_OMITTED_WHEN_DEFAULT key is a field toJSON can emit', () => {
  // Catches a typo'd or renamed key, which would otherwise sit in the table forever matching
  // nothing and quietly saving no bytes.
  const emitted = new Set([
    ...Object.keys(maximalOption().toJSON()),
    ...Object.keys(maximalTagOption().toJSON()),
  ]);
  const unmatched = Object.keys(INGREDIENT_OMITTED_WHEN_DEFAULT).filter((key) => !emitted.has(key));

  assert.deepEqual(unmatched, [], 'each table key must name a real serialized field');
});

test('1135: a fully defaulted option omits every key in the ingredient table', () => {
  const json = minimalOption().toJSON();
  const stillEmitted = Object.keys(INGREDIENT_OMITTED_WHEN_DEFAULT).filter((key) => key in json);

  assert.deepEqual(stillEmitted, [], 'no default-valued field reaches the payload');
});

test('1135: a fully defaulted option emits EXACTLY the un-omittable field set', () => {
  // The table-driven guards above are both scoped BY the table, so neither can see a key
  // DELETED from it. This pins the other side of the same fact — the literal key set on the
  // wire — so growing it needs a deliberate edit here.
  assert.deepEqual(Object.keys(minimalOption().toJSON()).sort((a, b) => a.localeCompare(b)), [
    'match',
    'quantity',
  ]);
});

test('1135: every INGREDIENT_SET_OMITTED_WHEN_DEFAULT key is a field toJSON can emit', () => {
  const emitted = new Set(Object.keys(maximalSet().toJSON()));
  const unmatched = Object.keys(INGREDIENT_SET_OMITTED_WHEN_DEFAULT).filter(
    (key) => !emitted.has(key)
  );

  assert.deepEqual(unmatched, [], 'each table key must name a real serialized field');
});

test('1135: a fully defaulted set omits every key in the ingredient-set table', () => {
  const json = minimalSet().toJSON();
  const stillEmitted = Object.keys(INGREDIENT_SET_OMITTED_WHEN_DEFAULT).filter(
    (key) => key in json
  );

  assert.deepEqual(stillEmitted, [], 'no default-valued field reaches the payload');
});

test('1135: a fully defaulted set emits EXACTLY the un-omittable field set', () => {
  assert.deepEqual(Object.keys(minimalSet().toJSON()).sort((a, b) => a.localeCompare(b)), [
    'id',
    'ingredientGroups',
  ]);
});

test('1135: a group emits EXACTLY {id, name, options} and omits none of its own keys', () => {
  // IngredientGroup requirement 5: the group level has NO omission table, because none of
  // its three keys has a reconstructible default worth omitting — the whole group-level
  // saving comes from its options. Nothing pinned that, so a field added to
  // `IngredientGroup.toJSON` would be paid once per group, per set, per recipe unnoticed.
  const [group] = maximalSet().toJSON().ingredientGroups;

  assert.deepEqual(Object.keys(group).sort((a, b) => a.localeCompare(b)), [
    'id',
    'name',
    'options',
  ]);
  // An UNNAMED group emits the same three keys. Both set fixtures author a group name, so
  // without this the assertion above could not tell "no omission table" from "the fixture
  // happened to author every key" — and `name` is the one group key a future table would
  // reach for, since `''` is exactly what the constructor rebuilds from absence.
  const unnamed = new IngredientSet({
    id: 'set-unnamed-group',
    ingredientGroups: [{ id: 'grp-unnamed', options: [minimalOption().toJSON()] }],
  }).toJSON().ingredientGroups[0];

  assert.equal(unnamed.name, '', 'the group name defaulted');
  assert.deepEqual(Object.keys(unnamed).sort((a, b) => a.localeCompare(b)), [
    'id',
    'name',
    'options',
  ]);
});

test('1135: a defaulted option and set rebuild every omitted field to the omitted value', () => {
  // The other direction: a predicate that fires on a value the constructor does NOT rebuild
  // is silent data loss on the next save. Deep equality over the whole model catches it.
  const option = minimalOption();
  assert.deepEqual(Ingredient.fromJSON(option.toJSON()), option);

  const set = minimalSet();
  assert.deepEqual(IngredientSet.fromJSON(set.toJSON()), set);
});

test('1135: a maximal option and set round-trip deep-equal, including across JSON text', () => {
  const option = maximalOption();
  assert.deepEqual(Ingredient.fromJSON(option.toJSON()), option);
  assert.deepEqual(
    Ingredient.fromJSON(JSON.parse(JSON.stringify(option.toJSON()))),
    option,
    'including across the JSON text boundary an export/import crosses'
  );

  const set = maximalSet();
  assert.deepEqual(IngredientSet.fromJSON(set.toJSON()), set);
  assert.deepEqual(IngredientSet.fromJSON(JSON.parse(JSON.stringify(set.toJSON()))), set);
});

test('1135: an authored non-default value is still emitted for every table key', () => {
  const option = maximalOption().toJSON();
  assert.equal(option.componentId, 'c-max');
  assert.equal(option.itemUuid, 'Item.abcdefabcdefabcd');
  assert.equal(option.extractEffects, true);
  assert.equal(option.effectFilter, 'Bless');
  assert.equal(option.alternatives.length, 1);

  const tagged = new Ingredient({ match: { type: 'tags', tags: ['metal'] } }).toJSON();
  assert.equal(tagged.tag, 'metal', 'the derived tag is emitted when the match is a tag match');

  const set = maximalSet().toJSON();
  assert.equal(set.name, 'Primary');
  assert.deepEqual(set.essences, { fire: 2 });
  assert.deepEqual(set.toolIds, ['tool-1']);
  assert.deepEqual(set.resultMapping, ['res-1']);
  assert.equal(set.resultGroupId, 'rg-1');
});

test('1135: a nested alternative is filtered by the same table as its parent option', () => {
  // `alternatives` recurses through `toJSON`, so an unfiltered branch there would leave the
  // largest single win only half taken.
  const json = maximalOption().toJSON();
  const [alternative] = json.alternatives;

  assert.deepEqual(Object.keys(alternative).sort((a, b) => a.localeCompare(b)), [
    'match',
    'quantity',
  ]);
  assert.ok(!('systemItemId' in alternative), 'and the duplicate is gone from the branch too');
});

test('1135: the semantic reader of set.name answers the same for absence and ""', () => {
  // `ingredientSetToolsAreActive` treats a non-empty set name as "tools are active" — the
  // `enabled`-shaped hazard exactly. The omission is safe only because the written default
  // `''` is already the falsy side of that predicate; a non-empty sentinel default would
  // have deactivated every set's tools.
  //
  // The REAL predicate is called rather than restated here, because a restatement pins the
  // model's default and not the reader: with `String(name ?? 'unnamed')` in
  // `toolCheckBonus.js` an OMITTED name would read ACTIVE while a written `''` read
  // INACTIVE, and a test asserting only `String(json.name ?? '').trim() === ''` still
  // passes. `adminRecipeRowProjection` calls this predicate on a raw `toJSON()` set, so
  // that drift would silently turn every unnamed set's `toolIds` into hard requirements.
  //
  // The system carries `routedByIngredients` so the predicate's FIRST clause cannot
  // short-circuit the comparison into vacuity, and the named set is the positive control
  // that proves the predicate can still answer `true` at all.
  const routed = { resolutionMode: 'routedByIngredients' };
  const json = minimalSet().toJSON();

  assert.ok(!('name' in json), 'the empty name is not written');
  assert.equal(
    ingredientSetToolsAreActive(routed, json),
    ingredientSetToolsAreActive(routed, { ...json, name: '' }),
    'the omitted name and an explicitly written "" reach the reader as the same answer'
  );
  assert.equal(
    ingredientSetToolsAreActive(routed, json),
    false,
    'and that shared answer is INACTIVE, so an unnamed set tool id is never a requirement'
  );
  assert.equal(
    ingredientSetToolsAreActive(routed, maximalSet().toJSON()),
    true,
    'while a named set still activates, so the comparison above is not vacuously false'
  );
  assert.equal(IngredientSet.fromJSON(json).name, '', 'which is what the constructor rebuilds');
});

// ---------------------------------------------------------------------------
// The result-group default (Recipe requirement 18, nested row)
// ---------------------------------------------------------------------------

test('1135: an empty checkOutcomeIds is omitted from both result-group emitters', () => {
  const recipe = new Recipe({
    id: 'r-groups',
    name: 'Groups',
    metadata: METADATA,
    resultGroups: [{ id: 'rg-1', name: 'Output', results: [{ id: 'res-1', componentId: 'c-out' }] }],
    steps: [
      {
        id: 'step-1',
        name: 'Forge',
        resultGroups: [
          { id: 'rg-2', name: 'Billet', results: [{ id: 'res-2', componentId: 'c-mid' }] },
        ],
      },
    ],
  });

  const json = recipe.toJSON();
  assert.ok(!('checkOutcomeIds' in json.resultGroups[0]), 'omitted at recipe level');
  assert.ok(!('checkOutcomeIds' in json.steps[0].resultGroups[0]), 'and at step level');
  assert.deepEqual(
    Recipe.fromJSON(json).resultGroups[0].checkOutcomeIds,
    [],
    'and absence rebuilds the empty list the two routed-group arbiters already treat as none'
  );
});

test('1135: a defaulted result group emits EXACTLY the un-omittable field set', () => {
  // The omission test above is scoped to `checkOutcomeIds`, and tests 17/19 plus the
  // round-trips catch a DROPPED field — but nothing caught an ADDED one, unlike the option
  // (`a fully defaulted option emits EXACTLY…`) and set equivalents. `serializeResultGroup`
  // is shared by the recipe-level and step-level emitters, so both are pinned here rather
  // than trusting the sharing to hold.
  const recipe = new Recipe({
    id: 'r-group-keys',
    name: 'Group Keys',
    metadata: METADATA,
    resultGroups: [{ id: 'rg-1', name: 'Output', results: [{ id: 'res-1', componentId: 'c-out' }] }],
    steps: [
      {
        id: 'step-1',
        name: 'Forge',
        resultGroups: [
          { id: 'rg-2', name: 'Billet', results: [{ id: 'res-2', componentId: 'c-mid' }] },
        ],
      },
    ],
  });

  const json = recipe.toJSON();
  const keysOf = (group) => Object.keys(group).sort((a, b) => a.localeCompare(b));

  assert.deepEqual(keysOf(json.resultGroups[0]), ['id', 'name', 'results'], 'at recipe level');
  assert.deepEqual(keysOf(json.steps[0].resultGroups[0]), ['id', 'name', 'results'], 'and at step');
});

test('1135: an authored checkOutcomeIds is still emitted at both levels', () => {
  const recipe = new Recipe({
    id: 'r-routed',
    name: 'Routed',
    metadata: METADATA,
    resultGroups: [
      {
        id: 'rg-1',
        name: 'Output',
        checkOutcomeIds: ['out-1'],
        results: [{ id: 'res-1', componentId: 'c-out' }],
      },
    ],
    steps: [
      {
        id: 'step-1',
        name: 'Forge',
        resultGroups: [
          {
            id: 'rg-2',
            name: 'Billet',
            checkOutcomeIds: ['out-2'],
            results: [{ id: 'res-2', componentId: 'c-mid' }],
          },
        ],
      },
    ],
  });

  const json = recipe.toJSON();
  assert.deepEqual(json.resultGroups[0].checkOutcomeIds, ['out-1']);
  assert.deepEqual(json.steps[0].resultGroups[0].checkOutcomeIds, ['out-2']);
});

test('1135: a failure-role result group keeps its role alongside the omitted default', () => {
  const recipe = new Recipe({
    id: 'r-failure',
    name: 'Failure',
    metadata: METADATA,
    resultGroups: [
      { id: 'rg-1', name: 'Slag', role: 'failure', results: [{ id: 'res-1', componentId: 'c-x' }] },
    ],
  });

  const json = recipe.toJSON();
  assert.equal(json.resultGroups[0].role, 'failure');
  assert.ok(!('checkOutcomeIds' in json.resultGroups[0]));
});

// ---------------------------------------------------------------------------
// The three production writers that would otherwise put the alias straight back
// ---------------------------------------------------------------------------

/** A recipe json whose single set is authored with groups. */
function groupedRecipeJson(componentIds) {
  return new Recipe({
    id: 'r-grouped',
    name: 'Grouped',
    metadata: METADATA,
    ingredientSets: [
      {
        id: 'set-1',
        ingredientGroups: componentIds.map((componentId, index) => ({
          id: `grp-${index}`,
          options: [{ match: { type: 'component', componentId } }],
        })),
      },
    ],
    resultGroups: [{ id: 'rg-1', name: 'Output', results: [{ id: 'res-1', componentId: 'c-out' }] }],
  }).toJSON();
}

test('1135: the component-delete cascade does not re-emit the alias for a grouped set', () => {
  const { json } = stripComponentsFromRecipeJson(groupedRecipeJson(['iron', 'tin', 'copper']), [
    'iron',
    'tin',
  ]);

  const [set] = json.ingredientSets;
  assert.deepEqual(
    set.ingredientGroups.flatMap((group) => group.options.map((o) => o.match.componentId)),
    ['copper'],
    'only the unselected option survives'
  );
  assert.ok(!('ingredients' in set), 'and the retired alias is not recomputed back onto the wire');
  assert.deepEqual(
    IngredientSet.fromJSON(set).ingredients.map((option) => option.componentId),
    ['copper'],
    'the in-memory mirror is derived from the surviving groups on read'
  );
});

test('1135: the component-delete cascade KEEPS a flat-authored set data', () => {
  // The load-bearing case. Dropping the alias unconditionally destroys a flat-authored set's
  // ONLY ingredient data, and the `set.ingredients?.length` leg of the retention filter is
  // what keeps that set alive at all.
  const flat = {
    id: 'r-flat',
    name: 'Flat',
    metadata: METADATA,
    ingredientSets: [
      { id: 'set-1', ingredients: [{ componentId: 'iron' }, { componentId: 'copper' }] },
    ],
    resultGroups: [{ id: 'rg-1', name: 'Output', results: [{ id: 'res-1', componentId: 'c-out' }] }],
  };

  const { json } = stripComponentsFromRecipeJson(flat, ['iron']);
  const [set] = json.ingredientSets;

  assert.deepEqual(
    set.ingredients.map((ingredient) => ingredient.componentId),
    ['copper'],
    'the flat array is filtered in place and KEPT — it is the set only ingredient data'
  );
  assert.deepEqual(
    IngredientSet.fromJSON(set).ingredients.map((option) => option.componentId),
    ['copper'],
    'so the set still hydrates its surviving requirement'
  );
});

test('1135: a flat-authored set whose every ingredient is deleted is still dropped', () => {
  const flat = {
    id: 'r-flat-empty',
    name: 'Flat',
    metadata: METADATA,
    ingredientSets: [{ id: 'set-1', ingredients: [{ componentId: 'iron' }] }],
    resultGroups: [{ id: 'rg-1', name: 'Output', results: [{ id: 'res-1', componentId: 'c-out' }] }],
  };

  const { json } = stripComponentsFromRecipeJson(flat, ['iron']);
  assert.deepEqual(json.ingredientSets, [], 'the set has nothing left to require');
});

test('1135: an essence-only set survives the component cascade WITHOUT an empty alias', () => {
  const essenceOnly = {
    id: 'r-essence',
    name: 'Essence',
    metadata: METADATA,
    ingredientSets: [{ id: 'set-1', essences: { fire: 2 }, ingredients: [{ componentId: 'iron' }] }],
    resultGroups: [{ id: 'rg-1', name: 'Output', results: [{ id: 'res-1', componentId: 'c-out' }] }],
  };

  const { json } = stripComponentsFromRecipeJson(essenceOnly, ['iron']);
  const [set] = json.ingredientSets;

  assert.deepEqual(set.essences, { fire: 2 }, 'the essence requirement keeps the set alive');
  assert.ok(!('ingredients' in set), 'and no empty alias is written for it');
});

test('1135: the tag cascade drops the stale mirror instead of leaving it naming the tag', () => {
  // `planRecipeTagRemovals` returned `{ ...set, ingredientGroups: next }` and never touched
  // the mirror, so a tag delete left the retired alias still naming the tag it had removed —
  // a latent instance of the same defect class, live today.
  const recipe = new Recipe({
    id: 'r-tagged',
    name: 'Tagged',
    metadata: METADATA,
    ingredientSets: [
      {
        id: 'set-1',
        ingredientGroups: [
          { id: 'grp-1', options: [{ match: { type: 'tags', tags: ['metal', 'ore'] } }] },
        ],
      },
    ],
    resultGroups: [{ id: 'rg-1', name: 'Output', results: [{ id: 'res-1', componentId: 'c-out' }] }],
  }).toJSON();
  // A payload written before the retirement still carries the alias; the cascade must not
  // hand it forward.
  recipe.ingredientSets[0].ingredients = [{ match: { type: 'tags', tags: ['metal', 'ore'] } }];

  const [patch] = planRecipeTagRemovals([recipe], 'metal');
  const [set] = patch.updates.ingredientSets;

  assert.ok(
    !('ingredients' in set),
    'the stale mirror is dropped rather than carried through the spread'
  );
  assert.deepEqual(set.ingredientGroups[0].options[0].match.tags, ['ore']);
  assert.deepEqual(
    IngredientSet.fromJSON(set).ingredients.map((option) => option.match.tags),
    [['ore']],
    'and the in-memory mirror is re-derived from the rewritten groups'
  );
});

test('1135: the tag cascade still filters a FLAT-authored set in place', () => {
  const flat = {
    id: 'r-flat-tags',
    name: 'Flat',
    metadata: METADATA,
    ingredientSets: [
      { id: 'set-1', ingredients: [{ match: { type: 'tags', tags: ['metal', 'ore'] } }] },
    ],
  };

  const [patch] = planRecipeTagRemovals([flat], 'metal');
  assert.deepEqual(
    patch.updates.ingredientSets[0].ingredients[0].match.tags,
    ['ore'],
    'a set with no groups keeps and rewrites its own array'
  );
});

// ---------------------------------------------------------------------------
// Measured reduction on two fixed corpora
// ---------------------------------------------------------------------------

/**
 * The option payload written before this change: the current one, plus every key the
 * ingredient table now omits, plus the `systemItemId` duplicate, recursing through
 * `alternatives`.
 *
 * EVERY reinstated value comes from the live instance and never from a literal, which is the
 * whole point of the shape: a hand-written default here would let the table and the floor
 * drift apart, which is the failure mode this test exists to prevent.
 *
 * @param {import('../src/models/Ingredient.js').Ingredient} option
 * @returns {Record<string, unknown>}
 */
function preRetirementOption(option) {
  const payload = { ...option.toJSON() };
  for (const key of Object.keys(INGREDIENT_OMITTED_WHEN_DEFAULT)) {
    if (!(key in payload)) payload[key] = option[key];
  }
  payload.systemItemId = option.componentId;
  payload.alternatives = option.alternatives.map(preRetirementOption);
  return payload;
}

/** The group payload written before this change: its options, pre-retirement. */
function preRetirementGroup(group) {
  return { ...group.toJSON(), options: group.options.map(preRetirementOption) };
}

/**
 * The set payload written before this change: the current one, plus every key the set table
 * now omits, plus the flat `ingredients` alias, over pre-retirement groups and options.
 * @param {import('../src/models/IngredientSet.js').IngredientSet} set
 * @returns {Record<string, unknown>}
 */
function preRetirementSet(set) {
  const payload = { ...set.toJSON() };
  for (const key of Object.keys(INGREDIENT_SET_OMITTED_WHEN_DEFAULT)) {
    if (!(key in payload)) payload[key] = set[key];
  }
  payload.ingredientGroups = set.ingredientGroups.map(preRetirementGroup);
  payload.ingredients = set.ingredients.map(preRetirementOption);
  return payload;
}

/** The result-group payload written before this change: `checkOutcomeIds` reinstated. */
function preRetirementResultGroup(group) {
  return {
    id: group.id,
    name: group.name,
    ...(group.role === 'failure' && { role: 'failure' }),
    checkOutcomeIds: group.checkOutcomeIds,
    results: group.results.map((result) => result.toJSON()),
  };
}

/**
 * The whole recipe payload written before this change, INCLUDING the per-step subtree.
 *
 * The step recursion is inert on both corpora below, since neither authors a step — but a
 * floor that silently weakens is worse than one that fails. Without it, a corpus that later
 * gained a step would move its whole `steps[]` ingredient and result payload from the
 * `before` side to neither side, understating the reduction and letting the asserted floor
 * pass on a smaller real win than it claims to measure.
 *
 * `toJSON` maps `this.steps` 1:1 and in order, so the index resolves each serialized step
 * back to the live one whose sets and result groups are the INSTANCES the two reinstatement
 * helpers read their omitted values off.
 *
 * The key is written back only when the recipe HAS a step, and that is not a tidiness
 * detail. `steps: []` is omitted by `RECIPE_OMITTED_WHEN_DEFAULT`, which is issue 1087's
 * recipe-level table and not this change's — so writing the empty array onto the `before`
 * side would credit another issue's 11 bytes per recipe to this one and inflate both
 * measured floors. `ingredientSets` and `resultGroups` need no such guard: both are
 * deliberately absent from that table and are always emitted.
 */
function preRetirementRecipe(recipe) {
  const json = recipe.toJSON();
  return {
    ...json,
    ...(recipe.steps.length > 0 && {
      steps: json.steps.map((step, index) => ({
        ...step,
        ingredientSets: recipe.steps[index].ingredientSets.map(preRetirementSet),
        resultGroups: recipe.steps[index].resultGroups.map(preRetirementResultGroup),
      })),
    }),
    ingredientSets: recipe.ingredientSets.map(preRetirementSet),
    resultGroups: recipe.resultGroups.map(preRetirementResultGroup),
  };
}

/** One authored component option, as the simple corpus writes them. */
const componentOption = (componentId) => ({ match: { type: 'component', componentId } });

/** A corpus of one-option-per-group recipes — the FLOOR of the win. */
function simpleCorpus() {
  return Array.from(
    { length: 200 },
    (_unused, index) =>
      new Recipe({
        id: `simple-${index}`,
        name: `Simple Recipe ${index}`,
        description: 'A representative authored recipe with one set and one result group.',
        craftingSystemId: 'sys-corpus',
        metadata: METADATA,
        ingredientSets: [
          {
            id: `set-${index}`,
            name: `Set ${index}`,
            ingredientGroups: [
              { id: `grp-a-${index}`, name: 'Group 1', options: [componentOption('c-a')] },
              { id: `grp-b-${index}`, name: 'Group 2', options: [componentOption('c-b')] },
            ],
          },
        ],
        resultGroups: [
          {
            id: `rg-${index}`,
            name: 'Output',
            results: [{ id: `res-${index}`, componentId: 'c-out', quantity: 1 }],
          },
        ],
      })
  );
}

/** A corpus of multi-option, tag, currency and alternative-bearing groups. */
function richCorpus() {
  return Array.from(
    { length: 200 },
    (_unused, index) =>
      new Recipe({
        id: `rich-${index}`,
        name: `Rich Recipe ${index}`,
        description: 'A representative authored recipe with alternative-heavy groups.',
        craftingSystemId: 'sys-corpus',
        metadata: METADATA,
        ingredientSets: [
          {
            id: `set-${index}`,
            name: `Set ${index}`,
            toolIds: ['tool-1'],
            ingredientGroups: [
              {
                id: `grp-a-${index}`,
                name: 'Group 1',
                options: [
                  componentOption('c-a'),
                  componentOption('c-b'),
                  { match: { type: 'tags', tags: ['metal', 'ore'], tagMatch: 'any' } },
                ],
              },
              {
                id: `grp-b-${index}`,
                name: 'Group 2',
                options: [
                  {
                    match: { type: 'component', componentId: 'c-c' },
                    alternatives: [componentOption('c-d')],
                  },
                  { match: { type: 'currency', unit: 'gp', amount: 25 } },
                  { match: { type: 'essence', essenceId: 'fire', amount: 3 } },
                ],
              },
            ],
          },
        ],
        resultGroups: [
          {
            id: `rg-${index}`,
            name: 'Output',
            results: [{ id: `res-${index}`, componentId: 'c-out', quantity: 1 }],
          },
        ],
      })
  );
}

/**
 * @param {Recipe[]} corpus
 * @returns {{before: number, after: number, reduction: number}}
 */
function measure(corpus) {
  const after = JSON.stringify(corpus.map((recipe) => recipe.toJSON())).length;
  const before = JSON.stringify(corpus.map(preRetirementRecipe)).length;
  return { before, after, reduction: 1 - after / before };
}

test('1135: a SIMPLE-shaped corpus serializes at least 30% smaller than the pre-retirement shape', (t) => {
  const { before, after, reduction } = measure(simpleCorpus());
  t.diagnostic(`simple corpus: ${before} -> ${after} bytes (${(reduction * 100).toFixed(2)}%)`);

  assert.ok(
    reduction >= 0.3,
    `expected at least a 30% reduction, got ${(reduction * 100).toFixed(1)}% ` +
      `(${before} bytes before, ${after} bytes after)`
  );
});

test('1135: a RICH-shaped corpus serializes at least 50% smaller than the pre-retirement shape', (t) => {
  // One option per group is the floor of the win; multi-option, tag, currency and
  // alternative-bearing groups are where the option-level fields dominate.
  const { before, after, reduction } = measure(richCorpus());
  t.diagnostic(`rich corpus: ${before} -> ${after} bytes (${(reduction * 100).toFixed(2)}%)`);

  assert.ok(
    reduction >= 0.5,
    `expected at least a 50% reduction, got ${(reduction * 100).toFixed(1)}% ` +
      `(${before} bytes before, ${after} bytes after)`
  );
});

test('1135: the pre-retirement shape reinstates the STEP subtree, not just recipe level', () => {
  // Neither corpus authors a step, so the step recursion above is inert TODAY and this is
  // the only thing holding it live. Measuring a corpus that gained a step against a
  // recipe-level-only `before` would understate the reduction and quietly weaken the floor.
  const recipe = new Recipe({
    id: 'r-stepped',
    name: 'Stepped',
    metadata: METADATA,
    steps: [
      {
        id: 'step-1',
        name: 'Forge',
        ingredientSets: [
          {
            id: 'set-1',
            ingredientGroups: [{ id: 'grp-1', name: 'Metals', options: [componentOption('c-a')] }],
          },
        ],
        resultGroups: [
          { id: 'rg-1', name: 'Billet', results: [{ id: 'res-1', componentId: 'c-mid' }] },
        ],
      },
    ],
  });

  const [step] = preRetirementRecipe(recipe).steps;
  const [set] = step.ingredientSets;

  assert.ok('ingredients' in set, 'the retired flat alias is reinstated on the step set');
  assert.deepEqual(
    Object.keys(INGREDIENT_SET_OMITTED_WHEN_DEFAULT).filter((key) => !(key in set)),
    [],
    'as is every omitted set-level default'
  );
  const [option] = set.ingredientGroups[0].options;
  assert.ok('systemItemId' in option, 'and the duplicate on the step set own options');
  assert.deepEqual(
    Object.keys(INGREDIENT_OMITTED_WHEN_DEFAULT).filter((key) => !(key in option)),
    [],
    'as is every omitted option-level default'
  );
  assert.ok(
    'checkOutcomeIds' in step.resultGroups[0],
    'and the step result group carries the reinstated default too'
  );

  // The point of all of the above: the step subtree lands on the `before` side of the ratio.
  assert.ok(
    measure([recipe]).reduction > 0,
    'so a stepped recipe measures a reduction rather than none'
  );
});

test('1135: the whole corpus round-trips deep-equal, so nothing measured away was needed', () => {
  for (const recipe of [...simpleCorpus().slice(0, 5), ...richCorpus().slice(0, 5)]) {
    assert.deepEqual(Recipe.fromJSON(recipe.toJSON()), recipe, recipe.id);
  }
});
