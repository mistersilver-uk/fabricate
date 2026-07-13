import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  BETA_TAG_RE,
  STABLE_TAG_RE,
  parseReleaseTag,
  validateReleaseTag
} from '../scripts/lib/releaseTags.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(ROOT, 'scripts', 'validate-release-tag.mjs');

/** [tag, expected parse or null, why]. */
const PARSE_CASES = [
  [
    'v1.4.0-beta.3',
    {
      tag: 'v1.4.0-beta.3',
      version: '1.4.0-beta.3',
      base: '1.4.0',
      kind: 'beta',
      prerelease: 'beta'
    },
    'the post-cutover prerelease tag the retired RC regex rejected'
  ],
  [
    'v1.0.0-rc.85',
    { tag: 'v1.0.0-rc.85', version: '1.0.0-rc.85', base: '1.0.0', kind: 'beta', prerelease: 'rc' },
    'transitional: rc tags stay valid until the Phase 2 cutover'
  ],
  [
    'v1.4.0',
    { tag: 'v1.4.0', version: '1.4.0', base: '1.4.0', kind: 'stable', prerelease: null },
    'a promoted public release tag'
  ],
  [
    'v0.0.0-beta.0',
    {
      tag: 'v0.0.0-beta.0',
      version: '0.0.0-beta.0',
      base: '0.0.0',
      kind: 'beta',
      prerelease: 'beta'
    },
    'a bare zero is a legal numeric identifier — only LEADING zeros are not'
  ],
  ['1.4.0', null, 'a bare version is not a tag'],
  ['v1.4', null, 'a partial version is not a tag'],
  ['v1.4.0-beta', null, 'a prerelease needs its number'],
  ['v1.4.0-beta.3.1', null, 'no extra prerelease parts'],
  ['v1.4.0-alpha.1', null, 'alpha is not a channel we mint'],
  ['v1.4.0-rc.1-rc.1', null, 'no trailing junk'],
  ['xv1.4.0', null, 'anchored at the start'],
  ['v1.4.0\n', null, 'anchored at the end — a trailing newline is not stripped for you'],

  // Leading zeros. These tags are typed BY HAND into a workflow_dispatch box, so a typo that
  // validates clean here goes on to mint a permanent tag (and, in promote-release, a public
  // GitHub release). SemVer's numeric identifier is (0|[1-9]\d*), never \d+.
  ['v1.04.0', null, 'a leading zero in the minor is a typo, not a version'],
  ['v01.4.0', null, 'a leading zero in the major is a typo, not a version'],
  ['v1.4.007', null, 'a leading zero in the patch is a typo, not a version'],
  ['v1.4.0-beta.03', null, 'a leading zero in the prerelease number too'],

  [undefined, null, 'a non-string is not a tag'],
  [null, null, 'a non-string is not a tag']
];

for (const [tag, expected, why] of PARSE_CASES) {
  test(`parseReleaseTag(${JSON.stringify(tag)}) — ${why}`, () => {
    assert.deepEqual(parseReleaseTag(tag), expected);
  });
}

test('parseReleaseTag strips the v so a tag can never reach a version comparator', () => {
  for (const [tag] of PARSE_CASES) {
    const parsed = parseReleaseTag(tag);
    if (!parsed) continue;
    assert.equal(parsed.version.startsWith('v'), false);
    assert.equal(parsed.tag, tag);
  }
});

/** [tag, kind, expected ok]. */
const VALIDATE_CASES = [
  ['v1.4.0-beta.3', 'beta', true],
  ['v1.0.0-rc.85', 'beta', true],
  ['v1.4.0', 'beta', false],
  ['v1.4.0', 'stable', true],
  ['v1.4.0-beta.3', 'stable', false],
  ['v1.0.0-rc.85', 'stable', false],
  ['v1.4.0-beta.3', 'any', true],
  ['v1.0.0-rc.85', 'any', true],
  ['v1.4.0', 'any', true],
  ['nonsense', 'any', false],
  ['nonsense', 'beta', false]
];

for (const [tag, kind, expected] of VALIDATE_CASES) {
  test(`validateReleaseTag(${JSON.stringify(tag)}, '${kind}').ok === ${expected}`, () => {
    const result = validateReleaseTag(tag, kind);
    assert.equal(result.ok, expected);
    if (expected) assert.equal(result.version, tag.slice(1));
    else assert.match(result.error, /\S/);
  });
}

test('validateReleaseTag defaults to the any kind', () => {
  assert.equal(validateReleaseTag('v1.4.0').ok, true);
  assert.equal(validateReleaseTag('v1.4.0-beta.3').ok, true);
});

test('validateReleaseTag throws on an unknown kind — a caller bug is never a valid tag', () => {
  assert.throws(() => validateReleaseTag('v1.4.0', 'rc'), TypeError);
  assert.throws(() => validateReleaseTag('v1.4.0', 'early-access'), TypeError);
});

test('the exported patterns are anchored and mutually exclusive', () => {
  assert.equal(BETA_TAG_RE.test('v1.4.0'), false);
  assert.equal(STABLE_TAG_RE.test('v1.4.0-beta.3'), false);
  assert.equal(BETA_TAG_RE.global, false, 'a global flag would make .test() stateful');
  assert.equal(STABLE_TAG_RE.global, false, 'a global flag would make .test() stateful');
});

