/**
 * The world Tool entry, mounted (issue 1373, epic 1357).
 *
 * ## What this suite is FOR
 *
 * Two gaps this screen shipped with, both of which read as complete from the markup and are not:
 *
 *  1. THE WORLD MASTER SWITCH had no control at all. The Overview tab authored identity and
 *     nothing else, so the one decision that reaches every crafting system at once - is this Tool
 *     on? - was unauthorable from the screen that owns the world record.
 *  2. THE BREAKAGE TAB SET A MODE AND NEVER ITS VALUE. The mode cards write `breakage.mode`, so a
 *     world default reading `Breakage chance` was pinned to whatever `breakageChance` the record
 *     happened to be seeded with. A GM could pick the rule and not the number.
 *
 * The scope is built from the REAL projection rather than a hand-built literal, because
 * `worldEnabled` is answered inside `buildEntry` from the world defaults - a fixture that stamped
 * the flag itself would keep passing after the read moved and would pin nothing.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { tick } from 'svelte';

import { dispatchDrop, dispatchRejectedDrops } from '../helpers/dropPayloads.js';
import { scopedComponentCss } from '../helpers/scoped-component-css.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import {
  TOOL_TREE_COMPILED_MODULES,
  TOOL_TREE_RAW_MODULES,
  WORLD_TOOL_SCOPE_RAW_MODULES,
} from '../helpers/toolMountModules.js';
import { projectWorldScopeEntity } from '../../src/ui/svelte/stores/worldScopeProjection.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-world-tool-entry-',
  componentPath: 'src/ui/svelte/apps/manager/scoped/WorldToolEntryPage.svelte',
  rawModules: [
    ...TOOL_TREE_RAW_MODULES,
    ...WORLD_TOOL_SCOPE_RAW_MODULES,
    // The BUFFERED edit this page stages into, and the four leaves its breakage tab authors a
    // value with: the stepper's accessible names, the chance slider's colour scale and tier
    // labels, and the rollability predicate the formula field proves a value with.
    'src/ui/svelte/apps/manager/scoped/scopedEntryDraft.js',
    'src/ui/svelte/components/stepperLabels.js',
    'src/ui/svelte/util/chanceColorScale.js',
    'src/ui/svelte/util/dropRateTier.js',
    'src/utils/rollFormulaRollability.js',
    // The LINKED-ITEM CARD's two leaves (issue 1373): the drag action the shipped drop zone
    // attaches, and the payload reader that accepts a compendium `{pack, id}` drag as well as a
    // sidebar `{uuid}` one.
    'src/ui/svelte/actions/dragDrop.js',
    'src/ui/svelte/util/dropUtils.js',
    // The REQUIREMENTS TAB's two: the prerequisite one-line preview the checklist rows render,
    // and the roll-data display/store conversion its bonus field is written through.
    'src/systems/characterModifierPrerequisiteCopy.js',
    'src/systems/characterPrerequisites.js',
    // THE BREAKAGE TAB'S REPAIR EDITOR (issue 1373, maintainer round 2). The world entry mounts
    // the SAME `ToolRepairRequirements` the system editor does, so the recipe ingredient tree
    // behind it joins this closure: the add-new essence offer and the currency display/store
    // conversion its rows read.
    'src/utils/essenceValidation.js',
    'src/ui/svelte/util/recipeCurrency.js',
    // And `SearchablePopover`'s own three, which arrive with it: the outside-click dismissal,
    // the portal it renders through, and the anchored-placement geometry it shares with the
    // icon picker.
    'src/ui/svelte/actions/dismissOnOutsideClick.js',
    'src/ui/svelte/actions/portal.js',
    'src/ui/svelte/util/iconPickerPopover.js',
  ],
  compiledModules: [
    ...TOOL_TREE_COMPILED_MODULES,
    'src/ui/svelte/apps/manager/ArmedDangerButton.svelte',
    'src/ui/svelte/apps/manager/ChecklistCardRow.svelte',
    'src/ui/svelte/apps/manager/EditorTabs.svelte',
    'src/ui/svelte/apps/manager/EditorValidationSurface.svelte',
    'src/ui/svelte/apps/manager/ExplainerCard.svelte',
    // THE LINKED-ITEM CARD AND THE REQUIREMENTS TAB (issue 1373). Both are shipped components
    // this page now renders rather than second copies of them, so both join the manifest; a
    // rendered `.svelte` the harness omits HANGS this suite and reports `# cancelled`.
    'src/ui/svelte/apps/manager/ItemDropZone.svelte',
    'src/ui/svelte/apps/manager/RadioCardGroup.svelte',
    'src/ui/svelte/apps/manager/RollDataExpressionInput.svelte',
    'src/ui/svelte/apps/manager/tools/ToolRequirementsTab.svelte',
    // `ToolRequirementsTab` draws each of its two sections as a `ToolInheritCard` now (issue
    // 1373), so the card and the shared inherit row it wraps are in this tree's static graph.
    // At WORLD scope the card renders no switch at all — there is no parent to inherit from —
    // but it is still the component that draws the section, and a rendered `.svelte` the
    // harness omits HANGS this suite rather than failing it.
    'src/ui/svelte/apps/manager/tools/ToolInheritCard.svelte',
    'src/ui/svelte/apps/manager/scoped/InheritRow.svelte',
    'src/ui/svelte/components/SelectionCheckbox.svelte',
    'src/ui/svelte/apps/manager/scoped/ScopedEntityPreview.svelte',
    'src/ui/svelte/apps/manager/scoped/ScopedValidationTab.svelte',
    'src/ui/svelte/apps/manager/scoped/WorldToolEntryPage.svelte',
    // THE RAIL IS THE SHARED `ToolBehaviorPreview` NOW (issue 1373's parity round), not a fork of
    // it, so this tree gains that component and the four leaves it renders: the no-state ghost
    // panel the prerequisite-gate line is drawn as, the status pill on the player tile, and the
    // shipped pager the `Required for` window ends with. `IconFactRow` and `Chip` arrive with
    // `TOOL_TREE_COMPILED_MODULES` above. A rendered `.svelte` the harness omits HANGS this suite
    // and reports `# cancelled` with no message rather than failing it.
    'src/ui/svelte/apps/manager/tools/ToolBehaviorPreview.svelte',
    // The Breakage tab's two mode-argument controls, which world scope gained in issue 1373's
    // maintainer round 2: the `REPLACEMENT COMPONENT` card and the repair-route editor. Both
    // imports are STATIC, so they are in this tree's graph whichever on-break mode a case
    // selects, and an omission HANGS this suite with no message.
    'src/ui/svelte/apps/manager/tools/ToolReplacementTarget.svelte',
    'src/ui/svelte/apps/manager/tools/ToolRepairRequirements.svelte',
    'src/ui/svelte/apps/manager/recipe/RecipeIngredientSetCard.svelte',
    'src/ui/svelte/apps/manager/recipe/RecipeIngredientGroupCard.svelte',
    'src/ui/svelte/apps/manager/recipe/RecipeIngredientOption.svelte',
    // The two pickers those three render: the component/essence/tag search popover (which the
    // replacement card also uses) and the per-row match-type segmented control.
    'src/ui/svelte/apps/manager/SearchablePopover.svelte',
    'src/ui/svelte/apps/manager/SegmentedControl.svelte',
    'src/ui/svelte/apps/manager/EmptyState.svelte',
    'src/ui/svelte/components/StatusPill.svelte',
    'src/ui/svelte/components/Pagination.svelte',
    'src/ui/svelte/components/ChanceSlider.svelte',
    'src/ui/svelte/components/Stepper.svelte',
    // The design-system primitives this editor's tree renders: the icon action (issue 1422),
    // the section enable switch (issue 1040), the card shell (issue 1427) and the labelled
    // field column (issue 1428). A rendered `.svelte` the harness omits HANGS this suite and
    // reports `# cancelled` with no message, which is why they are named rather than assumed.
    'src/ui/svelte/components/IconButton.svelte',
    'src/ui/svelte/components/StatusToggle.svelte',
    'src/ui/svelte/components/InspectorCard.svelte',
    'src/ui/svelte/components/Field.svelte',
  ],
});

const SYSTEMS = [
  { id: 'sys-forge', name: 'Forge' },
  { id: 'sys-alchemy', name: 'Alchemy' },
];

/**
 * The tool scope, projected for real, with one entity whose world defaults a case may vary.
 *
 * @param {object} [worldDefault] The `defaults` record for `pick`.
 * @param {number} [members] How many of the two systems hold the Tool.
 * @returns {object}
 */
