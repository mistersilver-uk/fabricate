/** Unit tests for the interactive check-roll seam (issue: interactive roll prompt). */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluateCheckRoll,
  evaluatePreparedCheck,
  evaluatePreparedCraftingCheck,
  evaluatePreparedRunCheck,
  postCheckRollHandoff,
  runFormulaPassFail,
  runFormulaProgressive,
  runFormulaRouted,
} from '../src/systems/checkRoll.js';
import { postBundledCheckRoll } from '../src/systems/checkModifierRolls.js';

// Stubs

/** The most recently constructed fake Roll (null when none constructed). */
let lastRoll = null;

function installRollStub() {
  lastRoll = null;
  class FakeRoll {
    constructor(formula, data) {
      this.formula = formula;
      this.data = data;
      this.total = 15;
      this.dice = [];
      this.toMessageCalls = [];
      lastRoll = this;
    }
    async evaluate() {
      this.evaluated = true;
      return this;
    }
    async toMessage(messageData, options) {
      this.toMessageCalls.push({ messageData, options });
      return { id: 'msg' };
    }
    toJSON() {
      return { class: 'FakeRoll', formula: this.formula, total: this.total, terms: [], dice: [] };
    }
    /**
     * Approximate Foundry's `Roll.validate` with a parenthesis-balance check, so the interactive
     * safety net can reject a malformed situational bonus (e.g. "oops)" → "1d20 + (oops))",
     * unbalanced) while accepting "1d20 + (2)".
     */
    static validate(formula) {
      if (this?.prototype !== FakeRoll.prototype) return false;
      const text = String(formula);
      const open = (text.match(/\(/g) || []).length;
      const close = (text.match(/\)/g) || []).length;
      return open === close;
    }
  }
  // A trivial `@`-substitution so `resolveCheckFormulaDisplay` returns a string.
  FakeRoll.replaceFormulaData = (formula) => String(formula);
  globalThis.Roll = FakeRoll;
}

let chatCreated = [];
function installChatStub() {
  chatCreated = [];
  globalThis.ChatMessage = {
    create(data) {
      chatCreated.push(data);
      return Promise.resolve({ id: `msg-${chatCreated.length}` });
    },
    getSpeaker({ actor } = {}) {
      return { alias: actor?.name || 'Unknown' };
    },
  };
}

function clearStubs() {
  delete globalThis.Roll;
  delete globalThis.ChatMessage;
  lastRoll = null;
}

const actor = { name: 'Tinker', getRollData: () => ({}) };

// 1. Cancelled prompt

test('evaluateCheckRoll: cancelled prompt returns cancelled and never rolls or posts chat', async () => {
  installRollStub();
  installChatStub();
  try {
    let promptArgs = null;
    const result = await evaluateCheckRoll('1d20 + 5', actor, {
      interactive: true,
      prompt: async (args) => {
        promptArgs = args;
        return { confirmed: false };
      },
      flavor: 'Iron Sword — Crafting check',
      speaker: { alias: 'Tinker' },
      dc: 12,
    });

    assert.equal(result.cancelled, true, 'result is cancelled');
    assert.equal(result.engine, true, 'engine still true');
    assert.equal(result.total, 0);
    assert.deepEqual(result.diceGroups, []);
    assert.equal(lastRoll, null, 'no Roll was constructed/evaluated');
    assert.equal(chatCreated.length, 0, 'no chat message created');
    // The prompt received the DC and label for display.
    assert.equal(promptArgs.dc, 12);
    assert.equal(promptArgs.label, 'Iron Sword — Crafting check');
    assert.equal(promptArgs.formula, '1d20 + 5');
  } finally {
    clearStubs();
  }
});

// 2. Confirmed with situational bonus -> appended + posted to chat

