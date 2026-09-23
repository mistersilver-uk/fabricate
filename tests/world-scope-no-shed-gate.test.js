/**
 * THE NO-SHED GUARANTEE, AS A GATE (issue 1363, criterion 7; third test REPLACED at issue 1370).
 */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, relative as relativePath, resolve, sep as pathSeparator } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  ENTITY_TYPE_FIELDS,
  WORLD_IDENTITY_FIELDS,
} from '../src/systems/worldScopeEntityGrouping.js';

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
 * gate green against the defect it exists to catch (issue 1370).
 */
const DEFINITION = new RegExp(
  `^\\s*(?:export\\s+)?(?:async\\s+)?(?:function\\s+)?(?:${NAMES})\\([^)]*\\)\\s*\\{`
);
/** A CALL held as a VALUE rather than invoked by name. */
const VALUE_HELD = new RegExp(`:\\s*(?:${NAMES})\\b(?!\\()`);

// 1. The POSITIVE existence anchor

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

// 2. The CONTENT assertion — three entities in, length three out, verbatim

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

// 3. The recursive walk, rooted at `src/` alone

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
  // REPLACES issue 1363's "no production reader is repointed".
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
