/**
 * Shared filesystem + comment-stripping primitives for the `src/**` regression gates (issue 1024)
 * and for any gate that needs the working tree as a corpus (issue 1017).
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
 * List one directory, turning an ENOENT into a report of which of its two causes it is. The two
 * cases are told apart because their remedies are opposite, and `isRoot` is the only thing that can
 * tell them apart.
 *
 * @param {string} dir Absolute directory to list.
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
 * @param {string[]} [options.extensions] Extensions to include.
 */
export function collectSources(dir, { extensions = SCANNED_EXTENSIONS } = {}) {
  return walkSources(dir, extensions, {}, true);
}

/**
 * Order two paths by code point.
 *
 * @returns {number} negative, zero or positive per the `Array#sort` contract
 */
function byPath(left, right) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

/**
 * Every file under `roots` matching one of `extensions`, as a `{ repo-relative path: text }` corpus
 * in code-point path order. WHAT IT DOES NOT DO — the window is NARROWED, not closed.
 *
 * @param {readonly string[]} roots Directories to walk, e.g. `['src', 'styles']`. Resolved against
 * the repo root, so an absolute path — which is what the tests' tmpdir fixtures pass — is used as
 * given. Walked in the order supplied, then sorted, so the supplied order does not reach the
 * caller.
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
