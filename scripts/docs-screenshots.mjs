#!/usr/bin/env node
/** Fill the documentation site's generated image slots from the View Lab. */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, statSync } from 'node:fs';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DOCS_SCREENSHOT_MAP_PATH,
  LAB_ASSET_EXTENSION,
  LAB_SCREENSHOT_DIRECTORY,
  expectedProvenance,
  labAssetPath,
  readDocsScreenshotMap,
  serializeDocsScreenshotMap,
} from './lib/docsScreenshotMap.js';
import {
  consumableFrames,
  missingImageToolReason,
  publicationPlan,
  staleManifestReason,
} from './lib/docsScreenshotRun.js';
import { missingChromeMessage, resolveChromeCache } from './lib/foundryChromeCache.js';
import { resolveExecutable } from './lib/resolveExecutable.js';
import { DECODER, ENCODER, compareEncodedFrames, encodeFrame } from './lib/webpFrames.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RENDERER = 'scripts/view-lab-screenshots.mjs';
const RENDER_OUTPUT_DIRECTORY = 'ui-screenshot-artifact/apps';

/** Where this run's freshly encoded frames go before anything decides to publish them. */
const ENCODE_OUTPUT_DIRECTORY = 'ui-screenshot-artifact/docs-frames';

/** Thrown for a condition a user can act on, so the CLI can print it without a stack trace. */
class DocsScreenshotError extends Error {}

/** The harvested Foundry chrome, or an abort naming how to obtain it. */
function requireChrome() {
  const cache = resolveChromeCache(ROOT);
  if (!cache) throw new DocsScreenshotError(missingChromeMessage(ROOT));
  return cache;
}

/** The libwebp tools, or an abort naming what is missing. */
function requireImageTools() {
  const encoder = resolveExecutable(ENCODER);
  const decoder = resolveExecutable(DECODER);
  const reason = missingImageToolReason([
    [ENCODER, encoder],
    [DECODER, decoder],
  ]);
  if (reason) throw new DocsScreenshotError(reason);
  return { encoder, decoder };
}

/** When the renderer's manifest was last written, or undefined when there is none. */
function manifestWrittenAt(manifestPath) {
  return statSync(manifestPath, { throwIfNoEntry: false })?.mtimeMs;
}

