/**
 * Unit tests for SignatureValidator (T-167)
 * Tests overlapping signature uniqueness validation for ingredient sets (components + tags).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const { SignatureValidator } = await import('../src/systems/SignatureValidator.js');

// ---------------------------------------------------------------------------
// Helper builders
// ---------------------------------------------------------------------------

function makeComponent(id, tags = []) {
  return { id, name: id, tags };
}

function makeIngredient(
  matchType,
  { componentId = null, tags = [], tagMatch = 'any', quantity = 1 } = {}
) {
  if (matchType === 'component') {
    return { match: { type: 'component', componentId }, quantity };
  }
  if (matchType === 'tags') {
    return { match: { type: 'tags', tags, tagMatch }, quantity };
  }
  return { match: null, quantity };
}

function makeGroup(options) {
  return { id: `g-${Math.random().toString(36).slice(2)}`, options };
}

function makeIngredientSet(ingredientGroups) {
  return { id: `set-${Math.random().toString(36).slice(2)}`, name: 'Test Set', ingredientGroups };
}

// Recipes default to ENABLED — the SignatureValidator scans only enabled recipes
// (issue 649, the complement of the runtime matcher's `if (!recipe.enabled) continue;`),
// mirroring real stored recipes which always carry the flag. A test exercising the
// disabled path passes `enabled: false` explicitly.
function makeRecipe(id, name, ingredientSets, enabled = true) {
  return { id, name, ingredientSets, enabled };
}

/**
 * Build a SignatureValidator with a mock craftingSystemManager.
 * @param {object|null} system - the crafting system to return for getSystem()
 * @param {object[]} recipes - recipes to return for getRecipesForSystem()
 * @param {object[]} components - components to return for getComponentsForSystem()
 */
function buildValidator(system, recipes = [], components = []) {
  const csm = {
    getSystem: (id) => (system && id === system.id ? system : null),
    getRecipesForSystem: (id) => (system && id === system.id ? recipes : []),
    getComponentsForSystem: (id) => (system && id === system.id ? components : []),
  };
  return new SignatureValidator(csm);
}

// ---------------------------------------------------------------------------
// 1. Component-vs-component overlap: identical component sets → conflict
// ---------------------------------------------------------------------------

test('component-vs-component overlap: same component in both recipes → conflict', () => {
  const compA = makeComponent('comp-a');
  const components = [compA];

  const ingredA = makeIngredient('component', { componentId: 'comp-a' });
  const setA = makeIngredientSet([makeGroup([ingredA])]);
  const recipeA = makeRecipe('r-1', 'Recipe A', [setA]);

  const ingredB = makeIngredient('component', { componentId: 'comp-a' });
  const setB = makeIngredientSet([makeGroup([ingredB])]);
  const recipeB = makeRecipe('r-2', 'Recipe B', [setB]);

  const system = { id: 'sys-1', resolutionMode: 'simple' };
  const validator = buildValidator(system, [recipeA, recipeB], components);

  const result = validator.validateSystem('sys-1');
  assert.equal(result.valid, false, 'Expected conflict for identical component signatures');
  assert.ok(result.conflicts.length > 0, 'Expected at least one conflict');
  const conflict = result.conflicts[0];
  assert.ok(
    (conflict.recipeA.id === 'r-1' && conflict.recipeB.id === 'r-2') ||
    (conflict.recipeA.id === 'r-2' && conflict.recipeB.id === 'r-1'),
    'Conflict should reference both recipes'
  );
});

// ---------------------------------------------------------------------------
// 2. Component-vs-component no overlap: disjoint component sets → no conflict
// ---------------------------------------------------------------------------

test('component-vs-component no overlap: different components → no conflict', () => {
  const components = [makeComponent('comp-a'), makeComponent('comp-b')];

  const setA = makeIngredientSet([makeGroup([makeIngredient('component', { componentId: 'comp-a' })])]);
  const setB = makeIngredientSet([makeGroup([makeIngredient('component', { componentId: 'comp-b' })])]);

  const recipeA = makeRecipe('r-1', 'Recipe A', [setA]);
  const recipeB = makeRecipe('r-2', 'Recipe B', [setB]);

  const system = { id: 'sys-1', resolutionMode: 'simple' };
  const validator = buildValidator(system, [recipeA, recipeB], components);

  const result = validator.validateSystem('sys-1');
  assert.equal(result.valid, true, 'Expected no conflicts for disjoint components');
  assert.equal(result.conflicts.length, 0);
});

// ---------------------------------------------------------------------------
// 3. Component-vs-tag overlap: component X has tag T, recipe B uses tag T → conflict
// ---------------------------------------------------------------------------

