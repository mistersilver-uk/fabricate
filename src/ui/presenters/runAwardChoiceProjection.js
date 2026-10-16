/**
 * The Journal's reading of a crafting run's award choices (issue 1773): the picks it still owes,
 * each alternative as this viewer may name it and whether it can be claimed now, and whether this
 * viewer may send `chooseAward`.
 */
import {
  choiceCeiling,
  groupEvidenceFields,
  groupStrategy,
  isUnsettledChoice,
  owesClaimablePick,
} from '../../systems/choiceGroupAward.js';
import { historyEvidenceFields } from '../../systems/runHistoryEvidence.js';
import { STAGE_BLOCKERS } from '../../systems/stageReadiness.js';
import { arrayOrEmpty as list } from '../../utils/scalars.js';

import { resultOutputRows } from './resultOutputRows.js';

const IN_FLIGHT = Object.freeze(['planned', 'recoveryRequired']);

/** The run's award-choice journal while its settle is unfinished, else `null`. */
export function inFlightAwardJournal(run) {
  const journal = run?.awardChoiceJournal;
  return IN_FLIGHT.includes(journal?.status) ? journal : null;
}

/** Every choice the run still owes, with the stage that owes it, in stage order. */
export function owedAwardChoices(run) {
  return list(run?.steps).flatMap((step, stepIndex) =>
    list(step?.pendingAwardChoices)
      .filter(isUnsettledChoice)
      .map((choice) => ({ stepIndex, choice }))
  );
}

/**
 * The current stage's readiness, held by `awardChoicePending` while an earlier stage owes a pick
 * with a claimable alternative, the predicate the engine's stage start refuses on. `claimability`
 * answers the settle's own `unclaimable(member)` and is asked only of a run that owes a pick.
 */
export function awardHeldAvailability(availability, run, claimability) {
  const held = owesClaimablePick(run, claimability);
  return held ? { ...availability, blocker: STAGE_BLOCKERS.award } : availability;
}

/**
 * Why this viewer may not settle now, or `null`: a non-owner reads the tiles and sends nothing, a
 * viewer not entitled to the run's evidence is shown none, and one settle runs at a time.
 */
function settleBlocker({ run, owner, entitled, authority }) {
  if (!owner) return 'notOwner';
  if (!entitled) return 'notEntitled';
  if (authority?.available === false) return authority.reason || 'authorityUnavailable';
  const journals = [run?.executionJournal, run?.awardChoiceJournal];
  if (journals.some((journal) => journal?.status === 'recoveryRequired')) return 'recoveryRequired';
  if (journals.some((journal) => journal?.status === 'planned')) return 'executionInProgress';
  return null;
}

/** An alternative's name for this viewer: a taught recipe it may not read is one not learned. */
function alternativeName(member, row, { describe, unclaimable }) {
  const unseenRecipe =
    member.kind === 'knowledge' &&
    unclaimable !== 'recipeMissing' &&
    !describe.taughtName?.(member.recipeId);
  if (!unseenRecipe) return row?.name ?? '';
  return describe.localize('FABRICATE.App.Journal.AwardChoice.UnlearnedRecipe');
}

/** One owed choice for the award face: its alternatives named for this viewer, with the reason
 *  any of them cannot be claimed now. */
function choiceModel({ stepIndex, choice }, { describe, unclaimable }) {
  const members = list(choice.alternatives);
  const rows = resultOutputRows([{ results: members }], describe);
  const alternatives = members.map((member, index) => {
    const reason = unclaimable(member);
    return {
      id: member.id,
      kind: member.kind ?? 'component',
      name: alternativeName(member, rows[index], { describe, unclaimable: reason }),
      img: rows[index]?.img ?? null,
      glyph: rows[index]?.glyph ?? null,
      quantity: Number(member.quantity) || 1,
      quantityFormula: member.quantityFormula ?? null,
      amountText: rows[index]?.amountText ?? null,
      unclaimable: reason,
    };
  });
  return {
    choiceId: choice.choiceId,
    stepIndex,
    awardStrategy: groupStrategy(choice),
    count: choice.count,
    countRoll: choice.countRoll ?? null,
    ceiling: choiceCeiling(choice),
    alternatives,
  };
}

/**
 * A crafting run's award fields for this viewer: whether it still owes a pick, the choices the
 * face draws (none for a viewer not entitled to the run's evidence), and the `chooseAward` and
 * `dismiss` actions with the reason a settle is withheld. `describe` is `resultOutputRows`'
 * options, and `claimability()`, asked only of a run that owes a pick, the settle's own rule.
 */
export function awardChoiceFields({
  run,
  actions,
  owner,
  entitled,
  authority,
  describe,
  claimability,
}) {
  const owed = owedAwardChoices(run);
  if (owed.length === 0) return { awardChoicePending: false };
  const blocker = settleBlocker({ run, owner, entitled, authority });
  const unclaimable = entitled ? claimability() : null;
  return {
    awardChoicePending: true,
    awardChoices: entitled
      ? owed.map((entry) => choiceModel(entry, { describe, unclaimable }))
      : [],
    awardChoiceBlocker: blocker,
    actions: {
      ...actions,
      chooseAward: blocker === null,
      dismiss: actions?.dismiss === true && run?.awardChoiceJournal?.status === 'recoveryRequired',
    },
  };
}

/** A crafting step's reward and group evidence as persisted: credits, grants, group awards and
 *  pending choices, each absent on a step that recorded none. */
export const stepAwardEvidence = (step) => ({
  ...historyEvidenceFields(step),
  ...groupEvidenceFields(step),
});
