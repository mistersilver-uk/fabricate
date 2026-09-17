/** S3 release pipeline for the Fabricate Foundry module. */
import { execSync } from 'node:child_process';
import { readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { argv, env, exit } from 'node:process';
import { fileURLToPath } from 'node:url';

import { assertPublishSafety, fetchPublishState } from './lib/publishGuard.js';
import { assertArchiveChunkCompleteness } from './lib/releaseZipChunks.js';
import { zipDirectory } from './lib/zip.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const STAGING_DIR = join(ROOT, 'build', 's3');

export const CACHE_IMMUTABLE = 'public, max-age=31536000, immutable';
const CACHE_NO_CACHE = 'no-cache, max-age=0, must-revalidate';

/**
 * The tester-path secret of the channel named by the scalar `config.channel`. It is the ONLY
 * back-compat default: a channel declared in `config.channels` names its own secret.
 */
const DEFAULT_TESTER_SECRET_ENV = 'S3_TESTER_PATH_SECRET';

// Running inside CI (GitHub Actions). In CI we never print S3 keys, `s3://` URIs, the bucket host,
// or full install URLs — those leak the cohort secret path into job logs.
const isCI = (envMap) => envMap.GITHUB_ACTIONS === 'true' || envMap.CI === 'true';

// The live secret segment, captured for the top-level error handler so an AWS error that echoes a
// key (e.g. "NoSuchKey: testers/<group>/<segment>/…") is redacted before it reaches CI logs.
let activeTesterSegment = '';

/**
 * Belt-and-suspenders: replace the secret tester segment with `***` anywhere it might appear in a
 * string we print.
 */
export function redactSegment(str, segment) {
  const s = String(str ?? '');
  if (!segment) return s;
  return s.split(segment).join('***');
}

/**
 * Strip trailing `/` from a URL or path. A linear scan, NOT `replace(/\/+$/, '')`: the anchored `+`
 * is retried from every position on a run of slashes, which is quadratic on an input like
 * `'/////…/a'`.
 */
function stripTrailingSlashes(value) {
  const s = String(value ?? '');
  let end = s.length;
  while (end > 0 && s[end - 1] === '/') end -= 1;
  return s.slice(0, end);
}

/** Strip leading and trailing `/` from a path segment. Same reasoning as above. */
function trimSlashes(value) {
  const s = stripTrailingSlashes(value);
  let start = 0;
  while (start < s.length && s[start] === '/') start += 1;
  return s.slice(start);
}

// Exported pure helpers (also used by tests)

/** Parse `--flag <value>` from an argv slice. Returns the value or null. */
export function getFlag(args, flag) {
  const idx = args.indexOf(flag);
  if (idx !== -1 && args[idx + 1] && !args[idx + 1].startsWith('--')) {
    return args[idx + 1];
  }
  return null;
}

/**
 * @typedef {object} ChannelConfig
 * @property {string} channel              - the channel this resolves
 * @property {string[]} testerGroups       - the cohorts served by this channel (possibly none)
 * @property {string|null} testerSecretEnv - env var holding this channel's tester path secret
 * @property {'declared'|'default'|'undeclared'} source - where the answer came from
 */

/** Resolve one channel's publish configuration. */
export function resolveChannelConfig(config, channel) {
  if (typeof channel !== 'string' || channel === '') {
    throw new TypeError('resolveChannelConfig: a channel name is required.');
  }

  const channels = config?.channels;
  const declared =
    channels && typeof channels === 'object' && Object.hasOwn(channels, channel)
      ? channels[channel]
      : null;

  if (declared) {
    return {
      channel,
      testerGroups: [...(declared.testerGroups ?? [])],
      testerSecretEnv: declared.testerSecretEnv ?? null,
      source: 'declared',
    };
  }

  if (channel === config?.channel) {
    return {
      channel,
      testerGroups: [...(config.testerGroups ?? [])],
      testerSecretEnv: DEFAULT_TESTER_SECRET_ENV,
      source: 'default',
    };
  }

  return { channel, testerGroups: [], testerSecretEnv: null, source: 'undeclared' };
}

/**
 * @typedef {object} PublishTarget
 * @property {'channel'|'tester'} kind
 * @property {string} label        - stable id for logging / staging dirs
 * @property {string|null} group   - access-group name (tester targets only)
 * @property {string} buildProfile - the build variant these bytes came from (issue 345)
 * @property {string} zipKey       - S3 key for the immutable versioned zip
 * @property {string} manifestKey  - S3 key for the "latest" manifest
 * @property {string} manifestUrl  - public URL baked into this target's module.json `manifest`
 * @property {string} downloadUrl  - public URL of this target's own versioned zip
 */

/** Derive the per-target S3 layout for a module release. */
export function deriveS3Layout({
  moduleId,
  channel,
  version,
  baseUrl,
  testerGroups = [],
  testerSegment = '',
  buildProfile = 'community',
  testerBuildProfile,
}) {
  const base = stripTrailingSlashes(baseUrl);
  const zipName = `${moduleId}-${version}.zip`;

  /** @returns {PublishTarget} */
  const makeTarget = (kind, group, prefix, manifestKey, profile) => {
    const zipKey = `${prefix}/versions/${version}/${zipName}`;
    return {
      kind,
      group,
      label: group ? `tester-${group}` : `channel-${channel}`,
      // The build variant these bytes came from. Every target in one publish must share it (issue
      // 345); a differing tester profile is the tripwire main() fails on before writing anything.
      buildProfile: profile,
      zipKey,
      manifestKey,
      manifestUrl: `${base}/${manifestKey}`,
      // Each feed references its OWN zip — cohorts never share a download.
      downloadUrl: `${base}/${zipKey}`,
    };
  };

  const channelPrefix = `modules/${moduleId}/${channel}`;
  const channelTarget = makeTarget(
    'channel',
    null,
    channelPrefix,
    `${channelPrefix}/latest/module.json`,
    buildProfile
  );

  // The secret segment sits between the (public) group and the module id so the
  // tester feed URL can't be guessed from the group name alone.
  const segment = trimSlashes(testerSegment);
  const testerTargets = testerGroups.map((group) => {
    const prefix = segment
      ? `testers/${group}/${segment}/${moduleId}`
      : `testers/${group}/${moduleId}`;
    return makeTarget(
      'tester',
      group,
      prefix,
      `${prefix}/module.json`,
      testerBuildProfile ?? buildProfile
    );
  });

  return {
    zipName,
    channel,
    version,
    channelTarget,
    testerTargets,
    targets: [channelTarget, ...testerTargets],
  };
}

/** The build-provenance stamp attached to every versioned zip (and re-stamped by the backfill). */
export function provenanceMetadata(version, sourceSha, buildProfile) {
  return {
    'fabricate-version': version,
    'fabricate-source-sha': sourceSha || 'unknown',
    'fabricate-build-profile': buildProfile || 'community',
  };
}

/** The issue-345 tripwire. */
export function assertUniformBuildProfile(targets) {
  const profiles = [...new Set(targets.map((target) => target.buildProfile ?? 'community'))];
  if (profiles.length > 1) {
    throw new Error(
      `release-s3: publish targets disagree on build profile (${profiles.join(', ')}) — refusing ` +
        'to publish before anything is written. A single publish MUST produce one build for every ' +
        'target (see issue 345): shipping a different build to a cohort is a build-profile concern ' +
        'that must not be expressed as a tester group until the one-build-per-publish invariant is ' +
        'first lifted.'
    );
  }
  return profiles[0] ?? 'community';
}

// Main script logic

/** Refuse to continue. */
function fail(message) {
  throw new Error(`release-s3: ${message}`);
}

/**
 * The S3 operations this script performs, as a port. `getObject` reports an HTTP status instead of
 * throwing (the guard has to tell a 404 from a 403); the others behave conventionally.
 *
 * `headObject` returns the object's `{ etag, size, metadata }` (or `null` when absent) rather than a
 * bare boolean: the guard reads the versioned zip's provenance metadata from it to tell a resume
 * (same build) from a same-version content swap (a different build).
 *
 * @typedef {object} S3Port
 * @property {(key: string) => Promise<{etag: string|undefined, size: number|undefined,
 *   metadata: Record<string, string>}|null>} headObject The object's head, or `null` when absent.
 * @property {(key: string) => Promise<{status: number, body: string|null, etag?: string}>} getObject
 * @property {(put: {key: string, body: unknown, contentType: string, cacheControl: string,
 *   metadata?: Record<string, string>, ifMatch?: string, ifNoneMatch?: string}) =>
 *   Promise<unknown>} putObject
 * @property {(prefix: string) => Promise<string[]>} listObjects Every key under a prefix.
 * @property {(copy: {sourceKey: string, destKey: string, metadata: Record<string, string>,
 *   contentType: string, cacheControl: string}) => Promise<unknown>} copyObject
 */

/** Map an AWS SDK error to an HTTP status, or `null` when it carries none. */
export function s3StatusFromError(error) {
  const status = error?.$metadata?.httpStatusCode;
  if (typeof status === 'number') return status;
  if (error?.name === 'NoSuchKey' || error?.name === 'NotFound') return 404;
  if (error?.name === 'AccessDenied' || error?.name === 'Forbidden') return 403;
  return null;
}

/** The real S3 port. Imported lazily so a dry-run — and every test — never loads the AWS SDK. */
async function createDefaultS3Client({ bucket, region }) {
  const {
    S3Client,
    HeadObjectCommand,
    GetObjectCommand,
    PutObjectCommand,
    ListObjectsV2Command,
    CopyObjectCommand,
  } = await import('@aws-sdk/client-s3');
  const s3 = new S3Client(region ? { region } : {});

  return {
    headObject: async (key) => {
      try {
        const response = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        // S3 lower-cases user-metadata keys and strips the `x-amz-meta-` prefix, so `Metadata` comes
        // back keyed exactly as the provenance stamp was written (`fabricate-source-sha`, …).
        return {
          etag: response.ETag,
          size: response.ContentLength,
          metadata: response.Metadata ?? {},
        };
      } catch (error) {
        if (s3StatusFromError(error) === 404) return null;
        throw error;
      }
    },
    getObject: async (key) => {
      try {
        const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        return { status: 200, body: await response.Body.transformToString(), etag: response.ETag };
      } catch (error) {
        // A status-carrying error is DATA for the guard (404 ⇒ absent; 403 ⇒ a hard error, which
        // the guard raises itself). Anything else is a genuine fault: rethrow it.
        const status = s3StatusFromError(error);
        if (status === null) throw error;
        return { status, body: null };
      }
    },
    putObject: ({ key, body, contentType, cacheControl, metadata, ifMatch, ifNoneMatch }) =>
      s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          CacheControl: cacheControl,
          ...(metadata && { Metadata: metadata }),
          // The conditional write closes the read-then-write TOCTOU on the manifest head: IfMatch
          // pins the ETag we read; IfNoneMatch '*' is a create-only write for a brand-new target.
          ...(ifMatch && { IfMatch: ifMatch }),
          ...(ifNoneMatch && { IfNoneMatch: ifNoneMatch }),
        })
      ),
    listObjects: async (prefix) => {
      const keys = [];
      let continuationToken;
      do {
        const page = await s3.send(
          new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: prefix,
            ContinuationToken: continuationToken,
          })
        );
        for (const object of page.Contents ?? []) keys.push(object.Key);
        continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (continuationToken);
      return keys;
    },
    copyObject: (copy) => s3.send(new CopyObjectCommand(buildCopyObjectParams(bucket, copy))),
  };
}

