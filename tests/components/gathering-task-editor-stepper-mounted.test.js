/** The gathering task editor's seven migrated numeric fields, MOUNTED (issue 1050). */
import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

import {
  SEARCHABLE_POPOVER_RAW_MODULES,
  SELECT_COMPILED_MODULES,
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
  rawModules: [
    // Issue 1504: the raw closure the shared `<Select>` reaches through `SearchablePopover`.
    ...SEARCHABLE_POPOVER_RAW_MODULES,
    // The SHARED subject check-modifier picker's resolver (issue 1095).
    'src/systems/characterLibraries.js',
    'src/systems/checkModifierResolver.js',
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

  // ── The seven converted pickers (issue 1510), each DRIVEN rather than read.
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
        `${control.id} keeps the accessible name it had as a <select>`
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
