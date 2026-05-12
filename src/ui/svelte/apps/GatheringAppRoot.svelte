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
  let environmentPage = $state(1);
  const environmentPageSize = 6;

  const visibleEnvironments = $derived(($viewState.filteredEnvironments || []).filter(environment => {
    const query = searchTerm.trim().toLowerCase();
    const biomes = environmentBiomes(environment);
    const dangerTags = environmentDangerTags(environment);
    const matchesSearch = !query || `${environment.name || ''} ${environment.description || ''} ${environment.craftingSystemName || ''} ${environment.region || ''} ${biomes.join(' ')}`.toLowerCase().includes(query);
    const matchesRisk = riskFilter === 'all' || dangerTags.includes(riskFilter);
    const matchesRegion = regionFilter === 'all' || (environment.region || '') === regionFilter;
    const matchesBiome = biomeFilter === 'all' || biomes.includes(biomeFilter);
    return matchesSearch && matchesRisk && matchesRegion && matchesBiome;
  }));
  const environmentPageCount = $derived(Math.max(1, Math.ceil(visibleEnvironments.length / environmentPageSize)));
  const currentEnvironmentPage = $derived(Math.min(environmentPage, environmentPageCount));
  const pagedEnvironments = $derived(visibleEnvironments.slice((currentEnvironmentPage - 1) * environmentPageSize, currentEnvironmentPage * environmentPageSize));
  const activeEnvironment = $derived(visibleEnvironments.find(environment => environment.id === $viewState.selectedEnvironmentId) || null);
  const activeTasks = $derived(Array.isArray(activeEnvironment?.tasks) ? activeEnvironment.tasks : []);
  const activeTask = $derived(
    activeTasks.find((task, index) => taskKey(activeEnvironment, task, index) === $viewState.selectedTaskKey)
      || null
  );
  const regionOptions = $derived(uniqueSorted(($viewState.systemFilteredEnvironments || $viewState.filteredEnvironments || []).map(environment => environment.region)));
  const biomeOptions = $derived(uniqueSorted(($viewState.systemFilteredEnvironments || $viewState.filteredEnvironments || []).flatMap(environment => environmentBiomes(environment))));
  const riskOptions = $derived(uniqueSorted(($viewState.systemFilteredEnvironments || $viewState.filteredEnvironments || []).flatMap(environment => environmentDangerTags(environment))));
  const potentialResults = $derived(resultPreviews(activeTask));

  onMount(() => {
    store.refresh();
  });

  $effect(() => {
    searchTerm;
    riskFilter;
    regionFilter;
    biomeFilter;
    $viewState.availabilityFilter;
    $viewState.selectedSystemId;
    environmentPage = 1;
  });

  $effect(() => {
    if (environmentPage > environmentPageCount) environmentPage = environmentPageCount;
    if (environmentPage < 1) environmentPage = 1;
  });

  $effect(() => {
    const firstEnvironment = visibleEnvironments[0] || null;
    if (!activeEnvironment && firstEnvironment?.id) {
      store.selectEnvironment(firstEnvironment.id);
    }
  });

  function actorImage(actor) {
    return actor?.img || 'icons/svg/mystery-man.svg';
  }

  function environmentImage(environment) {
    return environment?.img || environment?.image || null;
  }

  function taskImage(task) {
    return task?.img || task?.image || null;
  }

  function displayTaskLabel(task) {
    if (task?.blind === true || task?.action === 'blindGather') {
      return task.label || localize('FABRICATE.Gathering.BlindTaskLabel');
    }
    return task?.label || task?.name || localize('FABRICATE.Gathering.BlindTaskLabel');
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
    if (run?.blind === true) return run.label || localize('FABRICATE.Gathering.BlindTaskLabel');
    return run?.label || localize('FABRICATE.Gathering.BlindTaskLabel');
  }

  function statusLabel(status) {
    const key = `FABRICATE.Gathering.Status.${status || 'unknown'}`;
    const value = localize(key);
    return value === key ? status || localize('FABRICATE.Gathering.Status.unknown') : value;
  }

  function riskLabel(risk) {
    const tag = risk || 'safe';
    const key = `FABRICATE.Gathering.Risk.${tag}`;
    const value = localize(key);
    return value === key ? tag : value;
  }

  function environmentBiomes(environment) {
    const values = Array.isArray(environment?.biomes) ? environment.biomes : (environment?.biome ? [environment.biome] : []);
    return uniqueSorted(values);
  }

  function environmentDangerTags(environment) {
    const values = Array.isArray(environment?.dangerTags) ? environment.dangerTags : (environment?.risk ? [environment.risk] : ['safe']);
    return uniqueSorted(values.length ? values : ['safe']);
  }

  function activeRunTime(run) {
    if (!run?.timeGate?.availableAt) return '';
    return localize('FABRICATE.Gathering.ActiveRuns.AvailableAt', { time: run.timeGate.availableAt });
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

  function runCharacterModifierSnapshot(run) {
    const snapshot = run?.characterModifierSnapshot;
    if (!snapshot || typeof snapshot !== 'object') return null;
    const rows = Array.isArray(snapshot.rows) ? snapshot.rows : [];
    const hazards = Array.isArray(snapshot.hazards) ? snapshot.hazards : [];
    if (rows.length === 0 && hazards.length === 0) return null;
    return { rows, hazards };
  }

  function characterModifierContributions(entry) {
    return Array.isArray(entry?.contributions) ? entry.contributions : [];
  }

  function characterModifierRedactedTotal(entry) {
    let positive = 0;
    let negative = 0;
    for (const contribution of characterModifierContributions(entry)) {
      const value = Number(contribution?.contribution ?? 0);
      if (!Number.isFinite(value)) continue;
      if (value >= 0) positive += value;
      else negative += value;
    }
    return { positive, negative };
  }

  function characterModifierContributionIsRedacted(contribution) {
    if (!contribution || typeof contribution !== 'object') return true;
    // GM payload includes modifierId / label / effectiveExpression / effectiveProvider.
    // Redacted payload contains only { contribution }.
    return !('modifierId' in contribution) && !('label' in contribution) && !('effectiveExpression' in contribution);
  }

  function characterModifierContributionLabel(contribution) {
    if (contribution?.label) return contribution.label;
    if (contribution?.modifierId) return contribution.modifierId;
    return localize('FABRICATE.Gathering.History.CharacterModifiers.UnknownModifier') || 'Unknown modifier';
  }

  function characterModifierContributionIcon(contribution) {
    return contribution?.icon || 'fa-solid fa-user';
  }

  function characterModifierContributionEffective(contribution) {
    if (contribution?.effectiveMacroUuid) return contribution.effectiveMacroUuid;
    if (contribution?.effectiveExpression) return contribution.effectiveExpression;
    return '';
  }

  function characterModifierContributionRawDisplay(contribution) {
    const raw = Number(contribution?.rawValue ?? 0);
    const clamped = Number(contribution?.clampedValue ?? raw);
    if (Number.isFinite(raw) && Number.isFinite(clamped) && raw !== clamped) {
      const bounds = contribution?.bounds || {};
      const boundsLabel = `${bounds.min ?? '-∞'}..${bounds.max ?? '+∞'}`;
      return `${raw} → ${clamped} (${boundsLabel})`;
    }
    return Number.isFinite(raw) ? String(raw) : '—';
  }

  function characterModifierContributionFinal(contribution) {
    const value = Number(contribution?.contribution ?? 0);
    if (!Number.isFinite(value)) return '—';
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value}`;
  }

  function characterModifierRedactedSummary(entry) {
    const { positive, negative } = characterModifierRedactedTotal(entry);
    return localize('FABRICATE.Gathering.History.CharacterModifiers.RedactedSummary', {
      positive: `+${positive}`,
      negative: `${negative}`
    }) || `modifiers contributed +${positive} / ${negative}`;
  }

  function uniqueSorted(values) {
    return Array.from(new Set(values.map(value => String(value || '').trim()).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b));
  }

  function economyParts(source) {
    const rich = source?.rich || source?.economyEvidence || source || {};
    const parts = [];
    const stamina = rich?.stamina;
    const nodes = rich?.nodes;
    const attemptLimit = rich?.attemptLimit;
    if (stamina?.cost) parts.push(localize('FABRICATE.Gathering.StaminaCost', { cost: stamina.cost }));
    if (stamina?.spent) parts.push(localize('FABRICATE.Gathering.StaminaSpent', { spent: stamina.spent }));
    if (nodes) {
      parts.push(nodes.current === null || nodes.current === undefined
        ? localize(nodes.available ? 'FABRICATE.Gathering.NodesAvailable' : 'FABRICATE.Gathering.NodesDepleted')
        : localize('FABRICATE.Gathering.NodeCount', { current: nodes.current, max: nodes.max }));
    }
    if (attemptLimit?.remaining !== null && attemptLimit?.remaining !== undefined) {
      parts.push(localize('FABRICATE.Gathering.AttemptsRemaining', { remaining: attemptLimit.remaining, max: attemptLimit.max }));
    } else if (attemptLimit?.count !== undefined && attemptLimit?.max !== undefined) {
      parts.push(localize('FABRICATE.Gathering.AttemptsUsed', { count: attemptLimit.count, max: attemptLimit.max }));
    }
    return parts;
  }

  function taskEconomySummary(task) {
    return economyParts(task).join(' · ');
  }

  function environmentAvailability(environment) {
    if (environment?.attemptable === true) return localize('FABRICATE.Gathering.Availability.Available');
    if (environment?.attemptable === false) return localize('FABRICATE.Gathering.Availability.Blocked');
    if (!environment?.tasks?.length) return localize('FABRICATE.Gathering.Availability.Empty');
    return localize('FABRICATE.Gathering.Availability.Available');
  }

  function conditionFacts(environment) {
    const conditions = environment?.conditions || {};
    return [
      { icon: 'fa-sun', label: localize('FABRICATE.Gathering.Condition.Time'), value: conditions.timeOfDay },
      { icon: 'fa-cloud-sun', label: localize('FABRICATE.Gathering.Condition.Weather'), value: conditions.weather },
      { icon: 'fa-eye', label: localize('FABRICATE.Gathering.Condition.Visibility'), value: conditions.visibility }
    ].filter(fact => String(fact.value || '').trim());
  }

  function startButtonLabel(task) {
    if (!task) return localize('FABRICATE.Gathering.StartGathering');
    if (task?.attemptable !== true) return localize('FABRICATE.Gathering.BlockedAction');
    return localize('FABRICATE.Gathering.StartGathering');
  }

  function resultPreviews(task) {
    if (!task || task.blind === true) return [];
    const previews = task.potentialResults || task.resultPreviews || task.resultsPreview || task.visibleResults || [];
    return Array.isArray(previews) ? previews.filter(Boolean) : [];
  }

  function resultImage(result) {
    return result?.img || result?.image || result?.icon || 'icons/svg/item-bag.svg';
  }

  function runEvidence(run) {
    const parts = [];
    if (run?.environmentName) parts.push(run.environmentName);
    if ($viewState.hasMultipleGatheringSystems && run?.craftingSystemName) parts.push(run.craftingSystemName);
    parts.push(...economyParts(run));
    if (run?.conditions) {
      parts.push(...Object.values(run.conditions).map(value => String(value || '').trim()).filter(Boolean));
    }
    if (Array.isArray(run?.chatMessageIds) && run.chatMessageIds.length > 0) {
      parts.push(localize('FABRICATE.Gathering.ChatMessages', { count: run.chatMessageIds.length }));
    }
    return parts;
  }

  function environmentPaginationSummary() {
    if (visibleEnvironments.length === 0) {
      return localize('FABRICATE.Gathering.Pagination.ShowingEnvironments', { start: 0, end: 0, total: 0 });
    }
    const start = ((currentEnvironmentPage - 1) * environmentPageSize) + 1;
    const end = Math.min(currentEnvironmentPage * environmentPageSize, visibleEnvironments.length);
    return localize('FABRICATE.Gathering.Pagination.ShowingEnvironments', { start, end, total: visibleEnvironments.length });
  }

  function selectEnvironment(environment) {
    store.selectEnvironment(environment?.id);
  }

  function selectTask(task, index) {
    store.selectTask(activeEnvironment?.id, task, index);
  }
</script>

<div class="fabricate-gathering-app">
  <header class="gathering-v2-header">
    <section class="gathering-v2-title">
      <i class="fas fa-leaf" aria-hidden="true"></i>
      <div>
        <h2>{localize('FABRICATE.Gathering.Title')}</h2>
        <p>{localize('FABRICATE.Gathering.Subtitle')}</p>
      </div>
    </section>

    <section class="gathering-v2-actor-card" aria-label={localize('FABRICATE.Gathering.SelectedActor')}>
      {#if $viewState.selectedActor}
        <img src={actorImage($viewState.selectedActor)} alt="" />
      {/if}
      <label>
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
    </section>

    {#if $viewState.staminaSummary}
      <section class="gathering-v2-stamina" aria-label={localize('FABRICATE.Gathering.Stamina')}>
        <span>{localize('FABRICATE.Gathering.Stamina')}</span>
        <strong>{localize('FABRICATE.Gathering.StaminaSummary', { current: $viewState.staminaSummary.current, max: $viewState.staminaSummary.max ?? '?' })}</strong>
        <meter min="0" max={$viewState.staminaSummary.max || $viewState.staminaSummary.current || 1} value={$viewState.staminaSummary.current || 0}></meter>
      </section>
    {/if}

    <nav class="gathering-v2-tabs" aria-label={localize('FABRICATE.Gathering.Navigation')}>
      <button type="button" class:is-active={$viewState.activeTab === 'environments'} aria-pressed={$viewState.activeTab === 'environments'} onclick={() => store.selectTab('environments')}>
        <i class="fas fa-leaf" aria-hidden="true"></i>
        <span>{localize('FABRICATE.Gathering.Tabs.Environments')}</span>
      </button>
      <button type="button" class:is-active={$viewState.activeTab === 'log'} aria-pressed={$viewState.activeTab === 'log'} onclick={() => store.selectTab('log')}>
        <i class="fas fa-rectangle-list" aria-hidden="true"></i>
        <span>{localize('FABRICATE.Gathering.Tabs.Log')}</span>
      </button>
    </nav>
  </header>

  {#if $viewState.feedback}
    <section class="gathering-feedback-panel" class:success={$viewState.feedback.tone === 'success'} class:warning={$viewState.feedback.tone === 'warning'} aria-label={localize('FABRICATE.Gathering.Feedback.Title')}>
      <div>
        <h3>{localize('FABRICATE.Gathering.Feedback.Title')}</h3>
        <strong>{$viewState.feedback.label}</strong>
      </div>
      <span>{$viewState.feedback.message}</span>
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
  {:else if $viewState.activeTab === 'log'}
    <main class="gathering-v2-log" aria-label={localize('FABRICATE.Gathering.Tabs.Log')}>
      <section class="gathering-run-section">
        <div class="gathering-section-heading"><h3>{localize('FABRICATE.Gathering.ActiveRuns.Title')}</h3></div>
        <div class="gathering-runs-grid">
          {#each $viewState.activeRuns as run, index (runKey(run, index, 'active'))}
            <article class="gathering-run-row">
              <div>
                <strong>{displayRunLabel(run)}</strong>
                {#each runEvidence(run) as part (part)}<span>{part}</span>{/each}
              </div>
              <div class="gathering-run-meta">
                <span>{statusLabel(run.status)}</span>
                {#if activeRunTime(run)}<span>{activeRunTime(run)}</span>{/if}
              </div>
            </article>
          {:else}
            <div class="gathering-empty-state is-compact">{localize('FABRICATE.Gathering.Empty.NoActiveRuns')}</div>
          {/each}
        </div>
      </section>

      <section class="gathering-run-section">
        <div class="gathering-section-heading"><h3>{localize('FABRICATE.Gathering.History.Title')}</h3></div>
        <div class="gathering-history-list">
          {#each $viewState.history as run, index (runKey(run, index, 'history'))}
            {@const characterModifierSnapshot = runCharacterModifierSnapshot(run)}
            <article class="gathering-history-row">
              <div>
                <strong>{displayRunLabel(run)}</strong>
                {#each runEvidence(run) as part (part)}<span>{part}</span>{/each}
              </div>
              <span>{historySummary(run)}</span>
              {#if characterModifierSnapshot}
                <details class="gathering-history-character-modifiers" data-gathering-character-modifier-evidence>
                  <summary>{localize('FABRICATE.Gathering.History.CharacterModifiers.Title') || 'Character Modifiers'}</summary>
                  {#if characterModifierSnapshot.rows.length > 0}
                    <div class="gathering-history-character-modifier-section">
                      <h5>{localize('FABRICATE.Gathering.History.CharacterModifiers.RowsHeading') || 'Drop rows'}</h5>
                      {#each characterModifierSnapshot.rows as rowEntry, rowIndex (rowEntry?.rowId || `row-${rowIndex}`)}
                        <div class="gathering-history-character-modifier-row" data-gathering-character-modifier-row={rowEntry?.rowId || ''}>
                          {#if characterModifierContributions(rowEntry).length === 0}
                            <span class="gathering-empty-state is-compact">{localize('FABRICATE.Gathering.History.CharacterModifiers.RowEmpty') || 'No character modifier contributions.'}</span>
                          {:else if characterModifierContributionIsRedacted(characterModifierContributions(rowEntry)[0])}
                            <span class="gathering-history-character-modifier-redacted">{characterModifierRedactedSummary(rowEntry)}</span>
                          {:else}
                            {#each characterModifierContributions(rowEntry) as contribution, contributionIndex (`row-${rowIndex}-${contributionIndex}`)}
                              <div class="gathering-history-character-modifier-evidence">
                                <span class="gathering-history-character-modifier-label"><i class={characterModifierContributionIcon(contribution)} aria-hidden="true"></i> {characterModifierContributionLabel(contribution)}</span>
                                {#if characterModifierContributionEffective(contribution)}
                                  <code class="gathering-history-character-modifier-expression">{characterModifierContributionEffective(contribution)}</code>
                                {/if}
                                <span class="gathering-history-character-modifier-raw">{characterModifierContributionRawDisplay(contribution)}</span>
                                <span class="gathering-history-character-modifier-final" data-operator={contribution?.operator || '+'}>{contribution?.operator || '+'} {characterModifierContributionFinal(contribution)}</span>
                                {#if contribution?.diagnostic}
                                  <span class="gathering-history-character-modifier-diagnostic" role="alert">
                                    <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> {contribution.diagnostic}
                                  </span>
                                {/if}
                              </div>
                            {/each}
                          {/if}
                        </div>
                      {/each}
                    </div>
                  {/if}
                  {#if characterModifierSnapshot.hazards.length > 0}
                    <div class="gathering-history-character-modifier-section">
                      <h5>{localize('FABRICATE.Gathering.History.CharacterModifiers.HazardsHeading') || 'Hazards'}</h5>
                      {#each characterModifierSnapshot.hazards as hazardEntry, hazardIndex (hazardEntry?.hazardId || `hazard-${hazardIndex}`)}
                        <div class="gathering-history-character-modifier-row" data-gathering-character-modifier-hazard={hazardEntry?.hazardId || ''}>
                          {#if characterModifierContributions(hazardEntry).length === 0}
                            <span class="gathering-empty-state is-compact">{localize('FABRICATE.Gathering.History.CharacterModifiers.RowEmpty') || 'No character modifier contributions.'}</span>
                          {:else if characterModifierContributionIsRedacted(characterModifierContributions(hazardEntry)[0])}
                            <span class="gathering-history-character-modifier-redacted">{characterModifierRedactedSummary(hazardEntry)}</span>
                          {:else}
                            {#each characterModifierContributions(hazardEntry) as contribution, contributionIndex (`hazard-${hazardIndex}-${contributionIndex}`)}
                              <div class="gathering-history-character-modifier-evidence">
                                <span class="gathering-history-character-modifier-label"><i class={characterModifierContributionIcon(contribution)} aria-hidden="true"></i> {characterModifierContributionLabel(contribution)}</span>
                                {#if characterModifierContributionEffective(contribution)}
                                  <code class="gathering-history-character-modifier-expression">{characterModifierContributionEffective(contribution)}</code>
                                {/if}
                                <span class="gathering-history-character-modifier-raw">{characterModifierContributionRawDisplay(contribution)}</span>
                                <span class="gathering-history-character-modifier-final" data-operator={contribution?.operator || '+'}>{contribution?.operator || '+'} {characterModifierContributionFinal(contribution)}</span>
                                {#if contribution?.diagnostic}
                                  <span class="gathering-history-character-modifier-diagnostic" role="alert">
                                    <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> {contribution.diagnostic}
                                  </span>
                                {/if}
                              </div>
                            {/each}
                          {/if}
                        </div>
                      {/each}
                    </div>
                  {/if}
                </details>
              {/if}
            </article>
          {:else}
            <div class="gathering-empty-state is-compact">{localize('FABRICATE.Gathering.Empty.NoHistory')}</div>
          {/each}
        </div>
      </section>
    </main>
  {:else if $viewState.environments.length === 0}
    <div class="gathering-empty-state">
      {#each $viewState.blockedReasons as reason, index (reasonKey(reason, index, 'listing'))}
        <span>{blockedMessage(reason)}</span>
      {:else}
        <span>{localize('FABRICATE.Gathering.Empty.NoEnvironments')}</span>
      {/each}
    </div>
  {:else}
    <main class="gathering-v2-workspace" aria-label={localize('FABRICATE.Gathering.Workspace')}>
      <aside class="gathering-v2-environment-browser" aria-label={localize('FABRICATE.Gathering.EnvironmentBrowser')}>
        <section class="gathering-filter-bar" aria-label={localize('FABRICATE.Gathering.Filters')}>
          <label class="gathering-search">
            <i class="fas fa-search" aria-hidden="true"></i>
            <input type="search" bind:value={searchTerm} placeholder={localize('FABRICATE.Gathering.SearchPlaceholder')} />
          </label>
          <select bind:value={riskFilter} aria-label={localize('FABRICATE.Gathering.RiskFilter')}>
            <option value="all">{localize('FABRICATE.Gathering.AllRisks')}</option>
            {#each riskOptions as risk (risk)}<option value={risk}>{riskLabel(risk)}</option>{/each}
          </select>
          <select value={$viewState.availabilityFilter} aria-label={localize('FABRICATE.Gathering.AvailabilityFilter')} onchange={(event) => store.setAvailabilityFilter(event.target.value)}>
            <option value="all">{localize('FABRICATE.Gathering.Availability.All')}</option>
            <option value="available">{localize('FABRICATE.Gathering.Availability.Available')}</option>
            <option value="blocked">{localize('FABRICATE.Gathering.Availability.Blocked')}</option>
            <option value="empty">{localize('FABRICATE.Gathering.Availability.Empty')}</option>
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
            {#each regionOptions as region (region)}<option value={region}>{region}</option>{/each}
          </select>
          <select bind:value={biomeFilter} aria-label={localize('FABRICATE.Gathering.BiomeFilter')}>
            <option value="all">{localize('FABRICATE.Gathering.AllBiomes')}</option>
            {#each biomeOptions as biome (biome)}<option value={biome}>{biome}</option>{/each}
          </select>
        </section>

        <section class="gathering-v2-environment-list" aria-label={localize('FABRICATE.Gathering.EnvironmentList')}>
          {#each pagedEnvironments as environment (environment.id)}
            <button
              type="button"
              class="gathering-v2-environment-row"
              class:is-selected={activeEnvironment?.id === environment.id}
              class:is-blocked={environment.attemptable === false}
              aria-pressed={activeEnvironment?.id === environment.id}
              onclick={() => selectEnvironment(environment)}
            >
              {#if environmentImage(environment)}
                <img src={environmentImage(environment)} alt="" />
              {:else}
                <span class="gathering-environment-placeholder" aria-label={localize('FABRICATE.Gathering.EnvironmentImagePlaceholder')}>
                  <i class="fas fa-leaf" aria-hidden="true"></i>
                </span>
              {/if}
              <span class="gathering-v2-row-copy">
                <strong>{environment.name}</strong>
                <span>{environment.region || environment.craftingSystemName || localize('FABRICATE.Gathering.NoRegion')}</span>
                <span class="gathering-chip-row">
                  {#each environmentBiomes(environment) as biome (biome)}<span class="gathering-chip">{biome}</span>{/each}
                  {#each environmentDangerTags(environment) as risk (risk)}<span class={`gathering-chip is-risk-${risk}`}>{riskLabel(risk)}</span>{/each}
                </span>
              </span>
              <span class="gathering-v2-row-status">{environmentAvailability(environment)}</span>
            </button>
          {:else}
            <div class="gathering-empty-state is-compact">{localize('FABRICATE.Gathering.Empty.NoFilteredEnvironments')}</div>
          {/each}
        </section>

        <footer class="gathering-v2-pagination" aria-label={localize('FABRICATE.Gathering.Pagination.Environments')}>
          <span>{environmentPaginationSummary()}</span>
          <div>
            <button type="button" class="gathering-icon-action" disabled={currentEnvironmentPage <= 1} title={localize('FABRICATE.Gathering.Pagination.PreviousPage')} aria-label={localize('FABRICATE.Gathering.Pagination.PreviousPage')} onclick={() => environmentPage -= 1}>
              <i class="fas fa-chevron-left" aria-hidden="true"></i>
            </button>
            <span>{currentEnvironmentPage} / {environmentPageCount}</span>
            <button type="button" class="gathering-icon-action" disabled={currentEnvironmentPage >= environmentPageCount} title={localize('FABRICATE.Gathering.Pagination.NextPage')} aria-label={localize('FABRICATE.Gathering.Pagination.NextPage')} onclick={() => environmentPage += 1}>
              <i class="fas fa-chevron-right" aria-hidden="true"></i>
            </button>
          </div>
        </footer>
      </aside>

      <section class="gathering-v2-task-panel" aria-label={localize('FABRICATE.Gathering.TaskList')}>
        {#if activeEnvironment}
          <div class="gathering-v2-panel-heading">
            <div class="gathering-v2-hero-copy">
              <h3>{activeEnvironment.name}</h3>
              <span>{localize('FABRICATE.Gathering.GatheringTasks')}</span>
            </div>
            {#each environmentDangerTags(activeEnvironment) as risk (risk)}<span class={`gathering-chip is-risk-${risk}`}>{riskLabel(risk)}</span>{/each}
          </div>

          {#if activeEnvironment.blockedReasons?.length}
            <ul class="gathering-blocked-reasons">
              {#each activeEnvironment.blockedReasons || [] as reason, index (reasonKey(reason, index, `environment:${activeEnvironment.id}`))}
                <li>{blockedMessage(reason)}</li>
              {/each}
            </ul>
          {/if}

          <div class="gathering-task-list">
            {#each activeTasks as task, index (taskKey(activeEnvironment, task, index))}
              <article class="gathering-task-row" class:is-selected={activeTask && taskKey(activeEnvironment, task, index) === taskKey(activeEnvironment, activeTask, activeTasks.indexOf(activeTask))} class:is-blocked={task.attemptable !== true}>
                <button type="button" class="gathering-task-select" onclick={() => selectTask(task, index)} aria-label={localize('FABRICATE.Gathering.SelectTask', { name: displayTaskLabel(task) })}>
                  {#if taskImage(task) && !task.blind}
                    <img src={taskImage(task)} alt="" />
                  {:else}
                    <span class="gathering-task-icon" aria-hidden="true"><i class="fas fa-leaf"></i></span>
                  {/if}
                </button>

                <div class="gathering-task-body">
                  <strong>{displayTaskLabel(task)}</strong>
                  {#if task.description && !task.blind}<span>{task.description}</span>{/if}
                  {#if taskEconomySummary(task)}<span class="gathering-task-economy">{taskEconomySummary(task)}</span>{/if}
                  {#if task.blockedReasons?.length}
                    <ul class="gathering-blocked-reasons">
                      {#each task.blockedReasons || [] as reason, reasonIndex (reasonKey(reason, reasonIndex, taskKey(activeEnvironment, task, index)))}
                        <li>{blockedMessage(reason)}</li>
                      {/each}
                    </ul>
                  {/if}
                </div>

                <button
                  type="button"
                  class="gathering-icon-action"
                  disabled={task.attemptable !== true || $viewState.startingTaskKey === taskKey(activeEnvironment, task, index)}
                  title={startButtonLabel(task)}
                  aria-label={startButtonLabel(task)}
                  onclick={() => store.startTask(activeEnvironment.id, task)}
                >
                  <i class="fas fa-chevron-right" aria-hidden="true"></i>
                </button>
              </article>
            {:else}
              <div class="gathering-empty-state is-compact">{localize('FABRICATE.Gathering.Empty.NoTasks')}</div>
            {/each}
          </div>
        {:else}
          <div class="gathering-empty-state is-compact">{localize('FABRICATE.Gathering.Empty.SelectEnvironmentForTasks')}</div>
        {/if}
      </section>

      <aside class="gathering-v2-detail-panel" aria-label={localize('FABRICATE.Gathering.EnvironmentDetail')}>
        {#if activeEnvironment}
          <section class="gathering-v2-hero">
            {#if environmentImage(activeEnvironment)}
              <img src={environmentImage(activeEnvironment)} alt="" />
            {:else}
              <div class="gathering-v2-hero-placeholder" aria-label={localize('FABRICATE.Gathering.EnvironmentImagePlaceholder')}>
                <i class="fas fa-leaf" aria-hidden="true"></i>
              </div>
            {/if}
            <div>
              <h3>{activeEnvironment.name}</h3>
              <span>{activeEnvironment.region || localize('FABRICATE.Gathering.NoRegion')}</span>
              {#each environmentDangerTags(activeEnvironment) as risk (risk)}<span class={`gathering-chip is-risk-${risk}`}>{riskLabel(risk)}</span>{/each}
            </div>
          </section>

          {#if activeEnvironment.description}<p class="gathering-v2-description">{activeEnvironment.description}</p>{/if}

          <section class="gathering-v2-facts" aria-label={localize('FABRICATE.Gathering.EnvironmentFacts')}>
            {#each environmentBiomes(activeEnvironment) as biome (biome)}
              <div><i class="fas fa-seedling" aria-hidden="true"></i><span>{localize('FABRICATE.Gathering.Biome')}</span><strong>{biome}</strong></div>
            {/each}
            {#each conditionFacts(activeEnvironment) as fact (fact.label)}
              <div><i class={`fas ${fact.icon}`} aria-hidden="true"></i><span>{fact.label}</span><strong>{fact.value}</strong></div>
            {/each}
            {#if activeEnvironment.sceneUuid}
              <div><i class="fas fa-map-location-dot" aria-hidden="true"></i><span>{localize('FABRICATE.Gathering.Scene')}</span><strong>{localize('FABRICATE.Gathering.SceneLinked')}</strong></div>
            {/if}
          </section>

          <section class="gathering-v2-active-task" aria-label={localize('FABRICATE.Gathering.ActiveTask')}>
            <div class="gathering-section-heading"><h3>{localize('FABRICATE.Gathering.ActiveTask')}</h3></div>
            {#if activeTask}
              <article class="gathering-v2-active-task-card">
                {#if taskImage(activeTask) && !activeTask.blind}
                  <img src={taskImage(activeTask)} alt="" />
                {:else}
                  <span class="gathering-task-icon" aria-hidden="true"><i class="fas fa-leaf"></i></span>
                {/if}
                <div>
                  <strong>{displayTaskLabel(activeTask)}</strong>
                  {#if activeTask.description && !activeTask.blind}<span>{activeTask.description}</span>{/if}
                </div>
                {#if taskEconomySummary(activeTask)}<span>{taskEconomySummary(activeTask)}</span>{/if}
              </article>

              <div class="gathering-v2-detail-section">
                <h4>{localize('FABRICATE.Gathering.Requirements')}</h4>
                <p>{activeTask.requirementsSummary || activeTask.toolsSummary || localize('FABRICATE.Gathering.NoToolsRequired')}</p>
              </div>

              {#if potentialResults.length}
                <div class="gathering-v2-detail-section">
                  <h4>{localize('FABRICATE.Gathering.PotentialResults')}</h4>
                  <div class="gathering-v2-result-grid">
                    {#each potentialResults.slice(0, 5) as result, index (`result:${result.id || result.name || index}`)}
                      <article>
                        <img src={resultImage(result)} alt="" />
                        <strong>{result.name || result.label || localize('FABRICATE.Labels.UnknownItem')}</strong>
                        {#if result.rarity}<span>{result.rarity}</span>{/if}
                      </article>
                    {/each}
                  </div>
                </div>
              {/if}

              {#if activeTask.notes}
                <div class="gathering-v2-detail-section">
                  <h4>{localize('FABRICATE.Gathering.TaskNotes')}</h4>
                  <p>{activeTask.notes}</p>
                </div>
              {/if}

              <button type="button" class="gathering-start-button" disabled={activeTask.attemptable !== true} onclick={() => store.startTask(activeEnvironment.id, activeTask)}>
                <i class="fas fa-play" aria-hidden="true"></i>
                <span>{startButtonLabel(activeTask)}</span>
              </button>
            {:else}
              <div class="gathering-empty-state is-compact">{localize('FABRICATE.Gathering.Empty.NoTasks')}</div>
            {/if}
          </section>
        {:else}
          <div class="gathering-empty-state is-compact">{localize('FABRICATE.Gathering.Empty.SelectEnvironmentForDetails')}</div>
        {/if}
      </aside>
    </main>
  {/if}
</div>
