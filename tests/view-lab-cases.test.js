/**
 * Invariants for the View Lab case registry.
 *
 * These exist because the registry's failure modes are all silent. A `sourceMatches` pattern that
 * matches nothing selects no evidence and the gate still passes. A step naming a button that was
 * renamed clicks nothing and captures the wrong screen. A viewport a few pixels short lets Foundry
 * clamp the window and the frame is quietly the wrong size. None of those announce themselves in a
 * screenshot — which is exactly why they belong in `npm test` rather than in the capture run.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { APP_CHROME, FOUNDRY_CHROME_SPEC, minimumViewportFor } from '../scripts/lib/foundryChromeSpec.js';
import {
  FALLBACK_CASE_ID,
  VIEW_LAB_CASES,
  caseIds,
  fallbackCase,
  getCaseById,
  hasUiChanges,
  isUiFile,
  labelForCaseId,
  mapChangedFilesToCases,
  normalizePath,
  publishableCases,
} from '../scripts/lib/viewLabCases.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The viewport the capture driver uses; asserted here so the arithmetic is gated, not just run. */
const CAPTURE_VIEWPORT = { width: 1920, height: 1080 };

const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);

test('case ids are unique and non-empty', () => {
  assert.equal(new Set(caseIds).size, caseIds.length, 'duplicate case id');
  for (const id of caseIds) {
    assert.match(id, /^[a-z][a-z0-9-]*$/, `case id "${id}" must be lowercase kebab-case`);
  }
});

test('every case names a window the chrome spec knows how to build', () => {
  for (const viewCase of VIEW_LAB_CASES) {
    assert.ok(
      APP_CHROME[viewCase.app],
      `case "${viewCase.id}" targets unknown app "${viewCase.app}"`
    );
    assert.ok(viewCase.label.trim().length > 0, `case "${viewCase.id}" has no label`);
    assert.equal(labelForCaseId(viewCase.id), viewCase.label);
    assert.ok(viewCase.readySelector.trim().length > 0, `case "${viewCase.id}" has no readySelector`);
  }
});

test('every sourceMatches pattern resolves to at least one tracked file', () => {
  // The anti-drift invariant carried over from the first View Lab attempt: a pattern that matches
  // nothing is indistinguishable from a pattern that matches everything until a PR needs it.
  const orphans = [];
  for (const viewCase of VIEW_LAB_CASES) {
    assert.ok(viewCase.sourceMatches.length > 0, `case "${viewCase.id}" declares no sourceMatches`);
    for (const pattern of viewCase.sourceMatches) {
      if (!tracked.some((file) => pattern.test(normalizePath(file)))) {
        orphans.push(`${viewCase.id}: ${pattern}`);
      }
    }
  }
  assert.deepEqual(
    orphans,
    [],
    `these patterns match no tracked file — a rename probably stranded them:\n  ${orphans.join('\n  ')}`
  );
});

