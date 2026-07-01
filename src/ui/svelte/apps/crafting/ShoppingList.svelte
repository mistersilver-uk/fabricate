<!-- Svelte 5 runes mode -->
<!--
  ShoppingList is the default right-column body: a session-scoped queue of recipes
  the player intends to craft, plus the aggregated Have/Need/Missing material
  totals across that queue. The have/need/missing pills reuse the shared
  QuantityTag (same primitive the recipe-detail IoTable uses). Renders an empty
  state when nothing is queued.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import CraftingThumb from './CraftingThumb.svelte';
  import QuantityTag from './QuantityTag.svelte';

  let {
    aggregate = null,
    entries = [],
    onRemove = null,
    onClear = null
  } = $props();

  const queued = $derived(Array.isArray(entries) ? entries : []);
  const ingredients = $derived(Array.isArray(aggregate?.ingredients) ? aggregate.ingredients : []);
  const essences = $derived(Array.isArray(aggregate?.essences) ? aggregate.essences : []);
  const tools = $derived(Array.isArray(aggregate?.tools) ? aggregate.tools : []);
  const isEmpty = $derived(queued.length === 0);
  const allSatisfied = $derived(aggregate?.allSatisfied === true);
</script>

<section class="crafting-shopping" data-crafting-shopping>
  <header class="crafting-shopping-head">
    <p class="crafting-shopping-title">{localize('FABRICATE.App.Crafting.Shopping.Title')}</p>
    {#if !isEmpty}
      <button
        type="button"
        class="crafting-shopping-clear"
        onclick={() => onClear?.()}
      >
        {localize('FABRICATE.App.Crafting.Shopping.Clear')}
      </button>
    {/if}
  </header>

  {#if isEmpty}
    <p class="crafting-shopping-empty" data-crafting-shopping-empty>
      <i class="fas fa-cart-shopping" aria-hidden="true"></i>
      {localize('FABRICATE.App.Crafting.Shopping.Empty')}
    </p>
  {:else}
    <ul class="crafting-shopping-queue">
      {#each queued as entry (entry.recipeId)}
        <li class="crafting-shopping-entry" data-shopping-entry={entry.recipeId}>
          <CraftingThumb src={entry.img} alt="" size={28} />
          <span class="crafting-shopping-entry-name" title={entry.name}>{entry.name}</span>
          <span class="crafting-shopping-entry-qty">×{entry.quantity}</span>
          <button
            type="button"
            class="crafting-shopping-remove"
            title={localize('FABRICATE.App.Crafting.Shopping.Remove')}
            aria-label={localize('FABRICATE.App.Crafting.Shopping.Remove')}
            onclick={() => onRemove?.(entry.recipeId)}
          >
            <i class="fas fa-xmark" aria-hidden="true"></i>
          </button>
        </li>
      {/each}
    </ul>

    <div class="crafting-shopping-materials" data-shopping-materials>
      <p class="crafting-shopping-subtitle">
        {localize('FABRICATE.App.Crafting.Shopping.MaterialsTitle')}
      </p>
      {#if allSatisfied}
        <p class="crafting-shopping-satisfied" data-shopping-satisfied>
          <i class="fas fa-circle-check" aria-hidden="true"></i>
          {localize('FABRICATE.App.Crafting.Shopping.AllSatisfied')}
        </p>
      {/if}
      <ul class="crafting-shopping-mat-list">
        {#each ingredients as ing, index (ing.componentId ?? ing.description ?? index)}
          <li class="crafting-shopping-mat" data-shopping-mat-satisfied={ing.satisfied ? 'true' : 'false'}>
            <span class="crafting-shopping-mat-name">{ing.description}</span>
            <span class="crafting-shopping-mat-tags">
              <QuantityTag
                label={localize('FABRICATE.App.Crafting.Io.Have')}
                value={ing.have ?? 0}
                tone={ing.satisfied ? 'success' : 'neutral'}
              />
              <QuantityTag
                label={localize('FABRICATE.App.Crafting.Io.Need')}
                value={ing.totalNeed ?? 0}
                tone="neutral"
              />
              {#if !ing.satisfied}
                <QuantityTag
                  label={localize('FABRICATE.App.Crafting.Io.Missing')}
                  value={ing.missing ?? 0}
                  tone="danger"
                />
              {/if}
            </span>
          </li>
        {/each}
        {#each essences as ess, index (ess.type ?? index)}
          <li class="crafting-shopping-mat" data-shopping-mat-satisfied={ess.satisfied ? 'true' : 'false'}>
            <span class="crafting-shopping-mat-name">{ess.type}</span>
            <span class="crafting-shopping-mat-tags">
              <QuantityTag
                label={localize('FABRICATE.App.Crafting.Io.Have')}
                value={ess.have ?? 0}
                tone={ess.satisfied ? 'success' : 'neutral'}
              />
              <QuantityTag
                label={localize('FABRICATE.App.Crafting.Io.Need')}
                value={ess.totalNeed ?? 0}
                tone="neutral"
              />
            </span>
          </li>
        {/each}
      </ul>
      {#if tools.length > 0}
        <p class="crafting-shopping-subtitle">{localize('FABRICATE.App.Crafting.Io.Tools')}</p>
        <ul class="crafting-shopping-mat-list">
          {#each tools as tool, index (tool.componentId ?? tool.name ?? index)}
            <li class="crafting-shopping-mat" data-shopping-mat-satisfied={tool.available ? 'true' : 'false'}>
              <span class="crafting-shopping-mat-name">{tool.name}</span>
              <QuantityTag
                label={tool.available
                  ? localize('FABRICATE.App.Crafting.Io.Available')
                  : localize('FABRICATE.App.Crafting.Io.Unavailable')}
                value=""
                tone={tool.available ? 'success' : 'danger'}
              />
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}
</section>

<style>
  .crafting-shopping {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-3);
    height: 100%;
    min-height: 0;
    padding: var(--fab-space-4);
    box-sizing: border-box;
    overflow-y: auto;
  }

  .crafting-shopping-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .crafting-shopping-title {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
  }

  .crafting-shopping-clear {
    box-sizing: border-box;
    height: auto;
    min-height: 28px;
    padding: 2px 10px;
    border: 1px solid var(--fab-border);
    border-radius: 6px;
    background: var(--fab-surface-soft);
    color: var(--fab-text-muted);
    font-size: 12px;
    cursor: pointer;
  }

  .crafting-shopping-clear:hover {
    background: var(--fab-surface-raised);
    color: var(--fab-text);
  }

  .crafting-shopping-empty {
    /* Fill the space under the title and center the icon + hint vertically. */
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    margin: 0;
    padding: var(--fab-space-4);
    text-align: center;
    font-size: 13px;
    color: var(--fab-text-muted);
  }

  .crafting-shopping-empty i {
    font-size: 24px;
  }

  .crafting-shopping-queue,
  .crafting-shopping-mat-list {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .crafting-shopping-entry {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 6px;
    border: 1px solid var(--fab-border);
    border-radius: 6px;
    background: var(--fab-surface-soft);
  }

  .crafting-shopping-entry-name {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
  }

  .crafting-shopping-entry-qty {
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    color: var(--fab-text-muted);
  }

  .crafting-shopping-remove {
    box-sizing: border-box;
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    min-height: 26px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    color: var(--fab-text-muted);
    cursor: pointer;
  }

  .crafting-shopping-remove:hover {
    background: var(--fab-surface-raised);
    color: var(--fab-text);
  }

  .crafting-shopping-subtitle {
    margin: 0;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--fab-text-muted);
  }

  .crafting-shopping-satisfied {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    font-size: 12px;
    color: var(--fab-success-text);
  }

  .crafting-shopping-mat {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 6px 8px;
    border: 1px solid var(--fab-border);
    border-radius: 6px;
    background: var(--fab-surface-soft);
  }

  .crafting-shopping-mat-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
  }

  .crafting-shopping-mat-tags {
    display: inline-flex;
    flex: 0 0 auto;
    gap: 4px;
  }
</style>
