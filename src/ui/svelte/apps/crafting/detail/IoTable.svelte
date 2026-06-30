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

  function missingOf(state) {
    const need = Number(state?.need ?? 0);
    const have = Number(state?.have ?? 0);
    return Math.max(0, need - have);
  }
  function essenceLabel(state) {
    return String(state?.label ?? state?.type ?? state?.essenceType ?? '');
  }
</script>

<section class="crafting-io" data-recipe-section="io">
  {#if ingredients.length > 0}
    <div class="crafting-io-group" data-io-group="ingredients">
      <p class="crafting-detail-section-title">{localize('FABRICATE.App.Crafting.Io.Ingredients')}</p>
      <ul class="crafting-io-list">
        {#each ingredients as state, index (state.componentId ?? state.description ?? index)}
          <li class="crafting-io-row" data-io-satisfied={state.satisfied ? 'true' : 'false'}>
            <span class="crafting-io-name">{state.description}</span>
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
              {#if !state.satisfied}
                <QuantityTag
                  label={localize('FABRICATE.App.Crafting.Io.Missing')}
                  value={missingOf(state)}
                  tone="danger"
                />
              {/if}
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
            <span class="crafting-io-name">{tool.name}</span>
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
