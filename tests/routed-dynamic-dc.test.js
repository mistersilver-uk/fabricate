/**
 * THE ROUTED CHECK'S OWN DC SOURCE (issue 1096).
 *
 * A routed RELATIVE check is defined as bands offset from a DC (`dc + outcome.dc`), so it has
 * a DC by construction — and the engine already resolved it through `_resolveSimpleCheckDc`,
 * which is parameterized over the check config precisely so routed takes the same recipe-tier
 * and dynamic path. The plumbing existed; only the field did not.
 *
 * Four things are pinned here, and each is a way this could silently do nothing:
 *
 * 1. the field SURVIVES A WHOLE NORMALIZER REBUILD — that normalizer is an allowlist, so a
 *    key it does not emit is deleted on the next save;
 * 2. the anchor REACHES THE MACRO, which is what makes tiers and macros compose rather than
 *    compete;
 * 3. a macro that fails FALLS BACK to the anchor and never throws, because a throw inside the
 *    engine is a CONSUMING failure — ingredients spent, tools broken;
 * 4. the DC source TRAVELS with a mode change, which is where it was previously lost.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { CraftingSystemManager } from '../src/systems/CraftingSystemManager.js';

function makeManager() {
  const store = new Map();
  return new CraftingSystemManager({
    getSetting: (key) => store.get(key),
    setSetting: async (key, value) => {
      store.set(key, value);
    },
  });
}

test('the routed slot carries dcMode and macroUuid through a full normalizer rebuild', () => {
  const manager = makeManager();
  const normalized = manager._normalizeCraftingCheck({
    routed: {
      rollFormula: '1d20',
      dc: 12,
      dcMode: 'dynamic',
      macroUuid: 'Macro.abc',
      relativeOutcomes: [{ id: 'o1', name: 'Fine', dc: 0, success: true }],
    },
  });
  assert.equal(normalized.routed.dcMode, 'dynamic');
  assert.equal(normalized.routed.macroUuid, 'Macro.abc');

  // THE REBUILD, not the first pass: the normalizer is an allowlist, so a key it does not
  // emit is dropped the second time round even though it survived the first.
  const rebuilt = manager._normalizeCraftingCheck(normalized);
  assert.equal(rebuilt.routed.dcMode, 'dynamic', 'a second rebuild must not drop the mode');
  assert.equal(rebuilt.routed.macroUuid, 'Macro.abc', 'nor the macro link');
});

test('an absent dcMode reads static, so no stored system needs rewriting', () => {
  const manager = makeManager();
  const normalized = manager._normalizeCraftingCheck({ routed: { rollFormula: '1d20' } });
  assert.equal(normalized.routed.dcMode, 'static');
  assert.equal(normalized.routed.macroUuid, null);
  for (const junk of ['', 'DYNAMIC', 'nonsense', null, 0]) {
    const result = manager._normalizeCraftingCheck({ routed: { dcMode: junk } });
    assert.equal(result.routed.dcMode, 'static', `${JSON.stringify(junk)} is not dynamic`);
  }
});

test('salvage and gathering store the same routed shape, since they share the normalizer', () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({
    id: 's',
    name: 'S',
    salvageCraftingCheck: { routed: { rollFormula: '1d20', dcMode: 'dynamic' } },
    gatheringCraftingCheck: { routed: { rollFormula: '1d20', dcMode: 'dynamic' } },
  });
  // Stored, not offered: their editors withhold the chooser by decision — a dynamic macro
  // and a per-record `dcOverride` are two answers to where the number comes from.
  assert.equal(system.salvageCraftingCheck.routed.dcMode, 'dynamic');
  assert.equal(system.gatheringCraftingCheck.routed.dcMode, 'dynamic');
});

// ── The engine ────────────────────────────────────────────────────────────────────────

/** A bare engine instance: only `_resolveSimpleCheckDc` and its anchor helper are exercised. */
async function resolveDc(config, recipe, macroImpl) {
  const { CraftingEngine } = await import('../src/systems/CraftingEngine.js');
  const engine = Object.create(CraftingEngine.prototype);
  const { MacroExecutor } = await import('../src/utils/MacroExecutor.js');
  const original = MacroExecutor.run;
  MacroExecutor.run = macroImpl ?? original;
  try {
    return await engine._resolveSimpleCheckDc({}, config, recipe, null, null);
  } finally {
    MacroExecutor.run = original;
  }
}

test('a static check resolves the tier DC, else the base DC', async () => {
  const config = { dc: 12, tiers: [{ id: 't1', dc: 21 }] };
  assert.equal(await resolveDc(config, { checkTierId: 't1' }), 21);
  assert.equal(await resolveDc(config, {}), 12);
  assert.equal(await resolveDc(config, { checkTierId: 'gone' }), 12, 'a stale tier id falls back');
});

test('THE MACRO RECEIVES THE ANCHOR and returns the final number', async () => {
  const seen = [];
  const config = { dc: 12, dcMode: 'dynamic', macroUuid: 'Macro.abc', tiers: [{ id: 't1', dc: 21 }] };
  const spy = async (uuid, payload) => {
    seen.push(payload);
    return payload.anchorDc + 3;
  };
  assert.equal(await resolveDc(config, { checkTierId: 't1' }, spy), 24, 'the tier anchors it');
  assert.equal(seen.at(-1).anchorDc, 21, 'the macro is handed the TIER DC, not the base DC');

  assert.equal(await resolveDc(config, {}, spy), 15, 'with no tier the base DC anchors it');
  assert.equal(seen.at(-1).anchorDc, 12);
});

test('the macro still receives everything it used to', async () => {
  let payload = null;
  await resolveDc(
    { dc: 10, dcMode: 'dynamic', macroUuid: 'Macro.abc' },
    { checkTierId: null },
    async (uuid, received) => {
      payload = received;
      return 5;
    }
  );
  for (const key of ['recipe', 'craftingSystem', 'craftingActor', 'candidateIngredientSet']) {
    assert.ok(key in payload, `${key} is still passed — the new argument is ADDITIVE`);
  }
});

test('a macro that fails falls back to the ANCHOR and never throws', async () => {
  const config = { dc: 12, dcMode: 'dynamic', macroUuid: 'Macro.abc', tiers: [{ id: 't1', dc: 21 }] };
  const recipe = { checkTierId: 't1' };
  const cases = [
    ['throws', async () => { throw new Error('boom'); }],
    ['returns a non-number', async () => 'not a number'],
    ['returns nothing', async () => undefined],
    ['returns Infinity', async () => Number.POSITIVE_INFINITY],
  ];
  for (const [label, impl] of cases) {
    assert.equal(await resolveDc(config, recipe, impl), 21, `a macro that ${label} keeps the anchor`);
  }
  assert.equal(
    await resolveDc({ ...config, macroUuid: null }, recipe),
    21,
    'a dynamic check with NO macro keeps the anchor rather than falling to the base DC'
  );
});

test('a dynamic result is truncated, as a DC is a whole number', async () => {
  assert.equal(
    await resolveDc({ dc: 10, dcMode: 'dynamic', macroUuid: 'M' }, {}, async () => 17.8),
    17
  );
});
