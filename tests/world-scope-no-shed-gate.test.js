/**
 * THE NO-SHED GUARANTEE, AS A GATE (issue 1363, criterion 7; third test REPLACED at issue 1370).
 *
 * The triad's unanimous ruling is that `1.30.0` DEFERS the shed: every lifted field still has live
 * production readers, and shedding `Component.name` while they read it blanks every screen in the
 * world on the first save, permanently, because `_normalizeSystem` is an allowlist rebuild.
 *
 * ## THREE CLOCKS, AND ONLY ONE OF THEM HAS RUN
 *
 * PR 8a runs the READ ENTRY clock: production readers now enter through the read union, so the
 * third test's original claim - "no production reader anywhere under src is repointed" - is what
 * that PR exists to make false. It is REPLACED below rather than deleted, by a gate on WHERE the
 * union may be entered from. The AUTHORITY clock has NOT run: `## CraftingSystem` requirement 36
 * keeps the in-system arrays authoritative, and the union answers every key, every row and the row
 * order from them. The SHED clock has NOT run either, and the second test below is still the whole
 * of that guarantee - a repointed reader does not shed a field, and `_normalizeSystem` must keep
 * emitting all three arrays with every lifted identity field verbatim.
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
 *     exclusion list a later lane can widen. (Its sibling exemption — a line-local marker for
 *     the manager's three delegating closures — was RETIRED at issue 1370: those closures no
 *     longer exist, so the marker exempted nothing while remaining available to re-arm by
 *     accident. The manager's own method headers fall to `DEFINITION` instead.)
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

import {
  ENTITY_TYPE_FIELDS,
  WORLD_IDENTITY_FIELDS,
} from '../src/migration/worldScopeEntityGrouping.js';

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
/**
 * A CALL held as a VALUE rather than invoked by name.
 *
 * `CALL` requires `name(`, so a door built by putting a scope function in a dispatch table and
 * invoking it through the table — which is exactly how `scopedEntityReads.js` builds the door
 * ~20 leaf readers use — is INVISIBLE to it. That is not a hole to disclaim: it is the PR's own
 * primary entry point, so the gate matches it too and the assertion below names it.
 */
const VALUE_HELD = new RegExp(`:\\s*(?:${NAMES})\\b(?!\\()`);

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

/** A record carrying every source-link identity field the world entity lifts. */
function linked(record, uuid) {
  return {
    ...record,
    originItemUuid: `Item.${uuid}`,
    registeredItemUuid: `Item.${uuid}`,
    aliasItemUuids: [`Item.alias-${uuid}`],
  };
}

test('_normalizeSystem still EMITS components, essenceDefinitions and tools, with identity verbatim', () => {
  const manager = new CraftingSystemManager({ getRecipes: () => [] });
  const raw = {
    id: 'sys-1',
    name: 'System',
    features: { salvage: true, essences: true },
    // EVERY lifted identity field is authored, so the derived assertion below is not vacuous
    // for any of the 16 `(entityType, field)` pairs.
    components: [
      linked({ id: 'c1', name: 'Ash Salt', img: 'a.png', description: 'A' }, 'aaa'),
      linked({ id: 'c2', name: 'Cinder', img: 'b.png', description: 'B' }, 'bbb'),
      linked({ id: 'c3', name: 'Ember', img: 'c.png', description: 'C' }, 'ccc'),
    ],
    essenceDefinitions: [
      { id: 'e1', name: 'Fire', icon: 'fas fa-fire', description: 'F', colorToken: 'rose' },
      { id: 'e2', name: 'Water', icon: 'fas fa-water', description: 'W', colorToken: 'aqua' },
      { id: 'e3', name: 'Air', icon: 'fas fa-wind', description: 'Ai', colorToken: 'mist' },
    ],
    tools: [
      linked({ id: 't1', name: 'Hammer', img: 'h.png', description: 'H' }, 'ddd'),
      linked({ id: 't2', name: 'Tongs', img: 'g.png', description: 'T' }, 'eee'),
      linked({ id: 't3', name: 'Anvil', img: 'v.png', description: 'V' }, 'fff'),
    ],
  };
  const normalized = manager._normalizeSystem(raw);
  for (const [entityType, field] of Object.entries(ENTITY_TYPE_FIELDS)) {
    const source = raw[field];
    assert.equal(Array.isArray(normalized[field]), true, `${field} must be emitted`);
    assert.equal(normalized[field].length, 3, `${field}: three entities in, THREE out`);
    // CONTENT, not key presence: an empty-array mutation passes a presence test and fails this.
    //
    // THE FIELD LIST IS DERIVED FROM `WORLD_IDENTITY_FIELDS`, never hand-written. A hand-written
    // list covered 5 of the 16 `(entityType, field)` pairs, so dropping `originItemUuid`,
    // `registeredItemUuid` or `colorToken` from the normalizer survived this gate — the very
    // shape of unguarded hand-maintained mirror the repository's own rules forbid, inside the
    // gate that claims the no-shed guarantee.
    for (const [index, record] of normalized[field].entries()) {
      assert.equal(record.id, source[index].id, `${field}[${index}].id must be verbatim`);
      for (const identityField of WORLD_IDENTITY_FIELDS[entityType]) {
        assert.deepEqual(
          record[identityField],
          source[index][identityField],
          `${field}[${index}].${identityField} must be emitted VERBATIM`
        );
      }
    }
  }
});

