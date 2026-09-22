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

/**
 * The records a check can be previewed AGAINST: whatever supplies the DC, which for a simple or
 * relative-routed check is its OWN authored recipe tiers, the default DC always offered first. A
 * FIXED routed check's bands are the same for every record and the selector still lists them,
 * the readout being per-record. A RECORD SUPPLIES A DC AND NOTHING ELSE: a progressive check has
 * none, its award count coming from the check's preview sandbox.
 * @param {object} params Params.
 * @param {object|null} params.check The active check draft.
 * @param {string} [params.defaultLabel] The localized name of the default record.
 * @returns {Array<{id: string, name: string, dc: number}>} The records, default first. */
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
 * Build the argument bag the engines build, for one previewed (activity, mode, record, actor).
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
 *   dynamicDc: boolean, actor: object|null, args: object}} `kind: null` means nothing rolls. */
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
  // This branch is about which activities HAVE the tool-bonus seam, not about the data.
  const formula =
    activity === 'gathering' ? authored : appendToolBonusTerms(authored, toolTerms ?? []);

  // A dynamic DC is resolved by RUNNING a macro; the preview refuses and falls back to the
  // static DC, the same value the engine's own try/catch falls back to.
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
    // `rollOptions: null` — see the module header — stated so a reader can check the "posts
    // nothing, prompts nothing" claim against it.
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
        // Every routed caller opts in, so a preview that did not would report a rolled-but-unrouted
        // total no craft can produce.
        clampToNearest: true,
        // A recipe's minimum success tier, stated so the arg bag is the engine's whole shape.
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

/** Roll the preview through the engine's own runner.
 *  @param {{kind: string|null, args: object}} plan {@link buildPreviewCheckArgs}'s output.
 *  @returns {Promise<object|null>} The runner's result verbatim, or null when nothing rolls. */
export async function runCheckPreview(plan) {
  if (!plan?.kind || String(plan.formula ?? '').trim() === '') return null;
  if (plan.kind === 'routed') return runFormulaRouted(plan.args);
  if (plan.kind === 'progressive') return runFormulaProgressive(plan.args);
  return runFormulaPassFail(plan.args);
}

/**
 * The TERSE breakdown line the readout shows — NOT the full resolved formula, which is the
 * `THIS CHECK` digest's job — so it reduces the result to the faces rolled, the signed remainder
 * they were added to, and who rolled them.
 * @param {object|null} result A runner result.
 * @param {string} [actorName] The previewed actor's name.
 * @returns {string} The breakdown line, or '' when there is nothing to describe. */
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
