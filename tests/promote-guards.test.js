import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  assertHotfixMinimumNotRaised,
  evaluateRegistryLeadTarget,
  evaluateTesterConfigDrift,
} from '../scripts/lib/promoteGuards.js';

// ── assertHotfixMinimumNotRaised (Gap 1, §Hotfix isolation) ────────────────────────────────────

test('a release-line promotion is unconstrained — it MAY raise the minimum', () => {
  const verdict = assertHotfixMinimumNotRaised({
    isHotfix: false,
    version: '1.6.0',
    promotedMinimum: '13',
    previousVersion: '1.5.0',
    previousMinimum: '12',
  });
  assert.equal(verdict.ok, true);
});

test('a hotfix that keeps the minimum unchanged passes', () => {
  const verdict = assertHotfixMinimumNotRaised({
    isHotfix: true,
    version: '1.5.1',
    promotedMinimum: '12',
    previousVersion: '1.5.0',
    previousMinimum: '12',
  });
  assert.equal(verdict.ok, true);
  assert.match(verdict.reason, /does not raise/);
});

test('a hotfix that lowers the minimum passes (it strands no one)', () => {
  const verdict = assertHotfixMinimumNotRaised({
    isHotfix: true,
    version: '1.5.1',
    promotedMinimum: '11',
    previousVersion: '1.5.0',
    previousMinimum: '12',
  });
  assert.equal(verdict.ok, true);
});

test('a hotfix that raises the minimum by a whole generation is refused, naming both minimums', () => {
  const verdict = assertHotfixMinimumNotRaised({
    isHotfix: true,
    version: '1.5.1',
    promotedMinimum: '13',
    previousVersion: '1.5.0',
    previousMinimum: '12',
  });
  assert.equal(verdict.ok, false);
  assert.match(verdict.error, /raises the declared minimum/);
  assert.match(verdict.error, /from 12/);
  assert.match(verdict.error, /to 13/);
  assert.match(verdict.error, /Hotfix isolation/);
});

test('a hotfix that raises the minimum to a higher dotted core version is refused', () => {
  const verdict = assertHotfixMinimumNotRaised({
    isHotfix: true,
    version: '1.5.1',
    promotedMinimum: '12.331',
    previousVersion: '1.5.0',
    previousMinimum: '12',
  });
  assert.equal(verdict.ok, false);
  assert.match(verdict.error, /raises the declared minimum/);
});

test('the comparison is Foundry-numeric, not textual — "12" is newer than "5"', () => {
  // A textual comparison would order "12" below "5"; Foundry's comparator (and this guard) does not.
  const verdict = assertHotfixMinimumNotRaised({
    isHotfix: true,
    version: '1.5.1',
    promotedMinimum: '12',
    previousVersion: '1.5.0',
    previousMinimum: '5',
  });
  assert.equal(verdict.ok, false);
});

test('a hotfix whose artefact declares no minimum fails closed (unverifiable)', () => {
  const verdict = assertHotfixMinimumNotRaised({
    isHotfix: true,
    version: '1.5.1',
    promotedMinimum: '',
    previousVersion: '1.5.0',
    previousMinimum: '12',
  });
  assert.equal(verdict.ok, false);
  assert.match(verdict.error, /no compatibility.minimum/);
});

test('a hotfix whose current public release declares no readable minimum fails closed', () => {
  const verdict = assertHotfixMinimumNotRaised({
    isHotfix: true,
    version: '1.5.1',
    promotedMinimum: '12',
    previousVersion: '1.5.0',
    previousMinimum: undefined,
  });
  assert.equal(verdict.ok, false);
  assert.match(verdict.error, /no readable compatibility.minimum/);
});

// ── evaluateRegistryLeadTarget (Gap 2, §Registry lead prohibition) ─────────────────────────────

