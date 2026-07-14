import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const {
  deriveS3Layout,
  getFlag,
  redactSegment,
  provenanceMetadata,
  assertUniformBuildProfile,
  buildCopyObjectParams,
  CACHE_IMMUTABLE,
  main,
  runBackfill,
} = await import('../scripts/release-s3.js');
const { assertPublishSafety, fetchPublishState } = await import('../scripts/lib/publishGuard.js');

// ───────────────────────────────────────────────────────────────────────────
// deriveS3Layout() tests
// ───────────────────────────────────────────────────────────────────────────

const baseOpts = {
  moduleId: 'fabricate',
  channel: 'beta',
  version: '0.2.0-rc.1',
  baseUrl: 'https://releases.example.io',
  testerGroups: ['closed-beta-2026'],
};

test('deriveS3Layout channel target is the canonical source feed', () => {
  const { channelTarget } = deriveS3Layout(baseOpts);
  assert.equal(channelTarget.kind, 'channel');
  assert.equal(channelTarget.group, null);
  assert.equal(
    channelTarget.zipKey,
    'modules/fabricate/beta/versions/0.2.0-rc.1/fabricate-0.2.0-rc.1.zip'
  );
  assert.equal(channelTarget.manifestKey, 'modules/fabricate/beta/latest/module.json');
  assert.equal(
    channelTarget.manifestUrl,
    'https://releases.example.io/modules/fabricate/beta/latest/module.json'
  );
  assert.equal(
    channelTarget.downloadUrl,
    'https://releases.example.io/modules/fabricate/beta/versions/0.2.0-rc.1/fabricate-0.2.0-rc.1.zip'
  );
});

test('deriveS3Layout emits one tester target per access group', () => {
  const { testerTargets } = deriveS3Layout({
    ...baseOpts,
    testerGroups: ['closed-beta-2026', 'press'],
  });
  assert.equal(testerTargets.length, 2);
  assert.deepEqual(
    testerTargets.map((t) => t.group),
    ['closed-beta-2026', 'press']
  );
  assert.ok(testerTargets.every((t) => t.kind === 'tester'));
});

test('deriveS3Layout tester target is a self-contained per-cohort feed', () => {
  const { testerTargets } = deriveS3Layout(baseOpts);
  const t = testerTargets[0];
  assert.equal(
    t.zipKey,
    'testers/closed-beta-2026/fabricate/versions/0.2.0-rc.1/fabricate-0.2.0-rc.1.zip'
  );
  assert.equal(t.manifestKey, 'testers/closed-beta-2026/fabricate/module.json');
  assert.equal(
    t.manifestUrl,
    'https://releases.example.io/testers/closed-beta-2026/fabricate/module.json'
  );
  // The cohort feed downloads its OWN zip — the baked manifest URL is the cohort URL.
  assert.equal(
    t.downloadUrl,
    'https://releases.example.io/testers/closed-beta-2026/fabricate/versions/0.2.0-rc.1/fabricate-0.2.0-rc.1.zip'
  );
});

test('deriveS3Layout keeps cohort feeds independent of the channel (no shared zip)', () => {
  const { channelTarget, testerTargets } = deriveS3Layout(baseOpts);
  const t = testerTargets[0];
  // Distinct zips + distinct baked manifest URLs => updates route per cohort.
  assert.notEqual(t.zipKey, channelTarget.zipKey);
  assert.notEqual(t.downloadUrl, channelTarget.downloadUrl);
  assert.notEqual(t.manifestUrl, channelTarget.manifestUrl);
});

test('deriveS3Layout targets is channel followed by every tester target', () => {
  const layout = deriveS3Layout(baseOpts);
  assert.equal(layout.targets.length, 2);
  assert.equal(layout.targets[0], layout.channelTarget);
  assert.equal(layout.targets[1], layout.testerTargets[0]);
});

