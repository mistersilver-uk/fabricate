/**
 * The **Standalone Check Roll** — Fabricate's check-roll mechanics, published to a companion
 * module that owns no crafting system (issue 1293).
 *
 * ## What "standalone" claims, and what it does not
 *
 * "Standalone" is a claim about the **crafting-system** axis: this roll stands outside any
 * `CraftingSystem`. It is NOT a claim about the **game-system** axis, where Fabricate is
 * agnostic on every path including this one — a Standalone Check Roll is exactly as
 * game-system agnostic as every other Fabricate check, which is to say completely.
 *
 * What this publishes is therefore NOT "a Fabricate check". A Fabricate check is always taken
 * on a subject inside a crafting system, and it carries that system's modifier catalogue, its
 * combination rule, tool bonuses, authored triggers, tier stepping and failure-result policy.
 * A Standalone Check Roll is the check-roll MECHANICS — `@`-placeholder resolution against the
 * actor's roll data, the retired-placeholder shim, the Advantage/Disadvantage rewrite, the
 * free-text situational bonus with its `Roll.validate` net, the roll mode and the chat post,
 * and the pass/fail or raw-total answer — WITHOUT the system-derived terms, because there is
 * no crafting system and no subject to derive them from.
 *
 * ## What it does NOT restore
 *
 * `evaluateCheckRoll` evaluates with `allowInteractive: false` UNCONDITIONALLY, so this member
 * inherits that and suppresses **Foundry's own `RollResolver`**. A GM configured for manual or
 * physical-dice fulfilment still does not type their die result here. What the seam restores
 * is a DIFFERENT dialog: Fabricate's own `promptCheckRoll`, which confirms the roll, offers
 * Advantage and a situational bonus, and — crucially — REPORTS ITS OWN DISMISSAL, so a caller
 * can abort with zero mutation. Foundry's dice resolver cannot: closing it fulfils the roll
 * with `term.randomFace()`, a real number indistinguishable from a typed one.
 *
 * ## This module has no crafting system, structurally rather than by discipline
 *
 * `buildCheckModifierContext(system, activity, subject)` needs a crafting system and a subject
 * that is a recipe, a component or a gathering task. A downtime activity is none of the three.
 * So this module passes `craftingModifier: null` and builds no `modifierChoice`: no
 * `+ N[Modifiers]` term appends, and the `playerPicks` fieldset never renders.
 *
 * That is INHERITING the derivation, not opting out of it. The roll still routes through
 * `evaluateCheckRoll`, whose base formula is the one implementation of shim-plus-append; with
 * no context the append is a documented no-op, and if the append ever changes, this member
 * changes with it. It mirrors `checkWorldCurrencyAffordability`'s own structural argument: the
 * answer must be UNABLE to consult a system rather than merely disciplined about not doing so.
 *
 * ## A Foundry-free leaf
 *
 * It reads NO global and imports only `./companionContract.js` and
 * `../utils/craftingCheckExpression.js`. Every runner, prompt, builder, election test, dice-
 * engine test and localizer arrives as a SEAM, and the resolved actor arrives as an argument —
 * the facade resolves it through the shared ownership-gated resolver, so this module resolves
 * nothing and reads no collection. There is therefore no second resolver to disagree with the
 * first, and no `globalThis.Roll` reference anywhere in this file.
 */

import { hasPlainD20, stripRetiredModifierPlaceholder } from '../utils/craftingCheckExpression.js';

import {
  CHECK_ROLL_DEFAULT_LABEL,
  COMPANION_CALL_SITES,
  COMPANION_OUTCOMES,
  bulkCheckDecisionResult,
  checkRollResult,
} from './companionContract.js';

/**
 * The POST-SHIM formula, or `''` when there is nothing left to roll.
 *
 * This is exactly `resolveActiveCraftingCheckFormula`'s shipped derivation — the retirement
 * shim, then a trim, then an emptiness test — under the reason written down beside it: THE
 * RETIREMENT SHIM RUNS BEFORE THE EMPTINESS TEST (issue 1094), so readiness and the roll path
 * can never disagree. It is re-derived here rather than imported because that reader takes a
 * CRAFTING SYSTEM, which this module does not have; `craftingCheckExpression.js` is the shared
 * leaf both derivations rest on.
 *
 * The shim empties far more than a bare token: it returns `''` both for a formula that reduces
 * to nothing (`'@craftingmod'`) and for one it REFUSES as non-additive or structurally unwhole
 * (`'max(@craftingmod, 2)'`, `'1d20 * @craftingmod'`). `'1d20+3'` survives untouched.
 *
 * @param {*} formula
 * @returns {string}
 */
function resolveUsableCheckFormula(formula) {
  return stripRetiredModifierPlaceholder(String(formula ?? '')).trim();
}

