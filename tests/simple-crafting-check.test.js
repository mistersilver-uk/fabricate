// Engine integration tests for the simple pass/fail crafting check
// (CraftingEngine._runSimpleCheck): DC resolution (static / tier / dynamic),
// meet-vs-exceed comparison, per-die critical raw rolls, and the simple/alchemy
// gating. Covers the full matrix of authoring scenarios at craft time.
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.foundry = globalThis.foundry || {
  utils: { randomID: () => Math.random().toString(36).slice(2) },
};
globalThis.ui = globalThis.ui || { notifications: { warn: () => {}, error: () => {} } };

const { CraftingEngine } = await import('../src/systems/CraftingEngine.js');
const { MacroExecutor } = await import('../src/utils/MacroExecutor.js');
const { Tool } = await import('../src/models/Tool.js');

function defaultSimple(overrides = {}) {
  return {
    rollFormula: '1d20',
    dc: 15,
    thresholdMode: 'meet',
    dcMode: 'static',
    tiers: [],
    macroUuid: null,
    checkBreakage: { triggers: [] },
    ...overrides,
  };
}

// A unified trigger forcing `outcome` (and optionally breakTools) when the rolled
// group total equals `value` — the recombined replacement for a per-die crit.
function totalTrigger({ id = 't', groupId = 0, value, outcome = 'none', breakTools = false }) {
  return {
    id,
    condition: { type: 'diceGroup', groupId, aggregate: 'total', operator: '==', value },
    outcome,
    breakTools,
  };
}

function breakage(...triggers) {
  return { checkBreakage: { triggers } };
}

function makeEngine({
  simple,
  resolutionMode = 'simple',
  enabled = true,
  features = {},
  craftingCheck = {},
  alchemy = null,
} = {}) {
  const system = {
    id: 'sys-1',
    resolutionMode,
    features,
    craftingCheck: { enabled, simple, ...craftingCheck },
    ...(alchemy ? { alchemy } : {}),
  };
  const systemManager = { getSystem: () => system };
  const resolutionService = { getMode: () => system.resolutionMode };
  const engine = new CraftingEngine({}, null, resolutionService);
  globalThis.game = {
    fabricate: {
      getCraftingSystemManager: () => systemManager,
      getResolutionModeService: () => resolutionService,
    },
  };
  return { engine, system };
}

// Stub Foundry's Roll: evaluate() resolves to a fixed total and dice terms,
// each described as { number, faces, total } (mirroring an evaluated DiceTerm).
function stubRoll(total, dice = []) {
  globalThis.Roll = class {
    constructor(formula) {
      this.formula = formula;
    }
    async evaluate() {
      return { total, dice };
    }
  };
}

function stubThrowingRoll() {
  globalThis.Roll = class {
    async evaluate() {
      throw new Error('bad formula');
    }
  };
}

const ACTOR = { id: 'a1', name: 'Crafter', items: [] };
const run = (engine, recipe = { craftingSystemId: 'sys-1' }, ingredientSet = null) =>
  engine._runCraftingCheck(recipe, ACTOR, [ACTOR], ingredientSet);

// ── Static DC + comparison ──────────────────────────────────────────────────

test('static DC, meet: roll above the DC passes', async () => {
  const { engine } = makeEngine({ simple: defaultSimple({ dc: 15 }) });
  stubRoll(18, [{ number: 1, faces: 20, total: 18 }]);
  const result = await run(engine);
  assert.equal(result.success, true);
  assert.equal(result.outcome, 'pass');
  assert.equal(result.value, 18);
  assert.equal(result.data.dc, 15);
  assert.equal(result.data.comparison, 'meet');
});

test('static DC, meet: roll below the DC fails', async () => {
  const { engine } = makeEngine({ simple: defaultSimple({ dc: 15 }) });
  stubRoll(10, [{ number: 1, faces: 20, total: 10 }]);
  const result = await run(engine);
  assert.equal(result.success, false);
  assert.equal(result.outcome, 'fail');
  assert.equal(result.value, 10);
});