function scopeFor(worldDefault = {}, members = 2) {
  const membership = SYSTEMS.slice(0, members).map((system) => ({
    entityId: 'pick',
    systemId: system.id,
    inherit: {},
    enabled: true,
  }));
  return projectWorldScopeEntity({
    entityType: 'tool',
    corpus: {
      entities: [
        { id: 'pick', name: 'Mining Pick', description: 'A pick.', originItemUuid: 'Item.pick' },
      ],
      defaults: [{ id: 'pick', ...worldDefault }],
      membership,
    },
    systems: SYSTEMS,
  });
}

/**
 * THE LIVE DRAFT HANDLE THE PAGE REPORTS, captured by the mount below.
 *
 * The edit is BUFFERED (issue 1373): a control stages into a draft and `Save tool` flushes it,
 * and that Save is rendered by the SHELL, not by this page — `.manager-header` is a sibling of
 * `.manager-main`. So a suite that mounts the page alone reaches the flush the only way the shell
 * does, through the handle, and every write assertion below runs after it.
 *
 * It is also what keeps these cases honest about the buffering itself: each asserts that NOTHING
 * was written before the flush, which is the half a markup read cannot see.
 *
 * @type {{isDirty: () => boolean, save: () => Promise<boolean>, discard: () => void}|null}
 */
let draftHandle = null;
/** Every buffered identity map the page has reported for the shell chrome, newest last. */
let reportedIdentities = [];
/** Every dirty flag the page has reported, newest last. */
let reportedDirty = [];
/**
 * The DELETE ACTION DESCRIPTOR the page reports up, newest last.
 *
 * Delete moved out of the tab body and into the shell's header band (issue 1373's parity
 * round): the design draws `Back to tools · Delete · Save tool` on the title line and puts the
 * danger-CARD idiom on the SYSTEM screen. `.manager-header` is a sibling of `.manager-main`, so
 * this page cannot render into it — what crosses is the descriptor, and this is where a mounted
 * suite reads it.
 * @type {Array<object|null>}
 */
let reportedDeletes = [];

/**
 * Mount the entry and open one tab.
 *
 * @param {object} options
 * @returns {Promise<HTMLElement>}
 */
async function mountTab({
  scope,
  actions = {},
  tab = 'identity',
  worldItems = [],
  prerequisiteOptions = [],
  // THE WORLD INGREDIENT ROSTERS (issue 1373, maintainer round 2). The Breakage tab's two
  // mode-argument controls — the replacement target and the repair route — name WORLD
  // Components and WORLD essences, so a case that exercises either supplies them the way the
  // manager root does.
  componentOptions = [],
  essenceOptions = [],
  itemTags = [],
  onSourceDrop = () => {},
  onUnlinkSource = () => {},
}) {
  draftHandle = null;
  reportedIdentities = [];
  reportedDirty = [];
  reportedDeletes = [];
  const target = await harness.mount({
    scope,
    actions,
    entityId: 'pick',
    worldItems,
    prerequisiteOptions,
    componentOptions,
    essenceOptions,
    itemTags,
    onSourceDrop,
    onUnlinkSource,
    onDraftChange: (handle) => {
      draftHandle = handle;
    },
    onDirtyChange: (dirty) => {
      reportedDirty.push(dirty);
    },
    onDraftIdentityChange: (identity) => {
      reportedIdentities.push(identity);
    },
    onDeleteChange: (descriptor) => {
      reportedDeletes.push(descriptor);
    },
  });
  if (tab !== 'identity') target.querySelector(`#world-tool-entry-tab-${tab}`).click();
  return target;
}

/**
 * Flush the buffered edit the way the shell's `Save tool` does.
 *
 * @returns {Promise<void>}
 */
async function flushDraft() {
  assert.ok(Boolean(draftHandle), 'the page reported no draft handle, so nothing can flush it');
  await draftHandle.save();
}

