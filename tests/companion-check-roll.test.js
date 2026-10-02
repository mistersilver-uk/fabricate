/** The Standalone Check Roll (issue 1293) — `src/systems/companionCheckRoll.js`. */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ADDITIONAL_DICE_REFUSALS,
  additionalDiceRefusalKey,
} from '../src/systems/additionalDiceReach.js';
import { runFormulaPassFail, runFormulaProgressive } from '../src/systems/checkRoll.js';
import { CHECK_EVALUATION_CAPABILITIES } from '../src/systems/companionCheckEvaluation.js';
import { resolveBulkCheckDecision, rollActorCheck } from '../src/systems/companionCheckRoll.js';
import {
  BULK_CHECK_DECISION_MESSAGE_KEYS,
  CHECK_ROLL_MESSAGE_KEYS,
  COMPANION_OUTCOMES,
} from '../src/systems/companionContract.js';
import { CountRollRefusal } from '../src/systems/countRoll.js';
import {
  buildInteractiveRollOptions,
  promptCheckRoll,
} from '../src/ui/svelte/apps/crafting/rollPrompt.js';

import {
  assertLocalizationKey,
  assertMessageDataCovers,
  assertMessageIsFromTable,
} from './helpers/companionContractOutcomes.js';
import { installCountDice } from './helpers/countEngineDice.js';
import { countEvaluation } from './helpers/countFixtures.js';
import { stubPromptSurface } from './helpers/rollPromptDialogStub.js';
import { defineStructureContract } from './helpers/structureContract.js';
import { installTermBearingRoll } from './helpers/termBearingRoll.js';

// Stubs

const ACTOR = {
  id: 'actor-1',
  name: 'Idrin',
  getRollData: () => ({ prof: 2 }),
};

/**
 * Install a `globalThis.Roll` that COUNTS ITS CONSTRUCTIONS.
 *
 * @param {number} [options.total] the total every roll answers
 * @param {boolean} [options.throwOnConstruct] make the dice engine throw, as a broken formula
 * reaching `new Roll(...)` would
 */
function installRoll({ total = 18, throwOnConstruct = false } = {}) {
  const constructions = [];
  class FakeRoll {
    constructor(formula, data) {
      constructions.push(String(formula));
      if (throwOnConstruct) throw new Error('the dice engine refused this formula');
      this.formula = formula;
      this.data = data;
      this.total = total;
      // One plain d20 group, so a `diceGroups.length > 0` assertion is about real structure.
      this.dice = [{ number: 1, faces: 20, total: 5, results: [{ result: 5, active: true }] }];
    }
    async evaluate() {
      return this;
    }
    async toMessage(messageData, options) {
      chatPosts.push({ messageData, options });
      return { id: 'msg' };
    }
    // `this`-DEPENDENT, mirroring Foundry's own static, which does `new this(formula)`
    // internally — a detached reference returns false for EVERY formula.
    static validate(formula) {
      if (this?.prototype !== FakeRoll.prototype) return false;
      const text = String(formula);
      return (text.match(/\(/g) || []).length === (text.match(/\)/g) || []).length;
    }
  }
  FakeRoll.replaceFormulaData = (formula, data) =>
    String(formula).replaceAll(/@([\w.]+)/g, (_match, key) => {
      const value = String(key)
        .split('.')
        .reduce((node, part) => (node == null ? undefined : node[part]), data);
      return value === undefined ? 'NaN' : String(value);
    });
  globalThis.Roll = FakeRoll;
  return { constructions };
}

/**
 * Install the shared term-bearing double (issue 2007) for the advantage tests: `constructions`
 * are the strings `new Roll` received and `evaluated` each evaluated roll's `_formula`, which the
 * keep assertions read because the keep transform will act on the constructed Roll's terms.
 */
function installTermRoll({ total = 18 } = {}) {
  const constructions = [];
  const evaluated = [];
  installTermBearingRoll({
    total,
    extend: (TermRoll) =>
      class RecordingTermRoll extends TermRoll {
        constructor(formula, data, options) {
          constructions.push(String(formula));
          super(formula, data, options);
        }

        async evaluate(options) {
          await super.evaluate(options);
          evaluated.push(this._formula);
          return this;
        }

        async toMessage(messageData, options) {
          chatPosts.push({ messageData, options });
          return { id: 'msg' };
        }
      },
  });
  return { constructions, evaluated };
}

let chatPosts = [];

function installChat() {
  chatPosts = [];
  globalThis.ChatMessage = {
    create: (data) => {
      chatPosts.push(data);
      return Promise.resolve({ id: 'msg' });
    },
    getSpeaker: ({ actor } = {}) => ({ alias: actor?.name ?? 'Unknown', actor: actor?.id ?? null }),
  };
  globalThis.game = { settings: { get: () => 'roll' }, i18n: { localize: (key) => key } };
  return chatPosts;
}

/** The seam bag, with per-seam call records. */
function makeSeams({ real = false, ...overrides } = {}) {
  const calls = {
    prompt: [],
    promptBulk: [],
    runPassFail: [],
    runProgressive: [],
    elected: 0,
  };
  const cannedPassFail = {
    success: true,
    outcome: 'pass',
    value: 20,
    data: {
      dc: 15,
      formula: '1d20',
      resolvedFormula: '1d20',
      total: 20,
      comparison: 'meet',
      diceGroups: [],
    },
    message: null,
  };
  const cannedProgressive = {
    success: true,
    outcome: null,
    value: 7,
    data: { formula: '1d20', resolvedFormula: '1d20', total: 7, value: 7, diceGroups: [] },
  };
  const seams = {
    isElectedExecutor: () => {
      calls.elected += 1;
      return true;
    },
    hasDiceEngine: () => true,
    localize: (_key, fallback) => fallback,
    prompt: async (args) => {
      calls.prompt.push(args);
      return { confirmed: true };
    },
    promptBulk: async (args) => {
      calls.promptBulk.push(args);
      return { confirmed: true, bonus: null, rollMode: undefined, advantage: 'normal' };
    },
    runPassFail: real
      ? runFormulaPassFail
      : async (bag) => {
          calls.runPassFail.push(bag);
          return cannedPassFail;
        },
    runProgressive: real
      ? runFormulaProgressive
      : async (bag) => {
          calls.runProgressive.push(bag);
          return cannedProgressive;
        },
    buildRollOptions: buildInteractiveRollOptions,
    ...overrides,
  };
  if (real) {
    // Wrap the REAL runners so the "was it dispatched at all?" half stays assertable.
    const passFail = seams.runPassFail;
    const progressive = seams.runProgressive;
    seams.runPassFail = async (bag) => {
      calls.runPassFail.push(bag);
      return await passFail(bag);
    };
    seams.runProgressive = async (bag) => {
      calls.runProgressive.push(bag);
      return await progressive(bag);
    };
  }
  return { seams, calls };
}

/** A complete `rollActorCheck` request, with only the differences named. */
function request(overrides = {}) {
  return { actor: ACTOR, callSite: 'gmAction', formula: '1d20+@prof', ...overrides };
}

/**
 * Assert an answer is a well-formed `rollActorCheck` answer — key set, order, types, and a
 * message that is a value in THIS member's own table with every placeholder supplied.
 */
function assertCheckAnswerShape(result) {
  assert.ok(Object.isFrozen(result), 'a contract answer crosses the boundary frozen');
  const executed = ['checkPassed', 'checkFailed', 'rolled'].includes(result.outcome);
  assert.deepEqual(
    Object.keys(result).filter((key) => key !== 'messageData'),
    [
      'success',
      'passed',
      'total',
      'diceGroups',
      'resolvedFormula',
      ...(executed
        ? [
            'product',
            'direction',
            'comparison',
            'target',
            'margin',
            'successes',
            'cancelled',
            'boughtDice',
          ]
        : []),
      'outcome',
      'message',
    ],
    "the answer's key set (and its order) is the published contract"
  );
  assertLocalizationKey(result.message, `rollActorCheck's ${result.outcome}`);
  // An additional-dice refusal (issue 2008) speaks in its reason's words from `additionalDice.js`.
  const refused = result.outcome === COMPANION_OUTCOMES.additionalDiceRefused;
  const table = refused ? ADDITIONAL_DICE_REFUSED_KEYS : CHECK_ROLL_MESSAGE_KEYS;
  assertMessageIsFromTable(result, table, "rollActorCheck's answer");
  assertMessageDataCovers(result, `rollActorCheck's ${result.outcome} answer`);
}

/** Every key an additional-dice refusal may answer with: each reason, labelled or not, by source. */
const ADDITIONAL_DICE_REFUSED_KEYS = Object.freeze(
  ADDITIONAL_DICE_REFUSALS.flatMap((reason) =>
    ['path', 'macro'].flatMap((source) =>
      ['', 'Momentum'].map((label) => additionalDiceRefusalKey(reason, { label, source }))
    )
  )
);

function assertBulkAnswerShape(result) {
  assert.ok(Object.isFrozen(result), 'a contract answer crosses the boundary frozen');
  assert.deepEqual(
    Object.keys(result).filter((key) => key !== 'messageData'),
    ['success', 'decision', 'allowAdvantage', 'covered', 'outcome', 'message'],
    "the answer's key set (and its order) is the published contract"
  );
  assertLocalizationKey(result.message, `resolveBulkCheckDecision's ${result.outcome}`);
  assertMessageIsFromTable(
    result,
    BULK_CHECK_DECISION_MESSAGE_KEYS,
    "resolveBulkCheckDecision's answer"
  );
  assertMessageDataCovers(result, `resolveBulkCheckDecision's ${result.outcome} answer`);
}

// AC-2, AC-9(3) — the dismissal short-circuits BEFORE the roll

describe('AC-2 — a dismissed prompt is a refusal, and it refuses before anything rolls', () => {
  it('constructs NO Roll on a dismissal and exactly one on a confirmation', async () => {
    installChat();
    const dismissed = installRoll();
    const { seams } = makeSeams({ real: true, prompt: async () => ({ confirmed: false }) });

    const refused = await rollActorCheck(request({ dc: 15, interactive: true }), seams);

    assertCheckAnswerShape(refused);
    assert.equal(refused.outcome, COMPANION_OUTCOMES.cancelled);
    assert.equal(refused.success, false);
    assert.deepEqual(dismissed.constructions, [], 'a dismissal rolls nothing at all');
    assert.deepEqual(chatPosts, [], 'and posts nothing');

    const confirmed = installRoll();
    const { seams: confirmingSeams } = makeSeams({ real: true });
    const answered = await rollActorCheck(request({ dc: 15, interactive: true }), confirmingSeams);

    assert.equal(answered.outcome, COMPANION_OUTCOMES.checkPassed);
    assert.equal(confirmed.constructions.length, 1, 'a confirmed roll constructs exactly one Roll');
  });

  it('mutates no injected collaborator on a dismissal', async () => {
    installChat();
    installRoll();
    const { seams, calls } = makeSeams({ real: true, prompt: async () => ({ confirmed: false }) });

    await rollActorCheck(request({ dc: 15, interactive: true }), seams);

    assert.equal(calls.prompt.length, 0, 'the injected prompt is the one the member called');
    assert.equal(calls.promptBulk.length, 0);
    assert.equal(calls.runPassFail.length, 1, 'the runner ran and reported the cancel');
    assert.equal(calls.runProgressive.length, 0);
  });
});

// AC-3 — the formula is @-resolved, and no modifier context is passed