test('meet: equal to the DC passes (>=)', async () => {
  const { engine } = makeEngine({ simple: defaultSimple({ dc: 15, thresholdMode: 'meet' }) });
  stubRoll(15, [{ number: 1, faces: 20, total: 15 }]);
  assert.equal((await run(engine)).success, true);
});

test('exceed: equal to the DC fails (>)', async () => {
  const { engine } = makeEngine({ simple: defaultSimple({ dc: 15, thresholdMode: 'exceed' }) });
  stubRoll(15, [{ number: 1, faces: 20, total: 15 }]);
  const result = await run(engine);
  assert.equal(result.success, false);
  assert.equal(result.data.comparison, 'exceed');
});

test('exceed: strictly above the DC passes', async () => {
  const { engine } = makeEngine({ simple: defaultSimple({ dc: 15, thresholdMode: 'exceed' }) });
  stubRoll(16, [{ number: 1, faces: 20, total: 16 }]);
  assert.equal((await run(engine)).success, true);
});

// ── Recipe tiers (static DC overrides) ──────────────────────────────────────

test('recipe tier overrides the default DC', async () => {
  const { engine } = makeEngine({
    simple: defaultSimple({ dc: 10, tiers: [{ id: 't1', name: 'Masterwork', dc: 20 }] }),
  });
  stubRoll(18, [{ number: 1, faces: 20, total: 18 }]);
  const result = await run(engine, { craftingSystemId: 'sys-1', checkTierId: 't1' });
  assert.equal(result.data.dc, 20, 'uses the tier DC, not the default');
  assert.equal(result.success, false, '18 < 20');
});

test('unknown tier id falls back to the default DC', async () => {
  const { engine } = makeEngine({
    simple: defaultSimple({ dc: 15, tiers: [{ id: 't1', dc: 20 }] }),
  });
  stubRoll(16, [{ number: 1, faces: 20, total: 16 }]);
  const result = await run(engine, { craftingSystemId: 'sys-1', checkTierId: 'gone' });
  assert.equal(result.data.dc, 15);
  assert.equal(result.success, true);
});

// ── Dynamic DC (macro) ──────────────────────────────────────────────────────

test('dynamic DC: the macro return value is used as the DC', async () => {
  const { engine, system } = makeEngine({
    simple: defaultSimple({ dc: 99, dcMode: 'dynamic', macroUuid: 'Macro.dc' }),
  });
  stubRoll(13, [{ number: 1, faces: 20, total: 13 }]);
  const orig = MacroExecutor.run;
  let received = null;
  MacroExecutor.run = async (uuid, context) => {
    received = { uuid, context };
    return 12;
  };
  try {
    const result = await run(engine, { craftingSystemId: 'sys-1' }, { id: 'set-1' });
    assert.equal(result.data.dc, 12);
    assert.equal(result.success, true, '13 >= 12');
    assert.equal(received.uuid, 'Macro.dc');
    assert.equal(
      received.context.candidateIngredientSet.id,
      'set-1',
      'macro gets the ingredient set'
    );
    assert.ok(received.context.craftingActor && received.context.recipe);
    assert.strictEqual(received.context.craftingSystem, system);
  } finally {
    MacroExecutor.run = orig;
  }
});

test('dynamic DC: a non-numeric macro return falls back to the default DC', async () => {
  const { engine } = makeEngine({
    simple: defaultSimple({ dc: 15, dcMode: 'dynamic', macroUuid: 'Macro.dc' }),
  });
  stubRoll(14, [{ number: 1, faces: 20, total: 14 }]);
  const orig = MacroExecutor.run;
  MacroExecutor.run = async () => 'not a number';
  try {
    const result = await run(engine);
    assert.equal(result.data.dc, 15);
    assert.equal(result.success, false, '14 < 15');
  } finally {
    MacroExecutor.run = orig;
  }
});