test('every interaction step names text that exists in the manager UI', () => {
  // Steps are clicked by accessible name. A renamed rail entry would otherwise click nothing, and
  // the case would capture whichever screen happened to be showing.
  // Includes `src/ui/**/*.js`: the crafting sub-tab ids the selector steps target are declared in
  // `crafting/craftingNav.js`, not in any component file.
  const haystack = tracked
    .filter(
      (file) =>
        file.endsWith('.svelte') ||
        file === 'lang/en.json' ||
        (file.startsWith('src/ui/') && file.endsWith('.js'))
    )
    .map((file) => readFileSync(resolve(ROOT, file), 'utf8'))
    .join('\n');

  const missing = [];
  for (const viewCase of VIEW_LAB_CASES) {
    for (const step of viewCase.steps ?? []) {
      if (typeof step === 'string') {
        if (!haystack.includes(step)) missing.push(`${viewCase.id}: label "${step}"`);
        continue;
      }
      // A `{selector}` step targets a stable element id. The ids are built as
      // `manager-crafting-nav-${item.id}`, so the literal string never appears in source — assert
      // the id STEM does, which is what a rename would move.
      const stem = step.selector.replace(/^#manager-crafting-nav-/, '');
      if (!haystack.includes(`id: '${stem}'`)) {
        missing.push(`${viewCase.id}: selector "${step.selector}" (no nav item with id '${stem}')`);
      }
    }
  }
  assert.deepEqual(
    missing,
    [],
    `these steps reference UI that no longer exists:\n  ${missing.join('\n  ')}`
  );
});

test('every case declaring an expectView targets the manager', () => {
  // `data-manager-view` only exists on the manager root, so an expectView on a player case would
  // silently never be checked.
  for (const viewCase of VIEW_LAB_CASES) {
    if (!viewCase.expectView) continue;
    assert.equal(
      viewCase.app,
      'fabricate-crafting-system-manager',
      `case "${viewCase.id}" declares expectView but is not a manager case`
    );
  }
  // Every manager case must declare one: it is the only guard against capturing the wrong screen.
  for (const viewCase of VIEW_LAB_CASES) {
    if (viewCase.app !== 'fabricate-crafting-system-manager') continue;
    assert.ok(
      viewCase.expectView,
      `manager case "${viewCase.id}" must declare expectView, or a mis-click captures silently`
    );
  }
});

test('the capture viewport clears the max-height Foundry clamps windows to', () => {
  // `.application { max-height: calc(100vh - 1.5 * var(--hotbar-height)) }`. `_updatePosition`
  // applies that clamp with no signal, so a viewport a few pixels short yields a green run and a
  // wrong-sized frame.
  const ceiling = FOUNDRY_CHROME_SPEC.maxHeightFor(CAPTURE_VIEWPORT.height);
  for (const appId of Object.keys(APP_CHROME)) {
    const minimum = minimumViewportFor(appId);
    assert.ok(
      CAPTURE_VIEWPORT.height >= minimum.height,
      `${appId} needs a viewport at least ${minimum.height}px tall; the driver uses ${CAPTURE_VIEWPORT.height}px`
    );
    assert.ok(
      CAPTURE_VIEWPORT.width >= minimum.width,
      `${appId} needs a viewport at least ${minimum.width}px wide`
    );
    assert.ok(
      APP_CHROME[appId].position.height <= ceiling,
      `${appId} declares ${APP_CHROME[appId].position.height}px but the ceiling at this viewport is ${ceiling}px`
    );
  }
});

test('exactly one fallback case exists and it publishes', () => {
  const fallback = fallbackCase();
  assert.ok(fallback, `FALLBACK_CASE_ID "${FALLBACK_CASE_ID}" names no case`);
  assert.equal(fallback.publish, true, 'the fallback case must publish or a broad change yields no evidence');
});

test('getCaseById round-trips and rejects unknown ids', () => {
  for (const viewCase of VIEW_LAB_CASES) assert.equal(getCaseById(viewCase.id), viewCase);
  assert.equal(getCaseById('no-such-case'), null);
  assert.equal(labelForCaseId('no-such-case'), null);
});

test('UI file detection matches the documented rule', () => {
  assert.ok(isUiFile('src/ui/svelte/apps/crafting/CraftingView.svelte'));
  assert.ok(isUiFile('styles/fabricate.css'));
  assert.ok(isUiFile('src/ui/appFactory.js'));
  assert.ok(!isUiFile('lang/en.json'));
  assert.ok(!isUiFile('src/systems/CraftingEngine.js'));
  // A lang-only change needs no evidence; a lang change alongside a render file does.
  assert.equal(hasUiChanges(['lang/en.json']), false);
  assert.equal(hasUiChanges(['lang/en.json', 'src/ui/svelte/apps/crafting/CraftingView.svelte']), true);
});

test('changed files map to the windows they affect', () => {
  const ids = (files) => mapChangedFilesToCases(files).map((viewCase) => viewCase.id);

  assert.deepEqual(ids(['src/ui/svelte/apps/gathering/GatheringView.svelte']), ['player-gathering']);
  assert.deepEqual(ids(['src/ui/svelte/apps/manager/ToolStudioView.svelte']), ['manager-tools']);
  assert.deepEqual(ids(['lang/en.json']), []);

  // A shared primitive or a global stylesheet can change every screen. Selecting all fourteen would
  // bury the reviewer, so those signals map to one player screen and one manager screen.
  const broad = ids(['styles/fabricate.css']);
  assert.deepEqual(broad.sort(), ['manager-components', 'player-crafting']);

  // An unmatched render file still yields evidence rather than none.
  assert.deepEqual(ids(['src/ui/svelte/apps/SomeBrandNewRoot.svelte']), [FALLBACK_CASE_ID]);
});

test('every publishable case is in the registry order the driver iterates', () => {
  const publishable = publishableCases();
  assert.ok(publishable.length > 0);
  assert.deepEqual(
    publishable.map((viewCase) => viewCase.id),
    VIEW_LAB_CASES.filter((viewCase) => viewCase.publish).map((viewCase) => viewCase.id)
  );
});
