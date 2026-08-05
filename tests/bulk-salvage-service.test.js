/**
 * `BulkSalvageService` — one player gesture, N salvage attempts, one aggregated card
 * (issue 859).
 *
 * The service reaches NO Foundry global (`game`, `ui` and `ChatMessage` do not appear in
 * the module), so every test here drives plain objects through the five injected seams.
 * That is the property being protected as much as the behaviour: a fixture that
 * installed a global would let a future edit reach for one and still pass.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  BULK_MAX_ITEMS,
  BULK_SALVAGE_SKIP_REASONS,
  BulkSalvageService,
  classifySalvageOutcome,
} from '../src/systems/BulkSalvageService.js';
import { hasPlainD20 } from '../src/utils/craftingCheckExpression.js';
import {
  bulkComponent,
  bulkSystem,
  bulkTarget,
  craftingSystemLookup,
  recordingSalvage,
} from './helpers/bulkSalvageFixtures.js';

/** Swallow the service's per-item `console.error` for one test, and restore after. */
function silenceErrors(t) {
  const original = console.error;
  const lines = [];
  console.error = (...args) => lines.push(args.map(String).join(' '));
  t.after(() => {
    console.error = original;
  });
  return lines;
}

/** The three components the multi-row fixtures queue, in queue order. */
const ORE = bulkComponent({ id: 'comp-ore', name: 'Iron Ore', img: 'icons/ore.webp' });
const HIDE = bulkComponent({ id: 'comp-hide', name: 'Boar Hide', img: 'icons/hide.webp' });
const BONE = bulkComponent({ id: 'comp-bone', name: 'Cave Bone', img: 'icons/bone.webp' });

/** A one-system service over `components`, with the salvage seam supplied by the test. */
function makeService({ systems, salvage, promptRollDecision, postChatMessage, maxItems }) {
  return new BulkSalvageService({
    salvage,
    getCraftingSystem: craftingSystemLookup(systems),
    promptRollDecision,
    postChatMessage,
    maxItems,
  });
}

describe('classifySalvageOutcome reads the discriminators in the ONE total order', () => {
  // Two of the three discriminators travel alongside a `success` that CONTRADICTS them,
  // so the order is behaviour rather than style. Each row below is a real `salvage()`
  // return shape, not a synthetic one.
  const CASES = [
    {
      label: 'a dismissed prompt',
      result: { success: false, cancelled: true },
      outcome: 'cancelled',
    },
    {
      label: 'a misconfigured check (success: false beside the flag)',
      result: { success: false, misconfigured: true, results: null },
      outcome: 'misconfigured',
    },
    {
      label: 'a time gate (success: TRUE beside the flag)',
      result: { success: true, waiting: true, results: null },
      outcome: 'waiting',
    },
    { label: 'an awarded success', result: { success: true, results: [] }, outcome: 'succeeded' },
    { label: 'a rolled failure', result: { success: false, results: null }, outcome: 'failed' },
    { label: 'a null return', result: null, outcome: 'failed' },
  ];

  for (const testCase of CASES) {
    it(`${testCase.label} classifies as ${testCase.outcome}`, () => {
      assert.equal(classifySalvageOutcome(testCase.result), testCase.outcome);
    });
  }

  it('reads waiting BEFORE success, so a time-gated row never reports as recovered', () => {
    // The single most consequential ordering: the time gate returns `success: true`.
    assert.equal(classifySalvageOutcome({ success: true, waiting: true }), 'waiting');
    assert.notEqual(classifySalvageOutcome({ success: true, waiting: true }), 'succeeded');
  });

  it('reads misconfigured BEFORE the failure default, so a GM gap is not a failed roll', () => {
    assert.equal(classifySalvageOutcome({ success: false, misconfigured: true }), 'misconfigured');
  });
});

describe('BulkSalvageService.run: execution is strictly sequential', () => {
  /**
   * A salvage seam that READS the shared tool state on entry, yields to the microtask
   * queue, and MUTATES it on exit.
   *
   * The mutation that must flip this test is swapping the service's `for…of`/`await` for
   * `Promise.all`: under a parallel run both calls enter — and therefore both read
   * `hammer` — before either reaches its exit, so `comp-hide` sees an intact hammer and
   * succeeds. Both assertions below (the interleaving log AND the second row's outcome)
   * change under that one edit.
   */
  function breakingSalvage(log, state) {
    return async (actorUuid, systemId, componentId) => {
      log.push(`start:${componentId}`);
      const hammerIntact = state.hammer;
      await Promise.resolve();
      await Promise.resolve();
      if (componentId === 'comp-ore') state.hammer = false;
      log.push(`end:${componentId}`);
      if (!hammerIntact) {
        return { success: false, results: null, message: 'Required tools are unavailable' };
      }
      return { success: true, results: [] };
    };
  }

  it('never interleaves two calls, and item k+1 sees the tool item k broke', async () => {
    const log = [];
    const state = { hammer: true };
    const service = makeService({
      systems: [bulkSystem({ components: [ORE, HIDE] })],
      salvage: breakingSalvage(log, state),
    });

    const result = await service.run({
      targets: [bulkTarget({ componentId: 'comp-ore' }), bulkTarget({ componentId: 'comp-hide' })],
      interactive: false,
    });

    assert.deepEqual(
      log,
      ['start:comp-ore', 'end:comp-ore', 'start:comp-hide', 'end:comp-hide'],
      'each call completes before the next starts'
    );
    assert.equal(result.items[0].outcome, 'succeeded');
    assert.equal(
      result.items[1].outcome,
      'failed',
      'the hammer broken at item k is gone by item k+1'
    );
    assert.match(result.items[1].message, /tools are unavailable/);
  });

  it('preserves the caller queue order end to end', async () => {
    const { seam, calls } = recordingSalvage();
    const service = makeService({
      systems: [bulkSystem({ components: [ORE, HIDE, BONE] })],
      salvage: seam,
    });

    const result = await service.run({
      targets: ['comp-bone', 'comp-ore', 'comp-hide'].map((componentId) =>
        bulkTarget({ componentId })
      ),
      interactive: false,
    });

    assert.deepEqual(
      calls.map((call) => call.componentId),
      ['comp-bone', 'comp-ore', 'comp-hide'],
      'the engine is called in the order the player committed'
    );
    assert.deepEqual(
      result.items.map((item) => item.componentId),
      ['comp-bone', 'comp-ore', 'comp-hide'],
      'and the report rows line up with that queue'
    );
  });
});