test('evaluateCheckRoll: confirmed prompt appends bonus, rolls, and posts to chat', async () => {
  installRollStub();
  installChatStub();
  try {
    const speaker = { alias: 'Tinker' };
    const result = await evaluateCheckRoll('1d20 + 5', actor, {
      interactive: true,
      prompt: async () => ({ confirmed: true, bonus: '2', rollMode: 'gmroll' }),
      rollMode: 'publicroll',
      flavor: 'Iron Sword — Crafting check',
      speaker,
      dc: 12,
    });

    assert.equal(result.cancelled, undefined, 'not cancelled');
    assert.equal(result.total, 15);
    assert.ok(lastRoll, 'a Roll was constructed');
    assert.equal(lastRoll.formula, '1d20 + 5 + (2)', 'bonus appended to the formula');
    assert.equal(lastRoll.evaluated, true, 'roll evaluated');
    assert.equal(lastRoll.toMessageCalls.length, 1, 'toMessage called exactly once');
    const call = lastRoll.toMessageCalls[0];
    assert.equal(call.messageData.flavor, 'Iron Sword — Crafting check');
    assert.equal(call.messageData.speaker, speaker);
    assert.equal(call.options.rollMode, 'gmroll', 'choice rollMode overrides options rollMode');
    assert.equal(call.options.create, true);
  } finally {
    clearStubs();
  }
});

// 2b. Invalid situational bonus -> roll the BASE formula, never a failure

test('evaluateCheckRoll: an invalid situational bonus is ignored and the base formula is rolled', async () => {
  installRollStub();
  installChatStub();
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args);
  try {
    const result = await evaluateCheckRoll('1d20 + 5', actor, {
      interactive: true,
      // A malformed bonus would make "1d20 + 5 + (oops))" throw in `new Roll`.
      prompt: async () => ({ confirmed: true, bonus: 'oops)' }),
      flavor: 'Crafting check',
    });

    assert.equal(result.cancelled, undefined, 'NOT cancelled — a normal roll happened');
    assert.equal(result.total, 15, 'base formula rolled to a normal total');
    assert.ok(lastRoll, 'a Roll was constructed');
    assert.equal(lastRoll.formula, '1d20 + 5', 'the BASE formula was rolled, not the bad combined one');
    assert.ok(
      warnings.some((w) => String(w[0]).includes('Ignoring invalid situational bonus')),
      'the ignored bonus is warned'
    );
  } finally {
    console.warn = originalWarn;
    clearStubs();
  }
});

test('evaluateCheckRoll: a valid situational bonus appends "+ (2)" to the formula', async () => {
  installRollStub();
  installChatStub();
  try {
    await evaluateCheckRoll('1d20', actor, {
      interactive: true,
      prompt: async () => ({ confirmed: true, bonus: '2' }),
      flavor: 'Crafting check',
    });
    assert.equal(lastRoll.formula, '1d20 + (2)', 'valid bonus appended');
  } finally {
    clearStubs();
  }
});

// Regression, as reported: "Inputting a whole number into situational bonus does not add it to the
// total roll amount.
test('evaluateCheckRoll: a dice situational bonus is appended to the rolled formula', async () => {
  installRollStub();
  installChatStub();
  try {
    for (const bonus of ['2d20', '3d6', '1d4 + 1']) {
      await evaluateCheckRoll('1d20 + 5', actor, {
        interactive: true,
        prompt: async () => ({ confirmed: true, bonus }),
        flavor: 'Crafting check',
      });
      assert.equal(
        lastRoll.formula,
        `1d20 + 5 + (${bonus})`,
        `dice bonus "${bonus}" reaches the rolled formula`
      );
    }
  } finally {
    clearStubs();
  }
});

test('runFormulaPassFail: an invalid bonus rolls the base formula and does not fail (no consumption)', async () => {
  installRollStub();
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const result = await runFormulaPassFail({
      formula: '1d20',
      dc: 10,
      thresholdMode: 'meet',
      triggers: [],
      actor,
      label: 'Crafting',
      rollOptions: {
        interactive: true,
        prompt: async () => ({ confirmed: true, bonus: 'oops)' }),
        dc: 10,
      },
    });

    assert.equal(result.cancelled, undefined, 'not cancelled — no consuming abort');
    assert.equal(result.success, true, 'base total 15 >= dc 10 → pass, not a rolled failure');
    assert.equal(result.value, 15);
    assert.equal(lastRoll.formula, '1d20', 'base formula rolled');
  } finally {
    console.warn = originalWarn;
    clearStubs();
  }
});

// 3. Interactive but no ChatMessage -> still rolls, no throw, no toMessage

