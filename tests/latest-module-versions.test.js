import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collectModuleTargets,
  formatTable,
  parseArgs
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
