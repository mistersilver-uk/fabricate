/**
 * The Checks Studio's outcome-preview simulator (issue 1097).
 *
 * The load-bearing claims here are all NEGATIVE — the preview posts no chat message,
 * shows no prompt and runs no macro — and a negative assertion is worth exactly as much
 * as the proof that it could have failed. So every spy below is FIRST shown to fire on a
 * path that really does call it, and only then asserted silent across a preview. A spy
 * that never fires proves nothing at all, and a "the preview posts nothing" test built on
 * one reads identically from the PR.
 *
 * The macro case is the sharpest of the three, and it is a safety property rather than a
 * limitation. The engine reaches a `dcMode: 'dynamic'` DC by RUNNING the linked macro
 * through `MacroExecutor.run`, which compiles `macro.command` into an `AsyncFunction` and
 * executes it with the current user's authority — guarded only by
 * `typeof command !== 'string'`, which is not a script-type check, because Foundry
 * declares `command` as `required: true, blank: true` on a CHAT macro too. A DC macro
 * that creates a `ChatMessage`, updates an Actor or writes a flag must not be able to do
 * any of that from a preview button.
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  DEFAULT_RECORD_ID,
  NO_ACTOR_ID,
  buildPreviewCheckArgs,
  buildPreviewRecords,
  cloneRollData,
  listPreviewActors,
  resolvePreviewActor,
  runCheckPreview,
  terseBreakdown,
} from '../src/ui/svelte/apps/manager/checks/checkPreview.js';
import {
  resolveRolledFormula,
  runFormulaPassFail,
  runFormulaRouted,
} from '../src/systems/checkRoll.js';
import {
  describeFormulaEnumerability,
  enumeratePassFailOdds,
} from '../src/ui/svelte/apps/manager/checks/checkOdds.js';
import { MacroExecutor } from '../src/utils/MacroExecutor.js';
import { recordedRollDouble } from './helpers/recordedRollParse.js';
import { reduceRollExpression } from '../src/utils/rollExpressionAverage.js';

const repoRoot = resolve(import.meta.dirname, '..');

/** A `Roll` that evaluates a resolved formula deterministically — no entropy anywhere. */
function installRoll({ face = 9 } = {}) {
  const posted = [];
  globalThis.Roll = class {
    static replaceFormulaData(formula, data = {}, { missing = 'NaN' } = {}) {
      return String(formula).replaceAll(/@([\w.]+)/g, (_match, path) => {
        const value = String(path)
          .split('.')
          .reduce((current, part) => (current == null ? undefined : current[part]), data);
        return value === undefined || value === null ? missing : String(value);
      });
    }

    static validate(formula) {
      return !/NaN|@/.test(String(formula));
    }

    // Delegated to the RECORDING rather than modelled here (issue 1097): the joint
    // histogram/simulator case below asks the enumerator's predicate a question, and a
    // second hand-written parse would grade it against this branch's own beliefs. One
    // engine serves both halves, which is also the point of that case.
    static parse(formula, data) {
      return recordedRollDouble().parse(formula, data);
    }

    constructor(formula, data = {}) {
      this.formula = String(formula);
      this.data = data;
      this.dice = [];
      this.terms = [];
    }

    // REDUCED, never summed by regex. The previous version masked the flavour and added up
    // every number it could see, which reads `min(max((1d8), -1), 6)` as `9 - 1 + 6` — so a
    // clamped rolling check modifier gave the simulator a total no roll can produce, and the
    // histogram beside it would have been graded against that. `reduceRollExpression` is the
    // shipped walk, pinned to one face per die, so this double rolls what Foundry rolls.
    async evaluate() {
      const resolved = Roll.replaceFormulaData(this.formula, this.data, { missing: '0' });
      const { value } = reduceRollExpression(resolved, {
        dieValue: ({ count, faces }) => {
          const number = Number.isFinite(count) ? count : 1;
          const sides = Number(faces);
          if (!Number.isInteger(sides)) return undefined;
          const results = Array.from({ length: number }, () => ({ result: face, active: true }));
          this.dice.push({ number, faces: sides, results, total: face * number });
          return face * number;
        },
      });
      this.total = value;
      return this;
    }

    async toMessage(data) {
      posted.push(data);
      return data;
    }
  };
  globalThis.Roll.posted = posted;
  return posted;
}

