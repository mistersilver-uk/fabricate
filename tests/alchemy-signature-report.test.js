/**
 * The revisioned alchemy signature report (issue 1074, under #1070).
 *
 * Two things are under test and they fail in opposite directions, so both are pinned here:
 *
 * 1. **The cache is FAST.** One full audit per cold revision, zero on an unchanged one, a
 *    bounded number of recipe-corpus copies however many rows are prepared, and a candidate
 *    compared against an indexed cohort rather than every pair in the system.
 * 2. **The cache is RIGHT.** `SignatureValidator.validateSystem` is deliberately left as the
 *    unpruned oracle, and every answer the cached path gives is asserted against it. A
 *    signature answer that goes stale does not merely render something wrong — it permits or
 *    refuses a GM's save — so the staleness cases are enumerated one clause at a time.
 *
 * The counters read here are the module-level ones in `SignatureValidator`, not a per-
 * instance wrapper: the row path builds its own validator inside `RecipeManager`, so a
 * wrapper can only see the instances a test constructed itself.
 */
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { installFoundryEnv } from './helpers/foundryEnv.js';

installFoundryEnv();

const { Recipe } = await import('../src/models/Recipe.js');
const { RecipeManager } = await import('../src/systems/RecipeManager.js');
const { SignatureValidator, readSignatureCounters, resetSignatureCounters } = await import(
  '../src/systems/SignatureValidator.js'
);
const { REVISION_SCOPES } = await import('../src/systems/revisionTokens.js');

const SYSTEM_ID = 'sys-alchemy';

function component(id) {
  return { id, name: `Component ${id}`, tags: [] };
}

/**
 * A recipe whose ingredient sets each require exactly the listed components.
 *
 * @param {string} id
 * @param {string[][]} sets one component-id list per ingredient set.
 * @param {{enabled?: boolean}} [options]
 * @returns {object}
 */
function recipePayload(id, sets, { enabled = true } = {}) {
  return {
    id,
    name: `Recipe ${id}`,
    craftingSystemId: SYSTEM_ID,
    enabled,
    ingredientSets: sets.map((componentIds, index) => ({
      id: `${id}-set-${index}`,
      name: `Set ${index + 1}`,
      ingredientGroups: componentIds.map((componentId, groupIndex) => ({
        id: `${id}-grp-${index}-${groupIndex}`,
        name: 'Ingredients',
        options: [{ componentId, quantity: 1 }],
      })),
      essences: {},
    })),
    resultGroups: [
      { id: `${id}-rg`, results: [{ id: `${id}-r`, itemUuid: 'Item.result', quantity: 1 }] },
    ],
  };
}

/**
 * A crafting-system manager double that mints the `system:<id>` revision scope itself, so a
 * test can move the system token without persisting anything.
 */
function makeSystemManager({ resolutionMode = 'alchemy', components } = {}) {
  const system = { id: SYSTEM_ID, resolutionMode, components };
  let token = 0;
  return {
    system,
    getSystem: (id) => (id === SYSTEM_ID ? system : null),
    getComponentsForSystem: (id) => (id === SYSTEM_ID ? system.components : []),
    revision: (scope) => (scope === REVISION_SCOPES.system(SYSTEM_ID) ? token : 0),
    /** Stand in for the `save()` that advances the scope in production. */
    advance: () => {
      token += 1;
    },
  };
}

function makeManager({ recipes, resolutionMode = 'alchemy', components } = {}) {
  const componentLibrary = components ?? ['c1', 'c2', 'c3', 'c4'].map(component);
  const systemManager = makeSystemManager({ resolutionMode, components: componentLibrary });
  const manager = new RecipeManager({ getCraftingSystemManager: () => systemManager });
  manager.initialized = true;
  for (const payload of recipes) manager.recipes.set(payload.id, new Recipe(payload));
  return { manager, systemManager };
}

/**
 * The full-audit answer, reproduced exactly: an unpruned audit over the live cohort with the
 * candidate IN it — substituted for its stored copy, or appended when it has none (issue
 * 1167) — filtered to the conflicts naming it.
 *
 * This is the oracle every cached answer below is compared against. The append leg matters
 * as much as the substitution leg: an oracle that only substituted would answer `[]` for a
 * not-yet-stored candidate, and would then agree with the vacuous gate rather than judge it.
 *
 * @param {object} manager
 * @param {object} systemManager
 * @param {object} candidate
 * @returns {object[]}
 */
