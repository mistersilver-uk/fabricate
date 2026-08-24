/**
 * The EFFECTFUL half of progressive component complications (issue 1286): settle the pending
 * condition rolls a plan could not, roll the player-visible effect rolls, and build the
 * addressing-only requests the GM side executes from.
 *
 * The decision itself is pure and lives in {@link ../utils/complicationPlan.js}, together with
 * the two PLAYER-facing projections. That placement is deliberate and not merely a naming
 * choice: `checkRoll.js` carries a sixteen-module static-import closure, and every mounted
 * Svelte suite that loads a real player store must declare its closure verbatim, so a player
 * view-model importing a filter from THIS module would drag all sixteen into each of them. The
 * GM-facing projection ({@link gmComplications}) lives here, where a view-model cannot reach it
 * by accident.
 *
 * ## Never throws, three nested guards
 *
 * Complications are strictly DOWNSTREAM of a committed award and must never influence it:
 *
 *  1. **Per complication.** One bad complication must not cost the resolution its other
 *     twenty-four — the argument `BulkSalvageService._runOne` already makes for one bad row.
 *  2. **Per effect.** A failed effect roll still lets the macro request be made, because the
 *     two are independent consequences of the same authored complication.
 *  3. **Whole call.** This function resolves rather than rejects, so an engine site that
 *     forgot its own guard still cannot lose a craft to a complication. Engine sites carry one
 *     anyway.
 *
 * ## What this module does NOT do
 *
 * It does not run macros. Every complication macro executes on a GM client, over the
 * complication socket, from a payload that carries ADDRESSING ONLY — never a macro uuid, never
 * chat content, never a speaker — so that a forged message can do no more than fire a
 * complication the GM themselves authored. The `type === 'script'` gate and the `fromUuid`
 * resolve therefore live where the macro RUNS, on the GM client, not here: compendium ownership
 * is GM-configurable per role, so an acting player's `fromUuid` can miss a macro the GM
 * resolves fine.
 *
 * It also does not CREATE chat messages. {@link buildGmComplicationCardContent} builds the
 * GM-only card's HTML and {@link rollGmComplicationEffect} rolls a `gmOnly` complication's
 * effect roll, but the speaker, the visibility pass and `ChatMessage.create` are the elected
 * GM's own Foundry edge in `main.js` — for the same reason `BulkSalvageChatCard.js` builds a
 * card it never posts.
 *
 * The requests come back on the return value rather than being emitted from here. Bulk salvage
 * batches its rows into one socket message per addressed `(craftingSystemId, actorUuid)` pair
 * — per-ROW emits would collide head-on with the GM-side rate limiter, which is sized against
 * the fanned-out PAIR count a capped selection can produce and not against its row count — so
 * the caller owns the emit and this function owns the decision.
 *
 * ## Both halves of the audience split live here, deliberately
 *
 * The acting client rolls a `visible` complication's effect roll (guard 2 of 3 below); the
 * elected GM rolls a `gmOnly` one. Putting the two rollers side by side is what keeps
 * {@link EFFECT_ROLL_MODE}'s two tokens honest: each looks up its OWN audience's token, so
 * neither can be handed the other's, and the docblock that claims a `gmOnly` effect roll is
 * "rolled and posted by the elected GM" is discharged in the same file that makes the claim.
 *
 * @module src/systems/complicationRuntime
 */

import { compareNumbersByOperatorId } from './characterPrerequisites.js';
import { evaluateCheckRoll, evaluateSideRoll, resolveCheckFormulaDisplay } from './checkRoll.js';
import { esc } from './CraftingChatCard.js';

/** The visibility token whose effect roll the ACTING client rolls and posts publicly. */
const VISIBLE = 'visible';

/**
 * The EXPLICIT legacy chat token each audience's effect roll posts under.
 *
 * Never the `core.rollMode` / `core.messageMode` fallback, on EITHER side: both are
 * `scope: "client"`, so the fallback reads the WRITING client's own selector — a GM with
 * Private GM Roll selected would silently hide a `visible` complication's roll, and a GM with
 * Public Roll selected would silently publish a `gmOnly` one. The two entries are also what
 * makes the audience split unspellable in the wrong direction: each roller looks its own token
 * up rather than being handed one.
 */
const EFFECT_ROLL_MODE = Object.freeze({ visible: 'publicroll', gmOnly: 'gmroll' });

/** The label key for each severity token, as a frozen map rather than an interpolated key:
 * a key built from an authored token would resolve to garbage for anything outside the
 * vocabulary, and this is a lookup the renderer can simply not find. */
const SEVERITY_KEYS = Object.freeze({
  minor: 'FABRICATE.Admin.Manager.Component.Complications.Severity.minor',
  major: 'FABRICATE.Admin.Manager.Component.Complications.Severity.major',
  severe: 'FABRICATE.Admin.Manager.Component.Complications.Severity.severe',
});

/**
 * The sentence each REASON token renders as, on the GM card's "why it fired" section.
 *
 * Same frozen-map rule as the severities above, and read through {@link lookup} so an
 * authored or relayed token can never reach `Object.prototype`.
 *
 * The four stage tokens are four of the five buckets, and every one of them is worded as a REPORT
 * rather than as a fact — "their game reports the roll falling short here", never "the roll
 * fell short". The bucket is the acting client's unverifiable claim
 * (`openspec/specs/recipes-and-steps/spec.md` § "The relay payload carries ADDRESSING ONLY"),
 * so the hedge has to survive the humanised copy; carrying it in the sentence's own grammar
 * is what lets it survive without a separate "reported by the acting client" label the GM has
 * to translate.
 *
 * There is deliberately NO `skipped` entry, even though `skipped` is a bucket: no stage
 * clause reads it (see {@link STAGE_CLAUSE_BUCKETS}), a `skipped` entry fires nothing in the
 * first place because it is a stage the award loop REFUSED rather than an outcome, and a
 * sentence no code path can select is dead vocabulary a locale would still be asked to
 * translate. A relayed `bucket: 'skipped'` therefore reaches `unknown`, which is true.
 *
 * The two clause tokens are the opposite: they name conditions the GM authored, re-read
 * from the GM's OWN world setting, so they are stated flat. `unknown` is the honest answer
 * for a firing whose deciding clause this side cannot name — see
 * {@link complicationReasons} — and never a guess at one of the others.
 */
