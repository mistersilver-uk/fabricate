// The entity-AGNOSTIC half of Scoped Entity Definitions (issue 1358, part of epic 1357).
//
// Every assertion in here holds identically for components, essences and tools, so it is written
// ONCE in `runScopedEntityContract` and driven three times from `ENTITY_CONTRACTS`. That is a
// requirement rather than a preference: SonarCloud's duplication detector reads `tests/**` and does
// not honour `sonar.cpd.exclusions`, so three near-identical copies of these blocks would fail the
// new-code duplication gate on their own.
//
// The genuinely per-entity rules — the component category fallback and its missing `enabled` key,
// the essence soft disable, the tool repairRequirements seed and the breakage authority — live in
// `tests/entity-scope-resolvers.test.js`.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const {
  MEMBERSHIP_KEY_SEPARATOR,
  countInheritingSystems,
  defineScope,
  findMembership,
  findWorldDefault,
  inheritingSystemIds,
  isSectionInherited,
  membershipKey,
  setSectionInheritance,
} = await import('../src/systems/scopedDefinitions.js');
const {
  COMPONENT_SCOPE,
  normalizeComponentMemberships,
  normalizeComponentWorldDefaults,
  resolveComponent,
} = await import('../src/systems/componentScope.js');
const {
  ESSENCE_SCOPE,
  normalizeEssenceMemberships,
  normalizeEssenceWorldDefaults,
  resolveEssence,
} = await import('../src/systems/essenceScope.js');
const { TOOL_SCOPE, normalizeToolMemberships, normalizeToolWorldDefaults, resolveTool } =
  await import('../src/systems/toolScope.js');

const ENTITY_ID = 'ash-salt';
const OTHER_ENTITY_ID = 'birch-tar';
const SYSTEM_ID = 'blacksmithing';
const OTHER_SYSTEM_ID = 'alchemy';
const THIRD_SYSTEM_ID = 'cooking';

// The RAW world fixtures. Criterion 1 requires a re-inherited resolve to be compared against
// these literals rather than against another `resolve()` call — comparing two resolves would pass
// for a resolver that answered the same wrong value twice.
const ENTITY_CONTRACTS = [
  {
    label: 'component',
    scope: COMPONENT_SCOPE,
    normalizeWorld: normalizeComponentWorldDefaults,
    normalizeRecords: normalizeComponentMemberships,
    resolve: resolveComponent,
    section: 'category',
    worldSections: { category: 'ore' },
    localValue: 'ingot',
  },
  {
    label: 'essence',
    scope: ESSENCE_SCOPE,
    normalizeWorld: normalizeEssenceWorldDefaults,
    normalizeRecords: normalizeEssenceMemberships,
    resolve: resolveEssence,
    section: 'effectSource',
    worldSections: {
      effectSource: { mode: 'transfer', itemUuid: 'Item.world' },
      macro: { uuid: 'Macro.world' },
    },
    localValue: { mode: 'transfer', itemUuid: 'Item.local' },
  },
  {
    label: 'tool',
    scope: TOOL_SCOPE,
    normalizeWorld: normalizeToolWorldDefaults,
    normalizeRecords: normalizeToolMemberships,
    resolve: resolveTool,
    section: 'breakage',
    worldSections: {
      breakage: { mode: 'limitedUses', maxUses: 3, checkBreakable: true },
      onBreak: { mode: 'destroy' },
    },
    localValue: { mode: 'breakageChance', breakageChance: 40, checkBreakable: false },
  },
];

/**
 * The adversarial inputs criterion 7 enumerates, built fresh per call so one suite's mutation
 * cannot leak into another's.
 *
 * EVERY CASE CARRIES ITS EXPECTED OUTPUT LENGTH, because "DROPPED rather than repaired"
 * (`## Scoped Entity Definitions` requirement 10) is a statement about a COUNT and a shape
 * assertion cannot see it: a normalizer that repaired an id-less entry to `{ id: '' }` still
 * satisfies `typeof entry.id === 'string'` on every entry it emits.
 *
 * @param {string} section
 * @returns {Array<[string, unknown, number, number]>} why, input, expected world length, expected
 *   membership length.
 */
