import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parseAllowedConsoleErrorPatterns,
  appendAllowedConsoleErrorPatterns,
  isConsoleErrorWaived,
  classifyCapturedError,
  computeSmokeSignal,
  evaluateSmokeOutcome,
  isTransientPageTeardown,
} from '../scripts/lib/foundrySmokeSignal.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HARNESS_PATH = join(__dirname, '..', 'scripts', 'foundry-test-run.mjs');

// The in-source Foundry canvas-artefact default the harness always ships with.
const OBJECTS_DEFAULT = /reading 'OBJECTS'/;

// ── The split smoke signal ────────────────────────────────────────────────

test('computeSmokeSignal reports stepFailures and consoleErrorCount', () => {
  const signal = computeSmokeSignal({
    steps: [
      { step: 'a', passed: true },
      { step: 'b', passed: false, error: 'boom' },
      { step: 'c', passed: false },
    ],
    consoleErrors: ['x', 'y'],
  });
  assert.equal(signal.stepFailures, 2);
  assert.equal(signal.consoleErrorCount, 2);
});

test('a failing step with zero console errors is distinguishable from the inverse', () => {
  const failedStepOnly = computeSmokeSignal({
    steps: [{ step: 'a', passed: false, error: 'boom' }],
    consoleErrors: [],
  });
  assert.deepEqual(failedStepOnly, { stepFailures: 1, consoleErrorCount: 0 });

  const consoleErrorOnly = computeSmokeSignal({
    steps: [{ step: 'a', passed: true }],
    consoleErrors: ['a runtime error'],
  });
  assert.deepEqual(consoleErrorOnly, { stepFailures: 0, consoleErrorCount: 1 });

  // The two states are numerically distinct — a gate can tell them apart.
  assert.notDeepEqual(failedStepOnly, consoleErrorOnly);
});

test('computeSmokeSignal populates from partial results (an early phase abort)', () => {
  // An early abort leaves `steps` short but `consoleErrors` already captured.
  // The finally block still computes both from whatever is present.
  const signal = computeSmokeSignal({
    steps: [{ step: 'navigate-setup', passed: true }],
    consoleErrors: ['early failure captured before the run aborted'],
  });
  assert.equal(signal.stepFailures, 0);
  assert.equal(signal.consoleErrorCount, 1);

  // Robust even when fields are entirely absent (never throws, never undefined).
  assert.deepEqual(computeSmokeSignal({}), { stepFailures: 0, consoleErrorCount: 0 });
});

// ── The appendable waiver ─────────────────────────────────────────────────

test('parseAllowedConsoleErrorPatterns splits CSV, drops blanks, compiles regexes', () => {
  assert.deepEqual(parseAllowedConsoleErrorPatterns(''), []);
  assert.deepEqual(parseAllowedConsoleErrorPatterns(undefined), []);

  const patterns = parseAllowedConsoleErrorPatterns('benign-widget, ,another benign');
  assert.equal(patterns.length, 2);
  assert.ok(patterns[0] instanceof RegExp);
  assert.ok(patterns[0].test('a BENIGN-WIDGET error')); // case-insensitive
  assert.ok(patterns[1].test('another benign thing'));
});

test('parseAllowedConsoleErrorPatterns fails fast on a malformed pattern, naming the bad entry', () => {
  // A raw `new RegExp` SyntaxError at harness startup does not name the offending
  // source; the helper wraps it so the bad entry is obvious in CI.
  assert.throws(
    () => parseAllowedConsoleErrorPatterns('good one, bad(paren'),
    (err) => {
      assert.match(err.message, /invalid --allowed-console-error-patterns entry "bad\(paren"/);
      return true;
    }
  );
});

test('--allowed-console-error-patterns APPENDS to the in-source defaults, never replaces them', () => {
  const combined = appendAllowedConsoleErrorPatterns([OBJECTS_DEFAULT], 'my-benign-pattern');

  // The appended pattern is honoured...
  assert.ok(isConsoleErrorWaived('saw my-benign-pattern in the log', combined));
  // ...AND the Foundry canvas-artefact default STILL applies with the flag set.
  assert.ok(isConsoleErrorWaived("Cannot read properties of undefined (reading 'OBJECTS')", combined));

  // Defaults come first, then the CSV patterns; nothing is dropped.
  assert.equal(combined.length, 2);
  assert.equal(combined[0], OBJECTS_DEFAULT);
});

