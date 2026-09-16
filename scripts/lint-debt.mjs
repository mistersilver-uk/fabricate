/**
 * `npm run lint:debt` — the other half of the glob gate (issue #1660).
 *
 * `eslint.debt.js` records what the not-yet-clean files fail, and `eslint.config.js` switches
 * exactly those rules off so `npm run lint` can be `eslint .`. This runs the same config with the
 * baseline REMOVED, over the whole repository, and does two jobs with the result:
 *
 *   1. Reports what a contributor still has to fix, which `npm run lint` cannot show them by
 *      construction.
 *   2. FAILS on a STALE entry — one that reports nothing any more. Without that, "the baseline
 *      only shrinks" is a property nothing enforces, which is a wish. It is not a hypothetical
 *      either: the `tests/**` list shipped its first stale entry (`import-x/default`) within an
 *      hour of being generated, because a file was fixed and the list was not re-derived.
 *
 * BOTH HALVES OF THE BASELINE, which is why this lints `.` rather than the 89 baselined files. The
 * per-file half is the small half; the `tests/**` rule list covers 1,040 files, and checking it
 * needs the whole tree linted anyway. One pass answers both and costs less than two.
 *
 * WHY THIS IS ITS OWN CI JOB AND NOT A UNIT TEST. It lints the repository twice over, in effect —
 * around three minutes — and `npm test` shares its runner with browser-backed suites that starve
 * when a CPU-bound job sits beside them. It is not a step of the `lint` job either, because that
 * would serialise two full ESLint passes into one job's budget. A separate job runs it in
 * parallel with `lint`. The CHEAP half of the ratchet — pinned counts, the superset proof,
 * `no-undef` never being baselined — is in `tests/lint-coverage.test.js`, where it belongs.
 *
 * It replaces `lint:all`, which was `eslint .` and had never once worked: with no
 * `import-x/resolver-next` setting, eslint-plugin-import-x takes its legacy branch and aborts the
 * whole run the moment an import-graph rule walks a dependency.
 */
import { ESLint } from 'eslint';

import { ESLINT_DEBT, ESLINT_TESTS_DEBT } from '../eslint.debt.js';

import { configWithoutDebt, debtFiles } from './lib/lintDebt.js';

const eslint = new ESLint({ overrideConfigFile: true, overrideConfig: configWithoutDebt() });
const results = await eslint.lintFiles(['.']);

// A GUARD THAT CANNOT TELL "CLEAN" FROM "NEVER RAN" IS NOT A GUARD. A config that failed to load
// its ignores, or a run that matched nothing, would otherwise report the whole debt as paid.
if (results.length < Object.keys(ESLINT_DEBT).length) {
  console.error(
    `ESLint returned ${results.length} result(s) for the repository; the run is wrong.`
  );
  process.exit(1);
}

const reporting = new Set(results.filter((r) => r.messages.length > 0).map((r) => r.filePath));
const rulesSeen = new Set(results.flatMap((r) => r.messages.map((m) => m.ruleId)));

const staleFiles = debtFiles().filter((file) =>
  [...reporting].every((reported) => !reported.replaceAll('\\', '/').endsWith(`/${file}`))
);
const staleTestRules = ESLINT_TESTS_DEBT.filter((rule) => !rulesSeen.has(rule));

console.log(await (await eslint.loadFormatter('stylish')).format(results));

if (staleFiles.length > 0 || staleTestRules.length > 0) {
  const parts = [];
  if (staleFiles.length > 0) {
    parts.push(
      `${staleFiles.length} file entr(ies) in eslint-debt.txt report nothing any more:\n` +
        staleFiles.map((file) => `  ${file}`).join('\n')
    );
  }
  if (staleTestRules.length > 0) {
    parts.push(
      `${staleTestRules.length} tests/** rule(s) in eslint-debt.txt report nothing any more:\n` +
        staleTestRules.map((rule) => `  tests/**/*.js\t${rule}`).join('\n')
    );
  }
  console.error(
    parts.join('\n\n') +
      '\n\nDelete those lines from eslint-debt.txt, and lower the matching count in' +
      ' tests/lint-coverage.test.js in the same commit. The baseline only shrinks; an entry that' +
      ' has been paid off and left in place is how it silently stops shrinking.'
  );
  process.exit(1);
}

const findings = results.reduce((total, result) => total + result.messages.length, 0);
console.log(
  findings === 0
    ? 'No findings: the whole repository is clean. Empty eslint-debt.txt and delete its blocks.'
    : `${findings} finding(s) across ${reporting.size} file(s); no stale baseline entries.`
);
