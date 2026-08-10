/**
 * Parsing and validation helpers for crafting-check roll expressions and the
 * fixed-mode outcome tier ranges built on top of them. Pure functions with no
 * Foundry or DOM dependencies, so the check editor and its unit tests share one
 * source of truth.
 *
 * This module also owns the RETIREMENT of the Fabricate-owned `@craftingmod`
 * placeholder (issue 1094). It lives here, beside the formula tokenizers it is a
 * sibling of, and NOT in `checkRoll.js`: the usability readers
 * (`checkModifierResolver.js`, `salvageCheckUsability.js`) must call it, and
 * `checkRoll.js` already imports FROM `checkModifierResolver.js`, so putting the
 * rule there would close an import cycle whose failure mode is a module-init error
 * in the BUILT bundle that `npm test` cannot see. This module has zero imports and
 * is already imported by `checkRoll.js`.
 */

/**
 * The retired Fabricate-owned placeholder. Kept as a named constant because three
 * derivations below (presence, strip, placement classification) must agree on the
 * same spelling, and the `1.21.0` migration reports on it by name.
 */
export const RETIRED_MODIFIER_TOKEN = '@craftingmod';

/**
 * Word-boundary presence test. `\b` after `d` fails against a following word
 * character, so a hypothetical longer token (`@craftingmodifier`) is NOT matched —
 * the behaviour the retired `CRAFTING_MOD_TOKEN_RE` had, preserved deliberately.
 * Non-global so `lastIndex` can never leak between calls.
 */
const RETIRED_MODIFIER_TOKEN_RE = /@craftingmod\b/;

/** The global twin, used only where every occurrence must be visited. */
const RETIRED_MODIFIER_TOKEN_GLOBAL_RE = /@craftingmod\b/g;

/**
 * Strip the token together with its PRECEDING additive operator (`1d20 + @craftingmod` →
 * `1d20`), else the bare token alone (`1d20 * @craftingmod` → `1d20 * `, which the
 * residue check below then rejects).
 *
 * THE FOLLOWING OPERATOR IS DELIBERATELY KEPT, and getting this wrong silently doubles a
 * modifier. A LEADING token has no preceding operator, so it falls to the second
 * alternative and the operator AFTER it survives: `@craftingmod - 2` → `- 2`.
 *
 * That residue is legal and it is what preserves the arithmetic. `Expression` is
 * `_ leading:(_ @Additive)* _ head:Term tail:(…)*` (`client/dice/grammar.pegjs:17`, read
 * from the pinned 14.365 archive) with `Additive = "+" / "-"` (`:89`), and `leading` is
 * plucked and forwarded to `parser._onExpression(head, tail, leading, …)` — so a leading
 * additive operator parses AND carries its sign.
 *
 * Work the numbers, because this is the whole reason the rule is shaped this way. With a
 * scalar of 3, `@craftingmod - 2` used to substitute to `(3) - 2` = **1**. Keeping the
 * operator gives `- 2` and appends to `-2 + 3[Modifiers]` = **1**, preserved exactly.
 * Stripping the operator too would give `2`, appending to `2 + 3[Modifiers]` = **5** —
 * wrong by twice the scalar, in the crafter's favour, with nothing on screen to show it.
 *
 * No special-casing on WHICH operator follows is needed: for a leading `+` both rules
 * agree in value (`@craftingmod + 1d20` → `+ 1d20`, same total as `1d20`), so keeping it
 * is correct in both directions.
 */
const RETIRED_MODIFIER_STRIP_RE = /\s*[+-]\s*@craftingmod\b|@craftingmod\b/g;

/** The additive operators either side of the token may carry and still be strippable. */
const ADDITIVE_OPERATORS = new Set(['+', '-']);

/** The run of additive operators and whitespace immediately BEFORE a placement. */
const TRAILING_ADDITIVE_RUN_RE = /[+\-\s]*$/;

