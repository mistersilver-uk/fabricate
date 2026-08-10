import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateNumericExpression } from '../src/systems/craftingModifierResolver.js';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  recordedFoundryRoll,
  RETIRED_PLACEMENT_CORPUS,
} from './helpers/retiredPlaceholderOracle.js';

const repoRootForGuard = resolve(dirname(fileURLToPath(import.meta.url)), '..');
import {
  parseDiceGroups,
  isPlainDieTerm,
  parsePlainDiceGroups,
  hasPlainD20,
  applyD20Advantage,
  rangesOverlap,
  findRangeConflicts,
  describeRetiredModifierPlaceholder,
  stripRetiredModifierPlaceholder,
  RETIRED_MODIFIER_TOKEN,
} from '../src/utils/craftingCheckExpression.js';

describe('parseDiceGroups', () => {
  it('lists each dice group in order, ignoring flat modifiers', () => {
    assert.deepEqual(
      parseDiceGroups('2d6+1d4+3').map((g) => g.raw),
      ['2d6', '1d4']
    );
  });

  it('treats a bare dN as a single die', () => {
    assert.deepEqual(parseDiceGroups('d20+5'), [{ raw: '1d20', count: 1, sides: 20 }]);
  });

  it('returns an empty list when there are no dice', () => {
    assert.deepEqual(parseDiceGroups('5'), []);
    assert.deepEqual(parseDiceGroups(''), []);
    assert.deepEqual(parseDiceGroups(null), []);
  });

  it('ignores actor references that cannot be resolved ahead of time', () => {
    assert.deepEqual(
      parseDiceGroups('1d20+@attributes.con.mod').map((g) => g.raw),
      ['1d20']
    );
  });
});

describe('isPlainDieTerm', () => {
  it('classifies plain, unmodified NdS terms as crit-eligible (bare dN === 1dN)', () => {
    assert.equal(isPlainDieTerm('1d20'), true);
    assert.equal(isPlainDieTerm('2d6'), true);
    assert.equal(isPlainDieTerm('d20'), true);
  });

  it('classifies any modified pool (keep/drop/explode/reroll/min/max) as ineligible', () => {
    for (const term of [
      '2d20kh1',
      '4d6dl1',
      '1d6x',
      '2d10r1',
      '2d6min2',
      '2d6max5',
      'min',
      'max',
    ]) {
      assert.equal(isPlainDieTerm(term), false, `${term} must be non-plain`);
    }
  });

  it('is a pure function with no side effects (stable across repeated calls)', () => {
    assert.equal(typeof isPlainDieTerm, 'function');
    const before = isPlainDieTerm('2d20kh1');
    assert.equal(isPlainDieTerm('2d20kh1'), before);
    assert.equal(isPlainDieTerm('2d20kh1'), false);
    // Pure: classifying one term never alters the result for another.
    assert.equal(isPlainDieTerm('1d20'), true);
    assert.equal(isPlainDieTerm('2d20kh1'), false);
  });
});

describe('parsePlainDiceGroups', () => {
  it('lists only the plain dice groups, in canonical NdS form', () => {
    assert.deepEqual(
      parsePlainDiceGroups('2d6+1d4+3').map((g) => g.raw),
      ['2d6', '1d4']
    );
    assert.deepEqual(parsePlainDiceGroups('d20+5'), [{ raw: '1d20', count: 1, sides: 20 }]);
  });

  it('excludes modified pools but keeps the plain dice alongside them', () => {
    assert.deepEqual(
      parsePlainDiceGroups('2d20kh1+1d4').map((g) => g.raw),
      ['1d4']
    );
    assert.deepEqual(parsePlainDiceGroups('4d6dl1'), []);
    assert.deepEqual(parsePlainDiceGroups('1d6x'), []);
    assert.deepEqual(parsePlainDiceGroups('2d10r1'), []);
  });

  it('keeps a plain die that carries bracketed flavor text', () => {
    assert.deepEqual(
      parsePlainDiceGroups('2d6[fire]+1d4').map((g) => g.raw),
      ['2d6', '1d4']
    );
  });
});

