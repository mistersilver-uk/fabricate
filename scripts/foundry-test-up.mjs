/**
 * foundry-test-up.mjs
 *
 * Starts the Foundry VTT Docker Compose test harness and waits for the
 * container to become healthy before exiting.
 *
 * Usage: node scripts/foundry-test-up.mjs
 *
 * Environment variables (loaded from .env.foundry if present):
 *   FOUNDRY_USERNAME  — Foundry account username (required)
 *   FOUNDRY_PASSWORD  — Foundry account password (required)
 */

import { execSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  prepareFoundryData,
  startPreparedFoundryContainer,
} from './lib/foundryDataPreparation.js';
import { deriveRunIdentity } from './lib/foundryRunIdentity.js';
import { resolveSmokeArmFromEnv } from './lib/foundrySmokeArms.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const COMPOSE_FILE = join(ROOT, 'docker-compose.foundry.yml');
const ENV_FILE = join(ROOT, '.env.foundry');
// Which Foundry generation this run boots (issue #1088). The DEFAULT arm reads its image out of the
// compose file rather than restating it: that value is what actually boots (it is written into
// process.env below, before compose reads its own default), while the compose file is what CI
// hashes into the `foundry-binary-*` cache key — so a second copy is wrong in opposite directions
// depending on which one you edit. A non-default arm (FOUNDRY_SMOKE_ARM=v13) reaches compose purely
// through FOUNDRY_IMAGE, so the compose pin — and the version-lock test that reads it — never moves.
const SMOKE_ARM = resolveSmokeArmFromEnv();
const DEFAULT_FOUNDRY_IMAGE = SMOKE_ARM.image;

// Per-worktree-stable container identity (issue #827). Derived deterministically from
// the worktree root so it is unique across worktrees (no fixed-name collision) yet
// stable within one (preserving the reuse cache + felddy's hostname-bound license).
// Respect explicit overrides so the parent foundry-test.mjs (which also finds a free
// port) can pin the values for the whole up/run/down pipeline.
const identity = deriveRunIdentity(ROOT);
process.env.FOUNDRY_CONTAINER_NAME ||= identity.containerName;
process.env.FOUNDRY_CONTAINER_HOSTNAME ||= identity.hostname;
process.env.COMPOSE_PROJECT_NAME ||= identity.project;
process.env.FOUNDRY_HOST_PORT ||= String(identity.port);
const CONTAINER_NAME = process.env.FOUNDRY_CONTAINER_NAME;

const CACHE_DIR = join(ROOT, '.foundry-e2e', 'cache');
const RESULTS_DIR = join(ROOT, 'test-results');

/** @type {Array<{ phase: string, startedAt: string, durationMs: number }>} */
const bootTimings = [];

/**
 * Time a labelled boot phase. Always records, even when `fn` throws.
 * @template T
 * @param {string} name
 * @param {() => T | Promise<T>} fn
 * @returns {Promise<T>}
 */
async function timed(name, fn) {
  const startedAt = new Date().toISOString();
  const t0 = performance.now();
  try {
    return await fn();
  } finally {
    bootTimings.push({
      phase: name,
      startedAt,
      durationMs: Math.round(performance.now() - t0)
    });
  }
}

function formatBootTimingsTable() {
  if (bootTimings.length === 0) return '';
  const rows = bootTimings.map(({ phase, durationMs }) => ({
    phase,
    seconds: (durationMs / 1000).toFixed(1)
  }));
  const totalMs = bootTimings.reduce((sum, entry) => sum + entry.durationMs, 0);
  rows.push({ phase: 'TOTAL', seconds: (totalMs / 1000).toFixed(1) });
  const phaseWidth = Math.max(...rows.map(r => r.phase.length));
  const secondsWidth = Math.max(...rows.map(r => r.seconds.length));
  const lines = ['Boot timings', '─'.repeat(phaseWidth + secondsWidth + 5)];
  for (const row of rows) {
    lines.push(`  ${row.phase.padEnd(phaseWidth)}  ${row.seconds.padStart(secondsWidth)}s`);
  }
  return lines.join('\n');
}

