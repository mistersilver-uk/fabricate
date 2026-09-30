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

const TOP_LEVEL_OPERATORS = new Set(['+', '-', '*', '/', '%']);
const NESTING_OPENERS = new Set(['(', '{', '[']);
const NESTING_CLOSERS = new Set([')', '}', ']']);

/**
 * A formula's top-level terms in order, outside `()`, `{}`, function calls and `[flavour]`, each
 * `{ operator, operatorIndex, text }` with the operator before it (`null` for the first). A sign
 * with no left operand leaves an empty-text term before the one it signs.
 */
export function splitTopLevelTerms(formula) {
  const text = String(formula ?? '');
  const terms = [];
  let depth = 0;
  let start = 0;
  let previous = { operator: null, operatorIndex: -1 };
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (NESTING_OPENERS.has(character)) depth += 1;
    else if (NESTING_CLOSERS.has(character)) depth -= 1;
    else if (depth === 0 && TOP_LEVEL_OPERATORS.has(character)) {
      terms.push({ ...previous, text: text.slice(start, index).trim() });
      previous = { operator: character, operatorIndex: index };
      start = index + 1;
    }
  }
  terms.push({ ...previous, text: text.slice(start).trim() });
  return terms;
}

const FLAVOUR_SPANS = /\[[^\]]*\]/g;
const HAS_DIE = /(?:^|[^\w@.])\d*(?:\.\d+)?d(?:\d|\(|@|[a-z])/i;
const POSITIVE_LITERAL = /^\d+(?:\.\d+)?$/;
const DYNAMIC_GROUP = /^(?:\([^()]*\)|@[\w.-]+)d|^\d*(?:\.\d+)?d[(@]/i;
const NON_NUMERIC_DIE = /^\d*d[a-z]/i;
const LITERAL_GROUP = /^(\d*(?:\.\d+)?)d(\d+(?:\.\d+)?)$/i;
const MODIFIED_GROUP = /^\d*(?:\.\d+)?d\d+\S/i;

/** A leading unary `+` (the retirement shim's `+ 1d20` residue) signs nothing; others stay. */
const unarySign = (lead, signs) => (lead.operator === null && signs === '+' ? null : signs);

/** Each non-empty term, carrying the signs the empty terms before it left, its flavour stripped. */
function signedOperands(formula) {
  const operands = [];
  let lead = null;
  let signs = '';
  for (const term of splitTopLevelTerms(formula)) {
    if (term.text === '') {
      if (lead) signs += term.operator;
      lead ??= term;
      continue;
    }
    const bare = term.text.replaceAll(FLAVOUR_SPANS, '').trim();
    operands.push(
      lead
        ? {
            ...term,
            bare,
            operator: lead.operator,
            operatorIndex: lead.operatorIndex,
            sign: unarySign(lead, signs + term.operator),
          }
        : { ...term, bare, sign: null }
    );
    lead = null;
    signs = '';
  }
  return operands;
}

const isPositiveLiteral = (operand) =>
  Boolean(operand) &&
  operand.sign === null &&
  POSITIVE_LITERAL.test(operand.bare) &&
  Number(operand.bare) > 0;

/**
 * Added at index 0 or after `+`, multiplied only by positive literals on either side: a `*` chain
 * before it, a `*`/`/` chain after it. `%` and references are never factors.
 */
function inAdditivePosition(operands, index) {
  let head = index;
  while (operands[head].operator === '*' && isPositiveLiteral(operands[head - 1])) head -= 1;
  let next = index + 1;
  while (['*', '/'].includes(operands[next]?.operator)) {
    if (!isPositiveLiteral(operands[next])) return false;
    next += 1;
  }
  const leads = [null, '+'].includes(operands[head].operator);
  const trails = next === operands.length || ['+', '-'].includes(operands[next].operator);
  return operands[index].sign === null && leads && trails;
}

/** Why a first dice group is not a plain literal `NdS`, or null when it is one. */
function groupShapeRefusal(bare) {
  if (DYNAMIC_GROUP.test(bare)) return 'dynamic';
  if (NON_NUMERIC_DIE.test(bare)) return 'not-die';
  const literal = LITERAL_GROUP.exec(bare);
  if (literal) {
    const number = literal[1] === '' ? 1 : Number(literal[1]);
    const faces = Number(literal[2]);
    return Number.isInteger(number) && number >= 1 && Number.isInteger(faces) && faces >= 2
      ? null
      : 'invalid';
  }
  return MODIFIED_GROUP.test(bare) ? 'modified' : 'nested';
}

/**
 * The authored formula's FIRST top-level dice group, the one advantage keeps from (issue 2007):
 * `{ ok: true, number, faces, prefix, referenceFirst }` when it is a plain literal `NdS` in an
 * additive position, else `{ ok: false, reason }`. A refused first group is never skipped for a
 * later one. `prefix` is the authored text before the group's connecting operator.
 */
export function findKeepGroup(authoredFormula) {
  const formula = String(authoredFormula ?? '');
  const operands = signedOperands(formula);
  const index = operands.findIndex((operand) => HAS_DIE.test(operand.bare));
  if (index === -1) return { ok: false, reason: 'none' };
  const group = operands[index];
  // Foundry constructs a negated operand as the parenthetical `(1d20 * -1)`.
  if (group.sign?.includes('-')) return { ok: false, reason: 'nested' };
  const refusal = groupShapeRefusal(group.bare);
  if (refusal) return { ok: false, reason: refusal };
  if (!inAdditivePosition(operands, index)) return { ok: false, reason: 'position' };
  const [, number, faces] = LITERAL_GROUP.exec(group.bare);
  return {
    ok: true,
    number: number === '' ? 1 : Number(number),
    faces: Number(faces),
    prefix: group.operator === null ? '' : formula.slice(0, group.operatorIndex).trim(),
    referenceFirst: operands.slice(0, index).some((operand) => operand.bare.includes('@')),
  };
}

/** A stored `rollFormula`'s keep proof, read after the retirement shim as the engine reads it. */
export function keepGroupOf(rollFormula, Roll = globalThis.Roll) {
  return findKeepGroup(stripRetiredModifierPlaceholder(rollFormula, Roll));
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