test('deriveS3Layout strips trailing slashes from baseUrl', () => {
  const { channelTarget, testerTargets } = deriveS3Layout({
    ...baseOpts,
    baseUrl: 'https://releases.example.io///',
  });
  assert.equal(
    channelTarget.manifestUrl,
    'https://releases.example.io/modules/fabricate/beta/latest/module.json'
  );
  assert.equal(
    testerTargets[0].manifestUrl,
    'https://releases.example.io/testers/closed-beta-2026/fabricate/module.json'
  );
});

test('deriveS3Layout defaults to no tester targets', () => {
  const layout = deriveS3Layout({
    moduleId: 'fabricate',
    channel: 'beta',
    version: '0.2.0-rc.1',
    baseUrl: 'https://x.io',
  });
  assert.deepEqual(layout.testerTargets, []);
  assert.equal(layout.targets.length, 1);
});

test('deriveS3Layout preserves the full RC version string in keys and URLs', () => {
  const { channelTarget, zipName } = deriveS3Layout({ ...baseOpts, version: '1.10.0-rc.12' });
  assert.equal(zipName, 'fabricate-1.10.0-rc.12.zip');
  assert.ok(channelTarget.zipKey.includes('versions/1.10.0-rc.12/'));
  assert.ok(channelTarget.downloadUrl.endsWith('fabricate-1.10.0-rc.12.zip'));
});

test('deriveS3Layout respects a non-default channel', () => {
  const { channelTarget } = deriveS3Layout({ ...baseOpts, channel: 'rc' });
  assert.equal(channelTarget.manifestKey, 'modules/fabricate/rc/latest/module.json');
  assert.equal(
    channelTarget.zipKey,
    'modules/fabricate/rc/versions/0.2.0-rc.1/fabricate-0.2.0-rc.1.zip'
  );
});

test('deriveS3Layout uses stable labels for staging/logging', () => {
  const { channelTarget, testerTargets } = deriveS3Layout(baseOpts);
  assert.equal(channelTarget.label, 'channel-beta');
  assert.equal(testerTargets[0].label, 'tester-closed-beta-2026');
});

// ───────────────────────────────────────────────────────────────────────────
// Secret tester path segment (closed-beta URL rotation)
// ───────────────────────────────────────────────────────────────────────────

test('deriveS3Layout inserts the secret segment between group and module id', () => {
  const { testerTargets } = deriveS3Layout({ ...baseOpts, testerSegment: 's3cr3t' });
  const t = testerTargets[0];
  assert.equal(
    t.zipKey,
    'testers/closed-beta-2026/s3cr3t/fabricate/versions/0.2.0-rc.1/fabricate-0.2.0-rc.1.zip'
  );
  assert.equal(t.manifestKey, 'testers/closed-beta-2026/s3cr3t/fabricate/module.json');
  assert.equal(
    t.manifestUrl,
    'https://releases.example.io/testers/closed-beta-2026/s3cr3t/fabricate/module.json'
  );
  assert.equal(
    t.downloadUrl,
    'https://releases.example.io/testers/closed-beta-2026/s3cr3t/fabricate/versions/0.2.0-rc.1/fabricate-0.2.0-rc.1.zip'
  );
  // The label stays the public group name (no secret) — it is used in CI logs.
  assert.equal(t.label, 'tester-closed-beta-2026');
});

test('deriveS3Layout leaves the channel target unaffected by the secret segment', () => {
  const withSeg = deriveS3Layout({ ...baseOpts, testerSegment: 's3cr3t' }).channelTarget;
  const noSeg = deriveS3Layout(baseOpts).channelTarget;
  assert.deepEqual(withSeg, noSeg);
});

test('deriveS3Layout trims stray slashes around the secret segment', () => {
  const { testerTargets } = deriveS3Layout({ ...baseOpts, testerSegment: '/s3cr3t/' });
  assert.equal(
    testerTargets[0].manifestKey,
    'testers/closed-beta-2026/s3cr3t/fabricate/module.json'
  );
});

test('deriveS3Layout without a segment keeps the legacy (guessable) layout', () => {
  const { testerTargets } = deriveS3Layout(baseOpts);
  assert.equal(testerTargets[0].manifestKey, 'testers/closed-beta-2026/fabricate/module.json');
});

