/**
 * Pure helpers for the Foundry smoke harness's console-error waiver and its
 * split pass/fail signal (issue #628, task 2.1).
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
 * defaults are written (e.g. `/reading 'OBJECTS'/`). Blank entries are dropped
 * so a trailing comma or an empty CSV yields no patterns.
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
 * replace them. The Foundry canvas-artefact default (`/reading 'OBJECTS'/`)
 * lives in source, where its justification lives, and MUST keep applying even
 * when `--allowed-console-error-patterns` is set.
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
    degraded: steps.some(
      (step) =>
        step?.skipped === true &&
        typeof step?.error === 'string' &&
        step.error.startsWith(TRANSIENT_TEARDOWN_SKIP_PREFIX)
    ),
  };
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
    const summary = failedSteps.map((step) => `${step.step}: ${step.error || 'failed'}`).join('; ');
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