/** Build the `CopyObjectCommand` input for a provenance backfill. */
export function buildCopyObjectParams(
  bucket,
  { sourceKey, destKey, metadata, contentType, cacheControl }
) {
  const encodedSource = sourceKey.split('/').map(encodeURIComponent).join('/');
  return {
    Bucket: bucket,
    CopySource: `${bucket}/${encodedSource}`,
    Key: destKey,
    MetadataDirective: 'REPLACE',
    Metadata: metadata,
    ContentType: contentType,
    CacheControl: cacheControl,
  };
}

/** Build dist/ at the requested version and hand back the built manifest. */
async function defaultBuild({ version }) {
  try {
    execSync(`node scripts/release.js --dist-version "${version}" --no-zip`, {
      cwd: ROOT,
      stdio: 'inherit',
    });
  } catch {
    fail('build failed');
  }

  const distDir = join(ROOT, 'dist');
  const manifestPath = join(distDir, 'module.json');
  try {
    return { distDir, manifest: JSON.parse(await readFile(manifestPath, 'utf8')) };
  } catch (error) {
    // `fail` always throws, so this is not a missing return — and it is deliberately NOT written as
    // `return fail(…)`: consuming the value of a function a static analyser types as `void` is
    // reported as a reliability BUG (Sonar S3699), which fails the gate outright.
    fail(`build did not produce a readable ${manifestPath}: ${error.message}`);
  }
}

