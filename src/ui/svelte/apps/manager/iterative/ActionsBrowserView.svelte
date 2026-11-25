<!-- Svelte 5 runes mode -->
<!--
  The Actions browser: the system's Crafting Actions as rows or cards, with search, the Rolls check,
  No check and Has issues toggles, a category filter and a pager, inside the shared `LibraryShelf`.
  Mounted into the iterative route's `<main>`, which gives it one row to lay out.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `actions` / `counters` | the library's lists | `[]` | rows, and the Counters their costs name |
  | `blocking` | `Map` of action id to blocking count | empty | drawn as a chip and read by Has issues |
  | `selectedSystemId` | string | `''` | a change of system resets the filters |
  | `unsupported` | boolean | `false` | a library newer than this build: a blocking Notice, no list |
  | `browserState` | the shell's lifted browse state | `null` | falls back to a local one |
  | `onOpen(id)` / `onNew()` | functions | no-ops | open an action's editor, start a new one |

  Invariants:
  - Search, filters, page, page size and arrangement live on the lifted state, so they survive the
    editor round trip, and are never persisted.
  - `New action` is disabled, with its reason, while the system has no Counters.
-->
<script>
  import Button from '../../../components/Button.svelte';
  import EmptyState from '../../../components/EmptyState.svelte';
  import FilterBar from '../../../components/FilterBar.svelte';
  import SearchField from '../../../components/SearchField.svelte';
  import Select from '../../../components/Select.svelte';
  import ViewToggle from '../../../components/ViewToggle.svelte';
  import { createActionsBrowserState } from '../../../../model/managerBrowserViewState.js';
  import { createBrowserListState, createBrowserPageWindow } from '../browserListState.svelte.js';
  import { interpolate } from '../checks/checksCopy.js';
  import LibraryShelf from '../library/LibraryShelf.svelte';

  import ActionRow from './ActionRow.svelte';
  import UnsupportedLibraryNotice from './UnsupportedLibraryNotice.svelte';

  const NO_CATEGORY = '__none';
  const RESET_AXES = {
    searchTerm: '',
    rollsCheck: false,
    noCheck: false,
    hasIssues: false,
    category: '',
    pageIndex: 0,
  };

  let {
    actions = [],
    counters = [],
    blocking = new Map(),
    selectedSystemId = '',
    unsupported = false,
    browserState = $bindable(null),
    text = (_key, fallback) => fallback,
    onOpen = () => {},
    onNew = () => {},
  } = $props();

  let ownBrowserState = $state(createActionsBrowserState());
  const ui = $derived(browserState ?? ownBrowserState);
  const browse = createBrowserListState({ state: () => ui, resetAxes: RESET_AXES });
  $effect(() => {
    browse.syncSystem(selectedSystemId);
  });

  const hasCounters = $derived(counters.length > 0);
  const counterLabels = $derived(new Map(counters.map((counter) => [counter.id, counter.label])));
  const categories = $derived(
    [...new Set(actions.flatMap((action) => action.categories ?? []))].sort((a, b) =>
      a.localeCompare(b)
    )
  );
  const hasUncategorised = $derived(actions.some((action) => !(action.categories ?? []).length));
  // A category no action uses any more reads as "All categories".
  const category = $derived(
    ui.category === NO_CATEGORY && hasUncategorised
      ? NO_CATEGORY
      : categories.includes(ui.category)
        ? ui.category
        : ''
  );
  const needle = $derived(
    String(ui.searchTerm ?? '')
      .trim()
      .toLowerCase()
  );

  function matches(action) {
    const issues = blocking.get(action.id) ?? 0;
    const haystack = `${action.label} ${action.description ?? ''}`.toLowerCase();
    if (needle && !haystack.includes(needle)) return false;
    if (ui.rollsCheck && action.check !== 'roll') return false;
    if (ui.noCheck && action.check === 'roll') return false;
    if (ui.hasIssues && issues === 0) return false;
    if (category === NO_CATEGORY) return (action.categories ?? []).length === 0;
    return !category || (action.categories ?? []).includes(category);
  }

  const filtered = $derived(actions.filter(matches));
  const filtersActive = $derived(
    Boolean(needle || ui.rollsCheck || ui.noCheck || ui.hasIssues || category)
  );
  const pager = createBrowserPageWindow({ state: () => ui, rows: () => filtered });
  $effect(() => {
    pager.clampPage();
  });

  const categoryOptions = $derived([
    {
      value: '',
      label: text('FABRICATE.Admin.Manager.Iterative.CategoryAll', 'All categories'),
      hint: String(actions.length),
    },
    ...categories.map((name) => ({
      value: name,
      label: name,
      hint: String(actions.filter((action) => (action.categories ?? []).includes(name)).length),
    })),
    ...(hasUncategorised
      ? [
          {
            value: NO_CATEGORY,
            label: text('FABRICATE.Admin.Manager.Iterative.CategoryNone', 'No category'),
            hint: String(actions.filter((action) => !(action.categories ?? []).length).length),
          },
        ]
      : []),
  ]);
  const filters = $derived([
    {
      key: 'rollsCheck',
      icon: 'fas fa-dice-d20',
      label: text('FABRICATE.Admin.Manager.Iterative.RollsCheck', 'Rolls check'),
    },
    {
      key: 'noCheck',
      icon: 'fas fa-ban',
      label: text('FABRICATE.Admin.Manager.Iterative.NoCheck', 'No check'),
    },
    {
      key: 'hasIssues',
      icon: 'fas fa-circle-exclamation',
      label: text('FABRICATE.Admin.Manager.Iterative.FilterHasIssues', 'Has issues'),
    },
  ]);

  const countText = $derived(
    interpolate(text('FABRICATE.Admin.Manager.Iterative.ActionsCount', '{shown} of {total}'), {
      shown: filtered.length,
      total: actions.length,
    })
  );
  const noCountersReason = $derived(
    text(
      'FABRICATE.Admin.Manager.Iterative.NewActionNoCounters',
      'Actions spend and change counters, and this system has none. Add counters first.'
    )
  );
  const emptyHint = $derived(
    hasCounters
      ? text(
          'FABRICATE.Admin.Manager.Iterative.ActionsEmptyHint',
          'What each action costs, whether it rolls the check, and what it changes.'
        )
      : noCountersReason
  );

  function toggle(key) {
    ui[key] = !ui[key];
    ui.pageIndex = 0;
  }

  function clearFilters() {
    Object.assign(ui, RESET_AXES);
  }