const REASON_KEYS = Object.freeze({
  full: 'FABRICATE.Chat.GmComplication.Reason.full',
  partial: 'FABRICATE.Chat.GmComplication.Reason.partial',
  halted: 'FABRICATE.Chat.GmComplication.Reason.halted',
  unreached: 'FABRICATE.Chat.GmComplication.Reason.unreached',
  checkTrigger: 'FABRICATE.Chat.GmComplication.Reason.checkTrigger',
  rollCondition: 'FABRICATE.Chat.GmComplication.Reason.rollCondition',
  unknown: 'FABRICATE.Chat.GmComplication.Reason.unknown',
});

/**
 * The buckets each stage-outcome clause matches — a PRESENTATION mirror of
 * `complicationPlan.js`'s `BUCKETS_BY_STAGE_CONDITION`, which is module-private there.
 *
 * A mirror is a drift hazard, so it is not left to a comment: an ORACLE test in
 * `tests/component-complications-fire.test.js` drives the real `planComplications` over every
 * (clause, bucket) pair and asserts that every reason {@link complicationReasons} names was
 * genuinely among that firing's `matchedConditions`. If the planner's table moves and this one
 * does not, that test fails rather than the card quietly naming a reason that did not fire.
 */
const STAGE_CLAUSE_BUCKETS = Object.freeze({
  stageAwarded: Object.freeze(['full']),
  stagePartial: Object.freeze(['partial']),
  stageMissed: Object.freeze(['halted', 'unreached']),
});

/** The BEM block the GM card borrows, so it needs no new CSS and cannot regress the cards
 * that already use it. `--gm` is an unstyled block modifier, the same "unstyled modifier
 * lands on the base treatment" move `BulkSalvageChatCard.js`'s `--mixed` makes. */
const GM_CARD_BLOCK = 'fabricate-craft-chat';

/** The GM card's own label keys. */
const GM_CARD_KEYS = Object.freeze({
  title: 'FABRICATE.Chat.GmComplication.Title',
  actor: 'FABRICATE.Chat.GmComplication.Actor',
  reportedBy: 'FABRICATE.Chat.GmComplication.ReportedBy',
  whyItFired: 'FABRICATE.Chat.GmComplication.WhyItFired',
  whatHappens: 'FABRICATE.Chat.GmComplication.WhatHappens',
  needsAttention: 'FABRICATE.Chat.GmComplication.NeedsAttention',
  effectRoll: 'FABRICATE.Chat.GmComplication.EffectRoll',
  effectRollClaimed: 'FABRICATE.Chat.GmComplication.EffectRollClaimed',
  effectRollUnrollable: 'FABRICATE.Chat.GmComplication.EffectRollUnrollable',
  playerVisible: 'FABRICATE.Chat.GmComplication.PlayerVisible',
});

/**
 * The label key for each macro outcome worth reporting. A macro that simply ran is not news.
 *
 * Its OWN map rather than two more entries in the card's keys above, because it is keyed on the
 * report's `status` token — an untrusted string — and {@link lookup} is what makes that safe.
 * Two entries in a general-purpose map would be indexed by a token from the same place with
 * nothing saying so.
 */
const MACRO_FAULT_KEYS = Object.freeze({
  skipped: 'FABRICATE.Chat.GmComplication.MacroSkipped',
  failed: 'FABRICATE.Chat.GmComplication.MacroFailed',
});

/**
 * Read a token out of one of the frozen label maps above, or `null`.
 *
 * A bare `MAP[token]` is not safe here and never was: `Object.freeze` does not detach
 * `Object.prototype`, so a severity of `constructor` — which the persisted shape deliberately
 * PRESERVES when malformed, and which an imported third-party system can carry — resolves to
 * the `Object` constructor, and the card then renders `function Object() { [native code] }` as
 * its severity. Every token reaching these maps is authored or relayed text, so every one of
 * them is read through here, on the `COMPLICATION_BLOCKS` precedent in `CraftingChatCard.js`.
 *
 * @param {object} map one of the frozen key maps in this module
 * @param {unknown} token
 * @returns {string|null}
 */
function lookup(map, token) {
  const key = text(token);
  return Object.hasOwn(map, key) ? map[key] : null;
}

/** @param {unknown} value @returns {Array<any>} */
function list(value) {
  return Array.isArray(value) ? value : [];
}

/** @param {unknown} value @returns {string} */
function text(value) {
  return value === undefined || value === null ? '' : String(value);
}

/**
 * Reduce a `rollCondition.value` comparand to a NUMBER, or `null` when it does not reduce.
 *
 * The comparand stays a string in the persisted record because it may itself carry roll data,
 * so `@abilities.str.mod` has to resolve against the actor. It resolves through
 * {@link resolveCheckFormulaDisplay}, which SUBSTITUTES roll data without rolling — never
 * through `evaluateCheckRoll`, which would re-roll a `1d6` comparand on every evaluation and
 * make the same authored gate mean something different each time it was asked.
 *
 * A comparand that survives substitution as a dice expression (`1d6`) is therefore not a
 * number, and this returns `null`: the gate FAILS CLOSED rather than guessing at an average.
 *
 * @param {unknown} value the authored comparand
 * @param {object|null} actor
 * @returns {number|null}
 */
