// Engine tests for the formula-based salvage check (CraftingEngine
// ._runSalvageCraftingCheck dispatch): salvage simple (DC + per-component override
// + crits) and salvage progressive (value + award-all/none crits), plus the
// no-formula behaviour (optional no-op success, or a loud required-check failure).
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.foundry = globalThis.foundry || {
  utils: { randomID: () => Math.random().toString(36).slice(2) },
};
globalThis.ui = globalThis.ui || { notifications: { warn: () => {}, error: () => {} } };

const { CraftingEngine } = await import('../src/systems/CraftingEngine.js');
const { salvageForChatCard } = await import('./helpers/routedCheckEngine.js');

function makeEngine() {
  return new CraftingEngine({}, null, {});
}

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

const ACTOR = { id: 'a1', name: 'Salvager', items: [] };
const sys = (salvageCraftingCheck, salvageResolutionMode) => ({
  salvageResolutionMode,
  salvageCraftingCheck,
});

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
const run = (engine, system, component = {}) =>
  engine._runSalvageCraftingCheck(component, system, ACTOR, []);

// ── Salvage simple ──────────────────────────────────────────────────────────

test('salvage simple: roll at/above the DC passes', async () => {
  const engine = makeEngine();
  stubRoll(16, [{ number: 1, faces: 20, total: 16 }]);
  const r = await run(engine, sys({ simple: { rollFormula: '1d20', dc: 15, thresholdMode: 'meet' } }, 'simple'));
  assert.equal(r.success, true);
  assert.equal(r.outcome, 'pass');
  assert.equal(r.value, 16);
  assert.equal(r.data.dc, 15);
});

test('salvage simple: a per-component dcOverride replaces the default DC', async () => {
  const engine = makeEngine();
  stubRoll(16, [{ number: 1, faces: 20, total: 16 }]);
  const r = await run(
    engine,
    sys({ simple: { rollFormula: '1d20', dc: 10, thresholdMode: 'meet' } }, 'simple'),
    { salvage: { dcOverride: 20 } }
  );
  assert.equal(r.data.dc, 20, 'uses the component override, not the default');
  assert.equal(r.success, false, '16 < 20');
});

test('salvage simple: a forced-success trigger passes below the DC', async () => {
  const engine = makeEngine();
  stubRoll(3, [{ number: 1, faces: 20, total: 20 }]);
  const r = await run(
    engine,
    sys(
      {
        simple: {
          rollFormula: '1d20',
          dc: 15,
          checkBreakage: { triggers: [totalTrigger({ groupId: 0, value: 20, outcome: 'success' })] },
        },
      },
      'simple'
    )
  );
  assert.equal(r.success, true);
});

// ── Salvage progressive ─────────────────────────────────────────────────────

test('salvage progressive: the roll total is the numeric value', async () => {
  const engine = makeEngine();
  stubRoll(8, [{ number: 2, faces: 6, total: 8 }]);
  const r = await run(engine, sys({ progressive: { rollFormula: '2d6', awardMode: 'equal' } }, 'progressive'));
  assert.equal(r.success, true);
  assert.equal(r.value, 8);
});

test('salvage progressive: a success trigger awards all (MAX_SAFE_INTEGER), a failure trigger awards none', async () => {
  const engine = makeEngine();
  stubRoll(7, [{ number: 2, faces: 6, total: 12 }]);
  const all = await run(
    engine,
    sys({ progressive: { rollFormula: '2d6', checkBreakage: { triggers: [totalTrigger({ groupId: 0, value: 12, outcome: 'success' })] } } }, 'progressive')
  );
  assert.equal(all.value, Number.MAX_SAFE_INTEGER);

  stubRoll(11, [{ number: 2, faces: 6, total: 2 }]);
  const none = await run(
    engine,
    sys({ progressive: { rollFormula: '2d6', checkBreakage: { triggers: [totalTrigger({ groupId: 0, value: 2, outcome: 'failure' })] } } }, 'progressive')
  );
  assert.equal(none.value, 0);
});

// ── No-formula behaviour ─────────────────────────────────────────────────────

test('simple salvage with no formula is a no-op success (no legacy macro path)', async () => {
  const engine = makeEngine();
  const r = await run(engine, sys({ enabled: true, simple: { rollFormula: '' } }, 'simple'));
  assert.equal(r.success, true, 'an optional simple salvage check with no formula does not run');
  assert.equal(r.outcome, null);
});

