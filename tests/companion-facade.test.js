/**
 * The `game.fabricate` half of the companion contract (issue 1289, T5) — the two `stable`
 * delegators, the shared authorization preamble they sit on, and the member table that says
 * where every member is read from.
 *
 * WHY A REPRODUCTION (and not the real `Fabricate` class): `src/main.js` imports the global
 * stylesheet and Svelte UI at module load, so it cannot be imported under plain `node --test`.
 * This suite drives the shared facade harness — whose copies of `_requireGmActor` and the two
 * delegators are FAITHFUL COPIES of that file — wired to the REAL grant, the REAL affordability
 * reader, the REAL `RecipeVisibilityService` predicate and the REAL flag writer, so the only
 * reproduced code is the delegation itself. A source-contract guard at the foot of the file
 * then pins that reproduction against the production text IN BOTH DIRECTIONS, which is what
 * stops the copy drifting into a proof of its own correctness.
 *
 * Three acceptance criteria live here:
 *
 *   6.  The `gmOnly` / `noActor` / `notReady` triple, asserted PRE-`ready` so it pins
 *       GM -> actor -> readiness as an ORDER rather than a set. (T2 owns the other half of
 *       that criterion — `recipeNotFound` and `systemNotFound` — which is the grant's own.)
 *   13. Shape pins for every `stable` member's answer: the key set and the type of each key,
 *       plus one VALUE, so the pin bites on its own rather than only when a key moves.
 *   14. Every member resolves through its declared `host` and `path` — never by assuming a
 *       facade function — and appears verbatim in `docs/api/index.md`'s member table.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

import { ActorPropertyCoinSpender } from '../src/systems/CoinSpenders.js';
import { CraftingEngine } from '../src/systems/CraftingEngine.js';
import { RecipeVisibilityService } from '../src/systems/RecipeVisibilityService.js';
import {
  AFFORDABILITY_MESSAGE_KEYS,
  COMPANION_CONTRACT,
  COMPANION_MEMBERS,
  COMPANION_MEMBER_HOSTS,
  COMPANION_MEMBER_KINDS,
  COMPANION_OUTCOMES,
  COMPANION_PROMISES,
  KNOWLEDGE_GRANT_MESSAGE_KEYS,
} from '../src/systems/companionContract.js';

import { assertContractResult, assertLocalizationKey } from './helpers/companionContractOutcomes.js';
import {
  CurrencyCraftingActorFake,
  makeCurrencyConfigStoreStub,
  makeWorldCurrencyConfig,
} from './helpers/currency-spend-fixtures.js';
import {
  FabricateFacadeUnderTest,
  HARNESS_SOURCE,
  installFacadeGame,
  mainMethodSource,
} from './helpers/fabricateFacadeHarness.js';

const GM = { id: 'user-gm', isGM: true };
const PLAYER = { id: 'user-player', isGM: false };

const RECIPE = { id: 'recipe-1', name: 'Brew Healing Potion', craftingSystemId: 'system-1' };
/** Flat `knowledge` is the one non-alchemy mode under which a learned entry is observable. */
const OBSERVABLE_SYSTEM = { id: 'system-1', visibilityMode: 'knowledge' };

/**
 * The grant's target: an actor double that can be WRITTEN to as well as read.
 *
 * The shared `makeFacadeActor` double is read-only — it keeps its flag store in a closure and
 * exposes no writer — and `setFabricateFlag` answers `null` for a document with neither
 * `update`+`updateSource` nor `setFlag`. A grant against that double would report success
 * having persisted nothing, and every shape pin below would be a pin on a fiction.
 *
 * `setFlag` WITHOUT `updateSource` is deliberate: that pair is the branch the real writer
 * takes for a lightweight collaborator, so "wrote once" and "wrote nothing" are both
 * observable on the route production would actually use.
 */
