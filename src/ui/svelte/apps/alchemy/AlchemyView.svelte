<!-- Svelte 5 runes mode -->
<!--
  AlchemyView — the player Alchemy tab content. It reads the shared services.alchemy
  store and renders one of: loading, error, no-actor, the discipline chooser (>1
  discipline, none chosen), or the three-column workbench (known . workbench .
  inventory). The 84px nav rail is the shell's (FabricateAppRoot), NOT this grid, so
  the content grid is three columns with compressible sides and a floored center,
  mirroring CraftingView / GatheringView.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import KnownRecipesColumn from './KnownRecipesColumn.svelte';
  import Workbench from './Workbench.svelte';
  import ComponentInventoryColumn from './ComponentInventoryColumn.svelte';
  import AlchemyDisciplineChooser from './AlchemyDisciplineChooser.svelte';

  let { services = null } = $props();

  const store = $derived(services?.alchemy ?? null);
  const sourcesStore = $derived(services?.craftingSources ?? null);
  const actorBar = $derived(services?.actorBar ?? null);

  const isLoading = $derived(Boolean(store?.loading) && !store?.loadedOnce);
  const isError = $derived(Boolean(store?.error));
  const isNoActor = $derived(
    Boolean(store?.loadedOnce) && (store?.denied || !store?.listing?.selectedActorId)
  );

  const needsChooser = $derived(Boolean(store?.needsChooser));

  const matchedRecipeId = $derived(store?.mode === 'ready' ? (store?.target?.id ?? null) : null);

  // The bench signature as component-name math (safe: the player placed them).
  const signatureText = $derived(
    (store?.benchChips ?? []).map((chip) => `${chip.name} ×${chip.qty}`).join('  +  ')
  );

  // Persist the shared top-bar actor into the crafting setting BEFORE loading (the
  // alchemy listing resolves its actor from that setting), point the required
  // component source at that actor, then load. Mirrors CraftingView.
  $effect(() => {
    const actorId = actorBar?.selectedActorId ?? null;
    services?.setSelectedCraftingActorId?.(actorId ?? '');
    sourcesStore?.load();
    sourcesStore?.setCraftingActor(actorId);
    store?.load();
  });

  function onDragStart(event, componentId) {
    event.dataTransfer?.setData('text/plain', componentId);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy';
  }
</script>

{#if isLoading}
  <div class="alchemy-view-state" data-alchemy-state="loading">
    <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
    <p>{localize('FABRICATE.App.Alchemy.Loading')}</p>
  </div>
{:else if isError}
  <div class="alchemy-view-state" data-alchemy-state="error">
    <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
    <p>{localize('FABRICATE.App.Alchemy.Error')}</p>
  </div>
{:else if isNoActor}
  <div class="alchemy-view-state" data-alchemy-state="no-actor">
    <i class="fas fa-user-slash" aria-hidden="true"></i>
    <p>{localize('FABRICATE.App.Alchemy.NoActor')}</p>
  </div>
{:else if needsChooser}
  <AlchemyDisciplineChooser
    systems={store?.systems ?? []}
    onChoose={(id) => store?.chooseSystem(id)}
  />
{:else}
  <div class="alchemy-view-container">
    <div class="alchemy-view-grid" data-alchemy-state="workbench">
      <div class="alchemy-view-column alchemy-view-known">
        <KnownRecipesColumn
          recipes={store?.knownRecipes ?? []}
          knownCount={store?.knownCount ?? 0}
          undiscoveredCount={store?.undiscoveredCount ?? 0}
          search={store?.search ?? ''}
          selectedRecipeId={store?.selectedRecipeId ?? null}
          {matchedRecipeId}
          activeSystemName={store?.listing?.activeSystemName ?? ''}
          canSwitch={store?.canSwitch ?? false}
          onSearch={(value) => store?.setSearch(value)}
          onSelect={(id) => store?.selectRecipe(id)}
          onSwitch={() => store?.switchDiscipline()}
        />
      </div>

      <section class="alchemy-view-column alchemy-view-bench">
        <Workbench
          benchChips={store?.benchChips ?? []}
          benchEmpty={store?.benchEmpty ?? true}
          {signatureText}
          mode={store?.mode ?? 'empty'}
          targetName={store?.target?.name ?? ''}
          result={store?.target?.result ?? null}
          missing={store?.missing ?? []}
          brewEnabled={store?.brewEnabled ?? false}
          brewInFlight={store?.brewInFlight ?? false}
          lastBrew={store?.lastBrew ?? null}
          onClear={() => store?.clear()}
          onRemoveOne={(id) => store?.removeOne(id)}
          onBrew={() => store?.brew()}
          onDrop={(id) => store?.add(id)}
        />
      </section>

      <section class="alchemy-view-column alchemy-view-inventory">
        <ComponentInventoryColumn
          components={store?.components ?? []}
          onAdd={(id) => store?.add(id)}
          {onDragStart}
        />
      </section>
    </div>
  </div>
{/if}

<style>
  .alchemy-view-container {
    container-type: inline-size;
    container-name: fabricate-alchemy;
    height: 100%;
    min-height: 0;
  }

  .alchemy-view-grid {
    display: grid;
    /* Compressible sides + a floored, growable centre so "sides give" is literal:
       the 340px workbench floor coexists with the 1024px min window. */
    grid-template-columns: minmax(230px, 280px) minmax(340px, 1fr) minmax(230px, 280px);
    gap: var(--fab-space-4);
    height: 100%;
    min-height: 0;
    padding: var(--fab-space-4);
    box-sizing: border-box;
    background: var(--fab-surface);
    color: var(--fab-text);
  }

  @container fabricate-alchemy (max-width: 900px) {
    .alchemy-view-grid {
      grid-template-columns: 1fr;
      grid-auto-rows: minmax(min-content, max-content);
      height: auto;
      min-height: 100%;
      overflow-y: auto;
    }

    /* Stack with the workbench leading. */
    .alchemy-view-bench {
      order: 1;
    }
    .alchemy-view-known {
      order: 2;
    }
    .alchemy-view-inventory {
      order: 3;
    }

    .alchemy-view-column {
      min-height: 240px;
    }
  }

  .alchemy-view-column {
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .alchemy-view-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    height: 100%;
    color: var(--fab-text-muted);
    background: var(--fab-surface);
  }

  .alchemy-view-state i {
    font-size: 32px;
  }

  .alchemy-view-state p {
    margin: 0;
    font-size: 14px;
  }
</style>
