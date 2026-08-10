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

test('_normalizeCraftingCheck accepts every one of the four combination rules', () => {
  for (const defaultModifierPolicy of ['addAll', 'highest', 'byRecipe', 'playerPicks']) {
    assert.equal(
      makeManager()._normalizeCraftingCheck({ defaultModifierPolicy }).defaultModifierPolicy,
      defaultModifierPolicy,
      `${defaultModifierPolicy} is an offerable rule the normalizer persists verbatim`
    );
  }
});

// ── policy copy: the card's English fallbacks mirror lang/en.json ────────────
//
// `CraftingModifierCatalogueCard.svelte` hard-codes an English `fallback`/`descFallback`
// beside every `labelKey`/`descKey`, so the same sentence lives in two files. Nothing
// renders the fallback while en.json resolves, so a one-sided edit ships two different
// descriptions of the same option and no gate notices. Assert the mirror.
//
// Retargeted for issue 1055: the card authors TWO axes, so the option table is the FOUR
// COMBINATION RULES — four options, eight label/description pairs — and it carries three
// further hand-maintained mirrors in the `key`/`fallback` shape (the two per-rule pick-cap
// hints, the three default-set intros, and the inert causes), pinned for the same reason.
//
// The inert-cause count dropped from three to TWO in issue 1094: `noPlaceholder` retired
// with the roll-formula placeholder, so the second mirror expects seven pairs, not eight.
// The count is asserted rather than merely iterated because a DELETED block is exactly
// what an "every pair matches" loop cannot see.
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
    8,
    'label + description pairs across the four combination rules'
  );
  // `\bkey:` cannot match `labelKey:`/`descKey:` (no word boundary after `l`/`c`), so
  // this picks up only the MAX_PICKS_COPY, DEFAULTS_INTRO_COPY and INERT_COPY tables.
  assertMirrored(
    [...source.matchAll(/\bkey:\s*'([^']+)',\s*fallback:\s*'((?:[^'\\]|\\.)*)'/g)],
    7,
    'pick-cap hint, default-set intro and the TWO surviving inert-cause sentences'
  );
});

// The Overview tab restates the pick-source labels for its own tri-state select, the
// pick-cap sentences, and the inert cause from the recipe's point of view. Same mirror,
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
  ].filter(([, key]) => /(?:CraftingModifier|ModifierPolicy|ModifierUnnamed)/.test(key));
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

// ── the authority axis is GONE (issue 1055) ──────────────────────────────────
//
// The rejected design had a second axis on this block naming how much the system
// delegated to its recipes. It is not deprecated, it is deleted, and a normalizer that
// still round-tripped it would keep the retired shape alive on disk.

test('_normalizeCraftingCheck never emits a recipeModifierAuthority, even when handed one', () => {
  for (const check of [
    {},
    { recipeModifierAuthority: 'setOnly' },
    { defaultModifierPolicy: 'byRecipe' },
  ]) {
    assert.equal(
      Object.hasOwn(makeManager()._normalizeCraftingCheck(check), 'recipeModifierAuthority'),
      false,
      `${JSON.stringify(check)}: the retired axis is not a field this normalizer knows`
    );
  }
});

// ── the pick cap is absence-preserving (issue 1055) ──────────────────────────
//
// ABSENCE MEANS UNLIMITED, so a normalizer that wrote a placeholder — `1`, `0`, `null` —
// would silently bound every system that has never been asked, and truncate the recipe
// picks already on disk. Only a real positive integer survives as a key; every unbounded
// FORM normalizes to the same absent shape.

test('_normalizeCraftingCheck OMITS maxModifierPicks rather than defaulting it', () => {
  for (const maxModifierPicks of [undefined, null, 0, -1, 2.5, Infinity, NaN, 'three', {}]) {
    const result = makeManager()._normalizeCraftingCheck({ maxModifierPicks });
    assert.equal(
      Object.hasOwn(result, 'maxModifierPicks'),
      false,
      `${String(maxModifierPicks)}: the key is ABSENT, not written as a placeholder`
    );
  }
  assert.equal(
    Object.hasOwn(makeManager()._normalizeCraftingCheck({}), 'maxModifierPicks'),
    false,
    'and a check that never mentioned the cap stays unbounded'
  );
});

test('_normalizeCraftingCheck keeps an authored positive-integer cap', () => {
  for (const [input, expected] of [
    [1, 1],
    [3, 3],
    ['2', 2],
  ]) {
    assert.equal(
      makeManager()._normalizeCraftingCheck({ maxModifierPicks: input }).maxModifierPicks,
      expected
    );
  }
});

// The cap is stored SYSTEM-WIDE regardless of the current rule, so flipping between the
// two selecting rules — or parking on a non-selecting one — does not destroy it.
test('_normalizeCraftingCheck keeps the cap under every combination rule', () => {
  for (const defaultModifierPolicy of ['addAll', 'highest', 'byRecipe', 'playerPicks']) {
    assert.equal(
      makeManager()._normalizeCraftingCheck({ defaultModifierPolicy, maxModifierPicks: 2 })
        .maxModifierPicks,
      2,
      `${defaultModifierPolicy} does not discard a stored cap`
    );
  }
});

