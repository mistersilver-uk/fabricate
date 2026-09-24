/**
 * DOMAIN.md CARRIES NO COLUMN PADDING, AND THE TRANSFORM THAT REMOVED IT LOSES NOTHING (issue
 * #1661).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  isDelimiterRow,
  isTableRow,
  paddedRows,
  reflowTables,
  splitRow,
} from '../scripts/lib/markdownTables.js';

const REPOSITORY_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOMAIN = readFileSync(path.join(REPOSITORY_ROOT, 'DOMAIN.md'), 'utf8');

/** The size `DOMAIN.md` must stay under, in bytes. */
const MAXIMUM_BYTES = 340 * 1024;

/** The file's real size on disk. `String#length` counts UTF-16 units, and 158 lines here are
 * not ASCII — em dashes, arrows, ellipses — so the two disagree by a few KB. */
const DOMAIN_BYTES = Buffer.byteLength(DOMAIN, 'utf8');

/** Table rows in the file, so the assertions below cannot be measuring an empty set. */
const TABLE_ROWS = DOMAIN.split('\n').filter((line) => isTableRow(line));

test('DOMAIN.md is the corpus these assertions think it is', () => {
  // A guard over a file that stopped having tables — or stopped being read — reports success
  // forever. 21 rows in one table.
  // The count is exact because two looser ones are close enough to be mistaken for it:
  // `line.startsWith('|')` answers 118 and `/^\s*\|/` answers 128. The difference is 107 lines of
  // an ASCII tree of the world-settings layout, which `isTableRow` excludes because they do not
  // CLOSE with a pipe. A floor above the real corpus fails forever and invites lowering until it
  // passes, at which point it measures nothing, so this is an exact equality.
  assert.equal(TABLE_ROWS.length, 21, 'the DOMAIN.md table corpus changed size');
  assert.ok(DOMAIN.length > 100_000, 'DOMAIN.md is far smaller than any version of this document');
});

test('DOMAIN.md carries no column padding', () => {
  const padded = paddedRows(DOMAIN);
  assert.deepEqual(
    padded.map(({ number }) => number),
    [],
    'these DOMAIN.md table rows are padded to column width again. Run `npm run format:tables` ' +
      'to re-emit them — `MD060` is off, so `npm run lint:md` will not tell you, and an editor ' +
      'that aligns tables on save will do it without asking:\n' +
      padded.map(({ number, line }) => `  ${number}: ${line.slice(0, 80)}…`).join('\n')
  );
});

test('DOMAIN.md is a fixed point of the transform, byte for byte', () => {
  // Stronger than "no padded rows": it also catches a delimiter row that grew back, an indent that
  // changed, or a row this file's own `isTableRow` no longer recognises.
  assert.equal(reflowTables(DOMAIN), DOMAIN);
});

test('DOMAIN.md stays under its size ceiling', () => {
  assert.ok(
    DOMAIN_BYTES <= MAXIMUM_BYTES,
    `DOMAIN.md is ${Math.round(DOMAIN_BYTES / 1024)} KB, over the ${MAXIMUM_BYTES / 1024} KB ` +
      'ceiling. If the document has genuinely grown, raise the ceiling deliberately; if a table ' +
      'was re-padded, the assertion above will say so too.'
  );
});

test('splitRow keeps an escaped pipe inside its cell', () => {
  // THE BUG THIS TRANSFORM SHIPPED ON ITS FIRST ATTEMPT, pinned as a fixture.
  const cell = "(`'success' \\| 'failure' \\| 'none'`)";
  const row = `| outcome | ${cell} | default |`;
  assert.deepEqual(splitRow(row), ['outcome', cell, 'default']);

  // And the naive reading really would disagree — so this fixture is exercising the difference
  // rather than a shape both implementations get right.
  assert.notEqual(row.slice(1, -1).split('|').length, splitRow(row).length);
});

test('the reflow is falsifiable in every direction it claims', () => {
  // A "must report nothing" gate is worth nothing until you have watched it report something.
  const clean = '| a | b |\n| --- | --- |\n| one | two |\n';
  assert.equal(reflowTables(clean), clean, 'an already-reflowed table must be left alone');
  assert.deepEqual(paddedRows(clean), []);

  // 1. Padding returns.
  const padded = '| a   | b   |\n| --- | --- |\n| one   | two |\n';
  assert.equal(paddedRows(padded).length, 2, 'a padded header and a padded row must both report');
  assert.equal(reflowTables(padded), clean);

  // 2. A long delimiter run returns.
  const longDelimiter = '| a | b |\n| ------------ | ---- |\n| one | two |\n';
  assert.equal(paddedRows(longDelimiter).length, 1);
  assert.equal(reflowTables(longDelimiter), clean);

  // 3. Alignment colons must SURVIVE, not be normalised away — they change how the table renders.
  const aligned = '| a | b |\n| :--- | ---: |\n| one | two |\n';
  assert.equal(reflowTables(aligned), aligned);
  assert.deepEqual(paddedRows(aligned), []);
  assert.equal(isDelimiterRow(splitRow('| :--- | ---: |')), true);

  // 4. Non-table text is untouched, including a line that merely contains a pipe.
  assert.equal(reflowTables('A sentence with a | pipe in it.\n'), 'A sentence with a | pipe in it.\n');
  assert.equal(isTableRow('A sentence with a | pipe in it.'), false);

  // 4b. A FENCE IS VERBATIM. The fixture is deliberately a PADDED table: an already-canonical one
  // would survive by coincidence rather than by fence handling, and an earlier draft of this test
  // used exactly that and proved nothing.
  const fenced = '```markdown\n| col |   col |\n| --- | ------ |\n```\n';
  assert.equal(reflowTables(fenced), fenced);
  assert.deepEqual(paddedRows(fenced), []);
  assert.equal(isTableRow('| col |   col |'), true, 'the fixture must be a row the transform WOULD rewrite');

  // 4c. `||` carries no cell, so re-emitting it as `|  |` would be a change, not a normalisation.
  assert.equal(reflowTables('||\n'), '||\n');
  assert.deepEqual(paddedRows('||\n'), []);

  // 4d. CRLF is a line ending, not padding. Without `/\r?\n/` every row of a CRLF checkout reads
  //     as re-padded — a red gate with a message describing the wrong problem entirely.
  assert.equal(paddedRows('| a   | b |\r\n| --- | --- |\r\n').length, 1);

  // 5. A cell's own content is never trimmed away, only its padding.
  assert.deepEqual(splitRow('|   `a b`   |   c   |'), ['`a b`', 'c']);
});