function adversarialInputs(section) {
  const cyclicSection = { note: 'a section value that points at itself' };
  cyclicSection.self = cyclicSection;
  const cyclicEntry = { id: ENTITY_ID, entityId: ENTITY_ID, systemId: SYSTEM_ID };
  cyclicEntry.self = cyclicEntry;
  return [
    ['a non-array corpus', null, 0, 0],
    ['a non-array corpus that is a number', 42, 0, 0],
    ['a non-array corpus that is a string', 'nope', 0, 0],
    [
      'a non-array corpus that is a plain OBJECT record',
      { id: ENTITY_ID, entityId: ENTITY_ID, systemId: SYSTEM_ID },
      0,
      0,
    ],
    ['non-object entries', [null, 42, 'nope', true, [], () => {}], 0, 0],
    ['an id-less entry', [{}, { id: '   ', entityId: '   ', systemId: '  ' }], 0, 0],
    [
      'an entry carrying only one half of the membership key',
      [{ entityId: ENTITY_ID }, { systemId: SYSTEM_ID }, 42],
      0,
      0,
    ],
    [
      'an unknown section key',
      [{ id: ENTITY_ID, entityId: ENTITY_ID, systemId: SYSTEM_ID, notASection: 'drop me' }],
      1,
      1,
    ],
    [
      'an unknown key in the inherit map',
      [
        {
          id: ENTITY_ID,
          entityId: ENTITY_ID,
          systemId: SYSTEM_ID,
          inherit: { notASection: false, [section]: 'not a boolean' },
        },
      ],
      1,
      1,
    ],
    [
      'an inherit map missing every section',
      [{ id: ENTITY_ID, entityId: ENTITY_ID, systemId: SYSTEM_ID, inherit: {} }],
      1,
      1,
    ],
    [
      'a non-object inherit map',
      [{ id: ENTITY_ID, entityId: ENTITY_ID, systemId: SYSTEM_ID, inherit: 7 }],
      1,
      1,
    ],
    [
      'a record whose sections are entirely absent',
      [{ id: ENTITY_ID, entityId: ENTITY_ID, systemId: SYSTEM_ID }],
      1,
      1,
    ],
    [
      'a self-referential section value',
      [{ id: ENTITY_ID, entityId: ENTITY_ID, systemId: SYSTEM_ID, [section]: cyclicSection }],
      1,
      1,
    ],
    ['a self-referential entry', [cyclicEntry], 1, 1],
  ];
}

/**
 * Build a normalized world default and a normalized membership record for one entity.
 */
function seedCorpus(contract, { systemId = SYSTEM_ID } = {}) {
  const worldDefaults = contract.normalizeWorld([{ id: ENTITY_ID, ...contract.worldSections }]);
  const memberships = contract.normalizeRecords([{ entityId: ENTITY_ID, systemId }]);
  return {
    worldDefault: findWorldDefault(worldDefaults, ENTITY_ID),
    membership: findMembership(memberships, ENTITY_ID, systemId),
  };
}

/**
 * The whole entity-agnostic contract, driven once per entity type.
 *
 * @param {object} contract One entry of ENTITY_CONTRACTS.
 */