/**
 * The injectable collaborators of `main()` and `runCheckHeads()`. Every one of them exists so the
 * guard can be proven at the `main()` level — an injected S3 double asserting ZERO `PutObject` calls
 * when a head is Foundry-newer — with no real build, no real zip, and no real bucket.
 *
 * @typedef {object} ReleaseDeps
 * @property {Record<string, string|undefined>} [env] Environment map (`runCheckHeads` only —
 *   `main()` takes `env` as a top-level argument).
 * @property {(opts: {zipPath: string, manifest: object}) => unknown} [assertArchiveChunks] The
 *   archive-completeness gate (issue 1565). Injectable for the same reason `zip` is: the harnesses
 *   inject a `zip` that writes the 9-byte string `zip-bytes`, and a zip reader throws on that, so
 *   every test that is not ABOUT this gate stubs it out and one test per harness arms it for real.
 * @property {(opts: {version: string}) => Promise<{distDir: string, manifest: object}>} [build]
 * @property {(distDir: string, zipPath: string) => void} [zip]
 * @property {(opts: {bucket: string, region?: string}) => Promise<S3Port>} [createS3Client]
 * @property {string} [stagingDir] Where per-target zips are staged.
 * @property {(...args: unknown[]) => void} [log]
 */

/**
 * Resolve everything a publish needs from the config + env — including the channel's OWN tester
 * groups and secret — and derive the target layout.
 */
