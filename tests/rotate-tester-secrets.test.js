/**
 * THE TESTER-SECRET ROTATION UTILITY (issue #1761).
 *
 * A tester group is one cohort holding one URL prefix, and that prefix is a secret written into two
 * repositories. The bug this file is written against is not a wrong mapping — it is a RIGHT mapping
 * applied with a fresh segment per write, which gives each repository a different prefix, splits the
 * cohort in half, and passes any assertion made about the mapping alone. So the ordered `gh` argv
 * list is asserted, not just the plan.
 *
 * The premium repository's config is an INJECTED LITERAL. Reading the private sibling from disk
 * would make this suite unrunnable in CI, and guarding that read with an `existsSync` skip would
 * report a broken parser as green.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

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

/** This repository's schema: one `testerSecretEnv` per CHANNEL, against an array of groups. */
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

/** The premium repository's schema: one `testerSecretEnv` per GROUP. The asymmetry is deliberate. */
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

/** A `gh` double recording every argv it is handed, optionally rejecting one `secret set` call. */
function ghDouble({ failOnSetCall = 0 } = {}) {
  const calls = [];
  let sets = 0;
  return {
    calls,
    runGh: async (args) => {
      calls.push(args);
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

// ───────────────────────────────────────────────────────────────────────────
// planRotation — the mapping
// ───────────────────────────────────────────────────────────────────────────

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

test('the plan warns that a shared secret collapses whatever prefixes the repositories hold now', () => {
  const warnings = plan().warnings;

  // `gh` cannot read a secret's value back, so this report is the ONLY place the collapse is
  // visible. Both multi-repository secrets must be named.
  assert.equal(warnings.length, 2);
  assert.ok(warnings.every((warning) => /COLLAPSES/.test(warning)));
  assert.ok(warnings.some((warning) => warning.startsWith('S3_TESTER_PATH_SECRET')));
  assert.ok(warnings.some((warning) => warning.startsWith('S3_GUILD_ARTISAN_PATH_SECRET')));
});

test('--no-premium plans this repository alone', () => {
  const { secrets } = plan({ premiumConfig: null });

  assert.deepEqual(
    secrets.map((secret) => secret.name),
    ['S3_TESTER_PATH_SECRET', 'S3_GUILD_ARTISAN_PATH_SECRET']
  );
  assert.ok(secrets.every((secret) => secret.repositories.length === 1));
});

test('a channel declaring TWO groups against one secret serves BOTH, and refuses either narrowing', () => {
  // This repository's schema resolves ONE segment per channel and applies it to every group in the
  // array, so a second group is a shared secret by construction. A plan derived from
  // `testerGroups[0]` builds a self-consistent mapping, silently never rotates the second group,
  // and passes every other case in this file.
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
      (error) => error.message.includes(unnamed) && /rotating it rotates those cohorts too/.test(error.message),
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

// ───────────────────────────────────────────────────────────────────────────
// planRotation — the refusals
// ───────────────────────────────────────────────────────────────────────────

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

test('a declared group with a missing OR EMPTY-STRING secret is refused', () => {
  // The empty-string arm is the one that matters: `''` survives `?? null`, so a nullish-only guard
  // plans a write to a secret named "" and reports it as a rotation.
  for (const testerSecretEnv of [undefined, '', '   ']) {
    assert.throws(
      () =>
        planRotation({
          fabricateConfig: { channels: { beta: { testerGroups: ['closed-beta-2026'], testerSecretEnv } } },
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

// ───────────────────────────────────────────────────────────────────────────
// runRotation — the composition
// ───────────────────────────────────────────────────────────────────────────

test('--apply writes ONE segment per secret, identical across the repositories it serves', async () => {
  const gh = ghDouble();

  const result = await runRotation({
    plan: plan(),
    apply: true,
    deps: { runGh: gh.runGh, newSegment: countingSegments(), log: () => {} },
  });

  // Read this list as three claims at once: `seg-1` twice proves a shared secret reaches both
  // repositories with the SAME value; `seg-1`/`seg-2`/`seg-3` prove the generator runs once per
  // SECRET rather than once per write; and the grouping proves the writes are group-major, so a
  // mid-run failure is bounded to one cohort.
  assert.deepEqual(gh.calls, [
    ['auth', 'status'],
    ['secret', 'set', 'S3_TESTER_PATH_SECRET', '--repo', FABRICATE, '--body', 'seg-1'],
    ['secret', 'set', 'S3_TESTER_PATH_SECRET', '--repo', PREMIUM, '--body', 'seg-1'],
    ['secret', 'set', 'S3_GUILD_ARTISAN_PATH_SECRET', '--repo', FABRICATE, '--body', 'seg-2'],
    ['secret', 'set', 'S3_GUILD_ARTISAN_PATH_SECRET', '--repo', PREMIUM, '--body', 'seg-2'],
    ['secret', 'set', 'S3_APPRENTICE_PATH_SECRET', '--repo', PREMIUM, '--body', 'seg-3'],
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
  assert.match(report, /COLLAPSES/);
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
      // The two writes that landed span a whole cohort, and that cohort has MOVED.
      assert.match(error.message, /S3_TESTER_PATH_SECRET -> mistersilver-uk\/fabricate\b/);
      assert.match(error.message, /S3_TESTER_PATH_SECRET -> mistersilver-uk\/fabricate-premium/);
      assert.ok(!error.message.includes('S3_APPRENTICE_PATH_SECRET'), 'nothing after the failure ran');
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

// ───────────────────────────────────────────────────────────────────────────
// the segment, the flags, and the deliberate absence from CI
// ───────────────────────────────────────────────────────────────────────────

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
  assert.throws(() => parseArgs(['--group']), /--group requires a value/);
  assert.throws(() => parseArgs(['--group', '--apply']), /--group requires a value/);
  assert.throws(() => parseArgs(['--premium-config']), /--premium-config requires a value/);
});

test('--help prints and rotates nothing', async () => {
  const { lines, log } = collectLog();
  const runGh = async () => assert.fail('--help must reach no gh invocation');

  assert.equal(await main({ argv: ['--help'], deps: { log, runGh } }), null);
  assert.match(lines.join('\n'), /--apply/);
});

test('the utility is absent from CI: no npm script and no workflow names it', () => {
  const { scripts } = JSON.parse(
    readFileSync(path.join(REPOSITORY_ROOT, 'package.json'), 'utf8')
  );
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
