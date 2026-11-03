/**
 * The shared prose files state what a thing is and does now, never which issue, epic, pull request
 * or dated ruling produced it: GitHub tracks the work, and a citation per change is a line every
 * later change appends to.
 *
 * Their Markdown also holds no line with two or more semicolons outside inline code and link
 * targets. The one-sentence-per-line rule splits only at `.`, `!` and `?`, so a chain of clauses
 * joined by semicolons passes it as one sentence and grows into one giant line; put each clause on
 * its own line as a sentence, or make the series a list.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const MARKDOWN_FILES = [
  'docs/api/index.md',
  'docs/domain/records.md',
  'openspec/specs/design-system/spec.md',
  'openspec/specs/ui-extension-points/spec.md',
];

const SHARED_PROSE_FILES = [
  ...MARKDOWN_FILES,
  'openspec/specs/design-system/library.html',
  'scripts/lib/designSystemPrimitives.json',
];

/**
 * A work-item citation: `issue 2540`, `issues #2456`, `epic 1495`, `PR 167`, `pull request 12`, a
 * bare `#2540`, or an ISO date. A `#` preceded by `&` or a word character is an HTML entity or a
 * fragment, not an issue, and three to five digits after `#` leave `#fff`-style hex colours alone.
 */
const PROVENANCE = [
  /\b(?:issues?|epics?|PRs?|pull requests?)\b[\s#]*\d{2,5}\b/giu,
  /(?<![\w&])#\d{3,5}\b/gu,
  /\b20\d\d-[01]\d-[0-3]\d\b/gu,
];

/** Every provenance citation in `text`, as `line N: match`. */
function provenanceIn(text) {
  return text
    .split('\n')
    .flatMap((line, index) =>
      PROVENANCE.flatMap((pattern) =>
        [...line.matchAll(pattern)].map((match) => `line ${index + 1}: ${match[0]}`)
      )
    );
}

/** Every Markdown line outside a fence with two or more semicolons in its prose. */
function semicolonChainsIn(markdown) {
  let fenced = false;
  return markdown.split('\n').flatMap((line, index) => {
    if (/^\s*```/u.test(line)) fenced = !fenced;
    if (fenced) return [];
    const prose = line
      .replaceAll(/`[^`]*`/gu, '')
      .replaceAll(/\]\([^)]*\)/gu, ']')
      .replaceAll(/&#?\w+;/gu, '');
    const count = prose.split(';').length - 1;
    return count >= 2 ? [`line ${index + 1}: ${count} semicolons`] : [];
  });
}

test('the provenance check catches each citation form and passes entities, colours and ids', () => {
  const caught = [
    'decided in issue 2540.',
    'the toggle (#2540) ships',
    'see [issue #2448](https://github.com/mistersilver-uk/fabricate/issues/2448).',
    'part of epic 1495',
    'PR 167 moved it',
    'ruled 2026-10-12',
  ];
  for (const sample of caught) assert.ok(provenanceIn(sample).length > 0, sample);
  const passed = 'a &#8212; dash, colour #fff, `#i-trash`, a 12px gap and 3 issues to fix';
  assert.deepEqual(provenanceIn(passed), []);
});

test('the semicolon check flags a chain and passes code, link targets and entities', () => {
  assert.deepEqual(semicolonChainsIn('one; two; three.'), ['line 1: 2 semicolons']);
  assert.deepEqual(semicolonChainsIn('one; two.'), []);
  assert.deepEqual(semicolonChainsIn('`a; b; c` and [x](u;v;w) &mdash; &times;.'), []);
  assert.deepEqual(semicolonChainsIn('```\na; b; c\n```'), []);
});

for (const file of SHARED_PROSE_FILES) {
  test(`${file} cites no issue, epic, pull request or date`, () => {
    const text = readFileSync(path.join(REPO_ROOT, file), 'utf8');
    assert.deepEqual(provenanceIn(text), [], `${file} states provenance: state behaviour instead`);
  });
}

for (const file of MARKDOWN_FILES) {
  test(`${file} chains no clauses with semicolons`, () => {
    const text = readFileSync(path.join(REPO_ROOT, file), 'utf8');
    assert.deepEqual(semicolonChainsIn(text), [], `${file} chains clauses on one line`);
  });
}
