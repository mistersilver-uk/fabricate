/**
 * Installs the core-faithful dice double as `globalThis.Roll` and `CONFIG`, with the count Roll
 * registered over it, so an engine rolls count checks through the production projection. Every
 * construction and every evaluation is recorded, a constant formula totals itself, and chat posts
 * are recorded.
 */
import { registerCountRoll } from '../../src/systems/countRoll.js';

import { createCoreDice, renderCoreTemplate } from './coreDice.js';

class NumericTerm {
  constructor(value) {
    this.number = value;
    this.total = value;
  }

  get formula() {
    return String(this.number);
  }

  get dice() {
    return [];
  }

  async evaluate() {
    return this;
  }

  toJSON() {
    return { class: 'NumericTerm', number: this.number, evaluated: true };
  }
}

const CONSTANT = /^\s*-?\d+(?:\.\d+)?\s*$/;

/**
 * `faces` script the RNG in draw order, Tool and pre-roll dice included; `chat: false` keeps the
 * caller's own `ChatMessage`. Returns the installed classes, the RNG, every constructed and every
 * evaluated formula with its class name, the posts, and `restore()`.
 */
export function installCountDice({ faces = [], chat = true } = {}) {
  const previous = {
    Roll: globalThis.Roll,
    CONFIG: globalThis.CONFIG,
    ChatMessage: globalThis.ChatMessage,
  };
  const core = createCoreDice({ faces });
  const constructed = [];
  const evaluated = [];
  const posts = [];

  class EngineRoll extends core.Roll {
    constructor(formula = '', data = {}, options = {}) {
      super(formula, data, options);
      constructed.push({ formula: String(formula), kind: this.constructor.name });
    }

    static parse(formula) {
      if (CONSTANT.test(formula)) return [new NumericTerm(Number(formula))];
      return super.parse(formula);
    }

    async evaluate(options) {
      if (!this._evaluated) evaluated.push({ formula: this._formula, kind: this.constructor.name });
      return super.evaluate(options);
    }

    static validate() {
      return true;
    }

    static replaceFormulaData(formula) {
      return formula;
    }

    async toMessage(messageData = {}, options = {}) {
      const message = await super.toMessage(messageData);
      posts.push({ rolls: [this], messageData, options });
      return message;
    }
  }

  core.config.Dice.rolls[0] = EngineRoll;
  const CountRoll = registerCountRoll({
    config: core.config,
    BaseRoll: EngineRoll,
    renderTemplate: renderCoreTemplate,
  });
  globalThis.Roll = EngineRoll;
  globalThis.CONFIG = core.config;
  if (chat) {
    globalThis.ChatMessage = {
      create: async (data, options) => {
        posts.push({ rolls: data.rolls, messageData: data, options });
        return data;
      },
      getSpeaker: () => ({ alias: 'Speaker' }),
    };
  }
  return {
    Roll: EngineRoll,
    CountRoll,
    rng: core.rng,
    constructed,
    evaluated,
    posts,
    /** The formulas rolled so far, in order; a reconstruction from data rolls nothing. */
    formulas: () => evaluated.map((entry) => entry.formula),
    restore() {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete globalThis[key];
        else globalThis[key] = value;
      }
    },
  };
}
