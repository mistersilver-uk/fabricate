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
  D0_SPINE_LABELS,
  D0_SKIPPABLE_SECTIONS,
  isD0SectionNeededForTargets,
} from '../scripts/lib/screenshotCaptureMap.js';

const HARNESS = readFileSync('scripts/foundry-test-run.mjs', 'utf8');
const CAPTURE_MAP_SRC = readFileSync('scripts/lib/screenshotCaptureMap.js', 'utf8');
const TOOL_STUDIO_LABELS = [
  'manager-tool-parity-01-library-1280x720',
  'manager-tool-parity-02-overview-1280x720',
  'manager-tool-stress-long-name',
  'manager-tool-parity-03-breakage-1280x720',
  'manager-tool-stress-repair',
  'manager-tool-stress-replacement',
  'manager-tool-stress-immune',
  'manager-tool-parity-04-requirements-1280x720',
  'manager-tool-parity-05-validation-1280x720',
  'manager-tool-stress-invalid-validation',
  'manager-tool-parity-06-breakage-900x700',
  'manager-tool-stress-wrapping-680',
];

function harnessFunctionSpan(start, end) {
  const match = HARNESS.match(new RegExp(
    String.raw`function ${start}[^]*?(?=\n(?:async )?function ${end})`,
  ));
  assert.ok(match, `${start} harness function was not found`);
  return match[0];
}

const assertSingleToolMutation = new Function(
  `"use strict"; ${harnessFunctionSpan('assertSingleToolMutation', 'beginToolStoreMutationProbe')}; `
  + 'return assertSingleToolMutation;',
)();
const assertToolStudioHorizontalScrollSettled = new Function(
  `"use strict"; ${harnessFunctionSpan('assertToolStudioHorizontalScrollSettled', 'readToolStudioHorizontalScroll')}; `
  + 'return assertToolStudioHorizontalScrollSettled;',
)();
const toolTabContracts = new Function(
  `"use strict"; ${harnessFunctionSpan('assertHorizontalContainment', 'assertToolStudioTypography')}; `
  + 'return { assertToolStudioTabContainment };',
)();

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

