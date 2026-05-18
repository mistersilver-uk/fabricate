/**
 * foundry-test-router.mjs
 *
 * Dispatches the public `npm run test:foundry` entrypoint to the focused RC
 * smoke runner when FOUNDRY_SMOKE_PROFILE=rc/ci, otherwise preserves the
 * existing full runner.
 */

import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const profileArg = process.argv.slice(2).find(arg => /^--profile=/.test(arg));
const explicitProfile = profileArg ? profileArg.replace(/^--profile=/, '') : null;
const rawProfile = String(explicitProfile ?? process.env.FOUNDRY_SMOKE_PROFILE ?? 'full').toLowerCase();
const smokeProfile = rawProfile === 'ci' ? 'rc' : rawProfile;
const script = smokeProfile === 'rc' ? 'foundry-test-rc.mjs' : 'foundry-test.mjs';

const result = spawnSync(process.execPath, [join(__dirname, script), ...process.argv.slice(2)], {
  cwd: ROOT,
  stdio: 'inherit',
  env: { ...process.env, FOUNDRY_SMOKE_PROFILE: smokeProfile }
});

if (result.error) {
  process.stderr.write(`Foundry smoke router failed to start ${script}: ${result.error.message}\n`);
  process.exit(2);
}

process.exit(result.status ?? 1);
