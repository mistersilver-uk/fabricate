/** The design-system manifest and library cite by selector, symbol or block, never by line (issue 1482). */
import assert from 'node:assert/strict';
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
const LINE_CITATIONS = [/\.(?:css|html|svelte|js|mjs|md):\d+/g, /[`>( ]:\d{2,}(?!\d)/g];

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
