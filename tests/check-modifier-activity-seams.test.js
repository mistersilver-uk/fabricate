/**
 * Issue 1095 — the check-modifier seam on SALVAGE and GATHERING, and the eval==display
 * invariant on crafting.
 *
 * Every assertion here reads the ROLLED FORMULA STRING a real runner produced. That is
 * deliberate and it is the only observable that can fail for the right reason: a
 * resolver-level assertion cannot see a runner that never threads the context, and a
 * context-level assertion cannot see the arithmetic that reaches Foundry's `Roll`. Salvage
 * and gathering had NO modifier seam before this change, so a missing thread here is not a
 * regression — it is the feature failing to ship, silently, under a green suite.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

globalThis.foundry = { utils: { randomID: () => Math.random().toString(36).slice(2) } };
globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };

const { CraftingEngine } = await import('../src/systems/CraftingEngine.js');
const { GatheringEngine } = await import('../src/systems/GatheringEngine.js');
const { buildCheckModifierContext, resolveCheckModifierContribution, makeRollDataExpressionResolver } =
  await import('../src/systems/checkModifierResolver.js');

const CATALOGUE = [
  { id: 'med', label: 'Medicine', expression: '@med' },
  { id: 'alch', label: 'Alchemy', expression: '@alch' },
];
const ACTOR = { getRollData: () => ({ med: 3, alch: 2 }) };

/**
 * A deterministic `Roll` double that RECORDS the formula it was handed.
 *
 * The formula is the whole observable: `+ 3[Modifiers]`, `+ 5[Modifiers]` and no term at
 * all are three distinct strings and no two of them can coincide, so a runner that never
 * threaded the context cannot pass by accident.
 */
class StubRoll {
  static replaceFormulaData(formula, data) {
    return String(formula).replaceAll(/@(\w+)/g, (_match, key) => String(data?.[key] ?? 0));
  }
  static validate() {
    return true;
  }
}

function stubRoll(rolled) {
  const previous = globalThis.Roll;
  class RecordingRoll {
    constructor(formula) {
      this.formula = formula;
      this.total = 20;
      this.terms = [];
      this.dice = [];
      rolled.push(formula);
    }
    async evaluate() {
      return this;
    }
    async toMessage() {}
    static replaceFormulaData(formula, data) {
      return String(formula).replaceAll(/@(\w+)/g, (_match, key) => String(data?.[key] ?? 0));
    }
    static validate() {
      return true;
    }
  }
  globalThis.Roll = RecordingRoll;
  return () => {
    globalThis.Roll = previous;
  };
}

// ── salvage ───────────────────────────────────────────────────────────────────

const SALVAGE_COMPONENT = { id: 'c1', name: 'Iron Ore', img: '', salvage: {} };

function salvageSystem(mode, slot, selection = {}) {
  return {
    modifiers: CATALOGUE,
    salvageResolutionMode: mode,
    salvageCraftingCheck: {
      [mode]: slot,
      defaultModifierPolicy: 'addAll',
      defaultModifierIds: ['med', 'alch'],
      ...selection,
    },
  };
}

const SALVAGE_SLOTS = [
  ['simple', { rollFormula: '1d20', dc: 10, thresholdMode: 'meet' }],
  [
    'routed',
    {
      rollFormula: '1d20',
      dc: 10,
      thresholdMode: 'meet',
      type: 'relative',
      relativeOutcomes: [{ id: 'o', name: 'Fine', dc: 0, success: true }],
    },
  ],
  ['progressive', { rollFormula: '1d20' }],
];

for (const [mode, slot] of SALVAGE_SLOTS) {
  test(`salvage ${mode}: the resolved modifier term reaches the rolled formula`, async () => {
    const rolled = [];
    const restore = stubRoll(rolled);
    try {
      await new CraftingEngine(null)._runSalvageCraftingCheck(
        SALVAGE_COMPONENT,
        salvageSystem(mode, slot),
        ACTOR,
        {}
      );
    } finally {
      restore();
    }
    assert.equal(
      rolled.at(-1),
      '1d20 + 5[Modifiers]',
      `${mode}: salvage had NO modifier seam before issue 1095 — an unthreaded context ` +
        'rolls the bare `1d20` and every assertion but this one still passes'
    );
  });
}

