import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const { assertPublishSafety, fetchPublishState } = await import('../scripts/lib/publishGuard.js');
const { zipDirectory } = await import('../scripts/lib/zip.js');
const { ARCHIVE_CHUNK_GATE_LABEL, assertArchiveChunkCompleteness } = await import(
  '../scripts/lib/releaseZipChunks.js'
);
// The comparator the guard's remedy is measured against — the same one that decides the refusal.
const { foundryIsNewerVersion } = await import('../scripts/lib/semver.js');
const { main, resolveChannelConfig, runCheckHeads, deriveS3Layout, s3StatusFromError } =
  await import('../scripts/release-s3.js');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// The config the tests publish against — the same SHAPE as the shipped release.s3.config.json
// (which gets its own contract test at the bottom of this file).
const CONFIG = {
  moduleId: 'fabricate',
  bucket: 'test-bucket',
  baseUrl: 'https://releases.example.io',
  channel: 'beta',
  testerGroups: ['closed-beta-2026'],
  channels: {
    beta: { testerGroups: ['closed-beta-2026'], testerSecretEnv: 'S3_TESTER_PATH_SECRET' },
    'early-access': {
      testerGroups: ['guild-artisan-2026'],
      testerSecretEnv: 'S3_GUILD_ARTISAN_PATH_SECRET',
    },
    public: { testerGroups: [] },
  },
};

const BETA_CHANNEL_MANIFEST = 'modules/fabricate/beta/latest/module.json';
const BETA_TESTER_MANIFEST = 'testers/closed-beta-2026/seg/fabricate/module.json';

// 1.3 — resolveChannelConfig: a channel's cohorts and secret belong to THAT channel

test('resolveChannelConfig gives early-access its OWN cohort and secret, never the closed beta', () => {
  const resolved = resolveChannelConfig(CONFIG, 'early-access');
  assert.deepEqual(resolved.testerGroups, ['guild-artisan-2026']);
  assert.ok(!resolved.testerGroups.includes('closed-beta-2026'));
  assert.equal(resolved.testerSecretEnv, 'S3_GUILD_ARTISAN_PATH_SECRET');
  assert.equal(resolved.source, 'declared');
});

test('resolveChannelConfig gives public no tester group at all', () => {
  const resolved = resolveChannelConfig(CONFIG, 'public');
  assert.deepEqual(resolved.testerGroups, []);
  assert.equal(resolved.testerSecretEnv, null);
});

test('resolveChannelConfig inherits NOTHING for an undeclared channel (a hotfix line)', () => {
  const resolved = resolveChannelConfig(CONFIG, '1.4.x');
  assert.equal(resolved.source, 'undeclared');
  assert.deepEqual(resolved.testerGroups, []);
  assert.equal(resolved.testerSecretEnv, null);
});

test('resolveChannelConfig prefers a declared channels entry over the scalar default', () => {
  // The scalar `testerGroups` names a DIFFERENT cohort from `channels.beta`. The map must win, or
  // the map is not the source of truth it claims to be.
  const config = { ...CONFIG, testerGroups: ['stale-scalar-cohort'] };
  const resolved = resolveChannelConfig(config, 'beta');
  assert.equal(resolved.source, 'declared');
  assert.deepEqual(resolved.testerGroups, ['closed-beta-2026']);
});

test('resolveChannelConfig falls back to the scalar default when no channels map is declared', () => {
  const legacy = { moduleId: 'fabricate', channel: 'beta', testerGroups: ['closed-beta-2026'] };
  const resolved = resolveChannelConfig(legacy, 'beta');
  assert.equal(resolved.source, 'default');
  assert.deepEqual(resolved.testerGroups, ['closed-beta-2026']);
  assert.equal(resolved.testerSecretEnv, 'S3_TESTER_PATH_SECRET');
  // …and only for the channel it names.
  assert.equal(resolveChannelConfig(legacy, 'early-access').source, 'undeclared');
});

// 1.4 — the pure guard

const target = (label, manifestKey) => ({ label, manifestKey });
const CHANNEL = target('channel-beta', BETA_CHANNEL_MANIFEST);
const TESTER = target('tester-closed-beta-2026', BETA_TESTER_MANIFEST);

