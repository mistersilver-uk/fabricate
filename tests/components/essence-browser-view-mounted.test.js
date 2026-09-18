/**
 * `EssenceBrowserView` mounted, in isolation (issue 1036).
 * Two things are proved here that the manager-root suite cannot: the browser's own
 * multi-select contract — instantiated as the THIRD studio through the shared
 * `browserBulkSelectionCases.js` rather than copied a third time — and the row/card state
 * vocabulary, which the delta requires to be IDENTICAL across the list and grid
 * presentations because a presentation toggle must not silently remove state.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import {
  SEARCHABLE_POPOVER_RAW_MODULES,
  SELECT_COMPILED_MODULES,
  createMountedComponentHarness,
} from '../helpers/svelte-component-harness.js';
import { chipToneOf } from '../helpers/chipTone.js';
import { describeBrowserBulkSelection } from '../helpers/browserBulkSelectionCases.js';
import { createEssenceBrowserState } from '../../src/utils/essenceBrowserModel.js';
import { makeEssenceRow } from '../helpers/makeEssenceRow.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-essence-browser-',
  rawModules: [
    // Issue 1504: the raw closure the shared `<Select>` reaches through `SearchablePopover`.
    ...SEARCHABLE_POPOVER_RAW_MODULES,
    'src/ui/svelte/util/foundryBridge.js',
    'src/ui/svelte/util/listReorderAnnouncement.js',
    'src/ui/svelte/util/managerColorTokens.js',
    'src/utils/essenceBrowserModel.js',
    'src/utils/essenceBulkEditModel.js',
    'src/utils/bulkSelectionModel.js',
    'src/utils/browserGroupCounts.js',
    'src/utils/browserPagination.js',
    'src/utils/essenceValidation.js',
    'src/ui/svelte/apps/manager/essences/essenceStudio.js',
    // The essence world-scope presentation leaf (issue 1372). `EssenceBrowserView` reads the
    // three-state membership answer and the inherit suffix from it; it imports nothing, so this
    // one entry closes the graph. An omission does not fail this suite, it CANCELS it.
    'src/ui/svelte/apps/manager/scoped/essenceScoped.js',
    // The scope-to-section mapping (issue 1372). `EssenceBrowserView` reads ONE function from it,
    // `scopedSectionLabel`, and unlike `essenceScoped.js` this one is not a leaf: it reaches the
    // world-scope projection, which reaches the scope vocabularies and the grouping migration.
    'src/ui/svelte/apps/manager/scoped/scopedStudio.js',
    'src/systems/toolScope.js',
    'src/ui/svelte/stores/worldScopeProjection.js',
    // Issue 1392 (epic 1357, PR 7a): `worldScopeProjection.js` counts the World Vocabulary's
    // per-entry references now, so its own static closure reaches the vocabulary core and the
    // shipped counter. The harness validates this closure and names the miss, unlike the
    // hand-rolled trees elsewhere.
    'src/systems/worldVocabulary.js',
    'src/utils/vocabularyUsage.js',
    'src/utils/componentCategories.js',
    // #1663: the ONE implementation behind both category shims; imports nothing.
    'src/utils/categoryNormalization.js',
    'src/utils/recipeCategories.js',
    'src/migration/worldScopeEntityGrouping.js',
    'src/systems/componentScope.js',
    'src/systems/essenceScope.js',
    'src/systems/scopedDefinitionStore.js',
    'src/utils/scalars.js',
    'src/systems/scopedDefinitions.js',
  ],
  compiledModules: [
    'src/ui/svelte/apps/manager/SegmentedControl.svelte',
    'src/ui/svelte/apps/manager/BulkSelectionToolbar.svelte',
    'src/ui/svelte/components/Pagination.svelte',
    // Issue 1504: the shared `<Select>`'s whole compiled closure.
    ...SELECT_COMPILED_MODULES,
    'src/ui/svelte/components/Medallion.svelte',
    'src/ui/svelte/components/SelectionCheckbox.svelte',
    'src/ui/svelte/apps/manager/library/LibraryCard.svelte',
    'src/ui/svelte/apps/manager/library/LibraryShelf.svelte',
    'src/ui/svelte/apps/manager/essences/EssenceRow.svelte',
    'src/ui/svelte/components/IconButton.svelte',
    'src/ui/svelte/components/ManagerSearchField.svelte',
    'src/ui/svelte/components/ManagerToolbar.svelte',
    'src/ui/svelte/components/StatusToggle.svelte',
    'src/ui/svelte/apps/manager/EssenceBrowserView.svelte',
  ],
  componentPath: 'src/ui/svelte/apps/manager/EssenceBrowserView.svelte',
});

/** The two states every vocabulary assertion below is a comparison between. */
const CONFIGURED_DISABLED = makeEssenceRow({
  id: 'aether',
  name: 'Aether',
  colorToken: 'lavender',
  enabled: false,
  // A WORKING source, stated: the pill tones itself on a non-`linked` state.
  sourceState: 'linked',
  sourceName: 'Flawless Ruby',
  hasEffectTransfer: true,
  hasPropertyMacro: true,
  componentUsageCount: 2,
  recipeUsageCount: 1,
  recipeUsageIds: ['r1'],
  deleteRewritesRecipes: true,
});
const PLAIN_ENABLED = makeEssenceRow({ id: 'water', name: 'Water' });

