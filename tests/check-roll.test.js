// Unit tests for the shared check-roll helpers (src/systems/checkRoll.js),
// extracted from the crafting engine and reused by the salvage (and later
// gathering) check runners.
import test from 'node:test';
import assert from 'node:assert/strict';

const { rolledDiceGroups, resolveCheckCrit, runFormulaPassFail, runFormulaProgressive } =
  await import('../src/systems/checkRoll.js');

function stubRoll(total, dice = []) {
  globalThis.Roll = class {
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
const ACTOR = { getRollData: () => ({}) };

// ── rolledDiceGroups ────────────────────────────────────────────────────────

test('rolledDiceGroups summarises dice as { group, sum } using the die-term total', () => {
  const groups = rolledDiceGroups({
    dice: [
      { number: 2, faces: 6, total: 9 },
      { number: 1, faces: 20, total: 18 },
    ],
  });
  assert.deepEqual(groups, [
    { group: '2d6', sum: 9 },
    { group: '1d20', sum: 18 },
  ]);
});

test('rolledDiceGroups falls back to summing per-die results when total is absent', () => {
  const groups = rolledDiceGroups({ dice: [{ number: 2, faces: 6, results: [{ result: 3 }, { result: 4 }] }] });
  assert.deepEqual(groups, [{ group: '2d6', sum: 7 }]);
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