describe('BulkSalvageService.run: one bad row never costs the player the others', () => {
  it('records a thrown call as `error` and carries on', async (t) => {
    const logged = silenceErrors(t);
    const service = makeService({
      systems: [bulkSystem({ components: [ORE, HIDE, BONE] })],
      salvage: async (actorUuid, systemId, componentId) => {
        if (componentId === 'comp-hide') throw new Error('the sky fell in');
        return { success: true, results: [] };
      },
    });

    const result = await service.run({
      targets: ['comp-ore', 'comp-hide', 'comp-bone'].map((componentId) =>
        bulkTarget({ componentId })
      ),
      interactive: false,
    });

    assert.deepEqual(
      result.items.map((item) => item.outcome),
      ['succeeded', 'error', 'succeeded'],
      'the run continued past the throw'
    );
    assert.equal(result.items[1].message, 'the sky fell in');
    assert.equal(result.counts.error, 1);
    assert.equal(result.counts.succeeded, 2);
    assert.ok(
      logged.some((line) => line.includes('comp-hide')),
      'and the throw is reported to the console, not swallowed'
    );
  });

  it('records a rolled failure without aborting the queue', async () => {
    const service = makeService({
      systems: [bulkSystem({ components: [ORE, HIDE] })],
      salvage: async (actorUuid, systemId, componentId) =>
        componentId === 'comp-ore'
          ? { success: false, results: null, message: 'Nothing recovered' }
          : { success: true, results: [] },
    });

    const result = await service.run({
      targets: [bulkTarget({ componentId: 'comp-ore' }), bulkTarget({ componentId: 'comp-hide' })],
      interactive: false,
    });

    assert.deepEqual(
      result.items.map((item) => item.outcome),
      ['failed', 'succeeded']
    );
  });
});

describe('BulkSalvageService.run: every outcome the vocabulary defines', () => {
  const RETURNS = {
    'comp-ore': { success: true, results: [{ name: 'Iron Ingot', img: 'icons/ingot.webp' }] },
    'comp-hide': { success: false, results: null, message: 'Nothing recovered' },
    'comp-bone': {
      success: true,
      waiting: true,
      results: null,
      message: 'Started (60s remaining)',
    },
    'comp-gem': { success: false, misconfigured: true, results: null, message: 'Not configured' },
    'comp-ash': { success: false, cancelled: true, results: null },
  };
  const NAMES = {
    'comp-ore': 'Iron Ore',
    'comp-hide': 'Boar Hide',
    'comp-bone': 'Cave Bone',
    'comp-gem': 'Raw Gem',
    'comp-ash': 'Grey Ash',
  };
  const COMPONENTS = Object.keys(RETURNS).map((id) => bulkComponent({ id, name: NAMES[id] }));

  /** Every runnable outcome plus a pre-flight skip and a throw, in one run. */
  async function runAllOutcomes(t) {
    silenceErrors(t);
    const posted = [];
    const service = makeService({
      systems: [
        bulkSystem({
          components: [...COMPONENTS, bulkComponent({ id: 'comp-off', salvageEnabled: false })],
        }),
      ],
      salvage: async (actorUuid, systemId, componentId) => {
        if (componentId === 'comp-boom') throw new Error('boom');
        return RETURNS[componentId];
      },
      postChatMessage: async (message) => posted.push(message),
    });
    const ids = [...Object.keys(RETURNS), 'comp-off', 'comp-boom'];
    const result = await service.run({
      targets: ids.map((componentId) => bulkTarget({ componentId })),
      interactive: false,
    });
    return { result, posted };
  }

  it('maps every salvage() return onto its outcome', async (t) => {
    const { result } = await runAllOutcomes(t);
    assert.deepEqual(
      result.items.map((item) => `${item.componentId}=${item.outcome}`),
      [
        'comp-ore=succeeded',
        'comp-hide=failed',
        'comp-bone=waiting',
        'comp-gem=misconfigured',
        'comp-ash=cancelled',
        'comp-off=skipped',
        // An unknown component never reaches the engine, so the throw comes from the
        // pre-flight's own classification rather than from the seam.
        'comp-boom=skipped',
      ]
    );
  });

  it('counts every outcome, always reporting the whole vocabulary', async (t) => {
    const { result } = await runAllOutcomes(t);
    assert.deepEqual(result.counts, {
      total: 7,
      succeeded: 1,
      failed: 1,
      waiting: 1,
      misconfigured: 1,
      skipped: 2,
      cancelled: 1,
      error: 0,
    });
  });

  it('a time-gated row contributes NO subject to the recovered list', async (t) => {
    // Acceptance 7. The run STARTED and awarded nothing, so it must appear in neither
    // the recovered section nor the failure count — the whole reason `waiting: true` was
    // added to the engine rather than inferred from `results == null`.
    const { result, posted } = await runAllOutcomes(t);
    const waitingRow = result.items.find((item) => item.componentId === 'comp-bone');
    assert.equal(waitingRow.outcome, 'waiting');
    assert.deepEqual(waitingRow.results, [], 'nothing recovered');
    assert.deepEqual(waitingRow.consumed, [], 'and nothing consumed');
    assert.equal(posted.length, 1, 'one aggregate card');
    // Occurrence counting rather than absence: the waiting row DOES belong in the
    // subjects table (it reached the engine and has something to say), so the claim is
    // that it appears there and NOWHERE else. The succeeded row is carried alongside as
    // the negative control — it appears twice, in subjects and in Consumed — so a card
    // that had simply stopped rendering the lower sections could not pass this.
    const occurrences = (name) => posted[0].content.split(name).length - 1;
    assert.equal(occurrences('Cave Bone'), 1, 'the time-gated row appears in subjects only');
    assert.equal(occurrences('Iron Ore'), 2, 'a real success appears in subjects AND Consumed');
  });
});

