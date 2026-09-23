/**
 * Everything the runner's `finally` does: the full-profile world cleanup, the split smoke signal,
 * the browser close, the timing tables and the three `test-results/` files. It is not a scenario:
 * driven from the loop it would be skipped by every mid-walk throw and would record its `cleanup`
 * step before the verdict.
 */

import { writeFile, appendFile } from 'node:fs/promises';
import { join } from 'node:path';

import { computeSmokeSignal } from '../lib/foundrySmokeSignal.js';

import { deleteSmokeWorldDocuments } from './pageOps/pageLifecycle.mjs';

/**
 * Echo every waived console error to $GITHUB_STEP_SUMMARY for audit. A waiver must never be silent:
 * the CI log records which known-benign errors were admitted this run.
 */
async function echoWaivedConsoleErrorsToStepSummary(waived) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath || waived.length === 0) return;
  const lines = [
    '### Smoke test — waived console errors',
    '',
    `${waived.length} console error(s) matched an allowed pattern and did NOT fail the run:`,
    '',
    ...waived.map((entry) => `- \`${entry.replaceAll('`', "'")}\``),
    '',
  ];
  try {
    await appendFile(summaryPath, `${lines.join('\n')}\n`);
  } catch {
    /* step summary is best-effort audit output */
  }
}

/**
 * Format a list of timing entries as an aligned stdout table so slow phases are obvious in CI logs.
 */
function formatTimingsTable(timings) {
  if (timings.length === 0) return '';
  const rows = timings.map(({ phase, durationMs }) => ({
    phase,
    seconds: (durationMs / 1000).toFixed(1),
  }));
  const totalMs = timings.reduce((sum, entry) => sum + entry.durationMs, 0);
  rows.push({ phase: 'TOTAL', seconds: (totalMs / 1000).toFixed(1) });
  const phaseWidth = Math.max(...rows.map((row) => row.phase.length));
  const secondsWidth = Math.max(...rows.map((row) => row.seconds.length));
  const lines = ['Phase timings', '─'.repeat(phaseWidth + secondsWidth + 5)];
  for (const row of rows) {
    lines.push(`  ${row.phase.padEnd(phaseWidth)}  ${row.seconds.padStart(secondsWidth)}s`);
  }
  return lines.join('\n');
}

/**
 * Render the slowest captured views as an aligned stdout table (R3, #750). Only the top `limit` are
 * shown — enough to spot where the D0 walk spends its time — with each view's phase for context.
 */
function formatSlowestViewsTable(timings, limit = 12) {
  if (timings.length === 0) return '';
  const sorted = [...timings].sort((a, b) => b.durationMs - a.durationMs).slice(0, limit);
  const rows = sorted.map(({ label, phase, durationMs }) => ({
    view: `${label} (${phase})`,
    seconds: (durationMs / 1000).toFixed(1),
  }));
  const viewWidth = Math.max(...rows.map((row) => row.view.length));
  const secondsWidth = Math.max(...rows.map((row) => row.seconds.length));
  const lines = [
    `Slowest views (top ${sorted.length} of ${timings.length})`,
    '─'.repeat(viewWidth + secondsWidth + 5),
  ];
  for (const row of rows) {
    lines.push(`  ${row.view.padEnd(viewWidth)}  ${row.seconds.padStart(secondsWidth)}s`);
  }
  return lines.join('\n');
}

export async function runSmokeCleanup(ctx) {
  const {
    page,
    browser,
    results,
    profile,
    resultsDir,
    consoleErrors,
    waivedConsoleErrors,
    consoleLog,
    phaseTimings,
    viewTimings,
    screenshotManifestEntries,
    startPhase,
    endPhase,
  } = ctx;
  const { RUN_FULL_ONLY_BEHAVIORS, SMOKE_PROFILE } = profile;
  const { cleanup, bootTimings, screenshotRunIdentity } = ctx.shared;
  // Cleanup matters for local dev (the container is preserved across runs and stale state can
  // shadow fresh fixtures).
  if (RUN_FULL_ONLY_BEHAVIORS) {
    startPhase('phase-F');
    process.stdout.write('Phase F: Cleaning up test data...\n');
    try {
      await deleteSmokeWorldDocuments(page, cleanup);
      process.stdout.write('Cleanup: test data removed.\n');
    } catch {
      process.stderr.write('Cleanup: some test data may remain.\n');
    }
  } else {
    startPhase('phase-F-skipped');
    process.stdout.write(`Phase F: skipped (profile=${SMOKE_PROFILE}).\n`);
    results.steps.push({ step: 'cleanup', passed: true, skipped: true });
  }

  endPhase();

  results.consoleErrors = consoleErrors;
  // Split the smoke signal (issue #628): a gate can then ask "did a step fail, or did we merely
  // capture noise?".
  const { stepFailures, consoleErrorCount, degraded } = computeSmokeSignal(results);
  results.stepFailures = stepFailures;
  results.consoleErrorCount = consoleErrorCount;
  // Issue #807: a tolerated transient D0/Journal teardown marks the run degraded (still exit 0,
  // but distinguishable in summary.json); rendererCrashed carries the causation-bearing page
  // 'crash' signal (coerced to a boolean here even when the listener never fired).
  results.degraded = degraded;
  results.rendererCrashed = Boolean(results.rendererCrashed);
  results.screenshotRun = screenshotRunIdentity;
  results.waivedConsoleErrors = waivedConsoleErrors;
  await echoWaivedConsoleErrorsToStepSummary(waivedConsoleErrors);
  results.bootTimings = bootTimings;
  results.phaseTimings = phaseTimings;
  results.viewTimings = viewTimings;
  // A browser that already crashed (the teardown case) can make close() reject.
  try {
    await browser.close();
  } catch (error) {
    process.stderr.write(`browser.close() failed (ignored): ${error.message}\n`);
  }

  const combinedTimings = [
    ...bootTimings.map((entry) => ({ ...entry, phase: `boot:${entry.phase}` })),
    ...phaseTimings,
  ];
  const timingsTable = formatTimingsTable(combinedTimings);
  if (timingsTable) {
    process.stdout.write(`\n${timingsTable}\n\n`);
  }
  // R3 (#750): surface the slowest individual views under the phase table so a
  // future measured cut can target them directly.
  const slowestViewsTable = formatSlowestViewsTable(viewTimings);
  if (slowestViewsTable) {
    process.stdout.write(`${slowestViewsTable}\n\n`);
  }

  // Write summary.json
  await writeFile(join(resultsDir, 'summary.json'), JSON.stringify(results, null, 2));
  await writeFile(
    join(resultsDir, 'screenshot-manifest.json'),
    JSON.stringify(
      {
        ...screenshotRunIdentity,
        captures: screenshotManifestEntries,
      },
      null,
      2
    )
  );

  // Write console log
  await writeFile(join(resultsDir, 'console.log'), consoleLog.join('\n'));

  process.stdout.write(`Results written to test-results/\n`);
}
