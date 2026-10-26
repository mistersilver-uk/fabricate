/**
 * No tracked file under `src/` carries a NUL byte (issue 1599). Tools that sniff for binary input,
 * GNU grep among them, read such a file as no lines at all, and a literal NUL is always writable
 * as the `'\0'` escape instead.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const REPOSITORY_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Every tracked file under a directory, as repository-relative paths. */
function trackedFiles(directory) {
  return execFileSync('git', ['ls-files', '-z', '--', directory], {
    cwd: REPOSITORY_ROOT,
    encoding: 'utf8',
    maxBuffer: 1 << 26,
  })
    .split('\0')
    .filter(Boolean);
}

/** The repository-relative paths among `files` whose bytes include a NUL. */
function filesWithNul(files) {
  return files.filter((file) => readFileSync(path.join(REPOSITORY_ROOT, file)).includes(0));
}

test('no tracked file under src/ contains a NUL byte', () => {
  const files = trackedFiles('src');
  assert.ok(files.length > 500, `expected the tracked src/ corpus, listed ${files.length} files`);
  // ratchet-exempt(source-pin): a byte scan of every tracked file, asserting no code shape
  const withNul = filesWithNul(files);
  assert.deepEqual(
    withNul,
    [],
    String.raw`write a NUL as the '\0' escape: a literal one makes the file binary to the forward-port gate`
  );
});