function oracleConflicts(manager, systemManager, candidate) {
  const validator = new SignatureValidator({
    getSystem: (id) => systemManager.getSystem(id),
    getRecipesForSystem: (id) => {
      const cohort = manager.getRecipes({ craftingSystemId: id });
      const substituted = cohort.map((existing) =>
        existing.id === candidate.id ? candidate : existing
      );
      const stored = cohort.some((existing) => existing.id === candidate.id);
      return stored ? substituted : [...substituted, candidate];
    },
    getComponentsForSystem: (id) => systemManager.getComponentsForSystem(id),
  });
  return validator.validateRecipe(candidate, SYSTEM_ID).conflicts;
}

/** The candidate `canActivateRecipe` builds: the stored recipe, forced enabled. */
function enabledClone(recipe) {
  return Recipe.fromJSON({ ...recipe.toJSON(), enabled: true });
}

/** Every conflict message the cached activation gate reports for one stored recipe. */
function gateMessages(manager, recipeId) {
  return manager.canActivateRecipe(recipeId).issues.filter((issue) => issue.code === 'signatureCollision');
}

// A corpus with three distinct collision shapes: a plain colliding pair, a bystander that
// collides with nobody, a two-set recipe that collides through only one of its sets, and a
// DISABLED recipe that would collide the moment it is enabled.
const COLLIDING_CORPUS = [
  recipePayload('r-a', [['c1']]),
  recipePayload('r-b', [['c1']]),
  recipePayload('r-c', [['c2']]),
  recipePayload('r-d', [['c3'], ['c1']]),
  recipePayload('r-e', [['c1']], { enabled: false }),
];

describe('the cached alchemy signature gate agrees with the full-audit oracle', () => {
  beforeEach(() => resetSignatureCounters());

  it('reports the same conflicts as a substituted full audit, for every recipe', () => {
    const { manager, systemManager } = makeManager({ recipes: COLLIDING_CORPUS });

    for (const recipe of manager.getRecipes({ craftingSystemId: SYSTEM_ID })) {
      const candidate = enabledClone(recipe);
      assert.deepEqual(
        manager.canActivateRecipe(recipe.id).issues.filter((i) => i.code === 'signatureCollision'),
        oracleConflicts(manager, systemManager, candidate).map((conflict) => ({
          code: conflict.code,
          params: conflict.params,
          message: conflict.message,
        })),
        `cached gate disagreed with the oracle for ${recipe.id}`
      );
    }
  });

  it('refuses to enable a DISABLED recipe whose signature already exists', () => {
    const { manager } = makeManager({ recipes: COLLIDING_CORPUS });
    const blocked = gateMessages(manager, 'r-e');
    assert.equal(blocked.length, 3, 'r-e collides with r-a, r-b and r-d’s second set once enabled');
    assert.ok(
      blocked.every((issue) => /Overlapping signatures/.test(issue.message)),
      'the refusal keeps its localizable collision issue'
    );
  });

  it('accepts a recipe whose signature is unique', () => {
    const { manager } = makeManager({ recipes: COLLIDING_CORPUS });
    assert.deepEqual(gateMessages(manager, 'r-c'), []);
  });

  it('orders a candidate’s conflicts as the full audit does', () => {
    // r-d sits AFTER r-a and r-b in the cohort and collides with both through its SECOND
    // set, so a naive "conflicts I found, in the order I found them" would invert the pair.
    const { manager, systemManager } = makeManager({ recipes: COLLIDING_CORPUS });
    const candidate = enabledClone(manager.getRecipe('r-d'));
    const cached = manager.canActivateRecipe('r-d').issues.filter((i) => i.code === 'signatureCollision');
    assert.deepEqual(
      cached.map((issue) => issue.message),
      oracleConflicts(manager, systemManager, candidate).map((conflict) => conflict.message)
    );
    assert.ok(cached.length >= 2, 'the ordering assertion needs more than one conflict');
  });

  it('orders an INCREMENTALLY-checked candidate’s conflicts as the full audit does', () => {
    // The ordering case the fast path cannot cover. r-z is disabled, so it is answered from
    // the index — and its FIRST set collides with a LATER recipe (r-c) than its second set's
    // colliders (r-a, r-b). Discovery order is therefore set-by-set while audit order is
    // collider-by-collider, so the two disagree unless the pairs are re-sorted into the audit's
    // own `(cohortIndex, setIndex)` order.
    const corpus = [...COLLIDING_CORPUS, recipePayload('r-z', [['c2'], ['c1']], { enabled: false })];
    const { manager, systemManager } = makeManager({ recipes: corpus });
    const candidate = enabledClone(manager.getRecipe('r-z'));

    const expected = oracleConflicts(manager, systemManager, candidate).map((c) => c.message);
    assert.equal(expected.length, 4, 'the ordering assertion needs several conflicts');
    assert.deepEqual(manager._validateSignatures(candidate).errors, expected);
  });

  it('answers a NOT-YET-STORED candidate as an audit of the post-create cohort would', () => {
    // Issue 1167: `createRecipe` and `importRecipes` gate before the recipe reaches the map,
    // so the candidate has no stored copy to substitute for. It is appended instead, and the
    // answer must match the unpruned audit pair for pair AND in audit order — including
    // which side of each conflict the newcomer lands on, which the append position decides.
    const { manager, systemManager } = makeManager({ recipes: COLLIDING_CORPUS });
    const candidate = new Recipe(recipePayload('r-new', [['c1']]));

    const expected = oracleConflicts(manager, systemManager, candidate).map((c) => c.message);
    assert.equal(expected.length, 3, 'r-new collides with r-a, r-b and r-d’s second set');
    assert.deepEqual(manager._validateSignatures(candidate).errors, expected);
    assert.ok(
      expected.every((message) => /and "Recipe r-new"/.test(message)),
      `an appended candidate is the SECOND side of every pair: ${expected.join(' | ')}`
    );
    assert.ok(!manager.recipes.has('r-new'), 'the gate stores nothing');
  });

  it('answers an EDITED candidate from the indexed cohort, not from the filed conflicts', () => {
    // The fast path may only fire for a candidate that compiles to the entries already in
    // the report. An edit that moves a recipe onto a colliding signature must be caught.
    const { manager, systemManager } = makeManager({ recipes: COLLIDING_CORPUS });
    manager.canActivateRecipe('r-c'); // warm the report while r-c is still unique
    const edited = Recipe.fromJSON({
      ...manager.getRecipe('r-c').toJSON(),
      enabled: true,
      ingredientSets: recipePayload('r-c', [['c1']]).ingredientSets,
    });
    const conflicts = manager._validateSignatures(edited);
    assert.equal(conflicts.valid, false, 'the edited signature now collides with r-a and r-b');
    assert.deepEqual(
      conflicts.errors,
      oracleConflicts(manager, systemManager, edited).map((conflict) => conflict.message)
    );
  });
});