/**
 * Whether a formula can actually roll a check.
 *
 * INTERNAL, and deliberately not a seam. Making it injectable would let `rollActorCheck`'s
 * `noFormula` gate and `resolveBulkCheckDecision`'s usable filter disagree, which is the one
 * failure it exists to prevent. It takes no `Roll` argument either, so it and
 * `evaluateCheckRoll` read the dice engine through the same default binding and cannot diverge
 * on the shim's fail-open path.
 *
 * @param {*} formula
 * @returns {boolean}
 */
const isUsableCheckFormula = (formula) => resolveUsableCheckFormula(formula) !== '';

/**
 * The CALL-SITE rule, shared by both members and existing exactly once.
 *
 * A second shared rule beside the authorization preamble, deliberately separate because it
 * answers a different question: the preamble asks WHO is calling, this asks WHERE FROM. It
 * runs AFTER the readiness refusal, because it is request validation and that is where every
 * other member's request validation sits (`invalidGrantedBy`, `invalidAmount`).
 *
 * `invalidCallSite` covers BOTH a missing and an unrecognised declaration: "not declared" is
 * wrong for the second, and a caller cannot fix what it is not told.
 *
 * @param {object|null} request the member's own request
 * @param {{isElectedExecutor: () => boolean}} seams
 * @returns {string|null} the refusal outcome, or `null` when the call site is admitted
 */
function gateCompanionCheckCallSite(request, seams) {
  const callSite = request?.callSite;
  if (callSite !== COMPANION_CALL_SITES.gmAction && callSite !== COMPANION_CALL_SITES.broadcast) {
    return COMPANION_OUTCOMES.invalidCallSite;
  }
  // A broadcast handler fires on EVERY connected client. Without this, N clients each roll N
  // DIFFERENT totals and return them to N companion instances, which then apply N sets of
  // consequences Fabricate can neither see nor reconcile. The election admits assistant GMs
  // and prefers a full GM only when one is connected, so a sole connected assistant IS elected.
  if (callSite === COMPANION_CALL_SITES.broadcast && seams.isElectedExecutor() !== true) {
    return COMPANION_OUTCOMES.notElected;
  }
  return null;
}

/**
 * The display label the roll goes to chat and to the dialog under.
 *
 * Defaulted to a localized ACTIVITY NOUN, because `buildInteractiveRollOptions` composes its
 * flavor as `` `${activity} check${dcLabel}` `` with NO guard: an omitted label would post
 * "undefined check (DC 15)" to a GM's chat log. Fixed here rather than in the prompt module,
 * which this change does not touch.
 *
 * @param {*} label the caller's label
 * @param {{localize: (key: string, fallback: string) => string}} seams
 * @returns {string}
 */
function resolveCheckLabel(label, seams) {
  const supplied = typeof label === 'string' ? label.trim() : '';
  if (supplied !== '') return supplied;
  return seams.localize(CHECK_ROLL_DEFAULT_LABEL.key, CHECK_ROLL_DEFAULT_LABEL.fallback);
}

/**
 * The three-step discriminator ladder, applied to whichever runner answered.
 *
 * ONE ladder for both arms, and its steps are ordered rather than merely listed:
 *
 * 1. `cancelled === true` — the dismissal, tested FIRST because it is the one fact that is
 *    true on both arms and at every `interactive` setting.
 * 2. `value === null` — the runner's throw branch. **Strictly `=== null`, never `!value`**: a
 *    legitimate rolled `0` is falsy, and `!value` would report it as a failed roll.
 * 3. otherwise grade on `outcome` — `'pass'`/`'fail'` on the graded arm, and the ungraded
 *    arm's `null` outcome answers `rolled`.
 *
 * Step 2 is sound only because BOTH pre-dispatch gates ran: the runners' third `value: null`
 * producer is `evaluateCheckRoll`'s non-blocking `engine: false` branch, and that branch has
 * TWO sites — no `globalThis.Roll`, and a POST-SHIM-EMPTY formula with `Roll` fully present.
 * The dice-engine gate closes only the first. With the usability gate missing, a formula the
 * shim empties would reach the runner and answer `checkPassed` with the DC IGNORED.
 *
 * The naive discriminator — `success === false && value === null` — is true of a throw, a
 * dismissal and the graded cancel alike; derived, it reports a broken formula as "the GM
 * declined", and the companion silently does nothing forever with nothing in the console.
 *
 * @param {object} result the runner's answer
 * @param {boolean} graded whether the pass/fail runner answered
 * @returns {string} the outcome token
 */
