/**
 * The tester-secret rotation utility (issue #1761). The premium config is an injected literal here:
 * reading the private sibling would make this suite unrunnable in CI, and an `existsSync` skip
 * would report a broken parser as green.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { resolveChannelConfig } from '../scripts/release-s3.js';
import {
  main,
  newSegment,
  parseArgs,
  planRotation,
  runRotation,
} from '../scripts/rotate-tester-secrets.mjs';

const REPOSITORY_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FABRICATE = 'mistersilver-uk/fabricate';
const PREMIUM = 'mistersilver-uk/fabricate-premium';

/** This repository's schema: one `testerSecretEnv` per channel, against an array of groups. */
const FABRICATE_CONFIG = {
  moduleId: 'fabricate',
  channels: {
    beta: { testerGroups: ['closed-beta-2026'], testerSecretEnv: 'S3_TESTER_PATH_SECRET' },
    'early-access': {
      testerGroups: ['guild-artisan-2026'],
      testerSecretEnv: 'S3_GUILD_ARTISAN_PATH_SECRET',
    },
    public: { testerGroups: [] },
  },
};

/** The premium repository's schema: one `testerSecretEnv` per group. The asymmetry is deliberate. */
const PREMIUM_CONFIG = {
  channels: {
    beta: {
      testerGroups: {
        'closed-beta-2026': {
          testerSecretEnv: 'S3_TESTER_PATH_SECRET',
          modules: ['fabricate-mythwright', 'fabricate-premium'],
        },
      },
    },
    'early-access': {
      testerGroups: {
        'apprentice-crafter-2026': {
          testerSecretEnv: 'S3_APPRENTICE_PATH_SECRET',
          modules: ['fabricate-mythwright'],
        },
        'guild-artisan-2026': {
          testerSecretEnv: 'S3_GUILD_ARTISAN_PATH_SECRET',
          modules: ['fabricate-mythwright', 'fabricate-premium'],
        },
      },
    },
    public: { testerGroups: {}, modules: ['fabricate-premium'] },
  },
};

const plan = (overrides = {}) =>
  planRotation({ fabricateConfig: FABRICATE_CONFIG, premiumConfig: PREMIUM_CONFIG, ...overrides });

/** A `gh` double recording every argv and stdin it is handed, optionally rejecting one write. */
function ghDouble({ failOnSetCall = 0 } = {}) {
  const calls = [];
  let sets = 0;
  return {
    calls,
    runGh: async (args, { input } = {}) => {
      calls.push({ args, input });
      if (args[0] !== 'secret') return '';
      sets += 1;
      if (sets === failOnSetCall) throw new Error('HTTP 403: Resource not accessible');
      return '';
    },
  };
}

/** Segments as `seg-1, seg-2, …`, so one ordered argv assertion answers "per secret or per write?". */
function countingSegments() {
  let n = 0;
  return () => {
    n += 1;
    return `seg-${n}`;
  };
}

const collectLog = () => {
  const lines = [];
  return { lines, log: (line) => lines.push(String(line)) };
};

const refuseGh = async () => assert.fail('no `gh` invocation may be reached here');

// planRotation — the mapping

test('the plan maps one secret to every repository and group it serves, in discovery order', () => {
  assert.deepEqual(plan().secrets, [
    {
      name: 'S3_TESTER_PATH_SECRET',
      groups: ['closed-beta-2026'],
      repositories: [FABRICATE, PREMIUM],
    },
    {
      name: 'S3_GUILD_ARTISAN_PATH_SECRET',
      groups: ['guild-artisan-2026'],
      repositories: [FABRICATE, PREMIUM],
    },
    {
      name: 'S3_APPRENTICE_PATH_SECRET',
      groups: ['apprentice-crafter-2026'],
      repositories: [PREMIUM],
    },
  ]);
});