describe('BulkSalvageService.run: the pre-flight never touches the engine', () => {
  const SKIP_CASES = [
    {
      reason: BULK_SALVAGE_SKIP_REASONS.unknownSystem,
      target: bulkTarget({ systemId: 'sys-nope' }),
      systems: [bulkSystem({})],
    },
    {
      reason: BULK_SALVAGE_SKIP_REASONS.featureDisabled,
      target: bulkTarget({}),
      systems: [bulkSystem({ salvage: false })],
    },
    {
      reason: BULK_SALVAGE_SKIP_REASONS.unknownComponent,
      target: bulkTarget({ componentId: 'comp-nope' }),
      systems: [bulkSystem({})],
    },
    {
      reason: BULK_SALVAGE_SKIP_REASONS.salvageDisabled,
      target: bulkTarget({}),
      systems: [bulkSystem({ components: [bulkComponent({ salvageEnabled: false })] })],
    },
  ];

  for (const testCase of SKIP_CASES) {
    it(`classifies ${testCase.reason} without calling salvage`, async () => {
      const { seam, calls } = recordingSalvage();
      const service = makeService({ systems: testCase.systems, salvage: seam });

      const result = await service.run({ targets: [testCase.target], interactive: false });

      assert.equal(calls.length, 0, 'the engine was never reached');
      assert.equal(result.items[0].outcome, 'skipped');
      assert.equal(result.items[0].skipReason, testCase.reason);
    });
  }

  it('a skipped row still names the component it stood for when one resolves', async () => {
    const { seam } = recordingSalvage();
    const service = makeService({
      systems: [bulkSystem({ components: [bulkComponent({ salvageEnabled: false })] })],
      salvage: seam,
    });

    const result = await service.run({ targets: [bulkTarget({})], interactive: false });

    assert.equal(result.items[0].name, 'Iron Ore', 'a refused row is still readable');
    assert.equal(result.items[0].img, 'icons/ore.webp');
  });

  it('dedupes a repeated (actor, system, component) triple, keeping the FIRST', async () => {
    const { seam, calls } = recordingSalvage();
    const service = makeService({
      systems: [bulkSystem({ components: [ORE, HIDE] })],
      salvage: seam,
    });

    const result = await service.run({
      targets: [
        bulkTarget({ componentId: 'comp-ore' }),
        bulkTarget({ componentId: 'comp-hide' }),
        bulkTarget({ componentId: 'comp-ore' }),
      ],
      interactive: false,
    });

    assert.equal(calls.length, 2, 'the duplicate never reached the engine');
    assert.equal(result.items[2].skipReason, BULK_SALVAGE_SKIP_REASONS.duplicate);
    assert.equal(result.items[0].outcome, 'succeeded', 'the first occurrence still ran');
  });

  it('does NOT dedupe the same component on two different actors', async () => {
    // The dedupe key carries the actor: two characters each holding Iron Ore are two
    // genuine rows, and collapsing them would silently drop one player's salvage.
    const { seam, calls } = recordingSalvage();
    const service = makeService({ systems: [bulkSystem({ components: [ORE] })], salvage: seam });

    await service.run({
      targets: [
        bulkTarget({ actorId: 'a1', actorUuid: 'Actor.a1' }),
        bulkTarget({ actorId: 'a2', actorUuid: 'Actor.a2', actorName: 'Bren' }),
      ],
      interactive: false,
    });

    assert.equal(calls.length, 2);
    assert.deepEqual(
      calls.map((call) => call.actorUuid),
      ['Actor.a1', 'Actor.a2']
    );
  });
});