test('redactSegment masks the secret segment, and is a no-op without one', () => {
  assert.equal(
    redactSegment('s3://b/testers/closed-beta-2026/s3cr3t/fabricate/module.json', 's3cr3t'),
    's3://b/testers/closed-beta-2026/***/fabricate/module.json'
  );
  assert.equal(redactSegment('no secret here', ''), 'no secret here');
  assert.equal(redactSegment('no secret here'), 'no secret here');
});

// ───────────────────────────────────────────────────────────────────────────
// getFlag() tests
// ───────────────────────────────────────────────────────────────────────────

test('getFlag returns the value following a flag', () => {
  assert.equal(getFlag(['--version', '0.2.0-rc.1'], '--version'), '0.2.0-rc.1');
});

test('getFlag returns null when the flag is absent', () => {
  assert.equal(getFlag(['--dry-run'], '--version'), null);
});

test('getFlag returns null when the flag is followed by another flag', () => {
  assert.equal(getFlag(['--version', '--dry-run'], '--version'), null);
});

test('getFlag returns null when the flag is last with no value', () => {
  assert.equal(getFlag(['--dry-run', '--version'], '--version'), null);
});

// ───────────────────────────────────────────────────────────────────────────
// 1.1 / 1.3 — assertPublishSafety: the provenance decision table
// ───────────────────────────────────────────────────────────────────────────

const CH = {
  label: 'channel-beta',
  manifestKey: 'modules/fabricate/beta/latest/module.json',
  zipKey: 'z/ch',
};
const TE = { label: 'tester-x', manifestKey: 'testers/x/fabricate/module.json', zipKey: 'z/te' };

/** The provenance stamp a versioned zip carries (as `headObject` surfaces it). */
const prov = (version, sha, profile = 'community') => ({
  'fabricate-version': version,
  'fabricate-source-sha': sha,
  'fabricate-build-profile': profile,
});

/** A `headObject`-shaped zip head. */
const zipHead = (metadata) => ({ etag: 'zetag', size: 100, metadata });

/**
 * A `fetchPublishState`-shaped record. `body`, when given, is the S3-serialised (PUT-form) manifest
 * — no trailing newline — so the resume check can compare it byte-for-byte.
 */
const rec = ({ target, head = null, etag = 'metag', body, zip = null }) => ({
  label: target.label,
  manifestKey: target.manifestKey,
  present: head !== null,
  head,
  manifest:
    head === null
      ? null
      : { version: head, etag, body: body ?? JSON.stringify({ version: head }, null, 2) },
  zip,
});

/** assertPublishSafety with the fixed defaults these tests share. */
const safety = ({
  version = '1.4.0',
  sourceSha = 'sha1',
  buildProfile = 'community',
  staged,
  state,
  ...rest
}) => assertPublishSafety({ version, sourceSha, buildProfile, staged, state, ...rest });

test('assertPublishSafety allows a brand-new target (absent head, absent zip)', () => {
  const verdict = safety({ staged: [{ target: CH }], state: [rec({ target: CH, head: null })] });
  assert.equal(verdict.ok, true);
  assert.equal(verdict.decisions[0].decision, 'allow-no-head');
  assert.deepEqual(verdict.skipZipKeys, []);
});

test('assertPublishSafety allows a Foundry-older head with no already-published zip', () => {
  const verdict = safety({ staged: [{ target: CH }], state: [rec({ target: CH, head: '1.3.0' })] });
  assert.equal(verdict.ok, true);
  assert.equal(verdict.decisions[0].decision, 'allow');
});

test('assertPublishSafety RESUMES (allows + skips the zip PUT) on matching sha + profile + body', () => {
  const body = { id: 'fabricate', version: '1.4.0', manifest: 'u', download: 'd' };
  const state = [
    rec({
      target: CH,
      head: '1.4.0',
      body: JSON.stringify(body, null, 2),
      zip: zipHead(prov('1.4.0', 'sha1')),
    }),
  ];
  const verdict = safety({ staged: [{ target: CH, body }], state });
  assert.equal(verdict.ok, true);
  assert.equal(verdict.decisions[0].decision, 'allow-resume');
  assert.deepEqual(verdict.skipZipKeys, ['z/ch']);
  assert.deepEqual(verdict.skipManifestKeys, [CH.manifestKey]);
});