const head = (t, value) => ({
  label: t.label,
  manifestKey: t.manifestKey,
  present: value !== null,
  head: value,
});

const safetyOf = ({ version, state, allowDowngrade = false, staged = [CHANNEL, TESTER] }) =>
  assertPublishSafety({
    version,
    staged: staged.map((t) => ({ target: t })),
    state,
    allowDowngrade,
  });

/** Read back the version the refusal advises the operator to publish instead. */
const remedyOf = (error) => /MINOR bump \(e\.g\. ([^)]+)\)/.exec(error)?.[1] ?? null;

test('assertPublishSafety allows a target that has no head yet', () => {
  const verdict = safetyOf({
    version: '1.4.0-beta.1',
    state: [head(CHANNEL, null), head(TESTER, null)],
  });
  assert.equal(verdict.ok, true);
  assert.deepEqual(
    verdict.decisions.map((d) => d.decision),
    ['allow-no-head', 'allow-no-head']
  );
});

test('assertPublishSafety branches on the ABSENT head before it reaches the comparator', () => {
  // A poisoned record: absent, but carrying a version that WOULD refuse if it were compared. The
  // only way this allows is if `present: false` is branched on before any comparison happens.
  const poisoned = {
    label: TESTER.label,
    manifestKey: TESTER.manifestKey,
    present: false,
    head: '9.9.9',
  };
  const verdict = safetyOf({
    version: '1.4.0-beta.1',
    state: [head(CHANNEL, null), poisoned],
    staged: [TESTER],
  });
  assert.equal(verdict.ok, true);
  assert.equal(verdict.decisions[0].decision, 'allow-no-head');
  assert.equal(verdict.warnings.length, 0);
});

test('assertPublishSafety allows an older or equal head', () => {
  const older = safetyOf({
    version: '1.4.0-beta.2',
    state: [head(CHANNEL, '1.4.0-beta.1'), head(TESTER, '1.3.0')],
  });
  assert.equal(older.ok, true);

  const equal = safetyOf({
    version: '1.4.0-beta.1',
    state: [head(CHANNEL, '1.4.0-beta.1'), head(TESTER, '1.4.0-beta.1')],
  });
  assert.equal(equal.ok, true);
  assert.ok(equal.decisions.every((d) => d.decision === 'allow'));
});

test('assertPublishSafety refuses a Foundry-newer head, names the target, and names the remedy', () => {
  const verdict = safetyOf({
    version: '1.4.0-beta.1',
    state: [head(CHANNEL, '1.4.0-beta.1'), head(TESTER, '1.5.0-beta.1')],
  });
  assert.equal(verdict.ok, false);
  const refused = verdict.decisions.find((d) => d.decision === 'refuse');
  assert.equal(refused.label, 'tester-closed-beta-2026');
  assert.match(verdict.error, /tester-closed-beta-2026/);
  assert.match(verdict.error, /1\.5\.0-beta\.1/);
  // The remedy is a forced MINOR bump — never the downgrade override — it stays on the prerelease
  // line it is rescuing, and it is measured from the HEAD (1.5.0-beta.1), so it must land ABOVE it:
  // suggesting 1.5.0-beta.1 would be suggesting the head itself, which publishes as a no-op.
  assert.match(verdict.error, /MINOR bump \(e\.g\. 1\.6\.0-beta\.1\)/);
  assert.ok(foundryIsNewerVersion(remedyOf(verdict.error), '1.5.0-beta.1'));
  assert.match(verdict.error, /Do NOT reach for --allow-downgrade/);
});

test('assertPublishSafety allows a backwards move only under --allow-downgrade', () => {
  const verdict = safetyOf({
    version: '1.4.0-beta.1',
    state: [head(CHANNEL, '1.5.0-beta.1'), head(TESTER, '1.5.0-beta.1')],
    allowDowngrade: true,
  });
  assert.equal(verdict.ok, true);
  assert.ok(verdict.decisions.every((d) => d.decision === 'allow-downgrade'));
});

