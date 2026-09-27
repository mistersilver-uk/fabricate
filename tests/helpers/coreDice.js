/**
 * A double of core `foundry.dice.Roll` and `Die` (V13.351 = V14.367 for every method used here):
 * scripted faces stand in for the RNG, and the rest follows `client/dice/roll.mjs`,
 * `terms/dice.mjs`, `terms/die.mjs`, `ChatMessage#prepareDerivedData` and the two templates.
 */
import assert from 'node:assert/strict';

export const CHAT_TEMPLATE = 'templates/dice/roll.hbs';
export const TOOLTIP_TEMPLATE = 'templates/dice/tooltip.hbs';

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

export function renderCoreTemplate(path, data) {
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

export function createCoreDice({ faces = [] } = {}) {
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
