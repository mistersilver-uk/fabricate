import test from 'node:test';
import assert from 'node:assert/strict';

// Minimal FoundryVTT globals
globalThis.foundry = {
  utils: { randomID: () => Math.random().toString(36).slice(2) },
};
globalThis.game = {
  user: { isGM: true },
  system: { id: 'dnd5e' },
  actors: [],
  fabricate: null,
};
globalThis.ui = { notifications: { warn: () => {}, error: () => {} } };

const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');

// Helper: make a minimal manager
function makeManager() {
  return new CraftingSystemManager({ getRecipes: () => [] });
}

// ───────────────────────────────────────────────────────────
// Crafting check normalization (manager) — usable = authored rollFormula;
// the legacy check-source fields (root macroUuid/successMacroUuid/
// failureMacroUuid/checkSource/builtIn) are gone.
// ───────────────────────────────────────────────────────────

test('_normalizeCraftingCheck drops the deprecated check-source fields', () => {
  const mgr = makeManager();
  const result = mgr._normalizeCraftingCheck({
    enabled: false,
    macroUuid: 'Macro.legacy',
    successMacroUuid: 'Macro.s',
    failureMacroUuid: 'Macro.f',
    checkSource: 'builtIn',
    builtIn: { ability: 'int', skill: 'arc', dc: 20, advantage: 'advantage' },
  });
  assert.equal(result.macroUuid, undefined, 'root macroUuid is removed');
  assert.equal(result.successMacroUuid, undefined);
  assert.equal(result.failureMacroUuid, undefined);
  assert.equal(result.checkSource, undefined);
  assert.equal(result.builtIn, undefined);
  // `enabled` is now purely the on/off toggle — a legacy macro/builtIn config no
  // longer flips it on.
  assert.equal(result.enabled, false);
});

test('_normalizeCraftingCheck normalizes mode to the single valid value passFail', () => {
  const mgr = makeManager();
  // `passFail` is the only valid `craftingCheck.mode`; anything else — including the
  // removed `tiered` / `namedOutcomes` values and garbage — collapses to `passFail`.
  assert.equal(mgr._normalizeCraftingCheck({}).mode, 'passFail');
  assert.equal(mgr._normalizeCraftingCheck({ mode: 'passFail' }).mode, 'passFail');
  assert.equal(mgr._normalizeCraftingCheck({ mode: 'tiered' }).mode, 'passFail');
  assert.equal(mgr._normalizeCraftingCheck({ mode: 'namedOutcomes' }).mode, 'passFail');
  assert.equal(mgr._normalizeCraftingCheck({ mode: 'bogus' }).mode, 'passFail');
});

test('_normalizeCraftingCheck defaults outcomes to [fail, pass] regardless of mode', () => {
  const mgr = makeManager();
  // The dead `tiered` / `namedOutcomes` default of `['low', 'high']` is gone: an absent
  // outcomes list always defaults to `['fail', 'pass']`, even when a legacy `tiered` mode
  // is supplied.
  assert.deepEqual(mgr._normalizeCraftingCheck({}).outcomes, ['fail', 'pass']);
  assert.deepEqual(mgr._normalizeCraftingCheck({ mode: 'tiered' }).outcomes, ['fail', 'pass']);
  assert.deepEqual(
    mgr._normalizeCraftingCheck({ mode: 'namedOutcomes', outcomes: [] }).outcomes,
    ['fail', 'pass']
  );
});

test('_normalizeCraftingCheck preserves authored outcomes trimmed, lowercased, and deduped', () => {
  const mgr = makeManager();
  const result = mgr._normalizeCraftingCheck({
    outcomes: [' Critical ', 'success', 'SUCCESS', 'failure', ''],
  });
  assert.deepEqual(result.outcomes, ['critical', 'success', 'failure']);
});

test('_normalizeCraftingCheck enabled reflects only the enabled flag', () => {
  const mgr = makeManager();
  assert.equal(mgr._normalizeCraftingCheck({ enabled: true }).enabled, true);
  assert.equal(mgr._normalizeCraftingCheck({ enabled: false }).enabled, false);
  assert.equal(mgr._normalizeCraftingCheck({}).enabled, false);
});

