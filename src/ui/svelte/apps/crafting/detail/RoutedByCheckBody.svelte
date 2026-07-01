<!-- Svelte 5 runes mode -->
<!--
  RoutedByCheckBody renders a routed-by-check recipe: the (mandatory) crafting
  check decides which outcome tier is awarded, so the body pairs the inputs IO
  table with the per-tier OutcomeTierTable instead of a single fixed output list.
  Shared composition (set selector, check card, roll box, craft button) lives in
  RecipeBodyShell.
-->
<script>
  import RecipeBodyShell from './RecipeBodyShell.svelte';
  import IoTable from './IoTable.svelte';
  import OutcomeTierTable from './OutcomeTierTable.svelte';

  let {
    recipe = null,
    selectedSetId = null,
    craftability = null,
    rollResult = null,
    onChoose = null
  } = $props();
</script>

<div data-recipe-mode="routedByCheck">
  <RecipeBodyShell {recipe} {selectedSetId} {rollResult} {onChoose}>
    {#snippet results()}
      <IoTable {craftability} result={null} />
      <OutcomeTierTable tiers={recipe?.outcomeTiers ?? []} />
    {/snippet}
  </RecipeBodyShell>
</div>
