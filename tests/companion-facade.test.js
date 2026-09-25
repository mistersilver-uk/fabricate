/**
 * The `game.fabricate` half of the companion contract (issue 1289, T5) — the two `stable`
 * delegators, the shared authorization preamble they sit on, and the member table that says where
 * every member is read from.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

import { ActorPropertyCoinSpender } from '../src/systems/CoinSpenders.js';
import { CraftingEngine } from '../src/systems/CraftingEngine.js';
import { RecipeVisibilityService } from '../src/systems/RecipeVisibilityService.js';
import { runFormulaPassFail, runFormulaProgressive } from '../src/systems/checkRoll.js';
import {
  AFFORDABILITY_MESSAGE_KEYS,
  BULK_CHECK_DECISION_MESSAGE_KEYS,
  CHECK_ROLL_MESSAGE_KEYS,
  COMPANION_CONTRACT,
  COMPANION_MEMBERS,
  COMPANION_MEMBER_HOSTS,
  COMPANION_MEMBER_KINDS,
  COMPANION_OUTCOMES,
  COMPANION_PROMISES,
  COMPONENT_AWARD_MESSAGE_KEYS,
  CURRENCY_CREDIT_MESSAGE_KEYS,
  KNOWLEDGE_GRANT_MESSAGE_KEYS,
  POOLED_ACTORS_MAX,
  POOLED_HOLDINGS_CONSUME_MESSAGE_KEYS,
  POOLED_HOLDINGS_READ_MESSAGE_KEYS,
} from '../src/systems/companionContract.js';
import { companionFacade } from '../src/bootstrap/companionFacade.js';
import {
  buildInteractiveRollOptions,
  promptBulkCheckRoll,
  promptCheckRoll,
} from '../src/ui/svelte/apps/crafting/rollPrompt.js';

import {
  assertContractResult,
  assertLocalizationKey,
  assertMessageDataCovers,
  assertMessageIsFromTable,
} from './helpers/companionContractOutcomes.js';
import {
  CurrencyCraftingActorFake,
  makeCurrencyConfigStoreStub,
  makeWorldCurrencyConfig,
} from './helpers/currency-spend-fixtures.js';
import {
  FabricateFacadeUnderTest,
  installFacadeGame,
  makeFacadeActor,
} from './helpers/fabricateFacadeHarness.js';

const GM = { id: 'user-gm', isGM: true };
const PLAYER = { id: 'user-player', isGM: false };

const RECIPE = { id: 'recipe-1', name: 'Brew Healing Potion', craftingSystemId: 'system-1' };
/** Flat `knowledge` is the one non-alchemy mode under which a learned entry is observable. */
const OBSERVABLE_SYSTEM = { id: 'system-1', visibilityMode: 'knowledge' };

/** The grant's target: an actor double that can be WRITTEN to as well as read. */
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

/** A `globalThis.Roll` the check-roll members can actually roll with. */
function installDice() {
  class FakeRoll {
    constructor(formula) {
      this.formula = formula;
      this.total = 18;
      this.dice = [{ number: 1, faces: 20, total: 18, results: [{ result: 18 }] }];
    }
    async evaluate() {
      return this;
    }
    async toMessage() {
      return { id: 'msg' };
    }
    static validate() {
      return true;
    }
  }
  FakeRoll.replaceFormulaData = (formula) => String(formula);
  globalThis.Roll = FakeRoll;
  globalThis.ChatMessage = { getSpeaker: ({ actor } = {}) => ({ alias: actor?.name ?? '' }) };
}

/** The Standalone Check Roll seam bag the harness facade injects, with its call records. */
function makeCheckSeams({ elected = true, diceEngine = true } = {}) {
  const calls = { prompt: 0, promptBulk: 0, bags: [] };
  return {
    calls,
    seams: {
      isElectedExecutor: () => elected,
      hasDiceEngine: () => diceEngine,
      localize: (_key, fallback) => fallback,
      prompt: async () => {
        calls.prompt += 1;
        return { confirmed: true };
      },
      promptBulk: async () => {
        calls.promptBulk += 1;
        return { confirmed: true, bonus: null, rollMode: undefined, advantage: 'normal' };
      },
      // The bag is RECORDED, because the delegator's own key discipline is only assertable
      // downstream of it: the leaf reads named keys and ignores the rest, so a delegator that
      // forwarded the whole request would be invisible to every module-level assertion — and
      // a forwarded `actor` overwrites the RESOLVED one and walks straight past the gate.
      runPassFail: async (bag) => {
        calls.bags.push(bag);
        return await runFormulaPassFail(bag);
      },
      runProgressive: async (bag) => {
        calls.bags.push(bag);
        return await runFormulaProgressive(bag);
      },
      buildRollOptions: buildInteractiveRollOptions,
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
  elected = true,
  diceEngine = true,
} = {}) {
  installFacadeGame({ user, actors });
  installDice();
  const checkSeams = makeCheckSeams({ elected, diceEngine });
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
    companionCheckSeams: checkSeams.seams,
  });
  return { facade, resolveRecipeCalls, checkCalls: checkSeams.calls, checkSeams: checkSeams.seams };
}

// Criterion 6 — the shared preamble, PRE-`ready`, as an order

/** The two `stable` members, each with the member-specific strings its refusals must carry. */
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
  {
    // The third ACTOR-TARGETED member.
    name: 'rollActorCheck',
    keys: CHECK_ROLL_MESSAGE_KEYS,
    call: (facade, actorId) =>
      facade.rollActorCheck({ actorId, callSite: 'gmAction', formula: '1d20', dc: 15 }),
    extraKeys: ['passed', 'total', 'diceGroups', 'resolvedFormula'],
  },
];

