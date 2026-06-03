#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
const COPIED_PREVIEW_ASSET_PREFIX = 'tests/fixtures/ui-assets/copied/';
const APPROVED_PREVIEW_SOURCE_PREFIXES = Object.freeze(['icons/', 'systems/dnd5e/']);
const APPROVED_PREVIEW_ASSET_EXTENSIONS = new Set(['.webp', '.png', '.jpg', '.jpeg']);

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
    smokeLabels: [],
    matches: [/^src\/ui\/svelte\/apps\/manager\/GatheringHazardEditView\.svelte$/, /^src\/ui\/svelte\/apps\/manager\/GatheringHazardsBrowserView\.svelte$/],
  },
  {
    id: 'manager-tools',
    label: 'Manager gathering tools',
    smokeLabels: [],
    matches: [/^src\/ui\/svelte\/apps\/manager\/ToolsBrowserView\.svelte$/],
  },
  {
    id: 'manager-recipes',
    label: 'Manager recipes',
    smokeLabels: [],
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
    smokeLabels: [],
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

  const prPart = prNumber ? `pr-${escapeRegExp(String(prNumber))}` : 'pr-[0-9]+';
  const generatedAsset = new RegExp(`(?:docs/assets/pr-screenshots/${prPart}/|/docs/assets/pr-screenshots/${prPart}/)[^\\s)>"']+\\.(?:png|jpg|jpeg|webp|gif)(?:\\?raw=1)?`, 'i');
  if (generatedAsset.test(text)) return true;

  const testResultArtifact = /test-results\/[^\s)>"']+\.(?:png|jpg|jpeg|webp|gif)/i;
  if (testResultArtifact.test(text)) return true;

  const uploadedArtifact = /codex-ui-evidence-[\w.-]+|actions\/runs\/[0-9]+\/artifacts\/[0-9]+/i;
  return uploadedArtifact.test(text);
}

export function explainScreenshotEvidenceFailure(files = [], body = '', options = {}) {
  if (!hasUiChanges(files)) return null;
  if (hasScreenshotEvidence(body, options)) return null;
  const views = mapChangedFilesToViews(files).map(recipe => recipe.label).join(', ') || 'changed UI views';
  return `This PR changes UI files but has no generated screenshot evidence for: ${views}. Add docs/assets/pr-screenshots/pr-${options.prNumber || '<number>'}/ images, link uploaded screenshot artifacts, or add SCREENSHOTS_NEEDED: <reason>.`;
}

export function collectScreenshotEvidence({
  changedFiles = [],
  prNumber,
  sourceDir = 'test-results',
  outputDir,
  allowMissing = false,
  root = ROOT,
} = {}) {
  if (!prNumber) throw new Error('collect requires prNumber');
  const views = mapChangedFilesToViews(changedFiles);
  const sourceRoot = resolve(root, sourceDir);
  const destinationRoot = resolve(root, outputDir || `docs/assets/pr-screenshots/pr-${prNumber}`);
  const copied = [];
  const missing = [];
  const allImages = existsSync(sourceRoot) ? listImages(sourceRoot) : [];

  mkdirSync(destinationRoot, { recursive: true });
  for (const view of views) {
    const candidates = allImages.filter(file => view.smokeLabels.some(label => basename(file).includes(label)));
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
    const labels = missing.map(view => `${view.id}${view.smokeLabels.length ? '' : ' (needs focused screenshot)'}`).join(', ');
    throw new Error(`Missing generated screenshots for ${labels} in ${relative(root, sourceRoot)}`);
  }

  return { views, copied, missing, destinationRoot };
}

