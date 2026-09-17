/**
 * Orchestrates the full Foundry smoke-test pipeline: up → run → down. Ensures `down` is always
 * called even if `run` fails, so containers are never left orphaned in CI.
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

/** What runs against the booted container, and the wall-clock budget it gets. */
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
  // The performance profile (issue #1073).
  perf: Object.freeze({
    script: 'foundry-perf-run.mjs',
    timeoutMs: null,
    preflightArgs: ['--preflight'],
    companionScripts: null
  })
});

/** Whether a tcp port on 127.0.0.1 is bindable right now. */
function isPortFree(port) {
  return new Promise(resolve => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, '127.0.0.1');
  });
}

/**
 * The derived candidate port, or the next free port scanning upward within the bounded range
 * (wrapping back to 30100).
 */
async function resolveHostPort(candidate) {
  for (let i = 0; i < PORT_SPAN; i += 1) {
    const port = PORT_BASE + ((candidate - PORT_BASE + i) % PORT_SPAN);
    if (await isPortFree(port)) return port;
  }
  return candidate;
}

/**
 * Derive this worktree's stable container identity and export it (with a free-port fallback) so
 * every child phase — up, run, down — agrees on the container name, hostname, compose project, host
 * port, and the base URL.
 */
async function exportRunIdentity() {
  const identity = deriveRunIdentity(ROOT);
  process.env.FOUNDRY_CONTAINER_NAME ||= identity.containerName;
  process.env.FOUNDRY_CONTAINER_HOSTNAME ||= identity.hostname;
  process.env.COMPOSE_PROJECT_NAME ||= identity.project;

  // Only scan for a free port when nothing is pinned — a pinned URL or host port is an explicit
  // choice the scan must not override (CI pins FOUNDRY_URL to :30100).
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

/** Run a node script and return its exit code. */
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
    // `--arm` are.
    const fixture = /^--fixture=(.+)$/.exec(arg);
    if (fixture) process.env.FOUNDRY_PERF_FIXTURE = fixture[1];
  }
  return checkName;
}

/** The run phase's wall-clock budget, and where it came from. */
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

/** Run a check's declared preconditions, and stop the whole pipeline when they are not met. */
function runDeclaredPreflight(selectedCheck, runPath) {
  if (!selectedCheck.preflightArgs) return;

  process.stdout.write('=== foundry-test: PREFLIGHT ===\n');
  if (runScript(runPath, selectedCheck.preflightArgs) !== 0) {
    process.stderr.write('Preconditions not met. Nothing was started or downloaded.\n');
    process.exit(2);
  }
}

/** Build the module so the smoke always exercises current source. */
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
