/** The design-system manifest and library cite by selector, symbol or block, never by line (issue 1482). */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const CITING_FILES = [
  'scripts/lib/designSystemPrimitives.json',
  'openspec/specs/design-system/library.html',
];

/** `file.ext:123`, and a bare continuation such as `` `:1406` `` or `<b>:854</b>` after one. */
const LINE_CITATIONS = [/\.(?:s?css|html|svelte|js|mjs|ts|json|md):\d+/g, /[`>( ]:\d{2,}(?!\d)/g];

/** Every line citation in a text, as `line N: match`. */
function lineCitationsIn(text) {
  return text
    .split('\n')
    .flatMap((line, index) =>
      LINE_CITATIONS.flatMap((pattern) =>
        [...line.matchAll(pattern)].map((match) => `line ${index + 1}: ${match[0].trim()}`)
      )
    );
}

test('the citation patterns recognise every form they exist to refuse', () => {
  const sample =
    'see `library.html:1405`/`:1406`, fabricate.css:13637, Button.svelte:103-108, <b>:854</b>';
  assert.equal(lineCitationsIn(sample).length, 5);
  assert.deepEqual(lineCitationsIn('`.k-kicker` rule · minmax(0, 1fr) · 12:30 · issue 1482'), []);
});

for (const file of CITING_FILES) {
  test(`${file} cites by selector, symbol or block, never by line number`, () => {
    const found = lineCitationsIn(readFileSync(path.join(REPO_ROOT, file), 'utf8'));
    assert.deepEqual(
      found,
      [],
      `${file} cites by line number, which is stale the moment the cited file is edited. Name ` +
        'the selector (`styles/<partial>.css` plus the rule), the symbol, or the library block ' +
        "(`library.html`'s `<Avatar>` block) instead."
    );
  });
}

/** The two files whose line numbers shift with every edit: the shared sheet and the library. */
const SHIFTING_CITATION = /\b(?:fabricate[\w-]*\.css|library\.html):\d+/g;

/** Where prose cites them: source, tests, scripts and the specifications (issue 1604). */
const CITING_ROOTS = ['src/', 'tests/', 'scripts/', 'openspec/specs/'];

const CITING_EXTENSIONS = /\.(?:svelte|m?js|css|json|md|html)$/;

/**
 * Files whose `name.css:N` text is a fixture and not a citation: this file and the register test
 * feed the patterns a citation to refuse, and the stylesheet lint's own tests spell its report.
 */
const FIXTURE_FILES = new Set([
  'tests/design-system-citation-form.test.js',
  'tests/design-system-primitives.test.js',
  'tests/stylesheet-logical-file.test.js',
]);

/** The screenshot-evidence recipe's `unlocated:<file>:<n>` target is data, not prose. */
const DATA_LINE = /unlocated:/;

const trackedFiles = execFileSync('git', ['ls-files'], { cwd: REPO_ROOT, encoding: 'utf8' })
  .split('\n')
  .filter(
    (file) => CITING_ROOTS.some((root) => file.startsWith(root)) && CITING_EXTENSIONS.test(file)
  );

test('the shifting-citation pattern sees a sheet or library line and nothing else', () => {
  assert.equal(
    'styles/fabricate.css:9859, fabricate-rules.css:6, library.html:219-220'.match(
      SHIFTING_CITATION
    ).length,
    3
  );
  assert.equal('Notice.svelte:145, grammar.pegjs:17, library.html'.match(SHIFTING_CITATION), null);
  assert.ok(trackedFiles.length > 1000, `the walk found ${trackedFiles.length} files to read`);
});

/** Every shifting citation in one file's text, as `file:line cite`, bar the data rows. */
function shiftingCitationsIn(file, text) {
  const found = [];
  for (const [index, line] of text.split('\n').entries()) {
    if (DATA_LINE.test(line)) continue;
    for (const match of line.matchAll(SHIFTING_CITATION)) {
      found.push(`${file}:${index + 1} ${match[0]}`);
    }
  }
  return found;
}

test('no source, test, script or specification cites the sheet or the library by line number', () => {
  const found = trackedFiles.flatMap((file) =>
    FIXTURE_FILES.has(file)
      ? []
      : shiftingCitationsIn(file, readFileSync(path.join(REPO_ROOT, file), 'utf8'))
  );
  assert.deepEqual(
    found,
    [],
    'a line number into the shared sheet or the library is stale the moment either is edited. ' +
      'Name the selector (`styles/<partial>.css` plus the rule) or the library entry instead.'
  );
});
