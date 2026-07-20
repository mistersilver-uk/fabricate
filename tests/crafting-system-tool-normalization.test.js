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
    name: null,
    img: null,
    registeredItemUuid: null,
    originItemUuid: null,
    aliasItemUuids: [],
    requirement: null,
    breakage: { mode: 'limitedUses', maxUses: null },
    onBreak: { mode: 'destroy' },
    bonusExpression: '',
    prerequisites: [],
    gateMode: 'bonus'
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

test('_normalizeTool normalizes a requirement gate to a formula-only shape', () => {
  const manager = makeManager();
  const tool = manager._normalizeTool({ id: 't1', requirement: { formula: '@abilities.str.mod' } });
  assert.deepEqual(tool.requirement, { formula: '@abilities.str.mod' });

  // Legacy provider/macroUuid fields are dropped on normalization.
  const legacy = manager._normalizeTool({ id: 't2', requirement: { provider: 'bogus', formula: '@x', macroUuid: 'Macro.x' } });
  assert.deepEqual(legacy.requirement, { formula: '@x' });

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
    name: null,
    img: null,
    registeredItemUuid: null,
    originItemUuid: null,
    aliasItemUuids: [],
    requirement: null,
    breakage: { mode: 'limitedUses', maxUses: 5 },
    onBreak: { mode: 'destroy' },
    bonusExpression: '',
    prerequisites: [],
    gateMode: 'bonus'
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

// ---------------------------------------------------------------------------
// issue 561: first-class tool source refs + name/img snapshot preservation
// ---------------------------------------------------------------------------

test('_normalizeTool preserves source refs + name/img snapshot and never clobbers label (C3)', () => {
  const manager = makeManager();
  const tool = manager._normalizeTool({
    id: 't1',
    label: 'GM Custom Label',
    componentId: null,
    name: 'Iron Pickaxe',
    img: 'icons/tools/pick.webp',
    registeredItemUuid: 'Item.live',
    originItemUuid: 'Compendium.pack.canonical',
    aliasItemUuids: ['Item.old', 'Item.old', '  ', 'Item.live'],
  });
  // Source + snapshot fields survive the unknown-field strip.
  assert.equal(tool.name, 'Iron Pickaxe');
  assert.equal(tool.img, 'icons/tools/pick.webp');
  assert.equal(tool.registeredItemUuid, 'Item.live');
  assert.equal(tool.originItemUuid, 'Compendium.pack.canonical');
  // aliasItemUuids de-dupes, trims, and drops the primary-ref overlap ('Item.live').
  assert.deepEqual(tool.aliasItemUuids, ['Item.old']);
  // The user-authored label is preserved verbatim — never overwritten by the snapshot.
  assert.equal(tool.label, 'GM Custom Label');
  // A first-class item-sourced tool has componentId: null.
  assert.equal(tool.componentId, null);

  // Round-trip is stable (re-normalizing the output yields the same shape).
  const twice = manager._normalizeTool(tool);
  assert.deepEqual(twice, tool);
});

// ---------------------------------------------------------------------------
// issue 419: immune breakage mode, toolBreakage.authority, checkBreakage
// ---------------------------------------------------------------------------

test('_normalizeToolBreakage accepts immune and carries no breakage fields', () => {
  const manager = makeManager();
  const breakage = manager._normalizeToolBreakage({ mode: 'immune', maxUses: 5, breakageChance: 9 });
  assert.deepEqual(breakage, { mode: 'immune' });
});

test('_normalizeSystem defaults toolBreakage.authority to toolSpecific when absent', () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({ id: 's', name: 'S' });
  assert.deepEqual(system.toolBreakage, { authority: 'toolSpecific' });
});

test('_normalizeSystem coerces an unknown toolBreakage.authority to toolSpecific', () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({ id: 's', name: 'S', toolBreakage: { authority: 'bogus' } });
  assert.deepEqual(system.toolBreakage, { authority: 'toolSpecific' });
});

test('_normalizeSystem preserves a checkDriven toolBreakage.authority', () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({ id: 's', name: 'S', toolBreakage: { authority: 'checkDriven' } });
  assert.deepEqual(system.toolBreakage, { authority: 'checkDriven' });
});

test('_normalizeCheckBreakage defaults to an empty trigger list (no enabled flag)', () => {
  const manager = makeManager();
  assert.deepEqual(manager._normalizeCheckBreakage(undefined), { triggers: [] });
  assert.deepEqual(manager._normalizeCheckBreakage({}), { triggers: [] });
});