function resolvePublishPlan({ config, channel, version, env: envMap, buildProfile = 'community' }) {
  const moduleId = config?.moduleId;
  if (!moduleId) fail('config is missing "moduleId"');
  if (!channel) fail('config is missing "channel" (and no --channel given)');

  const bucket = envMap.S3_RELEASE_BUCKET || config.bucket || '';
  const baseUrl = stripTrailingSlashes(envMap.RELEASE_BASE_URL || config.baseUrl || '');
  const channelConfig = resolveChannelConfig(config, channel);

  const secretEnv = channelConfig.testerSecretEnv;
  const testerSegment = trimSlashes(secretEnv ? envMap[secretEnv] || '' : '');
  if (channelConfig.testerGroups.length > 0 && !testerSegment) {
    const cause = secretEnv ? `${secretEnv} is unset` : 'declares no "testerSecretEnv"';
    fail(
      `channel "${channel}" declares ${channelConfig.testerGroups.length} tester group(s) but ` +
        `${cause} — refusing to publish to a guessable path. Set that channel's OWN secret (a ` +
        'GitHub Actions secret in CI; an env var locally) before publishing.'
    );
  }

  // A tester group MAY declare its own build profile in config; when it differs from the channel's,
  // the layout carries mismatched profiles and the issue-345 tripwire in main() refuses the publish
  // before anything is written. There is no consumer today — it exists to fail loudly if one appears.
  const testerBuildProfile = config?.channels?.[channel]?.testerBuildProfile ?? buildProfile;

  const layout = deriveS3Layout({
    moduleId,
    channel,
    version,
    baseUrl: baseUrl || 'https://example.invalid',
    testerGroups: channelConfig.testerGroups,
    testerSegment,
    buildProfile,
    testerBuildProfile,
  });

  return { moduleId, bucket, baseUrl, channelConfig, testerSegment, layout };
}

/**
 * AWS credentials are validated lazily by the SDK on first call; these are the script-level inputs
 * with no provider chain behind them.
 */
function requireBucketAndBaseUrl({ bucket, baseUrl }) {
  const missing = [];
  if (!bucket) missing.push('S3_RELEASE_BUCKET (env or config.bucket)');
  if (!baseUrl) missing.push('RELEASE_BASE_URL (env or config.baseUrl)');
  if (missing.length > 0) {
    fail('missing required configuration:\n' + missing.map((m) => `  - ${m}`).join('\n'));
  }
}

/**
 * Read every target's head for a channel and report the verdict the guard would reach — building
 * nothing and writing nothing.
 */
export async function runCheckHeads({ config, version, channel, deps = {} }) {
  const envMap = deps.env ?? env;
  if (!version) fail('--version <ver> is required');

  const plan = resolvePublishPlan({ config, channel, version, env: envMap });
  activeTesterSegment = plan.testerSegment;
  requireBucketAndBaseUrl(plan);

  const createClient = deps.createS3Client ?? createDefaultS3Client;
  const s3 = await createClient({ bucket: plan.bucket, region: envMap.AWS_REGION });

  const heads = await fetchPublishState(plan.layout.targets, { getObject: s3.getObject });
  const safety = assertPublishSafety({
    version,
    staged: plan.layout.targets.map((target) => ({ target })),
    state: heads,
    allowDowngrade: false,
  });

  return { channel, version, heads, safety };
}

