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

// Tester-group identity is deployment configuration, and early-access is published only from
// `release` — so a promotion dispatched from `main` can evaluate a prefix no publish has written
// (issue #1872). The guard diagnoses that, and hangs the remedy on the refusal it explains.
test('the guard reads the publisher ref config and extends the absent-head refusal with the drift remedy', () => {
  const guard = parseJobs(readFileSync(WORKFLOW, 'utf8')).guard;

  const captureIndex = guard.steps.findIndex((step) =>
    /git show origin\/release:release\.s3\.config\.json/.test(step.run)
  );
  assert.notEqual(captureIndex, -1, "no step reads origin/release's own release.s3.config.json");
  const capture = guard.steps[captureIndex];
  assert.match(
    capture.run,
    /git fetch origin ["']?\+?refs\/heads\/release/,
    'origin/release must be fetched before it is read — a checkout does not guarantee the ref'
  );
  const written = /> "\$RUNNER_TEMP\/([\w.-]+)"/.exec(capture.run);
  assert.ok(written, 'the publisher config must be written under $RUNNER_TEMP, not the checkout');

  const checksIndex = guard.steps.findIndex((step) => step.id === 'checks');
  assert.ok(captureIndex < checksIndex, 'the capture must precede the step that reads it');

  const checks = guard.steps[checksIndex];
  assert.ok(
    String(checks.env.PUBLISHER_CONFIG ?? '').endsWith(`/${written[1]}`),
    `the guard reads ${checks.env.PUBLISHER_CONFIG}, but the capture writes ${written[1]}`
  );
  assert.match(checks.env.PUBLISHER_CONFIG, /\$\{\{\s*runner\.temp\s*\}\}/);
  assert.match(checks.run, /process\.env\.PUBLISHER_CONFIG/);
  assert.match(
    checks.run,
    /evaluateTesterConfigDrift/,
    'the guard must import and call the shared drift diagnosis, not restate it inline'
  );

  const flat = checks.run.replace(/\s+/g, ' ');
  assert.match(flat, /console\.warn\(`::warning::\$\{drift\.summary\}`\)/, 'drift must be logged');
  // A drift-driven refusal of its own would block every promotion made while two refs legitimately
  // disagree. Drift is a diagnosis: it explains why an early-access head is absent.
  assert.ok(!/fail\(drift\./.test(flat), 'configuration drift must never refuse on its own');
  for (const conjunct of [/verdict\.kind === 'absent'/, /channel === 'early-access'/, /drift\.drifted/]) {
    assert.match(flat, conjunct, 'the remedy is hung on the absent-head early-access refusal only');
  }
  assert.match(
    flat,
    /fail\(verdict\.reason \+ /,
    'the remedy must EXTEND the registry-lead refusal, not replace the reason it explains'
  );
  assert.match(flat, /drift\.remedy/);

  // The diagnosis is advisory, so a malformed publisher config must not hard-fail the guard: the
  // parse falls back to an empty declaration and says so.
  assert.match(
    flat,
    /try \{ publisherConfig = JSON\.parse\(await readFile\(process\.env\.PUBLISHER_CONFIG, 'utf8'\)\); \} catch/,
    'an unparseable publisher config would refuse the promotion outright'
  );
  assert.match(flat, /catch \(error\) \{ console\.log\( `::notice::/);
});