/** Render every mapped case and return the manifest that run wrote. */
async function renderCases(caseIds) {
  console.log(`rendering ${caseIds.length} case(s) — this takes a few minutes\n`);
  const manifestPath = join(ROOT, RENDER_OUTPUT_DIRECTORY, 'manifest.json');
  const before = manifestWrittenAt(manifestPath);
  const result = spawnSync(process.execPath, [join(ROOT, RENDERER), 'apps', caseIds.join(',')], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  if (result.error) {
    throw new DocsScreenshotError(`could not run the renderer: ${result.error.message}`);
  }

  const stale = staleManifestReason(
    RENDER_OUTPUT_DIRECTORY,
    before,
    manifestWrittenAt(manifestPath)
  );
  if (stale) throw new DocsScreenshotError(stale);
  return JSON.parse(await readFile(manifestPath, 'utf8'));
}

/** The source frame this run left on disk for a case, or null when there is none. */
function locateRenderedFrame(caseId) {
  const source = join(ROOT, RENDER_OUTPUT_DIRECTORY, `${caseId}.png`);
  return existsSync(source) ? source : null;
}

/** The SHA-256 of a file, lowercase hex. */
async function digestOf(path) {
  return createHash('sha256')
    .update(await readFile(path))
    .digest('hex');
}

/** Print a heading and its lines, or nothing at all when there are none. */
function report(heading, lines) {
  if (lines.length === 0) return;
  console.log(`\n${heading} (${lines.length}):`);
  for (const line of lines) console.log(`  ${line}`);
}

/** Say what a run would do, without starting a browser. */
async function commandPlan() {
  const map = await readDocsScreenshotMap(ROOT);
  const expected = await expectedProvenance(ROOT);
  console.log(`${map.screenshots.length} case(s) feed the documentation site`);

  const drifted = Object.entries(expected)
    .filter(([key, value]) => map.provenance[key] !== value)
    .map(([key, value]) => `${key}: recorded ${map.provenance[key] ?? 'nothing'}, now ${value}`);
  report('provenance has moved, so a run rewrites the whole set', drifted);

  const absent = map.screenshots
    .map((entry) => entry.case)
    .filter((caseId) => !existsSync(join(ROOT, labAssetPath(caseId))));
  report('no committed image yet, so a run writes these', absent);

  const chrome = resolveChromeCache(ROOT);
  console.log(
    `\nharvested Foundry chrome: ${chrome ? `${chrome.version}, ready` : 'ABSENT, so a run aborts'}`
  );
  for (const tool of [ENCODER, DECODER]) {
    console.log(`${tool}: ${resolveExecutable(tool) ? 'ready' : 'ABSENT, so a run aborts'}`);
  }
  if (drifted.length === 0 && absent.length === 0) {
    console.log('\nnothing is known to need rewriting, but only a run can tell you that for sure');
  }
  return 0;
}

/**
 * Render every mapped case, encode what this run produced, and judge each frame against the
 * committed one.
 */
async function renderAndCompare(tools, screenshots) {
  const caseIds = screenshots.map((entry) => entry.case);
  const manifest = await renderCases(caseIds);
  const { usable, refused } = consumableFrames(manifest, caseIds, locateRenderedFrame);
  await mkdir(join(ROOT, ENCODE_OUTPUT_DIRECTORY), { recursive: true });

  const verdicts = [];
  for (const entry of screenshots) {
    const source = usable.get(entry.case);
    if (!source) continue;
    const fresh = join(ROOT, ENCODE_OUTPUT_DIRECTORY, `${entry.case}${LAB_ASSET_EXTENSION}`);
    encodeFrame(tools.encoder, source, fresh);
    const committed = join(ROOT, labAssetPath(entry.case));
    if (!existsSync(committed)) {
      verdicts.push({ entry, source, fresh, state: 'absent', reason: 'no image is committed yet' });
      continue;
    }
    const comparison = compareEncodedFrames(
      tools.decoder,
      await readFile(committed),
      committed,
      await readFile(fresh),
      fresh
    );
    verdicts.push({
      entry,
      source,
      fresh,
      state: comparison.changed ? 'changed' : 'unchanged',
      reason: comparison.reason,
    });
  }
  return { verdicts, refused };
}

/** The verdicts of one state, as report lines naming the case and why. */
function linesFor(verdicts, state) {
  return verdicts
    .filter((verdict) => verdict.state === state)
    .map((verdict) => `${verdict.entry.case}: ${verdict.reason}`);
}

/** How far the recorded provenance is from this toolchain, as report lines. */
async function provenanceDrift(map) {
  const expected = await expectedProvenance(ROOT);
  return Object.entries(expected)
    .filter(([key, value]) => map.provenance[key] !== value)
    .map(([key, value]) => `${key}: recorded ${map.provenance[key] ?? 'nothing'}, now ${value}`);
}

/** Render, rewrite what moved, and leave the rest alone. */
async function commandGenerate() {
  requireChrome();
  const tools = requireImageTools();
  const map = await readDocsScreenshotMap(ROOT);
  const { verdicts, refused } = await renderAndCompare(tools, map.screenshots);
  const plan = publicationPlan(verdicts, refused);
  await mkdir(join(ROOT, LAB_SCREENSHOT_DIRECTORY), { recursive: true });

  for (const verdict of plan.rewrite) {
    await copyFile(verdict.fresh, join(ROOT, labAssetPath(verdict.entry.case)));
    verdict.entry.sha256 = await digestOf(verdict.source);
  }

  if (plan.stampProvenance) map.provenance = await expectedProvenance(ROOT);
  const serialized = serializeDocsScreenshotMap(map);
  const mapPath = join(ROOT, DOCS_SCREENSHOT_MAP_PATH);
  if ((await readFile(mapPath, 'utf8')) !== serialized) await writeFile(mapPath, serialized);

  report('rewritten because the view changed', linesFor(verdicts, 'changed'));
  report('written because no image was committed yet', linesFor(verdicts, 'absent'));
  console.log(`\n${plan.untouched} frame(s) left alone — their view is unchanged`);
  report('NOT consumed, because this run did not produce them', refused);
  if (plan.provenanceNote) console.log(`\n${plan.provenanceNote}`);
  return plan.exitCode;
}

/** Re-verify the committed frames against a fresh render, writing nothing. */
async function commandCheck() {
  requireChrome();
  const tools = requireImageTools();
  const map = await readDocsScreenshotMap(ROOT);
  const { verdicts, refused } = await renderAndCompare(tools, map.screenshots);

  const stale = linesFor(verdicts, 'changed');
  const absent = linesFor(verdicts, 'absent');
  const drifted = await provenanceDrift(map);

  report('the view has changed since this image was committed', stale);
  report('mapped but no image is committed', absent);
  report('the recorded provenance no longer matches this toolchain', drifted);
  report('NOT verified, because this run did not produce them', refused);
  const problems = stale.length + absent.length + drifted.length + refused.length;
  if (problems === 0) {
    console.log(`\nall ${verdicts.length} committed frame(s) match a fresh render`);
  }
  return problems === 0 ? 0 : 1;
}

const COMMANDS = { plan: commandPlan, generate: commandGenerate, check: commandCheck };
const requested = process.argv[2] ?? 'plan';
const command = COMMANDS[requested];
if (command) {
  try {
    process.exitCode = await command();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
} else {
  console.error(
    `unknown command "${requested}"; expected one of ${Object.keys(COMMANDS).join(', ')}`
  );
  process.exitCode = 1;
}
