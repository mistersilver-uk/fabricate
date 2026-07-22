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
  { id: 'hammer-component', name: 'Smith Hammer', img: 'icons/tools/hand/hammer-cobbler-steel.webp', description: 'A trusted workshop hammer.' },
  { id: 'scrap', name: 'Iron Scrap', img: 'icons/commodities/metal/fragments-steel.webp' }
];
const worldItems = [
  { uuid: 'Item.hammer', name: 'Smith Hammer', img: managedItems[0].img, description: 'A trusted workshop hammer.' },
  { uuid: 'Item.replacement', name: 'Bent Hammer', img: managedItems[0].img, description: 'Still useful.' }
];
const prerequisites = [
  { id: 'smith', name: 'Trained Smith', expression: '@skills.smithing > 0' },
  { id: 'strong', name: 'Strong', expression: '@abilities.str.mod >= 2' }
];
const itemTags = ['metal', 'salvage'];
const essenceOptions = [{ id: 'fire', name: 'Fire', icon: 'fas fa-fire' }];
const currencyUnits = [{ id: 'gp', label: 'Gold', icon: 'fas fa-coins' }];

function tool(overrides = {}) {
  return {
    id: 'hammer',
    name: 'Smith Hammer',
    img: managedItems[0].img,
    description: 'A trusted workshop hammer.',
    registeredItemUuid: 'Item.hammer',
    originItemUuid: 'Item.hammer',
    enabled: true,
    label: '',
    breakage: { mode: 'limitedUses', maxUses: 8 },
    checkBreakable: true,
    onBreak: { mode: 'flagBroken' },
    repairRequirements: [],
    prerequisites: { enabled: true, ids: ['smith'], gateMode: 'usability' },
    bonus: { enabled: true, expression: '+1' },
    ...overrides
  };
}

function props(overrides = {}) {
  return {
    tool: tool(),
    validation: { valid: true, errors: [] },
    dirty: true,
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
    const root = await harness.mount(props());

    assert.ok(root.querySelector('[data-tool-editor-back][aria-label="Back to Tools"]'));
    assert.ok(root.querySelector('[data-tool-editor-delete]'));
    assert.ok(root.querySelector('[data-tool-editor-save]'));
    assert.equal(root.querySelectorAll('[role="tab"]').length, 4);
    assert.equal(root.querySelector('[role="tabpanel"]').getAttribute('aria-labelledby'), 'tool-tab-overview');
    assert.match(root.querySelector('[data-tool-source-card]').textContent, /Smith Hammer/);
    assert.match(root.querySelector('[data-tool-source-card]').textContent, /Item\.hammer/);
    assert.match(root.querySelector('[data-tool-source-card]').textContent, /trusted workshop hammer/);
    assert.doesNotMatch(root.textContent, /\bKind\b/);
    assert.equal(root.querySelector('footer'), null);
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
    assert.equal(buttons[3].querySelector('span').getAttribute('aria-label'), '2 errors');

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
    assert.equal(immune.querySelector('[data-tool-on-break-controls]').disabled, true);
  });

  it('supports all on-break actions and Component or direct Item replacement targets', async () => {
    const patches = [];
    const root = await harness.mount(props({ activeTab: 'breakage', tool: tool({ onBreak: { mode: 'replaceWith', replacementTarget: null } }), onPatch: (patch) => patches.push(patch) }));
    assert.deepEqual(
      Array.from(root.querySelectorAll('input[name="tool-on-break"]')).map((input) => input.value),
      ['destroy', 'flagBroken', 'replaceWith']
    );
    const selects = root.querySelectorAll('[data-tool-replacement-target] select');
    selects[0].value = 'scrap';
    selects[0].dispatchEvent(new Event('change', { bubbles: true }));
    selects[1].value = 'Item.replacement';
    selects[1].dispatchEvent(new Event('change', { bubbles: true }));
    assert.deepEqual(patches.at(-2).onBreak.replacementTarget, { type: 'component', componentId: 'scrap' });
    assert.deepEqual(patches.at(-1).onBreak.replacementTarget, { type: 'item', itemUuid: 'Item.replacement' });
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
    assert.equal(root.querySelectorAll('.manager-tool-prerequisite-list input[type="checkbox"]').length, 2);
    root.querySelector('.manager-tool-prerequisite-list input[value="strong"]').click();
    root.querySelector('input[name="tool-gate-mode"][value="bonus"]').click();
    root.querySelector('[data-tool-bonus-preset="1d4"]').click();
    assert.ok(patches.some((patch) => patch.prerequisites?.ids?.includes('strong')));
    assert.ok(patches.some((patch) => patch.prerequisites?.gateMode === 'bonus'));
    assert.ok(patches.some((patch) => patch.bonus?.expression === '1d4'));
  });

  it('renders five validation checks, range/repair failures, live preview, and alert semantics', async () => {
    const invalidTool = tool({ breakage: { mode: 'breakageChance', breakageChance: 101 }, repairRequirements: [{ id: 'empty', options: [] }] });
    const root = await harness.mount(props({ activeTab: 'validation', tool: invalidTool, validation: { valid: false, errors: ['breakage.breakageChance must be an integer between 0 and 100'] } }));
    assert.equal(root.querySelectorAll('[data-tool-validation-check]').length, 5);
    assert.equal(root.querySelector('[data-tool-validation-check="breakage"]').classList.contains('is-invalid'), true);
    assert.equal(root.querySelector('[data-tool-validation-check="repair"]').classList.contains('is-invalid'), true);
    assert.equal(
      root.querySelector('.manager-tool-validation-summary .manager-chip').getAttribute('aria-label'),
      '3 issues'
    );
    assert.ok(root.querySelector('[role="alert"]'));
    assert.match(root.querySelector('[data-tool-behavior-preview]').textContent, /Smith Hammer/);
    assert.match(root.querySelector('[data-tool-preview-breakage]').textContent, /101% break chance/);
    assert.match(root.querySelector('[data-tool-validation-errors]').textContent, /Break chance must be between 0% and 100%/);
    assert.doesNotMatch(root.textContent, /breakage\.breakageChance|breakageChance/);
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
