/** The gathering task editor's seven migrated numeric fields, MOUNTED (issue 1050). */
import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

import {
  SEARCHABLE_POPOVER_RAW_MODULES,
  SELECT_COMPILED_MODULES,
  TYPEAHEAD_RUNE_MODULES,
  createMountedComponentHarness,
} from '../helpers/svelte-component-harness.js';
import { stepMigratedNumberField, stepNativeNumberInput } from '../helpers/numericKeyboardStep.js';
// The editor's seven converted pickers are opened and clicked through the shared helper (issue 1510).
import {
  assertSelectHasResolvedName,
  chooseSelectOption,
  closeSelectPanel,
  selectOptionValues,
  selectTriggerText,
} from '../helpers/select-control.js';
import { scopedComponentCss } from '../helpers/scoped-component-css.js';
import { FOUNDRY_BRIDGE_RAW_MODULES } from '../helpers/foundryBridgeModules.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const EDITOR_PATH = 'src/ui/svelte/apps/manager/GatheringTaskEditView.svelte';

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-gathering-task-stepper-',
  runeModules: TYPEAHEAD_RUNE_MODULES,
  rawModules: [
    // Issue 1504: the raw closure the shared `<Select>` reaches through `SearchablePopover`.
    ...SEARCHABLE_POPOVER_RAW_MODULES,
    // The SHARED subject check-modifier picker's resolver (issue 1095).
    'src/systems/characterLibraries.js',
    'src/systems/checkModifierResolver.js',
    'src/systems/checkModifierRouter.js',
    'src/systems/salvageCheckUsability.js',
    'src/utils/checkModifierPicks.js',
    'src/systems/toolCheckBonus.js',
    'src/utils/craftingCheckExpression.js',
    'src/utils/rollExpressionAverage.js',
    'src/utils/rollFormulaRollability.js',
    ...FOUNDRY_BRIDGE_RAW_MODULES,
    'src/ui/svelte/util/listReorderAnnouncement.js',
    'src/ui/svelte/components/stepperLabels.js',
    'src/ui/svelte/util/dropRateTier.js',
    'src/ui/svelte/actions/dragDrop.js',
    'src/ui/svelte/actions/dismissOnOutsideClick.js',
    // The availability menus and `ModifierPillSelect`'s add menu are `SearchablePopover`
    // now (issue 1458), which portals its panel and lays it out against the trigger.
    'src/ui/svelte/actions/portal.js',
    'src/ui/svelte/actions/anchoredPopover.js',
    'src/ui/svelte/util/overlayBounds.js',
    'src/ui/svelte/util/iconPickerPopover.js',
    'src/ui/svelte/util/listboxNavigation.js',
    'src/ui/svelte/util/pickerOptionModel.js',
    'src/ui/svelte/util/overlayHost.js',
    'src/gatheringImageDefaults.js',
    'src/ui/model/complicationSummary.js',
    'src/systems/characterPrerequisites.js',
    // The seven converted option vocabularies (issue 1510).
    'src/ui/svelte/apps/manager/gatheringTaskSelectOptions.js',
    // The task check override reads the evaluation and formats an adjustment (issue 2005).
    'src/systems/normalize/checkEvaluation.js',
    'src/ui/svelte/apps/manager/checks/checkAdjustmentLabel.js',
    'src/utils/checkAdjustmentFormat.js',
    'src/utils/scalars.js',
    'src/ui/svelte/apps/manager/checks/checksCopy.js',
    // Its Player sees line, which resolves the target and names the Preview-as character.
    'src/systems/checkTarget.js',
    'src/systems/checkEvaluation.js',
    'src/utils/localizeWithFallback.js',
    'src/ui/svelte/apps/manager/checks/previewActorId.js',
    'src/ui/svelte/apps/manager/component/overridePlayerSees.js',
    // A count check's override and line (issue 2006): its copy, and the count description.
    'src/ui/svelte/apps/manager/component/taskOverrideCopy.js',
    'src/systems/countCheck.js',
    'src/systems/countEvaluation.js',
  ],
  // A component missing here does not fail this suite — it HANGS it, reported as `# cancelled`.
  compiledModules: [
    'src/ui/svelte/components/Stepper.svelte',
    'src/ui/svelte/components/ChanceSlider.svelte',
    'src/ui/svelte/components/Pagination.svelte',
    // Issue 1504: the shared `<Select>`'s whole compiled closure.
    ...SELECT_COMPILED_MODULES,
    'src/ui/svelte/components/RadioCardGroup.svelte',
    'src/ui/svelte/components/RowDisclosure.svelte',
    'src/ui/svelte/apps/manager/ComplicationSummaryRow.svelte',
    'src/ui/svelte/apps/manager/recipe/RecipeResultsSection.svelte',
    // The result group card renders the product's ONE ordered list (issue 1512) and the stage's
    // complication band through it.
    'src/ui/svelte/components/SortableList.svelte',
    'src/ui/svelte/apps/manager/recipe/RecipeStageComplicationBand.svelte',
    'src/ui/svelte/apps/manager/recipe/RecipeResultGroupCard.svelte',
    'src/ui/svelte/apps/manager/recipe/RecipeResultItemRow.svelte',
    'src/ui/svelte/apps/manager/recipe/RecipeRoutingAssignment.svelte',
    // The SHARED subject check-modifier picker (issue 1095) and the two primitives it
    // renders. Omitting a `.svelte` the tree reaches HANGS the suite (# cancelled).
    'src/ui/svelte/apps/manager/SubjectModifierPicker.svelte',
    'src/ui/svelte/components/SelectionCheckbox.svelte',
    'src/ui/svelte/components/IconButton.svelte',
    'src/ui/svelte/components/ModifierPillSelect.svelte',
    'src/ui/svelte/components/StatusToggle.svelte',
    'src/ui/svelte/components/ManagerSearchField.svelte',
    'src/ui/svelte/components/Notice.svelte',
    'src/ui/svelte/apps/manager/checks/PreviewAsPicker.svelte',
    'src/ui/svelte/components/Callout.svelte',
    'src/ui/svelte/components/Kicker.svelte',
    'src/ui/svelte/apps/manager/component/OverridePlayerSees.svelte',
    EDITOR_PATH,
  ],
  componentPath: EDITOR_PATH,
});

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