test('evaluateCheckRoll: interactive with no ChatMessage rolls without posting to chat', async () => {
  installRollStub();
  // No ChatMessage stub installed.
  delete globalThis.ChatMessage;
  try {
    const result = await evaluateCheckRoll('1d20', actor, {
      interactive: true,
      prompt: async () => ({ confirmed: true }),
      flavor: 'Salvage check',
    });

    assert.equal(result.total, 15, 'roll evaluated');
    assert.ok(lastRoll, 'a Roll was constructed');
    assert.equal(lastRoll.toMessageCalls.length, 0, 'toMessage not called without ChatMessage');
  } finally {
    clearStubs();
  }
});

// 4. Non-interactive default -> no prompt, no chat, original shape

test('evaluateCheckRoll: non-interactive default does not prompt or post chat', async () => {
  installRollStub();
  installChatStub();
  try {
    let promptCalled = false;
    // A prompt is supplied but interactive is falsy: it must not be called.
    const result = await evaluateCheckRoll('1d20', actor, {
      prompt: async () => {
        promptCalled = true;
        return { confirmed: true };
      },
    });

    assert.equal(promptCalled, false, 'prompt not called when not interactive');
    assert.equal(result.engine, true);
    assert.equal(result.total, 15);
    assert.ok(Array.isArray(result.diceGroups));
    assert.ok('resolvedFormula' in result, 'result carries resolvedFormula');
    assert.equal(result.cancelled, undefined);
    assert.ok(lastRoll, 'roll still evaluated');
    assert.equal(lastRoll.toMessageCalls.length, 0, 'no chat post when not interactive');
    assert.equal(chatCreated.length, 0);
  } finally {
    clearStubs();
  }
});

test('evaluatePreparedCheck validates decisions, evaluates without posting, and returns a handoff', async () => {
  installRollStub();
  installChatStub();
  try {
    lastRoll = null;
    const result = await evaluatePreparedCheck(
      {
        formula: '1d20',
        options: {
          flavor: 'Visible check',
          rollMode: 'selfroll',
          modifierChoice: {
            modifiers: [{ id: 'allowed', value: 2, label: 'Allowed' }],
            maxPicks: 1,
          },
        },
        secret: false,
      },
      actor,
      { bonus: '3', advantage: 'advantage', modifierIds: ['unknown', 'allowed'], total: 999 }
    );
    assert.equal(result.total, 15, 'the evaluated total comes from the GM Roll');
    assert.match(lastRoll.formula, /2d20kh1/);
    assert.match(lastRoll.formula, /\+ 2\[Modifiers\]/);
    assert.match(lastRoll.formula, /\+ \(3\)/);
    assert.equal(lastRoll.toMessageCalls.length, 0, 'the GM does not post a visible player roll');
    assert.equal(result.rollHandoff.serializedRoll.total, 15);
    assert.equal(Object.hasOwn(result, 'roll'), false);
  } finally {
    clearStubs();
  }
});

test('evaluatePreparedCheck posts secret checks on the GM and returns no formula-bearing handoff', async () => {
  installRollStub();
  installChatStub();
  try {
    const result = await evaluatePreparedCheck(
      { formula: '1d20 + 7', options: { flavor: 'Secret', rollMode: 'gmroll' }, secret: true },
      actor,
      { bonus: null, modifierIds: [] }
    );
    assert.equal(lastRoll.toMessageCalls.length, 1);
    assert.equal(result.rollHandoff, undefined);
    assert.equal(result.resolvedFormula, null, 'the sanitized result does not disclose the formula');
  } finally {
    clearStubs();
  }
});

const PREPARED_CHECK_ENTRY_POINTS = {
  evaluatePreparedCheck: (options, decision, secret) =>
    evaluatePreparedCheck({ formula: '1d20 + 7', options, secret }, actor, decision),
  evaluatePreparedRunCheck: (options, decision, secret) =>
    evaluatePreparedRunCheck(
      {
        rollFormula: '1d20 + 7',
        flavor: options.flavor,
        speaker: options.speaker,
        decisionPolicy: { dc: 19 },
      },
      actor,
      decision,
      { secret }
    ),
};