describe('AC-3 — the formula is @-resolved and the modifier context is explicitly null', () => {
  it('answers a resolvedFormula with the placeholders substituted', async () => {
    installChat();
    installRoll();
    const { seams } = makeSeams({ real: true });

    const result = await rollActorCheck(request({ dc: 15, formula: '1d20+@prof' }), seams);

    // FIRST, because every assertion below is vacuous against a `null`.
    assert.equal(
      typeof result.resolvedFormula,
      'string',
      'without a working Roll.replaceFormulaData this field is null and nothing below asserts'
    );
    assert.notEqual(result.resolvedFormula, '1d20+@prof', 'the display is not the authored text');
    assert.doesNotMatch(result.resolvedFormula, /@/, 'no placeholder survives into the display');
  });

  it('passes craftingModifier: null EXPLICITLY, so no modifier term can ever append', async () => {
    installChat();
    installRoll();
    const { seams, calls } = makeSeams();

    await rollActorCheck(request({ dc: 15 }), seams);

    const [bag] = calls.runPassFail;
    assert.ok('craftingModifier' in bag, 'the key is present, not merely absent-and-defaulted');
    assert.equal(bag.craftingModifier, null);
    assert.deepEqual(bag.triggers, [], 'and no forced-outcome trigger, so total is the raw roll');
    assert.equal(
      'modifierChoice' in bag.rollOptions,
      false,
      'and no deferred playerPicks descriptor, so the fieldset never renders'
    );
  });
});

// AC-6 — a missing dice engine, on BOTH arms

describe('AC-6 — a missing dice engine refuses on both arms, and dispatches to neither runner', () => {
  for (const [arm, extra] of [
    ['graded', { dc: 15 }],
    ['ungraded', {}],
  ]) {
    it(`${arm}: answers engineUnavailable with total null, never 0`, async () => {
      installChat();
      installRoll();
      const { seams, calls } = makeSeams({ hasDiceEngine: () => false });

      const result = await rollActorCheck(request(extra), seams);

      assertCheckAnswerShape(result);
      assert.equal(result.outcome, COMPANION_OUTCOMES.engineUnavailable);
      assert.equal(result.success, false);
      // `0` is what the ungraded runner's own free pass would have answered. `null` is the
      // contract's "no answer", and the difference is the whole criterion.
      assert.equal(result.total, null);
      assert.deepEqual(result.diceGroups, []);
      assert.equal(result.passed, null);
      assert.equal(calls.runPassFail.length, 0, 'the pass/fail runner was never reached');
      assert.equal(calls.runProgressive.length, 0, 'nor the progressive one');
    });
  }
});

// AC-7 — the pre-resolved decision

describe('AC-7 — a pre-resolved decision drives the roll without opening a dialog', () => {
  it('opens a dialog for a confirmed interactive roll', async () => {
    installChat();
    installRoll();
    const { seams, calls } = makeSeams({ real: true });

    const result = await rollActorCheck(request({ dc: 15, interactive: true }), seams);

    assert.equal(result.outcome, COMPANION_OUTCOMES.checkPassed);
    assert.equal(calls.prompt.length, 1, 'the injected prompt was asked');
    // The resolved actor names the prompt's subtitle; a request carries no recipe (issue 2134).
    assert.equal(calls.prompt[0].actorName, 'Idrin');
    assert.ok(!calls.prompt[0].name, 'no subject beside the actor');
  });

  it('opens NO dialog when a decision is supplied, and the decision still reaches the roll', async () => {
    installChat();
    const rolls = installTermRoll();
    const { seams, calls } = makeSeams({ real: true });

    const result = await rollActorCheck(
      request({
        dc: 15,
        interactive: true,
        rollDecision: { bonus: '+3', rollMode: 'blindroll', advantage: 'advantage' },
      }),
      seams
    );

    assert.equal(result.outcome, COMPANION_OUTCOMES.checkPassed);
    assert.equal(calls.prompt.length, 0, 'one answer drives N rolls, so no dialog opens');
    const [rolled] = rolls.evaluated;
    assert.match(rolled, /2d20kh1/, 'the advantage disposition rewrote the d20 pool');
    assert.match(rolls.constructions[0], /\(\+3\)/, 'and the situational bonus appended');
    const [post] = chatPosts;
    assert.equal(post?.options?.rollMode, 'blindroll', 'and the roll mode reached the chat post');
  });

  it('treats a decision carrying confirmed:TRUE as a decision, and still rolls', async () => {
    // The other half of AC-7's `confirmed` claim, and the COMMON one: the design's whole argument
    // is about a caller that forwarded a whole prompt answer, and a prompt answer is usually a
    // confirmation.
    installChat();
    const rolls = installTermRoll();
    const { seams, calls } = makeSeams({ real: true });

    const result = await rollActorCheck(
      request({
        dc: 15,
        interactive: true,
        rollDecision: {
          bonus: '+3',
          rollMode: 'blindroll',
          advantage: 'advantage',
          confirmed: true,
        },
      }),
      seams
    );

    assert.equal(result.outcome, COMPANION_OUTCOMES.checkPassed);
    assert.equal(calls.prompt.length, 0, 'a supplied decision still opens no dialog');
    const [rolled] = rolls.evaluated;
    assert.match(rolled, /2d20kh1/, 'and the decision still drove the roll it was handed to');
    assert.match(rolls.constructions[0], /\(\+3\)/);
  });

  it('rolls the default rule’s keep transform on a forwarded Advantage (issue 2007, R2)', async () => {
    installChat();
    const rolls = installTermRoll();
    const { seams, calls } = makeSeams({ real: true });

    const result = await rollActorCheck(
      request({
        formula: '1d12 + 3',
        dc: 15,
        interactive: true,
        rollDecision: { bonus: null, rollMode: undefined, advantage: 'advantage' },
      }),
      seams
    );

    assert.equal(result.outcome, COMPANION_OUTCOMES.checkPassed);
    assert.equal(calls.prompt.length, 0);
    const [rolled] = rolls.evaluated;
    assert.equal(rolled, '2d12kh1 + 3', 'a standalone roll takes the default rule (R2)');
  });

  it('treats a hand-built decision carrying confirmed:false as a cancel', async () => {
    // Constructed BY HAND rather than obtained from the prompt, because this is the assertion that
    // proves the `confirmed`-strip is load-bearing.
    installChat();
    const rolls = installRoll();
    const { seams } = makeSeams({ real: true });

    const result = await rollActorCheck(
      request({
        dc: 15,
        interactive: true,
        rollDecision: { bonus: null, rollMode: undefined, advantage: 'normal', confirmed: false },
      }),
      seams
    );

    assert.equal(result.outcome, COMPANION_OUTCOMES.cancelled);
    assert.deepEqual(rolls.constructions, [], 'and nothing rolled');
  });
});

// AC-8, AC-17, AC-20 — the bulk decision

describe('AC-8 — allowAdvantage is computed over the USABLE subset, all-or-nothing', () => {
  for (const [formulas, expected, why] of [
    // R1 class (a) (issue 2007): a plain 2d10 first group now keeps, so it offers.
    [['1d20+@prof', '2d10+3'], true, 'a plain 2d10 first group keeps under the default rule'],
    [['1d20+@prof', '(1d20 + 2) * 2'], false, 'a nested d20 cannot honour Advantage (R1 (b2))'],
    [['1d20+@prof', ''], true, 'the empty formula is not usable and is excluded before the test'],
    [['2d10', '2d10'], true, 'every usable formula has a plain first group (R1 class (a))'],
  ]) {
    it(`${JSON.stringify(formulas)} -> allowAdvantage ${expected}: ${why}`, async () => {
      installChat();
      installRoll();
      const { seams, calls } = makeSeams();

      const result = await resolveBulkCheckDecision({ callSite: 'gmAction', formulas }, seams);

      assertBulkAnswerShape(result);
      assert.equal(result.outcome, COMPANION_OUTCOMES.decided, 'a confirmed prompt is `decided`');
      assert.equal(result.success, true);
      assert.equal(result.allowAdvantage, expected);
      assert.equal(calls.promptBulk[0].allowAdvantage, expected, 'and the dialog was told so');
    });
  }
});

describe('AC-17 — covered names the caller OWN indices, and an empty batch decides nothing', () => {
  it('answers covered [0, 2] for a batch whose second and fourth entries cannot roll', async () => {
    installChat();
    installRoll();
    const { seams } = makeSeams();

    const result = await resolveBulkCheckDecision(
      { callSite: 'gmAction', formulas: ['1d20', '', '2d10', ''] },
      seams
    );

    assert.deepEqual(result.covered, [0, 2]);
    assert.deepEqual(
      result.decision,
      { bonus: null, rollMode: undefined, advantage: 'normal' },
      'the decision is the prompt shape MINUS confirmed'
    );
    assert.equal('confirmed' in result.decision, false, 'carrying it would read as a cancellation');
  });

  it('answers nothingToDecide, as a SUCCESS, without opening a dialog', async () => {
    installChat();
    installRoll();
    const { seams, calls } = makeSeams();

    const result = await resolveBulkCheckDecision(
      { callSite: 'gmAction', formulas: ['', ''] },
      seams
    );

    assertBulkAnswerShape(result);
    assert.equal(result.outcome, COMPANION_OUTCOMES.nothingToDecide);
    assert.equal(result.success, true, 'there being nothing to prompt about is a correct answer');
    assert.equal(result.decision, null);
    assert.deepEqual(result.covered, []);
    assert.equal(result.allowAdvantage, false);
    assert.equal(calls.promptBulk.length, 0, 'a dialog with no consequence is not opened');
  });

  it('answers cancelled with a null decision when the GM dismisses the bulk prompt', async () => {
    installChat();
    installRoll();
    const { seams } = makeSeams({ promptBulk: async () => ({ confirmed: false }) });

    const result = await resolveBulkCheckDecision(
      { callSite: 'gmAction', formulas: ['1d20', '1d20'] },
      seams
    );

    assertBulkAnswerShape(result);
    assert.equal(result.outcome, COMPANION_OUTCOMES.cancelled);
    assert.equal(result.success, false);
    assert.equal(result.decision, null);
    assert.deepEqual(result.covered, [], 'a refusal carries no coverage claim');
    assert.equal(result.allowAdvantage, null);
  });
});

describe('AC-20 — the bulk prompt is told the WHOLE batch, not the usable subset', () => {
  it('passes count: 4 for a four-entry batch of which two can roll', async () => {
    installChat();
    installRoll();
    const { seams, calls } = makeSeams();

    const result = await resolveBulkCheckDecision(
      { callSite: 'gmAction', formulas: ['1d20', '', '2d10', ''] },
      seams
    );

    // Asserted on the SPY's argument, because the member supplies no `subjects`: an
    // unspecified count makes the dialog fall back to `rows.length === 0` and render
    // "One roll setting for 0 items" in front of a GM.
    assert.equal(calls.promptBulk.length, 1);
    assert.equal(calls.promptBulk[0].count, 4, 'the batch is what the player queued');
    assert.equal('subjects' in calls.promptBulk[0], false, 'and no thumbnail strip is claimed');
    assert.deepEqual(result.covered, [0, 2]);
    // The two VALUES, and not merely their presence.
    assert.deepEqual(
      result.messageData,
      { count: 2, total: 4 },
      'count is the COVERED subset and total is the whole batch, in that assignment'
    );
  });
});

// AC-14 (bulk half) — a HOSTILE request to the member that reads no actor

