<!-- Svelte 5 runes mode -->
<!--
  RecipeProduceRow is one row of the recipe inspector's Produces list, toned by role: the item's
  image, or a component's cube or a currency or knowledge reward's glyph (issue 1773), its name,
  then a progressive entry's DC, or the group pill and the amount. A currency reward's amount
  carries its unit and a knowledge reward states its kind, since neither is a count of items.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';

  // What an unnamed reward reads as; an unnamed component reads as the host's `unknownName`.
  const UNNAMED_KEYS = Object.freeze({
    currency: 'FABRICATE.App.Crafting.Io.CurrencyReward',
    knowledge: 'FABRICATE.App.Crafting.Io.UnknownRecipe',
  });

  let { row, unknownName = '', dcLabel = null, groupPill = '' } = $props();

  const name = $derived(
    row.name || (UNNAMED_KEYS[row.kind] ? localize(UNNAMED_KEYS[row.kind]) : unknownName)
  );
  const amount = $derived(
    row.kind === 'knowledge'
      ? localize('FABRICATE.App.Crafting.Io.RecipeKnowledge')
      : row.kind === 'currency'
        ? row.amountLabel
        : `×${row.quantity}`
  );
</script>

<div
  class={`manager-recipe-flow-row ${row.failure ? 'is-failure' : 'is-produced'}`}
  data-recipe-produces={row.failure ? 'failure' : 'success'}
  data-recipe-produces-kind={row.kind ?? 'component'}
>
  <span class="manager-recipe-flow-icon" aria-hidden="true">
    {#if row.img}
      <img src={row.img} alt="" />
    {:else}
      <i class={row.icon || 'fas fa-cube'}></i>
    {/if}
  </span>
  <span class="manager-recipe-flow-name">{name}</span>
  {#if dcLabel !== null}
    <!-- Progressive: the component's DC (its ordered "cost") and no quantity, since each entry is
         awarded once and a "×1" would read as if every result is produced together. -->
    <span
      class="manager-recipe-flow-group manager-recipe-flow-dc"
      data-recipe-produces-dc={row.difficulty === null ? '' : String(row.difficulty)}
      >{dcLabel}</span
    >
  {:else}
    {#if groupPill}
      <!-- The GM-authored group name, toned by the role it plays. -->
      <span class={`manager-recipe-flow-group ${row.failure ? 'is-failure' : 'is-success'}`}
        >{groupPill}</span
      >
    {/if}
    <span class="manager-recipe-flow-qty">{amount}</span>
  {/if}
</div>