test('an unrelated error is still gating even with a waiver pattern set', () => {
  const combined = appendAllowedConsoleErrorPatterns([OBJECTS_DEFAULT], 'my-benign-pattern');
  assert.equal(isConsoleErrorWaived('a real Fabricate regression', combined), false);
});

test('a pageerror is waivable by a matching pattern and NOT by a non-matching one', () => {
  // The pageerror handler tests err.message against the same pattern set, so a
  // matching appended pattern waives it — the deliberate existing capability.
  const waived = appendAllowedConsoleErrorPatterns([OBJECTS_DEFAULT], 'benign lifecycle glitch');
  assert.ok(isConsoleErrorWaived('benign lifecycle glitch during teardown', waived));

  // A non-matching pattern does not waive it.
  const nonMatching = appendAllowedConsoleErrorPatterns([OBJECTS_DEFAULT], 'some other thing');
  assert.equal(isConsoleErrorWaived('benign lifecycle glitch during teardown', nonMatching), false);

  // And the always-present OBJECTS default waives the Foundry canvas pageerror
  // even with no CLI patterns supplied.
  const defaultsOnly = appendAllowedConsoleErrorPatterns([OBJECTS_DEFAULT], '');
  assert.ok(isConsoleErrorWaived("Cannot read properties of undefined (reading 'OBJECTS')", defaultsOnly));
});

// ── Throw order: steps first, and no input waives a step failure ──────────

test('the step-failure throw precedes the console-error throw', () => {
  const outcome = evaluateSmokeOutcome({
    steps: [{ step: 'craft-item-phase', passed: false, error: 'craft failed' }],
    consoleErrors: ['a runtime console error too'],
  });
  assert.equal(outcome.throws, true);
  assert.equal(outcome.reason, 'steps'); // steps win over console errors
  assert.match(outcome.message, /step\(s\) failed/);
});

test('a console error throws only once steps are clean', () => {
  const outcome = evaluateSmokeOutcome({
    steps: [{ step: 'a', passed: true }],
    consoleErrors: ['a runtime console error'],
  });
  assert.equal(outcome.throws, true);
  assert.equal(outcome.reason, 'console-errors');
});

test('no input waives a step failure — an all-waived console list still throws on the step', () => {
  // Model the full pipeline: the waiver removed every console error (consoleErrors
  // is empty because all matched a pattern), yet a step failed. The run MUST still
  // throw, and with reason 'steps' — the waiver cannot rescue a failed step.
  const patterns = appendAllowedConsoleErrorPatterns([OBJECTS_DEFAULT], 'everything is benign');
  const capturedButAllWaived = ['everything is benign here', "reading 'OBJECTS'"];
  const gatingConsoleErrors = capturedButAllWaived.filter((text) => !isConsoleErrorWaived(text, patterns));
  assert.deepEqual(gatingConsoleErrors, []); // all waived → nothing gates on console

  const outcome = evaluateSmokeOutcome({
    steps: [{ step: 'create-crafting-system', passed: false, error: 'boom' }],
    consoleErrors: gatingConsoleErrors,
  });
  assert.equal(outcome.throws, true);
  assert.equal(outcome.reason, 'steps');
});

test('a clean run with all console errors waived does not throw', () => {
  const patterns = appendAllowedConsoleErrorPatterns([OBJECTS_DEFAULT], 'benign');
  const captured = ['a benign thing', "reading 'OBJECTS'"];
  const gating = captured.filter((text) => !isConsoleErrorWaived(text, patterns));
  const outcome = evaluateSmokeOutcome({
    steps: [{ step: 'a', passed: true }],
    consoleErrors: gating,
  });
  assert.equal(outcome.throws, false);
});

// ── The shared capture-routing seam (both handlers go through it) ─────────