describe('AC-14 (bulk half) — resolveBulkCheckDecision never throws, whatever formulas is', () => {
  // AC-14 is `rollActorCheck`-only, so the `Array.isArray` guard on `request.formulas` — the single
  // line that keeps this member's "a `stable` member NEVER THROWS" promise — is asserted by
  // nothing.
  for (const formulas of ['1d20', { 0: '1d20' }, 42, true, undefined, null]) {
    it(`refuses rather than throwing for formulas ${JSON.stringify(formulas) ?? 'undefined'}`, async () => {
      installChat();
      installRoll();
      const { seams, calls } = makeSeams();

      const result = await resolveBulkCheckDecision({ callSite: 'gmAction', formulas }, seams);

      assertBulkAnswerShape(result);
      assert.equal(result.outcome, COMPANION_OUTCOMES.nothingToDecide);
      assert.equal(result.success, true, 'there being nothing to decide is a correct answer');
      assert.deepEqual(result.covered, [], 'and it claims coverage of nothing');
      assert.equal(result.allowAdvantage, false);
      assert.equal(calls.promptBulk.length, 0, 'and no dialog is opened about a non-batch');
    });
  }

  it('reads only callSite and formulas, however much else the request carries', async () => {
    installChat();
    installRoll();
    const { seams, calls } = makeSeams();

    const result = await resolveBulkCheckDecision(
      {
        callSite: 'gmAction',
        // R1 class (b2) (issue 2007): the nested d20 is what refuses, since a plain 2d10 keeps.
        formulas: ['1d20', '(1d20 + 2) * 2'],
        // The keys a caller might expect to matter, and the ones that would matter if the
        // request were spread anywhere: this member takes no actor and no `interactive`.
        actorId: 'ghost',
        interactive: false,
        count: 99,
        allowAdvantage: true,
        subjects: [{ img: 'nope.webp' }],
        promptBulk: () => ({ confirmed: false }),
      },
      seams
    );

    assert.equal(result.outcome, COMPANION_OUTCOMES.decided, "the caller's promptBulk is unread");
    assert.equal(calls.promptBulk.length, 1);
    assert.deepEqual(
      Object.keys(calls.promptBulk[0]),
      ['allowAdvantage', 'advantageOffer', 'count'],
      'the dialog is told exactly three things, each DERIVED from the formulas'
    );
    assert.equal(calls.promptBulk[0].count, 2, 'the batch size, never the caller-supplied one');
    assert.equal(calls.promptBulk[0].allowAdvantage, false, 'derived: a nested d20 cannot honour it');
    assert.deepEqual(
      calls.promptBulk[0].advantageOffer,
      { advantage: false, disadvantage: false, kind: null, detail: null },
      'and the intersected offer is empty'
    );
  });
});

// AC-9 — the module rolls nothing, proved three ways

const MODULE = 'src/systems/companionCheckRoll.js';

describe('AC-9 — the module rolls nothing and reaches nothing it was not given', () => {
  // An import list is a PROPERTY; a variable-name grep is only a spelling. Admitting checkRoll.js
  // or rollPrompt.js here would let the module bypass the very seams every dismissal assertion
  // depends on. The exact set holds static, re-exported and `import()` specifiers alike.
  defineStructureContract(
    'imports only its contract, target resolution, evaluation boundary, the active-check ' +
      'predicate and formula predicate',
    MODULE,
    {
      importSpecifiers: [
        [
          '',
          [
            '../utils/craftingCheckExpression.js',
            // The one advantage offer derivation (issue 2007), called with no dice engine.
            './checkAdvantage.js',
            // The refusal keys an additional-dice refusal answers with (issue 2008); it rolls nothing.
            './additionalDiceReach.js',
            './checkTarget.js',
            './companionCheckEvaluation.js',
            './companionContract.js',
            // The default advantage rule a standalone roll rolls under (issue 2007, ruling R2).
            './normalize/checkAdvantage.js',
            './salvageCheckUsability.js',
          ],
        ],
      ],
    }
  );

  // The rule "exists once" is canonical, and four members gate on it (issue 1301, D13). A local
  // re-derivation would be invisible to every behavioural case here: both copies would agree on
  // the fixtures at hand, and drift only later.
  defineStructureContract('takes the CALL-SITE rule from the contract', MODULE, {
    importsName: [
      ['./companionContract.js', 'gateCompanionCallSite'],
      // Buying is the contract's call-site rule too (issue 2008): a broadcast spends nothing.
      ['./companionContract.js', 'additionalDiceCallSiteRefusal'],
    ],
    namesNo: ['COMPANION_CALL_SITES'],
    spellsNo: ['gmAction', 'broadcast'],
  });
  for (const member of ['rollActorCheck', 'resolveBulkCheckDecision']) {
    defineStructureContract(
      `${member} gates on that imported rule before anything else`,
      { file: MODULE, fn: member },
      { contains: ['const refusal = gateCompanionCallSite(request, seams);'] }
    );
  }

  // No `typeof` carve-out: with `hasDiceEngine` as a seam there is no legitimate site for one.
  defineStructureContract('contains no globalThis.Roll reference at all, in code', MODULE, {
    namesNo: ['globalThis', 'Roll'],
    names: ['hasDiceEngine'],
  });

  it('constructs exactly one Roll per rollActorCheck and none per resolveBulkCheckDecision', async () => {
    installChat();
    const rolled = installRoll();
    const { seams } = makeSeams({ real: true });

    await rollActorCheck(request({ dc: 15 }), seams);
    assert.equal(rolled.constructions.length, 1);

    const settled = installRoll();
    await resolveBulkCheckDecision({ callSite: 'gmAction', formulas: ['1d20'] }, makeSeams().seams);
    assert.deepEqual(settled.constructions, [], 'the bulk member answers before anything starts');
  });
});

// ---------------------------------------------------------------------------
// AC-10 — messages are keys, at runtime as well as at rest
// ---------------------------------------------------------------------------

describe('AC-10 — every REAL answer carries a key from its own member table', () => {
  it('covers every outcome rollActorCheck can emit', async () => {
    const emitted = new Set();
    const record = (result) => {
      assertCheckAnswerShape(result);
      emitted.add(result.outcome);
      return result;
    };

    installChat();
    installRoll();
    record(await rollActorCheck(request({ callSite: 'nonsense' }), makeSeams().seams));
    record(
      await rollActorCheck(
        request({ callSite: 'broadcast' }),
        makeSeams({ isElectedExecutor: () => false }).seams
      )
    );
    record(await rollActorCheck(request({ rollDecision: { bonus: '+1' } }), makeSeams().seams));
    record(await rollActorCheck(request({ evaluation: null }), makeSeams().seams));
    // A summed check offers no additional dice (issue 2008).
    record(await rollActorCheck(request({ additionalDice: 1 }), makeSeams().seams));
    record(
      await rollActorCheck(
        request({ evaluation: { product: 'count', pool: { base: '@missing.pool' } } }),
        makeSeams({ real: true }).seams
      )
    );
    record(
      await rollActorCheck(
        request({
          evaluation: { target: { source: 'attribute', expression: '@missing.path' } },
        }),
        makeSeams().seams
      )
    );
    record(await rollActorCheck(request({ formula: '@craftingmod' }), makeSeams().seams));
    record(
      await rollActorCheck(request({ dc: 15 }), makeSeams({ hasDiceEngine: () => false }).seams)
    );
    record(
      await rollActorCheck(
        request({ dc: 15, interactive: true }),
        makeSeams({ real: true, prompt: async () => ({ confirmed: false }) }).seams
      )
    );
    record(await rollActorCheck(request({ dc: 15 }), makeSeams({ real: true }).seams));
    installRoll({ total: 3 });
    record(await rollActorCheck(request({ dc: 15 }), makeSeams({ real: true }).seams));
    record(await rollActorCheck(request({}), makeSeams({ real: true }).seams));
    installRoll({ throwOnConstruct: true });
    record(await rollActorCheck(request({ dc: 15 }), makeSeams({ real: true }).seams));

    assert.deepEqual(
      [...emitted].sort(),
      [
        'additionalDiceRefused',
        'cancelled',
        'checkFailed',
        'checkPassed',
        'engineUnavailable',
        'evaluationInvalid',
        'invalidCallSite',
        'invalidRollDecision',
        'noFormula',
        'notElected',
        'poolUnresolved',
        'rollFailed',
        'rolled',
        'targetUnresolved',
      ],
      'every outcome the member can emit from its own body was exercised'
    );
  });

  it('covers every outcome resolveBulkCheckDecision can emit', async () => {
    const emitted = new Set();
    const record = (result) => {
      assertBulkAnswerShape(result);
      emitted.add(result.outcome);
    };

    installChat();
    installRoll();
    record(await resolveBulkCheckDecision({ callSite: null, formulas: [] }, makeSeams().seams));
    record(
      await resolveBulkCheckDecision(
        { callSite: 'broadcast', formulas: ['1d20'] },
        makeSeams({ isElectedExecutor: () => false }).seams
      )
    );
    record(
      await resolveBulkCheckDecision({ callSite: 'gmAction', formulas: [''] }, makeSeams().seams)
    );
    record(
      await resolveBulkCheckDecision(
        { callSite: 'gmAction', formulas: ['1d20'] },
        makeSeams({ promptBulk: async () => ({ confirmed: false }) }).seams
      )
    );
    record(
      await resolveBulkCheckDecision(
        { callSite: 'gmAction', formulas: ['1d20'] },
        makeSeams().seams
      )
    );

    assert.deepEqual(
      [...emitted].sort(),
      ['cancelled', 'decided', 'invalidCallSite', 'notElected', 'nothingToDecide'],
      'every outcome the member can emit from its own body was exercised'
    );
  });
});

// ---------------------------------------------------------------------------
// AC-11, AC-12 — interactive defaults, and the comparison boundary
// ---------------------------------------------------------------------------

describe('AC-11 — interactive defaults to false', () => {
  it('opens no prompt and posts no chat message, and still grades', async () => {
    installChat();
    installRoll();
    const { seams, calls } = makeSeams({ real: true });

    const result = await rollActorCheck(request({ dc: 15 }), seams);

    assert.equal(calls.prompt.length, 0, 'no dialog on an unattended tick');
    assert.deepEqual(chatPosts, [], 'and no chat noise');
    assert.equal(result.outcome, COMPANION_OUTCOMES.checkPassed);
    assert.equal(result.passed, true);
  });
});

describe('AC-12 — compare at the boundary, where total EQUALS dc', () => {
  for (const [compare, expected] of [
    ['meet', COMPANION_OUTCOMES.checkPassed],
    ['exceed', COMPANION_OUTCOMES.checkFailed],
    [undefined, COMPANION_OUTCOMES.checkPassed],
  ]) {
    it(`compare ${String(compare)} answers ${expected} on a total of exactly the DC`, async () => {
      installChat();
      installRoll({ total: 15 });
      const { seams } = makeSeams({ real: true });

      const result = await rollActorCheck(request({ dc: 15, compare }), seams);

      assert.equal(result.outcome, expected);
      assert.equal(result.passed, expected === COMPANION_OUTCOMES.checkPassed);
      assert.equal(result.total, 15);
    });
  }
});

