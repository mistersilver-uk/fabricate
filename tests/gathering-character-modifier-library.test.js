import test from 'node:test';
import assert from 'node:assert/strict';

import { CraftingSystemManager } from '../src/systems/CraftingSystemManager.js';
import { normalizeModifierLibrary } from '../src/systems/modifierLibrary.js';
import { GatheringRichStateService } from '../src/systems/GatheringRichStateService.js';
import { SETTING_KEYS } from '../src/config/settings.js';
import {
  DND5E_CHARACTER_MODIFIER_PRESETS,
  PF2E_CHARACTER_MODIFIER_PRESETS,
  getCharacterModifierPresetsForFoundrySystem,
  seedCharacterModifierPresets
} from '../src/config/gatheringCharacterModifierPresets.js';

// ISSUE 1117 — THE LIBRARY MOVED, SO THIS SUITE MOVED WITH IT.
//
// It used to assert the gathering-config normalizer's per-system `characterModifiers`
// block. There is no such block any more: the ONE library lives on the crafting system as
// `system.modifiers`, and `CraftingSystemManager._normalizeModifierLibrary` owns its shape
// (asserted in `tests/crafting-modifier-config.test.js`). What is left here is what is
// still gathering's own: that the gathering config NO LONGER EMITS a library at all, that
// the d100 resolution path reads the system's, and the preset seeding both surfaces share.

function makeService(config = {}, options = {}) {
  const settings = new Map([[SETTING_KEYS.GATHERING_CONFIG, config]]);
  return new GatheringRichStateService({
    getSetting: key => settings.get(key),
    setSetting: async (key, value) => { settings.set(key, value); return value; },
    settingKey: SETTING_KEYS.GATHERING_CONFIG,
    ...options
  });
}

// THE RETIREMENT, asserted rather than assumed. `normalizeGatheringConfig` is an allowlist
// rebuild, so NOT emitting the key is what deletes it from every world on the next save —
// and that is precisely what makes the 1.23.0 migration's ordering load-bearing.
test('the gathering config no longer emits a character modifier library', () => {
  const service = makeService({
    systems: {
      'system-a': {
        characterModifiers: [{ id: 'strength', label: 'Strength', expression: '@abilities.str.mod' }]
      }
    }
  });
  const systemConfig = service._config().systems['system-a'];
  assert.equal(
    Object.hasOwn(systemConfig, 'characterModifiers'),
    false,
    'the library is a SYSTEM field now; a config that still carried one would be a second ' +
      'location for the same data'
  );
});

// The d100 path resolves references against `system.modifiers`, which is the second
// argument `composeEnvironment` already took for tools.
test('a drop row resolves its reference against the SYSTEM library', async () => {
  const evaluateCalls = [];
  const service = makeService(
    { systems: { 'system-a': {} } },
    { evaluateExpression: async (payload) => { evaluateCalls.push(payload); return 3; } }
  );
  const composed = service.composeEnvironment(
    { id: 'env', craftingSystemId: 'system-a', tasks: [], events: [] },
    { id: 'system-a', modifiers: [{ id: 'str', label: 'Strength', expression: '@str' }] }
  );
  const result = await service.resolveD100Attempt({
    task: {
      id: 'task-evaluator',
      dropRows: [{ id: 'drop-1', componentId: 'herb', quantity: 1, dropRate: 10, characterModifiers: [{ id: 'ref-1', modifierId: 'str', operator: '+' }] }]
    },
    environment: composed,
    actor: { uuid: 'Actor.x' }
  });
  assert.equal(result.status === 'succeeded' || result.status === 'failed', true);
  assert.equal(evaluateCalls.length, 1);
  assert.equal(evaluateCalls[0].kind, 'characterModifier');
  assert.equal(evaluateCalls[0].expression, '@str');
  assert.equal(evaluateCalls[0].provider, undefined);
});

