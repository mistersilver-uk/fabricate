import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tick } from 'svelte';
import {
  createMountedComponentHarness,
  SEARCHABLE_POPOVER_RAW_MODULES,
} from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const fabricateCss = readFileSync(resolve(repoRoot, 'styles/fabricate.css'), 'utf8');
const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-tool-editor-',
  rawModules: [
    'src/config/flags.js',
    'src/models/Ingredient.js',
    'src/models/IngredientGroup.js',
    'src/models/Tool.js',
    'src/models/match/matchTypes.js',
    'src/systems/characterModifierPrerequisiteCopy.js',
    'src/systems/characterPrerequisites.js',
    'src/utils/plainTextDescription.js',
    'src/ui/svelte/util/foundryBridge.js',
    'src/ui/svelte/util/chanceColorScale.js',
    'src/ui/svelte/util/dropRateTier.js',
    'src/ui/svelte/util/recipeCurrency.js',
    'src/ui/svelte/actions/dragDrop.js',
    'src/ui/svelte/apps/manager/tools/toolStudio.js',
    ...SEARCHABLE_POPOVER_RAW_MODULES,
  ],
  compiledModules: [
    // The shared no-state primitive (issue 785). A `.svelte` the tree renders but
    // the harness omits HANGS the suite (# cancelled) rather than failing it.
    'src/ui/svelte/apps/manager/EmptyState.svelte',
    // The shared side-panel explainer card and icon fact row (issue 881); the behavior
    // preview renders both.
    'src/ui/svelte/apps/manager/ExplainerCard.svelte',
    'src/ui/svelte/apps/manager/IconFactRow.svelte',
    // The shared chip (issue 883); the library rows, the browser inspector, the editor
    // tab bar and the behavior preview all render it.
    'src/ui/svelte/apps/manager/Chip.svelte',
    'src/ui/svelte/components/ChanceSlider.svelte',
    'src/ui/svelte/components/Stepper.svelte',
    'src/ui/svelte/apps/manager/SearchablePopover.svelte',
    'src/ui/svelte/apps/manager/ChecklistCardRow.svelte',
    'src/ui/svelte/apps/manager/EditorValidationSurface.svelte',
    'src/ui/svelte/apps/manager/ItemDropZone.svelte',
    'src/ui/svelte/apps/manager/RadioCardGroup.svelte',
    'src/ui/svelte/apps/manager/RollDataExpressionInput.svelte',
    'src/ui/svelte/apps/manager/ToggleCard.svelte',
    'src/ui/svelte/apps/manager/recipe/RecipeIngredientGroupCard.svelte',
    'src/ui/svelte/apps/manager/recipe/RecipeIngredientOption.svelte',
    'src/ui/svelte/apps/manager/recipe/RecipeIngredientSetCard.svelte',
    'src/ui/svelte/apps/manager/tools/ToolBehaviorPreview.svelte',
    'src/ui/svelte/apps/manager/tools/ToolBreakageTab.svelte',
    'src/ui/svelte/apps/manager/tools/ToolEditorTabs.svelte',
    'src/ui/svelte/apps/manager/tools/ToolOverviewTab.svelte',
    'src/ui/svelte/apps/manager/tools/ToolRepairRequirements.svelte',
    'src/ui/svelte/apps/manager/tools/ToolRequirementsTab.svelte',
    'src/ui/svelte/apps/manager/tools/ToolValidationTab.svelte',
    'src/ui/svelte/apps/manager/ToolEditView.svelte',
  ],
  componentPath: 'src/ui/svelte/apps/manager/ToolEditView.svelte',
});

const managedItems = [
  {
    id: 'hammer-component',
    name: "Smith's Hammer",
    img: 'icons/tools/hand/hammer-cobbler-steel.webp',
    description: 'A well-balanced forge hammer. Durable, but the haft splinters when hard used.',
  },
  { id: 'scrap', name: 'Iron Scrap', img: 'icons/commodities/metal/fragments-steel.webp' },
];
const worldItems = [
  {
    uuid: 'Item.hammer',
    name: "Smith's Hammer",
    img: managedItems[0].img,
    description: managedItems[0].description,
  },
  {
    uuid: 'Item.replacement',
    name: 'Bent Hammer',
    img: managedItems[0].img,
    description: 'Still useful.',
  },
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
    ...overrides,
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
    ...overrides,
  };
}

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

