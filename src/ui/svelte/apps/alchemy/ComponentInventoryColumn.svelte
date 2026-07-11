<!-- Svelte 5 runes mode -->
<!--
  ComponentInventoryColumn — the right column of the Alchemy workbench: the owned
  components the player can place on the bench. A name-search input filters the
  list. Each row shows the component, "X of Y available", an `aria-hidden` grip
  drag handle, and a real focusable `+` add button; unavailable rows carry the
  `disabled` attribute (not merely muted style). Rows are draggable so the
  workbench drop zone can accept them (drag stays mouse-only), and are the
  tap/left-click add affordance (keyboard-reachable). Two empty states: the
  onboarding "no components owned" state (`data-alchemy-empty-inventory`) and the
  distinct "no matches" filtered-empty state when the search hides every row.
  Prop-driven so it can be mounted in isolation.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import EssenceChips from './EssenceChips.svelte';

  let {
    components = [],
    search = '',
    hasComponents = false,
    onAdd = null,
    onSearch = null,
    onDragStart = null
  } = $props();
</script>

<div class="alchemy-inventory">
  <div class="alchemy-inventory-head">
    <div class="alchemy-inventory-title">{localize('FABRICATE.App.Alchemy.YourComponents')}</div>
    <div class="alchemy-inventory-hint">{localize('FABRICATE.App.Alchemy.TapToPlace')}</div>
  </div>

  <label class="alchemy-inventory-search">
    <i class="fas fa-magnifying-glass" aria-hidden="true"></i>
    <input
      type="text"
      value={search}
      placeholder={localize('FABRICATE.App.Alchemy.SearchComponents')}
      aria-label={localize('FABRICATE.App.Alchemy.SearchComponents')}
      oninput={(event) => onSearch?.(event.target.value)}
    />
  </label>

  {#if components.length === 0 && !hasComponents}
    <div class="alchemy-inventory-empty" data-alchemy-empty-inventory>
      <i class="fas fa-box-open" aria-hidden="true"></i>
      <p class="alchemy-inventory-empty-title">{localize('FABRICATE.App.Alchemy.EmptyInventoryTitle')}</p>
      <p class="alchemy-inventory-empty-hint">{localize('FABRICATE.App.Alchemy.EmptyInventoryHint')}</p>
    </div>
  {:else if components.length === 0}
    <div class="alchemy-inventory-empty" data-alchemy-inventory-no-matches>
      <i class="fas fa-magnifying-glass" aria-hidden="true"></i>
      <p class="alchemy-inventory-empty-title">{localize('FABRICATE.App.Alchemy.NoComponentMatchesTitle')}</p>
      <p class="alchemy-inventory-empty-hint">{localize('FABRICATE.App.Alchemy.NoComponentMatchesHint')}</p>
    </div>
  {:else}
    <ul class="alchemy-inventory-list">
      {#each components as component (component.componentId)}
        <li>
          <button
            type="button"
            class="alchemy-inventory-row"
            class:is-disabled={component.disabled}
            disabled={component.disabled}
            draggable={!component.disabled}
            data-alchemy-inventory-row={component.componentId}
            aria-label={localize('FABRICATE.App.Alchemy.AddComponent', { name: component.name })}
            onclick={() => !component.disabled && onAdd?.(component.componentId)}
            ondragstart={(event) => onDragStart?.(event, component.componentId)}
          >
            <span class="alchemy-inventory-grip" aria-hidden="true"><i class="fas fa-grip-vertical"></i></span>
            <span class="alchemy-inventory-icon">
              {#if component.img}
                <img src={component.img} alt="" />
              {:else}
                <i class="fas fa-flask" aria-hidden="true"></i>
              {/if}
            </span>
            <span class="alchemy-inventory-meta">
              <span class="alchemy-inventory-name">{component.name}</span>
              <span class="alchemy-inventory-avail"
                >{localize('FABRICATE.App.Alchemy.Available', {
                  available: component.available,
                  held: component.held
                })}</span
              >
              {#if component.essences?.length}
                <EssenceChips essences={component.essences} />
              {/if}
            </span>
            <span class="alchemy-inventory-add" aria-hidden="true"><i class="fas fa-plus"></i></span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .alchemy-inventory {
    display: flex;
    flex-direction: column;
    min-height: 0;
    height: 100%;
    background: var(--fab-surface-raised);
    border: 1px solid var(--fab-border);
    border-radius: 10px;
    overflow: hidden;
  }

  .alchemy-inventory-head {
    padding: 16px 16px 10px;
    flex: 0 0 auto;
  }

  .alchemy-inventory-title {
    font-family: var(--font-primary);
    font-size: 15px;
    font-weight: 600;
    color: var(--fab-text);
  }

  .alchemy-inventory-hint {
    font-size: 11px;
    color: var(--fab-text-subtle);
    margin-top: 2px;
  }

  .alchemy-inventory-search {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 12px 10px;
    padding: 0 11px;
    height: 34px;
    background: var(--fab-surface);
    border: 1px solid var(--fab-border);
    border-radius: 8px;
    color: var(--fab-text-subtle);
    flex: 0 0 auto;
  }

  .alchemy-inventory-search input {
    flex: 1;
    min-width: 0;
    background: transparent;
    border: 0;
    color: var(--fab-text);
    font-size: 12.5px;
  }

  .alchemy-inventory-list {
    list-style: none;
    margin: 0;
    /* No negative horizontal margin: it would coerce overflow-x to auto (with the
       vertical scroll) and clip the first/last row's focus outline + radius at the
       edges. Padding + outline-offset room keeps the rows uncut. */
    padding: 2px 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 7px;
    overflow-y: auto;
    min-height: 0;
    flex: 1 1 auto;
  }

  .alchemy-inventory-row {
    box-sizing: border-box;
    width: 100%;
    max-width: 100%;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 56px;
    padding: 12px 11px;
    border-radius: 9px;
    border: 1px solid var(--fab-border);
    background: var(--fab-surface);
    color: var(--fab-text);
    cursor: pointer;
    text-align: left;
    /* Reset Foundry's global <button> styling (fixed height + line-height): with a
       fixed height shorter than the essence-bearing content, align-items:center
       pushes the essence chips past the bottom border. height:auto lets the row
       grow so the essences sit inside with breathing room. */
    appearance: none;
    -webkit-appearance: none;
    margin: 0;
    font: inherit;
    line-height: normal;
    height: auto;
    overflow: visible;
  }

  .alchemy-inventory-row:hover:not(.is-disabled) {
    background: var(--fab-surface-active);
  }

  .alchemy-inventory-row:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: 2px;
  }

  .alchemy-inventory-row.is-disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .alchemy-inventory-grip {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--fab-text-disabled);
    font-size: 11px;
    cursor: grab;
  }

  .alchemy-inventory-icon {
    width: 34px;
    height: 34px;
    flex: 0 0 auto;
    border-radius: 8px;
    background: var(--fab-surface-soft);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--fab-tag-peach);
    overflow: hidden;
  }

  .alchemy-inventory-icon img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .alchemy-inventory-meta {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  .alchemy-inventory-name {
    font-size: 12.5px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .alchemy-inventory-avail {
    font-size: 9.5px;
    color: var(--fab-text-subtle);
  }

  .alchemy-inventory-meta :global([data-alchemy-essences]) {
    margin-top: 4px;
  }

  .alchemy-inventory-add {
    width: 26px;
    height: 26px;
    flex: 0 0 auto;
    border-radius: 7px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--fab-accent-soft);
    border: 1px solid var(--fab-accent-border);
    color: var(--fab-accent);
    font-size: 10px;
  }

  .alchemy-inventory-row.is-disabled .alchemy-inventory-add {
    background: var(--fab-surface-soft);
    border-color: var(--fab-border);
    color: var(--fab-text-disabled);
  }

  .alchemy-inventory-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    text-align: center;
    padding: 32px 20px;
    color: var(--fab-text-muted);
    flex: 1 1 auto;
  }

  .alchemy-inventory-empty i {
    font-size: 26px;
  }

  .alchemy-inventory-empty-title {
    margin: 0;
    font-weight: 600;
    color: var(--fab-text-secondary);
  }

  .alchemy-inventory-empty-hint {
    margin: 0;
    font-size: 11px;
  }
</style>
