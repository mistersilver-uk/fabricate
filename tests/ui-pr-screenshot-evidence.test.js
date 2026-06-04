import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
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
    assert.ok(views[0].smokeLabels.includes('manager-environments-browse-normal'));
    assert.ok(views[0].smokeLabels.includes('manager-environment-edit-placeholder'));
  });

  it('maps player gathering app files to the dedicated player-gathering recipe', () => {
    const views = mapChangedFilesToViews([
      'src/ui/svelte/apps/gathering/GatheringView.svelte',
      'src/ui/svelte/apps/gathering/GatheringDetail.svelte',
    ]);

    assert.deepEqual(views.map(view => view.id), ['player-gathering']);
    assert.deepEqual(views[0].smokeLabels, ['player-gathering-environments']);
  });

  it('keeps every screenshot recipe backed by real smoke labels', () => {
    for (const recipe of VIEW_RECIPES) {
      assert.ok(Array.isArray(recipe.smokeLabels), `${recipe.id} should declare smokeLabels`);
      assert.ok(recipe.smokeLabels.length > 0, `${recipe.id} should map to at least one smoke artifact`);
      assert.equal('focusedScreenshots' in recipe, false, `${recipe.id} should not use synthetic focused screenshots`);
    }
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

  it('accepts GitHub attachment images and automation fallback artifacts', () => {
    assert.equal(hasScreenshotEvidence('Screenshot artifacts were uploaded as `codex-ui-evidence-42-99`.'), true);
    assert.equal(hasScreenshotEvidence('![Environment](https://github.com/user-attachments/assets/123e4567-e89b-12d3-a456-426614174000)'), true);
    assert.equal(hasScreenshotEvidence('See `test-results/screenshot-01-manager-components-normal.png`.'), true);
  });

  it('no longer accepts the self-serve SCREENSHOTS_NEEDED text bypass', () => {
    assert.equal(hasScreenshotEvidence('SCREENSHOTS_NEEDED: Playwright could not launch for Manager tools.'), false);
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
    assert.match(failure, /npm run test:foundry/);
    assert.match(failure, /npm run screenshots:ui:publish -- --pr 321/);
    assert.match(failure, /to S3/);
    assert.match(failure, /!\[pr-321 \.\.\.\]/);
    assert.match(failure, /screenshots-exempt/);
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

  it('detects i18n language changes and maps them to global UI', () => {
    assert.equal(hasUiChanges(['lang/en.json']), true);
    assert.deepEqual(mapChangedFilesToViews(['lang/en.json']).map(view => view.id), ['theme-or-global-ui']);
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
    assert.ok(emitted.size > 0, 'expected to parse smoke labels from foundry-test-run.mjs');
    for (const recipe of VIEW_RECIPES) {
      for (const label of recipe.smokeLabels) {
        assert.ok(emitted.has(label), `${recipe.id} references smoke label '${label}' not emitted by the harness`);
      }
    }
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

  it('does not let a longer PR number satisfy a shorter PR gate (prefix collision)', () => {
    // PR 25 must not be satisfied by evidence scoped to PR 251.
    assert.equal(
      hasScreenshotEvidence('See `test-results/pr-251/screenshot-manager.png`.', { prNumber: 25 }),
      false,
    );
    assert.equal(
      hasScreenshotEvidence('Artifact `codex-ui-evidence-251-abc`.', { prNumber: 25 }),
      false,
    );
    // The exact PR still passes.
    assert.equal(
      hasScreenshotEvidence('See `test-results/pr-25/screenshot-manager.png`.', { prNumber: 25 }),
      true,
    );
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

  it('accepts a PR-scoped S3 object URL as evidence', () => {
    assert.equal(
      hasScreenshotEvidence(
        '![pr-251 tools](https://fabricate-modules-088545273404-eu-west-2-an.s3.eu-west-2.amazonaws.com/pr-screenshots/251/manager-tools.png)',
        { prNumber: 251 },
      ),
      true,
    );
    // An S3 object scoped to a different PR must not satisfy PR 251.
    assert.equal(
      hasScreenshotEvidence(
        '![tools](https://fabricate-modules-088545273404-eu-west-2-an.s3.eu-west-2.amazonaws.com/pr-screenshots/999/manager-tools.png)',
        { prNumber: 251 },
      ),
      false,
    );
  });

  it('builds pr-scoped attachment markdown that satisfies the scoped check', () => {
    const md = buildScreenshotMarkdown(251, [
      { label: 'Manager gathering environments', url: 'https://github.com/user-attachments/assets/abcabcab-abcd-abcd-abcd-abcabcabcabc' },
    ]);
    assert.match(md, /!\[pr-251 Manager gathering environments\]/);
    assert.equal(hasScreenshotEvidence(md, { prNumber: 251 }), true);
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
