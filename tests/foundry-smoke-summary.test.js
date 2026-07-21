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
  shouldTolerateSmokeTeardown,
  TRANSIENT_TEARDOWN_SKIP_PREFIX,
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
  assert.deepEqual(failedStepOnly, { stepFailures: 1, consoleErrorCount: 0, degraded: false });

  const consoleErrorOnly = computeSmokeSignal({
    steps: [{ step: 'a', passed: true }],
    consoleErrors: ['a runtime error'],
  });
  assert.deepEqual(consoleErrorOnly, { stepFailures: 0, consoleErrorCount: 1, degraded: false });

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
  assert.deepEqual(computeSmokeSignal({}), { stepFailures: 0, consoleErrorCount: 0, degraded: false });
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

// ── Issue #807: transient D0 renderer-teardown tolerance ──────────────────
//
// Walk-order note (reconciled against the real D0 walk): the motivating
// essence-edit interaction is the `manager-essence-edit-first-state` capture,
// which runs BEFORE the `manager-experimental-off` milestone (several captures
// upstream). A teardown truly on that click is PRE-milestone and correctly still
// FAILS. The tolerance property is stated by MILESTONE POSITION, not by that
// interaction, so these tests assert on the milestone, never on essence-edit.

test('shouldTolerateSmokeTeardown: truth table (teardown class AND required captures complete)', () => {
  const teardown = 'locator.click: Target page, context or browser has been closed';

  // Teardown class present but captures NOT complete → do not tolerate (pre-milestone).
  assert.equal(
    shouldTolerateSmokeTeardown({ message: teardown, pageClosed: false, requiredCapturesComplete: false }),
    false
  );
  assert.equal(
    shouldTolerateSmokeTeardown({ message: 'unrelated', pageClosed: true, requiredCapturesComplete: false }),
    false
  );

  // Teardown class present AND captures complete → tolerate (post-milestone).
  assert.equal(
    shouldTolerateSmokeTeardown({ message: teardown, pageClosed: false, requiredCapturesComplete: true }),
    true
  );
  assert.equal(
    shouldTolerateSmokeTeardown({ message: 'unrelated', pageClosed: true, requiredCapturesComplete: true }),
    true
  );

  // A REAL (non-teardown) failure with captures complete is NEVER tolerated —
  // the predicate is not just `return requiredCapturesComplete`. Kills that mutant.
  assert.equal(
    shouldTolerateSmokeTeardown({
      message: 'Manager rendered no rows',
      pageClosed: false,
      requiredCapturesComplete: true,
    }),
    false
  );
});

test('computeSmokeSignal.degraded is true only for a tolerated-teardown skip record', () => {
  const degraded = computeSmokeSignal({
    steps: [
      { step: 'navigate-setup', passed: true },
      {
        step: 'screenshot-manager',
        passed: true,
        skipped: true,
        error: TRANSIENT_TEARDOWN_SKIP_PREFIX + 'Target page, context or browser has been closed',
      },
    ],
    consoleErrors: [],
  });
  assert.equal(degraded.degraded, true);

  // A skip for any OTHER reason (not the tolerated-teardown prefix) is NOT degraded.
  const notDegraded = computeSmokeSignal({
    steps: [
      { step: 'navigate-setup', passed: true },
      { step: 'cleanup', passed: true, skipped: true, error: 'profile skip' },
    ],
    consoleErrors: [],
  });
  assert.equal(notDegraded.degraded, false);

  // A clean run with no skips is not degraded.
  assert.equal(computeSmokeSignal({ steps: [{ step: 'a', passed: true }] }).degraded, false);
});

