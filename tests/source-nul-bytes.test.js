/**
 * No tracked source file under `src/` carries a NUL byte (issue 1599). Git treats such a file as
 * binary, so it never diffs or merges as text, and a literal NUL is always writable as the `'\0'`
 * escape instead.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const REPOSITORY_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const TEXT_EXTENSIONS = ['.js', '.mjs', '.svelte', '.json'];

/** Every tracked text source under a directory, as repository-relative paths. */
function trackedFiles(directory) {
  return execFileSync('git', ['ls-files', '-z', '--', directory], {
    cwd: REPOSITORY_ROOT,
    encoding: 'utf8',
    maxBuffer: 1 << 26,
  })
    .split('\0')
    .filter((file) => TEXT_EXTENSIONS.includes(path.extname(file)));
}

/** The repository-relative paths among `files` whose bytes include a NUL. */
function filesWithNul(files, root = REPOSITORY_ROOT) {
  return files.filter((file) => readFileSync(path.resolve(root, file)).includes(0));
}

test('no tracked file under src/ contains a NUL byte', () => {
  const files = trackedFiles('src');
  assert.ok(files.length > 500, `expected the tracked src/ corpus, listed ${files.length} files`);
  // ratchet-exempt(source-pin): a byte scan of every tracked file, asserting no code shape
  const withNul = filesWithNul(files);
  assert.deepEqual(
    withNul,
    [],
    String.raw`write a NUL as the '\0' escape: a literal one makes git treat the file as binary, so it never diffs or merges as text`
  );
});

test('the NUL scan flags a file that carries one', (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), 'nul-scan-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  writeFileSync(path.join(directory, 'with-nul.js'), Buffer.from([0x61, 0x00, 0x62]));
  writeFileSync(path.join(directory, 'clean.js'), 'ab');
  assert.deepEqual(
    filesWithNul(
      [path.join(directory, 'with-nul.js'), path.join(directory, 'clean.js')],
      directory
    ),
    [path.join(directory, 'with-nul.js')]
  );
});