function makeGrantTargetActor(id, { ownerUserIds = [] } = {}) {
  const owners = new Set(ownerUserIds);
  const flags = { fabricate: {} };
  const walk = (root, path) =>
    String(path)
      .split('.')
      .reduce((value, key) => (value == null ? undefined : value[key]), root);
  return {
    id,
    uuid: `Actor.${id}`,
    name: `Actor ${id}`,
    items: [],
    setFlagCalls: [],
    testUserPermission: (user, level) => level === 'OWNER' && owners.has(user?.id),
    get isOwner() {
      return owners.has(globalThis.game?.user?.id);
    },
    getFlag(scope, key) {
      return walk(flags[scope], key);
    },
    async setFlag(scope, key, value) {
      this.setFlagCalls.push({ scope, key, value });
      const parts = String(key).split('.');
      const leaf = parts.pop();
      let node = (flags[scope] ??= {});
      for (const part of parts) {
        if (!node[part] || typeof node[part] !== 'object') node[part] = {};
        node = node[part];
      }
      node[leaf] = value;
      return value;
    },
  };
}

/**
 * Stand the companion half of the facade up for ONE question, with the fixture named only
 * where it differs from the default. Everything else is real code.
 */
function standUpFacade({
  user = GM,
  ready = true,
  actors = [],
  recipes = [RECIPE],
  systems = [OBSERVABLE_SYSTEM],
  currencyUnits = undefined,
} = {}) {
  installFacadeGame({ user, actors });
  const resolveRecipeCalls = [];
  const facade = new FabricateFacadeUnderTest({
    ready,
    recipeManager: {
      getRecipe: (id) => {
        resolveRecipeCalls.push(id);
        return recipes.find((recipe) => recipe.id === id) ?? null;
      },
    },
    craftingSystemManager: {
      getSystem: (id) => systems.find((system) => system.id === id) ?? null,
    },
    recipeVisibilityService: new RecipeVisibilityService({}),
    currencyConfigStore: makeCurrencyConfigStoreStub(
      makeWorldCurrencyConfig(currencyUnits ? { units: currencyUnits } : {})
    ),
    actorPropertyCoinSpender: new ActorPropertyCoinSpender(),
  });
  return { facade, resolveRecipeCalls };
}

// ---------------------------------------------------------------------------
// Criterion 6 — the shared preamble, PRE-`ready`, as an order
// ---------------------------------------------------------------------------

/**
 * The two `stable` members, each with the member-specific strings its refusals must carry.
 *
 * Table-driven because the claim is that ONE rule serves both members while each answers in
 * its OWN words — and a per-member copy of these cases would be unable to fail on the second
 * half of that claim.
 */
const STABLE_MEMBERS = [
  {
    name: 'grantRecipeKnowledge',
    keys: KNOWLEDGE_GRANT_MESSAGE_KEYS,
    call: (facade, actorId) => facade.grantRecipeKnowledge({ actorId, recipeId: RECIPE.id }),
    extraKeys: [],
  },
  {
    name: 'checkAffordability',
    keys: AFFORDABILITY_MESSAGE_KEYS,
    call: (facade, actorId) => facade.checkAffordability({ actorId, unitId: 'gp', amount: 1 }),
    extraKeys: ['affordable'],
  },
];

/**
 * Assert one answer is a well-formed `stable` contract answer: frozen, exactly the documented
 * key set, each key of the documented type, and a `message` that is a localization key
 * resolving to a real string leaf.
 *
 * This is criterion 13's shape half, applied to every answer this suite produces rather than
 * to a hand-picked few — which is what makes an answer that GREW a field fail here.
 */
function assertStableAnswerShape(member, result) {
  assert.ok(Object.isFrozen(result), `${member.name}: an answer crosses the boundary frozen`);
  const required = ['success', ...member.extraKeys, 'outcome', 'message'];
  const keys = Object.keys(result);
  assert.deepEqual(
    keys.filter((key) => key !== 'messageData'),
    required,
    `${member.name}: the answer's key set (and its order) is the published contract`
  );
  assert.equal(typeof result.success, 'boolean', `${member.name}: success is a boolean`);
  assert.equal(typeof result.outcome, 'string', `${member.name}: outcome is a token`);
  assert.ok(
    Object.values(COMPANION_OUTCOMES).includes(result.outcome),
    `${member.name}: ${result.outcome} is not in the declared vocabulary`
  );
  assertLocalizationKey(result.message, `${member.name}'s ${result.outcome}`);
  if ('messageData' in result) {
    assert.equal(
      typeof result.messageData,
      'object',
      `${member.name}: messageData carries interpolation data, never a string`
    );
  }
  if (member.extraKeys.includes('affordable')) {
    assert.ok(
      result.affordable === true || result.affordable === false || result.affordable === null,
      `${member.name}: affordable is a boolean or null, got ${String(result.affordable)}`
    );
    if (result.success === false) {
      assert.equal(
        result.affordable,
        null,
        'a question that could not be ANSWERED must not read as a confident no'
      );
    }
  }
}

