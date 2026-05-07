<!-- Svelte 5 runes mode -->
<script>
  import { onMount } from 'svelte';
  import { localize } from '../util/foundryBridge.js';

  let { store } = $props();

  // svelte-ignore state_referenced_locally
  const viewState = store.viewState;
  let searchTerm = $state('');
  let riskFilter = $state('all');
  let regionFilter = $state('all');
  let biomeFilter = $state('all');

  const filteredEnvironments = $derived(($viewState.filteredEnvironments || []).filter(environment => {
    const query = searchTerm.trim().toLowerCase();
    const matchesSearch = !query || `${environment.name || ''} ${environment.description || ''} ${environment.craftingSystemName || ''} ${environment.region || ''} ${environment.biome || ''}`.toLowerCase().includes(query);
    const matchesRisk = riskFilter === 'all' || (environment.risk || 'safe') === riskFilter;
    const matchesRegion = regionFilter === 'all' || (environment.region || '') === regionFilter;
    const matchesBiome = biomeFilter === 'all' || (environment.biome || '') === biomeFilter;
    return matchesSearch && matchesRisk && matchesRegion && matchesBiome;
  }));
  const regionOptions = $derived(uniqueSorted(($viewState.filteredEnvironments || []).map(environment => environment.region)));
  const biomeOptions = $derived(uniqueSorted(($viewState.filteredEnvironments || []).map(environment => environment.biome)));

  onMount(() => {
    store.refresh();
  });

  function actorImage(actor) {
    return actor?.img || 'icons/svg/mystery-man.svg';
  }

  function displayTaskLabel(task) {
    if (task?.blind === true || task.action === 'blindGather') {
      return task.label || localize('FABRICATE.Gathering.BlindTaskLabel');
    }
    return task.label || task.name || localize('FABRICATE.Gathering.BlindTaskLabel');
  }

  function blockedMessage(reason) {
    if (!reason) return '';
    return reason.message || localize(reason.messageKey);
  }

  function taskKey(environment, task, index) {
    return `${environment?.id || 'environment'}:${task?.id || task?.action || index}`;
  }

  function reasonKey(reason, index, scope) {
    return `${scope}:${reason?.code || reason?.messageKey || reason?.message || 'reason'}:${index}`;
  }

  function runKey(run, index, scope) {
    return `${scope}:${run?.id || run?.environmentId || 'run'}:${run?.taskId || run?.label || run?.status || 'unknown'}:${index}`;
  }

  function displayRunLabel(run) {
    if (run?.blind === true) {
      return run.label || localize('FABRICATE.Gathering.BlindTaskLabel');
    }
    return run?.label || localize('FABRICATE.Gathering.BlindTaskLabel');
  }

  function statusLabel(status) {
    const key = `FABRICATE.Gathering.Status.${status || 'unknown'}`;
    const value = localize(key);
    return value === key ? status || localize('FABRICATE.Gathering.Status.unknown') : value;
  }

  function activeRunTime(run) {
    if (!run?.timeGate?.availableAt) return '';
    return localize('FABRICATE.Gathering.ActiveRuns.AvailableAt', {
      time: run.timeGate.availableAt
    });
  }

  function historySummary(run) {
    if (run?.blind === true) return statusLabel(run.status);
    if (run?.status === 'succeeded') {
      return localize('FABRICATE.Gathering.History.SucceededSummary', {
        results: run.createdResultCount ?? 0,
        catalysts: run.usedCatalystCount ?? 0
      });
    }
    return statusLabel(run.status);
  }

  function startButtonLabel(task) {
    if (task?.attemptable !== true) {
      return localize('FABRICATE.Gathering.BlockedAction');
    }
    return displayTaskLabel(task);
  }

  function uniqueSorted(values) {
    return Array.from(new Set(values.map(value => String(value || '').trim()).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b));
  }

  function taskEconomySummary(task) {
    const parts = [];
    if (task?.rich?.stamina?.cost) parts.push(localize('FABRICATE.Gathering.StaminaCost', { cost: task.rich.stamina.cost }));
    if (task?.rich?.nodes) {
      const nodes = task.rich.nodes.current === null
        ? localize(task.rich.nodes.available ? 'FABRICATE.Gathering.NodesAvailable' : 'FABRICATE.Gathering.NodesDepleted')
        : localize('FABRICATE.Gathering.NodeCount', { current: task.rich.nodes.current, max: task.rich.nodes.max });
      parts.push(nodes);
    }
    if (task?.rich?.attemptLimit?.remaining !== null && task?.rich?.attemptLimit?.remaining !== undefined) {
      parts.push(localize('FABRICATE.Gathering.AttemptsRemaining', { remaining: task.rich.attemptLimit.remaining, max: task.rich.attemptLimit.max }));
    }
    return parts.join(' · ');
  }

  function staminaSummary() {
    const task = ($viewState.environments || []).flatMap(environment => environment.tasks || []).find(task => task?.rich?.stamina?.state);
    const state = task?.rich?.stamina?.state;
    if (!state || state.current === null) return '';
    return localize('FABRICATE.Gathering.StaminaSummary', { current: state.current, max: state.max ?? '?' });
  }