test('salvage simple: a throwing roll fails the check with a message', async () => {
  const engine = makeEngine();
  stubThrowingRoll();
  const r = await run(engine, sys({ simple: { rollFormula: '1d20', dc: 15 } }, 'simple'));
  assert.equal(r.success, false);
  assert.match(r.message, /roll failed/i);
});

test('salvage progressive: no Roll engine awards nothing without blocking', async () => {
  const engine = makeEngine();
  delete globalThis.Roll;
  const r = await run(engine, sys({ progressive: { rollFormula: '2d6' } }, 'progressive'));
  assert.equal(r.success, true);
  assert.equal(r.value, 0);
});

// ── Salvage routed ──────────────────────────────────────────────────────────

const ROUTED_RELATIVE = [
  { id: 'crit', name: 'Critical', success: true, breakTools: false, dc: 10 },
  { id: 'ok', name: 'Success', success: true, breakTools: false, dc: 0 },
  { id: 'miss', name: 'Failure', success: false, breakTools: false, dc: -5 },
];

test('salvage routed: a formula whose total matches a tier surfaces that tier name as the outcome', async () => {
  const engine = makeEngine();
  // base dc 15: thresholds 25/15/10. total 16 → highest match is "Success" (15).
  stubRoll(16, [{ number: 1, faces: 20, total: 16 }]);
  const r = await run(
    engine,
    sys(
      {
        routed: {
          type: 'relative',
          rollFormula: '1d20',
          dc: 15,
          thresholdMode: 'meet',
          relativeOutcomes: ROUTED_RELATIVE,
        },
      },
      'routed'
    )
  );
  assert.equal(r.outcome, 'Success');
  assert.equal(r.success, true);
  assert.equal(r.value, 16);
});

test('salvage routed: the matched outcome name routes to a result group via outcomeRouting', async () => {
  const engine = makeEngine();
  const component = {
    salvage: {
      resultGroups: [
        { id: 'g-crit', results: [] },
        { id: 'g-success', results: [] },
      ],
      outcomeRouting: { Critical: 'g-crit', Success: 'g-success' },
    },
  };
  const checkResult = { outcome: 'Success', value: 16 };
  const groups = engine._resolveSalvageResultGroups(
    component,
    { salvageResolutionMode: 'routed' },
    checkResult
  );
  assert.equal(groups.length, 1);
  assert.equal(groups[0].id, 'g-success', 'routed outcome name maps to its result group');
});

test('salvage routed: an outcome with no outcomeRouting entry yields no result groups', async () => {
  const engine = makeEngine();
  const component = {
    salvage: {
      resultGroups: [{ id: 'g-crit', results: [] }],
      outcomeRouting: { Critical: 'g-crit' }, // "Success" is intentionally unrouted
    },
  };
  const groups = engine._resolveSalvageResultGroups(
    component,
    { salvageResolutionMode: 'routed' },
    { outcome: 'Success', value: 16 }
  );
  assert.deepEqual(groups, [], 'an unrouted outcome degrades to nothing, not a crash');
});

test('salvage routed: a per-component dcOverride shifts the relative thresholds', async () => {
  const engine = makeEngine();
  // total 16: with the default dc 15, "Success" (threshold 15) matches; with the
  // override dc 20 the only matching tier becomes "Failure" (threshold 15 = 20-5).
  stubRoll(16, [{ number: 1, faces: 20, total: 16 }]);
  const r = await run(
    engine,
    sys(
      {
        routed: {
          type: 'relative',
          rollFormula: '1d20',
          dc: 15,
          thresholdMode: 'meet',
          relativeOutcomes: ROUTED_RELATIVE,
        },
      },
      'routed'
    ),
    { salvage: { dcOverride: 20 } }
  );
  assert.equal(r.data.dc, 20);
  assert.equal(r.outcome, 'Failure', '20 - 5 = 15 is the only tier 16 still meets');
  assert.equal(r.success, false);
});

