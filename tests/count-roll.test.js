import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

import { registerModuleHooks } from '../src/bootstrap/hooks.js';
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

import { createLangBackedI18n } from './helpers/langBackedI18n.js';
import { repoRoot } from './helpers/sourceScan.js';

const i18n = createLangBackedI18n(repoRoot);
const CHAT_TEMPLATE = 'templates/dice/roll.hbs';
const TOOLTIP_TEMPLATE = 'templates/dice/tooltip.hbs';

// ---------------------------------------------------------------------------------------------
// A double of core `foundry.dice.Roll` and `Die` (V13.351 = V14.367 for every method used here):
// scripted faces stand in for the RNG, and the rest follows `client/dice/roll.mjs`,
// `terms/dice.mjs`, `terms/die.mjs`, `ChatMessage#prepareDerivedData` and the two templates.
// ---------------------------------------------------------------------------------------------

const MODIFIER_REGEXP = /([A-z]+)([^A-z\s()+\-*/]*)/g;

function compareResult(result, comparison = '=', target) {
  if (comparison === '=' || comparison === '==') return result === target;
  if (comparison === '<') return result < target;
  if (comparison === '<=') return result <= target;
  if (comparison === '>') return result > target;
  if (comparison === '>=') return result >= target;
  return false;
}

const escapeText = (value) =>
  String(value ?? '').replace(
    /[&<>"'`=]/g,
    (character) => `&#x${character.charCodeAt(0).toString(16).toUpperCase()};`
  );

function renderCoreTemplate(path, data) {
  if (path === TOOLTIP_TEMPLATE) {
    if (!data.parts.length) return '';
    const parts = data.parts.map((part) => {
      const rolls = part.rolls.map(
        (roll) => `<li class="roll ${escapeText(roll.classes)}">${roll.result}</li>`
      );
      return (
        `<section class="tooltip-part"><header class="part-header">` +
        `<span class="part-formula">${escapeText(part.formula)}</span>` +
        `<span class="part-total">${escapeText(part.total)}</span></header>` +
        `<ol class="dice-rolls">${rolls.join('')}</ol></section>`
      );
    });
    return `<div class="dice-tooltip">${parts.join('')}</div>`;
  }
  assert.equal(path, CHAT_TEMPLATE, `an unknown template ${path}`);
  return (
    `<div class="dice-roll"><div class="dice-formula">${escapeText(data.formula)}</div>` +
    `${data.tooltip}<h4 class="dice-total">${escapeText(data.total)}</h4></div>`
  );
}

function createCoreDice({ faces = [] } = {}) {
  const rng = { queue: [...faces], draws: 0 };
  const config = { Dice: { rolls: [] } };
  const errors = [];

  function randomFace() {
    rng.draws += 1;
    if (rng.queue.length === 0) throw new Error('the scripted faces ran out');
    return rng.queue.shift();
  }

  class Die {
    constructor({ number = 1, faces: sides = 6, modifiers = [], results = [], options = {} }) {
      this._number = number;
      this._faces = sides;
      this.modifiers = modifiers;
      this.results = results;
      this.options = options;
      this._evaluated = results.length > 0;
    }

    get number() {
      return this._number;
    }

    get faces() {
      return this._faces;
    }

    get dice() {
      return [];
    }

    get expression() {
      return `${this._number}d${this._faces}${this.modifiers.join('')}`;
    }

    get formula() {
      return this.expression;
    }

    get total() {
      if (!this._evaluated) return undefined;
      return this.results.reduce((total, r) => {
        if (!r.active) return total;
        return total + (r.count !== undefined ? r.count : r.result);
      }, 0);
    }

    async evaluate(options = {}) {
      if (this._evaluated)
        throw new Error('The Die has already been evaluated and is now immutable');
      this._evaluated = true;
      if (Math.abs(this.number) > 999) {
        throw new Error('You may not evaluate a DiceTerm with more than 999 requested results');
      }
      for (let n = this.results.length; n < Math.abs(this.number); n += 1) await this.roll(options);
      await this._evaluateModifiers();
      return this;
    }

    // Core routes minimize/maximize through the deterministic path, which applies no modifier.
    evaluateSync({ minimize = false, maximize = false, strict = true } = {}) {
      this._evaluated = true;
      for (let n = this.results.length; n < Math.abs(this.number); n += 1) {
        if (minimize) this.results.push({ active: true, result: 1 });
        else if (maximize) this.results.push({ active: true, result: this.faces });
        else if (strict) throw new Error('Cannot synchronously evaluate a non-deterministic term.');
      }
      return this;
    }

    async roll({ minimize = false, maximize = false } = {}) {
      const roll = { result: undefined, active: true };
      if (minimize) roll.result = 1;
      else if (maximize) roll.result = this.faces;
      else roll.result = randomFace();
      this.results.push(roll);
      return roll;
    }

    async _evaluateModifiers() {
      const requested = this.modifiers.map((modifier) => modifier.toLowerCase());
      this.modifiers = [];
      for (const sequence of requested) {
        for (const [modifier, command] of sequence.matchAll(/(xo|x)[^A-z\s()+\-*/]*/gi)) {
          await this.explode(modifier, { recursive: command !== 'xo' });
          this.modifiers.push(modifier);
        }
      }
    }

    // `Die#explode`, verbatim in its control flow.
    async explode(modifier, { recursive = true } = {}) {
      const match = modifier.match(/xo?([0-9]+)?([<>=]+)?([0-9]+)?/i);
      let [max, comparison, target] = match.slice(1);
      if (max && !(target || comparison)) {
        target = max;
        max = null;
      }
      target = target === undefined ? this.faces : parseInt(target, 10);
      comparison = comparison || '=';
      max = max ? parseInt(max, 10) : null;
      let checked = 0;
      const initial = this.results.length;
      while (checked < this.results.length) {
        const r = this.results[checked];
        checked += 1;
        if (!r.active) continue;
        if (max !== null && max <= 0) break;
        if (compareResult(r.result, comparison, target)) {
          r.exploded = true;
          await this.roll({ explode: true });
          if (max !== null) max -= 1;
        }
        if (!recursive && checked === initial) break;
        if (checked > 1000)
          throw new Error('Maximum recursion depth for exploding dice roll exceeded');
      }
    }

    getResultLabel(result) {
      return String(result.result);
    }

    getResultCSS(result) {
      const marked = result.success !== undefined || result.failure !== undefined;
      return [
        'die',
        `d${this.faces}`,
        result.success ? 'success' : null,
        result.failure ? 'failure' : null,
        result.exploded ? 'exploded' : null,
        !marked && result.result === 1 ? 'min' : null,
        !marked && result.result === this.faces ? 'max' : null,
      ];
    }

    getTooltipData() {
      return {
        total: this.total,
        faces: this.faces,
        flavor: this.options.flavor,
        icon: null,
        formula: this.expression,
        rolls: this.results.map((r) => ({
          result: this.getResultLabel(r),
          classes: this.getResultCSS(r).filter(Boolean).join(' '),
        })),
      };
    }

    toJSON() {
      return {
        class: 'Die',
        options: this.options,
        evaluated: this._evaluated,
        number: this._number,
        faces: this._faces,
        modifiers: this.modifiers,
        results: this.results,
      };
    }

    static fromData(data) {
      const term = new Die(data);
      term._evaluated = data.evaluated ?? true;
      return term;
    }
  }

  class Roll {
    static CHAT_TEMPLATE = CHAT_TEMPLATE;
    static TOOLTIP_TEMPLATE = TOOLTIP_TEMPLATE;

    constructor(formula = '', data = {}, options = {}) {
      if (typeof formula !== 'string') throw new Error('DICE.ErrorNotParsable');
      this.data = data;
      this.options = options;
      this.terms = this.constructor.parse(formula, this.data);
      this._dice = [];
      this._evaluated = false;
      this._formula = this.resetFormula();
    }

    static parse(formula) {
      if (formula === '') return [];
      const match = /^(\d+)d(\d+)(\S*)$/.exec(formula);
      if (!match) throw new Error(`Unable to parse ${formula}`);
      const modifiers = Array.from(match[3].matchAll(MODIFIER_REGEXP), ([modifier]) => modifier);
      return [new Die({ number: Number(match[1]), faces: Number(match[2]), modifiers })];
    }

    get dice() {
      return this._dice.concat(
        this.terms.flatMap((t) => [...(t.dice ?? []), ...(t instanceof Die ? [t] : [])])
      );
    }

    get formula() {
      return this.terms.map((t) => t.formula).join('');
    }

    get result() {
      return this.terms.map((t) => t.total).join('');
    }

    get total() {
      return Number(this._total) || 0;
    }

    resetFormula() {
      return (this._formula = this.terms.map((t) => t.formula).join(''));
    }

    clone() {
      return new this.constructor(this._formula, this.data, this.options);
    }

    async evaluate({
      minimize = false,
      maximize = false,
      allowStrings = false,
      allowInteractive = true,
    } = {}) {
      if (this._evaluated) {
        throw new Error(
          `The ${this.constructor.name} has already been evaluated and is now immutable`
        );
      }
      this._evaluated = true;
      return this._evaluate({ minimize, maximize, allowStrings, allowInteractive });
    }

    evaluateSync({ minimize = false, maximize = false, strict = true } = {}) {
      if (this._evaluated) throw new Error('already evaluated');
      this._evaluated = true;
      for (const term of this.terms) term.evaluateSync({ minimize, maximize, strict });
      this._total = this.terms.reduce((sum, term) => sum + term.total, 0);
      return this;
    }

    async _evaluate(options = {}) {
      for (const term of this.terms) {
        if (options.minimize || options.maximize) term.evaluateSync(options);
        else await term.evaluate(options);
      }
      this._total = this.terms.reduce((sum, term) => sum + term.total, 0);
      return this;
    }

    async roll(options = {}) {
      return this.evaluate(options);
    }

    async reroll(options = {}) {
      return this.clone().evaluate(options);
    }

    async getTooltip() {
      const parts = this.dice.map((d) => d.getTooltipData());
      return renderCoreTemplate(this.constructor.TOOLTIP_TEMPLATE, { parts });
    }

    async render({
      flavor,
      template = this.constructor.CHAT_TEMPLATE,
      isPrivate = false,
      ...options
    } = {}) {
      if (!this._evaluated) await this.evaluate({ allowInteractive: !isPrivate });
      const chatData = await this._prepareChatRenderContext({ flavor, isPrivate, ...options });
      return renderCoreTemplate(template, chatData);
    }

    async _prepareChatRenderContext({ flavor, isPrivate = false } = {}) {
      return {
        formula: isPrivate ? '???' : this._formula,
        flavor: isPrivate ? null : (flavor ?? this.options.flavor),
        user: 'player',
        tooltip: isPrivate ? '' : await this.getTooltip(),
        total: isPrivate ? '?' : Math.round(this.total * 100) / 100,
      };
    }

    // `create: false`: the message's source data, where each roll is a JSON string.
    async toMessage(messageData = {}) {
      if (!this._evaluated) await this.evaluate({ allowInteractive: true });
      return {
        author: 'gm',
        content: String(this.total),
        ...messageData,
        rolls: [JSON.stringify(this)],
      };
    }

    toJSON() {
      return {
        class: this.constructor.name,
        options: this.options,
        dice: this._dice,
        formula: this._formula,
        terms: this.terms.map((t) => t.toJSON()),
        total: this._total,
        evaluated: this._evaluated,
      };
    }

    static fromData(data) {
      if (data.class && data.class !== this.name) {
        const cls = config.Dice.rolls.find((candidate) => candidate.name === data.class);
        if (!cls) throw new Error(`Unable to recreate ${data.class} instance from provided data`);
        return cls.fromData(data);
      }
      const roll = new this(data.formula, data.data, data.options);
      roll.terms = data.terms.map((t) => (t.class ? Die.fromData(t) : t));
      if (data.evaluated ?? true) {
        roll._total = data.total;
        roll._dice = (data.dice || []).map((t) => Die.fromData(t));
        roll._evaluated = true;
      }
      return roll;
    }
  }

  config.Dice.rolls.push(Roll);

  // `ChatMessage#prepareDerivedData`: a roll that throws is dropped and reported, never fatal.
  function reloadMessage(message) {
    const rolls = [];
    for (const json of message.rolls) {
      try {
        rolls.push(Roll.fromData(JSON.parse(json)));
      } catch (error) {
        errors.push(error);
      }
    }
    return { ...message, rolls };
  }

  return { Roll, Die, config, rng, errors, reloadMessage };
}

// ---------------------------------------------------------------------------------------------

function countEvaluation({ direction = 'over', ...pool } = {}) {
  return {
    product: 'count',
    direction,
    pool: {
      die: 10,
      base: '2',
      threshold: '8',
      required: 1,
      modifierDestination: 'pool',
      zeroPoolFails: true,
      explode: { enabled: false, faces: { kind: 'best', value: null }, once: false },
      cancel: { enabled: false, faces: { kind: 'worst', value: null } },
      ...pool,
    },
  };
}

const SETTLED = Object.freeze({ poolDelta: 0, thresholdDelta: 0, preRolls: [] });

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

function deepFreeze(value) {
  for (const child of Object.values(value)) {
    if (child && typeof child === 'object') deepFreeze(child);
  }
  return Object.freeze(value);
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

test('the count Roll is registered inside the init handler, before ready runs', async () => {
  const { Roll, config } = createCoreDice();
  const SystemRoll = class D20Roll extends Roll {};
  config.Dice.rolls.unshift(SystemRoll);
  const handlers = new Map();
  const record = (event, handler) => handlers.set(event, handler);
  const previous = {
    Hooks: globalThis.Hooks,
    CONFIG: globalThis.CONFIG,
    foundry: globalThis.foundry,
    game: globalThis.game,
  };
  Object.assign(globalThis, {
    Hooks: { on: record, once: record },
    CONFIG: config,
    foundry: { dice: { Roll }, applications: { handlebars: { renderTemplate: async () => '' } } },
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
    /aria-label="1: counts a success and cancels one, so it adds nothing"/
  );
  assert.match(plainClasses, /\bsuccess\b/);
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
  const description = '4d10 · each ≥ 8 · dice explode on 10 · dice cancel a success on 1';
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

test('the description states direction, strictness and an unclamped fractional threshold', async () => {
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
      '2d10 · each ≤ 3 · dice explode once on ≤ 2 · dice cancel a success on ≥ 9',
    ],
    [{ threshold: '8', explode: explodeRule({ kind: 'from', value: 12 }) }, '2d10 · each ≥ 8'],
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