const ACTOR = {
  id: 'actor-sera',
  name: 'Sera Vane',
  getRollData: () => ({ prof: 3, abilities: { str: { mod: 2 } } }),
};
const ACTOR_WITHOUT_PROF = { id: 'actor-bare', name: 'Bare', getRollData: () => ({}) };

const ROUTED_DRAFT = {
  rollFormula: '1d20 + @prof',
  dc: 12,
  thresholdMode: 'meet',
  type: 'relative',
  relativeOutcomes: [
    { id: 'ruined', name: 'Ruined', dc: -10, success: false },
    { id: 'success', name: 'Success', dc: 0, success: true },
    { id: 'fine', name: 'Fine', dc: 5, success: true },
  ],
  fixedOutcomes: [],
  checkBreakage: { triggers: [] },
  tiers: [
    { id: 'uncommon', name: 'Uncommon Craft', dc: 12 },
    { id: 'rare', name: 'Rare Craft', dc: 18 },
  ],
};

let chatSpy;

beforeEach(() => {
  chatSpy = [];
  installRoll();
  globalThis.ChatMessage = {
    create: (data) => {
      chatSpy.push(data);
      return data;
    },
  };
});

afterEach(() => {
  delete globalThis.Roll;
  delete globalThis.ChatMessage;
  delete globalThis.fromUuid;
});

describe('checkPreview: it drives the engine runners rather than reimplementing them', () => {
  it('assembles the routed arg bag with rollOptions explicitly null', () => {
    const plan = buildPreviewCheckArgs({
      activity: 'crafting',
      mode: 'routed',
      draft: ROUTED_DRAFT,
      system: null,
      actor: ACTOR,
      record: { id: 'rare', name: 'Rare Craft', dc: 18 },
    });
    assert.equal(plan.kind, 'routed');
    assert.equal(plan.dc, 18, 'the PREVIEWED RECORD supplies the DC, not the check default');
    assert.equal(plan.args.rollOptions, null);
    assert.equal(plan.args.clampToNearest, true, 'every routed caller in the product opts in');
    assert.equal(plan.args.minOutcomeId, null);
    assert.deepEqual(plan.args.relativeOutcomes, ROUTED_DRAFT.relativeOutcomes);
  });

  it('produces the SAME result object the engine runner produces for the same bag', async () => {
    const plan = buildPreviewCheckArgs({
      activity: 'crafting',
      mode: 'routed',
      draft: ROUTED_DRAFT,
      system: null,
      actor: ACTOR,
      record: { id: 'uncommon', name: 'Uncommon Craft', dc: 12 },
    });
    const previewed = await runCheckPreview(plan);
    const direct = await runFormulaRouted(plan.args);
    assert.deepEqual(previewed, direct, 'field for field, because it IS the same call');
    assert.equal(previewed.outcome, 'Success', '9 + 3 = 12 meets the Success threshold');
  });

  it('returns null when the mode rolls nothing, or when no formula is authored', async () => {
    const noCheck = buildPreviewCheckArgs({
      activity: 'crafting',
      mode: 'none',
      draft: ROUTED_DRAFT,
      system: null,
    });
    assert.equal(noCheck.kind, null);
    assert.equal(await runCheckPreview(noCheck), null);

    const noFormula = buildPreviewCheckArgs({
      activity: 'crafting',
      mode: 'simple',
      draft: { rollFormula: '   ', dc: 12 },
      system: null,
    });
    assert.equal(await runCheckPreview(noFormula), null);
  });

  it('appends tool bonus terms for crafting and salvage, and NOT for gathering', () => {
    const terms = [{ value: 3, label: 'Rune Stylus' }];
    const shared = { mode: 'simple', draft: { rollFormula: '1d20', dc: 10 }, system: null };
    assert.equal(
      buildPreviewCheckArgs({ ...shared, activity: 'crafting', toolTerms: terms }).formula,
      '1d20 + 3[Rune Stylus]'
    );
    assert.equal(
      buildPreviewCheckArgs({ ...shared, activity: 'salvage', toolTerms: terms }).formula,
      '1d20 + 3[Rune Stylus]'
    );
    assert.equal(
      buildPreviewCheckArgs({ ...shared, activity: 'gathering', toolTerms: terms }).formula,
      '1d20',
      'gathering has no tool-bonus seam at all'
    );
  });
});

