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
 * `npm test` glob, so nothing here is collected as a suite.
 */

import { readdirSync, readFileSync } from 'node:fs';
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
 * @param {string} full Absolute path, as listed by the walk.
 * @param {string} file The repo-relative form, for the message.
 * @returns {string} The file's text.
 */
function readListedSource(full, file) {
  try {
    return readFileSync(full, 'utf8');
  } catch (cause) {
    if (cause?.code !== 'ENOENT') throw cause;
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
 * Walk `dir`, adding every file whose name ends with one of `extensions` to `sources`.
 *
 * Classification is `readdirSync(dir, { withFileTypes: true })` + `entry.isDirectory()` rather
 * than a `statSync` per entry: the kind arrives with the listing, so there is one fewer unguarded
 * syscall between a path being listed and being read. `listSvelteComponents` in
 * `scripts/lib/svelteComponentFiles.js` is the in-repo precedent.
 *
 * A `Dirent` describes the LINK, so `entry.isDirectory()` is false for a symlink to a directory,
 * where `statSync` follows it and recurses. That difference is real; see the symlink note on
 * `collectWorkingTreeSources` for why it is safe here and why it is not a general equivalence.
 *
 * Paths are normalized to forward slashes so an assertion reads the same on Windows.
 *
 * @param {string} dir Absolute directory to walk.
 * @param {readonly string[]} extensions Extensions to include.
 * @param {Record<string, string>} sources Accumulator, mutated in place.
 * @returns {Record<string, string>} `sources`.
 */
function walkSources(dir, extensions, sources) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkSources(full, extensions, sources);
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
  return walkSources(dir, extensions, {});
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
 * own `readdir` and its own `readFileSync` still fails. Deliberately: see `readListedSource`.
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
 * symlinks (verified: zero). A root that did would not be descended into.
 *
 * @param {readonly string[]} roots Repo-relative directories to walk, e.g. `['src', 'styles']`.
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
  for (const root of roots) walkSources(resolve(repoRoot, root), extensions, sources);
  return Object.fromEntries(
    Object.keys(sources)
      .sort(byPath)
      .map((file) => [file, sources[file]])
  );
}
