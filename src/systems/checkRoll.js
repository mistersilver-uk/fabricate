/**
 * Activity-agnostic crafting-check roll helpers, shared by the crafting and
 * salvage check runners (and, in a later phase, gathering). Extracting them keeps
 * a single copy of the roll → dice-group → crit → pass/fail (or → numeric value)
 * logic instead of duplicating it per activity.
 *
 * `label` ('Crafting' | 'Salvage' | …) only customises the human-readable failure
 * messages so each activity reads naturally; the result shape is identical.
 */

import { evaluateCheckBreakageCondition } from '../toolBreakageRuntime.js';
import { applyD20Advantage, hasPlainD20 } from '../utils/craftingCheckExpression.js';

import { createFabricateRoll, NATIVE_ROLL_DIALOG_DISMISSED } from './fabricateRoll.js';

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
 *   total that need not be in `[N, N*S]`. A `diceGroup` trigger's `total` aggregate
 *   matches this group total; the editor + normalizer make modified pools
 *   crit-ineligible, so a converted legacy crit can never collide with a modified
 *   total. When the die has no finite total (an
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
 * Resolve any forced outcome from the unified per-check trigger list (issue 419).
 * Each trigger whose `outcome` is `'success'` or `'failure'` forces that
 * disposition when its condition matches the roll. A matching forced FAILURE takes
 * precedence over a forced success. Returns `{ disposition: 'success' | 'failure' }`
 * for the winning trigger, or null when none force an outcome.
 *
 * Condition matching reuses the shared {@link evaluateCheckBreakageCondition}
 * evaluator with a synthetic checkResult `{ value, data: { total, diceGroups } }`,
 * restricted to the outcome-independent condition types (`rollTotal` /
 * `progressiveValue` / `diceGroup`). `outcomeTier` conditions are ignored here: the
 * routed tier is resolved AFTER the forced outcome, so matching on it would be
 * circular (such triggers still break tools at the engine seam where the tier is
 * known).
 *
 * @param {Array<object>} triggers
 * @param {{ total?: number, value?: number, diceGroups?: Array<object> }} roll
 * @returns {{ disposition: 'success' | 'failure' } | null}
 */
export function resolveForcedOutcome(triggers, { total, value, diceGroups } = {}) {
  const list = Array.isArray(triggers) ? triggers : [];
  const checkResult = {
    value,
    data: { total, diceGroups: Array.isArray(diceGroups) ? diceGroups : [] },
  };
  let forcedSuccess = null;
  for (const trigger of list) {
    if (!trigger || typeof trigger !== 'object') continue;
    const outcome = trigger.outcome;
    if (outcome !== 'success' && outcome !== 'failure') continue;
    // outcomeTier conditions are circular here (the tier is forced by this very
    // resolution), so they can never force an outcome.
    if (trigger.condition?.type === 'outcomeTier') continue;
    if (!evaluateCheckBreakageCondition(trigger.condition, checkResult)) continue;
    if (outcome === 'failure') return { disposition: 'failure' }; // forced failure wins
    forcedSuccess = { disposition: 'success' };
  }
  return forcedSuccess;
}

/**
 * Evaluate a check roll formula, returning `{ engine, total, diceGroups }`. Returns
 * `engine: false` when no dice engine is available (headless/non-Foundry). Throws on
 * a bad formula (callers wrap it).
 *
 * All interactive behaviour is opt-in via `options`; with no `options` (or no
 * `prompt`/`ChatMessage`) this behaves exactly as the original automated roll.
 *
 * @param {string} formula The roll formula (may carry `@` placeholders).
 * @param {object|null} actor The actor whose roll data resolves the formula.
 * @param {object} [options]
 * @param {boolean} [options.interactive] When true (and a `prompt` is supplied),
 *   confirm the roll with the player and optionally add a situational modifier;
 *   when true (and `ChatMessage.create` exists) post the evaluated roll to chat so
 *   Dice So Nice animates it.
 * @param {(args: {formula: string, resolvedFormula: string|null, dc: *, label: *})
 *   => Promise<{confirmed?: boolean, bonus?: string|null, rollMode?: string}>}
 *   [options.prompt] The confirm dialog (see `promptCheckRoll`).
 * @param {string} [options.rollMode] The effective chat roll mode.
 * @param {string} [options.flavor] Chat message flavor / dialog label.
 * @param {object} [options.speaker] Chat message speaker.
 * @param {*} [options.dc] The DC surfaced to the prompt (display only).
 * @returns {Promise<{engine: boolean, total: number, diceGroups: Array<object>,
 *   resolvedFormula: string|null, cancelled?: boolean, cancelledReason?: string}>}
 *   On the interactive path a dismissed native roll dialog returns
 *   `cancelled: true` with `cancelledReason: 'nativeRollDialogDismissed'`; the
 *   bespoke confirm-prompt Cancel stays `cancelledReason`-less (silent).
 */
export async function evaluateCheckRoll(formula, actor, options = {}) {
  if (typeof globalThis.Roll !== 'function')
    return { engine: false, total: 0, diceGroups: [], resolvedFormula: null };
  const rollData = actor?.getRollData?.() ?? actor?.system ?? {};
  // Capture the @-resolved formula (e.g. "1d20 + 3") so the dialog and run journal
  // can show the actual modifiers, not the authored `@abilities…` placeholders.
  // Recomputed from the COMBINED formula below when a valid situational bonus is
  // applied, so the journal display reconciles with the rolled total (FIX 3).
  let resolved = resolveCheckFormulaDisplay(formula, actor);

  let effectiveFormula = String(formula);
  let effectiveRollMode = options?.rollMode;

  // Interactive roll (opt-in): confirm with the player and optionally append a
  // situational modifier before rolling. A cancelled prompt short-circuits with
  // `cancelled: true` so the runner can abort with zero mutation.
  if (options?.interactive && typeof options.prompt === 'function') {
    const choice = await options.prompt({
      formula: effectiveFormula,
      resolvedFormula: resolved?.display ?? null,
      dc: options.dc,
      label: options.flavor,
      name: options.name,
      activity: options.activity,
      img: options.img,
      // Advantage/Disadvantage are offered only for a plain-d20 check.
      allowAdvantage: hasPlainD20(effectiveFormula),
    });
    if (!choice || choice.confirmed === false) {
      return { engine: true, cancelled: true, total: 0, diceGroups: [], resolvedFormula: null };
    }
    // Advantage transform first (so the situational bonus appends AFTER the pool),
    // yielding e.g. `2d20kh1 + 3 + (2)`. Only a plain `1d20` is rewritten; any other
    // disposition or formula is left unchanged.
    if (choice.advantage === 'advantage' || choice.advantage === 'disadvantage') {
      effectiveFormula = applyD20Advantage(effectiveFormula, choice.advantage);
      resolved = resolveCheckFormulaDisplay(effectiveFormula, actor);
    }
    const bonus = typeof choice.bonus === 'string' ? choice.bonus.trim() : choice.bonus;
    if (bonus) {
      // Guaranteed safety net: a malformed situational bonus must NEVER reach
      // `new Roll(...).evaluate()` and become a rolled (consuming) check failure.
      // When `Roll.validate` is available and rejects the combined formula, IGNORE
      // the bonus and roll the base formula instead. When `Roll.validate` is
      // unavailable (headless/tests), fall through — the runner's try/catch is the
      // backstop there.
      const combined = `${effectiveFormula} + (${bonus})`;
      const validate = globalThis.Roll?.validate;
      if (typeof validate === 'function' && validate(combined) === false) {
        console.warn('Fabricate | Ignoring invalid situational bonus', bonus);
      } else {
        effectiveFormula = combined;
        // Reconcile the journal display with the total actually rolled (FIX 3).
        resolved = resolveCheckFormulaDisplay(effectiveFormula, actor);
      }
    }
    if (choice.rollMode) effectiveRollMode = choice.rollMode;
  }

  let roll;
  if (options?.interactive) {
    // Interactive path: defer to Foundry's native roll machinery so a client
    // configured for manual roll fulfilment can enter their physical roll, and roll
    // mode / Dice So Nice are honoured through Foundry's own resolver. There is NO
    // `allowInteractive: false` here — interactive is `evaluate()`'s default;
    // re-adding the blanket guard would regress the native handoff. For a
    // default-digital client this is indistinguishable from the automated roll.
    roll = await createFabricateRoll(effectiveFormula, rollData).evaluate();
    // A dismissed manual-fulfilment dialog RESOLVES (it never rejects) and silently
    // digital-fills the roll, so detection reads the resolver flag rather than a
    // caught error. `fabricateDismissed` is only true when the fulfilment dialog was
    // actually presented (a manual-fulfilment client) and never submitted — a
    // digital client's resolver reports `false`. Abort with ZERO mutation, tagging
    // the native-dismissal reason so the UI can surface a WARN toast (the bespoke
    // #497 prompt Cancel stays reason-less / silent).
    if (roll?._resolver?.fabricateDismissed === true) {
      return {
        engine: true,
        cancelled: true,
        cancelledReason: NATIVE_ROLL_DIALOG_DISMISSED,
        total: 0,
        diceGroups: [],
        resolvedFormula: null,
      };
    }
  } else {
    // Automated check roll: never surface a manual roll-fulfilment dialog mid-craft
    // on a client configured for manual fulfilment (mirrors Roll.simulate's V13
    // behaviour). `allowInteractive: false` suppresses that resolver.
    roll = await new globalThis.Roll(effectiveFormula, rollData).evaluate({
      allowInteractive: false,
    });
  }
  const rolledTotal = Number(roll?.total);
  const total = Number.isFinite(rolledTotal) ? rolledTotal : 0;

  // Surface the roll to chat so Dice So Nice animates it (interactive only).
  // `toMessage` is the DSN trigger — no dice3d/game.dice3d code is needed. A chat
  // failure is logged and swallowed, never thrown (mirrors
  // `CraftingEngine._postCraftChatMessage`).
  if (options?.interactive && typeof globalThis.ChatMessage?.create === 'function') {
    try {
      await roll.toMessage(
        { speaker: options.speaker, flavor: options.flavor },
        { rollMode: effectiveRollMode, create: true }
      );
    } catch (error) {
      console.error('Fabricate | Failed to post check roll to chat:', error);
    }
  }

  return {
    engine: true,
    total,
    diceGroups: rolledDiceGroups(roll),
    resolvedFormula: resolved?.display ?? null,
  };
}

/**
 * Resolve a check formula's `@` placeholders against an actor's roll data for
 * DISPLAY — substituting each placeholder with its numeric value inline
 * (e.g. `1d20 + @abilities.str.mod + @prof` → `1d20 + 3 + 2`) WITHOUT rolling any
 * dice (no evaluation, so no randomness / side effects).
 *
 * Returns `null` when there is no formula or no dice engine (the caller then shows
 * the raw formula). Otherwise `{ display, resolved }` where `resolved` is false when
 * the formula does not reduce to a number for this actor (unknown/missing `@` keys
 * or a non-numeric substitution) — `missing: 'NaN'` makes those detectable, since
 * Foundry would otherwise silently leave or zero an unmatched key.
 *
 * @param {string} formula
 * @param {object|null} actor
 * @returns {{ display: string, resolved: boolean }|null}
 */
export function resolveCheckFormulaDisplay(formula, actor) {
  if (typeof formula !== 'string' || formula.trim() === '') return null;
  const Roll = globalThis.Roll;
  if (typeof Roll?.replaceFormulaData !== 'function') return null;
  const rollData = actor?.getRollData?.() ?? actor?.system ?? {};
  const display = Roll.replaceFormulaData(String(formula), rollData, {
    missing: 'NaN',
    warn: false,
  });
  const resolved =
    !/NaN/.test(display) &&
    !/@/.test(display) &&
    (typeof Roll.validate !== 'function' || Roll.validate(display) === true);
  return { display, resolved };
}

/**
 * Run a pass/fail formula check: roll the formula, compare the total against `dc`
 * (met-or-exceeded or strictly exceeded), honouring the unified per-check trigger
 * list's forced outcomes (issue 419). Returns
 * `{ success, outcome: 'pass'|'fail', value, data, message }`.
 *
 * @param {object} [params.rollOptions] Optional interactive-roll bag threaded to
 *   {@link evaluateCheckRoll} (built by `buildInteractiveRollOptions`). When it
 *   opts into an interactive roll and the player dismisses the prompt, the runner
 *   returns `{ success: false, cancelled: true, outcome: null, value: null }` so
 *   the caller aborts with zero mutation. Omit it (the default) for a silent roll.
 */
export async function runFormulaPassFail({
  formula: rawFormula,
  dc,
  thresholdMode,
  triggers,
  actor,
  label = 'Crafting',
  rollOptions = null,
}) {
  const formula = String(rawFormula || '').trim();
  let total = 0;
  let diceGroups = [];
  let resolvedFormula = null;
  if (formula) {
    let rolled;
    try {
      rolled = await evaluateCheckRoll(formula, actor, { ...rollOptions, dc });
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
    // The player cancelled the interactive roll dialog: abort with zero mutation
    // (no crit/DC logic, no consumption downstream).
    if (rolled.cancelled) {
      return {
        success: false,
        cancelled: true,
        cancelledReason: rolled.cancelledReason,
        outcome: null,
        value: null,
        data: { dc, formula },
      };
    }
    if (!rolled.engine) {
      // No dice engine: cannot evaluate, so do not block the activity.
      return { success: true, outcome: 'pass', value: null, data: { dc, formula }, message: null };
    }
    total = rolled.total;
    diceGroups = rolled.diceGroups;
    resolvedFormula = rolled.resolvedFormula;
  }

  const forced = resolveForcedOutcome(triggers, { total, diceGroups });
  const comparison = thresholdMode === 'exceed' ? 'exceed' : 'meet';
  let success;
  if (forced) {
    success = forced.disposition === 'success';
  } else if (comparison === 'exceed') {
    success = total > dc;
  } else {
    success = total >= dc;
  }
  return {
    success,
    outcome: success ? 'pass' : 'fail',
    value: total,
    data: {
      dc,
      formula,
      resolvedFormula,
      total,
      comparison,
      diceGroups,
    },
    message: success ? null : `${label} check failed`,
  };
}

/**
 * Run a progressive formula check: roll the formula and return its total as the
 * numeric `value` progressive awarding spends against result difficulties. The
 * activity always proceeds. A matched forced SUCCESS awards everything
 * (`MAX_SAFE_INTEGER`), a forced FAILURE awards nothing (`0`). Returns
 * `{ success: true, outcome: null, value, data }`.
 *
 * @param {object} [params.rollOptions] Optional interactive-roll bag threaded to
 *   {@link evaluateCheckRoll} (built by `buildInteractiveRollOptions`). When the
 *   player dismisses the interactive prompt, the runner returns
 *   `{ success: false, cancelled: true, outcome: null, value: null }` so the caller
 *   aborts with zero mutation. Omit it (the default) for a silent roll.
 */
export async function runFormulaProgressive({
  formula: rawFormula,
  triggers,
  actor,
  label = 'Crafting',
  rollOptions = null,
}) {
  const formula = String(rawFormula || '').trim();
  let total = 0;
  let diceGroups = [];
  let resolvedFormula = null;
  if (formula) {
    let rolled;
    try {
      rolled = await evaluateCheckRoll(formula, actor, { ...rollOptions });
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
    // The player cancelled the interactive roll dialog: abort with zero mutation.
    if (rolled.cancelled) {
      return {
        success: false,
        cancelled: true,
        cancelledReason: rolled.cancelledReason,
        outcome: null,
        value: null,
        data: { formula },
      };
    }
    if (!rolled.engine) {
      // No dice engine: award nothing (a finite value) rather than block.
      return { success: true, outcome: null, value: 0, data: { formula, total: 0, value: 0 } };
    }
    total = rolled.total;
    diceGroups = rolled.diceGroups;
    resolvedFormula = rolled.resolvedFormula;
  }

  // Forced-outcome resolution sees the RAW total as the awarding value (the
  // `progressiveValue` condition targets the natural value before any forcing).
  const forced = resolveForcedOutcome(triggers, { total, value: total, diceGroups });
  let value;
  if (forced) {
    value = forced.disposition === 'success' ? Number.MAX_SAFE_INTEGER : 0;
  } else {
    value = total;
  }
  return {
    success: true,
    outcome: null,
    // `value` is the AWARDING value (a forced outcome can overwrite it to
    // MAX_SAFE_INTEGER/0), while `data.total` keeps the RAW roll total. A
    // `progressiveValue` trigger targets `value`; a `rollTotal` trigger targets
    // `data.total` — so the two can resolve differently on the same roll.
    value,
    data: {
      formula,
      resolvedFormula,
      total,
      value,
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
 *
 * `clampToNearest` (relative only) closes the below-lowest dead zone: when the total
 * meets NO relative threshold, it routes to the lowest-threshold tier (the closest
 * one) instead of returning null, so a rising base DC never yields a rolled-but-
 * unrouted craft. There is no top-end clamp — the highest tier is meet-or-exceed and
 * unbounded above. The flag is ignored in the fixed branch (authored ranges own their
 * own gaps).
 */
function matchRoutedOutcome({
  type,
  total,
  dc,
  comparison,
  relativeOutcomes,
  fixedOutcomes,
  clampToNearest = false,
}) {
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
  let lowest = null;
  let lowestThreshold = null;
  for (const outcome of outcomes) {
    if (!outcome) continue;
    const delta = Number(outcome.dc);
    if (!Number.isFinite(delta)) continue;
    const threshold = dc + delta;
    // Track the lowest-threshold tier for the clamp fallback; strict `<` keeps the
    // first tier (author order) among equal-lowest thresholds — deterministic.
    if (lowest === null || threshold < lowestThreshold) {
      lowest = outcome;
      lowestThreshold = threshold;
    }
    const matches = comparison === 'exceed' ? total > threshold : total >= threshold;
    if (!matches) continue;
    if (best === null || threshold > bestThreshold) {
      best = outcome;
      bestThreshold = threshold;
    }
  }
  // Below every threshold: clamp to the closest (lowest) tier when asked, else null.
  if (best === null && clampToNearest) return lowest;
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
 * routing. A unified trigger's forced outcome overrides the disposition: a forced
 * SUCCESS routes to the best succeeding tier, a forced FAILURE to the worst failing
 * tier. The surfaced `data.breakTools` is the matched (or rerouted) tier's own flag
 * (the routed per-tier legacy bridge). When no tier matches (and no forced outcome
 * reroutes), `outcome` is null and `success` reflects the forced outcome (when any)
 * or `false`.
 *
 * HEADLESS: with no dice engine the routed check cannot simulate a tier, so it
 * returns a non-blocking `{ success: true, outcome: null, value: null }` rather
 * than fabricating a route.
 *
 * @param {object} [params.rollOptions] Optional interactive-roll bag threaded to
 *   {@link evaluateCheckRoll} (built by `buildInteractiveRollOptions`). When the
 *   player dismisses the interactive prompt, the runner returns
 *   `{ success: false, cancelled: true, outcome: null, value: null }` so the caller
 *   aborts with zero mutation. Omit it (the default) for a silent roll.
 * @param {boolean} [params.clampToNearest] Relative-mode only: when a total meets no
 *   tier threshold, route to the lowest (closest) tier instead of returning a null
 *   outcome. Opted into by the crafting + salvage callers; gathering leaves it off to
 *   preserve its "no tier name → failure" path.
 * @returns {Promise<{success: boolean, outcome: string|null, value: number|null, data: object, message: string|null}>}
 */
export async function runFormulaRouted({
  formula: rawFormula,
  dc,
  thresholdMode,
  type,
  relativeOutcomes,
  fixedOutcomes,
  triggers,
  actor,
  label = 'Crafting',
  rollOptions = null,
  clampToNearest = false,
}) {
  const formula = String(rawFormula || '').trim();
  let total = 0;
  let diceGroups = [];
  let resolvedFormula = null;
  if (formula) {
    let rolled;
    try {
      rolled = await evaluateCheckRoll(formula, actor, { ...rollOptions, dc });
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
    // The player cancelled the interactive roll dialog: abort with zero mutation.
    if (rolled.cancelled) {
      return {
        success: false,
        cancelled: true,
        cancelledReason: rolled.cancelledReason,
        outcome: null,
        value: null,
        data: { dc, formula, type },
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
    resolvedFormula = rolled.resolvedFormula;
  }

  const comparison = thresholdMode === 'exceed' ? 'exceed' : 'meet';
  const forced = resolveForcedOutcome(triggers, { total, diceGroups });

  let matched = matchRoutedOutcome({
    type,
    total,
    dc,
    comparison,
    relativeOutcomes,
    fixedOutcomes,
    clampToNearest,
  });

  if (forced) {
    // A forced outcome overrides the disposition: route to the best (success) /
    // worst (failure) tier of that flag. If none exists, drop the tier-derived
    // match entirely.
    matched = routeCritOutcome({
      type,
      forcedSuccess: forced.disposition === 'success',
      relativeOutcomes,
      fixedOutcomes,
    });
  }

  const success = forced
    ? forced.disposition === 'success'
    : matched
      ? matched.success === true
      : false;
  // The matched (or rerouted) tier's `breakTools` is the only `data.breakTools`
  // source — the routed per-tier legacy bridge the breakage seam reads.
  const breakTools = matched ? matched.breakTools === true : false;

  return {
    success,
    outcome: matched ? matched.name : null,
    value: total,
    data: {
      dc,
      formula,
      resolvedFormula,
      total,
      type,
      comparison,
      outcomeId: matched?.id ?? null,
      success,
      breakTools,
      diceGroups,
    },
    message: success ? null : `${label} check failed`,
  };
}