function resolveComparand(value, actor) {
  const authored = text(value).trim();
  if (authored === '') return null;
  const direct = Number(authored);
  if (Number.isFinite(direct)) return direct;
  const substituted = resolveCheckFormulaDisplay(authored, actor);
  if (!substituted?.resolved) return null;
  const resolved = Number(substituted.display);
  return Number.isFinite(resolved) ? resolved : null;
}

/**
 * Roll a complication's CONDITION and answer whether it matched.
 *
 * Non-interactive, no modifier context, posting nothing: this is a gate, not a beat, and a
 * player must not see a die roll for a complication that then does not fire.
 *
 * It FAILS CLOSED on every uncertainty — no dice engine, a non-finite total, an unparseable
 * comparand, or an operator the numeric table does not know (the three valueless prerequisite
 * operators have no reading against a roll total and `compareNumbersByOperatorId` returns
 * `false` for them).
 *
 * @param {object} rollCondition the authored `{enabled, expr, cmp, value}`
 * @param {object|null} actor
 * @returns {Promise<boolean>}
 */
async function conditionMatched(rollCondition, actor) {
  const expr = text(rollCondition?.expr).trim();
  if (expr === '') return false;
  const rolled = await evaluateCheckRoll(expr, actor, {});
  if (!rolled?.engine) return false;
  const total = Number(rolled.total);
  if (!Number.isFinite(total)) return false;
  const comparand = resolveComparand(rollCondition?.value, actor);
  if (comparand === null) return false;
  return compareNumbersByOperatorId(total, rollCondition?.cmp, comparand) === true;
}

/**
 * The shape both effect-roll sides return when nothing was rolled HERE.
 *
 * ## `requested` and `attempted` answer DIFFERENT questions
 *
 * Since the card moved to `attempted`, `requested` has NO production reader left — it is
 * retained because it is the honest answer to its own question and the two are trivially
 * confusable, so dropping it would invite a future reader to key the card on the wrong one
 * again. Tests assert both.
 *
 * `requested` answers "did the GM author one at all", which is a different question from
 * "was it rolled on this client" — the acting client leaves a `gmOnly` roll requested and
 * unrolled, and the GM side does the same for a `visible` one.
 *
 * `attempted` answers the second question, and it exists because the GM card cannot be
 * written from the first. A `visible` complication that ALSO carries a macro is delivered
 * to the GM client (the macro is what needs it), and this side then declines the roll by
 * audience — so `requested` is true, no roll happened here, and a card keyed on
 * `requested` alone would report the acting client's total on one line and "the roll
 * failed" two lines below it. Declined-by-audience and attempted-and-failed are separate
 * states, so they are separate fields rather than one field read two ways.
 *
 * @param {object|undefined} effectRoll
 * @param {string} expr
 * @returns {{requested: boolean, attempted: false, total: null, formula: string|null,
 *   posted: false}}
 */
function unrolledEffect(effectRoll, expr) {
  return {
    requested: effectRoll?.enabled === true && expr !== '',
    attempted: false,
    total: null,
    formula: expr || null,
    posted: false,
  };
}

/**
 * Roll ONE authored effect roll under an EXPLICIT audience token, and never throw.
 *
 * Shared by both audiences so the two sides cannot drift in what they report — only in which
 * token they pass, which is the one thing that genuinely differs.
 *
 * @param {object} complication the AUTHORED record (the GM's own copy, on the GM side)
 * @param {object|null} actor
 * Every return carries `attempted: true`: reaching this function IS the attempt, and the
 * failure branch is precisely the state the GM card reports as a failed roll.
 *
 * @param {{rollMode: string, speaker?: object}} options
 * @returns {Promise<{requested: boolean, attempted: true, total: number|null,
 *   formula: string|null, posted: boolean, error?: string}>}
 */
async function rollEffect(complication, actor, { rollMode, speaker }) {
  const effectRoll = complication?.effectRoll;
  const expr = text(effectRoll?.expr).trim();
  try {
    const rolled = await evaluateSideRoll(expr, actor, {
      rollMode,
      flavor: text(effectRoll?.label) || text(complication?.name),
      speaker,
    });
    return {
      requested: true,
      attempted: true,
      total: rolled.engine ? rolled.total : null,
      formula: rolled.formula ?? expr,
      posted: rolled.posted,
    };
  } catch (error) {
    console.error('Fabricate | Complication effect roll failed', error);
    return {
      requested: true,
      attempted: true,
      total: null,
      formula: expr,
      posted: false,
      error: text(error?.message),
    };
  }
}

/**
 * Roll a `visible` complication's EFFECT roll on the acting client, where the player's own
 * Dice So Nice appearance applies.
 *
 * A `gmOnly` complication's effect roll is NOT rolled here: it is rolled and posted by the
 * elected GM through {@link rollGmComplicationEffect}, from the GM's own re-read of the
 * authored record, so the player sees only "<GM> rolled privately".
 *
 * Guarded — guard 2 of 3 — so a malformed expression still leaves the macro request intact.
 *
 * @param {object} firing
 * @param {object|null} actor
 * @param {{speaker?: object}} context
 * @returns {Promise<{requested: boolean, attempted: boolean, total: number|null,
 *   formula: string|null, posted: boolean, error?: string}>}
 */
async function runEffectRoll(firing, actor, context) {
  const complication = firing?.complication;
  const effectRoll = complication?.effectRoll;
  const expr = text(effectRoll?.expr).trim();
  if (effectRoll?.enabled !== true || expr === '' || complication?.visibility !== VISIBLE)
    return unrolledEffect(effectRoll, expr);
  return rollEffect(complication, actor, {
    rollMode: EFFECT_ROLL_MODE.visible,
    speaker: context?.speaker,
  });
}

