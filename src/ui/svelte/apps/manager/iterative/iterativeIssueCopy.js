/**
 * The Validation tab's words for the iterative readiness codes, with no local imports so the tab's
 * hand-listed test closure stays complete. `ITERATIVE_ISSUE_KEYS` is the one code-to-lang-key map,
 * its keys literal so the orphan scan sees them, and recipe issues of the same codes read it
 * too; `iterativeIssueSentence(issue, text)` resolves one issue through it, falling back to the
 * issue's own `message`, and through `ITERATIVE_ISSUE_NAMED_KEYS` when the issue names its counter
 * or action. `overviewIssueGroup(issue)` names the group an issue is listed under.
 */

/** Each iterative readiness code's `SystemOverview` lang key; its English equals the headless message. */
export const ITERATIVE_ISSUE_KEYS = Object.freeze({
  iterativeNoCounters: 'FABRICATE.Admin.Manager.SystemOverview.IssueIterativeNoCounters',
  iterativeNoSuccessRule: 'FABRICATE.Admin.Manager.SystemOverview.IssueIterativeNoSuccessRule',
  iterativeUnknownCounter: 'FABRICATE.Admin.Manager.SystemOverview.IssueIterativeUnknownCounter',
  iterativeUnknownAction: 'FABRICATE.Admin.Manager.SystemOverview.IssueIterativeUnknownAction',
  iterativeNoAllowedActions:
    'FABRICATE.Admin.Manager.SystemOverview.IssueIterativeNoAllowedActions',
  iterativeInvalidNumber: 'FABRICATE.Admin.Manager.SystemOverview.IssueIterativeInvalidNumber',
  iterativeBoundsInverted: 'FABRICATE.Admin.Manager.SystemOverview.IssueIterativeBoundsInverted',
  iterativeInvalidRule: 'FABRICATE.Admin.Manager.SystemOverview.IssueIterativeInvalidRule',
  iterativeInvalidEntry: 'FABRICATE.Admin.Manager.SystemOverview.IssueIterativeInvalidEntry',
  iterativeCheckUnavailable:
    'FABRICATE.Admin.Manager.SystemOverview.IssueIterativeCheckUnavailable',
  iterativeMultiStepOff: 'FABRICATE.Admin.Manager.SystemOverview.IssueIterativeMultiStepOff',
  iterativeSuccessLineOnFailureGroup:
    'FABRICATE.Admin.Manager.SystemOverview.IssueIterativeSuccessLineOnFailureGroup',
  iterativeFinalStepProducesNothing:
    'FABRICATE.Admin.Manager.SystemOverview.IssueIterativeFinalStepProducesNothing',
  iterativeUnknownCheckOutcome:
    'FABRICATE.Admin.Manager.SystemOverview.IssueIterativeUnknownCheckOutcome',
  iterativeVersionUnsupported:
    'FABRICATE.Admin.Manager.SystemOverview.IssueIterativeVersionUnsupported',
  iterativeInvalidExpression:
    'FABRICATE.Admin.Manager.SystemOverview.IssueIterativeInvalidExpression',
  iterativeExplodeUnbounded:
    'FABRICATE.Admin.Manager.SystemOverview.IssueIterativeExplodeUnbounded',
  iterativeExpressionBoundUnset:
    'FABRICATE.Admin.Manager.SystemOverview.IssueIterativeExpressionBoundUnset',
  iterativeCheckFactWithoutCheck:
    'FABRICATE.Admin.Manager.SystemOverview.IssueIterativeCheckFactWithoutCheck',
  iterativeStartOutOfBounds:
    'FABRICATE.Admin.Manager.SystemOverview.IssueIterativeStartOutOfBounds',
});

/** The codes whose sentence names the issue's counter (`{counter}`) or action (`{action}`), by `SystemOverview` lang key. */
export const ITERATIVE_ISSUE_NAMED_KEYS = Object.freeze({
  iterativeUnknownCounter:
    'FABRICATE.Admin.Manager.SystemOverview.IssueIterativeUnknownCounterNamed',
  iterativeInvalidNumber: 'FABRICATE.Admin.Manager.SystemOverview.IssueIterativeInvalidNumberNamed',
  iterativeBoundsInverted:
    'FABRICATE.Admin.Manager.SystemOverview.IssueIterativeBoundsInvertedNamed',
  iterativeStartOutOfBounds:
    'FABRICATE.Admin.Manager.SystemOverview.IssueIterativeStartOutOfBoundsNamed',
  iterativeExpressionBoundUnset:
    'FABRICATE.Admin.Manager.SystemOverview.IssueIterativeExpressionBoundUnsetNamed',
  iterativeUnknownAction: 'FABRICATE.Admin.Manager.SystemOverview.IssueIterativeUnknownActionNamed',
  iterativeCheckUnavailable:
    'FABRICATE.Admin.Manager.SystemOverview.IssueIterativeCheckUnavailableNamed',
});

const ACTION_NAMED_CODES = new Set(['iterativeUnknownAction', 'iterativeCheckUnavailable']);

/** The named sentence of `issue`, or `''` when it has no named key, no name, or the key does not resolve. */
function namedSentence(issue, text) {
  if (!Object.hasOwn(ITERATIVE_ISSUE_NAMED_KEYS, issue.code)) return '';
  const action = ACTION_NAMED_CODES.has(issue.code);
  const name = action ? issue.actionName : issue.counterName;
  if (typeof name !== 'string' || name === '') return '';
  const template = text(ITERATIVE_ISSUE_NAMED_KEYS[issue.code], '');
  return typeof template === 'string'
    ? template.split(action ? '{action}' : '{counter}').join(name)
    : '';
}

/** The Validation group of `issue`: its Counter or Crafting Action library entity, else its `kind`. */
export function overviewIssueGroup(issue) {
  const entityKind = issue?.entityKind;
  const libraryEntity =
    issue?.kind === 'system' && (entityKind === 'counter' || entityKind === 'action');
  return libraryEntity ? entityKind : issue?.kind;
}

/** The localized sentence for an iterative `issue`, or `''` when its code is not an iterative one. */
export function iterativeIssueSentence(issue, text) {
  const key = Object.hasOwn(ITERATIVE_ISSUE_KEYS, issue?.code)
    ? ITERATIVE_ISSUE_KEYS[issue.code]
    : '';
  if (!key) return '';
  return namedSentence(issue, text) || text(key, issue.message || issue.code);
}
