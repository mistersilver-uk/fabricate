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
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const COMPOSE_FILE = join(ROOT, 'docker-compose.foundry.yml');
const ENV_FILE = join(ROOT, '.env.foundry');
const DEFAULT_FOUNDRY_IMAGE = 'felddy/foundryvtt:13';
const CONTAINER_NAME = 'fabricate-foundry-test';
const CACHE_DIR = join(ROOT, '.foundry-e2e', 'cache');

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

function getContainerStatus() {
  const result = spawnSync('docker', [
    'inspect',
    '--format',
    '{{.State.Status}}',
    CONTAINER_NAME
  ], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore']
  });

  if (result.status !== 0) return null;
  return (result.stdout ?? '').trim() || null;
}

function getContainerHostPort() {
  const result = spawnSync('docker', [
    'inspect',
    '--format',
    '{{json .NetworkSettings.Ports}}',
    CONTAINER_NAME
  ], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore']
  });

  if (result.status !== 0) return null;

  try {
    const ports = JSON.parse((result.stdout ?? '').trim() || '{}');
    return ports?.['30000/tcp']?.[0]?.HostPort ?? null;
  } catch {
    return null;
  }
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

  const foundryVersion = process.env.FOUNDRY_VERSION || getImageFoundryVersion(process.env.FOUNDRY_IMAGE);
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

async function main() {
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

  // Ensure game systems are downloaded
  process.stdout.write('Fetching game systems...\n');
  execSync(`"${process.execPath}" "${join(__dirname, 'foundry-fetch-systems.mjs')}"`, {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env
  });

  // Assemble the data directory with symlinks
  process.stdout.write('Setting up data directory...\n');
  execSync(`"${process.execPath}" "${join(__dirname, 'foundry-setup-data.mjs')}"`, {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env
  });

  // Set container user to match the host user so bind-mounted volumes are writable.
  // The v13 felddy/foundryvtt image runs as 1000:1000 by default and no longer
  // supports FOUNDRY_UID/FOUNDRY_GID. We use Docker's native `user:` directive
  // via FOUNDRY_HOST_UID/FOUNDRY_HOST_GID env vars in docker-compose.foundry.yml.
  // On Windows, Docker Desktop bind mounts go through a translation layer that
  // ignores the host UID; the felddy/foundryvtt:13 image's pre-created `foundry`
  // user is uid 1000, which is what the daemon expects. Hardcoding skips the
  // noisy "id not found" stderr from the previous try/catch path.
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

  // Prefer the local fixed-version image when available. Compose will still use
  // the configured FOUNDRY_IMAGE and pull it when this host does not have it.
  const imageInspect = spawnSync('docker', ['image', 'inspect', process.env.FOUNDRY_IMAGE], {
    stdio: 'ignore'
  });
  if (imageInspect.status === 0) {
    process.stdout.write(`Using local Docker image ${process.env.FOUNDRY_IMAGE}.\n`);
  } else {
    process.stdout.write(`Pulling Docker image ${process.env.FOUNDRY_IMAGE}...\n`);
    compose('pull --quiet');
  }

  configureCachedReleaseUrl();

  // Reuse the stopped container by default. The felddy image stores the
  // extracted Foundry application in the container filesystem, so preserving
  // the container avoids repeated release-service requests that can hit 429s.
  let existingStatus = getContainerStatus();
  const recreate = process.env.FOUNDRY_RECREATE === '1';
  if (recreate && existingStatus) {
    process.stdout.write('FOUNDRY_RECREATE=1 set; removing cached Foundry container...\n');
    compose('down --remove-orphans');
    existingStatus = null;
  }

  if (existingStatus) {
    const desiredHostPort = process.env.FOUNDRY_HOST_PORT || '30000';
    const cachedHostPort = getContainerHostPort();
    if (cachedHostPort && cachedHostPort !== desiredHostPort) {
      process.stdout.write(
        `Cached Foundry container uses host port ${cachedHostPort}; recreating for ${desiredHostPort}.\n`
      );
      compose('down --remove-orphans');
      existingStatus = null;
    }
  }

  const cachedStatus = existingStatus;
  if (cachedStatus === 'running') {
    process.stdout.write(`Reusing running Foundry container ${CONTAINER_NAME}.\n`);
  } else if (cachedStatus) {
    process.stdout.write(`Starting cached Foundry container ${CONTAINER_NAME} (${cachedStatus}).\n`);
    compose('start');
  } else {
    process.stdout.write('Creating Foundry container...\n');
    compose('up -d');
  }

  // Wait for health check (max 120 seconds)
  process.stdout.write('Waiting for Foundry to become healthy...\n');
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const result = spawnSync('docker', [
      'inspect',
      '--format', '{{.State.Health.Status}}',
      CONTAINER_NAME
    ], { encoding: 'utf8' });

    const status = (result.stdout ?? '').trim();
    if (status === 'healthy') {
      process.stdout.write('Foundry is healthy and ready.\n');
      return;
    }
    if (status === 'unhealthy') {
      process.stderr.write('Container reported unhealthy. Check logs:\n');
      compose('logs --tail 50');
      process.exit(1);
    }

    // Sleep 5 seconds
    await new Promise(resolve => setTimeout(resolve, 5000));
    process.stdout.write(`  status: ${status || 'starting'}...\n`);
  }

  process.stderr.write('Timeout waiting for Foundry to become healthy.\n');
  compose('logs --tail 50');
  process.exit(1);
}

main().catch(err => {
  process.stderr.write(`foundry-test-up failed: ${err.message}\n`);
  process.exit(1);
});
