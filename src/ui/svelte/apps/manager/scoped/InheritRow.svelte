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

  ON IS OVERRIDDEN, OFF IS INHERITING (issue 1372, maintainer parity round). The switch means
  "this system sets its own", so it reads `on={!row.inherited}`. It shipped inverted — `is-on`
  while inheriting — which put it in direct contradiction with the state chip beside it and with
  every note the essence editor writes under it: `Turn on to run a different macro here.` sat
  beside a switch that was already on, and `Turn off to fall back to {name}.` beside one that was
  already off. Both design frames draw the corrected polarity — `compare-images/PROTO-essence-
  rules-editor.png` puts `Inheriting the world default` beside a grey switch and `Overridden for
  Mythwright Forge` beside a filled one, and `tmp/proto/tool-rules-editor.png` draws the tool
  editor's `Inheriting` row the same way. Nothing else changed: `onToggle` already reported the
  NEXT INHERIT value rather than the next switch position, so the write path was correct
  throughout and only the reading of it was reversed.

  THE COPY IS "FALL BACK", NOT "DISCARD". `setSectionInheritance` RETAINS the dormant local
  override when a switch goes back on, so nothing is lost and no confirmation is required. The
  note therefore states what the section WILL resolve to, never what would be thrown away. That
  reassurance lives in the NOTE — "Turn off to fall back to {name}." — rather than in the
  switch's own name, which has to say what turning it ON does.

  THE INHERIT SWITCH WAS HAND-ROLLED AND IS NOW `<StatusToggle>` (issue 1040). The debt this
  paragraph used to record — every Manager on/off control emitting `.manager-status-toggle` with
  its `-track`, `-knob` and `-label` children by hand — is paid: the primitive owns that tree and
  this row calls it. It calls it in the TRACK-ONLY form — `ariaLabel` and no `label` — which is a
  ruling of issue 1372 rather than a variation on 1040's conversion: the reading this switch used
  to render clipped to a meaningless first word in a compact switch and repeated what the row's
  own heading, state chip and note already said. There is therefore exactly ONE wording, passed once, and it
  is the accessible name; the drift the primitive exists to end is a SECOND, differently worded
  name, not the absence of a caption.

  Props:
   - entityType: `component`, `essence` or `tool`; the row set is derived from it.
   - section: render ONLY this section's row, or `''` for the whole set. It is a FILTER over
     the descriptor's sections and never a way to add one, so a caller still cannot draw a
     switch the resolver does not read through. It exists because the essence rules editor
     puts each switch inside the value card it governs — the reference draws the pair that
     way, and a GM has to see the state and the control that changes it beside the value.
   - headings: `{[section]: string}` overriding the row's head text. The default head is the
     section's own NAME, which is the right answer for a row set rendered as a group; a row
     rendered INSIDE the card that already carries that name would repeat it, so that caller
     supplies the state sentence instead.
   - stateChip: whether the head carries the Inherited / Overridden chip. Off for a caller
     whose enclosing card already states the resolution in its own pill, because two pills
     one line apart saying the same thing is the state duplication this flag avoids.
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

  // THE NAME OF THE CONTROL, WHICH IS WHAT TURNING IT ON DOES. It is one string for both
  // positions, because an accessible name that changed with the state would announce the switch
  // as two different controls; `aria-pressed`, which `StatusToggle` derives from `on`, is what
  // carries the position. The old name — "Fall back to the world default" — named the OFF
  // position, which was survivable only while the switch was wired the wrong way round.
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
    <!--
      THE SENTENCE IS THE ACCESSIBLE NAME, NOT VISIBLE TEXT, SO NO `label` IS PASSED.

      `.manager-status-toggle-label` is `overflow: hidden` with `text-overflow: ellipsis`
      inside a compact switch, so the sentence rendered as `Turn ...` — a truncation with no
      meaning at all. It was also redundant three times over: this row already shows the section
      name, a state chip reading Inherited or Overridden, and a note naming the inherited value.
      The switch needs a name, not a caption, which is exactly the `ariaLabel`-without-`label`
      form `StatusToggle` documents for its track-only sites.

      `on={!row.inherited}` — ON IS OVERRIDDEN. See the polarity paragraph in the docblock.
    -->
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
