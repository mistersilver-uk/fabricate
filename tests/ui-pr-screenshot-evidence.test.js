import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { deflateSync } from 'node:zlib';

import {
  buildScreenshotMarkdown,
  cleanPrScreenshotEvidence,
  collectScreenshotEvidence,
  deletePrScreenshotsFromS3,
  explainScreenshotEvidenceFailure,
  hasScreenshotEvidence,
  hasUiChanges,
  isExemptByLabel,
  loadChangedFiles,
  main,
  mapChangedFilesToViews,
  publishScreenshotEvidence,
  readLabelList,
  resolveDefaultBase,
  resolveScreenshotHeadSha,
  sanitizeLabel,
  smokeLabelsForChangedFiles,
  upsertScreenshotsBlock,
  VIEW_RECIPES,
  validateChangedFilesForCheck,
} from '../scripts/ui-pr-screenshot-evidence.mjs';

// A `resolveDefaultBase`-shaped git runner: `rev-parse --verify --quiet <ref>` returns
// status 0 only for a ref in `verifiable`, else status 1. Shared so the fallback-order
// and no-base tests do not each re-spell a spawnSync-shaped stub (Sonar duplication).
function gitVerifyStub(verifiable) {
  const set = new Set(verifiable);
  const calls = [];
  const run = (args) => {
    const ref = args[args.length - 1];
    calls.push(ref);
    return { status: set.has(ref) ? 0 : 1, stdout: '', stderr: '' };
  };
  run.calls = calls;
  return run;
}

// Capture console.log output produced while `fn()` runs, restoring the real console
// afterwards. Used to assert the plan path's "No UI changes detected." line without a
// subprocess.
async function captureLog(fn) {
  const lines = [];
  const realLog = console.log;
  const realError = console.error;
  console.log = (...args) => lines.push(args.join(' '));
  console.error = () => {};
  try {
    await fn();
  } finally {
    console.log = realLog;
    console.error = realError;
  }
  return lines;
}

// Run `runAssert(root)` against a temp dir seeded with `test-results/<name>`
// fixtures, cleaning up afterwards. Module-scope so the per-test collect setup is
// shared rather than repeated scaffolding in each `collect` test.
function withScreenshotFixtures(fixtures, runAssert) {
  const root = mkdtempSync(join(tmpdir(), 'fabricate-ui-screenshots-'));
  try {
    const sourceDir = join(root, 'test-results');
    mkdirSync(sourceDir, { recursive: true });
    for (const [name, content] of Object.entries(fixtures || {})) {
      writeFileSync(join(sourceDir, name), content);
    }
    runAssert(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const TOOL_STUDIO_VIEWS = [
  ['01-library-1280x720', 'manager-tool-parity-01-library-1280x720', 1212, 682],
  ['zero-state-empty-library-1280x720', 'manager-tool-zero-state-empty-library-1280x720', 1212, 682],
  ['02-overview-1280x720', 'manager-tool-parity-02-overview-1280x720', 1212, 682],
  ['03-breakage-1280x720', 'manager-tool-parity-03-breakage-1280x720', 1212, 682],
  ['04-requirements-1280x720', 'manager-tool-parity-04-requirements-1280x720', 1212, 682],
  ['05-validation-1280x720', 'manager-tool-parity-05-validation-1280x720', 1212, 682],
  ['06-breakage-900x700', 'manager-tool-parity-06-breakage-900x700', 832, 662],
  ['stress-long-name', 'manager-tool-stress-long-name', 1212, 682],
  ['stress-repair', 'manager-tool-stress-repair', 1212, 682],
  ['stress-replacement', 'manager-tool-stress-replacement', 1212, 682],
  ['stress-immune', 'manager-tool-stress-immune', 1212, 682],
  ['stress-invalid-validation', 'manager-tool-stress-invalid-validation', 1212, 682],
  ['stress-wrapping-680', 'manager-tool-stress-wrapping-680', 680, 700],
];

const PNG_FIXTURES = new Map();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeBytes.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 8 + data.length);
  return chunk;
}

function minimalPng(width, height) {
  const key = `${width}x${height}`;
  if (PNG_FIXTURES.has(key)) return PNG_FIXTURES.get(key);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  const image = Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(Buffer.alloc((width + 1) * height))),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
  PNG_FIXTURES.set(key, image);
  return image;
}

function toolStudioEvidenceFixtures({
  runId = 'tool-run-1',
  headSha = 'abc1234',
  targetLabels = TOOL_STUDIO_VIEWS.map(([, label]) => label),
  summaryPatch = {},
  manifestPatch = {},
  capturePatch = () => ({}),
} = {}) {
  return automatedEvidenceFixtures({
    frames: TOOL_STUDIO_VIEWS,
    runId,
    headSha,
    targetLabels,
    summaryPatch,
    manifestPatch,
    capturePatch,
  });
}

function automatedEvidenceFixtures({
  frames,
  runId = 'smoke-run-1',
  headSha = 'abc1234',
  targetLabels = frames.map(([, label]) => label),
  summaryPatch = {},
  manifestPatch = {},
  capturePatch = () => ({}),
} = {}) {
  const captures = frames.map(([, label, width, height], index) => ({
    label,
    file: `screenshot-${String(index + 1).padStart(2, '0')}-${label}.png`,
    width,
    height,
    ...capturePatch({ label, index }),
  }));
  return {
    ...Object.fromEntries(captures.map(({ file, width, height }) => [file, minimalPng(width, height)])),
    'summary.json': JSON.stringify({
      passed: true,
      stepFailures: 0,
      consoleErrorCount: 0,
      degraded: false,
      rendererCrashed: false,
      screenshotRun: { runId, headSha, targetLabels },
      ...summaryPatch,
    }),
    'screenshot-manifest.json': JSON.stringify({
      runId,
      headSha,
      targetLabels,
      captures,
      ...manifestPatch,
    }),
  };
}

function changedFileEvidenceFixtures(changedFiles, options = {}) {
  const views = mapChangedFilesToViews(changedFiles);
  const frames = views.map((view, index) => [
    view.id,
    view.smokeLabels[0],
    800 + index,
    600 + index,
  ]);
  return automatedEvidenceFixtures({
    frames,
    targetLabels: views.flatMap(view => view.smokeLabels),
    ...options,
  });
}