/** A task with every migrated field populated: both economy cards on. */
function taskFixture() {
  return {
    id: 'task-1',
    name: 'Forage',
    dropRows: [],
    staminaCost: 3,
    staminaCostModifiers: [{ id: 'mod-row-1', modifierId: 'mod-a', operator: '+', min: 2, max: 9 }],
    dcOverride: 14,
    nodes: {
      enabled: true,
      max: 4,
      current: 4,
      respawn: {
        policy: 'overTime',
        intervalUnit: 'hours',
        intervalAmount: 6,
        gainMode: 'chance',
        chance: 0.25,
      },
    },
  };
}

/** Mount the editor and return its recorded `onUpdateTask` payloads plus a field lookup. */
async function mountEditor(resolutionMode = 'routed') {
  const updates = [];
  let task = taskFixture();
  const root = await harness.mount({
    task,
    staminaEnabled: true,
    nodesEnabled: true,
    // `routed`, because the DC override card renders only under a routed gathering check
    // (`dcOverrideEnabled`) — under `d100` the field this suite's headline case drives does not
    // exist at all.
    resolutionMode,
    characterModifierLibrary: [
      { id: 'mod-a', label: 'Herbalism' },
      { id: 'mod-b', label: 'Prospecting' },
    ],
    // The converted default-environment picker has rows only when the parent feeds it some.
    environmentOptions: [
      { id: 'env-forest', name: 'Old Forest' },
      { id: 'env-cave', name: 'Deep Cave' },
    ],
    onUpdateTask: (patch) => {
      updates.push(patch);
      task = { ...task, ...patch };
    },
  });
  return {
    root,
    updates,
    /** Feed the recorded patches back in, the way the real host does. */
    sync: () => harness.setProps({ task }),
    /** The real `<input>` behind a Stepper, located by its test hook or its accessible name. */
    field: (selector) => {
      const input = root.querySelector(selector);
      assert.ok(Boolean(input), `expected a mounted field matching ${selector}`);
      assert.equal(input.tagName, 'INPUT', `${selector} must resolve to the real <input>`);
      return input;
    },
  };
}

/** Clear a field the way a user does, firing the real `input` event the commit path listens on. */
function clear(input) {
  input.value = '';
  input.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
}

/** The value the last recorded patch wrote at `path`, or `undefined` when no patch touched it. */
function lastWrite(updates, read) {
  for (let index = updates.length - 1; index >= 0; index -= 1) {
    const value = read(updates[index]);
    if (value !== undefined) return value;
  }
  return undefined;
}