test('a beta head Foundry considers older than the promoted version is refused (backwards)', () => {
  const verdict = evaluateRegistryLeadTarget({
    channel: 'beta',
    sourceChannel: 'early-access',
    label: 'channel-beta',
    head: '1.4.0-beta.3',
    version: '1.5.0',
  });
  assert.equal(verdict.decision, 'refuse');
  assert.equal(verdict.kind, 'backwards');
  assert.match(verdict.reason, /Advance beta first/);
});

test('the beta backwards refusal names a REACHABLE remedy: bring the release line back into the prerelease line', () => {
  // Issue #1001. The old message named only "push the feature work to main so beta.yml mints a
  // newer beta", which is unreachable in exactly the state that produces this refusal: while the
  // prerelease line is itself numbered below v1.6.0, the next version it mints (1.4.0-beta.69) is
  // below it too.
  const verdict = evaluateRegistryLeadTarget({
    channel: 'beta',
    sourceChannel: 'early-access',
    label: 'channel-beta',
    head: '1.4.0-beta.68',
    version: '1.6.0',
  });

  // Verdict SHAPE is untouched — this is a message-only correction.
  assert.equal(verdict.decision, 'refuse');
  assert.equal(verdict.kind, 'backwards');

  assert.match(verdict.reason, /Advance beta first/);
  assert.match(verdict.reason, /prerelease line is itself numbered below/);
  assert.match(verdict.reason, /bring the release line back into the prerelease line/);
  assert.match(verdict.reason, /forward-port/);
  // And it must be clear the remedy promotes nothing — no public promotion is available while the
  // refusal stands.
  assert.match(verdict.reason, /promotes nothing/);
});

test('an early-access head Foundry considers older than the promoted version is refused (backwards)', () => {
  const verdict = evaluateRegistryLeadTarget({
    channel: 'early-access',
    sourceChannel: '1.4.x',
    label: 'channel-early-access',
    head: '1.4.0',
    version: '1.5.0',
  });
  assert.equal(verdict.decision, 'refuse');
  assert.equal(verdict.kind, 'backwards');
  assert.match(verdict.reason, /Advance early-access first/);
});

test('a head Foundry considers newer than the promoted version is safe (the normal beta lead)', () => {
  const verdict = evaluateRegistryLeadTarget({
    channel: 'beta',
    sourceChannel: 'early-access',
    label: 'channel-beta',
    head: '1.5.0-beta.1', // Foundry sorts a prerelease ABOVE its own GA — the fail-safe.
    version: '1.5.0',
  });
  assert.equal(verdict.decision, 'safe');
});

test('a head equal to the promoted version is safe (equal is not backwards)', () => {
  const verdict = evaluateRegistryLeadTarget({
    channel: 'early-access',
    sourceChannel: 'early-access',
    label: 'channel-early-access',
    head: '1.5.0',
    version: '1.5.0',
  });
  assert.equal(verdict.decision, 'safe');
});

test('an ABSENT head on a cohort-retaining NON-SOURCE target is refused (the 404 half)', () => {
  // Release-line promotion (source early-access): beta is a cohort-retaining non-source channel.
  const verdict = evaluateRegistryLeadTarget({
    channel: 'beta',
    sourceChannel: 'early-access',
    label: 'tester-closed-beta-2026',
    head: null,
    version: '1.5.0',
  });
  assert.equal(verdict.decision, 'refuse');
  assert.equal(verdict.kind, 'absent');
  assert.match(verdict.reason, /NO published head/);
  assert.match(verdict.reason, /404/);
});

test('an ABSENT head on the SOURCE channel is exempt — step 2 already covers it', () => {
  const verdict = evaluateRegistryLeadTarget({
    channel: 'early-access',
    sourceChannel: 'early-access',
    label: 'channel-early-access',
    head: null,
    version: '1.5.0',
  });
  assert.equal(verdict.decision, 'safe');
  assert.match(verdict.reason, /source channel/);
});

