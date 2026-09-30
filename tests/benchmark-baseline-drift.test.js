/**
 * The class-1 drift guard: the deterministic, seeded operation counts are measured at the base
 * commit, by the base's own harness over the base's own `src`, and at head. A rise fails, a fall
 * passes and is reported, and a profile whose fixture changed, or a removed profile or case,
 * fails as a rise does, since its counts are no longer compared.
 */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  BASE_PATHS,
  COMPLETE_MARKER,
  lockfileDiffers,
  materialiseBase,
  measureBase,
  measureTree,
  resolveCommit,
  workerFor,
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

/** The paths a class-1 measurement imports, so the ones whose change can move a count. */
const CORPUS = BASE_PATHS.map((root) => `${root}/`).join(', ');
const isTrigger = (file) => BASE_PATHS.some((root) => file.startsWith(`${root}/`));

const GUIDANCE =
  'A class-1 count rose against the base commit, or a profile or case stopped being compared. If ' +
  'that is intended, add a ' +
  `ratchet-exempt(${FAMILY}): <reason> comment to a file this change touches under ${CORPUS}, ` +
  'naming the case id or its profile in the reason, and say in the PR description what moved ' +
  'and why. A marker already present at the base exempts nothing. `npm run ' +
  'benchmark:performance -- --base=<ref>` prints every count that moved.';

const LOCKFILE_NOTE =
  ' (lockfile changed: package-lock.json differs between base and head, so the base code ran ' +
  "against head's packages and a package may have moved this)";

