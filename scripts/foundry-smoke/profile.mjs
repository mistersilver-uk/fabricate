/**
 * Smoke-profile flags, screenshot-target scoping and console-error waivers, read from argv and env.
 * Nothing is evaluated at import: every reader takes defaulted parameters, so importing this tree
 * from a test is inert.
 */

import { resolveSmokeProfile } from '../lib/foundryRunBudget.js';

// Exact set of screenshot labels the `rc` profile captures. Every other `screenshot(page, label)`
// call is a no-op under `rc` (the surrounding behavioral assertions still run).
export const RC_SCREENSHOT_BUDGET = new Set([
  'world-loaded',
  'fabricate-app-shell',
  'fabricate-journal',
  'post-craft',
  'crafter-post-craft-inventory',
]);

// The scoped `screenshots` profile target set (issue #826).
export function readScreenshotTargetLabels(argv = process.argv.slice(2), env = process.env) {
  const FLAG = '--target-labels';
  let csv = '';
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === FLAG) {
      csv = argv[i + 1] ?? '';
      break;
    }
    if (arg.startsWith(`${FLAG}=`)) {
      csv = arg.slice(FLAG.length + 1);
      break;
    }
  }
  if (!csv) csv = env.FOUNDRY_SCREENSHOT_TARGET_LABELS ?? '';
  return new Set(
    csv
      .split(/[\s,]+/)
      .map((label) => label.trim())
      .filter(Boolean)
  );
}

/** Read the extra console-error waiver patterns for this run. */
export function readAllowedConsoleErrorPatternsCsv(
  argv = process.argv.slice(2),
  env = process.env
) {
  const FLAG = '--allowed-console-error-patterns';
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === FLAG) return argv[i + 1] ?? '';
    if (arg.startsWith(`${FLAG}=`)) return arg.slice(FLAG.length + 1);
  }
  return env.FOUNDRY_ALLOWED_CONSOLE_ERROR_PATTERNS ?? '';
}

/** Every profile-derived flag the walk reads, resolved once by the runner. */
export function resolveSmokeProfileFlags(argv = process.argv.slice(2), env = process.env) {
  // Smoke profile selector. Four profiles.
  const RAW_SMOKE_PROFILE = String(env.FOUNDRY_SMOKE_PROFILE ?? 'full').toLowerCase();
  // `resolveSmokeProfile` is shared with the parent wrapper, so the two can never drift on what
  // `full` and `ci` mean.
  const SMOKE_PROFILE = resolveSmokeProfile(env.FOUNDRY_SMOKE_PROFILE);
  const RUN_SCREENSHOT_PHASES = SMOKE_PROFILE === 'full' || SMOKE_PROFILE === 'screenshots';
  const RUN_FULL_ONLY_BEHAVIORS = SMOKE_PROFILE === 'full';
  const RUN_FULL_ONLY_GATHERING_STATES = SMOKE_PROFILE === 'full';
  const SCREENSHOT_TARGET_LABELS = readScreenshotTargetLabels(argv, env);
  // Scoping is active only under `screenshots` AND when a non-empty target set was supplied.
  const SCREENSHOT_SCOPING_ACTIVE =
    SMOKE_PROFILE === 'screenshots' && SCREENSHOT_TARGET_LABELS.size > 0;
  // R2 (#750): the two 7-theme sweeps produce 14 `*-theme-<id>` frames that nothing asserts and
  // that `ui-pr-screenshot-evidence.mjs` deliberately does not map.
  const CAPTURE_THEME_SWEEPS =
    ['1', 'true', 'yes'].includes(String(env.FOUNDRY_SMOKE_THEMES ?? '').toLowerCase()) ||
    argv.includes('--themes');
  return {
    RAW_SMOKE_PROFILE,
    SMOKE_PROFILE,
    RUN_SCREENSHOT_PHASES,
    RUN_FULL_ONLY_BEHAVIORS,
    RUN_FULL_ONLY_GATHERING_STATES,
    SCREENSHOT_TARGET_LABELS,
    SCREENSHOT_SCOPING_ACTIVE,
    CAPTURE_THEME_SWEEPS,
  };
}
