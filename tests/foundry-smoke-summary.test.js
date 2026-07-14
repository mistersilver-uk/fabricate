import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parseAllowedConsoleErrorPatterns,
  appendAllowedConsoleErrorPatterns,
  isConsoleErrorWaived,
  computeSmokeSignal,
  evaluateSmokeOutcome,
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

// ── Source contract: the signal is written from the finally block ─────────

test('stepFailures/consoleErrorCount are assigned in the finally block, beside results.consoleErrors', async () => {
  const source = await readFile(HARNESS_PATH, 'utf8');

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
});
