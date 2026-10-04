/**
 * The Journal's reading of a crafting run's award choices (issue 1773): the picks it still owes,
 * each alternative as this viewer may name it and whether it can be claimed now, a settle that
 * stopped part-way, and whether this viewer may send `chooseAward`.
 */
import {
  choiceCeiling,
  groupEvidenceFields,
  groupStrategy,
  isUnsettledChoice,
} from '../../systems/choiceGroupAward.js';
import { historyEvidenceFields } from '../../systems/runHistoryEvidence.js';
import { STAGE_BLOCKERS } from '../../systems/stageReadiness.js';

import { resultOutputRows } from './resultOutputRows.js';

const list = (value) => (Array.isArray(value) ? value : []);
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
 * with a claimable alternative, the predicate the engine's stage start refuses on.
 */
export function awardHeldAvailability(availability, run, unclaimable) {
  const held = owedAwardChoices(run).some(({ choice }) =>
    list(choice.alternatives).some((member) => !unclaimable(member))
  );
  return held ? { ...availability, blocker: STAGE_BLOCKERS.award } : availability;
}

/** A settle whose plan persisted before it finished: its request and picks, to send again. */
function resumableSettle(run) {
  const journal = run?.awardChoiceJournal;
  if (journal?.status !== 'planned') return null;
  const planned = list(journal.effects).find((effect) => effect?.effectId === 'award-choice');
  return {
    requestId: journal.requestId,
    choiceId: planned?.planned?.choiceId ?? journal.intent?.choiceId ?? null,
    picks: list(planned?.planned?.picks),
  };
}

/** Why this viewer may not settle now, or `null`; a non-owner reads the tiles and sends nothing. */
function settleBlocker({ run, owner, authority }) {
  if (!owner) return 'notOwner';
  if (authority?.available === false) return authority.reason || 'authorityUnavailable';
  const recovery = [run?.executionJournal, run?.awardChoiceJournal].some(
    (journal) => journal?.status === 'recoveryRequired'
  );
  if (recovery) return 'recoveryRequired';
  return run?.executionJournal?.status === 'planned' ? 'executionInProgress' : null;
}

/** One owed choice for the award face: its alternatives named for this viewer, with the reason
 *  any of them cannot be claimed now. */
function choiceModel({ stepIndex, choice }, { describe, unclaimable, resume }) {
  const members = list(choice.alternatives);
  const rows = resultOutputRows([{ results: members }], describe);
  const alternatives = members.map((member, index) => ({
    id: member.id,
    kind: member.kind ?? 'component',
    name: rows[index]?.name ?? '',
    img: rows[index]?.img ?? null,
    glyph: rows[index]?.glyph ?? null,
    quantity: Number(member.quantity) || 1,
    quantityFormula: member.quantityFormula ?? null,
    amountText: rows[index]?.amountText ?? null,
    unclaimable: unclaimable(member),
  }));
  return {
    choiceId: choice.choiceId,
    stepIndex,
    awardStrategy: groupStrategy(choice),
    count: choice.count,
    countRoll: choice.countRoll ?? null,
    ceiling: choiceCeiling(choice),
    alternatives,
    resume: resume?.choiceId === choice.choiceId ? resume : null,
  };
}

/**
 * A crafting run's award fields for this viewer: whether it still owes a pick, the choices the
 * face draws (none for a viewer not entitled to the run's evidence), and the `chooseAward` and
 * `dismiss` actions with the reason a settle is withheld. `describe` is `resultOutputRows`' options.
 */
export function awardChoiceFields({
  run,
  actions,
  owner,
  entitled,
  authority,
  describe,
  unclaimable,
}) {
  const owed = owedAwardChoices(run);
  if (owed.length === 0) return {};
  const blocker = settleBlocker({ run, owner, authority });
  const resume = resumableSettle(run);
  return {
    awardChoicePending: true,
    awardChoices: entitled
      ? owed.map((entry) => choiceModel(entry, { describe, unclaimable, resume }))
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
