/**
 * Pure helpers for the Foundry smoke SUMMARY: the run's verdict (`passed`), its
 * split signals (`stepFailures`, `consoleErrorCount`, `degraded` — issue #628,
 * task 2.1), the console-error waiver those signals are computed behind, and
 * their interpretation.
 *
 * The filename is narrower than the contents, deliberately. The split signal is
 * one part of the summary, not the whole of it, and renaming the file would
 * churn the single-source pin in `tests/foundry-smoke-summary.test.js` that
 * keeps `TRANSIENT_TEARDOWN_SKIP_PREFIX` from being re-inlined in the harness.
 *
 * The charter covers BOTH sides of the summary (issue #1019). Everything here
 * was producer-side until `explainSmokeSummaryRefusal`, which reads a persisted
 * `summary.json` on behalf of a consumer — the PR screenshot-evidence gate in
 * `scripts/ui-pr-screenshot-evidence.mjs`. That widening is the point rather
 * than an accident: producer and consumer share one `formatFailedStep`, so the
 * gate's refusal quotes a failing step in byte-identical form to the harness's
 * own terminal throw and a contributor comparing the two reads one dialect.
 *
 * These are deliberately side-effect-free and import nothing from Playwright or
 * `foundry-test-run.mjs`. That harness runs `main()` (which launches Chromium)
 * on import, so `tests/foundry-smoke-summary.test.js` cannot import it directly;
 * it imports these helpers instead and exercises the same logic the harness runs.
 */

/**
 * Parse a comma-separated list of console-error waiver patterns into RegExps.
 *
 * Each non-blank, trimmed entry is compiled as a case-insensitive regular
 * expression source — matching how the in-source `ignoredErrorPatterns`
 * defaults are written (e.g. `/favicon/i`). Blank entries are dropped so a
 * trailing comma or an empty CSV yields no patterns.
 *
 * The CSV splits on `,`, so a pattern containing a literal comma (e.g.
 * `x{1,3}`) cannot be expressed — an accepted limitation of the flag format.
 *
 * An invalid regex source fails fast with a clear message naming the bad entry,
 * rather than letting `new RegExp` throw its raw `SyntaxError` at harness
 * startup where the offending pattern is not obvious.
 *
 * @param {string | undefined | null} csv
 * @returns {RegExp[]}
 * @throws {Error} when an entry is not a valid regular-expression source
 */
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

/**
 * APPEND caller-supplied waiver patterns to the in-source defaults — never
 * replace them. Each default (the favicon and minimum-resolution advisories)
 * lives in source, where its justification lives, and MUST keep applying even
 * when `--allowed-console-error-patterns` is set.
 *
 * Note what the defaults no longer include: a `/reading 'OBJECTS'/` canvas
 * waiver sat there until issue #1010, where it turned out to be masking a real
 * harness defect (a scene wait that resolved mid-draw) rather than a browser
 * artefact. Adding a default here is a decision to stop seeing a class of
 * error — justify it as such.
 *
 * @param {RegExp[]} defaults - the harness's in-source `ignoredErrorPatterns`
 * @param {string | undefined | null} csv - the `--allowed-console-error-patterns` value
 * @returns {RegExp[]} defaults first, then the parsed CSV patterns
 */
export function appendAllowedConsoleErrorPatterns(defaults, csv) {
  return [...defaults, ...parseAllowedConsoleErrorPatterns(csv)];
}

/**
 * True when `text` matches any waiver pattern, i.e. the console error (or
 * `pageerror` message) is benign and MUST NOT enter the gate's `consoleErrors`
 * list. Applies uniformly to `console` errors and `pageerror` entries, so a
 * `pageerror` remains waivable by a matching pattern — an existing capability.
 *
 * @param {string} text
 * @param {RegExp[]} patterns
 * @returns {boolean}
 */
