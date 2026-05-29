<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import EnvironmentSummaryInspector from './EnvironmentSummaryInspector.svelte';
  import RecordInspector from './RecordInspector.svelte';

  let {
    environment = null,
    composition = { tasks: [], hazards: [], counts: {} },
    selectedKind = '',
    selectedId = '',
    onUpdateEnvironment = () => {},
    onOpenSourceTask = () => {},
    onOpenSourceHazard = () => {},
    onIncludeRecord = () => {},
    onExcludeRecord = () => {},
    onRestoreRecord = () => {}
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const selectedEntry = $derived((() => {
    if (!selectedKind || !selectedId) return null;
    const list = selectedKind === 'hazard' ? composition?.hazards : composition?.tasks;
    return (Array.isArray(list) ? list : []).find(entry => entry.id === selectedId) || null;
  })());

  function openSource(kind, id) {
    if (kind === 'hazard') onOpenSourceHazard(id);
    else onOpenSourceTask(id);
  }
</script>

<aside class="manager-inspector manager-environment-inspector" aria-label={text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.Label', 'Environment inspector')}>
  {#if selectedEntry}
    <RecordInspector
      kind={selectedKind}
      entry={selectedEntry}
      onOpenSource={openSource}
      onInclude={onIncludeRecord}
      onExclude={onExcludeRecord}
      onRestore={onRestoreRecord}
    />
  {:else}
    <EnvironmentSummaryInspector {environment} {composition} onUpdate={onUpdateEnvironment} />
  {/if}
</aside>
