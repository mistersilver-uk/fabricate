/**
 * S3 release pipeline for the Fabricate Foundry module.
 *
 * Builds the module at a given version (reusing scripts/release.js), then
 * publishes one self-contained feed per distribution target: the canonical
 * channel ("sources") plus one per beta access group ("testers"). Each target
 * gets its OWN versioned zip whose in-zip module.json bakes that target's own
 * `manifest` URL, plus a "latest" manifest pointing at that zip.
 *
 * Layout (moduleId=fabricate, channel=beta, version=0.2.0-rc.1, group=closed-beta-2026):
 *   modules/fabricate/beta/versions/0.2.0-rc.1/fabricate-0.2.0-rc.1.zip      (sources, immutable)
 *   modules/fabricate/beta/latest/module.json                               (sources, no-cache)
 *   testers/closed-beta-2026/fabricate/versions/0.2.0-rc.1/fabricate-…​.zip   (access group, immutable)
 *   testers/closed-beta-2026/fabricate/module.json                          (access group, no-cache)
 *
 * Why per-cohort zips: when Foundry installs from a manifest URL it extracts
 * the zip's module.json to disk, and future "Check for Updates" calls use the
 * `manifest` field from THAT on-disk module.json — not the URL it was installed
 * from. A single shared zip can only bake one `manifest` URL, so it would route
 * every cohort's updates through the channel feed. Giving each cohort its own
 * zip (baking its own cohort manifest URL) makes each access group a genuinely
 * independent update feed that can be advanced on its own cadence.
 *
 * Usage:
 *   node scripts/release-s3.js --version <ver> [--channel <name>] [--dry-run] [--overwrite] [--config <path>]
 *
 * AWS credentials are resolved by the SDK's default provider chain (env vars,
 * shared config, container/IMDS, or OIDC-injected creds in CI). Bucket and base
 * URL come from release.s3.config.json, overridable via S3_RELEASE_BUCKET /
 * RELEASE_BASE_URL env vars. AWS_REGION is passed through when set.
 *
 * Environments:
 *   - CI (Ubuntu): invoked by .github/workflows/release-s3.yml after `npm ci`;
 *     bucket/baseUrl come from repo vars, credentials from OIDC. The `zip`
 *     binary is present, so scripts/lib/zip.js takes its Unix path.
 *   - Local dev (Windows/macOS/Linux): run via
 *     `npm run release:s3:dry-run -- --version <ver>` to build + stage zips
 *     without AWS (--version is required, hence the `--` passthrough). On
 *     Windows, scripts/lib/zip.js uses PowerShell `Compress-Archive` so the
 *     staged zips install correctly.
 */
