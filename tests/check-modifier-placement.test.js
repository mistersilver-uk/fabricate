import test from 'node:test';
import assert from 'node:assert/strict';

import {
  planModifierPlacement,
  SUM_OVER_EVALUATION,
} from '../src/systems/checkModifierRouter.js';
import { resolveModifierPreRolls } from '../src/systems/checkModifierRolls.js';
import { resolveCheckDecision } from '../src/systems/checkRollDecision.js';
import {
  evaluateCheckRoll,
  runFormulaPassFail,
  runFormulaProgressive,
  runFormulaRouted,
} from '../src/systems/checkRoll.js';
import { CraftingEngine } from '../src/systems/CraftingEngine.js';

const evaluation = {
  product: 'sum',
  direction: 'under',
  target: { source: 'fixed' },
};

test('the decision seam bounds deferred picks and preserves an explicit empty choice', async () => {
  const modifierChoice = {
    maxPicks: 1,
    defaultSelectedIds: ['flat'],
    modifiers: [
      { id: 'flat', label: 'Flat', value: 3 },
      { id: 'rune', label: 'Rune', formula: '(1d4)' },
    ],
  };
  const displayFormula = (formula) => ({ display: formula });
  const input = {
    authoredFormula: '1d20', actor: null, evaluation, deferred: true, Roll: null,
    resolvedCheck: { formula: '1d20', selected: [] }, displayFormula,
  };
  const capped = await resolveCheckDecision({
    ...input,
    options: {
      interactive: true, modifierChoice, flavor: 'Craft',
      rollDecision: { chosenModifierIds: ['rune', 'flat'] },
    },
  });
  assert.equal(capped.formula, '1d20');
  assert.equal(capped.flavor, 'Craft · Flat');
  assert.equal(capped.placementPlan.targetDelta, 3);
  assert.deepEqual(capped.placementPlan.preRolls, []);

  const empty = await resolveCheckDecision({
    ...input,
    options: {
      interactive: true, modifierChoice,
      rollDecision: { chosenModifierIds: [] },
    },
  });
  assert.equal(empty.placementPlan.targetDelta, 0);
  assert.deepEqual(empty.placementPlan.preRolls, []);
});

test('pre-rolls evaluate once in placement order and leave the main roll untouched', async () => {
  const calls = [];
  class FakeRoll {
    constructor(formula, data) {
      calls.push({ formula, data });
      this.formula = formula;
      this.total = formula === '1d4' ? 2 : 3;
    }
    async evaluate(options) {
      assert.deepEqual(options, { allowInteractive: false });
      return this;
    }
    toJSON() {
      return { formula: this.formula, total: this.total };
    }
  }
  const plan = planModifierPlacement({
    evaluation,
    contributions: [
      { source: 'situational', label: 'Weather', form: 'expression', expression: '1d6' },
      { source: 'library', label: 'Rune', form: 'expression', expression: '1d4' },
    ],
  });
  const data = { skill: 2 };
  const result = await resolveModifierPreRolls(plan, { Roll: FakeRoll, rollData: data });
  assert.deepEqual(calls, [{ formula: '1d4', data }, { formula: '1d6', data }]);
  assert.equal(result.placement.targetDelta, 5);
  assert.deepEqual(result.placement.preRolls.map((entry) => entry.index), [1, 0]);
  assert.deepEqual(result.rolls.map((roll) => roll.formula), ['1d4', '1d6']);
  assert.equal(plan.targetDelta, 0);
  assert.ok(plan.preRolls.every((entry) => !Object.hasOwn(entry, 'total')));
});

test('an already rolled tool contributes once and its serialized roll is reconstructed', async () => {
  let constructed = 0;
  class FakeRoll {
    constructor() {
      constructed += 1;
    }
    static fromData(data) {
      assert.equal(data.formula, '1d4+1');
      return { formula: data.formula };
    }
  }
  const plan = planModifierPlacement({
    evaluation,
    contributions: [{
      source: 'tool', label: 'Hammer', form: 'scalar', value: 4,
      preRoll: { expression: '1d4+1', total: 4, serializedRoll: { formula: '1d4+1' } },
    }],
  });
  const result = await resolveModifierPreRolls(plan, { Roll: FakeRoll });
  assert.equal(constructed, 0);
  assert.equal(result.placement.targetDelta, 4);
  assert.deepEqual(result.rolls.map((roll) => roll.formula), ['1d4+1']);
});

