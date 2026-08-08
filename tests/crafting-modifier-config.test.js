// Normalizer tests for the crafting check-modifier catalogue (system) and the
// per-recipe `craftingModifier` override (Recipe model) — issue 770.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

globalThis.foundry = {
  utils: { randomID: () => Math.random().toString(36).slice(2) },
};
globalThis.game = { user: { isGM: true }, system: { id: 'dnd5e' }, actors: [], fabricate: null };
globalThis.ui = { notifications: { warn: () => {}, error: () => {} } };

const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');
const { Recipe } = await import('../src/models/Recipe.js');

function makeManager() {
  return new CraftingSystemManager({ getRecipes: () => [] });
}

// ── system catalogue normalizer ──────────────────────────────────────────────

test('_normalizeCraftingCheck defaults an absent catalogue to empty + addAll (back-compat)', () => {
  const result = makeManager()._normalizeCraftingCheck({});
  assert.deepEqual(result.checkModifiers, []);
  assert.equal(result.defaultModifierPolicy, 'addAll');
  assert.deepEqual(result.defaultModifierIds, []);
});

test('_normalizeCraftingCheck normalizes catalogue entries, dropping malformed ones', () => {
  const result = makeManager()._normalizeCraftingCheck({
    checkModifiers: [
      { id: 'med', label: 'Medicine', expression: '  @abilities.med.mod  ', icon: 'fas fa-staff' },
      { id: '', label: 'no id', expression: '@x' },
      { label: 'missing id', expression: '@y' },
      { id: 'med', label: 'dup id', expression: '@dup' },
      { id: 'bad', label: 3, expression: 42 },
      'not an object',
    ],
  });
  assert.deepEqual(result.checkModifiers, [
    { id: 'med', label: 'Medicine', expression: '@abilities.med.mod', icon: 'fas fa-staff' },
    { id: 'bad', label: '', expression: '' },
  ]);
});

test('_normalizeCraftingCheck keeps only known policies + catalogue-valid default ids', () => {
  const result = makeManager()._normalizeCraftingCheck({
    checkModifiers: [
      { id: 'med', label: 'Medicine', expression: '@med' },
      { id: 'alch', label: 'Alchemy', expression: '@alch' },
    ],
    defaultModifierPolicy: 'highest',
    defaultModifierIds: ['med', 'ghost', 'alch', 'med'],
  });
  assert.equal(result.defaultModifierPolicy, 'highest');
  assert.deepEqual(result.defaultModifierIds, ['med', 'alch'], 'unknown + duplicate dropped');
});

test('_normalizeCraftingCheck accepts the Phase-2 playerPicks policy', () => {
  assert.equal(
    makeManager()._normalizeCraftingCheck({ defaultModifierPolicy: 'playerPicks' })
      .defaultModifierPolicy,
    'playerPicks'
  );
});

