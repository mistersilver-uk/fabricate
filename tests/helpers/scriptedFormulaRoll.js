/**
 * A `Roll` double keyed by formula (issue 1773, V&A 8): each `evaluate({ allowInteractive: false })`
 * answers the next scripted total for its formula and is counted per formula, and `evaluateSync`
 * answers the scripted extremes for `maximize` and `minimize`. Every construction's roll data is kept.
 */
export function scriptedFormulaRoll(script = {}, { extremes = {} } = {}) {
  const counts = {};
  const rollData = [];
  class ScriptedRoll {
    constructor(formula, data = {}) {
      this.formula = formula;
      this.data = data;
      this.total = undefined;
      rollData.push({ formula, data });
    }

    async evaluate(options = {}) {
      if (options.allowInteractive !== false) throw new Error('a reward roll is never interactive');
      const queue = script[this.formula];
      if (!Array.isArray(queue)) throw new Error(`no script for "${this.formula}"`);
      const index = counts[this.formula] ?? 0;
      counts[this.formula] = index + 1;
      this.total = queue[Math.min(index, queue.length - 1)];
      return this;
    }

    evaluateSync({ maximize = false } = {}) {
      const [low, high] = extremes[this.formula] ?? [1, 20];
      this.total = maximize ? high : low;
      return this;
    }
  }
  return { Roll: ScriptedRoll, counts, rollData };
}
