/** The world Tools Catalogue, mounted (issue 1373, epic 1357). */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chooseSelectOption } from '../helpers/select-control.js';
import {
  SEARCHABLE_POPOVER_RAW_MODULES,
  SELECT_COMPILED_MODULES,
  createMountedComponentHarness,
} from '../helpers/svelte-component-harness.js';
import { dispatchDrop, dispatchRejectedDrops } from '../helpers/dropPayloads.js';
import {
  TOOL_TREE_COMPILED_MODULES,
  TOOL_TREE_RAW_MODULES,
  WORLD_TOOL_SCOPE_RAW_MODULES,
} from '../helpers/toolMountModules.js';
import { projectWorldScopeEntity } from '../../src/ui/svelte/stores/worldScopeProjection.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-world-tool-catalogue-',
  componentPath: 'src/ui/svelte/apps/manager/scoped/WorldToolCataloguePage.svelte',
  rawModules: [
    // Issue 1504: the raw closure the shared `<Select>` reaches through `SearchablePopover`.
    ...SEARCHABLE_POPOVER_RAW_MODULES,
    ...TOOL_TREE_RAW_MODULES,
    ...WORLD_TOOL_SCOPE_RAW_MODULES,
    // THE DROP ZONE'S TWO LEAVES (issue 1373). The catalogue now renders `ItemDropZone`.
    'src/ui/svelte/actions/dragDrop.js',
    'src/ui/svelte/util/dropUtils.js',
    // The list model this page's rows, pager and bulk bar are derived from.
    'src/utils/browserPagination.js',
    'src/utils/bulkSelectionModel.js',
    'src/utils/scopedEntityListModel.js',
  ],
  compiledModules: [
    ...TOOL_TREE_COMPILED_MODULES,
    'src/ui/svelte/components/ArmedDangerButton.svelte',
    'src/ui/svelte/apps/manager/BulkSelectionToolbar.svelte',
    // THE BULK PANEL AND THE SHARED CHROME IT COMPOSES (issue 1373, maintainer feedback round 2).
    'src/ui/svelte/apps/manager/BulkEditPanelShell.svelte',
    'src/ui/svelte/apps/manager/BulkEditSection.svelte',
    'src/ui/svelte/apps/manager/scoped/ToolCatalogueBulkPanel.svelte',
    'src/ui/svelte/apps/manager/Callout.svelte',
    'src/ui/svelte/apps/manager/InspectorActionButton.svelte',
    'src/ui/svelte/components/ItemDropZone.svelte',
    'src/ui/svelte/apps/manager/scoped/WorldToolCataloguePage.svelte',
    'src/ui/svelte/apps/manager/scoped/EntityCatalogueShell.svelte',
    'src/ui/svelte/apps/manager/scoped/EntityListInspectorFrame.svelte',
    'src/ui/svelte/apps/manager/scoped/MembershipActions.svelte',
    // THE `SYSTEM RULES n / m` PANEL.
    'src/ui/svelte/apps/manager/scoped/SystemRulesRoster.svelte',
    // The design-system primitives the frame and the roster render (issues 1422 and 1040).
    'src/ui/svelte/components/IconButton.svelte',
    'src/ui/svelte/components/StatusToggle.svelte',
    // THE CARD SHELL the world break-mode card is now written as (issue 1427).
    'src/ui/svelte/components/InspectorCard.svelte',
    'src/ui/svelte/components/ManagerSearchField.svelte',
    'src/ui/svelte/components/ManagerToolbar.svelte',
    // THE MEMBERSHIP FILTER IS A SEGMENTED TRACK NOW (issue 1373), not a `<select>`.
    'src/ui/svelte/apps/manager/SegmentedControl.svelte',
    'src/ui/svelte/components/Medallion.svelte',
    'src/ui/svelte/components/Pagination.svelte',
    // Issue 1504: the shared `<Select>`'s whole compiled closure, spread rather than copied.
    ...SELECT_COMPILED_MODULES,
    'src/ui/svelte/components/SelectionCheckbox.svelte',
  ],
});

