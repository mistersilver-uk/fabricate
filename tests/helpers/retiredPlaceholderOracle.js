/**
 * The ONE recorded oracle for the retired check-modifier placeholder (issue 1094), shared by every
 * suite that reasons about it. 1. {@link recordedFoundryRoll} — a `Roll.validate` double whose
 * ACCEPT/REJECT sets are RECORDED from real Foundry rather than invented.
 */

/** Formulas real Foundry ACCEPTS that a naive residue check would expect it to reject. */
export const RECORDED_ROLL_ACCEPTANCES = Object.freeze(['max(, 2)', 'max( , 2)']);

/**
 * Formulas real Foundry REJECTS, recorded by compiling `client/dice/grammar.pegjs` with the bundled
 * peggy and executing it.
 */
export const RECORDED_ROLL_REJECTIONS = Object.freeze([
  '',
  '()',
  '()d6',
  '1d20 +',
  '1d20 + (',
  'max(1d20,',
  '1d20 *',
]);

/**
 * A `Roll` double carrying only `validate`, recording every formula it is asked about.
 *
 * @param {string[]} [calls] Collects each formula passed to `validate`, so a test can assert the
 * shim did NOT consult it — the short-circuit and structural branches both depend on that.
 */
export function recordedFoundryRoll(calls = []) {
  return class {
    static validate(formula) {
      calls.push(formula);
      const text = String(formula).trim();
      if (RECORDED_ROLL_ACCEPTANCES.includes(text)) return true;
      if (RECORDED_ROLL_REJECTIONS.includes(text)) return false;
      if (/^[*/%]/.test(text) || /[+\-*/%]$/.test(text)) return false;
      if (/\(\s*\)/.test(text)) return false;
      return true;
    }
  };
}

/**
 * Every placement the shim must REFUSE, as `[label, formula]`. 1. Residues that cannot parse at all
 * — a dangling or orphaned operator.
 */
export const RETIRED_PLACEMENT_CORPUS = Object.freeze([
  // 1 — structurally incomplete residues.
  ['multiplicative', '1d20 * @craftingmod'],
  ['divisive', '1d20 / @craftingmod'],
  ['modulo', '1d20 % @craftingmod'],
  ['authored trailing operator', '1d20 - @craftingmod -'],
  ['leading token then a bare operator', '@craftingmod +'],
  ['dice-count', '(@craftingmod)d6'],
  ['lone parenthetical', '(@craftingmod)'],
  ['function argument', 'max(@craftingmod, 2)'],
  // 2 — valid residues with a WRONG total.
  ['parenthesised addend, scaled', '(1d20 + @craftingmod) * 2'],
  ['parenthesised addend, in a function', 'floor((1d20 + @craftingmod) / 2)'],
  ['INTERIOR to a scaled group', '(2 + @craftingmod + 4) * 3'],
  ['INTERIOR to a scaled group, scaled left', '3 * (2 + @craftingmod + 4)'],
  ['INTERIOR to a function argument', 'max(2 + @craftingmod + 4, 10)'],
  ['INTERIOR to a nested function', 'floor((2 + @craftingmod + 4) / 2)'],
  ['INTERIOR to a dice count', '(2 + @craftingmod + 4)d6'],
  ['INTERIOR and subtractive', '(2 - @craftingmod + 4) * 3'],
  ['INTERIOR to a pool', '{2 + @craftingmod, 4}kh1'],
  // 3 — operator runs.
  ['double negative run', '1d20 - -@craftingmod'],
  ['mixed operator run', '1d20 + -@craftingmod'],
  ['multiplicative with a negation', '1d20 * -@craftingmod'],
  ['unspaced double operator', '1d20 --@craftingmod'],
]);
