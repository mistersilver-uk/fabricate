<!--
  The library's `<DataTable>`: records compared down columns, under a visible `<caption>` stating
  `heading` and `count`, with the shipped pager when `perPage` is set. A row is selected by a pointer
  click on the `<tr>` (`selectedKey` + `onSelectRow`) and never focusable; the `cell` snippet's own
  control is the keyboard path. `rowData(row)` spreads on each `<tr>` and `rowAction` runs on it.
-->
<script>
  import EmptyState from './EmptyState.svelte';
  import Pagination from './Pagination.svelte';
  import { localizeOr } from '../util/localizeOr.js';

  let {
    columns = [],
    rows = [],
    rowKey,
    heading = '',
    count = null,
    search = undefined,
    cell = undefined,
    sort = null,
    onSort = null,
    page = 0,
    perPage = 0,
    perPageOptions = undefined,
    onPageChange = () => {},
    onPerPageChange = () => {},
    loading = false,
    error = '',
    empty = null,
    selectedKey = '',
    onSelectRow = null,
    rowData = () => ({}),
    rowAction = () => {},
    class: extraClass = '',
    ...rest
  } = $props();

  const id = $props.id();
  const classes = $derived(
    ['fabricate-data-table', onSelectRow ? 'is-selectable' : '', extraClass]
      .filter(Boolean)
      .join(' ')
  );
  const shownCount = $derived(count ?? rows.length);
  const phase = $derived.by(() => {
    if (loading) return 'loading';
    if (error) return 'error';
    return rows.length > 0 ? 'rows' : 'empty';
  });

  function direction(column) {
    return sort?.key === column.key ? sort.dir : '';
  }

  function ariaSort(column) {
    if (!column.sortable || !onSort) return undefined;
    return { asc: 'ascending', desc: 'descending' }[direction(column)] ?? 'none';
  }

  const ALIGN_CLASSES = Object.freeze({ center: 'is-align-center', end: 'is-align-end' });

  function cellClass(base, column) {
    return [base, ALIGN_CLASSES[column.align] ?? '', column.mono ? 'is-mono' : '']
      .filter(Boolean)
      .join(' ');
  }

  function attributesOf(row) {
    const map = rowData(row);
    return map && typeof map === 'object' ? map : {};
  }
</script>

{#snippet content(row, column, index)}
  {#if cell}{@render cell(row, column, index)}{:else}{row?.[column.key] ?? ''}{/if}
{/snippet}

<div class={classes} {...rest}>
  <div class="fabricate-data-table-scroll">
    <table
      class="fabricate-data-table-table"
      aria-labelledby={`${id}-heading ${id}-count`}
      aria-busy={loading || undefined}
    >
      <caption class="fabricate-data-table-caption">
        <span class="fabricate-data-table-caption-line">
          <span class="fabricate-data-table-heading" id={`${id}-heading`}>{heading}</span>
          <span class="fabricate-data-table-count" id={`${id}-count`}>{shownCount}</span>
          {#if search}<span class="fabricate-data-table-search">{@render search()}</span>{/if}
        </span>
      </caption>
      {#if phase === 'rows'}
        <colgroup>
          {#each columns as column (column.key)}<col style:width={column.width} />{/each}
        </colgroup>
        <thead>
          <tr class="fabricate-data-table-head-row">
            {#each columns as column (column.key)}
              <th
                scope="col"
                class={cellClass('fabricate-data-table-head', column)}
                aria-label={column.ariaLabel || undefined}
                aria-sort={ariaSort(column)}
              >
                {#if column.sortable && onSort}
                  <button
                    type="button"
                    class="fabricate-data-table-sort"
                    class:is-sorted={direction(column) !== ''}
                    data-keyboard-focus="true"
                    onclick={() =>
                      onSort({
                        key: column.key,
                        dir: direction(column) === 'asc' ? 'desc' : 'asc',
                      })}
                    >{column.label}<i
                      class={`fas ${direction(column) === 'desc' ? 'fa-caret-down' : 'fa-caret-up'}`}
                      aria-hidden="true"
                    ></i></button
                  >
                {:else}{column.label}{/if}
              </th>
            {/each}
          </tr>
        </thead>
      {/if}
      <tbody>
        {#if phase === 'rows'}
          {#each rows as row, index (rowKey(row, index))}
            {@const selected = selectedKey !== '' && rowKey(row, index) === selectedKey}
            <!-- A pointer convenience only (issue 1512): the cell's own control is the keyboard path,
                 and a focusable row is invisible to Foundry's `KeyboardManager#hasFocus`. -->
            <tr
              {...attributesOf(row)}
              class="fabricate-data-table-row"
              class:is-selected={selected}
              use:rowAction={row}
              onclick={onSelectRow ? () => onSelectRow(row) : undefined}
            >
              {#each columns as column (column.key)}
                {#if column.rowHeader}
                  <th scope="row" class={cellClass('fabricate-data-table-cell', column)}
                    >{@render content(row, column, index)}</th
                  >
                {:else}
                  <td class={cellClass('fabricate-data-table-cell', column)}
                    >{@render content(row, column, index)}</td
                  >
                {/if}
              {/each}
            </tr>
          {/each}
        {:else}
          <tr class="fabricate-data-table-status-row">
            <td class="fabricate-data-table-status" colspan={Math.max(1, columns.length)}>
              {#if phase === 'loading'}
                <p role="status">{localizeOr('FABRICATE.Common.Picker.Loading', 'Loading…')}</p>
              {:else if phase === 'error'}
                <p role="alert">{error}</p>
              {:else}
                <EmptyState
                  icon={empty?.icon ?? ''}
                  title={empty?.title ?? ''}
                  hint={empty?.hint ?? ''}>{@render empty?.action?.()}</EmptyState
                >
              {/if}
            </td>
          </tr>
        {/if}
      </tbody>
    </table>
  </div>
  {#if perPage > 0}
    <Pagination
      totalCount={shownCount}
      pageSize={perPage}
      pageIndex={page}
      pageSizeOptions={perPageOptions}
      {onPageChange}
      onPageSizeChange={onPerPageChange}
    />
  {/if}
</div>
