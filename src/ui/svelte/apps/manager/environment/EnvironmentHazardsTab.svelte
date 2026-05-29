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
    onExcludeRecord = () => {},
    onRestoreRecord = () => {},
    onReorderRecord = () => {},
    onSetCompositionMode = () => {},
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

<section class="manager-environment-tab" data-environment-tab="hazards" aria-label={text('FABRICATE.Admin.Manager.Environment.Hazards.Title', 'Hazards')}>
  <header class="manager-environment-comp-header">
    <div class="manager-environment-comp-header-copy">
      <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Environment.Hazards.Composition', 'Hazard composition')}</h3>
      <p class="manager-muted">{text('FABRICATE.Admin.Manager.Environment.Hazards.CompositionHint', 'Hazards trigger as part of a gathering task attempt. They match the environment at the library level; here you compose which apply.')}</p>
    </div>
    <label class="manager-environment-comp-mode-select">
      <span>{text('FABRICATE.Admin.Manager.Environment.Composition.ModeLabel', 'Composition mode')}</span>
      <select data-composition-mode-select value={mode} onchange={(event) => onSetCompositionMode(event.currentTarget.value)}>
        <option value="automatic">{text('FABRICATE.Admin.Manager.Environment.Composition.Automatic', 'Automatic')}</option>
        <option value="manual">{text('FABRICATE.Admin.Manager.Environment.Composition.Manual', 'Manual')}</option>
      </select>
    </label>
  </header>

  <p class="manager-environment-comp-callout" data-composition-mode={mode}>
    <i class={mode === 'manual' ? 'fas fa-hand-pointer' : 'fas fa-wand-magic-sparkles'} aria-hidden="true"></i>
    <span>{mode === 'manual'
      ? text('FABRICATE.Admin.Manager.Environment.Hazards.ManualIntro', 'Only hazards you explicitly include and that still match the environment apply here.')
      : text('FABRICATE.Admin.Manager.Environment.Hazards.AutomaticIntro', 'All matching enabled library hazards apply unless you exclude them here.')}</span>
  </p>

  <CompositionList
    kind="hazard"
    records={hazards}
    {mode}
    selectedId={activeSelectedId}
    onSelect={onSelectRecord}
    onInclude={onIncludeRecord}
    onExclude={onExcludeRecord}
    onRestore={onRestoreRecord}
    onReorder={onReorderRecord}
    onOpenSource={(_, id) => onOpenSourceHazard(id)}
  />
</section>