test('dynamic DC: a throwing macro falls back to the default DC', async () => {
  const { engine } = makeEngine({
    simple: defaultSimple({ dc: 15, dcMode: 'dynamic', macroUuid: 'Macro.dc' }),
  });
  stubRoll(16, [{ number: 1, faces: 20, total: 16 }]);
  const orig = MacroExecutor.run;
  MacroExecutor.run = async () => {
    throw new Error('boom');
  };
  try {
    const result = await run(engine);
    assert.equal(result.data.dc, 15);
    assert.equal(result.success, true);
  } finally {
    MacroExecutor.run = orig;
  }
});

test('dynamic DC: no macro linked falls back to the default DC', async () => {
  const { engine } = makeEngine({
    simple: defaultSimple({ dc: 15, dcMode: 'dynamic', macroUuid: null }),
  });
  stubRoll(15, [{ number: 1, faces: 20, total: 15 }]);
  const result = await run(engine);
  assert.equal(result.data.dc, 15);
  assert.equal(result.success, true);
});

// ── Forced-outcome triggers ─────────────────────────────────────────────────

test('a forced-success trigger passes below the DC', async () => {
  const { engine } = makeEngine({
    simple: defaultSimple({
      dc: 15,
      ...breakage(totalTrigger({ groupId: 0, value: 20, outcome: 'success', breakTools: true })),
    }),
  });
  stubRoll(5, [{ number: 1, faces: 20, total: 20 }]);
  const result = await run(engine);
  assert.equal(result.success, true);
});

test('a forced-failure trigger fails above the DC', async () => {
  const { engine } = makeEngine({
    simple: defaultSimple({
      dc: 15,
      ...breakage(totalTrigger({ groupId: 0, value: 1, outcome: 'failure' })),
    }),
  });
  stubRoll(30, [{ number: 1, faces: 20, total: 1 }]);
  const result = await run(engine);
  assert.equal(result.success, false);
});

test('a matching forced failure takes precedence over a matching forced success', async () => {
  const { engine } = makeEngine({
    simple: defaultSimple({
      rollFormula: '1d20+1d6',
      dc: 15,
      ...breakage(
        totalTrigger({ id: 'c1', groupId: 0, value: 20, outcome: 'success' }),
        totalTrigger({ id: 'c2', groupId: 1, value: 1, outcome: 'failure' })
      ),
    }),
  });
  stubRoll(21, [
    { number: 1, faces: 20, total: 20 },
    { number: 1, faces: 6, total: 1 },
  ]);
  const result = await run(engine);
  assert.equal(result.success, false, 'forced failure wins');
});

test('a non-matching forced-outcome trigger leaves the comparison in charge', async () => {
  const { engine } = makeEngine({
    simple: defaultSimple({
      dc: 15,
      ...breakage(totalTrigger({ groupId: 0, value: 20, outcome: 'success' })),
    }),
  });
  stubRoll(13, [{ number: 1, faces: 20, total: 13 }]);
  const result = await run(engine);
  assert.equal(result.success, false, '13 < 15 and no forced outcome');
});

// ── Gating: alchemy checkMode (none / simple) ───────────────────────────────
// Alchemy check-ness is driven by the SYSTEM-level alchemy.checkMode, NOT the
// generic craftingCheck.enabled toggle.

test('alchemy checkMode=none never runs a check (auto-success), ignoring a stray formula + enabled', async () => {
  const { engine } = makeEngine({
    simple: defaultSimple({ dc: 15 }),
    resolutionMode: 'alchemy',
    enabled: true,
    alchemy: { checkMode: 'none' },
  });
  stubThrowingRoll();
  const result = await run(engine);
  assert.equal(result.success, true, 'None mode always succeeds a matched brew');
  assert.equal(result.data.dc, undefined, 'the simple check was not evaluated in None mode');
});