test('a Tool reconstruction failure aborts before the main roll and message', async () => {
  const previousRoll = globalThis.Roll;
  const previousChat = globalThis.ChatMessage;
  let mainRolls = 0;
  let messages = 0;
  class FakeRoll {
    constructor() { mainRolls += 1; }
    async evaluate() { return this; }
    static fromData() { throw new Error('tool reconstruction failed'); }
    static replaceFormulaData(formula) { return formula; }
    static validate() { return true; }
  }
  globalThis.Roll = FakeRoll;
  globalThis.ChatMessage = { create: async () => { messages += 1; } };
  try {
    await assert.rejects(evaluateCheckRoll('1d20', null, {
      evaluation,
      interactive: true,
      toolContributions: [{
        source: 'tool', label: 'Hammer', form: 'scalar', value: 3,
        preRoll: { expression: '1d4', total: 3, serializedRoll: { formula: '1d4' } },
      }],
    }), /tool reconstruction failed/);
    assert.equal(mainRolls, 0);
    assert.equal(messages, 0);
  } finally {
    if (previousRoll === undefined) delete globalThis.Roll;
    else globalThis.Roll = previousRoll;
    if (previousChat === undefined) delete globalThis.ChatMessage;
    else globalThis.ChatMessage = previousChat;
  }
});

test('Tool roll serialization failure aborts collection while expression failure still pays zero', async () => {
  const previousRoll = globalThis.Roll;
  let evaluations = 0;
  class FakeRoll {
    constructor(formula) { this.formula = formula; this.total = 3; this.dice = [{}]; }
    async evaluate() {
      evaluations += 1;
      if (this.formula === 'bad') throw new Error('invalid expression');
      return this;
    }
    toJSON() { throw new Error('tool serialization failed'); }
  }
  globalThis.Roll = FakeRoll;
  const engine = Object.create(CraftingEngine.prototype);
  const item = (expression) => ({ contributionInput: {
    tool: { id: expression, bonus: { enabled: true, expression } },
    primaryActor: { getRollData: () => ({}) },
  } });
  try {
    const invalid = await engine._prepareToolCheckBonuses('1d20', [item('bad')]);
    assert.deepEqual(invalid.contributions.map(({ value }) => value), [0]);
    await assert.rejects(engine._prepareToolCheckBonuses('1d20', [item('1d4')]),
      (error) => error.message === 'Tool roll evidence could not be serialized' &&
        error.cause?.message === 'tool serialization failed');
    assert.equal(evaluations, 2);
  } finally {
    if (previousRoll === undefined) delete globalThis.Roll;
    else globalThis.Roll = previousRoll;
  }
});

test('a failed library pre-roll rejects before the check roll can be created', async () => {
  class ThrowingRoll {
    async evaluate() {
      throw new Error('library dice failed');
    }
  }
  const plan = planModifierPlacement({
    evaluation,
    contributions: [{ source: 'library', label: 'Rune', form: 'expression', expression: '1d4' }],
  });
  await assert.rejects(resolveModifierPreRolls(plan, { Roll: ThrowingRoll }), /library dice failed/);
});

test('a failed situational pre-roll contributes zero without fabricating roll evidence', async () => {
  class ThrowingRoll {
    async evaluate() {
      throw new Error('invalid situation');
    }
  }
  const plan = planModifierPlacement({
    evaluation,
    contributions: [{ source: 'situational', label: 'Weather', form: 'expression', expression: 'bad' }],
  });
  const result = await resolveModifierPreRolls(plan, { Roll: ThrowingRoll });
  assert.equal(result.placement.targetDelta, 0);
  assert.deepEqual(result.placement.preRolls, []);
  assert.deepEqual(result.rolls, []);
});