test('component-vs-tag overlap: component has tag used by other recipe → conflict', () => {
  const compX = makeComponent('comp-x', ['fire']);
  const components = [compX];

  // Recipe A: uses component X by ID
  const setA = makeIngredientSet([makeGroup([makeIngredient('component', { componentId: 'comp-x' })])]);
  const recipeA = makeRecipe('r-1', 'Recipe A', [setA]);

  // Recipe B: uses tag 'fire' (which comp-x has)
  const setB = makeIngredientSet([makeGroup([makeIngredient('tags', { tags: ['fire'], tagMatch: 'any' })])]);
  const recipeB = makeRecipe('r-2', 'Recipe B', [setB]);

  const system = { id: 'sys-1', resolutionMode: 'simple' };
  const validator = buildValidator(system, [recipeA, recipeB], components);

  const result = validator.validateSystem('sys-1');
  assert.equal(result.valid, false, 'Expected conflict when component has tag used by other recipe');
  assert.ok(result.conflicts.length > 0, 'Expected at least one conflict');
});

// ---------------------------------------------------------------------------
// 4. Tag-vs-tag overlap (any): recipes using overlapping tags → conflict
// ---------------------------------------------------------------------------

test('tag-vs-tag overlap (any): recipes share at least one tag → conflict', () => {
  const compA = makeComponent('comp-a', ['fire', 'rare']);
  const compB = makeComponent('comp-b', ['fire']);
  const components = [compA, compB];

  // Recipe A: any item with 'fire' tag
  const setA = makeIngredientSet([makeGroup([makeIngredient('tags', { tags: ['fire'], tagMatch: 'any' })])]);
  const recipeA = makeRecipe('r-1', 'Recipe A', [setA]);

  // Recipe B: any item with 'fire' or 'rare' tag
  const setB = makeIngredientSet([makeGroup([makeIngredient('tags', { tags: ['fire', 'rare'], tagMatch: 'any' })])]);
  const recipeB = makeRecipe('r-2', 'Recipe B', [setB]);

  const system = { id: 'sys-1', resolutionMode: 'simple' };
  const validator = buildValidator(system, [recipeA, recipeB], components);

  const result = validator.validateSystem('sys-1');
  assert.equal(result.valid, false, 'Expected conflict for overlapping tags (any mode)');
  assert.ok(result.conflicts.length > 0);
});

// ---------------------------------------------------------------------------
// 5. Tag-vs-tag overlap (all): shared components satisfying multi-tag requirements → conflict
// ---------------------------------------------------------------------------

test('tag-vs-tag overlap (all): component with all required tags used in both recipes → conflict', () => {
  // Component has both 'fire' AND 'rare'
  const compA = makeComponent('comp-a', ['fire', 'rare']);
  const components = [compA];

  // Recipe A: requires 'fire' AND 'rare' (all)
  const setA = makeIngredientSet([makeGroup([makeIngredient('tags', { tags: ['fire', 'rare'], tagMatch: 'all' })])]);
  const recipeA = makeRecipe('r-1', 'Recipe A', [setA]);

  // Recipe B: also requires 'fire' AND 'rare' (all)
  const setB = makeIngredientSet([makeGroup([makeIngredient('tags', { tags: ['fire', 'rare'], tagMatch: 'all' })])]);
  const recipeB = makeRecipe('r-2', 'Recipe B', [setB]);

  const system = { id: 'sys-1', resolutionMode: 'simple' };
  const validator = buildValidator(system, [recipeA, recipeB], components);

  const result = validator.validateSystem('sys-1');
  assert.equal(result.valid, false, 'Expected conflict for overlapping all-tag requirements');
  assert.ok(result.conflicts.length > 0);
});

// ---------------------------------------------------------------------------
// 6. No false positives: tag 'all' with no shared component → no conflict
// ---------------------------------------------------------------------------

test('no false positives: tag all with no component having all required tags → no conflict', () => {
  // comp-a has 'fire' only; comp-b has 'rare' only — neither has both
  const compA = makeComponent('comp-a', ['fire']);
  const compB = makeComponent('comp-b', ['rare']);
  const components = [compA, compB];

  // Recipe A: requires 'fire' AND 'rare' (all) — no component satisfies this
  const setA = makeIngredientSet([makeGroup([makeIngredient('tags', { tags: ['fire', 'rare'], tagMatch: 'all' })])]);
  const recipeA = makeRecipe('r-1', 'Recipe A', [setA]);

  // Recipe B: also requires 'fire' AND 'rare' (all) — same, empty match set
  const setB = makeIngredientSet([makeGroup([makeIngredient('tags', { tags: ['fire', 'rare'], tagMatch: 'all' })])]);
  const recipeB = makeRecipe('r-2', 'Recipe B', [setB]);

  const system = { id: 'sys-1', resolutionMode: 'simple' };
  const validator = buildValidator(system, [recipeA, recipeB], components);

  const result = validator.validateSystem('sys-1');
  // Both expand to empty set → no overlap → no conflict
  assert.equal(result.valid, true, 'Expected no conflict when no component satisfies the all-tag requirement');
  assert.equal(result.conflicts.length, 0);
});

