// The entity-AGNOSTIC half of Scoped Entity Definitions (issue 1358, part of epic 1357).
//
// Every assertion in here holds identically for components, essences and tools, so it is written
// ONCE in `runScopedEntityContract` and driven three times from `ENTITY_CONTRACTS`. That is a
// requirement rather than a preference: SonarCloud's duplication detector reads `tests/**` and does
// not honour `sonar.cpd.exclusions`, so three near-identical copies of these blocks would fail the
// new-code duplication gate on their own.
//
// The genuinely per-entity rules — the component category fallback and its missing `enabled` key,
// the essence soft disable, the tool requirements seed and the breakage authority — live in
// `tests/entity-scope-resolvers.test.js`.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const {
  countInheritingSystems,
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
 */
function adversarialInputs(section) {
  const cyclicSection = { note: 'a section value that points at itself' };
  cyclicSection.self = cyclicSection;
  const cyclicEntry = { id: ENTITY_ID, entityId: ENTITY_ID, systemId: SYSTEM_ID };
  cyclicEntry.self = cyclicEntry;
  return [
    ['a non-array corpus', null],
    ['a non-array corpus that is a number', 42],
    ['a non-array corpus that is a string', 'nope'],
    ['non-object entries', [null, 42, 'nope', true, [], () => {}]],
    ['an id-less entry', [{}, { id: '   ', entityId: '   ', systemId: '  ' }]],
    ['an entry with only one half of the membership key', [{ entityId: ENTITY_ID }]],
    [
      'an unknown section key',
      [{ id: ENTITY_ID, entityId: ENTITY_ID, systemId: SYSTEM_ID, notASection: 'drop me' }],
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
    ],
    [
      'an inherit map missing every section',
      [{ id: ENTITY_ID, entityId: ENTITY_ID, systemId: SYSTEM_ID, inherit: {} }],
    ],
    [
      'a non-object inherit map',
      [{ id: ENTITY_ID, entityId: ENTITY_ID, systemId: SYSTEM_ID, inherit: 7 }],
    ],
    ['a record whose sections are entirely absent', [{ id: ENTITY_ID, entityId: ENTITY_ID, systemId: SYSTEM_ID }]],
    [
      'a self-referential section value',
      [{ id: ENTITY_ID, entityId: ENTITY_ID, systemId: SYSTEM_ID, [section]: cyclicSection }],
    ],
    ['a self-referential entry', [cyclicEntry]],
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
      { entityId: 'other-entity', systemId: SYSTEM_ID },
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
    for (const [why, input] of adversarialInputs(section)) {
      const world = contract.normalizeWorld(input);
      const records = contract.normalizeRecords(input);
      assert.ok(Array.isArray(world), `world defaults answer a list for ${why}`);
      assert.ok(Array.isArray(records), `memberships answer a list for ${why}`);
      for (const entry of world) {
        assert.equal(typeof entry.id, 'string');
        assert.ok(!('notASection' in entry), `an unknown section key is dropped for ${why}`);
      }
      for (const entry of records) {
        assert.equal(membershipKey(entry.entityId, entry.systemId).includes('|'), true);
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
 * `export ... from`, and dynamic `import('…')`.
 */
function extractImportSpecifiers(source) {
  const code = stripComments(source);
  const specifiers = [];
  const patterns = [
    /\b(?:import|export)\b[^'"();]*?\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s+['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of code.matchAll(pattern)) specifiers.push(match[1]);
  }
  return specifiers;
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

test('scopedDefinitions.js imports none of the three scope modules', async () => {
  const source = await readFile(PRIMITIVE_PATH, 'utf8');
  const forbidden = new Set(SCOPE_MODULES.map((name) => path.join(SYSTEMS_DIR, name)));
  const resolved = extractImportSpecifiers(source)
    .filter((specifier) => specifier.startsWith('.'))
    .map((specifier) => path.resolve(path.dirname(PRIMITIVE_PATH), specifier));
  const violations = resolved.filter((target) => forbidden.has(target));
  assert.deepStrictEqual(
    violations,
    [],
    'the dependency runs one way: the scope modules configure the primitive, never the reverse'
  );
});
