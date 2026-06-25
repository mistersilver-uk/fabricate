// Engine integration tests for the authored routed crafting check
// (CraftingEngine._runRoutedCheck via the _runCraftingCheck routed dispatch):
// relative + fixed tier mapping, threshold meet/exceed, breakTools tiers, the
// recipe-tier / dynamic base-DC resolution (which mirrors the simple check, NOT
// the flat salvage DC), and the no-formula fallback to the legacy macro path.
import test from 'node:test';
import assert from 'node:assert/strict';

const {
  installRoutedCheckEnv,
  stubRoll,
  evaluateArgs,
  clearRollEngine,
  defaultRouted,
  makeRoutedEngine,
  runRoutedCheck,
} = await import('./helpers/routedCheckEngine.js');

installRoutedCheckEnv();

const { MacroExecutor } = await import('../src/utils/MacroExecutor.js');

// Two success tiers (relative deltas) + one failure tier, so threshold + crit
// routing have something to land on. Base DC default is 15.
const RELATIVE_TIERS = [
  { id: 't-fine', name: 'Fine', success: true, breakTools: false, dc: 0 }, // threshold 15
  { id: 't-myth', name: 'Mythic', success: true, breakTools: false, dc: 5 }, // threshold 20
  { id: 't-botch', name: 'Botch', success: false, breakTools: true, dc: -10 }, // threshold 5
];

// ── Non-interactive evaluate (defect 3) ──────────────────────────────────────

test('routed: the roll evaluates with { allowInteractive: false } (no fulfilment dialog)', async () => {
  const { engine } = makeRoutedEngine({
    routed: defaultRouted({ relativeOutcomes: RELATIVE_TIERS, dc: 15 }),
  });
  stubRoll(16, [{ number: 1, faces: 20, total: 16 }]);
  await runRoutedCheck(engine);
  assert.deepEqual(evaluateArgs.at(-1), { allowInteractive: false });
});

// ── Relative tiers: threshold mapping ────────────────────────────────────────

test('relative: a roll meeting the lower threshold maps to that tier', async () => {
  const { engine } = makeRoutedEngine({
    routed: defaultRouted({ relativeOutcomes: RELATIVE_TIERS, dc: 15 }),
  });
  stubRoll(16, [{ number: 1, faces: 20, total: 16 }]);
  const r = await runRoutedCheck(engine);
  assert.equal(r.outcome, 'Fine', '16 >= 15 (Fine) but < 20 (Mythic)');
  assert.equal(r.success, true);
  assert.equal(r.value, 16);
  assert.equal(r.data.dc, 15, 'base DC resolved');
});

test('relative: a roll meeting the higher threshold maps to the best tier', async () => {
  const { engine } = makeRoutedEngine({
    routed: defaultRouted({ relativeOutcomes: RELATIVE_TIERS, dc: 15 }),
  });
  stubRoll(20, [{ number: 1, faces: 20, total: 20 }]);
  const r = await runRoutedCheck(engine);
  assert.equal(r.outcome, 'Mythic', '20 >= 20 picks the highest matching tier');
  assert.equal(r.success, true);
});

test('relative exceed: equal to the threshold does NOT match it', async () => {
  const { engine } = makeRoutedEngine({
    routed: defaultRouted({ relativeOutcomes: RELATIVE_TIERS, dc: 15, thresholdMode: 'exceed' }),
  });
  // 20 > 15 (Fine) but NOT > 20 (Mythic): exceed drops the equal-threshold tier.
  stubRoll(20, [{ number: 1, faces: 20, total: 20 }]);
  const r = await runRoutedCheck(engine);
  assert.equal(r.outcome, 'Fine');
  assert.equal(r.data.comparison, 'exceed');
});

test('relative: a roll below every success threshold matches the failure tier', async () => {
  const { engine } = makeRoutedEngine({
    routed: defaultRouted({ relativeOutcomes: RELATIVE_TIERS, dc: 15 }),
  });
  // 6 >= 5 (Botch threshold) but < 15: only the failure tier matches.
  stubRoll(6, [{ number: 1, faces: 20, total: 6 }]);
  const r = await runRoutedCheck(engine);
  assert.equal(r.outcome, 'Botch');
  assert.equal(r.success, false, 'the failure tier does not succeed');
});

// ── Fixed tiers ──────────────────────────────────────────────────────────────

