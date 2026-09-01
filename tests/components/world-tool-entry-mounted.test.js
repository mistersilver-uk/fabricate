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
    'src/ui/svelte/components/ChanceSlider.svelte',
    'src/ui/svelte/components/Stepper.svelte',
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
  onCopySourceUuid = () => {},
  onUnlinkSource = () => {},
}) {
  draftHandle = null;
  reportedIdentities = [];
  reportedDirty = [];
  const target = await harness.mount({
    scope,
    actions,
    entityId: 'pick',
    worldItems,
    prerequisiteOptions,
    onSourceDrop,
    onCopySourceUuid,
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
      // THE COUNT IS ON SCREEN BEFORE THE CLICK. There is no confirmation on a world-scope
      // write - every field here persists on change - so the consequence has to be readable
      // beside the control rather than after it.
      assert.match(
        card.querySelector('[data-world-tool-entry-enabled-reach]').textContent,
        /2 crafting systems have this Tool and lose it while this is off\./
      );
    });

    it('pluralises the reach for a single member', async () => {
      const target = await mountTab({ scope: scopeFor({}, 1) });
      assert.match(
        target.querySelector('[data-world-tool-entry-enabled-reach]').textContent,
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
      assert.equal(
        reportedIdentities.at(-1)?.description,
        'A pick.',
        'the report carries the editor’s whole buffered identity, not the edited field alone'
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

      const card = target.querySelector('[data-world-tool-entry-card="delete"]');
      assert.ok(Boolean(card), 'Delete is a card on the Overview tab, beside its stated reach');
      assert.match(
        card.querySelector('[data-world-tool-entry-delete-note]').textContent,
        /2 crafting systems that have it/,
        'the reach a GM cannot recover afterwards has to be beside the control'
      );
      card.querySelector(':scope button').click();
      card.querySelector(':scope button').click();
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
      assert.ok(Boolean(zone.querySelector('[data-tool-source-copy-uuid]')), 'copy uuid');
      assert.ok(Boolean(zone.querySelector('[data-world-tool-entry-source-unlink]')), 'unlink');
      // THE DESCRIPTION IS THE ITEM'S, not the world record's: the projection's entity says
      // `A pick.` and the live Item says otherwise, so a card reading the record would show the
      // wrong one here.
      assert.match(
        target.querySelector('[data-world-tool-entry-source-description]').textContent,
        /A sturdy iron pick\./
      );
    });

    it('routes copy, unlink and a replacement drop through their named callbacks', async () => {
      const calls = [];
      const target = await mountTab({
        scope: scopeFor(),
        worldItems: [LINKED_ITEM],
        onCopySourceUuid: (uuid) => calls.push(['copy', uuid]),
        onUnlinkSource: () => calls.push(['unlink']),
        onSourceDrop: (data) => calls.push(['drop', data.uuid]),
      });

      target.querySelector('[data-tool-source-copy-uuid]').click();
      target.querySelector('[data-world-tool-entry-source-unlink]').click();
      const zone = target.querySelector('[data-tool-source-card]');
      dispatchDrop(zone, { type: 'Item', uuid: 'Item.replacement' });

      assert.deepEqual(calls, [['copy', 'Item.pick'], ['unlink'], ['drop', 'Item.replacement']]);

      // The document-type check is what keeps an Actor or a Macro out of a Tool's source link,
      // and the widened uuid guard is what lets a compendium `{pack, id}` drag through.
      dispatchRejectedDrops(zone);
      assert.equal(calls.filter(([kind]) => kind === 'drop').length, 1);
      dispatchDrop(zone, { type: 'Item', pack: 'fabricate.items', id: 'legacy' });
      assert.equal(calls.filter(([kind]) => kind === 'drop').length, 2);
    });

    it('offers a LINKING prompt, and no copy or unlink, for a record with no source', async () => {
      const scope = scopeFor();
      const entry = scope.entries.find((candidate) => candidate.id === 'pick');
      entry.entity = { ...entry.entity, originItemUuid: '', registeredItemUuid: '' };
      entry.hasSourceLink = false;

      const target = await mountTab({ scope });

      assert.ok(!target.querySelector('[data-tool-source-copy-uuid]'), 'nothing to copy');
      assert.ok(!target.querySelector('[data-world-tool-entry-source-unlink]'), 'nothing to cut');
      assert.ok(!target.querySelector('[data-world-tool-entry-source-description]'));
      // THE COPY MATCHES THE CONTROLS. It used to promise `name, art and description are
      // authored here` on a screen with no art control and no colour control; the art comes
      // from the linked Item and there is nothing to author it with, so the hint says that.
      const hint = target.querySelector('[data-world-tool-entry-unlinked]').textContent;
      assert.match(hint, /name and description/);
      assert.match(hint, /art comes from the linked Item/);
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
      const rules = [...target.querySelectorAll('[data-world-tool-entry-preview-rule]')].map(
        (row) => row.dataset.worldToolEntryPreviewRule
      );
      assert.ok(rules.includes('prerequisites'), 'the character gate is stated');
      assert.ok(rules.includes('bonus'), 'and so is the check bonus');
      const text = target.querySelector('[data-world-tool-entry-preview]').textContent;
      assert.match(text, /1 prerequisite/);
      assert.match(text, /Adds @prof/);
    });
  });
});
