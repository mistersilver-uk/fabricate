<!-- Svelte 5 runes mode -->
<script>
  import { onMount } from 'svelte';
  import { localize } from '../util/foundryBridge.js';

  let { store } = $props();

  // svelte-ignore state_referenced_locally
  const viewState = store.viewState;

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
    <main class="gathering-environment-list">
      {#each $viewState.environments as environment (environment.id)}
        <section class="gathering-environment-card" class:is-blocked={environment.attemptable !== true}>
          <div class="gathering-environment-card-header">
            <div>
              <h3>{environment.name}</h3>
              {#if environment.description}
                <p>{environment.description}</p>
              {/if}
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
            </div>
            <span>{historySummary(run)}</span>
          </article>
        {/each}
      </div>
    </section>
  {/if}
</div>
