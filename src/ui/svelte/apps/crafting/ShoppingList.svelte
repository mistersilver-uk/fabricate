<!-- Svelte 5 runes mode -->
<!--
  ShoppingList is the default right-column body: an acquisition planner. It always
  shows three summary cards (planned recipes / missing components / unavailable
  tools), then either an empty state or three cards — the recipe queue (left-click a
  row to add one, right-click to remove one, × to drop it), the components still to
  acquire (missing ingredients + missing essences only), and the tools to acquire or
  repair. Fully-owned components never appear.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import CraftingEssenceThumb from './CraftingEssenceThumb.svelte';
  import CraftingThumb from './CraftingThumb.svelte';

  let {
    aggregate = null,
    entries = [],
    onIncrement = null,
    onDecrement = null,
    onRemove = null,
    onClear = null
  } = $props();

  const queued = $derived(Array.isArray(entries) ? entries : []);
  const isEmpty = $derived(queued.length === 0);

  const ingredients = $derived(Array.isArray(aggregate?.ingredients) ? aggregate.ingredients : []);
  const essences = $derived(Array.isArray(aggregate?.essences) ? aggregate.essences : []);
  const tools = $derived(Array.isArray(aggregate?.tools) ? aggregate.tools : []);

  function displayName(value, fallback) {
    return typeof value === 'string' && value.trim() ? value : (fallback ?? '');
  }

  // Missing ingredient components + missing essences, folded into one acquire list.
  // Only shortfalls appear (satisfied entries drop out entirely).
  const acquireComponents = $derived([
    ...ingredients
      .filter((ing) => ing?.satisfied !== true)
      .map((ing) => ({
        key: `ing:${ing.componentId ?? ing.description ?? ing.name}`,
        name: displayName(ing.name, ing.description),
        img: ing.img ?? null,
        isEssence: ing.isEssence === true,
        icon: ing.icon ?? null,
        have: ing.have ?? 0,
        need: ing.totalNeed ?? 0
      })),
    ...essences
      .filter((ess) => ess?.satisfied !== true)
      .map((ess) => ({
        key: `ess:${ess.type}`,
        name: displayName(ess.name, ess.type),
        icon: ess.icon ?? null,
        isEssence: true,
        have: ess.have ?? 0,
        need: ess.totalNeed ?? 0
      }))
  ]);

  const acquireTools = $derived(
    tools
      .filter((tool) => tool?.available !== true)
      .map((tool) => ({
        key: `tool:${tool.componentId ?? tool.name}`,
        name: tool.name ?? '',
        img: tool.img ?? null,
        needsRepair: tool.needsRepair === true
      }))
  );

  const plannedRecipes = $derived(queued.length);
  const missingComponentsCount = $derived(acquireComponents.length);
  const unavailableToolsCount = $derived(acquireTools.length);

  function ownedLabel(row) {
    return localize('FABRICATE.App.Crafting.Shopping.Owned', { have: row.have, need: row.need });
  }
  function onEntryKey(recipeId, event) {
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      onIncrement?.(recipeId);
    }
  }
  function onEntryContext(recipeId, event) {
    event.preventDefault();
    onDecrement?.(recipeId);
  }
  function onEntryRemove(recipeId, event) {
    event.stopPropagation();
    onRemove?.(recipeId);
  }
</script>