test('salvage appends TOOL bonuses first and the modifier term after them', async () => {
  const rolled = [];
  const restore = stubRoll(rolled);
  const engine = new CraftingEngine(null);
  // The tool-bonus append is its own seam (`_appendToolCheckBonuses`); stub it to a known
  // rewrite so the ORDER is observable rather than inferred.
  engine._appendToolCheckBonuses = async (formula) => `${formula} + 2[Tools]`;
  try {
    await engine._runSalvageCraftingCheck(
      SALVAGE_COMPONENT,
      salvageSystem('simple', SALVAGE_SLOTS[0][1]),
      ACTOR,
      {}
    );
  } finally {
    restore();
  }
  assert.equal(
    rolled.at(-1),
    '1d20 + 2[Tools] + 5[Modifiers]',
    'tools append FIRST — the modifier term is appended to whatever the runner was handed'
  );
});

test('salvage bySubject honours the COMPONENT’s own pick', async () => {
  const rolled = [];
  const restore = stubRoll(rolled);
  try {
    await new CraftingEngine(null)._runSalvageCraftingCheck(
      { ...SALVAGE_COMPONENT, salvage: { checkModifierIds: ['alch'] } },
      salvageSystem('simple', SALVAGE_SLOTS[0][1], { defaultModifierPolicy: 'bySubject' }),
      ACTOR,
      {}
    );
  } finally {
    restore();
  }
  assert.equal(rolled.at(-1), '1d20 + 2[Modifiers]', 'Alchemy alone, not the default set of 5');
});

test('salvage under an AUTHORED EMPTY component pick appends nothing at all', async () => {
  const rolled = [];
  const restore = stubRoll(rolled);
  try {
    await new CraftingEngine(null)._runSalvageCraftingCheck(
      { ...SALVAGE_COMPONENT, salvage: { checkModifierIds: [] } },
      salvageSystem('simple', SALVAGE_SLOTS[0][1], { defaultModifierPolicy: 'bySubject' }),
      ACTOR,
      {}
    );
  } finally {
    restore();
  }
  assert.equal(rolled.at(-1), '1d20', 'a real pick of zero appends no term, not a `+ 0`');
});

// ── gathering (DORMANT: driven directly, because nothing else can reach it) ────
//
// `_libraryTaskToRuntimeTask` hardcodes `resolutionMode: 'd100'` pending issue 683 and the
// economy editor renders both formula-rolled modes `disabled`, so NO GM-selectable
// configuration reaches these two runners today (decision 8). These tests drive them
// directly and say so, rather than implying a live path that does not exist.

const GATHERING_TASK = { id: 't1', name: 'Forage', img: '', checkModifierIds: undefined };

function gatheringSystem(slot, selection = {}) {
  return {
    modifiers: CATALOGUE,
    gatheringCraftingCheck: {
      ...slot,
      defaultModifierPolicy: 'addAll',
      defaultModifierIds: ['med', 'alch'],
      ...selection,
    },
  };
}

test('gathering routed: the modifier term reaches the rolled formula (DORMANT seam)', async () => {
  const rolled = [];
  const restore = stubRoll(rolled);
  try {
    await new GatheringEngine({})._resolveRoutedOutcome({
      actor: ACTOR,
      system: gatheringSystem({
        routed: {
          rollFormula: '1d20',
          dc: 10,
          thresholdMode: 'meet',
          type: 'relative',
          relativeOutcomes: [{ id: 'o', name: 'Fine', dc: 0, success: true }],
        },
      }),
      task: GATHERING_TASK,
    });
  } finally {
    restore();
  }
  assert.equal(rolled.at(-1), '1d20 + 5[Modifiers]');
});

