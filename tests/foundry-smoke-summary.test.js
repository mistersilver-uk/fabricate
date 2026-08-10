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
  explainSmokeSummaryRefusal,
  formatFailedStep,
  isTransientPageTeardown,
  shouldTolerateSmokeTeardown,
  TRANSIENT_TEARDOWN_SKIP_PREFIX,
} from '../scripts/lib/foundrySmokeSignal.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HARNESS_PATH = join(__dirname, '..', 'scripts', 'foundry-test-run.mjs');

// A stand-in for "some pattern supplied as an in-source default", built HERE. Every test
// below hands `appendAllowedConsoleErrorPatterns` its defaults array explicitly and none of
// them reads the harness's own `ignoredErrorPatternDefaults`, so what this file pins is the
// append-and-keep-applying CONTRACT, not the contents of that list.
//
// HISTORICAL, and named so it cannot read as anything else: this is the shape of the
// `/reading 'OBJECTS'/` canvas waiver the harness genuinely did ship until issue 1010
// RETIRED it, on finding it had spent a year masking a harness defect — a scene wait that
// resolved mid-draw — rather than a headless browser artefact. Nothing replaced it. Do not
// read its survival here as evidence that it, or a priority-renamed variant of it, should
// come back; read the note on `appendAllowedConsoleErrorPatterns` in
// `scripts/lib/foundrySmokeSignal.js` and the retirement note in `scripts/foundry-test-run.mjs`
// first, because a returning message of either form is a regression to diagnose.
const RETIRED_OBJECTS_WAIVER = /reading 'OBJECTS'/;

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
  const combined = appendAllowedConsoleErrorPatterns([RETIRED_OBJECTS_WAIVER], 'my-benign-pattern');

  // The appended pattern is honoured...
  assert.ok(isConsoleErrorWaived('saw my-benign-pattern in the log', combined));
  // ...AND the supplied default STILL applies with the flag set, which is the property
  // this file pins. Which patterns the harness supplies is the harness's business, and is
  // pinned there — today it supplies no canvas waiver at all.
  assert.ok(isConsoleErrorWaived("Cannot read properties of undefined (reading 'OBJECTS')", combined));

  // Defaults come first, then the CSV patterns; nothing is dropped.
  assert.equal(combined.length, 2);
  assert.equal(combined[0], RETIRED_OBJECTS_WAIVER);
});

test('an unrelated error is still gating even with a waiver pattern set', () => {
  const combined = appendAllowedConsoleErrorPatterns([RETIRED_OBJECTS_WAIVER], 'my-benign-pattern');
  assert.equal(isConsoleErrorWaived('a real Fabricate regression', combined), false);
});

test('a pageerror is waivable by a matching pattern and NOT by a non-matching one', () => {
  // The pageerror handler tests err.message against the same pattern set, so a
  // matching appended pattern waives it — the deliberate existing capability.
  const waived = appendAllowedConsoleErrorPatterns([RETIRED_OBJECTS_WAIVER], 'benign lifecycle glitch');
  assert.ok(isConsoleErrorWaived('benign lifecycle glitch during teardown', waived));

  // A non-matching pattern does not waive it.
  const nonMatching = appendAllowedConsoleErrorPatterns([RETIRED_OBJECTS_WAIVER], 'some other thing');
  assert.equal(isConsoleErrorWaived('benign lifecycle glitch during teardown', nonMatching), false);

  // And a supplied default keeps waiving with no CLI patterns at all, so an empty CSV
  // narrows nothing. Stated over the retired fixture rather than over whatever the harness
  // ships today, because the claim is about the EMPTY-CSV path and not about that list.
  const defaultsOnly = appendAllowedConsoleErrorPatterns([RETIRED_OBJECTS_WAIVER], '');
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
  const patterns = appendAllowedConsoleErrorPatterns([RETIRED_OBJECTS_WAIVER], 'everything is benign');
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
  const patterns = appendAllowedConsoleErrorPatterns([RETIRED_OBJECTS_WAIVER], 'benign');
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
  const patterns = appendAllowedConsoleErrorPatterns([RETIRED_OBJECTS_WAIVER], 'benign lifecycle glitch');

  // The Foundry canvas-artefact default and an appended pattern both waive.
  assert.deepEqual(classifyCapturedError("reading 'OBJECTS' blew up", patterns), { waived: true });
  assert.deepEqual(classifyCapturedError('benign lifecycle glitch here', patterns), { waived: true });

  // A real regression is gating.
  assert.deepEqual(classifyCapturedError('a real Fabricate regression', patterns), { waived: false });
});