/**
 * Assert one answer is a well-formed `stable` contract answer: frozen, exactly the documented key
 * set, each key of the documented type, and a `message` that is a localization key resolving to a
 * real string leaf.
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
  // And the key's placeholders are all supplied. Every answer this suite produces comes from
  // the real member, so this is where a member that forgot its interpolation bag is caught.
  assertMessageDataCovers(result, `${member.name}'s ${result.outcome} answer`);
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
        // The three cases above each hold two facts wrong at once, so any of them would also pass
        // against an implementation that answered in a DIFFERENT order.
        const actor = makeGrantTargetActor('actor-1', { ownerUserIds: [PLAYER.id] });
        // Each stand-up REPLACES `globalThis.game`, and the facade reads it live, so the two
        // halves of a differential are run one after another rather than built up front.
        const ask = async (options) =>
          (await member.call(standUpFacade({ ready: false, ...options }).facade, 'actor-1'))
            .outcome;

        assert.equal(await ask({ user: PLAYER, actors: [actor] }), 'gmOnly');
        assert.equal(await ask({ user: GM, actors: [actor] }), 'notReady');

        assert.equal(await ask({ actors: [] }), 'noActor');
        assert.equal(await ask({ actors: [actor] }), 'notReady');
      });
    });
  }

  it('resolves the actor through the OWNERSHIP-gated resolver, not a bare collection read', async () => {
    // A GM with the actor in `game.actors`: only a preamble that asks `_resolveCraftingActor` can
    // answer noActor here, because a bare collection read would find it.
    const actor = makeGrantTargetActor('actor-1');
    const { facade } = standUpFacade({ actors: [actor] });
    const asked = [];
    facade._resolveCraftingActor = (actorId) => {
      asked.push(actorId);
      return null;
    };
    const result = await facade.grantRecipeKnowledge({ actorId: 'actor-1', recipeId: RECIPE.id });
    assert.equal(result.outcome, COMPANION_OUTCOMES.noActor);
    assert.deepEqual(asked, ['actor-1']);
  });
});

// AC-4 / AC-13 — the gate table over (isGM, callSite, isElectedExecutor)

/** A GM-owned actor the check members can roll for. */
function rollableActor() {
  return makeGrantTargetActor('actor-1');
}

describe('AC-4 — all eight cells of (isGM, callSite, elected), each with its prompt count', () => {
  for (const [isGM, callSite, elected, outcome, prompts] of [
    [true, 'gmAction', true, COMPANION_OUTCOMES.checkPassed, 1],
    // A single-client GM action does not consult the election at all, so an unelected GM
    // still rolls. Without this cell an implementation that elected EVERY call would pass.
    [true, 'gmAction', false, COMPANION_OUTCOMES.checkPassed, 1],
    // The cell the first draft of this criterion omitted. Without it, an implementation that
    // answered `notElected` for EVERY broadcast call satisfies the table in full.
    [true, 'broadcast', true, COMPANION_OUTCOMES.checkPassed, 1],
    [true, 'broadcast', false, COMPANION_OUTCOMES.notElected, 0],
    [false, 'gmAction', true, COMPANION_OUTCOMES.gmOnly, 0],
    [false, 'gmAction', false, COMPANION_OUTCOMES.gmOnly, 0],
    [false, 'broadcast', true, COMPANION_OUTCOMES.gmOnly, 0],
    [false, 'broadcast', false, COMPANION_OUTCOMES.gmOnly, 0],
  ]) {
    it(`isGM ${isGM} + ${callSite} + elected ${elected} -> ${outcome}, prompt x${prompts}`, async () => {
      const actor = rollableActor();
      const { facade, checkCalls } = standUpFacade({
        user: isGM ? GM : PLAYER,
        actors: [actor],
        elected,
      });

      const result = await facade.rollActorCheck({
        actorId: 'actor-1',
        callSite,
        formula: '1d20',
        dc: 15,
        interactive: true,
      });

      assert.equal(result.outcome, outcome);
      assert.equal(checkCalls.prompt, prompts, 'the dialog count separates refusal from roll');
      assert.equal(result.message, CHECK_ROLL_MESSAGE_KEYS[outcome]);
    });
  }

  it('is ORDERED: three cells that only the specified gate order can all produce', async () => {
    // A NON-GM with a missing call site and an unresolvable actor answers `gmOnly`.
    const noGm = standUpFacade({ user: PLAYER, actors: [] });
    assert.equal(
      (await noGm.facade.rollActorCheck({ actorId: 'ghost', formula: '1d20', dc: 15 })).outcome,
      COMPANION_OUTCOMES.gmOnly
    );

    // A GM with a VALID call site and an unresolvable actor answers `noActor`.
    const stale = standUpFacade({ actors: [] });
    assert.equal(
      (
        await stale.facade.rollActorCheck({
          actorId: 'ghost',
          callSite: 'gmAction',
          formula: '1d20',
          dc: 15,
        })
      ).outcome,
      COMPANION_OUTCOMES.noActor
    );

    // A GM with an unresolvable actor AND an invalid call site answers `noActor`.
    const both = standUpFacade({ actors: [] });
    assert.equal(
      (
        await both.facade.rollActorCheck({
          actorId: 'ghost',
          callSite: 'nonsense',
          formula: '1d20',
          dc: 15,
        })
      ).outcome,
      COMPANION_OUTCOMES.noActor
    );
  });
});

