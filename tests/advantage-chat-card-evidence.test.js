/**
 * The real-Foundry advantage rule chat card assertions (issue 2007): the producer logic the smoke
 * binds to a craft's own posted messages, proven against constructed roll read-backs and a control
 * per case so a wrong formula, active count or pool size is caught rather than waved through.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ADVANTAGE_CHAT_CARD_CASES,
  advantageRollFailures,
} from '../scripts/lib/advantageChatCardEvidence.js';

const caseOf = (id) => ADVANTAGE_CHAT_CARD_CASES.find((entry) => entry.id === id);

/** An active/inactive Die-shaped result. */
const die = (result, active = true) => ({ result, active });

/** The exact roll a passing case's craft would post, read back through `game.messages.get`. */
function rollFor(id) {
  const entry = caseOf(id);
  if (entry.expectedPoolSize) {
    return {
      className: 'FabricateCountRoll',
      formula: '',
      results: Array.from({ length: entry.expectedPoolSize }, () => die(6)),
    };
  }
  const results = entry.keptOf ? [die(9), die(3, false)] : [die(6)];
  return { className: 'Roll', formula: entry.expectedFormula, results };
}

test('every case passes against the roll its own craft would post', () => {
  for (const { id } of ADVANTAGE_CHAT_CARD_CASES) {
    assert.deepEqual(advantageRollFailures(id, [rollFor(id)]), [], id);
  }
});

test('bare-formula comparison ignores Foundry re-spacing and a wrapping bonus bracket', () => {
  const roll = { className: 'Roll', formula: ' 2d12kh1  +  3 ', results: [die(9), die(3, false)] };
  assert.deepEqual(advantageRollFailures('keep', [roll]), []);
});

test('an unknown case id fails rather than passing vacuously', () => {
  assert.match(advantageRollFailures('nonexistent', [])[0], /unknown advantage chat card case/);
});

test('no posted roll matches the expected formula', () => {
  assert.match(
    advantageRollFailures('bonus', [{ className: 'Roll', formula: '1d12', results: [] }]).join(
      ', '
    ),
    /no posted roll matched "1d12\+\(1d6\)"/
  );
  assert.match(advantageRollFailures('bonus', []).join(', '), /saw none/);
});

test('a keep case with the wrong dice count or active count fails', () => {
  const wrongCount = { className: 'Roll', formula: '2d12kh1+3', results: [die(9)] };
  assert.match(advantageRollFailures('keep', [wrongCount]).join(', '), /1 dice with 1 active/);
  const bothActive = { className: 'Roll', formula: '2d12kh1+3', results: [die(9), die(3)] };
  assert.match(advantageRollFailures('keep', [bothActive]).join(', '), /2 dice with 2 active/);
});

test('keep-under disadvantage keeps the highest, not the lowest', () => {
  // Disadvantage under target is `kh` (the design's over/under table): a `kl` formula must fail.
  const wrongDirection = {
    className: 'Roll',
    formula: '2d12kl1',
    results: [die(9), die(3, false)],
  };
  assert.match(
    advantageRollFailures('keep-under', [wrongDirection]).join(', '),
    /no posted roll matched "2d12kh1"/
  );
});

test('a count case fails when no FabricateCountRoll is posted, or the pool is the wrong size', () => {
  assert.match(
    advantageRollFailures('count', [{ className: 'Roll', formula: '', results: [] }]).join(', '),
    /no FabricateCountRoll message was posted/
  );
  const shortPool = { className: 'FabricateCountRoll', formula: '', results: [die(6), die(6)] };
  assert.match(
    advantageRollFailures('count', [shortPool]).join(', '),
    /pool rolled 2 dice, expected 3/
  );
});

test('mode off must roll the authored formula verbatim, never a keep or bonus rewrite', () => {
  const kept = { className: 'Roll', formula: '2d12kh1+5', results: [die(9), die(3, false)] };
  assert.match(advantageRollFailures('off', [kept]).join(', '), /no posted roll matched "1d12\+5"/);
});