async function writeBootTimings() {
  if (bootTimings.length === 0) return;
  try {
    mkdirSync(RESULTS_DIR, { recursive: true });
    await writeFile(
      join(RESULTS_DIR, 'boot-timings.json'),
      JSON.stringify({ bootTimings }, null, 2)
    );
  } catch {
    /* non-fatal — the timing table still printed to stdout */
  }
}

/** Parse a simple KEY=VALUE env file, ignoring comments and blanks. */
async function loadEnvFile(filePath) {
  const raw = await readFile(filePath, 'utf8');
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function compose(args) {
  execSync(`docker compose -f docker-compose.foundry.yml ${args}`, {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env
  });
}

/**
 * Inspect the exact per-worktree container without treating Docker failures as
 * proof that the container is absent.
 *
 * @param {object} [options]
 * @param {string} [options.containerName]
 * @param {typeof spawnSync} [options.runInspect]
 * @returns {string | null}
 */
export function inspectCachedContainerStatus({
  containerName = CONTAINER_NAME,
  runInspect = spawnSync,
} = {}) {
  const result = runInspect('docker', [
    'inspect',
    '--format',
    '{{.State.Status}}',
    containerName
  ], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });

  if (result.error) {
    throw new Error(
      `Unable to inspect Foundry container ${containerName}: ${result.error.message}`,
      { cause: result.error }
    );
  }

  const stdout = (result.stdout ?? '').trim();
  const stderr = (result.stderr ?? '').trim();
  if (result.status !== 0) {
    if (/No such object:/i.test(stderr)) return null;
    const detail = stderr || `docker inspect exited with status ${result.status ?? 'unknown'}`;
    throw new Error(`Unable to inspect Foundry container ${containerName}: ${detail}`);
  }
  if (!stdout) {
    throw new Error(
      `Unable to inspect Foundry container ${containerName}: docker inspect returned an empty status.`
    );
  }
  return stdout;
}

const cachedContainer = {
  inspectStatus: inspectCachedContainerStatus,
  stop(status) {
    process.stdout.write(
      `Stopping ${status} Foundry container ${CONTAINER_NAME} before data setup...\n`
    );
    if (status === 'paused') {
      compose('unpause');
    }
    compose('stop');
  },
  restart(status) {
    process.stdout.write(`Starting cached Foundry container ${CONTAINER_NAME} (${status}).\n`);
    compose('start');
  }
};

/**
 * The host port a cached container is bound to, from the two places Docker records one.
 *
 * NetworkSettings.Ports is the live binding (only populated when the container has run at least
 * once). HostConfig.PortBindings is the *desired* binding from create-time — populated even for
 * `created` and `exited` containers that have never bound the port. Reading both lets the reuse
 * check detect a cached container created with an old port default.
 *
 * @param {string|undefined} networkRaw JSON for `.NetworkSettings.Ports`.
 * @param {string|undefined} hostConfigRaw JSON for `.HostConfig.PortBindings`.
 * @returns {string|null}
 */
function readBoundHostPort(networkRaw, hostConfigRaw) {
  try {
    const network = JSON.parse(networkRaw || '{}');
    const live = network?.['30000/tcp']?.[0]?.HostPort;
    if (live) return live;
    const hostConfig = JSON.parse(hostConfigRaw || '{}');
    return hostConfig?.['30000/tcp']?.[0]?.HostPort ?? null;
  } catch {
    return null;
  }
}

/**
 * Everything the container-reuse decision needs, from ONE `docker inspect`.
 *
 * The image and the bound port used to be two separate inspects. They are one because the reuse
 * decision needs both at the same moment and a second `spawnSync('docker', …)` is a new
 * PATH-resolved spawn site — which SonarCloud rates as a security finding on new code (S4036), and
 * rightly: `$PATH` is attacker-influenced on a shared or CI machine. Folding removes the new call
 * site rather than arguing about it, and costs one round trip less.
 *
 * @returns {{ image: string|null, hostPort: string|null }} Nulls when the container is absent or
 *   the inspect fails; the caller treats "unknown" as "no mismatch proven" and reuses.
 */