/**
 * The bracket pairs that open a fresh `Expression` scope in Foundry's grammar.
 *
 * `Parenthetical`, `FunctionTerm`, `PoolTerm` and a `DiceTerm`'s number each parse their
 * contents as a nested `Expression`, so a term inside one is NOT additively commutable
 * with the top level. `[`/`]` is deliberately absent: those delimit `Flavor`, which is
 * text, not an expression scope.
 */
const GROUP_OPENERS = new Set(['(', '{']);
const GROUP_CLOSERS = new Set([')', '}']);

/**
 * The bracket nesting depth at an offset. Anything other than 0 means the placement sits
 * inside a nested expression scope.
 *
 * A malformed formula can drive this negative (a stray `)`); that is reported as non-zero
 * like any other depth, so it is refused rather than guessed at.
 */
function groupDepthBefore(text, index) {
  let depth = 0;
  for (const character of text.slice(0, index)) {
    if (GROUP_OPENERS.has(character)) depth += 1;
    else if (GROUP_CLOSERS.has(character)) depth -= 1;
  }
  return depth;
}

/**
 * Classify every occurrence of the retired placeholder in a formula, WITHOUT a dice
 * engine — the fact base both the runtime shim and the Foundry-free `1.21.0`
 * migration reason from, so the two can never disagree about what a placement is.
 *
 * A placement is ADDITIVE — and therefore liftable out of the formula and re-appended as
 * a trailing term — only when ALL FOUR hold:
 *
 * 1. **It sits at bracket depth 0.** The appended `+ N[Modifiers]` term always lands at
 *    the END of the WHOLE formula, so lifting the placeholder out is sound only where the
 *    two positions are additively interchangeable. Inside a `Parenthetical`,
 *    `FunctionTerm`, `PoolTerm` or a `DiceTerm`'s number, they are not.
 * 2. **The run of additive operators immediately before it is at most ONE.** A longer run
 *    (`1d20 - -@craftingmod`) cannot be consumed by taking "the adjacent operator": the
 *    strip would take the nearest one and leave `1d20 -` dangling on disk.
 * 3. **That run is EMPTY only when the placeholder is LEADING** — equivalently, the nearest
 *    non-whitespace character BEFORE it is absent or a single `+`/`-`. An empty run after a
 *    preceding term means that term binds the placeholder multiplicatively or opens a group
 *    (`1d20 * @craftingmod`, `(@craftingmod)`), so there is no operator for the strip to
 *    consume and the two positions are not interchangeable.
 *    THIS CLAUSE IS NOT IMPLIED BY 2, and leaving it out of the prose statement of the rule
 *    made that statement FALSE wherever it was repeated: `*` is not an additive operator,
 *    so `1d20 * @craftingmod` has an EMPTY run before the placeholder and satisfies 1, 2
 *    and 4.
 * 4. **The nearest non-whitespace character after it is absent or `+`/`-`.** Anything else
 *    (`1d20 + @craftingmod * 2`) means the placeholder binds tighter than addition, so
 *    removing it re-associates the arithmetic.
 *
 * EVERY OTHER PLACEMENT IS REFUSED, and the reason is arithmetic, not syntax. This was
 * stated wrongly at first and the correction matters: it is NOT that stripping "yields a
 * formula the grammar refuses". Sometimes it does (`1d20 * ` dangles, `()` is empty), but
 * often it does not — `(1d20 + @craftingmod) * 2` strips to `(1d20 ) * 2`, which parses
 * perfectly and is simply WRONG: the modifier was inside a sub-expression being scaled, so
 * it contributed `3 * 2 = 6`, and an appended top-level `+ 3[Modifiers]` contributes `3`.
 * Silently halving it is worse than refusing. Refusal is the only lossless answer, and the
 * predicate above — not the list of shapes below — is the rule.
 *
 * Worked examples of the refused shapes, each measured at scalar 3:
 *
 * | authored | if it were stripped | old total | new total |
 * |---|---|---|---|
 * | `1d20 * @craftingmod` | `1d20 * ` | — | throws |
 * | `max(@craftingmod, 2)` | `max(, 2)` | 3 | `-Infinity` |
 * | `(@craftingmod)d6` | `()d6` | 3d6 | throws |
 * | `(2 + @craftingmod + 4) * 3` | `(2 + 4) * 3` | 27 | 21 |
 * | `max(2 + @craftingmod + 4, 10)` | `max(2 + 4, 10)` | 10 | 13 |
 * | `(2 + @craftingmod + 4)d6` | `(2 + 4)d6` | 9d6 | 6d6 + 3 |
 *
 * The last three are the dangerous ones: a VALID formula with a WRONG total. They are the
 * reason condition 1 is a depth scan rather than a check of the two adjacent characters —
 * an INTERIOR placement has `+` on both sides and no adjacent bracket to notice.
 *
 * THIS CLASSIFIER IS THE DECISION, NOT `Roll.validate`. `Roll.validate('max(, 2)')` returns
 * TRUE: `FunctionTerm`'s head is `Expression?` — OPTIONAL — so it parses to a
 * `FunctionTerm` carrying ZERO argument terms, `isDeterministic` is `terms.every(...)` over
 * an empty array and answers `true`, `_evaluateSync` calls `Math.max()` with no arguments
 * and yields `-Infinity`, and `Roll#total` is `Number(this._total) || 0`, which lets that
 * through. A residue check that trusted `Roll.validate` would hand that world a permanent,
 * silent `-Infinity` against its DC on every craft — a rolled, and therefore CONSUMING,
 * automatic failure.
 *
 * So a non-additive placement is never stripped and never validated. The migration leaves
 * such a formula untouched on disk and REPORTS it; the runtime shim answers `''` for it,
 * so the usability readers report "no formula" and the check is disabled until a GM edits
 * it. Silently disabling beats silently mis-rolling.
 *
 * SUBTRACTIVE is reported only for placements that are actually ADDITIVE, because it names
 * a sign inversion that can only happen where the strip-and-append runs: `1d20 - @craftingmod`
 * rolled `1d20 - (3)` and now rolls `1d20 + 3[Modifiers]`, a 2×scalar swing. Condition 2
 * is what keeps this a single-character test — Foundry collapses an additive run by PARITY
 * of `-` (`RollParser#_collapseOperators`), so `2 - +@craftingmod` is effectively negative
 * and `2 - -@craftingmod` effectively positive; refusing runs longer than one means no
 * surviving placement has a parity to compute.
 *
 * @param {string} formula
 * @returns {{ present: boolean, occurrences: number, subtractive: boolean, nonAdditive: boolean }}
 */
