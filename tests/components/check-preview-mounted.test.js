/**
 * The Checks Studio's simulator, odds histogram and previewed record, MOUNTED (issue 1097).
 *
 * The unit suites (`tests/check-preview.test.js`, `tests/check-odds.test.js`) grade the
 * two modules. What can only be graded here is the WIRING: that the rail's "Preview as"
 * selection is the same selection the Outcomes section's band strip is drawn against, that
 * the roll button reaches the engine's own runner, and that the readout renders what came
 * back rather than a parallel model.
 *
 * The record binding is the one worth stating. Issue 1096 shipped `ThresholdBandStrip`
 * with a `previewLabel` prop NO CALLER SUPPLIED, so the strip announced against the check's
 * own DC and its group label named no record at all — a prop forwarded as `''` from every
 * call site is a claim the surface cannot honour. Both halves of that are asserted below:
 * the label reaches the strip, and switching records MOVES the ticks.
 */
import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { flushSync, tick } from 'svelte';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import {
  CHECKS_TREE_COMPILED_MODULES,
  CHECKS_TREE_RAW_MODULES,
} from '../helpers/checksHarnessModules.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-check-preview-',
  rawModules: [
    ...CHECKS_TREE_RAW_MODULES,
    'src/ui/svelte/actions/dragDrop.js',
    'src/ui/svelte/util/dropUtils.js',
    'src/utils/macroReference.js',
  ],
  compiledModules: [
    ...CHECKS_TREE_COMPILED_MODULES,
    'src/ui/svelte/apps/manager/ItemDropZone.svelte',
    'src/ui/svelte/apps/manager/SegmentedControl.svelte',
    // The three cards issue 1096 split out of the editors this route mounts.
    'src/ui/svelte/apps/manager/checks/CheckModeCallout.svelte',
    'src/ui/svelte/apps/manager/checks/CheckDcMacroCard.svelte',
    'src/ui/svelte/apps/manager/checks/CheckDifficultyCard.svelte',
    'src/ui/svelte/apps/manager/checks/CheckFormulaFields.svelte',
    'src/ui/svelte/apps/manager/checks/CheckRecipeTiers.svelte',
    'src/ui/svelte/apps/manager/checks/CheckTriggers.svelte',
    'src/ui/svelte/apps/manager/checks/CraftingCheckEditor.svelte',
    'src/ui/svelte/apps/manager/checks/SimpleCraftingCheckEditor.svelte',
    'src/ui/svelte/apps/manager/checks/ProgressiveCraftingCheckEditor.svelte',
    'src/ui/svelte/apps/manager/checks/CheckAwardMode.svelte',
    'src/ui/svelte/apps/manager/checks/ChecksView.svelte',
  ],
  componentPath: 'src/ui/svelte/apps/manager/checks/ChecksView.svelte',
});

/** Two world actors, so "unfiltered `game.actors`" is observable rather than asserted. */
const WORLD_ACTORS = [
  { id: 'sera', name: 'Sera Vane', getRollData: () => ({ prof: 3 }) },
  { id: 'bare', name: 'Bare Hands', getRollData: () => ({}) },
];

/** A `Roll` that always rolls the same face — a preview must be reproducible in a test. */
function installRoll(face) {
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

    static parse(formula, data = {}) {
      const replaced = globalThis.Roll.replaceFormulaData(formula, data, { missing: '0' });
      const match = /(\d*)d(\d+)/i.exec(replaced);
      if (!match) throw new SyntaxError(`no die in ${replaced}`);
      const faces = Number(match[2]);
      return [
        {
          faces,
          number: match[1] === '' ? 1 : Number(match[1]),
          denomination: `d${faces}`,
          modifiers: [],
          isDeterministic: false,
        },
        ...[...replaced.replaceAll(/\[[^\]]*]/g, '').matchAll(/(\d+)/g)].slice(1).flatMap(() => [
          { class: 'OperatorTerm', isDeterministic: true },
          { class: 'NumericTerm', isDeterministic: true },
        ]),
      ];
    }

    constructor(formula, data = {}) {
      this.formula = String(formula);
      this.data = data;
      this.dice = [];
    }

    async evaluate() {
      const resolved = globalThis.Roll.replaceFormulaData(this.formula, this.data, {
        missing: '0',
      });
      const masked = resolved.replaceAll(/\[[^\]]*]/g, '');
      const rolled = masked.replaceAll(/(\d*)d(\d+)/gi, (_match, count, sides) => {
        const number = count === '' ? 1 : Number(count);
        this.dice.push({
          number,
          faces: Number(sides),
          total: face * number,
          results: Array.from({ length: number }, () => ({ result: face, active: true })),
        });
        return String(face * number);
      });
      let total = 0;
      for (const [, sign, value] of rolled.matchAll(/([+-]?)\s*(\d+)/g)) {
        total += (sign === '-' ? -1 : 1) * Number(value);
      }
      this.total = total;
      return this;
    }

    async toMessage() {
      assert.fail('the preview posted a chat message');
    }
  };
}