test('styles/fabricate.css scopes to the Tool parity/stress set, two rail frames, and global fallback', () => {
  const views = mapChangedFilesToViews(['styles/fabricate.css']);
  assert.deepEqual(views.map(v => v.id).sort(), [
    '01-library-1280x720',
    '02-overview-1280x720',
    '03-breakage-1280x720',
    '04-requirements-1280x720',
    '05-validation-1280x720',
    '06-breakage-900x700',
    'manager-rail-collapsed',
    'manager-rail-expanded',
    'stress-immune',
    'stress-invalid-validation',
    'stress-long-name',
    'stress-repair',
    'stress-replacement',
    'stress-wrapping-680',
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

// ── Phase-D0 intra-phase section collapse (issue #826 increment 2) ──────────────

const ALL_D0_LABELS = SCREENSHOT_CAPTURE_ORDER.filter(
  (label) => phaseForCaptureLabel(label) === CAPTURE_PHASE_D0,
);

test('the D0 spine + skippable sections PARTITION every mapped phase-D0 label (nothing unguarded, nothing double-guarded)', () => {
  const seen = new Map();
  const record = (label, owner) => {
    assert.ok(
      !seen.has(label),
      `phase-D0 label '${label}' is claimed by both '${seen.get(label)}' and '${owner}' — a label must run in exactly one place`,
    );
    seen.set(label, owner);
  };
  for (const label of D0_SPINE_LABELS) record(label, 'spine');
  for (const section of D0_SKIPPABLE_SECTIONS) {
    for (const label of section.labels) record(label, section.name);
  }
  // Every mapped D0 label is covered.
  for (const label of ALL_D0_LABELS) {
    assert.ok(seen.has(label), `phase-D0 label '${label}' is neither in the spine nor any skippable section — a scoped run could never capture it`);
  }
  // And nothing claims a label that is not a real mapped D0 capture.
  for (const label of seen.keys()) {
    assert.ok(ALL_D0_LABELS.includes(label), `'${label}' is claimed by '${seen.get(label)}' but is not a mapped phase-D0 label`);
  }
  assert.equal(seen.size, ALL_D0_LABELS.length);
});

test('every skippable-section label is a capturable phase-D0 routine', () => {
  for (const section of D0_SKIPPABLE_SECTIONS) {
    assert.ok(section.labels.length > 0, `section '${section.name}' has no labels`);
    for (const label of section.labels) {
      assert.ok(isCapturableLabel(label), `section '${section.name}' label '${label}' is not capturable`);
      assert.equal(phaseForCaptureLabel(label), CAPTURE_PHASE_D0);
    }
  }
});

test('spine labels are ALWAYS-run — none is gated by a skippable section', () => {
  const sectioned = new Set(D0_SKIPPABLE_SECTIONS.flatMap((s) => s.labels));
  for (const label of D0_SPINE_LABELS) {
    assert.ok(!sectioned.has(label), `spine label '${label}' also appears in a skippable section`);
  }
  // A target set of ONLY a spine label needs NO skippable section (the spine runs
  // unconditionally, so a scoped run collapses D0 to just the spine).
  for (const section of D0_SKIPPABLE_SECTIONS) {
    assert.equal(
      isD0SectionNeededForTargets(section.name, ['manager-system-edit-dirty']),
      false,
      `a spine-only target incorrectly kept section '${section.name}'`,
    );
  }
});

test('a recipe-only target set runs ONLY the recipes section; component/tag/gathering/etc. are skippable', () => {
  const targets = ['manager-recipe-edit-ingredients', 'manager-recipes-normal'];
  assert.equal(isD0SectionNeededForTargets('recipes', targets), true);
  for (const name of ['components-checks', 'tags-essences', 'gathering', 'overview-interactables', 'import-alchemy-experimental']) {
    assert.equal(isD0SectionNeededForTargets(name, targets), false, `recipe-only target should skip '${name}'`);
  }
});

test('a component-only target set runs ONLY components-checks; recipes is skippable', () => {
  const targets = ['manager-component-edit-salvage'];
  assert.equal(isD0SectionNeededForTargets('components-checks', targets), true);
  assert.equal(isD0SectionNeededForTargets('recipes', targets), false);
  assert.equal(isD0SectionNeededForTargets('gathering', targets), false);
});

test('a Tool Studio target runs only the dedicated persisted-net-zero tools section', () => {
  assert.equal(isD0SectionNeededForTargets('tools', TOOL_STUDIO_LABELS), true);
  for (const name of ['recipes', 'components-checks', 'tags-essences', 'gathering', 'overview-interactables', 'import-alchemy-experimental']) {
    assert.equal(isD0SectionNeededForTargets(name, TOOL_STUDIO_LABELS), false, name);
  }
  for (const label of TOOL_STUDIO_LABELS) {
    assert.equal(phaseForCaptureLabel(label), CAPTURE_PHASE_D0);
    assert.ok(HARNESS.includes(`'${label}'`), `${label} is not reachable in the harness`);
  }
});

test('the Tool Studio walk pins shipped selectors, viewport evidence, pointer coverage, and restoration', () => {
  const toolStudioWalk = HARNESS.match(
    /async function exerciseToolStudioPointerTargets[\s\S]*?(?=\n\/\*\*\n \* Close Foundry application windows)/,
  )?.[0];
  assert.ok(toolStudioWalk, 'Tool Studio walk source was not found');
  const managerSizing = HARNESS.match(
    /async function setManagerWindowSize[\s\S]*?(?=\n\/\*\*\n \* Capture a manager view)/,
  )?.[0];
  assert.ok(managerSizing, 'manager sizing helper source was not found');
  const managerReadiness = HARNESS.match(
    /async function waitForManagerApplicationRendered[\s\S]*?(?=\n\/\*\*\n \* Resize the rendered Crafting System Manager)/,
  )?.[0];
  assert.ok(managerReadiness, 'manager render-readiness helper source was not found');
  const topOfStateLabels = TOOL_STUDIO_LABELS.filter(
    (candidate) => !['manager-tool-stress-repair', 'manager-tool-stress-replacement'].includes(candidate)
  );
  for (const label of topOfStateLabels) {
    assert.match(
      toolStudioWalk,
      new RegExp(
        String.raw`await resetToolStudioScroll\(page\);\s*await (?:captureToolStudioProduct\(page, '${label}', \w+\)|screenshot\(page, '${label}'\));`
      ),
      `${label} must reset the actual Tool Studio scroll owners immediately before capture`,
    );
  }
  assert.equal(HARNESS.includes('.manager-tools-row'), true);
  assert.ok(HARNESS.includes('[data-manager-tool-id]'));
  assert.ok(HARNESS.includes('exerciseToolStudioPointerTargets'));
  assert.ok(HARNESS.includes('verifyToolStudioLiveReplacement'));
  assert.match(toolStudioWalk, /sourceViewport: \{ width: 1280, height: 720 \}/);
  assert.match(toolStudioWalk, /sourceViewport: \{ width: 900, height: 700 \}/);
  assert.match(toolStudioWalk, /sourceViewport: \{ width: 680, height: 700 \}/);
  assert.match(managerSizing, /globalThis\.__fabricateSmokeManagerApp[\s\S]*?app\.setPosition\(\{/);
  const readinessIndex = managerSizing.indexOf('await waitForManagerApplicationRendered(page);');
  const setPositionIndex = managerSizing.indexOf('await app.setPosition({');
  assert.ok(readinessIndex >= 0, 'manager sizing must wait for the live ApplicationV2 element to render');
  assert.ok(
    setPositionIndex > readinessIndex,
    'ApplicationV2 render readiness must settle before setPosition touches the live element',
  );
  assert.match(
    managerReadiness,
    /async function waitForManagerApplicationRendered[\s\S]*?__fabricateSmokeManagerApp[\s\S]*?app\?\.element[\s\S]*?#fabricate-crafting-system-manager[\s\S]*?\.fabricate-manager[\s\S]*?isConnected/,
  );
  assert.doesNotMatch(managerReadiness, /appElement === outer/);
  assert.match(managerReadiness, /foundry\?\.applications\?\.instances[\s\S]*?instances\.values\(\)/);
  assert.match(managerReadiness, /app\?\.element \?\? app\?\._element[\s\S]*?rawElement\?\.\[0\] \?\? rawElement/);
  assert.match(managerReadiness, /element\.id === 'fabricate-crafting-system-manager'[\s\S]*?ownsManager/);
  assert.match(
    managerReadiness,
    /liveMatches\.length !== 1[\s\S]*?registryCandidates[\s\S]*?globalThis\.__fabricateSmokeManagerApp = liveMatches\[0\]\.app/,
  );
  assert.match(managerReadiness, /appElement\?\.matches\?\.\('\.fabricate-manager'\)[\s\S]*?appElement\?\.querySelector\?\.\('\.fabricate-manager'\)/);
  for (const diagnostic of [
    'appRendered',
    'elementType',
    'elementId',
    'elementConnected',
    'elementHasStyle',
    'managerConnected',
  ]) {
    assert.ok(managerReadiness.includes(diagnostic), `manager readiness timeout must report ${diagnostic}`);
  }
  assert.match(HARNESS, /browser:[\s\S]*?outer:[\s\S]*?product:/);
  assert.doesNotMatch(managerSizing, /Object\.assign\(app\.style/);
  assert.doesNotMatch(managerSizing, /const viewportWidth = Math\.max\(1366/);
  assert.match(HARNESS, /shared by local and CI screenshot/);
  assert.ok(HARNESS.includes('resetToolStudioScroll(page)'));
  assert.ok(HARNESS.includes('assertToolStudioLibraryLayout(page)'));
  assert.ok(HARNESS.includes('assertToolStudioEditorLayout(page, { stacked: false })'));
  assert.ok(HARNESS.includes('assertToolStudioEditorLayout(page, { stacked: true })'));
  assert.ok(HARNESS.includes('visibleToolRowCount !== 8'));
  assert.match(
    HARNESS,
    /characterPrerequisites: parityPrerequisites,[\s\S]*?The parity frame owns an exact eight-row fixture[\s\S]*?tools: \[\],[\s\S]*?toolBreakage: \{ authority: 'toolSpecific' \}/,
  );
  assert.match(HARNESS, /typeof sourceSystem\?\.description === 'string'[\s\S]*?sourceSystem\.description\.value = parityDescription/);
  assert.match(
    HARNESS,
    /normalized Tool snapshot[\s\S]*?description: 'A well-balanced forge hammer\. Durable, but the haft splinters when hard used\.'/,
  );
  assert.match(HARNESS, /const expectedToolNames = \[[\s\S]*?"Smith's Hammer"[\s\S]*?'Woodcarving Tools'/);
  assert.match(HARNESS, /visibleToolRows\.first\(\)[\s\S]*?Tool Studio parity library must select Smith's Hammer in the first row/);
  assert.match(HARNESS, /data-tool-inspector-description[\s\S]*?well-balanced forge hammer/);
  assert.match(
    HARNESS,
    /route transition asks ApplicationV2[\s\S]*?sourceViewport: \{ width: 1280, height: 720 \}/,
  );
  assert.match(
    HARNESS,
    /sourceReplaceDisclosure\.click\(\);[\s\S]*?const sourcePicker = editor\.locator\('\[data-tool-source-picker\]'\);[\s\S]*?stageToolDraftSource[\s\S]*?selectOptionAndAssertSingleChange\([\s\S]*?fixture\.sourceItemUuid[\s\S]*?sourceReplaceDisclosure\.click\(\);/,
    'the hidden replacement picker must perform one real source mutation and close before parity capture',
  );
  assert.ok(HARNESS.includes("editor.locator('[data-tool-prerequisite-row]').count() !== 5"));
  assert.match(
    toolStudioWalk,
    /const expectedPrerequisiteNames = \[[\s\S]*?'Expert Crafter'[\s\S]*?"Proficient with Smith's Tools"[\s\S]*?'Attuned to the Weave'[\s\S]*?'Strength 13 or higher'[\s\S]*?'Trained in Arcana'[\s\S]*?Tool Studio parity prerequisite order drifted/,
  );
  assert.ok(HARNESS.includes("editor.locator('[data-first-validation-failure]').count() !== 0"));
  assert.match(
    toolStudioWalk,
    /input\[name="tool-on-break"\]\[value="destroy"\][\s\S]*?saveToolStudioDraftIfDirty\(editor\)[\s\S]*?tab\('requirements'\)/,
    'Requirements parity must be captured from a saved destroy-action baseline',
  );
  assert.match(
    toolStudioWalk,
    /data-tool-bonus-expression[\s\S]*?fill\('@prof'\)[\s\S]*?saveToolStudioDraftIfDirty\(editor\)[\s\S]*?tab\('breakage'\)/,
    'the narrow Breakage parity frame must restore and save the @prof baseline',
  );
  for (const label of [
    'manager-tool-parity-01-library-1280x720',
    'manager-tool-parity-02-overview-1280x720',
    'manager-tool-parity-03-breakage-1280x720',
    'manager-tool-parity-04-requirements-1280x720',
    'manager-tool-parity-05-validation-1280x720',
  ]) {
    assert.ok(
      HARNESS.includes(`captureToolStudioProduct(page, '${label}', wideGeometry)`),
      `${label} must capture the truthful settled wide product frame`,
    );
  }
  assert.ok(
    HARNESS.includes(
      "captureToolStudioProduct(page, 'manager-tool-parity-06-breakage-900x700', narrowGeometry)"
    ),
    'the 900px parity frame must capture the truthful settled narrow product frame',
  );
  assert.match(toolStudioWalk, /clickToolTabAndAssertEffect\(page,[\s\S]*?900px/);
  assert.match(toolStudioWalk, /clickToolTabAndAssertEffect\(page,[\s\S]*?680px/);
  assert.match(toolStudioWalk, /persistedEnabledBefore[\s\S]*?enabled === !before[\s\S]*?enabled === before/);
  assert.match(toolStudioWalk, /selectedToolIds[\s\S]*?fixture\.toolId/);
  assert.match(HARNESS, /did not transition exactly once/);
  assert.match(HARNESS, /did not apply its observable toggle effect/);
  assert.doesNotMatch(HARNESS, /assertSinglePointerDispatch/);
  assert.doesNotMatch(HARNESS, /stopImmediatePropagation|stopPropagation/);
  assert.match(
    toolStudioWalk,
    /scrollToolEditorPanelToReveal\([\s\S]*?alternative-component[\s\S]*?manager-tool-stress-repair/,
    'repair stress evidence must reveal the populated OR group in the editor pane',
  );
  assert.match(
    toolStudioWalk,
    /scrollToolEditorPanelToReveal\([\s\S]*?data-tool-replacement-picker[\s\S]*?manager-tool-stress-replacement/,
    'replacement stress evidence must reveal the direct Item picker in the editor pane',
  );
  assert.match(
    HARNESS,
    /const addRepairAlternative = firstRepairGroup\.locator\('\[data-recipe-add="alternative-component"\]'\);[\s\S]*?assertPointerTarget\(page, addRepairAlternative,[\s\S]*?Tool repair OR add-component control[\s\S]*?withSingleToolStoreMutation\([\s\S]*?'Tool repair OR add'/,
  );
  assert.match(
    HARNESS,
    /const addRepairGroup = editor\.locator\('\[data-tool-repair-add-group="tags"\]'\);[\s\S]*?assertPointerTarget\(page, addRepairGroup,[\s\S]*?Tool repair AND control[\s\S]*?withSingleToolStoreMutation\([\s\S]*?'Tool repair AND add'/,
    'the repair group control must choose one strict-safe pointer target and mutate once',
  );
  assert.doesNotMatch(HARNESS, /\.manager-tool-repair-add-option select/);
  assert.doesNotMatch(HARNESS, /\.manager-recipe-or-trigger/);
  assert.match(
    HARNESS,
    /const componentTarget = replacementPicker;[\s\S]*?'Component replacement selection'[\s\S]*?selectOptionAndAssertSingleChange\(componentTarget, componentOption[\s\S]*?'Direct Item replacement route'[\s\S]*?selectOptionAndAssertSingleChange\(replacementType, 'item'[\s\S]*?const itemTarget = replacementPicker;[\s\S]*?if \(!itemOption\) throw new Error\('Tool Studio direct Item picker has no world Item options'\);/,
  );
  assert.doesNotMatch(HARNESS, /itemTarget\.selectOption\(fixture\.replacementItemUuid\)/);
  assert.match(
    toolStudioWalk,
    /withSingleToolStoreMutation\(\s*page,\s*'setToolBreakageAuthority',\s*'check-driven authority',\s*\(\) => checkDriven\.click\(\),\s*\(\) => waitForToolBreakageAuthority\(page, systemId\),[\s\S]*?withSingleToolDraftTransition\(\s*page,\s*fixture\.toolId,\s*'check-driven Tool Edit route'/,
    'the persisted + projected authority mutation must settle before the exactly-once Edit route',
  );
  assert.match(
    HARNESS,
    /async function withSingleToolDraftTransition[\s\S]*?viewState\.subscribe[\s\S]*?transitions\.length !== 1[\s\S]*?publish exactly one Tool draft transition/,
    'selection and Edit must count one live view-state transition instead of monkey-patching a captured method',
  );
  assert.match(
    HARNESS,
    /async function waitForToolBreakageAuthority[\s\S]*?getCraftingSystemManager\(\)\.getSystem\(systemId\)\?\.toolBreakage\?\.authority[\s\S]*?__fabricateSmokeManagerApp\?\._adminStore\?\.viewState\?\.subscribe[\s\S]*?timeout: 10_000/,
  );
  assert.match(
    toolStudioWalk,
    /const liveManagerApp = await requireSingleLocator\(page\.locator\('#fabricate-crafting-system-manager'\), 'live Crafting System Manager app'\);[\s\S]*?const editorManager = liveManagerApp\.locator\('\.fabricate-manager\[data-manager-view="tool-edit"\]'\);/,
  );
  assert.match(
    toolStudioWalk,
    /const immuneOnBreakFieldset = editor\.locator\('\[data-tool-breakage-tab\]:has\(input\[name="tool-check-breakable"\]\[value="immune"\]:checked\) \[data-tool-on-break-controls\]:disabled'\);[\s\S]*?await immuneOnBreakFieldset\.waitFor\(\{ state: 'visible', timeout: 10_000 \}\);[\s\S]*?await assertDisabledToolOnBreakFieldset\(immuneOnBreakFieldset\);/,
  );
  assert.match(
    HARNESS,
    /async function assertDisabledToolOnBreakFieldset[\s\S]*?element\.disabled === true[\s\S]*?element\.matches\(':disabled'\)[\s\S]*?fieldset\.locator\('button, input, select, textarea'\)[\s\S]*?controls\.nth\(index\)\.isDisabled\(\)/,
  );
  assert.doesNotMatch(
    toolStudioWalk,
    /await checkDriven\.click\(\);\s*await page\.locator\(`\.fabricate-manager \[data-manager-tool-id=/,
  );
  assert.doesNotMatch(toolStudioWalk, /page\.locator\('\[data-tool-edit-view\]'\)\.first\(\)/);
  assert.doesNotMatch(toolStudioWalk, /page\.locator\('\[data-tool-on-break-controls\]'\)\.first\(\)/);
  assert.doesNotMatch(toolStudioWalk, /onBreakFieldset\.isDisabled\(\)/);
  assert.match(
    toolStudioWalk,
    /const saveRecipe = page\.locator\([\s\S]*?Save recipe[\s\S]*?await saveRecipe\.click\(\);[\s\S]*?manager-chip:has-text\("Unsaved"\)[\s\S]*?state: 'detached'[\s\S]*?manager-nav-button:has-text\("Checks"\)/,
    'the recipe Tool-mode pointer check must save its restored value before leaving the dirty editor',
  );
  assert.match(
    HARNESS,
    /const fieldsetState = await fieldset\.evaluate\(\(element\) => \(\{[\s\S]*?disabled: element\.disabled === true,[\s\S]*?matchesDisabled: element\.matches\(':disabled'\),[\s\S]*?\}\)\);/,
  );
  assert.doesNotMatch(
    HARNESS,
    /\[data-manager-tools-authority\] label\.is-selected:has\(input\[value="checkDriven"\]\)/,
  );
  assert.match(HARNESS, /finally\s*\{[\s\S]*?restoreToolStudioFixture/);
});

test('Tool tab geometry contract rejects clipping, scrolling, and a missing fourth tab', () => {
  const rect = (left, right) => ({ left, right });
  const valid = {
    manager: rect(0, 832),
    tabs: rect(210, 512),
    tabButtons: [
      { id: 'tool-tab-overview', ...rect(218, 274) },
      { id: 'tool-tab-breakage', ...rect(280, 340) },
      { id: 'tool-tab-requirements', ...rect(346, 430) },
      { id: 'tool-tab-validation', ...rect(436, 504) },
    ],
    tabsOverflow: {
      overflowX: 'hidden',
      clientWidth: 302,
      scrollWidth: 302,
      scrollLeft: 0,
    },
  };
  assert.doesNotThrow(() => toolTabContracts.assertToolStudioTabContainment(valid));
  assert.throws(
    () => toolTabContracts.assertToolStudioTabContainment({
      ...valid,
      tabButtons: valid.tabButtons.slice(0, 3),
    }),
    /four measurable tabs/,
  );
  assert.throws(
    () => toolTabContracts.assertToolStudioTabContainment({
      ...valid,
      tabsOverflow: { ...valid.tabsOverflow, scrollWidth: 340 },
    }),
    /horizontally scrollable/,
  );
  assert.throws(
    () => toolTabContracts.assertToolStudioTabContainment({
      ...valid,
      tabButtons: valid.tabButtons.map((tab, index) => (
        index === 3 ? { ...tab, right: 520 } : tab
      )),
    }),
    /within visible tab list escapes horizontal containment/,
  );
});

test('Tool evidence contracts reject leaked horizontal state and duplicate store mutations', () => {
  assert.doesNotThrow(() => assertToolStudioHorizontalScrollSettled([
    { id: 'manager', scrollLeft: 0 },
    { id: 'editor', scrollLeft: 0 },
  ], 'stress frame'));
  assert.throws(
    () => assertToolStudioHorizontalScrollSettled([
      { id: 'editor', scrollLeft: 24 },
    ], 'stress frame'),
    /leaked horizontal scroll/,
  );
  assert.doesNotThrow(() => assertSingleToolMutation({
    calls: [{ method: 'patchToolDraft', args: [] }],
  }, 'patchToolDraft', 'repair OR add'));
  for (const calls of [
    [],
    [{ method: 'patchToolDraft' }, { method: 'patchToolDraft' }],
    [{ method: 'openToolDraft' }],
  ]) {
    assert.throws(
      () => assertSingleToolMutation({ calls }, 'patchToolDraft', 'repair OR add'),
      /exactly one patchToolDraft mutation/,
    );
  }
});

test('the Tool Studio run writes one summary/manifest identity with head, target labels, and measured clips', () => {
  assert.match(HARNESS, /const screenshotRunIdentity = \{[\s\S]*?runId: randomUUID\(\),[\s\S]*?headSha:[\s\S]*?targetLabels:/);
  assert.match(HARNESS, /results\.screenshotRun = screenshotRunIdentity/);
  assert.match(
    HARNESS,
    /await writeFile\([\s\S]*?'screenshot-manifest\.json'[\s\S]*?\.\.\.screenshotRunIdentity,[\s\S]*?captures: screenshotManifestEntries/,
  );
  assert.match(
    HARNESS,
    /screenshotManifestEntries\.push\(\{[\s\S]*?label,[\s\S]*?file: `screenshot-\$\{num\}-\$\{label\}\.png`,[\s\S]*?width:[\s\S]*?height:/,
  );
});

test('the Tool Studio fixture composes durable Tool identity through the canonical flag path', () => {
  assert.match(HARNESS, /source\.getFlag\('fabricate', 'fabricate\.roles'\)/);
  assert.match(HARNESS, /source\.setFlag\('fabricate', 'fabricate\.roles', fixture\.sourceRoles\)/);
  assert.match(HARNESS, /source\.unsetFlag\('fabricate', 'fabricate\.roles'\)/);
  assert.match(
    HARNESS,
    /if \(source\) \{\s*await source\.unsetFlag\('fabricate', 'fabricate\.roles'\);\s*if \(fixture\.sourceRoles\) await source\.setFlag\('fabricate', 'fabricate\.roles', fixture\.sourceRoles\);\s*if \(fixture\.sourceCreated\) await source\.delete\(\);\s*\}/,
    'restoration must clear the fixture leaf, restore any prior roles snapshot, and delete the owned Smith fixture',
  );
  assert.match(
    HARNESS,
    /flags\.fabricate\.fabricate\.roles\.\$\{systemId\}\.toolId/,
    'the owned replacement fixture must seed the same durable identity shape runtime readers use',
  );
  assert.match(
    HARNESS,
    /flags\.fabricate\.fabricate\.roles\.\$\{systemId\}\.componentId/,
    'replacement evidence must inspect the canonical component-identity path',
  );
  assert.doesNotMatch(HARNESS, /source\.(?:get|set|unset)Flag\('fabricate', 'roles'/);
  assert.doesNotMatch(HARNESS, /flags\.fabricate\.roles\.\$\{systemId\}\.(?:toolId|componentId)/);
});

test("theme-or-global-ui's multi-section target set keeps exactly the sections its labels touch (spine label rides the always-run spine)", () => {
  const themeView = VIEW_RECIPES.find((v) => v.id === 'theme-or-global-ui');
  const targets = themeView.smokeLabels;
  // Its labels span the spine (manager-default-selection) + three sections.
  assert.ok(D0_SPINE_LABELS.includes('manager-default-selection'));
  assert.equal(isD0SectionNeededForTargets('components-checks', targets), true); // manager-components-normal
  assert.equal(isD0SectionNeededForTargets('tags-essences', targets), true); // manager-essences-normal
  assert.equal(isD0SectionNeededForTargets('gathering', targets), true); // environments/tasks/events
  // No theme label lands in these, so they stay skippable.
  assert.equal(isD0SectionNeededForTargets('recipes', targets), false);
  assert.equal(isD0SectionNeededForTargets('overview-interactables', targets), false);
  assert.equal(isD0SectionNeededForTargets('import-alchemy-experimental', targets), false);
});

test('an unknown section name is fail-safe (runs) rather than silently skipped', () => {
  assert.equal(isD0SectionNeededForTargets('not-a-real-section', ['manager-recipes-normal']), true);
});

test('the harness wires a scoped-skip guard for every declared section (drift guard)', () => {
  for (const section of D0_SKIPPABLE_SECTIONS) {
    assert.ok(
      HARNESS.includes(`shouldRunScreenshotSection('${section.name}')`),
      `section '${section.name}' has no shouldRunScreenshotSection guard in the harness — it would never be skipped`,
    );
  }
  // The guard is inert under rc/ci/full: it short-circuits true when scoping is off.
  assert.ok(/function shouldRunScreenshotSection[\s\S]*?if \(!SCREENSHOT_SCOPING_ACTIVE\) return true;/.test(HARNESS));
});

test('no skippable-section label sits inside a DIFFERENT section\'s guard block (cross-section drift guard)', () => {
  // The partition test proves the MAP assigns each D0 label to one section; this proves
  // the HARNESS captures it there too. Without it, moving a label to the wrong section in
  // the map still passes partition, and a scoped run for its real section would skip its
  // frame — caught at runtime only as a loud collect "Missing smoke screenshots" throw.
  // A section's source span runs from its guard to the next section's guard (the last to
  // EOF). Labels emitted by a helper defined ABOVE the first guard (e.g.
  // captureRecipeEditorRoundtrip -> 'manager-recipes-editor-roundtrip') fall in no span
  // and are simply never attributed here — the invariant is only that a label must never
  // land in the WRONG span, which such labels cannot.
  const guards = D0_SKIPPABLE_SECTIONS.map(section => {
    const at = HARNESS.indexOf(`shouldRunScreenshotSection('${section.name}')`);
    assert.ok(at !== -1, `section '${section.name}' guard not found in harness`);
    return { name: section.name, at };
  }).sort((a, b) => a.at - b.at);

  for (let i = 0; i < guards.length; i += 1) {
    const start = guards[i].at;
    const end = i + 1 < guards.length ? guards[i + 1].at : HARNESS.length;
    const span = HARNESS.slice(start, end);
    for (const other of D0_SKIPPABLE_SECTIONS) {
      if (other.name === guards[i].name) continue;
      for (const label of other.labels) {
        assert.ok(
          !span.includes(`'${label}'`),
          `label '${label}' is mapped to section '${other.name}' but its literal sits inside the '${guards[i].name}' guard block — a scoped run for '${other.name}' would skip its frame (cross-section drift)`,
        );
      }
    }
  }
});
