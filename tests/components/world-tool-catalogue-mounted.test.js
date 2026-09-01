/**
 * The world Tools Catalogue, mounted (issue 1373, epic 1357).
 *
 * ## What this is FOR, and why an essence-shaped shell would have shipped past it
 *
 * `src/migration/worldScopeEntityGrouping.js` lifts SIX identity fields for a component and a
 * tool - name, img, description, and the three source-Item links - and only FOUR for an
 * essence, with no link among them. A catalogue built against the essence shape renders a row
 * that looks entirely correct and silently drops the affordance a tool needs most: which
 * game-world Item this record is, and the flag for a record that names none.
 *
 * So both states are asserted from the REAL projection rather than a hand-built `scope`. That
 * matters: `hasSourceLink` is answered inside `buildEntry`, beside the ONE list of source-link
 * field names, and a fixture that stamped the flag itself would go on passing after a rename
 * while every real row started reporting itself unlinked.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
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
    ...TOOL_TREE_RAW_MODULES,
    ...WORLD_TOOL_SCOPE_RAW_MODULES,
    // THE DROP ZONE'S TWO LEAVES (issue 1373). The catalogue now renders `ItemDropZone`, whose
    // `use:dragDrop` action and `resolveDropUuid` helper are ordinary modules: a compiled child
    // missing from this list does not fail loudly, it HANGS, and `node --test` reports the
    // whole suite as `# cancelled` with no message.
    'src/ui/svelte/actions/dragDrop.js',
    'src/ui/svelte/util/dropUtils.js',
    // The list model this page's rows, pager and bulk bar are derived from.
    'src/utils/browserPagination.js',
    'src/utils/bulkSelectionModel.js',
    'src/utils/scopedEntityListModel.js',
  ],
  compiledModules: [
    ...TOOL_TREE_COMPILED_MODULES,
    'src/ui/svelte/apps/manager/ArmedDangerButton.svelte',
    'src/ui/svelte/apps/manager/BulkSelectionToolbar.svelte',
    'src/ui/svelte/apps/manager/Callout.svelte',
    'src/ui/svelte/apps/manager/EmptyState.svelte',
    'src/ui/svelte/apps/manager/InspectorActionButton.svelte',
    'src/ui/svelte/apps/manager/ItemDropZone.svelte',
    'src/ui/svelte/apps/manager/scoped/WorldToolCataloguePage.svelte',
    'src/ui/svelte/apps/manager/scoped/EntityCatalogueShell.svelte',
    'src/ui/svelte/apps/manager/scoped/EntityListInspectorFrame.svelte',
    'src/ui/svelte/apps/manager/scoped/MembershipActions.svelte',
    // THE `SYSTEM RULES n / m` PANEL, extracted out of the shell's inspector snippet (issue
    // 1372). The shell composes it, so it is in this tree's static graph.
    'src/ui/svelte/apps/manager/scoped/SystemRulesRoster.svelte',
    // The design-system primitives the frame and the roster render (issues 1422 and 1040): the
    // row's icon action, and the membership cluster's on/off switch. A rendered `.svelte` the
    // harness omits HANGS this suite rather than failing it.
    'src/ui/svelte/components/IconButton.svelte',
    'src/ui/svelte/components/StatusToggle.svelte',
    // THE CARD SHELL the world break-mode card is now written as (issue 1427), and THE BROWSE
    // BAR AND ITS FIELD the list frame is now written as (issue 1039). All three arrived by
    // conversion rather than by new markup, which is exactly the case this list exists for: the
    // tree renders the same pixels and the suite would have HUNG as `# cancelled` rather than
    // failing had they been omitted.
    'src/ui/svelte/components/InspectorCard.svelte',
    'src/ui/svelte/components/ManagerSearchField.svelte',
    'src/ui/svelte/components/ManagerToolbar.svelte',
    // THE MEMBERSHIP FILTER IS A SEGMENTED TRACK NOW (issue 1373), not a `<select>`: one filter
    // asking the same question as the system Tool Rules screen's, drawn the same way.
    'src/ui/svelte/apps/manager/SegmentedControl.svelte',
    'src/ui/svelte/components/Medallion.svelte',
    'src/ui/svelte/components/Pagination.svelte',
    'src/ui/svelte/components/SelectionCheckbox.svelte',
    'src/ui/svelte/components/StatusPill.svelte',
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

    const orphan = target.querySelector('[data-scoped-list-row="orphan"] [data-scoped-list-source]');
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
    // The labelled action is the design's, and it was also the idiom our own system Tool Rules
    // screen already used — so the two list screens disagreed with each other as well as with it.
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
    // AND THE BULK SELECTION SURVIVES IT, which is the distinction that makes this safe: the
    // ruled-in `All` box and the per-row checkboxes are a different control from the filter.
    assert.ok(Boolean(target.querySelector('[data-scoped-list-select-all-page]')), 'select-all');
    assert.ok(Boolean(target.querySelector('[data-scoped-list-select="hammer"]')), 'row box');
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
    // IT IS NOT A ROW. Every row affordance below it — selection, inspection, the entry action —
    // would be a lie on a drop target, so it sits outside the `<ul>`.
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
    // THE ENTRY EDITOR DRAWS THAT LABEL AS OPTIONAL (issue 1373's parity round), so a blank is a
    // real authored state and the row has to answer it the same way the editor does. Without the
    // frame's `nameEntry` rung the row prints the record id under a screen that promised the
    // Item's name would stand in.
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
      segments.filter((segment) => segment.classList.contains('is-selected')).map(
        (segment) => segment.dataset.worldToolBreakSegment
      ),
      ['checkDriven']
    );
  });

  it('selects NEITHER option when the world has authored nothing', async () => {
    const target = await harness.mount({ scope: scopeFor(), systems: SYSTEMS, actions: {} });
    assert.deepEqual(
      [...target.querySelectorAll('[data-world-tool-break-segment].is-selected')].map(
        (segment) => segment.dataset.worldToolBreakSegment
      ),
      [],
      'an unauthored world value is not the same as an authored toolSpecific, and drawing one ' +
        'as current is how a GM mints a value they never chose'
    );
  });

  it('states NO override count when the roster cannot answer one', async () => {
    // THE ROSTER THIS PAGE RECEIVES IS `$viewState.systems`, a hand-built allowlist in
    // `adminStore.js` that carries no `toolBreakage`. Answering `0` off an absent field reads
    // as "nothing overrides it" and is a WRONG number rather than a missing one, so the line
    // is withheld. This assertion is the gate on that decision: it reds the day the roster
    // starts carrying the field and the line is not turned back on.
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
  //
  // The design opens this list with `Drag an Item here to make it a Tool`, and puts NO such
  // zone on the system Tool Rules list. Ours had it exactly inverted. These cases are the
  // BEHAVIOURAL half of the move - the system route's own tests now assert the zone's absence
  // there, and asserting only that would leave the control untested at the moment it moved.
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
      // The common case for module-shipped content, and the one a `data.uuid` guard silently
      // refuses. `ItemDropZone` resolves `{pack, id}` before it decides, so the zone is not
      // stricter than the consumer it feeds.
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
      assert.equal(
        toggle.getAttribute('aria-pressed'),
        'true',
        'ABSENT reads as enabled, so no existing world sees its Tools drawn off'
      );
    });

    it('draws OFF and writes the INVERSE through the tool-family action', async () => {
      const calls = [];
      const target = await harness.mount({
        scope: projectWorldScopeEntity({
          entityType: 'tool',
          corpus: {
            ...corpus(),
            defaults: [
              { id: 'hammer', enabled: false, breakage: { mode: 'limitedUses', maxUses: 2 } },
              { id: 'orphan' },
            ],
          },
          systems: SYSTEMS,
        }),
        systems: SYSTEMS,
        actions: { setWorldEnabled: (id, enabled) => calls.push([id, enabled]) },
      });
      const toggle = target.querySelector('[data-world-tool-row-enabled="hammer"]');
      assert.equal(toggle.getAttribute('aria-pressed'), 'false');
      toggle.click();
      assert.deepEqual(calls, [['hammer', true]], 'the click writes the OPPOSITE of what is drawn');
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
});
