import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

import { registerModuleHooks } from '../src/bootstrap/hooks.js';
import { countPromptFields } from '../src/systems/checkRollDecision.js';
import { resolvePool } from '../src/systems/countEvaluation.js';
import {
  COUNT_POLICY_VERSION,
  COUNT_ROLL_CLASS,
  COUNT_ROLL_REFUSALS,
  CountRollRefusal,
  countRollFormula,
  createCountRollClass,
  findCountRoll,
  registerCountRoll,
} from '../src/systems/countRoll.js';

import { promptCheckRoll } from '../src/ui/svelte/apps/crafting/rollPrompt.js';

import { createCoreDice, renderCoreTemplate, TOOLTIP_TEMPLATE } from './helpers/coreDice.js';
import { countEvaluation, deepFreeze } from './helpers/countFixtures.js';
import { createLangBackedI18n } from './helpers/langBackedI18n.js';
import { stubPromptSurface } from './helpers/rollPromptDialogStub.js';
import { repoRoot } from './helpers/sourceScan.js';

const i18n = createLangBackedI18n(repoRoot);

const SETTLED = Object.freeze({ poolDelta: 0, thresholdDelta: 0, preRolls: [] });
const thresholdBenefit = (thresholdDelta) => ({ poolDelta: 0, thresholdDelta, preRolls: [] });

function settledPolicy({
  thresholdMode = 'meet',
  placement = SETTLED,
  rollData = {},
  ...pool
} = {}) {
  const result = resolvePool({
    evaluation: countEvaluation(pool),
    thresholdMode,
    rollData,
    placement,
  });
  assert.equal(result.ok, true, `expected a policy, got ${JSON.stringify(result)}`);
  return result.policy;
}

function countDice({ faces = [] } = {}) {
  const core = createCoreDice({ faces });
  const CountRoll = registerCountRoll({
    config: core.config,
    BaseRoll: core.Roll,
    i18n: () => i18n,
    renderTemplate: async (path, data) => renderCoreTemplate(path, data),
  });
  return { ...core, CountRoll };
}

const explodeRule = (faces, once = false) => ({ enabled: true, faces, once });
const cancelRule = (faces) => ({ enabled: true, faces });
const BEST = Object.freeze({ kind: 'best', value: null });
const WORST = Object.freeze({ kind: 'worst', value: null });

async function assertRefusedBeforeRng(dice, act, { reason, refusedInput }) {
  const drawsBefore = dice.rng.draws;
  await assert.rejects(act, (error) => {
    assert.ok(error instanceof CountRollRefusal, `a count refusal, got ${error}`);
    assert.equal(error.reason, reason);
    assert.equal(error.refusedInput, refusedInput);
    return true;
  });
  assert.equal(dice.rng.draws, drawsBefore, 'no face was drawn');
}

const tooltipTotals = (html) =>
  [...html.matchAll(/class="part-total">([^<]*)</g)].map(([, total]) => total);
const rollItems = (html) => [...html.matchAll(/<li class="roll ([^"]*)">(.*?)<\/li>/g)];

// ---------------------------------------------------------------------------------------------

test('registration appends the count Roll once, extends core Roll and never replaces rolls[0]', () => {
  const { Roll, config } = createCoreDice();
  const SystemRoll = class D20Roll extends Roll {};
  config.Dice.rolls.unshift(SystemRoll);
  const dependencies = {
    config,
    BaseRoll: Roll,
    i18n: () => i18n,
    renderTemplate: renderCoreTemplate,
  };

  const CountRoll = registerCountRoll(dependencies);
  assert.equal(CountRoll.name, COUNT_ROLL_CLASS);
  assert.equal(Object.getPrototypeOf(CountRoll), Roll, 'extends core Roll, not a system subclass');
  assert.equal(config.Dice.rolls[0], SystemRoll, 'the default Roll stays first');
  assert.equal(config.Dice.rolls.length, 3);
  assert.equal(
    registerCountRoll(dependencies),
    CountRoll,
    'a second registration reuses the first'
  );
  assert.equal(config.Dice.rolls.length, 3, 'and appends nothing');
  assert.equal(findCountRoll(config), CountRoll);

  assert.equal(registerCountRoll({ ...dependencies, BaseRoll: undefined }), CountRoll);
  assert.equal(registerCountRoll({ config: { Dice: {} }, BaseRoll: Roll }), null);
  assert.equal(registerCountRoll({ config: { Dice: { rolls: [] } }, BaseRoll: null }), null);
  assert.equal(findCountRoll({}), null);
});