describe('evaluation dispatch and executed evidence', () => {
  it('refuses malformed modes before formula, engine, prompt or runners', async () => {
    const cases = [[{ product: 'count', pool: { die: '6' } }, 'evaluationInvalid']];
    for (const [evaluation, outcome] of cases) {
      const { seams, calls } = makeSeams({ hasDiceEngine: () => { throw new Error('engine read'); } });
      const result = await rollActorCheck(
        request({ formula: '', interactive: true, evaluation }),
        seams
      );
      assert.equal(result.outcome, outcome);
      assert.equal(result.success, false);
      assert.deepEqual(calls.prompt, []);
      assert.deepEqual(calls.runPassFail, []);
      assert.deepEqual(calls.runProgressive, []);
      assert.equal('product' in result, false);
    }
  });

  it('keeps call-site, election and roll-decision refusals ahead of evaluation', async () => {
    const cases = [
      [{ callSite: null }, {}, 'invalidCallSite'],
      [{ callSite: 'broadcast' }, { isElectedExecutor: () => false }, 'notElected'],
      [{ rollDecision: { bonus: '+1' } }, {}, 'invalidRollDecision'],
      [{ interactive: true, rollDecision: { confirmed: false } }, {}, 'cancelled'],
    ];
    for (const evaluation of [{ pool: { die: 0 } }, { direction: 'under' }]) {
      for (const [overrides, seamOverrides, outcome] of cases) {
        const { seams, calls } = makeSeams(seamOverrides);
        const result = await rollActorCheck(request({ evaluation, ...overrides }), seams);
        assert.equal(result.outcome, outcome, `${outcome} for ${JSON.stringify(evaluation)}`);
        assert.deepEqual(calls.prompt, []);
        assert.deepEqual(calls.runPassFail, []);
        assert.deepEqual(calls.runProgressive, []);
      }
    }
  });

  it('prompts once and meets the DC for an interactive advertised evaluation', async () => {
    installChat();
    installRoll({ total: 15 });
    const { seams, calls } = makeSeams({ real: true });
    const result = await rollActorCheck(
      request({
        dc: 15,
        compare: 'meet',
        interactive: true,
        evaluation: { product: 'sum', direction: 'over', target: { source: 'fixed' } },
      }),
      seams
    );
    assert.equal(result.outcome, 'checkPassed');
    assert.equal(calls.prompt.length, 1);
    assert.deepEqual([result.comparison, result.target, result.margin], ['meet', 15, 0]);
  });

  it('projects every executed field from the runner data by name', async () => {
    const diceGroups = [{ faces: 6, results: [] }];
    const data = {
      total: 9,
      diceGroups,
      resolvedFormula: '3d6cs<=4',
      product: 'count',
      direction: 'under',
      comparison: 'exceed',
      target: 4,
      margin: 2,
      successes: 3,
      cancelled: 1,
      value: 99,
    };
    const { seams } = makeSeams({
      runPassFail: async () => ({ success: true, outcome: 'pass', value: 99, data }),
    });
    const result = await rollActorCheck(request({ dc: 15 }), seams);
    assert.equal(result.outcome, 'checkPassed');
    for (const key of [
      'total',
      'resolvedFormula',
      'product',
      'direction',
      'comparison',
      'target',
      'margin',
      'successes',
      'cancelled',
    ]) {
      assert.equal(result[key], data[key], key);
    }
    assert.deepEqual(result.diceGroups, diceGroups);
  });

  it('never routes a misconfigured SUM result through the count pool-refusal mapping', async () => {
    // The `counted &&` guard on `discriminateCheckOutcome`'s misconfigured branch: without it, a
    // SUM result that happens to carry `misconfigured: true` (a shape only a count refusal
    // produces today) would be misread as a count pool refusal instead of falling through to the
    // ordinary `value === null` rollFailed step.
    const { seams } = makeSeams({
      runPassFail: async () => ({
        misconfigured: true,
        value: null,
        data: { refusedInput: 'base' },
      }),
    });
    const result = await rollActorCheck(
      request({ dc: 15, evaluation: { product: 'sum', direction: 'over' } }),
      seams
    );
    assert.notEqual(result.outcome, 'poolUnresolved');
    assert.notEqual(result.outcome, 'evaluationInvalid');
    assert.equal(result.outcome, 'rollFailed');
  });

  it('projects graded and ungraded evidence from the real shared runners', async () => {
    installChat();
    installRoll({ total: 0 });
    const { seams } = makeSeams({ real: true });
    const graded = await rollActorCheck(
      request({ dc: 0, compare: 'exceed', evaluation: { product: 'sum', direction: 'over' } }),
      seams
    );
    assert.equal(graded.outcome, 'checkFailed');
    assert.deepEqual(
      [graded.total, graded.product, graded.direction, graded.comparison, graded.target, graded.margin, graded.successes, graded.cancelled],
      [0, 'sum', 'over', 'exceed', 0, 0, null, null]
    );
    const ungraded = await rollActorCheck(request({ evaluation: {} }), seams);
    assert.equal(ungraded.outcome, 'rolled');
    assert.deepEqual(
      [ungraded.passed, ungraded.comparison, ungraded.target, ungraded.margin, ungraded.successes, ungraded.cancelled],
      [null, null, null, null, null, null]
    );
    assert.equal(ungraded.product, 'sum');
    assert.equal(ungraded.direction, 'over');
  });

  it('settles a throwing collaborator as rollFailed without executed metadata', async () => {
    const { seams } = makeSeams({
      buildRollOptions: () => {
        throw new Error('broken options');
      },
    });
    const result = await rollActorCheck(request({ dc: 15, label: 'Forge check' }), seams);
    assert.equal(result.outcome, 'rollFailed');
    assert.equal(result.success, false);
    assert.equal(result.messageData.label, 'Forge check');
    assert.equal('product' in result, false);

    const engine = makeSeams({
      hasDiceEngine: () => {
        throw new Error('engine failed');
      },
    });
    const refused = await rollActorCheck(request({ dc: 15 }), engine.seams);
    assert.equal(refused.outcome, 'rollFailed');
    assert.equal('product' in refused, false);
  });
});

// ---------------------------------------------------------------------------
// Attribute dispatch and roll-under (issue 2003, QE15, F1, D10)
// ---------------------------------------------------------------------------

const SKILLED_ACTOR = {
  id: 'actor-skilled',
  name: 'Idrin',
  getRollData: () => ({ skills: { craft: { value: 55 } } }),
};

describe('attribute dispatch and roll-under (QE15, F1, D10)', () => {
  it('iterates every published SUM capability row', async () => {
    const sumModes = CHECK_EVALUATION_CAPABILITIES.modes.filter((m) => m.product === 'sum');
    for (const mode of sumModes) {
      for (const source of mode.targetSources) {
        installChat();
        installRoll({ total: 10 });
        const { seams } = makeSeams({ real: true });
        const attribute = source === 'attribute';
        const evaluation = {
          product: mode.product,
          direction: mode.direction,
          target: attribute
            ? { source: 'attribute', expression: '@skills.craft.value' }
            : { source: 'fixed' },
        };
        const result = await rollActorCheck(
          request({
            actor: SKILLED_ACTOR,
            dc: attribute ? undefined : 15,
            evaluation,
          }),
          seams
        );
        assert.ok(
          ['checkPassed', 'checkFailed', 'rolled'].includes(result.outcome),
          JSON.stringify({ mode, source })
        );
      }
    }
  });

  it('iterates every published COUNT capability row (issue 2004), graded against pool.required regardless of target source', async () => {
    // Both faces sit above the threshold (8): `over` qualifies both (net 2, passes a required of
    // 1), `under` qualifies neither (net 0, fails) — a discriminating pair, so the two directions
    // cannot share an outcome by accident.
    const EXPECTED = { over: { outcome: 'checkPassed', total: 2 }, under: { outcome: 'checkFailed', total: 0 } };
    const countModes = CHECK_EVALUATION_CAPABILITIES.modes.filter((m) => m.product === 'count');
    for (const mode of countModes) {
      for (const source of mode.targetSources) {
        const dice = installCountDice({ faces: [9, 9] });
        try {
          const { seams } = makeSeams({ real: true });
          const evaluation = countEvaluation({ direction: mode.direction, required: 1 });
          evaluation.target = { source };
          const result = await rollActorCheck(
            request({ actor: SKILLED_ACTOR, evaluation }),
            seams
          );
          const expected = EXPECTED[mode.direction];
          assert.equal(result.outcome, expected.outcome, JSON.stringify({ mode, source }));
          assert.equal(result.total, expected.total, JSON.stringify({ mode, source }));
        } finally {
          dice.restore();
        }
      }
    }
  });

  it('rolls an interactive count with additional dice enabled rather than refusing it (issue 2008)', async () => {
    const additional = { additionalDice: { enabled: true, source: 'path', path: '', max: 2 } };
    const cases = [
      ['additional dice, prompted', {}, 1],
      ['additional dice, forwarded', { rollDecision: { bonus: null, advantage: 'normal' } }, 0],
    ];
    for (const direction of ['over', 'under']) {
      for (const [name, extra, prompts] of cases) {
        installChat();
        const dice = installCountDice({ faces: [9, 9] });
        try {
          const { seams, calls } = makeSeams({ real: true });
          const result = await rollActorCheck(
            request({
              interactive: true,
              evaluation: countEvaluation({ direction, ...additional }),
              ...extra,
            }),
            seams
          );
          assert.notEqual(result.outcome, 'evaluationUnsupported', `${direction}: ${name}`);
          assert.equal(result.success, true, `${direction}: ${name} rolled`);
          assert.equal(result.boughtDice, 0, `${direction}: ${name} bought nothing`);
          assert.equal(calls.prompt.length, prompts, `${direction}: ${name} prompts`);
          assert.equal(dice.posts.length, 1, `${direction}: ${name} posts its count Roll`);
          if (prompts) {
            assert.equal(calls.prompt[0].additionalDiceOffer.unavailable, 'sourceMissing');
          }
        } finally {
          dice.restore();
        }
      }
    }
  });

  it('honours a forwarded Advantage or Disadvantage on an interactive count row: the pool grows or shrinks by the default die (issue 2007)', async () => {
    // Base pool 2 at threshold 8: Advantage rolls 3 dice, Disadvantage rolls 1, both counted `over`.
    const cases = [
      ['advantage', [9, 9, 9], 3],
      ['disadvantage', [9], 1],
    ];
    for (const [advantage, faces, expectedTotal] of cases) {
      installChat();
      const dice = installCountDice({ faces });
      try {
        const { seams, calls } = makeSeams({ real: true });
        const result = await rollActorCheck(
          request({
            interactive: true,
            evaluation: countEvaluation({ direction: 'over' }),
            rollDecision: { bonus: null, advantage },
          }),
          seams
        );
        assert.equal(calls.prompt.length, 0, `${advantage} forwards without a prompt`);
        assert.equal(result.outcome, 'checkPassed', advantage);
        assert.equal(result.total, expectedTotal, `${advantage} moves the pool by the default die`);
      } finally {
        dice.restore();
      }
    }
  });

  it('rolls a non-interactive count with additional dice enabled on its authored pool alone', async () => {
    installChat();
    const dice = installCountDice({ faces: [9, 9] });
    try {
      const { seams } = makeSeams({ real: true });
      const evaluation = countEvaluation({ additionalDice: { enabled: true, source: 'path', path: 'system.momentum', max: 2 } });
      const result = await rollActorCheck(request({ evaluation }), seams);
      assert.equal(result.outcome, 'checkPassed');
      assert.equal(result.total, 2, 'two dice, none bought');
    } finally {
      dice.restore();
    }
  });

  it('forwards a decision to every count row: no prompt, the bonus adds a die, graded against pool.required', async () => {
    // Faces 9, 9, 3 at threshold 8 with a third die from the bonus: over counts 2, under counts 1.
    const EXPECTED = { over: { outcome: 'checkPassed', total: 2 }, under: { outcome: 'checkFailed', total: 1 } };
    const countModes = CHECK_EVALUATION_CAPABILITIES.modes.filter((m) => m.product === 'count');
    for (const mode of countModes) {
      for (const source of mode.targetSources) {
        const key = `${mode.direction}/${source}`;
        const dice = installCountDice({ faces: [9, 9, 3] });
        try {
          const { seams, calls } = makeSeams({ real: true });
          const evaluation = { ...countEvaluation({ direction: mode.direction, required: 2 }), target: { source } };
          const result = await rollActorCheck(
            request({
              actor: SKILLED_ACTOR,
              dc: 99,
              interactive: true,
              rollDecision: { bonus: '1', rollMode: 'gmroll', advantage: 'normal' },
              evaluation,
            }),
            seams
          );
          assert.equal(calls.prompt.length, 0, `${key}: a forwarded decision opens no prompt`);
          assert.equal(result.outcome, EXPECTED[mode.direction].outcome, key);
          assert.equal(result.total, EXPECTED[mode.direction].total, key);
          assert.deepEqual(result.messageData, { label: 'Fabricate', total: result.total, required: 2 }, key);
          assert.equal(dice.posts.length, 1, `${key}: one count Roll posted`);
          assert.ok(dice.posts[0].rolls[0] instanceof dice.CountRoll, key);
          assert.equal(dice.posts[0].rolls[0].dice[0].results.length, 3, `${key}: the bonus die rolled`);
        } finally {
          dice.restore();
        }
      }
    }
  });

  it('refuses a fixed sum/under request with no finite dc, before any roll', async () => {
    installChat();
    const rolled = installRoll();
    const { seams } = makeSeams({ real: true });

    const result = await rollActorCheck(request({ evaluation: { direction: 'under' } }), seams);

    assert.equal(result.outcome, 'evaluationInvalid');
    assert.deepEqual(rolled.constructions, []);
  });

  it('grades an attribute target by its resolved value alone, ignoring a conflicting dc', async () => {
    installChat();
    installRoll({ total: 60 });
    const { seams } = makeSeams({ real: true });

    const result = await rollActorCheck(
      request({
        actor: SKILLED_ACTOR,
        dc: 99,
        evaluation: { target: { source: 'attribute', expression: '@skills.craft.value' } },
      }),
      seams
    );

    assert.equal(result.outcome, 'checkPassed');
    assert.equal(result.message, CHECK_ROLL_MESSAGE_KEYS.checkPassedTarget);
    assert.deepEqual(result.messageData, { label: 'Fabricate', total: 60, target: 55 });
    assert.equal('dc' in result.messageData, false);
  });

  it('answers targetUnresolved for an attribute whose path does not resolve, before any roll', async () => {
    installChat();
    const rolled = installRoll();
    const { seams } = makeSeams({ real: true });

    const result = await rollActorCheck(
      request({
        actor: SKILLED_ACTOR,
        evaluation: { target: { source: 'attribute', expression: '@skills.missing.value' } },
      }),
      seams
    );

    assert.equal(result.outcome, 'targetUnresolved');
    assert.deepEqual(rolled.constructions, []);
  });

  it('refuses evaluationInvalid for a multiply baseAdjustment at or below zero', async () => {
    for (const baseAdjustment of [0, -2]) {
      installChat();
      const rolled = installRoll();
      const { seams } = makeSeams({ real: true });

      const result = await rollActorCheck(
        request({
          actor: SKILLED_ACTOR,
          evaluation: {
            target: {
              source: 'attribute',
              expression: '@skills.craft.value',
              adjustmentKind: 'multiply',
              baseAdjustment,
            },
          },
        }),
        seams
      );

      assert.equal(result.outcome, 'evaluationInvalid', `baseAdjustment ${baseAdjustment}`);
      assert.deepEqual(rolled.constructions, []);
    }
  });

  it('grades a sum/under request with an attribute target, keyed by target', async () => {
    installChat();
    installRoll({ total: 40 });
    const { seams } = makeSeams({ real: true });

    const passed = await rollActorCheck(
      request({
        actor: SKILLED_ACTOR,
        evaluation: { direction: 'under', target: { source: 'attribute', expression: '@skills.craft.value' } },
      }),
      seams
    );

    assert.equal(passed.outcome, 'checkPassed');
    assert.equal(passed.message, CHECK_ROLL_MESSAGE_KEYS.checkPassedTarget);
    assert.deepEqual(passed.messageData, { label: 'Fabricate', total: 40, target: 55 });

    installRoll({ total: 90 });
    const failed = await rollActorCheck(
      request({
        actor: SKILLED_ACTOR,
        evaluation: { direction: 'under', target: { source: 'attribute', expression: '@skills.craft.value' } },
      }),
      makeSeams({ real: true }).seams
    );

    assert.equal(failed.outcome, 'checkFailed');
    assert.equal(failed.message, CHECK_ROLL_MESSAGE_KEYS.checkFailedTarget);
    assert.deepEqual(failed.messageData, { label: 'Fabricate', total: 90, target: 55 });
  });

  it('grades a fixed sum/under request against its own dc, keyed by target', async () => {
    installChat();
    installRoll({ total: 8 });
    const { seams } = makeSeams({ real: true });

    const passed = await rollActorCheck(
      request({ dc: 10, evaluation: { direction: 'under' } }),
      seams
    );

    assert.equal(passed.outcome, 'checkPassed');
    assert.equal(passed.message, CHECK_ROLL_MESSAGE_KEYS.checkPassedTarget);
    assert.deepEqual(passed.messageData, { label: 'Fabricate', total: 8, target: 10 });

    installRoll({ total: 90 });
    const failed = await rollActorCheck(
      request({ dc: 10, evaluation: { direction: 'under' } }),
      makeSeams({ real: true }).seams
    );

    assert.equal(failed.outcome, 'checkFailed');
    assert.equal(failed.message, CHECK_ROLL_MESSAGE_KEYS.checkFailedTarget);
  });

  it('keeps sum/over/fixed graded by dc, using the plain Passed/Failed key', async () => {
    installChat();
    installRoll({ total: 20 });
    const { seams } = makeSeams({ real: true });

    const result = await rollActorCheck(request({ dc: 15 }), seams);

    assert.equal(result.outcome, 'checkPassed');
    assert.equal(result.message, CHECK_ROLL_MESSAGE_KEYS.checkPassed);
    assert.deepEqual(result.messageData, { label: 'Fabricate', total: 20, dc: 15 });
  });
});

