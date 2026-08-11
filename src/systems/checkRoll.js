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
import {
  applyD20Advantage,
  hasPlainD20,
  stripRetiredModifierPlaceholder,
} from '../utils/craftingCheckExpression.js';

import { appendResolvedCheckModifier } from './checkModifierResolver.js';
import {
  appendCheckModifierRollTerms,
  appendCheckModifierTerm,
  CHECK_MODIFIER_TERM_LABEL,
} from './toolCheckBonus.js';

/**
 * The deferred `playerPicks` slot the roll prompt renders in place of a number.
 *
 * It is a TRAILING term (`1d20 + 3 + (modifier)[Modifiers]`) rather than an inline
 * placeholder, matching where the resolved term actually lands (issue 1094). A specific
 * number would misrepresent a non-default pick, and `cleanHTML` strips inline handlers
 * so a live-updating preview is not available; the per-option chips carry each option's
 * value.
 */
const DEFERRED_MODIFIER_SLOT = `(modifier)[${CHECK_MODIFIER_TERM_LABEL}]`;

/**
 * Summarise an evaluated Roll's dice as
 * `{ groupId, group: "NdS", sum, results: number[] }` entries.
 *
 * - `groupId` is the index into the evaluated `roll.dice` term order (NOT re-parsed
 *   from the formula string), so duplicate `NdS` groups (`1d20 + 1d20` → groupId 0
 *   and 1) are disambiguated deterministically. The `checkBreakage` `diceGroup`
 *   trigger DSL targets a group by this index.
 *
 *   SINCE ISSUE 1118 A ROLLING CHECK MODIFIER CONTRIBUTES DICE HERE TOO, and the decision
 *   about that is deliberate rather than overlooked. Modifier terms are APPENDED, so every
 *   die the authored formula declares keeps the index it always had and no working trigger
 *   changes meaning. What DOES change is a trigger whose `groupId` already DANGLED — authored
 *   against a formula that has since lost a die — which used to match nothing and can now
 *   resolve against a modifier's die. It is not guarded here because the only available guard
 *   is a group count re-parsed from the authored formula, and `parseDiceGroups` and
 *   `roll.dice` do not agree term-for-term on every formula (a parenthesised die count, for
 *   one), so a slice would sometimes drop an AUTHORED group from trigger matching — a worse
 *   failure than the one it fixes. `CheckTriggers.svelte` offers only the authored formula's
 *   groups, so a dangling id is reachable only by editing a formula after authoring a trigger
 *   against it, and readiness has no rule for it.
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
 * circular. Such a trigger stays live at the two later seams where a tier IS known —
 * it can drive a tier STEP against the rolled tier (see
 * {@link applyTierStepTriggers}, issue 975) and it still breaks tools at the engine
 * seam — so this is one of three call sites of the shared evaluator, not two.
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
 * The ids a returned prompt choice ASKS to spend, before any validation.
 *
 * Three shapes are accepted, in this precedence, and the order matters:
 *
 * 1. `chosenModifierIds` — the multi-pick array the prompt returns today. An EMPTY
 *    array is an answer ("I picked nothing"), not an absence, so it wins over the
 *    descriptor default and appends no modifier term at all.
 * 2. `chosenModifierId` — the historical single-pick field. Still honoured so a caller
 *    or harness that supplies one keeps working rather than silently rolling the
 *    default; `null`/`undefined` falls through, exactly as the `??` it replaces did.
 * 3. The descriptor's own pre-selection — the headless-confirm fallback, where the
 *    prompt confirmed without reporting a selection at all.
 *
 * @param {{defaultSelectedIds?: string[], defaultSelectedId?: string}|null} modifierChoice
 * @param {{chosenModifierIds?: unknown, chosenModifierId?: unknown}|null} choice
 * @returns {unknown[]}
 */
function requestedModifierIds(modifierChoice, choice) {
  if (Array.isArray(choice?.chosenModifierIds)) return choice.chosenModifierIds;
  const single = choice?.chosenModifierId;
  if (single !== undefined && single !== null) return [single];
  const defaults = modifierChoice?.defaultSelectedIds;
  if (Array.isArray(defaults)) return defaults;
  const fallback = modifierChoice?.defaultSelectedId;
  return fallback === undefined || fallback === null ? [] : [fallback];
}

/**
 * Reduce a returned prompt selection to the modifiers that actually count, the scalar the
 * FLAT ones sum to, the roll fragments the ROLLING ones contribute, and their labels.
 *
 * The prompt is a UI control, so its cap is not the invariant — this layer re-derives
 * the legal selection from the descriptor and never trusts what came back:
 *
 * - An id the descriptor never OFFERED is discarded rather than valued (an unknown id
 *   contributed 0 before and contributes nothing now, so a lone unknown id still
 *   reduces to 0).
 * - The survivors are taken in ELIGIBLE-SET order and TRUNCATED to `maxPicks`, matching
 *   how `resolveEligibleModifierIds` bounds a `bySubject` selection. Ordering by the
 *   descriptor rather than by the returned array makes the outcome independent of the
 *   order the prompt happened to report, and truncating (rather than taking the best N)
 *   keeps an over-large selection from paying MORE than a legal one.
 * - `maxPicks` absent, or not a positive integer, means 1 — the historical single-pick
 *   behaviour, so a descriptor built before this field existed cannot silently widen.
 * - An empty selection sums to 0 and contributes no fragments.
 *
 * The fragments are taken VERBATIM from the descriptor (issue 1118). They were built,
 * clamped and validated by `checkModifierResolver` when the choice was described, so this
 * layer neither re-clamps nor re-wraps them — a second spelling of the same fragment is how
 * the offered chip and the rolled term would come to disagree.
 *
 * @param {{modifiers?: Array<{id: string, label?: string, value?: number|null,
 *   formula?: string|null}>, maxPicks?: number, defaultSelectedIds?: string[],
 *   defaultSelectedId?: string}|null} modifierChoice
 * @param {{chosenModifierIds?: unknown, chosenModifierId?: unknown}|null} choice
 * @returns {{value: number, formulas: string[], labels: string[]}}
 */