describe('BulkSalvageService.run: the selection bound', () => {
  it('exports 25 as the shared bound', () => {
    assert.equal(BULK_MAX_ITEMS, 25);
  });

  it('refuses everything past `maxItems` BY POSITION, and only those', async () => {
    // Driven through the `maxItems` seam, because the bound is enforced at SELECTION
    // time (`toggleBulkSelection` refuses the 26th) and the service-side branch is
    // therefore unreachable through the UI. It is a defensive backstop, and the seam is
    // what keeps it honest rather than letting it read as an omission.
    const components = [ORE, HIDE, BONE];
    const { seam, calls } = recordingSalvage();
    const service = makeService({
      systems: [bulkSystem({ components })],
      salvage: seam,
      maxItems: 2,
    });

    const result = await service.run({
      targets: components.map((component) => bulkTarget({ componentId: component.id })),
      interactive: false,
    });

    assert.equal(calls.length, 2, 'only the first two ran');
    assert.equal(result.items[2].skipReason, BULK_SALVAGE_SKIP_REASONS.bulkLimit);
    assert.equal(result.items[0].outcome, 'succeeded');
  });

  it('falls back to the shared bound for a nonsense maxItems', async () => {
    for (const maxItems of [0, -3, Number.NaN, 'many', undefined]) {
      const service = new BulkSalvageService({
        salvage: async () => ({ success: true }),
        getCraftingSystem: () => null,
        maxItems,
      });
      assert.equal(service.maxItems, BULK_MAX_ITEMS, `maxItems: ${String(maxItems)}`);
    }
  });
});

describe('BulkSalvageService.run: the ONE roll prompt', () => {
  /** A system whose salvage check IS usable — an authored, non-blank formula. */
  const usable = (overrides = {}) =>
    bulkSystem({ rollFormula: '1d20 + 3', components: [ORE, HIDE], ...overrides });

  it('never prompts when nothing selected has a usable check', async () => {
    const prompts = [];
    const service = makeService({
      // The default fixture formula is `''` — authored but blank, so no check is usable.
      systems: [bulkSystem({ components: [ORE, HIDE] })],
      salvage: async () => ({ success: true, results: [] }),
      promptRollDecision: async (args) => {
        prompts.push(args);
        return { confirmed: true, bonus: '2', rollMode: 'gmroll', advantage: 'normal' };
      },
    });

    const result = await service.run({
      targets: [bulkTarget({ componentId: 'comp-ore' }), bulkTarget({ componentId: 'comp-hide' })],
      interactive: true,
    });

    assert.equal(prompts.length, 0, 'a dialog with no consequence is never opened');
    assert.equal(result.cancelled, false, 'and the run proceeds');
  });

  it('never prompts on a non-interactive run', async () => {
    const prompts = [];
    const service = makeService({
      systems: [usable()],
      salvage: async () => ({ success: true, results: [] }),
      promptRollDecision: async (args) => {
        prompts.push(args);
        return { confirmed: true };
      },
    });

    await service.run({ targets: [bulkTarget({})], interactive: false });

    assert.equal(prompts.length, 0);
  });

  it('prompts ONCE for the whole batch, naming every subject', async () => {
    const prompts = [];
    const service = makeService({
      systems: [usable()],
      salvage: async () => ({ success: true, results: [] }),
      promptRollDecision: async (args) => {
        prompts.push(args);
        return { confirmed: true, bonus: '2', rollMode: 'gmroll', advantage: 'normal' };
      },
    });

    await service.run({
      targets: [bulkTarget({ componentId: 'comp-ore' }), bulkTarget({ componentId: 'comp-hide' })],
      interactive: true,
    });

    assert.equal(prompts.length, 1, 'one prompt, not one per item');
    assert.equal(prompts[0].count, 2);
    assert.deepEqual(prompts[0].subjects, [
      { name: 'Iron Ore', img: 'icons/ore.webp' },
      { name: 'Boar Hide', img: 'icons/hide.webp' },
    ]);
  });

  it('a dismissal records ZERO salvage calls and returns before any mutation', async () => {
    // Acceptance 4. Zero mutation on cancel is STRUCTURAL — the run never starts — so
    // this asserts the call count, not a rollback.
    const { seam, calls } = recordingSalvage();
    const service = makeService({
      systems: [usable()],
      salvage: seam,
      promptRollDecision: async () => ({ confirmed: false }),
    });

    const result = await service.run({
      targets: [bulkTarget({ componentId: 'comp-ore' }), bulkTarget({ componentId: 'comp-hide' })],
      interactive: true,
    });

    assert.equal(calls.length, 0, 'nothing was salvaged');
    assert.equal(result.cancelled, true);
    assert.deepEqual(result.items, [], 'and no per-row story is told for a run that never ran');
    assert.equal(result.posted, false, 'nor is a card posted');
  });

  it('treats a null prompt return as a dismissal', async () => {
    const { seam, calls } = recordingSalvage();
    const service = makeService({
      systems: [usable()],
      salvage: seam,
      promptRollDecision: async () => null,
    });

    const result = await service.run({ targets: [bulkTarget({})], interactive: true });

    assert.equal(calls.length, 0);
    assert.equal(result.cancelled, true);
  });

  it('threads the SAME rollDecision OBJECT into every options bag', async () => {
    // Object identity, not deep equality: `evaluateCheckRoll` uses the decision verbatim
    // as the player's `choice`, and a per-item clone would be a place for a per-item
    // divergence to hide. One answer, one object, N rolls.
    const { seam, calls } = recordingSalvage();
    const service = makeService({
      systems: [usable({ components: [ORE, HIDE, BONE] })],
      salvage: seam,
      promptRollDecision: async () => ({
        confirmed: true,
        bonus: '2',
        rollMode: 'blindroll',
        advantage: 'advantage',
      }),
    });

    await service.run({
      targets: ['comp-ore', 'comp-hide', 'comp-bone'].map((componentId) =>
        bulkTarget({ componentId })
      ),
      interactive: true,
    });

    assert.equal(calls.length, 3);
    const first = calls[0].options.rollDecision;
    for (const call of calls) {
      assert.equal(call.options.rollDecision, first, 'one object reaches every roll');
    }
    assert.deepEqual(first, { bonus: '2', rollMode: 'blindroll', advantage: 'advantage' });
  });

  it('strips `confirmed` from the decision it threads', async () => {
    // LOAD-BEARING. `evaluateCheckRoll`'s early exit is `choice.confirmed === false`, and
    // a decision carrying `confirmed` would be read as a fresh prompt result by any
    // future tightening of that guard — turning every bulk roll into a cancellation.
    const { seam, calls } = recordingSalvage();
    const service = makeService({
      systems: [usable()],
      salvage: seam,
      promptRollDecision: async () => ({ confirmed: true, bonus: null, rollMode: 'publicroll' }),
    });

    await service.run({ targets: [bulkTarget({})], interactive: true });

    assert.equal('confirmed' in calls[0].options.rollDecision, false);
  });

  it('passes NO rollDecision when nothing prompted', async () => {
    const { seam, calls } = recordingSalvage();
    const service = makeService({
      systems: [bulkSystem({ components: [ORE] })],
      salvage: seam,
      promptRollDecision: async () => ({ confirmed: true }),
    });

    await service.run({ targets: [bulkTarget({})], interactive: true });

    assert.equal(calls[0].options.rollDecision, null, 'every roll uses its base formula');
  });

  it('sets `suppressChat: true` on EVERY call', async () => {
    // Without this a 10-item run posts the aggregate card PLUS 10 stray per-item cards.
    // The flag has two engine call sites (the rolled-failure path and the success path)
    // and a poster-level test cannot see a missed thread, so the assertion is per call.
    const { seam, calls } = recordingSalvage();
    const service = makeService({
      systems: [usable({ components: [ORE, HIDE, BONE] })],
      salvage: seam,
      promptRollDecision: async () => ({ confirmed: true, advantage: 'normal' }),
    });

    await service.run({
      targets: ['comp-ore', 'comp-hide', 'comp-bone'].map((componentId) =>
        bulkTarget({ componentId })
      ),
      interactive: true,
    });

    assert.equal(calls.length, 3);
    for (const call of calls) {
      assert.equal(call.options.suppressChat, true, `${call.componentId}`);
      assert.equal(call.options.interactive, true);
    }
  });
});

