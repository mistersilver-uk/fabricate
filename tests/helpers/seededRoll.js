import { evaluateNumericExpression } from '../../src/systems/checkModifierResolver.js';

// A Roll double: `totals` seeds evaluate(), `maxima` seeds evaluateSync({maximize:true}) (the
// rollability-floor reading), and `unparsable` throws like Foundry's grammar does.
export function seededRollClass({ totals = {}, maxima = {}, unparsable = [] } = {}) {
  const calls = [];
  const seeded = (map, formula) => (Object.hasOwn(map, formula) ? map[formula] : Number.NaN);
  class SeededRoll {
    constructor(formula, data = {}) {
      if (unparsable.includes(formula)) throw new Error(`SeededRoll cannot parse "${formula}"`);
      this.formula = formula;
      this.data = data;
      this.total = 0;
      calls.push({ formula, data });
    }

    async evaluate(options = {}) {
      calls.at(-1).evaluate = options;
      this.total = seeded(totals, this.formula);
      return this;
    }

    evaluateSync(options = {}) {
      calls.at(-1).evaluateSync = options;
      this.total = seeded(maxima, this.formula);
      return this;
    }
  }
  return { Roll: SeededRoll, calls };
}

/**
 * A Roll double that reads `data` the way core's grammar does, for an amount formula of `NdM`,
 * numbers, `+ - * /` and `@path`: a missing path is 0, a text value throws as core's unresolved
 * `StringTerm` does, dice sit at the requested extreme, and a division by zero totals non-finite.
 */
export function rollDataRollClass() {
  const read = (data, path) => path.split('.').reduce((node, key) => node?.[key], data);
  class RollDataRoll {
    constructor(formula, data = {}) {
      this.formula = formula;
      this.data = data;
      this.total = undefined;
    }

    evaluateSync({ maximize = false } = {}) {
      const expression = this.formula
        .replaceAll(/@([\w.-]+)/g, (_match, path) => {
          const value = read(this.data, path) ?? 0;
          const numeric = typeof value === 'number' || typeof value === 'string';
          if (!numeric || String(value).trim() === '' || !Number.isFinite(Number(value))) {
            throw new Error(`Unresolved StringTerm ${value}`);
          }
          return `(${Number(value)})`;
        })
        .replaceAll(/(\d*)d(\d+)/g, (_match, count, faces) =>
          String(Number(count || 1) * (maximize ? Number(faces) : 1))
        );
      this.total = evaluateNumericExpression(expression);
      return this;
    }

    async evaluate() {
      return this.evaluateSync({ maximize: true });
    }
  }
  return { Roll: RollDataRoll };
}

export function withRoll(Roll, fn) {
  const previous = globalThis.Roll;
  globalThis.Roll = Roll;
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      if (previous === undefined) delete globalThis.Roll;
      else globalThis.Roll = previous;
    });
}
