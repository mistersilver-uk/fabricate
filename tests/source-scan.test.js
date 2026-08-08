/**
 * Direct proof for the shared working-tree walk in `tests/helpers/sourceScan.js`.
 *
 * The walk's deliverable is not the corpus — four gates already fail loudly if that goes wrong.
 * It is the ATTRIBUTION of the two syscalls it makes, because the failure this helper exists to
 * eliminate is a bare `ENOENT ... scandir`/`open` naming a path and nothing else, which cost ~25
 * minutes to diagnose the one time it happened. An attributed message is only a deliverable if
 * something fails when it stops being said, and nothing did: the wording sits on error paths that
 * a passing corpus scan never reaches.
 *
 * Proved HERE — once — rather than in each of the four gates that walk the tree, the same choice
 * (and the same reason) as `stripComments`, which `tests/quantity-literal-gate.test.js` proves for
 * both literal gates. `tests/helpers/` is outside the `npm test` glob; `tests/*.test.js` is inside
 * it, so this file runs and the helper it imports does not run as a suite of its own.
 *
 * Two of the four messages describe a race — a file or a directory removed between its own listing
 * and its own read — which a test cannot schedule. Those two are proved by calling the guard
 * directly against a real, real-filesystem ENOENT; the other two are proved end to end through
 * `collectWorkingTreeSources`, which is what pins the call sites to the right one of the pair.
 */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  collectWorkingTreeSources,
  readListedSource,
  readScannedDirectory,
  repoRoot,
} from './helpers/sourceScan.js';

/** A throwaway tree of `{ relative path: text }`, and a disposer. */
function withTempTree(files, run) {
  const root = mkdtempSync(path.join(tmpdir(), 'fabricate-source-scan-'));
  try {
    for (const [file, text] of Object.entries(files)) {
      const full = path.join(root, file);
      mkdirSync(path.dirname(full), { recursive: true });
      writeFileSync(full, text, 'utf8');
    }
    return run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/** A path that cannot exist, used where the point is the ENOENT rather than the name. */
const ABSENT = 'no-such-path-e3b0c442';

// The positive control. Everything below asserts on a failure message, so without this the whole
// file could pass against a walk that reads nothing at all — the vacuity these gates keep finding.
// The nested key is load-bearing twice: it proves the walk RECURSES, which is the only reason the
// recursive listing (and therefore its attribution) exists.
test('collects nested files under a root into one code-point-ordered corpus', () => {
  const corpus = withTempTree(
    {
      'top.js': 'top\n',
      'nested/deep/leaf.svelte': 'leaf\n',
      'nested/ignored.txt': 'not a scanned extension\n',
    },
    (root) => collectWorkingTreeSources([root], ['.js', '.svelte'])
  );

  const files = Object.keys(corpus);
  assert.equal(files.length, 2, `expected exactly the two scanned files, got ${files.join(', ')}`);
  assert.ok(
    files.some((file) => file.endsWith('nested/deep/leaf.svelte')),
    `expected the walk to descend two levels, got ${files.join(', ')}`
  );
  assert.deepEqual([...files].sort(), files, 'the corpus must be returned in path order');
  assert.deepEqual(Object.values(corpus).toSorted(), ['leaf\n', 'top\n']);
});

test('names the caller-supplied root when the root itself is not there', () => {
  assert.throws(
    () => collectWorkingTreeSources([ABSENT], ['.js']),
    (error) => {
      assert.match(
        error.message,
        new RegExp(`root that is not there: "${ABSENT}"`),
        `a missing root must name itself, got: ${error.message}`
      );
      assert.match(
        error.message,
        /Re-running tells you which/,
        'a missing root has two possible causes with opposite remedies, so the message must not' +
          ' pick one — that is the defect the exit-2 note in prettier-svelte-scope.test.js had'
      );
      assert.equal(error.cause?.code, 'ENOENT', 'the original ENOENT must survive as the cause');
      return true;
    }
  );
});

test('attributes a directory that vanished mid-walk to the moving worktree', () => {
  // Called directly: reaching this through the walk needs a directory to be removed between its
  // parent's listing and its own, in the same synchronous call stack.
  assert.throws(
    () => readScannedDirectory(path.join(repoRoot, 'src', ABSENT), { isRoot: false }),
    (error) => {
      assert.match(
        error.message,
        /was listed by its parent but had gone by the time the walk descended into it/,
        `a vanished directory must say the tree moved, got: ${error.message}`
      );
      assert.match(error.message, /re-run/, 'and must name the remedy');
      assert.match(error.message, new RegExp(`src/${ABSENT}`), 'and must name the directory');
      assert.equal(error.cause?.code, 'ENOENT', 'the original ENOENT must survive as the cause');
      return true;
    }
  );
});

test('attributes a file that vanished mid-walk to the moving worktree', () => {
  assert.throws(
    () => readListedSource(path.join(repoRoot, 'src', ABSENT), `src/${ABSENT}`),
    (error) => {
      assert.match(
        error.message,
        /was listed by the directory walk but had gone by the time it was read/,
        `a vanished file must say the tree moved, got: ${error.message}`
      );
      assert.equal(error.cause?.code, 'ENOENT', 'the original ENOENT must survive as the cause');
      return true;
    }
  );
});

test('tells a dangling symbolic link apart from a moving worktree', (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'fabricate-source-scan-'));
  try {
    try {
      symlinkSync(path.join(root, `${ABSENT}.js`), path.join(root, 'dangling.js'));
    } catch (cause) {
      // Windows refuses symlink creation without developer mode or elevation. Skipping is honest;
      // asserting nothing while reporting a pass is not.
      t.skip(`this platform will not create a symbolic link (${cause.code})`);
      return;
    }
    assert.throws(
      () => collectWorkingTreeSources([root], ['.js']),
      (error) => {
        assert.match(
          error.message,
          /is a symbolic link whose target does not exist/,
          `a dangling link fails ENOENT forever, so it must not be reported as a race, got:` +
            ` ${error.message}`
        );
        assert.match(
          error.message,
          /re-running will produce exactly this failure again/,
          'and must say so, because the other branch sends its reader round a re-run loop'
        );
        assert.equal(error.cause?.code, 'ENOENT', 'the original ENOENT must survive as the cause');
        return true;
      }
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('never rewrites a listing failure that is not ENOENT', () => {
  // An existing path cannot report ENOENT, so this is a stable way to reach the rethrow: every
  // platform answers `readdir` on a file with something else (ENOTDIR here). Swallowing or
  // re-labelling it would be the same defect in the other direction — a real error described as a
  // moving worktree, with a re-run that cannot help.
  assert.throws(
    () => readScannedDirectory(path.join(repoRoot, 'package.json'), { isRoot: true }),
    (error) => {
      assert.notEqual(error.code, 'ENOENT', 'reading an existing path cannot be ENOENT');
      assert.ok(
        !/corpus scan/.test(error.message),
        `a non-ENOENT failure must reach the caller untouched, got: ${error.message}`
      );
      return true;
    }
  );
});
