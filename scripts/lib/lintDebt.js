/**
 * The repository's ESLint config with the debt baseline removed.
 *
 * `eslint.debt.js` records, per file, the rules that file fails today; `eslint.config.js` switches
 * exactly those off so `npm run lint` can be a glob over the whole repository (issue #1660).
 * `npm run lint:debt` needs the opposite view — what is actually left to fix, and whether an entry
 * has been paid off and left in place.
 *
 * The debt blocks are subtracted BY IDENTITY against `DEBT_BLOCKS`, not rebuilt from their shape.
 * A second derivation could disagree with what ESLint actually applied, and the direction it would
 * disagree in is the silent one: a block this failed to remove reads as "that file is clean now",
 * which retires a debt entry that has not been paid.
 */
import config, { DEBT_BLOCKS } from '../../eslint.config.js';
import { ESLINT_DEBT } from '../../eslint.debt.js';

/** Every file named by the per-file half of the baseline, in one flat list. */
export function debtFiles() {
  return Object.values(ESLINT_DEBT).flatMap((group) => Object.keys(group));
}

/** This repository's config with the debt blocks removed, and nothing else changed. */
export function configWithoutDebt() {
  const debt = new Set(DEBT_BLOCKS);
  return config.filter((block) => !debt.has(block));
}
