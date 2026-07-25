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
