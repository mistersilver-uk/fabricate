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

/** The label key for each stage bucket the acting client may CLAIM. Same frozen-map rule. */
const BUCKET_KEYS = Object.freeze({
  full: 'FABRICATE.Chat.GmComplication.Bucket.full',
  partial: 'FABRICATE.Chat.GmComplication.Bucket.partial',
  halted: 'FABRICATE.Chat.GmComplication.Bucket.halted',
  unreached: 'FABRICATE.Chat.GmComplication.Bucket.unreached',
  skipped: 'FABRICATE.Chat.GmComplication.Bucket.skipped',
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
  unverified: 'FABRICATE.Chat.GmComplication.Unverified',
  stage: 'FABRICATE.Chat.GmComplication.Stage',
  effectRoll: 'FABRICATE.Chat.GmComplication.EffectRoll',
  effectRollFailed: 'FABRICATE.Chat.GmComplication.EffectRollFailed',
  playerVisible: 'FABRICATE.Chat.GmComplication.PlayerVisible',
  macroSkipped: 'FABRICATE.Chat.GmComplication.MacroSkipped',
  macroFailed: 'FABRICATE.Chat.GmComplication.MacroFailed',
});

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
 * @param {Array<object>} fired {@link fireComplications}'s `fired` list
 * @returns {Array<{resultId: string|null, componentId: string|null, componentName: string,
 *   complicationId: string|null, name: string, description: string, severity: string,
 *   visibility: string, bucket: string|null, buckets: Array<string>,
 *   matchedConditions: Array<string>, effectRoll: object|null}>}
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
  }));
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
 * The notes one GM card row carries under its name, already escaped and in reading order.
 *
 * Three separate jobs, and the order is what makes them readable as a sentence about ONE
 * complication: what the GM authored (severity, audience), what the acting client CLAIMS about
 * the outcome, and what this GM client actually did with the macro.
 *
 * `bucket` and `effectRollTotal` are the acting client's unverifiable claim — the GM cannot
 * re-derive either, because the award happened on the acting client — so they are labelled as
 * reported rather than stated flat. That labelling is required by
 * `openspec/specs/recipes-and-steps/spec.md` § "The relay payload carries ADDRESSING ONLY", not
 * a presentational choice.
 *
 * @param {object} entry one row of {@link buildGmComplicationCardContent}'s model
 * @param {(key: string) => string} loc
 * @returns {Array<string>} escaped HTML fragments
 */
function gmComplicationNotes(entry, loc) {
  const notes = [];
  const severityKey = SEVERITY_KEYS[text(entry?.severity)];
  const authored = [
    severityKey ? esc(loc(severityKey)) : '',
    entry?.visibility === VISIBLE ? esc(loc(GM_CARD_KEYS.playerVisible)) : '',
  ].filter(Boolean);
  if (authored.length > 0) notes.push(authored.join(' · '));

  const bucketKey = BUCKET_KEYS[text(entry?.claimed?.bucket)];
  const claimedTotal = entry?.claimed?.effectRollTotal;
  const claim = [
    bucketKey ? `${esc(loc(GM_CARD_KEYS.stage))}: ${esc(loc(bucketKey))}` : '',
    isReportableTotal(claimedTotal)
      ? `${esc(loc(GM_CARD_KEYS.effectRoll))}: ${esc(claimedTotal)}`
      : '',
  ].filter(Boolean);
  if (claim.length > 0) notes.push(`${esc(loc(GM_CARD_KEYS.unverified))} — ${claim.join(' · ')}`);

  // `attempted`, never `requested`. `requested` is true for an authored roll this client
  // DECLINED by audience — a `visible` complication carrying a macro reaches the GM client
  // for the macro's sake, and its roll belongs to the acting player's dice. Reading
  // `requested` here rendered "the roll failed" directly under the acting client's claimed
  // total for that exact case, so the card stated an outcome and its own contradiction.
  const effect = entry?.effectRoll;
  if (effect?.attempted === true) {
    notes.push(
      isReportableTotal(effect.total)
        ? `${esc(loc(GM_CARD_KEYS.effectRoll))}: ${esc(effect.formula)} = ${esc(effect.total)}`
        : `${esc(loc(GM_CARD_KEYS.effectRollFailed))}: ${esc(effect.formula)}`
    );
  }

  // The macro miss is REPORTED here rather than only to the console, because
  // `recipes-and-steps/spec.md` § "The `script` gate is a call-site check" states that a uuid
  // which does not resolve to a script macro "is skipped and reported on the GM-facing output":
  // compendium ownership is GM-configurable per role, so a broken link is a real GM-facing case
  // and a console warning on the ONE client that can fix it is not a report.
  const macroKey =
    { skipped: GM_CARD_KEYS.macroSkipped, failed: GM_CARD_KEYS.macroFailed }[
      text(entry?.macro?.status)
    ] ?? null;
  if (macroKey) notes.push(`${esc(loc(macroKey))}: ${esc(entry?.macro?.macroUuid)}`);
  return notes;
}

/**
 * Render one GM card row.
 *
 * @param {object} entry
 * @param {(key: string) => string} loc
 * @returns {string}
 */
function renderGmComplication(entry, loc) {
  const parts = [`<span class="${GM_CARD_BLOCK}__complication-name">${esc(entry?.name)}</span>`];
  if (entry?.componentName)
    parts.push(
      `<span class="${GM_CARD_BLOCK}__complication-source">${esc(entry.componentName)}</span>`
    );
  if (entry?.description)
    parts.push(
      `<span class="${GM_CARD_BLOCK}__complication-description">${esc(entry.description)}</span>`
    );
  const notes = gmComplicationNotes(entry, loc).map(
    (note) => `<span class="${GM_CARD_BLOCK}__complication-note">${note}</span>`
  );
  return [
    `<li class="${GM_CARD_BLOCK}__item ${GM_CARD_BLOCK}__item--complication" data-fabricate-complication-severity="${esc(entry?.severity)}">`,
    `<span class="${GM_CARD_BLOCK}__label">${parts.join(' — ')}</span>`,
    ...notes,
    '</li>',
  ].join('');
}

/**
 * Build the GM-ONLY complication card's HTML for one delivered resolution (issue 1286).
 *
 * ## Why this is not `renderComplications`
 *
 * That renderer's whole contract is "the caller has already redacted", and its row is the
 * three player-safe strings. This row must additionally mark the acting client's unverifiable
 * CLAIM as a claim, report the GM-side effect roll, and report a macro that was skipped or
 * threw — none of which may ever reach a player surface. Widening the one shared renderer to
 * carry them would put GM-only fields inside the function every player-facing card calls,
 * which is exactly the ambiguity the audience split exists to remove. It borrows that
 * renderer's BEM block and its `esc`, so the markup and the escaping rule stay single-sourced.
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
 *   componentName: string, effectRoll: ?object,
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
