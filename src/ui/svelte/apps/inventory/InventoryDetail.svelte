<!-- Svelte 5 runes mode -->
<!--
  InventoryDetail is the right-hand panel for the selected owned item. It shows the
  item's image + name + type/tag/tier chips, a per-source quantity breakdown, the
  essence content it carries, and the recipes that use it ("Used By"). Clicking a
  used-by recipe jumps to the Crafting tab with that recipe selected. Prop-driven;
  navigation routes back through the store seam.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import CraftingThumb from '../crafting/CraftingThumb.svelte';

  let { item = null, onOpenRecipe = null } = $props();

  // Each detail list (sources, used-by, required-for, produced-by, contributors)
  // paginates independently at this many rows.
  const PAGE_SIZE = 6;

  const isEssence = $derived(item?.isEssenceSource === true);
  const isTool = $derived(item?.isTool === true);
  const icon = $derived(
    typeof item?.icon === 'string' && item.icon.trim() !== '' ? item.icon : 'fas fa-mortar-pestle'
  );
  const tags = $derived(Array.isArray(item?.tags) ? item.tags.filter((tag) => String(tag ?? '').trim() !== '') : []);
  const essences = $derived(Array.isArray(item?.essences) ? item.essences : []);
  const sources = $derived(Array.isArray(item?.sources) ? item.sources : []);
  const usedBy = $derived(Array.isArray(item?.usedBy) ? item.usedBy : []);
  const requiredFor = $derived(Array.isArray(item?.requiredFor) ? item.requiredFor : []);
  const producedBy = $derived(Array.isArray(item?.producedBy) ? item.producedBy : []);
  const contributors = $derived(Array.isArray(item?.contributors) ? item.contributors : []);
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

  // Per-section current page, keyed by section id, reset when the item changes.
  let pages = $state({});
  $effect(() => {
    void item?.key;
    pages = {};
  });
  function pageOf(list, key) {
    const count = Math.max(1, Math.ceil((list?.length ?? 0) / PAGE_SIZE));
    return Math.min(Math.max(0, pages[key] ?? 0), count - 1);
  }
  function sliceOf(list, key) {
    const start = pageOf(list, key) * PAGE_SIZE;
    return (Array.isArray(list) ? list : []).slice(start, start + PAGE_SIZE);
  }
  function setPage(key, value) {
    pages = { ...pages, [key]: Math.max(0, value) };
  }

  function hasImg(value) {
    return typeof value === 'string' && value.trim() !== '';
  }
  function roleLabel(role) {
    const key =
      role === 'tool' ? 'RoleTool' : role === 'essence' ? 'RoleEssence' : 'RoleIngredient';
    return localize(`FABRICATE.App.Inventory.Detail.${key}`);
  }
  function kindLabel(kind) {
    const key =
      kind === 'salvage' ? 'KindSalvage' : kind === 'gathering' ? 'KindGathering' : 'KindRecipe';
    return localize(`FABRICATE.App.Inventory.Detail.${key}`);
  }
  function openRecipe(recipeId) {
    if (recipeId) onOpenRecipe?.(recipeId);
  }
</script>

