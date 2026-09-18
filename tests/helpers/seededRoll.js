// A `Roll` double recording every construction, so a suite can prove an amount resolved ONCE per
// result: `totals` seeds `evaluate`, `maxima` the `evaluateSync({ maximize: true })` rollability
// reading, and a formula named in `unparsable` throws like Foundry's grammar does. `withRoll`
// installs an engine as the ambient `globalThis.Roll` and restores what was there, deletion
// included, for the suites proving the production `diceEngine()` read.
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
