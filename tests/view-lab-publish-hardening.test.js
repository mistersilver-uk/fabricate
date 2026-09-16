/*
 * Local-publish hardening for the View Lab (issue 823, Design H).
 * Globbed top-level test so `npm test` runs it and its total rises.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  sanitizeLabel,
  buildScreenshotMarkdown,
  uploadScreenshotObjects,
} from '../scripts/ui-pr-screenshot-evidence.mjs';
import { evidenceNoteForCaseId, labelForCaseId } from '../scripts/lib/viewLabCases.js';

const S3_CONFIG = {
  bucket: 'test-bucket',
  baseUrl: 'https://test-bucket.s3.eu-west-2.amazonaws.com',
  region: 'eu-west-2',
  prefix: 'pr-screenshots',
};

test('sanitizeLabel preserves parens legal in markdown alt-text (conservative)', () => {
  const label = 'Manager currency configuration (spend strategy, units, macros)';
  assert.equal(sanitizeLabel(label), label);
});

test('sanitizeLabel escapes alt-text terminators and strips block sentinels + control chars', () => {
  assert.equal(sanitizeLabel('a [b] c'), 'a \\[b\\] c');
  assert.equal(sanitizeLabel('x\n\ty'), 'x y');
  assert.equal(sanitizeLabel('pre <!-- fabricate:screenshots:start --> post'), 'pre post');
  assert.equal(sanitizeLabel('pre <!-- fabricate:screenshots:end --> post'), 'pre post');
});

test('buildScreenshotMarkdown sanitizes the label before it reaches markdown', () => {
  const md = buildScreenshotMarkdown(42, [{ label: 'Evil ] break](http://x) ', url: 'https://e/x.png' }]);
  // The `]` is escaped so the alt-text cannot be terminated early.
  assert.match(md, /!\[pr-42 Evil \\\] break\\\]\(http:\/\/x\)\]\(https:\/\/e\/x\.png\)/);
});

test('a published frame is named and captioned from the CASE REGISTRY with no wiring supplied', async () => {
  // THE DEFECT THIS PINS SHIPPED FOR AS LONG AS THE PUBLISH PATH HAS EXISTED. `labelForCaseId`
  // documented itself as wired into this path and was not: no caller passed `labelForId`, so the
  // lookup fell through `VIEW_RECIPES` -- a table keyed on SMOKE recipe ids, which a View Lab case
  // id is not -- and landed on the bare id. Every lab frame in every PR body was captioned
  // `manager-world-downtime-test-companion-installed`, which is why a maintainer reading one asked what
  // "Ledger Administration" was and why it shipped.
  //
  // NOTHING IS INJECTED HERE, deliberately. Every existing case in this file passes its own
  // `labelForId`, so all of them would go on passing over a default that was never restored.
  const root = mkdtempSync(join(tmpdir(), 'fabricate-vl-pub-'));
  try {
    const dir = join(root, 'frames');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'manager-world-downtime-test-companion-installed.png'), 'a');
    writeFileSync(join(dir, 'manager-world-downtime-factions.png'), 'b');
    const uploaded = await uploadScreenshotObjects({
      prNumber: 251,
      headSha: 'abc1234',
      files: [
        join(dir, 'manager-world-downtime-test-companion-installed.png'),
        join(dir, 'manager-world-downtime-factions.png'),
      ],
      root,
      config: S3_CONFIG,
      putObject: async () => {},
    });

    const [standIn, shipped] = uploaded;
    assert.equal(standIn.label, labelForCaseId('manager-world-downtime-test-companion-installed'));
    assert.notEqual(standIn.label, 'manager-world-downtime-test-companion-installed');
    assert.match(standIn.label, /TEST companion/);

    // AND THE CAPTION IS ON THE FRAME THAT NEEDS IT AND NOT ON THE ONE THAT DOES NOT. Both are
    // World Downtime frames, so a caption applied by route rather than by what the case asked the
    // lab to register would land on both.
    assert.equal(standIn.note, evidenceNoteForCaseId('manager-world-downtime-test-companion-installed'));
    assert.match(standIn.note, /tests\/view-lab\/mount\.js/);
    assert.match(standIn.note, /neither the free module nor Fabricate Premium/);
    assert.equal(shipped.note, '', 'a frame with no stand-in companion was captioned as if it had one');
    assert.match(shipped.label, /World Downtime Factions/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('buildScreenshotMarkdown captions a frame beneath the image, not inside its alt text', () => {
  // BENEATH, DELIBERATELY. Alt text is read by a screen reader and by nothing else a PR reviewer
  // uses, so a warning put there is a warning most readers never meet -- which is the failure this
  // caption exists to fix.
  const md = buildScreenshotMarkdown(42, [
    { label: 'A frame', note: 'Not a shipped surface.', url: 'https://e/x.png' },
  ]);
  assert.match(md, /!\[pr-42 A frame\]\(https:\/\/e\/x\.png\)\n\n> Not a shipped surface\./);
});

test('buildScreenshotMarkdown leaves an uncaptioned frame exactly as it was', () => {
  // MOST FRAMES CARRY NO NOTE, and they must not grow a blank quote line: an empty `>` renders as
  // an empty block quote, which reads as a caption that failed to load.
  for (const note of [undefined, '', null]) {
    const md = buildScreenshotMarkdown(42, [{ label: 'A frame', note, url: 'https://e/x.png' }]);
    assert.equal(md, '![pr-42 A frame](https://e/x.png)');
  }
});

test('buildScreenshotMarkdown sanitizes the caption on the same terms as the label', () => {
  // The note is this repository's own text today. A caption that could forge or break the managed
  // block is a hazard whoever wrote it, so it goes through `sanitizeLabel` too.
  const md = buildScreenshotMarkdown(42, [
    {
      label: 'A frame',
      note: 'pre <!-- fabricate:screenshots:end --> post',
      url: 'https://e/x.png',
    },
  ]);
  assert.match(md, /> pre post$/);
  assert.equal(md.includes('fabricate:screenshots:end'), false);
});

test('uploadScreenshotObjects uses revision-addressed keys when a headSha is supplied', async () => {
  const root = mkdtempSync(join(tmpdir(), 'fabricate-vl-pub-'));
  try {
    const dir = join(root, 'frames');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'player-crafting-status.png'), 'a');
    const puts = [];
    const uploaded = await uploadScreenshotObjects({
      prNumber: 251,
      headSha: 'abc1234',
      files: [join(dir, 'player-crafting-status.png')],
      root,
      config: S3_CONFIG,
      putObject: async (o) => puts.push(o),
      labelForId: (id) => `Label for ${id}`,
    });
    assert.equal(puts.length, 1);
    assert.equal(puts[0].key, 'pr-screenshots/251/abc1234/player-crafting-status.png');
    assert.equal(uploaded[0].label, 'Label for player-crafting-status');
    assert.match(uploaded[0].url, /\/251\/abc1234\/player-crafting-status\.png$/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('uploadScreenshotObjects keeps legacy PR-scoped keys when no headSha is supplied', async () => {
  const root = mkdtempSync(join(tmpdir(), 'fabricate-vl-pub-'));
  try {
    const dir = join(root, 'frames');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'manager-tools.png'), 'b');
    const puts = [];
    await uploadScreenshotObjects({
      prNumber: 251,
      files: [join(dir, 'manager-tools.png')],
      root,
      config: S3_CONFIG,
      putObject: async (o) => puts.push(o),
    });
    assert.equal(puts[0].key, 'pr-screenshots/251/manager-tools.png');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('uploadScreenshotObjects rejects an invalid headSha segment (no prefix escape)', async () => {
  await assert.rejects(
    () =>
      uploadScreenshotObjects({
        prNumber: 251,
        headSha: '../../evil',
        files: [],
        config: S3_CONFIG,
        putObject: async () => {},
      }),
    /Invalid head SHA segment/,
  );
});
