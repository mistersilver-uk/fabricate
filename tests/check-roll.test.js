// Unit tests for the shared check-roll helpers (src/systems/checkRoll.js),
// extracted from the crafting engine and reused by the salvage (and later
// gathering) check runners.
import test from 'node:test';
import assert from 'node:assert/strict';

const {
  rolledDiceGroups,
  resolveCheckCrit,
  evaluateCheckRoll,
  runFormulaPassFail,
  runFormulaProgressive,
  runFormulaRouted,
} = await import('../src/systems/checkRoll.js');

// Mixed-activity results for the non-finite-total fallback (defect 2): a kept
// (active:true), a dropped (active:false), and a kept-without-the-flag result —
// Foundry omits `active` on a result it keeps. Active-only sum is 3 + 6 = 9.
const MIXED_ACTIVE_RESULTS = Object.freeze([
  Object.freeze({ result: 3, active: true }),
  Object.freeze({ result: 5, active: false }),
  Object.freeze({ result: 6 }),
]);

// Captures the first argument every `evaluate()` call receives, so the
// non-interactive option (defect 3) can be asserted. Reset per test via
// `evaluateArgs.length = 0`.
const evaluateArgs = [];
function stubRoll(total, dice = []) {
  evaluateArgs.length = 0;
  globalThis.Roll = class {
    async evaluate(options) {
      evaluateArgs.push(options);
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
const ACTOR = { getRollData: () => ({}) };

// ── rolledDiceGroups ────────────────────────────────────────────────────────

test('rolledDiceGroups summarises dice as { groupId, group, sum, results } using the die-term total', () => {
  const groups = rolledDiceGroups({
    dice: [
      { number: 2, faces: 6, total: 9, results: [{ result: 4 }, { result: 5 }] },
      { number: 1, faces: 20, total: 18, results: [{ result: 18 }] },
    ],
  });
  assert.deepEqual(groups, [
    { groupId: 0, group: '2d6', sum: 9, results: [4, 5] },
    { groupId: 1, group: '1d20', sum: 18, results: [18] },
  ]);
});

test('rolledDiceGroups assigns groupId by evaluated-term order, disambiguating duplicate NdS', () => {
  // 1d20 + 1d20 → two distinct groups keyed by index, not by the NdS label.
  const groups = rolledDiceGroups({
    dice: [
      { number: 1, faces: 20, total: 3, results: [{ result: 3 }] },
      { number: 1, faces: 20, total: 17, results: [{ result: 17 }] },
    ],
  });
  assert.equal(groups[0].groupId, 0);
  assert.equal(groups[1].groupId, 1);
  assert.equal(groups[0].group, '1d20');
  assert.equal(groups[1].group, '1d20');
});

test('rolledDiceGroups results are active-only raw faces (drops dropped dice)', () => {
  // 2d20kh1: the dropped (active:false) die is excluded from results; sum keeps the
  // post-modifier die-term total.
  const groups = rolledDiceGroups({
    dice: [
      {
        number: 2,
        faces: 20,
        total: 18,
        results: [
          { result: 18, active: true },
          { result: 3, active: false },
        ],
      },
    ],
  });
  assert.deepEqual(groups[0].results, [18], 'dropped die excluded from raw faces');
  assert.equal(groups[0].sum, 18, 'sum is the post-modifier die-term total');
});

test('rolledDiceGroups falls back to summing per-die results when total is absent', () => {
  const groups = rolledDiceGroups({ dice: [{ number: 2, faces: 6, results: [{ result: 3 }, { result: 4 }] }] });
  assert.deepEqual(groups, [{ groupId: 0, group: '2d6', sum: 7, results: [3, 4] }]);
});

test('rolledDiceGroups fallback sums only active results: false excluded, absent included', () => {
  const groups = rolledDiceGroups({
    dice: [{ number: 3, faces: 6, results: MIXED_ACTIVE_RESULTS }],
  });
  // 3 (active:true) + 6 (active absent) — 5 (active:false) is dropped. The entry
  // carries the #419 groupId + active-only raw faces alongside the #443 fallback sum.
  assert.deepEqual(groups, [{ groupId: 0, group: '3d6', sum: 9, results: [3, 6] }]);
});

// ── evaluateCheckRoll: non-interactive option (defect 3) ────────────────────

test('evaluateCheckRoll evaluates with { allowInteractive: false } (no fulfilment dialog)', async () => {
  stubRoll(12, [{ number: 1, faces: 20, total: 12 }]);
  await evaluateCheckRoll('1d20', ACTOR);
  assert.equal(evaluateArgs.length, 1);
  assert.deepEqual(evaluateArgs[0], { allowInteractive: false });
});

test('runFormula* paths evaluate with { allowInteractive: false }', async () => {
  stubRoll(15, [{ number: 1, faces: 20, total: 15 }]);
  await runFormulaPassFail({ formula: '1d20', dc: 10, thresholdMode: 'meet', actor: ACTOR });
  assert.deepEqual(evaluateArgs.at(-1), { allowInteractive: false });

  stubRoll(8, [{ number: 2, faces: 6, total: 8 }]);
  await runFormulaProgressive({ formula: '2d6', actor: ACTOR });
  assert.deepEqual(evaluateArgs.at(-1), { allowInteractive: false });

  stubRoll(16, [{ number: 1, faces: 20, total: 16 }]);
  await runFormulaRouted({
    formula: '1d20',
    dc: 15,
    thresholdMode: 'meet',
    type: 'relative',
    relativeOutcomes: RELATIVE,
    actor: ACTOR,
  });
  assert.deepEqual(evaluateArgs.at(-1), { allowInteractive: false });
});

// ── resolveCheckCrit ────────────────────────────────────────────────────────

test('resolveCheckCrit returns the matched crit; forced failure beats forced success', () => {
  const groups = [
    { group: '1d20', sum: 20 },
    { group: '1d6', sum: 1 },
  ];
  const crit = resolveCheckCrit(
    [
      { die: '1d20', raw: 20, success: true },
      { die: '1d6', raw: 1, success: false, breakTools: true },
    ],
    groups
  );
  assert.deepEqual(crit, { success: false, breakTools: true });
});

test('resolveCheckCrit returns null when no crit matches', () => {
  assert.equal(resolveCheckCrit([{ die: '1d20', raw: 20, success: true }], [{ group: '1d20', sum: 5 }]), null);
});

// ── runFormulaPassFail ──────────────────────────────────────────────────────

test('runFormulaPassFail: meet comparison passes at/above the DC', async () => {
  stubRoll(15, [{ number: 1, faces: 20, total: 15 }]);
  const r = await runFormulaPassFail({ formula: '1d20', dc: 15, thresholdMode: 'meet', actor: ACTOR });
  assert.equal(r.success, true);
  assert.equal(r.outcome, 'pass');
  assert.equal(r.value, 15);
  assert.equal(r.data.comparison, 'meet');
});

test('runFormulaPassFail: a crit forces the outcome and surfaces breakTools; label drives the message', async () => {
  stubRoll(2, [{ number: 1, faces: 20, total: 1 }]);
  const r = await runFormulaPassFail({
    formula: '1d20',
    dc: 1,
    thresholdMode: 'meet',
    diceCrits: [{ die: '1d20', raw: 1, success: false, breakTools: true }],
    actor: ACTOR,
    label: 'Salvage',
  });
  assert.equal(r.success, false);
  assert.equal(r.data.breakTools, true);
  assert.equal(r.message, 'Salvage check failed');
});

test('runFormulaPassFail: a throwing roll fails with a labelled message', async () => {
  stubThrowingRoll();
  const r = await runFormulaPassFail({ formula: '1d20', dc: 10, actor: ACTOR, label: 'Crafting' });
  assert.equal(r.success, false);
  assert.match(r.message, /Crafting check roll failed/);
});

test('runFormulaPassFail: no dice engine does not block (pass, value null)', async () => {
  delete globalThis.Roll;
  const r = await runFormulaPassFail({ formula: '1d20', dc: 10, actor: ACTOR });
  assert.equal(r.success, true);
  assert.equal(r.value, null);
});

// ── runFormulaProgressive ───────────────────────────────────────────────────

test('runFormulaProgressive: the total is the value; success/failure crits force all/none', async () => {
  stubRoll(8, [{ number: 2, faces: 6, total: 8 }]);
  assert.equal((await runFormulaProgressive({ formula: '2d6', actor: ACTOR })).value, 8);

  stubRoll(3, [{ number: 2, faces: 6, total: 12 }]);
  assert.equal(
    (await runFormulaProgressive({ formula: '2d6', diceCrits: [{ die: '2d6', raw: 12, success: true }], actor: ACTOR }))
      .value,
    Number.MAX_SAFE_INTEGER
  );

  stubRoll(9, [{ number: 2, faces: 6, total: 2 }]);
  assert.equal(
    (await runFormulaProgressive({ formula: '2d6', diceCrits: [{ die: '2d6', raw: 2, success: false }], actor: ACTOR }))
      .value,
    0
  );
});

test('runFormulaProgressive: no dice engine awards nothing (value 0) without blocking', async () => {
  delete globalThis.Roll;
  const r = await runFormulaProgressive({ formula: '2d6', actor: ACTOR });
  assert.equal(r.success, true);
  assert.equal(r.value, 0);
});

// ── runFormulaRouted ────────────────────────────────────────────────────────

// Relative tiers carry a DC delta; the effective threshold is base dc + outcome.dc.
const RELATIVE = [
  { id: 'crit', name: 'Critical Success', success: true, breakTools: false, dc: 10 },
  { id: 'good', name: 'Success', success: true, breakTools: false, dc: 0 },
  { id: 'bad', name: 'Failure', success: false, breakTools: false, dc: -5 },
];
const FIXED = [
  { id: 'low', name: 'Fumble', success: false, breakTools: true, start: 1, end: 5 },
  { id: 'mid', name: 'Partial', success: true, breakTools: false, start: 6, end: 14 },
  { id: 'high', name: 'Clean', success: true, breakTools: false, start: 15, end: 20 },
];

test('runFormulaRouted relative: meet picks the highest matching effective threshold', async () => {
  // base dc 15: thresholds are 25 (crit), 15 (good), 10 (bad). total 16 → 15 & 10 match.
  stubRoll(16, [{ number: 1, faces: 20, total: 16 }]);
  const r = await runFormulaRouted({
    formula: '1d20',
    dc: 15,
    thresholdMode: 'meet',
    type: 'relative',
    relativeOutcomes: RELATIVE,
    actor: ACTOR,
  });
  assert.equal(r.outcome, 'Success');
  assert.equal(r.success, true);
  assert.equal(r.value, 16);
  assert.equal(r.data.outcomeId, 'good');
});

test('runFormulaRouted relative: exceed needs strictly greater than the threshold', async () => {
  // total 15, threshold for "good" is exactly 15. exceed → does not match good; only "bad" (10).
  stubRoll(15, [{ number: 1, faces: 20, total: 15 }]);
  const r = await runFormulaRouted({
    formula: '1d20',
    dc: 15,
    thresholdMode: 'exceed',
    type: 'relative',
    relativeOutcomes: RELATIVE,
    actor: ACTOR,
  });
  assert.equal(r.outcome, 'Failure');
  assert.equal(r.success, false);
  assert.equal(r.data.comparison, 'exceed');
});

test('runFormulaRouted fixed: the total lands inside its [start, end] range', async () => {
  stubRoll(8, [{ number: 1, faces: 20, total: 8 }]);
  const r = await runFormulaRouted({
    formula: '1d20',
    dc: 0,
    type: 'fixed',
    fixedOutcomes: FIXED,
    actor: ACTOR,
  });
  assert.equal(r.outcome, 'Partial');
  assert.equal(r.success, true);
  assert.equal(r.data.outcomeId, 'mid');
});

test('runFormulaRouted: no tier matches → outcome null, success false', async () => {
  // base dc 15: lowest threshold is "bad" at 10. total 4 matches nothing.
  stubRoll(4, [{ number: 1, faces: 20, total: 4 }]);
  const r = await runFormulaRouted({
    formula: '1d20',
    dc: 15,
    thresholdMode: 'meet',
    type: 'relative',
    relativeOutcomes: RELATIVE,
    actor: ACTOR,
  });
  assert.equal(r.outcome, null);
  assert.equal(r.success, false);
  assert.equal(r.value, 4);
});

test('runFormulaRouted: a success crit forces the highest succeeding tier', async () => {
  // total 4 would match nothing, but the success crit reroutes to the best success tier.
  stubRoll(4, [{ number: 1, faces: 20, total: 20 }]);
  const r = await runFormulaRouted({
    formula: '1d20',
    dc: 15,
    thresholdMode: 'meet',
    type: 'relative',
    relativeOutcomes: RELATIVE,
    diceCrits: [{ die: '1d20', raw: 20, success: true }],
    actor: ACTOR,
  });
  assert.equal(r.outcome, 'Critical Success');
  assert.equal(r.success, true);
});

test('runFormulaRouted: a failure crit forces the lowest failing tier', async () => {
  // total 20 would match a success tier, but the failure crit reroutes to the worst failing tier.
  stubRoll(20, [{ number: 1, faces: 20, total: 1 }]);
  const r = await runFormulaRouted({
    formula: '1d20',
    dc: 15,
    thresholdMode: 'meet',
    type: 'relative',
    relativeOutcomes: RELATIVE,
    diceCrits: [{ die: '1d20', raw: 1, success: false }],
    actor: ACTOR,
  });
  assert.equal(r.outcome, 'Failure');
  assert.equal(r.success, false);
});

test('runFormulaRouted: a forced disposition with no matching tier leaves outcome null', async () => {
  // Only a single success tier exists; a failure crit has nowhere to route.
  stubRoll(12, [{ number: 1, faces: 20, total: 1 }]);
  const r = await runFormulaRouted({
    formula: '1d20',
    dc: 15,
    type: 'relative',
    relativeOutcomes: [{ id: 'only', name: 'Win', success: true, dc: 0 }],
    diceCrits: [{ die: '1d20', raw: 1, success: false }],
    actor: ACTOR,
  });
  assert.equal(r.outcome, null);
  assert.equal(r.success, false);
});

test('runFormulaRouted: a matched tier surfaces its breakTools; a crit breakTools takes precedence', async () => {
  // Fixed "Fumble" range matches and carries breakTools: true.
  stubRoll(3, [{ number: 1, faces: 20, total: 3 }]);
  const tier = await runFormulaRouted({
    formula: '1d20',
    dc: 0,
    type: 'fixed',
    fixedOutcomes: FIXED,
    actor: ACTOR,
  });
  assert.equal(tier.outcome, 'Fumble');
  assert.equal(tier.data.breakTools, true);

  // A crit with breakTools reroutes and surfaces its own breakTools.
  stubRoll(8, [{ number: 1, faces: 20, total: 1 }]);
  const crit = await runFormulaRouted({
    formula: '1d20',
    dc: 0,
    type: 'fixed',
    fixedOutcomes: FIXED,
    diceCrits: [{ die: '1d20', raw: 1, success: false, breakTools: true }],
    actor: ACTOR,
  });
  assert.equal(crit.outcome, 'Fumble');
  assert.equal(crit.data.breakTools, true);
  assert.deepEqual(crit.data.crit, { success: false, breakTools: true });
});

test('runFormulaRouted: no dice engine does not block and does not fabricate a route', async () => {
  delete globalThis.Roll;
  const r = await runFormulaRouted({
    formula: '1d20',
    dc: 15,
    type: 'relative',
    relativeOutcomes: RELATIVE,
    actor: ACTOR,
  });
  assert.equal(r.success, true);
  assert.equal(r.outcome, null);
  assert.equal(r.value, null);
});

test('runFormulaRouted: a throwing roll fails with a labelled message', async () => {
  stubThrowingRoll();
  const r = await runFormulaRouted({
    formula: '1d20',
    dc: 15,
    type: 'relative',
    relativeOutcomes: RELATIVE,
    actor: ACTOR,
    label: 'Salvage',
  });
  assert.equal(r.success, false);
  assert.equal(r.outcome, null);
  assert.match(r.message, /Salvage check roll failed/);
});
