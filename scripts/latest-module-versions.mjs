#!/usr/bin/env node
/**
 * Query the current "latest" manifest version for the Fabricate module set.
 *
 * The script intentionally uses exact S3 GetObject calls for
 * modules/<moduleId>/<channel>/latest/module.json. It does not require
 * s3:ListBucket, which the local beta-admin user currently does not have.
 *
 * Usage:
 *   node scripts/latest-module-versions.mjs
 *   node scripts/latest-module-versions.mjs --profile fabricate-beta
 *   node scripts/latest-module-versions.mjs --json
 */
import { access, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { argv, env, exit } from 'node:process';
import { fileURLToPath } from 'node:url';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DEFAULT_REGION = 'eu-west-2';
const DEFAULT_PROFILE = 'fabricate-beta';
const DEFAULT_CHANNEL = 'beta';
const DEFAULT_FABRICATE_CONFIG = join(ROOT, 'release.s3.config.json');
const DEFAULT_PREMIUM_CONFIG = resolve(ROOT, '..', 'fabricate-premium', 'release.config.json');

/**
 * @param {string[]} args
 * @returns {Record<string, string|boolean|string[]>}
 */
export function parseArgs(args) {
  const options = {
    // profile/region are deliberately NOT defaulted here — resolveAwsEnv must be able to tell
    // "the caller asked for a profile" apart from "nobody mentioned a profile", because in CI
    // the difference decides whether the AWS SDK uses OIDC credentials or a nonexistent profile.
    channel: DEFAULT_CHANNEL,
    json: false,
    premium: true,
    config: DEFAULT_FABRICATE_CONFIG,
    premiumConfig: DEFAULT_PREMIUM_CONFIG,
    include: []
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const next = args[i + 1];
    const value = () => {
      if (!next || next.startsWith('--')) {
        throw new Error(`${arg} requires a value`);
      }
      i += 1;
      return next;
    };

    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--json') options.json = true;
    else if (arg === '--no-premium') options.premium = false;
    else if (arg === '--profile') options.profile = value();
    else if (arg === '--region') options.region = value();
    else if (arg === '--bucket') options.bucket = value();
    else if (arg === '--channel') options.channel = value();
    else if (arg === '--config') options.config = resolve(value());
    else if (arg === '--premium-config') options.premiumConfig = resolve(value());
    else if (arg === '--include') options.include.push(value());
    else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

/**
 * Resolve the AWS environment variables the S3 client should run under.
 *
 * The GitHub Actions case is the whole reason this is a separate, exported function:
 *
 *   - `AWS_PROFILE` must be ABSENT from the result when running under `GITHUB_ACTIONS` with no
 *     explicit `--profile`. Not empty, and above all not `undefined`: assigning `undefined` to a
 *     `process.env` key stores the STRING `"undefined"`, which the SDK dutifully resolves as a
 *     profile name and fails on.
 *   - The SDK's credential chain SKIPS the environment-variable provider entirely whenever
 *     `AWS_PROFILE` is set — so setting it at all in CI would make the SDK ignore the short-lived
 *     OIDC credentials that `aws-actions/configure-aws-credentials` exports, and the run would
 *     fail looking for a shared-config profile that does not exist on the runner.
 *
 * Locally the opposite is true: fall back to the maintainer's `fabricate-beta` profile so the
 * script works with no arguments.
 *
 * @param {Record<string, string|boolean|string[]>} [options] Parsed CLI options.
 * @param {Record<string, string|undefined>} [environment] The process environment to read.
 * @returns {Record<string, string>} The AWS environment overrides to apply. `AWS_PROFILE` is
 *   either a non-empty string or absent — never `undefined`.
 */
export function resolveAwsEnv(options = {}, environment = env) {
  const isGithubActions = Boolean(environment.GITHUB_ACTIONS);
  const explicitProfile = String(options.profile || '').trim();
  const localProfile = String(environment.AWS_PROFILE || '').trim() || DEFAULT_PROFILE;
  const profile = isGithubActions ? explicitProfile : explicitProfile || localProfile;

  const resolved = {
    AWS_REGION: String(options.region || environment.AWS_REGION || DEFAULT_REGION),
    AWS_SDK_LOAD_CONFIG: String(environment.AWS_SDK_LOAD_CONFIG || '1')
  };

  // Conditional assignment, never `AWS_PROFILE: profile || undefined` — see above.
  if (profile) resolved.AWS_PROFILE = profile;

  return resolved;
}

/**
 * Apply the resolved AWS environment to a target environment object (`process.env` by default).
 *
 * `Object.assign` alone is NOT enough, and that gap is the whole bug 0.4 exists to close: assign
 * cannot REMOVE a key. If `AWS_PROFILE` is already set in the runner's environment, an omitted
 * key leaves the stale value in place, the SDK sees a profile, skips the environment-variable
 * credential provider, and ignores the OIDC credentials entirely. So an omitted `AWS_PROFILE` is
 * explicitly DELETED, not merely not-written.
 *
 * @param {Record<string, string|boolean|string[]>} [options] Parsed CLI options.
 * @param {Record<string, string|undefined>} [environment] The process environment to read.
 * @param {Record<string, string|undefined>} [target] The environment object to mutate.
 * @returns {Record<string, string>} The AWS environment that was applied.
 */
export function applyAwsEnv(options = {}, environment = env, target = process.env) {
  const resolved = resolveAwsEnv(options, environment);
  Object.assign(target, resolved);
  if (!('AWS_PROFILE' in resolved)) delete target.AWS_PROFILE;
  return resolved;
}

/**
 * @param {string} path
 * @returns {Promise<boolean>}
 */
async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {string} path
 * @returns {Promise<object|null>}
 */
async function readJsonIfExists(path) {
  if (!path || !(await exists(path))) return null;
  return JSON.parse(await readFile(path, 'utf8'));
}

/**
 * @param {Array<string|null|undefined>} values
 * @returns {string[]}
 */
function uniqueStrings(values) {
  const seen = new Set();
  const out = [];
  for (const value of values) {
    const normalized = String(value || '').trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

/**
 * @param {object} opts
 * @param {object|null} opts.fabricateConfig
 * @param {object|null} opts.premiumConfig
 * @param {Record<string, string|boolean|string[]>} opts.options
 * @returns {Array<{moduleId: string, channel: string, buckets: string[], source: string}>}
 */
export function collectModuleTargets({ fabricateConfig, premiumConfig, options }) {
  const defaultBucket = String(options.bucket || env.S3_RELEASE_BUCKET || fabricateConfig?.bucket || '').trim();
  const channelOverride = String(options.channel || DEFAULT_CHANNEL).trim();
  const modules = [];

  if (fabricateConfig?.moduleId) {
    modules.push({
      moduleId: fabricateConfig.moduleId,
      channel: channelOverride || fabricateConfig.channel || DEFAULT_CHANNEL,
      buckets: uniqueStrings([defaultBucket, fabricateConfig.bucket]),
      source: 'fabricate'
    });
  }

  if (premiumConfig?.modules && options.premium !== false) {
    for (const entry of premiumConfig.modules) {
      if (!entry?.slug) continue;
      modules.push({
        moduleId: entry.slug,
        channel: channelOverride || entry.channel || DEFAULT_CHANNEL,
        buckets: uniqueStrings([defaultBucket, premiumConfig.bucket]),
        source: 'premium'
      });
    }
  }

  for (const moduleId of options.include || []) {
    modules.push({
      moduleId,
      channel: channelOverride,
      buckets: uniqueStrings([defaultBucket]),
      source: 'include'
    });
  }

  const seen = new Set();
  return modules.filter((entry) => {
    const key = `${entry.moduleId}:${entry.channel}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return entry.moduleId && entry.channel && entry.buckets.length > 0;
  });
}

/**
 * @param {ReadableStream|import('node:stream').Readable|string|Uint8Array|undefined} body
 * @returns {Promise<string>}
 */
async function bodyToString(body) {
  if (!body) return '';
  if (typeof body === 'string') return body;
  if (body instanceof Uint8Array) return Buffer.from(body).toString('utf8');
  if (typeof body.transformToString === 'function') return body.transformToString();

  const chunks = [];
  for await (const chunk of body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * @param {S3Client} s3
 * @param {{moduleId: string, channel: string, buckets: string[]}} target
 * @returns {Promise<object>}
 */
async function fetchLatestManifest(s3, target) {
  const key = `modules/${target.moduleId}/${target.channel}/latest/module.json`;
  const errors = [];

  for (const bucket of target.buckets) {
    try {
      const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      const manifest = JSON.parse(await bodyToString(response.Body));
      return {
        ok: true,
        moduleId: manifest.id || target.moduleId,
        title: manifest.title || '',
        version: manifest.version || '',
        channel: target.channel,
        bucket,
        key,
        manifestUrl: manifest.manifest || '',
        downloadUrl: manifest.download || '',
        lastModified: response.LastModified?.toISOString?.() || null,
        source: target.source
      };
    } catch (error) {
      errors.push(`${bucket}: ${error.name || 'Error'}${error.message ? `: ${error.message}` : ''}`);
    }
  }

  return {
    ok: false,
    moduleId: target.moduleId,
    title: '',
    version: '',
    channel: target.channel,
    bucket: target.buckets[0] || '',
    key,
    manifestUrl: '',
    downloadUrl: '',
    lastModified: null,
    source: target.source,
    error: errors.join(' | ')
  };
}

/**
 * @param {Array<Record<string, string|null|boolean>>} rows
 * @returns {string}
 */
export function formatTable(rows) {
  const headers = ['Module', 'Version', 'Updated UTC', 'Manifest'];
  const tableRows = rows.map((row) => [
    row.moduleId,
    row.ok ? row.version : 'ERROR',
    row.lastModified ? row.lastModified.replace('.000Z', 'Z') : '',
    row.ok ? row.manifestUrl : row.error
  ]);
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...tableRows.map((row) => String(row[index] || '').length))
  );

  const line = (cols) => cols
    .map((col, index) => String(col || '').padEnd(widths[index]))
    .join('  ')
    .trimEnd();

  return [
    line(headers),
    line(widths.map((width) => '-'.repeat(width))),
    ...tableRows.map(line)
  ].join('\n');
}

export function printHelp() {
  console.log(`Usage: node scripts/latest-module-versions.mjs [options]

Queries exact latest manifests from S3 without requiring ListBucket.

Options:
  --profile <name>          AWS CLI/shared-config profile (default: ${DEFAULT_PROFILE} locally;
                            no profile under GITHUB_ACTIONS, where OIDC credentials are used)
  --region <name>           AWS region (default: ${DEFAULT_REGION})
  --bucket <name>           Primary S3 bucket for manifests
  --channel <name>          Release channel (default: ${DEFAULT_CHANNEL})
  --config <path>           Fabricate release config path
  --premium-config <path>   Premium release config path
  --include <moduleId>      Add an explicit module id (repeatable)
  --no-premium              Do not read the sibling fabricate-premium config
  --json                    Print JSON instead of a table
  --help                    Show this help
`);
}

async function main() {
  const options = parseArgs(argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  // An absent AWS_PROFILE must be absent from process.env too — deleted, not just not-written.
  const awsEnv = applyAwsEnv(options, env);

  const fabricateConfig = await readJsonIfExists(String(options.config));
  const premiumConfig = options.premium === false
    ? null
    : await readJsonIfExists(String(options.premiumConfig));
  const targets = collectModuleTargets({ fabricateConfig, premiumConfig, options });

  if (targets.length === 0) {
    throw new Error('No module targets found. Check release config paths or pass --include <moduleId>.');
  }

  const s3 = new S3Client({ region: awsEnv.AWS_REGION });
  const rows = await Promise.all(targets.map((target) => fetchLatestManifest(s3, target)));

  if (options.json) {
    console.log(JSON.stringify(rows, null, 2));
  } else {
    console.log(formatTable(rows));
  }

  if (rows.some((row) => !row.ok)) {
    exitCode(2);
  }
}

function exitCode(code) {
  process.exitCode = code;
}

const isMain = argv[1] && fileURLToPath(import.meta.url) === argv[1];
if (isMain) {
  main().catch((error) => {
    console.error(`latest-module-versions: ${error.message}`);
    exit(1);
  });
}
