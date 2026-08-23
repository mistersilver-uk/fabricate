/**
 * `grantRecipeKnowledge` — the companion contract's GM knowledge grant (issue 1289, T2).
 *
 * Covers acceptance criteria 1-5 and 7. The `isObservable` seam is wired to the REAL
 * `RecipeVisibilityService.isLearnedKnowledgeObservable` rather than a stub, and the flag
 * seams to the REAL `getFabricateFlag` / `setFabricateFlag`, because a stubbed predicate
 * would pass whatever the grant asked it and prove nothing about the pairing these tests
 * exist to pin. Criteria 1-4 are the observability 2x2 (alchemy x observable); 3 and 4 are
 * mirrors of 1 and 2 and go RED against the withdrawn "learn mode OR alchemy" predicate, in
 * opposite directions.
 *
 * The actor double carries `update` and `setFlag` but deliberately NO `updateSource`, which
 * is the shape `setFabricateFlag` routes to `setFlag` for. That is why "zero writes" is
 * asserted as BOTH spies empty: asserting only the one the writer happens to use would pass
 * for a grant that wrote through the other.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Foundry globals, set before the service module is imported.
// ---------------------------------------------------------------------------

globalThis.foundry = {
  utils: {
    getProperty: (object, path) =>
      String(path ?? '')
        .split('.')
        .reduce((value, key) => (value == null ? undefined : value[key]), object),
  },
};
globalThis.ui = { notifications: { info: () => {}, warn: () => {}, error: () => {} } };
globalThis.game = { actors: [] };

const { grantRecipeKnowledge } = await import('../src/systems/companionKnowledgeGrant.js');
const { RecipeVisibilityService } = await import('../src/systems/RecipeVisibilityService.js');
const { LEARNED_RECIPES_FLAG_KEY, getFabricateFlag, setFabricateFlag } = await import(
  '../src/config/flags.js'
);
const { COMPANION_OUTCOMES, GRANTED_BY_MAX_LENGTH } = await import(
  '../src/systems/companionContract.js'
);
const { readLearnedRecipeEntries } = await import('../src/systems/recipeKeyedFlagEntries.js');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FLAG_SCOPE = 'fabricate';
// `getFabricateFlag`/`setFabricateFlag` prefix the key, so the durable path under the
// scope is doubly nested. Spelled from the shared constant so a rename cannot leave the
// fixture reading a flag nothing writes.
const FLAG_PATH = `${FLAG_SCOPE}.${LEARNED_RECIPES_FLAG_KEY}`;

function readPath(root, path) {
  return String(path)
    .split('.')
    .reduce((value, key) => (value == null ? undefined : value[key]), root);
}

function writePath(root, path, value) {
  const parts = String(path).split('.');
  const leaf = parts.pop();
  let target = root;
  for (const part of parts) {
    if (!target[part] || typeof target[part] !== 'object') target[part] = {};
    target = target[part];
  }
  target[leaf] = value;
}

/**
 * The actor the grant writes to.
 *
 * `learned` is seeded in the shape Foundry has ALREADY PERSISTED — a dotted recipe id is
 * passed pre-expanded as the subtree `Document#update` really stores it as — rather than
 * flat, so a fixture cannot lie about the persisted shape the way the pre-1143 doubles did.
 */
class GrantActor {
  constructor({ id = 'actor-1', name = 'Idrin', learned = null, refuseWrites = false } = {}) {
    this.id = id;
    this.name = name;
    this.items = [];
    this.setFlagCalls = [];
    this.updateCalls = [];
    this.refuseWrites = refuseWrites;
    this.flags = { [FLAG_SCOPE]: {} };
    if (learned) writePath(this.flags[FLAG_SCOPE], FLAG_PATH, learned);
  }

  getFlag(scope, key) {
    return readPath(this.flags[scope], key);
  }

  async setFlag(scope, key, value) {
    this.setFlagCalls.push({ scope, key, value });
    if (this.refuseWrites) throw new Error('Foundry refused the update');
    writePath((this.flags[scope] ||= {}), key, value);
    return value;
  }

  // Present so the double is a plausible Actor, and so "zero writes" can be asserted over
  // both write routes. `setFabricateFlag` only takes this route when `updateSource` also
  // exists, which it deliberately does not here.
  async update(changes) {
    this.updateCalls.push(changes);
    return this;
  }
}

const RECIPE = Object.freeze({
  id: 'recipe-1',
  name: 'Elixir of Focus',
  craftingSystemId: 'system-1',
  enabled: true,
});

