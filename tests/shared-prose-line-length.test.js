/**
 * The prose files many changes edit at once hold no line longer than {@link LINE_LIMIT}, so two
 * independent additions land on different lines and merge without conflict.
 *
 * Markdown puts one sentence on a line, `library.html` one block, list item or sentence, and a
 * `designSystemPrimitives.json` `why` is an array of sentences the loader joins with a space.
 * 1400 sits just above the longest line nothing can break without changing what it renders: a
 * `library.html` specimen button named by its own content (about 1340 characters).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  DESIGN_SYSTEM_PRIMITIVES,
  NOT_A_PRIMITIVE,
  RULED_OUT,
} from '../scripts/lib/designSystemPrimitives.js';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const LINE_LIMIT = 1400;

const SHARED_PROSE_FILES = [
  'docs/api/index.md',
  'docs/domain/records.md',
  'openspec/specs/design-system/library.html',
  'openspec/specs/design-system/spec.md',
  'openspec/specs/ui-extension-points/spec.md',
  'scripts/lib/designSystemPrimitives.json',
];

/** Every line of `text` longer than `limit`, as `line N: <length> characters`. */
function overlongLines(text, limit) {
  return text
    .split('\n')
    .flatMap((line, index) =>
      line.length > limit ? [`line ${index + 1}: ${line.length} characters`] : []
    );
}

test('the line check flags a line one past the limit and passes one at it', () => {
  const atLimit = 'a'.repeat(LINE_LIMIT);
  assert.deepEqual(overlongLines(`short\n${atLimit}\n`, LINE_LIMIT), []);
  assert.deepEqual(overlongLines(`short\n${atLimit}b\n`, LINE_LIMIT), [
    `line 2: ${LINE_LIMIT + 1} characters`,
  ]);
});

for (const file of SHARED_PROSE_FILES) {
  test(`${file} holds no line longer than ${LINE_LIMIT} characters`, () => {
    const text = readFileSync(path.join(REPO_ROOT, file), 'utf8');
    assert.deepEqual(
      overlongLines(text, LINE_LIMIT),
      [],
      `${file} has a line past ${LINE_LIMIT} characters: put one sentence or one block on a line`
    );
  });
}

test('the loader joins a `why` written as an array of sentences with one space', () => {
  const raw = JSON.parse(
    readFileSync(path.join(REPO_ROOT, 'scripts/lib/designSystemPrimitives.json'), 'utf8')
  );
  const loaded = {
    designSystemPrimitives: DESIGN_SYSTEM_PRIMITIVES,
    notAPrimitive: NOT_A_PRIMITIVE,
    ruledOut: RULED_OUT,
  };
  let arrays = 0;
  for (const [table, rows] of Object.entries(loaded)) {
    for (const [index, row] of rows.entries()) {
      const why = raw[table][index].why;
      if (Array.isArray(why)) arrays += 1;
      assert.equal(row.why, Array.isArray(why) ? why.join(' ') : why, `${table}[${index}]`);
    }
  }
  assert.ok(arrays > 0, 'no `why` is written as an array, so the join is unexercised');
});
