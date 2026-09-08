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
  import EmptyState from '../manager/EmptyState.svelte';

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
    onReorderStage = null,
    onReorderStageSettled = null,
    // Per-step requirement projection (issue 765). Like the progressive props above,
    // this single prop set is passed to all four bodies; only SimpleRecipeBody reads
    // it. It MUST be declared and forwarded here — a prop that skips this dispatcher
    // silently drops to its default and the step blocks never render.
    steps = [],
    // Requirement rail interaction state (issue 917). Like the props above, this
    // dispatcher hands ONE identical set to all four bodies; every body forwards it
    // to IoTable. A prop that skips this dispatcher silently drops to its default,
    // which renders an inert rail with no chooser.
    rail = {},
    // The step the engine would execute for this actor's active run, so a multi-step
    // body can make only that step's rail interactive.
    activeStepId = null,
    // The step `craftability` above was projected from. It is the recipe's FIRST
    // execution step, so it differs from `activeStepId` whenever a run is parked on a
    // later step, and a multi-step body may substitute the recomputed craftability only
    // into this step. Like the props above it MUST be declared and forwarded here — one
    // that skips this dispatcher silently drops to null and every step block falls back
    // to its baked projection.
    displayedStepId = null,
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
    progressive: ProgressiveBody,
  };
  const Body = $derived(BODIES[mode] ?? SimpleRecipeBody);
</script>

{#if !recipe}
  <!--
    THE PANE KEEPS ITS OWN WRAPPER, AND THE FILL IS WHY (issue 1514).

    This was the SIXTH caller of `PlayerViewState`, the composition the five player view ROOTS
    draw. It is not a view root: it is the centre pane of the crafting view, and the two differ
    in exactly the declaration that composition banks. Each of the five roots declared
    `background: var(--fab-surface)` itself, so the composition carries it; `.crafting-detail-empty`
    declared no background at all and a `var(--fab-space-4)` inset instead. Routed through the
    composition, this pane filled its column edge-to-edge with the OPAQUE surface, inside a
    centre column that is `--fab-surface-soft` with a border and `overflow: hidden`
    (`CraftingView.svelte`) — visibly darker than the right column beside it, in the same frame.

    So it takes the caller-owned WRAPPER instead, which is the answer five other sites in this
    change already take: the wrapper declares the fill, the centring and the inset its own
    container needs, `EmptyState` draws the panel, and neither reaches into the other. A
    `background` prop on the composition was the alternative and is refused — one caller is not
    a variant, and the five roots want the fill they declare.
  -->
  <div class="crafting-detail-empty" data-crafting-detail-state="empty">
    <EmptyState
      icon="fas fa-hand-pointer"
      title={localize('FABRICATE.App.Crafting.Detail.SelectHint')}
    />
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
          {onReorderStageSettled}
          {steps}
          {rail}
          {activeStepId}
          {displayedStepId}
        />
      </div>
      <div class="crafting-detail-footer">
        <CraftButton label={craftLabel} disabled={!canCraft} {disabledReason} {busy} {onCraft} />
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

  /* The caller-owned wrapper for the no-selection panel: the fill, the centring and the inset
     the centre column needs, and NOTHING else. No `background` — the column's own
     `--fab-surface-soft` tint shows through, which an opaque fill would replace; no colour and
     no `text-align`, because `EmptyState` self-paints its title and centres its own stack. */
  .crafting-detail-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    padding: var(--fab-space-4);
  }
</style>
