/**
 * Shared filesystem + comment-stripping primitives for the `src/**` regression gates
 * (issue 1024) and for any gate that needs the working tree as a corpus (issue 1017).
 *
 * Two gates police `src/**` for a re-hardcoded literal — `quantity-literal-gate.test.js`
 * and `actor-type-literal-gate.test.js` — and each one needs the same two things: the
 * whole scannable tree as a `{ path: text }` corpus, and comment text blanked before
 * matching. `collectWorkingTreeSources` serves the third shape of that need: several
 * roots at once, the caller's own extensions, and one source of truth rather than the
 * git index and the working tree consulted in the same breath.
 *
 * They live here rather than in either gate for two reasons. `collectSources` was
 * duplicated byte-for-byte, which the SonarCloud duplication gate counts. And a gate
 * importing the OTHER gate to borrow `stripComments` would auto-run that gate's tests
 * inside the importer's file, so a single failure would be reported twice under two
 * different suite names.
 *
 * This file is deliberately NOT named `*.test.js`: `tests/helpers/` is outside the
 * `npm test` glob, so nothing here is collected as a suite. Its own guarantees are
 * proved from inside the glob by `tests/source-scan.test.js` — in particular the four
 * attributed failure messages below (two per guarded syscall), which no passing corpus
 * scan ever reaches.
 */

import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/** The repo root, resolved from this file's own location. */
export const repoRoot = resolve(import.meta.dirname, '..', '..');

/** The extensions both gates scan. `.svelte` is load-bearing — real call sites live there. */
export const SCANNED_EXTENSIONS = Object.freeze(['.js', '.mjs', '.svelte']);

/**
 * Blank out comment text, preserving line and column positions.
 *
 * Both gates strip comments before matching, and that is a design decision rather than a
 * convenience. Modules that hold (or held) a real call site also DESCRIBE the retired
 * spelling in prose, because naming the literal is how this design is documented. A gate
 * that flagged prose would be answered with a file-level allowlist — which would exempt
 * exactly the modules the gate exists to police.
 *
 * Quote state is tracked so a `//` inside a string literal is not read as a comment, and
 * it RESETS at every newline. That reset is deliberate: an unbalanced quote inside a
 * regular expression (`/['"]/`) would otherwise put the scanner into string state and
 * swallow the rest of the file, which is exactly how a gate goes quietly vacuous. Bounded
 * this way, such a mistake can only affect its own line.
 *
 * @param {string} source
 * @returns {string} The source with comment characters replaced by spaces.
 */
export function stripComments(source) {
  let inBlockComment = false;
  return String(source ?? '')
    .split('\n')
    .map((line) => {
      let out = '';
      let index = 0;
      let quote = null;
      while (index < line.length) {
        const character = line[index];
        const next = line[index + 1];
        if (inBlockComment) {
          if (character === '*' && next === '/') {
            inBlockComment = false;
            out += '  ';
            index += 2;
          } else {
            out += ' ';
            index += 1;
          }
          continue;
        }
        if (quote) {
          out += character;
          if (character === '\\') {
            out += next ?? '';
            index += 2;
            continue;
          }
          if (character === quote) quote = null;
          index += 1;
          continue;
        }
        if (character === '/' && next === '/') {
          out += ' '.repeat(line.length - index);
          break;
        }
        if (character === '/' && next === '*') {
          inBlockComment = true;
          out += '  ';
          index += 2;
          continue;
        }
        if (character === "'" || character === '"' || character === '`') quote = character;
        out += character;
        index += 1;
      }
      return out;
    })
    .join('\n');
}