export function isConsoleErrorWaived(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

/**
 * Route a captured `console` error or `pageerror` message: it is either waived
 * (matches a pattern → belongs in `waivedConsoleErrors`, never fails the run) or
 * gating (→ belongs in `consoleErrors`).
 *
 * This is the single seam BOTH capture handlers in `foundry-test-run.mjs` route
 * through, so a handler that ignores the predicate — waives a `pageerror`
 * unconditionally, never waives one, or pushes a waived error into the gating
 * list — cannot be expressed without diverging from `route.waived`.
 *
 * @param {string} text
 * @param {RegExp[]} patterns
 * @returns {{ waived: boolean }}
 */
export function classifyCapturedError(text, patterns) {
  return { waived: isConsoleErrorWaived(text, patterns) };
}

/**
 * True when an error message is a transient BROWSER/PAGE TEARDOWN — the headless Chromium
 * (or one of its pages/contexts) being closed, disconnected, or crashed. At the very END
 * of a long run (e.g. a final screenshot click as the browser is being torn down) this is
 * an INFRA hiccup, not a product failure.
 *
 * The harness already skips its flaky last (Journal) step on this class; the process-level
 * `unhandledRejection` guard reuses this predicate so a teardown promise that rejects AFTER
 * the run's verdict is recorded cannot flip an otherwise-PASSED smoke run to a non-zero
 * exit (the false red the beta publish hit). Anything not matching still fails fast.
 *
 * @param {unknown} message
 * @returns {boolean}
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
 * The prefix stamped onto a smoke step's `error` when a transient renderer/page
 * teardown is TOLERATED (the step is recorded skipped rather than failed). Both
 * harness writer sites — the Phase E Journal step and the Phase D0 manager walk —
 * stamp this exact prefix, and `computeSmokeSignal` matches on it to derive
 * `degraded`. Single-sourcing the constant means writer spelling and matcher
 * cannot silently drift apart and leave a tolerated run un-flagged.
 *
 * @type {string}
 */
export const TRANSIENT_TEARDOWN_SKIP_PREFIX = 'transient page teardown (skipped): ';

/**
 * Decide whether a smoke step's error is a TOLERABLE transient teardown.
 *
 * True only when the teardown class is present — the page/target is already gone
 * (`pageClosed`) OR the message is teardown-shaped (`isTransientPageTeardown`) —
 * AND every required capture already completed (`requiredCapturesComplete`). A
 * real (non-teardown) assertion failure returns false EVEN with
 * `requiredCapturesComplete: true`, so a genuine post-milestone failure is never
 * swallowed. Both the Phase E Journal step and the Phase D0 manager walk route
 * their tolerate-or-fail decision through this single predicate, so the two sites
 * cannot diverge on what counts as tolerable.
 *
 * @param {{ message?: unknown, pageClosed?: boolean, requiredCapturesComplete?: boolean }} [params]
 * @returns {boolean}
 */
export function shouldTolerateSmokeTeardown({
  message,
  pageClosed,
  requiredCapturesComplete,
} = {}) {
  return (
    (Boolean(pageClosed) || isTransientPageTeardown(message)) && Boolean(requiredCapturesComplete)
  );
}

/**
 * The split smoke signal, computed from the accumulated results.
 *
 * `stepFailures` counts failed steps; `consoleErrorCount` counts the NON-waived
 * console errors that reached `consoleErrors` (waived errors were filtered at
 * capture time and never appear here). A failing step with zero console errors
 * is therefore distinguishable from the inverse.
 *
 * `degraded` is true when any skipped step's `error` starts with
 * `TRANSIENT_TEARDOWN_SKIP_PREFIX` — i.e. a transient renderer/page teardown was
 * TOLERATED (recorded skipped, not failed). A degraded run still exits 0 but is
 * distinguishable in `summary.json`. Matching on the exported prefix constant
 * keeps this matcher in lockstep with the harness writer sites that stamp it.
 *
 * @param {{ steps?: Array<{ passed?: boolean, skipped?: boolean, error?: string }>, consoleErrors?: string[] }} results
 * @returns {{ stepFailures: number, consoleErrorCount: number, degraded: boolean }}
 */
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
 * Render ONE smoke step record as the single line both the harness's terminal
 * throw and the screenshot-evidence gate's refusal quote it with.
 *
 * The record's key is `step`, NOT `name` (`scripts/foundry-test-run.mjs:1655`,
 * `:1657`, and every other push site). Reading `name` here against a
 * hand-written `{ name: … }` fixture passes its own test and emits an empty
 * excerpt against a real `summary.json`, so the key is pinned by test.
 *
 * The `|| 'failed'` fallback matters for the same reason: a step recorded
 * `passed: false` with no `error` is reachable, and rendering it as
 * `step: undefined` would read as a harness defect rather than a step failure.
 *
 * @param {{ step?: string, error?: string }} step
 * @returns {string}
 */
