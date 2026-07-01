<!-- Svelte 5 runes mode -->
<!--
  RecipeListRow is one selectable recipe in the left-column browser list. It shows
  the recipe thumbnail, name, mode chip, and a status badge (from
  craftingRecipeStatus). Clicking it selects the recipe (drives the centre detail)
  and highlights the row. An "add to shopping list" affordance is exposed via a
  trailing button so a player can queue materials without opening the detail.

  An uncraftable recipe (the danger tone — missing materials) is called out more
  emphatically: the whole row takes a theme-appropriate error tint and the status
  icon moves onto the (dimmed) thumbnail as a pip, rather than sitting as a small
  meta chip. Warning/neutral/info blockers keep the compact meta badge.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import CraftingThumb from './CraftingThumb.svelte';
  import CraftingStatusBadge from './CraftingStatusBadge.svelte';
  import { craftingRecipeStatus } from '../../util/craftingRecipeStatus.js';

  let {
    recipe = null,
    selected = false,
    favourite = false,
    onSelect = null,
    onAddToShoppingList = null,
    onToggleFavourite = null
  } = $props();

  const id = $derived(String(recipe?.id ?? ''));
  const name = $derived(String(recipe?.name ?? ''));
  const systemName = $derived(String(recipe?.systemName ?? ''));
  const status = $derived(String(recipe?.browseStatus ?? ''));
  const redacted = $derived(recipe?.redaction?.redacted === true);
  const descriptor = $derived(craftingRecipeStatus(status));
  // Danger tone === the player cannot craft this (missing materials). Gate the
  // emphatic error treatment on the tone so the presentation map stays the single
  // source of truth for which statuses read as an error.
  const uncraftable = $derived(descriptor.tone === 'danger');
  const statusLabel = $derived(localize(descriptor.labelKey));

  function select() {
    onSelect?.(id);
  }
  function onRowKey(event) {
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      select();
    }
  }
  function addToList(event) {
    event.stopPropagation();
    onAddToShoppingList?.(id);
  }
  function toggleFavourite(event) {
    event.stopPropagation();
    onToggleFavourite?.(id);
  }
</script>

<div
  class="crafting-recipe-row"
  class:is-selected={selected}
  class:is-uncraftable={uncraftable}
  role="listitem"
  data-recipe-id={id}
  data-selected={selected ? 'true' : 'false'}
  data-recipe-status={status}
