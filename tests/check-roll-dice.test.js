/**
 * Unit tests for the interactive check-roll seam (issue: interactive roll prompt).
 *
 * Covers `evaluateCheckRoll`'s optional interactive behaviour and the runner-level
 * cancel short-circuit:
 *  1. Interactive + prompt returns {confirmed:false} -> cancelled, no Roll, no toMessage.
 *  2. Interactive + {confirmed:true, bonus} -> bonus appended, rolled, toMessage posted.
 *  3. Interactive but no ChatMessage -> rolled, no throw, no toMessage.
 *  4. Non-interactive (default) -> no prompt, no toMessage, original result shape.
 *  5. Runner-level cancel short-circuit (passFail/progressive/routed).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluateCheckRoll,
  runFormulaPassFail,
  runFormulaProgressive,
  runFormulaRouted,
} from '../src/systems/checkRoll.js';

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------

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
  }
  // A trivial `@`-substitution so `resolveCheckFormulaDisplay` returns a string.
  FakeRoll.replaceFormulaData = (formula) => String(formula);
  // Approximate Foundry's `Roll.validate` with a parenthesis-balance check so the
  // interactive safety net can reject a malformed situational bonus (e.g. "oops)"
  // → "1d20 + (oops))", unbalanced) while accepting "1d20 + (2)".
  FakeRoll.validate = (formula) => {
    const text = String(formula);
    const open = (text.match(/\(/g) || []).length;
    const close = (text.match(/\)/g) || []).length;
    return open === close;
  };
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

// ---------------------------------------------------------------------------
// 1. Cancelled prompt
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// 2. Confirmed with situational bonus -> appended + posted to chat
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// 2b. Invalid situational bonus -> roll the BASE formula, never a failure
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// 3. Interactive but no ChatMessage -> still rolls, no throw, no toMessage
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// 4. Non-interactive default -> no prompt, no chat, original shape
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// 5. Runner-level cancel short-circuit
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// 6. Non-interactive runner still rolls + returns normal result
// ---------------------------------------------------------------------------

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