export function describeRetiredModifierPlaceholder(formula) {
  const text = String(formula ?? '');
  const empty = { present: false, occurrences: 0, subtractive: false, nonAdditive: false };
  if (!RETIRED_MODIFIER_TOKEN_RE.test(text)) return empty;

  let occurrences = 0;
  let subtractive = false;
  let nonAdditive = false;
  for (const match of text.matchAll(RETIRED_MODIFIER_TOKEN_GLOBAL_RE)) {
    occurrences += 1;
    const before = text.slice(0, match.index);
    const after = text.slice(match.index + RETIRED_MODIFIER_TOKEN.length).trimStart();

    // 1. Nested inside a bracket group: the appended term cannot reproduce it.
    if (groupDepthBefore(text, match.index) !== 0) {
      nonAdditive = true;
      continue;
    }

    // 2. The operator run this strip would have to consume.
    const operatorRun = TRAILING_ADDITIVE_RUN_RE.exec(before)[0];
    const operators = operatorRun.replaceAll(/\s+/g, '');
    const head = before.slice(0, before.length - operatorRun.length);
    if (operators.length > 1) {
      nonAdditive = true;
      continue;
    }
    // 3. No operator at all is only legal when nothing precedes the placeholder; otherwise
    // the previous term binds it multiplicatively or opens a group.
    if (operators.length === 0 && head.trim() !== '') {
      nonAdditive = true;
      continue;
    }

    // 4. What follows must be the end of the formula, or another additive term.
    const nextCharacter = after.charAt(0);
    if (nextCharacter !== '' && !ADDITIVE_OPERATORS.has(nextCharacter)) {
      nonAdditive = true;
      continue;
    }

    if (operators === '-') subtractive = true;
  }
  return { present: true, occurrences, subtractive, nonAdditive };
}