describe('BulkSalvageService.run: allowAdvantage is all-or-nothing, from the system', () => {
  /** Run one prompt and hand back the `allowAdvantage` it was offered. */
  async function offeredAdvantage(systems, componentIds) {
    let offered = null;
    const service = makeService({
      systems,
      salvage: async () => ({ success: true, results: [] }),
      promptRollDecision: async (args) => {
        offered = args.allowAdvantage;
        return { confirmed: true, advantage: 'normal' };
      },
    });
    await service.run({
      targets: componentIds.map((componentId, index) =>
        bulkTarget({ componentId, systemId: systems[Math.min(index, systems.length - 1)].id })
      ),
      interactive: true,
    });
    return offered;
  }

  it('offers advantage when every usable-check subject rolls a plain d20', async () => {
    const offered = await offeredAdvantage(
      [bulkSystem({ rollFormula: '1d20 + 3', components: [ORE, HIDE] })],
      ['comp-ore', 'comp-hide']
    );
    assert.equal(offered, true);
  });

  it('withholds it when ANY usable-check subject does not', async () => {
    // Offering advantage that only some rolls could honour is a lie about half the batch:
    // `applyD20Advantage` leaves a non-plain-d20 formula unchanged, so those rows would
    // roll normally under an Advantage button.
    const offered = await offeredAdvantage(
      [
        bulkSystem({ id: 'sys-a', rollFormula: '1d20 + 3', components: [ORE] }),
        bulkSystem({ id: 'sys-b', rollFormula: '2d6 + 1', components: [HIDE] }),
      ],
      ['comp-ore', 'comp-hide']
    );
    assert.equal(offered, false);
  });

  it('agrees with evaluateCheckRoll for a TOOL-BONUSED plain-d20 formula', async () => {
    // The evaluator computes its own `allowAdvantage` as `hasPlainD20(effectiveFormula)`.
    // A salvage formula carrying a tool bonus is the realistic authored shape, and it is
    // where a naive `formula === '1d20'` check in the service would disagree with the
    // evaluator — the dialog would offer Advantage the roll then honours (or the reverse),
    // with nothing anywhere to catch it. Both halves are asserted, not just the service's.
    const formula = '1d20 + @tools';
    assert.equal(hasPlainD20(formula), true, 'the evaluator would offer advantage');
    const offered = await offeredAdvantage(
      [bulkSystem({ rollFormula: formula, components: [ORE] })],
      ['comp-ore']
    );
    assert.equal(offered, hasPlainD20(formula), 'and so does the service');
  });

  it('ignores a subject with NO usable check when deciding', async () => {
    // A no-check row rolls nothing, so it has no opinion about advantage. Letting it veto
    // the offer would withhold advantage from the rows that can honour it.
    const offered = await offeredAdvantage(
      [
        bulkSystem({ id: 'sys-a', rollFormula: '1d20', components: [ORE] }),
        bulkSystem({ id: 'sys-b', rollFormula: '   ', components: [HIDE] }),
      ],
      ['comp-ore', 'comp-hide']
    );
    assert.equal(offered, true, 'only the usable-check subjects are consulted');
  });
});

