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
  import { localize, subscribeSceneChange } from '../../util/foundryBridge.js';
  import GatheringEnvironmentList from './GatheringEnvironmentList.svelte';
  import GatheringDetail from './GatheringDetail.svelte';
  import GatheringTaskDetail from './GatheringTaskDetail.svelte';
  import GatheringHazardDetail from './GatheringHazardDetail.svelte';
  import {
    resolveDefaultSelection,
    resolveDefaultTaskSelection,
    visibleTasksFor,
    resolveDefaultHazardSelection,
    visibleHazardsFor
  } from './selectionDefault.js';
  import { resolveScopedGatheringSelection } from './scopedSelection.js';

  let {
    services = null,
    // When a canvas gathering-task interactable is activated, the granted session
    // opens scoped to one environment + task. These drive the INITIAL selection so
    // the view navigates straight to that environment and opens that task's detail
    // (rather than the generic first-attemptable default). Null on a manual open.
    scopedEnvironmentId = null,
    scopedTaskId = null
  } = $props();

  // The shared actor-selection store (services.actorBar). Existing tests mount
  // GatheringView with a `services` bag that has no `actorBar`, so EVERY access
  // goes through `store?.` optional chaining to stay green unmodified.
  const store = $derived(services?.actorBar ?? null);

  let loading = $state(true);
  let error = $state(false);
  let listing = $state(null);
  let selectedId = $state(null);
  // The selected task within the selected environment; drives both the center
  // accordion (the selected row is the expanded one) and the right-column task
  // inspector. Resolved to the first attemptable task by default.
  let selectedTaskId = $state(null);
  // The center column's active tab ('tasks' | 'hazards') and the selected hazard.
  // Lifted here (like selectedTaskId) so the right column can swap between the
  // task inspector and the hazard inspector in step with the tab.
  let activeTab = $state('tasks');
  let selectedHazardId = $state(null);
  // Shared "an attempt is in flight" guard for both the blind attempt button
  // (center) and the right-column task inspector's Attempt button.
  let busy = $state(false);
  // First-load backstop guard: the view adopts the listing's resolved actor at
  // most once, and only when the store seed is still empty AND the resolved id
  // is a player character present in the bar's selectable list.
  let backstopApplied = $state(false);
  // The scope value (`env|task`) most recently applied to the selection, so an
  // interactable-granted env+task auto-selection applies once per distinct scope
  // (re-applied when the window re-opens against a different env+task) without
  // clobbering a subsequent manual navigation within the same session.
  let appliedScopeKey = $state(null);

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
  // The tasks the player can pick for the selected environment (blind →
  // discovered, targeted → full list), and the currently selected task object.
  const visibleTasks = $derived(visibleTasksFor(selectedEnvironment));
  const selectedTask = $derived(
    visibleTasks.find(task => String(task?.id) === String(selectedTaskId)) ?? null
  );
  // The hazards the player can inspect for the selected environment, and the
  // currently selected hazard object (drives the right-column hazard inspector
  // when the Hazards tab is active).
  const visibleHazards = $derived(visibleHazardsFor(selectedEnvironment));
  const selectedHazard = $derived(
    visibleHazards.find(hazard => String(hazard?.id) === String(selectedHazardId)) ?? null
  );

  // `quiet` refreshes (e.g. on scene change) keep the populated grid on screen
  // instead of flashing the loading spinner, and preserve prior content if the
  // re-fetch errors.
  async function load(quiet = false) {
    if (!quiet) loading = true;
    error = false;
    try {
      // Pass the live shared-store selection so a selection change re-drives the
      // listing; `null` lets `listGatheringForActor` fall back to the persisted
      // default for fresh loads.
      const result = await services?.listGatheringForActor?.({
        rememberedActorId: store?.selectedActorId ?? null
      });
      listing = result ?? null;
      const listingEnvironments = Array.isArray(listing?.environments) ? listing.environments : [];

      // Interactable-granted env+task scope: when the session was opened from a
      // canvas gathering-task interactable, auto-navigate to the scoped environment
      // and open the scoped task — once per distinct scope (re-applied on re-open
      // against a different env+task), so a later manual pick within the session is
      // not clobbered. The scoped env may be present but "locked"; the activation
      // already validated it, so we select it regardless of the default's
      // non-locked filter. The pure decision (incl. the "apply once per scope"
      // gating and the locked-scope override) lives in resolveScopedGatheringSelection.
      const scopeDecision = resolveScopedGatheringSelection({
        environments: listingEnvironments,
        scopedEnvironmentId,
        scopedTaskId,
        appliedScopeKey,
        currentSelectedId: selectedId,
        currentTaskId: selectedTaskId,
        defaultResolver: resolveDefaultSelection
      });
      appliedScopeKey = scopeDecision.appliedScopeKey;
      selectedId = scopeDecision.selectedEnvironmentId;
      if (scopeDecision.switchToTasksTab) activeTab = 'tasks';

      // Resolve the task selection against the (possibly changed) selected
      // environment's visible tasks: preserve a still-present pick, else default
      // to the first attemptable task. Mirrors the env selection's explicit
      // resolution and avoids an $effect write-loop. When the scope was just
      // applied, the decision's task preference is the scoped task (when present
      // in the env's visible tasks).
      const resolvedEnvironment = listingEnvironments
        .find(environment => environment?.id === selectedId) ?? null;
      selectedTaskId = resolveDefaultTaskSelection(visibleTasksFor(resolvedEnvironment), scopeDecision.taskPreferenceId);
      // Resolve the hazard selection the same way (preserve a still-present pick,
      // else default to the first hazard) so the Hazards tab inspector is seeded.
      selectedHazardId = resolveDefaultHazardSelection(visibleHazardsFor(resolvedEnvironment), selectedHazardId);

      // First-load backstop: when the shared selection is still empty, adopt the
      // listing's resolved actor AT MOST ONCE and ONLY when it is a player
      // character present in the bar's selectable list. Otherwise leave the
      // store's own fallback in place (no ping-pong).
      if (store && !backstopApplied && !store.selectedActorId) {
        const resolvedId = listing?.selectedActorId ?? null;
        const isPlayerCharacter = Boolean(resolvedId)
          && store.selectableActors.some((actor) => actor?.id === resolvedId);
        if (isPlayerCharacter) {
          backstopApplied = true;
          store.selectActor(resolvedId);
        }
      }
    } catch (_err) {
      // On a quiet refresh keep the current content rather than dropping to the
      // error state; a foreground load surfaces the failure as before.
      if (!quiet) {
        error = true;
        listing = null;
      }
    } finally {
      loading = false;
    }
  }

  function onSelect(id) {
    if (id === selectedId) return;
    selectedId = id;
    // A new environment starts with its own default task selection (first
    // attemptable), rather than carrying over the previous env's task.
    const nextEnvironment = environments.find(environment => environment?.id === id) ?? null;
    selectedTaskId = resolveDefaultTaskSelection(visibleTasksFor(nextEnvironment), null);
    // A new environment also resets to the default (Tasks) tab and its own
    // default hazard selection.
    activeTab = 'tasks';
    selectedHazardId = resolveDefaultHazardSelection(visibleHazardsFor(nextEnvironment), null);
  }

  function onSelectTask(id) {
    selectedTaskId = id;
  }

  function onSelectHazard(id) {
    selectedHazardId = id;
  }

  function onTabChange(tab) {
    activeTab = tab;
  }

  // The shared attempt handler, used by the right-column inspector (targeted +
  // discovered tasks) and the center blind-attempt button. Lifted here because
  // those buttons live in sibling columns; refreshes the listing on success.
  async function attempt({ environmentId, taskId = null }) {
    if (busy || !environmentId) return;
    busy = true;
    try {
      await services?.startGatheringAttempt?.({ environmentId, taskId });
      await load();
    } finally {
      busy = false;
    }
  }

  // Re-fetch the listing on mount and whenever the shared selected actor changes.
  $effect(() => {
    // Track the shared selection so a change re-runs this effect.
    void store?.selectedActorId;
    load();
  });

  // Re-apply the interactable env+task scope when the window is re-opened against a
  // different gathering-task interactable (the host pushes new scoped ids via
  // updateProps). A quiet re-load re-runs the scope auto-selection in `load()`
  // without flashing the spinner. Tracks only the scope key so a manual navigation
  // within the same session does not re-trigger it.
  $effect(() => {
    const scopeKey = scopedEnvironmentId && scopedTaskId
      ? `${scopedEnvironmentId}|${scopedTaskId}`
      : null;
    if (scopeKey && scopeKey !== appliedScopeKey) {
      load(true);
    }
  });

  // Scene-linked environments unlock when the player navigates to the linked
  // scene; re-fetch (quietly) when Foundry redraws the canvas so the gate clears
  // without reopening the app. No-ops outside the Foundry runtime.
  $effect(() => subscribeSceneChange(() => load(true)));

  // Report the selected environment's region + stamina pool up to the shared
  // store so the header bar can render them; cleared when no environment is
  // selected. `staminaPool` is already null unless the system is in stamina mode
  // and an actor is selected (gated in the engine listing).
  $effect(() => {
    store?.setRegion(selectedEnvironment?.region ?? '');
    store?.setStaminaPool(selectedEnvironment?.staminaPool ?? null);
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
      <GatheringDetail
        environment={selectedEnvironment}
        {services}
        onAttempt={attempt}
        {busy}
        {selectedTaskId}
        {onSelectTask}
        {activeTab}
        {onTabChange}
        {selectedHazardId}
        {onSelectHazard}
      />
    </section>
    <section class="gathering-view-column gathering-view-column-right" data-gathering-task-detail-column>
      {#if activeTab === 'hazards'}
        <GatheringHazardDetail
          hazard={selectedHazard}
          hasHazards={visibleHazards.length > 0}
          {services}
        />
      {:else}
        <GatheringTaskDetail
          task={selectedTask}
          hasTasks={visibleTasks.length > 0}
          environmentId={selectedId}
          onAttempt={attempt}
          {busy}
          {services}
          rememberedActorId={store?.selectedActorId ?? null}
        />
      {/if}
    </section>
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
