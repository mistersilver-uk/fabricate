/**
 * `npm run lint`: ESLint over the repository, failing on what a change made worse than its base.
 * Paths narrow the run; `--fix` applies ESLint's fixes to the rules that regressed.
 */
import { runLintCli } from './lib/newViolations.js';

process.exitCode = await runLintCli(process.argv.slice(2));