/**
 * Read one listed file, turning a mid-walk disappearance into a report of the condition.
 *
 * The ENOENT is NOT swallowed, and that is the whole point of handling it. A path that the
 * directory walk listed a moment ago and cannot now be read means the worktree moved under the
 * scan — so the honest outcome is a loud, correctly attributed failure telling the reader to
 * re-run. Skipping the file instead would turn that into a WRONG ANSWER with a misattributed
 * cause: the corpus would be one file short, every count assertion over it would still pass, and
 * whichever gate depended on the missing file would report a defect in the code it polices.
 *
 * ONE ENOENT HERE IS NOT TRANSIENT, so it is discriminated rather than assumed: a dangling
 * symbolic link with a scanned extension is listed by `readdir` and fails ENOENT on every read,
 * forever. Telling its reader to re-run would send them round a loop that cannot terminate. The
 * `lstat` distinguishes them — it describes the LINK, so it still succeeds when the link is there
 * and its target is not — and it costs a syscall only on the failure path.
 *
 * It asks `isSymbolicLink()` rather than mere existence, and the difference is the message being
 * right rather than inverted: a path that the read could not find but the `lstat` finds as a
 * NON-link was recreated between the two calls, which is precisely the moving worktree — so a
 * truthiness test would report the transient case as the permanent one.
 *
 * Exported for the same reason as `readScannedDirectory`: the transient branch requires a file to
 * disappear between its own `readdir` and its own `readFileSync`, which no test can schedule, so
 * the only way its wording is covered by anything is a direct call.
 *
 * @param {string} full Absolute path, as listed by the walk.
 * @param {string} file The repo-relative form, for the message.
 * @returns {string} The file's text.
 */
export function readListedSource(full, file) {
  try {
    return readFileSync(full, 'utf8');
  } catch (cause) {
    if (cause?.code !== 'ENOENT') throw cause;
    if (lstatSync(full, { throwIfNoEntry: false })?.isSymbolicLink()) {
      throw new Error(
        `"${file}" is a symbolic link whose target does not exist, so the corpus scan cannot ` +
          'read it. This is NOT a moving worktree and re-running will produce exactly this ' +
          'failure again: repoint or remove the link, or scan a root that does not contain it.',
        { cause }
      );
    }
    throw new Error(
      `the worktree changed during the corpus scan: "${file}" was listed by the directory walk ` +
        'but had gone by the time it was read. Nothing is wrong with the code under test — ' +
        're-run. (Reported rather than skipped on purpose: a silently shortened corpus still ' +
        'satisfies every assertion counting it, and blames whatever the missing file proved.)',
      { cause }
    );
  }
}

/**
 * List one directory, turning an ENOENT into a report of which of its two causes it is.
 *
 * This is the `readdir` half of the guard `readListedSource` gives the `readFile` half, and it was
 * missing: the recursive listing was the last unguarded syscall in the walk, so a DIRECTORY going
 * away mid-scan produced exactly the unattributed `ENOENT ... scandir` this helper exists to
 * eliminate. That is not exotic — `git merge --ff-only`, the operation that produced the original
 * report, removes directories whenever it lands a folder rename.
 *
 * The two cases are told apart because their remedies are opposite, and `isRoot` is the only thing
 * that can tell them apart. A directory the walk itself listed a moment ago can only have gone
 * away during this run, so re-running is the answer. A ROOT was never listed by anything — the
 * caller named it — so it is just as likely to be a root that does not exist (a permanent caller
 * bug, where re-running loops forever) as a root the tree moved out from under.
 *
 * Exported so both messages can be proved directly against a real ENOENT: the recursive case needs
 * a directory to vanish between its parent's listing and its own, which no test can schedule.
 *
 * @param {string} dir Absolute directory to list.
 * @param {object} options
 * @param {boolean} options.isRoot Whether `dir` is a caller-named root rather than a listed child.
 * @returns {import('node:fs').Dirent[]} The directory's entries.
 */
