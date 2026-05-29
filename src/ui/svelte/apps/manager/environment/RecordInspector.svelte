<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import { dropRateTierClass, dropRateTierColor } from '../../../util/dropRateTier.js';
  import CompositionStatePill from './CompositionStatePill.svelte';
  import RuntimeStatePill from './RuntimeStatePill.svelte';
  import MatchingEvidenceChips from './MatchingEvidenceChips.svelte';

  let {
    kind = 'task',
    entry = null,
    onOpenSource = () => {},
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

  const sourceLabel = $derived(kind === 'hazard'
    ? text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.SourceHazard', 'Reusable gathering hazard')
    : text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.SourceTask', 'Reusable gathering task'));

  const explanation = $derived((() => {
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

  const dropChancePreview = 100;
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
          <i class="fas fa-ban" aria-hidden="true"></i><span>{text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.Exclude', 'Exclude from environment')}</span>
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

  <section class="manager-inspector-card is-disabled-overrides" data-record-inspector-section="overrides">
    <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.Overrides', 'Environment overrides')}</h3>
    <p class="manager-muted">{text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.OverridesHint', 'Environment-local overrides do not modify the reusable source record. Per-field overrides are coming soon.')}</p>

    <label class="manager-field is-disabled">
      <span>{text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.PlayerLabel', 'Player-facing label')}</span>
      <input type="text" disabled placeholder={record?.name || ''} aria-label={text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.PlayerLabel', 'Player-facing label')} />
    </label>

    <label class="manager-field is-disabled manager-drop-rate-editor">
      <span>{text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.DropChance', 'Drop chance adjustment')}</span>
      <span class="manager-drop-rate-value">
        <span class="manager-drop-rate-percent">
          <input type="text" inputmode="numeric" value={dropChancePreview} disabled aria-label={text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.DropChance', 'Drop chance adjustment')} />
          <span aria-hidden="true">%</span>
        </span>
        <span class={`manager-drop-rate-control ${dropRateTierClass(dropChancePreview)}`} style={`--fab-drop-rate-value: ${dropChancePreview}%; --fab-drop-rate-color: ${dropRateTierColor(dropChancePreview)};`}>
          <span class="manager-drop-rate-track" aria-hidden="true"><span class="manager-drop-rate-fill"></span></span>
          <input type="range" min="1" max="100" step="1" value={dropChancePreview} disabled aria-label={text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.DropChance', 'Drop chance adjustment')} />
        </span>
      </span>
    </label>

    <label class="manager-field is-disabled">
      <span>{text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.EconomyImpact', 'Economy impact')}</span>
      <select disabled aria-label={text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.EconomyImpact', 'Economy impact')}>
        <option>{text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.EconomyNormal', 'Normal')}</option>
      </select>
    </label>

    <div class="manager-field is-disabled">
      <span>{text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.AttemptsPerNode', 'Attempts per node')}</span>
      <div class="manager-rule-stepper" aria-disabled="true">
        <button type="button" class="manager-icon-button" disabled aria-label={text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.Decrease', 'Decrease')}><i class="fas fa-minus" aria-hidden="true"></i></button>
        <input type="number" value="1" disabled aria-label={text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.AttemptsPerNode', 'Attempts per node')} />
        <button type="button" class="manager-icon-button" disabled aria-label={text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.Increase', 'Increase')}><i class="fas fa-plus" aria-hidden="true"></i></button>
      </div>
    </div>

    <div class="manager-field is-disabled manager-environment-override-toggle">
      <span>{text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.OverrideRuntime', 'Override runtime state')}</span>
      <button type="button" class="manager-status-toggle is-off" disabled aria-pressed="false" aria-label={text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.OverrideRuntime', 'Override runtime state')}>
        <span class="manager-status-toggle-track" aria-hidden="true"><span class="manager-status-toggle-knob"></span></span>
        <span class="manager-status-toggle-label">{text('FABRICATE.Admin.Manager.StatusOff', 'Off')}</span>
      </button>
    </div>
  </section>
{/if}
