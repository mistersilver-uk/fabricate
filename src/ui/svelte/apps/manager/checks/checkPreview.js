/**
 * The Checks Studio's outcome-preview simulator. IT DRIVES THE ENGINE'S OWN RUNNERS AND
 * REIMPLEMENTS NO RESOLUTION: a preview that disagreed about which tier a roll lands on would be
 * worse than no preview, so tier matching, forced outcomes and tier stepping have one
 * implementation, in `src/systems/checkRoll.js`.
 *
 * What it must NOT do — mutate, post, prompt or execute a DC macro — is stated in
 * `openspec/specs/ui-system-studio/spec.md` → "Outcome-preview simulator". Two mechanisms carry
 * it: `rollOptions: null`, which the runners SPREAD so the chat post's `options?.interactive`
 * gate and `allowInteractive: false` both hold; and never writing to the LIVE `system` object
 * `Actor#getRollData()` returns, {@link cloneRollData} existing for a caller that must augment. */

import { isPlayerCharacterActor } from '../../../../../config/playerCharacterTypes.js';
import { readStoredResource } from '../../../../../systems/additionalDiceReach.js';
import { buildCheckModifierContext } from '../../../../../systems/checkModifierResolver.js';
import { planModifierPlacement } from '../../../../../systems/checkModifierRouter.js';
import {
  runFormulaPassFail,
  runFormulaProgressive,
  runFormulaRouted,
} from '../../../../../systems/checkRoll.js';
import {
  activeCheckEvaluation,
  actorRollData,
  isFixedSumOver,
  resolveActivityTarget,
} from '../../../../../systems/checkTarget.js';
import { countRequired, resolveActivityCheck } from '../../../../../systems/countCheck.js';
import {
  normalizeNullableAdjustment,
  normalizeNullableSuccesses,
} from '../../../../../systems/normalize/checkEvaluation.js';
import { appendToolBonusTerms } from '../../../../../systems/toolCheckBonus.js';

import { formatSigned, interpolate, MINUS } from './checksCopy.js';
import { NO_ACTOR_ID } from './previewActorId.js';

export { NO_ACTOR_ID } from './previewActorId.js';

/** The record that IS the check's own default DC, when no named record is chosen. */
export const DEFAULT_RECORD_ID = '__default';

/** Which runner a readiness mode drives. */
const RUNNER_KINDS = new Map([
  ['simple', 'passFail'],
  ['routed', 'routed'],
  ['progressive', 'progressive'],
]);

/**
 * The world's PLAYER-CHARACTER actors. THIS LIST IS FILTERED: authority is not the question a
 * preview picker answers — the question is WHO A CHECK IS PREVIEWED AGAINST, and a real world's
 * actor directory is mostly bestiary. Membership is the shared, GM-CONFIGURABLE predicate that
 * already serves the actor-selection bar and the stamina, Access and Knowledge rosters, and both
 * seams are injected so the list is testable without a `game`.
 * @param {object} [options] Options.
 * @param {() => Iterable<object>} [options.getActors] The actor source.
 * @param {(actor: object) => boolean} [options.isPlayerCharacter] The membership predicate.
 * @returns {Array<{id: string, name: string, img: string}>} Actors, in world order. */
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
 * The previewed actor document, or null for "No actor". Under null every `@` key resolves to
 * `0`, which is why the readout renders its unresolved warning rather than a wrong total.
 * @param {string} id The selected actor id, or {@link NO_ACTOR_ID}.
 * @param {object} [options] Options.
 * @param {(id: string) => object|null} [options.getActor] The lookup seam.
 * @returns {object|null} The actor document. */
export function resolvePreviewActor(
  id,
  { getActor = (actorId) => globalThis.game?.actors?.get?.(actorId) ?? null } = {}
) {
  if (!id || id === NO_ACTOR_ID) return null;
  return getActor(id) ?? null;
}

/** A shallow-safe copy of an actor's roll data.
 *  @param {object|null} actor The previewed actor.
 *  @returns {object} A copy no caller can write back through. */
export function cloneRollData(actor) {
  const live = actor?.getRollData?.() ?? actor?.system ?? {};
  const clone = globalThis.foundry?.utils?.deepClone;
  return typeof clone === 'function' ? clone(live) : structuredClone(live);
}