test('the plan covers exactly the tester feeds the shipped config resolves to', () => {
  // `planRotation` is a second, independent reader of this schema, parallel to
  // `resolveChannelConfig` — which also honours a scalar back-compat branch the plan cannot see.
  // Every other assertion here runs against the literal above and would stay green without this.
  const shipped = JSON.parse(
    readFileSync(path.join(REPOSITORY_ROOT, 'release.s3.config.json'), 'utf8')
  );
  const channels = [...new Set([...Object.keys(shipped.channels), shipped.channel])];
  const feeds = (list) => list.map(({ group, secretEnv }) => `${group}=${secretEnv}`).sort();

  const published = channels.flatMap((channel) => {
    const { testerGroups, testerSecretEnv } = resolveChannelConfig(shipped, channel);
    return testerGroups.map((group) => ({ group, secretEnv: testerSecretEnv }));
  });
  const planned = planRotation({ fabricateConfig: shipped, premiumConfig: null }).secrets.flatMap(
    (secret) => secret.groups.map((group) => ({ group, secretEnv: secret.name }))
  );

  assert.ok(published.length >= 2, 'the shipped config resolves fewer tester feeds than it declares');
  assert.deepEqual(feeds(planned), feeds(published));
});

test('the plan warns that a shared secret collapses whatever prefixes the repositories hold now', () => {
  const warnings = plan().warnings;

  // `gh` cannot read a secret back, so this report is the only place the collapse is visible.
  assert.equal(warnings.length, 2);
  assert.ok(warnings.every((warning) => /collapses/.test(warning)));
  assert.ok(warnings.some((warning) => warning.startsWith('S3_TESTER_PATH_SECRET')));
  assert.ok(warnings.some((warning) => warning.startsWith('S3_GUILD_ARTISAN_PATH_SECRET')));
});

test('a plan without the premium config covers this repository alone', () => {
  const { secrets } = plan({ premiumConfig: null });

  assert.deepEqual(
    secrets.map((secret) => secret.name),
    ['S3_TESTER_PATH_SECRET', 'S3_GUILD_ARTISAN_PATH_SECRET']
  );
  assert.ok(secrets.every((secret) => secret.repositories.length === 1));
});

test('a channel declaring two groups against one secret serves both, and refuses either narrowing', () => {
  // A plan derived from `testerGroups[0]` builds a self-consistent mapping, silently never rotates
  // the second group, and passes every other case in this file.
  const shared = {
    channels: {
      'early-access': {
        testerGroups: ['guild-artisan-2026', 'journeyman-smith-2026'],
        testerSecretEnv: 'S3_GUILD_ARTISAN_PATH_SECRET',
      },
    },
  };

  assert.deepEqual(planRotation({ fabricateConfig: shared, premiumConfig: null }).secrets, [
    {
      name: 'S3_GUILD_ARTISAN_PATH_SECRET',
      groups: ['guild-artisan-2026', 'journeyman-smith-2026'],
      repositories: [FABRICATE],
    },
  ]);

  for (const [named, unnamed] of [
    ['guild-artisan-2026', 'journeyman-smith-2026'],
    ['journeyman-smith-2026', 'guild-artisan-2026'],
  ]) {
    assert.throws(
      () => planRotation({ fabricateConfig: shared, premiumConfig: null, group: named }),
      (error) =>
        error.message.includes(unnamed) &&
        /rotating it rotates those cohorts too/.test(error.message),
      `--group ${named} must refuse while naming ${unnamed}`
    );
  }
});

test('--group narrows to a group whose secret serves it alone', () => {
  const { secrets } = plan({ group: 'apprentice-crafter-2026' });

  assert.deepEqual(secrets, [
    {
      name: 'S3_APPRENTICE_PATH_SECRET',
      groups: ['apprentice-crafter-2026'],
      repositories: [PREMIUM],
    },
  ]);
});

// planRotation — the refusals

