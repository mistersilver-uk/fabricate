/**
 * The Checks Studio's outcome-preview simulator (issue 1097).
 *
 * IT DRIVES THE ENGINE'S OWN RUNNERS; IT DOES NOT REIMPLEMENT RESOLUTION. Everything
 * here builds the SAME argument bag `CraftingEngine` / the salvage path / `GatheringEngine`
 * build and hands it to `runFormulaPassFail` / `runFormulaProgressive` /
 * `runFormulaRouted`. A preview that disagreed with the engine about which tier a roll
 * lands on would be worse than no preview at all, so there is exactly one implementation
 * of tier matching, forced outcomes and tier stepping in this repository and it lives in
 * `src/systems/checkRoll.js`.
 *
 * ## It mutates nothing, posts nothing and prompts for nothing
 *
 * `rollOptions: null` is load-bearing rather than decorative, and each half of it is a
 * property of the runners rather than an intention of this module:
 *
 * - all three runners SPREAD `rollOptions` into the `evaluateCheckRoll` options bag, and
 *   `{...null}` is `{}`;
 * - the chat post is gated on `options?.interactive`, which `{}` does not carry, so
 *   `roll.toMessage` is never reached;
 * - the evaluation itself passes `allowInteractive: false`, which bypasses Foundry's
 *   manual-fulfilment `RollResolver` even on a client configured for it.
 *
 * `checkRoll.js` holds no `game.`, no `ui.` and no document write other than that one
 * gated `toMessage`.
 *
 * ## IT NEVER EXECUTES A DC MACRO
 *
 * The engine reaches a `dcMode: 'dynamic'` DC by RUNNING the linked macro:
 * `CraftingEngine._resolveSimpleCheckDc` calls `MacroExecutor.run`, which compiles
 * `macro.command` into an `AsyncFunction` and executes it with the current user's
 * authority. `MacroExecutor` guards only `typeof macro.command !== 'string'`, which is
 * NOT a script-type check — Foundry declares `type` with `initial: CONST.MACRO_TYPES.CHAT`
 * and `command` as `required: true, blank: true` on BOTH types, and the shipped
 * `ItemDropZone documentType="Macro"` accepts any Macro — so a chat macro's prose
 * compiles as JavaScript. A DC macro that creates a `ChatMessage`, updates an Actor or
 * writes a flag would do all of that from a preview button. The engine survives that via
 * a try/catch onto its fallback DC; a preview has no such business running it at all.
 * So a dynamic DC previews against the STATIC fallback and says so.
 *
 * ## Roll data is read-only
 *
 * `Actor#getRollData()` returns the LIVE `system` object with an explicit "care must be
 * taken not to mutate the original object" warning in Foundry's own docs. Nothing here
 * writes to it; {@link cloneRollData} exists for any caller that needs to augment it.
 */

import { isPlayerCharacterActor } from '../../../../../config/playerCharacterTypes.js';
import { buildCheckModifierContext } from '../../../../../systems/checkModifierResolver.js';
import {
  runFormulaPassFail,
  runFormulaProgressive,
  runFormulaRouted,
} from '../../../../../systems/checkRoll.js';
import { appendToolBonusTerms } from '../../../../../systems/toolCheckBonus.js';

/** The "No actor" selection. An id no Foundry document can carry. */
export const NO_ACTOR_ID = '';

/** The record that IS the check's own default DC, when no named record is chosen. */
export const DEFAULT_RECORD_ID = '__default';

/** Which runner a readiness mode drives. */
const RUNNER_KINDS = new Map([
  ['simple', 'passFail'],
  ['routed', 'routed'],
  ['progressive', 'progressive'],
]);

/**
 * The world's PLAYER-CHARACTER actors.
 *
 * THIS LIST IS FILTERED, and the earlier reasoning for leaving it unfiltered is retired
 * (issue 1097, maintainer ruling). That reasoning was about AUTHORITY — the Studio is
 * GM-only and a GM's `Document#isOwner` is true for every actor, so nothing here is
 * forbidden to them — and authority was never the question a preview picker answers. The
 * question is WHO A CHECK IS PREVIEWED AGAINST, and a crafting check is rolled by a
 * character: a real world's actor directory is mostly bestiary (28 entries of Balehound,
 * Jadmór and swarms in the reported case), so an unfiltered list buried the three actors a
 * GM would ever pick behind twenty-five that resolve no crafting roll data at all.
 *
 * Membership is the shared, GM-CONFIGURABLE player-character predicate, so a system whose
 * player actors are not typed `character` is served by the same setting that already serves
 * the actor-selection bar, the stamina roster and the Access and Knowledge rosters — this
 * screen does not get a second, narrower answer to "what is a player character".
 *
 * Both seams are injected so the list is testable without a `game`.
 *
 * @param {object} [options] Options.
 * @param {() => Iterable<object>} [options.getActors] The actor source.
 * @param {(actor: object) => boolean} [options.isPlayerCharacter] The membership predicate.
 * @returns {Array<{id: string, name: string, img: string}>} Actors, in world order.
 */
