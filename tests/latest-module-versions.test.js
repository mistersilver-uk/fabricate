import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collectModuleTargets,
  formatTable,
  parseArgs,
  resolveAwsEnv
} from '../scripts/latest-module-versions.mjs';

test('parseArgs accepts profile, channel, JSON mode, and explicit modules', () => {
  const options = parseArgs([
    '--profile', 'fabricate-beta-admin',
    '--channel', 'beta',
    '--json',
    '--include', 'extra-module',
    '--include', 'second-module'
  ]);

  assert.equal(options.profile, 'fabricate-beta-admin');
  assert.equal(options.channel, 'beta');
  assert.equal(options.json, true);
  assert.deepEqual(options.include, ['extra-module', 'second-module']);
});

test('resolveAwsEnv omits AWS_PROFILE entirely in CI so the SDK uses OIDC credentials', () => {
  const resolved = resolveAwsEnv({}, { GITHUB_ACTIONS: 'true', AWS_REGION: 'eu-west-2' });

  // The KEY must be absent, not present-and-undefined: `process.env.AWS_PROFILE = undefined`
  // stores the string "undefined", which the SDK resolves as a profile name; and the SDK skips
  // the environment-variable credential provider whenever AWS_PROFILE is set at all.
  assert.equal('AWS_PROFILE' in resolved, false);
  assert.equal(Object.keys(resolved).includes('AWS_PROFILE'), false);
  assert.equal(resolved.AWS_REGION, 'eu-west-2');
  assert.equal(resolved.AWS_SDK_LOAD_CONFIG, '1');
});

test('resolveAwsEnv ignores an inherited AWS_PROFILE in CI unless --profile is passed', () => {
  const env = { GITHUB_ACTIONS: 'true', AWS_PROFILE: 'fabricate-beta' };

  assert.equal('AWS_PROFILE' in resolveAwsEnv({}, env), false);
  assert.equal(resolveAwsEnv({ profile: 'release-role' }, env).AWS_PROFILE, 'release-role');
});

test('resolveAwsEnv falls back to the local default profile outside CI', () => {
  assert.equal(resolveAwsEnv({}, {}).AWS_PROFILE, 'fabricate-beta');
  assert.equal(resolveAwsEnv({}, { AWS_PROFILE: 'other' }).AWS_PROFILE, 'other');
  assert.equal(resolveAwsEnv({ profile: 'explicit' }, { AWS_PROFILE: 'other' }).AWS_PROFILE, 'explicit');
  assert.equal(resolveAwsEnv({}, {}).AWS_REGION, 'eu-west-2');
  assert.equal(resolveAwsEnv({ region: 'us-east-1' }, {}).AWS_REGION, 'us-east-1');
});

test('parseArgs does not default the AWS profile — an unset profile must stay unset', () => {
  const options = parseArgs([]);

  assert.equal('profile' in options, false);
  assert.equal('region' in options, false);
});

test('collectModuleTargets combines Fabricate and premium modules without bucket listing', () => {
  const targets = collectModuleTargets({
    fabricateConfig: {
      moduleId: 'fabricate',
      bucket: 'fabricate-modules',
      channel: 'beta'
    },
    premiumConfig: {
      bucket: 'legacy-premium-bucket',
      modules: [
        { slug: 'fabricate-mythwright', channel: 'beta' },
        { slug: 'balehound-foe-folio', channel: 'beta' }
      ]
    },
    options: {
      bucket: '',
      channel: 'beta',
      premium: true,
      include: ['manual-module']
    }
  });

  assert.deepEqual(
    targets.map((target) => target.moduleId),
    ['fabricate', 'fabricate-mythwright', 'balehound-foe-folio', 'manual-module']
  );
  assert.deepEqual(targets[1].buckets, ['fabricate-modules', 'legacy-premium-bucket']);
  assert.equal(targets[1].channel, 'beta');
});

test('collectModuleTargets respects --no-premium', () => {
  const targets = collectModuleTargets({
    fabricateConfig: {
      moduleId: 'fabricate',
      bucket: 'fabricate-modules',
      channel: 'beta'
    },
    premiumConfig: {
      bucket: 'legacy-premium-bucket',
      modules: [{ slug: 'fabricate-mythwright', channel: 'beta' }]
    },
    options: {
      channel: 'beta',
      premium: false,
      include: []
    }
  });

  assert.deepEqual(targets.map((target) => target.moduleId), ['fabricate']);
});

test('formatTable prints successful and failed module rows', () => {
  const table = formatTable([
    {
      ok: true,
      moduleId: 'fabricate',
      version: '1.0.0-rc.71',
      lastModified: '2026-06-12T22:55:47.000Z',
      manifestUrl: 'https://example.test/modules/fabricate/beta/latest/module.json'
    },
    {
      ok: false,
      moduleId: 'missing-module',
      error: 'AccessDenied'
    }
  ]);

  assert.match(table, /fabricate\s+1\.0\.0-rc\.71\s+2026-06-12T22:55:47Z/);
  assert.match(table, /missing-module\s+ERROR\s+AccessDenied/);
});
