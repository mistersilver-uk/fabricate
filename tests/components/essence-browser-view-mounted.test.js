/**
 * `EssenceBrowserView` mounted, in isolation (issue 1036).
 *
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
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import { describeBrowserBulkSelection } from '../helpers/browserBulkSelectionCases.js';
import { createEssenceBrowserState } from '../../src/utils/essenceBrowserModel.js';
import { makeEssenceRow } from '../helpers/makeEssenceRow.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-essence-browser-',
  rawModules: [
    'src/ui/svelte/util/foundryBridge.js',
    'src/ui/svelte/util/managerColorTokens.js',
    'src/utils/essenceBrowserModel.js',
    'src/utils/essenceBulkEditModel.js',
    'src/utils/bulkSelectionModel.js',
    'src/utils/browserGroupCounts.js',
    'src/utils/browserPagination.js',
    'src/utils/essenceValidation.js',
    'src/ui/svelte/apps/manager/essences/essenceStudio.js',
  ],
  compiledModules: [
    'src/ui/svelte/apps/manager/Chip.svelte',
    'src/ui/svelte/apps/manager/EmptyState.svelte',
    'src/ui/svelte/apps/manager/SegmentedControl.svelte',
    'src/ui/svelte/apps/manager/BulkSelectionToolbar.svelte',
    'src/ui/svelte/components/Pagination.svelte',
    'src/ui/svelte/components/Medallion.svelte',
    'src/ui/svelte/components/StatusPill.svelte',
    'src/ui/svelte/components/SelectionCheckbox.svelte',
    'src/ui/svelte/apps/manager/essences/EssenceRow.svelte',
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
  // A WORKING source, stated: the pill tones itself on a non-`linked` state, so a row
  // claiming effect transfer without saying whether it resolves would be the broken case
  // while reading as the healthy one.
  sourceState: 'linked',
  sourceName: 'Flawless Ruby',
  hasEffectTransfer: true,
  hasPropertyMacro: true,
  componentUsageCount: 2,
  recipeUsageCount: 1,
  recipeUsageIds: ['r1'],
  deleteRewritesRecipes: true,
  deleteBlocked: true,
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
    // The pill's HEALTH, not only its presence: `hasEffectTransfer` means a source is
    // configured, which a dead link still is.
    capabilityStates: [...row.querySelectorAll('[data-essence-capability]')].map(
      (pill) => pill.dataset.essenceCapabilityState
    ),
    colour: row.querySelector('[data-essence-colour]')?.dataset.essenceColour || '',
    disabledWord: row.textContent.includes('Disabled'),
    components: row.querySelector('[data-essence-usage-components]').textContent.trim(),
    // The BLOCKED-FROM-DELETE marker, which is part of the vocabulary the grid must carry
    // too — the inspector shows one essence at a time and cannot stand in for it.
    blocked: row.querySelector('[data-essence-usage-components]').dataset.essenceDeleteBlocked,
    recipes: row.querySelector('[data-essence-usage-recipes]').textContent.trim(),
  };
}

// TOP-LEVEL, not inside a describe: the shared multi-select cases at the foot of this file
// register their own `describe` and mount through the same harness, so the temp tree has to
// exist before ANY suite in the file runs. A per-describe `before` would leave those cases
// mounting against no document at all.
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
    assert.equal(asList.colour, 'lavender');
    assert.equal(asList.blocked, 'true', 'a carried essence says it cannot be deleted');
    assert.match(asList.recipes, /1/);

    root.querySelector('[data-essence-view-option="grid"] input').click();
    flushSync();
    assert.equal(root.querySelector('.manager-essences-table').dataset.essenceView, 'grid');
    assert.deepEqual(
      vocabularyOf(root, 'aether'),
      asList,
      'the grid card removes no state; that is what makes the toggle a PRESENTATION toggle'
    );

    // What legitimately differs is the ACTIONS: they are row-only, and grid selection
    // routes through the inspector.
    assert.ok(
      !root.querySelector('[data-essence-edit="aether"]'),
      'a grid card carries no edit pencil'
    );
    assert.ok(
      !root.querySelector('[data-essence-toggle="aether"]'),
      'and no enable switch'
    );
    assert.ok(
      root.querySelector('[data-essence-select="aether"]'),
      'but it keeps the selection box, because bulk selection is how a card is acted on'
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

  it('marks BLOCKED-from-delete and a BROKEN source on the row, in BOTH presentations', async () => {
    // Two states the shipped surfaces reported and the redesign must not lose. Both live
    // on the row rather than in the inspector, because the inspector shows one essence at a
    // time — and the grid card is the same component, so it carries them by construction.
    const brokenSource = makeEssenceRow({ id: 'ember', name: 'Ember', sourceState: 'stale' });
    const root = await harness.mount(props([CONFIGURED_DISABLED, PLAIN_ENABLED, brokenSource]));

    assert.equal(vocabularyOf(root, 'aether').blocked, 'true');
    assert.equal(
      vocabularyOf(root, 'water').blocked,
      'false',
      'negative control: a deletable row carries no lock, so the marker is not always on'
    );
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
    assert.equal(vocabularyOf(root, 'aether').blocked, 'true', 'the card keeps the lock');
    assert.deepEqual(vocabularyOf(root, 'ember').capabilityStates, ['broken']);
    harness.remount();
  });

  it('renders each status segment with the count that choosing it would show', async () => {
    const root = await harness.mount(props([CONFIGURED_DISABLED, PLAIN_ENABLED]));
    const countOf = (value) =>
      root
        .querySelector(`[data-essence-status-option="${value}"] [data-segment-count]`)
        .textContent.trim();

    assert.deepEqual([countOf('all'), countOf('enabled'), countOf('disabled')], ['2', '1', '1']);

    // The counts FOLLOW the search, because the number's whole job is to say what clicking
    // the segment shows — a count over the whole roster would promise rows the GM cannot
    // reach without clearing a filter the count says nothing about.
    const search = root.querySelector('[aria-label="Search essences"]');
    search.value = 'Aether';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    assert.deepEqual([countOf('all'), countOf('enabled'), countOf('disabled')], ['1', '0', '1']);

    // And the STATUS axis is widened for its own counts, or the selected segment would be
    // the only non-zero one by construction.
    root.querySelector('[data-essence-status-option="disabled"] input').click();
    flushSync();
    assert.deepEqual([countOf('all'), countOf('enabled'), countOf('disabled')], ['1', '0', '1']);
    harness.remount();
  });

  it('filters by status with a working negative control, and states what is filtered', async () => {
    const root = await harness.mount(props([CONFIGURED_DISABLED, PLAIN_ENABLED]));
    assert.equal(root.querySelectorAll('.manager-essence-row').length, 2);

    root.querySelector('[data-essence-status-option="disabled"] input').click();
    flushSync();
    assert.deepEqual(
      [...root.querySelectorAll('.manager-essence-row')].map((row) => row.dataset.essenceId),
      ['aether'],
      'Disabled shows only the disabled essence'
    );
    assert.ok(
      root.querySelector('[data-essence-filter-chip="status"]'),
      'and an active filter is stated as a dismissible chip'
    );

    root.querySelector('[data-essence-status-option="enabled"] input').click();
    flushSync();
    assert.deepEqual(
      [...root.querySelectorAll('.manager-essence-row')].map((row) => row.dataset.essenceId),
      ['water'],
      'negative control: Enabled shows the OTHER one, so the filter is not simply hiding rows'
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
// essences have no category vocabulary, so there is no collapse to hide rows behind, and
// the shared case degrades to its flat form rather than being skipped.
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
        // Zero-padded so name-ascending order is also numeric order, which is what makes
        // `flatId(1)` reliably the first row of page 1.
        name: `Flux ${String(index + 1).padStart(2, '0')}`,
      })
    ),
  flatId: (index) => `f${index}`,
  props: (rows, extra = {}) => props(rows, extra),
  rowControls: {
    scope: '.manager-essence-cluster',
    count: 2,
    why: 'the cluster holds the enable toggle and the Edit pencil — and the selection control must NOT join them, because the Foundry smoke walk reaches the row actions through button selectors',
  },
});
