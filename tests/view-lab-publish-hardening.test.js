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