test('evaluateSmokeOutcome names the console-error count in the steps-first message', () => {
  // Steps still win the reason, but a nonzero console-error count is APPENDED so a
  // masked console-error total is visible behind a step failure. Kills the mutant
  // that removes the append.
  const outcome = evaluateSmokeOutcome({
    steps: [{ step: 'craft-item-phase', passed: false, error: 'craft failed' }],
    consoleErrors: ['a runtime console error', 'and another'],
  });
  assert.equal(outcome.throws, true);
  assert.equal(outcome.reason, 'steps');
  assert.match(outcome.message, /step\(s\) failed/);
  assert.match(outcome.message, /console error/);
  assert.ok(outcome.message.includes('2'), 'the console-error count must appear in the message');

  // With zero console errors the note is absent (no bare "(+0 ...)" noise).
  const noNote = evaluateSmokeOutcome({
    steps: [{ step: 'craft-item-phase', passed: false, error: 'craft failed' }],
    consoleErrors: [],
  });
  assert.doesNotMatch(noNote.message, /console error/);
});

test('a tolerated D0 skip step does NOT waive a coincident console error — console-error gate still fails', () => {
  // The tolerance touches only the STEP outcome; a tolerated teardown becomes
  // passed:true/skipped:true and drops out of failedSteps, so control reaches the
  // independent console-error gate. A real Fabricate JS bug surfaces there, NOT
  // through the teardown path — so the run still FAILS on reason 'console-errors'.
  const outcome = evaluateSmokeOutcome({
    steps: [
      { step: 'navigate-setup', passed: true },
      {
        step: 'screenshot-manager',
        passed: true,
        skipped: true,
        error: TRANSIENT_TEARDOWN_SKIP_PREFIX + 'Target page, context or browser has been closed',
      },
    ],
    consoleErrors: ['a real Fabricate regression'],
  });
  assert.equal(outcome.throws, true);
  assert.equal(outcome.reason, 'console-errors');
});

// ── Source contracts: the harness wiring (region-bounded literal couplings) ──