test('assertPublishSafety fails closed when a rollover glued to the prerelease suffix orders backwards', () => {
  // NOT "a double-digit patch rollover" — a double-digit rollover in the part GLUED TO THE
  // PRERELEASE SUFFIX, which is the only part compared as text.
  const verdict = safetyOf({
    version: '1.4.10-beta.1',
    state: [head(CHANNEL, '1.4.9-beta.3'), head(TESTER, '1.4.9-beta.3')],
  });
  assert.equal(verdict.ok, false);
  assert.match(verdict.error, /1\.4\.9-beta\.3/);

  // The remedy is pinned HERE, on the input where it is counter-intuitive.
  assert.match(verdict.error, /MINOR bump \(e\.g\. 1\.5\.0-beta\.1\)/);
  assert.doesNotMatch(verdict.error, /e\.g\. 1\.5\.0\)/);
});

test('assertPublishSafety derives the remedy from the HEAD, not from the version being published', () => {
  // 1.4.1 refused by a 1.5.0 head.
  const verdict = safetyOf({
    version: '1.4.1',
    state: [head(CHANNEL, '1.5.0')],
    staged: [CHANNEL],
  });
  assert.equal(verdict.ok, false);
  assert.match(verdict.error, /MINOR bump \(e\.g\. 1\.6\.0\)/);
  assert.doesNotMatch(verdict.error, /e\.g\. 1\.5\.0\)/);
});

test('assertPublishSafety suggests one remedy that clears EVERY refused head', () => {
  // Two targets, two different heads. The suggestion has to clear both, not just the first.
  const verdict = safetyOf({
    version: '1.4.0-beta.1',
    state: [head(CHANNEL, '1.4.9-beta.3'), head(TESTER, '1.6.0')],
  });
  assert.equal(verdict.ok, false);
  const remedy = remedyOf(verdict.error);
  assert.equal(remedy, '1.7.0-beta.1');
  assert.ok(foundryIsNewerVersion(remedy, '1.4.9-beta.3'));
  assert.ok(foundryIsNewerVersion(remedy, '1.6.0'));
});

test('every remedy the guard prints is one Foundry would actually accept over the head', () => {
  // THE PROPERTY, not a string. The refusal promises the remedy "is the only change that makes
  // Foundry compare the new build as newer" — so assert exactly that, over a corpus, and no future
  // edit to suggestMinorBump can quietly make the sentence false again.
  const corpus = [
    '1.4.0',
    '1.4.1',
    '1.4.9',
    '1.4.10',
    '1.5.0',
    '1.5.1',
    '1.9.0',
    '1.10.0',
    '2.0.0',
    '2.1.0',
    '1.4.0-beta.1',
    '1.4.9-beta.1',
    '1.4.9-beta.3',
    '1.4.10-beta.1',
    '1.5.0-beta.1',
    '1.5.0-beta.7',
    '1.5.0-beta.10',
    '1.10.0-beta.1',
    '2.0.0-beta.1',
    '1.5.1-rc.2',
  ];

  let refused = 0;
  let cleared = 0;
  for (const version of corpus) {
    for (const current of corpus) {
      const verdict = safetyOf({ version, state: [head(CHANNEL, current)], staged: [CHANNEL] });
      if (verdict.ok) continue;
      refused += 1;

      const remedy = remedyOf(verdict.error);
      assert.ok(remedy, `no remedy named for ${version} over head ${current}`);
      // The remedy must CLEAR the head — not equal it (which the guard would allow as a no-op that
      // never advances the head) and not fall under it (which it would refuse all over again).
      assert.notEqual(remedy, current, `remedy for ${version} over head ${current} IS the head`);
      assert.ok(
        foundryIsNewerVersion(remedy, current),
        `remedy ${remedy} does not clear head ${current} (publishing ${version})`
      );
      // And it must stay on the line it is rescuing: a prerelease version never gets a bare stable
      // remedy, which would strand a private channel at a stable head.
      assert.equal(
        remedy.includes('-'),
        version.includes('-'),
        `remedy ${remedy} switched line from ${version}`
      );
      cleared += 1;
    }
  }

  assert.equal(cleared, refused);
  assert.ok(refused > 100, `the corpus must actually exercise refusals (got ${refused})`);
});