function runScopedEntityContract(contract) {
  const { label, section, localValue, worldSections } = contract;

  test(`${label} scope: sections are populated for a non-member, and member gates the answer`, () => {
    const { worldDefault } = seedCorpus(contract);
    const resolved = contract.resolve(worldDefault, null);
    assert.equal(resolved.member, false, 'an absent membership record is not a member');
    for (const key of contract.scope.sections) {
      assert.deepStrictEqual(
        resolved[key],
        worldSections[key],
        `${key} falls to the world defaults even for a non-member`
      );
      assert.equal(resolved.inherited[key], true, `${key} reads as inherited with no record`);
    }
  });

  test(`${label} scope: a present record is a member and still inherits by default`, () => {
    const { worldDefault, membership } = seedCorpus(contract);
    const resolved = contract.resolve(worldDefault, membership);
    assert.equal(resolved.member, true, 'a present record is a member');
    for (const key of contract.scope.sections) {
      assert.deepStrictEqual(resolved[key], worldSections[key], `${key} is inherited`);
      assert.equal(resolved.inherited[key], true, `${key} reads as inherited`);
    }
    assert.deepStrictEqual(
      membership.inherit,
      {},
      'a record created by "add to system" omits every section from its inherit map'
    );
  });

  test(`${label} scope: overriding a section seeds it from the world and wins wholesale`, () => {
    const { worldDefault, membership } = seedCorpus(contract);
    const overridden = setSectionInheritance(membership, section, false, worldDefault);
    assert.deepStrictEqual(
      overridden[section],
      worldSections[section],
      'turning the switch off seeds the local block, so no field is blank on first override'
    );
    assert.equal(isSectionInherited(overridden, section), false);

    const edited = { ...overridden, [section]: localValue };
    const resolved = contract.resolve(worldDefault, edited);
    assert.deepStrictEqual(resolved[section], localValue, 'the override wins wholesale');
    assert.equal(resolved.inherited[section], false);
  });

  test(`${label} scope: an overriding switch that stores NO value still answers the world value`, () => {
    // This record is REACHABLE, not adversarial junk: `setSectionInheritance` produces it whenever
    // the world default is itself unauthored, and `normalizeMembership` emits it for import,
    // copy-mode and the 1.30.0 migration — none of which go near the UI's seeding path. Resolving
    // it as an override of nothing means a tool that stops breaking, or an essence whose property
    // macro silently stops running.
    const { worldDefault } = seedCorpus(contract);
    const [record] = contract.normalizeRecords([
      { entityId: ENTITY_ID, systemId: SYSTEM_ID, inherit: { [section]: false } },
    ]);
    assert.ok(!(section in record), 'the normalizer preserves switch-off-with-no-value as authored');
    assert.equal(record.inherit[section], false, 'the switch is kept, never repaired back to true');

    const resolved = contract.resolve(worldDefault, record);
    assert.deepStrictEqual(
      resolved[section],
      worldSections[section],
      'an ABSENT section is not an override, so the world value shows rather than nothing'
    );
    assert.equal(
      resolved.inherited[section],
      false,
      'the switch is still reported AS AUTHORED: off, with the world value showing, is the seed state'
    );
  });

  test(`${label} scope: setSectionInheritance answers a NEW record and never mutates its input`, () => {
    const { worldDefault, membership } = seedCorpus(contract);
    const beforeOverride = structuredClone(membership);
    const overridden = setSectionInheritance(membership, section, false, worldDefault);
    assert.notEqual(overridden, membership, 'the answer is a NEW record');
    assert.notEqual(overridden.inherit, membership.inherit, 'the inherit map is copied, not shared');
    assert.deepStrictEqual(
      membership,
      beforeOverride,
      'the caller keeps its record unchanged: PR 5 wires this to Svelte $state, where an in-place mutation never re-renders'
    );

    const beforeReInherit = structuredClone(overridden);
    const reInherited = setSectionInheritance(overridden, section, true, worldDefault);
    assert.notEqual(reInherited, overridden, 'the re-inherit direction answers a NEW record too');
    assert.deepStrictEqual(overridden, beforeReInherit, 'and leaves its input untouched');
  });

  test(`${label} scope: the lookups key on the right entity AND the right system`, () => {
    const worldDefaults = contract.normalizeWorld([
      { id: ENTITY_ID, ...worldSections },
      { id: OTHER_ENTITY_ID, [section]: localValue },
    ]);
    assert.equal(worldDefaults.length, 2, 'a two-entity corpus, so position cannot stand in for id');
    assert.deepStrictEqual(
      findWorldDefault(worldDefaults, OTHER_ENTITY_ID)?.[section],
      localValue,
      'the SECOND entity is found by id, not by position'
    );
    assert.deepStrictEqual(findWorldDefault(worldDefaults, ENTITY_ID)?.[section], worldSections[section]);
    assert.equal(findWorldDefault(worldDefaults, 'no-such-entity'), null, 'an unknown id answers null');

    const memberships = contract.normalizeRecords([
      { entityId: ENTITY_ID, systemId: SYSTEM_ID },
      { entityId: ENTITY_ID, systemId: OTHER_SYSTEM_ID },
      { entityId: OTHER_ENTITY_ID, systemId: SYSTEM_ID },
      { entityId: OTHER_ENTITY_ID, systemId: OTHER_SYSTEM_ID },
    ]);
    assert.equal(memberships.length, 4, 'two entities across two systems');
    for (const entityId of [ENTITY_ID, OTHER_ENTITY_ID]) {
      for (const systemId of [SYSTEM_ID, OTHER_SYSTEM_ID]) {
        const found = findMembership(memberships, entityId, systemId);
        assert.equal(found?.entityId, entityId, `the entity half of (${entityId}, ${systemId}) is keyed on`);
        assert.equal(found?.systemId, systemId, `the system half of (${entityId}, ${systemId}) is keyed on`);
      }
    }
    assert.equal(
      findMembership(memberships, ENTITY_ID, THIRD_SYSTEM_ID),
      null,
      'a known entity in an unknown system is not a member'
    );
    assert.equal(findMembership(memberships, 'no-such-entity', SYSTEM_ID), null);
  });

  test(`${label} scope: re-inheriting resolves to the raw world fixture and RETAINS the override`, () => {
    const { worldDefault, membership } = seedCorpus(contract);
    const overridden = setSectionInheritance(membership, section, false, worldDefault);
    const edited = { ...overridden, [section]: localValue };
    const reInherited = setSectionInheritance(edited, section, true, worldDefault);

    // (a) resolves deep-equal to the RAW world fixture, not to another resolve() call.
    const resolved = contract.resolve(worldDefault, reInherited);
    assert.deepStrictEqual(resolved[section], worldSections[section]);
    assert.equal(resolved.inherited[section], true);

    // (b) the stored record still carries the local override, dormant.
    const stored = contract.normalizeRecords([reInherited])[0];
    assert.deepStrictEqual(
      stored[section],
      localValue,
      'a dormant override survives normalization; re-inheriting flips the switch only'
    );
    assert.equal(stored.inherit[section], true);

    // Re-overriding RESTORES the retained value rather than re-seeding from the world.
    const reOverridden = setSectionInheritance(stored, section, false, worldDefault);
    assert.deepStrictEqual(reOverridden[section], localValue);
    assert.deepStrictEqual(
      contract.resolve(worldDefault, reOverridden)[section],
      localValue,
      're-overriding restores the retained values rather than re-seeding'
    );
  });

  test(`${label} scope: the inherit count names only the systems that inherit`, () => {
    const worldDefaults = contract.normalizeWorld([{ id: ENTITY_ID, ...worldSections }]);
    const worldDefault = findWorldDefault(worldDefaults, ENTITY_ID);
    const overriding = setSectionInheritance(
      { entityId: ENTITY_ID, systemId: OTHER_SYSTEM_ID },
      section,
      false,
      worldDefault
    );
    const memberships = contract.normalizeRecords([
      { entityId: ENTITY_ID, systemId: SYSTEM_ID },
      overriding,
      { entityId: ENTITY_ID, systemId: THIRD_SYSTEM_ID },
      { entityId: OTHER_ENTITY_ID, systemId: SYSTEM_ID },
    ]);
    assert.deepStrictEqual(inheritingSystemIds(memberships, ENTITY_ID, section), [
      SYSTEM_ID,
      THIRD_SYSTEM_ID,
    ]);
    assert.equal(countInheritingSystems(memberships, ENTITY_ID, section), 2);
    assert.equal(
      countInheritingSystems(memberships, 'unknown-entity', section),
      0,
      'a system with no membership record is not counted: the entity does not exist there'
    );
  });

  test(`${label} scope: normalization is total and non-throwing on adversarial input`, () => {
    for (const [why, input, expectedWorld, expectedRecords] of adversarialInputs(section)) {
      const world = contract.normalizeWorld(input);
      const records = contract.normalizeRecords(input);
      assert.ok(Array.isArray(world), `world defaults answer a list for ${why}`);
      assert.ok(Array.isArray(records), `memberships answer a list for ${why}`);
      // The COUNT is the assertion that "dropped rather than repaired" lives or dies on.
      assert.equal(world.length, expectedWorld, `world defaults DROP rather than repair ${why}`);
      assert.equal(records.length, expectedRecords, `memberships DROP rather than repair ${why}`);
      for (const entry of world) {
        assert.equal(typeof entry.id, 'string');
        assert.ok(entry.id.trim().length > 0, `no entry is repaired to a blank id for ${why}`);
        assert.ok(!('notASection' in entry), `an unknown section key is dropped for ${why}`);
      }
      for (const entry of records) {
        assert.equal(
          membershipKey(entry.entityId, entry.systemId),
          `${entry.entityId}${MEMBERSHIP_KEY_SEPARATOR}${entry.systemId}`,
          `the key composes entity THEN system for ${why}`
        );
        assert.ok(entry.entityId.trim().length > 0, `neither half of the key is blank for ${why}`);
        assert.ok(entry.systemId.trim().length > 0, `neither half of the key is blank for ${why}`);
        assert.ok(!('notASection' in entry), `an unknown section key is dropped for ${why}`);
        assert.ok(
          !('notASection' in entry.inherit),
          `an unknown key in the inherit map is dropped for ${why}`
        );
        for (const value of Object.values(entry.inherit)) {
          assert.equal(typeof value, 'boolean', `the inherit map holds only booleans for ${why}`);
        }
      }
    }
  });

  test(`${label} scope: a non-boolean inherit value is DROPPED rather than coerced`, () => {
    const { worldDefault } = seedCorpus(contract);
    // The `typeof value === 'boolean'` sweep in the adversarial test above CANNOT see a
    // coercion — `Boolean(x)` satisfies it by construction — and a TRUTHY non-boolean coerces
    // to the same `true` a dropped key resolves to. Only the ABSENCE of the key, plus the
    // resolve a FALSY one would otherwise flip, can tell dropped from coerced.
    for (const notABoolean of ['yes', 0, '', null, 1, {}]) {
      const [record] = contract.normalizeRecords([
        { entityId: ENTITY_ID, systemId: SYSTEM_ID, inherit: { [section]: notABoolean } },
      ]);
      const shown = JSON.stringify(notABoolean);
      assert.ok(
        !(section in record.inherit),
        `a non-boolean ${shown} is DROPPED from the inherit map rather than coerced`
      );
      assert.equal(
        contract.resolve(worldDefault, record).inherited[section],
        true,
        `a dropped ${shown} leaves ${section} INHERITING rather than overriding`
      );
    }
  });

  test(`${label} scope: a record with no authored sections carries no section keys`, () => {
    const [world] = contract.normalizeWorld([{ id: ENTITY_ID }]);
    const [record] = contract.normalizeRecords([{ entityId: ENTITY_ID, systemId: SYSTEM_ID }]);
    for (const key of contract.scope.sections) {
      assert.ok(!(key in world), `an unauthored ${key} stays ABSENT rather than becoming null`);
      assert.ok(!(key in record), `an unauthored ${key} stays ABSENT on the membership record`);
    }
  });

  test(`${label} scope: normalization is idempotent across the whole adversarial fixture set`, () => {
    const fixtures = [
      ...adversarialInputs(section).map(([, input]) => input),
      [{ id: ENTITY_ID, ...worldSections }],
      [{ entityId: ENTITY_ID, systemId: SYSTEM_ID, inherit: { [section]: false }, [section]: localValue }],
      [
        { entityId: ENTITY_ID, systemId: SYSTEM_ID },
        { entityId: ENTITY_ID, systemId: SYSTEM_ID, [section]: localValue },
      ],
    ];
    for (const fixture of fixtures) {
      const world = contract.normalizeWorld(fixture);
      assert.deepStrictEqual(contract.normalizeWorld(world), world);
      const records = contract.normalizeRecords(fixture);
      assert.deepStrictEqual(contract.normalizeRecords(records), records);
    }
  });

  test(`${label} scope: ids are trimmed and the corpus is de-duplicated first-wins`, () => {
    const world = contract.normalizeWorld([
      { id: `  ${ENTITY_ID}  `, ...worldSections },
      { id: ENTITY_ID, [section]: localValue },
    ]);
    assert.equal(world.length, 1);
    assert.equal(world[0].id, ENTITY_ID);
    assert.deepStrictEqual(world[0][section], worldSections[section], 'the first entry wins');

    const records = contract.normalizeRecords([
      { entityId: ` ${ENTITY_ID} `, systemId: ` ${SYSTEM_ID} ` },
      { entityId: ENTITY_ID, systemId: SYSTEM_ID, [section]: localValue },
      { entityId: ENTITY_ID, systemId: OTHER_SYSTEM_ID },
    ]);
    assert.equal(records.length, 2, 'de-duplication is on the (entityId, systemId) PAIR');
    assert.deepStrictEqual(
      records.map((entry) => entry.systemId),
      [SYSTEM_ID, OTHER_SYSTEM_ID]
    );
    assert.ok(!(section in records[0]), 'the first record of a duplicated pair wins');
  });
}