describe('AC-14 (facade half) — the delegator forwards NAMED KEYS, never the request', () => {
  it('keeps GM, actor and readiness refusals ahead of evaluation validation', async () => {
    const actor = makeGrantTargetActor('actor-1');
    for (const evaluation of [
      { pool: { die: 0 } },
      { direction: 'under' },
      { product: 'count' },
      { target: { source: 'attribute' } },
    ]) {
      for (const [options, actorId, outcome] of [
        [{ user: PLAYER, actors: [actor] }, actor.id, 'gmOnly'],
        [{ actors: [] }, 'missing', 'noActor'],
        [{ actors: [actor], ready: false }, actor.id, 'notReady'],
      ]) {
        const { facade, checkCalls } = standUpFacade(options);
        const answer = await facade.rollActorCheck({
          actorId,
          callSite: 'gmAction',
          formula: '1d20',
          evaluation,
        });
        assert.equal(answer.outcome, outcome);
        assert.deepEqual(checkCalls.bags, []);
        assert.equal(checkCalls.prompt, 0);
      }
    }
  });

  it('never invokes an evaluation accessor before or after the facade gates', async () => {
    const actor = makeGrantTargetActor('actor-1');
    let reads = 0;
    for (const [options, actorId, requestOptions, outcome] of [
      [{ user: PLAYER, actors: [actor] }, actor.id, {}, 'gmOnly'],
      [{ actors: [] }, 'missing', {}, 'noActor'],
      [{ actors: [actor], ready: false }, actor.id, {}, 'notReady'],
      [{ actors: [actor] }, actor.id, { callSite: 'unknown' }, 'invalidCallSite'],
      [{ actors: [actor], elected: false }, actor.id, { callSite: 'broadcast' }, 'notElected'],
      [
        { actors: [actor] },
        actor.id,
        { interactive: true, rollDecision: { confirmed: false } },
        'cancelled',
      ],
      [{ actors: [actor] }, actor.id, {}, 'evaluationInvalid'],
    ]) {
      const request = { actorId, callSite: 'gmAction', formula: '1d20', dc: 15, ...requestOptions };
      Object.defineProperty(request, 'evaluation', {
        get() {
          reads += 1;
          throw new Error('evaluation accessor ran');
        },
      });
      const { facade, checkCalls } = standUpFacade(options);
      const answer = await facade.rollActorCheck(request);
      assert.equal(answer.outcome, outcome);
      assertMessageDataCovers(answer, outcome);
      assert.deepEqual(checkCalls.bags, []);
      assert.equal(checkCalls.prompt, 0);
    }
    assert.equal(reads, 0);
  });

  it('settles a request reflection failure after authorization', async () => {
    const actor = makeGrantTargetActor('actor-1');
    const request = new Proxy(
      { actorId: actor.id, callSite: 'gmAction', formula: '1d20' },
      {
        getOwnPropertyDescriptor(record, key) {
          if (key === 'evaluation') throw new Error('descriptor failed');
          return Reflect.getOwnPropertyDescriptor(record, key);
        },
      }
    );
    for (const [options, outcome] of [
      [{ user: PLAYER, actors: [actor] }, 'gmOnly'],
      [{ actors: [] }, 'noActor'],
      [{ actors: [actor], ready: false }, 'notReady'],
      [{ actors: [actor] }, 'evaluationInvalid'],
    ]) {
      const { facade, checkCalls } = standUpFacade(options);
      assert.equal((await facade.rollActorCheck(request)).outcome, outcome);
      assert.deepEqual(checkCalls.bags, []);
      assert.equal(checkCalls.prompt, 0);
    }
  });

  it('forwards evaluation to the real leaf and preserves caller isolation', async () => {
    const actor = makeGrantTargetActor('actor-1');
    const { facade, checkCalls } = standUpFacade({ actors: [actor] });
    const request = {
      actorId: actor.id,
      callSite: 'gmAction',
      formula: '1d20',
      dc: 15,
      evaluation: { direction: 'under' },
      actor: { id: 'impostor' },
      speaker: { alias: 'impostor' },
      prompt: () => { throw new Error('caller prompt'); },
    };
    const unsupported = await facade.rollActorCheck(request);
    assert.equal(unsupported.outcome, 'evaluationUnsupported');
    assert.deepEqual(checkCalls.bags, []);
    request.evaluation = { product: 'sum', direction: 'over' };
    const supported = await facade.rollActorCheck(request);
    assert.equal(supported.outcome, 'checkPassed');
    assert.equal(supported.product, 'sum');
    assert.equal(supported.direction, 'over');
    assert.equal(supported.target, 15);
    assert.equal(checkCalls.bags[0].actor, actor);
  });

  it('cannot be handed an actor that overrides the one the ownership gate resolved', async () => {
    // The mutation this exists for is `{ actor: gate.actor, …, ...request }`.
    const owned = makeGrantTargetActor('actor-1');
    const impostor = { id: 'actor-99', name: 'Impostor', getRollData: () => ({}) };
    const hostilePrompt = { calls: 0 };
    const { facade, checkCalls, checkSeams } = standUpFacade({ actors: [owned] });

    const result = await facade.rollActorCheck({
      actorId: 'actor-1',
      callSite: 'gmAction',
      formula: '1d20',
      dc: 15,
      // `interactive: true` is what makes the prompt count below an assertion rather than a
      // decoration.
      interactive: true,
      actor: impostor,
      prompt: () => {
        hostilePrompt.calls += 1;
        return { confirmed: true };
      },
      speaker: { alias: 'Impostor' },
      craftingModifier: { catalogue: [{ id: 'x', value: 999 }] },
      triggers: [{ outcome: 'success' }],
    });

    assert.equal(result.outcome, COMPANION_OUTCOMES.checkPassed);
    const [bag] = checkCalls.bags;
    assert.equal(bag.actor, owned, 'the RESOLVED actor, never one the caller attached');
    assert.notEqual(bag.actor, impostor);
    assert.deepEqual(
      Object.keys(bag),
      [
        'formula',
        'dc',
        'thresholdMode',
        'triggers',
        'actor',
        'label',
        'rollOptions',
        'craftingModifier',
      ],
      'the runner call carries exactly the eight keys the delegator names'
    );
    assert.equal(bag.craftingModifier, null, 'no smuggled modifier catalogue');
    assert.deepEqual(bag.triggers, [], 'no smuggled forced-outcome trigger');
    // `prompt` is a LEGITIMATE key of the composed bag, so a key-set assertion alone cannot
    // see a caller's function installed under it. Identity can.
    assert.equal(bag.rollOptions.prompt, checkSeams.prompt, 'the SEAM prompt, by identity');
    assert.equal(checkCalls.prompt, 1, 'reachability: the seam prompt IS opened on this path');
    assert.equal(hostilePrompt.calls, 0, "and the caller's own prompt was never called");
  });
});