<section class="crafting-shopping" data-crafting-shopping>
  <header class="crafting-shopping-head">
    <p class="crafting-shopping-title">{localize('FABRICATE.App.Crafting.Shopping.Title')}</p>
    {#if !isEmpty}
      <button type="button" class="crafting-shopping-clear" onclick={() => onClear?.()}>
        {localize('FABRICATE.App.Crafting.Shopping.Clear')}
      </button>
    {/if}
  </header>

  <div class="crafting-shopping-summary" data-shopping-summary>
    <div class="crafting-shopping-summary-card" data-summary="recipes">
      <span class="crafting-shopping-summary-value">
        <i class="fas fa-scroll" aria-hidden="true"></i>
        <span class="crafting-shopping-summary-count">{plannedRecipes}</span>
      </span>
      <span class="crafting-shopping-summary-label"
        >{localize('FABRICATE.App.Crafting.Shopping.PlannedRecipes')}</span
      >
    </div>
    <div
      class="crafting-shopping-summary-card"
      class:is-alert={missingComponentsCount > 0}
      data-summary="components"
    >
      <span class="crafting-shopping-summary-value">
        <i class="fas fa-cubes" aria-hidden="true"></i>
        <span class="crafting-shopping-summary-count">{missingComponentsCount}</span>
      </span>
      <span class="crafting-shopping-summary-label"
        >{localize('FABRICATE.App.Crafting.Shopping.MissingComponents')}</span
      >
    </div>
    <div
      class="crafting-shopping-summary-card"
      class:is-alert={unavailableToolsCount > 0}
      data-summary="tools"
    >
      <span class="crafting-shopping-summary-value">
        <i class="fas fa-screwdriver-wrench" aria-hidden="true"></i>
        <span class="crafting-shopping-summary-count">{unavailableToolsCount}</span>
      </span>
      <span class="crafting-shopping-summary-label"
        >{localize('FABRICATE.App.Crafting.Shopping.UnavailableTools')}</span
      >
    </div>
  </div>

  {#if isEmpty}
    <p class="crafting-shopping-empty" data-crafting-shopping-empty>
      <i class="fas fa-cart-shopping" aria-hidden="true"></i>
      {localize('FABRICATE.App.Crafting.Shopping.Empty')}
    </p>
  {:else}
    <div class="crafting-shopping-scroll">
      <div class="crafting-shopping-card">
        <p class="crafting-shopping-card-title">
          {localize('FABRICATE.App.Crafting.Shopping.RecipesTitle')}
        </p>
        <ul class="crafting-shopping-queue">
          {#each queued as entry (entry.recipeId)}
            <li
              class="crafting-shopping-entry"
              data-shopping-entry={entry.recipeId}
              role="button"
              tabindex="0"
              title={entry.name}
              onclick={() => onIncrement?.(entry.recipeId)}
              oncontextmenu={(event) => onEntryContext(entry.recipeId, event)}
              onkeydown={(event) => onEntryKey(entry.recipeId, event)}
            >
              <CraftingThumb src={entry.img} alt="" size={28} />
              <span class="crafting-shopping-entry-name">{entry.name}</span>
              <span class="crafting-shopping-entry-qty">×{entry.quantity}</span>
              <button
                type="button"
                class="crafting-shopping-remove"
                title={localize('FABRICATE.App.Crafting.Shopping.Remove')}
                aria-label={localize('FABRICATE.App.Crafting.Shopping.Remove')}
                onclick={(event) => onEntryRemove(entry.recipeId, event)}
              >
                <i class="fas fa-xmark" aria-hidden="true"></i>
              </button>
            </li>
          {/each}
        </ul>
      </div>

      {#if acquireComponents.length > 0}
        <div class="crafting-shopping-card" data-shopping-acquire-components>
          <p class="crafting-shopping-card-title">
            {localize('FABRICATE.App.Crafting.Shopping.AcquireComponents')}
          </p>
          <ul class="crafting-shopping-acquire">
            {#each acquireComponents as row (row.key)}
              <li class="crafting-shopping-acquire-row">
                {#if row.isEssence}
                  <CraftingEssenceThumb icon={row.icon} size={28} />
                {:else}
                  <CraftingThumb src={row.img} alt="" size={28} />
                {/if}
                <span class="crafting-shopping-acquire-name" title={row.name}>{row.name}</span>
                <span class="crafting-shopping-chip tone-danger">{ownedLabel(row)}</span>
              </li>
            {/each}
          </ul>
        </div>
      {/if}

      {#if acquireTools.length > 0}
        <div class="crafting-shopping-card" data-shopping-acquire-tools>
          <p class="crafting-shopping-card-title">
            {localize('FABRICATE.App.Crafting.Shopping.AcquireTools')}
          </p>
          <ul class="crafting-shopping-acquire">
            {#each acquireTools as tool (tool.key)}
              <li class="crafting-shopping-acquire-row">
                <CraftingThumb src={tool.img} alt="" size={28} />
                <span class="crafting-shopping-acquire-name" title={tool.name}>{tool.name}</span>
                <span
                  class={`crafting-shopping-chip ${tool.needsRepair ? 'tone-warning' : 'tone-danger'}`}
                  data-shopping-tool-mode={tool.needsRepair ? 'repair' : 'acquire'}
                >
                  <i
                    class={`fas ${tool.needsRepair ? 'fa-wrench' : 'fa-cart-plus'}`}
                    aria-hidden="true"
                  ></i>
                  {tool.needsRepair
                    ? localize('FABRICATE.App.Crafting.Shopping.Repair')
                    : localize('FABRICATE.App.Crafting.Shopping.Acquire')}
                </span>
              </li>
            {/each}
          </ul>
        </div>
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
  }

  .crafting-shopping-head {
    flex: 0 0 auto;
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

  /* Three always-visible summary cards. */
  .crafting-shopping-summary {
    flex: 0 0 auto;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--fab-space-2);
  }

  .crafting-shopping-summary-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: var(--fab-space-2);
    border: 1px solid var(--fab-border);
    border-radius: 8px;
    background: var(--fab-surface-soft);
    text-align: center;
  }

  .crafting-shopping-summary-card.is-alert {
    border-color: var(--fab-danger-border);
    background: var(--fab-danger-soft);
  }

  /* Icon + count share a line; the label sits beneath. */
  .crafting-shopping-summary-value {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .crafting-shopping-summary-card i {
    font-size: 14px;
    color: var(--fab-text-muted);
  }

  .crafting-shopping-summary-card.is-alert i {
    color: var(--fab-danger-text);
  }

  .crafting-shopping-summary-count {
    font-size: 18px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .crafting-shopping-summary-label {
    font-size: 10px;
    line-height: 1.2;
    color: var(--fab-text-muted);
  }

  .crafting-shopping-empty {
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

  /* The card stack scrolls; the header + summary stay pinned above it. */
  .crafting-shopping-scroll {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-3);
    padding-right: 2px;
  }

  .crafting-shopping-card {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: var(--fab-space-3);
    border: 1px solid var(--fab-border);
    border-radius: 8px;
    background: var(--fab-surface-soft);
  }

  .crafting-shopping-card-title {
    margin: 0;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--fab-text-muted);
  }

  .crafting-shopping-queue,
  .crafting-shopping-acquire {
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
    background: var(--fab-surface);
    cursor: pointer;
  }

  .crafting-shopping-entry:hover {
    background: var(--fab-surface-raised);
  }

  .crafting-shopping-entry:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: -2px;
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
    flex: 0 0 auto;
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

  .crafting-shopping-remove:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: 1px;
  }

  .crafting-shopping-acquire-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 6px;
    border: 1px solid var(--fab-border);
    border-radius: 6px;
    background: var(--fab-surface);
  }

  .crafting-shopping-acquire-name {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
  }

  .crafting-shopping-chip {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 1px 8px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  .crafting-shopping-chip i {
    font-size: 10px;
  }

  .crafting-shopping-chip.tone-danger {
    color: var(--fab-danger-text);
    border: 1px solid var(--fab-danger-border);
    background: var(--fab-danger-soft);
  }

  .crafting-shopping-chip.tone-warning {
    color: var(--fab-warning-text);
    border: 1px solid var(--fab-warning-border);
    background: var(--fab-warning-soft);
  }
</style>
