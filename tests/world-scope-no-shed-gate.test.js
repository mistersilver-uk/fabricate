/**
 * THE NO-SHED GUARANTEE, AS A GATE (issue 1363, criterion 7).
 *
 * The triad's unanimous ruling is that `1.30.0` DEFERS the shed: every lifted field still has live
 * production readers, and shedding `Component.name` while they read it blanks every screen in the
 * world on the first save, permanently, because `_normalizeSystem` is an allowlist rebuild.
 *
 * AN EARLIER FORM OF THIS GUARANTEE WAS VACUOUS FOUR WAYS, and each is fixed here:
 *
 *  1. It asserted a NAME IS NOT FOUND, so deleting the three methods kept it green. This one is a
 *     POSITIVE EXISTENCE ANCHOR over all SIX names — the three `CraftingSystemManager` read-union
 *     methods AND the three module functions a repoint would more naturally target.
 *  2. It named only the three methods, so a repoint at `resolveComponentScope` (the module
 *     function) would have sailed past it.
 *  3. It would have tripped on the legitimate call in `tests/helpers/scale/benchmarkCases.js`.
 *     The walk is rooted at `src/` ALONE, which excludes it BY CONSTRUCTION rather than by an
 *     exclusion list a later lane can widen.
 *  4. Its emit half passed key-presence against an empty-array mutation. This one asserts CONTENT:
 *     three entities in, length three out, identity fields verbatim.
 *
 * A FILE-PATH ALLOWLIST IS FORBIDDEN. The precedent this is built on resolves the definition and
 * gated-call problem with one, and copying it here would be self-defeating: `_normalizeSystem`
 * spans the SAME FILE as three of the legitimate callers, so a file skip would put mutation (i)
 * in a skipped file and the gate would stay green against the defect it exists to catch. The two
 * exemptions are LINE-LOCAL instead.
 */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, relative as relativePath, resolve, sep as pathSeparator } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { stripComments } from './helpers/sourceScan.js';
import { installFoundryStubs } from './helpers/worldScopeCorpus.js';

installFoundryStubs();
const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

/** All SIX names a repoint would target. */
const UNION_NAMES = Object.freeze([
  'resolveScopedComponents',
  'resolveScopedEssences',
  'resolveScopedTools',
  'resolveComponentScope',
  'resolveEssenceScope',
  'resolveToolScope',
]);

const toPosix = (value) => value.split(pathSeparator).join('/');

/** Every `.js` under `src/`, so the scan cannot miss a door by living in a new file. */
function everySourceFile(directory = resolve(ROOT, 'src'), collected = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = resolve(directory, entry.name);
    if (entry.isDirectory()) everySourceFile(full, collected);
    else if (entry.name.endsWith('.js')) collected.push(full);
  }
  return collected;
}

const NAMES = UNION_NAMES.join('|');
/** A CALL, so the three import lines need no exemption — none is followed by an open paren. */
const CALL = new RegExp(`(?:${NAMES})\\(`);
/**
 * A DEFINITION, ANCHORED. The precedent's unanchored line-start form silently EXEMPTS a
 * prettier-wrapped repoint whose call name lands at the start of a continuation line, leaving the
 * gate green against the defect it exists to catch. With the trailing `\\)\\s*\\{` anchor,
 * `resolveScopedTools`'s own header falls to the call-site marker instead, which is what makes
 * this description literally true.
 */
const DEFINITION = new RegExp(
  `^\\s*(?:export\\s+)?(?:async\\s+)?(?:function\\s+)?(?:${NAMES})\\([^)]*\\)\\s*\\{`
);
/** The three legitimate delegating call sites inside the manager's own read-union methods. */
const CALL_SITE_MARKER = /\(corpus, record\) =>/;

// ---------------------------------------------------------------------------
// 1. The POSITIVE existence anchor
// ---------------------------------------------------------------------------

test('all SIX read-union names exist, so this gate cannot pass by their absence', async () => {
  const manager = new CraftingSystemManager({ getRecipes: () => [] });
  for (const method of ['resolveScopedComponents', 'resolveScopedEssences', 'resolveScopedTools']) {
    assert.equal(typeof manager[method], 'function', `${method} must exist`);
  }
  const modules = await Promise.all([
    import('../src/systems/componentScope.js'),
    import('../src/systems/essenceScope.js'),
    import('../src/systems/toolScope.js'),
  ]);
  assert.equal(typeof modules[0].resolveComponentScope, 'function');
  assert.equal(typeof modules[1].resolveEssenceScope, 'function');
  assert.equal(typeof modules[2].resolveToolScope, 'function');
});

// ---------------------------------------------------------------------------
// 2. The CONTENT assertion — three entities in, length three out, verbatim
// ---------------------------------------------------------------------------