describe('AC-13 — resolveBulkCheckDecision refuses gmOnly and notReady, but NEVER noActor', () => {
  it('answers gmOnly for a non-GM, pre-ready, and opens no dialog', async () => {
    const { facade, checkCalls } = standUpFacade({ user: PLAYER, ready: false });

    const result = await facade.resolveBulkCheckDecision({
      callSite: 'gmAction',
      formulas: ['1d20'],
    });

    assert.equal(result.outcome, COMPANION_OUTCOMES.gmOnly);
    assert.equal(result.message, BULK_CHECK_DECISION_MESSAGE_KEYS.gmOnly);
    assert.equal(checkCalls.promptBulk, 0);
  });

  it('answers notReady once the GM gate has passed, as a refusal and never a throw', async () => {
    const { facade } = standUpFacade({ ready: false });

    const result = await facade.resolveBulkCheckDecision({
      callSite: 'gmAction',
      formulas: ['1d20'],
    });

    assert.equal(result.outcome, COMPANION_OUTCOMES.notReady);
    assert.equal(result.message, BULK_CHECK_DECISION_MESSAGE_KEYS.notReady);
  });

  it('never answers noActor, whatever it is handed, because it reads no actor', async () => {
    const { facade } = standUpFacade({ actors: [] });

    for (const request of [
      { callSite: 'gmAction', formulas: ['1d20'] },
      { callSite: 'gmAction', formulas: [] },
      { callSite: 'nonsense', formulas: ['1d20'] },
      // Even handed an actorId it does not declare, it must not grow an actor gate.
      { callSite: 'gmAction', formulas: ['1d20'], actorId: 'ghost' },
    ]) {
      const result = await facade.resolveBulkCheckDecision(request);
      assert.notEqual(result.outcome, COMPANION_OUTCOMES.noActor, JSON.stringify(request));
      assert.equal(
        BULK_CHECK_DECISION_MESSAGE_KEYS.noActor,
        undefined,
        'and the member declares no key for an outcome it can never answer'
      );
    }
  });

  it('settles a decision, and rolls nothing at all doing it', async () => {
    const { facade, checkCalls } = standUpFacade();

    const result = await facade.resolveBulkCheckDecision({
      callSite: 'gmAction',
      formulas: ['1d20', '', '2d10'],
    });

    assert.equal(result.outcome, COMPANION_OUTCOMES.decided);
    assert.equal(result.success, true);
    assert.deepEqual(result.covered, [0, 2]);
    assert.equal(checkCalls.promptBulk, 1);
    assert.equal(checkCalls.prompt, 0, 'the single-item prompt is not this member’s dialog');
  });
});

// Criterion 13 — the answer shapes, and one value

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
    // The value half of this criterion.
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

// Criterion 6 (pooled half) — the SET-valued preamble, as an ORDER and a SPLIT

const POOLED_COMPONENT = { id: 'component-iron', name: 'Iron Ore' };
const POOLED_SYSTEM = { id: 'system-1', components: [POOLED_COMPONENT], tools: [] };

/**
 * The two pooled members, each with its own refusal strings, its own answer shape and the request
 * it makes.
 */
const POOLED_MEMBERS = [
  {
    name: 'readPooledHoldings',
    keys: POOLED_HOLDINGS_READ_MESSAGE_KEYS,
    extra: { actorUuids: [], readings: [] },
    call: (facade, actorUuids) =>
      facade.readPooledHoldings({
        actorUuids,
        costs: [{ type: 'component', name: POOLED_COMPONENT.name, quantity: 1 }],
      }),
  },
  {
    name: 'consumePooledHoldings',
    keys: POOLED_HOLDINGS_CONSUME_MESSAGE_KEYS,
    extra: { actorUuids: [], consumed: null, ledger: [] },
    call: (facade, actorUuids) =>
      facade.consumePooledHoldings({
        actorUuids,
        callSite: 'gmAction',
        costs: [
          {
            type: 'component',
            systemId: POOLED_SYSTEM.id,
            componentId: POOLED_COMPONENT.id,
            quantity: 1,
          },
        ],
      }),
  },
];