describe('the alchemy signature report is compiled once per revision', () => {
  beforeEach(() => resetSignatureCounters());

  it('prepares N rows with ONE audit and no per-row comparisons', () => {
    const recipes = Array.from({ length: 40 }, (_unused, index) =>
      recipePayload(`row-${index}`, [[`c${(index % 3) + 1}`]])
    );
    const { manager } = makeManager({ recipes });

    for (const recipe of manager.getRecipes({ craftingSystemId: SYSTEM_ID })) {
      manager.canActivateRecipe(recipe.id);
    }

    const cold = readSignatureCounters();
    assert.equal(cold.reportBuilds, 1, '40 rows must not trigger 40 audits');
    // One audit over 40 single-set recipes is exactly 40*39/2 pairs, and the rows add none.
    assert.equal(cold.signatureComparisons, (40 * 39) / 2);
  });

  it('re-reads rows on an unchanged revision with ZERO recompilation', () => {
    const { manager } = makeManager({ recipes: COLLIDING_CORPUS });
    for (const recipe of manager.getRecipes({ craftingSystemId: SYSTEM_ID })) {
      manager.canActivateRecipe(recipe.id);
    }

    resetSignatureCounters();
    for (const recipe of manager.getRecipes({ craftingSystemId: SYSTEM_ID })) {
      manager.canActivateRecipe(recipe.id);
    }
    const warm = readSignatureCounters();
    assert.equal(warm.reportBuilds, 0, 'an unchanged revision must recompile nothing');
    // The four ENABLED rows are answered from the report with no comparison at all. The
    // DISABLED r-e is the only row that still has a question to ask — "would enabling this
    // collide?" — and it asks it of its three indexed candidates, not of all ten pairs the
    // system holds.
    assert.equal(warm.signatureComparisons, 3);
  });

  it('copies the recipe corpus a BOUNDED number of times, not once per row', () => {
    const recipes = Array.from({ length: 30 }, (_unused, index) =>
      recipePayload(`row-${index}`, [[`c${(index % 3) + 1}`]])
    );
    const { manager } = makeManager({ recipes });

    let copies = 0;
    const original = manager.getRecipes.bind(manager);
    manager.getRecipes = (filters) => {
      copies += 1;
      return original(filters);
    };

    for (const id of [...manager.recipes.keys()]) manager.canActivateRecipe(id);
    assert.equal(copies, 1, '30 rows must share the single cohort copy the audit made');
  });
});

