/**
 * Ratchets the comment-line share per directory (issue 1657), so Phase 1 sweeps of this epic
 * can each lower `tests/comment-share-ledger.json` without a later sweep silently re-growing it.
 * Root roll-ups are derived here and printed on mismatch; the ledger itself pins directories only.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { test } from 'node:test';

import { collectWorkingTreeSources, repoRoot } from './helpers/sourceScan.js';

// `readFileSync` + `JSON.parse`, not `import ... with { type: 'json' }`: this repo's ESLint
// parser rejects the import-attribute syntax, as `scripts/lib/designSystemPrimitives.js` notes.
const LEDGER = JSON.parse(
  readFileSync(resolve(import.meta.dirname, 'comment-share-ledger.json'), 'utf8')
);

/** The corpus this gate polices. `.json` is excluded on purpose — see the ledger note below. */
const SCAN_ROOTS = Object.freeze(['src', 'tests', 'scripts', 'styles']);
const SCAN_EXTENSIONS = Object.freeze(['.js', '.mjs', '.svelte', '.css']);

/** The three quote delimiters a JS/CSS syntax tracks across lines. */
const QUOTE_CHARS = Object.freeze(['"', "'", '`']);

/** Order by code point, not locale, so key order cannot differ between machines. */
function byCodePoint(left, right) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

const JS_SYNTAX = Object.freeze({
  blockOpen: '/*',
  blockClose: '*/',
  lineComment: '//',
  quotes: true,
});
const CSS_SYNTAX = Object.freeze({
  blockOpen: '/*',
  blockClose: '*/',
  lineComment: null,
  quotes: true,
});
const MARKUP_SYNTAX = Object.freeze({
  blockOpen: '<!--',
  blockClose: '-->',
  lineComment: null,
  quotes: false,
});

/**
 * A line is a comment line iff it begins inside a block still open from a prior line, or its
 * first token opens one — except a lone `blockClose`, or code before a trailing `lineComment`,
 * deliberately undercounts as CODE, so a comment moved on/off its own line is a non-event, not a
 * ratchet trip. One function, called with a different `syntax` per extension and svelte region,
 * so no per-type copy exists for the duplication gate.
 *
 * @param {string} line
 * @param {{inBlock: boolean, quote: string|null}} state
 * @param {{blockOpen: string, blockClose: string, lineComment: string|null, quotes: boolean}} syntax
 * @returns {boolean}
 */
function classifyLine(line, state, syntax) {
  const trimmed = line.trimStart();
  const leading = line.length - trimmed.length;
  let isComment;
  let from;

  if (state.quote) {
    // Inside a quoted string carried over from a prior line: never a comment, whatever it looks like.
    isComment = false;
    from = 0;
  } else if (state.inBlock) {
    if (trimmed.startsWith(syntax.blockClose)) {
      const after = trimmed.slice(syntax.blockClose.length);
      state.inBlock = false;
      if (after.trim() === '') return true;
      isComment = false;
      from = leading + syntax.blockClose.length;
    } else {
      isComment = true;
      const idx = line.indexOf(syntax.blockClose, leading);
      if (idx === -1) return true;
      state.inBlock = false;
      from = idx + syntax.blockClose.length;
    }
  } else if (syntax.lineComment && trimmed.startsWith(syntax.lineComment)) {
    return true;
  } else if (trimmed.startsWith(syntax.blockOpen)) {
    isComment = true;
    const idx = line.indexOf(syntax.blockClose, leading + syntax.blockOpen.length);
    if (idx === -1) {
      state.inBlock = true;
      return true;
    }
    from = idx + syntax.blockClose.length;
  } else {
    isComment = false;
    from = 0;
  }

  // Advance state across the remainder so a later line is classified correctly, even though this
  // line's own classification is already decided above.
  for (let i = from; i < line.length; ) {
    if (state.quote) {
      if (syntax.quotes && line[i] === '\\') {
        i += 2;
        continue;
      }
      if (line[i] === state.quote) state.quote = null;
      i += 1;
      continue;
    }
    if (syntax.lineComment && line.startsWith(syntax.lineComment, i)) break;
    if (line.startsWith(syntax.blockOpen, i)) {
      const idx = line.indexOf(syntax.blockClose, i + syntax.blockOpen.length);
      if (idx === -1) {
        state.inBlock = true;
        break;
      }
      i = idx + syntax.blockClose.length;
      continue;
    }
    if (syntax.quotes && QUOTE_CHARS.includes(line[i])) {
      state.quote = line[i];
      i += 1;
      continue;
    }
    i += 1;
  }
  return isComment;
}

// A tag is assumed alone on its own line, matching this repo's Prettier-Svelte formatting
// (verified across the corpus); a tag sharing a line with code is not handled.
const SCRIPT_OPEN = /^<script(\s[^>]*)?>$/i;
const SCRIPT_CLOSE = /^<\/script>$/i;
const STYLE_OPEN = /^<style(\s[^>]*)?>$/i;
const STYLE_CLOSE = /^<\/style>$/i;

/**
 * Two gaps are accepted, not fixed: a JS comment inside a `{...}` mustache expression in markup
 * is not detected, and a `<style lang="scss">` block would undercount `//` (no `.svelte` file
 * uses `lang="scss"` today).
 */