describe('checkPreview: it posts nothing and prompts for nothing', () => {
  it('SPY CHECK — the same runner DOES post to chat on an interactive roll', async () => {
    // Non-vacuity, proven rather than asserted. If this ever stops firing, the negative
    // assertion below is measuring nothing.
    let prompted = 0;
    await runFormulaPassFail({
      formula: '1d20 + @prof',
      dc: 10,
      thresholdMode: 'meet',
      triggers: [],
      actor: ACTOR,
      rollOptions: {
        interactive: true,
        prompt: async () => {
          prompted += 1;
          return { confirmed: true };
        },
      },
    });
    assert.equal(prompted, 1, 'the interactive path opens the prompt');
    assert.equal(chatSpy.length, 0, 'ChatMessage.create is reached through roll.toMessage');
    assert.equal(globalThis.Roll.posted.length, 1, 'and toMessage IS called on that path');
  });

  it('the preview reaches neither the prompt nor toMessage', async () => {
    globalThis.Roll.posted.length = 0;
    const plan = buildPreviewCheckArgs({
      activity: 'crafting',
      mode: 'routed',
      draft: ROUTED_DRAFT,
      system: null,
      actor: ACTOR,
      record: { id: 'uncommon', dc: 12 },
    });
    // A prompt on the bag would be a prompt on screen. `rollOptions: null` spreads to `{}`,
    // so there is no `interactive`, no `prompt` and no `speaker` for one to be built from.
    assert.equal(plan.args.rollOptions, null);
    await runCheckPreview(plan);
    assert.equal(globalThis.Roll.posted.length, 0, 'no chat card');
    assert.equal(chatSpy.length, 0, 'and nothing created directly either');
  });
});

describe('checkPreview: it NEVER executes a DC macro', () => {
  it('SPY CHECK — a real DC macro path resolves the uuid and runs the command', async () => {
    let resolved = 0;
    let ran = 0;
    globalThis.fromUuid = async (uuid) => {
      resolved += 1;
      assert.equal(uuid, 'Macro.dc-macro');
      return {
        type: 'script',
        command:
          'globalThis.__previewMacroRan = (globalThis.__previewMacroRan ?? 0) + 1; return 19;',
      };
    };
    const dc = await MacroExecutor.run('Macro.dc-macro', {});
    ran = globalThis.__previewMacroRan ?? 0;
    delete globalThis.__previewMacroRan;
    assert.equal(resolved, 1, 'the spy fires when a macro really is resolved');
    assert.equal(ran, 1, 'and the command really does execute');
    assert.equal(dc, 19);
  });

  it('previews a dynamic DC against the STATIC fallback and never touches the macro', async () => {
    globalThis.fromUuid = () => {
      assert.fail('the preview resolved a macro uuid');
    };
    const draft = {
      ...ROUTED_DRAFT,
      dcMode: 'dynamic',
      macroUuid: 'Macro.dc-macro',
      dc: 14,
      tiers: [],
    };
    const plan = buildPreviewCheckArgs({
      activity: 'crafting',
      mode: 'simple',
      draft,
      system: null,
      actor: ACTOR,
      record: null,
    });
    assert.equal(plan.dynamicDc, true, 'the readout is told to state that it did not run it');
    assert.equal(
      plan.dc,
      14,
      'the authored static fallback, which is what the engine falls back to'
    );
    const result = await runCheckPreview(plan);
    assert.equal(result.data.dc, 14);
  });

  it('names no macro machinery at all, so there is no path for one to be added down', () => {
    const source = readFileSync(
      resolve(repoRoot, 'src/ui/svelte/apps/manager/checks/checkPreview.js'),
      'utf8'
    );
    // The SOURCE contract, because the spy above can only cover the paths a test drives.
    const code = source.slice(source.indexOf('import '));
    assert.ok(!code.includes('MacroExecutor'), 'no MacroExecutor import or call');
    assert.ok(!code.includes('fromUuid'), 'and no uuid resolution of its own');
  });
});