/**
 * One system factory over every axis the predicate reads, so the 2x2 and its two legacy
 * variants differ only in the arguments named at each call site.
 */
function craftingSystem({
  resolutionMode = 'simple',
  visibilityMode = 'knowledge',
  knowledgeMode = 'itemOrLearned',
  learnOnCraft = false,
  listMode = undefined,
} = {}) {
  const system = {
    id: 'system-1',
    name: 'Test System',
    resolutionMode,
    alchemy: { learnOnCraft },
    recipeVisibility: { knowledge: { mode: knowledgeMode, learn: { dragDropEnabled: true } } },
  };
  if (visibilityMode !== undefined) system.visibilityMode = visibilityMode;
  if (listMode !== undefined) system.recipeVisibility.listMode = listMode;
  return system;
}

function harness({ system, recipes = [RECIPE] } = {}) {
  const recipeManager = {
    getRecipes: () => recipes,
    getRecipe: (id) => recipes.find((recipe) => String(recipe?.id) === String(id)) || null,
  };
  const service = new RecipeVisibilityService(recipeManager, { getSystem: () => system });
  return {
    service,
    seams: {
      resolveRecipe: (id) => recipeManager.getRecipe(id),
      resolveSystem: (recipe) => (recipe?.craftingSystemId === system?.id ? system : null),
      isObservable: (candidate) => service.isLearnedKnowledgeObservable(candidate),
      readFlag: getFabricateFlag,
      writeFlag: setFabricateFlag,
    },
  };
}

function persistedLearnedMap(actor) {
  return actor.getFlag(FLAG_SCOPE, FLAG_PATH);
}

function assertNoWrites(actor, why) {
  assert.deepEqual(actor.setFlagCalls, [], `${why}: no setFlag write`);
  assert.deepEqual(actor.updateCalls, [], `${why}: no update write`);
}

// ---------------------------------------------------------------------------
// Criterion 1 — a genuinely non-observable system refuses, and writes NOTHING
// ---------------------------------------------------------------------------

test('1289 C1 a non-observable system refuses knowledgeNotObservable with zero writes', async () => {
  // Non-alchemy `item`: the reveal switch's `item` arm forces `knowledgeMode: 'item'`, so
  // `hasLearned` can never grant and a learned entry here is unobservable forever.
  const system = craftingSystem({ visibilityMode: 'item' });
  const { seams } = harness({ system });
  const seed = { 'other-recipe': { learnedAt: 11, sourceItemUuid: 'Actor.a.Item.b' } };
  const actor = new GrantActor({ learned: seed });

  const result = await grantRecipeKnowledge(
    { actor, recipeId: RECIPE.id, grantedBy: 'fabricate-premium' },
    seams
  );

  assert.equal(result.success, false);
  assert.equal(result.outcome, COMPANION_OUTCOMES.knowledgeNotObservable);
  assert.equal(result.message, 'FABRICATE.Knowledge.Grant.KnowledgeNotObservable');
  assert.equal(result.messageData.visibilityMode, 'item');
  assert.equal(result.messageData.resolutionMode, 'simple');
  assertNoWrites(actor, 'a refused grant');
  // The positive control: the refusal left the map byte-identical, not merely un-appended.
  assert.deepEqual(persistedLearnedMap(actor), seed, 'the persisted map reads back unchanged');
});

// ---------------------------------------------------------------------------
// Criterion 2 — `global` alchemy with craft-time auto-learn OFF SUCCEEDS
// ---------------------------------------------------------------------------

test('1289 C2 a grant on GLOBAL alchemy with learnOnCraft off succeeds and writes the entry', async () => {
  // The alchemy switch's `default:` arm reads the learned map UNCONDITIONALLY; `learnOnCraft`
  // gates only the brew-discovery union. So a granted entry here IS revealed, and refusing it
  // (as an earlier revision did) would have withheld the member's whole reason for existing.
  const system = craftingSystem({ resolutionMode: 'alchemy', visibilityMode: 'global' });
  const { service, seams } = harness({ system });
  const actor = new GrantActor({ learned: {} });

  const result = await grantRecipeKnowledge(
    { actor, recipeId: RECIPE.id, grantedBy: 'downtime-companion' },
    seams
  );

  assert.equal(result.success, true);
  assert.equal(result.outcome, COMPANION_OUTCOMES.granted);
  assert.equal(result.messageData.recipe, 'Elixir of Focus');
  assert.equal(result.messageData.actor, 'Idrin');

  const entry = readLearnedRecipeEntries(persistedLearnedMap(actor)).get(RECIPE.id);
  assert.equal(entry.granted, true);
  assert.equal(entry.grantedBy, 'downtime-companion');
  assert.equal(entry.sourceItemUuid, null);
  assert.equal(typeof entry.learnedAt, 'number');

  // And the evaluator agrees the write was worth making.
  const access = service.evaluateRecipeAccess({
    recipe: RECIPE,
    viewer: { isGM: false, id: 'user-1' },
    craftingActor: actor,
  });
  assert.equal(access.visible, true, 'the granted recipe is revealed to its owner');
});

