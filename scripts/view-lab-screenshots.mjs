#!/usr/bin/env node
/**
 * Fabricate View Lab CLI (issue 823, Design H): `plan` / `test` / `capture` / `validate`.
 *
 * The View Lab is a deterministic, Foundry-free producer of PR screenshot evidence: it
 * mounts REAL Fabricate Svelte components in a real Chromium (via the already-present
 * `playwright` library) over production `styles/fabricate.css` + the single-sourced
 * `tests/fixtures/foundry-core-min.css` compat superset + bundled OFL fonts, and writes
 * each case DIRECTLY to `<id>.png`. It runs without Foundry/Docker/a world and is a
 * SEPARATE browser suite from the live-smoke config — never run by `node --test`, so a
 * browser flake can never surface as `# cancelled`.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { chromium } from 'playwright';
import { createServer } from 'vite';

import labConfig from '../playwright-viewlab.config.js';
import { loadChangedFiles } from './ui-pr-screenshot-evidence.mjs';
import { buildManifest, fileForId, validateManifest } from './lib/viewLabArtifact.js';
import { VIEW_CASES, caseIds, mapChangedFilesToCases } from './lib/viewLabCases.js';
import { buildCoverageManifest, collectRepoFiles } from './lib/viewLabCoverage.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const COVERAGE_MANIFEST_PATH = 'tests/view-lab/coverage-manifest.json';

// ── Case selection ────────────────────────────────────────────────────────────
function publishableCases() {
  return VIEW_CASES.filter((viewCase) => viewCase.publish);
}

function selectCases(args) {
  if (args.cases) {
    const wanted = new Set(String(args.cases).split(',').map((s) => s.trim()).filter(Boolean));
    return VIEW_CASES.filter((viewCase) => wanted.has(viewCase.id));
  }
  if (process.env.VIEW_LAB_CASE_IDS) {
    const wanted = new Set(process.env.VIEW_LAB_CASE_IDS.split(',').map((s) => s.trim()).filter(Boolean));
    return VIEW_CASES.filter((viewCase) => wanted.has(viewCase.id));
  }
  if (args.changedFiles || args.base) {
    const changed = loadChangedFiles(args);
    const mapped = mapChangedFilesToCases(changed);
    return mapped.filter((viewCase) => viewCase.publish);
  }
  return publishableCases();
}

// ── Programmatic Vite dev server ────────────────────────────────────────────────
async function startLabServer() {
  const server = await createServer({ configFile: resolve(ROOT, labConfig.server.viteConfig) });
  await server.listen();
  const resolved = server.resolvedUrls?.local?.[0];
  const port = server.config.server.port || labConfig.server.port;
  const host = labConfig.server.host || '127.0.0.1';
  const baseUrl = (resolved || `http://${host}:${port}`).replace(/\/$/, '');
  return { baseUrl, close: () => server.close() };
}

// ── One real interaction per component that supports it (Design G) ─────────────
// happy-dom cannot compute real cascade; the lab proves the component mounts + WIRES
// in a real browser and that ONE signature behaviour fires. Presentational cases
// (badges/pills) assert readySelector + the console-error + font-presence gates only.
const INTERACTIONS = {
  'src/ui/svelte/apps/crafting/RecipeListRow.svelte': async (page) => {
    await page.evaluate(() => {
      window.__vlClicked = null;
      window.__FABRICATE_VIEW__.patchState({ onSelect: (id) => { window.__vlClicked = id; } });
    });
    await page.locator('.crafting-recipe-row-main').first().click();
    const clicked = await page.evaluate(() => window.__vlClicked);
    if (!clicked) throw new Error('RecipeListRow onSelect spy did not fire on row click');
  },
};

async function renderCase(browser, baseUrl, viewCase) {
  const context = await browser.newContext({
    viewport: viewCase.viewport,
    deviceScaleFactor: labConfig.deviceScaleFactor,
    locale: labConfig.locale,
    timezoneId: labConfig.timezoneId,
  });
  const page = await context.newPage();
  const consoleErrors = [];
  const allow = labConfig.consoleErrorAllowlist || [];
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (!allow.some((pattern) => text.includes(pattern))) consoleErrors.push(text);
  });
  page.on('pageerror', (error) => consoleErrors.push(String(error && error.message ? error.message : error)));

  // A 1x1 transparent PNG used to deterministically satisfy the image requests the
  // Foundry-free lab cannot resolve: Foundry/dnd5e core icon paths (`/icons/…`) and any
  // cross-origin image. Those are a documented fidelity gap (see scripts/README
  // `## Fidelity gap`); left alone they 404 and trip the console-error gate. Genuine
  // SAME-ORIGIN Fabricate assets (e.g. under `/assets/`) are NOT stubbed — they load for
  // real, so the icon frames are as representative as the repo assets allow.
  const TRANSPARENT_PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  );
  // Foundry serves core icons under `/icons/…`; the lab does not, so those paths are
  // unresolvable even though they are same-origin to Vite.
  const isFoundryCoreIcon = (url) => /\/icons\//.test(new URL(url).pathname);
  // Block all EXTERNAL network (Design D). Same-origin (Vite/local fonts/CSS) is allowed.
  const origin = new URL(baseUrl).origin;
  await page.route('**', (route) => {
    const request = route.request();
    const url = request.url();
    if (request.resourceType() === 'image' && (!url.startsWith(origin) || isFoundryCoreIcon(url))) {
      return route.fulfill({ status: 200, contentType: 'image/png', body: TRANSPARENT_PNG });
    }
    if (url.startsWith(origin) || url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
    return route.abort();
  });

  try {
    await page.goto(`${baseUrl}${labConfig.mountPath}?case=${encodeURIComponent(viewCase.id)}`, {
      waitUntil: 'load',
    });
    // Wait for the affirmative ready flag OR the error flag (fail-closed font presence
    // throws inside the mount and sets data-view-lab-error).
    await page.waitForFunction(
      () => document.body.hasAttribute('data-view-lab-ready') || document.body.hasAttribute('data-view-lab-error'),
      { timeout: labConfig.readyTimeoutMs },
    );
    const errorAttr = await page.evaluate(() => document.body.getAttribute('data-view-lab-error'));
    if (errorAttr) throw new Error(`case ${viewCase.id}: ${errorAttr}`);

    // readySelector MUST appear — a missing selector is a loud failure, never a hang.
    await page.locator(viewCase.readySelector).first().waitFor({ state: 'attached', timeout: 5000 });

    const interaction = INTERACTIONS[viewCase.component];
    if (interaction) await interaction(page);

    const buffer = await page.locator('[data-view-lab-frame]').first().screenshot();

    if (consoleErrors.length > 0) {
      throw new Error(`case ${viewCase.id}: unexpected console errors:\n  ${consoleErrors.join('\n  ')}`);
    }
    return buffer;
  } finally {
    await context.close();
  }
}

async function withBrowserAndServer(fn) {
  const server = await startLabServer();
  const browser = await chromium.launch({ args: labConfig.launchArgs });
  try {
    return await fn({ browser, baseUrl: server.baseUrl });
  } finally {
    await browser.close();
    await server.close();
  }
}

// ── Commands ────────────────────────────────────────────────────────────────────
function commandPlan(args) {
  const changed = loadChangedFiles(args);
  const cases = mapChangedFilesToCases(changed);
  if (cases.length === 0) {
    console.log('No View Lab cases selected (no UI changes, or no registry-covered view changed).');
    return;
  }
  console.log('View Lab cases to render:');
  for (const viewCase of cases) console.log(`- ${viewCase.id}: ${viewCase.label}`);
}

async function commandTest(args) {
  const cases = selectCases(args);
  if (cases.length === 0) {
    console.log('No cases to test.');
    return;
  }
  await withBrowserAndServer(async ({ browser, baseUrl }) => {
    for (const viewCase of cases) {
      await renderCase(browser, baseUrl, viewCase);
      console.log(`ok ${viewCase.id}`);
    }
  });
  console.log(`View Lab test: ${cases.length} case(s) rendered + asserted green.`);
}

function refreshCoverageManifest() {
  // No date stamp: the committed manifest is a deterministic deliverable for #824, so
  // regeneration is a no-op diff unless the registry or legacy map actually changed.
  const manifest = buildCoverageManifest({ repoFiles: collectRepoFiles(ROOT) });
  writeFileSync(resolve(ROOT, COVERAGE_MANIFEST_PATH), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

async function commandCapture(args) {
  const cases = selectCases(args);
  const artifactDir = resolve(ROOT, args.artifactDir || labConfig.artifactDir);
  rmSync(artifactDir, { recursive: true, force: true });
  mkdirSync(artifactDir, { recursive: true });

  const views = [];
  await withBrowserAndServer(async ({ browser, baseUrl }) => {
    for (const viewCase of cases) {
      const buffer = await renderCase(browser, baseUrl, viewCase);
      const file = fileForId(viewCase.id);
      writeFileSync(join(artifactDir, file), buffer);
      views.push({
        id: viewCase.id,
        label: viewCase.label,
        file,
        sha256: createHash('sha256').update(buffer).digest('hex'),
      });
      console.log(`captured ${file}`);
    }
  });

  const manifest = buildManifest({
    repository: args.repo || process.env.GITHUB_REPOSITORY || null,
    prNumber: args.pr ?? null,
    headSha: args.headSha || process.env.VIEW_LAB_HEAD_SHA || null,
    views,
  });
  writeFileSync(join(artifactDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  const coverage = refreshCoverageManifest();
  console.log(
    `View Lab capture: ${views.length} frame(s) → ${args.artifactDir || labConfig.artifactDir}; ` +
      `coverage ${coverage.coveredCount}/${coverage.legacyViewCount} legacy surfaces (fullCoverage=${coverage.fullCoverage}).`,
  );
  // Self-validate the freshly built artifact.
  runValidate(artifactDir);
}

function runValidate(artifactDir) {
  const manifestPath = join(artifactDir, 'manifest.json');
  if (!existsSync(manifestPath)) throw new Error(`No manifest.json in ${artifactDir}`);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const result = validateManifest(manifest, {
    allowedIds: new Set(caseIds()),
    fileExists: (file) => existsSync(join(artifactDir, file)),
    sha256Of: (file) => {
      const full = join(artifactDir, file);
      return existsSync(full) ? createHash('sha256').update(readFileSync(full)).digest('hex') : null;
    },
  });
  if (!result.ok) {
    throw new Error(`View Lab artifact validation failed:\n  ${result.errors.join('\n  ')}`);
  }
  console.log(`View Lab artifact valid: ${manifest.views.length} view(s), schemaVersion ${manifest.schemaVersion}.`);
}

function commandValidate(args) {
  const artifactDir = resolve(ROOT, args.artifactDir || labConfig.artifactDir);
  runValidate(artifactDir);
  const coverage = refreshCoverageManifest();
  console.log(
    `Coverage manifest refreshed: ${coverage.coveredCount}/${coverage.legacyViewCount} legacy surfaces covered, ` +
      `${coverage.gapCount} gap(s), fullCoverage=${coverage.fullCoverage}.`,
  );
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
    const key = rawKey.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (inlineValue !== undefined) {
      args[key] = inlineValue;
      continue;
    }
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const command = args._[0] || 'plan';
  if (command === 'plan') return commandPlan(args);
  if (command === 'test') return commandTest(args);
  if (command === 'capture') return commandCapture(args);
  if (command === 'validate') return commandValidate(args);
  throw new Error(`Unknown command: ${command}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}
