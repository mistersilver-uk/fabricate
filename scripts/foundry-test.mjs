/**
 * foundry-test.mjs
 *
 * Orchestrates the full Foundry smoke-test pipeline: up → run → down.
 * Ensures `down` is always called even if `run` fails, so containers
 * are never left orphaned in CI.
 *
 * Usage: node scripts/foundry-test.mjs [--profile=<full|rc|ci|screenshots>]
 *                                      [--arm=<v14|v13>] [--check=<full|version|perf>]
 *                                      [--fixture=<scale profile>]
 *
 * `--arm` picks the Foundry generation (issue #1088) and `--check` picks what runs against it.
 * They are deliberately separate axes: the narrow boot-and-assert check is what makes a V13 run
 * cheap, but it is equally runnable against V14 — and running it on both is the only way to know
 * that a V13 failure is a V13 failure rather than a broken check.
 *
 * The `version` check also runs a Font Awesome companion probe BEFORE teardown. The picker now has
 * generation-aware icon membership, so "Fabricate loads on V13" is no longer sufficient evidence:
 * the same command must prove which Font Awesome bundle that V13 client actually serves, and prove
 * a version-discriminating icon is present/absent where expected.
 *
 * Exit codes:
 *   0 — smoke test passed
 *   1 — smoke test failed (down was still called)
 *   2 — up or down failed (infrastructure error)
 */

import { spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  deriveRunIdentity,
  reconcileFoundryEndpoint,
  PORT_BASE,
  PORT_SPAN
} from './lib/foundryRunIdentity.js';
import { defaultRunTimeoutMs, resolveSmokeProfile } from './lib/foundryRunBudget.js';
import { SMOKE_ARM_ENV_VAR, normalizeSmokeArmName } from './lib/foundrySmokeArms.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

/**
 * What runs against the booted container, and the wall-clock budget it gets.
 *
 * `version` exists because the full walk takes ~32 minutes, which is a price worth paying once per
 * release candidate and never worth paying to answer "does Fabricate still load at all on the
 * generation `module.json` declares as its minimum?". Its budget is a flat 6 minutes: it boots,
 * asserts a handful of version-sensitive shapes and exits, so anything approaching that number is a
 * hang rather than a long run.
 *
 * A check may also name COMPANION scripts that run only after its primary script passes and while
 * the same container is still alive. That is deliberately narrower than making a second `--check`:
 * a user asking for the V13/V14 version arm should not have to remember a second command to prove
 * the Font Awesome premise the version-aware picker relies on.
 */
const CHECKS = Object.freeze({
  full: Object.freeze({
    script: 'foundry-test-run.mjs',
    timeoutMs: null,
    preflightArgs: null,
    companionScripts: null
  }),
  version: Object.freeze({
    script: 'foundry-version-assert.mjs',
    timeoutMs: 360_000,
    preflightArgs: null,
    companionScripts: Object.freeze([
      Object.freeze({ script: 'foundry-icon-bundle-assert.mjs', timeoutMs: 120_000 })
    ])
  }),
  // The performance profile (issue #1073). It takes NO budget of its own, so the `perf` entry in
  // foundryRunBudget.js decides how long it gets — that is the profile axis doing what it is for,
  // rather than a second constant here that would have to be kept in step with it.
  //
  // It is the ONLY check with a preflight, and that is its acceptance criterion rather than a
  // nicety: the felddy image activates a licence and downloads a Foundry build at container boot,
  // so "start it and see" is an expensive way to discover a missing password. `--preflight` runs
  // BEFORE build and up, starts nothing, downloads nothing, and exits 2 with instructions.
  perf: Object.freeze({
    script: 'foundry-perf-run.mjs',
    timeoutMs: null,
    preflightArgs: ['--preflight'],
    companionScripts: null
  })
});

/**
 * Whether a TCP port on 127.0.0.1 is bindable right now. Used for the free-port
 * fallback around the derived per-worktree port: the derived port is a mod-bounded
 * candidate, so distinct worktrees can occasionally collide (or a stale process can
 * hold it). up.mjs already recreates a cached container on a port-binding mismatch.
 * @param {number} port
 * @returns {Promise<boolean>}
 */
function isPortFree(port) {
  return new Promise(resolve => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, '127.0.0.1');
  });
}

