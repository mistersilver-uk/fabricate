/*
 * Scoped `screenshots` capture profile (issue #826) — PURE unit coverage.
 *
 * These tests NEVER import `scripts/foundry-test-run.mjs`: it top-level-imports
 * playwright and autoruns `main()`, so importing it here would launch Chromium then
 * `process.exit()` — killing the whole `node --test` run (reported as `# cancelled`,
 * never `# fail`). They import the playwright-free routine-map module and source-grep
 * the harness instead (the `tests/ui-pr-screenshot-evidence.test.js` precedent).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  VIEW_RECIPES,
  mapChangedFilesToViews,
  smokeLabelsForChangedFiles,
  collectScreenshotEvidence,
} from '../scripts/ui-pr-screenshot-evidence.mjs';
import {
  SCREENSHOT_CAPTURE_ORDER,
  captureOrderIndex,
  isCapturableLabel,
  phaseForCaptureLabel,
  phasesForTargetLabels,
  isPhaseNeededForTargets,
  CAPTURE_PHASE_D0,
  CAPTURE_PHASE_E,
} from '../scripts/lib/screenshotCaptureMap.js';

const HARNESS = readFileSync('scripts/foundry-test-run.mjs', 'utf8');
const CAPTURE_MAP_SRC = readFileSync('scripts/lib/screenshotCaptureMap.js', 'utf8');

// ── Scoping map: a changed-file set → the EXACT captured-label set ──────────────

test('a broad styles/theme.css change scopes to theme-or-global-ui (6 labels), NOT the full set', () => {
  const views = mapChangedFilesToViews(['styles/theme.css']);
  assert.deepEqual(views.map(v => v.id), ['theme-or-global-ui']);
  const labels = smokeLabelsForChangedFiles(['styles/theme.css']);
  assert.deepEqual(labels, [
    'manager-default-selection',
    'manager-components-normal',
    'manager-environments-browse-normal',
    'manager-gathering-task-editor-normal',
    'manager-gathering-events-normal',
    'manager-essences-normal',
  ]);
  // The scoped set is a tiny fraction of the full capture catalogue, never all of it.
  assert.equal(labels.length, 6);
  assert.ok(labels.length < SCREENSHOT_CAPTURE_ORDER.length);
});

test('styles/fabricate.css scopes to exactly three views (the two rail frames + the global fallback)', () => {
  const views = mapChangedFilesToViews(['styles/fabricate.css']);
  assert.deepEqual(views.map(v => v.id).sort(), [
    'manager-rail-collapsed',
    'manager-rail-expanded',
    'theme-or-global-ui',
  ]);
});

test('a scoped non-UI change yields an empty target set (skip the capture run)', () => {
  assert.deepEqual(smokeLabelsForChangedFiles(['docs/readme.md']), []);
});

// ── Label reachability (gap B): every target label is reachable by a routine ────

test('every VIEW_RECIPES smoke label is a capturable routine in the pure map', () => {
  for (const view of VIEW_RECIPES) {
    for (const label of view.smokeLabels) {
      assert.ok(
        isCapturableLabel(label),
        `${view.id} smoke label '${label}' is not registered in SCREENSHOT_CAPTURE_ORDER — a scoped run would never capture it and collect would throw`,
      );
    }
  }
});

test("theme-or-global-ui's six labels are all reachable and live in phase-D0", () => {
  const themeView = VIEW_RECIPES.find(v => v.id === 'theme-or-global-ui');
  for (const label of themeView.smokeLabels) {
    assert.ok(isCapturableLabel(label), `${label} unreachable`);
    assert.equal(phaseForCaptureLabel(label), CAPTURE_PHASE_D0);
  }
  // A scoped run for these captures phase-D0 only; phase-E is safely skipped.
  const phases = phasesForTargetLabels(themeView.smokeLabels);
  assert.deepEqual([...phases], [CAPTURE_PHASE_D0]);
  assert.equal(isPhaseNeededForTargets(CAPTURE_PHASE_E, themeView.smokeLabels), false);
});

test('a player/craft target set needs phase-E; collect throws when a mapped view has zero candidates', () => {
  // player-inventory is a phase-E label.
  assert.equal(phaseForCaptureLabel('player-inventory'), CAPTURE_PHASE_E);
  assert.equal(isPhaseNeededForTargets(CAPTURE_PHASE_E, ['player-inventory']), true);

  const root = mkdtempSync(join(tmpdir(), 'fabricate-scope-'));
  try {
    mkdirSync(join(root, 'test-results'), { recursive: true });
    // No frame for the mapped view → collect throws (a silently-empty scoped run
    // must fail loudly, never publish a missing view).
    assert.throws(
      () => collectScreenshotEvidence({
        changedFiles: ['src/ui/svelte/apps/inventory/InventoryView.svelte'],
        prNumber: 826,
        root,
      }),
      /Missing smoke screenshots/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ── Per-view frame ordering (gap A): scoped renumber keeps candidates[0] intended ──

test('capture order places a multi-label view\'s intended frame first (lowest counter)', () => {
  // manager-systems: default-selection is captured before selected-normal/stacked, so
  // it wins collect's filename sort (candidates[0]) — the load-bearing invariant.
  assert.ok(captureOrderIndex('manager-default-selection') >= 0);
  assert.ok(captureOrderIndex('manager-default-selection') < captureOrderIndex('manager-selected-normal'));
  assert.ok(captureOrderIndex('manager-selected-normal') < captureOrderIndex('manager-selected-stacked'));
});

test('a scoped run renumbers the counter yet still selects the intended candidates[0]', () => {
  const root = mkdtempSync(join(tmpdir(), 'fabricate-scope-order-'));
  try {
    const results = join(root, 'test-results');
    mkdirSync(results, { recursive: true });
    // A scoped `screenshots` run captures ONLY manager-systems' three labels and
    // renumbers the screenshot counter from 01 — a different absolute number than the
    // full walk, but the SAME relative capture order (filtering never reorders).
    writeFileSync(join(results, 'screenshot-01-manager-default-selection.png'), 'default');
    writeFileSync(join(results, 'screenshot-02-manager-selected-normal.png'), 'normal');
    writeFileSync(join(results, 'screenshot-03-manager-selected-stacked.png'), 'stacked');

    const result = collectScreenshotEvidence({
      changedFiles: ['src/ui/svelte/apps/manager/SystemsBrowserView.svelte'],
      prNumber: 826,
      root,
    });
    assert.equal(result.copied.length, 1);
    // candidates[0] is the lowest-numbered = first-captured = manager-default-selection.
    assert.equal(readFileSync(result.copied[0].destination, 'utf8'), 'default');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ── Map integrity / drift guards ───────────────────────────────────────────────

test('the capture map is a playwright-free, no-autorun pure module', () => {
  // No IMPORT of playwright or the autorunning harness (doc-comment mentions are fine).
  assert.equal(/import[^;\n]*['"]playwright['"]/.test(CAPTURE_MAP_SRC), false);
  assert.equal(/import[^;\n]*foundry-test-run/.test(CAPTURE_MAP_SRC), false);
  // No `main()` invocation / autorun bootstrap at the top level.
  assert.equal(/^\s*main\s*\(/m.test(CAPTURE_MAP_SRC), false);
});

test('every capture-map label appears as a literal in the harness (no phantom routines)', () => {
  for (const label of SCREENSHOT_CAPTURE_ORDER) {
    assert.ok(
      HARNESS.includes(`'${label}'`),
      `capture-map label '${label}' has no screenshot() call in the harness`,
    );
  }
});

test('phase assignment matches the manager/player prefix split', () => {
  for (const label of SCREENSHOT_CAPTURE_ORDER) {
    const phase = phaseForCaptureLabel(label);
    assert.ok(phase === CAPTURE_PHASE_D0 || phase === CAPTURE_PHASE_E);
  }
  assert.equal(phaseForCaptureLabel('manager-import-report'), CAPTURE_PHASE_D0);
  assert.equal(phaseForCaptureLabel('currency-macro'), CAPTURE_PHASE_D0);
  assert.equal(phaseForCaptureLabel('interactables-manager-empty'), CAPTURE_PHASE_D0);
  assert.equal(phaseForCaptureLabel('player-crafting-stacked'), CAPTURE_PHASE_E);
  assert.equal(phaseForCaptureLabel('chat-craft-card'), CAPTURE_PHASE_E);
  assert.equal(phaseForCaptureLabel('fabricate-journal'), CAPTURE_PHASE_E);
});
