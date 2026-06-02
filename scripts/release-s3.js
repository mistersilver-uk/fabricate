/**
 * S3 release pipeline for the Fabricate Foundry module.
 *
 * Builds the module at a given version (reusing scripts/release.js), rewrites
 * its module.json with S3-hosted channel URLs, zips it, and uploads the zip +
 * the canonical channel manifest + per-tester-group manifests to the configured
 * bucket.
 *
 * Layout (moduleId=fabricate, channel=beta, version=0.2.0-rc.1):
 *   modules/fabricate/beta/versions/0.2.0-rc.1/fabricate-0.2.0-rc.1.zip   (sources, immutable)
 *   modules/fabricate/beta/latest/module.json                            (sources, no-cache)
 *   testers/<group>/fabricate/module.json                                (beta access group, no-cache)
 *
 * The versioned zip is the single source of truth. The channel manifest and
 * every tester-group manifest point their `download` at that one zip; only the
 * `manifest` URL differs, so different cohorts install/update from distinct
 * URLs without re-uploading the build.
 *
 * Usage:
 *   node scripts/release-s3.js --version <ver> [--channel <name>] [--dry-run] [--overwrite] [--config <path>]
 *
 * AWS credentials are resolved by the SDK's default provider chain (env vars,
 * shared config, container/IMDS, or OIDC-injected creds in CI). Bucket and base
 * URL come from release.s3.config.json, overridable via S3_RELEASE_BUCKET /
 * RELEASE_BASE_URL env vars. AWS_REGION is passed through when set.
 */
import { execSync } from 'node:child_process';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { argv, env, exit } from 'node:process';
import { fileURLToPath } from 'node:url';
import { zipDirectory } from './lib/zip.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const CACHE_IMMUTABLE = 'public, max-age=31536000, immutable';
const CACHE_NO_CACHE = 'no-cache, max-age=0, must-revalidate';

// ───────────────────────────────────────────────────────────────────────────
// Exported pure helpers (also used by tests)
// ───────────────────────────────────────────────────────────────────────────

/**
 * Parse `--flag <value>` from an argv slice. Returns the value or null.
 *
 * @param {string[]} args
 * @param {string} flag
 * @returns {string|null}
 */
export function getFlag(args, flag) {
  const idx = args.indexOf(flag);
  if (idx !== -1 && args[idx + 1] && !args[idx + 1].startsWith('--')) {
    return args[idx + 1];
  }
  return null;
}

/**
 * Derive S3 keys + public URLs for a module release.
 *
 * @param {object} opts
 * @param {string} opts.moduleId
 * @param {string} opts.channel
 * @param {string} opts.version
 * @param {string} opts.baseUrl - public base URL (trailing slashes stripped)
 * @param {string[]} [opts.testerGroups]
 * @returns {{
 *   zipName: string, zipKey: string, channelKey: string,
 *   channelManifestUrl: string, channelDownloadUrl: string,
 *   testerManifests: Array<{ group: string, key: string, manifestUrl: string, downloadUrl: string }>
 * }}
 */
