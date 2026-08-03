/**
 * Shared seam for "corpus gate" regression tests: an npm script that must (a) run with an
 * unaltered argv and (b) actually reach a real corpus of files when executed.
 *
 * Issue 946 found `tests/prettier-svelte-scope.test.js` proving `format:check` covers `.svelte`
 * by reconstructing the question through the Prettier Node API with its OWN `ignorePath` array —
 * never observing the argv the command actually runs with. Appending `--ignore-path <a file that
 * ignores *.svelte>` to the real script made it match zero files, print success, and exit 0, and
 * the guard stayed green: its only command-level check was `command.includes(componentGlob)`,
 * and an appended flag leaves that substring intact.
 *
 * Two primitives close that hole, and #947/#948 are expected to add call sites here rather than
 * copies of either:
 *
 *   - `assertGateArgv` pins an npm script's PARSED argv by equality. A substring match survives
 *     an appended flag (or a decoy `--ignore-path`); an equality match on the tokenized array
 *     does not, because the appended token shows up as an extra array element.
 *   - `runPrettierCheck` executes Prettier's real CLI entry point directly via
 *     `process.execPath`, never a bare command name resolved through PATH.
 *     `execFileSync('npm', ['run', 'format:check'])` (or `execFileSync('prettier', [...])`) is
 *     SonarCloud rule S4036, a MEDIUM vulnerability that fails `new_security_rating` and reds the
 *     quality gate (see `AGENTS.md:366`).
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const PRETTIER_BIN = path.join(repoRoot, 'node_modules/prettier/bin/prettier.cjs');

/**
 * Split an npm `scripts` command string into argv the way a shell would.
 *
 * This is deliberately not a general shell parser: every script in this repo's `package.json`
 * double-quotes its glob arguments and never single-quotes or escapes a quote, so matching either
 * a quoted run or a run of non-whitespace characters is enough to recover the real argv.
 */
function tokenize(command) {
  const tokens = [];
  const pattern = /"([^"]*)"|(\S+)/g;
  let match = pattern.exec(command);
  while (match !== null) {
    tokens.push(match[1] !== undefined ? match[1] : match[2]);
    match = pattern.exec(command);
  }
  return tokens;
}

/**
 * The real, parsed argv of an npm script, INCLUDING the command name as `argv[0]` — e.g.
 * `['prettier', '--check', 'src/**\/*.svelte', ...]`. Throws when the script is not defined so a
 * renamed or removed script fails loudly rather than reading as an empty, vacuously-passing argv.
 */
export function parseNpmScriptArgv(packageJson, scriptKey) {
  const command = packageJson.scripts?.[scriptKey];
  assert.ok(command, `package.json must define the ${scriptKey} script`);
  return tokenize(command);
}

/**
 * Pin an npm script's PARSED argv against an expected array, by equality rather than substring.
 * Returns the parsed argv so a caller can execute the exact tokens just pinned instead of
 * retyping them — which would risk the pin and the execution silently falling out of step.
 */
export function assertGateArgv(packageJson, scriptKey, expectedArgv) {
  const argv = parseNpmScriptArgv(packageJson, scriptKey);
  assert.deepEqual(
    argv,
    expectedArgv,
    `the ${scriptKey} script's parsed argv must equal ${JSON.stringify(expectedArgv)} — got` +
      ` ${JSON.stringify(argv)}. A flag appended to the script (e.g. a decoy --ignore-path)` +
      ' changes what the command inspects while leaving any glob substring intact; only an' +
      ' equality pin on the parsed argv catches it.'
  );
  return argv;
}

/**
 * Run Prettier's real CLI entry point with `argv` (no leading command name), bypassing PATH
 * resolution entirely — see the SonarCloud S4036 note above. `spawnSync` (rather than
 * `execFileSync`) is used so `stdout` and `stderr` are both captured uniformly whether Prettier
 * exits zero or non-zero; `execFileSync` only returns `stdout` on success and throws away the
 * captured `stderr` pipe, which is where Prettier's `--check` failures and `--log-level debug`
 * output both land.
 */
export function runPrettierCheck(argv, { cwd = repoRoot } = {}) {
  const result = spawnSync(process.execPath, [PRETTIER_BIN, ...argv], {
    cwd,
    encoding: 'utf8',
  });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}