/** Whether the diff can move a count, and whether base code runs against changed packages. */
function planGate(changes, lockfileChanged) {
  const touched = [...changes.changed, ...changes.removed, ...changes.renames.values()];
  const changedCount = changes.changed.length + changes.removed.length;
  if (touched.filter((file) => isTrigger(file)).length === 0) {
    const reason = `none of the ${changedCount} changed path(s) is under ${CORPUS}`;
    return { skipped: 'corpus-unchanged', reason, corpusRoot: CORPUS, changedCount };
  }
  return { changedCount, lockfileChanged: lockfileChanged() };
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

const GATE_DEPENDENCIES = Object.freeze({
  resolveBase: () => resolveRatchetBase(),
  changedPaths: (base) => changedPaths(base),
  lockfileDiffers: (sha) => lockfileDiffers(sha),
  measureBase: (sha) => measureBase(sha),
  measureHead: () => measureTree(REPO_ROOT),
  readBase: (base, paths) => readBaseFiles(base, paths),
  readHead: readHeadFile,
});

/**
 * The drift gate as a comparison `reportComparison` reads. Every collaborator that reaches git,
 * the file system or a child process is injectable.
 */
function benchmarkGate(overrides = {}) {
  const io = { ...GATE_DEPENDENCIES, ...overrides };
  const base = io.resolveBase();
  if (base.skipped) {
    return { skipped: base.skipped, reason: base.reason, corpusRoot: CORPUS, changedCount: null };
  }
  const changes = io.changedPaths(base);
  const plan = planGate(changes, () => io.lockfileDiffers(base.sha));
  if (plan.skipped) return plan;
  const measuredBase = io.measureBase(base.sha);
  const compared = compareClass1(measuredBase.class1ByProfile, io.measureHead());
  const { rises, breaks, falls, notes } = compared;
  const files = changes.changed.filter((file) => isTrigger(file));
  const baseTexts = io.readBase(
    base,
    files.map((file) => basePathOf(changes, file)).filter(Boolean)
  );
  const markers = newMarkers(
    files,
    (file) => baseTexts.get(basePathOf(changes, file)),
    io.readHead
  );
  const annotate = (rise) => ({ ...rise, text: `${rise.text}${LOCKFILE_NOTE}` });
  const judged = [...(plan.lockfileChanged ? rises.map(annotate) : rises), ...breaks];
  const { failures, exempted } = exemptRises(judged, markers.reasoned);
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

test('an added case, count or profile is reported; a removed profile or case is a break', () => {
  const result = compareClass1(
    { p: payload({ kept: { reads: 1 }, gone: { reads: 1 } }), old: payload({}) },
    { p: payload({ kept: { reads: 1, fresh: 9 }, added: { reads: 900 } }), fresh: payload({}) }
  );
  assert.deepEqual(result.rises, []);
  assert.deepEqual(result.notes, [
    'profile added: fresh',
    'case added: p added',
    'count added: p kept.fresh = 9',
  ]);
  assert.deepEqual(
    result.breaks.map((entry) => entry.text),
    ['profile removed: old', 'case removed: p gone']
  );
});

test('a profile whose fixture identity changed is a break, even with a rise', () => {
  for (const changed of [
    { checksums: { corpus: 'c2', components: 'k1', inventory: 'i1' } },
    { checksums: { corpus: 'c1', components: 'k1', inventory: 'i2' } },
    { harnessVersion: 3 },
    { seed: DEFAULT_SEED + 1 },
  ]) {
    const head = { ...payload({ c: { reads: 99 } }), ...changed };
    const result = compareClass1({ p: payload({ c: { reads: 1 } }) }, { p: head });
    assert.deepEqual(result.rises, [], JSON.stringify(changed));
    assert.equal(result.breaks.length, 1, JSON.stringify(changed));
    assert.match(result.breaks[0].text, /^incomparable: p changed its fixture identity/u);
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

test('a change to any path the base measurement imports is compared, not skipped', () => {
  for (const changes of [
    changesOf({ changed: ['src/systems/inventorySnapshot.js'] }),
    changesOf({ changed: ['tests/helpers/scale/benchmarkCases.js'] }),
    changesOf({ changed: ['tests/helpers/foundryEnv.js'] }),
    changesOf({ changed: ['tests/helpers/componentIdentityFixtures.js'] }),
    changesOf({ changed: ['tests/view-lab/foundry/labRandom.js'] }),
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
    changesOf({ changed: ['docs/a.md', 'tests/view-lab/cases.js', 'scripts/lint.mjs'] }),
    neverCalled
  );
  assert.equal(plan.skipped, 'corpus-unchanged');
  assert.match(plan.reason, /none of the 3 changed path\(s\)/u);
});

/** The gate over injected collaborators: `src/a.js` changed, and these payloads measured. */
function gateWith({ baseCounts, headCounts, headText = '', lockfile = false }) {
  const seen = [];
  const result = benchmarkGate({
    resolveBase: () => ({ sha: 'b'.repeat(40), head: 'h'.repeat(40) }),
    changedPaths: () => changesOf({ changed: ['src/a.js'] }),
    lockfileDiffers: () => lockfile,
    measureBase: (sha) => {
      seen.push(sha);
      return { class1ByProfile: baseCounts, dir: 'base-tree', cached: true };
    },
    measureHead: () => headCounts,
    readBase: () => new Map([['src/a.js', '']]),
    readHead: () => headText,
  });
  return { result, seen };
}

const ONE = { p: payload({ c: { reads: 1 } }) };
const TWO = { p: payload({ c: { reads: 2 } }) };

test('an injected rise with no new marker fails, and the base is measured at its own sha', () => {
  const { result, seen } = gateWith({ baseCounts: ONE, headCounts: TWO });
  assert.deepEqual(seen, ['b'.repeat(40)]);
  assert.deepEqual(result.failures, ['p c.reads rose from 1 to 2']);
  const marked = gateWith({
    baseCounts: ONE,
    headCounts: TWO,
    headText: '// ratchet-exempt(benchmark): p: the pass reads twice\n',
  });
  assert.deepEqual(marked.result.failures, []);
});

test('a changed package-lock.json still compares, and a rise says so', () => {
  const { result } = gateWith({ baseCounts: ONE, headCounts: TWO, lockfile: true });
  assert.equal(result.compared, true);
  assert.equal(result.failures.length, 1);
  assert.match(result.failures[0], /^p c\.reads rose from 1 to 2 \(lockfile changed: /u);
  const marked = gateWith({
    baseCounts: ONE,
    headCounts: TWO,
    lockfile: true,
    headText: '// ratchet-exempt(benchmark): p: a package now reads twice\n',
  });
  assert.deepEqual(marked.result.failures, []);
});

test('an incomparable profile and a removed case fail unless a new marker names the profile', () => {
  const incomparable = { p: { ...payload({ c: { reads: 1 } }), harnessVersion: 3 } };
  const removed = { p: payload({}) };
  for (const headCounts of [incomparable, removed]) {
    const { result } = gateWith({ baseCounts: ONE, headCounts });
    assert.equal(result.failures.length, 1, JSON.stringify(headCounts));
    assert.match(result.failures[0], /^(?:incomparable: p|case removed: p c)/u);
    const marked = gateWith({
      baseCounts: ONE,
      headCounts,
      headText: '// ratchet-exempt(benchmark): p: the harness moved\n',
    });
    assert.deepEqual(marked.result.failures, [], JSON.stringify(headCounts));
  }
});

test("a base tree's own worker measures it, and head's stands in when it has none", () => {
  const scratch = mkdtempSync(join(tmpdir(), 'fabricate-worker-'));
  try {
    assert.equal(workerFor(scratch), join(REPO_ROOT, 'scripts/lib/benchmarkBaseWorker.js'));
    mkdirSync(join(scratch, 'scripts/lib'), { recursive: true });
    writeFileSync(join(scratch, 'scripts/lib/benchmarkBaseWorker.js'), '');
    assert.equal(workerFor(scratch), join(scratch, 'scripts/lib/benchmarkBaseWorker.js'));
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
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