test('salvage routed: a below-lowest total clamps to the closest tier', async () => {
  const engine = makeEngine();
  // base dc 15: lowest threshold is "Failure" at 10. total 4 meets nothing, so the
  // salvage engine's clampToNearest routes to that closest tier instead of null.
  stubRoll(4, [{ number: 1, faces: 20, total: 4 }]);
  const r = await run(
    engine,
    sys(
      {
        routed: {
          type: 'relative',
          rollFormula: '1d20',
          dc: 15,
          thresholdMode: 'meet',
          relativeOutcomes: ROUTED_RELATIVE,
        },
      },
      'routed'
    )
  );
  assert.equal(r.outcome, 'Failure', 'clamps to the lowest-threshold tier');
  assert.equal(r.success, false, "the clamped tier's own success flag stands");
  assert.equal(r.value, 4);
});

test('salvage routed WITHOUT a formula fails loudly (no legacy macro path)', async () => {
  const engine = makeEngine();
  const r = await run(
    engine,
    sys({ enabled: true, routed: { type: 'relative', rollFormula: '', dc: 12 } }, 'routed')
  );
  assert.equal(r.success, false, 'routed salvage with no formula fails');
  assert.equal(r.outcome, null);
  assert.equal(r.misconfigured, true, 'the loud failure is flagged as a misconfiguration');
  assert.match(r.message, /requires a configured salvage check roll formula/);
});

test('salvage progressive WITHOUT a formula fails loudly (no legacy macro path)', async () => {
  const engine = makeEngine();
  const r = await run(
    engine,
    sys({ enabled: true, progressive: { rollFormula: '' } }, 'progressive')
  );
  assert.equal(r.success, false, 'progressive salvage with no formula fails');
  assert.equal(r.outcome, null);
  assert.equal(r.misconfigured, true, 'the loud failure is flagged as a misconfiguration');
  assert.match(r.message, /requires a configured salvage check roll formula/);
});

// ── dcOverride = 0 edge (0 is a valid, finite DC) ───────────────────────────

test('salvage simple: a dcOverride of 0 is honoured as a valid DC (not treated as unset)', async () => {
  const engine = makeEngine();
  stubRoll(0, [{ number: 1, faces: 20, total: 0 }]);
  const r = await run(
    engine,
    sys({ simple: { rollFormula: '1d20', dc: 15, thresholdMode: 'meet' } }, 'simple'),
    { salvage: { dcOverride: 0 } }
  );
  assert.equal(r.data.dc, 0, '0 override replaces the default DC');
  assert.equal(r.success, true, '0 >= 0 passes');
});

// ── engineEvaluated + checkDriven parity (issue 419) ─────────────────────────

test('salvage simple is engine-evaluated and surfaces data.diceGroups', async () => {
  const engine = makeEngine();
  stubRoll(16, [{ number: 1, faces: 20, total: 16, results: [{ result: 16, active: true }] }]);
  const r = await run(engine, sys({ simple: { rollFormula: '1d20', dc: 15, thresholdMode: 'meet' } }, 'simple'));
  assert.equal(r.engineEvaluated, true);
  assert.deepEqual(r.data.diceGroups, [{ groupId: 0, group: '1d20', sum: 16, results: [16] }]);
});

test('checkDriven salvage: the active salvage check checkBreakage decides forced breakage (parity)', async () => {
  const engine = makeEngine();
  stubRoll(1, [{ number: 1, faces: 20, total: 1, results: [{ result: 1, active: true }] }]);
  const checkBreakage = {
    triggers: [{ id: 'nat1', breakTools: true, outcome: 'none', condition: { type: 'diceGroup', groupId: 0, aggregate: 'anyDie', operator: '==', value: 1 } }],
  };
  const system = {
    salvageResolutionMode: 'simple',
    salvageCraftingCheck: { simple: { rollFormula: '1d20', dc: 1, thresholdMode: 'meet', checkBreakage } },
    toolBreakage: { authority: 'checkDriven' },
  };
  const r = await run(engine, system);
  const decision = engine._resolveSalvageBreakageDecision(system, r);
  assert.equal(decision.authority, 'checkDriven');
  assert.equal(decision.forceBreak, true);
  assert.equal(decision.triggerId, 'nat1');
});

test('toolSpecific salvage: a breakTools trigger never force-breaks (either-or authority)', async () => {
  const engine = makeEngine();
  stubRoll(3, [{ number: 1, faces: 20, total: 20, results: [{ result: 20, active: true }] }]);
  const system = {
    salvageResolutionMode: 'simple',
    salvageCraftingCheck: {
      simple: {
        rollFormula: '1d20',
        dc: 15,
        checkBreakage: { triggers: [totalTrigger({ id: 'bt', groupId: 0, value: 20, outcome: 'success', breakTools: true })] },
      },
    },
  };
  const r = await run(engine, system);
  const decision = engine._resolveSalvageBreakageDecision(system, r);
  assert.equal(decision.authority, 'toolSpecific');
  assert.equal(decision.forceBreak, false, 'a check never breaks tools under toolSpecific');
});