test('_normalizeCheckBreakage normalizes unified triggers and drops malformed ones', () => {
  const manager = makeManager();
  const block = manager._normalizeCheckBreakage({
    triggers: [
      // Unified trigger carrying an explicit outcome/breakTools; the label is dropped.
      { id: 't1', label: 'Roll low', outcome: 'failure', breakTools: true, condition: { type: 'rollTotal', operator: '<=', value: '5' } },
      // Legacy break-only trigger (no outcome/breakTools) → breakTools true, outcome none.
      { id: 't2', condition: { type: 'progressiveValue', operator: '>=', value: 10 } },
      // outcomeTier cannot force an outcome → outcome coerced to none.
      { id: 't3', outcome: 'success', condition: { type: 'outcomeTier', tierIds: ['x'], outcomeKeys: ['Pass'] } },
      {
        id: 't4',
        outcome: 'none',
        breakTools: false,
        condition: { type: 'diceGroup', groupId: 0, aggregate: 'anyDie', operator: '==', value: 1 },
      },
      // malformed → dropped:
      { id: 'bad-op', condition: { type: 'rollTotal', operator: '!=', value: 1 } },
      { id: 'bad-type', condition: { type: 'unknown' } },
      { id: 'bad-agg', condition: { type: 'diceGroup', groupId: 0, aggregate: 'sum', operator: '==', value: 1 } },
      { id: 'bad-tier', condition: { type: 'outcomeTier' } },
      'not-an-object',
    ],
  });
  assert.equal(block.triggers.length, 4);
  assert.equal(block.triggers[0].label, undefined, 'the free-text label is dropped');
  assert.deepEqual(block.triggers[0].condition, { type: 'rollTotal', operator: '<=', value: 5 });
  assert.equal(block.triggers[0].outcome, 'failure');
  assert.equal(block.triggers[0].breakTools, true);
  // Legacy break-only trigger migrates to breakTools:true / outcome:none.
  assert.equal(block.triggers[1].outcome, 'none');
  assert.equal(block.triggers[1].breakTools, true);
  // outcomeTier coerces outcome to none (it can never force one).
  assert.equal(block.triggers[2].outcome, 'none');
  assert.deepEqual(block.triggers[2].condition, {
    type: 'outcomeTier',
    tierIds: ['x'],
    outcomeKeys: ['pass'],
  });
  assert.deepEqual(block.triggers[3].condition, {
    type: 'diceGroup',
    groupId: 0,
    aggregate: 'anyDie',
    operator: '==',
    value: 1,
  });
  assert.equal(block.triggers[3].outcome, 'none');
  assert.equal(block.triggers[3].breakTools, false);
});

test('_normalizeUnifiedTriggers converts legacy diceCrits ahead of the checkBreakage triggers', () => {
  const manager = makeManager();
  const block = manager._normalizeUnifiedTriggers(
    '1d20',
    [{ id: 'crit', die: '1d20', raw: 1, success: false, breakTools: true }],
    { triggers: [{ id: 'r', outcome: 'success', breakTools: false, condition: { type: 'rollTotal', operator: '>=', value: 18 } }] }
  );
  assert.equal(block.triggers.length, 2);
  // The converted crit comes first as a diceGroup/total/== trigger.
  assert.deepEqual(block.triggers[0].condition, {
    type: 'diceGroup',
    groupId: 0,
    aggregate: 'total',
    operator: '==',
    value: 1,
  });
  assert.equal(block.triggers[0].outcome, 'failure', 'success:false maps to force-failure');
  assert.equal(block.triggers[0].breakTools, true);
  assert.equal(block.triggers[1].outcome, 'success', 'the existing trigger is preserved');
});

test('_normalizeUnifiedTriggers drops a crit keyed to a modified pool, and is idempotent', () => {
  const manager = makeManager();
  // A crit on the modified pool 2d20kh1 is crit-ineligible → dropped.
  const dropped = manager._normalizeUnifiedTriggers(
    '2d20kh1',
    [{ id: 'crit', die: '2d20', raw: 20, success: true }],
    undefined
  );
  assert.deepEqual(dropped, { triggers: [] });

  // Re-normalizing the converted output (no diceCrits, triggers carry outcome/breakTools)
  // produces the same list — the migration does not double-convert.
  const once = manager._normalizeUnifiedTriggers(
    '1d20',
    [{ id: 'crit', die: '1d20', raw: 1, success: false, breakTools: false }],
    undefined
  );
  const twice = manager._normalizeUnifiedTriggers('1d20', undefined, once);
  assert.deepEqual(twice, once, 'normalization is idempotent');
});

