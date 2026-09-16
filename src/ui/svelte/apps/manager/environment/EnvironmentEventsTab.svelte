<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import CompositionList from './CompositionList.svelte';

  let {
    composition = { compositionMode: 'automatic', events: [] },
    eventSelectionMode = 'allDrops',
    selectedKind = '',
    selectedId = '',
    onSelectRecord = () => {},
    onIncludeRecord = () => {},
    onForceIncludeRecord = () => {},
    onExcludeRecord = () => {},
    onRestoreRecord = () => {},
    onReorderRecord = () => {},
    onOpenSourceEvent = () => {},
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const mode = $derived(composition?.compositionMode === 'manual' ? 'manual' : 'automatic');
  const events = $derived(Array.isArray(composition?.events) ? composition.events : []);
  const activeSelectedId = $derived(selectedKind === 'event' ? selectedId : '');
</script>

<section
  class="manager-environment-tab"
  data-environment-tab="events"
  aria-label={text('FABRICATE.Admin.Manager.EnvironmentEditor.Events.Title', 'Events')}
>
  <p class="manager-environment-comp-callout" data-composition-mode={mode}>
    <i
      class={mode === 'manual' ? 'fas fa-hand-pointer' : 'fas fa-wand-magic-sparkles'}
      aria-hidden="true"
    ></i>
    <span
      >{mode === 'manual'
        ? text(
            'FABRICATE.Admin.Manager.EnvironmentEditor.Events.ManualIntro',
            'Only events you add apply here, whether or not they match this environment.'
          )
        : text(
            'FABRICATE.Admin.Manager.EnvironmentEditor.Events.AutomaticIntro',
            'All matching enabled library events apply here. Exclude any of them here, or force add a non-matching event.'
          )}</span
    >
  </p>

  <CompositionList
    kind="event"
    records={events}
    {mode}
    {eventSelectionMode}
    selectedId={activeSelectedId}
    onSelect={onSelectRecord}
    onInclude={onIncludeRecord}
    onForceInclude={onForceIncludeRecord}
    onExclude={onExcludeRecord}
    onRestore={onRestoreRecord}
    onReorder={onReorderRecord}
    onOpenSource={(_, id) => onOpenSourceEvent(id)}
  />
</section>
