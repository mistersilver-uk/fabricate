<!-- Svelte 5 runes mode -->
<!--
  RecipeRecents is the compact "recently crafted" strip at the top of the browser.
  Each chip re-selects that recipe. Renders nothing when there are no recents.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import CraftingThumb from './CraftingThumb.svelte';

  let { recents = [], onSelect = null } = $props();

  const items = $derived(Array.isArray(recents) ? recents.filter((entry) => entry?.id) : []);
</script>

{#if items.length > 0}
  <section class="crafting-recents" data-crafting-recents>
    <p class="crafting-recents-title">{localize('FABRICATE.App.Crafting.Browser.RecentsTitle')}</p>
    <div class="crafting-recents-row">
      {#each items as recent (recent.id)}
        <button
          type="button"
          class="crafting-recents-chip"
          data-recent-id={recent.id}
          title={recent.name}
          aria-label={recent.name}
          onclick={() => onSelect?.(recent.id)}
        >
          <CraftingThumb src={recent.img} alt="" size={28} />
          <span class="crafting-recents-name">{recent.name}</span>
        </button>
      {/each}
    </div>
  </section>
{/if}

<style>
  .crafting-recents {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .crafting-recents-title {
    margin: 0;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--fab-text-muted);
  }

  .crafting-recents-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .crafting-recents-chip {
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: auto;
    min-height: 36px;
    max-width: 160px;
    padding: 3px 8px 3px 4px;
    border: 1px solid var(--fab-border);
    border-radius: 999px;
    background: var(--fab-surface-soft);
    color: var(--fab-text);
    cursor: pointer;
  }

  .crafting-recents-chip:hover {
    background: var(--fab-surface-raised);
  }

  .crafting-recents-chip:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: 2px;
  }

  .crafting-recents-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
  }
</style>
