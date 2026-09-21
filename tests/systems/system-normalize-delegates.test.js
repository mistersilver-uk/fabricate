/**
 * Every retained `CraftingSystemManager` normalizer member must FORWARD to its module under
 * `src/systems/normalize/` (issue 1713): twelve of the thirty have no live call site left, so
 * stubbing one to `return null` leaves every covering suite green and only this comparison reds.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

let mintedIds = 0;
globalThis.foundry = {
  utils: { randomID: () => `rid-${String(++mintedIds).padStart(4, '0')}` },
};
globalThis.game = { user: { isGM: true }, system: { id: 'dnd5e' }, actors: [], fabricate: null };
globalThis.ui = { notifications: { warn: () => {}, error: () => {} } };

const { CraftingSystemManager } = await import('../../src/systems/CraftingSystemManager.js');
const { memberScenarios } = await import('../helpers/systemNormalizeCorpus.js');

const MODULES = {
  components: await import('../../src/systems/normalize/components.js'),
  essences: await import('../../src/systems/normalize/essences.js'),
  recipeItems: await import('../../src/systems/normalize/recipeItems.js'),
  salvage: await import('../../src/systems/normalize/salvage.js'),
  systemFields: await import('../../src/systems/normalize/systemFields.js'),
  tools: await import('../../src/systems/normalize/tools.js'),
};

/** The module each retained member delegates to; its export name is the member without the `_`. */
const OWNER = Object.freeze({
  _normalizeTool: 'tools',
  _normalizeToolPrerequisites: 'tools',
  _normalizeToolRequirement: 'tools',
  _normalizeToolBreakage: 'tools',
  _normalizeToolOnBreak: 'tools',
  _normalizeFeatures: 'systemFields',
  _normalizeVisibilityMode: 'systemFields',
  _normalizeRecipeVisibility: 'systemFields',
  _normalizeTeaserConfig: 'systemFields',
  _normalizeRequirements: 'systemFields',
  _normalizeCurrencyConfig: 'systemFields',
  _normalizeStringList: 'systemFields',
  _normalizeAlchemyConfig: 'systemFields',
  _normalizeEssenceDefinitions: 'essences',
  _normalizeEssenceDefinition: 'essences',
  _looksLikeDocumentUuid: 'essences',
  _toKey: 'essences',
  _normalizeEssenceQuantities: 'essences',
  _normalizeRecipeItemDefinitions: 'recipeItems',
  _normalizeRecipeItemCaps: 'recipeItems',
  _normalizeRecipeItemDefinition: 'recipeItems',
  _labelFromUuid: 'recipeItems',
  _normalizeComponent: 'components',
  _salvageNormalizationContext: 'salvage',
  _normalizeSalvage: 'salvage',
  _normalizeToolIds: 'salvage',
  _normalizeSalvageResult: 'salvage',
  _normalizeSalvageResultGroup: 'salvage',
  _normalizeTimeRequirement: 'salvage',
  _normalizeCurrencyRequirement: 'salvage',
});

/** The five members whose only caller was their own cluster; none survives as a delegate. */
const DELETED = Object.freeze([
  '_normalizeTeaserFragment',
  '_normalizeEssenceColorToken',
  '_normalizeEssencePropertyMacroUuid',
  '_uniqueKey',
  '_reconcileWhenSpent',
]);

const exportName = (member) => member.slice(1);
const moduleFor = (member) => MODULES[OWNER[member]];

/**
 * Both sides of every comparison mint from the same seed, so the seven delegates that reach a mint
 * site can deep-equal at all; the mint SEQUENCE is pinned by the equivalence suite instead.
 */
function seeded(call) {
  mintedIds = 0;
  return call();
}

/** A result that could not tell a forwarding delegate from a stub returning it. */
function isVacuous(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string' || Array.isArray(value)) return value.length === 0;
  if (typeof value === 'boolean') return !value;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

/** The forwarding row per member: the corpus scenario carrying an alternative per argument. */
const FORWARDING = memberScenarios().filter((scenario) => scenario.alternatives);

const manager = new CraftingSystemManager({ getRecipes: () => [] });

test('every retained member has exactly one forwarding row', () => {
  assert.deepStrictEqual(
    FORWARDING.map((row) => row.member).toSorted(),
    Object.keys(OWNER).toSorted(),
    'a member gained or lost its forwarding row, so its delegate is no longer proved'
  );
});

for (const [name, module] of Object.entries(MODULES)) {
  test(`${name}.js exports exactly the members it owns`, () => {
    assert.deepStrictEqual(
      Object.keys(module).toSorted(),
      Object.entries(OWNER)
        .filter(([, owner]) => owner === name)
        .map(([member]) => exportName(member))
        .toSorted(),
      'an export appeared or vanished; the cluster-local helpers stay module-private'
    );
  });
}

for (const row of FORWARDING) {
  const target = exportName(row.member);

  test(`${row.member} forwards its full argument list to ${target}`, () => {
    const expected = seeded(() => moduleFor(row.member)[target](...row.args));
    assert.ok(
      !isVacuous(expected),
      `${target} returned nothing for ${row.name}, so the comparison would be vacuous`
    );
    assert.deepStrictEqual(
      seeded(() => manager[row.member](...row.args)),
      expected,
      `${row.member} no longer returns what ${target} returns for the same arguments`
    );
  });

  for (const [index, alternative] of row.alternatives.entries()) {
    test(`${row.member}'s argument ${index} materially changes ${target}`, () => {
      const perturbed = row.args.map((value, at) => (at === index ? alternative : value));
      assert.notDeepStrictEqual(
        seeded(() => moduleFor(row.member)[target](...perturbed)),
        seeded(() => moduleFor(row.member)[target](...row.args)),
        `argument ${index} does not change the result, so the forwarding comparison above could not catch it being dropped, transposed or hard-coded`
      );
    });

    test(`${row.member}'s argument ${index} cannot be dropped unnoticed by ${target}`, () => {
      // An alternative proving the argument matters for SOME value is not enough: the equality
      // above compares `row.args` alone, so the row's OWN value must differ from the default a
      // dropped argument falls back to.
      const dropped = row.args.map((value, at) => (at === index ? undefined : value));
      assert.notDeepStrictEqual(
        seeded(() => moduleFor(row.member)[target](...dropped)),
        seeded(() => moduleFor(row.member)[target](...row.args)),
        `omitting argument ${index} leaves this row's result unchanged, so the forwarding comparison could not catch the delegate dropping it`
      );
    });
  }
}

for (const member of DELETED) {
  test(`${member} is gone from the manager`, () => {
    assert.strictEqual(
      manager[member],
      undefined,
      `${member} has no caller outside its own cluster and no spec, DOMAIN.md or src/ cite; it must not survive as a delegate`
    );
  });
}