// ---------------------------------------------------------------------------
// Count check rows (issue 2004): pool grading, zero pool and pool refusals
// ---------------------------------------------------------------------------

describe('count check rows: no formula, ignores the caller dc and target', () => {
  it('passes with PassedCount, naming total and required, never dc or target', async () => {
    installChat();
    const dice = installCountDice({ faces: [9, 3] });
    try {
      const { seams } = makeSeams({ real: true });
      const result = await rollActorCheck(
        request({ dc: 99, evaluation: countEvaluation() }),
        seams
      );
      assert.equal(result.outcome, 'checkPassed');
      assert.equal(result.message, CHECK_ROLL_MESSAGE_KEYS.checkPassedCount);
      assert.deepEqual(result.messageData, { label: 'Fabricate', total: 1, required: 1 });
      assert.equal(result.total, 1);
      assert.equal(result.product, 'count');
      assert.equal(result.successes, 1);
      assert.equal(result.cancelled, 0);
    } finally {
      dice.restore();
    }
  });

  it('fails with FailedCount when the net is below the required count', async () => {
    installChat();
    const dice = installCountDice({ faces: [3, 3] });
    try {
      const { seams } = makeSeams({ real: true });
      const result = await rollActorCheck(request({ evaluation: countEvaluation() }), seams);
      assert.equal(result.outcome, 'checkFailed');
      assert.equal(result.message, CHECK_ROLL_MESSAGE_KEYS.checkFailedCount);
      assert.deepEqual(result.messageData, { label: 'Fabricate', total: 0, required: 1 });
    } finally {
      dice.restore();
    }
  });

  it('fails with FailedZeroPool (no total or required) once the pool floors to zero', async () => {
    installChat();
    const dice = installCountDice({ faces: [] });
    try {
      const { seams } = makeSeams({ real: true });
      const result = await rollActorCheck(
        request({ evaluation: countEvaluation({ base: '0' }) }),
        seams
      );
      assert.equal(result.outcome, 'checkFailed');
      assert.equal(result.message, CHECK_ROLL_MESSAGE_KEYS.checkFailedZeroPool);
      assert.deepEqual(result.messageData, { label: 'Fabricate' });
      assert.equal(result.total, null);
      assert.deepEqual(dice.constructed, [], 'a zero pool constructs no Roll');
    } finally {
      dice.restore();
    }
  });

  it('answers poolUnresolved for an unresolved base or threshold path, before any roll', async () => {
    installChat();
    const rolled = installRoll();
    const { seams } = makeSeams({ real: true });

    const base = await rollActorCheck(
      request({ evaluation: countEvaluation({ base: '@skills.missing.value' }) }),
      seams
    );
    assert.equal(base.outcome, 'poolUnresolved');
    assert.deepEqual(base.messageData, { label: 'Fabricate' });

    const threshold = await rollActorCheck(
      request({ evaluation: countEvaluation({ threshold: '@skills.missing.value' }) }),
      seams
    );
    assert.equal(threshold.outcome, 'poolUnresolved');
    assert.deepEqual(rolled.constructions, [], 'neither refusal ever constructs a Roll');
  });

  it('answers evaluationInvalid for a count refusal naming a different input, not poolUnresolved', async () => {
    installChat();
    const rolled = installRoll();
    const { seams } = makeSeams({ real: true });

    const evaluation = countEvaluation({
      explode: { enabled: true, faces: { kind: 'from', value: null }, once: false },
    });
    const result = await rollActorCheck(request({ evaluation }), seams);

    assert.equal(result.outcome, 'evaluationInvalid');
    assert.deepEqual(result.messageData, { label: 'Fabricate' });
    assert.deepEqual(rolled.constructions, [], 'an evaluationInvalid refusal never constructs a Roll');
  });

  it('needs no formula at all: a blank formula still rolls a count check', async () => {
    installChat();
    const dice = installCountDice({ faces: [9, 3] });
    try {
      const { seams } = makeSeams({ real: true });
      const result = await rollActorCheck(
        request({ formula: '', evaluation: countEvaluation() }),
        seams
      );
      assert.notEqual(result.outcome, 'noFormula');
      assert.equal(result.outcome, 'checkPassed');
    } finally {
      dice.restore();
    }
  });

  it('ignores the caller dc, always grading the runner against pool.required', async () => {
    installChat();
    const dice = installCountDice({ faces: [9, 3] });
    try {
      const { seams, calls } = makeSeams({ real: true });
      await rollActorCheck(request({ dc: 999, evaluation: countEvaluation({ required: 1 }) }), seams);
      const [bag] = calls.runPassFail;
      assert.equal(bag.dc, 1, 'the runner grades against pool.required, never the caller dc');
    } finally {
      dice.restore();
    }
  });
});

// ---------------------------------------------------------------------------
// AC-14 — the request key allowlist, at BOTH levels, against a HOSTILE request
// ---------------------------------------------------------------------------

const RUNNER_KEYS = [
  'formula',
  'dc',
  'thresholdMode',
  'triggers',
  'actor',
  'label',
  'rollOptions',
  'craftingModifier',
  'evaluation',
];

describe('AC-14 — nothing a caller supplies reaches the runner or the roll options', () => {
  it('pins both key sets, and a HOSTILE request cannot widen either', async () => {
    installChat();
    installRoll();
    const hostilePrompt = { calls: 0 };

    // `interactive: true` and the REAL runners on both halves, deliberately. With
    // `interactive` defaulted false and a spy runner, NOTHING in this case could have called
    // a prompt whatever the code did, so `hostilePrompt.calls === 0` was true by
    // construction and asserted nothing. Interactive + real runner puts the dialog on the
    // path: the SEAM prompt is called once, which is what makes "the caller's own was called
    // zero times" a statement about the code rather than about the fixture.
    const clean = makeSeams({ real: true });
    await rollActorCheck(request({ dc: 15, interactive: true }), clean.seams);
    const [cleanBag] = clean.calls.runPassFail;
    assert.equal(clean.calls.prompt.length, 1, 'reachability: the seam prompt IS on this path');

    const hostile = makeSeams({ real: true });
    await rollActorCheck(
      {
        ...request({ dc: 15, interactive: true }),
        // Every key the composed bag legitimately carries, plus the two that would let a
        // caller bypass the dialog or impersonate another actor in chat.
        prompt: () => {
          hostilePrompt.calls += 1;
          return { confirmed: true };
        },
        speaker: { alias: 'Somebody Else', actor: 'actor-99' },
        craftingModifier: { catalogue: [{ id: 'x', value: 999 }] },
        triggers: [{ outcome: 'success' }],
        modifierChoice: { modifiers: [], maxPicks: 1, defaultSelectedIds: [] },
        allowInteractive: true,
      },
      hostile.seams
    );
    const [hostileBag] = hostile.calls.runPassFail;

    assert.deepEqual(Object.keys(cleanBag), RUNNER_KEYS, 'the runner call carries exactly these');
    assert.deepEqual(
      Object.keys(hostileBag),
      Object.keys(cleanBag),
      'and a hostile request produces a byte-identical key set'
    );
    assert.deepEqual(
      Object.keys(hostileBag.rollOptions),
      Object.keys(cleanBag.rollOptions),
      'as does the NESTED bag — pinning only rollOptions would let a `...request` spread ' +
        'leak past this criterion at the outer level'
    );
    // `prompt` is a LEGITIMATE key of the composed bag, so a key-set assertion alone cannot
    // see `prompt: request.prompt ?? seams.prompt`. Identity can.
    assert.equal(hostileBag.rollOptions.prompt, hostile.seams.prompt, 'the SEAM, by identity');
    assert.equal(hostilePrompt.calls, 0, "and the caller's own prompt was never called");
    assert.equal(hostileBag.craftingModifier, null, 'no smuggled modifier catalogue');
    assert.deepEqual(hostileBag.triggers, [], 'no smuggled forced-outcome trigger');
    assert.deepEqual(
      hostileBag.rollOptions.speaker,
      { alias: 'Idrin', actor: 'actor-1' },
      'the speaker is derived from the RESOLVED actor, never taken from the request'
    );
  });
});

