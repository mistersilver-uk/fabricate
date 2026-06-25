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
 * Summarise an evaluated Roll's dice as
 * `{ groupId, group: "NdS", sum, results: number[] }` entries.
 *
 * - `groupId` is the index into the evaluated `roll.dice` term order (NOT re-parsed
 *   from the formula string), so duplicate `NdS` groups (`1d20 + 1d20` → groupId 0
 *   and 1) are disambiguated deterministically. The `checkBreakage` `diceGroup`
 *   trigger DSL targets a group by this index.
 * - `sum` is the DiceTerm#total — the GROUP TOTAL (POST-MODIFIER, active-only). The
 *   `group` key (`NdS`) carries no modifiers, so a modified pool (keep/drop/explode/
 *   reroll, e.g. `2d20kh1`) reports its modified total under the plain `2d20` key — a
 *   total that need not be in `[N, N*S]`. Per-die crits are authored only against
 *   PLAIN die terms and matched against this group total (see {@link resolveCheckCrit});
 *   the editor + normalizer make modified pools crit-ineligible, so a clamped crit can
 *   never collide with a modified total. When the die has no finite total (an
 *   unevaluated/headless die) the active-only raw faces are summed as a fallback,
 *   matching Foundry's own modified total.
 * - `results` are the ACTIVE-only raw faces: `die.results[].result` (raw face),
 *   filtering `entry.active !== false` (keeps present-true AND absent — Foundry omits
 *   `active` on a kept result — and excludes only an explicit `false`; per AGENTS.md
 *   `DiceTerm#total` is post-modifier, raw faces come from `results[].result`). The
 *   `anyDie`/`allDice`/`lowestDie`/`highestDie` aggregates derive from this; with no
 *   per-die `results` (headless/stub) those aggregates fail open (no break).
 */
export function rolledDiceGroups(roll) {
  const dice = Array.isArray(roll?.dice) ? roll.dice : [];
  return dice.map((die, groupId) => {
    const count = Number(die?.number);
    const faces = Number(die?.faces);
    const dieTotal = Number(die?.total);
    // Active-only raw faces (#419): `active !== false` keeps present-true AND absent
    // (Foundry omits `active` on a kept result) and excludes only an explicit `false`
    // (a dropped/discarded die), matching Foundry's own modified total.
    const rawResults = Array.isArray(die?.results) ? die.results : [];
    const results = rawResults
      .filter((entry) => entry?.active !== false)
      .map((entry) => Number(entry?.result))
      .filter((face) => Number.isFinite(face));
    // `sum` is the post-modifier die total; fall back to the active-only raw-face sum
    // for an unevaluated/headless die with no finite total (#443).
    const sum = Number.isFinite(dieTotal) ? dieTotal : results.reduce((acc, face) => acc + face, 0);
    return {
      groupId,
      group: `${Number.isFinite(count) ? count : 0}d${Number.isFinite(faces) ? faces : 0}`,
      sum,
      results,
    };
  });
}

/**
 * Resolve any forced outcome from the configured per-die critical raw rolls. Each
 * crit forces success or failure (and may break tools) when its die's rolled total
 * matches its raw value. A matching forced FAILURE takes precedence over a forced
 * success. Returns the matched crit `{ success, breakTools }`, or null when none
 * match. Matching compares `crit.raw` against the die-term GROUP TOTAL
 * (`group.sum`) for a plain `NdS` term; modified pools (keep/drop/explode/reroll)
 * are not crit-eligible (no crit is authored against them — the editor and the
 * normalizer drop such crits), so they never match here.
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
  // Automated check roll: never surface a manual roll-fulfilment dialog mid-craft
  // on a client configured for manual fulfilment (mirrors Roll.simulate's V13
  // behaviour). `allowInteractive: false` suppresses that resolver.
  const roll = await new globalThis.Roll(formula, rollData).evaluate({ allowInteractive: false });
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
      diceGroups,
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
    // `value` is the AWARDING value (a crit can overwrite it to MAX_SAFE_INTEGER/0),
    // while `data.total` keeps the RAW roll total. A `progressiveValue` trigger
    // targets `value`; a `rollTotal` trigger targets `data.total` — so the two can
    // resolve differently on the same roll.
    value,
    data: {
      formula,
      total,
      value,
      crit: crit ? { success: crit.success, breakTools } : null,
      breakTools,
      diceGroups,
    },
  };
}

/**
 * Match a rolled total against a routed check's outcome tiers, returning the
 * matched tier (or null). Outcome tiers come from
 * {@link CraftingSystemManager#_normalizeRoutedCraftingCheck}:
 *
 * - `relative` outcomes carry a `dc` DELTA relative to the base DC; the effective
 *   threshold is `dc (base param) + outcome.dc`. The match honours `comparison`
 *   ('exceed' → `total > threshold`, else 'meet' → `total >= threshold`) and,
 *   among all matching tiers, picks the one with the HIGHEST effective threshold
 *   (best tier).
 * - `fixed` outcomes carry a non-overlapping `[start, end]` segment of the roll
 *   range; a tier matches when `start <= total <= end`. Ranges are validated
 *   non-overlapping, but should several match the one with the highest `start`
 *   wins.
 */
