<!--
  The Journal's run-type filter: `SearchablePopover`'s multi-select over the four kinds, with no
  query field, so the trigger holds the listbox contract. Each choice commits as it is made; a row
  draws the shared box, the kind's glyph, its name and its run count, and the footer switches every
  hidden kind back on. Props: `shownKinds` (the store's set), `runs` (every listed run, counted per
  kind before any filter) and `onToggle(kind)`, the one write the store offers.
-->
<script>
  import Button from '../../components/Button.svelte';
  import SearchablePopover from '../../components/SearchablePopover.svelte';
  import SelectionCheckbox from '../../components/SelectionCheckbox.svelte';
  import { formatList, localize } from '../../util/foundryBridge.js';
  import { RUN_KINDS, countRunsByKind } from '../../util/journalRunKinds.js';

  let { shownKinds = RUN_KINDS, runs = [], onToggle = () => {} } = $props();

  const KIND_PRESENTATION = Object.freeze({
    crafting: { icon: 'fas fa-hammer', labelKey: 'FABRICATE.App.Journal.Filters.Kind.Crafting' },
    gathering: { icon: 'fas fa-leaf', labelKey: 'FABRICATE.App.Journal.Filters.Kind.Gathering' },
    salvage: { icon: 'fas fa-recycle', labelKey: 'FABRICATE.App.Journal.Filters.Kind.Salvage' },
    alchemy: { icon: 'fas fa-flask', labelKey: 'FABRICATE.App.Journal.Filters.Kind.Alchemy' },
  });
  // A summary, not a sentence: "Crafting, Salvage" rather than "Crafting and Salvage".
  const SUMMARY_LIST = Object.freeze({ style: 'short', type: 'unit' });
  // The panel is the trigger's width at every layout, so no band narrower than the column caps it.
  const TRIGGER_WIDTH_BAND = Object.freeze({ min: 200, max: 4096 });

  const counts = $derived(countRunsByKind(runs));
  const options = $derived(
    RUN_KINDS.map((kind) => ({
      id: kind,
      label: localize(KIND_PRESENTATION[kind].labelKey),
      icon: KIND_PRESENTATION[kind].icon,
      data: { 'data-journal-kind-option': kind },
    }))
  );
  const shown = $derived(RUN_KINDS.filter((kind) => shownKinds.includes(kind)));
  const summary = $derived.by(() => {
    if (shown.length === RUN_KINDS.length)
      return localize('FABRICATE.App.Journal.Filters.Kind.All');
    if (shown.length === 0) return localize('FABRICATE.App.Journal.Filters.Kind.None');
    return formatList(
      options.filter((option) => shown.includes(option.id)).map((option) => option.label),
      SUMMARY_LIST
    );
  });
  const filterLabel = $derived(localize('FABRICATE.App.Journal.Filters.Kind.Label'));

  function showAll() {
    for (const kind of RUN_KINDS) if (!shown.includes(kind)) onToggle(kind);
  }
</script>

{#snippet kindRow(option)}
  <SelectionCheckbox decorative density="compact" checked={shown.includes(option.id)} />
  <i class={`journal-kind-glyph ${option.icon}`} aria-hidden="true"></i>
  <span class="journal-kind-name">{option.label}</span>
  <span class="journal-kind-count" data-journal-kind-count={option.id}>{counts[option.id]}</span>
{/snippet}

{#snippet showAllFooter()}
  <div class="journal-kind-footer">
    <Button role="ghost" fullWidth data-journal-kind-show-all="" onclick={showAll}>
      <i class="fas fa-xmark" aria-hidden="true"></i>
      {localize('FABRICATE.App.Journal.Filters.Kind.ShowAll')}
    </Button>
  </div>
{/snippet}

<div
  class="journal-kind-field"
  data-journal-kind-filter=""
  data-journal-kind-shown={shown.join(' ')}
>
  <SearchablePopover
    multiple
    showSearch={false}
    triggerHasPopup="listbox"
    {options}
    value={shown}
    pickerClass="fabricate-select journal-kind-picker"
    triggerClass="fabricate-select-trigger fabricate-select-trigger-inline"
    valueClass="fabricate-select-value"
    triggerIcon="fas fa-layer-group"
    triggerLabel={summary}
    triggerProps={{ 'data-journal-kind-trigger': '' }}
    ariaLabel={localize('FABRICATE.App.Journal.Filters.Kind.Name', {
      label: filterLabel,
      summary,
    })}
    panelLabel={filterLabel}
    popoverClass="journal-kind-popover"
    optionClass="journal-kind-option"
    minWidth={TRIGGER_WIDTH_BAND.min}
    maxWidth={TRIGGER_WIDTH_BAND.max}
    option={kindRow}
    footer={showAllFooter}
    onSelect={onToggle}
  />
</div>

<style>
  .journal-kind-field {
    display: grid;
    min-width: 0;
  }
  .journal-kind-field :global(.fabricate-select-trigger) {
    width: 100%;
  }
  .journal-kind-glyph {
    flex: none;
    width: 14px;
    color: var(--fab-text-muted);
    font-size: 11px;
    text-align: center;
  }
  .journal-kind-name {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    font-size: 12px;
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .journal-kind-count {
    flex: none;
    color: var(--fab-text-subtle);
    font-family: var(--fab-font-mono);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }
  .journal-kind-footer {
    padding-top: var(--fab-space-1);
    border-top: 1px solid var(--fab-border);
  }
</style>