function discriminateCheckOutcome(result, graded) {
  if (result?.cancelled === true) return COMPANION_OUTCOMES.cancelled;
  if (result?.value === null) return COMPANION_OUTCOMES.rollFailed;
  if (!graded) return COMPANION_OUTCOMES.rolled;
  return result?.outcome === 'pass'
    ? COMPANION_OUTCOMES.checkPassed
    : COMPANION_OUTCOMES.checkFailed;
}

/**
 * Roll ONE formula for ONE actor, graded against a DC or ungraded, and answer the result.
 *
 * The request key set is CLOSED: exactly `{ actor, callSite, formula, dc, compare, label,
 * interactive, rollDecision }`, and nothing else is read. **No `...request` spread reaches the
 * options builder, the runner seam or the nested `rollOptions`.** That is not defensive style:
 * a spread would let a companion inject its own `prompt` and bypass the dialog entirely, or a
 * `speaker` impersonating another actor in chat, while passing every behavioural assertion.
 *
 * Four keys are deliberately absent from v1 — `img` (dialog header art), `subjects` (the bulk
 * thumbnail strip), `rollMode` (inherited from the client default) and `speaker` (never
 * caller-supplied; derived from the resolved actor). The compatibility promise is asymmetric:
 * a member MAY gain an optional argument without a version bump but may not lose one, so this
 * starts narrow.
 *
 * @param {object} request
 * @param {object|null} request.actor the RESOLVED actor, passed by the facade's gate
 * @param {string} request.callSite one of {@link COMPANION_CALL_SITES}; required, no default
 * @param {string} request.formula the authored roll formula
 * @param {number} [request.dc] a finite DC selects the GRADED arm; omit for the ungraded one
 * @param {'meet'|'exceed'} [request.compare] threshold mode, default `'meet'`
 * @param {string} [request.label] display label; defaults to a localized activity noun
 * @param {boolean} [request.interactive] open the roll prompt, default `false`
 * @param {{bonus?: string|null, rollMode?: string, advantage?: string}|null}
 *   [request.rollDecision] a PRE-RESOLVED decision; refused unless `interactive` is true
 * @param {object} seams the collaborators, injected from the facade
 * @returns {Promise<Readonly<object>>} a companion-contract answer; NEVER throws
 */
export async function rollActorCheck(request, seams) {
  const refusal = gateCompanionCheckCallSite(request, seams);
  if (refusal) return checkRollResult(refusal);

  const label = resolveCheckLabel(request?.label, seams);
  const interactive = request?.interactive === true;
  const rollDecision = request?.rollDecision ?? null;
  // A decision supplied with `interactive: false` is REFUSED rather than silently discarded.
  // `evaluateCheckRoll` consults a pre-resolved decision only inside its interactive branch,
  // so the caller's bonus, advantage and roll mode would otherwise all vanish with no error
  // and the BASE formula would roll — the identical failure the shipped code calls out as
  // load-bearing at the seam it guards.
  if (rollDecision && !interactive) {
    return checkRollResult(COMPANION_OUTCOMES.invalidRollDecision, { label });
  }

  // Two pre-dispatch gates, in this order. `noFormula` first because "you gave me nothing to
  // roll" is the better answer than "this client cannot roll" when both are true; the order is
  // safe in either direction, because with `Roll` absent the shim FAILS OPEN and keeps the
  // residue rather than emptying it, so a missing engine can never manufacture a spurious
  // `noFormula`.
  const formula = String(request?.formula ?? '');
  if (!isUsableCheckFormula(formula)) {
    return checkRollResult(COMPANION_OUTCOMES.noFormula, { label });
  }
  if (seams.hasDiceEngine() !== true) {
    return checkRollResult(COMPANION_OUTCOMES.engineUnavailable, { label });
  }

  const dc = request?.dc;
  const graded = Number.isFinite(dc);
  const actor = request?.actor ?? null;
  // Composed from NAMED KEYS ONLY, then `prompt` is overridden on the returned bag. Overriding
  // afterwards is what keeps this change out of `rollPrompt.js` entirely: the builder hard-wires
  // `prompt: promptCheckRoll`, and that function auto-confirms where there is no `DialogV2`, so
  // without the seam the dismissal case — the one property this member exists to preserve —
  // would be unreachable under test.
  const rollOptions = seams.buildRollOptions({
    interactive,
    actor,
    activity: label,
    dc: graded ? dc : undefined,
  });
  rollOptions.prompt = seams.prompt;
  if (rollDecision) {
    rollOptions.rollDecision = {
      bonus: rollDecision.bonus,
      rollMode: rollDecision.rollMode,
      advantage: rollDecision.advantage,
    };
  }

  const result = graded
    ? await seams.runPassFail({
        formula,
        dc,
        thresholdMode: request?.compare === 'exceed' ? 'exceed' : 'meet',
        triggers: [],
        actor,
        label,
        rollOptions,
        craftingModifier: null,
      })
    : await seams.runProgressive({
        formula,
        triggers: [],
        actor,
        label,
        rollOptions,
        craftingModifier: null,
      });

  const outcome = discriminateCheckOutcome(result, graded);
  if (outcome === COMPANION_OUTCOMES.cancelled) {
    return checkRollResult(COMPANION_OUTCOMES.cancelled, { label });
  }
  if (outcome === COMPANION_OUTCOMES.rollFailed) {
    return checkRollResult(COMPANION_OUTCOMES.rollFailed, {
      label,
      detail: typeof result?.message === 'string' ? result.message : '',
    });
  }
  // `data.total` and never `value`: `value` is the AWARDING value on the ungraded arm, which a
  // forced outcome can overwrite. `triggers: []` makes that unreachable today, and reading the
  // raw total anyway is what stops a later change that admits triggers from silently
  // redefining a published field.
  const total = result.data.total;
  return checkRollResult(
    outcome,
    { label, total },
    {
      total,
      diceGroups: result.data.diceGroups,
      resolvedFormula: result.data.resolvedFormula ?? null,
    }
  );
}