/**
 * The derived candidate port, or the next free port scanning upward within the bounded
 * range (wrapping back to 30100). Falls back to the derived candidate if nothing is free
 * (up.mjs then surfaces the bind failure with full docker logs).
 * @param {number} candidate
 * @returns {Promise<number>}
 */
async function resolveHostPort(candidate) {
  for (let i = 0; i < PORT_SPAN; i += 1) {
    const port = PORT_BASE + ((candidate - PORT_BASE + i) % PORT_SPAN);
    if (await isPortFree(port)) return port;
  }
  return candidate;
}

/**
 * Derive this worktree's stable container identity and export it (with a free-port
 * fallback) so every child phase — up, run, down — agrees on the container name,
 * hostname, compose project, host port, AND the base URL. The run phase reads
 * FOUNDRY_URL SEPARATELY from FOUNDRY_HOST_PORT, so both must be set or Playwright
 * connects to the wrong port. Explicit overrides win (CI / manual pinning).
 */
async function exportRunIdentity() {
  const identity = deriveRunIdentity(ROOT);
  process.env.FOUNDRY_CONTAINER_NAME ||= identity.containerName;
  process.env.FOUNDRY_CONTAINER_HOSTNAME ||= identity.hostname;
  process.env.COMPOSE_PROJECT_NAME ||= identity.project;

  // Only scan for a free port when NOTHING is pinned — a pinned URL or host port is an
  // explicit choice the scan must not override (CI pins FOUNDRY_URL to :30100). The
  // reconcile then keeps the URL and the container host port in lockstep so they can
  // never diverge: an explicit URL's port wins, else an explicit host port derives the
  // URL, else both come from the scanned/derived fallback.
  let fallbackPort = identity.port;
  if (!process.env.FOUNDRY_URL && !process.env.FOUNDRY_HOST_PORT) {
    fallbackPort = await resolveHostPort(identity.port);
  }
  const { hostPort, url } = reconcileFoundryEndpoint({
    url: process.env.FOUNDRY_URL,
    hostPort: process.env.FOUNDRY_HOST_PORT,
    fallbackPort
  });
  process.env.FOUNDRY_HOST_PORT = hostPort;
  process.env.FOUNDRY_URL = url;
  process.stdout.write(
    `Worktree container identity: ${process.env.FOUNDRY_CONTAINER_NAME} ` +
    `(host ${process.env.FOUNDRY_URL})\n`
  );
}

/**
 * Run a node script and return its exit code.
 * @param {string} scriptPath
 * @param {string[]} [args]
 * @param {number} [timeoutMs] Optional wall-clock budget; SIGTERM on overrun.
 * @returns {number}
 */
function runScript(scriptPath, args = [], timeoutMs) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env,
    timeout: timeoutMs,
    killSignal: 'SIGTERM'
  });
  if (result.error?.code === 'ETIMEDOUT') {
    process.stderr.write(`${scriptPath} timed out after ${timeoutMs}ms.\n`);
    return 124;
  }
  return result.status ?? 1;
}

/**
 * Read the CLI flags into the environment the child phases inherit, and return the check to run.
 *
 * `--fixture=<scale profile>` flows through as FOUNDRY_PERF_FIXTURE and is read only by
 * `--check=perf`.
 *
 * `--profile=<full|rc|ci|screenshots>` flows through as FOUNDRY_SMOKE_PROFILE (useful for
 * cross-platform local CI emulation; POSIX users could export it directly). The scoped `screenshots`
 * profile additionally reads `--target-labels=<csv>` (the smoke labels of the views a PR affects,
 * from `ui-pr-screenshot-evidence.mjs targets`) and forwards it as
 * FOUNDRY_SCREENSHOT_TARGET_LABELS; empty means capture the full label set. `--arm` reaches `up`,
 * `fetch-systems` and `setup-data` through the environment ONLY — nothing here or in them edits
 * docker-compose.foundry.yml, whose pin the View Lab version lock reads.
 *
 * @param {string[]} argv
 * @returns {string} The `--check` name, defaulting to `full`.
 */