describe('hasPlainD20', () => {
  it('is true for a plain 1d20 (and bare d20)', () => {
    assert.equal(hasPlainD20('1d20+3'), true);
    assert.equal(hasPlainD20('d20'), true);
    assert.equal(hasPlainD20('@prof + 1d20'), true);
  });

  it('is false for non-plain-d20 formulas', () => {
    assert.equal(hasPlainD20('2d20'), false);
    assert.equal(hasPlainD20('d200'), false);
    assert.equal(hasPlainD20('2d20kh1'), false);
    assert.equal(hasPlainD20('2d6+1'), false);
    assert.equal(hasPlainD20(''), false);
    assert.equal(hasPlainD20(null), false);
  });
});

describe('applyD20Advantage', () => {
  it('rewrites the first plain d20 to a keep-highest/lowest pool', () => {
    assert.equal(applyD20Advantage('1d20 + 3', 'advantage'), '2d20kh1 + 3');
    assert.equal(applyD20Advantage('1d20 + 3', 'disadvantage'), '2d20kl1 + 3');
  });

  it('handles a bare d20 and a leading actor reference', () => {
    assert.equal(applyD20Advantage('d20', 'advantage'), '2d20kh1');
    assert.equal(applyD20Advantage('@prof + 1d20', 'advantage'), '@prof + 2d20kh1');
  });

  it('handles an uppercase D20', () => {
    assert.equal(hasPlainD20('1D20'), true);
    assert.equal(applyD20Advantage('1D20 + 3', 'advantage'), '2d20kh1 + 3');
    assert.equal(applyD20Advantage('D20', 'disadvantage'), '2d20kl1');
  });

  it('rewrites only the FIRST plain d20', () => {
    assert.equal(applyD20Advantage('1d20 + 1d20', 'advantage'), '2d20kh1 + 1d20');
  });

  it('leaves non-plain-d20 formulas and non-adv modes unchanged', () => {
    assert.equal(applyD20Advantage('2d6+1', 'advantage'), '2d6+1');
    assert.equal(applyD20Advantage('2d20', 'advantage'), '2d20');
    assert.equal(applyD20Advantage('1d20 + 3', 'normal'), '1d20 + 3');
    assert.equal(applyD20Advantage('1d20 + 3', 'anything'), '1d20 + 3');
  });
});

describe('rangesOverlap', () => {
  it('detects intersecting inclusive ranges', () => {
    assert.equal(rangesOverlap({ start: 1, end: 10 }, { start: 10, end: 20 }), true);
    assert.equal(rangesOverlap({ start: 1, end: 10 }, { start: 11, end: 20 }), false);
  });
});

describe('findRangeConflicts', () => {
  it('returns no conflicts for adjacent, non-overlapping ranges', () => {
    const { overlapping, invalid } = findRangeConflicts([
      { start: 1, end: 10 },
      { start: 11, end: 20 },
    ]);
    assert.equal(overlapping.size, 0);
    assert.equal(invalid.size, 0);
  });

  it('marks both members of an overlapping pair', () => {
    const { overlapping } = findRangeConflicts([
      { start: 1, end: 10 },
      { start: 5, end: 15 },
      { start: 16, end: 20 },
    ]);
    assert.deepEqual([...overlapping].sort(), [0, 1]);
  });

  it('treats start greater than end as invalid and skips it for overlap', () => {
    const { overlapping, invalid } = findRangeConflicts([
      { start: 10, end: 5 },
      { start: 1, end: 20 },
    ]);
    assert.deepEqual([...invalid], [0]);
    assert.equal(overlapping.size, 0);
  });
});

// ── the retired check-modifier placeholder (issue 1094) ──────────────────────
//
// The recorded oracle and the refusal corpus are SHARED (`tests/helpers/
// retiredPlaceholderOracle.js`), not restated here. Three suites previously carried three
// hand-written `Roll.validate` bodies for one recorded oracle and only one encoded the
// `max(, 2)` behaviour the whole positional rule turns on; the other two would have graded
// a validate-driven implementation green. The helper's header carries the recording
// provenance and the measured totals.

