/**
 * Fix 4 — `resolveItemUuidToTool`: map a dropped Foundry Item uuid to a
 * crafting-system Tool by resolving the item to the single component it IS through
 * the list-aware, system-scoped `resolveComponentForItem`, then matching the tool
 * whose componentId equals the resolved id. Pure + injected fakes; no live Foundry.
 * Also covers the `classifyInteractableDrop` Tier-2 integration and the issue-559
 * durable-identity guard.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveItemUuidToTool } from '../../src/canvas/interactableItemResolution.js';
import { classifyInteractableDrop } from '../../src/canvas/interactableResolution.js';

// A first-class Tool (issue 561) carries its OWN source refs, derived from its linked
// component (mirroring `_normalizeSystem` / the 1.14.0 migration) so the resolver matches a
// dropped item against the tool directly, not through a component.
function systemWith({ id, tools, components }) {
  const derivedTools = (tools || []).map((tool) => {
    if (!tool?.componentId || tool.sourceUuid || tool.sourceItemUuid) return tool;
    const component = (components || []).find((c) => c.id === tool.componentId);
    if (!component?.sourceUuid && !component?.sourceItemUuid) return tool;
    return {
      ...tool,
      sourceUuid: component.sourceUuid || component.sourceItemUuid || null,
      sourceItemUuid: component.sourceItemUuid || component.sourceUuid || null,
    };
  });
  return { id, tools: derivedTools, components };
}

// World item with a uuid that a component claims as its source.
const AXE_ITEM = { uuid: 'Item.axe-1', _stats: { compendiumSource: 'Compendium.world.tools.Item.axe-src' } };

// A dropped item carrying a durable `flags.fabricate.roles` identity (and optional
// raw refs), beside AXE_ITEM which has no getFlag. Mirrors getFabricateFlag's
// 'fabricate.<key>' normalization.
function droppedItemWithComponentFlag({ uuid, roles, componentId, duplicateSource, compendiumSource } = {}) {
  return {
    uuid,
    _stats: { compendiumSource: compendiumSource ?? null, duplicateSource: duplicateSource ?? null },
    getFlag(scope, key) {
      if (scope !== 'fabricate') return undefined;
      if (key === 'fabricate.roles') return roles;
      if (key === 'fabricate.componentId') return componentId;
      return undefined;
    }
  };
}

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

test('matches via the compendium source-uuid chain (resolveComponentForItem raw-ref tier)', () => {
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

test('#559 / issue 561: a dropped item whose durable identity names a DIFFERENT tool is not mis-resolved via an inherited duplicateSource', () => {
  // The system has tool-axe (source Item.axe-src) and an unrelated tool-other. The dropped
  // item carries a durable `roles[sys].toolId` naming tool-other AND a duplicateSource
  // overlapping tool-axe's source ref. A flag-blind raw-ref fall-through would match tool-axe
  // via duplicateSource; the resolver instead honours the durable tool identity and resolves
  // to tool-other, never the Woodaxe.
  const systems = [systemWith({
    id: 'sysA',
    components: [
      { id: 'comp-axe', sourceItemUuid: 'Item.axe-src' },
      { id: 'comp-other', sourceItemUuid: 'Item.other-src' }
    ],
    tools: [
      { id: 'tool-axe', componentId: 'comp-axe' },
      { id: 'tool-other', componentId: 'comp-other' }
    ]
  })];
  const dropped = droppedItemWithComponentFlag({
    uuid: 'Item.dropped',
    duplicateSource: 'Item.axe-src', // overlaps tool-axe's source ref
    roles: { sysA: { toolId: 'tool-other' } }
  });
  const match = resolveItemUuidToTool('Item.dropped', {
    resolveItem: () => dropped,
    getSystems: () => systems
  });
  assert.deepEqual(match, { systemId: 'sysA', toolId: 'tool-other' }, 'durable tool identity wins over the duplicateSource overlap');
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
