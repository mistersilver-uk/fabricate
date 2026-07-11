/**
 * Unit tests for the Tool model.
 * Mirrors the FakeItem patterns established by tests/catalyst-model.test.js so
 * that flag reads/writes resolve through the same double-prefix path
 * (`fabricate:fabricate.<key>`) the production helpers rely on.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.foundry = { utils: { getProperty: () => undefined } };

const { Tool } = await import('../src/models/Tool.js');

// ---------------------------------------------------------------------------
// FakeItem & FakeActor helpers (mirroring tests/catalyst-model.test.js)
// ---------------------------------------------------------------------------

function getPathValue(object, path) {
  return String(path).split('.').reduce((value, part) => {
    if (value == null || typeof value !== 'object') return undefined;
    return value[part];
  }, object);
}

function setPathValue(object, path, value) {
  const parts = String(path).split('.');
  const last = parts.pop();
  let target = object;
  for (const part of parts) {
    if (!target[part] || typeof target[part] !== 'object') {
      target[part] = {};
    }
    target = target[part];
  }
  target[last] = value;
}

class FakeItem {
  constructor(flags = {}, { name } = {}) {
    this._flags = { fabricate: flags };
    this.deleted = false;
    if (name !== undefined) this.name = name;
  }

  getFlag(scope, key) {
    if (!this._flags[scope]) return undefined;
    return getPathValue(this._flags[scope], key);
  }

  async setFlag(scope, key, value) {
    if (!this._flags[scope]) this._flags[scope] = {};
    setPathValue(this._flags[scope], key, value);
    return value;
  }

  async update(changes = {}) {
    Object.assign(this, changes);
    return this;
  }

  async delete() {
    this.deleted = true;
  }
}

// A renamable item with a `name` and the FakeItem `update` method.
function makeNamedItem(name, flags = {}) {
  return new FakeItem(flags, { name });
}

// A headless item lacking `name`/`update` (e.g. the legacy fake / non-rename path).
function makeUpdatelessItem(name, flags = {}) {
  const item = new FakeItem(flags, { name });
  item.update = undefined;
  return item;
}

// ---------------------------------------------------------------------------
// Construction defaults
// ---------------------------------------------------------------------------

test('Tool defaults to limitedUses with unlimited maxUses and destroy on break', () => {
  const tool = new Tool({ componentId: 'comp-axe' });

  assert.equal(tool.componentId, 'comp-axe');
  assert.equal(tool.requirement, null);
  assert.deepEqual(tool.breakage, { mode: 'limitedUses', maxUses: null });
  assert.deepEqual(tool.onBreak, { mode: 'destroy' });
});

test('Tool normalizes unknown enum values to defaults', () => {
  const tool = new Tool({
    componentId: 'comp-axe',
    breakage: { mode: 'invalid-mode', maxUses: 5 },
    onBreak: { mode: 'wat' },
    requirement: { formula: 'x' },
  });

  assert.equal(tool.breakage.mode, 'limitedUses');
  assert.equal(tool.breakage.maxUses, 5);
  assert.equal(tool.onBreak.mode, 'destroy');
  assert.deepEqual(tool.requirement, { formula: 'x' });
});

test('Tool accepts breakageChance configuration', () => {
  const tool = new Tool({
    componentId: 'comp-saw',
    breakage: { mode: 'breakageChance', breakageChance: 25 },
    onBreak: { mode: 'flagBroken' },
  });

  assert.equal(tool.breakage.mode, 'breakageChance');
  assert.equal(tool.breakage.breakageChance, 25);
  assert.equal(tool.onBreak.mode, 'flagBroken');
});

test('Tool accepts diceExpression configuration', () => {
  const tool = new Tool({
    componentId: 'comp-pick',
    breakage: { mode: 'diceExpression', formula: '1d20 + @abilities.str.mod', threshold: 10 },
    onBreak: { mode: 'replaceWith', replacementComponentId: 'comp-pick-broken' },
  });

  assert.equal(tool.breakage.mode, 'diceExpression');
  assert.equal(tool.breakage.formula, '1d20 + @abilities.str.mod');
  assert.equal(tool.breakage.threshold, 10);
  assert.equal(tool.onBreak.mode, 'replaceWith');
  assert.equal(tool.onBreak.replacementComponentId, 'comp-pick-broken');
});

// ---------------------------------------------------------------------------
// Validation matrix
// ---------------------------------------------------------------------------

test('Tool.validate - requires componentId', () => {
  const result = new Tool({ componentId: '' }).validate();
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('componentId')));
});

test('Tool.validate - requirement requires formula', () => {
  const result = new Tool({
    componentId: 'comp-axe',
    requirement: { formula: '' },
  }).validate();
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('formula')));
});

test('Tool.validate - requirement with a formula is valid', () => {
  const result = new Tool({
    componentId: 'comp-axe',
    requirement: { formula: '@flags.proficient' },
  }).validate();
  assert.equal(result.valid, true);
});

test('Tool.validate - limitedUses rejects zero maxUses', () => {
  const result = new Tool({
    componentId: 'comp-axe',
    breakage: { mode: 'limitedUses', maxUses: 0 },
  }).validate();
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('maxUses')));
});

test('Tool.validate - limitedUses accepts null maxUses (unlimited)', () => {
  const result = new Tool({
    componentId: 'comp-axe',
    breakage: { mode: 'limitedUses', maxUses: null },
  }).validate();
  assert.equal(result.valid, true);
});

test('Tool.validate - breakageChance must be integer 0..100', () => {
  const overHundred = new Tool({
    componentId: 'comp-axe',
    breakage: { mode: 'breakageChance', breakageChance: 150 },
  }).validate();
  assert.equal(overHundred.valid, false);
  assert.ok(overHundred.errors.some(e => e.includes('breakageChance')));

  const negative = new Tool({
    componentId: 'comp-axe',
    breakage: { mode: 'breakageChance', breakageChance: -1 },
  }).validate();
  assert.equal(negative.valid, false);

  const fractional = new Tool({
    componentId: 'comp-axe',
    breakage: { mode: 'breakageChance', breakageChance: 2.5 },
  }).validate();
  assert.equal(fractional.valid, false);

  const ok = new Tool({
    componentId: 'comp-axe',
    breakage: { mode: 'breakageChance', breakageChance: 50 },
  }).validate();
  assert.equal(ok.valid, true);
});

test('Tool.validate - diceExpression requires non-empty formula and finite threshold', () => {
  const noFormula = new Tool({
    componentId: 'comp-axe',
    breakage: { mode: 'diceExpression', formula: '', threshold: 5 },
  }).validate();
  assert.equal(noFormula.valid, false);
  assert.ok(noFormula.errors.some(e => e.includes('formula')));

  const ok = new Tool({
    componentId: 'comp-axe',
    breakage: { mode: 'diceExpression', formula: '1d6', threshold: 0 },
  }).validate();
  assert.equal(ok.valid, true);
});

test('Tool.validate - replaceWith requires replacementComponentId distinct from componentId', () => {
  const same = new Tool({
    componentId: 'comp-axe',
    onBreak: { mode: 'replaceWith', replacementComponentId: 'comp-axe' },
  }).validate();
  assert.equal(same.valid, false);
  assert.ok(same.errors.some(e => e.includes('replacementComponentId')));

  const missing = new Tool({
    componentId: 'comp-axe',
    onBreak: { mode: 'replaceWith', replacementComponentId: '' },
  }).validate();
  assert.equal(missing.valid, false);

  const ok = new Tool({
    componentId: 'comp-axe',
    onBreak: { mode: 'replaceWith', replacementComponentId: 'comp-axe-broken' },
  }).validate();
  assert.equal(ok.valid, true);
});

// ---------------------------------------------------------------------------
// JSON round-trip
// ---------------------------------------------------------------------------

test('Tool.toJSON / fromJSON round-trip preserves shape including snapshot + source refs + label', () => {
  const original = new Tool({
    componentId: 'comp-axe',
    // Distinct user-authored label + the name/img display snapshot + own source refs
    // (issue 561) — so a toJSON that DROPS any of them fails this round-trip (R2-N1).
    label: 'GM Custom Axe',
    name: 'Woodsman Axe',
    img: 'icons/tools/axe.webp',
    registeredItemUuid: 'Item.live-axe',
    originItemUuid: 'Compendium.pack.axe',
    aliasItemUuids: ['Item.old-axe'],
    requirement: { formula: '@flags.proficient' },
    breakage: { mode: 'diceExpression', formula: '1d20', threshold: 10 },
    onBreak: { mode: 'replaceWith', replacementComponentId: 'comp-axe-broken' },
  });
  const json = original.toJSON();
  const round = Tool.fromJSON(json);

  assert.deepEqual(round.toJSON(), json);
  // The label + snapshot survive the round-trip unchanged.
  assert.equal(round.label, 'GM Custom Axe');
  assert.equal(round.name, 'Woodsman Axe');
  assert.equal(round.img, 'icons/tools/axe.webp');
  assert.equal(round.originItemUuid, 'Compendium.pack.axe');
});

test('Tool.validate accepts a source-refs-only tool with componentId null (issue 561, R2-N2)', () => {
  // POSITIVE case: an un-relaxed validate() still requiring componentId would reject this.
  const itemSourced = new Tool({
    componentId: null,
    name: 'Chisel',
    registeredItemUuid: 'Item.chisel',
    originItemUuid: 'Item.chisel',
  }).validate();
  assert.equal(itemSourced.valid, true);

  // NEGATIVE case: neither a componentId nor any source ref is invalid.
  const neither = new Tool({ componentId: null }).validate();
  assert.equal(neither.valid, false);

  // The onBreak.replaceWith differ-check does not throw / mis-fire when componentId is null.
  const replaceOnItemSourced = new Tool({
    componentId: null,
    originItemUuid: 'Item.hammer',
    onBreak: { mode: 'replaceWith', replacementComponentId: 'comp-broken' },
  }).validate();
  assert.equal(replaceOnItemSourced.valid, true);
});

test('Tool.fromJSON ignores unknown fields', () => {
  const tool = Tool.fromJSON({
    componentId: 'comp-axe',
    legacyField: 'should be ignored',
    notes: 'gone',
  });
  assert.equal(tool.componentId, 'comp-axe');
  assert.equal(tool.toJSON().legacyField, undefined);
});

// ---------------------------------------------------------------------------
// evaluateBreakage - limitedUses
// ---------------------------------------------------------------------------

test('evaluateBreakage limitedUses - breaks when timesUsed reaches maxUses', async () => {
  const tool = new Tool({
    componentId: 'comp-axe',
    breakage: { mode: 'limitedUses', maxUses: 3 },
  });
  const exhausted = new FakeItem({ fabricate: { toolUsage: { timesUsed: 3 } } });
  const fresh = new FakeItem({ fabricate: { toolUsage: { timesUsed: 1 } } });

  assert.equal((await tool.evaluateBreakage({ item: exhausted })).broken, true);
  assert.equal((await tool.evaluateBreakage({ item: fresh })).broken, false);
});

test('evaluateBreakage limitedUses - unlimited maxUses never breaks', async () => {
  const tool = new Tool({
    componentId: 'comp-axe',
    breakage: { mode: 'limitedUses', maxUses: null },
  });
  const item = new FakeItem({ fabricate: { toolUsage: { timesUsed: 999 } } });
  assert.equal((await tool.evaluateBreakage({ item })).broken, false);
});

// ---------------------------------------------------------------------------
// evaluateBreakage - breakageChance
// ---------------------------------------------------------------------------

test('evaluateBreakage breakageChance - random() === 0 breaks at chance > 0', async () => {
  const tool = new Tool({
    componentId: 'comp-axe',
    breakage: { mode: 'breakageChance', breakageChance: 5 },
  });
  const result = await tool.evaluateBreakage({ random: () => 0 });
  assert.equal(result.broken, true);
});

test('evaluateBreakage breakageChance - chance 0 never breaks', async () => {
  const tool = new Tool({
    componentId: 'comp-axe',
    breakage: { mode: 'breakageChance', breakageChance: 0 },
  });
  const result = await tool.evaluateBreakage({ random: () => 0 });
  assert.equal(result.broken, false);
});

test('evaluateBreakage breakageChance - chance 100 always breaks', async () => {
  const tool = new Tool({
    componentId: 'comp-axe',
    breakage: { mode: 'breakageChance', breakageChance: 100 },
  });
  const result = await tool.evaluateBreakage({ random: () => 0.9999 });
  assert.equal(result.broken, true);
});

// ---------------------------------------------------------------------------
// evaluateBreakage - diceExpression
// ---------------------------------------------------------------------------

test('evaluateBreakage diceExpression - breaks when result < threshold', async () => {
  const tool = new Tool({
    componentId: 'comp-axe',
    breakage: { mode: 'diceExpression', formula: '1d20', threshold: 10 },
  });
  const result = await tool.evaluateBreakage({ evaluateExpression: async () => 9 });
  assert.equal(result.broken, true);
  assert.equal(result.evidence.result, 9);
});

test('evaluateBreakage diceExpression - equal to threshold does NOT break', async () => {
  const tool = new Tool({
    componentId: 'comp-axe',
    breakage: { mode: 'diceExpression', formula: '1d20', threshold: 10 },
  });
  const result = await tool.evaluateBreakage({ evaluateExpression: async () => 10 });
  assert.equal(result.broken, false);
});

test('evaluateBreakage diceExpression - non-numeric result does not break', async () => {
  const tool = new Tool({
    componentId: 'comp-axe',
    breakage: { mode: 'diceExpression', formula: 'busted', threshold: 10 },
  });
  const result = await tool.evaluateBreakage({ evaluateExpression: async () => null });
  assert.equal(result.broken, false);
});

// ---------------------------------------------------------------------------
// applyUsage
// ---------------------------------------------------------------------------

test('applyUsage limitedUses - increments timesUsed from missing flag', async () => {
  const tool = new Tool({
    componentId: 'comp-axe',
    breakage: { mode: 'limitedUses', maxUses: 5 },
  });
  const item = new FakeItem({});
  await tool.applyUsage(item);
  assert.deepEqual(item._flags.fabricate.fabricate.toolUsage, { timesUsed: 1 });
});

test('applyUsage limitedUses - increments existing timesUsed', async () => {
  const tool = new Tool({
    componentId: 'comp-axe',
    breakage: { mode: 'limitedUses', maxUses: 5 },
  });
  const item = new FakeItem({ fabricate: { toolUsage: { timesUsed: 2 } } });
  await tool.applyUsage(item);
  assert.equal(item._flags.fabricate.fabricate.toolUsage.timesUsed, 3);
});

test('applyUsage breakageChance - no-op (no flag written)', async () => {
  const tool = new Tool({
    componentId: 'comp-axe',
    breakage: { mode: 'breakageChance', breakageChance: 50 },
  });
  const item = new FakeItem({});
  await tool.applyUsage(item);
  assert.equal(item._flags.fabricate.fabricate, undefined);
});

test('applyUsage diceExpression - no-op (no flag written)', async () => {
  const tool = new Tool({
    componentId: 'comp-axe',
    breakage: { mode: 'diceExpression', formula: '1d6', threshold: 3 },
  });
  const item = new FakeItem({});
  await tool.applyUsage(item);
  assert.equal(item._flags.fabricate.fabricate, undefined);
});

// ---------------------------------------------------------------------------
// applyBreakage
// ---------------------------------------------------------------------------

test('applyBreakage destroy - deletes the item', async () => {
  const tool = new Tool({ componentId: 'comp-axe', onBreak: { mode: 'destroy' } });
  const item = new FakeItem({});
  const result = await tool.applyBreakage({ item });
  assert.equal(item.deleted, true);
  assert.equal(result.action, 'destroyed');
});

test('applyBreakage flagBroken - sets toolBroken flag and does not delete', async () => {
  const tool = new Tool({ componentId: 'comp-axe', onBreak: { mode: 'flagBroken' } });
  const item = new FakeItem({});
  const result = await tool.applyBreakage({ item });
  assert.equal(item.deleted, false);
  assert.equal(item._flags.fabricate.fabricate.toolBroken, true);
  assert.equal(result.action, 'flagged');
});

const flagBrokenTool = () => new Tool({ componentId: 'comp-axe', onBreak: { mode: 'flagBroken' } });

test('applyBreakage flagBroken - appends " (broken)" suffix and flags a named item', async () => {
  const item = makeNamedItem('Hammer');
  const result = await flagBrokenTool().applyBreakage({ item });
  assert.equal(item.name, 'Hammer (broken)');
  assert.equal(item._flags.fabricate.fabricate.toolBroken, true);
  assert.equal(item.deleted, false);
  assert.equal(result.action, 'flagged');
});

test('applyBreakage flagBroken - idempotent on an already-suffixed name', async () => {
  const item = makeNamedItem('Hammer (broken)');
  await flagBrokenTool().applyBreakage({ item });
  assert.equal(item.name, 'Hammer (broken)');
  assert.equal(item._flags.fabricate.fabricate.toolBroken, true);
});

test('applyBreakage flagBroken - does not rename an item already flagged broken', async () => {
  const item = makeNamedItem('Hammer', { fabricate: { toolBroken: true } });
  await flagBrokenTool().applyBreakage({ item });
  assert.equal(item.name, 'Hammer');
  assert.equal(item._flags.fabricate.fabricate.toolBroken, true);
});

test('applyBreakage flagBroken - flags without renaming when item.update is absent', async () => {
  const item = makeUpdatelessItem('Hammer');
  const result = await flagBrokenTool().applyBreakage({ item });
  assert.equal(item.name, 'Hammer');
  assert.equal(item._flags.fabricate.fabricate.toolBroken, true);
  assert.equal(result.action, 'flagged');
});

test('applyBreakage flagBroken - uses the localized suffix when game.i18n resolves it', async () => {
  const priorGame = globalThis.game;
  globalThis.game = { i18n: { localize: (key) => (key === 'FABRICATE.Tool.BrokenNameSuffix' ? ' [kaputt]' : key) } };
  try {
    const item = makeNamedItem('Hammer');
    await flagBrokenTool().applyBreakage({ item });
    assert.equal(item.name, 'Hammer [kaputt]');
    assert.equal(item._flags.fabricate.fabricate.toolBroken, true);
  } finally {
    if (priorGame === undefined) delete globalThis.game;
    else globalThis.game = priorGame;
  }
});

test('applyBreakage replaceWith - deletes original and invokes createReplacement', async () => {
  const tool = new Tool({
    componentId: 'comp-axe',
    onBreak: { mode: 'replaceWith', replacementComponentId: 'comp-axe-broken' },
  });
  const item = new FakeItem({});
  const calls = [];
  const result = await tool.applyBreakage({
    item,
    actor: { id: 'actor-1' },
    createReplacement: async (args) => { calls.push(args); },
  });
  assert.equal(item.deleted, true);
  assert.equal(result.action, 'replaced');
  assert.deepEqual(calls, [{ actor: { id: 'actor-1' }, componentId: 'comp-axe-broken' }]);
});

// ---------------------------------------------------------------------------
// immune breakage mode (issue 419)
// ---------------------------------------------------------------------------

test('immune: normalizes to { mode: "immune" } with no breakage fields', () => {
  const tool = new Tool({ componentId: 'c', breakage: { mode: 'immune', maxUses: 5, breakageChance: 9 } });
  assert.deepEqual(tool.breakage, { mode: 'immune' });
});

test('immune: validates with no breakage field checks', () => {
  const tool = new Tool({ componentId: 'c', breakage: { mode: 'immune' }, onBreak: { mode: 'destroy' } });
  const { valid, errors } = tool.validate();
  assert.equal(valid, true, errors.join(', '));
});

test('immune: evaluateBreakage never breaks', async () => {
  const tool = new Tool({ componentId: 'c', breakage: { mode: 'immune' }, onBreak: { mode: 'destroy' } });
  const result = await tool.evaluateBreakage({ item: new FakeItem({}) });
  assert.deepEqual(result, { broken: false, mode: 'immune', evidence: {} });
});

test('immune: applyUsage writes no toolUsage flag (limitedUses-only)', async () => {
  const tool = new Tool({ componentId: 'c', breakage: { mode: 'immune' }, onBreak: { mode: 'destroy' } });
  const item = new FakeItem({});
  await tool.applyUsage(item);
  assert.equal(item._flags.fabricate.fabricate, undefined, 'no usage flag for immune tool');
});

test('validate: unknown mode error string lists immune', () => {
  // normalizeBreakage coerces an unknown mode to limitedUses, so reach the
  // validation else-branch by mutating the normalized mode to an invalid value.
  const tool = new Tool({ componentId: 'c', breakage: { mode: 'limitedUses', maxUses: null } });
  tool.breakage.mode = 'bogus';
  const { errors } = tool.validate();
  assert.ok(
    errors.some((e) => /immune/.test(e)),
    'the breakage.mode error enumerates immune'
  );
});
