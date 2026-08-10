/**
 * Stateless Tool prerequisite and check-bonus composition.
 *
 * Callers supply actors, shared prerequisite definitions, and evaluators explicitly.
 * This keeps actor binding visible and prevents presence, gates, and bonuses from
 * being satisfied by different actors during a multi-actor attempt.
 */

/**
 * Whether Ingredient Set Tool references are active for this system/set pair.
 * Inactive references remain serialized so switching modes or restoring a set
 * name is lossless, but every read-side consumer uses this predicate before
 * treating those ids as requirements.
 *
 * @param {object|null} system
 * @param {object|null} ingredientSet
 * @returns {boolean}
 */
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
    return 0;
  }
  try {
    const result = await evaluateExpression({ actor, expression, tool });
    const numeric = result === null || result === undefined ? NaN : Number(result);
    return Number.isFinite(numeric) ? numeric : 0;
  } catch {
    return 0;
  }
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
  const value = await evaluateEnabledBonus({
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
    value,
  };
}

export function composeToolBonusTerms(contributions) {
  const terms = [];
  for (const contribution of Array.isArray(contributions) ? contributions : []) {
    const value = Number(contribution?.value);
    if (!Number.isFinite(value) || value === 0) continue;
    terms.push({ ...contribution, value });
  }
  return {
    terms,
    total: terms.reduce((sum, term) => sum + term.value, 0),
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
 * The check-modifier term's flavour label: a FIXED ASCII literal, deliberately NOT
 * localized (issue 1094).
 *
 * This is a correctness constraint, not an i18n oversight. The label lands inside a
 * roll formula, and `parsePlainDiceGroups` (`src/utils/craftingCheckExpression.js`)
 * splits on flavour brackets and whitespace, so a localized label containing a
 * `\d*d\d+` token would be tokenized as a phantom crit-eligible die group — and that
 * same tokenizer backs `hasPlainD20` and `applyD20Advantage`, so the damage would
 * reach the advantage transform as well as the crit classifier.
 */
export const CHECK_MODIFIER_TERM_LABEL = 'Modifiers';

/**
 * Whether a value can be emitted as a dice-grammar `Constant`.
 *
 * `appendToolBonusTerms` stringifies through `Math.abs(value)` with no numeric
 * formatting, and the grammar's `Constant = _ [0-9]+ ("." [0-9]+)?` has NO exponent
 * production. A scalar that stringifies to exponent notation — `1e-7`, `1e+21` —
 * would emit `+ 1e-7[Modifiers]`, which parses as `StringTerm("1e")` minus
 * `NumericTerm(7[Modifiers])` and THROWS at evaluate because `allowStrings` defaults
 * false. A non-finite value is refused for the same reason (`Infinity` / `NaN` are
 * not `Constant`s either).
 *
 * The term is SKIPPED rather than clamped or rounded: a check modifier is the GM's
 * arithmetic, and silently substituting a different number would be worse than
 * contributing nothing.
 *
 * EXPORTED for `checkModifierResolver.resolveModifierBounds` (issue 1095), which asks the
 * same question of an authored `min`/`max`: a bound the grammar cannot express clamps the
 * SUM into a value this function then refuses, dropping the whole term and with it every
 * other modifier's contribution. Asking one function keeps the clamp and the emit from
 * disagreeing about which numbers are expressible.
 */
export function isDecimalSafeTermValue(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return false;
  return !String(Math.abs(numeric)).includes('e');
}

/**
 * Append a resolved check-modifier scalar to a roll formula as ONE flavoured term
 * (`1d20 + 3[Modifiers]`, `1d20 - 2[Modifiers]`), the way tool bonuses append (issue
 * 1094, retiring the roll-formula placeholder they used to need).
 *
 * It DELEGATES to {@link appendToolBonusTerms} rather than re-implementing the emit,
 * so the sign split (`Constant` is unsigned, so `+ -3[Modifiers]` would not parse but
 * `- 3[Modifiers]` does), the `[label]` bracketing, `sanitizeTermLabel`'s control-
 * character and bracket stripping, and the zero-skip stay ONE implementation. A
 * second appender would drift.
 *
 * Ordering, unchanged by this function: tool bonuses append first, then this term,
 * then the advantage transform, then the situational bonus.
 *
 * @param {string} formula
 * @param {{ value?: unknown, label?: string }} [term]
 * @returns {string} The formula with the term appended, or the trimmed formula
 *   unchanged when the value is zero, non-finite, or not decimal-safe.
 */
export function appendCheckModifierTerm(
  formula,
  { value, label = CHECK_MODIFIER_TERM_LABEL } = {}
) {
  const terms = isDecimalSafeTermValue(value) ? [{ value: Number(value), label }] : [];
  return appendToolBonusTerms(formula, terms);
}