// The genuine-absence fields, and the write each one has to produce when cleared. Driven as a
// table for the same reason the source contract is: the assertions are identical and only the
// field and its expected write differ.
const CLEARS_TO_ABSENCE = [
  {
    id: 'dcOverride',
    selector: '[data-gathering-task-dc-override]',
    read: (patch) => patch.dcOverride,
    expected: null,
  },
  {
    id: 'nodes.max',
    selector: '[data-gathering-task-node-count]',
    // Clearing the pool nulls the whole `nodes` object.
    read: (patch) => patch.nodes,
    expected: null,
  },
  {
    id: 'stamina modifier min',
    selector: 'input[aria-label="Minimum"]',
    read: (patch) => patch.staminaCostModifiers?.[0]?.min,
    expected: null,
  },
  {
    id: 'stamina modifier max',
    selector: 'input[aria-label="Maximum"]',
    read: (patch) => patch.staminaCostModifiers?.[0]?.max,
    expected: null,
  },
];

// The cosmetic-zero fields. The invariant is deliberately NOT "clearing persists 0":
const NEVER_RECEIVES_NULL = [
  {
    id: 'staminaCost',
    selector: '[data-gathering-task-stamina-cost]',
    read: (patch) => patch.staminaCost,
  },
  {
    id: 'respawn.intervalAmount',
    selector: '[data-gathering-task-node-interval]',
    read: (patch) => patch.nodes?.respawn?.intervalAmount,
  },
  {
    id: 'respawn.chance',
    selector: '[data-gathering-task-node-chance]',
    read: (patch) => patch.nodes?.respawn?.chance,
  },
];

