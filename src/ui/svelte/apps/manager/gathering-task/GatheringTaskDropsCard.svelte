<!--
  A d100 gathering task's Drop Rules card (issue 1522): a searchable, paged table of drop rows, with
  rank columns under ranked rewards. The search and page are bound from the view, so they survive a
  tab switch. `selectedRowId` is the row the rail edits; each row is a `GatheringTaskDropRow`.
-->
<script>
  import Button from '../../../components/Button.svelte';
  import EmptyState from '../../../components/EmptyState.svelte';
  import Pagination from '../../../components/Pagination.svelte';
  import SearchField from '../../../components/SearchField.svelte';
  import GatheringTaskDropRow from './GatheringTaskDropRow.svelte';
  import { managedItemFor } from './taskEditorLookups.js';

  let {
    text,
    dropRows = [],
    selectedRowId = '',
    rewardRules = null,
    managedItemOptions = [],
    weatherOptions = [],
    timeOfDayOptions = [],
    biomeOptions = [],
    characterModifierLibrary = [],
    searchTerm = $bindable(''),
    pageIndex = $bindable(0),
    pageSize = $bindable(5),
    onAddDrop = () => {},
    onSelectDrop = () => {},
    onUpdateDrop = () => {},
    onMoveDrop = () => {},
    onImportDrop = () => {},
  } = $props();

  const normalizedSearchTerm = $derived(searchTerm.trim().toLowerCase());
  const filteredRows = $derived(
    dropRows.filter((row) => {
      const item = managedItemFor(managedItemOptions, row.componentId);
      const haystack = `${row.name || ''} ${item?.name || ''} ${row.itemUuid || ''}`.toLowerCase();
      return !normalizedSearchTerm || haystack.includes(normalizedSearchTerm);
    })
  );
  const paginatedRows = $derived(
    filteredRows.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize)
  );
  const showingStart = $derived(filteredRows.length === 0 ? 0 : pageIndex * pageSize + 1);
  const showingEnd = $derived(Math.min(filteredRows.length, (pageIndex + 1) * pageSize));
  const rankedMode = $derived(rewardRules?.rewardSelectionMode === 'highestRankedDrop');

  $effect(() => {
    if (pageIndex > 0 && pageIndex * pageSize >= filteredRows.length) pageIndex = 0;
  });
</script>

<section class="manager-task-drops-card">
  <div class="manager-task-card-header">
    <div class="manager-task-drop-header-copy">
      <h3>{text('FABRICATE.Admin.Manager.Environment.Tasks.DropRules', 'Drop Rules')}</h3>
      <p class="manager-muted">
        {text(
          'FABRICATE.Admin.Manager.Environment.Tasks.DropRulesHint',
          'Configure what can drop, how often, and which conditions modify each drop.'
        )}
      </p>
    </div>
    <div class="manager-task-drop-controls">
      <SearchField
        density="compact"
        bind:value={searchTerm}
        placeholder={text(
          'FABRICATE.Admin.Manager.Environment.Tasks.SearchDropsPlaceholder',
          'Search drop rules...'
        )}
        ariaLabel={text(
          'FABRICATE.Admin.Manager.Environment.Tasks.SearchDrops',
          'Search drop rules'
        )}
      />
      <!-- Primary (issue 1118, row 35): the section's create action, the same verb as the empty
           state's, which was already primary. -->
      <Button role="primary" onclick={onAddDrop} data-gathering-add-drop="toolbar">
        <i class="fas fa-plus" aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.Manager.Environment.Tasks.AddDrop', 'Add drop rule')}</span>
      </Button>
    </div>
  </div>

  <section
    class="manager-table-scroll"
    aria-label={text(
      'FABRICATE.Admin.Manager.Environment.Tasks.DropRulesTable',
      'Drop rules table'
    )}
  >
    {#if dropRows.length === 0}
      <EmptyState
        icon="fas fa-gift"
        title={text(
          'FABRICATE.Admin.Manager.Environment.Tasks.NoDrops',
          'No drops have been added.'
        )}
      >
        <Button role="primary" onclick={onAddDrop} data-gathering-add-drop="empty"
          >{text('FABRICATE.Admin.Manager.Environment.Tasks.AddDrop', 'Add drop rule')}</Button
        >
      </EmptyState>
    {:else if filteredRows.length === 0}
      <EmptyState
        icon="fas fa-search"
        title={text(
          'FABRICATE.Admin.Manager.Environment.Tasks.EmptyDropSearchTitle',
          'No drop rules match this search'
        )}
      />
    {:else}
      <div
        class={`manager-gathering-task-drops-table${rankedMode ? ' is-ranked-mode' : ''}`}
        role="table"
        data-gathering-task-drops-table
      >
        <div class="manager-table-head manager-gathering-task-drop-table-head" role="row">
          {#if rankedMode}
            <span
              role="columnheader"
              class="manager-drop-rank-header"
              aria-label={text('FABRICATE.Admin.Manager.Environment.Tasks.DropRank', 'Drop rank')}
              >#</span
            >
          {/if}
          <span role="columnheader"
            >{text('FABRICATE.Admin.Manager.Environment.Tasks.DropComponent', 'Component')}</span
          >
          <span role="columnheader"
            >{text('FABRICATE.Admin.Manager.Environment.Tasks.DropChance', 'Drop chance')}</span
          >
          <span role="columnheader"
            >{text('FABRICATE.Admin.Manager.Environment.Tasks.DropQuantityColumn', 'Count')}</span
          >
          <span role="columnheader"
            >{text('FABRICATE.Admin.Manager.Environment.Tasks.Modifiers', 'Modifiers')}</span
          >
        </div>
        {#each paginatedRows as row (row.id)}
          <GatheringTaskDropRow
            {text}
            {row}
            rankIndex={dropRows.indexOf(row)}
            rowCount={dropRows.length}
            {rankedMode}
            selected={selectedRowId === row.id}
            {managedItemOptions}
            {weatherOptions}
            {timeOfDayOptions}
            {biomeOptions}
            {characterModifierLibrary}
            {onSelectDrop}
            {onUpdateDrop}
            {onMoveDrop}
            {onImportDrop}
          />
        {/each}
      </div>
    {/if}
  </section>

  <div class="manager-task-drop-footer">
    <span class="manager-muted manager-drop-count" data-gathering-task-drop-count
      >{text(
        'FABRICATE.Admin.Manager.Environment.Tasks.ShowingDrops',
        'Showing {start}-{end} of {total} drops'
      )
        .replace('{start}', showingStart)
        .replace('{end}', showingEnd)
        .replace('{total}', filteredRows.length)}</span
    >
    <Pagination
      totalCount={filteredRows.length}
      {pageSize}
      {pageIndex}
      onPageChange={(next) => (pageIndex = next)}
      onPageSizeChange={(next) => {
        pageSize = next;
        pageIndex = 0;
      }}
    />
  </div>
</section>
