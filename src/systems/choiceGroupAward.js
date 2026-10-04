/**
 * A result-side choice group's award (issue 1773): N resolves once, a rolled group's selection is
 * rolled once per award against the crafting character and read off an ordered ladder, and a
 * player-chooser group becomes a pending choice. Pure but for the injected `Roll`.
 */
import { GROUP_AWARD_STRATEGIES, GROUP_CHOOSERS, isChoiceGroup } from '../models/Result.js';
import { trimStringOrNull } from '../utils/scalars.js';

import { AWARD_ENTRIES_MAX } from './companionContract.js';
import { resolveRolledAmount } from './rolledAmountResolver.js';

const list = (value) => (Array.isArray(value) ? value : []);
const known = (value, allowed) => (allowed.includes(value) ? value : allowed[0]);

export const groupChooser = (group) => known(group?.chooser, GROUP_CHOOSERS);
export const groupStrategy = (group) => known(group?.awardStrategy, GROUP_AWARD_STRATEGIES);

/** N for one award: one under `anyOne`, else the count or its formula, floored at 0 and capped. */
export async function resolveAwardCount(group, actor, { Roll } = {}) {
  if (groupStrategy(group) !== 'upTo') return { count: 1, countRoll: null, roll: null };
  const { amount, rolled, roll } = await resolveRolledAmount(
    { quantity: Number(group.awardCount) || 0, quantityFormula: group.awardCountFormula },
    actor,
    { Roll }
  );
  const count = Math.min(Math.max(0, Math.floor(Number(amount) || 0)), AWARD_ENTRIES_MAX);
  return { count, countRoll: rolled, roll };
}

const rangeStart = (member) => {
  const from = member?.selectionRange?.from;
  return Number.isFinite(from) ? from : -Infinity;
};

/** A rolled group's members ordered by where their range starts, whatever the authored order. */
export const selectionLadder = (members) =>
  list(members)
    .map((member, index) => ({ member, index }))
    .sort((a, b) => rangeStart(a.member) - rangeStart(b.member) || a.index - b.index)
    .map(({ member }) => member);

/** The rung whose range starts highest at or below `total`, else the lowest: a clamp, never a gap. */
export function selectFromLadder(ladder, total) {
  return ladder.reduce(
    (selected, member) => (rangeStart(member) <= total ? member : selected),
    ladder[0] ?? null
  );
}

/**
 * A rolled group's draws for `count` awards. Without repeats each later roll reads only the
 * members not yet awarded, so a count above the members awards each once and rolls no more.
 */
export async function drawRolledAwards(group, actor, { Roll, count }) {
  const repeats = group.withReplacement === true;
  let ladder = selectionLadder(group.alternatives);
  if (ladder.length === 0) return [];
  const awards = repeats ? count : Math.min(count, ladder.length);
  const draws = [];
  for (let index = 0; index < awards; index += 1) {
    const { rolled, roll } = await resolveRolledAmount(
      { quantity: 0, quantityFormula: group.selectionFormula },
      actor,
      { Roll }
    );
    if (!rolled) throw new TypeError('Fabricate | A rolled choice group needs a selection formula');
    const member = selectFromLadder(ladder, rolled.total);
    draws.push({ member, rolled, roll });
    if (!repeats) ladder = ladder.filter((entry) => entry !== member);
  }
  return draws;
}

const MEMBER_FIELDS = Object.freeze([
  'id',
  'kind',
  'componentId',
  'itemUuid',
  'unit',
  'recipeId',
  'label',
  'reason',
  'quantity',
  'quantityFormula',
  'propertyMacroUuid',
]);

/** A member as a pending choice snapshots it: what it awards, never its range. */
export const memberSnapshot = (member) =>
  Object.fromEntries(
    MEMBER_FIELDS.filter((key) => member?.[key] !== null && member?.[key] !== undefined).map(
      (key) => [key, member[key]]
    )
  );