test('classifyCapturedError routes a matching error to waived and a non-matching one to gating', () => {
  const patterns = appendAllowedConsoleErrorPatterns([OBJECTS_DEFAULT], 'benign lifecycle glitch');

  // The Foundry canvas-artefact default and an appended pattern both waive.
  assert.deepEqual(classifyCapturedError("reading 'OBJECTS' blew up", patterns), { waived: true });
  assert.deepEqual(classifyCapturedError('benign lifecycle glitch here', patterns), { waived: true });

  // A real regression is gating.
  assert.deepEqual(classifyCapturedError('a real Fabricate regression', patterns), { waived: false });
});

test('classifyCapturedError routes identically regardless of console-vs-pageerror origin', () => {
  // Both handlers feed the SAME classifier, so a pageerror message and a console
  // error text with the same content route the same way — pageerror stays waivable.
  const patterns = appendAllowedConsoleErrorPatterns([OBJECTS_DEFAULT], 'shared benign');
  const text = 'shared benign teardown noise';
  assert.equal(classifyCapturedError(text, patterns).waived, true);

  const nonMatching = appendAllowedConsoleErrorPatterns([OBJECTS_DEFAULT], 'something else');
  assert.equal(classifyCapturedError(text, nonMatching).waived, false);
});

// Source contract: assert BOTH capture handlers route through the shared
// classifier and push to the GATING consoleErrors list only on the not-waived
// branch. This is the backstop for three mutations that pass the pure-helper
// tests but break routing (a pageerror that skips the waiver / waives
// unconditionally, or a console handler that pushes waived errors into the
// gating list). It is an INTENTIONAL literal coupling to the handler spelling —
// a benign rename of these tokens will false-fail it, by design.
test('both attachConsoleCapture handlers route through classifyCapturedError, gating only on not-waived', async () => {
  const source = await readFile(HARNESS_PATH, 'utf8');

  // Isolate the attachConsoleCapture body so the assertions cannot be satisfied
  // by matching tokens elsewhere in the harness.
  const fnStart = source.indexOf('function attachConsoleCapture(');
  assert.ok(fnStart > 0, 'expected attachConsoleCapture in the harness');
  const fnEnd = source.indexOf('\nasync function assertNoScreenshotOverlays', fnStart);
  assert.ok(fnEnd > fnStart, 'expected to bound the attachConsoleCapture body');
  const body = source.slice(fnStart, fnEnd);

  // Exactly two call sites — one per handler; no third path may bypass the seam.
  const callSites = body.match(/classifyCapturedError\(/g) ?? [];
  assert.equal(callSites.length, 2, 'both handlers (and only they) must call classifyCapturedError');

  // ── console handler: condition + branch routing ──
  const consoleBlockStart = body.indexOf("if (msg.type() === 'error')");
  const consoleBlockEnd = body.indexOf("page.on('pageerror'", consoleBlockStart);
  assert.ok(consoleBlockStart > 0 && consoleBlockEnd > consoleBlockStart, 'expected the console handler block');
  const consoleBlock = body.slice(consoleBlockStart, consoleBlockEnd);
  // Routes on the classifier's .waived, not a constant. Catches "console never
  // consults the waiver".
  assert.match(consoleBlock, /if \(classifyCapturedError\(text, ignoredErrorPatterns\)\.waived\)/);
  // Waived branch first (audit list), gating push in the else branch. Catches
  // "console pushes WAIVED errors into the gating consoleErrors list".
  const cWaived = consoleBlock.indexOf('waivedConsoleErrors.push(text)');
  const cGating = consoleBlock.indexOf('consoleErrors.push(text)');
  assert.ok(cWaived > 0 && cGating > cWaived, 'console handler must gate only on the not-waived (else) branch');

  // ── pageerror handler: condition + branch routing ──
  const pageBlockStart = body.indexOf("page.on('pageerror'");
  const pageBlock = body.slice(pageBlockStart);
  // Routes on classifier .waived over err.message. Catches BOTH "pageerror skips
  // the waiver (if(false))" and "pageerror waives unconditionally (if(true))" —
  // either replaces this exact condition.
  assert.match(pageBlock, /if \(classifyCapturedError\(err\.message, ignoredErrorPatterns\)\.waived\)/);
  const pWaived = pageBlock.indexOf('waivedConsoleErrors.push(`pageerror:');
  const pGating = pageBlock.indexOf('consoleErrors.push(`pageerror:');
  assert.ok(pWaived > 0 && pGating > pWaived, 'pageerror handler must gate only on the not-waived (else) branch');
});

// ── Source contract: the signal is written from the finally block ─────────

test('stepFailures/consoleErrorCount are assigned in the finally block, beside results.consoleErrors', async () => {
  const source = await readFile(HARNESS_PATH, 'utf8');

  // NOTE: this is an INTENTIONAL literal coupling to the harness spelling
  // (`results.consoleErrors = consoleErrors;`, `} finally {`, the summary path).
  // A benign refactor that renames those exact tokens will false-fail this test
  // by design — the coupling is the point: it pins WHERE the split signal is
  // computed (the finally block, so an early phase abort still populates it).

  // Anchor on the unique finally-block assignment the split signal sits beside.
  const anchor = source.indexOf('results.consoleErrors = consoleErrors;');
  assert.ok(anchor > 0, 'expected results.consoleErrors assignment in the harness');

  // The finally block that owns that anchor opens with `} finally {` before it,
  // and the summary.json write closes it after.
  const finallyOpen = source.lastIndexOf('} finally {', anchor);
  assert.ok(finallyOpen > 0 && finallyOpen < anchor, 'anchor must live inside a finally block');

  const summaryWrite = source.indexOf("join(RESULTS_DIR, 'summary.json')", anchor);
  assert.ok(summaryWrite > anchor, 'summary.json write must follow the anchor');

  const stepFailuresAssign = source.indexOf('results.stepFailures =');
  const consoleErrorCountAssign = source.indexOf('results.consoleErrorCount =');

  // Both assignments exist, sit AFTER the finally opens (not in the try), and
  // BEFORE summary.json is written — i.e. in the same finally block.
  assert.ok(stepFailuresAssign > finallyOpen, 'results.stepFailures must be assigned inside the finally block');
  assert.ok(consoleErrorCountAssign > finallyOpen, 'results.consoleErrorCount must be assigned inside the finally block');
  assert.ok(stepFailuresAssign < summaryWrite, 'results.stepFailures must be written before summary.json');
  assert.ok(consoleErrorCountAssign < summaryWrite, 'results.consoleErrorCount must be written before summary.json');

  // And they are computed with computeSmokeSignal, the same helper this suite tests.
  assert.match(source, /computeSmokeSignal\(results\)/);

  // Pin the ACTUAL gate too: the terminal throw at the end of the try goes
  // through evaluateSmokeOutcome (steps-first ordering, no input waives a step),
  // not an inline re-implementation that could drift from the tested helper.
  assert.match(source, /evaluateSmokeOutcome\(\{ steps: results\.steps, consoleErrors \}\)/);
});

test('isTransientPageTeardown recognises browser/page teardown, not real failures', () => {
  // The exact message the beta run hit (the floating rejection that flipped exit 1).
  assert.equal(
    isTransientPageTeardown('locator.click: Target page, context or browser has been closed'),
    true
  );
  for (const teardown of [
    'Target closed',
    'Session closed. Most likely the page has been closed.',
    'Page crashed',
    'Browser has been disconnected',
  ]) {
    assert.equal(isTransientPageTeardown(teardown), true, teardown);
  }
  // Real product / assertion failures must NOT be treated as transient teardown.
  for (const real of [
    'Manager rendered no table rows',
    'expected 3 recipes but found 0',
    'locator resolved to hidden element',
    '',
    null,
    undefined,
  ]) {
    assert.equal(isTransientPageTeardown(real), false, String(real));
  }
});

test('the harness guards the process against a late teardown rejection and exits deterministically', async () => {
  const source = await readFile(HARNESS_PATH, 'utf8');
  // A process-level unhandledRejection guard routes through the tested predicate,
  // swallowing teardown-shaped rejections and failing fast on anything else.
  assert.match(source, /process\.on\('unhandledRejection'/);
  assert.match(source, /isTransientPageTeardown\(message\)/);
  // browser.close() on a crashed browser is swallowed in the finally (never re-thrown),
  // so it cannot abort the run before summary.json is written.
  assert.match(source, /browser\.close\(\) failed \(ignored\)/);
  // The final exit keys on the harness's own verdict, immediately.
  assert.match(source, /process\.exit\(results\.passed \? 0 : 1\)/);
});