/** The Preview-as actor as the Studio reads it: its name, a roll-data copy, and its stored value
 *  at a document path through the engine's own `readStoredResource`; null for "No actor". */
export function previewCharacter(actor) {
  if (!actor) return null;
  return {
    name: actor.name,
    rollData: cloneRollData(actor),
    readStored: (path) => readStoredResource(actor, path),
  };
}

/** {@link previewCharacter} for an actor id, through {@link resolvePreviewActor}. */
export function resolvePreviewCharacter(id, options) {
  return previewCharacter(resolvePreviewActor(id, options));
}

/**
 * The records a check can be previewed against: whatever supplies the target, which for a simple
 * or relative-routed check is its own authored recipe tiers, the default always offered first. A
 * fixed routed check's bands are the same for every record and the selector still lists them,
 * the readout being per-record. A record supplies a DC, an adjustment and successes and nothing
 * else: a character-value target reads the adjustment (null inherits the base), a count check the
 * successes (null inherits the pool's), every other the DC.
 * @param {object} params Params.
 * @param {object|null} params.check The active check draft.
 * @param {string} [params.defaultLabel] The localized name of the default record.
 * @returns {Array<{id: string, name: string, dc: number, adjustment: ?number, successes: ?number}>}
 *   Default first. */
export function buildPreviewRecords({ check, defaultLabel = 'Default' }) {
  const baseDc = Number(check?.dc ?? 0);
  const records = [
    {
      id: DEFAULT_RECORD_ID,
      name: defaultLabel,
      dc: Number.isFinite(baseDc) ? baseDc : 0,
      adjustment: null,
      successes: null,
    },
  ];
  for (const tier of Array.isArray(check?.tiers) ? check.tiers : []) {
    if (!tier?.id) continue;
    const dc = Number(tier.dc);
    records.push({
      id: String(tier.id),
      name: String(tier.name ?? ''),
      dc: Number.isFinite(dc) ? dc : records[0].dc,
      adjustment: normalizeNullableAdjustment(tier.adjustment),
      successes: normalizeNullableSuccesses(tier.successes),
    });
  }
  return records;
}

/** The evaluation a preview grades by: the check's own. */
export function previewEvaluation(draft) {
  return activeCheckEvaluation(draft);
}