function applyCliArguments(argv) {
  let checkName = 'full';
  for (const arg of argv) {
    const profile = /^--profile=(.+)$/.exec(arg);
    if (profile) process.env.FOUNDRY_SMOKE_PROFILE = profile[1];
    const targets = /^--target-labels=(.*)$/.exec(arg);
    if (targets) process.env.FOUNDRY_SCREENSHOT_TARGET_LABELS = targets[1];
    const arm = /^--arm=(.+)$/.exec(arg);
    if (arm) process.env[SMOKE_ARM_ENV_VAR] = normalizeSmokeArmName(arm[1]);
    const check = /^--check=(.+)$/.exec(arg);
    if (check) checkName = check[1];
    // The `perf` fixture axis (issue 1073), forwarded as environment exactly as `--profile` and
    // `--arm` are. A flag rather than "just export the variable" because the one command a
    // maintainer is given has to work on Windows too, where a POSIX `VAR=value npm run ...`
    // prefix is not a thing.
    const fixture = /^--fixture=(.+)$/.exec(arg);
    if (fixture) process.env.FOUNDRY_PERF_FIXTURE = fixture[1];
  }
  return checkName;
}

/**
 * The run phase's wall-clock budget, and where it came from.
 *
 * The run phase gets a budget so the GitHub Actions job timeout can never preempt Docker teardown +
 * artifact upload. The default is PROFILE-DERIVED (expected walk + finalization grace) so it clears
 * a legitimately-passing walk of that profile plus its post-verdict `summary.json` write.
 *
 * A check that declares its OWN budget wins over FOUNDRY_RUN_TIMEOUT_MS, which is the reverse of the
 * usual precedence and deliberate. That variable's documented use is to ENLARGE the long walk's
 * budget (`FOUNDRY_RUN_TIMEOUT_MS=1500000`), so in a shell where it is exported the narrow version
 * arm would silently inherit 25 minutes — and a hang would stop looking like a hang, which is the
 * one thing a one-minute check exists to make obvious. The source is returned so no run has to guess
 * which rule applied.
 *
 * @param {{ timeoutMs: number|null }} selectedCheck
 * @param {string} checkName
 * @returns {{ runTimeoutMs: number, budgetSource: string }}
 */
function resolveRunBudget(selectedCheck, checkName) {
  const profile = resolveSmokeProfile(process.env.FOUNDRY_SMOKE_PROFILE);
  if (selectedCheck.timeoutMs !== null) {
    return { runTimeoutMs: selectedCheck.timeoutMs, budgetSource: `--check=${checkName}` };
  }
  if (process.env.FOUNDRY_RUN_TIMEOUT_MS) {
    return {
      runTimeoutMs: Number(process.env.FOUNDRY_RUN_TIMEOUT_MS),
      budgetSource: 'FOUNDRY_RUN_TIMEOUT_MS'
    };
  }
  return { runTimeoutMs: defaultRunTimeoutMs(profile), budgetSource: `smoke profile ${profile}` };
}

/**
 * Run a check's declared preconditions, and stop the whole pipeline when they are not met.
 *
 * Deliberately BEFORE the build as well as before `up`: a run that cannot possibly succeed should
 * not first spend a Vite build. Only `perf` declares preconditions today, and that is its
 * acceptance criterion rather than a nicety — the felddy image activates a licence and downloads a
 * Foundry build at container boot, so "start it and see" is an expensive way to discover a missing
 * password. A preflight starts nothing and downloads nothing.
 *
 * @param {{ preflightArgs: string[]|null }} selectedCheck
 * @param {string} runPath the check's own script, which implements its `--preflight`
 * @returns {void} exits 2 rather than returning when the preconditions fail
 */
function runDeclaredPreflight(selectedCheck, runPath) {
  if (!selectedCheck.preflightArgs) return;

  process.stdout.write('=== foundry-test: PREFLIGHT ===\n');
  if (runScript(runPath, selectedCheck.preflightArgs) !== 0) {
    process.stderr.write('Preconditions not met. Nothing was started or downloaded.\n');
    process.exit(2);
  }
}

/**
 * Build the module so the smoke always exercises CURRENT source.
 *
 * foundry-setup-data.mjs copies dist/ into the Foundry data dir as the module, so a missing dist/
 * fails to activate and — worse — a STALE dist/ silently tests old code. Building here removes both
 * failure modes. CI builds in its own dedicated cached step and sets FOUNDRY_SKIP_BUILD=1 to avoid
 * double-building.
 *
 * @returns {void} exits 2 rather than returning when the build fails
 */