test('_normalizeCraftingCheck defaults the routed config when absent', () => {
  const mgr = makeManager();
  const result = mgr._normalizeCraftingCheck({});
  assert.deepEqual(result.routed, {
    type: 'relative',
    rollFormula: '',
    dc: 15,
    thresholdMode: 'meet',
    tiers: [],
    relativeOutcomes: [],
    fixedOutcomes: [],
    checkBreakage: { triggers: [] },
  });
});

test('_normalizeCraftingCheck routed migrates legacy crits into unified triggers', () => {
  const mgr = makeManager();
  const result = mgr._normalizeCraftingCheck({
    routed: {
      rollExpression: '1d20', // legacy field still read for back-compat
      dc: '12.7',
      thresholdMode: 'exceed',
      tiers: [{ name: ' Hard ', dc: '18' }],
      diceCrits: [{ die: '1d20', raw: '20', success: true, breakTools: true }],
    },
  });
  assert.equal(result.routed.rollFormula, '1d20', 'rollExpression migrates to rollFormula');
  assert.equal(result.routed.dc, 12, 'dc is truncated');
  assert.equal(result.routed.thresholdMode, 'exceed');
  assert.equal(result.routed.tiers[0].name, 'Hard');
  assert.equal(result.routed.tiers[0].dc, 18);
  assert.ok(result.routed.tiers[0].id, 'a tier id is generated');
  assert.equal(result.routed.diceCrits, undefined, 'the legacy diceCrits field is dropped');
  const trigger = result.routed.checkBreakage.triggers[0];
  assert.deepEqual(trigger.condition, {
    type: 'diceGroup',
    groupId: 0,
    aggregate: 'total',
    operator: '==',
    value: 20,
  });
  assert.equal(trigger.outcome, 'success');
  assert.equal(trigger.breakTools, true);
});

test('_normalizeCraftingCheck normalizes relative and fixed tiers independently', () => {
  const mgr = makeManager();
  const result = mgr._normalizeCraftingCheck({
    routed: {
      type: 'fixed',
      rollExpression: '1d20+@attributes.con.mod',
      relativeOutcomes: [
        { name: '  Botch  ', success: false, breakTools: true, dc: -2.7, start: 99, end: 99 },
        'not-an-object',
      ],
      fixedOutcomes: [
        { id: 'keep', name: 'Hit', success: true, breakTools: false, dc: 9, start: '1', end: '20' },
        null,
      ],
    },
  });
  assert.equal(result.routed.type, 'fixed');
  assert.equal(result.routed.rollFormula, '1d20+@attributes.con.mod');

  assert.equal(result.routed.relativeOutcomes.length, 1, 'non-object entries are dropped');
  const relative = result.routed.relativeOutcomes[0];
  assert.ok(relative.id, 'a missing id is generated');
  assert.equal(relative.name, 'Botch');
  assert.equal(relative.dc, -2, 'dc is truncated to an integer');
  assert.equal(relative.start, undefined, 'relative tiers carry no range fields');
  assert.equal(relative.end, undefined);

  assert.equal(result.routed.fixedOutcomes.length, 1);
  const fixed = result.routed.fixedOutcomes[0];
  assert.equal(fixed.id, 'keep', 'an existing id is preserved');
  assert.equal(fixed.start, 1);
  assert.equal(fixed.end, 20);
  assert.equal(fixed.dc, undefined, 'fixed tiers carry no dc field');
});

test('_normalizeCraftingCheck coerces an invalid routed type to relative', () => {
  const mgr = makeManager();
  const result = mgr._normalizeCraftingCheck({ routed: { type: 'bogus' } });
  assert.equal(result.routed.type, 'relative');
});

test('_normalizeCraftingCheck defaults the simple config when absent', () => {
  const mgr = makeManager();
  const result = mgr._normalizeCraftingCheck({});
  assert.deepEqual(result.simple, {
    rollFormula: '',
    dc: 15,
    thresholdMode: 'meet',
    dcMode: 'static',
    tiers: [],
    macroUuid: null,
    checkBreakage: { triggers: [] },
  });
});