// ---------------------------------------------------------------------------
// 7. Genuinely disjoint signatures: different tags on different components → no conflict
// ---------------------------------------------------------------------------

test('genuinely disjoint signatures: no shared components between recipes → no conflict', () => {
  const compA = makeComponent('comp-a', ['fire']);
  const compB = makeComponent('comp-b', ['water']);
  const components = [compA, compB];

  // Recipe A: uses 'fire' tag
  const setA = makeIngredientSet([makeGroup([makeIngredient('tags', { tags: ['fire'], tagMatch: 'any' })])]);
  const recipeA = makeRecipe('r-1', 'Recipe A', [setA]);

  // Recipe B: uses 'water' tag
  const setB = makeIngredientSet([makeGroup([makeIngredient('tags', { tags: ['water'], tagMatch: 'any' })])]);
  const recipeB = makeRecipe('r-2', 'Recipe B', [setB]);

  const system = { id: 'sys-1', resolutionMode: 'simple' };
  const validator = buildValidator(system, [recipeA, recipeB], components);

  const result = validator.validateSystem('sys-1');
  assert.equal(result.valid, true, 'Expected no conflict for disjoint tag signatures');
  assert.equal(result.conflicts.length, 0);
});

// ---------------------------------------------------------------------------
// 8. System not found → returns valid (no-op)
// ---------------------------------------------------------------------------

test('system not found: validateSystem returns valid with no conflicts', () => {
  const validator = buildValidator(null, [], []);
  const result = validator.validateSystem('nonexistent-system');
  assert.equal(result.valid, true);
  assert.equal(result.conflicts.length, 0);
});

// ---------------------------------------------------------------------------
// 9. Empty system: no recipes → valid
// ---------------------------------------------------------------------------

test('empty system: no recipes → valid with no conflicts', () => {
  const system = { id: 'sys-1', resolutionMode: 'simple' };
  const validator = buildValidator(system, [], []);
  const result = validator.validateSystem('sys-1');
  assert.equal(result.valid, true);
  assert.equal(result.conflicts.length, 0);
});

// ---------------------------------------------------------------------------
// 10. Single recipe: no pairwise comparisons possible → valid
// ---------------------------------------------------------------------------

test('single recipe: only one recipe → no conflict possible', () => {
  const components = [makeComponent('comp-a', ['fire'])];
  const setA = makeIngredientSet([makeGroup([makeIngredient('component', { componentId: 'comp-a' })])]);
  const recipeA = makeRecipe('r-1', 'Recipe A', [setA]);

  const system = { id: 'sys-1', resolutionMode: 'simple' };
  const validator = buildValidator(system, [recipeA], components);

  const result = validator.validateSystem('sys-1');
  assert.equal(result.valid, true, 'Single recipe should not produce conflicts');
  assert.equal(result.conflicts.length, 0);
});

// ---------------------------------------------------------------------------
// 11. validateRecipe: filters conflicts to only those involving the given recipe
// ---------------------------------------------------------------------------

test('validateRecipe: returns only conflicts involving the given recipe', () => {
  const components = [makeComponent('comp-a', [])];

  const setA = makeIngredientSet([makeGroup([makeIngredient('component', { componentId: 'comp-a' })])]);
  const setB = makeIngredientSet([makeGroup([makeIngredient('component', { componentId: 'comp-a' })])]);
  const setC = makeIngredientSet([makeGroup([makeIngredient('component', { componentId: 'comp-a' })])]);

  const recipeA = makeRecipe('r-1', 'Recipe A', [setA]);
  const recipeB = makeRecipe('r-2', 'Recipe B', [setB]);
  const recipeC = makeRecipe('r-3', 'Recipe C', [setC]);

  const system = { id: 'sys-1', resolutionMode: 'simple' };
  const validator = buildValidator(system, [recipeA, recipeB, recipeC], components);

  const resultForA = validator.validateRecipe(recipeA, 'sys-1');
  assert.equal(resultForA.valid, false, 'Recipe A should have conflicts');
  for (const conflict of resultForA.conflicts) {
    assert.ok(
      conflict.recipeA.id === 'r-1' || conflict.recipeB.id === 'r-1',
      'All returned conflicts should involve Recipe A'
    );
  }
});

// ---------------------------------------------------------------------------
// 12. expandIngredientToComponentIds: component type returns singleton set
// ---------------------------------------------------------------------------

