<!-- Svelte 5 runes mode -->
<!--
  GatheringEnvironmentList is the left column of the player gathering tab. It is
  a labeled region (NOT a tablist): a heading ("Environments") with hint text,
  then a scrollable role="list" of EnvironmentCard items. Available environments
  render before locked ones. The inner scroll container clamps width so long
  names / chip rows cannot blow out the column.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import EnvironmentCard from './EnvironmentCard.svelte';
  import Pagination from '../../components/Pagination.svelte';

  let {
    environments = [],
    selectedId = null,
    onSelect = null
  } = $props();

  let searchTerm = $state('');
  const normalizedSearchTerm = $derived(searchTerm.trim().toLowerCase());

  let pageIndex = $state(0);
  let pageSize = $state(6);
  const pageSizeOptions = [6, 9, 12];

  // Available environments first, then locked teasers.
  const ordered = $derived([
    ...environments.filter(environment => environment?.locked !== true),
    ...environments.filter(environment => environment?.locked === true)
  ]);

  // Filter the already-ordered list by a case-insensitive substring match on
  // name + description, mirroring EnvironmentsBrowserView.
  const filtered = $derived(ordered.filter(environment =>
    !normalizedSearchTerm
    || `${environment?.name ?? ''} ${environment?.description ?? ''}`.toLowerCase().includes(normalizedSearchTerm)
  ));

  const paginated = $derived(filtered.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize));

  // Reset to the first page when search shrinks the result set past the
  // current page's offset.
  $effect(() => {
    if (pageIndex > 0 && pageIndex * pageSize >= filtered.length) pageIndex = 0;
  });

  const titleId = 'gathering-environments-title';
</script>

<section class="gathering-env-list" aria-labelledby={titleId}>
  <header class="gathering-env-list-header">
    <h2 id={titleId} class="gathering-env-list-title">
      {localize('FABRICATE.App.Gathering.Environments.Title')}
    </h2>
    <p class="gathering-env-list-hint">
      {localize('FABRICATE.App.Gathering.Environments.Hint')}
    </p>
    <label class="gathering-env-search">
      <i class="fas fa-search" aria-hidden="true"></i>
      <input
        type="search"
        bind:value={searchTerm}
        placeholder={localize('FABRICATE.App.Gathering.Environments.SearchPlaceholder')}
        aria-label={localize('FABRICATE.App.Gathering.Environments.SearchLabel')}
      />
    </label>
  </header>

  {#if filtered.length === 0}
    <p class="gathering-env-empty">
      {localize('FABRICATE.App.Gathering.Environments.NoMatches')}
    </p>
  {:else}
    <div class="gathering-env-list-scroll" role="list">
      {#each paginated as environment (environment.id)}
        <EnvironmentCard
          {environment}
          selectionMode={environment.selectionMode === 'blind' ? 'blind' : 'targeted'}
          {selectedId}
          {onSelect}
        />
      {/each}
    </div>
  {/if}

  <div class="gathering-env-pagination">
    <Pagination
      totalCount={filtered.length}
      {pageSize}
      {pageIndex}
      {pageSizeOptions}
      onPageChange={(n) => pageIndex = n}
      onPageSizeChange={(n) => { pageSize = n; pageIndex = 0; }}
    />
  </div>
</section>

<style>
  .gathering-env-list {
    display: flex;
    flex-direction: column;
    min-height: 0;
    min-width: 0;
    height: 100%;
    gap: var(--fab-space-3);
  }

  .gathering-env-list-header {
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .gathering-env-list-title {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--fab-text);
  }

  .gathering-env-list-hint {
    margin: 0;
    font-size: 12px;
    color: var(--fab-text-muted);
  }

  .gathering-env-search {
    position: relative;
    display: block;
  }

  .gathering-env-search i {
    position: absolute;
    left: 10px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--fab-text-muted);
    pointer-events: none;
  }

  .gathering-env-search input {
    width: 100%;
    height: 34px;
    padding: 0 10px 0 32px;
    border: 1px solid var(--fab-border);
    border-radius: 6px;
    background: var(--fab-surface);
    color: var(--fab-text);
  }

  .gathering-env-search input:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: 1px;
  }

  .gathering-env-list-scroll {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    min-width: 0;
    overflow: hidden;
    overflow-y: auto;
    padding-right: var(--fab-space-2);
    scrollbar-gutter: stable;
  }

  .gathering-env-empty {
    flex: 1 1 auto;
    margin: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    font-size: 12px;
    color: var(--fab-text-muted);
  }

  .gathering-env-pagination {
    flex: 0 0 auto;
  }

  /*
    Pagination.svelte renders .manager-pagination* + .manager-icon-button markup
    that is .fabricate-manager-scoped in the GM app and therefore UNSTYLED in
    the player app. Theme it here with base --fab-* tokens.
  */
  .gathering-env-pagination :global(.manager-pagination) {
    /*
      Single inline row in the narrow (~300px) column: never wrap, keep the
      controls compact, and let only the summary shrink (with an ellipsis) so
      the nav + per-page stay on one line with the rest of the details.
    */
    display: flex;
    flex-wrap: nowrap;
    align-items: center;
    gap: var(--fab-space-2);
    padding: var(--fab-space-2) 0 0;
    border-top: 1px solid var(--fab-border);
    font-size: 12px;
    color: var(--fab-text-muted);
  }

  .gathering-env-pagination :global(.manager-pagination-summary) {
    flex: 0 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .gathering-env-pagination :global(.manager-pagination-nav) {
    flex: 0 0 auto;
    display: inline-flex;
    gap: 4px;
    align-items: center;
  }

  .gathering-env-pagination :global(.manager-pagination-page) {
    color: var(--fab-text);
    white-space: nowrap;
  }

  .gathering-env-pagination :global(.manager-pagination-size) {
    flex: 0 0 auto;
    display: inline-flex;
    gap: 6px;
    align-items: center;
    margin-left: auto;
    white-space: nowrap;
  }

  .gathering-env-pagination :global(.manager-pagination-size select) {
    height: 26px;
    border: 1px solid var(--fab-border);
    border-radius: 6px;
    background: var(--fab-surface);
    color: var(--fab-text);
  }

  .gathering-env-pagination :global(.manager-icon-button) {
    flex: 0 0 auto;
    width: 26px;
    height: 26px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--fab-border);
    border-radius: 6px;
    background: var(--fab-surface);
    color: var(--fab-text);
    cursor: pointer;
  }

  .gathering-env-pagination :global(.manager-icon-button:disabled) {
    opacity: 0.5;
    cursor: default;
  }

  .gathering-env-pagination :global(.manager-icon-button:hover:not(:disabled)) {
    background: var(--fab-surface-raised);
  }
</style>
