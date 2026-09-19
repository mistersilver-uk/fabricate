<!--
  `SearchablePopover`'s portaled panel and nothing else: the `role="dialog"` box `anchoredPopover`
  positions, the shared header, the query row, the `role="listbox"` with its groups and rows, and
  the empty note. An INTERNAL PART with one caller — it adds no vocabulary name and carries the
  `<SearchPopover>` entry that specifies its parent, whose docblock owns the public prop table.

  Inbound contract, in summary: every name arrives from that table unchanged, plus `anchor` (the
  element the panel is measured against), `totalCount`, and the parent's own
  `chooseOption`/`optionIsSelected`/`close`/`stop`/`keepFocusOnHolder`. `searchFieldAttributes` and
  `popoverLayout` arrive COMPUTED and are never re-derived here: rebuilding the attribute bag would
  silently drop `onHolderKeydown` and `aria-activedescendant` while rendering identically at rest.

  Invariants that moved with the markup:
  - `fabricate-picker-popover` is the primitive's second namespace root, written here because the
    panel escapes the trigger's subtree.
  - THE PANEL'S CHROME MUST NOT TAKE FOCUS: `role="dialog" tabindex="-1"` plus the `mousedown`
    guard, which excepts the query field and the LIST, because a scrollbar drag arrives with the
    scrolling element as its target.
  - THREE CELLS CROSS THE BOUNDARY, each named for what it holds: `popover` is the dialog element,
    read by the parent's dismissal `additionalNodes` and its active-option scroll effect; `search`
    is the query FIELD element, two-way because the parent's `inlineSearchTrigger` branch writes the
    same cell; `query` is the query VALUE. `optionsList` is private — every reader of it moved here.
  - The compact presentation's rules root on this panel, so they live in this file's scoped block.
-->
<script>
  import { anchoredPopover } from '../actions/anchoredPopover.js';
  import { activeOptionId } from '../util/listboxNavigation.js';
  import Chip from './Chip.svelte';
  import EmptyState from './EmptyState.svelte';

  let {
    popoverClass = '',
    compactOptionRows = false,
    dialogNameAttribute = undefined,
    dialogNamedBy = undefined,
    anchor = null,
    popoverLayout,
    horizontalAlign = 'left',
    minWidth = 240,
    maxWidth = 340,
    maxHeight = 0,
    bounds = undefined,
    ignoreScrollWithin = false,
    measureListMetrics = undefined,
    popoverTitle = '',
    showFilteredCount = false,
    filteredCount = '',
    showSearch = true,
    inlineSearchTrigger = false,
    searchClass = '',
    searchFieldAttributes = {},
    filteredOptions = [],
    totalCount = 0,
    groupedOptions = [],
    isGrouped = false,
    renderedOptions = [],
    listId = '',
    listClass = '',
    multiple = false,
    as = 'list',
    isGrid = false,
    gridColumns = 1,
    optionClass = '',
    option: optionContent = undefined,
    instanceId = '',
    activeIndex = -1,
    emptyMessage = '',
    emptyBody = '',
    header = undefined,
    footer = undefined,
    chooseOption,
    optionIsSelected,
    close,
    stop,
    keepFocusOnHolder,
    popover = $bindable(null),
    search = $bindable(null),
    query = $bindable(''),
  } = $props();

  let optionsList = $state(null);
</script>

<div
  bind:this={popover}
  class={`fabricate-picker-popover manager-travel-popover ${popoverClass} ${compactOptionRows ? 'is-compact-option-rows' : ''}`}
  role="dialog"
  tabindex="-1"
  data-keyboard-focus="true"
  aria-label={dialogNameAttribute}
  aria-labelledby={dialogNamedBy}
  use:anchoredPopover={{
    component: 'SearchablePopover',
    trigger: anchor,
    layout: popoverLayout,
    layoutOptions: () => ({
      horizontalAlign,
      minWidth,
      maxWidth,
      ...(measureListMetrics?.({
        popover,
        list: optionsList,
        search,
      }) ?? {}),
    }),
    maxHeightCap: maxHeight,
    bounds,
    targets: measureListMetrics ? { list: optionsList } : undefined,
    ignoreScrollWithin,
  }}
  onclick={stop}
  onmousedown={keepFocusOnHolder}
  onkeydown={(event) => {
    if (event.key === 'Escape') {
      stop(event);
      close();
    }
  }}