before(async () => {
  await harness.setup();
  globalThis.game.actors = {
    contents: WORLD_ACTORS,
    get: (id) => WORLD_ACTORS.find((a) => a.id === id),
  };
  installRoll(9);
});
after(() => {
  delete globalThis.Roll;
  harness.teardown();
});
afterEach(() => harness.remount());

const ROUTED_CHECK = {
  rollFormula: '1d20 + @prof',
  dc: 12,
  thresholdMode: 'meet',
  type: 'relative',
  relativeOutcomes: [
    { id: 'ruined', name: 'Ruined', dc: -10, success: false },
    { id: 'flawed', name: 'Flawed', dc: -5, success: false },
    { id: 'success', name: 'Success', dc: 0, success: true },
    { id: 'fine', name: 'Fine', dc: 5, success: true },
  ],
  fixedOutcomes: [],
  checkBreakage: { triggers: [] },
  tiers: [
    { id: 'uncommon', name: 'Uncommon Craft', dc: 12 },
    { id: 'rare', name: 'Rare Craft', dc: 20 },
  ],
};

const SIMPLE_CHECK = {
  rollFormula: '1d20 + @prof',
  dc: 10,
  thresholdMode: 'meet',
  dcMode: 'static',
  checkBreakage: { triggers: [] },
  tiers: [],
};

async function mountChecks(props = {}) {
  return harness.mount({
    activity: 'crafting',
    resolutionMode: 'routedByCheck',
    craftingCheck: ROUTED_CHECK,
    activation: { crafting: { enabled: true, optional: false } },
    features: { salvage: false },
    ...props,
  });
}

/** Let Svelte's effects settle. The harness exposes no tick of its own. */
async function settle() {
  flushSync();
  await tick();
  flushSync();
}

/** Set a `<select>`'s value the way a GM does, then let Svelte settle. */
async function choose(select, value) {
  select.value = value;
  select.dispatchEvent(new globalThis.Event('change', { bubbles: true }));
  await settle();
}

describe('the Preview-as control (issue 1096 shipped it as a SLOT; this fills it)', () => {
  it('offers every world actor, unfiltered, behind an explicit "No actor" option', async () => {
    const root = await mountChecks();
    const select = root.querySelector('[data-checks-preview-actor]');
    assert.ok(select, 'the actor selector is a real control');
    assert.deepEqual(
      [...select.options].map((option) => option.value),
      ['', 'sera', 'bare']
    );
    assert.equal(select.value, '', '"No actor" is the resting selection');
  });

  it('offers the check default and every authored recipe tier as records', async () => {
    const root = await mountChecks();
    const select = root.querySelector('[data-checks-preview-record]');
    assert.deepEqual(
      [...select.options].map((option) => option.textContent.trim()),
      ['Default · DC 12', 'Uncommon Craft · DC 12', 'Rare Craft · DC 20']
    );
  });
});

