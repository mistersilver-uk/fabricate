import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { tick } from 'svelte';
import {
  createMountedComponentHarness,
  SEARCHABLE_POPOVER_RAW_MODULES,
} from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-tool-editor-',
  rawModules: [
    'src/config/flags.js',
    'src/models/Ingredient.js',
    'src/models/IngredientGroup.js',
    'src/models/Tool.js',
    'src/models/match/matchTypes.js',
    'src/ui/svelte/util/foundryBridge.js',
    'src/ui/svelte/util/recipeCurrency.js',
    'src/ui/svelte/actions/dragDrop.js',
    'src/ui/svelte/apps/manager/tools/toolStudio.js',
    ...SEARCHABLE_POPOVER_RAW_MODULES,
  ],
  compiledModules: [
    'src/ui/svelte/components/Stepper.svelte',
    'src/ui/svelte/apps/manager/SearchablePopover.svelte',
    'src/ui/svelte/apps/manager/recipe/RecipeIngredientGroupCard.svelte',
    'src/ui/svelte/apps/manager/recipe/RecipeIngredientOption.svelte',
    'src/ui/svelte/apps/manager/tools/ToolBehaviorPreview.svelte',
    'src/ui/svelte/apps/manager/tools/ToolBreakageTab.svelte',
    'src/ui/svelte/apps/manager/tools/ToolEditorTabs.svelte',
    'src/ui/svelte/apps/manager/tools/ToolOverviewTab.svelte',
    'src/ui/svelte/apps/manager/tools/ToolRepairRequirements.svelte',
    'src/ui/svelte/apps/manager/tools/ToolRequirementsTab.svelte',
    'src/ui/svelte/apps/manager/tools/ToolValidationTab.svelte',
    'src/ui/svelte/apps/manager/ToolEditView.svelte'
  ],
  componentPath: 'src/ui/svelte/apps/manager/ToolEditView.svelte'
});

const managedItems = [
  { id: 'hammer-component', name: "Smith's Hammer", img: 'icons/tools/hand/hammer-cobbler-steel.webp', description: 'A well-balanced forge hammer. Durable, but the haft splinters when hard used.' },
  { id: 'scrap', name: 'Iron Scrap', img: 'icons/commodities/metal/fragments-steel.webp' }
];
const worldItems = [
  { uuid: 'Item.hammer', name: "Smith's Hammer", img: managedItems[0].img, description: managedItems[0].description },
  { uuid: 'Item.replacement', name: 'Bent Hammer', img: managedItems[0].img, description: 'Still useful.' }
];
const prerequisites = [
  { id: 'expert', name: 'Expert Crafter', expression: '@prof >= 4' },
  { id: 'smith', name: "Proficient with Smith's Tools", expression: '@prof' },
  { id: 'attuned', name: 'Attuned to the Weave', expression: '@abilities.int.mod >= 2' },
  { id: 'strong', name: 'Strength 13 or higher', expression: '@abilities.str.mod >= 2' },
  { id: 'arena', name: 'Trained in Arcana', expression: '@skills.arcana >= 1' },
];
const itemTags = ['metal', 'salvage'];
const essenceOptions = [{ id: 'fire', name: 'Fire', icon: 'fas fa-fire' }];
const currencyUnits = [{ id: 'gp', label: 'Gold', icon: 'fas fa-coins' }];

function tool(overrides = {}) {
  return {
    id: 'hammer',
    name: "Smith's Hammer",
    img: managedItems[0].img,
    description: managedItems[0].description,
    registeredItemUuid: 'Item.hammer',
    originItemUuid: 'Item.hammer',
    enabled: true,
    label: '',
    breakage: { mode: 'limitedUses', maxUses: 5 },
    checkBreakable: true,
    onBreak: { mode: 'destroy' },
    repairRequirements: [],
    prerequisites: { enabled: true, ids: ['smith'], gateMode: 'usability' },
    bonus: { enabled: true, expression: '@prof' },
    ...overrides
  };
}

