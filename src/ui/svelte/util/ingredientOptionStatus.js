/**
 * ingredientOptionStatus — pure presentation map from an ingredient set's
 * craftability to its option-card status descriptor for the routed-by-ingredients
 * option grid. No Foundry/DOM dependencies, so it is fully unit-testable.
 *
 * Precedence (highest first):
 *   1. craftable   — the set can be crafted right now (`canCraft === true`)
 *   2. blocked     — a required tool is missing (a hard block, not just materials)
 *   3. missing     — some ingredient/essence components are short; `count` is the
 *                    number of distinct unsatisfied ingredient + essence entries
 *
 * `tone` is a semantic token (resolved to a colour by CSS — never a literal here);
 * `icon` is a Font Awesome class; `count` is only meaningful for the `missing`
 * token.
 */

const CRAFTABLE = Object.freeze({
  token: 'craftable',
  tone: 'success',
  icon: 'fa-solid fa-circle-check',
  count: 0,
});

const BLOCKED = Object.freeze({
  token: 'blocked',
  tone: 'danger',
  icon: 'fa-solid fa-ban',
  count: 0,
});

function unsatisfiedCount(states) {
  return Array.isArray(states) ? states.filter((state) => state?.satisfied !== true).length : 0;
}

function hasMissingTool(craftability) {
  if (Array.isArray(craftability?.missing?.tools) && craftability.missing.tools.length > 0) {
    return true;
  }
  return (
    Array.isArray(craftability?.toolStates) &&
    craftability.toolStates.some((tool) => tool?.available === false)
  );
}

/**
 * Resolve the `{ token, tone, icon, count }` status descriptor for an option's
 * craftability. A null/absent craftability is treated as blocked (nothing is
 * known to be satisfiable).
 *
 * @param {object|null} craftability A per-set `evaluateCraftability` result.
 * @returns {{ token: string, tone: string, icon: string, count: number }}
 */
export function ingredientOptionStatus(craftability) {
  if (craftability?.canCraft === true) return CRAFTABLE;
  if (hasMissingTool(craftability)) return BLOCKED;
  const count =
    unsatisfiedCount(craftability?.ingredientStates) +
    unsatisfiedCount(craftability?.essenceStates);
  // Nothing specifically short and no missing tool (incl. a null/unknown
  // craftability) — treat as a hard block rather than surfacing "Missing 0".
  if (count === 0) return BLOCKED;
  return { token: 'missing', tone: 'warning', icon: 'fa-solid fa-triangle-exclamation', count };
}