/**
 * BELT AND BRACES, NOT DESCRIBED BEHAVIOUR — and it is labelled that way because it was
 * claimed as live protection in four places and is not.
 *
 * A residue can only OPEN with `*`, `/` or `%` if the placeholder was LEADING (nothing but
 * whitespace before it) and the nearest non-whitespace character AFTER it was one of those
 * operators — which condition 3 of the classifier already refuses, before any residue
 * exists. Neutering this pattern to one that matches nothing leaves the whole suite green,
 * and a sweep over every generated placement shape finds no additive placement whose
 * residue can reach it. It is kept as a cheap invariant against a future loosening of
 * condition 3, not because any input reaches it today; the sweep in
 * `crafting-check-expression.test.js` asserts that unreachability rather than asserting the
 * guard fires.
 */
const RESIDUE_LEADS_WITH_MULTIPLICATIVE_RE = /^\s*[*/%]/;

/**
 * A residue ending in ANY binary operator has lost its right operand. THIS one is live: an
 * authored `1d20 - @craftingmod -` is an ADDITIVE placement by every clause of the
 * classifier, and its residue `1d20 -` is what the migration would otherwise persist.
 */
const RESIDUE_TRAILS_WITH_OPERATOR_RE = /[+\-*/%]\s*$/;

/**
 * Whether a residue is a whole expression rather than one missing an operand.
 *
 * Structural, not semantic: it answers "could this ever be a complete formula", which is
 * a question no dice engine is needed for, and is therefore safe to enforce on the
 * engine-free migration path that writes to disk.
 *
 * The TRAILING-operator half is the one that does the work; the leading-multiplicative half
 * is belt and braces (see its own note). A LEADING `+`/`-` passes, because
 * `Expression = _ leading:(_ @Additive)* _ head:Term …` admits one and the leading-token
 * strip rule depends on it.
 */
function isStructurallyWholeResidue(residue) {
  return (
    !RESIDUE_LEADS_WITH_MULTIPLICATIVE_RE.test(residue) &&
    !RESIDUE_TRAILS_WITH_OPERATOR_RE.test(residue)
  );
}

