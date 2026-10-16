/**
 * The design-system register measured at the merge base (issue 1495). A count is not pinned to a
 * literal a PR hand-edits: it is asserted equal to the count at the base plus the keys the PR's own
 * diff adds and removes, so two sibling PRs never collide on a number. Resolution, the
 * `RATCHET_BASE` override and the CI failure modes are the merge-base ratchet's own.
 */
import assert from 'node:assert/strict';

import headManifestJson from '../../scripts/lib/designSystemPrimitives.json' with { type: 'json' };

import { byCodePoint } from './codePointOrder.js';
import { parseDesignLibrary } from './designLibrary.js';
import { changedPaths, readBaseFiles, resolveRatchetBase } from './mergeBaseRatchet.js';

export const MANIFEST_FILE = 'scripts/lib/designSystemPrimitives.json';
export const LIBRARY_FILE = 'openspec/specs/design-system/library.html';

/**
 * The directory `AGENTS.md` and `spec.md` both name when they prohibit an unrecorded primitive:
 * its every top-level `.svelte` file must carry a manifest row. Its `startsWith` test decides only
 * where a row is compulsory (issue 1481 item 2); a component in a nested `apps/manager` directory
 * may hold a row and is not compelled to.
 */
export const PRIMITIVE_DIRECTORY = 'src/ui/svelte/components/';

export const isPrimitiveFile = (file) =>
  file.startsWith(PRIMITIVE_DIRECTORY) &&
  file.endsWith('.svelte') &&
  !file.slice(PRIMITIVE_DIRECTORY.length).includes('/');

// Read once per process: each test file runs in its own process, so the base cannot change under
// it. A test that varies RATCHET_BASE in-process would need to clear this.
let cached;

/**
 * The register at the base and the primitive files the working tree added or removed since.
 *
 * @returns {{skipped: string} | {manifest: object, library: object, files: {added: string[],
 *   removed: string[]}}} `skipped` names why no base was available (never in CI)
 */
export function registerBase() {
  if (cached) return cached;
  const base = resolveRatchetBase();
  if (base.skipped) return (cached = { skipped: base.reason });
  const texts = readBaseFiles(base, [MANIFEST_FILE, LIBRARY_FILE]);
  const manifestText = texts.get(MANIFEST_FILE);
  const libraryText = texts.get(LIBRARY_FILE);
  assert.ok(manifestText && libraryText, `the register is absent at base ${base.sha}`);
  const changes = changedPaths(base);
  const added = new Set(changes.added.filter(isPrimitiveFile));
  const removed = new Set(changes.removed.filter(isPrimitiveFile));
  for (const [to, from] of changes.renames) {
    if (isPrimitiveFile(to)) added.add(to);
    if (isPrimitiveFile(from)) removed.add(from);
  }
  return (cached = {
    manifest: JSON.parse(manifestText),
    library: parseDesignLibrary(libraryText),
    files: { added: [...added].sort(byCodePoint), removed: [...removed].sort(byCodePoint) },
  });
}

/** The head manifest, parsed by the JSON loader, not by the module under test. */
export const headManifest = () => headManifestJson;

const distinctKeys = (keys) => {
  const set = new Set(keys);
  assert.equal(set.size, keys.length, `duplicate keys: ${keys.join(', ')}`);
  return set;
};

/**
 * Assert a count equals its base count plus the keys the diff adds, minus those it removes.
 *
 * @param {string} label what is counted, for the failure message
 * @param {string[]} baseKeys the keys at the base
 * @param {string[]} headKeys the keys at HEAD, from a source independent of `headCount`
 * @param {number} headCount the count the code under test reports at HEAD
 */
export function assertMovedByDiff(label, baseKeys, headKeys, headCount) {
  const base = distinctKeys(baseKeys);
  const head = distinctKeys(headKeys);
  const added = [...head].filter((key) => !base.has(key));
  const removed = [...base].filter((key) => !head.has(key));
  assert.equal(
    headCount,
    base.size + added.length - removed.length,
    `${label}: ${headCount} at HEAD, but the base holds ${base.size} and the diff adds ` +
      `[${added.join(', ')}] and removes [${removed.join(', ')}]`
  );
}