</script>

<div class="manager-iterative-screen" data-iterative-actions class:is-browser={!unsupported}>
  {#if unsupported}
    <UnsupportedLibraryNotice {text} />
  {:else}
    <FilterBar
      ariaLabel={text('FABRICATE.Admin.Manager.Iterative.ActionsFilters', 'Action filters')}
    >
      <div class="manager-iterative-search">
        <SearchField
          value={String(ui.searchTerm ?? '')}
          onChange={(next) => {
            ui.searchTerm = next;
            ui.pageIndex = 0;
          }}
          placeholder={text('FABRICATE.Admin.Manager.Iterative.ActionsSearch', 'Search actions')}
          ariaLabel={text('FABRICATE.Admin.Manager.Iterative.ActionsSearch', 'Search actions')}
        />
      </div>
      {#each filters as filter (filter.key)}
        <Button
          pressed={ui[filter.key]}
          icon={filter.icon}
          data-iterative-filter={filter.key}
          onclick={() => toggle(filter.key)}
        >
          {filter.label}
        </Button>
      {/each}
      <Select
        size="toolbar"
        icon="fas fa-tag"
        value={category}
        options={categoryOptions}
        ariaLabel={text('FABRICATE.Admin.Manager.Iterative.CategoryFilter', 'Filter by category')}
        triggerProps={{ 'data-iterative-category': '' }}
        onChange={(next) => {
          ui.category = next;
          ui.pageIndex = 0;
        }}
      />
      <span class="manager-iterative-count" data-iterative-actions-count>{countText}</span>
      <ViewToggle
        view={ui.viewMode}
        listLabel={text('FABRICATE.Admin.Manager.Iterative.ViewList', 'List')}
        gridLabel={text('FABRICATE.Admin.Manager.Iterative.ViewGrid', 'Grid')}
        ariaLabel={text('FABRICATE.Admin.Manager.Iterative.ViewModeLabel', 'Action presentation')}
        data-iterative-view-mode
        optionDataAttr="data-iterative-view-option"
        onChange={(next) => (ui.viewMode = next)}
      />
    </FilterBar>

    <LibraryShelf
      items={pager.pageRows}
      viewMode={ui.viewMode}
      listClass="manager-iterative-actions-list"
      listAttrs={{ 'data-iterative-action-list': '', 'data-iterative-arrangement': ui.viewMode }}
      ariaLabel={text('FABRICATE.Admin.Manager.Iterative.ActionsTitle', 'Actions')}
      scrollLabel={text('FABRICATE.Admin.Manager.Iterative.ActionsTitle', 'Actions')}
      isEmpty={actions.length === 0}
      totalCount={filtered.length}
      pageSize={ui.pageSize}
      pageIndex={ui.pageIndex}
      pageSizeOptions={[10, 25, 50]}
      onPageChange={(next) => (ui.pageIndex = next)}
      onPageSizeChange={(next) => {
        ui.pageSize = next;
        ui.pageIndex = 0;
      }}
    >
      {#snippet empty()}
        <EmptyState
          icon="fas fa-hand-back-fist"
          title={text('FABRICATE.Admin.Manager.Iterative.ActionsEmptyTitle', 'No actions yet')}
          hint={emptyHint}
          data-iterative-actions-empty={hasCounters ? 'no-actions' : 'no-counters'}
        >
          <Button
            role="primary"
            icon="fas fa-plus"
            data-iterative-empty-new-action
            disabled={!hasCounters}
            tooltip={hasCounters ? '' : noCountersReason}
            onclick={onNew}
          >
            {text('FABRICATE.Admin.Manager.Iterative.NewAction', 'New action')}
          </Button>
        </EmptyState>
      {/snippet}
      {#snippet emptyFiltered()}
        <EmptyState
          filtered
          hint={text(
            'FABRICATE.Admin.Manager.Iterative.ActionsEmptySearch',
            'No actions match these filters.'
          )}
        >
          <Button data-clear-filters="actions" disabled={!filtersActive} onclick={clearFilters}>
            {text('FABRICATE.Admin.Manager.ClearFilters', 'Clear filters')}
          </Button>
        </EmptyState>
      {/snippet}
      {#snippet entry(action)}
        <ActionRow
          {action}
          variant={ui.viewMode === 'grid' ? 'grid' : 'row'}
          {counterLabels}
          blockingCount={blocking.get(action.id) ?? 0}
          {text}
          {onOpen}
        />
      {/snippet}
      {#snippet footer()}
        <Button
          role="dashed"
          class="manager-iterative-new-action"
          data-iterative-footer-new-action
          disabled={!hasCounters}
          tooltip={hasCounters ? '' : noCountersReason}
          onclick={onNew}
        >
          <i class="fas fa-plus" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Iterative.NewAction', 'New action')}</span>
        </Button>
      {/snippet}
    </LibraryShelf>
  {/if}
</div>

<style>
  /* The browser's own three rows: the filter bar, the scrolling shelf, then the pager. */
  .manager-iterative-screen {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-3);
    min-width: 0;
    min-height: 0;
    padding: var(--fab-space-4);
    overflow-y: auto;
  }

  .manager-iterative-screen.is-browser {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    gap: 0;
    padding: 0;
    overflow: hidden;
  }

  /* The bar is this screen's own row, so it takes the inset a `.manager-main` child gets from the sheet. */
  .manager-iterative-screen.is-browser > :global(.fabricate-filter-bar.fabricate-filter-bar) {
    margin: var(--fab-space-3) var(--fab-space-3) 0;
  }

  /* The screen's own box sets the search's width, so no rule here names the published field. */
  .manager-iterative-search {
    display: flex;
    flex: 1 1 220px;
    max-width: 320px;
    min-width: 0;
  }

  .manager-iterative-count {
    margin-left: auto;
    color: var(--fab-text-subtle);
    font-family: var(--fab-font-mono);
    font-size: 0.66rem;
    white-space: nowrap;
  }

  /* `:global` because `LibraryShelf` renders the `<ul>` these style, so a scoped selector would be
     hashed here and match nothing. The grid template is a per-studio content judgement. */
  :global(.manager-iterative-actions-list) {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  :global(.manager-iterative-actions-list.is-grid) {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(212px, 1fr));
    gap: var(--fab-space-3);
  }

  /* The dashed adder sits under the list or the grid, on the left, as its own row. */
  :global(.manager-iterative-new-action) {
    margin-top: var(--fab-space-3);
  }
</style>
