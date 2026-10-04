<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import Callout from '../../../components/Callout.svelte';
  import CompositionList from './CompositionList.svelte';

  let {
    environment = null,
    composition = { compositionMode: 'automatic', tasks: [] },
    selectedKind = '',
    selectedId = '',
    onSelectRecord = () => {},
    onUpdate = () => {},
    onIncludeRecord = () => {},
    onForceIncludeRecord = () => {},
    onExcludeRecord = () => {},
    onRestoreRecord = () => {},
    onReorderRecord = () => {},
    onOpenSourceTask = () => {},
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const mode = $derived(composition?.compositionMode === 'manual' ? 'manual' : 'automatic');
  const tasks = $derived(Array.isArray(composition?.tasks) ? composition.tasks : []);
  const activeSelectedId = $derived(selectedKind === 'task' ? selectedId : '');
  const selectionMode = $derived(environment?.selectionMode === 'blind' ? 'blind' : 'targeted');
  const blindWeights = $derived(
    environment?.blindSelection?.weights && typeof environment.blindSelection.weights === 'object'
      ? environment.blindSelection.weights
      : {}
  );

  function setBlindWeight(taskId, weight) {
    const id = String(taskId || '').trim();
    if (!id) return;
    const current = environment?.blindSelection || {};
    const weights = {
      ...(current.weights && typeof current.weights === 'object' ? current.weights : {}),
    };
    const numeric = Number(weight);
    if (!Number.isFinite(numeric) || numeric < 0) delete weights[id];
    else weights[id] = numeric;
    onUpdate({ blindSelection: { ...current, weights } });
  }
</script>

<section
  class="manager-environment-tab fab-stack"
  data-gap="3"
  data-environment-tab="tasks"
  aria-label={text('FABRICATE.Admin.Manager.EnvironmentEditor.Tasks.Title', 'Tasks')}
>
  <!-- The tab's heading block (issue 1522): one callout documenting the composition mode. -->
  <div data-tab-heading>
    <Callout
      icon={mode === 'manual' ? 'fas fa-hand-pointer' : 'fas fa-wand-magic-sparkles'}
      text={mode === 'manual'
        ? text(
            'FABRICATE.Admin.Manager.EnvironmentEditor.Tasks.ManualIntro',
            'Only tasks you add are available to players, whether or not they match this environment.'
          )
        : text(
            'FABRICATE.Admin.Manager.EnvironmentEditor.Tasks.AutomaticIntro',
            'All matching enabled library tasks are available. Exclude any of them here, or force add a non-matching task.'
          )}
      data-composition-mode={mode}
    />
  </div>

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
    onForceInclude={onForceIncludeRecord}
    onExclude={onExcludeRecord}
    onRestore={onRestoreRecord}
    onReorder={onReorderRecord}
    onOpenSource={(_, id) => onOpenSourceTask(id)}
    {environment}
    onUpdateEnvironment={onUpdate}
  />
</section>