test('fixed: a total inside a tier range maps to that tier', async () => {
  const { engine } = makeRoutedEngine({
    routed: defaultRouted({
      type: 'fixed',
      fixedOutcomes: [
        { id: 'f-lo', name: 'Low', success: true, breakTools: false, start: 1, end: 10 },
        { id: 'f-hi', name: 'High', success: true, breakTools: false, start: 11, end: 20 },
      ],
    }),
  });
  stubRoll(14, [{ number: 1, faces: 20, total: 14 }]);
  const r = await runRoutedCheck(engine);
  assert.equal(r.outcome, 'High', '14 is in [11, 20]');
  assert.equal(r.success, true);
});

test('fixed: a total in no range yields a null outcome and failure', async () => {
  const { engine } = makeRoutedEngine({
    routed: defaultRouted({
      type: 'fixed',
      fixedOutcomes: [{ id: 'f-lo', name: 'Low', success: true, start: 1, end: 5 }],
    }),
  });
  stubRoll(12, [{ number: 1, faces: 20, total: 12 }]);
  const r = await runRoutedCheck(engine);
  assert.equal(r.outcome, null, '12 is outside [1, 5]');
  assert.equal(r.success, false);
});

// ── breakTools tier ──────────────────────────────────────────────────────────

test('a matched breakTools tier surfaces data.breakTools', async () => {
  const { engine } = makeRoutedEngine({
    routed: defaultRouted({
      relativeOutcomes: [
        { id: 't-dang', name: 'Dangerous', success: true, breakTools: true, dc: 0 },
      ],
      dc: 15,
    }),
  });
  stubRoll(17, [{ number: 1, faces: 20, total: 17 }]);
  const r = await runRoutedCheck(engine);
  assert.equal(r.outcome, 'Dangerous');
  assert.equal(r.data.breakTools, true, 'the matched tier carries breakTools');
});

test('a breakTools crit reroutes the disposition and forces breakTools', async () => {
  const { engine } = makeRoutedEngine({
    routed: defaultRouted({
      relativeOutcomes: RELATIVE_TIERS,
      dc: 15,
      diceCrits: [{ id: 'c-fail', die: '1d20', raw: 1, success: false, breakTools: true }],
    }),
  });
  // High roll would map to Mythic, but a natural-1 crit forces failure → worst
  // failing tier (Botch), and the crit's breakTools wins.
  stubRoll(20, [{ number: 1, faces: 20, total: 1 }]);
  const r = await runRoutedCheck(engine);
  assert.equal(r.success, false, 'the forced-failure crit overrides the threshold');
  assert.equal(r.outcome, 'Botch', 'reroutes to the worst failing tier');
  assert.equal(r.data.breakTools, true);
});

// ── Base-DC resolution (mirrors the simple check, NOT the flat routed.dc) ──────

test('recipe tier overrides the base DC and shifts every relative threshold', async () => {
  const { engine } = makeRoutedEngine({
    routed: defaultRouted({
      relativeOutcomes: [{ id: 't-fine', name: 'Fine', success: true, dc: 0 }],
      dc: 10, // flat config DC — must be IGNORED in favour of the recipe tier
      tiers: [{ id: 'tier-hard', name: 'Hard', dc: 18 }],
    }),
  });
  stubRoll(17, [{ number: 1, faces: 20, total: 17 }]);
  const r = await runRoutedCheck(engine, { craftingSystemId: 'sys-1', checkTierId: 'tier-hard' });
  assert.equal(r.data.dc, 18, 'resolves the recipe tier DC, not the flat routed.dc');
  assert.equal(r.outcome, null, '17 < 18 (Fine threshold shifted by the tier), no match');
  assert.equal(r.success, false);
});

test('dynamic DC macro return drives the base DC for routed thresholds', async () => {
  const { engine } = makeRoutedEngine({
    routed: defaultRouted({
      relativeOutcomes: [{ id: 't-fine', name: 'Fine', success: true, dc: 0 }],
      dc: 99,
      dcMode: 'dynamic',
      macroUuid: 'Macro.dc',
    }),
  });
  stubRoll(14, [{ number: 1, faces: 20, total: 14 }]);
  const orig = MacroExecutor.run;
  MacroExecutor.run = async () => 12;
  try {
    const r = await runRoutedCheck(engine, { craftingSystemId: 'sys-1' }, { id: 'set-1' });
    assert.equal(r.data.dc, 12, 'uses the dynamic macro DC, not the flat routed.dc');
    assert.equal(r.outcome, 'Fine', '14 >= 12 (shifted Fine threshold)');
  } finally {
    MacroExecutor.run = orig;
  }
});