/** Publish a version to a channel. */
export async function main({ argv: argvInput = argv, env: envInput = env, deps = {} } = {}) {
  const log = deps.log ?? console.log;
  const ci = isCI(envInput);
  const options = parseArgs(argvInput.slice(2));
  const { version, dryRun } = options;

  const config = await loadConfig(options.configPath);
  const channel = options.channelOverride || config.channel;

  // --check-heads is read-only: no build, no staging, no writes.
  if (options.checkHeads) {
    if (!version) fail('--version <ver> is required');
    return reportHeads({ config, version, channel, deps, env: envInput, log });
  }

  // --backfill-provenance is a one-shot maintenance mode over EXISTING zips; it enumerates every
  // version itself, so it needs no --version, builds nothing, and touches no manifest.
  if (options.backfillProvenance) {
    return runBackfill({ config, channel, options, deps, env: envInput, log });
  }

  if (!version) fail('--version <ver> is required');

  // Resolve the channel's own targets (its tester groups + secret come from the CHANNEL).
  const plan = resolvePublishPlan({
    config,
    channel,
    version,
    env: envInput,
    buildProfile: options.buildProfile,
  });
  // Assigned BEFORE anything can throw with an S3 key in it, so the CLI's catch-all can redact it.
  activeTesterSegment = plan.testerSegment;
  if (!dryRun) requireBucketAndBaseUrl(plan);

  // The issue-345 tripwire runs BEFORE the build and BEFORE any write: a publish whose targets do
  // not all share one build profile fails here with nothing built and nothing uploaded.
  const buildProfile = assertUniformBuildProfile(plan.layout.targets);
  printPlan({ plan, channel, version, dryRun, ci, log });

  // Build dist/ at the requested version, then validate what came out.
  log('release-s3: building...');
  const build = deps.build ?? defaultBuild;
  const { distDir, manifest: built } = await build({ version });
  assertBuiltManifest(built, { moduleId: plan.moduleId, version });

  const staged = await stageTargets({ plan, built, distDir, deps, ci, log });

  // Guard, then upload — and a dry-run does neither, because it reaches no bucket at all (it has no
  // credentials to reach one with).
  const { safety, put } = dryRun
    ? { safety: null, put: [] }
    : await publishTargets({
        plan,
        staged,
        version,
        sourceSha: options.sourceSha,
        buildProfile,
        options,
        deps,
        env: envInput,
        ci,
        log,
      });

  printSummary({ layout: plan.layout, dryRun, segment: plan.testerSegment, ci, log });
  return { layout: plan.layout, staged, safety, put, dryRun };
}

/**
 * @param {string[]} args The argv slice.
 * @returns {{version: string|null, channelOverride: string|null, configPath: string,
 *   sourceSha: string|null, buildProfile: string, dryRun: boolean, overwrite: boolean,
 *   checkHeads: boolean, allowDowngrade: boolean, backfillProvenance: boolean}} The options.
 */
function parseArgs(args) {
  return {
    version: getFlag(args, '--version'),
    channelOverride: getFlag(args, '--channel'),
    configPath: getFlag(args, '--config') || join(ROOT, 'release.s3.config.json'),
    // The source commit stamped into every zip's provenance.
    sourceSha: getFlag(args, '--source-sha'),
    buildProfile: getFlag(args, '--build-profile') || 'community',
    dryRun: args.includes('--dry-run'),
    overwrite: args.includes('--overwrite'),
    checkHeads: args.includes('--check-heads'),
    allowDowngrade: args.includes('--allow-downgrade'),
    backfillProvenance: args.includes('--backfill-provenance'),
  };
}

/**
 * @param {string} configPath The config to read.
 * @returns {Promise<object>} The parsed config.
 */
async function loadConfig(configPath) {
  try {
    return JSON.parse(await readFile(configPath, 'utf8'));
  } catch (error) {
    // Not `return fail(…)`: see defaultBuild.
    fail(`could not read config at ${configPath}: ${error.message}`);
  }
}

/** The `--check-heads` command: read, report, and refuse if the guard would. */
async function reportHeads({ config, version, channel, deps, env: envMap, log }) {
  const report = await runCheckHeads({ config, version, channel, deps: { ...deps, env: envMap } });
  printHeadReport(report, log);
  if (!report.safety.ok) fail(report.safety.error);
  return report;
}

/**
 * Refuse a build that did not produce a usable manifest. The empty-string arm matters: a `title:
 * ''` is well-formed JSON that Foundry will happily install as a nameless module.
 */
function assertBuiltManifest(built, { moduleId, version }) {
  for (const field of ['id', 'title', 'version', 'compatibility']) {
    if ([undefined, null, ''].includes(built[field])) {
      fail(`built module.json is missing required field "${field}"`);
    }
  }
  if (built.id !== moduleId) {
    fail(`config moduleId "${moduleId}" does not match built module.json id "${built.id}"`);
  }
  if (built.version !== version) {
    fail(`version mismatch: requested ${version} built ${built.version}`);
  }
}

/**
 * Stage one zip per target: rewrite dist/module.json with that target's OWN feed URLs, then zip
 * dist/ to a per-target staging path.
 */