test('_normalizeCraftingCheck defaults the progressive check when absent', () => {
  const mgr = makeManager();
  const result = mgr._normalizeCraftingCheck({});
  assert.deepEqual(result.progressive, {
    awardMode: 'equal',
    rollFormula: '',
    checkBreakage: { triggers: [] },
  });
});

test('_normalizeCraftingCheck migrates progressive crits into unified triggers (formula, award settings)', () => {
  const mgr = makeManager();
  const result = mgr._normalizeCraftingCheck({
    progressive: {
      awardMode: 'partial',
      allowPlayerReorder: true,
      rollFormula: '2d6+@abilities.int.mod',
      diceCrits: [
        { id: 'c1', die: '2d6', raw: '12', success: true, breakTools: true },
        { die: '2d6', raw: 2, success: false },
        { die: '', raw: 3, success: false },
        'not-an-object',
      ],
    },
  });
  assert.equal(result.progressive.awardMode, 'partial', 'award settings are preserved');
  // Issue 651 retired the system-level reorder flag. The allowlist normalizer drops it
  // on EVERY normalize — including on import of a legacy payload like this one — which
  // is why a legacy import can never reintroduce it.
  assert.equal(
    result.progressive.allowPlayerReorder,
    undefined,
    'the retired system-level allowPlayerReorder is dropped'
  );
  assert.equal(result.progressive.rollFormula, '2d6+@abilities.int.mod');
  assert.equal(result.progressive.diceCrits, undefined, 'the legacy diceCrits field is dropped');
  // Each valid crit converts to a diceGroup/total/== trigger; die-less / non-object dropped.
  const triggers = result.progressive.checkBreakage.triggers;
  assert.equal(triggers.length, 2);
  assert.equal(triggers[0].id, 'c1');
  assert.equal(triggers[0].condition.value, 12, 'raw is truncated into the trigger value');
  assert.equal(triggers[0].outcome, 'success');
  assert.equal(triggers[0].breakTools, true);
  assert.equal(triggers[1].outcome, 'failure');
  assert.equal(triggers[1].breakTools, false);
});

test('_normalizeCraftingCheck coerces an invalid progressive awardMode to equal', () => {
  const mgr = makeManager();
  const result = mgr._normalizeCraftingCheck({ progressive: { awardMode: 'bogus' } });
  assert.equal(result.progressive.awardMode, 'equal');
});

test('_normalizeCraftingCheck normalizes the simple check (threshold, tiers, migrated crits)', () => {
  const mgr = makeManager();
  const result = mgr._normalizeCraftingCheck({
    simple: {
      rollFormula: '1d20+@abilities.int.mod',
      dc: '18.6',
      thresholdMode: 'exceed',
      dcMode: 'dynamic',
      macroUuid: 'Macro.abc',
      tiers: [
        { name: '  Hard  ', dc: '20' },
        { id: 'keep', name: 'Easy', dc: 10.9 },
        'not-an-object',
        null,
      ],
      diceCrits: [
        { id: 'c1', die: '1d20', raw: '20', success: true, breakTools: true },
        { die: '1d20', raw: 1, success: false },
        { die: '', raw: 3, success: false },
        'not-an-object',
      ],
    },
  });
  assert.equal(result.simple.dcMode, 'dynamic');
  assert.equal(result.simple.dc, 18, 'threshold is truncated to an integer');
  assert.equal(result.simple.thresholdMode, 'exceed');
  assert.equal(result.simple.macroUuid, 'Macro.abc', 'the dynamic-DC macro is preserved');
  assert.equal(result.simple.tiers.length, 2, 'non-object tiers are dropped');
  assert.equal(result.simple.tiers[0].name, 'Hard');
  assert.equal(result.simple.tiers[1].id, 'keep', 'an existing tier id is preserved');
  assert.equal(result.simple.tiers[1].dc, 10, 'tier DC is truncated to an integer');
  // Each valid crit migrates to a unified trigger; die-less / non-object dropped.
  const triggers = result.simple.checkBreakage.triggers;
  assert.equal(triggers.length, 2);
  assert.equal(triggers[0].id, 'c1', 'an existing crit id is preserved as the trigger id');
  assert.equal(triggers[0].condition.value, 20, 'raw is truncated into the trigger value');
  assert.equal(triggers[0].outcome, 'success');
  assert.equal(triggers[0].breakTools, true);
  assert.ok(triggers[1].id, 'a missing crit id is generated');
  assert.equal(triggers[1].outcome, 'failure');
  assert.equal(triggers[1].breakTools, false, 'breakTools defaults to false');
});

