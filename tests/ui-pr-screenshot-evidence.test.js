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
  mapChangedFilesToViews,
  publishScreenshotEvidence,
  readLabelList,
  upsertScreenshotsBlock,
  VIEW_RECIPES,
  validateChangedFilesForCheck,
} from '../scripts/ui-pr-screenshot-evidence.mjs';

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

  it('maps a recipe editor file to all eleven recipe-edit frame recipes', () => {
    const expected = [
      'manager-recipe-edit-normal',
      'manager-recipe-edit-ingredients',
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
    ];

    // The top-level editor view and any recipe sub-component all republish all eleven
    // frames. Every editor tab lives under `recipe/` so the glob covers it; the BROWSER
    // inspector deliberately lives under `recipes/`.
    for (const file of [
      'src/ui/svelte/apps/manager/RecipeEditView.svelte',
      'src/ui/svelte/apps/manager/recipe/RecipeAccessTab.svelte',
      'src/ui/svelte/apps/manager/recipe/RecipeBooksScrollsTab.svelte',
      'src/ui/svelte/apps/manager/recipe/RecipeOverviewTab.svelte',
    ]) {
      const views = mapChangedFilesToViews([file]);
      assert.deepEqual(views.map(view => view.id), expected, `${file} should map to all eleven recipe-edit frames`);
    }

    // Each frame carries exactly its own single smoke label.
    const views = mapChangedFilesToViews(['src/ui/svelte/apps/manager/RecipeEditView.svelte']);
    assert.deepEqual(views.map(view => view.smokeLabels), [
      ['manager-recipe-edit-normal'],
      ['manager-recipe-edit-ingredients'],
      ['manager-recipe-edit-validation'],
      ['manager-recipe-edit-multistep'],
      ['manager-recipe-edit-results'],
      ['manager-recipe-edit-results-multistep'],
      ['manager-recipe-edit-collapsed'],
      ['manager-recipe-edit-results-progressive'],
      ['manager-recipe-edit-results-alchemy'],
      ['manager-recipe-edit-tools'],
      ['manager-recipe-edit-access-rail'],
    ]);
  });

  it('collects the eleven recipe-edit frames into eleven separate files', () => {
    withScreenshotFixtures(
      {
        'screenshot-01-manager-recipe-edit-normal.png': 'normal',
        'screenshot-02-manager-recipe-edit-ingredients.png': 'ingredients',
        'screenshot-03-manager-recipe-edit-validation.png': 'validation',
        'screenshot-04-manager-recipe-edit-multistep.png': 'multistep',
        'screenshot-05-manager-recipe-edit-results.png': 'results',
        'screenshot-06-manager-recipe-edit-results-multistep.png': 'results-multistep',
        'screenshot-07-manager-recipe-edit-collapsed.png': 'collapsed',
        'screenshot-08-manager-recipe-edit-results-progressive.png': 'results-progressive',
        'screenshot-09-manager-recipe-edit-results-alchemy.png': 'results-alchemy',
        'screenshot-10-manager-recipe-edit-tools.png': 'tools',
        'screenshot-11-manager-recipe-edit-access-rail.png': 'access-rail',
      },
      (root) => {
        const result = collectScreenshotEvidence({
          changedFiles: ['src/ui/svelte/apps/manager/RecipeEditView.svelte'],
          prNumber: 654,
          root,
        });
        assert.equal(result.copied.length, 11);
        const byName = Object.fromEntries(
          result.copied.map(item => [
            item.destination.replaceAll('\\', '/').split('/').pop(),
            readFileSync(item.destination, 'utf8'),
          ]),
        );
        assert.deepEqual(byName, {
          'manager-recipe-edit-normal.png': 'normal',
          'manager-recipe-edit-ingredients.png': 'ingredients',
          'manager-recipe-edit-validation.png': 'validation',
          'manager-recipe-edit-multistep.png': 'multistep',
          'manager-recipe-edit-results.png': 'results',
          'manager-recipe-edit-results-multistep.png': 'results-multistep',
          'manager-recipe-edit-collapsed.png': 'collapsed',
          'manager-recipe-edit-results-progressive.png': 'results-progressive',
          'manager-recipe-edit-results-alchemy.png': 'results-alchemy',
          'manager-recipe-edit-tools.png': 'tools',
          'manager-recipe-edit-access-rail.png': 'access-rail',
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
    const logicOnly = 'src/ui/svelte/stores/adminStore.js';
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
