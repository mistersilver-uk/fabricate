<!-- Svelte 5 runes mode -->
<!--
  RecipeDetailHeader is the shared header for every recipe-detail mode: the
  thumbnail, name, mode chip, flavor text, the blocking-reasons callout (when the
  recipe is not craftable), and the learn affordance (with a consume-on-learn
  warning). For a redaction teaser it shows only the generic identity + a discovery
  hint — never any ingredient/result detail.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import CraftingThumb from './CraftingThumb.svelte';
  import CraftingStatusBadge from './CraftingStatusBadge.svelte';

  let { recipe = null, onLearn = null } = $props();

  const name = $derived(String(recipe?.name ?? ''));
  const modeLabel = $derived(String(recipe?.modeLabel ?? ''));
  const flavor = $derived(String(recipe?.flavor ?? ''));
  const status = $derived(String(recipe?.browseStatus ?? ''));
  const redacted = $derived(recipe?.redaction?.redacted === true);
  const blockingReasons = $derived(
    Array.isArray(recipe?.blockingReasons) ? recipe.blockingReasons : []
  );
  const canLearn = $derived(recipe?.learn?.canLearn === true);
  const consumeOnLearn = $derived(recipe?.learn?.consumeOnLearn === true);
</script>

<header class="crafting-detail-header" data-recipe-header>
  <div class="crafting-detail-header-top">
    <CraftingThumb src={recipe?.img} alt="" size={56} />
    <div class="crafting-detail-header-copy">
      <h2 class="crafting-detail-name" title={name}>{name}</h2>
      <div class="crafting-detail-header-meta">
        <span class="crafting-detail-mode-chip">{modeLabel}</span>
        <CraftingStatusBadge {status} />
      </div>
    </div>
  </div>

  {#if redacted}
    <p class="crafting-detail-teaser" data-recipe-teaser>
      <i class="fas fa-magnifying-glass" aria-hidden="true"></i>
      {localize('FABRICATE.App.Crafting.Blocking.Discovery')}
    </p>
  {:else}
    {#if flavor}
      <p class="crafting-detail-flavor">{flavor}</p>
    {/if}

    {#if blockingReasons.length > 0}
      <div class="crafting-detail-blocking" data-recipe-blocking role="status">
        <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
        <ul class="crafting-detail-blocking-list">
          {#each blockingReasons as reason, index (index)}
            <li>{reason}</li>
          {/each}
        </ul>
      </div>
    {/if}

    {#if canLearn}
      <div class="crafting-detail-learn" data-recipe-learn>
        <button
          type="button"
          class="crafting-detail-learn-button"
          onclick={() => onLearn?.()}
        >
          <i class="fas fa-book-sparkles" aria-hidden="true"></i>
          <span>{localize('FABRICATE.App.Crafting.Detail.Learn')}</span>
        </button>
        {#if consumeOnLearn}
          <p class="crafting-detail-learn-warning" data-recipe-learn-warning>
            <i class="fas fa-circle-exclamation" aria-hidden="true"></i>
            {localize('FABRICATE.App.Crafting.Detail.ConsumeOnLearnWarning')}
          </p>
        {/if}
      </div>
    {/if}
  {/if}
</header>

<style>
  .crafting-detail-header {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-3);
    padding-bottom: var(--fab-space-3);
    border-bottom: 1px solid var(--fab-border);
  }

  .crafting-detail-header-top {
    display: flex;
    align-items: center;
    gap: var(--fab-space-3);
  }

  .crafting-detail-header-copy {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .crafting-detail-name {
    margin: 0;
    font-size: 18px;
    font-weight: 700;
    line-height: 1.2;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .crafting-detail-header-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .crafting-detail-mode-chip {
    padding: 1px 8px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
    border: 1px solid var(--fab-border);
    background: var(--fab-surface-raised);
    color: var(--fab-text-muted);
  }

  .crafting-detail-flavor {
    margin: 0;
    font-size: 13px;
    color: var(--fab-text-muted);
  }

  .crafting-detail-teaser {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    padding: var(--fab-space-3);
    border: 1px dashed var(--fab-border);
    border-radius: 8px;
    font-size: 13px;
    font-style: italic;
    color: var(--fab-text-muted);
  }

  .crafting-detail-blocking {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: var(--fab-space-3);
    border: 1px solid var(--fab-warning-border);
    border-radius: 8px;
    background: var(--fab-warning-soft);
    color: var(--fab-warning-text);
  }

  .crafting-detail-blocking-list {
    margin: 0;
    padding-left: 16px;
    font-size: 13px;
  }

  .crafting-detail-learn {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .crafting-detail-learn-button {
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    height: auto;
    min-height: 38px;
    padding: 6px 14px;
    border: 1px solid var(--fab-accent);
    border-radius: 8px;
    background: var(--fab-accent-soft);
    color: var(--fab-accent);
    font-weight: 600;
    cursor: pointer;
  }

  .crafting-detail-learn-button:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: 2px;
  }

  .crafting-detail-learn-warning {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    font-size: 12px;
    color: var(--fab-warning-text);
  }
</style>
