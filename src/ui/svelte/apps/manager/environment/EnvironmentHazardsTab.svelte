<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import CompositionList from './CompositionList.svelte';

  let {
    composition = { compositionMode: 'automatic', hazards: [] },
    selectedKind = '',
    selectedId = '',
    onSelectRecord = () => {},
    onIncludeRecord = () => {},
    onForceIncludeRecord = () => {},
    onExcludeRecord = () => {},
    onRestoreRecord = () => {},
    onReorderRecord = () => {},
    onOpenSourceHazard = () => {}
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const mode = $derived(composition?.compositionMode === 'manual' ? 'manual' : 'automatic');
  const hazards = $derived(Array.isArray(composition?.hazards) ? composition.hazards : []);
  const activeSelectedId = $derived(selectedKind === 'hazard' ? selectedId : '');
</script>

<section class="manager-environment-tab" data-environment-tab="hazards" aria-label={text('FABRICATE.Admin.Manager.EnvironmentEditor.Hazards.Title', 'Hazards')}>
  <p class="manager-environment-comp-callout" data-composition-mode={mode}>
    <i class={mode === 'manual' ? 'fas fa-hand-pointer' : 'fas fa-wand-magic-sparkles'} aria-hidden="true"></i>
    <span>{mode === 'manual'
      ? text('FABRICATE.Admin.Manager.EnvironmentEditor.Hazards.ManualIntro', 'Only hazards you explicitly include apply here. You can also force add non-matching hazards from the Non-matching list.')
      : text('FABRICATE.Admin.Manager.EnvironmentEditor.Hazards.AutomaticIntro', 'All matching enabled library hazards apply unless you exclude them here.')}</span>
  </p>

  <CompositionList
    kind="hazard"
    records={hazards}
    {mode}
    selectedId={activeSelectedId}
    onSelect={onSelectRecord}
    onInclude={onIncludeRecord}
    onForceInclude={onForceIncludeRecord}
    onExclude={onExcludeRecord}
    onRestore={onRestoreRecord}
    onReorder={onReorderRecord}
    onOpenSource={(_, id) => onOpenSourceHazard(id)}
  />
</section>