function inspectCachedContainerReuse() {
  const result = spawnSync('docker', [
    'inspect',
    '--format',
    '{{.Config.Image}}|{{json .NetworkSettings.Ports}}|{{json .HostConfig.PortBindings}}',
    CONTAINER_NAME
  ], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore']
  });

  if (result.status !== 0) return { image: null, hostPort: null };

  // `|` is safe as a delimiter here: a Docker image reference cannot contain one, and the two JSON
  // documents are port maps whose keys ("30000/tcp") and values (IP, port) cannot either.
  const [imageRaw, networkRaw, hostConfigRaw] = (result.stdout ?? '').trim().split('|');
  return {
    image: (imageRaw ?? '').trim() || null,
    hostPort: readBoundHostPort(networkRaw, hostConfigRaw)
  };
}

/**
 * Why a cached container cannot be reused, phrased for the log, or null when it can be.
 *
 * The IMAGE check is what makes smoke arms work (issue #1088). The container-reuse cache is keyed on
 * nothing but the container's existence, and the reuse path is a plain `compose start` that never
 * consults FOUNDRY_IMAGE — so a reused 14.365 container would boot Foundry 14 while every log line,
 * the stamped world manifest and the arm's own assertions said 13. The container identity (name,
 * hostname, port, data dir) is deliberately unchanged across arms: the felddy licence binds to the
 * HOSTNAME, so a per-arm hostname would burn a second Foundry activation per worktree. The corollary
 * is that the two arms cannot run concurrently in one worktree.
 *
 * @param {{ image: string|null, hostPort: string|null }} cached
 * @param {{ desiredImage: string, desiredHostPort: string, armId: string }} wanted
 * @returns {string|null}
 */
function describeCachedContainerMismatch(cached, { desiredImage, desiredHostPort, armId }) {
  if (cached.image && cached.image !== desiredImage) {
    return `was created from ${cached.image}; recreating for ${desiredImage} (smoke arm ${armId})`;
  }
  if (cached.hostPort && cached.hostPort !== desiredHostPort) {
    return `uses host port ${cached.hostPort}; recreating for ${desiredHostPort}`;
  }
  return null;
}

function getImageFoundryVersion(image) {
  const result = spawnSync('docker', [
    'image',
    'inspect',
    image,
    '--format',
    '{{ index .Config.Labels "com.foundryvtt.version" }}'
  ], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore']
  });

  if (result.status !== 0) return null;
  return (result.stdout ?? '').trim() || null;
}

function configureCachedReleaseUrl() {
  if (process.env.FOUNDRY_RELEASE_URL) {
    process.stdout.write('Using explicit FOUNDRY_RELEASE_URL.\n');
    return;
  }

  // The arm's own version is the last fallback: it is derived from the image TAG, so it still names
  // the right cached archive on a host where `docker image inspect` cannot read the label.
  const foundryVersion = process.env.FOUNDRY_VERSION
    || getImageFoundryVersion(process.env.FOUNDRY_IMAGE)
    || SMOKE_ARM.foundryVersion;
  if (!foundryVersion) {
    process.stdout.write('Unable to determine Foundry version; clean starts may request a release URL.\n');
    return;
  }

  const archiveName = `foundryvtt-${foundryVersion}.zip`;
  const archivePath = join(CACHE_DIR, archiveName);
  if (!existsSync(archivePath)) {
    process.stdout.write(`No cached Foundry archive found for ${foundryVersion}; clean starts may request a release URL.\n`);
    return;
  }

  process.env.FOUNDRY_RELEASE_URL = `file:///data/container_cache/${archiveName}`;
  process.stdout.write(`Using cached Foundry archive ${archiveName}.\n`);
}