/** One member's refusal, WHOLE, so a field that appeared or moved fails here. */
function pooledRefusal(member, outcome, messageData = null) {
  const expected = { success: false, ...member.extra, outcome, message: member.keys[outcome] };
  if (messageData) expected.messageData = messageData;
  return expected;
}

/** The two pooled seam bags, recording WHICH actor documents the leaves were handed. */
function makePooledSeams() {
  const seen = { actorUuids: [] };
  const findComponentItems = (actor, component) => {
    seen.actorUuids.push(actor?.uuid ?? null);
    return (actor?.items ?? []).filter((item) => item.name === component?.name);
  };
  const getSystem = (id) => (id === POOLED_SYSTEM.id ? POOLED_SYSTEM : null);
  return {
    seen,
    pooledHoldingsSeams: {
      getCurrencyConfig: () => null,
      listSystems: () => [POOLED_SYSTEM],
      craftingSystemManager: { getSystem },
      findComponentItems,
    },
    pooledConsumptionSeams: {
      getCurrencyConfig: () => null,
      isElectedExecutor: () => true,
      resolveSystem: (systemId) => getSystem(systemId),
      resolveComponent: (system, componentId) =>
        (system?.components ?? []).find((component) => component.id === componentId) ?? null,
      findComponentItems,
    },
  };
}

function standUpPooledFacade({ user = GM, ready = true, actors = [], documents = [] } = {}) {
  installFacadeGame({ user, actors, documents });
  const seams = makePooledSeams();
  const facade = new FabricateFacadeUnderTest({
    ready,
    pooledHoldingsSeams: seams.pooledHoldingsSeams,
    pooledConsumptionSeams: seams.pooledConsumptionSeams,
  });
  return { facade, seen: seams.seen };
}

/** An addressable actor carrying `Iron Ore`, at whatever address the caller names. */
function makePooledActor(id, uuid, quantity = 3) {
  const actor = makeFacadeActor(id, { owned: { [POOLED_COMPONENT.name]: quantity } });
  actor.uuid = uuid ?? actor.uuid;
  return actor;
}

