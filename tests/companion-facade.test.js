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
} from '../src/systems/companionContract.js';
import { buildInteractiveRollOptions } from '../src/ui/svelte/apps/crafting/rollPrompt.js';

import {
  assertContractResult,
  assertLocalizationKey,
  assertMessageDataCovers,
} from './helpers/companionContractOutcomes.js';
import {
  CurrencyCraftingActorFake,
  makeCurrencyConfigStoreStub,
  makeWorldCurrencyConfig,
} from './helpers/currency-spend-fixtures.js';
import {
  FabricateFacadeUnderTest,
  HARNESS_SOURCE,
  MAIN_SOURCE,
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
 * A `globalThis.Roll` the check-roll members can actually roll with.
 *
 * The two Standalone Check Roll members reach the REAL runners through their seam bag, so the
 * facade half of their gate table is only assertable with a dice engine present — and the
 * prompt-spy count that distinguishes "refused" from "rolled and then refused" is only
 * meaningful when the runner really would have opened the dialog.
 */
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

/**
 * The Standalone Check Roll seam bag the harness facade injects, with its call records.
 *
 * `isElectedExecutor` and `hasDiceEngine` are what the eight-cell gate table turns on, and the
 * two prompt seams are what make "this client did not open a dialog" assertable at all: both
 * production prompts AUTO-CONFIRM where there is no `DialogV2`, so a headless run cannot tell
 * a refusal from a confirmation without them.
 */
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
  {
    // The third ACTOR-TARGETED member. `resolveBulkCheckDecision` is deliberately absent: it
    // takes no `actorId`, is GM-gated inline, and can never answer `noActor` — its own gate
    // outcomes are asserted separately below.
    name: 'rollActorCheck',
    keys: CHECK_ROLL_MESSAGE_KEYS,
    call: (facade, actorId) =>
      facade.rollActorCheck({ actorId, callSite: 'gmAction', formula: '1d20', dc: 15 }),
    extraKeys: ['passed', 'total', 'diceGroups', 'resolvedFormula'],
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
          (await member.call(standUpFacade({ ready: false, ...options }).facade, 'actor-1'))
            .outcome;

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
// AC-4 / AC-13 — the gate table over (isGM, callSite, isElectedExecutor)
// ---------------------------------------------------------------------------

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

    // A GM with an unresolvable actor AND an invalid call site answers `noActor`. This is the
    // cell that pins the recorded ordering cost: a stale `actorId` is reported before any
    // call-site check, on every client, rather than two different ways depending on which
    // screen the GM is looking at. Combining only ONE failure at a time leaves it unasserted.
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
  it('cannot be handed an actor that overrides the one the ownership gate resolved', async () => {
    // The mutation this exists for is `{ actor: gate.actor, …, ...request }`. It passes every
    // MODULE-level criterion, because the leaf reads named keys and ignores the rest — but a
    // caller-supplied `actor` wins the spread, and the roll is then taken for an actor the
    // gate never resolved and the caller may not own. The gate would have passed on a
    // DIFFERENT actor entirely.
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
      // decoration. Defaulted false, the dialog is off the path entirely and the caller's own
      // prompt could not have been called whatever the delegator did.
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
    assert.equal(COMPANION_MEMBERS.length, 12, 'the declared set is twelve members');
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
const GRANT =
  'async grantRecipeKnowledge({ actorId = null, recipeId = null, grantedBy = null } = {}) {';
const AFFORD = 'async checkAffordability({ actorId = null, unitId = null, amount = null } = {}) {';
const ROLL = 'async rollActorCheck({';
const BULK = 'async resolveBulkCheckDecision({ callSite = null, formulas = null } = {}) {';
const AWARD =
  'async awardComponents({ actorId = null, systemId = null, awards = null, callSite = null } = {}) {';
const CREDIT =
  'async creditCurrency({ actorId = null, unitId = null, amount = null, callSite = null } = {}) {';

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
    // `rollActorCheck` joins this loop and `resolveBulkCheckDecision` does NOT: the two gate
    // DIFFERENTLY, deliberately, and a uniform shape asserted over both is unsatisfiable
    // together with the criterion that pins the bulk member's missing actor gate.
    for (const signature of [GRANT, AFFORD, ROLL, AWARD, CREDIT]) {
      for (const [label, body] of bothTexts(signature)) {
        // The trailing `{` the first two members carry is deliberately NOT pinned here.
        // `rollActorCheck` passes a module-level frozen key pair instead of an inline object
        // literal, because that literal IS the duplicated run between `src/main.js` and this
        // harness — the one measured at 139 tokens for the grant, over SonarJS's minimum. The
        // claim this assertion makes is delegation to the shared preamble with the caller's
        // own `actorId`; each member's own refusal STRINGS are pinned per member below.
        assert.ok(
          body.includes('const gate = this._requireGmActor(actorId,'),
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
    // `rollActorCheck`'s pair is HOISTED to module scope on both sides, so the claim is
    // pinned where it is stated rather than inside the delegator body.
    for (const [label, source] of [
      ['production', MAIN_SOURCE],
      ['the harness mirror', HARNESS_SOURCE],
    ]) {
      assert.ok(
        source.includes('gmOnlyKey: CHECK_ROLL_MESSAGE_KEYS[COMPANION_OUTCOMES.gmOnly]') &&
          source.includes('noActorKey: CHECK_ROLL_MESSAGE_KEYS[COMPANION_OUTCOMES.noActor]'),
        `${label}: a refused check roll must not report itself in the grant's words`
      );
    }
  });

  it('AC-5 — rollActorCheck reuses the preamble and passes the RESOLVED actor through', () => {
    for (const [label, body] of bothTexts(ROLL)) {
      assert.ok(body.length > 150, `non-vacuity: ${label} sliced to ${body.length} characters`);
      assert.ok(
        body.includes('this._requireGmActor(actorId, ROLL_ACTOR_CHECK_GATE_KEYS)'),
        `${label} stopped delegating its gate to the shared preamble, with its OWN hoisted keys`
      );
      assert.ok(
        body.includes('actor: gate.actor'),
        `${label} must pass the RESOLVED actor into the leaf: a second resolver would be the ` +
          'THIRD copy the preamble’s own comment warns the author of'
      );
      assert.ok(
        body.includes('this._companionCheckSeams()'),
        `${label} obtains its seams from the one hoisted bag, never a restated literal`
      );
      // The refusal is built by THIS member's own builder, and the gate outcome wins over
      // readiness. Both halves are one substitution away from a cross-member vocabulary leak
      // — `bulkCheckDecisionResult(...)` here answers a non-GM in the BULK member's words and
      // in its answer SHAPE — and the behavioural cases that would catch it all run against
      // the mirror, so production's copy is pinned where it is written.
      assert.ok(
        body.includes('return checkRollResult(gate.outcome ?? COMPANION_OUTCOMES.notReady);'),
        `${label} must answer its OWN refusal shape, with the gate outcome ahead of readiness`
      );
    }
  });

  it('AC-5 — resolveBulkCheckDecision gates GM INLINE, with no actor gate at all', () => {
    for (const [label, body] of bothTexts(BULK)) {
      assert.ok(body.length > 100, `non-vacuity: ${label} sliced to ${body.length} characters`);
      assert.ok(
        body.includes('user?.isGM !== true ? COMPANION_OUTCOMES.gmOnly : null'),
        `${label} lost the inline GM gate`
      );
      assert.ok(
        body.includes('if (gmOnly || this.ready !== true) {'),
        `${label} lost the readiness half, which keeps the GM refusal ahead of readiness`
      );
      // `_requireGmActor(undefined, …)` ALWAYS answers `noActor`, because
      // `_resolveCraftingActor(null)` returns null — so reusing the preamble here would make
      // a member that reads no actor answer an actor refusal on every single call.
      assert.equal(
        codeOnly(body).includes('_requireGmActor'),
        false,
        `${label} must not reach the actor-targeted preamble`
      );
      assert.equal(
        codeOnly(body).includes('actorId'),
        false,
        `${label} must not read an actorId it does not declare`
      );
      assert.ok(body.includes('this._companionCheckSeams()'), `${label} lost the hoisted seams`);
      assert.ok(
        body.includes('return bulkCheckDecisionResult(gmOnly ?? COMPANION_OUTCOMES.notReady);'),
        `${label} must answer its OWN refusal shape, with the GM refusal ahead of readiness`
      );
    }
  });

  /**
   * The eight seams the ONE bag binds, each to the collaborator production actually ships.
   *
   * `[key, the exact binding, what the wrong binding does in production]`.
   */
  const SEAM_BINDINGS = [
    [
      'isElectedExecutor',
      'isElectedExecutor: () => game.users?.activeGM?.id === game.user?.id',
      'every connected GM client executes a broadcast call, rolling N different totals into ' +
        'N companion instances — the exact harm the single-executor rule exists to prevent',
    ],
    [
      'hasDiceEngine',
      "hasDiceEngine: () => typeof globalThis.Roll === 'function'",
      'engineUnavailable becomes unreachable, and a client with no dice engine dispatches ' +
        'to a runner that cannot roll',
    ],
    [
      'localize',
      "resolved !== '' && resolved !== key ? resolved : fallback",
      'a chat flavour reading `FABRICATE.Check.Roll.DefaultLabel check (DC 15)`, because ' +
        'the bridge answers the KEY for a missing string exactly as Foundry does',
    ],
    ['prompt', 'prompt: promptCheckRoll', 'the BULK dialog opens for a single roll'],
    ['promptBulk', 'promptBulk: promptBulkCheckRoll', 'the single-roll dialog opens for a batch'],
    [
      'runPassFail',
      'runPassFail: runFormulaPassFail',
      'a graded check dispatches the PROGRESSIVE runner: the dc is ignored and the member ' +
        'answers `rolled` rather than checkPassed/checkFailed, at every DC, forever',
    ],
    [
      'runProgressive',
      'runProgressive: runFormulaProgressive',
      'an ungraded roll is graded against an undefined dc',
    ],
    [
      'buildRollOptions',
      'buildRollOptions: buildInteractiveRollOptions',
      'the roll options are composed by something other than the one builder that derives ' +
        'the speaker from the resolved actor',
    ],
  ];

  it('AC-5 — the ONE seam bag binds every seam to the collaborator production ships', () => {
    // PRODUCTION ONLY, and that asymmetry is the whole reason this assertion exists rather
    // than an oversight. `bothTexts` has nothing to compare here: the harness mirror
    // SUBSTITUTES the bag for an injected one, by design, because every seam in it is a
    // Foundry collaborator the harness has none of. `src/main.js` is never imported by any
    // unit test either — this suite reads it as TEXT — so with the bag substituted in the
    // mirror and unread in production, all eight bindings were held correct by nothing.
    //
    // What the existing pins prove is that a bag is CALLED (`this._companionCheckSeams()`
    // appears in both delegator bodies). They say nothing about what is IN it, and ESLint
    // catches a misspelled identifier but never a swap between two real ones. Each row below
    // is a single substitution that otherwise survives the entire suite.
    //
    // D12 hoisted the bag to one private to keep the mirror's duplicated run down, and that
    // removed even the second copy a reviewer could have diffed it against — which is why
    // the two new members needed this pin where the shipped two did not.
    const bag = mainMethodSource('_companionCheckSeams() {');
    const keys = [...bag.matchAll(/^ {6}(\w+):/gm)].map(([, key]) => key);
    assert.deepEqual(
      keys,
      SEAM_BINDINGS.map(([key]) => key),
      'the bag binds exactly these eight seams — a dropped one leaves the leaf reading undefined'
    );
    // Non-vacuity, in the shape ROLL_ACTOR_CHECK_GATE_KEYS' own pins already use: a slice that
    // silently shrank to nothing would satisfy `deepEqual([], [])` above only if the expected
    // list were empty too, but the substring checks below would pass over a short string.
    assert.ok(bag.length > 400, `non-vacuity: the seam bag sliced to ${bag.length} characters`);
    // Whitespace-normalized, and each binding matched with its TRAILING SEPARATOR left off,
    // so the claims survive a reformat of `src/main.js`. That is a live possibility rather
    // than a hypothetical: the file is currently OUTSIDE the `format:check` globs, and
    // Prettier's `trailingComma: 'es5'` would add a comma to the last property here and wrap
    // the ~165-character `rollActorCheck` signature the moment it is brought inside them.
    // The lookahead is what keeps the match a whole binding — `runFormulaPassFailToo` is a
    // different function, and a bare `includes` could not tell them apart.
    const squashed = bag.replaceAll(/\s+/g, ' ');
    for (const [key, binding, harm] of SEAM_BINDINGS) {
      const whole = new RegExp(`${binding.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w$])`);
      assert.match(
        squashed,
        whole,
        `${key} is no longer bound as \`${binding}\`, so in production ${harm}`
      );
    }
  });

  it('AC-29 — each new delegator keeps its OWN refusal strings, where hoisting put them', () => {
    // `bothTexts` returns a METHOD-BODY slice, and D12 hoisted these pairs out of that slice —
    // so the body-level assertion above proves delegation to the shared preamble and can say
    // nothing about WHICH strings each member delegates with. This is a SOURCE-FIDELITY pin
    // over a parameter that is currently inert, and saying so is the point: both delegators
    // read `gate.outcome` and discard `gate.message`, and each builder derives `message` from
    // its own table, so giving a hoisted pair another member's strings changes no answer today.
    // It is pinned anyway because the pair is part of the preamble's published shape, because
    // one shipped member (`resetActorKnowledge`) does answer with `gate.message` and a sixth
    // could, and because a mirror carrying another member's strings is drift in the one
    // artefact every facade-level case for these two members runs against — there is no
    // Foundry smoke by design. The claim this comment used to make, that the swap makes a
    // refused award report itself in the grant's words, was simply false.
    const PAIRS = [
      ['awardComponents', 'COMPONENT_AWARD_MESSAGE_KEYS', COMPONENT_AWARD_MESSAGE_KEYS],
      ['creditCurrency', 'CURRENCY_CREDIT_MESSAGE_KEYS', CURRENCY_CREDIT_MESSAGE_KEYS],
    ];
    for (const [label, source] of [
      ['production', MAIN_SOURCE],
      ['the harness mirror', HARNESS_SOURCE],
    ]) {
      for (const [member, table, keys] of PAIRS) {
        assert.ok(
          source.includes(`gmOnlyKey: ${table}[COMPANION_OUTCOMES.gmOnly]`) &&
            source.includes(`noActorKey: ${table}[COMPANION_OUTCOMES.noActor]`),
          `${label}: ${member}'s hoisted pair must read ${table}, never another member's`
        );
        // And the table it names really is that member's own, so the pin cannot be satisfied
        // by a constant that merely SPELLS the right name.
        assert.ok(
          keys[COMPANION_OUTCOMES.gmOnly].startsWith('FABRICATE.'),
          `${member}'s table resolves a real key`
        );
      }
    }
  });

  it('AC-29 — `_worldCurrencySeams()` binds the same seams in both texts', () => {
    // The bag D12 mitigation 1 hoisted, and the one `checkAffordability` was RETARGETED onto,
    // so a mirror that omits a binding takes the whole currency surface with it. The mutation
    // this closes is dropping `actorInventoryCoinSpender` here: every facade-level currency
    // case that does not use that strategy stays green, and the hoist introduced to shorten
    // the mirror has silently broken it.
    const BINDINGS = [
      ['getCurrencyConfig', 'getCurrencyConfig: () => this.currencyConfigStore?.get?.() ?? null'],
      ['actorPropertyCoinSpender', 'actorPropertyCoinSpender: this.actorPropertyCoinSpender'],
      ['actorInventoryCoinSpender', 'actorInventoryCoinSpender: this.actorInventoryCoinSpender'],
    ];
    for (const [label, source] of [
      ['production', MAIN_SOURCE],
      ['the harness mirror', HARNESS_SOURCE],
    ]) {
      const bag = mainMethodSource('_worldCurrencySeams() {', source);
      assert.ok(bag.length > 150, `non-vacuity: ${label} sliced to ${bag.length} characters`);
      assert.deepEqual(
        [...bag.matchAll(/^ {6}(\w+):/gm)].map(([, key]) => key),
        BINDINGS.map(([key]) => key),
        `${label} binds exactly these three seams`
      );
      const squashed = bag.replaceAll(/\s+/g, ' ');
      for (const [key, binding] of BINDINGS) {
        assert.ok(squashed.includes(binding), `${label}: ${key} is no longer bound as authored`);
      }
      // `isElectedExecutor` is absent on BOTH sides by design: the check gates on no call site,
      // and a seam present in the bag but read by only one of its two consumers is how a gate
      // ends up assumed rather than declared. `creditCurrency` adds its own.
      assert.equal(
        squashed.includes('isElectedExecutor'),
        false,
        `${label}: the shared bag carries no election`
      );
    }
  });

  it('binds every seam `awardComponents` injects, to the collaborator production ships', () => {
    // PRODUCTION-SIDE ONLY, and that asymmetry is the reason this pin is needed rather than an
    // excuse for not having one: the mirror INJECTS this bag — production reaches `fromUuid`,
    // the live crafting-system manager and the real engine, none of which exist under
    // `node --test` — so every facade-level case for this member runs against a bag the suite
    // supplied, and nothing else looks at the one production builds.
    //
    // Two of its mutations are silent to the entire suite, and one of them makes a `stable`
    // member THROW. Renaming `resolveSystem` leaves the leaf calling `seams.resolveSystem(...)`
    // on `undefined`, in `awardComponents`' own body BEFORE the per-entry `try` — so the first
    // real call raises a `TypeError` out of a member that publishes "never throws". Dropping
    // `findComponentItems` is silent the other way: every entry answers `awardFailed`, and the
    // member's published claim to resolve its stack targets through the ONE shipped resolver is
    // disconnected in production while every stacking case here keeps passing against the
    // injected bag.
    const AWARD_SEAM_BINDINGS = [
      [
        'resolveSystem',
        'resolveSystem: (systemId) => this.craftingSystemManager?.getSystem?.(systemId) ?? null',
        'the leaf calls undefined and a `stable` member throws on its first real call',
      ],
      [
        'resolveComponent',
        'resolveComponent: (system, componentId) => findById(getDefinitionIndex(system?.components), componentId) ?? null',
        'every entry answers componentNotFound, so no award ever lands',
      ],
      [
        'findComponentItems',
        'findComponentItems: (actor, component, system) => this.craftingEngine?.findComponentItems?.(actor, component, system) ?? []',
        'the award stops resolving its stack targets through the published resolver',
      ],
      [
        'resolveSourceItem',
        'resolveSourceItem: (uuid) => fromUuid(uuid)',
        'every award falls back to a synthesised payload, or fails inside its own try',
      ],
      [
        'isElectedExecutor',
        'isElectedExecutor: () => game.users?.activeGM?.id === game.user?.id',
        'a broadcast award is unelectable and the duplicate-write gate is gone',
      ],
    ];

    const bag = mainMethodSource('_componentAwardSeams() {');
    assert.ok(bag.length > 250, `non-vacuity: the seam bag sliced to ${bag.length} characters`);
    assert.deepEqual(
      [...bag.matchAll(/^ {6}(\w+):/gm)].map(([, key]) => key),
      AWARD_SEAM_BINDINGS.map(([key]) => key),
      'the bag binds exactly these five seams — the sixth the leaf declares, `createOrStack`, ' +
        'is deliberately absent so the create primitive keeps ONE spelling'
    );
    const squashed = bag.replaceAll(/\s+/g, ' ');
    for (const [key, binding, harm] of AWARD_SEAM_BINDINGS) {
      assert.ok(
        squashed.includes(binding),
        `${key} is no longer bound as authored, so in production ${harm}`
      );
    }
  });

  it('AC-5 — neither new delegator throws readiness, spreads a request, or reads game.actors', () => {
    for (const signature of [ROLL, BULK]) {
      for (const [label, body] of bothTexts(signature)) {
        const code = codeOnly(body);
        assert.equal(
          code.includes('_requireReady()'),
          false,
          `${label} ${signature} must REFUSE notReady, never throw it`
        );
        // The structurally identical hole the shipped contract already had to close: a
        // `{ ...request, actor }` forward passes every MODULE-level criterion while letting a
        // companion inject an `actor` that overrides the resolved one, a `prompt` that bypasses
        // the dialog, or a `speaker` impersonating another actor in chat.
        //
        // ANY spread, not a named one. `...request` is a SPELLING — `...arguments[0]`,
        // `...options` and `...{ ...request }` all reopen the same hole — and a spelling is
        // what a mutation walks straight past. The delegators need no spread at all, so their
        // ABSENCE is a property.
        assert.equal(
          code.includes('...'),
          false,
          `${label} ${signature} spreads something into the leaf; it must name every key`
        );
        assert.equal(
          code.includes('game.actors'),
          false,
          `${label} ${signature} reads the actor collection directly, dropping the ownership predicate`
        );
      }
    }
  });

  it('publishes COMPANION beside HOOKS, and publishes no grant symbol anywhere else', () => {
    const source = readFileSync(resolve(import.meta.dirname, '../src/main.js'), 'utf8');
    assert.ok(
      source.includes('HOOKS: FABRICATE_HOOKS,') &&
        source.includes('COMPANION: COMPANION_CONTRACT'),
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
    const exportBlockStart = source.indexOf('export const __test');
    // GUARDED, because both assertions below are ABSENCE assertions. `indexOf` answers `-1`
    // for a marker that has been renamed, `slice(-1)` is the file's last character, and both
    // would then pass over a one-character string, silently, forever.
    assert.ok(
      exportBlockStart >= 0,
      'src/main.js still declares a test-only export block for this slice to start at'
    );
    const exportBlocks = source.slice(exportBlockStart);
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
