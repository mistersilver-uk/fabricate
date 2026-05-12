import test from 'node:test';
import assert from 'node:assert/strict';

import { GatheringRichStateService } from '../src/systems/GatheringRichStateService.js';
import { SETTING_KEYS } from '../src/config/settings.js';
import {
  DND5E_CHARACTER_MODIFIER_PRESETS,
  PF2E_CHARACTER_MODIFIER_PRESETS,
  getCharacterModifierPresetsForFoundrySystem,
  seedCharacterModifierPresets
} from '../src/config/gatheringCharacterModifierPresets.js';

function configWithLibrary(entries) {
  return {
    systems: {
      'system-a': {
        characterModifiers: entries
      }
    }
  };
}

function makeService(config = {}, options = {}) {
  const settings = new Map([[SETTING_KEYS.GATHERING_CONFIG, config]]);
  return new GatheringRichStateService({
    getSetting: key => settings.get(key),
    setSetting: async (key, value) => { settings.set(key, value); return value; },
    settingKey: SETTING_KEYS.GATHERING_CONFIG,
    ...options
  });
}

test('normalizes empty characterModifiers to []', () => {
  const service = makeService(configWithLibrary([]));
  const config = service._config();
  assert.deepEqual(config.systems['system-a'].characterModifiers, []);
});

test('coerces malformed library entries and drops invalid ones', () => {
  const service = makeService(configWithLibrary([
    null,
    { id: 'strength', label: 'Strength', icon: 'fa-solid fa-dumbbell', provider: 'dnd5e', expression: '@abilities.str.mod' },
    { label: 'Missing ID', expression: 'whatever' },
    { id: 'invalid-no-expr-or-macro', provider: 'dnd5e' },
    { id: 'macro-only', provider: 'macro', macroUuid: 'Macro.foo' },
    { id: 'unknown-provider', provider: 'made-up', expression: '1' }
  ]));
  const entries = service._config().systems['system-a'].characterModifiers;
  const byId = Object.fromEntries(entries.map(entry => [entry.id, entry]));
  assert.ok(byId.strength, 'strength preserved');
  assert.ok(byId['macro-only'], 'macro-only entry preserved');
  assert.equal(byId['invalid-no-expr-or-macro'], undefined, 'no-expression entry dropped');
  assert.ok(byId['unknown-provider'], 'unknown provider coerced to default');
  assert.equal(byId['unknown-provider'].provider, 'dnd5e', 'unknown provider falls back to dnd5e');
  assert.equal(byId.strength.isRollExpression, false, 'flat actor ref is not roll');
});

test('flags dice and operator expressions as roll expressions', () => {
  const service = makeService(configWithLibrary([
    { id: 'roll-d6', provider: 'dnd5e', label: 'Roll d6', expression: '1d6 + @abilities.str.mod' },
    { id: 'scaled-dice', provider: 'dnd5e', label: 'Scaled', expression: '(@abilities.str.mod)d6' }
  ]));
  const entries = service._config().systems['system-a'].characterModifiers;
  assert.equal(entries.find(e => e.id === 'roll-d6').isRollExpression, true);
  assert.equal(entries.find(e => e.id === 'scaled-dice').isRollExpression, true);
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

test('edited presets persist across normalization', () => {
  const presets = getCharacterModifierPresetsForFoundrySystem('dnd5e');
  const seeded = seedCharacterModifierPresets({ presets }).next;
  seeded[0].label = 'Mighty Strength';
  seeded[0].expression = '@abilities.str.mod + 1';
  const service = makeService(configWithLibrary(seeded));
  const out = service._config().systems['system-a'].characterModifiers;
  const strength = out.find(entry => entry.id === seeded[0].id);
  assert.equal(strength.label, 'Mighty Strength');
  assert.equal(strength.expression, '@abilities.str.mod + 1');
});

test('new system shell has empty character modifier library without auto-seed', () => {
  const service = makeService({ systems: { 'system-a': {} } });
  const out = service._config().systems['system-a'].characterModifiers;
  assert.deepEqual(out, []);
});

test('evaluator injection passes through with kind=characterModifier', async () => {
  const evaluateCalls = [];
  const service = makeService(
    configWithLibrary([{ id: 'str', provider: 'dnd5e', label: 'Strength', expression: '@str' }]),
    {
      evaluateExpression: async (payload) => { evaluateCalls.push(payload); return 3; }
    }
  );
  const composed = service.composeEnvironment({
    id: 'env', craftingSystemId: 'system-a', tasks: [], hazards: []
  }, { id: 'system-a' });
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
  assert.equal(evaluateCalls[0].provider, 'dnd5e');
});