/**
 * Roll a `gmOnly` complication's EFFECT roll on the ELECTED GM's client, under `gmroll`.
 *
 * This is the other half of the split {@link runEffectRoll} states, and until it existed that
 * statement was false in shipped source: the acting client skipped a `gmOnly` roll on the
 * grounds that the GM would make it, and no GM-side site ever did.
 *
 * The disclosure is the INTENDED one rather than a leak. `ChatMessage#visible` returns true for
 * any message carrying rolls before it tests the whisper list, so the player still sees a card;
 * because the message is authored GM-side they are neither author nor recipient, so core
 * substitutes its private-roll content and the player reads "&lt;GM name&gt; rolled privately".
 * A player-authored `gmroll` would instead have rendered in that player's OWN sidebar.
 *
 * Symmetrical with {@link runEffectRoll} and deliberately mirror-imaged: this one refuses to
 * roll a `visible` complication, so neither audience's roll can be made from the wrong client
 * even if a caller addresses the wrong one.
 *
 * Never throws.
 *
 * @param {object} options
 * @param {object} options.complication the GM's OWN copy of the authored complication
 * @param {object|null} [options.actor] the acting actor, resolved GM-side from the addressing
 * @param {object|null} [options.speaker] the speaker, resolved GM-side from the addressing
 * @returns {Promise<{requested: boolean, attempted: boolean, total: number|null,
 *   formula: string|null, posted: boolean, error?: string}>}
 */
export async function rollGmComplicationEffect({
  complication,
  actor = null,
  speaker = null,
} = {}) {
  const effectRoll = complication?.effectRoll;
  const expr = text(effectRoll?.expr).trim();
  if (effectRoll?.enabled !== true || expr === '' || complication?.visibility === VISIBLE)
    return unrolledEffect(effectRoll, expr);
  return rollEffect(complication, actor, { rollMode: EFFECT_ROLL_MODE.gmOnly, speaker });
}

/**
 * The ADDRESSING-ONLY payload for one fired complication.
 *
 * It names WHICH complication on WHICH component fired, and the outcome facts the GM card
 * echoes. It carries no `macroUuid`, no `visibility`, no `name`, no `description`, no
 * `severity`, no chat content and no speaker: the elected GM re-reads all of those from its own
 * copy of the `craftingSystems` world setting, so a forged payload can do no more than fire a
 * complication that GM already authored. The sender is the server-attested second callback
 * argument of the socket handler and is never a payload field.
 *
 * `bucket`, `resultId` and `effectRollTotal` are client-supplied outcome facts the GM cannot
 * verify, and the GM card presents them as the acting client's claim.
 *
 * The `action` key is stamped by the socket writer, which owns that constant.
 *
 * @param {object} firing
 * @param {object} effect
 * @param {{craftingSystemId?: string, actorUuid?: string}} context
 * @param {object|null} actor
 * @returns {object}
 */
function gmRequestFor(firing, effect, context, actor) {
  return {
    craftingSystemId: context?.craftingSystemId ?? null,
    componentId: firing.componentId,
    complicationId: firing.complicationId,
    resultId: firing.resultId,
    activity: firing.activity,
    bucket: firing.bucket,
    actorUuid: context?.actorUuid ?? actor?.uuid ?? null,
    resolutionId: firing.resolutionId ?? null,
    effectRollTotal: effect?.total ?? null,
  };
}

/**
 * Whether one fired complication needs anything of the GM client at all.
 *
 * Two independent reasons: a `gmOnly` complication's card (and its effect roll) can only be
 * authored by a GM — `#canCreate` forbids a player authoring as a GM, and a whispered message
 * a player authored renders in that player's OWN sidebar — and EVERY complication macro runs on
 * a GM client so its authority does not depend on whether the activity was time-gated.
 *
 * @param {object} firing
 * @returns {boolean}
 */
function needsGmClient(firing) {
  const complication = firing?.complication;
  return complication?.visibility !== VISIBLE || Boolean(text(complication?.macroUuid).trim());
}

/**
 * FIRE the complications a plan decided on: settle each pending condition roll, roll the
 * player-visible effect rolls, and return both the fired list and the GM requests.
 *
 * Resolves, never rejects.
 *
 * @param {object} options
 * @param {{activity?: string, resolutionId?: string|null, firings?: Array<object>}} options.plan
 *   {@link ../utils/complicationPlan.js planComplications}'s return.
 * @param {object|null} [options.actor] the acting actor, whose roll data resolves both the
 *   condition roll and its comparand.
 * @param {{craftingSystemId?: string, actorUuid?: string, speaker?: object}} [options.context]
 *   the addressing the GM side resolves the speaker and acting actor from. Explicit
 *   collaborators, not a grab bag: nothing else is read from it.
 * @returns {Promise<{activity: string|null, resolutionId: string|null, fired: Array<object>,
 *   gmRequests: Array<object>}>} `fired` is in fire order, which is RESULT-ENTRY order: one
 *   entry per (result entry, complication) that fired, so a component staged twice can appear
 *   twice with two independently settled condition rolls and two effect rolls.
 */