test('gathering progressive: the modifier term reaches the rolled formula (DORMANT seam)', async () => {
  const rolled = [];
  const restore = stubRoll(rolled);
  try {
    await new GatheringEngine({})._evaluateGatheringCheck({
      actor: ACTOR,
      system: gatheringSystem({ progressive: { rollFormula: '2d6' } }),
      task: GATHERING_TASK,
    });
  } finally {
    restore();
  }
  assert.equal(rolled.at(-1), '2d6 + 5[Modifiers]');
});

test('gathering bySubject honours the TASK’s own pick, including an authored empty one', async () => {
  const routedSlot = {
    routed: {
      rollFormula: '1d20',
      dc: 10,
      thresholdMode: 'meet',
      type: 'relative',
      relativeOutcomes: [{ id: 'o', name: 'Fine', dc: 0, success: true }],
    },
  };
  for (const [checkModifierIds, expected] of [
    [['med'], '1d20 + 3[Modifiers]'],
    [[], '1d20'],
    [undefined, '1d20 + 5[Modifiers]'],
  ]) {
    const rolled = [];
    const restore = stubRoll(rolled);
    try {
      await new GatheringEngine({})._resolveRoutedOutcome({
        actor: ACTOR,
        system: gatheringSystem(routedSlot, { defaultModifierPolicy: 'bySubject' }),
        task: { ...GATHERING_TASK, checkModifierIds },
      });
    } finally {
      restore();
    }
    assert.equal(rolled.at(-1), expected, `pick ${JSON.stringify(checkModifierIds)}`);
  }
});

// ── the pick has to SURVIVE COMPOSITION to reach any of the above ─────────────
//
// Every gathering test above hands the engine a hand-built task literal, and that is the
// one thing they cannot prove: the engine never receives a library task. It receives a
// COMPOSED one, rebuilt field by field by `_libraryTaskToRuntimeTask` on the way through
// `composeEnvironment` → `_findStartTask` → `_resolveStartContext`. That literal is a THIRD
// whitelist rebuild beside the two mirrored library normalizers, and it omitted
// `checkModifierIds` — so `readSubjectModifierIds` found nothing, every composed task
// silently INHERITED the default set, and `bySubject` could not work on gathering at all
// while both library normalizers were correct and the pick sat intact on disk.
//
// The composed task is fed to the SAME runner the tests above drive, so the observable is
// the same formula string and the two cannot disagree about what a pick means.

const { GatheringRichStateService } = await import('../src/systems/GatheringRichStateService.js');
const { SETTING_KEYS } = await import('../src/config/settings.js');

function composeTask(libraryTask) {
  const config = { systems: { 'sys-a': { tasks: [libraryTask] } } };
  const settings = new Map([[SETTING_KEYS.GATHERING_CONFIG, config]]);
  const service = new GatheringRichStateService({
    getSetting: (key) => settings.get(key),
    setSetting: async (key, value) => {
      settings.set(key, value);
      return value;
    },
    settingKey: SETTING_KEYS.GATHERING_CONFIG,
    rollD100: () => 1,
  });
  const composed = service.composeEnvironment(
    {
      id: 'env-a',
      craftingSystemId: 'sys-a',
      name: 'Glade',
      enabled: true,
      selectionMode: 'targeted',
      compositionMode: 'automatic',
      biomes: ['forest'],
      tasks: [],
    },
    { id: 'sys-a', name: 'Wildcraft' }
  );
  return composed.tasks[0];
}

test('a task’s pick survives COMPOSITION and reaches the rolled formula', async () => {
  const routedSlot = {
    routed: {
      rollFormula: '1d20',
      dc: 10,
      thresholdMode: 'meet',
      type: 'relative',
      relativeOutcomes: [{ id: 'o', name: 'Fine', dc: 0, success: true }],
    },
  };
  for (const [checkModifierIds, expected, why] of [
    [['med'], '1d20 + 3[Modifiers]', 'the composed task carries the authored pick'],
    [[], '1d20', 'an authored EMPTY pick survives composition as a pick of zero'],
    [undefined, '1d20 + 5[Modifiers]', 'and an absent one still inherits the default set'],
  ]) {
    const libraryTask = {
      id: 't1',
      name: 'Forage',
      biomes: ['forest'],
      dropRows: [{ id: 'd1', componentId: 'herb', quantity: 1, dropRate: 100 }],
      ...(checkModifierIds === undefined ? {} : { checkModifierIds }),
    };
    const composed = composeTask(libraryTask);
    assert.ok(composed, 'the environment composed the task');
    const rolled = [];
    const restore = stubRoll(rolled);
    try {
      await new GatheringEngine({})._resolveRoutedOutcome({
        actor: ACTOR,
        system: gatheringSystem(routedSlot, { defaultModifierPolicy: 'bySubject' }),
        task: composed,
      });
    } finally {
      restore();
    }
    assert.equal(rolled.at(-1), expected, why);
  }
});