describe('AC-14 — the rollDecision the caller forwards is read as FOUR NAMED KEYS', () => {
  it('cannot widen the nested decision either, however much it carries', async () => {
    // The third level, and the one the hostile case above cannot reach: a `rollDecision` is
    // refused outright for a non-interactive roll, so the criterion's own hostile request —
    // which carries none — leaves this level entirely unpinned. Replacing the three named
    // reads with `{ ...rollDecision }` is a single substitution that survives every other
    // case in this file, and it reopens exactly the hole the outer key discipline closes:
    // the decision bag is threaded straight onto `rollOptions`, where the evaluator reads it.
    installChat();
    installRoll();
    const { seams, calls } = makeSeams();

    await rollActorCheck(
      request({
        dc: 15,
        interactive: true,
        rollDecision: {
          bonus: '+3',
          rollMode: 'blindroll',
          advantage: 'advantage',
          // The same two smuggles the outer level refuses, one level down.
          prompt: () => ({ confirmed: true }),
          speaker: { alias: 'Somebody Else', actor: 'actor-99' },
          confirmed: true,
          interactive: false,
        },
      }),
      seams
    );

    const [bag] = calls.runPassFail;
    assert.deepEqual(
      Object.keys(bag.rollOptions.rollDecision),
      ['bonus', 'rollMode', 'advantage', 'additionalDice'],
      'the decision is read as four NAMED keys, so nothing else the caller attached survives'
    );
    assert.deepEqual(bag.rollOptions.rollDecision, {
      bonus: '+3',
      rollMode: 'blindroll',
      advantage: 'advantage',
      additionalDice: undefined,
    });
    assert.equal(bag.rollOptions.prompt, seams.prompt, 'and the SEAM prompt still stands');
  });
});

// ---------------------------------------------------------------------------
// AC-15 — a decision supplied for a non-interactive roll is REFUSED
// ---------------------------------------------------------------------------

describe('AC-15 — invalidRollDecision', () => {
  it('refuses rather than silently discarding the caller answer', async () => {
    installChat();
    installRoll();
    const { seams, calls } = makeSeams();

    const result = await rollActorCheck(
      request({
        dc: 15,
        interactive: false,
        rollDecision: { bonus: '+3', advantage: 'advantage' },
      }),
      seams
    );

    assertCheckAnswerShape(result);
    assert.equal(result.outcome, COMPANION_OUTCOMES.invalidRollDecision);
    assert.equal(result.success, false);
    assert.equal(result.total, null);
    assert.equal(
      calls.runPassFail.length,
      0,
      'silently discarding it would roll the BASE formula, losing bonus, advantage and roll mode'
    );
  });
});

// ---------------------------------------------------------------------------
// AC-16 — the collapses are discriminated, and every cell pins total and diceGroups
// ---------------------------------------------------------------------------

/**
 * Drive one cell and answer the result, so the table below is data.
 *
 * @param {object} cell
 * @returns {Promise<object>}
 */
async function driveCell({
  graded,
  total = 18,
  formula = '1d20+@prof',
  throwOnConstruct,
  engine = true,
  dismissed,
}) {
  installChat();
  installRoll({ total, throwOnConstruct });
  const { seams } = makeSeams({
    real: true,
    hasDiceEngine: () => engine,
    ...(dismissed ? { prompt: async () => ({ confirmed: false }) } : {}),
  });
  return await rollActorCheck(
    request({
      formula,
      ...(graded ? { dc: 15 } : {}),
      ...(dismissed ? { interactive: true } : {}),
    }),
    seams
  );
}

describe('AC-16 — six cells per arm, each pinning outcome AND total AND diceGroups', () => {
  it('graded arm', async () => {
    const lowRoll = await driveCell({ graded: true, total: 3 });
    assert.equal(
      lowRoll.outcome,
      COMPANION_OUTCOMES.checkFailed,
      'a rolled failure is NOT a throw'
    );
    assert.equal(lowRoll.total, 3);
    assert.ok(lowRoll.diceGroups.length > 0);
    assert.equal(lowRoll.passed, false);

    const thrown = await driveCell({ graded: true, throwOnConstruct: true });
    assert.equal(
      thrown.outcome,
      COMPANION_OUTCOMES.rollFailed,
      'a throw and a rolled failure BOTH answer outcome `fail` at the runner'
    );
    assert.equal(thrown.total, null);
    assert.deepEqual(thrown.diceGroups, []);
    assert.equal(thrown.passed, null);
    assert.ok(thrown.messageData.detail.length > 0, "the runner's free text rides as detail");

    const dismissed = await driveCell({ graded: true, dismissed: true });
    assert.equal(dismissed.outcome, COMPANION_OUTCOMES.cancelled);
    assert.equal(dismissed.total, null);
    assert.deepEqual(dismissed.diceGroups, []);

    const noEngine = await driveCell({ graded: true, engine: false });
    assert.equal(noEngine.outcome, COMPANION_OUTCOMES.engineUnavailable);
    assert.equal(noEngine.total, null);
    assert.deepEqual(noEngine.diceGroups, []);

    // NOT the missing-engine cell: `hasDiceEngine()` answers TRUE here, and the evaluator
    // still reports `engine: false` from its SECOND site. Without the usability gate this
    // answers `checkPassed` with the DC ignored while every other criterion stays green.
    const shimmed = await driveCell({ graded: true, formula: '@craftingmod' });
    assert.equal(shimmed.outcome, COMPANION_OUTCOMES.noFormula);
    assert.notEqual(shimmed.outcome, COMPANION_OUTCOMES.checkPassed);
    assert.equal(shimmed.total, null);
    assert.deepEqual(shimmed.diceGroups, []);

    const zero = await driveCell({ graded: true, total: 0 });
    assert.equal(zero.outcome, COMPANION_OUTCOMES.checkFailed, 'a legitimate 0 is not rollFailed');
    assert.ok(
      Object.is(zero.total, 0),
      'a real zero is 0, never null — a caller must tell them apart'
    );
    assert.ok(zero.diceGroups.length > 0);
  });

  it('ungraded arm', async () => {
    const lowRoll = await driveCell({ graded: false, total: 3 });
    assert.equal(lowRoll.outcome, COMPANION_OUTCOMES.rolled);
    assert.equal(lowRoll.total, 3);
    assert.ok(lowRoll.diceGroups.length > 0);
    assert.equal(lowRoll.passed, null, 'an ungraded roll is not graded, so it has no pass');

    const thrown = await driveCell({ graded: false, throwOnConstruct: true });
    assert.equal(thrown.outcome, COMPANION_OUTCOMES.rollFailed);
    assert.notEqual(
      thrown.outcome,
      COMPANION_OUTCOMES.cancelled,
      'a throw and a dismissal differ by `cancelled`, and the ladder tests that FIRST'
    );
    assert.equal(thrown.total, null);
    assert.deepEqual(thrown.diceGroups, []);

    const dismissed = await driveCell({ graded: false, dismissed: true });
    assert.equal(dismissed.outcome, COMPANION_OUTCOMES.cancelled);
    assert.equal(dismissed.total, null);
    assert.deepEqual(dismissed.diceGroups, []);

    const noEngine = await driveCell({ graded: false, engine: false });
    assert.equal(noEngine.outcome, COMPANION_OUTCOMES.engineUnavailable);
    assert.equal(noEngine.total, null, 'not the 0 the progressive runner free pass would award');
    assert.deepEqual(noEngine.diceGroups, []);

    const shimmed = await driveCell({ graded: false, formula: 'max(@craftingmod, 2)' });
    assert.equal(shimmed.outcome, COMPANION_OUTCOMES.noFormula);
    assert.equal(shimmed.total, null);
    assert.deepEqual(shimmed.diceGroups, []);

    const zero = await driveCell({ graded: false, total: 0 });
    assert.equal(zero.outcome, COMPANION_OUTCOMES.rolled);
    assert.ok(Object.is(zero.total, 0));
    assert.ok(zero.diceGroups.length > 0);
  });
});

// ---------------------------------------------------------------------------
// AC-18 — the default label reads correctly in the chat flavor
// ---------------------------------------------------------------------------

describe('AC-18 — the default label composes with the template that appends " check"', () => {
  it('renders no undefined and no doubled "check check"', async () => {
    installChat();
    installRoll();
    const { seams, calls } = makeSeams();

    await rollActorCheck(request({ dc: 15, label: undefined }), seams);

    // The FLAVOR, not the dialog title: the prompt already guards its own title with
    // `activity || 'Roll'`, so a title assertion is vacuous whatever the member does. The
    // flavor is the string that actually reaches a GM's chat log.
    const { flavor } = calls.runPassFail[0].rollOptions;
    assert.doesNotMatch(flavor, /undefined/);
    assert.doesNotMatch(flavor, /check\s+check/i, 'a default of `Check` would render exactly this');
    assert.equal(flavor, 'Fabricate check (DC 15)');
  });

  it('names a roll-under final target, never a DC, and a count neither (issue 2005)', async () => {
    installChat();
    installRoll({ total: 9 });
    const { seams } = makeSeams({ real: true });
    await rollActorCheck(
      request({
        dc: 15,
        formula: '1d20',
        interactive: true,
        rollDecision: { bonus: '2' },
        evaluation: { product: 'sum', direction: 'under', target: { source: 'fixed' } },
      }),
      seams
    );
    const flavors = chatPosts.map((post) => post.messageData?.flavor ?? post.flavor);
    assert.deepEqual(flavors, ['Fabricate check (Target 17)'], '15 raised by the bonus of 2');

    const counted = makeSeams();
    await rollActorCheck(
      request({
        dc: 1,
        evaluation: { product: 'count', direction: 'over', pool: { base: '2', threshold: '8', required: 1 } },
      }),
      counted.seams
    );
    const bag = counted.calls.runPassFail[0] ?? counted.calls.runProgressive[0];
    assert.equal(bag.rollOptions.flavor, 'Fabricate check', 'a count names no DC');
  });

  it('uses the caller label when one is supplied', async () => {
    installChat();
    installRoll();
    const { seams, calls } = makeSeams();

    await rollActorCheck(request({ dc: 15, label: 'Downtime: Research' }), seams);

    assert.equal(calls.runPassFail[0].rollOptions.flavor, 'Downtime: Research check (DC 15)');
  });
});

// ---------------------------------------------------------------------------
// AC-19 — the post-shim usability gate, on all three call paths
// ---------------------------------------------------------------------------

