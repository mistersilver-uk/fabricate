/**
 * `npm run lint:debt` — the other half of the glob gate (issue #1660).
 *
 * `eslint.debt.js` records, per file, the rules that file fails today, and `eslint.config.js`
 * switches exactly those off so `npm run lint` can be `eslint .`. This runs the same config with
 * the baseline REMOVED, and does two jobs with the result:
 *
 *   1. Reports what a contributor still has to fix in a baselined file, which `npm run lint`
 *      cannot show them by construction.
 *   2. FAILS when an entry has gone stale — the file is still listed but reports nothing any
 *      more. Without that, "the baseline only shrinks" is a property nothing enforces, which is a
 *      wish.
 *
 * WHY THIS IS A LINT STEP AND NOT A UNIT TEST. Every other ratchet in this repository is asserted
 * from `npm test`; this one is not, for a measured reason. The staleness check has to LINT the
 * baselined files, which takes 23 seconds because they are the largest files in the tree
 * (`adminStore.js`, `src/main.js`, `foundry-test-run.mjs`). Twenty-three CPU-bound seconds inside
 * the unit-test job starves the browser-backed suites that share its runner. The `lint` job is
 * already paying for ESLint, so the check runs there. The CHEAP half of the ratchet — the pinned
 * counts, the superset assertion, `no-undef` never being baselined — is in
 * `tests/lint-coverage.test.js`, where it belongs.
 *
 * It replaces `lint:all`, which was `eslint .` and had never once worked: with no
 * `import-x/resolver-next` setting, eslint-plugin-import-x takes its legacy branch and aborts the
 * whole run the moment an import-graph rule walks a dependency. `npm run lint` is `eslint .` now,
 * so the name had nothing left to mean either way.
 */
import { ESLint } from 'eslint';

import { configWithoutDebt, debtFiles } from './lib/lintDebt.js';

const files = debtFiles();
const eslint = new ESLint({ overrideConfigFile: true, overrideConfig: configWithoutDebt() });
const results = await eslint.lintFiles(files);

// A GUARD THAT CANNOT TELL "CLEAN" FROM "NEVER RAN" IS NOT A GUARD. An `ignores` entry covering a
// baselined file, or a rename that half-landed, would otherwise make every file look clean and
// this report the debt as fully paid.
if (results.length !== files.length) {
  console.error(
    `ESLint returned ${results.length} result(s) for ${files.length} baselined file(s). Some were` +
      ' skipped or ignored, so nothing below can be trusted.'
  );
  process.exit(1);
}

const reporting = new Set(
  results.filter((result) => result.messages.length > 0).map((result) => result.filePath)
);
const stale = files.filter((file) =>
  [...reporting].every((reported) => !reported.replaceAll('\\', '/').endsWith(`/${file}`))
);
const findings = results.reduce((total, result) => total + result.messages.length, 0);

console.log(await (await eslint.loadFormatter('stylish')).format(results));

if (stale.length > 0) {
  console.error(
    `${stale.length} baseline entr(ies) in eslint.debt.js report nothing any more:\n` +
      stale.map((file) => `  ${file}`).join('\n') +
      '\n\nRemove them, and lower that group’s pinned counts in tests/lint-coverage.test.js in' +
      ' the same commit. The baseline only shrinks; an entry that has been paid off and left in' +
      ' place is how it silently stops shrinking.'
  );
  process.exit(1);
}

console.log(
  findings === 0
    ? 'No findings: every baselined file is clean. Empty eslint.debt.js and delete its blocks.'
    : `${findings} finding(s) across ${reporting.size} baselined file(s); no stale entries.`
);