test('an unknown recipe tier falls back to the flat routed DC', async () => {
  const { engine } = makeRoutedEngine({
    routed: defaultRouted({
      relativeOutcomes: [{ id: 't-fine', name: 'Fine', success: true, dc: 0 }],
      dc: 15,
    }),
  });
  stubRoll(16, [{ number: 1, faces: 20, total: 16 }]);
  const r = await runRoutedCheck(engine, { craftingSystemId: 'sys-1', checkTierId: 'gone' });
  assert.equal(r.data.dc, 15);
  assert.equal(r.outcome, 'Fine');
});

// ── No-formula fallback (legacy macro path unchanged) ─────────────────────────

test('no routed rollFormula falls back to the legacy macro path', async () => {
  const { engine } = makeRoutedEngine({
    routed: defaultRouted({ rollFormula: '' }),
    craftingCheck: { checkSource: 'macro', macroUuid: 'Macro.legacy', outcomes: ['Fine'] },
  });
  const orig = MacroExecutor.run;
  let called = false;
  MacroExecutor.run = async () => {
    called = true;
    return { outcome: 'Fine', value: 7 };
  };
  try {
    const r = await runRoutedCheck(engine);
    assert.equal(called, true, 'the macro ran, not the routed formula check');
    assert.equal(r.outcome, 'Fine');
    assert.equal(r.value, 7);
  } finally {
    MacroExecutor.run = orig;
  }
});

// ── engineEvaluated marker + breakTools gating ────────────────────────────────

test('an engine-evaluated routed check is tagged engineEvaluated', async () => {
  const { engine } = makeRoutedEngine({
    routed: defaultRouted({ relativeOutcomes: RELATIVE_TIERS, dc: 15 }),
  });
  stubRoll(16, [{ number: 1, faces: 20, total: 16 }]);
  const r = await runRoutedCheck(engine);
  assert.equal(r.engineEvaluated, true);
  assert.equal(engine._checkForcesToolBreak(r), false, 'no breakTools tier → no forced break');
});

test('_checkForcesToolBreak: a macro data.breakTools does NOT force breakage', async () => {
  const { engine } = makeRoutedEngine({
    routed: defaultRouted({ rollFormula: '' }),
    craftingCheck: { checkSource: 'macro', macroUuid: 'Macro.legacy', outcomes: ['Fine'] },
  });
  const orig = MacroExecutor.run;
  MacroExecutor.run = async () => ({ outcome: 'Fine', value: 7, data: { breakTools: true } });
  try {
    const r = await runRoutedCheck(engine);
    assert.equal(r.data.breakTools, true, 'the macro passthrough is preserved on data');
    assert.notEqual(r.engineEvaluated, true, 'a macro result is not engine-evaluated');
    assert.equal(
      engine._checkForcesToolBreak(r),
      false,
      'a macro data.breakTools must not force tool breakage'
    );
  } finally {
    MacroExecutor.run = orig;
  }
});

test('_checkForcesToolBreak: an engine routed breakTools tier DOES force breakage', async () => {
  const { engine } = makeRoutedEngine({
    routed: defaultRouted({
      relativeOutcomes: [{ id: 't-dang', name: 'Dangerous', success: true, breakTools: true, dc: 0 }],
      dc: 15,
    }),
  });
  stubRoll(17, [{ number: 1, faces: 20, total: 17 }]);
  const r = await runRoutedCheck(engine);
  assert.equal(engine._checkForcesToolBreak(r), true);
});

// ── Headless ──────────────────────────────────────────────────────────────────

test('no Roll engine does not block the craft and fabricates no route', async () => {
  const { engine } = makeRoutedEngine({
    routed: defaultRouted({ relativeOutcomes: RELATIVE_TIERS, dc: 15 }),
  });
  clearRollEngine();
  const r = await runRoutedCheck(engine);
  assert.equal(r.success, true);
  assert.equal(r.outcome, null);
  assert.equal(r.value, null);
});
