<!-- Svelte 5 runes mode -->
<!--
  RecipeListRow is one selectable recipe in the left-column browser list, drawn as ListRow's
  selectable form (issue 1778): the 38px thumbnail leads, the system, status chip and category are
  its meta, and the favourite and add-to-shopping-list buttons are its trailing controls, beside
  the row's button rather than inside it. Opening the row selects the recipe.

  An uncraftable recipe (the danger tone — missing materials, or a check that refuses this
  character) is called out more emphatically: the row takes ListRow's danger tone, and the status
  icon moves onto the (dimmed) thumbnail as a pip, rather than sitting as a small meta chip.
  Warning/neutral/info blockers keep the compact meta chip.
-->
<script>
  import ListRow from '../../components/ListRow.svelte';
  import Medallion from '../../components/Medallion.svelte';
  import { resolveCraftingArt } from '../../util/craftingArtResolution.js';
  import { localize } from '../../util/foundryBridge.js';
  import { statusChipTone } from '../../util/statusChipTone.js';
  import Chip from '../../components/Chip.svelte';
  import { craftingRecipeStatus } from '../../util/craftingRecipeStatus.js';

  let {
    recipe = null,
    selected = false,
    favourite = false,
    onSelect = null,
    onAddToShoppingList = null,
    onToggleFavourite = null,
  } = $props();

  const id = $derived(String(recipe?.id ?? ''));
  const name = $derived(String(recipe?.name ?? ''));
  const systemName = $derived(String(recipe?.systemName ?? ''));
  // GM-authored category (issue 514). The badge is neutral grouping metadata, shown
  // only for a real (non-`general`) category so the default bucket is not tagged
  // with a redundant "General" chip. categoryLabel arrives pre-localized on the model.
  const category = $derived(String(recipe?.category ?? ''));
  const categoryLabel = $derived(String(recipe?.categoryLabel ?? ''));
  const showCategory = $derived(category !== '' && category !== 'general');
  const status = $derived(String(recipe?.browseStatus ?? ''));
  const redacted = $derived(recipe?.redaction?.redacted === true);
  const descriptor = $derived(craftingRecipeStatus(status));
  // Danger tone === the player cannot craft this (missing materials, or a check that refuses
  // this character). Gate the emphatic error treatment on the tone so the presentation map
  // stays the single source of truth for which statuses read as an error.
  const uncraftable = $derived(descriptor.tone === 'danger');
  const statusLabel = $derived(localize(descriptor.labelKey));
  const favouriteLabel = $derived(
    localize(
      favourite
        ? 'FABRICATE.App.Crafting.Browser.Unfavourite'
        : 'FABRICATE.App.Crafting.Browser.Favourite'
    )
  );
  const addLabel = $derived(localize('FABRICATE.App.Crafting.Shopping.AddToList'));
</script>

{#snippet thumb()}
  <span class="crafting-recipe-row-thumb" class:is-uncraftable={uncraftable}>
    <span class="crafting-recipe-row-thumb-media">
      <Medallion {...resolveCraftingArt(recipe?.img)} alt="" size={38} />
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
{/snippet}

{#snippet meta()}
  <span class="crafting-recipe-row-meta">
    <span class="crafting-recipe-row-system" title={systemName}>{systemName}</span>
    {#if !uncraftable}
      <!-- The row has already said the status in words on the recipe beside it, so this is
           the chip's icon-only face: a square with the label as its accessible NAME rather
           than as a tooltip, which is all the retired badge ever gave it. -->
      <Chip
        density="list"
        iconOnly
        tone={statusChipTone(descriptor.tone)}
        icon={descriptor.icon}
        data-crafting-status={status}
        aria-label={statusLabel}
        title={statusLabel}
      />
    {/if}
    {#if showCategory}
      <span class="crafting-recipe-row-category" title={categoryLabel}>{categoryLabel}</span>
    {/if}
  </span>
{/snippet}

{#snippet actions()}
  <span class="crafting-recipe-row-actions">
    <button
      type="button"
      class="crafting-recipe-row-fav"
      class:is-active={favourite}
      aria-pressed={favourite}
      title={favouriteLabel}
      aria-label={favouriteLabel}
      data-keyboard-focus="true"
      onclick={() => onToggleFavourite?.(id)}
    >
      <i class="fas fa-star" aria-hidden="true"></i>
    </button>
    <button
      type="button"
      class="crafting-recipe-row-add"
      title={addLabel}
      aria-label={addLabel}
      data-keyboard-focus="true"
      onclick={() => onAddToShoppingList?.(id)}
    >
      <i class="fas fa-cart-plus" aria-hidden="true"></i>
    </button>
  </span>
{/snippet}

<ListRow
  class={['crafting-recipe-row', { 'is-selected': selected, 'is-uncraftable': uncraftable }]}
  role="listitem"
  data-recipe-id={id}
  data-selected={selected ? 'true' : 'false'}
  data-recipe-status={status}
  {name}
  density="default"
  tone={uncraftable ? 'danger' : 'neutral'}
  truncateName
  {selected}
  onOpen={() => onSelect?.(id)}
  openProps={{ class: 'crafting-recipe-row-main', 'aria-label': `${name}, ${statusLabel}` }}
  leading={thumb}
  {meta}
  trailing={redacted ? undefined : actions}
/>

<style>
  /* Keep natural row height inside the scrolling list flex column, so the list scrolls rather
     than squashing its rows. */
  :global(.crafting-recipe-row) {
    box-sizing: border-box;
    flex: 0 0 auto;
    width: 100%;
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

  /* Flat error wash over the dimmed thumbnail (matches the shared tile's radius, which
     issue 1506 moved from the retired thumb's 6px to the medallion's 9px). */
  .crafting-recipe-row-thumb-scrim {
    position: absolute;
    inset: 0;
    border-radius: 9px;
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
    pointer-events: none;
  }

  .crafting-recipe-row-pip i {
    font-size: 11px;
    line-height: 1;
  }

  /* One line that never wraps: the system name gives up width first. */
  .crafting-recipe-row-meta {
    flex: 1 1 auto;
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .crafting-recipe-row-system {
    /* The lower-value meta token: it gives up width FIRST so the category badge
       (issue 514) keeps its floor before the system name truncates. It does not
       grow, so the chip and the category follow it on a wide row. */
    flex: 0 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 11px;
    color: var(--fab-text-muted);
  }

  /* Neutral category badge (issue 514): grouping metadata, explicitly NOT a status
     tone. Neutral theme tokens only. It does not shrink and holds at least 6ch, and
     truncates with an ellipsis + hover title at half the meta line so a long custom category name
     cannot blow out the row. */
  .crafting-recipe-row-category {
    box-sizing: border-box;
    flex: 0 0 auto;
    min-width: 6ch;
    max-width: min(9rem, 50%);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding: 1px 6px;
    border: 1px solid var(--fab-border);
    border-radius: 999px;
    background: var(--fab-surface-raised);
    color: var(--fab-text-muted);
    font-size: 11px;
  }

  .crafting-recipe-row-actions {
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
    width: 34px;
    height: 34px;
    min-height: 34px;
    padding: 0;
    border: 1px solid var(--fab-border);
    border-radius: 9px;
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

  /* An active favourite takes the selected face, keeping its gold edge and ink. */
  .crafting-recipe-row-fav.is-active {
    border-color: var(--fab-warning-border);
    background: var(--fab-surface-active);
    color: var(--fab-warning-text);
  }

  .crafting-recipe-row-fav.is-active:hover {
    color: var(--fab-warning-text);
  }
</style>
