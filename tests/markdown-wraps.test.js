/**
 * JOINING HARD WRAPS CHANGES NO CONTENT AND NO STRUCTURE (issue #1661, phase 5).
 *
 * `AGENTS.md` requires one sentence per line and `markdownlint-sentences-per-line` does not
 * enforce it: the rule flags a line carrying a SECOND sentence and has no notion of a sentence
 * running past a line break, so a wrapped sentence raises nothing. `markdownWraps.js` closes that
 * gap, and rewriting prose across 147 tracked documents has to prove two things no diff review of
 * 161 joins establishes by eye: that nothing was reworded, asserted by collapsing whitespace and
 * comparing; and that nothing structural was swallowed, since a naive detector joins front matter,
 * fences, tables, block attributes, setext underlines and blockquote boundaries, each of which
 * corrupts the file while `npm run lint:md` still reports zero issues. The fixtures drive
 * `wrappedSites` at exact line numbers, because a detector that reports nothing satisfies both.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { function as sentencesPerLine } from 'markdownlint-sentences-per-line';

import { isTableRow, paddedRows } from '../scripts/lib/markdownTables.js';
import { joinWraps, wrappedSites } from '../scripts/lib/markdownWraps.js';

const REPOSITORY_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** A known-wrapped file, named so the corpus cannot silently stop containing the thing scanned. */
const KNOWN_WRAPPED = 'DOMAIN.md';

/** The corpus floor: 147 files are tracked today, so a collapse to a handful fails here. */
const CORPUS_FLOOR = 120;

const QUOTE_MARKERS = /^(?: {0,3}>[ \t]?)+/u;

/** Every tracked Markdown file, as `{ file, before, after }`. */
function corpus() {
  const listed = execFileSync('git', ['ls-files', '*.md'], {
    cwd: REPOSITORY_ROOT,
    encoding: 'utf8',
  });
  return listed
    .split('\n')
    .filter(Boolean)
    .map((file) => {
      const before = readFileSync(path.join(REPOSITORY_ROOT, file), 'utf8');
      return { file, before, after: joinWraps(before) };
    });
}

/**
 * Whitespace runs collapsed and blockquote markers dropped.
 *
 * The markers go for the same reason the whitespace does: joining two quoted lines removes the
 * continuation's `>`, which is the transform working. That is the one mutation this normalisation
 * cannot see, so it is pinned separately and exactly by the blockquote assertions below.
 */
function normalise(text) {
  return text
    .split('\n')
    .map((line) => line.replace(QUOTE_MARKERS, ''))
    .join(' ')
    .replaceAll(/\s+/gu, ' ')
    .trim();
}

const quotedLines = (text) => text.split('\n').filter((line) => QUOTE_MARKERS.test(line));
const quotedText = (text) =>
  normalise(quotedLines(text).map((line) => line.replace(QUOTE_MARKERS, '')).join('\n'));

/** The fence-aware padded-row report, without the line numbers a join shifts. */
const padded = (text) => paddedRows(text).map(({ line }) => line).join('\n');