test('source: the D0 screenshot-manager catch tolerates WITHOUT rethrowing', async () => {
  const source = await readFile(HARNESS_PATH, 'utf8');

  // Bound the catch region between its unique passed:false push (the hard-failure
  // branch) and the D0 finally. The old code had `throw err;` in exactly this
  // span; the fix removes it. INTENTIONAL literal coupling to the harness spelling.
  const failPush = source.indexOf("step: 'screenshot-manager', passed: false, error: err.message");
  assert.ok(failPush > 0, 'expected the D0 screenshot-manager hard-failure push');
  const finallyClose = source.indexOf('} finally {', failPush);
  assert.ok(finallyClose > failPush, 'expected the D0 finally after the hard-failure push');
  const catchRegion = source.slice(failPush, finallyClose);

  // The tolerate branch lives in this span and it does NOT rethrow.
  assert.match(catchRegion, /d0TeardownTolerated = true/);
  assert.ok(!/\bthrow\b/.test(catchRegion), 'the D0 catch must not rethrow (would double-record in Phase C)');

  // The tolerate decision routes through the shared predicate — assert against the
  // whole catch (the condition precedes the hard-failure push, so it is upstream
  // of the bounded no-throw span above).
  const catchStart = source.lastIndexOf('} catch (err) {', failPush);
  assert.ok(catchStart > 0 && catchStart < failPush, 'expected the enclosing D0 catch');
  assert.match(source.slice(catchStart, finallyClose), /shouldTolerateSmokeTeardown\(\{/);
});

test('source: d0RequiredCapturesComplete flips true AFTER the last capture, BEFORE the screenshot-manager pass push (not hoisted)', async () => {
  const source = await readFile(HARNESS_PATH, 'utf8');

  const screenshotAnchor = source.indexOf("screenshot(page, 'manager-experimental-off')");
  assert.ok(screenshotAnchor > 0, 'expected the manager-experimental-off milestone capture');

  const milestoneAssign = source.indexOf('d0RequiredCapturesComplete = true', screenshotAnchor);
  assert.ok(milestoneAssign > screenshotAnchor, 'milestone flag must be set AFTER the last capture');

  // The success push {step:'screenshot-manager', passed:true} (single line, no skipped).
  const managerPassPush = source.indexOf("step: 'screenshot-manager', passed: true }", screenshotAnchor);
  assert.ok(managerPassPush > milestoneAssign, 'milestone flag must be set BEFORE the screenshot-manager pass push');

  // Pin against hoisting: the ONLY `= true` assignment is the post-milestone one.
  assert.equal(
    source.indexOf('d0RequiredCapturesComplete = true'),
    milestoneAssign,
    'd0RequiredCapturesComplete must not be assigned true anywhere before the milestone'
  );
  // And it is declared false to begin with.
  assert.match(source, /let d0RequiredCapturesComplete = false;/);
});

test('source: results.degraded and results.rendererCrashed are assigned in the finally block before summary.json', async () => {
  const source = await readFile(HARNESS_PATH, 'utf8');

  const anchor = source.indexOf('results.consoleErrors = consoleErrors;');
  assert.ok(anchor > 0, 'expected the finally-block consoleErrors anchor');
  const finallyOpen = source.lastIndexOf('} finally {', anchor);
  assert.ok(finallyOpen > 0 && finallyOpen < anchor, 'anchor must live inside a finally block');
  const summaryWrite = source.indexOf("join(RESULTS_DIR, 'summary.json')", anchor);
  assert.ok(summaryWrite > anchor, 'summary.json write must follow the anchor');

  const degradedAssign = source.indexOf('results.degraded =', finallyOpen);
  // Distinguish from the crash listener's `results.rendererCrashed = true` (which
  // sits in the try, before the finally) by matching the finally-block coercion.
  const rendererAssign = source.indexOf('results.rendererCrashed = Boolean(', finallyOpen);

  assert.ok(degradedAssign > finallyOpen, 'results.degraded must be assigned inside the finally block');
  assert.ok(rendererAssign > finallyOpen, 'results.rendererCrashed must be assigned inside the finally block');
  assert.ok(degradedAssign < summaryWrite, 'results.degraded must be written before summary.json');
  assert.ok(rendererAssign < summaryWrite, 'results.rendererCrashed must be written before summary.json');

  // degraded is computed via the same helper this suite tests.
  assert.match(source, /const \{ stepFailures, consoleErrorCount, degraded \} = computeSmokeSignal\(results\)/);
  // A causation-bearing renderer-crash listener feeds rendererCrashed.
  assert.match(source, /page\.on\('crash'/);
});

test('source (F2): the Phase E craft-failure screenshot is wrapped, and the Phase E guard keys on d0TeardownTolerated', async () => {
  const source = await readFile(HARNESS_PATH, 'utf8');

  // (a) A gone-page failure screenshot cannot throw out of the Phase E catch into
  // the Phase C catch and revive the deleted create-crafting-system record.
  assert.match(
    source,
    /try \{[\s\S]*?screenshot\(page, 'craft-failure'\)[\s\S]*?\} catch/,
    'the craft-failure screenshot must be wrapped in try/catch (mirroring journal-failure)'
  );

  // (b) The Phase E entry guard keys on d0TeardownTolerated, not page.isClosed() alone —
  // a 'browser has been disconnected'-class teardown leaves page.isClosed() false.
  assert.match(source, /if \(page\.isClosed\?\.\(\) \|\| d0TeardownTolerated\)/);
  // When skipping, craft-item-phase is recorded skipped (not silently dropped).
  assert.match(source, /step: 'craft-item-phase', passed: true, skipped: true/);
});

test('source (F4): both teardown-skip writer sites reference the exported TRANSIENT_TEARDOWN_SKIP_PREFIX symbol, no re-inlined literal', async () => {
  const source = await readFile(HARNESS_PATH, 'utf8');

  // Both writer sites (D0 skip + Journal skip) stamp the error via the symbol.
  const symbolWrites = source.match(/error: TRANSIENT_TEARDOWN_SKIP_PREFIX \+ /g) ?? [];
  assert.equal(symbolWrites.length, 2, 'both skip writers must reference the exported prefix symbol');

  // The literal string must NOT be re-inlined anywhere in the harness — that would
  // defeat the drift protection (change the constant and that writer stops marking degraded).
  assert.ok(
    !source.includes('transient page teardown (skipped): '),
    'the prefix literal must live only in foundrySmokeSignal.js, not re-inlined in the harness'
  );
});