test('a group declared under two different secret names is refused, naming both', () => {
  const disagreeing = {
    channels: {
      beta: {
        testerGroups: { 'closed-beta-2026': { testerSecretEnv: 'S3_CLOSED_BETA_PATH_SECRET' } },
      },
    },
  };

  assert.throws(
    () => plan({ premiumConfig: disagreeing }),
    (error) =>
      error.message.includes('S3_TESTER_PATH_SECRET') &&
      error.message.includes('S3_CLOSED_BETA_PATH_SECRET') &&
      error.message.includes('closed-beta-2026'),
    'the cross-repository naming rule is enforced here; no public suite can read the private config'
  );
});

test('a declared group with a missing or empty-string secret is refused', () => {
  // `''` survives `?? null`, so a nullish-only guard plans a write to a secret named "".
  for (const testerSecretEnv of [undefined, '', '   ']) {
    assert.throws(
      () =>
        planRotation({
          fabricateConfig: {
            channels: { beta: { testerGroups: ['closed-beta-2026'], testerSecretEnv } },
          },
          premiumConfig: null,
        }),
      /no "testerSecretEnv"/,
      `a testerSecretEnv of ${JSON.stringify(testerSecretEnv)} must refuse`
    );
  }
});

test('an unknown --group is refused, listing the groups that are declared', () => {
  assert.throws(
    () => plan({ group: 'patrons-2026' }),
    (error) =>
      /no tester group named "patrons-2026"/.test(error.message) &&
      error.message.includes('guild-artisan-2026') &&
      error.message.includes('apprentice-crafter-2026') &&
      error.message.includes('closed-beta-2026'),
    'the refusal must list the known groups, or a renamed cohort is a guessing game'
  );
});

// runRotation — the composition

test('--apply writes one segment per secret, identical across the repositories it serves', async () => {
  const gh = ghDouble();

  const result = await runRotation({
    plan: plan(),
    apply: true,
    deps: { runGh: gh.runGh, newSegment: countingSegments(), log: () => {} },
  });

  // Three claims at once: `seg-1` twice proves a shared secret reaches both repositories with one
  // value; `seg-1`/`seg-2`/`seg-3` prove one segment per secret, not per write; and the grouping
  // proves the writes are group-major, so a mid-run failure is bounded to one cohort.
  assert.deepEqual(gh.calls, [
    { args: ['auth', 'status'], input: undefined },
    { args: ['secret', 'set', 'S3_TESTER_PATH_SECRET', '--repo', FABRICATE], input: 'seg-1' },
    { args: ['secret', 'set', 'S3_TESTER_PATH_SECRET', '--repo', PREMIUM], input: 'seg-1' },
    { args: ['secret', 'set', 'S3_GUILD_ARTISAN_PATH_SECRET', '--repo', FABRICATE], input: 'seg-2' },
    { args: ['secret', 'set', 'S3_GUILD_ARTISAN_PATH_SECRET', '--repo', PREMIUM], input: 'seg-2' },
    { args: ['secret', 'set', 'S3_APPRENTICE_PATH_SECRET', '--repo', PREMIUM], input: 'seg-3' },
  ]);
  assert.equal(result.applied, true);
  assert.equal(result.writes.length, 5);
});

test('a dry run reports the whole plan and touches nothing', async () => {
  const gh = ghDouble();
  const { lines, log } = collectLog();

  const result = await runRotation({
    plan: plan(),
    deps: { runGh: gh.runGh, newSegment: countingSegments(), log },
  });

  assert.deepEqual(gh.calls, []);
  // …and it did not pass by failing early: the plan was fully produced and fully reported.
  assert.equal(result.applied, false);
  assert.equal(result.writes.length, 5);
  const report = lines.join('\n');
  assert.match(report, /DRY RUN/);
  for (const token of [
    'S3_TESTER_PATH_SECRET',
    'S3_GUILD_ARTISAN_PATH_SECRET',
    'S3_APPRENTICE_PATH_SECRET',
    'closed-beta-2026',
    'guild-artisan-2026',
    'apprentice-crafter-2026',
    FABRICATE,
    PREMIUM,
  ]) {
    assert.ok(report.includes(token), `the dry-run report does not name ${token}`);
  }
  assert.match(report, /5 repository write\(s\) across 3 secret\(s\)/);
  assert.match(report, /collapses/);
});