async function stageTargets({ plan, built, distDir, deps, ci, log }) {
  const { layout } = plan;
  const stagingDir = deps.stagingDir ?? STAGING_DIR;
  const zip = deps.zip ?? zipDirectory;
  const assertChunks = deps.assertArchiveChunks ?? assertArchiveChunkCompleteness;
  const distManifestPath = join(distDir, 'module.json');
  await rm(stagingDir, { recursive: true, force: true });

  const staged = [];
  for (const target of layout.targets) {
    const body = { ...built, manifest: target.manifestUrl, download: target.downloadUrl };
    await writeFile(distManifestPath, JSON.stringify(body, null, 2) + '\n');

    const outDir = join(stagingDir, target.label);
    await mkdir(outDir, { recursive: true });
    const zipPath = join(outDir, layout.zipName);
    zip(distDir, zipPath);
    // `body` is the manifest just written into dist/, so it is the manifest that is now inside this
    // archive — which is what makes its `esmodules` the right place to learn the entry script's
    // name.
    try {
      assertChunks({ zipPath, manifest: body });
    } catch (error) {
      fail(`staged archive for ${target.label} is incomplete: ${error.message}`);
    }
    // Label only in CI (the key carries the secret segment); full key locally.
    log(
      ci
        ? `release-s3: staged ${target.label}`
        : `release-s3: staged ${target.label} -> ${target.zipKey}`
    );
    staged.push({ target, body, zipPath });
  }
  return staged;
}

/** Publish the staged targets — guard first, always. */
async function publishTargets({
  plan,
  staged,
  version,
  sourceSha,
  buildProfile,
  options,
  deps,
  env: envMap,
  ci,
  log,
}) {
  const createClient = deps.createS3Client ?? createDefaultS3Client;
  const s3 = await createClient({ bucket: plan.bucket, region: envMap.AWS_REGION });

  // 1. THE GUARD. Every head AND every already-published zip, read per TARGET, BEFORE a single
  //    object is written. Its verdict decides which zips to skip (an unchanged immutable artefact
  //    from the same build — the resume path) and refuses a same-version content swap. It REPLACES
  //    the old zip-exists pre-flight; there is no separate existence check layered around it.
  const { safety, state } = await guardHeads({
    s3,
    plan,
    staged,
    version,
    sourceSha,
    buildProfile,
    allowDowngrade: options.allowDowngrade,
    overwrite: options.overwrite,
    log,
  });

  // 2. Upload — skipping the zips (and any already-identical manifests) the guard resolved, and
  //    writing each manifest conditionally so a head that moved after we read it is not clobbered.
  const put = await uploadTargets({
    s3,
    staged,
    state,
    plan,
    version,
    sourceSha,
    buildProfile,
    skipZipKeys: new Set(safety.skipZipKeys),
    skipManifestKeys: new Set(safety.skipManifestKeys),
    ci,
    log,
  });

  // 3. Read back every manifest and confirm it advertises the published version. A tester manifest
  //    is a separate PutObject with no transaction around it, so a partial publish must fail here
  //    rather than report green.
  await verifyReadBack({ s3, staged, version, log });
  return { safety, put };
}

/**
 * Read every target's head + zip and refuse the publish if any of them would be moved backwards or
 * would replace an already-distributed version with different bytes.
 */
async function guardHeads({
  s3,
  plan,
  staged,
  version,
  sourceSha,
  buildProfile,
  allowDowngrade,
  overwrite,
  log,
}) {
  const state = await fetchPublishState(plan.layout.targets, {
    getObject: s3.getObject,
    headObject: s3.headObject,
  });
  const safety = assertPublishSafety({
    version,
    sourceSha,
    buildProfile,
    staged,
    state,
    allowDowngrade,
    overwrite,
  });

  for (const warning of safety.warnings) log(`release-s3: ⚠ ${warning}`);
  for (const decision of safety.decisions) {
    log(`release-s3: head ${decision.label}: ${decision.decision} — ${decision.reason}`);
  }
  if (!safety.ok) fail(safety.error);
  return { safety, state };
}

/**
 * The conditional-write header for one target's manifest: `IfMatch <etag>` when a head was read, or
 * `IfNoneMatch '*'` (a create-only write) for a brand-new target.
 */
function writeConditionFor(state, manifestKey) {
  const record = state.find((entry) => entry.manifestKey === manifestKey);
  if (record?.present) return { ifMatch: record.manifest?.etag };
  return { ifNoneMatch: '*' };
}

/**
 * @param {{s3: S3Port, staged: object[], state: object[], plan: object, version: string,
 *   sourceSha: string|undefined, buildProfile: string, skipZipKeys: Set<string>,
 *   skipManifestKeys: Set<string>, ci: boolean, log: (...args: unknown[]) => void}} opts The port,
 *   the staged targets, the state read by the guard, and the skip sets.
 * @returns {Promise<string[]>} The keys actually written, in order.
 */