export async function fireComplications({ plan, actor = null, context = {} } = {}) {
  const result = {
    activity: plan?.activity ?? null,
    resolutionId: plan?.resolutionId ?? null,
    fired: [],
    gmRequests: [],
  };
  try {
    for (const firing of list(plan?.firings)) {
      // A firing that is not a firing is DROPPED rather than fired: everything downstream
      // reads an audience and a macro uuid off it, and the safe reading of "no record" is
      // "nothing to do", not "a GM-only complication with no name".
      if (!firing || typeof firing !== 'object') continue;
      // Guard 1 of 3: one bad complication must not cost the resolution its others.
      try {
        if (
          firing.needsDice === true &&
          !(await conditionMatched(firing.complication?.rollCondition, actor))
        )
          continue;
        const effect = await runEffectRoll(firing, actor, context);
        const fired = {
          ...firing,
          needsDice: false,
          matchedConditions: firing.needsDice
            ? [...list(firing.matchedConditions), 'rollCondition']
            : [...list(firing.matchedConditions)],
          effectRoll: effect,
        };
        result.fired.push(fired);
        if (needsGmClient(fired))
          result.gmRequests.push(gmRequestFor(fired, effect, context, actor));
      } catch (error) {
        console.error('Fabricate | Complication failed to fire', error);
      }
    }
  } catch (error) {
    // Guard 3 of 3. Reached only by something outside the per-complication guard; the
    // partially-built result is still returned, because the award it follows is committed.
    console.error('Fabricate | Complication firing aborted', error);
  }
  return result;
}

/**
 * The GM-facing projection of a resolution's fired complications: EVERYTHING the GM authored,
 * for the GM-only card.
 *
 * The counterpart to `publicComplications`, and it deliberately lives in this module rather
 * than beside it. Two audience-named exports on opposite sides of the runtime boundary make
 * the wrong call unspellable: a `visibleComplications(fired, {isGM})` would be called with
 * `isGM: true` at the salvage run-record write site whenever a GM was the acting user — which
 * is correct about the user and catastrophic about the record, since that record is an actor
 * flag the owning player can read.
 *
 * The macro UUID is NOT projected: the GM side re-reads it from its own copy of the world
 * setting, and a projection carrying it would be one step from a payload carrying it.
 *
 * `effectLabel` is the AUTHORED name of the complication's consequence roll ("Acid damage"),
 * projected beside the roll itself so the card can say what a total is a total OF. It is
 * authored GM text like `name` and `description`, re-read from the GM's own world setting on
 * the GM side, so it is attested rather than claimed even when the number beside it is not.
 *
 * @param {Array<object>} fired {@link fireComplications}'s `fired` list
 * @returns {Array<{resultId: string|null, componentId: string|null, componentName: string,
 *   complicationId: string|null, name: string, description: string, severity: string,
 *   visibility: string, bucket: string|null, buckets: Array<string>,
 *   matchedConditions: Array<string>, effectRoll: object|null, effectLabel: string}>}
 */
export function gmComplications(fired) {
  return list(fired).map((entry) => ({
    resultId: entry?.resultId ?? null,
    componentId: entry?.componentId ?? null,
    componentName: text(entry?.componentName),
    complicationId: entry?.complicationId ?? null,
    name: text(entry?.complication?.name),
    description: text(entry?.complication?.description),
    severity: text(entry?.complication?.severity),
    visibility: text(entry?.complication?.visibility),
    bucket: entry?.bucket ?? null,
    buckets: [...list(entry?.buckets)],
    matchedConditions: [...list(entry?.matchedConditions)],
    effectRoll: entry?.effectRoll ?? null,
    effectLabel: text(entry?.complication?.effectRoll?.label),
  }));
}

/**
 * WHY one complication fired, re-derived on the GM client from the complication the GM
 * themselves authored plus the one outcome fact the acting client reported.
 *
 * ## Why it is re-derived here rather than relayed
 *
 * The acting client already computes this — `planComplications` returns `matchedConditions`
 * and `fireComplications` appends `rollCondition` to it — and relaying that list would be the
 * obvious move. It is refused: the relay payload is specified as ADDRESSING ONLY plus the
 * outcome facts an output echoes (`openspec/specs/recipes-and-steps/spec.md`), and
 * `resolution-modes/spec.md` § Progressive Awarding turns down a FOURTH client-supplied claim
 * on that payload by name. A reason list is exactly such a claim, and it is one the GM does
 * not need to be told: the `when` block, the `match` mode and the `rollCondition` toggle are
 * all in the GM's own copy of the world setting, which is where every other disclosure
 * decision on this card already comes from.
 *
 * ## What it will and will not say
 *
 * Sound, not complete. Every token returned is a clause that DID contribute to this firing;
 * a clause that may also have contributed but cannot be confirmed from here is omitted rather
 * than asserted, and a firing whose deciding clause cannot be named at all returns `unknown`
 * rather than the most likely candidate. The three cases that force `unknown` are all real:
 * a `checkTrigger` this side cannot evaluate (matching one means evaluating its condition
 * against the roll, which is the acting client's job), a `rollCondition` whose dice this side
 * never saw, and a claimed bucket that no enabled stage clause matches.
 *
 * Under `match: 'all'` every enabled clause matched or the complication would not have fired,
 * so all of them are named. Under `match: 'any'` a matched stage clause SETTLES the firing —
 * `decideFiring` stops consulting the dice the moment one matches — so the stage reason is
 * named and the trigger, which may or may not also have matched, is not.
 *
 * @param {object|null} complication the AUTHORED complication, from the GM's own record
 * @param {string|null} bucket the acting client's claimed stage bucket
 * @returns {Array<string>} reason tokens for {@link REASON_KEYS}, never empty
 */
export function complicationReasons(complication, bucket) {
  const claimed = text(bucket);
  // Whether an enabled stage clause READS the claimed bucket. `some`, not `find`: the three
  // bucket sets are disjoint, so at most one clause can match and its identity adds nothing —
  // the reason token IS the bucket.
  const stageMatched = Object.entries(STAGE_CLAUSE_BUCKETS).some(
    ([clause, buckets]) => complication?.when?.[clause] === true && buckets.includes(claimed)
  );
  const trigger = text(complication?.when?.checkTrigger).trim() !== '';
  const dice = complication?.rollCondition?.enabled === true;
  if (complication?.match === 'all') {
    const reasons = [
      stageMatched ? claimed : '',
      trigger ? 'checkTrigger' : '',
      dice ? 'rollCondition' : '',
    ];
    const named = reasons.filter(Boolean);
    return named.length > 0 ? named : ['unknown'];
  }
  if (stageMatched) return [claimed];
  // No stage clause matched, so the firing rests on the trigger, on the condition roll, or on
  // both — and only when exactly one of the two is authored does "both" stop being possible.
  if (trigger !== dice) return [trigger ? 'checkTrigger' : 'rollCondition'];
  return ['unknown'];
}