test('classifyCapturedError routes identically regardless of console-vs-pageerror origin', () => {
  // Both handlers feed the SAME classifier, so a pageerror message and a console
  // error text with the same content route the same way — pageerror stays waivable.
  const patterns = appendAllowedConsoleErrorPatterns([RETIRED_OBJECTS_WAIVER], 'shared benign');
  const text = 'shared benign teardown noise';
  assert.equal(classifyCapturedError(text, patterns).waived, true);

  const nonMatching = appendAllowedConsoleErrorPatterns([RETIRED_OBJECTS_WAIVER], 'something else');
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

test('source: Manager readiness resolves the explicit or registered owner of the unique connected DOM', async () => {
  const source = await readFile(HARNESS_PATH, 'utf8');
  const start = source.indexOf('async function waitForManagerApplicationRendered(page)');
  const end = source.indexOf('/**\n * Resize the rendered Crafting System Manager', start);
  assert.ok(start > 0 && end > start, 'expected to bound the Manager readiness helper');
  const body = source.slice(start, end);

  assert.match(body, /resolveRegisteredManager = \(selector\)/);
  assert.match(body, /document\.querySelectorAll\(selector\)/);
  assert.match(body, /page\.evaluate\(resolveRegisteredManager, outerSelector\)/);
  assert.match(body, /renderedOuters\.length !== 1 \|\| renderedManagers\.length !== 1/);
  assert.match(body, /explicitApp = globalThis\.__fabricateSmokeManagerApp/);
  assert.match(body, /new Set\(\[explicitApp, \.\.\.registeredApps\]\.filter\(Boolean\)\)/);
  assert.match(body, /ownsRenderedManager/);
  assert.match(
    body,
    /liveMatches = applicationCandidates\.filter\(\(candidate\) => candidate\.liveMatch\)/
  );
  assert.match(
    body,
    /ApplicationV2 render readiness failed \(\$\{causeMessage\}\)/
  );
});

test('source: responsive evidence viewports narrowly waive Foundry minimum-resolution warnings', async () => {
  const source = await readFile(HARNESS_PATH, 'utf8');
  assert.match(
    source,
    /Foundry Virtual Tabletop requires a screen resolution of 1366px by 768px or greater[\s\S]*?1280px by 720px\|1280px by 520px\|900px by 700px\|680px by 700px/,
  );
  // The waiver stays dimension-specific: an unexpected low-resolution run must still
  // fail the smoke, so a catch-all pattern would defeat its purpose (issue 881).
  assert.doesNotMatch(source, /display has a resolution of \(\?:\.\*\)/);
});

test('source: smoke-world cleanup removes stale chat cards before stale documents', async () => {
  const source = await readFile(HARNESS_PATH, 'utf8');
  const messageCleanup = source.indexOf('const staleMessages = game.messages?.contents ?? []');
  const actorCleanup = source.indexOf('const staleActors = game.actors.contents.filter', messageCleanup);
  assert.ok(messageCleanup > 0, 'expected stale smoke chat cleanup');
  assert.ok(actorCleanup > messageCleanup, 'chat cards must be removed before their source documents');
  assert.match(
    source.slice(messageCleanup, actorCleanup),
    /ChatMessage\.deleteDocuments\(staleMessages\.map\(message => message\.id\)\)/
  );
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
    /try \{\s*await screenshot\(page, 'craft-failure'\);\s*\} catch/,
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

// ── The refusal diagnostic (issue #1019) ──────────────────────────────────

// `evaluateSmokeOutcome`'s excerpt format was entirely unpinned before #1019: dropping the
// step name, dropping the error, changing the `|| 'failed'` fallback and changing the `'; '`
// join ALL passed this suite. `assert.match` cannot close that — three of those four mutants
// survive any substring match by construction — so these four cases assert the WHOLE message
// with `assert.equal`. The message is the harness's terminal throw: it goes to stderr AND into
// `results.errors`, which is serialized into `summary.json`, and `npm run test:foundry` is not
// in the PR gate set, so a silent format regression would ship green.
test('evaluateSmokeOutcome pins its failed-step excerpt byte for byte', () => {
  // (a) step name + error, and the `: ` between them.
  assert.equal(
    evaluateSmokeOutcome({ steps: [{ step: 'alpha', passed: false, error: 'boom' }] }).message,
    '1 step(s) failed: alpha: boom'
  );
  // (b) the `|| 'failed'` fallback, which no other test exercises.
  assert.equal(
    evaluateSmokeOutcome({ steps: [{ step: 'alpha', passed: false }] }).message,
    '1 step(s) failed: alpha: failed'
  );
  // (c) the `'; '` join between two failed steps.
  assert.equal(
    evaluateSmokeOutcome({
      steps: [
        { step: 'alpha', passed: false, error: 'boom' },
        { step: 'beta', passed: false, error: 'bang' },
      ],
    }).message,
    '2 step(s) failed: alpha: boom; beta: bang'
  );
  // (d) the runtime-console-error suffix, verbatim.
  assert.equal(
    evaluateSmokeOutcome({
      steps: [{ step: 'alpha', passed: false, error: 'boom' }],
      consoleErrors: ['x', 'y'],
    }).message,
    '1 step(s) failed: alpha: boom (+2 runtime console error(s) captured)'
  );
});

// The harness's step record is `{ step, passed, error, skipped }`. The key is `step`, NOT
// `name` (`scripts/foundry-test-run.mjs:1655`, `:1657`, and every other push site), so an
// implementation reading `s.name` against a hand-written `{ name: … }` fixture would pass its
// own tests and emit an empty excerpt against a real summary.
test('formatFailedStep reads the `step` key and falls back to `failed`', () => {
  assert.equal(formatFailedStep({ step: 'screenshot-manager', passed: false, error: 'boom' }), 'screenshot-manager: boom');
  assert.equal(formatFailedStep({ step: 'screenshot-manager', passed: false }), 'screenshot-manager: failed');
  assert.equal(formatFailedStep({}), 'undefined: failed');
});

// Every field at its accepting value. Each fixture below patches ONLY the field it is about.
// The natural pair `{ passed: false, stepFailures: 2 }` is deliberately NOT used: `passed !==
// true` short-circuits the gate's disjunction, so the second field proves nothing and kills no
// mutant. `{ passed: true, stepFailures: 1 }` is not a summary the harness can emit — that is
// the point, and it is what makes the fixture able to detect its own condition's removal.
const ACCEPTING_SUMMARY = Object.freeze({
  passed: true,
  stepFailures: 0,
  consoleErrorCount: 0,
  degraded: false,
  rendererCrashed: false,
});

const refusalFor = (patch) => explainSmokeSummaryRefusal({ ...ACCEPTING_SUMMARY, ...patch });

// The names the message headed each condition block with, parsed back out.
const namedConditions = (message) =>
  message
    .split('\n')
    .map((line) => /^ {2}(\w+): /.exec(line))
    .filter(Boolean)
    .map((match) => match[1]);

// The gate's five-condition predicate, restated with its OWN `!==` comparisons so this file
// can compute the expected answer independently of the builder it is testing. Anything looser
// here (`> 0` for a count, truthiness for a flag) would make the oracle agree with a defective
// builder instead of catching it.
// A keyed lookup, not a chain of ternaries: SonarCloud reports a nested ternary as a new-code
// smell that ESLint does not flag, and `tests/**` is outside the lint glob but inside Sonar's
// new-code scope (AGENTS.md's "lint-green yet Sonar-red" trap).
const CONDITION_TRIPPED = Object.freeze({
  passed: (summary) => summary.passed !== true,
  stepFailures: (summary) => summary.stepFailures !== 0,
  consoleErrorCount: (summary) => summary.consoleErrorCount !== 0,
  degraded: (summary) => summary.degraded !== false,
  rendererCrashed: (summary) => summary.rendererCrashed !== false,
});
const CONDITION_ORDER = Object.keys(CONDITION_TRIPPED);
const OFF_NOMINAL = Object.freeze({
  passed: false,
  stepFailures: 3,
  consoleErrorCount: 2,
  degraded: true,
  rendererCrashed: true,
});
// The second sweep: every condition ABSENT rather than present-and-off-nominal. It has to
// cover all five, not just the two counts, because the oracle above is itself under test here.
// `OFF_NOMINAL` never makes `passed` anything but `false`, so with the counts-only variant the
// oracle's own `summary.passed !== true` could be weakened to `=== false` — and `degraded !==
// false` / `rendererCrashed !== false` to `=== true` — with the whole suite still green.
// Derived from `CONDITION_ORDER` so a sixth condition cannot be added to the oracle without
// entering this sweep too.
const ABSENT = Object.freeze(Object.fromEntries(CONDITION_ORDER.map((name) => [name, undefined])));
const trippedConditions = (summary) =>
  CONDITION_ORDER.filter((name) => CONDITION_TRIPPED[name](summary));

// NEVER SILENT, NEVER PARTIAL. Item 8's floor is "at least one condition", but "at least one"
// permits a first-match-wins builder that emits "the run did not pass" and nothing else on the
// real incident summary — reproducing the exact class-of-fault message this change exists to
// replace, green. So this asserts the named set EQUALS the tripped set, over every one of the
// 31 non-empty combinations. It is the single test that kills both the first-condition-only
// collapse and the `stepFailures !== 0` -> `> 0` weakening (an absent count is `!== 0` but not
// `> 0`, so a weakened builder would drop it from the named set).
test('explainSmokeSummaryRefusal names every tripped condition, over all 31 combinations', () => {
  for (const offNominalValues of [OFF_NOMINAL, ABSENT]) {
    for (let mask = 1; mask < 32; mask++) {
      const patch = {};
      CONDITION_ORDER.forEach((name, index) => {
        if (mask & (1 << index)) patch[name] = offNominalValues[name];
      });
      const summary = { ...ACCEPTING_SUMMARY, ...patch };
      const expected = trippedConditions(summary);
      assert.ok(expected.length > 0, `mask ${mask} must trip the predicate`);
      assert.deepEqual(
        namedConditions(explainSmokeSummaryRefusal(summary)),
        expected,
        `mask ${mask} with ${JSON.stringify(patch)}`
      );
    }
  }
});

test('explainSmokeSummaryRefusal reports each condition with the value it measured', () => {
  assert.match(refusalFor({ passed: false }), /^ {2}passed: false — /m);
  assert.match(refusalFor({ stepFailures: 4 }), /^ {2}stepFailures: 4 — /m);
  assert.match(refusalFor({ consoleErrorCount: 12 }), /^ {2}consoleErrorCount: 12 — /m);
  assert.match(refusalFor({ degraded: true }), /^ {2}degraded: true — /m);
  assert.match(refusalFor({ rendererCrashed: true }), /^ {2}rendererCrashed: true — /m);
});

// An absent scalar trips `!== 0` and must NOT be rendered as `0`: "stepFailures: 0" beside a
// refusal reads as a gate defect, and it is the shape a stale or truncated summary.json takes.
test('explainSmokeSummaryRefusal renders an absent or non-numeric count as "not recorded"', () => {
  for (const value of [undefined, null, '3', Number.NaN]) {
    assert.match(refusalFor({ stepFailures: value }), /^ {2}stepFailures: not recorded — /m);
    assert.match(refusalFor({ consoleErrorCount: value }), /^ {2}consoleErrorCount: not recorded — /m);
  }
  assert.match(refusalFor({ passed: undefined }), /^ {2}passed: not recorded — /m);
  assert.match(refusalFor({ degraded: 'yes' }), /^ {2}degraded: not recorded — /m);
  assert.match(refusalFor({ rendererCrashed: 1 }), /^ {2}rendererCrashed: not recorded — /m);
});

// A `not recorded` VALUE next to a note describing what a RECORDED value means asserts as
// observed exactly what went unobserved: the shipped message read `rendererCrashed: not
// recorded — the page reported a renderer crash (canonically an OOM)`, claiming a crash on a
// summary carrying no crash flag at all. Same defect as a note asserting an exit code the
// summary does not carry, one level down, so it is pinned the same way — the full note, and
// the recorded-value note's absence.
const ABSENT_SIGNAL_NOTE =
  'the summary did not record this signal, so this run cannot be shown to have been clean';
const RECORDED_NOTE_FRAGMENT = Object.freeze({
  stepFailures: 'did not pass',
  consoleErrorCount: 'reached the independent console gate',
  degraded: 'teardown was tolerated',
  rendererCrashed: 'reported a renderer crash',
});
test('explainSmokeSummaryRefusal never pairs an unrecorded signal with a measured-value note', () => {
  for (const [name, recordedFragment] of Object.entries(RECORDED_NOTE_FRAGMENT)) {
    const message = refusalFor({ [name]: undefined });
    assert.match(message, new RegExp(`^ {2}${name}: not recorded — ${ABSENT_SIGNAL_NOTE}$`, 'm'));
    assert.ok(
      !message.includes(recordedFragment),
      `${name}: not recorded must not carry a recorded value's note ("${recordedFragment}")`
    );
  }
  // And a RECORDED value still carries the note that says what the measurement means — the
  // conditional must not have collapsed both branches onto the absent-signal wording.
  assert.match(refusalFor({ stepFailures: 2 }), /^ {2}stepFailures: 2 — one or more phase steps did not pass$/m);
  assert.match(refusalFor({ rendererCrashed: true }), /^ {2}rendererCrashed: true — the page reported a renderer crash/m);
  // `passed` is deliberately NOT routed through the absent-signal note: "the run did not record
  // a successful verdict" is true of an absent verdict as well as a false one, so narrowing it
  // would replace a precise statement with a weaker one.
  assert.match(refusalFor({ passed: undefined }), /^ {2}passed: not recorded — the run did not record a successful verdict$/m);
});

test('explainSmokeSummaryRefusal quotes the failing steps and the un-waived console errors', () => {
  const message = refusalFor({
    stepFailures: 2,
    consoleErrorCount: 1,
    steps: [
      { step: 'screenshot-manager', passed: false, error: 'locator timeout' },
      { step: 'craft-item-phase', passed: true },
      { step: 'player-journal', passed: false },
    ],
    consoleErrors: ["pageerror: Cannot read properties of undefined (reading 'INTERFACE')"],
  });
  assert.match(message, /^ {4}- screenshot-manager: locator timeout$/m);
  assert.match(message, /^ {4}- player-journal: failed$/m);
  assert.ok(!message.includes('craft-item-phase'), 'a passing step is not evidence of a failure');
  assert.match(message, /^ {4}- pageerror: Cannot read properties of undefined \(reading 'INTERFACE'\)$/m);
});

// `degraded` and `rendererCrashed` both fire on runs that PASSED and exited 0 (AGENTS.md:380),
// so neither block may describe the run as having failed — and each still needs something
// quotable, or a plain statement that the summary recorded nothing for it.
test('explainSmokeSummaryRefusal gives degraded and rendererCrashed their own evidence', () => {
  const degradedMessage = refusalFor({
    degraded: true,
    steps: [
      // A SKIPPED step that is NOT a tolerated teardown. The harness pushes exactly this
      // record (`scripts/foundry-test-run.mjs`'s `acceptLicenseIfPresent`) on every run that
      // does not hit the license page: `skipped: true`, `passed: true`, and no `error` at all.
      // It is here because the `degraded` block's use of the shared `isToleratedTeardownStep`
      // is the deviation that justified sharing the predicate at all — loosened to
      // `step?.skipped === true` it would quote `license-check: failed` as tolerated-teardown
      // evidence on a real degraded run, and nothing else in this suite would notice.
      { step: 'license-check', passed: true, skipped: true },
      { step: 'craft-item-phase', passed: true },
      { step: 'player-journal', passed: true, skipped: true, error: `${TRANSIENT_TEARDOWN_SKIP_PREFIX}target closed` },
    ],
  });
  assert.match(degradedMessage, /^ {4}- player-journal: transient page teardown \(skipped\): target closed$/m);
  assert.ok(!degradedMessage.includes('license-check'), 'a skipped non-teardown step is not tolerated-teardown evidence');
  assert.ok(!/\bfailed\b/.test(degradedMessage.split('\n\n')[1]), 'a tolerated teardown is not a failed step');

  const crashMessage = refusalFor({ rendererCrashed: true });
  assert.match(crashMessage, /^ {2}rendererCrashed: true — /m);
  assert.match(crashMessage, /no per-step record/);

  // A `degraded: true` summary whose steps array records no tolerated teardown says so rather
  // than naming a flag and falling silent.
  assert.match(refusalFor({ degraded: true, steps: [] }), /recorded no tolerated-teardown step/);
});

// Neither flag fails a run BY ITSELF — but "so the run exited 0" is a different, stronger claim
// and it is conditionally FALSE. A tolerated teardown co-occurring with a later step failure is
// ordinary (the Phase E tolerate site sits beside steps that can still fail), and there
// `evaluateSmokeOutcome` throws, `results.passed = false`, and the process exits NON-zero. So
// each note states what its condition alone does, and no note asserts an exit code.
test('the degraded and rendererCrashed notes never claim the run exited 0', () => {
  const alsoFailed = refusalFor({
    passed: false,
    stepFailures: 2,
    degraded: true,
    rendererCrashed: true,
    steps: [
      { step: 'boot-and-join', passed: false, error: 'locator timeout' },
      { step: 'screenshot-manager', passed: false, error: 'assertion' },
      { step: 'player-journal', passed: true, skipped: true, error: `${TRANSIENT_TEARDOWN_SKIP_PREFIX}target closed` },
    ],
  });
  // This summary is exactly the shape whose process exit is non-zero.
  assert.ok(!/exited 0/.test(alsoFailed), 'no note may assert an exit code the summary does not carry');
  for (const name of ['degraded', 'rendererCrashed']) {
    assert.match(
      alsoFailed,
      new RegExp(`^ {2}${name}: true — .*this condition alone does not fail a run`, 'm')
    );
  }
});

// An early phase abort (`scripts/foundry-test-run.mjs`'s outer catch) writes `passed: false`
// with all four signals clean. The refusal must say that explicitly instead of naming the
// verdict and leaving the contributor to guess what tripped it.
test('explainSmokeSummaryRefusal explains a bare passed:false with nothing else recorded', () => {
  const message = refusalFor({ passed: false });
  assert.deepEqual(namedConditions(message), ['passed']);
  assert.match(message, /records no failing step, un-waived console error, tolerated teardown, or renderer crash/);
  assert.match(message, /aborted before/);

  // With other conditions present, the verdict block points at them rather than repeating them.
  assert.match(refusalFor({ passed: false, consoleErrorCount: 3 }), /follows from the condition\(s\) below/);
});

test('explainSmokeSummaryRefusal caps each excerpt at five entries with a (+N more) tail', () => {
  const errorsOfLength = (count) => Array.from({ length: count }, (_, index) => `console-error-${index + 1}`);

  const five = refusalFor({ consoleErrorCount: 5, consoleErrors: errorsOfLength(5) });
  assert.match(five, /^ {4}- console-error-5$/m);
  assert.ok(!five.includes('more)'), 'exactly five entries needs no truncation tail');

  const six = refusalFor({ consoleErrorCount: 6, consoleErrors: errorsOfLength(6) });
  assert.match(six, /^ {4}- console-error-5$/m);
  assert.ok(!six.includes('console-error-6'), 'the sixth entry is truncated away');
  assert.match(six, /^ {4}\(\+1 more\)$/m);
});

test('explainSmokeSummaryRefusal survives absent, null, and non-array evidence fields', () => {
  for (const value of [undefined, null, 'not an array', 42, {}]) {
    const message = explainSmokeSummaryRefusal({
      ...ACCEPTING_SUMMARY,
      passed: false,
      stepFailures: 1,
      consoleErrorCount: 1,
      degraded: true,
      rendererCrashed: true,
      steps: value,
      consoleErrors: value,
      waivedConsoleErrors: value,
    });
    assert.deepEqual(namedConditions(message), CONDITION_ORDER);
    assert.match(message, /recorded no failing step/);
    assert.match(message, /recorded no un-waived console error/);
  }
  // And the whole summary being absent is not a crash either.
  assert.equal(typeof explainSmokeSummaryRefusal(undefined), 'string');
  assert.equal(typeof explainSmokeSummaryRefusal(null), 'string');
});

// `waivedConsoleErrors` is a `string[]` (`scripts/foundry-test-run.mjs:207`, `:6627`, `:6650`,
// `:13279`), not a count — reading it as a number would render `[Object]`-shaped nonsense or
// silently print nothing.
test('explainSmokeSummaryRefusal reports how many console errors were suppressed', () => {
  // Pinned in full, not just up to the count. The clause after the semicolon is the whole
  // point of the note — it tells the reader these entries are NOT why the gate refused — and
  // matched on the count alone it can be deleted with this suite still green.
  assert.match(
    refusalFor({ passed: false, waivedConsoleErrors: ['favicon 404', 'pageerror: minimum resolution'] }),
    /^The run also suppressed 2 waived console error\(s\); a waived entry never disqualifies a run, and each is listed under waivedConsoleErrors in the summary\.$/m
  );
  // ONE waived error still prints the note. The boundary matters: `waivedCount > 0` weakened to
  // `> 1` goes silent at exactly one suppression and every other fixture here has two.
  assert.match(
    refusalFor({ passed: false, waivedConsoleErrors: ['favicon 404'] }),
    /suppressed 1 waived console error\(s\)/
  );
  // An empty or absent array prints no suppression note at all. Matched on the whole phrase:
  // the verdict block's own "un-waived console error" contains "waived console error".
  const suppressionNote = /suppressed \d+ waived console error/;
  assert.ok(!suppressionNote.test(refusalFor({ passed: false, waivedConsoleErrors: [] })));
  assert.ok(!suppressionNote.test(refusalFor({ passed: false })));
  assert.ok(!suppressionNote.test(refusalFor({ passed: false, waivedConsoleErrors: 'not an array' })));
});

// The gate reads ONE summary and therefore cannot attribute what it read to a head. The
// procedure is always printed so the contributor is never left to invent it, and the
// stepFailures-0-with-console-errors prior is worded as guidance about a class of summary
// rather than as a finding about this one.
test('explainSmokeSummaryRefusal always states the merge-base attribution procedure', () => {
  for (const patch of [{ passed: false }, { stepFailures: 1 }, { rendererCrashed: true }]) {
    const message = refusalFor(patch);
    assert.match(message, /already present at the pull request's base/);
    assert.match(message, /stepFailures 0 with consoleErrorCount above 0/);
    assert.match(message, /guidance/);
    // It must never claim to have performed the comparison it is describing.
    assert.match(message, /reads one summary/);

    // The WHOLE procedure block, not just the `git merge-base` line: the one actionable
    // instruction in a diagnostic written to save twenty-five minutes has to survive an edit
    // that only reads the surviving lines.
    //
    // Pinned semantically rather than by raw line count. `assert.equal(procedure.length, N)`
    // catches a deleted line, but it also fails on a cosmetic rewrap — a red on a test whose
    // subject is not formatting, and one whose cheapest repair is to bump N without reading
    // what moved. These two assertions instead pin the executable steps exactly, ORDER
    // INCLUDED (a sequence whose steps commute is not this sequence: the copy-aside below has
    // to precede the base run that overwrites the directory), and the prose by sentence
    // against a copy with its wrapping normalized away.
    const procedure = message.split('\n\n').at(-1);
    assert.deepEqual(
      procedure.split('\n').filter((line) => /^ {4}\S/.test(line)),
      [
        '    git merge-base HEAD origin/main',
        '    npm run --silent screenshots:ui:targets -- --base origin/main',
        '    cp -r test-results test-results-branch   # the base run overwrites test-results/ in place',
        '    git switch --detach <merge-base>',
        '    npm run test:foundry:screenshots -- --target-labels=<the labels printed above>',
        '    compare test-results/summary.json against test-results-branch/summary.json, then git switch -',
      ],
      'every executable step of the attribution procedure, in order'
    );
    // Wrapping collapsed, so a rewrap passes and a deleted sentence does not.
    const prose = procedure.replaceAll(/\n {2,}/g, ' ');
    for (const sentence of [
      'it cannot tell a fault this branch introduced from one that was already there',
      're-run at the merge base the SAME scoped smoke that produced this summary',
      'the two runs are not comparable and this gate refuses the second one as well',
      // THE ABSENT-LABEL TRAP. A pull request that ADDS a view is the normal case for this
      // gate, and its new labels do not exist at the merge base, so the scoped base run skips
      // their phases and returns a clean-looking summary about nothing.
      'a label this branch ADDS does not exist at the merge base',
      'the base run never covered the fault, not that the base was clean',
      'stepFailures 0 with consoleErrorCount above 0',
    ]) {
      assert.ok(prose.includes(sentence), `the attribution procedure must state: ${sentence}`);
    }

    // THE PROFILE TRAP. `package.json` binds `test:foundry` to the default/full profile, while
    // the summary this gate reads is written by the scoped `screenshots` profile with
    // `--target-labels`. Prescribing the bare command would send the reader down a longer,
    // non-comparable run whose artifact the target-label check then refuses.
    assert.ok(
      !/npm run test:foundry(?!:screenshots)/.test(message),
      'the full-profile smoke does not produce the summary this gate reads'
    );
    assert.match(message, /same profile, same target labels/);
  }
});

// A step `error` may carry a stack, so an evidence entry may be multi-line. Left flush, its
// continuation lines would read as siblings of the two-space condition headings — and
// `namedConditions` above, which is this suite's own oracle for "which conditions were named",
// parses exactly that shape.
test('explainSmokeSummaryRefusal indents the continuation lines of a multi-line entry', () => {
  const message = refusalFor({
    consoleErrorCount: 1,
    consoleErrors: ['pageerror: boom\n  degraded: at Object.<anonymous> (foundry.js:1:1)'],
  });
  assert.deepEqual(namedConditions(message), ['consoleErrorCount']);
  assert.match(message, /^ {4}- pageerror: boom$/m);
  assert.match(message, /^ {8}degraded: at Object\.<anonymous> \(foundry\.js:1:1\)$/m);
});

// The builder re-derives "which condition tripped" in a different file from the predicate that
// decides whether to refuse — two encodings of one truth, guarded by test rather than by
// structure. This is the half that keeps the failing-step SELECTION in step with the signal
// the harness actually computes. It covers three of the five conditions: `computeSmokeSignal`
// returns neither `passed` (set at `scripts/foundry-test-run.mjs:13157`/`:13160`) nor
// `rendererCrashed` (`:13277`).
test('explainSmokeSummaryRefusal quotes exactly the steps computeSmokeSignal counted', () => {
  const results = {
    steps: [
      { step: 'boot', passed: true },
      { step: 'screenshot-manager', passed: false, error: 'locator timeout' },
      { step: 'craft-item-phase', passed: false, error: 'assertion' },
      { step: 'player-journal', passed: true, skipped: true, error: `${TRANSIENT_TEARDOWN_SKIP_PREFIX}target closed` },
    ],
    consoleErrors: ['boom'],
  };
  const signal = computeSmokeSignal(results);
  assert.deepEqual(signal, { stepFailures: 2, consoleErrorCount: 1, degraded: true });

  const message = explainSmokeSummaryRefusal({ ...ACCEPTING_SUMMARY, ...signal, passed: false, ...results });
  const quotedSteps = message.split('\n').filter((line) => /^ {4}- (boot|screenshot-manager|craft-item-phase|player-journal): /.test(line));
  // Two failing-step quotes plus the one tolerated-teardown quote `degraded` is entitled to.
  assert.equal(quotedSteps.filter((line) => !line.includes(TRANSIENT_TEARDOWN_SKIP_PREFIX)).length, signal.stepFailures);
  assert.equal(quotedSteps.filter((line) => line.includes(TRANSIENT_TEARDOWN_SKIP_PREFIX)).length, 1);
});

test('source: the run verdict that feeds summary.passed is set on both the success and the catch path', async () => {
  const source = await readFile(HARNESS_PATH, 'utf8');

  // `passed` is the one evidence condition `computeSmokeSignal` does NOT return, so the drift
  // guard above cannot cover it. Anchor it here instead: both assignment sites must survive.
  assert.match(source, /results\.passed = true;/);
  assert.match(source, /results\.passed = false;/);
});
