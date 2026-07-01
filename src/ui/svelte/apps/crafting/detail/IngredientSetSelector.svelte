<!-- Svelte 5 runes mode -->
<!--
  IngredientSetSelector lets the player pick which ingredient set (route) the craft
  will consume, driving store.chooseIngredientSet. For routed-by-ingredients the
  chosen set determines the product, so each option is a card showing its name, its
  craftable status (craftable / missing N / blocked by tools), and a mini-grid of
  the products that option produces. Renders nothing for a single-set recipe.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import CraftingThumb from '../CraftingThumb.svelte';
  import { ingredientOptionStatus } from '../../../util/ingredientOptionStatus.js';

  let { sets = [], selectedSetId = null, onChoose = null } = $props();

  const options = $derived(Array.isArray(sets) ? sets.filter((set) => set?.id) : []);
  const multiple = $derived(options.length > 1);

  const STATUS_LABEL_KEYS = {
    craftable: 'FABRICATE.App.Crafting.Detail.OptionCraftable',
    blocked: 'FABRICATE.App.Crafting.Detail.OptionBlocked',
    missing: 'FABRICATE.App.Crafting.Detail.OptionMissing',
  };

  function statusOf(set) {
    return ingredientOptionStatus(set?.craftability);
  }
  function statusLabel(status) {
    if (status.token === 'missing') {
      return localize(STATUS_LABEL_KEYS.missing, { count: status.count });
    }
    return localize(STATUS_LABEL_KEYS[status.token] ?? STATUS_LABEL_KEYS.craftable);
  }
  function productsOf(set) {
    return Array.isArray(set?.products) ? set.products : [];
  }
</script>

{#if multiple}
  <section class="crafting-set-selector" data-recipe-section="ingredient-sets">
    <p class="crafting-detail-section-title">
      {localize('FABRICATE.App.Crafting.Detail.IngredientSetsTitle')}
    </p>
    <div class="crafting-option-cards" role="group">
      {#each options as set (set.id)}
        {@const status = statusOf(set)}
        {@const products = productsOf(set)}
        {@const selected = set.id === selectedSetId}
        <button
          type="button"
          class="crafting-option-card"
          class:is-selected={selected}
          data-set-id={set.id}
          data-option-status={status.token}
          aria-pressed={selected}
          onclick={() => onChoose?.(set.id)}
        >
          <div class="crafting-option-head">
            <span class="crafting-option-name">{set.label}</span>
            {#if selected}
              <span class="crafting-option-route">
                {localize('FABRICATE.App.Crafting.Detail.SelectedRoute')}
              </span>
            {/if}
          </div>
          <span
            class={`crafting-option-status tone-${status.tone}`}
            data-option-status-tone={status.tone}
          >
            <i class={status.icon} aria-hidden="true"></i>
            {statusLabel(status)}
          </span>
          {#if products.length > 0}
            <div class="crafting-option-products">
              <span class="crafting-option-products-caption">
                {localize('FABRICATE.App.Crafting.Detail.OptionProduces')}
              </span>
              <ul class="crafting-option-product-grid">
                {#each products as product, index (product.name + index)}
                  <li class="crafting-option-product" title={product.name}>
                    <CraftingThumb src={product.img} alt="" size={40} />
                    <span class="crafting-option-product-pip">×{product.qty}</span>
                  </li>
                {/each}
              </ul>
            </div>
          {/if}
        </button>
      {/each}
    </div>
  </section>
{/if}

<style>
  .crafting-set-selector {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .crafting-option-cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: var(--fab-space-2);
  }

  .crafting-option-card {
    box-sizing: border-box;
    /* height:auto + white-space:normal defeat Foundry's fixed-height / nowrap button
       chrome, which would otherwise collapse the card and overlap its content. */
    height: auto;
    min-height: 0;
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
    padding: var(--fab-space-3);
    border: 1px solid var(--fab-border);
    border-radius: 8px;
    background: var(--fab-surface-soft);
    color: var(--fab-text);
    font: inherit;
    text-align: left;
    white-space: normal;
    line-height: 1.3;
    cursor: pointer;
  }

  .crafting-option-card:hover {
    background: var(--fab-surface-raised);
  }

  .crafting-option-card:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: 2px;
  }

  .crafting-option-card.is-selected {
    border-color: var(--fab-accent);
    background: var(--fab-accent-soft);
  }

  .crafting-option-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .crafting-option-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
    font-size: 13px;
  }

  .crafting-option-route {
    flex: 0 0 auto;
    padding: 1px 8px;
    border-radius: 999px;
    font-size: 10px;
    font-weight: 600;
    border: 1px solid var(--fab-accent-border);
    background: var(--fab-accent-soft);
    color: var(--fab-accent);
    white-space: nowrap;
  }

  /* Status pill: tone-coloured (success / warning / danger) like the shared status
     chips, self-contained here to avoid coupling to the recipe-row badge. */
  .crafting-option-status {
    align-self: flex-start;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 1px 8px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
    border: 1px solid var(--fab-border);
    background: var(--fab-surface-raised);
    color: var(--fab-text-muted);
  }

  .crafting-option-status i {
    font-size: 10px;
  }

  .crafting-option-status.tone-success {
    color: var(--fab-success-text);
    border-color: var(--fab-success-border);
    background: var(--fab-success-soft);
  }

  .crafting-option-status.tone-warning {
    color: var(--fab-warning-text);
    border-color: var(--fab-warning-border);
    background: var(--fab-warning-soft);
  }

  .crafting-option-status.tone-danger {
    color: var(--fab-danger-text);
    border-color: var(--fab-danger-border);
    background: var(--fab-danger-soft);
  }

  .crafting-option-products {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .crafting-option-products-caption {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--fab-text-muted);
  }

  .crafting-option-product-grid {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .crafting-option-product {
    position: relative;
    flex: 0 0 auto;
    line-height: 0;
  }

  /* Opaque backing (not the translucent surface tint) so the count stays legible
     over the component artwork. */
  .crafting-option-product-pip {
    position: absolute;
    top: -6px;
    right: -6px;
    min-width: 18px;
    height: 18px;
    padding: 0 4px;
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    border: 1px solid var(--fab-border-strong);
    background: var(--fab-bg-2);
    color: var(--fab-text);
    font-size: 10px;
    font-weight: 700;
    line-height: 1;
    font-variant-numeric: tabular-nums;
    box-shadow: var(--fab-shadow-sm);
  }

  .crafting-detail-section-title {
    margin: 0;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--fab-text-muted);
  }
</style>
