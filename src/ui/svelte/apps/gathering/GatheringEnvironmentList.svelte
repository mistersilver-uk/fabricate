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
    onSelect = null,
    services = null
  } = $props();

  let searchTerm = $state('');
  const normalizedSearchTerm = $derived(searchTerm.trim().toLowerCase());

  // Client-persisted "hide unavailable (locked) environments" toggle. Seeded
  // from the services getter and written back through the services setter, so
  // the component never touches Foundry globals. Every access is optional-chained
  // so a mount with a bare/absent `services` bag defaults to off (show all).
  let hideUnavailable = $state(services?.getHideUnavailableEnvironments?.() === true);

  function setHideUnavailable(next) {
    hideUnavailable = next === true;
    services?.setHideUnavailableEnvironments?.(hideUnavailable);
  }

  let pageIndex = $state(0);
  let pageSize = $state(6);
  const pageSizeOptions = [6, 9, 12];

  // Available environments first, then locked teasers.
  const ordered = $derived([
    ...environments.filter(environment => environment?.locked !== true),
    ...environments.filter(environment => environment?.locked === true)
  ]);

  // Count of currently unavailable (locked) teasers, sourced from the ordered
  // (pre-search) set. This is what the toggle label surfaces; with an active
  // search term it can exceed the cards actually removed from the current view.
  const lockedCount = $derived(ordered.filter(environment => environment?.locked === true).length);

  const hideLabel = $derived(lockedCount > 0
    ? localize('FABRICATE.App.Gathering.Environments.HideUnavailableCount', { count: lockedCount })
    : localize('FABRICATE.App.Gathering.Environments.HideUnavailable'));

  // Filter the already-ordered list by a case-insensitive substring match on
  // name + description, mirroring EnvironmentsBrowserView.
  const filtered = $derived(ordered.filter(environment =>
    !normalizedSearchTerm
    || `${environment?.name ?? ''} ${environment?.description ?? ''}`.toLowerCase().includes(normalizedSearchTerm)
  ));

  // Single post-toggle derived list. Render, the empty check, Pagination
  // totalCount, and the pageIndex-reset effect all read THIS list, so the view
  // stays consistent whether or not the toggle is on.
  const visible = $derived(hideUnavailable
    ? filtered.filter(environment => environment?.locked !== true)
    : filtered);

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
    <label class="gathering-env-search">
      <i class="fas fa-search" aria-hidden="true"></i>
      <input
        type="search"
        bind:value={searchTerm}
        placeholder={localize('FABRICATE.App.Gathering.Environments.SearchPlaceholder')}
        aria-label={localize('FABRICATE.App.Gathering.Environments.SearchLabel')}
      />
    </label>
    <div
      class="gathering-env-hide-filter"
      title={localize('FABRICATE.App.Gathering.Environments.HideUnavailableTooltip')}
    >
      <button
        type="button"
        class={`gathering-env-hide-toggle ${hideUnavailable ? 'is-on' : 'is-off'}`}
        aria-pressed={hideUnavailable}
        aria-labelledby={hideLabelId}
        data-gathering-env-hide-toggle
        onclick={() => setHideUnavailable(!hideUnavailable)}
      >
        <span class="gathering-env-hide-toggle-track" aria-hidden="true">
          <span class="gathering-env-hide-toggle-knob"></span>
        </span>
      </button>
      <span id={hideLabelId} class="gathering-env-hide-filter-label">{hideLabel}</span>
    </div>
  </header>

  {#if filtered.length === 0}
    <p class="gathering-env-empty" data-gathering-env-empty="no-matches">
      {localize('FABRICATE.App.Gathering.Environments.NoMatches')}
    </p>
  {:else if visible.length === 0}
    <div class="gathering-env-empty" data-gathering-env-empty="all-unavailable">
      <p class="gathering-env-empty-message">
        {localize('FABRICATE.App.Gathering.Environments.AllUnavailableHidden')}
      </p>
      <button
        type="button"
        class="gathering-env-show-unavailable"
        data-gathering-env-show-unavailable
        onclick={() => setHideUnavailable(false)}
      >
        {localize('FABRICATE.App.Gathering.Environments.ShowUnavailable')}
      </button>
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

  /*
    Full-width filter row beneath the search input: Fabricate's pill switch on
    the left and a descriptive label to its right — the same track+knob control
    used across the GM apps (`.manager-status-toggle`), re-themed here with the
    base `--fab-*` player tokens. The switch is a plain <button> (NOT a
    checkbox), so Foundry paints none of the control and the track/knob are the
    only visual (no On/Off text); the label to its right is the accessible name
    (aria-labelledby). The extra top margin sets the row off from the search.
  */
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

  /*
    Bare, labelless switch: no button chrome (border/background) — the track IS
    the control and carries the on/off signal by recolouring. The knob slides
    across and darkens on so it reads against the accent-filled track.
  */
  .gathering-env-hide-toggle {
    appearance: none;
    -webkit-appearance: none;
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    padding: 0;
    border: 0;
    border-radius: 999px;
    background: none;
    cursor: pointer;
  }

  .gathering-env-hide-toggle:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: 2px;
  }

  .gathering-env-hide-toggle-track {
    display: inline-flex;
    align-items: center;
    width: 24px;
    height: 14px;
    flex: 0 0 24px;
    padding: var(--fab-space-2xs);
    border-radius: 999px;
    background: var(--fab-overlay-light-14);
    transition: background-color 120ms ease;
  }

  .gathering-env-hide-toggle.is-on .gathering-env-hide-toggle-track {
    background: var(--fab-accent);
  }

  .gathering-env-hide-toggle-knob {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--fab-text-muted);
    transition: transform 120ms ease, background-color 120ms ease;
  }

  .gathering-env-hide-toggle.is-on .gathering-env-hide-toggle-knob {
    transform: translateX(10px);
    background: var(--fab-bg-0);
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
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--fab-space-2);
    text-align: center;
    font-size: 12px;
    color: var(--fab-text-muted);
  }

  .gathering-env-empty-message {
    margin: 0;
  }

  .gathering-env-show-unavailable {
    flex: 0 0 auto;
    padding: 4px 10px;
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