describe('criterion 6 (pooled half) — GM -> actors -> readiness, and the split on WHAT resolved', () => {
  for (const member of POOLED_MEMBERS) {
    describe(member.name, () => {
      it('refuses a non-GM with gmOnly, in its OWN words, before any address is even read', async () => {
        // `ready: false` throughout, exactly as the singular half of this criterion runs: if
        // readiness were tested first this would answer `notReady`, and a `_requireReady()`
        // preamble would have thrown besides.
        const actor = makePooledActor('actor-1', 'Actor.actor-1');
        const { facade, seen } = standUpPooledFacade({
          user: PLAYER,
          ready: false,
          actors: [actor],
        });
        const result = await member.call(facade, [actor.uuid]);
        assertContractResult(result, pooledRefusal(member, COMPANION_OUTCOMES.gmOnly));
        assert.deepEqual(seen.actorUuids, [], 'a refused call reaches no leaf at all');
      });

      it('answers noActor when NOT ONE supplied address resolves, still before readiness', async () => {
        const { facade, seen } = standUpPooledFacade({ ready: false, actors: [] });
        const result = await member.call(facade, ['Actor.nobody', 'Actor.also-nobody']);
        assertContractResult(result, pooledRefusal(member, COMPANION_OUTCOMES.noActor));
        assert.deepEqual(seen.actorUuids, []);
      });

      it('answers invalidActorUuids for a request that is wrong, carrying its own bound', async () => {
        const actor = makePooledActor('actor-1', 'Actor.actor-1');
        // The SAME document at a second address, exactly as a LINKED token answers: `Token#actor`
        // returns `this.baseActor`, so these two well-formed, visibly different addresses are one
        // pool.
        const linked = makePooledActor('actor-2', 'Actor.actor-2');
        linked.uuidAliases = ['Scene.scene-1.Token.token-1.Actor.actor-2'];
        const overBound = Array.from({ length: POOLED_ACTORS_MAX + 1 }, () => actor.uuid);
        const REQUESTS = [
          ['absent', null],
          ['empty', []],
          ['over the bound', overBound],
          ['carrying a non-string', [actor.uuid, 42]],
          ['carrying an empty string', [actor.uuid, '   ']],
          // The one an outcome-blind gate gets wrong, and the reason the split exists: SOME of
          // these resolve.
          ['only PARTLY resolved', [actor.uuid, 'Actor.nobody']],
          // An address that resolves to something that is not an actor.
          ['addressing a document that is not an actor', [actor.uuid, 'Item.iron-ore']],
          // A pack address. `fromUuidSync` resolves one as `collection.get(id) ?? index.get(id)`,
          // so BEFORE anything loads the pack it answers an index entry with no `documentName` and
          // after it answers a real Actor — load-state-dependent behaviour on the member that
          // DELETES.
          ['addressing a compendium template actor', [actor.uuid, 'Compendium.pack.Actor.tpl']],
          // The repeat, said the two ways a caller reaches it.
          ['repeating one address', [actor.uuid, actor.uuid]],
          ['naming ONE document at TWO addresses', [linked.uuid, ...linked.uuidAliases]],
        ];
        for (const [label, actorUuids] of REQUESTS) {
          const { facade, seen } = standUpPooledFacade({
            actors: [actor, linked],
            documents: [
              { uuid: 'Item.iron-ore', documentName: 'Item', name: 'Iron Ore' },
              {
                uuid: 'Compendium.pack.Actor.tpl',
                documentName: 'Actor',
                inCompendium: true,
                name: 'Template',
                items: [],
              },
            ],
          });
          const result = await member.call(facade, actorUuids);
          assertContractResult(
            result,
            pooledRefusal(member, COMPANION_OUTCOMES.invalidActorUuids, {
              max: POOLED_ACTORS_MAX,
            })
          );
          assert.deepEqual(seen.actorUuids, [], `${label}: nothing was read or written`);
        }
      });

      it('refuses notReady only once BOTH earlier gates have passed, and does not throw', async () => {
        const actor = makePooledActor('actor-1', 'Actor.actor-1');
        const { facade, seen } = standUpPooledFacade({ ready: false, actors: [actor] });
        const result = await member.call(facade, [actor.uuid]);
        assertContractResult(result, pooledRefusal(member, COMPANION_OUTCOMES.notReady));
        assert.deepEqual(seen.actorUuids, []);
      });

      it('is ORDERED, not merely a set: flipping one fact at a time moves the answer', async () => {
        const actor = makePooledActor('actor-1', 'Actor.actor-1');
        const cases = [
          [{ user: PLAYER, ready: false }, [actor.uuid], COMPANION_OUTCOMES.gmOnly],
          [{ user: GM, ready: false }, ['Actor.nobody'], COMPANION_OUTCOMES.noActor],
          [{ user: GM, ready: false }, [], COMPANION_OUTCOMES.invalidActorUuids],
          [{ user: GM, ready: false }, [actor.uuid], COMPANION_OUTCOMES.notReady],
        ];
        for (const [options, actorUuids, outcome] of cases) {
          const { facade } = standUpPooledFacade({ ...options, actors: [actor] });
          const result = await member.call(facade, actorUuids);
          assert.equal(result.outcome, outcome, `${JSON.stringify(options)} -> ${outcome}`);
        }
      });
    });
  }

  it('hands the leaf the RESOLVED documents, in the caller order, once every gate has passed', async () => {
    const first = makePooledActor('actor-1', 'Actor.actor-1', 2);
    const second = makePooledActor('actor-2', 'Actor.actor-2', 3);
    const { facade, seen } = standUpPooledFacade({ actors: [first, second] });
    const result = await facade.readPooledHoldings({
      actorUuids: [second.uuid, first.uuid],
      costs: [{ type: 'component', name: POOLED_COMPONENT.name, quantity: 4 }],
    });
    assert.equal(result.outcome, COMPANION_OUTCOMES.read);
    assert.equal(result.success, true);
    assert.deepEqual(
      [...result.actorUuids],
      [second.uuid, first.uuid],
      'the answer echoes the resolved set in the order the caller asked for it'
    );
    assert.deepEqual(seen.actorUuids, [second.uuid, first.uuid], 'and the leaf saw those two');
    const [reading] = result.readings;
    assert.equal(reading.available, 5, 'the pool is summed across both sheets');
    assert.equal(reading.sufficient, true);
    assert.equal(reading.systemId, POOLED_SYSTEM.id);
    assert.equal(reading.componentId, POOLED_COMPONENT.id);
  });

  it('addresses the TOKEN actor its address names, never the world prototype sharing its id', async () => {
    // The whole reason these two members take a UUID.
    const prototype = makePooledActor('actor-1', 'Actor.actor-1', 9);
    const token = makePooledActor('actor-1', 'Scene.scene-1.Token.token-1.Actor.actor-1', 1);
    const { facade, seen } = standUpPooledFacade({ actors: [prototype], documents: [token] });
    const result = await facade.readPooledHoldings({
      actorUuids: [token.uuid],
      costs: [{ type: 'component', name: POOLED_COMPONENT.name, quantity: 1 }],
    });
    assert.deepEqual([...result.actorUuids], [token.uuid]);
    assert.deepEqual(seen.actorUuids, [token.uuid]);
    assert.equal(result.readings[0].available, 1, 'the token paid attention to its own sheet');
  });

  it('reaches the consume leaf once the gate passes, and the leaf owns the rest', async () => {
    // The consume's own leaf-level refusal, reached only because the preamble admitted the set:
    // an empty `costs` list is `invalidCosts`, a token no facade gate can produce.
    const actor = makePooledActor('actor-1', 'Actor.actor-1');
    const { facade } = standUpPooledFacade({ actors: [actor] });
    const result = await facade.consumePooledHoldings({
      actorUuids: [actor.uuid],
      callSite: 'gmAction',
      costs: [],
    });
    assert.equal(result.outcome, COMPANION_OUTCOMES.invalidCosts);
    assertMessageIsFromTable(result, POOLED_HOLDINGS_CONSUME_MESSAGE_KEYS, 'the consume');
  });
});

// Criterion 14 — every member resolves through its declared host and path

const DOCS_API_INDEX = readFileSync(resolve(import.meta.dirname, '../docs/api/index.md'), 'utf8');

/** Just the member TABLE, sliced out of the page. */
const DOCS_MEMBER_TABLE = (() => {
  const header = '| Member | Promise | Read from | What it answers |';
  const start = DOCS_API_INDEX.indexOf(header);
  if (start < 0) throw new Error('docs/api/index.md no longer carries the COMPANION member table');
  const end = DOCS_API_INDEX.indexOf('\n\n', start);
  return DOCS_API_INDEX.slice(start, end < 0 ? undefined : end);
})();