describe('describeRetiredModifierPlaceholder: the ADDITIVE predicate', () => {
  // The predicate is the rule; the named contexts are examples of it. Asserted directly so
  // the three conditions are pinned independently of what the shim then does with them.
  it('requires bracket depth 0, so an INTERIOR placement is refused', () => {
    for (const formula of [
      '(2 + @craftingmod + 4) * 3',
      '3 * (2 + @craftingmod + 4)',
      'max(2 + @craftingmod + 4, 10)',
      'floor((2 + @craftingmod + 4) / 2)',
      '(2 + @craftingmod + 4)d6',
      '{2 + @craftingmod, 4}kh1',
    ]) {
      assert.equal(
        describeRetiredModifierPlaceholder(formula).nonAdditive,
        true,
        `${formula}: additive on both sides, but nested — the appended term cannot reproduce it`
      );
    }
  });

  it('accepts depth 0 with `+` on both sides — the interior case at top level', () => {
    assert.equal(
      describeRetiredModifierPlaceholder('2 + @craftingmod + 4').nonAdditive,
      false,
      'the same neighbours, unnested, ARE commutable with a trailing term'
    );
  });

  it('refuses an operator RUN longer than one', () => {
    for (const formula of [
      '1d20 - -@craftingmod',
      '1d20 + -@craftingmod',
      '1d20 --@craftingmod',
      '1d20 + + @craftingmod',
    ]) {
      assert.equal(describeRetiredModifierPlaceholder(formula).nonAdditive, true, formula);
    }
  });

  // Foundry collapses an additive run by PARITY of `-` (`RollParser#_collapseOperators`),
  // so a single-character sign test reads `2 - +@craftingmod` (effectively negative) and
  // `2 - -@craftingmod` (effectively positive) backwards in opposite directions. Refusing
  // runs is what keeps `subtractive` a single-character test that cannot be wrong.
  it('never reports subtractive for a placement it refuses', () => {
    for (const formula of ['1d20 - -@craftingmod', '(2 - @craftingmod + 4) * 3']) {
      const placement = describeRetiredModifierPlaceholder(formula);
      assert.equal(placement.nonAdditive, true, formula);
      assert.equal(
        placement.subtractive,
        false,
        `${formula}: a sign inversion is only reportable where the strip actually runs`
      );
    }
    assert.equal(
      describeRetiredModifierPlaceholder('1d20 - @craftingmod').subtractive,
      true,
      'and a real single-operator subtraction still reports'
    );
  });
});

