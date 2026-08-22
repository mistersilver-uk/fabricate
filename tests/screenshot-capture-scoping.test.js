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
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, readdirSync } from 'node:fs';
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
import { runFixturedScreenshotSection } from '../scripts/lib/smokeSectionFixture.js';

const HARNESS = readFileSync('scripts/foundry-test-run.mjs', 'utf8');
const CAPTURE_MAP_SRC = readFileSync('scripts/lib/screenshotCaptureMap.js', 'utf8');
const SECTION_FIXTURE_SRC = readFileSync('scripts/lib/smokeSectionFixture.js', 'utf8');
// The two things that author click targets against the rendered manager: the Foundry smoke
// harness and the View Lab case registry. A selector shape that is unclickable is unclickable
// in both, so guards that can tell an unclickable control from a clickable one iterate this list
// rather than naming one producer. (A guard that only approximates the shape has to be scoped to
// the producer whose text it is known not to over-ban; the segment guard below does both.)
const CAPTURE_PRODUCERS = [
  { path: 'scripts/foundry-test-run.mjs', source: HARNESS },
  { path: 'scripts/lib/viewLabCases.js', source: readFileSync('scripts/lib/viewLabCases.js', 'utf8') },
];
const KNOWLEDGE_LABELS = [
  'manager-knowledge-owned-copies',
  'manager-knowledge-empty-tab',
  'manager-knowledge-learned-lost-copy',
  'manager-knowledge-party-pool-warning',
  'manager-knowledge-delete-armed',
  'manager-knowledge-narrow',
];
const TOOL_STUDIO_LABELS = [
  'manager-tool-parity-01-library-1280x720',
  'manager-tool-zero-state-empty-library-1280x720',
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
const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

function writeScopedRunEvidence(results, changedFiles, frames = []) {
  const runId = 'scoped-capture-test-run';
  const headSha = 'scope123';
  const targetLabels = mapChangedFilesToViews(changedFiles)
    .flatMap(view => view.smokeLabels);
  const captures = frames.map(({ file, label }) => ({
    file,
    label,
    width: 1,
    height: 1,
  }));
  for (const { file } of captures) {
    writeFileSync(join(results, file), ONE_PIXEL_PNG);
  }
  writeFileSync(join(results, 'summary.json'), JSON.stringify({
    passed: true,
    stepFailures: 0,
    consoleErrorCount: 0,
    degraded: false,
    rendererCrashed: false,
    screenshotRun: { runId, headSha, targetLabels },
  }));
  writeFileSync(join(results, 'screenshot-manifest.json'), JSON.stringify({
    runId,
    headSha,
    targetLabels,
    captures,
  }));
  return headSha;
}

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

test('Fabricate ApplicationV2 cleanup awaits close and guards Manager detachment', () => {
  assert.match(
    HARNESS,
    /closePromises\.push\(Promise\.resolve\(app\.close\(\{ force: true \}\)\)\)/,
    'ApplicationV2 close promises must be awaited before the next capture',
  );
  assert.match(
    HARNESS,
    /locator\('#fabricate-crafting-system-manager'\)[^]*?state: 'detached'/,
    'the interactables capture must not begin until the Crafting System Manager detaches',
  );
});

// ── Scoping map: a changed-file set → the EXACT captured-label set ──────────────

test('a broad styles/theme.css change scopes to theme-or-global-ui (6 core windows), NOT the full set', () => {
  const views = mapChangedFilesToViews(['styles/theme.css']);
  assert.deepEqual(views.map(v => v.id), ['theme-or-global-ui']);
  const labels = smokeLabelsForChangedFiles(['styles/theme.css']);
  // One frame per app-AREA shell plus the two manager archetypes (library vs editor),
  // rather than several frames from one area. See the recipe's comment for why each
  // earns its place; adding to this set costs every global change.
  assert.deepEqual(labels, [
    'manager-default-selection',
    'manager-components-normal',
    'manager-gathering-task-editor-normal',
    'player-crafting-simple',
    'player-inventory',
    'interactables-manager-list',
  ]);
  // The scoped set is a tiny fraction of the full capture catalogue, never all of it.
  assert.equal(labels.length, 6);
  assert.ok(labels.length < SCREENSHOT_CAPTURE_ORDER.length);
});

test('the global set spans every app-area shell, not just the manager', () => {
  const themeView = VIEW_RECIPES.find(v => v.id === 'theme-or-global-ui');
  // The regression this guards: the set was once manager-only, so a global stylesheet
  // change published six frames and verified the player app not at all — even though
  // `.fabricate-app` carries its own global rules and its own Foundry-override block.
  assert.ok(themeView.smokeLabels.some(l => l.startsWith('manager-')), 'no manager frame');
  assert.ok(themeView.smokeLabels.some(l => l.startsWith('player-')), 'no player-app frame');
  assert.ok(
    themeView.smokeLabels.some(l => l.startsWith('interactables-')),
    'no interactables-window frame'
  );
});

test('styles/fabricate.css scopes to the two rail frames and the global core set — NOT Tool Studio', () => {
  const views = mapChangedFilesToViews(['styles/fabricate.css']);
  assert.deepEqual(views.map(v => v.id).sort(), [
    'manager-rail-collapsed',
    'manager-rail-expanded',
    'theme-or-global-ui',
  ]);
  // The regression this guards: the global stylesheet used to be a Tool Studio trigger,
  // so every CSS edit anywhere demanded all 12 Tool Studio parity and stress frames.
  const ids = views.map(v => v.id);
  assert.ok(
    !ids.some(id => /library-1280x720|overview|breakage|requirements|validation|stress-/.test(id)),
    'a global stylesheet change must not pull in Tool Studio frames'
  );
});

test('Tool Studio frames are triggered only by Tool Studio files', () => {
  const own = mapChangedFilesToViews([
    'src/ui/svelte/apps/manager/tools/ToolBreakageTab.svelte',
  ]).map(v => v.id);
  assert.ok(own.includes('01-library-1280x720'), 'its own file must still trigger the set');
  assert.ok(own.includes('stress-wrapping-680'), 'stress frames too');
  // The manager ROUTER hosts every manager view, so it is a global change, not a Tool
  // Studio one.
  const root = mapChangedFilesToViews([
    'src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte',
  ]).map(v => v.id);
  assert.ok(root.includes('theme-or-global-ui'), 'the router must route to the global set');
  assert.ok(
    !root.some(id => /1280x720|stress-/.test(id)),
    'the router must not pull in Tool Studio frames'
  );
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

test("theme-or-global-ui's six labels are all reachable and span phase-D0 and phase-E", () => {
  const themeView = VIEW_RECIPES.find(v => v.id === 'theme-or-global-ui');
  for (const label of themeView.smokeLabels) {
    assert.ok(isCapturableLabel(label), `${label} unreachable`);
  }
  // A scoped global run now needs BOTH phases, because the set covers the player app as
  // well as the manager. That is the deliberate cost of the coverage: the old
  // manager-only set could skip phase E precisely because it never looked at
  // `.fabricate-app`.
  const phases = phasesForTargetLabels(themeView.smokeLabels);
  assert.deepEqual([...phases].sort(), [CAPTURE_PHASE_D0, CAPTURE_PHASE_E].sort());
  assert.equal(isPhaseNeededForTargets(CAPTURE_PHASE_D0, themeView.smokeLabels), true);
  assert.equal(isPhaseNeededForTargets(CAPTURE_PHASE_E, themeView.smokeLabels), true);
});

test('a player/craft target set needs phase-E; collect throws when a mapped view has zero candidates', () => {
  // player-inventory is a phase-E label.
  assert.equal(phaseForCaptureLabel('player-inventory'), CAPTURE_PHASE_E);
  assert.equal(isPhaseNeededForTargets(CAPTURE_PHASE_E, ['player-inventory']), true);

  const root = mkdtempSync(join(tmpdir(), 'fabricate-scope-'));
  try {
    const results = join(root, 'test-results');
    mkdirSync(results, { recursive: true });
    const changedFiles = ['src/ui/svelte/apps/inventory/InventoryView.svelte'];
    const headSha = writeScopedRunEvidence(results, changedFiles);
    // No frame for the mapped view → collect throws (a silently-empty scoped run
    // must fail loudly, never publish a missing view).
    assert.throws(
      () => collectScreenshotEvidence({
        changedFiles,
        prNumber: 826,
        root,
        headSha,
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
    const changedFiles = ['src/ui/svelte/apps/manager/SystemsBrowserView.svelte'];
    // A scoped `screenshots` run captures ONLY manager-systems' three labels and
    // renumbers the screenshot counter from 01 — a different absolute number than the
    // full walk, but the SAME relative capture order (filtering never reorders).
    const frames = [
      {
        file: 'screenshot-01-manager-default-selection.png',
        label: 'manager-default-selection',
      },
      {
        file: 'screenshot-02-manager-selected-normal.png',
        label: 'manager-selected-normal',
      },
      {
        file: 'screenshot-03-manager-selected-stacked.png',
        label: 'manager-selected-stacked',
      },
    ];
    const headSha = writeScopedRunEvidence(results, changedFiles, frames);

    const result = collectScreenshotEvidence({
      changedFiles,
      prNumber: 826,
      root,
      headSha,
    });
    assert.equal(result.copied.length, 1);
    // candidates[0] is the lowest-numbered = first-captured = manager-default-selection.
    assert.match(result.copied[0].source, /screenshot-01-manager-default-selection\.png$/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ── Requirement-rail capture states (issue 917) ────────────────────────────────

// Walk order, which is also the order they must appear in SCREENSHOT_CAPTURE_ORDER:
// scoping only FILTERS labels, never reorders them, so the relative order here is what
// keeps each view's single frame the one `collect` picks.
const REQUIREMENT_RAIL_LABELS = [
  'player-crafting-slot-rail',
  'player-crafting-tag-unmatched',
  'player-crafting-essence-pool',
  'player-crafting-pick-for-me',
  'player-crafting-essence-pool-shared',
  'player-crafting-consumption-plan',
];

test('every requirement-rail label is a capturable phase-E routine in walk order', () => {
  for (const label of REQUIREMENT_RAIL_LABELS) {
    assert.ok(isCapturableLabel(label), `${label} is not registered in SCREENSHOT_CAPTURE_ORDER`);
    // These frames are captured in the player-app walk, never the manager walk, so a
    // rail-only PR must be able to skip phase-D0's sections entirely.
    assert.equal(phaseForCaptureLabel(label), CAPTURE_PHASE_E, label);
    // The generic drift guard below proves every map label has a harness literal; this
    // states the stronger fact for these six — the literal is a real capture call.
    assert.match(HARNESS, new RegExp(`screenshot\\(page, '${label}'\\)`), label);
  }
  // The block sits between the existing essence frames and the multi-step frame, which
  // is where the walk actually captures it.
  assert.ok(
    captureOrderIndex('player-crafting-essence-shopping') < captureOrderIndex(REQUIREMENT_RAIL_LABELS[0]),
  );
  assert.ok(
    captureOrderIndex(REQUIREMENT_RAIL_LABELS.at(-1)) < captureOrderIndex('player-crafting-multistep'),
  );
  for (let i = 1; i < REQUIREMENT_RAIL_LABELS.length; i += 1) {
    assert.ok(
      captureOrderIndex(REQUIREMENT_RAIL_LABELS[i - 1]) < captureOrderIndex(REQUIREMENT_RAIL_LABELS[i]),
      `${REQUIREMENT_RAIL_LABELS[i - 1]} must be captured before ${REQUIREMENT_RAIL_LABELS[i]}`,
    );
  }
});

test('a requirement-rail-only change needs phase-E and NO phase-D0 section', () => {
  const targets = smokeLabelsForChangedFiles(['src/ui/svelte/util/requirementSlots.js']);
  assert.deepEqual(targets, REQUIREMENT_RAIL_LABELS);
  assert.equal(isPhaseNeededForTargets(CAPTURE_PHASE_E, targets), true);
  assert.equal(isPhaseNeededForTargets(CAPTURE_PHASE_D0, targets), false);
  for (const section of D0_SKIPPABLE_SECTIONS) {
    assert.equal(
      isD0SectionNeededForTargets(section.name, targets),
      false,
      `a rail-only target incorrectly kept D0 section '${section.name}'`,
    );
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

test('World Parties and World Travel capture-map order mirrors the live Foundry walk', () => {
  const start = HARNESS.indexOf('// World Parties plus World Travel (#1179');
  const end = HARNESS.indexOf('// Doc journey (quickstart Step 7', start);
  assert.ok(start >= 0 && end > start, 'the #1179 Foundry capture block must remain bounded');
  const harnessLabels = [
    ...HARNESS.slice(start, end).matchAll(
      /label: '(manager-world-(?:parties|travel)[^']+)'/g
    ),
  ].map((match) => match[1]);
  const mappedLabels = SCREENSHOT_CAPTURE_ORDER.filter(
    (label) => label.startsWith('manager-world-parties') || label.startsWith('manager-world-travel')
  );

  assert.deepEqual(mappedLabels, harnessLabels);
  assert.ok(!harnessLabels.includes('manager-world-parties-no-selection'));
  assert.ok(!harnessLabels.includes('manager-world-travel-long-label-focus'));
});

test('the Foundry Map capture uses a deterministic click while View Lab retains keyboard evidence', () => {
  const blockStart = HARNESS.indexOf('// World Parties plus World Travel (#1179');
  const mapDestinationStart = HARNESS.indexOf('const mapDestination = page.locator', blockStart);
  const mapPanelWait = HARNESS.indexOf('[data-travel-panel="map"]', mapDestinationStart);
  assert.ok(
    blockStart >= 0 && blockStart < mapDestinationStart && mapDestinationStart < mapPanelWait,
    'the #1179 Map interaction must remain bounded before its panel wait'
  );

  const mapInteraction = HARNESS.slice(mapDestinationStart, mapPanelWait);
  assert.match(mapInteraction, /await mapDestination\.click\(\)/);
  assert.doesNotMatch(mapInteraction, /\.press\('(?:Enter|Space)'\)/);

  const viewLabCases = CAPTURE_PRODUCERS.find(
    ({ path }) => path === 'scripts/lib/viewLabCases.js'
  ).source;
  const keyboardCaseStart = viewLabCases.indexOf(
    "id: 'manager-world-travel-long-label-focus'"
  );
  const keyboardCaseEnd = viewLabCases.indexOf('\n  managerCase({', keyboardCaseStart);
  assert.ok(
    keyboardCaseStart >= 0 && keyboardCaseEnd > keyboardCaseStart,
    'the View Lab Map keyboard evidence case must remain bounded'
  );
  const keyboardCase = viewLabCases.slice(keyboardCaseStart, keyboardCaseEnd);
  assert.match(
    keyboardCase,
    /selector: '#manager-travel-nav-map', press: 'Space'/
  );
  assert.match(keyboardCase, /#manager-travel-nav-map\[aria-current="page"\]:focus-visible/);
});

test('Phase C seeds system modifiers canonically before the settings-list action', () => {
  const phaseCStart = HARNESS.indexOf("startPhase('phase-C')");
  const gatheringStart = HARNESS.indexOf(
    "await game.settings.set('fabricate', 'gatheringConfig'",
    phaseCStart
  );
  const systemPatchStart = HARNESS.indexOf(
    '// Modifiers and Tools are SYSTEM-OWNED',
    gatheringStart
  );
  const systemPatchEnd = HARNESS.indexOf(
    '// Reference the deliberately-unlabelled tool',
    systemPatchStart
  );
  const listStart = HARNESS.indexOf('// --- Settings-list ergonomics (issue 768) ---');
  const firstAction = HARNESS.indexOf("locator('[data-toggle-modifier]')", listStart);
  assert.ok(
    phaseCStart >= 0 &&
      phaseCStart < gatheringStart &&
      gatheringStart < systemPatchStart &&
      systemPatchStart < systemPatchEnd &&
      systemPatchEnd < listStart &&
      listStart < firstAction,
    'the Phase-C gathering patch, canonical system patch, and list action must remain strictly ordered'
  );

  const gatheringPatch = HARNESS.slice(gatheringStart, systemPatchStart);
  const systemPatch = HARNESS.slice(systemPatchStart, systemPatchEnd);
  const beforeFirstAction = HARNESS.slice(listStart, firstAction);
  const systemObjectMatch = gatheringPatch.match(/^(\s*)\[systemId\]: \{/m);
  assert.ok(systemObjectMatch, 'the Phase-C gathering fixture must retain its system object');
  const topLevelCharacterModifiers = new RegExp(
    `^${systemObjectMatch[1]}  characterModifiers\\s*:`,
    'm'
  );
  assert.match(
    `${systemObjectMatch[1]}  characterModifiers: []`,
    topLevelCharacterModifiers,
    'the retired-key guard must detect a top-level system fixture library'
  );
  assert.doesNotMatch(
    `${systemObjectMatch[1]}    characterModifiers: []`,
    topLevelCharacterModifiers,
    'the retired-key guard must permit nested task, drop-row, and event references'
  );
  assert.doesNotMatch(gatheringPatch, topLevelCharacterModifiers);
  assert.match(systemPatch, /await csm\.updateSystem\(systemId, \{[\s\S]*?modifiers:\s*\[/);
  assert.match(systemPatch, /smoke-mod-herbalism/);
  assert.match(systemPatch, /smoke-mod-survival/);
  assert.match(systemPatch, /tools:\s*game\.settings\.get/);
  assert.match(beforeFirstAction, /modifierRows\.nth\(1\)\.waitFor/);
  assert.match(beforeFirstAction, /modifierRowCount !== 2/);
});

test('manager stability counts populated system Travel realm and map rows', () => {
  const guardStart = HARNESS.indexOf('async function assertManagerLayoutStable(page, label)');
  const rowCountStart = HARNESS.indexOf('const rowCount = metrics.filter', guardStart);
  const editFormCountStart = HARNESS.indexOf(
    'const editFormCount = metrics.filter',
    rowCountStart
  );
  assert.ok(
    guardStart >= 0 && guardStart < rowCountStart && rowCountStart < editFormCountStart,
    'the Manager layout measurement and row-count guard must remain bounded'
  );

  const measurementBlock = HARNESS.slice(guardStart, rowCountStart);
  const rowCountBlock = HARNESS.slice(rowCountStart, editFormCountStart);
  for (const selector of ['.manager-travel-realms-row', '.manager-map-link-row']) {
    assert.ok(
      measurementBlock.includes(`'${selector}'`),
      `${selector} must participate in overflow measurement`
    );
    assert.ok(
      rowCountBlock.includes(`metric.selector === '${selector}'`),
      `${selector} must satisfy the populated-row backstop`
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
  for (const name of ['components-checks', 'tags-essences', 'gathering', 'knowledge', 'overview-interactables', 'import-alchemy-experimental']) {
    assert.equal(isD0SectionNeededForTargets(name, targets), false, `recipe-only target should skip '${name}'`);
  }
});

test('a component-only target set runs ONLY components-checks; recipes is skippable', () => {
  const targets = ['manager-component-edit-salvage'];
  assert.equal(isD0SectionNeededForTargets('components-checks', targets), true);
  assert.equal(isD0SectionNeededForTargets('recipes', targets), false);
  assert.equal(isD0SectionNeededForTargets('gathering', targets), false);
});

// The bulk panel has FOUR sections and no single frame can hold them all, so issue 772
// ships three: the staged frame and the pristine/unstaged frame on the essence-bearing
// Arcane Forge, and the Progressive DC frame on the progressive system. The first two are
// components-checks captures; the third rides the existing progressive walk position.
const BULK_EDIT_LABELS = [
  'manager-components-bulk-edit',
  'manager-components-bulk-edit-unstaged',
  'manager-components-bulk-edit-progressive',
];
// Issue 1010 twins the surface in the Recipe Studio, whose panel has five axes and the same
// impossibility: the pristine draft and a staged one are the same controls in exclusive
// states, and the blocked-enable Callout exists only over a selection containing a refused
// recipe. All three are recipes-section captures.
const RECIPE_BULK_EDIT_LABELS = [
  'manager-recipes-bulk-edit',
  'manager-recipes-bulk-edit-unstaged',
  'manager-recipes-bulk-edit-blocked',
];
// The ONE shared scaffold all six route through (issue 1010 generalised it). The properties
// that survive parameterisation are asserted against THIS body; the ones that became studio
// data are asserted against the studio descriptors below, per studio.
const BULK_EDIT_SCAFFOLD = HARNESS.match(
  /async function captureBulkEditFrame\([\s\S]*?\n\}\n/,
)?.[0];

/**
 * One studio descriptor's source text.
 *
 * The selectors, the layout pin and the row-selection strategy moved OUT of the scaffold and
 * into these objects, so an assertion left pointing at the scaffold would pass by construction
 * — the literal it looks for can no longer appear there whatever the walk does. Each is
 * re-pinned here against the studio that owns it instead.
 *
 * @param {string} name The exported const name.
 * @returns {string|undefined} The `Object.freeze({ … })` body, or undefined when absent.
 */
const bulkEditStudio = (name) =>
  HARNESS.match(new RegExp(String.raw`const ${name} = Object\.freeze\(\{[\s\S]*?\n\}\);\n`))?.[0];

const COMPONENT_BULK_EDIT_STUDIO_SRC = bulkEditStudio('COMPONENT_BULK_EDIT_STUDIO');
const RECIPE_BULK_EDIT_STUDIO_SRC = bulkEditStudio('RECIPE_BULK_EDIT_STUDIO');

test('the issue-772 bulk-edit frames are scoped to the sections that can render them', () => {
  for (const label of BULK_EDIT_LABELS) {
    assert.equal(isCapturableLabel(label), true, label);
    assert.equal(phaseForCaptureLabel(label), CAPTURE_PHASE_D0, label);
  }

  // The two Arcane Forge frames belong to the components section — a bulk-edit target must
  // not resurrect the recipes, tools or gathering walks.
  const arcaneTargets = ['manager-components-bulk-edit', 'manager-components-bulk-edit-unstaged'];
  assert.equal(isD0SectionNeededForTargets('components-checks', arcaneTargets), true);
  for (const name of ['recipes', 'tags-essences', 'gathering', 'tools', 'knowledge', 'overview-interactables', 'import-alchemy-experimental']) {
    assert.equal(isD0SectionNeededForTargets(name, arcaneTargets), false, name);
  }

  // The Progressive DC frame is gated on `componentDifficultyAxisProgressive`, which is
  // false on Arcane Forge (routedByCheck crafting, routed salvage, d100 gathering) and
  // true only on the deliberately-broken progressive system. That system already has a
  // walk position in `overview-interactables`, so the frame reuses it rather than
  // reconfiguring a system mid-walk — and therefore scopes to THAT section, not this one.
  const progressiveTargets = ['manager-components-bulk-edit-progressive'];
  assert.equal(isD0SectionNeededForTargets('overview-interactables', progressiveTargets), true);
  assert.equal(isD0SectionNeededForTargets('components-checks', progressiveTargets), false);
  // It sits immediately after the browser frame that establishes that context, so a scoped
  // run reaches it without a second system switch.
  assert.equal(
    captureOrderIndex('manager-components-bulk-edit-progressive'),
    captureOrderIndex('manager-components-progressive') + 1,
  );

  // The staged frame is still captured immediately after the plain browser frame, so
  // `manager-components` keeps winning its own `candidates[0]` with
  // `manager-components-normal`; the unstaged frame follows it.
  assert.equal(
    captureOrderIndex('manager-components-bulk-edit'),
    captureOrderIndex('manager-components-normal') + 1,
  );
  assert.equal(
    captureOrderIndex('manager-components-bulk-edit-unstaged'),
    captureOrderIndex('manager-components-bulk-edit') + 1,
  );
});

test('the issue-1010 recipe bulk-edit frames are scoped to the recipes section', () => {
  for (const label of RECIPE_BULK_EDIT_LABELS) {
    assert.equal(isCapturableLabel(label), true, label);
    assert.equal(phaseForCaptureLabel(label), CAPTURE_PHASE_D0, label);
  }

  assert.equal(isD0SectionNeededForTargets('recipes', RECIPE_BULK_EDIT_LABELS), true);
  for (const name of ['components-checks', 'tags-essences', 'gathering', 'tools', 'knowledge', 'overview-interactables', 'import-alchemy-experimental']) {
    assert.equal(isD0SectionNeededForTargets(name, RECIPE_BULK_EDIT_LABELS), false, name);
  }

  // Captured immediately after the plain browser frame and BEFORE the narrow one, so
  // `manager-recipes` keeps winning its own `candidates[0]` with `manager-recipes-normal`
  // (`collect` takes the lowest capture counter among a view's labels) and all three are
  // taken at the width the shared scaffold's `recipes normal` layout pin is measured against.
  assert.equal(
    captureOrderIndex('manager-recipes-bulk-edit'),
    captureOrderIndex('manager-recipes-normal') + 1,
  );
  for (let i = 1; i < RECIPE_BULK_EDIT_LABELS.length; i += 1) {
    assert.equal(
      captureOrderIndex(RECIPE_BULK_EDIT_LABELS[i]),
      captureOrderIndex(RECIPE_BULK_EDIT_LABELS[i - 1]) + 1,
      `${RECIPE_BULK_EDIT_LABELS[i]} must follow ${RECIPE_BULK_EDIT_LABELS[i - 1]}`,
    );
  }
  assert.ok(
    captureOrderIndex(RECIPE_BULK_EDIT_LABELS.at(-1)) < captureOrderIndex('manager-recipes-narrow'),
    'the bulk frames precede the narrow frame, which re-measures the row at 900px',
  );
});

test('the shared bulk-edit capture scaffold writes nothing and hands the rail back', () => {
  assert.ok(BULK_EDIT_SCAFFOLD, 'the bulk-edit capture scaffold was not found in the harness');

  // NET-ZERO: the walk stages through the shipped controls and never presses Apply, so no
  // component and no recipe is written and no later frame in the section sees a mutated
  // fixture.
  //
  // Asserted over the WHOLE harness, per studio, rather than over the scaffold body. Under
  // issue 1010's parameterisation the scaffold no longer names either Apply hook at all, so
  // the shipped scaffold-scoped assertion became one that cannot fail however the walk
  // behaves — and an Apply click would in any case be written in a `stage` callback at a call
  // site, which is outside the scaffold. Both hooks are named because a guard that forbade
  // only the component one would let a recipe-studio Apply through, which is the same defect
  // one studio later.
  for (const applyHook of ['data-component-bulk-apply', 'data-recipe-bulk-apply']) {
    assert.equal(
      new RegExp(String.raw`${applyHook}\]'\)(?:\s*\.\w+\([^()]*\))*\s*\.click\(`).test(HARNESS),
      false,
      `the capture must never press Apply (${applyHook}) — it would rewrite the shared fixtures`,
    );
  }
  // Driven through the real controls, not seeded: `page.evaluate` here would touch
  // `game.` / settings / flags and photograph a state no GM can reach.
  assert.equal(
    /page\.evaluate\(/.test(BULK_EDIT_SCAFFOLD),
    false,
    'the bulk-edit state must be driven through the UI',
  );
  // It goes through `captureStableManagerView`, as the plain browser frame beside it does, so
  // the overflow and overlay guards run on the bulk state too rather than only the bare
  // `screenshot()`. The layout itself is now the studio's, and is pinned per studio below.
  assert.match(BULK_EDIT_SCAFFOLD, /captureStableManagerView\(page, \{ layout: studio\.layout, label \}\)/);
  // The panel REPLACES the single-row inspector; a rail rendering both is a failure, not a
  // frame. Nothing asserted this before it became shared, and it is the one property a
  // second studio could plausibly get wrong.
  assert.match(BULK_EDIT_SCAFFOLD, /studio\.displacedInspectorSelector\)\.count\(\) > 0/);
  // The selection is cleared in a `finally`, so a failed capture cannot leave the rail
  // showing the bulk panel for every following frame in the section — and a failed CLEAR is
  // recorded as its own failed step rather than swallowed, because that leak is silent
  // evidence corruption. It is recorded rather than thrown: throwing from this `finally`
  // would mask an in-flight capture error and abort the rest of the section, while a
  // recorded step failure is already fatal to the run.
  assert.match(BULK_EDIT_SCAFFOLD, /\} finally \{[\s\S]*?studio\.clearSelector/);
  assert.match(
    BULK_EDIT_SCAFFOLD,
    /\} finally \{[\s\S]*?results\.steps\.push\(\{ step: `\$\{stepName\}-cleared`, passed: false/,
  );
  assert.equal(
    /state: 'detached', timeout: 5_000 \}\)\.catch\(/.test(BULK_EDIT_SCAFFOLD),
    false,
    'a failed clear must not be swallowed by a bare .catch()',
  );
});

test('each bulk-edit studio pins its own layout, selection control and teardown hooks', () => {
  // The three literals the shipped scaffold-scoped assertions pinned — the layout, the row
  // box selector and the `finally` clear — are studio DATA now, so they are re-pinned here
  // against the studio that owns each one. Stated as a table so neither studio can be
  // dropped by an edit that only remembers the other.
  const studios = [
    {
      name: 'COMPONENT_BULK_EDIT_STUDIO',
      source: COMPONENT_BULK_EDIT_STUDIO_SRC,
      layout: 'components normal',
      rowBox: 'label:has(input[data-component-select])',
      clear: 'data-component-clear-selection',
      panel: 'data-component-bulk-panel',
      inspector: 'data-component-inspector',
    },
    {
      name: 'RECIPE_BULK_EDIT_STUDIO',
      source: RECIPE_BULK_EDIT_STUDIO_SRC,
      layout: 'recipes normal',
      rowBox: 'label:has(input[data-recipe-select])',
      clear: 'data-recipe-clear-selection',
      panel: 'data-recipe-bulk-panel',
      inspector: 'data-recipe-inspector',
    },
  ];

  for (const studio of studios) {
    assert.ok(studio.source, `${studio.name} was not found in the harness`);
    // The bulk state reuses the plain browser frame's pinned selectors — only the RAIL swaps
    // the inspector for the panel — so a layout name no guard knows would silently skip the
    // overflow measurement this capture depends on.
    assert.ok(
      studio.source.includes(`layout: '${studio.layout}'`),
      `${studio.name} must measure against the '${studio.layout}' layout pins`,
    );
    // The selection control is an `<input>` inside a `<label>`, never a `<button>`, which is
    // what keeps this walk's row-action button selectors resolving to one control per row.
    assert.ok(
      studio.source.includes(studio.rowBox),
      `${studio.name} must click the label wrapping its hidden selection input`,
    );
    for (const hook of [studio.clear, studio.panel, studio.inspector]) {
      assert.ok(studio.source.includes(hook), `${studio.name} must name ${hook}`);
      assert.ok(HARNESS.includes(hook), `${hook} is not reachable in the harness`);
    }
  }
});

test('the recipe bulk-edit frames pin their rows by NAME, not by position', () => {
  // The failure this exists to refuse: `manager-recipes-bulk-edit-blocked` is about ONE row —
  // the seeded off-and-un-enableable recipe that makes the panel's blocked count non-zero.
  // Selecting positionally would stage Enable over two ordinary recipes and publish the frame
  // with no Callout in it, while still satisfying every guard the scaffold has (two rows
  // selected, a visible count readout, a mounted panel).
  const blocked = HARNESS
    .split('await captureBulkEditFrame(page, results, {')
    .slice(1)
    .find((candidate) => candidate.match(/label: '([^']+)'/)?.[1] === 'manager-recipes-bulk-edit-blocked');
  assert.ok(blocked, 'the blocked recipe bulk-edit call site was not found');
  const body = blocked.slice(0, blocked.search(/\n *\}\);/));

  assert.match(
    body,
    /selectRows: selectRecipeRowsByName\('Temper a Blade'/,
    'the blocked frame must select the refused recipe by name, or it photographs no Callout',
  );
  // And it is held to what it claims: the panel's warning AND the row pill the warning is
  // counting, in the frame. Either alone publishes a lie.
  assert.match(body, /data-recipe-bulk-blocked-warning/);
  assert.match(body, /Temper a Blade"\) \[data-status-pill="danger"\]/);

  // `selectRecipeRowsByName` fails loudly on a name that matches no row rather than
  // degrading to whatever happened to be first — the degradation IS the defect.
  const strategy = HARNESS.match(/function selectRecipeRowsByName\([\s\S]*?\n\}\n/)?.[0];
  assert.ok(strategy, 'the by-name row selection strategy was not found');
  assert.match(strategy, /throw new Error\(`Recipe browser rendered no row named/);
});

// Every `<SegmentedControl … />` call site's `optionDataAttr`, read out of the components
// themselves. The ban below is keyed on THIS set — on the component that traps the click — and
// deliberately not on how an attribute happens to be spelled. A name-shaped key (`*-option`)
// is wrong in both directions: it misses the real `SegmentedControl` axes that are not spelled
// that way (`data-trigger-outcome`, `data-trigger-tier-step-mode`, `data-recipe-tag-match`),
// and it over-bans `RadioCardGroup`, whose radio is a visible 16x16 in-flow control
// (`.manager-resolution-option input[type='radio']` in `styles/fabricate.css`) that a producer
// may click through perfectly safely.
// Rooted at the whole of `src` rather than `src/ui/svelte`: the scan is recursive either way,
// so the wider root costs nothing and removes the "a call site outside the UI root would be
// missed" hole instead of merely documenting it.
const SVELTE_SOURCE_ROOT = 'src';

function segmentedControlCallSites() {
  const usages = [];
  let occurrences = 0;
  for (const entry of readdirSync(SVELTE_SOURCE_ROOT, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.svelte')) continue;
    const source = readFileSync(join(entry.parentPath, entry.name), 'utf8');
    occurrences += (source.match(/<SegmentedControl\b/g) ?? []).length;
    for (const usage of source.match(/<SegmentedControl\b[\s\S]*?\/>/g) ?? []) {
      usages.push(usage);
    }
  }
  return { usages, occurrences };
}

// A real smoke failure, not a hypothetical: the two recipe bulk-edit frames staged their
// segmented axes with `[data-recipe-bulk-lock-option="lock"] input`, and both steps timed out
// after 30s with `<span class="manager-segment-label">Lock</span> intercepts pointer events`.
// `SegmentedControl.svelte` hides its real radio at 1x1 under `clip: rect(0 0 0 0)`, and an
// absolutely-positioned child of a `justify-content: center` flex container takes its static
// position at that container's CENTRE — so the radio's 1px box sits directly beneath the middle
// of the visible span. Playwright does not fall back to the enclosing label; it fails the step.
//
// The harness had no working precedent to copy, which is how the wrong shape got in: the
// Component Studio's bulk panel renders NO segmented control (its axes are a select, a stepper,
// tri-state tag chips and a number field), and the harness's only other `-option=` selector
// merely counts `.is-active`. So no smoke step had ever successfully clicked a segment.
//
// The View Lab registry never carried this defect. Its two genuine `SegmentedControl` steps —
// `[data-recipe-bulk-status-option="enable"]` and `[data-recipe-bulk-lock-option="lock"]` in
// `scripts/lib/viewLabCases.js` — were authored against the label from the start, which is
// correct. The ban is prophylactic for BOTH producers: it is the shape that is unclickable, so
// nothing about it is specific to the harness that happened to hit it first.
//
// This is a source-text guard because `npm test` cannot run the harness — it top-level-imports
// Playwright and launches Docker — and `scripts/foundry-test-run.mjs` is outside the ESLint and
// Prettier globs too, so nothing else here would catch the regression before a 13-minute run.
test('no capture producer clicks the hidden radio inside a SegmentedControl segment', () => {
  const helper = HARNESS.match(/async function clickSegment\([\s\S]*?\n\}\n/)?.[0];
  assert.ok(helper, 'the segment-click helper was not found in the harness');
  assert.match(
    helper,
    /locator\(`label\[\$\{optionDataAttr\}="\$\{value\}"\]`\)/,
    'the helper must target the wrapping label, which is what carries `optionDataAttr`',
  );
  // A missing segment must report as a missing segment, not as a 30s actionability timeout —
  // that indistinguishability is what let the defect sit unread in the run output.
  assert.match(helper, /waitFor\(\{ state: 'visible'/);

  // Both recipe frames route through it rather than hand-rolling a selector again.
  assert.match(HARNESS, /clickSegment\(bulkPanel, 'data-recipe-bulk-lock-option', 'lock'\)/);
  assert.match(HARNESS, /clickSegment\(bulkPanel, 'data-recipe-bulk-status-option', 'enable'\)/);

  const { usages, occurrences } = segmentedControlCallSites();
  const attributes = [
    ...new Set(usages.map((usage) => usage.match(/optionDataAttr="([^"]+)"/)?.[1]).filter(Boolean)),
  ];

  // A derived ban whose input set silently empties passes forever while checking nothing, so
  // the derivation states its own preconditions rather than degrading to a no-op (issue #948).
  // Every `<SegmentedControl` must have parsed into a whole element — an unterminated one would
  // let `[\s\S]*?\/>` run past its call site and read a LATER component's `optionDataAttr`.
  assert.equal(
    occurrences,
    usages.length,
    'every <SegmentedControl opening tag began its own parsed span — none was swallowed by the span before it',
  );
  // The attribute is read with a literal-value regex, so `optionDataAttr={someVar}` would yield
  // `undefined`, be dropped by `.filter(Boolean)`, and under-cover that axis with no signal at
  // all — the same silent degradation the count check above exists to refuse.
  for (const usage of usages) {
    assert.equal(
      /optionDataAttr=\{/.test(usage),
      false,
      'a computed optionDataAttr cannot be read out of the source, so this axis would be banned nowhere: give it a literal name or teach this scan to resolve it',
    );
  }
  assert.ok(attributes.length > 0, 'the SegmentedControl optionDataAttr scan derived nothing to ban');
  for (const attribute of attributes) {
    assert.match(attribute, /^[\w-]+$/, `${attribute} is a plain name safe to key a selector ban on`);
  }
  // Non-empty is not the same as reaching the call sites that matter: the two axes the harness
  // clicks by name above must be IN the derived set, which is also what proves those two are
  // segmented controls rather than some other primitive that happens to take `optionDataAttr`.
  for (const clicked of ['data-recipe-bulk-status-option', 'data-recipe-bulk-lock-option']) {
    assert.ok(attributes.includes(clicked), `${clicked} is a derived SegmentedControl axis`);
  }

  // `input:checked` is deliberately legal in both bans below. A checked-state read — the
  // unstaged recipe frame's sentinel, `waitFor({ state: 'attached' })` over
  // `[…-option="unchanged"] input:checked` — resolves through the accessibility tree and never
  // hit-tests, so it needs the input and the label cannot intercept it. No call site depends on
  // the DERIVED ban's carve-out today, because that sentinel builds its attribute name by
  // interpolation and therefore matches no literal-name trap at all; the derived ban carries the
  // lookahead so that it and the generic net — which DOES see that line — agree on what is
  // legal, rather than one banning what the other permits.
  for (const producer of CAPTURE_PRODUCERS) {
    for (const attribute of attributes) {
      const trap = new RegExp(`\\[${attribute}="[^"]*"\\] input(?!:checked)`, 'g');
      assert.deepEqual(
        producer.source.match(trap) ?? [],
        [],
        `${producer.path}: \`[${attribute}="…"] input\` is the segmented-control interception trap`,
      );
    }
  }

  // The derived ban is keyed on literal attribute names, and this harness spells exactly this
  // family by interpolation — `` `[data-recipe-bulk-${axis}-option="unchanged"] input:checked` ``
  // — so a new frame written in the harness's own established idiom, `` `[data-recipe-bulk-
  // ${axis}-option="lock"] input` ``, contains no literal `data-recipe-bulk-lock-option` and the
  // derived trap never sees it. That is precisely the defect that shipped. So the harness also
  // gets a generic net over the SHAPE, independent of how the attribute name was assembled.
  //
  // HARNESS-ONLY, deliberately. `scripts/lib/viewLabCases.js` legitimately clicks
  // `[data-crafting-modifier-policy-option="playerPicks"] input` and
  // `[data-dc-mode-option="dynamic"] input`; both are `RadioCardGroup`, whose radio is a visible
  // in-flow 16x16 control that is safe to click through, and banning the shape there would
  // reinstate the over-ban this guard was rewritten to drop. Only the derived, component-keyed
  // ban above — which knows a `SegmentedControl` from a `RadioCardGroup` — applies to both
  // producers. The harness's only text of this shape today is the `:checked` sentinel.
  const interpolationSafeTrap = /-option="[^"]*"\] input(?!:checked)/g;
  assert.deepEqual(
    HARNESS.match(interpolationSafeTrap) ?? [],
    [],
    'scripts/foundry-test-run.mjs: a `…-option="…"] input` click target is the segmented-control interception trap — click the wrapping label via clickSegment()',
  );
});

// ── The Checks Studio's navigation hooks (issue 1096) ─────────────────────────────────────
//
// Issue 1096 replaced the four `data-checks-tab-button` ACTIVITY TABS with four rail routes and
// a five-section strip. The smoke walk went on clicking the tabs and NOTHING failed: that hook
// lived only in Svelte markup and in a Playwright selector string, so no unit test, lint rule or
// type check ever saw the pair. The walk against real Foundry is the only thing that does, and
// it is a manual twenty-minute run — which is how a whole surface's navigation came to be broken
// on a branch whose CI was green.
//
// So both capture producers get a source-text contract: every `data-checks-*` attribute NAME
// they navigate by must still be authored in the Checks Studio's own source. Name-level rather
// than value-level, because the markup interpolates the values (`data-checks-panel={activity}`)
// — and name-level is exactly the granularity this defect needed, since `data-checks-tab-button`
// left `src/` altogether.
const CHECKS_STUDIO_DIR = 'src/ui/svelte/apps/manager/checks';
const CHECKS_STUDIO_SRC = [
  ...readdirSync(CHECKS_STUDIO_DIR).map((entry) => join(CHECKS_STUDIO_DIR, entry)),
  'src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte',
]
  .map((path) => readFileSync(path, 'utf8'))
  .join('\n');

test('every Checks hook a capture producer navigates by is still shipped', () => {
  const shipped = new Set(
    [...CHECKS_STUDIO_SRC.matchAll(/\b(data-checks-[\w-]+)/g)].map((match) => match[1]),
  );
  // A derived contract whose input set silently empties passes forever while checking nothing.
  // These three are the routing spine — the view wrapper, the activity panel and the section
  // strip — so their absence means the scan read the wrong files, not that the product changed.
  for (const anchor of ['data-checks-editor', 'data-checks-panel', 'data-checks-section-button']) {
    assert.ok(shipped.has(anchor), `the Checks Studio source scan found no ${anchor}`);
  }

  let navigated = 0;
  for (const producer of CAPTURE_PRODUCERS) {
    for (const [, hook] of producer.source.matchAll(/\[(data-checks-[\w-]+)[=\]]/g)) {
      navigated += 1;
      assert.ok(
        shipped.has(hook),
        `${producer.path}: \`${hook}\` is not authored anywhere in the Checks Studio — it names a control the product no longer has`,
      );
    }
  }
  assert.ok(navigated > 0, 'no capture producer selects a Checks hook, so this guard checks nothing');

  // The rail sub-item is addressed by its id, built by interpolation at both ends, so the
  // name-level scan above cannot see it. Pin the two halves against each other instead.
  assert.match(HARNESS, /#manager-checks-nav-\$\{activity\}/);
  assert.match(CHECKS_STUDIO_SRC, /id=\{`manager-checks-nav-\$\{checksItem\.id\}`\}/);
});

test('each issue-772 bulk-edit frame stages the axes only IT can evidence', () => {
  // Split rather than one lazy regex per label: a `[\s\S]*?label: '<wanted>'` starts at the
  // EARLIEST call site and happily swallows the two before it, which would let a staging
  // control from the staged frame satisfy — or here, break — an assertion about another.
  // Each segment is then truncated at its own `});` terminator, which is the first line in
  // it that is nothing but indentation and the closer.
  const callOf = (label) => {
    const segment = HARNESS
      .split('captureBulkEditFrame(page, results, {')
      .slice(1)
      .find((candidate) => candidate.match(/label: '([^']+)'/)?.[1] === label);
    if (!segment) return null;
    const end = segment.search(/\n *\}\);/);
    return end === -1 ? null : segment.slice(0, end);
  };

  // STAGED: a category, both tag tri-states, and the essence axis armed.
  const staged = callOf('manager-components-bulk-edit');
  assert.ok(staged, 'the staged bulk-edit call site was not found');
  assert.match(staged, /data-bulk-tag-state="\$\{state\}"/);
  assert.match(staged, /data-component-bulk-essences\] \[data-component-edit-essence\] \[data-stepper-increment\]/);

  // UNSTAGED: the pristine draft. Nothing is staged, so the ASSERTIONS are the state —
  // Apply inert, and the essence chip on the unstaged face that is the only route to
  // "clear essences on every selected component". It must not touch a staging control, or
  // it would photograph the frame it exists to be the opposite of.
  const unstaged = callOf('manager-components-bulk-edit-unstaged');
  assert.ok(unstaged, 'the unstaged bulk-edit call site was not found');
  assert.match(unstaged, /data-component-bulk-essences-staged="false"/);
  assert.match(unstaged, /if \(!await bulkPanel\.locator\('\[data-component-bulk-apply\]'\)\.first\(\)\.isDisabled\(\)\)/);
  for (const stagingControl of [
    'data-component-bulk-category',
    'data-bulk-tag',
    'data-stepper-increment',
    'data-component-bulk-difficulty',
  ]) {
    assert.equal(
      unstaged.includes(stagingControl),
      false,
      `the unstaged frame must not drive ${stagingControl}`,
    );
  }

  // PROGRESSIVE: the fourth section, plus the empty item-tag copy that only a system with
  // no authored tags can show. Both are why this frame exists at all.
  const progressive = callOf('manager-components-bulk-edit-progressive');
  assert.ok(progressive, 'the progressive bulk-edit call site was not found');
  assert.match(progressive, /data-component-bulk-tags-empty/);
  assert.match(progressive, /data-component-bulk-difficulty\]'\)\.first\(\)\.fill\('12'\)/);
  assert.match(progressive, /data-component-bulk-difficulty-staged="true"/);
});

test('a Tool Studio target runs only the dedicated persisted-net-zero tools section', () => {
  assert.equal(isD0SectionNeededForTargets('tools', TOOL_STUDIO_LABELS), true);
  for (const name of ['recipes', 'components-checks', 'tags-essences', 'gathering', 'knowledge', 'overview-interactables', 'import-alchemy-experimental']) {
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
        String.raw`await resetToolStudioScroll\(page\);\s*await (?:captureToolStudioProduct\(page, '${label}', \w+\)|screenshot\(page, '${label}'(?:, \{[\s\S]*?\})?\));`
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
  assert.match(
    managerReadiness,
    /explicitApp = globalThis\.__fabricateSmokeManagerApp[\s\S]*?new Set\(\[explicitApp, \.\.\.registeredApps\]\.filter\(Boolean\)\)/,
  );
  assert.match(managerReadiness, /app\?\.element \?\? app\?\._element[\s\S]*?rawElement\?\.\[0\] \?\? rawElement/);
  assert.match(
    managerReadiness,
    /document\.querySelectorAll\(selector\)[\s\S]*?renderedOuters\.length !== 1[\s\S]*?ownsRenderedManager/
  );
  assert.match(
    managerReadiness,
    /page\.evaluate\(resolveRegisteredManager, outerSelector\)/,
  );
  assert.match(
    managerReadiness,
    /element\?\.contains\?\.\(renderedManager\)[\s\S]*?ownsManager[\s\S]*?ownsRenderedManager/
  );
  assert.match(
    managerReadiness,
    /liveMatches\.length !== 1[\s\S]*?applicationCandidates[\s\S]*?globalThis\.__fabricateSmokeManagerApp = liveMatches\[0\]\.app/,
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
  assert.match(
    toolStudioWalk,
    /did not automatically select Smith's Hammer[\s\S]*?const otherSelectTarget/,
    'first-row auto-selection must be observed before any harness selection click',
  );
  assert.match(HARNESS, /visibleToolRows\.first\(\)[\s\S]*?Tool Studio parity library must select Smith's Hammer in the first row/);
  assert.match(HARNESS, /data-tool-inspector-description[\s\S]*?well-balanced forge hammer/);
  assert.match(
    HARNESS,
    /route transition asks ApplicationV2[\s\S]*?sourceViewport: \{ width: 1280, height: 720 \}/,
  );
  assert.match(
    toolStudioWalk,
    /setPosition\([\s\S]*?width: 900[\s\S]*?replacementSourceItem[\s\S]*?sidebar source remains occluded[\s\S]*?\.dragTo\(sourceCard\)[\s\S]*?sourceViewport: \{ width: 1280, height: 720 \}[\s\S]*?withSingleToolClipboardWrite\([\s\S]*?fixture\.replacementSourceItemUuid[\s\S]*?copySourceUuid\.click\(\)[\s\S]*?data-tool-editor-back[\s\S]*?data-action="discard"[\s\S]*?Smith's Hammer/,
    'the second world Item must replace the source through a real sidebar drag, Copy UUID, and UI Discard restore',
  );
  assert.doesNotMatch(toolStudioWalk, /new DataTransfer|dispatchEvent\('drop'|data-tool-source-picker|manager-tool-source-replace/);
  assert.match(HARNESS, /async function withSingleToolClipboardWrite[\s\S]*?copyToClipboard[\s\S]*?calls\?\.length === 1[\s\S]*?info\.length !== 1[\s\S]*?errors\.length !== 0/);
  assert.match(
    HARNESS,
    /async function assertToolLibraryPagination[\s\S]*?data-tool-library[\s\S]*?data-tool-library-scroll[\s\S]*?data-tool-browser-pagination[\s\S]*?selectedFirst[\s\S]*?DOCUMENT_POSITION_FOLLOWING[\s\S]*?footer moved when only the result list scrolled/,
  );
  const issue800Search = HARNESS.indexOf("getByRole('searchbox', { name: 'Search components' })");
  const issue800Fill = HARNESS.indexOf('componentSearch().fill(componentName)', issue800Search);
  const issue800Wait = HARNESS.indexOf("identity.waitFor({ state: 'visible'", issue800Fill);
  assert.ok(
    issue800Search > 0 && issue800Fill > issue800Search && issue800Wait > issue800Fill,
    'issue-800 evidence must reveal a paginated component before selecting it',
  );
  assert.match(
    toolStudioWalk,
    /expectedTotal: 8[\s\S]*?sourceViewport: \{ width: 1280, height: 520 \}[\s\S]*?expectedTotal: 8[\s\S]*?smoke-tool-studio-pagination-ninth[\s\S]*?expectedTotal: 9[\s\S]*?data-pagination-next[\s\S]*?expectedPage: 2[\s\S]*?Tool footer moved when the page changed/,
    'the real library must cover tall/short one-page and 9+ pagination states',
  );
  assert.match(
    toolStudioWalk,
    /paginationComponentId[\s\S]*?smoke-tool-studio-pagination-ninth[\s\S]*?componentId: paginationComponentId/,
    'the synthetic ninth Tool must carry a valid managed Component identity',
  );
  assert.ok(HARNESS.includes("editor.locator('[data-tool-prerequisite-row]').count() !== 5"));
  assert.match(
    toolStudioWalk,
    /const expectedPrerequisiteNames = \[[\s\S]*?'Expert Crafter'[\s\S]*?"Proficient with Smith's Tools"[\s\S]*?'Attuned to the Weave'[\s\S]*?'Strength 13 or higher'[\s\S]*?'Trained in Arcana'[\s\S]*?Tool Studio parity prerequisite order drifted/,
  );
  assert.ok(HARNESS.includes("editor.locator('[data-tool-validation-check].is-invalid').count() !== 0"));
  assert.match(
    toolStudioWalk,
    /input\[name="tool-on-break"\]\[value="destroy"\][\s\S]*?saveToolStudioDraftIfDirty\(editor\)[\s\S]*?tab\('requirements'\)/,
    'Requirements parity must be captured from a saved destroy-action baseline',
  );
  assert.match(
    toolStudioWalk,
    /Tool invalid prerequisite fixture[\s\S]*?data-editor-validation-summary="block"[\s\S]*?data-tool-validation-check="prerequisites"\]\.is-invalid[\s\S]*?Tool prerequisite fixture restore[\s\S]*?saveToolStudioDraftIfDirty\(editor\)[\s\S]*?tab\('breakage'\)/,
    'the invalid Validation frame must use a guaranteed domain blocker, then restore and save the prerequisite baseline',
  );
  for (const label of [
    'manager-tool-parity-01-library-1280x720',
    'manager-tool-zero-state-empty-library-1280x720',
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
  assert.match(
    toolStudioWalk,
    /screenshot\(page, 'manager-tool-stress-wrapping-680', \{\s*clip: \{ x: 0, y: 0, width: 680, height: 700 \},\s*\}\)/,
    'the 680px stress frame must declare its truthful full-viewport dimensions in the manifest',
  );
  assert.match(toolStudioWalk, /clickToolTabAndAssertEffect\(page,[\s\S]*?900px/);
  assert.match(toolStudioWalk, /clickToolTabAndAssertEffect\(page,[\s\S]*?680px/);
  assert.match(
    HARNESS,
    /async function waitForToolEnabledState[\s\S]*?persisted === expected[\s\S]*?aria-pressed[\s\S]*?String\(expected\)/,
  );
  assert.match(
    toolStudioWalk,
    /persistedEnabledBefore[\s\S]*?waitForToolEnabledState\([\s\S]*?!persistedEnabledBefore[\s\S]*?waitForToolEnabledState\([\s\S]*?persistedEnabledBefore/,
  );
  assert.match(toolStudioWalk, /selectedToolIds[\s\S]*?fixture\.toolId/);
  assert.match(toolStudioWalk, /data-tool-library-empty[\s\S]*?data-tool-browser-inspector-empty[\s\S]*?manager-tool-zero-state-empty-library-1280x720/);
  assert.match(
    toolStudioWalk,
    /emptyInspectorBounds[\s\S]*?emptyInspectorContentBounds[\s\S]*?Math\.abs\(inspectorCenterY - contentCenterY\) > 2[\s\S]*?empty inspector is not vertically centered/,
    'the empty inspector content must be vertically centered in the full right rail',
  );
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
    /scrollToolEditorPanelToReveal\([\s\S]*?data-tool-replacement-target[\s\S]*?manager-tool-stress-replacement/,
    'replacement stress evidence must reveal the complete managed Component card in the editor pane',
  );
  assert.match(
    HARNESS,
    /const addRepairAlternative = firstRepairGroup\.locator\('\[data-recipe-add="alternative-component"\]'\);[\s\S]*?assertPointerTarget\(page, addRepairAlternative,[\s\S]*?Tool repair OR add-component control[\s\S]*?withSingleToolStoreMutation\([\s\S]*?'Tool repair OR add'/,
  );
  assert.match(
    HARNESS,
    /const addRepairGroup = editor\.locator\('\[data-tool-repair-requirements\] \[data-recipe-add="tag-requirement"\]'\);[\s\S]*?assertPointerTarget\(page, addRepairGroup,[\s\S]*?Tool repair AND control[\s\S]*?withSingleToolStoreMutation\([\s\S]*?'Tool repair AND add'/,
    'the repair group control must choose one strict-safe pointer target and mutate once',
  );
  assert.doesNotMatch(HARNESS, /\.manager-tool-repair-add-option select/);
  assert.doesNotMatch(HARNESS, /\.manager-recipe-or-trigger/);
  assert.match(
    HARNESS,
    /const componentTarget = replacementGrid\.locator\('\.manager-tool-replacement-component-trigger'\);[\s\S]*?'Component replacement selection'[\s\S]*?\(\) => componentOption\.click\(\)[\s\S]*?Component replacement selection did not update the draft control/,
  );
  assert.doesNotMatch(toolStudioWalk, /Direct Item replacement|data-tool-replacement-type|data-tool-replacement-picker/);
  assert.match(
    toolStudioWalk,
    /withSingleToolStoreMutation\(\s*page,\s*'setToolBreakageAuthority',\s*'check-driven authority',\s*\(\) => checkDriven\.click\(\),\s*\(\) => waitForToolBreakageAuthority\(page, systemId\),[\s\S]*?withSingleToolDraftTransition\(\s*page,\s*fixture\.toolId,\s*'check-driven Tool Edit route'/,
    'the persisted + projected authority mutation must settle before the exactly-once Edit route',
  );
  assert.match(
    HARNESS,
    /async function withSingleToolDraftTransition[\s\S]*?viewState\.subscribe[\s\S]*?const distinctTransitions = report\.transitions\.filter[\s\S]*?distinctTransitions\.length !== 1[\s\S]*?publish exactly one distinct Tool draft transition/,
    'selection and Edit must count one distinct live view-state transition instead of treating identical reactive publications as separate routes',
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
  // The closing move is RE-EXPRESSED, not relaxed (issue 1096). It used to be a bare Checks
  // rail click, because the trigger card the next span drives was one scroll down a single
  // Checks tab. The tabs are rail routes now and each route renders ONE section at a time, so
  // reaching that card is a route AND a section — and a walk that lands on the crafting route
  // without selecting Triggers finds no trigger card at all. Pinning the section is what makes
  // that mistake fail here rather than 13 minutes into a real run.
  assert.match(
    toolStudioWalk,
    /const recipeToolRow = page\.locator\([\s\S]*?select, \[data-recipe-tool-bonus-mode\][\s\S]*?must not expose Tool breakage or check-bonus policy controls[\s\S]*?unexpectedly dirtied the Recipe draft[\s\S]*?openChecksActivity\(page, 'crafting', 'triggers'\)/,
    'the Recipe Tools check must prove policy-free rows without dirtying the Recipe draft',
  );
  assert.match(
    HARNESS,
    /const fieldsetState = await fieldset\.evaluate\(\(element\) => \(\{[\s\S]*?disabled: element\.disabled === true,[\s\S]*?matchesDisabled: element\.matches\(':disabled'\),[\s\S]*?\}\)\);/,
  );
  assert.doesNotMatch(
    HARNESS,
    /\[data-manager-tools-authority\] label\.is-selected:has\(input\[value="checkDriven"\]\)/,
  );
  // The setup → exercise → finally-restore scaffold now lives in the shared
  // `runFixturedScreenshotSection` helper (the Knowledge section reuses it), so what
  // the harness must still prove is that the Tool Studio section routes its restore
  // through that helper's `restore` slot — never that it merely mentions the function.
  assert.match(
    HARNESS,
    /runFixturedScreenshotSection\(\{[\s\S]*?step: 'tool-studio-evidence',[\s\S]*?restore: \(fixture\) => restoreToolStudioFixture\(/,
    'the Tool Studio section must hand its restore to the shared fixtured-section helper',
  );
  assert.match(
    HARNESS,
    /step: 'tool-studio-evidence',\s*rethrow: true,/,
    'a Tool Studio failure must still abort the phase rather than reporting a green run',
  );
});

// ── The Phase-D0 tier-step walk (issue 975) ────────────────────────────────────

const CHECK_TRIGGERS_SRC = readFileSync(
  'src/ui/svelte/apps/manager/checks/CheckTriggers.svelte',
  'utf8',
);

test('the Phase D0 tier-step walk drives hooks the trigger component still emits', () => {
  // `scripts/foundry-test-run.mjs` is entry #4 in `KNOWN_UNGATED_SCRIPTS`, so neither
  // `npm run lint` nor `npm run format:check` reads it and this file is the walk's only
  // gate. Issue 975 deleted the `[data-check-nat-stepping]` card the walk used to
  // round-trip and replaced it with a trigger-authoring walk over the tier-step row, so
  // these selectors are a hand-maintained mirror of `CheckTriggers.svelte`.
  //
  // BOTH sides are asserted, not just the harness: a harness-only pin stays green
  // through a rename in the component, which is exactly the drift that would surface as
  // a post-merge beta smoke break rather than a red PR.
  for (const hook of [
    'data-trigger-tier-step',
    'data-trigger-tier-step-steps',
    'data-trigger-tier-step-target',
    'data-triggers-empty',
  ]) {
    assert.ok(HARNESS.includes(hook), `the Phase D0 walk no longer drives [${hook}]`);
    assert.ok(
      CHECK_TRIGGERS_SRC.includes(hook),
      `CheckTriggers.svelte no longer emits [${hook}], so the walk points at nothing`,
    );
  }

  // The mode segments are stamped by `SegmentedControl`'s `optionDataAttr`, so the
  // attribute NAME and the option VALUE are authored apart and only the harness pairs
  // them into one selector — which is the pairing that can rot silently.
  assert.ok(HARNESS.includes('[data-trigger-tier-step-mode="up"]'), 'the up segment');
  assert.ok(HARNESS.includes('[data-trigger-tier-step-mode="target"]'), 'the target segment');
  assert.match(CHECK_TRIGGERS_SRC, /optionDataAttr="data-trigger-tier-step-mode"/);
  const tierStepModes = CHECK_TRIGGERS_SRC.match(/const TIER_STEP_MODES = \[[\s\S]*?\n {2}\];/)?.[0];
  assert.ok(tierStepModes, 'the TIER_STEP_MODES declaration was not found');
  for (const mode of ['up', 'target']) {
    assert.ok(
      tierStepModes.includes(`value: '${mode}'`),
      `TIER_STEP_MODES no longer offers a '${mode}' segment for the walk to click`,
    );
  }

  // The walk AUTHORS a trigger, so it must remove it again: a left-behind trigger
  // dirties the Checks draft and the next navigation raises a discard prompt mid-phase.
  assert.ok(HARNESS.includes('[data-add-trigger]'), 'the walk must add a trigger');
  assert.ok(
    HARNESS.includes('[data-trigger] [data-remove-trigger]'),
    'the walk must remove the trigger it authored',
  );
});

// ── The shared fixtured-section lifecycle (issues #784 / 785) ──────────────────

test('the shared fixtured-section helper always restores, even when setup or the walk throws', async () => {
  const calls = [];
  const results = { steps: [] };
  const ok = await runFixturedScreenshotSection({
    results,
    step: 'demo',
    setup: async () => { calls.push('setup'); return { id: 'fixture' }; },
    exercise: async (fixture) => { calls.push(`exercise:${fixture.id}`); },
    restore: async (fixture) => { calls.push(`restore:${fixture?.id ?? 'null'}`); },
  });
  assert.deepEqual(calls, ['setup', 'exercise:fixture', 'restore:fixture']);
  assert.deepEqual(results.steps, [{ step: 'demo', passed: true }]);
  assert.equal(ok.passed, true);

  // A failing walk still restores the fixture it seeded, and rethrows by default.
  const failing = [];
  const failingResults = { steps: [] };
  await assert.rejects(
    () => runFixturedScreenshotSection({
      results: failingResults,
      step: 'demo',
      setup: async () => ({ id: 'seeded' }),
      exercise: async () => { throw new Error('capture blew up'); },
      restore: async (fixture) => { failing.push(`restore:${fixture?.id ?? 'null'}`); },
    }),
    /capture blew up/,
  );
  assert.deepEqual(failing, ['restore:seeded']);
  assert.equal(failingResults.steps[0].passed, false);

  // A failing SETUP still calls restore, with a null handle it must tolerate.
  const setupFailed = [];
  const evidential = await runFixturedScreenshotSection({
    results: { steps: [] },
    step: 'demo',
    rethrow: false,
    setup: async () => { throw new Error('seed blew up'); },
    exercise: async () => { setupFailed.push('exercise'); },
    restore: async (fixture) => { setupFailed.push(`restore:${fixture === null ? 'null' : 'handle'}`); },
  });
  assert.deepEqual(setupFailed, ['restore:null']);
  assert.equal(evidential.passed, false);
  assert.match(evidential.error.message, /seed blew up/);
});

test('the shared fixtured-section helper is a pure, playwright-free scripts/lib module', () => {
  assert.equal(/import[^;\n]*['"]playwright['"]/.test(SECTION_FIXTURE_SRC), false);
  assert.equal(/import[^;\n]*foundry-test-run/.test(SECTION_FIXTURE_SRC), false);
  // The restore MUST sit in a `finally`, not on the success path: these fixtures write
  // real actor flags and delete owned Items in a persisted world that later smoke runs
  // reuse, so a half-failed section that skipped its restore poisons unrelated PRs.
  assert.match(SECTION_FIXTURE_SRC, /\} finally \{\s*(?:\/\/[^\n]*\n\s*)*await restore\(fixture\);/);
});

// ── D0 section: the GM Knowledge surface (issue 785) ──────────────────────────

test('a Knowledge target runs only the dedicated persisted-net-zero knowledge section', () => {
  assert.equal(isD0SectionNeededForTargets('knowledge', KNOWLEDGE_LABELS), true);
  for (const name of ['recipes', 'components-checks', 'tags-essences', 'gathering', 'tools', 'overview-interactables', 'import-alchemy-experimental']) {
    assert.equal(isD0SectionNeededForTargets(name, KNOWLEDGE_LABELS), false, name);
  }
  for (const label of KNOWLEDGE_LABELS) {
    assert.equal(phaseForCaptureLabel(label), CAPTURE_PHASE_D0);
    assert.ok(HARNESS.includes(`'${label}'`), `${label} is not reachable in the harness`);
  }
  // Both Knowledge view ids resolve to real labels, and the armed frame owns its own
  // view id: `collect` publishes only `candidates[0]`, so appending its label to the
  // main view would publish the un-armed frame forever.
  const armed = VIEW_RECIPES.find((view) => view.id === 'manager-knowledge-delete-armed');
  const surface = VIEW_RECIPES.find((view) => view.id === 'manager-knowledge');
  assert.deepEqual(armed.smokeLabels, ['manager-knowledge-delete-armed']);
  assert.equal(surface.smokeLabels.includes('manager-knowledge-delete-armed'), false);
  assert.ok(
    captureOrderIndex('manager-knowledge-owned-copies')
      < Math.min(...surface.smokeLabels.slice(1).map(captureOrderIndex)),
    'the owned-copies frame must be captured first so it wins the surface view\'s candidates[0]',
  );
});

test('the Knowledge walk seeds every projected state, proves the inert merge, and restores net-zero', () => {
  const setup = harnessFunctionSpan('setupKnowledgeFixture', 'restoreKnowledgeFixture');
  const restore = harnessFunctionSpan('restoreKnowledgeFixture', 'assertKnowledgeInertSurvivesExpend');
  const merge = harnessFunctionSpan('assertKnowledgeInertSurvivesExpend', 'exerciseKnowledgeSurface');

  // The five seeded copy states, including the two the delta calls out explicitly: an
  // UNCAPPED copy (so Expend renders disabled) and the inert-but-not-spent fifth state.
  assert.match(setup, /key: 'limited'[\s\S]*?limitUses: true, maxUses: 3/);
  assert.match(setup, /key: 'uncapped'[\s\S]*?limitUses: false/);
  assert.match(setup, /key: 'inert'[\s\S]*?maxUses: 5[\s\S]*?usage: \{ timesUsed: 1, inert: true \}/);
  assert.match(setup, /key: 'spent'[\s\S]*?maxUses: 2[\s\S]*?usage: \{ timesUsed: 2, inert: true \}/);
  assert.match(setup, /key: 'partyPool'[\s\S]*?learnScope: 'total'/);
  // A learned entry whose source copy is no longer owned, and an empty-inventory
  // character for the dimmed "Nothing tracked" roster row.
  assert.match(setup, /sourceItemUuid: `Actor\.\$\{learnedOnlyActor\.id\}\.Item\.\$\{foundry\.utils\.randomID\(\)\}`/);
  assert.match(setup, /untrackedActor = grantOnlyActors\[1\]/);
  // Owned copies claim their definition through the durable per-system roles map.
  assert.match(setup, /roles: \{ \[systemId\]: \{ recipeItemDefinitionId: definition\.id \} \}/);
  // Membership is linked in a SECOND pass, AFTER every owned copy exists.
  // `RecipeItemLearningHook` fires on `createItem`, and for an uncapped book
  // `caps.learn.consumeOnLearn` DEFAULTS TO TRUE — so seeding `recipeIds` first made
  // the auto-learn path delete the first granted copy outright and leave an
  // auto-learned entry on the holder that the fixture never cleaned up.
  const grantAt = setup.indexOf("createEmbeddedDocuments('Item'");
  const membershipAt = setup.indexOf('recipeIds: [recipeId]');
  assert.ok(grantAt > 0, 'the fixture grants owned copies');
  assert.ok(
    membershipAt > grantAt,
    'recipe membership must be linked only after every owned copy exists, or the createItem auto-learn consumes one',
  );
  assert.match(
    setup,
    /a createItem consumer \(auto-learn consumeOnLearn\) destroyed it/,
    'seeding must fail loudly, naming the cause, if a copy is ever consumed again',
  );
  // Every actor the section can touch has its learned map snapshotted, not only the
  // two it seeds, so nothing it gains mid-run survives the restore.
  assert.match(setup, /const learnedRestores = \[\s*chipStatesActor,\s*partyPoolActor,\s*learnedOnlyActor,\s*untrackedActor,\s*\]/);

  // The seeded learned entry is removed by a real KEY DELETION, never a merge rewrite
  // (which would resurrect it on reload and leave the section not net-zero).
  assert.match(restore, /await actor\.unsetFlag\('fabricate', 'fabricate\.learnedRecipes'\)/);
  const unsetAt = restore.indexOf("unsetFlag('fabricate', 'fabricate.learnedRecipes')");
  const rewriteAt = restore.indexOf("'flags.fabricate.fabricate.learnedRecipes': learnedRecipes");
  assert.ok(unsetAt > 0 && rewriteAt > unsetAt, 'any pre-existing map must be written back only AFTER the deletion lands');
  assert.match(restore, /deleteEmbeddedDocuments\('Item', itemIds\)[\s\S]*?unsetFlag/, 'owned copies must be deleted before the learned entries, so no budget path resolves a still-held source');
  assert.match(restore, /deleteRecipeItemDefinition\(systemId, definitionId\)/);
  // `deleteRecipeItemDefinition` nulls `recipeItemId` / `linkedRecipeItemUuid` on every
  // recipe the definition claimed, so membership is dropped FIRST and the two link
  // fields are repaired from a setup snapshot if they ever drift.
  assert.match(
    restore,
    /updateRecipeItemDefinition\(systemId, definitionId, \{ recipeIds: \[\] \}\)[\s\S]*?deleteRecipeItemDefinition\(systemId, definitionId\)/,
  );
  assert.match(restore, /recipe\.linkedRecipeItemUuid = links\.linkedRecipeItemUuid/);
  assert.match(setup, /recipeLinks: \{[\s\S]*?linkedRecipeItemUuid: recipe\.linkedRecipeItemUuid/);

  // The merge proof must land a USAGE-ONLY write on an already-inert document; a spent
  // copy cannot be expended and a still-capped one carries no `inert`, so either would
  // resolve to `undefined === undefined` and pass unconditionally.
  assert.match(merge, /fixture\.ownedByKey\.inert/);
  assert.match(merge, /Number\(usage\?\.timesUsed\) === 2/);
  assert.match(merge, /usage\?\.inert !== true[\s\S]*?dropped the sibling inert flag/);

  // The section wires the shared lifecycle helper and restores in its `finally` slot.
  assert.match(
    HARNESS,
    /shouldRunScreenshotSection\('knowledge'\)[\s\S]*?runFixturedScreenshotSection\(\{[\s\S]*?step: 'knowledge-surface-evidence',[\s\S]*?restore: \(fixture\) => restoreKnowledgeFixture\(/,
    'the Knowledge section must hand its restore to the shared fixtured-section helper',
  );
  // The narrow frame is captured ABOVE the 831px collapse, which is the band where
  // three columns still hold and the detail pane is at its narrowest.
  assert.match(HARNESS, /setManagerWindowSize\(page, \{ width: 880, height: 900 \}\)[\s\S]*?assertManagerLayoutStable\(page, 'knowledge narrow'\)/);
  assert.ok(HARNESS.includes("assertManagerLayoutStable(page, 'knowledge normal')"));
  assert.ok(HARNESS.includes("'.manager-knowledge-copy-row'"));
});

test('Tool tab geometry contract rejects clipping, actual overflow, and a missing fourth tab', () => {
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
      overflowX: 'visible',
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
  assert.match(
    HARNESS,
    /const screenshotRunIdentity = \{[\s\S]*?runId: randomUUID\(\),[\s\S]*?headSha: resolveScreenshotHeadSha\(\{[\s\S]*?explicitHeadSha: process\.env\.FOUNDRY_SCREENSHOT_HEAD_SHA,[\s\S]*?ciHeadSha: process\.env\.GITHUB_SHA,[\s\S]*?\}\),[\s\S]*?targetLabels:/,
  );
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
  assert.match(
    HARNESS,
    /name: 'Smoke Tool Studio Replacement Item'[\s\S]*?img: sourceTemplate\.img/,
    'the replacement Item must reuse a resolved fixture image rather than request a missing core asset',
  );
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
  // Its labels span the spine (manager-default-selection) + three D0 sections, and the
  // two player frames additionally pull in phase E.
  assert.ok(D0_SPINE_LABELS.includes('manager-default-selection'));
  assert.equal(isD0SectionNeededForTargets('components-checks', targets), true); // manager-components-normal
  assert.equal(isD0SectionNeededForTargets('gathering', targets), true); // gathering-task-editor
  assert.equal(isD0SectionNeededForTargets('overview-interactables', targets), true); // interactables-manager-list
  // No theme label lands in these, so they stay skippable. `tags-essences` became
  // skippable when the set stopped over-sampling manager browsers: the essences and
  // environments frames added a fourth and fifth manager library without adding an
  // app-area, so they were dropped in favour of player-app coverage.
  assert.equal(isD0SectionNeededForTargets('recipes', targets), false);
  assert.equal(isD0SectionNeededForTargets('tags-essences', targets), false);
  assert.equal(isD0SectionNeededForTargets('tools', targets), false);
  assert.equal(isD0SectionNeededForTargets('knowledge', targets), false);
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