test('a mid-run gh failure names the secret, enumerates what landed, and reports no success', async () => {
  const gh = ghDouble({ failOnSetCall: 3 });

  await assert.rejects(
    runRotation({
      plan: plan(),
      apply: true,
      deps: { runGh: gh.runGh, newSegment: countingSegments(), log: () => {} },
    }),
    (error) => {
      assert.match(error.message, /failed to write S3_GUILD_ARTISAN_PATH_SECRET/);
      assert.match(error.message, /HTTP 403/);
      // The two writes that landed span a whole cohort, and that cohort has moved.
      assert.match(error.message, /S3_TESTER_PATH_SECRET -> mistersilver-uk\/fabricate\b/);
      assert.match(error.message, /S3_TESTER_PATH_SECRET -> mistersilver-uk\/fabricate-premium/);
      assert.ok(
        !error.message.includes('S3_APPRENTICE_PATH_SECRET'),
        'nothing after the failure ran'
      );
      return true;
    }
  );

  assert.equal(gh.calls.length, 4, 'the run stopped at the failed write');
});

test('--apply refuses before the first write when gh is absent or unauthenticated', async () => {
  const calls = [];
  const runGh = async (args) => {
    calls.push(args);
    throw new Error('gh: command not found');
  };

  await assert.rejects(
    runRotation({ plan: plan(), apply: true, deps: { runGh, log: () => {} } }),
    /absent or unauthenticated/
  );
  assert.deepEqual(calls, [['auth', 'status']], 'no secret may be written after a failed preflight');
});

// main — the wiring from argv to writes

/** Both configs on disk, so `main` exercises its own reader rather than an injected object. */
let onDisk = null;
async function writeConfigs() {
  if (onDisk) return onDisk;
  const dir = await mkdtemp(path.join(tmpdir(), 'rotate-tester-secrets-'));
  const config = path.join(dir, 'release.s3.config.json');
  const premiumConfig = path.join(dir, 'premium.release.config.json');
  // Beta carries a second group here so the ambiguous-narrowing refusal is reachable through main.
  const fabricate = {
    ...FABRICATE_CONFIG,
    channels: {
      ...FABRICATE_CONFIG.channels,
      beta: {
        testerGroups: ['closed-beta-2026', 'legacy-beta-2026'],
        testerSecretEnv: 'S3_TESTER_PATH_SECRET',
      },
    },
  };
  await writeFile(config, JSON.stringify(fabricate), 'utf8');
  await writeFile(premiumConfig, JSON.stringify(PREMIUM_CONFIG), 'utf8');
  onDisk = { dir, config, premiumConfig };
  return onDisk;
}

test('main reads both configs and plans without writing when --apply is absent', async () => {
  const { config, premiumConfig } = await writeConfigs();
  const gh = ghDouble();
  const { lines, log } = collectLog();

  const result = await main({
    argv: ['--config', config, '--premium-config', premiumConfig],
    deps: { runGh: gh.runGh, log },
  });

  assert.deepEqual(gh.calls, []);
  // …and it did not pass by throwing before the plan was built.
  assert.equal(result.applied, false);
  assert.equal(result.writes.length, 5);
  const report = lines.join('\n');
  for (const secret of [
    'S3_TESTER_PATH_SECRET',
    'S3_GUILD_ARTISAN_PATH_SECRET',
    'S3_APPRENTICE_PATH_SECRET',
  ]) {
    assert.ok(report.includes(secret), `the dry-run report does not name ${secret}`);
  }
});

