<!--
  A d100 gathering task's Drop Rules card (issues 1522, 1782): a searchable, paged `DataTable` of
  drop rules, with a rank column under ranked rewards. The search and page are bound from the view,
  so they survive a tab switch. `selectedRowId` is the row the rail edits; a component drop on a row
  assigns and selects it, and any other drop goes to `onImportDrop(rowId, data)`.
-->
<script>
  import Button from '../../../components/Button.svelte';
  import DataTable from '../../../components/DataTable.svelte';
  import SearchField from '../../../components/SearchField.svelte';
  import { dragDrop } from '../../../actions/dragDrop.js';
  import GatheringTaskDropCell from './GatheringTaskDropCell.svelte';
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
  const rankedMode = $derived(rewardRules?.rewardSelectionMode === 'highestRankedDrop');
  const columns = $derived([
    ...(rankedMode
      ? [
          {
            key: 'rank',
            label: '#',
            ariaLabel: text('FABRICATE.Admin.Manager.Environment.Tasks.DropRank', 'Drop rank'),
            align: 'center',
            width: '44px',
          },
        ]
      : []),
    {
      key: 'component',
      label: text('FABRICATE.Admin.Manager.Environment.Tasks.DropComponent', 'Component'),
      rowHeader: true,
    },
    {
      key: 'chance',
      label: text('FABRICATE.Admin.Manager.Environment.Tasks.DropChance', 'Drop chance'),
      width: '200px',
    },
    {
      key: 'count',
      label: text('FABRICATE.Admin.Manager.Environment.Tasks.DropQuantityColumn', 'Count'),
      align: 'center',
      width: '56px',
    },
    {
      key: 'modifiers',
      label: text('FABRICATE.Admin.Manager.Environment.Tasks.Modifiers', 'Modifiers'),
    },
  ]);
  const empty = $derived(
    dropRows.length === 0
      ? {
          icon: 'fas fa-gift',
          title: text(
            'FABRICATE.Admin.Manager.Environment.Tasks.NoDrops',
            'No drops have been added.'
          ),
          action,
        }
      : {
          icon: 'fas fa-search',
          title: text(
            'FABRICATE.Admin.Manager.Environment.Tasks.EmptyDropSearchTitle',
            'No drop rules match this search'
          ),
        }
  );

  $effect(() => {
    if (pageIndex > 0 && pageIndex * pageSize >= filteredRows.length) pageIndex = 0;
  });

  function handleDropZoneDrop(row, data) {
    if (data?.type === 'FabricateManagedComponent' && data.componentId) {
      onUpdateDrop(row.id, {
        componentId: data.componentId,
        itemUuid: '',
        systemItemId: '',
        name: '',
        enabled: true,
      });
      onSelectDrop(row.id);
      return;
    }
    onImportDrop(row.id, data);
  }

  // Each row is a drop zone; `update` rebinds it when the row object behind it changes.
  function dropZone(node, row) {
    const options = (current) => ({
      onDrop: (data) => handleDropZoneDrop(current, data),
      activeClass: 'is-drop-active',
    });
    const zone = dragDrop(node, options(row));
    return { update: (next) => zone.update(options(next)), destroy: () => zone.destroy() };
  }
</script>

{#snippet action()}
  <Button role="primary" onclick={onAddDrop} data-gathering-add-drop="empty"
    >{text('FABRICATE.Admin.Manager.Environment.Tasks.AddDrop', 'Add drop rule')}</Button
  >
{/snippet}

{#snippet search()}
  <span class="manager-task-drop-controls">
    <SearchField
      density="compact"
      bind:value={searchTerm}
      placeholder={text(
        'FABRICATE.Admin.Manager.Environment.Tasks.SearchDropsPlaceholder',
        'Search drop rules...'
      )}
      ariaLabel={text('FABRICATE.Admin.Manager.Environment.Tasks.SearchDrops', 'Search drop rules')}
    />
    <!-- Primary (issue 1118, row 35): the section's create action, the same verb as the empty
         state's, which was already primary. -->
    <Button role="primary" onclick={onAddDrop} data-gathering-add-drop="toolbar">
      <i class="fas fa-plus" aria-hidden="true"></i>
      <span>{text('FABRICATE.Admin.Manager.Environment.Tasks.AddDrop', 'Add drop rule')}</span>
    </Button>
  </span>
{/snippet}

{#snippet cell(row, column)}
  <GatheringTaskDropCell
    {text}
    {row}
    column={column.key}
    rankIndex={dropRows.indexOf(row)}
    rowCount={dropRows.length}
    selected={selectedRowId === row.id}
    {managedItemOptions}
    {weatherOptions}
    {timeOfDayOptions}
    {biomeOptions}
    {characterModifierLibrary}
    {onSelectDrop}
    {onUpdateDrop}
    {onMoveDrop}
  />
{/snippet}

<DataTable
  class={`manager-task-drops-card manager-gathering-task-drops-table${rankedMode ? ' is-ranked-mode' : ''}`}
  data-gathering-task-drops-table=""
  heading={text('FABRICATE.Admin.Manager.Environment.Tasks.DropRules', 'Drop Rules')}
  count={filteredRows.length}
  {columns}
  rows={paginatedRows}
  rowKey={(row) => row.id}
  {search}
  {cell}
  {empty}
  selectedKey={selectedRowId}
  onSelectRow={(row) => onSelectDrop(row.id)}
  rowData={(row) => ({
    'data-gathering-task-drop-id': row.id,
    'data-gathering-task-drop-zone': row.id,
  })}
  rowAction={dropZone}
  page={pageIndex}
  perPage={pageSize}
  onPageChange={(next) => (pageIndex = next)}
  onPerPageChange={(next) => {
    pageSize = next;
    pageIndex = 0;
  }}
/>