describe('AC-19 — a formula the retirement shim empties is refused, never rolled', () => {
  // `'   '` is the cell that makes the `.trim()` in `resolveUsableCheckFormula` load-bearing
  // rather than decorative. The shim answers a whitespace formula VERBATIM — it empties
  // `@craftingmod` and refuses `max(@craftingmod, 2)`, but three spaces are neither — so
  // without the trim the emptiness test sees a non-empty string, the formula reaches the
  // runner, and a graded check answers `checkFailed` with `total: 0`: a FABRICATED failure
  // against the DC, indistinguishable to a caller from a real one.
  for (const formula of ['@craftingmod', 'max(@craftingmod, 2)', '   ']) {
    for (const [arm, extra] of [
      ['graded', { dc: 15 }],
      ['ungraded', {}],
    ]) {
      it(`${arm}: ${JSON.stringify(formula)} answers noFormula and reaches no runner`, async () => {
        installChat();
        installRoll();
        const { seams, calls } = makeSeams();

        const result = await rollActorCheck(request({ formula, ...extra }), seams);

        assertCheckAnswerShape(result);
        assert.equal(result.outcome, COMPANION_OUTCOMES.noFormula);
        assert.equal(result.total, null);
        assert.deepEqual(result.diceGroups, []);
        assert.equal(calls.runPassFail.length, 0);
        assert.equal(calls.runProgressive.length, 0);
      });
    }
  }

  it('is ORDERED: an unusable formula answers noFormula even with NO dice engine', async () => {
    // The two pre-dispatch gates are ordered, and the order is spec-normative: "you gave me
    // nothing to roll" is the better answer than "this client cannot roll" when both are
    // true. Every other case in this suite holds at most ONE of the two facts wrong, so
    // swapping the two gates is invisible to all of them — this is the only cell in which
    // both are false at once, and so the only one that can see the order at all.
    installChat();
    installRoll();
    const { seams, calls } = makeSeams({ hasDiceEngine: () => false });

    const result = await rollActorCheck(request({ formula: '@craftingmod', dc: 15 }), seams);

    assertCheckAnswerShape(result);
    assert.equal(result.outcome, COMPANION_OUTCOMES.noFormula);
    assert.notEqual(result.outcome, COMPANION_OUTCOMES.engineUnavailable);
    assert.equal(calls.runPassFail.length, 0);
    assert.equal(calls.runProgressive.length, 0);
  });

  it('the bulk filter excludes an unusable entry from covered AND from allowAdvantage', async () => {
    installChat();
    installRoll();
    const { seams } = makeSeams();

    const result = await resolveBulkCheckDecision(
      { callSite: 'gmAction', formulas: ['1d20', '@craftingmod'] },
      seams
    );

    assert.deepEqual(result.covered, [0], 'the unusable entry is not covered');
    assert.equal(
      result.allowAdvantage,
      true,
      'and it does not deny Advantage to the batch: the predicate runs over index 0 alone'
    );
  });
});

// ---------------------------------------------------------------------------
// The call-site gate, at the module level (its facade half is criterion AC-4)
// ---------------------------------------------------------------------------

describe('the call-site rule refuses both a missing and an unrecognised declaration', () => {
  for (const callSite of [undefined, null, '', 'gm', 'GMACTION', 'broadcasts']) {
    it(`refuses invalidCallSite for ${JSON.stringify(callSite)}`, async () => {
      installChat();
      installRoll();
      const { seams, calls } = makeSeams();

      const result = await rollActorCheck(request({ callSite }), seams);

      assert.equal(result.outcome, COMPANION_OUTCOMES.invalidCallSite);
      assert.equal(calls.runPassFail.length, 0);
      assert.equal(calls.elected, 0, 'and the election is not consulted for an unknown call site');
    });
  }

  it('consults the election for broadcast and NOT for gmAction', async () => {
    installChat();
    installRoll();
    const action = makeSeams();
    await rollActorCheck(request({ dc: 15 }), action.seams);
    assert.equal(action.calls.elected, 0, 'a single-client GM action needs no election');

    const broadcast = makeSeams();
    await rollActorCheck(request({ dc: 15, callSite: 'broadcast' }), broadcast.seams);
    assert.equal(broadcast.calls.elected, 1);
  });
});

describe('interactive summed rows compose with the shared prompt and a forwarded decision (issue 2005)', () => {
  /** Each published interactive summed row and source, with the chip its prompt must show. */
  const CHIPS = {
    'over/fixed': 'DC 15 · meet or beat',
    'over/attribute': 'Target 55 · meet or beat',
    'under/fixed': 'Target 15 · stay at or under',
    'under/attribute': 'Target 55 · stay at or under',
  };
  const cells = CHECK_EVALUATION_CAPABILITIES.modes
    .filter((mode) => mode.product === 'sum')
    .flatMap((mode) => mode.targetSources.map((source) => ({ mode, source })));
  const evaluationOf = ({ mode, source }) => ({
    product: 'sum',
    direction: mode.direction,
    target:
      source === 'attribute' ? { source, expression: '@skills.craft.value' } : { source: 'fixed' },
  });
  const roll = (cell, extra) =>
    rollActorCheck(
      request({ actor: SKILLED_ACTOR, formula: '1d20', dc: 15, evaluation: evaluationOf(cell), ...extra }),
      extra.seams
    );

  it('publishes every summed row as interactive, and every one opens the real prompt (Q17)', async () => {
    assert.deepEqual(Object.keys(CHIPS), cells.map(({ mode, source }) => `${mode.direction}/${source}`));
    for (const cell of cells) {
      const key = `${cell.mode.direction}/${cell.source}`;
      assert.equal(cell.mode.interactive, true, key);
      installChat();
      installRoll({ total: 10 });
      const surface = stubPromptSurface(() => ({ confirmed: true, rollMode: 'gmroll', advantage: 'normal' }));
      try {
        const { seams } = makeSeams({ real: true, prompt: promptCheckRoll });
        const result = await roll(cell, { interactive: true, seams });
        assert.equal(surface.views.length, 1, `${key}: one prompt`);
        assert.equal(surface.view.chipText, CHIPS[key], key);
        assert.equal(surface.view.offerSituationalBonus, true, `${key}: a companion always offers the field`);
        const passes = cell.mode.direction === 'under';
        assert.equal(result.outcome, passes ? 'checkPassed' : 'checkFailed', `${key}: a roll of 10`);
      } finally {
        surface.restore();
      }
    }
  });

  it('forwards a decision: the bonus lands by direction and advantage keeps the better die', async () => {
    const EXPECTED = {
      'over/fixed': { formula: '2d20kh1 + (2)', target: 15 },
      'over/attribute': { formula: '2d20kh1 + (2)', target: 55 },
      'under/fixed': { formula: '2d20kl1', target: 17 },
      'under/attribute': { formula: '2d20kl1', target: 57 },
    };
    for (const cell of cells) {
      const key = `${cell.mode.direction}/${cell.source}`;
      installChat();
      const rolled = installTermRoll({ total: 10 });
      const { seams, calls } = makeSeams({ real: true });
      const result = await roll(cell, {
        interactive: true,
        rollDecision: { bonus: '2', rollMode: 'gmroll', advantage: 'advantage' },
        seams,
      });
      assert.equal(calls.prompt.length, 0, `${key}: a forwarded decision opens no prompt`);
      assert.ok(rolled.evaluated.includes(EXPECTED[key].formula), `${key}: ${rolled.evaluated}`);
      assert.equal(result.target, EXPECTED[key].target, key);
    }
  });
});

// ---------------------------------------------------------------------------
// Additional dice through the standalone check roll (issue 2008)
// ---------------------------------------------------------------------------

const MOMENTUM = 'system.resources.momentum.value';
const PAID = Object.freeze({
  enabled: true,
  source: 'path',
  path: MOMENTUM,
  max: 2,
  label: 'Momentum',
});
const MACRO_PAID = Object.freeze({
  enabled: true,
  source: 'macro',
  readMacroUuid: 'Macro.read',
  spendMacroUuid: 'Macro.spend',
  max: 2,
  label: '',
});
const CALLING_GM = Object.freeze({ id: 'user-gm', isGM: true });

const pathValue = (object, path) =>
  String(path)
    .split('.')
    .reduce((node, key) => node?.[key], object);

/**
 * A character whose `_source` holds `momentum`, which `update` writes and records as core does:
 * `refuse` resolves `undefined`, as a vetoed write does, and `writable` answers `canUserModify`.
 */
function payingActor(momentum, { writable = true, refuse = false } = {}) {
  const source = { system: { resources: { momentum: { value: momentum } } } };
  const writes = [];
  const actor = {
    id: 'actor-1',
    uuid: 'Actor.actor-1',
    name: 'Idrin',
    getRollData: () => ({}),
    overrides: {},
    canUserModify: () => writable,
    async update(patch) {
      writes.push(patch[MOMENTUM]);
      if (refuse) return undefined;
      source.system.resources.momentum.value = patch[MOMENTUM];
      return actor;
    },
  };
  Object.defineProperty(actor, '_source', { get: () => source });
  return { actor, writes, held: () => source.system.resources.momentum.value };
}

/** Read and spend script macros that record each payload; `spent` is the spend's answer. */
function installPayingMacros({ available = 2, spent = true } = {}) {
  const calls = { reads: [], spends: [] };
  const probe = { calls, available, spent };
  const script = (list, answer) => ({
    type: 'script',
    command: `const p = globalThis.companionMacroProbe; p.calls.${list}.push(scope); return p.${answer};`,
  });
  const macros = { 'Macro.read': script('reads', 'available'), 'Macro.spend': script('spends', 'spent') };
  Object.assign(globalThis, {
    companionMacroProbe: probe,
    fromUuid: async (uuid) => macros[uuid] ?? null,
  });
  return calls;
}

/** Count dice scripted with `faces`, the calling GM and core's two read helpers, all restored. */
async function withPaidDice(faces, body) {
  const saved = ['foundry', 'fromUuid', 'companionMacroProbe'].map((key) => [key, globalThis[key]]);
  installChat();
  Object.assign(globalThis.game, { user: CALLING_GM });
  Object.assign(globalThis, {
    foundry: {
      utils: {
        getProperty: pathValue,
        hasProperty: (object, path) => pathValue(object, path) !== undefined,
      },
    },
  });
  const dice = installCountDice({ faces });
  try {
    return await body(dice);
  } finally {
    dice.restore();
    for (const [key, value] of saved) {
      if (value === undefined) delete globalThis[key];
      else Object.assign(globalThis, { [key]: value });
    }
  }
}

/** A d10 pool of 2 at ≥ 8 needing 1, paid for by `additionalDice`. */
const paidEvaluation = (additionalDice = PAID) => countEvaluation({ additionalDice });

/** A seam bag whose prompt records each offer and answers `answer`. */
function promptingSeams(answer) {
  const offers = [];
  const made = makeSeams({
    real: true,
    prompt: async (input) => {
      offers.push(input.additionalDiceOffer);
      return { confirmed: true, ...answer };
    },
  });
  return { ...made, offers };
}