/**
 * Pin the uid/gid the container runs as, so bind-mounted volumes are writable.
 *
 * The felddy/foundryvtt image runs as 1000:1000 by default and no longer supports
 * FOUNDRY_UID/FOUNDRY_GID, so Docker's native `user:` directive is fed from these instead (see
 * docker-compose.foundry.yml). On Windows, Docker Desktop bind mounts go through a translation layer
 * that ignores the host uid; the image's pre-created `foundry` user is uid 1000, which is what the
 * daemon expects. Hardcoding there skips the noisy "id not found" stderr the previous try/catch
 * produced.
 */
function resolveContainerUser() {
  if (!process.env.FOUNDRY_HOST_UID) {
    process.env.FOUNDRY_HOST_UID = process.platform === 'win32'
      ? '1000'
      : execSync('id -u', { encoding: 'utf8' }).trim();
  }
  if (!process.env.FOUNDRY_HOST_GID) {
    process.env.FOUNDRY_HOST_GID = process.platform === 'win32'
      ? '1000'
      : execSync('id -g', { encoding: 'utf8' }).trim();
  }
  process.stdout.write(`Container user: ${process.env.FOUNDRY_HOST_UID}:${process.env.FOUNDRY_HOST_GID}\n`);
}

/** Use the local image when this host already has it; otherwise pull it. */
function ensureImageAvailable() {
  const imageInspect = spawnSync('docker', ['image', 'inspect', process.env.FOUNDRY_IMAGE], {
    stdio: 'ignore'
  });
  if (imageInspect.status === 0) {
    process.stdout.write(`Using local Docker image ${process.env.FOUNDRY_IMAGE}.\n`);
    return;
  }
  process.stdout.write(`Pulling Docker image ${process.env.FOUNDRY_IMAGE}...\n`);
  compose('pull --quiet');
}

/**
 * Poll until the container reports healthy, or fail at the deadline.
 *
 * `unhealthy` is NOT terminal, and treating it as terminal is what an arm switch exposed (issue
 * #1088). Docker flips to `unhealthy` after `retries` consecutive failures and flips straight back
 * on the next passing probe, so it reports "not answering yet", not "broken". A switch between arms
 * installs a different dnd5e release, and Foundry then migrates package data on the world's first
 * launch — a one-off that runs past the compose healthcheck's grace and made
 * `npm run test:foundry:v13` abort on a container that was serving 200s seconds later. So only the
 * DEADLINE fails the run; a seen-unhealthy is reported for diagnosis. The deadline is generous for
 * the same reason: the slow case is a legitimate first-launch migration, not a hang.
 */
async function waitForHealthyContainer() {
  process.stdout.write('Waiting for Foundry to become healthy...\n');
  const deadline = Date.now() + 300_000;
  let sawUnhealthy = false;
  while (Date.now() < deadline) {
    const result = spawnSync('docker', [
      'inspect',
      '--format', '{{.State.Health.Status}}',
      CONTAINER_NAME
    ], { encoding: 'utf8' });

    const status = (result.stdout ?? '').trim();
    if (status === 'healthy') {
      if (sawUnhealthy) {
        process.stdout.write(
          'Foundry reported unhealthy earlier and then recovered — usually a first-launch ' +
          'package migration after a game-system change.\n'
        );
      }
      process.stdout.write('Foundry is healthy and ready.\n');
      return;
    }
    if (status === 'unhealthy' && !sawUnhealthy) {
      sawUnhealthy = true;
      process.stdout.write(
        'Container reports unhealthy; still waiting (Docker clears this on the next passing probe).\n'
      );
    }

    // Sleep 5 seconds
    await new Promise(resolve => setTimeout(resolve, 5000));
    process.stdout.write(`  status: ${status || 'starting'}...\n`);
  }

  process.stderr.write('Timeout waiting for Foundry to become healthy.\n');
  compose('logs --tail 50');
  process.exit(1);
}