function props(essences, extra = {}) {
  return {
    essenceCards: essences,
    showSourceUi: true,
    showPropertyMacroUi: true,
    selectedEssenceId: '',
    selectedSystemId: 'sys-1',
    ...extra,
  };
}

/** Every state marker one row renders, as data, so a list/grid comparison is exact. */
function vocabularyOf(root, id) {
  const row = root.querySelector(`.manager-essence-row[data-essence-id="${id}"]`);
  return {
    enabled: row.dataset.essenceEnabled,
    capabilities: [...row.querySelectorAll('[data-essence-capability]')].map(
      (pill) => pill.dataset.essenceCapability
    ),
    // The pill's HEALTH, not only its presence.
    capabilityStates: [...row.querySelectorAll('[data-essence-capability]')].map(
      (pill) => pill.dataset.essenceCapabilityState
    ),
    // The essence's COLOUR, read off the tinted medallion (issue 1036, maintainer round 2).
    // It used to be read off a `Chip` naming the colour token — "Lavender", "Sage" — and
    // that chip is gone: the tile already carries the colour and a display name per theme
    // colour is upkeep with no reader. The STATE did not go with it, so this reads it where
    // it actually lives now, and the grid must still carry it.
    colour: row.querySelector('[data-medallion-tint]')?.dataset.medallionTint || '',
    // And the chip must not come back.
    colourChip: Boolean(row.querySelector('[data-essence-colour]')),
    disabledWord: row.textContent.includes('Disabled'),
    // The component count renders PLAINLY now (issue 1036, maintainer round).
    components: row.querySelector('[data-essence-usage-components]').textContent.trim(),
    recipes: row.querySelector('[data-essence-usage-recipes]').textContent.trim(),
  };
}

// TOP-LEVEL, not inside a describe.
before(async () => {
  await harness.setup();
});

after(() => harness.teardown());

