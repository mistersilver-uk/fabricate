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
const { normalizeCheckEvaluation, normalizeNullableSuccesses } = await import(
  '../src/systems/normalize/checkEvaluation.js'
);

// Helper: make a minimal manager
function makeManager() {
  return new CraftingSystemManager({ getRecipes: () => [] });
}

// Crafting check normalization (manager) — usable = authored rollFormula; the legacy check-source
// fields (root macroUuid/successMacroUuid/ failureMacroUuid/checkSource/builtIn) are gone.

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
  // The dead `tiered` / `namedOutcomes` default of `['low', 'high']` is gone: an absent outcomes
  // list always defaults to `['fail', 'pass']`, even when a legacy `tiered` mode is supplied.
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
    evaluation: normalizeCheckEvaluation(),
    dc: 15,
    thresholdMode: 'meet',
    // The routed slot carries its own DC SOURCE (issue 1096), absence-preserving: anything
    // that is not exactly `dynamic` reads `static`, so a system authored before the field
    // existed loads unchanged and needs no rewrite.
    dcMode: 'static',
    macroUuid: null,
    tiers: [],
    relativeOutcomes: [],
    fixedOutcomes: [],
    checkBreakage: { triggers: [] },
  });
});

test('all eight persisted check slots normalize complete defaults', () => {
  const mgr = makeManager();
  const slots = [
    ...['simple', 'progressive', 'routed'].map((key) => mgr._normalizeCraftingCheck({})[key]),
    ...['simple', 'progressive', 'routed'].map(
      (key) => mgr._normalizeSalvageCraftingCheck({})[key]
    ),
    ...['progressive', 'routed'].map((key) => mgr._normalizeGatheringCraftingCheck({})[key]),
  ];
  assert.equal(slots.length, 8);
  for (const slot of slots) assert.deepEqual(slot.evaluation, normalizeCheckEvaluation());
});

test('all eight check slots retain inactive evaluation choices through a second normalization', () => {
  const mgr = makeManager();
  const authored = {
    product: 'count',
    direction: 'under',
    target: {
      source: 'attribute',
      expression: '@skills.repair.value + 2',
      adjustmentKind: 'multiply',
      baseAdjustment: 0.5,
    },
    pool: {
      die: 20,
      base: '@abilities.int.value + 1',
      threshold: '@skills.repair.value',
      required: 3,
      modifierDestination: 'threshold',
      zeroPoolFails: false,
      explode: { enabled: true, faces: { kind: 'from', value: 19 }, once: true },
      cancel: { enabled: true, faces: { kind: 'from', value: 2 } },
      additionalDice: {
        enabled: true,
        source: 'macro',
        path: 'system.resources.ap.value',
        readMacroUuid: 'Macro.read',
        spendMacroUuid: 'Macro.spend',
        max: 4,
      },
    },
  };
  for (const [normalize, keys] of [
    [(input) => mgr._normalizeCraftingCheck(input), ['simple', 'progressive', 'routed']],
    [(input) => mgr._normalizeSalvageCraftingCheck(input), ['simple', 'progressive', 'routed']],
    [(input) => mgr._normalizeGatheringCraftingCheck(input), ['progressive', 'routed']],
  ]) {
    const input = Object.fromEntries(keys.map((key) => [key, { evaluation: authored }]));
    const once = normalize(input);
    const twice = normalize(once);
    for (const key of keys) {
      assert.deepEqual(once[key].evaluation, authored, key);
      assert.deepEqual(twice[key].evaluation, authored, `${key} is idempotent`);
    }
  }
});

test('evaluation clamps bounded integers while preserving finite adjustment values', () => {
  const normalized = normalizeCheckEvaluation({
    product: 'unknown',
    direction: 'unknown',
    target: { baseAdjustment: 0.2 },
    pool: { die: 1, required: 99, additionalDice: { max: 40 } },
  });
  assert.equal(normalized.product, 'sum');
  assert.equal(normalized.direction, 'over');
  assert.equal(normalized.target.baseAdjustment, 0.2);
  assert.equal(normalized.pool.die, 10);
  assert.equal(normalized.pool.required, 20);
  assert.equal(normalized.pool.additionalDice.max, 20);
});