export function listPreviewActors({
  getActors = () => globalThis.game?.actors?.contents ?? globalThis.game?.actors ?? [],
  isPlayerCharacter = isPlayerCharacterActor,
} = {}) {
  const actors = [];
  for (const actor of getActors() ?? []) {
    if (!actor?.id) continue;
    if (!isPlayerCharacter(actor)) continue;
    actors.push({
      id: String(actor.id),
      name: String(actor.name ?? actor.id),
      img: typeof actor.img === 'string' ? actor.img : '',
    });
  }
  return actors;
}

/**
 * The previewed actor document, or null for the "No actor" selection.
 *
 * Under null every `@` key resolves to `0` (`evaluateCheckRoll` falls back to `{}` roll
 * data), which is precisely why the readout renders its unresolved warning there rather
 * than a total: a plausible wrong number is the failure this whole warning exists for.
 *
 * @param {string} id The selected actor id, or {@link NO_ACTOR_ID}.
 * @param {object} [options] Options.
 * @param {(id: string) => object|null} [options.getActor] The lookup seam.
 * @returns {object|null} The actor document.
 */
export function resolvePreviewActor(
  id,
  { getActor = (actorId) => globalThis.game?.actors?.get?.(actorId) ?? null } = {}
) {
  if (!id || id === NO_ACTOR_ID) return null;
  return getActor(id) ?? null;
}

/**
 * A shallow-safe copy of an actor's roll data.
 *
 * @param {object|null} actor The previewed actor.
 * @returns {object} A copy no caller can write back through.
 */
export function cloneRollData(actor) {
  const live = actor?.getRollData?.() ?? actor?.system ?? {};
  const clone = globalThis.foundry?.utils?.deepClone;
  return typeof clone === 'function' ? clone(live) : structuredClone(live);
}

/**
 * The records a check can be previewed AGAINST.
 *
 * A "record" is whatever supplies the DC (and, for a progressive check, the ordered
 * result difficulties) that this check is measured against for one subject. For a
 * simple or relative-routed check those are the check's OWN authored recipe tiers, which
 * is exactly what the tier table above the strip edits; the check's default DC is always
 * offered first so a system that has authored no tiers still has something to preview
 * against.
 *
 * A FIXED routed check measures by absolute value range, so its bands are the same for
 * every record — the selector still lists them, because the simulator's readout and the
 * "What happens" rows are per-record even where the bands are not.
 *
 * A RECORD SUPPLIES A DC AND NOTHING ELSE. A progressive check has no DC, and its award
 * count comes from the check's own preview sandbox (`progressive.preview.difficulties`)
 * rather than from a record — see `src/systems/progressiveCheckSandbox.js` for why the
 * Studio previews the CHECK rather than what some recipe would do with it.
 *
 * @param {object} params Params.
 * @param {object|null} params.check The active check draft.
 * @param {string} [params.defaultLabel] The localized name of the default record.
 * @returns {Array<{id: string, name: string, dc: number}>} The records, default first.
 */
export function buildPreviewRecords({ check, defaultLabel = 'Default' }) {
  const baseDc = Number(check?.dc ?? 0);
  const records = [
    {
      id: DEFAULT_RECORD_ID,
      name: defaultLabel,
      dc: Number.isFinite(baseDc) ? baseDc : 0,
    },
  ];
  for (const tier of Array.isArray(check?.tiers) ? check.tiers : []) {
    if (!tier?.id) continue;
    const dc = Number(tier.dc);
    records.push({
      id: String(tier.id),
      name: String(tier.name ?? ''),
      dc: Number.isFinite(dc) ? dc : records[0].dc,
    });
  }
  return records;
}

/**
 * Build the argument bag the engines build, for one previewed (activity, mode, record,
 * actor) tuple.
 *
 * @param {object} params Params.
 * @param {'crafting'|'salvage'|'gathering'} params.activity Which activity's check.
 * @param {'simple'|'routed'|'progressive'} params.mode The readiness mode.
 * @param {object|null} params.draft The active check draft.
 * @param {object|null} params.system The draft system, for the modifier context.
 * @param {object|null} [params.subject] The subject the modifier context resolves
 *   against. Always null on this route: the Studio validates the SYSTEM's selection.
 * @param {object|null} [params.actor] The previewed actor, or null for "No actor".
 * @param {object|null} [params.record] The previewed record.
 * @param {Array<{value: number, label: string}>} [params.toolTerms] Tool contributions.
 *   Crafting and salvage have that seam and gathering does not; a preview selects no
 *   ingredient set, so this is empty in the product and exists so the seam is real
 *   rather than assumed away.
 * @returns {{
 *   kind: 'passFail'|'routed'|'progressive'|null,
 *   formula: string,
 *   dc: number,
 *   dynamicDc: boolean,
 *   actor: object|null,
 *   args: object,
 * }} `kind: null` means this mode rolls nothing.
 */
