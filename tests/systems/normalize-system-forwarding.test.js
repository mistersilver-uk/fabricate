/**
 * `CraftingSystemManager._normalizeSystem` must forward to `normalizeSystem` with a basis that is
 * evaluated inside the normalizer (issue 1923), and the split return literal must keep the golden
 * key order that a deep equality cannot see.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

let mintedIds = 0;
globalThis.foundry = {
  utils: { randomID: () => `rid-${String(++mintedIds).padStart(4, '0')}` },
};
globalThis.game = { user: { isGM: true }, system: { id: 'dnd5e' }, actors: [], fabricate: null };
globalThis.ui = { notifications: { warn: () => {}, error: () => {} } };

const { CraftingSystemManager } = await import('../../src/systems/CraftingSystemManager.js');
const { normalizeSystem } = await import('../../src/systems/normalize/system.js');
const { systemScenarios } = await import('../helpers/systemNormalizeCorpus.js');

const GOLDEN = JSON.parse(
  readFileSync(new URL('../fixtures/systemNormalize.golden.json', import.meta.url), 'utf8')
);
const ENCODED_UNDEFINED = '__system-normalize-undefined__';

function decode(value) {
  if (value === ENCODED_UNDEFINED) return undefined;
  if (Array.isArray(value)) return value.map(decode);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, decode(inner)]));
}

function seeded(call) {
  mintedIds = 0;
  return call();
}

const seededScope = (ids) => ({ isSeeded: () => true, entityIds: () => ids });

function knownManager() {
  return new CraftingSystemManager(
    { getRecipes: () => [] },
    {
      characterLibrariesStore: {
        isSeeded: () => true,
        listCharacterPrerequisites: () => [{ id: 'prereq-world' }],
        listModifiers: () => [{ id: 'mod-world' }],
      },
      componentScopeStore: seededScope(['comp-world']),
      essenceScopeStore: seededScope(['ess-world']),
      toolScopeStore: seededScope(['tool-world']),
    }
  );
}

const basisOf = (manager) => ({
  characterLibraryBasis: (system) => manager._characterLibraryBasis(system),
  scopeBasis: (system) => manager._scopeBasis(system),
});

const UNKNOWN_BASIS = Object.freeze({
  characterLibraryBasis: () => ({ prerequisiteIds: null, modifierIds: null }),
  scopeBasis: () => ({
    componentIds: null,
    essenceIds: null,
    toolIds: null,
    componentCategories: null,
    recipeCategories: null,
  }),
});

const LEGACY_ESSENCE_IDS = {
  id: 'sys-legacy-essences',
  essences: ['Fire', 'Water'],
  components: [{ id: 'comp-1', essences: { fire: 2, ghost: 1 } }],
};

const PRUNABLE = {
  id: 'sys-prunable',
  essenceDefinitions: [{ id: 'ess-local' }],
  components: [{ id: 'comp-1', essences: { 'ess-local': 1, 'ess-world': 1, ghost: 1 } }],
  tools: [
    {
      id: 'tool-1',
      name: 'Hammer',
      prerequisites: { enabled: true, ids: ['prereq-world', 'prereq-gone'], gateMode: 'usability' },
    },
  ],
  craftingCheck: { defaultModifierPolicy: 'addAll', defaultModifierIds: ['mod-world', 'gone'] },
};

const FORWARDING = [
  ...systemScenarios(),
  { name: 'legacyEssenceIdArray', system: LEGACY_ESSENCE_IDS },
  { name: 'prunableUnderKnownBasis', system: PRUNABLE },
];

describe('_normalizeSystem forwards to normalizeSystem', () => {
  for (const { name, system } of FORWARDING) {
    it(`under a known basis for ${name}`, () => {
      const manager = knownManager();
      assert.deepStrictEqual(
        seeded(() => manager._normalizeSystem(structuredClone(system))),
        seeded(() => normalizeSystem(structuredClone(system), basisOf(manager)))
      );
    });

    it(`with the basis omitted, reading every half as null, for ${name}`, () => {
      assert.deepStrictEqual(
        seeded(() => normalizeSystem(structuredClone(system))),
        seeded(() => normalizeSystem(structuredClone(system), UNKNOWN_BASIS))
      );
    });
  }

  it('judges a legacy essence id array against its normalized definitions', () => {
    const [component] = knownManager()._normalizeSystem(structuredClone(LEGACY_ESSENCE_IDS))
      .components;
    assert.deepStrictEqual(component.essences, { fire: 2 });
  });

  it('prunes under a known basis and prunes nothing with the basis omitted', () => {
    const known = knownManager()._normalizeSystem(structuredClone(PRUNABLE));
    const omitted = normalizeSystem(structuredClone(PRUNABLE));
    assert.deepStrictEqual(known.components[0].essences, { 'ess-local': 1, 'ess-world': 1 });
    assert.deepStrictEqual(known.tools[0].prerequisites.ids, ['prereq-world']);
    assert.deepStrictEqual(omitted.components[0].essences, PRUNABLE.components[0].essences);
    assert.deepStrictEqual(omitted.tools[0].prerequisites.ids, ['prereq-world', 'prereq-gone']);
  });
});

describe('the golden system scenarios keep their key order', () => {
  const manager = new CraftingSystemManager({ getRecipes: () => [] });
  for (const { name, system } of systemScenarios()) {
    it(name, () => {
      assert.equal(
        JSON.stringify(seeded(() => manager._normalizeSystem(system))),
        JSON.stringify(decode(GOLDEN.systems[name]))
      );
    });
  }
});