describe('1036 EssenceBrowserView — rows, cards and presentation', () => {
  it('carries the SAME state vocabulary in the grid as in the list', async () => {
    const root = await harness.mount(props([CONFIGURED_DISABLED, PLAIN_ENABLED]));
    const asList = vocabularyOf(root, 'aether');

    assert.equal(asList.enabled, 'false');
    assert.equal(asList.disabledWord, true, 'icon + word, always — never dimming alone');
    assert.deepEqual(asList.capabilities, ['effects', 'macro']);
    assert.deepEqual(asList.capabilityStates, ['ok', 'ok'], 'a resolving source is not warned about');
    assert.equal(asList.colour, 'lavender', 'the tinted tile carries the colour');
    assert.equal(asList.colourChip, false, 'and no chip restates it as a word');
    assert.match(asList.components, /2/, 'the component count renders plainly, no padlock');
    assert.match(asList.recipes, /1/);

    root.querySelector('[data-essence-view-option="grid"] input').click();
    flushSync();
    assert.equal(root.querySelector('.manager-essences-table').dataset.essenceView, 'grid');
    assert.deepEqual(
      vocabularyOf(root, 'aether'),
      asList,
      'the grid card removes no state; that is what makes the toggle a PRESENTATION toggle'
    );

    // The card ACTIONS live in a divided footer now (issue 1036, maintainer round).
    assert.ok(
      root.querySelector('[data-essence-edit="aether"]'),
      'the grid card footer carries the edit pencil'
    );
    assert.ok(
      root.querySelector('[data-essence-toggle="aether"]'),
      'and the enable switch'
    );
    assert.ok(
      root.querySelector('[data-essence-select="aether"]'),
      'and it keeps the selection box, because bulk selection is how a card is acted on'
    );
    harness.remount();
  });

  it('never hides a capability pill for a disabled essence, and gates both on the feature', async () => {
    const root = await harness.mount(props([CONFIGURED_DISABLED]));
    assert.deepEqual(vocabularyOf(root, 'aether').capabilities, ['effects', 'macro']);

    // Negative control on the GATES, not on the row: the row's own fields are unchanged.
    await harness.setProps({ showSourceUi: false, showPropertyMacroUi: false });
    assert.deepEqual(
      vocabularyOf(root, 'aether').capabilities,
      [],
      'a gated-off capability shows no pill even though the essence still carries it'
    );
    harness.remount();
  });

  it('marks a BROKEN source on the row in BOTH presentations, and NEVER a delete padlock', async () => {
    // The broken-source pill is a state the shipped surfaces reported and the redesign must
    // not lose; the delete padlock is one the maintainer removed, because deletion is warned
    // rather than blocked. Both facts must hold on the grid card too, since it is the same
    // component and the inspector shows one essence at a time.
    const brokenSource = makeEssenceRow({ id: 'ember', name: 'Ember', sourceState: 'stale' });
    const root = await harness.mount(props([CONFIGURED_DISABLED, PLAIN_ENABLED, brokenSource]));

    const padlocks = () => root.querySelectorAll('[data-essence-usage-components] .fa-lock');
    assert.equal(padlocks().length, 0, 'a carried essence renders no delete padlock any more');
    assert.deepEqual(
      vocabularyOf(root, 'ember').capabilityStates,
      ['broken'],
      'a stale source is reported by the PILL — a filter is a search, not a signal'
    );
    assert.deepEqual(
      vocabularyOf(root, 'aether').capabilityStates,
      ['ok', 'ok'],
      'negative control: a resolving source is not warned about'
    );

    root.querySelector('[data-essence-view-option="grid"] input').click();
    flushSync();
    assert.equal(padlocks().length, 0, 'and the card carries no padlock either');
    assert.deepEqual(vocabularyOf(root, 'ember').capabilityStates, ['broken']);
    harness.remount();
  });

  it('carries ONE filter control on the bar, and it is the membership pair', async () => {
    // ── THE TOOLBAR'S WEIGHT IS THE ASSERTION (issue 1372, maintainer parity round 8) ────────
    // The reference's bar carries a search field and exactly one filter — `In this system (n) |
    // All world essences (n)` (`tmp/proto/essence-rules.png`). This bar carried four controls:
    const scope = {
      available: true,
      entityType: 'essence',
      enableable: true,
      entries: [
        { id: 'aether', entity: { name: 'Aether' }, systems: [{ systemId: 'sys-1', member: true }] },
        { id: 'water', entity: { name: 'Water' }, systems: [{ systemId: 'sys-1', member: true }] },
      ],
    };
    const root = await harness.mount(props([CONFIGURED_DISABLED, PLAIN_ENABLED], { scope }));

    assert.ok(
      !root.querySelector('[data-essence-status-filter]'),
      'the status filter is a control the reference bar does not draw, not a hidden one'
    );
    assert.ok(!root.querySelector('[data-essence-source-filter]'), 'and so is the source select');

    assert.ok(
      Boolean(root.querySelector('[data-essence-membership-filter]')),
      'the membership pair is the one filter the reference draws, so its absence would be the ' +
        'opposite defect and this measurement would be vacuous without it'
    );
    assert.ok(
      Boolean(root.querySelector('[data-essence-view-mode]')),
      'and the presentation toggle survives: it is not a filter, and it is the only route to ' +
        'the grid the essence-library capability list requires'
    );

    // EVERY ROW IS STILL ON SCREEN. Removing a filter must not narrow the list it filtered.
    assert.deepEqual(
      [...root.querySelectorAll('.manager-essence-row')].map((row) => row.dataset.essenceId),
      ['aether', 'water']
    );
    harness.remount();
  });

  it('widens to the world essences when this system has adopted NONE of them', async () => {
    // ── THE COHORT'S ZERO POINT, HELD RATHER THAN ASSUMED (issue 1373) ───────────────────────
    // The Tool rules list shipped this exact shape broken: its zero-state branch was gated on
    // the raw per-system array while its counts, rows and pager were all computed over the
    // widened cohort, so a system that had adopted nothing could not reach the world records by
    // the membership segment OR by the zero state's own button — the one route in the product to
    // adopting one. This studio is already correct, because `isEmpty` is fed `listCards`, which
    // is `essenceCards` PLUS `absentCards`.
    const root = await harness.mount(
      props([], {
        scope: {
          available: true,
          entityType: 'essence',
          enableable: true,
          entries: [
            { id: 'aether', entity: { name: 'Aether' }, systems: [] },
            { id: 'water', entity: { name: 'Water' }, systems: [] },
          ],
        },
      })
    );

    assert.equal(
      root.querySelectorAll('.manager-essence-row').length,
      0,
      '`In this system` on a system holding none is a real zero state'
    );

    root.querySelector('[data-essence-membership-option="all"] input').click();
    flushSync();

    assert.deepEqual(
      [...root.querySelectorAll('.manager-essence-row')].map((row) => row.dataset.essenceId),
      ['aether', 'water'],
      'widening past a membership of none must draw the world essences, not the zero state'
    );
    harness.remount();
  });

  it('states an enabled row and a disabled row through the same pill treatment', async () => {
    // ── ONE STATE, ONE SHAPE (issue 1372, maintainer parity round 8) ─────────────────────────
    // The row's Disabled badge passed `tone="neutral"` — a tone that was not in the retired
    // pill's ramp at all, so `is-neutral` matched no rule and the badge rendered with the base
    // `border: 1px solid transparent` and no fill: a bare dot and some small text beside a
    // bordered, filled pill on the world catalogue one click away.
    const root = await harness.mount(props([CONFIGURED_DISABLED, PLAIN_ENABLED]));
    const pill = root.querySelector(
      '.manager-essence-row[data-essence-id="aether"] .manager-chip'
    );
    assert.ok(Boolean(pill), 'the disabled row states its state as a pill');
    assert.equal(
      chipToneOf(pill),
      'subtle',
      'and the tone it resolves to is one the chip actually paints'
    );
    harness.remount();
  });

  it('keeps the Edit pencil the FIRST icon button in the row', async () => {
    // The View Lab case `manager-essence-edit-first-state` navigates by
    // `.manager-essence-row[data-essence-id="…"] .manager-icon-button`. The row also carries
    // a toggle and a selection box; the toggle wears `.manager-status-toggle` and
    // `SelectionCheckbox` renders no `<button>` at all, so neither can intercept.
    const root = await harness.mount(props([CONFIGURED_DISABLED]));
    const row = root.querySelector('.manager-essence-row[data-essence-id="aether"]');
    assert.equal(
      row.querySelector('.manager-icon-button').dataset.essenceEdit,
      'aether',
      'a new icon button placed before the pencil would silently repoint the capture'
    );
    assert.equal(
      row.querySelectorAll('.manager-icon-button').length,
      1,
      'and the row has exactly one, so "first" is unambiguous'
    );
    harness.remount();
  });

  it('labels that control `Edit rules` and marks it as leaving the screen', async () => {
    // `proto:1576`. The prototype's system essence-rules row ends in a LABELLED pill carrying
    // the external-link glyph, because the words are what say which layer the control opens:
    const root = await harness.mount(props([CONFIGURED_DISABLED]));
    const row = root.querySelector('.manager-essence-row[data-essence-id="aether"]');
    const edit = row.querySelector('[data-essence-edit="aether"]');
    assert.ok(
      edit.textContent.includes('Edit rules'),
      'the row action states the layer it opens rather than showing a bare pencil'
    );
    assert.ok(
      edit.querySelector('i.fa-arrow-up-right-from-square'),
      'and carries the prototype trailing glyph that marks a control leaving this screen'
    );
    // THE ACCESSIBLE NAME, ASSERTED BY VALUE (issue 1422). The control is an `<IconButton>`,
    // which takes the name as the `ariaLabel` PROP and emits it as `aria-label` itself. That
    // spelling is the whole reason this clause exists: a name handed to the wrong prop is
    // dropped rather than rejected, the button renders IDENTICALLY, every `data-*` selector
    // above still resolves, and the frame is unchanged — so nothing else in this file, and no
    // screenshot, can tell a named control from an unnamed one.
    assert.equal(
      edit.getAttribute('aria-label'),
      'Edit rules for Aether',
      'the labelled variant names the essence AND the layer it opens'
    );
    // NON-VACUITY, and the reason the label could not simply replace the class.
    // smoke reaches this control as `.manager-icon-button[title*="Edit" i]` behind a
    // `count() > 0` guard, so a lost class or a retitled control would stop producing the
    // `manager-essence-edit-first-state` frame WITHOUT failing anything.
    assert.ok(
      edit.classList.contains('manager-icon-button'),
      'it is still the primitive three surfaces address it by'
    );
    assert.ok(
      edit.getAttribute('title').startsWith('Edit'),
      'and its title still leads with Edit, which is what the smoke matches on'
    );
    // The GRID card keeps the pencil.
    root.querySelector('[data-essence-view-option="grid"] input').click();
    flushSync();
    const card = root.querySelector('.manager-essence-row[data-essence-id="aether"]');
    assert.ok(
      card.querySelector('[data-essence-edit="aether"] i.fa-pen'),
      'the grid card keeps the icon-only pencil'
    );
    assert.ok(
      !card.textContent.includes('Edit rules'),
      'and does not carry the phrase, so the two presentations differ deliberately'
    );
    // The card's pencil has NO visible text at all.
    assert.equal(
      card.querySelector('[data-essence-edit="aether"]').getAttribute('aria-label'),
      'Edit Aether',
      'the icon-only presentation is still named, and names the essence'
    );
    harness.remount();
  });

  it('states MEMBERSHIP in the bar count, and falls back to the range without a corpus', async () => {
    // `proto:1550` / `proto:4971`: `N shown · M of K in this system`. The range it replaces was
    // already rendered verbatim by `Pagination` at the foot of the same list.
    const scope = {
      available: true,
      sections: [],
      entries: [
        { id: 'aether', entity: { name: 'Aether' }, systems: [] },
        { id: 'water', entity: { name: 'Water' }, systems: [] },
        { id: 'ember', entity: { name: 'Ember' }, systems: [] },
      ],
    };
    const root = await harness.mount(
      props([CONFIGURED_DISABLED, PLAIN_ENABLED], { scope, systemId: 'sys-1' })
    );
    assert.equal(
      root.querySelector('[data-essence-count]').textContent.replaceAll(/\s+/g, ' ').trim(),
      '2 shown · 2 of 3 in this system',
      'the bar answers how many the filters left, and how much of the world this system holds'
    );

    // THE NEGATIVE HALF. An unreadable corpus cannot answer `M of K`.
    const noCorpus = await harness.mount(props([CONFIGURED_DISABLED, PLAIN_ENABLED]));
    assert.equal(
      noCorpus.querySelector('[data-essence-count]').textContent.replaceAll(/\s+/g, ' ').trim(),
      '1–2 of 2',
      'with no world corpus the count states the page range and claims nothing about membership'
    );
    harness.remount();
  });

  it('reports the enable toggle without writing anything itself', async () => {
    const toggles = [];
    const root = await harness.mount(
      props([CONFIGURED_DISABLED], { onToggleEssenceEnabled: (id, next) => toggles.push([id, next]) })
    );

    root.querySelector('[data-essence-toggle="aether"]').click();
    flushSync();
    assert.deepEqual(
      toggles,
      [['aether', true]],
      'a disabled row asks to be ENABLED; the browser has no write path of its own'
    );
    harness.remount();
  });
});

// The THIRD studio on the shared multi-select contract. It declares no `grouped` fixture:
describeBrowserBulkSelection({
  label: 'EssenceBrowserView',
  prefix: 'essence',
  rowClass: 'manager-essence-row',
  rowIdKey: 'essenceId',
  selectionKey: 'bulkSelectedEssenceIds',
  rowsProp: 'essenceCards',
  harness,
  createBrowserState: createEssenceBrowserState,
  makeFlatRows: (count) =>
    Array.from({ length: count }, (_, index) =>
      makeEssenceRow({
        id: `f${index + 1}`,
        // Zero-padded so name-ascending order is also numeric order.
        name: `Flux ${String(index + 1).padStart(2, '0')}`,
      })
    ),
  flatId: (index) => `f${index}`,
  props: (rows, extra = {}) => props(rows, extra),
  rowControls: {
    scope: '.manager-essence-cluster',
    count: 2,
    why: 'the cluster holds the enable toggle and the Edit rules button — and the selection control must NOT join them, because the Foundry smoke walk reaches the row actions through button selectors',
  },
});