// Every same-version content swap fails closed even though the VERSION is unchanged.
for (const [name, mutate] of [
  ['a differing source sha', { zip: zipHead(prov('1.4.0', 'DIFFERENT')) }],
  ['a differing build profile', { zip: zipHead(prov('1.4.0', 'sha1', 'patron')) }],
  ['absent provenance metadata', { zip: zipHead({}) }],
  ['a source sha of "unknown"', { zip: zipHead(prov('1.4.0', 'unknown')) }],
]) {
  test(`assertPublishSafety fails closed on ${name} at an equal version`, () => {
    const body = { id: 'fabricate', version: '1.4.0' };
    const state = [
      rec({ target: CH, head: '1.4.0', body: JSON.stringify(body, null, 2), ...mutate }),
    ];
    const verdict = safety({ staged: [{ target: CH, body }], state });
    assert.equal(verdict.ok, false);
    assert.equal(verdict.violations[0].kind, 'provenance');
    assert.match(verdict.error, /already-published immutable artefact/);
  });
}

test('assertPublishSafety treats a guard-side sourceSha of "unknown" as absent (never a match)', () => {
  // The zip carries a REAL, identified sha — so the zip-side check would PASS. Only the guard-side
  // `unknown` branch can fail this case; pairing it with an identified zip isolates that branch (a
  // `if (sourceSha === 'unknown') return true` mutation would flip this to a resume and be caught).
  const body = { id: 'fabricate', version: '1.4.0' };
  const state = [
    rec({
      target: CH,
      head: '1.4.0',
      body: JSON.stringify(body, null, 2),
      zip: zipHead(prov('1.4.0', 'sha1')),
    }),
  ];
  const verdict = safety({ sourceSha: 'unknown', staged: [{ target: CH, body }], state });
  assert.equal(verdict.ok, false);
});

test('assertPublishSafety refuses a Foundry-newer head and names the violating target', () => {
  const verdict = safety({ staged: [{ target: TE }], state: [rec({ target: TE, head: '1.5.0' })] });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.violations[0].kind, 'downgrade');
  assert.match(verdict.error, /tester-x/);
});

test('assertPublishSafety allows a Foundry-newer head under --allow-downgrade', () => {
  const verdict = safety({
    staged: [{ target: CH }],
    state: [rec({ target: CH, head: '1.5.0' })],
    allowDowngrade: true,
  });
  assert.equal(verdict.ok, true);
  assert.equal(verdict.decisions[0].decision, 'allow-downgrade');
});

test('assertPublishSafety allows a same-version content swap under --overwrite', () => {
  const body = { id: 'fabricate', version: '1.4.0' };
  const state = [
    rec({
      target: CH,
      head: '1.4.0',
      body: JSON.stringify(body, null, 2),
      zip: zipHead(prov('1.4.0', 'DIFFERENT')),
    }),
  ];
  const verdict = safety({ staged: [{ target: CH, body }], state, overwrite: true });
  assert.equal(verdict.ok, true);
  assert.equal(verdict.decisions[0].decision, 'allow-overwrite');
  // --overwrite replaces the bytes; it does NOT skip the zip PUT.
  assert.deepEqual(verdict.skipZipKeys, []);
});

// ───────────────────────────────────────────────────────────────────────────
// 1.3 — the manifest body is compared in its S3-serialised (PUT) form
// ───────────────────────────────────────────────────────────────────────────