// ---------------------------------------------------------------------------
// 3. The recursive walk, rooted at `src/` alone
// ---------------------------------------------------------------------------

/** The manager method a line belongs to, by the one-method-per-two-space-indent convention. */
function enclosingMethod(lines, index) {
  for (let cursor = index; cursor >= 0; cursor -= 1) {
    const declaration = /^ {2}(?:static )?(?:async )?([A-Za-z_][\w$]*)\(/.exec(lines[cursor]);
    if (declaration) return declaration[1];
  }
  return null;
}

/** Every non-definition call of one of the six union names, as `file :: enclosing method`. */
function unionCallSites() {
  const sites = [];
  for (const full of everySourceFile()) {
    const rel = toPosix(relativePath(ROOT, full));
    // Comments are BLANKED before the scan, never filtered after it: several matches under `src/`
    // are comment text, and a trailing-comment filter cannot see a marker that is not at the
    // start of the line.
    const lines = stripComments(readFileSync(full, 'utf8')).split('\n');
    lines.forEach((line, index) => {
      const invoked = CALL.test(line) && !DEFINITION.test(line);
      const held = VALUE_HELD.test(line);
      if (!invoked && !held) return;
      sites.push(`${rel} :: ${held ? 'value-held' : enclosingMethod(lines, index)}`);
    });
  }
  return [...new Set(sites)].sort();
}

test('the read union is entered from EXACTLY two doors, and both are named here', () => {
  // REPLACES issue 1363's "no production reader is repointed". PR 8a repoints the reader set
  // through TWO doors and no others: the shared seam's dispatch table, which every reader
  // holding a system RECORD enters, and the manager's four read accessors, which every reader
  // holding a MANAGER enters. A third entry point appearing here means some path is building
  // its own union instead of sharing the memoized one.
  //
  // The seam's three rows are VALUE-HELD, so an earlier form of this test could not see them and
  // promised exactness it did not check. They are matched now.
  assert.deepEqual(unionCallSites(), [
    'src/systems/CraftingSystemManager.js :: getComponentsForSystem',
    'src/systems/CraftingSystemManager.js :: getEssenceDefinition',
    'src/systems/CraftingSystemManager.js :: getEssenceDefinitions',
    'src/systems/CraftingSystemManager.js :: getToolsForSystem',
    'src/systems/scopedEntityReads.js :: value-held',
  ]);
});

test('that call-site scan is NOT vacuous - it reds when a repoint is reverted', () => {
  // The list above is also what a scan matching nothing would produce if it were empty, so the
  // scan is proved against a synthetic repoint and its reverted twin rather than trusted.
  const repointed = [
    '  getComponentsForSystem(systemId) {',
    '    return this.resolveScopedComponents(this.getSystem(systemId));',
    '  }',
  ];
  const matched = repointed.filter((line) => CALL.test(line) && !DEFINITION.test(line));
  assert.equal(matched.length, 1, 'the premise: a delegating call really is matchable');
  assert.equal(enclosingMethod(repointed, 1), 'getComponentsForSystem');
  const reverted = '    return Array.isArray(system?.components) ? system.components : [];';
  assert.equal(
    CALL.test(reverted),
    false,
    'and a REVERTED repoint stops matching, so the list above would lose an entry'
  );
  // The VALUE-HELD shape, which `CALL` cannot see and which the seam's own table uses.
  assert.equal(VALUE_HELD.test('  components: { union: resolveComponentScope },'), true);
  assert.equal(
    VALUE_HELD.test('  const x = resolveComponentScope(corpus, id, defs);'),
    false,
    'an ordinary invocation is CALL’s business, not this one’s'
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