test('explode and cancel faces keep authored values beyond the die for readiness to flag', () => {
  const normalized = normalizeCheckEvaluation({
    pool: {
      die: 10,
      explode: { enabled: true, faces: { kind: 'from', value: 18 } },
      cancel: { enabled: true, faces: { kind: 'from', value: 0 } },
    },
  });
  assert.deepEqual(normalized.pool.explode.faces, { kind: 'from', value: 18 });
  assert.deepEqual(normalized.pool.cancel.faces, { kind: 'from', value: null });
  assert.deepEqual(normalizeCheckEvaluation(normalized), normalized);
});

test('nullable success counts clamp to 0-20 like the required count', () => {
  for (const [input, expected] of [
    [25, 20],
    [-1, 0],
    [7, 7],
    ['3', 3],
    [2.5, null],
    ['', null],
    [null, null],
  ]) {
    assert.equal(normalizeNullableSuccesses(input), expected, String(input));
  }
});

test('tier and routed outcome difficulty siblings retain inactive values', () => {
  const mgr = makeManager();
  const check = mgr._normalizeCraftingCheck({
    simple: { tiers: [{ id: 't', dc: 12, adjustment: 0.5, successes: 3 }] },
    routed: {
      tiers: [{ id: 'r', dc: 13, adjustment: -2, successes: 2 }],
      relativeOutcomes: [{ id: 'o', dc: 2, adjustment: 0.2 }],
    },
  });
  assert.equal(check.simple.tiers[0].adjustment, 0.5);
  assert.equal(check.simple.tiers[0].successes, 3);
  assert.equal(check.routed.tiers[0].adjustment, -2);
  assert.equal(check.routed.tiers[0].successes, 2);
  assert.equal(check.routed.relativeOutcomes[0].adjustment, 0.2);
  assert.deepEqual(mgr._normalizeCraftingCheck(check), check);
});

// Issue 975 — the legacy routed `natStepping` boolean converts on READ into the pair of
// tier-stepping triggers that reproduce it.

/**
 * The exact trigger pair `_convertNatSteppingToTriggers` synthesises for a
 * `natStepping: true` routed check whose d20 group sits at `groupId`.
 */
function natStepPair(groupId = 0) {
  const condition = (value) => ({
    type: 'diceGroup',
    groupId,
    aggregate: 'allDice',
    operator: '==',
    value,
  });
  return [
    {
      id: 'natstep-up',
      condition: condition(20),
      outcome: 'none',
      breakTools: false,
      tierStep: { mode: 'up', steps: 1, tierId: null },
    },
    {
      id: 'natstep-down',
      condition: condition(1),
      outcome: 'none',
      breakTools: false,
      tierStep: { mode: 'down', steps: 1, tierId: null },
    },
  ];
}

test('_normalizeCraftingCheck converts a routed natStepping boolean into a trigger pair', () => {
  const mgr = makeManager();
  const routed = mgr._normalizeCraftingCheck({
    routed: { rollFormula: '1d20+@abilities.int.mod', natStepping: true },
  }).routed;

  assert.equal(routed.natStepping, undefined, 'the legacy boolean is dropped from the output');
  assert.deepEqual(routed.checkBreakage.triggers, natStepPair(0));
});

test('_normalizeSalvageCraftingCheck migrates routed natStepping identically', () => {
  const mgr = makeManager();
  const routed = mgr._normalizeSalvageCraftingCheck({
    routed: { rollFormula: '1d20', natStepping: true },
  }).routed;

  assert.equal(routed.natStepping, undefined);
  assert.deepEqual(routed.checkBreakage.triggers, natStepPair(0));
});

test('_normalizeGatheringCraftingCheck converts a stray routed natStepping identically', () => {
  const mgr = makeManager();
  // No gathering check has ever persisted `natStepping` — the retired opt-in spread never
  // re-emitted it here — so nothing converts in practice.
  const routed = mgr._normalizeGatheringCraftingCheck({
    routed: { rollFormula: '1d20', natStepping: true },
  }).routed;

  assert.equal(routed.natStepping, undefined);
  assert.deepEqual(routed.checkBreakage.triggers, natStepPair(0));
});

test('routed natStepping conversion targets the first d20 group in the formula', () => {
  const mgr = makeManager();
  const routed = mgr._normalizeCraftingCheck({
    routed: { rollFormula: '2d6+1d20+1d20', natStepping: true },
  }).routed;

  // Group 0 is the 2d6; the first d20 is group 1. A duplicate-d20 formula targets
  // that first group only — the accepted caveat the crit conversion already carries.
  assert.deepEqual(routed.checkBreakage.triggers, natStepPair(1));
});

