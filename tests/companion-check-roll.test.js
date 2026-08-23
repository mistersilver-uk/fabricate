/**
 * The Standalone Check Roll (issue 1293) — `src/systems/companionCheckRoll.js`.
 *
 * The module is a Foundry-free leaf that takes every collaborator as a seam, so this suite
 * drives it two ways and the difference is deliberate:
 *
 *  - **REAL runners** (`runFormulaPassFail` / `runFormulaProgressive`) over a stubbed
 *    `globalThis.Roll`, wherever the claim is about what the member does with a runner's
 *    ANSWER. The three-step discriminator ladder is the point of this change, and a canned
 *    runner reply would let the ladder be graded against a reconstruction rather than against
 *    the runner it actually ships beside. r2's ladder was wrong precisely because it was
 *    derived from a reconstruction.
 *  - **SPY runners**, wherever the claim is about what the member PASSES, or that it passed
 *    nothing at all. A gate that refuses before dispatch is only assertable by call count.
 *
 * `buildInteractiveRollOptions` is the REAL one in both, because it is a pure function and
 * because the flavor it composes is the string the default-label rule is about.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

import { runFormulaPassFail, runFormulaProgressive } from '../src/systems/checkRoll.js';
import {
  resolveBulkCheckDecision,
  rollActorCheck,
} from '../src/systems/companionCheckRoll.js';
import {
  BULK_CHECK_DECISION_MESSAGE_KEYS,
  CHECK_ROLL_MESSAGE_KEYS,
  COMPANION_OUTCOMES,
} from '../src/systems/companionContract.js';
import { buildInteractiveRollOptions } from '../src/ui/svelte/apps/crafting/rollPrompt.js';

import {
  assertLocalizationKey,
  assertMessageDataCovers,
  assertMessageIsFromTable,
} from './helpers/companionContractOutcomes.js';

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------

const ACTOR = {
  id: 'actor-1',
  name: 'Idrin',
  getRollData: () => ({ prof: 2 }),
};

/**
 * Install a `globalThis.Roll` that COUNTS ITS CONSTRUCTIONS.
 *
 * The construction count is what makes "the dismissal short-circuits before the roll"
 * assertable at all. A chat spy proves nothing there: the dismissal returns from
 * `evaluateCheckRoll` before BOTH the `new Roll(...)` and the `toMessage` block, so the chat
 * count is 0 either way and a member that rolled and then refused would pass.
 *
 * `replaceFormulaData` really substitutes, because without it `resolveCheckFormulaDisplay`
 * returns `null` unconditionally and every `resolvedFormula` assertion is vacuous — an
 * `assert.notEqual(null, '1d20+@prof')` passes trivially and an `assert.doesNotMatch(null, …)`
 * throws `ERR_INVALID_ARG_TYPE` rather than asserting anything.
 *
 * @param {object} [options]
 * @param {number} [options.total] the total every roll answers
 * @param {boolean} [options.throwOnConstruct] make the dice engine throw, as a broken formula
 *   reaching `new Roll(...)` would
 * @returns {{ constructions: string[], chat: object[] }}
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
      // The die total and the roll total differ on the zero case (`1d20 - 5` rolling a 5),
      // which is exactly the shape a legitimate total of `0` really has.
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

/**
 * The seam bag, with per-seam call records.
 *
 * `localize` answers the FALLBACK, which is what a client with no `game.i18n` — and Foundry's
 * own `localize` for a missing string — produces. That makes the default-label criterion an
 * assertion about the shipped English rather than about a test double's invention.
 */
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
    data: { dc: 15, formula: '1d20', resolvedFormula: '1d20', total: 20, comparison: 'meet', diceGroups: [] },
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
  assert.deepEqual(
    Object.keys(result).filter((key) => key !== 'messageData'),
    ['success', 'passed', 'total', 'diceGroups', 'resolvedFormula', 'outcome', 'message'],
    "the answer's key set (and its order) is the published contract"
  );
  assertLocalizationKey(result.message, `rollActorCheck's ${result.outcome}`);
  assertMessageIsFromTable(result, CHECK_ROLL_MESSAGE_KEYS, "rollActorCheck's answer");
  assertMessageDataCovers(result, `rollActorCheck's ${result.outcome} answer`);
}

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

