/** The PR capture's shard plan and merge. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  CASES_PER_SHARD,
  MAX_CAPTURE_SHARDS,
  mergeShardManifests,
  renderMatrix,
  shardCountFor,
  sliceSelection,
} from '../scripts/lib/viewLabShards.js';
import { publishableCases } from '../scripts/lib/viewLabCases.js';

const plain = (count, prefix = 'case') =>
  Array.from({ length: count }, (_, index) => ({ id: `${prefix}-${String(index).padStart(3, '0')}` }));

test('a small selection renders on one runner, and an empty one on none', () => {
  assert.equal(shardCountFor(0), 0);
  assert.equal(shardCountFor(1), 1);
  assert.equal(shardCountFor(CASES_PER_SHARD), 1);
  assert.equal(shardCountFor(CASES_PER_SHARD + 1), 2);
  assert.equal(shardCountFor(10_000), MAX_CAPTURE_SHARDS);
  // Sized so a selection like the 357 frames that prompted sharding runs as twelve shards of
  // about 30: a runner's setup is about 40 seconds, so rendering is what a shard must keep short.
  assert.equal(shardCountFor(357), 12);
  assert.ok(Math.max(...sliceSelection(plain(357), 12).map((slice) => slice.length)) <= 30);
  assert.deepEqual(sliceSelection(plain(12), shardCountFor(12)), [plain(12).map(({ id }) => id)]);
  assert.deepEqual(sliceSelection([], 4), []);
});

test('every case lands in exactly one slice, slices are balanced, and each keeps selection order', () => {
  const cases = plain(357);
  const slices = sliceSelection(cases, shardCountFor(cases.length));

  assert.equal(slices.length, MAX_CAPTURE_SHARDS);
  assert.deepEqual(slices.flat().sort(), cases.map(({ id }) => id).sort());
  const sizes = slices.map((slice) => slice.length);
  assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1, `unbalanced: ${sizes.join(', ')}`);
  const order = new Map(cases.map(({ id }, index) => [id, index]));
  for (const slice of slices) {
    const positions = slice.map((id) => order.get(id));
    assert.deepEqual(positions, [...positions].sort((left, right) => left - right));
  }
});

test('the plan is a pure function of the selection', () => {
  const cases = plain(200);
  assert.deepEqual(sliceSelection(cases, 4), sliceSelection([...cases], 4));
});

test('every member of a distinct-evidence group renders on the same runner', () => {
  const cases = [
    ...plain(5, 'lead'),
    { id: 'g-first', distinctEvidenceGroup: 'g' },
    ...plain(5, 'middle'),
    { id: 'g-second', distinctEvidenceGroup: 'g' },
    { id: 'h-first', distinctEvidenceGroup: 'h' },
    ...plain(5, 'tail'),
    { id: 'g-third', distinctEvidenceGroup: 'g' },
    { id: 'h-second', distinctEvidenceGroup: 'h' },
  ];
  const slices = sliceSelection(cases, 3);
  for (const group of ['g', 'h']) {
    const members = cases.filter((viewCase) => viewCase.distinctEvidenceGroup === group);
    const holding = slices.filter((slice) => members.some(({ id }) => slice.includes(id)));
    assert.equal(holding.length, 1, `group ${group} is split across ${holding.length} shards`);
    assert.ok(members.every(({ id }) => holding[0].includes(id)));
  }
  // A group joins its shard at its first member, so the later members must be sorted back in.
  const order = new Map(cases.map(({ id }, index) => [id, index]));
  for (const slice of slices) {
    const positions = slice.map((id) => order.get(id));
    assert.deepEqual(positions, [...positions].sort((left, right) => left - right));
  }
});

test("the real registry's groups stay together when the whole corpus is sharded", () => {
  const cases = publishableCases();
  const slices = sliceSelection(cases, shardCountFor(cases.length));
  const groups = new Set(cases.map((viewCase) => viewCase.distinctEvidenceGroup).filter(Boolean));
  assert.ok(groups.size > 0, 'the registry declares no distinct-evidence group, so this proves nothing');
  for (const group of groups) {
    const members = cases.filter((viewCase) => viewCase.distinctEvidenceGroup === group);
    const holding = slices.filter((slice) => members.some(({ id }) => slice.includes(id)));
    assert.equal(holding.length, 1, `group ${group} is split across ${holding.length} shards`);
  }
});

const manifest = (frames, failures = [], head = 'abc12345') => ({
  foundryVersion: '14.365',
  head,
  frames: frames.map((id) => ({ id, app: 'fabricate-app', width: 1, height: 1, head })),
  failures: failures.map((id) => ({ id, message: `${id} broke` })),
});

test('the merged manifest is the one an unsharded run writes: frames by id, failures in order', () => {
  const ids = ['zeta', 'alpha', 'mid', 'beta', 'omega'];
  const merged = mergeShardManifests(ids, [
    manifest(['zeta', 'beta'], ['omega']),
    manifest(['alpha'], ['mid']),
  ]);
  assert.deepEqual(
    merged.frames.map((frame) => frame.id),
    ['alpha', 'beta', 'zeta']
  );
  assert.deepEqual(
    merged.failures.map((failure) => failure.id),
    ['mid', 'omega']
  );
  assert.equal(merged.head, 'abc12345');
});

test('a merge refuses shards that lose, repeat or invent a case, or disagree about the head', () => {
  const ids = ['a', 'b', 'c'];
  assert.throws(() => mergeShardManifests(ids, [manifest(['a', 'b'])]), /missing \[c\]/);
  assert.throws(
    () => mergeShardManifests(ids, [manifest(['a', 'b']), manifest(['b', 'c'])]),
    /duplicated \[b\]/
  );
  assert.throws(() => mergeShardManifests(ids, [manifest(['a', 'b', 'c', 'd'])]), /unselected \[d\]/);
  assert.throws(
    () => mergeShardManifests(ids, [manifest(['a']), manifest(['b', 'c'], [], 'other')]),
    /disagree about head/
  );
  assert.throws(() => mergeShardManifests(ids, []), /no shard manifest/);
});

test('an unrendered selection has no shard, and a rendered one numbers its shards from one', () => {
  const cases = plain(100);
  assert.deepEqual(renderMatrix(cases, false), []);
  const matrix = renderMatrix(cases, true);
  assert.ok(matrix.length > 1, 'a hundred cases must take more than one shard');
  assert.deepEqual(
    matrix.map((entry) => entry.shard),
    Array.from({ length: shardCountFor(cases.length) }, (_, index) => index + 1)
  );
  assert.deepEqual(matrix.flatMap((entry) => entry.ids.split(',')).sort(), cases.map(({ id }) => id));
});

/** Write one shard's frames and manifest into `dir`, as its artifact downloads. */
function writeShard(dir, frames, failures = []) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest(frames, failures)));
  for (const id of frames) writeFileSync(join(dir, `${id}.png`), `png of ${id}`);
}

