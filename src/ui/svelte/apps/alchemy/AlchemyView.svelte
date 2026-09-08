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
  import PlayerViewState from '../PlayerViewState.svelte';

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

  // The branches this view can reach, in priority order, handed to the shared composition as
  // data. Alchemy has no empty branch: a discipline with no known recipes still renders the
  // workbench. The hook name and each value are the ones the smoke locators and the mounted
  // suites already read.
  const viewStates = $derived([
    {
      when: isLoading,
      kind: 'loading',
      hook: 'data-alchemy-state',
      value: 'loading',
      icon: 'fas fa-spinner fa-spin',
      message: localize('FABRICATE.App.Alchemy.Loading'),
    },
    {
      when: isError,
      kind: 'error',
      hook: 'data-alchemy-state',
      value: 'error',
      icon: 'fas fa-triangle-exclamation',
      message: localize('FABRICATE.App.Alchemy.Error'),
    },
    {
      when: isNoActor,
      kind: 'empty',
      hook: 'data-alchemy-state',
      value: 'no-actor',
      icon: 'fas fa-user-slash',
      message: localize('FABRICATE.App.Alchemy.NoActor'),
    },
  ]);

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

<PlayerViewState branches={viewStates}>
  {#if needsChooser}
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
            benchEssences={store?.benchEssences ?? []}
            {signatureText}
            mode={store?.mode ?? 'empty'}
            targetName={store?.target?.name ?? ''}
            result={store?.target?.result ?? null}
            missing={store?.missing ?? []}
            brewEnabled={store?.brewEnabled ?? false}
            brewInFlight={store?.brewInFlight ?? false}
            lastBrew={store?.lastBrew ?? null}
            onClear={() => store?.clear()}
            onAdd={(id) => store?.add(id)}
            onRemoveOne={(id) => store?.removeOne(id)}
            onRemoveAll={(id) => store?.removeAll(id)}
            onBrew={() => store?.brew()}
            onDrop={(id) => store?.add(id)}
          />
        </section>

        <section class="alchemy-view-column alchemy-view-inventory">
          <ComponentInventoryColumn
            components={store?.components ?? []}
            search={store?.componentSearch ?? ''}
            hasComponents={store?.hasOwnedComponents ?? false}
            onAdd={(id) => store?.add(id)}
            onSearch={(value) => store?.setComponentSearch(value)}
            {onDragStart}
          />
        </section>
      </div>
    </div>
  {/if}
</PlayerViewState>

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

  /* At the supported 1024px window floor this container's content box is roughly
     938px wide, so the shared 960px boundary is deliberately reachable. */
  @container fabricate-alchemy (max-width: 960px) {
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
</style>
