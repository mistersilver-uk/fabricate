/**
 * `npm run format:check`: Prettier over the repository, failing on a file that is new or was
 * formatted at base and is not now. `--write` formats exactly those files, and no other.
 */
import { formatAgainstBase, listUnformatted, reportGate } from './lib/newViolations.js';

const args = process.argv.slice(2);
if (args.some((arg) => arg !== '--write')) {
  console.error(`format-check: unknown argument ${args.join(' ')}; the only option is --write`);
  process.exit(2);
}
const outcome = await formatAgainstBase();
if (args.includes('--write') && outcome.offenders.length > 0) {
  listUnformatted({ args: ['--write', ...outcome.offenders] });
  console.log(`format: wrote ${outcome.offenders.join(', ')}`);
  process.exitCode = 0;
} else {
  console.log(
    `format:check: ${outcome.unformatted - outcome.offenders.length} unformatted file(s) are ` +
      'held as they were at base.'
  );
  process.exitCode = reportGate('format:check', outcome, {
    guidance: 'Run `npm run format` to format exactly these files.',
  });
}