describe('Gathering task editor steppers (issue 1050)', () => {
  // ── Two adds on one screen, two roles.
  it('paints Add modifier as a dashed append and Add drop rule as the toolbar primary', async () => {
    const { root } = await mountEditor('d100');

    const addModifier = root.querySelector('[data-gathering-add-stamina-modifier]');
    assert.ok(Boolean(addModifier), 'the stamina card renders its Add modifier control');
    assert.ok(
      addModifier.classList.contains('fab-manager-button'),
      `Add modifier renders through the ManagerButton primitive, got ${addModifier.className}`
    );
    assert.ok(
      addModifier.classList.contains('is-dashed'),
      `Add modifier takes the dashed append role, got ${addModifier.className}`
    );
    assert.ok(
      !addModifier.classList.contains('is-full-width'),
      `and is deliberately NOT full width, got ${addModifier.className}`
    );

    const addDrop = root.querySelector('[data-gathering-add-drop="toolbar"]');
    assert.ok(Boolean(addDrop), 'the drops toolbar renders its Add drop rule control');
    assert.ok(
      addDrop.classList.contains('fab-manager-button'),
      `Add drop rule renders through the ManagerButton primitive, got ${addDrop.className}`
    );
    assert.ok(
      addDrop.classList.contains('is-primary'),
      `Add drop rule takes the primary role, got ${addDrop.className}`
    );
    assert.ok(
      !addDrop.classList.contains('is-dashed'),
      `and not the append role that belongs to the control above, got ${addDrop.className}`
    );
    assert.ok(
      !addModifier.classList.contains('is-primary'),
      `nor Add modifier the toolbar create role, got ${addModifier.className}`
    );
  });

  it('renders every migrated field as a real number input inside a Stepper', async () => {
    // Fail closed: if a selector stopped resolving.
    const { field } = await mountEditor();
    for (const { selector } of [...CLEARS_TO_ABSENCE, ...NEVER_RECEIVES_NULL]) {
      assert.equal(field(selector).type, 'number', `${selector} is still a number input`);
      assert.ok(
        Boolean(field(selector).closest('.fab-stepper')),
        `${selector} sits inside the shared Stepper rather than standing bare`
      );
    }
  });

  it('persists absence when a genuine-absence field is cleared', async () => {
    for (const testCase of CLEARS_TO_ABSENCE) {
      const { field, updates } = await mountEditor();
      clear(field(testCase.selector));
      assert.equal(
        lastWrite(updates, testCase.read),
        testCase.expected,
        `${testCase.id}: clearing it must persist absence, not the 0 that Number(null) coerces to`
      );
      harness.remount();
    }
  });

  it('never hands a cosmetic-zero field null, and still commits a real edit', async () => {
    for (const testCase of NEVER_RECEIVES_NULL) {
      const { field, updates } = await mountEditor();
      const input = field(testCase.selector);
      clear(input);
      assert.ok(
        !updates.some((patch) => testCase.read(patch) === null),
        `${testCase.id}: 0 is its real persisted value, so null must never reach its update function`
      );
      // The other half: a field that committed nothing at all would pass the assertion above
      // vacuously.
      const stepped = Number(stepNativeNumberInput(input, 'up'));
      assert.ok(Number.isFinite(stepped), `${testCase.id}: the field still steps`);
      assert.notEqual(
        lastWrite(updates, testCase.read),
        undefined,
        `${testCase.id}: and the step reaches the update function`
      );
    }
  });

  it('still steps from the keyboard, which is native number-input behaviour', async () => {
    // Phase 3's keyboard non-regression check. `Stepper` has no keydown handler of its own.
    const { field, updates, sync } = await mountEditor();
    const dc = field('[data-gathering-task-dc-override]');
    assert.equal(
      stepMigratedNumberField(dc, 'up', 'the DC override'),
      '15',
      'ArrowUp steps the displayed value'
    );
    assert.equal(lastWrite(updates, (patch) => patch.dcOverride), 15, 'and commits it');
    await sync();
    assert.equal(stepNativeNumberInput(dc, 'down'), '14', 'ArrowDown steps it back');
    assert.equal(lastWrite(updates, (patch) => patch.dcOverride), 14, 'and commits that too');
  });

  it('commits a four-digit interval, steps it and preserves the amount when its unit changes', async () => {
    const { root, field, updates, sync } = await mountEditor();
    const input = field('[data-gathering-task-node-interval]');
    const read = (patch) => patch.nodes?.respawn;
    input.value = '1440';
    input.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
    await sync();
    assert.equal(input.value, '1440');
    assert.equal(lastWrite(updates, read).intervalAmount, 1440);

    input.closest('.fab-stepper').querySelectorAll('button')[1].click();
    await sync();
    assert.equal(input.value, '1441');
    assert.equal(lastWrite(updates, read).intervalAmount, 1441);
    stepNativeNumberInput(input, 'down');
    await sync();

    const unit = '[data-gathering-task-node-interval-unit]';
    assert.equal(root.querySelector(unit).tagName, 'BUTTON', 'the unit control is a trigger now');
    chooseSelectOption(root, unit, 'minutes');
    await sync();
    assert.equal(lastWrite(updates, read).intervalUnit, 'minutes');
    assert.equal(lastWrite(updates, read).intervalAmount, 1440);
    assert.equal(input.value, '1440');
    // The harness localizes to the key, so every label here is the call site's own fallback.
    assert.equal(selectTriggerText(root, unit), 'minutes', 'and the trigger reads the chosen unit');
  });

  it('lets the respawn unit picker size to its content, on specificity not source order', () => {
    // The attribute qualifier makes it win; `:global()` is what lets it reach the trigger at all.
    const compiled = scopedComponentCss(resolve(repoRoot, EDITOR_PATH)).css;
    const rule =
      /\.manager-task-node-interval-row[^{]*\.fabricate-select-trigger\[data-gathering-task-node-interval-unit\][^{]*\{[^}]*\}/.exec(
        compiled.replace(/\/\*[\s\S]*?\*\//g, '')
      );
    assert.ok(Boolean(rule), 'the interval-row trigger rule survives compilation');
    const selector = rule[0].split('{')[0];
    // `:where()` is free, so it is excluded from the count on purpose.
    const classColumn = selector.replace(/:where\([^)]*\)/g, '').match(/\.[\w-]+|\[[^\]]+\]/g);
    assert.ok(
      classColumn.length > 2,
      `${selector.trim()} must out-specify a two-class caller rule, `
        + `but its class column is ${classColumn.length}`
    );
    assert.match(rule[0], /width: auto/, 'and it is the width that is being released');
  });

  // ── The seven converted pickers (issue 1510), each driven rather than read.
  const CONVERTED = [
    {
      id: 'default environment',
      trigger: '[data-gathering-task-field="defaultEnvironmentId"]',
      name: 'Default environment (canvas drop)',
      offers: ['__unchanged__', 'env-forest', 'env-cave'],
      choose: 'env-cave',
      read: (patch) => patch.defaultEnvironmentId,
      expected: 'env-cave',
    },
    {
      id: 'stamina cost modifier',
      trigger: '.fabricate-select-trigger[aria-label="Per-actor cost modifiers"]',
      name: 'Per-actor cost modifiers',
      offers: ['mod-a', 'mod-b'],
      choose: 'mod-b',
      read: (patch) => patch.staminaCostModifiers?.[0]?.modifierId,
      expected: 'mod-b',
    },
    {
      id: 'stamina modifier sign',
      trigger: '.fabricate-select-trigger[aria-label="Operator"]',
      name: 'Operator',
      offers: ['-', '+'],
      choose: '-',
      read: (patch) => patch.staminaCostModifiers?.[0]?.operator,
      expected: '-',
    },
    {
      id: 'deplete',
      trigger: '[data-gathering-task-node-deplete]',
      name: 'Deplete',
      offers: ['onStart', 'onSuccess'],
      choose: 'onSuccess',
      read: (patch) => patch.nodes?.depletionTiming,
      expected: 'onSuccess',
    },
    {
      id: 'respawn policy',
      trigger: '[data-gathering-task-node-respawn]',
      name: 'Respawn',
      offers: ['manual', 'overTime', 'nonRegenerating'],
      choose: 'nonRegenerating',
      read: (patch) => patch.nodes?.respawn?.policy,
      expected: 'nonRegenerating',
    },
    {
      id: 'respawn interval unit',
      trigger: '[data-gathering-task-node-interval-unit]',
      name: 'Respawn interval unit',
      offers: ['minutes', 'hours', 'days', 'weeks'],
      choose: 'days',
      read: (patch) => patch.nodes?.respawn?.intervalUnit,
      expected: 'days',
    },
    {
      id: 'gain mode',
      trigger: '[data-gathering-task-node-gain-mode]',
      name: 'Each interval',
      offers: ['guaranteed', 'chance', 'expression'],
      choose: 'expression',
      read: (patch) => patch.nodes?.respawn?.gainMode,
      expected: 'expression',
    },
  ];

  it('renders every converted picker as a named trigger, offering the rows it used to', async () => {
    const { root } = await mountEditor();
    for (const control of CONVERTED) {
      const trigger = root.querySelector(control.trigger);
      assert.ok(Boolean(trigger), `${control.id}: no trigger matches ${control.trigger}`);
      assert.equal(trigger.tagName, 'BUTTON', `${control.id} renders the shared picker's trigger`);
      assert.equal(
        assertSelectHasResolvedName(root, control.trigger),
        control.name,
        `${control.id} resolves to its pinned accessible name`
      );
      assert.deepEqual(
        selectOptionValues(root, control.trigger),
        control.offers,
        `${control.id} offers the rows its <option> list did`
      );
      // One panel at a time: a list left open is the one the next lookup would find.
      closeSelectPanel(root, control.trigger);
    }
  });

  it('describes the default-environment picker by the hint that sits beside it', async () => {
    // The `Field` host is a `<div>` now, so the hint is no longer part of the computed name and
    // has to be referenced explicitly (issue 1510).
    const { root } = await mountEditor();
    const picker = '[data-gathering-task-field="defaultEnvironmentId"]';
    const trigger = root.querySelector(picker);
    const described = (trigger.getAttribute('aria-describedby') ?? '').trim();
    assert.ok(described.length > 0, `${picker} carries no \`aria-describedby\` at all`);
    const hint = trigger.ownerDocument.getElementById(described);
    assert.ok(
      Boolean(hint),
      `${picker} points \`aria-describedby\` at "${described}", which names no element`
    );
    assert.match(
      hint.textContent.replaceAll(/\s+/gu, ' ').trim(),
      /tagged scene region/u,
      'and the element it names is the canvas-drop hint, not another caption'
    );
  });

  it('clears the default environment back to the sentinel', async () => {
    const { root, updates, sync } = await mountEditor();
    const picker = '[data-gathering-task-field="defaultEnvironmentId"]';
    const read = (patch) => patch.defaultEnvironmentId;
    chooseSelectOption(root, picker, 'env-cave');
    await sync();
    assert.equal(lastWrite(updates, read), 'env-cave', 'choosing an environment persists its id');
    assert.equal(selectTriggerText(root, picker), 'Deep Cave', 'and the trigger reads it back');

    chooseSelectOption(root, picker, '__unchanged__');
    await sync();
    assert.equal(
      lastWrite(updates, read),
      null,
      'choosing the sentinel row must clear the default environment, not persist an empty string'
    );
    assert.equal(
      selectTriggerText(root, picker),
      'None (ask on drop)',
      'and the trigger reads the sentinel back'
    );
  });

  it('forwards the chosen value of every converted picker to the update function', async () => {
    for (const control of CONVERTED) {
      const { root, updates } = await mountEditor();
      chooseSelectOption(root, control.trigger, control.choose);
      assert.equal(
        lastWrite(updates, control.read),
        control.expected,
        `${control.id}: choosing ${control.choose} must reach the update function`
      );
      harness.remount();
    }
  });
});