for (const [entry, evaluate] of Object.entries(PREPARED_CHECK_ENTRY_POINTS)) {
  for (const secret of [true, false]) {
    test(`${entry}: ${secret ? 'secret privacy wins' : 'entitled public choice survives'} across roll modes`, async () => {
      installRollStub();
      installChatStub();
      const previousGame = globalThis.game;
      const speaker = { actor: 'tinker', alias: actor.name };
      const flavor = 'Hidden Elixir — Crafting check (DC 19)';
      const modes = [undefined, 'publicroll', 'gmroll', 'blindroll', 'selfroll'];
      const decisions = [
        { rollMode: 'publicroll' },
        {
          rollMode: 'publicroll',
          secret: false,
          post: true,
          includeRollHandoff: true,
          formula: '999',
          total: 999,
          flavor: 'Forged',
          speaker: { alias: 'Forged' },
        },
      ];
      // Missing/invalid/private decisions must also have an explicit private floor.
      if (secret) {
        decisions.push(
          {},
          { rollMode: 'invalid' },
          ...modes.slice(2).map((rollMode) => ({ rollMode }))
        );
      }
      try {
        for (const defaultMode of modes) {
          globalThis.game = { settings: { get: () => defaultMode } };
          for (const rollMode of modes) {
            for (const decision of decisions) {
              const context = `${entry}: secret=${secret}, default=${defaultMode}, option=${rollMode}, decision=${decision.rollMode}`;
              const result = await evaluate({ flavor, speaker, rollMode }, decision, secret);
              assert.equal(lastRoll.evaluated, true, context);
              assert.equal(lastRoll.formula, '1d20 + 7', 'client formula is not authoritative');
              assert.deepEqual(lastRoll.data, actor.getRollData(), 'actor roll data is retained');
              if (secret) {
                assert.equal(result.rollHandoff, undefined, context);
                assert.equal(result.resolvedFormula ?? null, null, context);
              } else {
                assert.equal(lastRoll.toMessageCalls.length, 0, 'GM does not post an entitled roll');
                assert.equal(result.rollHandoff.rollMode, 'publicroll', context);
                const posted = await postCheckRollHandoff(result.rollHandoff, {
                  Roll: { fromData: () => lastRoll },
                });
                assert.equal(posted.success, true, context);
              }
              assert.equal(lastRoll.toMessageCalls.length, 1, context);
              const call = lastRoll.toMessageCalls[0];
              assert.equal(call.options.rollMode, secret ? 'gmroll' : 'publicroll', context);
              assert.equal(call.options.create, true, context);
              assert.deepEqual(call.messageData, { speaker, flavor }, context);
            }
          }
        }
      } finally {
        if (previousGame === undefined) delete globalThis.game;
        else globalThis.game = previousGame;
        clearStubs();
      }
    });
  }
}

test('postCheckRollHandoff reconstructs and posts the evaluated roll in the player session', async () => {
  const calls = [];
  class ReconstructedRoll {
    static fromData(data) {
      assert.equal(data.total, 17);
      return new ReconstructedRoll();
    }
    async toMessage(messageData, options) {
      calls.push({ messageData, options });
    }
  }
  const result = await postCheckRollHandoff(
    {
      serializedRoll: { total: 17, terms: [] },
      flavor: 'Player check',
      speaker: { alias: 'Tinker' },
      rollMode: 'selfroll',
    },
    { Roll: ReconstructedRoll }
  );
  assert.equal(result.success, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.rollMode, 'selfroll');
});

const sumUnder = { product: 'sum', direction: 'under', target: { source: 'fixed' } };
const rolledHammer = {
  source: 'tool', label: 'Hammer', form: 'scalar', value: 3,
  preRoll: { expression: '1d4+1', total: 3, serializedRoll: { formula: '1d4+1' } },
};

test('under sum/over a dice-bearing Tool posts its numeric term alone, with no roll evidence', async () => {
  installRollStub();
  installChatStub();
  try {
    const options = {
      interactive: true,
      prompt: async () => ({ confirmed: true }),
      toolContributions: [rolledHammer],
      includeRollHandoff: true,
    };
    const rolled = await evaluateCheckRoll('1d20 + 3[Hammer]', actor, options);
    assert.equal(lastRoll.formula, '1d20 + 3[Hammer]');
    assert.equal(lastRoll.toMessageCalls.length, 1, 'one roll reaches chat through Roll#toMessage');
    assert.equal(chatCreated.length, 0);
    assert.deepEqual(rolled.modifierPlacement.preRolls, []);
    assert.equal(Object.hasOwn(rolled.rollHandoff, 'serializedPreRolls'), false);

    const result = await runFormulaPassFail({
      formula: '1d20 + 3[Hammer]', dc: 10, actor, rollOptions: options,
    });
    assert.equal(Object.hasOwn(result.data, 'preRolls'), false);
  } finally {
    clearStubs();
  }
});

