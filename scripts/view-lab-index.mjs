#!/usr/bin/env node
/**
 * Write the View Lab's local index page.
 *
 * IO only — every decision lives in `scripts/lib/viewLabIndex.js`, which is pure and tested. This
 * reads the capture manifest, reconciles it against what is actually on disk, and writes one
 * self-contained `index.html` beside the frames.
 *
 * Runs automatically at the end of a capture, so the page is never stale relative to the PNGs next
 * to it, and can be re-run on its own after a partial capture.
 *
 *   node scripts/view-lab-index.mjs [--dir ui-screenshot-artifact/apps]
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { VIEW_LAB_CASES } from './lib/viewLabCases.js';
import { groupFrames, renderIndexHtml, summarise } from './lib/viewLabIndex.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Frames to index: the manifest's list, filtered to those whose PNG exists.
 *
 * The manifest is the source of dimensions and ordering, but a frame it records is not necessarily
 * on disk — a partial capture, or a manual delete, leaves the two disagreeing. An index entry
 * pointing at a missing file renders a broken image, which reads as a capture bug.
 *
 * When there is no manifest at all the directory is walked instead, so the page still works for
 * someone who has PNGs from an older run.
 *
 * @param {string} dir Absolute output directory.
 * @returns {{frames: object[], foundryVersion: string|null}} Frames and provenance.
 */
function readFrames(dir) {
  const manifestPath = join(dir, 'manifest.json');
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const frames = (manifest.frames ?? []).filter((frame) =>
      existsSync(join(dir, `${frame.id}.png`))
    );
    return { frames, foundryVersion: manifest.foundryVersion ?? null };
  }

  const frames = readdirSync(dir)
    .filter((name) => name.endsWith('.png'))
    .map((name) => ({ id: name.replace(/\.png$/, '') }));
  return { frames, foundryVersion: null };
}

function main() {
  const dirArgument = process.argv.indexOf('--dir');
  const relative =
    dirArgument === -1 ? 'ui-screenshot-artifact/apps' : process.argv[dirArgument + 1];
  const dir = resolve(ROOT, relative);

  if (!existsSync(dir)) {
    console.error(`no capture directory at ${relative} — run the capture first`);
    return 1;
  }

  const { frames, foundryVersion } = readFrames(dir);
  if (frames.length === 0) {
    console.error(`no frames found in ${relative}`);
    return 1;
  }

  const html = renderIndexHtml({
    sections: groupFrames(frames, VIEW_LAB_CASES),
    counts: summarise(frames, VIEW_LAB_CASES),
    foundryVersion,
  });

  const target = join(dir, 'index.html');
  writeFileSync(target, html);
  console.log(`wrote ${relative}/index.html — ${frames.length} frames`);
  return 0;
}

process.exitCode = main();
