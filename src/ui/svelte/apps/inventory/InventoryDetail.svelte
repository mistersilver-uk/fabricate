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
  import EmptyState from '../manager/EmptyState.svelte';
  import InventoryBookDetail from './detail/InventoryBookDetail.svelte';
  import InventoryComponentDetail from './detail/InventoryComponentDetail.svelte';

  // Every prop the component body needs must be declared AND forwarded here: a prop
  // that stops at this router silently falls back to its default in the body, and the
  // control it drives never renders. The manager preview mounts this router, so it is
  // the real entry point — tests that feed a body directly would miss the gap.
  let {
    item = null,
    activeSystem = null,
    onSelectSystem = () => {},
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
    onSalvageReorderSettled = () => {},
    salvageOrderIsCustom = false,
    onResetSalvageOrder = () => {},
  } = $props();

  const isRecipeItem = $derived(item?.isRecipeItem === true);
</script>

{#if !item}
  <!--
    THE PANE'S FILL IS THE CALLER'S, THE PANEL IS THE PRIMITIVE'S (issue 1514). This state
    stands in for the whole inspector column, so it must fill the height the selected item's
    detail would have filled. `EmptyState` is padding-driven and declares no height, and its
    documented fill escape is `contextClass`, "whose rules live in the global sheet"
    (`EmptyState.svelte:53-55`) — which would put `styles/fabricate.css` on this change's path.
    So `.inventory-detail-empty` survives as a caller-owned WRAPPER declaring the fill and the
    centring and nothing else, which is the answer `PlayerViewState` and
    `GatheringEnvironmentList` both take for the same reason.

    The hook stays ON THE WRAPPER, which is the box it has always sat on, so it keeps rendering
    `data-inventory-detail-empty=""` rather than the `="true"` `EmptyState` coerces a bare hook
    to (`EmptyState.svelte:84`, `dataValue || true`).
  -->
  <div class="inventory-detail-empty" data-inventory-detail-empty>
    <EmptyState
      icon="fas fa-boxes-stacked"
      title={localize('FABRICATE.App.Inventory.Detail.SelectHint')}
    />
  </div>
{:else if isRecipeItem}
  <InventoryBookDetail {item} {onOpenRecipe} {onLearn} {onLearnAll} {learningRecipeId} />
{:else}
  <InventoryComponentDetail
    {item}
    {activeSystem}
    {onSelectSystem}
    {onOpenRecipe}
    {salvaging}
    {salvageResult}
    {onSalvage}
    {onResetSalvage}
    {salvageStages}
    {salvageAnnouncement}
    {onReorderSalvageStage}
    {onSalvageReorderSettled}
    {salvageOrderIsCustom}
    {onResetSalvageOrder}
  />
{/if}

<style>
  /* THE WRAPPER ONLY: the fill and the centring the pane needs, and nothing about the tile,
     the type or the ink — those belong to the panel nested inside it now. */
  .inventory-detail-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    padding: var(--fab-space-4);
  }
</style>