test('on a hotfix promotion BOTH beta and early-access absent heads are refused (neither is source)', () => {
  for (const channel of ['beta', 'early-access']) {
    const verdict = evaluateRegistryLeadTarget({
      channel,
      sourceChannel: '1.4.x',
      label: `channel-${channel}`,
      head: null,
      version: '1.4.1',
    });
    assert.equal(verdict.decision, 'refuse', `${channel} absent head must refuse on a hotfix`);
    assert.equal(verdict.kind, 'absent');
  }
});

test('an undefined head is treated as absent, not compared', () => {
  const verdict = evaluateRegistryLeadTarget({
    channel: 'beta',
    sourceChannel: 'early-access',
    label: 'channel-beta',
    head: undefined,
    version: '1.5.0',
  });
  assert.equal(verdict.decision, 'refuse');
  assert.equal(verdict.kind, 'absent');
});

// ── evaluateTesterConfigDrift (issue 1872, §Tester group identity) ──────────────────────────────

/** A config declaring one channel's tester identity, plus the fields drift must ignore. */
function configWith({ testerGroups, testerSecretEnv, bucket = 'bucket-a', baseUrl = 'https://a' }) {
  return {
    moduleId: 'fabricate',
    bucket,
    baseUrl,
    channels: { 'early-access': { testerGroups, testerSecretEnv }, public: { testerGroups: [] } },
  };
}

const ROTATED = {
  testerGroups: ['guild-artisan-2026'],
  testerSecretEnv: 'S3_GUILD_ARTISAN_PATH_SECRET',
};
const PRE_ROTATION = {
  testerGroups: ['patrons-2026'],
  testerSecretEnv: 'S3_EARLY_ACCESS_PATH_SECRET',
};

test('identical tester identities on both refs are not drift', () => {
  const drift = evaluateTesterConfigDrift({
    channel: 'early-access',
    dispatchConfig: configWith(ROTATED),
    publisherConfig: configWith(ROTATED),
  });
  assert.equal(drift.drifted, false);
  assert.equal(drift.remedy, '');
});

test('a differing tester GROUP is drift, and the summary names both sides and the publisher ref', () => {
  const drift = evaluateTesterConfigDrift({
    channel: 'early-access',
    dispatchConfig: configWith(ROTATED),
    publisherConfig: configWith({ ...ROTATED, testerGroups: ['patrons-2026'] }),
  });
  assert.equal(drift.drifted, true);
  assert.match(drift.summary, /guild-artisan-2026/);
  assert.match(drift.summary, /patrons-2026/);
  assert.match(drift.summary, /origin\/release/);
});

test('a differing tester SECRET NAME is drift on its own — same group, different segment source', () => {
  const drift = evaluateTesterConfigDrift({
    channel: 'early-access',
    dispatchConfig: configWith(ROTATED),
    publisherConfig: configWith({ ...ROTATED, testerSecretEnv: 'S3_EARLY_ACCESS_PATH_SECRET' }),
  });
  assert.equal(drift.drifted, true);
  assert.match(drift.summary, /S3_GUILD_ARTISAN_PATH_SECRET/);
  assert.match(drift.summary, /S3_EARLY_ACCESS_PATH_SECRET/);
});

test('bucket, baseUrl and moduleId differences are NOT tester-identity drift', () => {
  // The two refs legitimately differ in plenty of ways; only the cohort's identity is the subject.
  const drift = evaluateTesterConfigDrift({
    channel: 'early-access',
    dispatchConfig: configWith(ROTATED),
    publisherConfig: {
      ...configWith({ ...ROTATED, bucket: 'bucket-b', baseUrl: 'https://b' }),
      moduleId: 'fabricate-legacy',
    },
  });
  assert.equal(drift.drifted, false);
});

test('group order carries no meaning — the names are compared as a SET', () => {
  const groups = ['guild-artisan-2026', 'guild-patron-2026'];
  const drift = evaluateTesterConfigDrift({
    channel: 'early-access',
    dispatchConfig: configWith({ ...ROTATED, testerGroups: groups }),
    publisherConfig: configWith({ ...ROTATED, testerGroups: [...groups].reverse() }),
  });
  assert.equal(drift.drifted, false);
});

