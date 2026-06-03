import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

import {
  cleanPrScreenshotEvidence,
  collectScreenshotEvidence,
  explainScreenshotEvidenceFailure,
  focusedViewIdsFor,
  buildAssetData,
  hasScreenshotEvidence,
  hasUiChanges,
  mapChangedFilesToViews,
  renderFocusedScreenshotHtml,
  validateChangedFilesForCheck,
  validateAssetManifest,
} from '../scripts/ui-pr-screenshot-evidence.mjs';

describe('UI PR screenshot evidence', () => {
  it('detects UI changes with the same path rules as CI', () => {
    assert.equal(hasUiChanges(['src/ui/svelte/apps/FabricateAppRoot.svelte']), true);
    assert.equal(hasUiChanges(['styles/fabricate.css']), true);
    assert.equal(hasUiChanges(['docs/agents/ui-pr-screenshots.md']), false);
  });

  it('maps changed manager files to relevant screenshot recipes', () => {
    const views = mapChangedFilesToViews([
      'src\\ui\\svelte\\apps\\manager\\EnvironmentEditView.svelte',
      'src/ui/svelte/apps/manager/environment/EnvironmentEditorTabs.svelte',
    ]);

    assert.deepEqual(views.map(view => view.id), ['manager-environments']);
    assert.ok(views[0].focusedScreenshots.includes('manager-environments'));
    assert.ok(views[0].focusedScreenshots.includes('manager-environment-editor'));
  });

  it('rejects committed PR screenshot asset markdown and unrelated image markdown', () => {
    assert.equal(
      hasScreenshotEvidence(
        '![Environment editor](https://github.com/example/repo/blob/branch/docs/assets/pr-screenshots/pr-123/manager-environments.png?raw=1)',
        { prNumber: 123 },
      ),
      false,
    );
    assert.equal(hasScreenshotEvidence('![Unrelated](https://example.com/mock.png)', { prNumber: 123 }), false);
  });

  it('accepts GitHub attachment images, automation fallback artifacts, and specific handoff markers', () => {
    assert.equal(hasScreenshotEvidence('Screenshot artifacts were uploaded as `codex-ui-evidence-42-99`.'), true);
    assert.equal(hasScreenshotEvidence('![Environment](https://github.com/user-attachments/assets/123e4567-e89b-12d3-a456-426614174000)'), true);
    assert.equal(hasScreenshotEvidence('See `test-results/screenshot-01-manager-components-normal.png`.'), true);
    assert.equal(hasScreenshotEvidence('SCREENSHOTS_NEEDED: Playwright could not launch for Manager tools.'), true);
    assert.equal(hasScreenshotEvidence('SCREENSHOTS_NEEDED:   '), false);
  });

  it('scopes uploaded screenshot evidence to the current PR when prNumber is supplied', () => {
    assert.equal(hasScreenshotEvidence('Screenshot artifacts were uploaded as `codex-ui-evidence-123-abc`.', { prNumber: 123 }), true);
    assert.equal(hasScreenshotEvidence('Screenshot artifacts were uploaded as `codex-ui-evidence-999-abc`.', { prNumber: 123 }), false);
    assert.equal(hasScreenshotEvidence('Screenshot artifacts were uploaded as `codex-ui-evidence-1234`.', { prNumber: 123 }), false);
    assert.equal(
      hasScreenshotEvidence(
        '![pr-123 manager environment](https://github.com/user-attachments/assets/123e4567-e89b-12d3-a456-426614174000)',
        { prNumber: 123 },
      ),
      true,
    );
    assert.equal(
      hasScreenshotEvidence(
        '![manager environment](https://github.com/user-attachments/assets/123e4567-e89b-12d3-a456-426614174000)',
        { prNumber: 123 },
      ),
      false,
    );
    assert.equal(hasScreenshotEvidence('See `test-results/pr-123/screenshot-manager.png`.', { prNumber: 123 }), true);
    assert.equal(hasScreenshotEvidence('See `test-results/pr-999/screenshot-manager.png`.', { prNumber: 123 }), false);
  });

  it('rejects invalid PR numbers before building evidence regexes', () => {
    assert.throws(() => hasScreenshotEvidence('codex-ui-evidence-123', { prNumber: '../123' }), /Invalid PR number/);
  });

  it('explains missing UI screenshot evidence with mapped changed views', () => {
    const failure = explainScreenshotEvidenceFailure(
      ['src/ui/svelte/apps/manager/ToolsBrowserView.svelte'],
      '![Unrelated](https://example.com/mock.png)',
      { prNumber: 321 },
    );

    assert.match(failure, /Manager gathering tools/);
    assert.match(failure, /tmp\/pr-screenshots\/321/);
    assert.match(failure, /GitHub's native attachment flow/);
    assert.match(failure, /!\[pr-321 \.\.\.\]\(https:\/\/github\.com\/user-attachments\/assets\/\.\.\.\)/);
    assert.match(failure, /clean the tmp directory/);
  });

  it('treats empty changed-file input as an invalid check-mode state', () => {
    assert.match(validateChangedFilesForCheck([], { required: true }), /Changed-files input is empty/);
    assert.equal(validateChangedFilesForCheck(['docs/readme.md'], { required: true }), '');
    assert.equal(validateChangedFilesForCheck([], { required: false }), '');
  });

  it('keeps smoke screenshot collection available as an explicit fallback', () => {
    const root = mkdtempSync(join(tmpdir(), 'fabricate-ui-screenshots-'));
    try {
      const sourceDir = join(root, 'test-results');
      mkdirSync(sourceDir, { recursive: true });
      writeFileSync(join(sourceDir, 'screenshot-09-manager-environments-browse-normal-retry.png'), 'wrong');
      writeFileSync(join(sourceDir, 'screenshot-08-manager-environments-browse-normal.png'), 'png');
      writeFileSync(join(sourceDir, 'screenshot-07-manager-environments-browse-stacked.png'), 'stacked');

      const result = collectScreenshotEvidence({
        changedFiles: ['src/ui/svelte/apps/manager/EnvironmentsBrowserView.svelte'],
        prNumber: 456,
        root,
      });

      assert.equal(result.copied.length, 1);
      const relativeDestination = result.copied[0].destination.replace(root, '').replace(/\\/g, '/');
      assert.equal(relativeDestination, '/tmp/pr-screenshots/456/manager-environments.png');
      assert.equal(readFileSync(result.copied[0].destination, 'utf8'), 'stacked');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('reports missing collection screenshots and supports allowMissing', () => {
    const root = mkdtempSync(join(tmpdir(), 'fabricate-ui-screenshots-'));
    try {
      mkdirSync(join(root, 'test-results'), { recursive: true });

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
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('validates the screenshot asset manifest and all referenced files', async () => {
    const assets = await validateAssetManifest('tests/fixtures/ui-assets/manifest.js', { root: resolve('.') });

    assert.ok(assets.length >= 20);
    assert.ok(assets.some(([key]) => key === 'gathering.forest'));
    assert.ok(assets.some(([key]) => key === 'fallbacks.placeholderEnvironment'));
    assert.ok(assets.some(([, assetPath]) => assetPath === 'tests/fixtures/ui-assets/copied/hazards/hostile.webp'));
    assert.ok(assets.every(([, assetPath]) => assetPath.startsWith('tests/fixtures/ui-assets/copied/')));
    assert.ok(assets.every(([, assetPath]) => !assetPath.endsWith('.svg')));
  });

  it('renders HTML for every reachable focused screenshot view id', () => {
    const asset = 'data:image/webp;base64,AA==';
    const fakeAssets = {
      components: { ore: asset, hardwood: asset, hide: asset, gemstone: asset, essence: asset, potion: asset, weapon: asset, armor: asset, tool: asset },
      gathering: { forest: asset, mine: asset, ruins: asset, battlefield: asset, planar: asset, dragonLair: asset },
      hazards: { weather: asset, terrain: asset, hostile: asset, surge: asset },
      fallbacks: { missingItem: asset },
    };

    for (const viewId of focusedViewIdsFor({ requestedViews: 'all' })) {
      const html = renderFocusedScreenshotHtml(viewId, fakeAssets);
      assert.match(html, /focused-screenshot-frame/);
      assert.equal(html.includes('undefined'), false);
    }
  });

  it('builds data URIs for every manifest asset used by focused screenshots', async () => {
    const imported = await import('../tests/fixtures/ui-assets/manifest.js');
    const assets = buildAssetData(imported.UI_SCREENSHOT_ASSETS, resolve('.'));

    assert.match(assets.gathering.battlefield, /^data:image\/webp;base64,/);
    assert.match(assets.gathering.planar, /^data:image\/webp;base64,/);
    assert.match(assets.hazards.hostile, /^data:image\/webp;base64,/);
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
});
