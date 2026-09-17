/**
 * Pure helpers for the Foundry smoke summary: the run's verdict (`passed`), its split signals
 * (`stepFailures`, `consoleErrorCount`, `degraded` — issue #628, task 2.1), the console-error
 * waiver those signals are computed behind, and their interpretation.
 */

/** Parse a comma-separated list of console-error waiver patterns into RegExps. */
export function parseAllowedConsoleErrorPatterns(csv) {
  if (!csv) return [];
  return String(csv)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((source) => {
      try {
        return new RegExp(source, 'i');
      } catch (error) {
        throw new Error(
          `invalid --allowed-console-error-patterns entry "${source}": ${error.message}`,
          { cause: error }
        );
      }
    });
}

/** Append caller-supplied waiver patterns to the in-source defaults — never replace them. */
export function appendAllowedConsoleErrorPatterns(defaults, csv) {
  return [...defaults, ...parseAllowedConsoleErrorPatterns(csv)];
}

/**
 * True when `text` matches any waiver pattern, i.e. the console error (or `pageerror` message) is
 * benign and must not enter the gate's `consoleErrors` list.
 */
export function isConsoleErrorWaived(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

/**
 * Route a captured `console` error or `pageerror` message: it is either waived (matches a pattern →
 * belongs in `waivedConsoleErrors`, never fails the run) or gating (→ belongs in `consoleErrors`).
 */
export function classifyCapturedError(text, patterns) {
  return { waived: isConsoleErrorWaived(text, patterns) };
}

/**
 * True when an error message is a transient browser/page teardown — the headless Chromium (or one
 * of its pages/contexts) being closed, disconnected, or crashed.
 */
export function isTransientPageTeardown(message) {
  return (
    typeof message === 'string' &&
    /has been closed|target closed|session closed|page crashed|has been disconnected|browser has disconnected/i.test(
      message
    )
  );
}

/**
 * The prefix stamped onto a smoke step's `error` when a transient renderer/page teardown is
 * tolerated (the step is recorded skipped rather than failed).
 */
export const TRANSIENT_TEARDOWN_SKIP_PREFIX = 'transient page teardown (skipped): ';

/** Decide whether a smoke step's error is a tolerable transient teardown. */
export function shouldTolerateSmokeTeardown({
  message,
  pageClosed,
  requiredCapturesComplete,
} = {}) {
  return (
    (Boolean(pageClosed) || isTransientPageTeardown(message)) && Boolean(requiredCapturesComplete)
  );
}

/** The split smoke signal, computed from the accumulated results. */
export function computeSmokeSignal(results) {
  const steps = Array.isArray(results?.steps) ? results.steps : [];
  const consoleErrors = Array.isArray(results?.consoleErrors) ? results.consoleErrors : [];
  return {
    stepFailures: steps.filter((step) => step?.passed === false).length,
    consoleErrorCount: consoleErrors.length,
    degraded: steps.some((step) => isToleratedTeardownStep(step)),
  };
}

/**
 * Render one smoke step record as the single line both the harness's terminal throw and the
 * screenshot-evidence gate's refusal quote it with.
 */
export function formatFailedStep(step) {
  return `${step?.step}: ${step?.error || 'failed'}`;
}

/** Decide the smoke run's terminal throw, mirroring the harness's final block. */
export function evaluateSmokeOutcome(results) {
  const steps = Array.isArray(results?.steps) ? results.steps : [];
  const consoleErrors = Array.isArray(results?.consoleErrors) ? results.consoleErrors : [];

  const failedSteps = steps.filter((step) => step?.passed === false);
  if (failedSteps.length > 0) {
    const summary = failedSteps.map((step) => formatFailedStep(step)).join('; ');
    const consoleNote =
      consoleErrors.length > 0
        ? ` (+${consoleErrors.length} runtime console error(s) captured)`
        : '';
    return {
      throws: true,
      reason: 'steps',
      message: `${failedSteps.length} step(s) failed: ${summary}${consoleNote}`,
    };
  }

  if (consoleErrors.length > 0) {
    return {
      throws: true,
      reason: 'console-errors',
      message: `${consoleErrors.length} runtime console error(s) captured.`,
    };
  }

  return { throws: false };
}

/**
 * True when a step record is a tolerated transient renderer/page teardown: the harness recorded it
 * `skipped` (not failed) and stamped its `error` with the shared prefix.
 */
function isToleratedTeardownStep(step) {
  return (
    step?.skipped === true &&
    typeof step?.error === 'string' &&
    step.error.startsWith(TRANSIENT_TEARDOWN_SKIP_PREFIX)
  );
}

/** How many evidence lines a single condition quotes before it truncates. */
const EVIDENCE_EXCERPT_CAP = 5;

/** Indents for a condition heading and for the evidence quoted beneath it. */
const CONDITION_INDENT = '  ';
const EVIDENCE_INDENT = CONDITION_INDENT.repeat(2);

function asEvidenceArray(value) {
  return Array.isArray(value) ? value : [];
}

/** What a condition's value reads as when the summary carried no measurement for it. */
const NOT_RECORDED = 'not recorded';

/** The note a condition carries when its value is `NOT_RECORDED`. */
const ABSENT_SIGNAL_NOTE =
  'the summary did not record this signal, so this run cannot be shown to have been clean';

/** A count's measured value, or `not recorded`. */
function describeCount(value) {
  return Number.isFinite(value) ? String(value) : NOT_RECORDED;
}

/** A flag's measured value, or `not recorded` when the summary did not carry a boolean. */
function describeFlag(value) {
  return typeof value === 'boolean' ? String(value) : NOT_RECORDED;
}

/**
 * Build one condition block, choosing its note by whether the summary actually recorded a value for
 * the condition.
 */
function describeCondition(name, value, recordedNote, evidence) {
  return {
    name,
    value,
    note: value === NOT_RECORDED ? ABSENT_SIGNAL_NOTE : recordedNote,
    evidence,
  };
}

/** Quote up to `EVIDENCE_EXCERPT_CAP` entries, or state that the summary carried none. */
function quoteEvidence(entries, emptyNote) {
  if (entries.length === 0) return [`${EVIDENCE_INDENT}${emptyNote}`];
  const shown = entries.slice(0, EVIDENCE_EXCERPT_CAP);
  const lines = shown.flatMap((entry) => {
    const [first, ...rest] = String(entry).split('\n');
    return [`${EVIDENCE_INDENT}- ${first}`, ...rest.map((line) => `${EVIDENCE_INDENT}  ${line}`)];
  });
  if (entries.length > shown.length) {
    lines.push(`${EVIDENCE_INDENT}(+${entries.length - shown.length} more)`);
  }
  return lines;
}

/** The four non-verdict conditions, each tested with the gate's own `!==` comparison. */
function collectSignalConditions(summary, steps, consoleErrors) {
  const conditions = [];
  if (summary?.stepFailures !== 0) {
    conditions.push(
      describeCondition(
        'stepFailures',
        describeCount(summary?.stepFailures),
        'one or more phase steps did not pass',
        quoteEvidence(
          steps.filter((step) => step?.passed === false).map((step) => formatFailedStep(step)),
          'the summary recorded no failing step for this condition'
        )
      )
    );
  }
  if (summary?.consoleErrorCount !== 0) {
    conditions.push(
      describeCondition(
        'consoleErrorCount',
        describeCount(summary?.consoleErrorCount),
        'un-waived runtime console errors reached the independent console gate',
        quoteEvidence(
          consoleErrors.map(String),
          'the summary recorded no un-waived console error for this condition'
        )
      )
    );
  }
  if (summary?.degraded !== false) {
    conditions.push(
      describeCondition(
        'degraded',
        describeFlag(summary?.degraded),
        // Not "so the run exited 0": a tolerated teardown co-occurring with a later step failure is
        // ordinary, and there the harness throws and the process exits non-zero.
        'a transient renderer/page teardown was tolerated; this condition alone does not fail a run, it marks a flake rather than a clean pass',
        quoteEvidence(
          steps
            .filter((step) => isToleratedTeardownStep(step))
            .map((step) => formatFailedStep(step)),
          'the summary recorded no tolerated-teardown step for this condition'
        )
      )
    );
  }
  if (summary?.rendererCrashed !== false) {
    conditions.push(
      describeCondition(
        'rendererCrashed',
        describeFlag(summary?.rendererCrashed),
        // Same reservation as `degraded`: the page `crash` listener flags the run, it does
        // not fail it, but a run carrying this flag may still have failed for another reason.
        'the page reported a renderer crash (canonically an OOM); this condition alone does not fail a run, it marks a flake rather than a clean pass',
        [
          `${EVIDENCE_INDENT}the page crash event has no per-step record to quote, so the summary carries no evidence beyond the flag itself`,
        ]
      )
    );
  }
  return conditions;
}

/**
 * The verdict condition. `passed` is not a smoke signal — issue #628 split the signals out of it —
 * so it gets its own block, and its evidence is the other conditions when any tripped.
 */
function describeVerdictCondition(summary, hasSignalConditions) {
  return {
    name: 'passed',
    value: describeFlag(summary?.passed),
    note: 'the run did not record a successful verdict',
    evidence: [
      hasSignalConditions
        ? `${EVIDENCE_INDENT}the verdict follows from the condition(s) below`
        : `${EVIDENCE_INDENT}the summary records no failing step, un-waived console error, tolerated teardown, or renderer crash to account for it — the shape of a run that aborted before its per-step gates ran`,
    ],
  };
}

// The producing command is named exactly, and it is the scoped `screenshots` profile with
// `--target-labels`, never the bare `npm run test:foundry`.
const ATTRIBUTION_PROCEDURE = [
  "Establishing whether this fault is already present at the pull request's base:",
  '  This gate reads one summary, and one summary carries no evidence of which head',
  '  produced what it recorded, so it cannot tell a fault this branch introduced from',
  '  one that was already there. To establish that, re-run at the merge base the SAME',
  '  scoped smoke that produced this summary — same profile, same target labels, or the',
  '  two runs are not comparable and this gate refuses the second one as well:',
  '    git merge-base HEAD origin/main',
  '    npm run --silent screenshots:ui:targets -- --base origin/main',
  '    cp -r test-results test-results-branch   # the base run overwrites test-results/ in place',
  '    git switch --detach <merge-base>',
  '    npm run test:foundry:screenshots -- --target-labels=<the labels printed above>',
  '    compare test-results/summary.json against test-results-branch/summary.json, then git switch -',
  '  One caveat on reading the base run: a label this branch ADDS does not exist at the merge',
  '  base, so the base run skips that phase entirely and captures nothing for it. A clean base',
  '  summary there means the base run never covered the fault, not that the base was clean.',
  '  As guidance for what to compare first: stepFailures 0 with consoleErrorCount above 0 is',
  '  more often ambient fixture-world noise already present at the base than a change-specific',
  '  regression. That is a prior about a class of summary, not a finding about this one.',
];

/**
 * Explain why a persisted smoke `summary.json` does not qualify as publishable screenshot evidence
 * (issue #1019).
 */
export function explainSmokeSummaryRefusal(summary) {
  const steps = asEvidenceArray(summary?.steps);
  const consoleErrors = asEvidenceArray(summary?.consoleErrors);
  const signalConditions = collectSignalConditions(summary, steps, consoleErrors);
  const conditions =
    summary?.passed === true
      ? signalConditions
      : [describeVerdictCondition(summary, signalConditions.length > 0), ...signalConditions];

  const lines = [
    'Screenshot evidence refused: the smoke summary does not qualify as publishable evidence.',
    '',
  ];
  if (conditions.length === 0) {
    // Unreachable from the gate, which calls this only after its predicate tripped.
    // Kept total rather than throwing, and worded so it can never read as a finding.
    lines.push(
      'No evidence condition tripped in this summary, so this refusal names nothing. Report it as a gate defect.'
    );
  } else {
    lines.push(`Disqualifying evidence conditions (${conditions.length} of 5):`);
    for (const condition of conditions) {
      lines.push(
        `${CONDITION_INDENT}${condition.name}: ${condition.value} — ${condition.note}`,
        ...condition.evidence
      );
    }
  }

  const waivedCount = asEvidenceArray(summary?.waivedConsoleErrors).length;
  if (waivedCount > 0) {
    lines.push(
      '',
      `The run also suppressed ${waivedCount} waived console error(s); a waived entry never disqualifies a run, and each is listed under waivedConsoleErrors in the summary.`
    );
  }

  lines.push('', ...ATTRIBUTION_PROCEDURE);
  return lines.join('\n');
}