test('expandIngredientToComponentIds: component match returns the component id', () => {
  const validator = buildValidator(null);
  const ingredient = makeIngredient('component', { componentId: 'comp-x' });
  const components = [makeComponent('comp-x', ['fire'])];

  const result = validator.expandIngredientToComponentIds(ingredient, components);
  assert.ok(result instanceof Set);
  assert.equal(result.size, 1);
  assert.ok(result.has('comp-x'));
});

// ---------------------------------------------------------------------------
// 13. expandIngredientToComponentIds: tag 'any' match returns all matching components
// ---------------------------------------------------------------------------

test('expandIngredientToComponentIds: tags any match returns all components with that tag', () => {
  const validator = buildValidator(null);
  const ingredient = makeIngredient('tags', { tags: ['fire'], tagMatch: 'any' });
  const components = [
    makeComponent('comp-a', ['fire']),
    makeComponent('comp-b', ['water']),
    makeComponent('comp-c', ['fire', 'rare']),
  ];

  const result = validator.expandIngredientToComponentIds(ingredient, components);
  assert.ok(result.has('comp-a'), 'comp-a has fire tag');
  assert.ok(!result.has('comp-b'), 'comp-b does not have fire tag');
  assert.ok(result.has('comp-c'), 'comp-c has fire tag');
});

// ---------------------------------------------------------------------------
// 14. expandIngredientToComponentIds: tag 'all' match returns only components with all tags
// ---------------------------------------------------------------------------

test('expandIngredientToComponentIds: tags all match returns only components with all required tags', () => {
  const validator = buildValidator(null);
  const ingredient = makeIngredient('tags', { tags: ['fire', 'rare'], tagMatch: 'all' });
  const components = [
    makeComponent('comp-a', ['fire', 'rare']),
    makeComponent('comp-b', ['fire']),
    makeComponent('comp-c', ['rare']),
    makeComponent('comp-d', ['fire', 'rare', 'epic']),
  ];

  const result = validator.expandIngredientToComponentIds(ingredient, components);
  assert.ok(result.has('comp-a'), 'comp-a has both fire and rare');
  assert.ok(!result.has('comp-b'), 'comp-b missing rare');
  assert.ok(!result.has('comp-c'), 'comp-c missing fire');
  assert.ok(result.has('comp-d'), 'comp-d has both plus more');
});

// ---------------------------------------------------------------------------
// 14b. expandIngredientToComponentIds: currency contributes no component ids
// ---------------------------------------------------------------------------

test('expandIngredientToComponentIds: currency match returns an empty set', () => {
  const validator = buildValidator(null);
  const ingredient = { match: { type: 'currency', unit: 'gp', amount: 100 } };
  const components = [makeComponent('comp-a', ['fire'])];

  const result = validator.expandIngredientToComponentIds(ingredient, components);
  assert.ok(result instanceof Set);
  assert.equal(result.size, 0, 'currency is not a managed component');
});

test('computeSignature ignores a currency option but keeps component ids in the group', () => {
  const validator = buildValidator(null);
  const components = [makeComponent('comp-iron', [])];
  const group = makeGroup([
    makeIngredient('component', { componentId: 'comp-iron' }),
    { match: { type: 'currency', unit: 'gp', amount: 100 } },
  ]);
  const set = makeIngredientSet([group]);

  const signature = validator.computeSignature(set, components);
  assert.equal(signature.length, 1, 'one group');
  assert.equal(signature[0].size, 1, 'currency option adds no ids');
  assert.ok(signature[0].has('comp-iron'));
});

// ---------------------------------------------------------------------------
// 15. Multiple ingredient sets per recipe: each set generates separate entries
// ---------------------------------------------------------------------------

test('multiple ingredient sets per recipe: conflict detected across sets', () => {
  const components = [makeComponent('comp-a', [])];

  // Recipe A has two ingredient sets, one of which overlaps with recipe B
  const setA1 = makeIngredientSet([makeGroup([makeIngredient('component', { componentId: 'comp-a' })])]);
  const recipeA = makeRecipe('r-1', 'Recipe A', [setA1]);

  const setB = makeIngredientSet([makeGroup([makeIngredient('component', { componentId: 'comp-a' })])]);
  const recipeB = makeRecipe('r-2', 'Recipe B', [setB]);

  const system = { id: 'sys-1', resolutionMode: 'simple' };
  const validator = buildValidator(system, [recipeA, recipeB], components);

  const result = validator.validateSystem('sys-1');
  assert.equal(result.valid, false);
  assert.ok(result.conflicts.length >= 1);
});