describe('criterion 6 — the gate order is GM -> actor -> readiness, not a set', () => {
  for (const member of STABLE_MEMBERS) {
    describe(member.name, () => {
      it('refuses a non-GM with gmOnly, in its OWN words, before readiness is even tested', async () => {
        // `ready: false` throughout. If readiness were tested FIRST — the shape r2 proposed —
        // this would answer `notReady`, and `_requireReady()` would have thrown besides.
        const actor = makeGrantTargetActor('actor-1', { ownerUserIds: [PLAYER.id] });
        const { facade, resolveRecipeCalls } = standUpFacade({
          user: PLAYER,
          ready: false,
          actors: [actor],
        });

        const result = await member.call(facade, 'actor-1');

        assertStableAnswerShape(member, result);
        assert.equal(result.outcome, COMPANION_OUTCOMES.gmOnly);
        assert.equal(result.success, false);
        assert.equal(result.message, member.keys[COMPANION_OUTCOMES.gmOnly]);
        assert.deepEqual(resolveRecipeCalls, [], 'a refused caller reaches no collaborator');
        assert.deepEqual(actor.setFlagCalls ?? [], [], 'and writes nothing');
      });

      it('refuses an unresolvable actor with noActor, still before readiness', async () => {
        const { facade, resolveRecipeCalls } = standUpFacade({ ready: false, actors: [] });

        const result = await member.call(facade, 'no-such-actor');

        assertStableAnswerShape(member, result);
        assert.equal(result.outcome, COMPANION_OUTCOMES.noActor);
        assert.equal(result.message, member.keys[COMPANION_OUTCOMES.noActor]);
        assert.deepEqual(resolveRecipeCalls, []);
      });

      it('refuses notReady only once BOTH earlier gates have passed, and does not throw', async () => {
        const actor = makeGrantTargetActor('actor-1');
        const { facade, resolveRecipeCalls } = standUpFacade({ ready: false, actors: [actor] });

        const result = await member.call(facade, 'actor-1');

        assertStableAnswerShape(member, result);
        assert.equal(result.outcome, COMPANION_OUTCOMES.notReady);
        assert.equal(result.message, member.keys[COMPANION_OUTCOMES.notReady]);
        assert.deepEqual(resolveRecipeCalls, [], 'nothing is delegated before readiness');
        assert.deepEqual(actor.setFlagCalls, [], 'and nothing is written');
      });

      it('is ORDERED, not merely a set: flipping one fact at a time moves the answer', async () => {
        // The three cases above each hold two facts wrong at once, so any of them would also
        // pass against an implementation that answered in a DIFFERENT order. These two
        // differentials are what make the order itself the subject: the same pre-`ready`
        // call answers `gmOnly` while the user is a player and `notReady` the moment it is
        // not, and answers `noActor` while the id is stale and `notReady` the moment it is
        // not. An order-agnostic implementation cannot produce both pairs.
        const actor = makeGrantTargetActor('actor-1', { ownerUserIds: [PLAYER.id] });
        // Each stand-up REPLACES `globalThis.game`, and the facade reads it live, so the two
        // halves of a differential are run one after another rather than built up front.
        const ask = async (options) =>
          (await member.call(standUpFacade({ ready: false, ...options }).facade, 'actor-1')).outcome;

        assert.equal(await ask({ user: PLAYER, actors: [actor] }), 'gmOnly');
        assert.equal(await ask({ user: GM, actors: [actor] }), 'notReady');

        assert.equal(await ask({ actors: [] }), 'noActor');
        assert.equal(await ask({ actors: [actor] }), 'notReady');
      });
    });
  }

  it('resolves the actor through the OWNERSHIP-gated resolver, not a bare collection read', () => {
    // "Un-actable-as" is unreachable through either member today, because the GM gate runs
    // first and `_resolveCraftingActor` bypasses its predicate for a GM. That is the correct
    // behaviour and not an omission — but it means no behavioural case can distinguish the
    // gated resolver from `game.actors.get`, so the claim is pinned at the source instead.
    // It is what keeps the property true if the GM gate is ever relaxed to an assistant tier.
    const preamble = mainMethodSource('_requireGmActor(actorId, { gmOnlyKey, noActorKey }) {');
    assert.ok(
      preamble.includes('this._resolveCraftingActor(actorId)'),
      'the preamble resolves through the ownership-gated resolver'
    );
    assert.equal(
      preamble.replace(/^\s*\/\/.*$/gm, '').includes('game.actors'),
      false,
      'and never reads the actor collection directly, which would drop that predicate'
    );
  });
});

