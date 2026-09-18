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
