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

  // Pull latest image silently
  process.stdout.write('Pulling Docker image felddy/foundryvtt:release...\n');
  execSync('docker compose -f docker-compose.foundry.yml pull --quiet', {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env
  });

  // Start containers in detached mode
  process.stdout.write('Starting containers...\n');
  execSync('docker compose -f docker-compose.foundry.yml up -d', {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env
  });

  // Wait for health check (max 120 seconds)
  process.stdout.write('Waiting for Foundry to become healthy...\n');
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const result = spawnSync('docker', [
      'inspect',
      '--format', '{{.State.Health.Status}}',
      'fabricate-foundry-test'
    ], { encoding: 'utf8' });

    const status = (result.stdout ?? '').trim();
    if (status === 'healthy') {
      process.stdout.write('Foundry is healthy and ready.\n');
      return;
    }
    if (status === 'unhealthy') {
      process.stderr.write('Container reported unhealthy. Check logs:\n');
      execSync('docker compose -f docker-compose.foundry.yml logs --tail 50', {
        cwd: ROOT,
        stdio: 'inherit',
        env: process.env
      });
      process.exit(1);
    }

    // Sleep 5 seconds
    await new Promise(resolve => setTimeout(resolve, 5000));
    process.stdout.write(`  status: ${status || 'starting'}...\n`);
  }

  process.stderr.write('Timeout waiting for Foundry to become healthy.\n');
  execSync('docker compose -f docker-compose.foundry.yml logs --tail 50', {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env
  });
  process.exit(1);
}

main().catch(err => {
  process.stderr.write(`foundry-test-up failed: ${err.message}\n`);
  process.exit(1);
});