test('_normalizeSimpleCraftingCheck carries a unified checkBreakage block and drops diceCrits', () => {
  const manager = makeManager();
  const simple = manager._normalizeSimpleCraftingCheck({
    rollFormula: '1d20',
    diceCrits: [{ id: 'crit', die: '1d20', raw: 1, success: false, breakTools: true }],
    checkBreakage: { triggers: [] },
  });
  assert.equal(simple.diceCrits, undefined, 'the legacy diceCrits field is dropped');
  assert.equal(simple.checkBreakage.triggers.length, 1, 'the legacy crit is migrated into a trigger');
  assert.equal(simple.checkBreakage.triggers[0].outcome, 'failure');
  assert.equal(simple.checkBreakage.triggers[0].breakTools, true);
});

// ---------------------------------------------------------------------------
// Issue 560 — normalizers accept BOTH the legacy source-uuid field names and the
// renamed names, emitting the new names (no silent drop of the renamed fields).
// ---------------------------------------------------------------------------

test('_normalizeTool preserves the renamed source fields from a NEW-named input', () => {
  const manager = makeManager();
  const tool = manager._normalizeTool({
    id: 't1',
    registeredItemUuid: 'Item.new-live',
    originItemUuid: 'Compendium.new-origin',
    aliasItemUuids: ['Item.new-alias'],
  });
  assert.equal(tool.registeredItemUuid, 'Item.new-live');
  assert.equal(tool.originItemUuid, 'Compendium.new-origin');
  assert.deepEqual(tool.aliasItemUuids, ['Item.new-alias']);
});

test('_normalizeTool accepts LEGACY source fields and emits the new names', () => {
  const manager = makeManager();
  const tool = manager._normalizeTool({
    id: 't1',
    sourceUuid: 'Item.old-live',
    sourceItemUuid: 'Compendium.old-origin',
    fallbackItemIds: ['Item.old-alias'],
  });
  assert.equal(tool.registeredItemUuid, 'Item.old-live');
  assert.equal(tool.originItemUuid, 'Compendium.old-origin');
  assert.deepEqual(tool.aliasItemUuids, ['Item.old-alias']);
  assert.ok(!('sourceUuid' in tool));
  assert.ok(!('sourceItemUuid' in tool));
  assert.ok(!('fallbackItemIds' in tool));
});

test('_normalizeComponent preserves renamed source fields from NEW-named and LEGACY input', () => {
  const manager = makeManager();
  const fromNew = manager._normalizeComponent({
    id: 'c1',
    registeredItemUuid: 'Item.new-live',
    originItemUuid: 'Compendium.new-origin',
    aliasItemUuids: ['Item.new-alias'],
  });
  assert.equal(fromNew.registeredItemUuid, 'Item.new-live');
  assert.equal(fromNew.originItemUuid, 'Compendium.new-origin');
  assert.deepEqual(fromNew.aliasItemUuids, ['Item.new-alias']);

  const fromLegacy = manager._normalizeComponent({
    id: 'c1',
    sourceUuid: 'Item.old-live',
    sourceItemUuid: 'Compendium.old-origin',
    fallbackItemIds: ['Item.old-alias'],
  });
  assert.equal(fromLegacy.registeredItemUuid, 'Item.old-live');
  assert.equal(fromLegacy.originItemUuid, 'Compendium.old-origin');
  assert.deepEqual(fromLegacy.aliasItemUuids, ['Item.old-alias']);
  assert.ok(!('sourceUuid' in fromLegacy));
  assert.ok(!('sourceItemUuid' in fromLegacy));
  assert.ok(!('fallbackItemIds' in fromLegacy));
});

test('_normalizeRecipeItemDefinition preserves renamed source fields from NEW-named and LEGACY input', () => {
  const manager = makeManager();
  const fromNew = manager._normalizeRecipeItemDefinition({
    id: 'book',
    registeredItemUuid: 'Item.new-live',
    originItemUuid: 'Compendium.new-origin',
    aliasItemUuids: ['Item.new-alias'],
  });
  assert.equal(fromNew.registeredItemUuid, 'Item.new-live');
  assert.equal(fromNew.originItemUuid, 'Compendium.new-origin');
  assert.deepEqual(fromNew.aliasItemUuids, ['Item.new-alias']);

  const fromLegacy = manager._normalizeRecipeItemDefinition({
    id: 'book',
    sourceUuid: 'Item.old-live',
    sourceItemUuid: 'Compendium.old-origin',
    fallbackItemIds: ['Item.old-alias'],
  });
  assert.equal(fromLegacy.registeredItemUuid, 'Item.old-live');
  assert.equal(fromLegacy.originItemUuid, 'Compendium.old-origin');
  assert.deepEqual(fromLegacy.aliasItemUuids, ['Item.old-alias']);
  assert.ok(!('sourceUuid' in fromLegacy));
  assert.ok(!('sourceItemUuid' in fromLegacy));
  assert.ok(!('fallbackItemIds' in fromLegacy));
});