test('a separate Tool die posts in one message with the main roll first', async () => {
  installRollStub();
  installChatStub();
  const posted = [];
  globalThis.Roll.fromData = (data) => ({ formula: data.formula });
  globalThis.ChatMessage.create = async (data, options) => posted.push({ data, options });
  try {
    const result = await evaluateCheckRoll('1d20', actor, {
      evaluation: sumUnder,
      interactive: true,
      prompt: async () => ({ confirmed: true }),
      toolContributions: [rolledHammer],
      flavor: 'Crafting check',
      speaker: { alias: 'Tinker' },
      rollMode: 'blindroll',
      includeRollHandoff: true,
    });
    assert.equal(posted.length, 1);
    assert.deepEqual(posted[0].data.rolls.map((roll) => roll.formula), ['1d20', '1d4+1']);
    assert.deepEqual(
      { ...posted[0].data, rolls: undefined },
      { speaker: { alias: 'Tinker' }, flavor: 'Crafting check', content: '15', rolls: undefined },
      'the bare total leaves Foundry to render every roll for each viewer'
    );
    assert.deepEqual(posted[0].options, { rollMode: 'blindroll' });
    assert.deepEqual(result.rollHandoff.serializedPreRolls, [{ formula: '1d4+1' }]);
  } finally {
    clearStubs();
  }
});

test('a parenthetical pre-roll hands off JSON without its live inner roll or actor data', async () => {
  installRollStub();
  const FakeRoll = globalThis.Roll;
  class Paren {
    constructor(term, roll, root) {
      this.term = term;
      this.roll = roll;
      this.options = {};
      this.root = root;
    }
    toJSON() {
      return { class: 'ParentheticalTerm', options: this.options, evaluated: true, term: this.term,
        roll: this.roll };
    }
  }
  class NestedRoll extends FakeRoll {
    async evaluate() {
      if (this.formula === '(1d4)') {
        const inner = new FakeRoll('1d4', {});
        Object.assign(inner, { _total: 3, _root: this, total: 3 });
        inner.toJSON = () => ({ class: 'Roll', formula: inner.formula, total: inner._total });
        this.total = 3;
        this.terms = [new Paren('1d4', inner, this)];
      }
      return super.evaluate();
    }
    toJSON() {
      return { class: 'Roll', formula: this.formula, total: this.total, terms: this.terms ?? [] };
    }
    static validate() {
      return true;
    }
  }
  globalThis.Roll = NestedRoll;
  try {
    const result = await evaluateCheckRoll('1d20', { getRollData: () => ({ secretStat: 17 }) }, {
      evaluation: sumUnder,
      interactive: true,
      rollDecision: { bonus: '(1d4)' },
      includeRollHandoff: true,
      post: false,
    });
    const text = JSON.stringify(result.rollHandoff.serializedPreRolls);
    const [handoff] = JSON.parse(text);
    assert.equal(handoff.terms[0].roll.class, 'Roll');
    assert.equal(handoff.terms[0].roll.formula, '1d4');
    assert.equal(text.includes('secretStat'), false);
  } finally {
    clearStubs();
  }
});

test('bundled posting resolves omitted client modes on V13 and V14', async () => {
  const previousGame = globalThis.game;
  const previousChat = globalThis.ChatMessage;
  try {
    for (const [modern, setting, expected] of [
      [false, 'gmroll', { rollMode: 'gmroll' }],
      [false, 'blindroll', { rollMode: 'blindroll' }],
      [true, 'gm', { messageMode: 'gm' }],
      [true, 'blind', { messageMode: 'blind' }],
    ]) {
      const reads = [];
      const posted = [];
      globalThis.game = { settings: { get: (...key) => { reads.push(key); return setting; } } };
      globalThis.ChatMessage = {
        ...(modern && { applyMode() {} }),
        create: async (_data, options) => posted.push(options),
      };
      const mainRoll = { render: async () => 'main' };
      await postBundledCheckRoll({ mainRoll, preRolls: [{}] });
      assert.deepEqual(reads, [['core', modern ? 'messageMode' : 'rollMode']]);
      assert.deepEqual(posted, [expected]);
      await postBundledCheckRoll({ mainRoll, preRolls: [{}], rollMode: 'selfroll' });
      assert.deepEqual(posted[1], modern ? { messageMode: 'self' } : { rollMode: 'selfroll' });
      assert.equal(reads.length, 1, 'an explicit mode does not read the client setting');
    }
  } finally {
    if (previousGame === undefined) delete globalThis.game;
    else globalThis.game = previousGame;
    if (previousChat === undefined) delete globalThis.ChatMessage;
    else globalThis.ChatMessage = previousChat;
  }
});