test('main --apply writes one real segment per secret and announces the new prefixes', async () => {
  const { config, premiumConfig } = await writeConfigs();
  const gh = ghDouble();
  const { lines, log } = collectLog();

  // `newSegment` is deliberately not injected: reading the real generator's output back out of
  // the write is the only way a constant segment shows up as a failure.
  await main({
    argv: ['--config', config, '--premium-config', premiumConfig, '--apply'],
    deps: { runGh: gh.runGh, log },
  });

  const sets = gh.calls.slice(1);
  assert.deepEqual(gh.calls[0].args, ['auth', 'status']);
  assert.deepEqual(
    sets.map(({ args }) => args),
    [
      ['secret', 'set', 'S3_TESTER_PATH_SECRET', '--repo', FABRICATE],
      ['secret', 'set', 'S3_TESTER_PATH_SECRET', '--repo', PREMIUM],
      ['secret', 'set', 'S3_GUILD_ARTISAN_PATH_SECRET', '--repo', FABRICATE],
      ['secret', 'set', 'S3_GUILD_ARTISAN_PATH_SECRET', '--repo', PREMIUM],
      ['secret', 'set', 'S3_APPRENTICE_PATH_SECRET', '--repo', PREMIUM],
    ]
  );

  const written = sets.map(({ input }) => input);
  for (const value of written) assert.match(value, /^[0-9a-f]{32}$/);
  assert.equal(written[0], written[1], 'a shared secret reaches both repositories with one value');
  assert.equal(written[2], written[3], 'and so does the early-access one');
  assert.equal(new Set(written).size, 3, 'one segment per secret, and no two secrets share one');

  // `gh` cannot read a secret back, so an unreported prefix is an unannounceable cohort.
  const report = lines.join('\n');
  for (const [group, segment] of [
    ['closed-beta-2026', written[0]],
    ['legacy-beta-2026', written[0]],
    ['guild-artisan-2026', written[2]],
    ['apprentice-crafter-2026', written[4]],
  ]) {
    assert.ok(
      report.includes(`${group}: testers/${group}/${segment}/<moduleId>/module.json`),
      `the report does not announce the new prefix for ${group}`
    );
  }
});

test('main --group rotates that group alone, and refuses one sharing its secret with another', async () => {
  const { config, premiumConfig } = await writeConfigs();
  const gh = ghDouble();
  const base = ['--config', config, '--premium-config', premiumConfig];

  await main({
    argv: [...base, '--group', 'apprentice-crafter-2026', '--apply'],
    deps: { runGh: gh.runGh, newSegment: () => 'seg', log: () => {} },
  });

  assert.deepEqual(
    gh.calls.map(({ args }) => args),
    [
      ['auth', 'status'],
      ['secret', 'set', 'S3_APPRENTICE_PATH_SECRET', '--repo', PREMIUM],
    ]
  );

  await assert.rejects(
    main({ argv: [...base, '--group', 'closed-beta-2026'], deps: { runGh: refuseGh, log: () => {} } }),
    (error) =>
      error.message.includes('legacy-beta-2026') &&
      /rotating it rotates those cohorts too/.test(error.message)
  );
});

test('--no-premium is dry-run only, and never reads the premium config', async () => {
  const { config, premiumConfig } = await writeConfigs();

  // Rotating this repository alone leaves the premium modules on the old segment — one cohort,
  // two prefixes — and without the premium config neither the collapse warning nor the
  // ambiguous-narrowing refusal can see the split it is causing.
  await assert.rejects(
    main({ argv: ['--no-premium', '--apply'], deps: { runGh: refuseGh } }),
    /--no-premium cannot be combined with --apply/
  );

  const { lines, log } = collectLog();
  const result = await main({
    argv: ['--config', config, '--premium-config', premiumConfig, '--no-premium'],
    deps: { runGh: refuseGh, log },
  });

  assert.equal(result.writes.length, 2);
  const report = lines.join('\n');
  assert.ok(!report.includes('S3_APPRENTICE_PATH_SECRET'), '--no-premium read the premium config');
  assert.ok(!report.includes(PREMIUM), '--no-premium planned a write to the premium repository');
});

