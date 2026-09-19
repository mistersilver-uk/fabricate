/**
 * Playwright smoke test that verifies Fabricate loads correctly in a live Foundry VTT instance and
 * exercises core crafting flows, from the setup page through world launch, fixture seeding, the
 * captured manager and crafting walks, and the terminal console-error check.
 *
 * Writes `test-results/summary.json` (machine-readable verdict and error list), `console.log` and
 * `screenshot-*.png`. Run as `node scripts/foundry-test-run.mjs`; `FOUNDRY_ADMIN_KEY`,
 * `FOUNDRY_URL` and `FOUNDRY_SCREENSHOT_HEAD_SHA` override the admin password, the base URL and
 * the exact-head stamp.
 */

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

import { runSmokeCleanup } from './foundry-smoke/cleanup.mjs';
import { createSmokeContext } from './foundry-smoke/context.mjs';
import {
  attachConsoleCapture,
  suppressFoundryTours,
} from './foundry-smoke/pageOps/pageLifecycle.mjs';
import {
  readAllowedConsoleErrorPatternsCsv,
  resolveSmokeProfileFlags,
} from './foundry-smoke/profile.mjs';
import { SMOKE_SCENARIOS } from './foundry-smoke/registry.mjs';
import { runScenarios } from './foundry-smoke/runScenarios.mjs';
import { deriveRunIdentity, reconcileFoundryEndpoint } from './lib/foundryRunIdentity.js';
import {
  appendAllowedConsoleErrorPatterns,
  evaluateSmokeOutcome,
  isTransientPageTeardown,
} from './lib/foundrySmokeSignal.js';
import { resolveScreenshotHeadSha } from './ui-pr-screenshot-evidence.mjs';

// A browser/page teardown at the very end of a long headless run (the Chromium being killed while a
// final screenshot click is still in flight) can leave a floating page promise that rejects AFTER
// the run's verdict is already recorded in summary.json.
process.on('unhandledRejection', (reason) => {
  const message = reason instanceof Error ? reason.message : String(reason);
  if (isTransientPageTeardown(message)) {
    process.stderr.write(`Ignoring transient teardown rejection after the run: ${message}\n`);
    return;
  }
  process.stderr.write(`foundry-test-run unhandled rejection: ${message}\n`);
  process.exit(1);
});

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const RESULTS_DIR = join(ROOT, 'test-results');

// Self-derive the endpoint so a standalone `test:foundry:run` (invoked as its own process after
// `test:foundry:up`) targets the same per-worktree port up bound, instead of the old fixed :30100
// (issue #827).
const FOUNDRY_URL = reconcileFoundryEndpoint({
  url: process.env.FOUNDRY_URL,
  hostPort: process.env.FOUNDRY_HOST_PORT,
  fallbackPort: deriveRunIdentity(ROOT).port,
}).url;
const ADMIN_KEY = process.env.FOUNDRY_ADMIN_KEY ?? 'fabricate-test-admin';
const WORLD_ID = 'fabricate-smoke-ci';

const profile = resolveSmokeProfileFlags();
const { RAW_SMOKE_PROFILE, SMOKE_PROFILE, SCREENSHOT_TARGET_LABELS } = profile;

/** @type {string[]} */
const consoleErrors = [];
/** Console/pageerror entries that matched an allowed waiver pattern and so did
 *  NOT fail the run. Echoed to $GITHUB_STEP_SUMMARY for audit (issue #628). */
/** @type {string[]} */
const waivedConsoleErrors = [];
/** @type {string[]} */
const consoleLog = [];

const ALLOWED_CONSOLE_ERROR_PATTERNS_CSV = readAllowedConsoleErrorPatternsCsv();

const screenshotRunIdentity = {
  runId: randomUUID(),
  headSha: resolveScreenshotHeadSha({
    explicitHeadSha: process.env.FOUNDRY_SCREENSHOT_HEAD_SHA,
    ciHeadSha: process.env.GITHUB_SHA,
  }),
  targetLabels: [...SCREENSHOT_TARGET_LABELS].sort((a, b) => a.localeCompare(b)),
};

// ── Cleanup tracking ──────────────────────────────────────────────────────
const cleanup = {
  actorIds: [],
  itemIds: [],
  userIds: [],
  sceneIds: [],
  systemId: null,
  blockedSystemId: null,
  // The `visibilityMode: 'restricted'` system whose recipe carries an access grant
  // (issue 643 §4b) — the only fixture that renders the recipe rail's ACCESS branch.
  restrictedSystemId: null,
  recipeIds: [],
  // Issue #489 craft-execution coverage fixtures: dedicated per-mode crafting systems (simple /
  // routedByIngredients / routedByCheck / progressive) and their world items.
  executionSystemIds: [],
  executionItemIds: [],
};