// ---------------------------------------------------------------------------
// Criterion 13 — the answer shapes, and one value
// ---------------------------------------------------------------------------

describe('criterion 13 — every stable answer keeps its key set, its types, and its value', () => {
  it('grantRecipeKnowledge answers the granted shape, and persists what it reports', async () => {
    const actor = makeGrantTargetActor('actor-1');
    const { facade } = standUpFacade({ actors: [actor] });

    const result = await facade.grantRecipeKnowledge({
      actorId: 'actor-1',
      recipeId: RECIPE.id,
      grantedBy: 'Downtime: Research',
    });

    assertStableAnswerShape(STABLE_MEMBERS[0], result);
    assertContractResult(result, {
      success: true,
      outcome: COMPANION_OUTCOMES.granted,
      message: KNOWLEDGE_GRANT_MESSAGE_KEYS[COMPANION_OUTCOMES.granted],
      messageData: { recipe: 'Brew Healing Potion', actor: 'Actor actor-1' },
    });
    const [write] = actor.setFlagCalls;
    assert.equal(write.key, 'fabricate.learnedRecipes', 'written through the shared flag key');
    assert.deepEqual(
      Object.keys(write.value[RECIPE.id]).sort(),
      ['granted', 'grantedBy', 'learnedAt', 'sourceItemUuid'],
      'the entry is the four documented scalars'
    );
  });

  it('a re-run answers alreadyKnown in the same shape, with success still true', async () => {
    const actor = makeGrantTargetActor('actor-1');
    const { facade } = standUpFacade({ actors: [actor] });

    await facade.grantRecipeKnowledge({ actorId: 'actor-1', recipeId: RECIPE.id });
    const again = await facade.grantRecipeKnowledge({ actorId: 'actor-1', recipeId: RECIPE.id });

    assertStableAnswerShape(STABLE_MEMBERS[0], again);
    assert.equal(again.success, true, 'an automation tick may legitimately re-run');
    assert.equal(again.outcome, COMPANION_OUTCOMES.alreadyKnown);
    assert.equal(actor.setFlagCalls.length, 1, 'and the second call writes nothing');
  });

  it('checkAffordability answers a SHORTFALL by value: 1 sp cannot buy 1 gp', async () => {
    // The value half of this criterion. A key-set-and-type pin is value-insensitive by
    // construction, so this case is what fails if the ladder ever stops converting — and the
    // shortfall text is asserted NON-EMPTY because `message` is a localization key and the
    // spender's own free text has nowhere else to ride.
    const purse = new CurrencyCraftingActorFake('Idrin', { currency: { sp: 1 } });
    const { facade } = standUpFacade({ actors: [purse] });

    const result = await facade.checkAffordability({
      actorId: purse.id,
      unitId: 'gp',
      amount: 1,
    });

    assertStableAnswerShape(STABLE_MEMBERS[1], result);
    assert.equal(result.success, true, 'the question WAS answered; the answer is no');
    assert.equal(result.affordable, false);
    assert.equal(result.outcome, COMPANION_OUTCOMES.notAffordable);
    assert.ok(
      typeof result.messageData.detail === 'string' && result.messageData.detail.length > 0,
      'the shortfall itself rides as messageData.detail'
    );
    assert.deepEqual(purse.updates, [], 'and an affordability question is a read');
  });

  it('checkAffordability answers the affordable shape when the ladder converts', async () => {
    const purse = new CurrencyCraftingActorFake('Idrin', { currency: { sp: 10 } });
    const { facade } = standUpFacade({ actors: [purse] });

    const result = await facade.checkAffordability({ actorId: purse.id, unitId: 'gp', amount: 1 });

    assertStableAnswerShape(STABLE_MEMBERS[1], result);
    assertContractResult(result, {
      success: true,
      affordable: true,
      outcome: COMPANION_OUTCOMES.affordable,
      message: AFFORDABILITY_MESSAGE_KEYS[COMPANION_OUTCOMES.affordable],
      messageData: { actor: 'Idrin', amount: 1, unit: 'gp' },
    });
  });

  it('a refusal the facade forwards keeps the shape too, and never reads affordable false', async () => {
    const purse = new CurrencyCraftingActorFake('Idrin', { currency: { sp: 10 } });
    const { facade } = standUpFacade({ actors: [purse] });

    const unknownUnit = await facade.checkAffordability({
      actorId: purse.id,
      unitId: 'quatloo',
      amount: 1,
    });
    const missingRecipe = await facade.grantRecipeKnowledge({
      actorId: purse.id,
      recipeId: 'no-such-recipe',
    });

    assertStableAnswerShape(STABLE_MEMBERS[1], unknownUnit);
    assert.equal(unknownUnit.outcome, COMPANION_OUTCOMES.unitNotFound);
    assert.equal(unknownUnit.affordable, null);
    assertStableAnswerShape(STABLE_MEMBERS[0], missingRecipe);
    assert.equal(missingRecipe.outcome, COMPANION_OUTCOMES.recipeNotFound);
  });
});