// ---------------------------------------------------------------------------
// 17. Shared-base multi-group recipes are NOT a collision (issue 547)
//
// Two distinct alchemy recipes that merely share a common base component but
// differ in a distinguishing group must both be enablable. Neither recipe's
// group requirements are a subset of the other's, so no single minimal
// submission satisfies both, and there is no genuine ambiguity.
// ---------------------------------------------------------------------------

test('shared-base multi-group recipes sharing one base component → no conflict (issue 547)', () => {
  const components = [
    makeComponent('comp-water'),
    makeComponent('comp-herb'),
    makeComponent('comp-mineral'),
  ];

  // Healing Potion: group1 {Water}, group2 {Herb}
  const healing = makeRecipe('r-healing', 'Healing Potion', [
    makeIngredientSet([
      makeGroup([makeIngredient('component', { componentId: 'comp-water' })]),
      makeGroup([makeIngredient('component', { componentId: 'comp-herb' })]),
    ]),
  ]);

  // Mana Potion: group1 {Water}, group2 {Mineral}
  const mana = makeRecipe('r-mana', 'Mana Potion', [
    makeIngredientSet([
      makeGroup([makeIngredient('component', { componentId: 'comp-water' })]),
      makeGroup([makeIngredient('component', { componentId: 'comp-mineral' })]),
    ]),
  ]);

  const system = { id: 'sys-1', resolutionMode: 'alchemy' };
  const validator = buildValidator(system, [healing, mana], components);

  const result = validator.validateSystem('sys-1');
  assert.equal(
    result.valid,
    true,
    `Recipes sharing only a base component must not collide; got: ${JSON.stringify(result.conflicts)}`
  );
  assert.equal(result.conflicts.length, 0);
});

// ---------------------------------------------------------------------------
// 18. Strict subset group requirements are ALLOWED (issue 774 — INVERTS 547)
//
// A set whose group requirements are a STRICT subset of another's is now
// distinguishable at runtime: the overlap is one-directional (only the larger
// set's transversal satisfies the smaller, never the reverse), so the
// most-specific matcher brews the larger set when its extra ingredient is present
// and the smaller when it is not. The enable-time guard rejects only the SYMMETRIC
// (inseparable) case, so this pair must ENABLE. (Previously issue 547 rejected it
// under the superset-tolerant first-match runtime.)
// ---------------------------------------------------------------------------

test('strict subset group requirements → ALLOWED (issue 774, inverts 547)', () => {
  const components = [makeComponent('comp-water'), makeComponent('comp-herb')];

  // Set X: single group {Water}
  const recipeX = makeRecipe('r-x', 'Plain Water Brew', [
    makeIngredientSet([makeGroup([makeIngredient('component', { componentId: 'comp-water' })])]),
  ]);

  // Set Y: groups {Water}, {Herb} — X's requirement is a STRICT subset of Y's.
  const recipeY = makeRecipe('r-y', 'Herbal Water Brew', [
    makeIngredientSet([
      makeGroup([makeIngredient('component', { componentId: 'comp-water' })]),
      makeGroup([makeIngredient('component', { componentId: 'comp-herb' })]),
    ]),
  ]);

  const system = { id: 'sys-1', resolutionMode: 'alchemy' };
  const validator = buildValidator(system, [recipeX, recipeY], components);

  const result = validator.validateSystem('sys-1');
  assert.equal(
    result.valid,
    true,
    `Strict subset/superset is one-directional and disambiguated by the runtime; got: ${JSON.stringify(result.conflicts)}`
  );
  assert.equal(result.conflicts.length, 0);
});

// ---------------------------------------------------------------------------
// 19. OR-option shadowing stays INSEPARABLE (issue 774 — NOT inverted)
//
// dependent={Water},{Herb} vs covering={Water},{Herb OR Mineral}. This is NOT a
// clean strict subset: the OR option makes the overlap SYMMETRIC. covering's own
// natural craft can be Water+Herb (it may pick the Herb arm), which satisfies
// dependent; and dependent's Water+Herb satisfies covering. Neither dominates, so
// under the runtime's most-specific pick a Water+Herb submission would FIZZLE and
// dependent could NEVER be brewed distinctly (every dependent submission also
// matches covering). The `&&` guard therefore still REJECTS this pair — it is the
// inseparable case an added ingredient cannot resolve. (Contrast test 18: a strict
// subset with no OR is one-directional and allowed.)
// ---------------------------------------------------------------------------