describe('the previewed record drives the band strip, not the check’s own DC', () => {
  it('names the record in the strip’s GROUP label', async () => {
    const root = await mountChecks({ requestedSection: 'outcomes', requestedSectionNonce: 1 });
    await choose(root.querySelector('[data-checks-preview-record]'), 'rare');
    const track = root.querySelector('[data-band-strip-track]');
    assert.match(
      track.getAttribute('aria-label'),
      /Rare Craft/,
      'the group label names the previewed record'
    );
  });

  it('carries BOTH readings in aria-valuetext, absolute and offset', async () => {
    const root = await mountChecks({ requestedSection: 'outcomes', requestedSectionNonce: 1 });
    await choose(root.querySelector('[data-checks-preview-record]'), 'rare');
    const handle = root.querySelector('[data-band-strip-handle="0"]');
    assert.equal(
      handle.getAttribute('aria-valuetext'),
      '15 — DC -5 against Rare Craft',
      'DC 20 with a −5 offset reads 15, and the row’s own stepper still says −5'
    );
  });

  it('MOVES every tick when the record changes, with no data change at all', async () => {
    const root = await mountChecks({ requestedSection: 'outcomes', requestedSectionNonce: 1 });
    const ticks = () =>
      [...root.querySelectorAll('[data-band-strip-handle]')].map((handle) =>
        handle.getAttribute('aria-valuenow')
      );
    await choose(root.querySelector('[data-checks-preview-record]'), 'uncommon');
    const atTwelve = ticks();
    await choose(root.querySelector('[data-checks-preview-record]'), 'rare');
    assert.deepEqual(atTwelve, ['7', '12', '17']);
    assert.deepEqual(ticks(), ['15', '20', '25'], 'the same offsets against a DC of 20');
  });

  it('is ONE selection: the Outcomes card’s own PREVIEW AGAINST writes the rail’s', async () => {
    // The Outcomes card ships its own record selector, on the stated reading that the record
    // is the bands' subject and the actor is the rail's. Both halves of that are right; a
    // SECOND COPY OF THE STATE is not, because the simulator this change ships previews
    // against the same record. Two copies is how a strip anchored to `Rare Craft` comes to
    // sit beside a readout rolling against `Uncommon Craft`, on one screen, with no data
    // change between them — the same class of defect as a histogram that charts a formula
    // nothing rolls. So the selection is the route's, and both controls report to it.
    const root = await mountChecks({ requestedSection: 'outcomes', requestedSectionNonce: 1 });
    await choose(root.querySelector('[data-preview-against-select]'), 'rare');
    assert.equal(
      root.querySelector('[data-checks-preview-record]').value,
      'rare',
      'two controls, one state — the simulator and the strip cannot read different records'
    );
  });

  it('and the rail’s writes the Outcomes card’s, which is the other direction', async () => {
    // Asserted separately because ONE state and TWO independent states are only told apart by
    // driving both ends: a card that merely reported upward without reading back would pass
    // the case above and still drift the moment the rail was used.
    const root = await mountChecks({ requestedSection: 'outcomes', requestedSectionNonce: 1 });
    await choose(root.querySelector('[data-checks-preview-record]'), 'rare');
    assert.equal(root.querySelector('[data-preview-against-select]').value, 'rare');
  });
});

describe('the outcome-preview readout', () => {
  it('renders the pre-roll state until the GM rolls', async () => {
    const root = await mountChecks();
    assert.ok(root.querySelector('[data-checks-simulator-state="pre-roll"]'));
    assert.ok(!root.querySelector('[data-checks-simulator-readout]'));
  });

  it('rolls through the engine runner and renders what came back', async () => {
    const root = await mountChecks();
    await choose(root.querySelector('[data-checks-preview-actor]'), 'sera');
    root.querySelector('[data-checks-simulator-roll]').click();
    await settle();
    await settle();
    assert.equal(root.querySelector('[data-checks-simulator-total]').textContent.trim(), '12');
    assert.equal(
      root.querySelector('[data-checks-simulator-breakdown]').textContent.trim(),
      'd20 9 +3 · Sera Vane',
      'the TERSE line, not the full resolved formula'
    );
    assert.equal(
      root.querySelector('[data-checks-simulator-band-name]').textContent.trim(),
      'Success',
      '9 + 3 = 12 lands on the Success tier against DC 12'
    );
    // The medallion carries the ROLLED FACE and its denomination. Both are asserted, and
    // the denomination is read off the result's own dice bag rather than re-parsed from
    // the formula — a second parse is a second thing to disagree with the roll.
    const faceTile = root.querySelector('[data-checks-simulator-face-value]');
    assert.equal(faceTile.querySelector('strong').textContent.trim(), '9');
    assert.equal(faceTile.querySelector('span').textContent.trim(), 'd20');
  });

  it('lists "What happens" rows derived from the same result object', async () => {
    const root = await mountChecks();
    await choose(root.querySelector('[data-checks-preview-actor]'), 'sera');
    root.querySelector('[data-checks-simulator-roll]').click();
    await settle();
    await settle();
    const facts = [...root.querySelectorAll('[data-checks-simulator-fact]')].map((row) =>
      row.getAttribute('data-checks-simulator-fact')
    );
    assert.deepEqual(facts, ['result-group', 'ingredients']);
  });

  it('DROPS a stale readout when the previewed record changes underneath it', async () => {
    const root = await mountChecks();
    await choose(root.querySelector('[data-checks-preview-actor]'), 'sera');
    root.querySelector('[data-checks-simulator-roll]').click();
    await settle();
    await settle();
    assert.ok(root.querySelector('[data-checks-simulator-readout]'));
    await choose(root.querySelector('[data-checks-preview-record]'), 'rare');
    assert.ok(
      !root.querySelector('[data-checks-simulator-readout]'),
      'a total no current configuration produces must not stay on screen'
    );
  });

  it('warns rather than presenting a plausible wrong total for an unresolved key', async () => {
    const root = await mountChecks();
    await choose(root.querySelector('[data-checks-preview-actor]'), 'bare');
    assert.ok(
      root.querySelector('[data-checks-simulator-note="unresolved"]'),
      'Bare Hands has no @prof, and Roll.parse would silently make it 0'
    );
  });

  it('states that a dynamic DC was NOT previewed by running its macro', async () => {
    const root = await mountChecks({
      resolutionMode: 'simple',
      craftingCheckSimple: { ...SIMPLE_CHECK, dcMode: 'dynamic', macroUuid: 'Macro.x' },
      craftingCheck: null,
    });
    assert.ok(root.querySelector('[data-checks-simulator-note="dynamic-dc"]'));
  });
});

