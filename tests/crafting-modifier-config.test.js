// Normalizer tests for the SYSTEM-level check-modifier catalogue, the per-activity
// selection triple over it, and the per-subject picks — issues 770, 1055, 1095.
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

// The catalogue is a SYSTEM field since issue 1095 — `_normalizeCraftingCheck` no longer
// emits it at all, which is exactly what makes the `1.22.0` migration's ordering
// load-bearing: a save that ran before the move would have DELETED it.
test('_normalizeCraftingCheck no longer emits a catalogue at all', () => {
  const result = makeManager()._normalizeCraftingCheck({
    checkModifiers: [{ id: 'med', label: 'Medicine', expression: '@med' }],
  });
  assert.equal(
    Object.hasOwn(result, 'checkModifiers'),
    false,
    'the catalogue moved UP to the system; a check block that still carried one would be a ' +
      'second location for the same data'
  );
});

test('_normalizeCraftingCheck defaults an absent selection to addAll + no ids (back-compat)', () => {
  const result = makeManager()._normalizeCraftingCheck({});
  assert.equal(result.defaultModifierPolicy, 'addAll');
  assert.deepEqual(result.defaultModifierIds, []);
});

test('_normalizeCheckModifierCatalogue normalizes entries, dropping malformed ones', () => {
  const result = makeManager()._normalizeCheckModifierCatalogue([
    { id: 'med', label: 'Medicine', expression: '  @abilities.med.mod  ', icon: 'fas fa-staff' },
    { id: '', label: 'no id', expression: '@x' },
    { label: 'missing id', expression: '@y' },
    { id: 'med', label: 'dup id', expression: '@dup' },
    { id: 'bad', label: 3, expression: 42 },
    'not an object',
  ]);
  assert.deepEqual(result, [
    { id: 'med', label: 'Medicine', expression: '@abilities.med.mod', icon: 'fas fa-staff' },
    { id: 'bad', label: '', expression: '' },
  ]);
});

// PER-ENTRY BOUNDS (issue 1095), absence-preserving in exactly the way `maxModifierPicks`
// is: only a FINITE number is attached, so every unbounded FORM normalizes to the same
// key-absent shape. `0` is a real bound and survives — which is why the guard cannot be
// truthiness.
test('_normalizeCheckModifierCatalogue attaches min/max only when authored', () => {
  const [bounded, floored, capped, zeroed] = makeManager()._normalizeCheckModifierCatalogue([
    { id: 'a', label: 'A', expression: '@a', min: -1, max: 5 },
    { id: 'b', label: 'B', expression: '@b', min: 2 },
    { id: 'c', label: 'C', expression: '@c', max: 3 },
    { id: 'd', label: 'D', expression: '@d', min: 0, max: 0 },
  ]);
  assert.deepEqual(bounded, { id: 'a', label: 'A', expression: '@a', min: -1, max: 5 });
  assert.equal(floored.min, 2);
  assert.equal(Object.hasOwn(floored, 'max'), false, 'an unauthored max stays absent');
  assert.equal(capped.max, 3);
  assert.equal(Object.hasOwn(capped, 'min'), false, 'an unauthored min stays absent');
  assert.deepEqual(
    zeroed,
    { id: 'd', label: 'D', expression: '@d', min: 0, max: 0 },
    'ZERO is a real bound: a truthiness guard would drop it and silently unbound the entry'
  );

  for (const junk of [null, undefined, '', NaN, Infinity, -Infinity, 'three', {}, []]) {
    const [entry] = makeManager()._normalizeCheckModifierCatalogue([
      { id: 'j', label: 'J', expression: '@j', min: junk, max: junk },
    ]);
    assert.deepEqual(
      entry,
      { id: 'j', label: 'J', expression: '@j' },
      `${String(junk)} is not a bound, so BOTH keys stay absent`
    );
  }
});

// An inverted pair is PRESERVED VERBATIM rather than repaired. It is a blocking readiness
// issue the GM must fix; silently swapping the two would roll a number nobody authored.
test('_normalizeCheckModifierCatalogue preserves an inverted min/max rather than reordering it', () => {
  const [entry] = makeManager()._normalizeCheckModifierCatalogue([
    { id: 'a', label: 'A', expression: '@a', min: 5, max: -1 },
  ]);
  assert.equal(entry.min, 5);
  assert.equal(entry.max, -1);
});

test('the selection keeps only known policies + catalogue-valid default ids', () => {
  const system = makeManager()._normalizeSystem({
    id: 's',
    name: 'S',
    checkModifiers: [
      { id: 'med', label: 'Medicine', expression: '@med' },
      { id: 'alch', label: 'Alchemy', expression: '@alch' },
    ],
    craftingCheck: {
      defaultModifierPolicy: 'highest',
      defaultModifierIds: ['med', 'ghost', 'alch', 'med'],
    },
  });
  assert.equal(system.craftingCheck.defaultModifierPolicy, 'highest');
  assert.deepEqual(
    system.craftingCheck.defaultModifierIds,
    ['med', 'alch'],
    'unknown + duplicate dropped'
  );
});

