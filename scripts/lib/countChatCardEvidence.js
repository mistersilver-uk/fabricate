/**
 * The real-Foundry count chat card cases (issue 2006): each crafting check configuration, rolled
 * deterministically by construction, and the checks its posted card and roll message must pass.
 * Pure and Playwright-free, so the smoke's assertions are unit-tested against the real renderer.
 */
import { summarizeCraftCard } from './craftChatCardSummary.js';

export { pickCraftCardMessage, summarizeCraftCard } from './craftChatCardSummary.js';

const count = (pool) => ({
  rollFormula: '',
  thresholdMode: 'meet',
  evaluation: { product: 'count', direction: 'over', pool },
});

/** The smoke case ids, in walk order, each with the `craftingCheck.simple` it rolls. */
export const COUNT_CHAT_CARD_CASES = Object.freeze([
  {
    id: 'pass',
    // Every d6 meets 1 and explodes once: two dice net four against two needed.
    check: count({
      die: 6,
      base: '2',
      threshold: '1',
      required: 2,
      explode: { enabled: true, faces: { kind: 'from', value: 1 }, once: true },
    }),
  },
  { id: 'fail', check: count({ die: 6, base: '2', threshold: '7', required: 1 }) },
  {
    id: 'botch',
    // No d6 reaches 7 and every face cancels: three dice net −3.
    check: count({
      die: 6,
      base: '3',
      threshold: '7',
      required: 1,
      cancel: { enabled: true, faces: { kind: 'from', value: 6 } },
    }),
  },
  {
    id: 'zero',
    check: count({ die: 6, base: '0', threshold: '4', required: 1, zeroPoolFails: true }),
  },
  {
    id: 'over-control',
    // A summed roll-over check that always passes, so its card states Needed and Margin rows.
    check: {
      rollFormula: '1d20 + 30',
      dc: 10,
      thresholdMode: 'meet',
      evaluation: { product: 'sum', direction: 'over', target: { source: 'fixed' } },
    },
  },
]);

const COUNT_ROLL_CLASS = 'FabricateCountRoll';

/** Code-point order, so a multiset compares the same whatever the locale. */
const sorted = (values) => [...values].sort((a, b) => (a < b ? -1 : Number(a > b)));

/** A tile or an active die result as `face:marks`, so a card and its Roll compare as multisets. */
const tileKey = ({ face, marks }) => `${face}:${sorted(marks).join('+')}`;
const resultKey = (result) =>
  tileKey({
    face: result.result,
    marks: [
      result.success && 'qualified',
      result.failure && 'cancelled',
      result.exploded && 'exploded',
    ].filter(Boolean),
  });

/** Each count case's pill, tile count, tile mark shapes (`:` plus sorted marks) and rows. */
const EXPECTED = Object.freeze({
  pass: {
    result: 'success',
    shapes: [':exploded+qualified', ':qualified'],
    tileCount: 4,
    evidence: ['count', 'needed'],
  },
  fail: { result: 'failure', shapes: [':'], tileCount: 2, evidence: ['count', 'needed'] },
  botch: {
    result: 'failure',
    botched: true,
    shapes: [':cancelled'],
    tileCount: 3,
    evidence: ['count', 'needed'],
  },
  zero: { result: 'failure', shapes: [], tileCount: 0, evidence: ['result'] },
});

const shapeOf = ({ marks }) => `:${sorted(marks).join('+')}`;

/** The marks a case's tiles must carry, whatever faces the dice showed. */
function tileShapeFailures(caseId, summary, expected) {
  const failures = [];
  if (summary.tiles.length !== expected.tileCount) {
    failures.push(`${caseId}: ${summary.tiles.length} tiles, expected ${expected.tileCount}`);
  }
  const shapes = sorted(new Set(summary.tiles.map(shapeOf)));
  if (JSON.stringify(shapes) !== JSON.stringify(sorted(expected.shapes))) {
    failures.push(
      `${caseId}: tile marks ${shapes.join(', ')}, expected ${expected.shapes.join(', ')}`
    );
  }
  if (caseId === 'pass') {
    const generated = summary.tiles.filter((tile) => tile.generated);
    if (generated.length !== 2 || generated.some((tile) => shapeOf(tile) !== ':qualified')) {
      failures.push('pass: each explosion must be its own qualified tile');
    }
  }
  return failures;
}

/** The count Roll's own active results must carry exactly the card's tile marks. */
function rollAgreementFailures(caseId, summary, rollMessages) {
  const countRolls = rollMessages.filter((message) => message.className === COUNT_ROLL_CLASS);
  if (caseId === 'zero') {
    return rollMessages.length === 0 ? [] : ['zero: a pool reduced to zero posted a roll message'];
  }
  if (countRolls.length !== 1) {
    return [`${caseId}: ${countRolls.length} count Roll messages, expected 1`];
  }
  const rolled = countRolls[0].results.filter((result) => result.active !== false).map(resultKey);
  const tiles = summary.tiles.map(tileKey);
  return JSON.stringify(sorted(rolled)) === JSON.stringify(sorted(tiles))
    ? []
    : [`${caseId}: card tiles ${tiles.join(', ')} disagree with the Roll's ${rolled.join(', ')}`];
}

function controlFailures(summary, rollMessages) {
  const failures = [];
  if (summary.result !== 'success') failures.push('over-control: expected the Success pill');
  if (summary.tiles.length > 0 || summary.countSummary) {
    failures.push('over-control: a summed card drew count evidence');
  }
  for (const id of ['needed', 'margin']) {
    if (!summary.evidence.includes(id)) failures.push(`over-control: no ${id} row`);
  }
  if (rollMessages.length === 0 || rollMessages.some((m) => m.className === COUNT_ROLL_CLASS)) {
    failures.push('over-control: expected its summed roll message and no count Roll');
  }
  return failures;
}

/**
 * Every way one case's card and the roll messages its execute created fall short, empty when it
 * passes. `rollMessages` are `{ className, results }` for each created message carrying a roll.
 */
export function countCardFailures(caseId, { card, rollMessages = [] }) {
  const summary = summarizeCraftCard(card);
  if (caseId === 'over-control') return controlFailures(summary, rollMessages);
  const expected = EXPECTED[caseId];
  if (!expected) return [`unknown count chat card case "${caseId}"`];
  const failures = [];
  if (summary.result !== expected.result) {
    failures.push(`${caseId}: result pill ${summary.result}, expected ${expected.result}`);
  }
  if (summary.botched !== (expected.botched === true)) {
    failures.push(`${caseId}: botch pill ${summary.botched ? 'shown' : 'missing'}`);
  }
  if (!summary.countSummary || summary.rollValue) {
    failures.push(`${caseId}: the count summary line must replace the numeric roll row`);
  }
  for (const id of expected.evidence) {
    if (!summary.evidence.includes(id)) failures.push(`${caseId}: no ${id} row`);
  }
  failures.push(
    ...tileShapeFailures(caseId, summary, expected),
    ...rollAgreementFailures(caseId, summary, rollMessages)
  );
  return failures;
}
