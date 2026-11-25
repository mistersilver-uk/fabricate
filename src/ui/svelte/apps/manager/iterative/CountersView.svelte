<!-- Svelte 5 runes mode -->
<!--
  The Counters screen: an ordered, expandable list of the system's Counters with the explainer, a
  search and the empty states. Edits apply as they are made through `onUpdate`, so the screen has
  no Save. Mounted into the iterative route's `<main>`, which gives it one scrolling row.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `counters` / `actions` / `recipes` | the library's lists and the system's recipes | `[]` | rows, and where each Counter is used |
  | `systemName` / `selectedSystemId` | strings | `''` | the duplicate-name sentence, and the system switch that resets the search |
  | `unsupported` | boolean | `false` | a library newer than this build: a blocking Notice, no list |
  | `expandedId` / `focusNameId` | Counter ids | `''` | the open row, and the row whose Name takes focus once |
  | `browserState` | the shell's lifted `{ searchTerm, systemId }` | `null` | falls back to a local one |
  | `onAdd` / `onUpdate(id, patch)` / `onReorder(from, to)` | functions | no-ops | the writes |
  | `onDelete(counter, uses)` | function | resolves `false` | confirms and deletes; answers whether it did |
  | `onExpand(id)` / `onNameFocused()` | functions | no-ops | the route's open row, and its focus hand-off |

  Invariants:
  - With a search term the list is not reorderable, because filtered indexes are not the persisted order.
  - A persisted duplicate name opens its row, and the row cannot be collapsed while it holds.
  - A delete is announced through the screen's own live region, which outlives the list when the
    last row goes, and hands focus to the next row, the previous one, or the adder.
-->
<script>
  import { tick } from 'svelte';

  import Button from '../../../components/Button.svelte';
  import Callout from '../../../components/Callout.svelte';
  import Chip from '../../../components/Chip.svelte';
  import EmptyState from '../../../components/EmptyState.svelte';
  import FilterBar from '../../../components/FilterBar.svelte';
  import SearchField from '../../../components/SearchField.svelte';
  import SortableList from '../../../components/SortableList.svelte';
  import { createCountersBrowserState } from '../../../../model/managerBrowserViewState.js';
  import { createBrowserListState } from '../browserListState.svelte.js';
  import { interpolate } from '../checks/checksCopy.js';

  import CounterRowBody from './CounterRowBody.svelte';
  import UnsupportedLibraryNotice from './UnsupportedLibraryNotice.svelte';
  import { counterLimitText, counterUsageText } from './iterativeCounterCopy.js';
  import { counterUses, duplicateCounterIds } from './iterativeLibraryModel.js';

  let {
    counters = [],
    actions = [],
    recipes = [],
    systemName = '',
    selectedSystemId = '',
    unsupported = false,
    expandedId = '',
    focusNameId = '',
    browserState = $bindable(null),
    text = (_key, fallback) => fallback,
    onAdd = () => {},
    onUpdate = () => {},
    onReorder = () => {},
    onDelete = async () => false,
    onExpand = () => {},
    onNameFocused = () => {},
  } = $props();

  let ownBrowserState = $state(createCountersBrowserState());
  const ui = $derived(browserState ?? ownBrowserState);
  const browse = createBrowserListState({ state: () => ui, resetAxes: { searchTerm: '' } });
  $effect(() => {
    browse.syncSystem(selectedSystemId);
  });

  let screen = $state(null);
  let announcement = $state('');

  const searchTerm = $derived(String(ui.searchTerm ?? ''));
  const needle = $derived(searchTerm.trim().toLowerCase());
  const searching = $derived(needle !== '');
  const visible = $derived(
    searching
      ? counters.filter((counter) => counter.label.toLowerCase().includes(needle))
      : counters
  );
  const duplicates = $derived(duplicateCounterIds(counters));
  const openId = $derived(
    counters.some((counter) => counter.id === expandedId)
      ? expandedId
      : (counters.find((counter) => duplicates.has(counter.id))?.id ?? '')
  );
  const usage = $derived(
    new Map(counters.map((counter) => [counter.id, counterUses({ actions }, recipes, counter.id)]))
  );
  const explainerExample = $derived(
    counters[0]?.label || text('FABRICATE.Admin.Manager.Iterative.ExplainerExample', 'Heat')
  );

  const countText = $derived(
    interpolate(text('FABRICATE.Admin.Manager.Iterative.CountersCount', '{shown} of {total}'), {
      shown: visible.length,
      total: counters.length,
    })
  );

  /** Focuses the row now at `index`, else the one before it, else the adder. */
  function focusAfterDelete(index) {
    const rows = [...(screen?.querySelectorAll('[data-iterative-counter]') ?? [])];
    const row = rows[index] ?? rows[index - 1];
    const next = row?.querySelector('[data-sortable-disclosure]');
    (next ?? screen?.querySelector('[data-iterative-add-counter]'))?.focus();
  }

  async function remove(counter) {
    const index = visible.indexOf(counter);
    const deleted = await onDelete(counter, usage.get(counter.id));
    if (!deleted) return;
    announcement = '';
    await tick();
    announcement = interpolate(
      text('FABRICATE.Admin.Manager.Iterative.CounterDeleted', '{name} deleted.'),
      { name: counter.label }
    );
    focusAfterDelete(index);
  }

  $effect(() => {
    const id = focusNameId;
    if (!id || !counters.some((counter) => counter.id === id)) return;
    tick().then(() => {
      const input = screen?.querySelector(`[data-iterative-counter-name="${id}"]`);
      input?.focus();
      input?.select();
      onNameFocused();
    });
  });

  function clearSearch() {
    ui.searchTerm = '';
  }