function matchRoutedOutcome({ type, total, dc, comparison, relativeOutcomes, fixedOutcomes }) {
  if (type === 'fixed') {
    const outcomes = Array.isArray(fixedOutcomes) ? fixedOutcomes : [];
    let best = null;
    for (const outcome of outcomes) {
      if (!outcome) continue;
      const start = Number(outcome.start);
      const end = Number(outcome.end);
      if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
      if (total < start || total > end) continue;
      if (!best || start > Number(best.start)) best = outcome;
    }
    return best;
  }
  const outcomes = Array.isArray(relativeOutcomes) ? relativeOutcomes : [];
  let best = null;
  let bestThreshold = null;
  for (const outcome of outcomes) {
    if (!outcome) continue;
    const delta = Number(outcome.dc);
    if (!Number.isFinite(delta)) continue;
    const threshold = dc + delta;
    const matches = comparison === 'exceed' ? total > threshold : total >= threshold;
    if (!matches) continue;
    if (best === null || threshold > bestThreshold) {
      best = outcome;
      bestThreshold = threshold;
    }
  }
  return best;
}

/**
 * Route a forced-crit disposition to a tier of the matching success flag. A forced
 * FAILURE (`forcedSuccess === false`) routes to the LOWEST-threshold failing tier
 * (relative: smallest `dc`; fixed: smallest `start`); a forced SUCCESS routes to
 * the HIGHEST-threshold succeeding tier. Returns the chosen tier, or null when no
 * tier of that disposition exists.
 */
function routeCritOutcome({ type, forcedSuccess, relativeOutcomes, fixedOutcomes }) {
  const wantSuccess = forcedSuccess === true;
  const key = type === 'fixed' ? 'start' : 'dc';
  const outcomes =
    type === 'fixed'
      ? Array.isArray(fixedOutcomes)
        ? fixedOutcomes
        : []
      : Array.isArray(relativeOutcomes)
        ? relativeOutcomes
        : [];
  let chosen = null;
  let chosenRank = null;
  for (const outcome of outcomes) {
    if (!outcome || (outcome.success === true) !== wantSuccess) continue;
    const rank = Number(outcome[key]);
    if (!Number.isFinite(rank)) continue;
    // Forced success → highest-threshold tier; forced failure → lowest-threshold.
    const better = chosen === null || (wantSuccess ? rank > chosenRank : rank < chosenRank);
    if (better) {
      chosen = outcome;
      chosenRank = rank;
    }
  }
  return chosen;
}

/**
 * Run a routed formula check: roll the formula and map the total onto one of the
 * configured outcome tiers (relative DC deltas or fixed value ranges), returning
 * the matched tier's NAME as `outcome` for the activity's outcome→result-group
 * routing. Per-die crits override the disposition: a forced SUCCESS routes to the
 * best succeeding tier, a forced FAILURE to the worst failing tier, and the crit's
 * `breakTools` takes precedence for the surfaced flag. When no tier matches (and no
 * crit reroutes), `outcome` is null and `success` reflects the crit (when any) or
 * `false`.
 *
 * HEADLESS: with no dice engine the routed check cannot simulate a tier, so it
 * returns a non-blocking `{ success: true, outcome: null, value: null }` rather
 * than fabricating a route.
 *
 * @returns {Promise<{success: boolean, outcome: string|null, value: number|null, data: object, message: string|null}>}
 */
export async function runFormulaRouted({
  formula: rawFormula,
  dc,
  thresholdMode,
  type,
  relativeOutcomes,
  fixedOutcomes,
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
      console.error(`Fabricate | ${label} routed check roll failed (${formula})`, error);
      return {
        success: false,
        outcome: null,
        value: null,
        data: { dc, formula, type },
        message: `${label} check roll failed: ${error.message}`,
      };
    }
    if (!rolled.engine) {
      // No dice engine: a routed check cannot simulate a tier, so do not block
      // and do not fabricate a route.
      return {
        success: true,
        outcome: null,
        value: null,
        data: { dc, formula, type },
        message: null,
      };
    }
    total = rolled.total;
    diceGroups = rolled.diceGroups;
  }

  const comparison = thresholdMode === 'exceed' ? 'exceed' : 'meet';
  const crit = resolveCheckCrit(diceCrits, diceGroups);

  let matched = matchRoutedOutcome({
    type,
    total,
    dc,
    comparison,
    relativeOutcomes,
    fixedOutcomes,
  });

  if (crit) {
    const rerouted = routeCritOutcome({
      type,
      forcedSuccess: crit.success,
      relativeOutcomes,
      fixedOutcomes,
    });
    // A crit forces the disposition: route to the best (success) / worst (failure)
    // tier of that flag. If none exists, drop the tier-derived match entirely.
    matched = rerouted;
  }

  const success = crit ? crit.success : matched ? matched.success === true : false;
  const breakTools = crit
    ? crit.breakTools === true
    : matched
      ? matched.breakTools === true
      : false;

  return {
    success,
    outcome: matched ? matched.name : null,
    value: total,
    data: {
      dc,
      formula,
      total,
      type,
      comparison,
      outcomeId: matched?.id ?? null,
      success,
      breakTools,
      crit: crit ? { success: crit.success, breakTools: crit.breakTools === true } : null,
      diceGroups,
    },
    message: success ? null : `${label} check failed`,
  };
}