test('OR-option covering shadows a narrower set → conflict (issue 774, symmetric inseparable)', () => {
  const components = [
    makeComponent('comp-water'),
    makeComponent('comp-herb'),
    makeComponent('comp-mineral'),
  ];

  // Dependent: {Water}, {Herb}
  const dependent = makeRecipe('r-dep', 'Dependent Brew', [
    makeIngredientSet([
      makeGroup([makeIngredient('component', { componentId: 'comp-water' })]),
      makeGroup([makeIngredient('component', { componentId: 'comp-herb' })]),
    ]),
  ]);

  // Covering: {Water}, {Herb OR Mineral} — the dependent's Herb group is a
  // subset of the covering's {Herb, Mineral} group, so satisfying the
  // dependent (Water + Herb) always satisfies the covering too.
  const covering = makeRecipe('r-cov', 'Covering Brew', [
    makeIngredientSet([
      makeGroup([makeIngredient('component', { componentId: 'comp-water' })]),
      makeGroup([
        makeIngredient('component', { componentId: 'comp-herb' }),
        makeIngredient('component', { componentId: 'comp-mineral' }),
      ]),
    ]),
  ]);

  const system = { id: 'sys-1', resolutionMode: 'alchemy' };
  const validator = buildValidator(system, [dependent, covering], components);

  const result = validator.validateSystem('sys-1');
  assert.equal(
    result.valid,
    false,
    'Symmetric (OR-option) shadowing is inseparable and must be rejected'
  );
  assert.ok(result.conflicts.length > 0);
});

// ---------------------------------------------------------------------------
// 20. Distinguishing option-alternatives are NOT a collision (issue 547)
//
// Two sets sharing a base group but whose second groups are disjoint option
// sets have no joint minimal submission → no collision.
// ---------------------------------------------------------------------------

test('shared base with disjoint option-alternative second groups → no conflict', () => {
  const components = [
    makeComponent('comp-water'),
    makeComponent('comp-herb'),
    makeComponent('comp-root'),
    makeComponent('comp-mineral'),
    makeComponent('comp-crystal'),
  ];

  // {Water}, {Herb OR Root}
  const recipeA = makeRecipe('r-a', 'Recipe A', [
    makeIngredientSet([
      makeGroup([makeIngredient('component', { componentId: 'comp-water' })]),
      makeGroup([
        makeIngredient('component', { componentId: 'comp-herb' }),
        makeIngredient('component', { componentId: 'comp-root' }),
      ]),
    ]),
  ]);

  // {Water}, {Mineral OR Crystal}
  const recipeB = makeRecipe('r-b', 'Recipe B', [
    makeIngredientSet([
      makeGroup([makeIngredient('component', { componentId: 'comp-water' })]),
      makeGroup([
        makeIngredient('component', { componentId: 'comp-mineral' }),
        makeIngredient('component', { componentId: 'comp-crystal' }),
      ]),
    ]),
  ]);

  const system = { id: 'sys-1', resolutionMode: 'alchemy' };
  const validator = buildValidator(system, [recipeA, recipeB], components);

  const result = validator.validateSystem('sys-1');
  assert.equal(
    result.valid,
    true,
    `Disjoint distinguishing groups must not collide; got: ${JSON.stringify(result.conflicts)}`
  );
  assert.equal(result.conflicts.length, 0);
});

// ---------------------------------------------------------------------------
// 21. quantity>=2 multi-component group is ALLOWED (issue 774 — INVERTS 547)
//
// A `quantity: 2` "metal"-tag group naturally crafted iron+gold plus {salt},{pepper}
// (recipe A) fully satisfies recipe B={iron},{gold}. But the overlap is
// one-directional: B's iron+gold cannot supply A's salt+pepper, so A strictly
// DOMINATES B. The most-specific runtime brews A for the iron+gold+salt+pepper
// craft and B for a bare iron+gold craft — both are reachable — so the enable-time
// guard now ALLOWS the pair. (Previously issue 547 rejected it under first-match.)
// ---------------------------------------------------------------------------

test('quantity>=2 multi-component group vs its distinct components → ALLOWED (issue 774, inverts 547)', () => {
  const components = [
    makeComponent('comp-iron', ['metal']),
    makeComponent('comp-gold', ['metal']),
    makeComponent('comp-salt'),
    makeComponent('comp-pepper'),
  ];

  // Recipe A: {metal x2}, {salt}, {pepper} — the metal group is crafted iron+gold.
  const recipeA = makeRecipe('r-a', 'Alloy Brew', [
    makeIngredientSet([
      makeGroup([makeIngredient('tags', { tags: ['metal'], tagMatch: 'any', quantity: 2 })]),
      makeGroup([makeIngredient('component', { componentId: 'comp-salt' })]),
      makeGroup([makeIngredient('component', { componentId: 'comp-pepper' })]),
    ]),
  ]);

  // Recipe B: {iron}, {gold} — a strict subset of A's satisfiable craft.
  const recipeB = makeRecipe('r-b', 'Iron & Gold Brew', [
    makeIngredientSet([
      makeGroup([makeIngredient('component', { componentId: 'comp-iron' })]),
      makeGroup([makeIngredient('component', { componentId: 'comp-gold' })]),
    ]),
  ]);

  const system = { id: 'sys-1', resolutionMode: 'alchemy' };
  const validator = buildValidator(system, [recipeB, recipeA], components);

  const result = validator.validateSystem('sys-1');
  assert.equal(
    result.valid,
    true,
    `A strictly dominates B (one-directional), so the pair is separable and allowed; got: ${JSON.stringify(result.conflicts)}`
  );
  assert.equal(result.conflicts.length, 0);
});