describe('BulkSalvageService.run: a run spanning two actors and two systems', () => {
  it('completes, calling each target against its own actor and system', async () => {
    // Acceptance 8. Nothing rolled is shared across items — each rolls its own system's
    // formula — so a mixed-system batch needs no single check, which is what makes the
    // one-prompt design work across systems at all.
    const { seam, calls } = recordingSalvage();
    const service = makeService({
      systems: [
        bulkSystem({ id: 'sys-a', rollFormula: '1d20', components: [ORE] }),
        bulkSystem({ id: 'sys-b', rollFormula: '1d20', components: [HIDE] }),
      ],
      salvage: seam,
      promptRollDecision: async () => ({ confirmed: true, bonus: '1', advantage: 'normal' }),
    });

    const result = await service.run({
      targets: [
        bulkTarget({
          actorId: 'a1',
          actorUuid: 'Actor.a1',
          systemId: 'sys-a',
          componentId: 'comp-ore',
        }),
        bulkTarget({
          actorId: 'a2',
          actorUuid: 'Actor.a2',
          actorName: 'Bren',
          systemId: 'sys-b',
          componentId: 'comp-hide',
        }),
      ],
      interactive: true,
    });

    assert.deepEqual(
      calls.map((call) => [call.actorUuid, call.systemId, call.componentId]),
      [
        ['Actor.a1', 'sys-a', 'comp-ore'],
        ['Actor.a2', 'sys-b', 'comp-hide'],
      ]
    );
    assert.deepEqual(
      result.items.map((item) => item.actorName),
      ['Akra', 'Bren']
    );
    assert.equal(result.counts.succeeded, 2);
  });

  it('names every acting actor on the aggregate card, once each', async () => {
    const posted = [];
    const service = makeService({
      systems: [bulkSystem({ components: [ORE, HIDE] })],
      salvage: async () => ({ success: true, results: [] }),
      postChatMessage: async (message) => posted.push(message),
    });

    await service.run({
      targets: [
        bulkTarget({ actorId: 'a1', actorUuid: 'Actor.a1', componentId: 'comp-ore' }),
        bulkTarget({ actorId: 'a1', actorUuid: 'Actor.a1', componentId: 'comp-hide' }),
      ],
      interactive: false,
    });

    assert.deepEqual(posted[0].actorNames, ['Akra'], 'deduped');
    assert.equal(posted[0].actorUuid, 'Actor.a1', 'a one-actor run speaks AS that actor');
  });

  it('hands the poster a NULL actorUuid for a multi-actor run', async () => {
    // `getSpeaker` with no actor infers from CONTROLLED TOKENS, so a GM with an unrelated
    // NPC selected would have the card attributed to it. A null uuid is the poster's
    // signal to build an explicit alias instead.
    const posted = [];
    const service = makeService({
      systems: [bulkSystem({ components: [ORE, HIDE] })],
      salvage: async () => ({ success: true, results: [] }),
      postChatMessage: async (message) => posted.push(message),
    });

    await service.run({
      targets: [
        bulkTarget({ actorId: 'a1', actorUuid: 'Actor.a1', componentId: 'comp-ore' }),
        bulkTarget({
          actorId: 'a2',
          actorUuid: 'Actor.a2',
          actorName: 'Bren',
          componentId: 'comp-hide',
        }),
      ],
      interactive: false,
    });

    assert.equal(posted[0].actorUuid, null);
    assert.deepEqual(posted[0].actorNames, ['Akra', 'Bren']);
  });
});

