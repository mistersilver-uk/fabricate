/**
 * The demo capture's output directory (issue 2571): which directories it may write into, and the
 * only files it ever replaces there.
 */
import { existsSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';

/** The only files the capture writes, and so the only ones it ever replaces. */
export const FRAME_FILE = /^\d{4}\.png$/;
export const MANIFEST_FILE = 'manifest.json';
export const STAGING_PREFIX = '.demo-capture-';

/**
 * Refuse an output directory the capture could not have written: the repository root or one of
 * its ancestors, or a directory holding anything but a manifest, numbered frames and staging.
 *
 * @param {string} output Absolute output directory.
 * @param {string} root Absolute repository root.
 * @throws {Error} Naming the directory and why it is refused.
 */
export function assertSafeOutput(output, root) {
  // An absolute answer means another drive, which cannot contain the repository.
  const toRoot = relative(output, root);
  if (toRoot === '' || !(toRoot.startsWith('..') || isAbsolute(toRoot))) {
    throw new Error(`refusing to write into ${output}: it is the repository root or contains it`);
  }
  if (!existsSync(output)) return;
  // Every entry, not any: a foreign directory may well hold a `manifest.json` of its own.
  const ours = readdirSync(output).every(
    (name) => name === MANIFEST_FILE || FRAME_FILE.test(name) || name.startsWith(STAGING_PREFIX)
  );
  if (!ours) {
    throw new Error(`refusing to write into ${output}: it holds files this tool did not write`);
  }
}

/**
 * Replace the previous set's frames and manifest with the new set, touching nothing else.
 *
 * @param {string} staging The directory the new set was written to.
 * @param {string} output The directory the set is published in.
 */
export function publishFrames(staging, output) {
  for (const name of readdirSync(output)) {
    if (name === MANIFEST_FILE || FRAME_FILE.test(name)) rmSync(join(output, name));
  }
  for (const name of readdirSync(staging)) renameSync(join(staging, name), join(output, name));
}

/**
 * Remove staging directories an interrupted run left behind, which a Ctrl-C leaves because it
 * skips the run's own cleanup.
 *
 * @param {string} output The output directory.
 */
export function removeStaleStaging(output) {
  if (!existsSync(output)) return;
  for (const name of readdirSync(output)) {
    if (name.startsWith(STAGING_PREFIX))
      rmSync(join(output, name), { recursive: true, force: true });
  }
}