test('alchemy checkMode=simple runs the shared simple pass/fail check UNCONDITIONALLY (ungated by enabled)', async () => {
  const { engine } = makeEngine({
    simple: defaultSimple({ dc: 15 }),
    resolutionMode: 'alchemy',
    enabled: false, // checksEnabled is IGNORED for alchemy simple
    alchemy: { checkMode: 'simple' },
  });
  stubRoll(18, [{ number: 1, faces: 20, total: 18 }]);
  const result = await run(engine);
  assert.equal(result.success, true, '18 >= 15 passes');
  assert.equal(result.data.dc, 15, 'the mandatory simple check ran for alchemy simple mode');
});

test('alchemy checkMode=simple with a rolled failure reports failure (not auto-success)', async () => {
  const { engine } = makeEngine({
    simple: defaultSimple({ dc: 15 }),
    resolutionMode: 'alchemy',
    enabled: false,
    alchemy: { checkMode: 'simple' },
  });
  stubRoll(10, [{ number: 1, faces: 20, total: 10 }]);
  const result = await run(engine);
  assert.equal(result.success, false, '10 < 15 fails');
});

test('alchemy checkMode=simple with NO roll formula is a misconfiguration (aborts before mutation)', async () => {
  const { engine } = makeEngine({
    simple: defaultSimple({ rollFormula: '' }),
    resolutionMode: 'alchemy',
    enabled: true,
    alchemy: { checkMode: 'simple' },
  });
  stubThrowingRoll();
  const result = await run(engine);
  assert.equal(result.success, false);
  assert.equal(result.misconfigured, true, 'a mandatory simple check with no formula is misconfigured');
});

test('simple mode with the check disabled does not run (no roll, auto-success)', async () => {
  const { engine } = makeEngine({
    simple: defaultSimple({ dc: 15 }),
    resolutionMode: 'simple',
    enabled: false,
  });
  stubThrowingRoll();
  const result = await run(engine);
  assert.equal(result.success, true, 'a disabled optional check never blocks the craft');
  assert.equal(result.data.dc, undefined, 'the simple check was not evaluated');
});

test('an enabled check with no roll formula does not block the craft', async () => {
  const { engine } = makeEngine({ simple: defaultSimple({ rollFormula: '' }) });
  stubThrowingRoll();
  const result = await run(engine);
  assert.equal(result.success, true);
});

// ── Roll engine edge cases ──────────────────────────────────────────────────

test('no Roll engine available does not block the craft', async () => {
  const { engine } = makeEngine({ simple: defaultSimple({ dc: 15 }) });
  delete globalThis.Roll;
  const result = await run(engine);
  assert.equal(result.success, true);
  assert.equal(result.value, null);
  assert.equal(result.data.dc, 15);
});

test('a roll that throws fails the check with a message', async () => {
  const { engine } = makeEngine({ simple: defaultSimple({ dc: 15 }) });
  stubThrowingRoll();
  const result = await run(engine);
  assert.equal(result.success, false);
  assert.equal(result.outcome, 'fail');
  assert.match(result.message, /roll failed/i);
});

test('dice-group sums (not single die faces) drive a multi-die total trigger', async () => {
  const { engine } = makeEngine({
    simple: defaultSimple({
      rollFormula: '2d6',
      dc: 99,
      ...breakage(totalTrigger({ groupId: 0, value: 12, outcome: 'success' })),
    }),
  });
  // 2d6 summing to 12 matches the trigger's total==12 on group 0.
  stubRoll(12, [{ number: 2, faces: 6, total: 12 }]);
  const result = await run(engine);
  assert.equal(result.success, true);
});

