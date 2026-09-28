/** Issue 2005 (#2088 r1, M1) — the result card's dice line, read from the display projection. */
import assert from 'node:assert/strict';
import test from 'node:test';

import { checkDiceLine } from '../src/ui/presenters/checkDiceLine.js';
import { executedCheckDisplay } from '../src/ui/presenters/checkDisplay.js';

import { shippedLocalize } from './helpers/checkEvidenceFixtures.js';

const line = (data) => checkDiceLine(executedCheckDisplay({ data }), shippedLocalize);
const summed = (direction, formula, diceGroups, total) => ({
  product: 'sum',
  direction,
  comparison: 'meet',
  total,
  target: 12,
  margin: 0,
  resolvedFormula: formula,
  diceGroups,
});

test('a roll-under line names each die and that the dice were compared as rolled (frame 38)', () => {
  assert.equal(
    line(summed('under', '3d6', [{ group: '3d6', results: [2, 4, 3] }], 9)),
    '3d6 (2 + 4 + 3) = 9, compared as rolled'
  );
});

test('a roll-high line names each die in formula order, then the total (frame 37)', () => {
  assert.equal(
    line(summed('over', '1d20 + 3 + 7', [{ group: '1d20', results: [14] }], 24)),
    '1d20 (14) + 3 + 7 = 24'
  );
  assert.equal(
    line(
      summed(
        'over',
        '2d20kh1 + d4',
        [
          { group: '2d20', results: [17] },
          { group: '1d4', results: [2] },
        ],
        19
      )
    ),
    '2d20kh1 (17) + d4 (2) = 19'
  );
});

test('a die the record cannot match, and a record without a formula, invent nothing', () => {
  assert.equal(line(summed('over', '1d20 + 2', [{ group: '1d12', results: [3] }], 5)), '1d20 + 2 = 5');
  assert.equal(line(summed('over', '1d20', [], 9)), '1d20 = 9');
  assert.equal(line({ ...summed('over', '', [], 9), resolvedFormula: undefined }), '');
});

test('a flavor tag never splits a term, and a bracketed or clamped term is never annotated (G4)', () => {
  assert.equal(
    line(summed('over', '1d20[attack] + (1d4[fire])', [
      { group: '1d20', results: [14] },
      { group: '1d4', results: [3] },
    ], 17)),
    '1d20 (14) attack + (1d4 fire) = 17'
  );
  assert.equal(
    line(summed('over', 'max(1d4, 2) + 1d6', [
      { group: '1d4', results: [1] },
      { group: '1d6', results: [5] },
    ], 7)),
    'max(1d4, 2) + 1d6 (5) = 7',
    'the clamped die keeps its place in dice order, so the later die still matches'
  );
  assert.equal(
    line(summed('over', '1d20 + 2[Ring of 2d6]', [{ group: '1d20', results: [9] }], 11)),
    '1d20 (9) + 2 Ring of 2d6 = 11',
    'a die named in a flavour is never read as a term'
  );
});

test('a flavoured term is named in words, never as its raw roll flavour (frame 37, #2088 r2)', () => {
  assert.equal(
    line(summed('over', '1d20 + 3 + 7[Modifiers]', [{ group: '1d20', results: [14] }], 24)),
    '1d20 (14) + 3 + 7 modifiers = 24'
  );
  assert.equal(
    line(
      summed(
        'over',
        '1d20 + 2[Smith’s Hammer] + 1[Modifiers] + (1d4)[Modifiers]',
        [
          { group: '1d20', results: [11] },
          { group: '1d4', results: [3] },
        ],
        17
      )
    ),
    '1d20 (11) + 2 Smith’s Hammer + 1 modifiers + (1d4) modifiers = 17'
  );
});