test('the resume check compares the S3-serialised body, not the dist form with its trailing newline', () => {
  const body = { id: 'fabricate', version: '1.4.0', manifest: 'u' };
  const putForm = JSON.stringify(body, null, 2); // what release-s3.js actually PUTs (no newline)
  const distForm = putForm + '\n'; // what it writes to dist/module.json

  // Stored in the PUT form → the staged body matches it → resume (skip the zip).
  const resumes = safety({
    staged: [{ target: CH, body }],
    state: [rec({ target: CH, head: '1.4.0', body: putForm, zip: zipHead(prov('1.4.0', 'sha1')) })],
  });
  assert.equal(resumes.ok, true);
  assert.deepEqual(resumes.skipZipKeys, ['z/ch']);

  // Had the guard compared the DIST form (with the trailing newline) it would read this identical
  // build as different and fail closed. Proven by storing the dist form: it must NOT match.
  const misread = safety({
    staged: [{ target: CH, body }],
    state: [
      rec({ target: CH, head: '1.4.0', body: distForm, zip: zipHead(prov('1.4.0', 'sha1')) }),
    ],
  });
  assert.equal(misread.ok, false);
});

// ───────────────────────────────────────────────────────────────────────────
// 1.1 / 1.2 — fetchPublishState surfaces manifest + zip provenance; 404 ⇒ null
// ───────────────────────────────────────────────────────────────────────────

test('fetchPublishState returns {version,etag,body} manifests and {etag,size,metadata} zips', async () => {
  const manifestBody = JSON.stringify({ version: '1.4.0' });
  const getObject = async (key) =>
    key === CH.manifestKey
      ? { status: 200, body: manifestBody, etag: 'e1' }
      : { status: 404, body: null };
  const headObject = async (key) =>
    key === CH.zipKey ? { etag: 'ze', size: 42, metadata: prov('1.4.0', 'sha1') } : null;

  const state = await fetchPublishState([CH, TE], { getObject, headObject });

  assert.deepEqual(state[0].manifest, { version: '1.4.0', etag: 'e1', body: manifestBody });
  assert.deepEqual(state[0].zip, { etag: 'ze', size: 42, metadata: prov('1.4.0', 'sha1') });
  // A 404 manifest ⇒ a null manifest (absent head); a 404 zip ⇒ a null zip.
  assert.equal(state[1].present, false);
  assert.equal(state[1].manifest, null);
  assert.equal(state[1].zip, null);
});

// ───────────────────────────────────────────────────────────────────────────
// 1.2 / 1.7 — provenanceMetadata + the build-profile tripwire (pure)
// ───────────────────────────────────────────────────────────────────────────

test('provenanceMetadata keys the stamp on version, source sha and build profile', () => {
  assert.deepEqual(provenanceMetadata('1.4.0', 'deadbeef', 'community'), {
    'fabricate-version': '1.4.0',
    'fabricate-source-sha': 'deadbeef',
    'fabricate-build-profile': 'community',
  });
  // A missing sha is stamped `unknown`, never left blank — the guard fails closed on it.
  assert.equal(
    provenanceMetadata('1.4.0', undefined, 'community')['fabricate-source-sha'],
    'unknown'
  );
});

test('assertUniformBuildProfile returns the shared profile, or fails naming issue 345', () => {
  assert.equal(
    assertUniformBuildProfile([{ buildProfile: 'community' }, { buildProfile: 'community' }]),
    'community'
  );
  let error;
  try {
    assertUniformBuildProfile([{ buildProfile: 'community' }, { buildProfile: 'patron' }]);
  } catch (caught) {
    error = caught;
  }
  assert.ok(error, 'a mixed-profile publish must throw');
  assert.match(error.message, /345/);
  assert.match(error.message, /build profile/);
  assert.doesNotMatch(error.message, /edition/);
});

// ───────────────────────────────────────────────────────────────────────────
// 1.4 — buildCopyObjectParams: REPLACE must re-supply ContentType + CacheControl
// ───────────────────────────────────────────────────────────────────────────