// ── policy copy: the card's English fallbacks mirror lang/en.json ────────────
//
// `CraftingModifierCatalogueCard.svelte` hard-codes an English `fallback`/`descFallback`
// beside every `labelKey`/`descKey`, so the same sentence lives in two files. Nothing
// renders the fallback while en.json resolves, so a one-sided edit ships two different
// descriptions of the same option and no gate notices. Assert the mirror.
//
// Retargeted for issue 1055: the card now authors TWO axes, so the option tables are the
// three COMBINATION RULES (`byRecipe` retired) plus the three AUTHORITY LEVELS — six
// options, twelve key/fallback pairs — and it gained two further hand-maintained mirrors
// in the `key`/`fallback` shape (the per-level downgrade consequence and the three inert
// causes), which are pinned here for the same reason.
test('the modifier card fallbacks match lang/en.json exactly', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const source = readFileSync(
    join(root, 'src/ui/svelte/apps/manager/checks/CraftingModifierCatalogueCard.svelte'),
    'utf8'
  );
  const lang = JSON.parse(readFileSync(join(root, 'lang/en.json'), 'utf8'));
  const resolve = (key) =>
    key.split('.').reduce((node, segment) => (node == null ? undefined : node[segment]), lang);
  const assertMirrored = (pairs, expectedCount, what) => {
    assert.equal(pairs.length, expectedCount, `expected ${expectedCount} ${what}`);
    for (const [, key, fallback] of pairs) {
      assert.equal(resolve(key), fallback.replaceAll("\\'", "'"), `${key} drifted`);
    }
  };

  assertMirrored(
    [
      ...source.matchAll(
        /(?:labelKey|descKey):\s*'([^']+)',\s*\w*[Ff]allback:\s*'((?:[^'\\]|\\.)*)'/g
      ),
    ],
    12,
    'label + description pairs across the three rules and the three authority levels'
  );
  // `\bkey:` cannot match `labelKey:`/`descKey:` (no word boundary after `l`/`c`), so
  // this picks up only the AUTHORITY_IMPACT and INERT_COPY tables.
  assertMirrored(
    [...source.matchAll(/\bkey:\s*'([^']+)',\s*fallback:\s*'((?:[^'\\]|\\.)*)'/g)],
    6,
    'downgrade-consequence and inert-cause sentences'
  );
});

// The Overview tab restates the three rule labels for its own select, and the two
// banners restate the three inert causes from the recipe's point of view. Same mirror,
// same failure mode, so the same guard (issue 1055).
test('the recipe Overview tab modifier fallbacks match lang/en.json exactly', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const source = readFileSync(
    join(root, 'src/ui/svelte/apps/manager/recipe/RecipeOverviewTab.svelte'),
    'utf8'
  );
  const lang = JSON.parse(readFileSync(join(root, 'lang/en.json'), 'utf8'));
  const resolve = (key) =>
    key.split('.').reduce((node, segment) => (node == null ? undefined : node[segment]), lang);

  // Scoped to the check-modifier keys this change owns. The tab carries other
  // key/fallback pairs whose drift predates issue 1055 and is not this guard's business.
  const pairs = [
    ...source.matchAll(/text\(\s*'(FABRICATE\.[^']+)',\s*\n?\s*'((?:[^'\\]|\\.)*)'\s*\)/g),
  ].filter(([, key]) =>
    /(?:CraftingModifier|ModifierPolicy|ModifierAuthority|ModifierUnnamed)/.test(key)
  );
  assert.ok(pairs.length >= 10, `expected the tab's modifier fallbacks, got ${pairs.length}`);
  for (const [, key, fallback] of pairs) {
    assert.equal(resolve(key), fallback.replaceAll("\\'", "'"), `${key} drifted`);
  }
});

test('_normalizeCraftingCheck coerces a genuinely unknown policy to addAll', () => {
  assert.equal(
    makeManager()._normalizeCraftingCheck({ defaultModifierPolicy: 'bogus' }).defaultModifierPolicy,
    'addAll'
  );
});

// ── the authority axis is absence-preserving (issue 1055) ────────────────────
//
// Task 1's whole contract. The migration and the initialize-time fallback both key on
// "not yet stamped", so a normalizer that wrote a placeholder — `null`, `'none'`,
// anything — would make the unstamped state unreachable and both of them dead code.

test('_normalizeCraftingCheck retires byRecipe from the offerable combination rules', () => {
  assert.equal(
    makeManager()._normalizeCraftingCheck({ defaultModifierPolicy: 'byRecipe' })
      .defaultModifierPolicy,
    'addAll',
    'byRecipe is no longer a rule the normalizer will persist'
  );
});

test('_normalizeCraftingCheck OMITS recipeModifierAuthority rather than defaulting it', () => {
  for (const check of [
    {},
    { recipeModifierAuthority: null },
    { recipeModifierAuthority: undefined },
    { recipeModifierAuthority: 'bogus' },
    { recipeModifierAuthority: 'byRecipe' },
  ]) {
    const result = makeManager()._normalizeCraftingCheck(check);
    assert.equal(
      Object.hasOwn(result, 'recipeModifierAuthority'),
      false,
      `${JSON.stringify(check)}: the key is ABSENT, not written as a placeholder`
    );
  }
  // A literal `null` therefore CANNOT survive normalization, which is why the fallback
  // stamp must key on absence and a `=== null` test downstream would be dead code.
  const normalized = makeManager()._normalizeCraftingCheck({ recipeModifierAuthority: null });
  assert.equal(normalized.recipeModifierAuthority, undefined);
});

test('_normalizeCraftingCheck keeps each of the three authored authority levels', () => {
  for (const authority of ['none', 'setOnly', 'setAndRule']) {
    assert.equal(
      makeManager()._normalizeCraftingCheck({ recipeModifierAuthority: authority })
        .recipeModifierAuthority,
      authority
    );
  }
});

test('_normalizeSystem preserves the absence of the authority through a whole system', () => {
  const manager = makeManager();
  const unstamped = manager._normalizeSystem({ id: 'sys-1', name: 'S' });
  assert.equal(
    Object.hasOwn(unstamped.craftingCheck, 'recipeModifierAuthority'),
    false,
    'a system created with no opinion stays unstamped'
  );
  const stamped = manager._normalizeSystem({
    id: 'sys-2',
    name: 'S',
    craftingCheck: { recipeModifierAuthority: 'setOnly' },
  });
  assert.equal(stamped.craftingCheck.recipeModifierAuthority, 'setOnly');
});

test('_normalizeCraftingCheck preserves sibling check fields alongside the catalogue', () => {
  const result = makeManager()._normalizeCraftingCheck({
    simple: { rollFormula: '1d20 + @craftingmod', dc: 12 },
    checkModifiers: [{ id: 'med', label: 'Medicine', expression: '@med' }],
  });
  assert.equal(result.simple.rollFormula, '1d20 + @craftingmod');
  assert.equal(result.simple.dc, 12);
  assert.equal(result.checkModifiers.length, 1);
});

// ── recipe override normalizer ───────────────────────────────────────────────

test('Recipe.craftingModifier defaults to null (inherit) when absent or malformed', () => {
  assert.equal(new Recipe({ name: 'r' }).craftingModifier, null);
  assert.equal(new Recipe({ name: 'r', craftingModifier: 'nope' }).craftingModifier, null);
  assert.equal(new Recipe({ name: 'r', craftingModifier: {} }).craftingModifier, null);
  // Retargeted, not deleted (issue 1055): `{ policy: 'bogus', modifierIds: [] }` no
  // longer normalizes to `null`, because the ARRAY is now an authored override on its
  // own. The malformed-policy-drop half of this case is still worth pinning — the junk
  // rule is dropped and the authored empty set survives.
  assert.deepEqual(
    new Recipe({ name: 'r', craftingModifier: { policy: 'bogus', modifierIds: [] } })
      .craftingModifier,
    { modifierIds: [] },
    'an unknown rule is dropped; the authored empty set is NOT inherit'
  );
  // …and with no id array at all, an unknown rule really does leave nothing to override.
  assert.equal(
    new Recipe({ name: 'r', craftingModifier: { policy: 'bogus' } }).craftingModifier,
    null,
    'no valid rule and no authored set → inherit'
  );
});

// Retargeted to assert the new MAPPING (issue 1055): `byRecipe` was never a combination
// rule, and the model rewrites it to the rule it arithmetically was — `addAll` over the
// recipe's own set. This is one half of a deliberate pair; the resolver's
// `LEGACY_POLICY_ALIASES` guards every context that never passed through this model.
test('Recipe.craftingModifier maps the retired byRecipe rule to addAll and de-duplicates the id subset', () => {
  const recipe = new Recipe({
    name: 'r',
    craftingModifier: { policy: 'byRecipe', modifierIds: ['alch', 'alch', '', 3, 'herb'] },
  });
  assert.deepEqual(recipe.craftingModifier, { policy: 'addAll', modifierIds: ['alch', 'herb'] });
  assert.deepEqual(
    new Recipe(recipe.toJSON()).craftingModifier,
    { policy: 'addAll', modifierIds: ['alch', 'herb'] },
    'and the mapping is a fixpoint through a toJSON round-trip'
  );
});

// The authored-empty-set contract, keyed on `Array.isArray` AT ENTRY (issue 1055).
test('Recipe.craftingModifier preserves an AUTHORED empty modifier set as a real override', () => {
  assert.deepEqual(
    new Recipe({ name: 'r', craftingModifier: { modifierIds: [] } }).craftingModifier,
    { modifierIds: [] },
    'an authored empty array means "no modifiers", which resolves @craftingmod to 0'
  );
  // Keyed at ENTRY, not on the post-filter length: junk ids are still an authored array,
  // and flipping this to "inherit" would be the unsafe direction for malformed imports.
  assert.deepEqual(
    new Recipe({ name: 'r', craftingModifier: { modifierIds: [123, ''] } }).craftingModifier,
    { modifierIds: [] },
    'a wholly-malformed authored array is an authored EMPTY set, not an absence'
  );
  // Absence is still absence.
  assert.equal(
    new Recipe({ name: 'r', craftingModifier: { modifierIds: 'nope' } }).craftingModifier,
    null,
    'a non-array modifierIds is not an authored set'
  );
  // …and it survives persistence, which is the only way the engine ever sees it.
  const round = new Recipe(
    new Recipe({ name: 'r', craftingModifier: { policy: 'highest', modifierIds: [] } }).toJSON()
  );
  assert.deepEqual(round.craftingModifier, { policy: 'highest', modifierIds: [] });
});

test('Recipe.craftingModifier accepts the Phase-2 playerPicks policy', () => {
  assert.deepEqual(
    new Recipe({ name: 'r', craftingModifier: { policy: 'playerPicks', modifierIds: ['med'] } })
      .craftingModifier,
    { policy: 'playerPicks', modifierIds: ['med'] }
  );
});

test('Recipe.craftingModifier allows a policy-only or ids-only override', () => {
  assert.deepEqual(
    new Recipe({ name: 'r', craftingModifier: { policy: 'highest' } }).craftingModifier,
    {
      policy: 'highest',
    }
  );
  assert.deepEqual(
    new Recipe({ name: 'r', craftingModifier: { modifierIds: ['med'] } }).craftingModifier,
    { modifierIds: ['med'] }
  );
});

test('Recipe.craftingModifier round-trips through toJSON', () => {
  const recipe = new Recipe({
    name: 'r',
    craftingModifier: { policy: 'addAll', modifierIds: ['med'] },
  });
  const restored = Recipe.fromJSON(recipe.toJSON());
  assert.deepEqual(restored.craftingModifier, { policy: 'addAll', modifierIds: ['med'] });
});
