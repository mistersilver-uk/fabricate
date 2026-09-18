import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { parseJobs } from './helpers/workflow-source.js';

const WORKFLOW = '.github/workflows/promote-to-public.yml';

// A release stays a DRAFT for its whole private life: semantic-release drafts it on the release
// line, early access publishes it, and the promotion's job 4 un-drafts it as the last irreversible
// step.
test('every promote-to-public job that reads the release can SEE a draft', () => {
  const jobs = parseJobs(readFileSync(WORKFLOW, 'utf8'));
  const readsARelease = /gh release (?:view|download|edit) /;
  const readers = Object.entries(jobs).filter(([, job]) =>
    job.steps.some((step) => readsARelease.test(step.run))
  );

  // Non-vacuity: the sweep must match something, and it must match the guard, whose whole purpose
  // is to fail EARLY on a missing draft.
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
// exceeds it Node SIGTERMs the child and throws ENOBUFS.
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

// The Foundry package listing dropped the `v` after v1.2.1 (issue #1462 / #1490).
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