for (const contract of ENTITY_CONTRACTS) runScopedEntityContract(contract);

// --- The primitive's own two invariants ---------------------------------------------------------

test('membershipKey composes entity THEN system around the separator, exactly', () => {
  // Written as a LITERAL rather than as `${a}${SEP}${b}`, which would re-implement the function
  // under test and pin nothing about the separator. The argument order matters beyond aesthetics:
  // this key IS the persisted record identity that the first-wins de-duplication reads.
  assert.equal(membershipKey('ash-salt', 'blacksmithing'), 'ash-salt|blacksmithing');
  assert.equal(MEMBERSHIP_KEY_SEPARATOR, '|');
  assert.notEqual(
    membershipKey('ash-salt', 'blacksmithing'),
    membershipKey('blacksmithing', 'ash-salt'),
    'the two halves are not interchangeable'
  );
});

test('defineScope answers a frozen descriptor over a DEFENSIVE copy of the section list', () => {
  const source = ['alpha', 'beta'];
  const scope = defineScope({ sections: source });
  source.push('gamma');
  assert.deepStrictEqual(
    scope.sections,
    ['alpha', 'beta'],
    'the caller cannot extend a scope after defining it: the list is copied, not captured'
  );
  assert.ok(Object.isFrozen(scope), 'the descriptor itself is frozen');
  assert.ok(Object.isFrozen(scope.sections), 'and so is its section list');
  assert.throws(() => scope.sections.push('delta'), TypeError, 'the frozen list refuses a push');
  assert.throws(() => {
    scope.enableable = true;
  }, TypeError, 'the frozen descriptor refuses a structural flip');
});

