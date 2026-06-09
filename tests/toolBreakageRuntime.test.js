/**
 * Phase 0 — the extracted shared Tool breakage runtime in isolation.
 *
 * Covers the plan/apply core consumed by BOTH the gathering engine and the
 * crafting engine:
 *   - readToolUsage flag-shape tolerance;
 *   - evaluateToolBreakagePlan projects post-increment timesUsed for limitedUses
 *     and defers to Tool.evaluateBreakage for other modes;
 *   - plannedToolBreakageOutcome shapes;
 *   - applyToolUsageAndBreakage: limitedUses writes toolUsage; non-limitedUses
 *     modes write NO usage flag; onBreak destroy/flagBroken/replaceWith;
 *   - createToolBreakageRuntime plan/apply parity (apply reuses the prior plan
 *     decision rather than re-rolling).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.foundry = {
  utils: {
    getProperty: (obj, path) => String(path).split('.').reduce((v, k) => (v == null ? undefined : v[k]), obj)
  }
};

const { Tool } = await import('../src/models/Tool.js');
const {
  readToolUsage,
  evaluateToolBreakagePlan,
  plannedToolBreakageOutcome,
  applyToolUsageAndBreakage,
  createToolBreakageRuntime
} = await import('../src/toolBreakageRuntime.js');

// ---------------------------------------------------------------------------
// FakeItem — getFlag('fabricate', 'fabricate.<key>') dot-path resolution,
// mirroring the project's getFabricateFlag/setFabricateFlag conventions.
// ---------------------------------------------------------------------------

function getPath(obj, path) {
  return String(path).split('.').reduce((v, k) => (v == null ? undefined : v[k]), obj);
}
function setPath(obj, path, value) {
  const parts = String(path).split('.');
  const last = parts.pop();
  let t = obj;
  for (const p of parts) {
    if (!t[p] || typeof t[p] !== 'object') t[p] = {};
    t = t[p];
  }
  t[last] = value;
}

class FakeItem {
  constructor(flags = {}, { uuid = 'Item.x' } = {}) {
    this._flags = { fabricate: flags };
    this.uuid = uuid;
    this.deleted = false;
    this.parent = { uuid: 'Actor.a', createEmbeddedDocuments: async () => {} };
  }
  getFlag(scope, key) {
    if (!this._flags[scope]) return undefined;
    return getPath(this._flags[scope], key);
  }
  async setFlag(scope, key, value) {
    if (!this._flags[scope]) this._flags[scope] = {};
    setPath(this._flags[scope], key, value);
    return value;
  }
  async delete() { this.deleted = true; }
}

// ---------------------------------------------------------------------------
// readToolUsage
// ---------------------------------------------------------------------------

test('readToolUsage reads the nested fabricate.toolUsage flag', () => {
  const item = new FakeItem({ fabricate: { toolUsage: { timesUsed: 3 } } });
  assert.deepEqual(readToolUsage(item), { timesUsed: 3 });
});

test('readToolUsage defaults to { timesUsed: 0 } when absent', () => {
  assert.deepEqual(readToolUsage(new FakeItem({})), { timesUsed: 0 });
  assert.deepEqual(readToolUsage(null), { timesUsed: 0 });
});

// ---------------------------------------------------------------------------
// evaluateToolBreakagePlan
// ---------------------------------------------------------------------------

test('evaluateToolBreakagePlan projects post-increment timesUsed for limitedUses', async () => {
  const tool = Tool.fromJSON({ componentId: 'c', breakage: { mode: 'limitedUses', maxUses: 2 }, onBreak: { mode: 'destroy' } });
  const item = new FakeItem({ fabricate: { toolUsage: { timesUsed: 1 } } });
  const plan = await evaluateToolBreakagePlan(tool, { item });
  // current 1 + 1 = 2 >= maxUses 2 → broken
  assert.equal(plan.broken, true);
  assert.equal(plan.evidence.timesUsed, 2);
  assert.equal(plan.evidence.maxUses, 2);
});

test('evaluateToolBreakagePlan: limitedUses with null maxUses never breaks', async () => {
  const tool = Tool.fromJSON({ componentId: 'c', breakage: { mode: 'limitedUses', maxUses: null }, onBreak: { mode: 'destroy' } });
  const plan = await evaluateToolBreakagePlan(tool, { item: new FakeItem({}) });
  assert.equal(plan.broken, false);
});

test('Tool.evaluateBreakage: breakageChance honored via injected random', async () => {
  const tool = Tool.fromJSON({ componentId: 'c', breakage: { mode: 'breakageChance', breakageChance: 50 }, onBreak: { mode: 'flagBroken' } });
  const broke = await tool.evaluateBreakage({ random: () => 0.1 }); // 10 < 50
  assert.equal(broke.broken, true);
  const safe = await tool.evaluateBreakage({ random: () => 0.9 }); // 90 >= 50
  assert.equal(safe.broken, false);
});

test('evaluateToolBreakagePlan: diceExpression honored via injected evaluator', async () => {
  const tool = Tool.fromJSON({ componentId: 'c', breakage: { mode: 'diceExpression', formula: '1d20', threshold: 10 }, onBreak: { mode: 'destroy' } });
  const broke = await evaluateToolBreakagePlan(tool, { evaluateExpression: async () => 5 });
  assert.equal(broke.broken, true);
  const safe = await evaluateToolBreakagePlan(tool, { evaluateExpression: async () => 15 });
  assert.equal(safe.broken, false);
});

// ---------------------------------------------------------------------------
// plannedToolBreakageOutcome
// ---------------------------------------------------------------------------

test('plannedToolBreakageOutcome shapes each onBreak mode', () => {
  assert.deepEqual(plannedToolBreakageOutcome(Tool.fromJSON({ componentId: 'c', onBreak: { mode: 'destroy' } })), { action: 'destroyed' });
  assert.deepEqual(plannedToolBreakageOutcome(Tool.fromJSON({ componentId: 'c', onBreak: { mode: 'flagBroken' } })), { action: 'flagged' });
  assert.deepEqual(
    plannedToolBreakageOutcome(Tool.fromJSON({ componentId: 'c', onBreak: { mode: 'replaceWith', replacementComponentId: 'r' } })),
    { action: 'replaced', replacementComponentId: 'r' }
  );
});

// ---------------------------------------------------------------------------
// applyToolUsageAndBreakage
// ---------------------------------------------------------------------------

test('applyToolUsageAndBreakage: limitedUses increments toolUsage', async () => {
  const tool = Tool.fromJSON({ componentId: 'c', breakage: { mode: 'limitedUses', maxUses: 5 }, onBreak: { mode: 'destroy' } });
  const item = new FakeItem({ fabricate: { toolUsage: { timesUsed: 1 } } });
  const entry = await applyToolUsageAndBreakage({ tool, item, buildItemRef: (_a, i) => ({ itemUuid: i.uuid, quantity: 1 }) });
  assert.deepEqual(item._flags.fabricate.fabricate.toolUsage, { timesUsed: 2 });
  assert.equal(entry.broken, false);
  assert.equal(entry.componentId, 'c');
});

test('applyToolUsageAndBreakage: breakageChance (non-limitedUses) writes NO usage flag', async () => {
  const tool = Tool.fromJSON({ componentId: 'c', breakage: { mode: 'breakageChance', breakageChance: 0 }, onBreak: { mode: 'flagBroken' } });
  const item = new FakeItem({});
  await applyToolUsageAndBreakage({ tool, item, buildItemRef: () => ({}) });
  assert.equal(item._flags.fabricate.fabricate, undefined, 'no toolUsage flag written for presence-only tool');
});

test('applyToolUsageAndBreakage: destroy onBreak deletes the item when broken', async () => {
  const tool = Tool.fromJSON({ componentId: 'c', breakage: { mode: 'breakageChance', breakageChance: 100 }, onBreak: { mode: 'destroy' } });
  const item = new FakeItem({});
  const entry = await applyToolUsageAndBreakage({ tool, item, buildItemRef: () => ({}) });
  assert.equal(entry.broken, true);
  assert.equal(item.deleted, true);
  assert.deepEqual(entry.onBreak, { action: 'destroyed' });
});

test('applyToolUsageAndBreakage: flagBroken onBreak sets toolBroken when broken', async () => {
  const tool = Tool.fromJSON({ componentId: 'c', breakage: { mode: 'breakageChance', breakageChance: 100 }, onBreak: { mode: 'flagBroken' } });
  const item = new FakeItem({});
  const entry = await applyToolUsageAndBreakage({ tool, item, buildItemRef: () => ({}) });
  assert.equal(getPath(item._flags.fabricate, 'fabricate.toolBroken'), true);
  assert.deepEqual(entry.onBreak, { action: 'flagged' });
});

test('applyToolUsageAndBreakage: replaceWith deletes and invokes createReplacement', async () => {
  const tool = Tool.fromJSON({ componentId: 'c', breakage: { mode: 'breakageChance', breakageChance: 100 }, onBreak: { mode: 'replaceWith', replacementComponentId: 'r' } });
  const item = new FakeItem({});
  let replacedWith = null;
  const entry = await applyToolUsageAndBreakage({
    tool,
    item,
    buildItemRef: () => ({}),
    createReplacement: async ({ componentId }) => { replacedWith = componentId; }
  });
  assert.equal(item.deleted, true);
  assert.equal(replacedWith, 'r');
  assert.equal(entry.onBreak.action, 'replaced');
});

test('applyToolUsageAndBreakage: prefers a prior plan decision over re-evaluating', async () => {
  // Tool would NOT break on its own (chance 0), but a planned-broken entry forces it.
  const tool = Tool.fromJSON({ componentId: 'c', breakage: { mode: 'breakageChance', breakageChance: 0 }, onBreak: { mode: 'flagBroken' } });
  const item = new FakeItem({});
  const entry = await applyToolUsageAndBreakage({
    tool,
    item,
    planned: { mode: 'breakageChance', broken: true, evidence: { roll: 1, breakageChance: 0 } },
    buildItemRef: () => ({})
  });
  assert.equal(entry.broken, true);
  assert.equal(getPath(item._flags.fabricate, 'fabricate.toolBroken'), true);
});

// ---------------------------------------------------------------------------
// createToolBreakageRuntime — plan/apply parity
// ---------------------------------------------------------------------------

function runtimeFixture({ toolData, item }) {
  const matchTools = () => ({ items: [{ tool: toolData, item }], missing: [] });
  return createToolBreakageRuntime({
    matchTools,
    buildItemRef: (_actor, i) => ({ actorUuid: 'Actor.a', itemUuid: i.uuid, quantity: 1 })
  });
}

test('createToolBreakageRuntime: plan records the decision and apply reuses it', async () => {
  const toolData = { componentId: 'c', breakage: { mode: 'limitedUses', maxUses: 2 }, onBreak: { mode: 'flagBroken' } };
  const item = new FakeItem({ fabricate: { toolUsage: { timesUsed: 1 } } });
  const runtime = runtimeFixture({ toolData, item });

  const actor = { uuid: 'Actor.a' };
  const task = { id: 't' };
  const planned = await runtime.plan({ actor, task, tools: [toolData] });
  assert.equal(planned.length, 1);
  assert.equal(planned[0].broken, true, 'projected timesUsed 2 >= maxUses 2');
  assert.deepEqual(planned[0].onBreak, { action: 'flagged' });

  const applied = await runtime.apply({ actor, task, tools: [toolData] });
  // apply increments the real usage and applies the planned breakage.
  assert.deepEqual(item._flags.fabricate.fabricate.toolUsage, { timesUsed: 2 });
  assert.equal(applied[0].broken, true);
  assert.equal(getPath(item._flags.fabricate, 'fabricate.toolBroken'), true);
});

test('createToolBreakageRuntime: apply with no prior plan evaluates fresh', async () => {
  const toolData = { componentId: 'c', breakage: { mode: 'breakageChance', breakageChance: 0 }, onBreak: { mode: 'destroy' } };
  const item = new FakeItem({});
  const runtime = runtimeFixture({ toolData, item });
  const applied = await runtime.apply({ actor: { uuid: 'Actor.a' }, task: { id: 't' }, tools: [toolData] });
  assert.equal(applied[0].broken, false);
  assert.equal(item.deleted, false);
});

test('createToolBreakageRuntime: no matched tools yields empty evidence', async () => {
  const runtime = createToolBreakageRuntime({
    matchTools: () => ({ items: [], missing: [] }),
    buildItemRef: () => ({})
  });
  assert.deepEqual(await runtime.plan({ tools: [] }), []);
  assert.deepEqual(await runtime.apply({ tools: [] }), []);
});

// ---------------------------------------------------------------------------
// Catalyst→Tool item-flag fallback (0.6.0): toolUsage preferred, catalystItemUsage
// fallback only when toolUsage is absent. Writes always go to toolUsage.
// ---------------------------------------------------------------------------

test('readToolUsage falls back to catalystItemUsage when toolUsage is absent', () => {
  const item = new FakeItem({ fabricate: { catalystItemUsage: { timesUsed: 4 } } });
  assert.deepEqual(readToolUsage(item), { timesUsed: 4 });
});

test('readToolUsage prefers toolUsage when both flags are present', () => {
  const item = new FakeItem({ fabricate: { toolUsage: { timesUsed: 1 }, catalystItemUsage: { timesUsed: 9 } } });
  assert.deepEqual(readToolUsage(item), { timesUsed: 1 });
});

test('Tool.evaluateBreakage (limitedUses) reads catalystItemUsage when toolUsage absent', async () => {
  const tool = Tool.fromJSON({ componentId: 'c', breakage: { mode: 'limitedUses', maxUses: 4 }, onBreak: { mode: 'destroy' } });
  // Migrated item already used 4 times as a catalyst → at maxUses → broken.
  const item = new FakeItem({ fabricate: { catalystItemUsage: { timesUsed: 4 } } });
  const result = await tool.evaluateBreakage({ item });
  assert.equal(result.broken, true);
  assert.equal(result.evidence.timesUsed, 4);
});

test('Tool.evaluateBreakage (limitedUses) prefers toolUsage over catalystItemUsage', async () => {
  const tool = Tool.fromJSON({ componentId: 'c', breakage: { mode: 'limitedUses', maxUses: 4 }, onBreak: { mode: 'destroy' } });
  const item = new FakeItem({ fabricate: { toolUsage: { timesUsed: 1 }, catalystItemUsage: { timesUsed: 9 } } });
  const result = await tool.evaluateBreakage({ item });
  assert.equal(result.broken, false, 'toolUsage (1) wins, not catalystItemUsage (9)');
  assert.equal(result.evidence.timesUsed, 1);
});

test('Tool.applyUsage seeds from catalystItemUsage on first post-migration write, writes toolUsage', async () => {
  const tool = Tool.fromJSON({ componentId: 'c', breakage: { mode: 'limitedUses', maxUses: 10 }, onBreak: { mode: 'flagBroken' } });
  const item = new FakeItem({ fabricate: { catalystItemUsage: { timesUsed: 2 } } });
  await tool.applyUsage(item);
  // First write continues the catalyst count (2 + 1) and lands on the authoritative flag.
  assert.deepEqual(item._flags.fabricate.fabricate.toolUsage, { timesUsed: 3 });
  // Legacy catalyst flag is never back-filled or cleared.
  assert.deepEqual(item._flags.fabricate.fabricate.catalystItemUsage, { timesUsed: 2 });
});

test('Tool.applyUsage prefers toolUsage over catalystItemUsage once toolUsage exists', async () => {
  const tool = Tool.fromJSON({ componentId: 'c', breakage: { mode: 'limitedUses', maxUses: 10 }, onBreak: { mode: 'flagBroken' } });
  const item = new FakeItem({ fabricate: { toolUsage: { timesUsed: 5 }, catalystItemUsage: { timesUsed: 2 } } });
  await tool.applyUsage(item);
  assert.deepEqual(item._flags.fabricate.fabricate.toolUsage, { timesUsed: 6 });
});