test('the init handler registers the count Roll, wired to game.i18n and renderTemplate', async () => {
  const { Roll, config } = createCoreDice({ faces: [9, 9] });
  const SystemRoll = class D20Roll extends Roll {};
  config.Dice.rolls.unshift(SystemRoll);
  const handlers = new Map();
  const record = (event, handler) => handlers.set(event, handler);
  const rendered = [];
  const renderTemplate = async (path, data) => {
    rendered.push({ path, data });
    return renderCoreTemplate(path, data);
  };
  const previous = {
    Hooks: globalThis.Hooks,
    CONFIG: globalThis.CONFIG,
    foundry: globalThis.foundry,
    game: globalThis.game,
  };
  Object.assign(globalThis, {
    Hooks: { on: record, once: record },
    CONFIG: config,
    foundry: { dice: { Roll }, applications: { handlebars: { renderTemplate } } },
    game: { i18n },
  });
  const originalLog = console.log;
  console.log = () => {};
  try {
    registerModuleHooks({ fabricate: {}, bindFabricateGlobal: () => {} });
    assert.equal(findCountRoll(config), null, 'nothing registers at module scope');
    await handlers.get('init')();
    const CountRoll = findCountRoll(config);
    assert.ok(CountRoll, 'the init handler registered the count Roll');
    assert.equal(Object.getPrototypeOf(CountRoll), Roll, 'over foundry.dice.Roll');
    assert.deepEqual(config.Dice.rolls.slice(0, 2), [SystemRoll, Roll], 'rolls[0] is untouched');
    assert.equal(config.Dice.rolls.length, 3);

    const roll = await CountRoll.fromPolicy(settledPolicy()).evaluate();
    const context = await roll._prepareChatRenderContext({});
    assert.equal(context.formula, '2d10 · each ≥ 8', 'described through game.i18n');
    assert.deepEqual(
      rendered.map(({ path, data }) => [path, data.parts[0].formula]),
      [[TOOLTIP_TEMPLATE, '2d10 · each ≥ 8']],
      'the tooltip went through Foundry renderTemplate'
    );
  } finally {
    console.log = originalLog;
    Object.assign(globalThis, previous);
  }
});

test('the formula is raw NdF plus at most one explosion token with no max-count digit', () => {
  const cases = [
    [{ dice: 3, die: 10, direction: 'over', explode: null }, '3d10'],
    [{ dice: 3, die: 10, direction: 'over', explode: { kind: 'best', once: false } }, '3d10x=10'],
    [{ dice: 3, die: 10, direction: 'under', explode: { kind: 'best', once: false } }, '3d10x=1'],
    [
      { dice: 3, die: 10, direction: 'over', explode: { kind: 'from', value: 9, once: false } },
      '3d10x>=9',
    ],
    [
      { dice: 3, die: 10, direction: 'under', explode: { kind: 'from', value: 2, once: false } },
      '3d10x<=2',
    ],
    [{ dice: 3, die: 10, direction: 'over', explode: { kind: 'best', once: true } }, '3d10xo=10'],
    [
      { dice: 3, die: 10, direction: 'under', explode: { kind: 'from', value: 3, once: true } },
      '3d10xo<=3',
    ],
    [
      { dice: 3, die: 10, direction: 'under', explode: { kind: 'from', value: 12, once: false } },
      '3d10',
    ],
  ];
  const { Roll } = createCoreDice();
  for (const [policy, formula] of cases) {
    assert.equal(countRollFormula(policy), formula);
    assert.doesNotMatch(formula, /xo?\d/, 'a digit after x/xo is a maximum explosion count');
    assert.ok(new Roll(formula).dice[0].modifiers.length <= 1, `${formula} parses to one token`);
  }
});