test('buildCopyObjectParams issues REPLACE and re-supplies ContentType + CacheControl', () => {
  const params = buildCopyObjectParams('b', {
    sourceKey: 'k',
    destKey: 'k',
    metadata: prov('1.4.0', 'sha1'),
    contentType: 'application/zip',
    cacheControl: CACHE_IMMUTABLE,
  });
  assert.equal(params.MetadataDirective, 'REPLACE');
  assert.equal(params.ContentType, 'application/zip');
  assert.equal(params.CacheControl, CACHE_IMMUTABLE);
  assert.equal(params.CopySource, 'b/k');
  assert.deepEqual(params.Metadata, prov('1.4.0', 'sha1'));
});

test('buildCopyObjectParams percent-encodes CopySource per segment, preserving slashes', () => {
  // x-amz-copy-source is an HTTP header the SDK serialises verbatim (not a path label it encodes),
  // so a URL-unsafe char in a secret tester segment must be encoded here or CopyObject breaks alone.
  const params = buildCopyObjectParams('my-bucket', {
    sourceKey: 'testers/closed-beta/a b+c%/fabricate/versions/1.4.0/fabricate-1.4.0.zip',
    destKey: 'ignored',
    metadata: prov('1.4.0', 'sha1'),
    contentType: 'application/zip',
    cacheControl: CACHE_IMMUTABLE,
  });
  assert.equal(
    params.CopySource,
    'my-bucket/testers/closed-beta/a%20b%2Bc%25/fabricate/versions/1.4.0/fabricate-1.4.0.zip'
  );
  // Slashes are preserved (each segment encoded independently), and the bucket name is left as-is.
  assert.ok(params.CopySource.startsWith('my-bucket/testers/closed-beta/'));
});

// ───────────────────────────────────────────────────────────────────────────
// 1.2 / 1.4 / 1.5 / 1.6 / 1.7 — through main(): conditional writes, read-back,
// provenance stamping, backfill, and the tripwire writing NOTHING
// ───────────────────────────────────────────────────────────────────────────

const MAIN_CONFIG = {
  moduleId: 'fabricate',
  bucket: 'test-bucket',
  baseUrl: 'https://releases.example.io',
  channel: 'beta',
  channels: {
    beta: { testerGroups: ['closed-beta-2026'], testerSecretEnv: 'S3_TESTER_PATH_SECRET' },
  },
};
const CH_MANIFEST = 'modules/fabricate/beta/latest/module.json';
const TE_MANIFEST = 'testers/closed-beta-2026/seg/fabricate/module.json';

/**
 * A `main()` harness with a tiny STATEFUL S3 double: manifest writes are reflected so the
 * post-publish read-back sees the version just published. `staleReadBack` forces the read-back to
 * come back at a different version, proving a partial publish fails the run.
 */
async function makeMain({
  config = MAIN_CONFIG,
  heads = {},
  zips = {},
  listing = {},
  resolveSha,
  staleReadBack = false,
} = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'fab-s3-main-'));
  const distDir = join(dir, 'dist');
  await mkdir(distDir, { recursive: true });
  const configPath = join(dir, 'cfg.json');
  await writeFile(configPath, JSON.stringify(config));

  // Per-KEY staleness: `staleReadBack` may be a boolean (every manifest reads back stale) or a
  // predicate naming WHICH keys do. Per-key lets a test hold the channel manifest current while only
  // the tester manifest reads back stale — which must STILL fail the run, pinning the "verify every
  // manifest" loop against a `staged.slice(0, 1)` mutation.
  const isStale = typeof staleReadBack === 'function' ? staleReadBack : () => staleReadBack;
  const store = {};
  const puts = [];
  const copies = [];
  const s3 = {
    headObject: async (key) => zips[key] ?? null,
    getObject: async (key) => {
      if (key in store) {
        return isStale(key)
          ? { status: 200, body: JSON.stringify({ version: '0.0.0-stale' }), etag: 'stale' }
          : { status: 200, body: store[key], etag: `etag-${key}` };
      }
      return heads[key] ?? { status: 404, body: null };
    },
    putObject: async (input) => {
      if (typeof input.body === 'string') store[input.key] = input.body;
      puts.push(input);
    },
    listObjects: async (prefix) => listing[prefix] ?? [],
    copyObject: async (input) => {
      copies.push(input);
    },
  };
  const deps = {
    log: () => {},
    stagingDir: join(dir, 'staging'),
    build: async ({ version }) => ({
      distDir,
      manifest: { id: 'fabricate', title: 'Fabricate', version, compatibility: { minimum: '13' } },
    }),
    zip: (from, to) => writeFileSync(to, 'zip-bytes'),
    createS3Client: async () => s3,
    resolveSha,
  };
  const run = (...flags) =>
    main({
      argv: ['node', 'release-s3.js', '--config', configPath, ...flags],
      env: { S3_TESTER_PATH_SECRET: 'seg' },
      deps,
    });
  return { run, puts, copies, store };
}