test('duplicate dice terms: a trigger targets a specific group by groupId', async () => {
  const { engine } = makeEngine({
    simple: defaultSimple({
      rollFormula: '1d20+1d20',
      dc: 99,
      // A trigger on the SECOND d20 term (groupId 1) fires when that term totals 20.
      ...breakage(totalTrigger({ groupId: 1, value: 20, outcome: 'success' })),
    }),
  });
  stubRoll(33, [
    { number: 1, faces: 20, total: 13 },
    { number: 1, faces: 20, total: 20 },
  ]);
  const result = await run(engine);
  assert.equal(result.success, true, 'the groupId:1 trigger fires for the second d20 term');
});

// ── Simple-vs-no-formula precedence ─────────────────────────────────────────

test('an empty simple roll formula makes the optional simple check a no-op success', async () => {
  const { engine } = makeEngine({
    simple: defaultSimple({ rollFormula: '' }),
    resolutionMode: 'simple',
    enabled: true,
  });
  // With no roll formula the simple check is not usable; in optional simple mode the
  // attempt proceeds with no check rather than running a (now-removed) macro source.
  const result = await run(engine);
  assert.equal(result.success, true);
  assert.equal(result.outcome, null, 'no check ran, so there is no outcome');
});

// ── Crit breakTools forces tool breakage ────────────────────────────────────

// Build an owned tool item whose Foundry flag set is tracked in a plain map, so
// flagBroken on-break writes are observable without a Foundry runtime.
function makeToolItem(componentId = 'hammer') {
  const flags = {};
  const item = {
    uuid: `Item.${componentId}`,
    parent: { uuid: `Actor.owner`, id: 'owner' },
    getFlag(ns, key) {
      return flags[`${ns}.${key}`];
    },
    async setFlag(ns, key, value) {
      flags[`${ns}.${key}`] = value;
      return value;
    },
  };
  return { item, flags };
}

function neverBreakTool(componentId = 'hammer') {
  // breakageChance 0 never breaks on its own; flagBroken records breakage via a flag.
  return new Tool({
    componentId,
    breakage: { mode: 'breakageChance', breakageChance: 0 },
    onBreak: { mode: 'flagBroken' },
  });
}

test('_applyToolBreakage forceBreak: a never-breaking tool is forced to break', async () => {
  const { engine } = makeEngine({ simple: defaultSimple() });
  const { item, flags } = makeToolItem();
  const tool = neverBreakTool();
  const evidence = await engine._applyToolBreakage(
    { craftingSystemId: 'sys-1' },
    [{ tool, item }],
    { forceBreak: true }
  );
  assert.equal(evidence.length, 1);
  assert.equal(evidence[0].broken, true, 'forceBreak breaks the tool regardless of chance');
  assert.equal(flags['fabricate.fabricate.toolBroken'], true, 'flagBroken on-break ran');
});

test('_applyToolBreakage without forceBreak: a never-breaking tool follows normal behavior', async () => {
  const { engine } = makeEngine({ simple: defaultSimple() });
  const { item, flags } = makeToolItem();
  const tool = neverBreakTool();
  const evidence = await engine._applyToolBreakage(
    { craftingSystemId: 'sys-1' },
    [{ tool, item }],
    { forceBreak: false }
  );
  assert.equal(evidence.length, 1);
  assert.equal(evidence[0].broken, false, 'breakageChance 0 does not break without force');
  assert.equal(flags['fabricate.fabricate.toolBroken'], undefined, 'no on-break ran');
});

test('_applyToolBreakage default (no options) does not force breakage', async () => {
  const { engine } = makeEngine({ simple: defaultSimple() });
  const { item } = makeToolItem();
  const tool = neverBreakTool();
  const evidence = await engine._applyToolBreakage({ craftingSystemId: 'sys-1' }, [{ tool, item }]);
  assert.equal(evidence[0].broken, false, 'the default path follows per-tool behavior');
});