// ── Tier-step evidence reaches the salvage result card (issue 975) ───────────

// Base dc 15 → thresholds 25 / 15 / 10, so a total of 16 matches "Success" and one
// step lands on "Critical" (up) or "Failure" (down) — one fixture reaching both of
// `_postSalvageChatMessage`'s call sites from the same roll.
const tierStepSalvageCheck = (mode) => ({
  routed: {
    type: 'relative',
    rollFormula: '1d20',
    dc: 15,
    thresholdMode: 'meet',
    relativeOutcomes: ROUTED_RELATIVE,
    checkBreakage: {
      triggers: [
        {
          id: `step-${mode}`,
          condition: {
            type: 'diceGroup',
            groupId: 0,
            aggregate: 'total',
            operator: '==',
            value: 16,
          },
          outcome: 'none',
          breakTools: false,
          tierStep: { mode, steps: 1, tierId: null },
        },
      ],
    },
  },
});

const stubStepRoll = () =>
  stubRoll(16, [{ number: 1, faces: 20, total: 16, results: [{ result: 16, active: true }] }]);

test('salvage routed: a tier-step trigger surfaces data.tierStepApplied on the check result', async () => {
  const engine = makeEngine();
  stubStepRoll();
  const r = await run(engine, sys(tierStepSalvageCheck('down'), 'routed'));
  assert.equal(r.outcome, 'Failure', 'the step moved the matched tier down one rank');
  assert.equal(r.data.tierStepApplied.mode, 'down');
  assert.equal(r.data.tierStepApplied.steps, 1, 'the REALIZED magnitude');
});

// The two below drive the REAL `salvage()` pipeline rather than calling
// `_postSalvageChatMessage` with a hand-supplied `tierStep:`. That direct call
// exercised the card, not the JOIN: both engine call sites pass
// `tierStep: tierStepForCard(checkResult)`, and deleting either argument shipped green
// (issue 975 review). Crafting is covered end to end by `craftForChatCard`; these are
// its salvage twins, one per call site.

test('salvage routed: the FAILURE path threads the runtime tier-step evidence into the card', async () => {
  stubStepRoll();
  const { result, chatMessages } = await salvageForChatCard(tierStepSalvageCheck('down'));
  assert.equal(result.success, false, 'the step moved a success tier onto a failing one');
  assert.equal(chatMessages.length, 1, 'one salvage card posted');
  assert.ok(
    chatMessages[0].content.includes('fabricate-craft-chat__tier-step'),
    'the failure call site reached the card model'
  );
  assert.ok(chatMessages[0].content.includes('FABRICATE.Chat.TierStepDown'), 'the down key');
});

test('salvage routed: the SUCCESS path threads the runtime tier-step evidence into the card', async () => {
  stubStepRoll();
  const { result, chatMessages } = await salvageForChatCard(tierStepSalvageCheck('up'));
  assert.equal(result.success, true, 'the step moved onto a higher success tier');
  assert.equal(chatMessages.length, 1, 'one salvage card posted');
  assert.ok(
    chatMessages[0].content.includes('fabricate-craft-chat__tier-step'),
    'the success call site reached the card model'
  );
  assert.ok(chatMessages[0].content.includes('FABRICATE.Chat.TierStepUp'), 'the up key');
});

// ── The PRE-RESOLVED roll decision (issue 859) ──────────────────────────────
//
// `rollDecision` is `promptCheckRoll`'s return shape MINUS `confirmed`, so
// `evaluateCheckRoll` treats it as a pre-resolved `choice` and runs the identical
// downstream code (`@craftingmod` substitution, `applyD20Advantage`, the `Roll.validate`
// net, `effectiveRollMode`). One prompt answer therefore drives N rolls of a bulk run.
//
// It is attached by `CraftingEngine._salvageRollOptions` — NOT by
// `buildInteractiveRollOptions`, which is shared with the crafting and gathering paths
// and wires no pre-resolved-roll support at all. That one helper is a single gate serving
// all three salvage runners, so a fourth runner cannot ship without it.

