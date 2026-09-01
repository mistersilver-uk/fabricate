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

import { dispatchDrop, dispatchRejectedDrops } from '../helpers/dropPayloads.js';
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
      assert.ok(Boolean(descriptor), 'the page reported no delete action, so no header can draw one');
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

    it('states the inherit count for BOTH new sections, before an edit lands', async () => {
      const target = await mountTab({ scope: scopeFor(), tab: 'requirements' });
      for (const section of ['prerequisites', 'bonus']) {
        assert.match(
          target.querySelector(`[data-world-tool-entry-inherit-count="${section}"]`).textContent,
          /2 crafting systems inherit this world default today\./,
          `${section} states its reach`
        );
      }
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
      assert.ok(Boolean(rail.querySelector('[data-tool-preview-gate]')), 'the gate line is a panel');
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
});
