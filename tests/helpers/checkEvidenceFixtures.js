/** Executed check projections for the evidence-row suites (issue 2005), and the shipped copy. */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { executedCheckDisplay } from '../../src/ui/presenters/checkDisplay.js';

const LANG = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'lang', 'en.json'), 'utf8')
);

/** The shipped string for a dotted key, else the key, as Foundry's `localize` answers. */
export function shippedLocalize(key) {
  const value = String(key)
    .split('.')
    .reduce((node, part) => (node && typeof node === 'object' ? node[part] : undefined), LANG);
  return typeof value === 'string' ? value : key;
}

/**
 * Sum/under against Sera Vane's `@skills.smith.level` 12, Hard Work's −2 and a library +1, raised by
 * a situational 1d4 of 3; `3d6` rolled 2, 4 and 3.
 */
export const UNDER_DATA = Object.freeze({
  product: 'sum',
  direction: 'under',
  comparison: 'meet',
  total: 9,
  target: 14,
  margin: 5,
  preRolls: [
    { source: 'situational', label: '', expression: '1d4', total: 3, destination: 'target' },
  ],
  targetSource: 'attribute',
  targetExpression: '@skills.smith.level',
  targetActor: 'Sera Vane',
  targetTerms: [
    { kind: 'anchor', value: 12 },
    { kind: 'adjustment', value: -2, label: 'Hard Work' },
    { kind: 'benefit', value: 1, source: 'library' },
  ],
  resolvedFormula: '3d6',
  diceGroups: [{ groupId: 0, group: '3d6', sum: 9, results: [2, 4, 3] }],
});

export const UNDER_ROWS = Object.freeze([
  [
    'target',
    'Target',
    '14 · Sera Vane @skills.smith.level 12, Hard Work −2, modifiers +1, situational +3',
  ],
  ['preRolled', 'Pre-rolled', 'Situational 1d4 rolled 3, raising the target'],
  ['margin', 'Margin', '+5 under the target'],
]);

export const OVER_FIXED_DATA = Object.freeze({
  product: 'sum',
  direction: 'over',
  comparison: 'meet',
  dc: 12,
  total: 15,
  target: 12,
  margin: 3,
});

export const PUBLIC = Object.freeze({ rollMode: 'publicroll', secret: false });

/** Every visibility a card must not state evidence for, unknown included. */
export const NOT_PUBLIC = Object.freeze([
  { rollMode: 'gmroll', secret: false },
  { rollMode: 'blindroll', secret: false },
  { rollMode: 'selfroll', secret: false },
  { rollMode: 'publicroll', secret: true },
  null,
]);

/** The projection a card or result box receives for `data` executed under `visibility`. */
export function executedCheck(data = UNDER_DATA, visibility = PUBLIC) {
  return executedCheckDisplay({ data: structuredClone(data), visibility });
}
