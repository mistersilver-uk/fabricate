/**
 * The ONE recorded oracle for the retired check-modifier placeholder (issue 1094), shared
 * by every suite that reasons about it.
 *
 * Two things live here, and both exist because a hand-written copy of either is how this
 * change goes wrong quietly:
 *
 * 1. {@link recordedFoundryRoll} — a `Roll.validate` double whose ACCEPT/REJECT sets are
 *    RECORDED from real Foundry rather than invented. Three suites previously carried
 *    three hand-written bodies for the same oracle and only one of them encoded the
 *    `max(, 2)` behaviour that the whole positional rule turns on; the other two would
 *    have graded a validate-driven implementation green.
 * 2. {@link RETIRED_PLACEMENT_CORPUS} — every placement the shim must REFUSE. The shim
 *    tests and the `1.21.0` migration's on-disk invariant drive the same rows, because a
 *    shape refused at roll time but rewritten on disk is exactly how a formula reaches a
 *    state the shim can no longer notice (the token is gone, so it short-circuits and
 *    `new Roll(...)` throws as a rolled — therefore consuming — permanent failure).
 *
 * This file is a HELPER, not a suite: `tests/helpers/**` is outside the `npm test` glob,
 * so it must export data and factories only. Importing a `.test.js` file to share a
 * constant re-executes that file's suites inside the importer, which is what this replaces.
 */

/**
 * Formulas real Foundry ACCEPTS that a naive residue check would expect it to reject.
 *
 * `max(, 2)` is the load-bearing row. `FunctionTerm`'s head is `Expression?` — OPTIONAL —
 * so it parses to a `FunctionTerm` carrying ZERO argument terms; `isDeterministic` is
 * `terms.every(...)` over an empty array and answers `true`; `_evaluateSync` calls
 * `Math.max()` with no arguments and yields `-Infinity`; and `Roll#total` is
 * `Number(this._total) || 0`, which lets `-Infinity` through. So `Roll.validate` says yes
 * and the craft rolls `-Infinity` against its DC on every attempt, forever, silently.
 */
export const RECORDED_ROLL_ACCEPTANCES = Object.freeze(['max(, 2)', 'max( , 2)']);

/**
 * Formulas real Foundry REJECTS, recorded by compiling `client/dice/grammar.pegjs` with
 * the bundled peggy and executing it. Each throws `peg$SyntaxError`, except `''`, which
 * fails later: `Roll.parse('')` returns `[]`, `RollParser.toAST([])` pops an empty array
 * and `_evaluateASTAsync` dereferences `node.class`.
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
 * Deliberately NOT a permissive predicate: outside the recorded sets it falls back to
 * structural rules that match the grammar (a dangling binary operator at either end and an
 * empty parenthetical are refused; a LEADING `+`/`-` is accepted, because `Expression`
 * admits `leading:(_ @Additive)*`).
 *
 * @param {string[]} [calls] Collects each formula passed to `validate`, so a test can
 *   assert the shim did NOT consult it — the short-circuit and structural branches both
 *   depend on that.
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
 * Every placement the shim must REFUSE, as `[label, formula]`.
 *
 * Three groups, and the middle one is the dangerous one:
 *
 * 1. Residues that cannot parse at all — a dangling or orphaned operator.
 * 2. Residues that parse PERFECTLY and total something the GM never authored. Measured on
 *    a real dice stack at scalar 3, `(2 + @craftingmod + 4) * 3` went from 27 to 21 and
 *    `max(2 + @craftingmod + 4, 10)` from 10 to 13, each with NO notice whatsoever. These
 *    are why the classifier scans BRACKET DEPTH rather than the two adjacent characters:
 *    an interior placement has `+` on both sides and no adjacent bracket to notice.
 * 3. Operator RUNS, which Foundry collapses by parity of `-`
 *    (`RollParser#_collapseOperators`), so a single-character sign test reads them
 *    backwards in opposite directions.
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
