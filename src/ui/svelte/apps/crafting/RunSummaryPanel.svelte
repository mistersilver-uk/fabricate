<!-- Svelte 5 runes mode -->
<!--
  RunSummaryPanel is the right-column body shown when the selected recipe has a
  just-completed / in-flight craft run. It is a compact, self-contained summary of
  the latest outcome with a "craft next step" advance action (re-invokes
  store.craft for the same recipe — used to advance a progressive run or craft
  another). A visible/keyboard Back affordance returns to the shopping list. There
  is NO Journal cross-link in this PR.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import CraftingThumb from './CraftingThumb.svelte';
  import CraftButton from './CraftButton.svelte';
  import RollResultBox from './detail/RollResultBox.svelte';

  let {
    recipe = null,
    rollResult = null,
    canCraft = true,
    busy = false,
    onCraftNext = null,
    onDismiss = null
  } = $props();

  const name = $derived(String(recipe?.name ?? ''));
  const progressive = $derived(recipe?.modeToken === 'progressive');
  const advanceLabel = $derived(
    progressive
      ? localize('FABRICATE.App.Crafting.Run.Advance')
      : localize('FABRICATE.App.Crafting.Button.CraftAnother')
  );
  // A progressive run's "Craft next step" is time-gated (advancing to the next
  // step), never material-gated, so it stays enabled. The non-progressive "Craft
  // another" repeats the whole craft and needs materials again — disable it when
  // the current selection is no longer craftable.
  const advanceDisabled = $derived(!progressive && canCraft !== true);
  const disabledReason = $derived(
    advanceDisabled ? localize('FABRICATE.App.Crafting.Button.MissingMaterials') : ''
  );
</script>

<section class="crafting-run" data-crafting-run-summary>
  <header class="crafting-run-head">
    <p class="crafting-run-title">{localize('FABRICATE.App.Crafting.Run.Title')}</p>
    <button
      type="button"
      class="crafting-run-back"
      data-crafting-run-dismiss
      title={localize('FABRICATE.App.Crafting.Run.Dismiss')}
      aria-label={localize('FABRICATE.App.Crafting.Run.Dismiss')}
      onclick={() => onDismiss?.()}
    >
      <i class="fas fa-arrow-left" aria-hidden="true"></i>
      <span>{localize('FABRICATE.App.Crafting.Run.Dismiss')}</span>
    </button>
  </header>

  <div class="crafting-run-recipe">
    <CraftingThumb src={recipe?.img} alt="" size={36} />
    <span class="crafting-run-recipe-name" title={name}>{name}</span>
  </div>

  <RollResultBox result={rollResult} />

  <div class="crafting-run-action">
    <CraftButton
      label={advanceLabel}
      disabled={advanceDisabled}
      {disabledReason}
      {busy}
      onCraft={() => onCraftNext?.()}
    />
  </div>
</section>

<style>
  .crafting-run {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-3);
    height: 100%;
    min-height: 0;
    padding: var(--fab-space-4);
    box-sizing: border-box;
    overflow-y: auto;
  }

  .crafting-run-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .crafting-run-title {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
  }

  .crafting-run-back {
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: auto;
    min-height: 28px;
    padding: 2px 10px;
    border: 1px solid var(--fab-border);
    border-radius: 6px;
    background: var(--fab-surface-soft);
    color: var(--fab-text-muted);
    font-size: 12px;
    cursor: pointer;
  }

  .crafting-run-back:hover {
    background: var(--fab-surface-raised);
    color: var(--fab-text);
  }

  .crafting-run-back:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: 2px;
  }

  .crafting-run-recipe {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .crafting-run-recipe-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
  }

  .crafting-run-action {
    margin-top: auto;
  }
</style>
