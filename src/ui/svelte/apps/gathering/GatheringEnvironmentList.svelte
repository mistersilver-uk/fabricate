<!-- Svelte 5 runes mode -->
<!--
  GatheringEnvironmentList is the left column of the player gathering tab. It is
  a labeled region (NOT a tablist): a heading ("Environments") with hint text,
  then a scrollable role="list" of EnvironmentCard items. Available environments
  render before locked ones. The inner scroll container clamps width so long
  names / chip rows cannot blow out the column.
-->
<script>
  import { untrack } from 'svelte';
  import { localize } from '../../util/foundryBridge.js';
  import EmptyState from '../../components/EmptyState.svelte';
  import EnvironmentCard from './EnvironmentCard.svelte';
  import SearchField from '../../components/SearchField.svelte';
  import Pagination from '../../components/Pagination.svelte';
  import StatusToggle from '../../components/StatusToggle.svelte';

  let { environments = [], selectedId = null, onSelect = null, services = null } = $props();

  let searchTerm = $state('');
  const normalizedSearchTerm = $derived(searchTerm.trim().toLowerCase());

  // Client-persisted "hide unavailable (locked) environments" toggle. Seeded
  // from the services getter and written back through the services setter, so
  // the component never touches Foundry globals. Every access is optional-chained
  // so a mount with a bare/absent `services` bag defaults to off (show all).
  //
  // The seed is a ONE-TIME read of `services`, and `untrack` says so rather than
  // leaving the compiler to guess (it reported `state_referenced_locally` here). This
  // must NOT become a `$derived`: after mount the toggle is owned by the user, and
  // re-reading the persisted value would silently revert an in-session toggle the
  // moment anything upstream re-passed the services bag. The setter is the sync path
  // in the other direction, so the stored value never goes stale either.
  let hideUnavailable = $state(
    untrack(() => services?.getHideUnavailableEnvironments?.() === true)
  );

  function setHideUnavailable(next) {
    hideUnavailable = next === true;
    services?.setHideUnavailableEnvironments?.(hideUnavailable);
  }

  let pageIndex = $state(0);
  let pageSize = $state(6);
  const pageSizeOptions = [6, 9, 12];

  // Available environments first, then locked teasers.
  const ordered = $derived([
    ...environments.filter((environment) => environment?.locked !== true),
    ...environments.filter((environment) => environment?.locked === true),
  ]);

  // Count of currently unavailable (locked) teasers, sourced from the ordered
  // (pre-search) set. This is what the toggle label surfaces; with an active
  // search term it can exceed the cards actually removed from the current view.
  const lockedCount = $derived(
    ordered.filter((environment) => environment?.locked === true).length
  );

  const hideLabel = $derived(
    lockedCount > 0
      ? localize('FABRICATE.App.Gathering.Environments.HideUnavailableCount', {
          count: lockedCount,
        })
      : localize('FABRICATE.App.Gathering.Environments.HideUnavailable')
  );

  // Filter the already-ordered list by a case-insensitive substring match on
  // name + description, mirroring EnvironmentsBrowserView.
  const filtered = $derived(
    ordered.filter(
      (environment) =>
        !normalizedSearchTerm ||
        `${environment?.name ?? ''} ${environment?.description ?? ''}`
          .toLowerCase()
          .includes(normalizedSearchTerm)
    )
  );

  // Single post-toggle derived list. Render, the empty check, Pagination
  // totalCount, and the pageIndex-reset effect all read THIS list, so the view
  // stays consistent whether or not the toggle is on.
  const visible = $derived(
    hideUnavailable ? filtered.filter((environment) => environment?.locked !== true) : filtered
  );

  const paginated = $derived(visible.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize));

  // Reset to the first page when the visible set shrinks past the current
  // page's offset (search narrowing or the hide toggle emptying later pages).
  $effect(() => {
    if (pageIndex > 0 && pageIndex * pageSize >= visible.length) pageIndex = 0;
  });

  const titleId = 'gathering-environments-title';
  const hideLabelId = 'gathering-environments-hide-label';
</script>