test('a missing premium config points at --premium-config, and --no-premium only as a dry run', async () => {
  const { config, dir } = await writeConfigs();

  await assert.rejects(
    main({
      argv: ['--config', config, '--premium-config', path.join(dir, 'absent.json')],
      deps: { runGh: refuseGh, log: () => {} },
    }),
    (error) => {
      assert.match(error.message, /--premium-config <path>/);
      assert.match(error.message, /--no-premium inspects this repository alone and is dry-run only/);
      return true;
    }
  );
});

test('--help prints and rotates nothing', async () => {
  const { lines, log } = collectLog();

  assert.equal(await main({ argv: ['--help'], deps: { log, runGh: refuseGh } }), null);
  assert.match(lines.join('\n'), /--apply/);
});

// the segment, the flags, and the deliberate absence from CI

test('a segment is 32 hex characters and is not repeated', () => {
  const first = newSegment();
  assert.match(first, /^[0-9a-f]{32}$/);
  assert.notEqual(first, newSegment());
});

test('the default is a dry run, and only the exact token --apply changes that', () => {
  assert.equal(parseArgs([]).apply, false);
  assert.equal(parseArgs(['--group', 'closed-beta-2026']).apply, false);
  assert.equal(parseArgs(['--apply']).apply, true);

  for (const rejected of ['--Apply', '--apply-now', '--applY', 'apply', '--dry-run']) {
    assert.throws(() => parseArgs([rejected]), /Unknown option/, `${rejected} must not parse`);
  }
});

test('a flag that needs a value refuses the next flag as its value', () => {
  assert.equal(parseArgs(['--group', 'closed-beta-2026']).group, 'closed-beta-2026');
  assert.equal(parseArgs(['--config', 'local.json']).config, path.resolve('local.json'));
  assert.throws(() => parseArgs(['--group']), /--group requires a value/);
  assert.throws(() => parseArgs(['--group', '--apply']), /--group requires a value/);
  assert.throws(() => parseArgs(['--config']), /--config requires a value/);
  assert.throws(() => parseArgs(['--premium-config']), /--premium-config requires a value/);
});

test('the configs default to this repository and to the premium sibling checkout', () => {
  // Asserted on the resolved paths, not by letting `main` fail to read them: a maintainer has the
  // sibling checked out, so a rejection would prove only that this machine lacks it.
  const posix = (value) => value.replaceAll('\\', '/');
  const { config, premiumConfig } = parseArgs([]);

  assert.ok(
    posix(config).endsWith('/release.s3.config.json'),
    `the default config is ${config}, which is not this repository's release config`
  );
  assert.ok(
    posix(premiumConfig).endsWith('/fabricate-premium/release.config.json'),
    `the default premium config is ${premiumConfig}; it mirrors a private sibling's filename and ` +
      'nothing else in this repository would notice it drifting'
  );
});

test('the utility is absent from CI: no npm script and no workflow names it', () => {
  const { scripts } = JSON.parse(readFileSync(path.join(REPOSITORY_ROOT, 'package.json'), 'utf8'));
  const referencing = Object.entries(scripts)
    .filter(([, body]) => body.includes('rotate-tester-secrets'))
    .map(([name]) => name);
  assert.deepEqual(
    referencing,
    [],
    'rotation mutates repository secrets in two repositories and must stay a deliberate local act'
  );

  const workflows = path.join(REPOSITORY_ROOT, '.github', 'workflows');
  const walk = (dir) =>
    readdirSync(dir).flatMap((entry) => {
      const full = path.join(dir, entry);
      return statSync(full).isDirectory() ? walk(full) : [full];
    });
  const files = walk(workflows);
  assert.ok(files.length > 5, `found ${files.length} workflow files; the walk is not reaching them`);
  assert.deepEqual(
    files.filter((file) => readFileSync(file, 'utf8').includes('rotate-tester-secrets')),
    [],
    'a scheduled rotation would rewrite the URLs with nobody ready to redistribute them'
  );
});
