/**
 * The described step's Iterative Attempts, newest first, each with what it checked, paid and
 * changed. A delta on a counter this viewer may not see is left out, and a check rolled privately
 * reads as such.
 */
import { arrayOrEmpty } from '../../../utils/scalars.js';

import { deltaText } from './iterativeCards.js';
import { commaText } from './iterativeRuleText.js';

const K = Object.freeze({
  check: 'FABRICATE.App.Journal.Iterative.Sessions.Check',
  noCheck: 'FABRICATE.App.Journal.Iterative.Card.NoCheck',
  private: 'FABRICATE.App.Journal.Iterative.Ledger.CheckPrivate',
  noPaid: 'FABRICATE.App.Journal.Iterative.Sessions.NoPaid',
  nothing: 'FABRICATE.App.Journal.Iterative.Sessions.Nothing',
  success: 'FABRICATE.Check.Evidence.Success',
  failure: 'FABRICATE.Check.Evidence.Failure',
});

/** Each routed tier's name by outcome id, from a check config's fixed and relative outcomes. */
export function outcomeNames(craftingCheck) {
  const routed = craftingCheck?.routed;
  return new Map(
    [...arrayOrEmpty(routed?.fixedOutcomes), ...arrayOrEmpty(routed?.relativeOutcomes)]
      .filter((entry) => typeof entry?.id === 'string' && typeof entry?.name === 'string')
      .map((entry) => [entry.id, entry.name])
  );
}

/** A check's outcome label: its routed tier's name, else the shipped Success or Failure. */
export const outcomeLabel = (check, outcomes, localize) =>
  outcomes.get(check?.outcomeId) ?? localize(check?.success ? K.success : K.failure);

/** What the CHECK reading says: private, none, or "{outcome} · {value}" in its tone. */
export function checkReading(check, { rolls, privately, outcomes, localize }) {
  if (privately || (check == null && rolls)) {
    return { text: localize(K.private), tone: null, private: true };
  }
  if (check == null) return { text: localize(K.noCheck), tone: null, private: false };
  const outcome = outcomeLabel(check, outcomes, localize);
  return {
    text: localize(K.check, { outcome, value: check.value }),
    tone: check.success ? 'positive' : 'warning',
    private: false,
  };
}

/** The deltas on counters this viewer may see, each worded "{counter} +{n}" or "{counter} −{n}". */
export function deltaChips(deltas, { labels, localize }) {
  return arrayOrEmpty(deltas)
    .filter((row) => labels.counter(row?.counterId) && Number(row.delta) !== 0)
    .map(({ counterId, delta }) => ({
      counterId,
      delta,
      label: deltaText(
        delta > 0 ? 'add' : 'subtract',
        labels.counter(counterId),
        Math.abs(delta),
        localize
      ),
    }));
}

function sessionRow(entry, context) {
  const { labels, localize, actionRolls } = context;
  const paid = deltaChips(entry.paid, context);
  const changed = deltaChips(entry.changed, context);
  return {
    attempt: entry.attempt,
    sessionNumber: entry.sessionNumber ?? null,
    requestId: entry.requestId ?? null,
    actionId: entry.actionId,
    action: labels.action(entry.actionId) ?? entry.actionId,
    check: checkReading(entry.check, { ...context, rolls: actionRolls(entry.actionId) }),
    paid,
    paidText:
      paid.length > 0
        ? commaText(
            paid.map((chip) => chip.label),
            localize
          )
        : localize(K.noPaid),
    changed,
    changedText:
      changed.length > 0
        ? commaText(
            changed.map((chip) => chip.label),
            localize
          )
        : localize(K.nothing),
  };
}

/**
 * The step's logged attempts, newest first. `context` holds the viewer's `labels`,
 * `actionRolls(actionId)`, the routed `outcomes`, whether every check reads `privately`, and
 * `localize`.
 */
export function sessionRows(state, context) {
  return arrayOrEmpty(state?.log)
    .toReversed()
    .map((entry) => sessionRow(entry, context));
}