describe('BulkSalvageService.run: what the run hands back', () => {
  it('returns plain models, never Item documents', async () => {
    // A consumed source's document is already deleted by the time this returns, so
    // handing one back would hand back a document that no longer exists.
    const created = {
      name: 'Iron Ingot',
      img: 'icons/ingot.webp',
      system: { quantity: 2 },
      delete: () => {},
    };
    const service = makeService({
      systems: [bulkSystem({ components: [ORE] })],
      salvage: async () => ({ success: true, results: [created] }),
    });

    const result = await service.run({ targets: [bulkTarget({})], interactive: false });

    assert.deepEqual(result.items[0].results, [
      { name: 'Iron Ingot', img: 'icons/ingot.webp', quantity: 2 },
    ]);
    assert.equal('delete' in result.items[0].results[0], false, 'no document leaked out');
  });

  it('prefers the run record total over the top-level value for a subject roll', async () => {
    // `salvage()` threads the top-level `value` only on the SUCCESS return, and a
    // progressive forced crit overwrites it with the AWARDING value — so the raw
    // `data.total` wins wherever a run record carries one (`rollTotalForCard`'s order).
    const service = makeService({
      systems: [bulkSystem({ components: [ORE] })],
      salvage: async () => ({
        success: true,
        results: [],
        value: 9007199254740991,
        salvageRun: { checkResult: { data: { total: 17 }, value: 12 } },
      }),
    });

    const result = await service.run({ targets: [bulkTarget({})], interactive: false });

    assert.equal(result.items[0].rollValue, 17);
  });

  it('reads the roll off a RUNLESS failure as null rather than inventing one', async () => {
    const service = makeService({
      systems: [bulkSystem({ components: [ORE] })],
      salvage: async () => ({ success: false, results: null, message: 'Nothing recovered' }),
    });

    const result = await service.run({ targets: [bulkTarget({})], interactive: false });

    assert.equal(result.items[0].rollValue, null);
  });

  it('reports the tools a run broke, deduped, and none at all without a run record', async () => {
    const system = bulkSystem({ components: [ORE, HIDE] });
    system.components.push(
      bulkComponent({ id: 'tool-hammer', name: 'Hammer', img: 'icons/h.webp' })
    );
    const service = makeService({
      systems: [system],
      salvage: async (actorUuid, systemId, componentId) => ({
        success: true,
        results: [],
        salvageRun:
          componentId === 'comp-ore'
            ? { usedTools: [{ componentId: 'tool-hammer', broken: true }] }
            : null,
      }),
    });

    const result = await service.run({
      targets: [bulkTarget({ componentId: 'comp-ore' }), bulkTarget({ componentId: 'comp-hide' })],
      interactive: false,
    });

    assert.deepEqual(result.items[0].tools, [{ name: 'Hammer', img: 'icons/h.webp' }]);
    assert.deepEqual(result.items[1].tools, [], 'no run record means no tool evidence at all');
  });

  it('falls back to the authored ingredientQuantity for a runless success', async () => {
    const service = makeService({
      systems: [bulkSystem({ components: [bulkComponent({ ingredientQuantity: 3 })] })],
      salvage: async () => ({ success: true, results: [] }),
    });

    const result = await service.run({ targets: [bulkTarget({})], interactive: false });

    assert.deepEqual(result.items[0].consumed, [
      { name: 'Iron Ore', img: 'icons/ore.webp', quantity: 3 },
    ]);
  });

  it('consumes nothing for a runless FAILURE', async () => {
    const service = makeService({
      systems: [bulkSystem({ components: [bulkComponent({ ingredientQuantity: 3 })] })],
      salvage: async () => ({ success: false, results: null, message: 'Nothing recovered' }),
    });

    const result = await service.run({ targets: [bulkTarget({})], interactive: false });

    assert.deepEqual(result.items[0].consumed, []);
  });
});

describe('BulkSalvageService.run: the per-system chatOutput gate', () => {
  it('posts nothing when no subject qualifies', async () => {
    const posted = [];
    const service = makeService({
      systems: [bulkSystem({ chatOutput: false, components: [ORE] })],
      salvage: async () => ({ success: true, results: [] }),
      postChatMessage: async (message) => posted.push(message),
    });

    const result = await service.run({ targets: [bulkTarget({})], interactive: false });

    assert.equal(posted.length, 0, 'not an empty card — no card');
    assert.equal(result.posted, false);
  });

  it('excludes a SKIPPED row from the card, which never reached the engine', async () => {
    const posted = [];
    const service = makeService({
      systems: [
        bulkSystem({
          components: [
            ORE,
            bulkComponent({ id: 'comp-off', name: 'Sealed Vial', salvageEnabled: false }),
          ],
        }),
      ],
      salvage: async () => ({ success: true, results: [] }),
      postChatMessage: async (message) => posted.push(message),
    });

    await service.run({
      targets: [bulkTarget({ componentId: 'comp-ore' }), bulkTarget({ componentId: 'comp-off' })],
      interactive: false,
    });

    assert.equal(posted.length, 1);
    assert.match(posted[0].content, /Iron Ore/);
    assert.doesNotMatch(
      posted[0].content,
      /Sealed Vial/,
      'a skipped row belongs to the panel report only'
    );
  });

  it('survives a throwing poster without costing the player an award that happened', async () => {
    const original = console.error;
    console.error = () => {};
    try {
      const service = makeService({
        systems: [bulkSystem({ components: [ORE] })],
        salvage: async () => ({ success: true, results: [{ name: 'Iron Ingot' }] }),
        postChatMessage: async () => {
          throw new Error('chat is down');
        },
      });

      const result = await service.run({ targets: [bulkTarget({})], interactive: false });

      assert.equal(result.posted, false);
      assert.equal(result.items[0].outcome, 'succeeded', 'the award still stands');
    } finally {
      console.error = original;
    }
  });

  it('reports posted: false when no poster is wired at all', async () => {
    const service = makeService({
      systems: [bulkSystem({ components: [ORE] })],
      salvage: async () => ({ success: true, results: [] }),
    });

    const result = await service.run({ targets: [bulkTarget({})], interactive: false });

    assert.equal(result.posted, false);
  });
});

