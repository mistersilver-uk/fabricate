import test from 'node:test';
import assert from 'node:assert/strict';

const { deriveS3Layout, getFlag } = await import('../scripts/release-s3.js');

// ───────────────────────────────────────────────────────────────────────────
// deriveS3Layout() tests
// ───────────────────────────────────────────────────────────────────────────

const baseOpts = {
  moduleId: 'fabricate',
  channel: 'beta',
  version: '0.2.0-rc.1',
  baseUrl: 'https://releases.mrsilver.io',
  testerGroups: ['closed-beta-2026']
};

test('deriveS3Layout builds the immutable versioned zip key', () => {
  const l = deriveS3Layout(baseOpts);
  assert.equal(l.zipName, 'fabricate-0.2.0-rc.1.zip');
  assert.equal(l.zipKey, 'modules/fabricate/beta/versions/0.2.0-rc.1/fabricate-0.2.0-rc.1.zip');
});

test('deriveS3Layout builds the canonical channel manifest key', () => {
  const l = deriveS3Layout(baseOpts);
  assert.equal(l.channelKey, 'modules/fabricate/beta/latest/module.json');
});

test('deriveS3Layout builds channel manifest + download URLs', () => {
  const l = deriveS3Layout(baseOpts);
  assert.equal(
    l.channelManifestUrl,
    'https://releases.mrsilver.io/modules/fabricate/beta/latest/module.json'
  );
  assert.equal(
    l.channelDownloadUrl,
    'https://releases.mrsilver.io/modules/fabricate/beta/versions/0.2.0-rc.1/fabricate-0.2.0-rc.1.zip'
  );
});

test('deriveS3Layout builds one tester manifest per access group', () => {
  const l = deriveS3Layout({ ...baseOpts, testerGroups: ['closed-beta-2026', 'press'] });
  assert.equal(l.testerManifests.length, 2);
  assert.deepEqual(
    l.testerManifests.map((t) => t.group),
    ['closed-beta-2026', 'press']
  );
});

test('deriveS3Layout tester manifest separates sources from access groups', () => {
  const l = deriveS3Layout(baseOpts);
  const t = l.testerManifests[0];
  assert.equal(t.key, 'testers/closed-beta-2026/fabricate/module.json');
  assert.equal(t.manifestUrl, 'https://releases.mrsilver.io/testers/closed-beta-2026/fabricate/module.json');
  // The download URL stays canonical — all cohorts share the one source zip.
  assert.equal(t.downloadUrl, l.channelDownloadUrl);
});

test('deriveS3Layout strips trailing slashes from baseUrl', () => {
  const l = deriveS3Layout({ ...baseOpts, baseUrl: 'https://releases.mrsilver.io///' });
  assert.equal(
    l.channelManifestUrl,
    'https://releases.mrsilver.io/modules/fabricate/beta/latest/module.json'
  );
  assert.equal(l.testerManifests[0].manifestUrl, 'https://releases.mrsilver.io/testers/closed-beta-2026/fabricate/module.json');
});

test('deriveS3Layout defaults to no tester groups', () => {
  const l = deriveS3Layout({ moduleId: 'fabricate', channel: 'beta', version: '0.2.0-rc.1', baseUrl: 'https://x.io' });
  assert.deepEqual(l.testerManifests, []);
});

test('deriveS3Layout preserves the full RC version string in keys and URLs', () => {
  const l = deriveS3Layout({ ...baseOpts, version: '1.10.0-rc.12' });
  assert.ok(l.zipKey.includes('versions/1.10.0-rc.12/'));
  assert.ok(l.zipName.endsWith('1.10.0-rc.12.zip'));
  assert.ok(l.channelDownloadUrl.endsWith('fabricate-1.10.0-rc.12.zip'));
});

test('deriveS3Layout respects a non-default channel', () => {
  const l = deriveS3Layout({ ...baseOpts, channel: 'rc' });
  assert.equal(l.channelKey, 'modules/fabricate/rc/latest/module.json');
  assert.equal(l.zipKey, 'modules/fabricate/rc/versions/0.2.0-rc.1/fabricate-0.2.0-rc.1.zip');
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
