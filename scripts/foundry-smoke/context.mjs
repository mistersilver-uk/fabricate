/**
 * The run-scoped object every scenario is handed. It owns the screenshot counter and manifest, the
 * phase and per-view stopwatches, the profile-scoping predicates, and `shared` — the declared
 * publish/consume channel between scenarios.
 */

import { join } from 'node:path';

import {
  isPhaseNeededForTargets,
  isD0SectionNeededForTargets,
} from '../lib/screenshotCaptureMap.js';

import { RC_SCREENSHOT_BUDGET } from './profile.mjs';

export function createSmokeContext({
  page,
  browser,
  results,
  profile,
  resultsDir,
  endpoint,
  cleanup,
  bootTimings,
  screenshotRunIdentity,
  consoleErrors,
  waivedConsoleErrors,
  consoleLog,
}) {
  const { SMOKE_PROFILE, SCREENSHOT_SCOPING_ACTIVE, SCREENSHOT_TARGET_LABELS } = profile;

  let screenshotCounter = 0;
  const screenshotManifestEntries = [];
  // ── Phase timings ───────────────────────────────────────────────────────────
  /** @type {Array<{ phase: string, startedAt: string, durationMs: number }>} */
  const phaseTimings = [];

  /** @type {{ name: string, startedAt: string, t0: number } | null} */
  let currentPhase = null;

  // Per-view timings: the wall clock between the previous captured frame (or the phase start).
  /** @type {Array<{ label: string, phase: string, durationMs: number }>} */
  const viewTimings = [];
  let lastViewMarkAt = performance.now();

  /**
   * Record the time taken to reach a captured view, attributed to `label`, and reset the stopwatch
   * for the next view. Called from `screenshot()` after a frame is actually written (never for an rc
   * no-op).
   */
  function markViewTiming(label) {
    const now = performance.now();
    viewTimings.push({
      label,
      phase: currentPhase?.name ?? 'unknown',
      durationMs: Math.round(now - lastViewMarkAt),
    });
    lastViewMarkAt = now;
  }

  /**
   * Begin a phase stopwatch. If another phase is already running it ends automatically — phases are
   * sequential, never nested.
   */
  function startPhase(name) {
    if (currentPhase) endPhase();
    currentPhase = { name, startedAt: new Date().toISOString(), t0: performance.now() };
    // Reset the per-view stopwatch so the first view of a phase is not charged
    // for the inter-phase gap.
    lastViewMarkAt = performance.now();
  }

  /** End the current phase and push its duration into `phaseTimings`. */
  function endPhase() {
    if (!currentPhase) return;
    phaseTimings.push({
      phase: currentPhase.name,
      startedAt: currentPhase.startedAt,
      durationMs: Math.round(performance.now() - currentPhase.t0),
    });
    currentPhase = null;
  }

  /** Take a screenshot with an auto-incrementing numeric prefix. */
  async function screenshot(page, label, options = {}) {
    if (SMOKE_PROFILE === 'rc' && !RC_SCREENSHOT_BUDGET.has(label)) return;
    if (SCREENSHOT_SCOPING_ACTIVE && !SCREENSHOT_TARGET_LABELS.has(label)) return;
    screenshotCounter++;
    const num = String(screenshotCounter).padStart(2, '0');
    const path = join(resultsDir, `screenshot-${num}-${label}.png`);
    // `options` forwards Playwright screenshot options (e.g. a `clip` box for a
    // region capture such as the chat sidebar); default is a full-page shot.
    await page.screenshot({ path, ...options });
    screenshotManifestEntries.push({
      label,
      file: `screenshot-${num}-${label}.png`,
      width: options.clip?.width ?? null,
      height: options.clip?.height ?? null,
    });
    markViewTiming(label);
  }

  /**
   * Whether the given view-bearing phase must run for this invocation. Always true except under an
   * actively-scoped `screenshots` run, where a phase whose labels are all off-target is skipped.
   */
  function shouldRunScreenshotPhase(phase) {
    if (!SCREENSHOT_SCOPING_ACTIVE) return true;
    return isPhaseNeededForTargets(phase, SCREENSHOT_TARGET_LABELS);
  }

  /** Whether a skippable Phase-D0 capture section must run (issue #826 increment 2). */
  function shouldRunScreenshotSection(sectionName) {
    if (!SCREENSHOT_SCOPING_ACTIVE) return true;
    const needed = isD0SectionNeededForTargets(sectionName, SCREENSHOT_TARGET_LABELS);
    if (!needed) {
      process.stdout.write(`Phase D0: ${sectionName} section skipped (off scoped target set).\n`);
    }
    return needed;
  }

  return {
    page,
    browser,
    results,
    profile,
    resultsDir,
    endpoint,
    consoleErrors,
    waivedConsoleErrors,
    consoleLog,
    phaseTimings,
    viewTimings,
    screenshotManifestEntries,
    screenshot,
    markViewTiming,
    startPhase,
    endPhase,
    currentPhaseName: () => currentPhase?.name ?? null,
    shouldRunScreenshotPhase,
    shouldRunScreenshotSection,
    // The declared cross-scenario channel. Every key is published by one scenario (or by the
    // runner) and consumed by later ones; nothing else crosses a scenario boundary.
    shared: {
      cleanup,
      bootTimings,
      screenshotRunIdentity,
      craftingSetup: null,
      executionFixtures: null,
      alchemyFixtures: null,
      d0RequiredCapturesComplete: false,
      d0TeardownTolerated: false,
    },
  };
}
