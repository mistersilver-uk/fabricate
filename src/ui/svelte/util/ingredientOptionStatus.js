// The routed-by-ingredients option grid's status descriptor per set. Precedence, highest first:
// `craftable`, then `blocked` (a missing TOOL is a hard block, not a shortage), then `missing`,
// whose `count` is the number of distinct unsatisfied ingredient plus essence entries. `tone` is a
// semantic token CSS resolves, never a colour literal.

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

// A null or absent craftability is blocked: nothing is known to be satisfiable.
export function ingredientOptionStatus(craftability) {
  if (craftability?.canCraft === true) return CRAFTABLE;
  if (hasMissingTool(craftability)) return BLOCKED;
  const count =
    unsatisfiedCount(craftability?.ingredientStates) +
    unsatisfiedCount(craftability?.essenceStates);
  // Nothing short and no missing tool: a hard block, rather than surfacing "Missing 0".
  if (count === 0) return BLOCKED;
  return { token: 'missing', tone: 'warning', icon: 'fa-solid fa-triangle-exclamation', count };
}
