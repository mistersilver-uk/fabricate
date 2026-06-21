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

function makeIngredient(matchType, { componentId = null, tags = [], tagMatch = 'any' } = {}) {
  if (matchType === 'component') {
    return { match: { type: 'component', componentId } };
  }
  if (matchType === 'tags') {
    return { match: { type: 'tags', tags, tagMatch } };
  }
  return { match: null };
}

function makeGroup(options) {
  return { id: `g-${Math.random().toString(36).slice(2)}`, options };
}

function makeIngredientSet(ingredientGroups) {
  return { id: `set-${Math.random().toString(36).slice(2)}`, name: 'Test Set', ingredientGroups };
}

function makeRecipe(id, name, ingredientSets) {
  return { id, name, ingredientSets };
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
