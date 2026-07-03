<!-- Svelte 5 runes mode -->
<!--
  InventoryDetail is the right-hand panel for the selected owned item. It shows the
  item's image + name + type/tag/tier chips, a per-source quantity breakdown, the
  essence content it carries, and the recipes that use it ("Used By"). Each used-by
  recipe (and the Pin-for-Crafting action) jumps to the Crafting tab with that
  recipe selected. Prop-driven; navigation routes back through the store seam.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import CraftingThumb from '../crafting/CraftingThumb.svelte';

  let { item = null, onOpenRecipe = null } = $props();

  const isEssence = $derived(item?.isEssenceSource === true);
  const icon = $derived(
    typeof item?.icon === 'string' && item.icon.trim() !== '' ? item.icon : 'fas fa-mortar-pestle'
  );
  const tags = $derived(Array.isArray(item?.tags) ? item.tags.filter((tag) => String(tag ?? '').trim() !== '') : []);
  const essences = $derived(Array.isArray(item?.essences) ? item.essences : []);
  const sources = $derived(Array.isArray(item?.sources) ? item.sources : []);
  const usedBy = $derived(Array.isArray(item?.usedBy) ? item.usedBy : []);
  const tierLabel = $derived(
    item?.tier != null && item.tier !== '' ? localize('FABRICATE.App.Inventory.Detail.Tier', { tier: item.tier }) : null
  );
  const typeLabel = $derived(
    localize(
      isEssence
        ? 'FABRICATE.App.Inventory.Detail.TypeEssence'
        : 'FABRICATE.App.Inventory.Detail.TypeComponent'
    )
  );
  const firstRecipeId = $derived(usedBy.length > 0 ? usedBy[0].recipeId : null);

  function hasImg(value) {
    return typeof value === 'string' && value.trim() !== '';
  }
  function roleLabel(role) {
    return localize(
      role === 'tool'
        ? 'FABRICATE.App.Inventory.Detail.RoleTool'
        : 'FABRICATE.App.Inventory.Detail.RoleIngredient'
    );
  }
  function openRecipe(recipeId) {
    if (recipeId) onOpenRecipe?.(recipeId);
  }
</script>