export async function runFoundryLauncher({
  prepareData = prepareFoundryData,
} = {}) {
  // Load .env.foundry if present (local dev; CI sets vars directly)
  if (existsSync(ENV_FILE)) {
    await loadEnvFile(ENV_FILE);
  }

  if (!process.env.FOUNDRY_USERNAME || !process.env.FOUNDRY_PASSWORD) {
    process.stderr.write(
      'Error: FOUNDRY_USERNAME and FOUNDRY_PASSWORD must be set.\n' +
      'Create .env.foundry locally or set them as environment variables.\n'
    );
    process.exit(1);
  }

  process.stdout.write('Starting Foundry test harness...\n');
  if (!process.env.FOUNDRY_IMAGE) {
    process.env.FOUNDRY_IMAGE = DEFAULT_FOUNDRY_IMAGE;
  }
  process.stdout.write(
    `Smoke arm ${SMOKE_ARM.id}: Foundry ${SMOKE_ARM.foundryVersion} via ${process.env.FOUNDRY_IMAGE}` +
    `${SMOKE_ARM.isDefault ? ' (default arm — the compose pin)' : ' (env-selected arm)'}\n`
  );

  // Both local and CI runs use this same per-worktree identity and recovery
  // boundary. A live container must release its bind mount before setup replaces
  // smoke data; a failed synchronous stop aborts before either preparation step.
  let existingStatus = await prepareData({
    cachedContainer,
    async replaceBoundData() {
      // Ensure game systems are downloaded
      await timed('fetch-systems', () => {
        process.stdout.write('Fetching game systems...\n');
        execSync(`"${process.execPath}" "${join(__dirname, 'foundry-fetch-systems.mjs')}"`, {
          cwd: ROOT,
          stdio: 'inherit',
          env: process.env
        });
      });

      // Assemble the data directory with symlinks
      await timed('setup-data', () => {
        process.stdout.write('Setting up data directory...\n');
        execSync(`"${process.execPath}" "${join(__dirname, 'foundry-setup-data.mjs')}"`, {
          cwd: ROOT,
          stdio: 'inherit',
          env: process.env
        });
      });
    },
  });

  resolveContainerUser();

  // Prefer the local fixed-version image when available. Compose will still use
  // the configured FOUNDRY_IMAGE and pull it when this host does not have it.
  await timed('image-check', () => ensureImageAvailable());

  configureCachedReleaseUrl();

  // Reuse the stopped container by default. The felddy image stores the
  // extracted Foundry application in the container filesystem, so preserving
  // the container avoids repeated release-service requests that can hit 429s.
  const recreate = process.env.FOUNDRY_RECREATE === '1';
  if (recreate && existingStatus) {
    process.stdout.write('FOUNDRY_RECREATE=1 set; removing cached Foundry container...\n');
    compose('down --remove-orphans');
    existingStatus = null;
  }

  // One inspect, both reasons a cached container has to be thrown away — a changed smoke arm and a
  // changed host port. See describeCachedContainerMismatch for why the image half exists.
  if (existingStatus) {
    const mismatch = describeCachedContainerMismatch(inspectCachedContainerReuse(), {
      desiredImage: process.env.FOUNDRY_IMAGE,
      desiredHostPort: process.env.FOUNDRY_HOST_PORT || '30100',
      armId: SMOKE_ARM.id
    });
    if (mismatch) {
      process.stdout.write(`Cached Foundry container ${mismatch}.\n`);
      compose('down --remove-orphans');
      existingStatus = null;
    }
  }

  const cachedStatus = existingStatus;
  await timed('compose-up', () => {
    startPreparedFoundryContainer({
      cachedContainerStatus: cachedStatus,
      cachedContainer,
      createContainer() {
        process.stdout.write('Creating Foundry container...\n');
        compose('up -d');
      },
    });
  });

  await timed('health-poll', () => waitForHealthyContainer());
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  runFoundryLauncher()
    .then(async () => {
      const table = formatBootTimingsTable();
      if (table) process.stdout.write(`\n${table}\n\n`);
      await writeBootTimings();
    })
    .catch(async err => {
      const table = formatBootTimingsTable();
      if (table) process.stderr.write(`\n${table}\n\n`);
      await writeBootTimings();
      process.stderr.write(`foundry-test-up failed: ${err.message}\n`);
      process.exit(1);
    });
}