// ---------------------------------------------------------------------------
// 22. quantity 1 multi-component group does NOT over-reject (issue 547)
//
// The same shape but with quantity 1 supplies only ONE metal unit, so a natural
// craft is iron OR gold — never both — and does not satisfy the {iron},{gold}
// set. Must stay enablable (guards against the fix over-rejecting quantity 1).
// ---------------------------------------------------------------------------

test('quantity 1 multi-component group vs its distinct components → no conflict (issue 547)', () => {
  const components = [
    makeComponent('comp-iron', ['metal']),
    makeComponent('comp-gold', ['metal']),
    makeComponent('comp-salt'),
    makeComponent('comp-pepper'),
  ];

  const recipeA = makeRecipe('r-a', 'Single Metal Brew', [
    makeIngredientSet([
      makeGroup([makeIngredient('tags', { tags: ['metal'], tagMatch: 'any', quantity: 1 })]),
      makeGroup([makeIngredient('component', { componentId: 'comp-salt' })]),
      makeGroup([makeIngredient('component', { componentId: 'comp-pepper' })]),
    ]),
  ]);

  const recipeB = makeRecipe('r-b', 'Iron & Gold Brew', [
    makeIngredientSet([
      makeGroup([makeIngredient('component', { componentId: 'comp-iron' })]),
      makeGroup([makeIngredient('component', { componentId: 'comp-gold' })]),
    ]),
  ]);

  const system = { id: 'sys-1', resolutionMode: 'alchemy' };
  const validator = buildValidator(system, [recipeB, recipeA], components);

  const result = validator.validateSystem('sys-1');
  assert.equal(
    result.valid,
    true,
    `A quantity 1 metal group supplies only one unit and cannot satisfy {iron},{gold}; got: ${JSON.stringify(result.conflicts)}`
  );
  assert.equal(result.conflicts.length, 0);
});

// ---------------------------------------------------------------------------
// 23. tag/OR inseparable pair stays a conflict (issue 774 regression)
//
// A single `mithril` tagged BOTH `rare` and `metal` satisfies A={rare} and
// B={metal} via the SAME one-item submission, in BOTH directions — the symmetric
// inseparable case no ingredient can resolve. Must still be REJECTED.
// ---------------------------------------------------------------------------

test('tag/OR inseparable (mithril tagged rare AND metal) → conflict (issue 774)', () => {
  const components = [makeComponent('comp-mithril', ['rare', 'metal'])];

  const recipeA = makeRecipe('r-a', 'Rare Brew', [
    makeIngredientSet([makeGroup([makeIngredient('tags', { tags: ['rare'], tagMatch: 'any' })])]),
  ]);
  const recipeB = makeRecipe('r-b', 'Metal Brew', [
    makeIngredientSet([makeGroup([makeIngredient('tags', { tags: ['metal'], tagMatch: 'any' })])]),
  ]);

  const system = { id: 'sys-1', resolutionMode: 'alchemy' };
  const validator = buildValidator(system, [recipeA, recipeB], components);

  const result = validator.validateSystem('sys-1');
  assert.equal(result.valid, false, 'a single item satisfying both tags is inseparable → reject');
  assert.ok(result.conflicts.length > 0);
});

// ---------------------------------------------------------------------------
// 24. Incomparable siblings are ALLOWED (issue 774)
//
// B={S,V,E} and C={S,V,R} share a base {S,V} but their third groups are disjoint.
// Neither transversal satisfies the other (E ≠ R), so neither dominates and the
// pair is separable: adding E brews B, adding R brews C. An ambiguous
// over-submission {S,V,E,R} fizzles at runtime (covered by the engine tests), not
// a wrong brew. The enable-time guard must ALLOW the pair.
// ---------------------------------------------------------------------------

