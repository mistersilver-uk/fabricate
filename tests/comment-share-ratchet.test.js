/**
 * Ratchets the comment-line share per directory (issue 1657), so Phase 1 sweeps of this epic
 * can each lower `tests/comment-share-ledger.txt` without a later sweep silently re-growing it.
 * Root roll-ups are derived here and printed on mismatch; the ledger itself pins directories only.
 * This file is itself in the `tests` bucket it pins, so editing these comments moves that number.
 */
import assert from 'node:assert/strict';
import { readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { test } from 'node:test';

import { byCodePoint, ledgerGate } from './helpers/ratchetBaseline.js';
import { collectWorkingTreeSources, repoRoot } from './helpers/sourceScan.js';

// `readFileSync` + `JSON.parse`, not `import ... with { type: 'json' }`: this repo's ESLint
// parser rejects the import-attribute syntax, as `scripts/lib/designSystemPrimitives.js` notes.
const LEDGER_PATH = resolve(import.meta.dirname, 'comment-share-ledger.txt');

/** The command that re-derives the ledger, named in every drift message so it is actionable. */
const REGENERATE =
  'UPDATE_COMMENT_SHARE_LEDGER=1 node --conditions=browser --test ' +
  'tests/comment-share-ratchet.test.js, then review the JSON diff';

/** The corpus this gate polices. `.json` is excluded on purpose — see the ledger note below. */
const SCAN_ROOTS = Object.freeze(['src', 'tests', 'scripts', 'styles']);
const SCAN_EXTENSIONS = Object.freeze(['.js', '.mjs', '.svelte', '.css']);

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
const REGION_SYNTAX = Object.freeze({ js: JS_SYNTAX, css: CSS_SYNTAX, markup: MARKUP_SYNTAX });

/** The three quote delimiters a JS or CSS syntax opens a string on. */
const QUOTE_CHARS = Object.freeze(['"', "'", '`']);

/**
 * Resolve the block comment already open at this line's first character.
 *
 * @returns {{isComment: boolean, from: number}|true} `true` when the whole line is comment.
 */
function continueOpenBlock(line, trimmed, leading, state, syntax) {
  if (trimmed.startsWith(syntax.blockClose)) {
    state.inBlock = false;
    if (trimmed.slice(syntax.blockClose.length).trim() === '') return true;
    return { isComment: false, from: leading + syntax.blockClose.length };
  }
  const idx = line.indexOf(syntax.blockClose, leading);
  if (idx === -1) return true;
  state.inBlock = false;
  return { isComment: true, from: idx + syntax.blockClose.length };
}

/** Consume one character inside an open string, honouring the escape, and return the next index. */
function advanceInsideQuote(line, index, state, syntax) {
  if (syntax.quotes && line[index] === '\\') return index + 2;
  if (line[index] === state.quote) state.quote = null;
  return index + 1;
}

/**
 * A line is a comment line iff it begins inside a block still open from a prior line, or its
 * first token opens one — except that a `blockClose` with code after it, and code before a
 * trailing `lineComment`, deliberately count as CODE, so a comment moved on or off its own line
 * is a non-event rather than a ratchet trip. One function, called with a different `syntax` per
 * extension and svelte region, so no per-type copy exists for the duplication gate.
 *
 * A `'` or `"` string held open only by a trailing backslash line-continuation is not tracked:
 * state resets at the next line's entry rather than swallowing the file. No file in this corpus
 * uses that construct.
 *
 * @param {string} line
 * @param {{inBlock: boolean, quote: string|null}} state
 * @param {{blockOpen: string, blockClose: string, lineComment: string|null, quotes: boolean}} syntax
 * @returns {boolean}
 */
function classifyLine(line, state, syntax) {
  // Only a template literal legally spans a line, so `'` and `"` state never carries: an
  // unbalanced quote inside a regex character class would otherwise open a string that swallows
  // the rest of the file, which is how this gate went silently blind for four files (issue 1657).
  if (state.quote && state.quote !== '`') state.quote = null;

  const trimmed = line.trimStart();
  const leading = line.length - trimmed.length;
  let isComment;
  let from;

  if (state.quote) {
    isComment = false;
    from = 0;
  } else if (state.inBlock) {
    const resolved = continueOpenBlock(line, trimmed, leading, state, syntax);
    if (resolved === true) return true;
    ({ isComment, from } = resolved);
  } else if (syntax.lineComment && trimmed.startsWith(syntax.lineComment)) {
    return true;
  } else if (trimmed.startsWith(syntax.blockOpen)) {
    const idx = line.indexOf(syntax.blockClose, leading + syntax.blockOpen.length);
    if (idx === -1) {
      state.inBlock = true;
      return true;
    }
    isComment = true;
    from = idx + syntax.blockClose.length;
  } else {
    isComment = false;
    from = 0;
  }

  // Advance state across the remainder so a later line is classified correctly, even though this
  // line's own classification is already decided above.
  let index = from;
  while (index < line.length) {
    if (state.quote) {
      index = advanceInsideQuote(line, index, state, syntax);
      continue;
    }
    if (syntax.lineComment && line.startsWith(syntax.lineComment, index)) break;
    if (line.startsWith(syntax.blockOpen, index)) {
      const idx = line.indexOf(syntax.blockClose, index + syntax.blockOpen.length);
      if (idx === -1) {
        state.inBlock = true;
        break;
      }
      index = idx + syntax.blockClose.length;
      continue;
    }
    if (syntax.quotes && QUOTE_CHARS.includes(line[index])) state.quote = line[index];
    index += 1;
  }
  return isComment;
}

// A tag is assumed alone on its own line, matching this repo's Prettier-Svelte formatting
// (verified across the corpus); a tag sharing a line with code is not handled.
const SCRIPT_OPEN = /^<script(\s[^>]*)?>$/i;
const SCRIPT_CLOSE = /^<\/script>$/i;
const STYLE_OPEN = /^<style(\s[^>]*)?>$/i;
const STYLE_CLOSE = /^<\/style>$/i;

/** The region a svelte tag line switches into, or `undefined` when the line is not a switch. */
function regionAfterTag(region, trimmed) {
  if (region === 'markup' && SCRIPT_OPEN.test(trimmed)) return 'js';
  if (region === 'js' && SCRIPT_CLOSE.test(trimmed)) return 'markup';
  if (region === 'markup' && STYLE_OPEN.test(trimmed)) return 'css';
  if (region === 'css' && STYLE_CLOSE.test(trimmed)) return 'markup';
  return undefined;
}

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
    const switched = regionAfterTag(region, line.trim());
    if (switched) {
      region = switched;
      continue;
    }
    if (classifyLine(line, states[region], REGION_SYNTAX[region])) count += 1;
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

/** One corpus walk per run: three assertions read it, and the tree is ~550 files. */

function rollUpByRoot(ledger) {
  const rollup = {};
  for (const [dir, count] of Object.entries(ledger)) {
    const [root] = dir.split('/', 1);
    rollup[root] = (rollup[root] ?? 0) + count;
  }
  return rollup;
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

const gate = ledgerGate({
  ledgerPath: LEDGER_PATH,
  regenerateEnv: 'UPDATE_COMMENT_SHARE_LEDGER',
  build: () => buildLedger(collectWorkingTreeSources(SCAN_ROOTS, SCAN_EXTENSIONS)),
  wording: {
    subject: 'comment-line counts per directory',
    regenerate: REGENERATE,
    structuralHint: 'A directory appears or vanishes as its files are created, renamed or emptied.',
    roseHint: 'needs justification or a revert',
    fellHint:
      'needs the ledger lowered to bank the win; one key down and another up by the same amount ' +
      'is a file moved between directories, not a regression',
  },
});

test('the comment-line ledger matches the pinned baseline exactly, per directory', () => {
  gate.check(assert);
});

/** Prints the four numbers epic 1656's definition of done reads; it cannot fail alone. */
test('the ledger reports as the root-level roll-up epic 1656 tracks', (t) => {
  // A regeneration run has just rewritten the file, so comparing against it proves nothing until
  // the next run.
  if (gate.regenerated()) return t.skip('ledger regenerated this run');
  assert.deepStrictEqual(rollUpByRoot(gate.current()), rollUpByRoot(gate.pinned()));
});

test('none of the four scanned roots contains a symlinked directory', () => {
  const found = SCAN_ROOTS.flatMap((root) => findSymlinkedDirectories(root));
  assert.deepStrictEqual(
    found,
    [],
    `expected zero symlinked directories under ${SCAN_ROOTS.join(', ')}; found: ${found.join(', ')}`
  );
});