test('the roll is built with empty roll data and only the numeric replay policy', () => {
  const { CountRoll } = countDice();
  const policy = settledPolicy({
    base: '@skills.survival.value',
    rollData: deepFreeze({ skills: { survival: { value: 5 } } }),
    direction: 'under',
    threshold: '7',
    explode: explodeRule({ kind: 'from', value: 2 }, true),
    cancel: cancelRule(WORST),
  });
  const callerOptions = deepFreeze({ flavor: 'Survival' });
  const roll = CountRoll.fromPolicy({ ...policy, dice: 4 }, callerOptions);
  assert.deepEqual(roll.data, {});
  assert.equal(roll._formula, '4d10xo<=2');
  assert.deepEqual(roll.options, {
    flavor: 'Survival',
    fabricateCount: {
      version: COUNT_POLICY_VERSION,
      direction: 'under',
      comparison: 'meet',
      threshold: 7,
      explode: { kind: 'from', value: 2, once: true },
      cancel: { kind: 'worst', value: null },
    },
  });
  assert.deepEqual(JSON.parse(JSON.stringify(roll.options)), roll.options, 'plain JSON data');
  assert.doesNotMatch(JSON.stringify(roll.options), /@|skills|resolved|base/);
});

test('the reporter check counts one qualified die under 10 and two once the threshold is 12', async () => {
  const dice = countDice({ faces: [11, 15, 8, 11, 15, 8] });
  const policy = settledPolicy({ die: 20, base: '3', threshold: '10', direction: 'under' });
  const roll = await dice.CountRoll.fromPolicy(policy).evaluate();
  assert.equal(roll.total, 1);
  assert.equal(roll.result, '1');
  assert.equal(roll.dice[0].total, 1);
  assert.deepEqual(
    roll.dice[0].results.map(({ result, success, count }) => [result, success, count]),
    [
      [11, false, 0],
      [15, false, 0],
      [8, true, 1],
    ]
  );
  assert.ok(
    roll.dice[0].results.every((result) => !('failure' in result)),
    'no cancel, no failure mark'
  );

  const benefit = settledPolicy({
    die: 20,
    base: '3',
    threshold: '10',
    direction: 'under',
    placement: { poolDelta: 0, thresholdDelta: 2, preRolls: [] },
  });
  assert.equal((await dice.CountRoll.fromPolicy(benefit).evaluate()).total, 2);
});

test('eight d10 explode tens and cancel ones, and a negative net stays negative', async () => {
  // Six d10 base plus a +2 pool benefit rolls eight dice.
  const policy = settledPolicy({
    base: '6',
    threshold: '8',
    explode: explodeRule(BEST),
    cancel: cancelRule(WORST),
    placement: { poolDelta: 2, thresholdDelta: 0, preRolls: [] },
  });
  assert.equal(policy.dice, 8);
  const dice = countDice({ faces: [10, 1, 7, 3, 9, 1, 10, 5, 10, 1, 4] });
  const roll = await dice.CountRoll.fromPolicy(policy).evaluate();
  assert.equal(roll._formula, '8d10x=10');
  // Qualified: 10, 9, 10, and generated 10 → 4; cancelled: 1, 1, and generated 1 → 3.
  assert.equal(roll.total, 1);
  assert.equal(dice.rng.draws, 11, 'two tens exploded, and the generated ten exploded again');
  const projection = roll.countProjection();
  assert.equal(projection.successes, 4);
  assert.equal(projection.cancelled, 3);
  assert.deepEqual(
    projection.results.slice(8).map(({ face, explodedFrom }) => [face, explodedFrom]),
    [
      [10, 0],
      [1, 6],
      [4, 8],
    ],
    'the k-th exploded result produced results[number + k]'
  );

  const botch = countDice({ faces: [1, 1, 1, 2, 3, 4, 5, 6] });
  const negative = await botch.CountRoll.fromPolicy(policy).evaluate();
  assert.equal(negative.total, -3);
  assert.equal(negative.result, '-3', 'never clamped at zero');
});