// ---------------------------------------------------------------------------
// Criterion 14 — every member resolves through its declared host and path
// ---------------------------------------------------------------------------

const DOCS_API_INDEX = readFileSync(resolve(import.meta.dirname, '../docs/api/index.md'), 'utf8');

/**
 * Just the member TABLE, sliced out of the page.
 *
 * Scoped rather than matched against the whole file, because the prose beneath the table
 * legitimately names members too — `getCraftingEngine().findComponentItems` appears there in
 * its carve-out paragraph. A whole-file `includes` therefore passes for a member that has
 * been dropped FROM THE TABLE, which is what criterion 14 is actually about; the first draft
 * of this suite stayed green through exactly that mutation.
 */
const DOCS_MEMBER_TABLE = (() => {
  const header = '| Member | Promise | Read from | What it answers |';
  const start = DOCS_API_INDEX.indexOf(header);
  if (start < 0) throw new Error('docs/api/index.md no longer carries the COMPANION member table');
  const end = DOCS_API_INDEX.indexOf('\n\n', start);
  return DOCS_API_INDEX.slice(start, end < 0 ? undefined : end);
})();

/**
 * A facade in the state `bindFabricateGlobal` publishes it in: constructed, but with
 * `initialize()` not yet run. Every collaborator is at its constructor default, which is what
 * the `handle` tier's `null`-before-readiness promise is a claim about.
 */
function makeUninitializedFacade() {
  return new FabricateFacadeUnderTest();
}

/**
 * The same facade after `initialize()` would have run. `getCraftingEngine()` answers an object
 * on the REAL `CraftingEngine` prototype, so the eighth member — a method on the object a
 * `handle` accessor RETURNS, and the row a flat name list could not have described — resolves
 * against the real method rather than a stub that would agree with anything.
 */
function makeInitializedFacade() {
  return new FabricateFacadeUnderTest({
    ready: true,
    craftingEngine: Object.create(CraftingEngine.prototype),
    currencyConfigStore: makeCurrencyConfigStoreStub(),
    actorPropertyCoinSpender: new ActorPropertyCoinSpender(),
    actorInventoryCoinSpender: { check: async () => ({ valid: true }) },
  });
}

function resolveHost(member, facade) {
  if (member.host === COMPANION_MEMBER_HOSTS.contract) return COMPANION_CONTRACT;
  if (member.host === COMPANION_MEMBER_HOSTS.facade) return facade;
  if (member.host === COMPANION_MEMBER_HOSTS.craftingEngine) return facade.getCraftingEngine();
  throw new Error(`no host is modelled for ${member.host}`);
}