const countMatching = (text, shape) => text.split('\n').filter((line) => shape.test(line)).length;
const HEADING = /^ {0,3}#{1,6}(?:\s|$)/u;
const FENCE = /^ {0,3}(?:```|~~~)/u;
const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])(?:\s|$)/u;

/** How many issues the REAL markdownlint rule raises, driven directly at its rule function. */
function sentencesPerLineIssues(text) {
  let issues = 0;
  sentencesPerLine({ lines: text.split('\n') }, () => {
    issues += 1;
  });
  return issues;
}

test('the corpus scanned is the real one', () => {
  const files = corpus();
  assert.ok(
    files.length >= CORPUS_FLOOR,
    `only ${files.length} tracked Markdown files were scanned; every assertion below would pass ` +
      'over a corpus that had stopped being collected'
  );
  const known = files.find(({ file }) => file === KNOWN_WRAPPED);
  assert.ok(Boolean(known), `${KNOWN_WRAPPED} is not in the scanned corpus`);
  assert.ok(
    wrappedSites(known.before).length > 0,
    `${KNOWN_WRAPPED} carries no wrap, so the detector is reporting nothing on a file that has them`
  );
});

test('joining rewords nothing, anywhere in the corpus', () => {
  const changed = corpus().filter(({ before, after }) => normalise(after) !== normalise(before));
  assert.deepEqual(
    changed.map(({ file }) => file),
    [],
    'joining a wrap changed the words of these files. A join may only replace a line break with ' +
      'one space; anything else is a rewrite of prose nobody reviewed.'
  );
});

test('joining moves no text across a blockquote boundary', () => {
  const drifted = [];
  for (const { file, before, after } of corpus()) {
    const insideQuotes = wrappedSites(before).filter((line) =>
      QUOTE_MARKERS.test(before.split('\n')[line - 1])
    ).length;
    if (quotedText(after) !== quotedText(before)) drifted.push(`${file} (quoted text changed)`);
    if (quotedLines(after).length !== quotedLines(before).length - insideQuotes) {
      drifted.push(`${file} (quoted line count moved by something other than its own joins)`);
    }
  }
  assert.deepEqual(drifted, []);
});

test('front matter, tables, headings, fences and list items are untouched', () => {
  const broken = [];
  for (const { file, before, after } of corpus()) {
    const frontMatter = /^---\n[\s\S]*?\n(?:---|\.\.\.)\n/u.exec(before);
    if (frontMatter && !after.startsWith(frontMatter[0])) broken.push(`${file} (front matter)`);
    // `reflowTables(after) === after` would fail on 61 files already padded before any join, and
    // `paddedRows` carries line numbers that a join legitimately shifts; the property that matters
    // is that the sequence of table rows is byte-identical.
    const rows = (text) => text.split('\n').filter((line) => isTableRow(line));
    if (rows(after).join('\n') !== rows(before).join('\n')) broken.push(`${file} (table rows)`);
    if (padded(after) !== padded(before)) broken.push(`${file} (table padding)`);
    for (const [name, shape] of [
      ['headings', HEADING],
      ['fences', FENCE],
      ['list items', LIST_ITEM],
    ]) {
      if (countMatching(after, shape) !== countMatching(before, shape)) {
        broken.push(`${file} (${name})`);
      }
    }
  }
  assert.deepEqual(broken, []);
});

test('joining is idempotent and leaves no site behind', () => {
  const unstable = [];
  for (const { file, after } of corpus()) {
    if (joinWraps(after) !== after) unstable.push(`${file} (a second pass changed it)`);
    if (wrappedSites(after).length > 0) unstable.push(`${file} (still reports wraps)`);
  }
  assert.deepEqual(unstable, []);
});

test('joining raises no new sentences-per-line issue', () => {
  const regressions = [];
  for (const { file, before, after } of corpus()) {
    const was = sentencesPerLineIssues(before);
    const now = sentencesPerLineIssues(after);
    if (now > was) regressions.push(`${file} (${was} -> ${now})`);
  }
  assert.deepEqual(
    regressions,
    [],
    'a join produced a line carrying two sentences, which is the defect this transform would ' +
      'otherwise trade the wrap for'
  );
});

test('wrappedSites reports a plain wrap and stays silent on complete sentences', () => {
  assert.deepEqual(wrappedSites('A sentence that runs\npast the line break.\n'), [1]);
  assert.deepEqual(wrappedSites('One sentence.\nAnother sentence.\n'), []);
  assert.deepEqual(joinWraps('A sentence that runs\npast the line break.\n'), 'A sentence that runs past the line break.\n');
});

test('wrappedSites stays silent inside YAML front matter', () => {
  const binding = '---\nname: fabricate-implementer\ndescription: Implement one change\ntools: Read\n---\n\nBody text.\n';
  assert.deepEqual(wrappedSites(binding), []);
  assert.equal(joinWraps(binding), binding);
});

test('wrappedSites stays silent on a kramdown block attribute above a blockquote', () => {
  assert.deepEqual(wrappedSites('{: .note }\n> Read this first.\n'), []);
});

test('a bare `>` is a paragraph break, and a wrap inside a blockquote still reports', () => {
  assert.deepEqual(wrappedSites('> First paragraph.\n>\n> Second paragraph.\n'), []);
  assert.deepEqual(wrappedSites('> A quoted sentence that runs\n> past the line break.\n'), [1]);
  assert.equal(
    joinWraps('> A quoted sentence that runs\n> past the line break.\n'),
    '> A quoted sentence that runs past the line break.\n'
  );
  // One line quoted and the other not is a membership boundary, never a wrap.
  assert.deepEqual(wrappedSites('> A quoted sentence that runs\npast the line break.\n'), []);
});

test('wrappedSites stays silent on a setext heading underline', () => {
  assert.deepEqual(wrappedSites('Title\n=====\n\nBody.\n'), []);
  assert.deepEqual(wrappedSites('Title\n---\n\nBody.\n'), []);
});

test('wrappedSites stays silent when the next line is a table row', () => {
  assert.deepEqual(wrappedSites('A line that does not end\n| a | b |\n| --- | --- |\n'), []);
});

test('wrappedSites reports an indented list-item continuation', () => {
  assert.deepEqual(wrappedSites('- A bullet whose sentence runs\n  past the line break.\n'), [1]);
  assert.equal(
    joinWraps('- A bullet whose sentence runs\n  past the line break.\n'),
    '- A bullet whose sentence runs past the line break.\n'
  );
  // But a line that merely fails to end a sentence never swallows the NEXT bullet.
  assert.deepEqual(wrappedSites('- A bullet that does not end\n- Another bullet.\n'), []);
});

test('an abbreviation or a version number at the line end is a wrap, not a sentence end', () => {
  assert.deepEqual(wrappedSites('Use a real fixture, e.g.\na dnd5e raster path.\n'), [1]);
  assert.deepEqual(wrappedSites('The gate pins markdownlint 0.40\nand nothing else.\n'), [1]);
  assert.deepEqual(wrappedSites('Prefer the primitive i.e.\nthe one that owns the meaning.\n'), [1]);
});

test('an HTML comment between two prose lines blocks the join', () => {
  assert.deepEqual(wrappedSites('A line that does not end\n<!-- markdownlint-disable MD013 -->\nand this one.\n'), []);
  // Tracked as a block, not a prefix: the comment's later lines do not start with `<!--`.
  assert.deepEqual(wrappedSites('A line that does not end\n<!-- an opening\nstill inside\n-->\nand this one.\n'), []);
});

test('a fenced block is never joined', () => {
  const fenced = 'Intro line that does not end\n\n```text\nroot\n  child\n```\n\nBody.\n';
  assert.deepEqual(wrappedSites(fenced), []);
  assert.equal(joinWraps(fenced), fenced);
});
