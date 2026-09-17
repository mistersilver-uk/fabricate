/** The repository's ESLint config with the debt baseline removed. */
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
  // The subtraction is by reference, which is exact — but only while `eslint.config.js` spreads the
  // same objects.
  if (config.length - without.length !== DEBT_BLOCKS.length) {
    throw new Error(
      `removed ${config.length - without.length} of ${DEBT_BLOCKS.length} debt blocks from the ` +
        'config. They are subtracted by object identity, so eslint.config.js must spread ' +
        'DEBT_BLOCKS itself rather than a copy of it.'
    );
  }
  return without;
}