test('an overlapping face counts zero with both marks and is not styled as a failure (MC2)', async () => {
  const dice = countDice({ faces: [1, 4] });
  const policy = settledPolicy({ die: 6, base: '2', threshold: '1', cancel: cancelRule(WORST) });
  const roll = await dice.CountRoll.fromPolicy(policy).evaluate();
  const [overlap, plain] = roll.dice[0].results;
  assert.deepEqual(
    { success: overlap.success, failure: overlap.failure, count: overlap.count },
    { success: true, failure: true, count: 0 }
  );
  assert.deepEqual({ success: plain.success, count: plain.count }, { success: true, count: 1 });
  assert.equal(roll.total, 1);

  const [[, overlapClasses, overlapLabel], [, plainClasses]] = rollItems(await roll.getTooltip());
  assert.doesNotMatch(overlapClasses, /\b(success|failure)\b/, 'no conflicting class pair');
  assert.match(overlapClasses, /fabricate-count-overlap/);
  assert.match(
    overlapLabel,
    /aria-label="1, qualified and cancelled, so it adds nothing to the net"/
  );
  assert.match(plainClasses, /\bsuccess\b/);
});

test('the overlap label is escaped for its attribute', async () => {
  const core = createCoreDice({ faces: [1] });
  const CountRoll = registerCountRoll({
    config: core.config,
    BaseRoll: core.Roll,
    i18n: () => ({ format: () => 'a "quoted" <label> & more' }),
    renderTemplate: async (path, data) => renderCoreTemplate(path, data),
  });
  const policy = settledPolicy({ die: 6, base: '1', threshold: '1', cancel: cancelRule(WORST) });
  const roll = await CountRoll.fromPolicy(policy).evaluate();
  const [[, , overlapLabel]] = rollItems(await roll.getTooltip());
  assert.match(overlapLabel, /aria-label="a &#34;quoted&#34; &#60;label&#62; &#38; more"/);
});

test('the tooltip stays on core dice.tooltip.hbs even when the game system patches the base Roll', async () => {
  const { Roll, config } = createCoreDice({ faces: [8, 3] });
  // Simulates dnd5e's `init` hook, which sets this directly on core `Roll`, not a subclass.
  Roll.TOOLTIP_TEMPLATE = 'systems/dnd5e/templates/chat/roll-breakdown.hbs';
  const rendered = [];
  const CountRoll = registerCountRoll({
    config,
    BaseRoll: Roll,
    i18n: () => i18n,
    renderTemplate: async (path, data) => {
      rendered.push({ path, data });
      return `<rendered path="${path}">`;
    },
  });

  const roll = await CountRoll.fromPolicy(settledPolicy()).evaluate();
  const html = await roll.getTooltip();

  assert.equal(
    rendered[0].path,
    TOOLTIP_TEMPLATE,
    'ignores the patched static and renders core templates/dice/tooltip.hbs'
  );
  assert.equal(
    rendered[0].data.parts[0].formula,
    '2d10 · each ≥ 8',
    'the tooltip context carries the count description'
  );
  assert.match(html, /templates\/dice\/tooltip\.hbs/);
  assert.equal(
    Roll.TOOLTIP_TEMPLATE,
    'systems/dnd5e/templates/chat/roll-breakdown.hbs',
    "the game system's own patch on the base Roll is untouched, so its ordinary rolls still use it"
  );
});

