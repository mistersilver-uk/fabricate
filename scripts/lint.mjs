/**
 * `npm run lint`: ESLint over the repository, failing on what a change made worse than its base.
 * Paths narrow the run; `--fix` applies ESLint's fixes to the rules that regressed.
 */
import { lintAgainstBase, reportGate } from './lib/newViolations.js';

const args = process.argv.slice(2);
const unknown = args.filter((arg) => arg.startsWith('-') && arg !== '--fix');
if (unknown.length > 0) {
  console.error(`lint: unknown option ${unknown.join(' ')}; the only option is --fix`);
  process.exit(2);
}
const patterns = args.filter((arg) => arg !== '--fix');
const outcome = await lintAgainstBase({
  patterns: patterns.length > 0 ? patterns : ['.'],
  fix: args.includes('--fix'),
});
console.log(
  `lint: ${outcome.linted} file(s) linted; ${outcome.findings} finding(s) in ${outcome.files} ` +
    'file(s) are held at their base counts.'
);
process.exitCode = reportGate('lint', outcome);