test('a repeated group name is not a second group — the set sizes, not the lengths, decide', () => {
  const drift = evaluateTesterConfigDrift({
    channel: 'early-access',
    dispatchConfig: configWith({ ...ROTATED, testerGroups: ['patrons-2026', 'patrons-2026'] }),
    publisherConfig: configWith({ ...ROTATED, testerGroups: ['patrons-2026', 'guild-artisan-2026'] }),
  });
  assert.equal(drift.drifted, true);
});

test('an absent channel on the publisher ref drifts against a declared one', () => {
  const drift = evaluateTesterConfigDrift({
    channel: 'early-access',
    dispatchConfig: configWith(ROTATED),
    publisherConfig: { moduleId: 'fabricate' },
  });
  assert.equal(drift.drifted, true);
  assert.match(drift.summary, /none/);
});

test('the remedy names the release-s3.yml dispatch and the ref that publishes the channel', () => {
  const drift = evaluateTesterConfigDrift({
    channel: 'early-access',
    dispatchConfig: configWith(ROTATED),
    publisherConfig: configWith(PRE_ROTATION),
  });
  assert.match(drift.remedy, /release-s3\.yml/);
  assert.match(drift.remedy, /workflow_dispatch/);
  assert.match(drift.remedy, /early-access/);
  assert.match(drift.remedy, /origin\/release/);
});

test('the publisher ref is named by the caller, not assumed', () => {
  const drift = evaluateTesterConfigDrift({
    channel: 'early-access',
    dispatchConfig: configWith(ROTATED),
    publisherConfig: configWith(PRE_ROTATION),
    publisherRef: 'origin/1.9.x',
  });
  assert.match(drift.summary, /origin\/1\.9\.x/);
  assert.match(drift.remedy, /origin\/1\.9\.x/);
});

test('no path SEGMENT reaches the summary or the remedy — only names are compared', () => {
  // The segment is a secret. It is never read here, so the diagnosis is safe to print in a log
  // even when a caller has it in the environment.
  const segment = 'a-secret-segment-value';
  process.env.S3_GUILD_ARTISAN_PATH_SECRET = segment;
  try {
    const drift = evaluateTesterConfigDrift({
      channel: 'early-access',
      dispatchConfig: configWith(ROTATED),
      publisherConfig: configWith(PRE_ROTATION),
    });
    assert.ok(!drift.summary.includes(segment), 'the summary leaked the path segment');
    assert.ok(!drift.remedy.includes(segment), 'the remedy leaked the path segment');
  } finally {
    delete process.env.S3_GUILD_ARTISAN_PATH_SECRET;
  }
});

// The shipped config is the shape the guard actually reads in CI, so the fixtures above are a
// mirror of it: a renamed field would leave them green and every real promotion undiagnosed.
test('the shipped release.s3.config.json declares an early-access identity the guard can read', () => {
  const real = JSON.parse(
    readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'release.s3.config.json'),
      'utf8'
    )
  );
  const agrees = evaluateTesterConfigDrift({
    channel: 'early-access',
    dispatchConfig: real,
    publisherConfig: real,
  });
  assert.equal(agrees.drifted, false, 'the shipped config drifts against itself');

  const preRotation = {
    ...real,
    channels: {
      ...real.channels,
      'early-access': { ...real.channels['early-access'], testerGroups: ['patrons-2026'] },
    },
  };
  const drift = evaluateTesterConfigDrift({
    channel: 'early-access',
    dispatchConfig: real,
    publisherConfig: preRotation,
  });
  assert.equal(drift.drifted, true);
  assert.match(drift.summary, /guild-artisan-2026/);
  assert.match(drift.summary, /patrons-2026/);
  assert.match(drift.summary, /S3_GUILD_ARTISAN_PATH_SECRET/);
});
