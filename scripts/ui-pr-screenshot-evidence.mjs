#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);

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
    matches: [/^src\/ui\/svelte\/apps\/manager\/Essence(?:Browser|Edit)View\.svelte$/, /^src\/ui\/svelte\/utils\/essenceIcons\.js$/],
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
  const screenshotNeeded = text.match(/^SCREENSHOTS_NEEDED:\s*(\S.*)$/im);
  if (screenshotNeeded) return true;

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
  const views = mapChangedFilesToViews(files).map(recipe => recipe.label).join(', ') || 'changed UI views';
  return `This PR changes UI files but has no smoke-run screenshot evidence for: ${views}. Run npm run test:foundry to produce real Foundry screenshots, collect the relevant smoke artifacts under tmp/pr-screenshots/${prNumber}/ with npm run screenshots:ui -- --base origin/main --pr ${prNumber}, upload them through GitHub's native attachment flow, embed the returned ![pr-${prNumber} ...](https://github.com/user-attachments/assets/...) image markdown in the PR body, clean the tmp directory, or add SCREENSHOTS_NEEDED: <reason>.`;
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
    const changedFilesFailure = validateChangedFilesForCheck(changedFiles, { required: Boolean(args.changedFiles) });
    if (changedFilesFailure) {
      console.error(`::error::${changedFilesFailure}`);
      process.exitCode = 1;
      return;
    }
    const failure = explainScreenshotEvidenceFailure(changedFiles, body, { prNumber: args.pr });
    if (failure) {
      console.error(`::error::${failure}`);
      process.exitCode = 1;
    } else if (hasUiChanges(changedFiles)) {
      console.log('UI smoke screenshot evidence found.');
    } else {
      console.log('No UI files changed - screenshot check skipped.');
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
      console.log(`SCREENSHOTS_NEEDED: ${view.label} (${view.id}) needs a smoke screenshot artifact from test-results/.`);
    }
    return;
  }

  if (command === 'clean') {
    const destinationRoot = cleanPrScreenshotEvidence({ prNumber: args.pr });
    console.log(`Removed ${relative(ROOT, destinationRoot).replaceAll(sep, '/')}`);
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