/**
 * Answer ONE roll decision — situational bonus, roll mode, Advantage disposition — to be
 * applied to N rolls the CALLER will make. **It rolls nothing.**
 *
 * This reproduces `BulkSalvageService._resolveRollDecision` for a caller with no crafting
 * system. It answers BEFORE anything starts, which is what makes zero mutation on a dismissal
 * structural rather than compensating: there is nothing to roll back because nothing began.
 *
 * It takes **no `actorId`**. It reads no actor, rolls nothing and touches no document; an
 * ownership gate on an argument the member never reads is ceremony a later reader deletes, and
 * a caller passing one would infer a gate that is not there. It remains GM-gated — inline, in
 * the facade, because the shared preamble is scoped to actor-targeted members — `callSite`-
 * gated, elected, and `notReady`-refusing.
 *
 * It takes no `interactive` either: prompting IS the member.
 *
 * @param {object} request
 * @param {string} request.callSite one of {@link COMPANION_CALL_SITES}; required, no default
 * @param {Array<string>} request.formulas the batch's authored formulas, in the caller's order
 * @param {object} seams the collaborators, injected from the facade
 * @returns {Promise<Readonly<object>>} a companion-contract answer; NEVER throws
 */
export async function resolveBulkCheckDecision(request, seams) {
  const refusal = gateCompanionCheckCallSite(request, seams);
  if (refusal) return bulkCheckDecisionResult(refusal);

  const formulas = Array.isArray(request?.formulas) ? request.formulas : [];
  // "Usable" is the SAME post-shim predicate `rollActorCheck`'s `noFormula` gate applies, so
  // `'@craftingmod'` can neither be counted as covered nor deny Advantage to the whole batch.
  const usable = [];
  for (const [index, formula] of formulas.entries()) {
    const resolved = resolveUsableCheckFormula(formula);
    if (resolved !== '') usable.push({ index, formula: resolved });
  }
  const covered = usable.map((entry) => entry.index);
  if (usable.length === 0) {
    // Not a failure: "there is nothing to prompt about" is a correct answer, and asking a GM
    // for a situational bonus for a batch in which nothing rolls is a dialog with no
    // consequence. The direct analogue of the salvage service's own `none`.
    return bulkCheckDecisionResult(COMPANION_OUTCOMES.nothingToDecide, null, {
      choice: null,
      allowAdvantage: false,
      covered,
    });
  }

  // Computed over the USABLE SUBSET, all-or-nothing: offering Advantage that only some rolls
  // could honour would be a lie about the rest of the batch, and denying it because of a
  // formula that can never roll would be a lie about the ones that can.
  const allowAdvantage = usable.every((entry) => hasPlainD20(entry.formula));
  // `count` is the WHOLE BATCH, matching the salvage service's own `count: runnable.length`
  // rather than its usable subset. The member supplies no `subjects`, so an unspecified count
  // would make the dialog render "One roll setting for 0 items".
  const choice = await seams.promptBulk({ allowAdvantage, count: formulas.length });
  if (!choice || choice.confirmed === false) {
    return bulkCheckDecisionResult(COMPANION_OUTCOMES.cancelled);
  }
  // `promptCheckRoll`'s shape MINUS `confirmed`, which is what makes the evaluator treat it as
  // a pre-resolved choice rather than as a cancellation.
  return bulkCheckDecisionResult(
    COMPANION_OUTCOMES.decided,
    { count: covered.length },
    {
      choice: {
        bonus: choice.bonus,
        rollMode: choice.rollMode,
        advantage: choice.advantage,
      },
      allowAdvantage,
      covered,
    }
  );
}
