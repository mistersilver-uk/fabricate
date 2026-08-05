/**
 * Shared filesystem + comment-stripping primitives for the `src/**` regression gates
 * (issue 1024).
 *
 * Two gates police `src/**` for a re-hardcoded literal — `quantity-literal-gate.test.js`
 * and `actor-type-literal-gate.test.js` — and each one needs the same two things: the
 * whole scannable tree as a `{ path: text }` corpus, and comment text blanked before
 * matching.
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

import { readdirSync, readFileSync, statSync } from 'node:fs';
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
 * Read every scannable file under `dir` into a `{ repo-relative path: text }` corpus.
 *
 * Paths are normalized to forward slashes so an assertion reads the same on Windows.
 *
 * @param {string} dir Absolute directory to walk.
 * @param {object} [options]
 * @param {string[]} [options.extensions] Extensions to include.
 * @returns {Record<string, string>}
 */
export function collectSources(dir, { extensions = SCANNED_EXTENSIONS } = {}) {
  const sources = {};
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      Object.assign(sources, collectSources(full, { extensions }));
    } else if (extensions.some((extension) => entry.endsWith(extension))) {
      sources[relative(repoRoot, full).replaceAll('\\', '/')] = readFileSync(full, 'utf8');
    }
  }
  return sources;
}