test('assertPublishSafety records a comparator disagreement WITHOUT changing the verdict', () => {
  // SemVer says 1.5.0 supersedes 1.5.0-beta.7. Foundry says the opposite — and Foundry ships.
  const refused = safetyOf({
    version: '1.5.0',
    state: [head(CHANNEL, '1.5.0-beta.7')],
    staged: [CHANNEL],
  });
  assert.equal(refused.ok, false, 'Foundry refuses even though SemVer would allow');
  assert.equal(refused.warnings.length, 1);
  assert.match(refused.warnings[0], /Foundry and SemVer disagree/);

  // …and the same disagreement in the other direction does not turn an allow into a refusal.
  const allowed = safetyOf({
    version: '1.5.0-beta.7',
    state: [head(CHANNEL, '1.5.0')],
    staged: [CHANNEL],
  });
  assert.equal(allowed.ok, true);
  assert.equal(allowed.warnings.length, 1);
  assert.equal(allowed.decisions[0].decision, 'allow');
});

test('assertPublishSafety fails closed when a staged target has no head record at all', () => {
  const verdict = safetyOf({ version: '1.4.0-beta.1', state: [head(CHANNEL, null)] });
  assert.equal(verdict.ok, false);
  assert.match(verdict.error, /no head was read for tester-closed-beta-2026/);
});

// 1.4 — fetchPublishState: 404 is absent, 403 is a hard error

const reader = (responses) => ({
  getObject: async (key) => responses[key] ?? { status: 404, body: null },
});

test('fetchPublishState reads the head of EVERY target', async () => {
  const state = await fetchPublishState(
    [CHANNEL, TESTER],
    reader({
      [BETA_CHANNEL_MANIFEST]: { status: 200, body: JSON.stringify({ version: '1.4.0-beta.1' }) },
      [BETA_TESTER_MANIFEST]: { status: 200, body: JSON.stringify({ version: '1.4.0-beta.1' }) },
    })
  );
  assert.deepEqual(
    state.map((record) => [record.label, record.present, record.head]),
    [
      ['channel-beta', true, '1.4.0-beta.1'],
      ['tester-closed-beta-2026', true, '1.4.0-beta.1'],
    ]
  );
});

test('fetchPublishState treats a 404 as an absent head', async () => {
  const [record] = await fetchPublishState([CHANNEL], reader({}));
  assert.equal(record.present, false);
  assert.equal(record.head, null);
});

test('fetchPublishState treats a 403 as a HARD ERROR, never an absent head', async () => {
  // Without s3:ListBucket, S3 answers a MISSING key with 403 — so mapping 403 to "absent" would
  // fail OPEN on the first publish of every new channel.
  await assert.rejects(
    fetchPublishState([CHANNEL], reader({ [BETA_CHANNEL_MANIFEST]: { status: 403, body: null } })),
    /HTTP 403[\S\s]*s3:ListBucket/
  );
});

// The one production step no injected S3 port can reach: turning an AWS error into 403-vs-404.
test('s3StatusFromError keeps a denial a denial and a miss a miss', () => {
  assert.equal(s3StatusFromError({ $metadata: { httpStatusCode: 403 } }), 403);
  assert.equal(s3StatusFromError({ name: 'AccessDenied' }), 403);
  assert.equal(s3StatusFromError({ name: 'Forbidden' }), 403);
  assert.equal(s3StatusFromError({ $metadata: { httpStatusCode: 404 } }), 404);
  assert.equal(s3StatusFromError({ name: 'NoSuchKey' }), 404);
  assert.equal(s3StatusFromError({ name: 'NotFound' }), 404);
  // The status on the error WINS over the name — deleting that read must not silently degrade.
  assert.equal(s3StatusFromError({ name: 'NoSuchKey', $metadata: { httpStatusCode: 403 } }), 403);
  // Neither: the reader must rethrow rather than invent a status, because a fabricated 404 is an
  // absent head, and an absent head skips the guard.
  assert.equal(s3StatusFromError(new Error('socket hang up')), null);
  assert.equal(s3StatusFromError(undefined), null);
});

