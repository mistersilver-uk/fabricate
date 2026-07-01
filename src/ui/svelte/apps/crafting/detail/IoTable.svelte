<!-- Svelte 5 runes mode -->
<!--
  IoTable shows the recipe's material economy: required ingredients (with
  Have/Need/Missing tags from the per-set evaluateCraftability result), required
  essences and tools, and the produced outputs (result.items). The have/need/
  missing pills reuse the shared QuantityTag so the markup is not duplicated
  against the shopping-list table.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import CraftingThumb from '../CraftingThumb.svelte';
  import QuantityTag from '../QuantityTag.svelte';

  let { craftability = null, result = null } = $props();

  const ingredients = $derived(
    Array.isArray(craftability?.ingredientStates) ? craftability.ingredientStates : []
  );
  const essences = $derived(
    Array.isArray(craftability?.essenceStates) ? craftability.essenceStates : []
  );
  const tools = $derived(Array.isArray(craftability?.toolStates) ? craftability.toolStates : []);
  const outputs = $derived(Array.isArray(result?.items) ? result.items : []);

  function essenceLabel(state) {
    return String(state?.label ?? state?.type ?? state?.essenceType ?? '');
  }
</script>

<section class="crafting-io" data-recipe-section="io">
  {#if ingredients.length > 0}
    <div class="crafting-io-group" data-io-group="ingredients">
      <p class="crafting-detail-section-title">{localize('FABRICATE.App.Crafting.Io.Ingredients')}</p>
      <ul class="crafting-io-grid">
        {#each ingredients as state, index (state.componentId ?? state.description ?? index)}
          <li
            class="crafting-io-tile"
            class:is-sufficient={state.satisfied}
            class:is-insufficient={!state.satisfied}
            data-io-ingredient
            data-io-satisfied={state.satisfied ? 'true' : 'false'}
            title={state.description}
            aria-label={`${state.name ?? state.description ?? ''} — ${localize(
              'FABRICATE.App.Crafting.Io.HaveOfNeed',
              { have: state.have ?? 0, need: state.need ?? 0 }
            )}`}
          >
            <CraftingThumb src={state.img} alt="" size={48} />
            <span
              class="crafting-io-pip"
              class:is-sufficient={state.satisfied}
              class:is-insufficient={!state.satisfied}
              aria-hidden="true"
            >
              {state.have ?? 0}/{state.need ?? 0}
            </span>
          </li>
        {/each}
      </ul>
    </div>
  {/if}

  {#if essences.length > 0}
    <div class="crafting-io-group" data-io-group="essences">
      <p class="crafting-detail-section-title">{localize('FABRICATE.App.Crafting.Io.Essences')}</p>
      <ul class="crafting-io-list">
        {#each essences as state, index (state.type ?? state.essenceType ?? index)}
          <li class="crafting-io-row" data-io-satisfied={state.satisfied ? 'true' : 'false'}>
            <span class="crafting-io-name">{essenceLabel(state)}</span>
            <span class="crafting-io-tags">
              <QuantityTag
                label={localize('FABRICATE.App.Crafting.Io.Have')}
                value={state.have ?? 0}
                tone={state.satisfied ? 'success' : 'neutral'}
              />
              <QuantityTag
                label={localize('FABRICATE.App.Crafting.Io.Need')}
                value={state.need ?? 0}
                tone="neutral"
              />
            </span>
          </li>
        {/each}
      </ul>
    </div>
  {/if}

  {#if tools.length > 0}
    <div class="crafting-io-group" data-io-group="tools">
      <p class="crafting-detail-section-title">{localize('FABRICATE.App.Crafting.Io.Tools')}</p>
      <ul class="crafting-io-list">
        {#each tools as tool, index (tool.componentId ?? tool.name ?? index)}
          <li class="crafting-io-row" data-io-satisfied={tool.available ? 'true' : 'false'}>
            <span class="crafting-io-tool-label">
              <CraftingThumb src={tool.img} alt="" size={28} />
              <span class="crafting-io-name">{tool.name}</span>
            </span>
            <QuantityTag
              label={tool.available
                ? localize('FABRICATE.App.Crafting.Io.Available')
                : localize('FABRICATE.App.Crafting.Io.Unavailable')}
              value=""
              tone={tool.available ? 'success' : 'danger'}
              icon={tool.available ? 'fa-screwdriver-wrench' : 'fa-triangle-exclamation'}
            />
          </li>
        {/each}
      </ul>
    </div>
  {/if}

  {#if outputs.length > 0}
    <div class="crafting-io-group" data-io-group="outputs">
      <p class="crafting-detail-section-title">{localize('FABRICATE.App.Crafting.Io.Output')}</p>
      <ul class="crafting-io-outputs">
        {#each outputs as item, index (item.name + index)}
          <li class="crafting-io-output" data-io-output>
            <CraftingThumb src={item.img} alt="" size={32} />
            <span class="crafting-io-output-name">{item.name}</span>
            <span class="crafting-io-output-qty">×{item.qty}</span>
          </li>
        {/each}
      </ul>
    </div>
  {/if}
</section>

<style>
  .crafting-io {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-3);
  }

  .crafting-io-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .crafting-io-list {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  /* Ingredients render as an inventory-style image grid: each tile is a component
     icon with a top-right have/need pip; the tile border + pip colour signal
     sufficiency (green = enough, red = short). */
  .crafting-io-grid {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-wrap: wrap;
    gap: var(--fab-space-2);
  }

  .crafting-io-tile {
    position: relative;
    flex: 0 0 auto;
    border: 2px solid var(--fab-border);
    border-radius: 8px;
    padding: 2px;
    background: var(--fab-surface-soft);
    line-height: 0;
  }

  .crafting-io-tile.is-sufficient {
    border-color: var(--fab-success-border);
    background: var(--fab-success-soft);
  }

  .crafting-io-tile.is-insufficient {
    border-color: var(--fab-danger-border);
    background: var(--fab-danger-soft);
  }

  /* Corner pip. Solid fill for legibility over the artwork; on-success / on-accent
     are dark-enough foregrounds over the mid-tone success/danger fills in every
     theme (there is no --fab-on-danger token). */
  .crafting-io-pip {
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
    font-size: 10px;
    font-weight: 700;
    line-height: 1;
    font-variant-numeric: tabular-nums;
    box-shadow: var(--fab-shadow-sm);
  }

  .crafting-io-pip.is-sufficient {
    background: var(--fab-success);
    color: var(--fab-on-success);
    border: 1px solid var(--fab-success-border);
  }

  .crafting-io-pip.is-insufficient {
    background: var(--fab-danger);
    color: var(--fab-on-accent);
    border: 1px solid var(--fab-danger-border);
  }

  .crafting-io-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 6px 8px;
    border: 1px solid var(--fab-border);
    border-radius: 6px;
    background: var(--fab-surface-soft);
  }

  .crafting-io-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
  }

  /* Tool row: image tile to the left of the tool name. */
  .crafting-io-tool-label {
    flex: 1 1 auto;
    min-width: 0;
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  .crafting-io-tags {
    display: inline-flex;
    flex: 0 0 auto;
    gap: 4px;
  }

  .crafting-io-outputs {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .crafting-io-output {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 4px 10px 4px 4px;
    border: 1px solid var(--fab-border);
    border-radius: 999px;
    background: var(--fab-surface-soft);
  }

  .crafting-io-output-name {
    font-size: 13px;
  }

  .crafting-io-output-qty {
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    color: var(--fab-text-muted);
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
