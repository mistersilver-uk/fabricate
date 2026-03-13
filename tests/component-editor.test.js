import test from 'node:test';
import assert from 'node:assert/strict';
import {
  adjustComponentEssenceQuantity,
  buildComponentEditorState,
  buildComponentEditorUpdates,
  clampComponentEssenceQuantity,
  getComponentEditorHintKey,
  getDefaultEssenceIcon
} from '../src/ui/svelte/util/componentEditor.js';

function makeSystem(overrides = {}) {
  return {
    advancedOptionsEnabled: true,
    features: {
      itemTags: false,
      essences: false,
      ...(overrides.features || {})
    },
    itemTags: overrides.itemTags || [],
    tags: overrides.tags || [],
    essenceDefinitions: overrides.essenceDefinitions || [],
    ...overrides
  };
}

function makeItem(overrides = {}) {
  return {
    id: 'comp-1',
    name: 'Blazing Herb',
    tags: overrides.tags || [],
    essences: overrides.essences || {},
    ...overrides
  };
}

test('buildComponentEditorState exposes tag and essence sections when both features are enabled', () => {
  const system = makeSystem({
    features: { itemTags: true, essences: true },
    itemTags: ['fire', 'flora'],
    essenceDefinitions: [
      { id: 'ess-shadow', name: 'Shadow', icon: '' },
      { id: 'ess-fire', name: 'Fire', icon: 'fas fa-fire' }
    ]
  });
  const item = makeItem({
    tags: ['fire'],
    essences: {
      'ess-fire': 2,
      'ess-shadow': 1
    }
  });

  const state = buildComponentEditorState(system, item);

  assert.equal(state.showTags, true);
  assert.equal(state.showEssences, true);
  assert.equal(state.hasEditableFields, true);
  assert.equal(state.hintKey, 'FABRICATE.Admin.Items.Editor.HintTagsAndEssences');
  assert.deepEqual(state.tagOptions, [
    { tag: 'fire', checked: true },
    { tag: 'flora', checked: false }
  ]);
  assert.deepEqual(state.essenceOptions, [
    { id: 'ess-fire', name: 'Fire', icon: 'fas fa-fire', quantity: 2 },
    { id: 'ess-shadow', name: 'Shadow', icon: getDefaultEssenceIcon(), quantity: 1 }
  ]);
});

test('buildComponentEditorState sorts essence options alphabetically by display name', () => {
  const system = makeSystem({
    features: { itemTags: false, essences: true },
    essenceDefinitions: [
      { id: 'ess-zeta', name: 'zeta', icon: 'fas fa-bolt' },
      { id: 'ess-ember', icon: 'fas fa-fire' },
      { id: 'ess-alpha', name: 'Alpha', icon: 'fas fa-feather' }
    ]
  });

  const state = buildComponentEditorState(system, makeItem({
    essences: {
      'ess-alpha': 2,
      'ess-ember': 1,
      'ess-zeta': 3
    }
  }));

  assert.deepEqual(
    state.essenceOptions.map(option => ({ id: option.id, name: option.name, quantity: option.quantity })),
    [
      { id: 'ess-alpha', name: 'Alpha', quantity: 2 },
      { id: 'ess-ember', name: 'ess-ember', quantity: 1 },
      { id: 'ess-zeta', name: 'zeta', quantity: 3 }
    ]
  );
});

test('buildComponentEditorState only refers to tags when essences are disabled', () => {
  const system = makeSystem({
    features: { itemTags: true, essences: false },
    itemTags: ['rare']
  });

  const state = buildComponentEditorState(system, makeItem({ tags: ['rare'] }));

  assert.equal(state.showTags, true);
  assert.equal(state.showEssences, false);
  assert.equal(state.hintKey, 'FABRICATE.Admin.Items.Editor.HintTagsOnly');
  assert.deepEqual(state.essenceOptions, []);
});

test('buildComponentEditorState only refers to essences when tags are disabled', () => {
  const system = makeSystem({
    features: { itemTags: false, essences: true },
    essenceDefinitions: [{ id: 'ess-water', name: 'Water', icon: 'fas fa-tint' }]
  });

  const state = buildComponentEditorState(system, makeItem({ essences: { 'ess-water': 3 } }));

  assert.equal(state.showTags, false);
  assert.equal(state.showEssences, true);
  assert.equal(state.hintKey, 'FABRICATE.Admin.Items.Editor.HintEssencesOnly');
  assert.deepEqual(state.tagOptions, []);
});

test('buildComponentEditorState returns a generic no-fields hint when advanced options are disabled', () => {
  const system = makeSystem({
    advancedOptionsEnabled: false,
    features: { itemTags: true, essences: true },
    itemTags: ['fire'],
    essenceDefinitions: [{ id: 'ess-fire', name: 'Fire', icon: 'fas fa-fire' }]
  });

  const state = buildComponentEditorState(system, makeItem());

  assert.equal(state.showTags, false);
  assert.equal(state.showEssences, false);
  assert.equal(state.hasEditableFields, false);
  assert.equal(state.hintKey, 'FABRICATE.Admin.Items.Editor.NoEditableFields');
});

test('buildComponentEditorUpdates clamps quantities and omits disabled features', () => {
  const updates = buildComponentEditorUpdates({
    showTags: false,
    showEssences: true,
    tagOptions: [{ tag: 'fire', checked: true }],
    essenceOptions: [
      { id: 'ess-fire', quantity: '3.8' },
      { id: 'ess-water', quantity: -1 },
      { id: 'ess-air', quantity: 0 }
    ]
  });

  assert.deepEqual(updates, {
    essences: {
      'ess-fire': 3
    }
  });
});

test('adjustComponentEssenceQuantity increments and clamps at zero', () => {
  assert.equal(adjustComponentEssenceQuantity(2, 1), 3);
  assert.equal(adjustComponentEssenceQuantity(2, -1), 1);
  assert.equal(adjustComponentEssenceQuantity(0, -1), 0);
});

test('clampComponentEssenceQuantity coerces invalid values to non-negative integers', () => {
  assert.equal(clampComponentEssenceQuantity('5.9'), 5);
  assert.equal(clampComponentEssenceQuantity('abc'), 0);
  assert.equal(clampComponentEssenceQuantity(-4), 0);
});

test('getComponentEditorHintKey returns the correct feature-specific copy key', () => {
  assert.equal(
    getComponentEditorHintKey({ showTags: true, showEssences: true }),
    'FABRICATE.Admin.Items.Editor.HintTagsAndEssences'
  );
  assert.equal(
    getComponentEditorHintKey({ showTags: true, showEssences: false }),
    'FABRICATE.Admin.Items.Editor.HintTagsOnly'
  );
  assert.equal(
    getComponentEditorHintKey({ showTags: false, showEssences: true }),
    'FABRICATE.Admin.Items.Editor.HintEssencesOnly'
  );
  assert.equal(
    getComponentEditorHintKey({ showTags: false, showEssences: false }),
    'FABRICATE.Admin.Items.Editor.NoEditableFields'
  );
});