// --- The dependency boundary (criterion 9) ----------------------------------------------------
//
// PARSED, never substring-searched. A substring search is defeated by any indirection or barrel
// re-export and is false-failed by an unrelated comment, so this extracts real specifiers and
// resolves them relative to the file. Comments are stripped first for the same reason.

const SYSTEMS_DIR = fileURLToPath(new URL('../src/systems/', import.meta.url));
const PRIMITIVE_PATH = path.join(SYSTEMS_DIR, 'scopedDefinitions.js');
const SCOPE_MODULES = ['componentScope.js', 'essenceScope.js', 'toolScope.js'];

function stripComments(source) {
  return source.replace(/\/\*[\S\s]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/**
 * Every module specifier the file really imports: `import ... from`, bare `import '…'`, re-export
 * `export ... from`, and dynamic `import('…')` in BOTH its quoted and its template-literal
 * spellings.
 *
 * The template-literal pattern deliberately refuses an interpolation (`[^`$]`), because a computed
 * specifier is not a specifier this extractor can read — `assertEveryDynamicImportIsReadable`
 * below fails such a file outright rather than letting it pass as "no forbidden import found".
 */
function extractImportSpecifiers(source) {
  const code = stripComments(source);
  const specifiers = [];
  const patterns = [
    /\b(?:import|export)\b[^'"();]*?\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s+['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bimport\s*\(\s*`([^`$]+)`\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of code.matchAll(pattern)) specifiers.push(match[1]);
  }
  return specifiers;
}

/**
 * Every `import(` in the file opens with a readable string literal.
 *
 * Without this the boundary guard is only as strong as the extractor: a computed or concatenated
 * dynamic specifier reads as ZERO specifiers, and "no forbidden import found" is then vacuously
 * true. ESLint cannot cover this half at all — `no-restricted-imports` does not analyse dynamic
 * imports in any form — so the whole dynamic boundary rests here.
 */
function assertEveryDynamicImportIsReadable(code, where) {
  const openings = [...code.matchAll(/\bimport\s*\(/g)];
  for (const opening of openings) {
    const tail = code.slice(opening.index + opening[0].length);
    assert.match(
      tail,
      /^\s*(?:['"][^'"]*['"]|`[^`$]*`)\s*\)/,
      `${where}: every dynamic import must name a literal specifier this guard can read`
    );
  }
}

/**
 * Both spellings a relative specifier may take: Node's ESM resolver demands the extension, but the
 * bundler and the editor do not, so `'./componentScope'` is a real thing a future edit can write.
 */
function candidateTargets(fromFile, specifier) {
  const resolved = path.resolve(path.dirname(fromFile), specifier);
  return [resolved, `${resolved}.js`];
}

test('the specifier extractor is not vacuous: it finds the imports the scope modules really have', async () => {
  for (const name of SCOPE_MODULES) {
    const source = await readFile(path.join(SYSTEMS_DIR, name), 'utf8');
    const specifiers = extractImportSpecifiers(source);
    assert.ok(
      specifiers.includes('./scopedDefinitions.js'),
      `${name} imports the primitive, and the extractor sees it`
    );
  }
});

test('the extractor reads every spelling a reverse edge could take', () => {
  // Four spellings, and none of them is hypothetical: ESLint's `no-restricted-imports` sees only
  // the first two (and only when the pattern list carries the extensionless form as well), and it
  // does not analyse `import()` in ANY form. So the extractor has to read all four itself.
  const sample = [
    "import { x } from './componentScope.js';",
    "export { y } from './essenceScope';",
    "const a = await import('./toolScope');",
    'const b = await import(`./componentScope.js`);',
  ].join('\n');
  assert.deepStrictEqual(extractImportSpecifiers(sample), [
    './componentScope.js',
    './essenceScope',
    './toolScope',
    './componentScope.js',
  ]);
});

test('the dynamic-import readability guard rejects a specifier it cannot read', () => {
  assert.throws(
    () => assertEveryDynamicImportIsReadable('const m = await import(NAME);', 'sample'),
    'a computed specifier fails the guard rather than reading as zero imports'
  );
  assert.throws(
    () => assertEveryDynamicImportIsReadable('await import(`./${name}.js`);', 'sample'),
    'and so does an interpolated template literal'
  );
  assertEveryDynamicImportIsReadable("await import('./ok.js');", 'sample');
  assertEveryDynamicImportIsReadable('await import(`./ok.js`);', 'sample');
});

test('scopedDefinitions.js imports none of the three scope modules, in any spelling', async () => {
  const source = await readFile(PRIMITIVE_PATH, 'utf8');
  const code = stripComments(source);
  assertEveryDynamicImportIsReadable(code, 'scopedDefinitions.js');
  const forbidden = new Set(SCOPE_MODULES.map((name) => path.join(SYSTEMS_DIR, name)));
  const violations = extractImportSpecifiers(source)
    .filter((specifier) => specifier.startsWith('.'))
    .flatMap((specifier) => candidateTargets(PRIMITIVE_PATH, specifier))
    .filter((target) => forbidden.has(target));
  assert.deepStrictEqual(
    violations,
    [],
    'the dependency runs one way: the scope modules configure the primitive, never the reverse'
  );
});

test('the boundary guard is not vacuous: an extensionless reverse edge is caught', () => {
  // Proving the guard CAN fail, on the exact spelling that slipped past the r1 extractor.
  const forbidden = new Set(SCOPE_MODULES.map((name) => path.join(SYSTEMS_DIR, name)));
  for (const specifier of ['./componentScope', './toolScope.js', './essenceScope']) {
    const caught = candidateTargets(PRIMITIVE_PATH, specifier).filter((target) =>
      forbidden.has(target)
    );
    assert.equal(caught.length, 1, `${specifier} resolves onto a forbidden module`);
  }
});
