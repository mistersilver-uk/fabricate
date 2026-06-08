/**
 * Fix 4 — `resolveItemUuidToTool`: map a dropped Foundry Item uuid to a
 * crafting-system Tool by matching the item against each tool's managed-component
 * source refs (reusing `itemMatchesComponentSource`). Pure + injected fakes; no
 * live Foundry. Also covers the `classifyInteractableDrop` Tier-2 integration.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveItemUuidToTool } from '../../src/canvas/interactableItemResolution.js';
import { classifyInteractableDrop } from '../../src/canvas/interactableResolution.js';

// A component carries source-uuid refs; a tool references it by componentId.
function systemWith({ id, tools, components }) {
  return { id, tools, components };
}

// World item with a uuid that a component claims as its source.
const AXE_ITEM = { uuid: 'Item.axe-1', _stats: { compendiumSource: 'Compendium.world.tools.Item.axe-src' } };

function getSystems() {
  return [
    systemWith({
      id: 'sysA',
      components: [
        { id: 'comp-axe', sourceItemUuid: 'Item.axe-1' },
        { id: 'comp-pick', sourceItemUuid: 'Item.pick-1' }
      ],
      tools: [
        { id: 'tool-axe', componentId: 'comp-axe', label: 'Woodaxe' },
        { id: 'tool-pick', componentId: 'comp-pick', label: 'Pickaxe' }
      ]
    })
  ];
}

test('matches a dropped item to a tool by the tool component source ref', () => {
  const match = resolveItemUuidToTool('Item.axe-1', {
    resolveItem: (uuid) => (uuid === 'Item.axe-1' ? AXE_ITEM : null),
    getSystems
  });
  assert.deepEqual(match, { systemId: 'sysA', toolId: 'tool-axe' });
});

test('matches via the compendium source-uuid chain (itemMatchesComponentSource reuse)', () => {
  // The component claims the item's compendium source rather than its live uuid.
  const systems = [systemWith({
    id: 'sysB',
    components: [{ id: 'comp-axe', sourceUuid: 'Compendium.world.tools.Item.axe-src' }],
    tools: [{ id: 'tool-axe', componentId: 'comp-axe' }]
  })];
  const match = resolveItemUuidToTool('Item.axe-1', {
    resolveItem: () => AXE_ITEM,
    getSystems: () => systems
  });
  assert.deepEqual(match, { systemId: 'sysB', toolId: 'tool-axe' });
});

test('returns null when no tool component matches the item', () => {
  const match = resolveItemUuidToTool('Item.unrelated', {
    resolveItem: () => ({ uuid: 'Item.unrelated' }),
    getSystems
  });
  assert.equal(match, null);
});

test('degrades to null (no throw) when the item cannot be resolved synchronously', () => {
  // A compendium uuid that fromUuidSync cannot resolve → resolveItem returns null.
  const match = resolveItemUuidToTool('Compendium.pack.Item.unloaded', {
    resolveItem: () => null,
    getSystems
  });
  assert.equal(match, null);
});

test('returns null for a missing uuid or missing deps (defensive)', () => {
  assert.equal(resolveItemUuidToTool('', { resolveItem: () => AXE_ITEM, getSystems }), null);
  assert.equal(resolveItemUuidToTool('Item.axe-1', {}), null);
});

test('prefers the active/selected system on an ambiguous match, then any system (first-match documented)', () => {
  // Two systems each map the item to a tool; the preferred system wins.
  const systems = [
    systemWith({
      id: 'sysFirst',
      components: [{ id: 'c', sourceItemUuid: 'Item.axe-1' }],
      tools: [{ id: 'tool-first', componentId: 'c' }]
    }),
    systemWith({
      id: 'sysPreferred',
      components: [{ id: 'c', sourceItemUuid: 'Item.axe-1' }],
      tools: [{ id: 'tool-preferred', componentId: 'c' }]
    })
  ];

  const preferred = resolveItemUuidToTool('Item.axe-1', {
    resolveItem: () => AXE_ITEM,
    getSystems: () => systems,
    getPreferredSystemId: () => 'sysPreferred'
  });
  assert.deepEqual(preferred, { systemId: 'sysPreferred', toolId: 'tool-preferred' }, 'the preferred system is scanned first');

  // With no preference, the first system in natural order wins (documented).
  const natural = resolveItemUuidToTool('Item.axe-1', {
    resolveItem: () => AXE_ITEM,
    getSystems: () => systems
  });
  assert.deepEqual(natural, { systemId: 'sysFirst', toolId: 'tool-first' }, 'no preference ⇒ first-match in natural order');
});

// --- classifyInteractableDrop Tier-2 integration ----------------------------

test('classifyInteractableDrop routes a real {type:Item, uuid} drop to a TOOL via the resolver', () => {
  const deps = {
    getTool: ({ systemId, toolId }) => (systemId === 'sysA' && toolId === 'tool-axe' ? { id: 'tool-axe', componentId: 'comp-axe' } : null),
    getTask: () => null,
    resolveItemUuidToTool: (uuid) => resolveItemUuidToTool(uuid, {
      resolveItem: (id) => (id === 'Item.axe-1' ? AXE_ITEM : null),
      getSystems
    })
  };

  const result = classifyInteractableDrop({ type: 'Item', uuid: 'Item.axe-1' }, deps);
  assert.ok(result, 'a matching item drop classifies as an interactable');
  assert.equal(result.interactableType, 'tool');
  assert.equal(result.systemId, 'sysA');
  assert.equal(result.referenceId, 'tool-axe');
  assert.equal(result.sourceUuid, 'Fabricate.sysA.tool.tool-axe');
});

test('classifyInteractableDrop leaves an unrelated item drop to Foundry (null)', () => {
  const deps = {
    getTool: () => null,
    getTask: () => null,
    resolveItemUuidToTool: (uuid) => resolveItemUuidToTool(uuid, {
      resolveItem: () => ({ uuid: 'Item.unrelated' }),
      getSystems
    })
  };
  assert.equal(classifyInteractableDrop({ type: 'Item', uuid: 'Item.unrelated' }, deps), null);
});