// ONE derivation, three activities (issue 1095). Each of these normalizers is an allowlist
// rebuild, so a key emitted by one and not another is dropped on the next save of that
// activity — silently, and in one direction only.
test('all THREE activity checks emit the same selection triple over the system catalogue', () => {
  const system = makeManager()._normalizeSystem({
    id: 's',
    name: 'S',
    checkModifiers: [
      { id: 'med', label: 'Medicine', expression: '@med' },
      { id: 'alch', label: 'Alchemy', expression: '@alch' },
    ],
    craftingCheck: { defaultModifierPolicy: 'bySubject', defaultModifierIds: ['med'] },
    salvageCraftingCheck: {
      defaultModifierPolicy: 'highest',
      defaultModifierIds: ['alch', 'ghost'],
      maxModifierPicks: 2,
    },
    gatheringCraftingCheck: {
      defaultModifierPolicy: 'playerPicks',
      defaultModifierIds: ['med', 'alch'],
    },
  });
  assert.equal(system.craftingCheck.defaultModifierPolicy, 'bySubject');
  assert.deepEqual(system.craftingCheck.defaultModifierIds, ['med']);
  assert.equal(system.salvageCraftingCheck.defaultModifierPolicy, 'highest');
  assert.deepEqual(
    system.salvageCraftingCheck.defaultModifierIds,
    ['alch'],
    'a salvage default naming nothing in the SYSTEM catalogue is dropped'
  );
  assert.equal(system.salvageCraftingCheck.maxModifierPicks, 2);
  assert.equal(system.gatheringCraftingCheck.defaultModifierPolicy, 'playerPicks');
  assert.deepEqual(system.gatheringCraftingCheck.defaultModifierIds, ['med', 'alch']);
  // Absence is preserved on every activity, not only on crafting.
  assert.equal(Object.hasOwn(system.craftingCheck, 'maxModifierPicks'), false);
  assert.equal(Object.hasOwn(system.gatheringCraftingCheck, 'maxModifierPicks'), false);
});

test('_normalizeCraftingCheck accepts every one of the four combination rules', () => {
  for (const defaultModifierPolicy of ['addAll', 'highest', 'bySubject', 'playerPicks']) {
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

  // The INLINE option table: three rules whose copy is activity-independent. The fourth,
  // `bySubject`, reads its label and description out of `SUBJECT_COPY`, because they change
  // per activity ("By recipe" / "By component" / "By gathering row") — so it is mirrored by
  // the per-activity block below instead.
  assertMirrored(
    [
      ...source.matchAll(
        /(?:labelKey|descKey):\s*'([^']+)',\s*\w*[Ff]allback:\s*'((?:[^'\\]|\\.)*)'/g
      ),
    ],
    6,
    'label + description pairs across the three activity-independent combination rules'
  );
  // SUBJECT_COPY: FOUR key/literal pairs per activity, on THREE activities (issue 1095) —
  // the per-activity `bySubject` label, its description, its pick-cap hint and its
  // eligibility intro. Twelve sentences that would otherwise drift one at a time, plus the
  // three activity-independent eligibility intros that share the `introKey`/`intro` shape.
  for (const [keyProp, valueProp, expected] of [
    ['labelKey', 'label', 3],
    ['descKey', 'desc', 3],
    ['capKey', 'cap', 3],
    ['introKey', 'intro', 6],
  ]) {
    assertMirrored(
      [
        ...source.matchAll(
          new RegExp(
            String.raw`\b${keyProp}:\s*'([^']+)',\s*${valueProp}:\s*\n?\s*'((?:[^'\\]|\\.)*)'`,
            'g'
          )
        ),
      ],
      expected,
      `${keyProp}/${valueProp} pairs`
    );
  }
  // `\bkey:` cannot match `labelKey:`/`descKey:` (no word boundary after `l`/`c`), so
  // this picks up only the MAX_PICKS_COPY, DEFAULTS_INTRO_COPY and INERT_COPY tables.
  assertMirrored(
    [...source.matchAll(/\bkey:\s*'([^']+)',\s*(?:label|fallback):\s*'((?:[^'\\]|\\.)*)'/g)],
    8,
    'the playerPicks cap hint, the two surviving inert-cause sentences, and the FIVE ' +
      'eligibility words — four rule states plus not-selected (issue 1095 moved the ' +
      'per-activity cap hints and intros into SUBJECT_COPY, keyed by `capKey`/`introKey`)'
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
    { defaultModifierPolicy: 'bySubject' },
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
  for (const defaultModifierPolicy of ['addAll', 'highest', 'bySubject', 'playerPicks']) {
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
    craftingCheck: { defaultModifierPolicy: 'bySubject', maxModifierPicks: 2 },
  });
  assert.equal(bounded.craftingCheck.maxModifierPicks, 2);
  assert.equal(bounded.craftingCheck.defaultModifierPolicy, 'bySubject');
});

test('_normalizeCraftingCheck preserves sibling check fields alongside the selection', () => {
  const result = makeManager()._normalizeCraftingCheck(
    {
      simple: { rollFormula: '1d20 + @abilities.med.mod', dc: 12 },
      defaultModifierPolicy: 'highest',
      defaultModifierIds: ['med'],
    },
    new Set(['med'])
  );
  assert.equal(result.simple.rollFormula, '1d20 + @abilities.med.mod');
  assert.equal(result.simple.dc, 12);
  assert.equal(result.defaultModifierPolicy, 'highest');
  assert.deepEqual(result.defaultModifierIds, ['med']);
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