/**
 * A facade in the state `bindFabricateGlobal` publishes it in: constructed, but with `initialize()`
 * not yet run.
 */
function makeUninitializedFacade() {
  return new FabricateFacadeUnderTest();
}

/** The same facade after `initialize()` would have run. */
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
    assert.equal(COMPANION_MEMBERS.length, 14, 'the declared set is fourteen members');
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
    // The eighth member's NAME is the literal `getCraftingEngine().findComponentItems`, while its
    // `path` is the bare `findComponentItems` on the engine host.
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
    assert.ok(DOCS_API_INDEX.includes('game.fabricate.api.companion'));
    assert.ok(DOCS_API_INDEX.includes('game.fabricate.api.COMPANION'));
  });
});

// The production seam bags, read off the REAL facade (issue 1933)

// `ACTIVE_GM` is `game.users.activeGM`, standing in for the role-4 GAMEMASTER.
const ACTIVE_GM = { id: 'user-gm', isGM: true };
const ASSISTANT_GM = { id: 'user-assistant', isGM: true, role: 3, active: true };

/** A real facade over recording collaborators, with `game.users.activeGM` set to `ACTIVE_GM`. */
function seamFacade() {
  const { setCurrentUser, game } = installFacadeGame({ user: ACTIVE_GM });
  game.users = { activeGM: ACTIVE_GM };
  game.i18n = { localize: (key) => (key === 'KNOWN' ? 'Known text' : key) };
  const component = { id: 'comp-1', name: 'Iron Ore' };
  const system = { id: 'sys-1', components: [component] };
  const calls = [];
  const record =
    (name, value) =>
    (...args) => {
      calls.push([name, ...args]);
      return value;
    };
  const facade = new FabricateFacadeUnderTest({
    craftingSystemManager: {
      getSystem: record('getSystem', system),
      getSystems: record('getSystems', [system]),
    },
    craftingEngine: { findComponentItems: record('findComponentItems', ['held']) },
    currencyConfigStore: { get: record('currencyConfig', { units: [] }) },
    actorPropertyCoinSpender: { kind: 'property' },
    actorInventoryCoinSpender: { kind: 'inventory' },
  });
  globalThis.fromUuid = record('fromUuid', { uuid: 'Item.source' });
  return { facade, calls, component, system, setCurrentUser };
}

const WORLD_CURRENCY_SEAMS = [
  'getCurrencyConfig',
  'actorPropertyCoinSpender',
  'actorInventoryCoinSpender',
];

/** Each production bag and the exact seams it binds; a dropped seam leaves its leaf on undefined. */
const SEAM_BAGS = [
  ['_worldCurrencySeams', WORLD_CURRENCY_SEAMS],
  [
    '_companionCheckSeams',
    [
      'isElectedExecutor',
      'hasDiceEngine',
      'localize',
      'prompt',
      'promptBulk',
      'runPassFail',
      'runProgressive',
      'buildRollOptions',
    ],
  ],
  [
    '_componentAwardSeams',
    [
      'resolveSystem',
      'resolveComponent',
      'findComponentItems',
      'resolveSourceItem',
      'isElectedExecutor',
    ],
  ],
  [
    '_pooledHoldingsSeams',
    [...WORLD_CURRENCY_SEAMS, 'listSystems', 'craftingSystemManager', 'findComponentItems'],
  ],
  [
    '_pooledConsumptionSeams',
    [
      ...WORLD_CURRENCY_SEAMS,
      'isElectedExecutor',
      'resolveSystem',
      'resolveComponent',
      'findComponentItems',
    ],
  ],
];

/** Swap `globalThis.Roll` for one call, so `hasDiceEngine` is asked both ways. */
function withRoll(value, ask) {
  const previous = globalThis.Roll;
  globalThis.Roll = value;
  try {
    return ask();
  } finally {
    globalThis.Roll = previous;
  }
}

const heldItems = ({ bag, calls }) =>
  bag.findComponentItems('a', 'c', 's')[0] === 'held' &&
  calls.at(-1).join(',') === 'findComponentItems,a,c,s';
const resolvesSystem = ({ bag, system }) => bag.resolveSystem('sys-1') === system;
const resolvesComponent = ({ bag, system, component }) =>
  bag.resolveComponent(system, 'comp-1') === component &&
  bag.resolveComponent(system, 'nope') === null;
const readsWorldLadder = ({ bag }) => Array.isArray(bag.getCurrencyConfig()?.units);