const SYSTEMS = [
  { id: 'sys-forge', name: 'Forge' },
  { id: 'sys-alchemy', name: 'Alchemy' },
];

/**
 * A tool world corpus with ONE linked record and ONE that names no source Item.
 *
 * @param {object} [options]
 * @param {object|null} [options.toolBreakage]
 * @returns {object}
 */
function corpus({ toolBreakage = null } = {}) {
  return {
    entities: [
      {
        id: 'hammer',
        name: 'Smith Hammer',
        description: 'A hammer.',
        img: 'icons/tools/smithing/hammer-worn-steel-grey.webp',
        originItemUuid: 'Item.hammer-source',
      },
      { id: 'orphan', name: 'Unlinked Awl', description: 'No Item behind it.' },
    ],
    defaults: [
      { id: 'hammer', breakage: { mode: 'breakageChance', breakageChance: 12 } },
      { id: 'orphan', breakage: { mode: 'limitedUses', maxUses: 3 } },
    ],
    membership: [{ entityId: 'hammer', systemId: 'sys-forge', inherit: {}, enabled: true }],
    ...(toolBreakage ? { toolBreakage } : {}),
  };
}

function scopeFor(options) {
  return projectWorldScopeEntity({
    entityType: 'tool',
    corpus: corpus(options),
    systems: SYSTEMS,
  });
}