describe('the world Tool entry (issue 1373)', () => {
  before(async () => {
    await harness.setup();
  });

  after(() => {
    harness.teardown();
  });

  describe('the world master switch', () => {
    it('draws ON for a record that never authored the flag, and states its reach FIRST', async () => {
      const target = await mountTab({ scope: scopeFor() });
      const card = target.querySelector('[data-world-tool-entry-card="enabled"]');
      assert.ok(Boolean(card), 'the Overview tab carries the switch card the design draws');
      assert.equal(
        target.querySelector('[data-world-tool-entry-enabled]').dataset.worldToolEntryEnabled,
        'on',
        'ABSENT reads as enabled, so an existing world sees no change'
      );
      // THE COUNT IS THE SWITCH'S ACCESSIBLE NAME. There is no confirmation on a world-scope
      // write - every field here persists on change - so the consequence has to reach a GM
      // before the click rather than after it; it was a THIRD visible sentence on a card the
      // design draws as a title, one line and a bare pill (issue 1373's parity round), so it
      // moved onto the control it qualifies, where `ArmedDangerButton` and `StatusToggle` both
      // also expose it as the hover title.
      assert.match(
        target.querySelector('[data-world-tool-entry-enabled]').getAttribute('aria-label'),
        /2 crafting systems have this Tool and lose it while this is off\./
      );
      assert.ok(
        !card.querySelector('[data-world-tool-entry-enabled-reach]'),
        'the reach is stated once, on the control, not again as a third body line'
      );
    });

    it('pluralises the reach for a single member', async () => {
      const target = await mountTab({ scope: scopeFor({}, 1) });
      assert.match(
        target.querySelector('[data-world-tool-entry-enabled]').getAttribute('aria-label'),
        /1 crafting system has this Tool/
      );
    });

    it('draws OFF and writes the INVERSE through the tool-family action', async () => {
      const calls = [];
      const target = await mountTab({
        scope: scopeFor({ enabled: false }),
        actions: { setWorldEnabled: (id, enabled) => calls.push([id, enabled]) },
      });
      const toggle = target.querySelector('[data-world-tool-entry-enabled]');
      assert.equal(toggle.dataset.worldToolEntryEnabled, 'off');
      toggle.click();
      assert.deepEqual(calls, [['pick', true]]);
    });
  });

  describe('the buffered edit, and the Save that writes it (issue 1373)', () => {
    it('stages the display label, reports it to the shell, and persists NOTHING until Save', async () => {
      const calls = [];
      const target = await mountTab({
        scope: scopeFor(),
        actions: {
          updateEntity: (id, patch) => {
            calls.push([id, patch]);
          },
        },
      });
      const input = target.querySelector(':scope [data-world-tool-entry-field="name"] input');
      assert.equal(input.value, 'Mining Pick', 'the field opens on the record as it stands');
      assert.equal(draftHandle.isDirty(), false, 'a never-touched editor opens clean');

      input.value = 'Miners Pick';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      // The REPORTED flag is published by an effect, so it needs a settle; the HANDLE below
      // does not, and that difference is the whole reason the page reports both.
      await harness.setProps({});

      assert.deepEqual(calls, [], 'a keystroke reached the write path before Save');
      assert.equal(draftHandle.isDirty(), true, 'the handle the route-exit guard reads is live');
      assert.equal(
        reportedDirty.at(-1),
        true,
        'the reactive flag the Save button is disabled from did not re-report'
      );
      // THE HEADING AND THE BREADCRUMB FOLLOW THE BUFFERED NAME. Both name the thing being
      // edited, and the enabled Save beside them is what says the edit is unsaved. The WHOLE
      // buffered identity map goes over one route-agnostic prop, so the shell reads whichever
      // fields the chrome it draws renders rather than a payload shaped for one editor.
      assert.equal(reportedIdentities.at(-1)?.name, 'Miners Pick');
      // THE WHOLE BUFFERED MAP GOES OVER, and since issue 1373's parity round that map is the
      // NAME alone: the description textarea left the Overview tab, because the description a
      // Tool has is the linked game-world Item's and the card above already states it read-only.
      // A buffered field no control can move is one `scopedEntryWrites` re-sends on every Save.
      assert.deepEqual(
        Object.keys(reportedIdentities.at(-1) ?? {}),
        ['name'],
        'the report carries the editor’s whole buffered identity, and no field it cannot author'
      );

      await flushDraft();
      // ONLY THE CHANGED FIELD. `scopedEntryWrites` answers the keys that DIFFER, so a Save
      // never restates the description over whatever another client wrote to it meanwhile.
      assert.deepEqual(calls, [['pick', { name: 'Miners Pick' }]]);
      assert.equal(draftHandle.isDirty(), false, 'a landed Save leaves nothing to write');
    });

    it('WITHDRAWS the buffered identity on unmount, so it cannot name another route', async () => {
      // The channel this page reports into is SHARED by all three scoped entry routes, and the
      // shell's reader is generic across them. A page that reported and never withdrew would
      // leave `Miners Pick` in the breadcrumb of whichever entry editor opened next, which is
      // why the withdrawal is this page's own teardown rather than something the shell does for
      // it from `onDraftChange(null)`.
      await mountTab({ scope: scopeFor() });
      const input = harness.target.querySelector('[data-world-tool-entry-name]');
      input.value = 'Miners Pick';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await harness.setProps({});
      assert.equal(
        reportedIdentities.at(-1)?.name,
        'Miners Pick',
        'nothing was published, so the withdrawal below would prove nothing'
      );

      harness.remount();
      assert.equal(
        reportedIdentities.at(-1),
        null,
        'the editor left its buffered identity behind in a channel the other entry routes read'
      );
    });

    it('leaves the world master switch IMMEDIATE, because it acts on a different decision', async () => {
      const writes = [];
      const target = await mountTab({
        scope: scopeFor(),
        actions: {
          setWorldEnabled: (id, enabled) => {
            writes.push([id, enabled]);
          },
        },
      });
      target.querySelector('[data-world-tool-entry-enabled]').click();
      assert.deepEqual(
        writes,
        [['pick', false]],
        'the master switch was staged behind Save, which would leave a GM believing every ' +
          'system had lost the Tool while nothing had happened'
      );
      assert.equal(draftHandle.isDirty(), false, 'an immediate action must not open the draft');
    });

    it('discards back to the record on disk, and reports itself clean again', async () => {
      const target = await mountTab({ scope: scopeFor() });
      const input = target.querySelector(':scope [data-world-tool-entry-field="name"] input');
      input.value = 'Miners Pick';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      assert.equal(draftHandle.isDirty(), true);

      draftHandle.discard();
      assert.equal(draftHandle.isDirty(), false, 'discard left the editor dirty');
    });

    it('clears the draft on Delete, so the route-exit guard cannot offer to save a gone record', async () => {
      const removed = [];
      const target = await mountTab({
        scope: scopeFor(),
        actions: {
          deleteEntity: (id) => {
            removed.push(id);
          },
        },
      });
      const input = target.querySelector(':scope [data-world-tool-entry-field="name"] input');
      input.value = 'Miners Pick';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      assert.equal(draftHandle.isDirty(), true);

      // DELETE IS THE HEADER'S, and the page reports the action rather than drawing it: the
      // design puts `Delete` between `Back to tools` and `Save tool`, and the danger-CARD idiom
      // this tab used to carry is the SYSTEM rules editor's `Stop using this Tool here`. The two
      // scopes had swapped their destructive treatments (issue 1373's parity round).
      assert.ok(
        !target.querySelector('[data-world-tool-entry-card="delete"]'),
        'the body no longer carries the system screen’s danger card'
      );
      const descriptor = reportedDeletes.at(-1);
      assert.ok(
        Boolean(descriptor),
        'the page reported no delete action, so no header can draw one'
      );
      assert.equal(descriptor.token, 'world-tool-delete:pick', 'the arm token names the record');
      // THE REACH SURVIVES AS THE CONTROL'S ACCESSIBLE NAME, which `ArmedDangerButton` also
      // exposes as its hover title. It is the one fact a GM cannot recover after the click.
      assert.match(
        descriptor.idleAriaLabel,
        /2 crafting systems that have it/,
        'the reach a GM cannot recover afterwards has to reach them before the second press'
      );
      await descriptor.run();
      await Promise.resolve();
      await Promise.resolve();

      assert.deepEqual(removed, ['pick']);
      // The guard reads the LIVE handle at click time, so a draft still standing here would
      // prompt to save a Tool that no longer exists.
      assert.equal(draftHandle.isDirty(), false, 'the draft outlived the record it was about');
    });
  });

  describe('the breakage VALUE, one editor per mode', () => {
    it('offers a uses-per-copy stepper under `Limited uses`, and writes the section MERGED', async () => {
      const calls = [];
      const target = await mountTab({
        scope: scopeFor({ breakage: { mode: 'limitedUses', maxUses: 3 } }),
        actions: {
          updateWorldDefaultSection: (id, section, value) => calls.push([id, section, value]),
        },
        tab: 'breakage',
      });
      const input = target.querySelector('[data-world-tool-entry-max-uses]');
      assert.ok(Boolean(input), 'the mode a GM selected has a value they can move');
      assert.equal(input.value, '3');

      input.value = '5';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      // BUFFERED, so moving the number writes NOTHING until Save. This half is what a markup
      // read cannot see, and it is the whole of the maintainer's explicit-save decision.
      assert.deepEqual(calls, [], 'the stepper persisted its value without a Save');
      await flushDraft();
      assert.deepEqual(calls.at(-1), [
        'pick',
        'breakage',
        // THE MODE SURVIVES. `patchSection` merges over the section already on disk, so moving
        // the number never erases the rule the number belongs to.
        { mode: 'limitedUses', maxUses: 5 },
      ]);
    });

    it('offers the break-chance control under `Breakage chance`', async () => {
      const calls = [];
      const target = await mountTab({
        scope: scopeFor({ breakage: { mode: 'breakageChance', breakageChance: 8 } }),
        actions: {
          updateWorldDefaultSection: (id, section, value) => calls.push([id, section, value]),
        },
        tab: 'breakage',
      });
      const input = target.querySelector('[data-world-tool-entry-breakage-chance]');
      assert.ok(Boolean(input));
      assert.equal(input.value, '8');
      input.value = '17';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      assert.deepEqual(calls, [], 'the chance control persisted its value without a Save');
      await flushDraft();
      assert.deepEqual(calls.at(-1), [
        'pick',
        'breakage',
        { mode: 'breakageChance', breakageChance: 17 },
      ]);
    });

    it('offers a formula field under `Dice expression`', async () => {
      const calls = [];
      const target = await mountTab({
        scope: scopeFor({ breakage: { mode: 'diceExpression', formula: '1d20', threshold: 4 } }),
        actions: {
          updateWorldDefaultSection: (id, section, value) => calls.push([id, section, value]),
        },
        tab: 'breakage',
      });
      const field = target.querySelector('[data-world-tool-entry-formula]');
      assert.ok(Boolean(field));
      assert.equal(field.value, '1d20');
      field.value = '2d6';
      field.dispatchEvent(new Event('input', { bubbles: true }));
      assert.deepEqual(calls, [], 'the formula field persisted its value without a Save');
      await flushDraft();
      assert.deepEqual(calls.at(-1), [
        'pick',
        'breakage',
        { mode: 'diceExpression', formula: '2d6', threshold: 4 },
      ]);
    });

    it('draws exactly ONE editor: the one the selected mode owns', async () => {
      const target = await mountTab({
        scope: scopeFor({ breakage: { mode: 'breakageChance', breakageChance: 8 } }),
        tab: 'breakage',
      });
      assert.ok(!target.querySelector('[data-world-tool-entry-max-uses]'));
      assert.ok(!target.querySelector('[data-world-tool-entry-formula]'));
      assert.ok(Boolean(target.querySelector('[data-world-tool-entry-breakage-chance]')));
    });
  });

  describe('the formula is validated by ROLLING it', () => {
    /**
     * A dice class whose `evaluateSync` refuses anything but a bare `NdM`.
     *
     * MODELLED ON THE REAL TRAP: `Roll.validate` PARSES and does not evaluate, so it answers
     * `true` for expressions that throw the moment a craft rolls them. This double therefore
     * parses everything and evaluates only what a real engine could, which is the distinction
     * the guard has to survive. `total` is `Number(this._total) || 0` on the real class, so the
     * `-Infinity` case is modelled rather than described.
     */
    class FakeRoll {
      constructor(formula) {
        this.formula = String(formula ?? '');
        this._total = 0;
      }

      evaluateSync() {
        if (/^\d*d\d+$/i.test(this.formula.trim())) {
          this._total = 6;
          return this;
        }
        if (this.formula.includes('max(')) {
          this._total = -Infinity;
          return this;
        }
        throw new Error(`unrollable: ${this.formula}`);
      }

      get total() {
        return Number(this._total) || 0;
      }
    }

    /**
     * Mount the Breakage tab with a dice engine installed, and take it away afterwards.
     *
     * @param {string} formula
     * @returns {Promise<HTMLElement>}
     */
    async function mountWithDice(formula) {
      globalThis.Roll = FakeRoll;
      try {
        return await mountTab({
          scope: scopeFor({ breakage: { mode: 'diceExpression', formula } }),
          tab: 'breakage',
        });
      } finally {
        delete globalThis.Roll;
      }
    }

    it('accepts a formula that really rolls', async () => {
      const target = await mountWithDice('2d6');
      assert.ok(!target.querySelector('[data-world-tool-entry-formula-error]'));
      assert.ok(
        !target.querySelector('[data-world-tool-entry-formula]').hasAttribute('aria-invalid')
      );
    });

    it('REJECTS one that parses and then throws', async () => {
      const target = await mountWithDice('1000d6 + junk');
      assert.ok(
        Boolean(target.querySelector('[data-world-tool-entry-formula-error]')),
        'the field says so, rather than persisting a value that fails every attempt'
      );
      assert.equal(
        target.querySelector('[data-world-tool-entry-formula]').getAttribute('aria-invalid'),
        'true'
      );
    });

    it('REJECTS an empty-headed function whose total is not finite', async () => {
      // `Roll.validate('max(, 2)')` is TRUE on the shipped stack: the head is optional, the
      // term evaluates to `-Infinity`, and `Roll#total` passes it through as a number. A guard
      // that stopped at "it evaluated without throwing" would accept it.
      const target = await mountWithDice('max(, 2)');
      assert.ok(Boolean(target.querySelector('[data-world-tool-entry-formula-error]')));
    });

    it('says nothing at all with NO dice engine, and nothing on an EMPTY field', async () => {
      // FAIL OPEN. Headless has no `Roll`, so nothing there could evaluate the formula either;
      // painting every authored expression red would be worse than saying nothing. An empty
      // field is UNSET rather than invalid, and the Validation tab is where incompleteness is
      // reported.
      const headless = await mountTab({
        scope: scopeFor({ breakage: { mode: 'diceExpression', formula: 'MAX(1d4, 2)' } }),
        tab: 'breakage',
      });
      assert.ok(!headless.querySelector('[data-world-tool-entry-formula-error]'));

      const empty = await mountWithDice('');
      assert.ok(!empty.querySelector('[data-world-tool-entry-formula-error]'));
    });
  });

  // -------------------------------------------------------------------------
  // THE LINKED-ITEM CARD, RELOCATED FROM THE SYSTEM EDITOR (issue 1373)
  // -------------------------------------------------------------------------
  describe('the linked-item card', () => {
    const LINKED_ITEM = {
      uuid: 'Item.pick',
      name: 'Mining Pick',
      img: 'icons/tools/pick.webp',
      description: 'A sturdy iron pick.',
    };

    it('renders the drop target, both actions and the linked Item OWN description', async () => {
      const target = await mountTab({ scope: scopeFor(), worldItems: [LINKED_ITEM] });
      const card = target.querySelector('[data-world-tool-entry-card="linked-item"]');
      assert.ok(Boolean(card), 'the world entry owns the card now');

      const zone = card.querySelector('[data-tool-source-card]');
      assert.ok(Boolean(zone), 'and it is the SHIPPED drop zone rather than a static tile');
      assert.match(
        zone.querySelector('[data-tool-source-drop-hint]').textContent,
        /Drop another Item here to replace the linked source\./
      );
      // ONE ACTION AND TWO LINES, which is what the design's tile carries (issue 1373's parity
      // round). A Copy sat beside Unlink and a raw `Item.pick` sat on a third line, displacing
      // the hint that says what dropping onto the tile DOES; an id is not a fact this screen
      // states anywhere else.
      assert.ok(Boolean(zone.querySelector('[data-world-tool-entry-source-unlink]')), 'unlink');
      assert.ok(!zone.querySelector('[data-tool-source-copy-uuid]'), 'no second action');
      assert.ok(!zone.querySelector('[data-item-drop-zone-subline]'), 'no raw uuid line');
      // AND NO `Linked` CHIP ON THE HEADING. A pill on the card of a record whose whole premise
      // is that it IS a game-world Item states the rule rather than the exception; the catalogue
      // row one route away already makes the identical split for the identical badge.
      assert.ok(
        !card.querySelector('.manager-chip'),
        'a linked record wears no chip; only the unlinked exception does'
      );
      // THE DESCRIPTION IS THE ITEM'S, not the world record's: the projection's entity says
      // `A pick.` and the live Item says otherwise, so a card reading the record would show the
      // wrong one here.
      assert.match(
        target.querySelector('[data-world-tool-entry-source-description]').textContent,
        /A sturdy iron pick\./
      );
    });

    it('routes unlink and a replacement drop through their named callbacks', async () => {
      const calls = [];
      const target = await mountTab({
        scope: scopeFor(),
        worldItems: [LINKED_ITEM],
        onUnlinkSource: () => calls.push(['unlink']),
        onSourceDrop: (data) => calls.push(['drop', data.uuid]),
      });

      target.querySelector('[data-world-tool-entry-source-unlink]').click();
      const zone = target.querySelector('[data-tool-source-card]');
      dispatchDrop(zone, { type: 'Item', uuid: 'Item.replacement' });

      assert.deepEqual(calls, [['unlink'], ['drop', 'Item.replacement']]);

      // The document-type check is what keeps an Actor or a Macro out of a Tool's source link,
      // and the widened uuid guard is what lets a compendium `{pack, id}` drag through.
      dispatchRejectedDrops(zone);
      assert.equal(calls.filter(([kind]) => kind === 'drop').length, 1);
      dispatchDrop(zone, { type: 'Item', pack: 'fabricate.items', id: 'legacy' });
      assert.equal(calls.filter(([kind]) => kind === 'drop').length, 2);
    });

    it('offers a LINKING prompt, and no unlink, for a record with no source', async () => {
      const scope = scopeFor();
      const entry = scope.entries.find((candidate) => candidate.id === 'pick');
      entry.entity = { ...entry.entity, originItemUuid: '', registeredItemUuid: '' };
      entry.hasSourceLink = false;

      const target = await mountTab({ scope });

      assert.ok(!target.querySelector('[data-world-tool-entry-source-unlink]'), 'nothing to cut');
      assert.ok(!target.querySelector('[data-world-tool-entry-source-description]'));
      // THE CHIP STATES THE EXCEPTION. `No source item` is a real answer about a record and it
      // keeps its pill, where `Linked` on every other record stated the rule.
      const card = target.querySelector('[data-world-tool-entry-card="linked-item"]');
      assert.match(card.querySelector('.manager-chip').textContent, /No source item/);
      // THE COPY MATCHES THE CONTROLS. It used to promise `name, art and description are
      // authored here` on a screen with no art control and no colour control; the art comes
      // from the linked Item and there is nothing to author it with, so the hint says that.
      const hint = target.querySelector('[data-world-tool-entry-unlinked]').textContent;
      assert.match(hint, /name below is all this record has/);
      assert.match(hint, /art comes from the linked Item/);
      // AND THE DISPLAY LABEL'S HELPER TELLS THE TRUTH ABOUT THE FALLBACK. With no Item there is
      // nothing to inherit, so the field is not optional here and the helper says so rather than
      // promising that a blank resolves to something (issue 1373's parity round).
      assert.match(
        target.querySelector('[data-world-tool-entry-name-hint]').textContent,
        /no name to fall back on/
      );
    });

    // ── E1 ────────────────────────────────────────────────────────────────────────────────
    // THE TWO FACES ARE DISTINGUISHABLE IN THE DOM, which is what makes them distinguishable on
    // screen (issue 1373, maintainer round 2).
    //
    // The design draws the LINKED tile solid and filled and reserves the dashed edge for the
    // UNLINKED prompt in the danger ink (`proto:2089` against `proto:2098`); this screen had
    // given the healthy state the broken state's clothes, painting both from one box. The
    // repair is a pair of scoped rules keyed on `.is-linked`, so what a mounted suite can hold
    // is that the class the rules turn on tracks the state — a primitive that stopped writing
    // it would leave both rules matching nothing, silently, and the frames would revert.
    //
    // The frames themselves are `world-tool-entry-overview` and `world-tool-entry-unlinked`.
    it('marks the linked and unlinked source faces apart, which is what the two treatments key on', async () => {
      const linked = await mountTab({ scope: scopeFor(), worldItems: [LINKED_ITEM] });
      const linkedZone = linked.querySelector('[data-tool-source-card]');
      assert.ok(
        linkedZone.classList.contains('is-linked'),
        'a resolved source is the LINKED face, which the solid filled tile keys on'
      );

      const scope = scopeFor();
      scope.entries[0].originItemUuid = '';
      scope.entries[0].registeredItemUuid = '';
      scope.entries[0].hasSourceLink = false;
      const unlinked = await mountTab({ scope });
      const unlinkedZone = unlinked.querySelector('[data-tool-source-card]');
      assert.ok(
        !unlinkedZone.classList.contains('is-linked'),
        'and an unlinked record is not, which is what the danger-dashed prompt keys on'
      );
    });

    // ── E5 ────────────────────────────────────────────────────────────────────────────────
    // THE LINKED ITEM'S NAME IS SET IN THE DESIGN SERIF, AND THE RULE THAT DOES IT REACHES.
    //
    // `proto:2091` states `font: 600 13.5px var(--serif)` for the linked Item's name. The screen
    // drew it in the app sans at the UA's bare-`<strong>` 700, because nothing declared a face,
    // a size or a weight on that element anywhere - not the primitive's scoped block, not the
    // global sheet.
    //
    // THE RULE CANNOT LIVE IN `ItemDropZone`. That primitive is shared with the recipe-item,
    // essence and check-macro drop zones and none of those screens asked for a serif name, so
    // the face is route-scoped from THIS caller, which writes the card wrapper itself.
    //
    // A `:global()` rule addressing another component's markup can compile to a selector that
    // matches NOTHING, silently and with no warning, so proving the declarations alone would
    // prove nothing. This holds both halves: the three properties the design states, and the
    // COMPILED selector run against the markup the primitive actually renders. Selector matching
    // is what happy-dom can do; which declaration WINS is proved by the recaptured
    // `world-tool-entry-overview` frame, because happy-dom cannot compute a cascade.
    //
    // The unlinked prompt is held to the OPPOSITE, because `proto:2098` gives that copy
    // `font: 500 11px var(--sans)` - a face of its own, and it is the sans one. A rule keyed on
    // the state rather than on the card is what keeps the two faces from drifting into each
    // other.
    it('sets the LINKED source name in the design serif, in a rule that reaches the primitive', async () => {
      const { css } = scopedComponentCss(
        resolve(repoRoot, 'src/ui/svelte/apps/manager/scoped/WorldToolEntryPage.svelte')
      );
      // Comments are stripped first: a `{` inside one would split a rule at the wrong place and
      // the gate would report a missing rule that is present.
      const rules = [...css.replaceAll(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(
        ([, selector, body]) => ({ selector: selector.trim().replaceAll(/\s+/g, ' '), body })
      );
      const serif = rules.find(
        ({ selector, body }) =>
          selector.includes('.manager-item-drop-zone-copy strong') &&
          /font-family:\s*var\(--fab-font-serif\)/.test(body)
      );
      assert.ok(
        Boolean(serif),
        'no rule gives the drop zone name `var(--fab-font-serif)`; `proto:2091` states the serif'
      );
      // 600, NOT the UA's bare-`<strong>` 700, and 0.84rem for the design's 13.5px on this
      // sheet's 16px rem basis. A raw pixel literal here would be the thing the scale forbids.
      assert.match(serif.body, /font-weight:\s*600/, '`proto:2091` states weight 600');
      assert.match(serif.body, /font-size:\s*0\.84rem/, '`proto:2091` states 13.5px = 0.84rem');

      const linked = await mountTab({ scope: scopeFor(), worldItems: [LINKED_ITEM] });
      const card = linked.querySelector('[data-world-tool-entry-card="linked-item"]');
      const name = card.querySelector('.manager-item-drop-zone-copy strong');
      assert.ok(Boolean(name), 'the primitive still renders the name as a `<strong>`');
      // The scoping hash is re-stamped from the LIVE element rather than trusted to match across
      // two compiles, so this asserts the selector's SHAPE reaches - which is the half that rots
      // when the primitive's markup moves.
      const hash = [...card.classList].find((token) => token.startsWith('svelte-'));
      assert.ok(Boolean(hash), "the card wrapper carries this component's scoping hash");
      const selector = serif.selector.replaceAll(/svelte-[\da-z]+/g, hash);
      assert.ok(
        [...linked.querySelectorAll(selector)].includes(name),
        `the compiled rule matches nothing the primitive renders: ${selector}`
      );

      const scope = scopeFor();
      scope.entries[0].originItemUuid = '';
      scope.entries[0].registeredItemUuid = '';
      scope.entries[0].hasSourceLink = false;
      const unlinked = await mountTab({ scope });
      const prompt = unlinked.querySelector(
        '[data-world-tool-entry-card="linked-item"] .manager-item-drop-zone-copy strong'
      );
      assert.ok(Boolean(prompt), 'the unlinked face still draws its own copy');
      assert.ok(
        ![...unlinked.querySelectorAll(selector)].includes(prompt),
        "the serif is the LINKED tile's; `proto:2098` keeps the unlinked prompt in the sans"
      );
    });

    it('draws the display label as OPTIONAL, naming what a blank falls back to', async () => {
      const target = await mountTab({ scope: scopeFor(), worldItems: [LINKED_ITEM] });
      const input = target.querySelector(':scope [data-world-tool-entry-field="name"] input');
      // THE PLACEHOLDER IS THE LINKED ITEM'S LIVE NAME, which is what makes the helper's promise
      // checkable rather than a claim: the design draws the field EMPTY under `Leave blank to use
      // the linked Item name.`, and the shipped screen pre-filled it with no statement that it
      // was optional or what answered for it.
      assert.equal(input.getAttribute('placeholder'), 'Mining Pick');
      assert.match(
        target.querySelector('[data-world-tool-entry-name-hint]').textContent,
        /Leave blank to use the linked Item name/
      );
      // AND A BLANK RESOLVES rather than leaving the screen unnamed. The drop tile's title is the
      // resolved name, so it is the one element that proves the fallback is real.
      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await harness.setProps({});
      assert.equal(reportedIdentities.at(-1)?.name, '', 'a blank is stored as a blank');
      assert.match(
        target.querySelector('[data-tool-source-card]').textContent,
        /Mining Pick/,
        'and the screen names the Tool by the Item it is linked to'
      );
    });

    it('has NO description field, because the description belongs to the linked Item', async () => {
      const target = await mountTab({ scope: scopeFor(), worldItems: [LINKED_ITEM] });
      // TWO FIELDS UNDER A HEADING NAMING ONE, and the second edited a paragraph the card above
      // already stated read-only - the same text twice on one tab, once editable and once not.
      assert.ok(
        !target.querySelector('[data-world-tool-entry-field="description"]'),
        'the Overview tab authors one identity field, which is what its heading names'
      );
      assert.ok(!target.querySelector(':scope textarea'), 'and no textarea survives it');
    });

    it('marks a link whose Item has gone MISSING, without accusing an unloaded roster', async () => {
      const loaded = await mountTab({
        scope: scopeFor(),
        worldItems: [{ uuid: 'Item.something-else', name: 'Other' }],
      });
      assert.equal(
        loaded.querySelector('[data-tool-source-card]').dataset.itemDropState,
        'missing'
      );

      const unloaded = await mountTab({ scope: scopeFor(), worldItems: [] });
      assert.ok(
        !unloaded.querySelector('[data-tool-source-card]').hasAttribute('data-item-drop-state'),
        'an EMPTY roster is a roster that has not loaded, not a broken link'
      );
    });
  });

  // -------------------------------------------------------------------------
  // THE REQUIREMENTS TAB (issue 1373)
  // -------------------------------------------------------------------------
  describe('the Requirements tab', () => {
    const PREREQUISITES = [
      { id: 'trained', name: 'Trained in Smithing', expression: '@prof >= 2' },
      { id: 'strong', name: 'Strength 13 or higher', expression: '@abilities.str.mod >= 2' },
    ];

    it('is the FOURTH tab, between Breakage and Validation', async () => {
      const target = await mountTab({ scope: scopeFor() });
      const tabs = [...target.querySelectorAll('[data-world-tool-entry-tab]')];
      assert.deepEqual(
        tabs.map((tab) => tab.dataset.worldToolEntryTab),
        ['identity', 'breakage', 'requirements', 'validation']
      );
      // THE VALIDATION BADGE STILL HOLDS. The strip grew a tab, and the badge is attached by
      // id rather than by position, so this is what proves the fourth tab did not displace it.
      assert.ok(
        Boolean(target.querySelector('[data-world-tool-entry-tab-badge="validation"]')),
        'the Validation tab keeps its own count badge'
      );
    });

    it('keeps the tab panel focusable and labelled by the tab it belongs to', async () => {
      const target = await mountTab({ scope: scopeFor(), tab: 'requirements' });
      const panel = target.querySelector('[role="tabpanel"]');
      assert.equal(panel.id, 'world-tool-entry-panel-requirements');
      assert.equal(panel.getAttribute('aria-labelledby'), 'world-tool-entry-tab-requirements');
      assert.equal(panel.getAttribute('tabindex'), '-1');
      assert.equal(panel.getAttribute('data-keyboard-focus'), 'true');
    });

    it('renders the SHIPPED requirements tab over the world defaults', async () => {
      const target = await mountTab({
        scope: scopeFor({
          prerequisites: { enabled: true, ids: ['trained'], gateMode: 'usability' },
          bonus: { enabled: true, expression: '@prof' },
        }),
        tab: 'requirements',
        prerequisiteOptions: PREREQUISITES,
      });

      assert.ok(Boolean(target.querySelector('[data-tool-requirements-tab]')));
      assert.equal(target.querySelector('[data-tool-prerequisites-enabled]').checked, true);
      assert.equal(target.querySelector('[data-tool-bonus-enabled]').checked, true);
      // Scoped to the prerequisite LIST, not the whole tab: the two section enable switches are
      // checkboxes too, and they carry the browser default value `on`.
      const checked = [
        ...target.querySelectorAll('.manager-tool-prerequisite-list input[type=checkbox]'),
      ]
        .filter((input) => input.checked)
        .map((input) => input.value);
      assert.deepEqual(checked, ['trained']);
    });

    it('BUFFERS a prerequisite edit and writes it as a world-default SECTION on Save', async () => {
      const writes = [];
      const target = await mountTab({
        scope: scopeFor(),
        tab: 'requirements',
        prerequisiteOptions: PREREQUISITES,
        actions: {
          updateWorldDefaultSection: (id, section, value) => {
            writes.push([id, section, value]);
            return true;
          },
        },
      });

      const toggle = target.querySelector('[data-tool-prerequisites-enabled]');
      toggle.checked = true;
      toggle.dispatchEvent(new Event('change', { bubbles: true }));
      assert.deepEqual(writes, [], 'nothing is persisted before the flush');

      await flushDraft();
      assert.deepEqual(writes, [
        ['pick', 'prerequisites', { enabled: true, ids: [], gateMode: 'usability' }],
      ]);
    });

    // THE REACH SENTENCES MOVED INSIDE THE SECTIONS THEY COUNT (issue 1373, maintainer round 2).
    // They were two `data-world-tool-entry-inherit-count` paragraphs stacked at the foot of a
    // WRAPPER card, identical to the character and neither beside the section it counted; the
    // wrapper is gone with the card-inside-a-card it made, and each sentence is the last line of
    // its own section's card, written by `ToolRequirementsTab`'s `sectionNotes`.
    //
    // ASSERTED THROUGH THE CARD THAT OWNS IT, not by hook alone: the whole point of the move is
    // WHERE the sentence sits, and a bare `querySelector` on the note would pass just as well
    // with both of them stacked outside the cards again.
    it('states the inherit count for BOTH new sections, INSIDE each section card', async () => {
      const target = await mountTab({ scope: scopeFor(), tab: 'requirements' });
      for (const section of ['prerequisites', 'bonus']) {
        const card = target.querySelector(`[data-tool-rule-card="${section}"]`);
        assert.ok(Boolean(card), `${section} draws its own card`);
        assert.match(
          card.querySelector(`[data-tool-section-note="${section}"]`).textContent,
          /2 crafting systems inherit this world default today\./,
          `${section} states its reach inside its own card`
        );
      }
    });

    // ── E3 ────────────────────────────────────────────────────────────────────────────────
    // ONE HEADING PER SECTION, AND THE SWITCH ON THE HEADER ROW (issue 1373, round 2).
    //
    // Each section stated itself TWICE: an uppercase eyebrow carrying the whole sentence
    // (`CHARACTER PREREQUISITES`) with a description, and then a bold `Require prerequisites`
    // row underneath restating it with its own subtitle and its own toggle. The design
    // (`proto:2324`) heads a section with the short WORD over the SENTENCE and puts the one
    // switch on that same row.
    it('heads each requirements section once, with the toggle on the header row', async () => {
      const target = await mountTab({ scope: scopeFor(), tab: 'requirements' });
      for (const [section, eyebrow, title] of [
        ['prerequisites', 'Prerequisites', 'Character prerequisites'],
        ['bonus', 'Bonus', 'Bonus to the check'],
      ]) {
        const card = target.querySelector(`[data-tool-rule-card="${section}"]`);
        assert.equal(
          card.querySelector(`[data-tool-rule-eyebrow="${section}"]`).textContent.trim(),
          eyebrow,
          'the eyebrow is the short word'
        );
        assert.equal(
          card.querySelector('.manager-tool-rule-card-title h3').textContent.trim(),
          title,
          'and the title is the sentence'
        );
      }

      // THE SWITCH IS ON THE HEADER ROW, and the row that used to restate the heading is gone.
      // Asserted through containment rather than by hook alone: the hook survived the move, so
      // a bare `querySelector` would pass on either arrangement.
      for (const hook of ['data-tool-prerequisites-enabled', 'data-tool-bonus-enabled']) {
        const toggle = target.querySelector(`[${hook}]`);
        assert.ok(Boolean(toggle), 'the section still carries its enable switch');
        assert.ok(
          Boolean(toggle.closest('.manager-tool-rule-card-head')),
          'and it sits on the card head, not on a heading row of its own'
        );
      }
      assert.ok(
        !target.querySelector('[data-tool-requirements-tab] .manager-tool-setting-row'),
        'the second heading row is gone at world scope, where the head has room for the switch'
      );
    });

    // ONE CARD, NOT TWO. The design draws the whole tab as a single bordered panel whose two
    // sections are separated by a rule (`proto:2322`, `proto:2349`), and both sections keep the
    // `data-tool-rule-card` name every other reader addresses them by.
    it('draws both requirements sections inside ONE card', async () => {
      const target = await mountTab({ scope: scopeFor(), tab: 'requirements' });
      const card = target.querySelector('.manager-tool-requirements-card');
      assert.ok(Boolean(card), 'the tab is the card');
      assert.equal(card.dataset.toolRequirementsTab, '');
      assert.deepEqual(
        [...card.querySelectorAll('[data-tool-rule-card]')].map(
          (section) => section.dataset.toolRuleCard
        ),
        ['prerequisites', 'bonus'],
        'and both sections are inside it'
      );
      for (const section of card.querySelectorAll('[data-tool-rule-card]')) {
        assert.ok(
          section.classList.contains('is-flush'),
          'a section inside the card draws no box of its own'
        );
      }
    });

    // AND THE TAB IS NOT WRAPPED IN A CARD OF ITS OWN. `ToolRequirementsTab` draws a
    // `ToolInheritCard` per section, so the wrapper made three nested bordered surfaces where
    // the design draws one, with every inner card's padding compounding the wrapper's. The
    // region keeps its `data-world-tool-entry-card="requirements"` name — the capture case
    // addresses the tab through it — but is no longer a card.
    it('does not enclose the Requirements tab in a card of its own', async () => {
      const target = await mountTab({ scope: scopeFor(), tab: 'requirements' });
      const region = target.querySelector('[data-world-tool-entry-card="requirements"]');
      assert.ok(Boolean(region), 'the requirements region is still addressable');
      assert.equal(
        region.classList.contains('manager-world-tool-entry-card'),
        false,
        'the tab must not wear the card box its own sections already wear'
      );
    });

    it('adds the two missing preview rules, so the resolved column states four rules', async () => {
      const target = await mountTab({
        scope: scopeFor({
          prerequisites: { enabled: true, ids: ['trained'], gateMode: 'usability' },
          bonus: { enabled: true, expression: '@prof' },
        }),
      });
      // THE HOOKS ARE THE SHARED RAIL'S. This column was a FORK of `tools/ToolBehaviorPreview`
      // and composes it since issue 1373's parity round, so the per-rule hook is the one that
      // component writes; `data-world-tool-entry-preview` survives on the aside as the caller's
      // own `hookAttribute`.
      const rules = [...target.querySelectorAll('[data-tool-preview-rule]')].map(
        (row) => row.dataset.toolPreviewRule
      );
      assert.ok(rules.includes('prerequisites'), 'the character gate is stated');
      assert.ok(rules.includes('bonus'), 'and so is the check bonus');
      const text = target.querySelector('[data-world-tool-entry-preview]').textContent;
      assert.match(text, /1 prerequisite/);
      assert.match(text, /Adds @prof/);
    });
  });

  describe('the rail is the shared behaviour preview (issue 1373 parity round)', () => {
    it('draws the four treatments the fork had lost', async () => {
      const target = await mountTab({ scope: scopeFor() });
      const rail = target.querySelector('[data-world-tool-entry-preview]');
      assert.ok(Boolean(rail), 'the rail keeps this route’s own hook name');
      // THE PLAYER TILE'S NAME CAPTION, which the fork had no element for at all.
      assert.ok(Boolean(rail.querySelector('[data-tool-player-name]')), 'the tile names the Tool');
      // `Show as broken` IS THE SHIPPED PILL TOGGLE, not a hand-rolled bare checkbox with its
      // label on the wrong side. `StatusToggle`'s `checkbox` host writes the hook onto the input.
      const broken = rail.querySelector('[data-tool-player-broken]');
      assert.ok(Boolean(broken), 'the toggle is the primitive’s');
      assert.equal(broken.type, 'checkbox');
      // THE PREREQUISITE-GATE LINE IS THE DASHED GHOST PANEL, not a plain paragraph.
      assert.ok(
        Boolean(rail.querySelector('[data-tool-preview-gate]')),
        'the gate line is a panel'
      );
      // AND THE USABILITY CARD IS A NEUTRAL STATEMENT OF FACT. `Usable, with no check bonus` is
      // not a pass state, and the fork recoloured it to success-green.
      const usability = rail.querySelector('[data-tool-preview-usability]');
      assert.ok(Boolean(usability), 'the usability fact is stated');
      assert.match(usability.textContent, /Usable, with no check bonus/);
    });

    it('states what the RECORD is, under the shared `Effective rules` heading', async () => {
      const target = await mountTab({ scope: scopeFor() });
      const rail = target.querySelector('[data-world-tool-entry-preview]');
      // TWO COPY DEFECTS AT ONCE. The subtitle read `In 1 crafting systems` - an unpluralised
      // count of a fact the catalogue answers - where the design restates the scope; and the
      // rules heading read `THE WORLD DEFAULTS, RESOLVED` where the design says `Effective
      // rules` at BOTH scopes. `contextText` carries the first as an opt-in prop; the second is
      // simply the shared component's own.
      assert.match(rail.textContent, /Linked game-world Item/);
      assert.doesNotMatch(rail.textContent, /crafting systems/);
      assert.match(rail.textContent, /Effective rules/i);
    });

    it('pages `Required for` rather than printing a dead `and n more` sentence', async () => {
      const scope = scopeFor();
      const entry = scope.entries.find((candidate) => candidate.id === 'pick');
      entry.requiredBy = Array.from({ length: 7 }, (_, index) => ({
        id: `recipe-${index}`,
        name: `Recipe ${index}`,
        kind: 'recipe',
        systemId: 'sys-forge',
      }));
      const target = await mountTab({ scope });
      const region = target.querySelector('[data-tool-required-for]');
      assert.equal(
        region.querySelectorAll('[data-tool-required-row]').length,
        4,
        'the window is four rows deep in a 300px column'
      );
      assert.ok(
        Boolean(region.querySelector('.manager-pagination')),
        'and the overflow is a pager rather than a sentence with nothing behind it'
      );
      assert.doesNotMatch(region.textContent, /more$/);
    });

    it('names the empty case without an unresolvable {system} token', async () => {
      const scope = scopeFor();
      scope.entries.find((candidate) => candidate.id === 'pick').requiredBy = [];
      const target = await mountTab({ scope });
      // The shared component's own empty hint interpolates a SYSTEM name, and world scope has
      // none; `requiredForEmptyText` is the opt-in override rather than a scope test inside it.
      assert.match(
        target.querySelector('[data-tool-required-for-empty]').textContent,
        /Nothing requires this Tool yet\./
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────────────────
  describe('the Breakage tab authors what each on-break mode needs (round 2)', () => {
    const COMPONENTS = [
      { id: 'ingot', name: 'Iron Ingot', img: 'icons/commodities/metal/ingot-worn-iron.webp' },
      {
        id: 'shard',
        name: 'Glass Shard',
        img: 'icons/commodities/materials/glass-shard.webp',
        registeredItemUuid: 'Item.glass-shard',
      },
    ];

    /**
     * Open the Breakage tab with the world rosters wired, as the manager root wires them.
     *
     * @param {object} onBreak The world-default `onBreak` section.
     * @param {object} [extra] Extra mount options, e.g. `actions`.
     * @returns {Promise<HTMLElement>}
     */
    async function mountBreakage(onBreak, extra = {}) {
      return mountTab({
        scope: scopeFor({ onBreak, ...(extra.worldDefault ?? {}) }),
        tab: 'breakage',
        componentOptions: COMPONENTS,
        ...extra,
      });
    }

    // ── 9a ────────────────────────────────────────────────────────────────────────────────
    // The band is the design's own five-step reading of the percentage (`proto:4618`), and the
    // track runs the ramp the SYSTEM editor already renders. An earlier round removed the ramp
    // on the premise that "the design uses a gradient track nowhere", reasoning from its frames
    // rather than from its markup, which styles this exact control with one.
    it('states the break percentage in plain language, and colours the track it labels', async () => {
      const target = await mountTab({
        scope: scopeFor({ breakage: { mode: 'breakageChance', breakageChance: 5 } }),
        tab: 'breakage',
      });
      assert.match(
        target.querySelector('[data-world-tool-entry-chance-band]').textContent,
        /Rarely breaks/
      );
      // The ramp arrives as the shipped token through the shipped control class, so the two
      // scopes cannot disagree about it and the seven themes keep their own.
      assert.ok(
        Boolean(target.querySelector('.manager-tool-breakage-chance-control')),
        'the slider wears the control class that carries the ramp token'
      );
    });

    it('moves the band with the value, and names the unbreakable case separately', async () => {
      for (const [breakageChance, expected] of [
        [0, /Unbreakable/],
        [22, /Breaks now and then/],
        [45, /Breaks often/],
        [90, /Breaks almost every use/],
      ]) {
        const target = await mountTab({
          scope: scopeFor({ breakage: { mode: 'breakageChance', breakageChance } }),
          tab: 'breakage',
        });
        assert.match(
          target.querySelector('[data-world-tool-entry-chance-band]').textContent,
          expected,
          `${breakageChance}% reads as its own band`
        );
      }
    });

    // ── 9d ────────────────────────────────────────────────────────────────────────────────
    it('offers a REPLACEMENT COMPONENT drop zone when nothing is chosen', async () => {
      const target = await mountBreakage({ mode: 'replaceWith' });
      const card = target.querySelector('[data-tool-replacement-target]');
      assert.ok(Boolean(card), 'the card renders for the mode that needs it');
      assert.equal(card.dataset.toolReplacementDrop, undefined);
      const zone = card.querySelector('[data-tool-replacement-drop]');
      assert.ok(Boolean(zone), 'the empty face is a drop target');
      assert.match(zone.textContent, /Drop a managed Component here/);
      assert.match(zone.textContent, /Click to search/);
    });

    it('draws the chosen Component, its source and an unlink once one is attached', async () => {
      const target = await mountBreakage({
        mode: 'replaceWith',
        replacementTarget: { type: 'component', componentId: 'ingot' },
      });
      const card = target.querySelector('[data-tool-replacement-target]');
      assert.equal(
        card.querySelector('[data-tool-replacement-tile]').dataset.toolReplacementTile,
        'ingot'
      );
      assert.match(card.textContent, /Iron Ingot/);
      assert.match(
        card.querySelector('[data-tool-replacement-source]').textContent,
        /A Component in the world catalogue/
      );
      assert.ok(
        Boolean(card.querySelector('[data-tool-replacement-unlink]')),
        'a chosen Component can be cleared without picking another'
      );
      assert.ok(!card.querySelector('[data-tool-replacement-drop]'), 'the empty face is gone');
    });

    // ── E2 ────────────────────────────────────────────────────────────────────────────────
    // THE FILLED FACE IS THE DESIGN'S TILE, NOT A SELECT (issue 1373, maintainer round 2).
    //
    // `proto:2205`-`2208` draws one row holding the chip, a two-line block whose second line is
    // the SOURCE, and a 30px unlink. It shipped as a full-width picker button with a chevron,
    // the unlink outside it and the source under the whole row — which reads as a form control
    // where the design reads as a card.
    //
    // ASSERTED ON STRUCTURE, not on the CSS, because the CSS is what a mounted suite cannot
    // compute: what a rule can move is where an element SITS, and every claim below is about
    // containment or absence.
    it('makes the tile itself the picker trigger, with the source as its second line', async () => {
      const target = await mountBreakage({
        mode: 'replaceWith',
        replacementTarget: { type: 'component', componentId: 'ingot' },
      });
      const tile = target.querySelector('[data-tool-replacement-tile]');
      const trigger = tile.querySelector('.manager-tool-replacement-component-trigger');
      assert.ok(Boolean(trigger), 'the tile holds the trigger the Foundry smoke clicks');
      assert.match(
        trigger.textContent,
        /Iron Ingot/,
        "the smoke asserts the trigger's OWN text contains the label it picked"
      );

      // THE SOURCE IS A LINE INSIDE THE TRIGGER, under the name. Before, it was a paragraph
      // BELOW the whole row — so this is the assertion the reshape exists to satisfy, and it
      // is stated through the trigger rather than through the card so it cannot pass on a
      // source that has fallen back outside the tile.
      const meta = trigger.querySelector('[data-popover-trigger-meta]');
      assert.ok(Boolean(meta), 'the source is the trigger meta line');
      assert.equal(meta.textContent.trim(), 'A Component in the world catalogue');

      // AND THE UNLINK IS A SIBLING OF THE TRIGGER. A button inside a button is dropped by the
      // browser and the picker stops opening, so the nesting is the defect this guards.
      const unlink = tile.querySelector('[data-tool-replacement-unlink]');
      assert.ok(Boolean(unlink), 'the unlink is inside the tile');
      assert.ok(
        !trigger.contains(unlink),
        'and OUTSIDE the trigger button, so neither swallows the other'
      );
      assert.ok(
        !trigger.querySelector('.fa-chevron-down, .fa-chevron-up'),
        'a tile carries no select chevron'
      );
    });

    // THE DROP RESOLVES PURELY, against the option list the caller passed. Both Tool editors are
    // leaves holding no Foundry global, so this is the only answer available to them — and a
    // payload naming something world scope cannot address must write NOTHING rather than store
    // an id no reader resolves.
    it('resolves a dropped Foundry Item onto the managed Component it IS, and buffers the write', async () => {
      const writes = [];
      const target = await mountBreakage(
        { mode: 'replaceWith' },
        {
          actions: {
            updateWorldDefaultSection: (id, section, value) => {
              writes.push([id, section, value]);
              return true;
            },
          },
        }
      );
      const zone = target.querySelector('[data-tool-replacement-drop]');
      const drop = new Event('drop', { bubbles: true, cancelable: true });
      drop.dataTransfer = {
        getData: () => JSON.stringify({ type: 'Item', uuid: 'Item.glass-shard' }),
      };
      zone.dispatchEvent(drop);
      await tick();

      assert.deepEqual(writes, [], 'nothing is persisted before the flush');
      await flushDraft();
      assert.deepEqual(writes, [
        [
          'pick',
          'onBreak',
          { mode: 'replaceWith', replacementTarget: { type: 'component', componentId: 'shard' } },
        ],
      ]);
    });

    it('writes nothing for a drop naming something this scope cannot address', async () => {
      const writes = [];
      const target = await mountBreakage(
        { mode: 'replaceWith' },
        {
          actions: {
            updateWorldDefaultSection: (id, section, value) => {
              writes.push([id, section, value]);
              return true;
            },
          },
        }
      );
      const zone = target.querySelector('[data-tool-replacement-drop]');
      const drop = new Event('drop', { bubbles: true, cancelable: true });
      drop.dataTransfer = {
        getData: () => JSON.stringify({ type: 'Item', uuid: 'Item.not-managed' }),
      };
      zone.dispatchEvent(drop);
      await tick();
      await flushDraft();
      assert.deepEqual(writes, [], 'an unmanaged Item names no Component here');
      assert.ok(
        Boolean(target.querySelector('[data-tool-replacement-drop]')),
        'and the zone stays empty rather than showing a tile for nothing'
      );
    });

    // ── 9c ────────────────────────────────────────────────────────────────────────────────
    // WORLD SCOPE CAN NAME COMPONENTS, which is the whole question this control turns on.
    // `toolScope.js` recorded that a repair group "names ingredient quantities over the OWNING
    // SYSTEM's components, which world scope cannot address" — true before epic 1357 gave the
    // world its own component catalogue, and not true now: a world component id IS the id a
    // membership record carries.
    it('authors the repair route for a marked-broken Tool, over WORLD components', async () => {
      const target = await mountBreakage(
        { mode: 'flagBroken' },
        {
          worldDefault: {
            repairRequirements: [
              {
                id: 'g1',
                options: [{ quantity: 1, match: { type: 'component', componentId: 'ingot' } }],
              },
            ],
          },
        }
      );
      const editor = target.querySelector('[data-tool-repair-requirements]');
      assert.ok(Boolean(editor), 'the repair editor renders for the mode that needs it');
      assert.match(
        editor.textContent,
        /Iron Ingot/,
        'and names the world Component the seed holds'
      );
      // THE SEED SENTENCE. A world repair list is copied on adoption and never read back, so the
      // screen must say what authoring it reaches — the removed `REPAIR MATERIALS` card's failure
      // was offering a write whose consequence it could not state.
      assert.match(
        target.querySelector('[data-world-tool-entry-repair-note]').textContent,
        /copied into a crafting system the moment that system adopts this Tool/
      );
    });

    // ── E4 ────────────────────────────────────────────────────────────────────────────────
    // ONE HEADING WITH A COUNT, AND THE DESIGN'S EXPLAINER (issue 1373, maintainer round 2).
    // It had two heading levels — an uppercase `REPAIR MATERIALS` over a serif `Ingredient
    // groups` — and an explainer stating the AND/OR algebra the groups already draw.
    it('heads the repair set once, with a count, and explains what the set is for', async () => {
      const target = await mountBreakage(
        { mode: 'flagBroken' },
        {
          worldDefault: {
            repairRequirements: [
              {
                id: 'g1',
                options: [{ quantity: 1, match: { type: 'component', componentId: 'ingot' } }],
              },
              {
                id: 'g2',
                options: [{ quantity: 2, match: { type: 'component', componentId: 'ingot' } }],
              },
            ],
          },
        }
      );
      const editor = target.querySelector('[data-tool-repair-requirements]');
      assert.equal(
        editor.querySelectorAll('.manager-tool-repair-heading h3').length,
        0,
        'the second heading level is gone'
      );
      assert.match(editor.querySelector('.manager-kicker').textContent, /Repair requirements/);
      assert.equal(
        editor.querySelector('[data-tool-repair-count]').textContent.trim(),
        '2 requirements',
        "the design states the set's size beside its eyebrow"
      );
      const hint = editor.querySelector('[data-tool-repair-hint]');
      assert.match(hint.textContent, /One ingredient set, no recipe needed/);
      assert.match(hint.textContent, /consumed to mend a broken copy/);
      assert.equal(
        hint.querySelector('.manager-tool-repair-or').textContent,
        'or…',
        'and emphasises the control it tells the GM to reach for'
      );
    });

    // THE COUNT'S EMPTY FACE, which is a different word rather than a zero: `none yet`.
    it('states `none yet` when the repair set is empty', async () => {
      const target = await mountBreakage({ mode: 'flagBroken' });
      assert.equal(
        target.querySelector('[data-tool-repair-count]').textContent.trim(),
        'none yet'
      );
    });

    // THE CHOICE-GROUP NOTE IS THE REPAIR SENTENCE, not the recipe editor's enumeration of the
    // four kinds a crafter may pick between. One prop, defaulted to the shipped copy, so no
    // recipe or downtime call site moves.
    it('tells a repair choice group what picking one of its options DOES', async () => {
      const target = await mountBreakage(
        { mode: 'flagBroken' },
        {
          worldDefault: {
            repairRequirements: [
              {
                id: 'g1',
                options: [
                  { quantity: 1, match: { type: 'component', componentId: 'ingot' } },
                  { quantity: 1, match: { type: 'component', componentId: 'ingot' } },
                ],
              },
            ],
          },
        }
      );
      const note = target.querySelector(
        '[data-tool-repair-requirements] .manager-recipe-any-one-of-hint'
      );
      assert.ok(Boolean(note), 'a two-option group draws the `Any one of` head');
      assert.equal(note.textContent.trim(), 'any one of these mends it');
    });

    // IMMEDIATE, NOT BUFFERED, and that is forced rather than chosen: `repairRequirements` is not
    // in `TOOL_SECTIONS`, so `scopedEntryWrites` refuses the key and a Save would drop the edit
    // without saying so. `setWorldRepairRequirements` is its own action for that reason.
    it('writes the repair route through its own action, immediately', async () => {
      const repairWrites = [];
      const sectionWrites = [];
      const target = await mountBreakage(
        { mode: 'flagBroken' },
        {
          actions: {
            setWorldRepairRequirements: (id, groups) => {
              repairWrites.push([id, groups]);
              return true;
            },
            updateWorldDefaultSection: (id, section, value) => {
              sectionWrites.push([id, section, value]);
              return true;
            },
          },
        }
      );
      target
        .querySelector('[data-tool-repair-requirements] [data-recipe-add="tag-requirement"]')
        .click();
      await tick();

      assert.equal(repairWrites.length, 1, 'the seed action fires on change');
      assert.equal(repairWrites[0][0], 'pick');
      assert.equal(repairWrites[0][1].length, 1, 'and carries the new group');
      assert.deepEqual(
        sectionWrites,
        [],
        'the seed must not travel through the section write path, which would refuse its name'
      );
    });

    it('renders neither control for destroy-on-break, which takes no argument', async () => {
      const target = await mountBreakage({ mode: 'destroy' });
      assert.ok(!target.querySelector('[data-tool-replacement-target]'));
      assert.ok(!target.querySelector('[data-tool-repair-requirements]'));
    });
  });
});
