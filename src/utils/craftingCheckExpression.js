/** Parsing and validation for crafting-check roll expressions and fixed-mode tier ranges. */

/** The retired Fabricate-owned placeholder. */
export const RETIRED_MODIFIER_TOKEN = '@craftingmod';

const RETIRED_MODIFIER_TOKEN_RE = /@craftingmod\b/;

const RETIRED_MODIFIER_TOKEN_GLOBAL_RE = /@craftingmod\b/g;

/** With its preceding additive operator; else bare, leaving a residue the check rejects. */
const RETIRED_MODIFIER_STRIP_RE = /\s*[+-]\s*@craftingmod\b|@craftingmod\b/g;

const ADDITIVE_OPERATORS = new Set(['+', '-']);

const TRAILING_ADDITIVE_RUN_RE = /[+\-\s]*$/;

/** Brackets opening a fresh `Expression` scope in Foundry's grammar. */
const GROUP_OPENERS = new Set(['(', '{']);
const GROUP_CLOSERS = new Set([')', '}']);

function groupDepthBefore(text, index) {
  let depth = 0;
  for (const character of text.slice(0, index)) {
    if (GROUP_OPENERS.has(character)) depth += 1;
    else if (GROUP_CLOSERS.has(character)) depth -= 1;
  }
  return depth;
}

/**
 * Classify every placeholder occurrence without a dice engine, the one fact base the runtime shim
 * and the `1.21.0` migration share.
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

    // Inside a bracket group, a non-additive context.
    if (groupDepthBefore(text, match.index) !== 0) {
      nonAdditive = true;
      continue;
    }

    const operatorRun = TRAILING_ADDITIVE_RUN_RE.exec(before)[0];
    const operators = operatorRun.replaceAll(/\s+/g, '');
    const head = before.slice(0, before.length - operatorRun.length);
    if (operators.length > 1) {
      nonAdditive = true;
      continue;
    }
    // Code before it with no operator between.
    if (operators.length === 0 && head.trim() !== '') {
      nonAdditive = true;
      continue;
    }

    // Followed by anything but an additive operator.
    const nextCharacter = after.charAt(0);
    if (nextCharacter !== '' && !ADDITIVE_OPERATORS.has(nextCharacter)) {
      nonAdditive = true;
      continue;
    }

    if (operators === '-') subtractive = true;
  }
  return { present: true, occurrences, subtractive, nonAdditive };
}

/** A backstop, not relied-on behaviour. */
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

/** Total: a formula that rolls what the GM meant, or `''`. */
export function stripRetiredModifierPlaceholder(formula, Roll = globalThis.Roll) {
  const plan = planRetiredPlaceholderStrip(formula, Roll);
  return plan.outcome === 'refused' ? '' : plan.formula;
}

/** For the one caller that must tell the two `''` answers apart. */
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

/** Every `NdS` group in order, a bare `dN` counting as `1dN`. */
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

/** Bare `dN` ≡ `1dN`. */
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

/** The plain, crit-eligible dice groups in order, in canonical `NdS` form. */
export function parsePlainDiceGroups(expression) {
  const groups = [];
  for (const token of String(expression ?? '').split(/[\s+\-*/%(),[\]]+/)) {
    const plain = token ? parsePlainTerm(token) : null;
    if (plain) groups.push(plain);
  }
  return groups;
}

/** A plain `1d20` term: the gate for offering Advantage and Disadvantage. */
export function hasPlainD20(formula) {
  return parsePlainDiceGroups(formula).some((group) => group.raw === '1d20');
}

/** The first plain `1d20` becomes `2d20kh1` (advantage) or `2d20kl1` (disadvantage). */
export function applyD20Advantage(formula, mode) {
  const text = String(formula ?? '');
  if (mode !== 'advantage' && mode !== 'disadvantage') return text;
  const replacement = mode === 'advantage' ? '2d20kh1' : '2d20kl1';
  let replaced = false;
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

export function rangesOverlap(a, b) {
  if (!a || !b) return false;
  return Number(a.start) <= Number(b.end) && Number(b.start) <= Number(a.end);
}

/** Which ranges overlap another, and which are invalid (start after end). */
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