describe('Tool Studio editor (mounted)', () => {
  it('renders header-only actions, four accessible tabs, linked Item evidence, and no Kind', async () => {
    const navigation = [];
    const root = await harness.mount(
      props({
        systemName: 'The Herbalist',
        onOpenSystems: () => {
          navigation.push('systems');
        },
        onOpenSystem: () => {
          navigation.push('system');
        },
        onOpenTools: () => {
          navigation.push('tools');
        },
      })
    );

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
    assert.equal(root.querySelector('[data-tool-editor-status]'), null);
    assert.equal(
      root.querySelector('[data-tool-editor-back][aria-label="Back to Tools"]').textContent.trim(),
      'Back to tools'
    );
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
    assert.equal(root.querySelector('[data-tool-source-card] code'), null);
    assert.match(
      root.querySelector('[data-tool-description]').textContent,
      /well-balanced forge hammer/
    );
    assert.match(root.querySelector('[data-tool-preview-identity]').textContent, /Smith's Hammer/);
    assert.match(
      root.querySelector('[data-tool-preview-identity]').textContent,
      /Linked game-world Item/
    );
    assert.doesNotMatch(root.textContent, /\bKind\b/);
    assert.equal(root.querySelector('footer'), null);
  });

  it('renders the Overview hierarchy and persistent inspector guidance', async () => {
    const root = await harness.mount(props());
    const sections = [...root.querySelector('[data-tool-overview-tab]').children];

    assert.deepEqual(
      sections.map((section) => section.dataset.toolOverviewRegion),
      ['source', 'identity', 'enabled']
    );
    assert.ok(root.querySelector('[data-tool-source-card][data-tool-source-layout="compact"]'));
    const sourceCard = root.querySelector('[data-tool-source-card]');
    assert.equal(sourceCard.getAttribute('role'), null);
    assert.equal(sourceCard.getAttribute('tabindex'), null);
    assert.ok(sourceCard.querySelector('[data-tool-source-drop-hint]'));
    const sourceActions = [
      ...sourceCard.querySelectorAll('.manager-item-drop-zone-actions > button'),
    ];
    assert.deepEqual(
      sourceActions.map((button) =>
        button.hasAttribute('data-tool-source-copy-uuid') ? 'copy' : 'unlink'
      ),
      ['copy', 'unlink']
    );
    assert.equal(sourceCard.querySelector('[data-tool-source-picker]'), null);
    assert.equal(sourceCard.querySelector('.manager-tool-source-replace'), null);
    assert.equal(root.querySelectorAll('[data-tool-how-it-works] li').length, 6);
    // The bold lead-in and its prose are one sentence and need a separator between them.
    // A literal space in the template is the last token inside the `{#if}`, and Svelte
    // trims block-trailing whitespace, so they rendered welded: "…game-world Item.Drag any
    // Item…". Every existing assertion here matches MID-sentence and so cannot see the
    // join; this one straddles it. Found in a screenshot, not by a test (issue 881).
    for (const row of root.querySelectorAll('[data-tool-how-it-works] li')) {
      const lead = row.querySelector('strong')?.textContent;
      if (!lead) continue;
      // Asserted on the JOIN, not the string start: the row's textContent carries leading
      // whitespace from the glyph element, so anchoring at position 0 fails on markup that
      // is actually correct.
      assert.ok(
        row.textContent.includes(`${lead} `),
        `explainer lead-in "${lead}" must be followed by a space, got "${row.textContent.slice(0, 60)}"`
      );
    }
    assert.match(
      root.querySelector('[data-tool-how-it-works] li:nth-child(1)').textContent,
      /supplies the name, art, and description/
    );
    assert.match(
      root.querySelector('[data-tool-how-it-works] li:nth-child(2)').textContent,
      /recipe.*Tool’s library identity/i
    );
    assert.match(
      root.querySelector('[data-tool-how-it-works] li:nth-child(3)').textContent,
      /salvaging components/i
    );
    assert.match(
      root.querySelector('[data-tool-how-it-works] li:nth-child(4)').textContent,
      /character prerequisites/i
    );
    assert.match(
      root.querySelector('[data-tool-how-it-works] li:nth-child(5)').textContent,
      /check bonus/i
    );
    assert.match(
      root.querySelector('[data-tool-how-it-works] li:nth-child(6)').textContent,
      /breakage/i
    );
    assert.equal(root.querySelector('[data-tool-how-it-works] button'), null);
    assert.equal(
      root
        .querySelector('[data-tool-how-it-works] a.manager-explainer-card-docs')
        ?.textContent.trim(),
      'Read the docs'
    );
    assert.equal(root.querySelector('[data-tool-name]'), null);
    assert.equal(root.querySelector('[data-tool-description]').matches('input, textarea'), false);
    assert.ok(root.querySelector('[data-tool-label]').closest('.manager-recipe-field'));
    assert.ok(root.querySelector('[data-tool-enabled] .manager-recipe-status-card'));
  });

  it('routes Copy UUID, unlink, and drag-only source replacement through named callbacks', async () => {
    const calls = [];
    const root = await harness.mount(
      props({
        onCopySourceUuid: (uuid) => calls.push(['copy', uuid]),
        onUnlinkSource: () => calls.push(['unlink']),
        onSourceDrop: (data) => calls.push(['drop', data.uuid]),
      })
    );

    root.querySelector('[data-tool-source-copy-uuid]').click();
    root.querySelector('[data-tool-source-unlink]').click();
    const drop = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(drop, 'dataTransfer', {
      value: { getData: () => JSON.stringify({ type: 'Item', uuid: 'Item.replacement' }) },
    });
    root.querySelector('[data-tool-source-card]').dispatchEvent(drop);

    assert.deepEqual(calls, [['copy', 'Item.hammer'], ['unlink'], ['drop', 'Item.replacement']]);
  });

  it('stages only Display label and routes Enabled through immediate persistence', async () => {
    const patches = [];
    const enabled = [];
    const root = await harness.mount(
      props({
        onPatch: (patch) => patches.push(patch),
        onToggleEnabled: (value) => enabled.push(value),
      })
    );

    assert.equal(root.querySelector('[data-tool-name]'), null);
    assert.equal(root.querySelector('[data-tool-description]').matches('input, textarea'), false);
    const label = root.querySelector('[data-tool-label]');
    label.value = 'Display-only name';
    label.dispatchEvent(new Event('input', { bubbles: true }));
    root.querySelector('[data-tool-enabled] .manager-status-toggle').click();

    assert.deepEqual(patches, [{ label: 'Display-only name' }]);
    assert.deepEqual(enabled, [false]);
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
    const root = await harness.mount(
      props({
        validation: { valid: false, errors: ['broken', 'also broken'] },
        onTabChange: (id) => tabs.push(id),
      })
    );
    const buttons = [...root.querySelectorAll('[role="tab"]')];

    assert.deepEqual(
      buttons.map((button) => button.getAttribute('aria-controls')),
      [
        'tool-panel-overview',
        'tool-panel-breakage',
        'tool-panel-requirements',
        'tool-panel-validation',
      ]
    );
    assert.equal(root.querySelector('#tool-panel-overview')?.getAttribute('role'), 'tabpanel');
    assert.equal(
      buttons[3].querySelector('.manager-editor-tab-badge').getAttribute('aria-label'),
      '1 issue'
    );

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
    const root = await harness.mount(
      props({ activeTab: 'breakage', onPatch: (patch) => patches.push(patch) })
    );
    assert.deepEqual(
      Array.from(root.querySelectorAll('input[name="tool-breakage-mode"]')).map(
        (input) => input.value
      ),
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
    assert.ok(root.querySelector('[data-tool-breakage-config-divider]'));
    assert.ok(root.querySelector('[data-tool-limited-uses-stepper]'));
    assert.ok(root.querySelector('[data-tool-limited-uses-info]'));
    root.querySelector('input[value="breakageChance"]').click();
    root.querySelector('input[value="diceExpression"]').click();
    assert.equal(patches[0].breakage.mode, 'breakageChance');
    assert.equal(patches[1].breakage.mode, 'diceExpression');

    await harness.setProps({
      tool: tool({ breakage: { mode: 'breakageChance', breakageChance: 15 } }),
    });
    const chanceCard = root.querySelector('[data-tool-breakage-chance]');
    const chanceNumber = chanceCard.querySelector('[data-tool-breakage-chance-input]');
    const chanceRange = chanceCard.querySelector('[data-tool-breakage-chance-range]');
    assert.equal(chanceNumber.type, 'number');
    assert.equal(chanceRange.type, 'range');
    assert.equal(chanceNumber.value, '15');
    assert.equal(chanceRange.value, '15');

    chanceNumber.value = '62';
    chanceNumber.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    assert.equal(chanceRange.value, '62');
    assert.deepEqual(patches.at(-1), {
      breakage: { mode: 'breakageChance', breakageChance: 62 },
    });
    const chanceControl = chanceCard.querySelector('.manager-tool-breakage-chance-control');
    assert.ok(
      chanceControl.classList.contains('has-continuous-gradient'),
      'Tool breakage renders the optional full-track semantic gradient'
    );
    assert.match(
      chanceControl.getAttribute('style'),
      /--fab-drop-rate-color: color-mix\(in srgb, var\(--fab-warning\).+var\(--fab-badge-gold\)/
    );
    assert.match(
      chanceControl.getAttribute('style'),
      /--fab-chance-slider-track-gradient: var\(--fab-tool-breakage-chance-track-gradient\)/
    );
    assert.match(
      fabricateCss,
      /\.fabricate-manager \.manager-tool-breakage-chance-control\s*\{\s*--fab-tool-breakage-chance-track-gradient:\s*linear-gradient\(\s*90deg,\s*var\(--fab-success\) 0%,\s*var\(--fab-warning\) 33%,\s*var\(--fab-badge-gold\) 66%,\s*var\(--fab-danger\) 100%\s*\);/
    );
    assert.ok(chanceControl.querySelector('.manager-drop-rate-fill'));

    chanceRange.value = '88';
    chanceRange.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    assert.equal(chanceNumber.value, '88');
    assert.deepEqual(patches.at(-1), {
      breakage: { mode: 'breakageChance', breakageChance: 88 },
    });

    await harness.setProps({
      tool: tool({ breakage: { mode: 'diceExpression', formula: '1d20', threshold: 5 } }),
    });
    assert.ok(root.querySelector('[data-tool-breakage-formula]').closest('.manager-recipe-field'));
    assert.ok(
      root.querySelector('[data-tool-breakage-threshold]').closest('.manager-recipe-field')
    );

    harness.remount();
    const immune = await harness.mount(
      props({
        activeTab: 'breakage',
        authority: 'checkDriven',
        tool: tool({ checkBreakable: false }),
      })
    );
    assert.deepEqual(
      Array.from(immune.querySelectorAll('input[name="tool-check-breakable"]')).map(
        (input) => input.value
      ),
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
    const root = await harness.mount(
      props({
        activeTab: 'breakage',
        tool: firstTool,
        onPatch: (patch) => patches.push(patch),
      })
    );

    root.querySelector('input[value="limitedUses"]').click();
    await harness.setProps({
      tool: tool({ id: 'second-hammer', breakage: { mode: 'limitedUses', maxUses: 3 } }),
    });
    root.querySelector('input[value="breakageChance"]').click();

    assert.deepEqual(patches.at(-1).breakage, { mode: 'breakageChance', breakageChance: 0 });
  });

  it('supports all on-break actions and component-only replacement authoring', async () => {
    const patches = [];
    const root = await harness.mount(
      props({
        activeTab: 'breakage',
        tool: tool({
          onBreak: {
            mode: 'replaceWith',
            replacementTarget: { type: 'component', componentId: 'scrap' },
          },
        }),
        onPatch: (patch) => patches.push(patch),
      })
    );
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
    assert.match(
      root.querySelector('[data-tool-on-break-choice="replaceWith"]').textContent,
      /Replace with component/
    );
    assert.ok(root.querySelector('[data-tool-on-break-divider]'));
    assert.ok(root.querySelector('[data-tool-replacement-target].manager-tool-replacement-card'));
    assert.equal(
      root
        .querySelector('.manager-tool-replacement-component-trigger')
        .classList.contains('manager-button'),
      true
    );
    assert.ok(
      root.querySelector(
        '.manager-tool-replacement-component-trigger .manager-tool-replacement-component-name'
      ),
      'the replacement Component trigger uses the shared bounded picker-value geometry'
    );
    assert.ok(
      root.querySelector(
        '.manager-tool-replacement-component-trigger .manager-travel-portrait img'
      ),
      'the selected replacement Component image remains inside the shared portrait wrapper'
    );
    assert.equal(root.querySelector('input[name="tool-replacement-type"]'), null);
    assert.equal(root.querySelector('[data-item-drop-zone="tool-replacement"]'), null);
    root.querySelector('.manager-tool-replacement-component-trigger').click();
    await tick();
    document.querySelector('.manager-travel-option[title="Smith\'s Hammer"]').click();
    const selectedTargets = patches
      .map((patch) => patch.onBreak?.replacementTarget)
      .filter((target) => target?.componentId);
    assert.deepEqual(selectedTargets.at(-1), {
      type: 'component',
      componentId: 'hammer-component',
    });
  });

  it('does not expose legacy direct-Item targets and converts only after Component selection', async () => {
    const patches = [];
    const root = await harness.mount(
      props({
        activeTab: 'breakage',
        tool: tool({
          onBreak: {
            mode: 'replaceWith',
            replacementTarget: {
              type: 'item',
              itemUuid: 'Compendium.mythwright.items.Item.broken',
            },
          },
        }),
        onPatch: (patch) => patches.push(patch),
      })
    );

    assert.equal(root.querySelector('[data-item-drop-zone="tool-replacement"]'), null);
    assert.equal(root.querySelector('input[name="tool-replacement-type"]'), null);
    assert.equal(patches.length, 0, 'rendering a legacy target does not rewrite it');

    root.querySelector('.manager-tool-replacement-component-trigger').click();
    await tick();
    document.querySelector('.manager-travel-option[title="Iron Scrap"]').click();
    assert.deepEqual(patches.at(-1).onBreak.replacementTarget, {
      type: 'component',
      componentId: 'scrap',
    });
  });

  it('restores focus to the Component picker trigger after Escape and outside dismissal', async () => {
    const root = await harness.mount(
      props({
        activeTab: 'breakage',
        tool: tool({ onBreak: { mode: 'replaceWith', replacementTarget: null } }),
      })
    );
    const trigger = root.querySelector('.manager-tool-replacement-component-trigger');

    trigger.click();
    await tick();
    const firstPopover = document.querySelector('.manager-travel-popover');
    firstPopover.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await tick();
    assert.equal(document.querySelector('.manager-travel-popover'), null);
    assert.equal(document.activeElement, trigger);

    trigger.click();
    await tick();
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await tick();
    assert.equal(document.querySelector('.manager-travel-popover'), null);
    assert.equal(document.activeElement, trigger);
    outside.remove();
  });

  it('authors all Recipe-compatible repair match kinds and a cross-type OR group', async () => {
    const patches = [];
    const repairRequirements = [
      {
        id: 'component',
        options: [{ quantity: 2, match: { type: 'component', componentId: 'scrap' } }],
      },
      {
        id: 'tags',
        options: [{ quantity: 1, match: { type: 'tags', tags: ['metal'], tagMatch: 'any' } }],
      },
      {
        id: 'essence',
        options: [{ quantity: 1, match: { type: 'essence', essenceId: 'fire', amount: 2 } }],
      },
      {
        id: 'currency',
        options: [{ quantity: 1, match: { type: 'currency', unit: 'gp', amount: 3 } }],
      },
    ];
    const root = await harness.mount(
      props({
        activeTab: 'breakage',
        tool: tool({ onBreak: { mode: 'flagBroken' }, repairRequirements }),
        onPatch: (patch) => patches.push(patch),
      })
    );
    assert.ok(root.querySelector('[data-recipe-group-id="component"]'));
    assert.equal(root.querySelectorAll('[data-recipe-group]').length, 4);
    assert.ok(root.querySelector('[data-recipe-group-id="component"] .is-component'));
    assert.ok(root.querySelector('[data-recipe-group-id="tags"] .is-tag'));
    assert.ok(root.querySelector('[data-recipe-group-id="essence"] [data-recipe-option-essence]'));
    assert.ok(
      root.querySelector('[data-recipe-group-id="currency"] [data-recipe-option-currency]')
    );

    root.querySelector('[data-recipe-group-id="component"] .manager-recipe-or-trigger').click();
    await tick();
    document.querySelector('[data-recipe-add="alternative-essence"]').click();
    await tick();
    assert.deepEqual(patches.at(-1).repairRequirements[0].options[1].match, {
      type: 'essence',
      essenceId: 'fire',
      amount: 1,
    });
  });

  it('gates repair essence and currency authoring on the matching system features', async () => {
    const root = await harness.mount(
      props({
        activeTab: 'breakage',
        tool: tool({
          onBreak: { mode: 'flagBroken' },
          repairRequirements: [
            {
              id: 'g1',
              options: [{ quantity: 1, match: { type: 'component', componentId: 'scrap' } }],
            },
          ],
        }),
        essenceOptions: [],
        currencyEnabled: false,
      })
    );

    assert.equal(root.querySelector('[data-tool-repair-add-group="essence"]'), null);
    assert.equal(root.querySelector('[data-tool-repair-add-group="currency"]'), null);
    root.querySelector('.manager-recipe-or-trigger').click();
    assert.equal(document.querySelector('[data-recipe-add="alternative-essence"]'), null);
    assert.equal(document.querySelector('[data-recipe-add="alternative-currency"]'), null);
  });

  it('authors prerequisite AND gates, gate mode, and a hint-led bonus expression', async () => {
    const patches = [];
    const root = await harness.mount(
      props({ activeTab: 'requirements', onPatch: (patch) => patches.push(patch) })
    );
    assert.equal(
      root.querySelectorAll('.manager-tool-prerequisite-list input[type="checkbox"]').length,
      5
    );
    assert.equal(root.querySelectorAll('[data-tool-prerequisite-row]').length, 5);
    assert.deepEqual(
      [...root.querySelectorAll('[data-tool-prerequisite-row] strong')].map(
        (node) => node.textContent
      ),
      [
        'Expert Crafter',
        "Proficient with Smith's Tools",
        'Attuned to the Weave',
        'Strength 13 or higher',
        'Trained in Arcana',
      ]
    );
    assert.ok(
      root.querySelector('[data-tool-prerequisites-enabled]').closest('.manager-status-toggle')
    );
    assert.ok(root.querySelector('[data-tool-bonus-enabled]').closest('.manager-status-toggle'));
    assert.equal(
      root
        .querySelector('[data-tool-prerequisites-enabled]')
        .closest('.manager-status-toggle')
        .textContent.trim(),
      ''
    );
    assert.equal(
      root
        .querySelector('[data-tool-bonus-enabled]')
        .closest('.manager-status-toggle')
        .textContent.trim(),
      ''
    );
    assert.ok(root.querySelector('[data-tool-requirements-divider]'));
    assert.match(
      root.querySelector('.manager-tool-bonus-field small').textContent,
      /without @.*stored with @ automatically/i
    );
    assert.equal(root.querySelector('[data-tool-bonus-preset]'), null);
    root.querySelector('.manager-tool-prerequisite-list input[value="strong"]').click();
    root.querySelector('input[name="tool-gate-mode"][value="bonus"]').click();
    const bonusInput = root.querySelector('[data-roll-data-expression="tool-bonus"]');
    bonusInput.value = '1d4';
    bonusInput.dispatchEvent(new Event('input', { bubbles: true }));
    assert.ok(patches.some((patch) => patch.prerequisites?.ids?.includes('strong')));
    assert.ok(patches.some((patch) => patch.prerequisites?.gateMode === 'bonus'));
    assert.ok(patches.some((patch) => patch.bonus?.expression === '1d4'));
  });

  it('renders the recipe-style grouped validation surface and Validation-only live preview note', async () => {
    const invalidTool = tool({
      breakage: { mode: 'breakageChance', breakageChance: 101 },
      repairRequirements: [{ id: 'empty', options: [] }],
    });
    const root = await harness.mount(
      props({
        activeTab: 'validation',
        tool: invalidTool,
        validation: {
          valid: false,
          errors: ['breakage.breakageChance must be an integer between 0 and 100'],
        },
        focusValidationNonce: 1,
      })
    );
    assert.equal(root.querySelectorAll('[data-tool-validation-check]').length, 6);
    assert.deepEqual(
      [...root.querySelectorAll('[data-tool-validation-check] .manager-recipe-val-title')].map(
        (node) => node.textContent
      ),
      [
        'A game-world Item is linked',
        'Breakage settings are complete',
        'On-break action is complete',
        'Repair requirements are complete',
        'Character prerequisites are complete',
        'Check bonus is complete',
      ]
    );
    assert.equal(
      root
        .querySelector('[data-tool-validation-check="breakage"]')
        .classList.contains('is-invalid'),
      true
    );
    assert.equal(
      root.querySelector('[data-tool-validation-check="repair"]').classList.contains('is-invalid'),
      true
    );
    assert.equal(root.querySelector('[data-editor-validation-count="blocking"]').textContent, '2');
    assert.equal(root.querySelector('[data-editor-validation-count="passing"]').textContent, '4');
    assert.match(
      root.querySelector('[data-editor-validation-summary="block"]').textContent,
      /Needs attention/
    );
    assert.match(root.querySelector('[data-tool-behavior-preview]').textContent, /Smith's Hammer/);
    assert.match(root.querySelector('[data-tool-preview-breakage]').textContent, /101% break/);
    assert.match(
      root.querySelector('[data-tool-validation-check="breakage"]').textContent,
      /Break chance must be between 0% and 100%/
    );
    assert.doesNotMatch(root.textContent, /breakage\.breakageChance|breakageChance/);
    assert.equal(root.querySelector('.manager-recipe-tab-title').textContent.trim(), 'Validation');
    assert.match(root.querySelector('.manager-recipe-tab-intro').textContent, /blocking issue/);
    assert.equal(
      root.querySelector('[data-tool-validation-tab] > .manager-tool-editor-card'),
      null
    );
    assert.equal(root.querySelectorAll('[data-tool-preview-rule] i').length, 4);
    // Issue 881: every effective-rule row is the shared icon fact row, so the preview and
    // the library inspector cannot drift back into two geometries for one projection.
    assert.equal(
      root.querySelectorAll('[data-tool-preview-rule] > .manager-icon-fact-row').length,
      4
    );
    assert.ok(root.querySelector('[data-tool-preview-live-update]'));
  });

  it('reports a missing bonus independently without duplicating its domain blocker and preserves all-pass state', async () => {
    const root = await harness.mount(
      props({
        activeTab: 'validation',
        tool: tool({ bonus: { enabled: true, expression: '' } }),
        validation: {
          valid: false,
          errors: ['bonus.expression is required when bonus is enabled'],
        },
      })
    );

    assert.equal(
      root
        .querySelector('[data-tool-validation-check="prerequisites"]')
        .classList.contains('is-invalid'),
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
      root.querySelector('[data-tool-validation-check="prerequisites"] .manager-recipe-val-title')
        .textContent,
      'Character prerequisites are complete'
    );
    assert.equal(
      root.querySelector('[data-tool-validation-check="bonus"] .manager-recipe-val-title')
        .textContent,
      'Check bonus is complete'
    );
    assert.equal(
      root.querySelector('[data-tool-validation-check="repair"] .manager-recipe-val-title')
        .textContent,
      'Repair requirements are complete'
    );
    assert.equal(root.querySelector('[data-editor-validation-count="blocking"]').textContent, '1');
    assert.equal(
      root.querySelector('#tool-tab-validation .manager-editor-tab-badge').textContent,
      '1'
    );
    assert.equal(
      root
        .querySelector('#tool-tab-validation .manager-editor-tab-badge')
        .getAttribute('aria-label'),
      '1 issue'
    );
    assert.match(
      root.querySelector('[data-tool-validation-check="bonus"]').textContent,
      /Enter a bonus expression or turn the bonus off/
    );

    harness.remount();
    const validRoot = await harness.mount(props({ activeTab: 'validation' }));
    assert.equal(validRoot.querySelectorAll('[data-tool-validation-check]').length, 6);
    assert.equal(validRoot.querySelectorAll('[data-tool-validation-check].is-invalid').length, 0);
    assert.match(
      validRoot.querySelector('[data-editor-validation-summary="pass"]').textContent,
      /All clear/
    );
    assert.equal(
      validRoot.querySelector('#tool-tab-validation .manager-editor-tab-badge').textContent,
      '✓'
    );
    assert.equal(
      validRoot
        .querySelector('#tool-tab-validation .manager-editor-tab-badge')
        .getAttribute('aria-label'),
      'All checks pass'
    );
  });

  it('uses prototype preview copy and shows the live-update note on every tab', async () => {
    const root = await harness.mount(props({ activeTab: 'breakage' }));

    assert.equal(
      root.querySelector('[data-tool-behavior-preview] > .manager-kicker').textContent,
      'How it behaves'
    );
    assert.equal(root.querySelector('[data-tool-preview-breakage]').textContent, '5 uses');
    assert.equal(
      root.querySelector('[data-tool-preview-on-break]').textContent,
      'On break: destroy the item'
    );
    assert.equal(
      root.querySelector('[data-tool-preview-prerequisites]').textContent,
      '1 prerequisite'
    );
    assert.equal(root.querySelector('[data-tool-preview-bonus]').textContent, 'Adds @prof');
    assert.match(root.querySelector('[data-tool-preview-identity]').textContent, /5 uses.*@prof/);
    // The note stands on EVERY tab (issue 883). The preview updates live whichever tab you
    // are editing, so gating the statement on Validation understated it — the maintainer
    // moved it above Effective rules and dropped the condition, which retires the
    // prototype's tab-scoped placement deliberately.
    //
    // Asserted as a boolean rather than by comparing the node to `null`/an element: on
    // failure node:assert serialises the actual value for its diff, and walking a mounted
    // happy-dom element's circular tree exhausts the heap. The suite then reports
    // `# cancelled` with no message, which reads like a hang rather than a failed
    // expectation — this exact assertion cost an OOM to diagnose.
    assert.ok(
      !!root.querySelector('[data-tool-preview-live-update]'),
      'the live-update note renders on every tab, not only Validation'
    );
  });

  it('localizes effective behavior states instead of exposing stored mode tokens', async () => {
    const root = await harness.mount(
      props({
        authority: 'checkDriven',
        tool: tool({
          checkBreakable: false,
          onBreak: { mode: 'flagBroken' },
          prerequisites: { enabled: false, ids: [], gateMode: 'usability' },
          bonus: { enabled: false, expression: '' },
        }),
      })
    );

    assert.equal(root.querySelector('[data-tool-preview-breakage]').textContent, 'Immune');
    assert.equal(
      root.querySelector('[data-tool-preview-on-break]').textContent,
      'Not applicable while this Tool cannot break'
    );
    assert.equal(
      root.querySelector('[data-tool-preview-prerequisites]').textContent,
      'No prerequisites to use'
    );
    assert.equal(root.querySelector('[data-tool-preview-bonus]').textContent, 'No check bonus');
    assert.doesNotMatch(root.textContent, /flagBroken|limitedUses|breakageChance/);
  });

  it('projects domain validation and save failures to localized safe copy', async () => {
    const rawErrors = [
      'a tool requires either a componentId or its own source references',
      'repairRequirements[2]: Tag-based ingredient match requires at least one tag',
      'unexpected internal validation detail',
    ];
    const root = await harness.mount(
      props({
        activeTab: 'validation',
        validation: { valid: false, errors: rawErrors },
        saveError: 'database adapter exploded',
      })
    );

    const blockers = root.querySelector('[data-tool-validation-tab]').textContent;
    assert.match(blockers, /Link an Item or managed Component/);
    assert.match(blockers, /Repair group 3 is incomplete/);
    assert.match(blockers, /Some Tool settings are incomplete/);
    assert.doesNotMatch(blockers, /componentId|repairRequirements|unexpected internal/);
    assert.equal(
      root.querySelector('[data-tool-save-error]').textContent,
      'The Tool could not be saved. Try again.'
    );
    assert.equal(
      root.querySelector('[data-tool-editor-save]').getAttribute('title'),
      'Resolve validation issues before saving.'
    );
  });

  it('accepts every complete repair match kind and rejects an incomplete option', async () => {
    const completeRepairRequirements = [
      {
        id: 'component',
        options: [{ quantity: 1, match: { type: 'component', componentId: 'scrap' } }],
      },
      {
        id: 'tags',
        options: [{ quantity: 1, match: { type: 'tags', tags: ['metal'], tagMatch: 'any' } }],
      },
      {
        id: 'essence',
        options: [{ quantity: 1, match: { type: 'essence', essenceId: 'fire', amount: 2 } }],
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
      incomplete
        .querySelector('[data-tool-validation-check="repair"]')
        .classList.contains('is-invalid'),
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
