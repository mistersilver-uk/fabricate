/**
 * Bounds the comment-line share per directory (issue 1657) as a ceiling, so a sweep that trims
 * comments costs no ledger edit and only a directory that grows materially does (issue 1914),
 * and caps each `src/systems` file at a 30% comment share (issue 1934).
 */
import assert from 'node:assert/strict';
import { readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { test } from 'node:test';

import { byCodePoint, ceilingLedgerGate } from './helpers/ratchetBaseline.js';
import { collectWorkingTreeSources, repoRoot } from './helpers/sourceScan.js';

const LEDGER_PATH = resolve(import.meta.dirname, 'comment-share-ledger.txt');

const RUN = 'node --conditions=browser --test tests/comment-share-ratchet.test.js';

/** Below this the scan is truncated rather than clean; the four roots hold ~2,100 files. */
const SCAN_FLOOR = 451;

/** The headroom every row carries, in comment lines a directory may add before it crosses. */
const HEADROOM_LINES = 25;

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
 * A line is a comment line iff it begins inside a block still open from a prior line, or its first
 * token opens one — except that a `blockClose` with code after it, and code before a trailing
 * `lineComment`, deliberately count as CODE, so a comment moved on or off its own line is a
 * non-event rather than a ratchet trip.
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

/** Physical lines, discounting the empty element a trailing newline leaves behind. */
function totalLines(text) {
  const lines = text.split('\n');
  return lines.length - (lines.at(-1) === '' ? 1 : 0);
}

/** A whole-percent share, so `100 * commentLines / totalLines` is what each row bounds. */
const shareOf = ({ commentLines, totalLines: total }) => (100 * commentLines) / total;

/** The share the directory would hold after `HEADROOM_LINES` more comment lines. */
function ceilingFor(key, _share, detail) {
  const { commentLines, totalLines: total } = detail[key];
  return Math.ceil((100 * (commentLines + HEADROOM_LINES)) / (total + HEADROOM_LINES));
}

/**
 * Keyed by every directory directly holding a scanned file, counting only files directly in it —
 * not the coarser one-child-per-root key a redistribution inside a subtree could hide behind.
 */
function buildLedger(corpus) {
  const buckets = new Map();
  for (const [file, text] of Object.entries(corpus)) {
    const dir = directoryOf(file);
    const bucket = buckets.get(dir) ?? { commentLines: 0, totalLines: 0 };
    bucket.commentLines += countCommentLines(text, extensionOf(file));
    bucket.totalLines += totalLines(text);
    buckets.set(dir, bucket);
  }
  const sorted = [...buckets]
    .filter(([, bucket]) => bucket.totalLines > 0)
    .sort(([a], [b]) => byCodePoint(a, b));
  return {
    observed: Object.fromEntries(sorted.map(([dir, bucket]) => [dir, shareOf(bucket)])),
    detail: Object.fromEntries(sorted),
    scanned: Object.keys(corpus).length,
  };
}

/** Comment and total lines per top-level root, which is the figure epic 1656's roll-up reads. */
function rollUpByRoot(detail) {
  const rollup = {};
  for (const [dir, bucket] of Object.entries(detail)) {
    const [root] = dir.split('/', 1);
    const into = (rollup[root] ??= { commentLines: 0, totalLines: 0 });
    into.commentLines += bucket.commentLines;
    into.totalLines += bucket.totalLines;
  }
  return rollup;
}

/** Every symlink under `root` whose target is a directory, repo-relative. */
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

let corpus;
/** The one read of the corpus; the per-file `src/systems` cap below filters it too. */
const readCorpus = () => (corpus ??= collectWorkingTreeSources(SCAN_ROOTS, SCAN_EXTENSIONS));

const gate = ceilingLedgerGate({
  test,
  assert,
  title: 'no directory is past its comment-share ceiling',
  ledgerPath: LEDGER_PATH,
  updateEnv: 'UPDATE_COMMENT_SHARE_LEDGER',
  tightenEnv: 'TIGHTEN_COMMENT_SHARE_LEDGER',
  build: () => buildLedger(readCorpus()),
  ceiling: ceilingFor,
  shrink: 'allow',
  floor: SCAN_FLOOR,
  wording: {
    subject: 'comment-line share per directory',
    update: `UPDATE_COMMENT_SHARE_LEDGER=1 ${RUN}`,
    tighten: `TIGHTEN_COMMENT_SHARE_LEDGER=1 ${RUN}`,
    addedHint:
      'A directory appears as its first scanned file is created. One key rising while another ' +
      'falls by a comparable share is a file moved between directories, not new prose.',
    staleHint: 'A directory vanishes when its files are moved, renamed or emptied.',
  },
});

/** Prints the roll-up epic 1656's definition of done reads; percentages are not summable, so it
 * is derived from the scan's own line counts and never pinned. */
test('the scan reports the root-level roll-up epic 1656 tracks', (t) => {
  const rollup = rollUpByRoot(gate.current().detail);
  for (const [root, bucket] of Object.entries(rollup).sort(([a], [b]) => byCodePoint(a, b))) {
    const share = ((100 * bucket.commentLines) / bucket.totalLines).toFixed(2);
    t.diagnostic(`${root}: ${bucket.commentLines}/${bucket.totalLines} lines comment (${share}%)`);
  }
  assert.deepStrictEqual(
    Object.keys(rollup).sort(byCodePoint),
    [...SCAN_ROOTS].sort(byCodePoint),
    'every scanned root still contributes a directory'
  );
});

test('a row absorbs at least twenty-five comment lines before it is crossed', () => {
  // A bare `ceil(share)` leaves a row tripping on one added line, which is the churn the ceiling
  // exists to remove; the rule is stated over the directory's own denominator instead.
  const detail = { small: { commentLines: 20, totalLines: 100 } };
  assert.equal(ceilingFor('small', shareOf(detail.small), detail), 36);
  const grown = { commentLines: 45, totalLines: 125 };
  assert.ok(shareOf(grown) <= 36, 'twenty-five more comment lines still fit under the ceiling');
});

test('none of the four scanned roots contains a symlinked directory', () => {
  const found = SCAN_ROOTS.flatMap((root) => findSymlinkedDirectories(root));
  assert.deepStrictEqual(
    found,
    [],
    `expected zero symlinked directories under ${SCAN_ROOTS.join(', ')}; found: ${found.join(', ')}`
  );
});

/** A `src/systems` file is over its cap above this whole-percent comment share (issue 1934). */
const SYSTEMS_FILE_SHARE_CAP = 30;
/** A file with this many comment lines or fewer is never over, whatever its share. */
const SYSTEMS_FILE_COMMENT_FLOOR = 10;
/** Below this the `src/systems` scan is truncated rather than clean; it holds ~150 files. */
const SYSTEMS_SCAN_FLOOR = 100;

/** The one predicate both the scan and the boundary test call. */
function overSystemsCap({ commentLines, totalLines: total }) {
  return (
    shareOf({ commentLines, totalLines: total }) > SYSTEMS_FILE_SHARE_CAP &&
    commentLines > SYSTEMS_FILE_COMMENT_FLOOR
  );
}

let systemsScan;
function scanSystemsFiles() {
  if (systemsScan) return systemsScan;
  systemsScan = [];
  for (const [file, text] of Object.entries(readCorpus())) {
    if (!file.startsWith('src/systems/')) continue;
    const commentLines = countCommentLines(text, extensionOf(file));
    systemsScan.push({ file, commentLines, totalLines: totalLines(text) });
  }
  return systemsScan;
}

const describeCounts = ({ file, commentLines, totalLines: total }) =>
  `${file} (${commentLines}/${total})`;

test('the src/systems scan reaches every file, including src/systems/normalize/', () => {
  const files = scanSystemsFiles().map(({ file }) => file);
  assert.ok(
    files.length >= SYSTEMS_SCAN_FLOOR,
    `expected at least ${SYSTEMS_SCAN_FLOOR} src/systems files; scanned ${files.length}`
  );
  assert.ok(
    files.some((file) => file.startsWith('src/systems/normalize/')),
    'expected the src/systems scan to descend into src/systems/normalize/'
  );
});

test('no src/systems file is over the comment-share cap', () => {
  assert.deepStrictEqual(
    scanSystemsFiles().filter(overSystemsCap).map(describeCounts),
    [],
    `over ${SYSTEMS_FILE_SHARE_CAP}% comment share with more than ${SYSTEMS_FILE_COMMENT_FLOOR} ` +
      'comment lines: trim the file under the comment policy (issue 1657)'
  );
});

test('the cap is exclusive at 30% and exempts ten or fewer comment lines', () => {
  const over = (commentLines, total) => overSystemsCap({ commentLines, totalLines: total });
  assert.equal(over(30, 100), false, '30/100 is at the cap');
  assert.equal(over(31, 100), true, '31/100 is over');
  assert.equal(over(10, 20), false, '10/20 is at the floor');
  assert.equal(over(11, 20), true, '11/20 is over');
});