test('generated dice qualify and cancel, and explode-once explodes originals only', async () => {
  const once = settledPolicy({
    die: 6,
    base: '2',
    threshold: '5',
    explode: explodeRule(BEST, true),
  });
  const dice = countDice({ faces: [6, 2, 6] });
  const roll = await dice.CountRoll.fromPolicy(once).evaluate();
  assert.equal(roll._formula, '2d6xo=6');
  assert.equal(dice.rng.draws, 3, 'the generated six does not explode again');
  assert.equal(roll.total, 2);
  assert.deepEqual(
    roll.countProjection().results.map(({ exploded, explodedFrom }) => [exploded, explodedFrom]),
    [
      [true, null],
      [false, null],
      [false, 0],
    ]
  );
});

test('a missing, later-version or malformed policy refuses before any RNG', async () => {
  const dice = countDice({ faces: [5, 5, 5] });
  const formula = '3d10';
  const valid = {
    version: 1,
    direction: 'over',
    comparison: 'meet',
    threshold: 8,
    explode: null,
    cancel: null,
  };
  const cases = [
    [undefined, 'policy-invalid', 'policy'],
    [{ ...valid, version: 2 }, 'policy-invalid', 'policy'],
    [{ ...valid, direction: 'sideways' }, 'policy-invalid', 'policy'],
    [{ ...valid, threshold: '8' }, 'policy-invalid', 'policy'],
    [{ ...valid, cancel: { kind: 'best', value: null } }, 'policy-invalid', 'policy'],
    [{ ...valid, cancel: { kind: 'from', value: null } }, 'faces-invalid', 'cancel'],
    [{ ...valid, explode: { kind: 'from', value: null, once: false } }, 'faces-invalid', 'explode'],
    [{ ...valid, explode: { kind: 'best', value: null } }, 'policy-invalid', 'policy'],
    // The formula no longer carries the explosion the policy replays.
    [{ ...valid, explode: { kind: 'best', value: null, once: false } }, 'policy-invalid', 'policy'],
  ];
  for (const [fabricateCount, reason, refusedInput] of cases) {
    const roll = new dice.CountRoll(formula, {}, deepFreeze({ fabricateCount }));
    await assertRefusedBeforeRng(dice, () => roll.evaluate(), { reason, refusedInput });
  }
  const summed = new dice.CountRoll('3d10x=10', {}, { fabricateCount: valid });
  await assertRefusedBeforeRng(dice, () => summed.evaluate(), {
    reason: 'policy-invalid',
    refusedInput: 'policy',
  });
  assert.deepEqual(COUNT_ROLL_REFUSALS, ['policy-invalid', 'evaluation-mode-unsupported']);
});

test('pool, die and unbounded-explosion guards refuse before any RNG', async () => {
  const dice = countDice({ faces: [] });
  const policy = settledPolicy({ die: 6, threshold: '5' });
  await assertRefusedBeforeRng(
    dice,
    () => dice.CountRoll.fromPolicy({ ...policy, dice: 1000 }).evaluate(),
    {
      reason: 'pool-too-large',
      refusedInput: 'pool',
    }
  );
  await assertRefusedBeforeRng(
    dice,
    () => dice.CountRoll.fromPolicy({ ...policy, dice: 0 }).evaluate(),
    {
      reason: 'policy-invalid',
      refusedInput: 'pool',
    }
  );
  await assertRefusedBeforeRng(
    dice,
    () => dice.CountRoll.fromPolicy({ ...policy, die: 1 }).evaluate(),
    {
      reason: 'die-invalid',
      refusedInput: 'die',
    }
  );
  const everyFace = { ...policy, explode: { kind: 'from', value: 1, once: false } };
  await assertRefusedBeforeRng(dice, () => dice.CountRoll.fromPolicy(everyFace).evaluate(), {
    reason: 'explode-unbounded',
    refusedInput: 'explode',
  });
});

