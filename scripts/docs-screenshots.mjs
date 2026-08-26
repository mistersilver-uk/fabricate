#!/usr/bin/env node
/**
 * Fill the documentation site's generated image slots from the View Lab.
 *
 * A documentation page declares a slot by naming a View Lab case id. This renders those cases,
 * encodes each frame, and rewrites only the ones whose source actually moved.
 *
 *   node scripts/docs-screenshots.mjs plan       what a run would do, without rendering anything
 *   node scripts/docs-screenshots.mjs generate   render, encode what changed, update the map
 *   node scripts/docs-screenshots.mjs check      render and verify the committed frames
 *
 * WHY ONLY WHAT CHANGED
 * ---------------------
 * A generator that rewrites every image on every run produces a diff nobody can review, and a
 * reviewer looking at fifty changed binaries cannot tell a real visual change from re-encoding
 * noise. So the run says out loud which frames it touched and which it left alone.
 *
 * WHY THE DECISION IS PERCEPTUAL RATHER THAN A DIGEST COMPARISON
 * --------------------------------------------------------------
 * The obvious mechanism is a content digest of the renderer's output, and it was implemented,
 * measured, and found to be wrong: this renderer is not byte-deterministic. Repeated clean renders
 * of the same case set differ in a handful of frames by a few antialiased pixels, and the
 * differing set moves between runs rather than settling. A digest comparison therefore reports
 * roughly a tenth of the set as changed on every run forever, which is exactly the churn this
 * generator exists to prevent. The comparison lives in `scripts/lib/webpFrames.js`, which carries
 * the measurements the tolerance was derived from.
 *
 * WHAT THE RECORDED DIGEST IS FOR, THEN
 * -------------------------------------
 * `sha256` in the map is the provenance of the render that produced the committed asset — which
 * frame this image came from — and it is deliberately taken over the renderer's PNG rather than
 * over the published WebP, so that a libwebp release cannot present itself as fifty visual
 * changes. It moves only when a frame is actually rewritten. It is not, and after the measurement
 * above cannot be, the mechanism that decides whether to rewrite.
 *
 * WHY THIS FAILS CLOSED, THREE WAYS
 * ---------------------------------
 * A wrong documentation screenshot is worse than a stale one, because a reader has no way to tell.
 * So absent harvested Foundry chrome aborts, an absent encoder or decoder aborts, and — the subtle
 * one — a frame is consumed only when THIS run produced it. The renderer accumulates into its output
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
import { missingChromeMessage, resolveChromeCache } from './lib/foundryChromeCache.js';
import { resolveExecutable } from './lib/resolveExecutable.js';
import { DECODER, ENCODER, compareEncodedFrames, encodeFrame } from './lib/webpFrames.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RENDERER = 'scripts/view-lab-screenshots.mjs';
const RENDER_OUTPUT_DIRECTORY = 'ui-screenshot-artifact/apps';

/**
 * Where this run's freshly encoded frames go before anything decides to publish them.
 *
 * Beside the renderer's own output, which is already gitignored and already the place a human
 * looks when a run surprises them. A frame lands here whether or not it turns out to differ, so
 * "what did this run actually produce" is answerable after the fact.
 */
const ENCODE_OUTPUT_DIRECTORY = 'ui-screenshot-artifact/docs-frames';

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
 * The libwebp tools, or an abort naming what is missing.
 *
 * Both are required, and `dwebp` is required even by a run that ends up encoding nothing: it is
 * what turns "these two WebPs differ" into "this view changed", so without it the only comparison
 * available is byte equality — which this renderer's own jitter fails on roughly a tenth of the
 * set. A run that quietly fell back to byte equality would rewrite those frames and report them as
 * visual changes, so this fails closed instead.
 *
 * @returns {{encoder: string, decoder: string}} Absolute paths to both tools.
 */
function requireImageTools() {
  const encoder = resolveExecutable(ENCODER);
  const decoder = resolveExecutable(DECODER);
  const missing = [!encoder && ENCODER, !decoder && DECODER].filter(Boolean);
  if (missing.length > 0) {
    throw new DocsScreenshotError(
      `${missing.join(' and ')} ${missing.length === 1 ? 'is' : 'are'} not on PATH, so a` +
        ' documentation frame can neither be encoded nor compared against the committed one.' +
        ' Install libwebp (winget install Google.Libwebp, brew install webp, or apt install webp)' +
        ' and try again. Nothing was written.'
    );
  }
  return { encoder, decoder };
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
 *
 * Shared by `generate` and `check` deliberately: the two verbs must agree about what "changed"
 * means, and a `check` that judged frames differently from the `generate` that wrote them would be
 * a gate reporting on a rule nothing implements.
 *
 * @param {{encoder: string, decoder: string}} tools Absolute libwebp tool paths.
 * @param {object[]} screenshots Map entries.
 * @returns {Promise<{verdicts: object[], refused: string[]}>} One verdict per frame this run
 *   produced, and a line per case it did not.
 */
async function renderAndCompare(tools, screenshots) {
  const caseIds = screenshots.map((entry) => entry.case);
  const manifest = await renderCases(caseIds);
  const { usable, refused } = consumableFrames(manifest, caseIds);
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

/**
 * Render, rewrite what moved, and leave the rest alone.
 *
 * A frame is republished by copying THIS run's encode over the committed one, rather than by
 * re-encoding the source a second time. One encode per frame per run means the bytes that were
 * compared are the bytes that get committed, so a rewrite cannot disagree with the comparison that
 * asked for it.
 *
 * @returns {Promise<number>} Exit code.
 */
async function commandGenerate() {
  requireChrome();
  const tools = requireImageTools();
  const map = await readDocsScreenshotMap(ROOT);
  const { verdicts, refused } = await renderAndCompare(tools, map.screenshots);
  await mkdir(join(ROOT, LAB_SCREENSHOT_DIRECTORY), { recursive: true });

  for (const verdict of verdicts) {
    if (verdict.state === 'unchanged') continue;
    await copyFile(verdict.fresh, join(ROOT, labAssetPath(verdict.entry.case)));
    verdict.entry.sha256 = await digestOf(verdict.source);
  }

  map.provenance = await expectedProvenance(ROOT);
  const serialized = serializeDocsScreenshotMap(map);
  const mapPath = join(ROOT, DOCS_SCREENSHOT_MAP_PATH);
  if ((await readFile(mapPath, 'utf8')) !== serialized) await writeFile(mapPath, serialized);

  report('rewritten because the view changed', linesFor(verdicts, 'changed'));
  report('written because no image was committed yet', linesFor(verdicts, 'absent'));
  const untouched = verdicts.filter((verdict) => verdict.state === 'unchanged').length;
  console.log(`\n${untouched} frame(s) left alone — their view is unchanged`);
  report('NOT consumed, because this run did not produce them', refused);
  return refused.length === 0 ? 0 : 1;
}

/**
 * Re-verify the committed frames against a fresh render, writing nothing.
 *
 * @returns {Promise<number>} Exit code.
 */
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