test('_normalizeSystem preserves cap absence, and an authored cap, through a whole system', () => {
  const manager = makeManager();
  const unbounded = manager._normalizeSystem({ id: 'sys-1', name: 'S' });
  assert.equal(
    Object.hasOwn(unbounded.craftingCheck, 'maxModifierPicks'),
    false,
    'a system created with no opinion stays unlimited'
  );
  const bounded = manager._normalizeSystem({
    id: 'sys-2',
    name: 'S',
    craftingCheck: { defaultModifierPolicy: 'byRecipe', maxModifierPicks: 2 },
  });
  assert.equal(bounded.craftingCheck.maxModifierPicks, 2);
  assert.equal(bounded.craftingCheck.defaultModifierPolicy, 'byRecipe');
});

test('_normalizeCraftingCheck preserves sibling check fields alongside the catalogue', () => {
  const result = makeManager()._normalizeCraftingCheck({
    simple: { rollFormula: '1d20 + @abilities.med.mod', dc: 12 },
    checkModifiers: [{ id: 'med', label: 'Medicine', expression: '@med' }],
  });
  assert.equal(result.simple.rollFormula, '1d20 + @abilities.med.mod');
  assert.equal(result.simple.dc, 12);
  assert.equal(result.checkModifiers.length, 1);
});

// ── recipe pick normalizer ───────────────────────────────────────────────────
//
// A recipe persists a PICK and nothing else (issue 1055): `{ modifierIds }`. It may
// choose WHICH modifiers apply, never HOW they combine, so the whole `policy` axis is
// gone from the stored shape.

test('Recipe.craftingModifier defaults to null (inherit) when absent or malformed', () => {
  assert.equal(new Recipe({ name: 'r' }).craftingModifier, null);
  assert.equal(new Recipe({ name: 'r', craftingModifier: 'nope' }).craftingModifier, null);
  assert.equal(new Recipe({ name: 'r', craftingModifier: {} }).craftingModifier, null);
  // A block carrying ONLY a rule is a block carrying nothing: the rule is not honoured,
  // so there is no pick and nothing to persist.
  for (const policy of ['bogus', 'addAll', 'highest', 'byRecipe', 'playerPicks']) {
    assert.equal(
      new Recipe({ name: 'r', craftingModifier: { policy } }).craftingModifier,
      null,
      `a policy-only block (${policy}) carries no pick → inherit`
    );
  }
});

// The system owns the rule outright, so a legacy `policy` left on disk by a pre-1055
// world is DROPPED on the way in and cannot round-trip back out through `toJSON`. The
// pick beside it survives untouched.
test('Recipe.craftingModifier DROPS a legacy policy and keeps the pick, de-duplicated', () => {
  const recipe = new Recipe({
    name: 'r',
    craftingModifier: { policy: 'byRecipe', modifierIds: ['alch', 'alch', '', 3, 'herb'] },
  });
  assert.deepEqual(recipe.craftingModifier, { modifierIds: ['alch', 'herb'] });
  assert.equal(
    Object.hasOwn(recipe.craftingModifier, 'policy'),
    false,
    'a recipe never persists a combination rule'
  );
  assert.deepEqual(
    new Recipe(recipe.toJSON()).craftingModifier,
    { modifierIds: ['alch', 'herb'] },
    'and the drop is a fixpoint through a toJSON round-trip'
  );
  // Every rule value is dropped the same way — `byRecipe` is not special-cased as a
  // legacy token, because it is now a live SYSTEM rule that simply never lives here.
  for (const policy of ['addAll', 'highest', 'byRecipe', 'playerPicks']) {
    assert.deepEqual(
      new Recipe({ name: 'r', craftingModifier: { policy, modifierIds: ['med'] } })
        .craftingModifier,
      { modifierIds: ['med'] },
      `${policy} is dropped alongside the surviving pick`
    );
  }
});

// The authored-empty-set contract, keyed on `Array.isArray` AT ENTRY (issue 1055).
test('Recipe.craftingModifier preserves an AUTHORED empty modifier set as a real pick', () => {
  assert.deepEqual(
    new Recipe({ name: 'r', craftingModifier: { modifierIds: [] } }).craftingModifier,
    { modifierIds: [] },
    'an authored empty array means "no modifiers", which appends nothing to the roll'
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
  assert.deepEqual(round.craftingModifier, { modifierIds: [] });
});

test('Recipe.craftingModifier round-trips a pick through toJSON', () => {
  const recipe = new Recipe({ name: 'r', craftingModifier: { modifierIds: ['med'] } });
  const restored = Recipe.fromJSON(recipe.toJSON());
  assert.deepEqual(restored.craftingModifier, { modifierIds: ['med'] });
});