async function uploadTargets({
  s3,
  staged,
  state,
  plan,
  version,
  sourceSha,
  buildProfile,
  skipZipKeys,
  skipManifestKeys,
  ci,
  log,
}) {
  const put = [];
  for (const { target, body, zipPath } of staged) {
    if (skipZipKeys.has(target.zipKey)) {
      if (!ci)
        log(`release-s3: skip zip       -> ${target.zipKey} (already published, same build)`);
    } else {
      const zipBytes = await readFile(zipPath);
      if (!ci) log(`release-s3: upload zip      -> s3://${plan.bucket}/${target.zipKey}`);
      await s3.putObject({
        key: target.zipKey,
        body: zipBytes,
        contentType: 'application/zip',
        cacheControl: CACHE_IMMUTABLE,
        metadata: provenanceMetadata(version, sourceSha, target.buildProfile ?? buildProfile),
      });
      put.push(target.zipKey);
    }

    if (skipManifestKeys.has(target.manifestKey)) {
      if (!ci) log(`release-s3: skip manifest  -> ${target.manifestKey} (already at ${version})`);
    } else {
      if (!ci) log(`release-s3: upload manifest -> s3://${plan.bucket}/${target.manifestKey}`);
      const condition = writeConditionFor(state, target.manifestKey);
      await s3.putObject({
        key: target.manifestKey,
        body: JSON.stringify(body, null, 2),
        contentType: 'application/json',
        cacheControl: CACHE_NO_CACHE,
        ifMatch: condition.ifMatch,
        ifNoneMatch: condition.ifNoneMatch,
      });
      put.push(target.manifestKey);
    }
    if (ci) log(`release-s3: uploaded ${target.label}`);
  }
  return put;
}

/** Re-read every manifest a publish just wrote and confirm it advertises the published version. */
async function verifyReadBack({ s3, staged, version, log }) {
  for (const { target } of staged) {
    const response = await s3.getObject(target.manifestKey);
    if (response?.status !== 200) {
      fail(
        `post-publish read-back of ${target.label} failed: HTTP ${response?.status} for its ` +
          'manifest. The publish may be partial — do NOT report success.'
      );
    }
    let manifest;
    try {
      manifest = JSON.parse(String(response.body));
    } catch {
      fail(`post-publish read-back of ${target.label} returned a manifest that is not valid JSON.`);
    }
    if (manifest?.version !== version) {
      fail(
        `post-publish read-back of ${target.label} advertises ${manifest?.version}, expected ` +
          `${version}. A publish that established some targets and not others must fail, not report ` +
          'green.'
      );
    }
  }
  log(`release-s3: read-back OK — every manifest advertises ${version}`);
}

// Provenance backfill (one-shot maintenance mode)

/**
 * The version-independent prefix under which a target's versioned zips live, derived from any one
 * of its zip keys: everything up to and including `/versions/`.
 */
function zipVersionsPrefix(zipKey) {
  return zipKey.slice(0, zipKey.indexOf('/versions/') + '/versions/'.length);
}

/**
 * The version segment of a versioned zip key (`.../versions/1.4.0/fabricate-1.4.0.zip` → `1.4.0`).
 */
function versionFromZipKey(zipKey) {
  const after = zipKey.split('/versions/', 2)[1];
  const version = after?.split('/', 1)[0];
  return version || null;
}

/** Resolve the source commit a version was built from, via its release tag. */
function defaultResolveSha(version) {
  try {
    const sha = execSync(`git rev-list -n 1 v${version}`, { cwd: ROOT }).toString().trim();
    return sha || null;
  } catch {
    return null;
  }
}

/**
 * Backfill the build-provenance stamp onto every existing versioned zip of a channel and its tester
 * targets, so a version already in soak (published by the requirements issue with no provenance)
 * stops reading as an unidentified build and the "provenance absent ⇒ fail closed" rule does not
 * fire mid-promotion.
 */
