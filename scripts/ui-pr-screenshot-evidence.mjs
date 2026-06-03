#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
const COPIED_PREVIEW_ASSET_PREFIX = 'tests/fixtures/ui-assets/copied/';
const APPROVED_PREVIEW_SOURCE_PREFIXES = Object.freeze(['icons/', 'systems/dnd5e/']);
const APPROVED_PREVIEW_ASSET_EXTENSIONS = new Set(['.webp', '.png', '.jpg', '.jpeg']);
const DEFAULT_FOCUSED_VIEW_IDS = Object.freeze([
  'manager-systems',
  'manager-components',
  'manager-environments',
  'manager-gathering-tasks',
  'manager-gathering-hazards',
  'manager-essences',
]);

export const VIEW_RECIPES = Object.freeze([
  {
    id: 'manager-systems',
    label: 'Manager systems browser',
    focusedScreenshots: ['manager-systems'],
    smokeLabels: ['manager-default-selection', 'manager-selected-normal', 'manager-selected-stacked'],
    matches: [/^src\/ui\/svelte\/apps\/manager\/SystemsBrowserView\.svelte$/, /^src\/ui\/svelte\/apps\/manager\/CraftingSystemManagerRoot\.svelte$/],
  },
  {
    id: 'manager-system-edit',
    label: 'Manager system settings',
    focusedScreenshots: ['manager-system-edit'],
    smokeLabels: ['manager-system-edit-normal', 'manager-system-edit-narrow'],
    matches: [/^src\/ui\/svelte\/apps\/manager\/SystemEditView\.svelte$/],
  },
  {
    id: 'manager-components',
    label: 'Manager components browser',
    focusedScreenshots: ['manager-components'],
    smokeLabels: ['manager-components-normal', 'manager-components-stacked'],
    matches: [/^src\/ui\/svelte\/apps\/manager\/ComponentsBrowserView\.svelte$/, /^src\/ui\/svelte\/apps\/manager\/ComponentEditView\.svelte$/],
  },
  {
    id: 'manager-tags-categories',
    label: 'Manager tags and categories',
    focusedScreenshots: ['manager-tags-categories'],
    smokeLabels: ['manager-tags-categories-normal', 'manager-tags-categories-stacked'],
    matches: [/^src\/ui\/svelte\/apps\/manager\/TagsCategoriesView\.svelte$/],
  },
  {
    id: 'manager-essences',
    label: 'Manager essences',
    focusedScreenshots: ['manager-essences', 'manager-essence-editor'],
    smokeLabels: ['manager-essences-normal', 'manager-essences-stacked', 'manager-essence-edit-first-state'],
    matches: [/^src\/ui\/svelte\/apps\/manager\/Essence(?:Browser|Edit)View\.svelte$/, /^src\/ui\/svelte\/utils\/essenceIcons\.js$/],
  },
  {
    id: 'manager-environments',
    label: 'Manager gathering environments',
    focusedScreenshots: ['manager-environments', 'manager-environment-editor'],
    smokeLabels: ['manager-environments-browse-normal', 'manager-environments-browse-stacked', 'manager-environment-edit-placeholder'],
    matches: [/^src\/ui\/svelte\/apps\/manager\/EnvironmentEditView\.svelte$/, /^src\/ui\/svelte\/apps\/manager\/EnvironmentsBrowserView\.svelte$/, /^src\/ui\/svelte\/apps\/manager\/environment\//],
  },
  {
    id: 'manager-gathering-tasks',
    label: 'Manager gathering tasks',
    focusedScreenshots: ['manager-gathering-tasks'],
    smokeLabels: ['manager-gathering-task-editor-normal', 'manager-gathering-task-editor-stacked'],
    matches: [/^src\/ui\/svelte\/apps\/manager\/GatheringTaskEditView\.svelte$/, /^src\/ui\/svelte\/apps\/manager\/GatheringTasksBrowserView\.svelte$/],
  },
  {
    id: 'manager-gathering-hazards',
    label: 'Manager gathering hazards',
    focusedScreenshots: ['manager-gathering-hazards'],
    smokeLabels: [],
    matches: [/^src\/ui\/svelte\/apps\/manager\/GatheringHazardEditView\.svelte$/, /^src\/ui\/svelte\/apps\/manager\/GatheringHazardsBrowserView\.svelte$/],
  },
  {
    id: 'manager-tools',
    label: 'Manager gathering tools',
    focusedScreenshots: ['manager-tools'],
    smokeLabels: [],
    matches: [/^src\/ui\/svelte\/apps\/manager\/ToolsBrowserView\.svelte$/],
  },
  {
    id: 'manager-recipes',
    label: 'Manager recipes',
    focusedScreenshots: ['manager-recipes'],
    smokeLabels: [],
    matches: [/^src\/ui\/svelte\/apps\/manager\/RecipesBrowserView\.svelte$/],
  },
  {
    id: 'fabricate-app-shell',
    label: 'Shared Fabricate app shell',
    focusedScreenshots: ['fabricate-app-shell'],
    smokeLabels: ['fabricate-app-shell'],
    matches: [/^src\/ui\/SvelteFabricateApp\.svelte\.js$/, /^src\/ui\/svelte\/apps\/FabricateAppRoot\.svelte$/],
  },
  {
    id: 'theme-or-global-ui',
    label: 'Global UI styling or theme',
    focusedScreenshots: DEFAULT_FOCUSED_VIEW_IDS,
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
  const views = mapChangedFilesToViews(files).map(recipe => recipe.label).join(', ') || 'changed UI views';
  return `This PR changes UI files but has no generated screenshot evidence for: ${views}. Generate focused screenshots under tmp/pr-screenshots/${options.prNumber || '<number>'}/, attach or upload them to the PR, clean the tmp directory, and link the uploaded evidence in the PR body; or add SCREENSHOTS_NEEDED: <reason>.`;
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
    const labels = missing.map(view => `${view.id}${view.smokeLabels.length ? '' : ' (needs focused screenshot)'}`).join(', ');
    throw new Error(`Missing generated screenshots for ${labels} in ${relative(root, sourceRoot)}`);
  }

  return { views, copied, missing, destinationRoot };
}

export async function generateFocusedScreenshotEvidence({
  changedFiles = [],
  prNumber,
  outputDir,
  views: requestedViews,
  root = ROOT,
} = {}) {
  const normalizedPrNumber = normalizeOptionalPrNumber(prNumber);
  const viewIds = focusedViewIdsFor({ changedFiles, requestedViews });
  const destinationRoot = resolve(root, outputDir || `tmp/pr-screenshots/${normalizedPrNumber || 'local'}`);
  mkdirSync(destinationRoot, { recursive: true });

  const [{ chromium }, manifest] = await Promise.all([
    import('playwright'),
    import(`${pathToFileURL(resolve(root, 'tests/fixtures/ui-assets/manifest.js')).href}?cache=${Date.now()}`),
  ]);
  const assetData = buildAssetData(manifest.UI_SCREENSHOT_ASSETS, root);
  const browser = await chromium.launch();
  const generated = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
    for (const viewId of viewIds) {
      const html = renderFocusedScreenshotHtml(viewId, assetData);
      if (!html) throw new Error(`No focused screenshot renderer exists for ${viewId}`);
      await page.setContent(html, { waitUntil: 'load' });
      await page.locator('#focused-screenshot-frame').screenshot({
        path: join(destinationRoot, `${viewId}.png`),
      });
      generated.push({ id: viewId, path: join(destinationRoot, `${viewId}.png`) });
    }
  } finally {
    await browser.close();
  }
  return { generated, destinationRoot };
}

export function cleanPrScreenshotEvidence({ prNumber, root = ROOT } = {}) {
  const normalizedPrNumber = requirePrNumber(prNumber, 'clean');
  const destinationRoot = resolve(root, `tmp/pr-screenshots/${normalizedPrNumber}`);
  rmSync(destinationRoot, { recursive: true, force: true });
  return destinationRoot;
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

export function focusedViewIdsFor({ changedFiles = [], requestedViews } = {}) {
  const requested = String(requestedViews || '').trim();
  if (requested === 'all') {
    return [...new Set(VIEW_RECIPES.flatMap(recipe => recipe.focusedScreenshots || []))];
  }
  if (requested === 'representative') return [...DEFAULT_FOCUSED_VIEW_IDS];
  if (requested) {
    return [...new Set(requested.split(',').map(value => value.trim()).filter(Boolean))];
  }

  const mapped = mapChangedFilesToViews(changedFiles).flatMap(recipe => recipe.focusedScreenshots || []);
  if (mapped.length > 0) return [...new Set(mapped)];
  if (hasUiChanges(changedFiles)) return [...DEFAULT_FOCUSED_VIEW_IDS];
  return [...DEFAULT_FOCUSED_VIEW_IDS];
}

export function buildAssetData(assets, root) {
  return {
    components: {
      ore: assetDataUri(assets.components.ore, root),
      hardwood: assetDataUri(assets.components.hardwood, root),
      hide: assetDataUri(assets.components.hide, root),
      gemstone: assetDataUri(assets.components.gemstone, root),
      essence: assetDataUri(assets.components.essence, root),
      potion: assetDataUri(assets.components.potion, root),
      weapon: assetDataUri(assets.components.weapon, root),
      armor: assetDataUri(assets.components.armor, root),
      tool: assetDataUri(assets.components.tool, root),
    },
    gathering: {
      forest: assetDataUri(assets.gathering.forest, root),
      mine: assetDataUri(assets.gathering.mine, root),
      ruins: assetDataUri(assets.gathering.ruins, root),
      battlefield: assetDataUri(assets.gathering.battlefield, root),
      planar: assetDataUri(assets.gathering.planar, root),
      dragonLair: assetDataUri(assets.gathering.dragonLair, root),
    },
    hazards: {
      weather: assetDataUri(assets.hazards.weather, root),
      terrain: assetDataUri(assets.hazards.terrain, root),
      hostile: assetDataUri(assets.hazards.hostile, root),
      surge: assetDataUri(assets.hazards.surge, root),
    },
    fallbacks: {
      missingItem: assetDataUri(assets.fallbacks.missingItem, root),
    },
  };
}

function assetDataUri(assetPath, root) {
  const normalized = normalizePath(assetPath);
  const absolute = resolve(root, normalized);
  const extension = extensionOf(normalized).slice(1);
  const ext = extension === 'jpg' ? 'jpeg' : extension;
  return `data:image/${ext};base64,${readFileSync(absolute).toString('base64')}`;
}

export function renderFocusedScreenshotHtml(viewId, assets) {
  const renderers = {
    'manager-systems': renderManagerSystems,
    'manager-system-edit': renderManagerSystemEdit,
    'manager-components': renderManagerComponents,
    'manager-tags-categories': renderManagerTagsCategories,
    'manager-essences': renderManagerEssences,
    'manager-essence-editor': renderManagerEssenceEditor,
    'manager-environments': renderManagerEnvironments,
    'manager-environment-editor': renderManagerEnvironmentEditor,
    'manager-gathering-tasks': renderManagerGatheringTasks,
    'manager-gathering-hazards': renderManagerGatheringHazards,
    'manager-tools': renderManagerTools,
    'manager-recipes': renderManagerRecipes,
    'fabricate-app-shell': renderFabricateAppShell,
  };
  const body = renderers[viewId]?.(assets);
  if (!body) return '';
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>${focusedScreenshotCss()}</style>
</head>
<body>
  <main id="focused-screenshot-frame">${body}</main>
</body>
</html>`;
}

function focusedScreenshotCss() {
  return `
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background:
        radial-gradient(circle at 20% 10%, rgba(186, 128, 83, 0.34), transparent 26%),
        linear-gradient(135deg, #1d1117 0%, #293548 46%, #111820 100%);
      color: #f8dec4;
      font-family: "Signika", "Segoe UI", sans-serif;
      font-size: 14px;
    }
    #focused-screenshot-frame {
      width: 1220px;
      height: 690px;
      overflow: hidden;
      border: 1px solid rgba(250, 210, 170, 0.22);
      background: #13232d;
      box-shadow: 0 18px 48px rgba(0, 0, 0, 0.42);
    }
    .manager {
      display: grid;
      grid-template-columns: 220px minmax(0, 1fr) 300px;
      grid-template-rows: 96px minmax(0, 1fr);
      height: 100%;
      background: #132631;
    }
    .header {
      grid-column: 1 / -1;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 20px 28px;
      border-bottom: 1px solid rgba(244, 198, 152, 0.18);
      background: #192d38;
    }
    .crumb, .eyebrow, .table-head, .section-title {
      color: #d8a978;
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
    }
    h1, h2, h3, p { margin: 0; }
    h1 { margin-top: 7px; color: #fff7ed; font-size: 20px; line-height: 1.1; }
    h2 { color: #fff7ed; font-size: 18px; line-height: 1.1; }
    h3 { color: #ffe3c1; font-size: 15px; line-height: 1.1; }
    p, .muted { color: #d8b28e; line-height: 1.35; }
    .button-row { display: flex; gap: 8px; align-items: center; }
    .button {
      border: 1px solid rgba(244, 198, 152, 0.28);
      border-radius: 6px;
      padding: 9px 13px;
      color: #ffe3c1;
      background: #31414d;
      font-weight: 800;
    }
    .button.primary { color: #061118; background: #a7c9ae; border-color: #a7c9ae; }
    .nav {
      padding: 24px 12px;
      border-right: 1px solid rgba(244, 198, 152, 0.15);
      background: #0e1a22;
    }
    .system-card {
      margin-bottom: 12px;
      padding: 14px 12px;
      border: 1px solid rgba(244, 198, 152, 0.18);
      border-radius: 7px;
      background: #263941;
    }
    .nav-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      min-height: 40px;
      padding: 0 10px;
      border-radius: 6px;
      color: #f6d7b6;
      font-weight: 800;
    }
    .nav-item.active { border: 1px solid #d8a978; background: #273b3f; color: #fff3df; }
    .nav-item.dim { color: #9f846c; }
    .nav-sub { margin-left: 14px; border-left: 1px solid rgba(244, 198, 152, 0.16); padding-left: 8px; }
    .content {
      min-width: 0;
      overflow: hidden;
      padding: 22px 12px;
      background: #162b37;
    }
    .inspector {
      overflow: hidden;
      padding: 12px;
      border-left: 1px solid rgba(244, 198, 152, 0.15);
      background: #2d3d49;
    }
    .toolbar {
      display: flex;
      gap: 10px;
      align-items: center;
      margin: 14px 0 10px;
    }
    .search, .select {
      height: 34px;
      border: 1px solid rgba(244, 198, 152, 0.2);
      border-radius: 6px;
      background: #0e1a22;
      color: #d8b28e;
      display: flex;
      align-items: center;
      padding: 0 12px;
    }
    .search { flex: 1; }
    .table { display: grid; gap: 8px; }
    .row {
      display: grid;
      grid-template-columns: minmax(260px, 1.5fr) 130px 105px 92px 120px;
      align-items: center;
      gap: 12px;
      min-height: 76px;
      padding: 10px;
      border: 1px solid rgba(202, 218, 222, 0.17);
      border-radius: 7px;
      background: #2b3f49;
    }
    .row.selected { border-left: 3px solid #e0b27f; background: #2b4648; }
    .row.compact { grid-template-columns: minmax(260px, 1.5fr) 120px 130px 110px; }
    .row.environment { grid-template-columns: minmax(280px, 1.5fr) 120px 80px 90px 120px; }
    .row.task { grid-template-columns: minmax(280px, 1.5fr) 145px 120px 120px; }
    .identity { display: grid; grid-template-columns: 52px minmax(0, 1fr); gap: 12px; align-items: center; }
    .thumb {
      width: 52px;
      height: 52px;
      border: 1px solid rgba(244, 198, 152, 0.18);
      border-radius: 7px;
      object-fit: cover;
      background: #0e1a22;
    }
    .thumb.large { width: 88px; height: 88px; }
    .chip {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 24px;
      padding: 3px 8px;
      border: 1px solid rgba(244, 198, 152, 0.28);
      border-radius: 6px;
      color: #fff0d5;
      background: #43535c;
      font-size: 12px;
      font-weight: 800;
    }
    .chip.good { background: #456b58; border-color: #80a889; }
    .chip.warn { background: #756037; border-color: #cba55a; }
    .chip.danger { background: #74494b; border-color: #d58a8b; }
    .actions { display: flex; gap: 7px; }
    .icon-button {
      width: 34px;
      height: 34px;
      display: grid;
      place-items: center;
      border: 1px solid rgba(244, 198, 152, 0.2);
      border-radius: 6px;
      background: #3a4954;
      color: #f8dec4;
      font-weight: 900;
    }
    .card {
      margin-bottom: 12px;
      padding: 14px;
      border: 1px solid rgba(244, 198, 152, 0.18);
      border-radius: 7px;
      background: #344653;
    }
    .fact-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px; }
    .fact {
      min-height: 44px;
      padding: 8px 10px;
      border: 1px solid rgba(244, 198, 152, 0.15);
      border-radius: 6px;
      background: #2d3d49;
    }
    .form-grid { display: grid; grid-template-columns: 170px minmax(0, 1fr); gap: 16px; }
    .field { margin-bottom: 12px; }
    .input, .textarea {
      width: 100%;
      border: 1px solid rgba(244, 198, 152, 0.2);
      border-radius: 6px;
      padding: 10px;
      background: #0d1b24;
      color: #ffe3c1;
      font-weight: 700;
    }
    .textarea { min-height: 92px; }
    .tabs { display: flex; gap: 8px; margin: 14px 0; }
    .tab { padding: 9px 10px; border-radius: 6px; background: #2d3d49; border: 1px solid rgba(244,198,152,.18); font-weight: 800; }
    .tab.active { border-color: #d8a978; background: #314849; }
    .badge { margin-left: 5px; min-width: 22px; color: #111820; background: #d8a978; border-radius: 999px; padding: 2px 6px; }
    .split { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .preview-scene { width: 100%; height: 118px; object-fit: cover; border-radius: 7px; border: 1px solid rgba(244,198,152,.18); }
    .inventory {
      height: 100%;
      padding: 24px;
      background: #172630;
    }
  `;
}

function renderManagerShell({ title, subtitle, active = 'Systems', content, inspector, actions = '<span class="button">Import</span><span class="button primary">Create</span>' }) {
  const nav = [
    ['System settings', '2'],
    ['Components', '9'],
    ['Tags & Categories', '6'],
    ['Essences', '4'],
    ['Tools', '3'],
    ['Gathering', '8'],
    ['Recipes', '5'],
    ['Rules', 'Soon'],
  ].map(([label, count]) => `<div class="nav-item ${label === active ? 'active' : ''}"><span>${label}</span><span>${count}</span></div>`).join('');
  return `
    <section class="manager">
      <header class="header">
        <div><div class="crumb">Crafting Systems / The Herbalist's Compendium</div><h1>${title}</h1><p>${subtitle}</p></div>
        <div class="button-row">${actions}</div>
      </header>
      <aside class="nav">
        <div class="system-card"><h2>The Herbalist's Compendium</h2><p>GM management workspace</p></div>
        ${nav}
      </aside>
      <section class="content">${content}</section>
      <aside class="inspector">${inspector}</aside>
    </section>`;
}

function renderManagerSystems(assets) {
  return renderManagerShell({
    title: 'Crafting systems',
    subtitle: 'Manage the system definitions that organize Fabricate components, recipes, gathering, and feature rules.',
    active: '',
    content: `
      <h2>System library</h2>
      <p>Select a row to view counts and enabled features.</p>
      <div class="toolbar"><div class="search">Search by name or description</div><div class="select">All systems</div><span class="chip">2 of 2</span></div>
      <div class="table">
        ${systemRow('Alchemy Field Kit', assets.components.potion, 'Alchemy resolution', 'Active', true)}
        ${systemRow('Smithing Annex', assets.components.weapon, 'Routed recipes', 'Active', false)}
        ${systemRow('Runic Binding', assets.components.essence, 'Progressive checks', 'Draft', false)}
      </div>`,
    inspector: `
      <div class="card"><img class="thumb large" src="${assets.components.potion}" alt=""><div class="eyebrow">Selected system</div><h2>Alchemy Field Kit</h2><div class="button-row"><span class="chip good">Active</span><span class="chip">Gathering</span></div><p>Potion work with field harvesting and essence extraction.</p></div>
      <div class="card"><div class="section-title">Counts</div><div class="fact-grid"><div class="fact"><strong>9</strong><br>Components</div><div class="fact"><strong>5</strong><br>Recipes</div><div class="fact"><strong>6</strong><br>Environments</div><div class="fact"><strong>4</strong><br>Essences</div></div></div>`,
  });
}

function systemRow(name, img, mode, status, selected) {
  return `<div class="row compact ${selected ? 'selected' : ''}">
    <div class="identity"><img class="thumb" src="${img}" alt=""><div><h3>${name}</h3><p>Reusable workspace for crafting and gathering rules.</p></div></div>
    <span class="chip">${mode}</span><span class="chip good">${status}</span>
    <div class="actions"><span class="icon-button">Edit</span><span class="icon-button">Copy</span><span class="icon-button">Del</span></div>
  </div>`;
}

function renderManagerSystemEdit(assets) {
  return renderManagerShell({
    title: 'System settings',
    subtitle: 'Configure feature gates, resolution mode, and public identity.',
    active: 'System settings',
    actions: '<span class="button">Cancel</span><span class="button primary">Save system</span>',
    content: `
      <div class="card">
        <div class="form-grid">
          <div><img class="thumb large" src="${assets.components.potion}" alt=""><p class="muted">Preview image</p></div>
          <div>
            <div class="field"><div class="section-title">Name</div><div class="input">Alchemy Field Kit</div></div>
            <div class="field"><div class="section-title">Description</div><div class="textarea">Potion work with field harvesting, required tools, reusable drop rules, and essence extraction.</div></div>
            <div class="split"><div class="fact"><strong>Resolution</strong><br>Alchemy</div><div class="fact"><strong>Advanced options</strong><br>Enabled</div></div>
          </div>
        </div>
      </div>
      <div class="split"><div class="card"><h3>Enabled features</h3><p><span class="chip good">Gathering</span> <span class="chip good">Essences</span> <span class="chip good">Tags</span></p></div><div class="card"><h3>Defaults</h3><p>Current time: Dusk<br>Weather: Rain</p></div></div>`,
    inspector: `<div class="card"><div class="eyebrow">Selected system</div><h2>Alchemy Field Kit</h2><p>Changes here drive every manager section for this system.</p></div>`,
  });
}

function renderManagerComponents(assets) {
  const rows = [
    ['Iron Ore', assets.components.ore, 'ore, metal', 'Earth x2', 'Linked'],
    ['Moon Fern', assets.components.hardwood, 'herb, moon', 'Verdant x1', 'Linked'],
    ['Dragon Scale', assets.components.hide, 'reagent', 'Fire x1', 'Missing'],
    ['Crystal Dust', assets.components.gemstone, 'mineral', 'Arcane x2', 'Linked'],
  ];
  return renderManagerShell({
    title: 'Components',
    subtitle: 'Manage item-backed components for the selected crafting system.',
    active: 'Components',
    content: `<h2>Component directory</h2><p>Browse item-backed components and source state.</p><div class="toolbar"><div class="search">Search components...</div><span class="chip">9 of 9</span></div><div class="table">${rows.map(([name, img, tags, essences, state], index) => `<div class="row ${index === 0 ? 'selected' : ''}"><div class="identity"><img class="thumb" src="${img}" alt=""><div><h3>${name}</h3><p>${tags}</p></div></div><span>${tags}</span><span>${essences}</span><span class="chip ${state === 'Missing' ? 'warn' : 'good'}">${state}</span><div class="actions"><span class="icon-button">Edit</span><span class="icon-button">Copy</span></div></div>`).join('')}</div>`,
    inspector: `<div class="card"><img class="thumb large" src="${assets.components.ore}" alt=""><div class="eyebrow">Selected component</div><h2>Iron Ore</h2><span class="chip good">Linked</span><p>Unrefined metal used in tools, repairs, and mineral essences.</p></div><div class="card"><div class="section-title">Essences</div><p><span class="chip">Earth x2</span> <span class="chip">Metal x1</span></p></div>`,
  });
}

function renderManagerTagsCategories(assets) {
  return renderManagerShell({
    title: 'Tags & Categories',
    subtitle: 'Organize component tags and recipe categories.',
    active: 'Tags & Categories',
    content: `<div class="split"><div class="card"><h2>Component tags</h2><div class="table">${['herb', 'ore', 'reagent', 'moon', 'mineral'].map((tag, index) => `<div class="row compact ${index === 0 ? 'selected' : ''}"><div><h3>${tag}</h3><p>${index + 2} linked components</p></div><span class="chip">Visible</span><span class="chip good">Active</span><div class="actions"><span class="icon-button">Edit</span></div></div>`).join('')}</div></div><div class="card"><h2>Recipe categories</h2><p><span class="chip">Potions</span> <span class="chip">Elixirs</span> <span class="chip">Tools</span></p><img class="preview-scene" src="${assets.components.potion}" alt=""></div></div>`,
    inspector: `<div class="card"><div class="eyebrow">Selected tag</div><h2>herb</h2><p>Used by Moon Fern, Sun Petal, and Verdant Root.</p></div>`,
  });
}

function renderManagerEssences(assets) {
  return renderManagerShell({
    title: 'Essences',
    subtitle: 'Define extracted qualities and their component usage.',
    active: 'Essences',
    content: `<h2>Essence library</h2><div class="toolbar"><div class="search">Search essences...</div><span class="chip">4 of 4</span></div><div class="table">${[
      ['Verdant', assets.components.hardwood, 'Growth and renewal', '3 components'],
      ['Mineral', assets.components.ore, 'Stone, ore, and grit', '2 components'],
      ['Arcane', assets.components.essence, 'Runic charge', '1 component'],
    ].map(([name, img, desc, usage], index) => `<div class="row compact ${index === 0 ? 'selected' : ''}"><div class="identity"><img class="thumb" src="${img}" alt=""><div><h3>${name}</h3><p>${desc}</p></div></div><span class="chip">${usage}</span><span class="chip good">Active</span><div class="actions"><span class="icon-button">Edit</span></div></div>`).join('')}</div>`,
    inspector: `<div class="card"><img class="thumb large" src="${assets.components.hardwood}" alt=""><div class="eyebrow">Selected essence</div><h2>Verdant</h2><p>The essence of growth, renewal, and living roots.</p></div>`,
  });
}

function renderManagerEssenceEditor(assets) {
  return renderManagerShell({
    title: 'Edit essence',
    subtitle: 'Update identity and preview image for this essence.',
    active: 'Essences',
    actions: '<span class="button">Cancel</span><span class="button primary">Save essence</span>',
    content: `<div class="card"><div class="form-grid"><div><img class="thumb large" src="${assets.components.hardwood}" alt=""><p>Selected icon</p></div><div><div class="field"><div class="section-title">Name</div><div class="input">Verdant</div></div><div class="field"><div class="section-title">Description</div><div class="textarea">The essence of growth, renewal, and living roots.</div></div></div></div></div>`,
    inspector: `<div class="card"><div class="eyebrow">Selected essence</div><h2>Verdant</h2><p>Usage: 3 components</p></div>`,
  });
}

function renderManagerEnvironments(assets) {
  const rows = [
    ['Moonlit Forest', assets.gathering.forest, 'Targeted', '4', 'Active'],
    ['Crystal Mine', assets.gathering.mine, 'Blind', '3', 'Active'],
    ['Sunken Ruins', assets.gathering.ruins, 'Targeted', '2', 'Draft'],
    ['Battlefield Salvage', assets.gathering.battlefield, 'Blind', '2', 'Active'],
    ['Planar Scar', assets.gathering.planar, 'Targeted', '2', 'Dangerous'],
    ['Dragon Aerie', assets.gathering.dragonLair, 'Targeted', '1', 'Dangerous'],
  ];
  return renderManagerShell({
    title: 'Environments',
    subtitle: 'Manage scene-linked gathering environments for the selected crafting system.',
    active: 'Gathering',
    actions: '<span class="button primary">Create environment</span>',
    content: `<h2>Gathering environments</h2><p>Focused preview data uses copied Foundry raster icons.</p><div class="toolbar"><div class="search">Search environments...</div><div class="select">All biomes</div><div class="select">All risks</div><span class="chip">6 of 6</span></div><div class="table">${rows.map(([name, img, mode, tasks, status], index) => `<div class="row environment ${index === 0 ? 'selected' : ''}"><div class="identity"><img class="thumb" src="${img}" alt=""><div><h3>${name}</h3><p>Region: Northreach / Biome: forest</p></div></div><span class="chip">${mode}</span><strong>${tasks}</strong><span class="chip ${status === 'Dangerous' ? 'danger' : 'good'}">${status}</span><div class="actions"><span class="icon-button">Edit</span><span class="icon-button">Copy</span></div></div>`).join('')}</div>`,
    inspector: `<div class="card"><img class="preview-scene" src="${assets.gathering.forest}" alt=""><div class="eyebrow">Selected environment</div><h2>Moonlit Forest</h2><p>A scene-linked forest with weather-aware tasks and hazards.</p></div><div class="card"><div class="fact-grid"><div class="fact"><strong>4</strong><br>Tasks</div><div class="fact"><strong>2</strong><br>Hazards</div><div class="fact"><strong>3</strong><br>Required tools</div><div class="fact"><strong>Targeted</strong><br>Selection</div></div></div>`,
  });
}

function renderManagerEnvironmentEditor(assets) {
  return renderManagerShell({
    title: 'Edit environment',
    subtitle: 'Tune composition membership, runtime readiness, and validation.',
    active: 'Gathering',
    actions: '<span class="button">Cancel</span><span class="button primary">Save environment</span>',
    content: `<div class="tabs"><span class="tab active">Overview</span><span class="tab">Tasks <span class="badge">4</span></span><span class="tab">Hazards <span class="badge">2</span></span><span class="tab">Validation <span class="badge">1</span><span class="badge">2</span></span></div><div class="split"><div class="card"><h2>Player summary</h2><img class="preview-scene" src="${assets.gathering.forest}" alt=""><p>Forage moonlit herbs under old trees.</p></div><div class="card"><h2>Composition</h2><p><span class="chip good">Automatic</span> <span class="chip">Forest</span> <span class="chip warn">Rain at dusk</span></p><div class="fact-grid"><div class="fact">Runtime tasks<br><strong>3 available</strong></div><div class="fact">Included tasks<br><strong>4 composed</strong></div></div></div></div><div class="card"><h2>Runtime preview</h2><p>Current conditions make Night Bloom unavailable, but it remains counted because it is composed by environment match.</p></div>`,
    inspector: `<div class="card"><div class="eyebrow">Linked scene</div><img class="preview-scene" src="${assets.gathering.forest}" alt=""><h2>Moonlit Forest</h2><p>Scene image resolves from the focused asset manifest.</p></div>`,
  });
}

function renderManagerGatheringTasks(assets) {
  const rows = [
    ['Gather Moon Herbs', assets.components.hardwood, 'included by match', 'Unavailable now'],
    ['Prospect Crystal Veins', assets.gathering.mine, 'explicitly included', 'Available'],
    ['Harvest Dragon Scale', assets.components.hide, 'force included', 'Dangerous'],
  ];
  return renderManagerShell({
    title: 'Gathering tasks',
    subtitle: 'Author reusable task definitions, required tools, and result drops.',
    active: 'Gathering',
    content: `<h2>Task library</h2><div class="toolbar"><div class="search">Search tasks...</div><span class="chip">8 of 8</span></div><div class="table">${rows.map(([name, img, state, runtime], index) => `<div class="row task ${index === 0 ? 'selected' : ''}"><div class="identity"><img class="thumb" src="${img}" alt=""><div><h3>${name}</h3><p>${state}</p></div></div><span class="chip">${runtime}</span><span class="chip">2 drops</span><div class="actions"><span class="icon-button">Edit</span><span class="icon-button">Copy</span></div></div>`).join('')}</div>`,
    inspector: `<div class="card"><img class="thumb large" src="${assets.components.hardwood}" alt=""><div class="eyebrow">Selected task</div><h2>Gather Moon Herbs</h2><p>Requires sickle or herbalism kit. Produces Moon Fern and Verdant Essence.</p></div>`,
  });
}

function renderManagerGatheringHazards(assets) {
  const rows = [
    ['Storm Front', assets.hazards.weather, 'Weather', 'Warning'],
    ['Loose Scree', assets.hazards.terrain, 'Terrain', 'Warning'],
    ['Acolyte Patrol', assets.hazards.hostile, 'Hostile', 'Danger'],
    ['Arcane Surge', assets.hazards.surge, 'Magic', 'Danger'],
  ];
  return renderManagerShell({
    title: 'Gathering hazards',
    subtitle: 'Author reusable hazard definitions for risky environments.',
    active: 'Gathering',
    content: `<h2>Hazard library</h2><div class="toolbar"><div class="search">Search hazards...</div><span class="chip">4 of 4</span></div><div class="table">${rows.map(([name, img, type, severity], index) => `<div class="row task ${index === 0 ? 'selected' : ''}"><div class="identity"><img class="thumb" src="${img}" alt=""><div><h3>${name}</h3><p>${type}</p></div></div><span class="chip ${severity === 'Danger' ? 'danger' : 'warn'}">${severity}</span><span class="chip">Composed</span><div class="actions"><span class="icon-button">Edit</span></div></div>`).join('')}</div>`,
    inspector: `<div class="card"><img class="thumb large" src="${assets.hazards.weather}" alt=""><div class="eyebrow">Selected hazard</div><h2>Storm Front</h2><p>Rain and wind add risk to exposed gathering tasks.</p></div>`,
  });
}

function renderManagerTools(assets) {
  return renderManagerShell({
    title: 'Tools',
    subtitle: 'Configure gathering tools used by tasks.',
    active: 'Tools',
    content: `<h2>Tool library</h2><div class="table">${['Prospector Pick', 'Herbal Sickle', 'Sealed Lantern'].map((name, index) => `<div class="row compact ${index === 0 ? 'selected' : ''}"><div class="identity"><img class="thumb" src="${assets.components.tool}" alt=""><div><h3>${name}</h3><p>Reusable requirement for gathering tasks.</p></div></div><span class="chip good">Active</span><span class="chip">Limited uses</span><div class="actions"><span class="icon-button">Edit</span></div></div>`).join('')}</div>`,
    inspector: `<div class="card"><img class="thumb large" src="${assets.components.tool}" alt=""><h2>Prospector Pick</h2><p>Required by Crystal Mine tasks.</p></div>`,
  });
}

function renderManagerRecipes(assets) {
  return renderManagerShell({
    title: 'Recipes',
    subtitle: 'Browse crafting outcomes and requirements.',
    active: 'Recipes',
    content: `<h2>Recipe library</h2><div class="table">${[
      ['Healing Draught', assets.components.potion, '2 ingredients', 'Active'],
      ['Moonsteel Blade', assets.components.weapon, '4 ingredients', 'Active'],
      ['Warded Breastplate', assets.components.armor, '5 ingredients', 'Draft'],
    ].map(([name, img, req, status], index) => `<div class="row compact ${index === 0 ? 'selected' : ''}"><div class="identity"><img class="thumb" src="${img}" alt=""><div><h3>${name}</h3><p>${req}</p></div></div><span class="chip">${req}</span><span class="chip good">${status}</span><div class="actions"><span class="icon-button">Edit</span></div></div>`).join('')}</div>`,
    inspector: `<div class="card"><img class="thumb large" src="${assets.components.potion}" alt=""><h2>Healing Draught</h2><p>Produces one potion from Moon Fern, Glass Vial, and Verdant Essence.</p></div>`,
  });
}

function renderFabricateAppShell(assets) {
  return `<section class="inventory"><div class="header" style="margin:-24px -24px 20px"><div><div class="crumb">Actor / Alara the Alchemist</div><h1>Fabricate</h1><p>Player-facing crafting, recipes, and inventory context.</p></div><div class="button-row"><span class="button primary">Craft</span></div></div><div class="split"><div class="card"><h2>Available recipes</h2>${[
    ['Healing Draught', assets.components.potion],
    ['Moonsteel Blade', assets.components.weapon],
    ['Warded Breastplate', assets.components.armor],
  ].map(([name, img]) => `<div class="row compact"><div class="identity"><img class="thumb" src="${img}" alt=""><div><h3>${name}</h3><p>Ready to craft</p></div></div><span class="chip good">Ready</span><span class="chip">Visible</span><div></div></div>`).join('')}</div><div class="card"><h2>Inventory context</h2><p><span class="chip">Iron Ore x6</span> <span class="chip">Moon Fern x4</span> <span class="chip">Glass Vial x3</span></p><img class="preview-scene" src="${assets.gathering.forest}" alt=""><p>Gathering results and recipe requirements share the same representative fixture asset set.</p></div></div></section>`;
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
      const labels = recipe.focusedScreenshots?.length ? recipe.focusedScreenshots.join(', ') : 'focused screenshot required';
      console.log(`- ${recipe.id}: ${recipe.label} (${labels})`);
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

  if (command === 'generate') {
    const result = await generateFocusedScreenshotEvidence({
      changedFiles,
      prNumber: args.pr,
      outputDir: args.outputDir,
      views: args.views,
    });
    for (const item of result.generated) {
      console.log(relative(ROOT, item.path).replaceAll(sep, '/'));
    }
    return;
  }

  if (command === 'clean') {
    const destinationRoot = cleanPrScreenshotEvidence({ prNumber: args.pr });
    console.log(`Removed ${relative(ROOT, destinationRoot).replaceAll(sep, '/')}`);
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