/**
 * Build the argument bag the engines build, for one previewed (activity, mode, record, actor).
 * The target resolves as the runtime resolves it, with the record's adjustment and the actor's
 * roll data, and never through a macro; `target` is its `{ ok, target, source }` or `{ ok: false,
 * reason }`, null for a summed progressive check, which has none. A count check's `dc` and target
 * are the record's required count, and its target also carries the pool's unplaced `policy`.
 * @param {object} params Params.
 * @param {'crafting'|'salvage'|'gathering'} params.activity Which activity's check.
 * @param {'simple'|'routed'|'progressive'} params.mode The readiness mode.
 * @param {object|null} params.draft The active check draft.
 * @param {object|null} params.system The draft system, for the modifier context.
 * @param {object|null} [params.subject] The modifier context's subject; always null here.
 * @param {object|null} [params.actor] The previewed actor, or null for "No actor".
 * @param {object|null} [params.record] The previewed record.
 * @param {Array<{value: number, label: string}>} [params.toolTerms] Tool contributions, which
 *   gathering has no seam for and a preview never populates.
 * @returns {{kind: 'passFail'|'routed'|'progressive'|null, formula: string, dc: number,
 *   dynamicDc: boolean, actor: object|null, evaluation: object, target: ?object, args: object}}
 *   `kind: null` means nothing rolls. */
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
  const evaluation = previewEvaluation(draft);
  const fixedSumOver = isFixedSumOver(evaluation);
  const count = evaluation.product === 'count';
  // A count check rolls its pool, so its retained formula is inert here too.
  const authored = count ? '' : String(draft?.rollFormula ?? '').trim();
  // This branch is about which activities HAVE the tool-bonus seam, not about the data.
  const tools = activity === 'gathering' ? [] : toolContributions(toolTerms);
  const placed = planModifierPlacement({ evaluation, contributions: tools });
  const formula = appendToolBonusTerms(authored, placed.appendTerms);

  // A dynamic DC is resolved by RUNNING a macro; the preview refuses and falls back to the
  // static DC, the same value the engine's own try/catch falls back to.
  const dynamicDc = draft?.dcMode === 'dynamic';
  const dc = count ? countRequired(evaluation, record?.successes) : previewDc(record, draft);
  const target = previewTarget({ kind, draft, evaluation, dc, record, actor });
  const gradedDc = target?.ok ? target.target : dc;

  const craftingModifier = system ? buildCheckModifierContext(system, activity, subject) : null;
  const triggers = Array.isArray(draft?.checkBreakage?.triggers)
    ? draft.checkBreakage.triggers
    : [];

  const shared = {
    formula,
    triggers,
    actor,
    // `rollOptions: null` — see the module header — stated so a reader can check the "posts
    // nothing, prompts nothing" claim against it. Tools a roll-under places on its target ride
    // as the contributions the runner settles, which prompt nothing either.
    rollOptions: fixedSumOver || tools.length === 0 ? null : { toolContributions: tools },
    craftingModifier,
    ...(!fixedSumOver && { evaluation }),
  };
  const plan = { kind, formula, dc, dynamicDc, actor, evaluation, target };

  if (kind === 'progressive') return { ...plan, args: shared };

  const thresholdMode = draft?.thresholdMode === 'exceed' ? 'exceed' : 'meet';
  if (kind === 'routed') {
    return {
      ...plan,
      args: {
        ...shared,
        dc: gradedDc,
        thresholdMode,
        type: draft?.type === 'fixed' ? 'fixed' : 'relative',
        relativeOutcomes: Array.isArray(draft?.relativeOutcomes) ? draft.relativeOutcomes : [],
        fixedOutcomes: Array.isArray(draft?.fixedOutcomes) ? draft.fixedOutcomes : [],
        // Every routed caller opts in, so a preview that did not would report a rolled-but-unrouted
        // total no craft can produce.
        clampToNearest: true,
        // A recipe's minimum success tier, stated so the arg bag is the engine's whole shape.
        minOutcomeId: null,
      },
    };
  }

  return { ...plan, args: { ...shared, dc: gradedDc, thresholdMode } };
}

/** The record's DC, else the check's own, else 0. */
function previewDc(record, draft) {
  const recordDc = Number(record?.dc);
  if (Number.isFinite(recordDc)) return recordDc;
  const authoredDc = Number(draft?.dc ?? 0);
  return Number.isFinite(authoredDc) ? authoredDc : 0;
}

/**
 * The target as the runtime resolves it: the record's adjustment over the actor's roll data, or a
 * count check's pool resolved before any roll with its required count. A summed progressive check
 * has no target.
 */
function previewTarget({ kind, draft, evaluation, dc, record, actor }) {
  const readRollData = () => actorRollData(actor);
  if (evaluation.product === 'count') {
    const config = { evaluation: draft?.evaluation, thresholdMode: draft?.thresholdMode };
    return resolveActivityCheck(config, { required: record?.successes ?? null, readRollData });
  }
  if (kind === 'progressive') return null;
  return resolveActivityTarget(
    { type: draft?.type, evaluation },
    { anchor: dc, override: record?.adjustment ?? null, readRollData }
  );
}

/** Tool terms as the runtime's scalar Tool contributions. */
function toolContributions(toolTerms) {
  return (Array.isArray(toolTerms) ? toolTerms : [])
    .map((term) => ({
      source: 'tool',
      label: String(term?.label ?? ''),
      form: 'scalar',
      value: Number(term?.value),
    }))
    .filter((term) => Number.isFinite(term.value));
}

/** Roll the preview through the engine's own runner.
 *  @param {{kind: string|null, args: object}} plan {@link buildPreviewCheckArgs}'s output.
 *  @returns {Promise<object|null>} The runner's result verbatim, or null when nothing rolls. */
export async function runCheckPreview(plan) {
  if (!plan?.kind) return null;
  const rollsPool = plan.evaluation?.product === 'count';
  if (!rollsPool && String(plan.formula ?? '').trim() === '') return null;
  if (plan.kind === 'routed') return runFormulaRouted(plan.args);
  if (plan.kind === 'progressive') return runFormulaProgressive(plan.args);
  return runFormulaPassFail(plan.args);
}