describe('criterion 14 — the member table resolves, and says where', () => {
  it('is a frozen descriptor whose members are frozen rows', () => {
    assert.ok(Object.isFrozen(COMPANION_CONTRACT), 'the published descriptor is frozen');
    assert.ok(Object.isFrozen(COMPANION_CONTRACT.members));
    for (const member of COMPANION_MEMBERS) assert.ok(Object.isFrozen(member), member.name);
  });

  it('resolves every member through its OWN declared host and path', () => {
    const facade = makeInitializedFacade();
    assert.equal(COMPANION_MEMBERS.length, 8, 'the declared set is eight members');
    for (const member of COMPANION_MEMBERS) {
      const host = resolveHost(member, facade);
      assert.ok(host, `${member.name}: its declared host resolved to nothing`);
      const value = host[member.path];
      if (member.kind === COMPANION_MEMBER_KINDS.value) {
        assert.equal(
          typeof value,
          'number',
          `${member.name} is a VALUE row, and the only one — it must resolve to a number`
        );
      } else {
        assert.equal(
          typeof value,
          'function',
          `${member.name} did not resolve to a function through ${member.host}.${member.path}`
        );
      }
    }
  });

  it('answers null — not undefined, and not a throw — from the four handle accessors, and only those four', () => {
    const facade = makeUninitializedFacade();
    const accessors = COMPANION_MEMBERS.filter(
      (member) => member.kind === COMPANION_MEMBER_KINDS.accessor
    );
    assert.deepEqual(
      accessors.map((member) => member.name),
      [
        'getCurrencyConfigStore',
        'getActorPropertyCoinSpender',
        'getActorInventoryCoinSpender',
        'getCraftingEngine',
      ],
      'exactly four members are accessors, and every one of them is a handle'
    );
    for (const member of accessors) {
      assert.equal(member.promise, COMPANION_PROMISES.handle, member.name);
      assert.strictEqual(
        facade[member.path](),
        null,
        `${member.name}() must answer null before initialize(), never undefined`
      );
    }
    // "…and only those four": the other facade-hosted members are callable at the same
    // moment, which is what makes `notReady` a REFUSAL rather than an absence.
    for (const member of COMPANION_MEMBERS.filter(
      (row) => row.host === COMPANION_MEMBER_HOSTS.facade && row.kind !== 'accessor'
    )) {
      assert.equal(typeof facade[member.path], 'function', member.name);
    }
    assert.equal(typeof COMPANION_CONTRACT.schemaVersion, 'number', 'and the version is readable');
  });

  it('names every member verbatim in the published docs table', () => {
    // The eighth member's NAME is the literal `getCraftingEngine().findComponentItems`, while
    // its `path` is the bare `findComponentItems` on the engine host. A docs check that
    // matched the path would pass on the wrong string, so this matches the name.
    assert.equal(
      DOCS_MEMBER_TABLE.trimEnd().split('\n').length,
      COMPANION_MEMBERS.length + 2,
      'the table has exactly one row per member, plus its header and separator'
    );
    for (const member of COMPANION_MEMBERS) {
      assert.ok(
        DOCS_MEMBER_TABLE.includes(`| \`${member.name}\` | \`${member.promise}\` |`),
        `the member table does not carry \`${member.name}\` at the ${member.promise} tier`
      );
    }
    assert.ok(
      DOCS_API_INDEX.includes('game.fabricate.api.COMPANION'),
      'and the docs name where the contract is published'
    );
  });
});

// ---------------------------------------------------------------------------
// SOURCE CONTRACT — the harness copies, pinned against src/main.js both ways
// ---------------------------------------------------------------------------

const PREAMBLE = '_requireGmActor(actorId, { gmOnlyKey, noActorKey }) {';
const GRANT = 'async grantRecipeKnowledge({ actorId = null, recipeId = null, grantedBy = null } = {}) {';
const AFFORD = 'async checkAffordability({ actorId = null, unitId = null, amount = null } = {}) {';

/**
 * Every claim below is asserted over BOTH texts.
 *
 * Pinning production alone catches production weakening and says nothing about the mirror
 * drifting away from it — a divergence that is behaviourally identical on the fixtures at
 * hand is invisible to every case above, and issue 1202 hit exactly that. So dropping either
 * gate from either side fails this suite.
 */
function bothTexts(signature) {
  return [
    ['production', mainMethodSource(signature)],
    ['the harness mirror', mainMethodSource(signature, HARNESS_SOURCE)],
  ];
}

