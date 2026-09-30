/**
 * The class-1 drift guard: the deterministic, seeded operation counts are measured at the base
 * commit, by the base's own harness over the base's own `src`, and at head. A rise fails, a fall
 * passes and is reported, and a profile whose fixture changed is reported as incomparable.
 */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import {
  COMPLETE_MARKER,
  lockfileDiffers,
  materialiseBase,
  measureBase,
  measureTree,
  resolveCommit,
} from '../scripts/lib/benchmarkBase.js';
import { compareClass1 } from '../scripts/lib/benchmarkDrift.js';

import {
  REPO_ROOT,
  basePathOf,
  changedPaths,
  parseMarkers,
  readBaseFiles,
  reportComparison,
  resolveRatchetBase,
} from './helpers/mergeBaseRatchet.js';
import {
  DEFAULT_SEED,
  FOUNDRY_ONLY_SCALE_PROFILE_NAMES,
  SCALE_PROFILES,
  SCALE_PROFILE_NAMES,
  SWEPT_SCALE_PROFILE_NAMES,
  buildScaleFixture,
} from './helpers/scale/scaleProfiles.js';

const FAMILY = 'benchmark';

/** The paths whose change can move a class-1 count; any other diff skips the base run. */
const TRIGGERS = Object.freeze([
  /^src\//u,
  /^tests\/helpers\/scale\//u,
  /^scripts\/lib\/benchmark/u,
]);
const CORPUS = 'src/, tests/helpers/scale/ and scripts/lib/benchmark*';
const isTrigger = (file) => TRIGGERS.some((pattern) => pattern.test(file));

const GUIDANCE =
  'A class-1 count rose against the base commit. If the extra work is intended, add a ' +
  `ratchet-exempt(${FAMILY}): <reason> comment to a file this change touches under ${CORPUS}, ` +
  'naming the case id or its profile in the reason, and say in the PR description what moved ' +
  'and why. A marker already present at the base exempts nothing. `npm run ' +
  'benchmark:performance -- --base=<ref>` prints every count that moved.';

/** Whether the diff can move a count, and whether base code can be run against head's packages. */
function planGate(changes, lockfileChanged) {
  const touched = [...changes.changed, ...changes.removed, ...changes.renames.values()];
  const changedCount = changes.changed.length + changes.removed.length;
  if (touched.filter((file) => isTrigger(file)).length === 0) {
    const reason = `none of the ${changedCount} changed path(s) is under ${CORPUS}`;
    return { skipped: 'corpus-unchanged', reason, corpusRoot: CORPUS, changedCount };
  }
  if (lockfileChanged()) {
    const reason =
      'package-lock.json differs between base and head, so the base code would run against ' +
      "head's dependencies and a moved count could not be told from a moved package";
    return { skipped: 'lockfile-changed', reason, corpusRoot: CORPUS, changedCount };
  }
  return { changedCount };
}

/** The reasoned markers `files` gained over base, and a failure for every empty one. */
function newMarkers(files, readBase, readHead) {
  const reasoned = [];
  const empty = [];
  const ofFamily = (file, text) =>
    parseMarkers(file, text ?? '').filter((m) => m.family === FAMILY);
  for (const file of files) {
    const before = new Set(ofFamily(file, readBase(file)).map((marker) => marker.reason));
    for (const marker of ofFamily(file, readHead(file))) {
      if (marker.reason === '') {
        empty.push(`${file}:${marker.line} has a ratchet-exempt(${FAMILY}) marker with no reason`);
      } else if (!before.has(marker.reason)) {
        reasoned.push({ file, line: marker.line, reason: marker.reason });
      }
    }
  }
  return { reasoned, empty };
}