describe('the odds histogram', () => {
  it('enumerates the faces, and the rail heading names that space rather than guessing it', async () => {
    // The `all N faces` adjunct is issue 1096's heading slot and its fallback is a REGEX over
    // the authored formula. Since issue 1118 the formula that is ROLLED can carry a check
    // modifier's die the authored one does not, so the adjunct reads the enumerator's own
    // answer where there is one — a heading naming a domain the panel beneath it refuses to
    // chart is the same class of lie the histogram itself is guarded against.
    const root = await mountChecks();
    await choose(root.querySelector('[data-checks-preview-actor]'), 'sera');
    assert.equal(
      root.querySelector('[data-checks-odds-state]').getAttribute('data-checks-odds-state'),
      'enumerated'
    );
    assert.equal(
      root.querySelector('[data-checks-odds-domain]').textContent.trim(),
      'all 20 faces',
      'DERIVED from the enumerated space, never hard-coded'
    );
  });

  it('and the heading says NOTHING at all when the panel abstains', async () => {
    // `2d20 + @prof` still NAMES a d20, so the regex fallback answers `all 20 faces` for it
    // while the panel beneath refuses to chart it at all. That disagreement is the whole
    // reason the adjunct reads the view-model, so it is the case that tells the two apart.
    const root = await mountChecks({
      craftingCheck: { ...ROUTED_CHECK, rollFormula: '2d20 + @prof' },
    });
    await choose(root.querySelector('[data-checks-preview-actor]'), 'sera');
    assert.equal(
      root.querySelector('[data-checks-odds-state]').getAttribute('data-checks-odds-state'),
      'not-enumerable'
    );
    assert.equal(root.querySelector('[data-checks-odds-domain]'), null);
  });

  it('renders every bar through the shipped FillBar rather than a sixth hand-rolled one', async () => {
    const root = await mountChecks();
    await choose(root.querySelector('[data-checks-preview-actor]'), 'sera');
    const bars = [...root.querySelectorAll('[data-checks-odds-bar]')];
    assert.ok(bars.length > 0, 'there are bars');
    for (const bar of bars) {
      assert.ok(bar.classList.contains('fab-fill-bar'), 'each bar IS the shared primitive');
      const fill = bar.querySelector('.fab-fill-bar-fill');
      assert.ok(Boolean(fill), 'with the primitive’s own fill element');
      assert.ok(
        !/gradient/i.test(fill.getAttribute('style') ?? ''),
        'and no gradient: the band strip’s full-track scale is the only exemption'
      );
    }
  });

  it('abstains with a STATED REASON rather than approximating', async () => {
    const root = await mountChecks({
      craftingCheck: { ...ROUTED_CHECK, rollFormula: '2d20 + @prof' },
    });
    await choose(root.querySelector('[data-checks-preview-actor]'), 'sera');
    const note = root.querySelector('[data-checks-odds-state="not-enumerable"]');
    assert.ok(Boolean(note), 'the panel abstains');
    assert.equal(note.getAttribute('data-checks-odds-reason'), 'non-unit-count');
    assert.match(note.textContent, /several dice/, 'and says WHY in words');
  });
});