>
  {#snippet optionRow(option, index)}
    <button
      {...option.data}
      type="button"
      class={`manager-travel-option ${optionClass} ${option.class || ''}`}
      role="option"
      id={activeOptionId(instanceId, index)}
      tabindex="-1"
      data-keyboard-focus="true"
      aria-selected={optionIsSelected(option)}
      aria-disabled={option.disabled ? 'true' : undefined}
      data-active-option={index === activeIndex ? 'true' : undefined}
      data-recipe-add={option.addMarker || undefined}
      data-popover-option={option.dataId || undefined}
      title={option.label}
      onclick={() => chooseOption(option)}
      onmousedown={(event) => event.preventDefault()}
    >
      {#if optionContent}
        {@render optionContent(option)}
      {:else}
        {#if option.img}
          <span class="manager-travel-portrait" aria-hidden="true"
            ><img src={option.img} alt="" /></span
          >
        {:else if option.icon}
          <i class={option.icon} aria-hidden="true"></i>
        {/if}
        {#if option.meta}
          <span class="manager-travel-option-lines">
            <span class="manager-travel-option-name">{option.label}</span>
            <span class="manager-travel-option-meta">{option.meta}</span>
          </span>
        {:else}
          <span class="manager-travel-option-name">{option.label}</span>
        {/if}
        {#if option.trailing}<Chip tone="disabled">{option.trailing}</Chip>{/if}
        {#if option.trailingIcon}<i
            class={`manager-travel-option-marker ${option.trailingIcon}`}
            aria-hidden="true"
          ></i>{/if}
        {#if option.disabled && option.disabledReason}<Chip
            tone="disabled"
            data-popover-option-reason="">{option.disabledReason}</Chip
          >{/if}
      {/if}
    </button>
  {/snippet}

  {#if popoverTitle || showFilteredCount}
    <div class="manager-travel-popover-header" data-popover-header>
      {#if popoverTitle}
        <span class="manager-travel-popover-title">{popoverTitle}</span>
      {/if}
      {#if showFilteredCount}
        <span
          class="manager-travel-popover-count"
          data-popover-filtered-count
          role="status"
          aria-live="polite">{filteredCount}</span
        >
      {/if}
    </div>
  {/if}

  {#if showSearch && !inlineSearchTrigger}
    <div
      class={`manager-travel-popover-search ${searchClass}`}
      class:is-compact={compactOptionRows}
    >
      {#if compactOptionRows}<i class="fas fa-magnifying-glass" aria-hidden="true"></i>{/if}
      <input bind:this={search} bind:value={query} {...searchFieldAttributes} />
    </div>
  {/if}

  {#if header}{@render header(filteredOptions.length, totalCount)}{/if}

  {#if filteredOptions.length > 0}
    <div
      bind:this={optionsList}
      class={`manager-travel-popover-options ${listClass}`}
      role="listbox"
      id={listId}
      aria-label={dialogNameAttribute}
      aria-labelledby={dialogNamedBy}
      aria-multiselectable={multiple ? 'true' : undefined}
      data-picker-as={as}
      data-picker-columns={isGrid ? String(gridColumns) : undefined}
    >
      {#if isGrouped}
        {#each groupedOptions as bucket (bucket.id)}
          <div
            class="manager-travel-popover-group"
            role="group"
            aria-label={bucket.label || undefined}
            data-popover-group={bucket.id}
          >
            {#if bucket.label}
              <p class="manager-travel-popover-group-label" aria-hidden="true">
                {bucket.label}
              </p>
            {/if}
            {#each bucket.options as option, index (option.id)}
              {@render optionRow(option, bucket.offset + index)}
            {/each}
          </div>
        {/each}
      {:else}
        {#each renderedOptions as option, index (option.id)}
          {@render optionRow(option, index)}
        {/each}
      {/if}
    </div>
  {:else}
    <div class="manager-travel-popover-empty" role="status" aria-live="polite">
      <EmptyState note title={emptyMessage} hint={emptyBody || undefined} />
    </div>
  {/if}

  {#if footer}{@render footer()}{/if}
</div>

<style>
  .manager-travel-popover-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--fab-space-2);
    padding: 4px 7px 6px;
  }

  .manager-travel-popover-title {
    min-width: 0;
    color: var(--fab-text-subtle);
    font-family: var(--font-primary);
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.1em;
    overflow: hidden;
    text-overflow: ellipsis;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .manager-travel-popover-count {
    flex: 0 0 auto;
    color: var(--fab-text-subtle);
    font-family: var(--fab-font-mono);
    font-size: 9px;
    font-weight: 500;
  }

  .manager-travel-popover.is-compact-option-rows {
    padding: 5px;
  }

  .manager-travel-popover.is-compact-option-rows .manager-travel-popover-header {
    flex: 0 0 auto;
  }

  .manager-travel-popover.is-compact-option-rows .manager-travel-option[aria-selected='true'] {
    border-color: var(--fab-accent-border);
    background: var(--fab-accent-soft);
  }

  .manager-travel-popover.is-compact-option-rows .manager-travel-option:hover {
    border-color: var(--fab-border-strong);
    background: var(--fab-surface-raised);
  }

  .manager-travel-popover.is-compact-option-rows
    .manager-travel-option[aria-selected='true']:hover {
    border-color: var(--fab-accent-border);
    background: var(--fab-accent-soft);
  }

  .manager-travel-popover
    [aria-multiselectable='true']
    .manager-travel-option[aria-selected='true'],
  .manager-travel-popover
    [aria-multiselectable='true']
    .manager-travel-option[aria-selected='true']:hover {
    border-color: var(--fab-accent-border);
    background: var(--fab-surface-active);
  }

  .manager-travel-popover-search.is-compact {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 7px;
    min-width: 0;
    box-sizing: border-box;
    height: 30px;
    margin: 2px 7px 6px;
    padding: 0 8px;
    border: 1px solid var(--fab-accent-border);
    border-bottom: 1px solid var(--fab-accent-border);
    border-radius: 8px;
    background: var(--fab-bg-0);
  }

  .manager-travel-popover-search.is-compact > i {
    flex: 0 0 auto;
    color: var(--fab-text-subtle);
    font-size: 9px;
  }

  .manager-travel-popover-search.is-compact input {
    flex: 1;
    align-self: stretch;
    min-width: 0;
    min-height: 0;
    height: auto;
    padding: 0;
    border: 0;
    border-radius: 0;
    color: var(--fab-text);
    background: transparent;
    font-size: 11.5px;
    font-weight: 500;
  }

  .manager-travel-popover-search.is-compact:focus-within {
    border-color: var(--fab-accent);
    box-shadow: inset 0 0 0 1px var(--fab-accent);
  }

  .manager-travel-popover-search.is-compact input:focus-visible {
    outline: none;
    border-color: transparent;
    box-shadow: none;
  }

  .manager-travel-popover.is-compact-option-rows .manager-travel-popover-options {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 7px 0 7px 7px;
    scrollbar-gutter: stable;
    scrollbar-width: thin;
  }

  .manager-travel-popover.is-compact-option-rows .manager-travel-option {
    min-height: 40px;
    padding: 7px;
    gap: 7px;
    border: 1px solid var(--fab-border);
    border-radius: 7px;
    background: var(--fab-bg-3);
  }

  .manager-travel-popover.is-compact-option-rows .manager-travel-portrait {
    width: 24px;
    height: 24px;
  }

  .manager-travel-popover.is-compact-option-rows
    .manager-travel-option
    > i:not(.manager-travel-option-marker) {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: 6px;
    color: var(--fab-text-muted);
    background: var(--fab-surface-raised);
    font-size: 11px;
  }

  .manager-travel-popover.is-compact-option-rows .manager-travel-option {
    font-family: var(--font-primary);
    font-size: 11.5px;
    font-weight: 500;
  }

  .manager-travel-popover.is-compact-option-rows .manager-travel-option-name {
    font-size: 11.5px;
    font-weight: 500;
  }

  .manager-travel-popover.is-compact-option-rows .manager-travel-option-meta {
    font-size: 9.5px;
    font-weight: 400;
  }
</style>