{#snippet pager(list, key)}
  {#if (list?.length ?? 0) > PAGE_SIZE}
    {@const total = list.length}
    {@const page = pageOf(list, key)}
    {@const count = Math.ceil(total / PAGE_SIZE)}
    <div class="inventory-detail-pager" data-inventory-pager={key}>
      <button
        type="button"
        class="inventory-detail-pager-btn"
        disabled={page === 0}
        aria-label={localize('FABRICATE.App.Inventory.Detail.PagePrevious')}
        onclick={() => setPage(key, page - 1)}
      >
        <i class="fas fa-chevron-left" aria-hidden="true"></i>
      </button>
      <span class="inventory-detail-pager-range" data-inventory-pager-range>
        {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} / {total}
      </span>
      <button
        type="button"
        class="inventory-detail-pager-btn"
        disabled={page >= count - 1}
        aria-label={localize('FABRICATE.App.Inventory.Detail.PageNext')}
        onclick={() => setPage(key, page + 1)}
      >
        <i class="fas fa-chevron-right" aria-hidden="true"></i>
      </button>
    </div>
  {/if}
{/snippet}

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
        {#each sliceOf(sources, 'sources') as source (source.actorId)}
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
      {@render pager(sources, 'sources')}
    </section>

    {#if isEssence}
      <section class="inventory-detail-section">
        <p class="inventory-detail-section-title">{localize('FABRICATE.App.Inventory.Detail.ContributingTitle')}</p>
        {#if contributors.length > 0}
          <ul class="inventory-detail-list">
            {#each sliceOf(contributors, 'contributors') as contributor (contributor.componentId)}
              <li class="inventory-detail-row" data-inventory-contributor={contributor.componentId}>
                <CraftingThumb src={contributor.img ?? ''} alt="" size={40} />
                <span class="inventory-detail-row-name">{contributor.name}</span>
                <span class="inventory-detail-row-qty">×{contributor.quantity}</span>
              </li>
            {/each}
          </ul>
          {@render pager(contributors, 'contributors')}
        {:else}
          <p class="inventory-detail-empty-note">{localize('FABRICATE.App.Inventory.Detail.ContributingEmpty')}</p>
        {/if}
      </section>
    {/if}

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
          {#each sliceOf(usedBy, 'used') as use (use.recipeId + ':' + use.role)}
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
        {@render pager(usedBy, 'used')}
      {:else}
        <p class="inventory-detail-empty-note">{localize('FABRICATE.App.Inventory.Detail.UsedByEmpty')}</p>
      {/if}
    </section>

    {#if isTool}
      <section class="inventory-detail-section" data-inventory-section="required">
        <p class="inventory-detail-section-title">{localize('FABRICATE.App.Inventory.Detail.RequiredForTitle')}</p>
        {#if requiredFor.length > 0}
          <ul class="inventory-detail-list">
            {#each sliceOf(requiredFor, 'required') as req, index (req.kind + ':' + (req.recipeId ?? req.name) + ':' + index)}
              <li>
                {#if req.kind === 'recipe' && req.recipeId}
                  <button
                    type="button"
                    class="inventory-detail-recipe"
                    data-inventory-required-for={req.recipeId}
                    onclick={() => openRecipe(req.recipeId)}
                  >
                    <CraftingThumb src={req.img ?? ''} alt="" size={40} />
                    <span class="inventory-detail-row-name">{req.name}</span>
                    <span class="inventory-chip inventory-chip-role">{kindLabel(req.kind)}</span>
                  </button>
                {:else}
                  <div class="inventory-detail-row" data-inventory-required-for-kind={req.kind}>
                    <CraftingThumb src={req.img ?? ''} alt="" size={40} />
                    <span class="inventory-detail-row-name">{req.name}</span>
                    <span class="inventory-chip inventory-chip-role">{kindLabel(req.kind)}</span>
                  </div>
                {/if}
              </li>
            {/each}
          </ul>
          {@render pager(requiredFor, 'required')}
        {:else}
          <p class="inventory-detail-empty-note">{localize('FABRICATE.App.Inventory.Detail.RequiredForEmpty')}</p>
        {/if}
      </section>
    {/if}

    {#if !isEssence}
      <section class="inventory-detail-section">
        <p class="inventory-detail-section-title">{localize('FABRICATE.App.Inventory.Detail.ProducedByTitle')}</p>
        {#if producedBy.length > 0}
          <ul class="inventory-detail-list">
            {#each sliceOf(producedBy, 'produced') as producer, index (producer.kind + ':' + (producer.recipeId ?? producer.name) + ':' + index)}
              <li>
                {#if producer.kind === 'recipe' && producer.recipeId}
                  <button
                    type="button"
                    class="inventory-detail-recipe"
                    data-inventory-produced-by={producer.recipeId}
                    onclick={() => openRecipe(producer.recipeId)}
                  >
                    <CraftingThumb src={producer.img ?? ''} alt="" size={40} />
                    <span class="inventory-detail-row-name">{producer.name}</span>
                    <span class="inventory-chip inventory-chip-role">{kindLabel(producer.kind)}</span>
                  </button>
                {:else}
                  <div class="inventory-detail-row" data-inventory-produced-by-kind={producer.kind}>
                    <CraftingThumb src={producer.img ?? ''} alt="" size={40} />
                    <span class="inventory-detail-row-name">{producer.name}</span>
                    <span class="inventory-chip inventory-chip-role">{kindLabel(producer.kind)}</span>
                  </div>
                {/if}
              </li>
            {/each}
          </ul>
          {@render pager(producedBy, 'produced')}
        {:else}
          <p class="inventory-detail-empty-note">{localize('FABRICATE.App.Inventory.Detail.ProducedByEmpty')}</p>
        {/if}
      </section>
    {/if}
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

  /* Compact per-section pager: prev/next + an "x–y / total" range readout. */
  .inventory-detail-pager {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    padding-top: 2px;
    font-size: 11px;
    color: var(--fab-text-muted);
  }

  .inventory-detail-pager-range {
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .inventory-detail-pager-btn {
    flex: 0 0 auto;
    width: 24px;
    height: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--fab-border);
    border-radius: 6px;
    background: var(--fab-surface);
    color: var(--fab-text);
    cursor: pointer;
  }

  .inventory-detail-pager-btn:hover:not(:disabled) {
    background: var(--fab-surface-raised);
  }

  .inventory-detail-pager-btn:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: 2px;
  }

  .inventory-detail-pager-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }
</style>
