<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import CompositionList from './CompositionList.svelte';

  let {
    environment = null,
    composition = { compositionMode: 'automatic', tasks: [] },
    selectedKind = '',
    selectedId = '',
    onSelectRecord = () => {},
    onUpdate = () => {},
    onIncludeRecord = () => {},
    onExcludeRecord = () => {},
    onRestoreRecord = () => {},
    onReorderRecord = () => {},
    onOpenSourceTask = () => {}
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const mode = $derived(composition?.compositionMode === 'manual' ? 'manual' : 'automatic');
  const tasks = $derived(Array.isArray(composition?.tasks) ? composition.tasks : []);
  const activeSelectedId = $derived(selectedKind === 'task' ? selectedId : '');
  const selectionMode = $derived(environment?.selectionMode === 'blind' ? 'blind' : 'targeted');
  const blindWeights = $derived(environment?.blindSelection?.weights && typeof environment.blindSelection.weights === 'object'
    ? environment.blindSelection.weights
    : {});

  function setBlindWeight(taskId, weight) {
    const id = String(taskId || '').trim();
    if (!id) return;
    const current = environment?.blindSelection || {};
    const weights = { ...(current.weights && typeof current.weights === 'object' ? current.weights : {}) };
    const numeric = Number(weight);
    if (!Number.isFinite(numeric) || numeric < 0) delete weights[id];
    else weights[id] = numeric;
    onUpdate({ blindSelection: { ...current, weights } });
  }
</script>

<section class="manager-environment-tab" data-environment-tab="tasks" aria-label={text('FABRICATE.Admin.Manager.EnvironmentEditor.Tasks.Title', 'Tasks')}>
  <p class="manager-environment-comp-callout" data-composition-mode={mode}>
    <i class={mode === 'manual' ? 'fas fa-hand-pointer' : 'fas fa-wand-magic-sparkles'} aria-hidden="true"></i>
    <span>{mode === 'manual'
      ? text('FABRICATE.Admin.Manager.EnvironmentEditor.Tasks.ManualIntro', 'Only tasks you explicitly include and that still match the environment are available to players.')
      : text('FABRICATE.Admin.Manager.EnvironmentEditor.Tasks.AutomaticIntro', 'All matching enabled library tasks are available unless you exclude them here.')}</span>
  </p>

  <CompositionList
    kind="task"
    records={tasks}
    {mode}
    {selectionMode}
    weights={blindWeights}
    onWeightChange={setBlindWeight}
    selectedId={activeSelectedId}
    onSelect={onSelectRecord}
    onInclude={onIncludeRecord}
    onExclude={onExcludeRecord}
    onRestore={onRestoreRecord}
    onReorder={onReorderRecord}
    onOpenSource={(_, id) => onOpenSourceTask(id)}
  />
</section>
