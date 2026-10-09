/** The gathering task editor's seven migrated numeric fields, MOUNTED (issue 1050). */
import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

import {
  SEARCHABLE_POPOVER_RAW_MODULES,
  SELECT_COMPILED_MODULES,
  TYPEAHEAD_RUNE_MODULES,
  RESULT_ROW_COMPILED_MODULES,
  RESULT_ROW_RAW_MODULES,
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
import { dispatchDrop } from '../helpers/dropPayloads.js';
import { FOUNDRY_BRIDGE_RAW_MODULES, LOCALIZE_OR_RAW_MODULES } from '../helpers/foundryBridgeModules.js';
import {
  GATHERING_TASK_EDITOR_COMPILED_MODULES,
  GATHERING_TASK_EDITOR_RAW_MODULES,
} from '../helpers/gatheringTaskEditorModules.js';

const { missingCensusHooks } = await import('../helpers/resultRowCensus.js');
const { normalizeGatheringResultGroups } = await import(
  '../../src/systems/gatheringResultGroups.js'
);

const repoRoot = resolve(import.meta.dirname, '../..');
const EDITOR_PATH = 'src/ui/svelte/apps/manager/GatheringTaskEditView.svelte';
const NODES_CARD_PATH = 'src/ui/svelte/apps/manager/gathering-task/GatheringTaskNodesCard.svelte';

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
    ...LOCALIZE_OR_RAW_MODULES,
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
    ...GATHERING_TASK_EDITOR_RAW_MODULES,
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
    ...RESULT_ROW_RAW_MODULES,
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
    ...RESULT_ROW_COMPILED_MODULES,
    'src/ui/svelte/apps/manager/recipe/RecipeRoutingAssignment.svelte',
    // The SHARED subject check-modifier picker (issue 1095) and the two primitives it
    // renders. Omitting a `.svelte` the tree reaches HANGS the suite (# cancelled).
    'src/ui/svelte/apps/manager/SubjectModifierPicker.svelte',
    'src/ui/svelte/components/SelectionCheckbox.svelte',
    'src/ui/svelte/components/IconButton.svelte',
    'src/ui/svelte/components/ModifierPillSelect.svelte',
    'src/ui/svelte/components/StatusToggle.svelte',
    'src/ui/svelte/components/SearchField.svelte',
    'src/ui/svelte/components/Notice.svelte',
    'src/ui/svelte/apps/manager/checks/PreviewAsPicker.svelte',
    'src/ui/svelte/components/Callout.svelte',
    'src/ui/svelte/components/Kicker.svelte',
    'src/ui/svelte/apps/manager/component/OverridePlayerSees.svelte',
    // The task's identity art and its depleted-marker art (issue 1522).
    'src/ui/svelte/components/ArtPicker.svelte',
    ...GATHERING_TASK_EDITOR_COMPILED_MODULES,
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

/** Mount the editor on one tab and return its `onUpdateTask` payloads plus a field lookup. */
async function mountEditor(resolutionMode = 'routed', activeTab = 'overview') {
  const updates = [];
  let task = taskFixture();
  const root = await harness.mount({
    task,
    activeTab,
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
    /** Open another tab, the way the host's `onTabChange` does. */
    showTab: (tab) => harness.setProps({ activeTab: tab }),
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
    tab: 'requirements',
    selector: '[data-gathering-task-dc-override]',
    read: (patch) => patch.dcOverride,
    expected: null,
  },
  {
    id: 'nodes.max',
    tab: 'overview',
    selector: '[data-gathering-task-node-count]',
    // Clearing the pool nulls the whole `nodes` object.
    read: (patch) => patch.nodes,
    expected: null,
  },
  {
    id: 'stamina modifier min',
    tab: 'requirements',
    selector: 'input[aria-label="Minimum"]',
    read: (patch) => patch.staminaCostModifiers?.[0]?.min,
    expected: null,
  },
  {
    id: 'stamina modifier max',
    tab: 'requirements',
    selector: 'input[aria-label="Maximum"]',
    read: (patch) => patch.staminaCostModifiers?.[0]?.max,
    expected: null,
  },
];

// The cosmetic-zero fields. The invariant is deliberately NOT "clearing persists 0":
const NEVER_RECEIVES_NULL = [
  {
    id: 'staminaCost',
    tab: 'requirements',
    selector: '[data-gathering-task-stamina-cost]',
    read: (patch) => patch.staminaCost,
  },
  {
    id: 'respawn.intervalAmount',
    tab: 'overview',
    selector: '[data-gathering-task-node-interval]',
    read: (patch) => patch.nodes?.respawn?.intervalAmount,
  },
  {
    id: 'respawn.chance',
    tab: 'overview',
    selector: '[data-gathering-task-node-chance]',
    read: (patch) => patch.nodes?.respawn?.chance,
  },
];

describe('Gathering task editor steppers (issue 1050)', () => {
  // ── Two adds on one screen, two roles.
  it('paints Add modifier as a dashed append and Add drop rule as the toolbar primary', async () => {
    const { root, showTab } = await mountEditor('d100', 'requirements');

    const addModifier = root.querySelector('[data-gathering-add-stamina-modifier]');
    assert.ok(Boolean(addModifier), 'the stamina card renders its Add modifier control');
    assert.ok(
      addModifier.classList.contains('fab-manager-button'),
      `Add modifier renders through the Button primitive, got ${addModifier.className}`
    );
    assert.ok(
      addModifier.classList.contains('is-dashed'),
      `Add modifier takes the dashed append role, got ${addModifier.className}`
    );
    assert.ok(
      !addModifier.classList.contains('is-full-width'),
      `and is deliberately NOT full width, got ${addModifier.className}`
    );

    await showTab('results');
    const addDrop = root.querySelector('[data-gathering-add-drop="toolbar"]');
    assert.ok(Boolean(addDrop), 'the drops toolbar renders its Add drop rule control');
    assert.ok(
      addDrop.classList.contains('fab-manager-button'),
      `Add drop rule renders through the Button primitive, got ${addDrop.className}`
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
    const { field, showTab } = await mountEditor();
    for (const { selector, tab } of [...CLEARS_TO_ABSENCE, ...NEVER_RECEIVES_NULL]) {
      await showTab(tab);
      assert.equal(field(selector).type, 'number', `${selector} is still a number input`);
      assert.ok(
        Boolean(field(selector).closest('.fab-stepper')),
        `${selector} sits inside the shared Stepper rather than standing bare`
      );
    }
  });

  it('persists absence when a genuine-absence field is cleared', async () => {
    for (const testCase of CLEARS_TO_ABSENCE) {
      const { field, updates } = await mountEditor('routed', testCase.tab);
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
      const { field, updates } = await mountEditor('routed', testCase.tab);
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
    const { field, updates, sync } = await mountEditor('routed', 'requirements');
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
    const compiled = scopedComponentCss(resolve(repoRoot, NODES_CARD_PATH)).css;
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
    tab: 'overview',
      trigger: '[data-gathering-task-field="defaultEnvironmentId"]',
      name: 'Default environment (canvas drop)',
      offers: ['__unchanged__', 'env-forest', 'env-cave'],
      choose: 'env-cave',
      read: (patch) => patch.defaultEnvironmentId,
      expected: 'env-cave',
    },
    {
      id: 'stamina cost modifier',
    tab: 'requirements',
      trigger: '.fabricate-select-trigger[aria-label="Per-actor cost modifiers"]',
      name: 'Per-actor cost modifiers',
      offers: ['mod-a', 'mod-b'],
      choose: 'mod-b',
      read: (patch) => patch.staminaCostModifiers?.[0]?.modifierId,
      expected: 'mod-b',
    },
    {
      id: 'stamina modifier sign',
    tab: 'requirements',
      trigger: '.fabricate-select-trigger[aria-label="Operator"]',
      name: 'Operator',
      offers: ['-', '+'],
      choose: '-',
      read: (patch) => patch.staminaCostModifiers?.[0]?.operator,
      expected: '-',
    },
    {
      id: 'deplete',
    tab: 'overview',
      trigger: '[data-gathering-task-node-deplete]',
      name: 'Deplete',
      offers: ['onStart', 'onSuccess'],
      choose: 'onSuccess',
      read: (patch) => patch.nodes?.depletionTiming,
      expected: 'onSuccess',
    },
    {
      id: 'respawn policy',
    tab: 'overview',
      trigger: '[data-gathering-task-node-respawn]',
      name: 'Respawn',
      offers: ['manual', 'overTime', 'nonRegenerating'],
      choose: 'nonRegenerating',
      read: (patch) => patch.nodes?.respawn?.policy,
      expected: 'nonRegenerating',
    },
    {
      id: 'respawn interval unit',
    tab: 'overview',
      trigger: '[data-gathering-task-node-interval-unit]',
      name: 'Respawn interval unit',
      offers: ['minutes', 'hours', 'days', 'weeks'],
      choose: 'days',
      read: (patch) => patch.nodes?.respawn?.intervalUnit,
      expected: 'days',
    },
    {
      id: 'gain mode',
    tab: 'overview',
      trigger: '[data-gathering-task-node-gain-mode]',
      name: 'Each interval',
      offers: ['guaranteed', 'chance', 'expression'],
      choose: 'expression',
      read: (patch) => patch.nodes?.respawn?.gainMode,
      expected: 'expression',
    },
  ];

  it('renders every converted picker as a named trigger, offering the rows it used to', async () => {
    const { root, showTab } = await mountEditor();
    for (const control of CONVERTED) {
      await showTab(control.tab);
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
      const { root, updates } = await mountEditor('routed', control.tab);
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
      activeTab: 'requirements',
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

describe('the gathering task result row is the requirement row (issue 1516)', () => {
  const RESULTS = [
    { id: 'results', name: 'Ore', results: [{ id: 'ore', componentId: 'cmp-ore', quantity: 3 }] },
  ];

  /** A Direct task, its one result set controlled through `onUpdateTask` as the host does. */
  async function mountResults(resultGroups) {
    const updates = [];
    let task = { ...taskFixture(), resolutionMode: 'straight', resultGroups };
    const root = await harness.mount({
      task,
      activeTab: 'results',
      resolutionMode: 'straight',
      managedItemOptions: [{ id: 'cmp-ore', name: 'Iron Ore', img: 'icons/ore.webp' }],
      onUpdateTask: (patch) => {
        updates.push(patch);
        task = { ...task, ...patch };
      },
    });
    const row = () =>
      root.querySelector(':scope [data-gathering-task-results="straight"] [data-recipe-result-item]');
    return { root, updates, row, task: () => task };
  }

  it('answers the retired row’s hooks, and a typed formula survives save and remount', async () => {
    const view = await mountResults(RESULTS);
    assert.deepEqual(missingCensusHooks(view.row(), 'flat'), []);

    const rolled = view.row().querySelector(':scope [data-recipe-option-amount-mode="rolled"] input');
    rolled.checked = true;
    rolled.dispatchEvent(new globalThis.Event('change', { bubbles: true }));
    await new Promise((done) => setTimeout(done, 0));
    assert.equal(view.updates.length, 0, 'opening Rolled leaves the task clean');
    const field = view.row().querySelector('[data-recipe-option-formula]');
    field.value = '1d4+1';
    field.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
    await new Promise((done) => setTimeout(done, 0));
    const [saved] = normalizeGatheringResultGroups(view.task().resultGroups);
    harness.remount();

    const reopened = await mountResults([saved]);
    assert.ok(reopened.row().querySelector(':scope [data-recipe-option-amount-mode="rolled"] input').checked);
    assert.equal(reopened.row().querySelector('[data-recipe-option-formula]').value, '1d4+1');
    assert.equal(saved.results[0].quantity, 3, 'quantity is unchanged');
  });
});

describe('the depleted-marker art picker (issue 1522)', () => {
  /** A node task whose depleted marker shows `swapImage`, recording every `onUpdateTask` patch. */
  async function mountDepleted(swapImage, pickedPath = null) {
    const updates = [];
    const fixture = taskFixture();
    const nodes = swapImage ? { ...fixture.nodes, depletedBehavior: { swapImage } } : fixture.nodes;
    const root = await harness.mount({
      task: { ...fixture, nodes },
      nodesEnabled: true,
      onPickImagePath: async () => pickedPath,
      onUpdateTask: (patch) => {
        updates.push(patch);
      },
    });
    const picker = () => root.querySelector('[data-gathering-task-depleted-image]');
    return { root, updates, picker };
  }

  it('clears the marker art on a right-click of the art, preventing the context menu', async () => {
    const view = await mountDepleted('marker.webp');
    assert.equal(view.picker().querySelector('img').getAttribute('src'), 'marker.webp');
    const menu = new globalThis.MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    view.picker().dispatchEvent(menu);
    assert.ok(menu.defaultPrevented, 'the browser menu never opens over the art');
    assert.deepEqual(view.updates.at(-1)?.nodes?.depletedBehavior, null);
  });

  it('clears it from the visible Remove image button too', async () => {
    const view = await mountDepleted('marker.webp');
    const clear = view.root.querySelector('[data-gathering-task-depleted-image-clear]');
    assert.equal(clear.textContent.trim(), 'Remove image');
    clear.click();
    assert.deepEqual(view.updates.at(-1)?.nodes?.depletedBehavior, null);
  });

  it('draws an empty slot with nothing to clear, and a pick writes the chosen path', async () => {
    const view = await mountDepleted('', 'picked.webp');
    assert.ok(view.picker().classList.contains('is-empty'));
    assert.ok(!view.root.querySelector('[data-gathering-task-depleted-image-clear]'));
    view.picker().dispatchEvent(new globalThis.MouseEvent('contextmenu', { bubbles: true }));
    assert.equal(view.updates.length, 0, 'a right-click on an empty slot writes nothing');
    view.picker().click();
    await new Promise((done) => setTimeout(done, 0));
    assert.deepEqual(view.updates.at(-1)?.nodes?.depletedBehavior, { swapImage: 'picked.webp' });
  });
});

describe('the task identity art picker (issue 1522)', () => {
  it('draws the task art under its name, and a pick writes the chosen path', async () => {
    const updates = [];
    const opened = [];
    const root = await harness.mount({
      task: { ...taskFixture(), img: 'icons/task.webp' },
      onPickImagePath: async (current) => {
        opened.push(current);
        return 'icons/picked.webp';
      },
      onUpdateTask: (patch) => {
        updates.push(patch);
      },
    });
    const tile = root.querySelector(':scope .manager-task-core-grid .fab-art-picker-tile');
    assert.equal(tile.getAttribute('aria-label'), 'Choose task image');
    assert.equal(tile.querySelector('img').getAttribute('src'), 'icons/task.webp');
    assert.equal(tile.disabled, false, 'a host with a file picker can open it');
    tile.click();
    await new Promise((done) => setTimeout(done, 0));
    assert.deepEqual(opened, ['icons/task.webp'], 'the picker opens on the stored art');
    assert.deepEqual(updates.at(-1), { img: 'icons/picked.webp' });
  });

  it('disables the identity art and the depleted marker when the host has no file picker', async () => {
    const root = await harness.mount({ task: taskFixture(), nodesEnabled: true });
    const identity = root.querySelector(':scope .manager-task-core-grid .fab-art-picker-tile');
    const depleted = root.querySelector(':scope [data-gathering-task-depleted-image]');
    assert.equal(identity.disabled, true, 'the identity art cannot open a picker');
    assert.equal(depleted.disabled, true, 'nor can the depleted marker');
  });
});

describe('the task editor`s four tabs (issue 1522)', () => {
  // The cards each tab draws, under a routed task with every gated card on.
  const TAB_CARDS = {
    overview: [
      '[data-gathering-task-core-editor]',
      '[data-gathering-task-resolution]',
      '[data-gathering-task-nodes]',
    ],
    requirements: [
      '[data-gathering-task-availability]',
      '[data-gathering-task-stamina]',
      '[data-gathering-task-check-modifiers]',
      '[data-gathering-task-dc]',
      '[data-gathering-task-required-tools]',
    ],
    results: ['[data-gathering-task-results="routed"]'],
    validation: ['[data-gathering-task-validation]'],
  };

  async function mountTabs(props = {}) {
    const chosen = [];
    const root = await harness.mount({
      task: taskFixture(),
      resolutionMode: 'routed',
      staminaEnabled: true,
      nodesEnabled: true,
      gatheringModifierPolicy: 'bySubject',
      onTabChange: (tab) => {
        chosen.push(tab);
      },
      ...props,
    });
    return { root, chosen };
  }

  it('draws each card on its own tab only, under the shared strip', async () => {
    const { root } = await mountTabs();
    const strip = root.querySelector('[role="tablist"].fabricate-tabs');
    assert.ok(Boolean(strip), 'the strip is the shared EditorTabs');
    assert.deepEqual(
      [...strip.querySelectorAll('[role="tab"]')].map((tab) => tab.dataset.gatheringTaskTab),
      ['overview', 'requirements', 'results', 'validation']
    );
    for (const tab of Object.keys(TAB_CARDS)) {
      await harness.setProps({ activeTab: tab });
      const panel = root.querySelector('[role="tabpanel"]');
      assert.equal(panel.getAttribute('aria-labelledby'), `gathering-task-tab-${tab}`);
      for (const [other, otherCards] of Object.entries(TAB_CARDS)) {
        for (const card of otherCards) {
          assert.equal(
            Boolean(panel.querySelector(card)),
            other === tab,
            `${card} renders ${other === tab ? 'on' : 'off'} ${tab}`
          );
        }
      }
    }
  });

  it('asks its host for a tab and holds none of its own', async () => {
    const { root, chosen } = await mountTabs();
    root.querySelector('[data-gathering-task-tab="results"]').click();
    await harness.setProps({});
    assert.deepEqual(chosen, ['results'], 'the strip reports the GM`s choice');
    assert.ok(
      Boolean(root.querySelector('[data-gathering-task-core-editor]')),
      'and the panel waits for the host to change the tab'
    );
  });

  it('leads Results with its notices: the blocking errors above the panel, then the warnings', async () => {
    const { root, chosen } = await mountTabs({
      activeTab: 'results',
      routedOutcomeTiers: [],
      validation: { valid: false, errors: ['Rich tier needs a result set', 'A set has no results'] },
    });
    // The scroller chain `manager-layout-side-rail-fixtures.js` measures: the strip and the page
    // notice are the view's own children, outside the one scrolling tab panel.
    const panel = root.querySelector(
      ':scope main.manager-gathering-task-edit-view > [role="tabpanel"].manager-editor-tab-panel'
    );
    assert.ok(Boolean(panel), 'the tab panel is the shared editor scroller');
    const page = panel.previousElementSibling;
    assert.ok(page.matches('.manager-editor-notice-position'), 'outside it, the page position');
    assert.ok(page.previousElementSibling.matches('[role="tablist"]'), 'between the strip and panel');
    const [stack, firstCard] = panel.children;
    assert.equal(page.dataset.noticePosition, 'page');
    const blocking = page.querySelector('[data-gathering-task-results-validation]');
    assert.equal(blocking.getAttribute('role'), 'alert');
    assert.equal(blocking.dataset.noticeTone, 'danger');
    assert.match(blocking.textContent, /2 result issues block save/);
    const review = blocking.querySelector('button');
    assert.equal(review.textContent.trim(), 'Review in Validation', 'a count with an action');
    review.click();
    assert.deepEqual(chosen, ['validation'], 'the action opens Validation');
    assert.equal(stack.dataset.noticePosition, 'stack');
    const noTiers = stack.querySelector('[data-gathering-routed-no-tiers]');
    assert.equal(noTiers.getAttribute('role'), 'status');
    assert.equal(noTiers.dataset.noticeTone, 'warning');
    assert.equal(firstCard.dataset.gatheringTaskResults, 'routed', 'and then the first card');
  });

  it('warns of a repeated drop component in the stacking region of a d100 task', async () => {
    const row = (id) => ({ id, componentId: 'c1', quantity: 1, dropRate: 10, enabled: true });
    const { root } = await mountTabs({
      activeTab: 'results',
      resolutionMode: 'd100',
      task: { ...taskFixture(), dropRows: [row('drop-a'), row('drop-b')] },
      rewardRules: { rewardSelectionMode: 'highestRankedDrop' },
    });
    const notice = root.querySelector(
      ':scope [data-notice-position="stack"] [data-gathering-task-reward-rule-notice]'
    );
    assert.equal(notice?.getAttribute('role'), 'status');
    assert.equal(notice.dataset.noticeTone, 'warning');
  });

  it('puts each standing statement directly before the card it explains', async () => {
    const { root } = await mountTabs({ resolutionMode: 'progressive' });
    const legacy = root.querySelector('[data-gathering-progressive-legacy]');
    assert.equal(legacy.dataset.calloutTone, 'warning', 'leaving Progressive is a hazard');
    assert.ok(legacy.nextElementSibling.matches('[data-gathering-task-resolution]'));

    await harness.setProps({ resolutionMode: 'd100', activeTab: 'results' });
    const formula = root.querySelector('[data-gathering-task-drop-formula]');
    assert.equal(formula.dataset.calloutTone, 'neutral', 'the formula is a permanent rule');
    assert.ok(formula.nextElementSibling.matches('.manager-task-drops-card'));
  });
});

describe('the Results tab`s notices and authoring (issue 1522)', () => {
  const ROUTED_TIERS = [{ id: 'tier-rich', name: 'Rich' }];
  const row = (id, extra = {}) => ({ id, componentId: 'c1', quantity: 1, dropRate: 10, ...extra });

  /** Mount with `task` controlled through every host callback, as the root does, recording each. */
  async function mountControlled({ task, ...props }) {
    const calls = [];
    let current = task;
    const record =
      (name, write = null) =>
      (...args) => {
        calls.push([name, ...args]);
        if (write) current = write(current, ...args);
      };
    const root = await harness.mount({
      task: current,
      onUpdateTask: record('update', (draft, patch) => ({ ...draft, ...patch })),
      onSelectDrop: record('select'),
      onUpdateDrop: record('updateDrop'),
      onMoveDrop: record('move'),
      onAddDrop: record('add', (draft) => ({
        ...draft,
        dropRows: [...draft.dropRows, row('drop-new')],
      })),
      onAddToolReference: record('addTool', (draft, id) => ({
        ...draft,
        toolIds: [...(draft.toolIds || []), id],
      })),
      ...props,
    });
    const sync = () => harness.setProps({ task: current });
    return {
      root,
      calls,
      sync,
      task: () => current,
      press: async (selector) => {
        const node = root.querySelector(selector);
        assert.ok(Boolean(node), `${selector} renders`);
        node.click();
        await sync();
      },
    };
  }

  /** The Validation tab's marks, each as `[tone, label]`. */
  const validationMarks = (root) =>
    [
      ...root.querySelectorAll(
        ':scope [data-gathering-task-tab="validation"] [data-gathering-task-tab-badge]'
      ),
    ].map((mark) => [mark.dataset.badgeTone, mark.textContent.trim()]);

  it('marks Validation on every tab with its blocking and its warning counts', async () => {
    const { root } = await mountControlled({
      task: taskFixture(),
      resolutionMode: 'routed',
      routedOutcomeTiers: [],
      validation: { valid: false, errors: ['Rich tier needs a result set', 'A set has no results'] },
    });
    for (const tab of ['overview', 'requirements', 'results', 'validation']) {
      await harness.setProps({ activeTab: tab });
      assert.deepEqual(
        validationMarks(root),
        [
          ['danger', '2'],
          ['warning', '1'],
        ],
        `the Validation tab is marked from ${tab}`
      );
      assert.equal(root.querySelectorAll('[data-gathering-task-tab-badge]').length, 2, 'only it');
    }
    await harness.setProps({
      resolutionMode: 'd100',
      validation: null,
      task: { ...taskFixture(), dropRows: [row('a'), row('b')] },
    });
    assert.deepEqual(validationMarks(root), [['warning', '1']], 'a d100 reward rule');
  });

  // Each Results notice belongs to one mode; another mode with the same inputs raises none.
  const OUT_OF_MODE = [
    { mode: 'straight', props: { routedOutcomeTiers: [] }, absent: '[data-gathering-routed-no-tiers]' },
    { mode: 'd100', props: { routedOutcomeTiers: [] }, absent: '[data-gathering-routed-no-tiers]' },
    {
      mode: 'progressive',
      props: { routedOutcomeTiers: [] },
      absent: '[data-gathering-routed-no-tiers]',
    },
    {
      mode: 'straight',
      props: {
        routedOutcomeTiers: ROUTED_TIERS,
        rewardRules: { rewardSelectionMode: 'highestRankedDrop' },
        task: { ...taskFixture(), dropRows: [row('a'), row('b')] },
      },
      absent: '[data-gathering-task-reward-rule-notice]',
    },
  ];
  for (const { mode, props, absent } of OUT_OF_MODE) {
    it(`raises no ${absent} on a ${mode} task`, async () => {
      const { root } = await mountControlled({
        task: taskFixture(),
        activeTab: 'results',
        resolutionMode: mode,
        ...props,
      });
      assert.ok(Boolean(root.querySelector(':scope [role="tabpanel"] > *')), 'precondition: it renders');
      assert.ok(!root.querySelector(absent), `${absent} belongs to another mode`);
      assert.deepEqual(validationMarks(root), [], 'and Validation carries no mark');
    });
  }

  it('points a legacy Progressive task`s Results to Overview', async () => {
    const { root } = await mountControlled({
      task: taskFixture(),
      activeTab: 'results',
      resolutionMode: 'progressive',
    });
    const empty = root.querySelector(
      ':scope [role="tabpanel"] [data-gathering-task-results="progressive"]'
    );
    assert.ok(Boolean(empty), 'the panel says why it is empty');
    assert.match(empty.textContent, /Results are not authored here/);
    assert.match(empty.textContent, /Gathering resolution card on Overview/);
  });

  it('adds, renames and removes a Check task`s result sets', async () => {
    const view = await mountControlled({
      task: { ...taskFixture(), resultGroups: [] },
      activeTab: 'results',
      resolutionMode: 'routed',
      routedOutcomeTiers: ROUTED_TIERS,
    });
    await view.press('[data-gathering-add-result-set="empty"]');
    assert.equal(view.task().resultGroups.length, 1, 'the empty state adds the first set');
    await view.press('[data-gathering-add-result-set="footer"]');
    const [first, second] = view.task().resultGroups;
    assert.ok(first.id && second.id && first.id !== second.id, 'the footer adds a second');
    const name = view.root.querySelectorAll('[data-recipe-result-set-field="name"]')[1];
    name.value = 'Rich';
    name.dispatchEvent(new globalThis.Event('change', { bubbles: true }));
    await view.sync();
    assert.deepEqual(
      view.task().resultGroups.map((group) => group.name),
      ['', 'Rich']
    );
    view.root.querySelectorAll('[data-recipe-remove="result-set"]')[0].click();
    await view.sync();
    assert.deepEqual(
      view.task().resultGroups.map((group) => group.id),
      [second.id]
    );
  });

  it('adds the first drop rule from the empty drop table', async () => {
    const view = await mountControlled({
      task: { ...taskFixture(), dropRows: [] },
      activeTab: 'results',
      resolutionMode: 'd100',
    });
    await view.press('[data-gathering-add-drop="empty"]');
    assert.deepEqual(
      view.calls.map(([name]) => name),
      ['add']
    );
    assert.ok(Boolean(view.root.querySelector('[data-gathering-task-drop-id="drop-new"]')));
  });

  // Each card clamps its own page once the list it pages shrinks under it (decision 5).
  it('returns each paged list to its first page when its last page empties', async () => {
    const drops = Array.from({ length: 7 }, (_, index) =>
      row(`drop-${index}`, { name: index < 4 ? `Moss ${index}` : `Ash ${index}` })
    );
    const cards = Array.from({ length: 8 }, (_, index) => ({ id: `c${index}`, name: `Part ${index}` }));
    const tools = Array.from({ length: 7 }, (_, index) => ({
      id: `tool-${index}`,
      label: `Tool ${index}`,
    }));
    const view = await mountControlled({
      task: { ...taskFixture(), dropRows: drops, toolIds: [] },
      activeTab: 'results',
      resolutionMode: 'd100',
      itemCards: cards,
      libraryTools: tools,
    });
    const next = (card) => view.press(`${card} [data-pagination-next]`);
    const count = (selector) => view.root.querySelectorAll(selector).length;

    await next('.manager-task-drops-card');
    const search = view.root.querySelector(
      ':scope .manager-task-drops-card input[aria-label="Search drop rules"]'
    );
    search.value = 'Ash';
    search.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
    await view.sync();
    assert.equal(count('tr[data-gathering-task-drop-id]'), 3, 'the drop table');

    await next('[data-gathering-task-component-browser]');
    await harness.setProps({ itemCards: cards.slice(0, 3) });
    assert.equal(count('[data-gathering-component-card]'), 3, 'the component browser');

    await harness.setProps({ activeTab: 'requirements' });
    await next('[data-gathering-task-required-tools]');
    await view.press('[data-gathering-task-required-tools-card="tool-6"]');
    assert.equal(count('[data-gathering-task-required-tools-card]'), 6, 'the tool library');
  });

  it('forwards every drop row control to the host', async () => {
    const view = await mountControlled({
      task: { ...taskFixture(), dropRows: [row('drop-a'), row('drop-b', { componentId: '' })] },
      activeTab: 'results',
      resolutionMode: 'd100',
      rewardRules: { rewardSelectionMode: 'highestRankedDrop' },
    });
    const rowOf = (id) => view.root.querySelector(`[data-gathering-task-drop-id="${id}"]`);
    rowOf('drop-b').querySelector('[data-gathering-task-drop-move="up"]').click();
    rowOf('drop-a').querySelector(':scope [data-gathering-task-drop-component-cell] button').click();
    const quantity = rowOf('drop-a').querySelector('input[aria-label="Quantity"]');
    quantity.value = '7';
    quantity.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
    quantity.value = '12';
    quantity.dispatchEvent(new globalThis.Event('blur'));
    const drop = new globalThis.Event('drop', { bubbles: true, cancelable: true });
    const payload = JSON.stringify({ type: 'FabricateManagedComponent', componentId: 'c9' });
    Object.defineProperty(drop, 'dataTransfer', {
      value: { getData: (type) => (type === 'text/plain' ? payload : '') },
    });
    rowOf('drop-b').dispatchEvent(drop);
    assert.deepEqual(view.calls, [
      ['move', 'drop-b', 'up'],
      ['select', 'drop-a'],
      ['updateDrop', 'drop-a', { quantity: 7 }],
      ['updateDrop', 'drop-a', { quantity: 12 }],
      [
        'updateDrop',
        'drop-b',
        { componentId: 'c9', itemUuid: '', systemItemId: '', name: '', enabled: true },
      ],
      ['select', 'drop-b'],
    ]);
  });

  // The drop rules are a `DataTable` (issue 1782): a rank is the row's place in the whole list.
  const twelveRanked = () =>
    mountControlled({
      task: {
        ...taskFixture(),
        dropRows: Array.from({ length: 12 }, (_, index) =>
          row(`drop-${index + 1}`, { name: index === 10 ? 'Ashen Bloom' : `Moss ${index + 1}` })
        ),
      },
      activeTab: 'results',
      resolutionMode: 'd100',
      rewardRules: { rewardSelectionMode: 'highestRankedDrop' },
    });
  const ranks = (root) =>
    [...root.querySelectorAll('[data-gathering-task-drop-rank]')].map((rank) =>
      rank.textContent.trim()
    );
  const searchDrops = async (view, term) => {
    const search = view.root.querySelector(':scope input[aria-label="Search drop rules"]');
    search.value = term;
    search.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
    await view.sync();
  };

  it('ranks a drop by its place in the whole list, on a later page and through a search', async () => {
    const view = await twelveRanked();
    chooseSelectOption(view.root, '.manager-task-drops-card [data-pagination-size]', 10);
    await view.sync();
    assert.equal(ranks(view.root).length, 10, 'ten rows a page');
    await view.press('.manager-task-drops-card [data-pagination-next]');
    assert.deepEqual(ranks(view.root), ['#11', '#12'], 'page 2 opens at the eleventh rank');

    await searchDrops(view, 'ashen');
    assert.deepEqual(ranks(view.root), ['#11'], 'a filtered row keeps its rank in the whole list');
  });

  it('says no drop rule matches a search that finds none, and clearing it returns the rows', async () => {
    const view = await twelveRanked();
    await searchDrops(view, 'nothing like this');
    const table = view.root.querySelector('[data-gathering-task-drops-table]');
    assert.equal(table.querySelectorAll('tr[data-gathering-task-drop-id]').length, 0);
    assert.match(table.querySelector('tbody').textContent, /No drop rules match/);
    assert.ok(!table.querySelector('thead'), 'no column head above no rows');

    await searchDrops(view, '');
    assert.equal(table.querySelectorAll('tr[data-gathering-task-drop-id]').length, 5);
    assert.deepEqual(ranks(view.root), ['#1', '#2', '#3', '#4', '#5']);
  });

  const countOf = (root) =>
    root.querySelector(':scope [data-gathering-task-drops-table] .fabricate-data-table-count').textContent;

  it('counts the rules a search finds, not every rule nor the page', async () => {
    const view = await twelveRanked();
    assert.equal(countOf(view.root), '12', 'every rule, though a page shows five');
    await searchDrops(view, 'ashen');
    assert.equal(countOf(view.root), '1');
    await searchDrops(view, 'nothing like this');
    assert.equal(countOf(view.root), '0');
  });

  it('disables move-down only on the last rule of the whole list, on a page and through a search', async () => {
    const view = await twelveRanked();
    const downs = () =>
      [...view.root.querySelectorAll('tr[data-gathering-task-drop-id]')].map((tr) => [
        tr.querySelector('[data-gathering-task-drop-rank]').textContent.trim(),
        tr.querySelector('[data-gathering-task-drop-move="down"]').disabled,
      ]);
    assert.deepEqual(downs().at(-1), ['#5', false], 'the last row of page 1 still moves down');
    await searchDrops(view, 'moss 1');
    assert.deepEqual(downs(), [
      ['#1', false],
      ['#10', false],
      ['#12', true],
    ]);
  });

  it('opens a new page size at the first page', async () => {
    const view = await twelveRanked();
    await view.press('.manager-task-drops-card [data-pagination-next]');
    assert.deepEqual(ranks(view.root), ['#6', '#7', '#8', '#9', '#10']);
    chooseSelectOption(view.root, '.manager-task-drops-card [data-pagination-size]', 10);
    await view.sync();
    assert.deepEqual(ranks(view.root).slice(0, 2), ['#1', '#2']);
    assert.equal(ranks(view.root).length, 10);
  });

  // Decision 5: a page the list no longer reaches returns to the FIRST page, not the previous one.
  it('returns to the first page when the rules left exactly fill it, or end before the page', async () => {
    const named = (count) =>
      Array.from({ length: count }, (_, index) =>
        row(`drop-${index + 1}`, { name: index < 5 ? `Ash ${index + 1}` : `Moss ${index + 1}` })
      );
    const view = await mountControlled({
      task: { ...taskFixture(), dropRows: named(12) },
      activeTab: 'results',
      resolutionMode: 'd100',
      rewardRules: { rewardSelectionMode: 'highestRankedDrop' },
    });
    // The host's task is set here directly: `view.sync` would restore the twelve.
    let rules = named(12);
    const show = () => harness.setProps({ task: { ...taskFixture(), dropRows: rules } });
    const keep = (count) => {
      rules = named(count);
      return show();
    };
    const next = () => {
      view.root.querySelector(':scope .manager-task-drops-card [data-pagination-next]').click();
      return show();
    };
    const FIRST_PAGE = ['#1', '#2', '#3', '#4', '#5'];

    await next();
    await next();
    assert.deepEqual(ranks(view.root), ['#11', '#12'], 'precondition: the third page');
    await keep(8);
    assert.deepEqual(ranks(view.root), FIRST_PAGE, 'eight rules: page 1, not page 2');

    await keep(6);
    await next();
    assert.deepEqual(ranks(view.root), ['#6'], 'precondition: the second page');
    await keep(5);
    assert.deepEqual(ranks(view.root), FIRST_PAGE, 'five rules fill page 1 exactly');

    await keep(10);
    await next();
    const search = view.root.querySelector(':scope input[aria-label="Search drop rules"]');
    search.value = 'ash';
    search.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
    await show();
    assert.deepEqual(ranks(view.root), FIRST_PAGE, 'and a search that finds exactly five');
  });

  it('finds a rule by its managed component`s name or its item, ignoring the spaces around a term', async () => {
    const view = await mountControlled({
      task: {
        ...taskFixture(),
        dropRows: [
          row('drop-ash', { name: 'Ashen Bloom' }),
          row('drop-managed', { componentId: 'c7' }),
          row('drop-item', { componentId: '', itemUuid: 'Item.glowcap' }),
        ],
      },
      activeTab: 'results',
      resolutionMode: 'd100',
      managedItemOptions: [{ id: 'c7', name: 'Nightshade' }],
    });
    const ids = () =>
      [...view.root.querySelectorAll('tr[data-gathering-task-drop-id]')].map(
        (tr) => tr.dataset.gatheringTaskDropId
      );
    for (const [term, expected] of [
      ['nightsh', ['drop-managed']],
      ['glowcap', ['drop-item']],
      ['  ashen  ', ['drop-ash']],
    ]) {
      await searchDrops(view, term);
      assert.deepEqual(ids(), expected, `"${term}"`);
    }
  });

  it('keeps each row a drop zone onto its own rule after the rows are replaced', async () => {
    const imports = [];
    const view = await mountControlled({
      task: { ...taskFixture(), dropRows: [row('drop-a'), row('drop-b')] },
      activeTab: 'results',
      resolutionMode: 'd100',
      onImportDrop: (rowId, data) => {
        imports.push([rowId, data.uuid]);
      },
    });
    await harness.setProps({
      task: { ...view.task(), dropRows: view.task().dropRows.map((drop) => ({ ...drop })) },
    });
    const zone = view.root.querySelector('tr[data-gathering-task-drop-zone="drop-b"]');
    assert.ok(Boolean(zone), 'the row itself is the drop zone');
    dispatchDrop(zone, { type: 'Item', uuid: 'Item.imported' });
    assert.deepEqual(imports, [['drop-b', 'Item.imported']]);
  });

  // Focus entering a row selects it (issue 1782); a click inside one of its controls is no second pick.
  it('selects a row once as focus enters its controls, never again from their clicks', async () => {
    const view = await mountControlled({
      task: { ...taskFixture(), dropRows: [row('drop-a'), row('drop-b'), row('drop-c')] },
      activeTab: 'results',
      resolutionMode: 'd100',
      rewardRules: { rewardSelectionMode: 'highestRankedDrop' },
    });
    const rowB = view.root.querySelector('[data-gathering-task-drop-id="drop-b"]');
    for (const selector of [
      'input[aria-label="Quantity"]',
      'input[type="range"]',
      'input[type="number"]',
      '[data-gathering-task-drop-move="up"]',
      '[data-gathering-task-drop-move="down"]',
    ]) {
      view.calls.length = 0;
      const control = rowB.querySelector(selector);
      control.dispatchEvent(new globalThis.FocusEvent('focusin', { bubbles: true }));
      control.click();
      assert.deepEqual(
        view.calls.filter(([name]) => name === 'select'),
        [['select', 'drop-b']],
        `${selector} selects its row once`
      );
    }
  });

  it('forwards the description, the respawn expression and the stamina modifier list', async () => {
    const fixture = taskFixture();
    const respawn = { ...fixture.nodes.respawn, gainMode: 'expression' };
    const view = await mountControlled({
      task: { ...fixture, nodes: { ...fixture.nodes, respawn } },
      nodesEnabled: true,
      staminaEnabled: true,
      characterModifierLibrary: [{ id: 'mod-a', label: 'Herbalism' }],
    });
    const type = (selector, value) => {
      const field = view.root.querySelector(selector);
      field.value = value;
      field.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
    };
    type('[data-gathering-task-field="description"]', 'Under old roots');
    type('[data-gathering-task-node-amount]', '1d6');
    assert.equal(view.task().description, 'Under old roots');
    assert.equal(view.task().nodes.respawn.amountExpression, '1d6');

    await harness.setProps({ activeTab: 'requirements', task: view.task() });
    await view.press('[data-gathering-add-stamina-modifier]');
    assert.equal(view.task().staminaCostModifiers.length, 2, 'Add modifier appends a row');
    await view.press('[data-gathering-stamina-modifier="mod-row-1"] [aria-label="Remove"]');
    assert.deepEqual(
      view.task().staminaCostModifiers.map((entry) => entry.modifierId),
      ['mod-a'],
      'and Remove drops the authored one'
    );
    assert.notEqual(view.task().staminaCostModifiers[0].id, 'mod-row-1');
  });
});