describe('checkPreview: unresolved roll data is surfaced, never silently zeroed', () => {
  it('reports resolved:false for an @ key the previewed actor lacks', async () => {
    const { resolveCheckFormulaDisplay } = await import('../src/systems/checkRoll.js');
    assert.equal(resolveCheckFormulaDisplay('1d20 + @prof', ACTOR).resolved, true);
    assert.equal(resolveCheckFormulaDisplay('1d20 + @prof', ACTOR_WITHOUT_PROF).resolved, false);
    assert.equal(resolveCheckFormulaDisplay('1d20 + @prof', null).resolved, false, 'no actor too');
  });

  it('still ROLLS a total for that formula, which is exactly why the warning is needed', async () => {
    const plan = buildPreviewCheckArgs({
      activity: 'crafting',
      mode: 'simple',
      draft: { rollFormula: '1d20 + @prof', dc: 10, thresholdMode: 'meet', checkBreakage: null },
      system: null,
      actor: ACTOR_WITHOUT_PROF,
    });
    const result = await runCheckPreview(plan);
    assert.equal(result.data.total, 9, 'the missing key contributed 0 and the total is plausible');
    assert.equal(result.success, false, 'and the wrong number is ON the result object');
  });
});

describe('checkPreview: the actor and record selection', () => {
  it('lists game.actors UNFILTERED, because the Studio is GM-only', () => {
    const actors = listPreviewActors({
      getActors: () => [
        { id: 'a', name: 'Owned' },
        { id: 'b', name: 'Unowned', isOwner: false },
        { id: 'c', name: 'Someone else’s', ownership: { default: 0 } },
      ],
    });
    assert.deepEqual(
      actors.map((actor) => actor.id),
      ['a', 'b', 'c'],
      'a player-side "assigned character OR owner" union would be the wrong shape here'
    );
  });

  it('resolves "No actor" to null rather than to a lookup', () => {
    const lookup = () => assert.fail('the empty selection reached the actor lookup');
    assert.equal(resolvePreviewActor(NO_ACTOR_ID, { getActor: lookup }), null);
    assert.equal(resolvePreviewActor('', { getActor: lookup }), null);
    assert.equal(resolvePreviewActor('a', { getActor: () => ({ id: 'a' }) }).id, 'a');
  });

  it('offers the check DEFAULT first and then every authored recipe tier', () => {
    const records = buildPreviewRecords({ check: ROUTED_DRAFT, defaultLabel: 'Default' });
    assert.deepEqual(
      records.map((record) => [record.id, record.dc]),
      [
        [DEFAULT_RECORD_ID, 12],
        ['uncommon', 12],
        ['rare', 18],
      ]
    );
  });

  it('still offers a record when the check has authored no tiers at all', () => {
    const records = buildPreviewRecords({ check: { dc: 15 }, defaultLabel: 'Default' });
    assert.equal(records.length, 1);
    assert.equal(records[0].dc, 15);
  });

  it('carries a DC and NOTHING ELSE — a record is not an outcome (issue 1097)', () => {
    // The `difficulties` slot this used to emit was a seam for the progressive award-count
    // histogram, on the assumption that its ordered result difficulties would arrive on a
    // record. They do not: that order is sandbox state ON THE CHECK, so the slot was an
    // empty array every caller read as "no record has one" — a shape claiming a capability
    // nothing could ever fill.
    for (const record of buildPreviewRecords({ check: ROUTED_DRAFT, defaultLabel: 'Default' })) {
      assert.deepEqual(Object.keys(record).toSorted(), ['dc', 'id', 'name']);
    }
  });

  it('treats the actor roll data as read-only by cloning before any augmentation', () => {
    const live = { prof: 3, abilities: { str: { mod: 2 } } };
    const actor = { getRollData: () => live };
    const clone = cloneRollData(actor);
    clone.prof = 99;
    clone.abilities.str.mod = 99;
    assert.equal(live.prof, 3, 'Foundry returns the LIVE system object; nothing here writes to it');
    assert.equal(live.abilities.str.mod, 2, 'and the clone is deep enough to say so');
  });
});

describe('checkPreview: the terse breakdown line', () => {
  it('reads the faces and the signed remainder, not the full resolved formula', () => {
    const result = {
      data: {
        total: 19,
        resolvedFormula: '1d20 + 3 + 7[Modifiers]',
        diceGroups: [{ groupId: 0, group: '1d20', sum: 9, results: [9] }],
      },
    };
    assert.equal(terseBreakdown(result, 'Sera Vane'), 'd20 9 +10 · Sera Vane');
    assert.equal(terseBreakdown(result), 'd20 9 +10', 'the actor name is optional');
  });

  it('omits a zero remainder rather than printing "+0"', () => {
    const result = {
      data: { total: 9, diceGroups: [{ groupId: 0, group: '1d20', sum: 9, results: [9] }] },
    };
    assert.equal(terseBreakdown(result), 'd20 9');
  });

  it('says nothing at all when there is no result to describe', () => {
    assert.equal(terseBreakdown(null), '');
  });
});