export async function validateAssetManifest(manifestPath = 'tests/fixtures/ui-assets/manifest.js', { root = ROOT } = {}) {
  const absoluteManifest = resolve(root, manifestPath);
  if (!existsSync(absoluteManifest)) throw new Error(`Asset manifest missing: ${manifestPath}`);
  const imported = await import(`${pathToFileURL(absoluteManifest).href}?cache=${Date.now()}`);
  const assets = imported.UI_SCREENSHOT_ASSETS;
  const sources = imported.UI_SCREENSHOT_ASSET_SOURCES;
  if (!assets || typeof assets !== 'object') throw new Error('UI_SCREENSHOT_ASSETS export is missing');
  if (!sources || typeof sources !== 'object') throw new Error('UI_SCREENSHOT_ASSET_SOURCES export is missing');

  const flattened = flattenAssets(assets);
  const flattenedSources = new Map(flattenAssets(sources));
  if (flattened.length === 0) throw new Error('UI_SCREENSHOT_ASSETS must not be empty');
  for (const [key, assetPath] of flattened) {
    const normalized = normalizePath(assetPath);
    if (!normalized.startsWith(COPIED_PREVIEW_ASSET_PREFIX)) {
      throw new Error(`${key} must use a copied preview asset under ${COPIED_PREVIEW_ASSET_PREFIX}, got ${assetPath}`);
    }
    if (!APPROVED_PREVIEW_ASSET_EXTENSIONS.has(extensionOf(normalized))) {
      throw new Error(`${key} must use a non-SVG copied preview asset, got ${assetPath}`);
    }
    const absoluteAsset = resolve(root, normalized);
    if (!existsSync(absoluteAsset)) throw new Error(`${key} points to a missing copied asset: ${assetPath}`);
    const source = normalizePath(flattenedSources.get(key));
    if (!source) throw new Error(`${key} is missing source metadata`);
    if (!APPROVED_PREVIEW_SOURCE_PREFIXES.some(prefix => source.startsWith(prefix))) {
      throw new Error(`${key} source must be a Foundry core or dnd5e path, got ${source}`);
    }
    if (!APPROVED_PREVIEW_ASSET_EXTENSIONS.has(extensionOf(source))) {
      throw new Error(`${key} source must be non-SVG Foundry core or dnd5e raster art, got ${source}`);
    }
  }
  return flattened;
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

function extensionOf(filePath) {
  const name = basename(filePath).toLowerCase();
  const index = name.lastIndexOf('.');
  return index >= 0 ? name.slice(index) : '';
}

function flattenAssets(value, prefix = '') {
  const flattened = [];
  for (const [key, child] of Object.entries(value || {})) {
    const nextKey = prefix ? `${prefix}.${key}` : key;
    if (typeof child === 'string') {
      flattened.push([nextKey, child]);
    } else if (child && typeof child === 'object') {
      flattened.push(...flattenAssets(child, nextKey));
    }
  }
  return flattened;
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
    const key = arg.slice(2);
    if (key === 'allow-missing') {
      args.allowMissing = true;
      continue;
    }
    args[toCamelCase(key)] = argv[++i];
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
    console.log('UI screenshot recipes required:');
    for (const recipe of mapChangedFilesToViews(changedFiles)) {
      const labels = recipe.smokeLabels.length ? recipe.smokeLabels.join(', ') : 'focused screenshot required';
      console.log(`- ${recipe.id}: ${recipe.label} (${labels})`);
    }
    return;
  }

  if (command === 'check') {
    const body = args.bodyFile ? readFileSync(args.bodyFile, 'utf8') : '';
    const failure = explainScreenshotEvidenceFailure(changedFiles, body, { prNumber: args.pr });
    if (failure) {
      console.error(`::error::${failure}`);
      process.exitCode = 1;
    } else if (hasUiChanges(changedFiles)) {
      console.log('Generated UI screenshot evidence found.');
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
      console.log(`SCREENSHOTS_NEEDED: ${view.label} (${view.id}) needs a focused generated screenshot.`);
    }
    return;
  }

  if (command === 'assets') {
    const assets = await validateAssetManifest(args.manifest || undefined);
    console.log(`UI screenshot assets OK: ${assets.length}`);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error.message);
    process.exit(1);
  });
}