{#if !item}
  <div class="inventory-detail-empty" data-inventory-detail-empty>
    <i class="fas fa-boxes-stacked" aria-hidden="true"></i>
    <p>{localize('FABRICATE.App.Inventory.Detail.SelectHint')}</p>
  </div>
{:else}
  <div class="inventory-detail" data-inventory-detail={item.key}>
    <header class="inventory-detail-header">
      {#if isEssence}
        <span class="inventory-detail-essence" aria-hidden="true"><i class={icon}></i></span>
      {:else}
        <CraftingThumb src={item.img ?? ''} alt="" size={72} />
      {/if}
      <div class="inventory-detail-heading">
        <p class="inventory-detail-name">{item.name}</p>
        <p class="inventory-detail-total">
          {localize('FABRICATE.App.Inventory.Detail.Total', { count: Number(item.totalQuantity ?? 0) })}
        </p>
        <div class="inventory-detail-chips">
          <span class="inventory-chip inventory-chip-type">{typeLabel}</span>
          {#if tierLabel}
            <span class="inventory-chip">{tierLabel}</span>
          {/if}
          {#each tags as tag (tag)}
            <span class="inventory-chip inventory-chip-tag">{tag}</span>
          {/each}
        </div>
      </div>
    </header>

    <section class="inventory-detail-section">
      <p class="inventory-detail-section-title">{localize('FABRICATE.App.Inventory.Detail.SourcesTitle')}</p>
      <ul class="inventory-detail-list">
        {#each sources as source (source.actorId)}
          <li class="inventory-detail-row">
            <span class="inventory-detail-portrait" aria-hidden="true">
              {#if hasImg(source.actorImg)}
                <img src={source.actorImg} alt="" />
              {:else}
                <i class="fas fa-user"></i>
              {/if}
            </span>
            <span class="inventory-detail-row-name">{source.actorName}</span>
            <span class="inventory-detail-row-qty" data-inventory-source-qty>×{source.quantity}</span>
          </li>
        {/each}
      </ul>
    </section>

    {#if essences.length > 0}
      <section class="inventory-detail-section">
        <p class="inventory-detail-section-title">{localize('FABRICATE.App.Inventory.Detail.EssenceContentTitle')}</p>
        <div class="inventory-detail-essences">
          {#each essences as essence (essence.id)}
            <span class="inventory-chip inventory-chip-essence">
              {#if essence.icon}<i class={essence.icon} aria-hidden="true"></i>{/if}
              <span>{essence.name}</span>
              <span class="inventory-chip-qty">×{essence.quantity}</span>
            </span>
          {/each}
        </div>
      </section>
    {/if}

    <section class="inventory-detail-section">
      <p class="inventory-detail-section-title">{localize('FABRICATE.App.Inventory.Detail.UsedByTitle')}</p>
      {#if usedBy.length > 0}
        <ul class="inventory-detail-list">
          {#each usedBy as use (use.recipeId + ':' + use.role)}
            <li>
              <button
                type="button"
                class="inventory-detail-recipe"
                data-inventory-used-by={use.recipeId}
                onclick={() => openRecipe(use.recipeId)}
              >
                <CraftingThumb src={use.recipeImg ?? ''} alt="" size={40} />
                <span class="inventory-detail-row-name">{use.recipeName}</span>
                <span class="inventory-chip inventory-chip-role">{roleLabel(use.role)}</span>
              </button>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="inventory-detail-empty-note">{localize('FABRICATE.App.Inventory.Detail.UsedByEmpty')}</p>
      {/if}
    </section>

    <div class="inventory-detail-actions">
      <button
        type="button"
        class="inventory-detail-pin"
        data-inventory-pin
        disabled={!firstRecipeId}
        onclick={() => openRecipe(firstRecipeId)}
      >
        <i class="fas fa-thumbtack" aria-hidden="true"></i>
        <span>{localize('FABRICATE.App.Inventory.Detail.PinForCrafting')}</span>
      </button>
    </div>
  </div>
{/if}

<style>
  .inventory-detail {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-4);
    height: 100%;
    min-height: 0;
    padding: var(--fab-space-4);
    overflow-y: auto;
  }

  .inventory-detail-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    height: 100%;
    padding: var(--fab-space-4);
    text-align: center;
    color: var(--fab-text-muted);
  }

  .inventory-detail-empty i {
    font-size: 28px;
    opacity: 0.7;
  }

  .inventory-detail-empty p {
    margin: 0;
    font-size: 13px;
  }

  .inventory-detail-header {
    display: flex;
    gap: 12px;
    align-items: flex-start;
  }

  .inventory-detail-essence {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 72px;
    height: 72px;
    border-radius: 6px;
    background: var(--fab-accent-soft);
    color: var(--fab-accent);
    font-size: 28px;
  }

  .inventory-detail-heading {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .inventory-detail-name {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
  }

  .inventory-detail-total {
    margin: 0;
    font-size: 12px;
    color: var(--fab-text-muted);
    font-variant-numeric: tabular-nums;
  }

  .inventory-detail-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 2px;
  }

  .inventory-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 1px 8px;
    border-radius: 999px;
    border: 1px solid var(--fab-border);
    background: var(--fab-surface-raised);
    color: var(--fab-text-muted);
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
  }

  .inventory-chip-type {
    border-color: var(--fab-accent-border);
    background: var(--fab-accent-soft);
    color: var(--fab-accent);
  }

  .inventory-chip-qty {
    font-variant-numeric: tabular-nums;
    color: var(--fab-text);
  }

  .inventory-detail-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .inventory-detail-section-title {
    margin: 0;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--fab-text-muted);
  }

  .inventory-detail-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  /* Row height + padding mirror the Crafting browser's RecipeListRow so the
     thumbnail sits framed with vertical breathing room rather than edge-to-edge. */
  .inventory-detail-row,
  .inventory-detail-recipe {
    box-sizing: border-box;
    width: 100%;
    display: flex;
    align-items: center;
    gap: var(--fab-space-3);
    padding: var(--fab-space-2);
    min-height: 56px;
    border: 1px solid var(--fab-border);
    border-radius: 8px;
    background: var(--fab-surface-soft);
    color: var(--fab-text);
    text-align: left;
  }

  .inventory-detail-recipe {
    cursor: pointer;
  }

  .inventory-detail-recipe:hover {
    background: var(--fab-surface-raised);
    border-color: var(--fab-accent-border);
  }

  .inventory-detail-recipe:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: 2px;
  }

  .inventory-detail-portrait {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: 6px;
    overflow: hidden;
    background: var(--fab-surface-raised);
    color: var(--fab-text-muted);
    font-size: 15px;
  }

  .inventory-detail-portrait img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .inventory-detail-row-name {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
  }

  .inventory-detail-row-qty {
    flex: 0 0 auto;
    font-size: 12px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--fab-text);
  }

  .inventory-chip-role {
    flex: 0 0 auto;
  }

  .inventory-detail-essences {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .inventory-chip-essence i {
    font-size: 10px;
  }

  .inventory-detail-empty-note {
    margin: 0;
    font-size: 12px;
    color: var(--fab-text-muted);
  }

  .inventory-detail-actions {
    margin-top: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .inventory-detail-pin {
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    min-height: 38px;
    padding: 8px 12px;
    border: 1px solid var(--fab-accent-border);
    border-radius: 8px;
    background: var(--fab-accent-soft);
    color: var(--fab-accent);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }

  .inventory-detail-pin:hover:not(:disabled) {
    background: var(--fab-accent);
    color: var(--fab-on-accent, var(--fab-surface));
  }

  .inventory-detail-pin:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: 2px;
  }

  .inventory-detail-pin:disabled {
    opacity: 0.5;
    cursor: default;
  }
</style>
