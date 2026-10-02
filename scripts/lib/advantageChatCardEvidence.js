/**
 * The real-Foundry advantage rule chat card cases (issue 2007): each check's advantage rule and the
 * one choice the smoke answers it with, decided by construction — the posted Roll's formula and
 * active dice, read back through `game.messages.get(id)`, never the dice it shows. Pure and
 * Playwright-free, so the smoke's assertions are unit-tested against the shipped engine's output.
 */
export { pickCraftCardMessage } from './craftChatCardSummary.js';

const sum = (direction, advantage) => ({
  thresholdMode: 'meet',
  evaluation: { product: 'sum', direction, target: { source: 'fixed' } },
  advantage,
});

/** The smoke case ids, in walk order: each rewrites `check`, then answers the prompt with `choice`. */
export const ADVANTAGE_CHAT_CARD_CASES = Object.freeze([
  {
    id: 'keep',
    choice: 'advantage',
    check: { rollFormula: '1d12 + 3', dc: 1, ...sum('over', { mode: 'keep' }) },
    expectedFormula: '2d12kh1+3',
    keptOf: 2,
  },
  {
    id: 'keep-under',
    // Under, Disadvantage keeps the highest (a sum that must come in under its target benefits
    // from the lower dice, so the lower choice is Advantage here).
    choice: 'disadvantage',
    check: { rollFormula: '1d12', dc: 100, ...sum('under', { mode: 'keep' }) },
    expectedFormula: '2d12kh1',
    keptOf: 2,
  },
  {
    id: 'bonus',
    choice: 'advantage',
    check: {
      rollFormula: '1d12',
      dc: 1,
      ...sum('over', { mode: 'bonus', bonusExpression: '1d6' }),
    },
    expectedFormula: '1d12+(1d6)',
  },
  {
    id: 'count',
    choice: 'advantage',
    check: {
      rollFormula: '',
      thresholdMode: 'meet',
      evaluation: {
        product: 'count',
        direction: 'over',
        pool: { die: 6, base: '2', threshold: '1', required: 1 },
      },
      advantage: { countEnabled: true, countDice: 1 },
    },
    expectedPoolSize: 3,
  },
  {
    id: 'off',
    choice: 'roll',
    check: { rollFormula: '1d12 + 5', dc: 1, ...sum('over', { mode: 'off' }) },
    expectedFormula: '1d12+5',
  },
]);

/** A formula without spacing or the one pair of brackets a rolled bonus may be wrapped in. */
const bare = (formula) =>
  String(formula ?? '')
    .replaceAll(/\s+/g, '')
    .replace(/^\((.*)\)$/, '$1');

/**
 * Every way one case's read-back rolls fall short, empty when it passes. `rolls` are
 * `{ className, formula, results: [{ result, active }] }` per Roll, read back via
 * `game.messages.get(id)` so a `Roll.fromData` round trip is proved along with the formula.
 */
export function advantageRollFailures(caseId, rolls) {
  const entry = ADVANTAGE_CHAT_CARD_CASES.find((candidate) => candidate.id === caseId);
  if (!entry) return [`unknown advantage chat card case "${caseId}"`];
  if (entry.expectedPoolSize) {
    const pool = (rolls ?? []).find((roll) => roll.className === 'FabricateCountRoll');
    if (!pool) return [`${caseId}: no FabricateCountRoll message was posted`];
    return pool.results.length === entry.expectedPoolSize
      ? []
      : [
          `${caseId}: the pool rolled ${pool.results.length} dice, expected ${entry.expectedPoolSize}`,
        ];
  }
  const roll = (rolls ?? []).find(
    (candidate) => bare(candidate.formula) === bare(entry.expectedFormula)
  );
  if (!roll) {
    const seen = (rolls ?? []).map((candidate) => candidate.formula).join(', ') || 'none';
    return [`${caseId}: no posted roll matched "${entry.expectedFormula}" (saw ${seen})`];
  }
  if (!entry.keptOf) return [];
  const active = (roll.results ?? []).filter((result) => result.active !== false);
  return roll.results.length === entry.keptOf && active.length === 1
    ? []
    : [
        `${caseId}: ${roll.results.length} dice with ${active.length} active, ` +
          `expected ${entry.keptOf} dice with exactly 1 active`,
      ];
}
