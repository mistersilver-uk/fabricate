/** The Checks Studio's simulator, odds histogram and previewed record, MOUNTED (issue 1097). */
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
// The three record controls are driven by open-then-click on a portaled panel (issue 1510).
import {
  assertSelectHasResolvedName,
  chooseSelectOption,
  selectOptionLabels,
  selectTriggerText,
} from '../helpers/select-control.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-check-preview-',
  rawModules: [
    ...CHECKS_TREE_RAW_MODULES,
    'src/ui/svelte/actions/dragDrop.js',
    'src/ui/svelte/util/dropUtils.js',
    'src/ui/model/macroReference.js',
  ],
  compiledModules: [
    'src/ui/svelte/components/IconButton.svelte',
    ...CHECKS_TREE_COMPILED_MODULES,
    'src/ui/svelte/components/ItemDropZone.svelte',
    'src/ui/svelte/components/SegmentedControl.svelte',
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

/** The world's actors — two player characters and one that is not. */
const WORLD_ACTORS = [
  { id: 'sera', name: 'Sera Vane', type: 'character', getRollData: () => ({ prof: 3 }) },
  { id: 'bare', name: 'Bare Hands', type: 'character', getRollData: () => ({}) },
  { id: 'balehound', name: 'Balehound', type: 'npc', getRollData: () => ({ prof: 9 }) },
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
      const modifier = /^(cs(?:[<>=]+\d+)?|cf(?:[<>=]+\d+)?|even|odd|df(?:[<>=]+\d+)?|sf(?:[<>=]+\d+)?|ms(?:[<>=]+\d+)?)/i.exec(
        replaced.slice(match.index + match[0].length)
      )?.[0];
      return [
        {
          faces,
          number: match[1] === '' ? 1 : Number(match[1]),
          denomination: `d${faces}`,
          modifiers: modifier ? [modifier] : [],
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

// The three converted record controls, each by the hook that rode onto its trigger (issue 1510).
const RAIL_RECORD = '[data-checks-preview-record]';
const CARD_RECORD = '[data-preview-against-select]';
const SIMPLE_RECORD = '[data-simple-band-record]';

/** Choose a record on one of the three converted controls, then let Svelte settle. */
async function choose(root, triggerSelector, value) {
  chooseSelectOption(root, triggerSelector, value);
  await settle();
}

/**
 * Pick an actor in the "Preview as" control the way a GM does.
 *
 * @param {HTMLElement} root The mounted tree.
 * @param {string} actorId The actor id, or `no-actor`.
 */
async function choosePreviewActor(root, actorId) {
  const trigger = root.querySelector('[data-checks-preview-actor]');
  assert.ok(Boolean(trigger), 'the "Preview as" control renders');
  trigger.click();
  await settle();
  const option = root.querySelector(`[data-popover-option="${actorId}"]`);
  assert.ok(Boolean(option), `the picker offers "${actorId}"`);
  option.click();
  await settle();
}

describe('the Preview-as control (issue 1096 shipped it as a SLOT; this fills it)', () => {
  it('offers the PLAYER CHARACTERS only, behind an explicit "No actor" option', async () => {
    // This inverts what the control shipped as. It listed `game.actors` unfiltered.
    const root = await mountChecks();
    const trigger = root.querySelector('[data-checks-preview-actor]');
    assert.ok(Boolean(trigger), 'the actor picker is a real control');
    assert.equal(trigger.tagName, 'BUTTON', 'and it is the shipped popover trigger');
    trigger.click();
    await settle();
    assert.deepEqual(
      [...root.querySelectorAll('[data-popover-option]')].map((option) =>
        option.getAttribute('data-popover-option')
      ),
      ['no-actor', 'sera', 'bare'],
      'the npc is filtered out; "No actor" leads and is a real option, not an absence'
    );
    assert.match(trigger.textContent, /No actor/, '"No actor" is the resting selection');
  });

  it('SEARCHES the list, which is the whole reason it is not a native select', async () => {
    const root = await mountChecks();
    root.querySelector('[data-checks-preview-actor]').click();
    await settle();
    const search = root.querySelector('.manager-travel-popover-search input');
    assert.ok(Boolean(search), 'the picker offers a search field');
    search.value = 'sera';
    search.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
    await settle();
    assert.deepEqual(
      [...root.querySelectorAll('[data-popover-option]')].map((option) =>
        option.getAttribute('data-popover-option')
      ),
      ['sera'],
      'a GM types a name instead of scrolling a world of them'
    );
  });

  it('rolls through the studio BUTTON PRIMITIVE, not a hand-written class string', async () => {
    // Reported as "the roll button does not match the studio's button". The cause is not a
    // missing rule: `manager-button is-primary` matches no rule stating a type size, so the
    // label took Foundry's 14px app base while every converted button in the studio read at
    // the primitive's 11.52px. `fab-manager-button` is what `ManagerButton` emits and is the
    // only class the type-scale rule keys on, so its presence IS the conversion.
    const root = await mountChecks();
    const roll = root.querySelector('[data-checks-simulator-roll]');
    assert.equal(roll.tagName, 'BUTTON', 'it is one button, not a button inside a button');
    assert.equal(roll.querySelectorAll('button').length, 0, 'and nests none');
    assert.ok(
      roll.classList.contains('fab-manager-button'),
      'the roll action renders through ManagerButton'
    );
    assert.ok(roll.classList.contains('is-primary'), 'in the primary role it always had');
    assert.ok(
      roll.classList.contains('manager-checks-simulator-roll'),
      'keeping its own hook for the Foundry width/height reset in the sheet'
    );
  });

  it('names the chosen actor on the trigger, so the selection is readable when closed', async () => {
    const root = await mountChecks();
    await choosePreviewActor(root, 'sera');
    assert.match(
      root.querySelector('[data-checks-preview-actor]').textContent,
      /Sera Vane/,
      'a popover that closes without stating its selection is worse than the select it replaced'
    );
  });

  it('offers the check default and every authored recipe tier as records', async () => {
    const root = await mountChecks();
    assert.equal(
      assertSelectHasResolvedName(root, RAIL_RECORD),
      'Preview against record',
      'the screen-reader-only caption it had is the trigger’s own name now'
    );
    assert.deepEqual(selectOptionLabels(root, RAIL_RECORD), [
      'Default · DC 12',
      'Uncommon Craft · DC 12',
      'Rare Craft · DC 20',
    ]);
  });
});

describe('the previewed record drives the band strip, not the check’s own DC', () => {
  it('names the record in the strip’s GROUP label', async () => {
    const root = await mountChecks({ requestedSection: 'outcomes', requestedSectionNonce: 1 });
    await choose(root, RAIL_RECORD, 'rare');
    const track = root.querySelector('[data-band-strip-track]');
    assert.match(
      track.getAttribute('aria-label'),
      /Rare Craft/,
      'the group label names the previewed record'
    );
  });

  it('carries BOTH readings in aria-valuetext, absolute and offset', async () => {
    const root = await mountChecks({ requestedSection: 'outcomes', requestedSectionNonce: 1 });
    await choose(root, RAIL_RECORD, 'rare');
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
    await choose(root, RAIL_RECORD, 'uncommon');
    const atTwelve = ticks();
    await choose(root, RAIL_RECORD, 'rare');
    assert.deepEqual(atTwelve, ['7', '12', '17']);
    assert.deepEqual(ticks(), ['15', '20', '25'], 'the same offsets against a DC of 20');
  });

  it('is ONE selection: the Outcomes card’s own PREVIEW AGAINST writes the rail’s', async () => {
    // The Outcomes card ships its own record selector.
    const root = await mountChecks({ requestedSection: 'outcomes', requestedSectionNonce: 1 });
    assert.equal(
      assertSelectHasResolvedName(root, CARD_RECORD),
      'Preview against',
      'and the card’s control keeps its ONE pointer at the caption beside it'
    );
    await choose(root, CARD_RECORD, 'rare');
    assert.equal(
      selectTriggerText(root, RAIL_RECORD),
      'Rare Craft · DC 20',
      'two controls, one state — the simulator and the strip cannot read different records'
    );
  });

  it('and the rail’s writes the Outcomes card’s, which is the other direction', async () => {
    // Asserted separately because ONE state and TWO independent states are only told apart by
    // driving both ends: a card that merely reported upward without reading back would pass
    // the case above and still drift the moment the rail was used.
    const root = await mountChecks({ requestedSection: 'outcomes', requestedSectionNonce: 1 });
    await choose(root, RAIL_RECORD, 'rare');
    assert.equal(selectTriggerText(root, CARD_RECORD), 'Rare Craft · DC 20');
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
    await choosePreviewActor(root, 'sera');
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
    // The medallion carries the ROLLED FACE and its denomination. Both are asserted.
    const faceTile = root.querySelector('[data-checks-simulator-face-value]');
    assert.equal(faceTile.querySelector('strong').textContent.trim(), '9');
    assert.equal(faceTile.querySelector('span').textContent.trim(), 'd20');
  });

  it('lists "What happens" rows derived from the same result object', async () => {
    const root = await mountChecks();
    await choosePreviewActor(root, 'sera');
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
    await choosePreviewActor(root, 'sera');
    root.querySelector('[data-checks-simulator-roll]').click();
    await settle();
    await settle();
    assert.ok(root.querySelector('[data-checks-simulator-readout]'));
    await choose(root, RAIL_RECORD, 'rare');
    assert.ok(
      !root.querySelector('[data-checks-simulator-readout]'),
      'a total no current configuration produces must not stay on screen'
    );
  });

  it('warns rather than presenting a plausible wrong total for an unresolved key', async () => {
    const root = await mountChecks();
    await choosePreviewActor(root, 'bare');
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
  it('withholds the formula average and states the odds refusal after the formula control changes', async () => {
    const changes = [];
    const root = await mountChecks({
      craftingCheck: { ...ROUTED_CHECK, rollFormula: '1d20cs>15' },
      onUpdateCraftingCheck: (next) => changes.push(next),
    });
    const field = root.querySelector('[data-check-roll-formula]');
    field.value = '1d20odd';
    field.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
    await settle();
    assert.equal(changes.at(-1).rollFormula, '1d20odd', 'the production formula control emitted');
    assert.ok(root.querySelector('[data-check-formula-average-withheld="die-modifiers"]'));

    await choosePreviewActor(root, 'sera');
    const note = root.querySelector('[data-checks-odds-state="not-enumerable"]');
    assert.ok(note, 'the sibling odds panel abstains');
    assert.equal(note.dataset.checksOddsReason, 'die-modifiers');
    assert.match(note.textContent, /modifier/i, 'the refusal is stated in words');
  });

  it('enumerates the faces, and the rail heading names that space rather than guessing it', async () => {
    // The `all N faces` adjunct is issue 1096's heading slot and its fallback is a REGEX over
    // the authored formula. Since issue 1118 the formula that is ROLLED can carry a check
    // modifier's die the authored one does not, so the adjunct reads the enumerator's own
    // answer where there is one — a heading naming a domain the panel beneath it refuses to
    // chart is the same class of lie the histogram itself is guarded against.
    const root = await mountChecks();
    await choosePreviewActor(root, 'sera');
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
    await choosePreviewActor(root, 'sera');
    assert.equal(
      root.querySelector('[data-checks-odds-state]').getAttribute('data-checks-odds-state'),
      'not-enumerable'
    );
    assert.equal(root.querySelector('[data-checks-odds-domain]'), null);
  });

  it('renders every bar through the shipped FillBar rather than a sixth hand-rolled one', async () => {
    const root = await mountChecks();
    await choosePreviewActor(root, 'sera');
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
    await choosePreviewActor(root, 'sera');
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
    // The track has ROOM. `null` bounds are ABSENT, not zero.
    assert.equal(handles[0].getAttribute('aria-valuemin'), '1');
    assert.equal(handles[0].getAttribute('aria-valuemax'), '19');
  });

  it('scales the track to the REACHABLE TOTALS once a formula resolves', async () => {
    // The fallback above is a window around the DC.
    const root = await mountChecks({
      resolutionMode: 'simple',
      craftingCheck: null,
      craftingCheckSimple: SIMPLE_CHECK,
      requestedSection: 'outcomes',
      requestedSectionNonce: 1,
    });
    await choosePreviewActor(root, 'sera');
    const handle = root.querySelector('[data-simple-band-strip] [data-band-strip-handle]');
    // The HANDLE's range is the track inset by one on each side.
    assert.equal(handle.getAttribute('aria-valuemin'), '5', 'a track floored at the total 4');
    assert.equal(handle.getAttribute('aria-valuemax'), '22', 'and ceilinged at the total 23');
  });

  it('shares ONE previewed record with the rail, written from the card’s own control', async () => {
    // Its own control renders only where there is more than one record to choose, so this mount
    // authors the two recipe tiers `SIMPLE_CHECK` deliberately has none of.
    const root = await mountChecks({
      resolutionMode: 'simple',
      craftingCheck: null,
      craftingCheckSimple: { ...SIMPLE_CHECK, tiers: ROUTED_CHECK.tiers },
      requestedSection: 'outcomes',
      requestedSectionNonce: 1,
    });
    assert.equal(
      assertSelectHasResolvedName(root, SIMPLE_RECORD),
      'Preview against',
      'the demoted wrapper’s caption still names the control'
    );
    await choose(root, SIMPLE_RECORD, 'rare');
    assert.equal(
      selectTriggerText(root, RAIL_RECORD),
      'Rare Craft · DC 20',
      'the simulator and the strip cannot read different records'
    );
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
      await choosePreviewActor(root, 'sera');
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
    // `1d20 + @prof` for Sera is `1d20 + 3`.
    const root = await mountProgressive({ difficulties: [6, 9, 14, 40] });
    await choosePreviewActor(root, 'sera');
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
    await choosePreviewActor(root, 'sera');
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

  // The field's "keeps the GM's own text" guard is NOT graded here.
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