>
  <div
    class="crafting-recipe-row-main is-toggle"
    role="button"
    tabindex="0"
    aria-pressed={selected}
    onclick={select}
    onkeydown={onRowKey}
  >
    <span class="crafting-recipe-row-thumb" class:is-uncraftable={uncraftable}>
      <span class="crafting-recipe-row-thumb-media">
        <CraftingThumb src={recipe?.img} alt="" size={44} />
      </span>
      {#if uncraftable}
        <span class="crafting-recipe-row-thumb-scrim" aria-hidden="true"></span>
        <span
          class="crafting-recipe-row-pip"
          data-crafting-status={status}
          role="img"
          aria-label={statusLabel}
          title={statusLabel}
        >
          <i class={descriptor.icon} aria-hidden="true"></i>
        </span>
      {/if}
    </span>
    <span class="crafting-recipe-row-copy">
      <span class="crafting-recipe-row-name" title={name}>{name}</span>
      <span class="crafting-recipe-row-meta">
        <span class="crafting-recipe-row-system">{systemName}</span>
        {#if !uncraftable}
          <CraftingStatusBadge {status} compact />
        {/if}
      </span>
    </span>
    {#if !redacted}
      <div class="crafting-recipe-row-actions">
        <button
          type="button"
          class="crafting-recipe-row-fav"
          class:is-active={favourite}
          aria-pressed={favourite}
          title={localize(
            favourite
              ? 'FABRICATE.App.Crafting.Browser.Unfavourite'
              : 'FABRICATE.App.Crafting.Browser.Favourite'
          )}
          aria-label={localize(
            favourite
              ? 'FABRICATE.App.Crafting.Browser.Unfavourite'
              : 'FABRICATE.App.Crafting.Browser.Favourite'
          )}
          onclick={toggleFavourite}
        >
          <i class="fas fa-star" aria-hidden="true"></i>
        </button>
        <button
          type="button"
          class="crafting-recipe-row-add"
          title={localize('FABRICATE.App.Crafting.Shopping.AddToList')}
          aria-label={localize('FABRICATE.App.Crafting.Shopping.AddToList')}
          onclick={addToList}
        >
          <i class="fas fa-cart-plus" aria-hidden="true"></i>
        </button>
      </div>
    {/if}
  </div>
</div>

<style>
  .crafting-recipe-row {
    box-sizing: border-box;
    /* Keep natural row height inside the scrolling list flex column: without this
       the row shrinks to fit and its overflow:hidden clips the content, collapsing
       the rows instead of letting .crafting-browser-list scroll. */
    flex: 0 0 auto;
    width: 100%;
    border: 1px solid var(--fab-border);
    border-radius: 8px;
    background: var(--fab-surface-soft);
    color: var(--fab-text);
    overflow: hidden;
  }

  .crafting-recipe-row.is-selected {
    border-color: var(--fab-accent);
    background: var(--fab-accent-soft);
  }

  /* Uncraftable (missing materials): tint the whole row with the error family.
     Declared after .is-selected so the error identity survives selection. */
  .crafting-recipe-row.is-uncraftable {
    border-color: var(--fab-danger-border);
    background: var(--fab-danger-soft);
  }

  .crafting-recipe-row.is-uncraftable.is-selected {
    border-color: var(--fab-danger);
  }

  .crafting-recipe-row-main {
    display: flex;
    align-items: center;
    gap: var(--fab-space-3);
    padding: var(--fab-space-2);
    min-height: 60px;
  }

  .crafting-recipe-row-main.is-toggle {
    cursor: pointer;
  }

  .crafting-recipe-row-main.is-toggle:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: -2px;
  }

  /* Thumbnail wrapper: a positioning context for the uncraftable scrim + pip. */
  .crafting-recipe-row-thumb {
    position: relative;
    flex: 0 0 auto;
    display: inline-flex;
  }

  .crafting-recipe-row-thumb-media {
    display: inline-flex;
  }

  /* Fade the artwork so the error pip reads as the focal point. */
  .crafting-recipe-row-thumb.is-uncraftable .crafting-recipe-row-thumb-media {
    opacity: 0.4;
  }

  /* Flat error wash over the dimmed thumbnail (matches CraftingThumb's radius). */
  .crafting-recipe-row-thumb-scrim {
    position: absolute;
    inset: 0;
    border-radius: 6px;
    background: var(--fab-danger-soft);
    pointer-events: none;
  }

  /* The status icon, moved onto the thumbnail as a solid error pip. on-accent is a
     near-black foreground in every theme, legible over the mid-tone danger fill. */
  .crafting-recipe-row-pip {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border-radius: 999px;
    border: 1px solid var(--fab-danger-border);
    background: var(--fab-danger);
    color: var(--fab-on-accent);
    box-shadow: var(--fab-shadow-sm);
    pointer-events: none;
  }

  .crafting-recipe-row-pip i {
    font-size: 11px;
    line-height: 1;
  }

  .crafting-recipe-row-copy {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .crafting-recipe-row-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
  }

  .crafting-recipe-row-meta {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .crafting-recipe-row-system {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 11px;
    color: var(--fab-text-muted);
  }

  .crafting-recipe-row-actions {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    gap: var(--fab-space-1);
  }

  .crafting-recipe-row-fav,
  .crafting-recipe-row-add {
    box-sizing: border-box;
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    min-height: 32px;
    padding: 0;
    border: 1px solid var(--fab-border);
    border-radius: 6px;
    background: var(--fab-surface);
    color: var(--fab-text-muted);
    cursor: pointer;
  }

  .crafting-recipe-row-fav:hover,
  .crafting-recipe-row-add:hover {
    background: var(--fab-surface-raised);
    color: var(--fab-text);
  }

  .crafting-recipe-row-fav:focus-visible,
  .crafting-recipe-row-add:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: 2px;
  }

  /* An active favourite reads as a filled gold star. */
  .crafting-recipe-row-fav.is-active {
    border-color: var(--fab-warning-border);
    background: var(--fab-warning-soft);
    color: var(--fab-warning-text);
  }

  .crafting-recipe-row-fav.is-active:hover {
    color: var(--fab-warning-text);
  }
</style>