function countSvelteCommentLines(text) {
  const states = {
    markup: { inBlock: false, quote: null },
    js: { inBlock: false, quote: null },
    css: { inBlock: false, quote: null },
  };
  let region = 'markup';
  let count = 0;
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (region === 'markup' && SCRIPT_OPEN.test(trimmed)) {
      region = 'js';
      continue;
    }
    if (region === 'js' && SCRIPT_CLOSE.test(trimmed)) {
      region = 'markup';
      continue;
    }
    if (region === 'markup' && STYLE_OPEN.test(trimmed)) {
      region = 'css';
      continue;
    }
    if (region === 'css' && STYLE_CLOSE.test(trimmed)) {
      region = 'markup';
      continue;
    }
    const syntax = region === 'js' ? JS_SYNTAX : region === 'css' ? CSS_SYNTAX : MARKUP_SYNTAX;
    if (classifyLine(line, states[region], syntax)) count += 1;
  }
  return count;
}

/** Count comment lines in one file, dispatching purely on extension — no per-type branch below this. */
function countCommentLines(text, extension) {
  if (extension === '.svelte') return countSvelteCommentLines(text);
  const syntax = extension === '.css' ? CSS_SYNTAX : JS_SYNTAX;
  const state = { inBlock: false, quote: null };
  let count = 0;
  for (const line of text.split('\n')) {
    if (classifyLine(line, state, syntax)) count += 1;
  }
  return count;
}

function directoryOf(file) {
  const idx = file.lastIndexOf('/');
  return idx === -1 ? '.' : file.slice(0, idx);
}

function extensionOf(file) {
  return file.slice(file.lastIndexOf('.'));
}

/**
 * Keyed by every directory directly holding a scanned file, counting only files directly in it —
 * not the coarser one-child-per-root key a redistribution inside a subtree could hide behind.
 * Root roll-ups are derived here, never pinned, so there is exactly one source of truth.
 */
function buildLedger(corpus) {
  const buckets = new Map();
  for (const [file, text] of Object.entries(corpus)) {
    const dir = directoryOf(file);
    const count = countCommentLines(text, extensionOf(file));
    buckets.set(dir, (buckets.get(dir) ?? 0) + count);
  }
  return Object.fromEntries([...buckets].sort(([a], [b]) => byCodePoint(a, b)));
}

function rollUpByRoot(ledger) {
  const rollup = {};
  for (const [dir, count] of Object.entries(ledger)) {
    const [root] = dir.split('/', 1);
    rollup[root] = (rollup[root] ?? 0) + count;
  }
  return rollup;
}

/**
 * `collectWorkingTreeSources` walks the working tree, not the git index, so a stray untracked
 * file under a scanned root counts here before it is ever committed — the likely cause of a
 * structural mismatch below, named ahead of a real regression.
 */
function describeStructuralDrift(actual, expected) {
  const added = Object.keys(actual)
    .filter((key) => !(key in expected))
    .sort(byCodePoint);
  const removed = Object.keys(expected)
    .filter((key) => !(key in actual))
    .sort(byCodePoint);
  if (added.length === 0 && removed.length === 0) return undefined;
  return (
    `directory set changed — added: [${added.join(', ')}], removed: [${removed.join(', ')}]. ` +
    'A stray untracked file under src/, tests/, scripts/, or styles/ is the likely cause before a ' +
    'real regression, because this corpus is the working tree, not the git index (`git status` ' +
    'will show it). If the change is real, regenerate the ledger to match.'
  );
}

function describeValueDrift(actual, expected) {
  const changed = Object.keys(expected)
    .filter((key) => key in actual && actual[key] !== expected[key])
    .sort(byCodePoint)
    .map((key) => `${key}: pinned ${expected[key]} -> actual ${actual[key]}`);
  if (changed.length === 0) return undefined;
  return (
    `comment-line counts drifted on existing directories: ${changed.join('; ')}. This gate fails ` +
    'in both directions: a count that ROSE needs justification or a revert, and a count that FELL ' +
    'needs the ledger lowered to bank the win.'
  );
}

/**
 * Every symlink under `root` whose target is a directory, repo-relative. Scoped to these four
 * roots only — `sourceScan.js`'s own symlink-safety note verifies `src`, `styles`, and `lang`,
 * not `tests` or `scripts`, so this gate proves its own two new roots directly.
 */
function findSymlinkedDirectories(root) {
  const found = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isSymbolicLink()) {
        // A dangling symlink's target cannot be stat'd; treat that as "not a directory" rather
        // than throwing, since a dangling link is a file-shaped problem, not a directory one.
        let targetIsDirectory;
        try {
          targetIsDirectory = statSync(full).isDirectory();
        } catch {
          targetIsDirectory = false;
        }
        if (targetIsDirectory) found.push(relative(repoRoot, full).replaceAll('\\', '/'));
        continue;
      }
      if (entry.isDirectory()) walk(full);
    }
  };
  walk(resolve(repoRoot, root));
  return found;
}

test('the comment-line ledger matches the pinned baseline exactly, per directory', () => {
  const corpus = collectWorkingTreeSources(SCAN_ROOTS, SCAN_EXTENSIONS);
  const actual = buildLedger(corpus);
  const message = describeStructuralDrift(actual, LEDGER) ?? describeValueDrift(actual, LEDGER);
  assert.deepStrictEqual(actual, LEDGER, message);
});

test('the ledger reports as the root-level roll-up epic 1656 tracks', () => {
  const corpus = collectWorkingTreeSources(SCAN_ROOTS, SCAN_EXTENSIONS);
  const actual = rollUpByRoot(buildLedger(corpus));
  const expected = rollUpByRoot(LEDGER);
  assert.deepStrictEqual(actual, expected);
});

test('none of the four scanned roots contains a symlinked directory', () => {
  const found = SCAN_ROOTS.flatMap((root) => findSymlinkedDirectories(root));
  assert.deepStrictEqual(
    found,
    [],
    `expected zero symlinked directories under ${SCAN_ROOTS.join(', ')}; found: ${found.join(', ')}`
  );
});