test('fetchPublishState refuses a head manifest it cannot read', async () => {
  await assert.rejects(
    fetchPublishState(
      [CHANNEL],
      reader({ [BETA_CHANNEL_MANIFEST]: { status: 200, body: 'not json' } })
    ),
    /not valid JSON/
  );
  await assert.rejects(
    fetchPublishState([CHANNEL], reader({ [BETA_CHANNEL_MANIFEST]: { status: 200, body: '{}' } })),
    /advertises no version/
  );
});

// 1.4 — the headline: main() writes NOTHING when a head is Foundry-newer

/**
 * A `main()` harness with every world-touching collaborator injected: no Vite build, no zip binary,
 * no AWS (issue 1565).
 *
 * @param {{heads?: Record<string, {status: number, body: string|null}>, exists?: (key: string) =>
 * boolean, distFiles?: Record<string, string>, realArchiveGate?: boolean}} options
 * @returns {Promise<object>} The harness.
 */
async function makeHarness({
  heads = {},
  exists = () => false,
  distFiles = {},
  realArchiveGate = false,
} = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'fabricate-release-s3-'));
  const distDir = join(dir, 'dist');
  await mkdir(distDir, { recursive: true });
  for (const [name, contents] of Object.entries(distFiles)) {
    await writeFile(join(distDir, name), contents);
  }
  const configPath = join(dir, 'release.s3.config.json');
  await writeFile(configPath, JSON.stringify(CONFIG));

  const puts = [];
  const gets = [];
  // A tiny stateful S3: manifest writes are reflected so the post-publish read-back sees the
  // version just published (a static getObject would read back the pre-publish head and fail).
  const store = {};
  const calls = { build: 0, zip: 0 };
  // Patched by runWithBuild, so a test can hand main() a manifest the build should have refused.
  let manifestPatch = {};

  const deps = {
    log: () => {},
    stagingDir: join(dir, 'staging'),
    build: async ({ version }) => {
      calls.build += 1;
      return {
        distDir,
        manifest: {
          id: 'fabricate',
          title: 'Fabricate',
          version,
          compatibility: { minimum: '13' },
          ...manifestPatch,
        },
      };
    },
    zip: (from, to) => {
      calls.zip += 1;
      if (realArchiveGate) zipDirectory(from, to);
      else writeFileSync(to, 'zip-bytes');
    },
    assertArchiveChunks: realArchiveGate ? assertArchiveChunkCompleteness : () => {},
    createS3Client: async () => ({
      headObject: async (key) => exists(key),
      getObject: async (key) => {
        gets.push(key);
        if (key in store) return { status: 200, body: store[key], etag: `etag-${key}` };
        return heads[key] ?? { status: 404, body: null };
      },
      putObject: async ({ key, body }) => {
        if (typeof body === 'string') store[key] = body;
        puts.push(key);
      },
    }),
  };

  const run = (...flags) =>
    main({
      argv: ['node', 'release-s3.js', '--config', configPath, ...flags],
      env: { S3_TESTER_PATH_SECRET: 'seg' },
      deps,
    });

  /** Run with the built manifest patched — e.g. a field the build left empty. */
  const runWithBuild = (patch, ...flags) => {
    manifestPatch = patch;
    return run(...flags);
  };

  return { run, runWithBuild, puts, gets, calls, configPath };
}

// Issue 1565, in the file that owns the "ZERO PutObject" invariant.
test('main() performs ZERO PutObject calls when a staged archive is short a referenced chunk', async () => {
  const missingChunk = 'chunks/absent-DEADBEEF.js';
  const harness = await makeHarness({
    realArchiveGate: true,
    distFiles: { 'main.js': `import "./${missingChunk}";\n` },
  });

  await assert.rejects(
    harness.runWithBuild({ esmodules: ['main.js'] }, '--version', '1.4.0', '--source-sha', 'sha1'),
    (error) => {
      assert.ok(
        error.message.includes(ARCHIVE_CHUNK_GATE_LABEL),
        `must be the archive gate's refusal; got: ${error.message}`
      );
      assert.ok(
        error.message.includes(missingChunk),
        `must name the missing member; got: ${error.message}`
      );
      return true;
    }
  );

  assert.equal(harness.calls.zip, 1, 'staging must have produced an archive to gate');
  assert.deepEqual(harness.puts, [], 'nothing may be written when the archive is incomplete');
});