export function formatFailedStep(step) {
  return `${step?.step}: ${step?.error || 'failed'}`;
}

/**
 * Decide the smoke run's terminal throw, mirroring the harness's final block.
 *
 * Step failures are checked FIRST and are NEVER waivable by any input — the
 * waiver only ever removes entries from `consoleErrors`, so a failed step throws
 * with `reason: 'steps'` regardless of the pattern set. A non-waived console
 * error throws only after steps are clean (`reason: 'console-errors'`). When
 * every captured console error matched a pattern, `consoleErrors` is empty and
 * the console-error throw is suppressed.
 *
 * Steps-first ordering is kept, but when a step fails AND runtime console errors
 * were also captured, the console-error COUNT is appended to the `reason:'steps'`
 * message. The steps-short-circuit would otherwise leave a nonzero
 * `consoleErrorCount` invisible behind the step failure; the independent
 * console-error gate below is unchanged.
 *
 * @param {{ steps?: Array<{ passed?: boolean, step?: string, error?: string }>, consoleErrors?: string[] }} results
 * @returns {{ throws: boolean, reason?: 'steps' | 'console-errors', message?: string }}
 */
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
 * True when a step record is a TOLERATED transient renderer/page teardown: the
 * harness recorded it `skipped` (not failed) and stamped its `error` with the
 * shared prefix. This is the evidence behind `degraded`, so `computeSmokeSignal`
 * and the refusal builder read it through one predicate rather than each
 * re-spelling the prefix match.
 *
 * @param {{ skipped?: boolean, error?: unknown }} step
 * @returns {boolean}
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

/**
 * The note a condition carries when its value is `NOT_RECORDED`.
 *
 * It states the only thing such a summary supports — that the signal is missing,
 * which is itself disqualifying — and asserts nothing about what the run did.
 */
const ABSENT_SIGNAL_NOTE =
  'the summary did not record this signal, so this run cannot be shown to have been clean';

/**
 * A count's measured value, or `not recorded`.
 *
 * An absent or non-numeric count trips the gate's `!== 0` comparison, and it is
 * exactly what a stale or truncated `summary.json` produces. Rendering it as
 * `0` would print a refusal whose own stated value is an accepting one.
 */
function describeCount(value) {
  return Number.isFinite(value) ? String(value) : NOT_RECORDED;
}

/** A flag's measured value, or `not recorded` when the summary did not carry a boolean. */
function describeFlag(value) {
  return typeof value === 'boolean' ? String(value) : NOT_RECORDED;
}

/**
 * Build ONE condition block, choosing its note by whether the summary actually
 * RECORDED a value for the condition.
 *
 * `recordedNote` states what a measurement MEANS, so it is true only once there is
 * a measurement. Pairing it with `not recorded` asserts as observed the very thing
 * that went unobserved — `rendererCrashed: not recorded — the page reported a
 * renderer crash (canonically an OOM)` — which is the same defect as a note
 * asserting an exit code the summary does not carry, one level down. An absent key
 * still trips the gate's `!==` comparison, so the block is still emitted and the
 * evidence is unchanged; only the note narrows to what the summary can support.
 *
 * @param {string} name
 * @param {string} value - already rendered by `describeCount`/`describeFlag`
 * @param {string} recordedNote - the note for a value the summary did record
 * @param {string[]} evidence
 * @returns {{ name: string, value: string, note: string, evidence: string[] }}
 */