describe('BulkSalvageService.run: the private-roll token reaches the poster', () => {
  /** Post one aggregate card and hand back every message the poster was given. */
  async function postedMessages({ rollFormula = '', promptRollDecision }) {
    const posted = [];
    const service = makeService({
      systems: [bulkSystem({ rollFormula, components: [ORE] })],
      salvage: async () => ({ success: true, results: [] }),
      promptRollDecision,
      postChatMessage: async (message) => posted.push(message),
    });
    await service.run({ targets: [bulkTarget({})], interactive: true });
    return posted;
  }

  it('forwards the chosen roll mode, so a BLIND bulk run is not published', async () => {
    // The middle hop of a four-link chain: the prompt returns the token, THIS forwards it,
    // `_postBulkSalvageChatMessage` applies it and `applyBulkChatVisibility` translates it.
    // Replacing the forward with a literal `null` posts every blindroll/gmroll/selfroll
    // bulk card PUBLICLY — the dice hidden and the entire result table published to the
    // table. Nothing else in the chain can notice, because the poster is downstream of it.
    const posted = await postedMessages({
      rollFormula: '1d20 + 3',
      promptRollDecision: async () => ({
        confirmed: true,
        bonus: '2',
        rollMode: 'blindroll',
        advantage: 'normal',
      }),
    });

    assert.equal(posted.length, 1);
    assert.equal(posted[0].rollMode, 'blindroll', "the player's own visibility choice");
  });

  it('hands the poster NULL when nothing prompted, rather than inventing a default', async () => {
    // `null` is not "public": it is the poster's signal to fall back to the CLIENT's own
    // `core.rollMode`. Substituting `publicroll` here would override a player who runs
    // their whole session whispered. The prompt below WOULD have said `gmroll` — it is
    // never opened, because the fixture formula is blank and no check is usable.
    const posted = await postedMessages({
      promptRollDecision: async () => ({ confirmed: true, rollMode: 'gmroll' }),
    });

    assert.equal(posted.length, 1);
    assert.equal(posted[0].rollMode, null);
  });
});

describe('BulkSalvageService.run: progress ticks over EVERY entry', () => {
  const SEALED = bulkComponent({ id: 'comp-off', name: 'Sealed Vial', salvageEnabled: false });

  /**
   * Run the SAME three-row queue — runnable, pre-flight skip, runnable — with whatever
   * listener the test supplies, on a service built fresh each time so two runs can be
   * compared directly.
   */
  async function runQueue(onProgress) {
    const { seam, calls } = recordingSalvage();
    const service = makeService({
      systems: [bulkSystem({ components: [ORE, SEALED, HIDE] })],
      salvage: seam,
    });
    const result = await service.run({
      targets: ['comp-ore', 'comp-off', 'comp-hide'].map((componentId) =>
        bulkTarget({ componentId })
      ),
      interactive: false,
      onProgress,
    });
    return { result, calls };
  }

  it('ticks once per entry, in queue order, a PRE-FLIGHT SKIP included', async () => {
    // Documented as correctness-critical. The panel marks the rows the player queued, in
    // this same order, so a counter that ticked only over `runnable` would mark the wrong
    // rows done AND would stop at `2 of 3` on any run carrying a skip — a progress bar
    // that never completes for a queue that did.
    const ticks = [];
    const { result } = await runQueue((completed, total) => ticks.push([completed, total]));

    assert.deepEqual(ticks, [
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
    assert.equal(result.items[1].outcome, 'skipped', 'the middle row really did skip');
    assert.equal(result.items[1].skipReason, BULK_SALVAGE_SKIP_REASONS.salvageDisabled);
  });

  it('reports NOTHING at all when no listener is given, and runs identically', async () => {
    const { result, calls } = await runQueue(undefined);

    assert.equal(calls.length, 2, 'the two runnable rows still ran');
    assert.equal(result.counts.succeeded, 2);
  });

  it('ignores a listener that is not a function rather than throwing at row one', async () => {
    for (const listener of [null, 'later', 42, {}]) {
      const { result } = await runQueue(listener);
      assert.equal(result.counts.succeeded, 2, `onProgress: ${String(listener)}`);
    }
  });

  it('a THROWING listener never costs the player the rest of the batch', async (t) => {
    // The safety invariant, and the reason the report is wrapped at all. A bulk run is
    // mid-flight document mutation — sources consumed, results created, tools broken — by
    // the time the first tick fires, so a consumer's broken callback must not be able to
    // abandon the queue. Every tick throws, not just the first, because the guard has to
    // hold per call rather than once.
    const logged = silenceErrors(t);
    const ticks = [];
    const control = await runQueue(undefined);

    const observed = await runQueue((completed, total) => {
      ticks.push([completed, total]);
      throw new Error('the panel went away');
    });

    assert.deepEqual(
      ticks,
      [
        [1, 3],
        [2, 3],
        [3, 3],
      ],
      'the loop kept ticking after each throw'
    );
    assert.equal(observed.calls.length, 2, 'both runnable rows still reached the engine');
    assert.deepEqual(observed.result.items, control.result.items, 'the rows are unchanged');
    assert.deepEqual(observed.result.counts, control.result.counts, 'and so are the counts');
    assert.ok(
      logged.some((line) => line.includes('progress listener threw')),
      'the throw is reported to the console rather than swallowed'
    );
  });
});