function props(overrides = {}) {
  return {
    tool: tool(),
    validation: { valid: true, errors: [] },
    dirty: false,
    activeTab: 'overview',
    worldItems,
    managedItems,
    itemTags,
    essenceOptions,
    currencyUnits,
    currencyEnabled: true,
    prerequisiteOptions: prerequisites,
    ...overrides
  };
}

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

describe('Tool Studio editor (mounted)', () => {
  it('renders header-only actions, four accessible tabs, linked Item evidence, and no Kind', async () => {
    const navigation = [];
    const root = await harness.mount(props({
      systemName: 'The Herbalist',
      onOpenSystems: () => { navigation.push('systems'); },
      onOpenSystem: () => { navigation.push('system'); },
      onOpenTools: () => { navigation.push('tools'); },
    }));

    assert.equal(root.querySelectorAll('[data-tool-editor-header]').length, 1);
    assert.match(
      root.querySelector('[data-tool-editor-header] .manager-breadcrumbs').textContent,
      /Crafting Systems.*The Herbalist.*Tools.*Smith's Hammer/
    );
    root.querySelector('[data-tool-editor-open-systems]').click();
    root.querySelector('[data-tool-editor-open-system]').click();
    root.querySelector('[data-tool-editor-open-tools]').click();
    assert.deepEqual(navigation, ['systems', 'system', 'tools']);
    assert.match(root.querySelector('[data-tool-editor-image]').getAttribute('src'), /hammer/);
    assert.equal(
      root.querySelector('[data-tool-editor-source-context]').textContent,
      'Linked game-world Item'
    );
    assert.equal(root.querySelector('[data-tool-editor-status]').textContent.trim(), 'All changes saved');
    assert.equal(root.querySelector('[data-tool-editor-back][aria-label="Back to Tools"]').textContent.trim(), 'Back');
    assert.ok(root.querySelector('[data-tool-editor-delete]'));
    assert.ok(root.querySelector('[data-tool-editor-save]'));
    assert.equal(root.querySelector('[data-tool-editor-delete]').textContent.trim(), 'Delete');
    assert.equal(root.querySelector('[data-tool-editor-save]').textContent.trim(), 'Save tool');
    assert.equal(root.querySelectorAll('[role="tab"]').length, 4);
    const tabPanel = root.querySelector('[role="tabpanel"]');
    assert.equal(tabPanel.id, 'tool-panel-overview');
    assert.equal(tabPanel.getAttribute('aria-labelledby'), 'tool-tab-overview');
    assert.equal(tabPanel.getAttribute('tabindex'), '0');
    assert.match(root.querySelector('[data-tool-source-card]').textContent, /Smith's Hammer/);
    assert.equal(root.querySelector('[data-tool-source-card] code').textContent, 'hammer');
    assert.equal(root.querySelector('[data-tool-source-card] code').title, 'Item.hammer');
    assert.match(root.querySelector('[data-tool-description]').value, /well-balanced forge hammer/);
    assert.match(root.querySelector('[data-tool-preview-identity]').textContent, /Smith's Hammer/);
    assert.match(root.querySelector('[data-tool-preview-identity]').textContent, /Linked game-world Item/);
    assert.doesNotMatch(root.textContent, /\bKind\b/);
    assert.equal(root.querySelector('footer'), null);
  });

  it('renders the prototype Overview hierarchy in source, guidance, identity, and enabled order', async () => {
    const root = await harness.mount(props());
    const sections = [...root.querySelector('[data-tool-overview-tab]').children];

    assert.deepEqual(
      sections.map((section) => section.dataset.toolOverviewRegion),
      ['source', 'guidance', 'identity', 'enabled']
    );
    assert.ok(root.querySelector('[data-tool-source-card][data-tool-source-layout="compact"]'));
    const sourceCard = root.querySelector('[data-tool-source-card]');
    assert.ok(sourceCard.querySelector('[data-tool-source-unlink]'));
    assert.ok(sourceCard.querySelector('.manager-tool-source-replace:not([open])'));
    assert.equal(
      root.querySelector('[data-tool-overview-region="source"] > .manager-tool-source-replace'),
      null,
      'replacement access stays inside the compact source card'
    );
    assert.equal(root.querySelectorAll('[data-tool-how-it-works] li').length, 3);
    assert.match(
      root.querySelector('[data-tool-how-it-works] li:nth-child(1)').textContent,
      /supplies the name, art, and description/
    );
    assert.match(
      root.querySelector('[data-tool-how-it-works] li:nth-child(2)').textContent,
      /fixed station like a forge.*inventory and surroundings/
    );
    assert.match(
      root.querySelector('[data-tool-how-it-works] li:nth-child(3)').textContent,
      /Breakage tab.*Requirements/
    );
    assert.ok(root.querySelector('[data-tool-how-it-works] [data-tool-guidance-tab="breakage"]'));
    assert.ok(root.querySelector('[data-tool-how-it-works] [data-tool-guidance-tab="requirements"]'));
    assert.equal(root.querySelector('[data-tool-name]').readOnly, true);
    assert.equal(root.querySelector('[data-tool-description]').readOnly, true);
    assert.ok(root.querySelector('[data-tool-label]'));
    assert.ok(root.querySelector('[data-tool-enabled]'));
  });

  it('routes Item picker, unlink, and drop source controls through named callbacks', async () => {
    const calls = [];
    const root = await harness.mount(props({
      onStageSource: (uuid) => calls.push(['stage', uuid]),
      onUnlinkSource: () => calls.push(['unlink']),
      onSourceDrop: (data) => calls.push(['drop', data.uuid])
    }));

    const picker = root.querySelector('[data-tool-source-picker]');
    picker.value = 'Item.replacement';
    picker.dispatchEvent(new Event('change', { bubbles: true }));
    root.querySelector('[data-tool-source-unlink]').click();
    const drop = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(drop, 'dataTransfer', { value: { getData: () => JSON.stringify({ type: 'Item', uuid: 'Item.replacement' }) } });
    root.querySelector('[data-tool-source-card]').dispatchEvent(drop);

    assert.deepEqual(calls, [['stage', 'Item.replacement'], ['unlink'], ['drop', 'Item.replacement']]);
  });

  it('routes all four tab controls without moving actions into a footer', async () => {
    const tabs = [];
    const root = await harness.mount(props({ onTabChange: (id) => tabs.push(id) }));
    for (const button of root.querySelectorAll('[role="tab"]')) button.click();
    assert.deepEqual(tabs, ['overview', 'breakage', 'requirements', 'validation']);
    assert.equal(root.querySelector('footer'), null);
  });

  it('keeps tab relationships truthful and supports standard roving keyboard navigation', async () => {
    const tabs = [];
    const root = await harness.mount(props({
      validation: { valid: false, errors: ['broken', 'also broken'] },
      onTabChange: (id) => tabs.push(id),
    }));
    const buttons = [...root.querySelectorAll('[role="tab"]')];

    assert.equal(buttons[0].getAttribute('aria-controls'), 'tool-panel-overview');
    assert.equal(buttons.slice(1).every((button) => !button.hasAttribute('aria-controls')), true);
    assert.equal(root.querySelector('#tool-panel-overview')?.getAttribute('role'), 'tabpanel');
    assert.equal(buttons[3].querySelector('span').getAttribute('aria-label'), '2 issues');

    buttons[0].focus();
    buttons[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    assert.equal(document.activeElement, buttons[1]);
    buttons[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    assert.equal(document.activeElement, buttons[3]);
    buttons[3].dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    assert.equal(document.activeElement, buttons[0]);
    buttons[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    assert.equal(document.activeElement, buttons[3]);
    assert.deepEqual(tabs, ['breakage', 'validation', 'overview', 'validation']);
  });

  it('offers exactly the authority-owned breakage choices and preserves mode patches', async () => {
    const patches = [];
    const root = await harness.mount(props({ activeTab: 'breakage', onPatch: (patch) => patches.push(patch) }));
    assert.deepEqual(
      Array.from(root.querySelectorAll('input[name="tool-breakage-mode"]')).map((input) => input.value),
      ['limitedUses', 'breakageChance', 'diceExpression']
    );
    const mechanicChoices = root.querySelectorAll('[data-tool-breakage-choice]');
    assert.equal(mechanicChoices.length, 3);
    for (const choice of mechanicChoices) {
      assert.ok(choice.querySelector('input[type="radio"]'));
      assert.ok(choice.querySelector('[data-tool-choice-icon]'));
      assert.ok(choice.querySelector('[data-tool-choice-title]'));
      assert.ok(choice.querySelector('[data-tool-choice-description]'));
    }
    assert.ok(root.querySelector('[data-tool-breakage-authority-explanation]'));
    assert.match(
      root.querySelector('[data-tool-breakage-authority-explanation]').textContent,
      /Set for every Tool from the Tools library\..*System-wide/
    );
    assert.doesNotMatch(
      root.querySelector('[data-tool-breakage-authority-explanation]').textContent,
      /settings for both models/
    );
    assert.ok(root.querySelector('[data-tool-breakage-method-heading]'));
    assert.ok(root.querySelector('[data-tool-limited-uses-stepper]'));
    assert.ok(root.querySelector('[data-tool-limited-uses-info]'));
    root.querySelector('input[value="breakageChance"]').click();
    root.querySelector('input[value="diceExpression"]').click();
    assert.equal(patches[0].breakage.mode, 'breakageChance');
    assert.equal(patches[1].breakage.mode, 'diceExpression');

    harness.remount();
    const immune = await harness.mount(props({ activeTab: 'breakage', authority: 'checkDriven', tool: tool({ checkBreakable: false }) }));
    assert.deepEqual(
      Array.from(immune.querySelectorAll('input[name="tool-check-breakable"]')).map((input) => input.value),
      ['breakable', 'immune']
    );
    assert.equal(immune.querySelectorAll('[data-tool-breakability-choice]').length, 2);
    assert.equal(immune.querySelector('[data-tool-on-break-controls]').disabled, true);
    assert.equal(
      immune.querySelectorAll('[data-tool-on-break-choice] input:disabled').length,
      3,
      'the immune fieldset removes every on-break radio from interaction'
    );
  });

  it('resets inactive breakage mode values when the mounted editor switches Tools', async () => {
    const patches = [];
    const firstTool = tool({
      id: 'first-hammer',
      breakage: { mode: 'breakageChance', breakageChance: 72 },
    });
    const root = await harness.mount(props({
      activeTab: 'breakage',
      tool: firstTool,
      onPatch: (patch) => patches.push(patch),
    }));

    root.querySelector('input[value="limitedUses"]').click();
    await harness.setProps({
      tool: tool({ id: 'second-hammer', breakage: { mode: 'limitedUses', maxUses: 3 } }),
    });
    root.querySelector('input[value="breakageChance"]').click();

    assert.deepEqual(patches.at(-1).breakage, { mode: 'breakageChance', breakageChance: 0 });
  });

  it('supports all on-break actions and Component or direct Item replacement targets', async () => {
    const patches = [];
    const root = await harness.mount(props({ activeTab: 'breakage', tool: tool({ onBreak: { mode: 'replaceWith', replacementTarget: null } }), onPatch: (patch) => patches.push(patch) }));
    assert.deepEqual(
      Array.from(root.querySelectorAll('input[name="tool-on-break"]')).map((input) => input.value),
      ['destroy', 'flagBroken', 'replaceWith']
    );
    const onBreakChoices = root.querySelectorAll('[data-tool-on-break-choice]');
    assert.equal(onBreakChoices.length, 3);
    for (const choice of onBreakChoices) {
      assert.ok(choice.querySelector('[data-tool-choice-icon]'));
      assert.ok(choice.querySelector('[data-tool-choice-title]'));
      assert.ok(choice.querySelector('[data-tool-choice-description]'));
    }
    const type = root.querySelector('[data-tool-replacement-type]');
    type.value = 'component';
    type.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    let picker = root.querySelector('[data-tool-replacement-picker]');
    picker.value = 'scrap';
    picker.dispatchEvent(new Event('change', { bubbles: true }));
    type.value = 'item';
    type.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    picker = root.querySelector('[data-tool-replacement-picker]');
    picker.value = 'Item.replacement';
    picker.dispatchEvent(new Event('change', { bubbles: true }));
    assert.equal(root.querySelectorAll('[data-tool-replacement-target] select:not([data-tool-replacement-type])').length, 1);
    const selectedTargets = patches
      .map((patch) => patch.onBreak?.replacementTarget)
      .filter((target) => target?.componentId || target?.itemUuid);
    assert.deepEqual(selectedTargets.at(-2), { type: 'component', componentId: 'scrap' });
    assert.deepEqual(selectedTargets.at(-1), { type: 'item', itemUuid: 'Item.replacement' });
  });

  it('authors all Recipe-compatible repair match kinds and a cross-type OR group', async () => {
    const patches = [];
    const repairRequirements = [
      { id: 'component', options: [{ quantity: 2, match: { type: 'component', componentId: 'scrap' } }] },
      { id: 'tags', options: [{ quantity: 1, match: { type: 'tags', tags: ['metal'], tagMatch: 'any' } }] },
      { id: 'essence', options: [{ quantity: 1, match: { type: 'essence', essenceId: 'fire', amount: 2 } }] },
      { id: 'currency', options: [{ quantity: 1, match: { type: 'currency', unit: 'gp', amount: 3 } }] },
    ];
    const root = await harness.mount(props({ activeTab: 'breakage', tool: tool({ onBreak: { mode: 'flagBroken' }, repairRequirements }), onPatch: (patch) => patches.push(patch) }));
    assert.ok(root.querySelector('[data-tool-repair-group="0"]'));
    assert.equal(root.querySelectorAll('[data-tool-repair-group]').length, 4);
    assert.ok(root.querySelector('[data-tool-repair-group="0"] .is-component'));
    assert.ok(root.querySelector('[data-tool-repair-group="1"] .is-tag'));
    assert.ok(root.querySelector('[data-tool-repair-group="2"] [data-recipe-option-essence]'));
    assert.ok(root.querySelector('[data-tool-repair-group="3"] [data-recipe-option-currency]'));

    root.querySelector('[data-tool-repair-group="0"] .manager-recipe-or-trigger').click();
    await tick();
    document.querySelector('[data-recipe-add="alternative-essence"]').click();
    await tick();
    assert.deepEqual(
      patches.at(-1).repairRequirements[0].options[1].match,
      { type: 'essence', essenceId: 'fire', amount: 1 }
    );
  });

  it('gates repair essence and currency authoring on the matching system features', async () => {
    const root = await harness.mount(props({
      activeTab: 'breakage',
      tool: tool({
        onBreak: { mode: 'flagBroken' },
        repairRequirements: [{ id: 'g1', options: [{ quantity: 1, match: { type: 'component', componentId: 'scrap' } }] }],
      }),
      essenceOptions: [],
      currencyEnabled: false,
    }));

    assert.equal(root.querySelector('[data-tool-repair-add-group="essence"]'), null);
    assert.equal(root.querySelector('[data-tool-repair-add-group="currency"]'), null);
    root.querySelector('.manager-recipe-or-trigger').click();
    assert.equal(document.querySelector('[data-recipe-add="alternative-essence"]'), null);
    assert.equal(document.querySelector('[data-recipe-add="alternative-currency"]'), null);
  });

  it('authors prerequisite AND gates, gate mode, bonus expression, and presets', async () => {
    const patches = [];
    const root = await harness.mount(props({ activeTab: 'requirements', onPatch: (patch) => patches.push(patch) }));
    assert.equal(root.querySelectorAll('.manager-tool-prerequisite-list input[type="checkbox"]').length, 5);
    assert.equal(root.querySelectorAll('[data-tool-prerequisite-row]').length, 5);
    assert.deepEqual(
      [...root.querySelectorAll('[data-tool-prerequisite-row] strong')].map((node) => node.textContent),
      [
        'Expert Crafter',
        "Proficient with Smith's Tools",
        'Attuned to the Weave',
        'Strength 13 or higher',
        'Trained in Arcana',
      ]
    );
    assert.ok(root.querySelector('[data-tool-prerequisites-enabled]').closest('.manager-status-toggle'));
    assert.ok(root.querySelector('[data-tool-bonus-enabled]').closest('.manager-status-toggle'));
    assert.equal(root.querySelector('[data-tool-prerequisites-enabled]').closest('.manager-status-toggle').textContent.trim(), '');
    assert.equal(root.querySelector('[data-tool-bonus-enabled]').closest('.manager-status-toggle').textContent.trim(), '');
    assert.ok(root.querySelector('[data-tool-requirements-divider]'));
    root.querySelector('.manager-tool-prerequisite-list input[value="strong"]').click();
    root.querySelector('input[name="tool-gate-mode"][value="bonus"]').click();
    root.querySelector('[data-tool-bonus-preset="1d4"]').click();
    assert.ok(patches.some((patch) => patch.prerequisites?.ids?.includes('strong')));
    assert.ok(patches.some((patch) => patch.prerequisites?.gateMode === 'bonus'));
    assert.ok(patches.some((patch) => patch.bonus?.expression === '1d4'));
  });

  it('renders six compact validation checks, a Validation-only live preview note, and alert semantics', async () => {
    const invalidTool = tool({ breakage: { mode: 'breakageChance', breakageChance: 101 }, repairRequirements: [{ id: 'empty', options: [] }] });
    const root = await harness.mount(props({
      activeTab: 'validation',
      tool: invalidTool,
      validation: { valid: false, errors: ['breakage.breakageChance must be an integer between 0 and 100'] },
      focusValidationNonce: 1,
    }));
    assert.equal(root.querySelectorAll('[data-tool-validation-check]').length, 6);
    assert.deepEqual(
      [...root.querySelectorAll('[data-tool-validation-check] span')].map((node) => node.textContent),
      [
        'A game-world Item is linked',
        'Breakage roll has an expression',
        'Replacement item is set',
        'At least one prerequisite is selected',
        'Bonus expression is set',
        'Repair requirements are complete',
      ]
    );
    assert.equal(root.querySelector('[data-tool-validation-check="breakage"]').classList.contains('is-invalid'), true);
    assert.equal(root.querySelector('[data-tool-validation-check="repair"]').classList.contains('is-invalid'), true);
    assert.equal(
      root.querySelector('.manager-tool-validation-chip').getAttribute('aria-label'),
      '2 issues'
    );
    assert.equal(
      root.querySelector('.manager-tool-validation-chip').textContent.trim(),
      '2 issues'
    );
    assert.equal(
      root.querySelector('.manager-tool-validation-summary .manager-chip'),
      null,
      'the sparse Validation heading does not pull the status chip back into its title row'
    );
    assert.ok(root.querySelector('[role="alert"]'));
    assert.match(root.querySelector('[data-tool-behavior-preview]').textContent, /Smith's Hammer/);
    assert.match(root.querySelector('[data-tool-preview-breakage]').textContent, /101% break chance/);
    assert.match(root.querySelector('[data-tool-validation-errors]').textContent, /Break chance must be between 0% and 100%/);
    assert.equal(root.querySelector('[data-first-validation-failure]').getAttribute('tabindex'), '-1');
    assert.equal(document.activeElement, root.querySelector('[data-first-validation-failure]'));
    assert.doesNotMatch(root.textContent, /breakage\.breakageChance|breakageChance/);
    assert.ok(root.querySelector('[data-tool-validation-heading]'));
    assert.equal(root.querySelector('[data-tool-validation-heading] h3').textContent.trim(), 'Validation');
    assert.doesNotMatch(root.querySelector('[data-tool-validation-heading]').textContent, /Check this Tool before saving/);
    assert.equal(root.querySelector('[data-tool-validation-tab] > .manager-tool-editor-card'), null);
    assert.equal(root.querySelectorAll('[data-tool-preview-rule] i').length, 4);
    assert.ok(root.querySelector('[data-tool-preview-live-update]'));
  });

  it('reports a missing bonus independently without duplicating its domain blocker and preserves all-pass state', async () => {
    const root = await harness.mount(props({
      activeTab: 'validation',
      tool: tool({ bonus: { enabled: true, expression: '' } }),
      validation: {
        valid: false,
        errors: ['bonus.expression is required when bonus is enabled'],
      },
    }));

    assert.equal(
      root.querySelector('[data-tool-validation-check="prerequisites"]').classList.contains('is-invalid'),
      false
    );
    assert.equal(
      root.querySelector('[data-tool-validation-check="bonus"]').classList.contains('is-invalid'),
      true
    );
    assert.equal(
      root.querySelector('[data-tool-validation-check="repair"]').classList.contains('is-invalid'),
      false
    );
    assert.equal(
      root.querySelector('[data-tool-validation-check="prerequisites"] span').textContent,
      'At least one prerequisite is selected'
    );
    assert.equal(
      root.querySelector('[data-tool-validation-check="bonus"] span').textContent,
      'Bonus expression is set'
    );
    assert.equal(
      root.querySelector('[data-tool-validation-check="repair"] span').textContent,
      'Repair requirements are complete'
    );
    assert.equal(
      root.querySelector('.manager-tool-validation-chip').getAttribute('aria-label'),
      '1 issue'
    );
    assert.equal(
      root.querySelector('.manager-tool-validation-chip').textContent.trim(),
      '1 issue'
    );
    assert.equal(root.querySelector('#tool-tab-validation span').textContent, '1');
    assert.equal(
      root.querySelector('#tool-tab-validation span').getAttribute('aria-label'),
      '1 issue'
    );
    assert.match(
      root.querySelector('[data-tool-validation-errors]').textContent,
      /Enter a bonus expression or turn the bonus off/
    );

    harness.remount();
    const validRoot = await harness.mount(props({ activeTab: 'validation' }));
    assert.equal(validRoot.querySelectorAll('[data-tool-validation-check]').length, 6);
    assert.equal(validRoot.querySelectorAll('[data-tool-validation-check].is-invalid').length, 0);
    assert.equal(
      validRoot.querySelector('.manager-tool-validation-chip').textContent.trim(),
      'All checks pass'
    );
    assert.equal(validRoot.querySelector('#tool-tab-validation span').textContent, '✓');
    assert.equal(
      validRoot.querySelector('#tool-tab-validation span').getAttribute('aria-label'),
      'All checks pass'
    );
  });

  it('uses prototype preview copy and omits the live-update note outside Validation', async () => {
    const root = await harness.mount(props({ activeTab: 'breakage' }));

    assert.equal(root.querySelector('[data-tool-behavior-preview] > .manager-kicker').textContent, 'How it behaves');
    assert.equal(root.querySelector('[data-tool-preview-breakage]').textContent, '5 uses');
    assert.equal(root.querySelector('[data-tool-preview-on-break]').textContent, 'On break: destroy the item');
    assert.equal(root.querySelector('[data-tool-preview-prerequisites]').textContent, '1 prerequisite');
    assert.equal(root.querySelector('[data-tool-preview-bonus]').textContent, 'Adds @prof');
    assert.match(root.querySelector('[data-tool-preview-identity]').textContent, /5 uses.*@prof/);
    assert.equal(root.querySelector('[data-tool-preview-live-update]'), null);
  });

  it('localizes effective behavior states instead of exposing stored mode tokens', async () => {
    const root = await harness.mount(props({
      authority: 'checkDriven',
      tool: tool({
        checkBreakable: false,
        onBreak: { mode: 'flagBroken' },
        prerequisites: { enabled: false, ids: [], gateMode: 'usability' },
        bonus: { enabled: true, expression: '' },
      }),
    }));

    assert.equal(root.querySelector('[data-tool-preview-breakage]').textContent, 'Never breaks');
    assert.equal(
      root.querySelector('[data-tool-preview-on-break]').textContent,
      'Not applicable while this Tool cannot break'
    );
    assert.equal(root.querySelector('[data-tool-preview-prerequisites]').textContent, 'Off');
    assert.equal(root.querySelector('[data-tool-preview-bonus]').textContent, 'Incomplete');
    assert.doesNotMatch(root.textContent, /flagBroken|limitedUses|breakageChance/);
  });

  it('projects domain validation and save failures to localized safe copy', async () => {
    const rawErrors = [
      'a tool requires either a componentId or its own source references',
      'repairRequirements[2]: Tag-based ingredient match requires at least one tag',
      'unexpected internal validation detail',
    ];
    const root = await harness.mount(props({
      activeTab: 'validation',
      validation: { valid: false, errors: rawErrors },
      saveError: 'database adapter exploded',
    }));

    const blockers = root.querySelector('[data-tool-validation-errors]').textContent;
    assert.match(blockers, /Link an Item or managed Component/);
    assert.match(blockers, /Repair group 3 is incomplete/);
    assert.match(blockers, /Some Tool settings are incomplete/);
    assert.doesNotMatch(blockers, /componentId|repairRequirements|unexpected internal/);
    assert.equal(root.querySelector('[data-tool-save-error]').textContent, 'The Tool could not be saved. Try again.');
    assert.equal(root.querySelector('[data-tool-editor-save]').getAttribute('title'), 'Resolve validation issues before saving.');
  });

  it('accepts every complete repair match kind and rejects an incomplete option', async () => {
    const completeRepairRequirements = [
      {
        id: 'component',
        options: [{ quantity: 1, match: { type: 'component', componentId: 'scrap' } }],
      },
      {
        id: 'tags',
        options: [
          { quantity: 1, match: { type: 'tags', tags: ['metal'], tagMatch: 'any' } },
        ],
      },
      {
        id: 'essence',
        options: [
          { quantity: 1, match: { type: 'essence', essenceId: 'fire', amount: 2 } },
        ],
      },
      {
        id: 'currency',
        options: [{ quantity: 1, match: { type: 'currency', unit: 'gp', amount: 3 } }],
      },
    ];
    const root = await harness.mount(
      props({
        activeTab: 'validation',
        tool: tool({ repairRequirements: completeRepairRequirements }),
      })
    );

    assert.equal(
      root.querySelector('[data-tool-validation-check="repair"]').classList.contains('is-invalid'),
      false
    );

    harness.remount();
    const incomplete = await harness.mount(
      props({
        activeTab: 'validation',
        tool: tool({
          repairRequirements: [
            ...completeRepairRequirements,
            {
              id: 'incomplete',
              options: [{ quantity: 1, match: { type: 'tags', tags: [] } }],
            },
          ],
        }),
      })
    );

    assert.equal(
      incomplete.querySelector('[data-tool-validation-check="repair"]').classList.contains('is-invalid'),
      true
    );

    for (const quantity of ['garbage', '1']) {
      harness.remount();
      const malformedQuantity = await harness.mount(
        props({
          activeTab: 'validation',
          tool: tool({
            repairRequirements: [
              {
                id: `quantity-${quantity}`,
                options: [
                  {
                    quantity,
                    match: { type: 'component', componentId: 'scrap' },
                  },
                ],
              },
            ],
          }),
        })
      );

      assert.equal(
        malformedQuantity
          .querySelector('[data-tool-validation-check="repair"]')
          .classList.contains('is-invalid'),
        true,
        `repair quantity ${JSON.stringify(quantity)} should match model validation`
      );
    }
  });
});
