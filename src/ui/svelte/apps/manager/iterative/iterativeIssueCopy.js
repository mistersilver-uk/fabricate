/**
 * The Validation tab's words for the iterative readiness codes, with no local imports so the tab's
 * hand-listed test closure stays complete. `ITERATIVE_ISSUE_KEYS` is the one code-to-lang-key map,
 * its keys literal so the orphan scan sees them, and recipe issues of the same codes read it
 * too; `iterativeIssueSentence(issue, text)` resolves one issue through it, falling back to the
 * issue's own `message`. `overviewIssueGroup(issue)` names the group an issue is listed under.
 */

/** Each iterative readiness code's `SystemOverview` lang key; its English equals the headless message. */
export const ITERATIVE_ISSUE_KEYS = Object.freeze({
  iterativeNoCounters: 'FABRICATE.Admin.Manager.SystemOverview.IssueIterativeNoCounters',
  iterativeNoSuccessRule: 'FABRICATE.Admin.Manager.SystemOverview.IssueIterativeNoSuccessRule',
  iterativeUnknownCounter: 'FABRICATE.Admin.Manager.SystemOverview.IssueIterativeUnknownCounter',
  iterativeUnknownAction: 'FABRICATE.Admin.Manager.SystemOverview.IssueIterativeUnknownAction',
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
  return key ? text(key, issue.message || issue.code) : '';
}