describe('stripRetiredModifierPlaceholder', () => {
  // THE NO-TOKEN SHORT-CIRCUIT, asserted by SPY rather than by output. Returning the input
  // is only half the contract; the other half is that the majority path takes on no Foundry
  // dependency at all, which only a call count can prove.
  it('returns a token-free formula untouched WITHOUT calling Roll.validate', () => {
    const calls = [];
    const Roll = recordedFoundryRoll(calls);
    assert.equal(stripRetiredModifierPlaceholder('1d20 + @prof', Roll), '1d20 + @prof');
    assert.deepEqual(calls, [], 'Roll.validate was never consulted');
  });

  it('leaves @craftingmodifier alone (word boundary)', () => {
    const Roll = recordedFoundryRoll();
    assert.equal(
      stripRetiredModifierPlaceholder('1d20 + @craftingmodifier', Roll),
      '1d20 + @craftingmodifier'
    );
  });

  // Every placement the acceptance names, each asserting the residue is something
  // `Roll.validate` ACCEPTS or is `''` — never a dangling operator.
  for (const [label, formula, expected] of [
    ...RETIRED_PLACEMENT_CORPUS.map(([corpusLabel, corpusFormula]) => [
      corpusLabel,
      corpusFormula,
      '',
    ]),
    ['token alone', '@craftingmod', ''],
    ['trailing', '1d20 + @craftingmod', '1d20'],
    ['trailing subtractive', '1d20 - @craftingmod', '1d20'],
    ['leading additive', '@craftingmod + 1d20', '+ 1d20'],
    ['leading subtractive', '@craftingmod - 2', '- 2'],
    ['interior', '1d20 + @craftingmod + 3', '1d20 + 3'],
    ['repeated', '@craftingmod + 1d20 + @craftingmod', '+ 1d20'],
    ['multiplicative', '1d20 * @craftingmod', ''],
    ['dice-count', '(@craftingmod)d6', ''],
    ['function argument', 'max(@craftingmod, 2)', ''],
    ['lone parenthetical', '(@craftingmod)', ''],
  ]) {
    it(`strips a ${label} placement to a formula Roll accepts, or to ''`, () => {
      const Roll = recordedFoundryRoll();
      const residue = stripRetiredModifierPlaceholder(formula, Roll);
      assert.equal(residue, expected);
      if (residue !== '') {
        assert.equal(Roll.validate(residue), true, 'the residue is a formula Foundry accepts');
      }
    });
  }

  // THE LEADING-TOKEN ARITHMETIC, pinned by TOTAL rather than by string.
  //
  // A leading token has no preceding operator, so the one that FOLLOWS it is the only
  // thing carrying the sign of the next term — and it must survive the strip. Foundry's
  // `Expression` is `_ leading:(_ @Additive)* _ head:Term tail:(…)*`
  // (`client/dice/grammar.pegjs:17`) with `Additive = "+" / "-"` (`:89`), and `leading` is
  // plucked and forwarded to `parser._onExpression(head, tail, leading, …)`, so `- 2`
  // parses as -2.
  //
  // The oracle here is deliberately NOT the residue string: it is the total the retired
  // `(scalar)` SUBSTITUTION produced, recomputed independently. A string assertion would
  // have happily locked in the wrong answer — stripping the operator too yields `2`, which
  // is a perfectly valid formula and a silently doubled modifier.
  const substitutedTotal = (formula, scalar) =>
    evaluateNumericExpression(formula.replaceAll('@craftingmod', `(${scalar})`));
  const appendedTotal = (formula, scalar) => {
    const residue = stripRetiredModifierPlaceholder(formula, recordedFoundryRoll());
    const sign = scalar < 0 ? '-' : '+';
    return evaluateNumericExpression(`${residue} ${sign} ${Math.abs(scalar)}`);
  };

  for (const [label, formula, scalar, expected] of [
    ['@craftingmod - 2 keeps the minus, so the total is unchanged', '@craftingmod - 2', 3, 1],
    ['@craftingmod - 2 with a negative scalar', '@craftingmod - 2', -3, -5],
    ['@craftingmod + 4 is unchanged either way', '@craftingmod + 4', 3, 7],
    ['@craftingmod - 1 - 2 keeps every following operator', '@craftingmod - 1 - 2', 3, 0],
  ]) {
    it(`preserves the pre-retirement total: ${label}`, () => {
      assert.equal(
        appendedTotal(formula, scalar),
        substitutedTotal(formula, scalar),
        'the appended form must total exactly what the retired substitution totalled'
      );
      assert.equal(appendedTotal(formula, scalar), expected, 'and that total is this');
    });
  }

  // A formula spending the token TWICE is the ONE case where the total deliberately does
  // NOT survive, so it is asserted here rather than left to look like a gap in the table
  // above. `@craftingmod - 2 + @craftingmod` substituted to `(3) - 2 + (3)` = 4 and now
  // totals 1, because the scalar is appended ONCE however many times the formula spent it.
  // That is the accepted multiple-occurrence collapse, and the `1.21.0` migration counts
  // the formula under `repeated` precisely so the GM is told.
  it('COLLAPSES a doubled placeholder to one contribution, and that is the contract', () => {
    const formula = '@craftingmod - 2 + @craftingmod';
    assert.equal(substitutedTotal(formula, 3), 4, 'the retired substitution double-counted');
    assert.equal(appendedTotal(formula, 3), 1, 'the append counts it once');
    assert.equal(
      appendedTotal(formula, 3),
      substitutedTotal('@craftingmod - 2', 3),
      'and lands exactly where a single-occurrence formula always did'
    );
  });

  // The dice case, asserted on the residue because a die has no fixed total. `- 1d4` is a
  // legal Expression for the same reason `- 2` is.
  it('keeps the following operator on a leading token before a DIE term', () => {
    const Roll = recordedFoundryRoll();
    const residue = stripRetiredModifierPlaceholder('@craftingmod - 1d4', Roll);
    assert.equal(residue, '- 1d4', 'the minus that negates the die survives');
    assert.equal(Roll.validate(residue), true);
  });

  // The counter-case that proves the rule is not vacuous: a NON-leading token drops its
  // PRECEDING operator, which is the operator that belonged to it.
  it('drops the PRECEDING operator on a non-leading token, and only that one', () => {
    const Roll = recordedFoundryRoll();
    assert.equal(stripRetiredModifierPlaceholder('1d20 - @craftingmod - 2', Roll), '1d20 - 2');
    assert.equal(stripRetiredModifierPlaceholder('1d20 + @craftingmod - 2', Roll), '1d20 - 2');
  });

  // Prove the negative can FAIL. A "never a dangling operator" claim graded by a permissive
  // double is vacuous, so this asserts the double actually rejects the residues a naive
  // strip would produce — AND that it accepts the one that makes `Roll.validate` an unsafe
  // oracle, so the positional rule below is doing real work rather than agreeing with a
  // predicate that was written to agree with it.
  it('the SHARED recorded double matches real Foundry on the residues that decide this rule', () => {
    const Roll = recordedFoundryRoll();
    assert.equal(Roll.validate('1d20 * '), false);
    assert.equal(Roll.validate('()'), false);
    assert.equal(Roll.validate(''), false);
    assert.equal(Roll.validate('1d20'), true, 'and still accepts a real formula');
    assert.equal(
      Roll.validate('max(, 2)'),
      true,
      'the FunctionTerm head is optional, so Foundry ACCEPTS this and rolls -Infinity'
    );
  });

  // THE CORRECTION, asserted as behaviour rather than as prose. A function-argument
  // placement must answer `''` even though `Roll.validate` would accept its residue, and
  // it must do so WITHOUT consulting `Roll.validate` at all — a validate-driven rule would
  // return `max(, 2)` here and disagree with this test by construction.
  it('answers "" for a function-argument placement WITHOUT asking Roll.validate', () => {
    for (const formula of ['max(@craftingmod, 2)', 'max( @craftingmod , 2)']) {
      const calls = [];
      const Roll = recordedFoundryRoll(calls);
      assert.equal(stripRetiredModifierPlaceholder(formula, Roll), '', formula);
      assert.deepEqual(calls, [], `${formula}: the decision is positional, not delegated`);
    }
  });

  // The same for every other non-additive position, so the rule is uniform rather than a
  // special case bolted on for `max()`.
  it('answers "" for every non-additive placement, positionally', () => {
    for (const formula of [
      '1d20 * @craftingmod',
      '1d20 / @craftingmod',
      '(@craftingmod)',
      '(@craftingmod)d6',
      '1d20 + (@craftingmod)',
      '1d20 + @craftingmod * 2',
      'floor(@craftingmod / 2)',
    ]) {
      const calls = [];
      const Roll = recordedFoundryRoll(calls);
      assert.equal(stripRetiredModifierPlaceholder(formula, Roll), '', formula);
      assert.deepEqual(calls, [], `${formula}: no residue was validated`);
    }
  });

  // THE STRUCTURAL INVARIANT, asserted with NO dice engine at all — the configuration the
  // migration writes from. Fail-open relaxes VALIDATION; it must never relax this.
  it('never returns a residue that opens or closes with a dangling operator', () => {
    for (const [label, formula] of RETIRED_PLACEMENT_CORPUS) {
      const residue = stripRetiredModifierPlaceholder(formula, null);
      assert.equal(residue, '', `${label}: refused with no engine available`);
    }
  });

  it('rejects a structurally incomplete residue BEFORE consulting Roll.validate', () => {
    // A permissive double that would accept anything: the rejection must not depend on it.
    const calls = [];
    const Roll = class {
      static validate(candidate) {
        calls.push(candidate);
        return true;
      }
    };
    assert.equal(stripRetiredModifierPlaceholder('1d20 - @craftingmod -', Roll), '');
    assert.deepEqual(calls, [], 'the structural check answered first');
  });

  // FAIL OPEN when the dice engine is absent (headless, tests), for the ADDITIVE residue
  // only. Returning `''` there would report `noFormula` and silently disable an authored
  // check, which is the worse error. The non-additive answer is positional, so it is
  // engine-independent and identical with or without a `Roll`.
  it('KEEPS an additive residue when Roll.validate is unavailable', () => {
    const previous = globalThis.Roll;
    delete globalThis.Roll;
    try {
      assert.equal(stripRetiredModifierPlaceholder('1d20 + @craftingmod'), '1d20');
      assert.equal(
        stripRetiredModifierPlaceholder('max(@craftingmod, 2)'),
        '',
        'a non-additive placement still answers "" with no dice engine at all'
      );
      assert.equal(stripRetiredModifierPlaceholder('1d20 * @craftingmod'), '');
    } finally {
      if (previous === undefined) delete globalThis.Roll;
      else globalThis.Roll = previous;
    }
  });

  it('reads globalThis.Roll by default, not only an injected one', () => {
    const previous = globalThis.Roll;
    const calls = [];
    globalThis.Roll = recordedFoundryRoll(calls);
    try {
      // An ADDITIVE placement, so the residue check runs — against `globalThis.Roll`
      // rather than an injected one, which is the point of this test.
      assert.equal(stripRetiredModifierPlaceholder('1d20 + @craftingmod'), '1d20');
      assert.deepEqual(calls, ['1d20']);
    } finally {
      if (previous === undefined) delete globalThis.Roll;
      else globalThis.Roll = previous;
    }
  });

  // `Roll.validate` is a static that does `new this(formula)` internally, so it MUST be
  // invoked as a method. This asserts the shim never detaches it: a detached reference
  // leaves `this` undefined and returns false for EVERY formula, which would empty every
  // authored check that ever carried the token.
  it('calls Roll.validate as a METHOD, with Roll as its receiver', () => {
    const receivers = [];
    const Roll = class {
      static validate(formula) {
        receivers.push(this);
        return String(formula).trim() !== '';
      }
    };
    assert.equal(stripRetiredModifierPlaceholder('1d20 + @craftingmod', Roll), '1d20');
    assert.deepEqual(receivers, [Roll]);
  });
});

