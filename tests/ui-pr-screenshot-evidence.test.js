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

describe('UI PR screenshot evidence', () => {
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

    const rootIds = mapChangedFilesToViews([
      'src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte',
    ]).map(view => view.id);
    assert.ok(rootIds.includes('manager-system-edit-dirty'));
    assert.ok(!rootIds.includes('manager-system-edit'));
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

  it('maps a recipe editor file to all thirteen recipe-edit frame recipes', () => {
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

    // The top-level editor view and any recipe sub-component all republish all thirteen
    // frames. Every editor tab lives under `recipe/` so the glob covers it; the BROWSER
    // inspector deliberately lives under `recipes/`.
    for (const file of [
      'src/ui/svelte/apps/manager/RecipeEditView.svelte',
      'src/ui/svelte/apps/manager/recipe/RecipeAccessTab.svelte',
      'src/ui/svelte/apps/manager/recipe/RecipeBooksScrollsTab.svelte',
      'src/ui/svelte/apps/manager/recipe/RecipeOverviewTab.svelte',
    ]) {
      const views = mapChangedFilesToViews([file]);
      assert.deepEqual(views.map(view => view.id), expected, `${file} should map to all thirteen recipe-edit frames`);
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

  it('collects the thirteen recipe-edit frames into thirteen separate files', () => {
    withScreenshotFixtures(
      {
        'screenshot-01-manager-recipe-edit-normal.png': 'normal',
        'screenshot-02-manager-recipe-edit-ingredients.png': 'ingredients',
        // Issue 684: the `-cost` label ENDS in `-cost.png`, so `matchesSmokeLabel`
        // (anchored `…<label>\.png$`) keeps it distinct from the `-ingredients` frame
        // even though `manager-recipe-edit-ingredients` is a string prefix of it.
        'screenshot-03-manager-recipe-edit-ingredients-cost.png': 'ingredients-cost',
        'screenshot-04-manager-recipe-edit-validation.png': 'validation',
        'screenshot-05-manager-recipe-edit-multistep.png': 'multistep',
        'screenshot-06-manager-recipe-edit-results.png': 'results',
        'screenshot-07-manager-recipe-edit-results-multistep.png': 'results-multistep',
        'screenshot-08-manager-recipe-edit-collapsed.png': 'collapsed',
        'screenshot-09-manager-recipe-edit-results-progressive.png': 'results-progressive',
        'screenshot-10-manager-recipe-edit-results-alchemy.png': 'results-alchemy',
        'screenshot-11-manager-recipe-edit-tools.png': 'tools',
        'screenshot-12-manager-recipe-edit-access-rail.png': 'access-rail',
        'screenshot-13-manager-recipe-edit-books-scrolls.png': 'books-scrolls',
      },
      (root) => {
        const result = collectScreenshotEvidence({
          changedFiles: ['src/ui/svelte/apps/manager/RecipeEditView.svelte'],
          prNumber: 654,
          root,
        });
        assert.equal(result.copied.length, 13);
        const byName = Object.fromEntries(
          result.copied.map(item => [
            item.destination.replaceAll('\\', '/').split('/').pop(),
            readFileSync(item.destination, 'utf8'),
          ]),
        );
        assert.deepEqual(byName, {
          'manager-recipe-edit-normal.png': 'normal',
          'manager-recipe-edit-ingredients.png': 'ingredients',
          'manager-recipe-edit-ingredients-cost.png': 'ingredients-cost',
          'manager-recipe-edit-validation.png': 'validation',
          'manager-recipe-edit-multistep.png': 'multistep',
          'manager-recipe-edit-results.png': 'results',
          'manager-recipe-edit-results-multistep.png': 'results-multistep',
          'manager-recipe-edit-collapsed.png': 'collapsed',
          'manager-recipe-edit-results-progressive.png': 'results-progressive',
          'manager-recipe-edit-results-alchemy.png': 'results-alchemy',
          'manager-recipe-edit-tools.png': 'tools',
          'manager-recipe-edit-access-rail.png': 'access-rail',
          'manager-recipe-edit-books-scrolls.png': 'books-scrolls',
        });
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

    assert.match(failure, /Manager gathering tools/);
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
    withScreenshotFixtures(
      {
        'screenshot-09-manager-environments-browse-normal-retry.png': 'wrong',
        'screenshot-08-manager-environments-browse-normal.png': 'png',
        'screenshot-07-manager-environments-browse-stacked.png': 'stacked',
      },
      (root) => {
        const result = collectScreenshotEvidence({
          changedFiles: ['src/ui/svelte/apps/manager/EnvironmentsBrowserView.svelte'],
          prNumber: 456,
          root,
        });
        assert.equal(result.copied.length, 1);
        const relativeDestination = result.copied[0].destination.replace(root, '').replaceAll('\\', '/');
        assert.equal(relativeDestination, '/tmp/pr-screenshots/456/manager-environments.png');
        assert.equal(readFileSync(result.copied[0].destination, 'utf8'), 'stacked');
      },
    );
  });

  it('reports missing collection screenshots and supports allowMissing', () => {
    withScreenshotFixtures({}, (root) => {
      assert.throws(() => collectScreenshotEvidence({
        changedFiles: ['src/ui/svelte/apps/manager/ToolsBrowserView.svelte'],
        prNumber: 456,
        root,
      }), /manager-tools/);

      const result = collectScreenshotEvidence({
        changedFiles: ['src/ui/svelte/apps/manager/ToolsBrowserView.svelte'],
        prNumber: 456,
        root,
        allowMissing: true,
      });
      assert.deepEqual(result.missing.map(view => view.id), ['manager-tools']);
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
    assert.deepEqual(ids(['lang/en.json', view]), ['manager-tools']);

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
      'manager-environments-browse-normal',
      'manager-gathering-task-editor-normal',
      'manager-gathering-events-normal',
      'manager-essences-normal',
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
      assert.match(written, /!\[pr-251 Manager gathering tools\]/);
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
    assert.ok(lines.some(line => /manager-tools/.test(line)));
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