export function readScannedDirectory(dir, { isRoot }) {
  try {
    return readdirSync(dir, { withFileTypes: true });
  } catch (cause) {
    if (cause?.code !== 'ENOENT') throw cause;
    const named = relative(repoRoot, dir).replaceAll('\\', '/') || dir;
    throw new Error(
      isRoot
        ? `the corpus scan was given a root that is not there: "${named}" does not exist under ` +
            `${repoRoot}. Either the caller's root list names a directory that never existed or has ` +
            'been renamed — a real failure that will repeat on every re-run — or the worktree moved ' +
            'and took the root with it. Re-running tells you which: if it passes, it was the tree.'
        : `the worktree changed during the corpus scan: directory "${named}" was listed by its ` +
            'parent but had gone by the time the walk descended into it. Nothing is wrong with the ' +
            'code under test — re-run. (A directory the walk listed itself moments ago cannot be a ' +
            'caller naming something that does not exist; only the tree moving explains it.)',
      { cause }
    );
  }
}

/**
 * Walk `dir`, adding every file whose name ends with one of `extensions` to `sources`.
 *
 * Classification is `readdir` with `withFileTypes` (through `readScannedDirectory`) plus
 * `entry.isDirectory()` rather than a `statSync` per entry: the kind arrives with the listing, so
 * there is one fewer unguarded syscall between a path being listed and being read.
 * `listSvelteComponents` in `scripts/lib/svelteComponentFiles.js` is the in-repo precedent.
 *
 * A `Dirent` describes the LINK, so `entry.isDirectory()` is false for a symlink to a directory,
 * where `statSync` follows it and recurses. That difference is real; see the symlink note on
 * `collectWorkingTreeSources` for why it is safe here and why it is not a general equivalence.
 *
 * Paths are normalized to forward slashes so an assertion reads the same on Windows.
 *
 * Both syscalls the walk makes are attributed: the listing through `readScannedDirectory` and the
 * read through `readListedSource`. `isRoot` is what lets the listing say WHICH failure it is, and
 * it is `false` for every recursive call because those directories were listed by this same walk.
 *
 * @param {string} dir Absolute directory to walk.
 * @param {readonly string[]} extensions Extensions to include.
 * @param {Record<string, string>} sources Accumulator, mutated in place.
 * @param {boolean} isRoot Whether `dir` is a caller-named root rather than a listed child.
 * @returns {Record<string, string>} `sources`.
 */
function walkSources(dir, extensions, sources, isRoot) {
  for (const entry of readScannedDirectory(dir, { isRoot })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkSources(full, extensions, sources, false);
    } else if (extensions.some((extension) => entry.name.endsWith(extension))) {
      const file = relative(repoRoot, full).replaceAll('\\', '/');
      sources[file] = readListedSource(full, file);
    }
  }
  return sources;
}

/**
 * Read every scannable file under `dir` into a `{ repo-relative path: text }` corpus.
 *
 * @param {string} dir Absolute directory to walk.
 * @param {object} [options]
 * @param {string[]} [options.extensions] Extensions to include.
 * @returns {Record<string, string>}
 */
export function collectSources(dir, { extensions = SCANNED_EXTENSIONS } = {}) {
  return walkSources(dir, extensions, {}, true);
}

/**
 * Order two paths by code point. Explicit because `sort()`'s default is "stringify, then order by
 * code point", which SonarCloud flags (`javascript:S2871`); and `localeCompare` is avoided because
 * it is locale-dependent, so the order could differ between machines. Same choice, for the same
 * reason, as `byCodePoint` in `scripts/lib/svelteComponentFiles.js`.
 *
 * @param {string} left
 * @param {string} right
 * @returns {number} negative, zero or positive per the `Array#sort` contract
 */
function byPath(left, right) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

