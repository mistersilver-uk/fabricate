// Phase 1 (salvage + gathering check parity): the salvage check now exposes the
// crafting simple/routed/progressive sub-object shapes, a system-level gathering
// check exists, and salvage components carry an optional per-component DC override.
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.foundry = {
  utils: { randomID: () => Math.random().toString(36).slice(2) },
};
globalThis.game = { user: { isGM: true }, system: { id: 'dnd5e' }, actors: [], fabricate: null };
globalThis.ui = { notifications: { warn: () => {}, error: () => {} } };

const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');

function makeManager() {
  return new CraftingSystemManager({ getRecipes: () => [] });
}

// ── Salvage check: simple/routed/progressive sub-objects ────────────────────

test('_normalizeSalvageCraftingCheck adds default simple/routed/progressive sub-objects', () => {
  const mgr = makeManager();
  const check = mgr._normalizeSalvageCraftingCheck({});
  // Macro/award/consumption fields preserved.
  assert.equal(check.enabled, false);
  assert.deepEqual(check.outcomes, ['fail', 'pass']);
  // Reuses the crafting shapes.
  assert.deepEqual(check.simple, {
    rollFormula: '',
    dc: 15,
    thresholdMode: 'meet',
    dcMode: 'static',
    tiers: [],
    macroUuid: null,
    diceCrits: [],
    checkBreakage: { enabled: false, triggers: [] },
  });
  assert.equal(check.routed.type, 'relative');
  assert.equal(check.routed.dc, 15);
  assert.deepEqual(check.progressive, {
    awardMode: 'equal',
    allowPlayerReorder: false,
    rollFormula: '',
    diceCrits: [],
    checkBreakage: { enabled: false, triggers: [] },
  });
});

test('_normalizeSalvageCraftingCheck normalizes provided salvage simple/progressive config', () => {
  const mgr = makeManager();
  const check = mgr._normalizeSalvageCraftingCheck({
    simple: { rollFormula: '1d20', dc: '18.6', thresholdMode: 'exceed' },
    progressive: {
      awardMode: 'partial',
      rollFormula: '2d6',
      diceCrits: [{ id: 'c1', die: '2d6', raw: 12, success: true, breakTools: false }],
    },
  });
  assert.equal(check.simple.rollFormula, '1d20');
  assert.equal(check.simple.dc, 18, 'dc truncates to an integer');
  assert.equal(check.simple.thresholdMode, 'exceed');
  assert.equal(check.progressive.awardMode, 'partial');
  assert.equal(check.progressive.rollFormula, '2d6');
  assert.equal(check.progressive.diceCrits.length, 1);
});

// ── System-level gathering check ────────────────────────────────────────────

test('_normalizeGatheringCraftingCheck defaults to disabled with progressive/routed shapes', () => {
  const mgr = makeManager();
  const check = mgr._normalizeGatheringCraftingCheck({});
  assert.equal(check.enabled, false);
  assert.deepEqual(check.progressive, {
    awardMode: 'equal',
    allowPlayerReorder: false,
    rollFormula: '',
    diceCrits: [],
    checkBreakage: { enabled: false, triggers: [] },
  });
  assert.equal(check.routed.type, 'relative');
  // d100 needs no editable config — there is no `simple` sub-object.
  assert.equal(check.simple, undefined);
});

test('_normalizeSystem includes a normalized gatheringCraftingCheck', () => {
  const mgr = makeManager();
  const system = mgr._normalizeSystem({
    id: 'sys-1',
    name: 'Sys',
    gatheringCraftingCheck: { enabled: true, routed: { type: 'fixed' } },
  });
  assert.ok(system.gatheringCraftingCheck, 'gathering check is present on the system');
  assert.equal(system.gatheringCraftingCheck.enabled, true);
  assert.equal(system.gatheringCraftingCheck.routed.type, 'fixed');
});

// ── Per-component salvage DC override ───────────────────────────────────────

test('_normalizeSalvage coerces dcOverride (finite truncates, else null)', () => {
  const mgr = makeManager();
  assert.equal(mgr._normalizeSalvage({ enabled: true, dcOverride: '17.9' }).dcOverride, 17);
  assert.equal(mgr._normalizeSalvage({ enabled: true, dcOverride: 'nope' }).dcOverride, null);
  assert.equal(mgr._normalizeSalvage({ enabled: true }).dcOverride, null, 'absent → null');
  // The non-object default branch also carries the field.
  assert.equal(mgr._normalizeSalvage(null).dcOverride, null);
  // Re-normalizing a null override stays null (Number(null) is 0 — must not become 0).
  const once = mgr._normalizeSalvage({ enabled: true });
  assert.equal(mgr._normalizeSalvage(once).dcOverride, null, 'null override is idempotent');
  // A finite override round-trips unchanged.
  const withDc = mgr._normalizeSalvage({ enabled: true, dcOverride: 12 });
  assert.equal(mgr._normalizeSalvage(withDc).dcOverride, 12);
});

// ── Idempotence ─────────────────────────────────────────────────────────────

test('salvage + gathering check normalization is idempotent', () => {
  const mgr = makeManager();
  const salvageOnce = mgr._normalizeSalvageCraftingCheck({
    simple: { rollFormula: '1d20', dc: 18 },
    progressive: { awardMode: 'exceed', rollFormula: '2d6' },
  });
  assert.deepEqual(mgr._normalizeSalvageCraftingCheck(salvageOnce), salvageOnce);
  const gatherOnce = mgr._normalizeGatheringCraftingCheck({ enabled: true, routed: { type: 'fixed' } });
  assert.deepEqual(mgr._normalizeGatheringCraftingCheck(gatherOnce), gatherOnce);
});
