/**
 * The Tool bonus a check card states before the prompt (issue 2005; maintainer ruling 2026-09-28,
 * "include a held tool's bonus"), read from the same `resolveToolStates` answer the engine prepares
 * its Tool contributions from, through the same expression and actor rules. A deterministic bonus
 * adds its value; a rolled one is named as pending, since the prompt rolls it first.
 */
import { resolveDeterministicExpression } from '../../systems/checkEvaluation.js';
import { toolBonusActor, toolBonusExpression } from '../../systems/toolCheckBonus.js';

/** One way the attempt could run: its held, bonus-eligible tools' summed and rolled bonuses. */
function bonusOf(states) {
  let flat = 0;
  const pending = [];
  for (const state of states) {
    const input = state?.contributionInput ?? {};
    const expression =
      state?.available === true
        ? toolBonusExpression(input.tool, state.bonusEligible === true)
        : '';
    if (!expression) continue;
    const actor = toolBonusActor(input);
    const rollData = actor?.getRollData?.() ?? actor?.system ?? {};
    const resolved = resolveDeterministicExpression(expression, rollData, { pathMode: 'foundry' });
    if (resolved.ok) flat += resolved.value;
    else pending.push(expression);
  }
  return { flat, pending };
}

/**
 * `{ flat, pending }` for the held tools, or null when no held tool carries a bonus. `stateLists`
 * holds one tool-state list per way the attempt could run (one per ingredient set): when their
 * bonuses differ, the bonus depends on a choice the prompt makes, so the card states none.
 */
export function heldToolBonus(stateLists) {
  const bonuses = (Array.isArray(stateLists) ? stateLists : []).filter(Array.isArray).map(bonusOf);
  if (bonuses.length === 0) return null;
  const [first, ...rest] = bonuses;
  const key = ({ flat, pending }) => `${flat}|${pending.join('|')}`;
  if (rest.some((bonus) => key(bonus) !== key(first))) return null;
  return first.flat !== 0 || first.pending.length > 0 ? first : null;
}

/**
 * A recipe's held Tool bonus over its first step's ingredient sets (`scope`: `{ view, sets,
 * craftSources }`), resolved as the engine resolves each set's tools; null without a scope.
 */
export function recipeHeldToolBonus(recipeManager, primaryActor, scope) {
  if (!scope || typeof recipeManager?.resolveToolStates !== 'function') return null;
  const sets = scope.sets.length > 0 ? scope.sets : [null];
  return heldToolBonus(
    sets.map((set) =>
      recipeManager.resolveToolStates(
        scope.view,
        recipeManager.getToolsForSet?.(scope.view, set) ?? [],
        scope.craftSources,
        { primaryActor }
      )
    )
  );
}