/**
 * Strip the retired `@craftingmod` placeholder from a roll formula, TOTALLY: the value
 * handed onward is always either a formula that rolls what the GM meant, or the empty
 * string. Never a dangling operator, and never a formula that parses into something the
 * GM did not author.
 *
 * The rule, stated once for the whole stack:
 *
 * 1. **No-token short-circuit.** A formula not containing the token is returned untouched
 *    WITHOUT calling `Roll.validate`, so the overwhelming-majority path adds no Foundry
 *    dependency at all and cannot be disabled by a hostile `Roll` stub.
 * 2. **A NON-ADDITIVE placement returns `''` — unstripped and unvalidated.** The position
 *    is decided by {@link describeRetiredModifierPlaceholder}, which is a positional test,
 *    NOT by asking `Roll.validate` about the residue. That distinction is the whole
 *    correctness of this function: `Roll.validate('max(, 2)')` returns TRUE (see the note
 *    on the classifier), so delegating the decision would let a `max(@craftingmod, 2)`
 *    formula roll `-Infinity` against its DC on every craft, forever, silently. `''` here
 *    makes the usability readers report "no formula", which disables the check until a GM
 *    edits it — the honest failure.
 * 3. Otherwise strip the token together with its PRECEDING additive operator — and, for a
 *    LEADING token, the token ALONE, keeping the operator that follows it, because a
 *    leading `Additive` is legal and carries its sign, so `@craftingmod - 2` must reduce
 *    to `- 2` and not to `2` (see the note on the strip pattern for the arithmetic).
 *    Word-boundary matched, so a hypothetical `@craftingmodifier` is untouched. A residue
 *    reducing to empty returns `''`.
 * 4. **A STRUCTURAL residue check, before any dice engine is consulted.** A residue that
 *    ends with any binary operator returns `''` (a residue OPENING with `*`, `/` or `%` is
 *    refused too, but that half is belt and braces — see its own note; condition 3 of the
 *    classifier has already refused every placement that could produce one). This is an
 *    INVARIANT, not a validation, and the distinction is what makes it correct: the
 *    only caller that WRITES TO DISK — the `1.21.0` migration — deliberately passes
 *    `Roll = null`, so it takes the fail-open branch at step 6 and would otherwise have no
 *    residue check whatever. An authored formula can end in an operator
 *    (`1d20 - @craftingmod -`), and persisting `1d20 -` makes every later craft throw
 *    inside `new Roll(...)` as a rolled — therefore CONSUMING — permanent failure, with
 *    the shim short-circuiting because there is no token left to notice.
 *    A LEADING `+`/`-` is deliberately NOT rejected: `Expression` admits a leading
 *    `Additive`, and step 3 relies on that.
 * 5. **Belt and braces on top**: validate the residue with `Roll.validate` called as a
 *    METHOD, and return `''` if it is rejected. `Roll.validate` is a static that does
 *    `new this(formula)` internally, so a DETACHED reference leaves `this` undefined and
 *    returns `false` for EVERY formula — the trap documented at `checkRoll.js`'s
 *    situational-bonus net.
 * 6. **Fail OPEN when the global is absent** (headless, tests), following the shipped
 *    precedent in `evaluateCheckRoll`'s situational-bonus net: the residue is KEPT rather
 *    than emptied. The direction matters more than usual — returning `''` when the global
 *    is missing would report `noFormula` and silently disable an authored check. It
 *    relaxes step 5 ONLY. Steps 2 and 4 are positional and structural, so they hold
 *    identically with or without a dice engine; fail-open must never relax an invariant.
 *
 * @param {string} formula
 * @param {typeof globalThis.Roll} [Roll]
 * @returns {string}
 */
export function stripRetiredModifierPlaceholder(formula, Roll = globalThis.Roll) {
  const plan = planRetiredPlaceholderStrip(formula, Roll);
  return plan.outcome === 'refused' ? '' : plan.formula;
}

/**
 * The full decision behind {@link stripRetiredModifierPlaceholder}, for the ONE caller
 * that needs to tell its two `''` answers apart.
 *
 * The shim collapses "this formula was ONLY the placeholder, so it is now empty"
 * (`stripped` with `formula: ''`) and "this formula cannot be rewritten, so treat it as
 * unusable" (`refused`) into the same `''`, because every RUNTIME reader wants the same
 * thing from both: report no formula, roll nothing. The `1.21.0` migration is the
 * exception — it WRITES — and the two demand opposite actions: persist the empty string
 * for the first, and leave the field exactly as authored while counting it for the second.
 *
 * Sharing this rather than re-deriving the strip in the migration is what keeps the
 * runtime and the on-disk rewrite from ever disagreeing about a placement.
 *
 * @param {string} formula
 * @param {typeof globalThis.Roll} [Roll]
 * @returns {{ placement: ReturnType<typeof describeRetiredModifierPlaceholder>,
 *   outcome: 'absent'|'stripped'|'refused', formula: string }}
 *   `formula` is the value to hand on for `absent`/`stripped`, and the UNCHANGED input for
 *   `refused`.
 */
export function planRetiredPlaceholderStrip(formula, Roll = globalThis.Roll) {
  const text = String(formula ?? '');
  const placement = describeRetiredModifierPlaceholder(text);
  if (!placement.present) return { placement, outcome: 'absent', formula: text };
  if (placement.nonAdditive) return { placement, outcome: 'refused', formula: text };

  const residue = text.replaceAll(RETIRED_MODIFIER_STRIP_RE, '').trim();
  if (residue === '') return { placement, outcome: 'stripped', formula: '' };
  if (!isStructurallyWholeResidue(residue)) return { placement, outcome: 'refused', formula: text };
  if (typeof Roll?.validate !== 'function') {
    return { placement, outcome: 'stripped', formula: residue };
  }
  if (Roll.validate(residue) === false) return { placement, outcome: 'refused', formula: text };
  return { placement, outcome: 'stripped', formula: residue };
}

