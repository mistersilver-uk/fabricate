/**
 * Activity-agnostic crafting-check roll helpers, shared by the crafting and
 * salvage check runners (and, in a later phase, gathering). Extracting them keeps
 * a single copy of the roll → dice-group → crit → pass/fail (or → numeric value)
 * logic instead of duplicating it per activity.
 *
 * `label` ('Crafting' | 'Salvage' | …) only customises the human-readable failure
 * messages so each activity reads naturally; the result shape is identical.
 */

/**
 * Summarise an evaluated Roll's dice as `{ group: "NdS", sum }` entries, where
 * `sum` is the DiceTerm#total (POST-MODIFIER, active-only sum): a keep/drop/explode
 * pool (e.g. `2d20kh1`) reports its modified total, not the raw per-die faces. Per-
 * die crits therefore match the die-term total, so dice-pool modifiers are out of
 * scope for crit matching (see {@link resolveCheckCrit}).
 */
export function rolledDiceGroups(roll) {
  const dice = Array.isArray(roll?.dice) ? roll.dice : [];
  return dice.map((die) => {
    const count = Number(die?.number);
    const faces = Number(die?.faces);
    const dieTotal = Number(die?.total);
    let sum;
    if (Number.isFinite(dieTotal)) {
      sum = dieTotal;
    } else {
      const results = Array.isArray(die?.results) ? die.results : [];
      sum = results.reduce((acc, entry) => acc + (Number(entry?.result) || 0), 0);
    }
    return {
      group: `${Number.isFinite(count) ? count : 0}d${Number.isFinite(faces) ? faces : 0}`,
      sum,
    };
  });
}

/**
 * Resolve any forced outcome from the configured per-die critical raw rolls. Each
 * crit forces success or failure (and may break tools) when its die's rolled total
 * matches its raw value. A matching forced FAILURE takes precedence over a forced
 * success. Returns the matched crit `{ success, breakTools }`, or null when none
 * match. Matching compares `crit.raw` against the die-term POST-MODIFIER total
 * (`group.sum`), so keep/drop/explode modifiers are out of scope for per-die crits.
 */
export function resolveCheckCrit(diceCrits, diceGroups) {
  const crits = Array.isArray(diceCrits) ? diceCrits : [];
  let triggered = null;
  for (const crit of crits) {
    if (!crit || typeof crit !== 'object' || !crit.die) continue;
    const matches = diceGroups.some(
      (group) => group.group === crit.die && group.sum === Number(crit.raw)
    );
    if (!matches) continue;
    const resolved = { success: crit.success === true, breakTools: crit.breakTools === true };
    if (!resolved.success) return resolved; // forced failure wins
    triggered = resolved;
  }
  return triggered;
}

/**
 * Evaluate a check roll formula, returning `{ engine, total, diceGroups }`. Returns
 * `engine: false` when no dice engine is available (headless/non-Foundry). Throws on
 * a bad formula (callers wrap it).
 */
export async function evaluateCheckRoll(formula, actor) {
  if (typeof globalThis.Roll !== 'function') return { engine: false, total: 0, diceGroups: [] };
  const rollData = actor?.getRollData?.() ?? actor?.system ?? {};
  const roll = await new globalThis.Roll(formula, rollData).evaluate();
  const rolledTotal = Number(roll?.total);
  const total = Number.isFinite(rolledTotal) ? rolledTotal : 0;
  return { engine: true, total, diceGroups: rolledDiceGroups(roll) };
}

/**
 * Run a pass/fail formula check: roll the formula, compare the total against `dc`
 * (met-or-exceeded or strictly exceeded), honouring per-die crits. Returns
 * `{ success, outcome: 'pass'|'fail', value, data, message }`.
 */
export async function runFormulaPassFail({
  formula: rawFormula,
  dc,
  thresholdMode,
  diceCrits,
  actor,
  label = 'Crafting',
}) {
  const formula = String(rawFormula || '').trim();
  let total = 0;
  let diceGroups = [];
  if (formula) {
    let rolled;
    try {
      rolled = await evaluateCheckRoll(formula, actor);
    } catch (error) {
      console.error(`Fabricate | ${label} check roll failed (${formula})`, error);
      return {
        success: false,
        outcome: 'fail',
        value: null,
        data: { dc, formula },
        message: `${label} check roll failed: ${error.message}`,
      };
    }
    if (!rolled.engine) {
      // No dice engine: cannot evaluate, so do not block the activity.
      return { success: true, outcome: 'pass', value: null, data: { dc, formula }, message: null };
    }
    total = rolled.total;
    diceGroups = rolled.diceGroups;
  }

  const crit = resolveCheckCrit(diceCrits, diceGroups);
  const comparison = thresholdMode === 'exceed' ? 'exceed' : 'meet';
  let success;
  if (crit) {
    success = crit.success;
  } else if (comparison === 'exceed') {
    success = total > dc;
  } else {
    success = total >= dc;
  }
  const breakTools = crit ? crit.breakTools === true : false;
  return {
    success,
    outcome: success ? 'pass' : 'fail',
    value: total,
    data: {
      dc,
      formula,
      total,
      comparison,
      crit: crit ? { success: crit.success, breakTools } : null,
      breakTools,
    },
    message: success ? null : `${label} check failed`,
  };
}

/**
 * Run a progressive formula check: roll the formula and return its total as the
 * numeric `value` progressive awarding spends against result difficulties. The
 * activity always proceeds. A matched success crit awards everything
 * (`MAX_SAFE_INTEGER`), a failure crit awards nothing (`0`). Returns
 * `{ success: true, outcome: null, value, data }`.
 */
export async function runFormulaProgressive({
  formula: rawFormula,
  diceCrits,
  actor,
  label = 'Crafting',
}) {
  const formula = String(rawFormula || '').trim();
  let total = 0;
  let diceGroups = [];
  if (formula) {
    let rolled;
    try {
      rolled = await evaluateCheckRoll(formula, actor);
    } catch (error) {
      console.error(`Fabricate | ${label} progressive check roll failed (${formula})`, error);
      return {
        success: false,
        outcome: null,
        value: null,
        data: { formula },
        message: `${label} check roll failed: ${error.message}`,
      };
    }
    if (!rolled.engine) {
      // No dice engine: award nothing (a finite value) rather than block.
      return { success: true, outcome: null, value: 0, data: { formula, total: 0, value: 0 } };
    }
    total = rolled.total;
    diceGroups = rolled.diceGroups;
  }

  const crit = resolveCheckCrit(diceCrits, diceGroups);
  let value;
  if (crit) {
    value = crit.success ? Number.MAX_SAFE_INTEGER : 0;
  } else {
    value = total;
  }
  const breakTools = crit ? crit.breakTools === true : false;
  return {
    success: true,
    outcome: null,
    value,
    data: {
      formula,
      total,
      value,
      crit: crit ? { success: crit.success, breakTools } : null,
      breakTools,
    },
  };
}