test('the promotion target is derived by the parser, never by stripping -rc.N by hand', () => {
  // promote-release.yml builds `gh release create v${BASE} --latest` from this. A kind-specific
  // strip would leave BASE as `1.4.0-beta.3` and publish a permanent public garbage release.
  assert.equal(parseReleaseTag('v1.0.0-rc.85').base, '1.0.0');
  assert.equal(parseReleaseTag('v1.4.0-beta.3').base, '1.4.0');
  assert.equal(parseReleaseTag('v1.4.0').base, '1.4.0');
});

/**
 * The CLI is what the workflows actually run, straight after `actions/checkout` and BEFORE
 * `npm ci` — so it must stay zero-dependency, and its exit codes are the contract.
 */
const runCli = (args, input = '') =>
  spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', input });

/** [args, expected exit code, why]. */
const CLI_CASES = [
  [['v1.0.0-rc.85', '--kind', 'beta'], 0, 'todays rc tags still pass the beta gate'],
  [['v1.4.0-beta.3', '--kind', 'beta'], 0, 'tomorrows beta tags pass the same gate'],
  [['v1.4.0', '--kind', 'beta'], 1, 'a stable tag is not a beta tag'],
  [['v1.4.0', '--kind', 'stable'], 0, 'a stable tag passes the stable gate'],
  [['v1.4.0-beta.3', '--kind', 'any'], 0, 'any accepts a prerelease tag'],
  [['v1.4.0', '--kind', 'any'], 0, 'any accepts a stable tag'],
  [['v1.4.0-beta.3'], 0, 'the kind defaults to any'],
  [['v1.04.0', '--kind', 'stable'], 1, 'a hand-typed leading zero is refused'],
  [['nonsense', '--kind', 'any'], 1, 'garbage is refused'],
  [['', '--kind', 'beta'], 1, 'an EMPTY workflow_dispatch input is a bad tag, not a bad call'],
  [['v1.4.0', '--kind', 'nonsense'], 2, 'an unknown kind is a usage error, not a valid tag'],
  [['v1.4.0', '--print', 'nonsense'], 2, 'an unknown print field is a usage error too'],
  [['v1.4.0', '--kind'], 2, 'a flag with no value is a usage error'],
  [[], 2, 'no tag at all is a usage error']
];

for (const [args, code, why] of CLI_CASES) {
  test(`validate-release-tag ${args.join(' ')} exits ${code} — ${why}`, () => {
    const result = runCli(args);
    assert.equal(result.status, code, result.stderr);
  });
}

/** [field, expected stdout] for `v1.4.0-beta.3`. */
const PRINT_CASES = [
  ['version', '1.4.0-beta.3'],
  ['base', '1.4.0'],
  ['tag', 'v1.4.0-beta.3']
];

for (const [field, expected] of PRINT_CASES) {
  test(`the CLI prints --print ${field} as '${expected}' so a workflow can capture it`, () => {
    const result = runCli(['v1.4.0-beta.3', '--kind', 'beta', '--print', field]);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), expected);
  });
}

test('the CLI prints the bare version by default — never the tag', () => {
  assert.equal(runCli(['v1.4.0-beta.3', '--kind', 'beta']).stdout.trim(), '1.4.0-beta.3');
});

test('--filter echoes only the valid tags and always exits 0', () => {
  const tags = ['v1.0.0-rc.85', 'v1.4.0-beta.3', 'v1.4.0', 'v1.4.0-alpha.1', '', 'garbage'];
  const result = runCli(['--filter', '--kind', 'beta'], `${tags.join('\n')}\n`);

  assert.equal(result.status, 0);
  assert.deepEqual(result.stdout.trim().split('\n'), ['v1.0.0-rc.85', 'v1.4.0-beta.3']);
});

test('--filter exits 0 with no output when nothing matches (no new tag at HEAD)', () => {
  const result = runCli(['--filter', '--kind', 'beta'], 'v1.4.0\n');

  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), '');
});

test('--filter --kind stable echoes only the promoted tags', () => {
  const tags = ['v1.4.0', 'v1.4.0-beta.3', 'v1.5.0', 'v1.0.0-rc.85'];
  const result = runCli(['--filter', '--kind', 'stable'], `${tags.join('\n')}\n`);

  assert.equal(result.status, 0);
  assert.deepEqual(result.stdout.trim().split('\n'), ['v1.4.0', 'v1.5.0']);
});

test('--filter fails EAGERLY on a bad --kind, before it reads stdin', () => {
  // The kind used to be checked lazily, per input line — and the normal case is EMPTY stdin (no
  // new tag at HEAD), so a typo'd kind had no line to fail on and exited 0 reporting "no tags".
  // Combined with the pipe (`… | node … | sort`), which only fails the step under `shell: bash`'s
  // pipefail, that is a green run that mints a tag and publishes nothing to S3.
  const result = runCli(['--filter', '--kind', 'betaa'], '');

  assert.equal(result.status, 2);
  assert.match(result.stderr, /Unknown release tag kind/);
});

test('--quiet suppresses the failure annotation but keeps the exit code', () => {
  const result = runCli(['v1.4.0', '--kind', 'beta', '--quiet']);

  assert.equal(result.status, 1);
  assert.equal(result.stderr.trim(), '');
});