/**
 * The GM card's ROW MODEL for one delivered resolution: the GM-facing projection of what
 * the GM authored, augmented with what THIS client actually did about it.
 *
 * ## Why it is here rather than in `main.js`
 *
 * `main.js` cannot be imported under `node --test`, so everything that lived in its card
 * function could only ever be pinned by a text search — and a text search cannot tell
 * `applied[index]` apart from `applied[0]`, which would report every row's stage, total and
 * macro outcome as row zero's. Assembling the model here leaves the Foundry edge holding
 * only the speaker, the visibility pass and `ChatMessage.create`, and lets a suite drive
 * this with two rows that disagree.
 *
 * ## One row at a time, deliberately
 *
 * Each row is projected on its own rather than by zipping a projected array back against
 * `applied` by index. The augmentation and the projection then cannot drift apart, and the
 * index that made the mis-pairing spellable does not exist.
 *
 * The CLAIM is kept in its own `claimed` sub-object because the GM cannot re-derive either
 * field — the award happened on the acting client — so the card labels it as reported
 * rather than stating it flat (`openspec/specs/recipes-and-steps/spec.md` § "The relay
 * payload carries ADDRESSING ONLY").
 *
 * `reasons` is the one field assembled from BOTH sides: {@link complicationReasons} reads the
 * `when` block, the `match` mode and the `rollCondition` toggle off the GM's own authored
 * record and asks the claimed bucket only which of the GM's own stage clauses it satisfies.
 * It is therefore re-derived here rather than relayed, and the reason SENTENCES it selects
 * carry their hedge in their own grammar — see {@link REASON_KEYS}.
 *
 * @param {Array<{component?: object, complication?: object, entry?: object,
 *   report?: {effect?: object, macro?: object}}>} applied
 *   {@link ../systems/complicationSocket.js applyAuthoredComplications}'s return.
 * @returns {Array<object>} one card row per applied entry, in delivery order
 */
export function gmComplicationCardEntries(applied) {
  return list(applied).map((row) => {
    const [projected] = gmComplications([
      {
        resultId: row?.entry?.resultId ?? null,
        componentId: row?.component?.id ?? row?.entry?.componentId ?? null,
        componentName: row?.component?.name ?? '',
        complicationId: row?.complication?.id ?? null,
        complication: row?.complication,
        bucket: row?.entry?.bucket ?? null,
        effectRoll: row?.report?.effect ?? null,
      },
    ]);
    return {
      ...projected,
      reasons: complicationReasons(row?.complication, row?.entry?.bucket ?? null),
      claimed: {
        bucket: row?.entry?.bucket ?? null,
        effectRollTotal: row?.entry?.effectRollTotal ?? null,
      },
      macro: row?.report?.macro ?? null,
    };
  });
}

/**
 * Whether a roll total is a NUMBER worth reporting.
 *
 * `Number(null)` is `0` and `Number(undefined)` is `NaN`, so a coercing test would report an
 * absent total as a rolled zero — which on this card would state an outcome that never
 * happened, once for the acting client's absent claim and once for a roll that failed. Both
 * absences must read as "not rolled", so the type is asked BEFORE the finiteness.
 *
 * @param {unknown} total
 * @returns {boolean}
 */
function isReportableTotal(total) {
  return typeof total === 'number' && Number.isFinite(total);
}

/**
 * The severity eyebrow, at the right of the name it qualifies.
 *
 * The one authored fact that rides the HEAD line, because it is the one a GM triages on and
 * the only one short enough: the audience note beside it made the pair 188px of a 266px chat
 * row, which wrapped the eyebrow onto its own line and undid the head. It goes on the muted
 * context line below instead — see {@link gmComplicationMeta}.
 *
 * Read through {@link lookup}, because `severity` is the one token on this row that the
 * persisted shape deliberately PRESERVES when malformed.
 *
 * @param {object} entry
 * @param {(key: string) => string} loc
 * @returns {string} escaped HTML, or '' for a severity outside the vocabulary
 */
function gmComplicationSeverity(entry, loc) {
  const severityKey = lookup(SEVERITY_KEYS, entry?.severity);
  if (!severityKey) return '';
  return `<span class="${GM_CARD_BLOCK}__complication-severity">${esc(loc(severityKey))}</span>`;
}

/**
 * The muted context line: WHICH component carried this, and whether the player saw it too.
 *
 * One line rather than two, because both answer "where does this sit" rather than "what
 * happened", and a stack of one-word lines is as unreadable in the other direction. They are
 * separate spans inside it rather than one joined string so the audience note can be found and
 * styled without also finding the component's name.
 *
 * @param {object} entry
 * @param {(key: string) => string} loc
 * @returns {string} escaped HTML, or '' when the row has neither
 */
function gmComplicationMeta(entry, loc) {
  const runs = [
    entry?.componentName
      ? `<span class="${GM_CARD_BLOCK}__complication-source">${esc(entry.componentName)}</span>`
      : '',
    entry?.visibility === VISIBLE
      ? `<span class="${GM_CARD_BLOCK}__complication-audience">${esc(loc(GM_CARD_KEYS.playerVisible))}</span>`
      : '',
  ].filter(Boolean);
  if (runs.length === 0) return '';
  return `<span class="${GM_CARD_BLOCK}__complication-meta">${runs.join(' · ')}</span>`;
}

