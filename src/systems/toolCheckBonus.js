/**
 * Stateless Tool prerequisite and check-bonus composition. Callers supply actors, prerequisite
 * definitions and evaluators explicitly, so presence, gates and bonuses cannot be satisfied by
 * different actors in a multi-actor attempt.
 */

export class ToolCheckEvidenceError extends Error {}

/** Whether an ingredient set's Tool references are active. Inactive ids stay serialized, so a
 *  mode switch or a restored set name is lossless; every reader checks this before using them. */
export function ingredientSetToolsAreActive(system, ingredientSet) {
  return (
    system?.resolutionMode === 'routedByIngredients' &&
    String(ingredientSet?.name ?? '').trim().length > 0
  );
}

export function resolveToolPrerequisites({ prerequisiteIds, definitions } = {}) {
  const definitionById = new Map(
    (Array.isArray(definitions) ? definitions : [])
      .filter((definition) => definition?.id)
      .map((definition) => [String(definition.id), definition])
  );
  const resolved = [];
  const unresolvedIds = [];
  for (const rawId of Array.isArray(prerequisiteIds) ? prerequisiteIds : []) {
    const id = typeof rawId === 'string' ? rawId.trim() : '';
    if (!id) continue;
    const definition = definitionById.get(id);
    if (definition) resolved.push(definition);
    else unresolvedIds.push(id);
  }
  return { resolved, unresolvedIds };
}

async function allPrerequisitesPass({ actor, prerequisites, evaluatePrerequisite }) {
  if (typeof evaluatePrerequisite !== 'function') return prerequisites.length === 0;
  for (const prerequisite of prerequisites) {
    try {
      if (!(await evaluatePrerequisite({ actor, prerequisite }))) return false;
    } catch {
      return false;
    }
  }
  return true;
}

export async function evaluateToolPrerequisiteGate({
  tool,
  actor = null,
  prerequisiteDefinitions = [],
  evaluatePrerequisite,
} = {}) {
  const settings = tool?.prerequisites || {};
  if (settings.enabled !== true) {
    return {
      actor,
      prerequisitesPassed: true,
      unresolvedIds: [],
      usable: true,
      bonusEligible: true,
    };
  }

  const { resolved, unresolvedIds } = resolveToolPrerequisites({
    prerequisiteIds: settings.ids,
    definitions: prerequisiteDefinitions,
  });
  const resolvedPassed = await allPrerequisitesPass({
    actor,
    prerequisites: resolved,
    evaluatePrerequisite,
  });
  const prerequisitesPassed = resolved.length > 0 && unresolvedIds.length === 0 && resolvedPassed;
  const usabilityGate = settings.gateMode === 'usability';
  return {
    actor,
    prerequisitesPassed,
    unresolvedIds,
    usable: !usabilityGate || prerequisitesPassed,
    bonusEligible: prerequisitesPassed,
  };
}

async function evaluateEnabledBonus({ tool, actor, eligible, evaluateExpression }) {
  const bonus = tool?.bonus || {};
  const expression = typeof bonus.expression === 'string' ? bonus.expression.trim() : '';
  if (
    tool?.enabled === false ||
    bonus.enabled !== true ||
    !eligible ||
    !expression ||
    typeof evaluateExpression !== 'function'
  ) {
    return { value: 0 };
  }
  let result;
  try {
    result = await evaluateExpression({ actor, expression, tool });
  } catch (error) {
    if (error instanceof ToolCheckEvidenceError) throw error;
    return { value: 0 };
  }
  const raw = result && typeof result === 'object' ? result.value : result;
  const numeric = raw === null || raw === undefined ? NaN : Number(raw);
  if (!Number.isFinite(numeric)) return { value: 0 };
  const preRoll = result && typeof result === 'object' ? result.preRoll : null;
  if (preRoll && preRoll.total !== numeric) {
    throw new ToolCheckEvidenceError('Tool roll evidence does not match its bonus');
  }
  return {
    value: numeric,
    ...(preRoll && { preRoll: structuredClone(preRoll) }),
  };
}