// ---------------------------------------------------------------------------
// Criterion 3 — mirror: flat `knowledge` over a residual `knowledge.mode: 'item'`
// ---------------------------------------------------------------------------

test('1289 C3 flat knowledge over a residual item sub-mode succeeds, and the evaluator agrees', async () => {
  // The state a migrated world reaches when the GM clicks "Knowledge":
  // `migrateVisibilityModeEnum` deliberately leaves the legacy block in place and
  // `setVisibilityMode` writes only `{ visibilityMode }`.
  const system = craftingSystem({ visibilityMode: 'knowledge', knowledgeMode: 'item' });
  const { service, seams } = harness({ system });
  const actor = new GrantActor({ learned: {} });

  // The disagreement this predicate exists for, pinned rather than assumed.
  assert.equal(
    service._isLearnModeEnabled(system),
    false,
    'the LEARN gate reads the residual sub-mode raw and refuses'
  );
  assert.equal(
    service.isLearnedKnowledgeObservable(system),
    true,
    'while the OBSERVABILITY predicate follows the forced itemOrLearned sub-mode'
  );

  const result = await grantRecipeKnowledge({ actor, recipeId: RECIPE.id }, seams);
  assert.equal(result.success, true);
  assert.equal(result.outcome, COMPANION_OUTCOMES.granted);

  const access = service.evaluateRecipeAccess({
    recipe: RECIPE,
    viewer: { isGM: false, id: 'user-1' },
    craftingActor: actor,
  });
  assert.equal(access.visible, true, 'predicate and evaluator cannot drift apart');
});

// ---------------------------------------------------------------------------
// Criterion 4 — mirror: alchemy `item` / `restricted` with auto-learn off REFUSES
// ---------------------------------------------------------------------------

test('1289 C4 alchemy item/restricted with auto-learn off refuses, and the evaluator hides the entry', async () => {
  // `access` present with nobody granted, so the `restricted` arm genuinely hides the recipe
  // rather than falling through the legacy `visibility.restricted !== true` allowance.
  const recipe = { ...RECIPE, access: { playerIds: [], characterIds: [] } };
  const seeded = { [recipe.id]: { learnedAt: 5, sourceItemUuid: null, granted: true } };

  for (const visibilityMode of ['item', 'restricted']) {
    const system = craftingSystem({ resolutionMode: 'alchemy', visibilityMode });
    const { service, seams } = harness({ system, recipes: [recipe] });
    const actor = new GrantActor({ learned: seeded });

    const result = await grantRecipeKnowledge({ actor, recipeId: recipe.id }, seams);

    assert.equal(result.success, false, `alchemy ${visibilityMode} refuses`);
    assert.equal(result.outcome, COMPANION_OUTCOMES.knowledgeNotObservable);
    assertNoWrites(actor, `alchemy ${visibilityMode}`);

    // The refusal is CORRECT, not merely conservative: an actor who already carries such an
    // entry still cannot see the recipe.
    const access = service.evaluateRecipeAccess({
      recipe,
      viewer: { isGM: false, id: 'user-1' },
      craftingActor: actor,
    });
    assert.equal(access.visible, false, `alchemy ${visibilityMode} never reveals a learned entry`);
  }
});

test('1289 C4b alchemy item/restricted becomes observable the moment auto-learn is ON', async () => {
  // The union arm, which is what keeps the alchemy half of the predicate from collapsing to
  // "not restricted and not item".
  for (const visibilityMode of ['item', 'restricted']) {
    const system = craftingSystem({
      resolutionMode: 'alchemy',
      visibilityMode,
      learnOnCraft: true,
    });
    const { seams } = harness({ system });
    const actor = new GrantActor({ learned: {} });

    const result = await grantRecipeKnowledge({ actor, recipeId: RECIPE.id }, seams);
    assert.equal(result.outcome, COMPANION_OUTCOMES.granted, `alchemy ${visibilityMode} + union`);
  }
});

// ---------------------------------------------------------------------------
// Criterion 5 — idempotency, including a dot-expanded legacy id
// ---------------------------------------------------------------------------

