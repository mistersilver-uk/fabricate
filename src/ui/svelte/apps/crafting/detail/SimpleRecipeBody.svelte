<!-- Svelte 5 runes mode -->
<!--
  SimpleRecipeBody renders a simple-mode recipe: ingredient set selector, the
  (optional) crafting check, the material IO table (Have/Need/Missing + outputs),
  the last-roll result, and the craft button. All shared composition lives in
  RecipeBodyShell; this body only supplies the IO results region.
-->
<script>
  import RecipeBodyShell from './RecipeBodyShell.svelte';
  import IoTable from './IoTable.svelte';

  let {
    recipe = null,
    selectedSetId = null,
    craftability = null,
    rollResult = null,
    busy = false,
    onChoose = null,
    onCraft = null
  } = $props();
</script>

<div data-recipe-mode="simple">
  <RecipeBodyShell {recipe} {selectedSetId} {craftability} {rollResult} {busy} {onChoose} {onCraft}>
    {#snippet results()}
      <IoTable {craftability} result={recipe?.result} />
    {/snippet}
  </RecipeBodyShell>
</div>
