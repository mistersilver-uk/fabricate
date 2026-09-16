/**
 * The Checks Studio's outcome-preview simulator.
 *
 * IT DRIVES THE ENGINE'S OWN RUNNERS AND REIMPLEMENTS NO RESOLUTION: everything here builds the
 * SAME argument bag the three engines build and hands it to `runFormulaPassFail` /
 * `runFormulaProgressive` / `runFormulaRouted`. A preview that disagreed with the engine about
 * which tier a roll lands on would be worse than no preview at all, so tier matching, forced
 * outcomes and tier stepping have exactly one implementation, in `src/systems/checkRoll.js`.
 *
 * What it must NOT do — mutate, post, prompt, or execute a DC macro — and why a dynamic DC
 * previews against the STATIC fallback are stated in `openspec/specs/ui-integration/spec.md` →
 * "Outcome-preview simulator". Two mechanisms carry those guarantees here:
 *
 * - `rollOptions: null` is load-bearing rather than decorative. All three runners SPREAD it into
 *   the `evaluateCheckRoll` options bag and `{...null}` is `{}`, the chat post is gated on
 *   `options?.interactive`, and the evaluation passes `allowInteractive: false`, which bypasses
 *   Foundry's manual-fulfilment resolver even on a client configured for it.
 * - `Actor#getRollData()` returns the LIVE `system` object, which Foundry's own docs warn must
 *   not be mutated. Nothing here writes to it, and {@link cloneRollData} exists for any caller
 *   that needs to augment it.
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
 * THIS LIST IS FILTERED. Authority is not the question a preview picker answers — the question
 * is WHO A CHECK IS PREVIEWED AGAINST, and a crafting check is rolled by a character, where a
 * real world's actor directory is mostly bestiary. Membership is the shared, GM-CONFIGURABLE
 * player-character predicate that already serves the actor-selection bar, the stamina roster and
 * the Access and Knowledge rosters, so this screen gets no second, narrower answer.
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
 * The previewed actor document, or null for the "No actor" selection. Under null every `@` key
 * resolves to `0`, which is precisely why the readout renders its unresolved warning there
 * rather than a total: a plausible wrong number is the failure that warning exists for.
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
 * The records a check can be previewed AGAINST: whatever supplies the DC this check is measured
 * against for one subject, which for a simple or relative-routed check is its OWN authored
 * recipe tiers. The check's default DC is always offered first, so a system that has authored no
 * tiers still has something to preview against. A FIXED routed check's bands are the same for
 * every record, and the selector still lists them, because the readout and the "What happens"
 * rows are per-record even where the bands are not.
 *
 * A RECORD SUPPLIES A DC AND NOTHING ELSE. A progressive check has no DC, and its award count
 * comes from the check's own preview sandbox — see `src/systems/progressiveCheckSandbox.js`.
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
 *   Crafting and salvage have that seam and gathering does not; a preview selects no ingredient
 *   set, so this is empty in the product and exists so the seam is real rather than assumed.
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
  // Crafting and salvage append tool bonus terms before the roll and gathering has no such
  // seam, so this branch is about which activities HAVE it rather than about the data.
  const formula =
    activity === 'gathering' ? authored : appendToolBonusTerms(authored, toolTerms ?? []);

  // A dynamic DC is resolved by RUNNING a macro. The preview refuses to, and falls back to the
  // authored static DC — the same value the engine's own try/catch falls back to.
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
    // `rollOptions: null` — see the module header. Stated rather than omitted, because an
    // explicit null is what a reader can check the "posts nothing, prompts nothing" claim against.
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
        // Every routed caller in the product opts in, so a preview that did not would report
        // a rolled-but-unrouted total no craft can produce.
        clampToNearest: true,
        // A recipe's minimum success tier, which no record here carries; stated rather than
        // omitted so the arg bag is the engine's whole shape.
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
 * The TERSE breakdown line the readout shows. It is NOT the full resolved formula, which is the
 * `THIS CHECK` digest's job, so it reduces the result to the die faces actually rolled, the
 * signed remainder they were added to, and who rolled them.
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