describe('additional dice through the standalone check roll (issue 2008)', () => {
  it('buys a gmAction request its dice, spends them before the roll and reports boughtDice', async () => {
    await withPaidDice([9, 9, 3], async (dice) => {
      const { actor, writes, held } = payingActor(2);
      const { seams, calls } = makeSeams({ real: true });
      const result = await rollActorCheck(
        request({ actor, evaluation: paidEvaluation(), additionalDice: 1 }),
        seams
      );
      assertCheckAnswerShape(result);
      assert.equal(result.outcome, 'checkPassed');
      assert.equal(result.boughtDice, 1);
      assert.deepEqual([writes, held()], [[1], 1], 'one Momentum spent');
      assert.equal(calls.runPassFail[0].rollOptions.additionalDice, 1);
      assert.equal(calls.prompt.length, 0, 'a non-interactive purchase opens no prompt');
      assert.equal(dice.constructed.length, 1, 'one count Roll');
      assert.equal(result.diceGroups[0].results.length, 3, 'two authored dice and one bought');
    });
  });

  it('answers boughtDice 0 on an executed roll that bought none, and spends nothing', async () => {
    await withPaidDice([9, 9], async () => {
      const { actor, writes } = payingActor(2);
      const counted = await rollActorCheck(
        request({ actor, evaluation: paidEvaluation() }),
        makeSeams({ real: true }).seams
      );
      assertCheckAnswerShape(counted);
      assert.deepEqual([counted.outcome, counted.boughtDice, writes], ['checkPassed', 0, []]);
    });
    installChat();
    installRoll();
    const summed = await rollActorCheck(request({ dc: 15 }), makeSeams({ real: true }).seams);
    assert.deepEqual([summed.outcome, summed.boughtDice], ['checkPassed', 0]);
  });

  it('opens the prompt for an interactive count with the offer, and buys what the player answers', async () => {
    await withPaidDice([9, 9, 3], async (dice) => {
      const { actor, writes } = payingActor(2);
      const { seams, offers } = promptingSeams({ additionalDice: 1 });
      const result = await rollActorCheck(
        request({ actor, interactive: true, evaluation: paidEvaluation() }),
        seams
      );
      assert.equal(offers.length, 1, 'one prompt, rather than an evaluationUnsupported refusal');
      const { reach, ...offer } = offers[0];
      assert.deepEqual(offer, {
        available: 2,
        limit: 2,
        max: 2,
        resourceLabel: 'Momentum',
        unavailable: null,
      });
      assert.ok(reach, 'the prompt may judge reach');
      assert.deepEqual([result.outcome, result.boughtDice, writes], ['checkPassed', 1, [1]]);
      assert.equal(dice.posts[0].rolls[0].dice[0].results.length, 3);
    });
  });

  it('buys a forwarded rollDecision.additionalDice without a prompt, and simulates nothing', async () => {
    await withPaidDice([9, 9, 3, 9, 9], async (dice) => {
      const { actor, writes } = payingActor(2);
      const { seams, calls } = makeSeams({ real: true });
      const result = await rollActorCheck(
        {
          ...request({ actor, interactive: true, evaluation: paidEvaluation() }),
          rollDecision: { bonus: null, advantage: 'normal', additionalDice: 1, simulatedAdditionalDice: 2 },
          simulatedAdditionalDice: 2,
        },
        seams
      );
      const { rollOptions } = calls.runPassFail[0];
      assert.equal(calls.prompt.length, 0);
      assert.deepEqual(rollOptions.rollDecision, {
        bonus: null,
        rollMode: undefined,
        advantage: 'normal',
        additionalDice: 1,
      });
      assert.equal('simulatedAdditionalDice' in rollOptions, false, 'the preview seam is never reachable');
      assert.equal('additionalDice' in rollOptions, false, 'only the decision buys on an interactive request');
      assert.deepEqual([result.boughtDice, writes], [1, [1]]);
      assert.equal(dice.posts[0].rolls[0].dice[0].results.length, 3, 'one bought die, none simulated');
    });
  });

  it('buys nothing on a broadcast: it refuses before any read and shows the prompt why', async () => {
    await withPaidDice([9, 9], async (dice) => {
      const macroCalls = installPayingMacros();
      const { actor } = payingActor(2);
      const broadcast = { actor, callSite: 'broadcast', evaluation: paidEvaluation(MACRO_PAID) };
      const direct = makeSeams({ real: true });
      const refused = await rollActorCheck(request({ ...broadcast, additionalDice: 1 }), direct.seams);
      assertCheckAnswerShape(refused);
      assert.deepEqual(
        [refused.outcome, refused.messageData.reason, refused.message],
        ['additionalDiceRefused', 'broadcastCallSite', additionalDiceRefusalKey('broadcastCallSite')]
      );
      assert.equal(direct.calls.runPassFail.length, 0, 'refused before the runner');

      const buying = promptingSeams({ additionalDice: 1 });
      const answered = await rollActorCheck(request({ ...broadcast, interactive: true }), buying.seams);
      assert.equal(buying.offers[0].unavailable, 'broadcastCallSite', 'the prompt shows the reason');
      assert.deepEqual(buying.offers[0].available, 0);
      assert.deepEqual(
        [answered.outcome, answered.messageData.reason],
        ['additionalDiceRefused', 'broadcastCallSite']
      );

      const plain = promptingSeams({ additionalDice: 0 });
      const rolled = await rollActorCheck(request({ ...broadcast, interactive: true }), plain.seams);
      assert.deepEqual([rolled.outcome, rolled.boughtDice], ['checkPassed', 0]);
      assert.deepEqual(macroCalls, { reads: [], spends: [] }, 'no read or spend macro ran');
      assert.equal(dice.posts.length, 1, 'only the roll that bought nothing posted');
    });
  });

  it('refuses invalidRollDecision for a top-level additionalDice on an interactive request', async () => {
    await withPaidDice([9, 9, 9, 9], async (dice) => {
      const { actor, writes } = payingActor(2);
      for (const additionalDice of [1, '0', -1]) {
        const { seams, calls } = makeSeams({ real: true });
        const result = await rollActorCheck(
          request({ actor, interactive: true, evaluation: paidEvaluation(), additionalDice }),
          seams
        );
        assertCheckAnswerShape(result);
        assert.equal(result.outcome, 'invalidRollDecision', JSON.stringify(additionalDice));
        assert.deepEqual([calls.prompt.length, calls.runPassFail.length], [0, 0]);
      }
      assert.deepEqual([writes, dice.posts.length], [[], 0]);
      for (const additionalDice of [0, null]) {
        const { seams, calls } = makeSeams({ real: true });
        const result = await rollActorCheck(
          request({ actor, interactive: true, evaluation: paidEvaluation(), additionalDice }),
          seams
        );
        assert.equal(result.outcome, 'checkPassed', `${additionalDice} names no dice`);
        assert.equal(calls.prompt.length, 1);
      }
    });
  });

  it('answers every refusal additionalDiceRefused, in its reason words, with nothing rolled', async () => {
    const off = { ...PAID, enabled: false };
    const cases = [
      ['a summed check', { evaluation: { product: 'sum' }, additionalDice: 1 }, {}, 'notOffered'],
      ['additional dice off', { evaluation: paidEvaluation(off), additionalDice: 1 }, {}, 'notOffered'],
      ['a negative count', { additionalDice: -1 }, {}, 'choiceInvalid'],
      ['a fractional count', { additionalDice: 1.5 }, {}, 'choiceInvalid'],
      ['a numeric string', { additionalDice: '1' }, {}, 'choiceInvalid'],
      ['a count above the limit', { additionalDice: 3 }, {}, 'choiceAboveLimit'],
      [
        'a forwarded count above the limit',
        { interactive: true, rollDecision: { advantage: 'normal', additionalDice: 3 } },
        {},
        'choiceAboveLimit',
      ],
      ['a resource the GM cannot change', { additionalDice: 1 }, { writable: false }, 'resourceNotWritable'],
      [
        'an unlabelled resource the GM cannot change',
        { evaluation: paidEvaluation({ ...PAID, label: '' }), additionalDice: 1 },
        { writable: false },
        'resourceNotWritable',
      ],
      ['a vetoed write', { additionalDice: 1 }, { refuse: true }, 'spendRefused'],
      ['a failing spend macro', { evaluation: paidEvaluation(MACRO_PAID), additionalDice: 1 }, {}, 'spendRefused'],
    ];
    for (const [name, extra, holding, reason] of cases) {
      await withPaidDice([9, 9, 9], async (dice) => {
        installPayingMacros({ available: 5, spent: false });
        const { actor } = payingActor(5, holding);
        const evaluation = extra.evaluation ?? paidEvaluation();
        const { seams } = makeSeams({ real: true });
        const result = await rollActorCheck(request({ actor, evaluation, ...extra }), seams);
        assertCheckAnswerShape(result);
        const { label = '', source } = evaluation.pool?.additionalDice ?? {};
        assert.equal(result.outcome, 'additionalDiceRefused', name);
        assert.deepEqual([result.success, result.total], [false, null], name);
        assert.equal(result.messageData.reason, reason, name);
        assert.equal(result.message, additionalDiceRefusalKey(reason, { label, source }), name);
        assert.equal('boughtDice' in result, false, `${name}: a refusal carries no executed field`);
        assert.deepEqual(dice.constructed, [], `${name}: no Roll constructed`);
      });
    }
  });

  it('names the facts its sentence needs once the engine read a budget', async () => {
    await withPaidDice([9, 9, 9], async () => {
      const { actor } = payingActor(5);
      const result = await rollActorCheck(
        request({ actor, evaluation: paidEvaluation(), additionalDice: 3 }),
        makeSeams({ real: true }).seams
      );
      assert.deepEqual(result.messageData, {
        label: 'Fabricate',
        reason: 'choiceAboveLimit',
        actor: 'Idrin',
        resource: 'Momentum',
        n: 3,
        limit: 2,
        available: 5,
      });
      assertMessageDataCovers(result, 'an above-limit refusal');
    });
  });

  it('discriminates a refusal before the cancelled shape it shares (AD63)', async () => {
    const shared = { success: false, cancelled: true, outcome: null, value: null, data: {} };
    const notice = { dice: 2, limit: 2, available: 1, label: 'Momentum', source: 'path' };
    const refusal = { ...shared, additionalDiceRefusal: 'resourceChanged', additionalDiceNotice: notice };
    const evaluation = paidEvaluation();
    for (const [result, outcome] of [
      [refusal, 'additionalDiceRefused'],
      [shared, 'cancelled'],
    ]) {
      const { seams } = makeSeams({ runPassFail: async () => result });
      const answer = await rollActorCheck(request({ evaluation }), seams);
      assertCheckAnswerShape(answer);
      assert.equal(answer.outcome, outcome);
    }
    const { seams } = makeSeams({ runPassFail: async () => refusal });
    const answer = await rollActorCheck(request({ evaluation }), seams);
    assert.equal(answer.message, additionalDiceRefusalKey('resourceChanged', { label: 'Momentum' }));
    assert.deepEqual(answer.messageData, {
      label: 'Fabricate',
      reason: 'resourceChanged',
      actor: 'Idrin',
      resource: 'Momentum',
      n: 2,
      limit: 2,
      available: 1,
    });
  });

  it('answers evaluationInvalid naming the spent dice when the Roll refuses after the spend', async () => {
    await withPaidDice([], async (dice) => {
      dice.CountRoll.prototype.evaluate = async () => {
        throw new CountRollRefusal('explode-unbounded', 'explode');
      };
      const { actor, writes } = payingActor(2);
      const result = await rollActorCheck(
        request({ actor, evaluation: paidEvaluation(), additionalDice: 1 }),
        makeSeams({ real: true }).seams
      );
      assertCheckAnswerShape(result);
      assert.equal(result.outcome, 'evaluationInvalid');
      assert.deepEqual(result.messageData, { label: 'Fabricate', boughtDice: 1 });
      assert.deepEqual(writes, [1], 'nothing refunds');
    });
  });

  it('hands the read and spend macros the calling GM and no crafting subject', async () => {
    await withPaidDice([9, 9, 3], async () => {
      const macroCalls = installPayingMacros();
      const { actor } = payingActor(0);
      const result = await rollActorCheck(
        request({ actor, evaluation: paidEvaluation(MACRO_PAID), additionalDice: 1 }),
        makeSeams({ real: true }).seams
      );
      assert.equal(result.boughtDice, 1);
      assert.equal(macroCalls.spends.length, 1);
      for (const payload of [macroCalls.reads[0], macroCalls.spends[0]]) {
        assert.equal(payload.actor, actor);
        assert.equal(payload.user, CALLING_GM);
        assert.deepEqual(
          [payload.craftingSystem, payload.activity, payload.recipe, payload.component, payload.task],
          [null, null, null, null, null]
        );
      }
      assert.deepEqual([macroCalls.spends[0].dice, macroCalls.spends[0].delta], [1, -1]);
    });
  });
});
