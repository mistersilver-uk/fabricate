/**
 * Bounds the comment-line share of each directory against the base commit: no directory may cross
 * `COMMENT_SHARE_CAP`, and one already over it may not rise above its base share. Each
 * `src/systems` file is capped at the same share outright (issue 1934).
 */
import assert from 'node:assert/strict';
import { readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { after, test } from 'node:test';

import { byCodePoint } from './helpers/codePointOrder.js';
import { compareToBase, headMarker, reportComparison } from './helpers/mergeBaseRatchet.js';
import { collectWorkingTreeSources, repoRoot } from './helpers/sourceScan.js';
import { createTempGitRepo } from './helpers/temp-git-repo.js';

const FAMILY = 'comment-share';

/** A directory or `src/systems` file is over its cap above this whole-percent comment share. */
const COMMENT_SHARE_CAP = 30;

/** Below this the scan is truncated rather than clean; the four roots hold ~2,400 files. */
const SCAN_FLOOR = 451;

/** The corpus this gate polices; `.json` is left out because it cannot hold a comment. */
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
 * Each line of a file as `[line, kind]`, where `kind` is `comment`, `code`, or `tag` for a Svelte
 * line that switches region. Two Svelte gaps are accepted, not fixed: a JS comment inside a `{...}`
 * mustache expression in markup is not detected, and a `<style lang="scss">` block would undercount
 * `//` (no `.svelte` file uses `lang="scss"` today).
 */
function* lineKinds(text, extension) {
  const kindOf = (isComment) => (isComment ? 'comment' : 'code');
  if (extension !== '.svelte') {
    const syntax = extension === '.css' ? CSS_SYNTAX : JS_SYNTAX;
    const state = { inBlock: false, quote: null };
    for (const line of text.split('\n')) yield [line, kindOf(classifyLine(line, state, syntax))];
    return;
  }
  const states = {
    markup: { inBlock: false, quote: null },
    js: { inBlock: false, quote: null },
    css: { inBlock: false, quote: null },
  };
  let region = 'markup';
  for (const line of text.split('\n')) {
    const switched = regionAfterTag(region, line.trim());
    if (switched) {
      region = switched;
      yield [line, 'tag'];
    } else {
      yield [line, kindOf(classifyLine(line, states[region], REGION_SYNTAX[region]))];
    }
  }
}

function countCommentLines(text, extension) {
  let count = 0;
  for (const [, kind] of lineKinds(text, extension)) if (kind === 'comment') count += 1;
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

const shareOf = ({ commentLines, totalLines: total }) => (100 * commentLines) / total;

const inCorpus = (file) =>
  SCAN_ROOTS.some((root) => file.startsWith(`${root}/`)) &&
  SCAN_EXTENSIONS.includes(extensionOf(file));

/** The reason a `ratchet-exempt(comment-share)` marker in `text`'s file head gives, or `null`. */
function exemptsItsDirectory(file, text) {
  return headMarker(file, text, FAMILY)?.reason ?? null;
}

/** Per extension, each text's tally; base and head share most files, so each is counted once. */
const tallies = new Map();

function tallyFile(file, text) {
  const extension = extensionOf(file);
  if (!tallies.has(extension)) tallies.set(extension, new Map());
  const byText = tallies.get(extension);
  if (!byText.has(text)) {
    byText.set(text, {
      commentLines: countCommentLines(text, extension),
      totalLines: totalLines(text),
      exempt: exemptsItsDirectory(file, text),
    });
  }
  return byText.get(text);
}

/**
 * Comment and total lines per directory, counting only the files directly in it, so a
 * redistribution inside a subtree cannot hide behind a coarser key.
 */
function tallyDirectories(files, readFile) {
  const buckets = new Map();
  for (const file of files) {
    const text = readFile(file);
    if (text === undefined) continue;
    const dir = directoryOf(file);
    const bucket = buckets.get(dir) ?? { commentLines: 0, totalLines: 0, exempt: null };
    const tally = tallyFile(file, text);
    bucket.commentLines += tally.commentLines;
    bucket.totalLines += tally.totalLines;
    bucket.exempt ||= tally.exempt;
    buckets.set(dir, bucket);
  }
  return buckets;
}

const ENTRY_ID = `comment-line share over ${COMMENT_SHARE_CAP}%`;

/**
 * One entry per directory over the cap, keyed `<dir>/*`, so a directory newly over it is new and
 * one already over it fails on any rise; four decimal places resolve one line in any directory
 * here. A directory holding a file with a reasoned marker in its file head is not measured.
 */
function measureCommentShare(readFile, listFiles) {
  const entries = [];
  for (const [dir, bucket] of tallyDirectories(listFiles(), readFile)) {
    if (bucket.exempt || bucket.totalLines === 0) continue;
    const share = shareOf(bucket);
    if (share <= COMMENT_SHARE_CAP) continue;
    entries.push({ file: `${dir}/*`, id: ENTRY_ID, amount: Math.round(share * 1e4) / 1e4 });
  }
  return entries;
}

const compareCommentShare = (options = {}) =>
  compareToBase({
    family: FAMILY,
    corpusRoot: '.',
    include: inCorpus,
    measure: measureCommentShare,
    scope: 'corpus',
    ...options,
  });

const GUIDANCE =
  "A directory's share counts the files directly in it, so moving a file moves its lines. Trim " +
  "the comments under AGENTS.md's comment rules. A reasoned exemption goes in the file head of " +
  'any file directly in that directory.';

/** Name every directory a file-head marker exempts, since an exempt directory is never measured. */
function reportExemptDirectories(t, buckets) {
  for (const [dir, bucket] of buckets) {
    if (bucket.exempt) t.diagnostic(`exempt: ${dir}/*: ${bucket.exempt}`);
  }
}

test('no directory crosses the comment-share cap or, already over it, rises above base', (t) => {
  const listed = [];
  const measure = (readFile, listFiles) => {
    const files = listFiles();
    listed.push(files.length);
    return measureCommentShare(readFile, () => files);
  };
  const result = reportComparison(t, compareCommentShare({ measure }), GUIDANCE);
  if (!result.compared) return;
  t.diagnostic(`compared ${listed.join(' and ')} files with base ${result.base.slice(0, 12)}`);
  assert.ok(
    Math.min(...listed) >= SCAN_FLOOR,
    `expected at least ${SCAN_FLOOR} scanned files on each side; scanned ${listed.join(' and ')}`
  );
});

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
/** The one working-tree read, for the roll-up and the per-file `src/systems` cap. */
const readCorpus = () => (corpus ??= collectWorkingTreeSources(SCAN_ROOTS, SCAN_EXTENSIONS));

/** Prints the roll-up epic 1656's definition of done reads; percentages are not summable, so it
 * is derived from the scan's own line counts and never pinned. */
test('the scan reports the root-level roll-up epic 1656 tracks and every exempt directory', (t) => {
  const files = Object.keys(readCorpus());
  assert.ok(files.length >= SCAN_FLOOR, `expected ${SCAN_FLOOR}+ files; scanned ${files.length}`);
  const rollup = {};
  const buckets = tallyDirectories(files, (file) => readCorpus()[file]);
  reportExemptDirectories(t, buckets);
  for (const [dir, bucket] of buckets) {
    const into = (rollup[dir.split('/', 1)[0]] ??= { commentLines: 0, totalLines: 0 });
    into.commentLines += bucket.commentLines;
    into.totalLines += bucket.totalLines;
  }
  for (const [root, bucket] of Object.entries(rollup).sort(([a], [b]) => byCodePoint(a, b))) {
    const share = shareOf(bucket).toFixed(2);
    t.diagnostic(`${root}: ${bucket.commentLines}/${bucket.totalLines} lines comment (${share}%)`);
  }
  assert.deepStrictEqual(
    Object.keys(rollup).sort(byCodePoint),
    [...SCAN_ROOTS].sort(byCodePoint),
    'every scanned root still contributes a directory'
  );
});

test('none of the four scanned roots contains a symlinked directory', () => {
  const found = SCAN_ROOTS.flatMap((root) => findSymlinkedDirectories(root));
  assert.deepStrictEqual(
    found,
    [],
    `expected zero symlinked directories under ${SCAN_ROOTS.join(', ')}; found: ${found.join(', ')}`
  );
});

/** A file with this many comment lines or fewer is never over, whatever its share. */
const SYSTEMS_FILE_COMMENT_FLOOR = 10;
/** Below this the `src/systems` scan is truncated rather than clean; it holds ~150 files. */
const SYSTEMS_SCAN_FLOOR = 100;

/** The one predicate both the scan and the boundary test call. */
function overSystemsCap({ commentLines, totalLines: total }) {
  return (
    shareOf({ commentLines, totalLines: total }) > COMMENT_SHARE_CAP &&
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
    `over ${COMMENT_SHARE_CAP}% comment share with more than ${SYSTEMS_FILE_COMMENT_FLOOR} ` +
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

const repos = [];
after(() => {
  for (const repo of repos) repo.dispose();
});

/** A throwaway repository whose one commit holds `files`, compared by this gate's own wiring. */
function repoWith(files) {
  const repo = createTempGitRepo('comment-share-');
  repos.push(repo);
  repo.write(files);
  const first = repo.commitAll('base');
  const compare = () => compareCommentShare({ cwd: repo.dir, env: { RATCHET_BASE: first } });
  return { write: repo.write, compare };
}

/** A JS file of `comments` comment lines then `code` code lines. */
const jsFile = (comments, code, head = []) =>
  [
    ...head,
    ...Array.from({ length: comments }, (_, index) => `// note ${index}`),
    ...Array.from({ length: code }, (_, index) => `export const v${index} = ${index};`),
  ].join('\n') + '\n';

test('a directory newly over the cap fails, and one under it may rise to the cap', () => {
  const repo = repoWith({ 'src/a/one.js': jsFile(1, 9), 'tests/b/one.js': jsFile(1, 9) });
  repo.write({ 'src/a/two.js': jsFile(9, 1), 'tests/b/one.js': jsFile(3, 7) });
  const result = repo.compare();
  assert.equal(result.compared, true);
  assert.deepEqual(result.failures, [`src/a/*: ${ENTRY_ID} is new (50)`]);
  assert.throws(() => reportComparison(null, result, GUIDANCE), /comment-share: 1 regression/);
});

test('a directory already over the cap fails on any rise and passes a fall, reported', () => {
  const repo = repoWith({ 'src/c/over.js': jsFile(4, 6) });
  repo.write({ 'src/c/over.js': jsFile(5, 6) });
  assert.deepEqual(repo.compare().failures, [`src/c/*: ${ENTRY_ID} rose from 40 to 45.4545`]);
  repo.write({ 'src/c/over.js': jsFile(4, 7) });
  const fell = repo.compare();
  assert.deepEqual(fell.failures, []);
  assert.deepEqual(fell.shrank, [`src/c/*: ${ENTRY_ID} fell from 40 to 36.3636`]);
  repo.write({ 'src/c/over.js': jsFile(4, 16) });
  assert.deepEqual(repo.compare().shrank, [`src/c/*: ${ENTRY_ID} is gone (was 40)`]);
});

test('a change to any file of the corpus compares rather than skips, and one outside it skips', () => {
  const files = ['src/x/a.svelte', 'tests/x/a.mjs', 'scripts/x/a.js', 'styles/x/a.css'];
  const repo = repoWith({
    ...Object.fromEntries(files.map((file) => [file, 'x\n'])),
    'docs/readme.md': 'x\n',
    'src/x/data.json': '{}\n',
  });
  repo.write({ 'docs/readme.md': 'y\n', 'src/x/data.json': '[]\n' });
  assert.equal(repo.compare().skipped, 'corpus-unchanged');
  for (const file of files) {
    repo.write({ [file]: 'y\n' });
    assert.equal(repo.compare().compared, true, `${file} is in the corpus`);
    repo.write({ [file]: 'x\n' });
  }
});

test('a reasoned marker in the file head of a file in the directory exempts it; an empty fails', () => {
  const marker = (reason) => `// ratchet-exempt(comment-share):${reason}`;
  const repo = repoWith({ 'src/d/one.js': jsFile(1, 9), 'src/e/one.js': jsFile(1, 9) });
  const reasoned = jsFile(9, 1, [marker(' a generated API reference')]);
  repo.write({ 'src/d/two.js': reasoned });
  assert.deepEqual(repo.compare().failures, []);
  const notes = [];
  const spy = {
    diagnostic: (line) => {
      notes.push(line);
    },
  };
  const texts = { 'lib/d/two.js': reasoned, 'lib/e/one.js': jsFile(1, 9) };
  reportExemptDirectories(
    spy,
    tallyDirectories(Object.keys(texts), (file) => texts[file])
  );
  assert.deepEqual(notes, ['exempt: lib/d/*: a generated API reference']);
  repo.write({
    'src/d/two.js': `${jsFile(9, 1)}${marker(' below the file head')}\n`,
    'src/e/two.svelte': [
      '<script>',
      marker(' in a Svelte script head'),
      '// a',
      '// b',
      '// c',
      '// d',
      '// e',
      '// f',
      '// g',
      '// h',
      '// i',
      '</script>',
      '',
    ].join('\n'),
  });
  assert.deepEqual(repo.compare().failures, [`src/d/*: ${ENTRY_ID} is new (52.381)`]);
  repo.write({ 'src/d/two.js': jsFile(9, 1, [marker('')]) });
  assert.deepEqual(repo.compare().failures, [
    `src/d/*: ${ENTRY_ID} is new (52.381)`,
    'src/d/two.js:1 has a ratchet-exempt(comment-share) marker with no reason; write why the ' +
      'regression is legitimate after the colon',
  ]);
});