test('sum/under keeps library and situational dice outside the authored check', async () => {
  const previousRoll = globalThis.Roll;
  const previousChat = globalThis.ChatMessage;
  const evaluated = [];
  let messages = 0;
  class FakeRoll {
    constructor(formula) {
      this.formula = formula;
      this.total = formula === '1d20' ? 10 : 2;
      this.dice = formula === '1d20'
        ? [{ number: 1, faces: 20, total: 10, results: [{ result: 10 }] }]
        : [{ number: 1, faces: 4, total: 2, results: [{ result: 2 }] }];
    }
    evaluateSync() {
      return this;
    }
    async evaluate(options) {
      assert.deepEqual(options, { allowInteractive: false });
      evaluated.push(this.formula);
      return this;
    }
    toJSON() {
      return { formula: this.formula, total: this.total };
    }
    static validate() {
      return true;
    }
    static replaceFormulaData(formula) {
      return formula;
    }
  }
  globalThis.Roll = FakeRoll;
  globalThis.ChatMessage = { create: async () => { messages += 1; } };
  try {
    const result = await evaluateCheckRoll('1d20', { getRollData: () => ({}) }, {
      evaluation,
      craftingModifier: {
        catalogue: [{ id: 'rune', label: 'Rune', expression: '1d4' }],
        systemPolicy: 'addAll',
        defaultModifierIds: ['rune'],
      },
      interactive: true,
      prompt: async () => ({ confirmed: true, bonus: '3', rollMode: 'selfroll' }),
      post: false,
    });
    assert.deepEqual(evaluated, ['(1d4)', '1d20']);
    assert.equal(result.total, 10);
    assert.equal(result.modifierPlacement.targetDelta, 5);
    assert.equal(result.modifierPlacement.preRolls.length, 1);
    assert.deepEqual(result.diceGroups, [{ groupId: 0, group: '1d20', sum: 10, results: [10] }]);
    assert.equal(messages, 0);
  } finally {
    if (previousRoll === undefined) delete globalThis.Roll;
    else globalThis.Roll = previousRoll;
    if (previousChat === undefined) delete globalThis.ChatMessage;
    else globalThis.ChatMessage = previousChat;
  }
});

test('CraftingEngine retains a dice-bearing Tool bonus without appending it for sum/under', async () => {
  const previousRoll = globalThis.Roll;
  let evaluations = 0;
  class ToolRoll {
    constructor(formula) {
      this.formula = formula;
      this.total = 3;
      this.dice = [{ number: 1, faces: 4 }];
    }
    async evaluate() {
      evaluations += 1;
      return this;
    }
    toJSON() {
      return { formula: this.formula, total: this.total };
    }
  }
  globalThis.Roll = ToolRoll;
  try {
    const engine = Object.create(CraftingEngine.prototype);
    const result = await engine._prepareToolCheckBonuses('1d20', [{
      contributionInput: {
        tool: { id: 'hammer', label: 'Hammer', bonus: { enabled: true, expression: '1d4' } },
        primaryActor: { getRollData: () => ({}) },
      },
    }], evaluation);
    assert.equal(result.formula, '1d20');
    assert.equal(result.evaluation, evaluation);
    assert.equal(evaluations, 1);
    assert.deepEqual(result.contributions, [{
      source: 'tool', label: 'Hammer', form: 'scalar', value: 3,
      preRoll: { expression: '1d4', total: 3, serializedRoll: { formula: '1d4', total: 3 } },
    }]);
  } finally {
    if (previousRoll === undefined) delete globalThis.Roll;
    else globalThis.Roll = previousRoll;
  }
});

test('a valid library pre-roll failure aborts the real runner before its main roll or message', async () => {
  const previousRoll = globalThis.Roll;
  const previousChat = globalThis.ChatMessage;
  let mainRolls = 0;
  let messages = 0;
  class FakeRoll {
    constructor(formula) {
      this.formula = formula;
      this.total = 2;
    }
    evaluateSync() {
      return this;
    }
    async evaluate() {
      if (this.formula === '(1d4)') throw new Error('library evaluation failed');
      mainRolls += 1;
      return this;
    }
    static replaceFormulaData(formula) {
      return formula;
    }
    static validate() {
      return true;
    }
  }
  globalThis.Roll = FakeRoll;
  globalThis.ChatMessage = { create: async () => { messages += 1; } };
  const originalError = console.error;
  console.error = () => {};
  try {
    const result = await runFormulaPassFail({
      formula: '1d20', dc: 10, actor: { getRollData: () => ({}) },
      craftingModifier: {
        catalogue: [{ id: 'rune', label: 'Rune', expression: '1d4' }],
        systemPolicy: 'addAll', defaultModifierIds: ['rune'],
      },
      rollOptions: { evaluation, interactive: true, prompt: async () => ({ confirmed: true }) },
    });
    assert.equal(result.success, false);
    assert.match(result.message, /library evaluation failed/);
    assert.equal(mainRolls, 0);
    assert.equal(messages, 0);
    assert.equal(Object.hasOwn(result.data, 'preRolls'), false);
  } finally {
    console.error = originalError;
    if (previousRoll === undefined) delete globalThis.Roll;
    else globalThis.Roll = previousRoll;
    if (previousChat === undefined) delete globalThis.ChatMessage;
    else globalThis.ChatMessage = previousChat;
  }
});