const manifestAt = (version) => ({ status: 200, body: JSON.stringify({ version }) });

test('main() performs ZERO PutObject calls when a target head is Foundry-newer', async () => {
  const harness = await makeHarness({
    heads: {
      [BETA_CHANNEL_MANIFEST]: manifestAt('1.4.0-beta.1'),
      // The tester feed is AHEAD of the build being published: publishing would move it backwards.
      [BETA_TESTER_MANIFEST]: manifestAt('1.5.0-beta.1'),
    },
  });

  await assert.rejects(
    harness.run('--version', '1.4.0-beta.1'),
    /already advertises 1\.5\.0-beta\.1/
  );

  assert.deepEqual(harness.puts, [], 'the guard must run BEFORE any object is written');
  // …and it got there the long way: the build ran, both targets were staged, and both heads were
  // read per TARGET. A guard that never executed would also have written nothing.
  assert.equal(harness.calls.build, 1);
  assert.equal(harness.calls.zip, 2);
  assert.deepEqual(harness.gets, [BETA_CHANNEL_MANIFEST, BETA_TESTER_MANIFEST]);
});

test('main() performs ZERO PutObject calls when a head read is denied (403)', async () => {
  const harness = await makeHarness({
    heads: { [BETA_TESTER_MANIFEST]: { status: 403, body: null } },
  });
  await assert.rejects(harness.run('--version', '1.4.0-beta.1'), /HTTP 403/);
  assert.deepEqual(harness.puts, []);
});

test('main() publishes every target when no head is newer', async () => {
  const harness = await makeHarness({
    heads: { [BETA_CHANNEL_MANIFEST]: manifestAt('1.3.0-beta.9') },
  });

  const result = await harness.run('--version', '1.4.0-beta.1');

  assert.equal(result.safety.ok, true);
  assert.deepEqual(harness.puts, [
    'modules/fabricate/beta/versions/1.4.0-beta.1/fabricate-1.4.0-beta.1.zip',
    BETA_CHANNEL_MANIFEST,
    'testers/closed-beta-2026/seg/fabricate/versions/1.4.0-beta.1/fabricate-1.4.0-beta.1.zip',
    BETA_TESTER_MANIFEST,
  ]);
});

test('main() publishes over a newer head only under --allow-downgrade', async () => {
  const harness = await makeHarness({
    heads: {
      [BETA_CHANNEL_MANIFEST]: manifestAt('1.5.0-beta.1'),
      [BETA_TESTER_MANIFEST]: manifestAt('1.5.0-beta.1'),
    },
  });

  const result = await harness.run('--version', '1.4.0-beta.1', '--allow-downgrade');

  assert.equal(result.safety.ok, true);
  assert.equal(harness.puts.length, 4);
});

test('main() --dry-run touches no bucket at all: no reads, no writes', async () => {
  // The guard and the upload loop currently share one `if (!dryRun)` block.
  const harness = await makeHarness({
    heads: { [BETA_CHANNEL_MANIFEST]: manifestAt('1.5.0-beta.1') },
  });

  const result = await harness.run('--version', '1.4.0-beta.1', '--dry-run');

  assert.deepEqual(harness.puts, []);
  assert.deepEqual(harness.gets, []);
  assert.equal(result.safety, null);
  // …and it really did the work: it did not pass by failing early.
  assert.equal(harness.calls.build, 1);
  assert.equal(harness.calls.zip, 2);
});

test('main() refuses a built manifest whose required field is absent OR empty', async () => {
  // The empty-string arm is the one that matters: a `title: ''` is a well-formed JSON manifest that
  // Foundry will happily install and display as nameless.
  for (const broken of [{ title: '' }, { compatibility: '' }, { version: undefined }]) {
    const harness = await makeHarness();
    await assert.rejects(
      harness.runWithBuild(broken, '--version', '1.4.0-beta.1'),
      /missing required field/
    );
    assert.deepEqual(harness.puts, []);
  }
});

