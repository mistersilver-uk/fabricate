import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tick } from 'svelte';
import {
  createMountedComponentHarness,
  SEARCHABLE_POPOVER_RAW_MODULES,
} from '../helpers/svelte-component-harness.js';
import { WORLD_TOOL_SCOPE_RAW_MODULES } from '../helpers/toolMountModules.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const fabricateCss = readFileSync(resolve(repoRoot, 'styles/fabricate.css'), 'utf8');
const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-tool-editor-',
  rawModules: [
    'src/config/flags.js',
    'src/models/Ingredient.js',
    // Ingredient filters its payload through the shared omitted-when-default machinery
    // (issue 1135). Same rule as every other entry here: omit it and the suite hangs.
    'src/models/reconstructibleDefaults.js',
    'src/models/IngredientGroup.js',
    'src/models/Tool.js',
    'src/models/match/matchTypes.js',
    'src/systems/characterModifierPrerequisiteCopy.js',
    'src/systems/characterPrerequisites.js',
    'src/utils/plainTextDescription.js',
    // The add-new essence offer projection (issue 1036); the recipe ingredient components
    // in this tree import it. Also the shared drop-data resolver, which `ItemDropZone`
    // now uses to widen its guard onto the legacy compendium `{ pack, id }` shape.
    'src/utils/essenceValidation.js',
    'src/ui/svelte/util/foundryBridge.js',
    'src/ui/svelte/util/listReorderAnnouncement.js',
    'src/ui/svelte/components/stepperLabels.js',
    'src/ui/svelte/util/chanceColorScale.js',
    'src/ui/svelte/util/dropRateTier.js',
    'src/ui/svelte/util/recipeCurrency.js',
    'src/ui/svelte/util/dropUtils.js',
    'src/ui/svelte/actions/dragDrop.js',
    'src/ui/svelte/apps/manager/tools/toolStudio.js',
    // `toolStudio.js` delegates the Tool display precedence to this layering-neutral leaf
    // so the engines and chat cards can reuse it too (issue 1119).
    'src/models/toolDisplay.js',
    // THE WORLD SCOPE CLOSURE, and it is new to this tree (issue 1373). The rules editor draws
    // its inherit/override cards through the shared `scoped/InheritRow`, whose row set comes
    // from the SCOPE DESCRIPTOR — `scopedStudio.js` -> `toolScope.js` + `worldScopeProjection.js`
    // and everything they reach. Imported from the shared manifest rather than re-typed: a copy
    // would go on naming a module the real one had moved past.
    ...WORLD_TOOL_SCOPE_RAW_MODULES,
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
    'src/ui/svelte/components/Field.svelte',
    // THE manager's labelled push-button (issue 1096). The Modifiers card and the Tool
    // Studio header both render through it; an omission HANGS this suite rather than
    // failing it.
    'src/ui/svelte/components/ManagerButton.svelte',
    'src/ui/svelte/components/IconButton.svelte',
    'src/ui/svelte/components/StatusToggle.svelte',
    'src/ui/svelte/components/InspectorCard.svelte',
    'src/ui/svelte/components/Stepper.svelte',
    // The shared selection control (issue 772). `ChecklistCardRow` below renders it after
    // the conversion, so it is in this tree's static graph; the harness's closure validator
    // throws for a shared-harness suite that omits it.
    'src/ui/svelte/components/SelectionCheckbox.svelte',
    'src/ui/svelte/apps/manager/SearchablePopover.svelte',
    // The shipped segmented primitive (issue 975): `RecipeIngredientOption` below
    // renders it for the tag-match Any/All control, so it is in this tree's static
    // import graph and the closure validator throws without it.
    'src/ui/svelte/apps/manager/SegmentedControl.svelte',
    'src/ui/svelte/apps/manager/ChecklistCardRow.svelte',
    'src/ui/svelte/apps/manager/EditorValidationSurface.svelte',
    'src/ui/svelte/apps/manager/ItemDropZone.svelte',
    'src/ui/svelte/apps/manager/RadioCardGroup.svelte',
    'src/ui/svelte/apps/manager/RollDataExpressionInput.svelte',
    'src/ui/svelte/apps/manager/ToggleCard.svelte',
    // THE FOUR NEW LEAVES OF THE RULES EDITOR (issue 1373): the armed remove-from-system
    // control, the routed identity notice on Validation, the inherit/override card every
    // behaviour section is drawn as, the system-scope band that opens Breakage, and the shared
    // inherit switch the card wraps. A rendered `.svelte` the harness omits HANGS this suite.
    'src/ui/svelte/apps/manager/ArmedDangerButton.svelte',
    'src/ui/svelte/apps/manager/Callout.svelte',
    'src/ui/svelte/components/StatusPill.svelte',
    'src/ui/svelte/apps/manager/scoped/InheritRow.svelte',
    'src/ui/svelte/apps/manager/tools/ToolInheritCard.svelte',
    'src/ui/svelte/apps/manager/tools/ToolSystemScopeCards.svelte',
    'src/ui/svelte/apps/manager/recipe/RecipeIngredientGroupCard.svelte',
    'src/ui/svelte/apps/manager/recipe/RecipeIngredientOption.svelte',
    'src/ui/svelte/apps/manager/recipe/RecipeIngredientSetCard.svelte',
    // The shared scoped-entity patterns the Tool Studio is converted onto (issue 1362).
    'src/ui/svelte/apps/manager/scoped/ScopedEntityPreview.svelte',
    'src/ui/svelte/apps/manager/scoped/ScopedValidationTab.svelte',
    'src/ui/svelte/apps/manager/tools/ToolBehaviorPreview.svelte',
    'src/ui/svelte/apps/manager/tools/ToolBreakageTab.svelte',
    'src/ui/svelte/apps/manager/tools/ToolEditorTabs.svelte',
    // `ToolEditorTabs` is a thin caller of the shared strip primitive (issue 1038), so it is in
    // this tree's static graph. `ToolOverviewTab` is NOT: issue 1373 retired the Overview tab
    // from the SYSTEM rules editor, because a crafting system authors no identity.
    'src/ui/svelte/apps/manager/EditorTabs.svelte',
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

/**
 * The world projection this `(tool, system)` pair is a member of, in the shape
 * `worldScopeProjection` publishes and `ToolEditView` reads: an entry per world entity, a row
 * per crafting system, and the `inherit` map on the row.
 *
 * Hand-built rather than projected for real, because what these cases vary is the ONE fact the
 * editor reads out of it - which sections this system overrides - and a real projection would
 * bury that under a corpus the assertions do not care about.
 *
 * @param {object} [options]
 * @param {object} [options.inherited] The per-section inherit map. Absent reads as inheriting.
 * @param {object|null} [options.defaults] The world defaults record for the Tool.
 * @param {boolean} [options.member] Whether this system holds a rules record at all.
 * @returns {object}
 */
function toolScope({ inherited = OVERRIDES_EVERYTHING, defaults = null, member = true } = {}) {
  return {
    entries: [
      {
        id: 'hammer',
        defaults,
        systems: [{ systemId: 'sys-forge', member, inherited, enabled: true }],
      },
    ],
  };
}

/**
 * What every MIGRATED tool membership record carries: all four sections overridden.
 * `migrateToolRequirementSections` writes exactly this, so it is the state every existing world
 * is in and the right default for a case that is not about inheritance.
 */
const OVERRIDES_EVERYTHING = Object.freeze({
  breakage: false,
  onBreak: false,
  prerequisites: false,
  bonus: false,
});

function props(overrides = {}) {
  return {
    tool: tool(),
    validation: { valid: true, errors: [] },
    dirty: false,
    // `breakage`, not `overview`: the system rules editor has no Overview tab (issue 1373).
    activeTab: 'breakage',
    systemId: 'sys-forge',
    systemName: 'The Herbalist',
    scope: toolScope(),
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
  it('renders header-only actions, three accessible tabs, and no Kind', async () => {
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
      /Crafting Systems.*The Herbalist.*Tool Rules.*Smith's Hammer/
    );
    root.querySelector('[data-tool-editor-open-systems]').click();
    root.querySelector('[data-tool-editor-open-system]').click();
    root.querySelector('[data-tool-editor-open-tools]').click();
    assert.deepEqual(navigation, ['systems', 'system', 'tools']);
    assert.match(root.querySelector('[data-tool-editor-image]').getAttribute('src'), /hammer/);
    // THE SUBTITLE STATES SCOPE, NOT THE LINK (issue 1373). `Linked game-world Item` is the
    // WORLD editor's subtitle and describes the one thing this screen cannot change.
    assert.equal(
      root.querySelector('[data-tool-editor-source-context]').textContent,
      'Rules in The Herbalist · identity comes from the world Tool'
    );
    assert.equal(root.querySelector('[data-tool-editor-status]'), null);
    assert.equal(
      root
        .querySelector('[data-tool-editor-back][aria-label="Back to the Tool Rules list"]')
        .textContent.trim(),
      'Back to Tool Rules'
    );
    // NO `Delete` IN THE HEADER. On a screen whose subject is one world Tool adopted by many
    // crafting systems, `Delete` names no scope; the design puts it on the world entry and gives
    // system scope the explained `Stop using this Tool here` callout instead.
    assert.ok(!root.querySelector('[data-tool-editor-delete]'), 'no bare Delete at system scope');
    assert.ok(root.querySelector('[data-tool-editor-save]'));
    assert.equal(root.querySelector('[data-tool-editor-save]').textContent.trim(), 'Save rules');
    assert.equal(root.querySelectorAll('[role="tab"]').length, 3);
    assert.deepEqual(
      [...root.querySelectorAll('[role="tab"] span:first-of-type')].map((node) => node.textContent),
      ['Breakage', 'Requirements', 'Validation']
    );
    const tabPanel = root.querySelector('[role="tabpanel"]');
    assert.equal(tabPanel.id, 'tool-panel-breakage');
    assert.equal(tabPanel.getAttribute('aria-labelledby'), 'tool-tab-breakage');
    assert.equal(tabPanel.getAttribute('tabindex'), '0');
    // THE LINKED-ITEM CARD IS NOT HERE, and its absence is the assertion (issue 1373). It used
    // to open this tab with a drop zone, a copy-uuid action and an unlink action, which let a
    // CRAFTING SYSTEM re-point which game-world Item a Tool IS. Identity is world-scoped, so the
    // whole card moved to the world Tool entry; `world-tool-entry-mounted` exercises it there.
    assert.ok(!root.querySelector('[data-tool-source-card]'), 'no source card at system scope');
    assert.ok(!root.querySelector('[data-tool-description]'), 'and no linked-Item description');
    assert.match(root.querySelector('[data-tool-preview-identity]').textContent, /Smith's Hammer/);
    assert.match(
      root.querySelector('[data-tool-preview-identity]').textContent,
      /Rules in The Herbalist · identity comes from the world Tool/
    );
    assert.doesNotMatch(root.textContent, /\bKind\b/);
    assert.equal(root.querySelector('footer'), null);
  });

  it('opens Breakage with the two system-scope controls and no standing explainer', async () => {
    const root = await harness.mount(props());

    // THERE IS NO OVERVIEW TAB, so there is no overview panel (issue 1373). The two controls a
    // crafting system genuinely authors that are not rules — its enable switch and its
    // display-label OVERRIDE — open the Breakage tab as a band, which is where the design puts
    // the one it draws (`Enabled in <System>`).
    assert.ok(!root.querySelector('[data-tool-overview-tab]'), 'no overview panel');
    const band = root.querySelector('[data-tool-system-scope]');
    assert.ok(Boolean(band), 'the system-scope band opens the Breakage tab');
    assert.deepEqual(
      [...band.children].map((section) => section.dataset.toolOverviewRegion),
      ['enabled', 'identity']
    );
    assert.match(
      root.querySelector('[data-tool-enabled]').textContent,
      /Enabled in The Herbalist.*Recipes and salvage in this system can require it\./s
    );
    // THE EXPLAINER IS GONE. Six paragraphs of standing documentation occupied the space the
    // design gives to the player preview; the design's rail does not have it at all.
    assert.ok(!root.querySelector('[data-tool-how-it-works]'), 'no standing explainer card');
    assert.ok(!root.querySelector('[data-tool-preview-live-update]'), 'and no live-update strip');
  });

  it('draws the rail regions the design has, and not the two decorations it does not', async () => {
    const root = await harness.mount(
      props({
        requiredFor: [
          { id: 'recipe-anvil', kind: 'recipe', name: 'Anvil Reforging' },
          { id: 'task-seam', kind: 'gathering', name: 'Quarry Open Seam' },
        ],
      })
    );

    // THE IDENTITY CARD IS A THUMBNAIL, A NAME AND A SCOPE SENTENCE. Its On/Off pill and its two
    // chips restated the FIRST and FOURTH effective-rules rows one line below them.
    const identity = root.querySelector('[data-tool-preview-identity]');
    assert.ok(!identity.querySelector('.manager-chip'), 'no status pill and no duplicate chips');
    assert.ok(!root.querySelector('.manager-tool-preview-chips'), 'and no chip strip at all');

    // HOW PLAYERS SEE IT — the art, the uses pill, the name and the broken preview.
    const player = root.querySelector('[data-tool-player-preview]');
    assert.ok(Boolean(player), 'the player preview renders');
    assert.match(player.textContent, /5 uses left/);
    assert.match(player.textContent, /A working copy\. Recipes and gathering tasks accept it\./);
    assert.equal(root.querySelector('[data-tool-player-name]').textContent, "Smith's Hammer");

    // PREVIEW AS — the actor selector, the gate sentence and the usability row.
    const actorSelect = root.querySelector('[data-tool-preview-actor]');
    assert.ok(Boolean(actorSelect), 'the actor selector renders');
    assert.equal(actorSelect.querySelector('option').textContent, 'No actor');
    assert.match(root.querySelector('[data-tool-preview-gate]').textContent, /One prerequisite/);
    assert.match(
      root.querySelector('[data-tool-preview-usability]').textContent,
      /Usable, adding @prof/
    );

    // REQUIRED FOR — one row per referencing recipe and gathering task, each with its kind chip.
    const rows = [...root.querySelectorAll('[data-tool-required-row]')];
    assert.deepEqual(
      rows.map((row) => row.querySelector('strong').textContent),
      ['Anvil Reforging', 'Quarry Open Seam']
    );
    assert.deepEqual(
      rows.map((row) => row.querySelector('.manager-chip').textContent),
      ['Recipe', 'Gathering']
    );
  });

  it('shows what breakage does to a copy, and never writes it', async () => {
    // `Show as broken` is a PREVIEW state: it is the one thing the effective-rules rows state in
    // the abstract and never show. Nothing about it reaches the draft.
    const patches = [];
    const root = await harness.mount(
      props({
        tool: tool({ onBreak: { mode: 'flagBroken' } }),
        onPatch: (patch) => patches.push(patch),
      })
    );

    const broken = root.querySelector('[data-tool-player-broken]');
    broken.checked = true;
    broken.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();

    assert.match(
      root.querySelector('[data-tool-player-note]').textContent,
      /Marked broken and renamed/
    );
    assert.equal(root.querySelector('[data-tool-player-name]').textContent, "Smith's Hammer (Broken)");
    assert.deepEqual(patches, [], 'the broken preview writes nothing');
  });

  it('evaluates the Tool against a chosen actor, and says what that character gets', async () => {
    // `PREVIEW AS` is the design's third rail region and it is a REAL evaluation, not a label:
    // the roll data comes back through an injected resolver — the only thing on this screen's
    // path that touches a Foundry document — and `evaluatePrerequisites` is the same AND-semantics
    // helper the crafting engine gates on, so the rail cannot answer differently from the runtime.
    const root = await harness.mount(
      props({
        tool: tool({
          prerequisites: { enabled: true, ids: ['strong'], gateMode: 'usability' },
          bonus: { enabled: false, expression: '' },
        }),
        // A REAL prerequisite shape. `evaluatePrerequisite` reads `path`/`op`/`value` — the
        // canonical stored shape `normalizeCharacterPrerequisite` produces and the one the
        // Requirements tab's own `prerequisitePreview` already reads. The loose `expression`
        // string the rest of this suite's fixtures carry resolves NO path, which every operator
        // reads as `0` and every comparison then passes: an assertion written over it would be
        // green whatever the actor's data said.
        prerequisiteOptions: [
          {
            id: 'strong',
            name: 'Strength 13 or higher',
            path: 'abilities.str.mod',
            op: 'gte',
            value: 2,
          },
        ],
        actorOptions: [
          { uuid: 'Actor.brawn', name: 'Brawn' },
          { uuid: 'Actor.wisp', name: 'Wisp' },
        ],
        getActorRollData: async (uuid) =>
          uuid === 'Actor.brawn'
            ? { abilities: { str: { mod: 3 } } }
            : { abilities: { str: { mod: 0 } } },
      })
    );

    const select = root.querySelector('[data-tool-preview-actor]');
    assert.deepEqual(
      [...select.querySelectorAll('option')].map((option) => option.textContent),
      ['No actor', 'Brawn', 'Wisp']
    );

    select.value = 'Actor.brawn';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    await tick();
    assert.match(
      root.querySelector('[data-tool-preview-gate]').textContent,
      /Brawn meets every prerequisite\./
    );
    assert.match(
      root.querySelector('[data-tool-preview-usability]').textContent,
      /Usable, with no check bonus/
    );

    select.value = 'Actor.wisp';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    await tick();
    assert.match(
      root.querySelector('[data-tool-preview-gate]').textContent,
      /Wisp does not meet: Strength 13 or higher/
    );
    // The GATE MODE decides the consequence, and the row states the one that applies: a
    // `usability` gate makes the Tool unusable, where a `bonus` gate would only withhold it.
    assert.match(
      root.querySelector('[data-tool-preview-usability]').textContent,
      /Unusable here/
    );
  });

  it('states the required-for empty case rather than an empty region', async () => {
    const root = await harness.mount(props({ requiredFor: [] }));
    assert.match(
      root.querySelector('[data-tool-required-for-empty]').textContent,
      /Nothing in The Herbalist requires it yet\./
    );
  });

  it('draws every behaviour section as an inherit-aware card', async () => {
    const toggles = [];
    const root = await harness.mount(
      props({
        scope: toolScope({
          inherited: { breakage: true, onBreak: false },
          defaults: { id: 'hammer', breakage: { mode: 'limitedUses', maxUses: 2 } },
        }),
        onToggleInherited: (section, next) => toggles.push([section, next]),
      })
    );

    // THE INHERITING SECTION states the world value and offers no controls: while
    // `## CraftingSystem` requirement 36 keeps the in-system record authoritative, a control a
    // GM could still reach would let this system diverge from a default the pill says it follows.
    const breakage = root.querySelector('[data-tool-rule-card="breakage"]');
    assert.equal(breakage.dataset.toolRuleState, 'inheriting');
    assert.equal(breakage.querySelector('[data-tool-rule-chip]').textContent, 'Inheriting');
    assert.match(
      breakage.querySelector('[data-scoped-inherit-note="breakage"], .manager-scoped-inherit-label')
        .textContent,
      /World default: 2 uses/
    );
    assert.match(
      root.querySelector('[data-tool-rule-inherited="breakage"]').textContent,
      /2 uses.*Following the world Tool\. Flip the switch/s
    );
    assert.ok(!breakage.querySelector('input[name="tool-breakage-mode"]'), 'no mode controls');

    // THE OVERRIDDEN SECTION states the override and draws its own controls.
    const onBreak = root.querySelector('[data-tool-rule-card="onBreak"]');
    assert.equal(onBreak.dataset.toolRuleState, 'overridden');
    assert.equal(onBreak.querySelector('[data-tool-rule-chip]').textContent, 'Overridden');
    assert.ok(onBreak.querySelector('[data-tool-on-break-controls]'), 'its controls are offered');

    // The switch writes a BOOLEAN for a NAMED section, never a toggle of unknown current state.
    breakage.querySelector('[data-scoped-inherit-toggle="breakage"]').click();
    onBreak.querySelector('[data-scoped-inherit-toggle="onBreak"]').click();
    assert.deepEqual(toggles, [
      ['breakage', false],
      ['onBreak', true],
    ]);
  });

  it('draws no inherit affordance for a Tool the world catalogue has no record of', async () => {
    // A pre-migration in-system Tool has no world half, so there is nothing to inherit FROM and
    // nothing to be removed from. Every card renders its controls with no switch and no pill —
    // exactly what this screen did before the epic.
    const root = await harness.mount(props({ scope: { entries: [] } }));

    assert.equal(
      root.querySelector('[data-tool-rule-card="breakage"]').dataset.toolRuleState,
      'local'
    );
    assert.ok(!root.querySelector('[data-scoped-inherit-toggle]'), 'no inherit switch');
    assert.ok(!root.querySelector('[data-tool-rule-chip]'), 'and no inheritance pill');
    assert.ok(!root.querySelector('[data-tool-remove-from-system]'), 'and no remove callout');
    assert.ok(root.querySelector('input[name="tool-breakage-mode"]'), 'the controls still draw');
  });

  it('closes the Breakage tab with an explained, armed remove-from-system callout', async () => {
    let removed = 0;
    const root = await harness.mount(props({ onRemoveFromSystem: () => (removed += 1) }));

    const callout = root.querySelector('[data-tool-remove-from-system]');
    assert.ok(Boolean(callout), 'the callout closes the tab');
    assert.match(callout.textContent, /Stop using this Tool here/);
    assert.match(
      callout.textContent,
      /Removes the rules in The Herbalist only\. The world Tool and every other system are untouched\./
    );
    assert.match(callout.textContent, /Remove from system/);

    // ARMED, not immediate: one press arms, the second confirms. The first press must not remove.
    const button = callout.querySelector('button');
    button.click();
    await tick();
    assert.equal(removed, 0, 'arming does not remove');
    assert.match(callout.textContent, /Confirm\?/);
    button.click();
    await tick();
    assert.equal(removed, 1);
  });

  it('keeps the display-label override in a real field beside the enable switch', async () => {
    const root = await harness.mount(props());
    assert.equal(root.querySelector('[data-tool-name]'), null);
    assert.ok(root.querySelector('[data-tool-label]').closest('.manager-recipe-field'));
    assert.ok(root.querySelector('[data-tool-enabled] .manager-recipe-status-card'));
    assert.match(
      root.querySelector('[data-tool-label]').closest('label').textContent,
      /Overrides the world Tool name in this crafting system only/
    );
  });


  it('offers NO route to re-point the linked Item, at any of its three former controls', async () => {
    // The negative half of issue 1373's relocation, asserted as three named absences rather
    // than one: the drop target, the copy-uuid action and the unlink action were three separate
    // controls, and a partial removal would leave one of them writing world identity from a
    // crafting system. The positive half lives in `world-tool-entry-mounted`.
    const root = await harness.mount(props());

    assert.ok(!root.querySelector('[data-tool-source-card]'), 'no drop target');
    assert.ok(!root.querySelector('[data-tool-source-copy-uuid]'), 'no copy-uuid action');
    assert.ok(!root.querySelector('[data-tool-source-unlink]'), 'no unlink action');
    assert.ok(!root.querySelector('[data-manager-item-drop-zone]'), 'and no drop zone at all');
  });

  it('routes the header World Tool button out to the world record, when one exists', async () => {
    // Task 4's whole scope: the rules LIST advertises `Inherits world defaults`, `What it would
    // inherit here` and an `Edit the world Tool` button, and the editor behind `Edit rules` had
    // no route to that record at all. This is the same navigation the list's inspector takes.
    const routed = [];
    const root = await harness.mount(
      props({
        scope: { entries: [{ id: 'hammer' }] },
        onEditWorldTool: (id) => routed.push(id),
      })
    );

    const button = root.querySelector('[data-tool-editor-world-tool="hammer"]');
    assert.ok(button, 'the header offers the route');
    assert.match(button.textContent, /World Tool/);
    button.click();
    assert.deepEqual(routed, ['hammer']);
  });

  it('withholds that button for a Tool the world catalogue has no record of', async () => {
    // `false` is a real answer rather than a fallback: a pre-migration in-system Tool that no
    // `1.30.0` pass lifted has no world half, and routing there would land the GM on the entry
    // editor's `no longer in the corpus` state.
    const root = await harness.mount(props({ scope: { entries: [{ id: 'someone-else' }] } }));

    assert.ok(!root.querySelector('[data-tool-editor-world-tool]'));
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
    const label = root.querySelector('[data-tool-label]');
    label.value = 'Display-only name';
    label.dispatchEvent(new Event('input', { bubbles: true }));
    root.querySelector('[data-tool-enabled] .manager-status-toggle').click();

    assert.deepEqual(patches, [{ label: 'Display-only name' }]);
    assert.deepEqual(enabled, [false]);
  });

  it('routes all three tab controls without moving actions into a footer', async () => {
    const tabs = [];
    const root = await harness.mount(props({ onTabChange: (id) => tabs.push(id) }));
    for (const button of root.querySelectorAll('[role="tab"]')) button.click();
    assert.deepEqual(tabs, ['breakage', 'requirements', 'validation']);
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
      ['tool-panel-breakage', 'tool-panel-requirements', 'tool-panel-validation']
    );
    assert.equal(root.querySelector('#tool-panel-breakage')?.getAttribute('role'), 'tabpanel');
    assert.equal(
      buttons[2].querySelector('.manager-editor-tab-badge').getAttribute('aria-label'),
      '1 issue'
    );

    buttons[0].focus();
    buttons[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    assert.equal(document.activeElement, buttons[1]);
    buttons[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    assert.equal(document.activeElement, buttons[2]);
    buttons[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    assert.equal(document.activeElement, buttons[0]);
    buttons[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    assert.equal(document.activeElement, buttons[2]);
    assert.deepEqual(tabs, ['requirements', 'validation', 'breakage', 'validation']);
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
    // THE ROW NAMES THE SCREEN THAT STILL EXISTS. It read `from the Tools library`, which is
    // what the system's Tool list was called two renames ago; it is the Tool Rules screen now,
    // and the design's own copy names it.
    assert.match(
      root.querySelector('[data-tool-breakage-authority-explanation]').textContent,
      /Set for every Tool on the Tool Rules screen\..*System-wide/
    );
    assert.doesNotMatch(
      root.querySelector('[data-tool-breakage-authority-explanation]').textContent,
      /settings for both models/
    );
    // The bare `manager-tool-section-heading` block is gone: every behaviour section is a
    // `ToolInheritCard` now, and the card's own head carries the title (issue 1373).
    assert.ok(!root.querySelector('[data-tool-breakage-method-heading]'));
    assert.match(
      root.querySelector('[data-tool-rule-card="breakage"] h3').textContent,
      /How this Tool breaks/
    );
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

  // Whitespace between sibling elements is significant in Svelte markup: a newline in the
  // template becomes a text node in the DOM. Adding `.svelte` to Prettier's scope (issue 923)
  // reflowed 211 components, and these two tabs are the only ones whose compiled template
  // changed — eight whitespace text nodes appeared between the kicker/heading/prose blocks
  // and between the info strip's glyph and its paragraph. A Chromium geometry comparison of
  // the pre- and post-format renders showed no layout difference (block containers collapse
  // the run, and the one node that lands directly in a flex container generates no flex item),
  // so the reformat shipped rather than being fenced off with `<!-- prettier-ignore -->`.
  //
  // Nothing else in the suite can see that class of change: every other assertion here reads a
  // single element's own text, and `manager-layout.test.js` exercises a hand-authored fixture
  // rather than these components. This pins the joins so the NEXT reflow cannot move them
  // unnoticed. Expectations are derived from the children rather than written out, so a copy
  // change does not fail the test but a whitespace change does — the same shape as the
  // `ExplainerCard` row assertion above.
  //
  // The `data-*-copy` hooks exist for this test. `.manager-kicker` is not usable as a selector
  // here: `ToolBreakageTab` renders four of them, and `:nth-of-type` scoping would silently
  // follow the wrong node the moment the markup is reordered.
  const joinedByOneSpace = (element, hook) => {
    const children = [...element.children];
    assert.ok(children.length > 1, `${hook} must have sibling children to join`);
    assert.equal(
      element.textContent,
      children.map((child) => child.textContent).join(' '),
      `${hook} must separate each pair of sibling blocks with exactly one space, got ${JSON.stringify(element.textContent.slice(0, 80))}`
    );
  };

  it('separates the breakage tab sibling blocks with exactly one whitespace run', async () => {
    const root = await harness.mount(props({ activeTab: 'breakage' }));

    for (const hook of [
      '[data-tool-authority-copy]',
      '[data-tool-limited-uses-copy]',
      '[data-tool-limited-uses-info]',
    ]) {
      const element = root.querySelector(hook);
      assert.ok(element, `${hook} must render`);
      joinedByOneSpace(element, hook);
    }

    // THE ON-BREAK LEGEND IS GONE (issue 1373). It was a `<span>` label welded to a `<small>`
    // reading `Always fires` — a badge that was never news, in the slot the design uses for the
    // inheritance pill. The card above the fieldset carries the title and the pill now, so the
    // fieldset has no legend at all and the join it used to pin does not exist.
    assert.ok(!root.querySelector('[data-tool-on-break-legend]'), 'no on-break legend');
    assert.doesNotMatch(root.textContent, /Always fires/);
  });

  it('separates the requirements tab sibling blocks with exactly one whitespace run', async () => {
    const root = await harness.mount(props({ activeTab: 'requirements' }));

    for (const hook of ['[data-tool-prerequisites-copy]', '[data-tool-bonus-copy]']) {
      const element = root.querySelector(hook);
      assert.ok(element, `${hook} must render`);
      joinedByOneSpace(element, hook);
    }
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
    // The `<hr>` between the two sections went with the card idiom: each section is a
    // `ToolInheritCard` with its own border, so a rule between them drew a second separator.
    assert.ok(!root.querySelector('[data-tool-requirements-divider]'));
    assert.equal(root.querySelectorAll('[data-tool-rule-card]').length, 2);
    assert.deepEqual(
      [...root.querySelectorAll('[data-tool-rule-card]')].map((card) => card.dataset.toolRuleCard),
      ['prerequisites', 'bonus']
    );
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

  // Issue 772, acceptance 11 — the ONLY proof that extracting the check box out of
  // `ChecklistCardRow` left this tab rendering what it rendered before. There is no Tool
  // Studio screenshot recipe that `ChecklistCardRow.svelte` matches (it routes to the
  // broad theme-or-global-ui recipe only), so no published frame can show it either.
  //
  // The three things a conversion of this shape can silently break: the box stops being a
  // real `<input type="checkbox">` (killing the keyboard, the label association and every
  // `input[value=…]` selector this suite already uses); the checked state stops rendering;
  // or the change callback stops firing. Each is asserted below.
  it('renders the prerequisite row through the shared selection control after the conversion', async () => {
    const patches = [];
    const root = await harness.mount(
      props({
        activeTab: 'requirements',
        tool: tool({ prerequisites: { enabled: true, ids: ['expert'], gateMode: 'block' } }),
        onPatch: (patch) => patches.push(patch),
      })
    );

    const rows = [...root.querySelectorAll('[data-tool-prerequisite-row]')];
    assert.equal(rows.length, 5);

    // The real control survives the extraction, and the row still owns the `<label>` — the
    // primitive is rendered in `contents` mode precisely so no second label is nested here.
    for (const row of rows) {
      assert.equal(row.tagName, 'LABEL');
      assert.equal(row.querySelectorAll('label').length, 0);
      const box = row.querySelector('input[type="checkbox"]');
      assert.ok(box, 'every prerequisite row renders a real checkbox');
      // A bare Foundry-chromed checkbox is a SECOND selection design; the custom box has
      // to be there beside the hidden input.
      assert.ok(row.querySelector('.fab-selection-check.is-sm'));
    }

    // Checked state reaches the visible box, not just the input.
    const expertRow = rows[0];
    assert.equal(expertRow.querySelector('input[value="expert"]').checked, true);
    assert.equal(expertRow.querySelector('.fab-selection-check').classList.contains('is-checked'), true);
    assert.equal(rows[1].querySelector('input[value="smith"]').checked, false);
    assert.equal(rows[1].querySelector('.fab-selection-check').classList.contains('is-checked'), false);

    // And the change callback still reaches the tab's patch handler through the primitive.
    root.querySelector('.manager-tool-prerequisite-list input[value="smith"]').click();
    assert.ok(patches.some((patch) => patch.prerequisites?.ids?.includes('smith')));
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
    // FIVE CHECKS, NOT SIX. `A game-world Item is linked` was a check on IDENTITY under a
    // `LINKED ITEM` heading, on a screen that cannot link one (issue 1373). It is stated as a
    // routed notice now, and only when the link is genuinely missing.
    assert.equal(root.querySelectorAll('[data-tool-validation-check]').length, 5);
    assert.deepEqual(
      [...root.querySelectorAll('[data-tool-validation-check] .manager-recipe-val-title')].map(
        (node) => node.textContent
      ),
      [
        'Breakage settings are complete',
        'On-break action is complete',
        'Repair requirements are complete',
        'Character prerequisites are complete',
        'Check bonus is complete',
      ]
    );
    assert.ok(!root.querySelector('[data-tool-identity-notice]'), 'a linked Tool states nothing');
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
    assert.equal(root.querySelector('[data-editor-validation-count="passing"]').textContent, '3');
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
    assert.ok(!root.querySelector('[data-tool-preview-live-update]'), 'no live-update strip');
    // Issue 881: every effective-rule row is the shared icon fact row, so the preview and
    // the library inspector cannot drift back into two geometries for one projection.
    assert.equal(
      root.querySelectorAll('[data-tool-preview-rule] > .manager-icon-fact-row').length,
      4
    );
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
    assert.equal(validRoot.querySelectorAll('[data-tool-validation-check]').length, 5);
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

  it('uses prototype preview copy on every tab', async () => {
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
    // THE IDENTITY CARD CARRIES NEITHER OF THOSE ANSWERS ANY MORE (issue 1373). Its two chips
    // restated the first and fourth effective-rules rows one line below them, and the design
    // draws a thumbnail, a name and a scope sentence.
    assert.doesNotMatch(
      root.querySelector('[data-tool-preview-identity]').textContent,
      /5 uses|@prof/
    );
    //
    // Asserted as a boolean rather than by comparing the node to `null`/an element: on
    // failure node:assert serialises the actual value for its diff, and walking a mounted
    // happy-dom element's circular tree exhausts the heap. The suite then reports
    // `# cancelled` with no message, which reads like a hang rather than a failed
    // expectation — this exact assertion cost an OOM to diagnose.
    assert.ok(
      !root.querySelector('[data-tool-preview-live-update]'),
      'the live-update strip is gone with the standing explainer'
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
    // THE IDENTITY FAILURE IS A ROUTED NOTICE, NOT A CHECK ROW (issue 1373). It names the world
    // Tool, because that is the only scope that can repair it — and it does NOT count toward the
    // blocking total, so it cannot redden this editor's tab badge over a defect no control here
    // can clear. Escalated and stated in the handoff: the DOMAIN still refuses the save.
    assert.ok(Boolean(root.querySelector('[data-tool-identity-notice]')));
    assert.match(blockers, /Its identity is set on the world Tool, not here/);
    assert.doesNotMatch(blockers, /Link an Item or managed Component/);
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
