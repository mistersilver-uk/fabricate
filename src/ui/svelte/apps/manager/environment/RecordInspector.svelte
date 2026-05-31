<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import CompositionStatePill from './CompositionStatePill.svelte';
  import RuntimeStatePill from './RuntimeStatePill.svelte';
  import MatchingEvidenceChips from './MatchingEvidenceChips.svelte';

  let {
    kind = 'task',
    environment = null,
    entry = null,
    onOpenSource = () => {},
    onUpdateEnvironment = () => {},
    onExclude = () => {},
    onRestore = () => {},
    onInclude = () => {}
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const defaultImg = $derived(kind === 'hazard' ? 'icons/svg/hazard.svg' : 'icons/svg/item-bag.svg');
  const record = $derived(entry?.record || null);
  const name = $derived(record?.name || entry?.id || text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.Unnamed', 'Unnamed'));
  const isStale = $derived(entry?.compositionState === 'includedButUnavailable');
  const isExcluded = $derived(entry?.compositionState === 'excluded');
  const isCandidate = $derived(entry?.compositionState === 'candidate');
  const isAvailable = $derived(entry?.runtimeState === 'available');
  const excludeLabel = $derived(environment?.compositionMode === 'manual'
    ? text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.Remove', 'Remove from environment')
    : text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.Exclude', 'Exclude from environment'));

  const sourceLabel = $derived(kind === 'hazard'
    ? text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.SourceHazard', 'Reusable gathering hazard')
    : text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.SourceTask', 'Reusable gathering task'));

  const explanation = $derived((() => {
    if (entry?.conditionsMet === false
      && (entry?.compositionState === 'includedByMatch'
        || entry?.compositionState === 'explicitlyIncluded'
        || entry?.compositionState === 'forceIncluded')) {
      return text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.ExplainConditionsBlocked', 'Blocked by current weather or time-of-day; the record matches the environment but is inactive until conditions allow.');
    }
    switch (entry?.compositionState) {
      case 'includedByMatch':
      case 'explicitlyIncluded':
        return text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.ExplainAvailable', 'All matching rules are satisfied and no active hazards block this record.');
      case 'forceIncluded':
        return text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.ExplainForceIncluded', 'Force-added by the GM despite not matching the environment context.');
      case 'includedButUnavailable':
        return text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.ExplainStale', 'Included in this environment but no longer matches the environment context.');
      case 'excluded':
        return text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.ExplainExcluded', 'Locally excluded from this environment.');
      case 'candidate':
        return text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.ExplainCandidate', 'Matches this environment but has not been included yet.');
      case 'notMatching':
        return text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.ExplainNotMatching', 'Does not match the environment context.');
      case 'libraryDisabled':
        return text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.ExplainLibraryDisabled', 'Disabled in the reusable library.');
      default:
        return '';
    }
  })());

  const layers = $derived([
    { id: 'library', label: text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.LayerLibrary', 'Library'), ok: entry?.libraryEnabled === true, value: entry?.libraryEnabled ? text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.Enabled', 'Enabled') : text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.Disabled', 'Disabled') },
    { id: 'matching', label: text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.LayerMatching', 'Matching'), ok: entry?.matches === true, value: entry?.matches ? text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.Matches', 'Matches') : text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.NoMatch', 'Does not match') },
    { id: 'composition', label: text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.LayerComposition', 'Composition'), ok: entry?.compositionState === 'includedByMatch' || entry?.compositionState === 'explicitlyIncluded', value: '' },
    { id: 'runtime', label: text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.LayerRuntime', 'Runtime'), ok: entry?.runtimeState === 'available', value: '' }
  ]);

  const adjustmentRows = $derived(Array.isArray(entry?.dropRateAdjustmentRows) ? entry.dropRateAdjustmentRows : []);
  const hazardAdjustment = $derived(Number.isFinite(Number(entry?.dropRateAdjustment)) ? Number(entry.dropRateAdjustment) : 0);

  const waitingForValues = $derived(entry?.conditionsMet === false
    ? [
        ...(entry?.evidence?.weather?.recordValues || []),
        ...(entry?.evidence?.time?.recordValues || [])
      ]
    : []);

  function clampAdjustment(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.max(-100, Math.min(100, Math.trunc(number)));
  }

  function setHazardAdjustment(value) {
    const adjustment = clampAdjustment(value);
    const id = String(entry?.id || '').trim();
    if (!id) return;
    const next = { ...(environment?.hazardDropRateAdjustments && typeof environment.hazardDropRateAdjustments === 'object' ? environment.hazardDropRateAdjustments : {}) };
    if (adjustment === 0) delete next[id];
    else next[id] = adjustment;
    onUpdateEnvironment({ hazardDropRateAdjustments: next });
  }

  function setTaskDropAdjustment(rowId, value) {
    const adjustment = clampAdjustment(value);
    const taskId = String(entry?.id || '').trim();
    const dropRowId = String(rowId || '').trim();
    if (!taskId || !dropRowId) return;
    const taskAdjustments = { ...(environment?.taskDropRateAdjustments && typeof environment.taskDropRateAdjustments === 'object' ? environment.taskDropRateAdjustments : {}) };
    const rowAdjustments = { ...(taskAdjustments[taskId] && typeof taskAdjustments[taskId] === 'object' ? taskAdjustments[taskId] : {}) };
    if (adjustment === 0) delete rowAdjustments[dropRowId];
    else rowAdjustments[dropRowId] = adjustment;
    if (Object.keys(rowAdjustments).length === 0) delete taskAdjustments[taskId];
    else taskAdjustments[taskId] = rowAdjustments;
    onUpdateEnvironment({ taskDropRateAdjustments: taskAdjustments });
  }

  function rowLabel(row) {
    return String(row?.name || row?.componentId || row?.itemUuid || row?.id || text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.DropRow', 'Drop row'));
  }
</script>

{#if entry}
  <section class="manager-inspector-card" data-record-inspector={kind}>
    <div class="manager-inspector-title-row is-hero-large">
      <img class="manager-recipe-preview" src={record?.img || defaultImg} alt="" />
      <div class="manager-inspector-copy">
        <p class="manager-kicker">{kind === 'hazard' ? text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.SelectedHazard', 'Selected hazard') : text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.SelectedTask', 'Selected task')}</p>
        <h2 class="manager-inspector-name" title={name}>{name}</h2>
        <div class="manager-chip-row">
          <CompositionStatePill state={entry.compositionState} />
          <RuntimeStatePill state={entry.runtimeState} />
        </div>
      </div>
    </div>
    <div class="manager-environment-inspector-actions">
      <button type="button" class="manager-button manager-environment-open-source" data-action="open-source" onclick={() => onOpenSource(kind, entry.id)}>
        <i class="fas fa-up-right-from-square" aria-hidden="true"></i>
        <span>{kind === 'hazard' ? text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.OpenSourceHazard', 'Open source hazard') : text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.OpenSourceTask', 'Open source task')}</span>
      </button>
      {#if isCandidate}
        <button type="button" class="manager-button is-primary" data-action="include" onclick={() => onInclude(kind, entry.id)}>
          <i class="fas fa-plus" aria-hidden="true"></i><span>{text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.Include', 'Include')}</span>
        </button>
      {:else if isExcluded}
        <button type="button" class="manager-button" data-action="restore" onclick={() => onRestore(kind, entry.id)}>
          <i class="fas fa-rotate-left" aria-hidden="true"></i><span>{text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.Restore', 'Restore')}</span>
        </button>
      {:else if isAvailable || isStale}
        <button type="button" class="manager-button is-danger" data-action="exclude" onclick={() => onExclude(kind, entry.id)}>
          <i class="fas fa-ban" aria-hidden="true"></i><span>{excludeLabel}</span>
        </button>
      {/if}
    </div>
  </section>

  <section class="manager-inspector-card" data-record-inspector-section="source">
    <p class="manager-kicker">{text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.Source', 'Source')}</p>
    <p class="manager-environment-source-label">{sourceLabel}</p>
    <p class="manager-muted">{text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.SourceHint', 'Composing this record does not modify the reusable source.')}</p>
  </section>

  <section class="manager-inspector-card {isStale ? 'is-warning' : ''}" data-record-inspector-section="runtime-state">
    <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.RuntimeState', 'Runtime state')}</h3>
    <div class="manager-chip-row"><RuntimeStatePill state={entry.runtimeState} /></div>
    {#if explanation}<p class="manager-muted">{explanation}</p>{/if}
    {#if waitingForValues.length > 0}
      <div class="manager-environment-waiting-for" data-record-inspector-waiting-for>
        <p class="manager-kicker">{text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.WaitingFor', 'Waiting for')}</p>
        <div class="manager-chip-row">
          {#each waitingForValues as value (value)}
            <span class="manager-chip is-warning">{value}</span>
          {/each}
        </div>
      </div>
    {/if}
    <ul class="manager-environment-layer-list">
      {#each layers as layer (layer.id)}
        <li class={`manager-environment-layer ${layer.ok ? 'is-ok' : 'is-warn'}`} data-layer={layer.id}>
          <i class={layer.ok ? 'fas fa-circle-check' : 'fas fa-circle-exclamation'} aria-hidden="true"></i>
          <span class="manager-environment-layer-label">{layer.label}</span>
          {#if layer.id === 'composition'}
            <CompositionStatePill state={entry.compositionState} />
          {:else if layer.id === 'runtime'}
            <RuntimeStatePill state={entry.runtimeState} />
          {:else}
            <span class="manager-environment-layer-value">{layer.value}</span>
          {/if}
        </li>
      {/each}
    </ul>
  </section>

  <section class="manager-inspector-card" data-record-inspector-section="evidence">
    <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.MatchEvidence', 'Matching evidence')}</h3>
    <MatchingEvidenceChips evidence={entry.evidence} variant="checks" />
  </section>

  {#if kind === 'hazard'}
    <section class="manager-inspector-card" data-record-inspector-section="hazard-runtime">
      <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.HazardRuntime', 'Hazard runtime')}</h3>
      <div class="manager-environment-inspector-facts">
        <div class="manager-fact"><strong>{Number.isFinite(Number(record?.dropRate)) ? `${Number(record.dropRate)}%` : '—'}</strong><span>{text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.HazardChance', 'Hazard chance')}</span></div>
        <div class="manager-fact"><strong>{text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.ScopeEnvironment', 'Environment-wide')}</strong><span>{text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.Scope', 'Scope')}</span></div>
      </div>
      <p class="manager-muted">{text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.HazardExplanation', 'Final hazard chance = base chance + matching hazard modifiers + environment and actor-specific modifiers.')}</p>
    </section>
  {/if}

  <section class="manager-inspector-card" data-record-inspector-section="overrides">
    <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.Overrides', 'Environment overrides')}</h3>
    <p class="manager-muted">{text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.OverridesHint', 'Drop-rate adjustments apply only in this environment and do not modify the reusable source record.')}</p>

    {#if kind === 'hazard'}
      <div class="manager-environment-drop-adjustment-row" data-drop-rate-adjustment={entry.id}>
        <div class="manager-environment-drop-adjustment-copy">
          <strong>{text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.HazardChance', 'Hazard chance')}</strong>
          <span>{text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.BaseAndEffectiveRate', 'Base {base}% · Effective {effective}%').replace('{base}', entry.baseDropRate ?? record?.dropRate ?? 0).replace('{effective}', entry.effectiveDropRate ?? record?.dropRate ?? 0)}</span>
        </div>
        <label class="manager-field manager-environment-drop-adjustment-input">
          <span>{text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.DropRateAdjustment', 'Drop-rate adjustment')}</span>
          <input type="number" min="-100" max="100" step="1" value={hazardAdjustment} aria-label={text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.DropRateAdjustment', 'Drop-rate adjustment')} onchange={(event) => setHazardAdjustment(event.currentTarget.value)} />
        </label>
        <button type="button" class="manager-button" disabled={hazardAdjustment === 0} onclick={() => setHazardAdjustment(0)}>
          <i class="fas fa-rotate-left" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.ClearAdjustment', 'Clear')}</span>
        </button>
      </div>
    {:else if adjustmentRows.length > 0}
      <div class="manager-environment-drop-adjustment-list">
        {#each adjustmentRows as row (row.id)}
          <div class="manager-environment-drop-adjustment-row" data-drop-rate-adjustment={row.id}>
            <div class="manager-environment-drop-adjustment-copy">
              <strong>{rowLabel(row)}</strong>
              <span>{text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.BaseAndEffectiveRate', 'Base {base}% · Effective {effective}%').replace('{base}', row.baseDropRate).replace('{effective}', row.effectiveDropRate)}</span>
            </div>
            <label class="manager-field manager-environment-drop-adjustment-input">
              <span>{text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.DropRateAdjustment', 'Drop-rate adjustment')}</span>
              <input type="number" min="-100" max="100" step="1" value={row.adjustment} aria-label={text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.DropRateAdjustment', 'Drop-rate adjustment')} onchange={(event) => setTaskDropAdjustment(row.id, event.currentTarget.value)} />
            </label>
            <button type="button" class="manager-button" disabled={row.adjustment === 0} onclick={() => setTaskDropAdjustment(row.id, 0)}>
              <i class="fas fa-rotate-left" aria-hidden="true"></i>
              <span>{text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.ClearAdjustment', 'Clear')}</span>
            </button>
          </div>
        {/each}
      </div>
    {:else}
      <p class="manager-muted">{text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.NoDropRows', 'This task has no drop rows to adjust.')}</p>
    {/if}
  </section>
{/if}