/** Record the formula every `new Roll(...)` is constructed with, and its chat post. */
function stubRecordingRoll(total) {
  const seen = { formulas: [], messages: [] };
  globalThis.Roll = class {
    constructor(formula) {
      seen.formulas.push(formula);
    }
    async evaluate() {
      return {
        total,
        dice: [{ number: 1, faces: 20, total, results: [{ result: total, active: true }] }],
        toMessage: async (data, options) => {
          seen.messages.push({ data, options });
          return { id: 'msg-1' };
        },
      };
    }
  };
  globalThis.ChatMessage = { create: async () => ({ id: 'msg' }), getSpeaker: () => ({}) };
  return seen;
}

/**
 * Run one salvage check, capturing every `rollOptions` bag the runners built.
 *
 * `prompt` is replaced with a RECORDING stub rather than left as the real
 * `promptCheckRoll`, so "the prompt is not invoked" is an assertion about a call count
 * rather than about the absence of a dialog nothing would have opened headlessly anyway.
 */
async function runWithDecision(engine, system, component, options = {}) {
  const bags = [];
  const promptCalls = [];
  const build = engine._salvageRollOptions.bind(engine);
  engine._salvageRollOptions = (args) => {
    const bag = build(args);
    if (options.dropPrompt === true) delete bag.prompt;
    else {
      bag.prompt = async (promptArgs) => {
        promptCalls.push(promptArgs);
        return { confirmed: true, bonus: null, rollMode: undefined, advantage: 'normal' };
      };
    }
    bags.push(bag);
    return bag;
  };
  const result = await engine._runSalvageCraftingCheck(component, system, ACTOR, {
    interactive: options.interactive ?? true,
    toolItems: [],
    rollDecision: options.rollDecision ?? null,
  });
  return { result, bags, promptCalls };
}

const DECISION = { bonus: '3', rollMode: 'blindroll', advantage: 'advantage' };

const MODE_FIXTURES = [
  { mode: 'simple', check: { simple: { rollFormula: '1d20', dc: 5, thresholdMode: 'meet' } } },
  {
    mode: 'routed',
    check: {
      routed: {
        type: 'relative',
        rollFormula: '1d20',
        dc: 15,
        thresholdMode: 'meet',
        relativeOutcomes: ROUTED_RELATIVE,
      },
    },
  },
  { mode: 'progressive', check: { progressive: { rollFormula: '1d20', awardMode: 'equal' } } },
];

for (const fixture of MODE_FIXTURES) {
  test(`salvage ${fixture.mode}: a rollDecision reaches the roll options and no prompt opens`, async () => {
    const engine = makeEngine();
    stubRecordingRoll(16);
    const { bags, promptCalls } = await runWithDecision(
      engine,
      sys(fixture.check, fixture.mode),
      {},
      { rollDecision: DECISION }
    );

    assert.equal(bags.length, 1, `the ${fixture.mode} runner built exactly one bag`);
    assert.equal(bags[0].rollDecision, DECISION, 'the SAME object, not a clone');
    assert.deepEqual(promptCalls, [], 'no dialog is opened for a pre-resolved roll');
  });

  test(`salvage ${fixture.mode}: with NO decision the bag is byte-identical and the prompt runs`, async () => {
    // Acceptance 11 — the single-item path is unchanged. The decision is attached only
    // when truthy, so a bag built without one carries no stray key at all.
    const engine = makeEngine();
    stubRecordingRoll(16);
    const { bags, promptCalls } = await runWithDecision(
      engine,
      sys(fixture.check, fixture.mode),
      {}
    );

    assert.equal('rollDecision' in bags[0], false, 'no stray key on the single-item path');
    assert.equal(promptCalls.length, 1, 'and the player is still asked');
  });
}

test('the no-decision bag is DEEP-EQUAL to what it was before the seam existed', async () => {
  // A key-presence check alone would pass against a bag carrying `rollDecision: null`.
  // This pins the whole shape, so an added key of any spelling reds.
  const engine = makeEngine();
  stubRecordingRoll(16);
  const { bags } = await runWithDecision(
    engine,
    sys({ simple: { rollFormula: '1d20', dc: 5 } }, 'simple'),
    { name: 'Iron Ore', img: 'icons/ore.webp' },
    { dropPrompt: true }
  );

  assert.deepEqual(Object.keys(bags[0]).sort(), [
    'activity',
    'dc',
    'flavor',
    'img',
    'interactive',
    'name',
    'rollMode',
    'speaker',
  ]);
});