/** A drawn member as the result row an Item award records, linked under its carrier's row. */
export const memberResultRow = (member, carrier) => ({
  ...member,
  resultRowId: `${carrier.resultRowId ?? carrier.id}:${member.id}`,
});

/** Award one group: an empty award at N 0, a pending choice for the player, else its draws. */
async function awardGroup(carrier, group, context) {
  const { count, countRoll, roll } = await resolveAwardCount(carrier, context.actor, context);
  if (roll) context.rolls.push(roll);
  const awardStrategy = groupStrategy(carrier);
  const chooser = groupChooser(carrier);
  const counted = { awardStrategy, count, ...(countRoll && { countRoll }) };
  if (count > 0 && chooser === 'playerChooses') {
    context.pendingAwardChoices.push({
      choiceId: carrier.id,
      resultGroupId: group?.id ?? null,
      ...(trimStringOrNull(carrier.resultRowId) && { resultRowId: carrier.resultRowId }),
      ...counted,
      alternatives: list(carrier.alternatives).map(memberSnapshot),
    });
    return;
  }
  const draws =
    count > 0 ? await drawRolledAwards(carrier, context.actor, { ...context, count }) : [];
  const selections = draws.map(({ member, rolled }) => ({
    alternativeId: member.id,
    roll: rolled,
  }));
  context.groupAwards.push({ choiceId: carrier.id, chooser, ...counted, selections });
  for (const draw of draws) {
    context.rolls.push(draw.roll);
    await context.awardOne(draw.member, carrier);
  }
}

/**
 * Award every routed result in order: a plain result through `awardOne(result, null)`, each draw of
 * a rolled group through `awardOne(member, carrier)`, and a player-chooser group into a pending
 * choice. Answers the group records and every live count and selection roll, for the card.
 */
export async function awardRoutedResults(groups, { actor, Roll, awardOne }) {
  const context = { actor, Roll, awardOne, groupAwards: [], pendingAwardChoices: [], rolls: [] };
  for (const group of list(groups)) {
    for (const result of list(group?.results)) {
      if (isChoiceGroup(result)) await awardGroup(result, group, context);
      else await awardOne(result, null);
    }
  }
  const { groupAwards, pendingAwardChoices, rolls } = context;
  return { groupAwards, pendingAwardChoices, rolls };
}

const nonNegativeInteger = (value) => Number.isSafeInteger(value) && value >= 0;

function rollRecord(value) {
  const formula = trimStringOrNull(value?.formula);
  return formula && Number.isFinite(value?.total) ? { formula, total: value.total } : null;
}

/** A step's group award as persisted, or `null` when malformed. */
export function groupAwardRecord(entry) {
  const choiceId = trimStringOrNull(entry?.choiceId);
  if (!choiceId || !nonNegativeInteger(entry.count) || !Array.isArray(entry.selections))
    return null;
  const countRoll = rollRecord(entry.countRoll);
  return {
    choiceId,
    chooser: groupChooser(entry),
    awardStrategy: groupStrategy(entry),
    count: entry.count,
    ...(countRoll && { countRoll }),
    selections: entry.selections
      .filter((selection) => trimStringOrNull(selection?.alternativeId))
      .map((selection) => {
        const roll = rollRecord(selection.roll);
        return { alternativeId: selection.alternativeId, ...(roll && { roll }) };
      }),
  };
}

const SETTLED_OUTCOMES = Object.freeze(['awarded', 'forfeited']);

/** A step's pending award choice as persisted, or `null` when malformed. */
export function pendingAwardChoiceRecord(entry) {
  const choiceId = trimStringOrNull(entry?.choiceId);
  if (!choiceId || !nonNegativeInteger(entry.count) || !Array.isArray(entry.alternatives)) {
    return null;
  }
  const countRoll = rollRecord(entry.countRoll);
  const settled = Number.isFinite(entry.settledAt) && SETTLED_OUTCOMES.includes(entry.outcome);
  const resultRowId = trimStringOrNull(entry.resultRowId);
  return {
    choiceId,
    resultGroupId: trimStringOrNull(entry.resultGroupId),
    ...(resultRowId && { resultRowId }),
    awardStrategy: groupStrategy(entry),
    count: entry.count,
    ...(countRoll && { countRoll }),
    alternatives: entry.alternatives
      .filter((member) => trimStringOrNull(member?.id))
      .map(memberSnapshot),
    ...(settled && {
      picks: list(entry.picks).filter(trimStringOrNull),
      settledAt: entry.settledAt,
      outcome: entry.outcome,
    }),
  };
}