test('main() --check-heads reads the heads and BUILDS NOTHING', async () => {
  const harness = await makeHarness({
    heads: { [BETA_CHANNEL_MANIFEST]: manifestAt('1.3.0-beta.9') },
  });

  const report = await harness.run('--version', '1.4.0-beta.1', '--check-heads');

  assert.equal(harness.calls.build, 0, '--check-heads must never build');
  assert.equal(harness.calls.zip, 0);
  assert.deepEqual(harness.puts, []);
  assert.equal(report.safety.ok, true);
  assert.deepEqual(harness.gets, [BETA_CHANNEL_MANIFEST, BETA_TESTER_MANIFEST]);
  assert.deepEqual(
    report.heads.map((record) => [record.label, record.head]),
    [
      ['channel-beta', '1.3.0-beta.9'],
      ['tester-closed-beta-2026', null],
    ]
  );
});

test('main() --check-heads fails when the guard would refuse', async () => {
  const harness = await makeHarness({
    heads: { [BETA_CHANNEL_MANIFEST]: manifestAt('1.5.0-beta.1') },
  });
  await assert.rejects(
    harness.run('--version', '1.4.0-beta.1', '--check-heads'),
    /already advertises/
  );
});

test('main() refuses to publish a channel whose tester secret is unset', async () => {
  const harness = await makeHarness();
  await assert.rejects(
    main({
      argv: [
        'node',
        'release-s3.js',
        '--config',
        harness.configPath,
        '--version',
        '1.4.0',
        '--channel',
        'early-access',
      ],
      // The BETA secret is set; early-access's own secret is not. It must refuse rather than reuse
      // the beta path.
      env: { S3_TESTER_PATH_SECRET: 'seg' },
      deps: { log: () => {} },
    }),
    /S3_GUILD_ARTISAN_PATH_SECRET is unset/
  );
  assert.deepEqual(harness.puts, []);
});

test('main() refuses a channel that declares tester groups but no testerSecretEnv', async () => {
  // The other arm of the same refusal — a plausible mistake when adding a second cohort.
  const dir = await mkdtemp(join(tmpdir(), 'fabricate-release-s3-'));
  const configPath = join(dir, 'release.s3.config.json');
  await writeFile(
    configPath,
    JSON.stringify({
      ...CONFIG,
      channels: { ...CONFIG.channels, 'early-access': { testerGroups: ['patrons-2027'] } },
    })
  );

  await assert.rejects(
    main({
      argv: [
        'node',
        'release-s3.js',
        '--config',
        configPath,
        '--version',
        '1.5.0',
        '--channel',
        'early-access',
      ],
      env: { S3_TESTER_PATH_SECRET: 'seg', S3_GUILD_ARTISAN_PATH_SECRET: 'ea-seg' },
      deps: { log: () => {} },
    }),
    /declares no "testerSecretEnv"/
  );
});

test('runCheckHeads reads every private target of the channel it is asked about', async () => {
  const gets = [];
  const report = await runCheckHeads({
    config: CONFIG,
    version: '1.5.0',
    channel: 'early-access',
    deps: {
      env: { S3_GUILD_ARTISAN_PATH_SECRET: 'ea-seg' },
      createS3Client: async () => ({
        getObject: async (key) => {
          gets.push(key);
          return { status: 404, body: null };
        },
      }),
    },
  });

  assert.deepEqual(gets, [
    'modules/fabricate/early-access/latest/module.json',
    'testers/guild-artisan-2026/ea-seg/fabricate/module.json',
  ]);
  assert.equal(report.safety.ok, true);
});

// 1.2 — the shipped release.s3.config.json

test('the shipped config declares the three channels, each with its own cohort and secret', async () => {
  const shipped = JSON.parse(await readFile(join(ROOT, 'release.s3.config.json'), 'utf8'));

  assert.deepEqual(resolveChannelConfig(shipped, 'beta'), {
    channel: 'beta',
    testerGroups: ['closed-beta-2026'],
    testerSecretEnv: 'S3_TESTER_PATH_SECRET',
    source: 'declared',
  });
  assert.deepEqual(resolveChannelConfig(shipped, 'early-access'), {
    channel: 'early-access',
    testerGroups: ['guild-artisan-2026'],
    testerSecretEnv: 'S3_GUILD_ARTISAN_PATH_SECRET',
    source: 'declared',
  });
  assert.deepEqual(resolveChannelConfig(shipped, 'public').testerGroups, []);

  // The scalar defaults stay, and stay in agreement with the map.
  assert.equal(shipped.channel, 'beta');
  assert.deepEqual(shipped.testerGroups, ['closed-beta-2026']);
});