describe('the simple check’s two-band strip', () => {
  it('draws Failure/Success with ONE handle, on the DC', async () => {
    const root = await mountChecks({
      resolutionMode: 'simple',
      craftingCheck: null,
      craftingCheckSimple: SIMPLE_CHECK,
      requestedSection: 'outcomes',
      requestedSectionNonce: 1,
    });
    const bands = [...root.querySelectorAll('[data-simple-band-strip] [data-band-strip-band]')].map(
      (band) => band.getAttribute('data-band-strip-band')
    );
    assert.deepEqual(bands, ['failure', 'success']);
    const handles = root.querySelectorAll('[data-simple-band-strip] [data-band-strip-handle]');
    assert.equal(handles.length, 1, 'two bands, one boundary');
    assert.equal(handles[0].getAttribute('aria-valuenow'), '10', 'and it sits on the DC');
    // The track has ROOM. `null` bounds are ABSENT, not zero: coercing them collapsed the
    // domain to `[0, dc + 1]`, which left the one handle with nowhere to move to.
    assert.equal(handles[0].getAttribute('aria-valuemin'), '1');
    assert.equal(handles[0].getAttribute('aria-valuemax'), '19');
  });

  it('writes the check’s own DC when the handle is keyed', async () => {
    const changes = [];
    const root = await mountChecks({
      resolutionMode: 'simple',
      craftingCheck: null,
      craftingCheckSimple: SIMPLE_CHECK,
      requestedSection: 'outcomes',
      requestedSectionNonce: 1,
      onUpdateCraftingCheckSimple: (next) => changes.push(next),
    });
    const handle = root.querySelector('[data-simple-band-strip] [data-band-strip-handle]');
    handle.dispatchEvent(
      new globalThis.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })
    );
    await settle();
    assert.equal(changes.length, 1, 'one update');
    assert.equal(changes[0].dc, 11, 'the SAME field the roll row’s DC stepper writes');
  });
});

describe('the modifier context reaches the derivations that DESCRIBE the roll', () => {
  it('shifts the histogram, because the runner appends a scalar the arg bag does not carry', async () => {
    // The ROUTE-level half of the "one formula" fix. `buildPreviewCheckArgs` hands the runner
    // an authored formula plus a modifier context and `evaluateCheckRoll` appends the resolved
    // scalar itself, so every derivation that DESCRIBES the roll has to be handed that context
    // too. A histogram blind to it charts `1d20 + @prof` beside a readout rolling
    // `1d20 + @prof + 2[Modifiers]`, on one screen, for one check.
    const percents = async (props) => {
      const root = await mountChecks(props);
      await choose(root.querySelector('[data-checks-preview-actor]'), 'sera');
      return [...root.querySelectorAll('[data-checks-odds-percent]')].map(
        (cell) => `${cell.getAttribute('data-checks-odds-percent')}:${cell.textContent.trim()}`
      );
    };
    const without = await percents();
    harness.remount();
    const withCatalogue = await percents({
      modifiers: [{ id: 'mod-kit', label: 'Kit', expression: '2' }],
      craftingDefaultModifierPolicy: 'addAll',
      craftingDefaultModifierIds: ['mod-kit'],
    });
    assert.ok(without.length > 0, 'the histogram draws in both arms');
    assert.notDeepEqual(
      withCatalogue,
      without,
      'a +2 the runner appends must move the chance of every tier'
    );
  });
});