test('a bundled handoff reconstructs all evaluated rolls without rerolling', async () => {
  const previousChat = globalThis.ChatMessage;
  const posted = [];
  globalThis.ChatMessage = { create: async (data) => posted.push(data) };
  const fromDataInputs = [];
  const Roll = {
    fromData(data) {
      fromDataInputs.push(data);
      return { formula: data.formula, total: data.total };
    },
  };
  try {
    const result = await postCheckRollHandoff({
      serializedRoll: { formula: '1d20', total: 17 },
      serializedPreRolls: [{ formula: '1d4', total: 2 }],
      rollMode: 'selfroll',
      speaker: { alias: 'Tinker' },
      flavor: 'Visible check',
    }, { Roll });
    assert.equal(result.success, true);
    assert.deepEqual(posted[0].rolls.map((roll) => roll.formula), ['1d20', '1d4']);
    assert.equal(posted[0].content, '17');
    assert.equal(fromDataInputs.length, 2);
  } finally {
    if (previousChat === undefined) delete globalThis.ChatMessage;
    else globalThis.ChatMessage = previousChat;
  }
});

test('prepared Tool evidence reaches an entitled handoff and stays out of a secret reply', async () => {
  installRollStub();
  installChatStub();
  globalThis.Roll.fromData = (data) => ({ formula: data.formula });
  const toolContributions = [{
    source: 'tool', label: 'Hammer', form: 'scalar', value: 3,
    preRoll: { expression: '1d4', total: 3, serializedRoll: { formula: '1d4' } },
  }];
  const preparation = (secret) => ({
    formula: '1d20', secret, options: { toolContributions, evaluation: sumUnder },
  });
  try {
    const visible = await evaluatePreparedCheck(preparation(false), actor);
    assert.deepEqual(visible.modifierPlacement.preRolls.map(({ source, destination, total }) =>
      ({ source, destination, total })), [{ source: 'tool', destination: 'target', total: 3 }]);
    assert.deepEqual(visible.rollHandoff.serializedPreRolls, [{ formula: '1d4' }]);

    const secret = await evaluatePreparedCheck(preparation(true), actor);
    assert.equal(Object.hasOwn(secret, 'rollHandoff'), false);
    assert.equal(Object.hasOwn(secret, 'modifierPlacement'), false);
    assert.equal(chatCreated.length, 1, 'the GM posts one bundled secret message');
  } finally {
    clearStubs();
  }
});

test('a prepared sum/over run check keeps a rolled Tool as its numeric term alone', async () => {
  installRollStub();
  installChatStub();
  const preparation = {
    rollFormula: '1d20 + 3[Hammer]',
    slot: 'simple',
    checkConfig: { toolContributions: [rolledHammer] },
    decisionPolicy: { dc: 10 },
  };
  try {
    const visible = await evaluatePreparedRunCheck(preparation, actor, {}, { secret: false });
    assert.equal(Object.hasOwn(visible.data, 'preRolls'), false);
    assert.equal(Object.hasOwn(visible.rollHandoff, 'serializedPreRolls'), false);
    await evaluatePreparedRunCheck(preparation, actor, {}, { secret: true });
    assert.equal(chatCreated.length, 0);
    assert.equal(lastRoll.toMessageCalls.length, 1, 'the secret roll posts through Roll#toMessage');
  } finally {
    clearStubs();
  }
});

