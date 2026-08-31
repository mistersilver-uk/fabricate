/**
 * The refusals a documentation screenshot run makes, exercised.
 *
 * Every judgement in `scripts/lib/docsScreenshotRun.js` exists to stop a picture being published
 * that is not of this commit, and a refusal is invisible when it is working. That is the failure
 * mode this file exists for: while the logic lived inside `scripts/docs-screenshots.mjs` — which
 * dispatches from `process.argv` at module scope and so cannot be imported — each of the four
 * refusals could be deleted with the whole suite still green.
 *
 * WHY A SOURCE ASSERTION AT THE END
 * ---------------------------------
 * Extracting the decisions makes them testable and introduces exactly one new way to be wrong: the
 * CLI could stop asking them. Nothing else can catch that, because the CLI still cannot be
 * imported, so the last test reads it and checks that every exported judgement is named in it. That
 * is a weak check on purpose — it proves the wiring exists, not that it is right — and it is the
 * only kind available on the near side of a real render.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  consumableFrames,
  missingImageToolReason,
  publicationPlan,
  staleManifestReason,
} from '../scripts/lib/docsScreenshotRun.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Where the renderer's output goes, as the messages name it. */
const OUTPUT = 'ui-screenshot-artifact/apps';

/** A manifest shaped the way the renderer writes one. */
function manifest(head, frames, failures = []) {
  return { head, frames: frames.map((id) => ({ id, head })), failures };
}

/** A locator that finds every frame it is asked for. */
const everyFrameOnDisk = (caseId) => `/rendered/${caseId}.png`;

test('a manifest this run did not write is refused', () => {
  assert.equal(
    staleManifestReason(OUTPUT, 1000, 2000),
    null,
    'a manifest written after the renderer started is this run’s own and must be usable'
  );
  assert.equal(
    staleManifestReason(OUTPUT, undefined, 2000),
    null,
    'the first run on a clean checkout has no earlier manifest to be newer than'
  );

  // The renderer writes its manifest LAST, so a throw before its render loop — a squatted lab
  // port, no browser installed, a viewport assertion — leaves the previous run's manifest in
  // place. Its own recorded head cannot catch that, because a previous run AT THIS COMMIT wrote
  // this commit's head into it and every frame in it agrees by construction. Only the fact that
  // the file did not move can catch it.
  const unmoved = staleManifestReason(OUTPUT, 2000, 2000);
  assert.ok(
    unmoved,
    'a manifest with the same modification time as before the render was accepted as this run’s' +
      ' own. A `check` would then verify forty-six committed frames against an earlier run’s' +
      ' manifest and report that they all match a fresh render, having rendered nothing.'
  );
  assert.match(unmoved, /earlier run/);
  assert.ok(
    staleManifestReason(OUTPUT, 5000, 4000),
    'a manifest older than the one this run started with was accepted'
  );

  const absent = staleManifestReason(OUTPUT, 1000, undefined);
  assert.ok(absent, 'a missing manifest was accepted');
  assert.match(absent, /ui-screenshot-artifact\/apps/);
});

test('a frame this run did not produce is refused, four ways', () => {
  const head = 'aaaaaaa';
  const declared = ['kept', 'failed', 'unrendered', 'leftover', 'missing'];
  const rendered = {
    head,
    frames: [
      { id: 'kept', head },
      { id: 'failed', head },
      { id: 'leftover', head: 'bbbbbbb' },
      { id: 'missing', head },
    ],
    failures: [{ id: 'failed', error: 'timed out' }],
  };
  const { usable, refused } = consumableFrames(rendered, declared, (caseId) =>
    caseId === 'missing' ? null : `/rendered/${caseId}.png`
  );

  assert.deepEqual([...usable.keys()], ['kept']);
  assert.equal(usable.get('kept'), '/rendered/kept.png');
  assert.deepEqual(refused, [
    'failed: the renderer reported a failure for it',
    'unrendered: this run rendered no frame for it',
    'leftover: its frame is left over from bbbbbbb, not this run',
    'missing: the manifest lists it but its frame is not on disk',
  ]);
});

test('a manifest that cannot say what it was rendered at is refused whole', () => {
  assert.throws(
    () => consumableFrames({ frames: [{ id: 'one' }] }, ['one'], everyFrameOnDisk),
    /cannot be told from one this run produced/,
    'without a head, a leftover frame and a fresh one are indistinguishable, so nothing in the' +
      ' manifest may be published'
  );
});

test('an absent libwebp tool is named rather than worked around', () => {
  assert.equal(
    missingImageToolReason([
      ['cwebp', '/usr/bin/cwebp'],
      ['dwebp', '/usr/bin/dwebp'],
    ]),
    null
  );
  assert.match(
    missingImageToolReason([
      ['cwebp', '/usr/bin/cwebp'],
      ['dwebp', null],
    ]),
    /^dwebp is not on PATH/,
    'the decoder is required even by a run that encodes nothing: without it the only available' +
      ' comparison is byte equality, which this renderer’s own jitter fails'
  );
  assert.match(
    missingImageToolReason([
      ['cwebp', null],
      ['dwebp', null],
    ]),
    /^cwebp and dwebp are not on PATH/
  );
});

test('a partial run does not stamp its toolchain over the frames it never rendered', () => {
  const verdicts = [
    { entry: { case: 'one' }, state: 'changed' },
    { entry: { case: 'two' }, state: 'unchanged' },
    { entry: { case: 'three' }, state: 'absent' },
  ];

  const whole = publicationPlan(verdicts, []);
  assert.deepEqual(
    whole.rewrite.map((verdict) => verdict.entry.case),
    ['one', 'three'],
    'an unchanged frame must not be rewritten, and a frame with no committed image must be'
  );
  assert.equal(whole.untouched, 1);
  assert.equal(whole.stampProvenance, true);
  assert.equal(whole.provenanceNote, null);
  assert.equal(whole.exitCode, 0);

  const partial = publicationPlan(verdicts, ['four: the renderer reported a failure for it']);
  assert.equal(
    partial.stampProvenance,
    false,
    'a run that refused a case still stamped the provenance header, certifying every frame beside' +
      ' it — including the ones it never rendered — as the work of this toolchain. The drift' +
      ' report that exists to catch exactly that would then go quiet about them forever.'
  );
  assert.match(partial.provenanceNote, /1 case\(s\) were not produced by this run/);
  assert.equal(partial.exitCode, 1);
  assert.deepEqual(
    partial.rewrite.map((verdict) => verdict.entry.case),
    ['one', 'three'],
    'the frames this run DID produce are still published; refusing them too would make one failed' +
      ' case block every other frame, which is churn rather than safety'
  );
});

test('the command shell still asks every one of these', () => {
  const shell = readFileSync(join(root, 'scripts/docs-screenshots.mjs'), 'utf8');
  for (const judgement of [
    'staleManifestReason',
    'consumableFrames',
    'missingImageToolReason',
    'publicationPlan',
  ]) {
    assert.ok(
      shell.includes(`${judgement}(`),
      `scripts/docs-screenshots.mjs no longer calls ${judgement}. The tests above would keep` +
        ' passing while the run itself stopped refusing anything, which is the arrangement this' +
        ' extraction was meant to end.'
    );
  }
});
