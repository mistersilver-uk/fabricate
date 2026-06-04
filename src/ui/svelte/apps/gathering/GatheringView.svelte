<!-- Svelte 5 runes mode -->
<!--
  GatheringView is the player gathering tab content. It fetches the actor's
  gathering listing on mount via services.listGatheringForActor() and renders
  one of: loading, error, empty (incl. no-actor), or the populated 3-column
  layout. The left column is the Environments list; the center (slightly larger)
  and right columns are inert placeholders this iteration.

  selectedId is owned here so it survives re-renders of the list; it is
  highlight-only — no center-column wiring yet.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import GatheringEnvironmentList from './GatheringEnvironmentList.svelte';
  import GatheringDetail from './GatheringDetail.svelte';
  import { resolveDefaultSelection } from './selectionDefault.js';

  let { services = null } = $props();

  let loading = $state(true);
  let error = $state(false);
  let listing = $state(null);
  let selectedId = $state(null);

  // A listing is "populated" only when an actor is selected and at least one
  // environment is present. Missing listing / no selected actor / no
  // environments all collapse to the empty state.
  const hasActor = $derived(Boolean(listing?.selectedActorId));
  const environments = $derived(Array.isArray(listing?.environments) ? listing.environments : []);
  const isEmpty = $derived(
    !listing || listing.visible === false || !hasActor || environments.length === 0
  );
  // The environment whose detail the center column renders; null until the
  // player picks a selectable card (or when the prior selection drops out).
  const selectedEnvironment = $derived(
    environments.find(environment => environment?.id === selectedId) ?? null
  );

  async function load() {
    loading = true;
    error = false;
    try {
      const result = await services?.listGatheringForActor?.({});
      listing = result ?? null;
      // Keep a still-valid (non-locked) user selection across re-fetches;
      // otherwise default to the first selectable env, or null when all locked.
      selectedId = resolveDefaultSelection(
        Array.isArray(listing?.environments) ? listing.environments : [],
        selectedId
      );
    } catch (_err) {
      error = true;
      listing = null;
    } finally {
      loading = false;
    }
  }

  function onSelect(id) {
    selectedId = id;
  }

  $effect(() => {
    load();
  });
</script>

{#if loading}
  <div class="gathering-view-state" data-gathering-state="loading">
    <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
    <p>{localize('FABRICATE.App.Gathering.Loading')}</p>
  </div>
{:else if error}
  <div class="gathering-view-state" data-gathering-state="error">
    <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
    <p>{localize('FABRICATE.App.Gathering.Error')}</p>
  </div>
{:else if isEmpty}
  <div class="gathering-view-state" data-gathering-state="empty">
    <i class="fas fa-leaf" aria-hidden="true"></i>
    <p>{localize('FABRICATE.App.Gathering.Environments.Empty')}</p>
  </div>
{:else}
  <div class="gathering-view-grid" data-gathering-state="populated">
    <div class="gathering-view-column gathering-view-column-left">
      <GatheringEnvironmentList {environments} {selectedId} {onSelect} />
    </div>
    <section class="gathering-view-column gathering-view-column-center" data-gathering-detail>
      <GatheringDetail environment={selectedEnvironment} {services} onAttempted={load} />
    </section>
    <section class="gathering-view-column gathering-view-column-right" aria-hidden="true"></section>
  </div>
{/if}

<style>
  .gathering-view-grid {
    display: grid;
    grid-template-columns: minmax(280px, 1fr) minmax(0, 1.5fr) minmax(280px, 1fr);
    gap: var(--fab-space-4);
    height: 100%;
    min-height: 0;
    padding: var(--fab-space-4);
    box-sizing: border-box;
    background: var(--fab-surface);
    color: var(--fab-text);
  }

  .gathering-view-column {
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .gathering-view-column-center,
  .gathering-view-column-right {
    border: 1px solid var(--fab-border);
    border-radius: 8px;
    background: var(--fab-surface-soft);
  }

  .gathering-view-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    height: 100%;
    color: var(--fab-text-muted);
    background: var(--fab-surface);
  }

  .gathering-view-state i {
    font-size: 32px;
  }

  .gathering-view-state p {
    margin: 0;
    font-size: 14px;
  }
</style>