test('1289 C5 an already-known recipe answers alreadyKnown with success true and zero writes', async () => {
  const system = craftingSystem({ visibilityMode: 'knowledge' });
  const { seams } = harness({ system });
  const actor = new GrantActor({
    learned: { [RECIPE.id]: { learnedAt: 7, sourceItemUuid: null } },
  });

  const result = await grantRecipeKnowledge({ actor, recipeId: RECIPE.id }, seams);

  assert.equal(result.success, true, 'a re-run of a correct automation tick is not a failure');
  assert.equal(result.outcome, COMPANION_OUTCOMES.alreadyKnown);
  assertNoWrites(actor, 'an already-known recipe');
});

test('1289 C5 a DOT-EXPANDED legacy id is not re-granted, which a bare index would miss', async () => {
  const dottedId = 'imported.recipe.id';
  const recipe = { ...RECIPE, id: dottedId };
  const system = craftingSystem({ visibilityMode: 'knowledge' });
  const { seams } = harness({ system, recipes: [recipe] });
  // Seeded in the shape `Document#update` really persists a dotted key as: a SUBTREE, which
  // `learnedMap[recipe.id]` cannot see at all.
  const actor = new GrantActor({
    learned: { imported: { recipe: { id: { learnedAt: 9, sourceItemUuid: null } } } },
  });
  assert.equal(
    actor.getFlag(FLAG_SCOPE, FLAG_PATH)[dottedId],
    undefined,
    'a bare index really does miss it, which is what makes this case bite'
  );

  const result = await grantRecipeKnowledge({ actor, recipeId: dottedId }, seams);

  assert.equal(result.outcome, COMPANION_OUTCOMES.alreadyKnown);
  assertNoWrites(actor, 'a dot-expanded already-known id');
});

// ---------------------------------------------------------------------------
// Criterion 6 (the part this lane owns) — the recipe and system resolution gates
// ---------------------------------------------------------------------------

test('1289 C6 an unknown recipe refuses recipeNotFound before any system or flag is touched', async () => {
  const system = craftingSystem({ visibilityMode: 'knowledge' });
  const { seams } = harness({ system });
  const actor = new GrantActor({ learned: {} });
  let systemsResolved = 0;
  const counted = {
    ...seams,
    resolveSystem: (recipe) => {
      systemsResolved += 1;
      return seams.resolveSystem(recipe);
    },
  };

  const result = await grantRecipeKnowledge({ actor, recipeId: 'no-such-recipe' }, counted);

  assert.equal(result.success, false);
  assert.equal(result.outcome, COMPANION_OUTCOMES.recipeNotFound);
  assert.equal(systemsResolved, 0, 'the gates are ordered, not merely a set');
  assertNoWrites(actor, 'an unknown recipe');
});

test('1289 C6 a recipe whose system does not resolve refuses systemNotFound', async () => {
  const system = craftingSystem({ visibilityMode: 'knowledge' });
  const orphan = { ...RECIPE, craftingSystemId: 'system-gone' };
  const { seams } = harness({ system, recipes: [orphan] });
  const actor = new GrantActor({ learned: {} });

  const result = await grantRecipeKnowledge({ actor, recipeId: orphan.id }, seams);

  assert.equal(result.outcome, COMPANION_OUTCOMES.systemNotFound);
  assertNoWrites(actor, 'an unresolvable system');
});

// ---------------------------------------------------------------------------
// Criterion 7 — the written shape, and `grantedBy` refusals
// ---------------------------------------------------------------------------

test('1289 C7 the granted entry is four SCALARS and round-trips through the entry reader', async () => {
  const system = craftingSystem({ visibilityMode: 'knowledge' });
  const { seams } = harness({ system });
  const actor = new GrantActor({ learned: {} });

  await grantRecipeKnowledge({ actor, recipeId: RECIPE.id, grantedBy: '  Downtime  ' }, seams);

  const stored = persistedLearnedMap(actor)[RECIPE.id];
  assert.deepEqual(
    Object.keys(stored).sort(),
    ['granted', 'grantedBy', 'learnedAt', 'sourceItemUuid'],
    'exactly the four documented fields'
  );
  for (const [field, value] of Object.entries(stored)) {
    assert.ok(
      value === null || typeof value !== 'object',
      `granted entry field "${field}" must stay scalar (see recipeKeyedFlagEntries.js)`
    );
  }
  assert.equal(stored.grantedBy, 'Downtime', 'a label is trimmed, not refused');
  assert.deepEqual(
    readLearnedRecipeEntries(persistedLearnedMap(actor)).get(RECIPE.id),
    stored,
    'and the entry-boundary reader returns it whole'
  );
});