import { execSync } from 'node:child_process';
import { readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { argv, env, exit } from 'node:process';
import { fileURLToPath } from 'node:url';
import { zipDirectory } from './lib/zip.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const STAGING_DIR = join(ROOT, 'build', 's3');

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
 * @typedef {object} PublishTarget
 * @property {'channel'|'tester'} kind
 * @property {string} label        - stable id for logging / staging dirs
 * @property {string|null} group   - access-group name (tester targets only)
 * @property {string} zipKey       - S3 key for the immutable versioned zip
 * @property {string} manifestKey  - S3 key for the "latest" manifest
 * @property {string} manifestUrl  - public URL baked into this target's module.json `manifest`
 * @property {string} downloadUrl  - public URL of this target's own versioned zip
 */

/**
 * Derive the per-target S3 layout for a module release. Each target is a
 * self-contained feed: its `downloadUrl` points at its OWN versioned zip and
 * its `manifestUrl` is what gets baked into that zip's module.json.
 *
 * @param {object} opts
 * @param {string} opts.moduleId
 * @param {string} opts.channel
 * @param {string} opts.version
 * @param {string} opts.baseUrl - public base URL (trailing slashes stripped)
 * @param {string[]} [opts.testerGroups]
 * @returns {{
 *   zipName: string, channel: string, version: string,
 *   channelTarget: PublishTarget, testerTargets: PublishTarget[], targets: PublishTarget[]
 * }}
 */
export function deriveS3Layout({ moduleId, channel, version, baseUrl, testerGroups = [] }) {
  const base = baseUrl.replace(/\/+$/, '');
  const zipName = `${moduleId}-${version}.zip`;

  /** @returns {PublishTarget} */
  const makeTarget = (kind, group, prefix, manifestKey) => {
    const zipKey = `${prefix}/versions/${version}/${zipName}`;
    return {
      kind,
      group,
      label: group ? `tester-${group}` : `channel-${channel}`,
      zipKey,
      manifestKey,
      manifestUrl: `${base}/${manifestKey}`,
      // Each feed references its OWN zip — cohorts never share a download.
      downloadUrl: `${base}/${zipKey}`
    };
  };

  const channelPrefix = `modules/${moduleId}/${channel}`;
  const channelTarget = makeTarget('channel', null, channelPrefix, `${channelPrefix}/latest/module.json`);

  const testerTargets = testerGroups.map((group) => {
    const prefix = `testers/${group}/${moduleId}`;
    return makeTarget('tester', group, prefix, `${prefix}/module.json`);
  });

  return {
    zipName,
    channel,
    version,
    channelTarget,
    testerTargets,
    targets: [channelTarget, ...testerTargets]
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
  console.log(`release-s3: bucket=${bucket || '(unset)'} baseUrl=${baseUrl || '(unset)'}`);
  console.log(`release-s3: targets=channel + ${testerGroups.length} tester group(s)\n`);

  // 2. Build dist/ at the requested version (reuse the canonical build path).
  //    scripts/release.js --version writes the version into the tracked root
  //    module.json (semantic-release / promote-release rely on that), but the
  //    built dist/ is self-contained once the build finishes. Save and restore
  //    the root manifest so this command never leaves a tracked file dirty —
  //    important for local dry-runs, harmless for CI's ephemeral checkout.
  const rootManifestPath = join(ROOT, 'module.json');
  const originalRootManifest = await readFile(rootManifestPath, 'utf8');
  console.log('release-s3: building...');
  let buildOk = true;
  try {
    execSync(`node scripts/release.js --version "${version}" --no-zip`, { cwd: ROOT, stdio: 'inherit' });
  } catch {
    buildOk = false;
  } finally {
    await writeFile(rootManifestPath, originalRootManifest);
  }
  if (!buildOk) fail('build failed');

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

  // 4. Compute the per-target layout
  const layout = deriveS3Layout({
    moduleId,
    channel,
    version,
    baseUrl: baseUrl || 'https://example.invalid',
    testerGroups
  });

  // 5. Stage one zip per target: rewrite dist/module.json with that target's
  //    feed URLs, then zip dist/ to a per-target staging path. Staged zips live
  //    outside dist/ so they are not nested into the next target's archive.
  await rm(STAGING_DIR, { recursive: true, force: true });
  const staged = []; // { target, body, zipPath }
  for (const target of layout.targets) {
    const body = { ...built, manifest: target.manifestUrl, download: target.downloadUrl };
    await writeFile(distManifestPath, JSON.stringify(body, null, 2) + '\n');

    const outDir = join(STAGING_DIR, target.label);
    await mkdir(outDir, { recursive: true });
    const zipPath = join(outDir, layout.zipName);
    zipDirectory(distDir, zipPath);
    console.log(`release-s3: staged ${target.label} -> ${target.zipKey}`);
    staged.push({ target, body, zipPath });
  }

  // 6. Upload (skipped on dry-run)
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
    const s3Put = (key, bodyBytes, contentType, cacheControl) =>
      s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: bodyBytes, ContentType: contentType, CacheControl: cacheControl }));

    // Pre-flight ALL versioned zips before uploading anything (fail-fast so we
    // never leave a half-published release behind).
    for (const { target } of staged) {
      if (await s3Exists(target.zipKey)) {
        if (!overwrite) fail(`s3://${bucket}/${target.zipKey} already exists — pass --overwrite to replace it`);
        console.log(`release-s3: will overwrite ${target.zipKey} (--overwrite set)`);
      }
    }

    for (const { target, body, zipPath } of staged) {
      const zipBytes = await readFile(zipPath);
      console.log(`release-s3: upload zip      -> s3://${bucket}/${target.zipKey}`);
      await s3Put(target.zipKey, zipBytes, 'application/zip', CACHE_IMMUTABLE);
      console.log(`release-s3: upload manifest -> s3://${bucket}/${target.manifestKey}`);
      await s3Put(target.manifestKey, JSON.stringify(body, null, 2), 'application/json', CACHE_NO_CACHE);
    }
  }

  // 7. Install-URL summary
  printSummary({ layout, dryRun });
}

function printSummary({ layout, dryRun }) {
  const header = dryRun ? 'DRY-RUN — install URLs that would be published:' : 'Published install URLs:';
  console.log('\n' + '═'.repeat(header.length));
  console.log(header);
  console.log('═'.repeat(header.length) + '\n');
  console.log(`Channel "${layout.channel}" (v${layout.version})`);
  console.log(`  ${layout.channelTarget.manifestUrl}\n`);
  for (const t of layout.testerTargets) {
    console.log(`Tester group: ${t.group}  (v${layout.version})`);
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
