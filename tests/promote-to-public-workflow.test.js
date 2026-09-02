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

// The Foundry package listing showed 1.9.0, 1.9.1 and 1.9.2 without their `v` prefix (issue #1457)
// because ONE value served two masters: the registry payload's `version` field and the `v${...}` tag
// URLs. Bare gave a correct URL and a bare display version; prefixing it would have produced
// `vv1.9.3`. The artefact is now the source of truth for what is advertised, and the URLs keep using
// the bare input.
test('the registry advertises the ARTEFACT version, while the URLs are built from the bare input', () => {
  const source = readFileSync(WORKFLOW, 'utf8');

  assert.match(
    source,
    /--arg version "\$BUILT_VERSION"/,
    'the registry payload must advertise the version the artefact itself carries, so the string Foundry offers and the string an installed module.json reports cannot drift'
  );
  assert.ok(
    !/--arg version "\$VERSION"/.test(source),
    'the payload must not advertise the dispatch input: it is bare by contract, so it would strip a prefix the artefact carries'
  );

  // The tag is `v` plus the bare version, so the URLs must interpolate the input rather than the
  // artefact's version — otherwise a prefixed artefact yields `vv1.9.3` and a manifest URL that 404s.
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
    'no URL may interpolate the artefact version behind a literal v — that is the vv1.9.3 defect'
  );

  // The guard still establishes "this artefact is the version being promoted", but comparing the
  // bare forms so the release line can start carrying a prefix without a lockstep change here.
  assert.match(
    source,
    /if \[ "\$\{BUILT_VERSION#v\}" != "\$VERSION" \]; then/,
    'the artefact-matches-input guard must compare the two after normalising the built side'
  );
});