test('1289 C7 a LABEL-LESS grant still carries granted: true, with grantedBy null', async () => {
  const system = craftingSystem({ visibilityMode: 'knowledge' });
  const { seams } = harness({ system });

  for (const grantedBy of [undefined, null, '   ']) {
    const actor = new GrantActor({ learned: {} });
    const result = await grantRecipeKnowledge({ actor, recipeId: RECIPE.id, grantedBy }, seams);

    assert.equal(result.outcome, COMPANION_OUTCOMES.granted, `${String(grantedBy)} is accepted`);
    const stored = persistedLearnedMap(actor)[RECIPE.id];
    assert.equal(stored.granted, true, 'the discriminant is the field, never the label');
    assert.equal(stored.grantedBy, null);
  }
});

test('1289 C7 a non-string or over-long grantedBy REFUSES and writes nothing — not null', async () => {
  const system = craftingSystem({ visibilityMode: 'knowledge' });
  const { seams } = harness({ system });
  const cases = [
    [{ module: 'x' }, COMPANION_OUTCOMES.invalidGrantedBy],
    [['fabricate-premium'], COMPANION_OUTCOMES.invalidGrantedBy],
    [42, COMPANION_OUTCOMES.invalidGrantedBy],
    ['x'.repeat(GRANTED_BY_MAX_LENGTH + 1), COMPANION_OUTCOMES.grantedByTooLong],
  ];

  for (const [grantedBy, outcome] of cases) {
    const actor = new GrantActor({ learned: {} });
    const result = await grantRecipeKnowledge({ actor, recipeId: RECIPE.id, grantedBy }, seams);

    assert.equal(result.success, false);
    assert.equal(result.outcome, outcome, `${JSON.stringify(grantedBy)} refuses`);
    assertNoWrites(actor, `grantedBy ${JSON.stringify(grantedBy)}`);
  }

  // A truncated module id names a DIFFERENT module, so the limit is reported rather than
  // applied — and it is reported from the constant, not restated.
  const tooLong = await grantRecipeKnowledge(
    { actor: new GrantActor({ learned: {} }), recipeId: RECIPE.id, grantedBy: 'y'.repeat(200) },
    seams
  );
  assert.deepEqual(tooLong.messageData, { max: GRANTED_BY_MAX_LENGTH });
});

test('1289 C7 exactly GRANTED_BY_MAX_LENGTH characters is accepted, one more is not', async () => {
  const system = craftingSystem({ visibilityMode: 'knowledge' });
  const { seams } = harness({ system });
  const actor = new GrantActor({ learned: {} });

  const atLimit = await grantRecipeKnowledge(
    { actor, recipeId: RECIPE.id, grantedBy: 'z'.repeat(GRANTED_BY_MAX_LENGTH) },
    seams
  );

  assert.equal(atLimit.outcome, COMPANION_OUTCOMES.granted, 'the bound is inclusive');
  assert.equal(persistedLearnedMap(actor)[RECIPE.id].grantedBy.length, GRANTED_BY_MAX_LENGTH);
});

// ---------------------------------------------------------------------------
// A refused write is reported, never thrown
// ---------------------------------------------------------------------------

test('1289 a write Foundry refuses answers grantFailed rather than rejecting', async () => {
  const system = craftingSystem({ visibilityMode: 'knowledge' });
  const { seams } = harness({ system });
  const actor = new GrantActor({ learned: {}, refuseWrites: true });

  const result = await grantRecipeKnowledge({ actor, recipeId: RECIPE.id }, seams);

  assert.equal(result.success, false);
  assert.equal(result.outcome, COMPANION_OUTCOMES.grantFailed);
  assert.equal(result.message, 'FABRICATE.Knowledge.Grant.Failed');
  assert.equal(actor.setFlagCalls.length, 1, 'the write was attempted');
  assert.equal(
    persistedLearnedMap(actor)[RECIPE.id],
    undefined,
    'and nothing persisted, so success must not be reported'
  );
});

test('1289 every answer is FROZEN, so a caller cannot mutate the contract result', async () => {
  const system = craftingSystem({ visibilityMode: 'knowledge' });
  const { seams } = harness({ system });
  const actor = new GrantActor({ learned: {} });

  const result = await grantRecipeKnowledge({ actor, recipeId: RECIPE.id }, seams);

  assert.equal(Object.isFrozen(result), true);
});