/** Run the CLI merge of `ids` over a scratch download folder laid out by `layout`. */
function runMerge(t, ids, layout) {
  const root = mkdtempSync(join(tmpdir(), 'view-lab-shards-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const shardsDir = join(root, 'shards');
  const outputDir = join(root, 'apps');
  mkdirSync(shardsDir);
  layout(shardsDir);
  const run = spawnSync(
    process.execPath,
    ['scripts/view-lab-shards.mjs', 'merge', ids.join(','), shardsDir, outputDir],
    { encoding: 'utf8' }
  );
  return { run, outputDir };
}

const mergedFrameSet = (outputDir) => ({
  files: readdirSync(outputDir).sort((left, right) => left.localeCompare(right)),
  frames: JSON.parse(readFileSync(join(outputDir, 'manifest.json'), 'utf8')).frames.map(({ id }) => id),
});

test('the merge reads one folder per shard when several artifacts download', (t) => {
  const { run, outputDir } = runMerge(t, ['a', 'b', 'c'], (shardsDir) => {
    writeShard(join(shardsDir, 'view-lab-shard-1'), ['a', 'c']);
    writeShard(join(shardsDir, 'view-lab-shard-2'), ['b']);
  });
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(mergedFrameSet(outputDir), {
    files: ['a.png', 'b.png', 'c.png', 'manifest.json'],
    frames: ['a', 'b', 'c'],
  });
  assert.equal(readFileSync(join(outputDir, 'b.png'), 'utf8'), 'png of b');
});

test('the merge reads a lone artifact that downloads straight into the shards folder', (t) => {
  // download-artifact drops the artifact's own folder when its pattern matches only one.
  const { run, outputDir } = runMerge(t, ['a', 'b', 'c'], (shardsDir) =>
    writeShard(shardsDir, ['a', 'b'], ['c'])
  );
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(mergedFrameSet(outputDir), {
    files: ['a.png', 'b.png', 'manifest.json'],
    frames: ['a', 'b'],
  });
  assert.equal(readFileSync(join(outputDir, 'a.png'), 'utf8'), 'png of a');
});

test('the merge refuses a shards folder that holds both a manifest and shard folders', (t) => {
  const { run } = runMerge(t, ['a', 'b'], (shardsDir) => {
    writeShard(shardsDir, ['a']);
    writeShard(join(shardsDir, 'view-lab-shard-2'), ['b']);
  });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /both a manifest and shard folders/);
});