export function buildPreviewCheckArgs({
  activity,
  mode,
  draft,
  system,
  subject = null,
  actor = null,
  record = null,
  toolTerms = [],
}) {
  const kind = RUNNER_KINDS.get(mode) ?? null;
  const authored = String(draft?.rollFormula ?? '').trim();
  // Crafting and salvage append tool bonus terms before the roll; gathering has no such
  // seam. `appendToolBonusTerms` returns the formula unchanged for an empty list, so the
  // branch is about which activities HAVE the seam rather than about the current data.
  const formula =
    activity === 'gathering' ? authored : appendToolBonusTerms(authored, toolTerms ?? []);

  // A dynamic DC is resolved by RUNNING a macro. The preview refuses to, and falls back
  // to the authored static DC — the same value the engine's own try/catch falls back to.
  const dynamicDc = draft?.dcMode === 'dynamic';
  const recordDc = Number(record?.dc);
  const authoredDc = Number(draft?.dc ?? 0);
  const dc = Number.isFinite(recordDc) ? recordDc : Number.isFinite(authoredDc) ? authoredDc : 0;

  const craftingModifier = system ? buildCheckModifierContext(system, activity, subject) : null;
  const triggers = Array.isArray(draft?.checkBreakage?.triggers)
    ? draft.checkBreakage.triggers
    : [];

  const shared = {
    formula,
    triggers,
    actor,
    // `rollOptions: null` — see the module header. Stated rather than omitted, because
    // the runners' default is already null and an explicit null is what a reader can
    // check against the "posts nothing, prompts for nothing" claim.
    rollOptions: null,
    craftingModifier,
  };

  if (kind === 'progressive') {
    return { kind, formula, dc, dynamicDc, actor, args: shared };
  }

  if (kind === 'routed') {
    return {
      kind,
      formula,
      dc,
      dynamicDc,
      actor,
      args: {
        ...shared,
        dc,
        thresholdMode: draft?.thresholdMode === 'exceed' ? 'exceed' : 'meet',
        type: draft?.type === 'fixed' ? 'fixed' : 'relative',
        relativeOutcomes: Array.isArray(draft?.relativeOutcomes) ? draft.relativeOutcomes : [],
        fixedOutcomes: Array.isArray(draft?.fixedOutcomes) ? draft.fixedOutcomes : [],
        // Every routed caller in the product opts in, so a preview that did not would
        // report a rolled-but-unrouted total no craft can actually produce.
        clampToNearest: true,
        // A recipe's minimum success tier, which no record on this route carries. Stated
        // rather than omitted so the arg bag is the engine's whole shape.
        minOutcomeId: null,
      },
    };
  }

  return {
    kind,
    formula,
    dc,
    dynamicDc,
    actor,
    args: {
      ...shared,
      dc,
      thresholdMode: draft?.thresholdMode === 'exceed' ? 'exceed' : 'meet',
    },
  };
}

/**
 * Roll the preview through the engine's own runner.
 *
 * @param {{kind: string|null, args: object}} plan The output of
 *   {@link buildPreviewCheckArgs}.
 * @returns {Promise<object|null>} The runner's own result object, verbatim. Null when
 *   the mode rolls nothing or no formula is authored.
 */
export async function runCheckPreview(plan) {
  if (!plan?.kind || String(plan.formula ?? '').trim() === '') return null;
  if (plan.kind === 'routed') return runFormulaRouted(plan.args);
  if (plan.kind === 'progressive') return runFormulaProgressive(plan.args);
  return runFormulaPassFail(plan.args);
}

/**
 * The TERSE breakdown line the readout shows: `d20 9 +10 · Sera Vane`.
 *
 * The prototype frame is explicit that this is not the full resolved formula — that
 * string is the `THIS CHECK` digest's job — so this reduces the result to the die faces
 * actually rolled, the signed remainder they were added to, and who rolled them.
 *
 * @param {object|null} result A runner result.
 * @param {string} [actorName] The previewed actor's name.
 * @returns {string} The breakdown line, or '' when there is nothing to describe.
 */
export function terseBreakdown(result, actorName = '') {
  const groups = Array.isArray(result?.data?.diceGroups) ? result.data.diceGroups : [];
  const total = Number(result?.data?.total);
  if (!Number.isFinite(total)) return '';
  const faces = groups.flatMap((group) => group.results ?? []);
  const rolled = faces.reduce((sum, face) => sum + Number(face || 0), 0);
  const remainder = total - rolled;
  const parts = [];
  for (const group of groups) {
    const [, sides] = String(group.group ?? '').split('d');
    parts.push(`d${sides} ${(group.results ?? []).join(' ')}`.trim());
  }
  if (remainder !== 0) parts.push(remainder > 0 ? `+${remainder}` : String(remainder));
  const line = parts.join(' ');
  return actorName ? `${line} · ${actorName}` : line;
}
