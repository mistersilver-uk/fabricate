/**
 * Issue 550: enable-recipe validation errors must be user-facing — localized and
 * free of leaked internal set IDs.
 *
 * These tests RED-fail on the pre-fix behavior (the signature-overlap message
 * embeds a raw Foundry ingredient-set id and carries no stable `code`) and pass
 * once the conflict carries a stable `code` + human-readable params and the UI
 * layer maps activation errors to localized, id-free copy.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const { SignatureValidator } = await import('../src/systems/SignatureValidator.js');
const { RecipeActivationError } = await import('../src/systems/RecipeActivationError.js');
const { localizeRecipeActivationError, localizeActivationIssue, RECIPE_ACTIVATION_ISSUE_LABELS } =
  await import('../src/utils/recipeActivationMessages.js');

// A Foundry-shaped random id (16 alphanumerics). The reporter saw two of these
// leak into the toast ("set aZrvhxMlMBWxYFam" / "set ZskumdJApJlvdmvw").
const FOUNDRY_ID_RE = /\b[A-Za-z0-9]{16}\b/;

function buildValidator(system, recipes, components) {
  const csm = {
    getSystem: (id) => (system && id === system.id ? system : null),
    getRecipesForSystem: (id) => (system && id === system.id ? recipes : []),
    getComponentsForSystem: (id) => (system && id === system.id ? components : []),
  };
  return new SignatureValidator(csm);
}

// Two alchemy recipes whose single, UNNAMED ingredient sets share a component,
// so they collide. The set ids are Foundry-shaped so a leak is detectable.
function collidingSystem() {
  const components = [{ id: 'comp-ember', name: 'Ember Essence', tags: [] }];
  const group = () => ({
    id: `grp-${Math.random().toString(36).slice(2)}`,
    options: [{ match: { type: 'component', componentId: 'comp-ember' }, quantity: 1 }],
  });
  // Enabled — the SignatureValidator scans only enabled recipes (issue 649).
  const recipeA = {
    id: 'r-heal',
    name: 'Healing Potion',
    enabled: true,
    ingredientSets: [{ id: 'aZrvhxMlMBWxYFam', ingredientGroups: [group()] }],
  };
  const recipeB = {
    id: 'r-mana',
    name: 'Mana Potion',
    enabled: true,
    ingredientSets: [{ id: 'ZskumdJApJlvdmvw', ingredientGroups: [group()] }],
  };
  const system = { id: 'sys-alch', resolutionMode: 'alchemy' };
  return { system, recipes: [recipeA, recipeB], components };
}

test('signature conflict carries a stable code and human-readable params, never the raw set id', () => {
  const { system, recipes, components } = collidingSystem();
  const result = buildValidator(system, recipes, components).validateSystem('sys-alch');

  assert.ok(result.conflicts.length > 0, 'expected an overlap conflict');
  const conflict = result.conflicts[0];

  assert.equal(conflict.code, 'signatureCollision', 'conflict must carry a stable code');
  assert.ok(conflict.params, 'conflict must carry structured params');

  const names = [conflict.params.recipeA, conflict.params.recipeB].sort();
  assert.deepEqual(names, ['Healing Potion', 'Mana Potion']);
  assert.match(conflict.params.components, /Ember Essence/, 'offending component named');

  // No raw ingredient-set id anywhere the user can see it.
  assert.doesNotMatch(conflict.message, FOUNDRY_ID_RE, `message leaked an id: ${conflict.message}`);
  assert.ok(!conflict.message.includes('aZrvhxMlMBWxYFam'));
  assert.ok(!conflict.message.includes('ZskumdJApJlvdmvw'));
  for (const value of Object.values(conflict.params)) {
    assert.doesNotMatch(String(value), FOUNDRY_ID_RE, `param leaked an id: ${value}`);
  }
});

test('default (headless) message keeps recipe names and the "Overlapping signatures" phrase', () => {
  const { system, recipes, components } = collidingSystem();
  const result = buildValidator(system, recipes, components).validateSystem('sys-alch');
  const msg = result.conflicts[0].message;
  assert.match(msg, /Overlapping signatures/);
  assert.ok(msg.includes('Healing Potion') && msg.includes('Mana Potion'));
});

test('localizeActivationIssue maps a coded issue through the localize fn with params', () => {
  const seen = [];
  const localizeFn = (key, data) => {
    seen.push({ key, data });
    return `LOCAL:${key}`;
  };
  const issue = {
    code: 'signatureCollision',
    params: {
      recipeA: 'Healing Potion',
      recipeB: 'Mana Potion',
      components: 'Ember Essence',
      setA: '1',
      setB: '1',
    },
    message: 'fallback english',
  };
  const out = localizeActivationIssue(issue, localizeFn);
  assert.equal(out, 'LOCAL:FABRICATE.Admin.Manager.RecipeActivation.IssueSignatureCollision');
  assert.equal(seen[0].data.recipeA, 'Healing Potion');
  // The label table exposes the code so the mapping is discoverable/testable.
  assert.ok(RECIPE_ACTIVATION_ISSUE_LABELS.signatureCollision);
});

test('localizeActivationIssue falls back to the issue default when the key is missing', () => {
  // A localize fn that echoes the key (Foundry behavior for an absent key) must
  // trigger the built-in fallback + interpolation, never surface the raw key.
  const echo = (key) => key;
  const issue = {
    code: 'signatureCollision',
    params: { recipeA: 'Alpha', recipeB: 'Beta', components: 'Ash', setA: '1', setB: '1' },
    message: 'ignored',
  };
  const out = localizeActivationIssue(issue, echo);
  assert.ok(!out.startsWith('FABRICATE.'), `should not surface the raw key: ${out}`);
  assert.match(out, /Alpha/);
  assert.match(out, /Beta/);
  assert.match(out, /Ash/);
});

test('localizeActivationIssue degrades safely for an unrecognized code — returns the English message, never the code or a key', () => {
  const issue = {
    code: 'someFutureCodeNotYetMapped',
    params: { detail: 'anything' },
    message: 'A step has no result set.',
  };
  // An unmapped code must fall through to the uncoded path and surface the
  // already-English `message` — never the raw code, never a FABRICATE.* key.
  const localizeFn = (key) => key; // even a real localize fn must not be consulted
  const out = localizeActivationIssue(issue, localizeFn);
  assert.equal(out, 'A step has no result set.');
  assert.ok(!out.includes('someFutureCodeNotYetMapped'), 'must not surface the raw code');
  assert.ok(!out.startsWith('FABRICATE.'), 'must not surface a lang key');
});

test('an UNNAMED shared component is dropped from the collision label — no id leaks on the component path', () => {
  // A colliding pair whose shared satisfying component has NO managed name. The
  // component-name label must OMIT it rather than fall back to its id, exercising
  // `_overlapComponentNames`' name filter.
  const components = [{ id: 'nZ8kLq2pWv4tYr6b', name: '', tags: [] }];
  const group = () => ({
    id: `grp-${Math.random().toString(36).slice(2)}`,
    options: [{ match: { type: 'component', componentId: 'nZ8kLq2pWv4tYr6b' }, quantity: 1 }],
  });
  const recipes = [
    {
      id: 'r-a',
      name: 'Alpha',
      enabled: true,
      ingredientSets: [{ id: 'setAAAAAAAAAAAAAA', ingredientGroups: [group()] }],
    },
    {
      id: 'r-b',
      name: 'Beta',
      enabled: true,
      ingredientSets: [{ id: 'setBBBBBBBBBBBBBB', ingredientGroups: [group()] }],
    },
  ];
  const system = { id: 'sys-alch', resolutionMode: 'alchemy' };
  const { conflicts } = buildValidator(system, recipes, components).validateSystem('sys-alch');

  assert.ok(conflicts.length > 0, 'expected an overlap conflict');
  const conflict = conflicts[0];

  // The unnamed component is dropped: the components label is empty, and neither
  // the params nor the default message carries the component id.
  assert.equal(
    conflict.params.components,
    '',
    'unnamed component must be dropped, not id-substituted'
  );
  assert.ok(!conflict.params.components.includes('nZ8kLq2pWv4tYr6b'));
  assert.doesNotMatch(conflict.message, FOUNDRY_ID_RE, `message leaked an id: ${conflict.message}`);
  assert.ok(!conflict.message.includes('nZ8kLq2pWv4tYr6b'));
  // The default message drops the "(shared components: …)" clause entirely when
  // there are no named components, so no empty-parens artifact surfaces.
  assert.ok(!conflict.message.includes('shared components'));

  // The localized toast is likewise id-free even though the component is unnamed.
  const error = new RecipeActivationError('Beta', [
    { code: conflict.code, params: conflict.params, message: conflict.message },
  ]);
  const localizeFn = (key, data) => {
    const templates = {
      'FABRICATE.Admin.Manager.RecipeActivation.CannotEnable':
        'Cannot enable recipe "{name}": {errors}',
      'FABRICATE.Admin.Manager.RecipeActivation.IssueSignatureCollision':
        'Recipe "{recipeA}" and recipe "{recipeB}" share components ({components}).',
    };
    const t = templates[key];
    if (!t) return key;
    return t.replaceAll(/\{(\w+)\}/g, (m, k) => (data && data[k] != null ? String(data[k]) : m));
  };
  const toast = localizeRecipeActivationError(error, localizeFn);
  assert.doesNotMatch(toast, FOUNDRY_ID_RE, `toast leaked an id: ${toast}`);
  assert.ok(!toast.includes('nZ8kLq2pWv4tYr6b'));
});

test('localizeRecipeActivationError builds a localized, id-free toast from a RecipeActivationError', () => {
  const { system, recipes, components } = collidingSystem();
  const { conflicts } = buildValidator(system, recipes, components).validateSystem('sys-alch');
  const issues = conflicts.map((c) => ({ code: c.code, params: c.params, message: c.message }));
  const error = new RecipeActivationError('Mana Potion', issues);

  // A localize fn that mimics Foundry's format (substitutes {placeholders}).
  const localizeFn = (key, data) => {
    const templates = {
      'FABRICATE.Admin.Manager.RecipeActivation.CannotEnable':
        'Cannot enable recipe "{name}": {errors}',
      'FABRICATE.Admin.Manager.RecipeActivation.IssueSignatureCollision':
        'Recipe "{recipeA}" and recipe "{recipeB}" share components ({components}).',
    };
    const t = templates[key];
    if (!t) return key;
    return t.replace(/\{(\w+)\}/g, (m, k) => (data && data[k] != null ? String(data[k]) : m));
  };

  const toast = localizeRecipeActivationError(error, localizeFn);
  assert.ok(toast.includes('Mana Potion'), 'toast names the recipe');
  assert.ok(toast.includes('Healing Potion'), 'toast names the colliding recipe');
  assert.ok(toast.includes('Ember Essence'), 'toast names the component');
  assert.doesNotMatch(toast, FOUNDRY_ID_RE, `toast leaked an id: ${toast}`);
});

test('localizeRecipeActivationError returns null for a plain (non-activation) error', () => {
  assert.equal(
    localizeRecipeActivationError(new Error('boom'), (k) => k),
    null
  );
});

test('RecipeActivationError.message stays a headless English aggregate for console/headless callers', () => {
  const err = new RecipeActivationError('Mana Potion', [
    {
      code: 'signatureCollision',
      params: {},
      message: 'Overlapping signatures between "Healing Potion" and "Mana Potion"',
    },
  ]);
  assert.match(err.message, /Cannot enable recipe "Mana Potion"/);
  assert.match(err.message, /Overlapping signatures/);
  assert.ok(Array.isArray(err.activationIssues));
  assert.equal(err.recipeName, 'Mana Potion');
});
