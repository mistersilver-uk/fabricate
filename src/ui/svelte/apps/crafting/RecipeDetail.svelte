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
  import CraftButton from './CraftButton.svelte';
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
    onChooseOption = null,
    onCraft = null,
    // Progressive stage list + player reorder (issue 651). The BODIES dispatcher below
    // passes ONE identical prop set to all four bodies, so these must be declared and
    // forwarded here even though only ProgressiveBody reads them — the other three
    // ignore them. A prop that skips this dispatcher silently drops to its default and
    // the stage list never renders.
    progressiveStages = [],
    canReorderStages = true,
    stageAnnouncement = '',
    onReorderStage = null
  } = $props();

  const redacted = $derived(recipe?.redaction?.redacted === true);
  const mode = $derived(String(recipe?.modeToken ?? 'simple'));

  // Craft-button gating (the button is a fixed footer below the scrolling body).
  const canCraft = $derived(craftability?.canCraft === true);
  const craftLabel = $derived(
    rollResult
      ? localize('FABRICATE.App.Crafting.Button.CraftAnother')
      : localize('FABRICATE.App.Crafting.Button.Craft')
  );
  const disabledReason = $derived(
    canCraft ? '' : localize('FABRICATE.App.Crafting.Button.MissingMaterials')
  );

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
    <RecipeDetailHeader {recipe} />
    {#if !redacted}
      <div class="crafting-detail-body" data-crafting-detail-scroll>
        <Body
          {recipe}
          {selectedSetId}
          {craftability}
          {rollResult}
          {onChoose}
          {onChooseOption}
          {progressiveStages}
          {canReorderStages}
          {stageAnnouncement}
          {onReorderStage}
        />
      </div>
      <div class="crafting-detail-footer">
        <CraftButton
          label={craftLabel}
          disabled={!canCraft}
          {disabledReason}
          {busy}
          {onCraft}
        />
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

  /* The detail content scrolls here; the craft-button footer below stays fixed and
     always visible without overlapping the content. */
  .crafting-detail-body {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    padding-right: 2px;
  }

  .crafting-detail-footer {
    flex: 0 0 auto;
    padding-top: var(--fab-space-3);
    border-top: 1px solid var(--fab-border);
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
