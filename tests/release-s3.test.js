import test from 'node:test';
import assert from 'node:assert/strict';

const { deriveS3Layout, getFlag, redactSegment } = await import('../scripts/release-s3.js');

// ───────────────────────────────────────────────────────────────────────────
// deriveS3Layout() tests
// ───────────────────────────────────────────────────────────────────────────

const baseOpts = {
  moduleId: 'fabricate',
  channel: 'beta',
  version: '0.2.0-rc.1',
  baseUrl: 'https://releases.example.io',
  testerGroups: ['closed-beta-2026']
};

test('deriveS3Layout channel target is the canonical source feed', () => {
  const { channelTarget } = deriveS3Layout(baseOpts);
  assert.equal(channelTarget.kind, 'channel');
  assert.equal(channelTarget.group, null);
  assert.equal(channelTarget.zipKey, 'modules/fabricate/beta/versions/0.2.0-rc.1/fabricate-0.2.0-rc.1.zip');
  assert.equal(channelTarget.manifestKey, 'modules/fabricate/beta/latest/module.json');
  assert.equal(channelTarget.manifestUrl, 'https://releases.example.io/modules/fabricate/beta/latest/module.json');
  assert.equal(channelTarget.downloadUrl, 'https://releases.example.io/modules/fabricate/beta/versions/0.2.0-rc.1/fabricate-0.2.0-rc.1.zip');
});

test('deriveS3Layout emits one tester target per access group', () => {
  const { testerTargets } = deriveS3Layout({ ...baseOpts, testerGroups: ['closed-beta-2026', 'press'] });
  assert.equal(testerTargets.length, 2);
  assert.deepEqual(testerTargets.map((t) => t.group), ['closed-beta-2026', 'press']);
  assert.ok(testerTargets.every((t) => t.kind === 'tester'));
});

test('deriveS3Layout tester target is a self-contained per-cohort feed', () => {
  const { testerTargets } = deriveS3Layout(baseOpts);
  const t = testerTargets[0];
  assert.equal(t.zipKey, 'testers/closed-beta-2026/fabricate/versions/0.2.0-rc.1/fabricate-0.2.0-rc.1.zip');
  assert.equal(t.manifestKey, 'testers/closed-beta-2026/fabricate/module.json');
  assert.equal(t.manifestUrl, 'https://releases.example.io/testers/closed-beta-2026/fabricate/module.json');
  // The cohort feed downloads its OWN zip — the baked manifest URL is the cohort URL.
  assert.equal(t.downloadUrl, 'https://releases.example.io/testers/closed-beta-2026/fabricate/versions/0.2.0-rc.1/fabricate-0.2.0-rc.1.zip');
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
  const { channelTarget, testerTargets } = deriveS3Layout({ ...baseOpts, baseUrl: 'https://releases.example.io///' });
  assert.equal(channelTarget.manifestUrl, 'https://releases.example.io/modules/fabricate/beta/latest/module.json');
  assert.equal(testerTargets[0].manifestUrl, 'https://releases.example.io/testers/closed-beta-2026/fabricate/module.json');
});

test('deriveS3Layout defaults to no tester targets', () => {
  const layout = deriveS3Layout({ moduleId: 'fabricate', channel: 'beta', version: '0.2.0-rc.1', baseUrl: 'https://x.io' });
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
  assert.equal(channelTarget.zipKey, 'modules/fabricate/rc/versions/0.2.0-rc.1/fabricate-0.2.0-rc.1.zip');
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
  assert.equal(t.zipKey, 'testers/closed-beta-2026/s3cr3t/fabricate/versions/0.2.0-rc.1/fabricate-0.2.0-rc.1.zip');
  assert.equal(t.manifestKey, 'testers/closed-beta-2026/s3cr3t/fabricate/module.json');
  assert.equal(t.manifestUrl, 'https://releases.example.io/testers/closed-beta-2026/s3cr3t/fabricate/module.json');
  assert.equal(t.downloadUrl, 'https://releases.example.io/testers/closed-beta-2026/s3cr3t/fabricate/versions/0.2.0-rc.1/fabricate-0.2.0-rc.1.zip');
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
  assert.equal(testerTargets[0].manifestKey, 'testers/closed-beta-2026/s3cr3t/fabricate/module.json');
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