describe('UI PR screenshot evidence', () => {
  const toolStudioFiles = [
    'src/ui/svelte/apps/manager/ToolsBrowserView.svelte',
    'src/ui/svelte/apps/manager/tools/ToolBrowserInspector.svelte',
    'src/ui/svelte/apps/manager/ToolEditView.svelte',
    'src/ui/svelte/apps/manager/tools/ToolOverviewTab.svelte',
    'src/ui/svelte/apps/manager/tools/ToolBehaviorPreview.svelte',
    'src/ui/svelte/apps/manager/tools/ToolBreakageTab.svelte',
    'src/ui/svelte/apps/manager/tools/ToolRepairRequirements.svelte',
    'src/ui/svelte/apps/manager/tools/toolStudio.js',
    'src/ui/svelte/apps/manager/tools/ToolRequirementsTab.svelte',
    'src/ui/svelte/apps/manager/tools/ToolValidationTab.svelte',
    'src/ui/svelte/apps/manager/tools/ToolEditorTabs.svelte',
  ];

  it('maps every changed Tool Studio UI file to parity, zero-state, and separate stress evidence', () => {
    for (const file of toolStudioFiles) {
      const toolViews = mapChangedFilesToViews([file]).filter((view) =>
        TOOL_STUDIO_VIEWS.some(([id]) => id === view.id)
      );
      assert.deepEqual(toolViews.map((view) => view.id), TOOL_STUDIO_VIEWS.map(([id]) => id), file);
      assert.deepEqual(
        toolViews.map((view) => view.smokeLabels),
        TOOL_STUDIO_VIEWS.map(([, label]) => [label]),
        file,
      );
    }
  });

  it('maps every changed Knowledge surface file to BOTH the surface view and its armed-Delete view (issue 785)', () => {
    // The armed frame needs its OWN view id because `collect` publishes only
    // `candidates[0]`: appended to the surface view, the lower-numbered un-armed
    // owned-copies frame would win forever and the armed state would never ship.
    for (const file of [
      'src/ui/svelte/apps/manager/KnowledgeView.svelte',
      'src/ui/svelte/apps/manager/ArmedDangerButton.svelte',
      'src/ui/svelte/apps/manager/knowledge/KnowledgeRoster.svelte',
      'src/ui/svelte/apps/manager/knowledge/KnowledgeOwnedCopyRow.svelte',
      'src/ui/svelte/apps/manager/knowledge/KnowledgeLearnedRow.svelte',
      'src/ui/svelte/apps/manager/knowledge/KnowledgeTabs.svelte',
      'src/ui/svelte/apps/manager/knowledge/knowledgeStudio.js',
      'src/ui/svelte/apps/manager/knowledge/knowledgeMutations.js',
    ]) {
      const ids = mapChangedFilesToViews([file]).map((view) => view.id);
      assert.ok(ids.includes('manager-knowledge'), file);
      assert.ok(ids.includes('manager-knowledge-delete-armed'), file);
    }
    const surface = VIEW_RECIPES.find((view) => view.id === 'manager-knowledge');
    assert.deepEqual(surface.smokeLabels, [
      'manager-knowledge-owned-copies',
      'manager-knowledge-empty-tab',
      'manager-knowledge-learned-lost-copy',
      'manager-knowledge-party-pool-warning',
      'manager-knowledge-narrow',
    ]);
  });

  it('maps recipe Tool authoring files only to the existing Tools-tab frame', () => {
    for (const file of [
      'src/ui/svelte/apps/manager/recipe/RecipeToolsTab.svelte',
      'src/ui/svelte/apps/manager/recipe/RecipeToolsSection.svelte',
    ]) {
      const views = mapChangedFilesToViews([file]);
      assert.deepEqual(views.map((view) => view.id), ['manager-recipe-edit-tools'], file);
    }
  });
  it('detects UI changes with the same path rules as CI', () => {
    assert.equal(hasUiChanges(['src/ui/svelte/apps/FabricateAppRoot.svelte']), true);
    assert.equal(hasUiChanges(['styles/fabricate.css']), true);
    assert.equal(hasUiChanges(['docs/index.md']), false);
  });

  it('maps changed manager files to relevant screenshot recipes', () => {
    const views = mapChangedFilesToViews([
      'src\\ui\\svelte\\apps\\manager\\EnvironmentEditView.svelte',
      'src/ui/svelte/apps/manager/environment/EnvironmentEditorTabs.svelte',
    ]);

    assert.deepEqual(views.map(view => view.id), ['manager-environments']);
    assert.ok(views[0].smokeLabels.includes('manager-environments-browse-normal'));
    assert.ok(views[0].smokeLabels.includes('manager-environment-edit-placeholder'));
  });

  it('maps the issue-767 system-details dirty frame to its own view id', () => {
    // The SystemEditView (chip) republishes BOTH the clean settings frames and the
    // dedicated dirty frame; CraftingSystemManagerRoot (the guard + lifted draft)
    // republishes only the dirty frame.
    const byId = Object.fromEntries(VIEW_RECIPES.map(view => [view.id, view.smokeLabels]));
    assert.deepEqual(byId['manager-system-edit-dirty'], ['manager-system-edit-dirty']);

    const editViewIds = mapChangedFilesToViews([
      'src/ui/svelte/apps/manager/SystemEditView.svelte',
    ]).map(view => view.id);
    assert.ok(editViewIds.includes('manager-system-edit'));
    assert.ok(editViewIds.includes('manager-system-edit-dirty'));
    assert.ok(editViewIds.includes('manager-system-edit-lists'));

    const rootIds = mapChangedFilesToViews([
      'src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte',
    ]).map(view => view.id);
    assert.ok(rootIds.includes('manager-system-edit-dirty'));
    assert.ok(!rootIds.includes('manager-system-edit'));
  });

  it('maps a system/ settings-list child card to the system-edit frame (issue 768)', () => {
    // The list-ergonomics work touches CharacterPrerequisitesCard, which renders
    // INSIDE the system-edit frame. A change to any `system/` card must map to
    // `manager-system-edit` rather than falling through to the generic UI frame.
    const cardIds = mapChangedFilesToViews([
      'src/ui/svelte/apps/manager/system/CharacterPrerequisitesCard.svelte',
    ]).map(view => view.id);
    assert.ok(cardIds.includes('manager-system-edit'));
  });

  it('maps the issue-800 description frames to their OWN view ids', () => {
    // Three dedicated ids, each with exactly one smokeLabel. Appending them to
    // `manager-components` would be silently useless: `collect` publishes only
    // `candidates[0]` from a filename-sorted list, so the BEFORE/AFTER pair that
    // constitutes the evidence would never both reach the PR.
    const byId = Object.fromEntries(VIEW_RECIPES.map(view => [view.id, view.smokeLabels]));
    for (const id of [
      'manager-components-description-before',
      'manager-components-description-repaired',
      'manager-components-description-ingested',
    ]) {
      assert.deepEqual(byId[id], [id], `${id} must be its own single-frame view`);
    }

    // The normalizer republishes all three; the repair module republishes only the
    // repaired frame.
    const normalizerIds = mapChangedFilesToViews([
      'src/utils/plainTextDescription.js',
    ]).map(view => view.id);
    assert.ok(normalizerIds.includes('manager-components-description-before'));
    assert.ok(normalizerIds.includes('manager-components-description-repaired'));
    assert.ok(normalizerIds.includes('manager-components-description-ingested'));

    const repairIds = mapChangedFilesToViews([
      'src/config/repairItemData.js',
    ]).map(view => view.id);
    assert.deepEqual(repairIds, ['manager-components-description-repaired']);
  });

  it('maps the issue-801 grouped-continuation frames to their OWN view ids', () => {
    // Two dedicated ids, one published frame each (`collect` emits only `candidates[0]`).
    const byId = Object.fromEntries(VIEW_RECIPES.map(view => [view.id, view.smokeLabels]));
    for (const id of [
      'manager-recipes-grouped-continuation',
      'manager-components-grouped-continuation',
      // Issue 806: the editor round-trip frame is also its own single-frame view.
      'manager-recipes-editor-roundtrip',
    ]) {
      assert.deepEqual(byId[id], [id], `${id} must be its own single-frame view`);
    }

    // Phase 1 is model-only for recipes: recipeBrowserModel.js is the SOLE changed file
    // that maps a frame to the recipes browser, so it MUST resolve to the continuation id.
    const recipeModelIds = mapChangedFilesToViews([
      'src/utils/recipeBrowserModel.js',
    ]).map(view => view.id);
    assert.ok(recipeModelIds.includes('manager-recipes-grouped-continuation'));
    // Issue 806: the state factory now also maps to the editor round-trip frame.
    assert.ok(recipeModelIds.includes('manager-recipes-editor-roundtrip'));

    // The component model change maps to both the ordinary browser frame and the
    // dedicated continuation frame.
    const componentModelIds = mapChangedFilesToViews([
      'src/utils/componentBrowserModel.js',
    ]).map(view => view.id);
    assert.ok(componentModelIds.includes('manager-components'));
    assert.ok(componentModelIds.includes('manager-components-grouped-continuation'));

    // The components view file also republishes the continuation frame.
    const componentViewIds = mapChangedFilesToViews([
      'src/ui/svelte/apps/manager/ComponentsBrowserView.svelte',
    ]).map(view => view.id);
    assert.ok(componentViewIds.includes('manager-components-grouped-continuation'));
  });

  it('maps the issue-772 bulk-edit frame to its OWN view id and its four triggers', () => {
    const byId = Object.fromEntries(VIEW_RECIPES.map(view => [view.id, view.smokeLabels]));
    // A dedicated id with exactly one smoke label. Appending the label to
    // `manager-components` would be silently useless: `collect` publishes only
    // `candidates[0]` from a path-sorted list, so the staged bulk state — the whole point
    // of the evidence — would never reach the PR.
    assert.deepEqual(byId['manager-components-bulk-edit'], ['manager-components-bulk-edit']);
    assert.equal(
      byId['manager-components'].includes('manager-components-bulk-edit'),
      false,
      'the browser view must not also claim the bulk-edit label',
    );

    // The browser view, any file in the browser's own directory, the four shared bulk
    // primitives, the shared selection primitive and both pure models all republish the
    // frame. The primitives are the sharp case (issue 1010): they live directly under
    // `apps/manager/`, so they match NEITHER the `components/` glob nor the `recipes/` one
    // and are only reachable because they are enumerated by name.
    for (const file of [
      'src/ui/svelte/apps/manager/ComponentsBrowserView.svelte',
      'src/ui/svelte/apps/manager/components/ComponentBulkEditPanel.svelte',
      'src/ui/svelte/apps/manager/BulkSelectionToolbar.svelte',
      'src/ui/svelte/apps/manager/BulkEditPanelShell.svelte',
      'src/ui/svelte/apps/manager/BulkEditSection.svelte',
      'src/ui/svelte/apps/manager/BulkEditSelect.svelte',
      'src/ui/svelte/components/SelectionCheckbox.svelte',
      'src/utils/componentBulkEditModel.js',
      'src/utils/bulkSelectionModel.js',
    ]) {
      assert.ok(
        mapChangedFilesToViews([file]).map(view => view.id).includes('manager-components-bulk-edit'),
        `${file} must republish the bulk-edit frame`,
      );
    }

    // The narrow model triggers must NOT drag in the whole components-browser set — and in
    // particular neither model is a Tool Studio or theme change. The per-studio staging model
    // republishes THAT studio's three frames and nothing else.
    const componentBulkPanelFrames = [
      'manager-components-bulk-edit',
      'manager-components-bulk-edit-unstaged',
      'manager-components-bulk-edit-progressive',
    ];
    const recipeBulkPanelFrames = [
      'manager-recipes-bulk-edit',
      'manager-recipes-bulk-edit-unstaged',
      'manager-recipes-bulk-edit-blocked',
    ];
    assert.deepEqual(
      mapChangedFilesToViews(['src/utils/componentBulkEditModel.js']).map(view => view.id),
      componentBulkPanelFrames,
    );
    assert.deepEqual(
      mapChangedFilesToViews(['src/utils/recipeBulkEditModel.js']).map(view => view.id),
      recipeBulkPanelFrames,
    );
    // The SHARED leaf is asserted separately rather than folded in, and it is the one file
    // here that must reach BOTH studios: `describeBulkSelection` / `toggleBulkSelection` /
    // `setBulkSelection` / `pruneBulkSelection` live here and each studio's own model merely
    // re-exports them, so a change to a selection helper touches neither studio's model file.
    // Before issue 1010 named it in the components list it mapped to zero views and published
    // nothing at all; naming it in only ONE studio's list would be the same defect halved —
    // a selection regression would publish three frames of the studio that did not change.
    assert.deepEqual(
      mapChangedFilesToViews(['src/utils/bulkSelectionModel.js']).map(view => view.id),
      [...componentBulkPanelFrames, ...recipeBulkPanelFrames],
    );
  });

  it('gives the recipe bulk panel its own three frames and its own trigger set (issue 1010)', () => {
    const byId = Object.fromEntries(VIEW_RECIPES.map(view => [view.id, view]));
    // Each is its own view with exactly one same-named label, for the `candidates[0]` reason
    // stated on the Component Studio's trio above.
    for (const id of [
      'manager-recipes-bulk-edit',
      'manager-recipes-bulk-edit-unstaged',
      'manager-recipes-bulk-edit-blocked',
    ]) {
      assert.deepEqual(byId[id].smokeLabels, [id], `${id} must carry exactly its own label`);
      assert.equal(
        byId['manager-recipes'].smokeLabels.includes(id),
        false,
        'the plain recipes browser view must not claim a bulk-edit label',
      );
    }

    // The recipe browser view, anything in the browser's own directory, the four shared
    // primitives and the shared selection control all republish the frames. The primitives
    // are the sharp case: they sit directly under `apps/manager/`, so they match NEITHER
    // studio's directory glob and are reachable only because both lists enumerate them.
    for (const file of [
      'src/ui/svelte/apps/manager/RecipesBrowserView.svelte',
      'src/ui/svelte/apps/manager/recipes/RecipeBulkEditPanel.svelte',
      'src/ui/svelte/apps/manager/BulkSelectionToolbar.svelte',
      'src/ui/svelte/apps/manager/BulkEditPanelShell.svelte',
      'src/ui/svelte/apps/manager/BulkEditSection.svelte',
      'src/ui/svelte/apps/manager/BulkEditSelect.svelte',
      'src/ui/svelte/components/SelectionCheckbox.svelte',
    ]) {
      assert.ok(
        mapChangedFilesToViews([file]).map(view => view.id).includes('manager-recipes-bulk-edit'),
        `${file} must republish the recipe bulk-edit frame`,
      );
    }

    // The UNSTAGED frame shares the staged frame's trigger set — same panel, same system,
    // and the sentinel faces it exists to photograph are rendered by the same files.
    assert.deepEqual(
      byId['manager-recipes-bulk-edit-unstaged'].matches.map(String),
      byId['manager-recipes-bulk-edit'].matches.map(String),
    );

    // The BLOCKED frame carries one trigger the other two do not: the browser model that
    // derives the row's `Can't enable` pill. That frame is the only one which photographs
    // the pill and the panel's pre-flight count together, so a change to the derivation must
    // republish it — and must NOT republish the two frames that show neither.
    const pillDerivation = mapChangedFilesToViews(['src/utils/recipeBrowserModel.js'])
      .map(view => view.id);
    assert.ok(pillDerivation.includes('manager-recipes-bulk-edit-blocked'));
    assert.equal(pillDerivation.includes('manager-recipes-bulk-edit'), false);
    assert.equal(pillDerivation.includes('manager-recipes-bulk-edit-unstaged'), false);
  });

  it('gives the bulk panel THREE frames, because one photograph cannot hold its four sections', () => {
    const byId = Object.fromEntries(VIEW_RECIPES.map(view => [view.id, view]));
    // Each is its own view with exactly one same-named label — `collect` publishes only
    // `candidates[0]`, so three states need three view ids or two of them never ship.
    for (const id of [
      'manager-components-bulk-edit',
      'manager-components-bulk-edit-unstaged',
      'manager-components-bulk-edit-progressive',
    ]) {
      assert.deepEqual(byId[id].smokeLabels, [id], `${id} must carry exactly its own label`);
      assert.equal(
        byId['manager-components'].smokeLabels.includes(id),
        false,
        'the plain browser view must not claim a bulk-edit label',
      );
    }

    // The UNSTAGED frame shares the staged frame's trigger set: it is the same panel on
    // the same system, and the axis chip whose unstaged face it exists to photograph is
    // rendered by the same files.
    assert.deepEqual(
      byId['manager-components-bulk-edit-unstaged'].matches.map(String),
      byId['manager-components-bulk-edit'].matches.map(String),
    );

    // The PROGRESSIVE frame does NOT conscript the global primitives its section is built
    // from. `Chip` and `Stepper` have no `VIEW_RECIPES` entry at all, and naming them on
    // this one frame would route every future change to them at a components screenshot.
    for (const primitive of [
      'src/ui/svelte/components/Chip.svelte',
      'src/ui/svelte/components/Stepper.svelte',
    ]) {
      assert.equal(
        mapChangedFilesToViews([primitive]).map(view => view.id)
          .includes('manager-components-bulk-edit-progressive'),
        false,
        `${primitive} must not be a trigger for the progressive bulk frame`,
      );
    }
  });

  it('routes the shared essence card to the EDITOR frames as well as the browser ones (issue 772)', () => {
    // `EssenceQuantityCard` lives under `components/` — the BROWSER's directory, because
    // the bulk panel renders it — but the component EDITOR renders it too. Without the
    // explicit entry on `manager-component-edit`, a change to the card would route evidence
    // only to the browser frames and never to the editor ones: matching-nothing-forever's
    // quieter cousin, and green the whole time.
    const ids = mapChangedFilesToViews([
      'src/ui/svelte/apps/manager/components/EssenceQuantityCard.svelte',
    ]).map(view => view.id);
    assert.ok(ids.includes('manager-component-edit'), 'the editor frame must be republished');
    assert.ok(ids.includes('manager-components'), 'the browser frames must still be republished');
    assert.ok(ids.includes('manager-components-bulk-edit'));

    // A sibling in the same directory that the editor does NOT render must not gain the
    // editor frame — the entry is a named file, not a widened directory glob.
    assert.equal(
      mapChangedFilesToViews([
        'src/ui/svelte/apps/manager/components/ComponentRow.svelte',
      ]).map(view => view.id).includes('manager-component-edit'),
      false,
    );
  });

  it('maps player gathering app files to the player-gathering recipes (incl. the realm-lock frame)', () => {
    const views = mapChangedFilesToViews([
      'src/ui/svelte/apps/gathering/GatheringView.svelte',
      'src/ui/svelte/apps/gathering/GatheringDetail.svelte',
    ]);

    assert.deepEqual(
      views.map(view => view.id),
      ['player-gathering', 'player-gathering-realm-locked', 'player-gathering-stacked']
    );
    assert.deepEqual(views[0].smokeLabels, [
      'player-gathering-environments',
      'player-gathering-events',
      'player-gathering-task-ready',
      'player-gathering-after-success',
      'player-gathering-tool-blocked',
      'player-gathering-timed-ready',
      'player-gathering-timed-active',
      'player-gathering-blind',
    ]);
    assert.deepEqual(views[1].smokeLabels, ['player-gathering-realm-locked']);
    assert.deepEqual(views[2].smokeLabels, ['player-gathering-stacked']);
  });

  it('maps player crafting app files to the player-crafting recipes (incl. the stacked frame)', () => {
    const views = mapChangedFilesToViews([
      'src/ui/svelte/apps/crafting/CraftingView.svelte',
      'src/ui/svelte/apps/crafting/RecipeDetail.svelte',
    ]);

    assert.deepEqual(
      views.map(view => view.id),
      [
        'player-crafting',
        'player-crafting-stacked',
        // The progressive stage list (issue 651) publishes four distinct states;
        // `collect` emits one file per view id and picks `candidates[0]` from an array
        // sorted by FILENAME — it does NOT honour smokeLabels order — so each state needs
        // its own entry or only the lowest-numbered frame would ever reach the PR.
        'player-crafting-progressive',
        // The reordered state is the load-bearing frame: at rest the thresholds ascend by
        // construction and the live region is empty, so both checks are vacuous there.
        'player-crafting-progressive-reordered',
        'player-crafting-progressive-fixed',
        'player-crafting-progressive-stacked',
        // The explicit multi-step simple recipe detail (issue 765) — its own view so the
        // step-aware projection reaches the PR as a distinct frame.
        'player-crafting-multistep',
      ]
    );
    assert.deepEqual(views[0].smokeLabels, [
      'player-crafting-alternatives',
      'player-crafting-simple',
      'player-crafting-ingredient-routed',
      'player-crafting-routed-by-check',
      'player-crafting-run-summary',
    ]);
    assert.deepEqual(views[1].smokeLabels, ['player-crafting-stacked']);
    // One label per progressive view, and the reordered state is its OWN view rather than
    // a preferred label on the resting one. Listing both on one view does NOT work:
    // `collect` picks `candidates[0]` from an array sorted by FILENAME and never consults
    // smokeLabels order, so the lower-numbered resting frame won and the reordered frame
    // — the only one where the thresholds must have been recomputed and the live region
    // must have text to hide — never reached the PR. The earlier arrangement asserted
    // that intent here and passed while publishing the wrong frame.
    assert.deepEqual(views[2].smokeLabels, ['player-crafting-progressive']);
    assert.deepEqual(views[3].smokeLabels, ['player-crafting-progressive-reordered']);
    assert.deepEqual(views[4].smokeLabels, ['player-crafting-progressive-fixed']);
    assert.deepEqual(views[5].smokeLabels, ['player-crafting-progressive-stacked']);
    assert.deepEqual(views[6].smokeLabels, ['player-crafting-multistep']);
  });

  it('maps all four player crafting essence icon states to dedicated evidence views', () => {
    const harness = readFileSync('scripts/foundry-test-run.mjs', 'utf8');
    const views = mapChangedFilesToViews([
      'src/ui/svelte/apps/crafting/CraftingEssenceThumb.svelte',
    ]);
    const ids = views.map((view) => view.id);
    for (const id of [
      'player-crafting-essence-legacy',
      'player-crafting-essence-ingredient',
      'player-crafting-essence-alternative',
      'player-crafting-essence-shopping',
    ]) {
      assert.ok(ids.includes(id), `${id} is collected for the shared essence thumb`);
      const view = views.find((candidate) => candidate.id === id);
      assert.deepEqual(view.smokeLabels, [id]);
      assert.match(harness, new RegExp(`screenshot\\(page, '${id}'\\)`));
    }
    assert.match(harness, /icon: 'fas fa-star-of-life'/);
    assert.match(harness, /name: 'Smoke Legacy Essence Seal'/);
    assert.match(harness, /name: 'Smoke First-Class Essence Draught'/);
    assert.match(harness, /type: 'essence', essenceId: 'smoke-star-essence'/);
  });

  // Issue 917. Six frames, each a distinct rendered state of the requirement-rail
  // redesign, each its OWN view id: `collect` emits one file per view id and picks
  // `candidates[0]` from a FILENAME sort, so appending these to the broad
  // `player-crafting` entry would publish one arbitrary frame forever.
  const REQUIREMENT_RAIL_VIEW_IDS = [
    'player-crafting-slot-rail',
    'player-crafting-tag-unmatched',
    'player-crafting-essence-pool',
    'player-crafting-pick-for-me',
    'player-crafting-essence-pool-shared',
    'player-crafting-consumption-plan',
  ];

  it('maps the requirement-rail surfaces to six dedicated single-label evidence views', () => {
    const harness = readFileSync('scripts/foundry-test-run.mjs', 'utf8');
    const byId = Object.fromEntries(VIEW_RECIPES.map(view => [view.id, view]));

    for (const id of REQUIREMENT_RAIL_VIEW_IDS) {
      const view = byId[id];
      assert.ok(view, `${id} is missing from VIEW_RECIPES`);
      // Exactly its own label — a second label here would hand `candidates[0]` to a
      // filename sort and silently publish the other state.
      assert.deepEqual(view.smokeLabels, [id]);
      assert.match(harness, new RegExp(`screenshot\\(page, '${id}'\\)`));
    }

    // Every rail component, the pure slot projection and the store that holds which
    // chooser is open all route to the whole set.
    for (const file of [
      'src/ui/svelte/apps/crafting/detail/RequirementRail.svelte',
      'src/ui/svelte/apps/crafting/detail/RequirementTile.svelte',
      'src/ui/svelte/apps/crafting/detail/EssencePoolPanel.svelte',
      'src/ui/svelte/apps/crafting/detail/ConsumptionPlanPanel.svelte',
      'src/ui/svelte/util/requirementSlots.js',
      'src/ui/svelte/stores/craftingStore.svelte.js',
    ]) {
      const ids = mapChangedFilesToViews([file]).map(view => view.id);
      for (const id of REQUIREMENT_RAIL_VIEW_IDS) {
        assert.ok(ids.includes(id), `${file} must map to ${id}`);
      }
    }

    // The rail's own projection and its store have no other view recipe, so they must
    // resolve to real rail evidence rather than falling through to the generic
    // global-UI set (which would publish six frames that show none of this).
    assert.deepEqual(
      mapChangedFilesToViews(['src/ui/svelte/util/requirementSlots.js']).map(view => view.id),
      REQUIREMENT_RAIL_VIEW_IDS
    );
    assert.deepEqual(
      smokeLabelsForChangedFiles(['src/ui/svelte/stores/craftingStore.svelte.js']),
      REQUIREMENT_RAIL_VIEW_IDS
    );
  });

  it('pins the smoke-world seeding each requirement-rail frame depends on', () => {
    const harness = readFileSync('scripts/foundry-test-run.mjs', 'utf8');

    // A SECOND authored essence with its own colour token — without it the shared-pool
    // frame has one tint and cannot show which carrier unit funded which requirement.
    assert.match(harness, /id: 'smoke-tide-essence'/);
    assert.match(harness, /colorToken: 'butter'/);
    assert.match(harness, /colorToken: 'lavender'/);
    // Bare `--fab-tag-*` keys only: the normalizer strips the prefix and every tinted
    // surface composes `var(--fab-tag-<token>)` itself, so a prefixed or hex value would
    // render as the untinted accent fallback.
    assert.equal(/colorToken: '(?:--fab-tag-|#)/.test(harness), false);

    // Two DUAL-essence carriers plus a single-essence contrast carrier, registered
    // through `updateItem({ essences })` — the field the resolver reads.
    assert.match(harness, /'Smoke Duskcrystal': \{ 'smoke-star-essence': 2, 'smoke-tide-essence': 2 \}/);
    assert.match(harness, /'Smoke Tidebloom': \{ 'smoke-star-essence': 1, 'smoke-tide-essence': 1 \}/);
    assert.match(harness, /'Smoke Starmote': \{ 'smoke-star-essence': 1 \}/);
    assert.match(harness, /await csm\.updateItem\(simpleSystemId, simpleMap\[name\], \{ essences \}\)/);

    // The contended pool: TWO essence requirements as sibling groups in ONE set, whose
    // only Tide sources are the two dual carriers.
    assert.match(harness, /name: 'Smoke Tidecore Tempering'/);
    assert.match(harness, /essenceId: 'smoke-star-essence', amount: 2/);
    assert.match(harness, /essenceId: 'smoke-tide-essence', amount: 3/);

    // The unmatched-tag fixture (acceptance criterion 5) and the zero-carrier essence
    // that makes a genuinely short (rather than part-delivered) rail tile reachable.
    assert.match(harness, /name: 'Smoke Sigil Etching'/);
    assert.match(harness, /tags: \['smoke-voidbound'\]/);
    assert.match(harness, /id: 'smoke-ember-essence'/);

    // The carriers must actually be in the crafter's bag, or every meter reads 0.
    for (const name of ['Smoke Duskcrystal', 'Smoke Tidebloom', 'Smoke Starmote', 'Smoke Runeplate']) {
      assert.match(harness, new RegExp(`invCopies\\('${name}', \\d+\\)`));
    }
  });

  it('keeps the new rail fixtures off page one of the player recipe browser', () => {
    // The browser sorts A→Z and pages at 12, and `selectCraftingRecipeByMode` only
    // iterates the rows in the DOM — page one. A fixture that displaces the last page-one
    // row silently re-points `player-crafting-ingredient-routed`, `-routed-by-check` and
    // the craft behind `-run-summary`/`-roll-result` at an UNCRAFTABLE display fixture,
    // and every one of those frames still passes while showing the wrong recipe. This is
    // the guard that fails instead.
    const harness = readFileSync('scripts/foundry-test-run.mjs', 'utf8');
    const recipeNames = [
      ...harness.matchAll(/createRecipe\(\{[^}]*?\bname: '([^']+)'/g),
    ].map(match => match[1]);
    assert.ok(recipeNames.length > 12, 'no seeded recipe names were found to order');
    const sorted = [...new Set(recipeNames)].sort((left, right) => left.localeCompare(right));
    const PAGE_SIZE = 12;
    for (const name of ['Smoke Runestaff Binding', 'Smoke Sigil Etching', 'Smoke Tidecore Tempering']) {
      const position = sorted.indexOf(name);
      assert.ok(position >= 0, `${name} is not a seeded recipe`);
      assert.ok(
        position >= PAGE_SIZE,
        `${name} sorts at position ${position + 1}, inside the browser's first page of ${PAGE_SIZE}`
      );
    }
  });

  it('re-points the pinned crafting selectors the requirement rail moved', () => {
    const harness = readFileSync('scripts/foundry-test-run.mjs', 'utf8');

    // DEAD: a first-class essence requirement is no longer a CraftingEssenceThumb in the
    // ingredient image grid, so this selector matches nothing and would time out.
    assert.equal(
      harness.includes(`[data-io-group="ingredients"] .crafting-essence-thumb`),
      false,
      'the ingredient-grid essence-thumb selector must be re-pointed at the rail'
    );
    assert.ok(
      harness.includes(
        `[data-recipe-section="requirement-rail"] [data-slot-kind="essence"] .requirement-slot-glyph`
      ),
      'the first-class essence wait must target the rail slot glyph'
    );

    // SURVIVES: legacy set-level essences keep their row presentation, and the Shopping
    // List still renders the shared essence thumb.
    assert.ok(harness.includes(`[data-io-group="essences"] .crafting-io-essence-icon`));
    assert.ok(harness.includes(`[data-shopping-acquire-components] .crafting-essence-thumb`));

    // The alternatives picker is now the chooser ONE slot opens, so the walk must open
    // that slot before waiting on the section.
    assert.match(
      harness,
      /\[data-requirement-slot\]\[data-slot-kind="choice"\][^]*?\[data-recipe-section="alternatives"\]/,
      'the alternatives capture must open its slot before waiting on the chooser'
    );

    // Container-level waits, not deep leaf content: an over-specific wait that times out
    // fails the whole phase and surfaces as an unrelated later breakage.
    assert.ok(
      harness.includes(`[data-recipe-section="requirement-rail"] [data-requirement-rail-slots]`)
    );

    // Pointer hit-tests on the three controls the redesign newly stacks (issue 917).
    for (const [selector, label] of [
      ['\\[data-requirement-slot\\]', 'Requirement rail slot tile'],
      ['\\[data-stepper-increment\\]', 'Essence pool carrier increment'],
      ['\\[data-requirement-pick-for-me\\]', 'Requirement rail Pick for me'],
    ]) {
      assert.match(
        harness,
        new RegExp(`assertPointerTarget\\([^]*?'${selector}',\\s*\\n?\\s*'${label}'`),
        `${label} needs a real-browser pointer hit-test`
      );
    }
  });

  it('maps player alchemy app files to the player-alchemy recipes (incl. chooser + stacked frames)', () => {
    const views = mapChangedFilesToViews([
      'src/ui/svelte/apps/alchemy/AlchemyView.svelte',
      'src/ui/svelte/apps/alchemy/Workbench.svelte',
    ]);

    assert.deepEqual(
      views.map(view => view.id),
      ['player-alchemy', 'player-alchemy-chooser', 'player-alchemy-stacked']
    );
    assert.deepEqual(views[0].smokeLabels, ['player-alchemy-workbench']);
    assert.deepEqual(views[1].smokeLabels, ['player-alchemy-chooser']);
    assert.deepEqual(views[2].smokeLabels, ['player-alchemy-stacked']);
  });

  it('maps player journal app files to the fabricate-journal recipes (incl. the craft-detail frame)', () => {
    const views = mapChangedFilesToViews([
      'src/ui/svelte/apps/journal/JournalView.svelte',
      'src/ui/svelte/apps/journal/RunDetail.svelte',
    ]);

    // Issue 752: the craft-detail frame is its own recipe so `collect` publishes
    // it alongside the resting journal frame (one file per recipe id).
    assert.deepEqual(views.map(view => view.id), ['fabricate-journal', 'fabricate-journal-craft-detail']);
    assert.deepEqual(views[0].smokeLabels, ['fabricate-journal']);
    assert.deepEqual(views[1].smokeLabels, ['fabricate-journal-craft-detail']);
  });

  // Issue 752: the seven demonstration capture states each map to the sources of
  // the in-flight PR whose fix they show, and each is its own recipe (one file
  // per recipe id) so `collect` publishes every frame rather than collapsing them.
  it('maps the issue-752 demonstration frames to their in-flight PR sources', () => {
    const idsFor = (file) => mapChangedFilesToViews([file]).map(view => view.id);

    // #746 rail state — CraftingSystemManagerRoot owns the rail.
    assert.ok(idsFor('src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte').includes('manager-experimental-off'));
    // #736/#712 crafting failure-consumption — the routed crafting check editor.
    assert.ok(idsFor('src/ui/svelte/apps/manager/checks/CraftingCheckEditor.svelte').includes('manager-checks-crafting-consumption'));
    // #736/#713 alchemy settings — CraftingSettingsView carries the alchemy relabel.
    assert.deepEqual(idsFor('src/ui/svelte/apps/manager/CraftingSettingsView.svelte'), ['manager-alchemy-settings']);
    // #727 pills — RollResultBox lives under the crafting detail sources.
    assert.ok(idsFor('src/ui/svelte/apps/crafting/detail/RollResultBox.svelte').includes('player-crafting-roll-result'));
    // #727 roll total — the chat card markup is built in CraftingChatCard.js.
    assert.deepEqual(idsFor('src/systems/CraftingChatCard.js'), ['chat-craft-card']);
    assert.deepEqual(idsFor('src/systems/SalvageChatCard.js'), ['chat-craft-card']);
    // #735 row rendering — the shared VocabularyPanel renders the item-tags rows.
    assert.ok(idsFor('src/ui/svelte/apps/manager/VocabularyPanel.svelte').includes('manager-tags-categories-tags-tab'));

    // Each new frame carries exactly its own single smoke label.
    const byId = Object.fromEntries(VIEW_RECIPES.map(view => [view.id, view.smokeLabels]));
    assert.deepEqual(byId['manager-experimental-off'], ['manager-experimental-off']);
    assert.deepEqual(byId['manager-checks-crafting-consumption'], ['manager-checks-crafting-consumption']);
    assert.deepEqual(byId['manager-alchemy-settings'], ['manager-alchemy-settings']);
    assert.deepEqual(byId['fabricate-journal-craft-detail'], ['fabricate-journal-craft-detail']);
    assert.deepEqual(byId['player-crafting-roll-result'], ['player-crafting-roll-result']);
    assert.deepEqual(byId['chat-craft-card'], ['chat-craft-card']);
    assert.deepEqual(byId['manager-tags-categories-tags-tab'], ['manager-tags-categories-tags-tab']);
  });

  it('maps player inventory app files to the player-inventory recipe', () => {
    const views = mapChangedFilesToViews([
      'src/ui/svelte/apps/inventory/InventoryView.svelte',
      'src/ui/svelte/apps/inventory/InventoryDetail.svelte',
    ]);

    assert.deepEqual(views.map(view => view.id), ['player-inventory']);
    assert.deepEqual(views[0].smokeLabels, ['player-inventory']);
  });

  // Issue 675. The `player-salvage` glob is NARROW on purpose: `apps/inventory/**`
  // would return two ids for the two ordinary inventory files above and break that
  // exact-equality assertion — and it would force a salvage frame onto every future
  // unrelated inventory touch.
  it('maps only the salvage tree to the player-salvage recipe, and to BOTH recipes', () => {
    for (const file of [
      'src/ui/svelte/apps/inventory/detail/salvage/SalvageSimpleBody.svelte',
      'src/ui/svelte/apps/inventory/detail/InventorySalvagePanel.svelte',
    ]) {
      const ids = mapChangedFilesToViews([file]).map(view => view.id).sort();
      // A salvage change IS an inventory change, so both frames are expected.
      assert.deepEqual(ids, ['player-inventory', 'player-salvage'], file);
    }

    const view = VIEW_RECIPES.find(recipe => recipe.id === 'player-salvage');
    // Two frames, neither substituting for the other: the progressive stage list and
    // the no-check body. The smoke-label guard below pins both to real captures.
    assert.deepEqual(view.smokeLabels, ['player-salvage', 'player-salvage-no-check']);

    // An ordinary inventory file must NOT pull in the salvage frame.
    assert.deepEqual(
      mapChangedFilesToViews(['src/ui/svelte/apps/inventory/InventoryGrid.svelte']).map(v => v.id),
      ['player-inventory'],
    );
  });

  // Issue 764: the two demonstration frames — the Simple-mode editor cap and the GM
  // misconfigured inventory cue — each their own recipe (one file per id) so `collect`
  // publishes both, mapped narrowly to a source THIS PR changed.
  it('maps the issue-764 demonstration frames to their changed sources', () => {
    const editorViews = mapChangedFilesToViews(['src/ui/svelte/apps/manager/ComponentEditView.svelte']).map(v => v.id);
    assert.ok(editorViews.includes('manager-component-edit-salvage-simple'));

    // The misconfigured body maps to its own frame PLUS the broader inventory/salvage
    // frames — it lives under both globs — but must not disturb the player-salvage
    // deep-equality above (which tests other salvage files).
    const bodyViews = mapChangedFilesToViews([
      'src/ui/svelte/apps/inventory/detail/salvage/SalvageMisconfiguredBody.svelte',
    ]).map(v => v.id).sort();
    assert.deepEqual(bodyViews, ['player-inventory', 'player-salvage', 'player-salvage-misconfigured']);

    const byId = Object.fromEntries(VIEW_RECIPES.map(view => [view.id, view.smokeLabels]));
    assert.deepEqual(byId['manager-component-edit-salvage-simple'], ['manager-component-edit-salvage-simple']);
    assert.deepEqual(byId['player-salvage-misconfigured'], ['player-salvage-misconfigured']);
  });

  // Issue 777: the required-tools disclosure frame is its own recipe (one file per id) so
  // `collect` publishes it; appending its label to `player-salvage` would never publish it.
  // Its narrow glob onto SalvageToolRequirements.svelte adds it alongside the broader
  // inventory/salvage frames, without disturbing the player-salvage deep-equality above.
  it('maps the issue-777 required-tools frame to its changed source', () => {
    const ids = mapChangedFilesToViews([
      'src/ui/svelte/apps/inventory/detail/salvage/SalvageToolRequirements.svelte',
    ]).map(v => v.id).sort();
    assert.deepEqual(ids, ['player-inventory', 'player-salvage', 'player-salvage-tools']);

    const byId = Object.fromEntries(VIEW_RECIPES.map(view => [view.id, view.smokeLabels]));
    assert.deepEqual(byId['player-salvage-tools'], ['player-salvage-tools']);
  });

  // Issue 766: the multi-system collapse frame is its own recipe (one file per id) so
  // `collect` publishes it; the existing player-inventory capture walk selects a
  // single-system item and cannot reach the selector. Its narrow glob onto
  // InventorySystemSelector.svelte adds it alongside the broad inventory frame, without
  // disturbing the player-inventory deep-equality above.
  it('maps the issue-766 multi-system frame to its changed source', () => {
    const ids = mapChangedFilesToViews([
      'src/ui/svelte/apps/inventory/detail/InventorySystemSelector.svelte',
    ]).map(v => v.id).sort();
    assert.deepEqual(ids, ['player-inventory', 'player-inventory-multi-system']);

    const byId = Object.fromEntries(VIEW_RECIPES.map(view => [view.id, view.smokeLabels]));
    assert.deepEqual(byId['player-inventory-multi-system'], ['player-inventory-multi-system']);
  });

  // Issue 797: the recipe-item Validation tab is brought to parity with the recipe
  // Validation tab. TWO dedicated view ids (all-clear + mixed-failing), each its own
  // single-frame view — `collect` publishes only `candidates[0]` from a filename-sorted
  // list, so both frames must be separate views to reach the PR. Both map to the
  // validation tab file AND the editor shell that hosts it.
  it('maps the issue-797 recipe-item Validation frames to their own view ids', () => {
    const byId = Object.fromEntries(VIEW_RECIPES.map(view => [view.id, view.smokeLabels]));
    assert.deepEqual(byId['manager-recipe-item-validation'], ['manager-recipe-item-validation']);
    assert.deepEqual(byId['manager-recipe-item-validation-blocked'], ['manager-recipe-item-validation-blocked']);

    // The validation tab file republishes BOTH frames.
    const tabIds = mapChangedFilesToViews([
      'src/ui/svelte/apps/manager/recipe-item/RecipeItemValidationTab.svelte',
    ]).map(view => view.id);
    assert.ok(tabIds.includes('manager-recipe-item-validation'));
    assert.ok(tabIds.includes('manager-recipe-item-validation-blocked'));

    // The editor shell that hosts the tab republishes BOTH frames too.
    const editorIds = mapChangedFilesToViews([
      'src/ui/svelte/apps/manager/RecipeItemEditor.svelte',
    ]).map(view => view.id);
    assert.ok(editorIds.includes('manager-recipe-item-validation'));
    assert.ok(editorIds.includes('manager-recipe-item-validation-blocked'));
  });

  it('maps the #492 import-report render files to the manager-import-report recipe', () => {
    for (const file of [
      'src/ui/SvelteCraftingSystemManagerApp.svelte.js',
      'src/systems/importReportContent.js',
      // Issue 877 moved the rendering into a Svelte modal built on the shared chrome.
      'src/ui/svelte/apps/manager/ImportReportModal.svelte',
      'src/ui/svelte/apps/manager/ManagerModal.svelte',
    ]) {
      const views = mapChangedFilesToViews([file]);
      assert.ok(
        views.some(view => view.id === 'manager-import-report'),
        `${file} should map to the manager-import-report recipe`,
      );
    }
    const view = VIEW_RECIPES.find(recipe => recipe.id === 'manager-import-report');
    assert.deepEqual(view.smokeLabels, ['manager-import-report']);
  });

  // The shared modal chrome (issue 877) is rendered by BOTH import-flow modals, so a
  // change to it must republish both frames, not just the report's.
  it('maps the shared ManagerModal chrome to both import-flow frames', () => {
    const ids = mapChangedFilesToViews([
      'src/ui/svelte/apps/manager/ManagerModal.svelte',
    ]).map(view => view.id);
    assert.ok(ids.includes('manager-import-report'));
    assert.ok(ids.includes('manager-import-folder-mapping'));
  });

  it('maps the recipe shell broadly while each focused recipe tab maps only its frames', () => {
    const expected = [
      'manager-recipe-edit-normal',
      'manager-recipe-edit-ingredients',
      // Issue 684: the essence + currency-cost rows, split into their own scrolled frame.
      'manager-recipe-edit-ingredients-cost',
      'manager-recipe-edit-validation',
      'manager-recipe-edit-multistep',
      // The four Results-tab modes (issue 643): routed-by-check outcome bands, the
      // multi-step per-step content (the frame that proves the C1 render fix),
      // progressive ordered stages, and the alchemy two-slot shape.
      'manager-recipe-edit-results',
      'manager-recipe-edit-results-multistep',
      // The collapsed multi-step editor (issue 710): the read-only steps card the
      // editor renders when the system's multi-step feature is off. It is a recipe-edit
      // frame (RecipeOverviewTab/RecipeEditView), so every editor file republishes it.
      'manager-recipe-edit-collapsed',
      'manager-recipe-edit-results-progressive',
      'manager-recipe-edit-results-alchemy',
      'manager-recipe-edit-tools',
      // The MODE-CONDITIONAL context rail's restricted (access) branch. It is the
      // only frame captured against a restricted-visibility system; the others
      // run against a system whose mode drives the Books & Scrolls branch.
      'manager-recipe-edit-access-rail',
      // The Books & Scrolls tab body (issue 796): its own frame so the linked-book grid
      // fix reaches a PR (collect publishes only candidates[0] per view id).
      'manager-recipe-edit-books-scrolls',
    ];

    assert.deepEqual(
      mapChangedFilesToViews(['src/ui/svelte/apps/manager/RecipeEditView.svelte']).map((view) => view.id),
      expected,
    );
    const withoutTools = expected.filter((id) => id !== 'manager-recipe-edit-tools');
    for (const file of [
      'src/ui/svelte/apps/manager/recipe/RecipeAccessTab.svelte',
      'src/ui/svelte/apps/manager/recipe/RecipeBooksScrollsTab.svelte',
      'src/ui/svelte/apps/manager/recipe/RecipeOverviewTab.svelte',
    ]) {
      const views = mapChangedFilesToViews([file]);
      assert.deepEqual(views.map(view => view.id), withoutTools, `${file} should not republish the unrelated Tools tab`);
    }

    // Each frame carries exactly its own single smoke label.
    const views = mapChangedFilesToViews(['src/ui/svelte/apps/manager/RecipeEditView.svelte']);
    assert.deepEqual(views.map(view => view.smokeLabels), [
      ['manager-recipe-edit-normal'],
      ['manager-recipe-edit-ingredients'],
      ['manager-recipe-edit-ingredients-cost'],
      ['manager-recipe-edit-validation'],
      ['manager-recipe-edit-multistep'],
      ['manager-recipe-edit-results'],
      ['manager-recipe-edit-results-multistep'],
      ['manager-recipe-edit-collapsed'],
      ['manager-recipe-edit-results-progressive'],
      ['manager-recipe-edit-results-alchemy'],
      ['manager-recipe-edit-tools'],
      ['manager-recipe-edit-access-rail'],
      ['manager-recipe-edit-books-scrolls'],
    ]);
  });

  it('maps the issue-770 check-modifier UI to its Checks and recipe-edit frames', () => {
    const idsFor = (file) => mapChangedFilesToViews([file]).map(view => view.id);
    // The catalogue card has its OWN dedicated modifier frame (not the failure-
    // consumption one, which the crafting tab scrolls elsewhere for).
    assert.deepEqual(
      idsFor('src/ui/svelte/apps/manager/checks/CraftingModifierCatalogueCard.svelte'),
      ['manager-checks-crafting-modifiers'],
    );
    // The dedicated frame carries exactly its own single smoke label.
    const byId = Object.fromEntries(VIEW_RECIPES.map(view => [view.id, view.smokeLabels]));
    assert.deepEqual(byId['manager-checks-crafting-modifiers'], ['manager-checks-crafting-modifiers']);
    // The shared pill multi-select renders in BOTH the Checks default set and the
    // recipe Overview override, so it maps to the dedicated modifier frame and every
    // recipe-edit frame.
    const pillIds = idsFor('src/ui/svelte/components/ModifierPillSelect.svelte');
    assert.ok(pillIds.includes('manager-checks-crafting-modifiers'));
    assert.ok(pillIds.includes('manager-recipe-edit-normal'));
  });

  it('collects the thirteen recipe-edit frames into thirteen separate files', () => {
    const changedFiles = ['src/ui/svelte/apps/manager/RecipeEditView.svelte'];
    withScreenshotFixtures(
      changedFileEvidenceFixtures(changedFiles),
      (root) => {
        const result = collectScreenshotEvidence({
          changedFiles,
          prNumber: 654,
          root,
          headSha: 'abc1234',
        });
        assert.equal(result.copied.length, 13);
        assert.deepEqual(
          result.copied.map(item => item.destination.replaceAll('\\', '/').split('/').pop()),
          mapChangedFilesToViews(changedFiles).map(view => `${view.id}.png`),
        );
      },
    );
  });

  it('keeps every screenshot recipe backed by real smoke labels', () => {
    for (const recipe of VIEW_RECIPES) {
      assert.ok(Array.isArray(recipe.smokeLabels), `${recipe.id} should declare smokeLabels`);
      assert.ok(recipe.smokeLabels.length > 0, `${recipe.id} should map to at least one smoke artifact`);
      assert.equal('focusedScreenshots' in recipe, false, `${recipe.id} should not use synthetic focused screenshots`);
    }
  });

  it('accepts an image beneath a Screenshots heading at any level', () => {
    const attachment = '![Environment](https://github.com/user-attachments/assets/123e4567-e89b-12d3-a456-426614174000)';
    assert.equal(hasScreenshotEvidence(`## Screenshots\n\n${attachment}`), true);
    // Any ATX level qualifies, and a closed (`## Screenshots ##`) heading too.
    assert.equal(hasScreenshotEvidence(`# Screenshots\n\n${attachment}`), true);
    assert.equal(hasScreenshotEvidence(`### Screenshots ###\n\n${attachment}`), true);
    // The heading match is case-insensitive and allows the singular form.
    assert.equal(hasScreenshotEvidence(`## screenshot\n\n${attachment}`), true);
    // An HTML <img> under the heading counts as well.
    assert.equal(hasScreenshotEvidence('## Screenshots\n\n<img src="https://example.com/a.png" alt="a">'), true);
  });

  it('rejects images that are not under a Screenshots heading', () => {
    const attachment = '![Environment](https://github.com/user-attachments/assets/123e4567-e89b-12d3-a456-426614174000)';
    // A bare image with no Screenshots heading is not evidence.
    assert.equal(hasScreenshotEvidence(attachment), false);
    assert.equal(hasScreenshotEvidence(`## Description\n\n${attachment}`), false);
    // A Screenshots heading with no image beneath it is not evidence; the image
    // sits under a sibling heading, outside the (empty) Screenshots section.
    assert.equal(hasScreenshotEvidence(`## Screenshots\n\nComing soon.\n\n## Notes\n\n${attachment}`), false);
  });

  it('does not accept legacy artifact text or the SCREENSHOTS_NEEDED bypass as evidence', () => {
    assert.equal(hasScreenshotEvidence('Screenshot artifacts were uploaded as `codex-ui-evidence-42-99`.'), false);
    assert.equal(hasScreenshotEvidence('See `test-results/screenshot-01-manager-components-normal.png`.'), false);
    assert.equal(hasScreenshotEvidence('SCREENSHOTS_NEEDED: Playwright could not launch for Manager tools.'), false);
  });

  it('explains missing UI screenshot evidence with mapped changed views', () => {
    const failure = explainScreenshotEvidenceFailure(
      ['src/ui/svelte/apps/manager/ToolsBrowserView.svelte'],
      '![Unrelated](https://example.com/mock.png)',
      { prNumber: 321 },
    );

    assert.match(failure, /Tool Studio — library/);
    assert.match(failure, /## Screenshots/);
    assert.match(failure, /screenshots-exempt/);
  });

  it('passes the check once a Screenshots section with an image is present', () => {
    const failure = explainScreenshotEvidenceFailure(
      ['src/ui/svelte/apps/manager/ToolsBrowserView.svelte'],
      '## Screenshots\n\n![Tools](https://github.com/user-attachments/assets/123e4567-e89b-12d3-a456-426614174000)',
      { prNumber: 321 },
    );
    assert.equal(failure, null);
  });

  it('treats empty changed-file input as an invalid check-mode state', () => {
    assert.match(validateChangedFilesForCheck([], { required: true }), /Changed-files input is empty/);
    assert.equal(validateChangedFilesForCheck(['docs/readme.md'], { required: true }), '');
    assert.equal(validateChangedFilesForCheck([], { required: false }), '');
  });

  it('keeps smoke screenshot collection available as an explicit fallback', () => {
    const changedFiles = ['src/ui/svelte/apps/manager/EnvironmentsBrowserView.svelte'];
    withScreenshotFixtures(
      changedFileEvidenceFixtures(changedFiles),
      (root) => {
        const result = collectScreenshotEvidence({
          changedFiles,
          prNumber: 456,
          root,
          headSha: 'abc1234',
        });
        assert.equal(result.copied.length, 1);
        const relativeDestination = result.copied[0].destination.replace(root, '').replaceAll('\\', '/');
        assert.equal(relativeDestination, '/tmp/pr-screenshots/456/manager-environments.png');
      },
    );
  });

  it('requires run metadata before collecting Tool Studio screenshots', () => {
    withScreenshotFixtures({}, (root) => {
      assert.throws(() => collectScreenshotEvidence({
        changedFiles: ['src/ui/svelte/apps/manager/ToolsBrowserView.svelte'],
        prNumber: 456,
        root,
        headSha: 'abc1234',
      }), /Missing smoke summary/);
    });
  });

  it('requires exact-run provenance for an ordinary collected view', () => {
    const changedFiles = ['src/ui/svelte/apps/manager/EnvironmentsBrowserView.svelte'];
    withScreenshotFixtures(changedFileEvidenceFixtures(changedFiles), (root) => {
      const result = collectScreenshotEvidence({
        changedFiles,
        prNumber: 456,
        root,
        headSha: 'abc1234',
      });
      assert.deepEqual(result.copied.map(({ view }) => view.id), ['manager-environments']);
    });
  });

  it('resolves screenshot provenance from explicit, CI, then local git head inputs', () => {
    const calls = [];
    const gitHead = (args) => {
      calls.push(args);
      return { status: 0, stdout: 'local-head\n', stderr: '' };
    };

    assert.equal(resolveScreenshotHeadSha({
      explicitHeadSha: 'manual-head',
      ciHeadSha: 'ci-head',
      runGit: gitHead,
    }), 'manual-head');
    assert.equal(resolveScreenshotHeadSha({
      ciHeadSha: 'ci-head',
      runGit: gitHead,
    }), 'ci-head');
    // An explicit empty CI input disables the process.env.GITHUB_SHA default so
    // this assertion deterministically exercises the local git-head fallback in
    // both local and CI environments.
    assert.equal(resolveScreenshotHeadSha({ ciHeadSha: '', runGit: gitHead }), 'local-head');
    assert.deepEqual(calls, [['rev-parse', '--verify', 'HEAD']]);
  });

  it('runs the documented local producer/collect provenance path against the exact git head', () => {
    const changedFiles = ['src/ui/svelte/apps/manager/EnvironmentsBrowserView.svelte'];
    const gitHead = spawnSync('git', ['rev-parse', '--verify', 'HEAD'], {
      cwd: process.cwd(),
      encoding: 'utf8',
    }).stdout.trim();
    const root = mkdtempSync(join(tmpdir(), 'fabricate-ui-screenshot-cli-'));
    try {
      const sourceDir = join(root, 'test-results');
      const outputDir = join(root, 'collected');
      const changedFilesPath = join(root, 'changed-files.txt');
      mkdirSync(sourceDir, { recursive: true });
      writeFileSync(changedFilesPath, `${changedFiles.join('\n')}\n`);
      for (const [name, content] of Object.entries(
        changedFileEvidenceFixtures(changedFiles, { headSha: gitHead }),
      )) {
        writeFileSync(join(sourceDir, name), content);
      }
      const env = { ...process.env };
      delete env.GITHUB_SHA;
      const result = spawnSync(
        process.execPath,
        [
          'scripts/ui-pr-screenshot-evidence.mjs',
          'collect',
          '--changed-files',
          changedFilesPath,
          '--source-dir',
          sourceDir,
          '--output-dir',
          outputDir,
          '--pr',
          '456',
        ],
        { cwd: process.cwd(), encoding: 'utf8', env },
      );

      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /manager-environments\.png/);
      assert.equal(existsSync(join(outputDir, 'manager-environments.png')), true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('validates ordinary and Tool Studio captures as one mixed exact run', () => {
    const changedFiles = [
      'src/ui/svelte/apps/manager/EnvironmentsBrowserView.svelte',
      'src/ui/svelte/apps/manager/ToolsBrowserView.svelte',
    ];
    const views = mapChangedFilesToViews(changedFiles);
    withScreenshotFixtures(
      automatedEvidenceFixtures({
        frames: [
          ['manager-environments', 'manager-environments-browse-normal', 800, 600],
          ...TOOL_STUDIO_VIEWS,
        ],
        targetLabels: views.flatMap(view => view.smokeLabels),
      }),
      (root) => {
        const result = collectScreenshotEvidence({
          changedFiles,
          prNumber: 456,
          root,
          headSha: 'abc1234',
        });
        assert.deepEqual(result.copied.map(({ view }) => view.id), views.map(view => view.id));
      },
    );
  });

  it('rejects failed, degraded, mismatched, stale, and wrong-target ordinary runs', () => {
    const changedFiles = ['src/ui/svelte/apps/manager/EnvironmentsBrowserView.svelte'];
    const cases = [
      // The refusal names the condition that tripped and the value it measured (issue
      // #1019). It deliberately no longer contains the old "failed or degraded smoke
      // summary" literal: keeping that substring alive would have made back-compat with a
      // test literal into back-compat with the ten-word message the change exists to remove.
      [
        changedFileEvidenceFixtures(changedFiles, { summaryPatch: { passed: false } }),
        /^ {2}passed: false — /m,
      ],
      [
        changedFileEvidenceFixtures(changedFiles, { summaryPatch: { degraded: true } }),
        /^ {2}degraded: true — /m,
      ],
      [
        changedFileEvidenceFixtures(changedFiles, { manifestPatch: { runId: 'another-run' } }),
        /one run identity/,
      ],
      [
        changedFileEvidenceFixtures(changedFiles, { manifestPatch: { headSha: 'another-head' } }),
        /stale/,
      ],
      [changedFileEvidenceFixtures(changedFiles, { headSha: 'stale123' }), /stale/],
      [
        changedFileEvidenceFixtures(changedFiles, {
          targetLabels: ['manager-environments-browse-normal'],
        }),
        /another target-label set/,
      ],
      [
        changedFileEvidenceFixtures(changedFiles, {
          manifestPatch: { targetLabels: ['manager-environments-browse-normal'] },
        }),
        /another target-label set/,
      ],
    ];
    for (const [fixtures, message] of cases) {
      withScreenshotFixtures(fixtures, (root) => {
        assert.throws(() => collectScreenshotEvidence({
          changedFiles,
          prNumber: 456,
          root,
          headSha: 'abc1234',
        }), message);
      });
    }
  });

  // ── The refusal diagnostic at the call site (issue #1019) ────────────────
  //
  // Direct-call tests of `explainSmokeSummaryRefusal` live in
  // `tests/foundry-smoke-summary.test.js`. These exercise the gate itself, because a
  // builder that is never reached is a builder whose absence no test can detect: the
  // mutation that established the need for this block replaced the whole throw with
  // `new Error('MUTANT …')` and this suite still returned 83 pass / 0 fail.
  const EVIDENCE_CHANGED_FILES = ['src/ui/svelte/apps/manager/EnvironmentsBrowserView.svelte'];

  // One shared driver over the existing `summaryPatch` extension point, which spreads last
  // and reaches both fixture factories. Table-driven rather than a dozen copied blocks:
  // SonarCloud Automatic Analysis ignores `sonar.cpd.exclusions`, so near-identical
  // `tests/**` fixtures count against the new-code duplication gate exactly like `src/`.
  const refuseWith = (summaryPatch, assertMessage) => {
    withScreenshotFixtures(
      changedFileEvidenceFixtures(EVIDENCE_CHANGED_FILES, { summaryPatch }),
      (root) => {
        assert.throws(
          () => collectScreenshotEvidence({
            changedFiles: EVIDENCE_CHANGED_FILES,
            prNumber: 456,
            root,
            headSha: 'abc1234',
          }),
          (error) => {
            assertMessage(error.message);
            return true;
          }
        );
      }
    );
  };

  // Each fixture sets EXACTLY ONE field off-nominal, with the other four at their accepting
  // values, so removing that disjunct from the gate's predicate flips this test to FAIL.
  // The natural pair `{ passed: false, stepFailures: 2 }` would kill nothing — `passed !==
  // true` short-circuits the disjunction — and `{ passed: true, stepFailures: 1 }` is not a
  // summary the harness can emit. That is the point of it, not a defect in the fixture.
  it('names each disqualifying evidence condition on its own, with the value it measured', () => {
    const cases = [
      [{ passed: false }, /^ {2}passed: false — the run did not record a successful verdict$/m],
      [{ stepFailures: 1 }, /^ {2}stepFailures: 1 — /m],
      [{ consoleErrorCount: 4 }, /^ {2}consoleErrorCount: 4 — /m],
      [{ degraded: true }, /^ {2}degraded: true — /m],
      [{ rendererCrashed: true }, /^ {2}rendererCrashed: true — /m],
    ];
    for (const [summaryPatch, expected] of cases) {
      refuseWith(summaryPatch, (message) => {
        assert.match(message, expected);
        assert.match(message, /^Disqualifying evidence conditions \(1 of 5\):$/m);
      });
    }
  });

  // THE GATE-OPENING MUTANTS, all of them. Each of the gate's five disjuncts compares with
  // `!==` so that a summary simply MISSING the key refuses; every weakening to a positive test
  // — `stepFailures > 0`, `passed === false`, `degraded === true`, `rendererCrashed === true` —
  // accepts that summary instead and opens the gate to a stale or truncated artifact. The
  // single-condition fixtures above survive all four (measured), because they set the key to a
  // present off-nominal value. Only an ABSENT key kills them, so all five keys are covered here
  // rather than just the two counts. `summaryPatch: { key: undefined }` is how a key goes
  // absent: JSON.stringify drops it.
  const ACCEPTING_VALUE = Object.freeze({
    passed: 'true',
    stepFailures: '0',
    consoleErrorCount: '0',
    degraded: 'false',
    rendererCrashed: 'false',
  });
  it('refuses a summary whose evidence-condition key is absent entirely, for every condition', () => {
    for (const [key, accepting] of Object.entries(ACCEPTING_VALUE)) {
      refuseWith({ [key]: undefined }, (message) => {
        assert.match(message, new RegExp(`^ {2}${key}: not recorded — `, 'm'));
        // Never rendered as the value that would have been ACCEPTED: a refusal stating an
        // accepting value for the condition it just tripped on reads as a gate defect.
        assert.ok(
          !message.includes(`${key}: ${accepting}`),
          `${key} must not be reported as ${accepting}`
        );
      });
    }
  });

  // A source-scan drift guard over the predicate itself, because the fixtures above can only
  // ever cover the conditions someone remembered to write one for. It pins the exact five
  // comparisons AND that they are what guards the builder call, so a sixth condition, a dropped
  // disjunct, a weakened operator, or a detached builder all fail here in one assertion.
  it('gates on exactly five evidence conditions, each a strict !== against its accepting value', () => {
    const source = readFileSync(new URL('../scripts/ui-pr-screenshot-evidence.mjs', import.meta.url), 'utf8');
    const guarded = /\n {2}if \(\n([\s\S]*?)\n {2}\) \{\n {4}throw new Error\(explainSmokeSummaryRefusal\(summary\)\);/.exec(source);
    assert.ok(Boolean(guarded), 'the five-condition predicate must guard the refusal builder');
    assert.deepEqual(guarded[1].match(/summary\.\w+ !== (?:true|false|0)/g), [
      'summary.passed !== true',
      'summary.stepFailures !== 0',
      'summary.consoleErrorCount !== 0',
      'summary.degraded !== false',
      'summary.rendererCrashed !== false',
    ]);
    // …and nothing else reads the summary inside that block, so no sixth condition slips in
    // under a comparison shape the matcher above does not recognise.
    assert.equal((guarded[1].match(/summary\./g) || []).length, 5);
  });

  // The accept side, so the diagnostic cannot be satisfied by refusing everything.
  it('still accepts a run whose steps all passed and whose console errors are empty', () => {
    withScreenshotFixtures(
      changedFileEvidenceFixtures(EVIDENCE_CHANGED_FILES, {
        summaryPatch: {
          steps: [
            { step: 'boot-and-join', passed: true },
            { step: 'screenshot-manager', passed: true },
          ],
          consoleErrors: [],
        },
      }),
      (root) => {
        const result = collectScreenshotEvidence({
          changedFiles: EVIDENCE_CHANGED_FILES,
          prNumber: 456,
          root,
          headSha: 'abc1234',
        });
        assert.equal(result.copied.length, 1);
      }
    );
  });

  // The incident from issue #1019, replayed. A first-match-wins builder would emit "the run
  // did not pass" and nothing else here — the exact class-of-fault message this change exists
  // to remove — and ship green, so both tripped conditions must be named.
  it('replays the reported incident: names both tripped conditions and quotes every error', () => {
    const interfaceError = "pageerror: Cannot read properties of undefined (reading 'INTERFACE')";
    refuseWith(
      {
        passed: false,
        stepFailures: 0,
        consoleErrorCount: 3,
        consoleErrors: [interfaceError, interfaceError, interfaceError],
      },
      (message) => {
        assert.match(message, /^Disqualifying evidence conditions \(2 of 5\):$/m);
        assert.match(message, /^ {2}passed: false — /m);
        assert.match(message, /^ {2}consoleErrorCount: 3 — /m);
        assert.equal(message.split('\n').filter((line) => line.includes('INTERFACE')).length, 3);
        // The attribution procedure and the already-present-at-base prior.
        assert.match(message, /git merge-base HEAD origin\/main/);
        assert.match(message, /already present at the pull request's base/);
        assert.match(message, /stepFailures 0 with consoleErrorCount above 0/);
        // It never claims to have performed the comparison it describes.
        assert.match(message, /reads one summary/);
      }
    );
  });

  it('names all five conditions when a summary trips all five', () => {
    refuseWith(
      {
        passed: false,
        stepFailures: 2,
        consoleErrorCount: 1,
        degraded: true,
        rendererCrashed: true,
      },
      (message) => {
        assert.match(message, /^Disqualifying evidence conditions \(5 of 5\):$/m);
        for (const name of ['passed', 'stepFailures', 'consoleErrorCount', 'degraded', 'rendererCrashed']) {
          assert.match(message, new RegExp(`^ {2}${name}: `, 'm'));
        }
      }
    );
  });

  // `collect` prints this through `console.error(error.message)` with no `::error::`
  // annotation, which is what makes a multi-line message safe. An annotation would collapse
  // it to the first line in a GitHub log and silently undo the whole change.
  it('emits a multi-line refusal carrying no workflow-command annotation', () => {
    refuseWith({ passed: false }, (message) => {
      assert.ok(message.split('\n').length > 5, 'the refusal is multi-line');
      assert.ok(!message.includes('::error'), 'no ::error:: annotation');
      assert.ok(!message.includes('::warning'), 'no ::warning:: annotation');
    });
    const source = readFileSync(new URL('../scripts/ui-pr-screenshot-evidence.mjs', import.meta.url), 'utf8');
    assert.match(source, /console\.error\(error\.message\)/);
  });

  it('rejects an ordinary capture without binding or truthful PNG dimensions', () => {
    const changedFiles = ['src/ui/svelte/apps/manager/EnvironmentsBrowserView.svelte'];
    const dimensionsMismatch = changedFileEvidenceFixtures(changedFiles);
    const image = Object.keys(dimensionsMismatch).find(name => name.endsWith('.png'));
    dimensionsMismatch[image] = minimalPng(799, 600);
    const cases = [
      [
        changedFileEvidenceFixtures(changedFiles, {
          capturePatch: () => ({ label: 'unselected-label' }),
        }),
        /manifest does not bind/,
      ],
      [dimensionsMismatch, /PNG dimensions do not match its manifest/],
    ];
    for (const [fixtures, message] of cases) {
      withScreenshotFixtures(fixtures, (root) => {
        assert.throws(() => collectScreenshotEvidence({
          changedFiles,
          prNumber: 456,
          root,
          headSha: 'abc1234',
        }), message);
      });
    }
  });

  // Both regressions below made `collect` throw for evidence that was entirely valid,
  // so the documented
  // `test:foundry:screenshots --target-labels=$(screenshots:ui:targets)` -> `collect`
  // workflow could not complete. Neither was caught before because the fixture helper
  // mirrored the buggy expectations: it built `targetLabels` with the same raw
  // `flatMap` the validator used, and gave every frame a clip-shaped width/height.
  it('accepts a run whose target labels are deduped across views that share a label', () => {
    // `manager-default-selection` belongs to the systems view AND the
    // theme-or-global-ui fallback, so any change matching both yields a raw flatMap
    // longer than the run's recorded SET of labels.
    const changedFiles = [
      'styles/fabricate.css',
      'src/ui/svelte/apps/manager/SystemsBrowserView.svelte',
    ];
    const views = mapChangedFilesToViews(changedFiles);
    const rawLabels = views.flatMap(view => view.smokeLabels);
    const dedupedLabels = [...new Set(rawLabels)];
    assert.ok(
      dedupedLabels.length < rawLabels.length,
      'fixture precondition: this changed-file set must match two views sharing a label'
    );
    // A css change also matches the Tool Studio recipes, whose parity frames carry
    // pinned dimensions — so build frames from TOOL_STUDIO_VIEWS where they apply and
    // fall back to generic geometry elsewhere.
    const toolStudioByViewId = new Map(TOOL_STUDIO_VIEWS.map(frame => [frame[0], frame]));
    const frames = views.map((view, index) =>
      toolStudioByViewId.get(view.id) || [view.id, view.smokeLabels[0], 800 + index, 600 + index]
    );
    withScreenshotFixtures(
      automatedEvidenceFixtures({ frames, targetLabels: dedupedLabels }),
      (root) => {
        const result = collectScreenshotEvidence({
          changedFiles,
          prNumber: 876,
          root,
          headSha: 'abc1234',
        });
        assert.equal(result.copied.length, views.length);
      },
    );
  });

  it('accepts an unclipped capture that declares no geometry in the manifest', () => {
    // `screenshot()` records `options.clip?.width ?? null`, so a full-page frame — most
    // of the walk — declares null. Comparing real pixels against null was fatal.
    const changedFiles = ['src/ui/svelte/apps/manager/EnvironmentsBrowserView.svelte'];
    // Null the DECLARED geometry only. Patching it through `capturePatch` would also
    // shrink the generated PNG, since the helper builds pixels from the same array —
    // that would test a zero-sized image, not an unclipped one.
    const fixtures = changedFileEvidenceFixtures(changedFiles);
    const manifest = JSON.parse(fixtures['screenshot-manifest.json']);
    manifest.captures = manifest.captures.map(capture => ({
      ...capture,
      width: null,
      height: null,
    }));
    fixtures['screenshot-manifest.json'] = JSON.stringify(manifest);
    withScreenshotFixtures(
      fixtures,
      (root) => {
        const result = collectScreenshotEvidence({
          changedFiles,
          prNumber: 876,
          root,
          headSha: 'abc1234',
        });
        assert.equal(result.copied.length, 1);
        assert.equal(result.missing.length, 0);
      },
    );
  });

  it('collects truthful r15-shaped Tool Studio parity and stress PNGs from one green current-head run', () => {
    withScreenshotFixtures(toolStudioEvidenceFixtures(), (root) => {
      const result = collectScreenshotEvidence({
        changedFiles: ['src/ui/svelte/apps/manager/ToolsBrowserView.svelte'],
        prNumber: 456,
        root,
        headSha: 'abc1234',
      });
      assert.deepEqual(result.copied.map(({ view }) => view.id), TOOL_STUDIO_VIEWS.map(([id]) => id));
      assert.equal(result.missing.length, 0);
    });
  });

  it('rejects Tool Studio images whose PNG dimensions disagree with a truthful-looking manifest', () => {
    const fixtures = toolStudioEvidenceFixtures();
    const [firstFile] = Object.keys(fixtures);
    fixtures[firstFile] = minimalPng(1200, 682);
    withScreenshotFixtures(fixtures, (root) => {
      assert.throws(() => collectScreenshotEvidence({
        changedFiles: ['src/ui/svelte/apps/manager/ToolsBrowserView.svelte'],
        prNumber: 456,
        root,
        headSha: 'abc1234',
      }), /Wrong Tool Studio PNG dimensions for 01-library-1280x720: 1200x682; expected 1212x682/);
    });
  });

  it('rejects invalid bytes presented as a Tool Studio PNG', () => {
    const fixtures = toolStudioEvidenceFixtures();
    const [firstFile] = Object.keys(fixtures);
    fixtures[firstFile] = Buffer.from('not a png');
    withScreenshotFixtures(fixtures, (root) => {
      assert.throws(() => collectScreenshotEvidence({
        changedFiles: ['src/ui/svelte/apps/manager/ToolsBrowserView.svelte'],
        prNumber: 456,
        root,
        headSha: 'abc1234',
      }), /Invalid Tool Studio PNG for 01-library-1280x720/);
    });
  });

  it('rejects failed, stale-head, and wrong-label-set Tool Studio runs', () => {
    const cases = [
      [
        toolStudioEvidenceFixtures({ summaryPatch: { passed: false } }),
        'abc1234',
        /^ {2}passed: false — the run did not record a successful verdict$/m,
      ],
      [toolStudioEvidenceFixtures({ headSha: 'stale123' }), 'abc1234', /stale for the requested PR head SHA/],
      [
        toolStudioEvidenceFixtures({
          targetLabels: TOOL_STUDIO_VIEWS
            .filter(([id]) => id !== 'zero-state-empty-library-1280x720')
            .map(([, label]) => label),
        }),
        'abc1234',
        /another target-label set/,
      ],
    ];
    for (const [fixtures, headSha, message] of cases) {
      withScreenshotFixtures(fixtures, (root) => {
        assert.throws(() => collectScreenshotEvidence({
          changedFiles: ['src/ui/svelte/apps/manager/ToolsBrowserView.svelte'],
          prNumber: 456,
          root,
          headSha,
        }), message);
      });
    }
  });

  it('rejects duplicate candidates, old or wrong parity dimensions, and stress-substituted evidence', () => {
    const duplicateLabel = TOOL_STUDIO_VIEWS[0][1];
    const cases = [
      [
        {
          ...toolStudioEvidenceFixtures(),
          [`duplicate-${duplicateLabel}.png`]: 'duplicate',
        },
        /Duplicate Tool Studio screenshot evidence/,
      ],
      [
        toolStudioEvidenceFixtures({
          capturePatch: ({ index }) => index === 0 ? { width: 1200 } : {},
        }),
        /Wrong Tool Studio dimensions/,
      ],
      [
        toolStudioEvidenceFixtures({
          capturePatch: ({ index }) => index === 0 ? { height: 686 } : {},
        }),
        /Wrong Tool Studio dimensions for 01-library-1280x720: 1212x686; expected 1212x682/,
      ],
      [
        toolStudioEvidenceFixtures({
          capturePatch: ({ label }) => label === 'manager-tool-parity-06-breakage-900x700'
            ? { height: 666 }
            : {},
        }),
        /Wrong Tool Studio dimensions for 06-breakage-900x700: 832x666; expected 832x662/,
      ],
      [
        toolStudioEvidenceFixtures({
          capturePatch: ({ index }) => index === 0 ? { label: 'manager-tool-stress-repair' } : {},
        }),
        /Stress evidence cannot substitute/,
      ],
    ];
    for (const [fixtures, message] of cases) {
      withScreenshotFixtures(fixtures, (root) => {
        assert.throws(() => collectScreenshotEvidence({
          changedFiles: ['src/ui/svelte/apps/manager/ToolsBrowserView.svelte'],
          prNumber: 456,
          root,
          headSha: 'abc1234',
        }), message);
      });
    }
  });

  it('reports missing non-Tool screenshots and supports allowMissing', () => {
    const changedFiles = ['src/ui/svelte/apps/manager/EnvironmentsBrowserView.svelte'];
    const fixtures = changedFileEvidenceFixtures(changedFiles);
    for (const file of Object.keys(fixtures).filter(name => name.endsWith('.png'))) delete fixtures[file];
    withScreenshotFixtures(fixtures, (root) => {
      const result = collectScreenshotEvidence({
        changedFiles,
        prNumber: 456,
        root,
        allowMissing: true,
        headSha: 'abc1234',
      });
      assert.deepEqual(result.missing.map(view => view.id), ['manager-environments']);
    });
  });

  it('does not expose the removed synthetic screenshot generator path', () => {
    const source = readFileSync('scripts/ui-pr-screenshot-evidence.mjs', 'utf8');
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));

    for (const removed of [
      'renderFocusedScreenshotHtml',
      'generateFocusedScreenshotEvidence',
      'focusedScreenshotCss',
      'renderManagerShell',
      'renderFabricateAppShell',
      'page.setContent',
      'tests/fixtures/ui-assets/manifest.js',
    ]) {
      assert.equal(source.includes(removed), false, `script should not contain ${removed}`);
    }
    assert.equal(packageJson.scripts['screenshots:ui'], 'node scripts/ui-pr-screenshot-evidence.mjs collect');
    assert.equal('screenshots:ui:assets' in packageJson.scripts, false);
    assert.equal(packageJson.scripts['screenshots:ui'].includes('generate'), false);
  });

  it('cleans PR-scoped temporary screenshot evidence', () => {
    const root = mkdtempSync(join(tmpdir(), 'fabricate-ui-screenshots-'));
    try {
      const screenshotDir = join(root, 'tmp/pr-screenshots/789');
      const siblingDir = join(root, 'tmp/pr-screenshots/788');
      mkdirSync(screenshotDir, { recursive: true });
      mkdirSync(siblingDir, { recursive: true });
      writeFileSync(join(screenshotDir, 'manager-components.png'), 'png');
      writeFileSync(join(siblingDir, 'manager-components.png'), 'png');

      const removed = cleanPrScreenshotEvidence({ prNumber: 789, root });

      assert.equal(removed.replace(root, '').replace(/\\/g, '/'), '/tmp/pr-screenshots/789');
      assert.equal(existsSync(screenshotDir), false);
      assert.equal(existsSync(siblingDir), true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('requires numeric PR numbers for temporary screenshot operations', async () => {
    assert.throws(() => cleanPrScreenshotEvidence({ prNumber: '../../789' }), /Invalid PR number/);
    assert.throws(() => collectScreenshotEvidence({ changedFiles: [], prNumber: 'abc' }), /Invalid PR number/);
  });

  it('treats a lang-only change as non-UI (co-occurrence rule)', () => {
    const langOnly = ['lang/en.json'];
    assert.equal(hasUiChanges(langOnly), false);
    assert.deepEqual(mapChangedFilesToViews(langOnly), []);
  });

  it('treats a lang change alongside a render file as UI driven by that render file', () => {
    const view = 'src/ui/svelte/apps/manager/ToolsBrowserView.svelte';
    // A non-render `src/ui/**` file that matches NO recipe. `adminStore.js` used to
    // serve here and no longer can: issue 800 gave it real description frames.
    const logicOnly = 'src/ui/svelte/util/dropUtils.js';
    const ids = files => mapChangedFilesToViews(files).map(recipe => recipe.id);

    // A recipe-matching view drives the mapping; the lang file adds nothing.
    assert.equal(hasUiChanges(['lang/en.json', view]), true);
    assert.deepEqual(ids(['lang/en.json', view]), TOOL_STUDIO_VIEWS.map(([id]) => id));

    // A render file that matches no recipe still trips the generic fallback.
    assert.equal(hasUiChanges(['lang/en.json', logicOnly]), true);
    assert.deepEqual(ids(['lang/en.json', logicOnly]), ['theme-or-global-ui']);
  });

  it('keeps every recipe match pattern pointed at a real tracked file', () => {
    const tracked = spawnSync('git', ['ls-files'], { encoding: 'utf8' })
      .stdout.split(/\r?\n/)
      .map(line => line.replace(/\\/g, '/'))
      .filter(Boolean);
    assert.ok(tracked.length > 0, 'expected git ls-files to return tracked files');
    for (const recipe of VIEW_RECIPES) {
      const resolves = recipe.matches.some(pattern => tracked.some(file => pattern.test(file)));
      assert.ok(resolves, `${recipe.id} has no match pattern resolving to a tracked file`);
    }
  });

  it('keeps every recipe smoke label backed by a real smoke-harness screenshot', () => {
    const harness = readFileSync('scripts/foundry-test-run.mjs', 'utf8');
    const emitted = new Set();
    for (const match of harness.matchAll(/screenshot\(\s*page\s*,\s*'([^']+)'/g)) {
      emitted.add(match[1]);
    }
    for (const match of harness.matchAll(/captureToolStudioProduct\(\s*page\s*,\s*'([^']+)'/g)) {
      emitted.add(match[1]);
    }
    for (const match of harness.matchAll(/captureStableManagerView\(\s*page\s*,\s*\{[\s\S]*?label:\s*'([^']+)'[\s\S]*?\}\s*\)/g)) {
      emitted.add(match[1]);
    }
    // Issue 801: the grouped-continuation frames route through the shared
    // captureGroupedContinuationFrame(page, results, { … label: '…' … }) helper, which
    // forwards `label` to captureStableManagerView as a variable — so the literal lives in
    // the helper CALL's options object, not in the captureStableManagerView call itself.
    for (const match of harness.matchAll(/captureGroupedContinuationFrame\(\s*page,\s*results,\s*\{[\s\S]*?label:\s*'([^']+)'/g)) {
      emitted.add(match[1]);
    }
    // Issues 772 / 1010: the SIX bulk-edit frames — three per studio — route through the
    // shared captureBulkEditFrame(page, results, { studio, stepName, label, … }) helper for
    // the same reason: the literal lives in the helper CALL, and the helper forwards `label`
    // onward as a variable.
    for (const match of harness.matchAll(/captureBulkEditFrame\(\s*page,\s*results,\s*\{[\s\S]*?label:\s*'([^']+)'/g)) {
      emitted.add(match[1]);
    }
    // The Results-tab captures (issue 643) route through captureRecipeResultsTab(page,
    // <recipeName>, '<label>', <selector>); the label is the third, string-literal arg.
    for (const match of harness.matchAll(/captureRecipeResultsTab\(\s*page,\s*[^,]+,\s*'([^']+)'/g)) {
      emitted.add(match[1]);
    }
    for (const match of harness.matchAll(/captureCurrentPlayerGathering\(\s*'([^']+)'/g)) {
      emitted.add(match[1]);
    }
    for (const match of harness.matchAll(/captureSelectedGatheringTask\(\s*\{[\s\S]*?label:\s*'([^']+)'[\s\S]*?\}\s*\)/g)) {
      emitted.add(match[1]);
    }
    // Issue 855: the interactive crafting-check roll prompt routes through
    // handleRollPromptIfPresent(page, '<label>'), which forwards `label` to screenshot()
    // as a variable — so the literal lives in the helper CALL, not in a screenshot() call.
    // Until this pattern was registered the label was invisible to this guard, so no
    // VIEW_RECIPES entry could reference the only frame that shows the prompt.
    for (const match of harness.matchAll(/handleRollPromptIfPresent\(\s*page\s*,\s*'([^']+)'/g)) {
      emitted.add(match[1]);
    }
    assert.ok(emitted.size > 0, 'expected to parse smoke labels from foundry-test-run.mjs');
    for (const recipe of VIEW_RECIPES) {
      for (const label of recipe.smokeLabels) {
        assert.ok(emitted.has(label), `${recipe.id} references smoke label '${label}' not emitted by the harness`);
      }
    }
  });

  it('keeps every matches entry resolving to a real repo path (issue 676)', () => {
    // NOTHING asserted this before, and the gap is silent-by-construction: a recipe
    // whose `matches` names a DELETED file simply matches nothing, forever, all green.
    // `manager-component-edit-difficulty` matched ONLY ComponentDifficultyInspector, so
    // deleting that inspector would have stranded its frame with no signal at all.
    //
    // Patterns are anchored `^…$` over repo-relative paths, so a purely literal one can
    // be recovered by stripping the anchors and unescaping. A pattern with a real
    // wildcard (a directory glob like `component/.+\.svelte`) is checked by walking the
    // repo for at least one match instead.
    const literalPathOf = (source) => {
      // BOTH anchors are required. An unanchored suffix pattern (`/\.css$/`, the
      // theme-or-global-ui catch-all) has no metacharacters left once escapes are
      // stripped, so anchor-agnostic parsing would "recover" it as the literal path
      // `.css` and then fail on a file that was never meant to exist.
      if (!source.startsWith('^') || !source.endsWith('$')) return null;
      const body = source.slice(1, -1);
      const withoutEscapes = body.replace(/\\[.*+?[\]{}()|/\\^$]/g, '');
      if (/[.*+?[\]{}()|]/.test(withoutEscapes)) return null;
      return body.replace(/\\(.)/g, '$1');
    };

    const walk = (dir) => {
      const out = [];
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) out.push(...walk(full));
        else out.push(full.split(sep).join('/'));
      }
      return out;
    };
    const repoFiles = [...walk('src'), ...walk('styles')];

    let checked = 0;
    for (const recipe of VIEW_RECIPES) {
      for (const pattern of recipe.matches || []) {
        checked += 1;
        const literal = literalPathOf(pattern.source);
        if (literal) {
          assert.ok(
            existsSync(literal),
            `${recipe.id} matches '${literal}', which does not exist — its frame is stranded`
          );
          continue;
        }
        assert.ok(
          repoFiles.some((file) => pattern.test(file)),
          `${recipe.id} pattern ${pattern} matches no file in the repo — its frame is stranded`
        );
      }
    }
    assert.ok(checked > 0, 'expected to check at least one matches pattern');
  });

  it('exempts a UI PR only when the maintainer label is present', () => {
    assert.equal(isExemptByLabel(['screenshots-exempt'], 'screenshots-exempt'), true);
    assert.equal(isExemptByLabel(['Screenshots-Exempt'], 'screenshots-exempt'), true);
    assert.equal(isExemptByLabel(['agent-created', 'triage'], 'screenshots-exempt'), false);
    assert.equal(isExemptByLabel([], 'screenshots-exempt'), false);
  });

  it('reads a label list file and treats a missing file as no labels', () => {
    const root = mkdtempSync(join(tmpdir(), 'fabricate-ui-labels-'));
    try {
      const file = join(root, 'labels.txt');
      writeFileSync(file, 'agent-created\nscreenshots-exempt\n');
      assert.deepEqual(readLabelList(file), ['agent-created', 'screenshots-exempt']);
      assert.deepEqual(readLabelList(join(root, 'missing.txt')), []);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('deletes only the PR-scoped S3 prefix via an injected list-and-delete seam', async () => {
    const config = { bucket: 'test-bucket', baseUrl: 'https://test-bucket.s3.eu-west-2.amazonaws.com', region: 'eu-west-2', prefix: 'pr-screenshots' };
    const calls = [];
    const listAndDelete = async ({ bucket, prefix }) => { calls.push({ bucket, prefix }); return { deleted: 2 }; };

    const result = await deletePrScreenshotsFromS3({ prNumber: 251, config, listAndDelete });
    assert.deepEqual(result, { deleted: 2 });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].bucket, 'test-bucket');
    assert.equal(calls[0].prefix, 'pr-screenshots/251/'); // trailing slash → no cross-PR deletion

    // No bucket configured → no-op (never calls the deleter).
    const noop = await deletePrScreenshotsFromS3({ prNumber: 251, config: { bucket: '', prefix: 'pr-screenshots' }, listAndDelete });
    assert.equal(noop.skipped, true);

    // Invalid PR number throws before any deletion.
    await assert.rejects(() => deletePrScreenshotsFromS3({ prNumber: '../../251', config, listAndDelete }), /Invalid PR number/);
  });

  it('builds attachment markdown that satisfies the check once placed in the managed block', () => {
    const md = buildScreenshotMarkdown(251, [
      { label: 'Manager gathering environments', url: 'https://github.com/user-attachments/assets/abcabcab-abcd-abcd-abcd-abcabcabcabc' },
    ]);
    assert.match(md, /!\[pr-251 Manager gathering environments\]/);
    // Bare image markdown alone is not evidence, but the managed block wraps it
    // beneath a `## Screenshots` heading, which satisfies the check.
    assert.equal(hasScreenshotEvidence(md), false);
    assert.equal(hasScreenshotEvidence(upsertScreenshotsBlock('Body.', md)), true);
  });

  it('scopes changed files to the exact smoke-label target set for the capture profile', () => {
    // The `targets` command / `screenshots` profile consume this — it must equal the
    // same mapping collect/publish use, never the full catalogue.
    assert.deepEqual(smokeLabelsForChangedFiles(['styles/theme.css']), [
      'manager-default-selection',
      'manager-components-normal',
      'manager-gathering-task-editor-normal',
      'player-crafting-simple',
      'player-inventory',
      'interactables-manager-list',
    ]);
    assert.deepEqual(smokeLabelsForChangedFiles(['docs/readme.md']), []);
  });

  it('publish threads a head SHA into revision-addressed S3 keys', async () => {
    const root = mkdtempSync(join(tmpdir(), 'fabricate-ui-publish-sha-'));
    try {
      const dir = join(root, 'tmp/pr-screenshots/251');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'manager-tools.png'), 'a');
      const puts = [];
      const runGh = (args) => {
        if (args[0] === 'auth') return { status: 0, stdout: 'ok', stderr: '' };
        if (args[0] === 'pr' && args[1] === 'view') return { status: 0, stdout: 'Body.', stderr: '' };
        if (args[0] === 'pr' && args[1] === 'edit') return { status: 0, stdout: '', stderr: '' };
        return { status: 1, stdout: '', stderr: `unexpected ${args.join(' ')}` };
      };
      const result = await publishScreenshotEvidence({
        prNumber: 251,
        headSha: 'deadbee',
        root,
        runGh,
        putObject: async (o) => puts.push(o),
        config: { bucket: 'b', baseUrl: 'https://b.example', prefix: 'pr-screenshots' },
      });
      assert.equal(result.skipped, false);
      assert.equal(puts[0].key, 'pr-screenshots/251/deadbee/manager-tools.png');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('sanitizeLabel is a no-op on every current view label (no over-escaping)', () => {
    for (const view of VIEW_RECIPES) {
      assert.equal(sanitizeLabel(view.label), view.label, `${view.id} label should pass through unchanged`);
    }
  });

  it('upserts the screenshot block idempotently', () => {
    const md = '![pr-1 A](https://github.com/user-attachments/assets/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa)';
    const first = upsertScreenshotsBlock('## Description\n\nBody text.', md);
    assert.match(first, /fabricate:screenshots:start/);
    assert.match(first, /Body text\./);

    const md2 = '![pr-1 B](https://github.com/user-attachments/assets/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb)';
    const second = upsertScreenshotsBlock(first, md2);
    assert.equal((second.match(/fabricate:screenshots:start/g) || []).length, 1);
    assert.match(second, /assets\/bbbbbbbb/);
    assert.doesNotMatch(second, /assets\/aaaaaaaa/);
    assert.match(second, /Body text\./);
  });

  const S3_CONFIG = {
    bucket: 'test-bucket',
    baseUrl: 'https://test-bucket.s3.eu-west-2.amazonaws.com',
    region: 'eu-west-2',
    prefix: 'pr-screenshots',
  };

  it('publishes collected screenshots: uploads to S3 and patches the PR body once', async () => {
    const root = mkdtempSync(join(tmpdir(), 'fabricate-ui-publish-'));
    try {
      const dir = join(root, 'tmp/pr-screenshots/251');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'manager-environments.png'), 'a');
      writeFileSync(join(dir, 'manager-tools.png'), 'b');

      const puts = [];
      const putObject = async (obj) => { puts.push(obj); };
      const calls = [];
      const runGh = (args) => {
        calls.push(args);
        if (args[0] === 'auth') return { status: 0, stdout: 'ok', stderr: '' };
        if (args[0] === 'pr' && args[1] === 'view') return { status: 0, stdout: '## Description\n\nOriginal.', stderr: '' };
        if (args[0] === 'pr' && args[1] === 'edit') return { status: 0, stdout: '', stderr: '' };
        return { status: 1, stdout: '', stderr: `unexpected ${args.join(' ')}` };
      };

      const result = await publishScreenshotEvidence({ prNumber: 251, root, runGh, putObject, config: S3_CONFIG });
      assert.equal(result.skipped, false);
      assert.equal(result.uploaded.length, 2);
      assert.equal(puts.length, 2);
      assert.deepEqual(puts.map(p => p.key).sort(), [
        'pr-screenshots/251/manager-environments.png',
        'pr-screenshots/251/manager-tools.png',
      ]);
      assert.equal(puts[0].bucket, 'test-bucket');
      assert.equal(puts.every(p => p.contentType === 'image/png'), true);

      const editCalls = calls.filter(args => args[0] === 'pr' && args[1] === 'edit');
      assert.equal(editCalls.length, 1);
      const bodyFile = editCalls[0][editCalls[0].indexOf('--body-file') + 1];
      const written = readFileSync(bodyFile, 'utf8');
      assert.match(written, /Original\./);
      assert.match(written, /##\s+Screenshots/);
      assert.match(written, /!\[pr-251 Manager gathering environments\]\(https:\/\/test-bucket\.s3\.eu-west-2\.amazonaws\.com\/pr-screenshots\/251\/manager-environments\.png\)/);
      assert.match(written, /!\[pr-251 manager-tools\]/);
      assert.equal((written.match(/fabricate:screenshots:start/g) || []).length, 1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('publish throws clearly when gh is unauthenticated', async () => {
    const root = mkdtempSync(join(tmpdir(), 'fabricate-ui-publish-'));
    try {
      const dir = join(root, 'tmp/pr-screenshots/251');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'manager-tools.png'), 'b');

      await assert.rejects(() => publishScreenshotEvidence({
        prNumber: 251,
        root,
        config: S3_CONFIG,
        putObject: async () => {},
        runGh: (args) => (args[0] === 'auth'
          ? { status: 1, stdout: '', stderr: 'not logged in' }
          : { status: 0, stdout: '', stderr: '' }),
      }), /not authenticated/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('resolves the first VERIFIABLE default base, skipping candidates git cannot verify', () => {
    // origin/main fails rev-parse but origin/HEAD verifies → returns origin/HEAD. This
    // kills a "return candidates[0] regardless of verify" mutant, which would wrongly
    // return origin/main.
    assert.equal(resolveDefaultBase({ runGit: gitVerifyStub(['origin/HEAD', 'main']) }), 'origin/HEAD');

    // origin/main and origin/HEAD both fail → falls through to local main.
    assert.equal(resolveDefaultBase({ runGit: gitVerifyStub(['main']) }), 'main');

    // The happy path still prefers origin/main when it verifies.
    assert.equal(resolveDefaultBase({ runGit: gitVerifyStub(['origin/main', 'origin/HEAD', 'main']) }), 'origin/main');
  });

  it('returns null when no default base candidate can be verified', () => {
    const stub = gitVerifyStub([]);
    assert.equal(resolveDefaultBase({ runGit: stub }), null);
    // It actually probed every candidate rather than short-circuiting.
    assert.deepEqual(stub.calls, ['origin/main', 'origin/HEAD', 'main']);
  });

  it('throws a base-resolution diagnostic that names the tried candidates and instructs --base', () => {
    // The load-bearing distinction from a real "no UI changes" answer: an UNRESOLVABLE
    // base throws a clear, actionable error rather than returning [].
    let message = '';
    try {
      loadChangedFiles({}, { resolveBase: () => null });
      assert.fail('expected loadChangedFiles to throw when no base resolves');
    } catch (error) {
      message = error.message;
    }
    assert.match(message, /origin\/main/);
    assert.match(message, /origin\/HEAD/);
    assert.match(message, /\bmain\b/);
    assert.match(message, /--base <ref>/);
  });

  it('honours changed-files > base > default-base precedence via injected spies', () => {
    const root = mkdtempSync(join(tmpdir(), 'fabricate-ui-changed-'));
    try {
      const changedFilesPath = join(root, 'changed-files.txt');
      writeFileSync(changedFilesPath, 'src/ui/svelte/apps/manager/ToolsBrowserView.svelte\n');

      // --changed-files wins: neither seam is consulted.
      let resolveCalls = 0;
      let readCalls = 0;
      const resolveBase = () => { resolveCalls += 1; return 'origin/main'; };
      const readChangedFiles = (base) => { readCalls += 1; return [`from:${base}`]; };

      const both = loadChangedFiles(
        { changedFiles: changedFilesPath, base: 'origin/dev' },
        { resolveBase, readChangedFiles },
      );
      assert.deepEqual(both, ['src/ui/svelte/apps/manager/ToolsBrowserView.svelte']);
      assert.equal(resolveCalls, 0);
      assert.equal(readCalls, 0);

      // Explicit --base: readChangedFiles gets that base; resolveBase is NOT called.
      const explicit = loadChangedFiles({ base: 'origin/dev' }, { resolveBase, readChangedFiles });
      assert.deepEqual(explicit, ['from:origin/dev']);
      assert.equal(resolveCalls, 0);
      assert.equal(readCalls, 1);

      // Neither flag: resolveBase decides the base, then readChangedFiles diffs it.
      const defaulted = loadChangedFiles({}, { resolveBase, readChangedFiles });
      assert.deepEqual(defaulted, ['from:origin/main']);
      assert.equal(resolveCalls, 1);
      assert.equal(readCalls, 2);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('does NOT throw when a resolved base legitimately yields no UI files (conflation guard)', async () => {
    // The distinction the issue exists to protect: a resolved base whose diff genuinely
    // contains no UI files is a REAL "no UI changes" answer — loadChangedFiles returns the
    // non-UI list and never throws, and the plan path prints "No UI changes detected."
    // This must stay distinct from the base-resolution failure that DOES throw.
    const resolveBase = () => 'origin/main';
    const readChangedFiles = () => ['docs/readme.md', 'openspec/specs/foo/spec.md'];

    const files = loadChangedFiles({}, { resolveBase, readChangedFiles });
    assert.deepEqual(files, ['docs/readme.md', 'openspec/specs/foo/spec.md']);
    assert.equal(hasUiChanges(files), false);
    assert.deepEqual(mapChangedFilesToViews(files), []);

    const lines = await captureLog(() => main(['plan'], { resolveBase, readChangedFiles }));
    assert.deepEqual(lines, ['No UI changes detected.']);
  });

  it('lists required views on the plan path when the resolved-base diff has UI files', async () => {
    const resolveBase = () => 'origin/main';
    const readChangedFiles = () => ['src/ui/svelte/apps/manager/ToolsBrowserView.svelte'];
    const lines = await captureLog(() => main(['plan'], { resolveBase, readChangedFiles }));
    assert.match(lines[0], /UI smoke screenshot artifacts required:/);
    assert.ok(lines.some(line => /manager-tool-parity-01-library-1280x720/.test(line)));
  });

  it('never resolves a default base for publish or clean (command scoping)', async () => {
    // publish derives files from tmp/pr-screenshots/<pr>/ and clean just removes a local
    // dir — neither must spawn git or trip base resolution / its throw.
    let resolveCalls = 0;
    const resolveBase = () => { resolveCalls += 1; return 'origin/main'; };

    const root = mkdtempSync(join(tmpdir(), 'fabricate-ui-scope-'));
    try {
      // clean: harmless local rm of a PR-scoped tmp dir under the real repo (a high PR
      // number with no such dir), asserting only that the resolver is untouched.
      await captureLog(() => main(['clean', '--pr', '999999'], { resolveBase }));
      assert.equal(resolveCalls, 0);

      // publish: an empty output dir → skipped before any PR read; gh/S3 seams stubbed so
      // no real network/CLI, and the resolver still must not be called.
      const emptyDir = join(root, 'empty');
      mkdirSync(emptyDir, { recursive: true });
      const runGh = (args) => (args[0] === 'auth'
        ? { status: 0, stdout: 'ok', stderr: '' }
        : { status: 1, stdout: '', stderr: 'should not be reached' });
      await captureLog(() => main(
        ['publish', '--pr', '251', '--output-dir', emptyDir],
        { resolveBase, runGh, putObject: async () => {}, config: S3_CONFIG },
      ));
      assert.equal(resolveCalls, 0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('publish is a no-op when there are no collected screenshots', async () => {
    const root = mkdtempSync(join(tmpdir(), 'fabricate-ui-publish-'));
    try {
      const puts = [];
      const calls = [];
      const runGh = (args) => {
        calls.push(args);
        if (args[0] === 'auth') return { status: 0, stdout: 'ok', stderr: '' };
        return { status: 1, stdout: '', stderr: 'should not be called' };
      };
      const result = await publishScreenshotEvidence({
        prNumber: 251, root, runGh, config: S3_CONFIG, putObject: async (o) => { puts.push(o); },
      });
      assert.equal(result.skipped, true);
      assert.equal(puts.length, 0);
      assert.equal(calls.filter(args => args[0] === 'pr').length, 0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