function buildModuleUnderTest() {
  if (process.env.FOUNDRY_SKIP_BUILD === '1') return;

  process.stdout.write('=== foundry-test: BUILD ===\n');
  // `npm run build` is `node scripts/release.js --no-zip`. Invoke it through the
  // existing runScript helper (absolute process.execPath, no shell, no PATH lookup)
  // rather than spawning a PATH-resolved `npm`.
  if (runScript(join(__dirname, 'release.js'), ['--no-zip']) !== 0) {
    process.stderr.write('Build failed. Aborting.\n');
    process.exit(2);
  }
}

/**
 * Run a check's companion probes against the still-live container, and report the first failure.
 *
 * They run only after the primary check passes: if boot or Fabricate itself failed, repeating
 * browser work cannot make that result more informative. The version arm uses this for Font Awesome
 * because its assertion is about Foundry's served bundle, not about Fabricate's own module state.
 *
 * @param {{ companionScripts: Array<{ script: string, timeoutMs: number }>|null }} selectedCheck
 * @param {number} primaryRunCode
 * @returns {number} the first non-zero companion exit code, or 0
 */
function runCompanionProbes(selectedCheck, primaryRunCode) {
  if (primaryRunCode !== 0 || !selectedCheck.companionScripts?.length) return 0;

  for (const companion of selectedCheck.companionScripts) {
    process.stdout.write(`=== foundry-test: COMPANION ${companion.script} ===\n`);
    const companionCode = runScript(join(__dirname, companion.script), [], companion.timeoutMs);
    if (companionCode !== 0) return companionCode;
  }
  return 0;
}

async function main() {
  const checkName = applyCliArguments(process.argv.slice(2));

  // `Object.hasOwn`, not a bare index: `CHECKS.constructor` is a truthy inherited Object, so an
  // index would sail past this guard and die much later inside `join()` with
  // "Path must be a string". Mirrors normalizeSmokeArmName in scripts/lib/foundrySmokeArms.js.
  if (!Object.hasOwn(CHECKS, checkName)) {
    process.stderr.write(
      `Unknown --check=${checkName}; expected one of ${Object.keys(CHECKS).join(', ')}.\n`
    );
    process.exit(2);
  }
  const selectedCheck = CHECKS[checkName];

  // Pin the per-worktree container identity + host port/URL for every child phase.
  await exportRunIdentity();

  const up = join(__dirname, 'foundry-test-up.mjs');
  const run = join(__dirname, selectedCheck.script);
  const down = join(__dirname, 'foundry-test-down.mjs');

  // Step -1: preconditions, for a check that declares them.
  runDeclaredPreflight(selectedCheck, run);

  // Step 0: build, unless CI already did it.
  buildModuleUnderTest();

  // Step 1: Start the environment
  process.stdout.write('=== foundry-test: UP ===\n');
  const upCode = runScript(up);
  if (upCode !== 0) {
    process.stderr.write('foundry-test-up failed. Aborting.\n');
    process.exit(2);
  }

  // Step 2: Run the smoke test (capture result, always proceed to down).
  // `rc`/`ci` keep today's ~18-minute budget (~870-930s walk) while `full`/`screenshots` get enough
  // headroom that the long walk no longer needs a manual override to avoid a SIGTERM
  // mid-finalization. See resolveRunBudget for the precedence and why a check's own budget wins.
  process.stdout.write('=== foundry-test: RUN ===\n');
  const { runTimeoutMs, budgetSource } = resolveRunBudget(selectedCheck, checkName);
  process.stdout.write(`Run budget: ${runTimeoutMs}ms (from ${budgetSource})\n`);
  const runCode = runScript(run, [], runTimeoutMs);

  // Step 2b: narrow companion probes that need the SAME live Foundry, for a check that declares
  // them.
  const companionCode = runCompanionProbes(selectedCheck, runCode);

  // Step 3: Tear down regardless of test result
  process.stdout.write('=== foundry-test: DOWN ===\n');
  const downCode = runScript(down);
  if (downCode !== 0) {
    process.stderr.write('foundry-test-down failed.\n');
    process.exit(2);
  }

  // Propagate test result
  if (runCode !== 0 || companionCode !== 0) {
    process.stderr.write('Smoke test failed. See test-results/ for the primary and companion summaries.\n');
    process.exit(1);
  }

  process.stdout.write('=== foundry-test: ALL PASSED ===\n');
}

main().catch(err => {
  process.stderr.write(`foundry-test fatal error: ${err.message}\n`);
  process.exit(2);
});