describe('the progressive PREVIEW SANDBOX', () => {
  const PROGRESSIVE_CHECK = {
    awardMode: 'equal',
    rollFormula: '1d20 + @prof',
    checkBreakage: { triggers: [] },
  };

  /**
   * Mount the crafting route in progressive mode.
   *
   * @param {?object} preview The check's sandbox block, or null for none.
   * @param {object} [props] Extra props.
   * @returns {Promise<object>} The mounted root.
   */
  function mountProgressive(preview, props = {}) {
    return mountChecks({
      resolutionMode: 'progressive',
      craftingCheck: null,
      craftingCheckProgressive: preview ? { ...PROGRESSIVE_CHECK, preview } : PROGRESSIVE_CHECK,
      ...props,
    });
  }

  it('REPLACES the record selector, because a progressive check has no DC', async () => {
    const root = await mountProgressive({ difficulties: [6, 9] });
    assert.ok(
      !root.querySelector('[data-checks-preview-record]'),
      'a record supplies a DC and nothing else, so it has nothing to offer this mode'
    );
    const field = root.querySelector('[data-checks-preview-difficulties]');
    assert.ok(Boolean(field), 'the sandbox order takes that slot');
    assert.equal(field.value, '6, 9', 'seeded from the persisted experiment');
  });

  it('leaves the record selector alone in every OTHER mode', async () => {
    const root = await mountChecks();
    assert.ok(Boolean(root.querySelector('[data-checks-preview-record]')));
    assert.ok(!root.querySelector('[data-checks-preview-difficulties]'));
  });

  it('buckets the histogram by AWARD COUNT over the GM’s own order', async () => {
    // `1d20 + @prof` for Sera is `1d20 + 3`, so totals run 4..23. Against 6/9/14/40 the
    // cumulative cost is 6/15/29/69: an award of NOTHING is reachable (totals 4-5), one and
    // two are, three and four are not.
    const root = await mountProgressive({ difficulties: [6, 9, 14, 40] });
    await choose(root.querySelector('[data-checks-preview-actor]'), 'sera');
    const rows = [...root.querySelectorAll('[data-checks-odds-row]')].map((row) => [
      row.getAttribute('data-checks-odds-row'),
      row.querySelector('[data-checks-odds-percent]').textContent.trim(),
    ]);
    assert.deepEqual(rows, [
      ['award-0', '10%'],
      ['award-1', '45%'],
      ['award-2', '45%'],
    ]);
    assert.equal(
      root.querySelector('[data-checks-odds-row="award-0"] .manager-checks-odds-label').textContent
        .trim(),
      '0 of 4',
      'an award of nothing is a real outcome and IS listed, out of the authored four'
    );
  });

  it('states the ABSENCE and names the field rather than inventing a sample', async () => {
    const root = await mountProgressive(null);
    await choose(root.querySelector('[data-checks-preview-actor]'), 'sera');
    const note = root.querySelector('[data-checks-odds-state="not-enumerable"]');
    assert.ok(Boolean(note), 'no chart without an order');
    assert.equal(
      note.getAttribute('data-checks-odds-reason'),
      'no-sandbox-order',
      'and NOT an enumerability refusal: the formula is perfectly enumerable'
    );
    assert.match(note.textContent, /Preview as/, 'the sentence names the field that fills it');
  });

  it('writes the typed order back through the SAME draft every other progressive edit uses', async () => {
    const changes = [];
    const root = await mountProgressive(
      { difficulties: [6] },
      { onUpdateCraftingCheckProgressive: (next) => changes.push(next) }
    );
    const field = root.querySelector('[data-checks-preview-difficulties]');
    field.value = '14, -2, 6';
    field.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
    await settle();
    assert.equal(changes.length, 1);
    assert.deepEqual(
      changes[0].preview.difficulties,
      [14, -2, 6],
      'order preserved and unsorted, and a negative is the GM’s business'
    );
    assert.equal(changes[0].rollFormula, '1d20 + @prof', 'the rest of the draft rides along');
  });

  // The field's "keeps the GM's own text" guard is NOT graded here, deliberately. This
  // harness mounts `ChecksView` with STATIC props, so the order never round-trips back
  // through the draft — and the guard only does anything on a round trip. A test here
  // would pass with the guard deleted, which is the definition of a vacuous one. It is
  // graded in `tests/components/manager-mounted.test.js`, the only suite that mounts the
  // root and therefore the only one where the draft answers back.
});

describe('the source contract these hooks are pinned by', () => {
  it('keeps the panels on the shared primitives the spec names', () => {
    const odds = readFileSync(
      resolve(repoRoot, 'src/ui/svelte/apps/manager/checks/CheckOddsPanel.svelte'),
      'utf8'
    );
    assert.match(odds, /FillBar from '\.\.\/\.\.\/\.\.\/components\/FillBar\.svelte'/);
    const preview = readFileSync(
      resolve(repoRoot, 'src/ui/svelte/apps/manager/checks/CheckOutcomePreview.svelte'),
      'utf8'
    );
    assert.match(preview, /Medallion from '\.\.\/\.\.\/\.\.\/components\/Medallion\.svelte'/);
    assert.match(preview, /IconFactRow from '\.\.\/IconFactRow\.svelte'/);
  });
});
