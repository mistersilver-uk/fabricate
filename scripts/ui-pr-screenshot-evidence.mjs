#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);

// Default human-only label that exempts a UI PR from the screenshot requirement.
const DEFAULT_EXEMPT_LABEL = 'screenshots-exempt';

// Stable delimiters for the managed screenshot block in the PR body. `publish`
// replaces everything between these markers so re-runs update in place instead
// of appending duplicate blocks.
const SCREENSHOTS_BLOCK_START = '<!-- fabricate:screenshots:start -->';
const SCREENSHOTS_BLOCK_END = '<!-- fabricate:screenshots:end -->';

export const VIEW_RECIPES = Object.freeze([
  {
    id: 'manager-systems',
    label: 'Manager systems browser',
    smokeLabels: ['manager-default-selection', 'manager-selected-normal', 'manager-selected-stacked'],
    matches: [/^src\/ui\/svelte\/apps\/manager\/SystemsBrowserView\.svelte$/, /^src\/ui\/svelte\/apps\/manager\/CraftingSystemManagerRoot\.svelte$/],
  },
  {
    id: 'manager-system-edit',
    label: 'Manager system settings',
    smokeLabels: ['manager-system-edit-normal', 'manager-system-edit-narrow'],
    matches: [/^src\/ui\/svelte\/apps\/manager\/SystemEditView\.svelte$/],
  },
  {
    id: 'manager-components',
    label: 'Manager components browser',
    smokeLabels: ['manager-components-normal', 'manager-components-stacked'],
    matches: [/^src\/ui\/svelte\/apps\/manager\/ComponentsBrowserView\.svelte$/, /^src\/ui\/svelte\/apps\/manager\/ComponentEditView\.svelte$/],
  },
  {
    id: 'manager-tags-categories',
    label: 'Manager tags and categories',
    smokeLabels: ['manager-tags-categories-normal', 'manager-tags-categories-stacked'],
    matches: [/^src\/ui\/svelte\/apps\/manager\/TagsCategoriesView\.svelte$/],
  },
  {
    id: 'manager-essences',
    label: 'Manager essences',
    smokeLabels: ['manager-essences-normal', 'manager-essences-stacked', 'manager-essence-edit-first-state'],
    matches: [/^src\/ui\/svelte\/apps\/manager\/Essence(?:Browser|Edit)View\.svelte$/, /^src\/ui\/svelte\/util\/essenceIcons\.js$/],
  },
  {
    id: 'manager-environments',
    label: 'Manager gathering environments',
    smokeLabels: ['manager-environments-browse-normal', 'manager-environments-browse-stacked', 'manager-environment-edit-placeholder'],
    matches: [/^src\/ui\/svelte\/apps\/manager\/EnvironmentEditView\.svelte$/, /^src\/ui\/svelte\/apps\/manager\/EnvironmentsBrowserView\.svelte$/, /^src\/ui\/svelte\/apps\/manager\/environment\//],
  },
  {
    id: 'manager-gathering-tasks',
    label: 'Manager gathering tasks',
    smokeLabels: ['manager-gathering-task-editor-normal', 'manager-gathering-task-editor-stacked'],
    matches: [/^src\/ui\/svelte\/apps\/manager\/GatheringTaskEditView\.svelte$/, /^src\/ui\/svelte\/apps\/manager\/GatheringTasksBrowserView\.svelte$/],
  },
  {
    id: 'manager-gathering-hazards',
    label: 'Manager gathering hazards',
    smokeLabels: ['manager-gathering-hazards-normal', 'manager-gathering-hazard-editor-normal'],
    matches: [/^src\/ui\/svelte\/apps\/manager\/GatheringHazardEditView\.svelte$/, /^src\/ui\/svelte\/apps\/manager\/GatheringHazardsBrowserView\.svelte$/],
  },
  {
    id: 'manager-tools',
    label: 'Manager gathering tools',
    smokeLabels: ['manager-tools-normal'],
    matches: [/^src\/ui\/svelte\/apps\/manager\/ToolsBrowserView\.svelte$/],
  },
  {
    id: 'manager-recipes',
    label: 'Manager recipes',
    smokeLabels: ['manager-recipes-normal'],
    matches: [/^src\/ui\/svelte\/apps\/manager\/RecipesBrowserView\.svelte$/],
  },
  {
    id: 'fabricate-app-shell',
    label: 'Shared Fabricate app shell',
    smokeLabels: ['fabricate-app-shell'],
    matches: [/^src\/ui\/SvelteFabricateApp\.svelte\.js$/, /^src\/ui\/svelte\/apps\/FabricateAppRoot\.svelte$/],
  },
  {
    id: 'theme-or-global-ui',
    label: 'Global UI styling or theme',
    smokeLabels: [
      'manager-default-selection',
      'manager-components-normal',
      'manager-environments-browse-normal',
      'manager-gathering-task-editor-normal',
      'manager-gathering-hazards-normal',
      'manager-essences-normal',
    ],
    matches: [/^styles\//, /\.css$/],
  },
]);

export function normalizePath(filePath) {
  return String(filePath || '').replace(/\\/g, '/').replace(/^\.\//, '');
}

export function isUiFile(filePath) {
  const normalized = normalizePath(filePath);
  return normalized.startsWith('src/ui/')
    || normalized.startsWith('styles/')
    || normalized.startsWith('lang/')
    || normalized.endsWith('.svelte')
    || normalized.endsWith('.css');
}

export function hasUiChanges(files = []) {
  return files.some(isUiFile);
}

export function mapChangedFilesToViews(files = []) {
  const normalizedFiles = files.map(normalizePath).filter(Boolean);
  const matched = [];
  for (const recipe of VIEW_RECIPES) {
    if (normalizedFiles.some(file => recipe.matches.some(pattern => pattern.test(file)))) {
      matched.push(recipe);
    }
  }
  if (matched.length === 0 && normalizedFiles.some(isUiFile)) {
    matched.push(VIEW_RECIPES.find(recipe => recipe.id === 'theme-or-global-ui'));
  }
  return matched.filter(Boolean);
}

export function hasScreenshotEvidence(body = '', { prNumber = '' } = {}) {
  const text = String(body || '');
  const normalizedPrNumber = normalizeOptionalPrNumber(prNumber);
  if (normalizedPrNumber) {
    const prPart = `pr-${escapeRegExp(normalizedPrNumber)}`;
    const prScopedTestResultArtifact = new RegExp(`test-results/[^\\s)>"']*${prPart}[^\\s)>"']*\\.(?:png|jpg|jpeg|webp|gif)`, 'i');
    if (prScopedTestResultArtifact.test(text)) return true;

    const prScopedArtifact = new RegExp(`codex-ui-evidence-${escapeRegExp(normalizedPrNumber)}(?:\\b|[-_.][\\w.-]*)|actions/runs/[0-9]+/artifacts/[0-9]+[^\\n]*${prPart}`, 'i');
    if (prScopedArtifact.test(text)) return true;

    const prScopedAttachment = new RegExp(`!\\[[^\\]]*${prPart}[^\\]]*\\]\\(https://github\\.com/user-attachments/assets/[0-9a-f-]+\\)`, 'i');
    return prScopedAttachment.test(text);
  }

  const testResultArtifact = /test-results\/[^\s)>"']+\.(?:png|jpg|jpeg|webp|gif)/i;
  if (testResultArtifact.test(text)) return true;

  const uploadedArtifact = /codex-ui-evidence-[\w.-]+|actions\/runs\/[0-9]+\/artifacts\/[0-9]+|github\.com\/user-attachments\/assets\/[0-9a-f-]+/i;
  return uploadedArtifact.test(text);
}

export function validateChangedFilesForCheck(changedFiles = [], { required = false } = {}) {
  if (required && changedFiles.length === 0) {
    return 'Changed-files input is empty; cannot determine whether this PR changes UI files.';
  }
  return '';
}

export function explainScreenshotEvidenceFailure(files = [], body = '', options = {}) {
  if (!hasUiChanges(files)) return null;
  if (hasScreenshotEvidence(body, options)) return null;
  const prNumber = options.prNumber || '<number>';
  const exemptLabel = options.exemptLabel || DEFAULT_EXEMPT_LABEL;
  const views = mapChangedFilesToViews(files).map(recipe => recipe.label).join(', ') || 'changed UI views';
  return `This PR changes UI files but has no smoke-run screenshot evidence for: ${views}. Run npm run test:foundry to produce real Foundry screenshots, then npm run screenshots:ui -- --base origin/main --pr ${prNumber} to collect the relevant smoke artifacts under tmp/pr-screenshots/${prNumber}/, then npm run screenshots:ui:publish -- --pr ${prNumber} to upload them with gh image and embed the returned ![pr-${prNumber} ...](https://github.com/user-attachments/assets/...) image markdown in the PR body. If screenshot capture is genuinely impossible, a maintainer must add the '${exemptLabel}' label (it cannot be self-applied by an agent).`;
}

export function collectScreenshotEvidence({
  changedFiles = [],
  prNumber,
  sourceDir = 'test-results',
  outputDir,
  allowMissing = false,
  root = ROOT,
} = {}) {
  const normalizedPrNumber = requirePrNumber(prNumber, 'collect');
  const views = mapChangedFilesToViews(changedFiles);
  const sourceRoot = resolve(root, sourceDir);
  const destinationRoot = resolve(root, outputDir || `tmp/pr-screenshots/${normalizedPrNumber}`);
  const copied = [];
  const missing = [];
  const allImages = existsSync(sourceRoot) ? listImages(sourceRoot).sort((a, b) => a.localeCompare(b)) : [];

  mkdirSync(destinationRoot, { recursive: true });
  for (const view of views) {
    const candidates = allImages.filter(file => view.smokeLabels.some(label => matchesSmokeLabel(file, label)));
    if (candidates.length === 0) {
      missing.push(view);
      continue;
    }
    const source = candidates[0];
    const destination = join(destinationRoot, `${view.id}${extensionOf(source)}`);
    copyFileSync(source, destination);
    copied.push({ view, source, destination });
  }

  if (missing.length && !allowMissing) {
    const labels = missing.map(view => `${view.id} (${view.smokeLabels.join(', ') || 'no smoke labels configured'})`).join(', ');
    throw new Error(`Missing smoke screenshots for ${labels} in ${relative(root, sourceRoot)}`);
  }

  return { views, copied, missing, destinationRoot };
}

export function cleanPrScreenshotEvidence({ prNumber, root = ROOT } = {}) {
  const normalizedPrNumber = requirePrNumber(prNumber, 'clean');
  const destinationRoot = resolve(root, `tmp/pr-screenshots/${normalizedPrNumber}`);
  rmSync(destinationRoot, { recursive: true, force: true });
  return destinationRoot;
}

export function readLabelList(path) {
  if (!path || !existsSync(path)) return [];
  return readLines(path);
}

export function isExemptByLabel(labels = [], exemptLabel = DEFAULT_EXEMPT_LABEL) {
  if (!exemptLabel) return false;
  const target = String(exemptLabel).trim().toLowerCase();
  return labels.some(label => String(label).trim().toLowerCase() === target);
}

export function buildScreenshotMarkdown(prNumber, uploaded = []) {
  const normalizedPrNumber = normalizeOptionalPrNumber(prNumber);
  const prefix = normalizedPrNumber ? `pr-${normalizedPrNumber} ` : '';
  return uploaded.map(({ label, url }) => `![${prefix}${label}](${url})`).join('\n\n');
}

export function upsertScreenshotsBlock(body = '', blockMarkdown = '') {
  const text = String(body || '');
  const inner = `${SCREENSHOTS_BLOCK_START}\n${blockMarkdown}\n${SCREENSHOTS_BLOCK_END}`;
  const startIndex = text.indexOf(SCREENSHOTS_BLOCK_START);
  const endIndex = text.indexOf(SCREENSHOTS_BLOCK_END);
  if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
    const before = text.slice(0, startIndex);
    const after = text.slice(endIndex + SCREENSHOTS_BLOCK_END.length);
    return `${before}${inner}${after}`;
  }
  const trimmed = text.replace(/\s+$/, '');
  return trimmed ? `${trimmed}\n\n${inner}\n` : `${inner}\n`;
}

export function parseAttachmentUrl(text = '') {
  const match = String(text).match(/https:\/\/github\.com\/user-attachments\/assets\/[0-9a-fA-F-]+/);
  return match ? match[0] : '';
}

function defaultGhRunner(args, { input } = {}) {
  const result = spawnSync('gh', args, { cwd: ROOT, encoding: 'utf8', input });
  if (result.error) {
    const code = result.error.code === 'ENOENT' ? 127 : (result.status ?? 1);
    const stderr = result.error.code === 'ENOENT' ? 'gh CLI not found on PATH' : result.error.message;
    return { status: code, stdout: result.stdout ?? '', stderr };
  }
  return { status: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

export function publishScreenshotEvidence({
  prNumber,
  repo,
  dir,
  root = ROOT,
  runGh = defaultGhRunner,
} = {}) {
  const normalizedPrNumber = requirePrNumber(prNumber, 'publish');
  const destinationRoot = resolve(root, dir || `tmp/pr-screenshots/${normalizedPrNumber}`);

  const auth = runGh(['auth', 'status']);
  if (auth.status !== 0) {
    throw new Error(`gh is not authenticated. Run \`gh auth login\` first.\n${auth.stderr || ''}`.trim());
  }
  const ext = runGh(['image', '--help']);
  if (ext.status !== 0) {
    throw new Error('The gh image extension is required to upload screenshots. Install it with `gh extension install <owner>/gh-image`.');
  }

  const files = existsSync(destinationRoot)
    ? listImages(destinationRoot).sort((a, b) => a.localeCompare(b))
    : [];
  if (files.length === 0) {
    return {
      skipped: true,
      reason: `No screenshots to publish in ${relative(root, destinationRoot).replaceAll(sep, '/')}`,
      uploaded: [],
    };
  }

  const repoArgs = repo ? ['--repo', repo] : [];
  const uploaded = [];
  for (const file of files) {
    const upload = runGh(['image', 'upload', file]);
    if (upload.status !== 0) {
      throw new Error(`gh image upload failed for ${relative(root, file).replaceAll(sep, '/')}: ${upload.stderr || 'unknown error'}`);
    }
    const url = parseAttachmentUrl(upload.stdout);
    if (!url) {
      throw new Error(`Could not parse a user-attachments URL from gh image output for ${relative(root, file).replaceAll(sep, '/')}.`);
    }
    const name = basename(file);
    const viewId = name.slice(0, name.length - extensionOf(file).length);
    const recipe = VIEW_RECIPES.find(item => item.id === viewId);
    uploaded.push({ viewId, label: recipe ? recipe.label : viewId, url, file });
  }

  const view = runGh(['pr', 'view', String(normalizedPrNumber), ...repoArgs, '--json', 'body', '--jq', '.body']);
  if (view.status !== 0) {
    throw new Error(`Failed to read PR #${normalizedPrNumber} body: ${view.stderr || 'unknown error'}`);
  }
  const currentBody = String(view.stdout || '').replace(/\r\n/g, '\n').replace(/\n+$/, '');
  const newBody = upsertScreenshotsBlock(currentBody, buildScreenshotMarkdown(normalizedPrNumber, uploaded));

  const bodyFile = join(destinationRoot, '.pr-body.md');
  writeFileSync(bodyFile, newBody);
  const edit = runGh(['pr', 'edit', String(normalizedPrNumber), ...repoArgs, '--body-file', bodyFile]);
  if (edit.status !== 0) {
    throw new Error(`Failed to update PR #${normalizedPrNumber} body: ${edit.stderr || 'unknown error'}`);
  }

  return { skipped: false, uploaded, destinationRoot, bodyFile };
}

function listImages(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const absolute = join(dir, entry);
    const stat = statSync(absolute);
    if (stat.isDirectory()) {
      files.push(...listImages(absolute));
    } else if (IMAGE_EXTENSIONS.has(extensionOf(absolute))) {
      files.push(absolute);
    }
  }
  return files;
}

function matchesSmokeLabel(filePath, label) {
  const name = basename(filePath).toLowerCase();
  const escaped = escapeRegExp(label.toLowerCase());
  return new RegExp(`(?:^|-)${escaped}\\.(?:png|jpg|jpeg|webp|gif)$`).test(name);
}

function normalizeOptionalPrNumber(prNumber) {
  if (prNumber === undefined || prNumber === null || prNumber === '') return '';
  const normalized = String(prNumber).trim();
  if (!/^[0-9]+$/.test(normalized)) {
    throw new Error(`Invalid PR number: ${prNumber}`);
  }
  return normalized;
}

function requirePrNumber(prNumber, command) {
  const normalized = normalizeOptionalPrNumber(prNumber);
  if (!normalized) throw new Error(`${command} requires prNumber`);
  return normalized;
}

function extensionOf(filePath) {
  const name = basename(filePath).toLowerCase();
  const index = name.lastIndexOf('.');
  return index >= 0 ? name.slice(index) : '';
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function readLines(path) {
  return readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
}

function readChangedFilesFromGit(base) {
  const result = spawnSync('git', ['diff', '--name-only', `${base}..HEAD`], { cwd: ROOT, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || `git diff failed with status ${result.status}`);
  return result.stdout.split(/\r?\n/).filter(Boolean);
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      args._.push(arg);
      continue;
    }
    const [rawKey, inlineValue] = arg.slice(2).split(/=(.*)/s, 2);
    const key = toCamelCase(rawKey);
    if (key === 'allowMissing') {
      args.allowMissing = inlineValue === undefined ? true : inlineValue !== 'false';
      continue;
    }
    if (inlineValue !== undefined) {
      args[key] = inlineValue;
      continue;
    }
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      throw new Error(`Missing value for --${rawKey}`);
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

function toCamelCase(value) {
  return value.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
}

function loadChangedFiles(args) {
  if (args.changedFiles) return readLines(args.changedFiles);
  if (args.base) return readChangedFilesFromGit(args.base);
  return [];
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const command = args._[0] || 'plan';
  const changedFiles = loadChangedFiles(args);

  if (command === 'plan') {
    if (!hasUiChanges(changedFiles)) {
      console.log('No UI changes detected.');
      return;
    }
    console.log('UI smoke screenshot artifacts required:');
    for (const recipe of mapChangedFilesToViews(changedFiles)) {
      console.log(`- ${recipe.id}: ${recipe.label} (${recipe.smokeLabels.join(', ')})`);
    }
    return;
  }

  if (command === 'check') {
    const body = args.bodyFile ? readFileSync(args.bodyFile, 'utf8') : '';
    const exemptLabel = args.exemptLabel || DEFAULT_EXEMPT_LABEL;
    const labels = readLabelList(args.labels);

    // A maintainer-applied label is the only exemption and wins unconditionally.
    if (isExemptByLabel(labels, exemptLabel)) {
      console.log(`Screenshot check skipped: '${exemptLabel}' label present.`);
      return;
    }

    const changedFilesFailure = validateChangedFilesForCheck(changedFiles, { required: Boolean(args.changedFiles) });
    if (changedFilesFailure) {
      console.error(`::error::${changedFilesFailure}`);
      process.exitCode = 1;
      return;
    }

    if (!hasUiChanges(changedFiles)) {
      console.log('No UI files changed - screenshot check skipped.');
      return;
    }

    const failure = explainScreenshotEvidenceFailure(changedFiles, body, { prNumber: args.pr, exemptLabel });
    if (failure) {
      console.error(`::error::${failure}`);
      process.exitCode = 1;
    } else {
      console.log('UI smoke screenshot evidence found.');
    }
    return;
  }

  if (command === 'collect') {
    const result = collectScreenshotEvidence({
      changedFiles,
      prNumber: args.pr,
      sourceDir: args.sourceDir || 'test-results',
      outputDir: args.outputDir,
      allowMissing: args.allowMissing === true,
    });
    for (const item of result.copied) {
      console.log(`${relative(ROOT, item.destination).replaceAll(sep, '/')} <= ${relative(ROOT, item.source).replaceAll(sep, '/')}`);
    }
    for (const view of result.missing) {
      console.log(`MISSING: ${view.label} (${view.id}) needs a smoke screenshot artifact from test-results/.`);
    }
    return;
  }

  if (command === 'clean') {
    const destinationRoot = cleanPrScreenshotEvidence({ prNumber: args.pr });
    console.log(`Removed ${relative(ROOT, destinationRoot).replaceAll(sep, '/')}`);
    return;
  }

  if (command === 'publish') {
    const result = publishScreenshotEvidence({
      prNumber: args.pr,
      repo: args.repo,
      dir: args.outputDir,
    });
    if (result.skipped) {
      console.log(result.reason);
      return;
    }
    for (const item of result.uploaded) {
      console.log(`${item.viewId} <= ${item.url}`);
    }
    console.log(`Updated PR #${normalizeOptionalPrNumber(args.pr)} body with ${result.uploaded.length} screenshot${result.uploaded.length === 1 ? '' : 's'}.`);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error.message);
    process.exit(1);
  });
}
