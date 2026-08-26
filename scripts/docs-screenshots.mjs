#!/usr/bin/env node
/**
 * Fill the documentation site's generated image slots from the View Lab.
 *
 * A documentation page declares a slot by naming a View Lab case id. This renders those cases,
 * encodes each frame, and rewrites only the ones whose source actually moved.
 *
 *   node scripts/docs-screenshots.mjs plan       what a run would do, without rendering anything
 *   node scripts/docs-screenshots.mjs generate   render, encode what changed, update the map
 *   node scripts/docs-screenshots.mjs check      render and verify the committed digests
 *
 * WHY ONLY WHAT CHANGED
 * ---------------------
 * A generator that rewrites every image on every run produces a diff nobody can review, and a
 * reviewer looking at fifty changed binaries cannot tell a real visual change from re-encoding
 * noise. So the decision is made against a content digest, and the run says out loud which frames
 * it touched and which it left alone.
 *
 * WHY THE DIGEST IS TAKEN OVER THE SOURCE FRAME
 * ---------------------------------------------
 * The digest recorded in the map is of the renderer's own output, not of the published image. That
 * keeps "did this view change" independent of the encoder: an encoder upgrade re-encodes nothing,
 * because nothing the renderer produced moved. Digesting the published image instead would let a
 * libwebp release present itself as fifty visual changes.
 *
 * WHY THIS FAILS CLOSED, THREE WAYS
 * ---------------------------------
 * A wrong documentation screenshot is worse than a stale one, because a reader has no way to tell.
 * So absent harvested Foundry chrome aborts, an absent encoder aborts, and — the subtle one — a
 * frame is consumed only when THIS run produced it. The renderer accumulates into its output
 * directory and collects per-case failures rather than throwing, so a case that failed today can
 * still have yesterday's PNG sitting on disk. Publishing that would ship a frame from an older
 * commit as current documentation, silently. Every mapped case must appear in the manifest this
 * run wrote, stamped with this run's head, and absent from its failures.
 *
 * WHY THERE IS NO CI JOB
 * ----------------------
 * Generation needs harvested Foundry window chrome, which is proprietary and never leaves the
 * maintainer's machine or enters this repository. CI builds and deploys what is committed.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DOCS_SCREENSHOT_MAP_PATH,
  LAB_SCREENSHOT_DIRECTORY,
  expectedProvenance,
  labAssetPath,
  readDocsScreenshotMap,
  serializeDocsScreenshotMap,
} from './lib/docsScreenshotMap.js';
import { missingChromeMessage, resolveChromeCache } from './lib/foundryChromeCache.js';
import { resolveExecutable } from './lib/resolveExecutable.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RENDERER = 'scripts/view-lab-screenshots.mjs';
const RENDER_OUTPUT_DIRECTORY = 'ui-screenshot-artifact/apps';

/**
 * The encoder, and the settings it was chosen with.
 *
 * Measured on a representative frame rather than assumed. Against a 191958-byte source PNG:
 * `-lossless` gives 162794 bytes, a 15% saving that does not pay for the conversion; `-q 95` gives
 * 104454 bytes at 36.74 dB, which is what the quality ladder collapses to on UI text; and
 * `-near_lossless 60` gives 115468 bytes at 57.89 dB. Near-lossless is barely heavier than the
 * lossy setting and visually intact, so it wins on both counts.
 */
const ENCODER = 'cwebp';
const ENCODER_SETTINGS = ['-near_lossless', '60', '-quiet'];

/** Thrown for a condition a user can act on, so the CLI can print it without a stack trace. */
class DocsScreenshotError extends Error {}

/**
 * The harvested Foundry chrome, or an abort naming how to obtain it.
 *
 * Checked here as well as in the renderer so the failure is attributed to this run before it spends
 * five minutes starting a browser, and so `check` refuses for the same reason `generate` does.
 *
 * @returns {{version: string}} The resolved chrome cache.
 */
function requireChrome() {
  const cache = resolveChromeCache(ROOT);
  if (!cache) throw new DocsScreenshotError(missingChromeMessage(ROOT));
  return cache;
}

/**
 * The image encoder, or an abort naming it.
 *
 * @returns {string} Absolute path to the encoder.
 */