// ── the module-placement invariant (AF1) ───────────────────────────────────
//
// The shim lives in `craftingCheckExpression.js` and not in `checkRoll.js` for one
// reason: the usability readers must call it, and `checkRoll.js` already imports FROM
// `craftingModifierResolver.js`, so siting it there closes the cycle
// `checkRoll.js -> craftingModifierResolver.js -> checkRoll.js`.
//
// This is asserted on SOURCE TEXT because it cannot be asserted any other way. ESM live
// bindings mean the cycle may resolve fine under `node --test` by hoisting luck, while the
// bundler reorders the same graph and the built `main.js` throws
// `undefined is not a function` at module init. `npm run build` succeeds either way — the
// failure is at RUNTIME in Foundry. Without this, code review is the only guard.
describe('the retirement shim module placement (AF1)', () => {
  const sourceOf = (path) => readFileSync(resolve(repoRootForGuard, path), 'utf8');
  const importsOf = (source) =>
    [...source.matchAll(/^\s*import\s[^;]*?from\s+'([^']+)';/gm)].map((match) => match[1]);

  it('keeps craftingCheckExpression.js a ZERO-import leaf', () => {
    assert.deepEqual(
      importsOf(sourceOf('src/utils/craftingCheckExpression.js')),
      [],
      'the shim module must import nothing, or it can be dragged into a cycle by its own deps'
    );
  });

  it('keeps both usability readers clear of the roll stack', () => {
    for (const reader of [
      'src/systems/craftingModifierResolver.js',
      'src/systems/salvageCheckUsability.js',
    ]) {
      const imports = importsOf(sourceOf(reader));
      assert.equal(
        imports.some((specifier) => specifier.includes('checkRoll')),
        false,
        `${reader} must not import checkRoll.js — that is the cycle AF1 names`
      );
      assert.ok(
        imports.some((specifier) => specifier.includes('craftingCheckExpression')),
        `${reader} reads the shim from the leaf module`
      );
    }
  });

  it('has checkRoll.js importing the shim from the leaf, not re-declaring it', () => {
    const source = sourceOf('src/systems/checkRoll.js');
    assert.ok(
      /stripRetiredModifierPlaceholder,?\n?[^;]*from '\.\.\/utils\/craftingCheckExpression\.js'/s.test(
        source
      ),
      'checkRoll.js consumes the shim rather than owning it'
    );
  });
});