export function deriveS3Layout({ moduleId, channel, version, baseUrl, testerGroups = [] }) {
  const base = baseUrl.replace(/\/+$/, '');
  const zipName = `${moduleId}-${version}.zip`;
  const versionPath = `modules/${moduleId}/${channel}/versions/${version}/${zipName}`;
  const channelManifestPath = `modules/${moduleId}/${channel}/latest/module.json`;

  const channelDownloadUrl = `${base}/${versionPath}`;
  const channelManifestUrl = `${base}/${channelManifestPath}`;

  const testerManifests = testerGroups.map((group) => ({
    group,
    key: `testers/${group}/${moduleId}/module.json`,
    manifestUrl: `${base}/testers/${group}/${moduleId}/module.json`,
    // All cohorts share the one canonical zip.
    downloadUrl: channelDownloadUrl
  }));

  return {
    zipName,
    zipKey: versionPath,
    channelKey: channelManifestPath,
    channelManifestUrl,
    channelDownloadUrl,
    testerManifests
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Main script logic (runs only when invoked directly)
// ───────────────────────────────────────────────────────────────────────────

function fail(message) {
  console.error(`✗ release-s3: ${message}`);
  exit(1);
}

async function main() {
  const args = argv.slice(2);
  const version = getFlag(args, '--version');
  const channelOverride = getFlag(args, '--channel');
  const configPath = getFlag(args, '--config') || join(ROOT, 'release.s3.config.json');
  const dryRun = args.includes('--dry-run');
  const overwrite = args.includes('--overwrite');

  if (!version) fail('--version <ver> is required');

  // 1. Load config + env overrides
  let config;
  try {
    config = JSON.parse(await readFile(configPath, 'utf8'));
  } catch (err) {
    fail(`could not read config at ${configPath}: ${err.message}`);
  }

  const moduleId = config.moduleId;
  const channel = channelOverride || config.channel;
  const bucket = env.S3_RELEASE_BUCKET || config.bucket;
  const baseUrl = (env.RELEASE_BASE_URL || config.baseUrl || '').replace(/\/+$/, '');
  const testerGroups = config.testerGroups || [];

  if (!moduleId) fail('config is missing "moduleId"');
  if (!channel) fail('config is missing "channel" (and no --channel given)');

  // AWS credentials are validated lazily by the SDK on first call; only the
  // script-level inputs without a provider chain are enforced here.
  if (!dryRun) {
    const missing = [];
    if (!bucket) missing.push('S3_RELEASE_BUCKET (env or config.bucket)');
    if (!baseUrl) missing.push('RELEASE_BASE_URL (env or config.baseUrl)');
    if (missing.length) {
      fail('missing required configuration:\n' + missing.map((m) => `  - ${m}`).join('\n'));
    }
  }

  console.log(`release-s3: module=${moduleId} channel=${channel} version=${version}${dryRun ? ' (dry-run)' : ''}`);
  console.log(`release-s3: bucket=${bucket || '(unset)'} baseUrl=${baseUrl || '(unset)'}\n`);

  // 2. Build dist/ at the requested version (reuse the canonical build path)
  console.log('release-s3: building...');
  try {
    execSync(`node scripts/release.js --version "${version}" --no-zip`, { cwd: ROOT, stdio: 'inherit' });
  } catch {
    fail('build failed');
  }

  // 3. Read + validate the built manifest
  const distDir = join(ROOT, 'dist');
  const distManifestPath = join(distDir, 'module.json');
  let built;
  try {
    built = JSON.parse(await readFile(distManifestPath, 'utf8'));
  } catch (err) {
    fail(`build did not produce a readable ${distManifestPath}: ${err.message}`);
  }
  for (const f of ['id', 'title', 'version', 'compatibility']) {
    if (built[f] === undefined || built[f] === null || built[f] === '') {
      fail(`built module.json is missing required field "${f}"`);
    }
  }
  if (built.id !== moduleId) fail(`config moduleId "${moduleId}" does not match built module.json id "${built.id}"`);
  if (built.version !== version) fail(`version mismatch: requested ${version} built ${built.version}`);

  // 4. Compute S3 layout + rewrite dist/module.json with channel URLs
  const layout = deriveS3Layout({ moduleId, channel, version, baseUrl: baseUrl || 'https://example.invalid', testerGroups });
  const channelManifestBody = { ...built, manifest: layout.channelManifestUrl, download: layout.channelDownloadUrl };
  await writeFile(distManifestPath, JSON.stringify(channelManifestBody, null, 2) + '\n');
  console.log('release-s3: rewrote dist/module.json with channel URLs');

  // 5. Zip dist/ (channel-URL module.json now baked into the installed copy)
  const zipPath = join(distDir, layout.zipName);
  await rm(zipPath, { force: true });
  zipDirectory(distDir, zipPath);
  console.log(`release-s3: created ${layout.zipName}`);

  // 6. Tester-group manifest bodies (manifest URL differs; download stays canonical)
  const testerBodies = layout.testerManifests.map((t) => ({
    ...t,
    body: { ...built, manifest: t.manifestUrl, download: t.downloadUrl }
  }));

  // 7. Upload (skipped on dry-run)
  if (!dryRun) {
    const { S3Client, HeadObjectCommand, PutObjectCommand } = await import('@aws-sdk/client-s3');
    const s3 = new S3Client(env.AWS_REGION ? { region: env.AWS_REGION } : {});

    const s3Exists = async (key) => {
      try {
        await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return true;
      } catch (err) {
        if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) return false;
        throw err;
      }
    };
    const s3Put = (key, body, contentType, cacheControl) =>
      s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType, CacheControl: cacheControl }));

    // Pre-flight: refuse to clobber an existing versioned zip unless --overwrite
    if (await s3Exists(layout.zipKey)) {
      if (!overwrite) fail(`s3://${bucket}/${layout.zipKey} already exists — pass --overwrite to replace it`);
      console.log('release-s3: overwriting existing zip (--overwrite set)');
    }

    const zipBytes = await readFile(zipPath);
    console.log(`release-s3: upload zip      -> s3://${bucket}/${layout.zipKey}`);
    await s3Put(layout.zipKey, zipBytes, 'application/zip', CACHE_IMMUTABLE);

    console.log(`release-s3: upload manifest -> s3://${bucket}/${layout.channelKey}`);
    await s3Put(layout.channelKey, JSON.stringify(channelManifestBody, null, 2), 'application/json', CACHE_NO_CACHE);

    for (const t of testerBodies) {
      console.log(`release-s3: upload tester   -> s3://${bucket}/${t.key}`);
      await s3Put(t.key, JSON.stringify(t.body, null, 2), 'application/json', CACHE_NO_CACHE);
    }
  }

  // 8. Install-URL summary
  printSummary({ version, channel, channelManifestUrl: layout.channelManifestUrl, testerBodies, dryRun });
}

function printSummary({ version, channel, channelManifestUrl, testerBodies, dryRun }) {
  const header = dryRun ? 'DRY-RUN — install URLs that would be published:' : 'Published install URLs:';
  console.log('\n' + '═'.repeat(header.length));
  console.log(header);
  console.log('═'.repeat(header.length) + '\n');
  console.log(`Channel "${channel}" (v${version})`);
  console.log(`  ${channelManifestUrl}\n`);
  for (const t of testerBodies) {
    console.log(`Tester group: ${t.group}  (v${version})`);
    console.log(`  ${t.manifestUrl}\n`);
  }
}

// Run main only when invoked directly (not when imported by tests)
const isMain = argv[1] && fileURLToPath(import.meta.url) === argv[1];
if (isMain) {
  main().catch((err) => {
    console.error(err);
    exit(1);
  });
}