</script>

<div class="fabricate-gathering-app">
  <header class="gathering-header">
    <div>
      <h2>{localize('FABRICATE.Gathering.Title')}</h2>
      <p>{localize('FABRICATE.Gathering.Subtitle')}</p>
    </div>

    <label class="gathering-actor-select">
      <span>{localize('FABRICATE.Gathering.Actor')}</span>
      <select
        disabled={$viewState.availableActors.length === 0}
        value={$viewState.selectedActorId || ''}
        onchange={(event) => store.selectActor(event.target.value).then(() => store.refresh())}
      >
        {#each $viewState.availableActors as actor (actor.id)}
          <option value={actor.id}>{actor.name}</option>
        {/each}
      </select>
    </label>
    {#if staminaSummary()}
      <div class="gathering-stamina-summary" aria-label={localize('FABRICATE.Gathering.Stamina')}>
        <i class="fas fa-bolt" aria-hidden="true"></i>
        <span>{staminaSummary()}</span>
      </div>
    {/if}
  </header>

  {#if $viewState.selectedActor}
    <section class="gathering-selected-actor" aria-label={localize('FABRICATE.Gathering.SelectedActor')}>
      <img src={actorImage($viewState.selectedActor)} alt="" />
      <div>
        <strong>{$viewState.selectedActor.name}</strong>
        <span>{localize('FABRICATE.Gathering.InventoryTarget')}</span>
      </div>
    </section>
  {/if}

  {#if $viewState.feedback}
    <section class="gathering-feedback-panel" class:success={$viewState.feedback.tone === 'success'} class:warning={$viewState.feedback.tone === 'warning'} aria-label={localize('FABRICATE.Gathering.Feedback.Title')}>
      <div>
        <h3>{localize('FABRICATE.Gathering.Feedback.Title')}</h3>
        <strong>{$viewState.feedback.label}</strong>
      </div>
      <span>{$viewState.feedback.message}</span>
    </section>
  {/if}

  {#if $viewState.activeRuns?.length}
    <section class="gathering-run-section" aria-label={localize('FABRICATE.Gathering.ActiveRuns.Title')}>
      <div class="gathering-section-heading">
        <h3>{localize('FABRICATE.Gathering.ActiveRuns.Title')}</h3>
      </div>
      <div class="gathering-runs-grid">
        {#each $viewState.activeRuns as run, index (runKey(run, index, 'active'))}
          <article class="gathering-run-row">
            <div>
              <strong>{displayRunLabel(run)}</strong>
              {#if run.environmentName}
                <span>{run.environmentName}</span>
              {/if}
              {#if $viewState.hasMultipleGatheringSystems && run.craftingSystemName}
                <span class="gathering-chip gathering-system-chip">{run.craftingSystemName}</span>
              {/if}
            </div>
            <div class="gathering-run-meta">
              <span>{statusLabel(run.status)}</span>
              {#if activeRunTime(run)}
                <span>{activeRunTime(run)}</span>
              {/if}
            </div>
          </article>
        {/each}
      </div>
    </section>
  {/if}

  {#if $viewState.loading}
    <div class="gathering-empty-state">
      <i class="fas fa-spinner fa-spin"></i>
      <span>{localize('FABRICATE.Gathering.Loading')}</span>
    </div>
  {:else if $viewState.error}
    <div class="gathering-empty-state gathering-error-state">
      <strong>{localize('FABRICATE.Gathering.ErrorTitle')}</strong>
      <span>{$viewState.error}</span>
    </div>
  {:else if !$viewState.hasSelectableActors}
    <div class="gathering-empty-state">
      <strong>{localize('FABRICATE.Gathering.Empty.NoSelectableActorsTitle')}</strong>
      <span>{localize('FABRICATE.Gathering.Blocked.NoSelectableActors')}</span>
      <span>{localize('FABRICATE.Gathering.Empty.NoSelectableActorsHint')}</span>
    </div>
  {:else if $viewState.environments.length === 0}
    <div class="gathering-empty-state">
      {#each $viewState.blockedReasons as reason, index (reasonKey(reason, index, 'listing'))}
        <span>{blockedMessage(reason)}</span>
      {:else}
        <span>{localize('FABRICATE.Gathering.Empty.NoEnvironments')}</span>
      {/each}
    </div>
  {:else}
    <section class="gathering-filter-bar" aria-label={localize('FABRICATE.Gathering.Filters')}>
      <label>
        <i class="fas fa-search" aria-hidden="true"></i>
        <input type="search" bind:value={searchTerm} placeholder={localize('FABRICATE.Gathering.SearchPlaceholder')} />
      </label>
      <select bind:value={riskFilter} aria-label={localize('FABRICATE.Gathering.RiskFilter')}>
        <option value="all">{localize('FABRICATE.Gathering.AllRisks')}</option>
        <option value="safe">{localize('FABRICATE.Gathering.Risk.safe')}</option>
        <option value="hazardous">{localize('FABRICATE.Gathering.Risk.hazardous')}</option>
        <option value="unsafe">{localize('FABRICATE.Gathering.Risk.unsafe')}</option>
        <option value="extreme">{localize('FABRICATE.Gathering.Risk.extreme')}</option>
      </select>
      {#if $viewState.hasMultipleGatheringSystems}
        <select value={$viewState.selectedSystemId || 'all'} aria-label={localize('FABRICATE.Gathering.SystemFilter')} onchange={(event) => store.selectSystem(event.target.value)}>
          <option value="all">{localize('FABRICATE.Gathering.AllSystems')}</option>
          {#each $viewState.gatheringSystems as system (system.id)}
            <option value={system.id}>{system.name}</option>
          {/each}
        </select>
      {/if}
      <select bind:value={regionFilter} aria-label={localize('FABRICATE.Gathering.RegionFilter')}>
        <option value="all">{localize('FABRICATE.Gathering.AllRegions')}</option>
        {#each regionOptions as region (region)}
          <option value={region}>{region}</option>
        {/each}
      </select>
      <select bind:value={biomeFilter} aria-label={localize('FABRICATE.Gathering.BiomeFilter')}>
        <option value="all">{localize('FABRICATE.Gathering.AllBiomes')}</option>
        {#each biomeOptions as biome (biome)}
          <option value={biome}>{biome}</option>
        {/each}
      </select>
    </section>
    <main class="gathering-environment-list">
      {#each filteredEnvironments as environment (environment.id)}
        <section class="gathering-environment-card" class:is-blocked={environment.attemptable !== true}>
          <div class="gathering-environment-card-header">
            {#if environment.img}
              <img class="gathering-environment-image" src={environment.img} alt="" />
            {/if}
            <div>
              <h3>{environment.name}</h3>
              {#if environment.description}
                <p>{environment.description}</p>
              {/if}
              <div class="gathering-chip-row">
                {#if environment.region}<span class="gathering-chip">{environment.region}</span>{/if}
                {#if environment.biome}<span class="gathering-chip">{environment.biome}</span>{/if}
                {#if $viewState.hasMultipleGatheringSystems && environment.craftingSystemName}<span class="gathering-chip gathering-system-chip">{environment.craftingSystemName}</span>{/if}
                <span class="gathering-chip">{localize(`FABRICATE.Gathering.Risk.${environment.risk || 'safe'}`)}</span>
                {#if environment.conditions?.timeOfDay}<span class="gathering-chip">{environment.conditions.timeOfDay}</span>{/if}
                {#if environment.conditions?.weather}<span class="gathering-chip">{environment.conditions.weather}</span>{/if}
              </div>
            </div>
            {#if environment.sceneUuid}
              <span class="gathering-chip">{localize('FABRICATE.Gathering.SceneLinked')}</span>
            {/if}
          </div>

          {#if environment.blockedReasons?.length}
            <ul class="gathering-blocked-reasons">
              {#each environment.blockedReasons || [] as reason, index (reasonKey(reason, index, `environment:${environment.id}`))}
                <li>{blockedMessage(reason)}</li>
              {/each}
            </ul>
          {/if}

          <div class="gathering-task-list">
            {#each environment.tasks || [] as task, index (taskKey(environment, task, index))}
              <article class="gathering-task-row" class:is-blocked={task.attemptable !== true}>
                {#if task.img && !task.blind}
                  <img src={task.img} alt="" />
                {:else}
                  <div class="gathering-task-icon" aria-hidden="true">
                    <i class="fas fa-leaf"></i>
                  </div>
                {/if}

                <div class="gathering-task-body">
                  <strong>{displayTaskLabel(task)}</strong>
                  {#if task.description}
                    <span>{task.description}</span>
                  {/if}
                  {#if taskEconomySummary(task)}
                    <span class="gathering-task-economy">{taskEconomySummary(task)}</span>
                  {/if}
                  {#if task.blockedReasons?.length}
                    <ul class="gathering-blocked-reasons">
                      {#each task.blockedReasons || [] as reason, reasonIndex (reasonKey(reason, reasonIndex, taskKey(environment, task, index)))}
                        <li>{blockedMessage(reason)}</li>
                      {/each}
                    </ul>
                  {/if}
                </div>

                <button
                  type="button"
                  class="gathering-start-button"
                  disabled={task.attemptable !== true || $viewState.startingTaskKey === taskKey(environment, task, index)}
                  onclick={() => store.startTask(environment.id, task)}
                >
                  <i class="fas fa-leaf"></i>
                  <span>
                    {#if $viewState.startingTaskKey === taskKey(environment, task, index)}
                      {localize('FABRICATE.Gathering.Starting')}
                    {:else}
                      {startButtonLabel(task)}
                    {/if}
                  </span>
                </button>
              </article>
            {/each}
          </div>
        </section>
      {/each}
    </main>
  {/if}

  {#if $viewState.history?.length}
    <section class="gathering-run-section" aria-label={localize('FABRICATE.Gathering.History.Title')}>
      <div class="gathering-section-heading">
        <h3>{localize('FABRICATE.Gathering.History.Title')}</h3>
      </div>
      <div class="gathering-history-list">
        {#each $viewState.history as run, index (runKey(run, index, 'history'))}
          <article class="gathering-history-row">
            <div>
              <strong>{displayRunLabel(run)}</strong>
              {#if run.environmentName}
                <span>{run.environmentName}</span>
              {/if}
              {#if $viewState.hasMultipleGatheringSystems && run.craftingSystemName}
                <span class="gathering-chip gathering-system-chip">{run.craftingSystemName}</span>
              {/if}
            </div>
            <span>{historySummary(run)}</span>
          </article>
        {/each}
      </div>
    </section>
  {/if}
</div>
