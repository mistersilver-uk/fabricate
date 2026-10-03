/** The Checks Studio's simulator, odds histogram and previewed record, MOUNTED (issue 1097). */
import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { flushSync, tick } from 'svelte';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import { forceTrigger, MARGIN_NOTES, readReadout } from '../helpers/checkReadoutDom.js';
import {
  CHECKS_TREE_COMPILED_MODULES,
  CHECKS_TREE_RAW_MODULES,
} from '../helpers/checksHarnessModules.js';
import { installCountDice } from '../helpers/countEngineDice.js';
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

async function rollAndSettle(root) {
  root.querySelector('[data-checks-simulator-roll]').click();
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await settle();
    if (root.querySelector('[data-checks-simulator-readout]')) return;
  }
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
    // the primitive's 11.52px. `fab-manager-button` is what `Button` emits and is the
    // only class the type-scale rule keys on, so its presence IS the conversion.
    const root = await mountChecks();
    const roll = root.querySelector('[data-checks-simulator-roll]');
    assert.equal(roll.tagName, 'BUTTON', 'it is one button, not a button inside a button');
    assert.equal(roll.querySelectorAll('button').length, 0, 'and nests none');
    assert.ok(
      roll.classList.contains('fab-manager-button'),
      'the roll action renders through Button'
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
  it('renders the pre-roll state until the GM rolls, naming the activity and its record', async () => {
    const root = await mountChecks();
    const hint = root.querySelector('[data-checks-simulator-state="pre-roll"]');
    assert.equal(
      hint.textContent.trim(),
      'Roll a test check to see exactly which outcome a recipe lands on and what it costs the character.'
    );
    assert.equal(
      root.querySelector('[data-checks-simulator-roll]').textContent.trim(),
      'Roll a test crafting check'
    );
    assert.ok(!root.querySelector('[data-checks-simulator-readout]'));
  });

  it('rolls through the engine runner and renders a routed relative tier', async () => {
    const root = await mountChecks();
    await choosePreviewActor(root, 'sera');
    await rollAndSettle(root);
    // 9 + 3 = 12 lands on the Success tier against DC 12; the medallion is the FACE, not the total.
    assert.deepEqual(readReadout(root), {
      medallion: ['9', 'd20'],
      breakdown: 'd20 9 +3 · Sera Vane',
      total: '12',
      line: ['vs DC 12 · +0', 'margin'],
      card: ['success', 'Success', 'Counts as a success · result group bound to this tier'],
      note: null,
      rows: [
        ['result-group', 'Result group produced', 'Success'],
        ['ingredients', 'Ingredients consumed', 'as listed'],
      ],
    });
    assert.equal(root.querySelector('[data-checks-simulator-roll]').textContent.trim(), 'Roll again');
  });

  it('lists "What happens" rows derived from the same result object', async () => {
    const root = await mountChecks();
    await choosePreviewActor(root, 'sera');
    await rollAndSettle(root);
    const facts = [...root.querySelectorAll('[data-checks-simulator-fact]')].map((row) =>
      row.getAttribute('data-checks-simulator-fact')
    );
    assert.deepEqual(facts, ['result-group', 'ingredients']);
  });

  it('DROPS a stale readout when the previewed record changes underneath it', async () => {
    const root = await mountChecks();
    await choosePreviewActor(root, 'sera');
    await rollAndSettle(root);
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

describe('the evaluation reaches the stack, the editors and the preview (issue 2005)', () => {
  const underFixed = { product: 'sum', direction: 'under', target: { source: 'fixed' } };
  const attribute = {
    product: 'sum',
    direction: 'under',
    target: { source: 'attribute', expression: '@prof', adjustmentKind: 'multiply' },
  };

  it('states the authored evaluation on the editor stack', async () => {
    const root = await mountChecks({ craftingCheck: { ...ROUTED_CHECK, evaluation: attribute } });
    const stack = root.querySelector('[data-checks-panel="crafting"]');
    assert.deepEqual(
      [
        stack.dataset.checksEvaluationDirection,
        stack.dataset.checksTargetSource,
        stack.dataset.checksAdjustmentKind,
      ],
      ['under', 'attribute', 'multiply']
    );
  });

  it('states the authored evaluation on the salvage stack too', async () => {
    const root = await mountChecks({
      activity: 'salvage',
      salvageResolutionMode: 'simple',
      salvageCheckSimple: { ...SIMPLE_CHECK, evaluation: attribute },
      activation: { salvage: { enabled: true, optional: false } },
      features: { salvage: true },
    });
    const stack = root.querySelector('[data-checks-panel="salvage"]');
    assert.ok(Boolean(stack), 'the salvage stack renders');
    assert.deepEqual(
      [
        stack.dataset.checksEvaluationDirection,
        stack.dataset.checksTargetSource,
        stack.dataset.checksAdjustmentKind,
      ],
      ['under', 'attribute', 'multiply']
    );
  });

  it('reads the character value for the Preview-as actor in the routed and simple editors', async () => {
    const routed = await mountChecks({ craftingCheck: { ...ROUTED_CHECK, evaluation: attribute } });
    await choosePreviewActor(routed, 'sera');
    assert.equal(
      routed.querySelector('[data-check-target-resolution]')?.textContent.trim(),
      'Sera Vane → 3'
    );
    harness.remount();
    const simple = await mountChecks({
      resolutionMode: 'simple',
      craftingCheck: null,
      craftingCheckSimple: { ...SIMPLE_CHECK, evaluation: attribute },
    });
    await choosePreviewActor(simple, 'sera');
    assert.equal(
      simple.querySelector('[data-check-target-resolution]')?.textContent.trim(),
      'Sera Vane → 3'
    );
  });

  const KIT = {
    modifiers: [{ id: 'mod-kit', label: 'Kit', expression: '2' }],
    craftingDefaultModifierPolicy: 'addAll',
    craftingDefaultModifierIds: ['mod-kit'],
  };

  it('raises a roll-under target by the previewed modifiers in the routed and simple strips', async () => {
    const routed = await mountChecks({
      craftingCheck: { ...ROUTED_CHECK, evaluation: underFixed },
      requestedSection: 'outcomes',
      requestedSectionNonce: 1,
      ...KIT,
    });
    await choosePreviewActor(routed, 'sera');
    assert.match(
      routed.querySelector('[data-outcome-band-scale]').textContent.trim(),
      /^Target 14 \(includes modifiers \+2\)\./
    );
    harness.remount();
    const simple = await mountChecks({
      resolutionMode: 'simple',
      craftingCheck: null,
      craftingCheckSimple: { ...SIMPLE_CHECK, evaluation: underFixed },
      requestedSection: 'outcomes',
      requestedSectionNonce: 1,
      ...KIT,
    });
    await choosePreviewActor(simple, 'sera');
    assert.match(
      simple.querySelector('[data-simple-band-scale]').textContent.trim(),
      /^Target 12 \(includes modifiers \+2\)\./
    );
  });

  it('reads each record as its target under a fixed roll-under check', async () => {
    const root = await mountChecks({ craftingCheck: { ...ROUTED_CHECK, evaluation: underFixed } });
    assert.deepEqual(selectOptionLabels(root, RAIL_RECORD), [
      'Default · target 12',
      'Uncommon Craft · target 12',
      'Rare Craft · target 20',
    ]);
  });

  it("words the check-type options with each activity's own records", async () => {
    const descriptions = (root) =>
      [...root.querySelectorAll('[data-check-type-option]')].map((option) =>
        option.textContent.replaceAll(/\s+/g, ' ').trim()
      );
    const salvage = await mountChecks({
      activity: 'salvage',
      salvageResolutionMode: 'routed',
      salvageCheckRouted: ROUTED_CHECK,
      activation: { salvage: { enabled: true, optional: false } },
      features: { salvage: true },
      requestedSection: 'outcomes',
      requestedSectionNonce: 1,
    });
    const salvageCopy = descriptions(salvage);
    assert.match(salvageCopy[0], /offsets from the salvageable item's own DC/);
    assert.match(salvageCopy[1], /Salvageable items carry no DC at all/);
    harness.remount();
    const gathering = await mountChecks({
      activity: 'gathering',
      gatheringResolutionMode: 'routed',
      gatheringCheckRouted: ROUTED_CHECK,
      activation: { gathering: { enabled: true, optional: false } },
      features: { gathering: true },
      requestedSection: 'outcomes',
      requestedSectionNonce: 1,
    });
    const gatheringCopy = descriptions(gathering);
    assert.match(gatheringCopy[0], /offsets from the gathering task's own DC/);
    assert.match(gatheringCopy[1], /Gathering tasks carry no DC at all/);
    for (const copy of [...salvageCopy, ...gatheringCopy]) {
      assert.doesNotMatch(copy, /\{records?\}/, 'no placeholder is left');
    }
  });

  it('drops a stale readout when only the previewed tier changes underneath it', async () => {
    const root = await mountChecks();
    await choose(root, RAIL_RECORD, 'rare');
    await choosePreviewActor(root, 'sera');
    await rollAndSettle(root);
    assert.ok(root.querySelector('[data-checks-simulator-readout]'));
    const tiers = ROUTED_CHECK.tiers.map((tier) =>
      tier.id === 'rare' ? { ...tier, adjustment: -2 } : tier
    );
    await harness.setProps({ craftingCheck: { ...ROUTED_CHECK, tiers } });
    await settle();
    assert.ok(
      !root.querySelector('[data-checks-simulator-readout]'),
      'a result graded against the old tier must not stay on screen'
    );
  });

  it('drops a stale readout when the evaluation changes underneath it', async () => {
    const root = await mountChecks();
    await choosePreviewActor(root, 'sera');
    await rollAndSettle(root);
    assert.ok(root.querySelector('[data-checks-simulator-readout]'));
    await harness.setProps({ craftingCheck: { ...ROUTED_CHECK, evaluation: underFixed } });
    await settle();
    assert.ok(
      !root.querySelector('[data-checks-simulator-readout]'),
      'a result graded the other way round must not stay on screen'
    );
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

describe('roll-under preview, odds and readiness (issue 2003)', () => {
  // Sera's `@prof + 9` is 12; the tiers route at or under 12 (Regular) and 6 (Hard).
  const UNDER_ROUTED = {
    ...ROUTED_CHECK,
    rollFormula: '1d20',
    evaluation: {
      product: 'sum',
      direction: 'under',
      target: {
        source: 'attribute',
        expression: '@prof + 9',
        adjustmentKind: 'multiply',
        baseAdjustment: 1,
      },
    },
    relativeOutcomes: [
      { id: 'otherwise', name: 'Otherwise', adjustment: null, success: false },
      { id: 'regular', name: 'Regular', adjustment: 1, success: true },
      { id: 'hard', name: 'Hard', adjustment: 0.5, success: true },
    ],
    tiers: [],
  };
  const odds = (root) => root.querySelector('[data-checks-odds-state]');
  const rollButton = (root) => root.querySelector('[data-checks-simulator-roll]');

  it('abstains with no actor, then charts worst to best once one is chosen', async () => {
    const root = await mountChecks({ craftingCheck: UNDER_ROUTED });
    assert.equal(odds(root).dataset.checksOddsReason, 'needs-preview-actor');
    assert.match(odds(root).textContent, /nothing to chart without one/);
    const hint = root.querySelector('[data-checks-simulator-state="needs-preview-actor"]');
    assert.equal(
      hint?.textContent.trim(),
      'Choose a character who has every value this check reads, then roll.'
    );
    assert.equal(rollButton(root).disabled, true, 'Roll is disabled while abstaining');
    assert.equal(
      root.querySelector('[data-checks-preview-actor-summary]').textContent.trim(),
      'No actor chosen. Values read from a character are not charted.'
    );

    await choosePreviewActor(root, 'sera');
    assert.equal(odds(root).dataset.checksOddsState, 'enumerated');
    assert.equal(odds(root).dataset.checksOddsDirection, 'under');
    assert.deepEqual(
      [...root.querySelectorAll('[data-checks-odds-percent]')].map((cell) => [
        cell.dataset.checksOddsPercent,
        cell.textContent.trim(),
      ]),
      [
        ['otherwise', '40%'],
        ['regular', '30%'],
        ['hard', '30%'],
      ]
    );
    assert.equal(rollButton(root).disabled, false);
  });

  it('reads the runner’s executed target and margin, and drops it when the actor is cleared', async () => {
    const root = await mountChecks({ craftingCheck: UNDER_ROUTED });
    await choosePreviewActor(root, 'sera');
    await rollAndSettle(root);
    const readout = root.querySelector('[data-checks-simulator-readout]');
    assert.equal(readout.dataset.checksSimulatorDirection, 'under');
    const margin = root.querySelector('[data-checks-simulator-target]');
    assert.equal(margin.dataset.checksSimulatorTarget, '12', 'the Regular threshold the runner met');
    assert.deepEqual(readReadout(root), {
      medallion: ['9', 'total'],
      breakdown: '9 · raw · Sera Vane',
      total: '9',
      line: ['target 12 · margin +3', 'margin'],
      card: ['success', 'Regular', 'The recipe’s result group is produced'],
      note: MARGIN_NOTES.under,
      rows: [['result-group', 'Result group produced', 'Regular']],
    });

    await choosePreviewActor(root, 'no-actor');
    assert.ok(!root.querySelector('[data-checks-simulator-readout]'), 'the result is dropped');
    assert.ok(root.querySelector('[data-checks-simulator-state="needs-preview-actor"]'));
  });

  it('reads no target, margin or note for a roll landing on Otherwise', async () => {
    installRoll(15);
    try {
      const root = await mountChecks({ craftingCheck: UNDER_ROUTED });
      await choosePreviewActor(root, 'sera');
      await rollAndSettle(root);
      const { line, card, note, rows } = readReadout(root);
      assert.deepEqual(
        { line, card, note, rows },
        {
          line: null,
          card: ['failure', 'Otherwise', 'Nothing is produced'],
          note: null,
          rows: [['failure-result', 'Failure policy applies', 'per recipe']],
        },
        'a 15 is over every threshold, and Otherwise has no target to measure a margin from'
      );
    } finally {
      installRoll(9);
    }
  });

  it('names the actor lacking the path in the odds, the notice and not the section dot', async () => {
    const root = await mountChecks({ craftingCheck: UNDER_ROUTED });
    const dots = () => root.querySelectorAll('[data-checks-section-dot]').length;
    const before = dots();
    await choosePreviewActor(root, 'bare');
    assert.equal(odds(root).dataset.checksOddsReason, 'attribute-path-unresolved');
    assert.match(odds(root).textContent, /Bare Hands is missing a value this check reads \(@prof\)/);
    const notice = root.querySelector(
      '[data-checks-section-notice="attributePathUnresolvedForPreview"]'
    );
    assert.ok(Boolean(notice), 'the roll section explains the warning');
    assert.equal(notice.dataset.noticeTone, 'warning', 'amber, as the prototype draws it');
    assert.equal(
      notice.querySelector('.fab-notice-title').textContent.trim(),
      'A character path does not resolve'
    );
    assert.match(
      notice.querySelector('.fab-notice-detail').textContent,
      /IssueAttributePathUnresolvedForPreview:\{"actor":"Bare Hands","path":"@prof"\}/u,
      'the detail is the Validation sentence, naming the actor and the path'
    );
    assert.equal(
      root.querySelectorAll('[data-checks-section-notice="attributePathUnresolvedForPreview"]').length,
      1,
      'the issue is explained once, by its notice'
    );
    assert.equal(dots(), before, 'a transient warning puts no dot on a section');
  });

  it('opens the pane with the notice, whose Review focuses the character-value field', async () => {
    const root = await mountChecks({ craftingCheck: UNDER_ROUTED });
    await choosePreviewActor(root, 'bare');
    const panel = root.querySelector('[role="tabpanel"]');
    assert.ok(
      panel.firstElementChild.matches('[data-checks-section-notices="roll"]'),
      'the notice is the first thing in the pane'
    );
    const review = panel.querySelector(
      '[data-checks-section-notice="attributePathUnresolvedForPreview"] [data-notice-action]'
    );
    assert.equal(review.textContent.trim(), 'Review');
    review.click();
    for (let attempt = 0; attempt < 4; attempt += 1) await settle();
    const field = root.querySelector('[data-validation-target="checks-target-expression"]');
    assert.ok(Boolean(field), 'the character-value field carries its address');
    assert.ok(root.ownerDocument.activeElement === field, 'Review focuses the offending control');
  });

  it('describes a pass/fail roll-under band in its own terms', async () => {
    const root = await mountChecks({
      resolutionMode: 'simple',
      craftingCheck: null,
      craftingCheckSimple: {
        ...SIMPLE_CHECK,
        rollFormula: '1d20',
        evaluation: { product: 'sum', direction: 'under', target: { source: 'fixed' } },
      },
    });
    assert.equal(odds(root).dataset.checksOddsState, 'enumerated', 'a literal formula needs no actor');
    assert.equal(
      root.querySelector('[data-checks-odds-domain]').textContent.trim(),
      'exact · 1d20',
      'a roll-under check names its formula, as the prototype does'
    );
    await rollAndSettle(root);
    assert.deepEqual(readReadout(root), {
      medallion: ['9', 'total'],
      breakdown: '9 · raw',
      total: '9',
      line: ['target 10 · margin +1', 'margin'],
      card: ['success', 'Success', 'The recipe’s result group is produced'],
      note: MARGIN_NOTES.under,
      rows: [['result-group', 'Result group produced', 'Success']],
    });
    assert.equal(root.querySelector('[data-checks-simulator-target]').dataset.checksSimulatorTarget, '10');
  });

  it('charts a separately rolled bonus jointly, and the heading names it beside the formula', async () => {
    const root = await mountChecks({
      resolutionMode: 'simple',
      craftingCheck: null,
      craftingCheckSimple: {
        ...SIMPLE_CHECK,
        rollFormula: '1d20',
        evaluation: { product: 'sum', direction: 'under', target: { source: 'fixed' } },
      },
      modifiers: [{ id: 'mod-knack', label: 'Knack', expression: '1d4' }],
      craftingDefaultModifierPolicy: 'addAll',
      craftingDefaultModifierIds: ['mod-knack'],
    });
    await choosePreviewActor(root, 'sera');
    assert.equal(odds(root).dataset.checksOddsState, 'enumerated');
    assert.equal(
      root.querySelector('[data-checks-odds-domain]').textContent.trim(),
      'exact · 1d20 with 1d4',
      'the prototype’s exact heading, never "all 0 faces"'
    );
    // P(d20 <= 10 + d4) = 50 / 80.
    assert.equal(root.querySelector('[data-checks-odds-percent="success"]').textContent.trim(), '62.5%');
  });

  it('never publishes a result rolled before its inputs changed', async () => {
    let release;
    const gate = new Promise((resolveGate) => {
      release = resolveGate;
    });
    const evaluate = globalThis.Roll.prototype.evaluate;
    globalThis.Roll.prototype.evaluate = async function deferred(...args) {
      await gate;
      return evaluate.apply(this, args);
    };
    try {
      const root = await mountChecks({ craftingCheck: UNDER_ROUTED });
      await choosePreviewActor(root, 'sera');
      rollButton(root).click();
      await settle();
      await harness.setProps({
        craftingCheck: {
          ...UNDER_ROUTED,
          evaluation: { ...UNDER_ROUTED.evaluation, direction: 'over' },
        },
      });
      await settle();
      release();
      for (let attempt = 0; attempt < 12; attempt += 1) await settle();
      assert.ok(
        !root.querySelector('[data-checks-simulator-readout]'),
        'the deferred result from the earlier inputs is dropped'
      );
    } finally {
      globalThis.Roll.prototype.evaluate = evaluate;
    }
  });
});

describe('the rolled readout, per check type and mode (issue 2080)', () => {
  const simple = (check, props = {}) =>
    mountChecks({ resolutionMode: 'simple', craftingCheck: null, craftingCheckSimple: check, ...props });
  const rolledAs = async (root, actor = 'sera') => {
    if (actor) await choosePreviewActor(root, actor);
    await rollAndSettle(root);
    return readReadout(root);
  };
  /** The values every injected rule matching `node` declares for `property`, in source order. */
  const declaredOn = (node, property) =>
    [...node.ownerDocument.styleSheets]
      .flatMap((sheet) => [...sheet.cssRules])
      .filter((rule) => rule.selectorText && node.matches(rule.selectorText))
      .map((rule) => rule.style.getPropertyValue(property))
      .filter(Boolean);
  const SUCCESS_ROWS = [
    ['result-group', 'Result group produced', 'full'],
    ['ingredients', 'Ingredients consumed', 'as listed'],
  ];
  const withTriggers = (check, triggers) => ({ ...check, checkBreakage: { triggers } });
  const stepTrigger = (mode, steps) => ({
    id: `step-${mode}`,
    condition: { type: 'rollTotal', operator: '>=', value: 1 },
    outcome: 'none',
    breakTools: false,
    tierStep: { mode, steps, tierId: null },
  });

  it('reads a pass/fail success against the DC alone, with no note, in the prototype regions', async () => {
    const root = await simple(SIMPLE_CHECK);
    assert.deepEqual(await rolledAs(root), {
      medallion: ['9', 'd20'],
      breakdown: 'd20 9 +3 · Sera Vane',
      total: '12',
      line: ['vs DC 10', ''],
      card: ['success', 'Success', 'The recipe’s result group is produced'],
      note: null,
      rows: SUCCESS_ROWS,
    });
    const readout = root.querySelector('[data-checks-simulator-readout]');
    const live = readout.closest('[data-checks-simulator-live]');
    assert.equal(live.getAttribute('aria-live'), 'polite', 'the whole announcement is one region');
    for (const part of ['medallion', 'band', 'facts-heading', 'fact']) {
      assert.ok(Boolean(readout.querySelector(`[data-checks-simulator-${part}]`)), `${part} is inside it`);
    }
    assert.ok(readout.querySelector('[data-checks-simulator-medallion] > .fab-medallion'));
    const heading = readout.querySelector('[data-checks-simulator-facts-heading]');
    assert.ok(heading.classList.contains('fab-kicker'), 'the heading is the shared Kicker');
    assert.equal(heading.textContent.trim(), 'What happens');
    for (const row of readout.querySelectorAll('[data-checks-simulator-fact]')) {
      assert.ok(row.classList.contains('is-line'), 'every row is the fact row’s line density');
    }
    const icon = readout.querySelector('[data-checks-simulator-band] .fab-medallion');
    assert.ok(icon.classList.contains('is-ink-success'), 'the card icon is the inked shared tile');
    assert.ok(Boolean(icon.querySelector('i.fa-circle-check')));
    const title = readout.querySelector('[data-checks-simulator-band-name]');
    assert.deepEqual(declaredOn(title, 'font-family'), ['var(--fab-font-serif)'], 'named in serif (M16)');
  });

  it('lists the failure policy, ingredients and tools from crafting’s own policies on a failure', async () => {
    const failing = { ...SIMPLE_CHECK, dc: 15 };
    const defaults = await rolledAs(await simple(failing));
    assert.deepEqual([defaults.line, defaults.card, defaults.note], [
      ['vs DC 15', ''],
      ['failure', 'Failure', 'Nothing is produced'],
      null,
    ]);
    assert.deepEqual(defaults.rows, [
      ['failure-result', 'Failure result if this recipe defines one', 'per recipe'],
      ['ingredients', 'Ingredients consumed', 'policy on'],
      ['tools', 'Tools survive', 'policy off'],
    ]);
    harness.remount();
    const authored = await simple(failing, {
      craftingFailureResultPolicy: 'never',
      craftingConsumption: { consumeIngredientsOnFail: false, breakToolsOnFail: true },
    });
    assert.deepEqual((await rolledAs(authored)).rows, [
      ['failure-result', 'Nothing produced', 'never'],
      ['ingredients', 'Ingredients returned', 'policy off'],
      ['tools', 'Required tools break', 'policy on'],
    ]);
    harness.remount();
    const always = await simple(failing, { craftingFailureResultPolicy: 'always' });
    assert.deepEqual((await rolledAs(always)).rows[0], [
      'failure-result',
      'Failure result produced',
      'always',
    ]);
  });

  it('reads salvage’s own item consumption and tool policy, never crafting’s (M11)', async () => {
    const root = await mountChecks({
      activity: 'salvage',
      salvageResolutionMode: 'simple',
      salvageCheckSimple: { ...SIMPLE_CHECK, dc: 15 },
      salvageConsumption: { consumeComponentOnFail: false, breakToolsOnFail: true },
      craftingConsumption: { consumeIngredientsOnFail: true, breakToolsOnFail: false },
      salvageFailureResultPolicy: 'always',
      activation: { salvage: { enabled: true, optional: false } },
      features: { salvage: true },
    });
    assert.equal(
      root.querySelector('[data-checks-simulator-roll]').textContent.trim(),
      'Roll a test salvage check'
    );
    assert.match(
      root.querySelector('[data-checks-simulator-state="pre-roll"]').textContent,
      /which outcome a salvageable item lands on/
    );
    assert.deepEqual((await rolledAs(root)).rows, [
      ['failure-result', 'Failure result produced', 'always'],
      ['ingredients', 'Item returned', 'policy off'],
      ['tools', 'Required tools break', 'policy on'],
    ]);
  });

  it('lists no ingredients or tool policy for gathering, only tools a trigger breaks (M11)', async () => {
    const gathering = (check, props = {}) =>
      mountChecks({
        activity: 'gathering',
        gatheringResolutionMode: 'routed',
        gatheringCheckRouted: check,
        ...props,
        craftingConsumption: { consumeIngredientsOnFail: true, breakToolsOnFail: true },
        activation: { gathering: { enabled: true, optional: false } },
        features: { gathering: true },
      });
    const failing = { ...ROUTED_CHECK, dc: 16, tiers: [] };
    const root = await gathering(failing);
    assert.equal(
      root.querySelector('[data-checks-simulator-roll]').textContent.trim(),
      'Roll a test gathering check'
    );
    const readout = await rolledAs(root);
    assert.deepEqual([readout.line, readout.card, readout.rows], [
      ['vs DC 16 · −4', 'margin'],
      ['failure', 'Flawed', 'Counts as a failure · result group bound to this tier'],
      [['failure-result', 'Failure result if this gathering task defines one', 'per gathering task']],
    ]);
    harness.remount();
    const breaking = { ...stepTrigger('none', 1), id: 'break', tierStep: undefined, breakTools: true };
    const broken = await gathering(withTriggers(failing, [breaking]), {
      gatheringFailureResultPolicy: 'never',
    });
    assert.deepEqual((await rolledAs(broken)).rows, [
      ['failure-result', 'Nothing produced', 'never'],
      ['tools', 'Required tools break', 'by trigger'],
    ], 'gathering’s own failure-result policy, and tools only a trigger breaks');
  });

  it('reads alchemy’s own consume flag on its simple check, not crafting’s', async () => {
    const root = await simple(
      { ...SIMPLE_CHECK, dc: 15 },
      {
        resolutionMode: 'alchemy',
        alchemyCheckMode: 'simple',
        alchemyConsumeOnFail: false,
        craftingConsumption: { consumeIngredientsOnFail: true, breakToolsOnFail: false },
      }
    );
    const { rows } = await rolledAs(root);
    assert.deepEqual(
      rows.find((row) => row[0] === 'ingredients'),
      ['ingredients', 'Ingredients returned', 'policy off']
    );
  });

  it('announces from one polite region that exists before the first roll (F10)', async () => {
    const root = await simple(SIMPLE_CHECK);
    await choosePreviewActor(root, 'sera');
    const live = root.querySelector('[data-checks-simulator-live]');
    assert.equal(live.getAttribute('aria-live'), 'polite');
    assert.ok(Boolean(live.querySelector('[data-checks-simulator-state="pre-roll"]')), 'it holds the hint');
    await rollAndSettle(root);
    assert.ok(root.querySelector('[data-checks-simulator-live]') === live, 'the same region');
    assert.ok(Boolean(live.querySelector('[data-checks-simulator-readout]')), 'it holds the readout');
    assert.ok(!live.querySelector('[aria-live]'), 'no region nests inside it');
  });

  it('keeps the Roll button focusable while rolling, marked aria-disabled (F11)', async () => {
    let release;
    const gate = new Promise((resolveGate) => {
      release = resolveGate;
    });
    const evaluate = globalThis.Roll.prototype.evaluate;
    globalThis.Roll.prototype.evaluate = async function deferred(...args) {
      await gate;
      return evaluate.apply(this, args);
    };
    try {
      const root = await simple(SIMPLE_CHECK);
      await choosePreviewActor(root, 'sera');
      const button = root.querySelector('[data-checks-simulator-roll]');
      button.click();
      await settle();
      assert.equal(button.disabled, false, 'a disabled button would drop focus mid-roll');
      assert.equal(button.getAttribute('aria-disabled'), 'true');
      release();
      for (let attempt = 0; attempt < 12; attempt += 1) await settle();
      assert.ok(!button.hasAttribute('aria-disabled'), 'and it clears once the roll lands');
    } finally {
      globalThis.Roll.prototype.evaluate = evaluate;
    }
  });

  it('notes a routed tier a trigger stepped, by direction and count', async () => {
    const up = await rolledAs(await mountChecks({ craftingCheck: withTriggers(ROUTED_CHECK, [stepTrigger('up', 1)]) }));
    assert.deepEqual([up.card[1], up.note], [
      'Fine',
      ['trigger', 'Trigger fired — the result steps up 1 tier.'],
    ]);
    harness.remount();
    const down = await rolledAs(
      await mountChecks({ craftingCheck: withTriggers(ROUTED_CHECK, [stepTrigger('down', 2)]) })
    );
    assert.deepEqual([down.card, down.note], [
      ['failure', 'Ruined', 'Counts as a failure · result group bound to this tier'],
      ['trigger', 'Trigger fired — the result steps down 2 tiers.'],
    ]);
  });

  it('notes a pass/fail outcome a trigger forced, either way (M17b)', async () => {
    const rescued = await rolledAs(
      await simple(withTriggers({ ...SIMPLE_CHECK, dc: 15 }, [forceTrigger('success')]))
    );
    assert.deepEqual([rescued.card, rescued.note, rescued.rows], [
      ['success', 'Success', 'The recipe’s result group is produced'],
      ['forced', 'Trigger fired — automatic success.'],
      SUCCESS_ROWS,
    ]);
    harness.remount();
    const sunk = await rolledAs(await simple(withTriggers(SIMPLE_CHECK, [forceTrigger('failure')])));
    assert.deepEqual([sunk.card[1], sunk.note], ['Failure', ['forced', 'Trigger fired — automatic failure.']]);
  });

  it('notes a routed outcome a trigger forced to the worst failing tier (M17b)', async () => {
    const forced = await rolledAs(
      await mountChecks({ craftingCheck: withTriggers(ROUTED_CHECK, [forceTrigger('failure')]) })
    );
    assert.deepEqual([forced.card, forced.note], [
      ['failure', 'Ruined', 'Counts as a failure · result group bound to this tier'],
      ['forced', 'Trigger fired — forced to the worst failing tier.'],
    ]);
  });

  it('reads a fixed-range tier as its band, with no margin', async () => {
    const fixed = {
      ...ROUTED_CHECK,
      type: 'fixed',
      fixedOutcomes: [
        { id: 'low', name: 'Low', start: 1, end: 9, success: false },
        { id: 'mid', name: 'Mid', start: 10, end: 14, success: true },
        { id: 'high', name: 'High', start: 15, end: 23, success: true },
      ],
    };
    const readout = await rolledAs(await mountChecks({ craftingCheck: fixed }));
    assert.deepEqual([readout.line, readout.card, readout.rows[0]], [
      ['in the 10–14 band', ''],
      ['success', 'Mid', 'Counts as a success · result group bound to this tier'],
      ['result-group', 'Result group produced', 'Mid'],
    ]);
  });

  describe('a progressive check', () => {
    const PROGRESSIVE = { awardMode: 'equal', rollFormula: '1d20 + @prof', checkBreakage: { triggers: [] } };
    const progressive = (check) =>
      mountChecks({ resolutionMode: 'progressive', craftingCheck: null, craftingCheckProgressive: check });

    it('spends the rolled value down the sandbox order, one row per awarded result (R8)', async () => {
      const readout = await rolledAs(await progressive({ ...PROGRESSIVE, preview: { difficulties: [6, 9] } }));
      assert.deepEqual(readout, {
        medallion: ['9', 'd20'],
        breakdown: 'd20 9 +3 · Sera Vane',
        total: '12',
        line: ['value spent', ''],
        card: ['success', '1 of 2 awarded', '6 left over — not enough for the next result'],
        note: null,
        rows: [['result-1', 'Result 1', 'awarded']],
      });
    });

    it('marks a partial award under a non-equal award mode', async () => {
      const check = { ...PROGRESSIVE, awardMode: 'partial', preview: { difficulties: [6, 9] } };
      assert.deepEqual((await rolledAs(await progressive(check))).rows, [
        ['result-1', 'Result 1', 'awarded'],
        ['result-2', 'Result 2', 'partial'],
      ]);
    });

    it('notes a forced award either way, in progressive terms (M17b)', async () => {
      const check = (outcome) =>
        withTriggers({ ...PROGRESSIVE, preview: { difficulties: [6, 9] } }, [forceTrigger(outcome)]);
      const all = await rolledAs(await progressive(check('success')));
      assert.deepEqual([all.card[1], all.note, all.rows.length], [
        '2 of 2 awarded',
        ['forced', 'Trigger fired — every result is awarded.'],
        2,
      ]);
      harness.remount();
      const none = await rolledAs(await progressive(check('failure')));
      assert.deepEqual([none.card[0], none.note, none.rows], [
        'failure',
        ['forced', 'Trigger fired — nothing is awarded.'],
        [['nothing', 'Nothing recovered', '—']],
      ]);
    });
  });

  it('still reads an unresolved roll, beside the warning that it is not a real total', async () => {
    const root = await mountChecks();
    const readout = await rolledAs(root, 'bare');
    assert.deepEqual([readout.breakdown, readout.total, readout.line], [
      'd20 9 +0 · Bare Hands',
      '9',
      ['vs DC 12 · −3', 'margin'],
    ]);
    assert.ok(root.querySelector('[data-checks-simulator-note="unresolved"]'));
  });

  it('reads a dynamic DC against its static fallback, the macro note outside the card', async () => {
    const root = await simple({ ...SIMPLE_CHECK, dcMode: 'dynamic', macroUuid: 'Macro.x' });
    const readout = await rolledAs(root);
    assert.deepEqual([readout.line, readout.note], [['vs DC 10', ''], null]);
    assert.ok(root.querySelector('[data-checks-simulator-note="dynamic-dc"]'));
  });

  describe('roll-under and character value', () => {
    const underFixed = { product: 'sum', direction: 'under', target: { source: 'fixed' } };
    const attribute = (direction, expression) => ({
      product: 'sum',
      direction,
      target: { source: 'attribute', expression, adjustmentKind: 'add', baseAdjustment: 0 },
    });

    it('reads a fixed roll-under failure by its total, raw faces, margin and note (M7)', async () => {
      const root = await simple({ ...SIMPLE_CHECK, rollFormula: '1d20', dc: 8, evaluation: underFixed });
      assert.deepEqual(await rolledAs(root, null), {
        medallion: ['9', 'total'],
        breakdown: '9 · raw',
        total: '9',
        line: ['target 8 · margin −1', 'margin'],
        card: ['failure', 'Failure', 'Nothing is produced'],
        note: MARGIN_NOTES.under,
        rows: [['failure-result', 'Failure policy applies', 'per recipe']],
      });
    });

    it('reads routed tiers against a fixed target', async () => {
      const check = { ...ROUTED_CHECK, rollFormula: '1d20', evaluation: underFixed };
      assert.deepEqual(await rolledAs(await mountChecks({ craftingCheck: check })), {
        medallion: ['9', 'total'],
        breakdown: '9 · raw · Sera Vane',
        total: '9',
        line: ['target 12 · margin +3', 'margin'],
        card: ['success', 'Success', 'The recipe’s result group is produced'],
        note: MARGIN_NOTES.under,
        rows: [['result-group', 'Result group produced', 'Success']],
      });
    });

    it('reads an added character value over, with no raw, and notes the margin over (R4)', async () => {
      const root = await simple({ ...SIMPLE_CHECK, evaluation: attribute('over', '@prof + 8') });
      const readout = await rolledAs(root);
      assert.deepEqual([readout.medallion, readout.breakdown, readout.line, readout.note], [
        ['12', 'total'],
        '9 + 3 · Sera Vane',
        ['target 11 · margin +1', 'margin'],
        MARGIN_NOTES.over,
      ]);
    });

    it('reads an added character value under, with raw faces', async () => {
      const root = await simple({
        ...SIMPLE_CHECK,
        rollFormula: '1d20',
        evaluation: attribute('under', '@prof + 9'),
      });
      const readout = await rolledAs(root);
      assert.deepEqual([readout.breakdown, readout.line, readout.card[1], readout.note], [
        '9 · raw · Sera Vane',
        ['target 12 · margin +3', 'margin'],
        'Success',
        MARGIN_NOTES.under,
      ]);
    });
  });
});

describe('the Preview’s additional-dice stepper (issue 2008)', () => {
  const PATH = 'system.resources.momentum.value';
  const calls = { updates: [], macros: [] };
  const balance = (id, name, resources = {}) => ({
    id,
    name,
    type: 'character',
    _source: { system: { resources } },
    overrides: {},
    getRollData: () => ({}),
    update: async (change) => {
      calls.updates.push(change);
    },
  });
  const ACTORS = [balance('sera', 'Sera Vane', { momentum: { value: 2 } }),
    balance('bare', 'Bare Hands'),
  ];
  const paid = (rule = {}) => ({
    rollFormula: '',
    dc: 10,
    thresholdMode: 'meet',
    dcMode: 'static',
    evaluation: {
      product: 'count',
      direction: 'over',
      pool: {
        die: 10,
        base: '2',
        threshold: '8',
        required: 1,
        additionalDice: { enabled: true, source: 'path', path: PATH, max: 3, label: 'Momentum', ...rule },
      },
    },
    checkBreakage: { triggers: [] },
    tiers: [],
  });
  const MACROS = { source: 'macro', readMacroUuid: 'Macro.read', spendMacroUuid: 'Macro.spend' };
  const saved = {};
  let dice = null;

  before(() => {
    Object.assign(saved, { actors: globalThis.game.actors, foundry: globalThis.foundry });
    Object.assign(saved, { fromUuid: globalThis.fromUuid });
    Object.assign(globalThis.game, {
      actors: { contents: ACTORS, get: (id) => ACTORS.find((a) => a.id === id) },
    });
    const getProperty = (object, key) => key.split('.').reduce((node, part) => node?.[part], object);
    const hasProperty = (object, key) => getProperty(object, key) !== undefined;
    // The drop zones resolve the macros' names; only a RUN executes the command, which records it.
    const run = (uuid) => `globalThis.previewMacroRuns.push('${uuid}'); return 9;`;
    Object.assign(globalThis, {
      foundry: { utils: { getProperty, hasProperty } },
      previewMacroRuns: calls.macros,
      fromUuid: async (uuid) => ({ name: uuid, type: 'script', command: run(uuid) }),
    });
  });
  after(() => {
    Object.assign(globalThis.game, { actors: saved.actors });
    Object.assign(globalThis, { foundry: saved.foundry, fromUuid: saved.fromUuid });
    delete globalThis.previewMacroRuns;
  });
  afterEach(() => {
    dice?.restore();
    dice = null;
    calls.updates.length = 0;
    calls.macros.length = 0;
  });

  const field = (root) => root.querySelector('[data-checks-preview-additional-dice-field]');
  const input = (root) => root.querySelector('input[data-checks-preview-additional-dice]');
  const note = (root) => root.querySelector('[data-checks-preview-additional-dice-note]');
  const tileMarks = (root) =>
    [...root.querySelectorAll('[data-checks-simulator-face]')].map(
      (tile) => tile.dataset.checksSimulatorFaceMarks
    );

  async function mountPaid(rule = {}) {
    return mountChecks({ resolutionMode: 'simple', craftingCheckSimple: paid(rule) });
  }

  async function step(root, times) {
    for (let index = 0; index < times; index += 1) {
      field(root).querySelector('[data-stepper-increment]').click();
      await settle();
    }
  }

  async function rollFaces(root, faces) {
    dice = installCountDice({ faces, chat: false });
    await rollAndSettle(root);
  }

  it('captions a stepper above Roll, bounded by the Preview-as actor’s stored balance', async () => {
    const root = await mountPaid();
    await settle();
    assert.equal(note(root).textContent.trim(), 'Choose a character to see how many they can add.');
    assert.ok(input(root).disabled, 'no Preview-as actor, so nothing can be added');
    await choosePreviewActor(root, 'sera');
    const caption = field(root).querySelector('.manager-checks-simulator-extra-title');
    assert.equal(caption.textContent.trim(), 'Additional dice', 'a visible caption names it');
    assert.equal(input(root).getAttribute('aria-label'), 'Additional dice');
    assert.equal(input(root).getAttribute('aria-describedby'), note(root).id);
    assert.deepEqual(
      [input(root).value, input(root).getAttribute('max'), note(root).dataset.checksPreviewAdditionalDiceNote],
      ['0', '2', 'path']
    );
    assert.equal(note(root).textContent.trim(), 'Up to 2 for Sera Vane (Momentum 2, at most 3 per roll).');
    const roll = root.querySelector('[data-checks-simulator-roll]');
    assert.ok(field(root).compareDocumentPosition(roll) & Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('rolls the stepped dice as bought tiles, the odds, the inset and the balance unchanged', async () => {
    const root = await mountPaid();
    await choosePreviewActor(root, 'sera');
    const readings = () => [
      root.querySelector('[data-checks-odds-state]').textContent,
      root.querySelector('[data-check-count-composed]')?.textContent ?? '',
    ];
    const before = readings();
    await step(root, 1);
    assert.equal(input(root).value, '1');
    assert.deepEqual(readings(), before, 'the odds and the inset read the base pool alone');
    await rollFaces(root, [9, 3, 8]);
    assert.deepEqual(tileMarks(root), ['qualified', '', 'qualified bought']);
    assert.match(root.querySelector('[data-checks-simulator-legend]').textContent, /dashed\u{A0}=\u{A0}bought/u);
    assert.deepEqual([calls.updates, calls.macros], [[], []], 'the preview reads and spends nothing');
  });

  it('clamps a count left above a lowered bound, so it is never rolled', async () => {
    const root = await mountPaid();
    await choosePreviewActor(root, 'sera');
    await step(root, 2);
    assert.equal(input(root).value, '2');
    await choosePreviewActor(root, 'bare');
    assert.equal(input(root).value, '0');
    assert.equal(
      note(root).textContent.trim(),
      `Bare Hands has no stored number at ${PATH}, so no dice can be added.`
    );
    await rollFaces(root, [9, 3, 8, 8]);
    assert.deepEqual(tileMarks(root), ['qualified', ''], 'the base pool alone rolls');
  });

  it('bounds a macro source by its most per roll, running neither macro', async () => {
    const root = await mountPaid({ ...MACROS, max: 2 });
    await settle();
    assert.equal(
      note(root).textContent.trim(),
      'The preview never runs the read macro, so up to 2 can be added here.'
    );
    await step(root, 3);
    assert.equal(input(root).value, '2');
    await rollFaces(root, [9, 3, 8, 2]);
    assert.deepEqual(tileMarks(root), ['qualified', '', 'qualified bought', 'bought']);
    assert.deepEqual([calls.updates, calls.macros], [[], []]);
  });

  it('offers no stepper while the check allows no additional dice', async () => {
    const root = await mountPaid({ enabled: false });
    await choosePreviewActor(root, 'sera');
    assert.ok(!field(root), 'no stepper');
    await rollFaces(root, [9, 3, 8]);
    assert.deepEqual(tileMarks(root), ['qualified', '']);
  });
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
