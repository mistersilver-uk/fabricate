/** `npm run lint:debt` — the other half of the glob gate (issue #1660). */
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
