import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { parseJobs } from './helpers/workflow-source.js';

const WORKFLOW = '.github/workflows/promote-to-public.yml';

// A release stays a DRAFT for its whole private life: semantic-release drafts it on the release
// line, early access publishes it, and the promotion's job 4 un-drafts it as the last irreversible
// step. GitHub exposes a draft release only to a token with push access, so a job that reads one
// needs `contents: write` — a read-scoped GITHUB_TOKEN gets a plain 404, which is indistinguishable
// from "the release does not exist" and fails the promotion on a release that is present and
// correct. `release.yml`'s assetless-draft assertion documents the same rule at the point the draft
// is minted. This is the defect that failed the first-ever public promotion: the guard asserted the
// draft existed while holding `contents: read`, so no version could ever be promoted.
test('every promote-to-public job that reads the release can SEE a draft', () => {
  const jobs = parseJobs(readFileSync(WORKFLOW, 'utf8'));
  const readsARelease = /gh release (?:view|download|edit) /;
  const readers = Object.entries(jobs).filter(([, job]) =>
    job.steps.some((step) => readsARelease.test(step.run))
  );

  // Non-vacuity: the sweep must match something, and it must match the guard, whose whole purpose is
  // to fail EARLY on a missing draft. A guard that stopped asserting the draft would leave the
  // permission check below trivially true by giving it nothing to check.
  assert.ok(readers.length > 0, 'no job reads a release — the sweep matched nothing');
  assert.ok(
    readers.some(([name]) => name === 'guard'),
    'the guard must still assert the draft exists before anything is published'
  );

  for (const [name, job] of readers) {
    assert.equal(
      job.permissions.contents,
      'write',
      `job '${name}' reads a release with the GitHub CLI but holds contents: '${job.permissions.contents}' — a draft is invisible to a read-scoped token`
    );
  }
});

// Node's `execSync` buffers the child's whole stdout and defaults to 1 MiB, and when a child
// exceeds it Node SIGTERMs the child and throws ENOBUFS. A paginated `gh api` listing is exactly
// the call that outgrows that default silently: the promotion's notes aggregation reads every
// release with its full changelog body, which measured 1,286,324 bytes at 190 releases and grows
// with each one. That failed the first real promotion of v1.9.0 two steps before the un-draft. The
// buffer therefore has to be stated, not inherited.
//
// This matches PER LINE, which is deliberate: the call is one line, and a reformat that split it
// across lines would make the check pass by matching nothing. The non-vacuity assertion below is
// what turns that into a loud failure instead of a quiet one.
test('a paginated gh api call buffered through execSync states its own maxBuffer', () => {
  const source = readFileSync(WORKFLOW, 'utf8');
  const paginatedExecSync = source
    .split('\n')
    .filter((line) => line.includes('execSync(') && line.includes('--paginate'));

  assert.ok(
    paginatedExecSync.length > 0,
    'no single-line execSync of a paginated gh api call was found — if one was reformatted across lines, this check can no longer see it'
  );

  for (const line of paginatedExecSync) {
    assert.match(
      line,
      /maxBuffer:/,
      `a paginated gh api call is buffered through execSync without an explicit maxBuffer, so it dies with ENOBUFS once the listing passes 1 MiB: ${line.trim()}`
    );
  }
});

// The Foundry package listing dropped the `v` after v1.2.1 (issue #1462 / #1490). v1.2.1's own
// module.json says `1.2.1` while its listing reads `v1.2.1`, so the prefix was never in the manifest
// — it is PRESENTATION, and the registry payload is the one place it belongs.
//
// Issue 1407 put it in module.json instead and 1457 then made this payload read the artefact, which
// coupled them: `release-s3.js` compares the built manifest against the requested version, so every
// publish after that refused (`version mismatch: requested 1.9.3 built v1.9.3`), stranding v1.9.3
// and three betas. These assertions pin the separation that keeps both correct.
test('the registry payload constructs the v, and never re-derives it from the artefact', () => {
  const source = readFileSync(WORKFLOW, 'utf8');

  assert.match(
    source,
    /--arg version "v\$\{VERSION\}"/,
    'the payload must BUILD the display version from the bare input, so the manifest need not carry a prefix'
  );
  assert.ok(
    !/--arg version "\$BUILT_VERSION"/.test(source),
    'reading the artefact couples the advertised version to the manifest, which is what broke every publish after #1407'
  );

  // The tag is `v` plus the bare version, so the URLs interpolate the input. `v${BUILT_VERSION}`
  // would be `vv1.9.3` the moment anything reintroduced a prefix into the manifest.
  for (const url of [
    /releases\/download\/v\$\{VERSION\}\/module\.json/,
    /releases\/tag\/v\$\{VERSION\}/,
  ]) {
    assert.match(
      source,
      url,
      'the manifest and notes URLs must be built from the BARE dispatch input'
    );
  }
  assert.ok(
    !/v\$\{BUILT_VERSION\}/.test(source),
    'no URL may interpolate the artefact version behind a literal v'
  );

  // The manifest is bare again, so this is a literal identity check.
  assert.match(
    source,
    /if \[ "\$BUILT_VERSION" != "\$VERSION" \]; then/,
    'the artefact IS the version being promoted, compared literally now the manifest carries no prefix'
  );
});
