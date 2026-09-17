<!-- Svelte 5 runes mode -->
<!--
  The inherit-switch row set shared by all six scoped-entity editors (issue 1362, epic 1357). ONE
  ROW PER SECTION, from `inheritableSections(entityType)`, so no screen draws a switch for a field
  the resolver does not read through; a SEEDED section renders none, and there is no group chrome.
  ON IS OVERRIDDEN — the switch means "this system sets its own", so it reads `on={!row.inherited}`,
  and the copy says "fall back", never "discard", since `setSectionInheritance` RETAINS the dormant
  override. `section` FILTERS the set; `onToggle(section, nextInherit)` reports the inherit VALUE.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import Chip from '../../../components/Chip.svelte';
  import StatusToggle from '../../../components/StatusToggle.svelte';
  import { scopedInheritRows } from './scopedStudio.js';

  let {
    entityType = 'component',
    section = '',
    headings = {},
    stateChip = true,
    inherited = {},
    notes = {},
    disabled = false,
    onToggle = () => {},
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const rows = $derived(
    scopedInheritRows({ entityType, inherited, notes, text }).filter(
      (row) => !section || row.section === section
    )
  );

  // ONE name for both positions; a state-dependent name announces the switch as two controls.
  const toggleName = $derived(
    text(
      'FABRICATE.Admin.Manager.Scoped.Inherit.ToggleLabel',
      'Override the world default for this system'
    )
  );
</script>

{#each rows as row (row.section)}
  <div class="manager-scoped-inherit-row" data-scoped-inherit-row={row.section}>
    <div class="manager-scoped-inherit-head">
      <span class="manager-scoped-inherit-label">{headings?.[row.section] || row.label}</span>
      {#if stateChip}
        <Chip
          tone={row.inherited ? 'neutral' : 'accent'}
          data-scoped-inherit-state={row.inherited ? 'inherited' : 'overridden'}
          >{row.stateLabel}</Chip
        >
      {/if}
    </div>
    {#if row.note}
      <p class="manager-scoped-inherit-note" data-scoped-inherit-note={row.section}>{row.note}</p>
    {/if}
    <!-- The sentence is the ACCESSIBLE NAME, not visible text: a compact label ellipsises it to
      `Turn ...`, and the row already shows the section, its state chip and the note. -->
    <StatusToggle
      on={!row.inherited}
      ariaLabel={toggleName}
      title={toggleName}
      {disabled}
      data-scoped-inherit-toggle={row.section}
      onclick={() => onToggle(row.section, !row.inherited)}
    />
  </div>
{/each}
