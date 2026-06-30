<!-- Svelte 5 runes mode -->
<!--
  RecipeDetail is the centre-column dispatcher. It renders the shared
  RecipeDetailHeader for ALL modes, then a mode-keyed body (simple /
  routedByIngredients / routedByCheck / progressive). A redaction teaser renders
  the header only — never any ingredient/result/check detail. When no recipe is
  selected it shows a select-a-recipe hint.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import RecipeDetailHeader from './RecipeDetailHeader.svelte';
  import SimpleRecipeBody from './detail/SimpleRecipeBody.svelte';
  import IngredientRoutedBody from './detail/IngredientRoutedBody.svelte';
  import RoutedByCheckBody from './detail/RoutedByCheckBody.svelte';
  import ProgressiveBody from './detail/ProgressiveBody.svelte';

  let {
    recipe = null,
    selectedSetId = null,
    craftability = null,
    rollResult = null,
    busy = false,
    onChoose = null,
    onCraft = null,
    onLearn = null
  } = $props();

  const redacted = $derived(recipe?.redaction?.redacted === true);
  const mode = $derived(String(recipe?.modeToken ?? 'simple'));

  // Resolve the mode body once. Alchemy is handled by its own tab; an unknown
  // mode falls back to the simple body so a misconfigured system still renders.
  const BODIES = {
    simple: SimpleRecipeBody,
    routedByIngredients: IngredientRoutedBody,
    routedByCheck: RoutedByCheckBody,
    progressive: ProgressiveBody
  };
  const Body = $derived(BODIES[mode] ?? SimpleRecipeBody);
</script>

{#if !recipe}
  <div class="crafting-detail-empty" data-crafting-detail-state="empty">
    <i class="fas fa-hand-pointer" aria-hidden="true"></i>
    <p>{localize('FABRICATE.App.Crafting.Detail.SelectHint')}</p>
  </div>
{:else}
  <div class="crafting-detail" data-crafting-detail-state="selected" data-recipe-detail-mode={mode}>
    <RecipeDetailHeader {recipe} {onLearn} />
    {#if !redacted}
      <div class="crafting-detail-body-scroll">
        <Body {recipe} {selectedSetId} {craftability} {rollResult} {busy} {onChoose} {onCraft} />
      </div>
    {/if}
  </div>
{/if}

<style>
  .crafting-detail {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-3);
    height: 100%;
    min-height: 0;
    padding: var(--fab-space-4);
    box-sizing: border-box;
    overflow: hidden;
  }

  .crafting-detail-body-scroll {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    padding-right: 2px;
  }

  .crafting-detail-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    height: 100%;
    padding: var(--fab-space-4);
    text-align: center;
    color: var(--fab-text-muted);
  }

  .crafting-detail-empty i {
    font-size: 28px;
  }

  .crafting-detail-empty p {
    margin: 0;
    font-size: 13px;
  }
</style>