const manifestPut = (puts, key) =>
  puts.find((p) => p.key === key && p.contentType === 'application/json');
const zipPut = (puts, key) =>
  puts.find((p) => p.key === key && p.contentType === 'application/zip');

test('main() writes each manifest conditionally: IfMatch on an existing head, IfNoneMatch * on a new one', async () => {
  const harness = await makeMain({
    heads: {
      [CH_MANIFEST]: {
        status: 200,
        body: JSON.stringify({ version: '1.3.0-beta.9' }),
        etag: 'chetag',
      },
    },
  });

  await harness.run('--version', '1.4.0-beta.1', '--source-sha', 'deadbeef');

  // The channel head existed → IfMatch pins its ETag; the tester head was a 404 → create-only.
  assert.equal(manifestPut(harness.puts, CH_MANIFEST).ifMatch, 'chetag');
  assert.equal(manifestPut(harness.puts, CH_MANIFEST).ifNoneMatch, undefined);
  assert.equal(manifestPut(harness.puts, TE_MANIFEST).ifNoneMatch, '*');
  assert.equal(manifestPut(harness.puts, TE_MANIFEST).ifMatch, undefined);
});

test('main() stamps every versioned zip with the (version, source-sha, build-profile) provenance', async () => {
  const harness = await makeMain({
    heads: {
      [CH_MANIFEST]: {
        status: 200,
        body: JSON.stringify({ version: '1.3.0-beta.9' }),
        etag: 'chetag',
      },
    },
  });

  await harness.run('--version', '1.4.0-beta.1', '--source-sha', 'deadbeef');

  const channelZip = zipPut(
    harness.puts,
    'modules/fabricate/beta/versions/1.4.0-beta.1/fabricate-1.4.0-beta.1.zip'
  );
  assert.deepEqual(channelZip.metadata, {
    'fabricate-version': '1.4.0-beta.1',
    'fabricate-source-sha': 'deadbeef',
    'fabricate-build-profile': 'community',
  });
  assert.equal(channelZip.cacheControl, CACHE_IMMUTABLE);
});

test('main() fails the run when a post-publish read-back advertises a stale version', async () => {
  const harness = await makeMain({
    heads: {
      [CH_MANIFEST]: {
        status: 200,
        body: JSON.stringify({ version: '1.3.0-beta.9' }),
        etag: 'chetag',
      },
    },
    staleReadBack: true,
  });
  await assert.rejects(
    harness.run('--version', '1.4.0-beta.1', '--source-sha', 'deadbeef'),
    /read-back/
  );
});

test('main() fails when ONLY the tester manifest reads back stale — every target is verified', async () => {
  // The channel manifest reads back current; only the tester manifest is stale. A partial publish
  // (channel written, tester not established) must NOT report green — so this pins the read-back
  // loop over EVERY target (a `staged.slice(0, 1)` mutation that verifies only the channel passes
  // all other tests but must fail here).
  const harness = await makeMain({
    heads: {
      [CH_MANIFEST]: {
        status: 200,
        body: JSON.stringify({ version: '1.3.0-beta.9' }),
        etag: 'chetag',
      },
    },
    staleReadBack: (key) => key === TE_MANIFEST,
  });
  await assert.rejects(
    harness.run('--version', '1.4.0-beta.1', '--source-sha', 'deadbeef'),
    /tester-closed-beta-2026/
  );
});