test('the shipped config names no superseded tester group and no superseded secret', async () => {
  // Every OTHER assertion in this file runs against the synthetic local CONFIG, so all of them stay
  // green if the shipped file is never touched.
  const shipped = JSON.parse(await readFile(join(ROOT, 'release.s3.config.json'), 'utf8'));
  const channels = Object.values(shipped.channels);

  const groups = [...(shipped.testerGroups ?? []), ...channels.flatMap((c) => c.testerGroups ?? [])];
  const secrets = channels.map((c) => c.testerSecretEnv).filter(Boolean);
  // Non-vacuity: a config that declared no group and no secret would satisfy every sweep below.
  assert.ok(groups.length > 0 && secrets.length > 0, 'the shipped config declares no tester feed');

  assert.ok(
    !groups.includes('patrons-2026'),
    'the early-access cohort was renamed to the tier the premium repository already publishes ' +
      'under; a surviving patrons-2026 declaration splits that one cohort across two prefixes'
  );
  for (const name of secrets) {
    assert.doesNotMatch(
      name,
      /EARLY_ACCESS/,
      `${name} is named after a CHANNEL; a tester path secret is named after the tester GROUP it ` +
        'serves, under the same name in every repository publishing into that group'
    );
  }
});

test('every channel in the shipped config declares at most ONE tester group', async () => {
  // release-s3.js resolves ONE segment per channel and applies it to every group in the array, so a
  // second entry would silently share the first's segment.
  const shipped = JSON.parse(await readFile(join(ROOT, 'release.s3.config.json'), 'utf8'));

  let withGroups = 0;
  for (const [channel, config] of Object.entries(shipped.channels)) {
    const declared = config.testerGroups ?? [];
    assert.ok(
      declared.length <= 1,
      `channel "${channel}" declares ${declared.length} tester groups (${declared.join(', ')}); ` +
        'they would share one segment, so give each its own channel or accept the shared prefix here'
    );
    if (declared.length === 1) {
      withGroups += 1;
      assert.ok(config.testerSecretEnv, `channel "${channel}" declares a group but no secret`);
    }
  }
  assert.equal(withGroups, 2, 'beta and early-access are the two channels with a tester cohort');
});

test('early-access derives its tester feed from the guild-artisan group, never the old one', async () => {
  const shipped = JSON.parse(await readFile(join(ROOT, 'release.s3.config.json'), 'utf8'));
  const resolved = resolveChannelConfig(shipped, 'early-access');

  const layout = deriveS3Layout({
    moduleId: shipped.moduleId,
    channel: 'early-access',
    version: '1.4.0',
    baseUrl: shipped.baseUrl,
    testerGroups: resolved.testerGroups,
    testerSegment: 'ea-seg',
  });

  assert.deepEqual(
    layout.targets.map((t) => t.manifestKey),
    [
      'modules/fabricate/early-access/latest/module.json',
      'testers/guild-artisan-2026/ea-seg/fabricate/module.json',
    ]
  );
  assert.ok(
    !JSON.stringify(layout.targets).includes('patrons-2026'),
    'a target of the shipped early-access layout still addresses the superseded cohort prefix'
  );
});

test('a hotfix channel is undeclared, so its ONLY target is its own sources feed', async () => {
  const shipped = JSON.parse(await readFile(join(ROOT, 'release.s3.config.json'), 'utf8'));
  const resolved = resolveChannelConfig(shipped, '1.4.x');

  assert.equal(resolved.source, 'undeclared');
  const layout = deriveS3Layout({
    moduleId: shipped.moduleId,
    channel: '1.4.x',
    version: '1.4.1',
    baseUrl: shipped.baseUrl,
    testerGroups: resolved.testerGroups,
  });
  assert.deepEqual(
    layout.targets.map((t) => t.manifestKey),
    ['modules/fabricate/1.4.x/latest/module.json']
  );
});
