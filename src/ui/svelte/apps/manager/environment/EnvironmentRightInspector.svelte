<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import EnvironmentSummaryInspector from './EnvironmentSummaryInspector.svelte';
  import RecordInspector from './RecordInspector.svelte';

  let {
    activeTab = 'overview',
    environment = null,
    composition = { tasks: [], hazards: [], counts: {} },
    selectedKind = '',
    selectedId = '',
    onUpdateEnvironment = () => {}
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  // The inspector is tab-specific: Overview always shows the environment summary
  // (never a selected record); Tasks/Hazards show the selected record of their
  // own kind, so a stale cross-tab selection never leaks between tabs.
  const recordKind = $derived(activeTab === 'hazards' ? 'hazard' : 'task');
  const recordEntry = $derived((() => {
    if (activeTab !== 'tasks' && activeTab !== 'hazards') return null;
    if (selectedKind !== recordKind || !selectedId) return null;
    const list = recordKind === 'hazard' ? composition?.hazards : composition?.tasks;
    return (Array.isArray(list) ? list : []).find(entry => entry.id === selectedId) || null;
  })());

</script>

<aside class="manager-inspector manager-environment-inspector" aria-label={text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.Label', 'Environment inspector')}>
  {#if activeTab === 'overview'}
    <EnvironmentSummaryInspector {environment} {composition} onUpdate={onUpdateEnvironment} />
  {:else if recordEntry}
    <RecordInspector
      kind={recordKind}
      {environment}
      entry={recordEntry}
      onUpdateEnvironment={onUpdateEnvironment}
    />
  {:else}
    <section class="manager-inspector-card" data-record-inspector-empty={recordKind}>
      <p class="manager-kicker">{recordKind === 'hazard'
        ? text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.NoActiveHazards', 'No active hazards')
        : text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.NoActiveTasks', 'No active tasks')}</p>
      <p class="manager-muted">{recordKind === 'hazard'
        ? text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.NoActiveHazardsHint', 'Add or include hazards in this environment so they appear here.')
        : text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.NoActiveTasksHint', 'Add or include tasks in this environment so they appear here.')}</p>
    </section>
  {/if}
</aside>
