<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import CompositionList from './CompositionList.svelte';

  let {
    composition = { compositionMode: 'automatic', tasks: [] },
    selectedKind = '',
    selectedId = '',
    onSelectRecord = () => {},
    onIncludeRecord = () => {},
    onExcludeRecord = () => {},
    onRestoreRecord = () => {},
    onReorderRecord = () => {},
    onSetCompositionMode = () => {},
    onOpenSourceTask = () => {}
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const mode = $derived(composition?.compositionMode === 'manual' ? 'manual' : 'automatic');
  const tasks = $derived(Array.isArray(composition?.tasks) ? composition.tasks : []);
  const activeSelectedId = $derived(selectedKind === 'task' ? selectedId : '');
</script>

<section class="manager-environment-tab" data-environment-tab="tasks" aria-label={text('FABRICATE.Admin.Manager.EnvironmentEditor.Tasks.Title', 'Tasks')}>
  <header class="manager-environment-comp-header">
    <div class="manager-environment-comp-header-copy">
      <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.EnvironmentEditor.Tasks.Composition', 'Task composition')}</h3>
      <p class="manager-muted">{text('FABRICATE.Admin.Manager.EnvironmentEditor.Tasks.CompositionHint', 'Determine which gathering tasks are available in this environment and how they behave at runtime.')}</p>
    </div>
    <label class="manager-environment-comp-mode-select">
      <span>{text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.ModeLabel', 'Composition mode')}</span>
      <select data-composition-mode-select value={mode} onchange={(event) => onSetCompositionMode(event.currentTarget.value)}>
        <option value="automatic">{text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.Automatic', 'Automatic')}</option>
        <option value="manual">{text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.Manual', 'Manual')}</option>
      </select>
    </label>
  </header>

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
    selectedId={activeSelectedId}
    onSelect={onSelectRecord}
    onInclude={onIncludeRecord}
    onExclude={onExcludeRecord}
    onRestore={onRestoreRecord}
    onReorder={onReorderRecord}
    onOpenSource={(_, id) => onOpenSourceTask(id)}
  />
</section>
