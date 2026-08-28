<!-- Svelte 5 runes mode -->
<!--
  The inherit-switch row set shared by all six scoped-entity editors (issue 1362, epic 1357).

  ONE ROW PER SECTION, READ FROM THE SCOPE DESCRIPTOR. The set comes from
  `inheritableSections(entityType)`, so a component draws exactly ONE row (`category`), an
  essence two and a tool two. A screen cannot draw a switch for a field the resolver does not
  read through, which is what stops an editor writing a key `normalizeMembership` discards.

  A SEEDED SECTION RENDERS NONE. A tool's `repairRequirements` is copied once and then
  diverges freely; there is no live parent to fall back to, so a switch over it would be a
  claim the resolver does not honour.

  NO GROUP CHROME. No header, no divider, no empty state. A one-section entity would otherwise
  get a heading, a rule and a caption wrapped around a single control — chrome that costs more
  vertical space than the thing it frames, and says nothing the row does not.

  THE COPY IS "FALL BACK", NOT "DISCARD". `setSectionInheritance` RETAINS the dormant local
  override when a switch goes back on, so nothing is lost and no confirmation is required. The
  note therefore states what the section WILL resolve to, never what would be thrown away.

  Props:
   - entityType: `component`, `essence` or `tool`; the row set is derived from it.
   - inherited: the membership record's `inherit` map. An ABSENT key reads as inheriting,
     matching `isSectionInherited`.
   - notes: `{ [section]: string }`, the one-line summary of the inherited value. The calling
     editor supplies it: this component never reads a section value, because section values
     are opaque everywhere else in this model too.
   - disabled: while the editor is saving.
   - onToggle(section, nextInherit): the switch. `nextInherit` is a boolean, never a toggle
     of unknown current state, so a stale render cannot invert the write.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import Chip from '../Chip.svelte';
  import { scopedInheritRows } from './scopedStudio.js';

  let {
    entityType = 'component',
    inherited = {},
    notes = {},
    disabled = false,
    onToggle = () => {},
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const rows = $derived(scopedInheritRows({ entityType, inherited, notes, text }));
</script>

{#each rows as row (row.section)}
  <div class="manager-scoped-inherit-row" data-scoped-inherit-row={row.section}>
    <div class="manager-scoped-inherit-head">
      <span class="manager-scoped-inherit-label">{row.label}</span>
      <Chip
        tone={row.inherited ? 'neutral' : 'accent'}
        data-scoped-inherit-state={row.inherited ? 'inherited' : 'overridden'}
        >{row.stateLabel}</Chip
      >
    </div>
    {#if row.note}
      <p class="manager-scoped-inherit-note" data-scoped-inherit-note={row.section}>{row.note}</p>
    {/if}
    <button
      type="button"
      class={`manager-status-toggle ${row.inherited ? 'is-on' : 'is-off'}`}
      data-scoped-inherit-toggle={row.section}
      aria-pressed={row.inherited}
      {disabled}
      onclick={() => onToggle(row.section, !row.inherited)}
    >
      <span class="manager-status-toggle-track" aria-hidden="true"
        ><span class="manager-status-toggle-knob"></span></span
      >
      <span class="manager-status-toggle-label"
        >{text(
          'FABRICATE.Admin.Manager.Scoped.Inherit.ToggleLabel',
          'Fall back to the world default'
        )}</span
      >
    </button>
  </div>
{/each}
