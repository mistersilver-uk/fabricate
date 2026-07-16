<!-- Svelte 5 runes mode -->
<!--
  InventoryDetail is the right-hand inspector for the selected owned item, and a
  PUBLIC ENTRY POINT: `src/ui/svelte/apps/manager/RecipeItemEditor.svelte` imports
  this component for the GM "How players see it" preview, so the preview renders
  the actual player surface rather than a bespoke re-implementation and can never
  drift from what players see (canonical spec text — `ui-integration`, Books &
  Scrolls Surface).

  That is why it stays a THIN ROUTER over three disjoint states rather than
  absorbing either body:

    empty     — nothing selected
    book      — a recipe-item (`isRecipeItem`) → InventoryBookDetail
    component — a component/essence row       → InventoryComponentDetail

  A book is never salvageable, so the book branch never reaches the salvage tree
  the component branch owns — the preview renders no salvage tab. (The salvage
  tree is still in this module's static import graph, which is why the mounted
  harnesses that reach here must allowlist all of it.)
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import InventoryBookDetail from './detail/InventoryBookDetail.svelte';
  import InventoryComponentDetail from './detail/InventoryComponentDetail.svelte';

  // Every prop the component body needs must be declared AND forwarded here: a prop
  // that stops at this router silently falls back to its default in the body, and the
  // control it drives never renders. The manager preview mounts this router, so it is
  // the real entry point — tests that feed a body directly would miss the gap.
  let {
    item = null,
    onOpenRecipe = null,
    onLearn = null,
    onLearnAll = null,
    learningRecipeId = null,
    salvaging = false,
    salvageResult = null,
    onSalvage = null,
    onResetSalvage = null,
    salvageStages = [],
    salvageAnnouncement = '',
    onReorderSalvageStage = () => {},
    onSalvageReorderSettled = () => {}
  } = $props();

  const isRecipeItem = $derived(item?.isRecipeItem === true);
</script>

{#if !item}
  <div class="inventory-detail-empty" data-inventory-detail-empty>
    <i class="fas fa-boxes-stacked" aria-hidden="true"></i>
    <p>{localize('FABRICATE.App.Inventory.Detail.SelectHint')}</p>
  </div>
{:else if isRecipeItem}
  <InventoryBookDetail {item} {onOpenRecipe} {onLearn} {onLearnAll} {learningRecipeId} />
{:else}
  <InventoryComponentDetail
    {item}
    {onOpenRecipe}
    {salvaging}
    {salvageResult}
    {onSalvage}
    {onResetSalvage}
    {salvageStages}
    {salvageAnnouncement}
    {onReorderSalvageStage}
    {onSalvageReorderSettled}
  />
{/if}

<style>
  .inventory-detail-empty {
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

  .inventory-detail-empty i {
    font-size: 28px;
    opacity: 0.7;
  }

  .inventory-detail-empty p {
    margin: 0;
    font-size: 13px;
  }
</style>
