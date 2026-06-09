/**
 * Unit tests for system-owned library Tool normalization in CraftingSystemManager.
 *
 * Tools are now the single canonical source on the crafting system:
 * `_normalizeSystem` populates `system.tools` (mirroring `components`) so every
 * consumer that reads `getSystem(id).tools` — the recipe tool gate, salvage, the
 * canvas interactable browser, item-drop resolution, and gathering composition —
 * sees the same normalized library. These tests cover `_normalizeTool` shape +
 * field coercion and the `_normalizeSystem` tools seam.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

// Minimal stubs so the module can load without a Foundry runtime.
let idCounter = 0;
globalThis.foundry = {
  utils: {
    randomID: () => `random-${++idCounter}`,
    getProperty: () => undefined
  }
};
globalThis.game = {};

const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');

function makeManager() {
  return new CraftingSystemManager({ getRecipes: () => [] });
}

// ---------------------------------------------------------------------------
// _normalizeTool — shape + field coercion
// ---------------------------------------------------------------------------

test('_normalizeTool produces the canonical Tool shape with defaults for a sparse tool', () => {
  const manager = makeManager();
  const tool = manager._normalizeTool({ id: 't1' });
  assert.deepEqual(tool, {
    id: 't1',
    label: '',
    enabled: true,
    componentId: null,
    requirement: null,
    breakage: { mode: 'limitedUses', maxUses: null },
    onBreak: { mode: 'destroy' }
  });
});

test('_normalizeTool generates an id when absent', () => {
  const manager = makeManager();
  const tool = manager._normalizeTool({});
  assert.ok(typeof tool.id === 'string' && tool.id.length > 0);
});

test('_normalizeTool trims the label and componentId, coercing blanks to null', () => {
  const manager = makeManager();
  const tool = manager._normalizeTool({ id: 't1', label: '  Iron Pickaxe  ', componentId: '  comp-pick  ' });
  assert.equal(tool.label, 'Iron Pickaxe');
  assert.equal(tool.componentId, 'comp-pick');

  const blank = manager._normalizeTool({ id: 't2', componentId: '   ' });
  assert.equal(blank.componentId, null);
});

test('_normalizeTool defaults enabled to true and honors an explicit false', () => {
  const manager = makeManager();
  assert.equal(manager._normalizeTool({ id: 't1' }).enabled, true);
  assert.equal(manager._normalizeTool({ id: 't1', enabled: false }).enabled, false);
  assert.equal(manager._normalizeTool({ id: 't1', enabled: 'whatever' }).enabled, true);
});

test('_normalizeTool coerces unknown breakage / on-break modes to defaults but keeps maxUses', () => {
  const manager = makeManager();
  const tool = manager._normalizeTool({
    id: 't1',
    breakage: { mode: 'frobnicate', maxUses: 7 },
    onBreak: { mode: 'banana' }
  });
  assert.equal(tool.breakage.mode, 'limitedUses');
  assert.equal(tool.breakage.maxUses, 7);
  assert.equal(tool.onBreak.mode, 'destroy');
});

test('_normalizeTool normalizes breakageChance breakage', () => {
  const manager = makeManager();
  const tool = manager._normalizeTool({ id: 't1', breakage: { mode: 'breakageChance', breakageChance: 25 } });
  assert.deepEqual(tool.breakage, { mode: 'breakageChance', breakageChance: 25 });

  const nonNumeric = manager._normalizeTool({ id: 't2', breakage: { mode: 'breakageChance', breakageChance: 'x' } });
  assert.equal(nonNumeric.breakage.breakageChance, 0);
});

test('_normalizeTool normalizes diceExpression breakage', () => {
  const manager = makeManager();
  const tool = manager._normalizeTool({ id: 't1', breakage: { mode: 'diceExpression', formula: '1d20', threshold: 10 } });
  assert.deepEqual(tool.breakage, { mode: 'diceExpression', formula: '1d20', threshold: 10 });

  const sparse = manager._normalizeTool({ id: 't2', breakage: { mode: 'diceExpression' } });
  assert.deepEqual(sparse.breakage, { mode: 'diceExpression', formula: '', threshold: 0 });
});

test('_normalizeTool normalizes replaceWith onBreak with replacementComponentId', () => {
  const manager = makeManager();
  const tool = manager._normalizeTool({ id: 't1', onBreak: { mode: 'replaceWith', replacementComponentId: 'comp-broken' } });
  assert.deepEqual(tool.onBreak, { mode: 'replaceWith', replacementComponentId: 'comp-broken' });

  const missing = manager._normalizeTool({ id: 't2', onBreak: { mode: 'replaceWith' } });
  assert.equal(missing.onBreak.replacementComponentId, null);
});

test('_normalizeTool keeps flagBroken onBreak without extra fields', () => {
  const manager = makeManager();
  const tool = manager._normalizeTool({ id: 't1', onBreak: { mode: 'flagBroken' } });
  assert.deepEqual(tool.onBreak, { mode: 'flagBroken' });
});

test('_normalizeTool normalizes a requirement gate and coerces an unknown provider to dnd5e', () => {
  const manager = makeManager();
  const tool = manager._normalizeTool({ id: 't1', requirement: { provider: 'pf2e', formula: '@abilities.str.mod' } });
  assert.deepEqual(tool.requirement, { provider: 'pf2e', formula: '@abilities.str.mod', macroUuid: '' });

  const unknownProvider = manager._normalizeTool({ id: 't2', requirement: { provider: 'bogus', macroUuid: 'Macro.x' } });
  assert.equal(unknownProvider.requirement.provider, 'dnd5e');
  assert.equal(unknownProvider.requirement.macroUuid, 'Macro.x');

  const nullReq = manager._normalizeTool({ id: 't3', requirement: null });
  assert.equal(nullReq.requirement, null);
});

// ---------------------------------------------------------------------------
// _normalizeSystem tools seam
// ---------------------------------------------------------------------------

test('_normalizeSystem populates a normalized tools array', () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({
    id: 'sys1',
    name: 'Wildcraft',
    tools: [
      { id: 'tool-axe', label: 'Axe', componentId: 'comp-axe', breakage: { mode: 'limitedUses', maxUses: 5 } },
      { id: 'tool-saw', componentId: 'comp-saw', breakage: { mode: 'breakageChance', breakageChance: 10 }, onBreak: { mode: 'flagBroken' } }
    ]
  });
  assert.equal(system.tools.length, 2);
  assert.deepEqual(system.tools[0], {
    id: 'tool-axe',
    label: 'Axe',
    enabled: true,
    componentId: 'comp-axe',
    requirement: null,
    breakage: { mode: 'limitedUses', maxUses: 5 },
    onBreak: { mode: 'destroy' }
  });
  assert.equal(system.tools[1].breakage.mode, 'breakageChance');
  assert.equal(system.tools[1].onBreak.mode, 'flagBroken');
});

test('_normalizeSystem returns [] for an absent or non-array tools field', () => {
  const manager = makeManager();
  assert.deepEqual(manager._normalizeSystem({ id: 'sys1' }).tools, []);
  assert.deepEqual(manager._normalizeSystem({ id: 'sys1', tools: null }).tools, []);
  assert.deepEqual(manager._normalizeSystem({ id: 'sys1', tools: 'nope' }).tools, []);
});

test('_normalizeSystem round-trips tools through normalization (re-normalize is stable)', () => {
  const manager = makeManager();
  const once = manager._normalizeSystem({ id: 'sys1', tools: [{ id: 't1', label: ' Pick ', componentId: ' c1 ' }] });
  const twice = manager._normalizeSystem(once);
  assert.deepEqual(twice.tools, once.tools);
});
