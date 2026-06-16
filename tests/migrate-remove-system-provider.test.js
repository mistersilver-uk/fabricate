/**
 * Tests for the 1.3.0 migration (src/migration/migrateRemoveSystemProvider.js):
 * removing the dnd5e/pf2e/macro provider model from gathering gates, checks,
 * tool requirements, and character modifiers (formula-only), deleting macro
 * character modifiers with reference cleanup, and the fail-open/empty-formula
 * edge cases.
 *
 * node:test + node:assert/strict. Pure functions; no Foundry globals.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { migrateRemoveSystemProvider } from '../src/migration/migrateRemoveSystemProvider.js';

function baseFixture() {
  return {
    systems: [
      {
        id: 'sys-1',
        tools: [
          // System requirement: provider/macroUuid stripped, formula kept.
          {
            id: 'tool-system',
            componentId: 'forge',
            requirement: { provider: 'dnd5e', formula: '@flags.proficient', macroUuid: '' },
          },
          // Macro-only requirement (no formula): nulled.
          {
            id: 'tool-macro',
            componentId: 'anvil',
            requirement: { provider: 'macro', macroUuid: 'Macro.req' },
          },
          // Macro requirement that nonetheless carries a formula: formula kept.
          {
            id: 'tool-macro-with-formula',
            componentId: 'hammer',
            requirement: { provider: 'macro', formula: '1d6', macroUuid: 'Macro.req2' },
          },
          // Already null: untouched.
          { id: 'tool-null', componentId: 'pick', requirement: null },
        ],
      },
    ],
    gatheringConfig: {
      systems: {
        'sys-1': {
          characterModifiers: [
            { id: 'strength', label: 'Strength', icon: 'fa-user', provider: 'dnd5e', expression: '@abilities.str.mod' },
            { id: 'macro-mod', label: 'Macro', provider: 'macro', macroUuid: 'Macro.mod' },
          ],
          tasks: [
            {
              id: 'task-a',
              dropRows: [
                {
                  id: 'row-1',
                  characterModifiers: [
                    { id: 'ref-keep', modifierId: 'strength', operator: '+', providerOverride: 'pf2e', macroUuidOverride: 'Macro.x' },
                    { id: 'ref-drop', modifierId: 'macro-mod', operator: '+' },
                  ],
                },
              ],
              staminaCostModifiers: [
                { id: 'ref-stamina-keep', modifierId: 'strength', operator: '-', providerOverride: 'dnd5e' },
                { id: 'ref-stamina-drop', modifierId: 'macro-mod', operator: '+' },
              ],
            },
          ],
          events: [
            {
              id: 'event-1',
              characterModifiers: [
                { id: 'ref-event-keep', modifierId: 'strength', operator: '+', macroUuidOverride: 'Macro.y' },
                { id: 'ref-event-drop', modifierId: 'macro-mod', operator: '-' },
              ],
            },
          ],
        },
      },
    },
    environments: [
      {
        id: 'env-1',
        craftingSystemId: 'sys-1',
        tasks: [
          // System visibility gate: provider stripped, formula/threshold kept.
          {
            id: 'task-system',
            visibility: { provider: 'dnd5e', formula: '@skills.sur.mod', threshold: '12' },
            check: { provider: 'pf2e', formula: '1d20', threshold: '10' },
          },
          // Macro visibility gate with no formula: nulled (fail open). Macro
          // check with no formula: left as { formula: '' }.
          {
            id: 'task-macro',
            visibility: { provider: 'macro', macroUuid: 'Macro.vis' },
            check: { provider: 'macro', macroUuid: 'Macro.chk' },
          },
        ],
      },
    ],
  };
}

test('strips provider/macroUuid from system tool requirements and nulls macro-only requirements', () => {
  const out = migrateRemoveSystemProvider(baseFixture());
  const tools = Object.fromEntries(out.systems[0].tools.map((tool) => [tool.id, tool]));
  assert.deepEqual(tools['tool-system'].requirement, { formula: '@flags.proficient' });
  assert.equal(tools['tool-macro'].requirement, null, 'macro-only requirement nulled');
  assert.deepEqual(tools['tool-macro-with-formula'].requirement, { formula: '1d6' }, 'formula-bearing macro requirement kept');
  assert.equal(tools['tool-null'].requirement, null);
});

test('deletes macro character modifiers and scrubs all three reference sites', () => {
  const out = migrateRemoveSystemProvider(baseFixture());
  const sys = out.gatheringConfig.systems['sys-1'];

  // The macro library entry is gone; the survivor becomes exactly {id,label,icon,expression}.
  const ids = sys.characterModifiers.map((entry) => entry.id);
  assert.deepEqual(ids, ['strength']);
  assert.deepEqual(sys.characterModifiers[0], {
    id: 'strength',
    label: 'Strength',
    icon: 'fa-user',
    expression: '@abilities.str.mod',
  });

  // Drop-row references: macro ref scrubbed, survivor stripped of override fields.
  const dropRefs = sys.tasks[0].dropRows[0].characterModifiers;
  assert.deepEqual(dropRefs.map((ref) => ref.id), ['ref-keep']);
  assert.equal('providerOverride' in dropRefs[0], false);
  assert.equal('macroUuidOverride' in dropRefs[0], false);

  // staminaCostModifiers references scrubbed.
  const staminaRefs = sys.tasks[0].staminaCostModifiers;
  assert.deepEqual(staminaRefs.map((ref) => ref.id), ['ref-stamina-keep']);
  assert.equal('providerOverride' in staminaRefs[0], false);

  // Event references scrubbed.
  const eventRefs = sys.events[0].characterModifiers;
  assert.deepEqual(eventRefs.map((ref) => ref.id), ['ref-event-keep']);
  assert.equal('macroUuidOverride' in eventRefs[0], false);
});

test('strips provider/macroUuid from task visibility and check, fail-open on macro gates', () => {
  const out = migrateRemoveSystemProvider(baseFixture());
  const tasks = Object.fromEntries(out.environments[0].tasks.map((task) => [task.id, task]));

  assert.deepEqual(tasks['task-system'].visibility, { formula: '@skills.sur.mod', threshold: '12' });
  assert.deepEqual(tasks['task-system'].check, { formula: '1d20', threshold: '10' });

  // Macro visibility gate with no formula → nulled (fail open).
  assert.equal(tasks['task-macro'].visibility, null);
  // Macro check with no formula → left as { formula: '' } so the misconfigured
  // diagnostic flags it.
  assert.deepEqual(tasks['task-macro'].check, { formula: '' });
});

test('is idempotent — re-running over migrated data is a no-op', () => {
  const once = migrateRemoveSystemProvider(baseFixture());
  const twice = migrateRemoveSystemProvider(once);
  assert.deepEqual(twice.systems, once.systems);
  assert.deepEqual(twice.gatheringConfig, once.gatheringConfig);
  assert.deepEqual(twice.environments, once.environments);
});

test('does not mutate the input payload', () => {
  const input = baseFixture();
  const snapshot = JSON.parse(JSON.stringify(input));
  migrateRemoveSystemProvider(input);
  assert.deepEqual(input, snapshot, 'input payload is cloned, not mutated');
});

test('passes through absent settings keys without throwing', () => {
  const out = migrateRemoveSystemProvider({});
  assert.equal(out.systems, undefined);
  assert.equal(out.gatheringConfig, undefined);
  assert.equal(out.environments, undefined);
});