/**
 * WHY IT FIRED: one sentence per reason {@link complicationReasons} could name.
 *
 * Several lines rather than one joined sentence, because under `match: 'all'` they are
 * genuinely several independent conditions and a GM reading "and" between two of them at the
 * end of a wrapped line cannot tell which clause each half belongs to.
 *
 * @param {object} entry
 * @param {(key: string) => string} loc
 * @returns {Array<string>} escaped HTML fragments
 */
function gmComplicationReasonFacts(entry, loc) {
  return list(entry?.reasons)
    .map((reason) => lookup(REASON_KEYS, reason))
    .filter(Boolean)
    .map((key) => esc(loc(key)));
}

/**
 * WHAT HAPPENS: the complication's own consequence roll, in the GM's own words for it.
 *
 * ## It is a consequence, not a test, so it is never phrased as one
 *
 * The effect roll has NO target and nothing to miss. `Effect roll: 2d6 = 10` read as though
 * it were the check the complication fired on, which is the opposite of what it is, so the
 * total leads and the formula follows it as provenance: `Acid damage: 10 (2d6)`. The label is
 * the GM's own `effectRoll.label`, falling back to the field's own name when unauthored.
 *
 * ## Two totals, two provenances, never confused
 *
 * A `gmOnly` complication's roll happens HERE, so it is stated with the formula this client
 * actually rolled. A `visible` one's roll happened on the acting client and reaches this card
 * only as a claimed number, so it is stated with its provenance in place of a formula. The
 * two are mutually exclusive in practice — `runEffectRoll` and `rollGmComplicationEffect`
 * each refuse the other's audience — but both are rendered independently, so a row that
 * somehow carried both would report two totals rather than silently pick one.
 *
 * `attempted`, never `requested`: `requested` is true for an authored roll this client
 * DECLINED by audience, and keying on it rendered "the roll failed" directly under the acting
 * client's claimed total for that exact case, so the card stated an outcome and its own
 * contradiction two lines apart.
 *
 * @param {object} entry
 * @param {(key: string) => string} loc
 * @returns {Array<string>} escaped HTML fragments
 */
function gmComplicationEffectFacts(entry, loc) {
  const label = esc(text(entry?.effectLabel).trim() || loc(GM_CARD_KEYS.effectRoll));
  const facts = [];
  const effect = entry?.effectRoll;
  if (effect?.attempted === true) {
    facts.push(
      isReportableTotal(effect.total)
        ? `${label}: ${esc(effect.total)} (${esc(effect.formula)})`
        : `${label}: ${esc(loc(GM_CARD_KEYS.effectRollUnrollable))} (${esc(effect.formula)})`
    );
  }
  const claimed = entry?.claimed?.effectRollTotal;
  if (isReportableTotal(claimed))
    facts.push(`${label}: ${esc(claimed)} (${esc(loc(GM_CARD_KEYS.effectRollClaimed))})`);
  return facts;
}

/**
 * NEEDS YOUR ATTENTION: a macro link only the GM can repair.
 *
 * Its own section rather than a note among the narration, because it is the one thing on this
 * card that is not narration: `recipes-and-steps/spec.md` § "The `script` gate is a call-site
 * check" states that a uuid which does not resolve to a script macro "is skipped and reported
 * on the GM-facing output". Compendium ownership is GM-configurable per role, so a broken link
 * is a real GM-facing case and a console warning on the ONE client that can fix it is not a
 * report. The status is read through {@link lookup} for the reason that helper gives: a
 * two-key object literal still inherits `Object.prototype`, so a `constructor` status would
 * resolve truthy and `?? null` would never see it.
 *
 * @param {object} entry
 * @param {(key: string) => string} loc
 * @returns {Array<string>} escaped HTML fragments
 */
function gmComplicationFaultFacts(entry, loc) {
  const key = lookup(MACRO_FAULT_KEYS, entry?.macro?.status);
  // The uuid on its OWN line rather than appended after a colon: both fault strings already
  // end in a clause of their own — one with a colon, one with an em dash — so appending a
  // second separator produced `…script macro: Compendium.x` and `…see the console — Macro.x`.
  // A line of its own also leaves the uuid selectable on its own, which is what a GM does with
  // it: paste it into the editor to find the link they have to repair.
  return key ? [esc(loc(key)), esc(entry?.macro?.macroUuid)] : [];
}

/**
 * One LABELLED SECTION of a row, or '' when it has nothing to say.
 *
 * Empty sections are omitted rather than drawn empty: a "what happens" heading over nothing
 * reads as a complication whose consequence failed to render, and a complication that only
 * narrates legitimately has no consequence to report.
 *
 * The `attention` section additionally carries its own class rather than a modifier suffix,
 * because the stylesheet guard in `tests/crafting-chat-card.test.js` requires each branch of a
 * complication rule to END on a complication-only class.
 *
 * @param {string} section the section token, also emitted as a `data-` hook for tests
 * @param {string} headingKey
 * @param {Array<string>} facts already-escaped HTML fragments
 * @param {(key: string) => string} loc
 * @returns {string}
 */
function gmComplicationSection(section, headingKey, facts, loc) {
  if (facts.length === 0) return '';
  const fault = section === 'attention' ? ` ${GM_CARD_BLOCK}__complication-fault` : '';
  return [
    `<span class="${GM_CARD_BLOCK}__complication-block${fault}" data-fabricate-complication-section="${section}">`,
    `<span class="${GM_CARD_BLOCK}__complication-heading">${esc(loc(headingKey))}</span>`,
    ...facts.map((fact) => `<span class="${GM_CARD_BLOCK}__complication-fact">${fact}</span>`),
    '</span>',
  ].join('');
}