/**
 * Extract the dice groups (e.g. `2d6`, `d20`) from a roll expression, in order
 * of appearance. Flat modifiers, operators, and actor references (e.g.
 * `@attributes.con.mod`) are ignored. A bare `dN` counts as a single die.
 *
 * This scans only the `NdS` core, so a modified pool is reported under its
 * STRIPPED key (e.g. `2d20kh1` becomes `2d20`). Use {@link parsePlainDiceGroups}
 * when only plain, crit-eligible terms should match, since that excludes
 * modified pools rather than stripping them.
 * @param {string} expression
 * @returns {{ raw: string, count: number, sides: number }[]}
 */
export function parseDiceGroups(expression) {
  const groups = [];
  const scanner = /(\d*)d(\d+)/gi;
  const text = String(expression ?? '');
  let match;
  while ((match = scanner.exec(text)) !== null) {
    const count = match[1] === '' ? 1 : Number(match[1]);
    const sides = Number(match[2]);
    if (count >= 1 && sides >= 1) groups.push({ raw: `${count}d${sides}`, count, sides });
  }
  return groups;
}

/**
 * Canonical plain `NdS` form for a die term: bare `dN` ≡ `1dN`. Returns null
 * when the term is not a plain `NdS` die core (count and sides both >= 1).
 * @param {string} term A single die term (already isolated, e.g. `2d6`, `d20`).
 * @returns {{ raw: string, count: number, sides: number } | null}
 */
function parsePlainTerm(term) {
  const match = /^(\d*)d(\d+)$/i.exec(String(term ?? '').trim());
  if (!match) return null;
  const count = match[1] === '' ? 1 : Number(match[1]);
  const sides = Number(match[2]);
  if (count < 1 || sides < 1) return null;
  return { raw: `${count}d${sides}`, count, sides };
}

/**
 * Whether a die term is a PLAIN, unmodified `NdS` die (crit-eligible). Plain
 * means the `NdS` core is the whole term: bare `dN` is treated as `1dN`. A term
 * is crit-INELIGIBLE when anything other than the canonical core is present —
 * i.e. any keep/drop/explode/reroll/min/max/count modifier (e.g. `2d20kh1`,
 * `4d6dl1`, `1d6x`, `2d10r1`, `2d6min2`). Classification is by modifier
 * PRESENCE, not a token blocklist, so future Foundry modifiers cannot slip
 * through: only a string that parses cleanly as `NdS` (optionally bare `dN`) is
 * plain. Bracketed flavor and surrounding operators are handled by
 * {@link parsePlainDiceGroups}, which isolates each term before classifying.
 * @param {string} term
 * @returns {boolean}
 */
export function isPlainDieTerm(term) {
  return parsePlainTerm(term) !== null;
}

/**
 * Extract the PLAIN (crit-eligible), unmodified dice groups from a roll
 * expression, in order of appearance, in canonical `NdS` form (bare `dN` ≡
 * `1dN`). Modified pools (keep/drop/explode/reroll/min/max/count, e.g.
 * `2d20kh1`, `4d6dl1`, `1d6x`, `2d10r1`) are EXCLUDED: their per-die-total range
 * is not the plain `[N, N*S]` sum a crit is matched against, so they are not
 * crit-eligible. Flat modifiers, operators, and actor references are ignored.
 *
 * A term is plain only when its whole token is the `NdS` core (bare `dN` ≡
 * `1dN`). The expression is split on whitespace, operators, parens, and flavor
 * brackets, and each resulting token is classified by {@link parsePlainTerm}.
 * Modifiers attach directly to the core (e.g. `kh`, `dl`, `x`, `r`, `min`,
 * `cs>`), so a modified pool never tokenizes to a bare `NdS` and is excluded.
 * @param {string} expression
 * @returns {{ raw: string, count: number, sides: number }[]}
 */
