/**
 * `tests/view-lab/world/smokeSeed.js` is a VERBATIM COPY of the live smoke's execution-fixture
 * seed — the ~985-line block in `scripts/foundry-test-run.mjs` that builds the smoke world's
 * crafting systems, components, recipes, tools and inventories through the real Fabricate API.
 *
 * It is copied rather than imported because `foundry-test-run.mjs` is a browser-context script Node
 * cannot import, and this is the only part of it the View Lab needs. A copy that drifts is worse
 * than no copy: the lab would render a world the smoke no longer has, while still claiming a
 * frame-for-frame comparison. This test is what stops that.
 *
 * When the harness's seed legitimately changes, re-extract the copy and update the digest in the
 * same commit — the diff is then visible to a reviewer rather than implied.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { SMOKE_SEED_DIGEST } from './view-lab/world/smokeSeed.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HARNESS = resolve(ROOT, 'scripts/foundry-test-run.mjs');
const COPY = resolve(ROOT, 'tests/view-lab/world/smokeSeed.js');

const BEGIN = '  // ── BEGIN VERBATIM COPY ─────────────────────────────────────────────────────';
const END = '  // ── END VERBATIM COPY ───────────────────────────────────────────────────────';

/** Slice the seed body out of the harness, the same way the extractor did. */
function harnessSeedBody() {
  const lines = readFileSync(HARNESS, 'utf8').split('\n');
  const start = lines.findIndex((l) => l.includes('return await page.evaluate(async ({ arcaneSystemId'));
  assert.notEqual(start, -1, 'the execution-fixture seed is no longer where the extractor found it');
  const end = lines.findIndex((l, i) => i > start && l === '  }, {');
  assert.notEqual(end, -1, 'could not find the end of the seed body in the harness');
  return lines.slice(start + 1, end).join('\n');
}

/** Slice the copied body out of the lab module. */
function copiedSeedBody() {
  const text = readFileSync(COPY, 'utf8');
  const start = text.indexOf(BEGIN);
  const end = text.indexOf(END);
  assert.notEqual(start, -1, 'the copy has lost its BEGIN marker');
  assert.notEqual(end, -1, 'the copy has lost its END marker');
  return text.slice(start + BEGIN.length + 1, end);
}

test('the recorded digest matches the harness seed', () => {
  const actual = createHash('sha256').update(harnessSeedBody()).digest('hex');
  assert.equal(
    actual,
    SMOKE_SEED_DIGEST,
    'The live smoke\'s execution-fixture seed has changed since the View Lab copied it.\n' +
      'Re-extract the copy and update SMOKE_SEED_DIGEST in the same commit, so the diff is reviewable:\n' +
      '  the View Lab would otherwise keep rendering a world the smoke no longer seeds.'
  );
});

test('the copied body is byte-identical to the harness seed', () => {
  // The digest alone would catch this, but comparing the text gives a reviewer the actual diff
  // rather than two hex strings.
  assert.equal(
    copiedSeedBody().trimEnd(),
    harnessSeedBody().trimEnd(),
    'tests/view-lab/world/smokeSeed.js has diverged from the harness block it copies'
  );
});

test('the copy is a copy, not an edit', () => {
  const text = readFileSync(COPY, 'utf8');
  assert.match(text, /COPIED, NOT WRITTEN/, 'the copy must say plainly that it is one');
  assert.match(text, /export const SMOKE_SEED_DIGEST/, 'the copy must carry its digest');
  assert.match(
    text,
    /Source: scripts\/foundry-test-run\.mjs lines \d+-\d+/,
    'the copy must record where it came from'
  );
});