/** Whether the plan grades against a character value the target resolution reads. */
export function readsAttributeTarget(plan) {
  return (
    plan.kind !== 'progressive' &&
    plan.args?.type !== 'fixed' &&
    plan.evaluation.target.source === 'attribute'
  );
}

/** Whether the plan sums roll-over against a fixed DC, an inert character value included. */
export function gradesLikeFixedOver(plan) {
  const { product = 'sum', direction } = plan.evaluation;
  return product === 'sum' && direction === 'over' && !readsAttributeTarget(plan);
}

/**
 * Which readout a plan draws: `count` for success-counting, `fixedOver` for a summed roll-over
 * against a fixed DC, and `target` for a roll-under or a character value.
 */
export function readoutFamily(plan) {
  if (plan.evaluation.product === 'count') return 'count';
  return gradesLikeFixedOver(plan) ? 'fixedOver' : 'target';
}

/** `+3`, `−3` or, with `always`, `+0`: the signed remainder a breakdown ends on. */
function remainderTerm(remainder, always) {
  if (remainder === 0 && !always) return '';
  return formatSigned(remainder, { plus: true });
}

/** `d20 9 +3`: each group's die and faces, then the remainder, signed even at `+0`. */
function fixedOverBody(groups, remainder) {
  const parts = groups.map((group) => {
    const [, sides] = String(group.group ?? '').split('d');
    return `d${sides} ${(group.results ?? []).join(' ')}`.trim();
  });
  return [...parts, remainderTerm(remainder, true)].join(' ');
}

/** `5 + 5 + 3`, a non-zero remainder joined as one more term, and ` · raw` under a roll-under. */
function targetBody(faces, remainder, direction, text) {
  let line = faces.join(' + ');
  if (remainder !== 0) {
    const joiner = remainder > 0 ? ' + ' : ` ${MINUS} `;
    line = line ? `${line}${joiner}${Math.abs(remainder)}` : formatSigned(remainder);
  }
  if (direction !== 'under') return line;
  return `${line} · ${text('FABRICATE.Admin.Manager.Checks.Simulator.Raw', 'raw')}`;
}

/** `4 qualified − 2 cancelled = 2 net`, or `pool reduced to 0` for a pool that rolled nothing. */
function countBody(data, text) {
  if (data.zeroPool === true) {
    return text('FABRICATE.Admin.Manager.Checks.Simulator.PoolZero', 'pool reduced to 0');
  }
  const net = data.total === null ? NaN : Number(data.total);
  if (!Number.isFinite(net)) return '';
  const copy = text(
    'FABRICATE.Admin.Manager.Checks.Simulator.CountNet',
    '{qualified} qualified − {cancelled} cancelled = {net} net'
  );
  return interpolate(copy, {
    qualified: data.successes,
    cancelled: data.cancelled,
    net: formatSigned(net),
  });
}

/**
 * The TERSE breakdown line the readout shows — NOT the full resolved formula, which is the
 * `THIS CHECK` digest's job. It reduces a result to its faces and signed remainder, or a count to
 * its qualified and cancelled dice, and ends on the previewed actor's name.
 * @param {object|null} result A runner result.
 * @param {{plan: object, actorName?: string}} context The plan rolled and who rolled it.
 * @param {(key: string, fallback: string) => string} text Localizes.
 * @returns {string} The breakdown line, or '' when there is nothing to describe. */
export function readoutBreakdown(result, { plan, actorName = '' }, text) {
  const data = result?.data;
  if (!data) return '';
  const line = checkBreakdownBody(data, plan, text);
  if (!line) return '';
  return actorName ? `${line} · ${actorName}` : line;
}

function checkBreakdownBody(data, plan, text) {
  const family = readoutFamily(plan);
  if (family === 'count') return countBody(data, text);
  const total = Number(data.total);
  if (data.total === null || !Number.isFinite(total)) return '';
  const groups = Array.isArray(data.diceGroups) ? data.diceGroups : [];
  const faces = groups.flatMap((group) => group.results ?? []);
  const remainder = total - faces.reduce((sum, face) => sum + Number(face || 0), 0);
  if (family === 'fixedOver') return fixedOverBody(groups, remainder);
  return targetBody(faces, remainder, plan.evaluation.direction, text);
}
