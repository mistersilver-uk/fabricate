/**
 * Shared seam for "corpus gate" regression tests: an npm script that must (a) run with an unaltered
 * argv and (b) actually reach a real corpus of files when executed (issue 946).
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const PRETTIER_BIN = path.join(repoRoot, 'node_modules/prettier/bin/prettier.cjs');

/** Split an npm `scripts` command string into argv the way a shell would. */
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
 * `['prettier', '--check', 'src/**\/*.svelte', ...]`.
 */
export function parseNpmScriptArgv(packageJson, scriptKey) {
  const command = packageJson.scripts?.[scriptKey];
  assert.ok(command, `package.json must define the ${scriptKey} script`);
  return tokenize(command);
}

/** Pin an npm script's PARSED argv against an expected array, by equality rather than substring. */
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
 * resolution entirely — see the SonarCloud S4036 note above.
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
