/**
 * Parsing and validation helpers for crafting-check roll expressions and the fixed-mode outcome
 * tier ranges built on top of them.
 */

/** The retired Fabricate-owned placeholder. */
export const RETIRED_MODIFIER_TOKEN = '@craftingmod';

/** Word-boundary presence test. */
const RETIRED_MODIFIER_TOKEN_RE = /@craftingmod\b/;

/** The global twin, used only where every occurrence must be visited. */
const RETIRED_MODIFIER_TOKEN_GLOBAL_RE = /@craftingmod\b/g;

/**
 * Strip the token together with its PRECEDING additive operator (`1d20 + @craftingmod` → `1d20`),
 * else the bare token alone (`1d20 * @craftingmod` → `1d20 * `, which the residue check below then
 * rejects).
 */
const RETIRED_MODIFIER_STRIP_RE = /\s*[+-]\s*@craftingmod\b|@craftingmod\b/g;

/** The additive operators either side of the token may carry and still be strippable. */
const ADDITIVE_OPERATORS = new Set(['+', '-']);

/** The run of additive operators and whitespace immediately BEFORE a placement. */
const TRAILING_ADDITIVE_RUN_RE = /[+\-\s]*$/;

/** The bracket pairs that open a fresh `Expression` scope in Foundry's grammar. */
const GROUP_OPENERS = new Set(['(', '{']);
const GROUP_CLOSERS = new Set([')', '}']);

/** The bracket nesting depth at an offset. */
function groupDepthBefore(text, index) {
  let depth = 0;
  for (const character of text.slice(0, index)) {
    if (GROUP_OPENERS.has(character)) depth += 1;
    else if (GROUP_CLOSERS.has(character)) depth -= 1;
  }
  return depth;
}

/**
 * Classify every occurrence of the retired placeholder in a formula, WITHOUT a dice engine — the
 * fact base both the runtime shim and the Foundry-free `1.21.0` migration reason from, so the two
 * can never disagree about what a placement is.
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

    // 1.
    if (groupDepthBefore(text, match.index) !== 0) {
      nonAdditive = true;
      continue;
    }

    // 2.
    const operatorRun = TRAILING_ADDITIVE_RUN_RE.exec(before)[0];
    const operators = operatorRun.replaceAll(/\s+/g, '');
    const head = before.slice(0, before.length - operatorRun.length);
    if (operators.length > 1) {
      nonAdditive = true;
      continue;
    }
    // 3.
    if (operators.length === 0 && head.trim() !== '') {
      nonAdditive = true;
      continue;
    }

    // 4.
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
 * BELT AND BRACES, NOT DESCRIBED BEHAVIOUR — and it is labelled that way because it was claimed as
 * live protection in four places and is not.
 */
const RESIDUE_LEADS_WITH_MULTIPLICATIVE_RE = /^\s*[*/%]/;

/** A residue ending in ANY binary operator has lost its right operand. */
const RESIDUE_TRAILS_WITH_OPERATOR_RE = /[+\-*/%]\s*$/;

/** Whether a residue is a whole expression rather than one missing an operand. */
function isStructurallyWholeResidue(residue) {
  return (
    !RESIDUE_LEADS_WITH_MULTIPLICATIVE_RE.test(residue) &&
    !RESIDUE_TRAILS_WITH_OPERATOR_RE.test(residue)
  );
}

/**
 * Strip the retired `@craftingmod` placeholder from a roll formula, TOTALLY: the value handed
 * onward is always either a formula that rolls what the GM meant, or the empty string.
 */
export function stripRetiredModifierPlaceholder(formula, Roll = globalThis.Roll) {
  const plan = planRetiredPlaceholderStrip(formula, Roll);
  return plan.outcome === 'refused' ? '' : plan.formula;
}

/**
 * The full decision behind {@link stripRetiredModifierPlaceholder}, for the ONE caller that needs
 * to tell its two `''` answers apart.
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

/** Extract the dice groups (e.g. */
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

/** Canonical plain `NdS` form for a die term: bare `dN` ≡ `1dN`. */
function parsePlainTerm(term) {
  const match = /^(\d*)d(\d+)$/i.exec(String(term ?? '').trim());
  if (!match) return null;
  const count = match[1] === '' ? 1 : Number(match[1]);
  const sides = Number(match[2]);
  if (count < 1 || sides < 1) return null;
  return { raw: `${count}d${sides}`, count, sides };
}

/** Whether a die term is a PLAIN, unmodified `NdS` die (crit-eligible). */
export function isPlainDieTerm(term) {
  return parsePlainTerm(term) !== null;
}

/**
 * Extract the PLAIN (crit-eligible), unmodified dice groups from a roll expression, in order of
 * appearance, in canonical `NdS` form (bare `dN` ≡ `1dN`).
 */
export function parsePlainDiceGroups(expression) {
  const groups = [];
  // Split on whitespace, operators, parens, and flavor brackets so each token is a single term,
  // then keep only the ones that are a whole plain `NdS` die.
  for (const token of String(expression ?? '').split(/[\s+\-*/%(),[\]]+/)) {
    const plain = token ? parsePlainTerm(token) : null;
    if (plain) groups.push(plain);
  }
  return groups;
}

/**
 * Whether a roll expression contains a plain, unmodified `1d20` (bare `d20` ≡ `1d20`) term — the
 * gate for offering Advantage/Disadvantage on an interactive roll.
 */
export function hasPlainD20(formula) {
  return parsePlainDiceGroups(formula).some((group) => group.raw === '1d20');
}

/**
 * Rewrite the FIRST plain `1d20`/bare `d20` term of a roll expression into a keep-highest
 * (`2d20kh1`, advantage) or keep-lowest (`2d20kl1`, disadvantage) pool.
 */
export function applyD20Advantage(formula, mode) {
  const text = String(formula ?? '');
  if (mode !== 'advantage' && mode !== 'disadvantage') return text;
  const replacement = mode === 'advantage' ? '2d20kh1' : '2d20kl1';
  let replaced = false;
  // Match maximal non-separator runs (the complement of the term separators used by
  // parsePlainDiceGroups), so each token is a single term.
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

/** Whether two inclusive integer ranges intersect. */
export function rangesOverlap(a, b) {
  if (!a || !b) return false;
  return Number(a.start) <= Number(b.end) && Number(b.start) <= Number(a.end);
}

/**
 * Classify a list of fixed-mode outcome ranges: which overlap another range and which are
 * themselves invalid (start greater than end).
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