// ── Issue 2005 (R3): one override field, labelled for the routed check's target ─────────
describe('the task check override follows the routed check evaluation (issue 2005)', () => {
  const evaluation = ({ direction = 'under', source = 'attribute', kind = 'add' } = {}) => ({
    product: 'sum',
    direction,
    target: { source, expression: '@skills.smith.level', adjustmentKind: kind },
  });

  const CHARACTERS = {
    'actor-sera': { name: 'Sera Vane', rollData: { skills: { smith: { level: 12 } } } },
    'actor-idrin': { name: 'Idrin Ashfall', rollData: {} },
  };
  const ROSTER = [
    { id: 'actor-sera', name: 'Sera Vane', img: '' },
    { id: 'actor-idrin', name: 'Idrin Ashfall', img: '' },
  ];

  async function mountOverride(task, config, roster = ROSTER) {
    const updates = [];
    let current = { id: 'task-1', name: 'Riverbed Ore', dropRows: [], ...task };
    const root = await harness.mount({
      task: current,
      resolutionMode: 'routed',
      checkConfig: { thresholdMode: 'meet', ...config },
      previewActors: roster,
      resolvePreviewCharacter: (id) => CHARACTERS[id] ?? null,
      onUpdateTask: (patch) => {
        updates.push(patch);
        current = { ...current, ...patch };
      },
    });
    const card = () => root.querySelector('[data-gathering-task-dc]');
    return {
      root,
      updates,
      card,
      sync: () => harness.setProps({ task: current }),
      heading: () => card().querySelector('h3').textContent.trim(),
      hint: () => card().querySelector('.manager-muted').textContent.trim(),
      label: () => card().querySelector('.manager-task-dc-field > span').textContent.trim(),
      input: () =>
        card().querySelector(
          '[data-gathering-task-dc-override], [data-gathering-task-adjustment-override]'
        ),
      kept: () =>
        root.querySelector('[data-gathering-task-override-kept]')?.textContent.trim() ?? '',
      sees: () =>
        card().querySelector('[data-override-player-sees-line]')?.textContent.trim() ?? '',
      note: () =>
        card().querySelector('[data-override-player-sees-note]')?.textContent.trim() ?? '',
      previewAs: async (actorId) => {
        card().querySelector('[data-override-preview-actor]').click();
        await harness.setProps({});
        root.querySelector(`[data-popover-option="${actorId}"]`).click();
        await harness.setProps({});
      },
    };
  }

  function commit(input, raw) {
    input.value = raw;
    input.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
    input.dispatchEvent(
      new globalThis.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    );
  }

  it('a roll-under fixed target labels the one field Target, with no preset Select', async () => {
    const view = await mountOverride(
      { dcOverride: null, adjustmentOverride: 2 },
      { evaluation: evaluation({ source: 'fixed' }) }
    );
    assert.equal(view.card().dataset.gatheringTaskOverrideField, 'dcOverride');
    assert.equal(view.heading(), 'Target override');
    assert.equal(
      view.hint(),
      'Replaces the system target for this task. The total must stay at or under it.'
    );
    assert.equal(view.label(), 'Target');
    assert.equal(view.input().placeholder, 'System default');
    assert.ok(!view.card().querySelector('.fabricate-select-trigger'), 'R3: no preset Select');
    assert.equal(
      view.kept(),
      'A difficulty adjustment override of +2 is kept on this task. This system does not read it, so it is not shown for editing.'
    );
    assert.ok(
      view.root.querySelector('[data-gathering-task-override-kept]').classList.contains('manager-callout'),
      'the kept value is a standing Callout, as frame 24 draws it'
    );

    view.input().value = '12';
    view.input().dispatchEvent(new globalThis.Event('input', { bubbles: true }));
    assert.deepEqual(view.updates.at(-1), { dcOverride: 12 }, 'it writes only the DC override');
    assert.equal(view.sees(), 'Riverbed Ore · stay at or under 15', 'the line read the system target');
    await view.sync();
    assert.equal(view.sees(), 'Riverbed Ore · stay at or under 12', 'and follows the override');
    assert.ok(!view.card().querySelector('[data-override-preview-actor]'), 'a fixed target reads no one');
    clear(view.input());
    assert.deepEqual(view.updates.at(-1), { dcOverride: null }, 'clearing restores the default');
  });

  it('a character value edits the adjustment override, keeping the dormant DC', async () => {
    const view = await mountOverride({ dcOverride: 15 }, { evaluation: evaluation() });
    assert.equal(view.card().dataset.gatheringTaskOverrideField, 'adjustmentOverride');
    assert.equal(view.heading(), 'Difficulty adjustment override');
    assert.equal(
      view.hint(),
      'Adjusts the character value this task is attempted against. Added to the value.'
    );
    assert.equal(view.label(), 'Adjustment');
    assert.equal(view.input().value, '', 'unset reads the placeholder');
    assert.equal(view.input().placeholder, 'System default');
    assert.equal(
      view.kept(),
      'A DC override of 15 is kept on this task. This system does not read it, so it is not shown for editing.'
    );

    assert.equal(
      view.sees(),
      'Riverbed Ore · stay at or under the character value (@skills.smith.level)'
    );
    assert.equal(view.note(), 'Choose a character in Preview as to see what this resolves to.');
    await view.previewAs('actor-sera');
    assert.equal(view.sees(), 'Riverbed Ore · stay at or under 12 (Sera Vane @skills.smith.level 12)');
    assert.equal(view.note(), '');

    commit(view.input(), '−2');
    assert.deepEqual(view.updates.at(-1), { adjustmentOverride: -2 });
    await view.sync();
    assert.equal(
      view.sees(),
      'Riverbed Ore · stay at or under 10 (Sera Vane @skills.smith.level 12, −2)',
      'the chosen character survives the edit'
    );
    assert.equal(view.input().value, '−2', 'the saved value reopens formatted');
    assert.ok(
      view.updates.every((patch) => !('dcOverride' in patch)),
      'the DC override is never written'
    );

    clear(view.input());
    view.input().dispatchEvent(new globalThis.Event('blur'));
    assert.deepEqual(view.updates.at(-1), { adjustmentOverride: null }, 'System default is null');
  });

  it('a multiplier is typed and kept exactly, never truncated', async () => {
    const view = await mountOverride(
      { adjustmentOverride: 0.7 },
      { evaluation: evaluation({ kind: 'multiply' }) }
    );
    assert.equal(
      view.hint(),
      'Adjusts the character value this task is attempted against. Multiplied, rounded down.'
    );
    assert.equal(view.input().value, '×0.7');
    commit(view.input(), '×½');
    assert.deepEqual(view.updates.at(-1), { adjustmentOverride: 0.5 });
    commit(view.input(), '0.65');
    assert.deepEqual(view.updates.at(-1), { adjustmentOverride: 0.65 });
  });

  it('a roll-high fixed DC reads as frame 23 and names a kept adjustment', async () => {
    const view = await mountOverride(
      { dcOverride: 14, adjustmentOverride: -2 },
      { evaluation: evaluation({ direction: 'over', source: 'fixed' }) }
    );
    assert.equal(view.heading(), 'DC override');
    assert.equal(view.hint(), 'Replaces the system DC for this task.');
    assert.equal(view.label(), 'DC');
    assert.equal(view.input().value, '14');
    assert.equal(
      view.kept(),
      'A difficulty adjustment override of −2 is kept on this task. This system does not read it, so it is not shown for editing.'
    );
    assert.equal(view.sees(), 'Riverbed Ore · DC 14', 'frame 23: every check shows the line');
  });

  it('a fixed-range routed check is graded by its ranges, so it shows no Player sees line', async () => {
    const view = await mountOverride(
      { dcOverride: 14 },
      { type: 'fixed', evaluation: evaluation({ direction: 'over', source: 'fixed' }) }
    );
    assert.ok(Boolean(view.input()), 'the override itself still renders');
    assert.ok(!view.card().querySelector('[data-override-player-sees]'), 'no line, no picker');
  });

  it('with no characters in the world the line names the formula and the picker offers only No actor', async () => {
    const view = await mountOverride({ adjustmentOverride: -2 }, { evaluation: evaluation() }, []);
    assert.equal(
      view.sees(),
      'Riverbed Ore · stay at or under the character value (@skills.smith.level, −2)'
    );
    assert.equal(view.note(), 'Choose a character in Preview as to see what this resolves to.');
    view.card().querySelector('[data-override-preview-actor]').click();
    await harness.setProps({});
    const options = [...view.root.querySelectorAll('[data-popover-option]')].map(
      (option) => option.dataset.popoverOption
    );
    assert.deepEqual(options, ['no-actor']);
  });

  it('a character without the value is named rather than read as zero', async () => {
    const view = await mountOverride({ adjustmentOverride: -2 }, { evaluation: evaluation() });
    await view.previewAs('actor-idrin');
    assert.equal(
      view.sees(),
      'Idrin Ashfall has no value at @skills.smith.level. The check cannot resolve for them.'
    );
    assert.equal(view.note(), '', 'a chosen character needs no note');
  });

  it('a kept override invalidated by a kind switch is marked invalid at the field', async () => {
    const view = await mountOverride(
      { adjustmentOverride: -2 },
      { evaluation: evaluation({ kind: 'multiply' }) }
    );
    assert.equal(view.input().getAttribute('aria-invalid'), 'true');
    const message = view.card().querySelector('[data-gathering-task-override-invalid]');
    assert.ok(Boolean(message), 'the field names the invalid override');
    assert.equal(
      message.textContent.trim(),
      'This override does not suit its kind: an added adjustment must be a finite number and a multiplier must be above zero.'
    );
    assert.equal(view.input().getAttribute('aria-describedby'), message.id);
  });

  it('clears the invalid-field warning once the kept override suits its kind again', async () => {
    const view = await mountOverride(
      { adjustmentOverride: -2 },
      { evaluation: evaluation({ kind: 'multiply' }) }
    );
    assert.ok(Boolean(view.card().querySelector('[data-gathering-task-override-invalid]')));
    await harness.setProps({
      checkConfig: { thresholdMode: 'meet', evaluation: evaluation({ kind: 'add' }) },
    });
    assert.ok(
      !view.card().querySelector('[data-gathering-task-override-invalid]'),
      'an added adjustment of -2 is valid, so the warning clears'
    );
    assert.ok(!view.input().hasAttribute('aria-invalid'));
  });

  // Issue 2006: a count check reads `successesOverride`; the retained target's overrides lie dormant.
  const countConfig = (required = 2) => ({
    evaluation: {
      ...evaluation(),
      product: 'count',
      direction: 'over',
      pool: { die: 6, base: '3', threshold: '5', required },
    },
  });
  const successesInput = (view) => view.card().querySelector('[data-gathering-task-successes-override]');

  it('a count check edits the successes override in the one Stepper, with no presets (R3)', async () => {
    const view = await mountOverride({ dcOverride: 14, adjustmentOverride: -2 }, countConfig());
    assert.equal(view.card().dataset.gatheringTaskOverrideField, 'successesOverride');
    assert.equal(view.heading(), 'Successes needed override');
    assert.equal(
      view.hint(),
      'Replaces the successes needed for this task. The pool and threshold still come from the check.'
    );
    assert.equal(view.label(), 'Successes needed');
    assert.ok(!view.input(), 'neither dormant override is offered for editing');
    assert.equal(successesInput(view).placeholder, 'System default');
    assert.equal(successesInput(view).getAttribute('aria-label'), 'Successes needed');
    assert.ok(!view.card().querySelector('.fabricate-select-trigger'), 'R3: no preset Select');
    assert.equal(
      view.card().querySelectorAll('button').length,
      2,
      'R3: the Stepper\'s own − and + are the card\'s only buttons, so no preset buttons'
    );
    assert.deepEqual(
      [...view.root.querySelectorAll('[data-gathering-task-override-kept]')].map((node) =>
        node.textContent.trim()
      ),
      [
        'A DC override of 14 is kept on this task. This system does not read it, so it is not shown for editing.',
        'A difficulty adjustment override of −2 is kept on this task. This system does not read it, so it is not shown for editing.',
      ]
    );
    assert.equal(view.sees(), 'Riverbed Ore · 2 successes needed');

    commit(successesInput(view), '3');
    assert.deepEqual(view.updates.at(-1), { successesOverride: 3 }, 'it writes only the successes');
    await view.sync();
    assert.equal(view.sees(), 'Riverbed Ore · 3 successes needed', 'the line follows the override');
    view.card().querySelector('.fab-stepper button:first-of-type').click();
    assert.deepEqual(view.updates.at(-1), { successesOverride: 2 }, 'the − button steps it down');
    await view.sync();
    clear(successesInput(view));
    assert.deepEqual(view.updates.at(-1), { successesOverride: null }, 'clearing restores the default');
    assert.ok(
      view.updates.every((patch) => !('dcOverride' in patch) && !('adjustmentOverride' in patch)),
      'no dormant override is ever written or cleared'
    );
  });

  it('a count check names one success needed in the singular', async () => {
    const view = await mountOverride({}, countConfig(3));
    assert.equal(view.sees(), 'Riverbed Ore · 3 successes needed', 'the check\'s own count by default');
    commit(successesInput(view), '1');
    await view.sync();
    assert.equal(view.sees(), 'Riverbed Ore · 1 success needed');
  });
});
