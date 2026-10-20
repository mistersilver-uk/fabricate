/** The demo capture writes only into a directory it owns, and replaces only its own files (2571). */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import {
  assertSafeOutput,
  publishFrames,
  removeStaleStaging,
} from '../scripts/lib/demoCaptureOutput.js';

/** A scratch tree holding a fake repository root, removed when the test ends. */
function scratch(t) {
  const base = mkdtempSync(join(tmpdir(), 'demo-capture-output-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const root = join(base, 'repo');
  mkdirSync(root);
  return { base, root };
}

/** A directory holding exactly `files`, each written with its own name as content. */
function directoryWith(path, files) {
  mkdirSync(path, { recursive: true });
  for (const name of files) writeFileSync(join(path, name), name);
  return path;
}

test('the repository root and its ancestors are refused', (t) => {
  const { root } = scratch(t);
  assert.throws(() => assertSafeOutput(root, root), /repository root or contains it/);
  assert.throws(() => assertSafeOutput(dirname(root), root), /repository root or contains it/);
  assert.doesNotThrow(() => assertSafeOutput(join(root, 'tmp', 'demo-frames'), root));
});

test('a foreign directory is refused, even when it holds a manifest.json', (t) => {
  const { base, root } = scratch(t);
  const foreign = directoryWith(join(base, 'extension'), ['manifest.json', 'background.js']);
  assert.throws(() => assertSafeOutput(foreign, root), /did not write/);
  const unrelated = directoryWith(join(base, 'img'), ['hero.gif']);
  assert.throws(() => assertSafeOutput(unrelated, root), /did not write/);
});

test('a directory holding only an earlier set, or nothing, is accepted', (t) => {
  const { base, root } = scratch(t);
  const owned = directoryWith(join(base, 'frames'), ['manifest.json', '0001.png', '0002.png']);
  mkdirSync(join(owned, '.demo-capture-abc'));
  assert.doesNotThrow(() => assertSafeOutput(owned, root));
  assert.doesNotThrow(() => assertSafeOutput(directoryWith(join(base, 'empty'), []), root));
  assert.doesNotThrow(() => assertSafeOutput(join(base, 'missing'), root));
});

test('publishing replaces only the frames and manifest, and stale staging is cleared', (t) => {
  const { base } = scratch(t);
  const output = directoryWith(join(base, 'frames'), ['manifest.json', '0001.png', '0002.png']);
  mkdirSync(join(output, '.demo-capture-stale'));
  removeStaleStaging(output);
  assert.ok(
    !existsSync(join(output, '.demo-capture-stale')),
    'a stale staging directory is removed'
  );
  const staging = directoryWith(join(output, '.demo-capture-new'), ['manifest.json', '0001.png']);
  publishFrames(staging, output);
  assert.deepEqual(
    readdirSync(output).toSorted((a, b) => a.localeCompare(b)),
    ['.demo-capture-new', '0001.png', 'manifest.json']
  );
  assert.deepEqual(readdirSync(staging), [], 'the new set moved out of staging');
});