// ── gathering d100 is PROVEN untouched, capably ───────────────────────────────

test('the d100 branch consults NO check-modifier context, and the proof can fail', () => {
  // `d100` rolls a fixed percentage against each drop's chance and authors no formula, so
  // the check-modifier catalogue is inert under it with cause `noCheck`. The assertion is
  // a SOURCE-TEXT scan of the d100 resolution path rather than a behavioural one, because
  // "this code never calls that function" is not observable from a return value.
  //
  // Its capability is demonstrated inline: the same scan applied to the ROUTED path, which
  // DOES consult the context, must find it — so a scan that could never match anything
  // would fail here rather than passing silently over both.
  const source = readFileSync('src/systems/GatheringEngine.js', 'utf8');
  const slice = (from, to) => source.slice(source.indexOf(from), source.indexOf(to));
  const d100Path = slice('async _resolveD100Outcome', 'async _resolveProgressiveOutcome');
  const routedPath = slice('async _resolveRoutedFormulaOutcome', '\n  _resolveGatheringRoutedDc(');
  assert.ok(
    routedPath.includes('buildCheckModifierContext'),
    'the ROUTED path must consult the context, or this scan proves nothing about d100'
  );
  assert.ok(
    !d100Path.includes('buildCheckModifierContext'),
    'the d100 path must not consult it: its arithmetic is percentage-point / multiplicative ' +
      'character modifiers, a different concept with different semantics'
  );
});

// ── eval == display, across the arity change (C3) ─────────────────────────────

test('the LISTED formula and the ROLLED formula resolve the same scalar, under every rule', () => {
  for (const [policy, subjectPick, expected] of [
    ['addAll', null, 5],
    ['highest', null, 3],
    ['playerPicks', null, 5],
    ['bySubject', { craftingModifier: { modifierIds: ['alch'] } }, 2],
    ['bySubject', { craftingModifier: { modifierIds: [] } }, 0],
  ]) {
    const system = {
      modifiers: CATALOGUE,
      craftingCheck: {
        defaultModifierPolicy: policy,
        defaultModifierIds: ['med', 'alch'],
      },
    };
    const recipe = subjectPick ?? {};
    // ONE builder, two paths. `CraftingListingBuilder` and the three engine check runners
    // call this same function at this same arity; a second literal of the same shape on
    // either side is what would let the listed formula and the rolled one disagree.
    const context = buildCheckModifierContext(system, 'crafting', recipe);
    assert.equal(
      resolveCheckModifierContribution(context, makeRollDataExpressionResolver(ACTOR, StubRoll), StubRoll)
        .scalar,
      expected,
      `${policy}: the listed scalar is the rolled scalar`
    );
  }
});

test('the listing builder calls the context builder with an ACTIVITY, not at arity 2', () => {
  // A source pin, because the arity error is invisible from a return value: an arity-2
  // call resolves `activity` to `undefined`, `ACTIVITY_CHECK_KEYS.get(undefined)` misses,
  // and the context silently reads NO selection at all — every rule collapses to `addAll`
  // over an empty set, which is a scalar of 0 and an appended term of nothing. The listed
  // formula would then show a number the roll does not use, on the player-facing card.
  const source = readFileSync('src/systems/CraftingListingBuilder.js', 'utf8');
  assert.match(
    source,
    /buildCheckModifierContext\(\s*system,\s*'crafting',\s*recipe\s*\)/,
    'the display path names its activity explicitly'
  );
});