/**
 * Render one GM card row as a VERTICAL STACK of labelled sections (issue 1286).
 *
 * ## Why it is not a run of em-dash-joined phrases any more
 *
 * It was, and the em dashes were never the problem: the row put its identity in one `__label`
 * and then hung its notes off the `__item` as SIBLINGS of that label. `__item` is
 * `display: flex` in row direction, so those notes became columns inside a grid cell, each one
 * a flex track a few characters wide — the live card rendered a three-letter severity as
 * `M o r` down three lines. The fix is structural rather than a width tweak: everything the
 * row draws now lives inside the one `__label`, which the GM card's own `--gm` block modifier
 * turns into a column. Reaching every new selector through `--gm` is also what keeps the
 * PLAYER complication row byte-identical, since no player card emits that modifier.
 *
 * ## The order is what makes it readable
 *
 * Identity first (what fired, how bad, who saw it, on which component), then the GM's authored
 * prose, then the two questions a GM actually has — why did this fire, and what does it do —
 * each under its own heading, then anything only they can repair. The two headings are the
 * sections the maintainer approved; the third appears only on a macro fault.
 *
 * @param {object} entry
 * @param {(key: string) => string} loc
 * @returns {string}
 */
function renderGmComplication(entry, loc) {
  const head = `<span class="${GM_CARD_BLOCK}__complication-name">${esc(entry?.name)}</span>${gmComplicationSeverity(entry, loc)}`;
  const stack = [
    `<span class="${GM_CARD_BLOCK}__complication-head">${head}</span>`,
    gmComplicationMeta(entry, loc),
    entry?.description
      ? `<span class="${GM_CARD_BLOCK}__complication-description">${esc(entry.description)}</span>`
      : '',
    gmComplicationSection(
      'why',
      GM_CARD_KEYS.whyItFired,
      gmComplicationReasonFacts(entry, loc),
      loc
    ),
    gmComplicationSection(
      'effect',
      GM_CARD_KEYS.whatHappens,
      gmComplicationEffectFacts(entry, loc),
      loc
    ),
    gmComplicationSection(
      'attention',
      GM_CARD_KEYS.needsAttention,
      gmComplicationFaultFacts(entry, loc),
      loc
    ),
  ].filter(Boolean);
  return [
    `<li class="${GM_CARD_BLOCK}__item ${GM_CARD_BLOCK}__item--complication" data-fabricate-complication-severity="${esc(entry?.severity)}">`,
    `<span class="${GM_CARD_BLOCK}__label">${stack.join('')}</span>`,
    '</li>',
  ].join('');
}

/**
 * Build the GM-ONLY complication card's HTML for one delivered resolution (issue 1286).
 *
 * ## Why this is not `renderComplications`
 *
 * That renderer's whole contract is "the caller has already redacted", and its row is the
 * three player-safe strings on ONE line. This row must additionally say why the complication
 * fired, mark the acting client's unverifiable CLAIM as a claim while doing so, report the
 * GM-side effect roll, and report a macro that was skipped or threw — none of which may ever
 * reach a player surface, and none of which fits on one line. Widening the one shared renderer
 * to carry them would put GM-only fields inside the function every player-facing card calls,
 * which is exactly the ambiguity the audience split exists to remove. It borrows that
 * renderer's BEM block and its `esc`, so the markup and the escaping rule stay single-sourced,
 * and reaches its own layout through the `--gm` block modifier so the player row cannot move.
 *
 * ## Escaping
 *
 * Every authored string routes through `esc` and every attribute is double-quoted. Fabricate
 * imports third-party crafting systems, so a hostile definition can carry a complication whose
 * name or description is markup, and this card is built from the GM's own copy of that
 * definition rather than from anything the player sent.
 *
 * Returns `''` for an empty model, so the caller creates NO message rather than an empty one.
 *
 * @param {object} model
 * @param {Array<{name: string, description: string, severity: string, visibility: string,
 *   componentName: string, effectRoll: ?object, effectLabel: ?string, reasons: ?Array<string>,
 *   claimed: ?{bucket: ?string, effectRollTotal: ?number}, macro: ?{status: string,
 *   macroUuid: ?string}}>} [model.entries] one row per delivered complication, projected
 *   through {@link gmComplications} and augmented with the GM-side outcome.
 * @param {string} [model.actorName] the acting actor, resolved GM-side from the addressing.
 * @param {string} [model.reporterName] the SERVER-ATTESTED sender's user name.
 * @param {(key: string) => string} [localize] key-only lookup; defaults to identity.
 * @returns {string} HTML, or '' when there is nothing to report.
 */
export function buildGmComplicationCardContent(
  { entries = [], actorName = '', reporterName = '' } = {},
  localize = (key) => key
) {
  const rows = list(entries);
  if (rows.length === 0) return '';
  const loc = (key) => localize(key) ?? key;
  const subtitle = [
    actorName ? `${esc(loc(GM_CARD_KEYS.actor))}: ${esc(actorName)}` : '',
    reporterName ? `${esc(loc(GM_CARD_KEYS.reportedBy))}: ${esc(reporterName)}` : '',
  ].filter(Boolean);
  return [
    `<div class="${GM_CARD_BLOCK} ${GM_CARD_BLOCK}--gm">`,
    `<header class="${GM_CARD_BLOCK}__header">`,
    `<div class="${GM_CARD_BLOCK}__title">${esc(loc(GM_CARD_KEYS.title))}</div>`,
    subtitle.length > 0
      ? `<div class="${GM_CARD_BLOCK}__subtitle">${subtitle.join(' · ')}</div>`
      : '',
    '</header>',
    `<section class="${GM_CARD_BLOCK}__section ${GM_CARD_BLOCK}__section--complications">`,
    `<ul class="${GM_CARD_BLOCK}__grid">`,
    ...rows.map((entry) => renderGmComplication(entry, loc)),
    '</ul>',
    '</section>',
    '</div>',
  ]
    .filter(Boolean)
    .join('');
}