/**
 * The same text with whole-line `//` comments removed.
 *
 * Every ABSENCE assertion below reads this rather than the raw slice, because a comment that
 * NAMES the forbidden call satisfies a raw `includes` check — and both methods here carry a
 * comment explaining precisely why they do not call `_requireReady()`. The first draft of
 * this suite went red on exactly that, which is the argument for the helper rather than for
 * rewording the comment: the next comment would reintroduce it.
 */
function codeOnly(body) {
  return body
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
}

describe('the harness copies are faithful to src/main.js', () => {
  it('reproduces the shared preamble, both gates and both parameterised refusals', () => {
    for (const [label, body] of bothTexts(PREAMBLE)) {
      assert.ok(body.length > 150, `non-vacuity: ${label} sliced to ${body.length} characters`);
      const gmAt = body.indexOf('if (game.user?.isGM !== true) {');
      const actorAt = body.indexOf('const actor = this._resolveCraftingActor(actorId);');
      assert.ok(gmAt >= 0, `${label} lost the GM gate`);
      assert.ok(actorAt >= 0, `${label} lost the ownership-gated actor resolution`);
      assert.ok(gmAt < actorAt, `${label} tests the actor before the GM`);
      assert.ok(
        body.includes('outcome: COMPANION_OUTCOMES.gmOnly, message: gmOnlyKey') &&
          body.includes('outcome: COMPANION_OUTCOMES.noActor, message: noActorKey'),
        `${label} stopped answering with the CALLER's own refusal strings`
      );
    }
  });

  it('reproduces one guard per member, ordered preamble-then-readiness', () => {
    for (const signature of [GRANT, AFFORD]) {
      for (const [label, body] of bothTexts(signature)) {
        assert.ok(
          body.includes('const gate = this._requireGmActor(actorId, {'),
          `${label} ${signature} no longer delegates its gate to the shared preamble`
        );
        assert.ok(
          body.includes('if (gate.outcome || this.ready !== true) {'),
          `${label} ${signature} lost the single guard that keeps the preamble ahead of readiness`
        );
        assert.equal(
          codeOnly(body).includes('_requireReady()'),
          false,
          `${label} ${signature} must REFUSE notReady, never throw it — a stable member may not throw`
        );
      }
    }
  });

  it('keeps each member on its own refusal strings, at both call sites', () => {
    for (const [label, body] of bothTexts(GRANT)) {
      assert.ok(
        body.includes('gmOnlyKey: KNOWLEDGE_GRANT_MESSAGE_KEYS[COMPANION_OUTCOMES.gmOnly]'),
        `${label}: a failed grant must not report itself in the words of a failed reset`
      );
    }
    for (const [label, body] of bothTexts(AFFORD)) {
      assert.ok(
        body.includes('gmOnlyKey: AFFORDABILITY_MESSAGE_KEYS[COMPANION_OUTCOMES.gmOnly]'),
        `${label}: the currency check answers in the currency vocabulary`
      );
    }
  });

  it('publishes COMPANION beside HOOKS, and publishes no grant symbol anywhere else', () => {
    const source = readFileSync(resolve(import.meta.dirname, '../src/main.js'), 'utf8');
    assert.ok(
      source.includes('HOOKS: FABRICATE_HOOKS,') && source.includes('COMPANION: COMPANION_CONTRACT'),
      'the descriptor is assigned onto game.fabricate.api beside the hook aggregate'
    );
    assert.equal(
      (source.match(/COMPANION: COMPANION_CONTRACT/g) || []).length,
      1,
      'assigned in exactly one place, so its version cannot differ between init and ready'
    );
    // `getRecipeVisibilityService()` hands out the live service UNGATED, so an unbounded
    // self-benefiting write published beside the class constructors — or re-exported from
    // this module — would be reachable by any player from the console with no gate at all.
    // The gated facade method is the only authorised route, by design.
    const exportBlocks = source.slice(source.indexOf('export const __test'));
    assert.equal(
      /grantRecipeKnowledge/.test(exportBlocks),
      false,
      'no grant symbol is re-exported from src/main.js'
    );
    assert.equal(
      source.includes('grantRecipeKnowledge,\n'),
      false,
      'and none is added to the api class bag as a bare shorthand property'
    );
  });
});