<section class="gathering-env-list" aria-labelledby={titleId}>
  <header class="gathering-env-list-header">
    <h2 id={titleId} class="gathering-env-list-title">
      {localize('FABRICATE.App.Gathering.Environments.Title')}
    </h2>
    <p class="gathering-env-list-hint">
      {localize('FABRICATE.App.Gathering.Environments.Hint')}
    </p>
    <SearchField
      class="gathering-env-search"
      bind:value={searchTerm}
      placeholder={localize('FABRICATE.App.Gathering.Environments.SearchPlaceholder')}
      ariaLabel={localize('FABRICATE.App.Gathering.Environments.SearchLabel')}
    />
    <div
      class="gathering-env-hide-filter"
      title={localize('FABRICATE.App.Gathering.Environments.HideUnavailableTooltip')}
    >
      <StatusToggle
        class="gathering-env-hide-toggle"
        on={hideUnavailable}
        aria-labelledby={hideLabelId}
        data-gathering-env-hide-toggle=""
        onclick={() => setHideUnavailable(!hideUnavailable)}
      />
      <span id={hideLabelId} class="gathering-env-hide-filter-label">{hideLabel}</span>
    </div>
  </header>

  <!--
    THE COLUMN'S FILL IS THE CALLER'S, THE PANEL IS THE PRIMITIVE'S (issue 1514). Both branches
    stand in for the whole scrolling list, so each must GROW to the column the cards would have
    filled — measured at 322.84x569 in the View Lab. `EmptyState` is padding-driven and declares
    no height, and its documented fill escape is `contextClass`, "whose rules live in the global
    sheet" (`EmptyState.svelte:53-55`) — which would put `styles/fabricate.css` on this change's
    path. So `.gathering-env-empty` survives as a caller-owned WRAPPER declaring the grow and the
    centring and nothing else, which is the same answer `PlayerViewState` takes for the same
    reason.
  -->
  {#if filtered.length === 0}
    <div class="gathering-env-empty">
      <!--
        `note`, not `filtered`, although a zero-result SEARCH is a filtered empty: `filtered`
        keeps the dashed panel and this is one line. The distinction stays in the hook value,
        which is the reader `gathering-environment-list-hide.test.js` matches on exactly.
      -->
      <EmptyState
        note
        hint={localize('FABRICATE.App.Gathering.Environments.NoMatches')}
        data-gathering-env-empty="no-matches"
      />
    </div>
  {:else if visible.length === 0}
    <div class="gathering-env-empty">
      <!--
        `filtered` here, because this branch is a multi-element PANEL rather than a line: the
        sentence plus the way out of it. The recovery button is the primitive's `children`,
        which is where `EmptyState.svelte:58-60` puts "the way out of the dead end".
      -->
      <EmptyState
        filtered
        hint={localize('FABRICATE.App.Gathering.Environments.AllUnavailableHidden')}
        data-gathering-env-empty="all-unavailable"
      >
        <button
          type="button"
          class="gathering-env-show-unavailable"
          data-gathering-env-show-unavailable
          onclick={() => setHideUnavailable(false)}
        >
          {localize('FABRICATE.App.Gathering.Environments.ShowUnavailable')}
        </button>
      </EmptyState>
    </div>
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
      totalCount={visible.length}
      {pageSize}
      {pageIndex}
      {pageSizeOptions}
      onPageChange={(n) => (pageIndex = n)}
      onPageSizeChange={(n) => {
        pageSize = n;
        pageIndex = 0;
      }}
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
    gap: var(--fab-space-1);
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

  /* The field's family basis is a toolbar width, which in this column would be its height. */
  .gathering-env-list-header > :global(.gathering-env-search) {
    flex: none;
    min-width: 0;
  }

  /* The shared switch on the left and its label, its accessible name, to the right. */
  .gathering-env-hide-filter {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    width: 100%;
    margin-top: var(--fab-space-2);
  }

  .gathering-env-hide-filter-label {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
    color: var(--fab-text-muted);
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

  /* THE WRAPPER ONLY: the grow and the centring the column needs, and nothing about type or
     ink — those belong to the panel nested inside it now. */
  .gathering-env-empty {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }

  .gathering-env-show-unavailable {
    flex: 0 0 auto;
    padding: var(--fab-space-1) var(--fab-space-3);
    border: 1px solid var(--fab-border);
    border-radius: 6px;
    background: var(--fab-surface);
    color: var(--fab-text);
    font-size: 12px;
    cursor: pointer;
  }

  .gathering-env-show-unavailable:hover {
    background: var(--fab-surface-raised);
  }

  .gathering-env-show-unavailable:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: 1px;
  }
</style>