function resolveModifierSelection(modifierChoice, choice) {
  const offered = Array.isArray(modifierChoice?.modifiers) ? modifierChoice.modifiers : [];
  const requested = new Set(requestedModifierIds(modifierChoice, choice));
  const rawCap = Number(modifierChoice?.maxPicks);
  const maxPicks = Number.isInteger(rawCap) && rawCap > 0 ? rawCap : 1;
  const picked = offered
    .filter((modifier) => typeof modifier?.id === 'string' && requested.has(modifier.id))
    .slice(0, maxPicks);
  const value = picked.reduce((sum, modifier) => {
    const num = Number(modifier?.value);
    return sum + (Number.isFinite(num) ? num : 0);
  }, 0);
  const formulas = picked
    .map((modifier) => modifier?.formula)
    .filter((formula) => typeof formula === 'string' && formula.trim() !== '');
  const labels = picked
    .map((modifier) => modifier?.label)
    .filter((label) => typeof label === 'string' && label !== '');
  return { value, formulas, labels };
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
 * @param {{bonus?: string|null, rollMode?: string, advantage?: string}|null}
 *   [options.rollDecision] A PRE-RESOLVED roll decision (issue 859 bulk salvage):
 *   `promptCheckRoll`'s return shape MINUS `confirmed`. When present on an interactive
 *   roll it is used as the player's `choice` and NO dialog is shown, so one answer can
 *   drive N rolls. Everything downstream of the choice is identical to a prompted roll
 *   (the check-modifier append, advantage transform, the `Roll.validate` net,
 *   `effectiveRollMode`). Absent on every single-item path.
 * @param {string} [options.rollMode] The effective chat roll mode.
 * @param {string} [options.flavor] Chat message flavor / dialog label.
 * @param {object} [options.speaker] Chat message speaker.
 * @param {*} [options.dc] The DC surfaced to the prompt (display only).
 * @param {object} [options.craftingModifier] The check-modifier context
 *   (issue 770): `{ catalogue, systemPolicy, defaultModifierIds, recipeModifier,
 *   maxModifierPicks }`. Resolved to a scalar and APPENDED as one `+ N[Modifiers]` term
 *   before the formula reaches Foundry's `Roll`.
 * @param {{modifiers: Array<{id,label,icon,value}>, maxPicks: number,
 *   defaultSelectedIds: string[], defaultSelectedId: string}} [options.modifierChoice]
 *   The deferred interactive `playerPicks` descriptor (issues 770, 1055). Present only
 *   on an interactive `playerPicks` craft; when set, NO modifier term is appended until
 *   the prompt returns the chosen ids, and then the SUM of those modifiers' values is.
 *   `playerPicks` is multi-pick: the player selects up to `maxPicks`, so a cap of 1 is
 *   the historical single-pick behaviour and nothing else about this path changes.
 *   Absent on every other path.
 * @returns {Promise<{engine: boolean, total: number, diceGroups: Array<object>,
 *   resolvedFormula: string|null, cancelled?: boolean}>}
 */
export async function evaluateCheckRoll(formula, actor, options = {}) {
  if (typeof globalThis.Roll !== 'function')
    return { engine: false, total: 0, diceGroups: [], resolvedFormula: null };
  // The retirement shim runs UNCONDITIONALLY at the head (issue 1094), so a token that
  // survived the `1.21.0` migration — hand-edited, imported, or seeded by a fixture —
  // can never reach Foundry's `Roll` and can never double-count against the appended
  // term below. It is TOTAL: what comes back is a formula `Roll.validate` accepts or
  // `''`, never a dangling operator.
  const authoredFormula = stripRetiredModifierPlaceholder(String(formula));
  // A formula the shim emptied is NOT a check. The usability readers
  // (`resolveActiveCraftingCheckFormula`, `resolveSalvageCheck`) report it as
  // "no formula", and `_runCraftingCheck` now gates all five of its runner decisions on
  // that same POST-SHIM `checkUsable`, so this is a BACKSTOP rather than the only guard:
  // it keeps `new Roll('')` — which throws, and would surface as a rolled and therefore
  // CONSUMING failure — unreachable from any caller that reaches this function by another
  // route (a hand-built config, a runner called directly). Reported as "no engine", the
  // shape every runner already treats as non-blocking.
  if (authoredFormula.trim() === '')
    return { engine: false, total: 0, diceGroups: [], resolvedFormula: null };
  const rollData = actor?.getRollData?.() ?? actor?.system ?? {};
  // Interactive `playerPicks` (issue 770 Phase 2): the modifier value depends on a
  // selection made INSIDE the prompt, so it cannot be pre-resolved here. When a deferred
  // `modifierChoice` descriptor is present AND this is an interactive prompt roll, append
  // nothing yet and append the chosen value after the prompt returns. Every other path
  // (all Phase-1 policies, and non-interactive `playerPicks`) appends the deterministic
  // scalar, exactly as before.
  const modifierChoice = options?.modifierChoice;
  const useDeferredChoice =
    Boolean(modifierChoice) &&
    options?.interactive === true &&
    typeof options.prompt === 'function';
  // Append the resolved check-modifier scalar (issues 770, 1094) BEFORE anything
  // downstream reads the formula, so the dialog, roll, and journal all agree
  // (eval == display). A zero scalar — or no modifier context at all — appends nothing.
  const baseFormula = useDeferredChoice
    ? authoredFormula
    : appendResolvedCheckModifier(authoredFormula, actor, options?.craftingModifier);
  // Capture the @-resolved formula (e.g. "1d20 + 3") so the dialog and run journal
  // can show the actual modifiers, not the authored `@abilities…` placeholders.
  // Recomputed from the COMBINED formula below when a valid situational bonus is
  // applied, so the journal display reconciles with the rolled total (FIX 3).
  let resolved = resolveCheckFormulaDisplay(baseFormula, actor);

  let effectiveFormula = baseFormula;
  let effectiveRollMode = options?.rollMode;
  let effectiveFlavor = options?.flavor;
  // THE ADVANTAGE QUESTION IS ASKED OF THE AUTHORED CHECK, NEVER OF THE APPENDED MODIFIERS
  // (issue 1118 review). Once a modifier may roll, `parsePlainDiceGroups` — which splits on
  // parens AND flavour brackets — reads `(1d20)[Modifiers]` as a plain `1d20`, so a `2d10`
  // check carrying a `1d20` modifier would offer Advantage it does not have and
  // `applyD20Advantage` would rewrite the MODIFIER's die into `2d20kh1`. It also made the two
  // paths disagree with each other: the non-deferred one computed `allowAdvantage` AFTER the
  // append and the deferred one BEFORE it, on the same system.
  //
  // The transform is applied to this prefix and the remainder is re-attached, which is sound
  // because every appender here only ever APPENDS to the trimmed base — `appendToolBonusTerms`
  // and `appendCheckModifierRollTerms` both return `base + terms`. The `startsWith` guard
  // keeps that an invariant rather than an assumption: a caller that ever breaks it falls back
  // to the whole-string transform instead of splicing at the wrong offset.
  let advantageBase = authoredFormula.trim();

  // A PRE-RESOLVED decision (issue 859): one prompt answer applied to every roll of a
  // bulk run. It stands in for the dialog's return value, so the whole block below —
  // and only that block — has two ways to obtain a `choice`.
  const preResolved = options?.rollDecision ?? null;

  // Interactive roll (opt-in): confirm with the player (or reuse a pre-resolved
  // decision) and optionally append a situational modifier before rolling. A cancelled
  // prompt short-circuits with `cancelled: true` so the runner can abort with zero
  // mutation.
  //
  // The `Boolean(preResolved) ||` half is load-bearing: without it a decision supplied
  // with no `prompt` is silently discarded and the BASE formula rolls — the bulk run's
  // situational bonus, advantage and roll mode all vanish with no error.
  if (
    options?.interactive === true &&
    (Boolean(preResolved) || typeof options.prompt === 'function')
  ) {
    // Prompt-only work, so it lives in the prompt arm and is never computed for a
    // pre-resolved roll (which shows no dialog and needs no display formula).
    const askPlayer = async () => {
      // For a deferred modifier choice the modifier value is the player's pick, which
      // isn't known until the dialog resolves. Show the slot as a neutral TRAILING
      // `+ (modifier)[Modifiers]` term — the same position the resolved term takes —
      // rather than a static default number a non-default pick would contradict. Other
      // `@` placeholders still resolve to numbers; the per-option value chips carry each
      // option's value.
      const promptFormula = useDeferredChoice
        ? `${effectiveFormula} + ${DEFERRED_MODIFIER_SLOT}`
        : effectiveFormula;
      const promptResolved = useDeferredChoice
        ? resolveCheckFormulaDisplay(promptFormula, actor)
        : resolved;
      return options.prompt({
        formula: promptFormula,
        resolvedFormula: promptResolved?.display ?? null,
        dc: options.dc,
        label: options.flavor,
        name: options.name,
        activity: options.activity,
        img: options.img,
        modifierChoice,
        // Advantage/Disadvantage are offered only for a plain-d20 check — the AUTHORED
        // check, not whatever the modifiers appended to it.
        allowAdvantage: hasPlainD20(advantageBase),
      });
    };
    const choice = preResolved ?? (await askPlayer());
    // LOAD-BEARING `=== false`: a pre-resolved `rollDecision` carries NO `confirmed`
    // key (it is `promptCheckRoll`'s shape minus that flag), so tightening this to
    // `!choice.confirmed` would turn every bulk roll into a cancellation.
    if (!choice || choice.confirmed === false) {
      return { engine: true, cancelled: true, total: 0, diceGroups: [], resolvedFormula: null };
    }
    // Resolve the player's modifier selection FIRST — before the advantage transform and
    // situational-bonus append — so those compose on top of the chosen modifier and the
    // same appended formula feeds eval AND display (eval == display).
    if (useDeferredChoice) {
      // The player may pick UP TO `maxPicks` modifiers; the flat ones SUM into one term and
      // each rolling one appends its own (issue 1118). `resolveModifierSelection` owns the
      // whole reduction, including re-imposing the cap the prompt only *displays* and
      // falling back to the pre-selection when the prompt confirmed without one (headless).
      // A zero sum with no fragments appends nothing, which is the same formula an empty
      // pick would have rolled before.
      const selection = resolveModifierSelection(modifierChoice, choice);
      effectiveFormula = appendCheckModifierRollTerms(
        appendCheckModifierTerm(effectiveFormula, { value: selection.value }),
        selection.formulas
      );
      resolved = resolveCheckFormulaDisplay(effectiveFormula, actor);
      // Best-effort: append the chosen modifier labels to the chat flavor (e.g.
      // `… · Herbalism, Alchemist's Kit`), riding the existing flavor thread. One
      // bullet-joined segment however many were picked, so the flavor does not grow a
      // separator per modifier.
      const chosenLabel = selection.labels.join(', ');
      // Only join with the bullet when there is an existing flavor; an empty base must
      // not leave an orphan `· ` (production always supplies a flavor, but direct
      // callers/tests may not).
      if (chosenLabel) {
        effectiveFlavor = effectiveFlavor ? `${effectiveFlavor} · ${chosenLabel}` : chosenLabel;
      }
    }
    // Advantage transform first (so the situational bonus appends AFTER the pool),
    // yielding e.g. `2d20kh1 + 3 + (2)`. Only a plain `1d20` is rewritten; any other
    // disposition or formula is left unchanged.
    if (choice.advantage === 'advantage' || choice.advantage === 'disadvantage') {
      if (effectiveFormula.startsWith(advantageBase)) {
        const rewritten = applyD20Advantage(advantageBase, choice.advantage);
        effectiveFormula = rewritten + effectiveFormula.slice(advantageBase.length);
        advantageBase = rewritten;
      } else {
        effectiveFormula = applyD20Advantage(effectiveFormula, choice.advantage);
      }
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
      // `Roll.validate` is a STATIC that does `new this(formula)` internally, so it MUST
      // be invoked as a method. Detaching it (`const validate = Roll.validate`) leaves
      // `this` undefined, `new this(...)` throws inside Foundry's own try/catch, and it
      // returns false for EVERY formula — which silently dropped the situational bonus
      // from every roll, whole number and dice expression alike.
      const RollClass = globalThis.Roll;
      if (typeof RollClass?.validate === 'function' && RollClass.validate(combined) === false) {
        console.warn('Fabricate | Ignoring invalid situational bonus', bonus);
      } else {
        effectiveFormula = combined;
        // Reconcile the journal display with the total actually rolled (FIX 3).
        resolved = resolveCheckFormulaDisplay(effectiveFormula, actor);
      }
    }
    if (choice.rollMode) effectiveRollMode = choice.rollMode;
  }

  // Automated check roll: never surface a manual roll-fulfilment dialog mid-craft
  // on a client configured for manual fulfilment (mirrors Roll.simulate's V13
  // behaviour). `allowInteractive: false` suppresses that resolver.
  const roll = await new globalThis.Roll(effectiveFormula, rollData).evaluate({
    allowInteractive: false,
  });
  const rolledTotal = Number(roll?.total);
  const total = Number.isFinite(rolledTotal) ? rolledTotal : 0;

  // Surface the roll to chat so Dice So Nice animates it (interactive only).
  // `toMessage` is the DSN trigger — no dice3d/game.dice3d code is needed. A chat
  // failure is logged and swallowed, never thrown (mirrors
  // `CraftingEngine._postCraftChatMessage`).
  if (options?.interactive && typeof globalThis.ChatMessage?.create === 'function') {
    try {
      await roll.toMessage(
        { speaker: options.speaker, flavor: effectiveFlavor },
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
 * The optional `craftingModifier` context (issue 770) resolves the eligible check
 * modifiers to a scalar and APPENDS it FIRST — using the SAME pure resolver the eval
 * path uses — so the displayed formula equals what evaluates (eval == display).
 *
 * @param {string} formula
 * @param {object|null} actor
 * @param {object|null} [craftingModifier] The check-modifier context
 *   (`{ catalogue, systemPolicy, defaultModifierIds, recipeModifier }`); omit for
 *   salvage/gathering, or wherever no modifier term should be appended.
 * @param {*} [Roll] The `Roll` class. A PARAMETER rather than a bare `globalThis` read
 *   (issue 1097) so a caller that already injects a `Roll` — the Checks Studio's odds
 *   enumerator does, to grade its predicate against recorded real-Foundry output — drives
 *   ONE dice engine rather than two. Defaulted, so every existing caller is unchanged.
 * @returns {{ display: string, resolved: boolean }|null}
 */
export function resolveCheckFormulaDisplay(
  formula,
  actor,
  craftingModifier = null,
  Roll = globalThis.Roll
) {
  if (typeof formula !== 'string' || formula.trim() === '') return null;
  if (typeof Roll?.replaceFormulaData !== 'function') return null;
  // The retirement shim runs unconditionally here too (issue 1094), so a display can
  // never render a token the roll path has already stripped — and a formula that strips
  // to empty reports "no formula" rather than a dangling operator.
  const authored = stripRetiredModifierPlaceholder(String(formula), Roll);
  if (authored.trim() === '') return null;
  const rollData = actor?.getRollData?.() ?? actor?.system ?? {};
  const substituted = appendResolvedCheckModifier(authored, actor, craftingModifier, Roll);
  const display = Roll.replaceFormulaData(substituted, rollData, {
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
 * Reduce a free-text situational bonus to a NUMBER.
 *
 * The d100 gathering path folds a flat modifier into every percentile throw
 * (`GatheringRichStateService#resolveD100Attempt`), so unlike {@link evaluateCheckRoll} —
 * which appends the raw bonus to the formula and lets Foundry's `Roll` evaluate it — it
 * needs a scalar and cannot take a formula string.
 *
 * The roll prompt's bonus field is deliberately free text, so a player may enter `3`,
 * `1d4`, `2 + 1` or `@prof`. A plain number is used as-is (no dice engine needed, so the
 * headless path is unchanged); anything else is rolled through Foundry. Never returns NaN
 * — a malformed entry degrades to 0 rather than throwing mid-attempt, mirroring the safety
 * net in {@link evaluateCheckRoll}.
 *
 * @param {string|number|null|undefined} bonus The raw situational bonus.
 * @param {object|null} [actor] Actor supplying roll data for `@` placeholders.
 * @returns {Promise<number>} The bonus as a finite number (0 when absent or unusable).
 */
export async function evaluateSituationalBonus(bonus, actor = null) {
  const text = typeof bonus === 'string' ? bonus.trim() : bonus;
  if ([null, undefined, ''].includes(text)) return 0;
  // A plain number needs no dice engine — this keeps the common case (and the headless
  // path, where `Roll` may be absent or a minimal stub) behaving exactly as before.
  const direct = Number(text);
  if (Number.isFinite(direct)) return direct;
  const RollClass = globalThis.Roll;
  if (typeof RollClass !== 'function') return 0;
  const formula = String(text);
  // Called as a METHOD, not detached — see the note in `evaluateCheckRoll`.
  if (typeof RollClass.validate === 'function' && RollClass.validate(formula) === false) {
    console.warn('Fabricate | Ignoring invalid situational bonus', bonus);
    return 0;
  }
  try {
    const rollData = actor?.getRollData?.() ?? actor?.system ?? {};
    // `allowInteractive: false` keeps a client configured for manual fulfilment from
    // surfacing a roll resolver mid-attempt (the same footgun the check roll avoids).
    const rolled = await new RollClass(formula, rollData).evaluate({
      allowInteractive: false,
    });
    const total = Number(rolled?.total);
    return Number.isFinite(total) ? total : 0;
  } catch (error) {
    console.warn('Fabricate | Ignoring invalid situational bonus', bonus, error);
    return 0;
  }
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
  craftingModifier = null,
}) {
  const formula = String(rawFormula || '').trim();
  let total = 0;
  let diceGroups = [];
  let resolvedFormula = null;
  if (formula) {
    let rolled;
    try {
      rolled = await evaluateCheckRoll(formula, actor, { ...rollOptions, dc, craftingModifier });
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
      return { success: false, cancelled: true, outcome: null, value: null, data: { dc, formula } };
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
  craftingModifier = null,
}) {
  const formula = String(rawFormula || '').trim();
  let total = 0;
  let diceGroups = [];
  let resolvedFormula = null;
  if (formula) {
    let rolled;
    try {
      rolled = await evaluateCheckRoll(formula, actor, { ...rollOptions, craftingModifier });
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
      return { success: false, cancelled: true, outcome: null, value: null, data: { formula } };
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

/** The per-type ranking key: a relative tier ranks by DC delta, a fixed one by
 * range start. */
function routedRankKey(type) {
  return type === 'fixed' ? 'start' : 'dc';
}

/**
 * The SINGLE derivation of routed tier ORDER (issue 975). Ranks a routed check's
 * tiers ascending by `dc` (relative) / `start` (fixed) — worst first, best last — so
 * {@link routeCritOutcome}, the `minOutcomeId` gate and {@link applyTierStepTriggers}
 * all read one ordering instead of deriving three independently.
 *
 * Two properties are load-bearing, and losing either is a silent behaviour flip:
 *
 * - **Non-finite ranks are dropped.** A tier whose `dc`/`start` does not coerce to a
 *   finite number has no place in the order (both pre-975 derivations filtered it).
 * - **Ties keep AUTHOR order.** `routeCritOutcome` compared with strict `>` / `<`, so
 *   among tiers of equal rank it kept the FIRST authored one for BOTH dispositions.
 *   The secondary comparator on the author index reproduces that — and the sort takes
 *   an explicit comparator regardless, since `unicorn/require-array-sort-compare` is
 *   active.
 *
 * Callers locate a tier in the result by ID (`findIndex((o) => o.id === …)`, first
 * match wins), never by object identity: this is a copy, and a step composing on a
 * forced reroute would otherwise search it for an object it never contained.
 *
 * @returns {Array<object>} The rankable tiers, lowest rank first. Never null.
 */
function rankedRoutedOutcomes({ type, relativeOutcomes, fixedOutcomes }) {
  const key = routedRankKey(type);
  const source = type === 'fixed' ? fixedOutcomes : relativeOutcomes;
  return (Array.isArray(source) ? source : [])
    .map((outcome, authorIndex) => ({ outcome, authorIndex, rank: Number(outcome?.[key]) }))
    .filter((entry) => Boolean(entry.outcome) && Number.isFinite(entry.rank))
    .toSorted((left, right) => left.rank - right.rank || left.authorIndex - right.authorIndex)
    .map((entry) => entry.outcome);
}

/**
 * The ranked tiers sharing one success disposition — the subset a forced outcome
 * routes into and, from issue 975, the only subset a step may move within.
 */
function dispositionSubset(ranked, disposition) {
  const wantSuccess = disposition === 'success';
  return ranked.filter((outcome) => (outcome.success === true) === wantSuccess);
}

/**
 * Route a forced-crit disposition to a tier of the matching success flag. A forced
 * FAILURE (`forcedSuccess === false`) routes to the LOWEST-ranked failing tier
 * (relative: smallest `dc`; fixed: smallest `start`); a forced SUCCESS routes to the
 * HIGHEST-ranked succeeding tier. Among tiers of EQUAL rank the first authored one
 * wins in both directions. Returns the chosen tier, or null when no tier of that
 * disposition exists.
 */
function routeCritOutcome({ type, forcedSuccess, relativeOutcomes, fixedOutcomes }) {
  const wantSuccess = forcedSuccess === true;
  const ranked = dispositionSubset(
    rankedRoutedOutcomes({ type, relativeOutcomes, fixedOutcomes }),
    wantSuccess ? 'success' : 'failure'
  );
  if (ranked.length === 0) return null;
  // Ascending order: index 0 already IS the lowest-ranked, author-first tier.
  if (!wantSuccess) return ranked[0];
  // The highest rank sits at the end, but equal-rank tiers must resolve to the FIRST
  // authored one, so seek the START of the top-rank run rather than reading `at(-1)`.
  const key = routedRankKey(type);
  const topRank = Number(ranked.at(-1)[key]);
  return ranked[ranked.findIndex((outcome) => Number(outcome[key]) === topRank)];
}

/** The `tierStep.mode` values that ask for a real move; `'none'` (and anything
 * unrecognised) is inert. */
const TIER_STEP_MODES = new Set(['target', 'up', 'down']);

/**
 * The frozen ROLLED-tier snapshot every step condition is evaluated against — once,
 * and never again against the stepped tier.
 *
 * This is what makes an `outcomeTier`-conditioned step non-circular and terminating:
 * the pass is a pure function of `(rolled tier, triggers, roll)` with no feedback
 * edge, so the obvious cycle ("land on Poor, step down" / "land on Terrible, step
 * up") cannot iterate and no iteration order can leak into the result. Stated as a
 * domain rule: a step condition asks about the tier the dice landed on, never about
 * the tier the step produces.
 *
 * `value` is left `undefined` so `progressiveValue` stays invisible here, matching
 * the existing {@link resolveForcedOutcome} call.
 */
function rolledTierSnapshot(rolled, total, diceGroups) {
  return Object.freeze({
    value: undefined,
    outcome: rolled?.name ?? null,
    data: Object.freeze({
      total,
      diceGroups: Array.isArray(diceGroups) ? diceGroups : [],
      outcomeId: rolled?.id ?? null,
    }),
  });
}

/** Every trigger whose condition matches the rolled tier AND whose `tierStep` asks
 * for a real move, in author order. */
function matchedTierStepTriggers(triggers, snapshot) {
  return (Array.isArray(triggers) ? triggers : []).filter((trigger) => {
    if (!TIER_STEP_MODES.has(trigger?.tierStep?.mode)) return false;
    return evaluateCheckBreakageCondition(trigger.condition, snapshot);
  });
}

/**
 * A `tierStep.steps` magnitude: an integer `>= 1`, the same clamp
 * `_normalizeTierStep` applies on the way in.
 *
 * Clamped HERE as well so the runtime does not depend on the normalizer having run.
 * A magnitude is a MAGNITUDE — the direction lives in `mode` — so a raw `steps: -2`
 * on an `up` trigger must not silently step DOWN two, inverting the effect the GM
 * authored. Unreachable through the normalizer today; independent of it by
 * construction now.
 */
function tierStepMagnitude(steps) {
  const value = Math.trunc(Number(steps));
  return Number.isFinite(value) && value >= 1 ? value : 1;
}

/**
 * Resolve the winning `target` trigger against the array in play — FILTER, then
 * CHOOSE.
 *
 * A target is ELIGIBLE only when its `tierId` resolves to a tier present in that
 * array. An ineligible one — a dangling id, or (under a forced outcome) a target
 * naming the opposite disposition — is discarded BEFORE the comparison, so it can
 * never beat a valid competitor and then no-op. Among the eligible ones the
 * LOWEST-RANKED tier wins: order-independent and pessimistic, mirroring
 * {@link resolveForcedOutcome}'s "a matched failure beats a matched success
 * regardless of position".
 *
 * @returns {{ index: number, trigger: object|null }} `index` is -1 when no eligible
 *   target survives, in which case the rolled (or forced) tier is the step base.
 */
function resolveTierStepTarget(stepping, inPlay) {
  let index = -1;
  let trigger = null;
  for (const candidate of stepping) {
    if (candidate.tierStep.mode !== 'target') continue;
    const tierId = candidate.tierStep.tierId;
    if (typeof tierId !== 'string' || tierId === '') continue;
    const found = inPlay.findIndex((outcome) => outcome.id === tierId);
    if (found === -1) continue;
    if (index === -1 || found < index) {
      index = found;
      trigger = candidate;
    }
  }
  return { index, trigger };
}

/** The signed net of the relative steps: `Σ up.steps − Σ down.steps`. Summation is
 * the only commutative composition, so two `up 1` triggers make `up 2` and
 * `up 1` + `down 1` is a deliberate no-op rather than an order-dependent coin flip. */
function netTierSteps(stepping) {
  return stepping.reduce((net, trigger) => {
    const { mode, steps } = trigger.tierStep;
    if (mode === 'up') return net + tierStepMagnitude(steps);
    if (mode === 'down') return net - tierStepMagnitude(steps);
    return net;
  }, 0);
}

/** The ids credited with the applied step: the winning target plus every matched
 * relative trigger, in author order. A losing or ineligible target contributed
 * nothing to the move and is not credited. */
function appliedTierStepTriggerIds(stepping, winningTarget) {
  return stepping
    .filter((trigger) => trigger.tierStep.mode !== 'target' || trigger === winningTarget)
    .map((trigger) => trigger.id)
    .filter((id) => typeof id === 'string' && id !== '');
}

/**
 * Apply the `tierStep` effect of every matching unified trigger to the rolled tier
 * (issue 975), replacing the old `natStepping` boolean's hard-coded d20/±1 rule.
 *
 * **Stepping is disposition-preserving.** The ARRAY IN PLAY is the ranked subset of
 * tiers sharing the forced disposition when a forced outcome is present, and the
 * whole ranked list otherwise. Every index, "lowest-ranked" and the clamp are
 * computed over that array, so a forced outcome can never step across into the
 * opposite disposition and `data.success` can never disagree with the final tier's
 * own `success`.
 *
 * Composition, in order: the winning eligible `target` (if any) sets the base index,
 * the net relative offset applies from there, and the result CLAMPS to
 * `[0, length - 1]` of the array in play. That clamp is unrelated to
 * `clampToNearest`, which decides whether a tier matched at all; this one decides
 * where an out-of-range step lands, and the evidence names it `stepClamped` so the
 * two never read as one concept.
 *
 * @param {object|null} params.rolled The tier `matchRoutedOutcome` produced, after
 *   any forced reroute. `null` steps nothing — `target` included, since a check that
 *   matched no tier is the deliberate "no route" path.
 * @param {'success'|'failure'|null} params.forcedDisposition
 * @returns {{ matched: object|null, tierStepApplied: object|null }} `tierStepApplied`
 *   is present only on a REAL tier change.
 */
function applyTierStepTriggers({
  rolled,
  type,
  forcedDisposition = null,
  triggers,
  relativeOutcomes,
  fixedOutcomes,
  total,
  diceGroups,
}) {
  if (!rolled) return { matched: null, tierStepApplied: null };

  const stepping = matchedTierStepTriggers(triggers, rolledTierSnapshot(rolled, total, diceGroups));
  if (stepping.length === 0) return { matched: rolled, tierStepApplied: null };

  const ranked = rankedRoutedOutcomes({ type, relativeOutcomes, fixedOutcomes });
  const inPlay = forcedDisposition === null ? ranked : dispositionSubset(ranked, forcedDisposition);
  const fromIndex = inPlay.findIndex((outcome) => outcome.id === rolled.id);
  if (fromIndex === -1) return { matched: rolled, tierStepApplied: null };

  const target = resolveTierStepTarget(stepping, inPlay);
  const base = target.index === -1 ? fromIndex : target.index;
  const requestedIndex = base + netTierSteps(stepping);
  const toIndex = Math.min(Math.max(requestedIndex, 0), inPlay.length - 1);
  // Present only on a real tier change: a fully clamped no-op and a cancelling
  // `up 1` + `down 1` both leave the rolled tier standing with no evidence.
  if (toIndex === fromIndex) return { matched: rolled, tierStepApplied: null };

  const stepped = inPlay[toIndex];
  // `target` whenever a target won, whatever the index delta — "you were placed on
  // Masterwork" has no direction.
  let mode = 'target';
  if (target.index === -1) mode = toIndex > fromIndex ? 'up' : 'down';
  return {
    matched: stepped,
    tierStepApplied: {
      mode,
      // The REALIZED magnitude, not the requested one: evidence describes the effect,
      // and the chat card's step notice renders this count straight to the player.
      // `stepClamped` carries the fact that the author asked for more.
      steps: Math.abs(toIndex - fromIndex),
      fromOutcomeId: rolled.id ?? null,
      toOutcomeId: stepped.id ?? null,
      stepClamped: requestedIndex !== toIndex,
      triggerIds: appliedTierStepTriggerIds(stepping, target.trigger),
    },
  };
}

/**
 * Decide whether the FIXED-type recipe minimum-success-tier gate blocks the final
 * (post-step) tier.
 *
 * It consumes {@link rankedRoutedOutcomes} to LOCATE the required tier but keeps
 * comparing threshold VALUES rather than rank indices, which is load-bearing:
 * `_normalizeRoutedOutcome` stores duplicate and overlapping ranges without
 * complaint (`rangeOverlap` is a `critical` READINESS issue but never an
 * enforcement — `checksReadiness.js` reports it and nothing refuses the roll), so
 * two fixed tiers sharing a `start` compare EQUAL by value and the craft passes,
 * where an index comparison would strictly fail it.
 */
function minSuccessTierFailed({ type, minOutcomeId, matched, relativeOutcomes, fixedOutcomes }) {
  if (type !== 'fixed' || !minOutcomeId) return false;
  const ranked = rankedRoutedOutcomes({ type, relativeOutcomes, fixedOutcomes });
  const requiredIndex = ranked.findIndex((outcome) => outcome.id === minOutcomeId);
  const requiredStart = Number(ranked[requiredIndex]?.start);
  // A stale/unknown `minOutcomeId` no-ops gracefully, like `checkTierId`.
  if (!Number.isFinite(requiredStart)) return false;
  const matchedStart = Number(matched?.start);
  return !Number.isFinite(matchedStart) || matchedStart < requiredStart;
}

/**
 * Classify ONE total against a routed check's tiers — the whole of
 * {@link runFormulaRouted}'s post-roll resolution, extracted so nothing else has to
 * restate it (issue 1097).
 *
 * The Checks Studio's odds histogram enumerates a die group's faces and buckets each
 * one, and a preview that disagrees with the engine about which tier a total lands on
 * is worse than no preview at all. So this is not a shared helper the runner *may*
 * use: `runFormulaRouted` calls it, which is what makes drift impossible rather than
 * merely unlikely.
 *
 * Composition order is the runner's own and is load-bearing — forced reroute, then
 * tier step, then the recipe minimum gate — and is documented at each step in
 * {@link runFormulaRouted}.
 *
 * `diceGroups` is the bag {@link resolveForcedOutcome} and {@link applyTierStepTriggers}
 * both read. A caller synthesising one per face MUST build it through
 * {@link rolledDiceGroups}: a bag missing `results` makes every per-die trigger silently
 * invisible while still matching a hand-computed distribution for a trigger-free check.
 *
 * @param {object} params
 * @param {'relative'|'fixed'} params.type
 * @param {number} params.total The rolled (or enumerated) total.
 * @param {number} params.dc The base DC relative thresholds are measured against.
 * @param {'meet'|'exceed'} params.comparison Already reduced from `thresholdMode`.
 * @param {Array<object>} [params.relativeOutcomes]
 * @param {Array<object>} [params.fixedOutcomes]
 * @param {Array<object>} [params.triggers]
 * @param {Array<object>} [params.diceGroups]
 * @param {boolean} [params.clampToNearest]
 * @param {?string} [params.minOutcomeId]
 * @returns {{
 *   matched: object|null,
 *   forcedDisposition: 'success'|'failure'|null,
 *   success: boolean,
 *   breakTools: boolean,
 *   tierStepApplied: object|null,
 *   minTierFailed: boolean,
 *   blockedOutcomeId: string|null,
 * }} `matched` is the EFFECTIVE tier (null when the minimum gate blocked it);
 *   `blockedOutcomeId` names the tier the gate blocked and is null on a normal route.
 */
export function classifyCheckTotal({
  type,
  total,
  dc,
  comparison,
  relativeOutcomes,
  fixedOutcomes,
  triggers,
  diceGroups = [],
  clampToNearest = false,
  minOutcomeId = null,
}) {
  const forced = resolveForcedOutcome(triggers, { total, diceGroups });

  let matched = forced
    ? routeCritOutcome({
        type,
        forcedSuccess: forced.disposition === 'success',
        relativeOutcomes,
        fixedOutcomes,
      })
    : matchRoutedOutcome({
        type,
        total,
        dc,
        comparison,
        relativeOutcomes,
        fixedOutcomes,
        clampToNearest,
      });

  const tierStep = applyTierStepTriggers({
    rolled: matched,
    type,
    forcedDisposition: forced ? forced.disposition : null,
    triggers,
    relativeOutcomes,
    fixedOutcomes,
    total,
    diceGroups,
  });
  matched = tierStep.matched;

  const minTierFailed =
    !forced &&
    minSuccessTierFailed({ type, minOutcomeId, matched, relativeOutcomes, fixedOutcomes });
  const effectiveMatched = minTierFailed ? null : matched;

  const success = minTierFailed
    ? false
    : forced
      ? forced.disposition === 'success'
      : effectiveMatched
        ? effectiveMatched.success === true
        : false;

  return {
    matched: effectiveMatched,
    forcedDisposition: forced ? forced.disposition : null,
    success,
    // The matched (or rerouted) tier's `breakTools` is the only `data.breakTools`
    // source — the routed per-tier legacy bridge the breakage seam reads.
    breakTools: effectiveMatched ? effectiveMatched.breakTools === true : false,
    tierStepApplied: tierStep.tierStepApplied,
    minTierFailed,
    blockedOutcomeId: minTierFailed ? (matched?.id ?? null) : null,
  };
}

/**
 * Run a routed formula check: roll the formula and map the total onto one of the
 * configured outcome tiers (relative DC deltas or fixed value ranges), returning
 * the matched tier's NAME as `outcome` for the activity's outcome→result-group
 * routing. A unified trigger's forced outcome overrides the disposition: a forced
 * SUCCESS routes to the best succeeding tier, a forced FAILURE to the worst failing
 * tier. A unified trigger's `tierStep` effect then moves that ROLLED tier to the
 * FINAL tier (issue 975), within the forced disposition when one is in play. The
 * surfaced `data.breakTools` is the final tier's own flag (the routed per-tier legacy
 * bridge). When no tier matches (and no forced outcome reroutes), `outcome` is null
 * and `success` reflects the forced outcome (when any) or `false`.
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
 *   outcome. Every routed caller opts in today — crafting, salvage AND gathering
 *   (`GatheringEngine._resolveRoutedFormulaOutcome` passes `clampToNearest: true`) —
 *   so a rolled-but-unrouted check is only reachable by a caller that omits it.
 *   Unrelated to the tier-step clamp: this one decides whether a tier matched at all,
 *   that one decides where an out-of-range step lands (`data.tierStepApplied.stepClamped`).
 * @param {?string} [params.minOutcomeId] FIXED-type only: a recipe's minimum success
 *   tier id. When the FINAL (post-step) tier ranks below it (by `start`) — or the
 *   total lands outside every fixed range, so no tier matched at all — the check
 *   fails outright: `success:false`, no outcome routes, and the matched tier's
 *   `breakTools` is dropped (nothing routes, so the per-tier breakage bridge does
 *   not fire). Optional and no-op by default — only the crafting routedByCheck caller
 *   threads it, so salvage/gathering are unaffected. Ignored for relative type and
 *   bypassed by a forced (crit) outcome.
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
  minOutcomeId = null,
  craftingModifier = null,
}) {
  const formula = String(rawFormula || '').trim();
  let total = 0;
  let diceGroups = [];
  let resolvedFormula = null;
  if (formula) {
    let rolled;
    try {
      // Do NOT re-inject the tier-matching `dc` here: `evaluateCheckRoll` uses its
      // `dc` for the prompt DISPLAY only, and each caller already threads the correct
      // prompt-facing DC on `rollOptions` (undefined for a fixed routedByCheck check
      // so the prompt shows no DC chip; numeric otherwise). Re-adding `dc` would
      // clobber that and re-surface the meaningless DC on a fixed check (mirrors
      // `runFormulaProgressive`, which also spreads `rollOptions` with no `dc`).
      rolled = await evaluateCheckRoll(formula, actor, { ...rollOptions, craftingModifier });
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

  // The WHOLE post-roll resolution — forced reroute, then tier step, then the recipe
  // minimum gate — lives in the shared classifier so the Checks Studio's odds histogram
  // buckets each enumerated face through the identical code (issue 1097). The ordering
  // rationale is documented on {@link classifyCheckTotal}: forcing picks an EXTREME tier
  // while a step is RELATIVE, so stepping first would be silently discarded, and the gate
  // asks whether the craft reached the recipe's minimum, so it must judge the FINAL tier.
  const classified = classifyCheckTotal({
    type,
    total,
    dc,
    comparison,
    relativeOutcomes,
    fixedOutcomes,
    triggers,
    diceGroups,
    clampToNearest,
    minOutcomeId,
  });
  const { matched, success } = classified;

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
      breakTools: classified.breakTools,
      diceGroups,
      // Additive on a real tier change only (issue 975): the resolved NET effect, the
      // REALIZED magnitude, and the ids that produced it.
      ...(classified.tierStepApplied && { tierStepApplied: classified.tierStepApplied }),
      // Additive on a min-tier failure only: the tier the recipe minimum BLOCKED —
      // post-step, pre-gate — for a richer chat/journal explanation later. Named for
      // what the gate did to it rather than "rolled", which issue 975 mints as a term
      // of art for the PRE-step tier. Absent on a normal route.
      ...(classified.minTierFailed && {
        minTierFailed: true,
        blockedOutcomeId: classified.blockedOutcomeId,
      }),
    },
    message: success ? null : `${label} check failed`,
  };
}