/** `[bag, seam, probe]`: what each binding must reach, asked of the bag production builds. */
const SEAM_PROBES = [
  ['_companionCheckSeams', 'prompt', ({ bag }) => bag.prompt === promptCheckRoll],
  ['_companionCheckSeams', 'promptBulk', ({ bag }) => bag.promptBulk === promptBulkCheckRoll],
  ['_companionCheckSeams', 'runPassFail', ({ bag }) => bag.runPassFail === runFormulaPassFail],
  [
    '_companionCheckSeams',
    'runProgressive',
    ({ bag }) => bag.runProgressive === runFormulaProgressive,
  ],
  [
    '_companionCheckSeams',
    'buildRollOptions',
    ({ bag }) => bag.buildRollOptions === buildInteractiveRollOptions,
  ],
  [
    '_companionCheckSeams',
    'hasDiceEngine',
    ({ bag }) =>
      withRoll(function Roll() {}, bag.hasDiceEngine) === true &&
      withRoll(undefined, bag.hasDiceEngine) === false,
  ],
  [
    '_companionCheckSeams',
    'localize',
    ({ bag }) =>
      bag.localize('KNOWN', 'fallback') === 'Known text' &&
      bag.localize('MISSING', 'fallback') === 'fallback',
  ],
  ['_worldCurrencySeams', 'getCurrencyConfig', readsWorldLadder],
  [
    '_worldCurrencySeams',
    'actorPropertyCoinSpender',
    ({ bag }) => bag.actorPropertyCoinSpender?.kind === 'property',
  ],
  [
    '_worldCurrencySeams',
    'actorInventoryCoinSpender',
    ({ bag }) => bag.actorInventoryCoinSpender?.kind === 'inventory',
  ],
  ['_pooledHoldingsSeams', 'getCurrencyConfig', readsWorldLadder],
  ['_pooledHoldingsSeams', 'listSystems', ({ bag, system }) => bag.listSystems()[0] === system],
  [
    '_pooledHoldingsSeams',
    'craftingSystemManager',
    ({ bag, facade }) => bag.craftingSystemManager === facade.craftingSystemManager,
  ],
  ['_pooledHoldingsSeams', 'findComponentItems', heldItems],
  ['_pooledConsumptionSeams', 'getCurrencyConfig', readsWorldLadder],
  ['_pooledConsumptionSeams', 'resolveSystem', resolvesSystem],
  ['_pooledConsumptionSeams', 'resolveComponent', resolvesComponent],
  ['_pooledConsumptionSeams', 'findComponentItems', heldItems],
  ['_componentAwardSeams', 'resolveSystem', resolvesSystem],
  ['_componentAwardSeams', 'resolveComponent', resolvesComponent],
  ['_componentAwardSeams', 'findComponentItems', heldItems],
  [
    '_componentAwardSeams',
    'resolveSourceItem',
    ({ bag, calls }) =>
      bag.resolveSourceItem('Item.source')?.uuid === 'Item.source' &&
      calls.at(-1)[0] === 'fromUuid',
  ],
];

/** Every bag carrying an election, which must elect the ACTIVE GM and nobody else. */
const ELECTED_BAGS = ['_companionCheckSeams', '_componentAwardSeams', '_pooledConsumptionSeams'];

describe('the production facade binds every seam bag to the collaborator it ships', () => {
  for (const [member, keys] of SEAM_BAGS) {
    it(`${member} binds exactly ${keys.length} seams`, () => {
      const { facade } = seamFacade();
      assert.deepEqual(Object.keys(facade[member]()), keys);
    });
  }

  for (const [member, seam, probe] of SEAM_PROBES) {
    it(`${member}.${seam} reaches the collaborator production wires`, () => {
      const fixture = seamFacade();
      assert.equal(probe({ ...fixture, bag: fixture.facade[member]() }), true);
    });
  }

  for (const member of ELECTED_BAGS) {
    it(`${member}.isElectedExecutor elects the active GM only`, () => {
      const { facade, setCurrentUser } = seamFacade();
      const bag = facade[member]();
      const answers = [ACTIVE_GM, ASSISTANT_GM, PLAYER].map((user) => {
        setCurrentUser(user);
        return bag.isElectedExecutor();
      });
      assert.deepEqual(answers, [true, false, false]);
    });
  }
});

/** The two delegators the singular criterion-6 table does not walk, with their OWN tables. */
const AWARD_AND_CREDIT = [
  [
    'awardComponents',
    COMPONENT_AWARD_MESSAGE_KEYS,
    (facade) =>
      facade.awardComponents({ actorId: 'actor-1', systemId: 'sys-1', awards: [], callSite: 'x' }),
  ],
  [
    'creditCurrency',
    CURRENCY_CREDIT_MESSAGE_KEYS,
    (facade) =>
      facade.creditCurrency({ actorId: 'actor-1', unitId: 'gp', amount: 1, callSite: 'x' }),
  ],
];

describe('each actor-targeted delegator refuses in its OWN words, GM -> actor -> readiness', () => {
  for (const [name, keys, call] of AWARD_AND_CREDIT) {
    it(`${name} answers gmOnly, noActor and notReady from its own table, never throwing`, async () => {
      const actor = makeGrantTargetActor('actor-1');
      const ask = async (options) =>
        (await call(standUpFacade({ ready: false, ...options }).facade)).message;
      assert.equal(await ask({ user: PLAYER, actors: [actor] }), keys[COMPANION_OUTCOMES.gmOnly]);
      assert.equal(await ask({ actors: [] }), keys[COMPANION_OUTCOMES.noActor]);
      assert.equal(await ask({ actors: [actor] }), keys[COMPANION_OUTCOMES.notReady]);
    });
  }

  it('sites the two pooled delegators apart, with the award member between them', () => {
    const order = Object.keys(companionFacade);
    const read = order.indexOf('readPooledHoldings');
    assert.ok(read >= 0 && read < order.indexOf('awardComponents'));
    assert.ok(order.indexOf('awardComponents') < order.indexOf('consumePooledHoldings'));
  });

  it('publishes no grant symbol on the api, gathering or macro surface of a real boot', () => {
    const golden = JSON.parse(
      readFileSync(resolve(import.meta.dirname, 'fixtures/fabricateBootContract.golden.json'), 'utf8')
    );
    for (const set of ['apiKeys', 'macroApiKeys', 'gatheringKeys']) {
      assert.ok(golden[set].length > 0, `${set} is populated`);
      assert.equal(golden[set].includes('grantRecipeKnowledge'), false, `${set} names no grant`);
    }
  });
});