function describeCondition(name, value, recordedNote, evidence) {
  return {
    name,
    value,
    note: value === NOT_RECORDED ? ABSENT_SIGNAL_NOTE : recordedNote,
    evidence,
  };
}

/**
 * Quote up to `EVIDENCE_EXCERPT_CAP` entries, or state that the summary carried
 * none. A condition that names a flag and then falls silent is the failure mode
 * this whole diagnostic exists to remove, so the empty case is never empty.
 *
 * An entry may itself be multi-line — a step `error` carrying a stack, say — so
 * every continuation line is indented past the `- ` bullet. Left flush it would
 * read as a sibling of the condition headings, and anything parsing those
 * headings back out (the suite's own oracle does) would count it as one.
 */
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

/**
 * The four NON-VERDICT conditions, each tested with the gate's own `!==`
 * comparison.
 *
 * The comparisons are copied literally rather than paraphrased. Anything looser
 * — `> 0` for a count, truthiness for a flag — lets the builder refuse while
 * naming nothing, which is strictly worse than the ten-word message it replaces.
 */
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
        // NOT "so the run exited 0": a tolerated teardown co-occurring with a later step
        // failure is ordinary, and there the harness throws and the process exits non-zero.
        // The note states what this condition ALONE does, which is true in both cases.
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
 * The VERDICT condition. `passed` is not a smoke signal — issue #628 split the
 * signals OUT of it — so it gets its own block, and its evidence is the other
 * conditions when any tripped.
 *
 * When none did, the summary is an early phase abort (the harness's outer catch
 * writes `passed: false` before any per-step gate ran). Naming the verdict and
 * stopping there would reproduce the class-of-fault message this replaces, so
 * that case states what the summary does NOT contain.
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

// The producing command is named exactly, and it is the SCOPED `screenshots` profile with
// `--target-labels`, never the bare `npm run test:foundry`. This gate only ever reads a
// summary that profile wrote (`package.json` binds `test:foundry` to the default/full
// profile; the documented producer is `test:foundry:screenshots --target-labels=…` ->
// `collect`). Sending the reader to the full profile would cost them a longer run whose
// artifact this same function's caller then refuses for a mismatched target-label set —
// a wrong instruction inside a diagnostic that exists to save twenty-five minutes.
// The labels are derived on the branch BEFORE detaching, because at the merge base the
// changed-file set that produces them is empty.
// The copy-aside is not housekeeping either: the base run writes `test-results/` in place,
// so without it the branch artifacts this procedure asks the reader to compare against —
// the summary AND its captured PNGs — are destroyed by step 5 of the procedure that asks
// for the comparison, and re-obtaining them costs another twenty-five-minute run.
// The absent-label caveat covers the normal case for this gate, a pull request that ADDS a
// view: those labels do not exist at the merge base, `SCREENSHOT_SCOPING_ACTIVE` skips
// every phase whose labels are all off-target, and the base run then produces a
// clean-looking summary that says nothing at all about the fault.
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
 * Explain why a persisted smoke `summary.json` does not qualify as publishable
 * screenshot evidence (issue #1019).
 *
 * The screenshot-evidence gate refuses on five conditions and used to report all
 * five with one ten-word sentence, quoting none of the evidence it had just
 * read. This names each condition that tripped WITH the value it measured,
 * quotes a bounded excerpt of what the summary recorded for it, and states the
 * attribution procedure the gate itself cannot perform.
 *
 * It reports LEGIBILITY, never detection: it does not and cannot establish
 * whether the fault it is describing predates the branch.
 *
 * Multi-line by design. Its one caller prints it through `console.error` with no
 * `::error::` annotation, so embedded newlines survive to the terminal intact.
 *
 * @param {{ passed?: unknown, stepFailures?: unknown, consoleErrorCount?: unknown,
 *           degraded?: unknown, rendererCrashed?: unknown, steps?: unknown,
 *           consoleErrors?: unknown, waivedConsoleErrors?: unknown }} [summary]
 * @returns {string}
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