test('_normalizeSystem still EMITS components, essenceDefinitions and tools, with identity verbatim', () => {
  const manager = new CraftingSystemManager({ getRecipes: () => [] });
  const raw = {
    id: 'sys-1',
    name: 'System',
    features: { salvage: true, essences: true },
    components: [
      { id: 'c1', name: 'Ash Salt', img: 'a.png', description: 'A' },
      { id: 'c2', name: 'Cinder', img: 'b.png', description: 'B' },
      { id: 'c3', name: 'Ember', img: 'c.png', description: 'C' },
    ],
    essenceDefinitions: [
      { id: 'e1', name: 'Fire', icon: 'fas fa-fire', description: 'F' },
      { id: 'e2', name: 'Water', icon: 'fas fa-water', description: 'W' },
      { id: 'e3', name: 'Air', icon: 'fas fa-wind', description: 'Ai' },
    ],
    tools: [
      { id: 't1', name: 'Hammer', img: 'h.png', description: 'H' },
      { id: 't2', name: 'Tongs', img: 'g.png', description: 'T' },
      { id: 't3', name: 'Anvil', img: 'v.png', description: 'V' },
    ],
  };
  const normalized = manager._normalizeSystem(raw);
  for (const [field, source] of [
    ['components', raw.components],
    ['essenceDefinitions', raw.essenceDefinitions],
    ['tools', raw.tools],
  ]) {
    assert.equal(Array.isArray(normalized[field]), true, `${field} must be emitted`);
    assert.equal(normalized[field].length, 3, `${field}: three entities in, THREE out`);
    // CONTENT, not key presence: an empty-array mutation passes a presence test and fails this.
    for (const [index, record] of normalized[field].entries()) {
      assert.equal(record.id, source[index].id);
      assert.equal(record.name, source[index].name, `${field}[${index}].name must be verbatim`);
      assert.equal(record.description, source[index].description);
      assert.equal(record.img ?? record.icon, source[index].img ?? source[index].icon);
    }
  }
});

// ---------------------------------------------------------------------------
// 3. The recursive walk, rooted at `src/` alone
// ---------------------------------------------------------------------------

test('no production reader anywhere under src is repointed at a scoped read union', () => {
  const offenders = [];
  for (const full of everySourceFile()) {
    const rel = toPosix(relativePath(ROOT, full));
    // Comments are BLANKED before the scan, never filtered after it: five matches under `src/`
    // are comment text, and a trailing-comment filter cannot see a marker that is not at the
    // start of the line.
    const lines = stripComments(readFileSync(full, 'utf8')).split('\n');
    lines.forEach((line, index) => {
      if (!CALL.test(line)) return;
      if (DEFINITION.test(line)) return;
      // The manager's three read-union methods DELEGATE to the module functions; the marker is
      // tested on the matching line or the one before, because prettier wraps the arrow.
      if (CALL_SITE_MARKER.test(line) || CALL_SITE_MARKER.test(lines[index - 1] ?? '')) return;
      offenders.push(`${rel}:${index + 1} ${line.trim()}`);
    });
  }
  assert.deepEqual(
    offenders,
    [],
    'the consumer sweep (epic 1357, PR 8) is what repoints readers at the read union. Doing it ' +
      'here would blank every screen in the world on the first save, permanently'
  );
});

test('that scan is NOT vacuous — it sees the population it exempts', () => {
  // The scan reports nothing, which is also what a scan reading zero files reports. This pins
  // the exempted population by file, so the walk cannot pass by never reaching them.
  const matched = everySourceFile().filter((full) =>
    CALL.test(stripComments(readFileSync(full, 'utf8')))
  );
  assert.deepEqual(
    matched.map((full) => toPosix(relativePath(ROOT, full))).sort(),
    [
      'src/systems/CraftingSystemManager.js',
      'src/systems/componentScope.js',
      'src/systems/essenceScope.js',
      'src/systems/toolScope.js',
    ],
    'the walk must actually reach every file that names a scoped read union'
  );
  assert.ok(everySourceFile().length > 100, 'and it must be walking the whole tree');
});

test('the DEFINITION regex is ANCHORED, so a prettier-wrapped repoint cannot hide behind it', () => {
  // THE PRECEDENT'S BUG, pinned. Its unanchored line-start form matches a continuation line whose
  // first token happens to be the call name, which is exactly the shape prettier produces when it
  // wraps a long repoint.
  const wrapped = '  resolveComponentScope(corpus, system.id, system.components) ?? [];';
  const unanchored = new RegExp(
    `^\\s*(?:export\\s+)?(?:async\\s+)?(?:function\\s+)?(?:${NAMES})\\(`
  );
  assert.match(wrapped, unanchored, 'the premise: the unanchored form WOULD exempt this line');
  assert.doesNotMatch(wrapped, DEFINITION, 'the anchored form does not');
  assert.match(
    'export function resolveComponentScope(worldCorpus, systemId, systemComponents) {',
    DEFINITION
  );
});

test('the walk is rooted at src/ ALONE, which excludes the legitimate benchmark caller by construction', () => {
  // An exclusion LIST can be widened by a later lane to hide a real repoint; a root cannot.
  const benchmarkCase = readFileSync(
    resolve(ROOT, 'tests', 'helpers', 'scale', 'benchmarkCases.js'),
    'utf8'
  );
  assert.match(
    benchmarkCase,
    CALL,
    'the premise: a legitimate caller really does live outside src/, and an exclusion-list gate ' +
      'would have had to name it'
  );
  assert.ok(
    everySourceFile().every((full) => toPosix(full).includes('/src/')),
    'and the walk never leaves src/'
  );
});
