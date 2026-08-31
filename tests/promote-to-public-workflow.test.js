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