/** A step's group fields as persisted: a list present stays present, its malformed entries dropped. */
export function groupEvidenceFields(source = {}) {
  const evidence = {};
  for (const [key, record] of [
    ['groupAwards', groupAwardRecord],
    ['pendingAwardChoices', pendingAwardChoiceRecord],
  ]) {
    if (Array.isArray(source?.[key])) evidence[key] = source[key].map(record).filter(Boolean);
  }
  return evidence;
}

/** Whether a pending choice is still owed: settling stamps `settledAt`, once. */
export const isUnsettledChoice = (choice) => Boolean(choice) && choice.settledAt == null;

/** Whether a step, or any step of a run, still owes an award choice. */
export function holdsUnsettledAwardChoice(record) {
  const steps = Array.isArray(record?.steps) ? record.steps : [record];
  return steps.some((step) => list(step?.pendingAwardChoices).some(isUnsettledChoice));
}

/** The `groupAwards` entry a settle appends: the player's picks as the group's selections. */
export const pickedGroupAward = (choice, picks) => ({
  choiceId: choice.choiceId,
  chooser: 'playerChooses',
  awardStrategy: choice.awardStrategy,
  count: choice.count,
  ...(choice.countRoll && { countRoll: choice.countRoll }),
  selections: picks.map((alternativeId) => ({ alternativeId })),
});

/**
 * Settle every choice `run` still owes as `forfeited` at `now`, picking nothing, as a prune does
 * before it would drop the run (issue 1773). Answers whether any choice was owed.
 */
export function forfeitOwedChoices(run, now) {
  const owed = list(run?.steps).flatMap((step) =>
    list(step?.pendingAwardChoices)
      .filter(isUnsettledChoice)
      .map((choice) => ({ step, choice }))
  );
  for (const { step, choice } of owed) {
    Object.assign(choice, { picks: [], settledAt: now, outcome: 'forfeited' });
    step.groupAwards = [...list(step.groupAwards), pickedGroupAward(choice, [])];
  }
  return owed.length > 0;
}

/** A history keeps its newest `limit` runs and every run still owing an award choice, which the
 *  cap does not count. */
export function trimRunHistory(history, limit) {
  let counted = 0;
  return list(history).filter((run) => {
    if (holdsUnsettledAwardChoice(run)) return true;
    counted += 1;
    return counted <= limit;
  });
}

/** The most a player may pick: one under `anyOne`, else min(N, member count). */
export const choiceCeiling = (choice) =>
  groupStrategy(choice) === 'anyOne' ? 1 : Math.min(choice.count, list(choice.alternatives).length);

/**
 * Why `picks` cannot settle `choice`, or `null`. Zero picks settle only a choice with no claimable
 * member; otherwise the picks are distinct members of the snapshot, claimable, and within the ceiling.
 */
export function awardPickRefusal(choice, picks, isClaimable) {
  if (!isUnsettledChoice(choice)) return 'This award choice is already settled';
  const members = new Map(list(choice.alternatives).map((member) => [member.id, member]));
  if (picks.some((id) => !members.has(id))) return 'A pick names no alternative of this choice';
  if (new Set(picks).size !== picks.length) return 'An alternative can be picked once';
  const claimable = [...members.values()].filter(isClaimable);
  if (picks.length === 0) return claimable.length > 0 ? 'Pick a reward to claim' : null;
  if (picks.length > choiceCeiling(choice)) return 'Too many rewards were picked';
  if (picks.some((id) => !isClaimable(members.get(id)))) return 'A picked reward cannot be claimed';
  return null;
}