</script>

<div
  class="manager-iterative-screen"
  bind:this={screen}
  data-iterative-counters
  data-iterative-counters-state={counters.length === 0 ? 'empty' : 'list'}
>
  {#if unsupported}
    <UnsupportedLibraryNotice {text} />
  {:else}
    <Callout
      tone="neutral"
      icon="fas fa-circle-info"
      text={interpolate(
        text(
          'FABRICATE.Admin.Manager.Iterative.CountersExplainer',
          'A counter is a number a workpiece carries from one attempt to the next. Fabricate gives no counter a special meaning: what {example} does is set by the actions and recipe steps that use it.'
        ),
        { example: explainerExample }
      )}
      data-iterative-explainer
    />
    <FilterBar
      ariaLabel={text('FABRICATE.Admin.Manager.Iterative.CountersFilters', 'Counter filters')}
    >
      <SearchField
        value={searchTerm}
        onChange={(next) => {
          ui.searchTerm = next;
        }}
        placeholder={text('FABRICATE.Admin.Manager.Iterative.CountersSearch', 'Search counters')}
        ariaLabel={text('FABRICATE.Admin.Manager.Iterative.CountersSearch', 'Search counters')}
      >
        {#snippet countLabel()}<span data-iterative-counters-count>{countText}</span>{/snippet}
      </SearchField>
    </FilterBar>

    {#if counters.length === 0}
      <EmptyState
        icon="fas fa-gauge-simple-high"
        title={text('FABRICATE.Admin.Manager.Iterative.CountersEmptyTitle', 'No counters yet')}
        hint={text(
          'FABRICATE.Admin.Manager.Iterative.CountersEmptyHint',
          'The numbers a workpiece carries between sessions, such as how finished it is or how much heat is left.'
        )}
      >
        <Button role="primary" icon="fas fa-plus" data-iterative-add-counter onclick={onAdd}>
          {text('FABRICATE.Admin.Manager.Iterative.NewCounter', 'New counter')}
        </Button>
      </EmptyState>
    {:else if visible.length === 0}
      <EmptyState
        filtered
        hint={text(
          'FABRICATE.Admin.Manager.Iterative.CountersEmptySearch',
          'No counters match this search.'
        )}
      >
        <Button data-clear-filters="counters" onclick={clearSearch}>
          {text('FABRICATE.Admin.Manager.ClearFilters', 'Clear filters')}
        </Button>
      </EmptyState>
    {:else}
      <SortableList
        items={visible}
        itemLabel={(counter) => counter.label}
        ariaLabel={text('FABRICATE.Admin.Manager.Iterative.CountersTitle', 'Counters')}
        numbered
        removable
        expandable
        reorderable={!searching}
        expandedId={openId}
        onToggle={onExpand}
        onReorder={(from, to) => onReorder(from, to)}
        onRemove={remove}
        data-iterative-counter-list
        rowData={(counter) => ({ 'data-iterative-counter': counter.id })}
        removeData={(counter) => ({ 'data-iterative-counter-delete': counter.id })}
      >
        {#snippet row(counter)}
          <span class="manager-iterative-counter-label" title={counter.label}>{counter.label}</span>
          {#if duplicates.has(counter.id)}
            <Chip tone="danger" data-iterative-duplicate-chip>
              {text('FABRICATE.Admin.Manager.Iterative.DuplicateName', 'Duplicate name')}
            </Chip>
          {/if}
          <span class="manager-iterative-counter-facts">
            <Chip tone="neutral" data-iterative-counter-limit
              >{counterLimitText(counter, text)}</Chip
            >
            <span class="manager-iterative-counter-usage" data-iterative-counter-usage>
              {counterUsageText(usage.get(counter.id), text)}
            </span>
          </span>
        {/snippet}
        {#snippet body(counter)}
          <CounterRowBody
            {counter}
            {counters}
            {systemName}
            {text}
            onUpdate={(patch) => onUpdate(counter.id, patch)}
          />
        {/snippet}
        {#snippet footer()}
          <li class="manager-iterative-counter-add">
            <Button
              role="dashed"
              fullWidth
              icon="fas fa-plus"
              data-iterative-add-counter
              onclick={onAdd}
            >
              {text('FABRICATE.Admin.Manager.Iterative.AddCounter', 'Add counter')}
            </Button>
          </li>
        {/snippet}
      </SortableList>
    {/if}
  {/if}
  <p class="visually-hidden" aria-live="polite" data-iterative-counters-status>{announcement}</p>
</div>

<style>
  .manager-iterative-counter-label {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    color: var(--fab-text);
    font-size: 0.8rem;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .manager-iterative-counter-facts {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    gap: var(--fab-space-3);
    margin-left: auto;
  }

  .manager-iterative-counter-usage {
    color: var(--fab-text-subtle);
    font-size: 0.66rem;
    white-space: nowrap;
  }
</style>