test('main() refuses a mixed-build-profile publish and writes NOTHING, naming issue 345', async () => {
  const harness = await makeMain({
    config: {
      ...MAIN_CONFIG,
      channels: {
        beta: {
          testerGroups: ['closed-beta-2026'],
          testerSecretEnv: 'S3_TESTER_PATH_SECRET',
          // A patron tester group under the community channel build — issue 345's failure mode.
          testerBuildProfile: 'patron',
        },
      },
    },
  });

  await assert.rejects(harness.run('--version', '1.4.0-beta.1', '--source-sha', 'deadbeef'), /345/);
  assert.deepEqual(harness.puts, [], 'the tripwire must fire before anything is written');
});

test('main() --backfill-provenance stamps every existing zip via CopyObject, idempotently', async () => {
  const CH_PREFIX = 'modules/fabricate/beta/versions/';
  const TE_PREFIX = 'testers/closed-beta-2026/seg/fabricate/versions/';
  const listing = {
    [CH_PREFIX]: [`${CH_PREFIX}1.4.0/fabricate-1.4.0.zip`, `${CH_PREFIX}1.4.1/fabricate-1.4.1.zip`],
    [TE_PREFIX]: [],
  };
  // 1.4.0 maps to a tag; 1.4.1 maps to none → stamped `unknown`.
  const resolveSha = async (version) => (version === '1.4.0' ? 'shaA' : null);
  const harness = await makeMain({ listing, resolveSha });

  const result = await harness.run('--backfill-provenance');

  assert.equal(harness.copies.length, 2);
  for (const copy of harness.copies) {
    assert.equal(copy.contentType, 'application/zip');
    assert.equal(copy.cacheControl, CACHE_IMMUTABLE);
  }
  const stamped140 = harness.copies.find((c) => c.sourceKey.includes('1.4.0'));
  const stamped141 = harness.copies.find((c) => c.sourceKey.includes('1.4.1'));
  assert.equal(stamped140.metadata['fabricate-source-sha'], 'shaA');
  assert.equal(stamped141.metadata['fabricate-source-sha'], 'unknown');
  assert.equal(result.stamped.length, 2);

  // Idempotent: a second run issues the SAME copies.
  const first = harness.copies.map((c) => c.destKey).sort();
  await harness.run('--backfill-provenance');
  assert.equal(harness.copies.length, 4);
  assert.deepEqual([...new Set(harness.copies.map((c) => c.destKey))].sort(), first);
});

test('main() --backfill-provenance --dry-run writes NOTHING but reports what it would stamp', async () => {
  const CH_PREFIX = 'modules/fabricate/beta/versions/';
  const TE_PREFIX = 'testers/closed-beta-2026/seg/fabricate/versions/';
  const listing = {
    [CH_PREFIX]: [`${CH_PREFIX}1.4.0/fabricate-1.4.0.zip`, `${CH_PREFIX}1.4.1/fabricate-1.4.1.zip`],
    [TE_PREFIX]: [],
  };
  const harness = await makeMain({ listing, resolveSha: async () => 'shaA' });

  const result = await harness.run('--backfill-provenance', '--dry-run');

  // No CopyObject is issued — the maintainer previews before mutating immutable artefacts…
  assert.equal(harness.copies.length, 0);
  // …but the plan is reported: every zip that WOULD be stamped, marked dry-run.
  assert.equal(result.stamped.length, 2);
  assert.ok(result.stamped.every((s) => s.dryRun === true));
});

test('a zip backfilled with an "unknown" sha is treated by the guard as absent (fails closed)', async () => {
  // The metadata a backfill stamps where no tag maps.
  const body = { id: 'fabricate', version: '1.4.0' };
  const backfilled = provenanceMetadata('1.4.0', 'unknown', 'community');
  const verdict = safety({
    staged: [{ target: CH, body }],
    state: [
      rec({
        target: CH,
        head: '1.4.0',
        body: JSON.stringify(body, null, 2),
        zip: zipHead(backfilled),
      }),
    ],
  });
  assert.equal(verdict.ok, false);
});