test('_normalizeCraftingCheck clamps a converted crit value to the die produceable range', () => {
  const mgr = makeManager();
  const result = mgr._normalizeCraftingCheck({
    simple: {
      // The formula must carry each crit-eligible die: crits are kept only when
      // their die is a plain group in the formula.
      rollFormula: '1d20+2d6',
      diceCrits: [
        // Above max (1d20 max is 20) clamps down to 20.
        { id: 'hi', die: '1d20', raw: 99, success: true },
        // Below min (2d6 min is 2) clamps up to 2.
        { id: 'lo', die: '2d6', raw: 1, success: false },
        // In range is untouched.
        { id: 'ok', die: '2d6', raw: 7, success: true },
      ],
    },
  });
  const byId = Object.fromEntries(result.simple.checkBreakage.triggers.map((t) => [t.id, t]));
  assert.equal(byId.hi.condition.value, 20, 'raw above N*S clamps to the max');
  assert.equal(byId.hi.condition.groupId, 0, '1d20 maps to the first group');
  assert.equal(byId.lo.condition.value, 2, 'raw below N clamps to the min');
  assert.equal(byId.lo.condition.groupId, 1, '2d6 maps to the second group');
  assert.equal(byId.ok.condition.value, 7, 'an in-range raw is unchanged');
});

test('_normalizeCraftingCheck canonicalizes a bare dN crit die when converting it', () => {
  const mgr = makeManager();
  const result = mgr._normalizeCraftingCheck({
    simple: {
      rollFormula: 'd20+5',
      diceCrits: [{ id: 'bare', die: 'd20', raw: 20, success: true }],
    },
  });
  assert.equal(result.simple.checkBreakage.triggers.length, 1, 'a bare dN crit is converted');
  assert.deepEqual(result.simple.checkBreakage.triggers[0].condition, {
    type: 'diceGroup',
    groupId: 0,
    aggregate: 'total',
    operator: '==',
    value: 20,
  });
});

test('_normalizeCraftingCheck drops a crit authored against a modified pool, across simple/progressive/routed', () => {
  const mgr = makeManager();
  // `2d20kh1` is a modified pool exposing no plain group total, so a crit keyed to
  // it is crit-ineligible and dropped (converted to no trigger) in every check shape.
  const orphanedCrit = { id: 'orphan', die: '2d20', raw: 20, success: true };
  const simple = mgr._normalizeCraftingCheck({
    simple: { rollFormula: '2d20kh1', diceCrits: [orphanedCrit] },
  });
  const progressive = mgr._normalizeCraftingCheck({
    progressive: { rollFormula: '2d20kh1', diceCrits: [orphanedCrit] },
  });
  const routed = mgr._normalizeCraftingCheck({
    routed: { rollFormula: '2d20kh1', diceCrits: [orphanedCrit] },
  });
  assert.deepEqual(simple.simple.checkBreakage.triggers, [], 'simple drops the modified-pool crit');
  assert.deepEqual(
    progressive.progressive.checkBreakage.triggers,
    [],
    'progressive drops the modified-pool crit'
  );
  assert.deepEqual(routed.routed.checkBreakage.triggers, [], 'routed drops the modified-pool crit');
});

test('_normalizeCraftingCheck coerces invalid simple dcMode/thresholdMode to defaults', () => {
  const mgr = makeManager();
  const result = mgr._normalizeCraftingCheck({
    simple: { dcMode: 'bogus', thresholdMode: 'nope' },
  });
  assert.equal(result.simple.dcMode, 'static');
  assert.equal(result.simple.thresholdMode, 'meet');
});