test('a decision applies the bonus and the advantage transform to the rolled formula', async () => {
  const engine = makeEngine();
  const seen = stubRecordingRoll(16);
  await runWithDecision(
    engine,
    sys({ simple: { rollFormula: '1d20', dc: 5 } }, 'simple'),
    {},
    {
      rollDecision: DECISION,
    }
  );

  assert.equal(
    seen.formulas.at(-1),
    '2d20kh1 + (3)',
    'advantage first, then the situational bonus on top of the pool'
  );
});

test("a decision's roll mode reaches the chat post", async () => {
  const engine = makeEngine();
  const seen = stubRecordingRoll(16);
  await runWithDecision(
    engine,
    sys({ simple: { rollFormula: '1d20', dc: 5 } }, 'simple'),
    {},
    {
      rollDecision: DECISION,
    }
  );

  assert.equal(seen.messages.at(-1)?.options?.rollMode, 'blindroll');
});

test('a decision supplied with NO prompt still applies bonus, advantage and roll mode', async () => {
  // The load-bearing half of `evaluateCheckRoll`'s predicate:
  // `interactive === true && (Boolean(preResolved) || typeof options.prompt === 'function')`.
  // Without the `Boolean(preResolved) ||` half, a decision supplied without a prompt is
  // silently discarded and the BASE formula rolls — the bulk run's bonus, advantage and
  // roll mode all vanish with no error anywhere.
  const engine = makeEngine();
  const seen = stubRecordingRoll(16);
  const { result } = await runWithDecision(
    engine,
    sys({ simple: { rollFormula: '1d20', dc: 5 } }, 'simple'),
    {},
    { rollDecision: DECISION, dropPrompt: true }
  );

  assert.equal(seen.formulas.at(-1), '2d20kh1 + (3)');
  assert.equal(seen.messages.at(-1)?.options?.rollMode, 'blindroll');
  assert.equal(result.success, true);
});

test('a decision is NEVER read as a cancellation', async () => {
  // `rollDecision` carries no `confirmed` key, and the evaluator's early exit is
  // `choice.confirmed === false`. A future tightening to `!choice.confirmed` would turn
  // EVERY bulk roll into a cancellation — twenty-five silent no-ops per gesture.
  const engine = makeEngine();
  stubRecordingRoll(18);
  const decision = { bonus: null, rollMode: undefined, advantage: 'normal' };
  assert.equal('confirmed' in decision, false, 'the shape under test carries no flag');

  const { result } = await runWithDecision(
    engine,
    sys({ simple: { rollFormula: '1d20', dc: 5, thresholdMode: 'meet' } }, 'simple'),
    {},
    { rollDecision: decision, dropPrompt: true }
  );

  assert.equal(result.cancelled, undefined, 'not a cancellation');
  assert.equal(result.success, true, 'it rolled, and it passed');
  assert.equal(result.value, 18);
});

test('an explicit confirmed:false in a decision STILL cancels', async () => {
  // The guard is not weakened for pre-resolved decisions: it is `=== false`, so a caller
  // that does hand over a dismissal is still honoured.
  const engine = makeEngine();
  stubRecordingRoll(18);
  const { result } = await runWithDecision(
    engine,
    sys({ simple: { rollFormula: '1d20', dc: 5 } }, 'simple'),
    {},
    { rollDecision: { confirmed: false, bonus: null, advantage: 'normal' }, dropPrompt: true }
  );

  assert.equal(result.cancelled, true);
});

test('a decision is ignored entirely on a NON-interactive roll', async () => {
  // The gate is `interactive === true` first. Automation and macros stay silent and
  // unmodified even if a decision is handed in.
  const engine = makeEngine();
  const seen = stubRecordingRoll(16);
  await runWithDecision(
    engine,
    sys({ simple: { rollFormula: '1d20', dc: 5 } }, 'simple'),
    {},
    {
      rollDecision: DECISION,
      interactive: false,
      dropPrompt: true,
    }
  );

  assert.equal(seen.formulas.at(-1), '1d20', 'the base formula, untouched');
  assert.deepEqual(seen.messages, [], 'and nothing is posted to chat');
});