export async function runBackfill({
  config,
  channel,
  options,
  deps = {},
  env: envMap,
  log = () => {},
}) {
  const envResolved = deps.env ?? envMap ?? env;
  // Version is irrelevant to a backfill (it enumerates every version), but resolvePublishPlan needs
  // one to derive the target PREFIXES. The placeholder is discarded by zipVersionsPrefix.
  const plan = resolvePublishPlan({
    config,
    channel,
    version: options.version || '0.0.0',
    env: envResolved,
    buildProfile: options.buildProfile,
  });
  activeTesterSegment = plan.testerSegment;
  requireBucketAndBaseUrl(plan);

  const createClient = deps.createS3Client ?? createDefaultS3Client;
  const s3 = await createClient({ bucket: plan.bucket, region: envResolved.AWS_REGION });
  const resolveSha = deps.resolveSha ?? defaultResolveSha;

  const dryRun = Boolean(options.dryRun);
  const stamped = [];
  for (const target of plan.layout.targets) {
    const keys = await s3.listObjects(zipVersionsPrefix(target.zipKey));
    for (const key of keys) {
      if (!key.endsWith('.zip')) continue;
      const version = versionFromZipKey(key);
      if (!version) continue;
      const sourceSha = (await resolveSha(version)) || 'unknown';
      if (dryRun) {
        // A dry-run still LISTS the bucket (so it needs read credentials) but writes nothing — the
        // maintainer previews exactly which zips would be stamped, and with which sha, before the
        // one-shot mutates production immutable artefacts.
        log(`release-s3: [dry-run] would stamp ${target.label} v${version} (sha ${sourceSha})`);
        stamped.push({ key, version, sourceSha, buildProfile: target.buildProfile, dryRun: true });
        continue;
      }
      await s3.copyObject({
        sourceKey: key,
        destKey: key,
        metadata: provenanceMetadata(version, sourceSha, target.buildProfile),
        contentType: 'application/zip',
        cacheControl: CACHE_IMMUTABLE,
      });
      log(`release-s3: backfilled provenance ${target.label} v${version} (sha ${sourceSha})`);
      stamped.push({ key, version, sourceSha, buildProfile: target.buildProfile });
    }
  }
  log(
    `release-s3: backfill ${dryRun ? 'DRY-RUN — would stamp' : 'complete — stamped'} ` +
      `${stamped.length} versioned zip(s)`
  );
  return { channel, stamped };
}

/**
 * @param {{plan: object, channel: string, version: string, dryRun: boolean, ci: boolean,
 *   log: (...args: unknown[]) => void}} opts What is about to happen.
 * @returns {void}
 */
function printPlan({ plan, channel, version, dryRun, ci, log }) {
  log(
    `release-s3: module=${plan.moduleId} channel=${channel} version=${version}${dryRun ? ' (dry-run)' : ''}`
  );
  // Neither the bucket nor the base URL is a secret — both are committed in release.s3.config.json,
  // in a public repo.
  if (!ci) {
    log(`release-s3: bucket=${plan.bucket || '(unset)'} baseUrl=${plan.baseUrl || '(unset)'}`);
  }
  log(`release-s3: targets=channel + ${plan.channelConfig.testerGroups.length} tester group(s)\n`);
}

/**
 * Print a `--check-heads` report. Keys are withheld (they carry the secret segment); labels and
 * versions are not secret.
 */
function printHeadReport(report, log) {
  log(`release-s3: --check-heads channel=${report.channel} version=${report.version}`);
  for (const head of report.heads) {
    log(`release-s3:   ${head.label}: head=${head.present ? head.head : '(none published)'}`);
  }
  for (const warning of report.safety.warnings) log(`release-s3: ⚠ ${warning}`);
  for (const decision of report.safety.decisions) {
    log(`release-s3:   ${decision.label}: ${decision.decision} — ${decision.reason}`);
  }
  log(`release-s3: verdict=${report.safety.ok ? 'publishable' : 'REFUSED'}`);
}

/**
 * @param {{layout: object, dryRun: boolean, segment: string, ci: boolean,
 *   log: (...args: unknown[]) => void}} opts The layout, mode, live secret, CI flag and logger.
 * @returns {void}
 */
function printSummary({ layout, dryRun, segment, ci, log }) {
  // CI: the install URLs ARE the cohort secret — never print them to job logs.
  if (ci) {
    const verb = dryRun ? 'would publish' : 'published';
    log(
      `\nrelease-s3: ${verb} channel + ${layout.testerTargets.length} tester feed(s) ` +
        `(v${layout.version}). Install URLs withheld from CI logs — run a local ` +
        `\`--dry-run\` with the channel's tester secret set to retrieve them.`
    );
    return;
  }
  // Local/dry-run: print the real install URLs so the maintainer can distribute
  // them privately (local stdout is not a public artifact). `segment` is the live
  // secret here by design — do not redact.
  void segment;
  const header = dryRun
    ? 'DRY-RUN — install URLs that would be published:'
    : 'Published install URLs:';
  log('\n' + '═'.repeat(header.length));
  log(header);
  log('═'.repeat(header.length) + '\n');
  log(`Channel "${layout.channel}" (v${layout.version})`);
  log(`  ${layout.channelTarget.manifestUrl}\n`);
  for (const t of layout.testerTargets) {
    log(`Tester group: ${t.group}  (v${layout.version})`);
    log(`  ${t.manifestUrl}\n`);
  }
}

// Run main only when invoked directly (not when imported by tests).
const isMainModule = argv[1] && fileURLToPath(import.meta.url) === argv[1];
if (isMainModule) {
  try {
    await main();
  } catch (error) {
    // In CI, redact the secret segment from any error text (AWS errors can echo
    // the object key) before it lands in the job log.
    const rendered = String(error?.stack || error);
    console.error(isCI(env) ? redactSegment(rendered, activeTesterSegment) : rendered);
    exit(1);
  }
}