// ── The histogram and the simulator must describe ONE formula (issue 1097) ─────────────
//
// THIS IS THE CASE WHOSE ABSENCE LET THE DEFECT SHIP. `buildPreviewCheckArgs` hands the
// runner an AUTHORED formula plus a `craftingModifier` context, and `evaluateCheckRoll`
// appends the resolved scalar itself — so an enumerator that charted the authored string
// drew `1..20` beside a readout rolling `5..24`, for the same check, at the same moment.
// Every existing case used an EMPTY catalogue, under which the scalar is `0` and the
// append is a no-op, so all of them passed on both sides of the bug. Nothing published was
// wrong only because every View Lab check also resolved a zero scalar, which is luck.
//
// So the fixture below is deliberately the opposite: a NON-EMPTY catalogue with a NON-ZERO
// resolved scalar, asserted to be non-zero before anything else is claimed.
describe('checkPreview: the histogram enumerates the formula the simulator rolls', () => {
  /** The inclusive range of totals an enumerated space reaches. */
  function domainOf(verdict) {
    const totals = verdict.outcomes.map((outcome) => outcome.total);
    return { min: Math.min(...totals), max: Math.max(...totals) };
  }

  /** A system whose crafting check applies one catalogued modifier worth a flat +2. */
  const SYSTEM_WITH_CATALOGUE = {
    // `system.modifiers` since issue 1117: the ONE authored modifier library.
    modifiers: [{ id: 'mod-kit', label: 'Kit', expression: '2' }],
    craftingCheck: { defaultModifierPolicy: 'addAll', defaultModifierIds: ['mod-kit'] },
  };

  /** The plan every case here previews: `1d20`, one tool term, one catalogue modifier. */
  function planWithCatalogue() {
    return buildPreviewCheckArgs({
      activity: 'crafting',
      mode: 'simple',
      draft: { rollFormula: '1d20', dc: 12, thresholdMode: 'meet' },
      system: SYSTEM_WITH_CATALOGUE,
      actor: ACTOR,
      toolTerms: [{ value: 3, label: 'Tools' }],
    });
  }

  it('NON-VACUITY: the catalogue resolves a non-zero scalar the arg bag does NOT carry', () => {
    installRoll({ face: 9 });
    const plan = planWithCatalogue();
    assert.equal(plan.formula, '1d20 + 3[Tools]', 'the arg bag carries the TOOL append only');
    assert.equal(
      resolveRolledFormula(plan.formula, ACTOR, plan.args.craftingModifier),
      '1d20 + 3[Tools] + 2[Modifiers]',
      'and the runner appends a real, non-zero modifier term on top of it'
    );
  });

  it('enumerates the SIMULATOR’S OWN resolved formula, field for field', async () => {
    installRoll({ face: 9 });
    const plan = planWithCatalogue();
    const result = await runCheckPreview(plan);
    const verdict = describeFormulaEnumerability(plan.formula, ACTOR, {
      craftingModifier: plan.args.craftingModifier,
    });
    assert.equal(verdict.enumerable, true, `enumerable (got ${verdict.reason})`);
    assert.equal(
      verdict.display,
      result.data.resolvedFormula,
      'the enumerated formula IS the one the runner resolved and rolled'
    );
    assert.deepEqual(
      domainOf(verdict),
      { min: 6, max: 25 },
      '3 from the tool term and 2 from the catalogue move the whole domain'
    );
  });

  it('puts the simulator’s rolled total INSIDE the enumerated domain', async () => {
    installRoll({ face: 9 });
    const plan = planWithCatalogue();
    const result = await runCheckPreview(plan);
    const verdict = describeFormulaEnumerability(plan.formula, ACTOR, {
      craftingModifier: plan.args.craftingModifier,
    });
    const domain = domainOf(verdict);
    assert.deepEqual(domain, { min: 6, max: 25 });
    assert.equal(result.data.total, 14, 'a natural 9 plus the two appended terms');
    assert.ok(
      result.data.total >= domain.min && result.data.total <= domain.max,
      `the rolled total ${result.data.total} must be a total the histogram counted`
    );
  });

  it('and the BUCKETS move with the scalar, not merely the domain', () => {
    installRoll({ face: 9 });
    const plan = planWithCatalogue();
    const withCatalogue = enumeratePassFailOdds({
      outcomes: describeFormulaEnumerability(plan.formula, ACTOR, {
        craftingModifier: plan.args.craftingModifier,
      }).outcomes,
      args: { dc: 12, comparison: 'meet', triggers: [] },
    });
    const withoutIt = enumeratePassFailOdds({
      outcomes: describeFormulaEnumerability(plan.formula, ACTOR).outcomes,
      args: { dc: 12, comparison: 'meet', triggers: [] },
    });
    assert.notDeepEqual(
      withCatalogue.map((row) => [row.id, row.count]),
      withoutIt.map((row) => [row.id, row.count]),
      'a histogram blind to the scalar reports a different chance of success'
    );
  });

  // ── A MODIFIER THAT ROLLS, WITH BOUNDS ───────────────────────────────────────────
  //
  // The flat case above is the easy half. A check modifier may ROLL, and its bounds are
  // expressed IN the formula rather than around it — `min(max((1d8), -1), 6)[Modifiers]` —
  // so the appended term is a function term with a die inside it. Two things go wrong at
  // once for an enumerator that reads the string instead of the expression:
  //
  //   1. The clamp's BOUND ARGUMENTS `-1` and `6` are read as flat addends of the roll, so
  //      the whole domain shifts by `+5`.
  //   2. The modifier's die is read as a plain group of its own, so the enumerated space is
  //      `1d20` convolved with a full `1d8` rather than with the `1..6` the clamp allows —
  //      two faces too wide.
  //
  // Neither shows up as a crash, an empty panel or a misshapen chart. The histogram stays
  // monotone, correctly ordered and plausibly labelled, and is simply wrong. So it is graded
  // against an ORACLE computed here from first principles, not against the enumerator's own
  // arithmetic re-spelled.
  /** A system whose crafting check applies one catalogued modifier that ROLLS `1d8`, clamped to `[-1, 6]`. */
  const SYSTEM_WITH_ROLLING_CATALOGUE = {
    modifiers: [{ id: 'mod-charm', label: 'Charm', expression: '1d8', min: -1, max: 6 }],
    craftingCheck: { defaultModifierPolicy: 'addAll', defaultModifierIds: ['mod-charm'] },
  };

  function planWithRollingCatalogue() {
    return buildPreviewCheckArgs({
      activity: 'crafting',
      mode: 'simple',
      draft: { rollFormula: '1d20', dc: 12, thresholdMode: 'meet' },
      system: SYSTEM_WITH_ROLLING_CATALOGUE,
      actor: ACTOR,
      toolTerms: [{ value: 3, label: 'Tools' }],
    });
  }

  it('NON-VACUITY: the rolling catalogue appends a CLAMPED DIE, not a scalar', () => {
    installRoll({ face: 9 });
    const plan = planWithRollingCatalogue();
    assert.equal(
      resolveRolledFormula(plan.formula, ACTOR, plan.args.craftingModifier),
      '1d20 + 3[Tools] + min(max((1d8), -1), 6)[Modifiers]',
      'the bounds are IN the formula, which is what puts a die inside a function term'
    );
  });

  it('enumerates a CLAMPED DICE modifier exactly, against an independent oracle', () => {
    installRoll({ face: 9 });
    const plan = planWithRollingCatalogue();
    const verdict = describeFormulaEnumerability(plan.formula, ACTOR, {
      craftingModifier: plan.args.craftingModifier,
    });
    assert.equal(verdict.enumerable, true, `enumerable (got ${verdict.reason})`);
    assert.deepEqual(verdict.dice, [{ faces: 20 }, { faces: 8 }], 'both dice, in reading order');
    assert.equal(verdict.combinations, 160);

    // THE ORACLE. Computed from the clamp's own definition rather than from anything the
    // module under test does, so a bug shared between the enumerator and this expectation is
    // not possible.
    const oracle = new Map();
    for (let d20 = 1; d20 <= 20; d20 += 1) {
      for (let d8 = 1; d8 <= 8; d8 += 1) {
        const total = d20 + 3 + Math.min(Math.max(d8, -1), 6);
        oracle.set(total, (oracle.get(total) ?? 0) + 1);
      }
    }
    const enumerated = new Map();
    for (const outcome of verdict.outcomes) {
      enumerated.set(outcome.total, (enumerated.get(outcome.total) ?? 0) + 1);
    }
    assert.deepEqual(
      [...enumerated].toSorted(([a], [b]) => a - b),
      [...oracle].toSorted(([a], [b]) => a - b),
      'every total, and how often it comes up'
    );
    assert.deepEqual(domainOf(verdict), { min: 5, max: 29 }, '1+3+1 up to 20+3+6');
  });

  it('and the two ways of getting it wrong are BOTH excluded, by number', () => {
    // The negative control the case above needs. `{ min: 5, max: 29 }` on its own is a
    // number a wrong enumerator could stumble onto; these are the two specific wrong answers
    // a string scan produces, stated so that landing on either fails here by name.
    installRoll({ face: 9 });
    const plan = planWithRollingCatalogue();
    const domain = domainOf(
      describeFormulaEnumerability(plan.formula, ACTOR, {
        craftingModifier: plan.args.craftingModifier,
      })
    );
    assert.notDeepEqual(
      domain,
      { min: 12, max: 36 },
      'NOT `1d20 ⊕ 1d8` with the bounds -1 and 6 added as flat addends (+8 on top of the tools)'
    );
    assert.notDeepEqual(
      domain,
      { min: 5, max: 31 },
      'NOT the unclamped `1d8`, whose top face reaches two further than the clamp allows'
    );
  });

  it('and the SIMULATOR lands inside that space, which is the claim the name makes', async () => {
    // The whole point of the suite: the histogram and the readout describe ONE formula. The
    // runner rolls a 9 on every die here, so its total is `9 + 3 + min(max(9, -1), 6) = 18`
    // — the clamp biting is itself observable, because an unclamped 9 would total 21.
    installRoll({ face: 9 });
    const plan = planWithRollingCatalogue();
    const result = await runCheckPreview(plan);
    const verdict = describeFormulaEnumerability(plan.formula, ACTOR, {
      craftingModifier: plan.args.craftingModifier,
    });
    assert.equal(verdict.display, result.data.resolvedFormula, 'ONE formula, both surfaces');
    assert.equal(result.data.total, 18, 'the clamp holds the modifier at +6');
    assert.ok(
      verdict.outcomes.some((outcome) => outcome.total === result.data.total),
      `the rolled total ${result.data.total} must be a total the histogram counted`
    );
  });

  it('does NOT double-apply it: the tool term is appended ONCE, above the runner', async () => {
    // The mirror risk, and the reason this is asserted rather than assumed.
    // `CraftingEngine._appendToolCheckBonuses` rewrites the formula BEFORE calling
    // `evaluateCheckRoll`, and the runner appends no tool term of its own — so the
    // preview appending them in `buildPreviewCheckArgs` is the engine's own shape, and
    // the enumerator layering only the MODIFIER on top matches it exactly. A runner that
    // also appended tools would show up here as a `+ 3[Tools]` twice over.
    installRoll({ face: 9 });
    const plan = planWithCatalogue();
    const result = await runCheckPreview(plan);
    assert.equal(
      [...result.data.resolvedFormula.matchAll(/\[Tools]/g)].length,
      1,
      'exactly one tool term reaches the roll'
    );
    assert.equal([...result.data.resolvedFormula.matchAll(/\[Modifiers]/g)].length, 1);
  });

  it('appends NO situational bonus, because a preview is never interactive', async () => {
    // The third append the runner knows about. It lives inside `options.interactive ===
    // true`, and `rollOptions: null` spreads to `{}` — so the preview cannot reach it and
    // the enumerator has nothing to mirror. Proved by a prompt that WOULD add +100 and is
    // never called, with the same prompt then shown to fire on an interactive roll.
    installRoll({ face: 9 });
    let prompted = 0;
    const prompt = async () => {
      prompted += 1;
      return { confirmed: true, bonus: '+100' };
    };
    const plan = planWithCatalogue();
    plan.args.prompt = prompt;
    const preview = await runCheckPreview(plan);
    assert.equal(prompted, 0, 'the preview never prompts');
    assert.equal(preview.data.total, 14, 'so no situational bonus can be in the total');

    const interactive = await runFormulaPassFail({
      ...plan.args,
      rollOptions: { interactive: true, prompt },
    });
    assert.equal(prompted, 1, 'the same prompt DOES fire on an interactive roll');
    assert.equal(
      interactive.data.total,
      114,
      'so the silence above is a fact about the preview, not about a dead prompt'
    );
  });
});