const reasonTokens = (reason) =>
  new Set(reason.split(/[\s,;()`'"]+/u).map((token) => token.replace(/[:.]+$/u, '')));

/** Each rise is exempt when a new marker's reason names its case id or its profile. */
function exemptRises(rises, markers) {
  const failures = [];
  const exempted = [];
  for (const rise of rises) {
    const marker = markers.find((candidate) => {
      const tokens = reasonTokens(candidate.reason);
      return tokens.has(rise.id) || tokens.has(rise.profile);
    });
    if (marker) exempted.push(`${rise.text}: ${marker.reason} (${marker.file}:${marker.line})`);
    else failures.push(rise.text);
  }
  return { failures, exempted };
}

function readHeadFile(file) {
  try {
    return readFileSync(join(REPO_ROOT, file), 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  }
}

function benchmarkGate() {
  const base = resolveRatchetBase();
  if (base.skipped) {
    return { skipped: base.skipped, reason: base.reason, corpusRoot: CORPUS, changedCount: null };
  }
  const changes = changedPaths(base);
  const plan = planGate(changes, () => lockfileDiffers(base.sha));
  if (plan.skipped) return plan;
  const measuredBase = measureBase(base.sha);
  const { rises, falls, notes } = compareClass1(
    measuredBase.class1ByProfile,
    measureTree(REPO_ROOT)
  );
  const files = changes.changed.filter((file) => isTrigger(file));
  const baseTexts = readBaseFiles(
    base,
    files.map((file) => basePathOf(changes, file)).filter(Boolean)
  );
  const markers = newMarkers(
    files,
    (file) => baseTexts.get(basePathOf(changes, file)),
    readHeadFile
  );
  const { failures, exempted } = exemptRises(rises, markers.reasoned);
  const source = measuredBase.cached ? 'cached' : 'measured';
  return {
    compared: true,
    family: FAMILY,
    base: base.sha,
    changedCount: plan.changedCount,
    failures: [...failures, ...markers.empty],
    shrank: falls,
    netted: [],
    exempted,
    notes: [`base counts ${source} in ${measuredBase.dir}`, ...notes],
  };
}

test('class-1 counts do not rise against the base commit', (t) => {
  const result = benchmarkGate();
  for (const note of result.notes ?? []) t.diagnostic(note);
  reportComparison(t, result, GUIDANCE);
});

// ---- the comparison ---------------------------------------------------------------------------

const payload = (cases, checksums = { corpus: 'c1', components: 'k1', inventory: 'i1' }) => ({
  harnessVersion: 2,
  seed: DEFAULT_SEED,
  checksums,
  cases: Object.fromEntries(Object.entries(cases).map(([id, counts]) => [id, { counts }])),
});

test('a rise in an existing count fails, naming the profile, the case, the count and both values', () => {
  const result = compareClass1(
    { 'held-inventory': payload({ 'scan@100': { reads: 5, examined: 70 } }) },
    { 'held-inventory': payload({ 'scan@100': { reads: 6, examined: 70 } }) }
  );
  assert.deepEqual(
    result.rises.map((rise) => rise.text),
    ['held-inventory scan@100.reads rose from 5 to 6']
  );
  assert.deepEqual(result.falls, []);
});

test('a fall passes and is reported', () => {
  const result = compareClass1(
    { p: payload({ c: { examined: 70 } }) },
    { p: payload({ c: { examined: 40 } }) }
  );
  assert.deepEqual(result.rises, []);
  assert.deepEqual(result.falls, ['p c.examined fell from 70 to 40']);
});

test('a new or removed case, count or profile is reported and never fails', () => {
  const result = compareClass1(
    { p: payload({ kept: { reads: 1 }, gone: { reads: 1 } }), old: payload({}) },
    { p: payload({ kept: { reads: 1, fresh: 9 }, added: { reads: 900 } }), fresh: payload({}) }
  );
  assert.deepEqual(result.rises, []);
  assert.deepEqual(result.notes, [
    'profile added: fresh',
    'profile removed: old',
    'case added: p added',
    'case removed: p gone',
    'count added: p kept.fresh = 9',
  ]);
});

test('a profile whose fixture identity changed is reported as incomparable, even with a rise', () => {
  for (const changed of [
    { checksums: { corpus: 'c2', components: 'k1', inventory: 'i1' } },
    { checksums: { corpus: 'c1', components: 'k1', inventory: 'i2' } },
    { harnessVersion: 3 },
    { seed: DEFAULT_SEED + 1 },
  ]) {
    const head = { ...payload({ c: { reads: 99 } }), ...changed };
    const result = compareClass1({ p: payload({ c: { reads: 1 } }) }, { p: head });
    assert.deepEqual(result.rises, [], JSON.stringify(changed));
    assert.match(result.notes.join('\n'), /^incomparable: p changed its fixture identity/u);
  }
});

// ---- when the base run happens ----------------------------------------------------------------

const changesOf = ({ changed = [], removed = [], renames = [] }) => ({
  changed,
  added: [],
  removed,
  renames: new Map(renames),
});
const neverCalled = () => assert.fail('the lockfile is read only when the diff can move a count');

test('a change under src/, tests/helpers/scale/ or scripts/lib/benchmark* is compared, not skipped', () => {
  for (const changes of [
    changesOf({ changed: ['src/systems/inventorySnapshot.js'] }),
    changesOf({ changed: ['tests/helpers/scale/benchmarkCases.js'] }),
    changesOf({ removed: ['scripts/lib/benchmarkStats.js'] }),
    changesOf({ changed: ['docs/moved.js'], renames: [['docs/moved.js', 'src/moved.js']] }),
  ]) {
    assert.equal(
      planGate(changes, () => false).skipped,
      undefined,
      JSON.stringify(changes.changed)
    );
  }
});

test('any other change skips the base run, naming why', () => {
  const plan = planGate(
    changesOf({ changed: ['docs/a.md', 'tests/helpers/foundryEnv.js', 'scripts/lib/lint.js'] }),
    neverCalled
  );
  assert.equal(plan.skipped, 'corpus-unchanged');
  assert.match(plan.reason, /none of the 3 changed path\(s\)/u);
});

test('a changed package-lock.json skips with a named diagnostic', () => {
  const plan = planGate(changesOf({ changed: ['src/a.js', 'package-lock.json'] }), () => true);
  assert.equal(plan.skipped, 'lockfile-changed');
  assert.match(plan.reason, /package-lock\.json differs between base and head/u);
});

// ---- exemptions -------------------------------------------------------------------------------

const RISES = compareClass1(
  {
    'held-inventory': payload({ 'scan@100': { reads: 1 } }),
    'recipe-graph': payload({ g: { edges: 1 } }),
  },
  {
    'held-inventory': payload({ 'scan@100': { reads: 2 } }),
    'recipe-graph': payload({ g: { edges: 2 } }),
  }
).rises;

function markersFrom(baseText, headText) {
  const file = 'src/systems/Scan.js';
  return newMarkers(
    [file],
    () => baseText,
    () => headText
  );
}

test('a reasoned marker the change adds exempts the case or profile it names, and no other', () => {
  const byCase = markersFrom(
    '',
    '// ratchet-exempt(benchmark): scan@100: the new pass reads twice\n'
  );
  assert.deepEqual(exemptRises(RISES, byCase.reasoned).failures, [
    'recipe-graph g.edges rose from 1 to 2',
  ]);
  const byProfile = markersFrom(
    '',
    '// ratchet-exempt(benchmark): recipe-graph, edges now carry tags\n'
  );
  const judged = exemptRises(RISES, byProfile.reasoned);
  assert.deepEqual(judged.failures, ['held-inventory scan@100.reads rose from 1 to 2']);
  assert.match(judged.exempted[0], /^recipe-graph g\.edges rose from 1 to 2: recipe-graph, edges/u);
});

test('an empty marker fails, and a marker already present at base exempts nothing', () => {
  const empty = markersFrom('', 'const a = 1; // ratchet-exempt(benchmark):\n');
  assert.deepEqual(empty.reasoned, []);
  assert.match(
    empty.empty[0],
    /^src\/systems\/Scan\.js:1 has a ratchet-exempt\(benchmark\) marker with no reason/u
  );
  const stale = '// ratchet-exempt(benchmark): scan@100: an old reason\n';
  assert.deepEqual(markersFrom(stale, `${stale}const b = 2;\n`).reasoned, []);
  const otherFamily = markersFrom('', '// ratchet-exempt(file-size): scan@100: a long function\n');
  assert.deepEqual(exemptRises(RISES, otherFamily.reasoned).exempted, []);
});

// ---- the base run, end to end -----------------------------------------------------------------

test('an extracted commit is measured by its own harness over its own src, and a rise there fails', () => {
  // Inside the repository, so the extracted tree resolves head's node_modules and package.json.
  const cacheRoot = join(REPO_ROOT, '.benchmarks');
  mkdirSync(cacheRoot, { recursive: true });
  const scratch = mkdtempSync(join(cacheRoot, 'drift-test-'));
  try {
    const sha = resolveCommit('HEAD');
    const first = materialiseBase(sha, { cacheRoot: scratch });
    assert.equal(first.cached, false);
    const marker = join(first.dir, COMPLETE_MARKER);
    assert.equal(readFileSync(marker, 'utf8'), `${sha}\n`);
    assert.equal(materialiseBase(sha, { cacheRoot: scratch }).cached, true);
    rmSync(marker);
    assert.equal(
      materialiseBase(sha, { cacheRoot: scratch }).cached,
      false,
      'an unmarked tree is replaced'
    );
    assert.ok(statSync(marker).isFile());

    const profiles = ['knowledge-corpus'];
    const before = measureTree(first.dir, { profiles });
    assert.ok(
      !/samplesMs|heapDelta|"ms"|durationMs/u.test(JSON.stringify(before)),
      'a class-1 payload carries counts only; wall clock and heap are class 2 and never compared'
    );
    const scanned = join(first.dir, 'src', 'systems', 'inventorySnapshot.js');
    // ratchet-exempt(source-pin): injects an offender into a disposable extracted copy, never read as a pin
    const source = readFileSync(scanned, 'utf8');
    const scan = 'const items = [...(actor.items || [])];';
    assert.equal(source.split(scan).length, 2, 'the injected scan must replace exactly one site');
    writeFileSync(scanned, source.replace(scan, `void actor.items;\n    ${scan}`));

    const { rises } = compareClass1(before, measureTree(first.dir, { profiles }));
    assert.ok(
      rises.some((rise) =>
        /^knowledge-corpus \S+\.craftingActorItemsReads rose from \d+ to \d+$/u.test(rise.text)
      ),
      `one more item read in the extracted src must rise a count: ${JSON.stringify(rises)}`
    );
    assert.ok(exemptRises(rises, []).failures.length > 0);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

// ---- the foundry-only escape hatch (issue 1255) ---------------------------------------------

test('no profile claims the foundry-only exemption today', () => {
  // EMPTY since issue 1265 removed `granular-corpus` with the storage-arrangement axis it was built
  // for.
  assert.deepEqual([...FOUNDRY_ONLY_SCALE_PROFILE_NAMES], []);
  // With the list empty, this assertion is the ONLY load-bearing check on it.
});

test('the two profile lists partition the registry, with no overlap and nothing dropped', () => {
  // A profile that fell out of BOTH lists would be swept by nothing and compared by nothing, and
  // every assertion in this file would still pass.
  assert.deepEqual(
    [...SWEPT_SCALE_PROFILE_NAMES, ...FOUNDRY_ONLY_SCALE_PROFILE_NAMES].sort(),
    [...SCALE_PROFILE_NAMES].sort()
  );
  for (const profile of FOUNDRY_ONLY_SCALE_PROFILE_NAMES) {
    assert.ok(
      !SWEPT_SCALE_PROFILE_NAMES.includes(profile),
      `"${profile}" is both swept and foundry-only`
    );
  }
});

test('a foundry-only profile states why it has no headless cases, and still builds', () => {
  for (const profile of FOUNDRY_ONLY_SCALE_PROFILE_NAMES) {
    assert.ok(
      SCALE_PROFILES[profile].foundryOnlyReason?.length > 0,
      `"${profile}" opts out of the sweep and must say why`
    );
    // The exemption is from the SWEEP, never from being a real fixture. A profile that opted
    // out and then stopped building would be invisible to every other test in this file.
    const fixture = buildScaleFixture({ profile, seed: DEFAULT_SEED });
    assert.equal(fixture.components.length, SCALE_PROFILES[profile].scale.components);
    assert.equal(fixture.recipes.length, SCALE_PROFILES[profile].scale.recipes);
    assert.equal(fixture.foundryOnly, true);
  }
});