export async function evaluateToolCheckContribution({
  tool,
  matchedItem = null,
  primaryActor = null,
  prerequisiteDefinitions = [],
  evaluatePrerequisite,
  evaluateExpression,
} = {}) {
  const actor = matchedItem?.parent || primaryActor || null;
  const gate = await evaluateToolPrerequisiteGate({
    tool,
    actor,
    prerequisiteDefinitions,
    evaluatePrerequisite,
  });
  const bonus = await evaluateEnabledBonus({
    tool,
    actor,
    eligible: gate.bonusEligible,
    evaluateExpression,
  });
  return {
    ...gate,
    actor,
    toolId: tool?.id ?? null,
    label: String(tool?.label || tool?.name || 'Tool'),
    value: bonus.value,
    ...(bonus.preRoll && { preRoll: bonus.preRoll }),
  };
}

function isControlCharacter(character) {
  const codePoint = character.codePointAt(0);
  return codePoint <= 0x1f || codePoint === 0x7f;
}

function sanitizeTermLabel(label) {
  return [...String(label || '')]
    .map((character) => (isControlCharacter(character) ? ' ' : character))
    .join('')
    .replaceAll(/[[\]]/g, '')
    .replaceAll(/\s+/g, ' ')
    .trim();
}

export function appendToolBonusTerms(formula, terms) {
  const base = String(formula || '').trim();
  if (!base) return base;
  let result = base;
  for (const term of Array.isArray(terms) ? terms : []) {
    const value = Number(term?.value);
    if (!Number.isFinite(value) || value === 0) continue;
    const sign = value < 0 ? '-' : '+';
    const label = sanitizeTermLabel(term?.label);
    result += ` ${sign} ${Math.abs(value)}${label ? `[${label}]` : ''}`;
  }
  return result;
}

/**
 * The check-modifier flavour label: a fixed ASCII literal, never localized (issue 1094), because
 * `parsePlainDiceGroups` would tokenize a `\d*d\d+` in a localized label as a phantom
 * crit-eligible die group, and that tokenizer also feeds `hasPlainD20` and `applyD20Advantage`.
 */
export const CHECK_MODIFIER_TERM_LABEL = 'Modifiers';

/**
 * Whether a value can be emitted as a dice-grammar `Constant`, which has no exponent production:
 * `1e-7` would emit `+ 1e-7[Modifiers]` and throw at evaluate, and a non-finite value is no
 * `Constant` either. Such a term is skipped, never rounded. `resolveModifierBounds` asks the same
 * question of an authored bound (issue 1095), so the clamp and the emit agree.
 */
export function isDecimalSafeTermValue(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return false;
  return !String(Math.abs(numeric)).includes('e');
}

/**
 * Append a resolved check-modifier scalar as one flavoured term (`1d20 - 2[Modifiers]`, issue
 * 1094) through `appendToolBonusTerms`, so the sign split, label sanitizing and zero-skip stay one
 * implementation. Order: tool bonuses, then this term, then the advantage transform, then the
 * situational bonus. A zero, non-finite or not decimal-safe value leaves the formula unchanged.
 */
export function appendCheckModifierTerm(
  formula,
  { value, label = CHECK_MODIFIER_TERM_LABEL } = {}
) {
  const terms = isDecimalSafeTermValue(value) ? [{ value: Number(value), label }] : [];
  return appendToolBonusTerms(formula, terms);
}

/**
 * Append each rolling check modifier as its own `[Modifiers]` term after the flat sum (issue
 * 1118), so each die stays attributable and a refused fragment drops only its own entry. The
 * fragments arrive parenthesised and clamped by `resolveCheckModifierContribution` and are
 * emitted verbatim, because `1d4[fire][Modifiers]` is a syntax error on 14.365 where
 * `(1d4[fire])[Modifiers]` rolls.
 */
export function appendCheckModifierRollTerms(
  formula,
  fragments,
  label = CHECK_MODIFIER_TERM_LABEL
) {
  const base = String(formula || '').trim();
  if (!base) return base;
  const suffix = sanitizeTermLabel(label);
  let result = base;
  for (const fragment of Array.isArray(fragments) ? fragments : []) {
    const text = typeof fragment === 'string' ? fragment.trim() : '';
    if (!text) continue;
    result += ` + ${text}${suffix ? `[${suffix}]` : ''}`;
  }
  return result;
}