async function main() {
  // Read boot timings written by foundry-test-up.mjs *before* wiping
  // test-results/ — that script may have populated boot-timings.json, and we
  // want to merge those entries into the final summary so the timing table
  // reflects the whole pipeline, not just the in-browser phases.
  /** @type {Array<{ phase: string, startedAt: string, durationMs: number }>} */
  let bootTimings = [];
  try {
    const raw = await readFile(join(RESULTS_DIR, 'boot-timings.json'), 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.bootTimings)) bootTimings = parsed.bootTimings;
  } catch {
    /* boot timings are optional (e.g., when invoking foundry-test-run.mjs directly) */
  }

  // Wipe stale artifacts so the uploaded test-results/ artifact contains
  // only the current run. Every consumer (CI artifact upload, local triage)
  // wants current-run output; nothing here is hand-authored.
  await rm(RESULTS_DIR, { recursive: true, force: true });
  await mkdir(RESULTS_DIR, { recursive: true });

  const profileSuffix =
    RAW_SMOKE_PROFILE === SMOKE_PROFILE ? '' : ` (from FOUNDRY_SMOKE_PROFILE=${RAW_SMOKE_PROFILE})`;
  process.stdout.write(`Smoke profile: ${SMOKE_PROFILE}${profileSuffix}\n`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
  });
  await suppressFoundryTours(context);
  const page = await context.newPage();

  // Known non-Fabricate error patterns to ignore (keep narrow — real 404s should be caught).
  // These in-source defaults stay in source, where their justification lives.
  const ignoredErrorPatternDefaults = [
    /favicon/i,
    // The screenshot walk deliberately exercises the responsive Manager at these four evidence
    // viewports.
    /Foundry Virtual Tabletop requires a screen resolution of 1366px by 768px or greater\..*display has a resolution of (?:1280px by 720px|1280px by 520px|900px by 700px|680px by 700px)\./i,
    // Note (issue #1010): a `/reading 'OBJECTS'/` waiver used to sit here, described as a headless
    // WebGL timing artifact.
  ];

  // APPEND any run-supplied patterns (--allowed-console-error-patterns / the
  // FOUNDRY_ALLOWED_CONSOLE_ERROR_PATTERNS env var) to the defaults; the
  // defaults always keep applying.
  const ignoredErrorPatterns = appendAllowedConsoleErrorPatterns(
    ignoredErrorPatternDefaults,
    ALLOWED_CONSOLE_ERROR_PATTERNS_CSV
  );

  attachConsoleCapture(page, ignoredErrorPatterns, {
    consoleErrors,
    waivedConsoleErrors,
    consoleLog,
  });

  const results = {
    passed: false,
    steps: [],
    errors: [],
    consoleErrors: [],
  };

  const ctx = createSmokeContext({
    page,
    browser,
    results,
    profile,
    resultsDir: RESULTS_DIR,
    endpoint: { FOUNDRY_URL, ADMIN_KEY, WORLD_ID },
    cleanup,
    bootTimings,
    screenshotRunIdentity,
    consoleErrors,
    waivedConsoleErrors,
    consoleLog,
  });

  // Issue #807: page.isClosed() is causation-blind (true for an intentional close OR a renderer
  // crash), so a tolerated post-captures teardown could hide a real product OOM as an untraceable
  // "transient". page 'crash' is Playwright's causation-bearing renderer-crash signal (OOM
  // canonical).
  page.on('crash', () => {
    results.rendererCrashed = true;
    process.stderr.write('Renderer process crashed (page "crash" event).\n');
  });

  try {
    await runScenarios(SMOKE_SCENARIOS, ctx);
    // Step failures are evaluated first and are never waivable by any input; a non-waived console
    // error throws only after steps are clean.
    const outcome = evaluateSmokeOutcome({ steps: results.steps, consoleErrors });
    if (outcome.reason === 'console-errors') {
      results.errors = consoleErrors;
    }
    if (outcome.throws) {
      throw new Error(outcome.message);
    }

    results.passed = true;
    process.stdout.write('Smoke test PASSED.\n');
  } catch (error) {
    results.passed = false;
    results.errors.push(error.message);
    process.stderr.write(`Smoke test FAILED: ${error.message}\n`);

    // Capture failure screenshot
    await page.screenshot({ path: join(RESULTS_DIR, 'screenshot-failure.png') }).catch(() => {});
  } finally {
    await runSmokeCleanup(ctx);
  }

  // Exit DETERMINISTICALLY on the harness's own verdict, immediately — so a floating
  // teardown promise that settles during the event-loop drain cannot influence the code.
  process.exit(results.passed ? 0 : 1);
}

// eslint-disable-next-line unicorn/prefer-top-level-await -- main() ends in a deterministic process.exit; a top-level await would leave the rejection to the event-loop drain.
main().catch((error) => {
  process.stderr.write(`foundry-test-run fatal error: ${error.message}\n`);
  process.exit(1);
});