// The negative control for the move: a library left at the OLD location resolves nothing,
// so a reference to it is a misconfiguration rather than a silent success. Without this the
// test above would pass just as well against a read-alias.
test('a library left in the gathering config resolves NOTHING', async () => {
  const service = makeService(
    {
      systems: {
        'system-a': {
          characterModifiers: [{ id: 'str', label: 'Strength', expression: '@str' }]
        }
      }
    },
    { evaluateExpression: async () => 3 }
  );
  const composed = service.composeEnvironment(
    { id: 'env', craftingSystemId: 'system-a', tasks: [], events: [] },
    { id: 'system-a' }
  );
  const result = await service.resolveD100Attempt({
    task: {
      id: 'task-evaluator',
      dropRows: [{ id: 'drop-1', componentId: 'herb', quantity: 1, dropRate: 10, characterModifiers: [{ id: 'ref-1', modifierId: 'str', operator: '+' }] }]
    },
    environment: composed,
    actor: { uuid: 'Actor.x' }
  });
  assert.equal(result.status, 'misconfigured');
  assert.equal(result.diagnostics[0].code, 'MISSING_CHARACTER_MODIFIER');
});

// The preset bundles are unchanged. Since issue 1308 the library they seed is WORLD scope, so
// their output is asserted through the normalizer that owns it rather than through the crafting
// system, which no longer carries a copy.
test('seeded presets survive the library normalizer, edits and all', () => {
  const presets = getCharacterModifierPresetsForFoundrySystem('dnd5e');
  const seeded = seedCharacterModifierPresets({ presets }).next;
  seeded[0].label = 'Mighty Strength';
  seeded[0].expression = '@abilities.str.mod + 1';
  const library = normalizeModifierLibrary(seeded);
  const strength = library.find(entry => entry.id === seeded[0].id);
  assert.equal(strength.label, 'Mighty Strength');
  assert.equal(strength.expression, '@abilities.str.mod + 1');
  assert.equal(strength.isRollExpression, false);
});

// Nothing is auto-seeded, and since issue 1308 a crafting system carries no library key at all:
// the world store owns it, so the system's own copy is SHED rather than emitted empty. Asserting
// `undefined` rather than `[]` is the point — an emitted empty array would be the per-system copy
// coming back, and the allowlist rebuild would then keep overwriting the world library's readers.
test('a new system carries no library key and nothing is auto-seeded', () => {
  const manager = new CraftingSystemManager({ getRecipes: () => [] });
  assert.equal(manager._normalizeSystem({ id: 'sys', name: 'S' }).modifiers, undefined);
  assert.deepEqual(normalizeModifierLibrary(undefined), []);
});

test('seedCharacterModifierPresets adds dnd5e presets idempotently', () => {
  const presets = getCharacterModifierPresetsForFoundrySystem('dnd5e');
  assert.equal(presets, DND5E_CHARACTER_MODIFIER_PRESETS);

  const first = seedCharacterModifierPresets({ presets, currentLibrary: [] });
  assert.ok(first.added.length > 0);
  assert.equal(first.skipped.length, 0);
  assert.equal(first.next.length, presets.length);

  const second = seedCharacterModifierPresets({ presets, currentLibrary: first.next });
  assert.equal(second.added.length, 0);
  assert.equal(second.skipped.length, presets.length);
  assert.equal(second.next.length, presets.length);
});

test('seedCharacterModifierPresets returns no-op for unknown Foundry system', () => {
  const unknown = getCharacterModifierPresetsForFoundrySystem('myz');
  assert.equal(unknown.length, 0);
});

test('seedCharacterModifierPresets supports pf2e bundle', () => {
  const presets = getCharacterModifierPresetsForFoundrySystem('pf2e');
  assert.equal(presets, PF2E_CHARACTER_MODIFIER_PRESETS);
  assert.ok(presets.length >= 6);
  const result = seedCharacterModifierPresets({ presets });
  assert.equal(result.added.length, presets.length);
});