describe('the signature report invalidates when the world moves under it', () => {
  beforeEach(() => resetSignatureCounters());

  it('recompiles after a recipe UPDATE advances the recipe token', async () => {
    const { manager } = makeManager({ recipes: COLLIDING_CORPUS });
    assert.equal(gateMessages(manager, 'r-e').length, 3);

    // Move r-a off the shared signature: r-e now collides with r-b and r-d only.
    await manager.updateRecipe('r-a', { ingredientSets: recipePayload('r-a', [['c4']]).ingredientSets });
    assert.equal(gateMessages(manager, 'r-e').length, 2, 'a stale report would still report 3');
  });

  it('recompiles after a SYSTEM revision advances (a component/tag edit)', () => {
    // A TAG requirement, because that is the shape whose expansion the component library
    // actually decides: a bare `componentId` option expands to its own id whether or not the
    // system still manages that component, so it could never show this clause working.
    const components = [
      { id: 'c1', name: 'Iron', tags: ['metal'] },
      { id: 'c2', name: 'Gold', tags: ['metal'] },
    ];
    const tagged = {
      ...recipePayload('t-a', [['c1']]),
      ingredientSets: [
        {
          id: 't-a-set-0',
          name: 'Set 1',
          ingredientGroups: [
            {
              id: 't-a-grp',
              name: 'Ingredients',
              options: [{ quantity: 1, match: { type: 'tags', tags: ['metal'], tagMatch: 'any' } }],
            },
          ],
          essences: {},
        },
      ],
    };
    const { manager, systemManager } = makeManager({
      recipes: [tagged, recipePayload('t-b', [['c1']], { enabled: false })],
      components,
    });
    assert.equal(gateMessages(manager, 't-b').length, 1, 'the tag set covers c1');

    // Dropping Iron leaves the tag expanding to Gold alone, which no longer overlaps t-b.
    // In production this edit is a `CraftingSystemManager.save()`, which advances the scope.
    systemManager.system.components = components.filter((entry) => entry.id !== 'c1');
    systemManager.advance();
    assert.deepEqual(
      gateMessages(manager, 't-b'),
      [],
      'a report keyed on the recipe token alone would still refuse t-b'
    );
  });

  it('recompiles after an IN-PLACE enabled flip that advances no token', () => {
    // The clause tokens alone cannot cover. `disableSignatureConflicts` is the one manager
    // path that mutates a stored recipe rather than replacing it, and a fixture flipping the
    // flag directly (several suites in this repository do) is indistinguishable from it.
    const { manager } = makeManager({ recipes: COLLIDING_CORPUS });
    assert.equal(gateMessages(manager, 'r-e').length, 3);

    const before = manager.revision(REVISION_SCOPES.recipesOfSystem(SYSTEM_ID));
    for (const id of ['r-a', 'r-b', 'r-d']) manager.recipes.get(id).enabled = false;
    assert.equal(
      manager.revision(REVISION_SCOPES.recipesOfSystem(SYSTEM_ID)),
      before,
      'the premise of this test is that NO token moved'
    );

    assert.deepEqual(
      gateMessages(manager, 'r-e'),
      [],
      'a report keyed on tokens alone would still refuse r-e against three disabled recipes'
    );
  });

  it('recompiles when a DISABLED recipe MOVES into the system', () => {
    // The one mutation none of the other clauses can see, and the reason the recipe token is
    // consumed rather than inferred from the object graph: the map is the same object at the
    // same size, the system and its components are untouched, and the newcomer is disabled so
    // the enabled cohort does not move either. Only `recipes:<systemId>` advanced.
    const outsider = { ...recipePayload('r-x', [['c1']], { enabled: false }), craftingSystemId: 'other' };
    const { manager } = makeManager({ recipes: [...COLLIDING_CORPUS, outsider] });
    assert.equal(gateMessages(manager, 'r-e').length, 3, 'warm the report BEFORE the move');
    assert.deepEqual(gateMessages(manager, 'r-x'), [], 'r-x starts in another system');

    manager.recipes.set('r-x', new Recipe({ ...outsider, craftingSystemId: SYSTEM_ID }));
    manager._advanceRecipeRevision('other', SYSTEM_ID);

    assert.equal(
      gateMessages(manager, 'r-x').length,
      3,
      'the newcomer is scanned against the system it moved into'
    );

    // The assertion above no longer BINDS on its own: since issue 1167 a candidate the
    // report has no slot for is appended to the scan rather than answered "no conflict", so
    // it reads correctly from a stale report too. What a stale report cannot get right is
    // what it tells a recipe it ALREADY holds, so the newcomer is enabled and an incumbent
    // is asked — an answer that can only come from the report's own compiled entries.
    manager.recipes.set(
      'r-x',
      new Recipe({ ...outsider, craftingSystemId: SYSTEM_ID, enabled: true })
    );
    manager._advanceRecipeRevision(SYSTEM_ID);

    assert.equal(
      gateMessages(manager, 'r-e').length,
      4,
      'a stale report would still report r-e colliding with three recipes, not four'
    );
  });

  it('recompiles after an IN-PLACE component edit that advances the system token', () => {
    // The sibling above replaces the components ARRAY, which the container clause catches on
    // identity alone. This one re-tags a component in place: same system, same array, same
    // length, so NOTHING in the object graph moved and only the system revision token can
    // see it. That is the whole reason the report consumes #1076's tokens rather than
    // fingerprinting the graph.
    const components = [
      { id: 'c1', name: 'Iron', tags: ['metal'] },
      { id: 'c2', name: 'Gold', tags: ['metal'] },
    ];
    const tagged = {
      ...recipePayload('t-a', [['c1']]),
      ingredientSets: [
        {
          id: 't-a-set-0',
          name: 'Set 1',
          ingredientGroups: [
            {
              id: 't-a-grp',
              name: 'Ingredients',
              options: [{ quantity: 1, match: { type: 'tags', tags: ['metal'], tagMatch: 'any' } }],
            },
          ],
          essences: {},
        },
      ],
    };
    const { manager, systemManager } = makeManager({
      recipes: [tagged, recipePayload('t-b', [['c1']], { enabled: false })],
      components,
    });
    assert.equal(gateMessages(manager, 't-b').length, 1, 'the tag set covers c1');

    const sameArray = systemManager.system.components;
    const beforeLength = sameArray.length;
    sameArray[0].tags = []; // the GM drops Iron's `metal` tag
    assert.equal(systemManager.system.components, sameArray, 'the premise is an IN-PLACE edit');
    assert.equal(sameArray.length, beforeLength, 'and one that moves no length either');
    systemManager.advance();

    assert.deepEqual(
      gateMessages(manager, 't-b'),
      [],
      'only the system revision token can see an in-place component edit'
    );
  });

  it('recompiles after the recipe MAP is replaced wholesale', () => {
    const { manager } = makeManager({ recipes: COLLIDING_CORPUS });
    assert.equal(gateMessages(manager, 'r-e').length, 3);

    manager.recipes = new Map(
      [recipePayload('r-e', [['c1']], { enabled: false })].map((payload) => [
        payload.id,
        new Recipe(payload),
      ])
    );
    assert.deepEqual(gateMessages(manager, 'r-e'), [], 'r-e is now alone in its system');
  });

  it('recompiles when a recipe is written straight into the map, advancing no token', () => {
    // The clause the map SIZE covers. Dozens of fixtures in this repository seed and extend
    // `manager.recipes` directly, and so does the compendium importer's batch loop before its
    // trailing save. A report whose cohort map has never seen the newcomer answers "no
    // conflict" for it, which is a save the gate should have refused.
    const { manager } = makeManager({ recipes: COLLIDING_CORPUS });
    assert.equal(gateMessages(manager, 'r-e').length, 3, 'warm the report first');

    const before = manager.revision(REVISION_SCOPES.recipesOfSystem(SYSTEM_ID));
    manager.recipes.set('r-f', new Recipe(recipePayload('r-f', [['c1']], { enabled: false })));
    assert.equal(manager.revision(REVISION_SCOPES.recipesOfSystem(SYSTEM_ID)), before);

    assert.equal(gateMessages(manager, 'r-f').length, 3, 'r-f collides with r-a, r-b and r-d');

    // As in the moved-in case above, that assertion stopped binding at issue 1167: a
    // candidate absent from the report is appended to the scan, so it reads correctly from
    // a stale one. An ENABLED direct write is the leg that still binds, because it changes
    // what the report must tell every OTHER recipe.
    manager.recipes.set('r-g', new Recipe(recipePayload('r-g', [['c1']])));
    assert.equal(
      manager.revision(REVISION_SCOPES.recipesOfSystem(SYSTEM_ID)),
      before,
      'the premise is still that NO token moved'
    );

    assert.equal(
      gateMessages(manager, 'r-e').length,
      4,
      'a report that never saw the direct write would still report three colliders for r-e'
    );
  });

  it('recompiles when the map is swapped for one of the SAME size', () => {
    // The clause the map IDENTITY covers, isolated from the size clause: the enabled cohort is
    // the very same objects, the count is unchanged and no token moved — only the disabled
    // member differs. `_recipeCohorts` is keyed on the map object for the same reason.
    const { manager } = makeManager({ recipes: COLLIDING_CORPUS });
    assert.equal(gateMessages(manager, 'r-e').length, 3, 'warm the report first');

    const swapped = new Map(manager.recipes);
    swapped.delete('r-e');
    swapped.set('r-f', new Recipe(recipePayload('r-f', [['c1']], { enabled: false })));
    assert.equal(swapped.size, manager.recipes.size, 'the premise is a SAME-SIZE swap');
    manager.recipes = swapped;

    assert.equal(gateMessages(manager, 'r-f').length, 3, 'r-f collides with r-a, r-b and r-d');
  });

  it('recompiles after a component-array edit that advances NO token', () => {
    // The stubbed-`save` trap, stated as a test. The `system:<id>` scope is advanced by
    // `CraftingSystemManager.save()`, and this repository holds around thirty suites that stub
    // that method — so a report trusting the token alone would serve an answer computed
    // against a component library the system no longer has.
    const components = [
      { id: 'c1', name: 'Iron', tags: ['metal'] },
      { id: 'c2', name: 'Gold', tags: ['metal'] },
    ];
    const tagged = {
      ...recipePayload('t-a', [['c1']]),
      ingredientSets: [
        {
          id: 't-a-set-0',
          name: 'Set 1',
          ingredientGroups: [
            {
              id: 't-a-grp',
              name: 'Ingredients',
              options: [{ quantity: 1, match: { type: 'tags', tags: ['metal'], tagMatch: 'any' } }],
            },
          ],
          essences: {},
        },
      ],
    };
    const { manager, systemManager } = makeManager({
      recipes: [tagged, recipePayload('t-b', [['c1']], { enabled: false })],
      components,
    });
    assert.equal(gateMessages(manager, 't-b').length, 1, 'the tag set covers c1');

    const before = systemManager.revision(REVISION_SCOPES.system(SYSTEM_ID));
    // A SAME-LENGTH replacement, so the array's identity is the only thing that moved: the GM
    // retagged Iron rather than removing it.
    systemManager.system.components = components.map((entry) =>
      entry.id === 'c1' ? { ...entry, tags: [] } : entry
    );
    assert.equal(
      systemManager.system.components.length,
      components.length,
      'the premise is that the LENGTH did not move'
    );
    assert.equal(
      systemManager.revision(REVISION_SCOPES.system(SYSTEM_ID)),
      before,
      'nor did the token'
    );

    assert.deepEqual(gateMessages(manager, 't-b'), [], 'a token-only guard would still refuse t-b');
  });

  it('recompiles after an in-place component APPEND that advances no token', () => {
    // The sibling clause: the array object never changes, so only its LENGTH can report the
    // append. Deliberately arranged so the append CREATES a collision rather than removing
    // one — a cache that fails open here lets a colliding recipe be enabled, which is the
    // direction that corrupts a world rather than merely annoying a GM.
    const components = [{ id: 'c1', name: 'Iron', tags: [] }];
    const tagged = {
      ...recipePayload('t-a', [['c1']]),
      ingredientSets: [
        {
          id: 't-a-set-0',
          name: 'Set 1',
          ingredientGroups: [
            {
              id: 't-a-grp',
              name: 'Ingredients',
              options: [{ quantity: 1, match: { type: 'tags', tags: ['metal'], tagMatch: 'any' } }],
            },
          ],
          essences: {},
        },
      ],
    };
    const { manager, systemManager } = makeManager({
      recipes: [tagged, recipePayload('t-b', [['c2']], { enabled: false })],
      components,
    });
    assert.deepEqual(gateMessages(manager, 't-b'), [], 'nothing carries the metal tag yet');

    const sameArray = systemManager.system.components;
    sameArray.push({ id: 'c2', name: 'Steel', tags: ['metal'] });
    assert.equal(systemManager.system.components, sameArray, 'the premise is an IN-PLACE append');

    assert.equal(
      gateMessages(manager, 't-b').length,
      1,
      'the metal tag now expands onto c2, which t-b requires outright'
    );
  });

  it('recompiles after a batch DELETE that advances no token', async () => {
    const { manager } = makeManager({ recipes: COLLIDING_CORPUS });
    assert.equal(gateMessages(manager, 'r-e').length, 3);

    await manager.deleteRecipes(['r-a'], { notify: false, emitChange: false, cleanupFlags: false });
    assert.equal(gateMessages(manager, 'r-e').length, 2, 'a stale report would still report 3');
  });

  it('advances the recipe token when disableSignatureConflicts flips flags in place', async () => {
    const { manager } = makeManager({ recipes: COLLIDING_CORPUS });
    const before = manager.revision(REVISION_SCOPES.recipesOfSystem(SYSTEM_ID));

    const disabled = await manager.disableSignatureConflicts(SYSTEM_ID);
    assert.deepEqual(
      disabled.map((entry) => entry.id).sort(),
      ['r-a', 'r-b', 'r-d'],
      'every participant of the enabled collision is disabled'
    );
    assert.ok(
      manager.revision(REVISION_SCOPES.recipesOfSystem(SYSTEM_ID)) > before,
      'an in-place write that advances no token leaves every revision consumer stale'
    );
  });
});