test('count advantage changes the pool even when other benefits target the threshold', async () => {
  const previousRoll = globalThis.Roll;
  class FakeRoll {
    constructor(formula) {
      this.formula = formula;
      this.total = 4;
      this.dice = [];
    }
    async evaluate() {
      return this;
    }
    static validate() {
      return true;
    }
    static replaceFormulaData(formula) {
      return formula;
    }
  }
  globalThis.Roll = FakeRoll;
  try {
    const result = await evaluateCheckRoll('2d10', { getRollData: () => ({}) }, {
      evaluation: { product: 'count', direction: 'over', pool: { modifierDestination: 'threshold' } },
      interactive: true,
      prompt: async () => ({ confirmed: true, bonus: '2', advantage: 'advantage' }),
      post: false,
    });
    assert.equal(result.modifierPlacement.poolDelta, 1);
    assert.equal(result.modifierPlacement.thresholdDelta, -2);
    assert.equal(result.resolvedFormula, '2d10');
  } finally {
    if (previousRoll === undefined) delete globalThis.Roll;
    else globalThis.Roll = previousRoll;
  }
});

/** Installs a Roll whose `1d4` totals 3 and whose other formulas total 12, recording each roll
 *  and each chat post; the returned function restores the previous globals. */
function installEngineRolls(rolls, messages) {
  const previousRoll = globalThis.Roll;
  const previousChat = globalThis.ChatMessage;
  class EngineRoll {
    constructor(formula) {
      this.formula = formula;
      this.total = formula === '1d4' ? 3 : 12;
      this.dice = [{ number: 1, faces: 4, total: this.total, results: [{ result: this.total }] }];
      rolls.push(formula);
    }
    async evaluate() { return this; }
    evaluateSync() { return this; }
    toJSON() { return { class: 'Roll', formula: this.formula, total: this.total }; }
    async toMessage() { messages.push([this.formula]); }
    static fromData(data) { return { formula: data.formula, total: data.total }; }
    static validate() { return true; }
    static replaceFormulaData(formula) { return formula; }
  }
  globalThis.Roll = EngineRoll;
  globalThis.ChatMessage = {
    create: async (data) => { messages.push(data.rolls.map((roll) => roll.formula)); },
    getSpeaker: () => ({ alias: 'Tinker' }),
  };
  return () => {
    if (previousRoll === undefined) delete globalThis.Roll;
    else globalThis.Roll = previousRoll;
    if (previousChat === undefined) delete globalThis.ChatMessage;
    else globalThis.ChatMessage = previousChat;
  };
}

const hammer = {
  contributionInput: {
    tool: { id: 'hammer', label: 'Hammer', bonus: { enabled: true, expression: '1d4' } },
    primaryActor: { getRollData: () => ({}) },
  },
};
const craftingSystem = {
  craftingCheck: {
    simple: { rollFormula: '1d20' },
    routed: { rollFormula: '1d20', type: 'relative', relativeOutcomes: [] },
    progressive: { rollFormula: '1d20' },
  },
};
const engineRunners = {
  craftingPassFail: (engine, toolItems) =>
    engine._runSimpleCheck(craftingSystem, { name: 'Recipe' }, null, {}, { toolItems }),
  craftingRouted: (engine, toolItems) =>
    engine._runRoutedCheck(craftingSystem, { name: 'Recipe' }, null, {}, { toolItems }),
  craftingProgressive: (engine, toolItems) =>
    engine._runProgressiveCheck(craftingSystem, { name: 'Recipe' }, {}, { toolItems }),
  salvageSimple: (engine, toolItems) =>
    engine._runSalvageSimpleCheck({ rollFormula: '1d20', dc: 10 }, { name: 'Scrap' }, {}, {
      interactive: true, toolItems, rollDecision: { bonus: null },
    }),
  salvageRouted: (engine, toolItems) =>
    engine._runSalvageRoutedCheck(
      { rollFormula: '1d20', dc: 10, type: 'relative', relativeOutcomes: [] },
      { name: 'Scrap' }, {}, { interactive: true, toolItems, rollDecision: { bonus: null } }
    ),
  salvageProgressive: (engine, toolItems) =>
    engine._runSalvageProgressiveCheck({ rollFormula: '1d20' }, { name: 'Scrap' }, {}, {
      interactive: true, toolItems, rollDecision: { bonus: null },
    }),
};