describe('world Tools Catalogue (issue 1373)', () => {
  before(async () => {
    await harness.setup();
  });

  after(() => {
    harness.teardown();
  });

  it('flags the record with NO source Item, and says nothing about the ones that have one', async () => {
    // THE EXCEPTION, NOT THE RULE (issue 1373). This asserted a `Linked` badge on every linked
    // row; the design's catalogue carries none, and it is a catalogue whose whole premise is
    // that each record IS a game-world Item — so the badge stated the rule on every row and the
    // one record that resolves to nothing in an inventory looked like all the others.
    const target = await harness.mount({ scope: scopeFor(), systems: SYSTEMS, actions: {} });

    assert.ok(
      !target.querySelector('[data-scoped-list-row="hammer"] [data-scoped-list-source]'),
      'a linked row states no badge: being linked is what every row here is'
    );

    const orphan = target.querySelector(
      '[data-scoped-list-row="orphan"] [data-scoped-list-source]'
    );
    assert.ok(Boolean(orphan), 'the record with no source reference IS flagged');
    assert.equal(
      orphan.getAttribute('data-scoped-list-source'),
      'unlinked',
      'a record with no source reference of its own is FLAGGED rather than omitted: validation ' +
        'has to be able to surface it'
    );
    // AND IT IS IN THE FACT RUN, under the name, which is where the design puts a row's badges.
    assert.ok(
      Boolean(
        target.querySelector(
          '[data-scoped-list-row="orphan"] [data-scoped-list-row-facts] [data-scoped-list-source]'
        )
      ),
      'the flag sits with the rest of the row facts rather than floating in the action column'
    );
  });

  it('offers a LABELLED row action, and NO membership filter at all', async () => {
    // The labelled action is the design's.
    const target = await harness.mount({ scope: scopeFor(), systems: SYSTEMS, actions: {} });

    const action = target.querySelector(
      '[data-scoped-list-row="hammer"] [data-scoped-list-action="open-entry"]'
    );
    assert.ok(Boolean(action), 'the row still offers its entry action');
    assert.match(action.textContent, /Edit tool/, 'and it NAMES the verb and the noun');

    // THE `All / In a system / Unused` TRACK IS GONE (issue 1373's parity round). It sat between
    // the search box and `SORT BY`, the design's toolbar has no such control, and its width was
    // what pushed `Asc` and the result count onto a second row — orphaning the count from the
    // controls it qualifies. `membershipFilter={false}` is the frame's own opt-out, which the
    // essence catalogue already takes for the same reason.
    assert.ok(
      !target.querySelector('[data-scoped-list-membership]'),
      'the extra segmented filter is gone rather than merely narrowed'
    );
    assert.ok(!target.querySelector('select[data-scoped-list-membership]'));
    // AND THE BULK SELECTION SURVIVES IT, which is the distinction that makes this safe.
    assert.ok(Boolean(target.querySelector('[data-scoped-list-select="hammer"]')), 'row box');
    assert.ok(
      !target.querySelector('[data-scoped-list-select-all-page]'),
      'the `All` box still stands in the resting filter row'
    );
    target.querySelector('[data-scoped-list-select="hammer"]').click();
    await harness.setProps({});
    assert.ok(
      Boolean(target.querySelector('[data-scoped-list-select-all-page]')),
      'ticking a row produced no band, so the page control is unreachable from this screen'
    );
  });

  it('opens the LIST with the creation zone, not a band beside the breakage card', async () => {
    const target = await harness.mount({ scope: scopeFor(), systems: SYSTEMS, actions: {} });
    // THE DESIGN PUTS IT UNDER THE TOOLBAR AS THE LIST'S FIRST ELEMENT. It was hoisted out into
    // the band above, sharing a row with the world breakage card and taking a third of its
    // width, so the card that states a world-wide rule never spanned its column.
    const zone = target.querySelector('[data-item-drop-zone="tool-create"]');
    assert.ok(Boolean(zone), 'the catalogue still owns the surface that makes a Tool');
    assert.ok(
      Boolean(zone.closest('[data-scoped-list="world-tools"]')),
      'and it is inside the list rather than a sibling of it'
    );
    assert.ok(
      !zone.closest('[data-world-tool-break-mode]'),
      'the world breakage card no longer shares its row'
    );
    // IT IS NOT A ROW. Every row affordance below it — selection, inspection.
    assert.ok(!zone.closest('li'), 'the zone is not a list item');
  });

  it('resolves a BLANK display label to the linked Item name on the row', async () => {
    const scope = scopeFor();
    const entry = scope.entries.find((candidate) => candidate.id === 'hammer');
    entry.entity = { ...entry.entity, name: '' };
    const target = await harness.mount({
      scope,
      systems: SYSTEMS,
      actions: {},
      worldItems: [{ uuid: entry.entity.originItemUuid, name: 'Smith’s Hammer' }],
    });
    // THE ENTRY EDITOR DRAWS THAT LABEL AS OPTIONAL (issue 1373's parity round).
    assert.match(
      target.querySelector('[data-scoped-list-row="hammer"]').textContent,
      /Smith’s Hammer/
    );
  });

  it('badges each row with the world breakage summary, read under the WORLD break mode', async () => {
    const target = await harness.mount({ scope: scopeFor(), systems: SYSTEMS, actions: {} });
    assert.match(
      target.querySelector('[data-world-tool-row-badges="hammer"]').textContent,
      /12% break/,
      'the badge states what the world default means, not merely that a section exists'
    );
  });

  it('draws TWO break-mode options and selects the AUTHORED one', async () => {
    const target = await harness.mount({
      scope: scopeFor({ toolBreakage: { authority: 'checkDriven' } }),
      systems: SYSTEMS,
      actions: {},
    });
    const segments = [...target.querySelectorAll('[data-world-tool-break-segment]')];
    assert.equal(segments.length, 2, 'the world authors this value, so there is no third option');
    assert.deepEqual(
      segments
        .filter((segment) => segment.classList.contains('is-selected'))
        .map((segment) => segment.dataset.worldToolBreakSegment),
      ['checkDriven']
    );
  });

  it('selects the shipped TOOL-SPECIFIC fallback when the world has authored nothing', async () => {
    const target = await harness.mount({ scope: scopeFor(), systems: SYSTEMS, actions: {} });
    assert.deepEqual(
      [...target.querySelectorAll('[data-world-tool-break-segment].is-selected')].map(
        (segment) => segment.dataset.worldToolBreakSegment
      ),
      ['toolSpecific'],
      'an unauthored world resolves every system to toolSpecific, so the control lights it ' +
        'rather than drawing a mode with neither segment selected'
    );
  });

  it('states NO override count when the roster cannot answer one', async () => {
    // THE ROSTER THIS PAGE RECEIVES IS `$viewState.systems`.
    const target = await harness.mount({ scope: scopeFor(), systems: SYSTEMS, actions: {} });
    assert.ok(
      !target.querySelector('[data-world-tool-break-overrides]'),
      'a roster with no toolBreakage on any system cannot answer the override count'
    );

    const answerable = await harness.mount({
      scope: scopeFor({ toolBreakage: { authority: 'toolSpecific' } }),
      systems: [
        { id: 'sys-forge', name: 'Forge', toolBreakage: { authority: 'checkDriven' } },
        { id: 'sys-alchemy', name: 'Alchemy', toolBreakage: { authority: 'toolSpecific' } },
      ],
      actions: {},
    });
    assert.match(
      answerable.querySelector('[data-world-tool-break-overrides]').textContent,
      /1 system overrides it/,
      'and it counts only the system whose AUTHORED token DIFFERS: a system that authored the ' +
        'same token the world did is unaffected by a world change either way'
    );
  });

  // ── THE CREATION SURFACE MOVED HERE (issue 1373) ───────────────────────────────────────
  describe('the create-from-drop zone', () => {
    it('raises a world-sidebar Item payload to the page owner, RAW', async () => {
      const dropped = [];
      const target = await harness.mount({
        scope: scopeFor(),
        systems: SYSTEMS,
        actions: {},
        onCreateFromItemDrop: (data) => dropped.push(data),
      });
      const zone = target.querySelector('[data-item-drop-zone="tool-create"]');
      assert.ok(Boolean(zone), 'the world catalogue carries the creation zone');

      dispatchDrop(zone, { type: 'Item', uuid: 'Item.hammer' });
      assert.deepEqual(
        dropped,
        [{ type: 'Item', uuid: 'Item.hammer' }],
        'the RAW payload reaches the owner: resolution needs a Foundry seam no page can hold'
      );
    });

    it('raises a COMPENDIUM payload, which carries no `uuid` at all', async () => {
      // The common case for module-shipped content.
      const dropped = [];
      const target = await harness.mount({
        scope: scopeFor(),
        systems: SYSTEMS,
        actions: {},
        onCreateFromItemDrop: (data) => dropped.push(data),
      });
      dispatchDrop(target.querySelector('[data-item-drop-zone="tool-create"]'), {
        type: 'Item',
        pack: 'fabricate.items',
        id: 'pick',
      });
      assert.equal(dropped.length, 1);
      assert.equal(dropped[0].pack, 'fabricate.items');
    });

    it('refuses every non-Item payload', async () => {
      const dropped = [];
      const target = await harness.mount({
        scope: scopeFor(),
        systems: SYSTEMS,
        actions: {},
        onCreateFromItemDrop: (data) => dropped.push(data),
      });
      dispatchRejectedDrops(target.querySelector('[data-item-drop-zone="tool-create"]'));
      assert.equal(dropped.length, 0, 'an Actor, a Macro or a Folder never makes a Tool');
    });
  });

  // ── THE WORLD MASTER SWITCH ON THE ROW (issue 1373) ────────────────────────────────────
  describe('the row master switch', () => {
    it('draws ON for a record that has never authored the flag', async () => {
      const target = await harness.mount({ scope: scopeFor(), systems: SYSTEMS, actions: {} });
      const toggle = target.querySelector('[data-world-tool-row-enabled="hammer"]');
      assert.ok(Boolean(toggle), 'every world tool row carries the switch');
      assert.ok(toggle.classList.contains('fabricate-toggle'), 'the shared switch owns its paint');
      assert.ok(Boolean(toggle.querySelector('.manager-status-toggle-track .manager-status-toggle-knob')));
      assert.equal(
        toggle.getAttribute('aria-pressed'),
        'true',
        'ABSENT reads as enabled, so no existing world sees its Tools drawn off'
      );
    });

    it('reflects both states and writes each inverse without selecting or opening the row', async () => {
      const calls = [];
      const opened = [];
      const enabledScope = scopeFor();
      const disabledCorpus = corpus();
      disabledCorpus.defaults[0].enabled = false;
      const disabledScope = projectWorldScopeEntity({
        entityType: 'tool',
        corpus: disabledCorpus,
        systems: SYSTEMS,
      });
      const target = await harness.mount({
        scope: disabledScope,
        systems: SYSTEMS,
        actions: { setWorldEnabled: (id, enabled) => calls.push([id, enabled]) },
        onOpenEntry: (id) => opened.push(id),
      });
      for (const enabled of [false, true]) {
        await harness.setProps({ scope: enabled ? enabledScope : disabledScope });
        const toggle = target.querySelector('[data-world-tool-row-enabled="hammer"]');
        assert.equal(toggle.getAttribute('aria-pressed'), String(enabled));
        assert.ok(toggle.classList.contains(enabled ? 'is-on' : 'is-off'));
        assert.equal(
          toggle.getAttribute('aria-label'),
          `${enabled ? 'Disable' : 'Enable'} Smith Hammer for every crafting system`
        );
        // The catalogue opens with its first row inspected.
        const inspectedIds = () =>
          [...target.querySelectorAll('[data-scoped-list-row][aria-current="true"]')].map(
            (row) => row.dataset.scopedListRow
          );
        const inspectedBefore = inspectedIds();
        assert.equal(inspectedBefore.length, 1, 'the catalogue did not open with one row inspected');
        toggle.click();
        await harness.setProps({});
        assert.deepEqual(inspectedIds(), inspectedBefore, 'the switch changed which row is inspected');
        assert.equal(target.querySelector('[data-scoped-list-select="hammer"]').checked, false);
      }
      assert.deepEqual(calls, [['hammer', true], ['hammer', false]]);
      assert.deepEqual(opened, [], 'the switch does not activate Edit tool');
    });
  });

  // ── THE MAINTAINER'S FEEDBACK ROUND (issue 1373) ──────────────────────────────────────────

  describe('the scope band sits in the LIST column, not across the whole route', () => {
    // FINDING 2b AND FINDING 6, WHICH ARE ONE STRUCTURE. The page drew the world breakage card as
    // a SIBLING of the shell in its own grid row, which spans the content area edge to edge - so
    // the band stood over the inspector's track as well as the list's, and the inspector started
    // a card's height below the app header bar instead of running the whole route.
    it('renders the breakage card inside the list column and not beside the inspector', async () => {
      const target = await harness.mount({ scope: scopeFor(), systems: SYSTEMS, actions: {} });
      const card = target.querySelector('[data-world-tool-break-mode]');
      assert.ok(Boolean(card), 'the catalogue still authors the world breakage default');
      assert.ok(
        Boolean(card.closest('.manager-scoped-list-column')),
        'the card is outside the list column, so it spans the inspector track as well'
      );
      // AND THE INSPECTOR IS ITS SIBLING TRACK rather than something below the band. A panel that
      // shared an ancestor with the card would be under it in the same column.
      const inspector = target.querySelector('[data-scoped-list-inspector]');
      assert.ok(Boolean(inspector), 'the catalogue renders its own inspector column');
      assert.ok(
        !inspector.closest('.manager-scoped-list-column'),
        'the inspector is inside the list column, so the card above it is still over its track'
      );
    });

    // AND IT SURVIVES AN UNREADABLE CORPUS.
    it('keeps the band on the unavailable branch, where it used to render too', async () => {
      const target = await harness.mount({
        scope: projectWorldScopeEntity({ entityType: 'tool', corpus: null, systems: SYSTEMS }),
        systems: SYSTEMS,
        actions: {},
      });
      assert.ok(
        Boolean(target.querySelector('[data-scoped-list-state="unavailable"]')),
        'the fixture is not on the unavailable branch, so the assertion below is vacuous'
      );
      assert.ok(
        Boolean(target.querySelector('[data-world-tool-break-mode]')),
        'the world breakage card disappeared with an unreadable corpus'
      );
    });
  });

  it('opens with the FIRST shown Tool inspected rather than a resting panel', async () => {
    // Maintainer defect report: the catalogue opened on `Select a Tool` beside a full list, where
    // the world Component catalogue opens inspected. It opts into the shell's `autoSelectFirst`.
    const selected = [];
    const target = await harness.mount({
      scope: scopeFor(),
      systems: SYSTEMS,
      actions: {},
      onSelect: (id) => selected.push(id),
    });
    await harness.setProps({});
    assert.ok(
      !target.querySelector('[data-scoped-list-inspector-state="resting"]'),
      'the inspector is still resting beside a list that has rows'
    );
    const current = target.querySelector('[data-scoped-list-row="hammer"][aria-current="true"]');
    assert.ok(Boolean(current), 'the first row by name (Smith Hammer) is not the inspected one');
    assert.match(
      target.querySelector('[data-scoped-list-inspector]').textContent,
      /Smith Hammer/,
      'the inspector does not describe the auto-selected Tool'
    );
  });

  it('states the TOOL verb at rest, not the page subtitle a second time', async () => {
    // FINDING 2a. The resting inspector read `Nothing selected` over the catalogue's own
    // SUBTITLE - the sentence the header prints a few pixels above it - so on an empty catalogue
    // the one column that could have said what the panel is for repeated the header instead.
    const target = await harness.mount({
      scope: projectWorldScopeEntity({
        entityType: 'tool',
        corpus: { entities: [], defaults: [], membership: [] },
        systems: SYSTEMS,
      }),
      systems: SYSTEMS,
      actions: {},
    });
    const resting = target.querySelector('[data-scoped-list-inspector-state="resting"]');
    assert.ok(Boolean(resting), 'nothing is selected, so the resting panel must render');
    assert.match(resting.textContent, /Select a Tool/);
    assert.match(resting.textContent, /Choose a Tool to inspect its behaviour/);
    assert.ok(
      !resting.textContent.includes('One Tool per game-world Item'),
      'the resting panel still repeats the page subtitle'
    );
  });

  describe('bulk edit', () => {
    /**
     * Tick a row's selection box through its LABEL, which is what a GM clicks.
     *
     * @param {HTMLElement} target the mounted root.
     * @param {string} entityId
     * @returns {void}
     */
    function tick(target, entityId) {
      const input = target.querySelector(`[data-scoped-list-select="${entityId}"]`);
      assert.ok(Boolean(input), `no selection box for ${entityId}`);
      input.click();
    }

    // THE FINDING ITSELF (finding 4). Rows selected, the toolbar counting them.
    it('swaps the inspector to the bulk panel, and the two counts agree', async () => {
      const target = await harness.mount({ scope: scopeFor(), systems: SYSTEMS, actions: {} });
      await harness.setProps({});
      assert.ok(
        !target.querySelector('[data-world-tool-bulk-panel]'),
        'the bulk panel is already on screen before the tick, so the swap below proves nothing'
      );
      assert.ok(
        Boolean(target.querySelector('[data-scoped-tool-open-entry]')),
        'the identity panel is not on screen before the tick, so the swap below proves nothing'
      );
      tick(target, 'hammer');
      tick(target, 'orphan');
      await harness.setProps({});

      const panel = target.querySelector('[data-world-tool-bulk-panel]');
      assert.ok(Boolean(panel), 'the inspector never changed to bulk-edit controls');
      assert.ok(
        Boolean(panel.closest('[data-scoped-list-inspector]')),
        'the panel rendered outside the inspector column it is meant to replace'
      );
      assert.ok(
        !target.querySelector('[data-scoped-tool-open-entry]'),
        'the identity panel is still on screen beside the bulk one'
      );
      assert.match(target.querySelector('[data-world-tool-bulk-count]').textContent, /2 Tools/);
      assert.match(
        target.querySelector('[data-scoped-list-selection-count]').textContent,
        /2 selected/,
        'the toolbar and the panel disagree about how many rows are ticked'
      );
    });

    it('keeps Apply inert until an axis is staged', async () => {
      const target = await harness.mount({ scope: scopeFor(), systems: SYSTEMS, actions: {} });
      tick(target, 'hammer');
      await harness.setProps({});
      assert.equal(
        target.querySelector('[data-world-tool-bulk-apply]').disabled,
        true,
        'a GM can fire a no-op write and read success from it'
      );
      target.querySelector('[data-world-tool-bulk-status-option="off"] input').click();
      await harness.setProps({});
      assert.equal(target.querySelector('[data-world-tool-bulk-apply]').disabled, false);
    });

    it('writes the staged switch to EVERY ticked Tool and then drops the selection', async () => {
      const calls = [];
      const target = await harness.mount({
        scope: scopeFor(),
        systems: SYSTEMS,
        actions: { setWorldEnabled: (id, enabled) => calls.push([id, enabled]) },
      });
      tick(target, 'hammer');
      tick(target, 'orphan');
      await harness.setProps({});
      target.querySelector('[data-world-tool-bulk-status-option="off"] input').click();
      await harness.setProps({});
      target.querySelector('[data-world-tool-bulk-apply]').click();
      // The write is a sequence of awaited store calls.
      for (let i = 0; i < 8; i += 1) await Promise.resolve();
      await harness.setProps({});

      assert.deepEqual(
        calls,
        [
          ['hammer', false],
          ['orphan', false],
        ],
        'the staged instruction did not reach every ticked row'
      );
      assert.ok(
        !target.querySelector('[data-world-tool-bulk-panel]'),
        'the selection survived the write, so twelve rows stay ticked under a panel whose ' +
          'staged axis has reset - which reads as an edit still pending'
      );
    });

    it('clears the selection from the panel header without writing anything', async () => {
      const calls = [];
      const target = await harness.mount({
        scope: scopeFor(),
        systems: SYSTEMS,
        actions: { setWorldEnabled: (id, enabled) => calls.push([id, enabled]) },
      });
      tick(target, 'hammer');
      await harness.setProps({});
      // THE PANEL'S OWN CLEAR, which only works because the frame threads `clearSelection` onto
      // the row context: a lane holds the ticked ids as the array it was rendered with and has no
      // other way back to the set's owner.
      target.querySelector('[data-world-tool-bulk-clear]').click();
      await harness.setProps({});
      assert.ok(
        !target.querySelector('[data-world-tool-bulk-panel]'),
        'the panel header Clear did not reach the frame selection'
      );
      assert.deepEqual(calls, [], 'Clear is not a write');
    });
  });

  it('forwards the chosen world authority to the tool-family write action', async () => {
    const calls = [];
    const target = await harness.mount({
      scope: scopeFor(),
      systems: SYSTEMS,
      actions: { setWorldToolBreakage: (authority) => calls.push(authority) },
    });
    target
      .querySelector('[data-world-tool-break-segment="checkDriven"] input[type="radio"]')
      .click();
    assert.deepEqual(calls, ['checkDriven']);
  });

  /** ── THE TOOLBAR, WHICH NOTHING HAD EVER LOOKED AT (issue 1373) ─────────────────────────── */
  describe('the filter, sort and direction controls (issue 1373)', () => {
    /**
     * The row ids currently on the page, in the order they are drawn.
     *
     * @param {HTMLElement} target
     * @returns {string[]}
     */
    function rowIds(target) {
      return [...target.querySelectorAll('[data-scoped-list-row]')].map((row) =>
        row.getAttribute('data-scoped-list-row')
      );
    }

    /**
     * Type into the toolbar's search box.
     *
     * @param {HTMLElement} target
     * @param {string} value
     * @returns {Promise<void>}
     */
    async function search(target, value) {
      const input = target.querySelector('[data-scoped-list-search]');
      assert.ok(Boolean(input), 'the toolbar still carries a search box');
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await harness.setProps({});
    }

    /**
     * Choose a sort key from the toolbar's select.
     *
     * @param {HTMLElement} target
     * @param {string} value
     * @returns {Promise<void>}
     */
    async function sortBy(target, value) {
      // Issue 1504: the sort key is a shared `<Select>`.
      chooseSelectOption(target, '[data-scoped-list-sort]', value);
      await harness.setProps({});
    }

    it('narrows the list as a GM types, and says so in the count', async () => {
      const target = await harness.mount({ scope: scopeFor(), systems: SYSTEMS, actions: {} });
      assert.deepEqual(rowIds(target).sort(), ['hammer', 'orphan']);
      assert.match(
        target.querySelector('[data-scoped-list-count]').textContent,
        /2 of 2 tools/,
        'the resting count states the filtered set against the corpus'
      );

      await search(target, 'awl');
      assert.deepEqual(rowIds(target), ['orphan'], 'the search reaches the rows');
      assert.match(
        target.querySelector('[data-scoped-list-count]').textContent,
        /1 of 2 tools/,
        'and the count says how many the filter is hiding, which is the pair it exists for'
      );
    });

    it('draws the filtered-to-nothing hero, and its Clear filters puts the list back', async () => {
      const target = await harness.mount({ scope: scopeFor(), systems: SYSTEMS, actions: {} });
      await search(target, 'nothing matches this');

      const hero = target.querySelector('[data-scoped-list-state="filtered"]');
      assert.ok(Boolean(hero), 'a search matching nothing states WHY the list is empty');
      assert.ok(
        !target.querySelector('[data-scoped-list-state="empty"]'),
        'and it is the filtered hero, not the `No Tools yet` one - the catalogue is not empty'
      );

      const clear = target.querySelector('[data-scoped-list-clear-filters]');
      assert.ok(Boolean(clear), 'and it offers the one action that resolves the state');
      clear.click();
      await harness.setProps({});
      assert.deepEqual(rowIds(target).sort(), ['hammer', 'orphan'], 'Clear filters is wired');
      assert.equal(
        target.querySelector('[data-scoped-list-search]').value,
        '',
        'and it empties the box a GM would otherwise have to clear by hand'
      );
    });

    it('reorders on BOTH non-default keys and on the direction, glyph included', async () => {
      const target = await harness.mount({ scope: scopeFor(), systems: SYSTEMS, actions: {} });
      const direction = target.querySelector('[data-scoped-list-direction]');

      assert.deepEqual(rowIds(target), ['hammer', 'orphan'], 'name ascending');
      assert.equal(direction.getAttribute('data-scoped-list-direction'), 'asc');
      const ascendingGlyph = direction.querySelector('i').className;

      direction.click();
      await harness.setProps({});
      assert.deepEqual(rowIds(target), ['orphan', 'hammer'], 'name descending');
      assert.match(direction.textContent, /Desc/);
      // THE GLYPH TURNS WITH IT. `proto:1971` binds this icon to a per-direction value.
      assert.notEqual(
        direction.querySelector('i').className,
        ascendingGlyph,
        'the direction glyph is the same in both positions'
      );

      direction.click();
      await harness.setProps({});
      await sortBy(target, 'systems');
      // `orphan` is in no system and `hammer` is in one.
      assert.deepEqual(rowIds(target), ['orphan', 'hammer'], 'fewest systems first');
      target.querySelector('[data-scoped-list-direction]').click();
      await harness.setProps({});
      assert.deepEqual(rowIds(target), ['hammer', 'orphan'], 'most systems first');
    });

    it('goes INERT, visibly, against the lane sort that owns its own whole order', async () => {
      const target = await harness.mount({ scope: scopeFor(), systems: SYSTEMS, actions: {} });
      assert.equal(
        target.querySelector('[data-scoped-list-direction]').disabled,
        false,
        'the toggle is live against a built-in key'
      );

      await sortBy(target, 'break-asc');
      const direction = target.querySelector('[data-scoped-list-direction]');
      // A lane descriptor supplies ONE `compare`, not a pair.
      assert.equal(direction.disabled, true, 'the toggle states its own inertness');
      assert.ok(Boolean(direction.querySelector('span').textContent.trim()), 'and keeps its label');
      assert.deepEqual(
        rowIds(target),
        ['hammer', 'orphan'],
        'the lane order is what the list is actually in'
      );
    });
  });
});