describe('non-alchemy systems are untouched by the signature report', () => {
  beforeEach(() => resetSignatureCounters());

  for (const resolutionMode of ['simple', 'routed', 'routedByCheck', 'progressive', 'tiered']) {
    it(`compiles nothing and compares nothing in ${resolutionMode} mode`, () => {
      const recipes = Array.from({ length: 20 }, (_unused, index) =>
        // Every recipe deliberately shares ONE signature: in alchemy this is a full
        // collision, and in every selected-recipe mode it is legal and must stay free.
        recipePayload(`row-${index}`, [['c1']])
      );
      const { manager } = makeManager({ recipes, resolutionMode });

      for (const id of [...manager.recipes.keys()]) {
        assert.equal(
          manager.canActivateRecipe(id).issues.filter((i) => i.code === 'signatureCollision').length,
          0,
          'signature uniqueness is an alchemy-only rule'
        );
      }
      assert.deepEqual(
        readSignatureCounters(),
        { reportBuilds: 0, signatureComparisons: 0 },
        'a non-alchemy system must short-circuit BEFORE any report work'
      );
    });
  }
});

describe('the report scans exactly the recipes the audit scans', () => {
  beforeEach(() => resetSignatureCounters());

  it('skips a stored record whose enabled key is absent, exactly as validateSystem does', () => {
    // Issue 1134: `validateSystem` scopes with a TRUTHY `recipe?.enabled` while the model's
    // meaning is `!== false`, so a raw payload omitting the key is skipped. That defect is
    // not this cache's to fix, and the cache must not silently change which recipes the gate
    // scans — so the report's membership clause uses the same truthy test.
    const keyless = recipePayload('r-keyless', [['c1']]);
    delete keyless.enabled;
    const { manager, systemManager } = makeManager({ recipes: COLLIDING_CORPUS });
    manager.recipes.set('r-keyless', keyless); // a raw payload, not a hydrated Recipe

    const candidate = enabledClone(manager.getRecipe('r-e'));
    assert.deepEqual(
      manager._validateSignatures(candidate).errors,
      oracleConflicts(manager, systemManager, candidate).map((conflict) => conflict.message),
      'the keyless record is invisible to BOTH the audit and the cached gate'
    );
    // Three, not four: the keyless record is invisible to the scan. A cache that had
    // "corrected" the truthy test to the model's `!== false` would report four here.
    assert.equal(manager._validateSignatures(candidate).errors.length, 3);
  });
});