test('evaluatePreparedCraftingCheck classifies with the GM-retained decision policy', async () => {
  installRollStub();
  try {
    const result = await evaluatePreparedCraftingCheck(
      {
        mode: 'simple',
        slot: 'check',
        rollFormula: '1d20',
        checkConfig: {},
        decisionPolicy: { dc: 16, thresholdMode: 'meet' },
      },
      actor,
      { bonus: null }
    );
    assert.equal(result.engineEvaluated, true);
    assert.equal(result.success, false);
    assert.equal(result.outcome, 'fail');
    assert.equal(result.value, 15);
    assert.equal(result.data.dc, 16);
    assert.equal(Object.hasOwn(result.data, 'formula'), false, 'no blind formula enters the reply result');
  } finally {
    clearStubs();
  }
});

test('evaluateCheckRoll: no options behaves exactly as before (no prompt/chat)', async () => {
  installRollStub();
  installChatStub();
  try {
    const result = await evaluateCheckRoll('1d20', actor);
    assert.equal(result.engine, true);
    assert.equal(result.total, 15);
    assert.equal(result.cancelled, undefined);
    assert.equal(lastRoll.toMessageCalls.length, 0);
    assert.equal(chatCreated.length, 0);
  } finally {
    clearStubs();
  }
});

// 5. Runner-level cancel short-circuit

test('runFormulaPassFail: cancelled roll short-circuits without crit/DC logic', async () => {
  installRollStub();
  installChatStub();
  try {
    const result = await runFormulaPassFail({
      formula: '1d20',
      dc: 15,
      thresholdMode: 'meet',
      triggers: [],
      actor,
      label: 'Crafting',
      rollOptions: {
        interactive: true,
        prompt: async () => ({ confirmed: false }),
        dc: 15,
      },
    });

    assert.equal(result.success, false);
    assert.equal(result.cancelled, true);
    assert.equal(result.outcome, null);
    assert.equal(result.value, null);
    assert.equal(result.data.dc, 15);
    assert.equal(result.data.formula, '1d20');
    assert.equal(lastRoll, null, 'no roll evaluated on cancel');
  } finally {
    clearStubs();
  }
});

test('runFormulaProgressive: cancelled roll short-circuits', async () => {
  installRollStub();
  try {
    const result = await runFormulaProgressive({
      formula: '1d20',
      triggers: [],
      actor,
      label: 'Gathering',
      rollOptions: {
        interactive: true,
        prompt: async () => ({ confirmed: false }),
      },
    });

    assert.equal(result.success, false);
    assert.equal(result.cancelled, true);
    assert.equal(result.value, null);
    assert.equal(result.data.formula, '1d20');
    assert.equal(lastRoll, null);
  } finally {
    clearStubs();
  }
});

test('runFormulaRouted: cancelled roll short-circuits', async () => {
  installRollStub();
  try {
    const result = await runFormulaRouted({
      formula: '1d20',
      dc: 10,
      thresholdMode: 'meet',
      type: 'relative',
      relativeOutcomes: [],
      fixedOutcomes: [],
      triggers: [],
      actor,
      label: 'Salvage',
      rollOptions: {
        interactive: true,
        prompt: async () => ({ confirmed: false }),
        dc: 10,
      },
    });

    assert.equal(result.success, false);
    assert.equal(result.cancelled, true);
    assert.equal(result.outcome, null);
    assert.equal(result.data.type, 'relative');
    assert.equal(lastRoll, null);
  } finally {
    clearStubs();
  }
});

// 6. Non-interactive runner still rolls + returns normal result

test('runFormulaPassFail: non-interactive rollOptions rolls and evaluates normally', async () => {
  installRollStub();
  try {
    const result = await runFormulaPassFail({
      formula: '1d20',
      dc: 10,
      thresholdMode: 'meet',
      triggers: [],
      actor,
      label: 'Crafting',
      rollOptions: { interactive: false, prompt: async () => ({ confirmed: false }) },
    });

    assert.equal(result.cancelled, undefined, 'not cancelled when not interactive');
    assert.equal(result.success, true, 'total 15 >= dc 10');
    assert.ok(lastRoll, 'roll evaluated');
    assert.equal(lastRoll.toMessageCalls.length, 0, 'no chat post when not interactive');
  } finally {
    clearStubs();
  }
});

// 7. Advantage / Disadvantage transform (2d20kh1 / 2d20kl1)