test('evaluateSync and minimize or maximize refuse before any RNG', async () => {
  const dice = countDice({ faces: [6, 6] });
  const policy = settledPolicy({ die: 6, threshold: '5', explode: explodeRule(BEST) });
  for (const options of [{ minimize: true }, { maximize: true }]) {
    const roll = dice.CountRoll.fromPolicy(policy);
    await assertRefusedBeforeRng(dice, () => roll.evaluate(options), {
      reason: 'evaluation-mode-unsupported',
      refusedInput: 'mode',
    });
    assert.equal(roll._total, undefined);
  }
  const roll = dice.CountRoll.fromPolicy(policy);
  assert.throws(
    () => roll.evaluateSync(),
    (error) => error.reason === 'evaluation-mode-unsupported'
  );
  assert.equal(roll.dice[0].results.length, 0, 'nothing was rolled or maximized');
});

test("Foundry's explosion recursion limit reports explode-unbounded with no total", async () => {
  // Every two explodes, and a one never comes: core throws after 1000 checked results.
  const dice = countDice({ faces: Array.from({ length: 1100 }, () => 2) });
  const policy = settledPolicy({
    die: 2,
    base: '1',
    threshold: '2',
    explode: explodeRule({ kind: 'from', value: 2 }),
  });
  const roll = dice.CountRoll.fromPolicy(policy);
  await assert.rejects(roll.evaluate(), (error) => {
    assert.ok(error instanceof CountRollRefusal);
    assert.equal(error.reason, 'explode-unbounded');
    assert.match(error.cause.message, /Maximum recursion depth/);
    return true;
  });
  assert.equal(roll._total, undefined, 'no main-roll evidence');
});

test('clone and reroll replay the captured policy without mutating the shared options', async () => {
  const dice = countDice({ faces: [9, 2, 10, 3, 9, 1] });
  const policy = settledPolicy({
    die: 10,
    base: '2',
    threshold: '8',
    explode: explodeRule(BEST),
    cancel: cancelRule(WORST),
  });
  const options = deepFreeze(dice.CountRoll.fromPolicy(policy).options);
  const first = await new dice.CountRoll(countRollFormula(policy), {}, options).evaluate();
  assert.equal(first.total, 1, '9 counts, 2 does not');
  const second = await first.reroll();
  assert.ok(second instanceof dice.CountRoll);
  assert.equal(second.options, first.options, 'core clone shares the options object');
  // The originals are 10 and 3, and the 10 explodes into a 9.
  assert.equal(second.total, 2);
  assert.deepEqual(
    second.dice[0].results.map(({ result, count }) => [result, count]),
    [
      [10, 1],
      [3, 0],
      [9, 1],
    ],
    'the reroll is projected'
  );
});

test('render and toMessage on an unevaluated roll take the count path', async () => {
  const dice = countDice({ faces: [9, 2, 9, 9] });
  const policy = settledPolicy({ die: 10, base: '2', threshold: '8' });
  const html = await dice.CountRoll.fromPolicy(policy).render();
  assert.match(html, /<h4 class="dice-total">1<\/h4>/);
  const message = await dice.CountRoll.fromPolicy(policy).toMessage();
  assert.equal(message.content, '2', 'the message content is the net');
});

