<!-- Svelte 5 runes mode -->
<!--
  A test-only caller for `IngredientSetSelector` that holds the chosen route as `CraftingView`
  does: `store.chooseIngredientSet` moves `selectedSetId` synchronously for every route, blocked
  or short, so the next arrow key starts from the route just chosen.
-->
<script>
  import IngredientSetSelector from '../../../src/ui/svelte/apps/crafting/detail/IngredientSetSelector.svelte';

  let { sets = [], initialSetId = null, onChoose = () => {} } = $props();

  let chosenSetId = $state(null);
  const selectedSetId = $derived(chosenSetId ?? initialSetId);

  function choose(setId) {
    onChoose(setId);
    chosenSetId = setId;
  }
</script>

<IngredientSetSelector {sets} {selectedSetId} onChoose={choose} />
