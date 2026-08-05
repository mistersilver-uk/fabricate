/**
 * Issue 1036 — `EssenceDefinition.enabled` and `EssenceDefinition.propertyMacroUuid`
 * persistence, and the authored component quantities a disable must never destroy.
 *
 * `_normalizeEssenceDefinition` has TWO branches (the legacy bare-string shorthand and the
 * object form) and BOTH are whitelist rebuilds that drop any key they do not name, so a
 * field added to only one is lost on the next save — silently, and only for the systems
 * that happen to take the other branch.
 *
 * `enabled` is DEFAULT-TRUE, which carries the inverted-default hazard: a `true` fixture
 * round-trips green through a dropped field, because an absent key reads as `true` at the
 * far end. Every persistence assertion below therefore pins a `false` fixture.
 *
 * The second half of the file is criterion 1: disabling an essence destroys no authored
 * component quantity through ANY of the paths that rebuild a component's essence map.
 * Each carries a negative control — an id genuinely absent from `essenceDefinitions` IS
 * dropped — because without one the assertion passes on a filter that filters nothing.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { installFoundryEnv } from './helpers/foundryEnv.js';

installFoundryEnv();

const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');
const { prepareForImport } = await import('../src/systems/CraftingSystemExporter.js');
const { resolveImportReferences, REFERENCE_KINDS } = await import(
  '../src/systems/importReferenceResolver.js'
);
const { buildComponentEditorState, buildComponentEditorUpdates } = await import(
  '../src/ui/svelte/util/componentEditor.js'
);

function makeManager() {
  const manager = new CraftingSystemManager({ getRecipes: () => [] });
  manager.initialized = true;
  return manager;
}

function normalize(entries) {
  return makeManager()._normalizeEssenceDefinitions(entries);
}

// ---------------------------------------------------------------------------
// Criterion 13 — both fields, both branches, pinned with a `false` fixture
// ---------------------------------------------------------------------------

test('1036/13: the OBJECT branch round-trips a false `enabled`', () => {
  const [definition] = normalize([{ id: 'fire', name: 'Fire', enabled: false }]);
  assert.equal(definition.enabled, false, 'an authored disable survives the whitelist rebuild');
});

test('1036/13: the OBJECT branch defaults an absent `enabled` to true', () => {
  const [definition] = normalize([{ id: 'fire', name: 'Fire' }]);
  assert.equal(Object.hasOwn(definition, 'enabled'), true, 'the KEY is emitted, not merely absent');
  assert.equal(definition.enabled, true);
});

test('1036/13: the LEGACY string branch emits both new fields', () => {
  const [definition] = normalize(['Fire']);
  assert.equal(definition.enabled, true);
  assert.equal(Object.hasOwn(definition, 'propertyMacroUuid'), true);
  assert.equal(definition.propertyMacroUuid, null);
});

test('1036/13: only an explicit `false` disables — every other falsy value reads as enabled', () => {
  const [zero] = normalize([{ id: 'a', enabled: 0 }]);
  const [empty] = normalize([{ id: 'b', enabled: '' }]);
  const [nulled] = normalize([{ id: 'c', enabled: null }]);
  assert.deepEqual(
    [zero.enabled, empty.enabled, nulled.enabled],
    [true, true, true],
    'the predicate is `!== false`, matching every other default-true field in the model'
  );
});

test('1036/13: a false `enabled` survives a full updateSystem round-trip', async () => {
  const manager = makeManager();
  manager.systems.set(
    'sys',
    manager._normalizeSystem({ id: 'sys', name: 'S', features: { essences: true } })
  );

  await manager.updateSystem('sys', {
    essenceDefinitions: [
      { id: 'fire', name: 'Fire', enabled: false, propertyMacroUuid: 'Macro.fire' },
    ],
  });

  const [definition] = manager.getSystem('sys').essenceDefinitions;
  assert.equal(definition.enabled, false, 'the GM save persisted the disable');
  assert.equal(definition.propertyMacroUuid, 'Macro.fire');
});

// ---------------------------------------------------------------------------
// Criterion 7 (normalization half) — the propertyMacroUuid SHAPE check
// ---------------------------------------------------------------------------

test('1036/7: a garbage propertyMacroUuid is dropped to null at normalization', () => {
  for (const garbage of ['not-a-uuid', '', '   ', 42, {}, [], true]) {
    const [definition] = normalize([{ id: 'fire', propertyMacroUuid: garbage }]);
    assert.equal(
      definition.propertyMacroUuid,
      null,
      `\`${JSON.stringify(garbage)}\` is not a document uuid shape`
    );
  }
});

test('1036/7: the shape check stays PERMISSIVE — Item, Actor and Compendium prefixes survive', () => {
  // Deliberately not tightened to /^Macro\./: `foundry.utils.parseUuid` still resolves a
  // legacy four-segment compendium uuid, so a stricter test would reject a usable macro.
  for (const uuid of ['Macro.abc', 'Compendium.world.macros.abc', 'Compendium.mod.pack.Macro.abc']) {
    const [definition] = normalize([{ id: 'fire', propertyMacroUuid: uuid }]);
    assert.equal(definition.propertyMacroUuid, uuid);
  }
});

test('1036: the import reference resolver collects an essence propertyMacroUuid as a MACRO reference', async () => {
  // `collectMacroDescriptors` hardcoded `record.macroUuid` in BOTH its guard and its
  // setter; it now takes the field name, so a REMAP has to reach the essence's own field.
  const { resolved, unresolvedReferences } = await resolveImportReferences(
    {
      system: {
        id: 'sys',
        essenceDefinitions: [{ id: 'fire', name: 'Fire', propertyMacroUuid: 'Macro.fire' }],
      },
      recipes: [],
      gatheringEnvironments: [],
      gatheringConfig: { system: {}, shared: {} },
    },
    { resolveUuid: async () => ({ uuid: 'Macro.relocated' }) }
  );

  const descriptor = unresolvedReferences.find(
    (entry) => entry.kind === REFERENCE_KINDS.MACRO && entry.ownerType === 'essence'
  );
  assert.ok(descriptor, 'the essence macro descriptor is collected');
  assert.equal(descriptor.referenceValue, 'Macro.fire');
  assert.equal(descriptor.ownerName, 'Fire', 'reported under the essence owner type');
  assert.equal(
    resolved.system.essenceDefinitions[0].propertyMacroUuid,
    'Macro.relocated',
    'the remap wrote back to propertyMacroUuid, not to a hardcoded macroUuid'
  );
});

// ---------------------------------------------------------------------------
// Criterion 1 — a disable destroys no authored component quantity
// ---------------------------------------------------------------------------

const CARRIER = { id: 'wood', name: 'Wood', essences: { fire: 3, ghost: 4 } };

function systemWithDisabledFire(manager) {
  return manager._normalizeSystem({
    id: 'sys',
    name: 'S',
    features: { essences: true },
    components: [structuredClone(CARRIER)],
    essenceDefinitions: [
      { id: 'fire', name: 'Fire', enabled: false },
      { id: 'water', name: 'Water' },
    ],
  });
}

test('1036/1: a system save keeps a DISABLED essence in validEssenceIds', () => {
  const system = systemWithDisabledFire(makeManager());
  assert.equal(
    system.components[0].essences.fire,
    3,
    'the disabled essence keeps its authored quantity through _normalizeEssenceQuantities'
  );
});

test('1036/1 negative control: an id genuinely ABSENT from essenceDefinitions IS dropped', () => {
  const system = systemWithDisabledFire(makeManager());
  assert.equal(
    Object.hasOwn(system.components[0].essences, 'ghost'),
    false,
    'the filter really does filter — so the assertion above is not vacuous'
  );
});

test('1036/1: a component editor round-trip preserves a disabled essence quantity', () => {
  const system = systemWithDisabledFire(makeManager());
  const draft = buildComponentEditorState(system, system.components[0]);
  const updates = buildComponentEditorUpdates(draft);

  assert.equal(
    updates.essences.fire,
    3,
    'buildComponentEditorUpdates rebuilds solely from draft.essenceOptions, which stays UNFILTERED'
  );
});

test('1036/1 negative control: the editor round-trip drops a quantity whose essence is undefined', () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({
    id: 'sys',
    name: 'S',
    features: { essences: true },
    components: [{ id: 'wood', name: 'Wood', essences: { fire: 3 } }],
    essenceDefinitions: [{ id: 'water', name: 'Water' }],
  });
  // Re-attach the orphaned quantity that system normalization already stripped, so the
  // editor round-trip is the ONLY filter under test here.
  const updates = buildComponentEditorUpdates(
    buildComponentEditorState(system, { ...system.components[0], essences: { fire: 3 } })
  );

  assert.equal(
    Object.hasOwn(updates.essences, 'fire'),
    false,
    'an essence with no definition has no option row, so the round-trip cannot re-emit it'
  );
});

test('1036/1: applyBulkEditToComponents keeps a staged disabled-essence quantity', async () => {
  const manager = makeManager();
  manager.systems.set('sys', systemWithDisabledFire(manager));

  await manager.applyBulkEditToComponents('sys', ['wood'], {
    essences: { fire: 7, ghost: 9 },
  });

  const { essences } = manager.getSystem('sys').components[0];
  assert.equal(essences.fire, 7, 'the disabled essence is staged and kept');
  assert.equal(
    Object.hasOwn(essences, 'ghost'),
    false,
    'negative control: `validEssenceIds` still drops an undefined id from the same staged map'
  );
});

test('1036/1: prepareForImport carries both new fields, in keep AND copy mode', () => {
  const payload = {
    system: {
      id: 'sys',
      name: 'S',
      components: [],
      essenceDefinitions: [
        { id: 'fire', name: 'Fire', enabled: false, propertyMacroUuid: 'Macro.fire' },
      ],
    },
    recipes: [],
  };

  for (const mode of ['keep', 'copy']) {
    const prepared = prepareForImport(structuredClone(payload), mode);
    const [definition] = prepared.system.essenceDefinitions;
    assert.equal(definition.enabled, false, `${mode}-mode import preserves the disable`);
    assert.equal(definition.propertyMacroUuid, 'Macro.fire', `${mode}-mode import preserves the macro`);
  }
});

test('1036/1: a copy-imported disabled essence still normalizes to a carrying component quantity', () => {
  const manager = makeManager();
  const prepared = prepareForImport(
    {
      system: {
        id: 'sys',
        name: 'S',
        features: { essences: true },
        components: [structuredClone(CARRIER)],
        essenceDefinitions: [{ id: 'fire', name: 'Fire', enabled: false }],
      },
      recipes: [],
    },
    'copy'
  );

  const normalized = manager._normalizeSystem({ ...prepared.system, id: 'sys-copy' });
  assert.equal(
    normalized.components[0].essences.fire,
    3,
    'the copy round-trip did not silently strip the disabled essence quantity'
  );
});
