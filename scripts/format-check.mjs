/**
 * `npm run format:check`: Prettier over the repository, failing on a file that is new or was
 * formatted at base and is not now. `--write` formats exactly those files, and no other.
 */
import { runFormatCli } from './lib/newViolations.js';

process.exitCode = await runFormatCli(process.argv.slice(2));