test('after reload a player sees the count description, tooltip totals equal the net (F10)', async () => {
  const dice = countDice({ faces: [9, 1, 8, 10, 4] });
  const policy = settledPolicy({
    die: 10,
    base: '4',
    threshold: '8',
    explode: explodeRule(BEST),
    cancel: cancelRule(WORST),
  });
  const rolled = await dice.CountRoll.fromPolicy(policy).evaluate();
  const message = await rolled.toMessage();
  const draws = dice.rng.draws;

  const reloaded = dice.reloadMessage(JSON.parse(JSON.stringify(message)));
  assert.equal(dice.rng.draws, draws, 'reconstruction draws no face');
  const [roll] = reloaded.rolls;
  assert.ok(
    roll instanceof dice.CountRoll,
    'reconstructed through CONFIG.Dice.rolls by class name'
  );
  assert.deepEqual(roll.options, rolled.options, 'the replay policy survives');
  assert.equal(roll.total, rolled.total);
  assert.equal(roll.result, rolled.result);
  assert.equal(roll.dice[0].total, rolled.total);
  assert.equal(reloaded.content, String(rolled.total));

  const html = await roll.render();
  const description = '4d10 · each ≥ 8 · explodes on 10 · 1 cancels a success';
  assert.match(html, new RegExp(`<div class="dice-formula">${description}</div>`));
  assert.doesNotMatch(html, /dice-formula">4d10x/, 'the raw formula is not paired with the net');
  assert.deepEqual(tooltipTotals(html), [String(rolled.total)]);
  assert.match(html, new RegExp(`part-formula">${description}<`));
  assert.equal(roll._formula, '4d10x=10', 'the stored formula stays parseable');
  assert.equal(dice.rng.draws, draws, 'rendering an evaluated roll draws nothing');
});

test('a private render hides the description and the tooltip as core does', async () => {
  const dice = countDice({ faces: [9, 9] });
  const roll = await dice.CountRoll.fromPolicy(settledPolicy()).evaluate();
  const html = await roll.render({ isPrivate: true });
  assert.match(html, /dice-formula">\?\?\?</);
  assert.doesNotMatch(html, /each|dice-tooltip/);
});

test('a stored message with a missing or later-version policy still loads, renders and refuses reroll', async () => {
  const dice = countDice({ faces: [9, 2] });
  const rolled = await dice.CountRoll.fromPolicy(settledPolicy()).evaluate();
  for (const fabricateCount of [undefined, { ...rolled.options.fabricateCount, version: 2 }]) {
    const data = JSON.parse(JSON.stringify(rolled));
    data.options = { fabricateCount };
    const reloaded = dice.reloadMessage({ content: '1', rolls: [JSON.stringify(data)] });
    assert.equal(dice.errors.length, 0, 'the roll was not dropped');
    const [roll] = reloaded.rolls;
    assert.equal(roll.total, 1);
    const html = await roll.render();
    assert.match(html, /dice-formula">2d10</, 'the stored faces render under the raw formula');
    assert.match(html, /dice-total">1</);
    await assertRefusedBeforeRng(dice, () => roll.reroll(), {
      reason: 'policy-invalid',
      refusedInput: 'policy',
    });
  }
});

test('with the count Roll unregistered, a message drops the roll and keeps its plain-number content', async () => {
  const dice = countDice({ faces: [9, 9] });
  const message = await dice.CountRoll.fromPolicy(settledPolicy()).toMessage();
  const disabled = createCoreDice();
  const reloaded = disabled.reloadMessage(message);
  assert.deepEqual(reloaded.rolls, []);
  assert.match(disabled.errors[0].message, /Unable to recreate FabricateCountRoll/);
  assert.equal(reloaded.content, '2');
});

test('the description states direction, strictness, a rounded threshold and possible faces', async () => {
  const cases = [
    [{ direction: 'under', thresholdMode: 'exceed', threshold: '7.5' }, '2d10 · each < 7.5'],
    [{ direction: 'over', thresholdMode: 'exceed', threshold: '-1' }, '2d10 · each > -1'],
    [
      {
        direction: 'under',
        threshold: '3',
        explode: explodeRule({ kind: 'from', value: 2 }, true),
        cancel: cancelRule({ kind: 'from', value: 9 }),
      },
      '2d10 · each ≤ 3 · explodes once on ≤ 2 · ≥ 9 cancels a success',
    ],
    [{ threshold: '8', explode: explodeRule({ kind: 'from', value: 12 }) }, '2d10 · each ≥ 8'],
    // A cancel face beyond the die cancels no face under, and every face over.
    [{ direction: 'under', cancel: cancelRule({ kind: 'from', value: 12 }) }, '2d10 · each ≤ 8'],
    [
      { cancel: cancelRule({ kind: 'from', value: 12 }) },
      '2d10 · each ≥ 8 · ≤ 12 cancels a success',
    ],
    [{ threshold: '0', placement: thresholdBenefit(0.1 + 0.2) }, '2d10 · each ≥ 0.3'],
    [{ threshold: '7', placement: thresholdBenefit(1 / 3) }, '2d10 · each ≥ 7.33'],
  ];
  for (const [pool, description] of cases) {
    const dice = countDice({ faces: [5, 5] });
    const roll = await dice.CountRoll.fromPolicy(settledPolicy(pool)).evaluate();
    const context = await roll._prepareChatRenderContext({});
    assert.equal(context.formula, description);
  }
});

test('the minified bundle keeps the serialized class name and reconstructs from data', async () => {
  const { build } = await import('vite');
  const { default: shippedConfig } = await import('../vite.config.js');
  const shipped = shippedConfig({ command: 'build', mode: 'production' }).build;
  const [bundle] = [
    await build({
      configFile: false,
      logLevel: 'silent',
      build: {
        write: false,
        minify: shipped.minify,
        lib: {
          entry: resolve(repoRoot, 'src/systems/countRoll.js'),
          formats: ['es'],
          fileName: 'countRoll',
        },
        rollupOptions: { output: { minify: shipped.rollupOptions.output.minify } },
      },
    }),
  ].flat();
  const code = bundle.output.find((chunk) => chunk.type === 'chunk').code;
  const built = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

  const dice = createCoreDice({ faces: [9, 2] });
  const renderTemplate = async (path, data) => renderCoreTemplate(path, data);
  const CountRoll = built.registerCountRoll({
    config: dice.config,
    BaseRoll: dice.Roll,
    i18n: () => i18n,
    renderTemplate,
  });
  assert.equal(CountRoll.name, COUNT_ROLL_CLASS);
  const rolled = await CountRoll.fromPolicy(settledPolicy()).evaluate();
  const [roll] = dice.reloadMessage(await rolled.toMessage()).rolls;
  assert.ok(roll instanceof CountRoll);
  assert.equal(roll.total, 1);
  assert.deepEqual(tooltipTotals(await roll.getTooltip()), ['1']);
  assert.equal(createCountRollClass({ BaseRoll: dice.Roll }).name, COUNT_ROLL_CLASS);
});

test("the roll prompt's rule line names the same face rules as the chat card", async () => {
  // Past the leading pool clauses: the card's `2d10 · each ≥ 8`, the prompt's `Success on ≥ 8`.
  const faceRules = (text, lead) =>
    text
      .split(' · ')
      .slice(lead)
      .map((clause) => [
        /explode/.test(clause) ? 'explode' : 'cancel',
        /once/.test(clause),
        /[≥≤] \d+/.exec(clause)?.[0] ?? 'extreme',
      ]);
  const cases = [
    { explode: explodeRule(BEST), cancel: cancelRule(WORST) },
    { explode: explodeRule({ kind: 'from', value: 9 }, true), cancel: cancelRule({ kind: 'from', value: 2 }) },
    { explode: explodeRule({ kind: 'from', value: 12 }), cancel: cancelRule({ kind: 'from', value: 12 }) },
    { direction: 'under', threshold: '5', explode: explodeRule(BEST), cancel: cancelRule({ kind: 'from', value: 12 }) },
    { direction: 'under', threshold: '5', explode: explodeRule({ kind: 'from', value: 3 }), cancel: cancelRule({ kind: 'from', value: 8 }) },
  ];
  const surface = stubPromptSurface(() => null);
  try {
    for (const pool of cases) {
      const policy = settledPolicy({ die: 10, base: '2', ...pool });
      const dice = countDice({ faces: [5, 5] });
      const html = await (await dice.CountRoll.fromPolicy(policy).evaluate()).render();
      const card = /dice-formula">([^<]*)</.exec(html)[1];
      await promptCheckRoll(countPromptFields(countEvaluation(pool), policy, 1));
      const label = JSON.stringify(pool);
      assert.deepEqual(faceRules(surface.view.labels.formulaNote, 1), faceRules(card, 2), label);
    }
  } finally {
    surface.restore();
  }
  assert.equal(surface.views.length, cases.length);
});
