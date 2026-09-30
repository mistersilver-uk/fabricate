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

/**
 * A count check (issue 2006): a d10 pool of 3 grown by a library +1, succeeding on 8 or above read
 * from Sera Vane at 9 and moved +1; the 10 exploded into a 5 and a 1 cancelled, netting 2 of 2.
 */
export const COUNT_DATA = Object.freeze({
  product: 'count',
  direction: 'over',
  comparison: 'meet',
  dc: null,
  target: 8,
  total: 2,
  successes: 3,
  cancelled: 1,
  margin: 0,
});

export const COUNT_DISPLAY = Object.freeze({
  die: 10,
  results: [
    { index: 0, face: 10, active: true, exploded: true, explodedFrom: null, qualified: true },
    { index: 1, face: 1, active: true, explodedFrom: null, cancelled: true },
    { index: 2, face: 8, active: true, explodedFrom: null, qualified: true },
    { index: 3, face: 9, active: true, explodedFrom: null, qualified: true },
    { index: 4, face: 5, active: true, explodedFrom: 0 },
  ],
  qualified: 3,
  cancelled: 1,
  net: 2,
  required: 2,
  margin: 0,
  zeroPool: false,
  pool: { base: 3, terms: [{ source: 'library', value: 1 }], rolled: 4 },
  threshold: {
    anchor: 9,
    source: 'character',
    terms: [{ source: 'situational', value: -1 }],
    effective: 8,
  },
});

export const COUNT_ROWS = Object.freeze([
  ['successOn', 'Success on', '≥ 8 · character value 9, moved +1 by modifiers'],
  ['count', 'Count', '3 qualified − 1 cancelled = 2 net'],
  ['needed', 'Needed', '2 · margin +0'],
]);

/** A d10 pool of 6 cut to zero by a situational −6: nothing rolled. */
export const ZERO_COUNT_DISPLAY = Object.freeze({
  ...COUNT_DISPLAY,
  results: [],
  qualified: null,
  cancelled: null,
  net: null,
  margin: null,
  zeroPool: true,
  pool: { base: 6, terms: [{ source: 'situational', value: -6 }], rolled: 0 },
  threshold: { anchor: 8, source: 'fixed', terms: [], effective: 8 },
});

/** The projection a count result receives for `countDisplay` executed under `visibility`. */
export function executedCountCheck(countDisplay = COUNT_DISPLAY, visibility = PUBLIC) {
  const data = countDisplay.zeroPool
    ? { ...COUNT_DATA, total: null, successes: null, cancelled: null, margin: null, zeroPool: true }
    : COUNT_DATA;
  return executedCheckDisplay({
    data: structuredClone(data),
    visibility,
    countDisplay: structuredClone(countDisplay),
  });
}