test('routed natStepping conversion survives a modified d20 pool', () => {
  const mgr = makeManager();
  // `2d20kh1` is crit-INELIGIBLE, so the crit conversion's plain-dice filter would drop it.
  const routed = mgr._normalizeCraftingCheck({
    routed: { rollFormula: '2d20kh1+5', natStepping: true },
  }).routed;

  assert.deepEqual(routed.checkBreakage.triggers, natStepPair(0));
});

test('routed natStepping synthesises nothing when it was already inert', () => {
  const mgr = makeManager();
  const triggersFor = (routed) =>
    mgr._normalizeCraftingCheck({ routed }).routed.checkBreakage.triggers;

  assert.deepEqual(
    triggersFor({ rollFormula: '1d20', type: 'fixed', natStepping: true }),
    [],
    'a fixed check never stepped, so its flag was already inert'
  );
  assert.deepEqual(
    triggersFor({ rollFormula: '1d20', natStepping: false }),
    [],
    'an explicit false converts nothing'
  );
  assert.deepEqual(
    triggersFor({ rollFormula: '1d20' }),
    [],
    'an absent natStepping converts nothing'
  );
  assert.deepEqual(
    triggersFor({ rollFormula: '', natStepping: true }),
    [],
    'an empty formula has no d20 group'
  );
  assert.deepEqual(
    triggersFor({ rollFormula: '2d6+3', natStepping: true }),
    [],
    'a formula with no d20 group has nothing to step on'
  );
  assert.deepEqual(
    triggersFor({ rollFormula: '1d20', natStepping: 'true' }),
    [],
    'only a literal boolean true converts'
  );
});

test('routed natStepping conversion is idempotent across a second normalize pass', () => {
  const mgr = makeManager();
  const once = mgr._normalizeCraftingCheck({
    routed: { rollFormula: '1d20', natStepping: true },
  });
  const twice = mgr._normalizeCraftingCheck(once);

  assert.deepEqual(
    twice.routed.checkBreakage.triggers,
    once.routed.checkBreakage.triggers,
    'a second pass converts nothing and duplicates nothing'
  );
  assert.deepEqual(twice.routed, once.routed, 'the whole routed block is a fixpoint');
});

test('a converted nat-step trigger re-normalized still carries breakTools false', () => {
  const mgr = makeManager();
  // The `isLegacyBreakOnly` trap: that test keys on `outcome === undefined && breakTools ===
  // undefined`, so a synthesised trigger MUST write both explicitly.
  const once = mgr._normalizeCraftingCheck({
    routed: { rollFormula: '1d20', natStepping: true },
  });
  const twice = mgr._normalizeCraftingCheck(once);

  for (const trigger of twice.routed.checkBreakage.triggers) {
    assert.equal(trigger.breakTools, false, `${trigger.id} must not break tools`);
    assert.equal(trigger.outcome, 'none', `${trigger.id} must not force an outcome`);
  }
});

test('converted crits, converted nat-stepping and authored triggers keep that order', () => {
  const mgr = makeManager();
  const triggers = mgr._normalizeCraftingCheck({
    routed: {
      rollFormula: '1d20',
      natStepping: true,
      diceCrits: [{ id: 'crit', die: '1d20', raw: 20, success: true }],
      checkBreakage: {
        triggers: [
          {
            id: 'authored',
            outcome: 'none',
            breakTools: false,
            condition: { type: 'rollTotal', operator: '>=', value: 18 },
          },
        ],
      },
    },
  }).routed.checkBreakage.triggers;

  assert.deepEqual(
    triggers.map((trigger) => trigger.id),
    ['crit', 'natstep-up', 'natstep-down', 'authored']
  );
});

test('natStepping on non-routed check shapes converts nothing', () => {
  const mgr = makeManager();
  // Only the routed normalizer forwards the legacy field; the simple and progressive
  // call sites pass no legacy-routed argument at all, so the key is simply unknown
  // to them and is stripped by the allowlist.
  const crafting = mgr._normalizeCraftingCheck({
    simple: { rollFormula: '1d20', natStepping: true },
    progressive: { rollFormula: '1d20', natStepping: true },
  });

  assert.equal(crafting.simple.natStepping, undefined);
  assert.equal(crafting.progressive.natStepping, undefined);
  assert.deepEqual(crafting.simple.checkBreakage.triggers, []);
  assert.deepEqual(crafting.progressive.checkBreakage.triggers, []);
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
    evaluation: normalizeCheckEvaluation(),
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
    evaluation: normalizeCheckEvaluation(),
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
  // Issue 651 retired the system-level reorder flag.
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
