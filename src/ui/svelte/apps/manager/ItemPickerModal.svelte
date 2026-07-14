<!-- Svelte 5 runes mode -->
<!--
  Browse/search modal that returns a game-world item UUID. Presentational and
  prop-driven: the parent supplies the candidate `items` (typically from the
  `services.getWorldItemOptions()` service) and handles the picked UUID.

  Chrome mirrors the repo's portal/overlay popovers (SearchablePopover,
  ManagerColorPopover): the dialog is portaled to the `.fabricate-manager` host so
  it escapes any `overflow: hidden`, backed by a dimming overlay, and dismissed on
  outside click / Escape / the close button. Body is a `.manager-search` box + a
  paginated list (reusing the shared Pagination component, page size 10) of item
  rows (icon + name + type); picking a row calls `onPick(uuid)` then `onClose`.

  Props:
   - open: whether the modal is rendered.
   - onPick(uuid): called with the chosen item's UUID before closing.
   - onClose(): called to request dismissal.
   - titleKey? / titleFallback?: localized modal heading.
   - items: [{ uuid, name, img?, type? }] candidate list (default []).
-->
<script>
  import Pagination from '../../components/Pagination.svelte';
  import { dismissOnOutsideClick } from '../../actions/dismissOnOutsideClick.js';
  import { portal } from '../../actions/portal.js';
  import { localize } from '../../util/foundryBridge.js';

  let {
    open = false,
    onPick = () => {},
    onClose = () => {},
    titleKey = 'FABRICATE.Admin.Manager.ItemPicker.Title',
    titleFallback = 'Select an item',
    items = []
  } = $props();

  let search = $state('');
  let pageIndex = $state(0);
  let pageSize = $state(10);
  let dialogRoot = $state(null);

  function text(key, fallback) {
    if (!key) return fallback ?? '';
    const translated = localize(key);
    return translated && translated !== key ? translated : (fallback ?? key);
  }

  function getHost() {
    if (typeof document === 'undefined') return null;
    return document.querySelector('.fabricate-manager') || document.body;
  }

  const normalizedSearch = $derived(search.trim().toLowerCase());
  const filteredItems = $derived(
    normalizedSearch
      ? items.filter(item => String(item?.name || '').toLowerCase().includes(normalizedSearch))
      : items
  );
  const totalPages = $derived(Math.max(1, Math.ceil(filteredItems.length / Math.max(1, pageSize))));
  const clampedPageIndex = $derived(Math.min(pageIndex, totalPages - 1));
  const pagedItems = $derived(
    filteredItems.slice(clampedPageIndex * pageSize, clampedPageIndex * pageSize + pageSize)
  );

  function onSearchInput(value) {
    search = value;
    pageIndex = 0;
  }

  function choose(uuid) {
    onPick(uuid);
    onClose();
  }
</script>

{#if open}
  <div class="manager-item-picker-overlay" data-item-picker-overlay>
    <div
      class="manager-item-picker-dialog"
      bind:this={dialogRoot}
      role="dialog"
      aria-modal="true"
      aria-label={text(titleKey, titleFallback)}
      use:portal={() => getHost()}
      use:dismissOnOutsideClick={{ enabled: open, onDismiss: onClose }}
    >
      <div class="manager-item-picker-header">
        <h3 class="manager-item-picker-title">{text(titleKey, titleFallback)}</h3>
        <button
          type="button"
          class="manager-icon-button"
          data-item-picker-close
          aria-label={text('FABRICATE.Admin.Manager.ItemPicker.Close', 'Close')}
          onclick={() => onClose()}
        >
          <i class="fas fa-xmark" aria-hidden="true"></i>
        </button>
      </div>

      <label class="manager-search">
        <i class="fas fa-search" aria-hidden="true"></i>
        <input
          type="search"
          data-item-picker-search
          value={search}
          oninput={(event) => onSearchInput(event.currentTarget.value)}
          placeholder={text('FABRICATE.Admin.Manager.ItemPicker.SearchPlaceholder', 'Search items...')}
          aria-label={text('FABRICATE.Admin.Manager.ItemPicker.SearchLabel', 'Search items')}
        />
      </label>

      <div class="manager-item-picker-list" role="listbox" aria-label={text(titleKey, titleFallback)}>
        {#each pagedItems as item (item.uuid)}
          <button
            type="button"
            class="manager-item-picker-row"
            role="option"
            aria-selected="false"
            data-item-picker-row={item.uuid}
            title={item.name}
            onclick={() => choose(item.uuid)}
          >
            <span class="manager-item-picker-thumb" aria-hidden="true">
              {#if item.img}<img src={item.img} alt="" />{:else}<i class="fas fa-cube"></i>{/if}
            </span>
            <span class="manager-item-picker-copy">
              <span class="manager-item-picker-name">{item.name}</span>
              {#if item.type}<span class="manager-item-picker-type">{item.type}</span>{/if}
            </span>
          </button>
        {:else}
          <p class="manager-item-picker-empty">{text('FABRICATE.Admin.Manager.ItemPicker.Empty', 'No items found.')}</p>
        {/each}
      </div>

      <Pagination
        totalCount={filteredItems.length}
        pageSize={pageSize}
        pageIndex={clampedPageIndex}
        onPageChange={(next) => pageIndex = next}
        onPageSizeChange={(next) => { pageSize = next; pageIndex = 0; }}
      />
    </div>
  </div>
{/if}

<style>
  .manager-item-picker-overlay {
    display: contents;
  }

  .manager-item-picker-dialog {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 100;
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-3);
    width: min(420px, calc(100vw - 48px));
    max-height: min(560px, calc(100vh - 64px));
    padding: var(--fab-space-4);
    background: var(--fab-bg-1);
    border: 1px solid var(--fab-border-strong);
    border-radius: 12px;
    box-shadow: var(--fab-shadow-lg);
  }

  .manager-item-picker-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--fab-space-2);
  }

  .manager-item-picker-title {
    margin: 0;
    font-weight: 600;
    font-size: 0.95rem;
    color: var(--fab-text);
  }

  .manager-item-picker-list {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-1);
    overflow-y: auto;
    min-height: 0;
    flex: 1;
  }

  .manager-item-picker-row {
    display: flex;
    align-items: center;
    gap: var(--fab-space-3);
    width: 100%;
    padding: var(--fab-space-2) var(--fab-space-3);
    border: 1px solid var(--fab-border);
    border-radius: 10px;
    background: var(--fab-surface-soft);
    text-align: left;
    cursor: pointer;
  }

  .manager-item-picker-row:hover,
  .manager-item-picker-row:focus-visible {
    border-color: var(--fab-accent-border);
    background: var(--fab-surface-raised);
    outline: none;
  }

  .manager-item-picker-thumb {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    flex: 0 0 32px;
    border-radius: 8px;
    background: var(--fab-bg-3);
    color: var(--fab-text-secondary);
    font-size: 0.78rem;
    overflow: hidden;
  }

  .manager-item-picker-thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .manager-item-picker-copy {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2xs);
    min-width: 0;
    flex: 1;
  }

  .manager-item-picker-name {
    font-weight: 600;
    font-size: 0.8rem;
    color: var(--fab-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .manager-item-picker-type {
    font-size: 0.66rem;
    color: var(--fab-text-subtle);
    text-transform: capitalize;
  }

  .manager-item-picker-empty {
    margin: 0;
    padding: var(--fab-space-4);
    text-align: center;
    font-size: 0.72rem;
    color: var(--fab-text-muted);
  }
</style>