test('checkDriven simple: a breakTools trigger forces break via the decision seam', async () => {
  const { engine, system } = makeEngine({
    simple: defaultSimple({
      dc: 1,
      ...breakage(totalTrigger({ id: 'bt', groupId: 0, value: 20, outcome: 'success', breakTools: true })),
    }),
  });
  system.toolBreakage = { authority: 'checkDriven' };
  stubRoll(20, [{ number: 1, faces: 20, total: 20, results: [{ result: 20, active: true }] }]);
  const result = await run(engine);
  assert.equal(result.success, true);
  const decision = engine._resolveCraftingBreakageDecision(system, { craftingSystemId: 'sys-1' }, result);
  assert.equal(decision.forceBreak, true, 'the breakTools trigger forces a break under checkDriven');
  assert.equal(decision.triggerId, 'bt');
});

test('toolSpecific simple: a breakTools trigger never force-breaks (either-or authority)', async () => {
  const { engine, system } = makeEngine({
    simple: defaultSimple({
      dc: 1,
      ...breakage(totalTrigger({ id: 'bt', groupId: 0, value: 20, outcome: 'none', breakTools: true })),
    }),
  });
  // Default toolSpecific authority: a check never breaks tools.
  stubRoll(20, [{ number: 1, faces: 20, total: 20, results: [{ result: 20, active: true }] }]);
  const result = await run(engine);
  const decision = engine._resolveCraftingBreakageDecision(system, { craftingSystemId: 'sys-1' }, result);
  assert.equal(decision.authority, 'toolSpecific');
  assert.equal(decision.forceBreak, false, 'a matching breakTools trigger is inert under toolSpecific');
});

test('a non-forced success path surfaces no crit/breakTools fields', async () => {
  const { engine } = makeEngine({ simple: defaultSimple({ dc: 15 }) });
  stubRoll(18, [{ number: 1, faces: 20, total: 18 }]);
  const result = await run(engine);
  assert.equal(result.success, true);
  assert.equal(result.data.crit, undefined, 'passFail no longer surfaces a crit object');
  assert.equal(result.data.breakTools, undefined, 'passFail no longer surfaces breakTools');
});

// ── checkBreakage / diceGroups surfacing (issue 419) ─────────────────────────

test('simple check surfaces data.diceGroups with groupId + per-die results', async () => {
  const { engine } = makeEngine({ simple: defaultSimple({ dc: 10 }) });
  stubRoll(13, [{ number: 1, faces: 20, total: 13, results: [{ result: 13, active: true }] }]);
  const r = await run(engine);
  assert.deepEqual(r.data.diceGroups, [{ groupId: 0, group: '1d20', sum: 13, results: [13] }]);
});

test('checkDriven simple: a diceGroup anyDie==1 trigger forces breakage on the success path', async () => {
  const simple = defaultSimple({
    dc: 1,
    checkBreakage: {
      triggers: [{ id: 'nat1', breakTools: true, outcome: 'none', condition: { type: 'diceGroup', groupId: 0, aggregate: 'anyDie', operator: '==', value: 1 } }],
    },
  });
  const { engine, system } = makeEngine({ simple });
  system.toolBreakage = { authority: 'checkDriven' };
  stubRoll(1, [{ number: 1, faces: 20, total: 1, results: [{ result: 1, active: true }] }]);
  const r = await run(engine);
  const decision = engine._resolveCraftingBreakageDecision(system, { craftingSystemId: 'sys-1' }, r);
  assert.equal(decision.authority, 'checkDriven');
  assert.equal(decision.forceBreak, true);
  assert.equal(decision.triggerId, 'nat1');
});

test('toolSpecific simple: no checkBreakage trigger and no crit → no forced break', async () => {
  const { engine, system } = makeEngine({ simple: defaultSimple({ dc: 1 }) });
  stubRoll(20, [{ number: 1, faces: 20, total: 20, results: [{ result: 20, active: true }] }]);
  const r = await run(engine);
  const decision = engine._resolveCraftingBreakageDecision(system, { craftingSystemId: 'sys-1' }, r);
  assert.equal(decision.authority, 'toolSpecific');
  assert.equal(decision.forceBreak, false);
});
