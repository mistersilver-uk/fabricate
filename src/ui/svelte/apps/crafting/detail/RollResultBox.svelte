<!-- Svelte 5 runes mode -->
<!--
  RollResultBox shows the outcome of the player's most recent craft of the current
  recipe (store.lastRollResult[recipeId]). It is defensive about the result shape:
  it surfaces a success/failure tone, the rolled total and outcome label when
  present, an optional message, and any awarded items. Renders nothing when there
  is no recorded result.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import CraftingThumb from '../CraftingThumb.svelte';

  let { result = null } = $props();

  const success = $derived(result?.success !== false);
  const outcome = $derived(result?.outcome ?? result?.checkResult?.outcome ?? null);
  const total = $derived(result?.total ?? result?.checkResult?.total ?? null);
  const message = $derived(typeof result?.message === 'string' ? result.message : '');
  const items = $derived(
    Array.isArray(result?.items)
      ? result.items
      : Array.isArray(result?.awardedResults)
        ? result.awardedResults
        : []
  );
</script>

{#if result}
  <section
    class="crafting-roll-box"
    class:is-success={success}
    class:is-failure={!success}
    data-recipe-section="roll-result"
    data-roll-success={success ? 'true' : 'false'}
  >
    <header class="crafting-roll-head">
      <i class={`fas ${success ? 'fa-circle-check' : 'fa-circle-xmark'}`} aria-hidden="true"></i>
      <span class="crafting-roll-title">
        {success
          ? localize('FABRICATE.App.Crafting.Run.Completed')
          : localize('FABRICATE.App.Crafting.Run.Failed')}
      </span>
      {#if total !== null && total !== undefined}
        <span class="crafting-roll-total" data-roll-total>{total}</span>
      {/if}
    </header>
    {#if outcome}
      <p class="crafting-roll-outcome">{outcome}</p>
    {/if}
    {#if message}
      <p class="crafting-roll-message">{message}</p>
    {/if}
    {#if items.length > 0}
      <ul class="crafting-roll-awards">
        {#each items as item, index (item.name + index)}
          <li class="crafting-roll-award">
            <CraftingThumb src={item.img} alt="" size={24} />
            <span>{item.name}</span>
            <span class="crafting-roll-award-qty">×{item.qty ?? 1}</span>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
{/if}

<style>
  .crafting-roll-box {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: var(--fab-space-3);
    border: 1px solid var(--fab-border);
    border-radius: 8px;
    background: var(--fab-surface-soft);
  }

  .crafting-roll-box.is-success {
    border-color: var(--fab-success-border);
    background: var(--fab-success-soft);
  }

  .crafting-roll-box.is-failure {
    border-color: var(--fab-danger-border);
    background: var(--fab-danger-soft);
  }

  .crafting-roll-head {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .crafting-roll-box.is-success .crafting-roll-head i {
    color: var(--fab-success-text);
  }

  .crafting-roll-box.is-failure .crafting-roll-head i {
    color: var(--fab-danger-text);
  }

  .crafting-roll-title {
    font-weight: 600;
    font-size: 13px;
  }

  .crafting-roll-total {
    margin-left: auto;
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    font-size: 15px;
  }

  .crafting-roll-outcome,
  .crafting-roll-message {
    margin: 0;
    font-size: 12px;
    color: var(--fab-text-muted);
  }

  .crafting-roll-awards {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .crafting-roll-award {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 2px 8px 2px 2px;
    border: 1px solid var(--fab-border);
    border-radius: 999px;
    background: var(--fab-surface);
    font-size: 12px;
  }

  .crafting-roll-award-qty {
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    color: var(--fab-text-muted);
  }
</style>