test('evaluateCheckRoll: advantage rewrites a plain d20 to 2d20kh1 (before any bonus)', async () => {
  installRollStub();
  installChatStub();
  try {
    await evaluateCheckRoll('1d20 + 3', actor, {
      interactive: true,
      prompt: async () => ({ confirmed: true, advantage: 'advantage' }),
      flavor: 'Crafting check',
    });
    assert.equal(lastRoll.formula, '2d20kh1 + 3', 'first plain d20 became keep-highest');
  } finally {
    clearStubs();
  }
});

test('evaluateCheckRoll: advantage + situational bonus yields 2d20kh1 ... + (2)', async () => {
  installRollStub();
  installChatStub();
  try {
    await evaluateCheckRoll('1d20', actor, {
      interactive: true,
      prompt: async () => ({ confirmed: true, advantage: 'advantage', bonus: '2' }),
      flavor: 'Crafting check',
    });
    // Advantage transform runs first, then the bonus appends.
    assert.equal(lastRoll.formula, '2d20kh1 + (2)');
  } finally {
    clearStubs();
  }
});

test('evaluateCheckRoll: disadvantage rewrites a plain d20 to 2d20kl1', async () => {
  installRollStub();
  installChatStub();
  try {
    await evaluateCheckRoll('1d20 + 3', actor, {
      interactive: true,
      prompt: async () => ({ confirmed: true, advantage: 'disadvantage' }),
      flavor: 'Crafting check',
    });
    assert.equal(lastRoll.formula, '2d20kl1 + 3');
  } finally {
    clearStubs();
  }
});

test('evaluateCheckRoll: normal disposition leaves the formula unchanged', async () => {
  installRollStub();
  installChatStub();
  try {
    await evaluateCheckRoll('1d20', actor, {
      interactive: true,
      prompt: async () => ({ confirmed: true, advantage: 'normal' }),
      flavor: 'Crafting check',
    });
    assert.equal(lastRoll.formula, '1d20', 'normal keeps the plain d20');
  } finally {
    clearStubs();
  }
});

test('evaluateCheckRoll: advantage is a no-op for a non-d20 formula (defensive)', async () => {
  installRollStub();
  installChatStub();
  try {
    await evaluateCheckRoll('2d6', actor, {
      interactive: true,
      prompt: async () => ({ confirmed: true, advantage: 'advantage' }),
      flavor: 'Crafting check',
    });
    assert.equal(lastRoll.formula, '2d6', 'no plain d20 → advantage transform does nothing');
  } finally {
    clearStubs();
  }
});

// 8. Crit preservation on an advantage (2d20kh1) roll — §3 verification.

function installKeptDieRoll() {
  // A 2d20kh1 pool: the kept die is a natural 20 (active), the dropped die a 5
  // (inactive). Total is the kept face.
  globalThis.Roll = class {
    constructor(formula) {
      this.formula = formula;
      this.total = 20;
      this.dice = [
        {
          number: 2,
          faces: 20,
          total: 20,
          results: [
            { result: 20, active: true },
            { result: 5, active: false },
          ],
        },
      ];
    }
    async evaluate() {
      return this;
    }
  };
}

test('runFormulaPassFail: a nat-20 on the kept advantage die fires a diceGroup crit trigger', async () => {
  installKeptDieRoll();
  try {
    const critTrigger = {
      outcome: 'success',
      condition: { type: 'diceGroup', groupId: 0, aggregate: 'anyDie', operator: '==', value: 20 },
    };

    // DC 25 > the total (20): without the trigger this would FAIL.
    const control = await runFormulaPassFail({
      formula: '2d20kh1',
      dc: 25,
      thresholdMode: 'meet',
      triggers: [],
      actor,
      label: 'Crafting',
    });
    assert.equal(control.success, false, 'control: 20 < DC 25 fails without a crit trigger');

    const forced = await runFormulaPassFail({
      formula: '2d20kh1',
      dc: 25,
      thresholdMode: 'meet',
      triggers: [critTrigger],
      actor,
      label: 'Crafting',
    });
    assert.equal(
      forced.success,
      true,
      'the kept-die nat-20 forces success — active-only face reached the diceGroup trigger'
    );
    assert.equal(forced.value, 20, 'the reported total is the kept-die face');
  } finally {
    delete globalThis.Roll;
  }
});
