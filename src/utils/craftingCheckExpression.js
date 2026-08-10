/**
 * Parsing and validation helpers for crafting-check roll expressions and the
 * fixed-mode outcome tier ranges built on top of them. Pure functions with no
 * Foundry or DOM dependencies, so the check editor and its unit tests share one
 * source of truth.
 *
 * This module also owns the RETIREMENT of the Fabricate-owned `@craftingmod`
 * placeholder (issue 1094). It lives here, beside the formula tokenizers it is a
 * sibling of, and NOT in `checkRoll.js`: the usability readers
 * (`craftingModifierResolver.js`, `salvageCheckUsability.js`) must call it, and
 * `checkRoll.js` already imports FROM `craftingModifierResolver.js`, so putting the
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

/**
 * Classify every occurrence of the retired placeholder in a formula, WITHOUT a dice
 * engine — the fact base both the runtime shim and the Foundry-free `1.21.0`
 * migration reason from, so the two can never disagree about what a placement is.
 *
 * A placement is ADDITIVE — and therefore strippable without wrecking the arithmetic —
 * only when the non-whitespace character on each side is either absent (start/end of
 * the formula) or an additive operator. Everything else is reported as NON-ADDITIVE:
 * `1d20 * @craftingmod` strips to `1d20 * `, `max(@craftingmod, 2)` to `max(, 2)`,
 * `(@craftingmod)` to `()` and `(@craftingmod)d6` to `()d6`.
 *
 * THIS CLASSIFIER IS THE DECISION, NOT `Roll.validate` — a correction, and the reason it
 * is stated here at length. Most of those residues DO throw in Foundry's grammar
 * (`Expression` requires a `Term` after each operator; `Constant` requires digits), but
 * **`max(, 2)` does not**: `FunctionTerm`'s head is `Expression?` — OPTIONAL — so it
 * parses to a `FunctionTerm` carrying ZERO argument terms, `isDeterministic` is
 * `terms.every(...)` over an empty array and answers `true`, `_evaluateSync` calls
 * `Math.max()` with no arguments and yields **`-Infinity`**, and `Roll#total` is
 * `Number(this._total) || 0`, which lets `-Infinity` through. `Roll.validate('max(, 2)')`
 * therefore returns TRUE, and a residue check that trusted it would hand every craft on
 * that system a permanent, silent `-Infinity` against its DC: a rolled — and therefore
 * CONSUMING — automatic failure, which is strictly worse than refusing to roll.
 *
 * So a non-additive placement is never stripped and never validated. The migration leaves
 * such a formula untouched on disk and REPORTS it; the runtime shim answers `''` for it,
 * so the usability readers report "no formula" and the check is disabled until a GM edits
 * it. Silently disabling beats silently mis-rolling.
 *
 * SUBTRACTIVE is keyed on the operator IMMEDIATELY BEFORE the token, which is the
 * only position whose sign the retirement inverts: `1d20 - @craftingmod` rolled
 * `1d20 - (3)` and now rolls `1d20 + 3[Modifiers]`, a 2×scalar swing.
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
    const before = text.slice(0, match.index).trimEnd();
    const after = text.slice(match.index + RETIRED_MODIFIER_TOKEN.length).trimStart();
    const previousCharacter = before.at(-1) ?? '';
    const nextCharacter = after.charAt(0);
    if (previousCharacter === '-') subtractive = true;
    const additive =
      (previousCharacter === '' || ADDITIVE_OPERATORS.has(previousCharacter)) &&
      (nextCharacter === '' || ADDITIVE_OPERATORS.has(nextCharacter));
    if (!additive) nonAdditive = true;
  }
  return { present: true, occurrences, subtractive, nonAdditive };
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
 * 4. **Belt and braces on the additive residue only**: validate it with `Roll.validate`
 *    called as a METHOD, and return `''` if it is rejected. `Roll.validate` is a static
 *    that does `new this(formula)` internally, so a DETACHED reference leaves `this`
 *    undefined and returns `false` for EVERY formula — the trap documented at
 *    `checkRoll.js`'s situational-bonus net.
 * 5. **Fail OPEN when the global is absent** (headless, tests), following the shipped
 *    precedent in `evaluateCheckRoll`'s situational-bonus net: the additive residue is
 *    KEPT rather than emptied. The direction matters more than usual — returning `''` when
 *    the global is missing would report `noFormula` and silently disable an authored
 *    check. It applies to step 4 ONLY: step 2's answer is positional, deterministic and
 *    engine-independent, so it is the same with or without a dice engine.
 *
 * @param {string} formula
 * @param {typeof globalThis.Roll} [Roll]
 * @returns {string}
 */
export function stripRetiredModifierPlaceholder(formula, Roll = globalThis.Roll) {
  const text = String(formula ?? '');
  const placement = describeRetiredModifierPlaceholder(text);
  if (!placement.present) return text;
  if (placement.nonAdditive) return '';
  const residue = text.replaceAll(RETIRED_MODIFIER_STRIP_RE, '').trim();
  if (residue === '') return '';
  if (typeof Roll?.validate !== 'function') return residue;
  return Roll.validate(residue) === false ? '' : residue;
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