for (const [name, run] of Object.entries(engineRunners)) {
  const interactive = name.startsWith('salvage');
  test(`${name}: a dice-bearing Tool keeps its sum/over term and routes its evidence elsewhere`, async () => {
    const rolls = [];
    const messages = [];
    const restore = installEngineRolls(rolls, messages);
    try {
      const engine = Object.create(CraftingEngine.prototype);
      engine._resolveSimpleCheckDc = async () => 10;
      const appended = await run(engine, [hammer]);
      assert.deepEqual(rolls, ['1d4', '1d20 + 3[Hammer]']);
      assert.equal(Object.hasOwn(appended.data, 'preRolls'), false);
      assert.deepEqual(messages, interactive ? [['1d20 + 3[Hammer]']] : []);

      rolls.length = 0;
      messages.length = 0;
      const prepare = CraftingEngine.prototype._prepareToolCheckBonuses;
      engine._prepareToolCheckBonuses = function prepareUnder(formula, tools) {
        return prepare.call(this, formula, tools, evaluation);
      };
      const routed = await run(engine, [hammer]);
      assert.deepEqual(rolls, ['1d4', '1d20']);
      assert.deepEqual(routed.data.preRolls, [
        { source: 'tool', label: 'Hammer', expression: '1d4', total: 3, destination: 'target' },
      ]);
      assert.deepEqual(messages, interactive ? [['1d20', '1d4']] : []);
    } finally {
      restore();
    }
  });
}

const runeModifier = {
  catalogue: [{ id: 'rune', label: 'Rune', expression: '1d4' }],
  systemPolicy: 'addAll',
  defaultModifierIds: ['rune'],
};
const formulaRunners = {
  runFormulaPassFail: (input) => runFormulaPassFail({ ...input, dc: 10 }),
  runFormulaProgressive,
  runFormulaRouted: (input) =>
    runFormulaRouted({ ...input, dc: 10, type: 'relative', relativeOutcomes: [] }),
};

for (const [name, runner] of Object.entries(formulaRunners)) {
  test(`${name} reports a sum/under library pre-roll as executed evidence`, async () => {
    const previousRoll = globalThis.Roll;
    class FakeRoll {
      constructor(formula) {
        this.formula = formula;
        this.total = formula === '(1d4)' ? 2 : 9;
        this.dice = [];
      }
      evaluateSync() { return this; }
      async evaluate() { return this; }
      static replaceFormulaData(formula) { return formula; }
      static validate() { return true; }
    }
    globalThis.Roll = FakeRoll;
    try {
      const result = await runner({
        formula: '1d20',
        actor: { getRollData: () => ({}) },
        craftingModifier: runeModifier,
        rollOptions: {
          evaluation, interactive: true, prompt: async () => ({ confirmed: true }), post: false,
        },
      });
      assert.deepEqual(result.data.preRolls, [
        { source: 'library', label: 'Rune', expression: '(1d4)', total: 2, destination: 'target' },
      ]);
    } finally {
      if (previousRoll === undefined) delete globalThis.Roll;
      else globalThis.Roll = previousRoll;
    }
  });
}

test('keep-one advantage keeps the lowest die when the sum must come in under its target', async () => {
  const decide = async (advantage, direction) =>
    (await resolveCheckDecision({
      authoredFormula: '1d20', actor: null, deferred: false, Roll: null,
      evaluation: { ...evaluation, direction },
      resolvedCheck: { formula: '1d20 + 2[Modifiers]', selected: [] },
      displayFormula: (formula) => ({ display: formula }),
      options: { interactive: true, rollDecision: { advantage } },
    })).formula;
  assert.equal(await decide('advantage', 'under'), '2d20kl1 + 2[Modifiers]');
  assert.equal(await decide('disadvantage', 'under'), '2d20kh1 + 2[Modifiers]');
  assert.equal(await decide('advantage', 'over'), '2d20kh1 + 2[Modifiers]');
  assert.equal(await decide('disadvantage', 'over'), '2d20kl1 + 2[Modifiers]');
});

test('a malformed deferred descriptor coerces flat values and drops blank fragments', async () => {
  const decide = async (modifiers) =>
    (await resolveCheckDecision({
      authoredFormula: '1d20', actor: null, deferred: true, Roll: null,
      evaluation: SUM_OVER_EVALUATION,
      resolvedCheck: { formula: '1d20', selected: [] },
      displayFormula: (formula) => ({ display: formula }),
      options: {
        interactive: true,
        modifierChoice: { maxPicks: 2, modifiers },
        rollDecision: { chosenModifierIds: ['a', 'b'] },
      },
    })).formula;
  const b = { id: 'b', label: 'B', value: 1 };
  assert.equal(await decide([{ id: 'a', label: 'A', value: '2' }, b]), '1d20 + 3[Modifiers]');
  assert.equal(await decide([{ id: 'a', label: 'A', value: Number.NaN }, b]), '1d20 + 1[Modifiers]');
  assert.equal(await decide([{ id: 'a', label: 'A', formula: '  ' }, b]), '1d20 + 1[Modifiers]');
});