test('incomparable siblings {S,V,E} / {S,V,R} → ALLOWED (issue 774)', () => {
  const components = [
    makeComponent('comp-s'),
    makeComponent('comp-v'),
    makeComponent('comp-e'),
    makeComponent('comp-r'),
  ];

  const brewB = makeRecipe('r-b', 'Brew B', [
    makeIngredientSet([
      makeGroup([makeIngredient('component', { componentId: 'comp-s' })]),
      makeGroup([makeIngredient('component', { componentId: 'comp-v' })]),
      makeGroup([makeIngredient('component', { componentId: 'comp-e' })]),
    ]),
  ]);
  const brewC = makeRecipe('r-c', 'Brew C', [
    makeIngredientSet([
      makeGroup([makeIngredient('component', { componentId: 'comp-s' })]),
      makeGroup([makeIngredient('component', { componentId: 'comp-v' })]),
      makeGroup([makeIngredient('component', { componentId: 'comp-r' })]),
    ]),
  ]);

  const system = { id: 'sys-1', resolutionMode: 'alchemy' };
  const validator = buildValidator(system, [brewB, brewC], components);

  const result = validator.validateSystem('sys-1');
  assert.equal(
    result.valid,
    true,
    `Incomparable siblings are distinguishable and must both enable; got: ${JSON.stringify(result.conflicts)}`
  );
  assert.equal(result.conflicts.length, 0);
});

// ---------------------------------------------------------------------------
// 16. conflict message format includes recipe names
// ---------------------------------------------------------------------------

test('conflict message includes both recipe names', () => {
  const components = [makeComponent('comp-a', [])];

  const setA = makeIngredientSet([makeGroup([makeIngredient('component', { componentId: 'comp-a' })])]);
  const setB = makeIngredientSet([makeGroup([makeIngredient('component', { componentId: 'comp-a' })])]);
  const recipeA = makeRecipe('r-1', 'Alpha', [setA]);
  const recipeB = makeRecipe('r-2', 'Beta', [setB]);

  const system = { id: 'sys-1', resolutionMode: 'simple' };
  const validator = buildValidator(system, [recipeA, recipeB], components);

  const result = validator.validateSystem('sys-1');
  assert.ok(result.conflicts.length > 0);
  const msg = result.conflicts[0].message;
  assert.ok(msg.includes('Alpha'), `Expected "Alpha" in message, got: ${msg}`);
  assert.ok(msg.includes('Beta'), `Expected "Beta" in message, got: ${msg}`);
});

// ---------------------------------------------------------------------------
// Essence match type (issue 649): capacity, expansion overlap, enabled-scoping
// ---------------------------------------------------------------------------

function makeEssenceComponent(id, essences) {
  return { id, name: id, tags: [], essences };
}

test('computeGroupOptions: essence capacity = min(amount, ids.size), not option.quantity', () => {
  const components = [
    makeEssenceComponent('c1', { fire: 1 }),
    makeEssenceComponent('c2', { fire: 1 }),
  ];
  const set = makeIngredientSet([
    makeGroup([{ quantity: 1, match: { type: 'essence', essenceId: 'fire', amount: 3 } }]),
  ]);
  const validator = buildValidator({ id: 'sys-1', resolutionMode: 'alchemy' }, [], components);
  const [group] = validator.computeGroupOptions(set, components);
  // amount 3 but only 2 components carry fire → capacity is min(3, 2) = 2 (NOT quantity 1).
  assert.equal(group[0].capacity, 2, 'capacity derives from the essence amount, capped by ids.size');
  assert.deepEqual([...group[0].ids].sort(), ['c1', 'c2']);
});

test('essence expansion makes an essence group overlap a component carrying that essence', () => {
  const components = [makeEssenceComponent('ember', { fire: 1 })];
  const essenceSet = makeIngredientSet([
    makeGroup([{ quantity: 1, match: { type: 'essence', essenceId: 'fire', amount: 1 } }]),
  ]);
  const componentSet = makeIngredientSet([
    makeGroup([makeIngredient('component', { componentId: 'ember' })]),
  ]);
  const validator = buildValidator(
    { id: 'sys-1', resolutionMode: 'alchemy' },
    [makeRecipe('r-1', 'Essence', [essenceSet]), makeRecipe('r-2', 'Component', [componentSet])],
    components
  );
  const result = validator.validateSystem('sys-1');
  assert.equal(result.valid, false, 'an essence group overlaps a component carrying the essence');
});

test('validateSystem is enabled-scoped: a disabled collider does not count against the gate', () => {
  const components = [makeComponent('comp-a')];
  const setA = makeIngredientSet([makeGroup([makeIngredient('component', { componentId: 'comp-a' })])]);
  const setB = makeIngredientSet([makeGroup([makeIngredient('component', { componentId: 'comp-a' })])]);
  const validator = buildValidator(
    { id: 'sys-1', resolutionMode: 'alchemy' },
    [makeRecipe('r-1', 'A', [setA], true), makeRecipe('r-2', 'B', [setB], false)],
    components
  );
  const result = validator.validateSystem('sys-1');
  assert.equal(result.valid, true, 'the disabled collider is excluded, so the enabled set is clean');
});
