<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import { evaluateEnvironmentReadiness } from './environmentReadiness.js';

  let { environment = null, composition = { counts: {} } } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const counts = $derived(composition?.counts || {});
  const active = $derived(environment?.enabled !== false);
  const selectionMode = $derived(environment?.selectionMode === 'blind' ? 'blind' : 'targeted');
  const compositionMode = $derived(environment?.compositionMode === 'manual' ? 'manual' : 'automatic');
  const sceneLinked = $derived(Boolean(String(environment?.sceneUuid || '').trim()));
  const readiness = $derived(evaluateEnvironmentReadiness(environment || {}, composition || {}));
  const critical = $derived(readiness.issues.filter(issue => issue.severity === 'critical').length);
  const warning = $derived(readiness.issues.filter(issue => issue.severity === 'warning').length);
</script>

<section class="manager-inspector-card" data-environment-summary-inspector>
  <p class="manager-kicker">{text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.Summary', 'Environment summary')}</p>
  <h2 class="manager-inspector-name" title={environment?.name || ''}>{environment?.name || text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.Unnamed', 'Unnamed environment')}</h2>
  <div class="manager-chip-row">
    <span class={`manager-chip ${active ? 'is-active' : 'is-neutral'}`}>{active ? text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.Active', 'Active') : text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.Draft', 'Draft')}</span>
    <span class="manager-chip is-info">{selectionMode === 'blind' ? text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.Blind', 'Blind') : text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.Targeted', 'Targeted')}</span>
    <span class="manager-chip is-info">{compositionMode === 'manual' ? text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.Manual', 'Manual') : text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.Automatic', 'Automatic')}</span>
  </div>
</section>

<section class="manager-inspector-card">
  <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.RuntimePreview', 'Runtime preview')}</h3>
  <div class="manager-fact-grid manager-environment-runtime-grid">
    <div class="manager-fact" data-runtime-fact="available-tasks"><strong>{counts.availableTasks || 0}</strong><span>{text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.AvailableTasks', 'Available tasks')}</span></div>
    <div class="manager-fact" data-runtime-fact="excluded-tasks"><strong>{counts.excludedTasks || 0}</strong><span>{text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.ExcludedTasks', 'Excluded tasks')}</span></div>
    <div class="manager-fact" data-runtime-fact="candidate-tasks"><strong>{counts.candidateTasks || 0}</strong><span>{text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.CandidateTasks', 'Task candidates')}</span></div>
    <div class="manager-fact" data-runtime-fact="available-hazards"><strong>{counts.availableHazards || 0}</strong><span>{text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.AvailableHazards', 'Available hazards')}</span></div>
    <div class="manager-fact" data-runtime-fact="excluded-hazards"><strong>{counts.excludedHazards || 0}</strong><span>{text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.ExcludedHazards', 'Excluded hazards')}</span></div>
    <div class="manager-fact" data-runtime-fact="unavailable-included"><strong>{(counts.unavailableTasks || 0) + (counts.unavailableHazards || 0)}</strong><span>{text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.UnavailableIncluded', 'Included but unavailable')}</span></div>
  </div>
  <p class="manager-muted">
    {sceneLinked
      ? text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.SceneLinked', 'A scene is linked.')
      : text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.SceneUnlinked', 'No scene linked.')}
  </p>
</section>

<section class="manager-inspector-card">
  <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.ValidationSummary', 'Validation summary')}</h3>
  <div class="manager-chip-row">
    <span class={`manager-chip ${critical > 0 ? 'is-danger' : 'is-positive'}`}>{text('FABRICATE.Admin.Manager.EnvironmentEditor.Validation.Severity.critical', 'Critical')}: {critical}</span>
    <span class={`manager-chip ${warning > 0 ? 'is-warning' : 'is-neutral'}`}>{text('FABRICATE.Admin.Manager.EnvironmentEditor.Validation.Severity.warning', 'Warning')}: {warning}</span>
  </div>
</section>
