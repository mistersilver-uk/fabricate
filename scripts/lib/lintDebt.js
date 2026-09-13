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
  const without = config.filter((block) => !debt.has(block));
  // The subtraction is by reference, which is exact — but only while `eslint.config.js` spreads
  // the same objects. A later `...DEBT_BLOCKS.map((block) => ({ ...block }))` would make this a
  // no-op, and the resulting failure is `lint:debt` announcing that every baseline entry reports
  // nothing any more: true, misdirecting, and it sends the author to delete the baseline.
  if (config.length - without.length !== DEBT_BLOCKS.length) {
    throw new Error(
      `removed ${config.length - without.length} of ${DEBT_BLOCKS.length} debt blocks from the ` +
        'config. They are subtracted by object identity, so eslint.config.js must spread ' +
        'DEBT_BLOCKS itself rather than a copy of it.'
    );
  }
  return without;
}