// ---------------------------------------------------------------------------
// AC-2, AC-9(3) — the dismissal short-circuits BEFORE the roll
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// AC-3 — the formula is @-resolved, and no modifier context is passed
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// AC-6 — a missing dice engine, on BOTH arms
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// AC-7 — the pre-resolved decision
// ---------------------------------------------------------------------------

describe('AC-7 — a pre-resolved decision drives the roll without opening a dialog', () => {
  it('opens a dialog for a confirmed interactive roll', async () => {
    installChat();
    installRoll();
    const { seams, calls } = makeSeams({ real: true });

    const result = await rollActorCheck(request({ dc: 15, interactive: true }), seams);

    assert.equal(result.outcome, COMPANION_OUTCOMES.checkPassed);
    assert.equal(calls.prompt.length, 1, 'the injected prompt was asked');
  });

  it('opens NO dialog when a decision is supplied, and the decision still reaches the roll', async () => {
    installChat();
    const rolls = installRoll();
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
    const [rolled] = rolls.constructions;
    assert.match(rolled, /2d20kh1/, 'the advantage disposition rewrote the d20 pool');
    assert.match(rolled, /\(\+3\)/, 'and the situational bonus appended');
    const [post] = chatPosts;
    assert.equal(post?.options?.rollMode, 'blindroll', 'and the roll mode reached the chat post');
  });

  it('treats a hand-built decision carrying confirmed:false as a cancel', async () => {
    // Constructed BY HAND rather than obtained from the prompt, because this is the assertion
    // that proves the `confirmed`-strip is load-bearing. A decision carries NO `confirmed` key
    // — `BulkSalvageService` strips it deliberately, and the evaluator's `=== false` early
    // exit is what a carried-through flag would trip. A caller that forwarded a whole prompt
    // answer has therefore handed over a refusal, and the member honours it: without this the
    // caller signals a decline and gets a roll it never asked for, silently.
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

// ---------------------------------------------------------------------------
// AC-8, AC-17, AC-20 — the bulk decision
// ---------------------------------------------------------------------------

describe('AC-8 — allowAdvantage is computed over the USABLE subset, all-or-nothing', () => {
  for (const [formulas, expected, why] of [
    [['1d20+@prof', '2d10+3'], false, 'a 2d10 check cannot honour Advantage'],
    [['1d20+@prof', ''], true, 'the empty formula is not usable and is excluded before the test'],
    [['2d10', '2d10'], false, 'no plain d20 anywhere in the batch'],
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

    const result = await resolveBulkCheckDecision({ callSite: 'gmAction', formulas: ['', ''] }, seams);

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
  });
});

// ---------------------------------------------------------------------------
// AC-9 — the module rolls nothing, proved three ways
// ---------------------------------------------------------------------------

const MODULE_PATH = resolve(import.meta.dirname, '../src/systems/companionCheckRoll.js');
const MODULE_SOURCE = readFileSync(MODULE_PATH, 'utf8');

/**
 * The module's text with comments and string literals removed.
 *
 * Every ABSENCE assertion below reads this rather than the raw file, so the module header is
 * free to EXPLAIN what the module does not do without satisfying its own prohibition. A raw
 * grep runs in the failing direction here: the header names `globalThis.Roll` in order to say
 * it is never read.
 */
const MODULE_CODE = MODULE_SOURCE.replaceAll(/\/\*[\s\S]*?\*\//g, '')
  .replaceAll(/\/\/.*$/gm, '')
  .replaceAll(/'(?:[^'\\]|\\.)*'/g, "''")
  .replaceAll(/"(?:[^"\\]|\\.)*"/g, '""')
  .replaceAll(/`(?:[^`\\]|\\.)*`/g, '``');

describe('AC-9 — the module rolls nothing and reaches nothing it was not given', () => {
  it('imports from EXACTLY two modules, so it cannot bypass its own seams', () => {
    const specifiers = [...MODULE_CODE.matchAll(/^import[\s\S]*?from\s+''/gm)].length;
    const sources = [...MODULE_SOURCE.matchAll(/^import[\s\S]*?from\s+'([^']+)'/gm)].map(
      ([, source]) => source
    );
    assert.equal(specifiers, sources.length, 'every import was located');
    assert.deepEqual(
      [...sources].sort(),
      ['../utils/craftingCheckExpression.js', './companionContract.js'],
      'an import list is a PROPERTY; a variable-name grep is only a spelling. Admitting ' +
        'checkRoll.js or rollPrompt.js here would let the module bypass the very seams every ' +
        'dismissal assertion depends on'
    );
  });

  it('contains no globalThis.Roll reference at all, in code', () => {
    // No `typeof` carve-out: with `hasDiceEngine` as a seam there is no longer a legitimate
    // site for one.
    assert.equal(MODULE_CODE.includes('globalThis'), false, 'the leaf reads no global');
    assert.equal(/\bRoll\b/.test(MODULE_CODE.replaceAll(/Roll(Actor|Decision)/g, '')), false);
    assert.ok(MODULE_SOURCE.includes('globalThis.Roll'), 'and the header still explains why');
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
    record(
      await rollActorCheck(request({ rollDecision: { bonus: '+1' } }), makeSeams().seams)
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
        'cancelled',
        'checkFailed',
        'checkPassed',
        'engineUnavailable',
        'invalidCallSite',
        'invalidRollDecision',
        'noFormula',
        'notElected',
        'rollFailed',
        'rolled',
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
      await resolveBulkCheckDecision({ callSite: 'gmAction', formulas: ['1d20'] }, makeSeams().seams)
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
];

describe('AC-14 — nothing a caller supplies reaches the runner or the roll options', () => {
  it('pins both key sets, and a HOSTILE request cannot widen either', async () => {
    installChat();
    installRoll();
    const hostilePrompt = { calls: 0 };

    const clean = makeSeams();
    await rollActorCheck(request({ dc: 15 }), clean.seams);
    const [cleanBag] = clean.calls.runPassFail;

    const hostile = makeSeams();
    await rollActorCheck(
      {
        ...request({ dc: 15 }),
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

// ---------------------------------------------------------------------------
// AC-15 — a decision supplied for a non-interactive roll is REFUSED
// ---------------------------------------------------------------------------

describe('AC-15 — invalidRollDecision', () => {
  it('refuses rather than silently discarding the caller answer', async () => {
    installChat();
    installRoll();
    const { seams, calls } = makeSeams();

    const result = await rollActorCheck(
      request({ dc: 15, interactive: false, rollDecision: { bonus: '+3', advantage: 'advantage' } }),
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
async function driveCell({ graded, total = 18, formula = '1d20+@prof', throwOnConstruct, engine = true, dismissed }) {
  installChat();
  installRoll({ total, throwOnConstruct });
  const { seams } = makeSeams({
    real: true,
    hasDiceEngine: () => engine,
    ...(dismissed ? { prompt: async () => ({ confirmed: false }) } : {}),
  });
  return await rollActorCheck(
    request({ formula, ...(graded ? { dc: 15 } : {}), ...(dismissed ? { interactive: true } : {}) }),
    seams
  );
}

describe('AC-16 — six cells per arm, each pinning outcome AND total AND diceGroups', () => {
  it('graded arm', async () => {
    const lowRoll = await driveCell({ graded: true, total: 3 });
    assert.equal(lowRoll.outcome, COMPANION_OUTCOMES.checkFailed, 'a rolled failure is NOT a throw');
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
    assert.ok(Object.is(zero.total, 0), 'a real zero is 0, never null — a caller must tell them apart');
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
  for (const formula of ['@craftingmod', 'max(@craftingmod, 2)']) {
    for (const [arm, extra] of [
      ['graded', { dc: 15 }],
      ['ungraded', {}],
    ]) {
      it(`${arm}: ${formula} answers noFormula and reaches no runner`, async () => {
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