function requireEncoder() {
  const executable = resolveExecutable(ENCODER);
  if (!executable) {
    throw new DocsScreenshotError(
      `${ENCODER} is not on PATH, so no documentation frame can be encoded. Install libwebp` +
        ` (winget install Google.Libwebp, brew install webp, or apt install webp) and try again.` +
        ' Nothing was written.'
    );
  }
  return executable;
}

/**
 * Render every mapped case and return the manifest that run wrote.
 *
 * The renderer is spawned rather than imported: it dispatches its own command from `process.argv`
 * at module scope, so importing it would run a capture as a side effect of loading it.
 *
 * @param {string[]} caseIds Case ids to render.
 * @returns {Promise<object>} The manifest this run wrote.
 */
async function renderCases(caseIds) {
  console.log(`rendering ${caseIds.length} case(s) — this takes a few minutes\n`);
  const result = spawnSync(process.execPath, [join(ROOT, RENDERER), 'apps', caseIds.join(',')], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  if (result.error) {
    throw new DocsScreenshotError(`could not run the renderer: ${result.error.message}`);
  }

  const manifestPath = join(ROOT, RENDER_OUTPUT_DIRECTORY, 'manifest.json');
  if (!existsSync(manifestPath)) {
    throw new DocsScreenshotError(
      `the renderer wrote no manifest to ${RENDER_OUTPUT_DIRECTORY}, so nothing this run produced` +
        ' can be identified. Nothing was written.'
    );
  }
  return JSON.parse(await readFile(manifestPath, 'utf8'));
}

/**
 * Split the mapped cases into the frames this run produced and the ones it did not.
 *
 * The head comparison is the whole point: without it a case that failed today would be served from
 * whatever the renderer left on disk at some earlier commit, and published as current
 * documentation with nothing to show it was stale.
 *
 * @param {object} manifest The manifest this run wrote.
 * @param {string[]} caseIds Case ids the map declares.
 * @returns {{usable: Map<string, string>, refused: string[]}} Usable case ids to source PNG paths,
 *   and a line per refused case saying why.
 */
function consumableFrames(manifest, caseIds) {
  if (!manifest.head) {
    throw new DocsScreenshotError(
      'the renderer could not record the commit each frame was rendered at, so a frame left over' +
        ' from an earlier run cannot be told from one this run produced. Nothing was written.'
    );
  }

  const rendered = new Map((manifest.frames ?? []).map((frame) => [frame.id, frame]));
  const failed = new Set((manifest.failures ?? []).map((failure) => failure.id));
  const usable = new Map();
  const refused = [];

  for (const caseId of caseIds) {
    const source = join(ROOT, RENDER_OUTPUT_DIRECTORY, `${caseId}.png`);
    const frame = rendered.get(caseId);
    if (failed.has(caseId)) refused.push(`${caseId}: the renderer reported a failure for it`);
    else if (!frame) refused.push(`${caseId}: this run rendered no frame for it`);
    else if (frame.head !== manifest.head) {
      refused.push(`${caseId}: its frame is left over from ${frame.head}, not this run`);
    } else if (existsSync(source)) usable.set(caseId, source);
    else refused.push(`${caseId}: the manifest lists it but its frame is not on disk`);
  }

  return { usable, refused };
}

/**
 * The SHA-256 of a file, lowercase hex.
 *
 * @param {string} path Absolute file path.
 * @returns {Promise<string>} The digest.
 */
async function digestOf(path) {
  return createHash('sha256')
    .update(await readFile(path))
    .digest('hex');
}

/**
 * Encode one source frame into its committed asset.
 *
 * @param {string} encoder Absolute encoder path.
 * @param {string} source Absolute source PNG path.
 * @param {string} target Absolute asset path.
 * @returns {void}
 */
function encodeFrame(encoder, source, target) {
  const result = spawnSync(encoder, [...ENCODER_SETTINGS, '-o', target, source], {
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  if (result.status !== 0) {
    throw new DocsScreenshotError(`${ENCODER} failed on ${source} (exit ${result.status})`);
  }
}

/** Print a heading and its lines, or nothing at all when there are none. */
function report(heading, lines) {
  if (lines.length === 0) return;
  console.log(`\n${heading} (${lines.length}):`);
  for (const line of lines) console.log(`  ${line}`);
}

/**
 * Say what a run would do, without starting a browser.
 *
 * @returns {Promise<number>} Exit code.
 */
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
  console.log(`${ENCODER}: ${resolveExecutable(ENCODER) ? 'ready' : 'ABSENT, so a run aborts'}`);
  if (drifted.length === 0 && absent.length === 0) {
    console.log('\nnothing is known to need rewriting, but only a run can tell you that for sure');
  }
  return 0;
}

/**
 * Render every mapped case and hand back this run's digests.
 *
 * @param {object[]} screenshots Map entries.
 * @returns {Promise<{digests: Map<string, string>, refused: string[]}>} Digest per usable case id,
 *   and a line per case this run could not produce.
 */
async function renderAndDigest(screenshots) {
  const caseIds = screenshots.map((entry) => entry.case);
  const manifest = await renderCases(caseIds);
  const { usable, refused } = consumableFrames(manifest, caseIds);
  const digests = new Map();
  for (const [caseId, source] of usable) digests.set(caseId, await digestOf(source));
  return { digests, refused };
}

/**
 * Render, rewrite what moved, and leave the rest alone.
 *
 * @returns {Promise<number>} Exit code.
 */
async function commandGenerate() {
  requireChrome();
  const encoder = requireEncoder();
  const map = await readDocsScreenshotMap(ROOT);
  const { digests, refused } = await renderAndDigest(map.screenshots);
  await mkdir(join(ROOT, LAB_SCREENSHOT_DIRECTORY), { recursive: true });

  const changed = [];
  const written = [];
  const untouched = [];
  for (const entry of map.screenshots) {
    const digest = digests.get(entry.case);
    if (!digest) continue;
    const target = join(ROOT, labAssetPath(entry.case));
    const moved = digest !== entry.sha256;
    if (!moved && existsSync(target)) {
      untouched.push(entry.case);
      continue;
    }
    encodeFrame(encoder, join(ROOT, RENDER_OUTPUT_DIRECTORY, `${entry.case}.png`), target);
    entry.sha256 = digest;
    (moved ? changed : written).push(entry.case);
  }

  map.provenance = await expectedProvenance(ROOT);
  const serialized = serializeDocsScreenshotMap(map);
  const mapPath = join(ROOT, DOCS_SCREENSHOT_MAP_PATH);
  if ((await readFile(mapPath, 'utf8')) !== serialized) await writeFile(mapPath, serialized);

  report('rewritten because the view changed', changed);
  report('written because no image was committed yet', written);
  console.log(`\n${untouched.length} frame(s) left alone — their view is unchanged`);
  report('NOT consumed, because this run did not produce them', refused);
  return refused.length === 0 ? 0 : 1;
}

/**
 * Re-verify the committed digests against a fresh render, writing nothing.
 *
 * @returns {Promise<number>} Exit code.
 */
async function commandCheck() {
  requireChrome();
  requireEncoder();
  const map = await readDocsScreenshotMap(ROOT);
  const { digests, refused } = await renderAndDigest(map.screenshots);

  const stale = [];
  const absent = [];
  for (const entry of map.screenshots) {
    const digest = digests.get(entry.case);
    if (digest && digest !== entry.sha256) {
      stale.push(`${entry.case}: recorded ${entry.sha256}, rendered ${digest}`);
    }
    if (!existsSync(join(ROOT, labAssetPath(entry.case)))) absent.push(entry.case);
  }

  const expected = await expectedProvenance(ROOT);
  const drifted = Object.entries(expected)
    .filter(([key, value]) => map.provenance[key] !== value)
    .map(([key, value]) => `${key}: recorded ${map.provenance[key] ?? 'nothing'}, now ${value}`);

  report('the view has changed since this image was committed', stale);
  report('mapped but no image is committed', absent);
  report('the recorded provenance no longer matches this toolchain', drifted);
  report('NOT verified, because this run did not produce them', refused);
  const problems = stale.length + absent.length + drifted.length + refused.length;
  if (problems === 0) console.log(`\nall ${digests.size} committed frame(s) match a fresh render`);
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
