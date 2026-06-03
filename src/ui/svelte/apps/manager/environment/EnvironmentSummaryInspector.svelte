<!-- Svelte 5 runes mode -->
<script>
  import { localize, viewScene } from '../../../util/foundryBridge.js';
  import { dragDrop } from '../../../actions/dragDrop.js';
  import { resolveDropData } from '../../../util/dropUtils.js';
  import { sceneDocumentImage } from '../../../util/sceneImages.js';
  import { evaluateEnvironmentReadiness } from './environmentReadiness.js';

  let { environment = null, composition = { counts: {} }, onUpdate = () => {} } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const counts = $derived(composition?.counts || {});
  const active = $derived(environment?.enabled !== false);
  const selectionMode = $derived(environment?.selectionMode === 'blind' ? 'blind' : 'targeted');
  const compositionMode = $derived(environment?.compositionMode === 'manual' ? 'manual' : 'automatic');
  const readiness = $derived(evaluateEnvironmentReadiness(environment || {}, composition || {}));
  const critical = $derived(readiness.issues.filter(issue => issue.severity === 'critical').length);
  const warning = $derived(readiness.issues.filter(issue => issue.severity === 'warning').length);

  const sceneUuid = $derived(String(environment?.sceneUuid || ''));
  let sceneThumb = $state('');
  let sceneName = $state('');
  $effect(() => {
    const uuid = sceneUuid;
    sceneThumb = '';
    sceneName = '';
    if (!uuid || typeof globalThis.fromUuid !== 'function') return;
    let cancelled = false;
    Promise.resolve(globalThis.fromUuid(uuid)).then(doc => {
      if (cancelled || !doc) return;
      sceneName = String(doc.name || '');
      sceneThumb = sceneDocumentImage(doc);
    }).catch(() => {});
    return () => { cancelled = true; };
  });
  const sceneLabel = $derived(sceneName || sceneUuid);

  function handleSceneDrop(data) {
    const { uuid, type } = resolveDropData(data);
    if (type !== 'Scene' || !uuid) return;
    onUpdate({ sceneUuid: uuid });
  }
  function unlinkScene() { onUpdate({ sceneUuid: '' }); }
  function onLinkedSceneMouseDown(event) {
    if (event.button !== 2) return;
    event.preventDefault();
    unlinkScene();
  }
</script>

<section class="manager-inspector-card" data-environment-summary-inspector>
  <p class="manager-kicker">{text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.Summary', 'Environment summary')}</p>
  <h2 class="manager-inspector-name" title={environment?.name || ''}>{environment?.name || text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.Unnamed', 'Unnamed environment')}</h2>
  <div class="manager-chip-row">
    <span class={`manager-chip ${active ? 'is-active' : 'is-neutral'}`}>{active ? text('FABRICATE.Admin.Manager.StatusOn', 'On') : text('FABRICATE.Admin.Manager.StatusOff', 'Off')}</span>
    <span class="manager-chip is-info">{selectionMode === 'blind' ? text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.Blind', 'Blind') : text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.Targeted', 'Targeted')}</span>
    <span class="manager-chip is-info">{compositionMode === 'manual' ? text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.Manual', 'Manual') : text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.Automatic', 'Automatic')}</span>
  </div>
</section>

<section class="manager-inspector-card" data-environment-summary-scene>
  <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.Scene', 'Linked scene')}</h3>
  {#if sceneUuid}
    <div
      class="manager-environment-scene-linked"
      data-overview-scene-linked
      title={text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.SceneReplaceTooltip', 'Drop a scene to replace it, or right-click to unlink.')}
      use:dragDrop={{ onDrop: handleSceneDrop, activeClass: 'is-drop-active' }}
      oncontextmenu={(event) => { event.preventDefault(); unlinkScene(); }}
      onmousedown={onLinkedSceneMouseDown}
    >
      {#if sceneThumb}
        <img class="manager-environment-scene-thumb" src={sceneThumb} alt="" />
      {:else}
        <span class="manager-environment-scene-thumb is-placeholder" aria-hidden="true"><i class="fas fa-map"></i></span>
      {/if}
      <button type="button" class="manager-environment-scene-name" onclick={(event) => { event.stopPropagation(); viewScene(sceneUuid); }} title={text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.OpenScene', 'Open scene')}>{sceneLabel}</button>
      <button type="button" class="manager-icon-button is-danger" aria-label={text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.UnlinkScene', 'Unlink scene')} title={text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.UnlinkScene', 'Unlink scene')} onclick={(event) => { event.stopPropagation(); unlinkScene(); }}><i class="fas fa-link-slash" aria-hidden="true"></i></button>
    </div>
  {:else}
    <div class="manager-environment-scene-dropzone" use:dragDrop={{ onDrop: handleSceneDrop, activeClass: 'is-drop-active' }}>
      <i class="fas fa-map-location-dot" aria-hidden="true"></i>
      <span>{text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.SceneDropHint', 'Drag a scene here to link it.')}</span>
    </div>
  {/if}
</section>

<section class="manager-inspector-card">
  <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.ValidationSummary', 'Validation summary')}</h3>
  <div class="manager-chip-row">
    <span class={`manager-chip ${critical > 0 ? 'is-danger' : 'is-positive'}`}>{text('FABRICATE.Admin.Manager.EnvironmentEditor.Validation.Severity.critical', 'Critical')}: {critical}</span>
    <span class={`manager-chip ${warning > 0 ? 'is-warning' : 'is-neutral'}`}>{text('FABRICATE.Admin.Manager.EnvironmentEditor.Validation.Severity.warning', 'Warning')}: {warning}</span>
  </div>
</section>

<section class="manager-inspector-card">
  <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.RuntimePreview', 'Runtime preview')}</h3>
  <div class="manager-fact-grid manager-environment-runtime-grid">
    <div class="manager-fact" data-runtime-fact="available-tasks"><span class="manager-fact-line"><strong>{counts.availableTasks || 0}</strong> <span class="manager-fact-label">{text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.AvailableTasks', 'Available tasks')}</span></span></div>
    <div class="manager-fact" data-runtime-fact="excluded-tasks"><span class="manager-fact-line"><strong>{counts.excludedTasks || 0}</strong> <span class="manager-fact-label">{text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.ExcludedTasks', 'Excluded tasks')}</span></span></div>
    <div class="manager-fact" data-runtime-fact="candidate-tasks"><span class="manager-fact-line"><strong>{counts.candidateTasks || 0}</strong> <span class="manager-fact-label">{text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.CandidateTasks', 'Task candidates')}</span></span></div>
    <div class="manager-fact" data-runtime-fact="available-hazards"><span class="manager-fact-line"><strong>{counts.availableHazards || 0}</strong> <span class="manager-fact-label">{text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.AvailableHazards', 'Available hazards')}</span></span></div>
    <div class="manager-fact" data-runtime-fact="excluded-hazards"><span class="manager-fact-line"><strong>{counts.excludedHazards || 0}</strong> <span class="manager-fact-label">{text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.ExcludedHazards', 'Excluded hazards')}</span></span></div>
    <div class="manager-fact" data-runtime-fact="unavailable-included"><span class="manager-fact-line"><strong>{(counts.unavailableTasks || 0) + (counts.unavailableHazards || 0)}</strong> <span class="manager-fact-label">{text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.UnavailableIncluded', 'Included but unavailable')}</span></span></div>
  </div>
</section>