export function parsePlainDiceGroups(expression) {
  const groups = [];
  // Split on whitespace, operators, parens, and flavor brackets so each token is
  // a single term, then keep only the ones that are a whole plain `NdS` die. A
  // modified pool (`2d20kh1`, `4d6dl1`, …) keeps its modifier in-token, so the
  // anchored parse in parsePlainTerm rejects it — no backtracking scanner needed.
  for (const token of String(expression ?? '').split(/[\s+\-*/%(),[\]]+/)) {
    const plain = token ? parsePlainTerm(token) : null;
    if (plain) groups.push(plain);
  }
  return groups;
}

/**
 * Whether a roll expression contains a plain, unmodified `1d20` (bare `d20` ≡
 * `1d20`) term — the gate for offering Advantage/Disadvantage on an interactive
 * roll. False for `2d20`, `d200`, and any modified pool (`2d20kh1`), reusing the
 * same plain-term classifier as {@link parsePlainDiceGroups}.
 * @param {string} formula
 * @returns {boolean}
 */
export function hasPlainD20(formula) {
  return parsePlainDiceGroups(formula).some((group) => group.raw === '1d20');
}

/**
 * Rewrite the FIRST plain `1d20`/bare `d20` term of a roll expression into a
 * keep-highest (`2d20kh1`, advantage) or keep-lowest (`2d20kl1`, disadvantage)
 * pool. Any other `mode`, or an expression with no plain `1d20`, returns the
 * formula unchanged. Only a whole plain `NdS` token matches (bare `dN` ≡ `1dN`),
 * so `2d20`, `d200`, and already-modified pools are left alone.
 * @param {string} formula
 * @param {'advantage'|'disadvantage'|string} mode
 * @returns {string}
 */
export function applyD20Advantage(formula, mode) {
  const text = String(formula ?? '');
  if (mode !== 'advantage' && mode !== 'disadvantage') return text;
  const replacement = mode === 'advantage' ? '2d20kh1' : '2d20kl1';
  let replaced = false;
  // Match maximal non-separator runs (the complement of the term separators used
  // by parsePlainDiceGroups), so each token is a single term. Replace only the
  // first token that is a whole plain `1d20`.
  return text.replaceAll(/[^\s+\-*/%(),[\]]+/g, (token) => {
    if (replaced) return token;
    const plain = parsePlainTerm(token);
    if (plain && plain.raw === '1d20') {
      replaced = true;
      return replacement;
    }
    return token;
  });
}

/**
 * Whether two inclusive integer ranges intersect.
 * @param {{ start: number, end: number }} a
 * @param {{ start: number, end: number }} b
 */
export function rangesOverlap(a, b) {
  if (!a || !b) return false;
  return Number(a.start) <= Number(b.end) && Number(b.start) <= Number(a.end);
}

/**
 * Classify a list of fixed-mode outcome ranges: which overlap another range and
 * which are themselves invalid (start greater than end). Invalid ranges are not
 * compared for overlap.
 * @param {{ start: number, end: number }[]} ranges
 * @returns {{ overlapping: Set<number>, invalid: Set<number> }}
 */
export function findRangeConflicts(ranges) {
  const list = Array.isArray(ranges) ? ranges : [];
  const overlapping = new Set();
  const invalid = new Set();

  for (const [index, range] of list.entries()) {
    if (!range || Number(range.start) > Number(range.end)) invalid.add(index);
  }

  for (let i = 0; i < list.length; i += 1) {
    if (invalid.has(i)) continue;
    for (let j = i + 1; j < list.length; j += 1) {
      if (invalid.has(j)) continue;
      if (rangesOverlap(list[i], list[j])) {
        overlapping.add(i);
        overlapping.add(j);
      }
    }
  }

  return { overlapping, invalid };
}