/**
 * Every file under `roots` matching one of `extensions`, as a `{ repo-relative path: text }`
 * corpus in code-point path order.
 *
 * WHY THIS EXISTS — one source of truth. A gate wanting "the repository's source files" has two
 * ways to ask, and they answer about different things: `git ls-files` reports the INDEX, while
 * `readFileSync` reads the WORKING TREE. Listing with the first and reading with the second asks
 * two questions and treats the answers as one, which is wrong in three ways. It throws ENOENT when
 * a `git` operation strands a listed path between the two calls — observed for real once, six
 * tests failing at once immediately after a `git merge --ff-only`, ~25 minutes to diagnose because
 * the failure names the file rather than the divergence. And it silently answers WRONG in both
 * directions even when nothing throws: a component present on disk but unstaged is invisible to
 * the gate, and a file staged for deletion still counts. One walk of one source of truth has no
 * two answers to disagree.
 *
 * WHY IT DOES NOT SHELL OUT. No subprocess is needed to read the tree the test is already reading:
 * `git ls-files` costs ~11 ms plus a child process, spawning a bare command name resolved through
 * `PATH` is SonarCloud S4036, and shelling out makes the gate depend on the checkout being a git
 * repository at all — which an exported tarball or a vendored copy is not.
 *
 * WHAT IT DOES NOT DO — the window is NARROWED, not closed. The walk is ~55 ms over this
 * repository's ~550 files, against the two-call window it replaces, but a file removed between its
 * own `readdir` and its own `readFileSync`, or a directory removed between its parent's listing and
 * its own, still fails. Deliberately, and ATTRIBUTED: see `readListedSource` and
 * `readScannedDirectory`. Failing loudly with the cause named is the deliverable; not failing at
 * all would need a snapshot of the tree, which is the thing a working-tree gate must not take.
 *
 * EXTENSIONS ARE THE CALLER'S, with no default, and that is load-bearing rather than fussy. These
 * three roots hold 548 files at `SCANNED_EXTENSIONS` but 550 including `.css` and `.json`, and the
 * two absentees are `styles/fabricate.css` and `lang/en.json` — precisely the files a UI-facing
 * gate is most likely to be asking about. A default would hand such a caller a corpus quietly
 * missing them. `SCANNED_EXTENSIONS` is deliberately NOT widened to suit this caller either: three
 * literal gates scan `src/` through it, where widening is inert TODAY and would silently change
 * what all three police the first time a `.json` or `.css` lands under `src/`.
 *
 * SYMLINKS. The walk classifies with `Dirent.isDirectory()`, which is false for a symlink to a
 * directory that `statSync` would follow and recurse into. Read that as a caveat, not as an
 * equivalence: it is safe for `src/`, `styles/` and `lang/` only because those roots contain no
 * symlinks (verified: zero). A root that did would not be descended into. A DANGLING symlink with
 * a scanned extension is read as a file and fails ENOENT permanently rather than transiently;
 * `readListedSource` says so rather than telling its reader to re-run.
 *
 * @param {readonly string[]} roots Directories to walk, e.g. `['src', 'styles']`. Resolved against
 *   the repo root, so an absolute path — which is what the tests' tmpdir fixtures pass — is used as
 *   given. Walked in the order supplied, then sorted, so the supplied order does not reach the
 *   caller.
 * @param {readonly string[]} extensions Extensions to include, e.g. `['.js', '.svelte']`.
 * @returns {Record<string, string>} `{ repo-relative path: text }`, in code-point path order.
 */
export function collectWorkingTreeSources(roots, extensions) {
  if (!Array.isArray(roots) || roots.length === 0) {
    throw new TypeError('collectWorkingTreeSources needs at least one repo-relative root');
  }
  if (!Array.isArray(extensions) || extensions.length === 0) {
    throw new TypeError(
      'collectWorkingTreeSources needs an explicit non-empty extension list — there is no default,' +
        ' because the omitted extensions are exactly the ones a caller does not notice missing'
    );
  }

  const sources = {};
  for (const root of roots) walkSources(resolve(repoRoot, root), extensions, sources, true);
  return Object.fromEntries(
    Object.keys(sources)
      .sort(byPath)
      .map((file) => [file, sources[file]])
  );
}
