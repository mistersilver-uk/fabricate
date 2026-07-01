<!-- Svelte 5 runes mode -->
<!--
  RecipeBodyShell is the shared composition every mode body reuses: the ingredient
  set selector, the crafting-check card, a mode-specific results region (passed as
  the `results` snippet), the last-roll result box, and the single craft-button
  primitive. Centralising the layout + craft-gating here keeps the four mode body
  files thin (they differ only in their results snippet + mode marker), which
  avoids the duplicated-lines that would otherwise fail the Sonar gate.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import IngredientSetSelector from './IngredientSetSelector.svelte';
  import CraftingCheckCard from './CraftingCheckCard.svelte';
  import RollResultBox from './RollResultBox.svelte';
  import CraftButton from '../CraftButton.svelte';

  let {
    recipe = null,
    selectedSetId = null,
    craftability = null,
    rollResult = null,
    busy = false,
    onChoose = null,
    onCraft = null,
    results = null,
    selectorIntro = null
  } = $props();

  const sets = $derived(Array.isArray(recipe?.ingredientSets) ? recipe.ingredientSets : []);
  const check = $derived(recipe?.check ?? null);
  const canCraft = $derived(craftability?.canCraft === true);
  const hasCraftedBefore = $derived(Boolean(rollResult));
  const craftLabel = $derived(
    hasCraftedBefore
      ? localize('FABRICATE.App.Crafting.Button.CraftAnother')
      : localize('FABRICATE.App.Crafting.Button.Craft')
  );
  const disabledReason = $derived(
    canCraft ? '' : localize('FABRICATE.App.Crafting.Button.MissingMaterials')
  );
</script>

<div class="crafting-body" data-crafting-body>
  <CraftingCheckCard {check} />
  {#if selectorIntro}
    {@render selectorIntro()}
  {/if}
  <IngredientSetSelector {sets} {selectedSetId} {onChoose} />
  {#if results}
    {@render results()}
  {/if}
  <RollResultBox result={rollResult} />
  <div class="crafting-body-action">
    <CraftButton
      label={craftLabel}
      disabled={!canCraft}
      {disabledReason}
      {busy}
      onCraft={() => onCraft?.()}
    />
  </div>
</div>

<style>
  .crafting-body {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-3);
  }

  .crafting-body-action {
    position: sticky;
    bottom: 0;
    padding-top: var(--fab-space-2);
  }
</style>
